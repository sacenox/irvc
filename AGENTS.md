# Internet Relay Voice Chat

> A WebRTC powered text and voice chat.

Discord, Slack, and other chat and voice applications are expensive or gather user data.
With the lack of ownership of data, and more and more "enshitification" of these platforms,
the need is rising for a private self hosted instance of this.

This is ours.

## This box is production

**This checkout is the live instance at https://irvc.xonecas.io. It is not a
sandbox.** The `irvc` systemd service runs from this directory
(`WorkingDirectory` = this repo). Treat everything here as live.

- `web/dist` is served live from disk per request. `cd web && npm run build`
  **deploys the frontend immediately** — no separate deploy step.
- `irvc.db` (WAL) is the live database: all users, invites, sessions, channels,
  messages. It is the only state.
- `./irvc` is the live binary; `go build -o irvc .` replaces it on disk (the
  service picks it up on restart).
- Host config (DNS, Caddy, firewall, Caddyfile) lives in `../vps/README.md`.
- Deployment runbook: `DEPLOY.md`.

### SQLite: be very, very careful

The DB holds real users and messages. Losing or corrupting it loses everything.

- **Never start a second server process against `irvc.db`.** One process owns it.
- **Never run schema migrations, manual writes, or `sqlite3` mutations by hand.**
  Read-only inspection is fine; anything that writes is not.
- Don't copy, move, truncate, or delete the DB, `-wal`, or `-shm` files.
- Don't create accounts or invites in it without Sean's explicit approval.

When verifying changes, use the live site directly (`agent-browser` against
https://irvc.xonecas.io) — never spin up a local instance.

## Docs

- `README.md` — build, configuration, invites, run.
- `irvc.md` — design.
- `DEPLOY.md` — runbook for the VPS deployment.

## Agent test account

This is the shared test account for agents. Use it for any live UI checks.

- URL: https://irvc.xonecas.io
- Username: `deepseek`
- Password: `deepseek`

Rules:

- Use only this account. It is the only account agents may use.
- Never create new accounts or invites without explicit approval from Sean.

### Seeing the UI

Use `agent-browser`:

```bash
agent-browser open https://irvc.xonecas.io
agent-browser snapshot -i          # find the username/password fields
agent-browser fill @e<user> deepseek
agent-browser fill @e<pass> deepseek
agent-browser click @e<join>
agent-browser screenshot /tmp/irvc.png
```

If already logged in, just open and snapshot.

Note: this React app does not respond to `agent-browser click`/`press` for some
controls (e.g. `send`, Enter-to-send). Native clicks work but React handlers may
not fire. Fall back to dispatching the real DOM event via `agent-browser eval`:

```bash
# submit the message form
agent-browser eval "document.querySelector('form').requestSubmit()"
# click a button by title
agent-browser eval "[...document.querySelectorAll('button')].find(b=>b.title==='dark mode').click()"
```
