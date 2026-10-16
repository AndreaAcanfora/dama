"""The Python rules must match the TypeScript engine exactly (fixtures/engine.json)."""
import json
from pathlib import Path

import pytest

from dama.rules import from_fen, initial_position, legal_moves, move_to_string, perft, to_fen

FIXTURES = json.loads((Path(__file__).parents[2] / "fixtures" / "engine.json").read_text())


@pytest.mark.parametrize("depth", [1, 2, 3, 4, 5])
def test_perft_matches_engine(depth):
    assert perft(initial_position(), depth) == FIXTURES["perft"][str(depth)]


def test_legal_moves_match_engine_on_every_fixture():
    mismatches = []
    for case in FIXTURES["positions"]:
        got = sorted(move_to_string(m) for m in legal_moves(from_fen(case["fen"])))
        if got != case["moves"]:
            mismatches.append((case["fen"], got, case["moves"]))
    assert not mismatches, mismatches[:3]


def test_fen_round_trip():
    for case in FIXTURES["positions"][:200]:
        assert to_fen(from_fen(case["fen"])) == case["fen"]
