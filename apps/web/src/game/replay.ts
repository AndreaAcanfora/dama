import { applyMove, initialPosition, legalMoves, moveToString } from '@dama/engine';
import type { Move, Position } from '@dama/engine';
import { movePieces, piecesOf } from './pieces';
import type { PieceView } from './pieces';

/** Plays a list of moves in notation from the start, keeping piece ids stable for animation. */
export function replay(notation: string[]) {
  let position: Position = initialPosition();
  let pieces: PieceView[] = piecesOf(position);
  let lastMove: Move | null = null;
  let applied = 0;
  for (const n of notation) {
    const move = legalMoves(position).find((m) => moveToString(m) === n);
    if (!move) break;
    position = applyMove(position, move);
    pieces = movePieces(pieces, move);
    lastMove = move;
    applied++;
  }
  return { position, pieces, lastMove, applied };
}
