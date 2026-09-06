/*
 * VEXCollab - live session with a VEX V5 brain over WebSerial.
 * Licensed under AGPL-3.0-only.
 *
 * This wraps the vendored MIT `v5-serial-protocol` library (see
 * src/lib/v5-serial-protocol/VENDORED.md) in a small observable store that
 * React can subscribe to. Nothing here is derived from VEX Robotics' own
 * tooling; it speaks the same wire protocol, which is what "native" means.
 */
'use client';

import {
  FileDownloadTarget,
  SmartDeviceType,
  type SlotNumber,
  type ZerobaseSlotNumber,
} from '@/lib/v5-serial-protocol/Vex';
import { V5SerialConnection } from '@/lib/v5-serial-protocol/VexConnection';
import { V5SerialDevice } from '@/lib/v5-serial-protocol/VexDevice';
import { ProgramIniConfig } from '@/lib/v5-serial-protocol/VexIniConfig';
import { compareVersions, parseVersion } from './firmware';
import { EMPTY_SNAPSHOT, type BrainFile, type BrainSnapshot, type UploadRequest } from './types';

const VEX_USB_VENDOR_ID = 0x2888;

/**
 * A V5 does not answer on a port that has only just opened. Measured against
 * real hardware: a probe sent at 0 ms gets nothing at all, one sent at 200 ms
 * comes back in 2 ms. 350 ms leaves margin on a slower machine.
 *
 * This is the whole reason `V5SerialDevice.connect()` is not used directly —
 * it probes with `query1` on a *100 ms* timeout, which lands squarely inside
 * that dead window, so it declares a perfectly healthy brain silent and moves
 * on to the next port. Opening the port here, letting it settle, and handing
 * the already-awake connection to the library avoids that entirely.
 *
 * PROS reaches the same place from the other direction: its V5 transport also
 * uses a 100 ms timeout, but wraps every command in a retry decorator, so a
 * first exchange lost to a cold port simply goes again. Settling and probing
 * up to PROBE_ATTEMPTS times does both.
 */
const PORT_SETTLE_MS = 350;

/** A cold brain can take a while to answer the first packet. Be patient once. */
const PROBE_TIMEOUT_MS = 1500;

/** How many times to re-probe a settled port before giving up on it. */
const PROBE_ATTEMPTS = 3;

const POLL_MS = 2000;

const NO_REPLY =
  'A VEX device was opened but never answered. Close VEXcode or any other tab ' +
  'using the brain, then unplug and replug the cable.';

const NOT_FOUND =
  'No VEX device found. Check the USB cable, and make sure the brain is powered on.';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The brain's key/value store is the one part of the protocol the vendored
 * library marks "UNSURE", and on real hardware `robotname` reads back while
 * `teamnumber` returns empty. Rather than guess a single name, try the
 * plausible ones and use whichever actually answers.
 */
const TEAM_KEYS = ['teamnumber', 'teamnum', 'team_number', 'team'];
const NAME_KEYS = ['robotname', 'robot_name', 'name'];

/**
 * VexFirmwareVersion is a class, so String() on it yields "[object Object]".
 * Real hardware caught this: the panel showed that for vexOS and both CPUs.
 */
function formatVersion(value: unknown): string | null {
  if (value == null) return null;
  const candidate = value as { toUserString?: () => string };
  if (typeof candidate.toUserString === 'function') return candidate.toUserString();
  const text = String(value);
  return text === '[object Object]' ? null : text;
}

/**
 * Type 129 is a *generic serial device* in VEX's own numbering — not a marker
 * for "nothing plugged in", which is what this constant used to claim.
 * Cross-checked against PROS (purduesigbots/pros, MPL-2.0), an independent
 * open-source V5 implementation whose `v5_device_e_t` is documented as
 * mirroring VEX's `V5_DeviceType`: there it is `E_DEVICE_SERIAL = 129`.
 *
 * The observation behind the old name still holds, it was just read too
 * broadly: an *unconfigured* port reports 129 with version 0, and a brain with
 * all twenty ports empty reports that on every one of them. So the filter
 * below is right to hide 129-with-version-0 and would be wrong to hide 129
 * outright — a real serial device carries a version.
 */
const GENERIC_SERIAL_TYPE = 129;

/**
 * Display names for types the vendored `SmartDeviceType` enum does not carry,
 * so a device the protocol library predates reads as itself rather than as
 * "Type 129".
 */
const EXTRA_DEVICE_NAMES: Record<number, string> = {
  [GENERIC_SERIAL_TYPE]: 'Serial',
};

/**
 * A V5 reports an entry for every smart port whether or not anything is
 * plugged in, so the empty ones have to be recognised or twenty phantom
 * devices appear. Anything unrecognised *with* a version is still kept, so a
 * sensor newer than the protocol's enum shows up rather than being hidden.
 */
function isRealDevice(type: SmartDeviceType | undefined, version: number): boolean {
  if (type === undefined) return false;
  if ((type as number) === GENERIC_SERIAL_TYPE && version === 0) return false;
  if (type === SmartDeviceType.EMPTY || type === SmartDeviceType.UNDEFINED_SENSOR) return false;
  const known = SmartDeviceType[type] !== undefined;
  return known || version > 0;
}

function smartDeviceName(type: SmartDeviceType | undefined): string {
  if (type === undefined) return 'Unknown';
  const name = SmartDeviceType[type];
  if (!name) return EXTRA_DEVICE_NAMES[type as number] ?? `Type ${type}`;
  // MOTOR_29 -> Motor 29
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The brain stores a program's display name in a fixed field. PROS truncates
 * to 23 characters before writing the .ini; this used to allow 32, which is
 * past whatever the brain actually keeps.
 */
const MAX_PROGRAM_NAME = 23;

/**
 * Which icon a slot gets. PROS selects USER902x.bmp only on cpu0 >= 1.0.0-22
 * and USER999x.bmp below it — older boot code does not carry the newer asset.
 *
 * The boundary is approximated at 1.0.0, because the version parser here
 * flattens semver prereleases; the difference only exists for 1.0.0-1 through
 * 1.0.0-21, which is 2018 pre-release firmware. Anything unknown or
 * unparseable keeps the modern name.
 */
function programIcon(cpu0Version: string | null): string {
  const installed = parseVersion(cpu0Version);
  if (!installed) return 'USER902x.bmp';
  const boundary = { parts: [1, 0, 0], display: '1.0.0' };
  return compareVersions(installed, boundary) < 0 ? 'USER999x.bmp' : 'USER902x.bmp';
}

export class V5Session {
  private device: V5SerialDevice | null = null;
  private connection: V5SerialConnection | null = null;
  private listeners = new Set<() => void>();
  private snapshot: BrainSnapshot = EMPTY_SNAPSHOT;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Which key name actually worked, per logical field. */
  private workingKeys = new Map<string, string>();

  /**
   * The wire protocol is strictly one request, one reply, and the vendored
   * reader matches an incoming packet to the *oldest queued request with the
   * same command id*. Two overlapping calls therefore get handed each other's
   * answers — and a timeout pops the head of the queue whether or not that is
   * the request that timed out, which desynchronises it for good.
   *
   * So every exchange with the brain goes through this chain, in order. The
   * poll timer and a user pressing Run can no longer collide.
   */
  private chain: Promise<unknown> = Promise.resolve();
  private queued = 0;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  constructor() {
    if (!V5Session.isSupported()) {
      this.snapshot = { ...EMPTY_SNAPSHOT, connectionState: 'unsupported' };
    }
  }

  // --- store plumbing -----------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): BrainSnapshot => this.snapshot;

  private patch(next: Partial<BrainSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((l) => l());
  }

  private fail(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : String(error);
    this.patch({ lastError: `${context}: ${message}` });
    return null;
  }

  clearError() {
    this.patch({ lastError: null });
  }

  /** Runs `work` with sole ownership of the serial link. */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    this.queued += 1;
    const run = this.chain.then(work);
    // The chain itself must never reject, or every later call inherits it.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(() => {
      this.queued -= 1;
    });
  }

  /** True while anything is talking to the brain. */
  get isBusy(): boolean {
    return this.queued > 0;
  }

  // --- connection ---------------------------------------------------------

  async connect(): Promise<boolean> {
    if (!V5Session.isSupported()) return false;
    if (this.snapshot.connectionState !== 'disconnected') {
      return this.snapshot.connectionState === 'connected';
    }

    this.patch({ connectionState: 'connecting', lastError: null });
    try {
      const { connection, error } = await this.openConnection();
      if (!connection) {
        this.patch({ connectionState: 'disconnected', lastError: error });
        return false;
      }

      const device = new V5SerialDevice(navigator.serial);
      // The library's reconnect loop is `while (timeout === 0 || ...)`, which
      // never exits when called with its default timeout, and it re-opens
      // ports behind our back — including the one the terminal wants. We
      // notice the unplug ourselves instead.
      device.autoReconnect = false;

      if (!(await device.connect(connection))) {
        await connection.close();
        this.patch({ connectionState: 'disconnected', lastError: NO_REPLY });
        return false;
      }

      this.device = device;
      this.connection = connection;
      connection.on('disconnected', this.handleDisconnected);
      this.patch({ connectionState: 'connected' });

      // handleDisconnected only fires for a session already marked connected,
      // so a cable pulled during the handshake would otherwise leave a dead
      // device looking live. Re-check now that the state is settled.
      if (!device.isConnected) {
        this.handleDisconnected();
        return false;
      }

      await this.readIdentity();
      await this.refresh();
      await this.refreshPrograms();

      // The brain does not push state, so poll for battery/program changes.
      this.pollTimer = setInterval(() => {
        // An upload or a firmware flash owns the link for minutes. Queueing
        // polls behind it would fire a burst of stale refreshes the instant
        // it finished, so skip the tick instead.
        if (this.queued > 0) return;
        void this.refresh();
      }, POLL_MS);
      return true;
    } catch (error) {
      this.patch({ connectionState: 'disconnected' });
      this.fail(error, 'Connect failed');
      return false;
    }
  }

  /**
   * Finds a V5 that actually answers. Already-granted ports are tried first so
   * reconnecting is one click, and only then is the browser's picker shown.
   *
   * `error` is null when the user simply dismissed the picker — cancelling is
   * not a failure and must not raise an alarm in the panel.
   */
  private async openConnection(): Promise<{
    connection: V5SerialConnection | null;
    error: string | null;
  }> {
    // Indices here have to line up exactly with the ones `conn.open(index)`
    // resolves against, so the list is filtered with the connection's own
    // filters rather than a vendor id of our own — those also pin the product
    // id, and a mismatched count would make us index past the end of theirs.
    const { filters } = new V5SerialConnection(navigator.serial);
    const granted = (await navigator.serial.getPorts()).filter((port) => {
      if (port.readable) return false; // already open elsewhere in this tab
      const info = port.getInfo();
      return filters.some(
        (filter: SerialPortFilter) =>
          (filter.usbVendorId === undefined || filter.usbVendorId === info.usbVendorId) &&
          (filter.usbProductId === undefined || filter.usbProductId === info.usbProductId),
      );
    });

    let openedSomething = false;

    for (let index = 0; index < granted.length; index += 1) {
      const conn = new V5SerialConnection(navigator.serial);
      // `false` keeps the picker closed: these are ports we already hold
      // permission for. A V5 exposes two of them and only one speaks packets,
      // so working through the list is normal, not a fallback.
      const opened = await conn.open(index, false);
      if (opened !== true) {
        await conn.close();
        continue;
      }
      openedSomething = true;
      if (await this.probe(conn)) return { connection: conn, error: null };
      await conn.close();
    }

    // Nothing granted answered. An index past the end of the list is what
    // makes `open` fall through to the picker instead of reusing a port.
    const conn = new V5SerialConnection(navigator.serial);
    const opened = await conn.open(granted.length, true);
    if (opened === undefined) {
      // No port chosen: either the picker was dismissed, or there was nothing
      // in it. Only the second case is worth reporting.
      await conn.close();
      return { connection: null, error: openedSomething ? NO_REPLY : null };
    }
    if (opened !== true) {
      await conn.close();
      return { connection: null, error: 'That port is already open in another tab.' };
    }
    if (await this.probe(conn)) return { connection: conn, error: null };

    await conn.close();
    return { connection: null, error: NO_REPLY };
  }

  /** Lets a freshly opened port settle, then asks the brain to say something. */
  private async probe(conn: V5SerialConnection): Promise<boolean> {
    for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
      await sleep(PORT_SETTLE_MS);
      try {
        if (await conn.getSystemStatus(PROBE_TIMEOUT_MS)) return true;
      } catch {
        // A port that throws mid-probe is the wrong port; try the next one.
        return false;
      }
    }
    return false;
  }

  /**
   * The cable came out, or the brain rebooted. Without this the panel keeps
   * showing a green dot and a battery percentage for hardware that is no
   * longer there, and the poll timer keeps writing to a dead port.
   */
  private handleDisconnected = () => {
    if (this.snapshot.connectionState !== 'connected') return;
    this.stopPolling();
    this.device = null;
    this.connection = null;
    this.workingKeys.clear();
    this.snapshot = {
      ...EMPTY_SNAPSHOT,
      lastError: 'The brain disconnected. Check the cable, then connect again.',
    };
    this.listeners.forEach((l) => l());
  };

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async disconnect() {
    this.stopPolling();
    this.connection?.remove('disconnected', this.handleDisconnected);
    try {
      await this.device?.disconnect();
    } catch {
      // Unplugging mid-session throws here; the state reset below is what matters.
    }
    this.device = null;
    this.connection = null;
    this.workingKeys.clear();
    // An unsupported browser stays unsupported — resetting to "disconnected"
    // would offer a Connect button that cannot possibly work.
    this.snapshot = V5Session.isSupported()
      ? { ...EMPTY_SNAPSHOT }
      : { ...EMPTY_SNAPSHOT, connectionState: 'unsupported' };
    this.listeners.forEach((l) => l());
  }

  /** Pull a fresh view of brain state. Safe to call on a timer. */
  async refresh() {
    return this.exclusive(() => this.refreshLocked());
  }

  private async refreshLocked() {
    const device = this.device;
    if (!device?.isConnected) return;

    try {
      await device.refresh();
      // The cable can come out while those round trips are in flight. Writing
      // the results now would paint a live-looking brain over the panel that
      // handleDisconnected has just cleared.
      if (this.device !== device || this.snapshot.connectionState !== 'connected') return;
      const brain = device.brain;

      this.patch({
        isV5Controller: device.isV5Controller,
        uniqueId: brain.uniqueId ?? null,
        systemVersion: formatVersion(brain.systemVersion),
        cpu0Version: formatVersion(brain.cpu0Version),
        cpu1Version: formatVersion(brain.cpu1Version),
        batteryPercent: brain.battery.batteryPercent ?? null,
        isCharging: Boolean(brain.battery.isCharging),
        activeProgram: brain.activeProgram ?? 0,
        isRunningProgram: brain.isRunningProgram,
        matchMode: (device.matchMode as BrainSnapshot['matchMode']) ?? null,
        isFieldControllerConnected: Boolean(device.isFieldControllerConnected),
        button: {
          pressed: Boolean(brain.button.isPressed),
          doublePressed: Boolean(brain.button.isDoublePressed),
        },
        screen: {
          reversed: Boolean(brain.settings.isScreenReversed),
          whiteTheme: Boolean(brain.settings.isWhiteTheme),
          language:
            brain.settings.usingLanguage != null ? String(brain.settings.usingLanguage) : null,
        },
        radio: {
          isAvailable: Boolean(device.radio.isAvailable),
          isConnected: Boolean(device.radio.isConnected),
          isVexNet: Boolean(device.radio.isVexNet),
          isRadioData: Boolean(device.radio.isRadioData),
          channel: device.radio.channel != null ? String(device.radio.channel) : null,
          latency: device.radio.latency ?? null,
        },
        // Kept unfiltered so "the brain sees nothing" can be told apart from
        // "we filtered it out" — a distinction that matters when a sensor is
        // missing and nobody knows whose fault it is.
        rawDevices: device.devices
          .filter((d) => d.isAvailable)
          .map((d) => ({
            port: d.port ?? 0,
            type: Number(d.type ?? -1),
            version: Number(d.version ?? 0),
          })),
        devices: device.devices
          .filter((d) => d.isAvailable && isRealDevice(d.type, Number(d.version ?? 0)))
          .map((d) => ({
            port: d.port ?? 0,
            type: smartDeviceName(d.type),
            version: formatVersion(d.version) ?? String(d.version ?? '-'),
            rawType: Number(d.type ?? -1),
          })),
        controllers: device.controllers
          .filter((c) => c.isAvailable)
          .map((c, index) => ({
            index,
            isMaster: Boolean(c.isMasterController),
            batteryPercent: c.batteryPercent ?? 0,
            isCharging: Boolean(c.isCharging),
          })),
      });
    } catch (error) {
      if (this.device !== device) return; // already torn down; not worth reporting
      this.fail(error, 'Refresh failed');
    }
  }

  /**
   * Name and team number, which live in the key/value store rather than in
   * system status. Deliberately *not* part of the poll: probing four key names
   * is up to seven extra round trips, and neither value changes unless this
   * app or somebody at the brain's own menu changes it.
   */
  async readIdentity() {
    return this.exclusive(() => this.readIdentityLocked());
  }

  private async readIdentityLocked() {
    if (!this.device?.isConnected) return;
    // Sequentially, not in parallel: replies are matched by command id, so two
    // key reads in flight at once can be handed each other's values — which
    // showed up as the team number appearing in the name field.
    const brainName = await this.readFirstLocked(NAME_KEYS);
    const teamNumber = await this.readFirstLocked(TEAM_KEYS);
    this.patch({
      // An empty read is not proof the value is unset — keep what we have.
      brainName: brainName ? String(brainName) : this.snapshot.brainName,
      teamNumber: teamNumber ? String(teamNumber) : this.snapshot.teamNumber,
    });
  }

  async refreshPrograms() {
    return this.exclusive(() => this.refreshProgramsLocked());
  }

  private async refreshProgramsLocked() {
    const device = this.device;
    if (!device?.isConnected) return;
    try {
      const programs = (await device.brain.listProgram()) ?? [];
      this.patch({
        programs: programs.map((p) => ({
          name: p.name,
          binfile: p.binfile,
          slot: p.slot + 1,
          size: p.size,
          time: p.time instanceof Date ? p.time.toISOString() : String(p.time),
        })),
      });
    } catch (error) {
      this.fail(error, 'Reading program slots failed');
    }
  }

  /** Everything stored on the brain, not just the program slots. */
  async listBrainFiles(): Promise<BrainFile[]> {
    return this.exclusive(async () => {
      const device = this.device;
      if (!device?.isConnected) return [];
      try {
        const files = (await device.brain.listFiles()) ?? [];
        return files.map((file: Record<string, any>) => ({
          filename: String(file.filename ?? '?'),
          size: Number(file.size ?? 0),
          type: String(file.type ?? ''),
          timestamp:
            file.timestamp instanceof Date
              ? file.timestamp.toISOString()
              : String(file.timestamp ?? ''),
        }));
      } catch (error) {
        this.fail(error, 'Listing files failed');
        return [];
      }
    });
  }

  /** Returns the first key that yields a non-empty value, and remembers it. */
  private async readFirstLocked(keys: string[]): Promise<string | null> {
    for (const key of keys) {
      const value = await this.readValueLocked(key);
      if (value && value.trim()) {
        this.workingKeys.set(keys[0], key);
        return value.trim();
      }
    }
    return null;
  }

  /** Arbitrary key/value read off the brain — useful for poking at settings. */
  async readValue(key: string): Promise<string | null> {
    return this.exclusive(() => this.readValueLocked(key));
  }

  private async readValueLocked(key: string): Promise<string | null> {
    try {
      const value = await this.device?.brain.getValue(key);
      return value != null ? String(value) : null;
    } catch {
      return null;
    }
  }

  // --- program control ----------------------------------------------------

  async runProgram(slot: SlotNumber) {
    return this.exclusive(async () => {
      const conn = this.connection;
      if (!conn) return;
      try {
        await conn.loadProgram(slot);
        await this.refreshLocked();
      } catch (error) {
        this.fail(error, `Running slot ${slot} failed`);
      }
    });
  }

  async stopProgram() {
    return this.exclusive(async () => {
      const conn = this.connection;
      if (!conn) return;
      try {
        await conn.stopProgram();
        await this.refreshLocked();
      } catch (error) {
        this.fail(error, 'Stopping the program failed');
      }
    });
  }

  /**
   * Drives the competition state machine from here, so autonomous can be
   * tested without a field controller or a competition switch.
   */
  async setMatchMode(mode: 'driver' | 'autonomous' | 'disabled') {
    return this.exclusive(async () => {
      const conn = this.connection;
      if (!conn) return;
      try {
        await conn.setMatchMode(mode);
        this.patch({ matchMode: mode });
        await this.refreshLocked();
      } catch (error) {
        this.fail(error, `Switching to ${mode} failed`);
      }
    });
  }

  /** Removes a program from the brain by its binary's filename. */
  async deleteProgram(binfile: string) {
    return this.exclusive(async () => {
      const device = this.device;
      if (!device?.isConnected) return;
      try {
        await device.brain.removeFile(binfile);
        await this.refreshProgramsLocked();
      } catch (error) {
        this.fail(error, `Deleting ${binfile} failed`);
      }
    });
  }

  /** Taps the brain's touchscreen, for driving on-screen menus remotely. */
  async touchScreen(x: number, y: number) {
    return this.exclusive(async () => {
      const conn = this.connection;
      if (!conn) return;
      try {
        await conn.mockTouch(x, y, true);
        await conn.mockTouch(x, y, false);
      } catch (error) {
        this.fail(error, 'Screen touch failed');
      }
    });
  }

  // --- upload -------------------------------------------------------------

  /**
   * Two things PROS does inside its transfer loop that the vendored library
   * does not, recorded here because they live in code this project does not
   * edit rather than because they are unimportant:
   *
   * - PROS writes chunks of *half* the window size the brain negotiates
   *   (`max_packet_size / 2`); the vendored library uses the whole window,
   *   capped at 4096. If large uploads ever prove flaky over a marginal cable,
   *   that difference is the first place to look.
   * - PROS gives the final "transfer complete" a timeout scaled to the file
   *   (`max(len / 200000, 1.0)` seconds) and retries it three times; the
   *   vendored library waits a flat 30 s once. That is more generous, not
   *   less, so it is a difference rather than a defect.
   */
  async upload(request: UploadRequest): Promise<boolean> {
    return this.exclusive(async () => {
      const device = this.device;
      const conn = this.connection;
      if (!device?.isConnected || !conn) return false;

      const ini = new ProgramIniConfig();
      ini.autorun = true;
      ini.baseName = `slot_${request.slot}`;
      ini.project.ide = 'VEXCollab';
      ini.program.name = request.name.slice(0, MAX_PROGRAM_NAME);
      ini.program.description = request.description.slice(0, 256);
      ini.program.slot = (request.slot - 1) as ZerobaseSlotNumber;
      ini.program.icon = programIcon(this.snapshot.cpu0Version);
      ini.setProgramDate(new Date());

      this.patch({ transfer: { label: 'Stopping', current: 0, total: 1 }, lastError: null });
      try {
        // Stop whatever is running before rewriting a slot. PROS does this
        // first in its default upload path, and the reason is plain: the flash
        // being overwritten may be what the brain is executing right now, and
        // iterating on a program you left running is the normal case, not the
        // exception. Unconditional rather than gated on isRunningProgram,
        // which the poll may have read seconds ago.
        try {
          await conn.stopProgram();
        } catch {
          // A brain that refuses the stop can still be written to; the upload
          // is the point, so carry on rather than failing here.
        }
        this.patch({ transfer: { label: 'Starting', current: 0, total: 1 } });
        if (request.vendor === undefined) {
          // The library's own path: ini and bin under FileVendor.USER.
          const ok = await device.brain.uploadProgram(
            ini,
            request.payload,
            request.coldPayload,
            (label, current, total) => this.patch({ transfer: { label, current, total } }),
          );
          if (ok) await this.refreshProgramsLocked();
          return Boolean(ok);
        }

        // Same two files, but written under a chosen vendor. uploadProgramToDevice
        // hardcodes USER and passes the field under the wrong name, so there is no
        // way to reach VEXVM through it.
        const base = ini.baseName;
        const iniOk = await conn.uploadFileToDevice(
          {
            filename: `${base}.ini`,
            buf: new TextEncoder().encode(ini.createIni()),
            downloadTarget: FileDownloadTarget.FILE_TARGET_QSPI,
            vendor: request.vendor,
            autoRun: false,
          },
          (current, total) => this.patch({ transfer: { label: 'INI', current, total } }),
        );
        if (!iniOk) {
          this.patch({ lastError: 'The brain refused the program descriptor (.ini)' });
          return false;
        }

        const binOk = await conn.uploadFileToDevice(
          {
            filename: `${base}.bin`,
            buf: request.payload,
            downloadTarget: FileDownloadTarget.FILE_TARGET_QSPI,
            vendor: request.vendor,
            exttype: 'bin',
            autoRun: true,
          },
          (current, total) => this.patch({ transfer: { label: 'BIN', current, total } }),
        );
        if (!binOk) {
          this.patch({ lastError: 'The brain refused the program itself (.bin)' });
          return false;
        }

        await this.refreshProgramsLocked();
        return true;
      } catch (error) {
        this.fail(error, 'Upload failed');
        return false;
      } finally {
        this.patch({ transfer: null });
      }
    });
  }

  // --- firmware -----------------------------------------------------------

  /**
   * The newest vexOS version VEX publishes, or null if we cannot reach them.
   * Goes through our own origin because VEX's CDN sends no CORS headers.
   */
  async fetchLatestFirmware(): Promise<string | null> {
    try {
      const response = await fetch('/api/vexos/catalog.txt', { cache: 'no-store' });
      if (!response.ok) return null;
      const version = (await response.text()).trim();
      return /^[\w.-]+$/.test(version) ? version : null;
    } catch {
      return null;
    }
  }

  /**
   * Flashes vexOS. This erases and rewrites the brain's boot image, so it is
   * the one operation here that can leave a brain unusable if it is
   * interrupted. Callers must confirm with the user first.
   */
  async updateFirmware(version?: string): Promise<boolean> {
    return this.exclusive(async () => {
      const device = this.device;
      if (!device?.isConnected) return false;

      this.patch({ transfer: { label: 'Preparing', current: 0, total: 1 }, lastError: null });
      try {
        const ok = await device.brain.uploadFirmware(
          '/api/vexos/',
          version,
          (label, current, total) => this.patch({ transfer: { label, current, total } }),
        );
        if (ok === undefined) {
          this.patch({ lastError: 'Could not fetch vexOS from VEX. Check your connection.' });
          return false;
        }
        if (ok) await this.refreshLocked();
        return Boolean(ok);
      } catch (error) {
        this.fail(error, 'Firmware update failed');
        return false;
      } finally {
        this.patch({ transfer: null });
      }
    });
  }

  // --- brain identity -----------------------------------------------------

  async setBrainName(name: string) {
    return this.exclusive(async () => {
      try {
        const key = this.workingKeys.get(NAME_KEYS[0]) ?? NAME_KEYS[0];
        await this.device?.brain.setValue(key, name);
        // Show it straight away: the brain sometimes needs a moment before
        // reading the value back returns the new one.
        this.patch({ brainName: name });
        await this.readIdentityLocked();
      } catch (error) {
        this.fail(error, 'Setting brain name failed');
      }
    });
  }

  /**
   * Writes the team number, then reads it back to prove it stuck. On this
   * firmware a write to the wrong key succeeds silently and changes nothing,
   * which is worse than an error — so verify rather than assume.
   */
  async setTeamNumber(team: string) {
    return this.exclusive(async () => {
      try {
        const key = this.workingKeys.get(TEAM_KEYS[0]) ?? TEAM_KEYS[0];
        await this.device?.brain.setValue(key, team);
        this.patch({ teamNumber: team });

        const readBack = await this.readFirstLocked(TEAM_KEYS);
        if (!readBack) {
          this.patch({
            lastError:
              `The brain accepted the team number but reports it as empty. ` +
              `Tried keys: ${TEAM_KEYS.join(', ')}. It may only be settable from the brain's own menu.`,
          });
        }
      } catch (error) {
        this.fail(error, 'Setting team number failed');
      }
    });
  }

  static readonly VEX_USB_VENDOR_ID = VEX_USB_VENDOR_ID;
}
