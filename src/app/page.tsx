'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createRoomId, loadIdentity } from '@/lib/collab/identity';
import { forgetRoom, loadRecent, rememberRoom, type RecentRoom } from '@/lib/collab/recent';
import { Settings } from '@/components/Settings';
import { TrafficLights } from '@/components/TrafficLights';

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState('');
  const [recent, setRecent] = useState<RecentRoom[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [me, setMe] = useState<{ name: string; color: string } | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
    setMe(loadIdentity());
  }, [showSettings]);

  const go = (id: string) => {
    rememberRoom(id);
    router.push(`/room/${encodeURIComponent(id)}`);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-panel px-6 py-12">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-shell shadow-[0_30px_80px_rgba(0,0,0,0.18)]">
        {/* Title bar */}
        <div className="vc-vibrancy flex items-center gap-3 border-b border-edge px-3 py-2.5">
          <TrafficLights />
          <span className="flex-1 text-center text-[13px] font-medium">
            VEX<span className="text-vex">Collab</span>
          </span>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
            className="rounded-md p-1 text-ink-dim transition hover:bg-edge hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.43.53.77.6H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-8 pb-8 pt-9">
          <div className="mb-7 text-center">
            <h1 className="text-3xl font-semibold tracking-[-0.025em]">
              Write V5 Python together
            </h1>
            <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-dim text-pretty">
              One link, one file, everyone's cursor. Then upload straight to the brain
              over USB — no IDE, no toolchain.
            </p>
          </div>

          <div className="mx-auto flex max-w-md flex-col gap-2.5">
            <button
              type="button"
              onClick={() => go(createRoomId())}
              className="rounded-lg bg-vex px-6 py-2.5 text-[15px] font-medium text-white transition hover:bg-vex-soft"
            >
              New room
            </button>

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const id = joinId.trim();
                if (id) go(id);
              }}
            >
              <input
                value={joinId}
                onChange={(event) => setJoinId(event.target.value)}
                placeholder="Room code"
                aria-label="Room code"
                className="min-w-0 flex-1 rounded-lg border border-edge bg-shell px-3.5 py-2.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-ink-dim focus:border-vex"
              />
              <button
                type="submit"
                disabled={!joinId.trim()}
                className="rounded-lg bg-panel px-5 py-2.5 text-[15px] font-medium transition hover:bg-edge disabled:opacity-40"
              >
                Join
              </button>
            </form>
          </div>

          {recent.length > 0 && (
            <div className="mx-auto mt-7 max-w-md">
              <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
                Recent
              </h2>
              <ul className="overflow-hidden rounded-lg border border-edge">
                {recent.map((room, index) => (
                  <li
                    key={room.id}
                    className={`group flex items-center ${index > 0 ? 'border-t border-edge' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => go(room.id)}
                      className="flex-1 truncate px-3.5 py-2 text-left font-mono text-[13px] transition hover:bg-panel"
                    >
                      {room.id}
                    </button>
                    <span className="px-2 text-[11px] text-ink-dim">
                      {new Date(room.lastSeen).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      aria-label={`Forget ${room.id}`}
                      onClick={() => {
                        forgetRoom(room.id);
                        setRecent(loadRecent());
                      }}
                      className="px-3 text-xs text-ink-dim opacity-0 transition group-hover:opacity-100 hover:text-vex"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Status strip */}
        <div className="flex items-center gap-2 border-t border-edge bg-panel px-4 py-2 text-[11px] text-ink-dim">
          {me && (
            <>
              <span className="size-2.5 rounded-full" style={{ backgroundColor: me.color }} />
              <span>{me.name}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="text-ink-dim underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            change
          </button>
          <span className="ml-auto">Chrome, Edge or Opera for USB · AGPL-3.0</span>
        </div>
      </div>

      <Settings open={showSettings} onClose={() => setShowSettings(false)} />
    </main>
  );
}
