import fp from 'fastify-plugin'
import { createHash } from 'node:crypto'
import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { discord } from '../index'
import { configuration } from '../../configuration'
import { collections } from '../../database/collections'
import { players } from '../../players'
import { events } from '../../events'
import { safe } from '../../utils/safe'
import { logger } from '../../logger'

async function registerLinkCommand() {
  const client = discord.client
  if (!client?.isReady()) {
    return
  }

  const guildConfigs = (await configuration.get('discord.guilds')).filter(
    ({ voiceServer }) => voiceServer !== undefined,
  )
  if (guildConfigs.length !== 1) {
    return
  }

  const guild = await client.guilds.fetch(guildConfigs[0]!.id)
  const command = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Steam account to your Discord account')
    .addStringOption(option =>
      option
        .setName('code')
        .setDescription('The one-time code from the tf2pickup website')
        .setRequired(true)
        .setMinLength(24)
        .setMaxLength(24),
    )

  const commands = await guild.commands.fetch()
  if (!commands.some(({ name }) => name === 'link')) {
    await guild.commands.create(command)
  }
}

async function linkAccount(interaction: ChatInputCommandInteraction) {
  const guildConfigs = (await configuration.get('discord.guilds')).filter(
    ({ voiceServer }) => voiceServer !== undefined,
  )
  if (guildConfigs.length !== 1 || guildConfigs[0]!.id !== interaction.guildId) {
    await interaction.reply({
      content: 'Use this command in the Discord server configured for tf2pickup voice channels.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const code = interaction.options.getString('code', true).trim().toUpperCase()
  const codeHash = createHash('sha256').update(code).digest('hex')
  const player = await collections.players.findOne({
    'discordLinkCode.hash': codeHash,
    'discordLinkCode.expiresAt': { $gt: new Date() },
  })

  if (!player) {
    await interaction.reply({
      content:
        'That linking code is invalid or has expired. Generate a new one on the tf2pickup website.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const existingLink = await collections.players.findOne(
    { 'discordLink.userId': interaction.user.id },
    { projection: { steamId: 1 } },
  )
  if (existingLink) {
    await interaction.reply({
      content:
        existingLink.steamId === player.steamId
          ? 'This Discord account is already linked to your Steam account.'
          : 'This Discord account is already linked to another Steam account. Unlink it there first.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    const linked = await players.linkDiscordAccount(player.steamId, codeHash, interaction.user.id)
    if (!linked) {
      await interaction.reply({
        content:
          'That linking code was already used or has expired. Generate a new one on the tf2pickup website.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      await interaction.reply({
        content: 'This Discord account is already linked to another Steam account.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }
    throw error
  }

  await interaction.reply({
    content:
      'Your Discord account has been linked successfully. You can now join your match voice channel.',
    flags: MessageFlags.Ephemeral,
  })
  logger.info(
    { steamId: player.steamId, discordUserId: interaction.user.id },
    'Discord account linked',
  )
}

export default fp(
  async () => {
    const client = discord.client
    if (!client) {
      return
    }

    client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'link') {
        return
      }

      try {
        await linkAccount(interaction)
      } catch (error) {
        logger.error(error, 'failed to link Discord account')
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              'The account could not be linked due to an internal error. Please try again later.',
            flags: MessageFlags.Ephemeral,
          })
        } else {
          await interaction.reply({
            content:
              'The account could not be linked due to an internal error. Please try again later.',
            flags: MessageFlags.Ephemeral,
          })
        }
      }
    })

    events.on(
      'configuration:updated',
      safe(async ({ key }) => {
        if (key === 'discord.guilds') {
          await registerLinkCommand()
        }
      }),
    )

    try {
      await registerLinkCommand()
    } catch (error) {
      logger.error(error, 'failed to register Discord /link command')
    }
  },
  { name: 'discord account linking' },
)
