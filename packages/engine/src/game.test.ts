import { describe, expect, it } from 'vitest';
import { fromAscii, fromFen, initialPosition, legalMoves, moveToString, newGame, play, status, toFen } from './index';
import type { GameState } from './index';

function playNotation(game: GameState, notation: string): GameState {
  const move = legalMoves(game.position).find((m) => moveToString(m) === notation);
  if (!move) throw new Error(`illegal move ${notation}`);
  return play(game, move);
}

describe('fen', () => {
  it('round-trips the initial position', () => {
    const fen = toFen(initialPosition());
    expect(fen).toBe('W:W21,22,23,24,25,26,27,28,29,30,31,32:B1,2,3,4,5,6,7,8,9,10,11,12');
    expect(fromFen(fen)).toEqual(initialPosition());
  });

  it('marks kings with K', () => {
    expect(toFen(fromFen('B:WK32,5:BK1'))).toBe('B:W5,K32:BK1');
  });
});

describe('move notation', () => {
  it('writes quiet moves as from-to', () => {
    expect(legalMoves(initialPosition()).map(moveToString).sort()).toEqual(
      ['21-17', '21-18', '22-18', '22-19', '23-19', '23-20', '24-20'].sort(),
    );
  });

  it('writes captures as the chain of landing squares', () => {
    expect(legalMoves(fromFen('W:W22:B18,10,1')).map(moveToString)).toEqual(['22x13x6']);
  });
});

describe('game status', () => {
  it('is ongoing at the start', () => {
    expect(status(newGame())).toEqual({ kind: 'ongoing' });
  });

  it('is a loss for the side that cannot move', () => {
    const sealed = fromAscii(
      ['........', '........', '........', '........', '..b.....', '.b......', 'w.......', '........'].join('\n'),
      'white',
    );
    expect(legalMoves(sealed)).toHaveLength(0);
    expect(status(newGame(sealed))).toEqual({ kind: 'win', winner: 'black' });
  });

  it('is a draw after the same position occurs three times', () => {
    let game = newGame(fromFen('W:WK32:BK1'));
    for (let i = 0; i < 2; i++) {
      for (const notation of ['32-28', '1-5', '28-32', '5-1']) {
        expect(status(game).kind).toBe('ongoing');
        game = playNotation(game, notation);
      }
    }
    expect(status(game)).toEqual({ kind: 'draw', reason: 'repetition' });
  });

  it('counts plies without captures or man moves and draws at 40 moves each', () => {
    let game = newGame(fromFen('W:WK32,25:BK1'));
    game = playNotation(game, '32-28');
    expect(game.quietPlies).toBe(1);
    game = playNotation(game, '1-5');
    expect(game.quietPlies).toBe(2);
    game = playNotation(game, '25-21');
    expect(game.quietPlies).toBe(0);

    const nearlyDrawn: GameState = { ...newGame(fromFen('W:WK32:BK1')), quietPlies: 79 };
    expect(status(nearlyDrawn).kind).toBe('ongoing');
    expect(status(playNotation(nearlyDrawn, '32-28'))).toEqual({ kind: 'draw', reason: 'forty-moves' });
  });
});
