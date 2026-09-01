/*
 * VEXCollab - collaboration server.
 * Copyright (C) 2026 VEXCollab contributors
 * Licensed under AGPL-3.0-only. See LICENSE.
 *
 * Runs Next.js and a Socket.IO relay for Yjs documents in the same process, so
 * `npm run dev` gives you a working collaborative editor with no extra service.
 */
import { createServer } from 'node:http';
import next from 'next';
import { Server as SocketServer } from 'socket.io';
import * as Y from 'yjs';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST ?? 'localhost';
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
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

const httpServer = createServer((req, res) => handle(req, res));

const io = new SocketServer(httpServer, {
  maxHttpBufferSize: 1e7,
  cors: { origin: dev ? '*' : false },
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

httpServer.listen(port, () => {
  console.log(`VEXCollab ready on http://${hostname}:${port}`);
});
