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
  FileVendor,
  SmartDeviceType,
  type SlotNumber,
  type ZerobaseSlotNumber,
} from '@/lib/v5-serial-protocol/Vex';
import { V5SerialDevice } from '@/lib/v5-serial-protocol/VexDevice';
import { ProgramIniConfig } from '@/lib/v5-serial-protocol/VexIniConfig';
import { ScreenCaptureH2DPacket } from '@/lib/v5-serial-protocol/VexPacket';
import { EMPTY_SNAPSHOT, type BrainFile, type BrainSnapshot, type UploadRequest } from './types';
import { decodeScreenCapture, SCREEN_CAPTURE_BYTES, SCREEN_WIDTH } from './screen';

const VEX_USB_VENDOR_ID = 0x2888;

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
 * A V5 reports an entry for every smart port whether or not anything is
 * plugged in. On real hardware the empty ones came back as type 129 with
 * version 0 — a value absent from the protocol's enum — so twenty empty ports
 * were being listed as devices. Anything unrecognised *with* a version is kept,
 * so a genuinely new sensor still shows up rather than being hidden.
 */
function isRealDevice(type: SmartDeviceType | undefined, version: number): boolean {
  if (type === undefined) return false;
  if (type === SmartDeviceType.EMPTY || type === SmartDeviceType.UNDEFINED_SENSOR) return false;
  const known = SmartDeviceType[type] !== undefined;
  return known || version > 0;
}

function smartDeviceName(type: SmartDeviceType | undefined): string {
  if (type === undefined) return 'Unknown';
  const name = SmartDeviceType[type];
  if (!name) return `Type ${type}`;
  // MOTOR_29 -> Motor 29
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export class V5Session {
  private device: V5SerialDevice | null = null;
  private listeners = new Set<() => void>();
  private snapshot: BrainSnapshot = EMPTY_SNAPSHOT;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Which key name actually worked, per logical field. */
  private workingKeys = new Map<string, string>();

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

  // --- connection ---------------------------------------------------------

  async connect(): Promise<boolean> {
    if (!V5Session.isSupported()) return false;
    if (this.snapshot.connectionState === 'connected') return true;

    this.patch({ connectionState: 'connecting', lastError: null });
    try {
      const device = new V5SerialDevice(navigator.serial);
      const ok = await device.connect();
      if (!ok) {
        this.patch({ connectionState: 'disconnected' });
        return false;
      }
      this.device = device;
      this.patch({ connectionState: 'connected' });
      await this.refresh();
      await this.refreshPrograms();
      // The brain does not push state, so poll for battery/program changes.
      this.pollTimer = setInterval(() => void this.refresh(), 2000);
      return true;
    } catch (error) {
      this.patch({ connectionState: 'disconnected' });
      this.fail(error, 'Connect failed');
      return false;
    }
  }

  async disconnect() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    try {
      await this.device?.disconnect();
    } catch {
      // Unplugging mid-session throws here; the state reset below is what matters.
    }
    this.device = null;
    this.snapshot = { ...EMPTY_SNAPSHOT };
    this.listeners.forEach((l) => l());
  }

  /** Pull a fresh view of brain state. Safe to call on a timer. */
  async refresh() {
    const device = this.device;
    if (!device?.isConnected) return;

    try {
      await device.refresh();
      const brain = device.brain;

      const [brainName, teamNumber] = await Promise.all([
        this.readFirst(NAME_KEYS),
        this.readFirst(TEAM_KEYS),
      ]);

      this.patch({
        isV5Controller: device.isV5Controller,
        // An empty read is not proof the value is unset — keep what we have.
        brainName: brainName ? String(brainName) : this.snapshot.brainName,
        teamNumber: teamNumber ? String(teamNumber) : this.snapshot.teamNumber,
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
        devices: device.devices
          .filter((d) => d.isAvailable && isRealDevice(d.type, Number(d.version ?? 0)))
          .map((d) => ({
            port: d.port ?? 0,
            type: smartDeviceName(d.type),
            version: formatVersion(d.version) ?? String(d.version ?? '-'),
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
      this.fail(error, 'Refresh failed');
    }
  }

  async refreshPrograms() {
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
    const device = this.device;
    if (!device?.isConnected) return [];
    try {
      const files = (await device.brain.listFiles()) ?? [];
      return files.map((file: Record<string, any>) => ({
        filename: String(file.filename ?? '?'),
        size: Number(file.size ?? 0),
        type: String(file.type ?? ''),
        timestamp:
          file.timestamp instanceof Date ? file.timestamp.toISOString() : String(file.timestamp ?? ''),
      }));
    } catch (error) {
      this.fail(error, 'Listing files failed');
      return [];
    }
  }

  /** Returns the first key that yields a non-empty value, and remembers it. */
  private async readFirst(keys: string[]): Promise<string | null> {
    for (const key of keys) {
      const value = await this.readValue(key);
      if (value && value.trim()) {
        this.workingKeys.set(keys[0], key);
        return value.trim();
      }
    }
    return null;
  }

  /** Arbitrary key/value read off the brain — useful for poking at settings. */
  async readValue(key: string): Promise<string | null> {
    try {
      const value = await this.device?.brain.getValue(key);
      return value != null ? String(value) : null;
    } catch {
      return null;
    }
  }

  // --- program control ----------------------------------------------------

  async runProgram(slot: SlotNumber) {
    const conn = this.device?.connection;
    if (!conn) return;
    try {
      await conn.loadProgram(slot);
      await this.refresh();
    } catch (error) {
      this.fail(error, `Running slot ${slot} failed`);
    }
  }

  async stopProgram() {
    const conn = this.device?.connection;
    if (!conn) return;
    try {
      await conn.stopProgram();
      await this.refresh();
    } catch (error) {
      this.fail(error, 'Stopping the program failed');
    }
  }

  /**
   * Drives the competition state machine from here, so autonomous can be
   * tested without a field controller or a competition switch.
   */
  async setMatchMode(mode: 'driver' | 'autonomous' | 'disabled') {
    const conn = this.device?.connection;
    if (!conn) return;
    try {
      await conn.setMatchMode(mode);
      this.patch({ matchMode: mode });
      await this.refresh();
    } catch (error) {
      this.fail(error, `Switching to ${mode} failed`);
    }
  }

  /** Removes a program from the brain by its binary's filename. */
  async deleteProgram(binfile: string) {
    const device = this.device;
    if (!device?.isConnected) return;
    try {
      await device.brain.removeFile(binfile);
      await this.refreshPrograms();
    } catch (error) {
      this.fail(error, `Deleting ${binfile} failed`);
    }
  }

  /** Taps the brain's touchscreen, for driving on-screen menus remotely. */
  async touchScreen(x: number, y: number) {
    const conn = this.device?.connection;
    if (!conn) return;
    try {
      await conn.mockTouch(x, y, true);
      await conn.mockTouch(x, y, false);
    } catch (error) {
      this.fail(error, 'Screen touch failed');
    }
  }

  // --- upload -------------------------------------------------------------

  async upload(request: UploadRequest): Promise<boolean> {
    const device = this.device;
    if (!device?.isConnected) return false;

    const ini = new ProgramIniConfig();
    ini.autorun = true;
    ini.baseName = `slot_${request.slot}`;
    ini.project.ide = 'VEXCollab';
    ini.program.name = request.name.slice(0, 32);
    ini.program.description = request.description.slice(0, 256);
    ini.program.slot = (request.slot - 1) as ZerobaseSlotNumber;
    ini.program.icon = 'USER902x.bmp';
    ini.setProgramDate(new Date());

    this.patch({ transfer: { label: 'Starting', current: 0, total: 1 }, lastError: null });
    try {
      const ok = await device.brain.uploadProgram(
        ini,
        request.payload,
        request.coldPayload,
        (label, current, total) => this.patch({ transfer: { label, current, total } }),
      );
      if (ok) await this.refreshPrograms();
      return Boolean(ok);
    } catch (error) {
      this.fail(error, 'Upload failed');
      return false;
    } finally {
      this.patch({ transfer: null });
    }
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
      if (ok) await this.refresh();
      return Boolean(ok);
    } catch (error) {
      this.fail(error, 'Firmware update failed');
      return false;
    } finally {
      this.patch({ transfer: null });
    }
  }

  // --- screen capture -----------------------------------------------------

  /** Grabs the brain's framebuffer and returns it as a PNG data URL. */
  async captureScreen(): Promise<string | null> {
    const conn = this.device?.connection;
    if (!conn) return null;

    this.patch({ transfer: { label: 'Screen', current: 0, total: SCREEN_CAPTURE_BYTES }, lastError: null });
    try {
      await conn.writeDataAsync(new ScreenCaptureH2DPacket(0));

      // The brain copies the framebuffer into its capture buffer after
      // acknowledging the command, not before. Reading immediately raced that
      // copy and came back as a failed ReadFileReply on real hardware.
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Ask the brain for the size first. On vexOS 1.1.5 it answers 0, so fall
      // back to the framebuffer's known geometry rather than giving up.
      const attempts: { label: string; size?: number }[] = [
        { label: 'reported size' },
        { label: 'framebuffer size', size: SCREEN_CAPTURE_BYTES },
      ];

      const failures: string[] = [];
      for (const attempt of attempts) {
        try {
          const raw = await conn.downloadFileToHost(
            { filename: 'screen', vendor: FileVendor.SYS, loadAddress: 0, size: attempt.size },
            FileDownloadTarget.FILE_TARGET_CBUF,
            (current, total) => this.patch({ transfer: { label: 'Screen', current, total } }),
          );
          if (raw && raw.length >= SCREEN_WIDTH * 4) return decodeScreenCapture(raw);
          failures.push(`${attempt.label}: ${raw?.length ?? 0} bytes`);
        } catch (error) {
          failures.push(`${attempt.label}: ${(error as Error).message}`);
        }
      }

      this.patch({
        lastError: `Screen capture did not return an image (${failures.join('; ')})`,
      });
      return null;
    } catch (error) {
      this.fail(error, 'Screen capture failed');
      return null;
    } finally {
      this.patch({ transfer: null });
    }
  }

  // --- brain identity -----------------------------------------------------

  async setBrainName(name: string) {
    try {
      const key = this.workingKeys.get(NAME_KEYS[0]) ?? NAME_KEYS[0];
      await this.device?.brain.setValue(key, name);
      // Show it straight away: the brain sometimes needs a moment before
      // reading the value back returns the new one.
      this.patch({ brainName: name });
      await this.refresh();
    } catch (error) {
      this.fail(error, 'Setting brain name failed');
    }
  }

  /**
   * Writes the team number, then reads it back to prove it stuck. On this
   * firmware a write to the wrong key succeeds silently and changes nothing,
   * which is worse than an error — so verify rather than assume.
   */
  async setTeamNumber(team: string) {
    try {
      const key = this.workingKeys.get(TEAM_KEYS[0]) ?? TEAM_KEYS[0];
      await this.device?.brain.setValue(key, team);
      this.patch({ teamNumber: team });

      const readBack = await this.readFirst(TEAM_KEYS);
      if (!readBack) {
        this.patch({
          lastError:
            `The brain accepted the team number but reports it as empty. ` +
            `Tried keys: ${TEAM_KEYS.join(', ')}. It may only be settable from the brain's own menu.`,
        });
      }
      await this.refresh();
    } catch (error) {
      this.fail(error, 'Setting team number failed');
    }
  }

  static readonly VEX_USB_VENDOR_ID = VEX_USB_VENDOR_ID;
}
