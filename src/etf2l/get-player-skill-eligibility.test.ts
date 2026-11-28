import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlayerSkillEligibility } from './get-player-skill-eligibility'

vi.mock('../environment', () => ({
  environment: { ETF2L_API_ENDPOINT: 'https://api.etf2l.org' },
}))

function response(divisions: string[], competitionIds?: number[]) {
  return new Response(
    JSON.stringify({
      results: {
        data: divisions.map((division, index) => ({
          id: index + 1,
          competition: { id: competitionIds?.[index] ?? 53 },
          division,
        })),
        last_page: 1,
      },
    }),
    { status: 200 },
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('getPlayerSkillEligibility', () => {
  it('unlocks level 5 after three Premiership matches in one competition', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(['Premiership', 'Premiership', 'Premiership'])),
    )
    await expect(getPlayerSkillEligibility(123)).resolves.toEqual({
      maxLevel: 5,
      highestDivision: 'Premiership',
      qualifyingMatches: 3,
    })
  })

  it('unlocks level 4 after three Division 1 matches in one competition', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(['Division 1', 'Division 1', 'Division 1'])),
    )
    await expect(getPlayerSkillEligibility(123)).resolves.toEqual({
      maxLevel: 4,
      highestDivision: 'Division 1',
      qualifyingMatches: 3,
    })
  })

  it('does not unlock higher levels with fewer than three qualifying matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(['Division 2', 'Division 2'])))
    await expect(getPlayerSkillEligibility(123)).resolves.toEqual({
      maxLevel: 3,
      qualifyingMatches: 0,
    })
  })

  it('does not combine matches from different divisions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(['Division 1', 'Division 2', 'Division 2'])),
    )
    await expect(getPlayerSkillEligibility(123)).resolves.toEqual({
      maxLevel: 3,
      qualifyingMatches: 0,
    })
  })


  it('does not combine matches from different competitions', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(['Division 1', 'Division 1', 'Division 1'], [53, 53, 54]),
        ),
    )
    await expect(getPlayerSkillEligibility(123)).resolves.toEqual({
      maxLevel: 3,
      qualifyingMatches: 0,
    })
  })

  it.each(['High', 'Division 2a'])('recognizes the legacy/current high tier name %s', async division => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([division, division, division])))
    await expect(getPlayerSkillEligibility(123)).resolves.toEqual({
      maxLevel: 4,
      highestDivision: division,
      qualifyingMatches: 3,
    })
  })

  it('uses the player ID and only requests completed 6v6 matches', async () => {
    const fetch = vi.fn().mockResolvedValue(response([]))
    vi.stubGlobal('fetch', fetch)
    await getPlayerSkillEligibility(82350)
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.searchParams.get('players[]')).toBe('82350')
    expect(url.searchParams.get('team_type')).toBe('6on6')
    expect(url.searchParams.get('scheduled')).toBe('0')
  })
})
