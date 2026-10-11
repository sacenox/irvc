# IRVC deployment

Runbook for an IRVC instance on a VPS (Arch, no Docker). Design is in
[irvc.md](./irvc.md); the generic overview is in [README.md](./README.md).
Host-level config (DNS, Caddy, firewall) lives outside this repo.

> **Replace the placeholders before running anything.** `<domain>` and `user`
> below stand in for your real domain and service account; `<hex>` and
> `<LIVEKIT_SECRET>` stand in for generated secrets. None of them work as-is.

## Host plumbing (already done)

- DNS: `irvc.<domain>` and `livekit.<domain>` — `A`/`AAAA` -> the host IP.
- Caddy: `irvc.<domain>` -> `127.0.0.1:8080`, `livekit.<domain>` ->
  `127.0.0.1:7880`. Certs issued.
- Firewall: TCP `22/80/443/7881`, UDP `50000-60000`.

## Decisions

Defaults chosen here; change before installing if you disagree.

- Run both services as `user` (owns the checkout and the DB). No dedicated
  service users yet.
- Secrets live in `/etc/irvc.env` (root, `0600`), not in a shell profile.
- SQLite stays at `/home/user/repos/irvc/irvc.db` (WAL).
- `livekit-server` pinned to a release tag, installed to `/usr/local/bin`.

## 1. LiveKit

Fetch the release binary (assets are `livekit_<ver>_linux_amd64.tar.gz` under
tag `v<ver>`):

    VERSION=1.13.9
    curl -fsSL -o /tmp/lk.tgz \
      https://github.com/livekit/livekit/releases/download/v$VERSION/livekit_${VERSION}_linux_amd64.tar.gz
    sudo tar -xzf /tmp/lk.tgz -C /usr/local/bin livekit-server
    livekit-server --version

`/etc/livekit.yaml`:

    port: 7880
    rtc:
      tcp_port: 7881
      port_range_start: 50000
      port_range_end: 60000
      use_external_ip: true
    keys:
      irvc: <LIVEKIT_SECRET>

The host has its public IP directly on `eth0`, so `use_external_ip: true`
advertises the interface IP.

`livekit-server` runs as `user` and reads this file itself, so hand it over:

    sudo chown root:user /etc/livekit.yaml
    sudo chmod 640 /etc/livekit.yaml

`/etc/systemd/system/livekit.service`:

    [Unit]
    Description=LiveKit server
    After=network-online.target
    Wants=network-online.target

    [Service]
    ExecStart=/usr/local/bin/livekit-server --config /etc/livekit.yaml
    User=user
    Restart=on-failure
    RestartSec=2

    [Install]
    WantedBy=multi-user.target

## 2. Secrets

Generate two independent secrets:

    openssl rand -hex 32   # IRVC_SESSION_SECRET
    openssl rand -hex 32   # LIVEKIT_SECRET (matches keys.irvc above)

`/etc/irvc.env` (`sudo install -m 600 /dev/null /etc/irvc.env`, then edit):

    IRVC_LISTEN_ADDR=127.0.0.1:8080
    IRVC_DB_PATH=/home/user/repos/irvc/irvc.db
    IRVC_SESSION_SECRET=<hex>
    IRVC_LIVEKIT_URL=wss://livekit.<domain>
    IRVC_LIVEKIT_API_KEY=irvc
    IRVC_LIVEKIT_SECRET=<hex>

`IRVC_LISTEN_ADDR` binds loopback only, because Caddy fronts it. The Go server
mints the LiveKit JWT itself (`voice.go`) and never dials LiveKit — so
`IRVC_LIVEKIT_URL` is browser-facing, and only the key/secret must match
`/etc/livekit.yaml`.

## 3. IRVC service

`/etc/systemd/system/irvc.service`:

    [Unit]
    Description=IRVC (Internet Relay Voice Chat)
    After=network-online.target
    Wants=network-online.target

    [Service]
    WorkingDirectory=/home/user/repos/irvc
    ExecStart=/home/user/repos/irvc/irvc
    EnvironmentFile=/etc/irvc.env
    User=user
    Restart=on-failure
    RestartSec=2

    [Install]
    WantedBy=multi-user.target

`WorkingDirectory` is required: `serveFrontend` reads `web/dist` and the DB
path is relative, both resolved against the process CWD.

## 4. Enable

    sudo systemctl daemon-reload
    sudo systemctl enable --now livekit irvc

## 5. Verify

    systemctl status livekit irvc
    journalctl -u irvc -u livekit -f
    curl -sI https://irvc.<domain>                    # 200
    cd ~/repos/irvc && ./irvc invite                    # claim + log in
    curl -sI https://livekit.<domain>                 # 200 / 426, not 502

First `irvc` start creates `irvc.db` and seeds `#general` (text) and `general`
(voice). Voice check: join `general`, confirm LiveKit logs the participant and
ICE completes over UDP.

## Rebuild

Only when code changes:

    go build -o irvc .
    cd web && npm install && npm run build

`web/dist` is served by the Go process; `~/repos/irvc/irvc` and `web/dist` are
gitignored build output.
