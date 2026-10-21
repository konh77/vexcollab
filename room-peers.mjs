/*
 * VEXCollab - who is in a room, as people see it.
 * Copyright (C) 2026 VEXCollab contributors
 * Licensed under AGPL-3.0-only. See LICENSE.
 *
 * The server keeps one entry per open connection, but a connection is not a
 * person. A tab that reconnects after a dropped network is a new connection
 * while the old one lingers until the heartbeat notices it is dead, and the
 * header used to count both -- four avatars for one person. What people see is
 * one entry per tab, however many connections it has gone through.
 */

/**
 * @param {Map<string, { name: string, color: string, senderId: string, idle?: boolean, joinedAt?: number }>} peers
 */
export function visiblePeers(peers) {
  /** @type {Map<string, { id: string, name: string, color: string, senderId: string, idle: boolean, joinedAt: number }>} */
  const latest = new Map();

  for (const [id, peer] of peers) {
    const joinedAt = peer.joinedAt ?? 0;
    const known = latest.get(peer.senderId);
    // Of one tab's connections the newest is the live one.
    if (!known || joinedAt >= known.joinedAt) {
      latest.set(peer.senderId, {
        id,
        name: peer.name,
        color: peer.color,
        senderId: peer.senderId,
        idle: Boolean(peer.idle),
        joinedAt,
      });
    }
  }

  return [...latest.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ joinedAt: _joinedAt, ...peer }) => peer);
}
