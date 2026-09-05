#!/usr/bin/env bash
#
# VEXCollab - publish a static site alongside the app.
# Licensed under AGPL-3.0-only.
#
# Run this on your own machine, not the Pi:
#
#   ./deploy/pi/publish-site.sh ~/Desktop/konh-site konh.org
#   ./deploy/pi/publish-site.sh ~/site konh.org myhost     # custom ssh host
#
# It copies the folder to the Pi, serves it at the apex domain, and leaves the
# app on its own subdomain untouched. Caddy obtains the certificate itself.
set -euo pipefail

SITE_DIR="${1:-}"
DOMAIN="${2:-}"
SSH_HOST="${3:-vexcollab}"

if [ -z "$SITE_DIR" ] || [ -z "$DOMAIN" ]; then
  echo "usage: $0 <folder> <domain> [ssh-host]" >&2
  exit 1
fi
[ -d "$SITE_DIR" ] || { echo "No such folder: $SITE_DIR" >&2; exit 1; }
[ -f "$SITE_DIR/index.html" ] || { echo "No index.html in $SITE_DIR" >&2; exit 1; }

log() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }

# Only serve www when it actually resolves. A certificate covers every name in
# the block, so listing a hostname with no DNS record fails the whole
# certificate — including the apex.
WWW_HOST=""
if dig +short "www.${DOMAIN}" 2>/dev/null | grep -q .; then
  WWW_HOST=", www.${DOMAIN}"
  log "www.${DOMAIN} resolves — serving it too"
else
  log "www.${DOMAIN} has no DNS record — serving the apex only"
fi

log "Packing $(find "$SITE_DIR" -type f | wc -l | tr -d ' ') files"
BUNDLE="$(mktemp -t vexcollab-site).tar.gz"
tar -czf "$BUNDLE" -C "$SITE_DIR" .

# The remote half is written to a file and executed there. Piping it to
# `bash -s` over `ssh -t` does not work: the TTY that lets sudo prompt for a
# password and the stdin carrying the script are the same channel, so sudo
# eats the first lines of the script.
REMOTE_SCRIPT="$(mktemp -t vexcollab-remote).sh"
cat > "$REMOTE_SCRIPT" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
DOMAIN="$1"
WWW_HOST="${2:-}"
ROOT="/var/www/${DOMAIN}"

mkdir -p "$ROOT"
# Replace rather than merge, so files deleted upstream actually go away.
rm -rf "${ROOT:?}/"*
tar -xzf /tmp/vexcollab-site.tar.gz -C "$ROOT"
rm -f /tmp/vexcollab-site.tar.gz
chown -R caddy:caddy "$ROOT" 2>/dev/null || chown -R www-data:www-data "$ROOT" 2>/dev/null || true
find "$ROOT" -type d -exec chmod 755 {} +
find "$ROOT" -type f -exec chmod 644 {} +

if grep -qE "^${DOMAIN}[ ,{]" /etc/caddy/Caddyfile 2>/dev/null; then
  echo "  Caddy already serves ${DOMAIN}; replaced the files only"
else
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.backup-$(date +%Y%m%d-%H%M%S)"
  cat >> /etc/caddy/Caddyfile <<EOF

${DOMAIN}${WWW_HOST} {
	root * ${ROOT}
	encode zstd gzip
	file_server

	@immutable path /_next/static/* /assets/*
	header @immutable Cache-Control "public, max-age=31536000, immutable"

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}

	handle_errors {
		@404 expression {err.status_code} == 404
		rewrite @404 /404.html
		file_server
	}
}
EOF
  echo "  added a Caddy block for ${DOMAIN}${WWW_HOST}"
fi

if ! caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  echo "  Caddyfile failed validation — not reloading" >&2
  exit 1
fi

# Restart rather than reload: a reload keeps any certificate back-off from
# earlier failures, and this is usually run because something was wrong.
systemctl restart caddy
echo "  published — Caddy is fetching the certificate"
REMOTE

log "Copying to $SSH_HOST"
scp -q "$BUNDLE" "$SSH_HOST:/tmp/vexcollab-site.tar.gz"
scp -q "$REMOTE_SCRIPT" "$SSH_HOST:/tmp/vexcollab-publish.sh"
rm -f "$BUNDLE" "$REMOTE_SCRIPT"

log "Installing on the Pi (this asks for your sudo password)"
ssh -t "$SSH_HOST" "sudo bash /tmp/vexcollab-publish.sh '$DOMAIN' '$WWW_HOST'; rm -f /tmp/vexcollab-publish.sh"

log "Done — https://${DOMAIN}"
echo "  The certificate takes a few seconds. Check with:"
echo "    curl -sI https://${DOMAIN} | head -1"
