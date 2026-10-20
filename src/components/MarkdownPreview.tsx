/*
 * VEXCollab - read a Markdown file the way it will look, live.
 * Licensed under AGPL-3.0-only.
 *
 * The text belongs to everyone in the room, so it is treated as untrusted:
 * react-markdown builds React elements and never injects raw HTML, unsafe link
 * schemes such as javascript: are dropped, and images are not fetched. A
 * collaborator should not be able to run script in your tab, or learn your IP
 * address, by editing a README.
 */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type * as Y from 'yjs';
import { getFiles } from '@/lib/collab/project';

interface Props {
  doc: Y.Doc;
  path: string;
  /** Every file in the room, so a relative link can open one instead of navigating away. */
  paths: string[];
  onOpenFile: (path: string) => void;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Resolves `./drive.py` or `lib/drive.py` against the file the link is in. */
function resolveRoomPath(from: string, href: string, paths: string[]): string | null {
  if (SCHEME.test(href) || href.startsWith('#') || href.startsWith('//')) return null;
  const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
  if (!clean) return null;

  const base = clean.startsWith('/') ? [] : from.split('/').slice(0, -1);
  const parts = [...base];
  for (const piece of clean.split('/')) {
    if (piece === '' || piece === '.') continue;
    if (piece === '..') parts.pop();
    else parts.push(piece);
  }
  const target = parts.join('/');
  return paths.includes(target) ? target : null;
}

export function MarkdownPreview({ doc, path, paths, onOpenFile }: Props) {
  const [source, setSource] = useState('');

  // Follows the shared text as it is typed, by anyone. The file's Y.Text can
  // also be replaced wholesale (a GitHub pull rewrites it), so watch the map too.
  useEffect(() => {
    const files = getFiles(doc);
    // Nothing is observed yet, so rebind() below must not try to unobserve.
    let text: Y.Text | null = null;
    const read = () => setSource(text?.toString() ?? '');

    const rebind = () => {
      text?.unobserve(read);
      text = files.get(path) ?? null;
      text?.observe(read);
      read();
    };

    files.observe(rebind);
    rebind();
    return () => {
      files.unobserve(rebind);
      text?.unobserve(read);
    };
  }, [doc, path]);

  const components: Components = {
    h1: ({ children }) => (
      <h1 className="mb-3 mt-6 border-b border-edge pb-1.5 text-2xl font-semibold first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-2.5 mt-6 border-b border-edge pb-1 text-xl font-semibold first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-semibold first:mt-0">{children}</h3>,
    h4: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h4>,
    h5: ({ children }) => <h5 className="mb-1.5 mt-4 text-sm font-semibold first:mt-0">{children}</h5>,
    h6: ({ children }) => (
      <h6 className="mb-1.5 mt-4 text-sm font-semibold text-ink-dim first:mt-0">{children}</h6>
    ),
    p: ({ children }) => <p className="my-3 leading-relaxed">{children}</p>,
    ul: ({ children, className }) => (
      <ul className={`my-3 space-y-1 pl-6 ${className?.includes('contains-task-list') ? 'list-none pl-1' : 'list-disc'}`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-4 border-edge pl-4 text-ink-dim">{children}</blockquote>
    ),
    hr: () => <hr className="my-6 border-edge" />,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    // react-markdown gives the block form a <pre><code>, and inline code a bare <code>.
    pre: ({ children }) => (
      <pre className="my-3 overflow-x-auto rounded-lg bg-panel px-4 py-3 text-[13px] leading-relaxed">
        {children}
      </pre>
    ),
    code: ({ children, className }) =>
      className ? (
        <code className="font-mono">{children}</code>
      ) : (
        <code className="rounded bg-panel px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>
      ),
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-edge bg-panel px-3 py-1.5 text-left font-semibold">{children}</th>
    ),
    td: ({ children }) => <td className="border border-edge px-3 py-1.5 align-top">{children}</td>,
    // Never fetch a remote image on a reader's behalf: it tells whoever wrote the
    // link when, and from where, the room was opened. Show what it was instead.
    img: ({ alt, src }) => (
      <span className="rounded bg-panel px-1.5 py-0.5 text-sm text-ink-dim" title={typeof src === 'string' ? src : undefined}>
        🖼 {alt || 'image'}
      </span>
    ),
    input: ({ checked }) => (
      <input type="checkbox" checked={Boolean(checked)} readOnly disabled className="mr-1.5 align-middle" />
    ),
    a: ({ href, children }) => {
      const target = href ? resolveRoomPath(path, href, paths) : null;
      if (target) {
        return (
          <button
            type="button"
            onClick={() => onOpenFile(target)}
            className="text-vex underline decoration-dotted underline-offset-2 hover:text-vex-soft"
            title={`Open ${target}`}
          >
            {children as ReactNode}
          </button>
        );
      }
      if (href?.startsWith('#')) {
        return <span className="text-vex">{children as ReactNode}</span>;
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-vex underline underline-offset-2 hover:text-vex-soft"
        >
          {children as ReactNode}
        </a>
      );
    },
  };

  return (
    <div className="vc-scroll h-full overflow-y-auto bg-shell">
      <article className="mx-auto max-w-3xl px-8 py-6 text-[15px] text-ink">
        {source.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {source}
          </ReactMarkdown>
        ) : (
          <p className="text-sm text-ink-dim">This file is empty. Switch to Edit to write something.</p>
        )}
      </article>
    </div>
  );
}
