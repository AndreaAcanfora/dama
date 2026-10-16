import { useCallback, useEffect, useState } from 'react';
import { fromFen } from '@dama/engine';
import type { Position } from '@dama/engine';
import { GameScreen } from './components/GameScreen';
import { Home } from './components/Home';
import { OnlineScreen } from './components/OnlineScreen';
import { Sheet } from './components/Sheet';
import type { Mode } from './game/useGame';
import { STRINGS } from './lib/i18n';
import { WS_URL } from './lib/online';
import { useSettings } from './lib/settings';
import type { Theme } from './lib/settings';

type Screen =
  | { name: 'home' }
  | { name: 'game'; mode: Mode; key: number; start?: Position }
  | { name: 'online'; code: string | null; key: number };

/** `#pos=<FEN>` opens a two-player game from that position, e.g. to study or share it. */
function positionFromHash(): Position | undefined {
  const match = /^#pos=(.+)$/.exec(window.location.hash);
  if (!match) return undefined;
  try {
    return fromFen(decodeURIComponent(match[1]!));
  } catch {
    return undefined;
  }
}

const ROOM_HASH = /^#\/play\/([2-9A-Za-z]{6})$/;

function initialScreen(): Screen {
  const room = ROOM_HASH.exec(window.location.hash);
  if (room && WS_URL) return { name: 'online', code: room[1]!.toUpperCase(), key: 0 };
  const start = positionFromHash();
  return start ? { name: 'game', mode: { kind: 'local' }, key: 0, start } : { name: 'home' };
}

export function App() {
  const [settings, update] = useSettings();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [sheet, setSheet] = useState<'settings' | 'rules' | null>(null);
  const t = STRINGS[settings.lang];

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  const goHome = useCallback(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setScreen({ name: 'home' });
  }, []);

  const startComputer = useCallback(() => {
    const human = settings.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : settings.color;
    setScreen({ name: 'game', mode: { kind: 'ai', level: settings.level, human }, key: Date.now() });
  }, [settings.color, settings.level]);

  const recordResult = useCallback(
    (level: number) => (result: 'won' | 'lost' | 'draw') =>
      update((s) => {
        const prev = s.record[level] ?? { won: 0, played: 0 };
        return { record: { ...s.record, [level]: { won: prev.won + (result === 'won' ? 1 : 0), played: prev.played + 1 } } };
      }),
    [update],
  );

  const themes: { id: Theme; label: string }[] = [
    { id: 'wood', label: t.themeWood },
    { id: 'marble', label: t.themeMarble },
    { id: 'night', label: t.themeNight },
  ];

  return (
    <div className="app" data-theme={settings.theme}>
      {screen.name === 'home' ? (
        <Home
          t={t}
          lang={settings.lang}
          settings={settings}
          onChange={update}
          onPlayComputer={startComputer}
          onPlayLocal={() => setScreen({ name: 'game', mode: { kind: 'local' }, key: Date.now() })}
          onPlayOnline={WS_URL ? () => setScreen({ name: 'online', code: null, key: Date.now() }) : null}
          onOpenSettings={() => setSheet('settings')}
          onOpenRules={() => setSheet('rules')}
        />
      ) : screen.name === 'online' ? (
        <OnlineScreen
          key={screen.key}
          t={t}
          code={screen.code}
          settings={settings}
          inviteUrl={(code) => `${window.location.origin}${window.location.pathname}#/play/${code}`}
          onRoom={(code) => window.history.replaceState(null, '', `#/play/${code}`)}
          onExit={goHome}
        />
      ) : (
        <GameScreen
          key={screen.key}
          t={t}
          lang={settings.lang}
          mode={screen.mode}
          start={screen.start}
          settings={settings}
          onExit={goHome}
          onRematch={() =>
            screen.mode.kind === 'ai'
              ? setScreen({ name: 'game', mode: { ...screen.mode, human: screen.mode.human === 'white' ? 'black' : 'white' }, key: Date.now() })
              : setScreen({ ...screen, key: Date.now() })
          }
          onFinished={screen.mode.kind === 'ai' ? recordResult(screen.mode.level) : () => {}}
        />
      )}

      {sheet === 'settings' && (
        <Sheet title={t.settings} closeLabel={t.close} onClose={() => setSheet(null)}>
          <fieldset>
            <legend>{t.theme}</legend>
            <div className="segmented">
              {themes.map((th) => (
                <button key={th.id} type="button" aria-pressed={settings.theme === th.id} onClick={() => update({ theme: th.id })}>
                  {th.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t.sound}</legend>
            <div className="segmented">
              <button type="button" aria-pressed={settings.sound} onClick={() => update({ sound: true })}>
                {t.on}
              </button>
              <button type="button" aria-pressed={!settings.sound} onClick={() => update({ sound: false })}>
                {t.off}
              </button>
            </div>
          </fieldset>
          <fieldset>
            <legend>{t.language}</legend>
            <div className="segmented">
              <button type="button" aria-pressed={settings.lang === 'it'} onClick={() => update({ lang: 'it' })}>
                Italiano
              </button>
              <button type="button" aria-pressed={settings.lang === 'en'} onClick={() => update({ lang: 'en' })}>
                English
              </button>
            </div>
          </fieldset>
        </Sheet>
      )}

      {sheet === 'rules' && (
        <Sheet title={t.rules} closeLabel={t.close} onClose={() => setSheet(null)}>
          <ol className="rules">
            {t.rulesText.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </Sheet>
      )}
    </div>
  );
}
