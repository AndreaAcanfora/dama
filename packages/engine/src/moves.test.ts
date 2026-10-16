import { describe, expect, it } from 'vitest';
import { applyMove, fromAscii, initialPosition, legalMoves, perft, square, toAscii } from './index';
import type { Move } from './index';

const EMPTY = '........';

/** Build a position from rows listed top (row 7, Black's side) to bottom (row 0, White's side). */
function board(rows: string[], turn: 'white' | 'black' = 'white') {
  return fromAscii([...Array(8 - rows.length).fill(EMPTY), ...rows].join('\n'), turn);
}

function summary(moves: Move[]) {
  return moves.map((m) => ({ from: m.from, to: m.to, captures: m.captures.length })).sort((a, b) => a.from - b.from || a.to - b.to);
}

describe('initial position', () => {
  it('has 12 men per side with White to move', () => {
    const pos = initialPosition();
    expect(toAscii(pos)).toBe(
      [
        'b.b.b.b.',
        '.b.b.b.b',
        'b.b.b.b.',
        '........',
        '........',
        '.w.w.w.w',
        'w.w.w.w.',
        '.w.w.w.w',
      ].join('\n'),
    );
    expect(pos.turn).toBe('white');
  });

  it('puts a playable dark square in the bottom-right corner', () => {
    expect(square(0, 7)).toBe(3);
    expect(() => square(0, 0)).toThrow();
  });

  it('offers White 7 quiet moves', () => {
    const moves = legalMoves(initialPosition());
    expect(moves).toHaveLength(7);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });
});

describe('quiet moves', () => {
  it('moves a man one step diagonally forward only', () => {
    const pos = board(['......b.', EMPTY, EMPTY, EMPTY, '..w.....', EMPTY, EMPTY, EMPTY]);
    const from = square(3, 2);
    const mine = legalMoves(pos).filter((m) => m.from === from);
    expect(mine.map((m) => m.to).sort((a, b) => a - b)).toEqual([square(4, 1), square(4, 3)].sort((a, b) => a - b));
  });

  it('moves a Black man downwards', () => {
    const pos = board(['b.......', EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '.w......'], 'black');
    expect(legalMoves(pos).map((m) => m.to)).toEqual([square(6, 1)]);
  });

  it('moves a king one step in every diagonal direction', () => {
    const pos = board(['......b.', EMPTY, EMPTY, EMPTY, '..W.....', EMPTY, EMPTY, EMPTY]);
    const to = legalMoves(pos).map((m) => m.to).sort((a, b) => a - b);
    expect(to).toEqual([square(2, 1), square(2, 3), square(4, 1), square(4, 3)].sort((a, b) => a - b));
  });
});

describe('captures', () => {
  it('forces a capture when one is available', () => {
    const pos = board(['......b.', EMPTY, EMPTY, '...b....', '..w.....', EMPTY, EMPTY, '.w......']);
    expect(summary(legalMoves(pos))).toEqual([{ from: square(3, 2), to: square(5, 4), captures: 1 }]);
  });

  it('never lets a man capture backwards', () => {
    const pos = board(['......b.', EMPTY, EMPTY, EMPTY, '..w.....', '.b......', EMPTY, EMPTY]);
    expect(legalMoves(pos).every((m) => m.captures.length === 0)).toBe(true);
  });

  it('never lets a man capture a king', () => {
    const pos = board(['......b.', EMPTY, EMPTY, '...B....', '..w.....', EMPTY, EMPTY, EMPTY]);
    expect(summary(legalMoves(pos))).toEqual([{ from: square(3, 2), to: square(4, 1), captures: 0 }]);
  });

  it('lets a king capture backwards', () => {
    const pos = board(['......b.', EMPTY, EMPTY, EMPTY, '..W.....', '...b....', EMPTY, EMPTY]);
    expect(summary(legalMoves(pos))).toEqual([{ from: square(3, 2), to: square(1, 4), captures: 1 }]);
  });

  it('chains jumps into a single move', () => {
    const pos = board(['......b.', EMPTY, EMPTY, '...b....', EMPTY, '...b....', '..w.....', EMPTY]);
    const [move, ...rest] = legalMoves(pos);
    expect(rest).toHaveLength(0);
    expect(move).toMatchObject({ from: square(1, 2), to: square(5, 2), path: [square(3, 4), square(5, 2)] });
    expect(move?.captures).toEqual([square(2, 3), square(4, 3)]);
  });

  it('must capture the greatest number of pieces', () => {
    const pos = board([
      EMPTY,
      '.....b..',
      '......w.',
      '...b....',
      EMPTY,
      '...b....',
      '..w.....',
      EMPTY,
    ]);
    expect(summary(legalMoves(pos))).toEqual([{ from: square(1, 2), to: square(5, 2), captures: 2 }]);
  });

  it('must capture with a king rather than a man when counts are equal', () => {
    const pos = board([
      EMPTY,
      '.....b..',
      '....W...',
      EMPTY,
      EMPTY,
      '...b....',
      '..w.....',
      EMPTY,
    ]);
    expect(summary(legalMoves(pos))).toEqual([{ from: square(5, 4), to: square(7, 6), captures: 1 }]);
  });

  it('must capture the greatest number of kings when counts are equal', () => {
    const pos = board([EMPTY, EMPTY, EMPTY, '...B....', '..W.....', '.b......', EMPTY, EMPTY]);
    expect(summary(legalMoves(pos))).toEqual([{ from: square(3, 2), to: square(5, 4), captures: 1 }]);
  });

  it('must capture the king as early as possible when all else is equal', () => {
    const pos = board([
      EMPTY,
      '.B...b..',
      EMPTY,
      '...b.B..',
      '....W...',
      EMPTY,
      EMPTY,
      EMPTY,
    ]);
    const moves = legalMoves(pos);
    expect(summary(moves)).toEqual([{ from: square(3, 4), to: square(7, 4), captures: 2 }]);
    expect(moves[0]?.captures).toEqual([square(4, 5), square(6, 5)]);
  });

  it('ends the move when a man is promoted mid-capture', () => {
    const pos = board([EMPTY, '...b.b..', '..w.....', EMPTY, EMPTY, EMPTY, EMPTY, EMPTY]);
    const [move, ...rest] = legalMoves(pos);
    expect(rest).toHaveLength(0);
    expect(move).toMatchObject({ from: square(5, 2), to: square(7, 4), promotes: true });
    expect(move?.captures).toHaveLength(1);
  });

  it('treats the starting square as empty, never jumps a piece twice and merges equivalent loops', () => {
    const pos = board([
      '......b.',
      EMPTY,
      EMPTY,
      '.b.b....',
      EMPTY,
      '.b.b....',
      '..W.....',
      EMPTY,
    ]);
    const moves = legalMoves(pos);
    expect(summary(moves)).toEqual([{ from: square(1, 2), to: square(1, 2), captures: 4 }]);
    expect(new Set(moves[0]?.captures).size).toBe(4);
  });
});

describe('applyMove', () => {
  it('moves the piece, removes captured pieces and passes the turn', () => {
    const pos = board(['......b.', EMPTY, EMPTY, '...b....', EMPTY, '...b....', '..w.....', EMPTY]);
    const next = applyMove(pos, legalMoves(pos)[0]!);
    expect(toAscii(next)).toBe(
      ['......b.', EMPTY, '..w.....', EMPTY, EMPTY, EMPTY, EMPTY, EMPTY].join('\n'),
    );
    expect(next.turn).toBe('black');
  });

  it('promotes a man that reaches the last row', () => {
    const pos = board([EMPTY, '.w......', EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, '.b......']);
    const move = legalMoves(pos).find((m) => m.to === square(7, 2))!;
    expect(move.promotes).toBe(true);
    expect(toAscii(applyMove(pos, move)).split('\n')[0]).toBe('..W.....');
  });
});

describe('perft', () => {
  // Matches English checkers at shallow depth: captures there are single jumps of men by men,
  // where the Italian priority rules cannot yet make a difference.
  it.each([
    [1, 7],
    [2, 49],
    [3, 302],
  ])('depth %i from the start has %i leaves', (depth, leaves) => {
    expect(perft(initialPosition(), depth)).toBe(leaves);
  });
});
