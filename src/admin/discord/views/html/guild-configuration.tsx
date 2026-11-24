import { ChannelType, TextChannel, type Guild } from 'discord.js'
import { SaveButton } from '../../../views/html/save-button'
import { configuration } from '../../../../configuration'

export async function GuildConfiguration(props: { guild: Guild; enabled: boolean }) {
  if (!props.enabled) {
    return <></>
  }

  const config = (await configuration.get('discord.guilds')).find(({ id }) => id === props.guild.id)

  return (
    <form action={`/admin/discord/${props.guild.id}`} method="post" class="flex flex-col gap-2">
      <div class="flex flex-row gap-2">
        <label for={`${props.guild.id}-admin-notifications-channel`}>
          Admin notifications channel:
        </label>
        <SelectTextChannel
          guild={props.guild}
          id={`${props.guild.id}-admin-notifications-channel`}
          name="adminNotificationsChannel"
          current={config?.adminNotifications?.channel}
        />
      </div>

      <div class="flex flex-row gap-2">
        <label for={`${props.guild.id}-substitute-notifications-channel`}>
          Substitute notifications channel:
        </label>
        <SelectTextChannel
          guild={props.guild}
          id={`${props.guild.id}-substitute-notifications-channel`}
          name="substituteNotificationsChannel"
          current={config?.substituteNotifications?.channel}
        />
        <label for={`${props.guild.id}-substitute-notifications-mention-role`}>mention role:</label>
        <SelectRole
          guild={props.guild}
          id={`${props.guild.id}-substitute-notifications-mention-role`}
          name="substituteNotificationsMentionRole"
          current={config?.substituteNotifications?.role}
        />
      </div>

      <div class="mt-4 border-t border-zinc-700 pt-4">
        <h4 class="mb-2 font-medium">Game voice channels</h4>
        <p class="description mb-2">
          Select the category for private match channels and the shared voice lobby. The bot creates
          one BLU and one RED channel for each game inside this category. The bot needs View
          Channel, Connect, Manage Channels, Manage Roles, and Move Members in the server; View
          Channel in TF2 MATCHES; and View Channel, Connect, and Move Members in LOBBY. Ordinary
          roles are denied View Channel, Connect, Move Members, and Manage Channels in match rooms.
          The bot receives those channel permissions directly. Keep Manage Roles limited to trusted
          moderators: Discord grants it server-wide, so those members can edit permission
          overwrites.
        </p>
        <div class="flex flex-row flex-wrap gap-2">
          <label for={`${props.guild.id}-voice-category`}>Category (TF2 MATCHES):</label>
          <SelectCategory
            guild={props.guild}
            id={`${props.guild.id}-voice-category`}
            name="voiceServerCategoryId"
            current={config?.voiceServer?.categoryId}
          />
          <label for={`${props.guild.id}-voice-lobby`}>Lobby (LOBBY):</label>
          <SelectVoiceChannel
            guild={props.guild}
            id={`${props.guild.id}-voice-lobby`}
            name="voiceServerLobbyChannelId"
            current={config?.voiceServer?.lobbyChannelId}
          />
        </div>
      </div>

      <div class="flex flex-row gap-2">
        <label for={`${props.guild.id}-queue-prompts-channel`}>Queue prompts channel:</label>
        <SelectTextChannel
          guild={props.guild}
          id={`${props.guild.id}-queue-prompts-channel`}
          name="queuePromptsChannel"
          current={config?.queuePrompts?.channel}
        />
      </div>

      <p>
        <SaveButton hx-disabled-elt="this" />
      </p>
    </form>
  )
}

function SelectTextChannel(
  props: { guild: Guild; current: string | undefined } & JSX.HtmlSelectTag,
) {
  const { guild, current, ...rest } = props
  const textChannels = Array.from(
    guild.channels.cache.filter(channel => channel instanceof TextChannel).values(),
  ).reduce<Map<string, TextChannel[]>>((prev, curr) => {
    const parentName = curr.parent?.name ?? 'No category'
    if (!prev.has(parentName)) {
      prev.set(parentName, [])
    }

    prev.get(parentName)!.push(curr)
    return prev
  }, new Map<string, TextChannel[]>())

  textChannels.forEach(value => value.sort((a, b) => a.position - b.position))

  return (
    <select {...rest}>
      <option value="">disabled</option>

      {Array.from(textChannels, ([parent, channels]) => (
        <optgroup label={parent}>
          {channels.map(({ id, name }) => (
            <option value={id} selected={current === id} safe>
              {name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function SelectRole(props: { guild: Guild; current: string | undefined } & JSX.HtmlSelectTag) {
  const { guild, current, ...rest } = props
  const roles = Array.from(guild.roles.cache.values()).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )

  return (
    <select {...rest}>
      <option value="">disabled</option>

      {roles.map(({ name, id }) => (
        <option value={id} selected={current === id} safe>
          {name}
        </option>
      ))}
    </select>
  )
}

function SelectCategory(props: { guild: Guild; current: string | undefined } & JSX.HtmlSelectTag) {
  const { guild, current, ...rest } = props
  const categories = guild.channels.cache.filter(
    channel => channel.type === ChannelType.GuildCategory,
  )

  return (
    <select {...rest}>
      <option value="">disabled</option>
      {categories.map(({ id, name }) => (
        <option value={id} selected={current === id} safe>
          {name}
        </option>
      ))}
    </select>
  )
}

function SelectVoiceChannel(
  props: { guild: Guild; current: string | undefined } & JSX.HtmlSelectTag,
) {
  const { guild, current, ...rest } = props
  const channels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildVoice)

  return (
    <select {...rest}>
      <option value="">disabled</option>
      {channels.map(({ id, name, parent }) => (
        <option value={id} selected={current === id} safe>
          {parent?.name ? `${parent.name} / ${name}` : name}
        </option>
      ))}
    </select>
  )
}
