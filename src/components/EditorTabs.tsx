/*
 * VEXCollab - open file tabs.
 * Licensed under AGPL-3.0-only.
 */
'use client';

interface Props {
  open: string[];
  active: string;
  problemsByPath: Record<string, number>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function EditorTabs({ open, active, problemsByPath, onSelect, onClose }: Props) {
  if (open.length === 0) return null;

  return (
    <div className="vc-scroll flex shrink-0 overflow-x-auto border-b border-edge bg-panel">
      {open.map((path) => {
        const isActive = path === active;
        const problems = problemsByPath[path] ?? 0;
        return (
          <div
            key={path}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => onSelect(path)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(path);
            }}
            className={`group flex cursor-pointer items-center gap-2 border-r border-edge px-3 py-1.5 text-[12px] whitespace-nowrap transition ${
              isActive ? 'bg-shell text-ink' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {problems > 0 && <span className="size-1.5 shrink-0 rounded-full bg-vex" title={`${problems} problem(s)`} />}
            <span>{path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path}</span>
            <button
              type="button"
              aria-label={`Close ${path}`}
              onClick={(event) => {
                event.stopPropagation();
                onClose(path);
              }}
              className="rounded px-0.5 text-ink-dim opacity-0 transition group-hover:opacity-100 hover:bg-edge hover:text-ink"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
