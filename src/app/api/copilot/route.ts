/*
 * VEXCollab - Copilot endpoints.
 * Licensed under AGPL-3.0-only.
 */
import { NextResponse } from 'next/server';
import { copilot } from '@/lib/copilot/bridge';

export async function POST(request: Request) {
  let body: { action?: string; uri?: string; text?: string; line?: number; character?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (!copilot.enabled) {
    return NextResponse.json({ enabled: false, running: false, signedIn: false, kind: 'Disabled', message: '' });
  }

  try {
    switch (body.action) {
      case 'status': {
        // Starting is idempotent; this makes the first status call boot it.
        // A failure here is reported, not swallowed — a silently dead bridge
        // looks identical to "Copilot has no suggestions".
        let startError: string | undefined;
        await copilot.start().catch((error: Error) => {
          startError = error.message;
        });
        return NextResponse.json({ ...copilot.status(), error: startError ?? copilot.status().error });
      }

      case 'signin':
        return NextResponse.json(await copilot.signIn());

      case 'signout':
        return NextResponse.json(await copilot.signOut());

      case 'complete': {
        if (!copilot.status().signedIn) return NextResponse.json({ items: [] });
        const items = await copilot.complete(
          body.uri ?? 'file:///main.py',
          body.text ?? '',
          body.line ?? 0,
          body.character ?? 0,
        );
        return NextResponse.json({ items });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Copilot failed' },
      { status: 500 },
    );
  }
}
