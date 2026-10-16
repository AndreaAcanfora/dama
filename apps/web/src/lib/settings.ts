import { useCallback, useState } from 'react';
import { defaultLang } from './i18n';
import type { Lang } from './i18n';

export type Theme = 'wood' | 'marble' | 'night';
export type ColorChoice = 'white' | 'black' | 'random';

export interface Settings {
  theme: Theme;
  sound: boolean;
  lang: Lang;
  level: number;
  color: ColorChoice;
  /** Games won and played against each level. */
  record: Record<number, { won: number; played: number }>;
}

const KEY = 'dama.settings.v1';

function load(): Settings {
  const defaults: Settings = { theme: 'wood', sound: true, lang: defaultLang(), level: 2, color: 'white', record: {} };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : defaults;
  } catch {
    return defaults;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  const update = useCallback((patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => {
    setSettings((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable (private mode); settings then last for the session.
      }
      return next;
    });
  }, []);
  return [settings, update] as const;
}
