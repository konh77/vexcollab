/*
 * VEXCollab - talk to Copilot about the code in front of you.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

interface Props {
  /** The file being edited, sent as context so answers are about your code. */
  getContext: () => { path: string; contents: string } | null;
}

export function ChatPanel({ getContext }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [includeFile, setIncludeFile] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch('/api/copilot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'history' }),
    })
      .then((r) => r.json())
      .then((data) => {
        setEnabled(Boolean(data.enabled));
        if (Array.isArray(data.messages)) setMessages(data.messages);
      })
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;

    setMessages((m) => [...m, { role: 'user', text: prompt }]);
    setInput('');
    setBusy(true);
    setError(null);

    const file = includeFile ? getContext() : null;
    const context = file
      ? `Here is the file I am working on (${file.path}). It is VEX V5 Python.\n\n\`\`\`python\n${file.contents.slice(0, 12000)}\n\`\`\``
      : undefined;

    try {
      const response = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.detail ? `${data.error} — ${data.detail}` : data.error);
      } else {
        setMessages((m) => [...m, { role: 'assistant', text: data.reply }]);
      }
    } catch {
      setError('Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  if (enabled === false) {
    return (
      <div className="p-4 text-sm text-ink-dim">
        <p className="mb-2 font-medium text-ink">Copilot is not enabled here.</p>
        <p>
          Start the server with{' '}
          <span className="rounded bg-panel px-1 py-0.5 font-mono text-xs">VEXCOLLAB_COPILOT=1</span>{' '}
          and sign in from Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="vc-scroll flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && !busy && (
          <div className="pt-6 text-center text-[12px] leading-relaxed text-ink-dim">
            <p className="mb-1 font-medium text-ink">Ask about your code</p>
            <p>“Why does my auton drift right?”</p>
            <p>“Write a PID turn using the inertial sensor.”</p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === 'user'
                ? 'ml-6 rounded-xl rounded-br-sm bg-vex px-3 py-2 text-[12px] leading-relaxed text-white'
                : 'mr-2 rounded-xl rounded-bl-sm bg-panel px-3 py-2 text-[12px] leading-relaxed'
            }
          >
            <pre className="whitespace-pre-wrap font-sans">{message.text}</pre>
          </div>
        ))}

        {busy && <div className="text-[12px] text-ink-dim">Thinking…</div>}
        {error && (
          <div className="rounded-lg bg-panel px-3 py-2 text-[11px] leading-relaxed text-vex">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-edge p-2">
        <label className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] text-ink-dim">
          <input
            type="checkbox"
            checked={includeFile}
            onChange={(event) => setIncludeFile(event.target.checked)}
            className="size-3 accent-vex"
          />
          Send the open file as context
        </label>
        <div className="flex gap-1.5">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Ask Copilot…"
            aria-label="Ask Copilot"
            className="vc-scroll min-w-0 flex-1 resize-none rounded-lg border border-edge bg-panel-raised px-2.5 py-1.5 text-[12px] outline-none placeholder:text-ink-dim focus:border-vex"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="shrink-0 self-end rounded-lg bg-vex px-3 py-2 text-[12px] font-medium text-white transition hover:bg-vex-soft disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
