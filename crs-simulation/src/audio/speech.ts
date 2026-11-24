/* =====================================================================================
 * Voix : synthèse vocale du navigateur (SpeechSynthesis) et son habillage.
 *
 * Une file d'attente ne laisse parler qu'un message à la fois. Chaque message suit le cycle
 *   ouverture (bip radio / clic de mégaphone) → parole → fermeture (bip de fin / clic).
 * La parole est dite par une voix française du navigateur si la synthèse est activée
 * (réglage voiceSynthesis) et qu'une voix fr-* existe (fr-FR de préférence) ; sinon RIEN n'est dit — on n'utilise
 * jamais une voix étrangère pour lire du français, les sous-titres font foi — et l'habillage
 * seul marque le message : souffle radio d'une durée proportionnée au texte, ou voix de
 * mégaphone indistincte (recette `megaphone`) qui suit la prosodie du texte.
 * ===================================================================================== */

import type { Settings } from '@/core/contracts';
import { soundDef } from './catalog';
import type { AudioEngine, PlayExtra } from './engine';
import { estimateSpeechSeconds } from './prosody';
import { distanceGain } from './spatial';

export type SpeechMode = 'plain' | 'radio' | 'megaphone';

export interface SpeechRequest {
  text: string;
  mode: SpeechMode;
  voice: number;
  volume: number;
  spatial: boolean;
  x: number;
  y: number;
  z: number;
  priority: 0 | 1 | 2;
  /**
   * Dit tout de suite (accusé de réception d'un ordre du joueur) : passe devant toute la file et coupe la parole en
   * cours si elle n'est pas urgente (l'accusé d'un ordre précédent compris) ; la parole coupée est redite une fois juste
   * après.
   */
  interrupt?: boolean;
}

interface Job extends SpeechRequest {
  stage: 'queued' | 'opening' | 'speaking' | 'closing';
  /** Temps passé dans l'étape courante (s). */
  t: number;
  /** Durée prévue de l'étape courante (s). */
  until: number;
  bed: number;
  utter: SpeechSynthesisUtterance | null;
  done: boolean;
  /** Redite d'une parole coupée par un accusé : coupée à son tour, elle n'est plus redite. */
  cut: boolean;
}

/** Timbres : hauteur et débit selon l'indice de voix (en plus du choix de la voix du navigateur). */
const PITCHES = [1.0, 0.82, 1.18, 0.9, 1.3, 0.72];
const RATES = [1.02, 0.96, 1.08, 1.0, 1.05, 0.93];
const MAX_QUEUE = 4;
const GARBLE_EXTRA: PlayExtra = { text: '', noDedup: true };

export class SpeechQueue {
  private readonly queue: Job[] = [];
  private current: Job | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private readonly synth: SpeechSynthesis | null;
  private lastText = '';
  private lastTextAt = -10;
  private time = 0;
  private paused = false;
  private readonly onVoices = (): void => this.loadVoices();

  constructor(private readonly engine: AudioEngine, private readonly settings: () => Settings) {
    const g = globalThis as unknown as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: unknown };
    this.synth = g.speechSynthesis && typeof g.SpeechSynthesisUtterance === 'function' ? g.speechSynthesis : null;
    if (this.synth) {
      this.loadVoices();
      // la liste des voix arrive souvent après le chargement de la page
      if (typeof this.synth.addEventListener === 'function') this.synth.addEventListener('voiceschanged', this.onVoices);
    }
  }

  private loadVoices(): void {
    if (!this.synth) return;
    let list: SpeechSynthesisVoice[] = [];
    try {
      list = this.synth.getVoices();
    } catch {
      list = [];
    }
    const fr = list.filter((v) => /^fr([-_]|$)/i.test(v.lang));
    // Voix de France en priorité : les autres français (Canada, Belgique, Suisse) ne servent que
    // s'il n'y en a aucune. Les voix locales passent avant les voix en ligne.
    const france = fr.filter((v) => /^fr[-_]FR$/i.test(v.lang));
    const pick = france.length > 0 ? france : fr;
    pick.sort((a, b) => score(b) - score(a));
    this.voices = pick;
  }

  /** La synthèse peut-elle dire du français maintenant ? */
  canSpeak(): boolean {
    if (!this.synth || !this.settings().voiceSynthesis) return false;
    if (this.voices.length === 0) this.loadVoices();
    return this.voices.length > 0;
  }

  info(): { supported: boolean; frenchVoices: number; queued: number; speaking: boolean } {
    return { supported: this.synth !== null, frenchVoices: this.voices.length, queued: this.queue.length, speaking: this.current !== null };
  }

  enqueue(req: SpeechRequest): void {
    const text = req.text.trim();
    if (!text) return;
    // même message demandé deux fois de suite (événement + appel direct) : une seule diffusion
    if (text === this.lastText && this.time - this.lastTextAt < 2) return;
    if (this.current && this.current.text === text) return;
    for (let i = 0; i < this.queue.length; i++) if (this.queue[i]!.text === text) return;
    if (req.priority === 0 && this.queue.length >= 2) return;
    this.lastText = text;
    this.lastTextAt = this.time;
    const job: Job = { ...req, text, stage: 'queued', t: 0, until: 0, bed: 0, utter: null, done: false, cut: false };
    if (req.interrupt === true) {
      // derrière les accusés déjà en attente (pas encore dits), devant tout le reste
      let i = 0;
      while (i < this.queue.length && this.queue[i]!.interrupt === true && !this.queue[i]!.cut) i++;
      this.queue.splice(i, 0, job);
      const cur = this.current;
      if (cur && cur.priority < 2 && (cur.stage === 'opening' || cur.stage === 'speaking')) {
        // coupée (bip de fin, comme une émission interrompue), puis redite une fois après l'accusé (une redite coupée
        // à son tour n'est plus redite)
        this.close(cur);
        if (!cur.cut) this.queue.splice(i + 1, 0, { ...cur, stage: 'queued', t: 0, until: 0, bed: 0, utter: null, done: false, cut: true });
      }
    } else if (req.priority === 2) {
      // l'urgent passe devant tout ce qui attend (mais ne coupe pas la parole en cours), sauf les accusés de réception
      let i = 0;
      while (i < this.queue.length && (this.queue[i]!.priority === 2 || this.queue[i]!.interrupt === true)) i++;
      this.queue.splice(i, 0, job);
    } else {
      this.queue.push(job);
    }
    while (this.queue.length > MAX_QUEUE) {
      // file pleine : on abandonne le message le moins prioritaire, le plus ancien à égalité (jamais un accusé)
      let drop = -1;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i]!.interrupt === true) continue;
        if (drop < 0 || this.queue[i]!.priority < this.queue[drop]!.priority) drop = i;
      }
      if (drop < 0) break;
      this.queue.splice(drop, 1);
    }
  }

  frame(dt: number): void {
    this.time += dt;
    if (this.paused) return;
    let job = this.current;
    if (!job) {
      if (this.queue.length === 0) return;
      // tant que le contexte audio n'est pas lancé, on ne dépile pas (rien ne s'entendrait)
      if (!this.engine.running) {
        if (this.queue[0]!.t > 6) this.queue.shift();
        else this.queue[0]!.t += dt;
        return;
      }
      job = this.current = this.queue.shift()!;
      this.open(job);
      return;
    }
    job.t += dt;
    if (job.stage === 'opening') {
      if (job.t >= job.until) this.say(job);
    } else if (job.stage === 'speaking') {
      if (job.done || job.t >= job.until) this.close(job);
    } else if (job.t >= job.until) {
      this.current = null;
    }
  }

  private spatialOpts(job: Job, volume: number, loop: boolean): { x?: number; y?: number; z?: number; volume: number; loop: boolean } {
    return job.spatial ? { x: job.x, y: job.y, z: job.z, volume, loop } : { volume, loop };
  }

  private open(job: Job): void {
    job.stage = 'opening';
    job.t = 0;
    if (job.mode === 'radio') {
      this.engine.play('radio_bip', { volume: job.volume });
      job.until = 0.22;
    } else if (job.mode === 'megaphone') {
      // sans synthèse, la recette « megaphone » contient déjà le clic et le larsen
      if (this.canSpeak()) {
        this.engine.play('megaphone_clic', this.spatialOpts(job, job.volume, false));
        job.until = 0.3;
      } else {
        job.until = 0;
      }
    } else {
      job.until = 0;
    }
  }

  private say(job: Job): void {
    job.stage = 'speaking';
    job.t = 0;
    const timbre = Math.abs(job.voice | 0) % PITCHES.length;
    let rate = RATES[timbre]!;
    let pitch = PITCHES[timbre]!;
    if (job.mode === 'radio') rate *= 1.08;
    else if (job.mode === 'megaphone') {
      rate *= 0.9;
      pitch *= 0.95;
    }
    const est = estimateSpeechSeconds(job.text, rate);
    const speak = this.canSpeak();

    if (job.mode === 'radio') job.bed = this.engine.play('radio_souffle', { loop: true, volume: 0.8 * job.volume });
    else if (job.mode === 'megaphone' && speak) job.bed = this.engine.play('megaphone_fond', this.spatialOpts(job, job.volume, true));

    if (!speak) {
      if (job.mode === 'megaphone') {
        GARBLE_EXTRA.text = job.text;
        this.engine.play('megaphone', { ...this.spatialOpts(job, job.volume, false), pitch: PITCHES[timbre]! }, GARBLE_EXTRA);
        job.until = est / 0.92 + 0.9;
      } else if (job.mode === 'radio') {
        // pas de voix : un souffle bref, proportionné au message, suffit à signaler l'émission
        job.until = Math.min(2.2, Math.max(0.6, est * 0.5));
      } else {
        job.until = 0;
      }
      return;
    }

    const synth = this.synth!;
    const Utter = (globalThis as unknown as { SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
    const u = new Utter(job.text);
    const voice = this.voices[Math.abs(job.voice | 0) % this.voices.length]!;
    u.voice = voice;
    u.lang = voice.lang || 'fr-FR';
    u.rate = rate;
    u.pitch = pitch;
    const s = this.settings();
    let vol = s.volumeMaster * s.volumeVoices * job.volume;
    if (job.spatial) {
      // la synthèse ne se spatialise pas : au moins son volume suit la distance (et un mur l'assourdit)
      const def = soundDef('megaphone')!;
      const d = Math.hypot(job.x - this.engine.lx, job.z - this.engine.lz);
      vol *= distanceGain(d, def);
      if (d > 3 && this.engine.lineOfSight && !this.engine.lineOfSight(this.engine.lx, this.engine.lz, job.x, job.z)) vol *= 0.5;
    }
    u.volume = vol < 0 ? 0 : vol > 1 ? 1 : vol;
    u.onend = (): void => {
      job.done = true;
    };
    u.onerror = (): void => {
      job.done = true;
    };
    job.utter = u;
    // garde-fou : certains navigateurs n'émettent jamais « end »
    job.until = est * 2.2 + 4;
    try {
      synth.speak(u);
    } catch (err) {
      console.error('[audio] synthèse vocale indisponible', err);
      job.done = true;
    }
  }

  private close(job: Job): void {
    job.stage = 'closing';
    job.t = 0;
    if (job.utter && !job.done && this.synth) {
      try {
        this.synth.cancel();
      } catch {
        // rien à annuler
      }
    }
    job.utter = null;
    if (job.bed) {
      this.engine.stop(job.bed, 0.06);
      job.bed = 0;
    }
    if (job.mode === 'radio') {
      this.engine.play('radio_fin', { volume: job.volume });
      job.until = 0.4;
    } else if (job.mode === 'megaphone') {
      job.until = 0.35;
    } else {
      job.until = 0.15;
    }
  }

  /** Pause de session : la parole se fige, elle reprendra. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (!this.synth) return;
    try {
      if (paused) this.synth.pause();
      else this.synth.resume();
    } catch {
      // sans conséquence
    }
  }

  /** Coupe tout (fin de session, synthèse désactivée). */
  cancel(): void {
    const job = this.current;
    if (job && job.bed) this.engine.stop(job.bed, 0.05);
    this.current = null;
    this.queue.length = 0;
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch {
        // sans conséquence
      }
    }
  }

  dispose(): void {
    this.cancel();
    if (this.synth && typeof this.synth.removeEventListener === 'function') this.synth.removeEventListener('voiceschanged', this.onVoices);
  }
}

function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (v.localService) s += 2;
  if (v.default) s += 1;
  return s;
}
