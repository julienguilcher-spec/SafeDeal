/* =====================================================================================
 * ACTIONS — implémentation de ctx.actions (ActionApi) : contrôles communs (délai, munitions,
 * posture, étourdissement, entrave), aiguillage vers la famille d'usage, mode secondaire.
 * Même chemin pour le joueur et pour toutes les IA.
 * ===================================================================================== */

import type {
  ActionApi, AimSolution, ItemDef, ItemId, ItemStack, Person, UseFailure, UseOptions, UseResult,
} from '@/core/contracts';
import type { ItemSpec } from './api';
import { solveAim } from './aim';
import { ITEM_DEFS, itemDef } from './defs';
import { activeItem, give, has, remove, select, selectById } from './inventory';
import type { ProjectileSystem } from './projectiles';
import { BURNING_BLOCK, LAUNCHER_RANGES, STUN_BLOCK, useFail } from './shared';
import type { ItemsCore } from './shared';
import { itemSpec } from './specs';
import { launcherBusy, useLaunch } from './use-launch';
import { useMelee, useRacket } from './use-melee';
import { useDrone, useDrop, useInteract, useLamp, useMask, useMedia, useMegaphone, useRadio, useSign, useUmbrella } from './use-misc';
import { useSpray } from './use-spray';

export interface Actions extends ActionApi {
  /** Usage de la pile d'index `slot`, qu'elle soit en main ou non. */
  useSlot(p: Person, slot: number, opts?: UseOptions): UseResult;
  /** Motif de refus d'un usage, ou null s'il est possible. */
  check(p: Person, slot: number): UseFailure | null;
}

/** L'objet demande-t-il les deux mains ou un geste ample (impossible en portant quelqu'un) ? */
function needsFreeHands(def: ItemDef, spec: ItemSpec): boolean {
  if (spec.verb === 'porter') return false; // le brancard sert justement à porter
  return def.twoHanded || spec.use === 'melee' || spec.use === 'shield' || spec.use === 'throw' || spec.use === 'racket';
}

export function createActions(core: ItemsCore, projectiles: ProjectileSystem): Actions {
  function check(p: Person, slot: number): UseFailure | null {
    const ctx = core.ctx;
    // personne entravée, tenue ou hors simulation : aucun usage
    if (p.dormant || p.custody !== 'free' || p.heldBy !== 0) return 'forbidden';
    const stack = slot >= 0 ? p.inventory[slot] : undefined;
    if (!stack) return 'no_item';
    const def = itemDef(stack.id);
    const spec = itemSpec(stack.id);
    if (!def || !spec) return 'forbidden';
    if (p.posture === 'down' || ctx.health.isIncapacitated(p)) return 'posture';
    if (p.vehicleId !== 0 || p.posture === 'seated') {
      if (!spec.seated) return 'posture';
    } else if (p.posture === 'prone') {
      if (!spec.seated) return 'posture';
    } else if (p.posture === 'sit' && (spec.use === 'melee' || spec.use === 'shield' || spec.use === 'racket')) {
      return 'posture';
    }
    if (p.stun > STUN_BLOCK || p.burning > BURNING_BLOCK) return 'blocked';
    if (p.carrying !== 0 && needsFreeHands(def, spec)) return 'blocked';
    if (stack.cooldown > 0) {
      core.track(stack);
      return 'cooldown';
    }
    if (spec.consume !== 'none' && stack.count <= 0) return 'empty';
    if (spec.use === 'shield' && stack.state <= 0) return 'empty';
    if (launcherBusy(p, stack)) return 'cooldown';
    return null;
  }

  function dispatch(p: Person, stack: ItemStack, opts: UseOptions | undefined): UseResult {
    const def = itemDef(stack.id)!;
    const spec = itemSpec(stack.id)!;
    switch (spec.use) {
      case 'shield':
      case 'melee': return useMelee(core, p, stack, def, spec, opts);
      case 'racket': return useRacket(core, projectiles, p, stack, def, spec);
      case 'spray_gas':
      case 'spray_powder':
      case 'spray_water':
      case 'spray_paint': return useSpray(core, p, stack, def, spec, opts);
      case 'throw':
      case 'launch': return useLaunch(core, projectiles, p, stack, def, spec, opts);
      case 'megaphone': return useMegaphone(core, p, stack, def, spec);
      case 'radio': return useRadio(core, p, stack, def, spec);
      case 'interact': return useInteract(core, p, stack, def, spec, opts);
      case 'media': return useMedia(core, p, stack, def, spec, opts);
      case 'lamp': return useLamp(core, p, stack, def);
      case 'mask': return useMask(core, p, stack, def);
      case 'sign': return useSign(core, p, stack, def, spec);
      case 'umbrella': return useUmbrella(core, p, stack, def);
      case 'drone': return useDrone(core, p, stack, def, spec);
      case 'drop': return useDrop(core, p, stack, def, spec);
      default: return useFail('forbidden');
    }
  }

  function useSlot(p: Person, slot: number, opts?: UseOptions): UseResult {
    const fail = check(p, slot);
    if (fail) return useFail(fail);
    return dispatch(p, p.inventory[slot]!, opts);
  }

  /** Une animation d'usage est-elle en cours pour cette personne ? (la pose de repos lui succédera) */
  function animating(p: Person): boolean {
    const list = core.anims;
    for (let i = 0; i < list.length; i++) if (list[i]!.personId === p.id) return true;
    return false;
  }

  return {
    defs: ITEM_DEFS,
    def(id: ItemId): ItemDef | undefined {
      return itemDef(id);
    },
    activeItem,
    select(p: Person, slot: number): boolean {
      return select(core, p, slot);
    },
    selectById(p: Person, id: ItemId): boolean {
      return selectById(core, p, id);
    },
    use(p: Person, opts?: UseOptions): UseResult {
      return useSlot(p, p.active, opts);
    },
    useSlot,
    check,
    setAlt(p: Person, active: boolean): void {
      // une personne à terre, maîtrisée ou étourdie baisse sa garde
      if (active && (p.custody !== 'free' || p.heldBy !== 0 || p.stun > STUN_BLOCK || core.ctx.health.isIncapacitated(p))) {
        active = false;
      }
      const was = p.alt;
      p.alt = active;
      const stack = activeItem(p);
      if (!stack || was === active) return;
      const def = itemDef(stack.id);
      const spec = itemSpec(stack.id);
      if (!def || !spec) return;
      if (stack.id === 'lanceur_cougar' && active) {
        // chaque pression change de dispositif de propulsion : 50 → 100 → 200 → 50 m
        core.setLauncherIndex(p, (core.launcherIndex(p) + 1) % LAUNCHER_RANGES.length);
        core.sfx('ui_clic', p.x, p.y + 1.3, p.z, 0.4);
      }
      if ((stack.id === 'parapluie' || stack.id === 'bouclier') && active && stack.state <= 0) {
        // toile déchirée, bouclier brisé : plus rien à lever
        p.alt = false;
        return;
      }
      if (spec.altAnim && !animating(p)) {
        p.upper = active ? spec.altAnim : def.idleAnim;
        p.upperT = 0;
      }
    },
    canUse(p: Person, slot?: number): boolean {
      return check(p, slot === undefined ? p.active : slot) === null;
    },
    solveAim(p: Person, tx: number, ty: number, tz: number, out: AimSolution): boolean {
      return solveAim(core, p, tx, ty, tz, out);
    },
    give,
    remove(p: Person, id: ItemId, count?: number): number {
      return remove(core, p, id, count);
    },
    has,
  };
}
