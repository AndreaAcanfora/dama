import { describe, expect, it } from 'vitest';
import { fromFen, toFen } from '@dama/engine';
import { replay } from './replay';

describe('replay', () => {
  it('rebuilds the position, the pieces and the last move from notation', () => {
    const result = replay(['22-19', '10-14', '19x10']);
    expect(toFen(result.position)).toBe(toFen(fromFen('B:W10,21,23,24,25,26,27,28,29,30,31,32:B1,2,3,4,5,6,7,8,9,11,12')));
    expect(result.pieces).toHaveLength(23);
    expect(result.lastMove?.captures).toHaveLength(1);
  });

  it('stops at the first move it cannot play', () => {
    const result = replay(['22-19', '22-18']);
    expect(result.applied).toBe(1);
  });
});
