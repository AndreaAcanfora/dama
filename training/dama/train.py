"""AlphaZero-style training loop: self-play, train on a replay buffer, checkpoint, export.

    uv run python -m dama.train --run runs/first --iterations 3 --games 32 --sims 64
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from .export import export_onnx
from .net import DamaNet
from .selfplay import GameStats, worker_play


def train_steps(net, opt, buffer, steps: int, batch_size: int, device) -> dict[str, float]:
    planes, policies, values = buffer
    n = len(values)
    net.train()
    totals = {"policy": 0.0, "value": 0.0}
    for _ in range(steps):
        idx = np.random.randint(0, n, size=min(batch_size, n))
        x = torch.from_numpy(planes[idx].astype(np.float32)).to(device)
        pi = torch.from_numpy(policies[idx].astype(np.float32)).to(device)
        z = torch.from_numpy(values[idx]).to(device)
        logits, v = net(x)
        policy_loss = -(pi * F.log_softmax(logits, dim=1)).sum(dim=1).mean()
        value_loss = F.mse_loss(v, z)
        loss = policy_loss + value_loss
        opt.zero_grad()
        loss.backward()
        opt.step()
        totals["policy"] += policy_loss.item()
        totals["value"] += value_loss.item()
    net.eval()
    return {k: v / max(steps, 1) for k, v in totals.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", type=Path, required=True)
    ap.add_argument("--iterations", type=int, default=100)
    ap.add_argument("--games", type=int, default=128, help="self-play games per iteration")
    ap.add_argument("--parallel", type=int, default=64, help="games played at once (network batch size)")
    ap.add_argument("--sims", type=int, default=128)
    ap.add_argument("--blocks", type=int, default=6)
    ap.add_argument("--channels", type=int, default=64)
    ap.add_argument("--workers", type=int, default=4, help="self-play processes")
    ap.add_argument("--buffer", type=int, default=200_000, help="most recent samples kept for training")
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--epochs", type=float, default=2.0, help="passes over the new samples per iteration")
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--export-every", type=int, default=5)
    args = ap.parse_args()

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    args.run.mkdir(parents=True, exist_ok=True)
    ckpt_path = args.run / "latest.pt"

    net = DamaNet(args.blocks, args.channels).to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=1e-4)
    start = 0
    buffer = None
    if ckpt_path.exists():
        ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
        net.load_state_dict(ckpt["net"])
        opt.load_state_dict(ckpt["opt"])
        start = ckpt["iteration"] + 1
        data = np.load(args.run / "buffer.npz")
        buffer = (data["planes"], data["policies"], data["values"])
        print(f"resumed at iteration {start} with {len(buffer[2])} samples", flush=True)
    net.eval()
    pool = ProcessPoolExecutor(args.workers, mp_context=mp.get_context("spawn"))

    for it in range(start, start + args.iterations):
        t0 = time.time()
        state = {k: v.cpu() for k, v in net.state_dict().items()}
        share = [args.games // args.workers + (1 if w < args.games % args.workers else 0) for w in range(args.workers)]
        futures = [
            pool.submit(worker_play, state, net.config, n, args.sims, min(args.parallel, n), it * 1000 + w)
            for w, n in enumerate(share)
            if n > 0
        ]
        parts = [f.result() for f in futures]
        new = tuple(np.concatenate([p[i] for p in parts]) for i in range(3))
        stats = GameStats()
        for *_, st in parts:
            stats.white += st.white
            stats.black += st.black
            stats.draws += st.draws
            stats.plies += st.plies
        t1 = time.time()
        buffer = new if buffer is None else tuple(np.concatenate([b, n])[-args.buffer :] for b, n in zip(buffer, new))
        steps = max(1, int(args.epochs * len(new[2]) / args.batch))
        losses = train_steps(net, opt, buffer, steps, args.batch, device)
        t2 = time.time()

        record = {
            "iteration": it,
            "games": args.games,
            "white": stats.white,
            "black": stats.black,
            "draws": stats.draws,
            "avg_plies": round(float(np.mean(stats.plies)), 1),
            "samples": len(new[2]),
            "buffer": len(buffer[2]),
            "steps": steps,
            **{f"loss_{k}": round(v, 4) for k, v in losses.items()},
            "selfplay_s": round(t1 - t0, 1),
            "train_s": round(t2 - t1, 1),
        }
        print(json.dumps(record), flush=True)
        with open(args.run / "log.jsonl", "a") as f:
            f.write(json.dumps(record) + "\n")

        torch.save({"net": net.state_dict(), "opt": opt.state_dict(), "iteration": it, "config": net.config}, ckpt_path)
        if (it + 1) % args.export_every == 0:
            np.savez(args.run / "buffer.npz", planes=buffer[0], policies=buffer[1], values=buffer[2])
            torch.save({"net": net.state_dict(), "config": net.config, "iteration": it}, args.run / f"net-{it + 1:04d}.pt")
            export_onnx(net, args.run / f"dama-{it + 1:04d}.onnx")


if __name__ == "__main__":
    main()
