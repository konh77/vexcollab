/*
 * VEXCollab - GitHub credentials, held per browser session.
 * Licensed under AGPL-3.0-only.
 *
 * Tokens live in memory only. They are never written to disk, never sent to the
 * browser after the initial exchange, and never put on a command line where
 * `ps` would show them. Restarting the server signs everyone out, which is the
 * right trade for a box that is port-forwarded to the internet.
 */
import { randomBytes } from 'node:crypto';

export interface GitHubSession {
  token: string;
  login: string;
  avatarUrl?: string;
  createdAt: number;
}

const SESSIONS = new Map<string, GitHubSession>();
const DEVICE_FLOWS = new Map<string, { deviceCode: string; interval: number; expiresAt: number }>();

/** Sessions are dropped after a day so a forgotten tab cannot hold a token forever. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, session] of SESSIONS) {
    if (now - session.createdAt > MAX_AGE_MS) SESSIONS.delete(id);
  }
  for (const [id, flow] of DEVICE_FLOWS) {
    if (now > flow.expiresAt) DEVICE_FLOWS.delete(id);
  }
}

export function newSessionId(): string {
  return randomBytes(24).toString('hex');
}

export function getSession(id: string | null): GitHubSession | null {
  if (!id) return null;
  sweep();
  return SESSIONS.get(id) ?? null;
}

export function setSession(id: string, session: GitHubSession) {
  sweep();
  SESSIONS.set(id, session);
}

export function clearSession(id: string | null) {
  if (id) SESSIONS.delete(id);
}

export function setDeviceFlow(id: string, flow: { deviceCode: string; interval: number; expiresAt: number }) {
  DEVICE_FLOWS.set(id, flow);
}

export function getDeviceFlow(id: string | null) {
  if (!id) return null;
  sweep();
  return DEVICE_FLOWS.get(id) ?? null;
}

export function clearDeviceFlow(id: string | null) {
  if (id) DEVICE_FLOWS.delete(id);
}
