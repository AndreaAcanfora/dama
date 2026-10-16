"""Writes fixtures/encoding.json so packages/ai can check its encoder against this one."""
import json
from pathlib import Path

import numpy as np

from dama.encode import encode, policy_index
from dama.rules import from_fen, legal_moves, move_to_string

root = Path(__file__).parents[2]
positions = json.loads((root / "fixtures" / "engine.json").read_text())["positions"]
cases = []
for i, case in enumerate(positions[::25]):
    pos = from_fen(case["fen"])
    quiet = (i * 7) % 90
    x = encode(pos, quiet)
    cases.append(
        {
            "fen": case["fen"],
            "quiet": quiet,
            "ones": [int(k) for k in np.flatnonzero(x[:4].reshape(-1))],
            "quietPlane": float(x[4, 0, 0]),
            "policy": {move_to_string(m): policy_index(m, pos.turn) for m in legal_moves(pos)},
        }
    )
(root / "fixtures" / "encoding.json").write_text(json.dumps(cases, indent=1) + "\n")
print(len(cases), "cases")
