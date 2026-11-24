/* =====================================================================================
 * Moteur de mixage : voix spatialisées et réserve de voix (la sortie — contexte, bus, limiteur —
 * est dans output.ts).
 *
 *   voix : recette → amp (volume × distance) → passe-bas (distance, occlusion) → panoramique → bus
 *
 * Une voix est « réelle » (elle possède des nœuds WebAudio) ou « virtuelle » (une boucle trop
 * lointaine, évincée, ou demandée avant le premier geste de l'utilisateur) : elle reprendra
 * d'elle-même. Au plus MAX_VOICES voix réelles ; à priorité égale les plus lointaines sont coupées.
 * ===================================================================================== */

import type { SoundId, SoundOptions } from '@/core/contracts';
import { soundDef, type SoundDef } from './catalog';
import { instantiate, type Instance } from './instantiate';
import type { Kit } from './kit';
import { AudioOutput } from './output';
import { computeSpatial, dopplerFactor, propagationDelay, type SpatialResult } from './spatial';
import { getTexture, hasTexture, TEXTURE_IDS } from './textures';
import { textureBuffer } from './kit';
import { AUDIBLE_EPS, MAX_VOICES, admitVoice, rebalanceVoices, type AdmitResult, type Rebalance, type VoiceCandidate } from './voicePool';

export interface PlayExtra {
  /** Texte suivi par les recettes à prosodie (slogan, annonce). */
  text?: string;
  priority?: number;
  /** Graphe sur mesure à la place de la recette du catalogue (moteurs pilotés). */
  build?: (k: Kit) => number;
  /** Appelé quand la voix (re)devient réelle / redevient virtuelle. */
  onRealized?: (k: Kit, when: number) => void;
  onVirtual?: () => void;
  /** Sujet à l'effet Doppler (source mobile : voir setVoiceVelocity). */
  doppler?: boolean;
  /** Ne pas fusionner avec un son identique tout juste déclenché au même endroit. */
  noDedup?: boolean;
}

export interface EngineStats {
  state: string;
  real: number;
  virtual: number;
  capacity: number;
  sampleRate: number;
  time: number;
  played: number;
  dropped: number;
}

class Voice implements VoiceCandidate {
  handle = 0;
  id = '';
  def!: SoundDef;
  x = 0; y = 0; z = 0;
  spatial = false;
  volume = 1;
  pitch = 1;
  loop = false;
  priority = 1;
  text = '';
  seed = 0;
  extra: PlayExtra | null = null;
  createdAt = 0;
  // ── état réel ──
  real = false;
  inst: Instance | null = null;
  prev: Instance | null = null;
  amp: GainNode | null = null;
  filter: BiquadFilterNode | null = null;
  panner: StereoPannerNode | null = null;
  endsAt = Infinity;
  nextTrigger = Infinity;
  // ── spatialisation ──
  /** Gain effectif (volume × atténuation) : sert au classement dans la réserve. */
  gain = 0;
  appliedGain = -1;
  appliedPan = 9;
  appliedCutoff = -1;
  occl = 0;
  occlTarget = 0;
  losAt = 0;
  vx = 0; vz = 0;
  doppler = 1;
}

interface Grave { node: AudioNode; at: number }

/** Nombre maximal de boucles mises en attente tant que le contexte ne tourne pas. */
const MAX_PENDING = 96;

export class AudioEngine extends AudioOutput {
  /** Teste la vue directe entre deux points (ctx.world.lineOfSight). */
  lineOfSight: ((ax: number, az: number, bx: number, bz: number) => boolean) | null = null;


  private readonly voices: Voice[] = [];
  private readonly byHandle = new Map<number, Voice>();
  private readonly graves: Grave[] = [];
  private nextHandle = 1;
  private seedCounter = 1;
  private rebalanceAt = 0;
  private warmIndex = 0;
  private played = 0;
  private dropped = 0;
  private readonly unknown = new Set<string>();

  // auditeur
  lx = 0; ly = 1.7; lz = 0; yaw = 0;
  private lvx = 0; private lvz = 0;
  private plx = 0; private plz = 0;
  private hasPrev = false;


  private readonly sp: SpatialResult = { gain: 1, pan: 0, cutoff: 20000, distance: 0 };
  private readonly admit: AdmitResult = { admit: false, evict: 0 };
  private readonly balance: Rebalance = { start: [], stop: [] };


  dispose(): void {
    this.stopAll(0);
    this.disposeOutput();
  }

  setListener(x: number, y: number, z: number, yaw: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(yaw)) return;
    this.lx = x;
    this.ly = y;
    this.lz = z;
    this.yaw = yaw;
  }

  // ───────────────────────────── lecture ─────────────────────────────

  play(id: SoundId, opts?: SoundOptions, extra?: PlayExtra): number {
    if (this.disabled) return 0;
    const def = soundDef(id);
    if (!def) {
      if (!this.unknown.has(id)) {
        this.unknown.add(id);
        console.error(`[audio] son inconnu : « ${id} »`);
      }
      return 0;
    }
    const loop = !!(opts && opts.loop);
    const running = this.running;
    // un son ponctuel demandé avant le déverrouillage (ou page masquée) est perdu ; une boucle attend
    if (!loop && !running) return 0;
    if (!running && this.voices.length >= MAX_PENDING) return 0;
    // une valeur non finie (NaN venu d'un calcul en amont) ne doit jamais atteindre WebAudio
    const spatial = !!opts && Number.isFinite(opts.x) && Number.isFinite(opts.z);
    const x = spatial ? opts!.x! : 0;
    const z = spatial ? opts!.z! : 0;
    const y = spatial ? finiteOr(opts!.y, this.ly) : 0;
    const volume = clamp(finiteOr(opts ? opts.volume : undefined, 1), 0, 4);
    const pitch = clamp(finiteOr(opts ? opts.pitch : undefined, 1), 0.25, 4);
    const now = this.now;

    // même son, même endroit, même instant : un seul exemplaire (événement + sfx explicite)
    let sameCount = 0;
    let weakest: Voice | null = null;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i]!;
      if (v.id !== id) continue;
      if (!loop && !v.loop && !(extra && extra.noDedup) && now - v.createdAt < 0.06 && v.spatial === spatial) {
        const dx = v.x - x;
        const dz = v.z - z;
        if (!spatial || dx * dx + dz * dz < 9) return v.handle;
      }
      if (v.real && !v.loop) {
        sameCount++;
        if (!weakest || v.gain < weakest.gain) weakest = v;
      }
    }

    let occl = 0;
    let gain = volume;
    let distance = 0;
    if (spatial) {
      computeSpatial(this.lx, this.ly, this.lz, this.yaw, x, y, z, def, 0, this.sp);
      distance = this.sp.distance;
      if (this.sp.gain > 0 && distance > 3 && this.lineOfSight && !this.lineOfSight(this.lx, this.lz, x, z)) {
        occl = 1;
        computeSpatial(this.lx, this.ly, this.lz, this.yaw, x, y, z, def, 1, this.sp);
      }
      gain = volume * this.sp.gain;
    }
    if (!loop) {
      if (gain < AUDIBLE_EPS) {
        this.dropped++;
        return 0;
      }
      // trop d'exemplaires du même son : le nouveau remplace le plus faible, s'il est plus fort
      if (sameCount >= def.maxInstances) {
        if (weakest && gain > weakest.gain) this.kill(weakest, 0.03);
        else {
          this.dropped++;
          return 0;
        }
      }
    }

    const v = new Voice();
    v.handle = this.nextHandle++;
    v.id = id;
    v.def = def;
    v.x = x; v.y = y; v.z = z;
    v.spatial = spatial;
    v.volume = volume;
    v.pitch = pitch;
    v.loop = loop;
    v.priority = extra && extra.priority !== undefined ? extra.priority : def.priority;
    v.text = extra && extra.text ? extra.text : '';
    v.extra = extra ?? null;
    v.seed = (this.seedCounter = (this.seedCounter * 1664525 + 1013904223) >>> 0);
    v.createdAt = now;
    v.gain = gain;
    v.occl = v.occlTarget = occl;
    v.losAt = now + 0.25 + 0.03 * (v.handle % 8);

    if (running) {
      admitVoice(this.voices, MAX_VOICES, v.priority, gain, this.admit);
      if (this.admit.admit) {
        if (this.admit.evict) this.evict(this.admit.evict);
        const delay = def.delayed && spatial ? propagationDelay(distance) : 0;
        this.realize(v, now + 0.005 + delay);
      } else if (!loop) {
        this.dropped++;
        return 0;
      }
    }
    this.voices.push(v);
    this.byHandle.set(v.handle, v);
    this.played++;
    return v.handle;
  }

  stop(handle: number, fadeSeconds = 0.06): void {
    const v = this.byHandle.get(handle);
    if (v) this.kill(v, fadeSeconds);
  }

  stopAll(fadeSeconds = 0.1): void {
    for (let i = this.voices.length - 1; i >= 0; i--) this.kill(this.voices[i]!, fadeSeconds);
  }

  /** La poignée désigne-t-elle encore un son (réel ou virtuel) ? */
  alive(handle: number): boolean {
    return this.byHandle.has(handle);
  }

  /** Y a-t-il déjà une boucle de ce son à moins de `radius` mètres ? (évite les doublons entre modules) */
  hasLoopNear(id: SoundId, x: number, z: number, radius: number): boolean {
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i]!;
      if (v.id !== id || !v.loop || !v.spatial) continue;
      const dx = v.x - x;
      const dz = v.z - z;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  setVoicePosition(handle: number, x: number, y: number, z: number): void {
    const v = this.byHandle.get(handle);
    if (!v || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    v.x = x; v.y = y; v.z = z;
  }

  setVoiceVelocity(handle: number, vx: number, vz: number): void {
    const v = this.byHandle.get(handle);
    if (!v || !Number.isFinite(vx) || !Number.isFinite(vz)) return;
    v.vx = vx; v.vz = vz;
  }

  setVoiceVolume(handle: number, volume: number): void {
    const v = this.byHandle.get(handle);
    if (v && Number.isFinite(volume)) v.volume = clamp(volume, 0, 4);
  }

  /** Kit de la voix si elle est réelle (pour piloter un graphe sur mesure). */
  voiceKit(handle: number): Kit | null {
    const v = this.byHandle.get(handle);
    return v && v.real && v.inst ? v.inst.kit : null;
  }

  // ───────────────────────────── cycle de vie d'une voix ─────────────────────────────

  private realize(v: Voice, when: number): void {
    const ac = this.ac;
    const buses = this.buses;
    if (!ac || !buses) return;
    const amp = ac.createGain();
    const bus = buses[v.def.bus];
    if (v.spatial) {
      computeSpatial(this.lx, this.ly, this.lz, this.yaw, v.x, v.y, v.z, v.def, v.occl, this.sp);
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.5;
      filter.frequency.value = Math.min(this.sp.cutoff, ac.sampleRate * 0.45);
      amp.connect(filter);
      let tail: AudioNode = filter;
      if (typeof ac.createStereoPanner === 'function') {
        const panner = ac.createStereoPanner();
        panner.pan.value = this.sp.pan;
        filter.connect(panner);
        tail = panner;
        v.panner = panner;
      }
      tail.connect(bus);
      v.filter = filter;
      v.gain = v.volume * this.sp.gain;
      v.appliedPan = this.sp.pan;
      v.appliedCutoff = this.sp.cutoff;
    } else {
      amp.connect(bus);
      v.gain = v.volume;
    }
    amp.gain.value = v.gain;
    v.appliedGain = v.gain;
    v.amp = amp;
    const def = v.extra && v.extra.build ? { ...v.def, recipe: v.extra.build } : v.def;
    const inst = instantiate(ac, def, amp, when, { seed: v.seed, pitch: v.pitch, loop: v.loop, text: v.text });
    v.inst = inst;
    v.prev = null;
    v.real = true;
    v.doppler = 1;
    if (v.loop) {
      v.endsAt = Infinity;
      v.nextTrigger = Number.isFinite(inst.duration) ? when + inst.period : Infinity;
    } else {
      v.endsAt = when + inst.duration;
      v.nextTrigger = Infinity;
    }
    if (v.extra && v.extra.onRealized) v.extra.onRealized(inst.kit, when);
  }

  /** Coupe les nœuds d'une voix réelle (fondu bref) sans toucher à sa fiche. */
  private silence(v: Voice, fade: number): void {
    const ac = this.ac;
    if (!ac || !v.real || !v.amp) return;
    const now = ac.currentTime;
    const f = Math.max(0.01, fade);
    try {
      v.amp.gain.cancelScheduledValues(now);
      v.amp.gain.setTargetAtTime(0, now, f / 4);
    } catch {
      // paramètre déjà libéré
    }
    if (v.inst) v.inst.kit.stopAll(now + f + 0.05);
    if (v.prev) v.prev.kit.stopAll(now + f + 0.05);
    this.graves.push({ node: v.panner ?? v.filter ?? v.amp, at: now + f + 0.15 });
    v.real = false;
    v.inst = v.prev = null;
    v.amp = null;
    v.filter = null;
    v.panner = null;
    v.appliedGain = -1;
    if (v.extra && v.extra.onVirtual) v.extra.onVirtual();
  }

  private kill(v: Voice, fade: number): void {
    this.silence(v, fade);
    this.byHandle.delete(v.handle);
    const i = this.voices.indexOf(v);
    if (i >= 0) {
      const last = this.voices.pop()!;
      if (i < this.voices.length) this.voices[i] = last;
    }
  }

  /** Une voix cède sa place : une boucle devient virtuelle, un son ponctuel est perdu. */
  private evict(handle: number): void {
    const v = this.byHandle.get(handle);
    if (!v) return;
    if (v.loop) this.silence(v, 0.05);
    else this.kill(v, 0.04);
  }

  // ───────────────────────────── mise à jour par image ─────────────────────────────

  update(dt: number): void {
    const ac = this.ac;
    if (!ac || this.disabled) return;
    const now = ac.currentTime;
    const running = this.running;

    // vitesse de l'auditeur (effet Doppler) ; un saut de caméra n'est pas une vitesse
    if (this.hasPrev && dt > 1e-4) {
      const jx = this.lx - this.plx;
      const jz = this.lz - this.plz;
      if (jx * jx + jz * jz < 36) {
        const k = Math.min(1, dt * 8);
        this.lvx += (jx / dt - this.lvx) * k;
        this.lvz += (jz / dt - this.lvz) * k;
      } else {
        this.lvx = this.lvz = 0;
      }
    }
    this.plx = this.lx;
    this.plz = this.lz;
    this.hasPrev = true;

    const occlBlend = 1 - Math.exp(-dt * 7);
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i]!;
      if (v.real && now >= v.endsAt + 0.03) {
        this.kill(v, 0.01);
        continue;
      }
      // relance d'un son non entretenu joué en boucle (programmée un peu à l'avance)
      if (v.real && v.loop && now >= v.nextTrigger - 0.15 && v.amp) {
        if (v.prev) v.prev.out.disconnect();
        v.prev = v.inst;
        v.seed = (v.seed * 1664525 + 1013904223) >>> 0;
        const when = Math.max(now + 0.005, v.nextTrigger);
        const def = v.extra && v.extra.build ? { ...v.def, recipe: v.extra.build } : v.def;
        v.inst = instantiate(ac, def, v.amp, when, { seed: v.seed, pitch: v.pitch, loop: true, text: v.text });
        v.nextTrigger = when + v.inst.period;
      }
      if (v.spatial) {
        if (this.lineOfSight && now >= v.losAt) {
          v.losAt = now + 0.3 + 0.02 * (v.handle % 8);
          const dx = v.x - this.lx;
          const dz = v.z - this.lz;
          const d2 = dx * dx + dz * dz;
          const max = v.def.maxDistance;
          v.occlTarget = d2 > 9 && d2 < max * max && !this.lineOfSight(this.lx, this.lz, v.x, v.z) ? 1 : 0;
        }
        v.occl += (v.occlTarget - v.occl) * occlBlend;
        const sp = computeSpatial(this.lx, this.ly, this.lz, this.yaw, v.x, v.y, v.z, v.def, v.occl, this.sp);
        v.gain = v.volume * sp.gain;
        if (v.real && v.amp) {
          if (Math.abs(v.gain - v.appliedGain) > 0.004 + 0.02 * v.appliedGain) {
            v.amp.gain.setTargetAtTime(v.gain, now, 0.04);
            v.appliedGain = v.gain;
          }
          if (v.panner && Math.abs(sp.pan - v.appliedPan) > 0.015) {
            v.panner.pan.setTargetAtTime(sp.pan, now, 0.04);
            v.appliedPan = sp.pan;
          }
          if (v.filter && Math.abs(sp.cutoff - v.appliedCutoff) > 0.03 * v.appliedCutoff) {
            v.filter.frequency.setTargetAtTime(Math.min(sp.cutoff, ac.sampleRate * 0.45), now, 0.06);
            v.appliedCutoff = sp.cutoff;
          }
          if (v.extra && v.extra.doppler && v.inst) {
            const f = dopplerFactor(this.lx, this.lz, this.lvx, this.lvz, v.x, v.z, v.vx, v.vz);
            if (Math.abs(f - v.doppler) > 0.002) {
              v.inst.kit.setDoppler(f, now);
              v.doppler = f;
            }
          }
        }
      } else {
        v.gain = v.volume;
        if (v.real && v.amp && Math.abs(v.gain - v.appliedGain) > 0.004) {
          v.amp.gain.setTargetAtTime(v.gain, now, 0.05);
          v.appliedGain = v.gain;
        }
      }
    }

    // rééquilibrage de la réserve (5 fois par seconde) : boucles virtuelles ↔ réelles
    if (running && now >= this.rebalanceAt) {
      this.rebalanceAt = now + 0.2;
      const b = rebalanceVoices(this.voices, MAX_VOICES, this.balance);
      for (let i = 0; i < b.stop.length; i++) this.evict(b.stop[i]!);
      for (let i = 0; i < b.start.length; i++) {
        const v = this.byHandle.get(b.start[i]!);
        if (v && !v.real) this.realize(v, now + 0.01);
      }
    }

    // nœuds des voix terminées : on les détache une fois leur fondu passé
    for (let i = this.graves.length - 1; i >= 0; i--) {
      const g = this.graves[i]!;
      if (now >= g.at) {
        try {
          g.node.disconnect();
        } catch {
          // déjà détaché
        }
        const last = this.graves.pop()!;
        if (i < this.graves.length) this.graves[i] = last;
      }
    }
  }

  /**
   * Précalcule une texture lourde par appel (voix de foule…) pour ne jamais bloquer une image
   * au moment où le son est demandé. Retourne true quand tout est prêt.
   */
  warmUp(): boolean {
    if (!this.ac) return false;
    while (this.warmIndex < TEXTURE_IDS.length) {
      const id = TEXTURE_IDS[this.warmIndex]!;
      this.warmIndex++;
      const fresh = !hasTexture(id);
      getTexture(id);
      textureBuffer(this.ac, id);
      if (fresh) return false;
    }
    return true;
  }

  stats(): EngineStats {
    let real = 0;
    for (let i = 0; i < this.voices.length; i++) if (this.voices[i]!.real) real++;
    return {
      state: this.disabled ? 'désactivé' : this.ac ? this.ac.state : 'verrouillé',
      real,
      virtual: this.voices.length - real,
      capacity: MAX_VOICES,
      sampleRate: this.ac ? this.ac.sampleRate : 0,
      time: this.now,
      played: this.played,
      dropped: this.dropped,
    };
  }

  /** Liste des voix (débogage, banc d'essai). */
  describeVoices(): string[] {
    return this.voices.map(
      (v) => `${v.real ? '●' : '○'} ${v.id}${v.loop ? ' (boucle)' : ''} p${v.priority} g${v.gain.toFixed(2)}`,
    );
  }
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

function finiteOr(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
