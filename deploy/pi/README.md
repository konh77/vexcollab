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

## Publishing a static site alongside the app

The Pi can serve an ordinary website at your apex domain while VEXCollab keeps
its own subdomain. From your own machine:

```bash
./deploy/pi/publish-site.sh ~/Downloads/konh.org-static konh.org
```

It copies the folder over, serves it from `/var/www/<domain>`, adds a Caddy
block (leaving the app's alone), and reloads. Caddy gets the certificate for the
new name by itself. Re-run it any time to publish an update — the old files are
removed rather than merged, so deletions upstream take effect.

Point an `A` record for the apex at the same IP first, or the certificate cannot
be issued.

## Dynamic DNS (do this — your IP will change)

Home connections change address without warning. When that happens the domain
points at a stranger's router until someone notices.

**It costs nothing.** IONOS includes DynDNS with any domain you own; DuckDNS and
No-IP have free tiers too.

**IONOS:** developer portal → **DynDNS** → create an entry for your hostname →
copy the **IPv4 update URL**. Then on the Pi:

```bash
sudo nano /etc/vexcollab-ddns.env      # paste the URL into DDNS_UPDATE_URL
sudo systemctl start vexcollab-ddns.service
journalctl -u vexcollab-ddns -n 20     # check it worked
```

A timer then checks every 5 minutes and only calls the provider when the address
actually moved. It asks three separate services what your IP is, so one of them
having a bad day cannot push a wrong record.

## If the Pi goes silent during install

Normal. `next build` is the heaviest step, and on a Pi it takes 10–25 minutes
with the whole box slowed to a crawl. The installer adds 2 GB of swap and caps
Node's heap first so it survives, but SSH may still be sluggish or briefly
unresponsive while it runs.

If the Pi answers ping/ARP but refuses SSH for more than about 30 minutes, the
build probably got OOM-killed. Power-cycle, then:

```bash
ssh <you>@vexcollab.local
dmesg | grep -i 'killed process'      # confirms it was memory
free -h                                # confirms swap exists
```

Then re-run the installer (Option B) — it is idempotent and will pick up where
it left off.

## Honest limits

- **This has not been run on real hardware.** It was written carefully against
  Raspberry Pi OS Bookworm, but I had no Pi to test it on. Expect to fix a
  detail or two, and prefer Option B the first time so you can see what happens.
- Let's Encrypt needs port 80 reachable from the internet to issue the
  certificate. If Caddy logs a challenge failure, that forward is the first
  thing to check.
- Rooms live in memory. Restarting the service ends any unsaved session, which
  is why *Save session to GitHub* exists.
- A Pi with less than 1 GB of RAM is not really enough to build on. If you have
  one, build on your laptop and copy `.next` across instead.
