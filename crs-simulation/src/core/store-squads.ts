/* =====================================================================================
 * Magasin des unités (SquadApi) : groupes, sections, compagnies, cortèges…
 *
 *   - une unité qui a des membres a toujours un chef : le premier membre ajouté le devient
 *     tant que setLeader() n'a pas été appelé ; si le chef quitte l'unité, le membre le plus
 *     gradé (à défaut le plus ancien) lui succède ;
 *   - issue() complète l'ordre (point et cap du chef, force autorisée par la hiérarchie),
 *     l'horodate avec ctx.clock.now et émet order:issued. Aucune cascade vers les unités
 *     subordonnées : c'est le rôle du module de commandement ;
 *   - une personne retirée du jeu (person:removed) quitte automatiquement son unité.
 * ===================================================================================== */

import type {
  EntityId, Faction, GameContext, OrderType, PoliceRank, Squad, SquadApi, SquadKind, SquadOrder,
} from './contracts';

const RANK_ORDER: Record<PoliceRank, number> = {
  gardien_stagiaire: 0, gardien: 1, brigadier: 2, brigadier_chef: 3, major: 4,
  capitaine: 5, commandant: 6, commissaire: 7,
};

/** Rang hiérarchique d'un grade (plus grand = plus gradé ; −1 si aucun). */
export function rankLevel(rank: PoliceRank | null): number {
  return rank ? RANK_ORDER[rank] ?? -1 : -1;
}

class SquadStoreImpl implements SquadApi {
  readonly list: Squad[] = [];
  private readonly byId = new Map<number, Squad>();
  private nextId = 1;

  constructor(private readonly ctx: GameContext) {
    ctx.events.on('person:removed', (e) => this.removeMember(e.id));
  }

  get(id: number): Squad | undefined {
    return this.byId.get(id);
  }

  create(kind: SquadKind, faction: Faction, name: string, parentId = 0): Squad {
    const squad: Squad = {
      id: this.nextId++,
      kind,
      faction,
      name,
      leaderId: 0,
      members: [],
      parentId: this.byId.has(parentId) ? parentId : 0,
      vehicleId: 0,
      order: {
        type: 'libre', x: 0, z: 0, heading: 0, width: 0, targetId: 0,
        maxForce: this.ctx.law.roe.authorizedForce, issuedAt: this.ctx.clock.now, issuedBy: 0,
      },
      morale: 1,
      brain: null,
    };
    this.list.push(squad);
    this.byId.set(squad.id, squad);
    return squad;
  }

  remove(id: number): void {
    const squad = this.byId.get(id);
    if (!squad) return;
    for (let i = 0; i < squad.members.length; i++) {
      const p = this.ctx.people.get(squad.members[i]!);
      if (p && p.squadId === id) p.squadId = 0;
    }
    squad.members.length = 0;
    squad.leaderId = 0;
    // les unités subordonnées sont rattachées à l'échelon supérieur
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i]!;
      if (s.parentId === id) s.parentId = squad.parentId;
    }
    const idx = this.list.indexOf(squad);
    if (idx >= 0) this.list.splice(idx, 1);
    this.byId.delete(id);
  }

  addMember(squadId: number, personId: EntityId): void {
    const squad = this.byId.get(squadId);
    if (!squad || personId === 0) return;
    if (squad.members.indexOf(personId) >= 0) return;
    this.removeMember(personId);
    squad.members.push(personId);
    const p = this.ctx.people.get(personId);
    if (p) p.squadId = squadId;
    if (squad.leaderId === 0) squad.leaderId = personId;
  }

  removeMember(personId: EntityId): void {
    const p = this.ctx.people.get(personId);
    if (p && p.squadId === 0) return;
    let squad = p ? this.byId.get(p.squadId) : undefined;
    // recherche par la fin : un retrait en masse (people.clear) part du dernier membre
    let idx = squad ? squad.members.lastIndexOf(personId) : -1;
    if (idx < 0) {
      squad = undefined;
      for (let i = 0; i < this.list.length; i++) {
        const j = this.list[i]!.members.lastIndexOf(personId);
        if (j >= 0) {
          squad = this.list[i]!;
          idx = j;
          break;
        }
      }
    }
    if (!squad) {
      if (p) p.squadId = 0;
      return;
    }
    squad.members.splice(idx, 1);
    if (p && p.squadId === squad.id) p.squadId = 0;
    if (squad.leaderId === personId) squad.leaderId = this.successor(squad);
  }

  setLeader(squadId: number, personId: EntityId): void {
    const squad = this.byId.get(squadId);
    if (!squad) return;
    if (personId === 0) {
      squad.leaderId = this.successor(squad);
      return;
    }
    if (squad.members.indexOf(personId) < 0) this.addMember(squadId, personId);
    squad.leaderId = personId;
  }

  issue(squadId: number, order: Partial<SquadOrder> & { type: OrderType }): void {
    const squad = this.byId.get(squadId);
    if (!squad) return;
    const ctx = this.ctx;
    const prev = squad.order;
    const leader = squad.leaderId !== 0 ? ctx.people.get(squad.leaderId) : undefined;
    const full: SquadOrder = {
      type: order.type,
      x: order.x ?? (leader ? leader.x : prev.x),
      z: order.z ?? (leader ? leader.z : prev.z),
      heading: order.heading ?? (leader ? leader.heading : prev.heading),
      width: order.width ?? 0,
      targetId: order.targetId ?? 0,
      maxForce: order.maxForce ?? ctx.law.roe.authorizedForce,
      issuedAt: ctx.clock.now,
      issuedBy: order.issuedBy ?? 0,
    };
    if (order.place) full.place = order.place;
    if (order.byPlayer) full.byPlayer = true;
    squad.order = full;
    ctx.events.emit('order:issued', { squadId, order: full });
  }

  childrenOf(squadId: number): Squad[] {
    const out: Squad[] = [];
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i]!.parentId === squadId) out.push(this.list[i]!);
    }
    return out;
  }

  clear(): void {
    for (let i = 0; i < this.list.length; i++) {
      const squad = this.list[i]!;
      for (let j = 0; j < squad.members.length; j++) {
        const p = this.ctx.people.get(squad.members[j]!);
        if (p && p.squadId === squad.id) p.squadId = 0;
      }
    }
    this.list.length = 0;
    this.byId.clear();
    this.nextId = 1;
  }

  /** Nouveau chef après le départ du précédent : le plus gradé, à défaut le plus ancien dans l'unité. */
  private successor(squad: Squad): EntityId {
    let best: EntityId = 0;
    let bestLevel = -2;
    for (let i = 0; i < squad.members.length; i++) {
      const id = squad.members[i]!;
      const p = this.ctx.people.get(id);
      const level = p ? rankLevel(p.rank) : -1;
      if (level > bestLevel) {
        bestLevel = level;
        best = id;
      }
    }
    return best;
  }
}

export function createSquadStore(ctx: GameContext): SquadApi {
  return new SquadStoreImpl(ctx);
}
