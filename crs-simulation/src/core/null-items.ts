/* =====================================================================================
 * Services neutres liés aux objets : actions (inventaire), interactions, archétypes.
 * ===================================================================================== */

import type {
  ActionApi, AimSolution, ArchetypeApi, EntityId, GameContext, InteractionApi, InteractionHandler,
  InteractionOption, InteractVerb, ItemDef, ItemId, ItemStack, Person, PersonInit, PersonKind, PolicePoste,
  ProtestProfile, UseResult,
} from './contracts';
import { truncate } from './arrays';

// ───────────────────────────── actions ─────────────────────────────

const NO_DEFS: readonly ItemDef[] = Object.freeze([]);
const USE_NO_ITEM: UseResult = Object.freeze({ ok: false, reason: 'no_item' as const });
const USE_FORBIDDEN: UseResult = Object.freeze({ ok: false, reason: 'forbidden' as const });

/**
 * Actions neutres : la gestion d'inventaire est réelle (give / remove / has / select) ; faute de
 * définitions d'objets, aucun usage n'est possible : use() renvoie « no_item » (mains nues) ou
 * « forbidden » (objet en main), canUse() et solveAim() renvoient false.
 */
export function createNullActions(): ActionApi {
  function select(p: Person, slot: number): boolean {
    if (slot === -1) {
      p.active = -1;
      p.alt = false;
      return true;
    }
    if (!Number.isInteger(slot) || slot < 0 || slot >= p.inventory.length) return false;
    if (p.active !== slot) p.alt = false;
    p.active = slot;
    return true;
  }

  return {
    defs: NO_DEFS,
    def(): ItemDef | undefined {
      return undefined;
    },
    activeItem(p: Person): ItemStack | null {
      return p.active >= 0 ? p.inventory[p.active] ?? null : null;
    },
    select,
    selectById(p: Person, id: ItemId): boolean {
      for (let i = 0; i < p.inventory.length; i++) {
        if (p.inventory[i]!.id === id) return select(p, i);
      }
      return false;
    },
    use(p: Person): UseResult {
      return p.active >= 0 && p.inventory[p.active] ? USE_FORBIDDEN : USE_NO_ITEM;
    },
    setAlt(p: Person, active: boolean): void {
      p.alt = active;
    },
    canUse(): boolean {
      return false;
    },
    solveAim(_p: Person, _tx: number, _ty: number, _tz: number, _out: AimSolution): boolean {
      return false;
    },
    give(p: Person, id: ItemId, count = 1): ItemStack {
      const n = count > 0 ? count : 0;
      for (let i = 0; i < p.inventory.length; i++) {
        const s = p.inventory[i]!;
        if (s.id === id) {
          s.count += n;
          return s;
        }
      }
      const stack: ItemStack = { id, count: n, state: 1, cooldown: 0 };
      p.inventory.push(stack);
      return stack;
    },
    remove(p: Person, id: ItemId, count = Infinity): number {
      let removed = 0;
      for (let i = p.inventory.length - 1; i >= 0 && removed < count; i--) {
        const s = p.inventory[i]!;
        if (s.id !== id) continue;
        const take = Math.min(s.count, count - removed);
        s.count -= take;
        removed += take;
        if (s.count <= 0) {
          p.inventory.splice(i, 1);
          if (p.active === i) {
            p.active = -1;
            p.alt = false;
          } else if (p.active > i) {
            p.active--;
          }
        }
      }
      return removed;
    },
    has(p: Person, id: ItemId): number {
      let total = 0;
      for (let i = 0; i < p.inventory.length; i++) {
        if (p.inventory[i]!.id === id) total += p.inventory[i]!.count;
      }
      return total;
    },
  };
}

// ───────────────────────────── interactions ─────────────────────────────

interface ActiveInteraction {
  opt: InteractionOption;
  elapsed: number;
  handler: InteractionHandler;
  actor: Person;
}

function byPriorityDesc(a: InteractionOption, b: InteractionOption): number {
  return b.priority - a.priority;
}

export interface NullInteractions extends InteractionApi {
  /** Fait avancer les interactions en cours (appelé par le moteur à chaque pas). */
  update(dt: number): void;
  /** Annule toutes les interactions en cours (les gestionnaires restent enregistrés). */
  reset(): void;
}

/**
 * Registre d'interactions fonctionnel : les gestionnaires enregistrés proposent des options,
 * une interaction dure `duration` secondes (tick() peut l'interrompre), puis complete() est appelé.
 * Une seule interaction à la fois par personne ; elle est annulée si l'acteur disparaît ou est
 * mis hors de combat. startVerb() ne lance le verbe que si le gestionnaire propose bien la cible
 * demandée (find() ne reçoit pas de cible).
 */
export function createNullInteractions(ctx: GameContext): NullInteractions {
  const handlers: InteractionHandler[] = [];
  const active: ActiveInteraction[] = [];
  const byActor = new Map<EntityId, ActiveInteraction>();
  /** Gestionnaire à l'origine d'une option (pour retrouver le bon quand plusieurs partagent un verbe). */
  const origin = new WeakMap<InteractionOption, InteractionHandler>();

  function drop(a: ActiveInteraction): void {
    const i = active.indexOf(a);
    if (i >= 0) {
      active[i] = active[active.length - 1]!;
      active.pop();
    }
    if (byActor.get(a.actor.id) === a) byActor.delete(a.actor.id);
  }

  function cancelActive(a: ActiveInteraction): void {
    drop(a);
    try {
      a.handler.cancel?.(a.actor, a.opt);
    } catch (err) {
      console.error(`[interactions] erreur dans cancel() du verbe « ${a.opt.verb} »`, err);
    }
  }

  function begin(actor: Person, opt: InteractionOption, handler: InteractionHandler): boolean {
    if (!handler.begin(actor, opt)) return false;
    if (!(opt.duration > 0)) {
      handler.complete(actor, opt);
      return true;
    }
    // copie : un gestionnaire peut réutiliser son objet d'option d'un appel de find() à l'autre
    const a: ActiveInteraction = { opt: { ...opt }, elapsed: 0, handler, actor };
    active.push(a);
    byActor.set(actor.id, a);
    return true;
  }

  function start(actor: Person, opt: InteractionOption): boolean {
    const current = byActor.get(actor.id);
    if (current) cancelActive(current);
    const known = origin.get(opt);
    if (known && known.verb === opt.verb) return begin(actor, opt, known);
    for (let i = 0; i < handlers.length; i++) {
      const h = handlers[i]!;
      if (h.verb === opt.verb && begin(actor, opt, h)) return true;
    }
    return false;
  }

  return {
    register(handler: InteractionHandler): void {
      if (handlers.indexOf(handler) < 0) handlers.push(handler);
    },
    options(actor: Person, out: InteractionOption[]): number {
      let n = 0;
      for (let i = 0; i < handlers.length; i++) {
        const h = handlers[i]!;
        const o = h.find(actor);
        if (!o) continue;
        origin.set(o, h);
        if (n < out.length) out[n] = o;
        else out.push(o);
        n++;
      }
      truncate(out, n);
      if (n > 1) out.sort(byPriorityDesc);
      return n;
    },
    start,
    startVerb(actor: Person, verb: InteractVerb, targetId: EntityId): boolean {
      for (let i = 0; i < handlers.length; i++) {
        const h = handlers[i]!;
        if (h.verb !== verb) continue;
        const o = h.find(actor);
        if (!o || o.targetId !== targetId) continue;
        origin.set(o, h);
        return start(actor, o);
      }
      return false;
    },
    cancel(actor: Person): void {
      const a = byActor.get(actor.id);
      if (a) cancelActive(a);
    },
    current(actor: Person): { opt: InteractionOption; elapsed: number } | null {
      return byActor.get(actor.id) ?? null;
    },
    update(dt: number): void {
      for (let i = active.length - 1; i >= 0; i--) {
        const a = active[i]!;
        if (ctx.people.get(a.actor.id) !== a.actor || ctx.health.isIncapacitated(a.actor)) {
          cancelActive(a);
          continue;
        }
        a.elapsed += dt;
        try {
          if (a.handler.tick && !a.handler.tick(a.actor, a.opt, a.elapsed, dt)) {
            cancelActive(a);
            continue;
          }
          if (a.elapsed >= a.opt.duration - 1e-9) {
            drop(a);
            a.handler.complete(a.actor, a.opt);
          }
        } catch (err) {
          console.error(`[interactions] erreur pendant le verbe « ${a.opt.verb} » : interaction abandonnée`, err);
          drop(a);
        }
      }
    },
    reset(): void {
      for (let i = active.length - 1; i >= 0; i--) cancelActive(active[i]!);
      active.length = 0;
      byActor.clear();
    },
  };
}

// ───────────────────────────── archétypes ─────────────────────────────

const PROTEST_PROFILES: readonly string[] = [
  'pacifique', 'famille', 'militant', 'service_ordre', 'meneur', 'opportuniste', 'radical', 'pilleur',
];

/**
 * Archétypes neutres : spawn() = people.spawn() (personne « nue », apparence par défaut) ;
 * equip() se borne à enregistrer le poste ou le profil demandé, sans dotation.
 */
export function createNullArchetypes(ctx: GameContext): ArchetypeApi {
  return {
    spawn(kind: PersonKind, x: number, z: number, opts?: Omit<PersonInit, 'kind' | 'x' | 'z'>): Person {
      return ctx.people.spawn({ ...opts, kind, x, z });
    },
    equip(p: Person, poste: PolicePoste | ProtestProfile | null): void {
      if (poste === null) {
        if (p.faction === 'police') p.poste = null;
        else p.profile = null;
      } else if (PROTEST_PROFILES.indexOf(poste) >= 0) {
        p.profile = poste as ProtestProfile;
      } else {
        p.poste = poste as PolicePoste;
      }
    },
  };
}
