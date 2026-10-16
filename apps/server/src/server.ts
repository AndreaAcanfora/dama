import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@dama/protocol';
import type { ClientMessage, ErrorCode, ServerMessage } from '@dama/protocol';
import { Room } from './room';

export interface ServerOptions {
  port: number;
  host?: string;
  /** Exact Origin header values allowed to connect; empty allows any (local development). */
  allowedOrigins?: string[];
  /** Read the client address from X-Forwarded-For (set when running behind Caddy). */
  trustProxy?: boolean;
  maxRoomsPerIp?: number;
  maxRooms?: number;
}

export interface DamaServer {
  port: number;
  rooms: () => number;
  close: () => Promise<void>;
}

const MAX_MESSAGE_BYTES = 2048;
const MESSAGES_PER_SECOND = 10;
const MESSAGE_BURST = 20;
const HEARTBEAT_MS = 30_000;
const SWEEP_MS = 60_000;
/** Rooms nobody is connected to are dropped after this long. */
const EMPTY_ROOM_TTL_MS = 30 * 60_000;
/** Any room is dropped after this long without activity. */
const IDLE_ROOM_TTL_MS = 24 * 60 * 60_000;

interface Client {
  ws: WebSocket;
  ip: string;
  room: Room | null;
  token: string | null;
  alive: boolean;
  tokens: number;
  refilled: number;
}

function parse(raw: string): ClientMessage | null {
  try {
    const m = JSON.parse(raw) as Partial<ClientMessage> | null;
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;
    switch (m.t) {
      case 'create':
      case 'resign':
      case 'rematch':
        return { t: m.t };
      case 'join': {
        const { room, token } = m as { room?: unknown; token?: unknown };
        if (typeof room !== 'string' || room.length !== ROOM_CODE_LENGTH) return null;
        if (token !== undefined && typeof token !== 'string') return null;
        return token === undefined ? { t: 'join', room: room.toUpperCase() } : { t: 'join', room: room.toUpperCase(), token };
      }
      case 'move': {
        const { move, ply } = m as { move?: unknown; ply?: unknown };
        if (typeof move !== 'string' || move.length > 64 || !Number.isInteger(ply)) return null;
        return { t: 'move', move, ply: ply as number };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function startServer(options: ServerOptions): Promise<DamaServer> {
  const { allowedOrigins = [], trustProxy = false, maxRoomsPerIp = 20, maxRooms = 5000 } = options;
  const rooms = new Map<string, Room>();
  const roomOwners = new Map<string, string>();
  const clients = new Set<Client>();

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    res.writeHead(404).end();
  });

  const clientIp = (req: IncomingMessage) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (trustProxy && typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
    return req.socket.remoteAddress ?? 'unknown';
  };

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ origin }: { origin: string }) => allowedOrigins.length === 0 || allowedOrigins.includes(origin),
  });

  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const fail = (client: Client, code: ErrorCode) => send(client.ws, { t: 'error', code });
  const broadcast = (room: Room, except?: Client) => {
    const state = room.state();
    for (const c of clients) {
      if (c.room === room && c !== except) send(c.ws, { t: 'state', seat: c.token ? room.seatOf(c.token) : null, state });
    }
  };

  const newCode = () => {
    let code: string;
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('');
    } while (rooms.has(code));
    return code;
  };

  const leave = (client: Client) => {
    if (client.room && client.token) {
      const room = client.room;
      // Another tab may hold the same seat; only mark it disconnected when none does.
      const stillThere = [...clients].some((c) => c !== client && c.room === room && c.token === client.token);
      if (!stillThere) room.disconnect(client.token);
      client.room = null;
      client.token = null;
      broadcast(room);
    }
  };

  const seat = (client: Client, room: Room, token?: string) => {
    const joined = room.join(token);
    if ('error' in joined) return fail(client, joined.error);
    leave(client);
    client.room = room;
    client.token = joined.token;
    send(client.ws, { t: 'joined', seat: joined.seat, token: joined.token, state: room.state() });
    broadcast(room, client);
  };

  const handle = (client: Client, msg: ClientMessage) => {
    switch (msg.t) {
      case 'create': {
        const owned = [...roomOwners.values()].filter((ip) => ip === client.ip).length;
        if (owned >= maxRoomsPerIp || rooms.size >= maxRooms) return fail(client, 'too-many-rooms');
        const room = new Room(newCode());
        rooms.set(room.code, room);
        roomOwners.set(room.code, client.ip);
        return seat(client, room);
      }
      case 'join': {
        const room = rooms.get(msg.room);
        if (!room) return fail(client, 'not-found');
        return seat(client, room, msg.token);
      }
      case 'move': {
        if (!client.room || !client.token) return fail(client, 'not-seated');
        const error = client.room.move(client.token, msg.move, msg.ply);
        if (error) return fail(client, error);
        return broadcast(client.room);
      }
      case 'resign':
      case 'rematch': {
        if (!client.room || !client.token) return fail(client, 'not-seated');
        if (msg.t === 'resign') client.room.resign(client.token);
        else client.room.rematch(client.token);
        return broadcast(client.room);
      }
    }
  };

  wss.on('connection', (ws, req) => {
    const client: Client = { ws, ip: clientIp(req), room: null, token: null, alive: true, tokens: MESSAGE_BURST, refilled: Date.now() };
    clients.add(client);
    ws.on('pong', () => {
      client.alive = true;
    });
    ws.on('message', (data) => {
      const now = Date.now();
      client.tokens = Math.min(MESSAGE_BURST, client.tokens + ((now - client.refilled) / 1000) * MESSAGES_PER_SECOND);
      client.refilled = now;
      if (client.tokens < 1) return fail(client, 'rate-limited');
      client.tokens--;
      const msg = parse(String(data));
      if (!msg) return fail(client, 'bad-request');
      handle(client, msg);
    });
    ws.on('close', () => {
      leave(client);
      clients.delete(client);
    });
  });

  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, HEARTBEAT_MS);

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const idle = now - room.lastActivity;
      if ((room.empty && idle > EMPTY_ROOM_TTL_MS) || idle > IDLE_ROOM_TTL_MS) {
        rooms.delete(code);
        roomOwners.delete(code);
      }
    }
  }, SWEEP_MS);

  return new Promise((resolve) => {
    http.listen(options.port, options.host ?? '127.0.0.1', () => {
      resolve({
        port: (http.address() as AddressInfo).port,
        rooms: () => rooms.size,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            clearInterval(sweep);
            for (const c of clients) c.ws.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}
