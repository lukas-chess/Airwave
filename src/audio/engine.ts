// AIRWAVE Audio-Engine: ein AudioContext, zwei Player (A/B), Crossfader, Master, Auto-Übergänge.
export type DeckId = 'A' | 'B';
export interface TrackInfo { id: string; title: string; artist: string; duration: number }
interface QItem { track: TrackInfo; file: Blob }

const other = (d: DeckId): DeckId => (d === 'A' ? 'B' : 'A');
// Gleichmäßige Lautstärke beim Überblenden (Equal-Power): x=0 nur A, x=1 nur B
const xGains = (x: number) => [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)];

class Deck {
  el = new Audio(); // streamt die Datei, lädt sie nicht komplett in den RAM
  vol: GainNode; xf: GainNode; analyser: AnalyserNode;
  track: TrackInfo | null = null;
  volume = 1;
  private url: string | null = null;
  constructor(ctx: AudioContext, out: AudioNode) {
    this.el.preload = 'auto';
    const src = ctx.createMediaElementSource(this.el);
    this.vol = ctx.createGain(); this.xf = ctx.createGain();
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024;
    src.connect(this.vol); this.vol.connect(this.xf); this.xf.connect(this.analyser); this.analyser.connect(out);
  }
  load(track: TrackInfo, file: Blob) {
    const old = this.url;
    this.url = URL.createObjectURL(file);
    this.el.src = this.url; this.track = track;
    if (old) URL.revokeObjectURL(old);
  }
  release() {
    this.el.pause();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null; this.el.removeAttribute('src'); this.el.load(); this.track = null;
  }
}

export class AudioEngine {
  queue: QItem[] = [];
  fadeSeconds = 6;
  auto = true;
  lastError = '';
  masterVolume = 1;
  private ctx?: AudioContext;
  private decks!: Record<DeckId, Deck>;
  private master!: GainNode;
  private masterAn!: AnalyserNode;
  private buf = new Float32Array(1024);
  private xPos = 0; // 0 = A, 1 = B
  private fade: { t0: number; t1: number; x0: number; x1: number } | null = null;
  private busy = false; // true während ein Übergang läuft
  private subs = new Set<() => void>();

  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { this.subs.forEach((f) => f()); }

  /** Muss durch einen Klick ausgelöst werden (Browser-Regel, besonders iOS). */
  start() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain(); this.masterAn = ctx.createAnalyser();
      this.master.connect(this.masterAn); this.masterAn.connect(ctx.destination);
      this.decks = { A: new Deck(ctx, this.master), B: new Deck(ctx, this.master) };
      (['A', 'B'] as DeckId[]).forEach((id) => this.wire(id));
      this.applyX(this.xPos);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private wire(id: DeckId) {
    const el = this.decks[id].el;
    el.addEventListener('timeupdate', () => this.check(id));
    el.addEventListener('ended', () => { if (!this.busy && this.queue.length) void this.transition(id, 0.05); this.emit(); });
    el.addEventListener('error', () => {
      this.lastError = `Datei nicht lesbar: ${this.decks[id].track?.title ?? ''}`;
      if (!this.busy && this.queue.length && el.currentSrc) void this.transition(id, 0.05);
      this.emit();
    });
    ['play', 'pause', 'loadedmetadata'].forEach((ev) => el.addEventListener(ev, () => this.emit()));
  }

  private fadeLen(dur: number) { return Math.max(0.05, Math.min(this.fadeSeconds, dur / 2)); } // kurze Titel: Fade max. halbe Länge

  private check(id: DeckId) {
    const el = this.decks[id].el;
    if (!this.auto || this.busy || el.paused || !this.queue.length || !isFinite(el.duration)) return;
    const f = this.fadeLen(el.duration);
    if (el.duration - el.currentTime <= f) void this.transition(id, f);
  }

  private async transition(from: DeckId, f: number) {
    if (this.busy) return;
    this.busy = true;
    const ctx = this.start();
    const to = other(from), dTo = this.decks[to];
    let ok = false;
    while (this.queue.length && !ok) { // nicht abspielbare Titel überspringen
      const q = this.queue.shift()!;
      dTo.load(q.track, q.file);
      try { await dTo.el.play(); ok = true; } catch { this.lastError = `Übersprungen: ${q.track.title}`; }
    }
    if (!ok) { this.busy = false; this.emit(); return; }
    const x0 = this.xPos, x1 = to === 'B' ? 1 : 0, t = ctx.currentTime, n = 64;
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const [ga, gb] = xGains(x0 + ((x1 - x0) * i) / (n - 1)); a[i] = ga; b[i] = gb; }
    for (const [id, curve] of [['A', a], ['B', b]] as [DeckId, Float32Array][]) {
      const g = this.decks[id].xf.gain; g.cancelScheduledValues(t); g.setValueCurveAtTime(curve, t, f);
    }
    const now = performance.now();
    this.fade = { t0: now, t1: now + f * 1000, x0, x1 };
    window.setTimeout(() => {
      this.xPos = x1; this.fade = null; this.busy = false;
      this.decks[from].el.pause();
      this.applyX(x1); this.emit();
    }, f * 1000 + 50);
    this.emit();
  }

  private applyX(x: number) {
    const t = this.ctx!.currentTime, [ga, gb] = xGains(x);
    for (const [id, g] of [['A', ga], ['B', gb]] as [DeckId, number][]) {
      const p = this.decks[id].xf.gain; p.cancelScheduledValues(t); p.setTargetAtTime(g, t, 0.01);
    }
  }

  // ---------- Steuerung ----------
  load(id: DeckId, track: TrackInfo, file: Blob) { this.start(); this.decks[id].load(track, file); this.emit(); }
  play(id: DeckId) {
    this.start();
    this.decks[id].el.play().catch(() => { this.lastError = 'Wiedergabe nicht möglich'; this.emit(); });
  }
  pause(id: DeckId) { this.decks?.[id].el.pause(); }
  seek(id: DeckId, s: number) { if (this.decks) this.decks[id].el.currentTime = s; }
  setVolume(id: DeckId, v: number) {
    this.start(); const d = this.decks[id]; d.volume = v;
    d.vol.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.01); this.emit();
  }
  setMaster(v: number) { this.start(); this.masterVolume = v; this.master.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.01); this.emit(); }
  setCrossfader(x: number) { if (this.fade) return; this.start(); this.xPos = x; this.applyX(x); this.emit(); }
  crossfader() {
    const f = this.fade; if (!f) return this.xPos;
    return f.x0 + (f.x1 - f.x0) * Math.min(1, (performance.now() - f.t0) / (f.t1 - f.t0));
  }
  skip() { // nächster Titel aus der Warteschlange
    this.start();
    const playing = (['A', 'B'] as DeckId[]).find((d) => !this.decks[d].el.paused);
    const from = playing ?? (this.xPos < 0.5 ? 'B' : 'A');
    void this.transition(from, playing ? Math.min(this.fadeSeconds, 2) : 0.05);
  }
  enqueue(track: TrackInfo, file: Blob) { this.queue.push({ track, file }); this.emit(); }
  removeFromQueue(i: number) { this.queue.splice(i, 1); this.emit(); }
  clearQueue() { this.queue = []; this.emit(); }

  // ---------- Anzeigen ----------
  info(id: DeckId) {
    const d = this.decks?.[id], du = d?.el.duration;
    return {
      title: d?.track?.title ?? '', artist: d?.track?.artist ?? '',
      time: d?.el.currentTime ?? 0, duration: du && isFinite(du) ? du : 0,
      playing: !!d && !d.el.paused, volume: d?.volume ?? 1,
    };
  }
  level(id: DeckId | 'master') { // Pegel 0..1
    const an = !this.ctx ? null : id === 'master' ? this.masterAn : this.decks[id].analyser;
    if (!an) return 0;
    an.getFloatTimeDomainData(this.buf);
    let s = 0; for (const v of this.buf) s += v * v;
    return Math.min(1, Math.sqrt(s / this.buf.length) * 2.5);
  }

  dispose() {
    if (!this.ctx) return;
    (['A', 'B'] as DeckId[]).forEach((d) => this.decks[d].release());
    void this.ctx.close(); this.ctx = undefined;
  }
}

export const engine = new AudioEngine();
