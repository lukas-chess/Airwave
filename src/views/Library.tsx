import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { addTracks, getFile, supportsPersistentFiles, LibTrack } from '../data/library';
import { engine, DeckId } from '../audio/engine';

const fmt = (s: number) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–');

export default function Library() {
  const [tracks, setTracks] = useState<LibTrack[]>([]);
  const [msg, setMsg] = useState('');
  const reload = () => db.all<LibTrack>('tracks').then((t) => setTracks(t.sort((a, b) => a.title.localeCompare(b.title))));
  useEffect(() => { reload(); }, []);

  const guard = async (fn: () => Promise<unknown>) => { try { setMsg(''); await fn(); } catch (e) { setMsg((e as Error).message); } };
  const send = (t: LibTrack, to: DeckId | 'Q') => guard(async () => {
    const f = await getFile(t);
    if (to === 'Q') engine.enqueue(t, f); else engine.load(to, t, f);
    setMsg(to === 'Q' ? `„${t.title}“ in der Warteschlange` : `„${t.title}“ in Player ${to} geladen`);
  });

  return (
    <section className="card">
      <h2>Library</h2>
      <div className="row">
        <button className="primary" onClick={() => guard(async () => { const n = await addTracks(); if (n.length) setMsg(`${n.length} Titel hinzugefügt`); reload(); })}>Musik hinzufügen</button>
      </div>
      {!supportsPersistentFiles() && <p className="warn">Dieser Browser kann Dateiverweise nicht dauerhaft speichern. Nach einem Neuladen müssen Dateien neu ausgewählt werden.</p>}
      {msg && <p className="muted">{msg}</p>}
      {tracks.length === 0 && <p className="muted">Noch keine Musik. Wähle Dateien von deinem Gerät aus – sie werden nicht kopiert und nicht hochgeladen.</p>}
      {tracks.map((t) => (
        <div className="track" key={t.id}>
          <div><b>{t.title}</b><div className="muted">{t.artist || 'Unbekannt'} · {fmt(t.duration)}</div></div>
          <div className="row">
            <button onClick={() => send(t, 'A')}>A</button>
            <button onClick={() => send(t, 'B')}>B</button>
            <button onClick={() => send(t, 'Q')}>+ Queue</button>
            <button onClick={() => guard(async () => { await db.del('tracks', t.id); reload(); })}>✕</button>
          </div>
        </div>
      ))}
    </section>
  );
}
