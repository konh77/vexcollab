/*
 * VEXCollab - the Help box and cheat sheets.
 * Licensed under AGPL-3.0-only.
 *
 * Two ways in. Commands: search or browse the API, open one for what it does,
 * what each argument accepts and an example written with this project's own
 * variable names, and drop it into the code. Cheat sheets: short recipes for the
 * things a robot does most, plus the units, ports and mistakes people hit.
 *
 * The Help box also follows the cursor -- put it on `left_drive.spin` and the
 * entry for Motor.spin is one tap away -- because the moment you want to know
 * what a call does is the moment you are looking at it.
 */
'use client';

import { useMemo, useState } from 'react';
import type { DeclaredDevice } from '@/lib/editor/useAnalysis';
import { PITFALLS, RECIPES, type Recipe } from '@/lib/vex/cheatsheets';
import {
  HELP_CATEGORIES,
  constantGroups,
  entryById,
  exampleFor,
  helpEntries,
  insertionFor,
  sameNameElsewhere,
  searchHelp,
  type HelpCategory,
  type HelpEntry,
  type HelpParam,
} from '@/lib/vex/help';

type InsertKind = 'snippet' | 'text' | 'block';

interface Props {
  declared: DeclaredDevice[];
  /** What the editor's cursor is on, if it is on something with documentation. */
  atCursor: HelpEntry | null;
  /** False when there is no editor to put code into (a rendered Markdown page). */
  canInsert: boolean;
  /** Returns whether it went in. */
  onInsert: (text: string, kind: InsertKind) => boolean;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-panel px-3 py-2 font-mono text-[12px] leading-relaxed">
      {children}
    </pre>
  );
}

/** A small button that says what it did, for a moment, instead of doing nothing visible. */
function ActionButton({
  label,
  done,
  onClick,
  primary = false,
  disabled = false,
  title,
}: {
  label: string;
  done: string;
  onClick: () => boolean | void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={() => {
        if (onClick() === false) return;
        setShown(true);
        window.setTimeout(() => setShown(false), 1500);
      }}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
        primary ? 'bg-vex text-white hover:bg-vex-soft' : 'bg-panel hover:bg-edge'
      }`}
    >
      {shown ? done : label}
    </button>
  );
}

function ParamRow({ param }: { param: HelpParam }) {
  const shown = param.values.slice(0, 6);
  return (
    <li className="py-1.5">
      <div className="flex items-baseline gap-2">
        <code className="font-mono text-[12px] text-vex">{param.name}</code>
        {param.optional && <span className="text-[10px] uppercase tracking-wide text-ink-dim">optional</span>}
      </div>
      {param.values.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {shown.map((value) => (
            <span
              key={value.label}
              title={value.detail}
              className="rounded bg-panel px-1.5 py-0.5 font-mono text-[11px]"
            >
              {value.label}
            </span>
          ))}
          {param.values.length > shown.length && (
            <span className="px-1 py-0.5 text-[11px] text-ink-dim">
              +{param.values.length - shown.length} more
            </span>
          )}
        </div>
      ) : (
        <p className="mt-0.5 text-[11px] text-ink-dim">A number.</p>
      )}
    </li>
  );
}

function EntryDetail({
  entry,
  declared,
  canInsert,
  onInsert,
  onOpen,
  onBack,
}: {
  entry: HelpEntry;
  declared: DeclaredDevice[];
  canInsert: boolean;
  onInsert: Props['onInsert'];
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const example = exampleFor(entry, declared);
  const insertion = insertionFor(entry, declared);
  const elsewhere = sameNameElsewhere(entry);
  const title = entry.className && entry.type === 'member' ? `${entry.className}.${entry.name}` : entry.name;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-ink-dim transition hover:text-ink"
      >
        ← All commands
      </button>

      <div>
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-dim">{entry.detail}</p>
      </div>

      <section>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-dim">
          {entry.type === 'class' ? 'How to create it' : 'Syntax'}
        </h3>
        <Code>{entry.signature}</Code>
        {entry.returns && (
          <p className="mt-1.5 text-xs text-ink-dim">
            Gives back <code className="font-mono">{entry.returns}</code>.
          </p>
        )}
      </section>

      {entry.params.length > 0 && (
        <section>
          <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-dim">
            {entry.type === 'class' ? 'Arguments' : 'Parameters'}
          </h3>
          <ul className="divide-y divide-edge">
            {entry.params.map((param) => (
              <ParamRow key={param.name} param={param} />
            ))}
          </ul>
        </section>
      )}

      {example && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-dim">
            Example
          </h3>
          <Code>{example}</Code>
          <div className="mt-2 flex gap-2">
            <ActionButton
              label="Put in my code"
              done="Added"
              primary
              disabled={!canInsert || !insertion}
              title={canInsert ? undefined : 'Open a code file first'}
              onClick={() => (insertion ? onInsert(insertion.text, insertion.snippet ? 'snippet' : 'text') : false)}
            />
            <ActionButton
              label="Copy"
              done="Copied"
              onClick={() => {
                void navigator.clipboard.writeText(example);
              }}
            />
          </div>
        </section>
      )}

      {elsewhere.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-dim">
            Also on
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {elsewhere.map((other) => (
              <button
                key={other.id}
                type="button"
                onClick={() => onOpen(other.id)}
                className="rounded-md bg-panel px-2 py-1 text-xs transition hover:bg-edge"
              >
                {other.className}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RecipeCard({
  recipe,
  canInsert,
  onInsert,
}: {
  recipe: Recipe;
  canInsert: boolean;
  onInsert: Props['onInsert'];
}) {
  return (
    <article className="rounded-xl bg-panel-raised p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <h3 className="text-sm font-semibold">{recipe.title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{recipe.blurb}</p>
      <p className="mt-1.5 text-[11px] text-ink-dim">
        Needs{' '}
        {recipe.needs.map((need, index) => (
          <span key={need}>
            {index > 0 && ', '}
            <code className="font-mono">{need}</code>
          </span>
        ))}
      </p>
      <div className="mt-2">
        <Code>{recipe.code}</Code>
      </div>
      <div className="mt-2 flex gap-2">
        <ActionButton
          label="Put in my code"
          done="Added"
          primary
          disabled={!canInsert}
          title={canInsert ? undefined : 'Open a code file first'}
          onClick={() => onInsert(recipe.code, 'block')}
        />
        <ActionButton
          label="Copy"
          done="Copied"
          onClick={() => {
            void navigator.clipboard.writeText(recipe.code);
          }}
        />
      </div>
    </article>
  );
}

export function HelpPanel({ declared, atCursor, canInsert, onInsert }: Props) {
  const [mode, setMode] = useState<'commands' | 'sheets'>('commands');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HelpCategory | 'All'>('All');
  const [openId, setOpenId] = useState<string | null>(null);

  const open = openId ? entryById(openId) : undefined;

  const results = useMemo(() => {
    const found = searchHelp(query);
    return category === 'All' ? found : found.filter((entry) => entry.category === category);
  }, [query, category]);

  // Grouped by class so Motor's commands read as Motor's, in the order given.
  const groups = useMemo(() => {
    const map = new Map<string, HelpEntry[]>();
    for (const entry of results) {
      const key = entry.className ?? 'Basics';
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return [...map];
  }, [results]);

  const searching = query.trim().length > 0;
  const total = helpEntries().length;

  return (
    <div className="vc-scroll flex h-full flex-col overflow-y-auto bg-panel p-2.5">
      <div className="mb-2.5 flex shrink-0 gap-1 rounded-lg bg-panel-raised p-1" role="group" aria-label="Help section">
        {(
          [
            ['commands', 'Commands'],
            ['sheets', 'Cheat sheets'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
              mode === id ? 'bg-panel shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'commands' && (
        <div className="space-y-3">
          {open ? (
            <div className="rounded-xl bg-panel-raised p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <EntryDetail
                entry={open}
                declared={declared}
                canInsert={canInsert}
                onInsert={onInsert}
                onOpen={setOpenId}
                onBack={() => setOpenId(null)}
              />
            </div>
          ) : (
            <>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${total} commands`}
                aria-label="Search commands"
                className="w-full rounded-lg border border-edge bg-panel-raised px-3 py-2 text-sm outline-none focus:border-vex"
              />

              {atCursor && !searching && (
                <button
                  type="button"
                  onClick={() => setOpenId(atCursor.id)}
                  className="block w-full rounded-xl bg-panel-raised p-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition hover:bg-edge"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-dim">
                    At your cursor
                  </span>
                  <span className="mt-0.5 block font-mono text-[13px] text-vex">
                    {atCursor.className && atCursor.type === 'member'
                      ? `${atCursor.className}.${atCursor.name}`
                      : atCursor.name}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-dim">{atCursor.detail}</span>
                </button>
              )}

              <div className="flex flex-wrap gap-1.5">
                {(['All', ...HELP_CATEGORIES] as const).map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={category === name}
                    onClick={() => setCategory(name)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      category === name ? 'bg-vex text-white' : 'bg-panel-raised hover:bg-edge'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              {groups.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-ink-dim">
                  Nothing matches “{query}”. Try a shorter word, like spin or turn.
                </p>
              ) : (
                groups.map(([name, entries]) => (
                  <section key={name} className="rounded-xl bg-panel-raised px-3 pb-2 pt-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-dim">
                      {name}
                    </h3>
                    <ul>
                      {entries.map((entry) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() => setOpenId(entry.id)}
                            className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1.5 text-left transition hover:bg-panel [@media(pointer:coarse)]:py-2.5"
                          >
                            <code className="shrink-0 font-mono text-[12px]">
                              {entry.type === 'class' ? `${entry.name}( )` : entry.name}
                            </code>
                            <span className="truncate text-[11px] text-ink-dim">{entry.detail}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </>
          )}
        </div>
      )}

      {mode === 'sheets' && (
        <div className="space-y-3">
          {RECIPES.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} canInsert={canInsert} onInsert={onInsert} />
          ))}

          <section className="rounded-xl bg-panel-raised p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h3 className="text-sm font-semibold">Units and constants</h3>
            <dl className="mt-2 space-y-1.5">
              {constantGroups().map((group) => (
                <div key={group.label} className="flex gap-2 text-xs">
                  <dt className="w-24 shrink-0 text-ink-dim">{group.label}</dt>
                  <dd className="flex flex-wrap gap-1">
                    {group.items.map((item) => (
                      <code key={item.name} className="rounded bg-panel px-1.5 py-0.5 font-mono text-[11px]">
                        {item.name}
                      </code>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl bg-panel-raised p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h3 className="text-sm font-semibold">Ports</h3>
            <dl className="mt-2 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-ink-dim">Smart ports</dt>
                <dd>
                  <code className="font-mono text-[11px]">Ports.PORT1</code> to{' '}
                  <code className="font-mono text-[11px]">Ports.PORT21</code>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-ink-dim">3-wire</dt>
                <dd>
                  <code className="font-mono text-[11px]">brain.three_wire_port.a</code> through{' '}
                  <code className="font-mono text-[11px]">.h</code>. An Encoder or Sonar uses two
                  neighbours, so starts on a, c, e or g.
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-ink-dim">Cartridges</dt>
                <dd className="space-y-0.5">
                  <div><code className="font-mono text-[11px]">RATIO_36_1</code> red, 100 rpm</div>
                  <div><code className="font-mono text-[11px]">RATIO_18_1</code> green, 200 rpm</div>
                  <div><code className="font-mono text-[11px]">RATIO_6_1</code> blue, 600 rpm</div>
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl bg-panel-raised p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h3 className="text-sm font-semibold">Mistakes that cost the most time</h3>
            <ul className="mt-2 divide-y divide-edge">
              {PITFALLS.map((item) => (
                <li key={item.title} className="py-2">
                  <p className="text-xs font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{item.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
