import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { legalMoves, newGame, play, status } from '@dama/engine';
import type { Position } from '@dama/engine';
import type { Color, GameState, GameStatus, Move } from '@dama/engine';
import { think } from './ai-client';
import { movePieces, piecesOf } from './pieces';
import type { PieceView } from './pieces';
import { moveFeedback, useSelection } from './selection';

export type Mode = { kind: 'ai'; level: number; human: Color } | { kind: 'local' };

export { STEP_SECONDS } from './selection';
/** The computer never answers faster than this, so its move can be followed. */
const MIN_AI_DELAY_MS = 450;

interface Snapshot {
  game: GameState;
  pieces: PieceView[];
  lastMove: Move | null;
}

function fresh(start?: Position): Snapshot {
  const game = newGame(start);
  return { game, pieces: piecesOf(game.position), lastMove: null };
}

export function useGame(mode: Mode, soundOn: boolean, start?: Position) {
  const [stack, setStack] = useState<Snapshot[]>(() => [fresh(start)]);
  const [thinking, setThinking] = useState(false);
  // Bumped on undo/reset so a search started for an older position is ignored.
  const generation = useRef(0);

  const current = stack[stack.length - 1]!;
  const position = current.game.position;
  const moves = useMemo(() => legalMoves(position), [position]);
  const gameStatus: GameStatus = useMemo(() => status(current.game), [current.game]);
  const over = gameStatus.kind !== 'ongoing';
  const humanTurn = mode.kind === 'local' || position.turn === mode.human;
  const mustCapture = moves.length > 0 && moves[0]!.captures.length > 0;

  const commit = useCallback(
    (move: Move) => {
      setStack((s) => {
        const top = s[s.length - 1]!;
        return [...s, { game: play(top.game, move), pieces: movePieces(top.pieces, move), lastMove: move }];
      });
      moveFeedback(move, soundOn);
    },
    [soundOn],
  );

  // The computer's turn.
  useEffect(() => {
    if (mode.kind !== 'ai' || over || humanTurn) return;
    const gen = generation.current;
    const started = performance.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setThinking(true);
    void think(position, mode.level).then((move) => {
      const wait = Math.max(0, MIN_AI_DELAY_MS - (performance.now() - started));
      timer = setTimeout(() => {
        if (cancelled || gen !== generation.current) return;
        setThinking(false);
        if (move) commit(move);
      }, wait);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, over, humanTurn, position, commit]);

  const { selected, tap, targets, movable } = useSelection(moves, humanTurn && !over && !thinking, commit);

  const canUndo = stack.length > 1 && !(mode.kind === 'ai' && stack.length === 2 && mode.human === 'black');

  const undo = useCallback(() => {
    generation.current++;
    setThinking(false);
    setStack((s) => {
      if (s.length <= 1) return s;
      if (mode.kind === 'local') return s.slice(0, -1);
      // Go back to the last position where it was the human's turn.
      let n = s.length - 1;
      while (n > 0 && s[n - 1]!.game.position.turn !== mode.human) n--;
      return n > 0 ? s.slice(0, n) : s;
    });
  }, [mode]);

  const reset = useCallback(() => {
    generation.current++;
    setThinking(false);
    setStack([fresh(start)]);
  }, [start]);

  return {
    position,
    pieces: current.pieces,
    lastMove: current.lastMove,
    plies: stack.length - 1,
    status: gameStatus,
    humanTurn,
    thinking,
    mustCapture,
    selected,
    targets,
    movable,
    tap,
    undo,
    canUndo,
    reset,
  };
}
