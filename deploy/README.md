# Deploying the E-Pro Trip Manager

Runs **alongside the quotation system** in the existing `epro-quotes` LXC on
Proxmox. Separate service user, port, data directory and backups, so the two
apps cannot collide.

```
  browser (any tailnet device)
        │  https://epro-quotes.<tailnet>.ts.net:8443
        ▼
  tailscaled ──► nginx 127.0.0.1:8081 ──► node 127.0.0.1:3001
                                              │
                                  /var/lib/epro-trips/trips.db
                                  /var/lib/epro-trips/uploads
```

The quotation system keeps port 443. A Tailscale node has a single hostname, so
this app takes 8443 (Tailscale allows HTTPS on 443, 8443 and 10000). Serving it
at a path instead would require rebuilding both frontends with a Vite `base`.

| | Quotation system | Trip manager |
| --- | --- | --- |
| Service | `epro` | `epro-trips` |
| User | `epro` | `eprotrips` |
| App port | 3000 | 3001 |
| nginx | 127.0.0.1:80 | 127.0.0.1:8081 |
| Tailscale | 443 | 8443 |
| Data | `/var/lib/epro` | `/var/lib/epro-trips` |
| Backups | `/var/backups/epro` 02:15 | `/var/backups/epro-trips` 02:35 |

## Install

Inside the `epro-quotes` container, as root:

```bash
git clone https://github.com/Voltageza/EPRO-Trip-Manager.git /root/trips-deploy
cd /root/trips-deploy/deploy && ./bootstrap.sh
```

It installs Chromium, creates the service user, clones to `/opt/epro-trips/app`,
seeds `.env` from `.env.example`, builds both frontends, and installs the
service, nginx block, backups and health check.

**Then fill in the real values** in `/opt/epro-trips/.env` — Cartrack API,
Gmail SMTP app password, `EMAIL_FROM`/`EMAIL_TO` — and
`systemctl restart epro-trips`. The bootstrap generates a fresh `JWT_SECRET` and
sets `HOST`, `PORT`, `DB_PATH` and `UPLOAD_DIR` for you.

## Bringing your data across

With the local server stopped, from the repo root on Windows:

```bash
node deploy/export-local-db.js
```

Then follow the printed instructions. Do not copy `trips.db` by hand — a large
share of the data sits in the `-wal` sidecar and you would ship a stale
database.

## Day to day

| Task | Command (inside the container) |
| --- | --- |
| Deploy latest `main` | `/opt/epro-trips/app/deploy/update.sh` |
| Status / logs | `systemctl status epro-trips` · `journalctl -u epro-trips -f` |
| Health now | `systemctl start epro-trips-healthcheck` |
| Health results | `journalctl -u epro-trips-healthcheck -n 30` |
| Manual backup | `epro-trips-backup` |

## Notes specific to this app

**Chromium.** PDF reports render through puppeteer. Rather than puppeteer's
bundled download, the service uses Debian's `chromium` package via
`PUPPETEER_EXECUTABLE_PATH`, because apt pulls in every shared library it needs
and keeps it patched. The health check verifies the binary exists, since a
missing Chromium otherwise only surfaces when someone requests a report.

**Cron jobs run in-process.** `SYNC_CRON` (06:00), `REMINDER_CRON` (07:00) and
the weekly report fire inside the Node process, so they only run while the
service is up — which is what the health check is for. They use the container's
timezone (UTC by default); set it with `timedatectl set-timezone Africa/Johannesburg`
if you want them at local time.

**Data lives outside the code tree** via `DB_PATH` and `UPLOAD_DIR`. Do not
point these back inside `/opt/epro-trips/app`: a deploy does `git reset --hard`,
and `ProtectSystem=strict` makes that tree read-only for the service.

**Health check treats HTTP 401 as healthy.** Every data route requires a token,
so 401 means the API is alive and enforcing auth.
