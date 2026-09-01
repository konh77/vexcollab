/*
 * VEXCollab - Yjs <-> Socket.IO provider.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { io, type Socket } from 'socket.io-client';
import * as Y from 'yjs';

export interface Peer {
  id: string;
  name: string;
  color: string;
}

export interface LocalUser {
  name: string;
  color: string;
}

/**
 * A deliberately small alternative to y-websocket: the server is a plain
 * Socket.IO relay that also keeps the authoritative Y.Doc, so a late joiner
 * gets the full document in the join acknowledgement instead of running a
 * multi-step sync handshake.
 */
export class CollabProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly socket: Socket;

  private connectedListeners = new Set<(connected: boolean) => void>();
  private peersListeners = new Set<(peers: Peer[]) => void>();
  private syncedListeners = new Set<() => void>();
  private errorListeners = new Set<(message: string | null) => void>();
  private hasSynced = false;
  private destroyed = false;

  constructor(roomId: string, user: LocalUser, doc = new Y.Doc()) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.awareness.setLocalStateField('user', user);

    // Deliberately NOT forcing `transports: ['websocket']`. Socket.IO defaults
    // to polling first and upgrades, which is what survives networks where a
    // raw WebSocket is blocked or mangled — the difference between "works on
    // my machine" and "works from your teammate's laptop".
    this.socket = io({
      path: '/socket.io',
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      timeout: 10_000,
    });

    // Local edits out. `origin === this` marks updates we applied from the
    // network, so echoing them back would loop forever.
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      this.socket.emit('update', update);
    });

    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const changed = added.concat(updated, removed);
      this.socket.emit('awareness', encodeAwarenessUpdate(this.awareness, changed));
    });

    // A silent failure is the worst outcome: the page looks fine and edits
    // simply never leave. Surface the reason instead.
    this.socket.on('connect_error', (error: Error) => {
      this.errorListeners.forEach((l) =>
        l(`Cannot reach the server (${error.message}). Edits are not being shared.`),
      );
    });

    this.socket.on('connect', () => {
      this.errorListeners.forEach((l) => l(null));
      this.socket.emit('join', { roomId, user }, (res: { update: ArrayBuffer }) => {
        if (this.destroyed) return;
        Y.applyUpdate(this.doc, new Uint8Array(res.update), this);
        this.broadcastLocalAwareness();
        this.hasSynced = true;
        this.syncedListeners.forEach((l) => l());
      });
      this.connectedListeners.forEach((l) => l(true));
    });

    this.socket.on('disconnect', () => this.connectedListeners.forEach((l) => l(false)));

    this.socket.on('update', (update: ArrayBuffer) => {
      Y.applyUpdate(this.doc, new Uint8Array(update), this);
    });

    this.socket.on('awareness', (update: ArrayBuffer) => {
      applyAwarenessUpdate(this.awareness, new Uint8Array(update), this);
    });

    // Someone new arrived and cannot know about us yet.
    this.socket.on('announce-awareness', () => this.broadcastLocalAwareness());

    this.socket.on('peers', (peers: Peer[]) => this.peersListeners.forEach((l) => l(peers)));

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleUnload);
    }
  }

  private handleUnload = () => {
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'window unload');
  };

  private broadcastLocalAwareness() {
    this.socket.emit('awareness', encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
  }

  onConnectionChange(listener: (connected: boolean) => void) {
    this.connectedListeners.add(listener);
    return () => this.connectedListeners.delete(listener);
  }

  /** Fires once the room's existing document has been applied locally. */
  onSynced(listener: () => void) {
    if (this.hasSynced) listener();
    this.syncedListeners.add(listener);
    return () => this.syncedListeners.delete(listener);
  }

  /** Reports why the connection is failing, or null once it recovers. */
  onError(listener: (message: string | null) => void) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onPeers(listener: (peers: Peer[]) => void) {
    this.peersListeners.add(listener);
    return () => this.peersListeners.delete(listener);
  }

  destroy() {
    this.destroyed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleUnload);
    }
    this.handleUnload();
    this.awareness.destroy();
    this.socket.disconnect();
    this.doc.destroy();
  }
}
