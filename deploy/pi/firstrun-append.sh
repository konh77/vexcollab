#!/bin/bash
#
# VEXCollab - first-boot hook for a headless Raspberry Pi.
# Licensed under AGPL-3.0-only.
#
# Append the contents of this file to the `firstrun.sh` that Raspberry Pi
# Imager writes onto the boot partition (before the final `exit 0`), and set
# VEXCOLLAB_DOMAIN below. On first boot the Pi installs and starts VEXCollab by
# itself — no display, no keyboard, no manual step.
#
# It does not block boot: the work happens in a one-shot service that waits for
# the network, so a Wi-Fi that comes up slowly delays the install rather than
# wedging the boot.

VEXCOLLAB_DOMAIN="konh.org"

cat > /etc/systemd/system/vexcollab-firstboot.service <<'UNIT'
[Unit]
Description=Install VEXCollab on first boot
After=network-online.target
Wants=network-online.target
ConditionPathExists=!/var/lib/vexcollab/.installed

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/vexcollab-firstboot
RemainAfterExit=yes
TimeoutStartSec=3600

[Install]
WantedBy=multi-user.target
UNIT

cat > /usr/local/sbin/vexcollab-firstboot <<FIRSTBOOT
#!/usr/bin/env bash
set -euo pipefail
exec > >(tee -a /var/log/vexcollab-firstboot.log) 2>&1

echo "VEXCollab first boot: \$(date -Is)"

# Wait for DNS and the package mirrors, retrying rather than failing outright.
for attempt in \$(seq 1 30); do
  if curl -fsS --max-time 10 https://deb.nodesource.com/ >/dev/null 2>&1; then break; fi
  echo "network not ready (attempt \$attempt), retrying in 10s"
  sleep 10
done

curl -fsSL https://raw.githubusercontent.com/ponpon77/vexcollab/main/deploy/pi/install.sh \
  | bash -s -- "${VEXCOLLAB_DOMAIN}"

mkdir -p /var/lib/vexcollab
touch /var/lib/vexcollab/.installed
systemctl disable vexcollab-firstboot.service || true
echo "VEXCollab first boot finished: \$(date -Is)"
FIRSTBOOT

chmod 755 /usr/local/sbin/vexcollab-firstboot
systemctl enable vexcollab-firstboot.service
