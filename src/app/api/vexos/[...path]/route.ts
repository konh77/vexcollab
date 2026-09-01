/*
 * VEXCollab - vexOS pass-through.
 * Licensed under AGPL-3.0-only.
 *
 * The protocol library fetches firmware with XMLHttpRequest, and VEX's CDN
 * does not send CORS headers, so a browser cannot read it directly. This route
 * makes the request server-side and streams the response back on our own
 * origin.
 *
 * It is a pass-through at the user's request, not a mirror: nothing is stored,
 * cached, or re-hosted, and no VEX firmware is bundled in this repository. Only
 * the catalog file and version bundles are reachable.
 */
import { NextResponse } from 'next/server';

const VEXOS_ORIGIN = 'https://content.vexrobotics.com/vexos/public/V5/';

/** Only the two shapes the firmware flow asks for, and no path traversal. */
function isAllowed(name: string): boolean {
  if (name.includes('/') || name.includes('..')) return false;
  return name === 'catalog.txt' || /^[\w.-]+\.vexos$/.test(name);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const name = path.join('/');

  if (!isAllowed(name)) {
    return NextResponse.json({ error: 'Not a vexOS artefact' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(VEXOS_ORIGIN + name, { cache: 'no-store' });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach VEX: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `VEX returned ${upstream.status} for ${name}` },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type':
        name === 'catalog.txt' ? 'text/plain; charset=utf-8' : 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}
