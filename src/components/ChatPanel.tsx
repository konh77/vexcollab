/*
 * VEXCollab - team chat: the people in the room talking to each other.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ChatMessage } from '@/lib/collab/provider';

const MAX_LENGTH = 1000;
/** Same sender, this close together: one run, with the name shown once. */
const RUN_MS = 5 * 60 * 1000;

/** A colour that came from another browser is only used if it is a plain hex value. */
function safeColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#8e8e93';
}

const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * Makes web addresses clickable. Only http and https are ever linked, so a
 * message cannot carry a javascript: or data: link, and they open with noopener.
 * Everything else stays text, which React escapes.
 */
function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const start = match.index ?? 0;
    // Trailing punctuation belongs to the sentence, not the address.
    const url = match[0].replace(/[.,;:!?)\]]+$/, '');
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a
        key={start}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="underline underline-offset-2"
      >
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ChatPanel({
  messages,
  selfId,
  connected,
  people,
  kept,
  onSend,
}: {
  messages: ChatMessage[];
  selfId: string | null;
  connected: boolean;
  /** How many are in the room right now. */
  people: number;
  /** Whether this room keeps its chat after everyone leaves. */
  kept: boolean;
  /** Resolves to null on success, or the reason it failed. */
  onSend: (text: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Whether the reader is at the bottom. If they have scrolled up to read
  // something, a new message must not yank them away from it.
  const stuck = useRef(true);
  const seen = useRef(0);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (stuck.current) setUnseen(0);
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const added = messages.length - seen.current;
    seen.current = messages.length;
    const mine = messages.at(-1)?.senderId === selfId;
    if (stuck.current || mine) {
      el.scrollTop = el.scrollHeight;
      setUnseen(0);
    } else if (added > 0) {
      setUnseen((count) => count + added);
    }
  }, [messages, selfId]);

  // Grow the box with what is typed, up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const failure = await onSend(text);
    setSending(false);
    if (failure) {
      // Keep what was typed: losing a message to a hiccup is worse than the hiccup.
      setError(failure);
      return;
    }
    setError(null);
    setDraft('');
    stuck.current = true;
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="shrink-0 border-b border-edge px-3.5 py-2">
        <p className="text-[12px] font-medium">
          Team chat <span className="font-normal text-ink-dim">· {people} here</span>
        </p>
        <p className="text-[11px] text-ink-dim">
          {kept
            ? 'This room keeps its chat.'
            : 'Chat is gone when everyone leaves the room.'}
        </p>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="vc-scroll h-full overflow-y-auto px-3 py-3"
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {messages.length === 0 ? (
            <p className="mt-10 px-4 text-center text-sm text-ink-dim">
              No messages yet. Say something to everyone in this room.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const mine = message.senderId === selfId;
                const sameRun =
                  previous &&
                  previous.senderId === message.senderId &&
                  message.at - previous.at < RUN_MS;
                const color = safeColor(message.color);

                return (
                  <li
                    key={message.id}
                    className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${sameRun ? '' : 'pt-2.5'}`}
                  >
                    {!sameRun && (
                      <div className="mb-0.5 flex items-baseline gap-1.5 px-1 text-[11px]">
                        <span className="font-medium" style={{ color }}>
                          {mine ? 'You' : message.name}
                        </span>
                        <span className="text-ink-dim">{clock.format(message.at)}</span>
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[13px] leading-snug ${
                        mine ? 'bg-vex text-white' : 'bg-panel-raised shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                      }`}
                    >
                      {linkify(message.text)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {unseen > 0 && (
          <button
            type="button"
            onClick={() => {
              const el = listRef.current;
              if (el) el.scrollTop = el.scrollHeight;
              setUnseen(0);
            }}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-shell shadow-lg"
          >
            {unseen} new {unseen === 1 ? 'message' : 'messages'} ↓
          </button>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="shrink-0 border-t border-edge bg-panel p-2.5"
      >
        {error && (
          <p role="alert" className="mb-1.5 px-1 text-[11px] text-vex">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={MAX_LENGTH}
            disabled={!connected}
            enterKeyHint="send"
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter makes a new line. Not while an input
              // method is composing -- Enter there confirms a character.
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={connected ? 'Message the room' : 'Reconnecting…'}
            aria-label="Message"
            className="min-h-[38px] flex-1 resize-none rounded-xl border border-edge bg-panel-raised px-3 py-2 text-sm leading-snug outline-none focus:border-vex disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!connected || sending || !draft.trim()}
            className="h-[38px] shrink-0 rounded-xl bg-vex px-4 text-sm font-medium text-white transition hover:bg-vex-soft disabled:opacity-50"
          >
            Send
          </button>
        </div>
        {draft.length > MAX_LENGTH * 0.8 && (
          <p className="mt-1 px-1 text-right text-[10px] text-ink-dim">
            {draft.length}/{MAX_LENGTH}
          </p>
        )}
      </form>
    </div>
  );
}
