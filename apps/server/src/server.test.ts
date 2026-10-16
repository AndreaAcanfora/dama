import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@dama/protocol';
import { startServer } from './server';
import type { DamaServer } from './server';

let server: DamaServer | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await server?.close();
  server = null;
});

/** A test client that queues every message it receives. */
async function connect(port: number, headers: Record<string, string> = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { headers });
  sockets.push(ws);
  const inbox: ServerMessage[] = [];
  const waiters: ((m: ServerMessage) => void)[] = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as ServerMessage;
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else inbox.push(msg);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return {
    ws,
    send: (m: ClientMessage) => ws.send(JSON.stringify(m)),
    next: () => {
      const queued = inbox.shift();
      return queued ? Promise.resolve(queued) : new Promise<ServerMessage>((r) => waiters.push(r));
    },
  };
}

describe('online server', () => {
  it('answers health checks', async () => {
    server = await startServer({ port: 0 });
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(await res.text()).toBe('ok');
  });

  it('lets two players create, join and play a move', async () => {
    server = await startServer({ port: 0 });
    const a = await connect(server.port);
    a.send({ t: 'create' });
    const created = await a.next();
    expect(created).toMatchObject({ t: 'joined', seat: 'white' });
    if (created.t !== 'joined') return;
    const code = created.state.room;
    expect(code).toMatch(/^[2-9A-Z]{6}$/);

    const b = await connect(server.port);
    b.send({ t: 'join', room: code });
    expect(await b.next()).toMatchObject({ t: 'joined', seat: 'black' });
    expect(await a.next()).toMatchObject({ t: 'state', state: { seats: { black: { taken: true, connected: true } } } });

    a.send({ t: 'move', move: '22-18', ply: 0 });
    expect(await a.next()).toMatchObject({ t: 'state', state: { moves: ['22-18'] } });
    expect(await b.next()).toMatchObject({ t: 'state', state: { moves: ['22-18'] } });

    b.send({ t: 'move', move: '22-18', ply: 1 });
    expect(await b.next()).toEqual({ t: 'error', code: 'illegal' });
  });

  it('tells each player their new colour after a rematch', async () => {
    server = await startServer({ port: 0 });
    const a = await connect(server.port);
    a.send({ t: 'create' });
    const created = await a.next();
    if (created.t !== 'joined') throw new Error('expected joined');
    const b = await connect(server.port);
    b.send({ t: 'join', room: created.state.room });
    await b.next();
    await a.next();

    a.send({ t: 'resign' });
    await a.next();
    await b.next();
    a.send({ t: 'rematch' });
    await a.next();
    await b.next();
    b.send({ t: 'rematch' });
    expect(await a.next()).toMatchObject({ t: 'state', seat: 'black', state: { game: 2 } });
    expect(await b.next()).toMatchObject({ t: 'state', seat: 'white', state: { game: 2 } });
  });

  it('gives a reconnecting player the same seat', async () => {
    server = await startServer({ port: 0 });
    const a = await connect(server.port);
    a.send({ t: 'create' });
    const created = await a.next();
    if (created.t !== 'joined') throw new Error('expected joined');
    a.ws.close();

    const again = await connect(server.port);
    again.send({ t: 'join', room: created.state.room, token: created.token });
    expect(await again.next()).toMatchObject({ t: 'joined', seat: 'white', token: created.token });
  });

  it('reports unknown rooms and malformed messages', async () => {
    server = await startServer({ port: 0 });
    const a = await connect(server.port);
    a.send({ t: 'join', room: 'ZZZZZZ' });
    expect(await a.next()).toEqual({ t: 'error', code: 'not-found' });
    a.ws.send('not json');
    expect(await a.next()).toEqual({ t: 'error', code: 'bad-request' });
  });

  it('limits how many rooms one address can open', async () => {
    server = await startServer({ port: 0, maxRoomsPerIp: 2 });
    const a = await connect(server.port);
    for (let i = 0; i < 2; i++) {
      a.send({ t: 'create' });
      expect(await a.next()).toMatchObject({ t: 'joined' });
    }
    a.send({ t: 'create' });
    expect(await a.next()).toEqual({ t: 'error', code: 'too-many-rooms' });
  });

  it('refuses connections from origins that are not allowed', async () => {
    server = await startServer({ port: 0, allowedOrigins: ['https://example.org'] });
    await expect(connect(server.port, { Origin: 'https://evil.test' })).rejects.toThrow();
    const ok = await connect(server.port, { Origin: 'https://example.org' });
    expect(ok.ws.readyState).toBe(WebSocket.OPEN);
  });
});
