#!/usr/bin/env bash
# Pull the latest main, rebuild both frontends, restart. Run as root.
set -euo pipefail

# systemd-run and some cron contexts start with no $HOME, which makes
# "git config --global" fail with "fatal: $HOME not set".
export HOME="${HOME:-/root}"

APP_DIR="${APP_DIR:-/opt/epro-trips/app}"
BRANCH="${BRANCH:-main}"
APP_USER="${APP_USER:-eprotrips}"
[ -f /etc/default/epro-trips-build ] && . /etc/default/epro-trips-build
NODE_BUILD_MEM="${NODE_BUILD_MEM:-1536}"

# Runs as root against a tree owned by $APP_USER; git refuses without this.
git config --global --get-all safe.directory 2>/dev/null | grep -qx "$APP_DIR" \
  || git config --global --add safe.directory "$APP_DIR"

echo "==> Backing up before update"
/usr/local/bin/epro-trips-backup

echo "==> Pulling $BRANCH"
git -C "$APP_DIR" fetch --prune origin
git -C "$APP_DIR" checkout "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"

echo "==> Rebuilding"
cd "$APP_DIR"
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm ci
NODE_OPTIONS=--max-old-space-size=$NODE_BUILD_MEM npm run build
chown -R "$APP_USER:$APP_USER" /opt/epro-trips

echo "==> Restarting"
systemctl restart epro-trips

echo "==> Verifying"
for i in $(seq 1 20); do
  # 401 is a healthy answer here: the API is up and demanding a token.
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3001/api/trips || true)
  if [ "$CODE" = "401" ] || [ "$CODE" = "200" ]; then
    echo "OK - epro-trips is up (HTTP $CODE from /api/trips)"
    exit 0
  fi
  sleep 3
done

echo "FAILED - the trip manager did not come back healthy" >&2
systemctl status epro-trips --no-pager >&2 || true
journalctl -u epro-trips -n 40 --no-pager >&2
exit 1
