import numpy as np

from dama.encode import POLICY_SIZE, encode, policy_index
from dama.mcts import Node, Search
from dama.rules import BLACK, Position, from_fen, initial_position, legal_moves, move_to_string
from dama.selfplay import play_games


def uniform(batch: np.ndarray):
    return np.zeros((len(batch), POLICY_SIZE), np.float32), np.zeros(len(batch), np.float32)


def test_encoding_is_the_same_for_both_sides_at_the_start():
    white = encode(initial_position())
    black = encode(initial_position()._replace(turn=BLACK))
    assert np.array_equal(white, black)
    assert white[0].sum() == 12 and white[2].sum() == 12


def test_every_opening_move_has_its_own_policy_index():
    moves = legal_moves(initial_position())
    assert len({policy_index(m, 0) for m in moves}) == len(moves)


def test_search_finds_the_winning_sacrifice_from_terminal_values_alone():
    # White gives up a man so the forced recapture opens a triple jump (see packages/ai tests).
    shot = from_fen("W:W22,23,26,29:B6,15,14")
    root = Node(shot, 1.0)
    Search(uniform, simulations=600).run([root], [0], add_noise=False)
    best = max(range(len(root.children)), key=lambda i: root.children[i].visits)
    assert move_to_string(root.moves[best]) == "22-19"


def test_self_play_produces_consistent_samples():
    samples, stats = play_games(uniform, games=2, simulations=4, parallel=2)
    assert stats.white + stats.black + stats.draws == 2
    assert len(samples.planes) == len(samples.policies) == len(samples.values) == sum(stats.plies)
    assert all(abs(p.sum() - 1) < 1e-5 for p in samples.policies)
