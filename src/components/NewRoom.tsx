/*
 * VEXCollab - choosing what a new room starts with.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useState } from 'react';
import { TEMPLATES } from '@/lib/vex/templates';
import { TrafficLights } from './TrafficLights';

type ApiResult = Record<string, any>;

interface Repo {
  fullName: string;
  cloneUrl: string;
  private: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** `repo` is a clone URL when starting from GitHub. */
  onStart: (options: { template: string; repo?: string }) => void;
}

export function NewRoom({ open, onClose, onStart }: Props) {
  const [tab, setTab] = useState<'template' | 'github'>('template');
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab('template');
    setSearch('');
    void fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    })
      .then((r) => r.json())
      .then((s: ApiResult) => setLogin(s.signedIn ? s.login : null))
      .catch(() => setLogin(null));
  }, [open]);

  useEffect(() => {
    if (tab !== 'github' || !login || repos) return;
    void fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'repos' }),
    })
      .then((r) => r.json())
      .then((data: ApiResult) => setRepos(data.repos ?? []))
      .catch(() => setRepos([]));
  }, [tab, login, repos]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[10vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-xl bg-panel-raised shadow-[0_24px_70px_rgba(0,0,0,0.3)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="New room"
      >
        <div className="vc-vibrancy flex items-center gap-3 border-b border-edge px-3 py-2.5">
          <TrafficLights onClose={onClose} />
          <span className="flex-1 text-center text-[13px] font-medium">New room</span>
          <span className="w-12" />
        </div>

        <div className="flex gap-1 border-b border-edge px-3 py-2">
          {(['template', 'github'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] transition ${
                tab === option ? 'bg-panel font-medium' : 'text-ink-dim hover:text-ink'
              }`}
            >
              {option === 'template' ? 'Start from a template' : 'From a GitHub repo'}
            </button>
          ))}
        </div>

        <div className="vc-scroll max-h-[52vh] overflow-y-auto p-3">
          {tab === 'template' ? (
            <ul className="space-y-1.5">
              {TEMPLATES.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => onStart({ template: template.id })}
                    className="w-full rounded-lg border border-edge px-3 py-2.5 text-left transition hover:border-vex hover:bg-panel"
                  >
                    <span className="block text-sm font-medium">{template.name}</span>
                    <span className="block text-xs text-ink-dim">{template.description}</span>
                    <span className="mt-1 block font-mono text-[10px] text-ink-dim">
                      {template.files.map((f) => f.path).join('  ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : !login ? (
            <div className="px-2 py-6 text-center text-sm text-ink-dim">
              <p className="mb-1 font-medium text-ink">Sign in to GitHub first</p>
              <p>Open Settings and sign in, then come back here.</p>
            </div>
          ) : (
            <>
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your repositories…"
                aria-label="Search repositories"
                className="mb-2 w-full rounded-lg border border-edge bg-shell px-3 py-2 text-sm outline-none focus:border-vex"
              />
              {repos === null && <p className="py-6 text-center text-sm text-ink-dim">Loading…</p>}
              {repos?.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-dim">No repositories found.</p>
              )}
              <ul>
                {repos
                  ?.filter((r) => r.fullName.toLowerCase().includes(search.toLowerCase()))
                  .slice(0, 60)
                  .map((repo) => (
                    <li key={repo.fullName}>
                      <button
                        type="button"
                        onClick={() => onStart({ template: 'none', repo: repo.cloneUrl })}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition hover:bg-panel"
                      >
                        <span className="flex-1 truncate">{repo.fullName}</span>
                        {repo.private && <span className="text-[10px] text-ink-dim">private</span>}
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
