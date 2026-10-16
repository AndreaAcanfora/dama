/**
 * Board geometry for Italian draughts.
 *
 * The 32 playable squares are indexed 0..31 row by row from White's back rank:
 * square = row * 4 + k, where row 0 is White's side and k is the k-th dark square
 * of the row from the left. The board is oriented with a dark square in each
 * player's bottom-right corner, as the Italian rules require.
 *
 * Notation numbers (1..32) start from the top-left square seen from White and run
 * left to right, row by row, so White's men start on 21..32.
 */

export type Color = 'white' | 'black';

export interface Position {
  /** Bitmask of squares holding a white piece. */
  white: number;
  /** Bitmask of squares holding a black piece. */
  black: number;
  /** Bitmask of squares holding a king of either colour. */
  kings: number;
  turn: Color;
}

export const SQUARE_COUNT = 32;

/** Diagonal directions: 0 up-left, 1 up-right, 2 down-left, 3 down-right ("up" is towards Black). */
export const DIRECTIONS = [0, 1, 2, 3] as const;
export const FORWARD: Record<Color, readonly number[]> = { white: [0, 1], black: [2, 3] };
const DELTA: readonly [number, number][] = [
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
];

export const rowOf = (s: number): number => s >> 2;
export const colOf = (s: number): number => 2 * (s & 3) + (rowOf(s) % 2 === 0 ? 1 : 0);
export const isDark = (row: number, col: number): boolean => (row + col) % 2 === 1;

export function square(row: number, col: number): number {
  if (row < 0 || row > 7 || col < 0 || col > 7 || !isDark(row, col)) {
    throw new Error(`(${row}, ${col}) is not a playable square`);
  }
  return row * 4 + (col >> 1);
}

function trySquare(row: number, col: number): number {
  return row < 0 || row > 7 || col < 0 || col > 7 ? -1 : square(row, col);
}

/** NEIGHBOR[s * 4 + d] is the adjacent square in direction d, or -1 off the board. */
export const NEIGHBOR = new Int8Array(SQUARE_COUNT * 4);
/** JUMP[s * 4 + d] is the square two steps away in direction d, or -1 off the board. */
export const JUMP = new Int8Array(SQUARE_COUNT * 4);
for (let s = 0; s < SQUARE_COUNT; s++) {
  for (const d of DIRECTIONS) {
    const [dr, dc] = DELTA[d]!;
    NEIGHBOR[s * 4 + d] = trySquare(rowOf(s) + dr, colOf(s) + dc);
    JUMP[s * 4 + d] = trySquare(rowOf(s) + 2 * dr, colOf(s) + 2 * dc);
  }
}

export const bit = (s: number): number => (1 << s) >>> 0;
export const has = (mask: number, s: number): boolean => ((mask >>> s) & 1) === 1;
export const set = (mask: number, s: number): number => (mask | (1 << s)) >>> 0;
export const clear = (mask: number, s: number): number => (mask & ~(1 << s)) >>> 0;

export function popcount(mask: number): number {
  let m = mask >>> 0;
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

/** Squares set in a mask, ascending. */
export function squaresOf(mask: number): number[] {
  const out: number[] = [];
  for (let s = 0; s < SQUARE_COUNT; s++) if (has(mask, s)) out.push(s);
  return out;
}

export const opponent = (c: Color): Color => (c === 'white' ? 'black' : 'white');
export const promotionRow = (c: Color): number => (c === 'white' ? 7 : 0);

export function initialPosition(): Position {
  return { white: 0x00000fff, black: 0xfff00000, kings: 0, turn: 'white' };
}

export const toNumber = (s: number): number => (7 - rowOf(s)) * 4 + (s & 3) + 1;
export function fromNumber(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 32) throw new Error(`invalid square number ${n}`);
  return (7 - ((n - 1) >> 2)) * 4 + ((n - 1) & 3);
}

export function pieceAt(pos: Position, s: number): 'w' | 'W' | 'b' | 'B' | null {
  const king = has(pos.kings, s);
  if (has(pos.white, s)) return king ? 'W' : 'w';
  if (has(pos.black, s)) return king ? 'B' : 'b';
  return null;
}

/** ASCII diagram, Black's side on top. Light squares and empty squares are '.'. */
export function toAscii(pos: Position): string {
  const lines: string[] = [];
  for (let row = 7; row >= 0; row--) {
    let line = '';
    for (let col = 0; col < 8; col++) line += isDark(row, col) ? (pieceAt(pos, square(row, col)) ?? '.') : '.';
    lines.push(line);
  }
  return lines.join('\n');
}

export function fromAscii(diagram: string, turn: Color): Position {
  const lines = diagram.trim().split('\n').map((l) => l.trim());
  if (lines.length !== 8 || lines.some((l) => l.length !== 8)) throw new Error('diagram must be 8 lines of 8 characters');
  const pos: Position = { white: 0, black: 0, kings: 0, turn };
  lines.forEach((line, i) => {
    const row = 7 - i;
    for (let col = 0; col < 8; col++) {
      const ch = line[col]!;
      if (ch === '.') continue;
      if (!isDark(row, col)) throw new Error(`piece on light square (${row}, ${col})`);
      const s = square(row, col);
      if (ch === 'w' || ch === 'W') pos.white = set(pos.white, s);
      else if (ch === 'b' || ch === 'B') pos.black = set(pos.black, s);
      else throw new Error(`unknown piece '${ch}'`);
      if (ch === 'W' || ch === 'B') pos.kings = set(pos.kings, s);
    }
  });
  return pos;
}

/** PDN-style FEN with this board's numbering, e.g. `W:W21,22,K30:B1,2`. */
export function toFen(pos: Position): string {
  const side = (mask: number) =>
    squaresOf(mask)
      .map((s) => ({ n: toNumber(s), k: has(pos.kings, s) }))
      .sort((a, b) => a.n - b.n)
      .map(({ n, k }) => (k ? `K${n}` : `${n}`))
      .join(',');
  return `${pos.turn === 'white' ? 'W' : 'B'}:W${side(pos.white)}:B${side(pos.black)}`;
}

export function fromFen(fen: string): Position {
  const [turnPart, ...sides] = fen.trim().split(':');
  if (turnPart !== 'W' && turnPart !== 'B') throw new Error(`invalid FEN turn in '${fen}'`);
  const pos: Position = { white: 0, black: 0, kings: 0, turn: turnPart === 'W' ? 'white' : 'black' };
  for (const part of sides) {
    const colour = part[0];
    if (colour !== 'W' && colour !== 'B') throw new Error(`invalid FEN side '${part}'`);
    const list = part.slice(1);
    if (!list) continue;
    for (const token of list.split(',')) {
      const king = token.startsWith('K');
      const s = fromNumber(Number(king ? token.slice(1) : token));
      if (colour === 'W') pos.white = set(pos.white, s);
      else pos.black = set(pos.black, s);
      if (king) pos.kings = set(pos.kings, s);
    }
  }
  if (pos.white & pos.black) throw new Error('FEN places two pieces on one square');
  return pos;
}
