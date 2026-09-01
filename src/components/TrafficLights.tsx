/*
 * VEXCollab - macOS window controls.
 * Licensed under AGPL-3.0-only.
 */
'use client';

interface Props {
  onClose?: () => void;
  /** A window that cannot be closed shows the dots greyed, like an inactive one. */
  active?: boolean;
}

export function TrafficLights({ onClose, active = true }: Props) {
  const dots = [
    { color: '#ff5f57', ring: '#e0443e', label: 'Close', action: onClose },
    { color: '#febc2e', ring: '#dea123', label: 'Minimise' },
    { color: '#28c840', ring: '#1aab29', label: 'Zoom' },
  ];

  return (
    <div className="group flex items-center gap-2">
      {dots.map((dot) => (
        <button
          key={dot.label}
          type="button"
          aria-label={dot.label}
          onClick={dot.action}
          disabled={!dot.action}
          style={{
            backgroundColor: active ? dot.color : '#d6d6d8',
            borderColor: active ? dot.ring : '#c8c8ca',
          }}
          className="size-3 rounded-full border transition disabled:cursor-default"
        />
      ))}
    </div>
  );
}
