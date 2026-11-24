/* =====================================================================================
 * Droit — interpellation : de la maîtrise à la remise à l'officier de police judiciaire.
 *
 * Déroulé (docs/research/01-doctrine-cadre-legal.md §6.3) :
 *   maîtriser (subdue.ts) → menotter (si dangerosité ou risque de fuite, art. 803 du code de
 *   procédure pénale) → palper (objets dangereux : port d'arme) → escorter → remettre (véhicule de
 *   police ou point de regroupement, handover.ts) ; à tout moment : relâcher.
 *
 * Ce composant tient l'état des personnes retenues — Person.custody, liens tenir / être tenu
 * (heldBy / carrying), postures et animations — et note chaque procédure : fondée ou non, preuves,
 * force employée, menottage justifié ou non, solidité pour le parquet.
 *
 * États et liens :
 *   held      maîtrisée au sol (posture 'prone'), tenue par l'agent ; non menottée, elle s'échappe
 *             si l'agent s'éloigne ou est mis hors de combat ;
 *   cuffed    menottée (upper 'cuffed'), assise ou au sol, sans gardien nécessaire ;
 *   escorted  debout, tenue par le bras : le module de locomotion la fait marcher devant l'agent
 *             (lien heldBy / carrying) ; sans lui, custody-step.ts la ramène au contact ;
 *   in_vehicle / handed_over  remise : la procédure est close (à bord : « remis_vehicule », en attente du transfert ;
 *             au commissariat, Records.markDelivered : « depose », présenté à l'officier de police judiciaire).
 * ===================================================================================== */

import type { EntityId, ItemId, Person } from '@/core/contracts';
import type { ArrestRecord, ArrestStatus, ForceRecord } from './api';
import { CAMERA_THIRD_PARTY } from './api';
import type { HandoverDest } from './handover';
import type { Kernel } from './kernel';
import { PROTECTED_LABELS } from './perception';
import { SEIZED_ITEMS, WEAPON_ITEMS, handoverRadioText, hourText, offenseLabel } from './texts';

/** Fenêtre avant l'interpellation dont les emplois de la force sont rattachés au dossier (s). */
const FORCE_LOOKBACK = 30;
/** Délai entre la remise du joueur (rôle civil) à l'officier de police judiciaire et la fin de la partie (s). */
export const PLAYER_CUSTODY_END_DELAY = 8;

/** État d'exécution d'une retenue en cours. */
export interface Hold {
  rec: ArrestRecord;
  target: Person;
  /** Agent qui maintient la personne au sol (0 si personne). */
  holderId: EntityId;
  /** Agent qui escorte (0 si personne). */
  escortId: EntityId;
  looseSince: number;
  nextEscapeCheck: number;
  /** Une paire de menottes de la dotation a été consommée (à restituer). */
  cuffItem: boolean;
  /** Endroit où la personne a été amenée au sol : elle y reste tant qu'elle est maintenue. */
  pinX: number;
  pinZ: number;
}

export class Custody {
  /** Retenues en cours (lu par custody-step.ts). */
  readonly holds: Hold[] = [];
  /** Personnes remises à un point de regroupement, assises en attente. */
  readonly parked: Person[] = [];
  private readonly holdOf = new Map<EntityId, Hold>();
  private readonly seizeIds: ItemId[] = [];
  /**
   * Joueur non policier remis à l'OPJ : instant de la remise (-1 sinon). La garde à vue met fin à sa
   * partie (custody-step.ts) — sans cela il resterait assis, menotté, sans commande ni issue.
   */
  playerHandedAt = -1;
  playerHandedId: EntityId = 0;

  constructor(private readonly k: Kernel) {}

  reset(): void {
    this.holds.length = 0;
    this.holdOf.clear();
    this.parked.length = 0;
    this.playerHandedAt = -1;
    this.playerHandedId = 0;
  }

  // ───────────────────────────── aptitudes ─────────────────────────────

  /** L'agent peut-il procéder à une interpellation ? */
  canAct(actor: Person): boolean {
    return actor.faction === 'police' && actor.custody === 'free' && actor.vehicleId === 0 && !this.k.ctx.health.isIncapacitated(actor);
  }

  /** Agent présent et en état de tenir quelqu'un. */
  able(p: Person | undefined): p is Person {
    return p !== undefined && p.custody === 'free' && !this.k.ctx.health.isIncapacitated(p);
  }

  /** Les menottes sont-elles un objet de la dotation (module des objets branché) ? */
  private cuffsAreItems(): boolean {
    return this.k.ctx.actions.def('menottes') !== undefined;
  }

  /** L'agent a-t-il de quoi menotter ? (toujours vrai tant qu'aucun module ne définit l'objet « menottes ») */
  hasCuffs(actor: Person): boolean {
    return !this.cuffsAreItems() || this.k.ctx.actions.has(actor, 'menottes') > 0;
  }

  /** Dossier en cours de la personne retenue (null si elle ne l'est pas). */
  holdFor(targetId: EntityId): ArrestRecord | null {
    const h = this.holdOf.get(targetId);
    return h ? h.rec : null;
  }

  // ───────────────────────────── interpellation ─────────────────────────────

  /**
   * La personne est maîtrisée : privation de liberté, ouverture du dossier.
   * `resisted` : elle s'était déjà dégagée d'une saisie (risque de fuite établi).
   */
  arrest(actor: Person, target: Person, resisted = false): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = ctx.clock.now;
    const founded = k.offenses.canArrest(target);
    const motif = k.offenses.evidenced(target, 2) ?? k.offenses.worst(target);
    const prot = founded ? '' : k.eyes.protectedKind(target);
    const rec: ArrestRecord = {
      n: k.records.interpellations.length + 1,
      targetId: target.id, targetName: target.name, byId: actor.id, byName: actor.name,
      t: now, x: target.x, z: target.z,
      motif: motif ? motif.type : null,
      motifLabel: motif ? offenseLabel(motif.type) : 'aucun fait rattaché',
      severity: motif ? motif.severity : 0,
      founded,
      witnessed: motif ? motif.witnessed : false,
      filmed: motif ? motif.filmed : false,
      protectedTarget: prot === 'collegue' ? '' : prot,
      force: [], worstVerdict: 'licite', worstSeverity: 0,
      resisted, cuffed: false, cuffJustified: true, searched: false, seized: [],
      status: 'en_cours', closedAt: -1, to: '', vehicleId: 0, vehicleName: '', station: '', deliveredAt: -1,
      strength: founded ? (motif && motif.filmed ? 'solide' : 'fragile') : 'nulle',
      regular: founded, notes: [],
    };
    if (!founded) {
      rec.notes.push(prot !== '' && prot !== 'collegue'
        ? "interpellation d'" + PROTECTED_LABELS[prot] + ' sans fait constaté'
        : motif ? "le fait reproché n'a été ni vu par un agent ni filmé" : 'aucun fait constaté : interpellation infondée');
    }
    k.records.interpellations.push(rec);
    k.records.open.set(target.id, rec);
    const hold: Hold = {
      rec, target, holderId: actor.id, escortId: 0, looseSince: -1, nextEscapeCheck: now + 1, cuffItem: false,
      pinX: target.x, pinZ: target.z,
    };
    this.holds.push(hold);
    this.holdOf.set(target.id, hold);
    k.ways.touched(actor, target);

    target.custody = 'held';
    target.heldBy = actor.id;
    actor.carrying = target.id;
    if (target.posture !== 'down') target.posture = 'prone';
    // mains immobilisées : ce qu'elle tenait n'est plus en main (l'objet reste sur elle jusqu'à la palpation)
    if (target.active >= 0) ctx.actions.select(target, -1);
    target.upper = 'none';
    target.vx = 0;
    target.vz = 0;
    target.cmd.moveX = 0;
    target.cmd.moveZ = 0;
    if (target.fear < 0.6) target.fear = 0.6;
    actor.upper = 'restrain';

    // emplois de la force déjà dirigés contre la personne juste avant
    const log = k.records.forces;
    for (let i = log.length - 1; i >= 0; i--) {
      const r = log[i]!;
      if (now - r.t > FORCE_LOOKBACK) break;
      if (r.targetId === target.id) this.addForce(rec, r);
    }
    // la saisie elle-même est un emploi de la force au niveau du contact
    k.force.report(actor, 'contact', target, target.x, target.z);

    ctx.events.emit('person:arrested', { id: target.id, byId: actor.id, lawful: founded });
    if (founded) {
      k.notify(actor, 'Interpellation fondée : ' + rec.motifLabel + (rec.filmed ? ' (fait filmé).' : ' (fait constaté par un agent).'), 'ok', 6);
    } else {
      const cams = k.eyes.cameras(target.x, target.z, actor.id, null);
      k.records.addComplaint(now, 'interpellation', target, actor.id, 'interpellation sans fait constaté', prot !== '' ? 4 : 3, (cams & CAMERA_THIRD_PARTY) !== 0);
      ctx.director.addTension(0.03, target.x, target.z, 'Interpellation sans motif apparent');
      k.notify(actor, 'Interpellation sans fait constaté : la procédure est nulle. Relâchez la personne ou assumez la faute.', 'alert', 8);
    }
    // le joueur peut aussi être celui qu'on interpelle
    k.notify(target, founded ? 'Vous êtes interpellé pour ' + rec.motifLabel + '.' : "Vous êtes interpellé alors qu'aucun fait ne vous est reproché.", 'alert', 8);
  }

  private addForce(rec: ArrestRecord, r: ForceRecord): void {
    if (rec.force.indexOf(r.means) < 0) rec.force.push(r.means);
    if (r.verdict.kind !== 'licite' && r.verdict.severity >= rec.worstSeverity) {
      rec.worstVerdict = r.verdict.kind;
      rec.worstSeverity = r.verdict.severity;
    }
  }

  /** Un emploi de la force vient d'être déclaré contre une personne retenue. */
  noteForce(targetId: EntityId, r: ForceRecord): void {
    const h = this.holdOf.get(targetId);
    if (h) this.addForce(h.rec, r);
  }

  // ───────────────────────────── menottage, palpation ─────────────────────────────

  cuff(actor: Person, target: Person): boolean {
    const k = this.k;
    const h = this.holdOf.get(target.id);
    if (!h || target.custody !== 'held') return false;
    if (this.cuffsAreItems()) {
      if (k.ctx.actions.remove(actor, 'menottes', 1) < 1) return false;
      h.cuffItem = true;
    }
    const rec = h.rec;
    // entravée, la personne n'a plus à être maintenue : l'agent a de nouveau les mains libres
    this.unlink(target);
    h.holderId = 0;
    target.custody = 'cuffed';
    target.upper = 'cuffed';
    target.upperT = 0;
    rec.cuffed = true;
    rec.cuffJustified = this.cuffsJustified(rec, target);
    k.ways.touched(actor, target);
    if (actor.upper === 'restrain') actor.upper = 'none';
    k.ctx.events.emit('sfx', { id: 'menottes', x: target.x, y: target.y + 0.8, z: target.z });
    if (!rec.cuffJustified) k.notify(actor, 'Menottage non justifié : la personne n\'est ni dangereuse ni susceptible de fuir (art. 803 du code de procédure pénale).', 'warn', 6);
    return true;
  }

  /**
   * Art. 803 du code de procédure pénale : menottes seulement si la personne est dangereuse pour
   * autrui ou pour elle-même, ou susceptible de prendre la fuite. Retenu ici : violences commises,
   * résistance ou tentative de fuite, arme découverte, fait grave établi.
   */
  private cuffsJustified(rec: ArrestRecord, target: Person): boolean {
    if (rec.resisted || this.k.eyes.everViolent(target)) return true;
    if (rec.founded && rec.severity >= 3) return true;
    const evidence = this.k.offenses.evidenced(target, 3);
    return evidence !== null;
  }

  /** Palpation de sécurité : retire et consigne les objets dangereux ; port d'arme le cas échéant. */
  search(actor: Person, target: Person): void {
    const k = this.k;
    const ctx = k.ctx;
    const h = this.holdOf.get(target.id);
    if (!h) return;
    const rec = h.rec;
    rec.searched = true;
    const ids = this.seizeIds;
    ids.length = 0;
    const inv = target.inventory;
    for (let i = 0; i < inv.length; i++) {
      const id = inv[i]!.id;
      if ((WEAPON_ITEMS[id] !== undefined || SEIZED_ITEMS[id] !== undefined) && ids.indexOf(id) < 0) ids.push(id);
    }
    let weapon = false;
    let loot = false;
    let found = '';
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const count = ctx.actions.remove(target, id);
      if (count <= 0) continue;
      rec.seized.push({ id, count });
      const label = WEAPON_ITEMS[id] ?? SEIZED_ITEMS[id]!;
      found += (found === '' ? '' : ', ') + count + ' × ' + label;
      if (WEAPON_ITEMS[id] !== undefined) weapon = true;
      else if (id === 'butin') loot = true;
    }
    if (weapon) k.offenses.record(target, 'port_arme', target.x, target.z, undefined, true);
    if (loot) k.offenses.record(target, 'recel', target.x, target.z, undefined, true);
    if (found !== '') rec.notes.push('saisi à la palpation : ' + found);
    ctx.events.emitAny('law:search', { id: target.id, byId: actor.id, seized: rec.seized });
    // la ligne d'aide (« Interpellé. E : le confier à … ») s'affiche sous l'invite dès maintenant
    k.ways.searched(actor, target);
    if (found === '') k.notify(actor, 'Palpation de sécurité : aucun objet dangereux.', 'info', 4);
    else k.notify(actor, 'Palpation de sécurité : ' + found + (weapon ? ". Port d'arme constaté." : '.'), weapon ? 'ok' : 'info', 6);
  }

  // ───────────────────────────── escorte ─────────────────────────────

  /** Personne actuellement escortée par cet agent (null sinon). */
  escortedBy(actor: Person): Person | null {
    if (actor.carrying === 0) return null;
    const p = this.k.ctx.people.get(actor.carrying);
    return p && p.custody === 'escorted' && p.heldBy === actor.id ? p : null;
  }

  escort(actor: Person, target: Person): boolean {
    const h = this.holdOf.get(target.id);
    if (!h || (target.custody !== 'cuffed' && target.custody !== 'held')) return false;
    if (actor.carrying !== 0 && actor.carrying !== target.id) return false;
    // un collègue tenait la personne : il la lâche
    if (target.heldBy !== 0 && target.heldBy !== actor.id) {
      const prev = this.k.ctx.people.get(target.heldBy);
      if (prev && prev.carrying === target.id) {
        prev.carrying = 0;
        if (prev.upper === 'restrain') prev.upper = 'none';
      }
    }
    target.custody = 'escorted';
    target.heldBy = actor.id;
    actor.carrying = target.id;
    // l'agent relève la personne si son état le permet (sinon elle est traînée)
    if (target.posture === 'down') this.k.ctx.health.setDown(target, false, actor.id);
    if (target.posture !== 'down') target.posture = 'stand';
    target.upper = h.rec.cuffed ? 'cuffed' : 'none';
    if (actor.upper === 'restrain') actor.upper = 'none';
    h.escortId = actor.id;
    h.holderId = actor.id;
    h.nextEscapeCheck = this.k.ctx.clock.now + 1;
    this.k.ways.touched(actor, target);
    return true;
  }

  /** Fait asseoir la personne escortée : elle reste entravée sur place, l'agent a les mains libres. */
  seat(actor: Person, target: Person): boolean {
    const h = this.holdOf.get(target.id);
    if (!h || target.custody !== 'escorted' || target.heldBy !== actor.id) return false;
    target.custody = h.rec.cuffed ? 'cuffed' : 'held';
    if (target.posture !== 'down') target.posture = h.rec.cuffed ? 'sit' : 'prone';
    target.vx = 0;
    target.vz = 0;
    h.escortId = 0;
    h.pinX = target.x;
    h.pinZ = target.z;
    this.k.ways.touched(actor, target);
    if (h.rec.cuffed) {
      target.heldBy = 0;
      actor.carrying = 0;
      h.holderId = 0;
    } else {
      h.holderId = actor.id;
      h.looseSince = -1;
    }
    return true;
  }

  // ───────────────────────────── remise, libération ─────────────────────────────

  /** Remise à l'officier de police judiciaire : clôt la procédure. */
  handOver(actor: Person, target: Person, dest: HandoverDest): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const h = this.holdOf.get(target.id);
    if (!h || target.custody !== 'escorted') return false;
    if (actor.carrying === target.id) actor.carrying = 0;
    target.heldBy = 0;
    target.vx = 0;
    target.vz = 0;
    let to: 'vehicule' | 'point' = 'point';
    let where = dest.label;
    let vehicleId = 0;
    if (dest.kind === 'vehicle' && dest.vehicle) {
      if (ctx.vehicles.enter(target, dest.vehicle, dest.seat)) {
        to = 'vehicule';
        target.custody = 'in_vehicle';
        vehicleId = dest.vehicle.id;
        where = k.handover.radioName(dest.vehicle);
      } else {
        // la portière ne s'ouvre pas (place prise entre-temps) : assis, entravé, à côté du véhicule
        target.custody = 'handed_over';
        target.posture = 'sit';
        where = 'à côté du ' + k.handover.radioName(dest.vehicle);
        this.parked.push(target);
      }
    } else {
      target.custody = 'handed_over';
      target.posture = 'sit';
      this.parked.push(target);
    }
    target.upper = h.rec.cuffed ? 'cuffed' : 'none';
    this.returnCuffs(h, actor);
    const rec = h.rec;
    this.close(h, to === 'vehicule' ? 'remis_vehicule' : 'remis', to);
    rec.vehicleId = vehicleId;
    rec.vehicleName = to === 'vehicule' && dest.vehicle ? dest.label : '';
    ctx.events.emit('person:handed_over', { id: target.id, byId: actor.id });

    // compte rendu radio (docs/research/01-doctrine-cadre-legal.md §5.5)
    const squad = actor.squadId !== 0 ? ctx.squads.get(actor.squadId) : undefined;
    const from = squad ? squad.name : actor.name;
    const hour = hourText(ctx.env.state.timeOfDay);
    // (« pour présentation à l'officier de police judiciaire » : au commissariat seulement, plan §5.4)
    ctx.radio.say({
      channel: 'commandement', from, priority: 1, personId: actor.id,
      text: handoverRadioText(from, rec.motif ? offenseLabel(rec.motif) : 'fait non précisé', hour, to, where),
    });
    k.notify(target, (to === 'vehicule' ? 'Vous êtes placé à bord du ' + where : 'Vous êtes remis aux policiers, ' + where) + ' : la garde à vue commence.', 'alert', 8);
    if (target.isPlayer && target.faction !== 'police') {
      this.playerHandedAt = ctx.clock.now;
      this.playerHandedId = target.id;
    }
    k.notify(actor, 'Interpellé remis. Procédure ' + rec.strength + (rec.strength === 'solide' ? ' : fait établi par des images.'
      : rec.strength === 'fragile' ? ' : fait constaté, sans image.' : ' : aucun fait établi, classement sans suite probable.'), rec.strength === 'nulle' ? 'warn' : 'ok', 6);
    return true;
  }

  /** Remise en liberté. */
  release(actor: Person, target: Person): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const h = this.holdOf.get(target.id);
    if (target.custody !== 'held' && target.custody !== 'cuffed' && target.custody !== 'escorted') return false;
    this.unlink(target);
    target.custody = 'free';
    if (target.posture === 'down') ctx.health.setDown(target, false, actor.id);
    if (target.posture !== 'down') target.posture = 'stand';
    target.upper = 'none';
    if (actor.upper === 'restrain') actor.upper = 'none';
    if (h) {
      this.returnCuffs(h, actor);
      this.close(h, 'relache', '');
    }
    ctx.events.emit('person:released', { id: target.id, byId: actor.id });
    k.notify(target, 'Vous êtes remis en liberté.', 'ok', 5);
    return true;
  }

  private returnCuffs(h: Hold, to: Person): void {
    if (!h.cuffItem) return;
    h.cuffItem = false;
    this.k.ctx.actions.give(to, 'menottes', 1);
  }

  /** Défait les liens tenir / être tenu autour d'une personne retenue. */
  unlink(target: Person): void {
    if (target.heldBy !== 0) {
      const holder = this.k.ctx.people.get(target.heldBy);
      if (holder && holder.carrying === target.id) {
        holder.carrying = 0;
        if (holder.upper === 'restrain') holder.upper = 'none';
      }
      target.heldBy = 0;
    }
  }

  /** Une personne non entravée, laissée sans surveillance ou mal tenue, s'échappe. */
  escape(h: Hold, why: string): void {
    const k = this.k;
    const target = h.target;
    const byId = h.escortId !== 0 ? h.escortId : h.holderId !== 0 ? h.holderId : h.rec.byId;
    const by = k.ctx.people.get(byId);
    this.unlink(target);
    target.custody = 'free';
    if (target.posture !== 'down') target.posture = 'stand';
    target.upper = 'none';
    if (target.fear < 0.8) target.fear = 0.8;
    if (by) {
      const dx = target.x - by.x;
      const dz = target.z - by.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      target.cmd.moveX = dx / d;
      target.cmd.moveZ = dz / d;
      target.cmd.gait = 2;
      this.returnCuffs(h, by);
    }
    h.rec.resisted = true;
    h.rec.notes.push(why);
    this.close(h, 'evade', '');
    k.ctx.events.emitAny('law:escape', { id: target.id, byId });
    k.notify(by, target.name + " s'échappe : " + why + '.', 'warn', 5);
  }

  /** Clôt le dossier : solidité de la procédure et régularité d'ensemble. */
  close(h: Hold, status: ArrestStatus, to: string): void {
    const k = this.k;
    const rec = h.rec;
    rec.status = status;
    rec.closedAt = k.ctx.clock.now;
    rec.to = to;
    const target = h.target;
    // éléments apparus pendant la procédure (port d'arme à la palpation, rébellion)
    const evidence = k.offenses.evidenced(target, 2);
    if (rec.founded) {
      if (evidence && evidence.filmed) rec.filmed = true;
      rec.strength = rec.filmed ? 'solide' : 'fragile';
      if (rec.worstVerdict !== 'licite' && rec.worstSeverity >= 4) {
        rec.strength = 'fragile';
        rec.notes.push("violences illégitimes au cours de l'interpellation");
      }
    } else if (evidence) {
      rec.strength = 'fragile';
      rec.notes.push("des éléments à charge sont apparus après coup (" + offenseLabel(evidence.type) + ") : l'interpellation initiale reste sans motif");
    } else {
      rec.strength = 'nulle';
    }
    if (rec.cuffed) {
      rec.cuffJustified = this.cuffsJustified(rec, target);
      if (!rec.cuffJustified) rec.notes.push('menottage non justifié (personne ni dangereuse ni susceptible de fuir)');
    }
    rec.regular = rec.founded && rec.worstVerdict === 'licite' && (!rec.cuffed || rec.cuffJustified) && status !== 'evade';
    k.records.open.delete(rec.targetId);
    this.holdOf.delete(rec.targetId);
    k.ways.forget(rec.targetId);
    const i = this.holds.indexOf(h);
    if (i >= 0) {
      this.holds[i] = this.holds[this.holds.length - 1]!;
      this.holds.pop();
    }
  }

  /** Une personne a quitté le jeu : son dossier est clos en l'état, ses liens sont défaits. */
  onRemoved(id: EntityId): void {
    const h = this.holdOf.get(id);
    if (!h) return;
    const holder = this.k.ctx.people.get(h.target.heldBy);
    if (holder && holder.carrying === id) holder.carrying = 0;
    this.close(h, 'interrompu', '');
  }
}
