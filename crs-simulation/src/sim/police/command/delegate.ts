/* =====================================================================================
 * COMMANDEMENT — délégation des incidents (BRIEF §1 « incidents à traiter »).
 *
 * Les incidents viennent du service EXT.incidents quand il existe (cadre de mission) ; sinon le
 * commandement les relève lui-même dans les événements de la simulation (feu, barricade, pillage,
 * blessé à terre), dès qu'un agent ou le drone les voit. Pour chacun, le commandant choisit le moyen
 * réaliste (bible, « réalisme des moyens ») et l'unité la mieux placée :
 *   feu de poubelle      porte-extincteur d'une unité proche ; sinon engin lanceur d'eau ; sinon pompiers
 *   barricade en feu     engin lanceur d'eau ; sinon pompiers ; sinon unité
 *   véhicule, boutique   pompiers (appelés par EXT.rescue) ; sinon engin lanceur d'eau
 *   blessé               SAMU s'il est grave et joignable, et groupe d'extraction ; sinon unité
 *   pillage, suspect     BRAV-M ; sinon unité proche
 *   barricade            Centaure (lame) ; sinon unité (à la main)
 * L'unité exécute par un ordre ordinaire (eteindre, secourir, interpeller, degager_barricade) et rend
 * compte ; un échec fait passer au moyen suivant. C'est le canon à eau qui éteint, pas le Centaure.
 * ===================================================================================== */

import type { EntityId, EntityKind, OrderType } from '@/core/contracts';
import type { Incident, IncidentKind, IncidentMeans } from '@/core/extensions';
import type { PoliceOrderDone } from '../api';
import type { Command, Element } from './command';
import type { CommandCore } from './core';
import type { Picture } from './picture';
import * as TX from './texts';

export interface Affair {
  id: number;
  /** Incident du service EXT.incidents (0 : relevé par le commandement lui-même). */
  extId: number;
  kind: IncidentKind;
  x: number;
  z: number;
  targetKind: EntityKind;
  targetId: EntityId;
  urgency: 1 | 2 | 3;
  createdAt: number;
  /** Vu par une unité, le drone ou la salle. */
  seen: boolean;
  seenAt: number;
  state: 'ouvert' | 'confie' | 'traite' | 'echec';
  means: IncidentMeans;
  squadId: number;
  order: OrderType | '';
  assignedAt: number;
  tries: number;
  /** Moyens déjà essayés sans succès (pour passer au suivant). */
  failed: IncidentMeans[];
}

const MAX_AFFAIRS = 32;
/** Durée au-delà de laquelle une affaire confiée sans compte rendu est reprise (s). */
const STALE = 200;

const LABELS: Readonly<Record<IncidentKind, string>> = {
  feu_poubelle: 'feu de poubelles', feu_barricade: 'barricade en feu', feu_vehicule: 'véhicule en feu', feu_boutique: 'commerce en feu',
  blesse: 'blessé à terre', agent_a_terre: 'agent à terre', agent_isole: 'agent isolé', pillage: 'pillage en cours',
  barricade: 'barricade en travers', automobiliste_bloque: 'automobiliste bloqué', secours_bloques: 'secours bloqués', suspect: 'auteur identifié',
};

function isFire(kind: IncidentKind): boolean {
  return kind === 'feu_poubelle' || kind === 'feu_barricade' || kind === 'feu_vehicule' || kind === 'feu_boutique';
}

export class Delegation {
  readonly affairs: Affair[] = [];
  private nextId = 1;

  constructor(private readonly core: CommandCore, private readonly pic: Picture) {}

  reset(): void {
    this.affairs.length = 0;
    this.nextId = 1;
  }

  // ───────────────────────────── relevé ─────────────────────────────

  private add(extId: number, kind: IncidentKind, x: number, z: number, targetKind: EntityKind, targetId: EntityId, urgency: 1 | 2 | 3, seen: boolean): Affair | null {
    const list = this.affairs;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (extId !== 0) {
        if (a.extId === extId) return a;
        continue;
      }
      if (a.extId !== 0 || a.kind !== kind || a.state === 'traite') continue;
      const sameTarget = a.targetId !== 0 && a.targetId === targetId;
      if (sameTarget || (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z) < 64) return a;
    }
    if (list.length >= MAX_AFFAIRS) {
      // les affaires closes cèdent leur place
      let drop = -1;
      for (let i = 0; i < list.length && drop < 0; i++) if (list[i].state === 'traite' || list[i].state === 'echec') drop = i;
      if (drop < 0) return null;
      list.splice(drop, 1);
    }
    const now = this.core.now;
    const a: Affair = {
      id: this.nextId++, extId, kind, x, z, targetKind, targetId, urgency, createdAt: now, seen, seenAt: seen ? now : -1, state: 'ouvert',
      means: '', squadId: 0, order: '', assignedAt: 0, tries: 0, failed: [],
    };
    list.push(a);
    return a;
  }

  /** Fait relevé dans les événements (sans service d'incidents) : connu quand quelqu'un le voit. */
  detect(kind: IncidentKind, x: number, z: number, targetKind: EntityKind, targetId: EntityId, urgency: 1 | 2 | 3): void {
    if (this.core.incidents) return;
    this.add(0, kind, x, z, targetKind, targetId, urgency, this.pic.seenNow(x, z));
  }

  /** Reprend les incidents ouverts du service (annoncés par la salle : connus d'emblée). */
  private sync(): void {
    const api = this.core.incidents;
    if (!api) return;
    const list = api.list;
    for (let i = 0; i < list.length; i++) {
      const inc = list[i];
      if (inc.state !== 'ouvert' || inc.means === 'joueur') continue;
      const a = this.add(inc.id, inc.kind, inc.x, inc.z, inc.targetKind, inc.targetId, inc.urgency, true);
      if (a && (a.state === 'traite' || a.state === 'echec') && this.core.now - a.assignedAt > 30) {
        // l'incident est rouvert par le service : nouvelle tentative
        a.state = 'ouvert';
        a.failed.length = 0;
        a.tries = 0;
      }
    }
  }

  private incident(a: Affair): Incident | undefined {
    return a.extId !== 0 && this.core.incidents ? this.core.incidents.get(a.extId) : undefined;
  }

  // ───────────────────────────── état d'une affaire ─────────────────────────────

  private stillBurning(a: Affair): boolean {
    const ctx = this.core.ctx;
    if (ctx.hazards.fireAt(a.x, a.z) > 0.05) return true;
    if (a.targetId !== 0) {
      const prop = ctx.props.get(a.targetId);
      if (prop && prop.burning > 0.03) return true;
      const v = ctx.vehicles.get(a.targetId);
      if (v && (v.burning > 0.03 || v.state === 'burning')) return true;
      const shop = ctx.props.shop(a.targetId);
      if (shop && shop.burning > 0.03) return true;
    }
    return false;
  }

  /** L'affaire s'est-elle réglée d'elle-même (feu éteint, blessé relevé, barricade disparue) ? */
  private settled(a: Affair): boolean {
    const ctx = this.core.ctx;
    const inc = this.incident(a);
    if (a.extId !== 0) return !inc || inc.state === 'resolu' || inc.state === 'echoue';
    if (isFire(a.kind)) return !this.stillBurning(a) && this.core.now - a.createdAt > 3;
    if (a.kind === 'blesse' || a.kind === 'agent_a_terre') {
      const p = ctx.people.get(a.targetId);
      return !p || p.posture !== 'down' || p.heldBy !== 0 || p.vehicleId !== 0;
    }
    if (a.kind === 'barricade') {
      const prop = ctx.props.get(a.targetId);
      return !prop || !prop.blocksMove;
    }
    if (a.kind === 'pillage') return this.core.now - a.createdAt > 150;
    return false;
  }

  private close(a: Affair, ok: boolean, cmd: Command | null, byId: EntityId): void {
    const core = this.core;
    a.state = ok ? 'traite' : 'echec';
    const inc = this.incident(a);
    if (inc && core.incidents && inc.state !== 'resolu' && inc.state !== 'echoue' && ok) core.incidents.close(inc.id, true, byId);
    if (ok && cmd) cmd.state.resolved++;
  }

  // ───────────────────────────── choix du moyen ─────────────────────────────

  private tried(a: Affair, means: IncidentMeans): boolean {
    return a.failed.indexOf(means) >= 0;
  }

  /** Enregistre l'affectation auprès du service ; false s'il la refuse. */
  private book(a: Affair, means: IncidentMeans, squadId: number): boolean {
    const api = this.core.incidents;
    if (a.extId !== 0 && api && !api.assign(a.extId, means, squadId)) {
      a.failed.push(means);
      return false;
    }
    a.means = means;
    a.squadId = squadId;
    a.state = 'confie';
    a.assignedAt = this.core.now;
    return true;
  }

  /** Confie l'affaire à un élément de la compagnie par un ordre de tâche (après un déplacement s'il est loin). */
  private toElement(cmd: Command, a: Affair, el: Element, type: OrderType): void {
    const core = this.core;
    if (!this.book(a, 'unite', el.squadId)) return;
    a.order = type;
    cmd.state.delegated++;
    const sector = core.sector(a.x, a.z);
    const order = { type, x: a.x, z: a.z, targetId: a.targetKind === 'place' ? 0 : a.targetId };
    const far = core.centerOf(el.squadId) ? Math.hypot(core.v2.x - a.x, core.v2.z - a.z) : 0;
    if (far > 75 && el.role !== 'poste') {
      // l'unité se porte d'abord à proximité, en colonne ; la tâche lui est donnée à l'arrivée
      const k = (far - 22) / far;
      const px = core.v2.x + (a.x - core.v2.x) * k;
      const pz = core.v2.z + (a.z - core.v2.z) * k;
      el.pending = order;
      el.affairId = a.id;
      if (a.urgency >= 2) cmd.hurry(el, 200);
      cmd.order(el, 'incident', { type: 'colonne', x: px, z: pz, width: 0 }, TX.orderForce(el.name, cmd.squad.name, type, sector, 0, 0));
      return;
    }
    cmd.task(el, 'incident', order, TX.orderForce(el.name, cmd.squad.name, type, sector, 0, 0), a.id);
  }

  /** Confie l'affaire à une unité spéciale. */
  private toSpecial(cmd: Command, a: Affair, means: 'canon_eau' | 'centaure' | 'bravm', type: OrderType): boolean {
    const core = this.core;
    const sp = cmd.specials.firstOf(means, cmd.attached);
    if (!sp || sp.status.stage !== 'repos' || this.tried(a, means)) return false;
    if (means === 'canon_eau' && sp.status.supply >= 0 && sp.status.supply < 50) return false;
    if (!this.book(a, means, sp.squad.id)) return false;
    a.order = type;
    cmd.state.delegated++;
    const sector = core.sector(a.x, a.z);
    const text = TX.orderForce(sp.squad.name, cmd.squad.name, type, sector, 0, 0);
    cmd.say(text);
    core.issue(sp.squad.id, { type, x: a.x, z: a.z, targetId: a.targetKind === 'place' ? 0 : a.targetId, maxForce: type === 'interpeller' ? 2 : 1, issuedBy: cmd.issuer() });
    core.decide(cmd.squad.id, 'incident', text, sp.squad.id, type, a.x, a.z);
    return true;
  }

  /** Appelle les secours officiels. */
  private toRescue(cmd: Command, a: Affair, means: 'pompiers' | 'samu'): boolean {
    const core = this.core;
    const rescue = core.rescue;
    if (!rescue || this.tried(a, means)) return false;
    if (!this.book(a, means, 0)) return false;
    a.order = '';
    cmd.state.delegated++;
    const c = cmd.commander();
    rescue.request(means, a.x, a.z, c ? c.id : 0, a.extId !== 0 ? a.extId : undefined);
    const sector = core.sector(a.x, a.z);
    const text = TX.frame(TX.CENTRAL, cmd.squad.name, 'Demande ' + (means === 'pompiers' ? 'les pompiers' : 'le SAMU') + (sector !== '' ? ', ' + sector : '') + ' : ' + LABELS[a.kind] + '. Itinéraire dégagé et protection assurés', true);
    cmd.say(text, a.urgency >= 3 ? 2 : 1);
    core.decide(cmd.squad.id, 'incident', text, 0, '', a.x, a.z);
    // une unité disponible couvre le point d'intervention des secours
    const el = cmd.available(a.x, a.z);
    if (el && el.role === 'reserve' && cmd.ready('couvre:' + a.id, 300)) {
      cmd.order(el, 'incident', { type: 'proteger', x: a.x, z: a.z, heading: cmd.pcH, width: 12 }, TX.orderForce(el.name, cmd.squad.name, 'proteger', sector, 0, 0));
    }
    return true;
  }

  private unit(cmd: Command, a: Affair, type: OrderType, needExtinguisher: boolean): boolean {
    if (this.tried(a, 'unite')) return false;
    let el = cmd.nearest(a.x, a.z, 75, needExtinguisher);
    if (!el) el = cmd.available(a.x, a.z);
    if (!el) return false;
    if (needExtinguisher) {
      const st = this.core.status ? this.core.status.of(el.squadId) : null;
      if (st && st.ammo.extincteur <= 0) return false;
    }
    this.toElement(cmd, a, el, type);
    return a.state === 'confie';
  }

  /** Choisit et engage le moyen ; false si rien n'est disponible pour l'instant. */
  private engage(cmd: Command, a: Affair): boolean {
    switch (a.kind) {
      case 'feu_poubelle':
        return this.unit(cmd, a, 'eteindre', true) || this.toSpecial(cmd, a, 'canon_eau', 'eteindre') || this.toRescue(cmd, a, 'pompiers');
      case 'feu_barricade':
        return this.toSpecial(cmd, a, 'canon_eau', 'eteindre') || this.toRescue(cmd, a, 'pompiers') || this.unit(cmd, a, 'eteindre', true);
      case 'feu_vehicule':
      case 'feu_boutique':
        return this.toRescue(cmd, a, 'pompiers') || this.toSpecial(cmd, a, 'canon_eau', 'eteindre');
      case 'blesse':
        if (a.urgency >= 3 && this.toRescue(cmd, a, 'samu')) return true;
        return this.unit(cmd, a, 'secourir', false) || this.toRescue(cmd, a, 'samu');
      case 'agent_a_terre':
        return this.unit(cmd, a, 'secourir', false);
      case 'pillage':
      case 'suspect':
        return this.toSpecial(cmd, a, 'bravm', 'interpeller') || this.unit(cmd, a, 'interpeller', false);
      case 'barricade':
        return this.toSpecial(cmd, a, 'centaure', 'degager_barricade') || this.unit(cmd, a, 'degager_barricade', false);
      default:
        // agent isolé, automobiliste ou secours bloqués : une unité se porte sur place et couvre
        return this.unit(cmd, a, 'proteger', false);
    }
  }

  /** Proposition de l'adjoint : moyen conseillé, en clair. */
  private advice(cmd: Command, a: Affair): string {
    const sector = this.core.sector(a.x, a.z);
    let means = 'd’y envoyer l’unité la plus proche';
    if (isFire(a.kind)) {
      const canon = cmd.specials.firstOf('canon_eau', cmd.attached);
      if (a.kind === 'feu_poubelle') means = 'd’y envoyer un porte-extincteur';
      else if (canon && a.kind === 'feu_barricade') means = 'd’engager ' + canon.squad.name;
      else means = this.core.rescue ? 'd’appeler les pompiers sous protection' : canon ? 'd’engager ' + canon.squad.name : 'd’y envoyer un porte-extincteur';
    } else if (a.kind === 'barricade') {
      const cent = cmd.specials.firstOf('centaure', cmd.attached);
      if (cent) means = 'de la faire dégager par ' + cent.squad.name;
    } else if (a.kind === 'pillage' || a.kind === 'suspect') {
      const b = cmd.specials.firstOf('bravm', cmd.attached);
      if (b) means = 'une interpellation par ' + b.squad.name;
    } else if (a.kind === 'blesse') {
      means = a.urgency >= 3 && this.core.rescue ? 'd’appeler le SAMU et de sécuriser' : 'd’envoyer un groupe le chercher';
    }
    return TX.propose(LABELS[a.kind] + (sector !== '' ? ', ' + sector : ''), means);
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  update(cmd: Command): void {
    const core = this.core;
    const now = core.now;
    this.sync();
    const list = this.affairs;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'traite' || a.state === 'echec') continue;
      if (!a.seen) {
        if (!this.pic.seenNow(a.x, a.z)) {
          // jamais vu et réglé de lui-même : l'affaire disparaît sans avoir existé pour le commandement
          if (now - a.createdAt > 20 && this.settled(a)) a.state = 'traite';
          continue;
        }
        a.seen = true;
        a.seenAt = now;
      }
      if (this.settled(a)) {
        const handled = a.state === 'confie';
        this.close(a, true, handled ? cmd : null, cmd.squad.leaderId);
        continue;
      }
      if (a.state === 'confie') {
        // sans compte rendu depuis trop longtemps : repris (les secours appelés gardent la main plus longtemps)
        const limit = a.means === 'pompiers' || a.means === 'samu' ? STALE * 3 : STALE;
        if (now - a.assignedAt > limit) this.fail(a, cmd);
        continue;
      }
      // délai de décision du commandant (plus court si c'est vital)
      const wait = cmd.latency * (a.urgency >= 3 ? 0.3 : a.urgency === 2 ? 0.7 : 1);
      if (now - a.seenAt < wait) continue;
      const key = 'incident:' + a.id;
      if (!cmd.ready(key, cmd.ia ? 8 : 60)) continue;
      cmd.act(key, a.urgency, a.x, a.z, this.advice(cmd, a), () => {
        if (a.state === 'ouvert') this.engage(cmd, a);
      });
    }
  }

  private fail(a: Affair, cmd: Command): void {
    const api = this.core.incidents;
    if (a.means !== '') a.failed.push(a.means);
    a.tries++;
    const el = a.squadId !== 0 ? cmd.element(a.squadId) : null;
    if (el && el.affairId === a.id) {
      el.pending = null;
      el.task = '';
    }
    if (a.extId !== 0 && api) api.unassign(a.extId);
    a.means = '';
    a.squadId = 0;
    a.order = '';
    a.state = a.tries >= 3 ? 'echec' : 'ouvert';
  }

  /** Compte rendu de fin d'ordre d'une unité : l'affaire qu'elle traitait est close, ou reprise autrement. */
  onOrderDone(e: PoliceOrderDone, cmd: Command): void {
    const list = this.affairs;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state !== 'confie' || a.squadId !== e.squadId || a.order !== e.type) continue;
      if (e.ok) {
        // un feu « éteint » qui brûle encore n'est pas traité
        if (isFire(a.kind) && this.stillBurning(a)) this.fail(a, cmd);
        else this.close(a, true, cmd, cmd.squad.leaderId);
      } else {
        this.fail(a, cmd);
      }
      return;
    }
  }
}
