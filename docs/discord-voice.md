# Discord match voice

The Discord voice provider creates two private voice channels per match inside a shared category.
The configured lobby remains permanent.

## Discord server setup

1. Create a category named **TF2 MATCHES**.
2. Create a voice channel named **LOBBY** inside that category.
3. Make sure the bot is installed in the server with the `bot` and `applications.commands` scopes.
4. Grant the bot these permissions:
   - **Server:** View Channel, Connect, Manage Channels, Manage Roles, Manage Nicknames, and Move Members.
   - **TF2 MATCHES category:** View Channel.
   - **LOBBY channel:** View Channel, Connect, and Move Members.
5. Place the bot's highest role above ordinary player roles so it can manage their nicknames. Discord does not allow the bot to change the nickname of the server owner or members with an equal or higher role. Do not grant Administrator. The bot manages each match channel's complete permission-overwrite list: it denies View Channel, Connect, Manage Channels, and Move Members to @everyone, removes any role-specific grants, and adds member-specific access only for assigned players and the bot. Discord administrators retain their administrator override. Keep server-level **Manage Roles** limited to trusted moderators: Discord requires it to edit channel permission overwrites, and it cannot be revoked with a channel overwrite.

## tf2pickup configuration

1. Open **Admin → Discord** and enable the server.
2. In that server's settings, select the **TF2 MATCHES** category and its **LOBBY** voice channel, then save.
3. Open **Admin → Voice Server** and select **Discord**.

Only one Discord server may be configured as the match voice server. The category and lobby cannot be changed, and the provider cannot be switched away from Discord, while Discord match channels are still active.

## Player account linking

Each player must sign in to tf2pickup through Steam and open **Settings → Integrations → Discord**.

1. Join the Discord server using the invite link shown in **Settings → Integrations → Discord**.
2. Generate a one-time code on the website.
3. In the configured Discord server, run `/link` and provide the code in its `code` field.
4. The code expires after ten minutes and can only be used once.

The website stores only a SHA-256 hash of the pending code. A Discord account can be linked to only one Steam account, and a Steam account can have only one linked Discord account.

## Match lifecycle

- When a game is created, the bot creates or reuses `<game number>-BLU` and `<game number>-RED` under **TF2 MATCHES**.
- Each channel's permission-overwrite list is rebuilt from scratch: @everyone is denied View Channel, Connect, Move Members, and Manage Channels; old role-specific grants are removed; currently assigned, linked players receive member-specific View Channel and Connect allows; and the bot receives the required member-specific permissions. Server administrators retain Discord's administrator override.
- When the match starts, players already in **LOBBY** are moved to their team channel.
- Players joining **LOBBY** during a started match are moved automatically.
- Roster changes and substitutions update the channel overwrites and synchronize linked players' server nicknames to their tf2pickup display name (subject to Discord's 32-character nickname limit). The bot saves each player's previous server nickname and restores it when they leave the match or the match ends. Players removed from a team lose access immediately and are returned to **LOBBY**.
- When the game ends, players are returned to **LOBBY** and the two match channels are deleted. **LOBBY** is never deleted.
- On application startup, active games are reconciled and leftover channels for ended or interrupted games are cleaned up.
- Temporary Discord API failures during channel creation, roster synchronization, or cleanup are retried automatically.
- If the permanent LOBBY channel is deleted or renamed, the bot restores its name or recreates it in TF2 MATCHES using the category's permission overwrites (plus the bot's required access), then updates the stored channel ID in configuration and game mappings.
