import { z } from 'zod'
import { environment } from '../environment'
import { Etf2lApiError } from './errors/etf2l-api.error'

const matchSchema = z
  .object({
    competition: z.object({ id: z.number() }).passthrough(),
    division: z
      .union([z.string(), z.object({ name: z.string() }).passthrough()])
      .nullable()
      .optional(),
  })
  .passthrough()

const matchesResponseSchema = z.object({
  results: z
    .object({
      data: z.array(matchSchema),
      last_page: z.number().int().positive(),
    })
    .passthrough(),
})

export interface Etf2lSkillEligibility {
  maxLevel: 3 | 4 | 5
  highestDivision?: string
  qualifyingMatches: number
}

const pagesToCheck = 3
const matchesPerPage = 100
const minimumMatches = 3

/**
 * Checks completed ETF2L 6v6 matches. Three matches in the same competition
 * and division are required before that division can unlock a higher self-selected skill.
 * Only the newest 300 matches are inspected to keep API usage bounded.
 */
export async function getPlayerSkillEligibility(playerId: number): Promise<Etf2lSkillEligibility> {
  const matches: z.infer<typeof matchSchema>[] = []
  let lastPage = 1

  for (let page = 1; page <= Math.min(lastPage, pagesToCheck); page++) {
    const params = new URLSearchParams({
      players: String(playerId),
      team_type: '6on6',
      scheduled: '0',
      limit: String(matchesPerPage),
      page: String(page),
    })
    const url = environment.ETF2L_API_ENDPOINT + '/matches?' + params.toString()
    const response = await fetch(url)
    if (!response.ok) {
      throw new Etf2lApiError(url, response, response.status + ' ' + response.statusText)
    }

    const data = await matchesResponseSchema.parseAsync(await response.json())
    matches.push(...data.results.data)
    lastPage = data.results.last_page
  }

  const counts = new Map<string, { division: string; count: number }>()
  for (const match of matches) {
    const division =
      typeof match.division === 'string' ? match.division : (match.division?.name ?? '')
    if (!division) continue

    const key = match.competition.id + ':' + division.toLowerCase()
    const current = counts.get(key)
    counts.set(key, { division, count: (current?.count ?? 0) + 1 })
  }

  const qualifying = [...counts.values()].filter(item => item.count >= minimumMatches)
  const premiership = qualifying
    .filter(item => /^premiership$/i.test(item.division))
    .sort((a, b) => b.count - a.count)[0]

  if (premiership) {
    return {
      maxLevel: 5,
      highestDivision: premiership.division,
      qualifyingMatches: premiership.count,
    }
  }

  const high = qualifying
    .filter(item => /^(high|division\s*[12][a-z]?)$/i.test(item.division.trim()))
    .sort((a, b) => b.count - a.count)[0]

  if (high) {
    return {
      maxLevel: 4,
      highestDivision: high.division,
      qualifyingMatches: high.count,
    }
  }

  return { maxLevel: 3, qualifyingMatches: 0 }
}
