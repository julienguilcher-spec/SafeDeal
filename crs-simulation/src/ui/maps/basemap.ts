/* =====================================================================================
 * Fond de plan de repli : dessiné à partir de ctx.world seulement (graphe routier avec largeurs et
 * noms, monuments, lieux, occupation du sol échantillonnée). Sert quand le service 'world.map2d'
 * n'existe pas ; implémente la même interface (Map2dService).
 *
 * Coût : un index spatial des arêtes est construit une fois (cases de 256 m) ; un dessin ne visite
 * que les arêtes de la zone, filtrées par classe selon l'échelle. Le résultat est destiné à être mis
 * en cache par l'appelant (BaseLayer) : draw() n'est pas prévu pour être appelé à chaque image.
 * ===================================================================================== */

import type { GameContext, RoadClass, RoadEdgeInfo, WorldQuery } from '@/core/contracts';
import type { Map2dOptions, Map2dService } from './api';
import { LabelPlacer, drawPlaceLabels, drawStreetLabels } from './basemap-labels';
import { SurfaceTiles } from './surfaces';

/** Palette « salle de commandement » : bleu nuit, voies plus claires que les îlots. */
export const MAP_COLORS = {
  ground: '#0f1829',
  outside: '#090e19',
  casing: '#0a101d',
  bridgeCasing: '#8fa0c6',
  landmark: '#2c3859',
  landmarkEdge: '#b9a467',
} as const;

interface RoadStyle { rank: number; color: string; minPx: number; maxMpp: number; dashed?: boolean }

const ROAD_STYLES: Readonly<Record<RoadClass, RoadStyle>> = {
  motorway: { rank: 7, color: '#8394bd', minPx: 2.6, maxMpp: 99 },
  primary: { rank: 6, color: '#7182ab', minPx: 2.2, maxMpp: 99 },
  secondary: { rank: 5, color: '#5d6e97', minPx: 1.7, maxMpp: 99 },
  tertiary: { rank: 4, color: '#4e5d86', minPx: 1.3, maxMpp: 9 },
  residential: { rank: 3, color: '#424f76', minPx: 1.0, maxMpp: 5.5 },
  pedestrian: { rank: 2, color: '#39466a', minPx: 0.8, maxMpp: 2.6 },
  service: { rank: 1, color: '#323e5e', minPx: 0.7, maxMpp: 2.6 },
  footway: { rank: 0, color: '#3c4a70', minPx: 0.6, maxMpp: 1.1, dashed: true },
};
const RANK_COUNT = 8;
const STYLE_BY_RANK: RoadStyle[] = [];
for (const k of Object.keys(ROAD_STYLES) as RoadClass[]) STYLE_BY_RANK[ROAD_STYLES[k].rank] = ROAD_STYLES[k];

/** Côté d'une case de l'index des arêtes (m). */
const BUCKET = 256;

function bucketKey(bx: number, bz: number): number {
  return (bx + 2048) * 4096 + (bz + 2048);
}

export class FallbackBasemap implements Map2dService {
  readonly surfaces: SurfaceTiles;
  private indexedWorld: WorldQuery | null = null;
  private indexedEdges = -1;
  private readonly buckets = new Map<number, number[]>();
  private rank = new Uint8Array(0);
  private stamps = new Uint32Array(0);
  private stamp = 0;
  private ownRevision = 0;
  private surfaceRevision = 0;
  private readonly byRank: number[][] = [];
  private readonly bridges: number[] = [];
  private readonly placer = new LabelPlacer();

  constructor(private readonly ctx: GameContext) {
    this.surfaces = new SurfaceTiles(ctx);
    for (let i = 0; i < RANK_COUNT; i++) this.byRank.push([]);
    // changement de jeu de données (Paris ↔ quartier d'essai) : tout est à refaire
    ctx.events.onAny('world:source', () => {
      this.indexedEdges = -1;
      this.surfaces.clear();
      this.ownRevision++;
    });
  }

  get revision(): number {
    return this.ownRevision + this.surfaceRevision;
  }

  /** Le contenu a pu changer (tuile chargée) : les caches se redessinent. */
  touch(): void {
    this.ownRevision++;
  }

  /** Construit, s'il y en a en attente, une image d'occupation du sol (à appeler de temps en temps). */
  pump(): boolean {
    const built = this.surfaces.pump();
    // les caches ne se redessinent qu'une fois la file vidée (ou toutes les quatre images construites)
    if (this.surfaces.revision !== this.surfaceRevision && (!this.surfaces.pending || this.surfaces.revision - this.surfaceRevision >= 4)) {
      this.surfaceRevision = this.surfaces.revision;
    }
    return built;
  }

  /** Forme tolérée par la page d'accueil : plan centré sur (x, z), `radius` mètres de part et d'autre. */
  render(canvas: HTMLCanvasElement, view: { x: number; z: number; radius: number }): void {
    const g = canvas.getContext('2d');
    if (!g) return;
    const radius = view.radius > 0 ? view.radius : 300;
    const mpp = (radius * 2) / Math.max(1, Math.min(canvas.width, canvas.height));
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.draw(g, view.x, view.z, mpp, 0, { pixelRatio: Math.max(1, canvas.width / Math.max(1, canvas.clientWidth || canvas.width)) });
  }

  draw(
    g: CanvasRenderingContext2D, centerX: number, centerZ: number, metersPerPixel: number, rotation: number,
    options?: Map2dOptions,
  ): void {
    const world = this.ctx.world;
    const W = options?.width ?? g.canvas.width;
    const H = options?.height ?? g.canvas.height;
    const pr = options?.pixelRatio ?? 1;
    const mini = options?.detail === 'mini';
    const labels = options?.labels !== false && !mini;
    const mpp = metersPerPixel > 0 ? metersPerPixel : 1;
    /** Mètres par pixel CSS : c'est lui qui règle le niveau de détail. */
    const mppCss = mpp * pr;
    this.ensureIndex(world);

    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    g.fillStyle = MAP_COLORS.ground;
    g.fillRect(0, 0, W, H);
    if (rotation !== 0) {
      g.translate(W / 2, H / 2);
      g.rotate(rotation);
      g.translate(-W / 2, -H / 2);
    }
    // emprise du monde à couvrir (cercle englobant si la vue est tournée)
    const halfW = rotation !== 0 ? Math.hypot(W, H) * 0.5 * mpp : W * 0.5 * mpp;
    const halfH = rotation !== 0 ? halfW : H * 0.5 * mpp;
    const minX = centerX - halfW, maxX = centerX + halfW, minZ = centerZ - halfH, maxZ = centerZ + halfH;
    const inv = 1 / mpp;
    const offX = W / 2 - centerX * inv;
    const offY = H / 2 - centerZ * inv;

    this.drawOutside(g, world, minX, minZ, maxX, maxZ, inv, offX, offY, pr);
    this.drawSurfaces(g, world, minX, minZ, maxX, maxZ, inv, offX, offY);
    this.collectEdges(world, minX, minZ, maxX, maxZ, mppCss);
    this.drawRoads(g, world, inv, offX, offY, pr, mppCss);
    this.drawLandmarks(g, world, minX, minZ, maxX, maxZ, inv, offX, offY, pr);

    if (labels) {
      const placer = this.placer;
      placer.reset(W, H, pr);
      drawPlaceLabels(g, world, placer, minX, minZ, maxX, maxZ, inv, offX, offY, pr, mppCss, rotation);
      drawStreetLabels(g, world, placer, this.byRank, inv, offX, offY, pr, mppCss, rotation);
    }
    g.restore();
  }

  // ───────────────────────────── index des arêtes ─────────────────────────────

  private ensureIndex(world: WorldQuery): void {
    const count = world.edgeCount;
    if (this.indexedWorld === world && this.indexedEdges === count) return;
    this.indexedWorld = world;
    this.indexedEdges = count;
    this.buckets.clear();
    this.rank = new Uint8Array(count);
    this.stamps = new Uint32Array(count);
    this.stamp = 0;
    for (let id = 0; id < count; id++) {
      const e = world.edge(id);
      const pts = e.points;
      if (!pts || pts.length < 4) continue;
      this.rank[id] = (ROAD_STYLES[e.roadClass] ?? ROAD_STYLES.residential).rank;
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i]!, z = pts[i + 1]!;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      const bx0 = Math.floor(minX / BUCKET), bx1 = Math.floor(maxX / BUCKET);
      const bz0 = Math.floor(minZ / BUCKET), bz1 = Math.floor(maxZ / BUCKET);
      for (let bz = bz0; bz <= bz1; bz++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const key = bucketKey(bx, bz);
          let arr = this.buckets.get(key);
          if (!arr) {
            arr = [];
            this.buckets.set(key, arr);
          }
          arr.push(id);
        }
      }
    }
    this.ownRevision++;
  }

  /** Range dans byRank[rang] les arêtes de la zone visibles à cette échelle (sans doublon). */
  private collectEdges(world: WorldQuery, minX: number, minZ: number, maxX: number, maxZ: number, mppCss: number): void {
    for (let r = 0; r < RANK_COUNT; r++) this.byRank[r]!.length = 0;
    this.bridges.length = 0;
    if (this.indexedEdges <= 0) return;
    let stamp = ++this.stamp;
    if (stamp >= 0xffffffff) {
      this.stamps.fill(0);
      stamp = this.stamp = 1;
    }
    const bx0 = Math.floor(minX / BUCKET), bx1 = Math.floor(maxX / BUCKET);
    const bz0 = Math.floor(minZ / BUCKET), bz1 = Math.floor(maxZ / BUCKET);
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const arr = this.buckets.get(bucketKey(bx, bz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const id = arr[i]!;
          if (this.stamps[id] === stamp) continue;
          this.stamps[id] = stamp;
          const rank = this.rank[id]!;
          if (mppCss > STYLE_BY_RANK[rank]!.maxMpp) continue;
          this.byRank[rank]!.push(id);
          if (world.edge(id).bridge) this.bridges.push(id);
        }
      }
    }
  }

  // ───────────────────────────── dessin ─────────────────────────────

  private drawSurfaces(
    g: CanvasRenderingContext2D, world: WorldQuery, minX: number, minZ: number, maxX: number, maxZ: number,
    inv: number, offX: number, offY: number,
  ): void {
    const size = world.tileSize > 0 ? world.tileSize : 512;
    const tx0 = Math.floor(minX / size), tx1 = Math.floor(maxX / size);
    const tz0 = Math.floor(minZ / size), tz1 = Math.floor(maxZ / size);
    if ((tx1 - tx0 + 1) * (tz1 - tz0 + 1) > 400) return;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const px = size * inv;
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!world.isLoaded((tx + 0.5) * size, (tz + 0.5) * size)) continue;
        const img = this.surfaces.get(tx, tz);
        if (!img) continue;
        g.drawImage(img, tx * size * inv + offX, tz * size * inv + offY, px, px);
      }
    }
  }

  /** Hors de l'emprise de la carte : fond plus sombre et liseré, pour que le bord du monde se lise comme tel. */
  private drawOutside(
    g: CanvasRenderingContext2D, world: WorldQuery, minX: number, minZ: number, maxX: number, maxZ: number, inv: number,
    offX: number, offY: number, pr: number,
  ): void {
    const b = world.bounds;
    if (!(b.maxX > b.minX) || !(b.maxZ > b.minZ)) return;
    if (minX >= b.minX && maxX <= b.maxX && minZ >= b.minZ && maxZ <= b.maxZ) return;
    const x0 = b.minX * inv + offX, x1 = b.maxX * inv + offX;
    const z0 = b.minZ * inv + offY, z1 = b.maxZ * inv + offY;
    const X0 = minX * inv + offX - 2, X1 = maxX * inv + offX + 2;
    const Z0 = minZ * inv + offY - 2, Z1 = maxZ * inv + offY + 2;
    g.fillStyle = MAP_COLORS.outside;
    g.beginPath();
    g.rect(X0, Z0, X1 - X0, Z1 - Z0);
    g.rect(x0, z0, x1 - x0, z1 - z0);
    g.fill('evenodd');
    g.strokeStyle = 'rgba(148,168,208,.28)';
    g.lineWidth = 1 * pr;
    g.setLineDash([6 * pr, 5 * pr]);
    g.strokeRect(x0, z0, x1 - x0, z1 - z0);
    g.setLineDash([]);
  }

  private tracePath(g: CanvasRenderingContext2D, e: RoadEdgeInfo, inv: number, offX: number, offY: number): void {
    const pts = e.points;
    g.moveTo(pts[0]! * inv + offX, pts[1]! * inv + offY);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]! * inv + offX, pts[i + 1]! * inv + offY);
  }

  /** Trace d'un seul trait toutes les arêtes d'un rang dont la largeur tombe dans la même classe de pixels. */
  private strokeRank(
    g: CanvasRenderingContext2D, world: WorldQuery, ids: readonly number[], style: RoadStyle, inv: number, offX: number,
    offY: number, pr: number, extraPx: number, color: string, thin = false,
  ): void {
    if (ids.length === 0) return;
    const groups = GROUPS;
    groups.clear();
    for (let i = 0; i < ids.length; i++) {
      const e = world.edge(ids[i]!);
      const w = thin ? style.minPx * pr : Math.max(style.minPx * pr, e.width * inv);
      const q = w < 4 ? Math.round(w * 4) / 4 : Math.round(w);
      let arr = groups.get(q);
      if (!arr) {
        arr = [];
        groups.set(q, arr);
      }
      arr.push(ids[i]!);
    }
    g.strokeStyle = color;
    groups.forEach((arr, q) => {
      g.lineWidth = q + extraPx;
      g.beginPath();
      for (let i = 0; i < arr.length; i++) this.tracePath(g, world.edge(arr[i]!), inv, offX, offY);
      g.stroke();
    });
  }

  private drawRoads(
    g: CanvasRenderingContext2D, world: WorldQuery, inv: number, offX: number, offY: number, pr: number, mppCss: number,
  ): void {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const casing = mppCss < 3.2;
    for (let rank = 0; rank < RANK_COUNT; rank++) {
      const ids = this.byRank[rank]!;
      if (ids.length === 0) continue;
      const style = STYLE_BY_RANK[rank]!;
      if (style.dashed) {
        g.setLineDash([3 * pr, 3 * pr]);
        g.lineCap = 'butt';
        this.strokeRank(g, world, ids, style, inv, offX, offY, pr, 0, style.color, true);
        g.setLineDash([]);
        g.lineCap = 'round';
        continue;
      }
      if (casing && rank >= 1) this.strokeRank(g, world, ids, style, inv, offX, offY, pr, 2 * pr, MAP_COLORS.casing);
      this.strokeRank(g, world, ids, style, inv, offX, offY, pr, 0, style.color);
    }
    // ponts : liseré clair pour les détacher de l'eau
    if (this.bridges.length > 0 && mppCss < 6) {
      g.lineCap = 'butt';
      for (let i = 0; i < this.bridges.length; i++) {
        const e = world.edge(this.bridges[i]!);
        const style = ROAD_STYLES[e.roadClass] ?? ROAD_STYLES.residential;
        const w = Math.max(style.minPx * pr, e.width * inv);
        g.beginPath();
        this.tracePath(g, e, inv, offX, offY);
        g.lineWidth = w + 2.4 * pr;
        g.strokeStyle = MAP_COLORS.bridgeCasing;
        g.stroke();
        g.lineWidth = w;
        g.strokeStyle = style.color;
        g.stroke();
      }
      g.lineCap = 'round';
    }
  }

  private drawLandmarks(
    g: CanvasRenderingContext2D, world: WorldQuery, minX: number, minZ: number, maxX: number, maxZ: number, inv: number,
    offX: number, offY: number, pr: number,
  ): void {
    const marks = world.landmarks;
    g.fillStyle = MAP_COLORS.landmark;
    g.strokeStyle = MAP_COLORS.landmarkEdge;
    g.lineWidth = 1 * pr;
    g.lineJoin = 'miter';
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i]!;
      if (m.x < minX - 250 || m.x > maxX + 250 || m.z < minZ - 250 || m.z > maxZ + 250) continue;
      const fp = m.footprint;
      if (!fp || fp.length < 6) continue;
      g.beginPath();
      g.moveTo(fp[0]! * inv + offX, fp[1]! * inv + offY);
      for (let k = 2; k < fp.length; k += 2) g.lineTo(fp[k]! * inv + offX, fp[k + 1]! * inv + offY);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.lineJoin = 'round';
  }
}

const GROUPS = new Map<number, number[]>();
