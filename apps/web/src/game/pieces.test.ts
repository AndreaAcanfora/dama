import { describe, expect, it } from 'vitest';
import { fromFen, initialPosition, legalMoves, moveToString } from '@dama/engine';
import { movePieces, piecesOf } from './pieces';

describe('piece tracking', () => {
  it('gives every piece a stable id', () => {
    const pieces = piecesOf(initialPosition());
    expect(pieces).toHaveLength(24);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(24);
  });

  it('keeps the moving piece id and drops captured pieces', () => {
    const pos = fromFen('W:W22:B18,10,1');
    const pieces = piecesOf(pos);
    const mover = pieces.find((p) => p.color === 'white')!;
    const move = legalMoves(pos)[0]!;
    expect(moveToString(move)).toBe('22x13x6');
    const next = movePieces(pieces, move);
    expect(next).toHaveLength(2);
    expect(next.find((p) => p.id === mover.id)).toMatchObject({ square: move.to, king: false });
  });

  it('crowns a promoted man', () => {
    const pos = fromFen('W:W5:B32');
    const move = legalMoves(pos)[0]!;
    expect(movePieces(piecesOf(pos), move).find((p) => p.color === 'white')?.king).toBe(true);
  });
});
