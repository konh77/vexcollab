# VEXCollab

**Google Docs for VEX V5 Python.** Your team edits one file together in the browser,
then uploads it straight to the brain over USB. No IDE, no toolchain, no accounts.

```bash
npx github:ponpon77/vexcollab
```

That's it. It prints two links:

```
  On this computer   http://localhost:3000     ← the one plugged into the brain
  On your Wi-Fi      http://192.168.0.211:3000 ← send this to your team
```

Open the first, hit **Start a room**, send the link. Everyone types at once.

> **Needs Chrome, Edge, or Opera** for the USB parts (Safari and Firefox don't support
> WebSerial). Node 20+ to run it. First run takes ~2 minutes to build; after that, 2 seconds.

---

## What you get

**Write together**
- Everyone's cursor and selection, live, in their own colour with their name on it
- Shared file tree with folders
- Rooms are just links — no sign-up, nothing saved to disk, gone when everyone leaves

**Talk to the brain** — click *Connect USB*
- Battery, vexOS version, brain name, team number (edit them in place)
- Every smart port: what's plugged in, where, and its firmware
- Controller battery and radio status
- Upload your program to any slot, run it, stop it
- Screenshot the brain's screen
- Live terminal of everything your program prints, and type back to it
- Update vexOS

**Edit like an IDE**
- **VEX API completions** that know your variables — type `left_drive.` and get
  `spin_for`, `set_velocity`, `temperature` with real signatures, because it saw
  `left_drive = Motor(...)`
- **Live syntax checking** — red squiggles and a problem count before you upload,
  not after the program refuses to start on the field
- **Command palette** (⌘K) for files and actions, editor tabs, status bar,
  minimap, sticky scroll, bracket colouring, hover docs
- **Light, dark, or follow your system** — the whole app and the editor, applied
  before first paint so there's no white flash
- Editor preferences: font size, word wrap, minimap, line numbers
- ⌘J toggles the terminal. ⌘S does nothing on purpose — everything is already saved

**Ship it**
- Commit and push the room to a real GitHub repo, or pull your teammate's work in
- **Sign in with GitHub** (real OAuth), pick from your repositories or create one,
  and load it into the room. *Save session to GitHub* commits and pushes everything
  back. No OAuth app? A one-click token link works too

---

## GitHub Copilot

```bash
npx github:ponpon77/vexcollab --copilot
```

Then ⌘K → *Copilot: sign in*, and follow the device-flow code. Suggestions appear
as ghost text while you type.

Needs your own **Copilot subscription**. It runs GitHub's official
`@github/copilot-language-server` — the same server Neovim and Emacs use — as a
subprocess. VEXCollab never sees or stores your token; the language server owns it.
Off unless you pass the flag, so nobody spawns a process they didn't ask for.

## Sign in with GitHub (optional)

Without setup, GitHub works via a one-click token link. For a real
**Sign in with GitHub** button, register an OAuth app once:

1. https://github.com/settings/developers → **New OAuth App**
2. Homepage URL: `https://your-domain.org`
3. Authorization callback URL: `https://your-domain.org/api/github/callback`
4. Put the client id and secret in `/etc/vexcollab.env`:

```
VEXCOLLAB_GITHUB_CLIENT_ID=Ov23li...
VEXCOLLAB_GITHUB_CLIENT_SECRET=...
```

Then `sudo systemctl restart vexcollab`. Tokens are still held in memory only.

## Add a password

```bash
npx github:ponpon77/vexcollab --password pit22
```

Gates the page *and* the connection behind it. Do this if you're on school or venue Wi-Fi.

Other flags: `--port 4000`, `--https`, `--copilot`, `--help`.

---

## Three things to know

**USB needs a secure connection.** Browsers only expose WebSerial on `https://` or
`localhost`, so on a plain `http://192.168.x.x` link the brain panel is unavailable —
your teammate's Chrome supports it, the address disqualifies it. Editing is unaffected.

If someone else needs to use a brain from their own machine, start with TLS:

```bash
npx github:ponpon77/vexcollab --https
```

It generates a self-signed certificate covering your Wi-Fi address. Each browser shows a
warning once — click **Advanced → Proceed** — and the brain works from there on. Without
`--https`, the machine with the cable does the uploading.

**Folders work, but there's no `import`.** The V5 stores a program as one file, so
`import drive` can't work on the brain. Instead, every `.py` file is glued together at
upload time — modules first, `main.py` last:

```
main.py          ← runs last
lib/drive.py     ← its functions are just... available in main.py
lib/auton.py
```

A function in `lib/drive.py` is callable from `main.py` with no import line. The catch:
everything shares one namespace, so two files defining `reset()` will clash.

**The editor needs internet on first load.** Monaco is pulled from a CDN, so the very
first time a browser opens a room it needs a connection. Everything else — the
collaboration, the brain, uploads — is entirely local. If you're heading to a venue with
no Wi-Fi, open a room once at home on each laptop first so it's cached. Bundling Monaco
locally would remove this; it's not done yet.

---

## Does it actually work?

Straight answer, because robotics code that "should work" wastes your afternoon.

**Tested and working:** the editor, live cursors, multi-person sync, the file tree, the
password, the Wi-Fi sharing, the one-line install, Git commit/push/pull, and the
vexOS download path.

**Not yet run against a real brain:** everything in the Brain panel. It's built on a
proven, independent implementation of VEX's USB protocol, so the wire format isn't
guesswork — but the first upload deserves a brain you don't mind power-cycling. Two
specifics to watch:

1. **Python upload.** VEX's exact container for Python source isn't publicly documented.
   If your brain rejects the upload, *Runtime image (advanced)* lets you point at the
   runtime from your own VEXcode install.
2. **Screenshot colours.** If they come out with red and blue swapped, that's one
   constant in `src/lib/vex/screen.ts`.

Issues with hardware findings are very welcome — that's exactly the gap.

**Careful with vexOS updates.** Flashing rewrites the brain's boot image. Charged
battery, good cable, don't unplug. It's behind a two-step confirm for that reason.

---

## If a teammate's edits aren't showing up

The room shows a yellow bar and `offline` in the header whenever it isn't connected —
if you don't see that bar, you are connected and it's one of these instead:

- **Different rooms.** Both screens must show the *same room code* next to the logo. If
  you each clicked *Start a room*, you're in two separate rooms that look identical.
- **Only one computer runs the server.** Everyone else opens that machine's
  `http://<its-ip>:3000` link. If the second person also ran `npx …`, they're hosting
  their own server and sharing with nobody.
- **Different files.** Editing is per file — check you're both on `main.py`.
- **macOS blocked the connection.** If the page won't even load on the other machine,
  allow incoming connections for Node in System Settings → Network → Firewall.

## Host it for your team

Run it on a Raspberry Pi at your own domain and everyone just opens a link — no
install, no `npx`, and **every person can use their own brain**, because real HTTPS
makes WebSerial available in any visitor's browser.

See [`deploy/pi/README.md`](./deploy/pi/README.md). The short version:

```bash
curl -fsSL https://raw.githubusercontent.com/ponpon77/vexcollab/main/deploy/pi/install.sh | sudo bash -s -- your-domain.org
```

It sets up Caddy with a Let's Encrypt certificate, runs the app as a sandboxed
system user bound to localhost, generates a room password, and configures `ufw`,
key-only SSH, `fail2ban`, and automatic security updates. Forward **only 80 and
443** on your router.

The Pi stays idle: it serves the page and relays edits. The editor, the USB
connection, and the Python bundling all happen in each person's browser.

## Configuration

| Variable | Does what | Default |
| --- | --- | --- |
| `PORT` | Port to serve on | `3000` |
| `VEXCOLLAB_PASSWORD` | Require a password | none |
| `VEXCOLLAB_DATA_DIR` | Where room checkouts live | `./.vexcollab-data` |
| `VEXCOLLAB_TRUST_PROXY` | `1` when behind Caddy/nginx | off |
| `VEXCOLLAB_GITHUB_CLIENT_ID` | OAuth app id — enables *Sign in with GitHub* | off |
| `VEXCOLLAB_GITHUB_CLIENT_SECRET` | OAuth app secret — enables the full redirect flow | off |
| `VEXCOLLAB_HTTPS` | `1` serves TLS, so WebSerial works off-localhost | off |
| `VEXCOLLAB_COPILOT` | `1` enables GitHub Copilot suggestions | off |
| `VEXCOLLAB_TOOLCHAIN` | Folder holding `arm-none-eabi-g++` | auto-detected |

## From source

```bash
git clone https://github.com/ponpon77/vexcollab && cd vexcollab
npm install && npm run dev
```

`server.mjs` runs Next.js and the collaboration socket in one process. `src/lib/vex/`
is everything V5, `src/lib/collab/` is everything multiplayer. See
[CLAUDE.md](./CLAUDE.md) for the architecture and the traps.

## Licence

**AGPL-3.0.** Run a modified copy as a network service and you owe your users the source.

Takes its idea from [CodeX](https://github.com/dulapahv/CodeX) (AGPL-3.0) and is licensed
the same way in return. Brain communication is built on
[v5-serial-protocol](https://github.com/Jerrylum/v5-serial-protocol) (MIT).

**Contains nothing from VEX Robotics' software.** Their VS Code extension is proprietary
and its licence forbids decompiling and redistribution — none of that happened here.
Unofficial, and not affiliated with or endorsed by VEX Robotics. Full detail in [NOTICE](./NOTICE).
