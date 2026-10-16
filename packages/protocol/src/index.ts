/** Messages exchanged between the web app and the online game server, as JSON over a WebSocket. */

export type Seat = 'white' | 'black';

export type Result =
  | { kind: 'win'; winner: Seat; reason: 'no-moves' | 'resign' }
  | { kind: 'draw'; reason: 'repetition' | 'forty-moves' };

export interface RoomState {
  room: string;
  /** Moves of the current game in notation (`22-18`, `22x13x6`), replayed from the start by clients. */
  moves: string[];
  result: Result | null;
  /** Which seats have a player, and whether that player is connected right now. */
  seats: Record<Seat, { taken: boolean; connected: boolean }>;
  /** Seats that asked for a rematch after the game ended. */
  rematch: Record<Seat, boolean>;
  /** Increases with every rematch; colours swap each time. */
  game: number;
}

export type ClientMessage =
  | { t: 'create' }
  | { t: 'join'; room: string; token?: string }
  | { t: 'move'; move: string; ply: number }
  | { t: 'resign' }
  | { t: 'rematch' };

export type ErrorCode =
  | 'bad-request'
  | 'not-found'
  | 'full'
  | 'not-seated'
  | 'not-your-turn'
  | 'illegal'
  | 'stale'
  | 'game-over'
  | 'rate-limited'
  | 'too-many-rooms';

export type ServerMessage =
  | { t: 'joined'; seat: Seat; token: string; state: RoomState }
  /** `seat` is the receiver's own seat, which swaps on a rematch. */
  | { t: 'state'; seat: Seat | null; state: RoomState }
  | { t: 'error'; code: ErrorCode };

export const ROOM_CODE_LENGTH = 6;
/** No 0/O, 1/I/L: codes are read aloud and typed on phones. */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
