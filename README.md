# IRVC — Internet Relay Voice Chat

A WebRTC-powered text and voice chat. Private, self-hosted, personal server.
See [irvc.md](./irvc.md) for the design.

## Architecture

Three processes on one host:

- **livekit-server** — voice only. Ephemeral rooms.
- **irvc** (this repo, Go) — API, auth, text chat over WebSocket, SQLite.
- **Caddy** — TLS + reverse proxy for the frontend, API, and LiveKit signal.

## System dependencies

Bare Linux, no Docker. On Arch:

    sudo pacman -S go nodejs npm caddy

`livekit-server` is not packaged on Arch. Install its release binary to
`~/.local/bin` (or `/usr/local/bin`) from the
[livekit releases](https://github.com/livekit/livekit/releases).

## Build

    go build -o irvc .
    cd web && npm install && npm run build

`web/dist` is served by the Go process.

## Configuration

Secrets come from the shell env:

| Var | Default | Notes |
| --- | --- | --- |
| `IRVC_LISTEN_ADDR` | `:8080` | |
| `IRVC_DB_PATH` | `irvc.db` | SQLite file, the only state |
| `IRVC_SESSION_SECRET` | — | **required**; signs session cookies |
| `IRVC_LIVEKIT_URL` | — | e.g. `wss://livekit.example.com` (browser-facing) |
| `IRVC_LIVEKIT_API_KEY` | — | must match livekit-server |
| `IRVC_LIVEKIT_SECRET` | — | must match livekit-server |

Voice is disabled if the LiveKit vars are unset.

Example `livekit.yaml` (run with `livekit-server --config livekit.yaml`):

    port: 7880
    rtc:
      tcp_port: 7881
      port_range_start: 50000
      port_range_end: 60000
      use_external_ip: true
    keys:
      irvc: <IRVC_LIVEKIT_SECRET>

## Invites

Single-use, 14-day expiry. Create one:

    ./irvc invite

It prints the token and a `/join?token=...` link. Revoke = delete the row.

## Run

    export IRVC_SESSION_SECRET=...
    export IRVC_LIVEKIT_URL=wss://livekit.example.com
    export IRVC_LIVEKIT_API_KEY=irvc
    export IRVC_LIVEKIT_SECRET=...
    ./irvc

Caddy terminates TLS and proxies both hosts to their local ports:

    irvc.example.com {
    	reverse_proxy 127.0.0.1:8080
    }

    livekit.example.com {
    	reverse_proxy 127.0.0.1:7880
    }

Media ports (`7881/tcp`, `50000-60000/udp`) are exposed raw, not proxied;
open them in the host firewall.

## Service

Run both under systemd so they start on boot and restart on crash.
