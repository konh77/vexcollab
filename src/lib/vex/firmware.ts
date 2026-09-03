/*
 * VEXCollab - comparing vexOS versions.
 * Licensed under AGPL-3.0-only.
 *
 * VEX publishes catalogue entries as `VEXOS_V5_1_1_5_0` while a brain reports
 * `1.1.5`. Comparing those two strings directly is always false, which meant
 * the panel offered to flash the version already installed — a pointless and
 * genuinely risky operation. Both forms are parsed to numbers instead.
 */

export interface Version {
  parts: number[];
  display: string;
}

export function parseVersion(raw: string | null | undefined): Version | null {
  if (!raw) return null;
  // VEXOS_V5_1_1_5_0 -> 1.1.5.0   |   1.1.5 -> 1.1.5   |   1.1.5.b3 -> 1.1.5.3
  const cleaned = raw
    .replace(/^VEXOS[_-]?V?5?[_-]?/i, '')
    .replace(/b/gi, '')
    .replace(/[_-]/g, '.');
  const parts = cleaned
    .split('.')
    .map((piece) => Number.parseInt(piece, 10))
    .filter((n) => Number.isFinite(n));
  if (parts.length === 0) return null;
  return { parts, display: parts.join('.') };
}

/** -1, 0 or 1, comparing part by part with missing parts treated as zero. */
export function compareVersions(a: Version, b: Version): number {
  const length = Math.max(a.parts.length, b.parts.length);
  for (let i = 0; i < length; i++) {
    const left = a.parts[i] ?? 0;
    const right = b.parts[i] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

export type FirmwareState = 'unknown' | 'current' | 'update-available' | 'ahead';

export function firmwareState(
  installedRaw: string | null,
  latestRaw: string | null,
): { state: FirmwareState; installed: Version | null; latest: Version | null } {
  const installed = parseVersion(installedRaw);
  const latest = parseVersion(latestRaw);
  if (!installed || !latest) return { state: 'unknown', installed, latest };

  const order = compareVersions(installed, latest);
  return {
    state: order === 0 ? 'current' : order < 0 ? 'update-available' : 'ahead',
    installed,
    latest,
  };
}
