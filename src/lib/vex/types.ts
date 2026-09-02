/*
 * VEXCollab - shared VEX brain view models.
 * Licensed under AGPL-3.0-only.
 */
import type { SlotNumber } from '@/lib/v5-serial-protocol/Vex';

export type ConnectionState = 'unsupported' | 'disconnected' | 'connecting' | 'connected';

export interface SmartDeviceView {
  port: number;
  type: string;
  version: string;
}

export interface ControllerView {
  index: number;
  isMaster: boolean;
  batteryPercent: number;
  isCharging: boolean;
}

export interface ProgramView {
  name: string;
  binfile: string;
  slot: number;
  size: number;
  time: string;
}

export interface BrainSnapshot {
  connectionState: ConnectionState;
  isV5Controller: boolean;
  brainName: string | null;
  teamNumber: string | null;
  uniqueId: number | null;
  systemVersion: string | null;
  cpu0Version: string | null;
  cpu1Version: string | null;
  batteryPercent: number | null;
  isCharging: boolean;
  activeProgram: number;
  isRunningProgram: boolean;
  matchMode: 'driver' | 'autonomous' | 'disabled' | null;
  radio: {
    isAvailable: boolean;
    isConnected: boolean;
    isVexNet: boolean;
    channel: string | null;
    latency: number | null;
  };
  devices: SmartDeviceView[];
  controllers: ControllerView[];
  programs: ProgramView[];
  /** Non-null while a file transfer is in flight. */
  transfer: { label: string; current: number; total: number } | null;
  lastError: string | null;
}

export interface UploadRequest {
  slot: SlotNumber;
  name: string;
  description: string;
  /** Bytes written to the program slot. */
  payload: Uint8Array;
  /** Optional shared runtime image ("cold" file) the program links against. */
  coldPayload?: Uint8Array;
}

export const EMPTY_SNAPSHOT: BrainSnapshot = {
  connectionState: 'disconnected',
  isV5Controller: false,
  brainName: null,
  teamNumber: null,
  uniqueId: null,
  systemVersion: null,
  cpu0Version: null,
  cpu1Version: null,
  batteryPercent: null,
  isCharging: false,
  activeProgram: 0,
  isRunningProgram: false,
  matchMode: null,
  radio: { isAvailable: false, isConnected: false, isVexNet: false, channel: null, latency: null },
  devices: [],
  controllers: [],
  programs: [],
  transfer: null,
  lastError: null,
};
