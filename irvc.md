# IRVC — Design

A WebRTC-powered text and voice chat. Private, self-hosted, personal server.

## Goal

Small, private chat + voice for 4–6 people on one VPS. No data gathering, full ownership.

## Scope (MVP)

**In:**
- Server-side accounts, invite-only.
- Text channels and 1-on-1 DMs with persisted history (IRC-like), GFM markdown, multiline compose, mentions, message editing and deletion.
- Image attachments (raster only), stored on disk.
- Voice channels, ephemeral (not recorded), with mute, deafen, per-peer volume, mic processing, a level-based noise gate, and a join/leave tone.
- Screen sharing into a voice channel, with tab/system audio, simulcast, and a 720p/1080p quality choice.
- Presence: online/offline, plus who is in each voice channel without joining.
- Client themes, font size, per-user voice settings.
- One server per deployment, seeded with one text and one voice channel.

**Out (now):**
- Large scale, multi-node, clustering.
- Recording, video.
- Message search, channel CRUD.
- Email, OAuth, passkeys.
- Backups.
- Password reset via email (admin resets manually).

## Architecture

One VPS, three processes:

- **LiveKit** — self-hosted, voice and screen share. Own ports: signal `7880`, TCP `7881`, media `50000-60000/udp`. Media ports exposed raw, not proxied.
- **Gin server (Go)** — API, auth, invite/session handling, LiveKit token minting, text chat and presence over WebSocket, media upload/serve, SQLite.
- **Caddy** — TLS + reverse proxy for frontend and API. Terminates TLS; proxies `wss` to LiveKit signal.

Split:
- Text → our WebSocket + SQLite. LiveKit not involved.
- Voice → LiveKit. Ephemeral. The Go server mints tokens but never dials LiveKit.
- Presence → our WebSocket (connected = online; voice occupancy broadcast to all).
- Media → disk under the media dir, served by Go.

## Auth & Identity

- Invite links: single-use, 14-day expiry. Anyone with a link creates a user and joins.
- Revoke = delete the row.
- Passwords hashed with argon2id.
- Login → session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`), 30-day TTL, server-side session row. Cookie value is HMAC-signed.
- Server mints a short-lived LiveKit token when a voice channel is joined.
- Rate limit login and invite-claim endpoints (per IP).
- No email. Admin resets passwords by hand.

## Data (SQLite)

WAL mode, `busy_timeout`. One file, the only state; uploaded media lives in the media dir.

```
users    (id, username, pass_hash, created_at)
invites  (token, created_by, expires_at, used_by, used_at)
sessions (id, user_id, expires_at)
channels (id, type, name, position, created_at)   -- type: text | voice | dm
messages (id, channel_id, user_id, body, created_at, edited_at)
reactions (message_id, user_id, reaction)
read_state (user_id, channel_id, last_read_message_id, updated_at)
```

- Messages are returned joined with their author's username.
- Seed: one text channel `#general`, one voice channel `general`.
- DMs: `type = 'dm'` channels with canonical name `u:<min_id>:<max_id>`, resolved to the peer's username for each participant.
- Uploaded images: random names, raster only (no SVG/HTML), served with `nosniff`.

## Behavior

- **Channels:** seeded (`#general` text, `general` voice) plus on-demand 1-on-1 DMs opened by clicking a user. Ordered by `position`. Public channel CRUD is out of scope.
- **Text:** GFM markdown; single newlines are hard breaks. Messages persist; live append over WS. Rendered as timestamp, author, content.
- **Mentions:** `@username` highlights the message for that user; typing `@` opens an autocomplete.
- **Unread:** `read_state` stores each user's last-read message per channel; `/channels` returns the count of newer messages by others. Opening a channel marks it read, so the count survives reload and is shared across devices.
- **Commands:** `/me <action>` renders an emote as `* user action`; `/collapse` hides images in the current channel; `/gif [query]` opens a picker with the top Giphy results (trending when no query) to insert one.
- **Images:** pasted or attached, uploaded, rendered inline with a click-to-zoom dialog. Collapsible per message or channel-wide. Gifs from Giphy can also be inserted with the gif picker.
- **Voice:** joining a voice channel connects to its LiveKit room (`voice-<id>`). Not persisted, not recorded. Occupants are visible to everyone without joining.
- **Screen share:** any participant may publish a screen share (with tab or system audio) into the room. It is not persisted and not recorded. Shares are visible only to participants, not to the rest of the server. Share audio plays through the normal audio path, so deafen and per-peer volume apply.
- **Voice controls:** mute, deafen, per-peer volume, mic/speaker device, quality preset, echo cancellation, noise suppression, auto gain, voice isolation, level-based noise gate, join/leave tone, start/stop screen share. Deafen still only silences incoming audio locally; its state is shared, nothing else.
- **Presence:** a user is online while their WS connection is up; otherwise offline. Voice occupancy rides along with presence, and so does each occupant's mute/deafen state, so everyone sees who cannot hear or be heard without joining the call. A user with several connections counts as muted or deafened only when all of them are. No invisible mode.
- **Settings:** colors, font size, and voice preferences are client-side (device-local). Voice occupancy is server-side only.

## Frontend

- React, modern. oxlint + oxfmt. Tailwind, LiveKit client. Mobile-first: the layout is built for narrow screens and widens from there.
- **Style system.** One set of semantic tokens (`src/index.css`) names every role the UI
  uses: background, sidebar, panels, text, muted, faint, borders, accent, accent text,
  danger. Palettes set those variables; user overrides replace them; components only ever
  reference the roles. The shared vocabulary on top (`src/ui`) is buttons, inputs, fields,
  toggles, menus and lists — feature code composes those instead of inventing new Tailwind
  recipes, so the UI stays consistent by construction.
- **Theming.** `80s-nicotine` (sepia, default) and `tuxedo` (grayscale) are presets of those
  colors, not fixed themes: any color can be overridden per light/dark mode from the
  settings pane and is stored with the rest of the preferences. Mode, preset and overrides
  are applied before first paint.
- **No hover-only interactions.** Anything interactive is visible and reachable by tap and
  keyboard: per-message actions open from an always-present `⋯`, channel actions from a
  `⋯` menu, and the selected message's actions appear in a contextual bar above the
  composer. Hover only ever adds a colour change.
- Layout:
  - Left sidebar: text channels, voice channels (with occupants), DMs, then users
    (online/offline). Fixed on desktop, a drawer with a scrim on mobile.
  - Focus pane: chat for the selected text channel or DM, the settings pane, or a screen share.
  - Header: sidebar toggle (mobile), current channel, channel actions.
  - Voice bar: whenever you are in a call — docked in the sidebar on desktop, at the bottom
    of the screen on mobile — with mute, deafen, screen share, leave, participants and
    per-peer volume (from the participant's own menu).
- Settings pane: mode, palette, per-role colours, text size, sounds, voice-activation
  meter/threshold, devices, quality (audio and screen share), mic processing.

## Config

Secrets from shell env, `IRVC_*`:

```
IRVC_LISTEN_ADDR
IRVC_DB_PATH
IRVC_SESSION_SECRET     required to run
IRVC_LIVEKIT_URL        browser-facing
IRVC_LIVEKIT_API_KEY
IRVC_LIVEKIT_SECRET
IRVC_MEDIA_DIR          uploaded image storage
IRVC_MAX_UPLOAD         max upload bytes
```

LiveKit key/secret must match the LiveKit server config and ours. Voice is disabled when the LiveKit vars are unset.

Flags mirror these. `irvc invite` creates an invite and prints a `/join?token=...` link; `irvc --gen-secret` prints a random session secret. A Makefile wraps build/test/fmt for Go and npm.

## Deployment

Bare Linux, no Docker. README lists system-level deps. Services start on boot and restart on crash (systemd). See `DEPLOY.md` for the runbook.
