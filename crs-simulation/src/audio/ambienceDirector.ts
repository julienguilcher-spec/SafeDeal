/* =====================================================================================
 * Ambiance vivante : la foule, la ville, la météo.
 *
 * Quatre fois par seconde on regarde qui entoure l'auditeur (ctx.people.queryRadius) : nombre
 * de manifestants, colère et peur moyennes, barycentre ; avec la phase et la tension du
 * directeur de foule, computeCrowdMix en déduit le niveau de chaque couche. Les niveaux sont
 * lissés à chaque image et appliqués à des lits sonores placés AU BARYCENTRE de la foule (on
 * l'entend donc venir d'une direction, s'étouffer derrière un immeuble, grossir en approchant).
 * Par-dessus : slogans scandés (en réponse aux événements 'crowd:chant', ou spontanés), sifflets,
 * cris, quintes de toux dans le gaz, batterie de cortège ; rumeur de la ville selon l'heure,
 * pluie, vent, tonnerre selon la météo.
 * ===================================================================================== */

import type { GameContext, Person, SoundId } from '@/core/contracts';
import { cityLevel, computeCrowdMix, type CrowdInput, type CrowdMix } from './crowdMix';
import type { AudioEngine, PlayExtra } from './engine';
import { voicePitchFor } from './mapping';
import { mulberry32 } from './prng';
import { PRIORITY_AMBIENT, PRIORITY_HIGH } from './voicePool';

/** Rayon d'écoute de la foule (m). */
const CROWD_RADIUS = 70;

interface Bed {
  id: SoundId;
  key: 'murmur' | 'boo' | 'panic' | 'drums';
  gain: number;
  handle: number;
}

interface EnvBed { id: SoundId; handle: number; level: number }

const CHANT_EXTRA: PlayExtra = { noDedup: true, priority: PRIORITY_HIGH, text: '' };
const DETAIL_EXTRA: PlayExtra = { priority: PRIORITY_AMBIENT };

function smooth(e0: number, e1: number, x: number): number {
  const t = x <= e0 ? 0 : x >= e1 ? 1 : (x - e0) / (e1 - e0);
  return t * t * (3 - 2 * t);
}

export class AmbienceDirector {
  /** Mixage courant (lissé) et cible. */
  readonly mix: CrowdMix = { presence: 0, murmur: 0, chant: 0, boo: 0, whistle: 0, panic: 0, drums: 0 };
  private readonly target: CrowdMix = { presence: 0, murmur: 0, chant: 0, boo: 0, whistle: 0, panic: 0, drums: 0 };
  private readonly input: CrowdInput = { count: 0, meanDistance: 0, anger: 0, fear: 0, phase: 'aucune', tension: 0 };
  private readonly beds: Bed[] = [
    { id: 'foule_calme', key: 'murmur', gain: 1, handle: 0 },
    { id: 'foule_huees', key: 'boo', gain: 1, handle: 0 },
    { id: 'foule_panique', key: 'panic', gain: 1, handle: 0 },
    { id: 'batucada', key: 'drums', gain: 0.9, handle: 0 },
  ];
  private readonly city: EnvBed = { id: 'ville', handle: 0, level: 0 };
  private readonly rain: EnvBed = { id: 'pluie', handle: 0, level: 0 };
  private readonly wind: EnvBed = { id: 'vent', handle: 0, level: 0 };

  // barycentre de la foule (cible et valeur lissée)
  private tx = 0; private tz = 0;
  private cx = 0; private cz = 0;
  private hasCentroid = false;

  private time = 0;
  private sampleAt = 0;
  private chantBusyUntil = 0;
  private autoChantAt = 2;
  private lastChantAt = -10;
  private whistleAt = 1;
  private screamAt = 1;
  private coughAt = 1;
  private thunderAt = 8;
  private cityEventAt = 15;
  private playerCoughAt = 0;

  // candidats tirés au hasard lors du dernier relevé (identifiants de personnes)
  private memberId = 0;
  private scaredId = 0;
  private gassedId = 0;

  private readonly scratch: Person[] = [];
  private readonly rnd = mulberry32(0xa3b1e5);
  private readonly filter = (p: Person): boolean => !p.dormant && p.injury !== 'dead';

  constructor(private readonly ctx: GameContext, private readonly engine: AudioEngine) {}

  /** Slogan lancé par la foule (événement 'crowd:chant'). */
  onChant(x: number, z: number, text: string, intensity: number): void {
    const eng = this.engine;
    const dx = x - eng.lx;
    const dz = z - eng.lz;
    if (dx * dx + dz * dz > 240 * 240) return;
    if (this.time - this.lastChantAt < 0.8) return; // plusieurs groupes au même instant : un seul chœur
    CHANT_EXTRA.text = text;
    const volume = Math.min(1, Math.max(0.3, 0.45 + 0.55 * intensity));
    eng.play('foule_slogans', { x, y: eng.ly, z, volume }, CHANT_EXTRA);
    this.lastChantAt = this.time;
    this.chantBusyUntil = this.time + 3.4;
  }

  frame(dt: number): void {
    this.time += dt;
    if (this.time >= this.sampleAt) {
      this.sampleAt = this.time + 0.25;
      this.sample();
    }
    const eng = this.engine;
    const m = this.mix;
    const t = this.target;
    const k = 1 - Math.exp(-dt / 1.1);
    const kFast = 1 - Math.exp(-dt / 0.45); // la panique et les huées éclatent vite
    m.presence += (t.presence - m.presence) * k;
    m.murmur += (t.murmur - m.murmur) * k;
    m.chant += (t.chant - m.chant) * k;
    m.drums += (t.drums - m.drums) * k;
    m.whistle += (t.whistle - m.whistle) * k;
    m.boo += (t.boo - m.boo) * (t.boo > m.boo ? kFast : k);
    m.panic += (t.panic - m.panic) * (t.panic > m.panic ? kFast : k);

    if (this.hasCentroid) {
      const kc = 1 - Math.exp(-dt / 0.8);
      this.cx += (this.tx - this.cx) * kc;
      this.cz += (this.tz - this.cz) * kc;
    } else {
      this.cx = eng.lx;
      this.cz = eng.lz;
    }

    // lits de foule
    for (let i = 0; i < this.beds.length; i++) {
      const b = this.beds[i]!;
      const level = m[b.key] * b.gain;
      if (level > 0.025) {
        if (!b.handle || !eng.alive(b.handle)) {
          b.handle = eng.play(b.id, { x: this.cx, y: eng.ly, z: this.cz, loop: true, volume: level });
        } else {
          eng.setVoiceVolume(b.handle, level);
          eng.setVoicePosition(b.handle, this.cx, eng.ly, this.cz);
        }
      } else if (b.handle && level < 0.012) {
        eng.stop(b.handle, 1.0);
        b.handle = 0;
      }
    }

    // ville, pluie, vent
    const st = this.ctx.env.state;
    this.envBed(this.city, cityLevel(st.timeOfDay, m.presence) * 0.8);
    this.envBed(this.rain, Math.min(1, st.rain * 1.1));
    this.envBed(this.wind, smooth(1.5, 14, Math.hypot(st.windX, st.windZ)) * 0.9 + (st.weather === 'orage' ? 0.15 : 0));

    this.details(st.weather === 'orage');
  }

  private envBed(b: EnvBed, target: number): void {
    const eng = this.engine;
    b.level = target;
    if (target > 0.02) {
      if (!b.handle || !eng.alive(b.handle)) b.handle = eng.play(b.id, { loop: true, volume: target });
      else eng.setVoiceVolume(b.handle, target);
    } else if (b.handle) {
      eng.stop(b.handle, 1.5);
      b.handle = 0;
    }
  }

  /** Événements ponctuels au fil de l'eau : slogans spontanés, sifflets, cris, toux, tonnerre, klaxons lointains. */
  private details(storm: boolean): void {
    const eng = this.engine;
    if (!eng.running) return;
    const m = this.mix;
    const now = this.time;
    const rnd = this.rnd;
    const people = this.ctx.people;

    // slogan spontané quand la foule en a envie et que personne n'en a lancé récemment
    if (m.chant > 0.12 && now >= this.autoChantAt && now >= this.chantBusyUntil) {
      CHANT_EXTRA.text = '';
      eng.play('foule_slogans', { x: this.cx, y: eng.ly, z: this.cz, volume: 0.4 + 0.6 * m.chant }, CHANT_EXTRA);
      this.chantBusyUntil = now + 3.4;
      // foule très en voix : les slogans s'enchaînent presque sans silence
      this.autoChantAt = now + 3.2 + (1 - m.chant) * 6 + rnd() * 1.2;
    }

    if (now >= this.whistleAt) {
      this.whistleAt = now + (0.6 + 1.6 * rnd()) / Math.max(0.08, m.whistle * 1.3);
      const p = m.whistle > 0.05 ? people.get(this.memberId) : undefined;
      if (p) eng.play('sifflet', { x: p.x, y: p.y + 1.6, z: p.z, volume: 0.5 + 0.5 * rnd(), pitch: 0.94 + 0.12 * rnd() }, DETAIL_EXTRA);
    }

    if (now >= this.screamAt) {
      this.screamAt = now + (0.5 + rnd()) / Math.max(0.1, m.panic * 1.6);
      if (m.panic > 0.08) {
        const p = people.get(this.scaredId) ?? people.get(this.memberId);
        if (p) {
          eng.play('cri', { x: p.x, y: p.y + 1.6, z: p.z, volume: 0.45 + 0.45 * m.panic, pitch: voicePitchFor(p.id) * (0.95 + 0.15 * rnd()) }, DETAIL_EXTRA);
        }
      }
    }

    if (now >= this.coughAt) {
      this.coughAt = now + 0.7 + 0.9 * rnd();
      const p = people.get(this.gassedId);
      if (p && p.gas > 0.3) {
        eng.play('toux', { x: p.x, y: p.y + 1.6, z: p.z, volume: 0.6 + 0.4 * p.gas, pitch: voicePitchFor(p.id) }, DETAIL_EXTRA);
      }
    }

    // le joueur tousse lui aussi quand il respire du gaz sans masque
    const me = this.ctx.player.person();
    if (me && me.gas > 0.4 && me.gasProtection < 0.5 && now >= this.playerCoughAt) {
      this.playerCoughAt = now + 2 + 2.5 * rnd();
      eng.play('toux', { volume: 0.7, pitch: voicePitchFor(me.id) });
    }

    if (storm && now >= this.thunderAt) {
      this.thunderAt = now + 14 + 26 * rnd();
      eng.play('tonnerre', { volume: 0.5 + 0.5 * rnd(), pitch: 0.85 + 0.3 * rnd() });
    } else if (!storm && this.thunderAt < now) {
      this.thunderAt = now + 4 + 6 * rnd();
    }

    // la ville au loin : un coup de klaxon de temps en temps
    if (now >= this.cityEventAt) {
      const level = this.city.level;
      this.cityEventAt = now + (14 + 40 * rnd()) / Math.max(0.25, level);
      if (level > 0.3) {
        const a = rnd() * Math.PI * 2;
        const d = 110 + 90 * rnd();
        eng.play('klaxon', { x: eng.lx + Math.sin(a) * d, y: eng.ly, z: eng.lz + Math.cos(a) * d, volume: 0.9, pitch: 0.85 + 0.3 * rnd() }, DETAIL_EXTRA);
      }
    }
  }

  /** Relevé de la foule autour de l'auditeur. */
  private sample(): void {
    const ctx = this.ctx;
    const eng = this.engine;
    const lx = eng.lx;
    const lz = eng.lz;
    const n = ctx.people.queryRadius(lx, lz, CROWD_RADIUS, this.scratch, this.filter);
    let count = 0;
    let anger = 0;
    let fear = 0;
    let dist = 0;
    let sx = 0;
    let sz = 0;
    let scared = 0;
    let gassed = 0;
    this.memberId = this.scaredId = this.gassedId = 0;
    const rnd = this.rnd;
    for (let i = 0; i < n; i++) {
      const p = this.scratch[i]!;
      const dx = p.x - lx;
      const dz = p.z - lz;
      const d = Math.sqrt(dx * dx + dz * dz);
      // toute personne non protégée dans le gaz peut tousser (échantillonnage par réservoir)
      if (!p.isPlayer && p.gas > 0.35 && p.gasProtection < 0.5 && d < 30) {
        gassed++;
        if (rnd() * gassed < 1) this.gassedId = p.id;
      }
      if (p.faction !== 'protest') continue;
      count++;
      anger += p.anger;
      fear += p.fear;
      dist += d;
      sx += p.x;
      sz += p.z;
      if (rnd() * count < 1) this.memberId = p.id;
      if (p.fear > 0.55) {
        scared++;
        if (rnd() * scared < 1) this.scaredId = p.id;
      }
    }
    this.scratch.length = 0;
    const inp = this.input;
    inp.count = count;
    if (count > 0) {
      inp.anger = anger / count;
      inp.fear = fear / count;
      inp.meanDistance = dist / count;
      this.tx = sx / count;
      this.tz = sz / count;
      if (!this.hasCentroid) {
        this.cx = this.tx;
        this.cz = this.tz;
        this.hasCentroid = true;
      }
    } else {
      inp.anger = inp.fear = 0;
      inp.meanDistance = 0;
      this.hasCentroid = false;
    }
    const dir = ctx.director;
    inp.phase = dir.phase;
    inp.tension = Math.max(dir.tension, dir.tensionAt(lx, lz));
    computeCrowdMix(inp, this.target);
  }

  reset(): void {
    const eng = this.engine;
    for (let i = 0; i < this.beds.length; i++) {
      if (this.beds[i]!.handle) eng.stop(this.beds[i]!.handle, 0.3);
      this.beds[i]!.handle = 0;
    }
    for (const b of [this.city, this.rain, this.wind]) {
      if (b.handle) eng.stop(b.handle, 0.3);
      b.handle = 0;
    }
    const m = this.mix;
    m.presence = m.murmur = m.chant = m.boo = m.whistle = m.panic = m.drums = 0;
    this.hasCentroid = false;
    this.sampleAt = 0;
    this.chantBusyUntil = 0;
    this.autoChantAt = this.time + 2;
  }
}
