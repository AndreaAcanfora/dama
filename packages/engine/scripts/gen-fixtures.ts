/**
 * Writes fixtures/engine.json: perft counts from the start and the sorted legal moves of
 * positions reached by seeded random playouts. Every rules implementation in the repo
 * (this engine, the Python port used for training) must reproduce this file exactly.
 */
import { writeFileSync } from 'node:fs';
import { applyMove, initialPosition, legalMoves, moveToString, perft, toFen } from '../src/index';
import type { Position } from '../src/index';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const perftDepths = [1, 2, 3, 4, 5, 6, 7, 8];
const perftCounts = perftDepths.map((d) => perft(initialPosition(), d));

const positions: { fen: string; moves: string[] }[] = [];
const seen = new Set<string>();
const random = rng(42);
for (let game = 0; game < 300 && positions.length < 2000; game++) {
  let pos: Position = initialPosition();
  for (let ply = 0; ply < 200; ply++) {
    const moves = legalMoves(pos);
    const fen = toFen(pos);
    if (!seen.has(fen)) {
      seen.add(fen);
      positions.push({ fen, moves: moves.map(moveToString).sort() });
    }
    if (moves.length === 0) break;
    pos = applyMove(pos, moves[Math.floor(random() * moves.length)]!);
  }
}

const out = new URL('../../../fixtures/engine.json', import.meta.url);
writeFileSync(out, JSON.stringify({ perft: Object.fromEntries(perftDepths.map((d, i) => [d, perftCounts[i]])), positions }, null, 1) + '\n');
console.log('perft', perftCounts.join(' '), '| positions', positions.length,
  '| with captures', positions.filter((p) => p.moves.some((m) => m.includes('x'))).length);
