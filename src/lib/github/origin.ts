/*
 * VEXCollab - the address the browser used to reach this server.
 * Licensed under AGPL-3.0-only.
 *
 * Behind Caddy, `request.url` is the app's own internal address
 * (https://localhost:3000), not vex.konh.org. Sending that to GitHub as the
 * OAuth redirect_uri is refused -- "The redirect_uri is not associated with
 * this application" -- and, after sign-in, would bounce the user to localhost.
 * Caddy forwards the real host and scheme in X-Forwarded-*, so use those.
 */

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export function publicOrigin(request: Request): string {
  // An explicit address always wins: it is what was registered with GitHub.
  const configured = process.env.VEXCOLLAB_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const own = new URL(request.url);
  const first = (name: string) => request.headers.get(name)?.split(',')[0]?.trim() || null;

  // Both come off a header a client could set, so only accept plausible values
  // rather than splice anything into a URL we hand to GitHub.
  const host = first('x-forwarded-host') ?? first('host');
  const proto = first('x-forwarded-proto');

  return `${proto === 'http' || proto === 'https' ? proto : own.protocol.replace(':', '')}://${
    host && HOST.test(host) ? host : own.host
  }`;
}
