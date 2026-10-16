import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromFen, initialPosition, legalMoves, moveToString, perft } from './index';

const fixtures = JSON.parse(readFileSync(new URL('../../../fixtures/engine.json', import.meta.url), 'utf8')) as {
  perft: Record<string, number>;
  positions: { fen: string; moves: string[] }[];
};

describe('shared fixtures', () => {
  it.each(Object.entries(fixtures.perft).filter(([d]) => Number(d) <= 6))('perft %s', (depth, leaves) => {
    expect(perft(initialPosition(), Number(depth))).toBe(leaves);
  });

  it(`reproduces the legal moves of ${fixtures.positions.length} positions`, () => {
    for (const { fen, moves } of fixtures.positions) {
      expect(legalMoves(fromFen(fen)).map(moveToString).sort(), fen).toEqual(moves);
    }
  });
});
