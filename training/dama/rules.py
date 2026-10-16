"""Italian draughts rules, a line-by-line port of packages/engine (TypeScript).

Kept deliberately identical in square indexing, move order and notation so that
tests/test_rules.py can check it against fixtures/engine.json. A network trained on
subtly different rules would be useless in the browser.

Squares 0..31 run row by row from White's back rank (row 0); square = row * 4 + k.
A position is (white_mask, black_mask, kings_mask, turn) with turn 0 = White, 1 = Black.
"""

from __future__ import annotations

from typing import NamedTuple

WHITE, BLACK = 0, 1


class Position(NamedTuple):
    white: int
    black: int
    kings: int
    turn: int


class Move(NamedTuple):
    frm: int
    to: int
    path: tuple[int, ...]
    captures: tuple[int, ...]
    promotes: bool


def row_of(s: int) -> int:
    return s >> 2


def col_of(s: int) -> int:
    return 2 * (s & 3) + (1 if row_of(s) % 2 == 0 else 0)


def _square(row: int, col: int) -> int:
    if row < 0 or row > 7 or col < 0 or col > 7:
        return -1
    return row * 4 + (col >> 1)


# Directions: 0 up-left, 1 up-right, 2 down-left, 3 down-right ("up" is towards Black).
_DELTA = ((1, -1), (1, 1), (-1, -1), (-1, 1))
NEIGHBOR = [[_square(row_of(s) + dr, col_of(s) + dc) for dr, dc in _DELTA] for s in range(32)]
JUMP = [[_square(row_of(s) + 2 * dr, col_of(s) + 2 * dc) for dr, dc in _DELTA] for s in range(32)]
FORWARD = ((0, 1), (2, 3))
ALL_DIRS = (0, 1, 2, 3)
PROMOTION_ROW = (7, 0)
BIT = [1 << s for s in range(32)]


def initial_position() -> Position:
    return Position(0x00000FFF, 0xFFF00000, 0, WHITE)


def to_number(s: int) -> int:
    return (7 - row_of(s)) * 4 + (s & 3) + 1


def from_number(n: int) -> int:
    if not 1 <= n <= 32:
        raise ValueError(f"invalid square number {n}")
    return (7 - ((n - 1) >> 2)) * 4 + ((n - 1) & 3)


def to_fen(pos: Position) -> str:
    def side(mask: int) -> str:
        items = sorted((to_number(s), bool(pos.kings & BIT[s])) for s in range(32) if mask & BIT[s])
        return ",".join(f"K{n}" if k else str(n) for n, k in items)

    return f"{'W' if pos.turn == WHITE else 'B'}:W{side(pos.white)}:B{side(pos.black)}"


def from_fen(fen: str) -> Position:
    turn_part, *sides = fen.strip().split(":")
    if turn_part not in ("W", "B"):
        raise ValueError(f"invalid FEN turn in {fen!r}")
    white = black = kings = 0
    for part in sides:
        colour, items = part[0], part[1:]
        if not items:
            continue
        for token in items.split(","):
            king = token.startswith("K")
            s = from_number(int(token[1:] if king else token))
            if colour == "W":
                white |= BIT[s]
            else:
                black |= BIT[s]
            if king:
                kings |= BIT[s]
    return Position(white, black, kings, WHITE if turn_part == "W" else BLACK)


def _capture_sequences(pos: Position, frm: int, out: list) -> None:
    enemy = pos.black if pos.turn == WHITE else pos.white
    kings = pos.kings
    is_king = bool(kings & BIT[frm])
    dirs = ALL_DIRS if is_king else FORWARD[pos.turn]
    last_row = PROMOTION_ROW[pos.turn]
    # The moving piece leaves its square, so a king may land back on it.
    occupied = (pos.white | pos.black) & ~BIT[frm]

    def record(path: tuple, captures: tuple, promotes: bool) -> None:
        king_idx = next((i for i, s in enumerate(captures) if kings & BIT[s]), None)
        out.append(
            (
                Move(frm, path[-1], path, captures, promotes),
                is_king,
                sum(1 for s in captures if kings & BIT[s]),
                float("inf") if king_idx is None else king_idx,
            )
        )

    def extend(at: int, path: tuple, captures: tuple, taken: int) -> None:
        extended = False
        for d in dirs:
            over = NEIGHBOR[at][d]
            land = JUMP[at][d]
            if land < 0 or not enemy & BIT[over] or taken & BIT[over] or occupied & BIT[land]:
                continue
            # A man can never capture a king.
            if not is_king and kings & BIT[over]:
                continue
            extended = True
            next_path = path + (land,)
            next_captures = captures + (over,)
            if not is_king and row_of(land) == last_row:
                # Promotion ends the move.
                record(next_path, next_captures, True)
                continue
            extend(land, next_path, next_captures, taken | BIT[over])
        if not extended and captures:
            record(path, captures, False)

    extend(frm, (), (), 0)


def _mandatory(candidates: list) -> list[Move]:
    pool = candidates
    best = max(len(c[0].captures) for c in pool)
    pool = [c for c in pool if len(c[0].captures) == best]
    if any(c[1] for c in pool):
        pool = [c for c in pool if c[1]]
    best = max(c[2] for c in pool)
    pool = [c for c in pool if c[2] == best]
    best = min(c[3] for c in pool)
    pool = [c for c in pool if c[3] == best]

    seen = set()
    moves = []
    for move, *_ in pool:
        key = (move.frm, move.to, tuple(sorted(move.captures)))
        if key in seen:
            continue
        seen.add(key)
        moves.append(move)
    return moves


def legal_moves(pos: Position) -> list[Move]:
    own = pos.white if pos.turn == WHITE else pos.black
    candidates: list = []
    for s in range(32):
        if own & BIT[s]:
            _capture_sequences(pos, s, candidates)
    if candidates:
        return _mandatory(candidates)

    occupied = pos.white | pos.black
    last_row = PROMOTION_ROW[pos.turn]
    moves = []
    for s in range(32):
        if not own & BIT[s]:
            continue
        is_king = bool(pos.kings & BIT[s])
        for d in ALL_DIRS if is_king else FORWARD[pos.turn]:
            to = NEIGHBOR[s][d]
            if to < 0 or occupied & BIT[to]:
                continue
            moves.append(Move(s, to, (to,), (), not is_king and row_of(to) == last_row))
    return moves


def apply_move(pos: Position, move: Move) -> Position:
    own, enemy = (pos.white, pos.black) if pos.turn == WHITE else (pos.black, pos.white)
    kings = pos.kings
    was_king = bool(kings & BIT[move.frm])
    own = (own & ~BIT[move.frm]) | BIT[move.to]
    kings &= ~BIT[move.frm]
    for s in move.captures:
        enemy &= ~BIT[s]
        kings &= ~BIT[s]
    if was_king or move.promotes:
        kings |= BIT[move.to]
    if pos.turn == WHITE:
        return Position(own, enemy, kings, BLACK)
    return Position(enemy, own, kings, WHITE)


def perft(pos: Position, depth: int) -> int:
    if depth == 0:
        return 1
    moves = legal_moves(pos)
    if depth == 1:
        return len(moves)
    return sum(perft(apply_move(pos, m), depth - 1) for m in moves)


def move_to_string(move: Move) -> str:
    if not move.captures:
        return f"{to_number(move.frm)}-{to_number(move.to)}"
    return "x".join(str(to_number(s)) for s in (move.frm, *move.path))


# Game status, mirroring packages/engine/src/game.ts.
QUIET_PLY_LIMIT = 80


class Game:
    """A game with the history needed for the repetition and 40-move draw rules."""

    __slots__ = ("position", "counts", "quiet_plies", "plies")

    def __init__(self, position: Position | None = None):
        self.position = position or initial_position()
        self.counts: dict[Position, int] = {self.position: 1}
        self.quiet_plies = 0
        self.plies = 0

    def copy(self) -> "Game":
        g = Game.__new__(Game)
        g.position = self.position
        g.counts = dict(self.counts)
        g.quiet_plies = self.quiet_plies
        g.plies = self.plies
        return g

    def play(self, move: Move) -> None:
        quiet = not move.captures and bool(self.position.kings & BIT[move.frm])
        self.position = apply_move(self.position, move)
        self.counts[self.position] = self.counts.get(self.position, 0) + 1
        self.quiet_plies = self.quiet_plies + 1 if quiet else 0
        self.plies += 1

    def outcome(self, moves: list[Move] | None = None) -> float | None:
        """None while the game goes on, else the result for the side to move: -1 loss, 0 draw."""
        if not (moves if moves is not None else legal_moves(self.position)):
            return -1.0
        if self.counts.get(self.position, 0) >= 3 or self.quiet_plies >= QUIET_PLY_LIMIT:
            return 0.0
        return None
