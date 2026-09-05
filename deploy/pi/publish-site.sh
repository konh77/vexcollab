#!/usr/bin/env bash
#
# VEXCollab - publish a static site alongside the app.
# Licensed under AGPL-3.0-only.
#
# Run this on your own machine, not the Pi:
#
#   ./deploy/pi/publish-site.sh ~/Downloads/konh.org-static konh.org
#   ./deploy/pi/publish-site.sh ~/site konh.org vexcollab      # custom ssh host
#
# It copies the folder to the Pi, serves it at the apex domain, and leaves the
# app on its own subdomain untouched. Caddy obtains the certificate itself.
set -euo pipefail

SITE_DIR="${1:-}"
DOMAIN="${2:-}"
SSH_HOST="${3:-vexcollab}"
# Only serve www when it actually resolves. Certificates cover every name in
# the block, so listing a hostname with no DNS record fails the whole
# certificate — including the apex, which then serves plain HTTP and nothing
# else. Learned the hard way.
WWW_HOST=""
if host "www.${DOMAIN}" >/dev/null 2>&1 || dig +short "www.${DOMAIN}" | grep -q .; then
  WWW_HOST=", www.${DOMAIN}"
  echo "  www.${DOMAIN} resolves — it will be served too"
else
  echo "  www.${DOMAIN} has no DNS record — serving the apex only"
fi

if [ -z "$SITE_DIR" ] || [ -z "$DOMAIN" ]; then
  echo "usage: $0 <folder> <domain> [ssh-host]" >&2
  exit 1
fi
[ -d "$SITE_DIR" ] || { echo "No such folder: $SITE_DIR" >&2; exit 1; }
[ -f "$SITE_DIR/index.html" ] || { echo "No index.html in $SITE_DIR" >&2; exit 1; }

log() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }

log "Packing $(find "$SITE_DIR" -type f | wc -l | tr -d ' ') files"
BUNDLE="$(mktemp -t vexcollab-site).tar.gz"
tar -czf "$BUNDLE" -C "$SITE_DIR" .

log "Copying to $SSH_HOST"
scp -q "$BUNDLE" "$SSH_HOST:/tmp/site.tar.gz"
rm -f "$BUNDLE"

log "Installing on the Pi (this asks for your sudo password)"
ssh -t "$SSH_HOST" "sudo bash -s -- '$DOMAIN' '$WWW_HOST'" <<'REMOTE'
set -euo pipefail
DOMAIN="$1"
WWW_HOST="${2:-}"
ROOT="/var/www/${DOMAIN}"

mkdir -p "$ROOT"
# Replace the contents rather than merging, so files deleted upstream go away.
rm -rf "${ROOT:?}/"*
tar -xzf /tmp/site.tar.gz -C "$ROOT"
rm -f /tmp/site.tar.gz
chown -R caddy:caddy "$ROOT" 2>/dev/null || chown -R www-data:www-data "$ROOT" 2>/dev/null || true
find "$ROOT" -type d -exec chmod 755 {} + ; find "$ROOT" -type f -exec chmod 644 {} +

# Add a site block for this domain if there is not one already. The app's own
# block is left exactly as it is.
if ! grep -q "^${DOMAIN} {" /etc/caddy/Caddyfile 2>/dev/null; then
  cat >> /etc/caddy/Caddyfile <<EOF

${DOMAIN}${WWW_HOST} {
	root * ${ROOT}
	encode zstd gzip
	file_server

	# Content-hashed bundles never change under the same name.
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
  echo "  added a Caddy block for ${DOMAIN}"
else
  echo "  Caddy already serves ${DOMAIN}; only the files were replaced"
fi

caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || {
  echo "  Caddyfile failed validation — not reloading" >&2
  exit 1
}
systemctl reload caddy
echo "  published"
REMOTE

log "Done — https://${DOMAIN}"
echo "  The certificate is issued on the first request; give it a few seconds."
