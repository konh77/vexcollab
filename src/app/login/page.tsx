'use client';

import { useState } from 'react';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        // Full reload so the cookie is attached to the socket handshake too.
        window.location.href = '/';
        return;
      }
      setError('That password did not work.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6 text-center">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-[-0.02em]">
          VEX<span className="text-vex">Collab</span>
        </h1>
        <p className="text-ink-dim">This session is password protected.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          aria-label="Password"
          className="rounded-xl border border-edge bg-panel-raised px-4 py-3 text-center outline-none placeholder:text-ink-dim focus:border-vex"
        />
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-full bg-vex px-6 py-3 font-medium text-white transition hover:bg-vex-soft disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Join'}
        </button>
        {error && <p className="text-sm text-vex">{error}</p>}
      </form>
    </main>
  );
}
