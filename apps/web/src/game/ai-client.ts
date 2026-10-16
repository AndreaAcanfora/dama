import type { Move, Position } from '@dama/engine';
import type { ThinkRequest, ThinkResponse } from '../ai.worker';
import AiWorker from '../ai.worker?worker';

const MODEL_URL = `${import.meta.env.BASE_URL}models/dama.onnx`;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (move: Move | null) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new AiWorker();
    worker.onmessage = (event: MessageEvent<ThinkResponse>) => {
      pending.get(event.data.id)?.(event.data.move);
      pending.delete(event.data.id);
    };
  }
  return worker;
}

/** Asks the background worker for a move, so the board stays responsive while it searches. */
export function think(position: Position, quietPlies: number, level: number): Promise<Move | null> {
  const id = nextId++;
  const request: ThinkRequest = { id, position, quietPlies, level, modelUrl: MODEL_URL };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage(request);
  });
}
