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

import type { Person } from '@/core/contracts';
import type { PoliceSight } from './api';
import { A, F, S } from './brain';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import { Manners } from './manners';
import { Reactions } from './reactions';
import * as T from './tuning';

export class Behavior {
  private readonly sight: PoliceSight = { id: 0, x: 0, z: 0, dist: Infinity, count: 0, closing: 0 };
  private focusX = NaN;
  private focusZ = NaN;
  private readonly react: Reactions;
  private readonly manners: Manners;
  /** Réflexions exécutées au dernier pas (diagnostic). */
  thinks = 0;

  constructor(private readonly core: CrowdCore) {
    this.react = new Reactions(core, this);
    this.manners = new Manners(core, this);
  }

  reset(): void {
    this.react.nextKettleTension = 0;
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
      this.manners.leaving(p, b, now);
      return;
    }

    // ── 1. gaz, feu : se couvrir le visage, sortir du nuage, s'écarter des flammes ──
    const hazards = core.ctx.hazards;
    const gasHere = hazards.gasAt(p.x, p.z);
    const fireHere = hazards.fireAt(p.x, p.z);
    if (p.gas > T.GAS_FEEL || gasHere > T.GAS_AIR || fireHere > 0.04 || p.burning > 0.05) {
      // même réflexe devant des flammes : s'en écarter tout de suite
      this.react.avoidGas(p, b, gasHere, fireHere > 0.04 || p.burning > 0.05);
      return;
    }
    if (b.state === S.AVOID) {
      // sorti du nuage (ou de la cohue) : on tousse, on reprend ses esprits — mais pas au bord du nuage, où l'on
      // gênerait ceux qui en sortent encore : on s'en écarte de dix à vingt-cinq mètres
      const gassed = b.gasSince >= 0;
      if (gassed) this.gesture(p, b, A.COUGH, 3 + 3 * core.rngThink.next());
      b.gasSince = -1;
      b.run = false;
      this.setState(b, S.REGROUP);
      const src = gassed ? core.sense.gas.near(p.x, p.z, 60, now - 180) : null;
      if (src !== null) {
        this.react.awayAlongRoad(p, b, src.x, src.z, 10 + 15 * b.docility);
        b.speed = 1.6;
        b.stateSince = now + 5;
      }
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
      if (now < b.fleeUntil && left > 2.5) {
        // bloqué par ceux de devant ? Tant que le danger est sur ses talons, on pousse quand même : à l'arrière on
        // ne voit pas que l'avant ne peut plus avancer — c'est ainsi que naissent les bousculades (dossier 03 §5.6)
        if (!this.stalled(p, b, now, 1.2) || core.sense.policeNear(p.x, p.z, 2) < 22) return;
      }
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
    if (b.panic > now) {
      // mouvement de foule : on suit ceux qui fuient
      b.panic = -1;
      this.startFlee(p, b, b.threatX, b.threatZ, tune.flee * (0.6 + 0.4 * core.rngThink.next()));
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
        this.react.awayAlongRoad(p, b, b.threatX, b.threatZ, Math.min(30, b.threatDist - d + 6));
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
      this.react.stranded(p, b, kettle, now, dt);
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
      if (this.react.watchCasualty(p, b, now)) return;
      if (this.react.watchArrest(p, b, now, tune.keep)) return;
    }
    if (b.state === S.WATCH) this.setState(b, S.REGROUP);
    // ── 12. comportement de la phase ──
    this.byPhase(p, b, now, bystander);
    // ── 13. gestes d'ambiance ──
    if (b.act === A.NONE && (b.flags & F.BANNER) === 0) this.manners.ambient(p, b, now, bystander);
  }

  /** Aucune progression depuis `seconds` ? (met à jour le repère) */
  stalled(p: Person, b: CrowdBrain, now: number, seconds: number): boolean {
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
      this.manners.bystand(p, b, now);
      return;
    }
    // (les foyers et les autres manifestations ont leur propre déroulé : la fin du cortège principal ne les renvoie pas)
    if (base === 'terminee' && (b.flags & F.FOYER) === 0) {
      this.startLeaving(p, b, -1);
      return;
    }
    const hasSlot = b.slot >= 0 && b.slot < f.slotCount;
    const cortege = base === 'rassemblement' || base === 'depart' || base === 'cortege';
    if (!hasSlot || (!cortege && base === 'apres_manif')) {
      this.manners.linger(p, b, now);
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
    const inPlace = b.state === S.MARCH || b.state === S.GATHER;
    if (d > 4) {
      // sa place est dans le gaz ou dans les flammes (ou le chemin y passe) : on attend à l'air libre
      const hazards = core.ctx.hazards;
      const mx = (sx + p.x) * 0.5;
      const mz = (sz + p.z) * 0.5;
      if (hazards.gasAt(sx, sz) > T.GAS_CLEAR || hazards.gasAt(mx, mz) > T.GAS_AIR || hazards.fireAt(sx, sz) > 0.02 || hazards.fireAt(mx, mz) > 0.02) {
        this.setState(b, S.REGROUP);
        b.stateSince = now;
        b.tx = p.x;
        b.tz = p.z;
        b.path = null;
        b.run = false;
        b.lookX = sx;
        b.lookZ = sz;
        return;
      }
    }
    if (d > (inPlace ? 20 : 3.2)) {
      this.approach(p, b, now, d, sx, sz);
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

  /**
   * Rejoint sa place dans le cortège. De loin : par les rues. Cortège à l'arrêt : droit vers sa place, en se
   * faufilant. Cortège en marche : par derrière, en remontant le passage du flanc si l'on est loin ; et si
   * l'on est en avant de son rang, on attend sur le côté qu'il arrive à sa hauteur.
   */
  private approach(p: Person, b: CrowdBrain, now: number, d: number, sx: number, sz: number): void {
    const core = this.core;
    const f = core.formation;
    if (b.state !== S.ARRIVE) {
      this.setState(b, S.ARRIVE);
      b.path = null;
      b.side = 0;
    }
    const marching = f.marching;
    b.run = marching && d > 30;
    b.speed = b.run ? T.RUN_CATCHUP : T.WALK_MAX * b.pace * (marching ? 1.2 : 1);
    let sSlot = f.slotS(b.slot);
    const v = core.v2;
    const rp = core.rp;
    let sp = 0;
    let lat = 0;
    if (marching) {
      // où suis-je par rapport au parcours et à mon rang ?
      sp = core.corridor.project(p.x, p.z, sSlot, d < 60 ? 90 : Math.min(420, d + 60));
      core.corridor.at(sp, rp);
      lat = (p.x - rp.x) * -rp.tz + (p.z - rp.z) * rp.tx - rp.center;
      // côté : le plus proche si l'on est déjà près d'une façade, sinon au hasard (pas tous du même côté)
      if (b.side === 0) b.side = Math.abs(lat) > rp.half * 0.6 ? (lat >= 0 ? 1 : -1) : b.sway >= 0 ? 1 : -1;
      if (sp > sSlot + 1.5 && Math.abs(lat) < rp.half + 6) {
        // sur le parcours, en avant de son rang : on se range contre les façades et on laisse venir le cortège ;
        // chacun choisit son coin le long du trottoir, pas tous au même endroit
        if ((b.flags & F.LATE) !== 0 && sp < f.headS - 3 && Math.abs(lat) > rp.half * 0.55) {
          // le cortège passe à sa hauteur : on y entre par le flanc, là où l'on est
          const flank = f.allocFlank(sp - 1, lat >= 0 ? 1 : -1, core.rngArrive);
          if (flank >= 0) {
            b.slot = flank;
            b.waitS = NaN;
            this.setState(b, S.MARCH);
            return;
          }
        }
        if (b.waitS !== b.waitS) {
          b.waitS = sp + (b.docility - 0.35) * 36;
          // dans un virage, on attend à l'extérieur : l'intérieur n'est qu'un coin
          const turn = f.turnAt(b.waitS);
          if (Math.abs(turn) > 0.3) b.side = turn > 0 ? -1 : 1;
        }
        if (b.waitS < sSlot + 2) b.waitS = sSlot + 2;
        b.path = null;
        f.flankPoint(b.waitS, b.side, v);
        b.tx = v.x;
        b.tz = v.z;
        b.run = false;
        b.speed = T.WALK_MAX * b.pace;
        b.lookX = sx;
        b.lookZ = sz;
        return;
      }
      b.waitS = NaN;
      if (sp < sSlot - 20 && now - b.stateSince > 45 && (b.flags & (F.BANNER | F.GUIDE)) === 0 && (b.flags & F.LATE) === 0) {
        // son bloc est trop loin devant : on ferme la marche
        const tail = f.allocTail(core.rngArrive);
        if (tail >= 0) {
          b.slot = tail;
          b.flags |= F.LATE;
          sSlot = f.slotS(tail);
        }
      }
    }
    if (d > 42) {
      // de loin : itinéraire par les rues, vers sa place (ou vers le flanc, juste derrière son rang, en marche)
      if (marching) f.flankPoint(sSlot - 4, b.side !== 0 ? b.side : b.sway >= 0 ? 1 : -1, v);
      else {
        v.x = sx;
        v.z = sz;
      }
      const moved = Math.hypot(v.x - b.tx, v.z - b.tz);
      if (b.path === null && !b.pathPending) {
        b.tx = v.x;
        b.tz = v.z;
        if (d > 60 || !core.ctx.world.lineOfSight(p.x, p.z, v.x, v.z)) core.nav.request(b);
      } else if (moved > 20 && !b.pathPending) {
        // le cortège a avancé : on vise sa nouvelle position ; nouvel itinéraire si l'ancien est presque épuisé
        b.tx = v.x;
        b.tz = v.z;
        if (b.path !== null && b.pathI * 2 >= b.path.length - 4) core.nav.request(b);
      }
      if (this.stalled(p, b, now, 3.5)) {
        b.stuckSince = now;
        b.stuck++;
        core.nav.request(b);
      }
      return;
    }
    b.path = null;
    if (!marching) {
      b.tx = sx;
      b.tz = sz;
      return;
    }
    if (sp < sSlot - 15) {
      // loin derrière : on remonte le cortège par le passage du flanc
      if (this.stalled(p, b, now, 4)) {
        b.stuckSince = now;
        b.side = -b.side;
      }
      f.flankPoint(sSlot - 4, b.side, v);
      b.tx = v.x;
      b.tz = v.z;
      return;
    }
    // juste derrière (ou à côté) : on entre par l'arrière du rang
    b.tx = sx;
    b.tz = sz;
    if (d < 6) this.setState(b, S.MARCH);
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
      // les foyers et les autres manifestations n'obéissent pas aux organisateurs de celle-ci
      if ((b.flags & F.FOYER) !== 0) continue;
      const p = b.person;
      const bystander = (b.flags & F.BYSTANDER) !== 0;
      const tune = bystander ? T.PROFILE.badaud : T.PROFILE[p.profile ?? 'pacifique'];
      // plus on est fatigué, plus on part tôt ; en colère, on traîne
      const u = Math.min(1, Math.max(0, b.docility * (1 - 0.35 * b.fatigue) + 0.25 * Math.max(0, p.anger - 0.4)));
      const at = Math.min(cap, now + (tune.goFrom + u * (tune.goTo - tune.goFrom)) * span + 2 * core.rngThink.next());
      if (at < b.leaveAt) b.leaveAt = at;
    }
  }

  // ───────────────────────────── délégations ─────────────────────────────

  /** Fuite devant une charge, une détonation, un jet d'eau : 30 à 60 m, puis on se regroupe. */
  startFlee(p: Person, b: CrowdBrain, fromX: number, fromZ: number, dist: number): void {
    this.react.startFlee(p, b, fromX, fromZ, dist);
  }

  /** Quitte la manifestation : vers une bouche de métro ouverte ou une rue qui s'éloigne ; le groupe suit. */
  startLeaving(p: Person, b: CrowdBrain, exit: number): void {
    this.manners.startLeaving(p, b, exit);
  }

  /** Lance un geste d'ambiance (constantes A de brain.ts) pendant `seconds` secondes. */
  gesture(p: Person, b: CrowdBrain, act: number, seconds: number): void {
    this.manners.gesture(p, b, act, seconds);
  }

  endGesture(p: Person, b: CrowdBrain): void {
    this.manners.endGesture(p, b);
  }
}
