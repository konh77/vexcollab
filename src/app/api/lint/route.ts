/*
 * VEXCollab - Python syntax checking.
 * Licensed under AGPL-3.0-only.
 *
 * Uses the python3 already on the machine to compile the source without running
 * it. `compile()` executes nothing — it only parses — so this cannot run user
 * code, and it catches the class of mistake that otherwise only shows up as a
 * program that refuses to start on the field.
 *
 * It is a syntax check, not a type checker: it will not know that `Motor` takes
 * three arguments.
 */
import { execFile } from 'node:child_process';
import { NextResponse } from 'next/server';

const CHECKER = `
import sys, json
source = sys.stdin.read()
try:
    compile(source, "<program>", "exec")
    print(json.dumps({"ok": True, "problems": []}))
except SyntaxError as e:
    print(json.dumps({"ok": True, "problems": [{
        "line": e.lineno or 1,
        "column": e.offset or 1,
        "message": e.msg or "Syntax error",
    }]}))
except ValueError as e:
    print(json.dumps({"ok": True, "problems": [{"line": 1, "column": 1, "message": str(e)}]}))
`;

export async function POST(request: Request) {
  let source: string;
  try {
    ({ source } = await request.json());
    if (typeof source !== 'string') throw new Error('no source');
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (source.length > 500_000) {
    return NextResponse.json({ available: true, problems: [] });
  }

  const result = await new Promise<{ available: boolean; problems: unknown[] }>((resolve) => {
    const child = execFile(
      'python3',
      ['-c', CHECKER],
      { timeout: 5000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        // No python3 on this machine: report unavailable rather than pretending
        // the file is clean.
        if (error && !stdout) return resolve({ available: false, problems: [] });
        try {
          const parsed = JSON.parse(stdout);
          resolve({ available: true, problems: parsed.problems ?? [] });
        } catch {
          resolve({ available: false, problems: [] });
        }
      },
    );
    child.stdin?.end(source);
  });

  return NextResponse.json(result);
}
