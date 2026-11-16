/* =====================================================================================
 * Personnes — doublures pour les tests (non importées par le jeu) : monde factice avec murs,
 * entrées scriptées, dangers factices (nuages de gaz, foyers), actions factices avec
 * définitions d'objets. Tout respecte les interfaces du contrat.
 * ===================================================================================== */

import type {
  ActionApi, AimSolution, Button, GameContext, GameSystem, HazardApi, InputDevice, InputState, ItemCategory, ItemDef,
  ItemId, Person, RayHit, UseOptions, UseResult, Vec2, WorldQuery,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { circleVsObb, distSqPointObb, segmentVsObb } from '@/core/math';
import type { SegmentCast } from '@/core/math';
import { clearRayHit, createNullActions } from '@/core/null-services';

// ───────────────────────────── monde avec murs ─────────────────────────────

/** Mur ou bâtiment rectangulaire aligné sur les axes. */
export interface WallBox {
  x0: number; z0: number; x1: number; z1: number;
  /** Hauteur (m) ; défaut 12. */
  height?: number;
  kind?: 'building' | 'barrier';
}

/** Monde factice : celui de base (plan infini) plus des boîtes infranchissables. */
export function createWallWorld(base: WorldQuery, boxes: readonly WallBox[]): WorldQuery {
  const tmp: Vec2 = { x: 0, z: 0 };
  const cast: SegmentCast = { t: 0, nx: 0, nz: 0 };

  function raycast(ax: number, az: number, bx: number, bz: number, out: RayHit): boolean {
    let bestT = 2;
    let best: WallBox | null = null;
    let nx = 0;
    let nz = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      const hx = (b.x1 - b.x0) * 0.5;
      const hz = (b.z1 - b.z0) * 0.5;
      if (segmentVsObb(ax, az, bx, bz, b.x0 + hx, b.z0 + hz, hx, hz, 0, cast) && cast.t < bestT) {
        bestT = cast.t;
        best = b;
        nx = cast.nx;
        nz = cast.nz;
      }
    }
    if (!best) {
      clearRayHit(out, bx, bz);
      return false;
    }
    out.hit = true;
    out.t = bestT;
    out.x = ax + (bx - ax) * bestT;
    out.z = az + (bz - az) * bestT;
    out.nx = nx;
    out.nz = nz;
    out.kind = best.kind ?? 'building';
    out.id = 0;
    out.height = best.height ?? 12;
    return true;
  }

  const scratch: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };

  return {
    ...base,
    resolveCircle(pos: Vec2, radius: number): boolean {
      let hit = false;
      // deux passes : un coin entre deux boîtes peut demander une seconde correction
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i]!;
          const hx = (b.x1 - b.x0) * 0.5;
          const hz = (b.z1 - b.z0) * 0.5;
          if (circleVsObb(pos.x, pos.z, radius, b.x0 + hx, b.z0 + hz, hx, hz, 0, tmp)) {
            pos.x += tmp.x;
            pos.z += tmp.z;
            hit = true;
          }
        }
      }
      return hit;
    },
    isFree(x: number, z: number, radius: number): boolean {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]!;
        const hx = (b.x1 - b.x0) * 0.5;
        const hz = (b.z1 - b.z0) * 0.5;
        if (distSqPointObb(x, z, b.x0 + hx, b.z0 + hz, hx, hz, 0) < radius * radius) return false;
      }
      return true;
    },
    raycast,
    lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
      return !raycast(ax, az, bx, bz, scratch);
    },
  };
}

// ───────────────────────────── entrées scriptées ─────────────────────────────

/**
 * InputState piloté par le test. Les fronts (pressed / released), les rotations du regard et la
 * molette demandés entre deux pas sont visibles pendant exactement un pas de simulation.
 */
export class ScriptedInput implements InputState {
  device: InputDevice = 'kbm';
  moveX = 0;
  moveY = 0;
  lookX = 0;
  lookY = 0;
  throttle = 0;
  brake = 0;
  wheel = 0;
  pointerLocked = true;
  readonly rumbles: { strength: number; seconds: number }[] = [];
  private readonly held = new Set<Button>();
  private readonly edgeDown = new Set<Button>();
  private readonly edgeUp = new Set<Button>();
  private readonly nextDown = new Set<Button>();
  private readonly nextUp = new Set<Button>();
  private nextLookX = 0;
  private nextLookY = 0;
  private nextWheel = 0;

  down(b: Button): boolean {
    return this.held.has(b);
  }

  pressed(b: Button): boolean {
    return this.edgeDown.has(b);
  }

  released(b: Button): boolean {
    return this.edgeUp.has(b);
  }

  rumble(strength: number, seconds: number): void {
    this.rumbles.push({ strength, seconds });
  }

  /** Enfonce un bouton (maintenu jusqu'à release). */
  press(b: Button): void {
    if (this.held.has(b)) return;
    this.held.add(b);
    this.nextDown.add(b);
  }

  release(b: Button): void {
    if (!this.held.has(b)) return;
    this.held.delete(b);
    this.nextUp.add(b);
  }

  /** Rotation du regard à appliquer au prochain pas (x > 0 = droite, y > 0 = haut). */
  look(dx: number, dy: number): void {
    this.nextLookX += dx;
    this.nextLookY += dy;
  }

  scroll(notches: number): void {
    this.nextWheel += notches;
  }

  setMove(x: number, y: number): void {
    this.moveX = x;
    this.moveY = y;
  }

  /** Début d'un pas : les demandes en attente deviennent visibles pour ce pas seulement. */
  beginStep(): void {
    this.edgeDown.clear();
    this.edgeUp.clear();
    for (const b of this.nextDown) this.edgeDown.add(b);
    for (const b of this.nextUp) this.edgeUp.add(b);
    this.nextDown.clear();
    this.nextUp.clear();
    this.lookX = this.nextLookX;
    this.lookY = this.nextLookY;
    this.wheel = this.nextWheel;
    this.nextLookX = 0;
    this.nextLookY = 0;
    this.nextWheel = 0;
  }
}

/** Système d'ordre INPUT qui publie un ScriptedInput dans ctx.input et verrouille ses fronts à chaque pas. */
export function createScriptedInputSystem(input: ScriptedInput): GameSystem {
  return {
    id: 'test.input',
    order: SystemOrder.INPUT,
    provide(ctx: GameContext): void {
      ctx.input = input;
    },
    update(): void {
      input.beginStep();
    },
  };
}

// ───────────────────────────── dangers factices ─────────────────────────────

export interface HazardDisc { x: number; z: number; r: number; level: number }

export interface FakeHazards extends HazardApi {
  readonly gas: HazardDisc[];
  readonly fire: HazardDisc[];
}

/** Dangers factices : disques de gaz et de feu de concentration uniforme, posés par le test. */
export function createFakeHazards(): FakeHazards {
  const gas: HazardDisc[] = [];
  const fire: HazardDisc[] = [];
  function levelAt(discs: HazardDisc[], x: number, z: number): number {
    let best = 0;
    for (let i = 0; i < discs.length; i++) {
      const d = discs[i]!;
      const dx = x - d.x;
      const dz = z - d.z;
      if (dx * dx + dz * dz <= d.r * d.r && d.level > best) best = d.level;
    }
    return best;
  }
  return {
    gas,
    fire,
    emitGas(x: number, z: number, amount: number, radius: number): void {
      gas.push({ x, z, r: radius, level: amount });
    },
    emitSmoke(): void {},
    gasAt(x: number, z: number): number {
      return levelAt(gas, x, z);
    },
    smokeAt(): number {
      return 0;
    },
    ignite(x: number, z: number, radius: number, intensity: number): void {
      fire.push({ x, z, r: radius, level: intensity });
    },
    fireAt(x: number, z: number): number {
      return levelAt(fire, x, z);
    },
    douse(x: number, z: number, radius: number): void {
      for (let i = fire.length - 1; i >= 0; i--) {
        const d = fire[i]!;
        const dx = x - d.x;
        const dz = z - d.z;
        if (dx * dx + dz * dz <= (radius + d.r) * (radius + d.r)) fire.splice(i, 1);
      }
    },
    visibility(): number {
      return 1;
    },
    clear(): void {
      gas.length = 0;
      fire.length = 0;
    },
  };
}

// ───────────────────────────── actions factices ─────────────────────────────

export interface UseCall { personId: number; item: ItemId | null; power: number; t: number }

export interface FakeActions extends ActionApi {
  /** Usages demandés, dans l'ordre. */
  readonly uses: UseCall[];
  /** Demandes setAlt reçues. */
  readonly alts: { personId: number; active: boolean }[];
  addDef(id: ItemId, category: ItemCategory, weight?: number): ItemDef;
}

/** Actions factices : inventaire réel (celui du service neutre), définitions déclarées par le test, usages enregistrés. */
export function createFakeActions(ctx: GameContext): FakeActions {
  const base = createNullActions();
  const defs: ItemDef[] = [];
  const byId = new Map<string, ItemDef>();
  const uses: UseCall[] = [];
  const alts: { personId: number; active: boolean }[] = [];
  return {
    ...base,
    defs,
    uses,
    alts,
    addDef(id: ItemId, category: ItemCategory, weight = 0.5): ItemDef {
      const def: ItemDef = {
        id, name: id, category, description: '', twoHanded: false, heldModel: id, idleAnim: 'none', useAnim: 'throw',
        icon: '?', maxCount: 10, weight, cooldown: 0, rangeMin: 0, rangeMax: 30, forceLevel: 0, forceMeans: null,
        projectile: null, habilitation: null,
      };
      defs.push(def);
      byId.set(id, def);
      return def;
    },
    def(id: ItemId): ItemDef | undefined {
      return byId.get(id);
    },
    use(p: Person, opts?: UseOptions): UseResult {
      const stack = base.activeItem(p);
      uses.push({ personId: p.id, item: stack ? stack.id : null, power: opts?.power ?? 1, t: ctx.clock.now });
      return stack ? { ok: true } : { ok: false, reason: 'no_item' };
    },
    setAlt(p: Person, active: boolean): void {
      alts.push({ personId: p.id, active });
      p.alt = active;
    },
    canUse(p: Person): boolean {
      return base.activeItem(p) !== null;
    },
    solveAim(_p: Person, _tx: number, _ty: number, _tz: number, _out: AimSolution): boolean {
      return false;
    },
  };
}
