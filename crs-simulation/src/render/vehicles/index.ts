/* Module « rendu des véhicules » : système de présentation (ordre VIEW) qui dessine tous les véhicules de
 * ctx.vehicles.list — modèles procéduraux instanciés, feux et gyrophares, états de dégâts, vue intérieure et
 * écran de tourelle.
 *
 * Branchement : ajouter `createSystems` à la racine de composition. Le service étendu
 * ctx.service<VehiclesRenderApi>('vehiclesRender') est publié dès provide(). Le module ne dépend que du
 * contrat ; sans ctx.view (mode headless, ou rendu de base pas encore branché) il ne fait rien. */

import { SystemOrder } from '@/core/contracts';
import type { EntityId, GameContext, GameSystem, ModuleFactory, Vec3, Vehicle } from '@/core/contracts';
import { VEHICLES_RENDER_KEY } from './api';
import type { VehiclesRenderApi, VehiclesRenderStats } from './api';
import { seatEyeWorld, turretMuzzleWorld } from './frame';
import { VehiclesRenderer } from './renderer';

export type { RenderLightsApi, VehiclesRenderApi, VehiclesRenderStats } from './api';
export { RENDER_LIGHTS_KEY, VEHICLES_RENDER_KEY } from './api';
export { REFERENCE_DEFS, referenceDef, CIVIL_COLORS } from './refdefs';
export { VehiclesRenderer } from './renderer';

const EMPTY_STATS: VehiclesRenderStats = { near: 0, far: 0, hidden: 0, drawCalls: 0, triangles: 0, fx: 0, cpuMs: 0, cpuMsAvg: 0, models: 0 };

class VehiclesRenderSystem implements GameSystem, VehiclesRenderApi {
  readonly id = 'render.vehicles';
  readonly order = SystemOrder.VIEW;
  private ctx: GameContext | null = null;
  private renderer: VehiclesRenderer | null = null;
  private failed = false;
  private errors = 0;
  private fire = true;

  get stats(): VehiclesRenderStats {
    return this.renderer ? this.renderer.stats : EMPTY_STATS;
  }

  /** Accès au moteur de rendu (bancs d'essai). */
  get engine(): VehiclesRenderer | null {
    return this.renderer;
  }

  get ownFire(): boolean { return this.fire; }
  set ownFire(value: boolean) {
    this.fire = value;
    if (this.renderer) this.renderer.ownFire = value;
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide<VehiclesRenderApi>(VEHICLES_RENDER_KEY, this);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.ensureRenderer();
  }

  /** Le rendu de base peut être branché après ce module : le moteur est créé dès que ctx.view existe. */
  private ensureRenderer(): void {
    const ctx = this.ctx;
    if (this.renderer || this.failed || !ctx || ctx.headless || !ctx.view) return;
    try {
      this.renderer = new VehiclesRenderer(ctx, ctx.view);
      this.renderer.ownFire = this.fire;
    } catch (err) {
      this.failed = true;
      console.error('[vehicles] initialisation du rendu des véhicules impossible :', err);
    }
  }

  frame(dt: number): void {
    if (!this.renderer) this.ensureRenderer();
    if (!this.renderer) return;
    try {
      this.renderer.frame(dt);
    } catch (err) {
      if (this.errors++ < 5) console.error('[vehicles] erreur pendant le rendu des véhicules :', err);
    }
  }

  reset(): void {
    this.renderer?.reset();
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer = null;
  }

  setDoor(vehicleId: EntityId, door: number, open: boolean): void {
    this.renderer?.setDoor(vehicleId, door, open);
  }

  pulseDoor(vehicleId: EntityId, door: number, seconds?: number): void {
    this.renderer?.pulseDoor(vehicleId, door, seconds);
  }

  seatEye(v: Vehicle, seat: number, out: Vec3): boolean {
    const sd = v.def.seats[seat];
    if (!sd) return false;
    seatEyeWorld(v, sd, out);
    return true;
  }

  turretMuzzle(v: Vehicle, turret: number, outPos: Vec3, outDir: Vec3): boolean {
    return turretMuzzleWorld(v, turret, outPos, outDir);
  }

  invalidate(): void {
    this.renderer?.invalidate();
  }
}


export const createSystems: ModuleFactory = () => [new VehiclesRenderSystem()];
