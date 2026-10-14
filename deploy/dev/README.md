# IRVC dev stack (Podman)

Local dev instance. Two containers, host networking, no TLS:

- `irvc` — built from `Containerfile` (Go server + built frontend), `:8080`.
- `livekit-server` — `:7880`, media `7881/tcp`, `7882/udp`.

Host networking is used so LiveKit can advertise reachable ICE ports.

## Run

    cd deploy/dev
    podman-compose up -d --build

Open <http://localhost:8080>. Use `localhost`, not a LAN IP: session cookies
are `Secure`, and browsers only accept those on `https` or `localhost`.

State lives in the `irvc-dev_irvc-data` volume (`/data`: `irvc.db`, `media`).
Reset it with `podman-compose down -v`.

## Invite

The DB starts empty. Create an invite, then open its `/join?token=...` URL:

    podman exec irvc-dev_irvc_1 /app/irvc invite

## Frontend dev (HMR)

The container serves the built frontend. For hot reload, run Vite on the host
instead; `vite.config.ts` already proxies `/api` (and the websocket) to `:8080`:

    cd web && npm install && npm run dev   # http://localhost:5173

## Logs and stop

    podman-compose logs -f
    podman-compose down
