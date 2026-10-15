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
- **Voice controls:** mute, deafen (local only), per-peer volume, mic/speaker device, quality preset, echo cancellation, noise suppression, auto gain, voice isolation, level-based noise gate, join/leave tone, start/stop screen share.
- **Presence:** a user is online while their WS connection is up; otherwise offline. Voice occupancy rides along with presence. No invisible mode.
- **Settings:** themes, font size, and voice preferences are client-side (device-local). Voice occupancy is server-side only.

## Frontend

- React, modern. oxlint + oxfmt. Tailwind + Shadcn. LiveKit client.
- Two themes (`80s-nicotine` sepia default, `tuxedo` grayscale) × light/dark, applied before first paint. Monospace, minimalist, functional.
- Layout:
  - Left sidebar: text channels, voice channels (with occupants), DMs, then users (online/offline). Collapsible; overlays on mobile.
  - Focus pane: chat for the selected text channel or DM, the settings pane, or a screen share.
  - Header: sidebar toggle, current channel, settings, or the screen share being watched.
- Settings pane: theme, font size, sounds, deafen, voice-activation meter/threshold, devices, quality (audio and screen share), mic processing.

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
