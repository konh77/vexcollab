'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createRoomId } from '@/lib/collab/identity';
import { forgetRoom, loadRecent, rememberRoom, type RecentRoom } from '@/lib/collab/recent';
import { DemoPreview } from '@/components/DemoPreview';
import { NewRoom } from '@/components/NewRoom';
import { Settings } from '@/components/Settings';

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState('');
  const [recent, setRecent] = useState<RecentRoom[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    setRecent(loadRecent());
  }, [showSettings]);

  const go = (id: string, options?: { template?: string; repo?: string }) => {
    rememberRoom(id);
    const query = new URLSearchParams();
    if (options?.template) query.set('t', options.template);
    if (options?.repo) query.set('repo', options.repo);
    const suffix = query.toString() ? `?${query}` : '';
    router.push(`/room/${encodeURIComponent(id)}${suffix}`);
  };

  return (
    <main className="flex min-h-screen flex-col overflow-hidden bg-shell">
      {/* Translucent nav */}
      <nav className="vc-vibrancy sticky top-0 z-20 flex h-12 shrink-0 items-center gap-6 border-b border-edge px-6 sm:px-8">
        <span className="text-[15px] font-semibold tracking-[-0.01em]">
          VEX<span className="text-vex">Collab</span>
        </span>
        <div className="hidden gap-6 text-xs text-ink-dim sm:flex">
          <a href="#overview" className="transition hover:text-ink">Overview</a>
          <a href="#hardware" className="transition hover:text-ink">Hardware</a>
          <a
            href="https://github.com/ponpon77/vexcollab"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-ink"
          >
            Source
          </a>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          className="ml-auto rounded-md p-1.5 text-ink-dim transition hover:bg-edge hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.43.53.77.6H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </nav>

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center px-6 pt-14 sm:pt-[76px]">
        <div className="mb-6 inline-flex items-center gap-[7px] rounded-full bg-panel px-3.5 py-1.5 text-[11.5px] text-ink-dim">
          <span className="size-[5px] rounded-full bg-vex" />
          WebSerial · no sign-up · nothing stored
        </div>

        <h1 className="text-center text-[40px] font-semibold leading-[1.04] tracking-[-0.028em] sm:text-[68px]">
          Your whole team,
          <br />
          one <span className="text-vex">main.py</span>
        </h1>

        <p className="mt-5 max-w-[620px] text-center text-[17px] leading-[1.5] tracking-[-0.01em] text-ink-dim text-pretty sm:text-[19px]">
          A shared editor for VEX V5 Python. Everyone types in the same file, and the browser
          talks to the brain over USB — upload to a slot, run it, and watch what it prints,
          without leaving the tab.
        </p>

        {/* Actions */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="rounded-full bg-vex px-[26px] py-3 text-[15px] font-medium tracking-[-0.01em] text-white transition hover:bg-vex-soft"
          >
            Start a room
          </button>

          <form
            className="flex items-center gap-2 rounded-full bg-panel py-1 pl-[18px] pr-1"
            onSubmit={(event) => {
              event.preventDefault();
              const id = joinId.trim();
              if (id) go(id);
            }}
          >
            <input
              value={joinId}
              onChange={(event) => setJoinId(event.target.value)}
              placeholder="room code"
              aria-label="Room code"
              className="w-[110px] bg-transparent font-mono text-[15px] tracking-[0.02em] outline-none placeholder:text-ink-dim"
            />
            <button
              type="submit"
              disabled={!joinId.trim()}
              className="rounded-full bg-shell px-5 py-2.5 text-sm font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-white disabled:opacity-40"
            >
              Join
            </button>
          </form>
        </div>

        {recent.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] text-ink-dim">Recent</span>
            {recent.slice(0, 5).map((room) => (
              <span key={room.id} className="group flex items-center rounded-full bg-panel">
                <button
                  type="button"
                  onClick={() => go(room.id)}
                  className="py-1 pl-3 pr-1.5 font-mono text-[11px] text-ink-dim transition hover:text-ink"
                >
                  {room.id}
                </button>
                <button
                  type="button"
                  aria-label={`Forget ${room.id}`}
                  onClick={() => {
                    forgetRoom(room.id);
                    setRecent(loadRecent());
                  }}
                  className="pr-2.5 text-[10px] text-ink-dim opacity-0 transition group-hover:opacity-100 hover:text-vex"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Product shot */}
        <div id="overview" className="mt-12 w-full sm:mt-[58px]">
          <DemoPreview />
        </div>
      </section>

      <NewRoom
        open={showNew}
        onClose={() => setShowNew(false)}
        onStart={(options) => {
          setShowNew(false);
          go(createRoomId(), options);
        }}
      />
      <Settings open={showSettings} onClose={() => setShowSettings(false)} />
    </main>
  );
}
