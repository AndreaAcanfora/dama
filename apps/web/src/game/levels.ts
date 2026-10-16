import { LEVELS } from '@dama/ai';
import type { Level } from '@dama/ai';

/** The level played by the network trained with self-play, above the alpha-beta levels. */
export const MAESTRO = LEVELS.length + 1;

export type PlayableLevel = Pick<Level, 'id' | 'name'>;

/** Set at build time: Maestro appears only when a trained model ships with the app. */
export const HAS_MODEL: boolean = __HAS_MODEL__;

export const PLAYABLE_LEVELS: readonly PlayableLevel[] = HAS_MODEL
  ? [...LEVELS, { id: MAESTRO, name: { it: 'Maestro', en: 'Master' } }]
  : LEVELS;
