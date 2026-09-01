/*
 * VEXCollab - settings sheet.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useState } from 'react';
import { loadIdentity, saveIdentity } from '@/lib/collab/identity';
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
  const [code, setCode] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [pat, setPat] = useState('');
  const [copilot, setCopilot] = useState<string>('off');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const identity = loadIdentity();
    setName(identity.name);
    setColor(identity.color);

    void github('status').then((s) => {
      setLogin(s.signedIn ? s.login : null);
      setDeviceFlow(Boolean(s.deviceFlowAvailable));
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
                {deviceFlow && (
                  <button
                    type="button"
                    onClick={startDeviceFlow}
                    className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    Sign in with GitHub
                  </button>
                )}
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
                <p className="text-xs text-ink-dim">
                  Lets you load a repository into a room and push your work back. The token stays
                  on the server and is never written to disk.
                </p>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              Copilot
            </h3>
            <p className="text-sm text-ink-dim">
              {copilot === 'off'
                ? 'Not enabled on this server. Start it with --copilot to turn suggestions on.'
                : `GitHub Copilot: ${copilot}.`}
            </p>
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
