// Dateien werden NICHT kopiert: Wir merken uns nur einen Verweis (Datei-Handle) und Metadaten.
import { db } from './db';
import type { TrackInfo } from '../audio/engine';

export interface LibTrack extends TrackInfo { fileName: string; handle?: any } // handle: FileSystemFileHandle
const sessionFiles = new Map<string, File>(); // Fallback-Dateiauswahl: gilt nur bis zum Neuladen

const hasFSA = () => 'showOpenFilePicker' in window;
export const supportsPersistentFiles = hasFSA;

function pickFallback(): Promise<File[]> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.multiple = true; i.accept = 'audio/*';
    i.onchange = () => resolve(Array.from(i.files ?? []));
    i.click();
  });
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio(), url = URL.createObjectURL(file);
    const done = (d: number) => { URL.revokeObjectURL(url); resolve(d); };
    a.preload = 'metadata'; a.src = url;
    a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 5000);
  });
}

// "Interpret - Titel.mp3" -> Interpret + Titel (ID3-Tags kommen in einer späteren Version)
function parseName(name: string) {
  const base = name.replace(/\.[^.]+$/, '');
  const [a, ...rest] = base.split(' - ');
  return rest.length ? { artist: a.trim(), title: rest.join(' - ').trim() } : { artist: '', title: base };
}

export async function addTracks(): Promise<LibTrack[]> {
  let entries: { file: File; handle?: any }[];
  try {
    if (hasFSA()) {
      const handles = await (window as any).showOpenFilePicker({
        multiple: true,
        types: [{ description: 'Audio', accept: { 'audio/*': ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus'] } }],
      });
      entries = await Promise.all(handles.map(async (h: any) => ({ handle: h, file: await h.getFile() })));
    } else entries = (await pickFallback()).map((file) => ({ file }));
  } catch (e) {
    if ((e as Error).name === 'AbortError') return []; // Auswahl abgebrochen
    throw e;
  }
  const out: LibTrack[] = [];
  for (const { file, handle } of entries) {
    const t: LibTrack = {
      id: crypto.randomUUID(), fileName: file.name, ...parseName(file.name),
      duration: await readDuration(file), handle,
    };
    if (!handle) sessionFiles.set(t.id, file);
    await db.put('tracks', t);
    out.push(t);
  }
  return out;
}

/** Liefert die echte Datei. Fragt bei Bedarf erneut nach Erlaubnis (nur per Klick möglich). */
export async function getFile(t: LibTrack): Promise<File> {
  if (t.handle) {
    const opts = { mode: 'read' };
    let p = await t.handle.queryPermission(opts);
    if (p !== 'granted') p = await t.handle.requestPermission(opts);
    if (p !== 'granted') throw new Error('Zugriff auf die Datei wurde nicht erlaubt.');
    try { return await t.handle.getFile(); } catch { throw new Error(`„${t.fileName}“ wurde nicht gefunden (verschoben oder gelöscht?).`); }
  }
  const f = sessionFiles.get(t.id);
  if (!f) throw new Error(`„${t.fileName}“ muss neu ausgewählt werden (dieser Browser merkt sich Dateien nicht dauerhaft).`);
  return f;
}
