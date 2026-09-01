# Vendored: `v5-serial-protocol`

The TypeScript files in this directory are **not** original to VEXCollab. They are
vendored verbatim from:

- Project: [`Jerrylum/v5-serial-protocol`](https://github.com/Jerrylum/v5-serial-protocol)
- Copyright: (c) 2022 Jerry Lum
- License: MIT (see `./LICENSE` in this directory)

They are included in-tree rather than pulled from npm because the project is not
published to the npm registry.

## Why vendored code at all

VEXCollab talks to a VEX V5 brain over the WebSerial API. That requires an exact,
byte-level implementation of VEX's host↔device packet protocol (framing, CRC16,
file transfer, program slots, screen capture). This library is an independent MIT
implementation of that protocol.

It is deliberately **not** derived from VEX Robotics' own VS Code extension, whose
license forbids decompiling, reverse engineering, or disassembling the software. No
code, resource, or binary from that extension is used anywhere in this repository.

## Local modifications

Exactly one, applied mechanically to every file: a leading

```ts
// @ts-nocheck -- vendored upstream source; see VENDORED.md
```

The upstream source was written against TypeScript 4.7, and today's `lib.dom`
makes `DataView` generic, so `class PacketView extends DataView` no longer
type-checks. The logic is unaffected — these are compile-time complaints about
a runtime-correct implementation — and suppressing them keeps the rest of the
repo on `strict: true`. Excluding the directory in `tsconfig.json` would not
work, since TypeScript still checks files reached through imports.

Apart from that line, the files are byte-identical to upstream so they stay
easy to diff and update. All VEXCollab-specific behaviour lives one level up in
`src/lib/vex/`, which wraps this library rather than editing it.

MIT is compatible with this project's AGPL-3.0 license; the MIT notice above and
the `LICENSE` file are retained as MIT requires.
