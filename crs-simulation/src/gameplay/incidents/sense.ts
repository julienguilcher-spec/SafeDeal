/* =====================================================================================
 * INCIDENTS — perception partagée : hostiles et collègues autour d'un point, isolement d'un agent.
 * Requêtes spatiales sans allocation (filtres créés une fois).
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import type { Kernel } from './kernel';

export class Sense {
  private self: Person | null = null;
  private readonly isFriend = (q: Person): boolean => q !== this.self && q.faction === 'police' && q.posture !== 'down' && q.health > 0;
  private readonly isHostile = (q: Person): boolean => q.faction === 'protest' && q.posture !== 'down' && q.custody === 'free'
    && (q.anger > 0.45 || q.profile === 'radical' || q.profile === 'opportuniste' || q.profile === 'pilleur');
  private readonly isPolice = (q: Person): boolean => q.faction === 'police' && q.posture !== 'down' && q.health > 0 && q.custody === 'free';

  constructor(private readonly k: Kernel) {}

  /** Manifestants hostiles (en colère, ou de profil violent) dans le rayon. */
  hostiles(x: number, z: number, r: number): number {
    return this.k.ctx.people.countIn(x, z, r, this.isHostile);
  }

  /** Agents valides dans le rayon. */
  police(x: number, z: number, r: number): number {
    return this.k.ctx.people.countIn(x, z, r, this.isPolice);
  }

  /**
   * Agent isolé : aucun collègue valide à portée, et des hostiles au contact. Retourne le nombre
   * d'hostiles, ou −1 si l'agent n'est pas isolé.
   */
  isolation(p: Person): number {
    const k = this.k;
    const t = k.tuning;
    if (p.posture === 'down' || p.vehicleId !== 0 || p.custody !== 'free' || p.dormant) return -1;
    this.self = p;
    const friends = k.ctx.people.countIn(p.x, p.z, t.isolatedFriendRange, this.isFriend);
    this.self = null;
    if (friends > 0) return -1;
    const hostiles = k.ctx.people.countIn(p.x, p.z, t.isolatedHostileRange, this.isHostile);
    return hostiles >= t.isolatedHostiles ? hostiles : -1;
  }

  /** Collègues valides autour d'un agent (lui non compris). */
  friends(p: Person, r: number): number {
    this.self = p;
    const n = this.k.ctx.people.countIn(p.x, p.z, r, this.isFriend);
    this.self = null;
    return n;
  }
}
