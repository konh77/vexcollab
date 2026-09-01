/*
 * VEXCollab - who you are in a room. No accounts, no server-side identity.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import type { LocalUser } from './provider';

const STORAGE_KEY = 'vexcollab.identity';

// Saturated enough to carry white cursor labels on a white editor.
const COLORS = [
  '#ff3b30', '#ff9500', '#34c759', '#007aff',
  '#5856d6', '#af52de', '#ff2d55', '#0071e3',
];

const ADJECTIVES = ['Swift', 'Torque', 'Clutch', 'Pivot', 'Gearbox', 'Bandit', 'Turbo', 'Lucky'];
const NOUNS = ['Auton', 'Driver', 'Sensor', 'Motor', 'Encoder', 'Chassis', 'Flywheel', 'Intake'];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function loadIdentity(): LocalUser {
  if (typeof window === 'undefined') return { name: 'Anonymous', color: COLORS[0] };

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LocalUser;
      if (parsed?.name && parsed?.color) return parsed;
    }
  } catch {
    // Private mode or corrupted value; fall through and mint a new identity.
  }

  const identity: LocalUser = {
    name: `${pick(ADJECTIVES)} ${pick(NOUNS)}`,
    color: pick(COLORS),
  };
  saveIdentity(identity);
  return identity;
}

export function saveIdentity(identity: LocalUser) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Not being able to remember a nickname is not worth failing over.
  }
}

/** Room ids are shared in URLs and read aloud across a pit, so keep them short. */
export function createRoomId(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}
