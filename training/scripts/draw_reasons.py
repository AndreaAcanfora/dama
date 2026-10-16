"""Plays self-play games with a checkpoint and reports how the draws happen."""
import collections
import sys

import numpy as np
import torch

from dama.mcts import Node, Search, visit_distribution
from dama.net import DamaNet
from dama.rules import BIT, Game, legal_moves
from dama.selfplay import MAX_PLIES

ckpt = torch.load(sys.argv[1], map_location="cpu", weights_only=False)
net = DamaNet(**ckpt["config"])
net.load_state_dict(ckpt["net"])
net.eval()


@torch.no_grad()
def evaluate(batch):
    p, v = net(torch.from_numpy(batch))
    return p.numpy(), v.numpy()


reasons = collections.Counter()
material = []
rng = np.random.default_rng(0)
games = [Game() for _ in range(32)]
roots = [Node(g.position, 1.0) for g in games]
active = list(range(32))
search = Search(evaluate, 64)
while active:
    search.run([roots[i] for i in active], [games[i].quiet_plies for i in active], add_noise=True)
    for i in list(active):
        g, r = games[i], roots[i]
        d = visit_distribution(r)
        c = int(rng.choice(len(d), p=d)) if g.plies < 16 else int(np.argmax(d))
        g.play(r.moves[c])
        roots[i] = r.children[c]
        moves = legal_moves(g.position)
        if not moves:
            reasons["win"] += 1
        elif g.counts[g.position] >= 3:
            reasons["repetition"] += 1
        elif g.quiet_plies >= 80:
            reasons["forty-moves"] += 1
        elif g.plies >= MAX_PLIES:
            reasons["max-plies"] += 1
        else:
            continue
        p = g.position
        count = lambda m: bin(m).count("1")
        if reasons and moves:
            material.append((count(p.white & ~p.kings), count(p.white & p.kings), count(p.black & ~p.kings), count(p.black & p.kings), g.plies))
        active.remove(i)
print(dict(reasons))
print("draw material (W men, W kings, B men, B kings, plies):")
for m in material[:20]:
    print(" ", m)
