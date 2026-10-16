/// <reference lib="webworker" />
import type { Move, Position } from '@dama/engine';
import { chooseMove } from './levels';

export interface ThinkRequest {
  id: number;
  position: Position;
  level: number;
}

export interface ThinkResponse {
  id: number;
  move: Move | null;
}

self.onmessage = (event: MessageEvent<ThinkRequest>) => {
  const { id, position, level } = event.data;
  const response: ThinkResponse = { id, move: chooseMove(position, level) };
  self.postMessage(response);
};
