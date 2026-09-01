'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createRoomId } from '@/lib/collab/identity';

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState('');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-12 px-6 py-20 text-center">
      <header className="flex flex-col items-center gap-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-panel px-3.5 py-1.5 text-xs text-ink-dim">
          <span className="size-1.5 rounded-full bg-vex" />
          WebSerial · no sign-up · nothing stored
        </div>

        <h1 className="text-5xl font-semibold tracking-[-0.028em] sm:text-6xl">
          VEX<span className="text-vex">Collab</span>
        </h1>

        <p className="max-w-xl text-lg leading-relaxed text-ink-dim text-pretty sm:text-xl">
          A shared editor for VEX V5 Python. Your whole team types in the same file, and the
          browser talks to the brain over USB directly — upload to a slot, run it, and watch
          what it prints, without leaving the tab.
        </p>
      </header>

      <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => router.push(`/room/${createRoomId()}`)}
          className="rounded-full bg-vex px-7 py-3 font-medium text-white transition hover:bg-vex-soft"
        >
          Start a room
        </button>

        <form
          className="flex items-center gap-1 rounded-full bg-panel p-1 pl-5"
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
            className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-ink-dim sm:w-36"
          />
          <button
            type="submit"
            className="rounded-full bg-panel-raised px-5 py-2.5 text-sm font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-white"
          >
            Join
          </button>
        </form>
      </div>

      <section className="grid w-full gap-3 text-left sm:grid-cols-3">
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
          <div key={card.title} className="rounded-2xl bg-panel p-5">
            <h2 className="mb-1.5 font-medium">{card.title}</h2>
            <p className="text-sm leading-relaxed text-ink-dim">{card.body}</p>
          </div>
        ))}
      </section>

      <footer className="max-w-lg text-xs leading-relaxed text-ink-dim">
        Chrome, Edge or Opera on desktop for the USB parts —{' '}
        <a
          className="text-vex hover:underline"
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
