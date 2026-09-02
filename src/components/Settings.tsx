/*
 * VEXCollab - settings sheet.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useState } from 'react';
import { loadIdentity, saveIdentity } from '@/lib/collab/identity';
import { loadPrefs, savePrefs, type Prefs } from '@/lib/editor/prefs';
import { TrafficLights } from './TrafficLights';

type ApiResult = Record<string, any>;

const COLORS = ['#ff3b30', '#ff9500', '#34c759', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#0071e3'];

async function github(action: string, extra: Record<string, unknown> = {}): Promise<ApiResult> {
  const response = await fetch('/api/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  return (await response.json()) as ApiResult;
}

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[3]);
  const [login, setLogin] = useState<string | null>(null);
  const [deviceFlow, setDeviceFlow] = useState(false);
  const [sso, setSso] = useState(false);
  const [code, setCode] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [pat, setPat] = useState('');
  const [copilot, setCopilot] = useState<string>('off');
  const [copilotCode, setCopilotCode] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  useEffect(() => {
    if (!open) return;
    const identity = loadIdentity();
    setName(identity.name);
    setColor(identity.color);
    setPrefs(loadPrefs());

    void github('status').then((s) => {
      setLogin(s.signedIn ? s.login : null);
      setDeviceFlow(Boolean(s.deviceFlowAvailable));
      setSso(Boolean(s.ssoAvailable));
    }).catch(() => undefined);

    void fetch('/api/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    })
      .then((r) => r.json())
      .then((s: ApiResult) => setCopilot(!s.enabled ? 'off' : s.signedIn ? 'signed in' : 'sign-in needed'))
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const copilotSignIn = async () => {
    const result: ApiResult = await fetch('/api/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signin' }),
    })
      .then((r) => r.json())
      .catch(() => ({}));

    if (result.error) return setNote(result.error);
    if (!result.userCode) return setNote('Copilot did not return a code');

    setCopilotCode({
      userCode: result.userCode,
      verificationUri: result.verificationUri ?? 'https://github.com/login/device',
    });

    // The server polls GitHub in the background; watch its status until the
    // sign-in lands rather than making the user press anything again.
    const deadline = Date.now() + 15 * 60 * 1000;
    const poll = async () => {
      if (Date.now() > deadline) return setCopilotCode(null);
      const status: ApiResult = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      })
        .then((r) => r.json())
        .catch(() => ({}));
      if (status.signedIn) {
        setCopilotCode(null);
        setCopilot('signed in');
        return;
      }
      setTimeout(poll, 5000);
    };
    setTimeout(poll, 5000);
  };

  if (!open) return null;

  const commit = () => {
    saveIdentity({ name: name.trim() || 'Anonymous', color });
    onClose();
    // Awareness state is set when a room provider is built, so a reload is the
    // honest way to apply a new name to a room already open.
    if (window.location.pathname.startsWith('/room/')) window.location.reload();
  };

  const startDeviceFlow = async () => {
    const result = await github('device-start');
    if (result.error) return setNote(result.error);
    setCode({ userCode: result.userCode, verificationUri: result.verificationUri });
    const deadline = Date.now() + 15 * 60 * 1000;
    let wait = (result.interval ?? 5) * 1000;
    const poll = async () => {
      if (Date.now() > deadline) return setCode(null);
      const status = await github('device-poll').catch(() => ({ pending: true }) as ApiResult);
      if (status.signedIn) {
        setCode(null);
        setLogin(status.login);
        return;
      }
      if (status.error) {
        setCode(null);
        setNote(status.error);
        return;
      }
      if (status.slowDown) wait += 5000;
      setTimeout(poll, wait);
    };
    setTimeout(poll, wait);
  };

  const useToken = async () => {
    const result = await github('token', { token: pat });
    if (result.signedIn) {
      setLogin(result.login);
      setPat('');
      setNote(null);
    } else {
      setNote(result.error ?? 'That token did not work');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[10vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[520px] max-w-[92vw] overflow-hidden rounded-xl bg-panel-raised shadow-[0_24px_70px_rgba(0,0,0,0.3)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="vc-vibrancy flex items-center gap-3 border-b border-edge px-3 py-2.5">
          <TrafficLights onClose={onClose} />
          <span className="flex-1 text-center text-[13px] font-medium">Settings</span>
          <span className="w-12" />
        </div>

        <div className="vc-scroll max-h-[70vh] space-y-6 overflow-y-auto p-5">
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">You</h3>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              className="w-full rounded-lg border border-edge bg-shell px-3 py-2 text-sm outline-none focus:border-vex"
            />
            <div className="mt-2 flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`size-6 rounded-full transition ${
                    c === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-panel-raised' : ''
                  }`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-dim">This is the cursor your team sees.</p>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              Appearance
            </h3>
            <div className="flex gap-1.5">
              {(['light', 'dark', 'system'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    const next = { ...prefs, theme: option };
                    setPrefs(next);
                    savePrefs({ theme: option });
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm capitalize transition ${
                    prefs.theme === option
                      ? 'bg-vex font-medium text-white'
                      : 'bg-panel hover:bg-edge'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              Editor
            </h3>
            <label className="flex items-center justify-between py-1.5 text-sm">
              <span>Font size</span>
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  min={11}
                  max={20}
                  value={prefs.fontSize}
                  onChange={(event) => {
                    const fontSize = Number(event.target.value);
                    setPrefs({ ...prefs, fontSize });
                    savePrefs({ fontSize });
                  }}
                  className="w-32 accent-vex"
                />
                <span className="w-6 text-right font-mono text-xs text-ink-dim">
                  {prefs.fontSize}
                </span>
              </span>
            </label>
            {(
              [
                ['wordWrap', 'Wrap long lines'],
                ['minimap', 'Show minimap'],
                ['lineNumbers', 'Show line numbers'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between py-1.5 text-sm">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={(event) => {
                    const next = { ...prefs, [key]: event.target.checked };
                    setPrefs(next);
                    savePrefs({ [key]: event.target.checked });
                  }}
                  className="size-4 accent-vex"
                />
              </label>
            ))}
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">GitHub</h3>
            {login ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm">
                  Signed in as <span className="font-medium">{login}</span>
                </span>
                <button
                  type="button"
                  onClick={() => github('signout').then(() => setLogin(null))}
                  className="rounded-md bg-panel px-3 py-1.5 text-xs transition hover:bg-edge"
                >
                  Sign out
                </button>
              </div>
            ) : code ? (
              <div className="space-y-2 text-sm">
                <p className="text-ink-dim">Enter this code at GitHub:</p>
                <div className="rounded-lg bg-panel px-3 py-2 text-center font-mono text-lg tracking-[0.3em]">
                  {code.userCode}
                </div>
                <a
                  href={code.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-center text-vex hover:underline"
                >
                  Open GitHub →
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                {sso ? (
                  <a
                    href="/api/github/login"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                    </svg>
                    Sign in with GitHub
                  </a>
                ) : deviceFlow ? (
                  <button
                    type="button"
                    onClick={startDeviceFlow}
                    className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    Sign in with GitHub
                  </button>
                ) : null}
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={pat}
                    onChange={(event) => setPat(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && useToken()}
                    placeholder={deviceFlow ? 'or paste a personal access token' : 'Paste a GitHub token'}
                    aria-label="GitHub token"
                    className="flex-1 rounded-lg border border-edge bg-shell px-3 py-2 text-sm outline-none focus:border-vex"
                  />
                  <button
                    type="button"
                    onClick={useToken}
                    disabled={!pat}
                    className="rounded-lg bg-panel px-3 py-2 text-sm transition hover:bg-edge disabled:opacity-40"
                  >
                    Use
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-ink-dim">
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=VEXCollab"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-vex hover:underline"
                  >
                    Create a token →
                  </a>{' '}
                  opens GitHub with the right permission already ticked. Scroll down, press
                  <span className="font-medium text-ink"> Generate token</span>, copy it, paste it
                  above.
                </p>
                <p className="text-xs text-ink-dim">
                  It lets you load a repository into a room and push your work back. The token
                  stays on the server and is never written to disk.
                </p>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              Copilot
            </h3>
            {copilot === 'off' ? (
              <p className="text-sm text-ink-dim">
                Not enabled on this server. Set{' '}
                <span className="rounded bg-panel px-1 py-0.5 font-mono text-xs">
                  VEXCOLLAB_COPILOT=1
                </span>{' '}
                and restart to turn suggestions on.
              </p>
            ) : copilotCode ? (
              <div className="space-y-2 text-sm">
                <p className="text-ink-dim">Enter this code at GitHub:</p>
                <div className="rounded-lg bg-panel px-3 py-2 text-center font-mono text-lg tracking-[0.3em]">
                  {copilotCode.userCode}
                </div>
                <a
                  href={copilotCode.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-center text-vex hover:underline"
                >
                  Open GitHub →
                </a>
                <p className="text-center text-xs text-ink-dim">Waiting for you to approve…</p>
              </div>
            ) : copilot === 'signed in' ? (
              <p className="text-sm text-ink-dim">
                Signed in. Suggestions appear as ghost text while you type — press Tab to accept.
              </p>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={copilotSignIn}
                  className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Sign in to Copilot
                </button>
                <p className="text-xs leading-relaxed text-ink-dim">
                  Needs your own Copilot subscription. The sign-in is shared by everyone using
                  this server, so only do this on an instance that is yours.
                </p>
              </div>
            )}
          </section>

          {note && <p className="text-xs text-vex">{note}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-panel px-4 py-1.5 text-sm transition hover:bg-edge"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            className="rounded-lg bg-vex px-4 py-1.5 text-sm font-medium text-white transition hover:bg-vex-soft"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
