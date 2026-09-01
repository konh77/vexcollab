#!/usr/bin/env bash
#
# VEXCollab - dynamic DNS updater.
# Licensed under AGPL-3.0-only.
#
# Home connections change address without warning; when that happens the domain
# points at a stranger's router until someone notices. This checks every few
# minutes and updates the record when the address actually moves.
#
# Provider-agnostic: it just fetches an update URL. Works with IONOS DynDNS,
# DuckDNS, No-IP, Dynu, Cloudflare via a wrapper — anything that publishes an
# "update by URL" endpoint. Configure it in /etc/vexcollab-ddns.env:
#
#   DDNS_UPDATE_URL="https://ipv4.api.hosting.ionos.com/dns/v1/dyndns?q=..."
#
set -euo pipefail

ENV_FILE=/etc/vexcollab-ddns.env
STATE_FILE=/var/lib/vexcollab/last-ip
LOG_TAG=vexcollab-ddns

[ -r "$ENV_FILE" ] || { echo "No $ENV_FILE — dynamic DNS not configured"; exit 0; }
# shellcheck disable=SC1090
. "$ENV_FILE"
[ -n "${DDNS_UPDATE_URL:-}" ] || { echo "DDNS_UPDATE_URL is empty"; exit 0; }

log() { logger -t "$LOG_TAG" "$1"; echo "$1"; }

# Ask more than one source: a single service having a bad day should not cause
# a pointless update, or worse, a wrong one.
current=""
for source in \
  "https://api.ipify.org" \
  "https://ipv4.icanhazip.com" \
  "https://checkip.amazonaws.com"
do
  candidate="$(curl -fsS --max-time 10 "$source" 2>/dev/null | tr -d '[:space:]')" || continue
  if [[ "$candidate" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    current="$candidate"
    break
  fi
done

[ -n "$current" ] || { log "could not determine public IP; leaving DNS alone"; exit 0; }

previous=""
[ -r "$STATE_FILE" ] && previous="$(cat "$STATE_FILE")"

if [ "$current" = "$previous" ]; then
  exit 0
fi

if curl -fsS --max-time 20 "$DDNS_UPDATE_URL" >/dev/null 2>&1; then
  mkdir -p "$(dirname "$STATE_FILE")"
  printf '%s' "$current" > "$STATE_FILE"
  log "public IP changed ${previous:-none} -> ${current}; DNS updated"
else
  log "public IP changed to ${current} but the update call failed; will retry"
  exit 1
fi
