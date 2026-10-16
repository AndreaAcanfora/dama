import {
  DIRECTIONS,
  FORWARD,
  JUMP,
  NEIGHBOR,
  SQUARE_COUNT,

  clear,
  has,
  promotionRow,
  rowOf,
  set,
  toNumber,
} from './board';
import type { Position } from './board';

export interface Move {
  from: number;
  to: number;
  /** Landing squares after `from`, in order; the last one is `to`. */
  path: number[];
  /** Captured squares in the order they were jumped. */
  captures: number[];
  promotes: boolean;
}

interface Candidate {
  move: Move;
  byKing: boolean;
  kingsTaken: number;
  firstKing: number;
}

function sides(pos: Position) {
  return pos.turn === 'white' ? { own: pos.white, enemy: pos.black } : { own: pos.black, enemy: pos.white };
}

function captureSequences(pos: Position, from: number, out: Candidate[]): void {
  const { enemy } = sides(pos);
  const isKing = has(pos.kings, from);
  const dirs = isKing ? DIRECTIONS : FORWARD[pos.turn];
  const lastRow = promotionRow(pos.turn);
  // The moving piece leaves its square, so a king may land back on it.
  const occupied = clear((pos.white | pos.black) >>> 0, from);

  const record = (path: number[], captures: number[], promotes: boolean) => {
    const kingIdx = captures.findIndex((s) => has(pos.kings, s));
    out.push({
      move: { from, to: path[path.length - 1]!, path, captures, promotes },
      byKing: isKing,
      kingsTaken: captures.filter((s) => has(pos.kings, s)).length,
      firstKing: kingIdx < 0 ? Infinity : kingIdx,
    });
  };

  const extend = (at: number, path: number[], captures: number[], taken: number) => {
    let extended = false;
    for (const d of dirs) {
      const over = NEIGHBOR[at * 4 + d]!;
      const land = JUMP[at * 4 + d]!;
      if (land < 0 || !has(enemy, over) || has(taken, over) || has(occupied, land)) continue;
      // A man can never capture a king.
      if (!isKing && has(pos.kings, over)) continue;
      extended = true;
      const nextPath = [...path, land];
      const nextCaptures = [...captures, over];
      if (!isKing && rowOf(land) === lastRow) {
        // Promotion ends the move.
        record(nextPath, nextCaptures, true);
        continue;
      }
      extend(land, nextPath, nextCaptures, set(taken, over));
    }
    if (!extended && captures.length > 0) record(path, captures, false);
  };

  extend(from, [], [], 0);
}

/** Apply the Italian capture precedence rules, in order. */
function mandatory(candidates: Candidate[]): Move[] {
  let pool = candidates;
  const keepMax = (score: (c: Candidate) => number) => {
    const best = Math.max(...pool.map(score));
    pool = pool.filter((c) => score(c) === best);
  };
  // 1. The greatest number of pieces.
  keepMax((c) => c.move.captures.length);
  // 2. With a king rather than a man.
  if (pool.some((c) => c.byKing)) pool = pool.filter((c) => c.byKing);
  // 3. The greatest number of kings.
  keepMax((c) => c.kingsTaken);
  // 4. The king met earliest in the sequence.
  keepMax((c) => -c.firstKing);

  // Different jump orders over the same pieces to the same square give the same result.
  const seen = new Set<string>();
  const moves: Move[] = [];
  for (const { move } of pool) {
    const key = `${move.from}-${move.to}-${[...move.captures].sort((a, b) => a - b).join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    moves.push(move);
  }
  return moves;
}

export function legalMoves(pos: Position): Move[] {
  const { own } = sides(pos);
  const candidates: Candidate[] = [];
  for (let s = 0; s < SQUARE_COUNT; s++) if (has(own, s)) captureSequences(pos, s, candidates);
  if (candidates.length > 0) return mandatory(candidates);

  const occupied = (pos.white | pos.black) >>> 0;
  const lastRow = promotionRow(pos.turn);
  const moves: Move[] = [];
  for (let s = 0; s < SQUARE_COUNT; s++) {
    if (!has(own, s)) continue;
    const isKing = has(pos.kings, s);
    for (const d of isKing ? DIRECTIONS : FORWARD[pos.turn]) {
      const to = NEIGHBOR[s * 4 + d]!;
      if (to < 0 || has(occupied, to)) continue;
      moves.push({ from: s, to, path: [to], captures: [], promotes: !isKing && rowOf(to) === lastRow });
    }
  }
  return moves;
}

export function applyMove(pos: Position, move: Move): Position {
  let own = pos.turn === 'white' ? pos.white : pos.black;
  let enemy = pos.turn === 'white' ? pos.black : pos.white;
  let kings = pos.kings;
  const wasKing = has(kings, move.from);

  own = set(clear(own, move.from), move.to);
  kings = clear(kings, move.from);
  for (const s of move.captures) {
    enemy = clear(enemy, s);
    kings = clear(kings, s);
  }
  if (wasKing || move.promotes) kings = set(kings, move.to);

  return pos.turn === 'white'
    ? { white: own, black: enemy, kings, turn: 'black' }
    : { white: enemy, black: own, kings, turn: 'white' };
}

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const m of moves) total += perft(applyMove(pos, m), depth - 1);
  return total;
}

/** `22-18` for a quiet move, `22x13x6` (every landing square) for a capture. */
export function moveToString(move: Move): string {
  if (move.captures.length === 0) return `${toNumber(move.from)}-${toNumber(move.to)}`;
  return [move.from, ...move.path].map(toNumber).join('x');
}

export const sameMove = (a: Move, b: Move): boolean =>
  a.from === b.from && a.to === b.to && a.captures.length === b.captures.length && a.captures.every((s, i) => s === b.captures[i]);

