/* =====================================================================================
 * FOULE — aléas : les imprévus d'une manifestation. Le catalogue (aleas-data.ts) en compte plus de
 * trente ; quelques-uns sont tirés pour chaque mission d'après la graine. La propension à dégénérer
 * (volatility) règle leur NOMBRE (2 + volatility × 4, modulé par la durée) et leur GRAVITÉ (les aléas
 * sérieux ne sortent presque jamais d'une marche calme). Chaque aléa agit par les mêmes moyens que le
 * reste du module : personnes créées, courses à faire, arrêts du cortège, humeur, tension, annonces.
 * ===================================================================================== */

import type { CrowdPhase, EntityId, Person, ProtestProfile, RoadSample } from '@/core/contracts';
import { ALEA_EVENT } from './api';
import type { AleaEvent, AleaInfo, CrowdFamily } from './api';
import { CATALOGUE } from './aleas-data';
import { F, S, brainOf } from './brain';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import * as T from './tuning';

export interface AleaRun {
  /** Fin prévue (s de session). */
  until: number;
  x: number;
  z: number;
  /** Personnes concernées (créées ou mobilisées). */
  ids: EntityId[];
  /** Valeurs libres de l'aléa. */
  n: number;
  v: number;
  next: number;
}

export interface AleaDef {
  id: string;
  label: string;
  /** 0 = sans gravité, 1 = friction, 2 = sérieux. */
  gravity: 0 | 1 | 2;
  /** Phases (du déroulé) pendant lesquelles il peut survenir. */
  phases: readonly CrowdPhase[];
  weight: number;
  /** Démarre l'aléa ; false si les conditions ne sont pas réunies (il sera retenté, puis écarté). */
  start(kit: AleaKit, run: AleaRun): boolean;
  /** Chaque seconde tant qu'il dure. */
  tick?(kit: AleaKit, run: AleaRun): void;
  end?(kit: AleaKit, run: AleaRun): void;
}

interface Entry { def: AleaDef; info: AleaInfo; run: AleaRun; tries: number }

/** Boîte à outils des aléas. */
export class AleaKit {
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  readonly out: Person[] = [];

  constructor(readonly core: CrowdCore) {}

  get now(): number { return this.core.now; }
  get K(): number { return Math.min(1.6, Math.max(0.5, this.core.timeScale)); }
  rand(): number { return this.core.rngAlea.next(); }
  range(a: number, b: number): number { return this.core.rngAlea.range(a, b); }

  /** Point du parcours : tête (0), milieu (0,5), queue (1) ; décalage en mètres vers l'avant. */
  point(run: AleaRun, where: number, ahead = 0): void {
    const core = this.core;
    const f = core.formation;
    core.corridor.at(f.headS + (f.tailS - f.headS) * where + ahead, core.rp);
    run.x = core.rp.x - core.rp.tz * core.rp.center;
    run.z = core.rp.z + core.rp.tx * core.rp.center;
  }

  /** Membres de la foule autour d'un point (au plus `max`), filtrés. Résultat dans kit.out. */
  near(x: number, z: number, r: number, max: number, filter?: (p: Person, b: CrowdBrain) => boolean): number {
    const core = this.core;
    const n = core.ctx.people.queryRadius(x, z, r, core.buf);
    const out = this.out;
    out.length = 0;
    for (let i = 0; i < n && out.length < max; i++) {
      const p = core.buf[i]!;
      const b = brainOf(p);
      if (!b || b.index < 0 || p.isPlayer || p.posture === 'down' || p.custody !== 'free' || b.state === S.LEAVE || (b.flags & F.BYSTANDER)) continue;
      if (filter && !filter(p, b)) continue;
      out.push(p);
    }
    return out.length;
  }

  /** Envoie une personne se poster quelque part pendant un moment (elle regarde le point indiqué). */
  errand(p: Person, x: number, z: number, seconds: number, lookX = NaN, lookZ = NaN): void {
    const b = brainOf(p);
    if (!b) return;
    b.watchId = -1;
    b.watchX = x;
    b.watchZ = z;
    b.watchUntil = this.core.now + seconds;
    b.lookX = lookX;
    b.lookZ = lookZ;
    b.nextThink = 0;
  }

  pin(p: Person, on: boolean): void {
    const b = brainOf(p);
    if (!b) return;
    if (on) b.flags |= F.PINNED;
    else b.flags &= ~F.PINNED;
    b.nextThink = 0;
  }

  /** Point d'une rue latérale près de l'abscisse donnée du parcours ; false s'il n'y en a pas. */
  sideStreet(s: number, run: AleaRun, depth = 38): boolean {
    const core = this.core;
    const world = core.ctx.world;
    core.corridor.at(s, core.rp);
    const px = core.rp.x;
    const pz = core.rp.z;
    const nx = -core.rp.tz;
    const nz = core.rp.tx;
    const first = this.rand() < 0.5 ? 1 : -1;
    for (let k = 0; k < 6; k++) {
      const side = k % 2 === 0 ? first : -first;
      const along = (k >> 1) * 22 - 10;
      const x = px + nx * side * depth + core.rp.tx * along;
      const z = pz + nz * side * depth + core.rp.tz * along;
      if (!world.isFree(x, z, 0.5) || !world.nearestRoad(x, z, this.road, 9)) continue;
      run.x = x;
      run.z = z;
      return true;
    }
    return false;
  }

  /** Crée un groupe de manifestants supplémentaires autour d'un point. */
  spawnGroup(run: AleaRun, count: number, profile: ProtestProfile, family: CrowdFamily, counted: boolean, anger: number): Person[] {
    const core = this.core;
    const made: Person[] = [];
    for (let i = 0; i < count; i++) {
      let x = run.x;
      let z = run.z;
      if (core.ctx.world.randomFreePoint(run.x, run.z, 3 + Math.sqrt(count), 'any', core.rand, core.v2)) {
        x = core.v2.x;
        z = core.v2.z;
      }
      const p = core.spawnExtra(profile, x, z, { family, counted });
      if (!p) continue;
      p.anger = anger;
      run.ids.push(p.id);
      made.push(p);
    }
    if (made.length > 1) core.createGroup(profile === 'radical' || profile === 'opportuniste' ? 'noyau' : 'delegation', made);
    return made;
  }

  mood(x: number, z: number, r: number, fear: number, anger: number): void {
    this.core.emotions.stir(x, z, r, fear, anger);
  }

  tension(amount: number, x: number, z: number, reason: string): void {
    this.core.director.addTension(amount, x, z, reason);
  }

  halt(seconds: number, id: string): void {
    this.core.formation.halt(seconds, 'alea:' + id);
  }

  /** Arrête le bloc qui se trouve à l'endroit de l'aléa. */
  holdBlockAt(run: AleaRun, seconds: number): void {
    const core = this.core;
    const f = core.formation;
    const s = core.corridor.project(run.x, run.z, (f.headS + f.tailS) * 0.5, 600);
    let block = 0;
    for (let k = 0; k < f.blockCount; k++) if (f.blockS(k) >= s) block = k;
    f.holdBlock(Math.min(f.blockCount - 1, block + 1), seconds);
  }

  say(kind: 'prise_de_parole' | 'consigne' | 'arret' | 'reprise', text: string, x: number, z: number): void {
    this.core.voices.announce(kind, text, x, z);
  }

  chant(text: string, response: string, x: number, z: number, intensity = 0.8): void {
    this.core.voices.chant(text, response, x, z, intensity);
  }

  radio(text: string, priority: 0 | 1 | 2 = 1): void {
    this.core.ctx.radio.say({ channel: 'commandement', from: 'Salle', text, priority });
  }

  person(id: EntityId): Person | undefined {
    return this.core.ctx.people.get(id);
  }

  /** Fait partir ceux que l'aléa avait amenés et qui ne sont pas de la manifestation. */
  dismiss(run: AleaRun): void {
    for (const id of run.ids) {
      const p = this.person(id);
      const b = p ? brainOf(p) : null;
      if (b && (b.flags & F.UNCOUNTED)) {
        b.flags &= ~F.PINNED;
        b.watchId = 0;
        b.leaveAt = this.core.now + 2 * this.rand();
        b.nextThink = 0;
      }
    }
  }
}

export class Aleas {
  readonly infos: AleaInfo[] = [];
  private entries: Entry[] = [];
  private readonly kit: AleaKit;
  private next = 0;
  private readonly ev: AleaEvent = { id: '', label: '', gravity: 0, stage: 'debut', x: 0, z: 0 };
  /** Aléas commencés depuis le début de la session. */
  started = 0;

  constructor(private readonly core: CrowdCore) {
    this.kit = new AleaKit(core);
    this.reset();
  }

  reset(): void {
    this.entries = CATALOGUE.map((def) => ({
      def, info: { id: def.id, label: def.label, gravity: def.gravity, at: -1, status: '' },
      run: { until: 0, x: 0, z: 0, ids: [], n: 0, v: 0, next: 0 }, tries: 0,
    }));
    this.infos.length = 0;
    for (const e of this.entries) this.infos.push(e.info);
    this.next = 0;
    this.started = 0;
  }

  /** Tire les aléas de la mission d'après la graine. */
  draw(): void {
    const core = this.core;
    const extra = core.extra;
    if (extra['crowd.noAleas'] === true) return;
    const rng = core.rngAlea;
    const sch = core.schedule;
    const t0 = core.now;
    const window = (phases: readonly CrowdPhase[]): number => {
      // instant au hasard dans une des phases permises (hors des tout premiers et derniers instants)
      const spans: number[] = [];
      let at = t0;
      const all: readonly [CrowdPhase, number][] = [['rassemblement', sch.gather], ['depart', sch.depart], ['cortege', sch.march], ['dispersion', sch.disperse], ['apres_manif', sch.after]];
      for (const [name, len] of all) {
        if (phases.indexOf(name) >= 0 && len > 0) spans.push(at + len * 0.12, at + len * 0.85);
        at += len;
      }
      if (spans.length === 0) return -1;
      const k = rng.int(0, spans.length >> 1) * 2;
      return spans[k]! + rng.next() * (spans[k + 1]! - spans[k]!);
    };
    const forced = extra['crowd.aleas'];
    if (Array.isArray(forced)) {
      for (const id of forced) {
        const e = this.entries.find((x) => x.def.id === id);
        if (!e) continue;
        e.info.at = window(e.def.phases);
        e.info.status = e.info.at >= 0 ? 'prevu' : 'ecarte';
      }
      return;
    }
    const v = core.volatility;
    const lengthK = sch.total <= 700 ? 0.7 : sch.total >= 2400 ? 1.4 : 1;
    const count = Math.max(1, Math.round((T.ALEA_BASE + v * T.ALEA_SPAN + rng.next() - 0.5) * lengthK));
    const weights = this.entries.map((e) => {
      const g = e.def.gravity;
      return e.def.weight * (g === 0 ? 1.25 - 0.6 * v : g === 1 ? 0.45 + v : 0.04 + 1.9 * v * v);
    });
    for (let k = 0; k < count; k++) {
      let total = 0;
      for (const w of weights) total += w;
      if (!(total > 0)) break;
      let r = rng.next() * total;
      let pick = 0;
      for (; pick < weights.length - 1; pick++) {
        r -= weights[pick]!;
        if (r < 0) break;
      }
      weights[pick] = 0;
      const e = this.entries[pick]!;
      e.info.at = window(e.def.phases);
      e.info.status = e.info.at >= 0 ? 'prevu' : 'ecarte';
    }
  }

  /** Déclenche un aléa tout de suite (script de mission, essais). */
  trigger(id: string): boolean {
    const e = this.entries.find((x) => x.def.id === id);
    if (!e || !this.core.active || e.info.status === 'en_cours') return false;
    return this.begin(e);
  }

  private begin(e: Entry): boolean {
    const core = this.core;
    const run = e.run;
    run.ids.length = 0;
    run.n = 0;
    run.v = 0;
    run.next = 0;
    run.until = core.now + 30;
    run.x = core.director.centerX;
    run.z = core.director.centerZ;
    let ok = false;
    try {
      ok = e.def.start(this.kit, run);
    } catch (err) {
      console.error('[crowd] aléa « ' + e.def.id + ' » en erreur', err);
    }
    if (!ok) return false;
    e.info.status = 'en_cours';
    e.info.at = core.now;
    this.started++;
    this.emit(e, 'debut');
    return true;
  }

  private emit(e: Entry, stage: 'debut' | 'fin'): void {
    const ev = this.ev;
    ev.id = e.def.id;
    ev.label = e.def.label;
    ev.gravity = e.def.gravity;
    ev.stage = stage;
    ev.x = e.run.x;
    ev.z = e.run.z;
    this.core.ctx.events.emitAny(ALEA_EVENT, ev);
  }

  update(): void {
    const core = this.core;
    const now = core.now;
    if (now < this.next) return;
    this.next = now + 1;
    const base = core.director.base;
    for (const e of this.entries) {
      const info = e.info;
      if (info.status === 'prevu' && now >= info.at) {
        if (base === 'terminee') info.status = 'ecarte';
        else if (e.def.phases.indexOf(base) < 0) {
          // la phase prévue est passée (ou pas encore là) : on attend un peu, puis on renonce
          if (++e.tries > 40) info.status = 'ecarte';
        } else if (!this.begin(e) && ++e.tries > 25) info.status = 'ecarte';
      } else if (info.status === 'en_cours') {
        try {
          if (e.def.tick) e.def.tick(this.kit, e.run);
        } catch (err) {
          console.error('[crowd] aléa « ' + e.def.id + ' » en erreur', err);
          e.run.until = now;
        }
        if (now >= e.run.until || base === 'terminee') {
          try {
            if (e.def.end) e.def.end(this.kit, e.run);
          } catch (err) {
            console.error('[crowd] fin de l’aléa « ' + e.def.id + ' » en erreur', err);
          }
          info.status = 'termine';
          this.emit(e, 'fin');
        }
      }
    }
  }
}
