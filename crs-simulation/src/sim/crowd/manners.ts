/* =====================================================================================
 * FOULE — départs, flânerie et gestes : quitter la manifestation (bouche de métro ouverte ou rue qui
 * s'éloigne, en groupe), rester dans les parages, badauds en lisière, gestes d'ambiance (scander le poing
 * levé, applaudir, filmer au téléphone, brandir sa pancarte, s'asseoir, discuter). Les gestes passent par
 * ctx.actions quand un objet est en jeu. (Suite de behavior.ts.)
 * ===================================================================================== */

import type { ItemId, Person } from '@/core/contracts';
import { A, F, S } from './brain';
import type { CrowdBrain } from './brain';
import type { Behavior } from './behavior';
import type { CrowdCore } from './core';
import * as T from './tuning';

const SIGNS: readonly ItemId[] = ['pancarte', 'drapeau'];

export class Manners {
  constructor(private readonly core: CrowdCore, private readonly mind: Behavior) {}

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
    b.dir = NaN;
    this.mind.setState(b, S.LEAVE);
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

  leaving(p: Person, b: CrowdBrain, now: number): void {
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
    // sorti des lieux : loin de la manifestation, hors de vue ; ou en route depuis très longtemps
    const gone = now - b.stateSince;
    if (gone > 20) {
      const home = core.director;
      const far = Math.hypot(p.x - home.homeX, p.z - home.homeZ) > T.LEAVE_STREET_DIST + 60 && core.sense.coverAt(p.x, p.z, 25) < 12;
      if (far || gone > 300 * Math.max(1, core.timeScale)) {
        const player = core.ctx.player.person();
        if (!player || Math.hypot(player.x - p.x, player.z - p.z) > 70) {
          core.depart(p);
          return;
        }
      }
    }
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
    // passage bouché (barricade, cordon, cohue) : on renonce à cette direction et on cherche une autre issue
    const crushed = b.density >= T.DENSITY_ALERT;
    if (this.mind.stalled(p, b, now, crushed ? 1.5 : 3.5) && d > 8) {
      b.stuckSince = now;
      b.stuck++;
      if (b.stuck >= 2 || crushed) {
        b.stuck = 0;
        const g = b.group >= 0 ? core.groups[b.group] : undefined;
        if (g) {
          g.exit = -1;
          g.path = null;
        }
        // direction dans laquelle on butait : le prochain sommet de l'itinéraire, à défaut l'issue
        const path = b.path;
        const wx = path !== null && b.pathI * 2 + 1 < path.length ? path[b.pathI * 2]! : b.tx;
        const wz = path !== null && b.pathI * 2 + 1 < path.length ? path[b.pathI * 2 + 1]! : b.tz;
        b.dir = Math.atan2(wx - p.x, wz - p.z);
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

  /** Reste dans les parages (après-manif, arrivée tardive sans place) : par petits déplacements autour d'un point. */
  linger(p: Person, b: CrowdBrain, now: number): void {
    const core = this.core;
    if (b.state !== S.LINGER) {
      this.mind.setState(b, S.LINGER);
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
  bystand(p: Person, b: CrowdBrain, now: number): void {
    const core = this.core;
    this.mind.setState(b, S.BYSTAND);
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

  ambient(p: Person, b: CrowdBrain, now: number, bystander: boolean): void {
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
      this.mind.setState(b, S.SIT);
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
