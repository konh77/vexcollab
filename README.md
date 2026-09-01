# VEXCollab

A real-time collaborative code editor for **VEX V5 Python** that talks to the robot
brain from the browser — no desktop IDE, no toolchain, no accounts.

Your whole team opens one link and types in the same file with live cursors. When
you are ready, the same tab connects to a V5 brain over USB (WebSerial), uploads
your program to a slot, runs it, and streams whatever it prints back into a
terminal panel.

The V5 runs Python on-board, which is what makes this possible: there is no compile
step to shell out to, so the entire edit → upload → run loop fits in a web page.

## Run it

One line, on any machine with Node 20+:

```bash
npx github:ponpon77/vexcollab
```

It builds on first run, then prints the links to share:

```
  On this computer   http://localhost:3000
  On your Wi-Fi      http://192.168.0.211:3000
```

Anyone on the same Wi-Fi opens that second link and is in the room. To require a
password:

```bash
npx github:ponpon77/vexcollab --password pit22
```

Other flags: `--port 4000`, `--help`. From a clone, `npm install && npm run dev`
does the same thing.

> **The brain only works from `http://localhost`.** Browsers refuse USB access on
> plain-http LAN addresses, so teammates can edit from anywhere on the Wi-Fi, but
> the machine with the cable does the uploading. That is a browser security rule,
> not something this app can opt out of.

---

## What's in it

**Collaboration**
- Multiple people editing the same files, with live remote cursors and selections —
  everyone's caret shows in their own colour with their name on it
- Shared file tree with folders — add and delete files, everyone sees it instantly
- Optional password (`--password` or `VEXCOLLAB_PASSWORD`) gating both the page and
  the collaboration socket
- Rooms are just links. No sign-up, and nothing is written to disk: a room lives in
  server memory and disappears when the last person leaves
- Conflict-free merging via [Yjs](https://github.com/yjs/yjs) CRDTs over Socket.IO

**The brain, connected natively**
- Connect over USB with the Web Serial API — no extension, no native helper
- Live brain state: vexOS and CPU versions, battery and charge state, unique ID,
  brain name and team number (both editable inline)
- Every device in the smart ports, with port number, type, and firmware version
- Controller battery and radio status (VEXnet/Bluetooth, channel, latency)
- Program slots: list what's on the brain, run a slot, stop the running program
- Upload `main.py` straight into a slot with a name, description, and progress
- Update vexOS, fetched live from VEX's own release catalogue
- Capture the brain's LCD as a PNG
- A user-port terminal: your program's output, and stdin back to it

**Project workflow**
- **Folders and modules.** The V5 has no module system for user code — a program is
  a single payload, so `import drive` cannot resolve on the brain. VEXCollab bundles
  instead: every `.py` file is concatenated at upload time, modules first (path
  order) and `main.py` last, sharing one global namespace. So a function in
  `lib/drive.py` is callable from `main.py` with no import line. Names are global,
  so two files defining `reset()` will collide — last one wins.
- **Git.** Commit the room to a real repository and push it, or pull a teammate's
  work back into the room. It shells out to your own `git` with whatever credentials
  your credential helper or SSH agent already has — no tokens are asked for or
  stored. Set `VEXCOLLAB_PROJECT_DIR` to choose the working directory (default
  `./vex-project`).

## Requirements

WebSerial only exists in Chromium browsers, so **Chrome, Edge, or Opera on desktop**
for anything involving the brain. Safari and Firefox have not shipped the API and
have no plans to. The editor half works everywhere.

Node 20+ to run the server.

## How it fits together

```
server.mjs                Next.js + a Socket.IO relay in one process.
                          Holds the authoritative Y.Doc per room in memory.

src/lib/collab/           Client side of that: CollabProvider wires a Y.Doc and
                          awareness to the socket. Small on purpose — the server
                          hands a joiner the whole document in the join ack
                          instead of running a sync handshake.

src/lib/vex/              Everything V5. `session.ts` is an observable store over
                          the brain; `terminal.ts` owns the *other* USB serial
                          interface so the console keeps working during uploads;
                          `screen.ts` decodes the framebuffer.

src/lib/v5-serial-protocol/   Vendored MIT protocol implementation. See
                              VENDORED.md in that directory.

src/components/           UI. EditorPane is Monaco + y-monaco + per-client cursor
                          colours; BrainPanel is the whole right-hand rail.
```

A V5 brain enumerates **two** USB serial interfaces. One carries the packet
protocol (system info, file transfer, program control); the other is a plain
115200-baud stream carrying `print()` output. VEXCollab opens them separately, so
uploading does not interrupt the terminal.

## Status — what is and isn't verified

Being straight about this, because robotics code that "probably works" wastes
everyone's afternoon.

**Verified working:** the collaborative editor, multi-peer sync, live cursors, the
file tree, room lifecycle, and the production build. Tested with multiple
simultaneous clients.

**Written against a documented protocol but not yet run against real hardware:**
everything in the Brain panel. It was developed without a V5 on the desk. The
protocol layer underneath is a real, independently-tested MIT implementation, so
the wire format is not guesswork — but the specific flows (upload, screen capture,
program control) deserve a careful first run with a brain you don't mind
power-cycling.

Two things to watch on that first run:

1. **Python program packaging.** The brain stores a program as a payload plus an
   `.ini` descriptor, and VEXcode's exact container for Python source is not
   publicly documented. VEXCollab writes the UTF-8 source as the payload. If your
   brain rejects it, the *Runtime image (advanced)* field in the upload section
   lets you point at the shared runtime image from your own VEXcode install — it
   is read locally and never bundled or redistributed here.
2. **Framebuffer channel order.** Screen capture assumes 32-bit little-endian
   pixels (B, G, R, unused) on a 512-pixel stride. If your screenshots come out
   with swapped colours, that constant is one line in `src/lib/vex/screen.ts`.

Issues and PRs with hardware findings are very welcome — that is exactly the gap.

**vexOS updates** go through `/api/vexos/*`, which proxies VEX's public release
catalogue server-side. VEX's CDN sends no CORS headers, so a browser cannot read it
directly. The route is a pass-through at your request — nothing is cached, stored, or
re-hosted, only `catalog.txt` and `*.vexos` are reachable, and no VEX firmware is
bundled in this repository. Flashing is behind a two-step confirmation because an
interrupted flash can leave a brain unbootable.

**Known limitation:** Monaco is loaded from a CDN by `@monaco-editor/react`, so the
first load of a room needs internet even though everything else is local. Bundling
Monaco's workers locally is the fix; it is not done yet.

## Licensing, honestly

VEXCollab is **AGPL-3.0**. If you run a modified copy as a network service, you owe
your users the source.

It takes its product idea from [CodeX](https://github.com/dulapahv/CodeX) by
Dulapah Vibulsanti, which is AGPL-3.0, and is licensed the same way in return.

It contains **nothing** from VEX Robotics' own software. The VEX VS Code extension
is proprietary and its license forbids decompiling, reverse engineering, and
redistribution — so none of that happened here. Brain communication is built on an
independent MIT implementation of the USB protocol.

Full detail in [`NOTICE`](./NOTICE).

VEXCollab is unofficial and not affiliated with or endorsed by VEX Robotics.
