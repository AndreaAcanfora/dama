#!/usr/bin/env bash
# Deploys the online game server on the VPS. Idempotent: run it again to update.
#   ssh root@<vps> 'bash -s' < scripts/deploy-server.sh
set -euo pipefail

REPO=https://github.com/AndreaAcanfora/dama.git
DIR=/opt/dama
HOST=${DAMA_HOST:-dama.178-105-121-143.sslip.io}

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --quiet origin main
  git -C "$DIR" reset --quiet --hard origin/main
else
  git clone --quiet "$REPO" "$DIR"
fi

cd "$DIR"
# Only the server and the packages it depends on.
pnpm install --frozen-lockfile --filter '@dama/server...' >/dev/null
pnpm --filter @dama/server build

if pm2 describe dama-ws >/dev/null 2>&1; then
  pm2 reload apps/server/ecosystem.config.cjs --update-env
else
  pm2 start apps/server/ecosystem.config.cjs
fi
pm2 save >/dev/null

SITE=/etc/caddy/sites/dama.caddy
cat > "$SITE.new" <<CADDY
# Dama online game server (WebSocket), deployed by /opt/dama/scripts/deploy-server.sh
$HOST {
	reverse_proxy 127.0.0.1:8787
}
CADDY
if ! cmp -s "$SITE.new" "$SITE" 2>/dev/null; then
  mv "$SITE.new" "$SITE"
  chown caddy:caddy "$SITE"
  caddy validate --config /etc/caddy/main.caddy --adapter caddyfile >/dev/null
  systemctl reload caddy
else
  rm "$SITE.new"
fi

sleep 2
curl -fsS http://127.0.0.1:8787/health && echo " dama-ws healthy"
