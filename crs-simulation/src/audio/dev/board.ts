/* =====================================================================================
 * Planches de spectrogrammes et contrôles hors ligne (banc d'essai — hors jeu livré).
 * ===================================================================================== */

import { soundDef } from '../catalog';
import { drawSpectrogram, drawWaveform, measure, stft, dominantFrequency, type SignalMetrics, type SpectroOpts } from './analysis';
import { renderOffline, type OfflineOpts, type OfflineResult } from './offline';

export interface RenderReport extends SignalMetrics {
  id: string;
  declared: number;
  seconds: number;
  lead: number;
  loop: boolean;
}

const cache = new Map<string, OfflineResult>();

function key(id: string, o: OfflineOpts): string {
  return id + '|' + JSON.stringify(o);
}

/** Rend un son hors ligne (résultat gardé pour les planches) et retourne ses mesures. */
export async function renderAndMeasure(id: string, o: OfflineOpts = {}): Promise<RenderReport> {
  const k = key(id, o);
  let r = cache.get(k);
  if (!r) {
    r = await renderOffline(id, o);
    cache.set(k, r);
  }
  const m = measure(r.data, r.sampleRate);
  return { id, declared: r.declared, seconds: r.seconds, lead: r.lead, loop: o.loop ?? false, ...m };
}

/** Fréquence dominante mesurée dans une tranche de temps (pour vérifier les notes des sirènes). */
export async function measureTone(id: string, t0: number, t1: number, fMin: number, fMax: number, o: OfflineOpts = {}): Promise<number> {
  const r = cache.get(key(id, o)) ?? (await renderOffline(id, o));
  cache.set(key(id, o), r);
  const s = stft(r.data, r.sampleRate, 8192, 512);
  return dominantFrequency(s, t0, t1, fMin, fMax);
}

export interface BoardOpts {
  cols?: number;
  cellW?: number;
  cellH?: number;
  title?: string;
  render?: OfflineOpts;
  /** Options de rendu propres à chaque case (même indice que `ids`) : texte d'un slogan, hauteur… */
  renders?: OfflineOpts[];
  /** Sous-titre de chaque case (même indice que `ids`). */
  notes?: string[];
  spectro?: SpectroOpts;
}

/** Dessine une planche (une case par son : titre, forme d'onde, spectrogramme) sur le canvas donné. */
export async function drawBoard(canvas: HTMLCanvasElement, ids: readonly string[], o: BoardOpts = {}): Promise<void> {
  const cols = o.cols ?? 4;
  const cw = o.cellW ?? 400;
  const ch = o.cellH ?? 270;
  const rows = Math.ceil(ids.length / cols);
  const head = o.title ? 30 : 0;
  canvas.width = cols * cw;
  canvas.height = head + rows * ch;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#0b0e14';
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (o.title) {
    g.fillStyle = '#e8edf5';
    g.font = 'bold 16px sans-serif';
    g.textBaseline = 'middle';
    g.fillText(o.title, 10, 15);
  }
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const ro = (o.renders && o.renders[i]) ?? o.render ?? {};
    const rep = await renderAndMeasure(id, ro);
    const r = cache.get(key(id, ro))!;
    const x = (i % cols) * cw;
    const y = head + Math.floor(i / cols) * ch;
    const def = soundDef(id);
    g.fillStyle = '#e8edf5';
    g.font = 'bold 13px sans-serif';
    g.textBaseline = 'top';
    g.fillText(`${id} — ${o.notes && o.notes[i] ? o.notes[i] : def ? def.label : '?'}`, x + 6, y + 5);
    g.font = '11px monospace';
    g.fillStyle = '#9fb0c8';
    const dur = Number.isFinite(rep.declared) ? rep.declared.toFixed(2) + ' s' : 'boucle';
    g.fillText(`durée ${dur} · fenêtre ${rep.seconds.toFixed(2)} s · crête ${rep.peak.toFixed(2)} · eff. ${rep.rms.toFixed(3)}`, x + 6, y + 22);
    drawWaveform(g, x + 6, y + 38, cw - 12, 34, r.data);
    drawSpectrogram(g, x + 6, y + 76, cw - 12, ch - 84, r.data, r.sampleRate, o.spectro);
    g.strokeStyle = '#263042';
    g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
  }
}
