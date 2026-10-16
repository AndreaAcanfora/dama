import { useCallback, useEffect, useState } from 'react';
import type { Move } from '@dama/engine';
import { sounds, vibrate } from '../lib/sound';

/** Seconds the animation spends on each step of a move. */
export const STEP_SECONDS = 0.17;

/** Tap a piece, then tap where it goes. `enabled` is false while it is not the local player's turn. */
export function useSelection(moves: Move[], enabled: boolean, onMove: (move: Move) => void) {
  const [selected, setSelected] = useState<number | null>(null);

  // A new position (or losing the turn) drops any half-made selection.
  useEffect(() => setSelected(null), [moves, enabled]);

  const tap = useCallback(
    (square: number) => {
      if (!enabled) return;
      if (moves.some((m) => m.from === square)) {
        setSelected((s) => (s === square ? null : square));
        return;
      }
      if (selected !== null) {
        const move = moves.find((m) => m.from === selected && m.to === square);
        if (move) {
          setSelected(null);
          onMove(move);
          return;
        }
      }
      setSelected(null);
    },
    [enabled, moves, selected, onMove],
  );

  return {
    selected,
    tap,
    targets: selected === null ? [] : moves.filter((m) => m.from === selected).map((m) => m.to),
    movable: enabled ? [...new Set(moves.map((m) => m.from))] : [],
  };
}

export function moveFeedback(move: Move, soundOn: boolean) {
  if (soundOn) {
    if (move.captures.length > 0) sounds.capture(move.captures.length, STEP_SECONDS);
    else sounds.move();
    if (move.promotes) sounds.promote(move.path.length * STEP_SECONDS);
  }
  if (move.captures.length > 0) vibrate(move.captures.map(() => 25));
}
