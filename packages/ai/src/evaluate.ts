import { SQUARE_COUNT, colOf, has, rowOf } from '@dama/engine';
import type { Position } from '@dama/engine';

export const MAN = 100;
// Italian kings move one square at a time, so they are worth less than in flying-king variants.
export const KING = 250;

const ADVANCE = 3;
const CENTER = 6;
const BACK_RANK = 8;

/** Positional bonus for one piece seen from its owner's side (row 0 = own back rank). */
function pieceScore(row: number, col: number, king: boolean): number {
  const central = row >= 2 && row <= 5 && col >= 2 && col <= 5 ? CENTER : 0;
  if (king) return KING + central;
  return MAN + row * ADVANCE + central + (row === 0 ? BACK_RANK : 0);
}

/** Static evaluation in hundredths of a man, from the point of view of the side to move. */
export function evaluate(pos: Position): number {
  let white = 0;
  let black = 0;
  for (let s = 0; s < SQUARE_COUNT; s++) {
    const king = has(pos.kings, s);
    if (has(pos.white, s)) white += pieceScore(rowOf(s), colOf(s), king);
    else if (has(pos.black, s)) black += pieceScore(7 - rowOf(s), 7 - colOf(s), king);
  }
  return pos.turn === 'white' ? white - black : black - white;
}
