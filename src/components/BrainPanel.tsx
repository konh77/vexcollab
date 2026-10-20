/*
 * VEXCollab - the VEX V5 brain control panel.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { SlotNumber } from '@/lib/v5-serial-protocol/Vex';
import type { DeclaredDevice, Warning } from '@/lib/editor/useAnalysis';
import { PortMap } from './PortMap';
import type { V5Session } from '@/lib/vex/session';
import type { BrainSnapshot } from '@/lib/vex/types';
import { findEmptySlot } from '@/lib/vex/upload';
import { isV5Bytecode } from '@/lib/vex/bytecode';

const SLOTS: SlotNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

interface Props {
  session: V5Session;
  snapshot: BrainSnapshot;
  /** Captures the current room's Python source at build time. */
  getProgram: () => string;
  programFileCount: number;
  declaredDevices: DeclaredDevice[];
  findings: Warning[];
  onJump: (file: string, line: number) => void;
  /** Writes a device declaration into the project, from the port map. */
  onAssignDevice?: (declaration: string) => void;
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

export function BrainPanel({
  session,
  snapshot,
  getProgram,
  programFileCount,
  declaredDevices,
  findings,
  onJump,
  onAssignDevice,
}: Props) {
  const [slot, setSlot] = useState<SlotNumber | null>(null);
  const [programName, setProgramName] = useState('VEXCollab');
  const [description, setDescription] = useState('Uploaded from the browser');
  const [busyLabel, setBusyLabel] = useState('Working…');
  const [busy, setBusy] = useState(false);
  const [insecureContext, setInsecureContext] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const slotChosen = useRef(false);
  const uploadInFlight = useRef(false);

  const connected = snapshot.connectionState === 'connected';
  const connecting = snapshot.connectionState === 'connecting';
  const operationBusy = busy || Boolean(snapshot.transfer);

  useEffect(() => {
    if (!connected || !snapshot.programsLoaded || slotChosen.current) return;
    setSlot(findEmptySlot(snapshot.programs));
    // A full brain deliberately keeps the placeholder until the user picks a slot.
    slotChosen.current = true;
  }, [connected, snapshot.programsLoaded, snapshot.programs]);

  useEffect(() => {
    if (!connected) {
      setUploadSuccess(null);
      setSlot(null);
      slotChosen.current = false;
    }
  }, [connected]);

  // Read after mount: window.isSecureContext has no server-side equivalent and
  // reading it during render would desync hydration.
  useEffect(() => {
    setInsecureContext(!window.isSecureContext);
    // iPadOS reports itself as a Mac, so it is told apart by having a touch screen.
    setAppleMobile(
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    );
  }, []);

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
    ) : appleMobile ? (
      <div className="p-4 text-sm text-ink-dim">
        <p className="mb-2 font-medium text-ink">An iPhone or iPad cannot connect a brain.</p>
        <p className="mb-2">
          Apple does not let any iOS or iPadOS browser talk to a USB device, so this is not
          something Chrome or a different setting can fix.
        </p>
        <p>
          Reading and editing code works here as normal. To upload to a robot, open this room on
          a computer with Chrome or Edge — everything you wrote is already in the room.
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
    if (slot === null || !connected || !snapshot.programsLoaded || operationBusy || uploadInFlight.current) return;
    if (!programFileCount) return;
    if (!programName.trim()) {
      setBuildError('Give the program a name before uploading.');
      return;
    }
    uploadInFlight.current = true;
    setBusy(true);
    setBuildError(null);
    setUploadSuccess(null);
    try {
      setBusyLabel('Compiling…');
      const payload = await compileEditor();
      setBusyLabel('Uploading…');
      const ok = await session.upload({
        slot,
        name: programName.trim(),
        description,
        payload,
        format: 'mpy' as const,
      });
      if (ok) {
        setUploadSuccess(`${programName.trim()} uploaded to slot ${slot}. Use Run below when you are ready.`);
      } else {
        setBuildError(session.getSnapshot().lastError ?? 'Upload did not finish. Check the USB connection and try again.');
      }
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : String(error));
    } finally {
      uploadInFlight.current = false;
      setBusy(false);
    }
  };

  const compileEditor = async (): Promise<Uint8Array> => {
    const response = await fetch('/api/compile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: getProgram() }), signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json();
    if (!response.ok || typeof result.bytecode !== 'string') {
      throw new Error(result.error || 'Compilation failed. Try again.');
    }
    const bytes = Uint8Array.from(atob(result.bytecode), character => character.charCodeAt(0));
    if (!isV5Bytecode(bytes)) throw new Error('The server returned incompatible Python bytecode.');
    return bytes;
  };

  const downloadBuild = async () => {
    if (operationBusy || uploadInFlight.current || !programFileCount) return;
    uploadInFlight.current = true;
    setBusy(true);
    setBusyLabel('Compiling…');
    setBuildError(null);
    setUploadSuccess(null);
    try {
      const bytes = await compileEditor();
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${programName.replace(/[^\w-]/g, '_') || 'program'}.mpy`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setUploadSuccess(`Compiled ${bytes.length.toLocaleString()} bytes. Downloaded Python bytecode; connect the Brain to compile and upload directly.`);
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : String(error));
    } finally {
      uploadInFlight.current = false;
      setBusy(false);
    }
  };

  const exportPython = () => {
    const url = URL.createObjectURL(new Blob([getProgram()], { type: 'text/x-python;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vexcollab-main.py';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          disabled={operationBusy || connecting}
          className={`ml-auto rounded-md px-3 py-1 text-xs font-medium transition ${
            connected ? 'bg-panel hover:bg-edge' : 'bg-vex text-white hover:bg-vex-soft'
          } disabled:opacity-50`}
        >
          {connected ? 'Disconnect' : connecting ? 'Connecting…' : 'Connect USB'}
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

      <Section title="Upload to brain">
        <div className="space-y-3 text-sm">
          <div className="space-y-2 text-[12px] leading-relaxed text-ink-dim">
            <p>{programFileCount} Python {programFileCount === 1 ? 'file' : 'files'} · MicroPython 1.13</p>
            <button type="button" onClick={downloadBuild} disabled={operationBusy || !programFileCount}
              className="w-full rounded-lg border border-edge px-3 py-2 font-medium text-ink transition hover:bg-panel disabled:opacity-50">
              Compile & download
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-dim">Program name</span>
            <input
              value={programName}
              maxLength={23}
              disabled={operationBusy}
              onChange={(event) => {
                setProgramName(event.target.value);
                setBuildError(null);
                setUploadSuccess(null);
              }}
              placeholder="Program name"
              className="w-full rounded-md border border-edge bg-panel-raised px-2.5 py-1.5 outline-none focus:border-vex disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-dim">Program slot</span>
            <select
              value={slot ?? ''}
              disabled={operationBusy || connecting || (connected && !snapshot.programsLoaded)}
              onChange={(event) => {
                const value = event.target.value;
                setSlot(value ? Number(value) as SlotNumber : null);
                slotChosen.current = Boolean(value);
                setBuildError(null);
                setUploadSuccess(null);
              }}
              className="w-full rounded-md border border-edge bg-panel px-2.5 py-1.5 disabled:opacity-50"
            >
              <option value="">
                {connected && !snapshot.programsLoaded ? 'Reading program slots…' : 'Choose a slot'}
              </option>
              {SLOTS.map((value) => {
                const existing = snapshot.programs.find((program) => program.slot === value);
                return (
                  <option key={value} value={value}>
                    Slot {value}{snapshot.programsLoaded ? ` — ${existing?.name || 'Empty'}` : ''}
                  </option>
                );
              })}
            </select>
          </label>

          {connected && snapshot.programsLoaded && slot === null && findEmptySlot(snapshot.programs) === null && (
            <p className="text-[11px] leading-relaxed text-ink-dim">
              All eight slots are in use. Choose the program you want to replace.
            </p>
          )}
          {connected && slot !== null && snapshot.programs.some((program) => program.slot === slot) && (
            <p className="text-[11px] leading-relaxed text-ink-dim">
              Uploading replaces {snapshot.programs.find((program) => program.slot === slot)?.name || 'the program'} in slot {slot}.
            </p>
          )}

          <details className="text-[11px] text-ink-dim">
            <summary className="cursor-pointer">Description</summary>
            <input
              value={description}
              maxLength={256}
              disabled={operationBusy}
              onChange={(event) => setDescription(event.target.value)}
              aria-label="Program description"
              placeholder="Optional description"
              className="mt-2 w-full rounded-md border border-edge bg-panel-raised px-2.5 py-1.5 text-ink outline-none focus:border-vex disabled:opacity-50"
            />
          </details>

          {buildError && (
            <p role="alert" className="rounded-lg bg-panel px-2.5 py-2 text-[12px] leading-relaxed text-vex">
              {buildError}
            </p>
          )}
          {uploadSuccess && (
            <p role="status" className="rounded-lg bg-panel px-2.5 py-2 text-[12px] leading-relaxed text-ok">
              {uploadSuccess}
            </p>
          )}

          <button
            type="button"
            onClick={() => connected ? void upload() : void session.connect()}
            disabled={operationBusy || connecting || (connected && (!programFileCount || slot === null || !programName.trim() || !snapshot.programsLoaded))}
            className="w-full rounded-lg bg-vex px-3 py-2 text-sm font-medium text-white transition hover:bg-vex-soft disabled:opacity-50"
          >
            {operationBusy
              ? busyLabel
              : connecting
                ? 'Connecting…'
                : !connected
                  ? 'Connect USB'
                  : slot === null
                    ? 'Choose a slot'
                    : `Compile & upload to slot ${slot}`}
          </button>
          <p className="text-[11px] leading-relaxed text-ink-dim">
            Rebuilds the current editor code on every upload. Leaves the program stopped.
            Use Run below to start it.
          </p>

          <details className="border-t border-edge pt-2 text-[11px] text-ink-dim">
            <summary className="cursor-pointer">Python build details</summary>
            <p className="mt-2 leading-relaxed">
              Python files are combined into one program, with main.py last, then compiled.
              Functions share one namespace. The Brain needs the Python runtime installed by VEXcode.
            </p>
            <button
              type="button"
              onClick={exportPython}
              disabled={programFileCount === 0}
              className="mt-2 rounded-md bg-panel px-2.5 py-1.5 text-ink transition hover:bg-edge disabled:opacity-50"
            >
              Export Python ({programFileCount} {programFileCount === 1 ? 'file' : 'files'})
            </button>
          </details>
        </div>
      </Section>

      <Section title="Ports">
        <PortMap
          declared={declaredDevices}
          actual={snapshot.devices}
          connected={connected}
          onJump={onJump}
          onAssign={onAssignDevice}
        />
        {connected && declaredDevices.length > 0 && (
          <p className="mt-2 text-[11px] leading-relaxed text-ink-dim">
            Compared against what the brain reports right now.
          </p>
        )}
      </Section>

      {findings.length > 0 && (
        <Section title={`Checks (${findings.length})`}>
          <ul className="space-y-1.5">
            {findings.slice(0, 8).map((finding) => (
              <li key={`${finding.file}:${finding.line}:${finding.rule}`}>
                <button
                  type="button"
                  onClick={() => onJump(finding.file, finding.line)}
                  className="flex w-full gap-2 text-left"
                >
                  <span
                    className={`mt-1 size-1.5 shrink-0 rounded-full ${
                      finding.severity === 'error' ? 'bg-vex' : 'bg-warn'
                    }`}
                  />
                  <span className="flex-1">
                    <span className="block text-[12px] leading-snug">{finding.message}</span>
                    <span className="text-[10px] text-ink-dim">
                      {finding.file}:{finding.line}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
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
          </Section>

          <Section title="Programs on the brain">
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => session.refreshPrograms()}
                disabled={operationBusy}
                className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => session.stopProgram()}
                disabled={operationBusy || !snapshot.isRunningProgram}
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
                      disabled={operationBusy}
                      className="rounded-md bg-panel px-2.5 py-1 text-xs transition hover:bg-edge disabled:opacity-50"
                    >
                      Run
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${program.name}`}
                      title={`Delete ${program.name} from slot ${program.slot}`}
                      disabled={operationBusy}
                      onClick={() => {
                        // Deleting from a brain is not undoable, so make it a
                        // deliberate act rather than a stray click.
                        if (confirmDelete === program.binfile) {
                          void session.deleteProgram(program.binfile);
                          setConfirmDelete(null);
                        } else {
                          setConfirmDelete(program.binfile);
                        }
                      }}
                      className={`rounded-md px-2 py-1 text-xs transition disabled:opacity-50 ${
                        confirmDelete === program.binfile
                          ? 'bg-vex text-white'
                          : 'text-ink-dim hover:bg-panel hover:text-vex'
                      }`}
                    >
                      {confirmDelete === program.binfile ? 'Sure?' : '✕'}
                    </button>
                  </li>
                ))}
              </ul>
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
        {value || <span className="text-ink-dim">Not set</span>}
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
