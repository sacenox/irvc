# IRVC — Design

A WebRTC-powered text and voice chat. Private, self-hosted, personal server.

## Goal

Small, private chat + voice for 4–6 people on one VPS. No data gathering, full ownership.

## Scope (MVP)

**In:**
- Server-side accounts, invite-only.
- Text channels with persisted history (IRC-like).
- Voice channels, ephemeral (not recorded).
- Presence: online/offline.
- One server per deployment, seeded with one text and one voice channel.

**Out (now):**
- Large scale, multi-node, clustering.
- Recording, screen share, DMs.
- Email, OAuth, passkeys.
- Docker.
- Backups.
- Password reset via email (admin resets manually).

## Architecture

One VPS, three processes:

- **LiveKit** — self-hosted, voice only. Own ports: signal `7880`, TCP `7881`, media `50000-60000/udp`. Media ports exposed raw, not proxied.
- **Gin server (Go)** — API, auth, invite/session handling, token minting, text chat over WebSocket, SQLite.
- **Caddy** — TLS + reverse proxy for frontend and API. Terminates TLS; proxies `wss` to LiveKit signal.

Split:
- Text → our WebSocket + SQLite. LiveKit not involved.
- Voice → LiveKit. Ephemeral.
- Presence → our WebSocket (connected = online).

## Auth & Identity

- Invite links: single-use, 14-day expiry. Anyone with a link creates a user and joins.
- Revoke = delete the row.
- Passwords hashed with argon2id.
- Login → session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) → server mints a short-lived LiveKit token when a voice channel is joined.
- Rate limit login and invite-claim endpoints.
- No email. Admin resets passwords by hand.

## Data (SQLite)

WAL mode, `busy_timeout`. One file, the only state.

```
users    (id, username, pass_hash, created_at)
invites  (token, created_by, expires_at, used_by, used_at)
sessions (id, user_id, expires_at)
channels (id, type, name, position, created_at)   -- type: text | voice
messages (id, channel_id, user_id, body, created_at)
```

Seed: one text channel `#general`, one voice channel `general`.

## Behavior

- **Channels:** seeded only (`#general` text, `general` voice). Ordered by `position`. CRUD is out of scope for now.
- **Text:** messages persist; shown as timestamp, author, content. Live append over WS.
- **Voice:** joining a voice channel connects to its LiveKit room. Not persisted, not recorded.
- **Presence:** a user is online while their WS connection is up; otherwise offline. No invisible mode.

## Frontend

- React, modern. oxlint + oxfmt. Tailwind + Shadcn.
- Dark sepia theme (colors from `../www`), monospace, minimalist, functional.
- Layout:
  - Left sidebar: text channels, then voice channels.
  - Focus pane: selected item, or first text channel by default.
  - Right sidebar (toggleable): user list with online/offline.

## Config

Secrets from shell env, `IRVC_*`:

```
IRVC_LISTEN_ADDR
IRVC_DB_PATH
IRVC_SESSION_SECRET
IRVC_LIVEKIT_URL
IRVC_LIVEKIT_API_KEY
IRVC_LIVEKIT_SECRET
```

LiveKit key/secret must match the LiveKit server config and ours.

## Deployment

Bare Linux, no Docker. README lists system-level deps. Services start on boot and restart on crash (systemd).
