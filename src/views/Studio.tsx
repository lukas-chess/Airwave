import { useEffect, useState } from 'react';
import { engine, DeckId } from '../audio/engine';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function useTick() { // Oberfläche regelmäßig neu zeichnen (Zeit, Pegel)
  const [, set] = useState(0);
  useEffect(() => {
    const bump = () => set((n) => n + 1);
    const i = setInterval(bump, 80), un = engine.subscribe(bump);
    return () => { clearInterval(i); un(); };
  }, []);
}

const Meter = ({ level }: { level: number }) => <div className="meter"><i style={{ width: `${level * 100}%` }} /></div>;

function Deck({ id, advanced }: { id: DeckId; advanced: boolean }) {
  const d = engine.info(id);
  return (
    <section className="card">
      <h3>Player {id}</h3>
      <div className="title">{d.title || '— leer —'}</div>
      <div className="muted">{d.artist || '\u00a0'}</div>
      <input type="range" min={0} max={d.duration || 1} step={0.1} value={d.time} onChange={(e) => engine.seek(id, +e.target.value)} />
      <div className="row"><span>{fmt(d.time)}</span><span>-{fmt(Math.max(0, d.duration - d.time))}</span></div>
      <button className="primary" onClick={() => (d.playing ? engine.pause(id) : engine.play(id))}>{d.playing ? 'Pause' : 'Play'}</button>
      <label className="row">Lautstärke
        <input type="range" min={0} max={1} step={0.01} value={d.volume} onChange={(e) => engine.setVolume(id, +e.target.value)} />
      </label>
      {advanced && <Meter level={engine.level(id)} />}
    </section>
  );
}

export default function Studio() {
  useTick();
  const [advanced, setAdvanced] = useState(false);
  const next = engine.queue[0]?.track;
  return (
    <>
      <div className="row">
        <h2>Studio</h2>
        <button onClick={() => setAdvanced(!advanced)}>{advanced ? 'Simple Studio' : 'Advanced Studio'}</button>
      </div>
      {engine.lastError && <p className="warn">{engine.lastError}</p>}
      <div className="grid2"><Deck id="A" advanced={advanced} /><Deck id="B" advanced={advanced} /></div>
      <section className="card">
        <label className="row">A
          <input type="range" min={0} max={1} step={0.01} value={engine.crossfader()} onChange={(e) => engine.setCrossfader(+e.target.value)} />B
        </label>
        {advanced && (
          <>
            <label className="row">Master
              <input type="range" min={0} max={1} step={0.01} value={engine.masterVolume} onChange={(e) => engine.setMaster(+e.target.value)} />
            </label>
            <Meter level={engine.level('master')} />
            <p className="muted">Übergangszeit: {engine.fadeSeconds} s · Automatik: {engine.auto ? 'an' : 'aus'} (in Settings änderbar)</p>
          </>
        )}
      </section>
      <section className="card">
        <div className="row"><h3>Warteschlange</h3><span>
          <button onClick={() => engine.skip()} disabled={!engine.queue.length}>Nächster Titel</button>{' '}
          <button onClick={() => engine.clearQueue()}>Leeren</button></span></div>
        <p className="muted">Als Nächstes: {next ? `${next.title}${next.artist ? ' – ' + next.artist : ''}` : '—'}</p>
        {engine.queue.map((q, i) => (
          <div className="track" key={i}><span>{q.track.title}</span><button onClick={() => engine.removeFromQueue(i)}>✕</button></div>
        ))}
      </section>
    </>
  );
}
