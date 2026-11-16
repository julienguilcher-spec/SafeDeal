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
 * C'est le canon à eau qui éteint : le Centaure ne reçoit pas l'ordre « eteindre ».
 * ===================================================================================== */

import type { OrderType, Person, Prop, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import { FORCE_USED_EVENT } from '../api';
import type { CommandCore } from './core';
import { isProtester, notPolice } from './core';
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
  private readonly people: Person[] = [];

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
    } else if (st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 25)) {
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
    if (ctx.people.countIn(o.x, o.z, 18, (p) => p.faction === 'police' && p.vehicleId === 0) > 0) {
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
    const core = this.core;
    const n = core.ctx.people.queryRadius(this.propX + this.dirX * 4, this.propZ + this.dirZ * 4, 9, this.people, notPolice);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      const fwd = (p.x - this.propX) * this.dirX + (p.z - this.propZ) * this.dirZ;
      const lat = Math.abs((p.x - this.propX) * -this.dirZ + (p.z - this.propZ) * this.dirX);
      if (fwd > -2.5 && fwd < 11 && lat < 3.2) m++;
    }
    return m;
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
      if (!ap.driveTo(v, this.propX + this.dirX * 9, this.propZ + this.dirZ * 9, { speed: core.tuning.centaurePush, pushThrough: true })) {
        this.finish(false, 'Aucun itinéraire.');
        this.setStage('repos');
        return;
      }
      this.setStage('poussee');
      return;
    }
    if (stage === 'poussee') {
      const gone = !prop || !prop.blocksMove || Math.hypot(prop.x - this.propX, prop.z - this.propZ) > 3;
      const st = ap.status(v);
      if (this.cleared || gone) {
        ap.stop(v);
        this.say(report(this.superior(), this.squad.name, 'Barricade dégagée, passage ouvert' + (this.burning ? '. Foyers dispersés, demande l’engin lanceur d’eau' : '')));
        this.finish(true, '');
        this.setStage('repos');
      } else if (this.peopleBehind() > 0 && Math.hypot(this.propX - v.x, this.propZ - v.z) > v.def.length * 0.5 + 1.5) {
        // quelqu'un est revenu derrière l'obstacle : halte immédiate, nouvelle vérification
        ap.stop(v);
        this.warned = false;
        this.setStage('verification');
      } else if (st.state === 'echec' || this.sinceStage() > 30 || ((st.state === 'arrive' || st.mode === 'idle') && this.sinceStage() > 3)) {
        ap.stop(v);
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
      default: break;
    }
  }

  /** La salve de l'ordre en cours est-elle partie ? */
  get hasFired(): boolean {
    return this.fired;
  }

  override onPoliceDone(_type: OrderType, _ok: boolean, _reason: string): void { /* l'engin n'emploie pas d'ordre interne */ }
}
