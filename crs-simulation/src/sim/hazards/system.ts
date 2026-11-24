/* =====================================================================================
 * DANGERS DIFFUS — système de simulation : gaz lacrymogène, fumée, feu, eau.
 *
 * Publie ctx.hazards (HazardApi complet) et le service de lecture « hazards.field »
 * (HazardFieldView). Ordre d'exécution : SystemOrder.HAZARDS.
 *
 * Rythme : les feux vivent à chaque pas du moteur ; le champ avance à 10 Hz (FIELD_DT) en trois tâches
 * décalées d'un tiers de période pour étaler le coût : fumée, entretien des blocs, gaz. Entre deux pas
 * de champ, les émissions sont déposées immédiatement dans les cellules : gasAt / smokeAt les voient
 * tout de suite.
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, HazardApi, Person, Unsubscribe, Vec2 } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { HAZARD_DOUSE_EVENT, HAZARD_FIELD_SERVICE } from './api';
import type { FireView, HazardCellCallback, HazardDouseEvent, HazardFieldView, HazardStats } from './api';
import * as cfg from './config';
import type { HazardTuning } from './config';
import { FireSet } from './fires';
import { FieldGrid } from './grid';
import * as sampling from './sampling';
import { FieldSolver } from './solver';
import { StaticCache } from './statics';
import { WindModel } from './wind';

// Copies locales des constantes et des fonctions d'accès au champ (voir sampling.ts).
const BLOCK_MASK = cfg.BLOCK_MASK;
const BLOCK_SHIFT = cfg.BLOCK_SHIFT;
const BLOCK_SIZE = cfg.BLOCK_SIZE;
const CELL = cfg.CELL;
const FIELD_DT = cfg.FIELD_DT;
const INV_CELL = cfg.INV_CELL;
const SMOKE_DEFAULT_COLOR = cfg.SMOKE_DEFAULT_COLOR;
const SMOKE_FIRE_COLOR = cfg.SMOKE_FIRE_COLOR;
const STEAM_COLOR = cfg.STEAM_COLOR;
const deposit = sampling.deposit;
const forEachCell = sampling.forEachCell;
const collectCells = sampling.collectCells;
const opticalDepth = sampling.opticalDepth;
const sampleField = sampling.sampleField;
const totalMass = sampling.totalMass;
const washout = sampling.washout;

/** Identifiant du système. */
export const HAZARDS_SYSTEM_ID = 'sim:hazards';
/** Épaisseur optique au-delà de laquelle la visibilité est tenue pour nulle (e^−7 ≈ 0,001). */
const TAU_CUTOFF = 7;
/** Avance initiale des accumulateurs : l'entretien tombe un tiers de période avant le gaz, la fumée deux tiers. */
const MAINTAIN_PHASE = FIELD_DT / 3;
const SMOKE_PHASE = (FIELD_DT * 2) / 3;
/** Nombre maximal de sous-pas de transport rattrapés dans un même pas du moteur. */
const MAX_CATCH_UP = cfg.MAX_SUBSTEPS;
/** Événement libre du module du monde quand la carte entière change (nom repris ici pour ne pas l'importer). */
const WORLD_SOURCE_EVENT = 'world:source';
/** Humidité gagnée par une personne au centre du jet, par unité d'eau. */
const WET_PER_UNIT = 0.4;
/** Saute de vent (m/s, entre deux relevés consécutifs) qui force le recalcul immédiat de tous les coefficients. */
const WIND_JUMP = 1;

export class HazardsSystem implements GameSystem, HazardApi, HazardFieldView {
  readonly id = HAZARDS_SYSTEM_ID;
  readonly order = SystemOrder.HAZARDS;
  readonly cellSize = CELL;
  readonly blockSize = BLOCK_SIZE;
  revision = 0;

  private readonly tuning: HazardTuning;
  private ctx!: GameContext;
  private statics!: StaticCache;
  private grid!: FieldGrid;
  private wind!: WindModel;
  private solver!: FieldSolver;
  private fireSet!: FireSet;

  private accGas = 0;
  private accMaintain = MAINTAIN_PHASE;
  private accSmoke = SMOKE_PHASE;
  private lastWindX = 0;
  private lastWindZ = 0;
  private readonly unsubscribe: Unsubscribe[] = [];
  private readonly peopleOut: Person[] = [];
  private readonly douseEvent: HazardDouseEvent = { x: 0, z: 0, radius: 0, amount: 0 };
  private readonly statsOut: HazardStats = {
    blocks: 0, smokeBlocks: 0, pooledBlocks: 0, staticBlocks: 0, fieldSteps: 0, substeps: 1, fires: 0, gasMass: 0, smokeMass: 0,
  };

  constructor(tuning: Partial<HazardTuning> = {}) {
    this.tuning = cfg.makeTuning(tuning);
  }

  // ───────────────────────────── cycle de vie ─────────────────────────────

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    // ctx.world est lu à chaque usage : le module du monde peut être branché avant ou après celui-ci
    this.statics = new StaticCache(() => ctx.world, this.tuning);
    this.grid = new FieldGrid(this.statics);
    this.wind = new WindModel(this.tuning);
    this.wind.reset(ctx.rng.fork('hazards:vent'));
    this.solver = new FieldSolver(this.grid, this.statics, this.wind, this.tuning);
    this.fireSet = new FireSet(ctx, this.tuning);
    this.fireSet.onSteam = (x, z, radius, amount): void => {
      deposit(this.grid, x, z, amount, radius, true, STEAM_R, STEAM_G, STEAM_B);
    };
    ctx.hazards = this;
    ctx.provide<HazardFieldView>(HAZARD_FIELD_SERVICE, this);
  }

  init(ctx: GameContext): void {
    // le bâti change quand une tuile arrive ou repart : oublier le cache de la zone
    const onTile = (e: { tx: number; tz: number }): void => {
      const size = ctx.world.tileSize > 0 ? ctx.world.tileSize : 512;
      this.statics.invalidateRect(e.tx * size, e.tz * size, (e.tx + 1) * size, (e.tz + 1) * size);
    };
    this.unsubscribe.push(ctx.events.on('world:tile_loaded', onTile));
    this.unsubscribe.push(ctx.events.on('world:tile_unloaded', onTile));
    // changement de jeu de données (Paris ↔ quartier d'essai) : tout le bâti est à relire
    this.unsubscribe.push(ctx.events.onAny(WORLD_SOURCE_EVENT, () => this.statics.clear()));
  }

  update(dt: number): void {
    const env = this.ctx.env.state;
    const rain = env.rain > 0 ? (env.rain < 1 ? env.rain : 1) : 0;
    const blocks = this.grid.blocks;
    // un feu qui brûle change à chaque pas ; un champ vide ne change pas (la révision reste stable)
    let changed = this.fireSet.list.length > 0;
    this.fireSet.update(dt, rain);
    this.syncWind();

    // Trois tâches à 10 Hz, décalées d'un tiers de période pour tomber sur des pas de moteur différents :
    // fumée, puis entretien (extension et libération des blocs, bâti, coefficients), puis gaz.
    // Par grand vent, le transport se fait en sous-pas plus courts : ils sont exécutés à leur propre
    // cadence (un par pas de moteur à 30 Hz pour trois sous-pas) au lieu d'être groupés.
    const period = FIELD_DT / this.wind.substeps;
    this.accSmoke += dt;
    for (let n = 0; this.accSmoke >= period && n < MAX_CATCH_UP; n++) {
      this.accSmoke -= period;
      this.feedSmoke(period);
      if (blocks.length > 0) changed = true;
      this.solver.stepSmoke();
    }
    if (this.accSmoke >= period) this.accSmoke = 0;

    this.accMaintain += dt;
    if (this.accMaintain >= FIELD_DT) {
      this.accMaintain -= FIELD_DT;
      if (this.accMaintain >= FIELD_DT) this.accMaintain = 0;
      if (blocks.length > 0) changed = true;
      this.solver.maintain();
    }

    this.accGas += dt;
    for (let n = 0; this.accGas >= period && n < MAX_CATCH_UP; n++) {
      this.accGas -= period;
      if (blocks.length > 0) changed = true;
      this.solver.stepGas();
    }
    if (this.accGas >= period) this.accGas = 0;
    if (changed) this.revision++;
  }

  /** Début de session : champ vide, cache de bâti oublié, turbulence et feux re-dérivés de la graine. */
  reset(): void {
    this.grid.clear();
    this.statics.clear();
    this.fireSet.reset();
    this.solver.reset();
    this.wind.reset(this.ctx.rng.fork('hazards:vent'));
    this.accGas = 0;
    this.accMaintain = MAINTAIN_PHASE;
    this.accSmoke = SMOKE_PHASE;
    this.lastWindX = 0;
    this.lastWindZ = 0;
    this.revision++;
  }

  dispose(): void {
    for (let i = 0; i < this.unsubscribe.length; i++) this.unsubscribe[i]!();
    this.unsubscribe.length = 0;
  }

  // ───────────────────────────── HazardApi ─────────────────────────────

  /**
   * Lacrymogène : ajoute `amount` de concentration au centre, décroissant jusqu'à `radius` (2 m au
   * moins) ; masse déposée = amount × π r² / 3. Repère : un palet qui fume = 0,25 par seconde dans un
   * rayon de 2,5 m pendant 30 s ; six palets donnent alors ≈ 800 m² au-dessus de 0,1 par air calme.
   */
  emitGas(x: number, z: number, amount: number, radius: number): void {
    if (deposit(this.grid, x, z, amount, radius, false, 0, 0, 0) > 0) this.revision++;
  }

  /** Fumée opaque colorée (0xRRGGBB, gris sombre par défaut) : mêmes conventions qu'emitGas. */
  emitSmoke(x: number, z: number, amount: number, radius: number, color: number = SMOKE_DEFAULT_COLOR): void {
    const c = Number.isFinite(color) ? color & 0xffffff : SMOKE_DEFAULT_COLOR;
    const r = ((c >> 16) & 255) / 255;
    const g = ((c >> 8) & 255) / 255;
    const b = (c & 255) / 255;
    if (deposit(this.grid, x, z, amount, radius, true, r, g, b) > 0) this.revision++;
  }

  gasAt(x: number, z: number): number {
    const v = sampleField(this.grid, x, z, false);
    return v > 1 ? 1 : v > 0 ? v : 0;
  }

  smokeAt(x: number, z: number): number {
    const v = sampleField(this.grid, x, z, true);
    return v > 1 ? 1 : v > 0 ? v : 0;
  }

  ignite(x: number, z: number, radius: number, intensity: number, sourceId: EntityId): void {
    if (this.fireSet.ignite(x, z, radius, intensity, sourceId) !== null) this.revision++;
  }

  fireAt(x: number, z: number): number {
    return this.fireSet.fireAt(x, z);
  }

  /**
   * Eau ou poudre dans un disque : abat les nappes de feu, rabat le gaz et la fumée, mouille les personnes
   * présentes, et prévient les autres modules (événement libre « hazards:douse ») pour leurs propres feux.
   * `amount` : 1 ≈ une seconde de jet d'extincteur (engin lanceur d'eau ≈ 3 par seconde).
   */
  douse(x: number, z: number, radius: number, amount: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !(amount > 0) || !Number.isFinite(amount)) return;
    const r = radius > 0.5 ? radius : 0.5;
    // le rabattement d'abord : la vapeur dégagée par l'eau sur un feu ne doit pas être lavée par le même jet
    washout(this.grid, x, z, r, 1 - Math.exp(-this.tuning.washout * amount));
    this.fireSet.douse(x, z, r, amount);

    // Personnes dans la zone arrosée : trempées (le module des personnes en déduit qu'elles s'enflamment
    // moins et s'éteignent plus vite). L'extinction directe d'une personne en feu appartient à l'objet employé.
    const people = this.peopleOut;
    const n = this.ctx.people.queryRadius(x, z, r, people);
    const r2 = r * r;
    for (let i = 0; i < n; i++) {
      const p = people[i]!;
      const dx = p.x - x;
      const dz = p.z - z;
      const u = 1 - (dx * dx + dz * dz) / r2;
      if (u <= 0) continue;
      const wet = p.wet + WET_PER_UNIT * amount * (0.4 + 0.6 * u);
      p.wet = wet < 1 ? wet : 1;
    }

    const e = this.douseEvent;
    e.x = x;
    e.z = z;
    e.radius = r;
    e.amount = amount;
    this.ctx.events.emitAny(HAZARD_DOUSE_EVENT, e);
    this.revision++;
  }

  /** Visibilité entre deux points à travers la fumée et le gaz dense (le bâti n'est pas pris en compte). */
  visibility(ax: number, az: number, bx: number, bz: number): number {
    const t = this.tuning;
    const tau = opticalDepth(this.grid, ax, az, bx, bz, t.smokeOpacity, t.gasOpacity, t.gasOpacityMin, TAU_CUTOFF);
    if (tau <= 0) return 1;
    if (tau >= TAU_CUTOFF) return 0;
    return Math.exp(-tau);
  }

  /** Retire tout le gaz, toute la fumée et tous les feux (le cache de bâti est conservé). */
  clear(): void {
    this.grid.clear();
    this.fireSet.clear();
    this.solver.reset();
    this.revision++;
  }

  // ───────────────────────────── HazardFieldView ─────────────────────────────

  get fires(): readonly FireView[] {
    return this.fireSet.list;
  }

  get driftX(): number {
    return this.wind.driftX;
  }

  get driftZ(): number {
    return this.wind.driftZ;
  }

  forEachActiveCell(cb: HazardCellCallback, minDensity = 0.01, cx = 0, cz = 0, radius = 0): number {
    return forEachCell(this.grid, cb, minDensity > 1e-4 ? minDensity : 1e-4, cx, cz, radius);
  }

  collectActiveCells(out: Float32Array, minDensity = 0.01, cx = 0, cz = 0, radius = 0): number {
    return collectCells(this.grid, out, minDensity > 1e-4 ? minDensity : 1e-4, cx, cz, radius);
  }

  driftAt(x: number, z: number, out: Vec2): Vec2 {
    const ci = Math.floor(x * INV_CELL);
    const cj = Math.floor(z * INV_CELL);
    const b = this.grid.find(ci >> BLOCK_SHIFT, cj >> BLOCK_SHIFT);
    if (b === null) {
      out.x = this.wind.driftX;
      out.z = this.wind.driftZ;
    } else {
      this.solver.velocityOf(b.st, ((cj & BLOCK_MASK) << BLOCK_SHIFT) | (ci & BLOCK_MASK), out);
    }
    return out;
  }

  totalGas(): number {
    return totalMass(this.grid, false);
  }

  totalSmoke(): number {
    return totalMass(this.grid, true);
  }

  get stats(): Readonly<HazardStats> {
    const s = this.statsOut;
    const blocks = this.grid.blocks;
    let smoke = 0;
    for (let i = 0; i < blocks.length; i++) if (blocks[i]!.smokeOn) smoke++;
    s.blocks = blocks.length;
    s.smokeBlocks = smoke;
    s.pooledBlocks = this.grid.pooled;
    s.staticBlocks = this.statics.size;
    s.fieldSteps = this.solver.fieldSteps;
    s.substeps = this.wind.substeps;
    s.fires = this.fireSet.list.length;
    s.gasMass = blocks.length > 0 ? this.solver.totalGas : 0;
    s.smokeMass = blocks.length > 0 ? this.solver.totalSmoke : 0;
    return s;
  }

  // ───────────────────────────── interne ─────────────────────────────

  /**
   * Met la dérive à jour. Une variation progressive du vent se propage en 0,8 s par le rafraîchissement
   * étalé des blocs ; seule une saute brutale (vent imposé d'un coup par une mission) ou un changement du
   * nombre de sous-pas fait recalculer tous les coefficients d'un coup, pour que des blocs voisins ne
   * restent pas en désaccord sur le sens du vent.
   */
  private syncWind(): void {
    const env = this.ctx.env.state;
    let all = this.wind.update(this.ctx.clock.now, env);
    const dx = env.windX - this.lastWindX;
    const dz = env.windZ - this.lastWindZ;
    this.lastWindX = env.windX;
    this.lastWindZ = env.windZ;
    if (dx * dx + dz * dz > WIND_JUMP * WIND_JUMP) all = true;
    if (all) this.solver.markAllDirty();
  }

  /** Les feux fument : fumée noire déposée au-dessus de chaque nappe pendant `seconds`, en proportion de son intensité. */
  private feedSmoke(seconds: number): void {
    const fires = this.fireSet.list;
    const rate = this.tuning.fireSmokeRate * seconds;
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i]!;
      if (f.intensity < 0.02) continue;
      deposit(this.grid, f.x, f.z, rate * f.intensity, f.radius + 1.5, true, FIRE_R, FIRE_G, FIRE_B);
    }
  }
}

const FIRE_R = ((SMOKE_FIRE_COLOR >> 16) & 255) / 255;
const FIRE_G = ((SMOKE_FIRE_COLOR >> 8) & 255) / 255;
const FIRE_B = (SMOKE_FIRE_COLOR & 255) / 255;
const STEAM_R = ((STEAM_COLOR >> 16) & 255) / 255;
const STEAM_G = ((STEAM_COLOR >> 8) & 255) / 255;
const STEAM_B = (STEAM_COLOR & 255) / 255;
