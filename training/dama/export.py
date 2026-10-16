"""Export a trained network to ONNX for onnxruntime-web.

    uv run python -m dama.export runs/first/latest.pt ../apps/web/public/models/dama.onnx
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import torch

from .encode import PLANES
from .net import DamaNet


def export_onnx(net: DamaNet, path: Path) -> None:
    model = copy.deepcopy(net).cpu().eval()
    dummy = torch.zeros(1, PLANES, 8, 8)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        (dummy,),
        str(path),
        input_names=["planes"],
        output_names=["policy", "value"],
        dynamic_axes={"planes": {0: "batch"}, "policy": {0: "batch"}, "value": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )


def main() -> None:
    ckpt_path, out = Path(sys.argv[1]), Path(sys.argv[2])
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    net = DamaNet(**ckpt["config"])
    net.load_state_dict(ckpt["net"])
    export_onnx(net, out)
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB) from iteration {ckpt['iteration']}")


if __name__ == "__main__":
    main()
