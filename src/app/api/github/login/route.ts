/*
 * VEXCollab - start GitHub sign-in (OAuth authorization code flow).
 * Licensed under AGPL-3.0-only.
 *
 * The proper "Sign in with GitHub" button: bounce to GitHub, come back signed
 * in. Needs an OAuth App (client id + secret). Without one configured, the app
 * still offers device flow or a pasted token.
 */
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { newSessionId } from '@/lib/github/store';

const CLIENT_ID = process.env.VEXCOLLAB_GITHUB_CLIENT_ID ?? '';

function cookie(name: string, value: string, secure: boolean, maxAge = 600) {
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export async function GET(request: Request) {
  if (!CLIENT_ID) {
    return NextResponse.json(
      { error: 'GitHub sign-in is not configured on this server' },
      { status: 501 },
    );
  }

  const url = new URL(request.url);
  const secure = url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';

  // A random state, echoed back by GitHub, is what stops someone else's
  // callback from being replayed into this browser.
  const state = randomBytes(16).toString('hex');
  const sid = readCookie(request, 'vexcollab_sid') ?? newSessionId();

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', CLIENT_ID);
  authorize.searchParams.set('scope', 'repo');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set(
    'redirect_uri',
    `${url.protocol}//${url.host}/api/github/callback`,
  );

  const response = NextResponse.redirect(authorize.toString());
  response.headers.append('Set-Cookie', cookie('vexcollab_oauth_state', state, secure));
  response.headers.append('Set-Cookie', cookie('vexcollab_sid', sid, secure, 86400));
  return response;
}
