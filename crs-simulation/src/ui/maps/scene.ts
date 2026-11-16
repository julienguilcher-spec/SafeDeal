/* =====================================================================================
 * Scène de carte : instantané de tout ce qui se dessine par-dessus le fond de plan, filtré selon
 * ce que le rôle du joueur peut légitimement connaître. Partagée par la mini-carte, le plan et la
 * carte tactique ; rafraîchie à la demande (5 Hz pour les unités, 2 Hz pour la foule et les nuages),
 * jamais à chaque image. Tout service étendu peut être absent : la couche reste alors vide.
 * ===================================================================================== */

import type { GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type {
  Incident, IncidentsApi, MetroApi, MetroStation, Objective, ObjectivesApi, RescueApi, RescueCall, RoadClosure,
  TrafficControlApi,
} from '@/core/extensions';
import { pointOnPolyline } from '@/core/math';
import type { MapVisibility } from './api';
import { aggregateDensity, createDensityGrid, densityColor } from './density';
import type { DensityGrid, DensityPoint } from './density';
import { UnitModel } from './units';
import type { MapUnit } from './units';
import { incidentVisible, visibilityFor, visibilityForContext } from './visibility';

/** Lecture du champ de gaz (forme du service 'hazards.field', sans dépendre de son module). */
interface HazardFieldLike {
  readonly cellSize: number;
  readonly revision: number;
  forEachActiveCell(
    cb: (x: number, z: number, gas: number, smoke: number, color: number) => void, minDensity?: number,
    cx?: number, cz?: number, radius?: number,
  ): number;
  readonly fires: readonly { x: number; z: number; radius: number; intensity: number }[];
}

export interface SceneFire { x: number; z: number; radius: number; intensity: number }

const UNITS_PERIOD = 0.2;
const CROWD_PERIOD = 0.5;
const HAZARD_PERIOD = 0.5;
/** Côté de cellule de la carte de densité (m) et taille maximale de la grille. */
export const DENSITY_CELL = 5;
const DENSITY_MAX = 192;
/** Taille maximale de l'image des nuages (cellules de gaz). */
const GAS_MAX = 256;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000;
}

function makeCanvas(): HTMLCanvasElement | null {
  return typeof document !== 'undefined' ? document.createElement('canvas') : null;
}

export class MapScene {
  vis: MapVisibility;
  /** Joueur : position, cap du corps, cap du regard ; `hasPlayer` faux si personne n'est incarné. */
  hasPlayer = false;
  px = 0;
  pz = 0;
  pHeading = 0;
  pYaw = 0;
  inVehicle = false;
  speed = 0;

  readonly unitModel = new UnitModel();
  units: MapUnit[] = [];
  /** Incrémenté à chaque rafraîchissement des unités (les listes dérivées se recalculent alors). */
  unitsRevision = 0;

  readonly density: DensityGrid = createDensityGrid();
  /** Image de la densité (1 pixel = 1 cellule), null hors navigateur ou sans foule. */
  densityImage: HTMLCanvasElement | null = null;
  crowdCount = 0;

  /** Image des nuages de gaz et de fumée, et son emprise dans le monde. */
  gasImage: HTMLCanvasElement | null = null;
  gasOx = 0;
  gasOz = 0;
  gasCell = 2;
  gasCols = 0;
  gasRows = 0;
  fires: SceneFire[] = [];

  incidents: Incident[] = [];
  closures: readonly RoadClosure[] = [];
  stations: MetroStation[] = [];
  calls: RescueCall[] = [];
  objectives: Objective[] = [];
  trackedObjective = '';
  /** Parcours déclaré et tête de cortège. */
  route: readonly number[] = [];
  hasHead = false;
  headX = 0;
  headZ = 0;
  headHeading = 0;
  windX = 0;
  windZ = 0;

  private tUnits = -1;
  private tCrowd = -1;
  private tHazard = -1;
  private readonly crowdPts: DensityPoint[] = [];
  private densityData: ImageData | null = null;
  private gasData: ImageData | null = null;
  private gasRev = -1;
  private readonly firePool: SceneFire[] = [];
  private readonly headOut = { x: 0, z: 0 };
  // bornes de travail pour les cellules de gaz
  private gMinX = 0; private gMinZ = 0; private gMaxX = 0; private gMaxZ = 0; private gCount = 0;
  private readonly boundCell = (x: number, z: number): void => {
    if (x < this.gMinX) this.gMinX = x;
    if (x > this.gMaxX) this.gMaxX = x;
    if (z < this.gMinZ) this.gMinZ = z;
    if (z > this.gMaxZ) this.gMaxZ = z;
    this.gCount++;
  };
  private readonly paintCell = (x: number, z: number, gas: number, smoke: number, color: number): void => {
    const data = this.gasData;
    if (!data) return;
    const c = Math.floor((x - this.gasOx) / this.gasCell);
    const r = Math.floor((z - this.gasOz) / this.gasCell);
    if (c < 0 || r < 0 || c >= this.gasCols || r >= this.gasRows) return;
    const o = (r * this.gasCols + c) * 4;
    const px = data.data;
    // gaz lacrymogène : blanc bleuté ; fumée : gris sombre (teinte de la source si connue)
    const g = gas > 1 ? 1 : gas;
    const s = smoke > 1 ? 1 : smoke;
    if (g >= s) {
      px[o] = 214; px[o + 1] = 232; px[o + 2] = 240;
      px[o + 3] = Math.max(px[o + 3]!, (0.18 + 0.6 * g) * 255);
    } else {
      const cr = color !== 0 ? (color >> 16) & 255 : 70;
      const cg = color !== 0 ? (color >> 8) & 255 : 70;
      const cb = color !== 0 ? color & 255 : 76;
      px[o] = cr; px[o + 1] = cg; px[o + 2] = cb;
      px[o + 3] = Math.max(px[o + 3]!, (0.2 + 0.55 * s) * 255);
    }
  };

  constructor(private readonly ctx: GameContext) {
    this.vis = visibilityForContext(ctx);
  }

  /** Force le prochain ensureFresh() à tout recalculer (changement de rôle, nouvelle session). */
  invalidate(): void {
    this.tUnits = -1;
    this.tCrowd = -1;
    this.tHazard = -1;
    this.gasRev = -1;
  }

  /** Met à jour ce qui est périmé. À appeler avant de dessiner ; ne fait rien si tout est frais. */
  ensureFresh(): void {
    const t = now();
    this.refreshPlayer();
    if (this.tUnits < 0 || t - this.tUnits >= UNITS_PERIOD) {
      this.tUnits = t;
      this.refreshEntities();
    }
    if (this.tCrowd < 0 || t - this.tCrowd >= CROWD_PERIOD) {
      this.tCrowd = t;
      this.refreshCrowd();
    }
    if (this.tHazard < 0 || t - this.tHazard >= HAZARD_PERIOD) {
      this.tHazard = t;
      this.refreshHazards();
    }
  }

  /** Position et caps du joueur : lus à chaque appel (quelques champs). */
  refreshPlayer(): void {
    const ctx = this.ctx;
    const st = ctx.player.state;
    const p = st.personId !== 0 ? ctx.people.get(st.personId) : undefined;
    this.pYaw = st.camYaw;
    if (!p) {
      this.hasPlayer = false;
      return;
    }
    this.hasPlayer = true;
    const v = p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) : undefined;
    if (v) {
      this.px = v.x;
      this.pz = v.z;
      this.pHeading = v.heading;
      this.inVehicle = true;
      this.speed = Math.abs(v.speed);
    } else {
      this.px = p.x;
      this.pz = p.z;
      this.pHeading = p.heading;
      this.inVehicle = false;
      this.speed = Math.hypot(p.vx, p.vz);
    }
  }

  private refreshEntities(): void {
    const ctx = this.ctx;
    const vis = (this.vis = visibilityForContext(ctx));
    this.units = this.unitModel.refresh(ctx, vis);
    this.unitsRevision++;

    // incidents
    const incidents = this.incidents;
    incidents.length = 0;
    const incApi = ctx.service<IncidentsApi>(EXT.incidents);
    if (incApi && vis.incidents !== 'none') {
      const list = incApi.list;
      for (let i = 0; i < list.length; i++) {
        const inc = list[i]!;
        if (inc.state === 'resolu' || inc.state === 'echoue') continue;
        const d = this.hasPlayer ? Math.hypot(inc.x - this.px, inc.z - this.pz) : 0;
        if (inc.id === incApi.playerIncidentId || incidentVisible(vis, inc.kind, d)) incidents.push(inc);
      }
    }

    const traffic = ctx.service<TrafficControlApi>(EXT.traffic);
    this.closures = traffic && vis.closures ? traffic.closures : EMPTY_CLOSURES;

    const stations = this.stations;
    stations.length = 0;
    const metro = ctx.service<MetroApi>(EXT.metro);
    if (metro && vis.metro) for (let i = 0; i < metro.stations.length; i++) stations.push(metro.stations[i]!);

    const calls = this.calls;
    calls.length = 0;
    const rescue = ctx.service<RescueApi>(EXT.rescue);
    if (rescue && vis.rescue) {
      for (let i = 0; i < rescue.calls.length; i++) {
        const c = rescue.calls[i]!;
        if (c.state !== 'reparti' && c.state !== 'annule') calls.push(c);
      }
    }

    const objectives = this.objectives;
    objectives.length = 0;
    const objApi = ctx.service<ObjectivesApi>(EXT.objectives);
    this.trackedObjective = objApi ? objApi.tracked : '';
    if (objApi && vis.objectives) {
      for (let i = 0; i < objApi.list.length; i++) {
        const o = objApi.list[i]!;
        if (o.state === 'actif' && o.x !== undefined && o.z !== undefined) objectives.push(o);
      }
    }

    // parcours et tête de cortège
    const dir = ctx.director;
    this.route = vis.route ? dir.route : EMPTY_ROUTE;
    this.hasHead = false;
    if (this.route.length >= 4 && dir.phase !== 'aucune' && dir.phase !== 'terminee') {
      this.headHeading = pointOnPolyline(this.route, dir.headProgress, this.headOut);
      this.headX = this.headOut.x;
      this.headZ = this.headOut.z;
      this.hasHead = true;
    }
    const env = ctx.env.state;
    this.windX = env.windX;
    this.windZ = env.windZ;
  }

  private refreshCrowd(): void {
    const ctx = this.ctx;
    const vis = this.vis;
    const people = ctx.people.list;
    const pts = this.crowdPts as Person[];
    let n = 0;
    for (let i = 0; i < people.length; i++) {
      const p = people[i]!;
      if (p.faction !== 'protest' || p.dormant || p.custody !== 'free') continue;
      pts[n++] = p;
    }
    pts.length = n;
    const near = vis.crowd === 'near';
    aggregateDensity(pts, n, {
      cell: DENSITY_CELL, maxCols: DENSITY_MAX, maxRows: DENSITY_MAX,
      cx: this.px, cz: this.pz, radius: near ? (this.hasPlayer ? vis.nearRadius : 1e-3) : 0,
    }, this.density);
    this.crowdCount = this.density.total;
    this.paintDensity();
  }

  private paintDensity(): void {
    const grid = this.density;
    if (grid.cols === 0 || grid.rows === 0) {
      if (this.densityImage) {
        this.densityImage.width = 1;
        this.densityImage.height = 1;
      }
      return;
    }
    if (!this.densityImage) this.densityImage = makeCanvas();
    const canvas = this.densityImage;
    if (!canvas) return;
    if (canvas.width !== grid.cols || canvas.height !== grid.rows) {
      canvas.width = grid.cols;
      canvas.height = grid.rows;
      this.densityData = null;
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    if (!this.densityData) this.densityData = g.createImageData(grid.cols, grid.rows);
    const data = this.densityData.data;
    const director = this.ctx.director;
    const area = grid.cell * grid.cell;
    const half = grid.cell * 0.5;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const i = r * grid.cols + c;
        const count = grid.counts[i]!;
        if (count <= 0) {
          data[i * 4 + 3] = 0;
          continue;
        }
        const tension = director.tensionAt(grid.ox + c * grid.cell + half, grid.oz + r * grid.cell + half);
        densityColor(count / area, tension, data, i * 4);
      }
    }
    g.putImageData(this.densityData, 0, 0);
  }

  private refreshHazards(): void {
    const field = this.ctx.service<HazardFieldLike>('hazards.field');
    const fires = this.fires;
    if (!field) {
      fires.length = 0;
      this.gasCols = 0;
      this.gasRows = 0;
      return;
    }
    const near = this.vis.hazards === 'near';
    const r2 = this.vis.nearRadius * this.vis.nearRadius;
    fires.length = 0;
    for (let i = 0; i < field.fires.length; i++) {
      const f = field.fires[i]!;
      if (near && (f.x - this.px) * (f.x - this.px) + (f.z - this.pz) * (f.z - this.pz) > r2) continue;
      let slot = this.firePool[fires.length];
      if (!slot) {
        slot = { x: 0, z: 0, radius: 0, intensity: 0 };
        this.firePool.push(slot);
      }
      slot.x = f.x;
      slot.z = f.z;
      slot.radius = f.radius;
      slot.intensity = f.intensity;
      fires.push(slot);
    }
    if (field.revision === this.gasRev && !near) return;
    this.gasRev = field.revision;
    // 1re passe : emprise des cellules actives ; 2e passe : peinture
    this.gMinX = Infinity; this.gMinZ = Infinity; this.gMaxX = -Infinity; this.gMaxZ = -Infinity; this.gCount = 0;
    const radius = near ? this.vis.nearRadius : 0;
    field.forEachActiveCell(this.boundCell, 0.04, this.px, this.pz, radius);
    if (this.gCount === 0) {
      this.gasCols = 0;
      this.gasRows = 0;
      return;
    }
    let cell = field.cellSize > 0 ? field.cellSize : 2;
    let cols = Math.floor((this.gMaxX - this.gMinX) / cell) + 3;
    let rows = Math.floor((this.gMaxZ - this.gMinZ) / cell) + 3;
    while (cols > GAS_MAX || rows > GAS_MAX) {
      cell *= 2;
      cols = Math.floor((this.gMaxX - this.gMinX) / cell) + 3;
      rows = Math.floor((this.gMaxZ - this.gMinZ) / cell) + 3;
    }
    this.gasCell = cell;
    this.gasOx = this.gMinX - cell * 1.5;
    this.gasOz = this.gMinZ - cell * 1.5;
    this.gasCols = cols;
    this.gasRows = rows;
    if (!this.gasImage) this.gasImage = makeCanvas();
    const canvas = this.gasImage;
    if (!canvas) return;
    if (canvas.width !== cols || canvas.height !== rows) {
      canvas.width = cols;
      canvas.height = rows;
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    if (!this.gasData || this.gasData.width !== cols || this.gasData.height !== rows) this.gasData = g.createImageData(cols, rows);
    else this.gasData.data.fill(0);
    field.forEachActiveCell(this.paintCell, 0.04, this.px, this.pz, radius);
    g.putImageData(this.gasData, 0, 0);
  }
}

const EMPTY_CLOSURES: readonly RoadClosure[] = Object.freeze([]);
const EMPTY_ROUTE: readonly number[] = Object.freeze([]);
