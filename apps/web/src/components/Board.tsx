import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { colOf, rowOf, toNumber } from '@dama/engine';
import type { Move } from '@dama/engine';
import type { PieceView } from '../game/pieces';
import { STEP_SECONDS } from '../game/useGame';
import type { Theme } from '../lib/settings';

const FRAME = 22;
const CELL = 100;
const SIZE = FRAME * 2 + CELL * 8;
const RADIUS = 37;

interface Props {
  theme: Theme;
  pieces: PieceView[];
  lastMove: Move | null;
  flipped: boolean;
  selected: number | null;
  targets: number[];
  movable: number[];
  highlightMovable: boolean;
  onTap: (square: number) => void;
  label: (square: number) => string;
}

export function Board({ theme, pieces, lastMove, flipped, selected, targets, movable, highlightMovable, onTap, label }: Props) {
  const reduce = useReducedMotion() ?? false;
  const center = (s: number) => {
    const col = flipped ? 7 - colOf(s) : colOf(s);
    const row = flipped ? rowOf(s) : 7 - rowOf(s);
    return { x: FRAME + col * CELL + CELL / 2, y: FRAME + row * CELL + CELL / 2 };
  };
  const darkSquares = Array.from({ length: 32 }, (_, s) => s);
  const step = reduce ? 0 : STEP_SECONDS;

  return (
    <div className="board" data-theme={theme}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="grid" aria-label="Scacchiera">
        <defs>
          <radialGradient id="g-white" cx="38%" cy="32%" r="75%">
            <stop offset="0" style={{ stopColor: 'var(--piece-white-hi)' }} />
            <stop offset="1" style={{ stopColor: 'var(--piece-white-lo)' }} />
          </radialGradient>
          <radialGradient id="g-black" cx="38%" cy="32%" r="75%">
            <stop offset="0" style={{ stopColor: 'var(--piece-black-hi)' }} />
            <stop offset="1" style={{ stopColor: 'var(--piece-black-lo)' }} />
          </radialGradient>
          <filter id="grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.09" numOctaves="3" seed="7" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <filter id="veins" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="turbulence" baseFrequency="0.011" numOctaves="4" seed="3" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>

        <rect className="frame" x="0" y="0" width={SIZE} height={SIZE} rx="14" />
        <rect className="inlay" x={FRAME - 8} y={FRAME - 8} width={CELL * 8 + 16} height={CELL * 8 + 16} rx="4" />
        <rect className="sq-light" x={FRAME} y={FRAME} width={CELL * 8} height={CELL * 8} />
        {darkSquares.map((s) => {
          const { x, y } = center(s);
          return <rect key={s} className="sq-dark" x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} />;
        })}
        {theme !== 'night' && (
          <rect
            className="texture"
            x={FRAME}
            y={FRAME}
            width={CELL * 8}
            height={CELL * 8}
            filter={theme === 'marble' ? 'url(#veins)' : 'url(#grain)'}
          />
        )}

        {lastMove &&
          [lastMove.from, lastMove.to].map((s, i) => {
            const { x, y } = center(s);
            return <rect key={`last-${i}`} className="sq-last" x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} />;
          })}
        {highlightMovable &&
          movable.map((s) => {
            const { x, y } = center(s);
            return <circle key={`mov-${s}`} className="ring-forced" cx={x} cy={y} r={RADIUS + 7} />;
          })}

        <AnimatePresence custom={lastMove}>
          {pieces.map((p) => {
            const end = center(p.square);
            const isMover = lastMove !== null && p.square === lastMove.to;
            const track = isMover ? [lastMove.from, ...lastMove.path].map(center) : null;
            const steps = track ? track.length - 1 : 0;
            const intro = (flipped ? rowOf(p.square) : 7 - rowOf(p.square)) * 0.04;
            return (
              <motion.g
                key={p.id}
                className="piece"
                custom={lastMove}
                initial={{ x: end.x, y: end.y, opacity: 0, scale: 0.6 }}
                animate={{
                  x: track && !reduce ? track.map((t) => t.x) : end.x,
                  y: track && !reduce ? track.map((t) => t.y) : end.y,
                  opacity: 1,
                  scale: 1,
                }}
                variants={{
                  exit: (move: Move | null) => {
                    const order = move ? move.captures.indexOf(p.square) : -1;
                    return { opacity: 0, scale: 0.3, transition: { delay: (order + 1) * step, duration: reduce ? 0 : 0.18 } };
                  },
                }}
                exit="exit"
                transition={{
                  x: { duration: steps * step, ease: 'easeInOut' },
                  y: { duration: steps * step, ease: 'easeInOut' },
                  opacity: { delay: reduce ? 0 : intro, duration: 0.25 },
                  scale: { delay: reduce ? 0 : intro, duration: 0.25 },
                }}
              >
                <PieceShape color={p.color} king={p.king} lifted={selected === p.square} reduce={reduce} />
              </motion.g>
            );
          })}
        </AnimatePresence>

        {targets.map((s) => {
          const { x, y } = center(s);
          return <circle key={`t-${s}`} className="target" cx={x} cy={y} r="13" />;
        })}

        {darkSquares.map((s) => {
          const { x, y } = center(s);
          return (
            <rect
              key={`hit-${s}`}
              className="hit"
              x={x - CELL / 2}
              y={y - CELL / 2}
              width={CELL}
              height={CELL}
              role="gridcell"
              tabIndex={movable.includes(s) || targets.includes(s) ? 0 : -1}
              aria-label={label(s)}
              data-square={toNumber(s)}
              onClick={() => onTap(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTap(s);
                }
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}

function Disc({ color, dy }: { color: 'white' | 'black'; dy: number }) {
  return (
    <g transform={`translate(0 ${dy})`}>
      <circle r={RADIUS} className={`disc disc-${color}`} fill={`url(#g-${color})`} />
      <circle r={RADIUS - 9} className={`groove groove-${color}`} />
      <circle r={RADIUS - 17} className={`groove groove-${color}`} />
    </g>
  );
}

function PieceShape({ color, king, lifted, reduce }: { color: 'white' | 'black'; king: boolean; lifted: boolean; reduce: boolean }) {
  return (
    <motion.g animate={{ scale: lifted ? 1.09 : 1, y: lifted ? -4 : 0 }} transition={{ duration: reduce ? 0 : 0.15 }}>
      <ellipse className="shadow" cx="3" cy={king ? 12 : 8} rx={RADIUS} ry={RADIUS * 0.92} />
      {king ? (
        <>
          <Disc color={color} dy={6} />
          <Disc color={color} dy={-6} />
          <circle className="crown" cy={-6} r={RADIUS - 26} />
        </>
      ) : (
        <Disc color={color} dy={0} />
      )}
    </motion.g>
  );
}
