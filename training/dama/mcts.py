"""PUCT Monte Carlo tree search, batched across many games so the network runs on full batches.

Values are always from the point of view of the side to move at the node being evaluated.
Inside the tree a game ends when the side to move has no move (a loss) or when a position
would occur for the third time, counting the real game history and the path (a draw).
Without the second rule the search happily repeats moves while winning.
"""

from __future__ import annotations

import math
from collections.abc import Callable

import numpy as np

from .encode import PLANES, encode, policy_index
from .rules import Move, Position, apply_move, legal_moves

Evaluator = Callable[[np.ndarray], tuple[np.ndarray, np.ndarray]]
"""Maps a (B, PLANES, 8, 8) batch to (policy logits (B, 1024), values (B,))."""

C_PUCT = 1.5


class Node:
    __slots__ = ("position", "prior", "visits", "value_sum", "moves", "children", "terminal")

    def __init__(self, position: Position, prior: float):
        self.position = position
        self.prior = prior
        self.visits = 0
        # Sum of values from the point of view of the player who chose this node.
        self.value_sum = 0.0
        self.moves: list[Move] | None = None
        self.children: list[Node] = []
        self.terminal: float | None = None

    @property
    def expanded(self) -> bool:
        return self.moves is not None

    def q(self) -> float:
        return self.value_sum / self.visits if self.visits else 0.0


def _select(node: Node) -> int:
    sqrt_n = math.sqrt(node.visits + 1)
    best, best_score = 0, -1e9
    for i, child in enumerate(node.children):
        score = child.q() + C_PUCT * child.prior * sqrt_n / (1 + child.visits)
        if score > best_score:
            best, best_score = i, score
    return best


def _expand(node: Node, logits: np.ndarray) -> None:
    moves = node.moves
    assert moves is not None
    turn = node.position.turn
    idx = np.array([policy_index(m, turn) for m in moves])
    z = logits[idx]
    z = np.exp(z - z.max())
    priors = z / z.sum()
    node.children = [Node(apply_move(node.position, m), float(p)) for m, p in zip(moves, priors)]


def _backup(path: list[Node], value: float) -> None:
    # `value` is for the side to move at the leaf; its parent chose the leaf, so it scores -value.
    for node in reversed(path):
        value = -value
        node.visits += 1
        node.value_sum += value


class Search:
    """One tree per game; `run` advances every tree by `simulations` playouts."""

    def __init__(self, evaluate: Evaluator, simulations: int, dirichlet: float = 0.3, noise: float = 0.25):
        self.evaluate = evaluate
        self.simulations = simulations
        self.dirichlet = dirichlet
        self.noise = noise
        self.rng = np.random.default_rng()

    def _prepare(self, node: Node) -> bool:
        """Lists the node's moves. Returns True when it still needs a network evaluation."""
        if node.moves is None:
            node.moves = legal_moves(node.position)
            if not node.moves:
                node.terminal = -1.0
        return node.terminal is None and not node.children

    def run(
        self,
        roots: list[Node],
        quiet: list[int],
        add_noise: bool,
        histories: list[dict[Position, int]] | None = None,
    ) -> None:
        """`histories` maps each game's positions so far (including the root) to how often they occurred."""
        batch = np.zeros((len(roots), PLANES, 8, 8), dtype=np.float32)

        # Make sure every root is expanded, then add exploration noise.
        pending = [i for i, r in enumerate(roots) if self._prepare(r)]
        if pending:
            for j, i in enumerate(pending):
                encode(roots[i].position, quiet[i], batch[j])
            logits, _ = self.evaluate(batch[: len(pending)])
            for j, i in enumerate(pending):
                _expand(roots[i], logits[j])
        if add_noise:
            for r in roots:
                if len(r.children) > 1:
                    eta = self.rng.dirichlet([self.dirichlet] * len(r.children))
                    for c, e in zip(r.children, eta):
                        c.prior = (1 - self.noise) * c.prior + self.noise * e

        for _ in range(self.simulations):
            paths: list[list[Node]] = []
            leaves: list[int] = []
            for g, root in enumerate(roots):
                if root.terminal is not None:
                    paths.append([])
                    continue
                history = histories[g] if histories else {}
                node, path = root, [root]
                seen: list[Position] = []
                repetition = False
                while node.children:
                    node = node.children[_select(node)]
                    path.append(node)
                    if history.get(node.position, 0) + seen.count(node.position) >= 2:
                        repetition = True
                        break
                    seen.append(node.position)
                paths.append(path)
                if repetition:
                    _backup(path[1:], 0.0)
                    root.visits += 1
                    continue
                if self._prepare(node):
                    leaves.append(g)
                else:
                    # Terminal leaf: the side to move has no move and has lost.
                    _backup(path[1:], node.terminal if node.terminal is not None else 0.0)
                    root.visits += 1
            if not leaves:
                continue
            for j, g in enumerate(leaves):
                encode(paths[g][-1].position, 0, batch[j])
            logits, values = self.evaluate(batch[: len(leaves)])
            for j, g in enumerate(leaves):
                leaf = paths[g][-1]
                _expand(leaf, logits[j])
                _backup(paths[g][1:], float(values[j]))
                roots[g].visits += 1


def visit_distribution(root: Node) -> np.ndarray:
    counts = np.array([c.visits for c in root.children], dtype=np.float64)
    return counts / counts.sum() if counts.sum() > 0 else np.full(len(counts), 1 / len(counts))
