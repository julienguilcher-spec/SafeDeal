/* =====================================================================================
 * Scènes spatialisées rendues hors ligne (banc d'essai — hors jeu livré).
 *
 * Le MOTEUR complet (voix, atténuation, panoramique, passe-bas, Doppler, limiteur) est branché
 * sur un OfflineAudioContext stéréo ; le rendu est suspendu toutes les 50 ms pour faire avancer
 * la scène et appeler engine.update(), exactement comme le fait frame() en temps réel. On
 * obtient un enregistrement déterministe sur lequel mesurer ce que la spatialisation produit.
 * ===================================================================================== */

import { AudioEngine } from '../engine';
import { drawSpectrogram, drawWaveform, dominantFrequency, stft } from './analysis';

export interface SceneResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  seconds: number;
}

export type SceneStep = (engine: AudioEngine, t: number, dt: number) => void;

export async function renderScene(seconds: number, setup: (engine: AudioEngine) => void, step: SceneStep, sampleRate = 44100): Promise<SceneResult> {
  const ac = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const engine = new AudioEngine();
  engine.attach(ac, false);
  engine.setVolumes(1, 1, 1, 1);
  setup(engine);
  const dt = 0.05;
  for (let t = dt; t < seconds - 0.01; t += dt) {
    const at = t;
    void ac.suspend(at).then(() => {
      step(engine, at, dt);
      engine.update(dt);
      void ac.resume();
    });
  }
  const buf = await ac.startRendering();
  return { left: buf.getChannelData(0), right: buf.getChannelData(1), sampleRate, seconds };
}

function rms(d: Float32Array, sr: number, t0: number, t1: number): number {
  const a = Math.max(0, Math.floor(t0 * sr));
  const b = Math.min(d.length, Math.floor(t1 * sr));
  let s = 0;
  for (let i = a; i < b; i++) s += d[i]! * d[i]!;
  return Math.sqrt(s / Math.max(1, b - a));
}

/** Part de l'énergie au-dessus de `fc` dans la tranche [t0, t1] (filtre passe-haut à un pôle). */
function highShare(d: Float32Array, sr: number, t0: number, t1: number, fc: number): number {
  const a = Math.max(0, Math.floor(t0 * sr));
  const b = Math.min(d.length, Math.floor(t1 * sr));
  const k = 1 - Math.exp((-2 * Math.PI * fc) / sr);
  let lp = 0;
  let high = 0;
  let all = 0;
  for (let i = a; i < b; i++) {
    lp += k * (d[i]! - lp);
    const h = d[i]! - lp;
    high += h * h;
    all += d[i]! * d[i]!;
  }
  return all > 0 ? high / all : 0;
}

function peak(d: Float32Array): number {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]!));
  return m;
}

export interface PassByReport {
  /** Niveau efficace gauche / droite au début (véhicule à l'ouest), au milieu, à la fin (à l'est). */
  startL: number; startR: number;
  midL: number; midR: number;
  endL: number; endR: number;
  /** Note grave de la sirène (435 Hz à l'arrêt) mesurée à l'approche puis à l'éloignement. */
  lowApproach: number;
  lowRecede: number;
  peak: number;
}

/**
 * Passage d'une voiture de police, sirène en marche, à 20 m/s (72 km/h) devant l'auditeur.
 * L'auditeur est à l'origine et regarde vers le sud (+z) : l'ouest (−x) est à sa droite. Le
 * véhicule roule d'ouest en est sur une rue à 15 m devant lui.
 */
export async function scenePassBy(canvas?: HTMLCanvasElement): Promise<PassByReport> {
  const seconds = 12;
  const speed = 20;
  let handle = 0;
  const xAt = (t: number): number => -120 + speed * t;
  const r = await renderScene(
    seconds,
    (e) => {
      e.setListener(0, 1.7, 0, 0);
      handle = e.play('sirene_police', { x: xAt(0), y: 1.8, z: 15, loop: true }, { doppler: true });
    },
    (e, t) => {
      e.setVoicePosition(handle, xAt(t), 1.8, 15);
      e.setVoiceVelocity(handle, speed, 0);
    },
  );
  const sr = r.sampleRate;
  const mono = new Float32Array(r.left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (r.left[i]! + r.right[i]!);
  const s = stft(mono, sr, 8192, 1024);
  const rep: PassByReport = {
    startL: rms(r.left, sr, 1, 3), startR: rms(r.right, sr, 1, 3),
    midL: rms(r.left, sr, 5.5, 6.5), midR: rms(r.right, sr, 5.5, 6.5),
    endL: rms(r.left, sr, 9, 11), endR: rms(r.right, sr, 9, 11),
    // la note grave est la plus basse des deux : on cherche le maximum sous 500 Hz
    lowApproach: dominantFrequency(s, 1.5, 3.5, 400, 500),
    lowRecede: dominantFrequency(s, 8.5, 10.5, 380, 440),
    peak: Math.max(peak(r.left), peak(r.right)),
  };
  if (canvas) {
    const w = 1200;
    canvas.width = w;
    canvas.height = 560;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#0b0e14';
    g.fillRect(0, 0, w, canvas.height);
    g.fillStyle = '#e8edf5';
    g.font = 'bold 15px sans-serif';
    g.textBaseline = 'top';
    g.fillText("Scène spatialisée (moteur complet, rendu hors ligne) — sirène de police passant à 72 km/h, d'ouest (droite) en est (gauche)", 10, 8);
    g.font = '12px monospace';
    g.fillStyle = '#9fb0c8';
    g.fillText('canal GAUCHE', 10, 34);
    drawWaveform(g, 10, 50, w - 20, 60, r.left);
    g.fillText('canal DROIT', 10, 116);
    drawWaveform(g, 10, 132, w - 20, 60, r.right);
    g.fillText(
      `note grave mesurée : ${rep.lowApproach.toFixed(1)} Hz à l'approche, ${rep.lowRecede.toFixed(1)} Hz à l'éloignement (435 Hz à l'arrêt) — Doppler attendu : ×${(343 / (343 - speed)).toFixed(3)} puis ×${(343 / (343 + speed)).toFixed(3)}`,
      10, 200,
    );
    drawSpectrogram(g, 10, 220, w - 20, 330, mono, sr, { log: false, fMin: 300, fMax: 1600, fftSize: 4096, hop: 512, guides: [435, 580], dbMin: -80, dbMax: -15 });
  }
  return rep;
}

export interface OcclusionReport {
  openRms: number;
  hiddenRms: number;
  reopenedRms: number;
  openHigh: number;
  hiddenHigh: number;
}

/** Un canon à eau à 20 m ; un mur masque la source de 2 à 4 s, puis disparaît. */
export async function sceneOcclusion(): Promise<OcclusionReport> {
  let wall = false;
  const r = await renderScene(
    6,
    (e) => {
      e.setListener(0, 1.7, 0, 0);
      e.lineOfSight = () => !wall;
      e.play('canon_eau', { x: 0, y: 1.7, z: 20, loop: true });
    },
    (_e, t) => {
      wall = t >= 2 && t < 4;
    },
  );
  const sr = r.sampleRate;
  return {
    openRms: rms(r.left, sr, 1, 2),
    hiddenRms: rms(r.left, sr, 3, 4),
    reopenedRms: rms(r.left, sr, 5, 6),
    openHigh: highShare(r.left, sr, 1, 2, 2000),
    hiddenHigh: highShare(r.left, sr, 3, 4, 2000),
  };
}

export interface DistanceReport {
  /** Niveau efficace d'un même son joué à 5, 20, 80 et 320 m. */
  levels: number[];
  /** Instant d'arrivée du son (s) à chaque distance : retard de propagation. */
  onsets: number[];
}

/** Une même détonation à 5, 20, 80 et 320 m : atténuation et retard de propagation. */
export async function sceneDistance(): Promise<DistanceReport> {
  const dists = [5, 20, 80, 320];
  const levels: number[] = [];
  const onsets: number[] = [];
  for (const d of dists) {
    const r = await renderScene(
      2.6,
      (e) => {
        e.setListener(0, 1.7, 0, 0);
        e.play('detonation', { x: 0, y: 1.7, z: d });
      },
      () => undefined,
    );
    levels.push(rms(r.left, r.sampleRate, 0, 2.6));
    let first = -1;
    const thr = 0.02 * peak(r.left);
    for (let i = 0; i < r.left.length; i++) {
      if (Math.abs(r.left[i]!) > thr) {
        first = i;
        break;
      }
    }
    onsets.push(first / r.sampleRate);
  }
  return { levels, onsets };
}

export interface StressReport {
  peak: number;
  rms: number;
  voices: number;
}

/**
 * Salve : une trentaine de détonations, tirs et explosions déclenchés au même instant à quelques
 * mètres de l'auditeur. Mesure la crête en sortie : le limiteur doit tenir la pleine échelle.
 */
export async function sceneStress(): Promise<StressReport> {
  let voices = 0;
  const r = await renderScene(
    3,
    (e) => {
      e.setListener(0, 1.7, 0, 0);
      const kinds: [string, number][] = [
        ['detonation', 4], ['desencerclement', 4], ['tir_arme', 6], ['mortier_explosion', 6], ['explosion_vehicule', 3], ['petard', 6],
      ];
      let i = 0;
      for (const [id, n] of kinds) {
        for (let k = 0; k < n; k++, i++) {
          // moitié à gauche, moitié à droite, entre 2 et 6 m
          e.play(id, { x: (i % 2 ? 1 : -1) * (2 + (i % 5)), y: 1.7, z: 1 + (i % 3) }, { noDedup: true });
        }
      }
      voices = e.stats().real;
    },
    () => undefined,
  );
  return {
    peak: Math.max(peak(r.left), peak(r.right)),
    rms: Math.max(rms(r.left, r.sampleRate, 0, 1), rms(r.right, r.sampleRate, 0, 1)),
    voices,
  };
}
