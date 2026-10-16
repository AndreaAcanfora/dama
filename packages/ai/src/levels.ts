import { legalMoves } from '@dama/engine';
import type { Move, Position } from '@dama/engine';
import { Searcher } from './search';

export interface Level {
  id: number;
  name: { it: string; en: string };
  maxDepth: number;
  timeMs?: number;
  /** Uniform noise added to each root move's score, in hundredths of a man. */
  noise: number;
  /** Probability of playing a random legal move instead of thinking. */
  blunder: number;
}

export const LEVELS: readonly Level[] = [
  { id: 1, name: { it: 'Principiante', en: 'Beginner' }, maxDepth: 1, noise: 150, blunder: 0.25 },
  { id: 2, name: { it: 'Facile', en: 'Easy' }, maxDepth: 2, noise: 70, blunder: 0.1 },
  { id: 3, name: { it: 'Medio', en: 'Medium' }, maxDepth: 4, noise: 30, blunder: 0.03 },
  { id: 4, name: { it: 'Difficile', en: 'Hard' }, maxDepth: 10, timeMs: 400, noise: 0, blunder: 0 },
  { id: 5, name: { it: 'Esperto', en: 'Expert' }, maxDepth: 40, timeMs: 1500, noise: 0, blunder: 0 },
];

export function chooseMove(
  pos: Position,
  levelId: number,
  random: () => number = Math.random,
  overrides: { timeMs?: number; maxDepth?: number } = {},
): Move | null {
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level) throw new Error(`unknown level ${levelId}`);
  const moves = legalMoves(pos);
  if (moves.length <= 1) return moves[0] ?? null;

  if (random() < level.blunder) return moves[Math.floor(random() * moves.length)]!;

  const searcher = new Searcher();
  const maxDepth = overrides.maxDepth ?? level.maxDepth;
  if (level.noise === 0) {
    const timeMs = overrides.timeMs ?? level.timeMs;
    return searcher.search(pos, timeMs === undefined ? { maxDepth } : { maxDepth, timeMs }).move;
  }

  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const { move, score } of searcher.scoreMoves(pos, maxDepth)) {
    const noisy = score + (random() * 2 - 1) * level.noise;
    if (noisy > bestScore) {
      bestScore = noisy;
      best = move;
    }
  }
  return best;
}
