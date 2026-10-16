# Training

AlphaZero-style self-play for Italian draughts. The rules in `dama/rules.py` are a port of
`packages/engine`, checked against `fixtures/engine.json` by the tests.

```bash
uv sync
uv run pytest
# one long run (resumable: rerun the same command to continue)
uv run python -m dama.train --run runs/v1 --iterations 150 --games 384 --parallel 64 --workers 6 --sims 128
uv run python -m dama.export runs/v1/latest.pt ../apps/web/public/models/dama.onnx
```

- **Input:** 5 planes of 8×8 seen from the side to move (my men, my kings, their men, their kings, 40-move counter).
- **Network:** 6 residual blocks × 64 channels, fully convolutional policy head (1024 = from × to logits), tanh value. About 490k parameters, under 2 MB as ONNX.
- **Search:** PUCT MCTS batched across 64 games per process, Dirichlet noise at the root, temperature 1 for the first 16 plies.
- **Speed on an M1 Pro:** about 4.6 games/s at 64 simulations with 6 processes; the Python search, not the network, is the bottleneck.
