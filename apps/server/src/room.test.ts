import { describe, expect, it } from 'vitest';
import { Room } from './room';

function seated() {
  const room = new Room('ABC234');
  const white = room.join();
  const black = room.join();
  if ('error' in white || 'error' in black) throw new Error('seating failed');
  return { room, white: white.token, black: black.token };
}

describe('Room seating', () => {
  it('gives the first player White and the second Black', () => {
    const room = new Room('ABC234');
    expect(room.join()).toMatchObject({ seat: 'white' });
    expect(room.join()).toMatchObject({ seat: 'black' });
  });

  it('refuses a third player', () => {
    const { room } = seated();
    expect(room.join()).toEqual({ error: 'full' });
  });

  it('gives a returning player their seat back', () => {
    const { room, black } = seated();
    room.disconnect(black);
    expect(room.state().seats.black).toEqual({ taken: true, connected: false });
    expect(room.join(black)).toMatchObject({ seat: 'black', token: black });
    expect(room.state().seats.black.connected).toBe(true);
  });
});

describe('Room moves', () => {
  it('accepts a legal move from the side to move', () => {
    const { room, white } = seated();
    expect(room.move(white, '22-18', 0)).toBeNull();
    expect(room.state().moves).toEqual(['22-18']);
  });

  it('rejects moves out of turn, illegal moves and stale submissions', () => {
    const { room, white, black } = seated();
    expect(room.move(black, '10-14', 0)).toBe('not-your-turn');
    expect(room.move(white, '22-17', 0)).toBe('illegal');
    expect(room.move(white, '22-18', 1)).toBe('stale');
    expect(room.move('stranger', '22-18', 0)).toBe('not-seated');
    expect(room.state().moves).toEqual([]);
  });

  it('waits for the second player before the game starts', () => {
    const room = new Room('ABC234');
    const white = room.join();
    if ('error' in white) throw new Error();
    expect(room.move(white.token, '22-18', 0)).toBe('not-your-turn');
  });

  it('ends the game on resignation', () => {
    const { room, white, black } = seated();
    room.resign(white);
    expect(room.state().result).toEqual({ kind: 'win', winner: 'black', reason: 'resign' });
    expect(room.move(black, '10-14', 0)).toBe('game-over');
  });
});

describe('Room rematch', () => {
  it('starts a new game with colours swapped once both players ask', () => {
    const { room, white, black } = seated();
    room.move(white, '22-18', 0);
    room.resign(black);
    room.rematch(white);
    expect(room.state().rematch).toEqual({ white: true, black: false });
    expect(room.state().moves).toEqual(['22-18']);
    room.rematch(black);
    const state = room.state();
    expect(state).toMatchObject({ moves: [], result: null, game: 2, rematch: { white: false, black: false } });
    expect(room.seatOf(white)).toBe('black');
    expect(room.seatOf(black)).toBe('white');
  });

  it('ignores a rematch request while the game is running', () => {
    const { room, white } = seated();
    room.rematch(white);
    expect(room.state().rematch.white).toBe(false);
  });
});
