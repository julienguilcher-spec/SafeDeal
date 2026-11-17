/* =====================================================================================
 * COMMANDEMENT — engin lanceur d'eau (docs/research/06-roles-jouables.md §8, bible §J.1).
 *
 *   mise en place   10 à 15 m derrière la ligne désignée, dans son axe (ordre « proteger » ou
 *                   « suivre » visant une unité ou l'un de ses agents) ;
 *   eteindre        toujours permis : l'engin se porte à portée (25 m utiles, vue dégagée), attend que
 *                   personne ne soit au contact du foyer, puis tient le jet jusqu'à extinction ;
 *   refoulement     moyen de force : seulement si le cadre légal le permet (law.advisor, sinon niveau
 *                   licite ≥ 3). Gradation : pluie (avertissement), puis diffusé de près, jet droit
 *                   au-delà de 15 m seulement ; on vise le sol devant les pieds ; rafales de 3 à 6 s ;
 *                   jamais sur une personne à terre ni sur un tiers protégé ;
 *   réservoir       cuve suivie en permanence ; cuve basse : compte rendu, repli au point d'eau (bouche
 *                   d'incendie de la carte, sinon position de départ), plein, retour en position.
 * La détente d'un canon à eau doit être tenue : fireTurret est rappelé à chaque pas pendant un jet.
 * ===================================================================================== */

import type { OrderType, Person, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import { FORCE_USED_EVENT } from '../api';
import type { JetMode } from '@/sim/vehicles/api';
import type { CommandCore } from './core';
import { isProtester, notPolice } from './core';
import type { Picture } from './picture';
import { SpecialUnit, locate } from './special';
import { received, refused, report, spell } from './texts';

/** Portée utile pour éteindre (m) et pour repousser (m). */
const DOUSE_RANGE = 25;
const PUSH_RANGE = 38;
/** Rayon autour du foyer qui doit être libre de toute personne avant d'ouvrir le jet (m). */
const FIRE_CLEAR = 3.5;
/** Durée d'une rafale et d'une pause (s). */
const BURST = 4.5;
const PAUSE = 2.5;
/** Durée maximale d'un refoulement au jet (s). */
const PUSH_MAX = 90;

export function isCanon(core: CommandCore, s: Squad): boolean {
  const v = s.vehicleId !== 0 ? core.ctx.vehicles.get(s.vehicleId) : undefined;
  return !!v && v.kind === 'canon_eau';
}

export class CanonUnit extends SpecialUnit {
  private fx = 0;
  private fz = 0;
  private fireId = 0;
  private aimX = 0;
  private aimZ = 0;
  private jet = false;
  private mode: JetMode = 'pluie';
  private burstUntil = 0;
  private pauseUntil = 0;
  private bursts = 0;
  private outSince = 0;
  private emptySince = 0;
  private startAmmo = 0;
  private waterX = 0;
  private waterZ = 0;
  /** Position tenue derrière une ligne (reprise après un ravitaillement). */
  private holdSet = false;
  private holdX = 0;
  private holdZ = 0;
  private holdH = 0;
  /** Ordre suspendu par un ravitaillement, repris ensuite. */
  private resume: SquadOrder | null = null;
  private lowReported = false;
  private refilling = false;
  private pushedFrom = 0;
  private moveX = 0;
  private moveZ = 0;
  private moveAt = 0;
  private readonly people: Person[] = [];

  constructor(core: CommandCore, pic: Picture, squad: Squad) {
    super(core, pic, squad, 'canon_eau');
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

  /** Canon servi par l'équipage IA (index de tourelle), mis à jour par gunner(). */
  private jt = 0;

  /**
   * Équipier IA qui sert un canon, et ce canon (this.jt) : l'opérateur, sinon le chef d'engin, sinon le conducteur
   * depuis la cabine. Jamais le joueur : à la place d'un opérateur, il sert son canon lui-même (tâche « jet » ou
   * « extinction », session/orders.ts) ; l'équipage tire alors avec l'autre canon, et la force employée n'est pas
   * imputée au joueur qui n'a pas touché à la détente.
   */
  private gunner(v: Vehicle): Person | null {
    const ctx = this.core.ctx;
    const ext = this.core.vext;
    const seats = v.def.seats;
    let playerTurret = -1;
    for (let i = 0; i < seats.length; i++) {
      const id = v.seats[i];
      const p = id !== 0 ? ctx.people.get(id) : undefined;
      if (p && p.isPlayer && ext) playerTurret = ext.turretOfSeat(v, i);
    }
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].role !== 'gunner') continue;
      const id = v.seats[i];
      const p = id !== 0 ? ctx.people.get(id) : undefined;
      if (!p || p.isPlayer) continue;
      const t = ext ? ext.turretOfSeat(v, i) : 0;
      if (t >= 0 && t !== playerTurret) {
        this.jt = t;
        return p;
      }
    }
    const d = this.seated(v, 'driver');
    if (!d || d.isPlayer) return null;
    // conducteur : un canon que le joueur ne sert pas
    for (let t = 0; t < v.def.turrets.length; t++) {
      if (v.def.turrets[t].kind === 'canon_eau' && t !== playerTurret) {
        this.jt = t;
        return d;
      }
    }
    return null;
  }

  /**
   * Le joueur tient le volant de l'engin : c'est lui qui conduit et décide du plein (bouche d'incendie à portée de
   * tuyau, ou ravitaillement demandé — sim/police/supply-player.ts). L'équipage ne se replie pas à sa place et ne
   * remplit pas la cuve n'importe où.
   */
  private playerDriving(v: Vehicle): boolean {
    const d = this.seated(v, 'driver');
    return !!d && d.isPlayer;
  }

  private capacity(v: Vehicle): number {
    return v.def.turrets.length > 0 ? v.def.turrets[0].capacity : 0;
  }

  private litres(v: Vehicle): string {
    return spell(Math.max(0, Math.round(v.turretAmmo[0] / 100) * 100)) + ' litres';
  }

  // ───────────────────────────── ordres ─────────────────────────────

  claim(o: SquadOrder): boolean {
    const v = this.vehicle();
    if (!v) return false;
    const type = o.type;
    if (type === 'eteindre') {
      this.beginDouse(v, o);
      return true;
    }
    if (type === 'refoulement' || type === 'disperser_gaz') {
      this.beginPush(v, o);
      return true;
    }
    if (type === 'ravitailler') {
      this.order = this.copy(o);
      this.status.order = type;
      this.beginRefill(v, false);
      return true;
    }
    if ((type === 'proteger' || type === 'suivre') && this.behindLine(o)) {
      this.beginHold(v, o);
      return true;
    }
    // avancer, tenir, repli, cesser… : conduite ordinaire d'un équipage (module de police)
    this.stopJet(v);
    this.order = null;
    this.resume = null;
    this.status.order = '';
    this.setStage('repos');
    if (type === 'avancer' || type === 'repli' || type === 'colonne') this.holdSet = false;
    return false;
  }

  private stopJet(v: Vehicle): void {
    this.jet = false;
    const ext = this.core.vext;
    if (ext) ext.clearTurretTarget(v, this.jt);
  }

  // ───────────────────────────── mise en place derrière la ligne ─────────────────────────────

  /** L'ordre vise-t-il une unité en ligne (ou l'un de ses agents) ? Calcule alors la position derrière elle. */
  private behindLine(o: SquadOrder): boolean {
    const core = this.core;
    const ctx = core.ctx;
    if (!core.formation || o.targetId <= 0) return false;
    const p = ctx.people.get(o.targetId);
    const squadId = p ? p.squadId : ctx.squads.get(o.targetId) ? o.targetId : 0;
    if (squadId === 0 || (p && p.faction !== 'police')) return false;
    const info = core.formation.of(squadId);
    if (!info || (info.formation !== 'ligne' && info.formation !== 'tortue')) return false;
    const back = core.tuning.canonBehind;
    this.holdX = info.x - Math.sin(info.heading) * back;
    this.holdZ = info.z - Math.cos(info.heading) * back;
    this.holdH = info.heading;
    return true;
  }

  private beginHold(v: Vehicle, o: SquadOrder): void {
    const core = this.core;
    this.order = this.copy(o);
    this.status.order = o.type;
    this.stopJet(v);
    const ap = core.autopilot;
    if (!ap) {
      this.say(refused(this.squad.name, 'Engin immobilisé, pas de pilote disponible'));
      this.refuse(o, 'Pilote automatique indisponible.');
      return;
    }
    // le véhicule s'arrête sur l'axe, cap vers la ligne
    const v2 = core.v2;
    v2.x = this.holdX;
    v2.z = this.holdZ;
    core.ctx.world.resolveCircle(v2, v.def.width * 0.5 + 0.3);
    this.holdX = v2.x;
    this.holdZ = v2.z;
    this.holdSet = true;
    const ok = ap.park(v, this.holdX, this.holdZ, this.holdH) || ap.driveTo(v, this.holdX, this.holdZ, { speed: 4 });
    if (!ok) {
      this.say(refused(this.squad.name, 'Itinéraire impossible'));
      this.refuse(o, 'Aucun itinéraire.');
      return;
    }
    this.say(received(this.squad.name, 'je me place derrière la ligne, dans l’axe'));
    this.setStage('mise_en_place');
  }

  // ───────────────────────────── extinction ─────────────────────────────

  private beginDouse(v: Vehicle, o: SquadOrder): void {
    const core = this.core;
    const ctx = core.ctx;
    this.order = this.copy(o);
    this.status.order = o.type;
    this.fx = o.x;
    this.fz = o.z;
    this.fireId = 0;
    if (locate(core, o.targetId)) {
      this.fx = core.v2.x;
      this.fz = core.v2.z;
      this.fireId = o.targetId;
    } else {
      // objet en feu au point désigné, s'il y en a un
      const n = ctx.props.queryRadius(o.x, o.z, 4, core.props);
      for (let i = 0; i < n; i++) if (core.props[i].burning > 0.05) this.fireId = core.props[i].id;
    }
    this.status.targetId = this.fireId;
    if (!core.vext || v.def.turrets.length === 0 || !this.gunner(v)) {
      this.say(refused(this.squad.name, 'Canons indisponibles'));
      this.refuse(o, 'Canons indisponibles.');
      return;
    }
    if (v.turretAmmo[0] <= 1) {
      this.resume = this.copy(o);
      this.beginRefill(v, true);
      return;
    }
    this.startAmmo = v.turretAmmo[0];
    this.outSince = 0;
    this.say(received(this.squad.name, 'j’éteins le feu' + (core.sector(this.fx, this.fz) !== '' ? ', ' + core.sector(this.fx, this.fz) : '') + '. Reste ' + this.litres(v)));
    this.reach(v, this.fx, this.fz, DOUSE_RANGE, 'approche_feu', 'jet_feu');
  }

  /** Se porte à portée de (x, z) avec vue dégagée, ou passe directement à l'étape suivante. */
  private reach(v: Vehicle, x: number, z: number, range: number, driveStage: string, readyStage: string): void {
    const core = this.core;
    const d = Math.hypot(x - v.x, z - v.z);
    if (d <= range && core.ctx.world.lineOfSight(v.x, v.z, x, z)) {
      if (core.autopilot) core.autopilot.stop(v);
      this.setStage(readyStage);
      return;
    }
    const ap = core.autopilot;
    if (!ap || !ap.driveTo(v, x, z, { speed: 4.5, stopBefore: range * 0.7 })) {
      const o = this.order;
      this.say(refused(this.squad.name, 'Objectif hors de portée, itinéraire impossible'));
      if (o) this.refuse(o, 'Objectif hors de portée.');
      this.setStage('repos');
      return;
    }
    this.setStage(driveStage);
  }

  private fireStillBurning(): boolean {
    const ctx = this.core.ctx;
    if (ctx.hazards.fireAt(this.fx, this.fz) > 0.05) return true;
    if (this.fireId !== 0) {
      const prop = ctx.props.get(this.fireId);
      if (prop && prop.burning > 0.03) return true;
      const v = ctx.vehicles.get(this.fireId);
      if (v && (v.burning > 0.03 || v.state === 'burning')) return true;
      const p = ctx.people.get(this.fireId);
      if (p && p.burning > 0.03) return true;
    }
    return false;
  }

  private thinkDouse(v: Vehicle): void {
    const core = this.core;
    const ctx = core.ctx;
    const ext = core.vext;
    const o = this.order;
    if (!ext || !o) return;
    const now = core.now;
    const stage = this.status.stage;
    if (stage === 'approche_feu') {
      const ap = core.autopilot;
      const d = Math.hypot(this.fx - v.x, this.fz - v.z);
      const st = ap ? ap.status(v) : null;
      if (d <= DOUSE_RANGE && ctx.world.lineOfSight(v.x, v.z, this.fx, this.fz)) {
        if (ap) ap.stop(v);
        if (Math.abs(v.speed) < 0.5) this.setStage('jet_feu');
      } else if (!st || st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 20) || this.sinceStage() > 120
        || ((st.state === 'arrive' || st.mode === 'idle') && this.sinceStage() > 2)) {
        this.say(report(this.superior(), this.squad.name, 'Feu hors de portée des canons, demande les pompiers'));
        this.finish(false, 'Feu hors de portée.');
        this.setStage('repos');
      }
      return;
    }
    // l'objet en feu a pu rouler ou être poussé : le jet le suit
    const burningProp = this.fireId !== 0 ? ctx.props.get(this.fireId) : undefined;
    if (burningProp) {
      this.fx = burningProp.x;
      this.fz = burningProp.z;
    }
    // jet sur le feu
    if (!this.fireStillBurning()) {
      if (this.outSince === 0) this.outSince = now;
      if (now - this.outSince >= 1.2 || !this.jet) {
        this.stopJet(v);
        this.say(report(this.superior(), this.squad.name, 'Feu éteint' + (core.sector(this.fx, this.fz) !== '' ? ', ' + core.sector(this.fx, this.fz) : '') + '. Reste ' + this.litres(v)));
        this.finish(true, '');
        this.setStage('repos');
        this.afterAction(v);
        return;
      }
    } else {
      this.outSince = 0;
    }
    if (v.turretAmmo[0] <= 1) {
      this.stopJet(v);
      this.resume = this.copy(o);
      this.beginRefill(v, true);
      return;
    }
    if (this.sinceStage() > 100) {
      this.stopJet(v);
      this.say(report(this.superior(), this.squad.name, 'Feu non maîtrisé, demande les pompiers. Reste ' + this.litres(v)));
      this.finish(false, 'Feu non maîtrisé.');
      this.setStage('repos');
      return;
    }
    // personne au contact du foyer : on attend qu'ils s'écartent (le jet n'est pas un moyen de force ici)
    const close = ctx.people.countIn(this.fx, this.fz, FIRE_CLEAR, notPolice);
    if (close > 0) {
      this.jet = false;
      if (this.emptySince === 0) {
        this.emptySince = now;
        core.say(this.squad.name, 'Écartez-vous du feu, nous allons l’éteindre.', 1, 'public', this.squad.leaderId);
        if (core.vext) core.vext.horn(v, 1);
        if (core.crowd) core.crowd.stir(this.fx, this.fz, 6, 0.3, 0);
      } else if (now - this.emptySince > 25) {
        this.say(report(this.superior(), this.squad.name, 'Des personnes restent au contact du foyer, je ne peux pas ouvrir le jet'));
        this.finish(false, 'Personnes au contact du foyer.');
        this.setStage('repos');
      }
      return;
    }
    this.emptySince = 0;
    // (équipier aux canons : celui que le joueur ne sert pas — voir gunner())
    if (!this.gunner(v)) {
      this.stopJet(v);
      this.finish(false, 'Aucun équipier aux canons.');
      this.setStage('repos');
      return;
    }
    const d = Math.hypot(this.fx - v.x, this.fz - v.z);
    // mobilier léger en feu : jet en pluie, qui l'arrose sans le projeter ; sinon diffusé de près, droit de loin
    const mode: JetMode = burningProp && burningProp.movable ? 'pluie' : d <= 18 ? 'diffus' : 'droit';
    if (mode !== this.mode || !this.jet) {
      this.mode = mode;
      ext.setJetMode(v, this.jt, mode);
    }
    this.aimX = this.fx;
    this.aimZ = this.fz;
    this.jet = ext.aimTurretAt(v, this.jt, this.fx, ctx.world.heightAt(this.fx, this.fz), this.fz);
    if (!this.jet && this.sinceStage() > 6) {
      // hors du débattement : on se rapproche
      this.reach(v, this.fx, this.fz, DOUSE_RANGE * 0.6, 'approche_feu', 'jet_feu');
    }
  }

  // ───────────────────────────── refoulement au jet ─────────────────────────────

  private lawful(v: Vehicle, o: SquadOrder, x: number, z: number): string {
    const core = this.core;
    const by = this.gunner(v);
    if (!by) return 'Aucun opérateur aux canons.';
    if (o.maxForce < 3) return 'Niveau de force de l’ordre insuffisant pour l’engin lanceur d’eau.';
    if (core.advisor) {
      const verdict = core.advisor.assess(by, 'canon_eau', null, x, z);
      return verdict.kind === 'licite' ? '' : verdict.reason;
    }
    return core.ctx.law.roe.lawfulForce >= 3 ? '' : 'Emploi de la force non autorisé : les sommations ne sont pas terminées.';
  }

  private beginPush(v: Vehicle, o: SquadOrder): void {
    const core = this.core;
    this.order = this.copy(o);
    this.status.order = o.type;
    if (!core.vext || v.def.turrets.length === 0) {
      this.say(refused(this.squad.name, 'Canons indisponibles'));
      this.refuse(o, 'Canons indisponibles.');
      return;
    }
    const reason = this.lawful(v, o, o.x, o.z);
    if (reason !== '') {
      this.say(refused(this.squad.name, 'Aucun jet sur la foule : cadre légal non réuni'));
      this.refuse(o, reason);
      this.setStage('repos');
      return;
    }
    if (v.turretAmmo[0] <= this.capacity(v) * 0.03) {
      this.resume = this.copy(o);
      this.beginRefill(v, true);
      return;
    }
    this.fx = o.x;
    this.fz = o.z;
    this.bursts = 0;
    this.pauseUntil = 0;
    this.burstUntil = 0;
    this.startAmmo = v.turretAmmo[0];
    this.pushedFrom = core.ctx.people.countIn(o.x, o.z, 20, isProtester);
    this.say(received(this.squad.name, 'jet sur la zone désignée, pluie d’abord. Reste ' + this.litres(v)));
    this.reach(v, o.x, o.z, PUSH_RANGE, 'approche_jet', 'jet_foule');
  }

  /** Groupe à repousser autour de la zone : barycentre dans (aimX, aimZ) ; retourne son effectif. */
  private acquire(v: Vehicle): number {
    const core = this.core;
    const n = core.ctx.people.queryRadius(this.fx, this.fz, 24, this.people, isProtester);
    let sx = 0;
    let sz = 0;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      if (Math.hypot(p.x - v.x, p.z - v.z) > PUSH_RANGE + 6) continue;
      sx += p.x;
      sz += p.z;
      m++;
    }
    if (m === 0) return 0;
    sx /= m;
    sz /= m;
    // on vise le sol devant les pieds : deux mètres en deçà du groupe, côté engin
    const d = Math.hypot(sx - v.x, sz - v.z) || 1;
    this.aimX = sx - ((sx - v.x) / d) * 2;
    this.aimZ = sz - ((sz - v.z) / d) * 2;
    return m;
  }

  /** Personne à terre ou tiers protégé dans la zone d'impact : la rafale n'est pas tirée. */
  private protectedInImpact(): boolean {
    const core = this.core;
    const n = core.ctx.people.queryRadius(this.aimX, this.aimZ, 4.5, this.people);
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      if (p.faction === 'police') return true;
      if (p.posture === 'down' || p.custody !== 'free') return true;
      if (p.faction === 'press' || p.faction === 'medic' || p.faction === 'rescue') return true;
    }
    return false;
  }

  private thinkPush(v: Vehicle): void {
    const core = this.core;
    const ctx = core.ctx;
    const ext = core.vext;
    const o = this.order;
    if (!ext || !o) return;
    const now = core.now;
    const stage = this.status.stage;
    if (stage === 'approche_jet') {
      const ap = core.autopilot;
      const st = ap ? ap.status(v) : null;
      const d = Math.hypot(this.fx - v.x, this.fz - v.z);
      if (d <= PUSH_RANGE && ctx.world.lineOfSight(v.x, v.z, this.fx, this.fz)) {
        if (ap) ap.stop(v);
        if (Math.abs(v.speed) < 0.5) this.setStage('jet_foule');
      } else if (!st || st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 20) || this.sinceStage() > 120
        || ((st.state === 'arrive' || st.mode === 'idle') && this.sinceStage() > 2)) {
        this.say(report(this.superior(), this.squad.name, 'Zone hors de portée des canons'));
        this.finish(false, 'Zone hors de portée.');
        this.setStage('repos');
      }
      return;
    }
    const endPush = (ok: boolean, body: string, reason: string): void => {
      this.stopJet(v);
      this.say(report(this.superior(), this.squad.name, body + '. Reste ' + this.litres(v)));
      this.finish(ok, reason);
      this.setStage('repos');
      this.afterAction(v);
    };
    if (v.turretAmmo[0] <= 1) {
      this.stopJet(v);
      this.resume = this.copy(o);
      this.beginRefill(v, true);
      return;
    }
    if (this.jet) {
      // rafale en cours : tenue jusqu'à son terme, sauf si un tiers entre dans la zone d'impact
      if (now >= this.burstUntil || this.protectedInImpact()) {
        this.jet = false;
        this.pauseUntil = now + PAUSE;
        ext.clearTurretTarget(v, this.jt);
      }
      return;
    }
    if (now < this.pauseUntil) return;
    const present = this.acquire(v);
    if (present < 3) {
      endPush(true, this.bursts > 0 ? 'Jet terminé, la zone se vide' : 'Zone déjà libre, aucun jet', '');
      return;
    }
    if (this.sinceStage() > PUSH_MAX) {
      endPush(true, 'Jet interrompu, effet partiel, ' + spell(present) + ' personnes encore présentes', '');
      return;
    }
    // le cadre est revérifié avant chaque rafale (dispersion effective, halte ordonnée)
    const reason = this.lawful(v, o, this.aimX, this.aimZ);
    if (reason !== '') {
      endPush(this.bursts > 0, 'Halte au jet : cadre légal non réuni', reason);
      return;
    }
    if (this.protectedInImpact()) {
      this.pauseUntil = now + 1;
      return;
    }
    const d = Math.hypot(this.aimX - v.x, this.aimZ - v.z);
    // gradation : pluie d'abord (avertissement) ; puis diffusé de près, jet droit au-delà de la distance minimale
    let mode: JetMode = 'pluie';
    if (this.bursts >= 1) mode = d >= core.tuning.canonMinStraight + 3 ? 'droit' : 'diffus';
    this.mode = mode;
    ext.setJetMode(v, this.jt, mode);
    if (!ext.aimTurretAt(v, this.jt, this.aimX, ctx.world.heightAt(this.aimX, this.aimZ), this.aimZ)) {
      this.pauseUntil = now + 1;
      if (this.sinceStage() > 20 && this.bursts === 0) endPush(false, 'Zone hors du débattement des canons', 'Zone hors de portée.');
      return;
    }
    this.jet = true;
    this.bursts++;
    this.burstUntil = now + BURST;
    const by = this.gunner(v);
    ctx.events.emitAny(FORCE_USED_EVENT, { squadId: this.squad.id, means: 'canon_eau', x: this.aimX, z: this.aimZ, byId: by ? by.id : 0 });
  }

  // ───────────────────────────── réservoir ─────────────────────────────

  /** Point d'eau : bouche d'incendie la plus proche (300 m), sinon la position de départ. */
  private findWater(v: Vehicle): void {
    const core = this.core;
    // le mobilier fixe de la carte est « endormi » (hors des requêtes spatiales) : parcours de la liste, rare
    const list = core.ctx.props.list;
    let bestD = 300 * 300;
    let found = false;
    this.waterX = this.homeX;
    this.waterZ = this.homeZ;
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      if (q.kind !== 'bouche_incendie') continue;
      const d = (q.x - v.x) * (q.x - v.x) + (q.z - v.z) * (q.z - v.z);
      if (d < bestD) {
        bestD = d;
        found = true;
        this.waterX = q.x;
        this.waterZ = q.z;
      }
    }
    // la bouche est sur le trottoir : l'engin s'arrête sur la chaussée, à sa hauteur
    if (found && core.ctx.world.nearestRoad(this.waterX, this.waterZ, core.road, 20)) {
      this.waterX = core.road.x;
      this.waterZ = core.road.z;
    }
  }

  private beginRefill(v: Vehicle, automatic: boolean): void {
    const core = this.core;
    this.stopJet(v);
    if (this.playerDriving(v)) {
      // (le joueur conduit : l'ordre en cours s'arrête là, le plein est à sa main)
      this.resume = null;
      if (this.order) this.finish(false, 'Cuve basse : plein à faire par le conducteur.');
      this.setStage('repos');
      return;
    }
    this.findWater(v);
    this.refilling = false;
    const body = 'Cuve à ' + this.litres(v) + ', je me replie pour ravitailler';
    this.say(automatic ? report(this.superior(), this.squad.name, body) : received(this.squad.name, 'ravitaillement en eau'));
    this.emitStage('ravitaillement', true, '');
    const ap = core.autopilot;
    const d = Math.hypot(this.waterX - v.x, this.waterZ - v.z);
    // point d'eau à portée de tuyau (45 m) : plein sur place, sans manœuvrer un engin de dix mètres
    this.moveX = v.x;
    this.moveZ = v.z;
    this.moveAt = core.now;
    if (d > 45 && ap && ap.driveTo(v, this.waterX, this.waterZ, { speed: 5, stopBefore: 5 })) {
      this.setStage('repli_eau');
    } else {
      if (ap) ap.stop(v);
      this.setStage('plein');
    }
  }

  private thinkRefill(v: Vehicle): void {
    const core = this.core;
    const ext = core.vext;
    const ap = core.autopilot;
    if (!ext) return;
    if (this.status.stage === 'repli_eau') {
      const st = ap ? ap.status(v) : null;
      const d = Math.hypot(this.waterX - v.x, this.waterZ - v.z);
      // engin qui n'avance plus (demi-tour impossible dans une rue étroite) : le plein se fait où il est
      if (Math.hypot(v.x - this.moveX, v.z - this.moveZ) > 2) {
        this.moveX = v.x;
        this.moveZ = v.z;
        this.moveAt = core.now;
      }
      const stalled = core.now - this.moveAt > 25;
      if (!st || stalled || st.state === 'arrive' || st.mode === 'idle' || d < 45 || st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 20) || this.sinceStage() > 180) {
        if (ap) ap.stop(v);
        this.setStage('plein');
      }
      return;
    }
    // plein : à l'arrêt seulement
    if (Math.abs(v.speed) > 0.2) return;
    if (!this.refilling) {
      this.refilling = ext.refill(v);
      if (!this.refilling && this.sinceStage() > 15) {
        this.say(report(this.superior(), this.squad.name, 'Plein impossible, engin indisponible'));
        if (this.order) this.finish(false, 'Plein impossible.');
        this.resume = null;
        this.setStage('repos');
      }
      return;
    }
    const ts = ext.turretStatus(v, 0);
    if (ts.service < 0 && v.turretAmmo[0] >= this.capacity(v) * 0.97) {
      this.refilling = false;
      this.lowReported = false;
      this.say(report(this.superior(), this.squad.name, 'Plein fait, ' + this.litres(v) + '. Je reprends ma position'));
      const pending = this.resume;
      this.resume = null;
      const o = this.order;
      if (o && o.type === 'ravitailler') this.finish(true, '');
      this.setStage('repos');
      if (pending) {
        // l'ordre suspendu est repris
        if (pending.type === 'eteindre') this.beginDouse(v, pending);
        else this.beginPush(v, pending);
      } else {
        this.returnToHold(v);
      }
    } else if (this.sinceStage() > 400) {
      this.refilling = false;
      this.setStage('repos');
    }
  }

  private returnToHold(v: Vehicle): void {
    const ap = this.core.autopilot;
    if (!this.holdSet || !ap) return;
    if (Math.hypot(this.holdX - v.x, this.holdZ - v.z) < 6) return;
    if (ap.park(v, this.holdX, this.holdZ, this.holdH) || ap.driveTo(v, this.holdX, this.holdZ, { speed: 4 })) this.setStage('retour');
  }

  /** Après une action : cuve basse → ravitaillement d'initiative ; sinon retour derrière la ligne. */
  private afterAction(v: Vehicle): void {
    if (v.turretAmmo[0] <= this.capacity(v) * this.core.tuning.canonLow) {
      this.beginRefill(v, true);
      return;
    }
    this.returnToHold(v);
  }

  // ───────────────────────────── pas et réflexion ─────────────────────────────

  /** Détente tenue : le jet doit être redemandé à chaque pas. */
  override step(): void {
    if (!this.jet) return;
    const ctx = this.core.ctx;
    const v = ctx.vehicles.get(this.squad.vehicleId);
    if (!v) {
      this.jet = false;
      return;
    }
    const by = this.gunner(v);
    if (!by || !ctx.vehicles.fireTurret(v, this.jt, by.id)) this.jet = false;
  }

  think(): void {
    const v = this.vehicle();
    if (!v) return;
    const stage = this.status.stage;
    switch (stage) {
      case 'approche_feu':
      case 'jet_feu':
        this.thinkDouse(v);
        break;
      case 'approche_jet':
      case 'jet_foule':
        this.thinkPush(v);
        break;
      case 'repli_eau':
      case 'plein':
        this.thinkRefill(v);
        break;
      case 'mise_en_place':
      case 'retour': {
        const ap = this.core.autopilot;
        const st = ap ? ap.status(v) : null;
        // arrivé à sa place : le pilote automatique peut rester en attente derrière les agents du second rang
        const there = this.holdSet && Math.hypot(this.holdX - v.x, this.holdZ - v.z) < 3 && Math.abs(v.speed) < 0.2 && this.sinceStage() > 2;
        if (there && ap) ap.stop(v);
        if (!st || there || st.state === 'arrive' || st.mode === 'idle' || st.state === 'echec' || this.sinceStage() > 150) {
          const ok = there || !st || st.state !== 'echec';
          if (stage === 'mise_en_place') {
            this.say(report(this.superior(), this.squad.name, ok ? 'En place derrière la ligne, ' + this.litres(v) : 'Mise en place impossible'));
            this.finish(ok, ok ? '' : 'Mise en place impossible.');
          }
          this.setStage('repos');
        }
        break;
      }
      default:
        // au repos : la cuve basse est signalée, et l'engin va faire le plein de lui-même
        if (!this.lowReported && this.capacity(v) > 0 && v.turretAmmo[0] <= this.capacity(v) * this.core.tuning.canonLow && this.core.vext && !this.playerDriving(v)) {
          this.lowReported = true;
          this.beginRefill(v, true);
        }
        break;
    }
  }

  override onPoliceDone(_type: OrderType, _ok: boolean, _reason: string): void { /* l'engin n'emploie pas d'ordre interne */ }

  /** Litres consommés depuis le début de l'action en cours (pour les essais). */
  get used(): number {
    const v = this.core.ctx.vehicles.get(this.squad.vehicleId);
    return v ? this.startAmmo - v.turretAmmo[0] : 0;
  }

  get pushed(): number {
    return this.pushedFrom;
  }
}
