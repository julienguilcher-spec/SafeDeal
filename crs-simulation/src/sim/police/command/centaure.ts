/* =====================================================================================
 * COMMANDEMENT — Centaure (docs/research/06-roles-jouables.md §7, bible §E.8).
 *
 *   abri mobile       l'engin avance au pilote automatique ; les gendarmes à pied rattachés progressent
 *                     en colonne DERRIÈRE la caisse, à 6 km/h ;
 *   disperser_gaz     l'opérateur vérifie le cadre légal (law.advisor), dose la salve (le plus petit
 *                     nombre de coups utile), pointe la tourelle EN CLOCHE sur la zone désignée, engin à
 *                     l'arrêt, et tire (ctx.vehicles.fireTurret). Refus motivé hors cadre ;
 *   degager_barricade vérification de l'obstacle (personne dedans ni derrière), annonce à la
 *                     sonorisation, puis poussée à la lame à 5–8 km/h. Jamais de poussée sur un obstacle
 *                     habité.
 *   degager_obstacle  véhicule qui barre la voie (autobus, voiture abandonnée, épave, véhicule incendié) :
 *                     l'engin se présente en biais derrière lui, fait descendre ses occupants, attend que
 *                     personne ne soit dans le couloir de poussée (avertisseur, sonorisation), puis le pousse
 *                     au pas, lame basse, vers le bord de la chaussée jusqu'à rendre un couloir de 3,4 m ;
 *                     compte rendu « voie dégagée ». Sans véhicule au point : la barricade la plus proche.
 * C'est le canon à eau qui éteint : le Centaure ne reçoit pas l'ordre « eteindre ».
 * ===================================================================================== */

import type { OrderType, Person, Prop, RoadSample, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import { FORCE_USED_EVENT } from '../api';
import type { CommandCore } from './core';
import { isPoliceOnFoot, isProtester, notPolice } from './core';
import type { Picture } from './picture';
import { SpecialUnit } from './special';
import { received, refused, report, spell } from './texts';

/** Portées du tir en cloche (m) : en deçà, la grenade s'ouvrirait sur l'engin ; au-delà, hors de portée. */
const SALVO_MIN = 45;
const SALVO_MAX = 200;
/** Écart toléré entre le point de chute prévu et la zone désignée (m). */
const AIM_TOLERANCE = 8;
/** Durée de la vérification de l'obstacle (s) et patience maximale si quelqu'un se tient derrière (s). */
const CHECK_TIME = 3;
const CHECK_PATIENCE = 20;
/** Véhicule qui barre la voie : rayon de recherche autour du point désigné (m). */
const OBSTACLE_SEARCH = 20;
/** Angle de la poussée par rapport à l'axe de la rue, vers le bord (rad) ; couloir à rendre (m). */
const OBSTACLE_ANGLE = 0.5;
const OBSTACLE_CORRIDOR = 3.4;
/** Point visé pendant la poussée : à … m du centre de l'obstacle, côté bord (m). */
const PUSH_AIM = 2;
/** Glissade de l'obstacle sous la lame (m/s) et redressement dans l'axe de la rue (rad/s). */
const PUSH_SLIDE = 0.45;
const PUSH_TURN = 0.08;
/** Patience devant des personnes dans le couloir de poussée (s). */
const OBSTACLE_PATIENCE = 40;

export function isCentaure(core: CommandCore, s: Squad): boolean {
  const v = s.vehicleId !== 0 ? core.ctx.vehicles.get(s.vehicleId) : undefined;
  return !!v && v.kind === 'centaure';
}

export class CentaureUnit extends SpecialUnit {
  /** Unité à pied qui progresse derrière l'engin (0 si aucune). */
  escortId = 0;
  private escortFollowing = false;
  private salvo = 0;
  private fired = false;
  private propId = 0;
  private propX = 0;
  private propZ = 0;
  private dirX = 0;
  private dirZ = 1;
  private warned = false;
  private cleared = false;
  private burning = false;
  private aimAt = 0;
  private pushX = 0;
  private pushZ = 0;
  private stallSince = 0;
  private backUntil = 0;
  private readonly people: Person[] = [];
  // ── véhicule qui barre la voie ──
  private obsId = 0;
  /** Axe de la rue au droit de l'obstacle (point, direction de la poussée le long de la rue), demi-largeur. */
  private obsAx = 0;
  private obsAz = 0;
  private obsDx = 0;
  private obsDz = 1;
  private obsHalf = 4;
  /** Côté de la chaussée vers lequel on pousse (1 : à droite de obsD, −1 : à gauche). */
  private obsSide = 1;
  private obsHorn = 0;
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

  constructor(core: CommandCore, pic: Picture, squad: Squad) {
    super(core, pic, squad, 'centaure');
    const v = this.vehicle();
    if (v) this.rememberHome(v.x, v.z);
  }

  private vehicle(): Vehicle | null {
    const v = this.core.ctx.vehicles.get(this.squad.vehicleId);
    if (!v) return null;
    const st = this.status;
    st.vehicleId = v.id;
    st.x = v.x;
    st.z = v.z;
    st.supply = v.turretAmmo.length > 0 ? v.turretAmmo[0] : -1;
    return v;
  }

  alive(): boolean {
    return this.core.ctx.vehicles.get(this.squad.vehicleId) !== undefined;
  }

  /** Opérateur du lance-grenades (à défaut le chef d'engin, puis le pilote). */
  private gunner(v: Vehicle): Person | null {
    return this.seated(v, 'gunner') ?? this.seated(v, 'passenger') ?? this.seated(v, 'driver');
  }

  // ───────────────────────────── ordres ─────────────────────────────

  claim(o: SquadOrder): boolean {
    const v = this.vehicle();
    if (!v) return false;
    const type = o.type;
    if (type === 'disperser_gaz') {
      this.beginSalvo(v, o);
      return true;
    }
    if (type === 'degager_barricade') {
      this.beginClear(v, o);
      return true;
    }
    if (type === 'degager_obstacle') {
      this.beginObstacle(v, o);
      return true;
    }
    if (type === 'avancer' || type === 'refoulement' || type === 'repli' || type === 'colonne') {
      this.beginDrive(v, o);
      return true;
    }
    // tenir, cesser, suivre, embarquer… : conduite ordinaire d'un équipage (module de police)
    this.abort(v);
    return false;
  }

  private abort(v: Vehicle): void {
    const ext = this.core.vext;
    if (ext) ext.clearTurretTarget(v, 0);
    this.order = null;
    this.status.order = '';
    this.setStage('repos');
  }

  onNotifyCleared(vehicleId: number, propId: number): void {
    if (vehicleId === this.squad.vehicleId && (propId === this.propId || this.status.stage === 'poussee')) this.cleared = true;
  }

  // ───────────────────────────── progression, abri mobile ─────────────────────────────

  private beginDrive(v: Vehicle, o: SquadOrder): void {
    const core = this.core;
    const ap = core.autopilot;
    this.order = this.copy(o);
    this.status.order = o.type;
    if (!ap) {
      this.say(refused(this.squad.name, 'Engin immobilisé, pas de pilote disponible'));
      this.refuse(o, 'Pilote automatique indisponible.');
      return;
    }
    const escorted = this.escortId !== 0 && core.ctx.squads.get(this.escortId) !== undefined;
    const speed = escorted ? core.tuning.centaurePace : o.type === 'repli' ? 1.4 : 8.3;
    if (!ap.driveTo(v, o.x, o.z, { speed, stopBefore: 1 })) {
      this.say(refused(this.squad.name, 'Itinéraire impossible pour l’engin'));
      this.refuse(o, 'Aucun itinéraire.');
      return;
    }
    this.say(received(this.squad.name, escorted ? 'j’avance au pas, les piétons derrière la caisse' : 'j’avance'));
    if (escorted) this.callEscort(v, o);
    this.setStage('route');
  }

  /** Les gendarmes à pied se placent en colonne derrière l'engin et le suivent. */
  private callEscort(v: Vehicle, o: SquadOrder): void {
    const s = this.core.ctx.squads.get(this.escortId);
    if (!s) return;
    if (this.escortFollowing && s.order.type === 'suivre' && s.order.targetId === v.id) return;
    this.core.issue(this.escortId, { type: 'suivre', targetId: v.id, width: 1.6, issuedBy: o.issuedBy });
    this.escortFollowing = true;
  }

  private thinkDrive(v: Vehicle): void {
    const ap = this.core.autopilot;
    if (!ap) return;
    const st = ap.status(v);
    if (st.state === 'arrive' || st.mode === 'idle') {
      this.say(report(this.superior(), this.squad.name, 'Engin en position'));
      this.finish(true, '');
      this.setStage('repos');
    } else if (st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > (st.reason === 'personne' ? 120 : 25))) {
      // (devant des personnes, l'engin insiste : avertisseur, la foule s'écarte, nouvel itinéraire — session/engins.ts)
      this.say(report(this.superior(), this.squad.name, st.reason === 'obstacle' ? 'Engin arrêté devant un obstacle, demande l’ordre de dégager' : 'Engin bloqué'));
      this.finish(false, 'Engin bloqué.');
      this.setStage('repos');
    }
  }

  // ───────────────────────────── salve de lacrymogènes ─────────────────────────────

  private beginSalvo(v: Vehicle, o: SquadOrder): void {
    const core = this.core;
    const ctx = core.ctx;
    const ext = core.vext;
    const by = this.gunner(v);
    this.order = this.copy(o);
    this.status.order = o.type;
    this.fired = false;
    if (!ext || !by || v.def.turrets.length === 0 || v.def.turrets[0].kind !== 'lance_grenades') {
      this.say(refused(this.squad.name, 'Tourelle indisponible'));
      this.refuse(o, 'Tourelle indisponible.');
      return;
    }
    // cadre légal : le tir au lanceur est un usage des armes (réitération de la dernière sommation, ou riposte)
    const roe = ctx.law.roe;
    let reason = '';
    if (core.advisor) {
      const verdict = core.advisor.assess(by, 'lacrymo', null, o.x, o.z);
      if (verdict.kind !== 'licite') reason = verdict.reason;
    } else if (roe.lawfulForce < 4 && !(roe.underAttack && roe.lawfulForce >= 3)) {
      reason = 'Usage des armes non autorisé : la dernière sommation doit être réitérée.';
    }
    if (reason === '' && o.maxForce < 3) reason = 'Niveau de force de l’ordre insuffisant pour une salve de lacrymogènes.';
    if (reason !== '') {
      this.say(refused(this.squad.name, 'Salve non tirée : cadre légal non réuni'));
      this.refuse(o, reason);
      this.setStage('repos');
      return;
    }
    const d = Math.hypot(o.x - v.x, o.z - v.z);
    if (d < SALVO_MIN || d > SALVO_MAX) {
      const why = d < SALVO_MIN ? 'Objectif trop proche pour un tir courbe.' : 'Objectif hors de portée.';
      this.say(refused(this.squad.name, why.replace(/\.$/, '')));
      this.refuse(o, why);
      this.setStage('repos');
      return;
    }
    // zone d'arrivée : pas sur les collègues
    if (ctx.people.countIn(o.x, o.z, 18, isPoliceOnFoot) > 0) {
      this.say(refused(this.squad.name, 'Des agents sont dans la zone d’arrivée'));
      this.refuse(o, 'Agents dans la zone d’arrivée.');
      this.setStage('repos');
      return;
    }
    // dosage : le plus petit nombre de coups utile (§7.4), sauf nombre imposé par l'ordre (width)
    let n = Math.round(o.width);
    if (!(n >= 1)) {
      const crowd = ctx.people.countIn(o.x, o.z, 22, isProtester);
      n = Math.ceil(crowd / 8) + 2;
      if (n < 3) n = 3;
      else if (n > 10) n = 10;
    }
    if (n > 30) n = 30;
    if (v.turretAmmo[0] < n) n = Math.floor(v.turretAmmo[0]);
    if (n < 1) {
      this.say(refused(this.squad.name, 'Tubes vides, rechargement nécessaire'));
      this.refuse(o, 'Tubes vides.');
      ext.reloadTurret(v, 0);
      this.setStage('repos');
      return;
    }
    this.salvo = ext.setSalvo(v, 0, n);
    if (core.autopilot) core.autopilot.stop(v);
    this.say(received(this.squad.name, 'salve de ' + spell(this.salvo) + ', zone ' + (core.sector(o.x, o.z) || 'désignée') + ', tir courbe'));
    this.aimAt = 0;
    this.setStage('pointage');
  }

  private thinkAim(v: Vehicle): void {
    const core = this.core;
    const ctx = core.ctx;
    const ext = core.vext;
    const o = this.order;
    const by = this.gunner(v);
    if (!ext || !o || !by) {
      this.finish(false, 'Tourelle indisponible.');
      this.setStage('repos');
      return;
    }
    // engin à l'arrêt : le tir en roulant n'est pas compensé
    if (Math.abs(v.speed) > 0.3) return;
    const y = ctx.world.heightAt(o.x, o.z);
    const reachable = ext.aimTurretAt(v, 0, o.x, y, o.z);
    if (!reachable) {
      if (this.sinceStage() > 4) {
        this.say(refused(this.squad.name, 'Zone hors du débattement de la tourelle'));
        this.refuse(o, 'Zone hors de portée de la tourelle.');
        this.setStage('repos');
      }
      return;
    }
    if (core.now < this.aimAt) return;
    this.aimAt = core.now + 0.25;
    const out = core.v3;
    if (!ext.predictImpact(v, 0, out)) return;
    const miss = Math.hypot(out.x - o.x, out.z - o.z);
    if (miss > AIM_TOLERANCE) {
      if (this.sinceStage() > 12) {
        this.say(refused(this.squad.name, 'Pointage impossible'));
        this.refuse(o, 'Pointage impossible.');
        this.setStage('repos');
      }
      return;
    }
    if (ctx.vehicles.fireTurret(v, 0, by.id)) {
      this.fired = true;
      ctx.events.emitAny(FORCE_USED_EVENT, { squadId: this.squad.id, means: 'lacrymo', x: o.x, z: o.z, byId: by.id });
      this.setStage('salve');
    } else if (this.sinceStage() > 12) {
      this.refuse(o, 'Tir impossible.');
      this.setStage('repos');
    }
  }

  private thinkSalvo(v: Vehicle): void {
    const ext = this.core.vext;
    const o = this.order;
    if (!ext || !o) return;
    const ts = ext.turretStatus(v, 0);
    if ((ts.queued <= 0 && !ts.firing && this.sinceStage() > 0.6) || this.sinceStage() > this.salvo * 0.4 + 6) {
      ext.clearTurretTarget(v, 0);
      this.say(report(this.superior(), this.squad.name, 'Salve de ' + spell(this.salvo) + ' tirée, zone ' + (this.core.sector(o.x, o.z) || 'désignée') + '. Reste ' + spell(Math.max(0, Math.floor(v.turretAmmo[0]))) + ' tubes'));
      this.finish(true, '');
      this.setStage('repos');
    }
  }

  // ───────────────────────────── barricade à la lame ─────────────────────────────

  private findBarricade(o: SquadOrder): Prop | null {
    const core = this.core;
    const ctx = core.ctx;
    let prop = o.targetId > 0 ? ctx.props.get(o.targetId) : undefined;
    if (!prop) {
      const n = ctx.props.queryRadius(o.x, o.z, 25, core.props);
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const q = core.props[i];
        if (q.kind !== 'barricade' && !(q.blocksMove && (q.toppled || q.state === 'broken' || q.state === 'burnt'))) continue;
        const d = (q.x - o.x) * (q.x - o.x) + (q.z - o.z) * (q.z - o.z) - (q.kind === 'barricade' ? 100 : 0);
        if (d < bestD) {
          bestD = d;
          prop = q;
        }
      }
    }
    return prop ?? null;
  }

  private beginClear(v: Vehicle, o: SquadOrder): void {
    const core = this.core;
    this.order = this.copy(o);
    this.status.order = o.type;
    const prop = this.findBarricade(o);
    if (!v.def.canPush || !core.autopilot) {
      this.say(refused(this.squad.name, 'Lame indisponible'));
      this.refuse(o, 'Lame indisponible.');
      return;
    }
    if (!prop) {
      this.say(refused(this.squad.name, 'Aucune barricade au point indiqué'));
      this.refuse(o, 'Aucune barricade au point indiqué.');
      return;
    }
    this.propId = prop.id;
    this.propX = prop.x;
    this.propZ = prop.z;
    this.status.targetId = prop.id;
    this.burning = prop.burning > 0.05;
    this.warned = false;
    this.cleared = false;
    this.say(received(this.squad.name, 'je vérifie l’obstacle, puis je dégage à la lame'));
    const d = Math.hypot(prop.x - v.x, prop.z - v.z);
    if (d > 16) {
      if (!core.autopilot.driveTo(v, prop.x, prop.z, { speed: 3.5, stopBefore: 11 })) {
        this.say(refused(this.squad.name, 'Itinéraire impossible jusqu’à l’obstacle'));
        this.refuse(o, 'Aucun itinéraire.');
        return;
      }
      this.setStage('approche');
    } else {
      this.setStage('verification');
    }
  }

  /** Personnes dans l'obstacle ou derrière lui, dans le couloir de poussée. */
  private peopleBehind(): number {
    return this.peopleBehindOf(this.propX, this.propZ);
  }

  private peopleBehindOf(x: number, z: number): number {
    const core = this.core;
    const n = core.ctx.people.queryRadius(x + this.dirX * 4, z + this.dirZ * 4, 9, this.people, notPolice);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      const fwd = (p.x - x) * this.dirX + (p.z - z) * this.dirZ;
      const lat = Math.abs((p.x - x) * -this.dirZ + (p.z - z) * this.dirX);
      if (fwd > -2.5 && fwd < 11 && lat < 3.2) m++;
    }
    return m;
  }

  /** Arrêt de l'engin par son pilote. */
  private brake(v: Vehicle): void {
    v.cmd.throttle = 0;
    v.cmd.brake = 1;
    v.cmd.steer = 0;
    v.cmd.handbrake = true;
  }

  /**
   * Poussée à la lame : le pilote conduit lui-même (commande du véhicule, comme le ferait un joueur), droit
   * sur l'obstacle, à 5–8 km/h. Appelé à chaque pas.
   */
  override step(): void {
    if (this.status.stage !== 'poussee' && this.status.stage !== 'obstacle_poussee') return;
    const v = this.core.ctx.vehicles.get(this.squad.vehicleId);
    if (!v || !this.seated(v, 'driver')) return;
    const want = this.status.stage === 'obstacle_poussee' ? this.obsHeading(v) : Math.atan2(this.dirX, this.dirZ);
    let err = want - v.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    // cap croissant = virage à gauche = volant négatif
    let steer = -err * 2.5;
    if (steer > 0.6) steer = 0.6;
    else if (steer < -0.6) steer = -0.6;
    const cmd = v.cmd;
    const now = this.core.now;
    cmd.handbrake = false;
    cmd.brake = 0;
    if (now < this.backUntil) {
      // l'obstacle a tenu : quelques mètres de recul pour reprendre de l'élan
      cmd.steer = 0;
      cmd.throttle = v.speed > -1.2 ? -0.7 : 0;
      this.stallSince = 0;
      return;
    }
    cmd.steer = steer;
    cmd.throttle = v.speed < this.core.tuning.centaurePush ? 1 : 0;
    // l'engin a glissé le long de l'obstacle au lieu de le pousser (lame à sa hauteur) : il recule et reprend
    if (this.status.stage === 'obstacle_poussee' && this.besideObstacle(v)) {
      this.stallSince = 0;
      this.backUntil = now + 2.5;
      cmd.throttle = 0;
      return;
    }
    // véhicule qui barre la voie : lame en appui, il glisse au pas vers le bord (l'engin le suit)
    if (this.status.stage === 'obstacle_poussee' && this.slideObstacle(v)) {
      cmd.throttle = v.speed < 0.6 ? 0.5 : 0;
      this.stallSince = 0;
      return;
    }
    // engin calé contre l'obstacle depuis deux secondes : recul, puis nouvelle poussée
    if (v.speed < 0.3 && this.sinceStage() > 2) {
      if (this.stallSince === 0) this.stallSince = now;
      else if (now - this.stallSince > 2) {
        this.stallSince = 0;
        this.backUntil = now + 2.2;
      }
    } else {
      this.stallSince = 0;
    }
  }

  private thinkClear(v: Vehicle): void {
    const core = this.core;
    const ctx = core.ctx;
    const ap = core.autopilot;
    const o = this.order;
    if (!ap || !o) return;
    const stage = this.status.stage;
    const prop = ctx.props.get(this.propId);
    if (stage === 'approche') {
      const st = ap.status(v);
      const d = Math.hypot(this.propX - v.x, this.propZ - v.z);
      if ((st.state === 'arrive' || st.mode === 'idle' || d < 14) && Math.abs(v.speed) < 0.5) {
        ap.stop(v);
        this.setStage('verification');
      } else if (st.state === 'echec' || this.sinceStage() > 120) {
        this.say(report(this.superior(), this.squad.name, 'Obstacle hors d’atteinte'));
        this.finish(false, 'Obstacle hors d’atteinte.');
        this.setStage('repos');
      }
      return;
    }
    if (stage === 'verification') {
      const d = Math.hypot(this.propX - v.x, this.propZ - v.z) || 1;
      this.dirX = (this.propX - v.x) / d;
      this.dirZ = (this.propZ - v.z) / d;
      if (this.sinceStage() < CHECK_TIME) return;
      const behind = this.peopleBehind();
      if (behind > 0) {
        if (!this.warned) {
          // sonorisation extérieure : les personnes s'écartent
          this.warned = true;
          core.say(this.squad.name, 'Écartez-vous, l’engin va dégager l’obstacle.', 1, 'public', this.squad.leaderId);
          if (core.vext) core.vext.horn(v, 1.5);
          if (core.crowd) core.crowd.stir(this.propX + this.dirX * 4, this.propZ + this.dirZ * 4, 10, 0.45, 0);
        }
        if (this.sinceStage() > CHECK_PATIENCE) {
          this.say(report(this.superior(), this.squad.name, 'Obstacle habité, ' + spell(behind) + (behind > 1 ? ' personnes derrière' : ' personne derrière') + '. Je ne pousse pas'));
          this.finish(false, 'Obstacle habité : poussée refusée.');
          this.setStage('repos');
        }
        return;
      }
      this.say(report(this.superior(), this.squad.name, 'Obstacle vérifié, personne derrière. Je pousse'));
      // le pilote pousse lui-même, lame basse, droit sur l'obstacle (voir step) : le pilote automatique s'efface
      ap.stop(v);
      this.pushX = v.x;
      this.pushZ = v.z;
      this.stallSince = 0;
      this.backUntil = 0;
      this.setStage('poussee');
      return;
    }
    if (stage === 'poussee') {
      // dégagée : disloquée par la lame (elle ne barre plus), ou repoussée d'au moins une longueur d'engin
      const gone = !prop || !prop.blocksMove || Math.hypot(prop.x - this.propX, prop.z - this.propZ) > 7;
      const advanced = Math.hypot(v.x - this.pushX, v.z - this.pushZ);
      if (this.cleared || gone) {
        this.brake(v);
        this.say(report(this.superior(), this.squad.name, 'Barricade dégagée, passage ouvert' + (this.burning ? '. Foyers dispersés, demande l’engin lanceur d’eau' : '')));
        this.finish(true, '');
        this.setStage('repos');
      } else if (prop && this.peopleBehindOf(prop.x, prop.z) > 0) {
        // quelqu'un est revenu derrière l'obstacle : halte immédiate, nouvelle vérification
        this.brake(v);
        this.propX = prop.x;
        this.propZ = prop.z;
        this.warned = false;
        this.setStage('verification');
      } else if (this.sinceStage() > 45 || advanced > 40) {
        this.brake(v);
        this.say(report(this.superior(), this.squad.name, 'Obstacle trop lourd pour la lame'));
        this.finish(false, 'Obstacle non dégagé.');
        this.setStage('repos');
      }
    }
  }

  // ───────────────────────────── véhicule qui barre la voie ─────────────────────────────

  /** Véhicule désigné (targetId) ou, à défaut, le véhicule à l'arrêt le plus proche du point (ni police, ni secours). */
  private findObstacle(o: SquadOrder): Vehicle | null {
    const ctx = this.core.ctx;
    const t = o.targetId > 0 ? ctx.vehicles.get(o.targetId) : undefined;
    if (t && t.faction !== 'police' && !t.def.flying) return t;
    const n = ctx.vehicles.queryRadius(o.x, o.z, OBSTACLE_SEARCH, this.core.vehicles);
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const q = this.core.vehicles[i];
      if (q.faction === 'police' || q.faction === 'rescue' || q.def.flying || q.dormant || Math.abs(q.speed) > 1.5) continue;
      if (q.kind === 'velo' || q.kind === 'scooter') continue;
      const d = (q.x - o.x) * (q.x - o.x) + (q.z - o.z) * (q.z - o.z);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    this.core.vehicles.length = 0;
    return best;
  }

  /** Écart latéral (m, à droite de la direction de poussée le long de la rue) des deux bords du gabarit d'un véhicule. */
  private obsSpan(q: Vehicle, out: { lo: number; hi: number }): void {
    const rx = -this.obsDz;
    const rz = this.obsDx;
    const lat = (q.x - this.obsAx) * rx + (q.z - this.obsAz) * rz;
    const sn = Math.abs(Math.sin(q.heading) * rx + Math.cos(q.heading) * rz);
    const cs = Math.sqrt(Math.max(0, 1 - sn * sn));
    const ext = 0.5 * (q.def.length * sn + q.def.width * cs);
    out.lo = lat - ext;
    out.hi = lat + ext;
  }

  private readonly span = { lo: 0, hi: 0 };

  /** Couloir rendu à la circulation (m) : de l'obstacle au bord de chaussée opposé au côté où on le pousse. */
  private obsCorridor(q: Vehicle): number {
    this.obsSpan(q, this.span);
    return this.obsSide > 0 ? this.span.lo + this.obsHalf : this.obsHalf - this.span.hi;
  }

  private beginObstacle(v: Vehicle, o: SquadOrder): void {
    const core = this.core;
    const ctx = core.ctx;
    const q = this.findObstacle(o);
    if (!q) {
      // pas de véhicule au point : la barricade la plus proche, s'il y en a une
      if (this.findBarricade(o)) {
        this.beginClear(v, o);
        return;
      }
      this.order = this.copy(o);
      this.status.order = o.type;
      this.say(refused(this.squad.name, 'Aucun obstacle au point indiqué'));
      this.refuse(o, 'Aucun obstacle au point indiqué.');
      return;
    }
    this.order = this.copy(o);
    this.status.order = o.type;
    if (!v.def.canPush || !core.autopilot) {
      this.say(refused(this.squad.name, 'Lame indisponible'));
      this.refuse(o, 'Lame indisponible.');
      return;
    }
    const road = this.road;
    if (!ctx.world.nearestRoad(q.x, q.z, road, 20)) {
      this.say(refused(this.squad.name, 'Obstacle hors de la chaussée'));
      this.refuse(o, 'Obstacle hors de la chaussée.');
      return;
    }
    // axe de la rue, orienté de l'engin vers l'obstacle ; poussée vers le bord le plus proche de l'obstacle
    let dx = Math.sin(road.heading);
    let dz = Math.cos(road.heading);
    if ((q.x - v.x) * dx + (q.z - v.z) * dz < 0) {
      dx = -dx;
      dz = -dz;
    }
    // la place derrière l'obstacle est prise (le véhicule bloqué, sa colonne) : l'engin vient par l'autre côté
    let around = false;
    if (this.approachTaken(v, q, dx, dz)) {
      dx = -dx;
      dz = -dz;
      around = true;
    }
    this.obsId = q.id;
    this.obsAx = road.x;
    this.obsAz = road.z;
    this.obsDx = dx;
    this.obsDz = dz;
    this.obsHalf = road.width * 0.5;
    const lat = (q.x - road.x) * -dz + (q.z - road.z) * dx;
    this.obsSide = lat >= -0.2 ? 1 : -1;
    this.status.targetId = q.id;
    this.warned = false;
    this.obsHorn = 0;
    if (this.obsCorridor(q) >= OBSTACLE_CORRIDOR) {
      this.say(report(this.superior(), this.squad.name, 'Le véhicule ne barre pas la voie, passage libre'));
      this.finish(true, '');
      this.setStage('repos');
      return;
    }
    // direction de poussée : en biais, vers le bord
    this.setPushDir();
    this.say(received(this.squad.name, 'je fais descendre les occupants, puis je pousse le véhicule hors de la voie'));
    // point d'approche : derrière l'obstacle, dans sa file, l'axe de l'engin décalé vers l'intérieur de la chaussée
    const back = q.def.length * 0.5 + v.def.length * 0.5 + 3;
    const off = lat - this.obsSide * 0.8;
    const ax = road.x + dx * ((q.x - road.x) * dx + (q.z - road.z) * dz - back) - dz * off;
    const az = road.z + dz * ((q.x - road.x) * dx + (q.z - road.z) * dz - back) + dx * off;
    if (Math.hypot(ax - v.x, az - v.z) > 3) {
      // (par l'autre côté : itinéraire qui évite la rue barrée, par les rues voisines)
      const avoid = around ? [{ x: q.x, z: q.z, r: q.def.length * 0.5 + 2, cost: 600 }] : undefined;
      if (!core.autopilot.driveTo(v, ax, az, { speed: 4, stopBefore: 0.5, avoid })) {
        this.say(refused(this.squad.name, 'Itinéraire impossible jusqu’à l’obstacle'));
        this.refuse(o, 'Aucun itinéraire.');
        return;
      }
      this.setStage('obstacle_approche');
    } else {
      core.autopilot.stop(v);
      this.setStage('obstacle_evacuation');
    }
  }

  /** Un autre véhicule occupe-t-il la place d'approche, derrière l'obstacle dans le sens (dx, dz) ? */
  private approachTaken(v: Vehicle, q: Vehicle, dx: number, dz: number): boolean {
    const ctx = this.core.ctx;
    const back = q.def.length * 0.5 + v.def.length * 0.5 + 3;
    const x = q.x - dx * back;
    const z = q.z - dz * back;
    const n = ctx.vehicles.queryRadius(x, z, v.def.length * 0.5 + 3, this.core.vehicles);
    let taken = false;
    for (let i = 0; i < n && !taken; i++) {
      const o = this.core.vehicles[i];
      if (o !== v && o !== q && !o.def.flying) taken = true;
    }
    this.core.vehicles.length = 0;
    return taken;
  }

  private setPushDir(): void {
    const c = Math.cos(OBSTACLE_ANGLE);
    const s = Math.sin(OBSTACLE_ANGLE) * this.obsSide;
    // droite de (dx, dz) : (−dz, dx)
    this.dirX = this.obsDx * c - this.obsDz * s;
    this.dirZ = this.obsDz * c + this.obsDx * s;
  }

  /**
   * Personnes (hors policiers) dans la zone que l'obstacle va balayer (son gabarit et 6 m devant lui, dans le sens de
   * la poussée), ou entre l'engin et lui.
   */
  private peopleInPush(v: Vehicle, q: Vehicle): number {
    const ctx = this.core.ctx;
    const c = Math.abs(Math.sin(q.heading) * this.dirX + Math.cos(q.heading) * this.dirZ);
    const sn = Math.sqrt(Math.max(0, 1 - c * c));
    const along = 0.5 * (q.def.length * c + q.def.width * sn);
    const perp = 0.5 * (q.def.length * sn + q.def.width * c);
    const n = ctx.people.queryRadius(q.x + this.dirX * 3, q.z + this.dirZ * 3, along + perp + 10, this.people, notPolice);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      if (p.dormant) continue;
      const fwd = (p.x - q.x) * this.dirX + (p.z - q.z) * this.dirZ;
      const lat = Math.abs((p.x - q.x) * -this.dirZ + (p.z - q.z) * this.dirX);
      if (fwd > -along - 0.8 && fwd < along + 6 && lat < perp + 0.8) {
        m++;
        continue;
      }
      // entre l'engin et l'obstacle
      const ux = q.x - v.x;
      const uz = q.z - v.z;
      const d = Math.hypot(ux, uz) || 1;
      const fv = ((p.x - v.x) * ux + (p.z - v.z) * uz) / d;
      const lv = Math.abs(((p.x - v.x) * -uz + (p.z - v.z) * ux) / d);
      if (fv > 0 && fv < d && lv < v.def.width * 0.5 + 1) m++;
    }
    this.people.length = 0;
    return m;
  }

  /**
   * Cap de poussée : vers un point situé à quelques mètres du centre de l'obstacle, côté bord de chaussée — l'engin
   * pousse l'arrière en biais, l'obstacle glisse vers le bord.
   */
  private obsHeading(v: Vehicle): number {
    const q = this.core.ctx.vehicles.get(this.obsId);
    if (!q) return Math.atan2(this.dirX, this.dirZ);
    const tx = q.x - this.obsDz * this.obsSide * PUSH_AIM;
    const tz = q.z + this.obsDx * this.obsSide * PUSH_AIM;
    return Math.atan2(tx - v.x, tz - v.z);
  }

  /** L'avant de l'engin a dépassé l'arrière de l'obstacle, le long de la rue (il le longe au lieu de le pousser). */
  private besideObstacle(v: Vehicle): boolean {
    const q = this.core.ctx.vehicles.get(this.obsId);
    if (!q) return false;
    this.obsSpan(q, this.span);
    const c = Math.abs(Math.sin(q.heading) * this.obsDx + Math.cos(q.heading) * this.obsDz);
    const sn = Math.sqrt(Math.max(0, 1 - c * c));
    const rear = (q.x - this.obsAx) * this.obsDx + (q.z - this.obsAz) * this.obsDz - 0.5 * (q.def.length * c + q.def.width * sn);
    const nose = (v.x - this.obsAx) * this.obsDx + (v.z - this.obsAz) * this.obsDz + v.def.length * 0.5;
    return nose > rear + 2.5;
  }

  /**
   * Lame en appui contre l'obstacle (avant de l'engin à moins de 0,8 m de son gabarit) : l'obstacle glisse vers le bord
   * de la chaussée à PUSH_SLIDE m/s, en se remettant dans l'axe de la rue. Jamais contre une façade ou un obstacle
   * fixe, jamais sur quelqu'un : la glissade s'arrête net si une personne se tient contre son flanc. true si l'engin est
   * au contact et pousse.
   */
  private slideObstacle(v: Vehicle): boolean {
    const ctx = this.core.ctx;
    const q = ctx.vehicles.get(this.obsId);
    if (!q) return false;
    const hx = Math.sin(v.heading);
    const hz = Math.cos(v.heading);
    // distance de l'avant de l'engin (milieu et coins de la lame) au gabarit de l'obstacle
    const qx = Math.sin(q.heading);
    const qz = Math.cos(q.heading);
    let gap = Infinity;
    for (let k = -1; k <= 1; k++) {
      const fx = v.x + hx * (v.def.length * 0.5 + 0.2) - hz * k * v.def.width * 0.45;
      const fz = v.z + hz * (v.def.length * 0.5 + 0.2) + hx * k * v.def.width * 0.45;
      const along = Math.abs((fx - q.x) * qx + (fz - q.z) * qz) - q.def.length * 0.5;
      const lat = Math.abs((fx - q.x) * -qz + (fz - q.z) * qx) - q.def.width * 0.5;
      const d = Math.hypot(Math.max(0, along), Math.max(0, lat));
      if (d < gap) gap = d;
    }
    if (gap > 0.9) return false;
    const dt = this.core.dt;
    if (!(dt > 0)) return true;
    // côté bord : droite de la direction de la rue × côté
    const sx = -this.obsDz * this.obsSide;
    const sz = this.obsDx * this.obsSide;
    // le flanc côté bord, un pas plus loin : libre de façade et de personne ?
    this.obsSpan(q, this.span);
    const edge = (this.obsSide > 0 ? this.span.hi : -this.span.lo) + 0.35;
    const step = PUSH_SLIDE * dt;
    const halfL = q.def.length * 0.5;
    const world = ctx.world;
    for (let s = -halfL; s <= halfL + 0.01; s += 1.5) {
      // point du flanc côté bord, à la hauteur s le long de la rue
      const ax = this.obsAx + this.obsDx * (((q.x - this.obsAx) * this.obsDx + (q.z - this.obsAz) * this.obsDz) + s) + sx * (edge + step);
      const az = this.obsAz + this.obsDz * (((q.x - this.obsAx) * this.obsDx + (q.z - this.obsAz) * this.obsDz) + s) + sz * (edge + step);
      if (!world.isFree(ax, az, 0.3)) return true;
      const surf = world.surfaceAt(ax, az);
      if (surf === 'building' || surf === 'water') return true;
    }
    const n = ctx.people.queryRadius(q.x + sx * 2, q.z + sz * 2, halfL + 4, this.people);
    let blocked = false;
    for (let i = 0; i < n && !blocked; i++) {
      const p = this.people[i];
      if (p.vehicleId !== 0 || p.dormant) continue;
      const l = ((p.x - this.obsAx) * sx + (p.z - this.obsAz) * sz);
      const a = Math.abs((p.x - q.x) * this.obsDx + (p.z - q.z) * this.obsDz);
      if (a < halfL + 1 && l > edge - 0.6 && l < edge + 1.2) blocked = true;
    }
    this.people.length = 0;
    if (blocked) return true;
    q.x += sx * step;
    q.z += sz * step;
    // il se remet dans l'axe de la rue (sens le plus proche)
    let want = Math.atan2(this.obsDx, this.obsDz);
    let err = want - q.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    if (Math.abs(err) > Math.PI / 2) {
      want += Math.PI;
      err = err > 0 ? err - Math.PI : err + Math.PI;
    }
    const turn = PUSH_TURN * dt;
    q.heading += err > turn ? turn : err < -turn ? -turn : err;
    q.vx = 0;
    q.vz = 0;
    q.speed = 0;
    q.yawRate = 0;
    return true;
  }

  private thinkObstacle(v: Vehicle): void {
    const core = this.core;
    const ctx = core.ctx;
    const ap = core.autopilot;
    const o = this.order;
    if (!ap || !o) return;
    const stage = this.status.stage;
    const q = ctx.vehicles.get(this.obsId);
    if (!q) {
      // retiré entre-temps (dépanneuse, incendie) : la voie est libre
      this.brake(v);
      this.say(report(this.superior(), this.squad.name, 'Obstacle enlevé, voie dégagée'));
      this.finish(true, '');
      this.setStage('repos');
      return;
    }
    if (stage === 'obstacle_approche') {
      const st = ap.status(v);
      const d = Math.hypot(q.x - v.x, q.z - v.z);
      // arrivé, ou arrêté par l'obstacle lui-même à quelques mètres de sa place d'approche
      const atIt = st.reason === 'vehicule' && st.blockedFor > 3 && d < q.def.length * 0.5 + v.def.length * 0.5 + 6;
      if ((st.state === 'arrive' || st.mode === 'idle' || atIt || d < q.def.length * 0.5 + v.def.length * 0.5 + 2) && Math.abs(v.speed) < 0.5) {
        ap.stop(v);
        this.setStage('obstacle_evacuation');
      } else if (st.state === 'echec' || this.sinceStage() > 150) {
        this.say(report(this.superior(), this.squad.name, 'Obstacle hors d’atteinte'));
        this.finish(false, 'Obstacle hors d’atteinte.');
        this.setStage('repos');
      }
      return;
    }
    if (stage === 'obstacle_evacuation') {
      // les occupants descendent : on ne pousse jamais un véhicule occupé
      let aboard = 0;
      for (let i = 0; i < q.seats.length; i++) {
        const id = q.seats[i];
        if (id === 0) continue;
        const p = ctx.people.get(id);
        if (!p) continue;
        aboard++;
        if (!p.isPlayer && this.sinceStage() > 1.5) ctx.vehicles.exit(p);
      }
      if (aboard > 0 && !this.warned) {
        this.warned = true;
        core.say(this.squad.name, 'Police ! Descendez du véhicule, il va être dégagé.', 1, 'public', this.squad.leaderId);
      }
      if (aboard === 0) {
        this.warned = false;
        this.setStage('obstacle_verification');
      } else if (this.sinceStage() > 20) {
        this.say(report(this.superior(), this.squad.name, 'Occupants à bord, je ne pousse pas'));
        this.finish(false, 'Véhicule occupé : poussée refusée.');
        this.setStage('repos');
      }
      return;
    }
    if (stage === 'obstacle_verification') {
      if (this.sinceStage() < CHECK_TIME) return;
      const inPath = this.peopleInPush(v, q);
      if (inPath > 0) {
        // avertisseur et sonorisation : les personnes s'écartent ; l'engin attend
        if (core.now >= this.obsHorn) {
          this.obsHorn = core.now + 4;
          if (core.vext) core.vext.horn(v, 1.5);
          if (!this.warned) {
            this.warned = true;
            core.say(this.squad.name, 'Écartez-vous, l’engin va dégager le véhicule.', 1, 'public', this.squad.leaderId);
          }
          if (core.crowd) core.crowd.stir(q.x + this.dirX * 4, q.z + this.dirZ * 4, 10, 0.45, 0);
        }
        if (this.sinceStage() > OBSTACLE_PATIENCE) {
          this.say(report(this.superior(), this.squad.name, 'Des personnes restent dans le couloir de poussée. Je ne pousse pas'));
          this.finish(false, 'Personnes dans le couloir de poussée : poussée refusée.');
          this.setStage('repos');
        }
        return;
      }
      this.say(report(this.superior(), this.squad.name, 'Véhicule vide, personne dans le couloir. Je pousse'));
      ap.stop(v);
      this.pushX = v.x;
      this.pushZ = v.z;
      this.stallSince = 0;
      this.backUntil = 0;
      this.setStage('obstacle_poussee');
      return;
    }
    if (stage === 'obstacle_poussee') {
      const corridor = this.obsCorridor(q);
      const advanced = Math.hypot(v.x - this.pushX, v.z - this.pushZ);
      if (corridor >= OBSTACLE_CORRIDOR) {
        this.brake(v);
        const street = ctx.world.sectorName(q.x, q.z);
        this.say(report(this.superior(), this.squad.name, 'Véhicule poussé hors de la voie' + (street ? ', ' + street : '') + '. Voie dégagée'));
        this.finish(true, '');
        this.setStage('repos');
        return;
      }
      if (this.peopleInPush(v, q) > 0) {
        // quelqu'un est revenu dans le couloir : halte immédiate, nouvelle vérification
        this.brake(v);
        this.warned = false;
        this.setStage('obstacle_verification');
        return;
      }
      // le véhicule a pivoté sous la poussée : on garde le cap de poussée, recalé sur sa position
      if (this.sinceStage() > 60 || advanced > 30) {
        this.brake(v);
        this.say(report(this.superior(), this.squad.name, 'Obstacle trop lourd pour la lame'));
        this.finish(false, 'Obstacle non dégagé.');
        this.setStage('repos');
      }
    }
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  think(): void {
    const v = this.vehicle();
    if (!v) return;
    switch (this.status.stage) {
      case 'route': this.thinkDrive(v); break;
      case 'pointage': this.thinkAim(v); break;
      case 'salve': this.thinkSalvo(v); break;
      case 'approche':
      case 'verification':
      case 'poussee': this.thinkClear(v); break;
      case 'obstacle_approche':
      case 'obstacle_evacuation':
      case 'obstacle_verification':
      case 'obstacle_poussee': this.thinkObstacle(v); break;
      default: break;
    }
  }

  /** La salve de l'ordre en cours est-elle partie ? */
  get hasFired(): boolean {
    return this.fired;
  }

  override onPoliceDone(_type: OrderType, _ok: boolean, _reason: string): void { /* l'engin n'emploie pas d'ordre interne */ }
}
