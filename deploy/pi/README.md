# Running VEXCollab on a Raspberry Pi at `konh.org`

The Pi does very little: it serves the page and relays edits between browsers.
All the heavy work — the editor, the USB connection to the brain, the Python
bundling — happens in each person's browser. A Pi 3 or newer is plenty.

**The brain plugs into whoever is using it, not into the Pi.** Because the site
is served over real HTTPS, WebSerial works in any visitor's browser. Everyone
connects their own V5; nobody needs the Pi to be near a robot.

---

## Before you flash

Point your DNS at your home connection, or the certificate cannot be issued:

- An `A` record for `konh.org` → your public IP (use a dynamic-DNS updater if it changes)
- On your router, forward **only ports 80 and 443** to the Pi
- **Do not forward port 22.** The installer restricts SSH to your local network

---

## Option A — flash it and walk away (no display, no keyboard)

1. In **Raspberry Pi Imager**, choose **Raspberry Pi OS Lite (64-bit)**.
2. Open the settings gear and set:
   - hostname, e.g. `vexcollab`
   - **username and SSH public key** — under *Services → SSH → Allow public-key only*
   - your Wi-Fi name and password, and your country
3. Write the card, then re-insert it so the `bootfs` partition mounts.
4. Open `firstrun.sh` on `bootfs`, paste in the contents of
   [`firstrun-append.sh`](./firstrun-append.sh) **above the final `exit 0`**, and
   set `VEXCOLLAB_DOMAIN` at the top of what you pasted.
5. Eject, put the card in the Pi, power it on.

It installs itself on first boot. Give it 10–20 minutes on the first run (it
builds the app), then open `https://konh.org`.

Watch it if you want: `ssh <you>@vexcollab.local` then
`tail -f /var/log/vexcollab-firstboot.log`.

## Option B — one command over SSH (more predictable)

Flash with Imager as above (steps 1–3), boot the Pi, then:

```bash
ssh <you>@vexcollab.local
curl -fsSL https://raw.githubusercontent.com/ponpon77/vexcollab/main/deploy/pi/install.sh | sudo bash -s -- konh.org
```

Same result. Prefer this if Option A doesn't come up — the failure is visible
instead of silent.

---

## What the installer does to the Pi

| Area | What it sets |
| --- | --- |
| TLS | Caddy, with a Let's Encrypt certificate for your domain, renewed automatically |
| App | Runs as a `vexcollab` system user with no shell, bound to `127.0.0.1` only — never directly reachable from the internet |
| Password | Generates one and prints it. Change it in `/etc/vexcollab.env` |
| Firewall | `ufw`: 80 and 443 open; **22 only from private networks** |
| SSH | Key-only. Passwords and root login disabled, `MaxAuthTries 3` |
| Updates | `unattended-upgrades` for security patches, `fail2ban` for SSH |
| Sandbox | systemd `ProtectSystem=strict`, `PrivateTmp`, `NoNewPrivileges`, a syscall filter, and write access only to its own data directory |

The app also throttles the login form to 10 attempts per IP per 15 minutes, and
sends HSTS, `X-Frame-Options`, and `nosniff` headers.

## Day to day

```bash
systemctl status vexcollab      # is it running
journalctl -u vexcollab -f      # logs
sudo nano /etc/vexcollab.env    # change the password, then restart
sudo systemctl restart vexcollab
```

Upgrade by re-running the installer — it is idempotent and keeps your password
and data.

## Honest limits

- **This has not been run on real hardware.** It was written carefully against
  Raspberry Pi OS Bookworm, but I had no Pi to test it on. Expect to fix a
  detail or two, and prefer Option B the first time so you can see what happens.
- Let's Encrypt needs port 80 reachable from the internet to issue the
  certificate. If Caddy logs a challenge failure, that forward is the first
  thing to check.
- Rooms live in memory. Restarting the service ends any unsaved session, which
  is why *Save session to GitHub* exists.
