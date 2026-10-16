import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyMove, fromFen, legalMoves, moveToString, positionKey } from '@dama/engine';
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

  it('scores going back to a twice-seen position as a draw', async () => {
    // White has three kings against one, so every normal position favours White,
    // except the one that would occur for the third time.
    const start = fromFen('W:WK32,K29,K30:BK1');
    const repeated = applyMove(start, legalMoves(start).find((m) => moveToString(m) === '32-28')!);
    const material: Evaluate = async (x) => {
      let mine = 0;
      let theirs = 0;
      for (let i = 0; i < 64; i++) {
        mine += x[64 + i]!;
        theirs += x[3 * 64 + i]!;
      }
      return { policy: new Float32Array(POLICY_SIZE), value: 0.4 * (mine - theirs) };
    };
    const history = new Map([
      [positionKey(start), 1],
      [positionKey(repeated), 2],
    ]);
    const result = await neuralSearch(start, 0, material, { simulations: 300, history });
    expect(result.move && moveToString(result.move)).not.toBe('32-28');
    expect(result.stats.get('32-28')?.q).toBe(0);
  });
});

