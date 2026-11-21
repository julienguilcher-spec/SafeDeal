/* =====================================================================================
 * Sortie audio : contexte, bus de mixage, limiteur, réglages de volume.
 *
 *   bus  : effets ┐
 *          ambiance ┴→ filtre « monde » (étourdissement, habitacle) → niveau « monde » (pause) ┐
 *          voix ───────────────────────────────────────────────────────────────────────────────┤
 *          interface ──────────────────────────────────────────────────────────────────────────┴→ maître → limiteur → écrêteur doux → sortie
 *
 * Le contexte temps réel n'est créé (ou repris) que pendant un geste de l'utilisateur — règle des
 * navigateurs, stricte sur mobile — et il est suspendu quand la page est masquée. La classe vise
 * un BaseAudioContext quelconque (attach) : AudioContext, OfflineAudioContext ou contexte factice.
 * ===================================================================================== */

import type { BusId } from './catalog';

export class AudioOutput {
  ac: BaseAudioContext | null = null;
  /** Hors navigateur ou module désactivé : tout appel est sans effet. */
  disabled = false;

  protected master: GainNode | null = null;
  protected limiter: DynamicsCompressorNode | null = null;
  protected output: AudioNode | null = null;
  protected worldGain: GainNode | null = null;
  protected worldFilter: BiquadFilterNode | null = null;
  protected buses: Record<BusId, GainNode> | null = null;
  protected analyser: AnalyserNode | null = null;
  /** Le contexte est-il un vrai AudioContext (soumis au déverrouillage par un geste) ? */
  protected realtime = false;

  private volumes = { master: 1, effects: 1, voices: 1, ambience: 1 };
  private worldLevel = 1;
  private muffle = 0;

  // ───────────────────────────── contexte ─────────────────────────────

  /** Le contexte produit-il du son en ce moment ? */
  get running(): boolean {
    const ac = this.ac;
    if (!ac || this.disabled) return false;
    return this.realtime ? ac.state === 'running' : true;
  }

  get now(): number {
    return this.ac ? this.ac.currentTime : 0;
  }

  /** Branche le moteur sur un contexte (bus, limiteur). `realtime` : vrai AudioContext du navigateur. */
  attach(ac: BaseAudioContext, realtime = false): void {
    this.ac = ac;
    this.realtime = realtime;
    const master = ac.createGain();
    const limiter = ac.createDynamicsCompressor();
    // limiteur de sortie : seuil −6 dB, rapport 20:1, attaque quasi instantanée
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    master.connect(limiter);
    // Le compresseur seul laisse passer les toutes premières millisecondes d'une salve (et applique
    // un gain de rattrapage) : un écrêteur doux, linéaire jusqu'à 0,7 et borné à 0,92, garantit
    // qu'aucun échantillon ne dépasse la pleine échelle.
    const clip = ac.createWaveShaper();
    clip.curve = softClipCurve() as Float32Array<ArrayBuffer>;
    limiter.connect(clip);
    clip.connect(ac.destination);
    this.output = clip;
    const worldGain = ac.createGain();
    worldGain.connect(master);
    const worldFilter = ac.createBiquadFilter();
    worldFilter.type = 'lowpass';
    worldFilter.frequency.value = 20000;
    worldFilter.Q.value = 0.5;
    worldFilter.connect(worldGain);
    const mk = (to: AudioNode): GainNode => {
      const g = ac.createGain();
      g.connect(to);
      return g;
    };
    this.buses = { sfx: mk(worldFilter), ambience: mk(worldFilter), voice: mk(master), ui: mk(master) };
    this.master = master;
    this.limiter = limiter;
    this.worldGain = worldGain;
    this.worldFilter = worldFilter;
    this.applyVolumes(true);
    worldGain.gain.value = this.worldLevel;
  }

  /** Crée (au premier geste de l'utilisateur) ou reprend le contexte temps réel. Retourne false si WebAudio est absent. */
  unlock(): boolean {
    if (this.disabled) return false;
    if (!this.ac) {
      const Ctor: typeof AudioContext | undefined =
        (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.disabled = true;
        console.error('[audio] WebAudio indisponible : le jeu sera muet');
        return false;
      }
      try {
        this.attach(new Ctor({ latencyHint: 'interactive' }), true);
      } catch (err) {
        this.disabled = true;
        console.error('[audio] création du contexte audio impossible', err);
        return false;
      }
    }
    const ac = this.ac as AudioContext;
    if (this.realtime && ac.state !== 'running' && typeof ac.resume === 'function') {
      void ac.resume().catch(() => undefined);
      // iOS : un tampon muet joué pendant le geste achève de déverrouiller la sortie
      try {
        const s = ac.createBufferSource();
        s.buffer = ac.createBuffer(1, 1, ac.sampleRate);
        s.connect(ac.destination);
        s.start();
      } catch {
        // sans conséquence
      }
    }
    return true;
  }

  /** Page masquée : on suspend ; page visible : on reprend (si le contexte a déjà été déverrouillé). */
  setPageVisible(visible: boolean): void {
    const ac = this.ac as AudioContext | null;
    if (!ac || !this.realtime) return;
    if (!visible && ac.state === 'running') void ac.suspend().catch(() => undefined);
    else if (visible && ac.state !== 'running' && ac.state !== 'closed') void ac.resume().catch(() => undefined);
  }

  /** Nœud analyseur branché en sortie (banc d'essai). */
  getAnalyser(): AnalyserNode | null {
    if (!this.ac || !this.output) return null;
    if (!this.analyser) {
      this.analyser = this.ac.createAnalyser();
      this.analyser.fftSize = 2048;
      this.output.connect(this.analyser);
    }
    return this.analyser;
  }

  /** Ferme le contexte temps réel et oublie les bus. */
  protected disposeOutput(): void {
    const ac = this.ac as AudioContext | null;
    if (ac && this.realtime && typeof ac.close === 'function' && ac.state !== 'closed') void ac.close().catch(() => undefined);
    this.ac = null;
    this.buses = null;
    this.master = this.limiter = null;
    this.output = null;
    this.worldGain = null;
    this.worldFilter = null;
    this.analyser = null;
  }

  // ───────────────────────────── réglages ─────────────────────────────

  setVolumes(master: number, effects: number, voices: number, ambience: number): void {
    const v = this.volumes;
    v.master = clamp01(master);
    v.effects = clamp01(effects);
    v.voices = clamp01(voices);
    v.ambience = clamp01(ambience);
    this.applyVolumes(false);
  }

  private applyVolumes(immediate: boolean): void {
    if (!this.ac || !this.buses || !this.master) return;
    const t = this.ac.currentTime;
    const v = this.volumes;
    const set = (p: AudioParam, value: number): void => {
      if (immediate) p.value = value;
      else p.setTargetAtTime(value, t, 0.03);
    };
    // 0,8 de réserve avant le limiteur
    set(this.master.gain, v.master * 0.8);
    set(this.buses.sfx.gain, v.effects);
    set(this.buses.ui.gain, v.effects);
    set(this.buses.voice.gain, v.voices);
    set(this.buses.ambience.gain, v.ambience);
  }

  /** Niveau du « monde » (effets + ambiances) : 0 en pause ou dans les menus. */
  setWorldLevel(level: number): void {
    const l = clamp01(level);
    if (l === this.worldLevel) return;
    this.worldLevel = l;
    if (this.ac && this.worldGain) this.worldGain.gain.setTargetAtTime(l, this.ac.currentTime, 0.08);
  }

  /** Étouffement du monde 0..1 (étourdissement par une détonation, habitacle fermé). */
  setMuffle(amount: number): void {
    const m = clamp01(amount);
    if (Math.abs(m - this.muffle) < 0.01) return;
    this.muffle = m;
    if (this.ac && this.worldFilter) {
      const f = Math.pow(20000, 1 - m) * Math.pow(450, m);
      this.worldFilter.frequency.setTargetAtTime(f, this.ac.currentTime, 0.1);
    }
  }
}

let clipCurve: Float32Array | null = null;

/** Courbe de l'écrêteur de sortie : identité jusqu'à ±0,7, puis saturation douce vers ±0,98 (±0,92 à l'entrée ±1). */
function softClipCurve(): Float32Array {
  if (!clipCurve) {
    const n = 2049;
    const knee = 0.7;
    const limit = 0.98;
    clipCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      const y = a <= knee ? a : knee + (limit - knee) * Math.tanh((a - knee) / (limit - knee));
      clipCurve[i] = x < 0 ? -y : y;
    }
  }
  return clipCurve;
}

function clamp01(v: number): number {
  return v > 0 ? (v > 1 ? 1 : v) : 0; // NaN → 0
}
