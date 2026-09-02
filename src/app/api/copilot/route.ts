/*
 * VEXCollab - Copilot endpoints, one language server per person.
 * Licensed under AGPL-3.0-only.
 */
import { NextResponse } from 'next/server';
import { copilotEnabled, copilotFor, copilotSessionCount } from '@/lib/copilot/bridge';
import { newSessionId } from '@/lib/github/store';

const SID = 'vexcollab_sid';

function readSid(request: Request): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SID) return rest.join('=');
  }
  return null;
}

export async function POST(request: Request) {
  let body: { action?: string; uri?: string; text?: string; line?: number; character?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (!copilotEnabled()) {
    return NextResponse.json({
      enabled: false,
      running: false,
      signedIn: false,
      kind: 'Disabled',
      message: '',
    });
  }

  // The session cookie is what keeps one person's Copilot separate from the
  // next person's; without it we would be back to a shared account.
  let sid = readSid(request);
  let issued = false;
  if (!sid) {
    sid = newSessionId();
    issued = true;
  }

  const copilot = copilotFor(sid);
  const reply = (data: unknown, status = 200) => {
    const response = NextResponse.json(data, { status });
    if (issued) {
      const secure =
        request.headers.get('x-forwarded-proto') === 'https' || process.env.VEXCOLLAB_HTTPS === '1';
      response.headers.append(
        'Set-Cookie',
        `${SID}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure ? '; Secure' : ''}`,
      );
    }
    return response;
  };

  try {
    switch (body.action) {
      case 'status': {
        let startError: string | undefined;
        await copilot.start().catch((error: Error) => {
          startError = error.message;
        });
        return reply({
          ...copilot.status(),
          activeSessions: copilotSessionCount(),
          error: startError ?? copilot.status().error,
        });
      }

      case 'signin':
        return reply(await copilot.signIn());

      case 'signout':
        return reply(await copilot.signOut());

      case 'complete': {
        if (!copilot.status().signedIn) return reply({ items: [] });
        const items = await copilot.complete(
          body.uri ?? 'file:///main.py',
          body.text ?? '',
          body.line ?? 0,
          body.character ?? 0,
        );
        return reply({ items });
      }

      default:
        return reply({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (error) {
    return reply(
      { error: error instanceof Error ? error.message : 'Copilot failed' },
      500,
    );
  }
}
