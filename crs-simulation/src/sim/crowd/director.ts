/* =====================================================================================
 * FOULE — le DIRECTEUR : il fait vivre la manifestation et la laisse dégénérer, ou non.
 *
 *   - PHASES (bible F.2) : rassemblement 12 % de la durée, départ 4 %, cortège 44 %, dispersion 16 %,
 *     après-manif 24 % ; « tension » et « affrontement » sont des ÉTATS superposés, décidés par la tension
 *     globale (seuils 0,30 et 0,50, avec hystérésis). Fin quand il reste moins de 5 % de la foule, ou
 *     quand le temps est écoulé et la dispersion achevée (prolongations de 300 s, trois au plus).
 *   - TENSION : carte locale par cellules de 25 m, alimentée par addTension (hausses × (0,5 + volatility)),
 *     qui décroît de 0,01 par 10 s ; tension globale = 0,6 × moyenne pondérée par l'effectif + 0,4 ×
 *     maximum local, lissée sur 10 s, plus la tension de départ de la mission, qui retombe lentement.
 *   - CORTÈGE : ordre de départ, arrêts de marche, ralentissement quand la tête s'échauffe, tampon ouvert
 *     par le service d'ordre, annonce de la dispersion.
 *   - STATISTIQUES : CrowdStats tenues à jour deux fois par seconde.
 * Implémente DirectorApi (ctx.director).
 * ===================================================================================== */

import type { CrowdPhase, CrowdStats, DirectorApi, EntityId, Person } from '@/core/contracts';
import { F, S } from './brain';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import { SparseGrid } from './grid';
import * as T from './tuning';

export interface TensionEntry { t: number; reason: string; delta: number; x: number; z: number }

const NO_ROUTE: readonly number[] = Object.freeze([]);
const DEPART_TEXT = 'On avance tranquillement, on reste groupés derrière la banderole !';
const DISPERSAL_TEXT = 'La manifestation est terminée. Merci à toutes et à tous. Dispersez-vous dans le calme par les rues indiquées.';

export class Director implements DirectorApi {
  phase: CrowdPhase = 'aucune';
  /** Phase du déroulé, sans les états superposés. */
  base: CrowdPhase = 'aucune';
  tension = 0;
  readonly stats: CrowdStats = { total: 0, present: 0, dispersed: 0, radicals: 0, injured: 0, arrested: 0 };
  liaison = false;
  /** Pas de slogans avant cet instant (minute de silence). */
  silentUntil = -1;
  /** Relevé courant : manifestants présents, barycentre, humeur moyenne. */
  present = 0;
  centerX = 0;
  centerZ = 0;
  meanAnger = 0;
  meanFear = 0;
  /** Plus grand nombre de manifestants présents en même temps. */
  peak = 0;
  /** Centre de la manifestation, figé à l'annonce de la dispersion : on a « quitté les lieux » loin de ce point. */
  homeX = 0;
  homeZ = 0;
  /** Journal des variations de tension (motif, lieu), pour le compte rendu. */
  readonly tensionLog: TensionEntry[] = [];
  /** Coefficient d'allure imposé par un aléa (averse : on presse le pas). */
  rush = 1;

  /** Canaux : tension locale, effectif. */
  private readonly map = new SparseGrid(T.TENSION_CELL, 2, 256);
  private ambient = 0;
  private overlay: 'aucun' | 'tension' | 'affrontement' = 'aucun';
  private overlayAt = -1e9;
  private t0 = 0;
  private phaseAt = 0;
  private departAt = 0;
  private marchEnd = 0;
  private disperseEnd = 0;
  private afterEnd = 0;
  private overtime = 0;
  private nextCount = 0;
  private nextSlow = 0;
  private nextHalt = 0;
  private nextWatch = 0;
  private blockedSince = -1;
  private blockedTold = false;
  private policeNearSince = -1;
  private nextPresence = 0;
  private readonly arrestedIds = new Set<EntityId>();

  constructor(private readonly core: CrowdCore) {}

  get route(): readonly number[] {
    return this.core.active ? this.core.route.points : NO_ROUTE;
  }

  get headProgress(): number {
    return this.core.active ? this.core.formation.headS : 0;
  }

  reset(): void {
    this.phase = 'aucune';
    this.base = 'aucune';
    this.tension = 0;
    const s = this.stats;
    s.total = s.present = s.dispersed = s.radicals = s.injured = s.arrested = 0;
    this.liaison = false;
    this.silentUntil = -1;
    this.present = 0;
    this.peak = 0;
    this.meanAnger = 0;
    this.meanFear = 0;
    this.tensionLog.length = 0;
    this.rush = 1;
    this.map.clear();
    this.ambient = 0;
    this.overlay = 'aucun';
    this.overlayAt = -1e9;
    this.overtime = 0;
    this.nextCount = 0;
    this.nextSlow = 0;
    this.nextHalt = 0;
    this.nextWatch = 0;
    this.blockedSince = -1;
    this.blockedTold = false;
    this.policeNearSince = -1;
    this.nextPresence = 0;
    this.arrestedIds.clear();
  }

  /** Début de la manifestation (appelé à la mise en place). */
  begin(): void {
    const core = this.core;
    const sch = core.schedule;
    this.t0 = core.now;
    this.departAt = this.t0 + sch.gather;
    this.marchEnd = this.departAt + sch.depart + sch.march;
    this.ambient = core.tension0;
    this.tension = core.tension0;
    this.stats.total = core.size;
    this.centerX = this.homeX = core.rallyX;
    this.centerZ = this.homeZ = core.rallyZ;
    this.nextHalt = this.departAt + sch.depart + core.rngEmo.range(T.HALT_EVERY_MIN, T.HALT_EVERY_MAX) * core.timeScale * 0.6;
    core.emotions.begin();
    this.setBase('rassemblement');
  }

  /** Retarde le départ (aléa). */
  delayDeparture(seconds: number): void {
    if (this.base !== 'rassemblement') return;
    this.departAt += seconds;
    this.marchEnd += seconds;
  }

  onArrived(): void {
    this.present++;
    this.stats.present = this.present;
    if (this.present > this.peak) this.peak = this.present;
  }

  onGone(_p: Person, b: CrowdBrain): void {
    if ((b.flags & F.UNCOUNTED) === 0 && this.present > 0) {
      this.present--;
      this.stats.present = this.present;
    }
  }

  onDispersed(): void {
    this.stats.dispersed++;
  }

  onArrested(p: Person): void {
    if (this.arrestedIds.has(p.id)) return;
    this.arrestedIds.add(p.id);
    this.stats.arrested = this.arrestedIds.size;
  }

  // ───────────────────────────── tension ─────────────────────────────

  tensionAt(x: number, z: number): number {
    if (!this.core.active) return 0;
    const v = this.ambient + this.map.get(x, z, 0, 0);
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  addTension(amount: number, x: number, z: number, reason: string): void {
    const core = this.core;
    if (!core.active || !(amount === amount) || amount === 0) return;
    let a = amount;
    if (a > 0) a *= (0.5 + core.volatility) * (this.liaison ? 0.7 : 1);
    const map = this.map;
    const cx = map.cx(x);
    const cz = map.cx(z);
    const data = map.data;
    // la cellule visée, et ses huit voisines pour un tiers (≈ 40 m de rayon)
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const o = map.ensure(cx + i, cz + j) * 2;
        const v = data[o]! + (i === 0 && j === 0 ? a : a * 0.35);
        data[o] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
    }
    this.log(reason, a, x, z);
    core.ctx.events.emit('crowd:tension', { tension: this.tension, delta: a, reason, x, z });
  }

  /** Variation de la tension de fond, pour toute la manifestation (rumeur, vidéo virale, blessé grave). */
  addGlobal(amount: number, reason: string): void {
    const core = this.core;
    if (!core.active || amount === 0) return;
    const a = amount > 0 ? amount * (0.5 + core.volatility) * (this.liaison ? 0.7 : 1) : amount;
    this.ambient = Math.min(1, Math.max(0, this.ambient + a));
    this.log(reason, a, this.centerX, this.centerZ);
    core.ctx.events.emit('crowd:tension', { tension: this.tension, delta: a, reason, x: this.centerX, z: this.centerZ });
  }

  private log(reason: string, delta: number, x: number, z: number): void {
    const log = this.tensionLog;
    if (log.length >= 400) log.splice(0, 100);
    log.push({ t: this.core.now, reason, delta, x, z });
  }

  // ───────────────────────────── phases ─────────────────────────────

  private setBase(next: CrowdPhase): void {
    if (this.base === next) return;
    this.base = next;
    this.phaseAt = this.core.now;
    this.publish();
  }

  /** Phase publiée : l'état superposé s'il y en a un pendant la marche, la dispersion ou l'après-manif. */
  private publish(): void {
    const base = this.base;
    let shown: CrowdPhase = base;
    if (this.overlay !== 'aucun' && (base === 'depart' || base === 'cortege' || base === 'dispersion' || base === 'apres_manif')) shown = this.overlay;
    if (shown === this.phase) return;
    const previous = this.phase;
    this.phase = shown;
    this.core.ctx.events.emit('crowd:phase', { phase: shown, previous });
  }

  /** Les organisateurs annoncent la fin de la manifestation. */
  announceDispersal(reason: string): void {
    const core = this.core;
    if (!core.active || this.base === 'dispersion' || this.base === 'apres_manif' || this.base === 'terminee') return;
    const now = core.now;
    const f = core.formation;
    f.marching = false;
    this.disperseEnd = now + core.schedule.disperse;
    this.afterEnd = this.disperseEnd + core.schedule.after;
    this.setBase('dispersion');
    const pos = core.v2;
    core.sono.position(pos);
    core.voices.announce('dispersion', DISPERSAL_TEXT, pos.x, pos.z);
    core.nav.exitsDirty = true;
    core.behavior.scheduleDispersal();
    // le cortège organisé s'apaise, le cortège de tête s'échauffe (dossier 03 §10)
    core.corridor.at(f.headS, core.rp);
    this.addTension(0.05, core.rp.x, core.rp.z, 'ordre_dispersion_' + reason);
    core.corridor.at((f.headS + f.tailS) * 0.5, core.rp);
    this.addTension(-0.05, core.rp.x, core.rp.z, 'ordre_dispersion_' + reason);
  }

  // ───────────────────────────── mise à jour ─────────────────────────────

  update(dt: number): void {
    const core = this.core;
    if (!core.active) return;
    const now = core.now;
    if (now >= this.nextCount) {
      this.nextCount = now + 0.5;
      this.count();
      this.globalTension(0.5);
    }
    if (now >= this.nextSlow) {
      this.nextSlow = now + 1;
      this.decay();
      core.corridor.refresh(core.ctx, core.formation.tailS - 60, core.formation.headS + 160);
    }
    if (now >= this.nextWatch) {
      this.nextWatch = now + 2;
      this.watchPolice();
    }
    this.cortege();
    this.phases();
    void dt;
  }

  /** Relevé : présents, radicaux, blessés, barycentre, humeur ; effectif par cellule de la carte de tension. */
  private count(): void {
    const core = this.core;
    const brains = core.brains;
    const members = core.members;
    const map = this.map;
    const data = map.data;
    for (let i = 0; i < map.count; i++) data[map.slot(i) * 2 + 1] = 0;
    let present = 0;
    let radicals = 0;
    let injured = 0;
    let sx = 0;
    let sz = 0;
    let anger = 0;
    let fear = 0;
    for (let i = 0; i < members.length; i++) {
      const b = brains[i]!;
      if (b.flags & F.UNCOUNTED) continue;
      const p = members[i]!;
      present++;
      if (p.profile === 'radical') radicals++;
      if (p.injury !== 'none') injured++;
      sx += p.x;
      sz += p.z;
      anger += p.anger;
      fear += p.fear;
      const s = map.at(p.x, p.z);
      if (s >= 0) data[s * 2 + 1] = data[s * 2 + 1]! + 1;
    }
    this.present = present;
    const st = this.stats;
    st.present = present;
    st.radicals = radicals;
    st.injured = injured;
    if (present > this.peak) this.peak = present;
    if (present > 0) {
      this.centerX = sx / present;
      this.centerZ = sz / present;
      this.meanAnger = anger / present;
      this.meanFear = fear / present;
      if (this.base === 'rassemblement' || this.base === 'depart' || this.base === 'cortege') {
        this.homeX = this.centerX;
        this.homeZ = this.centerZ;
      }
    }
  }

  private globalTension(h: number): void {
    const map = this.map;
    const data = map.data;
    let weighted = 0;
    let people = 0;
    let max = 0;
    for (let i = 0; i < map.count; i++) {
      const o = map.slot(i) * 2;
      const v = data[o]!;
      const n = data[o + 1]!;
      weighted += v * n;
      people += n;
      if (v > max) max = v;
    }
    // les personnes hors des cellules touchées comptent pour zéro dans la moyenne
    const mean = this.present > 0 ? weighted / Math.max(people, this.present) : 0;
    let target = this.ambient + T.TENSION_MEAN_W * mean + T.TENSION_MAX_W * max;
    if (target > 1) target = 1;
    this.tension += (target - this.tension) * (1 - Math.exp(-h / T.TENSION_SMOOTH));
    // états superposés, avec hystérésis et durée minimale
    const now = this.core.now;
    let next = this.overlay;
    if (this.tension >= T.CLASH_ON) next = 'affrontement';
    else if (this.overlay === 'affrontement') next = this.tension < T.CLASH_OFF ? (this.tension >= T.TENSION_OFF ? 'tension' : 'aucun') : 'affrontement';
    else if (this.tension >= T.TENSION_ON) next = 'tension';
    else if (this.overlay === 'tension' && this.tension < T.TENSION_OFF) next = 'aucun';
    if (next !== this.overlay && (now - this.overlayAt >= T.OVERLAY_DWELL || next === 'affrontement')) {
      this.overlay = next;
      this.overlayAt = now;
      this.publish();
    }
  }

  /** Décroissance : 0,01 par 10 s en durée standard, doublée quand l'équipe de liaison est au contact. */
  private decay(): void {
    const core = this.core;
    const k = (T.TENSION_DECAY * (this.liaison ? 2 : 1)) / core.timeScale;
    const map = this.map;
    const data = map.data;
    for (let i = 0; i < map.count; i++) {
      const o = map.slot(i) * 2;
      if (data[o]! > 0) data[o] = Math.max(0, data[o]! - k);
    }
    const floor = core.tension0 * T.AMBIENT_FLOOR;
    if (this.ambient > floor) this.ambient = Math.max(floor, this.ambient - k);
  }

  /** Présence ou retrait des forces autour de la foule (bible F.4). */
  private watchPolice(): void {
    const core = this.core;
    if (this.present < 5) return;
    const now = core.now;
    const sense = core.sense;
    const f = core.formation;
    // au plus près du cortège : la tête, le milieu, la queue
    let near = Infinity;
    let px = this.centerX;
    let pz = this.centerZ;
    for (let k = 0; k < 3; k++) {
      core.corridor.at(k === 0 ? f.headS : k === 1 ? (f.headS + f.tailS) * 0.5 : f.tailS, core.rp);
      const d = sense.policeNear(core.rp.x, core.rp.z, 7);
      if (d < near) {
        near = d;
        px = core.rp.x;
        pz = core.rp.z;
      }
    }
    if (near < 50) {
      if (this.policeNearSince < 0) this.policeNearSince = now;
      // dispositif massif et visible par temps calme : ressenti comme une provocation
      if (now >= this.nextPresence && sense.nearCount >= 8 && this.tension < 0.15 && !sense.recentViolence(px, pz, 60)) {
        this.nextPresence = now + 60 * core.timeScale;
        core.emotions.stir(px, pz, 50, 0, 0.05);
        core.emotions.addLegit(px, pz, -0.03);
        this.addTension(0.05, px, pz, 'presence_massive');
      }
    } else if (near > 80 && this.policeNearSince >= 0) {
      // les forces se sont retirées à plus de 80 m : apaisement (faible si la colère locale reste forte)
      if (now - this.policeNearSince > 8) core.emotions.stimulus('retrait', this.centerX, this.centerZ, true, this.meanAnger > 0.6 ? 0.2 : 1);
      this.policeNearSince = -1;
    }
  }

  /** Conduite du cortège : départ, allure, arrêts, tampon du service d'ordre, barrage. */
  private cortege(): void {
    const core = this.core;
    const f = core.formation;
    const now = core.now;
    const marching = (this.base === 'depart' || this.base === 'cortege') && !core.isStatic;
    f.marching = marching;
    if (!marching) return;
    // la tête ralentit puis s'arrête quand cela chauffe devant elle
    core.corridor.at(f.headS, core.rp);
    const hot = this.tensionAt(core.rp.x, core.rp.z);
    f.speedFactor = (hot > 0.7 ? 0 : hot > 0.5 ? 0.55 : 1) * this.rush;
    // le service d'ordre ouvre le tampon pour détacher son cortège du cortège de tête
    f.bufferTarget = hot > 0.4 ? T.BUFFER_TENSE : T.BUFFER_CALM;
    if (this.base === 'cortege' && now >= this.nextHalt && !f.halted) {
      const K = Math.min(1.5, Math.max(0.6, core.timeScale));
      f.halt(core.rngEmo.range(T.HALT_MIN, T.HALT_MAX) * K, 'pause');
      this.nextHalt = now + core.rngEmo.range(T.HALT_EVERY_MIN, T.HALT_EVERY_MAX) * core.timeScale;
    }
    // barrage sur le parcours déclaré : frustration, puis les organisateurs renoncent
    if (f.blockedByBarrage) {
      if (this.blockedSince < 0) {
        this.blockedSince = now;
        this.blockedTold = false;
      }
      const waited = now - this.blockedSince;
      if (!this.blockedTold && waited > 45 * core.timeScale) {
        this.blockedTold = true;
        core.corridor.at(f.headS, core.rp);
        this.addTension(0.1, core.rp.x, core.rp.z, 'parcours_coupe');
        core.emotions.stir(core.rp.x, core.rp.z, 40, 0, 0.08);
        core.voices.chant('Laissez-nous passer !', 'Laissez-nous passer !', core.rp.x, core.rp.z, 0.8);
      }
      if (waited > 150 * core.timeScale) this.announceDispersal('parcours_coupe');
    } else this.blockedSince = -1;
  }

  private phases(): void {
    const core = this.core;
    const now = core.now;
    const sch = core.schedule;
    const base = this.base;
    const f = core.formation;
    const pending = core.metro.pending;
    const few = this.peak > 0 && this.present <= Math.max(1, this.peak * T.END_SHARE);
    switch (base) {
      case 'rassemblement':
        if (now >= this.departAt) {
          this.setBase('depart');
          // ceux qui sont encore loin de leur bloc ne le rattraperont pas : ils fermeront la marche
          for (let i = 0; i < core.brains.length; i++) {
            const b = core.brains[i]!;
            if (b.state !== S.ARRIVE || b.slot < 0 || (b.flags & (F.BANNER | F.GUIDE)) !== 0) continue;
            f.sample(b.slot, core.slot);
            if (Math.hypot(core.slot.x - b.person.x, core.slot.z - b.person.z) > 30) {
              b.slot = f.allocTail(core.rngArrive);
              b.flags |= F.LATE;
              b.path = null;
            }
          }
          const pos = core.v2;
          core.sono.position(pos);
          core.voices.announce('depart', DEPART_TEXT, pos.x, pos.z);
        }
        break;
      case 'depart':
        if (now >= this.departAt + sch.depart) this.setBase('cortege');
        else if (few && pending === 0 && now - this.phaseAt > 15) this.finish();
        break;
      case 'cortege': {
        const begun = this.departAt + sch.depart;
        if (few && pending === 0) this.finish();
        else if (now >= this.marchEnd) this.announceDispersal('organisateurs');
        else if (f.arrived && !core.isStatic && now - begun > sch.march * 0.3 && now - this.phaseAt > 20) this.announceDispersal('arrivee');
        break;
      }
      case 'dispersion':
        if (few && now - this.phaseAt > 10) this.finish();
        else if (now >= this.disperseEnd) this.setBase('apres_manif');
        break;
      case 'apres_manif':
        if (few && now - this.phaseAt > 5) this.finish();
        else if (now >= this.afterEnd) {
          // le temps est écoulé : prolongations tant que la foule reste, trois au plus
          if (this.overtime < T.OVERTIME_MAX) {
            this.overtime++;
            this.afterEnd = now + T.OVERTIME * Math.min(1.5, Math.max(0.3, core.timeScale));
          } else this.finish();
        }
        break;
      default:
        break;
    }
  }

  private finish(): void {
    this.core.formation.marching = false;
    this.setBase('terminee');
  }
}
