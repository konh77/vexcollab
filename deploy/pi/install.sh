#!/usr/bin/env bash
#
# VEXCollab - Raspberry Pi installer.
# Licensed under AGPL-3.0-only.
#
# Idempotent: safe to re-run to upgrade.
#
#   curl -fsSL https://raw.githubusercontent.com/ponpon77/vexcollab/main/deploy/pi/install.sh | sudo bash -s -- konh.org
#
set -euo pipefail

DOMAIN="${1:-${VEXCOLLAB_DOMAIN:-konh.org}}"
REPO="${VEXCOLLAB_REPO:-https://github.com/ponpon77/vexcollab.git}"
APP_DIR=/opt/vexcollab
ENV_FILE=/etc/vexcollab.env
APP_USER=vexcollab

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo." >&2
  exit 1
fi

log() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }

log "Installing VEXCollab for https://${DOMAIN}"

# --- packages ---------------------------------------------------------------
log "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates ufw fail2ban unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https gnupg

# Node 22 LTS. The Pi's packaged node is usually too old for Next.
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  log "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

# Caddy: obtains and renews the Let's Encrypt certificate on its own.
if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# --- application user -------------------------------------------------------
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Creating the ${APP_USER} service user"
  useradd --system --create-home --home-dir /var/lib/vexcollab --shell /usr/sbin/nologin "$APP_USER"
fi

# --- code -------------------------------------------------------------------
log "Fetching VEXCollab"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# --- make the build survivable ----------------------------------------------
# `next build` is by far the heaviest thing here. On a Pi with 1-2 GB it will
# thrash or get OOM-killed, taking the network down with it - which looks
# exactly like the Pi having died. Give it swap and a heap ceiling first.
TOTAL_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
log "Detected ${TOTAL_MB} MB of RAM"

if [ "$TOTAL_MB" -lt 3000 ]; then
  WANT_SWAP=2048
  CURRENT_SWAP=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
  if [ "$CURRENT_SWAP" -lt "$WANT_SWAP" ]; then
    log "Raising swap to ${WANT_SWAP} MB so the build does not get OOM-killed"
    if [ -f /etc/dphys-swapfile ]; then
      sed -i "s/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=${WANT_SWAP}/" /etc/dphys-swapfile
      sed -i "s/^#\?CONF_MAXSWAP=.*/CONF_MAXSWAP=${WANT_SWAP}/" /etc/dphys-swapfile
      dphys-swapfile swapoff || true
      dphys-swapfile setup
      dphys-swapfile swapon
    fi
  fi
fi

# Leave headroom for the kernel and sshd, so the box stays reachable while it
# builds. Below ~1.5 GB the build is slow but no longer fatal.
if [ "$TOTAL_MB" -lt 1500 ]; then
  HEAP=768
elif [ "$TOTAL_MB" -lt 3000 ]; then
  HEAP=1024
else
  HEAP=2048
fi

log "Installing dependencies"
sudo -u "$APP_USER" env HOME=/var/lib/vexcollab \
  npm --prefix "$APP_DIR" ci --omit=dev --no-audit --no-fund

log "Building with a ${HEAP} MB heap cap - 10 to 25 minutes on a Pi, and the Pi will be slow"
# nice/ionice keep sshd responsive so you can watch it happen.
if ! nice -n 10 ionice -c3 sudo -u "$APP_USER" env \
      HOME=/var/lib/vexcollab \
      NODE_ENV=production \
      NEXT_TELEMETRY_DISABLED=1 \
      NODE_OPTIONS="--max-old-space-size=${HEAP}" \
      npm --prefix "$APP_DIR" run build; then
  echo
  echo "  The build failed. On a small Pi this is usually memory." >&2
  echo "  Check: dmesg | grep -i 'killed process'" >&2
  exit 1
fi

# --- configuration ----------------------------------------------------------
# The room password is generated once and then left alone across upgrades.
if [ ! -f "$ENV_FILE" ]; then
  log "Generating a room password"
  PASSWORD="$(head -c 12 /dev/urandom | base64 | tr -d '+/=' | cut -c1-12)"
  cat > "$ENV_FILE" <<EOF
# VEXCollab configuration. Keep this file private.
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
VEXCOLLAB_TRUST_PROXY=1
VEXCOLLAB_PASSWORD=${PASSWORD}
VEXCOLLAB_DATA_DIR=/var/lib/vexcollab/data
# Optional: register a GitHub OAuth app to enable "Sign in with GitHub".
# VEXCOLLAB_GITHUB_CLIENT_ID=
EOF
  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"
fi
install -d -o "$APP_USER" -g "$APP_USER" -m 700 /var/lib/vexcollab/data

# --- service ----------------------------------------------------------------
log "Installing the systemd service"
cat > /etc/systemd/system/vexcollab.service <<EOF
[Unit]
Description=VEXCollab
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/server.mjs
Restart=always
RestartSec=3

# The app needs the network, its own data directory, and nothing else.
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=no
ReadWritePaths=/var/lib/vexcollab
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now vexcollab
systemctl restart vexcollab

# --- reverse proxy + TLS ----------------------------------------------------
log "Configuring Caddy for ${DOMAIN}"
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	encode zstd gzip

	# Websockets for the collaboration socket are proxied transparently.
	reverse_proxy 127.0.0.1:3000

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}

	log {
		output file /var/log/caddy/vexcollab.log {
			roll_size 10MiB
			roll_keep 3
		}
	}
}
EOF
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy

# --- firewall ---------------------------------------------------------------
log "Configuring the firewall"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 80/tcp comment 'HTTP (redirects to HTTPS)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
# SSH is deliberately restricted to private networks. Forward only 80 and 443
# on the router; do not expose 22 to the internet.
ufw allow from 192.168.0.0/16 to any port 22 proto tcp comment 'SSH from LAN' >/dev/null
ufw allow from 10.0.0.0/8 to any port 22 proto tcp comment 'SSH from LAN' >/dev/null
ufw allow from 172.16.0.0/12 to any port 22 proto tcp comment 'SSH from LAN' >/dev/null
ufw --force enable >/dev/null

# --- ssh hardening ----------------------------------------------------------
log "Hardening SSH (key-only)"
cat > /etc/ssh/sshd_config.d/99-vexcollab.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin no
MaxAuthTries 3
X11Forwarding no
EOF
systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true

# --- automatic security updates --------------------------------------------
log "Enabling unattended security upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
systemctl enable --now fail2ban >/dev/null 2>&1 || true

# --- dynamic DNS ------------------------------------------------------------
# Home IPs move. Without this the domain quietly points at someone else's
# router until a human notices, which is always at the worst moment.
log "Installing the dynamic DNS updater"
install -m 755 "$APP_DIR/deploy/pi/ddns-update.sh" /usr/local/sbin/vexcollab-ddns

if [ ! -f /etc/vexcollab-ddns.env ]; then
  cat > /etc/vexcollab-ddns.env <<'EOF'
# Paste your provider's update URL here, then:
#   sudo systemctl start vexcollab-ddns.service
#
# IONOS:  developer portal -> DynDNS -> create -> copy the IPv4 update URL
# DuckDNS: https://www.duckdns.org/update?domains=NAME&token=TOKEN
# No-IP:   https://USER:PASS@dynupdate.no-ip.com/nic/update?hostname=HOST
DDNS_UPDATE_URL=""
EOF
  chmod 600 /etc/vexcollab-ddns.env
fi

cat > /etc/systemd/system/vexcollab-ddns.service <<'EOF'
[Unit]
Description=Update dynamic DNS for VEXCollab
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/vexcollab-ddns
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/vexcollab
EOF

cat > /etc/systemd/system/vexcollab-ddns.timer <<'EOF'
[Unit]
Description=Check the public IP every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now vexcollab-ddns.timer

# --- done -------------------------------------------------------------------
PASSWORD_LINE="$(grep '^VEXCOLLAB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
cat <<EOF

  VEXCollab is installed.

    Address     https://${DOMAIN}
    Password    ${PASSWORD_LINE}

  On your router, forward ONLY ports 80 and 443 to this Pi.
  Do not forward port 22 — SSH is restricted to your LAN.

    systemctl status vexcollab      service state
    journalctl -u vexcollab -f      logs
    sudo nano ${ENV_FILE}           change the password, then: systemctl restart vexcollab

EOF
