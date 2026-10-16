import { PLAYABLE_LEVELS } from '../game/levels';
import { format } from '../lib/i18n';
import type { Lang, Strings } from '../lib/i18n';
import type { ColorChoice, Settings } from '../lib/settings';

interface Props {
  t: Strings;
  lang: Lang;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onPlayComputer: () => void;
  onPlayLocal: () => void;
  /** Null when this build has no online server configured. */
  onPlayOnline: (() => void) | null;
  onOpenSettings: () => void;
  onOpenRules: () => void;
}

export function Home({ t, lang, settings, onChange, onPlayComputer, onPlayLocal, onPlayOnline, onOpenSettings, onOpenRules }: Props) {
  const record = settings.record[settings.level];
  const colors: { id: ColorChoice; label: string }[] = [
    { id: 'white', label: t.white },
    { id: 'black', label: t.black },
    { id: 'random', label: t.random },
  ];

  return (
    <main className="home">
      <header className="home-head">
        <h1 className="wordmark">Dama</h1>
        <p className="tagline">{t.tagline}</p>
      </header>

      <section className="mode mode-primary" aria-labelledby="vs-computer">
        <h2 id="vs-computer">{t.vsComputer}</h2>
        <p className="hint">{t.vsComputerHint}</p>

        <fieldset className="levels">
          <legend>{t.level}</legend>
          <div className="level-row" style={{ gridTemplateColumns: `repeat(${PLAYABLE_LEVELS.length}, 1fr)` }}>
            {PLAYABLE_LEVELS.map((level) => (
              <button
                key={level.id}
                type="button"
                className="level"
                aria-pressed={settings.level === level.id}
                onClick={() => onChange({ level: level.id })}
              >
                <span className="level-stack" aria-hidden="true">
                  {Array.from({ length: level.id }, (_, i) => (
                    <span key={i} className="chip" />
                  ))}
                </span>
                <span className="level-name">{level.name[lang]}</span>
              </button>
            ))}
          </div>
          {record && record.played > 0 && <p className="record">{format(t.record, record)}</p>}
        </fieldset>

        <fieldset className="colors">
          <legend>{t.yourColor}</legend>
          <div className="segmented">
            {colors.map((c) => (
              <button key={c.id} type="button" aria-pressed={settings.color === c.id} onClick={() => onChange({ color: c.id })}>
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        <button type="button" className="cta" onClick={onPlayComputer}>
          {t.start}
        </button>
      </section>

      <button type="button" className="mode mode-secondary" onClick={onPlayLocal}>
        <span className="mode-title">{t.twoPlayers}</span>
        <span className="hint">{t.twoPlayersHint}</span>
      </button>

      {onPlayOnline ? (
        <button type="button" className="mode mode-secondary" onClick={onPlayOnline}>
          <span className="mode-title">{t.online}</span>
          <span className="hint">{t.onlineHint}</span>
        </button>
      ) : (
        <div className="mode mode-secondary is-disabled" aria-disabled="true">
          <span className="mode-title">{t.online}</span>
          <span className="hint">{t.onlineSoon}</span>
        </div>
      )}

      <footer className="home-foot">
        <button type="button" className="link" onClick={onOpenRules}>
          {t.rules}
        </button>
        <button type="button" className="link" onClick={onOpenSettings}>
          {t.settings}
        </button>
      </footer>
    </main>
  );
}
