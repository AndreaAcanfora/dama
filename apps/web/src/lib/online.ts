import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ErrorCode, RoomState, Seat, ServerMessage } from '@dama/protocol';

/** Online play needs a server; production builds without VITE_WS_URL hide it. */
export const WS_URL: string = import.meta.env.VITE_WS_URL || (import.meta.env.DEV ? 'ws://localhost:8787' : '');

const TOKENS_KEY = 'dama.online.tokens';

function readTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveToken(room: string, token: string) {
  try {
    const tokens = { ...readTokens(), [room]: token };
    // Keep the 20 most recent rooms.
    localStorage.setItem(TOKENS_KEY, JSON.stringify(Object.fromEntries(Object.entries(tokens).slice(-20))));
  } catch {
    // Without storage a refresh loses the seat; the game still works until then.
  }
}

export type Connection = 'connecting' | 'open' | 'reconnecting';

/**
 * Joins `code`, or creates a room when it is null. Reconnects with back-off and
 * reclaims the seat with the token saved for that room.
 */
export function useOnlineRoom(code: string | null, onCreated: (code: string) => void) {
  const [state, setState] = useState<RoomState | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const socket = useRef<WebSocket | null>(null);
  const room = useRef(code);
  const created = useRef(onCreated);
  created.current = onCreated;

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      const ws = new WebSocket(WS_URL);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setConnection('open');
        const current = room.current;
        const message: ClientMessage = current
          ? { t: 'join', room: current, ...(readTokens()[current] ? { token: readTokens()[current]! } : {}) }
          : { t: 'create' };
        ws.send(JSON.stringify(message));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data)) as ServerMessage;
        if (msg.t === 'joined') {
          saveToken(msg.state.room, msg.token);
          setSeat(msg.seat);
          setState(msg.state);
          setError(null);
          if (room.current !== msg.state.room) {
            room.current = msg.state.room;
            created.current(msg.state.room);
          }
        } else if (msg.t === 'state') {
          setState(msg.state);
          setSeat(msg.seat);
        } else {
          setError(msg.code);
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setConnection('reconnecting');
        timer = setTimeout(open, Math.min(10_000, 1000 * 2 ** attempt++));
      };
    };

    open();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket.current?.close();
    };
    // Connect once per screen; the room code is tracked in a ref.
  }, []);

  const send = useCallback((message: ClientMessage) => {
    setError(null);
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  }, []);

  return { state, seat, error, connection, send };
}
