/**
 * Plays the neural network (MCTS + ONNX) against the alpha-beta levels and reports the score.
 *
 *   pnpm tsx scripts/arena.ts <model.onnx> [--level 4] [--games 20] [--sims 200] [--random-plies 4]
 *
 * Both players are deterministic, so games would repeat. With --random-plies N each pair of
 * games starts from N random opening moves, played once with each colour.
 */
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { legalMoves, newGame, play, status } from '@dama/engine';
import type { GameState } from '@dama/engine';
import { chooseMove } from '../src/levels';
import { PLANES, neuralSearch } from '../src/neural';
import type { Evaluate } from '../src/neural';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const modelPath = args[0];
if (!modelPath) throw new Error('usage: arena.ts <model.onnx> [--level n] [--games n] [--sims n]');
const level = flag('level', 4);
const games = flag('games', 20);
const sims = flag('sims', 200);
const randomPlies = flag('random-plies', 0);
/** Same budget as the browser's Maestro when set: stop each search after this many ms. */
const timeMs = flag('time-ms', 0);
// Split one match across processes: play only games first..first+games-1.
const first = flag('first', 0);
const MAX_PLIES = 200;

function counts(keys: string[]) {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

const session = await InferenceSession.create(modelPath);
const evaluate: Evaluate = async (planes) => {
  const out = await session.run({ planes: new Tensor('float32', planes, [1, PLANES, 8, 8]) });
  return { policy: out.policy!.data as Float32Array, value: (out.value!.data as Float32Array)[0]! };
};

let wins = 0;
let draws = 0;
let losses = 0;
for (let g = first; g < first + games; g++) {
  const netIsWhite = g % 2 === 0;
  let game: GameState = newGame();
  // Games 2k and 2k+1 share an opening.
  let seed = Math.floor(g / 2) * 7919 + 17;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = 0; i < randomPlies && status(game).kind === 'ongoing'; i++) {
    const moves = legalMoves(game.position);
    game = play(game, moves[Math.floor(random() * moves.length)]!);
  }
  let s = status(game);
  while (s.kind === 'ongoing' && game.moves.length < MAX_PLIES) {
    const netTurn = (game.position.turn === 'white') === netIsWhite;
    const move = netTurn
      ? (await neuralSearch(game.position, game.quietPlies, evaluate, { simulations: sims, history: counts(game.history), ...(timeMs ? { timeMs } : {}) })).move
      : chooseMove(game.position, level);
    game = play(game, move!);
    s = status(game);
  }
  const netColor = netIsWhite ? 'white' : 'black';
  if (s.kind === 'win') s.winner === netColor ? wins++ : losses++;
  else draws++;
  console.log(`game ${g + 1}: ${s.kind === 'win' ? (s.winner === netColor ? 'net wins' : 'net loses') : 'draw'} in ${game.moves.length} plies`);
}
const score = (wins + draws / 2) / games;
// Elo difference implied by the score, clamped away from 0 and 1.
const p = Math.min(0.99, Math.max(0.01, score));
console.log(JSON.stringify({ level, sims, randomPlies, games, wins, draws, losses, score: Number(score.toFixed(3)), elo: Math.round(-400 * Math.log10(1 / p - 1)) }));
