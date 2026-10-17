# Training

AlphaZero-style self-play for Italian draughts. The rules in `dama/rules.py` are a port of
`packages/engine`, checked against `fixtures/engine.json` by the tests.

```bash
uv sync
uv run pytest
# one long run (resumable: rerun the same command to continue)
uv run python -m dama.train --run runs/v2 --iterations 150 --games 384 --parallel 64 --workers 6 --sims 128
uv run python -m dama.export runs/v2/latest.pt ../apps/web/public/models/dama.onnx
```

- **Input:** 5 planes of 8×8 seen from the side to move (my men, my kings, their men, their kings, 40-move counter).
- **Network:** 6 residual blocks × 64 channels, fully convolutional policy head (1024 = from × to logits), tanh value. About 490k parameters, under 2 MB as ONNX.
- **Search:** PUCT MCTS batched across 64 games per process, Dirichlet noise at the root, temperature 1 for the first 16 plies. A position that would occur for the third time (game history plus the path) is scored as a draw inside the tree; without that, self-play collapsed into repetition draws.
- **Speed on an M1 Pro:** about 4.6 games/s at 64 simulations with 6 processes; the Python search, not the network, is the bottleneck.

## The shipped model

`apps/web/public/models/dama.onnx` comes from run `v2`: 150 iterations, 57,600 games, 9.9 hours on an M1 Pro (128 simulations per move, 6 processes). Draws settled around 50% of self-play games and the policy loss went from 2.02 to 1.18. Strength against the alpha-beta levels is in the main README.

To measure a model:

```bash
cd ../packages/ai
pnpm -s arena ../../training/runs/v2/dama-0150.onnx --level 5 --games 24 --sims 800 --time-ms 1500 --random-plies 4
```
