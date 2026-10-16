import { SQUARE_COUNT, applyMove, has, legalMoves, sameMove } from '@dama/engine';
import type { Move, Position } from '@dama/engine';
import { evaluate } from './evaluate';

export const MATE = 100_000;
const INF = MATE + 1;
const WIN_THRESHOLD = MATE - 1_000;

export interface SearchOptions {
  maxDepth: number;
  timeMs?: number;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
}

// Zobrist keys: two independent 32-bit halves folded into a 53-bit safe integer.
const ZOBRIST = (() => {
  let seed = 0x9e3779b9;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  // [square][white man, white king, black man, black king][half]
  const table = Array.from({ length: SQUARE_COUNT * 4 }, () => [next(), next() & 0x1fffff] as const);
  return { table, turn: [next(), next() & 0x1fffff] as const };
})();

function hashOf(pos: Position): number {
  let hi = pos.turn === 'black' ? ZOBRIST.turn[0] : 0;
  let lo = pos.turn === 'black' ? ZOBRIST.turn[1] : 0;
  for (let s = 0; s < SQUARE_COUNT; s++) {
    const kind = has(pos.white, s) ? 0 : has(pos.black, s) ? 2 : -1;
    if (kind < 0) continue;
    const [h, l] = ZOBRIST.table[s * 4 + kind + (has(pos.kings, s) ? 1 : 0)]!;
    hi ^= h;
    lo ^= l;
  }
  return (hi >>> 0) * 0x200000 + (lo >>> 0);
}

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

interface Entry {
  depth: number;
  score: number;
  flag: number;
  best: Move | null;
}

class Aborted extends Error {}

export class Searcher {
  nodes = 0;
  private table = new Map<number, Entry>();
  private deadline = Infinity;

  /** Full alpha-beta search with iterative deepening. */
  search(pos: Position, { maxDepth, timeMs }: SearchOptions): SearchResult {
    this.nodes = 0;
    this.deadline = timeMs === undefined ? Infinity : performance.now() + timeMs;
    if (this.table.size > 1_000_000) this.table.clear();

    const moves = legalMoves(pos);
    if (moves.length === 0) return { move: null, score: -MATE, depth: 0, nodes: 0 };
    if (moves.length === 1) return { move: moves[0]!, score: 0, depth: 0, nodes: 0 };

    let best: SearchResult = { move: moves[0]!, score: -INF, depth: 0, nodes: 0 };
    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        const score = this.negamax(pos, depth, -INF, INF, 0);
        const entry = this.table.get(hashOf(pos));
        best = { move: entry?.best ?? best.move, score, depth, nodes: this.nodes };
      } catch (e) {
        if (e instanceof Aborted) break;
        throw e;
      }
      if (Math.abs(best.score) >= WIN_THRESHOLD) break;
    }
    best.nodes = this.nodes;
    return best;
  }

  /** Exact score of every root move at a fixed depth, used by the weaker levels. */
  scoreMoves(pos: Position, depth: number): { move: Move; score: number }[] {
    this.deadline = Infinity;
    return legalMoves(pos).map((move) => ({
      move,
      score: -this.negamax(applyMove(pos, move), depth - 1, -INF, INF, 1),
    }));
  }

  private negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) throw new Aborted();

    const moves = legalMoves(pos);
    if (moves.length === 0) return -MATE + ply;
    // Captures are compulsory, so the horizon is only reached in quiet positions.
    const forced = moves[0]!.captures.length > 0;
    if (depth <= 0 && !forced) return evaluate(pos);

    const key = hashOf(pos);
    const entry = this.table.get(key);
    if (entry && entry.depth >= depth) {
      if (entry.flag === EXACT) return entry.score;
      if (entry.flag === LOWER && entry.score >= beta) return entry.score;
      if (entry.flag === UPPER && entry.score <= alpha) return entry.score;
    }

    order(moves, entry?.best ?? null);
    const alphaIn = alpha;
    let bestScore = -INF;
    let bestMove: Move | null = null;
    for (const move of moves) {
      // A forced single reply does not consume depth.
      const nextDepth = moves.length === 1 ? depth : depth - 1;
      const score = -this.negamax(applyMove(pos, move), nextDepth, -beta, -alpha, ply + 1);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    const flag = bestScore <= alphaIn ? UPPER : bestScore >= beta ? LOWER : EXACT;
    this.table.set(key, { depth, score: bestScore, flag, best: bestMove });
    return bestScore;
  }
}

function order(moves: Move[], hint: Move | null): void {
  const weight = (m: Move) => (hint && sameMove(m, hint) ? 1000 : 0) + (m.promotes ? 100 : 0) + m.captures.length * 10;
  moves.sort((a, b) => weight(b) - weight(a));
}

export function search(pos: Position, options: SearchOptions): SearchResult {
  return new Searcher().search(pos, options);
}
