import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'node-html-parser'
import { configuration } from '../../../configuration'
import { players } from '../../../players'
import { isVerificationEnabled } from '../../../mumble/is-verification-enabled'
import { GameState, type GameNumber } from '../../../database/models/game.model'
import {
  PlayerConnectionStatus,
  SlotStatus,
} from '../../../database/models/game-slot.model'
import type { GameSlotId } from '../../../shared/types/game-slot-id'
import { Tf2ClassName } from '../../../shared/types/tf2-class-name'
import { Tf2Team } from '../../../shared/types/tf2-team'
import type { SteamId64 } from '../../../shared/types/steam-id-64'
import { VoiceServerType } from '../../../shared/types/voice-server-type'
import { JoinVoiceButton } from './join-voice-button'

vi.mock('../../../configuration', () => ({
  configuration: { get: vi.fn() },
}))

vi.mock('../../../players', () => ({
  players: { bySteamId: vi.fn() },
}))

vi.mock('../../../mumble/is-verification-enabled', () => ({
  isVerificationEnabled: vi.fn(),
}))

const steamId = '76561198000000001' as SteamId64
const discordUrl = 'https://discord.com/channels/100/200'

const game = {
  number: 42 as GameNumber,
  state: GameState.started,
  slots: [
    {
      id: 'red-soldier-0' as GameSlotId,
      player: steamId,
      team: Tf2Team.red,
      gameClass: Tf2ClassName.soldier,
      status: SlotStatus.active,
      connectionStatus: PlayerConnectionStatus.connected,
      voiceServerUrl: discordUrl,
    },
  ],
}

describe('JoinVoiceButton', () => {
  beforeEach(() => {
    vi.mocked(configuration.get).mockResolvedValue(VoiceServerType.discord)
    vi.mocked(players.bySteamId).mockResolvedValue({
      mumbleCertificate: undefined,
      discordLink: undefined,
    } as Awaited<ReturnType<typeof players.bySteamId>>)
    vi.mocked(isVerificationEnabled).mockResolvedValue(false)
  })

  it('asks an unlinked Discord player to link their account', async () => {
    const html = await JoinVoiceButton({ game, actor: steamId })
    const root = parse(html)

    expect(root.querySelector('a[href="/discord/link"]')?.text).toContain('link Discord')
    expect(root.querySelector('a[href="https://discord.com/channels/100/200"]')).toBeNull()
  })

  it('shows the Discord channel link after the player has linked Discord', async () => {
    vi.mocked(players.bySteamId).mockResolvedValue({
      mumbleCertificate: undefined,
      discordLink: { userId: '123456789012345678', linkedAt: new Date() },
    } as Awaited<ReturnType<typeof players.bySteamId>>)

    const html = await JoinVoiceButton({ game, actor: steamId })
    const root = parse(html)

    expect(root.querySelector('a[href="https://discord.com/channels/100/200"]')?.text).toContain(
      'join voice',
    )
    expect(root.querySelector('a[href="/discord/link"]')).toBeNull()
  })

  it('shows the Mumble verification hint only when Mumble verification is enabled', async () => {
    vi.mocked(configuration.get).mockResolvedValue(VoiceServerType.mumble)
    vi.mocked(isVerificationEnabled).mockResolvedValue(true)

    const mumbleGame = {
      ...game,
      slots: game.slots.map(slot => ({
        ...slot,
        voiceServerUrl: 'mumble://voice.example.test:64738',
      })),
    }
    const html = await JoinVoiceButton({ game: mumbleGame, actor: steamId })
    const root = parse(html)

    expect(root.querySelector('a[href="mumble://voice.example.test:64738"]')).not.toBeNull()
    expect(root.querySelector('a[href="/mumble"]')?.text).toContain('Mumble not verified')
  })

  it('does not show a join action to a player who is not assigned to the game', async () => {
    const html = await JoinVoiceButton({ game, actor: '76561198000000002' as SteamId64 })
    const root = parse(html)

    expect(root.querySelector('a')).toBeNull()
    expect(players.bySteamId).not.toHaveBeenCalled()
  })

  it('does not show a join action to anonymous visitors', async () => {
    const html = await JoinVoiceButton({ game, actor: undefined })
    const root = parse(html)

    expect(root.querySelector('a')).toBeNull()
    expect(players.bySteamId).not.toHaveBeenCalled()
  })
})
