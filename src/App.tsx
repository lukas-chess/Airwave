import { useEffect, useState } from 'react';
import Studio from './views/Studio';
import Library from './views/Library';
import { db } from './data/db';
import { engine } from './audio/engine';

const NAV = [
  ['studio', 'Studio'], ['library', 'Library'], ['scheduler', 'Scheduler'], ['automation', 'Automation'],
  ['production', 'Production'], ['analytics', 'Analytics'], ['settings', 'Settings'],
] as const;
type Page = (typeof NAV)[number][0];
interface Prefs { theme: 'dark' | 'light'; fade: number; auto: boolean }
const DEFAULTS: Prefs = { theme: 'dark', fade: 6, auto: true };

export default function App() {
  const [page, setPage] = useState<Page>('studio');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => { db.get<{ key: string; value: Prefs }>('settings', 'prefs').then((r) => r && setPrefs({ ...DEFAULTS, ...r.value })).catch(() => {}); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    engine.fadeSeconds = prefs.fade; engine.auto = prefs.auto;
  }, [prefs]);
  const save = (p: Prefs) => { setPrefs(p); db.put('settings', { key: 'prefs', value: p }).catch(() => {}); };

  return (
    <div className="app">
      <nav>
        <div className="logo">AIRWAVE</div>
        {NAV.map(([id, label]) => (
          <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}>{label}</button>
        ))}
      </nav>
      <main>
        {page === 'studio' && <Studio />}
        {page === 'library' && <Library />}
        {page === 'settings' && (
          <section className="card">
            <h2>Settings</h2>
            <label className="row">Darstellung
              <button onClick={() => save({ ...prefs, theme: prefs.theme === 'dark' ? 'light' : 'dark' })}>
                {prefs.theme === 'dark' ? 'Hell umschalten' : 'Dunkel umschalten'}
              </button>
            </label>
            <label className="row">Übergangszeit: {prefs.fade} s
              <input type="range" min={1} max={15} value={prefs.fade} onChange={(e) => save({ ...prefs, fade: +e.target.value })} />
            </label>
            <label className="row">Automatische Übergänge
              <input type="checkbox" checked={prefs.auto} onChange={(e) => save({ ...prefs, auto: e.target.checked })} />
            </label>
            <p className="muted">Alle Daten bleiben auf diesem Gerät. AIRWAVE sendet nichts ins Internet.</p>
          </section>
        )}
        {!['studio', 'library', 'settings'].includes(page) && (
          <section className="card"><h2>{NAV.find((n) => n[0] === page)![1]}</h2><p className="muted">Platzhalter: Dieser Bereich ist noch nicht gebaut.</p></section>
        )}
      </main>
    </div>
  );
}
