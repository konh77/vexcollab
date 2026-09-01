/*
 * VEXCollab - sign in to GitHub, pick a repo, save the room into it.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { applyIncomingFiles, readAllFiles } from '@/lib/collab/project';

interface Repo {
  fullName: string;
  cloneUrl: string;
  private: boolean;
}

type ApiResult = Record<string, any>;

async function api(action: string, extra: Record<string, unknown> = {}): Promise<ApiResult> {
  const response = await fetch('/api/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  return (await response.json()) as ApiResult;
}

export function GitHubPanel({ doc, roomId }: { doc: Y.Doc; roomId: string }) {
  const [login, setLogin] = useState<string | null>(null);
  const [deviceFlow, setDeviceFlow] = useState(false);
  const [code, setCode] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [pat, setPat] = useState('');
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [openRepo, setOpenRepo] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    const status: ApiResult = await api('status').catch(() => ({}));
    setLogin(status.signedIn ? status.login : null);
    setDeviceFlow(Boolean(status.deviceFlowAvailable));
    const repo: ApiResult = await api('repo-status', { roomId }).catch(() => ({}));
    setOpenRepo(repo.open ? (repo.remote ?? null) : null);
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (label: string, fn: () => Promise<ApiResult>): Promise<ApiResult> => {
    setBusy(label);
    setNote(null);
    try {
      const result = await fn();
      if (result.error) setNote(result.error);
      return result;
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Failed');
      return {};
    } finally {
      setBusy(null);
    }
  };

  // --- sign in --------------------------------------------------------------

  const startDeviceFlow = async () => {
    const result = await act('signin', () => api('device-start'));
    if (!result.userCode) return;
    setCode({ userCode: result.userCode, verificationUri: result.verificationUri });

    const deadline = Date.now() + 15 * 60 * 1000;
    let wait = (result.interval ?? 5) * 1000;
    const poll = async () => {
      if (Date.now() > deadline) {
        setCode(null);
        setNote('Sign-in timed out');
        return;
      }
      const status: ApiResult = await api('device-poll').catch(() => ({ pending: true }));
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

  const signInWithToken = async () => {
    const result = await act('signin', () => api('token', { token: pat }));
    if (result.signedIn) {
      setLogin(result.login);
      setPat('');
    }
  };

  // --- repositories ---------------------------------------------------------

  const listRepos = async () => {
    setPicking(true);
    const result = await act('repos', () => api('repos'));
    setRepos(result.repos ?? []);
  };

  const open = async (repo: Repo) => {
    const result = await act('open', () => api('open', { roomId, cloneUrl: repo.cloneUrl }));
    if (Array.isArray(result.files)) {
      applyIncomingFiles(doc, result.files);
      setOpenRepo(repo.cloneUrl);
      setNote(`Loaded ${repo.fullName}`);
      setPicking(false);
    }
  };

  const createRepo = async () => {
    const name = window.prompt('New repository name');
    if (!name) return;
    const result = await act('create', () => api('create-repo', { name }));
    if (result.cloneUrl) {
      await open({ fullName: result.fullName, cloneUrl: result.cloneUrl, private: true });
    }
  };

  const save = async () => {
    const result = await act('save', () =>
      api('save', { roomId, files: readAllFiles(doc), message }),
    );
    if (result.committed) {
      setNote(`Saved and pushed ${result.hash}`);
      setMessage('');
    } else if (result.note) {
      setNote(result.note);
    }
  };

  // --- render ---------------------------------------------------------------

  if (!login) {
    return (
      <div className="border-t border-edge px-3 py-2.5">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">GitHub</div>
        {code ? (
          <div className="space-y-1.5 text-[11px]">
            <p className="text-ink-dim">Enter this code at GitHub:</p>
            <div className="rounded-md bg-panel-raised px-2 py-1.5 text-center font-mono text-sm tracking-widest">
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
            <p className="text-ink-dim">Waiting…</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {deviceFlow && (
              <button
                type="button"
                onClick={startDeviceFlow}
                disabled={busy !== null}
                className="w-full rounded-md bg-ink px-2 py-1.5 text-[11px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy === 'signin' ? 'Starting…' : 'Sign in with GitHub'}
              </button>
            )}
            <input
              type="password"
              value={pat}
              onChange={(event) => setPat(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && signInWithToken()}
              placeholder={deviceFlow ? 'or paste a token' : 'Paste a GitHub token'}
              aria-label="GitHub token"
              className="w-full rounded-md border border-edge bg-panel-raised px-2 py-1 text-[11px] outline-none focus:border-vex"
            />
            {pat && (
              <button
                type="button"
                onClick={signInWithToken}
                className="w-full rounded-md bg-panel-raised px-2 py-1.5 text-[11px] font-medium transition hover:bg-edge"
              >
                Use token
              </button>
            )}
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=VEXCollab"
              target="_blank"
              rel="noreferrer"
              className="block text-[10px] text-vex hover:underline"
            >
              Create a token →
            </a>
          </div>
        )}
        {note && <p className="mt-1.5 break-words text-[10px] text-vex">{note}</p>}
      </div>
    );
  }

  return (
    <div className="border-t border-edge px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">GitHub</span>
        <span className="truncate text-[11px] text-ink">{login}</span>
        <button
          type="button"
          onClick={() => act('signout', () => api('signout')).then(refresh)}
          className="ml-auto text-[10px] text-ink-dim hover:text-ink"
        >
          sign out
        </button>
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={listRepos}
          className="w-full truncate rounded-md bg-panel-raised px-2 py-1.5 text-left text-[11px] transition hover:bg-edge"
          title={openRepo ?? 'No repository open'}
        >
          {openRepo ? openRepo.replace('https://github.com/', '').replace('.git', '') : 'Choose a repository…'}
        </button>

        {openRepo && (
          <>
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What changed?"
              aria-label="Commit message"
              className="w-full rounded-md border border-edge bg-panel-raised px-2 py-1 text-[11px] outline-none focus:border-vex"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="w-full rounded-md bg-vex px-2 py-1.5 text-[11px] font-medium text-white transition hover:bg-vex-soft disabled:opacity-50"
            >
              {busy === 'save' ? 'Saving…' : 'Save session to GitHub'}
            </button>
          </>
        )}
      </div>

      {note && <p className="mt-1.5 break-words text-[10px] leading-relaxed text-ink-dim">{note}</p>}

      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[12vh]"
          onClick={() => setPicking(false)}
          role="presentation"
        >
          <div
            className="w-[520px] max-w-[92vw] overflow-hidden rounded-2xl bg-panel-raised shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Choose a repository"
          >
            <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your repositories…"
                aria-label="Search repositories"
                className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-dim"
              />
              <button
                type="button"
                onClick={createRepo}
                className="shrink-0 rounded-md bg-vex px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-vex-soft"
              >
                New repo
              </button>
            </div>
            <div className="vc-scroll max-h-[50vh] overflow-y-auto py-1">
              {repos === null && <p className="px-4 py-6 text-center text-sm text-ink-dim">Loading…</p>}
              {repos
                ?.filter((r) => r.fullName.toLowerCase().includes(search.toLowerCase()))
                .map((repo) => (
                  <button
                    key={repo.fullName}
                    type="button"
                    onClick={() => open(repo)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] transition hover:bg-panel"
                  >
                    <span className="flex-1 truncate">{repo.fullName}</span>
                    {repo.private && <span className="text-[10px] text-ink-dim">private</span>}
                  </button>
                ))}
              {repos?.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-ink-dim">No repositories found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
