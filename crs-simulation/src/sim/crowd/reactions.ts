/* =====================================================================================
 * FOULE — réactions aux dangers et aux faits proches : sortir d'un nuage de gaz en tenant compte du
 * vent, fuir une charge sur 30 à 60 m dans l'axe de la rue, chercher l'issue d'une nasse, faire cercle
 * autour d'un blessé et appeler les secours, huer ou filmer une interpellation.
 * (Suite de behavior.ts : ces méthodes sont appelées par la réflexion de chaque personne.)
 * ===================================================================================== */

import type { Person, RayHit, RoadSample } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import { makeRayHit } from '@/core/null-services';
import { HELP_EVENT, KETTLE_EVENT } from './api';
import type { HelpEvent, KettleEvent, PoliceSight } from './api';
import { A, F, S } from './brain';
import type { CrowdBrain } from './brain';
import type { Behavior } from './behavior';
import type { CrowdCore } from './core';
import type { Spot } from './sense';
import * as T from './tuning';

export class Reactions {
  private readonly sight: PoliceSight = { id: 0, x: 0, z: 0, dist: Infinity, count: 0, closing: 0 };
  private readonly hit: RayHit = makeRayHit();
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  private readonly help: HelpEvent = { personId: 0, byId: 0, x: 0, z: 0 };
  private readonly kettleEv: KettleEvent = { enclosed: true, x: 0, z: 0, people: 0 };
  nextKettleTension = 0;

  constructor(private readonly core: CrowdCore, private readonly mind: Behavior) {}


  /** Sort du nuage (ou s'écarte du feu) : direction où l'air est le plus sain, pas sous le vent, pas dans un mur. */
  avoidGas(p: Person, b: CrowdBrain, gasHere: number, fire: boolean): void {
    const core = this.core;
    const ctx = core.ctx;
    const hazards = ctx.hazards;
    const now = core.now;
    if (b.gasSince < 0 && !fire) {
      b.gasSince = now;
      b.dir = NaN;
      core.sense.gas.add(p.x, p.z, now);
    }
    if (b.state !== S.AVOID) {
      this.mind.setState(b, S.AVOID);
      if (!fire) this.mind.gesture(p, b, A.COVER, 30);
      else {
        b.dir = NaN;
        if (p.fear < 0.5) p.fear = Math.min(1, p.fear + 0.2);
      }
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
      const x1 = p.x + dx * Math.min(7, reach);
      const z1 = p.z + dz * Math.min(7, reach);
      let g1 = hazards.gasAt(x1, z1);
      let g2 = hazards.gasAt(p.x + dx * reach, p.z + dz * reach);
      if (fire) {
        g1 += hazards.fireAt(p.x + dx * 3, p.z + dz * 3) * 4 + hazards.fireAt(x1, z1) * 3;
        g2 += hazards.fireAt(p.x + dx * reach, p.z + dz * reach) * 2;
      }
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
    b.run = fire || gasHere > 0.15 || p.gas > 0.3;
    b.speed = b.run ? 3.4 : 1.7;
    b.threatX = p.x;
    b.threatZ = p.z;
    b.threatUntil = now + 90 * core.timeScale;
    // les pacifiques se tiennent ensuite à 40 – 60 m du nuage (bible F.3)
    b.threatDist = T.BACKOFF_MIN + (T.BACKOFF_MAX - T.BACKOFF_MIN) * b.docility;
  }

  /** Point à `dist` m en s'éloignant de (fx, fz), de préférence dans l'axe de la rue. */
  awayAlongRoad(p: Person, b: CrowdBrain, fx: number, fz: number, dist: number): void {
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
    if (b.act !== A.NONE) this.mind.endGesture(p, b);
    this.mind.setState(b, S.FLEE);
  }

  /** Pris dans une nasse : on se presse vers ce qui ressemble à une issue, on réclame de sortir. */
  stranded(p: Person, b: CrowdBrain, kettle: Spot, now: number, dt: number): void {
    const core = this.core;
    const tune = T.PROFILE[p.profile ?? 'pacifique'];
    // encerclement sans sortie : peur et colère montent chaque seconde, la légitimité baisse (bible F.4)
    p.fear = Math.min(1, p.fear + 0.01 * dt * tune.fearK);
    p.anger = Math.min(1, p.anger + 0.01 * dt * tune.angerK);
    if (b.state !== S.STRANDED) {
      this.mind.setState(b, S.STRANDED);
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
      this.mind.gesture(p, b, A.CALL, 3);
    }
  }

  /** Blessé à terre tout près : on s'arrête, on fait cercle, quelqu'un appelle les secours. */
  watchCasualty(p: Person, b: CrowdBrain, now: number): boolean {
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
    this.mind.setState(b, S.WATCH);
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
      this.mind.gesture(p, b, A.CALL, 4);
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
  watchArrest(p: Person, b: CrowdBrain, now: number, keep: number): boolean {
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
          this.mind.gesture(p, b, A.BOO, 5);
          core.voices.boo(spot.x, spot.z, spot.a === 1 ? 0.3 : 0.8);
        } else this.mind.gesture(p, b, A.FILM, 8);
      }
    }
    if (now > b.gawkUntil) return false;
    this.mind.setState(b, S.WATCH);
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

}
