"""Tensor encoding shared by training and the browser (mirror it exactly in packages/ai).

The board is always seen from the side to move: when Black is to move, square s is
mapped to 31 - s (a 180-degree turn), so "my" men always move up the board.

Input: 5 planes of 8x8 (my men, my kings, their men, their kings, quiet-ply counter / 80).
Policy: 1024 logits indexed by from * 32 + to, in the side-to-move orientation. The rare
moves that share both squares (different captures, same landing) share one logit.
"""

from __future__ import annotations

import numpy as np

from .rules import BIT, BLACK, QUIET_PLY_LIMIT, Move, Position, col_of, row_of

PLANES = 5
POLICY_SIZE = 32 * 32

ROW = np.array([row_of(s) for s in range(32)])
COL = np.array([col_of(s) for s in range(32)])


def orient(s: int, turn: int) -> int:
    return 31 - s if turn == BLACK else s


def encode(pos: Position, quiet_plies: int = 0, out: np.ndarray | None = None) -> np.ndarray:
    x = out if out is not None else np.zeros((PLANES, 8, 8), dtype=np.float32)
    x.fill(0.0)
    mine, theirs = (pos.black, pos.white) if pos.turn == BLACK else (pos.white, pos.black)
    for s in range(32):
        b = BIT[s]
        if not (mine | theirs) & b:
            continue
        o = orient(s, pos.turn)
        plane = (0 if mine & b else 2) + (1 if pos.kings & b else 0)
        x[plane, ROW[o], COL[o]] = 1.0
    x[4].fill(min(quiet_plies, QUIET_PLY_LIMIT) / QUIET_PLY_LIMIT)
    return x


def policy_index(move: Move, turn: int) -> int:
    return orient(move.frm, turn) * 32 + orient(move.to, turn)
