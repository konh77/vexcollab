/*
 * VEXCollab - finish GitHub sign-in.
 * Licensed under AGPL-3.0-only.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { setSession } from '@/lib/github/store';

const CLIENT_ID = process.env.VEXCOLLAB_GITHUB_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.VEXCOLLAB_GITHUB_CLIENT_SECRET ?? '';

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

function sameState(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Bounce back to the app with a message rather than a bare JSON error page. */
function back(url: URL, message?: string) {
  const target = new URL('/', url.origin);
  if (message) target.searchParams.set('github', message);
  return NextResponse.redirect(target.toString());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = readCookie(request, 'vexcollab_oauth_state');
  const sid = readCookie(request, 'vexcollab_sid');

  if (!CLIENT_ID || !CLIENT_SECRET) return back(url, 'not-configured');
  if (!code || !state || !expected || !sameState(state, expected)) return back(url, 'bad-state');
  if (!sid) return back(url, 'no-session');

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: `${url.protocol}//${url.host}/api/github/callback`,
      }),
    });
    const data = await tokenResponse.json();
    if (!data.access_token) return back(url, 'denied');

    const who = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${data.access_token}`,
        'User-Agent': 'VEXCollab',
      },
    }).then((r) => r.json());

    setSession(sid, {
      token: data.access_token,
      login: who.login,
      avatarUrl: who.avatar_url,
      createdAt: Date.now(),
    });

    const response = back(url, 'signed-in');
    // The state cookie has done its job; clear it.
    response.headers.append(
      'Set-Cookie',
      'vexcollab_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    );
    return response;
  } catch {
    return back(url, 'failed');
  }
}
