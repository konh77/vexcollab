# VEXCollab

Write VEX V5 Python together in your browser. Share a room with your team,
check your code, and connect a V5 brain over USB.

## Start here

**[Open VEXCollab → vex.konh.org](https://vex.konh.org)**

No installation or account is needed to edit together. Use desktop Chrome or
Edge if you want to connect a robot.

1. Open [vex.konh.org](https://vex.konh.org) and click **Start a room**.
2. Choose a template, such as **Starter**, **Competition**, or **Drivetrain**.
3. Click the **room code** at the top of the editor to copy its link. Send it to
   your teammates so they can join the same room.
4. Edit together. Everyone sees the shared files, changes, and cursors.

Already have a room? Open its link, or enter its code on the home page and click
**Join**. To work on an existing GitHub project, choose **From a GitHub repo**
when starting a room.

**Save before leaving:** rooms are temporary. Unsaved work is lost when the last
person leaves, the server restarts, or the room expires after inactivity. The
**Recent** list remembers room links, not your code. See [Save your work](#save-your-work).

![The VEXCollab editor, shared files, and robot panel](docs/img/editor.png)

## Connect a robot

You need a V5 brain, a USB data cable, and a supported desktop browser.
The robot connects to **your computer**, even when you use the hosted website.

1. Turn on the brain and connect it to your computer by USB.
2. Click **Connect USB** in the robot panel and select the VEX port.
3. To upload a program, build it in **VEXcode** first.
4. In **Upload**, choose the resulting **`.bin` file**, select a slot, and click
   **Upload**. Use the robot controls to run or stop the program.

**VEXCollab uploads compiled `.bin` files. It does not compile Python or upload
`.py` source directly to the brain.** Editing code in a room does not change an
already compiled `.bin`; rebuild it before uploading your changes.

For program output, open the terminal and click **Open user port**. The V5 uses
separate serial connections for robot commands and program output. Numeric
output such as `heading=12.4` can also be plotted as a live graph.

## Save your work

GitHub saving is an explicit action; live collaboration is not a backup.

1. Open the **GitHub** panel and sign in. On a self-hosted instance, the panel
   may ask for a GitHub token instead.
2. Choose the repository you want to work on **before editing**. Opening a
   repository loads its files into the room and can replace matching files.
3. Make your changes and enter a commit message in **What changed?**.
4. Click **Save session to GitHub** and wait for the success message before
   closing the room.

If you have already written code in a template room, copy it somewhere safe
before opening a repository. You can also keep a local copy by copying your
files into your own editor.

## Features

- **Shared editing:** multiple files, live cursors, and room links.
- **VEX-aware checks:** duplicate ports, invalid port numbers, and loops missing
  a `wait()`, plus Python syntax checks and autocomplete.
- **Templates:** Starter, Blank, Competition, Drivetrain, Vision sensor, and GPS sensor.
- **Project search:** find text across every file and jump to the result.
- **Robot tools:** compiled program upload, run/stop controls, terminal output,
  telemetry graphs, and brain information.
- **Personal settings:** editor themes, fonts, and optional GitHub Copilot.

### Keyboard shortcuts

Use **Ctrl** on Windows/Linux or **⌘** on macOS.

| Action | Shortcut |
| --- | --- |
| Search all files | Ctrl/⌘ + Shift + F |
| Open command palette | Ctrl/⌘ + K |
| Show or hide terminal | Ctrl/⌘ + J |
| Open settings | Ctrl/⌘ + , |

Ctrl/⌘ + S does **not** save a room to GitHub. Use **Save session to GitHub**.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| USB is unavailable | Use desktop Chrome or Edge, and open [vex.konh.org](https://vex.konh.org) or `localhost`. Plain HTTP Wi-Fi addresses cannot use Web Serial. |
| The brain is missing from the port picker | Check that the brain is on, use a USB data cable, and close other apps using the serial port. |
| No program output | Open the terminal's **user port** separately, then run a program that prints output. |
| Upload asks for a `.bin` | Compile the program in VEXcode first; a Python source file is not an uploadable program. |
| A room is full or the server is busy | Follow the displayed capacity message and try again when space is available. |
| A room has disappeared | Start another room and reopen your saved GitHub project. A room link cannot restore unsaved code. |
| The editor does not load | Check your internet connection; the editor loads external assets. GitHub and Copilot also require internet access. |

USB connection, identity, battery/firmware queries, and file transfer have been
checked on a real V5 brain. Python-source upload and screen capture were removed
after hardware testing. If another robot feature fails, [open an issue](https://github.com/konh77/vexcollab/issues)
with your browser, vexOS version, and the steps to reproduce it.

## Run on your computer

You can skip this section if you use [vex.konh.org](https://vex.konh.org).

Install **Node.js 20.9 or newer** and npm. Python 3 (`python3`) is needed for
server-side code checks; Git is needed for GitHub repository operations.

```bash
npx github:konh77/vexcollab
```

The first run installs dependencies and builds the app. Open the printed
`http://localhost:3000` link. Teammates on the same network can use the printed
Wi-Fi address; keep the server running while you work.

### Launcher options

| Option | Purpose |
| --- | --- |
| `--port 4000` | Use a different port. |
| `--password "your-room-password"` | Require a password to access your instance. |
| `--https` | Serve HTTPS for network clients; the generated certificate must be trusted on their computers for a secure connection. |
| `--copilot` | Enable the optional Copilot integration. |
| `--help` | Show launcher help. |

For Copilot, start with `--copilot`, then open **Settings → Copilot → Sign in**.
Each person uses their own GitHub account and Copilot access.

## Host your own instance

Use your own HTTPS domain to let teammates edit and connect their robots from
anywhere. The [Raspberry Pi deployment guide](deploy/pi/README.md) covers setup,
certificates, updates, and networking. Each robot still plugs into its user's
computer.

<details>
<summary>Server configuration and public-mode limits</summary>

Copy [`.env.example`](.env.example) to `.env.local` for local configuration.
The Pi installer uses `/etc/vexcollab.env`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Listen port | `3000` |
| `HOST` | Listen address; use `127.0.0.1` behind a reverse proxy | `0.0.0.0` |
| `VEXCOLLAB_PASSWORD` | Require a password | unset |
| `VEXCOLLAB_PUBLIC` | Set to `1` for public mode, which disables the password | off |
| `VEXCOLLAB_HTTPS` | Set to `1` to serve HTTPS directly | off |
| `VEXCOLLAB_TRUST_PROXY` | Set to `1` behind Caddy or nginx | off |
| `VEXCOLLAB_DATA_DIR` | Server-side repository checkouts and integration data | `./.vexcollab-data` |
| `VEXCOLLAB_GITHUB_CLIENT_ID` | Enable configured GitHub sign-in | unset |
| `VEXCOLLAB_GITHUB_CLIENT_SECRET` | GitHub OAuth app secret | unset |
| `VEXCOLLAB_COPILOT` | Set to `1` to enable Copilot | off |

The installer accepts `--public` for an instance without a password:

```bash
curl -fsSL https://raw.githubusercontent.com/konh77/vexcollab/main/deploy/pi/install.sh \
  | sudo bash -s -- your-domain.org --public
```

Public-mode capacity defaults:

| Variable | Default |
| --- | --- |
| `VEXCOLLAB_MAX_ROOMS` | 12 rooms |
| `VEXCOLLAB_MAX_PEERS_PER_ROOM` | 8 people per room |
| `VEXCOLLAB_MAX_CONNECTIONS` | 48 connections |
| `VEXCOLLAB_MAX_ROOMS_PER_IP` | 3 rooms created per IP |
| `VEXCOLLAB_ROOM_IDLE_MINUTES` | 30 minutes |
| `VEXCOLLAB_MAX_DOC_BYTES` | 2097152 bytes per room |
| `VEXCOLLAB_MAX_HEAP_MB` | 320 MB before refusing new rooms |

Live room documents are held in memory. GitHub checkouts and integration data
may be stored on the server; saving a room to GitHub commits and pushes its files.

</details>

## Develop from source

```bash
git clone https://github.com/konh77/vexcollab.git
cd vexcollab
npm ci
npm run dev
```

Open `http://localhost:3000`. For production, run `npm run build`, then `npm start`.
`server.mjs` serves the app and collaboration socket in one process.
See [CLAUDE.md](CLAUDE.md) for architecture and contributor notes.

## License and credits

[AGPL-3.0](LICENSE). If you host a modified version, make its corresponding
source available to users under the license.

Inspired by [CodeX](https://github.com/dulapahv/CodeX) (AGPL-3.0). Robot
communication uses [v5-serial-protocol](https://github.com/Jerrylum/v5-serial-protocol)
(MIT). See [NOTICE](NOTICE) for attribution.

VEXCollab is unofficial and is not affiliated with or endorsed by VEX Robotics.
It does not include VEX Robotics' proprietary software.
