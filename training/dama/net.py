"""Small residual policy/value network, sized to run in the browser via ONNX."""

from __future__ import annotations

import torch
from torch import nn

from .encode import COL, PLANES, ROW

# Flat 8x8 index of each playable square, in square order.
DARK = [int(r) * 8 + int(c) for r, c in zip(ROW, COL)]


class Block(nn.Module):
    def __init__(self, ch: int):
        super().__init__()
        self.c1 = nn.Conv2d(ch, ch, 3, padding=1, bias=False)
        self.b1 = nn.BatchNorm2d(ch)
        self.c2 = nn.Conv2d(ch, ch, 3, padding=1, bias=False)
        self.b2 = nn.BatchNorm2d(ch)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = torch.relu(self.b1(self.c1(x)))
        return torch.relu(x + self.b2(self.c2(y)))


class DamaNet(nn.Module):
    def __init__(self, blocks: int = 6, channels: int = 64):
        super().__init__()
        self.config = {"blocks": blocks, "channels": channels}
        self.stem = nn.Sequential(nn.Conv2d(PLANES, channels, 3, padding=1, bias=False), nn.BatchNorm2d(channels), nn.ReLU())
        self.body = nn.Sequential(*[Block(channels) for _ in range(blocks)])
        # Fully convolutional policy: channel `to` at the cell of square `from` is the logit of from -> to.
        self.policy = nn.Sequential(nn.Conv2d(channels, channels, 1, bias=False), nn.BatchNorm2d(channels), nn.ReLU(), nn.Conv2d(channels, 32, 1))
        self.register_buffer("dark", torch.tensor(DARK), persistent=False)
        self.value = nn.Sequential(
            nn.Conv2d(channels, 4, 1, bias=False),
            nn.BatchNorm2d(4),
            nn.ReLU(),
            nn.Flatten(),
            nn.Linear(4 * 64, 128),
            nn.ReLU(),
            nn.Linear(128, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.body(self.stem(x))
        p = self.policy(h).flatten(2)[:, :, self.dark]  # (B, to, from)
        return p.transpose(1, 2).reshape(x.shape[0], 32 * 32), self.value(h).squeeze(-1)
