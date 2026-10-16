import { has, initialPosition, opponent } from './board';
import type { Color, Position } from './board';
import { applyMove, legalMoves, sameMove } from './moves';
import type { Move } from './moves';

/** Plies without a capture or a man move after which the game is drawn (40 moves each). */
export const QUIET_PLY_LIMIT = 80;

export interface GameState {
  position: Position;
  /** Position keys after every ply, starting with the initial position. */
  history: string[];
  quietPlies: number;
  moves: Move[];
}

export type GameStatus =
  | { kind: 'ongoing' }
  | { kind: 'win'; winner: Color }
  | { kind: 'draw'; reason: 'repetition' | 'forty-moves' };

export const positionKey = (p: Position): string => `${p.white}:${p.black}:${p.kings}:${p.turn}`;

export function newGame(position: Position = initialPosition()): GameState {
  return { position, history: [positionKey(position)], quietPlies: 0, moves: [] };
}

/** Plays a move, which must be one of the legal moves of the current position. */
export function play(game: GameState, move: Move): GameState {
  const legal = legalMoves(game.position).find((m) => sameMove(m, move));
  if (!legal) throw new Error('illegal move');
  const position = applyMove(game.position, legal);
  const quiet = legal.captures.length === 0 && has(game.position.kings, legal.from);
  return {
    position,
    history: [...game.history, positionKey(position)],
    quietPlies: quiet ? game.quietPlies + 1 : 0,
    moves: [...game.moves, legal],
  };
}

export function status(game: GameState): GameStatus {
  if (legalMoves(game.position).length === 0) return { kind: 'win', winner: opponent(game.position.turn) };
  const key = positionKey(game.position);
  if (game.history.filter((k) => k === key).length >= 3) return { kind: 'draw', reason: 'repetition' };
  if (game.quietPlies >= QUIET_PLY_LIMIT) return { kind: 'draw', reason: 'forty-moves' };
  return { kind: 'ongoing' };
}
