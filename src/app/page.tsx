'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createRoomId } from '@/lib/collab/identity';

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState('');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-xs text-ink-dim">
          <span className="size-1.5 rounded-full bg-vex" />
          WebSerial · no sign-up · nothing stored
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          VEX<span className="text-vex">Collab</span>
        </h1>
        <p className="max-w-xl text-lg text-ink-dim">
          A shared editor for VEX V5 Python. Your whole team types in the same file, and the
          browser talks to the brain over USB directly — upload to a slot, run it, and watch
          what it prints, without leaving the tab.
        </p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row">
        <button
          type="button"
          onClick={() => router.push(`/room/${createRoomId()}`)}
          className="rounded-lg bg-vex px-6 py-3 font-medium text-white transition hover:bg-vex-soft"
        >
          Start a room
        </button>

        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const id = joinId.trim();
            if (id) router.push(`/room/${encodeURIComponent(id)}`);
          }}
        >
          <input
            value={joinId}
            onChange={(event) => setJoinId(event.target.value)}
            placeholder="Room code"
            aria-label="Room code"
            className="min-w-0 flex-1 rounded-lg border border-edge bg-panel px-4 py-3 outline-none placeholder:text-ink-dim focus:border-vex"
          />
          <button
            type="submit"
            className="rounded-lg border border-edge bg-panel-raised px-5 py-3 font-medium transition hover:border-ink-dim"
          >
            Join
          </button>
        </form>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: 'Everyone in one file',
            body: 'Live cursors, live selections, no merge conflicts at 2am before a comp.',
          },
          {
            title: 'The brain is right there',
            body: 'Battery, firmware, plugged-in devices, program slots — read straight off USB.',
          },
          {
            title: 'Python needs no compiler',
            body: 'V5 runs Python on-board, so the edit-upload-run loop stays entirely in the browser.',
          },
        ].map((card) => (
          <div key={card.title} className="rounded-lg border border-edge bg-panel p-4">
            <h2 className="mb-1 font-medium">{card.title}</h2>
            <p className="text-sm text-ink-dim">{card.body}</p>
          </div>
        ))}
      </section>

      <footer className="text-xs text-ink-dim">
        Chrome, Edge or Opera on desktop for the USB parts —{' '}
        <a
          className="underline hover:text-ink"
          href="https://developer.mozilla.org/docs/Web/API/Web_Serial_API"
          target="_blank"
          rel="noreferrer"
        >
          WebSerial
        </a>{' '}
        is not available in Safari or Firefox. Free software under AGPL-3.0.
      </footer>
    </main>
  );
}
