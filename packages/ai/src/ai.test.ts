import { describe, expect, it } from 'vitest';
import { applyMove, fromAscii, initialPosition, legalMoves, moveToString, square } from '@dama/engine';
import { LEVELS, chooseMove, evaluate, search } from './index';

const EMPTY = '........';
const board = (rows: string[], turn: 'white' | 'black' = 'white') => fromAscii(rows.join('\n'), turn);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// White gives up a man on (3,4) so that the forced recapture opens a triple jump to promotion.
const SHOT = board([
  EMPTY,
  '...b....',
  EMPTY,
  '...b.b..',
  EMPTY,
  '...w.w..',
  '..w.....',
  '.w......',
]);

describe('evaluate', () => {
  it('is zero for the symmetric starting position', () => {
    expect(evaluate(initialPosition())).toBe(0);
  });

  it('is from the side to move and favours extra material', () => {
    const up = board([EMPTY, EMPTY, EMPTY, '.......b', EMPTY, EMPTY, '..w.w...', EMPTY]);
    expect(evaluate(up)).toBeGreaterThan(0);
    expect(evaluate({ ...up, turn: 'black' })).toBeLessThan(0);
  });
});

describe('search', () => {
  it('finds the sacrifice that wins three pieces', () => {
    const result = search(SHOT, { maxDepth: 4 });
    expect(result.move && [result.move.from, result.move.to]).toEqual([square(2, 3), square(3, 4)]);
    expect(result.score).toBeGreaterThan(200);
  });

  it('returns no move when the side to move is blocked', () => {
    const sealed = board([EMPTY, EMPTY, EMPTY, EMPTY, '..b.....', '.b......', 'w.......', EMPTY]);
    expect(legalMoves(sealed)).toHaveLength(0);
    expect(search(sealed, { maxDepth: 3 }).move).toBeNull();
  });

  it('stops within its time budget', () => {
    const started = performance.now();
    const result = search(initialPosition(), { maxDepth: 64, timeMs: 150 });
    expect(performance.now() - started).toBeLessThan(400);
    expect(result.move).not.toBeNull();
    expect(result.depth).toBeGreaterThan(2);
  });
});

describe('levels', () => {
  it('goes from beginner to expert', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('always plays a legal move', () => {
    const pos = initialPosition();
    const legal = legalMoves(pos).map(moveToString);
    for (const level of LEVELS) {
      const move = chooseMove(pos, level.id, seeded(level.id));
      expect(legal).toContain(move && moveToString(move));
    }
  });

  it('plays the winning shot at expert level every time', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const move = chooseMove(SHOT, 5, seeded(seed));
      expect(move && [move.from, move.to]).toEqual([square(2, 3), square(3, 4)]);
    }
  });

  it('sometimes misses it as a beginner', () => {
    const plays = Array.from({ length: 40 }, (_, seed) => chooseMove(SHOT, 1, seeded(seed + 1)));
    expect(plays.some((m) => m && m.from !== square(2, 3))).toBe(true);
  });

  it('beats the beginner as expert in most games', () => {
    let expertWins = 0;
    for (let g = 0; g < 4; g++) {
      const rng = seeded(100 + g);
      let pos = initialPosition();
      const expertIsWhite = g % 2 === 0;
      for (let ply = 0; ply < 160; ply++) {
        const expertTurn = (pos.turn === 'white') === expertIsWhite;
        const move = expertTurn ? chooseMove(pos, 4, rng, { timeMs: 40 }) : chooseMove(pos, 1, rng);
        if (!move) {
          if (!expertTurn) expertWins++;
          break;
        }
        pos = applyMove(pos, move);
      }
    }
    expect(expertWins).toBeGreaterThanOrEqual(3);
  }, 30_000);
});
