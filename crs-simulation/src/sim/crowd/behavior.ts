/* =====================================================================================
 * FOULE — comportement individuel : la machine à états de chaque manifestant.
 *
 * Réflexion ÉTALÉE : chaque personne réfléchit toutes les 0,3 s près du joueur, 0,55 s à distance
 * moyenne, 1,1 s au loin, à des instants décalés ; entre deux réflexions, la conduite (steer.ts) ne fait
 * que suivre l'état décidé. Ordre des décisions : personne ne pilote (joueur, à terre, interpellé) →
 * émotions → contrôleur de comportement enregistré pour le profil → dangers immédiats (gaz, compression,
 * charge, forces trop proches, canon à eau) → peur → départ décidé → nasse → blessé ou interpellation à
 * proximité → comportement de la phase (arriver, se rassembler, marcher, rester) → gestes d'ambiance.
 * ===================================================================================== */

import type { ItemId, Person, RayHit, RoadSample } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import { makeRayHit } from '@/core/null-services';
import { HELP_EVENT, KETTLE_EVENT } from './api';
import type { HelpEvent, KettleEvent, PoliceSight } from './api';
import { A, F, S } from './brain';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import type { Spot } from './sense';
import * as T from './tuning';

const SIGNS: readonly ItemId[] = ['pancarte', 'drapeau'];

export class Behavior {
  private readonly sight: PoliceSight = { id: 0, x: 0, z: 0, dist: Infinity, count: 0, closing: 0 };
  private readonly hit: RayHit = makeRayHit();
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  private focusX = NaN;
  private focusZ = NaN;
  private readonly help: HelpEvent = { personId: 0, byId: 0, x: 0, z: 0 };
  private readonly kettleEv: KettleEvent = { enclosed: true, x: 0, z: 0, people: 0 };
  private nextKettleTension = 0;
  /** Réflexions exécutées au dernier pas (diagnostic). */
  thinks = 0;

  constructor(private readonly core: CrowdCore) {}

  reset(): void {
    this.nextKettleTension = 0;
    this.thinks = 0;
  }

  // ───────────────────────────── boucle ─────────────────────────────

  update(dt: number): void {
    const core = this.core;
    const now = core.now;
    const members = core.members;
    const brains = core.brains;
    const steering = core.steering;
    const player = core.ctx.player.person();
    this.focusX = player ? player.x : NaN;
    this.focusZ = player ? player.z : NaN;
    let thinks = 0;
    for (let i = 0; i < members.length; i++) {
      const p = members[i]!;
      const b = brains[i]!;
      if (p.isPlayer || p.dormant) continue;
      if (now >= b.nextThink) {
        thinks++;
        this.think(p, b, now);
        if (brains[i] !== b) {
          // la personne vient de quitter le jeu : une autre a pris sa place dans le tableau
          i--;
          continue;
        }
      }
      steering.step(p, b, dt);
    }
    this.thinks = thinks;
  }

  setState(b: CrowdBrain, state: number): void {
    if (b.state === state) return;
    const p = b.person;
    if (b.state === S.SIT && p.posture === 'sit') p.posture = 'stand';
    b.state = state;
    b.stateSince = this.core.now;
    if (state !== S.HOLD && state !== S.WATCH && state !== S.GATHER) b.lookX = NaN;
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  private think(p: Person, b: CrowdBrain, now: number): void {
    const core = this.core;
    const dt = Math.min(3, now - b.lastThink);
    b.lastThink = now;
    let every = T.THINK_NEAR + 0.2;
    if (this.focusX === this.focusX) {
      const d2 = (p.x - this.focusX) * (p.x - this.focusX) + (p.z - this.focusZ) * (p.z - this.focusZ);
      every = d2 < T.LOD_NEAR * T.LOD_NEAR ? T.THINK_NEAR : d2 < T.LOD_MID * T.LOD_MID ? T.THINK_MID : T.THINK_FAR;
    }
    b.nextThink = now + every * (0.85 + 0.3 * core.rngThink.next());

    // ── personne ne pilote : interpellé, tenu, en véhicule, à terre ──
    if (p.custody !== 'free' || p.heldBy !== 0 || p.vehicleId !== 0 || p.posture === 'down' || p.stun > 2) return;
    if (b.act !== A.NONE && now >= b.actUntil) this.endGesture(p, b);

    const bystander = (b.flags & F.BYSTANDER) !== 0;
    const tune = bystander ? T.PROFILE.badaud : T.PROFILE[p.profile ?? 'pacifique'];
    const speed2 = p.vx * p.vx + p.vz * p.vz;
    core.emotions.upkeep(p, b, dt, speed2 > 0.09);
    if (now >= b.nextRad) core.emotions.radicalize(p, b);

    // ── contrôleur enregistré pour ce profil ──
    const list = core.controllersFor(p.profile, bystander);
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      let took = false;
      try {
        took = c.think(p, b, core.api, dt);
      } catch (err) {
        console.error('[crowd] contrôleur « ' + c.id + ' » en erreur', err);
      }
      if (!took) continue;
      if (b.index < 0) return;
      if (b.controller !== c) {
        if (b.controller && b.controller.release) b.controller.release(p, b);
        b.controller = c;
      }
      this.setState(b, S.CUSTOM);
      return;
    }
    if (b.controller !== null) {
      if (b.controller.release) b.controller.release(p, b);
      b.controller = null;
      if (b.state === S.CUSTOM) this.setState(b, S.REGROUP);
    }

    // ── en train de partir ──
    if (b.state === S.LEAVE) {
      this.leaving(p, b, now);
      return;
    }

    // ── 1. gaz : se couvrir le visage, sortir du nuage ──
    const hazards = core.ctx.hazards;
    const gasHere = hazards.gasAt(p.x, p.z);
    if (p.gas > T.GAS_FEEL || gasHere > T.GAS_AIR) {
      this.avoidGas(p, b, gasHere);
      return;
    }
    if (b.state === S.AVOID) {
      // sorti du nuage (ou de la cohue) : on tousse, on reprend ses esprits
      if (b.gasSince >= 0) this.gesture(p, b, A.COUGH, 3 + 3 * core.rngThink.next());
      b.gasSince = -1;
      b.run = false;
      this.setState(b, S.REGROUP);
    }
    // ── 2. compression : chercher l'issue ──
    if (b.density >= T.DENSITY_ALERT && core.density.escape(p, b)) {
      b.run = false;
      b.speed = 1.1;
      this.setState(b, S.AVOID);
      return;
    }
    // ── 3. fuite en cours ──
    if (b.state === S.FLEE) {
      const left = Math.hypot(b.tx - p.x, b.tz - p.z);
      if (now < b.fleeUntil && left > 2.5 && !this.stalled(p, b, now, 1.2)) return;
      b.run = false;
      this.setState(b, S.REGROUP);
    }
    // ── 4. charge ou bond offensif vers soi ──
    const charges = core.sense.charges.items;
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i]!;
      if (c.t < now || b.seenCharge === c.id) continue;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const ahead = dx * c.a + dz * c.b;
      if (ahead < -4 || ahead > 46 || Math.abs(dx * c.b - dz * c.a) > 26) continue;
      b.seenCharge = c.id;
      this.startFlee(p, b, c.x, c.z, tune.flee * (0.75 + 0.5 * core.rngThink.next()));
      return;
    }
    // ── 5. forces de l'ordre à proximité ──
    const sense = core.sense;
    if (sense.policeTotal > 0 && sense.policeNear(p.x, p.z, 2) < 30 && sense.nearestPolice(p.x, p.z, 26, this.sight)) {
      const sight = this.sight;
      // une ligne qui court vers soi : c'est une charge, annoncée ou non
      if (sight.closing > 2 && sight.dist < 24 && sight.count >= 2) {
        if (p.fear < 0.4) p.fear = Math.min(1, p.fear + 0.3 * tune.fearK);
        this.startFlee(p, b, sight.x, sight.z, tune.flee * (0.75 + 0.5 * core.rngThink.next()));
        return;
      }
      // distance tenue : plus grande si l'on a peur, plus courte si l'on est en colère et solidaire
      let keep = tune.keep * (0.85 + 0.3 * b.courage);
      if (p.fear > tune.backOff) keep = Math.max(keep, 24);
      else if (p.anger > 0.6 && core.emotions.legitAt(p.x, p.z) < 0.4) keep = Math.min(keep, 8);
      if (sight.dist < keep && !(b.flags & F.PINNED)) {
        const k = (keep - sight.dist + 1.5) / Math.max(0.5, sight.dist);
        b.tx = p.x + (p.x - sight.x) * k;
        b.tz = p.z + (p.z - sight.z) * k;
        b.path = null;
        b.speed = sight.closing > 0.6 ? 1.8 : 1.1;
        b.run = sight.closing > 0.6;
        b.lookX = sight.x;
        b.lookZ = sight.z;
        this.setState(b, S.HOLD);
        if (p.anger > 0.5 && core.rngThink.chance(0.15)) {
          this.gesture(p, b, A.BOO, 4);
          core.voices.boo(p.x, p.z, p.anger);
        }
        return;
      }
    }
    if (b.state === S.HOLD) this.setState(b, S.REGROUP);
    // ── 6. canon à eau : hors de portée ──
    const water = sense.water.near(p.x, p.z, 14, now - 3);
    if (water !== null) {
      this.startFlee(p, b, water.a, water.b, 30 + 15 * core.rngThink.next());
      return;
    }
    // ── 7. peur : quitter les lieux, ou reculer loin du dernier danger ──
    const quit = tune.quit * (0.85 + 0.3 * b.courage);
    const kettle = sense.kettleAt(p.x, p.z);
    if (p.fear > quit && kettle === null && !(b.flags & F.PINNED)) {
      this.startLeaving(p, b, -1);
      return;
    }
    if (b.threatUntil > now && p.fear > tune.backOff && kettle === null) {
      const d = Math.hypot(p.x - b.threatX, p.z - b.threatZ);
      if (d < b.threatDist) {
        this.awayAlongRoad(p, b, b.threatX, b.threatZ, Math.min(30, b.threatDist - d + 6));
        b.speed = 1.7;
        b.run = false;
        this.setState(b, S.REGROUP);
        b.stateSince = now + 6; // ne repart pas vers sa place avant d'être à bonne distance
        return;
      }
    }
    // ── 8. départ décidé (sommations, dispersion annoncée, fatigue) ──
    if (now >= b.leaveAt && !(b.flags & F.PINNED)) {
      if (kettle === null) {
        this.startLeaving(p, b, -1);
        return;
      }
    }
    // ── 9. nasse : pression vers les issues ──
    if (kettle !== null) {
      this.stranded(p, b, kettle, now, dt);
      return;
    }
    if (b.state === S.STRANDED) this.setState(b, S.REGROUP);
    // ── 10. assis : retenu par un sit-in, ou assis de soi-même pour souffler ──
    if (b.flags & F.PINNED) {
      this.setState(b, S.SIT);
      return;
    }
    if (b.flags & F.RESTING) {
      if (now < b.timer && core.formation.headSpeed < 0.05 && p.fear < 0.2) {
        this.setState(b, S.SIT);
        return;
      }
      b.flags &= ~F.RESTING;
    }
    if (b.state === S.SIT) this.setState(b, S.REGROUP);
    // ── course à faire (aléa) : aller se poster quelque part un moment ──
    if (b.watchId === -1) {
      if (now < b.watchUntil) {
        this.setState(b, S.WATCH);
        core.steering.goTo(p, b, b.watchX, b.watchZ, 1.25 * b.pace, false);
        return;
      }
      b.watchId = 0;
    }
    // ── 11. blessé à terre tout près, interpellation en vue ──
    if (!bystander || p.fear < 0.2) {
      if (this.watchCasualty(p, b, now)) return;
      if (this.watchArrest(p, b, now, tune.keep)) return;
    }
    if (b.state === S.WATCH) this.setState(b, S.REGROUP);
    // ── 12. comportement de la phase ──
    this.byPhase(p, b, now, bystander);
    // ── 13. gestes d'ambiance ──
    if (b.act === A.NONE && (b.flags & F.BANNER) === 0) this.ambient(p, b, now, bystander);
  }

  /** Aucune progression depuis `seconds` ? (met à jour le repère) */
  private stalled(p: Person, b: CrowdBrain, now: number, seconds: number): boolean {
    const d = Math.hypot(p.x - b.stuckX, p.z - b.stuckZ);
    if (d > 0.6) {
      b.stuckX = p.x;
      b.stuckZ = p.z;
      b.stuckSince = now;
      b.stuck = 0;
      return false;
    }
    return now - b.stuckSince > seconds;
  }

  // ───────────────────────────── phases ─────────────────────────────

  private byPhase(p: Person, b: CrowdBrain, now: number, bystander: boolean): void {
    const core = this.core;
    const f = core.formation;
    const base = core.director.base;
    if (bystander) {
      this.bystand(p, b, now);
      return;
    }
    if (base === 'terminee') {
      this.startLeaving(p, b, -1);
      return;
    }
    const hasSlot = b.slot >= 0 && b.slot < f.slotCount;
    const cortege = base === 'rassemblement' || base === 'depart' || base === 'cortege';
    if (!hasSlot || (!cortege && base === 'apres_manif')) {
      this.linger(p, b, now);
      return;
    }
    // après une fuite ou un nuage : reprendre son souffle avant de revenir
    if (b.state === S.REGROUP && now - b.stateSince < 3 + 3 * b.courage) {
      if (now - b.stateSince >= 0) {
        b.tx = p.x;
        b.tz = p.z;
        b.path = null;
      }
      return;
    }
    f.sample(b.slot, core.slot);
    const sx = core.slot.x;
    const sz = core.slot.z;
    const d = Math.hypot(sx - p.x, sz - p.z);
    if (d > 22 || (d > 7 && b.state !== S.MARCH && b.state !== S.GATHER)) {
      // loin de sa place : on la rejoint par les rues
      const speed = T.WALK_MAX * b.pace * (f.marching && d > 30 ? 1.25 : 1);
      if (b.state !== S.ARRIVE) {
        this.setState(b, S.ARRIVE);
        b.path = null;
      }
      const moved = Math.hypot(sx - b.tx, sz - b.tz);
      b.speed = speed;
      b.run = f.marching && d > 45;
      if (b.run) b.speed = T.RUN_CATCHUP;
      if (b.path === null && !b.pathPending) {
        b.tx = sx;
        b.tz = sz;
        if (d > 28 || !core.ctx.world.lineOfSight(p.x, p.z, sx, sz)) core.nav.request(b);
      } else if (moved > 25 && !b.pathPending) {
        // la place a avancé avec le cortège : on vise sa nouvelle position
        b.tx = sx;
        b.tz = sz;
        if (b.path !== null && b.pathI * 2 >= b.path.length - 2) core.nav.request(b);
      } else if (b.path === null) {
        b.tx = sx;
        b.tz = sz;
      }
      if (this.stalled(p, b, now, 3)) {
        b.stuckSince = now;
        if (++b.stuck > 3 && (b.flags & F.LATE) !== 0) b.slot = -1;
        else core.nav.request(b);
      }
      return;
    }
    b.path = null;
    b.run = false;
    this.setState(b, f.marching ? S.MARCH : S.GATHER);
    if (!f.marching && base === 'rassemblement' && core.voices.clapUntil > now) {
      b.lookX = core.voices.clapX;
      b.lookZ = core.voices.clapZ;
    } else b.lookX = NaN;
  }

  /** Reste dans les parages (après-manif, arrivée tardive sans place) : par petits déplacements autour d'un point. */
  private linger(p: Person, b: CrowdBrain, now: number): void {
    const core = this.core;
    if (b.state !== S.LINGER) {
      this.setState(b, S.LINGER);
      // point d'attache : là où l'on est si le cortège est fini, sinon près de la tête
      if (core.director.base === 'apres_manif' || core.director.base === 'dispersion') {
        b.anchorX = p.x;
        b.anchorZ = p.z;
      } else {
        core.corridor.at(core.formation.headS - 6 - 20 * b.docility, core.rp);
        b.anchorX = core.rp.x - core.rp.tz * core.rp.half * (b.courage - 0.5);
        b.anchorZ = core.rp.z + core.rp.tx * core.rp.half * (b.courage - 0.5);
      }
      b.timer = now;
    }
    if (now >= b.timer) {
      b.timer = now + 8 + 14 * core.rngThink.next();
      if (core.formation.marching) {
        core.corridor.at(core.formation.headS - 6 - 20 * b.docility, core.rp);
        b.anchorX = core.rp.x - core.rp.tz * core.rp.half * (b.courage - 0.5);
        b.anchorZ = core.rp.z + core.rp.tx * core.rp.half * (b.courage - 0.5);
      }
      const a = core.rngThink.next() * 6.283;
      const r = 1 + 5 * core.rngThink.next();
      core.steering.goTo(p, b, b.anchorX + Math.sin(a) * r, b.anchorZ + Math.cos(a) * r, 0.9 * b.pace, false);
    }
  }

  /** Badaud en lisière : regarde passer le cortège, le suit un peu, s'en va dès que cela se gâte. */
  private bystand(p: Person, b: CrowdBrain, now: number): void {
    const core = this.core;
    this.setState(b, S.BYSTAND);
    const base = core.director.base;
    if (base === 'dispersion' || base === 'apres_manif' || base === 'terminee' || core.director.tensionAt(p.x, p.z) > 0.45) {
      if (b.leaveAt === Infinity) b.leaveAt = now + 5 + 40 * b.docility * core.timeScale;
      return;
    }
    if (now < b.timer) return;
    b.timer = now + 15 + 30 * core.rngThink.next();
    // se replace à hauteur du cortège, contre les façades
    const f = core.formation;
    const s = f.headS - 10 - (f.headS - f.tailS) * core.rngThink.next();
    core.corridor.at(s, core.rp);
    const own = core.corridor.project(p.x, p.z, s, 400);
    if (Math.abs(own - s) > 35 && f.marching && core.rngThink.chance(0.6)) {
      const side = (p.x - core.rp.x) * -core.rp.tz + (p.z - core.rp.z) * core.rp.tx >= 0 ? 1 : -1;
      const lateral = core.rp.center + side * (core.rp.half + 0.4);
      const x = core.rp.x - core.rp.tz * lateral;
      const z = core.rp.z + core.rp.tx * lateral;
      if (core.ctx.world.isFree(x, z, 0.35)) core.steering.goTo(p, b, x, z, 1.1, false);
    }
    core.corridor.at(own, core.rp);
    b.lookX = core.rp.x;
    b.lookZ = core.rp.z;
  }

  // ───────────────────────────── dangers ─────────────────────────────

  /** Sort du nuage : direction où le gaz est le moins dense, pas sous le vent, pas dans un mur. */
  private avoidGas(p: Person, b: CrowdBrain, gasHere: number): void {
    const core = this.core;
    const ctx = core.ctx;
    const hazards = ctx.hazards;
    const now = core.now;
    if (b.gasSince < 0) {
      b.gasSince = now;
      b.dir = NaN;
      core.sense.gas.add(p.x, p.z, now);
    }
    if (b.state !== S.AVOID) {
      this.setState(b, S.AVOID);
      this.gesture(p, b, A.COVER, 30);
    }
    const env = ctx.env.state;
    const wind = Math.hypot(env.windX, env.windZ);
    const wx = wind > 0.3 ? env.windX / wind : 0;
    const wz = wind > 0.3 ? env.windZ / wind : 0;
    const sense = core.sense;
    const police = sense.policeNear(p.x, p.z, 3);
    let best = b.dir;
    let bestScore = -Infinity;
    const hit = this.hit;
    for (let k = 0; k < 8; k++) {
      const a = k * 0.7854 + b.phase;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      let reach = 16;
      if (ctx.world.raycast(p.x, p.z, p.x + dx * 16, p.z + dz * 16, hit) && hit.hit) reach = hit.t * 16 - 0.8;
      if (reach < 4) continue;
      const g1 = hazards.gasAt(p.x + dx * Math.min(7, reach), p.z + dz * Math.min(7, reach));
      const g2 = hazards.gasAt(p.x + dx * reach, p.z + dz * reach);
      // le nuage dérive avec le vent : on sort par le travers ou au vent, jamais sous le vent
      let score = -(g1 + g2 * 1.6) - Math.max(0, dx * wx + dz * wz) * 0.3 * Math.min(1, wind / 3) + reach * 0.004;
      if (police < 30 && dx * (sense.nearX - p.x) + dz * (sense.nearZ - p.z) > 0.5 * police) score -= 0.25;
      if (b.dir === b.dir && Math.abs(Math.atan2(Math.sin(a - b.dir), Math.cos(a - b.dir))) < 0.5) score += 0.08;
      if (score > bestScore) {
        bestScore = score;
        best = a;
        b.tx = p.x + dx * reach;
        b.tz = p.z + dz * reach;
      }
    }
    if (best !== best) {
      // enfermé : au moins s'écarter du point le plus dense connu
      b.tx = p.x + (core.rngThink.next() - 0.5) * 8;
      b.tz = p.z + (core.rngThink.next() - 0.5) * 8;
    }
    b.dir = best;
    b.path = null;
    b.run = gasHere > 0.15 || p.gas > 0.3;
    b.speed = b.run ? 3.4 : 1.7;
    b.threatX = p.x;
    b.threatZ = p.z;
    b.threatUntil = now + 90 * core.timeScale;
    // les pacifiques se tiennent ensuite à 40 – 60 m du nuage (bible F.3)
    b.threatDist = T.BACKOFF_MIN + (T.BACKOFF_MAX - T.BACKOFF_MIN) * b.docility;
  }

  /** Point à `dist` m en s'éloignant de (fx, fz), de préférence dans l'axe de la rue. */
  private awayAlongRoad(p: Person, b: CrowdBrain, fx: number, fz: number, dist: number): void {
    const core = this.core;
    const world = core.ctx.world;
    let ax = p.x - fx;
    let az = p.z - fz;
    const al = Math.hypot(ax, az);
    if (al > 0.01) {
      ax /= al;
      az /= al;
    } else {
      ax = Math.sin(b.phase);
      az = Math.cos(b.phase);
    }
    let dx = ax;
    let dz = az;
    if (world.nearestRoad(p.x, p.z, this.road, 30)) {
      let rx = Math.sin(this.road.heading);
      let rz = Math.cos(this.road.heading);
      const dot = rx * ax + rz * az;
      // rue à peu près dans l'axe de la fuite : on la suit ; sinon on garde la direction opposée au danger
      if (Math.abs(dot) > 0.35) {
        if (dot < 0) {
          rx = -rx;
          rz = -rz;
        }
        dx = rx * 0.8 + ax * 0.2;
        dz = rz * 0.8 + az * 0.2;
        const l = Math.hypot(dx, dz);
        dx /= l;
        dz /= l;
      }
    }
    let reach = dist;
    const hit = this.hit;
    if (world.raycast(p.x, p.z, p.x + dx * dist, p.z + dz * dist, hit) && hit.hit) {
      reach = hit.t * dist - 1;
      if (reach < 8) {
        // mur devant : la meilleure des deux directions de travers
        let bestReach = reach;
        for (let side = -1; side <= 1; side += 2) {
          const sx = -az * side;
          const sz = ax * side;
          const r = world.raycast(p.x, p.z, p.x + sx * dist, p.z + sz * dist, hit) && hit.hit ? hit.t * dist - 1 : dist;
          if (r > bestReach) {
            bestReach = r;
            dx = sx;
            dz = sz;
          }
        }
        reach = bestReach;
      }
    }
    if (reach < 1) reach = 1;
    b.tx = p.x + dx * reach + (-dz) * b.sway;
    b.tz = p.z + dz * reach + dx * b.sway;
    b.path = null;
  }

  /** Fuite devant une charge, une détonation, un jet d'eau : 30 à 60 m, puis on se regroupe. */
  startFlee(p: Person, b: CrowdBrain, fromX: number, fromZ: number, dist: number): void {
    const core = this.core;
    if (b.flags & F.PINNED) b.flags &= ~F.PINNED;
    this.awayAlongRoad(p, b, fromX, fromZ, dist);
    const tune = T.PROFILE[p.profile ?? 'pacifique'];
    b.run = true;
    b.speed = Math.min(T.RUN_FLEE, p.speedSprint) * (tune.pace < 0.9 ? 0.66 : 0.9 + 0.1 * b.pace);
    b.fleeUntil = core.now + dist / 2.8 + 3;
    b.threatX = fromX;
    b.threatZ = fromZ;
    b.threatUntil = core.now + 60 * core.timeScale;
    b.threatDist = T.BACKOFF_MIN + (T.BACKOFF_MAX - T.BACKOFF_MIN) * b.docility;
    b.stuckX = p.x;
    b.stuckZ = p.z;
    b.stuckSince = core.now;
    if (b.act !== A.NONE) this.endGesture(p, b);
    this.setState(b, S.FLEE);
  }

  /** Pris dans une nasse : on se presse vers ce qui ressemble à une issue, on réclame de sortir. */
  private stranded(p: Person, b: CrowdBrain, kettle: Spot, now: number, dt: number): void {
    const core = this.core;
    const tune = T.PROFILE[p.profile ?? 'pacifique'];
    // encerclement sans sortie : peur et colère montent chaque seconde, la légitimité baisse (bible F.4)
    p.fear = Math.min(1, p.fear + 0.01 * dt * tune.fearK);
    p.anger = Math.min(1, p.anger + 0.01 * dt * tune.angerK);
    if (b.state !== S.STRANDED) {
      this.setState(b, S.STRANDED);
      b.timer = now;
    }
    if (now >= this.nextKettleTension) {
      this.nextKettleTension = now + 30 * core.timeScale;
      core.director.addTension(0.1, kettle.x, kettle.z, 'encerclement');
      core.emotions.addLegit(kettle.x, kettle.z, -0.15);
      core.emotions.addCohesion(kettle.x, kettle.z, 0.3);
      const ev = this.kettleEv;
      ev.enclosed = true;
      ev.x = kettle.x;
      ev.z = kettle.z;
      ev.people = core.sense.coverAt(kettle.x, kettle.z, kettle.a);
      core.ctx.events.emitAny(KETTLE_EVENT, ev);
    }
    if (now < b.timer) return;
    b.timer = now + 4 + 6 * core.rngThink.next();
    // direction la plus dégagée : ni mur, ni cordon
    const world = core.ctx.world;
    const hit = this.hit;
    let bestScore = -Infinity;
    for (let k = 0; k < 8; k++) {
      const a = k * 0.7854 + b.phase;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      let reach = 18;
      if (world.raycast(p.x, p.z, p.x + dx * 18, p.z + dz * 18, hit) && hit.hit) reach = hit.t * 18 - 0.8;
      const cops = core.sense.nearestPolice(p.x + dx * Math.min(reach, 12), p.z + dz * Math.min(reach, 12), 7, this.sight) ? this.sight.count : 0;
      const score = reach - cops * 5 + core.rngThink.next() * 4;
      if (score > bestScore) {
        bestScore = score;
        const r = Math.max(1, Math.min(reach, 12) - (cops > 0 ? 3 : 0));
        b.tx = p.x + dx * r;
        b.tz = p.z + dz * r;
      }
    }
    b.path = null;
    b.speed = 0.9;
    b.run = false;
    if (core.rngThink.chance(0.2) && core.voices.call(core.rngThink.chance(0.5) ? 'Laissez-nous sortir !' : 'Il y a des enfants ! Laissez-nous sortir !', p.x, p.z, 7)) {
      this.gesture(p, b, A.CALL, 3);
    }
  }

  /** Blessé à terre tout près : on s'arrête, on fait cercle, quelqu'un appelle les secours. */
  private watchCasualty(p: Person, b: CrowdBrain, now: number): boolean {
    const core = this.core;
    const spot = core.sense.casualties.near(p.x, p.z, 9, now - 60);
    if (spot === null) return false;
    const victim = core.ctx.people.get(spot.id);
    if (!victim || victim.posture !== 'down' || victim === p) {
      spot.t = -1e9;
      return false;
    }
    // huit personnes autour, pas plus : les autres passent leur chemin
    if (b.watchId !== spot.id) {
      if (spot.b >= 8 || p.fear > 0.5) return false;
      spot.b++;
      b.watchId = spot.id;
      b.watchUntil = now + 20 + 20 * core.rngThink.next();
    } else if (now > b.watchUntil) return false;
    this.setState(b, S.WATCH);
    const a = b.phase + spot.id;
    const r = 2 + 1.4 * b.courage;
    b.tx = victim.x + Math.sin(a) * r;
    b.tz = victim.z + Math.cos(a) * r;
    b.path = null;
    b.speed = 1.2;
    b.run = false;
    b.lookX = victim.x;
    b.lookZ = victim.z;
    if (spot.a === 0 && Math.hypot(p.x - victim.x, p.z - victim.z) < 4.5) {
      // appel aux secours : une fois par blessé
      spot.a = 1;
      core.voices.call('Médic ! Médic !', victim.x, victim.z, 3);
      this.gesture(p, b, A.CALL, 4);
      const ev = this.help;
      ev.personId = victim.id;
      ev.byId = p.id;
      ev.x = victim.x;
      ev.z = victim.z;
      core.ctx.events.emitAny(HELP_EVENT, ev);
      core.ctx.radio.say({ channel: 'secours', from: 'Manifestant', priority: 2, text: 'Une personne à terre, ' + core.ctx.world.sectorName(victim.x, victim.z) + '. On demande les secours.', personId: p.id });
      const incidents = core.ctx.service<IncidentsApi>(EXT.incidents);
      if (incidents && typeof incidents.open === 'function') {
        try {
          incidents.open('blesse', victim.x, victim.z, 'person', victim.id, victim.injury === 'critical' ? 3 : victim.injury === 'serious' ? 2 : 1);
        } catch (err) {
          console.error('[crowd] ouverture d’incident impossible', err);
        }
      }
    }
    return true;
  }

  /** Interpellation en vue : on hue, on filme, sans s'approcher davantage. */
  private watchArrest(p: Person, b: CrowdBrain, now: number, keep: number): boolean {
    const core = this.core;
    const spot = core.sense.arrests.near(p.x, p.z, 22, now - 14);
    if (spot === null) return false;
    if (b.seenArrest !== spot.t) {
      b.seenArrest = spot.t;
      // interpellation fondée et propre : peu réagissent ; arbitraire : beaucoup
      const share = spot.a === 1 ? 0.25 : 0.7;
      b.gawkUntil = core.rngThink.next() < share ? now + 7 + 6 * core.rngThink.next() : -1;
      if (b.gawkUntil > 0) {
        if (p.anger > 0.35 || spot.a === 0) {
          this.gesture(p, b, A.BOO, 5);
          core.voices.boo(spot.x, spot.z, spot.a === 1 ? 0.3 : 0.8);
        } else this.gesture(p, b, A.FILM, 8);
      }
    }
    if (now > b.gawkUntil) return false;
    this.setState(b, S.WATCH);
    const d = Math.hypot(p.x - spot.x, p.z - spot.z);
    b.lookX = spot.x;
    b.lookZ = spot.z;
    b.path = null;
    b.run = false;
    b.speed = 1;
    if (d < keep) {
      b.tx = p.x + ((p.x - spot.x) / Math.max(0.5, d)) * (keep - d);
      b.tz = p.z + ((p.z - spot.z) / Math.max(0.5, d)) * (keep - d);
    } else {
      b.tx = p.x;
      b.tz = p.z;
    }
    return true;
  }

  // ───────────────────────────── départ ─────────────────────────────

  /** Quitte la manifestation : vers une bouche de métro ouverte ou une rue qui s'éloigne ; le groupe suit. */
  startLeaving(p: Person, b: CrowdBrain, exit: number): void {
    const core = this.core;
    if (b.state === S.LEAVE) return;
    const now = core.now;
    b.flags |= F.LEAVING;
    b.flags &= ~F.PINNED;
    if (b.act !== A.NONE) this.endGesture(p, b);
    core.ctx.actions.setAlt(p, false);
    b.exit = exit >= 0 && exit < core.nav.exits.length ? exit : core.nav.chooseExit(p, b);
    const e = core.nav.exits[b.exit];
    if (!e) return;
    const spread = e.kind === 'rue' ? 3 : 1;
    b.tx = e.x + (b.courage - 0.5) * spread;
    b.tz = e.z + (b.docility - 0.5) * spread;
    b.run = p.fear > 0.55;
    b.speed = b.run ? 3 : T.WALK_MAX * b.pace * (p.fear > 0.3 ? 1.2 : 1);
    b.leaveAt = Math.min(b.leaveAt, now);
    this.setState(b, S.LEAVE);
    core.nav.request(b);
    b.stuckX = p.x;
    b.stuckZ = p.z;
    b.stuckSince = now;
    b.stuck = 0;
    // le groupe repart ensemble
    if (b.group >= 0) {
      const g = core.groups[b.group];
      if (g && g.leaveAt > now + 3) {
        g.leaveAt = now;
        for (let i = 0; i < g.members.length; i++) {
          const q = core.ctx.people.get(g.members[i]!);
          const qb = q ? core.api.brain(q) : null;
          if (qb && qb !== b && qb.leaveAt > now + 2.5) qb.leaveAt = now + 0.3 + 2 * core.rngThink.next();
        }
      }
    }
  }

  private leaving(p: Person, b: CrowdBrain, now: number): void {
    const core = this.core;
    let e = core.nav.exits[b.exit];
    if (!e || !e.open) {
      // l'issue s'est fermée (station fermée entre-temps) : une autre
      const g = b.group >= 0 ? core.groups[b.group] : undefined;
      if (g) {
        g.exit = -1;
        g.path = null;
      }
      b.exit = core.nav.chooseExit(p, b);
      e = core.nav.exits[b.exit];
      if (!e) return;
      b.tx = e.x;
      b.tz = e.z;
      core.nav.request(b);
      return;
    }
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.kind === 'metro') {
      if (d < T.EXIT_REACH_METRO + 1.5 && core.metro.tryEnter(e.stationId)) {
        core.depart(p);
        return;
      }
    } else if (d < T.EXIT_REACH_STREET) {
      core.depart(p);
      return;
    }
    if (p.gas > T.GAS_FEEL) {
      b.run = true;
      b.speed = 3;
    }
    if (this.stalled(p, b, now, 3.5) && d > 8) {
      b.stuckSince = now;
      b.stuck++;
      if (b.stuck >= 3) {
        // décidément bloqué : changer d'issue
        b.stuck = 0;
        const g = b.group >= 0 ? core.groups[b.group] : undefined;
        if (g) {
          g.exit = -1;
          g.path = null;
        }
        const other = core.nav.chooseExit(p, b);
        if (other >= 0) {
          b.exit = other;
          b.tx = core.nav.exits[other]!.x;
          b.tz = core.nav.exits[other]!.z;
        }
      }
      b.path = null;
      core.nav.request(b);
    }
  }

  // ───────────────────────────── sommations, dispersion ─────────────────────────────

  /** Une sommation vient d'être prononcée : à chaque étape une part croissante s'en va, les familles d'abord. */
  hearSommation(stage: number, x: number, z: number): void {
    const core = this.core;
    if (stage < 1 || stage > 3) return;
    const n = core.ctx.people.queryRadius(x, z, T.SOMMATION_HEARD, core.buf);
    const now = core.now;
    for (let i = 0; i < n; i++) {
      const p = core.buf[i]!;
      const b = core.api.brain(p);
      if (!b || b.index < 0 || p.isPlayer) continue;
      if (b.heard > stage) continue;
      b.heard = stage;
      const bystander = (b.flags & F.BYSTANDER) !== 0;
      const tune = bystander ? T.PROFILE.badaud : T.PROFILE[p.profile ?? 'pacifique'];
      let part = tune.leave[stage - 1]!;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > T.SOMMATION_CLEAR) part *= 0.75; // entendue sans être comprise
      // la peur fait partir, la colère fait rester ; solidaire des autres, on reste et on hue
      let mod = 1 + 0.6 * p.fear - 0.8 * Math.max(0, p.anger - 0.25);
      if (p.anger > 0.6 && core.emotions.legitAt(p.x, p.z) < 0.4) mod *= 0.4;
      if (b.docility < part * mod && b.leaveAt > now + 12) {
        b.leaveAt = now + (1.5 + 7 * core.rngThink.next()) * (stage === 3 ? 0.6 : 1);
      }
    }
  }

  /** Les organisateurs annoncent la fin : chacun s'en va à son heure, selon son profil. */
  scheduleDispersal(): void {
    const core = this.core;
    const now = core.now;
    const span = core.schedule.disperse;
    const cap = now + span + core.schedule.after * 0.85;
    for (let i = 0; i < core.brains.length; i++) {
      const b = core.brains[i]!;
      const p = b.person;
      const bystander = (b.flags & F.BYSTANDER) !== 0;
      const tune = bystander ? T.PROFILE.badaud : T.PROFILE[p.profile ?? 'pacifique'];
      // plus on est fatigué, plus on part tôt ; en colère, on traîne
      const u = Math.min(1, Math.max(0, b.docility * (1 - 0.35 * b.fatigue) + 0.25 * Math.max(0, p.anger - 0.4)));
      const at = Math.min(cap, now + (tune.goFrom + u * (tune.goTo - tune.goFrom)) * span + 2 * core.rngThink.next());
      if (at < b.leaveAt) b.leaveAt = at;
    }
  }

  // ───────────────────────────── gestes ─────────────────────────────

  private ambient(p: Person, b: CrowdBrain, now: number, bystander: boolean): void {
    const core = this.core;
    if (b.state !== S.MARCH && b.state !== S.GATHER && b.state !== S.LINGER && b.state !== S.BYSTAND) return;
    const rng = core.rngThink;
    const voices = core.voices;
    const profile = p.profile;
    if (!bystander && voices.chantUntil > now) {
      const d2 = (p.x - voices.chantX) * (p.x - voices.chantX) + (p.z - voices.chantZ) * (p.z - voices.chantZ);
      const zeal = profile === 'militant' || profile === 'meneur' ? 0.8 : profile === 'famille' ? 0.2 : profile === 'service_ordre' ? 0.1 : 0.55;
      if (d2 < 45 * 45 && rng.next() < zeal) {
        this.gesture(p, b, A.CHANT, Math.max(1.5, voices.chantUntil - now));
        return;
      }
    }
    if (!bystander && voices.clapUntil > now && rng.chance(0.5)) {
      const d2 = (p.x - voices.clapX) * (p.x - voices.clapX) + (p.z - voices.clapZ) * (p.z - voices.clapZ);
      if (d2 < 60 * 60 && voices.clapUntil - now < 5) {
        this.gesture(p, b, A.CLAP, voices.clapUntil - now);
        return;
      }
    }
    const r = rng.next();
    if (r < (bystander ? 0.05 : 0.012)) this.gesture(p, b, A.FILM, 5 + 8 * rng.next());
    else if (r < 0.03 && !bystander) this.gesture(p, b, A.SIGN, 5 + 6 * rng.next());
    else if (r < 0.036 && !bystander && b.state === S.GATHER && core.formation.headSpeed < 0.05 && b.fatigue > 0.35 && (b.flags & F.CHILD) === 0) {
      // longue attente, jambes lourdes : on s'assoit un moment
      b.flags |= F.RESTING;
      b.timer = now + 15 + 25 * rng.next();
      this.setState(b, S.SIT);
    } else if (r < 0.05 && b.group >= 0 && b.state !== S.MARCH) {
      // on discute avec quelqu'un de son groupe
      const g = core.groups[b.group];
      const mate = g && g.members.length > 1 ? core.ctx.people.get(g.members[rng.int(0, g.members.length)]!) : undefined;
      if (mate && mate !== p) {
        b.lookX = mate.x;
        b.lookZ = mate.z;
        b.act = A.TALK;
        b.actUntil = now + 4 + 6 * rng.next();
      }
    }
  }

  /** Lance un geste d'ambiance : par les objets (téléphone levé, pancarte brandie) ou par la pose du haut du corps. */
  gesture(p: Person, b: CrowdBrain, act: number, seconds: number): void {
    if ((b.flags & F.BANNER) !== 0 && act !== A.COVER && act !== A.COUGH) return;
    if (b.act !== A.NONE) this.endGesture(p, b);
    const actions = this.core.ctx.actions;
    b.act = act;
    b.actUntil = this.core.now + seconds;
    p.upperT = 0;
    switch (act) {
      case A.FILM:
        b.hand = p.active;
        if (actions.has(p, 'telephone') > 0 && actions.selectById(p, 'telephone')) actions.setAlt(p, true);
        p.upper = 'film';
        break;
      case A.SIGN: {
        const item = actions.activeItem(p);
        if (!item || SIGNS.indexOf(item.id) < 0) {
          let ok = false;
          for (let i = 0; i < SIGNS.length && !ok; i++) ok = actions.has(p, SIGNS[i]!) > 0 && actions.selectById(p, SIGNS[i]!);
          if (!ok) {
            b.act = A.NONE;
            return;
          }
        }
        actions.setAlt(p, true);
        p.upper = 'carry_sign';
        break;
      }
      case A.CHANT:
      case A.BOO:
        p.upper = 'fist';
        break;
      case A.CLAP:
        p.upper = 'clap';
        break;
      case A.COUGH:
        p.upper = 'cough';
        break;
      case A.COVER:
        actions.setAlt(p, false);
        p.upper = 'cover_face';
        break;
      case A.CALL:
      case A.WAVE:
        p.upper = 'wave';
        break;
      default:
        break;
    }
  }

  endGesture(p: Person, b: CrowdBrain): void {
    const actions = this.core.ctx.actions;
    const act = b.act;
    b.act = A.NONE;
    if (act === A.TALK) {
      b.lookX = NaN;
      return;
    }
    if (act === A.FILM || act === A.SIGN) actions.setAlt(p, false);
    if (act === A.FILM && b.hand !== -2) {
      actions.select(p, b.hand);
      b.hand = -2;
    }
    const item = actions.activeItem(p);
    const def = item ? actions.def(item.id) : undefined;
    p.upper = def ? def.idleAnim : 'none';
    p.upperT = 0;
  }
}
