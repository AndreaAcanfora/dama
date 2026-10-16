/**
 * Neural network player: the encoding mirrors training/dama/encode.py (checked by
 * fixtures/encoding.json) and the search mirrors training/dama/mcts.py, including
 * scoring a position that would occur for the third time as a draw.
 */
import { applyMove, colOf, has, legalMoves, moveToString, positionKey, rowOf } from '@dama/engine';
import type { Color, Move, Position } from '@dama/engine';

export const PLANES = 5;
export const POLICY_SIZE = 32 * 32;
const QUIET_PLY_LIMIT = 80;
const C_PUCT = 1.5;

/** Network call: one encoded position in, policy logits (1024) and value (side to move, -1..1) out. */
export type Evaluate = (planes: Float32Array) => Promise<{ policy: Float32Array; value: number }>;

const orient = (s: number, turn: Color) => (turn === 'black' ? 31 - s : s);

export function encode(pos: Position, quietPlies: number): Float32Array {
  const x = new Float32Array(PLANES * 64);
  const [mine, theirs] = pos.turn === 'black' ? [pos.black, pos.white] : [pos.white, pos.black];
  for (let s = 0; s < 32; s++) {
    const isMine = has(mine, s);
    if (!isMine && !has(theirs, s)) continue;
    const o = orient(s, pos.turn);
    const plane = (isMine ? 0 : 2) + (has(pos.kings, s) ? 1 : 0);
    x[plane * 64 + rowOf(o) * 8 + colOf(o)] = 1;
  }
  x.fill(Math.min(quietPlies, QUIET_PLY_LIMIT) / QUIET_PLY_LIMIT, 4 * 64);
  return x;
}

export const policyIndex = (move: Move, turn: Color): number => orient(move.from, turn) * 32 + orient(move.to, turn);

interface Node {
  position: Position;
  prior: number;
  visits: number;
  /** Sum of values from the point of view of the player who chose this node. */
  valueSum: number;
  moves: Move[] | null;
  children: Node[];
}

const node = (position: Position, prior: number): Node => ({ position, prior, visits: 0, valueSum: 0, moves: null, children: [] });

function select(n: Node): Node {
  const sqrtN = Math.sqrt(n.visits + 1);
  let best = n.children[0]!;
  let bestScore = -Infinity;
  for (const c of n.children) {
    const q = c.visits ? c.valueSum / c.visits : 0;
    const score = q + (C_PUCT * c.prior * sqrtN) / (1 + c.visits);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

async function expand(n: Node, quiet: number, evaluate: Evaluate): Promise<number> {
  const { policy, value } = await evaluate(encode(n.position, quiet));
  const moves = n.moves!;
  const logits = moves.map((m) => policy[policyIndex(m, n.position.turn)]!);
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  n.children = moves.map((m, i) => node(applyMove(n.position, m), exps[i]! / sum));
  return value;
}

export interface NeuralOptions {
  simulations: number;
  /** Stop early after this long, keeping the visits so far. */
  timeMs?: number;
  /** How often each position of the game so far (by positionKey, including this one) has occurred. */
  history?: Map<string, number>;
}

export async function neuralSearch(
  position: Position,
  quietPlies: number,
  evaluate: Evaluate,
  { simulations, timeMs, history = new Map() }: NeuralOptions,
): Promise<{ move: Move | null; value: number; simulations: number; stats: Map<string, { visits: number; q: number }> }> {
  const root = node(position, 1);
  root.moves = legalMoves(position);
  if (root.moves.length === 0) return { move: null, value: -1, simulations: 0, stats: new Map() };
  if (root.moves.length === 1) return { move: root.moves[0]!, value: 0, simulations: 0, stats: new Map() };

  const deadline = timeMs === undefined ? Infinity : performance.now() + timeMs;
  const rootValue = await expand(root, quietPlies, evaluate);
  let done = 0;
  for (; done < simulations && performance.now() < deadline; done++) {
    const path = [root];
    const seen: string[] = [];
    let n = root;
    let repetition = false;
    while (n.children.length > 0) {
      n = select(n);
      path.push(n);
      const key = positionKey(n.position);
      if ((history.get(key) ?? 0) + seen.filter((k) => k === key).length >= 2) {
        repetition = true;
        break;
      }
      seen.push(key);
    }
    let value: number;
    if (repetition) value = 0;
    else {
      n.moves ??= legalMoves(n.position);
      // A side with no move has lost.
      value = n.moves.length === 0 ? -1 : await expand(n, 0, evaluate);
    }
    // `value` is for the side to move at the leaf; whoever chose each node scores the opposite.
    for (let i = path.length - 1; i >= 1; i--) {
      value = -value;
      path[i]!.visits++;
      path[i]!.valueSum += value;
    }
    root.visits++;
  }

  let best = 0;
  root.children.forEach((c, i) => {
    if (c.visits > root.children[best]!.visits) best = i;
  });
  const stats = new Map(
    root.moves.map((m, i) => {
      const c = root.children[i]!;
      return [moveToString(m), { visits: c.visits, q: c.visits ? c.valueSum / c.visits : 0 }] as const;
    }),
  );
  return { move: root.moves[best]!, value: rootValue, simulations: done, stats };
}
