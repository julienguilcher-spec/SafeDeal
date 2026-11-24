import { describe, expect, it } from 'vitest';
import { TEXTURE_IDS, brownNoise, crackle, getTexture, hasTexture, loopable, pinkNoise, whiteNoise } from '@/audio/textures';
import { renderBabble, renderChoir } from '@/audio/voiceTextures';

function stats(d: Float32Array): { peak: number; rms: number; finite: boolean; dc: number } {
  let peak = 0;
  let sum = 0;
  let dc = 0;
  let finite = true;
  for (let i = 0; i < d.length; i++) {
    const v = d[i]!;
    if (!Number.isFinite(v)) finite = false;
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
    dc += v;
  }
  return { peak, rms: Math.sqrt(sum / d.length), finite, dc: dc / d.length };
}

/** Part de l'énergie sous `fc` (filtre passe-bas à un pôle) : indicateur grossier de couleur. */
function lowShare(d: Float32Array, sr: number, fc: number): number {
  const k = 1 - Math.exp((-2 * Math.PI * fc) / sr);
  let lp = 0;
  let low = 0;
  let all = 0;
  for (let i = 0; i < d.length; i++) {
    lp += k * (d[i]! - lp);
    low += lp * lp;
    all += d[i]! * d[i]!;
  }
  return low / all;
}

describe('textures procédurales', () => {
  it('toutes les textures sont finies, sans écrêtage, non silencieuses et sans composante continue', () => {
    const t0 = performance.now();
    for (const id of TEXTURE_IDS) {
      const tex = getTexture(id);
      const s = stats(tex.data);
      expect(s.finite, id).toBe(true);
      expect(s.peak, id).toBeLessThanOrEqual(0.95);
      expect(s.peak, id).toBeGreaterThan(0.5);
      expect(s.rms, id).toBeGreaterThan(0.01);
      expect(Math.abs(s.dc), id).toBeLessThan(0.02);
      expect(tex.data.length / tex.sampleRate, id).toBeGreaterThanOrEqual(2);
      expect(hasTexture(id)).toBe(true);
    }
    // toutes les textures (voix de foule comprises) se calculent en un temps raisonnable
    expect(performance.now() - t0).toBeLessThan(8000);
  });

  it('les textures sont mises en cache', () => {
    expect(getTexture('babble')).toBe(getTexture('babble'));
  });

  it('génération déterministe (même graine, même signal)', () => {
    expect(Array.from(whiteNoise(0.01, 8000, 5))).toEqual(Array.from(whiteNoise(0.01, 8000, 5)));
    expect(Array.from(renderChoir('a', 0.05, 8000, 9))).toEqual(Array.from(renderChoir('a', 0.05, 8000, 9)));
    expect(Array.from(whiteNoise(0.01, 8000, 5))).not.toEqual(Array.from(whiteNoise(0.01, 8000, 6)));
  });

  it('couleurs de bruit : le brun est plus grave que le rose, lui-même plus grave que le blanc', () => {
    const sr = 22050;
    const w = lowShare(whiteNoise(1, sr, 1), sr, 300);
    const p = lowShare(pinkNoise(1, sr, 1), sr, 300);
    const b = lowShare(brownNoise(1, sr, 1), sr, 300);
    expect(p).toBeGreaterThan(w * 3);
    expect(b).toBeGreaterThan(p * 1.5);
  });

  it('raccord de boucle : pas de saut entre la fin et le début d’un bruit bouclé', () => {
    for (const d of [pinkNoise(1, 22050, 3), brownNoise(1, 22050, 3)]) {
      // écart typique entre échantillons voisins
      let typical = 0;
      for (let i = 1; i < d.length; i++) typical += Math.abs(d[i]! - d[i - 1]!);
      typical /= d.length;
      const jump = Math.abs(d[0]! - d[d.length - 1]!);
      expect(jump).toBeLessThan(typical * 12);
    }
  });

  it('loopable() fond la queue dans le début et raccourcit le tampon', () => {
    const src = new Float32Array(100).fill(1);
    const out = loopable(src, 20);
    expect(out.length).toBe(80);
    // fondu à puissance constante de deux signaux identiques : entre 1 et √2
    for (let i = 0; i < 20; i++) {
      expect(out[i]!).toBeGreaterThanOrEqual(0.999);
      expect(out[i]!).toBeLessThanOrEqual(1.4143);
    }
    expect(out[50]).toBe(1);
  });

  it('le crépitement est fait d’événements brefs (signal très impulsif)', () => {
    const d = crackle(2, 22050, 4);
    const s = stats(d);
    expect(s.peak / s.rms).toBeGreaterThan(8);
  });

  it('le chœur tenu boucle sans claquement (périodicité des voix)', () => {
    const sr = 22050;
    const d = renderChoir('a', 1.2, sr, 7);
    let typical = 0;
    for (let i = 1; i < d.length; i++) typical += Math.abs(d[i]! - d[i - 1]!);
    typical /= d.length;
    expect(Math.abs(d[0]! - d[d.length - 1]!)).toBeLessThan(typical * 8);
    // et il est tenu : pas de trou dans l'enveloppe
    const seg = Math.floor(d.length / 8);
    for (let k = 0; k < 8; k++) expect(stats(d.subarray(k * seg, (k + 1) * seg)).rms).toBeGreaterThan(0.03);
  });

  it('le brouhaha est modulé comme de la parole (ni silence, ni bruit constant)', () => {
    const sr = 16000;
    const d = renderBabble(4, sr, 21, 6);
    const win = Math.floor(sr * 0.05);
    const env: number[] = [];
    for (let i = 0; i + win <= d.length; i += win) env.push(stats(d.subarray(i, i + win)).rms);
    const mean = env.reduce((a, b) => a + b, 0) / env.length;
    const sd = Math.sqrt(env.reduce((a, b) => a + (b - mean) * (b - mean), 0) / env.length);
    expect(mean).toBeGreaterThan(0.02);
    expect(sd / mean).toBeGreaterThan(0.2);
    // l'énergie est dans la bande de la voix
    expect(lowShare(d, sr, 2500)).toBeGreaterThan(0.6);
  });
});
