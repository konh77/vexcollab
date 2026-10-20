/*
 * VEXCollab - the prompt in front of a pinned room.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useState } from 'react';
import type { PasscodeReason } from '@/lib/collab/provider';

/**
 * Covers the whole workspace until the server accepts a passcode. The passcode
 * is checked there, not here: nothing in the page decides who gets in, so there
 * is nothing in it to read or bypass.
 */
export function PasscodeGate({
  reason,
  roomId,
  onSubmit,
}: {
  reason: PasscodeReason;
  roomId: string;
  onSubmit: (passcode: string) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-shell/95 p-4 backdrop-blur-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!value.trim()) return;
          onSubmit(value);
          setValue('');
        }}
        className="w-full max-w-sm rounded-2xl bg-panel-raised p-6 shadow-[0_24px_70px_rgba(0,0,0,0.25)]"
      >
        <h1 className="text-lg font-semibold">This room is protected</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Enter the passcode for <span className="font-mono">{roomId}</span> to open it.
        </p>

        <input
          autoFocus
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Room passcode"
          aria-invalid={reason === 'wrong'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-4 w-full rounded-lg border border-edge bg-shell px-3 py-2.5 text-base outline-none focus:border-vex"
        />

        {reason === 'wrong' && (
          <p role="alert" className="mt-2 text-sm text-vex">
            That passcode is not right.
          </p>
        )}

        <button
          type="submit"
          disabled={!value.trim()}
          className="mt-4 w-full rounded-lg bg-vex px-3 py-2.5 text-sm font-medium text-white transition hover:bg-vex-soft disabled:opacity-50"
        >
          Open room
        </button>
      </form>
    </div>
  );
}
