/*
 * VEXCollab - the VEX V5 brain control panel.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useState } from 'react';
import type { SlotNumber } from '@/lib/v5-serial-protocol/Vex';
import { pythonPayload } from '@/lib/vex/program';
import type { V5Session } from '@/lib/vex/session';
import type { BrainSnapshot } from '@/lib/vex/types';

const SLOTS: SlotNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

interface Props {
  session: V5Session;
  snapshot: BrainSnapshot;
  /** Bundles every .py file in the room into the program to upload. */
  getProgram: () => string;
  programFileCount: number;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-ink-dim">{label}</span>
      <span className="truncate font-medium">{value ?? '—'}</span>
    </div>
  );
}

/** Every group is its own floating card, the way macOS settings panes read. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-panel-raised px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-dim">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function BrainPanel({ session, snapshot, getProgram, programFileCount }: Props) {
  const [slot, setSlot] = useState<SlotNumber>(1);
  const [programName, setProgramName] = useState('VEXCollab');
  const [description, setDescription] = useState('Uploaded from the browser');
  const [coldFile, setColdFile] = useState<File | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [insecureContext, setInsecureContext] = useState(false);
  const [latestFirmware, setLatestFirmware] = useState<string | null>(null);
  const [firmwareArmed, setFirmwareArmed] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const connected = snapshot.connectionState === 'connected';

  // Read after mount: window.isSecureContext has no server-side equivalent and
  // reading it during render would desync hydration.
  useEffect(() => {
    setInsecureContext(!window.isSecureContext);
  }, []);

  useEffect(() => {
    if (!connected) {
      setLatestFirmware(null);
      setFirmwareArmed(false);
      return;
    }
    let cancelled = false;
    void session.fetchLatestFirmware().then((version) => {
      if (!cancelled) setLatestFirmware(version);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, session]);

  if (snapshot.connectionState === 'unsupported') {
    // The usual cause on a teammate's laptop is not the browser at all — it is
    // that http://<lan-ip> is not a secure context, so Chrome hides WebSerial.
    return insecureContext ? (
      <div className="p-4 text-sm text-ink-dim">
        <p className="mb-2 font-medium text-ink">USB needs a secure connection.</p>
        <p className="mb-2">
          Your browser supports WebSerial, but hides it on{' '}
          <span className="font-mono text-xs">http://</span> addresses other than
          localhost. Editing works fine — only the brain is blocked.
        </p>
        <p>
          To use a brain from this machine, restart the server with{' '}
          <span className="rounded bg-panel px-1 py-0.5 font-mono text-xs">--https</span> and
          reopen this page over{' '}
          <span className="font-mono text-xs">https://</span>.
        </p>
      </div>
    ) : (
      <div className="p-4 text-sm text-ink-dim">
        <p className="mb-2 font-medium text-ink">No WebSerial in this browser.</p>
        <p>
          The editor still works, but talking to a brain needs Chrome, Edge or Opera on
          desktop. Safari and Firefox have not shipped the Web Serial API.
        </p>
      </div>
    );
  }

  const upload = async () => {
    setBusy(true);
    setBuildError(null);
    try {
      const payload = pythonPayload(getProgram());
      const coldPayload = coldFile
        ? new Uint8Array(await coldFile.arrayBuffer())
        : undefined;
      await session.upload({ slot, name: programName, description, payload, coldPayload });
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const updateFirmware = async () => {
    setBusy(true);
    setFirmwareArmed(false);
    try {
      await session.updateFirmware(latestFirmware ?? undefined);
    } finally {
      setBusy(false);
    }
  };

  const capture = async () => {
    setBusy(true);
    try {
      setScreenshot(await session.captureScreen());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vc-scroll flex h-full flex-col gap-3 overflow-y-auto bg-panel p-2.5">
      <div className="flex items-center gap-2 rounded-xl bg-panel-raised px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <span
          className={`size-2 rounded-full ${connected ? 'bg-ok' : 'bg-ink-dim'}`}
          aria-hidden
        />
        <span className="text-sm font-medium">
          {connected
            ? snapshot.isV5Controller
              ? 'V5 controller'
              : 'V5 brain'
            : snapshot.connectionState === 'connecting'
              ? 'Connecting…'
              : 'Not connected'}
        </span>
        <button
          type="button"
          onClick={() => (connected ? session.disconnect() : session.connect())}
          className={`ml-auto rounded-md px-3 py-1 text-xs font-medium transition ${
            connected ? 'bg-panel hover:bg-edge' : 'bg-vex text-white hover:bg-vex-soft'
          }`}
        >
          {connected ? 'Disconnect' : 'Connect USB'}
        </button>
      </div>

      {snapshot.lastError && (
        <div className="flex items-start gap-2.5 rounded-xl bg-panel-raised px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="mt-px shrink-0 text-vex"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div className="flex-1">
            <div className="mb-0.5 text-[13px] font-medium">Something went wrong</div>
            <div className="text-[11.5px] leading-[1.45] text-ink-dim">{snapshot.lastError}</div>
          </div>
          <button
            type="button"
            onClick={() => session.clearError()}
            aria-label="Dismiss error"
            className="shrink-0 text-ink-dim transition hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      {snapshot.transfer && (
        <div className="rounded-xl bg-panel-raised px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <div className="mb-1 flex justify-between text-xs text-ink-dim">
            <span>{snapshot.transfer.label}</span>
            <span>
              {Math.min(100, Math.round((snapshot.transfer.current / Math.max(1, snapshot.transfer.total)) * 100))}%
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[#e8e8ed]">
            <div
              className="h-full rounded-full bg-vex transition-[width]"
              style={{
                width: `${Math.min(100, (snapshot.transfer.current / Math.max(1, snapshot.transfer.total)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {connected && (
        <>
          <Section title="Brain">
            <Row
              label="Name"
              value={
                <EditableValue
                  value={snapshot.brainName}
                  onCommit={(v) => session.setBrainName(v)}
                />
              }
            />
            <Row
              label="Team"
              value={
                <EditableValue
                  value={snapshot.teamNumber}
                  onCommit={(v) => session.setTeamNumber(v)}
                />
              }
            />
            <Row
              label="Battery"
              value={
                snapshot.batteryPercent == null
                  ? '—'
                  : `${snapshot.batteryPercent}%${snapshot.isCharging ? ' (charging)' : ''}`
              }
            />
            <Row label="vexOS" value={snapshot.systemVersion} />
            <Row label="CPU0 / CPU1" value={`${snapshot.cpu0Version ?? '—'} / ${snapshot.cpu1Version ?? '—'}`} />
            <Row label="Unique ID" value={snapshot.uniqueId?.toString(16).toUpperCase()} />
          </Section>

          {snapshot.radio.isAvailable && (
            <Section title="Radio">
              <Row label="Link" value={snapshot.radio.isConnected ? 'Connected' : 'Idle'} />
              <Row label="Type" value={snapshot.radio.isVexNet ? 'VEXnet' : 'Bluetooth'} />
              <Row label="Channel" value={snapshot.radio.channel} />
              <Row label="Latency" value={snapshot.radio.latency != null ? `${snapshot.radio.latency} ms` : null} />
            </Section>
          )}

          <Section title={`Devices (${snapshot.devices.length})`}>
            {snapshot.devices.length === 0 ? (
              <p className="text-sm text-ink-dim">Nothing plugged into the smart ports.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {snapshot.devices.map((device) => (
                  <li key={device.port} className="flex justify-between gap-2">
                    <span className="text-ink-dim">Port {device.port}</span>
                    <span className="truncate font-medium">{device.type}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {snapshot.controllers.length > 0 && (
            <Section title="Controllers">
              {snapshot.controllers.map((controller) => (
                <Row
                  key={controller.index}
                  label={controller.isMaster ? 'Primary' : 'Partner'}
                  value={`${controller.batteryPercent}%${controller.isCharging ? ' (charging)' : ''}`}
                />
              ))}
            </Section>
          )}

          <Section title="Upload">
            <div className="space-y-2 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span className="text-ink-dim">Slot</span>
                <select
                  value={slot}
                  onChange={(event) => setSlot(Number(event.target.value) as SlotNumber)}
                  className="rounded-md bg-panel px-2 py-1"
                >
                  {SLOTS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <input
                value={programName}
                onChange={(event) => setProgramName(event.target.value)}
                aria-label="Program name"
                placeholder="Program name"
                className="w-full rounded-md border border-edge bg-panel-raised px-2.5 py-1.5 outline-none focus:border-vex"
              />
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-label="Program description"
                placeholder="Description"
                className="w-full rounded-md border border-edge bg-panel-raised px-2.5 py-1.5 outline-none focus:border-vex"
              />

              <p className="text-xs leading-relaxed text-ink-dim">
                Bundles{' '}
                <span className="font-medium text-ink">
                  {programFileCount} Python file{programFileCount === 1 ? '' : 's'}
                </span>{' '}
                into one program in slot {slot} — modules first, <code>main.py</code> last.
              </p>

              {buildError && (
                <pre className="vc-scroll max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-vex/8 p-2 text-[10px] leading-relaxed text-vex-soft">
                  {buildError}
                </pre>
              )}

              <details className="text-xs text-ink-dim">
                <summary className="cursor-pointer select-none">Runtime image (advanced)</summary>
                <p className="mt-1">
                  If your brain needs the shared Python runtime uploaded alongside the program,
                  point at the image from your own VEXcode install. It is never bundled here.
                </p>
                <input
                  type="file"
                  onChange={(event) => setColdFile(event.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-xs"
                />
              </details>

              <button
                type="button"
                onClick={upload}
                disabled={busy || Boolean(snapshot.transfer)}
                className="w-full rounded-lg bg-vex px-3 py-2 text-sm font-medium text-white transition hover:bg-vex-soft disabled:opacity-50"
              >
                Upload to slot {slot}
              </button>
            </div>
          </Section>

          <Section title="Programs on the brain">
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => session.refreshPrograms()}
                className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => session.stopProgram()}
                disabled={!snapshot.isRunningProgram}
                className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge disabled:opacity-40"
              >
                Stop running program
              </button>
            </div>
            {snapshot.programs.length === 0 ? (
              <p className="text-sm text-ink-dim">No programs found.</p>
            ) : (
              <ul className="space-y-1">
                {snapshot.programs.map((program) => (
                  <li
                    key={program.binfile}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-panel"
                  >
                    <span className="w-6 shrink-0 text-ink-dim">{program.slot}</span>
                    <span className="flex-1 truncate">{program.name}</span>
                    {snapshot.activeProgram === program.slot && (
                      <span className="text-xs text-ok">running</span>
                    )}
                    <button
                      type="button"
                      onClick={() => session.runProgram(program.slot as SlotNumber)}
                      className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge"
                    >
                      Run
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Firmware">
            <Row label="Installed" value={snapshot.systemVersion} />
            <Row label="Latest from VEX" value={latestFirmware ?? 'checking…'} />

            {latestFirmware && snapshot.systemVersion === latestFirmware ? (
              <p className="mt-2 text-xs text-ink-dim">Already on the current vexOS.</p>
            ) : (
              <>
                <p className="mt-2 text-xs leading-relaxed text-ink-dim">
                  Flashing rewrites the brain's boot image.{' '}
                  <span className="font-medium text-ink">
                    Do not unplug or close this tab while it runs
                  </span>{' '}
                  — an interrupted flash can leave the brain unbootable. Use a charged
                  battery and a data cable, and quit any other VEX software first.
                </p>

                {firmwareArmed ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={updateFirmware}
                      disabled={busy || Boolean(snapshot.transfer)}
                      className="flex-1 rounded-lg bg-vex px-3 py-2 text-sm font-medium text-white transition hover:bg-vex-soft disabled:opacity-50"
                    >
                      Yes, flash {latestFirmware}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFirmwareArmed(false)}
                      className="rounded-lg bg-panel px-3 py-2 text-sm transition hover:bg-edge"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFirmwareArmed(true)}
                    disabled={busy || !latestFirmware || Boolean(snapshot.transfer)}
                    className="mt-2 w-full rounded-lg border border-edge bg-panel-raised px-3 py-2 text-sm font-medium transition hover:bg-panel disabled:opacity-50"
                  >
                    Update vexOS{latestFirmware ? ` to ${latestFirmware}` : ''}
                  </button>
                )}
              </>
            )}
          </Section>

          <Section title="Brain screen">
            <button
              type="button"
              onClick={capture}
              disabled={busy || Boolean(snapshot.transfer)}
              className="rounded-md bg-panel px-3 py-1.5 text-xs transition hover:bg-edge disabled:opacity-50"
            >
              Capture screen
            </button>
            {screenshot ? (
              <div className="mt-2.5 space-y-2">
                {/* The V5 LCD is 480x272; keep that ratio so it looks like the brain. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={screenshot}
                  alt="VEX V5 brain screen"
                  className="w-full rounded-lg border border-black/10 bg-[#1b1b1f]"
                  style={{ aspectRatio: '480 / 272' }}
                />
                <a href={screenshot} download="v5-screen.png" className="text-[11.5px] text-vex hover:underline">
                  Save PNG
                </a>
              </div>
            ) : (
              <div
                className="mt-2.5 grid place-items-center rounded-lg border border-black/10 bg-[#1b1b1f] text-[11px] text-[#86868b]"
                style={{ aspectRatio: '480 / 272' }}
              >
                No capture yet
              </div>
            )}
          </Section>
        </>
      )}

      {!connected && snapshot.connectionState !== 'connecting' && (
        <div className="flex flex-col items-center gap-2.5 rounded-xl bg-panel-raised px-4 py-5 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <svg
            width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            className="text-[#c7c7cc]"
          >
            <path d="M12 21V8" />
            <circle cx="12" cy="22" r="1" fill="currentColor" />
            <path d="M9 8V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4z" />
            <path d="M8 13h3" />
            <path d="M13 17h3" />
          </svg>
          <p className="max-w-[250px] text-[12px] leading-[1.5] text-ink-dim">
            Plug a V5 into USB. The browser will ask which serial port to use — pick the VEX one.
          </p>
        </div>
      )}
    </div>
  );
}

function EditableValue({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(value ?? '')}
        className="underline decoration-dotted underline-offset-2 hover:text-vex-soft"
      >
        {value || 'set'}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onCommit(draft.trim());
          setDraft(null);
        }
        if (event.key === 'Escape') setDraft(null);
      }}
      className="w-28 rounded-md border border-edge bg-panel-raised px-1.5 text-right outline-none focus:border-vex"
    />
  );
}
