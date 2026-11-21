/* =====================================================================================
 * DÉCOR DYNAMIQUE — outils communs aux gestionnaires d'interaction : conditions générales,
 * choix de la cible (objet ou vitrine), remplissage de l'option, gestes du haut du corps.
 * ===================================================================================== */

import type { EntityId, InteractionOption, InteractVerb, ItemId, Person, UpperAnim } from '@/core/contracts';
import { distSqPointObb, distSqPointSegment } from '@/core/math';
import type { Mod } from './mod';
import type { PropObj, ShopObj } from './shared';

/** Portée d'un geste sur un objet (m, au-delà du rayon de la personne). */
export const REACH = 1.3;

export function option(verb: InteractVerb): InteractionOption {
  return { verb, targetKind: 'prop', targetId: 0, label: '', priority: 0, duration: 0, x: 0, z: 0 };
}

export interface HandlerKit {
  /** La personne peut-elle agir (à pied, libre, debout, valide) ? */
  able(a: Person): boolean;
  /** « Renverser la poubelle » : verbe + nom de l'objet (mis en cache). */
  label(verbWord: string, p: PropObj): string;
  inReach(a: Person, p: PropObj, reach: number): boolean;
  /** Meilleur objet à portée qui passe le test : celui désigné, sinon le plus proche devant soi. */
  pick(a: Person, reach: number, test: (p: PropObj, a: Person) => boolean, targetId: EntityId | undefined): PropObj | null;
  /** Vitrine à portée (distance à la façade, côté rue) qui passe le test. */
  pickShop(a: Person, reach: number, test: (s: ShopObj) => boolean, targetId: EntityId | undefined): ShopObj | null;
  fill(o: InteractionOption, p: PropObj, text: string, priority: number, duration: number): InteractionOption;
  fillShop(o: InteractionOption, s: ShopObj, text: string, priority: number, duration: number): InteractionOption;
  gesture(a: Person, anim: UpperAnim): void;
  endGesture(a: Person, anim: UpperAnim): void;
  /** Nombre d'exemplaires de l'objet que la personne peut encore porter. */
  room(a: Person, item: ItemId): number;
  /** Tableau de travail partagé (requêtes d'objets). */
  readonly buf: PropObj[];
  /** Oublie les libellés mis en cache. */
  reset(): void;
}

export function createKit(m: Mod): HandlerKit {
  const k = m.k;
  const store = m.store;
  const buf: PropObj[] = [];
  const shopBuf: ShopObj[] = [];
  const labels = new Map<string, string>();

  function inReach(a: Person, p: PropObj, reach: number): boolean {
    const r = a.radius + reach;
    return distSqPointObb(a.x, a.z, p.x, p.z, p.halfX, p.halfZ, p.heading) <= r * r;
  }

  return {
    buf,
    able(a: Person): boolean {
      return a.vehicleId === 0 && a.custody === 'free' && a.heldBy === 0 && a.posture !== 'down' && !k.ctx.health.isIncapacitated(a);
    },
    label(verbWord: string, p: PropObj): string {
      const key = verbWord + p.kind;
      let l = labels.get(key);
      if (l === undefined) {
        l = `${verbWord} ${p.def.label}`;
        labels.set(key, l);
      }
      return l;
    },
    inReach,
    pick(a, reach, test, targetId) {
      if (targetId !== undefined && targetId !== 0) {
        const p = store.get(targetId);
        return p && p.slot >= 0 && test(p, a) && inReach(a, p, reach) ? p : null;
      }
      const n = store.queryRadius(a.x, a.z, a.radius + reach, buf);
      const fx = Math.sin(a.aimYaw);
      const fz = Math.cos(a.aimYaw);
      let best: PropObj | null = null;
      let bestScore = Infinity;
      for (let i = 0; i < n; i++) {
        const p = buf[i]!;
        if (!test(p, a)) continue;
        const dx = p.x - a.x;
        const dz = p.z - a.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const facing = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
        if (facing < -0.3 && d > 0.6) continue; // dans le dos
        const score = d - facing * 0.6;
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }
      return best;
    },
    pickShop(a, reach, test, targetId) {
      if (targetId !== undefined && targetId !== 0) {
        const s = store.shop(targetId);
        if (!s || s.slot < 0 || !test(s)) return null;
        const tx = Math.cos(s.heading) * s.width * 0.5;
        const tz = -Math.sin(s.heading) * s.width * 0.5;
        return distSqPointSegment(a.x, a.z, s.x - tx, s.z - tz, s.x + tx, s.z + tz) <= reach * reach ? s : null;
      }
      const n = store.shopsNear(a.x, a.z, reach, shopBuf);
      let best: ShopObj | null = null;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const s = shopBuf[i]!;
        if (!test(s)) continue;
        const dx = a.x - s.x;
        const dz = a.z - s.z;
        if (dx * Math.sin(s.heading) + dz * Math.cos(s.heading) < -0.6) continue; // derrière la façade
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    },
    fill(o, p, text, priority, duration) {
      o.targetKind = 'prop';
      o.targetId = p.id;
      o.label = text;
      o.priority = priority;
      o.duration = duration;
      o.x = p.x;
      o.z = p.z;
      return o;
    },
    fillShop(o, s, text, priority, duration) {
      o.targetKind = 'shop';
      o.targetId = s.id;
      o.label = text;
      o.priority = priority;
      o.duration = duration;
      o.x = s.x;
      o.z = s.z;
      return o;
    },
    gesture(a, anim) {
      a.upper = anim;
      a.upperT = 0;
    },
    endGesture(a, anim) {
      if (a.upper === anim) {
        a.upper = 'none';
        a.upperT = 0;
      }
    },
    room(a, item) {
      const def = k.ctx.actions.def(item);
      const max = def ? def.maxCount : item === 'pave' ? 6 : item === 'bouteille' ? 4 : 1;
      return max - k.ctx.actions.has(a, item);
    },
    reset(): void {
      labels.clear();
    },
  };
}
