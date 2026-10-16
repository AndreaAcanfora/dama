import { randomUUID } from 'node:crypto';
import { legalMoves, moveToString, newGame, play, status } from '@dama/engine';
import type { GameState } from '@dama/engine';
import type { ErrorCode, Result, RoomState, Seat } from '@dama/protocol';

interface Player {
  token: string;
  connected: boolean;
}

const SEATS: readonly Seat[] = ['white', 'black'];

/**
 * One online game between two players. The room is authoritative: every move is
 * validated with the same engine the clients use, so a modified client cannot cheat.
 */
export class Room {
  private seats: Record<Seat, Player | null> = { white: null, black: null };
  private game: GameState = newGame();
  private moves: string[] = [];
  private result: Result | null = null;
  private rematchVotes: Record<Seat, boolean> = { white: false, black: false };
  private gameNumber = 1;
  lastActivity = Date.now();

  constructor(readonly code: string) {}

  /** Takes a free seat, or reclaims one with the token handed out when it was first taken. */
  join(token?: string): { seat: Seat; token: string } | { error: ErrorCode } {
    this.touch();
    if (token) {
      const seat = this.seatOf(token);
      if (seat) {
        this.seats[seat]!.connected = true;
        return { seat, token };
      }
    }
    const free = SEATS.find((s) => this.seats[s] === null);
    if (!free) return { error: 'full' };
    const player = { token: randomUUID(), connected: true };
    this.seats[free] = player;
    return { seat: free, token: player.token };
  }

  seatOf(token: string): Seat | null {
    return SEATS.find((s) => this.seats[s]?.token === token) ?? null;
  }

  disconnect(token: string): void {
    const seat = this.seatOf(token);
    if (seat) this.seats[seat]!.connected = false;
    this.touch();
  }

  get empty(): boolean {
    return SEATS.every((s) => !this.seats[s]?.connected);
  }

  /** Returns null when the move was played, otherwise why it was refused. */
  move(token: string, notation: string, ply: number): ErrorCode | null {
    this.touch();
    const seat = this.seatOf(token);
    if (!seat) return 'not-seated';
    if (this.result) return 'game-over';
    if (ply !== this.moves.length) return 'stale';
    if (!this.seats.white || !this.seats.black || this.game.position.turn !== seat) return 'not-your-turn';
    const move = legalMoves(this.game.position).find((m) => moveToString(m) === notation);
    if (!move) return 'illegal';

    this.game = play(this.game, move);
    this.moves.push(notation);
    const s = status(this.game);
    if (s.kind === 'win') this.result = { kind: 'win', winner: s.winner, reason: 'no-moves' };
    else if (s.kind === 'draw') this.result = { kind: 'draw', reason: s.reason };
    return null;
  }

  resign(token: string): void {
    const seat = this.seatOf(token);
    if (!seat || this.result) return;
    this.result = { kind: 'win', winner: seat === 'white' ? 'black' : 'white', reason: 'resign' };
    this.touch();
  }

  rematch(token: string): void {
    const seat = this.seatOf(token);
    if (!seat || !this.result) return;
    this.rematchVotes[seat] = true;
    if (this.rematchVotes.white && this.rematchVotes.black) {
      this.seats = { white: this.seats.black, black: this.seats.white };
      this.game = newGame();
      this.moves = [];
      this.result = null;
      this.rematchVotes = { white: false, black: false };
      this.gameNumber++;
    }
    this.touch();
  }

  state(): RoomState {
    const seat = (s: Seat) => ({ taken: this.seats[s] !== null, connected: this.seats[s]?.connected ?? false });
    return {
      room: this.code,
      moves: [...this.moves],
      result: this.result,
      seats: { white: seat('white'), black: seat('black') },
      rematch: { ...this.rematchVotes },
      game: this.gameNumber,
    };
  }

  private touch(): void {
    this.lastActivity = Date.now();
  }
}
