# CLAUDE.md

Notes for Claude Code working in this repo.

## What this is

A single Next.js app: a collaborative editor for VEX V5 Python that also talks to a
V5 brain over WebSerial. One process serves both the web app and the collaboration
socket (`server.mjs`), so there is no second service to start.

## Commands

```bash
npm run dev        # custom server: Next + Socket.IO on :3000
npm run build      # production build
npm start          # production server
npm run typecheck  # tsc --noEmit — run this before claiming a change compiles
```

There is no test suite yet. `npm run typecheck` plus a manual pass in the browser
is the current bar. For collaboration changes, that means **two** browser windows
on the same room URL.

## Layout

| Path | What lives there |
| --- | --- |
| `server.mjs` | Next + Socket.IO relay. Owns the authoritative `Y.Doc` per room, in memory. |
| `src/lib/collab/` | Client half of collaboration: `CollabProvider`, identity, the shared file model. |
| `src/lib/vex/` | Everything V5: `session.ts` (observable brain store), `terminal.ts` (user serial port), `screen.ts` (framebuffer), `program.ts` (payload + starter files). |
| `src/lib/v5-serial-protocol/` | **Vendored third-party code. Do not edit.** |
| `src/components/` | UI. `Workspace` is the shell; `BrainPanel` is the right rail; `EditorPane` is Monaco + Yjs. |

## Rules that matter here

**Never take anything from VEX Robotics' software.** The VEX VS Code extension
(there is an unpacked copy in the parent directory of this repo) is under a
proprietary license that forbids decompiling, reverse engineering, and
redistribution. Do not read its bundles for reference, do not port logic from it,
do not copy its assets. Protocol work goes through the vendored MIT library or
public documentation only. This is not a style preference — it is the condition
under which this project is legal to publish.

**Do not edit `src/lib/v5-serial-protocol/`.** It is vendored verbatim from an MIT
project so it stays diffable against upstream. The only local change is a
`@ts-nocheck` pragma per file. Anything VEXCollab-specific belongs in
`src/lib/vex/`, which wraps it. See that directory's `VENDORED.md`.

**This project is AGPL-3.0.** New dependencies must be license-compatible
(MIT/BSD/Apache-2.0/LGPL are fine; anything proprietary or GPL-incompatible is
not). Keep `NOTICE` current when adding third-party code.

## Things that will bite you

- **Monaco touches `window` on import.** `EditorPane` is loaded through
  `next/dynamic` with `ssr: false` in `Workspace.tsx`. Importing it statically
  brings back a server-side `ReferenceError`.
- **A V5 exposes two USB serial interfaces.** One speaks the packet protocol
  (`V5Session`), the other is a plain stream of program output (`V5Terminal`).
  They are opened independently and a port cannot be opened twice — code that
  assumes a single connection will break the terminal during uploads.
- **Yjs update echo.** `CollabProvider` passes itself as the transaction origin
  for network-applied updates and skips re-broadcasting those. Dropping that check
  creates an infinite loop between peers.
- **WebSerial is Chromium-only and needs a user gesture.** `navigator.serial`
  is undefined in Safari/Firefox; `V5Session` reports `connectionState:
  'unsupported'` and the panel degrades. Keep that path working.
- **Rooms are memory-only.** Restarting the dev server wipes every room. That is
  intentional, not a bug to fix.

## Conventions

- TypeScript strict, no `any` in new code.
- `'use client'` on anything touching Yjs, Monaco, or WebSerial.
- Tailwind v4 with the theme tokens in `src/app/globals.css` (`bg-panel`,
  `text-ink-dim`, `border-edge`, `text-vex`…). Use the tokens, not raw hex.
- Comments explain *why*, not *what*. The existing files set the density — match it.
- Hardware behaviour that has not been verified against a real brain should say so
  in a comment or in the README's status section rather than being asserted.
