/*
 * VEXCollab - collaboration server.
 * Copyright (C) 2026 VEXCollab contributors
 * Licensed under AGPL-3.0-only. See LICENSE.
 *
 * Runs Next.js and a Socket.IO relay for Yjs documents in the same process, so
 * one command gives you a working collaborative editor with no extra service.
 *
 * Binds every interface by default so teammates on the same Wi-Fi can join.
 * Set VEXCOLLAB_PASSWORD to require a password before anyone gets in.
 */
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import next from 'next';
import { Server as SocketServer } from 'socket.io';
import * as Y from 'yjs';

// Load .env.local before anything reads process.env. Node has done this
// natively since 21.7, so no dotenv dependency is needed. Values already in the
// environment win, which is what lets systemd's EnvironmentFile override a file
// left in the working directory.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Missing file, or a Node too old to have loadEnvFile: both fine.
  }
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
const useHttps = process.env.VEXCOLLAB_HTTPS === '1';

/**
 * Public mode: the instance is open to anyone, so there is no password at all.
 * A password would only be theatre once the address is shared, and asking
 * strangers for one they cannot have just breaks the link. What protects the
 * box instead are the capacity limits below.
 */
const publicMode = process.env.VEXCOLLAB_PUBLIC === '1';
const password = publicMode ? null : process.env.VEXCOLLAB_PASSWORD || null;
const passwordIgnored = publicMode && !!process.env.VEXCOLLAB_PASSWORD;

const num = (name, fallback) => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

/**
 * Capacity limits. The defaults assume the smallest box this is meant to run
 * on — a Raspberry Pi sharing its memory with Caddy and a Next build — and are
 * deliberately conservative: an open instance that stays up beats a generous
 * one that gets OOM-killed. Every one is overridable.
 *
 * Rooms are memory-only, so the only thing bounding them is these numbers plus
 * the sweeper; nothing here is ever written to disk.
 */
const LIMITS = {
  maxRooms: num('VEXCOLLAB_MAX_ROOMS', publicMode ? 12 : 64),
  maxPeersPerRoom: num('VEXCOLLAB_MAX_PEERS_PER_ROOM', 8),
  maxConnections: num('VEXCOLLAB_MAX_CONNECTIONS', publicMode ? 48 : 256),
  maxRoomsPerIp: num('VEXCOLLAB_MAX_ROOMS_PER_IP', publicMode ? 3 : 32),
  /** A room with no edits for this long is dropped, even if sockets linger. */
  idleMs: num('VEXCOLLAB_ROOM_IDLE_MINUTES', 30) * 60 * 1000,
  /** Per-room document ceiling. Source files; not a file host. */
  maxDocBytes: num('VEXCOLLAB_MAX_DOC_BYTES', 2 * 1024 * 1024),
  /** Refuse to open new rooms once the heap is this full. */
  maxHeapBytes: num('VEXCOLLAB_MAX_HEAP_MB', 320) * 1024 * 1024,
};

const COOKIE = 'vexcollab_auth';

/** Behind Caddy/nginx the TLS terminates upstream; trust the proxy's headers. */
const trustProxy = process.env.VEXCOLLAB_TRUST_PROXY === '1';

/**
 * Login throttling. This box may be port-forwarded, so an unmetered password
 * field is an invitation. Ten tries per IP per fifteen minutes, and a wrong
 * guess costs a slot whether or not the password is even set.
 */
const ATTEMPTS = new Map();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 10;

function clientIp(req) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function tooManyAttempts(ip) {
  const now = Date.now();
  const record = ATTEMPTS.get(ip);
  if (!record || now > record.resetAt) return false;
  return record.count >= ATTEMPT_LIMIT;
}

function noteAttempt(ip) {
  const now = Date.now();
  const record = ATTEMPTS.get(ip);
  if (!record || now > record.resetAt) {
    ATTEMPTS.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
  } else {
    record.count += 1;
  }
  // Keep the map from growing without bound on a public box.
  if (ATTEMPTS.size > 5000) {
    for (const [key, value] of ATTEMPTS) if (now > value.resetAt) ATTEMPTS.delete(key);
  }
}

function isSecureRequest(req) {
  if (useHttps) return true;
  return trustProxy && req.headers['x-forwarded-proto'] === 'https';
}

function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/** Stable for the life of the process; changing the password invalidates it. */
const sessionToken = password
  ? createHmac('sha256', password).update('vexcollab-session-v1').digest('hex')
  : null;

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

function isAuthed(req) {
  if (!password) return true;
  const token = readCookie(req.headers.cookie, COOKIE);
  return Boolean(token) && safeEqual(token, sessionToken);
}

/** Paths that must stay reachable so the login page can render and submit. */
function isPublicPath(pathname) {
  return (
    pathname === '/login' ||
    pathname === '/api/auth' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  );
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > limit) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** LAN addresses to print at startup, so people know what to type. */
function lanAddresses() {
  const out = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push(entry.address);
    }
  }
  return out;
}

/**
 * Browsers only expose WebSerial in a secure context. http://localhost counts,
 * but http://192.168.x.x does not — so a teammate on the Wi-Fi cannot reach a
 * brain plugged into their own machine unless we serve TLS. A self-signed cert
 * is enough: once it is accepted, the origin is treated as secure.
 *
 * The IP addresses must be in subjectAltName or Chrome rejects the cert
 * outright, so the cert is regenerated whenever this machine's addresses change.
 */
function ensureCertificate(addresses) {
  const dir = join(homedir(), '.vexcollab', 'certs');
  const keyFile = join(dir, 'key.pem');
  const certFile = join(dir, 'cert.pem');
  const stampFile = join(dir, 'hosts.txt');
  const wanted = ['127.0.0.1', ...addresses].join(',');

  const current =
    existsSync(stampFile) && readFileSync(stampFile, 'utf8').trim() === wanted;
  if (current && existsSync(keyFile) && existsSync(certFile)) {
    return { key: readFileSync(keyFile), cert: readFileSync(certFile) };
  }

  mkdirSync(dir, { recursive: true });
  const san = ['DNS:localhost', ...['127.0.0.1', ...addresses].map((a) => `IP:${a}`)].join(',');
  try {
    execFileSync(
      'openssl',
      [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', keyFile, '-out', certFile,
        '-days', '825', '-subj', '/CN=VEXCollab',
        '-addext', `subjectAltName=${san}`,
      ],
      { stdio: 'ignore' },
    );
  } catch (error) {
    console.error('\n  Could not generate a certificate with openssl.');
    console.error('  Falling back to http (WebSerial will only work on localhost).\n');
    return null;
  }
  writeFileSync(stampFile, wanted);
  return { key: readFileSync(keyFile), cert: readFileSync(certFile) };
}

const app = next({ dev, hostname: hostname === '0.0.0.0' ? 'localhost' : hostname, port });
const handle = app.getRequestHandler();

/**
 * Rooms live in memory only. A room is dropped once the last peer leaves, which
 * is the same "no sign-up, nothing persisted" model the editor UI promises.
 * Nothing is ever written to disk, so an unused room costs nothing once it is
 * gone from this map.
 * @type {Map<string, {
 *   doc: Y.Doc,
 *   peers: Map<string, { name: string, color: string }>,
 *   createdAt: number,
 *   lastActivity: number,
 *   pendingBytes: number,
 *   measuredBytes: number,
 *   measuredAt: number,
 *   frozen: boolean,
 *   creatorIp: string,
 * }>}
 */
const rooms = new Map();

const roomsCreatedByIp = new Map();

function countRoomsForIp(ip) {
  let n = 0;
  for (const room of rooms.values()) if (room.creatorIp === ip) n += 1;
  return n;
}

/** Frees a room's document and forgets it. Safe to call twice. */
function dropRoom(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.doc.destroy();
  rooms.delete(roomId);
  roomsCreatedByIp.delete(roomId);
  if (reason) io.to(roomId).emit('room-closed', { reason });
}

/**
 * Returns the room, or a reason why one cannot be opened. Joining a room that
 * already exists is always allowed up to the per-room peer limit: the caps are
 * there to stop unbounded *growth*, not to lock out the people already
 * collaborating.
 */
function acquireRoom(roomId, ip) {
  const existing = rooms.get(roomId);
  if (existing) {
    if (existing.peers.size >= LIMITS.maxPeersPerRoom) {
      return { error: `This session is full (${LIMITS.maxPeersPerRoom} people).` };
    }
    return { room: existing };
  }

  if (rooms.size >= LIMITS.maxRooms) {
    return { error: 'The server is at capacity. Try again in a few minutes.' };
  }
  if (countRoomsForIp(ip) >= LIMITS.maxRoomsPerIp) {
    return { error: `You already have ${LIMITS.maxRoomsPerIp} sessions open.` };
  }
  if (process.memoryUsage().heapUsed > LIMITS.maxHeapBytes) {
    return { error: 'The server is low on memory. Try again in a few minutes.' };
  }

  const now = Date.now();
  const room = {
    doc: new Y.Doc(),
    peers: new Map(),
    createdAt: now,
    lastActivity: now,
    pendingBytes: 0,
    measuredBytes: 0,
    measuredAt: 0,
    frozen: false,
    creatorIp: ip,
  };
  rooms.set(roomId, room);
  return { room };
}

/**
 * Measures a room's real document size, but at most once a second — encoding
 * the whole state on every keystroke would cost more than the cap saves. The
 * running total of applied update bytes is the cheap trigger.
 */
function overDocLimit(room) {
  if (room.frozen) return true;
  const now = Date.now();
  if (room.pendingBytes < 64 * 1024 && now - room.measuredAt < 1000) return false;
  room.measuredBytes = Y.encodeStateAsUpdate(room.doc).byteLength;
  room.measuredAt = now;
  room.pendingBytes = 0;
  if (room.measuredBytes > LIMITS.maxDocBytes) {
    room.frozen = true;
    return true;
  }
  return false;
}

/**
 * Sweeps rooms nobody is using. Empty rooms are already dropped the moment the
 * last peer disconnects; this catches the cases that misses — a socket that
 * died without a disconnect event, and rooms left open and untouched. Without
 * it a long-lived public instance accumulates documents forever.
 */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.peers.size === 0) {
      dropRoom(roomId);
      continue;
    }
    if (now - room.lastActivity > LIMITS.idleMs) {
      dropRoom(roomId, 'This session was closed after being idle.');
    }
  }
}, 60 * 1000);
// Never keep the process alive just to run the sweeper.
sweeper.unref();

await app.prepare();

const requestHandler = async (req, res) => {
  securityHeaders(req, res);
  const pathname = new URL(req.url, 'http://localhost').pathname;

  // Login endpoint lives here rather than in a route handler so that the
  // password never has to be duplicated into the Next runtime.
  if (pathname === '/api/auth' && req.method === 'POST') {
    const ip = clientIp(req);
    if (tooManyAttempts(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '900' });
      return res.end(JSON.stringify({ ok: false, error: 'Too many attempts. Wait 15 minutes.' }));
    }
    try {
      const { password: attempt } = JSON.parse((await readBody(req)) || '{}');
      if (password && attempt && safeEqual(attempt, password)) {
        const secure = isSecureRequest(req) ? '; Secure' : '';
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `${COOKIE}=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`,
        });
        return res.end(JSON.stringify({ ok: true }));
      }
    } catch {
      // fall through to the failure response
    }
    noteAttempt(ip);
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Wrong password' }));
  }

  if (!isPublicPath(pathname) && !isAuthed(req)) {
    if (pathname.startsWith('/api/')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not authorised' }));
    }
    res.writeHead(302, { Location: '/login' });
    return res.end();
  }

  return handle(req, res);
};

const credentials = useHttps ? ensureCertificate(lanAddresses()) : null;
const scheme = credentials ? 'https' : 'http';
const httpServer = credentials
  ? createSecureServer(credentials, requestHandler)
  : createServer(requestHandler);

const io = new SocketServer(httpServer, {
  // Yjs updates are small binary deltas. 10 MB was room for a pathological
  // paste; 1 MB is still far more than an update needs and caps what a single
  // message can make this box allocate.
  maxHttpBufferSize: 1e6,
  // Deflate costs CPU the Pi would rather spend elsewhere, and binary CRDT
  // updates barely compress.
  perMessageDeflate: false,
  // Same-origin only in production. The client connects to its own origin, so
  // there is no legitimate cross-origin socket.
  cors: { origin: dev ? '*' : false },
});

// A password on the page is worthless if the socket accepts anyone, so the
// handshake is checked with the same cookie.
io.use((socket, nextFn) => {
  // Refuse before the handshake completes rather than after a room is picked,
  // so an overloaded box spends nothing on connections it cannot serve.
  if (io.engine.clientsCount > LIMITS.maxConnections) {
    return nextFn(new Error('server is at capacity'));
  }
  if (!password) return nextFn();
  const token = readCookie(socket.handshake.headers.cookie, COOKIE);
  if (token && safeEqual(token, sessionToken)) return nextFn();
  nextFn(new Error('not authorised'));
});

io.on('connection', (socket) => {
  /** @type {string | null} */
  let joinedRoom = null;

  socket.on('join', ({ roomId, user }, ack) => {
    if (typeof roomId !== 'string' || !roomId) return;

    const ip = socket.handshake.address ?? 'unknown';
    const { room, error } = acquireRoom(roomId, ip);
    if (error) {
      ack?.({ error });
      return;
    }

    joinedRoom = roomId;
    room.lastActivity = Date.now();
    room.peers.set(socket.id, {
      name: String(user?.name ?? 'Anonymous').slice(0, 32),
      color: String(user?.color ?? '#888888').slice(0, 9),
    });
    socket.join(roomId);

    // Hand the newcomer the whole document, then tell everyone who is here.
    ack?.({ update: Y.encodeStateAsUpdate(room.doc), peerId: socket.id });
    io.to(roomId).emit('peers', [...room.peers].map(([id, u]) => ({ id, ...u })));
    // Existing peers re-broadcast awareness so the newcomer sees their cursors.
    socket.to(roomId).emit('announce-awareness');
  });

  socket.on('update', (update) => {
    if (!joinedRoom) return;
    const room = rooms.get(joinedRoom);
    if (!room) return;
    const bytes = new Uint8Array(update);

    room.pendingBytes += bytes.byteLength;
    if (overDocLimit(room)) {
      // Stop growing, but keep the room usable and readable rather than
      // dropping it under someone's hands.
      socket.emit('limit', {
        reason: `This session has reached its ${Math.round(LIMITS.maxDocBytes / 1024)} KB limit. Further edits are not being shared.`,
      });
      return;
    }

    room.lastActivity = Date.now();
    Y.applyUpdate(room.doc, bytes);
    socket.to(joinedRoom).emit('update', bytes);
  });

  socket.on('awareness', (update) => {
    if (!joinedRoom) return;
    // Cursor movement keeps a room alive: someone watching without typing is
    // still using it.
    const room = rooms.get(joinedRoom);
    if (room) room.lastActivity = Date.now();
    socket.to(joinedRoom).emit('awareness', new Uint8Array(update));
  });

  socket.on('disconnect', () => {
    if (!joinedRoom) return;
    const room = rooms.get(joinedRoom);
    if (!room) return;
    room.peers.delete(socket.id);
    if (room.peers.size === 0) {
      dropRoom(joinedRoom);
    } else {
      io.to(joinedRoom).emit('peers', [...room.peers].map(([id, u]) => ({ id, ...u })));
    }
  });
});

httpServer.listen(port, hostname, () => {
  const lan = lanAddresses();
  console.log('\n  VEXCollab is up\n');
  console.log(`  On this computer   ${scheme}://localhost:${port}`);
  for (const address of lan) {
    console.log(`  On your Wi-Fi      ${scheme}://${address}:${port}`);
  }
  if (publicMode) {
    console.log(
      '\n  Public mode. No password — anyone with the link can open a session.\n' +
        `  Limits: ${LIMITS.maxRooms} sessions, ${LIMITS.maxPeersPerRoom} people each, ` +
        `${LIMITS.maxConnections} connections,\n` +
        `          ${LIMITS.maxRoomsPerIp} sessions per address, ` +
        `${Math.round(LIMITS.maxDocBytes / 1024)} KB per session,\n` +
        `          idle sessions dropped after ${Math.round(LIMITS.idleMs / 60000)} minutes.\n` +
        '  Nothing is written to disk; a session is gone once its last person leaves.\n',
    );
    if (passwordIgnored) {
      console.log(
        '  VEXCOLLAB_PASSWORD is set but ignored: public mode has no password.\n' +
          '  Unset VEXCOLLAB_PUBLIC to require one again.\n',
      );
    }
  } else {
    console.log(
      password
        ? '\n  Password required. Share it with your team along with the link.\n'
        : '\n  No password set. Anyone on your network can open this.\n  Set VEXCOLLAB_PASSWORD to require one.\n',
    );
  }
  if (lan.length && !credentials) {
    console.log(
      '  Note: the brain can only be reached from localhost. Browsers block USB\n' +
        '  access on plain-http LAN addresses, so teammates can edit but only this\n' +
        '  computer can upload. Start with --https to let them use a brain too.\n',
    );
  }
  if (credentials) {
    console.log(
      '  Using a self-signed certificate, so each browser shows a warning once:\n' +
        '  click Advanced, then Proceed. After that the brain works over Wi-Fi too.\n',
    );
  }
});
