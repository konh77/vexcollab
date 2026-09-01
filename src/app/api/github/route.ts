/*
 * VEXCollab - GitHub sign-in and repository access.
 * Licensed under AGPL-3.0-only.
 *
 * Two ways in, because OAuth device flow needs an app registration that not
 * everyone will have bothered with:
 *   - device flow, when VEXCOLLAB_GITHUB_CLIENT_ID is set
 *   - a fine-grained personal access token, pasted once
 *
 * Either way the token stays server-side in memory and is handed to git through
 * GIT_ASKPASS, never a command line or a stored remote URL.
 */
import { NextResponse } from 'next/server';
import {
  clearDeviceFlow,
  clearSession,
  getDeviceFlow,
  getSession,
  newSessionId,
  setDeviceFlow,
  setSession,
} from '@/lib/github/store';
import { openRepo, repoStatus, saveRepo, type RepoFile } from '@/lib/github/git';

const SID = 'vexcollab_sid';
const CLIENT_ID = process.env.VEXCOLLAB_GITHUB_CLIENT_ID ?? '';

function readSid(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SID) return rest.join('=');
  }
  return null;
}

function withSid(response: NextResponse, sid: string, request: Request) {
  const secure = request.headers.get('x-forwarded-proto') === 'https' || process.env.VEXCOLLAB_HTTPS === '1';
  response.headers.append(
    'Set-Cookie',
    `${SID}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure ? '; Secure' : ''}`,
  );
  return response;
}

async function gh(path: string, token: string, init?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'VEXCollab',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
}

export async function POST(request: Request) {
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  let sid = readSid(request);
  let issued = false;
  if (!sid) {
    sid = newSessionId();
    issued = true;
  }
  const session = getSession(sid);
  const reply = (data: unknown, status = 200) => {
    const response = NextResponse.json(data, { status });
    return issued ? withSid(response, sid!, request) : response;
  };

  try {
    switch (body.action) {
      case 'status':
        return reply({
          signedIn: Boolean(session),
          login: session?.login ?? null,
          avatarUrl: session?.avatarUrl ?? null,
          deviceFlowAvailable: Boolean(CLIENT_ID),
        });

      case 'signout':
        clearSession(sid);
        clearDeviceFlow(sid);
        return reply({ signedIn: false });

      // --- device flow ----------------------------------------------------
      case 'device-start': {
        if (!CLIENT_ID) return reply({ error: 'Device sign-in is not configured' }, 400);
        const response = await fetch('https://github.com/login/device/code', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: CLIENT_ID, scope: 'repo' }),
        });
        const data = await response.json();
        if (!data.device_code) return reply({ error: data.error_description ?? 'GitHub refused' }, 502);
        setDeviceFlow(sid, {
          deviceCode: data.device_code,
          interval: (data.interval ?? 5) * 1000,
          expiresAt: Date.now() + (data.expires_in ?? 900) * 1000,
        });
        return reply({
          userCode: data.user_code,
          verificationUri: data.verification_uri,
          interval: data.interval ?? 5,
        });
      }

      case 'device-poll': {
        const flow = getDeviceFlow(sid);
        if (!flow) return reply({ error: 'Start sign-in again' }, 400);
        const response = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            device_code: flow.deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });
        const data = await response.json();
        if (data.error === 'authorization_pending') return reply({ pending: true });
        if (data.error === 'slow_down') return reply({ pending: true, slowDown: true });
        if (!data.access_token) return reply({ error: data.error_description ?? 'Sign-in failed' }, 400);

        const who = await gh('/user', data.access_token).then((r) => r.json());
        setSession(sid, {
          token: data.access_token,
          login: who.login,
          avatarUrl: who.avatar_url,
          createdAt: Date.now(),
        });
        clearDeviceFlow(sid);
        return reply({ signedIn: true, login: who.login, avatarUrl: who.avatar_url });
      }

      // --- personal access token -------------------------------------------
      case 'token': {
        const token = String(body.token ?? '').trim();
        if (!token) return reply({ error: 'No token given' }, 400);
        const response = await gh('/user', token);
        if (!response.ok) return reply({ error: 'GitHub rejected that token' }, 401);
        const who = await response.json();
        setSession(sid, { token, login: who.login, avatarUrl: who.avatar_url, createdAt: Date.now() });
        return reply({ signedIn: true, login: who.login, avatarUrl: who.avatar_url });
      }

      // --- repositories -----------------------------------------------------
      case 'repos': {
        if (!session) return reply({ error: 'Sign in first' }, 401);
        const response = await gh(
          '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
          session.token,
        );
        if (!response.ok) return reply({ error: 'Could not list repositories' }, 502);
        const repos = (await response.json()) as any[];
        return reply({
          repos: repos.map((r) => ({
            fullName: r.full_name,
            cloneUrl: r.clone_url,
            private: r.private,
            updatedAt: r.updated_at,
          })),
        });
      }

      case 'create-repo': {
        if (!session) return reply({ error: 'Sign in first' }, 401);
        const name = String(body.name ?? '').trim();
        if (!/^[\w.-]{1,100}$/.test(name)) return reply({ error: 'Invalid repository name' }, 400);
        const response = await gh('/user/repos', session.token, {
          method: 'POST',
          body: JSON.stringify({
            name,
            private: body.private !== false,
            auto_init: true,
            description: 'VEX V5 project — created from VEXCollab',
          }),
        });
        const data = await response.json();
        if (!response.ok) return reply({ error: data.message ?? 'Could not create repository' }, 400);
        return reply({ fullName: data.full_name, cloneUrl: data.clone_url });
      }

      // --- room <-> repo ----------------------------------------------------
      case 'repo-status':
        return reply(await repoStatus(String(body.roomId ?? '')));

      case 'open': {
        if (!session) return reply({ error: 'Sign in first' }, 401);
        const { files, branch } = await openRepo(
          String(body.roomId ?? ''),
          String(body.cloneUrl ?? ''),
          session.token,
        );
        return reply({ files, branch });
      }

      case 'save': {
        if (!session) return reply({ error: 'Sign in first' }, 401);
        const result = await saveRepo(
          String(body.roomId ?? ''),
          (body.files ?? []) as RepoFile[],
          String(body.message ?? '').trim() || 'Update from VEXCollab',
          session.token,
          { name: session.login, email: `${session.login}@users.noreply.github.com` },
        );
        return reply(result);
      }

      default:
        return reply({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    // git puts the useful part on stderr; strip anything token-shaped just in case.
    const message = (err.stderr || err.message || 'Failed').replace(/gh[pousr]_[A-Za-z0-9]+/g, '***');
    return reply({ error: message.trim() }, 500);
  }
}
