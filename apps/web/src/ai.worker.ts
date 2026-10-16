/// <reference lib="webworker" />
import { PLANES, chooseMove, neuralSearch } from '@dama/ai';
import type { Evaluate } from '@dama/ai';
import type { Move, Position } from '@dama/engine';
import type { InferenceSession } from 'onnxruntime-web';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

import { MAESTRO } from './game/levels';
const MAESTRO_SEARCH = { simulations: 800, timeMs: 1500 };

export interface ThinkRequest {
  id: number;
  position: Position;
  quietPlies: number;
  level: number;
  modelUrl: string;
}

export interface ThinkResponse {
  id: number;
  move: Move | null;
}

let session: Promise<{ evaluate: Evaluate }> | null = null;

/** onnxruntime and the model (several MB) load only the first time someone picks Maestro. */
function loadNetwork(modelUrl: string) {
  session ??= (async () => {
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.wasmPaths = { wasm: wasmUrl };
    // Threads need cross-origin isolation, which GitHub Pages does not offer.
    ort.env.wasm.numThreads = 1;
    const s: InferenceSession = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
    const evaluate: Evaluate = async (planes) => {
      const out = await s.run({ planes: new ort.Tensor('float32', planes, [1, PLANES, 8, 8]) });
      return { policy: out.policy!.data as Float32Array, value: (out.value!.data as Float32Array)[0]! };
    };
    return { evaluate };
  })();
  return session;
}

self.onmessage = async (event: MessageEvent<ThinkRequest>) => {
  const { id, position, quietPlies, level, modelUrl } = event.data;
  let move: Move | null;
  if (level === MAESTRO) {
    const { evaluate } = await loadNetwork(modelUrl);
    move = (await neuralSearch(position, quietPlies, evaluate, MAESTRO_SEARCH)).move;
  } else {
    move = chooseMove(position, level);
  }
  const response: ThinkResponse = { id, move };
  self.postMessage(response);
};
