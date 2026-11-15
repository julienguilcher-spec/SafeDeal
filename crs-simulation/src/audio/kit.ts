/* =====================================================================================
 * Kit de construction des recettes — petite boîte à outils au-dessus de WebAudio.
 *
 * Une recette reçoit un Kit lié à un BaseAudioContext quelconque (temps réel OU hors ligne),
 * à un nœud de sortie et à un instant de départ ; elle y branche oscillateurs, bruits, filtres
 * et enveloppes, puis retourne sa durée. Le Kit garde la trace des sources pour pouvoir les
 * arrêter (fin naturelle, coupure anticipée, voix évincée) et des paramètres « detune » pour
 * l'effet Doppler.
 * ===================================================================================== */

import { getTexture, type TextureId } from './textures';

export type NoiseKind = 'white' | 'pink' | 'brown';

const bufferCache = new WeakMap<BaseAudioContext, Map<TextureId, AudioBuffer>>();

/** AudioBuffer d'une texture procédurale pour ce contexte (copié une seule fois par contexte). */
export function textureBuffer(ac: BaseAudioContext, id: TextureId): AudioBuffer {
  let map = bufferCache.get(ac);
  if (!map) {
    map = new Map();
    bufferCache.set(ac, map);
  }
  let buf = map.get(id);
  if (!buf) {
    const tex = getTexture(id);
    buf = ac.createBuffer(1, tex.data.length, tex.sampleRate);
    buf.getChannelData(0).set(tex.data);
    map.set(id, buf);
  }
  return buf;
}

export interface BurstOpts {
  kind?: NoiseKind;
  /** Instant de départ (défaut : début de la recette). */
  t0?: number;
  type?: BiquadFilterType;
  /** Fréquence du filtre (Hz) et, si f1 est donné, fréquence atteinte après `sweep` secondes. */
  f: number;
  f1?: number;
  sweep?: number;
  q?: number;
  peak: number;
  /** Temps de montée (s) et constante de décroissance (s). */
  a?: number;
  tau: number;
  to?: AudioNode;
}

export class Kit {
  /** Sources créées (pour l'arrêt). */
  readonly sources: AudioScheduledSourceNode[] = [];
  /** Paramètres de désaccord (cents) de tous les oscillateurs : hauteur demandée + Doppler. */
  readonly detunes: AudioParam[] = [];
  /** Désaccord de base (cents) correspondant à `pitch`. */
  readonly baseDetune: number;
  private curves: Map<string, Float32Array> | null = null;

  constructor(
    readonly ac: BaseAudioContext,
    /** Nœud où la recette branche sa sortie. */
    readonly out: AudioNode,
    /** Instant de départ (temps du contexte, s). */
    readonly t: number,
    /** Aléatoire de variation (différent à chaque déclenchement). */
    readonly rnd: () => number,
    /** Multiplicateur de hauteur demandé par l'appelant (1 = normal). */
    readonly pitch: number,
    /** Son entretenu demandé en boucle. */
    readonly loop: boolean,
    /** Texte associé (slogan, annonce) pour les recettes qui suivent une prosodie. */
    readonly text: string,
  ) {
    this.baseDetune = 1200 * Math.log2(pitch > 0 ? pitch : 1);
  }

  /** Aléatoire uniforme dans [a, b[. */
  r(a: number, b: number): number {
    return a + (b - a) * this.rnd();
  }

  // ───────────────────────────── nœuds ─────────────────────────────

  gain(value = 1, to?: AudioNode): GainNode {
    const g = this.ac.createGain();
    g.gain.value = value;
    if (to) g.connect(to);
    return g;
  }

  /** Oscillateur démarré à `start` (la hauteur demandée s'applique par désaccord : les glissandos programmés suivent). */
  osc(type: OscillatorType, freq: number, to?: AudioNode, start = this.t, stop = -1): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = this.baseDetune;
    if (to) o.connect(to);
    o.start(start);
    if (stop >= 0) o.stop(stop);
    this.sources.push(o);
    this.detunes.push(o.detune);
    return o;
  }

  /** Oscillateur de modulation (basse fréquence) : insensible à la hauteur et au Doppler. */
  lfo(type: OscillatorType, freq: number, depth: number, target: AudioParam, start = this.t): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ac.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start(start);
    this.sources.push(o);
    return o;
  }

  /** Oscillateur de commande nu (non branché) : insensible à la hauteur et au Doppler, suivi pour l'arrêt. */
  ctrl(type: OscillatorType, freq: number, start = this.t): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(start);
    this.sources.push(o);
    return o;
  }

  /** Lecture en boucle d'une texture procédurale, départ à une position aléatoire. */
  tex(id: TextureId, to?: AudioNode, rate = 1, start = this.t, stop = -1): AudioBufferSourceNode {
    const buf = textureBuffer(this.ac, id);
    const s = this.ac.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    if (to) s.connect(to);
    s.start(start, this.rnd() * Math.max(0, buf.duration - 0.05));
    if (stop >= 0) s.stop(stop);
    this.sources.push(s);
    return s;
  }

  noise(kind: NoiseKind = 'white', to?: AudioNode, start = this.t, stop = -1): AudioBufferSourceNode {
    return this.tex(kind, to, 1, start, stop);
  }

  bq(type: BiquadFilterType, freq: number, q = 0.707, to?: AudioNode, gainDb = 0): BiquadFilterNode {
    const f = this.ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(freq, this.ac.sampleRate * 0.45);
    f.Q.value = q;
    f.gain.value = gainDb;
    if (to) f.connect(to);
    return f;
  }

  delay(seconds: number, to?: AudioNode): DelayNode {
    const d = this.ac.createDelay(Math.max(0.05, seconds + 0.05));
    d.delayTime.value = seconds;
    if (to) d.connect(to);
    return d;
  }

  /** Saturation douce (tanh) : `drive` > 1 durcit le son ; la sortie reste dans [−1, 1]. */
  sat(drive: number, to?: AudioNode): WaveShaperNode {
    const ws = this.ac.createWaveShaper();
    ws.curve = this.curve('tanh:' + drive.toFixed(2), (x) => Math.tanh(x * drive) / Math.tanh(drive)) as Float32Array<ArrayBuffer>;
    if (to) ws.connect(to);
    return ws;
  }

  /**
   * Train d'impulsions : signal de commande 0/1 à `rate` Hz, ouvert pendant la fraction `width`
   * de chaque période, à brancher sur le gain d'un nœud (hachage régulier : cliquet, lames de
   * rideau, claquement diesel). Retourne l'oscillateur pour faire varier la cadence.
   */
  pulse(rate: number, width: number, target: AudioParam, start = this.t): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = rate;
    const ws = this.ac.createWaveShaper();
    const edge = 1 - 2 * width;
    ws.curve = this.curve('pulse:' + width.toFixed(3), (x) => {
      const u = (x - edge) / (1 - edge);
      return u <= 0 ? 0 : Math.sin(Math.PI * Math.min(1, u)) ** 0.5;
    }) as Float32Array<ArrayBuffer>;
    o.connect(ws);
    ws.connect(target);
    o.start(start);
    this.sources.push(o);
    return o;
  }

  private curve(key: string, fn: (x: number) => number): Float32Array {
    if (!this.curves) this.curves = sharedCurves;
    let c = this.curves.get(key);
    if (!c) {
      const n = 1024;
      c = new Float32Array(n);
      for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
      this.curves.set(key, c);
    }
    return c;
  }

  // ───────────────────────────── enveloppes ─────────────────────────────

  /** Percussive : 0 → peak en `a` secondes, puis décroissance exponentielle de constante `tau`. */
  perc(p: AudioParam, t0: number, peak: number, a: number, tau: number): void {
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(peak, t0 + Math.max(a, 0.0005));
    p.setTargetAtTime(0, t0 + Math.max(a, 0.0005), Math.max(tau, 0.0005));
  }

  /** Trapèze : 0 → peak en `a`, tenu jusqu'à t0 + a + hold, retour à 0 en `r`. */
  trap(p: AudioParam, t0: number, peak: number, a: number, hold: number, r: number): void {
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(peak, t0 + a);
    p.setValueAtTime(peak, t0 + a + hold);
    p.linearRampToValueAtTime(0, t0 + a + hold + r);
  }

  /** Glissement exponentiel de v0 (à t0) vers v1 (à t1). Les valeurs doivent être > 0. */
  sweep(p: AudioParam, t0: number, v0: number, t1: number, v1: number): void {
    p.setValueAtTime(Math.max(v0, 1e-4), t0);
    p.exponentialRampToValueAtTime(Math.max(v1, 1e-4), Math.max(t1, t0 + 0.001));
  }

  /** Nœud de gain muet avec une enveloppe percussive. */
  env(t0: number, peak: number, a: number, tau: number, to: AudioNode = this.out): GainNode {
    const g = this.gain(0, to);
    this.perc(g.gain, t0, peak, a, tau);
    return g;
  }

  // ───────────────────────────── briques composées ─────────────────────────────

  /** Rafale de bruit filtré avec enveloppe percussive. */
  burst(o: BurstOpts): GainNode {
    const t0 = o.t0 ?? this.t;
    const a = o.a ?? 0.001;
    const g = this.env(t0, o.peak, a, o.tau, o.to ?? this.out);
    const f = this.bq(o.type ?? 'bandpass', o.f, o.q ?? 0.8, g);
    if (o.f1 !== undefined) this.sweep(f.frequency, t0, o.f, t0 + (o.sweep ?? o.tau * 3), o.f1);
    this.noise(o.kind ?? 'white', f, t0, t0 + a + o.tau * 8 + 0.02);
    return g;
  }

  /** Partiel percussif (résonance d'un objet) : oscillateur qui s'éteint, avec glissement optionnel vers f1. */
  ping(f: number, t0: number, peak: number, tau: number, to: AudioNode = this.out, type: OscillatorType = 'sine', f1?: number, a = 0.002): OscillatorNode {
    const g = this.env(t0, peak, a, tau, to);
    const o = this.osc(type, f, g, t0, t0 + a + tau * 8 + 0.02);
    if (f1 !== undefined) this.sweep(o.frequency, t0, f, t0 + tau * 2.5, f1);
    return o;
  }

  /**
   * Échos de façade : copies retardées et assourdies du signal `src`, envoyées vers `to`.
   * taps = [retard s, gain, coupure Hz][].
   */
  echoes(src: AudioNode, taps: readonly (readonly [number, number, number])[], to: AudioNode = this.out): void {
    for (let i = 0; i < taps.length; i++) {
      const tap = taps[i]!;
      const g = this.gain(tap[1], to);
      const lp = this.bq('lowpass', tap[2], 0.5, g);
      const d = this.delay(tap[0], lp);
      src.connect(d);
    }
  }

  /**
   * Gain maître d'un son ENTRETENU. En boucle : simple montée, la recette dure indéfiniment.
   * En lecture ponctuelle : montée, tenue, extinction, pour une durée totale `seconds`.
   * Retourne le nœud où brancher la recette ; `this.duration` est renseigné.
   */
  sustain(seconds: number, attack = 0.06, release = 0.2, level = 1): GainNode {
    const g = this.gain(0, this.out);
    g.gain.setValueAtTime(0, this.t);
    g.gain.linearRampToValueAtTime(level, this.t + attack);
    if (this.loop) {
      this.duration = Infinity;
    } else {
      g.gain.setValueAtTime(level, this.t + Math.max(attack, seconds - release));
      g.gain.linearRampToValueAtTime(0, this.t + seconds);
      this.duration = seconds;
    }
    return g;
  }

  /** Durée de la recette (s), Infinity pour une boucle entretenue. */
  duration = 0;
  /**
   * Période de relance (s) d'une recette rythmée jouée en boucle : la relance tombe en mesure,
   * avant la fin de la queue du son. 0 = relancer à la fin de la durée.
   */
  period = 0;

  /** Programme l'arrêt de toutes les sources à l'instant `when`. */
  stopAll(when: number): void {
    for (let i = 0; i < this.sources.length; i++) {
      try {
        this.sources[i]!.stop(when);
      } catch {
        // source déjà arrêtée : sans importance
      }
    }
  }

  /** Applique un facteur Doppler (multiplicateur de fréquence) à tous les oscillateurs. */
  setDoppler(mult: number, when: number): void {
    const cents = this.baseDetune + 1200 * Math.log2(mult);
    for (let i = 0; i < this.detunes.length; i++) this.detunes[i]!.setTargetAtTime(cents, when, 0.08);
  }
}

const sharedCurves = new Map<string, Float32Array>();

/** Une recette branche son graphe sur le Kit et retourne sa durée naturelle (s) — Infinity si entretenue en boucle. */
export type Recipe = (k: Kit) => number;
