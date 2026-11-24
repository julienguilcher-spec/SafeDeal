/* =====================================================================================
 * Droit — l'interpellé de l'agent et sa meilleure issue (service 'law.custody', plan ordres-directs §5.3).
 *
 * Après les trois gestes (interpeller, menotter, palper), le joueur ne doit jamais chercher quoi faire de
 * l'interpellé : la 4e invite de la touche Interagir est déjà la meilleure issue, la première qui s'applique de :
 *   1. un fourgon cellulaire ayant une place à 12 m ou moins       « Remettre Christian Lopez (CELLULAIRE 1) » ;
 *   2. un binôme libre de son dispositif à 60 m ou moins           « Confier Christian Lopez à MISTRAL 2 ALFA » ;
 *   3. un autre véhicule de police ayant une place (5 m), ou un point de regroupement
 *                                                                 « Remettre Christian Lopez (Fourgon de CRS) » ;
 *   4. un fourgon cellulaire à plus de 100 m qui peut venir         « Faire venir le fourgon cellulaire 1 » ;
 *   5. sinon l'emmener soi-même (« Emmener Christian Lopez » ; en l'escortant, « Faire asseoir » en dernier).
 * La ligne d'aide (« Interpellé. E : le confier à MISTRAL 2 ALFA (15 m) ») le dit sous l'invite dès la fin de la
 * palpation. Entrée (ordre prêt, règle a) fait la même chose par ce service : handover(), callVan().
 *
 * « Son » interpellé : celui qu'il escorte, celui qu'il maintient au sol, ou le menotté assis à côté de lui (4 m) dont il
 * est le dernier à s'être occupé — tant qu'aucun binôme ne s'en charge (« Confier » fait, ramassage).
 * ===================================================================================== */

import type { EntityId, Person } from '@/core/contracts';
import type { ArrestPair, ArrestTakeOver, ArrestFetch, ArrestVan } from '@/sim/police/arrest-service';
import { CUSTODY_TEXTS, DETAINEE_GUIDANCE, vanWords } from '@/ui/command/direct/words';
import type { CustodyDrop, CustodyVanCall, CustodyWay, LawCustody } from './api';
import type { Kernel } from './kernel';
import { guidanceEmmenerVers, guidanceRemettre, guidanceRemettreFourgon, guidanceSansVehicule } from './texts';

/** Service des interpellations des unités, vu par ce qu'on en utilise (absent : « Confier », « Faire venir » non proposés). */
interface ArrestsLike {
  pairFor?(byPlayer: EntityId): ArrestPair | null;
  takeOver?(targetId: EntityId, byPlayer: EntityId): ArrestTakeOver;
  fetchable?(byPlayer: EntityId, vanSquadId?: number): ArrestVan | null;
  fetch?(byPlayer: EntityId, targetId: EntityId, vanSquadId?: number): ArrestFetch;
  fetching?(targetId: EntityId): ArrestVan | null;
  handling?(targetId: EntityId): boolean;
}
interface LabelsLike {
  labelFor(button: string): string;
}

/** Portées de la meilleure issue (m) : binôme libre ; au-delà de tant, le fourgon est appelé plutôt qu'on y marche. */
export const PAIR_RANGE = 60;
export const VAN_WALK = 100;
/** Menotté assis à moins de tant de mètres de l'agent qui s'en est occupé le dernier : c'est encore le sien (m). */
const OWN_REACH = 4;
/** La ligne d'aide reste affichée tant de secondes après la palpation (s). */
const GUIDANCE_TIME = 12;
/** « Faire venir » refusé (aucun itinéraire) : l'issue n'est plus proposée pour cet interpellé pendant tant de secondes. */
const CALL_REFUSED_FOR = 30;

/** Remplace la touche « E » des phrases d'aide par celle du joueur (autre affectation, tactile). */
function withKey(text: string, key: string): string {
  return key === '' || key === 'E' ? text : text.replace('E :', key + ' :');
}

export class DetaineeWays implements LawCustody {
  /** Dernier agent qui s'est occupé de chaque interpellé (geste du droit), et quand. */
  private readonly lastBy = new Map<EntityId, EntityId>();
  /** Fin de la palpation, par agent : instant et interpellé (ligne d'aide). */
  private readonly searchedAt = new Map<EntityId, { at: number; targetId: EntityId }>();
  /** « Faire venir » refusé (ou fourgon bloqué en route) pour cet interpellé : instant. */
  private readonly callRefused = new Map<EntityId, number>();
  /** « Faire venir » en cours, par interpellé : le fourgon appelé. */
  private readonly calls = new Map<EntityId, EntityId>();
  private readonly way: CustodyWay = {
    kind: 'emmener', detaineeId: 0, detaineeName: '', label: '', guidance: '', name: '', vehicleId: 0, squadId: 0, x: 0, z: 0, distance: 0,
  };

  constructor(private readonly k: Kernel) {}

  reset(): void {
    this.lastBy.clear();
    this.searchedAt.clear();
    this.callRefused.clear();
    this.calls.clear();
  }

  private arrests(): ArrestsLike | undefined {
    return this.k.ctx.service<ArrestsLike>('police.arrests');
  }

  private key(): string {
    const labels = this.k.ctx.service<LabelsLike>('input.labels');
    const l = labels && typeof labels.labelFor === 'function' ? labels.labelFor('interact') : '';
    return l !== '' ? l : 'E';
  }

  // ───────────────────────────── suivi des gestes ─────────────────────────────

  /** Un geste du droit (interpeller, menotter, palper, escorter, faire asseoir) de `actor` sur `target`. */
  touched(actor: Person, target: Person): void {
    this.lastBy.set(target.id, actor.id);
  }

  /** Fin de la palpation : la ligne d'aide s'affiche. */
  searched(actor: Person, target: Person): void {
    this.touched(actor, target);
    this.searchedAt.set(actor.id, { at: this.k.ctx.clock.now, targetId: target.id });
  }

  /** Dossier clos ou personne retirée : on oublie. */
  forget(targetId: EntityId): void {
    this.lastBy.delete(targetId);
    this.callRefused.delete(targetId);
    this.calls.delete(targetId);
  }

  // ───────────────────────────── l'interpellé de l'agent ─────────────────────────────

  detaineeOf(actorId: EntityId): Person | null {
    const ctx = this.k.ctx;
    const actor = ctx.people.get(actorId);
    if (!actor) return null;
    return this.detaineeFor(actor);
  }

  detaineeFor(actor: Person): Person | null {
    const ctx = this.k.ctx;
    const custody = this.k.custody;
    const arrests = this.arrests();
    // (un binôme vient le prendre : « Confier » est fait, il n'y a plus rien à proposer)
    const handled = (p: Person): boolean => !!arrests && typeof arrests.handling === 'function' && arrests.handling(p.id);
    const escorted = custody.escortedBy(actor);
    if (escorted) return handled(escorted) ? null : escorted;
    if (actor.carrying !== 0) {
      const p = ctx.people.get(actor.carrying);
      if (p && p.heldBy === actor.id && (p.custody === 'held' || p.custody === 'cuffed') && custody.holdFor(p.id)) return handled(p) ? null : p;
    }
    // le menotté assis à côté de lui, dont il s'est occupé le dernier, que personne d'autre ne prend en charge
    const holds = custody.holds;
    let best: Person | null = null;
    let bestD = OWN_REACH;
    for (let i = 0; i < holds.length; i++) {
      const p = holds[i]!.target;
      if (p.custody !== 'cuffed' || p.heldBy !== 0 || this.lastBy.get(p.id) !== actor.id) continue;
      const d = Math.hypot(p.x - actor.x, p.z - actor.z);
      if (d > bestD || handled(p)) continue;
      bestD = d;
      best = p;
    }
    return best;
  }

  // ───────────────────────────── meilleure issue ─────────────────────────────

  bestWay(actorId: EntityId): CustodyWay | null {
    const actor = this.k.ctx.people.get(actorId);
    return actor ? this.bestFor(actor) : null;
  }

  /** Meilleure issue (objet réutilisé), ou null si l'agent ne tient aucun interpellé ou ne peut pas agir. */
  bestFor(actor: Person): CustodyWay | null {
    const k = this.k;
    if (!k.custody.canAct(actor)) return null;
    const d = this.detaineeFor(actor);
    if (!d) return null;
    const way = this.way;
    const key = this.key();
    way.detaineeId = d.id;
    way.detaineeName = d.name;
    way.vehicleId = 0;
    way.squadId = 0;
    way.name = '';
    way.x = d.x;
    way.z = d.z;
    way.distance = 0;

    // 1. fourgon cellulaire à 12 m
    const van = k.handover.find(actor, true);
    if (van && van.vehicle) {
      way.kind = 'remettre_fourgon';
      this.toVehicle(way, van.vehicle.id, van.label, van.x, van.z, van.distance);
      way.label = 'Remettre ' + d.name + ' (' + van.label + ')';
      way.guidance = withKey(guidanceRemettreFourgon(van.label, van.distance), key);
      return way;
    }
    // 2. binôme libre à 60 m (le joueur seulement : une IA ne « confie » pas)
    const arrests = actor.isPlayer ? this.arrests() : undefined;
    if (arrests && typeof arrests.takeOver === 'function' && typeof arrests.pairFor === 'function') {
      const pair = arrests.pairFor(actor.id);
      if (pair && pair.distance <= PAIR_RANGE) {
        way.kind = 'confier';
        way.name = pair.name;
        way.squadId = pair.squadId;
        way.distance = pair.distance;
        way.label = 'Confier ' + d.name + ' à ' + pair.name;
        way.guidance = withKey(DETAINEE_GUIDANCE.confier(pair.name, pair.distance), key);
        return way;
      }
    }
    // 3. autre véhicule de police à 5 m, ou point de regroupement
    const other = k.handover.find(actor);
    if (other) {
      way.kind = 'remettre';
      this.toVehicle(way, other.vehicle ? other.vehicle.id : 0, other.label, other.x, other.z, other.distance);
      way.label = 'Remettre ' + d.name + ' (' + other.label + ')';
      way.guidance = withKey(guidanceRemettre(other.label, other.distance), key);
      return way;
    }
    // 4. fourgon cellulaire à plus de 100 m qui peut venir
    const going = arrests && typeof arrests.fetching === 'function' ? arrests.fetching(d.id) : null;
    if (!going && this.calls.has(d.id)) {
      // le fourgon appelé ne vient plus (bloqué en route, appelé ailleurs) : il l'emmène lui-même
      this.calls.delete(d.id);
      this.callRefused.set(d.id, k.ctx.clock.now);
    }
    const refused = this.callRefused.get(d.id);
    if (!going && arrests && typeof arrests.fetch === 'function' && typeof arrests.fetchable === 'function'
      && (refused === undefined || k.ctx.clock.now - refused > CALL_REFUSED_FOR)) {
      const comes = arrests.fetchable(actor.id);
      const drop = k.handover.nearestDrop(actor.x, actor.z);
      // (un fourgon à 100 m ou moins : on y va à pied)
      const walkable = drop !== null && drop.cellular && drop.freeSeats > 0 && drop.distance <= VAN_WALK;
      if (comes && comes.distance > VAN_WALK && !walkable) {
        way.kind = 'faire_venir';
        const v = k.ctx.vehicles.get(comes.vehicleId);
        this.toVehicle(way, comes.vehicleId, comes.name, v ? v.x : d.x, v ? v.z : d.z, comes.distance);
        way.squadId = comes.squadId;
        way.label = 'Faire venir le ' + vanWords(comes.name);
        way.guidance = withKey(DETAINEE_GUIDANCE.faireVenir(comes.name, comes.distance), key);
        return way;
      }
    }
    // 5. l'emmener soi-même, vers le lieu de dépôt le plus proche (le fourgon appelé s'il vient)
    way.kind = 'emmener';
    const cuffed = d.upper === 'cuffed' || (k.custody.holdFor(d.id)?.cuffed ?? false);
    way.label = d.custody === 'escorted' ? 'Faire asseoir ' + d.name : 'Emmener ' + d.name + (cuffed ? '' : ' (sans menottes)');
    const drop: CustodyDrop | null = going ? this.dropOf(going.vehicleId, actor) : k.handover.nearestDrop(actor.x, actor.z);
    if (drop) {
      this.toVehicle(way, drop.vehicleId, drop.name, drop.x, drop.z, drop.distance);
      way.squadId = drop.squadId;
      way.guidance = withKey(drop.cellular ? DETAINEE_GUIDANCE.emmener(drop.name, drop.distance) : guidanceEmmenerVers(drop.name, drop.distance), key);
    } else {
      way.guidance = withKey(guidanceSansVehicule(), key);
    }
    return way;
  }

  private toVehicle(way: CustodyWay, vehicleId: EntityId, name: string, x: number, z: number, distance: number): void {
    way.vehicleId = vehicleId;
    way.name = name;
    way.x = x;
    way.z = z;
    way.distance = distance;
  }

  /** Lieu de dépôt d'un véhicule précis (le fourgon qui vient). */
  private dropOf(vehicleId: EntityId, actor: Person): CustodyDrop | null {
    const v = this.k.ctx.vehicles.get(vehicleId);
    if (!v) return this.k.handover.nearestDrop(actor.x, actor.z);
    const drop = this.k.handover.nearestDrop(v.x, v.z);
    if (drop && drop.vehicleId === vehicleId) drop.distance = Math.hypot(v.x - actor.x, v.z - actor.z);
    return drop;
  }

  guidance(actorId: EntityId): string {
    const s = this.searchedAt.get(actorId);
    if (!s || this.k.ctx.clock.now - s.at > GUIDANCE_TIME) return '';
    const actor = this.k.ctx.people.get(actorId);
    if (!actor) return '';
    const way = this.bestFor(actor);
    // (il s'occupe déjà d'un autre, ou l'a confié : plus rien à dire)
    if (!way || way.detaineeId !== s.targetId) return '';
    return way.guidance;
  }

  // ───────────────────────────── actions (Entrée) ─────────────────────────────

  handover(actorId: EntityId): boolean {
    const ctx = this.k.ctx;
    const actor = ctx.people.get(actorId);
    if (!actor) return false;
    const d = this.detaineeFor(actor);
    if (!d || !this.k.handover.find(actor)) return false;
    return ctx.interactions.startVerb(actor, 'remettre', d.id);
  }

  /** « Confier » : le binôme le plus proche prend l'interpellé ; message au joueur. */
  confide(actor: Person): ArrestTakeOver {
    const k = this.k;
    const d = this.detaineeFor(actor);
    const arrests = this.arrests();
    if (!d || !arrests || typeof arrests.takeOver !== 'function') return { ok: false, reason: 'Personne à confier.', squadName: '' };
    const r = arrests.takeOver(d.id, actor.id);
    if (r.ok) k.notify(actor, CUSTODY_TEXTS.confided(r.squadName), 'ok', 3);
    else k.notify(actor, r.reason, 'warn', 5);
    return r;
  }

  callVan(actorId: EntityId, vanSquadId = 0): CustodyVanCall {
    const k = this.k;
    const actor = k.ctx.people.get(actorId);
    const fail = (reason: string): CustodyVanCall => ({ ok: false, reason, vanName: '', vanSquadId: 0, eta: 0 });
    if (!actor) return fail('Personne à emmener.');
    const d = this.detaineeFor(actor);
    const arrests = this.arrests();
    if (!d) return fail('Personne à emmener.');
    if (!arrests || typeof arrests.fetch !== 'function') return fail('Aucun fourgon cellulaire ne peut venir : emmenez-le vous-même.');
    const r = arrests.fetch(actor.id, d.id, vanSquadId);
    if (!r.ok) {
      this.callRefused.set(d.id, k.ctx.clock.now);
      k.notify(actor, r.reason, 'warn', 5);
      return fail(r.reason);
    }
    this.calls.set(d.id, r.vehicleId);
    k.notify(actor, CUSTODY_TEXTS.vanComing(r.name, r.eta), 'info', 6);
    return { ok: true, reason: '', vanName: r.name, vanSquadId: r.squadId, eta: r.eta };
  }

  nearestDrop(actorId: EntityId): CustodyDrop | null {
    const actor = this.k.ctx.people.get(actorId);
    if (!actor) return null;
    const drop = this.k.handover.nearestDrop(actor.x, actor.z);
    // copie : l'objet du module est réutilisé d'un appel à l'autre
    return drop ? { ...drop } : null;
  }
}
