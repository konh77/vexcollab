/*
 * VEXCollab - static analysis of a V5 Python project.
 * Licensed under AGPL-3.0-only.
 *
 * Runs Python's own `ast` module over the project. Parsing only — nothing is
 * executed — so this is safe to run on every keystroke-ish interval.
 *
 * The interesting output is VEX-specific: which smart port each device is
 * declared on, which ports collide, and the mistakes that cost a match
 * (a `while True` with no `wait()` locks the brain hard enough to need a
 * power cycle).
 */
import { execFile } from 'node:child_process';
import { NextResponse } from 'next/server';

const ANALYSER = String.raw`
import ast, json, sys

payload = json.loads(sys.stdin.read())
files = payload.get("files", [])

DEVICE_CLASSES = {
    "Motor", "MotorGroup", "Inertial", "Distance", "Optical", "Rotation",
    "Vision", "GPS", "Bumper", "Limit", "Encoder", "Sonar", "Pneumatic",
    "AddressableLed", "Electromagnet", "Touchled", "Gyro", "Accelerometer",
    "Potentiometer", "LineSensor", "LightSensor",
}
BLOCKING_CALLS = {"wait", "sleep", "spin_for", "drive_for", "turn_for", "spin_to_position"}

devices, warnings, functions, edges = [], [], [], []

def port_of(node):
    """Ports.PORT7 -> 7"""
    for arg in node.args:
        if isinstance(arg, ast.Attribute) and arg.attr.startswith("PORT"):
            try:
                return int(arg.attr[4:])
            except ValueError:
                return None
    return None

def has_blocking_call(node):
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            f = child.func
            name = getattr(f, "id", None) or getattr(f, "attr", None)
            if name in BLOCKING_CALLS:
                return True
    return False

for entry in files:
    path, source = entry.get("path", "?"), entry.get("contents", "")
    if not path.endswith(".py"):
        continue
    try:
        tree = ast.parse(source, path)
    except SyntaxError as e:
        warnings.append({
            "file": path, "line": e.lineno or 1, "rule": "syntax",
            "severity": "error", "message": e.msg or "Syntax error",
        })
        continue

    for node in ast.walk(tree):
        # device declarations
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            cls = getattr(node.value.func, "id", None)
            if cls in DEVICE_CLASSES:
                target = node.targets[0]
                devices.append({
                    "name": getattr(target, "id", "?"),
                    "type": cls,
                    "port": port_of(node.value),
                    "file": path,
                    "line": node.lineno,
                })

        # while True with nothing that yields time
        if isinstance(node, ast.While):
            forever = (isinstance(node.test, ast.Constant) and node.test.value is True)
            if forever and not has_blocking_call(node):
                warnings.append({
                    "file": path, "line": node.lineno, "rule": "busy-loop",
                    "severity": "error",
                    "message": "while True with no wait() — this starves the brain and needs a power cycle",
                })

        # call graph
        if isinstance(node, ast.FunctionDef):
            functions.append({"name": node.name, "file": path, "line": node.lineno})
            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    callee = getattr(child.func, "id", None)
                    if callee:
                        edges.append({"from": node.name, "to": callee})

# duplicate ports
by_port = {}
for d in devices:
    if d["port"] is not None:
        by_port.setdefault(d["port"], []).append(d)
for port, group in sorted(by_port.items()):
    if len(group) > 1:
        warnings.append({
            "file": group[1]["file"], "line": group[1]["line"], "rule": "port-conflict",
            "severity": "error",
            "message": "Port %d is claimed by %s" % (port, " and ".join(d["name"] for d in group)),
        })
    if not (1 <= port <= 21):
        warnings.append({
            "file": group[0]["file"], "line": group[0]["line"], "rule": "port-range",
            "severity": "error", "message": "Port %d does not exist — the V5 has 1 to 21" % port,
        })

# names defined in more than one file collide once bundled
seen = {}
for f in functions:
    seen.setdefault(f["name"], []).append(f)
for name, group in seen.items():
    if len({g["file"] for g in group}) > 1:
        warnings.append({
            "file": group[-1]["file"], "line": group[-1]["line"], "rule": "name-collision",
            "severity": "warning",
            "message": "%s is defined in %s — upload bundles them into one namespace, so the last one wins"
                       % (name, " and ".join(sorted({g["file"] for g in group}))),
        })

defined = {f["name"] for f in functions}
print(json.dumps({
    "devices": sorted(devices, key=lambda d: (d["port"] is None, d["port"] or 0)),
    "warnings": warnings,
    "functions": functions,
    "edges": [e for e in edges if e["to"] in defined],
}))
`;

export async function POST(request: Request) {
  let files: { path: string; contents: string }[];
  try {
    ({ files } = await request.json());
    if (!Array.isArray(files)) throw new Error('bad');
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const result = await new Promise<Record<string, unknown>>((resolve) => {
    const child = execFile(
      'python3',
      ['-c', ANALYSER],
      { timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) return resolve({ available: false });
        try {
          resolve({ available: true, ...JSON.parse(stdout) });
        } catch {
          resolve({ available: false });
        }
      },
    );
    child.stdin?.end(JSON.stringify({ files }));
  });

  return NextResponse.json(result);
}
