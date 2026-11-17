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
import { barragesApi } from './barrages';
import type { SceneBarrage, SceneCrowdExits, SceneExit } from './barrages';
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

/** Foyer secondaire (service 'crowd.foyers', module de foule) tel que la carte l'affiche. */
export interface SceneFoyer {
  id: number;
  kind: 'rassemblement' | 'casseurs' | 'blocage' | string;
  /** Lieu (« place de l'Opéra ») et libellé complet. */
  name: string;
  label: string;
  x: number;
  z: number;
  people: number;
  tension: number;
  kettled: boolean;
}

/** Manifestation déclarée supplémentaire (service 'crowd.manifs') telle que la carte l'affiche. */
export interface SceneManif {
  id: number;
  label: string;
  causeLabel: string;
  from: string;
  to: string;
  phase: string;
  people: number;
  declared: number;
  x: number;
  z: number;
  headX: number;
  headZ: number;
  headHeading: number;
  /** Parcours courant (déclaré, ou détour pris). */
  route: readonly number[];
  tension: number;
  kettled: boolean;
  enclosed: boolean;
  detours: number;
  /** Compagnie chargée de la manifestation (nom, '' si aucune). */
  company: string;
}

interface ManifsLike {
  readonly list: readonly {
    id: number; label: string; causeLabel: string; from: string; to: string; phase: string; people: number; declared: number; x: number; z: number;
    headX: number; headZ: number; headHeading: number; route: readonly number[]; tension: number; kettled: boolean; enclosed: boolean; detours: number;
    companyId: number;
  }[];
}

/** Lecture du service 'crowd.foyers' (forme attendue, sans dépendre du module de foule). */
interface FoyersLike {
  readonly list: readonly { id: number; kind: string; name: string; label: string; x: number; z: number; people: number; tension: number; kettled: boolean }[];
}

const UNITS_PERIOD = 0.2;
const CROWD_PERIOD = 0.5;
const HAZARD_PERIOD = 0.5;
/** Issues autour des foules : interrogées deux fois par seconde (calcul de graphe côté simulation). */
const EXITS_PERIOD = 0.5;
/** Rayon de recherche des issues autour d'un cortège (m) ; marge d'appartenance d'une foule à une nasse (m). */
const MARCH_EXIT_RADIUS = 90;
const KETTLE_MARGIN = 20;

/** Rayon de recherche des issues autour d'un foyer (m) : croît avec l'effectif. */
export function foyerExitRadius(people: number): number {
  return Math.max(35, Math.min(120, 25 + Math.sqrt(Math.max(0, people)) * 2.5));
}
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

/** Itinéraire d'une unité vers le point de son ordre (polyligne monde [x0, z0, …] et longueur en m). */
export interface OrderRoute {
  path: number[];
  length: number;
  issuedAt: number;
  tx: number;
  tz: number;
  fromX: number;
  fromZ: number;
}

/** Itinéraires : nombre de calculs par rafraîchissement, distance minimale, avance qui déclenche un nouveau calcul (m). */
const ROUTE_BUDGET = 3;
const ROUTE_MIN = 15;
const ROUTE_REPLAN = 30;

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
  /**
   * Itinéraire réellement suivi par chaque unité policière en mouvement vers le point de son ordre (par les rues, en
   * contournant grilles et murs), clé = identifiant d'unité. Recalculé quand l'ordre change ou que l'unité a avancé.
   */
  readonly routes = new Map<number, OrderRoute>();
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
  /**
   * Foyers secondaires en cours (rassemblements sauvages, casseurs, blocages) : tous pour le commandement (CENTRAL les
   * annonce), ceux qu'on voit autour de soi pour les autres rôles.
   */
  foyers: SceneFoyer[] = [];
  /** Manifestations déclarées supplémentaires (en cours) : parcours, tête, effectif, phase. */
  manifs: SceneManif[] = [];
  closures: readonly RoadClosure[] = [];
  /**
   * Barrages de rue tenus par la police (service 'police.barrages') : tous pour les rôles de police, ceux qu'on voit
   * autour de soi pour les autres. Vide sans le service.
   */
  barrages: SceneBarrage[] = [];
  /** Issues autour de chaque foule (nasses, foyers, cortèges) : commandement seulement. Vide sans le service. */
  crowdExits: SceneCrowdExits[] = [];
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
  private tExits = -1;
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
    this.tExits = -1;
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
    if (this.tExits < 0 || t - this.tExits >= EXITS_PERIOD) {
      this.tExits = t;
      this.refreshExits();
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

  /** Itinéraires des ordres (au plus quelques calculs par rafraîchissement : le reste attend le suivant). */
  private refreshRoutes(): void {
    const ctx = this.ctx;
    const routes = this.routes;
    let budget = ROUTE_BUDGET;
    const seen = this.routeSeen;
    seen.clear();
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      const o = u.order;
      if (u.squadId <= 0 || u.faction !== 'police' || !o || u.total === 0) continue;
      if (o.type === 'libre' || o.type === 'suivre' || o.type === 'cesser') continue;
      if (u.orderDist < ROUTE_MIN) continue;
      seen.add(u.squadId);
      const r = routes.get(u.squadId);
      if (r && r.issuedAt === o.issuedAt && r.tx === o.x && r.tz === o.z && Math.hypot(u.x - r.fromX, u.z - r.fromZ) < ROUTE_REPLAN) continue;
      if (budget <= 0) continue;
      budget--;
      const path = r ? r.path : [];
      path.length = 0;
      let ok = false;
      try { ok = ctx.world.findPath(u.x, u.z, o.x, o.z, u.embarked ? 'vehicle' : 'foot', path) && path.length >= 4; } catch { ok = false; }
      const route: OrderRoute = r ?? { path, length: 0, issuedAt: 0, tx: 0, tz: 0, fromX: 0, fromZ: 0 };
      route.issuedAt = o.issuedAt;
      route.tx = o.x;
      route.tz = o.z;
      route.fromX = u.x;
      route.fromZ = u.z;
      if (!ok) path.length = 0;
      let len = 0;
      for (let k = 2; k < path.length; k += 2) len += Math.hypot(path[k]! - path[k - 2]!, path[k + 1]! - path[k - 1]!);
      route.length = path.length >= 4 ? len : u.orderDist;
      routes.set(u.squadId, route);
    }
    for (const id of routes.keys()) if (!seen.has(id)) routes.delete(id);
  }

  private readonly routeSeen = new Set<number>();

  private refreshEntities(): void {
    const ctx = this.ctx;
    const vis = (this.vis = visibilityForContext(ctx));
    this.units = this.unitModel.refresh(ctx, vis);
    this.unitsRevision++;
    this.refreshRoutes();

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

    this.refreshFoyers();
    this.refreshManifs();

    const traffic = ctx.service<TrafficControlApi>(EXT.traffic);
    this.closures = traffic && vis.closures ? traffic.closures : EMPTY_CLOSURES;
    this.refreshBarrages();

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

  /** Barrages de rue (copie : le service peut réutiliser ses objets) avec l'indicatif de l'unité qui les tient. */
  private refreshBarrages(): void {
    const out = this.barrages;
    out.length = 0;
    const api = barragesApi((name) => this.ctx.service(name));
    if (!api) return;
    const vis = this.vis;
    const r2 = vis.nearRadius * vis.nearRadius;
    for (let i = 0; i < api.list.length; i++) {
      const b = api.list[i]!;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
      if (!vis.police && (!this.hasPlayer || (b.x - this.px) * (b.x - this.px) + (b.z - this.pz) * (b.z - this.pz) > r2)) continue;
      const sq = b.squadId > 0 ? this.ctx.squads.get(b.squadId) : undefined;
      out.push({
        squadId: b.squadId, x: b.x, z: b.z, heading: Number.isFinite(b.heading) ? b.heading : 0,
        width: Number.isFinite(b.width) && b.width > 0 ? b.width : 0, covered: b.covered, state: b.state, street: b.street ?? '',
        edgeId: b.edgeId, mode: b.mode, passersby: b.passersby === true, callsign: sq && vis.police ? sq.name : '',
      });
    }
  }

  /**
   * Issues autour des foules (commandement) : celles de chaque nasse détectée par la simulation, puis celles autour
   * des foyers, des cortèges et de la tête du cortège principal qui ne sont pas déjà dans une nasse.
   */
  private refreshExits(): void {
    const out = this.crowdExits;
    out.length = 0;
    if (!this.vis.police) return;
    const api = barragesApi((name) => this.ctx.service(name));
    if (!api) return;
    const kettles = api.kettles;
    for (let i = 0; i < kettles.length; i++) {
      const k = kettles[i]!;
      out.push({
        key: 'k' + k.id, place: k.place ?? '', x: k.x, z: k.z, radius: k.radius, people: k.inside, exits: copyExits(k.exits),
        kettleId: k.id, closed: k.closed,
      });
    }
    const inKettle = (x: number, z: number): boolean => {
      for (let i = 0; i < kettles.length; i++) {
        const k = kettles[i]!;
        if (Math.hypot(x - k.x, z - k.z) <= k.radius + KETTLE_MARGIN) return true;
      }
      return false;
    };
    const around = (key: string, place: string, x: number, z: number, r: number, people: number): void => {
      if (!Number.isFinite(x) || !Number.isFinite(z) || inKettle(x, z)) return;
      let exits: readonly SceneExit[] = [];
      try { exits = api.exitsAround(x, z, r); } catch { exits = []; }
      out.push({ key, place, x, z, radius: r, people, exits: copyExits(exits), kettleId: 0, closed: false });
    };
    for (let i = 0; i < this.foyers.length; i++) {
      const f = this.foyers[i]!;
      around('f' + f.id, f.name, f.x, f.z, foyerExitRadius(f.people), f.people);
    }
    for (let i = 0; i < this.manifs.length; i++) {
      const m = this.manifs[i]!;
      around('m' + m.id, m.label, m.x, m.z, MARCH_EXIT_RADIUS, m.people);
    }
    if (this.hasHead) {
      const sector = this.ctx.world.sectorName(this.headX, this.headZ);
      around('c', sector && sector !== 'secteur inconnu' ? sector : 'tête du cortège', this.headX, this.headZ, MARCH_EXIT_RADIUS, this.crowdCount);
    }
  }

  private readonly foyerPool: SceneFoyer[] = [];

  private refreshFoyers(): void {
    const foyers = this.foyers;
    foyers.length = 0;
    const api = this.ctx.service<FoyersLike>('crowd.foyers');
    if (!api) return;
    const vis = this.vis;
    const r2 = vis.nearRadius * vis.nearRadius;
    for (let i = 0; i < api.list.length; i++) {
      const f = api.list[i]!;
      if (f.people <= 0) continue;
      // les forces de l'ordre les connaissent tous (annonces de CENTRAL, comptes rendus des patrouilles), même à pied
      if (!vis.police && vis.crowd !== 'full' && (!this.hasPlayer || (f.x - this.px) * (f.x - this.px) + (f.z - this.pz) * (f.z - this.pz) > r2)) continue;
      let slot = this.foyerPool[foyers.length];
      if (!slot) {
        slot = { id: 0, kind: '', name: '', label: '', x: 0, z: 0, people: 0, tension: 0, kettled: false };
        this.foyerPool.push(slot);
      }
      slot.id = f.id;
      slot.kind = f.kind;
      slot.name = f.name;
      slot.label = f.label;
      slot.x = f.x;
      slot.z = f.z;
      slot.people = f.people;
      slot.tension = f.tension;
      slot.kettled = f.kettled;
      foyers.push(slot);
    }
  }

  private readonly manifPool: SceneManif[] = [];

  private refreshManifs(): void {
    const out = this.manifs;
    out.length = 0;
    const api = this.ctx.service<ManifsLike>('crowd.manifs');
    if (!api) return;
    const vis = this.vis;
    const r2 = vis.nearRadius * vis.nearRadius;
    for (let i = 0; i < api.list.length; i++) {
      const m = api.list[i]!;
      if (m.phase === 'terminee') continue;
      // déclarées en préfecture : connues des forces de l'ordre et des rôles qui voient le parcours ; sinon, vues de près
      if (!vis.police && !vis.route && vis.crowd !== 'full' && (!this.hasPlayer || (m.x - this.px) * (m.x - this.px) + (m.z - this.pz) * (m.z - this.pz) > r2)) continue;
      let slot = this.manifPool[out.length];
      if (!slot) {
        slot = {
          id: 0, label: '', causeLabel: '', from: '', to: '', phase: '', people: 0, declared: 0, x: 0, z: 0, headX: 0, headZ: 0, headHeading: 0,
          route: EMPTY_ROUTE, tension: 0, kettled: false, enclosed: false, detours: 0, company: '',
        };
        this.manifPool.push(slot);
      }
      slot.id = m.id;
      slot.label = m.label;
      slot.causeLabel = m.causeLabel;
      slot.from = m.from;
      slot.to = m.to;
      slot.phase = m.phase;
      slot.people = m.people;
      slot.declared = m.declared;
      slot.x = m.x;
      slot.z = m.z;
      slot.headX = m.headX;
      slot.headZ = m.headZ;
      slot.headHeading = m.headHeading;
      slot.route = vis.route || vis.police ? m.route : EMPTY_ROUTE;
      slot.tension = m.tension;
      slot.kettled = m.kettled;
      slot.enclosed = m.enclosed;
      slot.detours = m.detours;
      const sq = m.companyId !== 0 ? this.ctx.squads.get(m.companyId) : undefined;
      slot.company = sq && vis.police ? sq.name : '';
      out.push(slot);
    }
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

function copyExits(list: readonly SceneExit[]): SceneExit[] {
  const out: SceneExit[] = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    if (!Number.isFinite(e.x) || !Number.isFinite(e.z)) continue;
    out.push({
      x: e.x, z: e.z, heading: Number.isFinite(e.heading) ? e.heading : 0, width: Number.isFinite(e.width) ? e.width : 0,
      street: e.street ?? '', edgeId: e.edgeId, held: !!e.held, squadId: e.squadId | 0, mode: e.mode,
    });
  }
  return out;
}
const EMPTY_ROUTE: readonly number[] = Object.freeze([]);
