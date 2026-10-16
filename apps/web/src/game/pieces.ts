import { SQUARE_COUNT, has } from '@dama/engine';
import type { Color, Move, Position } from '@dama/engine';

/** A piece as the board draws it: the id survives moves so the piece can be animated. */
export interface PieceView {
  id: number;
  square: number;
  color: Color;
  king: boolean;
}

export function piecesOf(pos: Position): PieceView[] {
  const pieces: PieceView[] = [];
  for (let s = 0; s < SQUARE_COUNT; s++) {
    const color: Color | null = has(pos.white, s) ? 'white' : has(pos.black, s) ? 'black' : null;
    if (color) pieces.push({ id: s, square: s, color, king: has(pos.kings, s) });
  }
  return pieces;
}

export function movePieces(pieces: PieceView[], move: Move): PieceView[] {
  const captured = new Set(move.captures);
  return pieces
    .filter((p) => !captured.has(p.square))
    .map((p) => (p.square === move.from ? { ...p, square: move.to, king: p.king || move.promotes } : p));
}
