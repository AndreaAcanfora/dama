import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromFen, legalMoves, moveToString } from '@dama/engine';
import { POLICY_SIZE, encode, neuralSearch, policyIndex } from './neural';
import type { Evaluate } from './neural';

const cases = JSON.parse(readFileSync(new URL('../../../fixtures/encoding.json', import.meta.url), 'utf8')) as {
  fen: string;
  quiet: number;
  ones: number[];
  quietPlane: number;
  policy: Record<string, number>;
}[];

const uniform: Evaluate = async () => ({ policy: new Float32Array(POLICY_SIZE), value: 0 });

describe('encoding matches the training code', () => {
  it.each(cases.map((c, i) => [i, c] as const))('case %i', (_, c) => {
    const pos = fromFen(c.fen);
    const x = encode(pos, c.quiet);
    const ones = [...x.subarray(0, 4 * 64)].flatMap((v, i) => (v === 1 ? [i] : []));
    expect(ones).toEqual(c.ones);
    expect(x[4 * 64]).toBeCloseTo(c.quietPlane, 6);
    for (const m of legalMoves(pos)) expect(policyIndex(m, pos.turn)).toBe(c.policy[moveToString(m)]);
  });
});

describe('neural search', () => {
  it('finds the winning sacrifice from terminal values alone', async () => {
    const result = await neuralSearch(fromFen('W:W22,23,26,29:B6,15,14'), 0, uniform, { simulations: 600 });
    expect(result.move && moveToString(result.move)).toBe('22-19');
  });

  it('returns the only move without searching', async () => {
    let calls = 0;
    const counting: Evaluate = async (x: Float32Array) => {
      calls++;
      return uniform(x);
    };
    const result = await neuralSearch(fromFen('W:W22:B18,10,1'), 0, counting, { simulations: 50 });
    expect(result.move && moveToString(result.move)).toBe('22x13x6');
    expect(calls).toBe(0);
  });
});
