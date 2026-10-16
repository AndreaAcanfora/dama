import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { legalMoves, moveToString, popcount, toNumber } from '@dama/engine';
import type { Color, Move } from '@dama/engine';
import { replay } from '../game/replay';
import { moveFeedback, useSelection } from '../game/selection';
import type { Strings } from '../lib/i18n';
import { useOnlineRoom } from '../lib/online';
import type { Settings } from '../lib/settings';
import { Board } from './Board';

interface Props {
  t: Strings;
  code: string | null;
  settings: Settings;
  inviteUrl: (code: string) => string;
  onRoom: (code: string) => void;
  onExit: () => void;
}

export function OnlineScreen({ t, code, settings, inviteUrl, onRoom, onExit }: Props) {
  const { state, seat, error, connection, send } = useOnlineRoom(code, onRoom);
  // The move we just sent, shown at once while the server confirms it.
  const [pending, setPending] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setPending(null), [state, error]);

  const moves = useMemo(() => [...(state?.moves ?? []), ...(pending ? [pending] : [])], [state, pending]);
  const board = useMemo(() => replay(moves), [moves]);
  const { position } = board;
  const legal = useMemo(() => legalMoves(position), [position]);

  // Sound for every move that appears, ours or theirs.
  const heard = useRef<number | null>(null);
  useEffect(() => {
    if (!state) return;
    // The first state after (re)joining is history, not a new move.
    if (heard.current !== null && board.applied > heard.current && board.lastMove) moveFeedback(board.lastMove, settings.sound);
    heard.current = board.applied;
  }, [state, board, settings.sound]);

  const opponent: Color | null = seat ? (seat === 'white' ? 'black' : 'white') : null;
  const ready = Boolean(state?.seats.white.taken && state.seats.black.taken);
  const result = state?.result ?? null;
  const myTurn = Boolean(seat && ready && !result && !pending && connection === 'open' && position.turn === seat);

  const onMove = useCallback(
    (move: Move) => {
      const notation = moveToString(move);
      setPending(notation);
      send({ t: 'move', move: notation, ply: state?.moves.length ?? 0 });
    },
    [send, state],
  );
  const selection = useSelection(legal, myTurn, onMove);

  const link = state ? inviteUrl(state.room) : '';
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Dama', text: t.shareText, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // The share sheet was dismissed.
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  let message: string;
  let tone: 'turn' | 'end' = 'turn';
  if (error === 'not-found') message = t.roomNotFound;
  else if (error === 'full') message = t.roomFull;
  else if (error === 'too-many-rooms') message = t.tooManyRooms;
  else if (error === 'rate-limited') message = t.rateLimited;
  else if (connection !== 'open') message = connection === 'connecting' ? t.connecting : t.reconnecting;
  else if (!state || !seat) message = t.connecting;
  else if (result) {
    tone = 'end';
    if (result.kind === 'draw') message = result.reason === 'repetition' ? t.drawRepetition : t.drawForty;
    else if (result.reason === 'resign') message = result.winner === seat ? t.opponentResigned : t.youResigned;
    else message = result.winner === seat ? t.youWon : t.youLost;
  } else if (!ready) message = t.waitingFriend;
  else if (opponent && !state.seats[opponent].connected) message = t.opponentAway;
  else message = position.turn === seat ? t.yourTurn : t.theirTurn;

  const flipped = seat === 'black';
  const top: Color = flipped ? 'white' : 'black';
  const bottom: Color = flipped ? 'black' : 'white';
  const count = (c: Color) => popcount(c === 'white' ? position.white : position.black);
  const colorName = (c: Color) => (c === 'white' ? t.white : t.black);
  const mustCapture = myTurn && legal.length > 0 && legal[0]!.captures.length > 0;

  return (
    <main className="game">
      <header className="game-head">
        <button type="button" className="link back" onClick={onExit}>
          {t.back}
        </button>
        <span className="game-mode">{t.online}</span>
      </header>

      <div className="player player-top" data-active={ready && !result && position.turn === top}>
        <span className={`dot dot-${top}`} aria-hidden="true" />
        <span>{colorName(top)}</span>
        <span className="count">{count(top)}</span>
      </div>

      <Board
        theme={settings.theme}
        pieces={board.pieces}
        lastMove={board.lastMove}
        flipped={flipped}
        selected={selection.selected}
        targets={selection.targets}
        movable={selection.movable}
        highlightMovable={mustCapture}
        onTap={selection.tap}
        label={(s) => `${toNumber(s)}`}
      />

      <div className="player player-bottom" data-active={ready && !result && position.turn === bottom}>
        <span className={`dot dot-${bottom}`} aria-hidden="true" />
        <span>{colorName(bottom)}</span>
        <span className="count">{count(bottom)}</span>
      </div>

      <p className={`status status-${tone}`} role="status" aria-live="polite">
        {message}
        {mustCapture && <span className="forced">{t.mustCapture}</span>}
        {error === 'illegal' || error === 'stale' || error === 'not-your-turn' ? <span className="forced">{t.moveRefused}</span> : null}
      </p>

      <div className="actions">
        {state && !ready && !result ? (
          <div className="invite">
            <p className="hint">{t.inviteHint}</p>
            <p className="invite-link">{link}</p>
            <div className="invite-buttons">
              <button type="button" className="cta" onClick={share}>
                {t.share}
              </button>
              <button type="button" className="secondary" onClick={copy}>
                {copied ? t.copied : t.copyLink}
              </button>
            </div>
          </div>
        ) : result ? (
          <>
            <button type="button" className="cta" onClick={() => send({ t: 'rematch' })} disabled={Boolean(seat && state?.rematch[seat])}>
              {t.rematch}
            </button>
            <p className="hint rematch-note">
              {seat && state?.rematch[seat] ? t.rematchSent : opponent && state?.rematch[opponent] ? t.rematchOffered : ''}
            </p>
          </>
        ) : (
          <button
            type="button"
            className="secondary"
            disabled={!ready || connection !== 'open'}
            onClick={() => {
              if (confirmResign) {
                send({ t: 'resign' });
                setConfirmResign(false);
              } else setConfirmResign(true);
            }}
            onBlur={() => setConfirmResign(false)}
          >
            {confirmResign ? t.confirmResign : t.resign}
          </button>
        )}
      </div>
    </main>
  );
}
