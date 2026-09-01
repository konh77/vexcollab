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
import { createHmac, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import next from 'next';
import { Server as SocketServer } from 'socket.io';
import * as Y from 'yjs';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
const password = process.env.VEXCOLLAB_PASSWORD || null;

const COOKIE = 'vexcollab_auth';

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

const app = next({ dev, hostname: hostname === '0.0.0.0' ? 'localhost' : hostname, port });
const handle = app.getRequestHandler();

/**
 * Rooms live in memory only. A room is dropped once the last peer leaves, which
 * is the same "no sign-up, nothing persisted" model the editor UI promises.
 * @type {Map<string, { doc: Y.Doc, peers: Map<string, { name: string, color: string }> }>}
 */
const rooms = new Map();

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = { doc: new Y.Doc(), peers: new Map() };
    rooms.set(roomId, room);
  }
  return room;
}

await app.prepare();

const httpServer = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  // Login endpoint lives here rather than in a route handler so that the
  // password never has to be duplicated into the Next runtime.
  if (pathname === '/api/auth' && req.method === 'POST') {
    try {
      const { password: attempt } = JSON.parse((await readBody(req)) || '{}');
      if (password && attempt && safeEqual(attempt, password)) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `${COOKIE}=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
        });
        return res.end(JSON.stringify({ ok: true }));
      }
    } catch {
      // fall through to the failure response
    }
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
});

const io = new SocketServer(httpServer, {
  maxHttpBufferSize: 1e7,
  cors: { origin: dev ? '*' : false },
});

// A password on the page is worthless if the socket accepts anyone, so the
// handshake is checked with the same cookie.
io.use((socket, nextFn) => {
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
    joinedRoom = roomId;
    const room = getRoom(roomId);
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
    Y.applyUpdate(room.doc, bytes);
    socket.to(joinedRoom).emit('update', bytes);
  });

  socket.on('awareness', (update) => {
    if (!joinedRoom) return;
    socket.to(joinedRoom).emit('awareness', new Uint8Array(update));
  });

  socket.on('disconnect', () => {
    if (!joinedRoom) return;
    const room = rooms.get(joinedRoom);
    if (!room) return;
    room.peers.delete(socket.id);
    if (room.peers.size === 0) {
      room.doc.destroy();
      rooms.delete(joinedRoom);
    } else {
      io.to(joinedRoom).emit('peers', [...room.peers].map(([id, u]) => ({ id, ...u })));
    }
  });
});

httpServer.listen(port, hostname, () => {
  const lan = lanAddresses();
  console.log('\n  VEXCollab is up\n');
  console.log(`  On this computer   http://localhost:${port}`);
  for (const address of lan) {
    console.log(`  On your Wi-Fi      http://${address}:${port}`);
  }
  console.log(
    password
      ? '\n  Password required. Share it with your team along with the link.\n'
      : '\n  No password set. Anyone on your network can open this.\n  Set VEXCOLLAB_PASSWORD to require one.\n',
  );
  if (lan.length) {
    console.log(
      '  Note: the brain can only be reached from http://localhost. Browsers block\n' +
        '  USB access on plain-http LAN addresses, so teammates can edit but the\n' +
        '  computer with the cable does the uploading.\n',
    );
  }
});
