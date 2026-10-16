"""Self-play: the network plays itself with MCTS and records (position, search policy, result)."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .encode import PLANES, POLICY_SIZE, encode, policy_index
from .mcts import Evaluator, Node, Search, visit_distribution
from .rules import WHITE, Game, legal_moves

MAX_PLIES = 200
"""Games still running after this many plies are scored as draws."""


@dataclass
class Samples:
    planes: list[np.ndarray] = field(default_factory=list)
    policies: list[np.ndarray] = field(default_factory=list)
    values: list[float] = field(default_factory=list)


@dataclass
class GameStats:
    white: int = 0
    black: int = 0
    draws: int = 0
    plies: list[int] = field(default_factory=list)


def play_games(
    evaluate: Evaluator,
    games: int,
    simulations: int,
    parallel: int,
    temperature_plies: int = 16,
    rng: np.random.Generator | None = None,
) -> tuple[Samples, GameStats]:
    rng = rng or np.random.default_rng()
    search = Search(evaluate, simulations)
    samples, stats = Samples(), GameStats()

    started = 0
    slots: list[dict] = []

    def new_slot() -> dict:
        game = Game()
        return {"game": game, "root": Node(game.position, 1.0), "history": []}

    while started < min(parallel, games):
        slots.append(new_slot())
        started += 1

    while slots:
        search.run(
            [s["root"] for s in slots],
            [s["game"].quiet_plies for s in slots],
            add_noise=True,
            histories=[s["game"].counts for s in slots],
        )
        finished = []
        for i, slot in enumerate(slots):
            game: Game = slot["game"]
            root: Node = slot["root"]
            dist = visit_distribution(root)
            target = np.zeros(POLICY_SIZE, dtype=np.float32)
            assert root.moves is not None
            for move, p in zip(root.moves, dist):
                target[policy_index(move, game.position.turn)] += p
            slot["history"].append((encode(game.position, game.quiet_plies), target, game.position.turn))

            if game.plies < temperature_plies:
                choice = int(rng.choice(len(dist), p=dist))
            else:
                choice = int(np.argmax(dist))
            game.play(root.moves[choice])
            # Reuse the searched subtree for the next move.
            slot["root"] = root.children[choice]

            moves = legal_moves(game.position)
            outcome = game.outcome(moves)
            if outcome is None and game.plies < MAX_PLIES:
                continue
            if outcome == -1.0:
                winner = 1 - game.position.turn
                if winner == WHITE:
                    stats.white += 1
                else:
                    stats.black += 1
            else:
                winner = None
                stats.draws += 1
            stats.plies.append(game.plies)
            for planes, policy, turn in slot["history"]:
                samples.planes.append(planes)
                samples.policies.append(policy)
                samples.values.append(0.0 if winner is None else (1.0 if turn == winner else -1.0))
            finished.append(i)

        for i in reversed(finished):
            if started < games:
                slots[i] = new_slot()
                started += 1
            else:
                slots.pop(i)
    return samples, stats


def stack(samples: Samples) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    return (
        np.stack(samples.planes).astype(np.float32).reshape(-1, PLANES, 8, 8),
        np.stack(samples.policies).astype(np.float32),
        np.array(samples.values, dtype=np.float32),
    )


def worker_play(state: dict, config: dict, games: int, simulations: int, parallel: int, seed: int):
    """Self-play in a separate process (one per CPU core), returning compact arrays."""
    import torch

    from .net import DamaNet

    torch.set_num_threads(1)
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    net = DamaNet(**config).to(device)
    net.load_state_dict(state)
    net.eval()

    @torch.no_grad()
    def evaluate(batch: np.ndarray):
        logits, values = net(torch.from_numpy(batch).to(device))
        return logits.float().cpu().numpy(), values.float().cpu().numpy()

    samples, stats = play_games(evaluate, games, simulations, parallel, rng=np.random.default_rng(seed))
    planes, policies, values = stack(samples)
    return planes.astype(np.float16), policies.astype(np.float16), values, stats
