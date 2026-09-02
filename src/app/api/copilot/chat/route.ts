/*
 * VEXCollab - Copilot chat endpoint.
 * Licensed under AGPL-3.0-only.
 */
import { NextResponse } from 'next/server';
import { chatFor } from '@/lib/copilot/chat';
import { copilotEnabled } from '@/lib/copilot/bridge';
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
  if (!copilotEnabled()) {
    return NextResponse.json({ enabled: false, error: 'Copilot is not enabled on this server' });
  }

  let body: { prompt?: string; context?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const sid = readSid(request) ?? newSessionId();
  const chat = chatFor(sid);

  try {
    if (body.action === 'history') {
      return NextResponse.json({ enabled: true, messages: chat.transcript });
    }

    const prompt = (body.prompt ?? '').trim();
    if (!prompt) return NextResponse.json({ error: 'Nothing to ask' }, { status: 400 });

    const reply = await chat.ask(prompt, body.context);
    return NextResponse.json({ enabled: true, reply, messages: chat.transcript });
  } catch (error) {
    // ACP is a preview; surface what actually went wrong rather than a shrug.
    const message = error instanceof Error ? error.message : 'Chat failed';
    return NextResponse.json(
      { enabled: true, error: message, detail: chat.lastError ?? undefined },
      { status: 500 },
    );
  }
}
