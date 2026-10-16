import { useEffect, useRef } from 'react';
import { LEVELS } from '@dama/ai';
import { popcount, toNumber } from '@dama/engine';
import type { Color, Position } from '@dama/engine';
import { useGame } from '../game/useGame';
import type { Mode } from '../game/useGame';
import type { Lang, Strings } from '../lib/i18n';
import type { Settings } from '../lib/settings';
import { Board } from './Board';

interface Props {
  t: Strings;
  lang: Lang;
  mode: Mode;
  start?: Position | undefined;
  settings: Settings;
  onExit: () => void;
  onRematch: () => void;
  onFinished: (result: 'won' | 'lost' | 'draw') => void;
}

export function GameScreen({ t, lang, mode, start, settings, onExit, onRematch, onFinished }: Props) {
  const game = useGame(mode, settings.sound, start);
  const { status, position } = game;
  const reported = useRef(false);

  useEffect(() => {
    if (status.kind === 'ongoing' || mode.kind !== 'ai' || reported.current) return;
    reported.current = true;
    onFinished(status.kind === 'draw' ? 'draw' : status.winner === mode.human ? 'won' : 'lost');
  }, [status, mode, onFinished]);

  const colorName = (c: Color) => (c === 'white' ? t.white : t.black);
  let message: string;
  let tone: 'turn' | 'end' = 'turn';
  if (status.kind === 'win') {
    tone = 'end';
    message = mode.kind === 'ai' ? (status.winner === mode.human ? t.youWon : t.youLost) : status.winner === 'white' ? t.whiteWon : t.blackWon;
  } else if (status.kind === 'draw') {
    tone = 'end';
    message = status.reason === 'repetition' ? t.drawRepetition : t.drawForty;
  } else if (game.thinking) {
    message = t.thinking;
  } else if (mode.kind === 'ai') {
    message = t.yourTurn;
  } else {
    message = position.turn === 'white' ? t.whiteToMove : t.blackToMove;
  }

  const level = mode.kind === 'ai' ? LEVELS.find((l) => l.id === mode.level) : undefined;
  const flipped = mode.kind === 'ai' && mode.human === 'black';
  const top: Color = flipped ? 'white' : 'black';
  const bottom: Color = flipped ? 'black' : 'white';
  const count = (c: Color) => popcount(c === 'white' ? position.white : position.black);

  return (
    <main className="game">
      <header className="game-head">
        <button type="button" className="link back" onClick={onExit}>
          {t.back}
        </button>
        <span className="game-mode">{level ? level.name[lang] : t.twoPlayers}</span>
      </header>

      <div className="player player-top" data-active={status.kind === 'ongoing' && position.turn === top}>
        <span className={`dot dot-${top}`} aria-hidden="true" />
        <span>{colorName(top)}</span>
        <span className="count">{count(top)}</span>
      </div>

      <Board
        theme={settings.theme}
        pieces={game.pieces}
        lastMove={game.lastMove}
        flipped={flipped}
        selected={game.selected}
        targets={game.targets}
        movable={game.movable}
        highlightMovable={game.mustCapture}
        onTap={game.tap}
        label={(s) => `${toNumber(s)}`}
      />

      <div className="player player-bottom" data-active={status.kind === 'ongoing' && position.turn === bottom}>
        <span className={`dot dot-${bottom}`} aria-hidden="true" />
        <span>{colorName(bottom)}</span>
        <span className="count">{count(bottom)}</span>
      </div>

      <p className={`status status-${tone}`} role="status" aria-live="polite">
        {message}
        {tone === 'turn' && game.mustCapture && game.humanTurn && !game.thinking && <span className="forced">{t.mustCapture}</span>}
      </p>

      <div className="actions">
        {tone === 'end' ? (
          <button type="button" className="cta" onClick={onRematch}>
            {t.rematch}
          </button>
        ) : (
          <button type="button" className="secondary" onClick={game.undo} disabled={!game.canUndo}>
            {t.undo}
          </button>
        )}
        <button type="button" className="secondary" onClick={game.reset}>
          {t.newGame}
        </button>
      </div>
    </main>
  );
}
