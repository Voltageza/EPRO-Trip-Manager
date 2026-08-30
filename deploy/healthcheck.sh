#!/usr/bin/env bash
# Health check for the E-Pro Trip Manager.
# Installed as /usr/local/bin/epro-trips-healthcheck, run every 5 minutes.
#
# Optional alerting: put ALERT_CMD in /etc/default/epro-trips-healthcheck,
# e.g. ALERT_CMD='curl -s -d @- https://ntfy.sh/my-topic'
set -uo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3001/api/trips}"
NGINX_URL="${NGINX_URL:-http://127.0.0.1:8081/api/trips}"
DATA_DIR="${DATA_DIR:-/var/lib/epro-trips}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/epro-trips}"
BACKUP_MAX_AGE_H="${BACKUP_MAX_AGE_H:-48}"
ATTEMPTS="${ATTEMPTS:-3}"

[ -f /etc/default/epro-trips-healthcheck ] && . /etc/default/epro-trips-healthcheck

PROBLEMS=()
note() { echo "  $*"; }
problem() { echo "  FAIL: $*"; PROBLEMS+=("$*"); }

# 401 means the API is alive and enforcing auth - that is a pass.
probe() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || echo 000)
  [ "$code" = "401" ] || [ "$code" = "200" ]
}

app_ok=false
for i in $(seq 1 "$ATTEMPTS"); do
  if probe "$APP_URL"; then app_ok=true; break; fi
  [ "$i" -lt "$ATTEMPTS" ] && sleep 5
done

if ! $app_ok; then
  note "app not responding after $ATTEMPTS attempts - restarting epro-trips"
  systemctl restart epro-trips
  sleep 10
  if probe "$APP_URL"; then
    note "app recovered after restart"
    PROBLEMS+=("app was unresponsive and had to be restarted")
  else
    problem "app still not responding after restart"
    journalctl -u epro-trips -n 20 --no-pager | sed 's/^/    /'
  fi
else
  note "app ok"
fi

if probe "$NGINX_URL"; then
  note "nginx ok"
else
  problem "nginx not proxying to the trip manager on 8081"
fi

# Chromium is what turns reports into PDFs; a missing binary only shows up
# when someone asks for a report, which is too late to find out.
if [ ! -x /usr/bin/chromium ]; then
  problem "/usr/bin/chromium missing - PDF reports will fail"
else
  note "chromium present"
fi

if ! tailscale serve status 2>/dev/null | grep -q '127.0.0.1:8081'; then
  note "tailscale serve entry missing - re-applying"
  tailscale serve --bg --https=8443 http://127.0.0.1:8081 \
    || problem "could not re-apply the tailscale serve config for 8443"
else
  note "tailscale serve ok"
fi

NEWEST="$(find "$BACKUP_DIR" -name 'trips-*.db.gz' -printf '%T@\n' 2>/dev/null | sort -n | tail -1)"
if [ -z "$NEWEST" ]; then
  problem "no database backups found in $BACKUP_DIR"
else
  AGE_H=$(( ( $(date +%s) - ${NEWEST%.*} ) / 3600 ))
  [ "$AGE_H" -gt "$BACKUP_MAX_AGE_H" ] && problem "newest backup is ${AGE_H}h old" || note "newest backup ${AGE_H}h old"
fi

if [ "${#PROBLEMS[@]}" -eq 0 ]; then echo "healthy"; exit 0; fi

MSG="E-Pro Trip Manager health check failed on $(hostname):"
for p in "${PROBLEMS[@]}"; do MSG="$MSG"$'\n'"  - $p"; done
echo "$MSG"
[ -n "${ALERT_CMD:-}" ] && printf '%s\n' "$MSG" | eval "$ALERT_CMD"
exit 1
