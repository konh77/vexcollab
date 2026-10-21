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
  /** Stable for a tab across reconnects; matches `selfId` for the viewer's own entry. */
  senderId: string;
  /** True when nobody has been at that tab for a while. */
  idle: boolean;
}

/** A hidden tab counts as away after this long. */
const AWAY_HIDDEN_MS = 60_000;
/** A visible tab nobody has touched counts as away after this long. */
const AWAY_UNTOUCHED_MS = 10 * 60_000;

export interface LocalUser {
  name: string;
  color: string;
}

/** How a pinned room is doing with its repository, as the server reports it. */
export interface PinnedStatus {
  state: 'starting' | 'idle' | 'syncing' | 'conflict' | 'error' | 'local';
  message: string | null;
  lastPushAt: number | null;
  lastSyncAt: number | null;
  /** False when the room is only kept on the server, with no repository. */
  pushing: boolean;
}

/** One line of team chat, as the server stamped it. */
export interface ChatMessage {
  id: number;
  /** Milliseconds since the epoch. */
  at: number;
  /** Stable for a browser tab across reconnects; compare with `selfId` to know which are yours. */
  senderId: string;
  name: string;
  color: string;
  text: string;
}

/** The most messages kept on the page; the server holds fewer. */
const CHAT_KEPT = 200;

/**
 * A random secret for this tab, hashed by the server into the id others see. It
 * is never sent to anyone else, which is what stops a message being sent as you.
 */
function chatKey(): string {
  try {
    const existing = window.sessionStorage.getItem('vexcollab.chatkey');
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    window.sessionStorage.setItem('vexcollab.chatkey', key);
    return key;
  } catch {
    // Storage blocked: a key for this page load only, so a reload looks like a new person.
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

/** Why the server wants a passcode: none was sent, or the one sent was wrong. */
export type PasscodeReason = 'required' | 'wrong';

const passcodeKey = (roomId: string) => `vexcollab.passcode:${roomId.toLowerCase()}`;

function rememberedPasscode(roomId: string): string | undefined {
  try {
    return window.sessionStorage.getItem(passcodeKey(roomId)) ?? undefined;
  } catch {
    return undefined; // storage can be blocked; the prompt still works
  }
}

function rememberPasscode(roomId: string, passcode: string | null) {
  try {
    if (passcode) window.sessionStorage.setItem(passcodeKey(roomId), passcode);
    else window.sessionStorage.removeItem(passcodeKey(roomId));
  } catch {
    // Not being able to remember it means asking again after a reload.
  }
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
  private passcodeListeners = new Set<(reason: PasscodeReason | null) => void>();
  private pinnedListeners = new Set<(status: PinnedStatus | null) => void>();
  private chatListeners = new Set<(messages: ChatMessage[], selfId: string | null) => void>();
  private lastTouched = Date.now();
  private hiddenSince: number | null = null;
  private away = false;
  private stopWatchingPresence: (() => void) | null = null;
  private chatMessages: ChatMessage[] = [];
  private selfId: string | null = null;
  private hasSynced = false;
  private destroyed = false;
  private readonly roomId: string;
  private readonly user: LocalUser;

  constructor(roomId: string, user: LocalUser, doc = new Y.Doc()) {
    this.roomId = roomId;
    this.user = user;
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
      this.join(rememberedPasscode(roomId));
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

    // The server dropped this session — idle too long, or it hit its size cap.
    // Both are one-way, so report them and stay off rather than reconnecting
    // into a room that no longer exists.
    this.socket.on('room-closed', ({ reason }: { reason: string }) => {
      this.errorListeners.forEach((l) => l(reason));
      this.socket.disconnect();
    });

    this.socket.on('limit', ({ reason }: { reason: string }) => {
      this.errorListeners.forEach((l) => l(reason));
    });

    this.socket.on('pinned-status', (status: PinnedStatus) =>
      this.pinnedListeners.forEach((l) => l(status)),
    );

    this.socket.on('chat', (message: ChatMessage) => {
      // A join's history and a live message can overlap around a reconnect.
      if (this.chatMessages.some((existing) => existing.id === message.id)) return;
      this.chatMessages = [...this.chatMessages, message].slice(-CHAT_KEPT);
      this.emitChat();
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleUnload);
      this.watchPresence();
    }
  }

  /**
   * Tells the server whether anyone is actually at this tab. A tab left open
   * overnight, or buried behind others, is not "here" -- counting it is how a
   * room ends up showing four people when one is working.
   */
  private watchPresence() {
    const touch = () => {
      this.lastTouched = Date.now();
      // Coming back should show immediately, not on the next check.
      if (this.away) this.updatePresence();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const event of events) window.addEventListener(event, touch, { passive: true });

    const onVisibility = () => {
      this.hiddenSince = document.hidden ? Date.now() : null;
      if (!document.hidden) touch();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.hiddenSince = document.hidden ? Date.now() : null;
    const timer = setInterval(() => this.updatePresence(), 10_000);

    // Every provider that is built must also be able to take its listeners
    // back: a room is left and rejoined in one page, and each would otherwise
    // keep listening on the window for the rest of its life.
    this.stopWatchingPresence = () => {
      for (const event of events) window.removeEventListener(event, touch);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }

  private updatePresence() {
    const now = Date.now();
    const away =
      (this.hiddenSince !== null && now - this.hiddenSince >= AWAY_HIDDEN_MS) ||
      now - this.lastTouched >= AWAY_UNTOUCHED_MS;
    if (away === this.away) return;
    this.away = away;
    if (this.socket.connected) this.socket.emit('presence', { idle: away });
  }

  /**
   * Asks the server into the room. A pinned room answers with a reason code
   * rather than a bare refusal, because "needs a passcode" is something the
   * person can fix and the page should ask for it, not give up.
   */
  private join(passcode?: string) {
    this.socket.emit(
      'join',
      { roomId: this.roomId, user: this.user, passcode, key: chatKey() },
      (res: {
        update?: ArrayBuffer;
        error?: string;
        code?: string;
        pinned?: PinnedStatus;
        senderId?: string;
        chat?: ChatMessage[];
      }) => {
        if (this.destroyed) return;

        if (res?.code === 'passcode-required' || res?.code === 'wrong-passcode') {
          const wrong = res.code === 'wrong-passcode';
          if (wrong) rememberPasscode(this.roomId, null);
          this.passcodeListeners.forEach((l) => l(wrong ? 'wrong' : 'required'));
          return;
        }
        if (res?.code === 'starting') {
          // The room is clearing its first sync. Not the person's problem, so
          // wait it out rather than showing a failure.
          this.errorListeners.forEach((l) => l(res.error ?? 'The room is starting up.'));
          setTimeout(() => !this.destroyed && this.socket.connected && this.join(passcode), 3000);
          return;
        }

        // The server refuses a join when it is at capacity or the session is
        // full. Reconnecting would not help, so explain and stop trying.
        if (res?.error || !res?.update) {
          this.errorListeners.forEach((l) => l(res?.error ?? 'The server refused this session.'));
          this.socket.disconnect();
          return;
        }

        this.errorListeners.forEach((l) => l(null));
        this.passcodeListeners.forEach((l) => l(null));
        if (res.pinned) this.pinnedListeners.forEach((l) => l(res.pinned ?? null));
        // Replace, not merge: this is the room's whole history, and merging it
        // into what was already here after a reconnect would show things twice.
        this.selfId = res.senderId ?? null;
        // A new connection starts as "here"; say so if this tab is actually away.
        if (this.away) this.socket.emit('presence', { idle: true });
        this.chatMessages = (res.chat ?? []).slice(-CHAT_KEPT);
        this.emitChat();
        if (passcode) rememberPasscode(this.roomId, passcode);
        Y.applyUpdate(this.doc, new Uint8Array(res.update), this);
        this.broadcastLocalAwareness();
        this.hasSynced = true;
        this.syncedListeners.forEach((l) => l());
      },
    );
  }

  private emitChat() {
    this.chatListeners.forEach((l) => l(this.chatMessages, this.selfId));
  }

  /** Sends a chat line. Resolves to null when it went through, or the reason it did not. */
  sendChat(text: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.socket.connected) return resolve('You are offline. Reconnecting…');
      this.socket.timeout(8000).emit('chat', text, (error: Error | null, res?: { ok?: boolean; error?: string }) => {
        if (error) return resolve('The message did not get through. Try again.');
        resolve(res?.ok ? null : (res?.error ?? 'The message did not get through.'));
      });
    });
  }

  onChat(listener: (messages: ChatMessage[], selfId: string | null) => void) {
    this.chatListeners.add(listener);
    listener(this.chatMessages, this.selfId);
    return () => {
      this.chatListeners.delete(listener);
    };
  }

  /** Sends a passcode the person typed. The result arrives through the listeners. */
  submitPasscode(passcode: string) {
    this.join(passcode.trim());
  }

  onPasscode(listener: (reason: PasscodeReason | null) => void) {
    this.passcodeListeners.add(listener);
    return () => {
      this.passcodeListeners.delete(listener);
    };
  }

  onPinnedStatus(listener: (status: PinnedStatus | null) => void) {
    this.pinnedListeners.add(listener);
    return () => {
      this.pinnedListeners.delete(listener);
    };
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

  /**
   * Changes who this client is to everyone else, in place. The awareness 'update'
   * listener already broadcasts the change, so cursors and the peer list pick up
   * the new name and colour without the page having to reload.
   */
  setUser(user: LocalUser) {
    if (this.destroyed) return;
    this.awareness.setLocalStateField('user', user);
  }

  destroy() {
    this.destroyed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleUnload);
    }
    this.handleUnload();
    this.stopWatchingPresence?.();
    this.awareness.destroy();
    this.socket.disconnect();
    this.doc.destroy();
  }
}
