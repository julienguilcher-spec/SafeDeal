/* =====================================================================================
 * VILLE — carte 2D vectorielle (service « world.map2d »).
 * -------------------------------------------------------------------------------------
 * Dessine la ville dans un CanvasRenderingContext2D fourni : mini-carte, GPS, carte tactique.
 *   const map = ctx.service<Map2dApi>('world.map2d');
 *   map.draw(ctx2d, centreX, centreZ, mètresParPixel, rotation, { width, height, names: true });
 * `rotation` est le CAP (convention du jeu) placé vers le haut de l'écran : MAP_NORTH_UP (π) pour
 * une carte nord en haut ; le cap du joueur (person.heading, ou camYaw) pour une carte qui tourne
 * avec lui. Le dessin est centré dans le rectangle (0, 0, width, height) du repère courant du
 * contexte : l'appelant garde la main sur la mise à l'échelle (écrans à haute densité) et le découpage.
 *
 * Tracés mis en cache par tuile (Path2D) : un appel ne coûte que quelques remplissages par tuile visible.
 * ===================================================================================== */

import { TILE_SIZE, parseTileKey } from '../mapdata';
import type { Landmark, Manifest, Place, RoadGraph, Tile } from '../mapdata';
import { EdgeIndex } from './edgeindex';

/** Cap à passer pour une carte « nord en haut ». */
export const MAP_NORTH_UP = Math.PI;

export interface Map2dOptions {
  /** Taille de la zone de dessin, dans le repère courant du contexte (défaut : celle du canvas). */
  width?: number;
  height?: number;
  /** Fond : couleur CSS, ou null pour ne rien effacer (défaut : couleur de la palette). */
  background?: string | null;
  /** Palette : 'jour' (défaut) ou 'nuit' (carte tactique sombre). */
  theme?: 'jour' | 'nuit';
  /** Bâtiments (défaut : oui en dessous de 4 m par pixel). */
  buildings?: boolean;
  /** Noms des grands axes et des lieux (défaut : oui). */
  names?: boolean;
  /** Monuments mis en valeur et nommés (défaut : oui). */
  landmarks?: boolean;
  /** Construire tous les tracés manquants dans cet appel (capture, écran fixe) au lieu d'étaler (défaut : non). */
  complete?: boolean;
}

export interface Map2dApi {
  draw(ctx2d: CanvasRenderingContext2D, centerX: number, centerZ: number, metersPerPixel: number, rotation?: number, options?: Map2dOptions): void;
  /** Position à l'écran d'un point du monde, pour y poser ses propres marqueurs. */
  worldToScreen(x: number, z: number, centerX: number, centerZ: number, metersPerPixel: number, rotation: number, width: number, height: number, out: { x: number; y: number }): { x: number; y: number };
  /** Point du monde sous une position d'écran (clic sur la carte). */
  screenToWorld(sx: number, sy: number, centerX: number, centerZ: number, metersPerPixel: number, rotation: number, width: number, height: number, out: { x: number; z: number }): { x: number; z: number };
  /** Oublie les tracés en cache (changement de carte). */
  invalidate(): void;
}

/** Ce que la carte lit : les données décodées publiées par le monde (service « world.data »). */
export interface Map2dSource {
  readonly manifest: Manifest;
  readonly roadGraph: RoadGraph;
  readonly places: readonly Place[];
  readonly landmarks: readonly Landmark[];
  tile(tx: number, tz: number): Tile | null;
  loadedKeys(): readonly string[];
}

interface Palette {
  land: string; green: string; grass: string; plaza: string; road: string; roadMajor: string; roadCasing: string; sidewalk: string; water: string;
  building: string; buildingEdge: string; landmark: string; label: string; halo: string; path: string;
}

const DAY: Palette = {
  land: '#e8e4dc', green: '#cfe3bd', grass: '#bcd9a6', plaza: '#f2efe7', road: '#ffffff', roadMajor: '#fdeeb5', roadCasing: '#c9c3b6',
  sidewalk: '#dcd8cf', water: '#a8cbe9', building: '#d3ccbf', buildingEdge: '#b3ab9c', landmark: '#c79f7a', label: '#3b3a36', halo: 'rgba(255,255,255,0.85)',
  path: '#f6f1e2',
};
const NIGHT: Palette = {
  land: '#1a1f26', green: '#1f3327', grass: '#24402c', plaza: '#262c35', road: '#4a5361', roadMajor: '#6d6a4d', roadCasing: '#11151a',
  sidewalk: '#222830', water: '#16304f', building: '#2b323c', buildingEdge: '#3a424e', landmark: '#7a5f45', label: '#d7dde6', halo: 'rgba(10,12,16,0.85)',
  path: '#333a45',
};

interface TilePaths {
  water: Path2D; green: Path2D; grass: Path2D; plaza: Path2D; road: Path2D; sidewalk: Path2D; buildings: Path2D; landmarks: Path2D;
}

interface RoadPaths { major: Path2D; minor: Path2D; path: Path2D; majorWidth: number; minorWidth: number }

function ringPath(path: Path2D, ring: ArrayLike<number>): void {
  if (ring.length < 6) return;
  path.moveTo(ring[0], ring[1]);
  for (let i = 2; i + 1 < ring.length; i += 2) path.lineTo(ring[i], ring[i + 1]);
  path.closePath();
}

function buildTilePaths(tile: Tile): TilePaths {
  const p: TilePaths = {
    water: new Path2D(), green: new Path2D(), grass: new Path2D(), plaza: new Path2D(), road: new Path2D(), sidewalk: new Path2D(),
    buildings: new Path2D(), landmarks: new Path2D(),
  };
  for (const s of tile.surfaces) {
    let target: Path2D | null = null;
    switch (s.kind) {
      case 'water': target = p.water; break;
      case 'park': case 'garden': case 'cemetery': target = p.green; break;
      case 'grass': case 'sports': target = p.grass; break;
      case 'plaza': case 'pedestrian': target = p.plaza; break;
      case 'road': case 'parking': target = p.road; break;
      case 'sidewalk': case 'median': target = p.sidewalk; break;
      default: target = null;
    }
    if (target === null) continue;
    ringPath(target, s.outer);
    for (const h of s.holes) ringPath(target, h);
  }
  for (const b of tile.buildings) {
    const target = b.landmarkKey !== '' ? p.landmarks : p.buildings;
    ringPath(target, b.outer);
    for (const h of b.holes) ringPath(target, h);
  }
  return p;
}

const tmp = { x: 0, y: 0 };

export class Map2d implements Map2dApi {
  private readonly source: () => Map2dSource | null;
  private readonly tiles = new Map<string, TilePaths>();
  private readonly roads = new Map<string, RoadPaths>();
  private edgeIndex: EdgeIndex | null = null;
  private indexedGraph: RoadGraph | null = null;
  private readonly edgeScratch: number[] = [];
  private readonly labelBest = new Map<string, { edge: number; score: number }>();

  constructor(source: () => Map2dSource | null) {
    this.source = source;
  }

  invalidate(): void {
    this.tiles.clear();
    this.roads.clear();
    this.edgeIndex = null;
    this.indexedGraph = null;
  }

  /** Une tuile vient d'être déchargée : son tracé est oublié. */
  forgetTile(tx: number, tz: number): void {
    this.tiles.delete(`${tx}_${tz}`);
  }

  worldToScreen(x: number, z: number, cx: number, cz: number, mpp: number, rotation: number, width: number, height: number, out: { x: number; y: number }): { x: number; y: number } {
    const r = Number.isFinite(rotation) ? rotation : MAP_NORTH_UP;
    const s = Math.sin(r), c = Math.cos(r);
    const dx = x - cx, dz = z - cz;
    out.x = width / 2 + (-dx * c + dz * s) / mpp;
    out.y = height / 2 - (dx * s + dz * c) / mpp;
    return out;
  }

  screenToWorld(sx: number, sy: number, cx: number, cz: number, mpp: number, rotation: number, width: number, height: number, out: { x: number; z: number }): { x: number; z: number } {
    const r = Number.isFinite(rotation) ? rotation : MAP_NORTH_UP;
    const s = Math.sin(r), c = Math.cos(r);
    const right = (sx - width / 2) * mpp, up = (height / 2 - sy) * mpp;
    out.x = cx - right * c + up * s;
    out.z = cz + right * s + up * c;
    return out;
  }

  private graphIndex(graph: RoadGraph): EdgeIndex {
    if (this.edgeIndex === null || this.indexedGraph !== graph) {
      this.edgeIndex = new EdgeIndex(graph);
      this.indexedGraph = graph;
      this.roads.clear();
    }
    return this.edgeIndex;
  }

  private roadPaths(graph: RoadGraph, tx: number, tz: number): RoadPaths {
    const key = `${tx}_${tz}`;
    let rp = this.roads.get(key);
    if (rp !== undefined) return rp;
    rp = { major: new Path2D(), minor: new Path2D(), path: new Path2D(), majorWidth: 14, minorWidth: 7 };
    const ids = this.graphIndex(graph).query(tx * TILE_SIZE, tz * TILE_SIZE, (tx + 1) * TILE_SIZE, (tz + 1) * TILE_SIZE, this.edgeScratch);
    let wMajor = 0, nMajor = 0, wMinor = 0, nMinor = 0;
    for (let k = 0; k < ids.length; k++) {
      const ed = graph.edges[ids[k]];
      if (ed.tunnel) continue;
      const pts = ed.points;
      // une arête est tracée par la tuile qui contient son premier point (pas de doublon)
      if (Math.floor(pts[0] / TILE_SIZE) !== tx || Math.floor(pts[1] / TILE_SIZE) !== tz) continue;
      let target: Path2D;
      if (ed.pedestrianOnly || ed.roadClass === 'footway' || ed.roadClass === 'pedestrian') target = rp.path;
      else if (ed.roadClass === 'primary' || ed.roadClass === 'secondary' || ed.roadClass === 'motorway') {
        target = rp.major;
        wMajor += ed.width * ed.length;
        nMajor += ed.length;
      } else {
        target = rp.minor;
        wMinor += ed.width * ed.length;
        nMinor += ed.length;
      }
      target.moveTo(pts[0], pts[1]);
      for (let i = 2; i + 1 < pts.length; i += 2) target.lineTo(pts[i], pts[i + 1]);
    }
    if (nMajor > 0) rp.majorWidth = wMajor / nMajor;
    if (nMinor > 0) rp.minorWidth = wMinor / nMinor;
    this.roads.set(key, rp);
    return rp;
  }

  draw(g: CanvasRenderingContext2D, cx: number, cz: number, mpp: number, rotation: number = MAP_NORTH_UP, options: Map2dOptions = {}): void {
    const data = this.source();
    const width = options.width ?? g.canvas.width, height = options.height ?? g.canvas.height;
    const pal = options.theme === 'nuit' ? NIGHT : DAY;
    if (!(mpp > 0) || !Number.isFinite(cx) || !Number.isFinite(cz)) return;
    const rot = Number.isFinite(rotation) ? rotation : MAP_NORTH_UP;
    g.save();
    g.beginPath();
    g.rect(0, 0, width, height);
    g.clip();
    if (options.background !== null) {
      g.fillStyle = options.background ?? pal.land;
      g.fillRect(0, 0, width, height);
    }
    if (data === null) {
      g.restore();
      return;
    }
    const s = Math.sin(rot), c = Math.cos(rot);
    // monde → écran : x' = a·x + c2·z + e ; y' = b·x + d·z + f
    const a = -c / mpp, c2 = s / mpp, b = -s / mpp, d = -c / mpp;
    const e = width / 2 - (a * cx + c2 * cz), f = height / 2 - (b * cx + d * cz);
    const radius = (Math.hypot(width, height) / 2) * mpp;
    const tx0 = Math.floor((cx - radius) / TILE_SIZE), tx1 = Math.floor((cx + radius) / TILE_SIZE);
    const tz0 = Math.floor((cz - radius) / TILE_SIZE), tz1 = Math.floor((cz + radius) / TILE_SIZE);
    const showBuildings = options.buildings ?? mpp < 4;
    const graph = data.roadGraph;
    let budget = options.complete ? 1e9 : 3;

    g.save();
    g.transform(a, b, c2, d, e, f);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // 1. Rues du graphe (présentes partout, même là où les tuiles ne sont pas chargées).
    for (let pass = 0; pass < 2; pass++) {
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const rp = this.roadPaths(graph, tx, tz);
          if (pass === 0) {
            g.strokeStyle = pal.roadCasing;
            g.lineWidth = rp.minorWidth + 2.2 * Math.max(1, mpp);
            g.stroke(rp.minor);
            g.lineWidth = rp.majorWidth + 2.2 * Math.max(1, mpp);
            g.stroke(rp.major);
          } else {
            if (mpp < 5) {
              g.strokeStyle = pal.path;
              g.lineWidth = Math.max(2.5, 1.2 * mpp);
              g.stroke(rp.path);
            }
            g.strokeStyle = pal.road;
            g.lineWidth = Math.max(rp.minorWidth, 1.3 * mpp);
            g.stroke(rp.minor);
            g.strokeStyle = pal.roadMajor;
            g.lineWidth = Math.max(rp.majorWidth, 2 * mpp);
            g.stroke(rp.major);
          }
        }
      }
    }
    // 2. Surfaces et bâtiments des tuiles chargées.
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${tx}_${tz}`;
        let tp = this.tiles.get(key);
        if (tp === undefined) {
          const tile = data.tile(tx, tz);
          if (tile === null || budget <= 0) continue;
          budget--;
          tp = buildTilePaths(tile);
          this.tiles.set(key, tp);
        }
        g.fillStyle = pal.green;
        g.fill(tp.green, 'evenodd');
        g.fillStyle = pal.plaza;
        g.fill(tp.plaza, 'evenodd');
        g.fillStyle = pal.grass;
        g.fill(tp.grass, 'evenodd');
        g.fillStyle = pal.water;
        g.fill(tp.water, 'evenodd');
        if (mpp < 3) {
          g.fillStyle = pal.sidewalk;
          g.fill(tp.sidewalk, 'evenodd');
        }
        g.fillStyle = pal.road;
        g.fill(tp.road, 'evenodd');
        if (showBuildings) {
          g.fillStyle = pal.building;
          g.fill(tp.buildings, 'evenodd');
          if (mpp < 1.2) {
            g.strokeStyle = pal.buildingEdge;
            g.lineWidth = 0.6 * Math.max(0.5, mpp);
            g.stroke(tp.buildings);
          }
        }
        if (options.landmarks !== false) {
          g.fillStyle = pal.landmark;
          g.fill(tp.landmarks, 'evenodd');
        }
      }
    }
    // Les axes majeurs restent lisibles par-dessus les emprises de chaussée blanches.
    if (mpp >= 1.5) {
      g.strokeStyle = pal.roadMajor;
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const rp = this.roadPaths(graph, tx, tz);
          g.lineWidth = Math.max(rp.majorWidth * 0.7, 1.6 * mpp);
          g.stroke(rp.major);
        }
      }
    }
    // Monuments sans bâtiment (colonnes, statues) : leur emprise.
    if (options.landmarks !== false) {
      g.fillStyle = pal.landmark;
      for (const lm of data.landmarks) {
        if (Math.abs(lm.x - cx) > radius + 200 || Math.abs(lm.z - cz) > radius + 200 || lm.footprint.length < 6) continue;
        g.beginPath();
        g.moveTo(lm.footprint[0], lm.footprint[1]);
        for (let i = 2; i + 1 < lm.footprint.length; i += 2) g.lineTo(lm.footprint[i], lm.footprint[i + 1]);
        g.closePath();
        g.fill();
      }
    }
    g.restore();

    // 3. Noms (en pixels d'écran, toujours lisibles à l'endroit).
    if (options.names !== false) this.drawLabels(g, data, graph, cx, cz, mpp, rot, width, height, radius, pal, options.landmarks !== false);
    g.restore();
  }

  private drawLabels(
    g: CanvasRenderingContext2D, data: Map2dSource, graph: RoadGraph, cx: number, cz: number, mpp: number, rot: number, width: number, height: number,
    radius: number, pal: Palette, landmarks: boolean,
  ): void {
    const size = Math.max(9, Math.min(13, Math.round(Math.min(width, height) / 38)));
    g.font = `600 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 3;
    g.strokeStyle = pal.halo;
    g.fillStyle = pal.label;
    // Noms de voies : pour chaque nom, l'arête visible la plus longue, la plus proche du centre.
    const best = this.labelBest;
    best.clear();
    const ids = this.graphIndex(graph).query(cx - radius, cz - radius, cx + radius, cz + radius, this.edgeScratch);
    for (let k = 0; k < ids.length; k++) {
      const ed = graph.edges[ids[k]];
      if (ed.name === '' || ed.tunnel) continue;
      const major = ed.roadClass === 'primary' || ed.roadClass === 'secondary' || ed.roadClass === 'motorway';
      if (!major && (mpp > 1.6 || ed.roadClass === 'footway' || ed.roadClass === 'service')) continue;
      if (major && mpp > 12) continue;
      const pts = ed.points, mid = (pts.length >> 2) * 2;
      const mx = (pts[Math.max(0, mid - 2)] + pts[Math.min(pts.length - 2, mid)]) / 2, mz = (pts[Math.max(1, mid - 1)] + pts[Math.min(pts.length - 1, mid + 1)]) / 2;
      this.worldToScreen(mx, mz, cx, cz, mpp, rot, width, height, tmp);
      if (tmp.x < 30 || tmp.y < 12 || tmp.x > width - 30 || tmp.y > height - 12) continue;
      const pxLen = ed.length / mpp;
      const off = Math.hypot(tmp.x - width / 2, tmp.y - height / 2);
      const score = pxLen * (major ? 1.6 : 1) - off * 0.35;
      const cur = best.get(ed.name);
      if (cur === undefined || score > cur.score) best.set(ed.name, { edge: ids[k], score });
    }
    const maxLabels = Math.max(4, Math.round((width * height) / 26000));
    const chosen = Array.from(best.entries()).sort((p, q) => q[1].score - p[1].score).slice(0, maxLabels);
    for (const [name, pick] of chosen) {
      const ed = graph.edges[pick.edge];
      const textW = g.measureText(name).width;
      if (ed.length / mpp < textW * 0.6 && chosen.length > 4) continue;
      const pts = ed.points, mid = (pts.length >> 2) * 2;
      const i0 = Math.max(0, mid - 2), i1 = Math.min(pts.length - 2, mid);
      const ax = pts[i0], az = pts[i0 + 1], bx = i1 === i0 ? pts[i0 + 2] : pts[i1], bz = i1 === i0 ? pts[i0 + 3] : pts[i1 + 1];
      this.worldToScreen(ax, az, cx, cz, mpp, rot, width, height, tmp);
      const sx0 = tmp.x, sy0 = tmp.y;
      this.worldToScreen(bx, bz, cx, cz, mpp, rot, width, height, tmp);
      let ang = Math.atan2(tmp.y - sy0, tmp.x - sx0);
      if (ang > Math.PI / 2) ang -= Math.PI;
      else if (ang < -Math.PI / 2) ang += Math.PI;
      g.save();
      g.translate((sx0 + tmp.x) / 2, (sy0 + tmp.y) / 2);
      g.rotate(ang);
      g.strokeText(name, 0, 0);
      g.fillText(name, 0, 0);
      g.restore();
    }
    // Monuments, puis lieux majeurs.
    if (landmarks && mpp <= 8) {
      g.font = `700 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
      for (const lm of data.landmarks) {
        if (Math.abs(lm.x - cx) > radius || Math.abs(lm.z - cz) > radius) continue;
        this.worldToScreen(lm.x, lm.z, cx, cz, mpp, rot, width, height, tmp);
        if (tmp.x < 20 || tmp.y < 10 || tmp.x > width - 20 || tmp.y > height - 10) continue;
        g.strokeText(lm.name, tmp.x, tmp.y - size);
        g.fillText(lm.name, tmp.x, tmp.y - size);
      }
    }
    if (mpp > 2.5) {
      g.font = `italic 600 ${size + 1}px system-ui, "Segoe UI", Arial, sans-serif`;
      const need = mpp > 9 ? 3 : 2;
      for (const p of data.places) {
        if (p.importance < need || (p.kind !== 'square' && p.kind !== 'district' && p.kind !== 'garden')) continue;
        if (Math.abs(p.x - cx) > radius || Math.abs(p.z - cz) > radius) continue;
        this.worldToScreen(p.x, p.z, cx, cz, mpp, rot, width, height, tmp);
        if (tmp.x < 30 || tmp.y < 10 || tmp.x > width - 30 || tmp.y > height - 10) continue;
        g.strokeText(p.name, tmp.x, tmp.y);
        g.fillText(p.name, tmp.x, tmp.y);
      }
    }
  }
}

/** Clés « tx_tz » → indices (utilitaire pour les appelants qui parcourent world.data.loadedKeys()). */
export function tileOfKey(key: string): { tx: number; tz: number } {
  return parseTileKey(key);
}
