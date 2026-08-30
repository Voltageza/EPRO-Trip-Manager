#!/usr/bin/env bash
# Installs the E-Pro Trip Manager alongside the quotation system.
#
# RUN THIS INSIDE THE epro-quotes LXC, as root. That container already has
# Node 22, nginx, git and Tailscale, so this only adds what is new.
#
#   ./bootstrap.sh
#
set -euo pipefail

# systemd-run and some cron contexts start with no $HOME, which makes
# "git config --global" fail with "fatal: $HOME not set".
export HOME="${HOME:-/root}"

REPO_URL="${REPO_URL:-https://github.com/Voltageza/EPRO-Trip-Manager.git}"
BRANCH="${BRANCH:-main}"
APP_USER="${APP_USER:-eprotrips}"
APP_DIR="${APP_DIR:-/opt/epro-trips/app}"
DATA_DIR="${DATA_DIR:-/var/lib/epro-trips}"
APP_PORT="${APP_PORT:-3001}"
NODE_BUILD_MEM="${NODE_BUILD_MEM:-1536}"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null || { echo "ERROR: Node is not installed. Run this inside the epro-quotes container." >&2; exit 1; }

echo "==> Installing Chromium for PDF rendering"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# The chromium package pulls in every shared library headless Chrome needs,
# which is far more reliable than listing them by hand.
apt-get install -y -qq chromium sqlite3

echo "==> Creating service user and directories"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/epro-trips --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR/uploads" /var/backups/epro-trips
chown -R "$APP_USER:$APP_USER" /opt/epro-trips "$DATA_DIR"

# Root-run git against a tree owned by the service user needs this.
git config --global --get-all safe.directory 2>/dev/null | grep -qx "$APP_DIR" \
  || git config --global --add safe.directory "$APP_DIR"

echo "==> Fetching source"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --all --prune
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

echo "==> Writing .env (kept if it already exists)"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  {
    echo ""
    echo "HOST=127.0.0.1"
    echo "PORT=${APP_PORT}"
    echo "DB_PATH=${DATA_DIR}/trips.db"
    echo "UPLOAD_DIR=${DATA_DIR}/uploads"
    echo "JWT_SECRET=$(openssl rand -hex 32)"
  } >> "$APP_DIR/.env"
  echo "    created $APP_DIR/.env from the example - FILL IN the Cartrack and SMTP values"
else
  echo "    $APP_DIR/.env exists, leaving it alone"
fi
chmod 600 "$APP_DIR/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"

echo "==> Installing dependencies and building both frontends"
cd "$APP_DIR"
# Chromium comes from apt; do not let npm download a second copy.
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm ci
NODE_OPTIONS=--max-old-space-size=$NODE_BUILD_MEM npm run build
echo "NODE_BUILD_MEM=$NODE_BUILD_MEM" > /etc/default/epro-trips-build
chown -R "$APP_USER:$APP_USER" /opt/epro-trips

echo "==> Installing systemd service"
install -m 644 "$DEPLOY_DIR/epro-trips.service" /etc/systemd/system/epro-trips.service
systemctl daemon-reload
systemctl enable --now epro-trips
sleep 5
systemctl is-active --quiet epro-trips || { journalctl -u epro-trips -n 40 --no-pager; exit 1; }

echo "==> Configuring nginx on 127.0.0.1:8081"
install -m 644 "$DEPLOY_DIR/nginx-epro-trips.conf" /etc/nginx/sites-available/epro-trips
ln -sfn /etc/nginx/sites-available/epro-trips /etc/nginx/sites-enabled/epro-trips
nginx -t
systemctl restart nginx

echo "==> Installing backup job"
install -m 755 "$DEPLOY_DIR/backup.sh" /usr/local/bin/epro-trips-backup
cat > /etc/cron.d/epro-trips-backup <<'CRONEOF'
35 2 * * * root /usr/local/bin/epro-trips-backup >> /var/log/epro-trips-backup.log 2>&1
CRONEOF
/usr/local/bin/epro-trips-backup

echo "==> Installing health check (every 5 minutes)"
install -m 755 "$DEPLOY_DIR/healthcheck.sh" /usr/local/bin/epro-trips-healthcheck
install -m 644 "$DEPLOY_DIR/epro-trips-healthcheck.service" /etc/systemd/system/epro-trips-healthcheck.service
install -m 644 "$DEPLOY_DIR/epro-trips-healthcheck.timer" /etc/systemd/system/epro-trips-healthcheck.timer
touch /etc/default/epro-trips-healthcheck
systemctl daemon-reload
systemctl enable --now epro-trips-healthcheck.timer

echo "==> Publishing on the tailnet over HTTPS (port 8443)"
if ! tailscale serve --bg --https=8443 http://127.0.0.1:8081; then
  echo "  !! 'tailscale serve' failed. Re-run once the tailnet allows it:"
  echo "     tailscale serve --bg --https=8443 http://127.0.0.1:8081"
fi

echo
echo "================================================================"
tailscale status --json 2>/dev/null \
  | python3 -c 'import json,sys; print("  Trip Manager: https://" + json.load(sys.stdin)["Self"]["DNSName"].rstrip(".") + ":8443")' \
  2>/dev/null || echo "  (run: tailscale serve status)"
echo
echo "  Fill in Cartrack + SMTP values in $APP_DIR/.env, then:"
echo "      systemctl restart epro-trips"
echo "================================================================"
