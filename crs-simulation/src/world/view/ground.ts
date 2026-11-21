/* =====================================================================================
 * VILLE EN 3D — construction du sol d'une tuile détaillée (logique pure).
 * -------------------------------------------------------------------------------------
 * Produit quatre maillages (tampons réutilisés) :
 *   ground   nappe de base en facettes (le revêtement vient de la grille), surfaces surélevées
 *            (trottoirs, terre-pleins, pelouses) découpées selon les facettes, bordures de granit,
 *            caniveaux, tabliers des ponts, murs de quai et margelles, marquages ;
 *   volumes  ce qui porte une ombre : parapets et dessous des ponts ;
 *   cutout   éléments à texture découpée posés au sol : symboles peints, grilles d'arbres ;
 *   water    plans d'eau.
 * La construction est un générateur : il rend la main souvent pour être étalé sur plusieurs images.
 * ===================================================================================== */

import { TILE_SIZE } from '../mapdata';
import type { Surface } from '../mapdata';
import { miterOffsets, onTileBorder, walkRing } from './borders';
import type { RingStep } from './borders';
import {
  CL_ASPHALT, CL_CONCRETE, CL_CURB, CL_GRASS, CL_PAINT, CL_SETT, CL_SOIL, CL_STONE, CODE_CLASS_MASK, CODE_DECK, CODE_NOT_FLUSH,
  CODE_OVER_WATER, CODE_WATER, hash01, isCarriageway, isHardGround,
} from './classes';
import { triangulate } from './earcut';
import { GLYPH_BUS, MARK_CROSSWALK, MARK_STOP, tileMarkings } from './markings';
import type { MarkingProbe, MarkingSink } from './markings';
import { MODE_DECAL, MODE_FLUSH, MODE_SURFACE, MODE_VERTICAL } from './meshbuf';
import type { MeshBuf } from './meshbuf';
import { codeAt, liftOfCode } from './raster';
import { DECK_THICKNESS, flatQuad, flatQuadUv, roadY, wallQuad } from './site';
import type { TileSite } from './site';
import { TIN_CELL, TIN_N, clipTriangleToTin } from './tin';

export interface GroundOptions {
  /** Bordures de granit et relevés (faux : trottoirs sans arête ni caniveau, qualité basse). */
  curbs: boolean;
  gutters: boolean;
  markings: boolean;
  grates: boolean;
  /** Largeur de margelle côté terre (m) : couvre l'imprécision de la grille au bord de l'eau. */
  copingLand: number;
}

export interface GroundMeshes {
  ground: MeshBuf;
  volumes: MeshBuf;
  cutout: MeshBuf;
  water: MeshBuf;
}

export interface GroundStats {
  raisedPolygons: number;
  deckPolygons: number;
  waterPolygons: number;
  pieces: number;
  curbQuads: number;
  markingQuads: number;
  glyphs: number;
  grates: number;
  parapetSteps: number;
}

/** Rectangles (u0, v0, u1, v1) des éléments posés au sol dans la texture découpée (voir textures.ts). */
export const CUTOUT_UV = {
  grate: [0.0, 0.75, 0.25, 1.0],
  bus: [0.25, 0.75, 0.625, 1.0],
} as const;

/** Hauteur (m) et épaisseur (m) des parapets de pierre des ponts. */
export const PARAPET_HEIGHT = 0.95;
export const PARAPET_THICKNESS = 0.36;
/** Hauteur de peinture au-dessus de la chaussée (m). */
const PAINT_LIFT = 0.012;

const flat: number[] = [];
const holeStarts: number[] = [];
const tris: number[] = [];
const pieceIdx = new Int32Array(16);
let miterScratch = new Float32Array(512);

export class GroundBuilder {
  readonly stats: GroundStats = {
    raisedPolygons: 0, deckPolygons: 0, waterPolygons: 0, pieces: 0, curbQuads: 0, markingQuads: 0, glyphs: 0, grates: 0, parapetSteps: 0,
  };
  private readonly site: TileSite;
  private readonly out: GroundMeshes;
  private readonly opt: GroundOptions;
  private readonly ox: number;
  private readonly oz: number;
  // État du polygone en cours (lu par le puits de morceaux).
  private curCls = 0;
  private curLift = 0;
  private curDeck = false;
  private curTint = 128;
  private readonly pieceSink = (poly: Float64Array, n: number): void => this.piece(poly, n);

  constructor(site: TileSite, out: GroundMeshes, options: GroundOptions) {
    this.site = site;
    this.out = out;
    this.opt = options;
    this.ox = site.ox;
    this.oz = site.oz;
  }

  /** Construction complète, par étapes. */
  *steps(): Generator<void, void, void> {
    this.flushGrid();
    yield;
    const surfaces = this.site.tile.surfaces;
    const raster = this.site.raster;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const style = raster.styles[i];
      if (style === undefined) continue;
      if (s.kind === 'water') {
        this.water(s);
        this.stats.waterPolygons++;
      } else if (raster.deck[i] === 1) {
        yield* this.surface(s, style.cls, style.raised ? style.lift : 0, true, i);
        this.stats.deckPolygons++;
      } else if (style.raised) {
        yield* this.surface(s, style.cls, style.lift, false, i);
        this.stats.raisedPolygons++;
      } else {
        continue;
      }
      if ((i & 3) === 3) yield;
    }
    yield;
    this.ribbons();
    yield;
    if (this.opt.markings) {
      this.markings();
      yield;
    }
    if (this.opt.grates) this.grates();
  }

  // ─────────────────────────────── nappe de base ───────────────────────────────

  private flushGrid(): void {
    const g = this.out.ground;
    const tin = this.site.tin, r = this.site.raster;
    const w = TIN_N + 1;
    const base = g.nv;
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) g.vertex(i * TIN_CELL, tin.h[j * w + i], j * TIN_CELL, 0, 1, 0, 0, MODE_FLUSH, 128, 255);
    }
    const per = TIN_CELL / r.cell;
    for (let j = 0; j < TIN_N; j++) {
      for (let i = 0; i < TIN_N; i++) {
        if (r.hasWater && this.allWater(Math.floor(i * per) - 1, Math.floor(j * per) - 1, Math.ceil((i + 1) * per), Math.ceil((j + 1) * per))) continue;
        const a = base + j * w + i, b = a + 1, c = a + w, d = c + 1;
        g.tri(a, d, b);
        g.tri(a, c, d);
      }
    }
  }

  /** Toutes les cellules du rectangle sont-elles de l'eau libre ? (coins et centre d'abord) */
  private allWater(i0: number, j0: number, i1: number, j1: number): boolean {
    const r = this.site.raster, n = r.n, codes = r.codes;
    if (i0 < 0) i0 = 0;
    if (j0 < 0) j0 = 0;
    if (i1 >= n) i1 = n - 1;
    if (j1 >= n) j1 = n - 1;
    if (codes[j0 * n + i0] !== CODE_WATER || codes[j1 * n + i1] !== CODE_WATER || codes[j0 * n + i1] !== CODE_WATER || codes[j1 * n + i0] !== CODE_WATER) return false;
    if (codes[((j0 + j1) >> 1) * n + ((i0 + i1) >> 1)] !== CODE_WATER) return false;
    for (let j = j0; j <= j1; j++) {
      const row = j * n;
      for (let i = i0; i <= i1; i++) if (codes[row + i] !== CODE_WATER) return false;
    }
    return true;
  }

  // ─────────────────────────────── surfaces surélevées et tabliers ───────────────────────────────

  private flatten(s: Surface): void {
    flat.length = 0;
    holeStarts.length = 0;
    const o = s.outer;
    for (let i = 0; i < o.length; i++) flat.push(o[i]);
    for (let h = 0; h < s.holes.length; h++) {
      const ring = s.holes[h];
      if (ring.length < 6) continue;
      holeStarts.push(flat.length >> 1);
      for (let i = 0; i < ring.length; i++) flat.push(ring[i]);
    }
  }

  private *surface(s: Surface, cls: number, lift: number, deck: boolean, index: number): Generator<void, void, void> {
    if (s.outer.length < 6) return;
    this.flatten(s);
    triangulate(flat, holeStarts.length > 0 ? holeStarts : null, tris);
    this.curCls = cls;
    this.curLift = lift;
    this.curDeck = deck;
    this.curTint = 122 + Math.floor(hash01(index * 31 + this.site.tile.tx * 977 + this.site.tile.tz * 131) * 13);
    for (let t = 0; t + 2 < tris.length; t += 3) {
      const a = tris[t] * 2, b = tris[t + 1] * 2, c = tris[t + 2] * 2;
      clipTriangleToTin(flat[a], flat[a + 1], flat[b], flat[b + 1], flat[c], flat[c + 1], this.ox, this.oz, this.pieceSink);
      // Un grand polygone (plusieurs centaines de triangles) est étalé lui aussi ; l'état est remis au retour.
      if (t % 192 === 189) {
        yield;
        this.curCls = cls;
        this.curLift = lift;
        this.curDeck = deck;
      }
    }
    this.edges(s.outer, cls, lift, deck);
    for (let h = 0; h < s.holes.length; h++) if (s.holes[h].length >= 6) this.edges(s.holes[h], cls, lift, deck);
  }

  /** Altitude du dessus d'une surface en cours (niveau chaussée + surélévation). */
  private topY(x: number, z: number): number {
    const ground = this.site.tin.y(x, z);
    return (this.curDeck ? this.site.profile.deckY(x, z, ground) : ground) + this.curLift;
  }

  /** Un morceau convexe contenu dans une facette : un éventail de triangles. */
  private piece(poly: Float64Array, n: number): void {
    const g = this.out.ground;
    const ox = this.ox, oz = this.oz;
    // Sens du contour (aire signée du morceau entier : ses trois premiers sommets peuvent être alignés).
    let twice = 0;
    for (let k = 0, j = n - 1; k < n; j = k++) twice += poly[2 * k] * poly[2 * j + 1] - poly[2 * j] * poly[2 * k + 1];
    const up = twice > 0;
    let cls = this.curCls;
    let overWater = false;
    if (this.curDeck) {
      let cx = 0, cz = 0;
      for (let k = 0; k < n; k++) {
        cx += poly[2 * k];
        cz += poly[2 * k + 1];
      }
      const code = codeAt(this.site.raster, cx / n, cz / n);
      overWater = (code & CODE_OVER_WATER) !== 0;
      // Les pavés ne sont connus que de la grille (reportés depuis le graphe).
      if (cls === CL_ASPHALT && (code & CODE_DECK) !== 0 && (code & CODE_CLASS_MASK) === CL_SETT) cls = CL_SETT;
    }
    if (n > pieceIdx.length) n = pieceIdx.length;
    for (let k = 0; k < n; k++) {
      const x = poly[2 * k], z = poly[2 * k + 1];
      pieceIdx[k] = g.vertex(x - ox, this.topY(x, z), z - oz, 0, 1, 0, cls, MODE_SURFACE, this.curTint, 255);
    }
    for (let k = 1; k + 1 < n; k++) {
      if (up) g.tri(pieceIdx[0], pieceIdx[k], pieceIdx[k + 1]);
      else g.tri(pieceIdx[0], pieceIdx[k + 1], pieceIdx[k]);
    }
    this.stats.pieces++;
    if (overWater) {
      // Dessous du tablier, vu depuis les berges.
      const v = this.out.volumes;
      for (let k = 0; k < n; k++) {
        const x = poly[2 * k], z = poly[2 * k + 1];
        pieceIdx[k] = v.vertex(x - ox, this.topY(x, z) - this.curLift - DECK_THICKNESS, z - oz, 0, -1, 0, CL_STONE, MODE_VERTICAL, 118, 120);
      }
      for (let k = 1; k + 1 < n; k++) {
        if (up) v.tri(pieceIdx[0], pieceIdx[k + 1], pieceIdx[k]);
        else v.tri(pieceIdx[0], pieceIdx[k], pieceIdx[k + 1]);
      }
    }
  }

  /** Bords d'une surface surélevée ou d'un tablier : relevé, bordure, caniveau, ou parapet au-dessus de l'eau. */
  private edges(ring: ArrayLike<number>, cls: number, lift: number, deck: boolean): void {
    const count = ring.length >> 1;
    if (miterScratch.length < count * 2) miterScratch = new Float32Array(count * 4);
    const miters = miterOffsets(ring, miterScratch);
    const site = this.site, raster = site.raster;
    const g = this.out.ground;
    const ox = this.ox, oz = this.oz;
    const probe = Math.max(0.3, raster.cell * 0.8);
    const planted = cls === CL_GRASS || cls === CL_SOIL;
    this.curLift = lift;
    this.curDeck = deck;
    walkRing(ring, miters, deck ? 2.5 : 4, (s: RingStep) => {
      if (onTileBorder(s.ax, s.az, s.bx, s.bz, ox, oz, TILE_SIZE)) return;
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
      const out = codeAt(raster, mx + s.nx * probe, mz + s.nz * probe);
      const topA = this.topY(s.ax, s.az), topB = this.topY(s.bx, s.bz);
      const lax = s.ax - ox, laz = s.az - oz, lbx = s.bx - ox, lbz = s.bz - oz;
      if (deck && out === CODE_WATER) {
        this.parapet(s, topA, topB);
        return;
      }
      const outRaised = (out & CODE_NOT_FLUSH) !== 0 && out !== CODE_WATER;
      if (outRaised && liftOfCode(out) >= lift - 0.02 && (!deck || (out & CODE_DECK) !== 0)) return;
      // Relevé vertical : ferme le vide sous la surface.
      const drop = lift + (deck ? 0.3 : 0.12);
      wallQuad(g, lax, laz, lbx, lbz, topA, topB, topA - drop, topB - drop, s.nx, s.nz, CL_CURB, MODE_VERTICAL, 128, 255, 150);
      if (!this.opt.curbs || lift <= 0) return;
      const outCls = out & CODE_CLASS_MASK;
      if (isCarriageway(outCls) && (!outRaised || (out & CODE_DECK) !== 0)) {
        // Bordure de granit posée sur le bord du trottoir.
        const w = 0.2, y = 0.004;
        flatQuad(
          g, lax, topA + y, laz, lbx, topB + y, lbz, lbx - s.mbx * w, topB + y, lbz - s.mbz * w, lax - s.max * w, topA + y, laz - s.maz * w,
          CL_CURB, MODE_DECAL, 132, 255,
        );
        this.stats.curbQuads++;
        if (this.opt.gutters && !outRaised) {
          // Caniveau : bande de béton au pied de la bordure, sur la chaussée.
          const gw = 0.32, gy = 0.006;
          const ya = topA - lift + gy, yb = topB - lift + gy;
          flatQuad(
            g, lax, ya, laz, lbx, yb, lbz, lbx + s.mbx * gw, yb, lbz + s.mbz * gw, lax + s.max * gw, ya, laz + s.maz * gw,
            CL_CONCRETE, MODE_DECAL, 120, 215,
          );
        }
      } else if (planted && !outRaised) {
        // Bordurette de pierre autour des pelouses et des massifs.
        const w = 0.12, y = 0.004;
        flatQuad(
          g, lax, topA + y, laz, lbx, topB + y, lbz, lbx - s.mbx * w, topB + y, lbz - s.mbz * w, lax - s.max * w, topA + y, laz - s.maz * w,
          CL_CURB, MODE_DECAL, 124, 255,
        );
      }
    });
  }

  /** Bord d'un tablier au-dessus de l'eau : bandeau du tablier et parapet de pierre. */
  private parapet(s: RingStep, topA: number, topB: number): void {
    const v = this.out.volumes;
    const ox = this.ox, oz = this.oz;
    const lax = s.ax - ox, laz = s.az - oz, lbx = s.bx - ox, lbz = s.bz - oz;
    const t = PARAPET_THICKNESS;
    const iax = lax - s.max * t, iaz = laz - s.maz * t, ibx = lbx - s.mbx * t, ibz = lbz - s.mbz * t;
    const ha = topA + PARAPET_HEIGHT, hb = topB + PARAPET_HEIGHT;
    const lift = this.curLift;
    // Face extérieure d'un seul tenant : du haut du parapet au bas du bandeau.
    wallQuad(v, lax, laz, lbx, lbz, ha, hb, topA - lift - DECK_THICKNESS, topB - lift - DECK_THICKNESS, s.nx, s.nz, CL_STONE, MODE_VERTICAL, 128, 255, 165);
    wallQuad(v, iax, iaz, ibx, ibz, ha, hb, topA, topB, -s.nx, -s.nz, CL_STONE, MODE_VERTICAL, 128, 255, 190);
    flatQuad(v, lax, ha, laz, lbx, hb, lbz, ibx, hb, ibz, iax, ha, iaz, CL_STONE, MODE_VERTICAL, 138, 255);
    this.stats.parapetSteps++;
  }

  /** Tabliers de repli (ponts dont la carte ne donne pas l'emprise) : quadrilatères de la grille. */
  private ribbons(): void {
    const rb = this.site.raster.ribbons;
    const ring = new Float32Array(8);
    for (let q = 0; q + 9 < rb.length; q += 10) {
      for (let k = 0; k < 8; k++) ring[k] = rb[q + k];
      // Découpé aux limites de la tuile : chaque tuile dessine sa part du ruban.
      const clipped = clipQuadToTile(ring, this.ox, this.oz);
      if (clipped.length < 6) continue;
      this.curCls = rb[q + 8];
      this.curLift = rb[q + 9];
      this.curDeck = true;
      this.curTint = 128;
      for (let k = 1; k + 1 < clipped.length / 2; k++) {
        clipTriangleToTin(
          clipped[0], clipped[1], clipped[2 * k], clipped[2 * k + 1], clipped[2 * k + 2], clipped[2 * k + 3], this.ox, this.oz, this.pieceSink,
        );
      }
      // Seuls les deux grands côtés portent un bord (les petits côtés se raccordent au segment voisin).
      const sides = new Float32Array(8);
      sides.set(ring);
      this.ribbonSide(sides, 1, rb[q + 8], rb[q + 9]);
      this.ribbonSide(sides, 3, rb[q + 8], rb[q + 9]);
      this.stats.deckPolygons++;
    }
  }

  /** Bord d'un ruban le long du côté `side` (du sommet side au sommet side + 1). */
  private ribbonSide(ring: Float32Array, side: number, cls: number, lift: number): void {
    const a = side, b = (side + 1) % 4;
    const ax = ring[2 * a], az = ring[2 * a + 1], bx = ring[2 * b], bz = ring[2 * b + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) return;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    const parts = Math.max(1, Math.ceil(len / 2.5));
    const site = this.site, raster = site.raster;
    const g = this.out.ground;
    const probe = Math.max(0.3, raster.cell * 0.8);
    const step: RingStep = { edge: side, ax: 0, az: 0, bx: 0, bz: 0, max: nx, maz: nz, mbx: nx, mbz: nz, nx, nz };
    this.curLift = lift;
    this.curDeck = true;
    for (let k = 0; k < parts; k++) {
      step.ax = ax + ((bx - ax) * k) / parts;
      step.az = az + ((bz - az) * k) / parts;
      step.bx = ax + ((bx - ax) * (k + 1)) / parts;
      step.bz = az + ((bz - az) * (k + 1)) / parts;
      const mx = (step.ax + step.bx) / 2, mz = (step.az + step.bz) / 2;
      if (mx < this.ox || mx >= this.ox + TILE_SIZE || mz < this.oz || mz >= this.oz + TILE_SIZE) continue;
      const out = codeAt(raster, mx + nx * probe, mz + nz * probe);
      const topA = this.topY(step.ax, step.az), topB = this.topY(step.bx, step.bz);
      if (out === CODE_WATER) {
        this.parapet(step, topA, topB);
        continue;
      }
      if ((out & CODE_DECK) !== 0 && liftOfCode(out) >= lift - 0.02) continue;
      const drop = lift + 0.3;
      wallQuad(
        g, step.ax - this.ox, step.az - this.oz, step.bx - this.ox, step.bz - this.oz, topA, topB, topA - drop, topB - drop, nx, nz,
        CL_CURB, MODE_VERTICAL, 128, 255, 150,
      );
      if (this.opt.curbs && lift > 0 && isCarriageway(out & CODE_CLASS_MASK)) {
        const w = 0.2, y = 0.004;
        const lax = step.ax - this.ox, laz = step.az - this.oz, lbx = step.bx - this.ox, lbz = step.bz - this.oz;
        flatQuad(g, lax, topA + y, laz, lbx, topB + y, lbz, lbx - nx * w, topB + y, lbz - nz * w, lax - nx * w, topA + y, laz - nz * w, CL_CURB, MODE_DECAL, 132, 255);
      }
    }
    void cls;
  }

  // ─────────────────────────────── eau, quais ───────────────────────────────

  private water(s: Surface): void {
    if (s.outer.length < 6) return;
    const level = s.level ?? this.site.waterLevel;
    this.flatten(s);
    triangulate(flat, holeStarts.length > 0 ? holeStarts : null, tris);
    const w = this.out.water;
    const ox = this.ox, oz = this.oz;
    const base = w.nv;
    for (let i = 0; i + 1 < flat.length; i += 2) w.vertex(flat[i] - ox, level, flat[i + 1] - oz, 0, 1, 0, 0, 0, 128, 255);
    for (let t = 0; t + 2 < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const up = (flat[2 * b + 1] - flat[2 * a + 1]) * (flat[2 * c] - flat[2 * a]) - (flat[2 * b] - flat[2 * a]) * (flat[2 * c + 1] - flat[2 * a + 1]) > 0;
      if (up) w.tri(base + a, base + b, base + c);
      else w.tri(base + a, base + c, base + b);
    }
    this.bank(s.outer, level);
    for (let h = 0; h < s.holes.length; h++) if (s.holes[h].length >= 6) this.bank(s.holes[h], level);
  }

  /** Mur de quai le long d'un bord de plan d'eau, du sol jusque sous l'eau, coiffé d'une margelle. */
  private bank(ring: ArrayLike<number>, level: number): void {
    const count = ring.length >> 1;
    if (miterScratch.length < count * 2) miterScratch = new Float32Array(count * 4);
    const miters = miterOffsets(ring, miterScratch);
    const site = this.site, raster = site.raster;
    const g = this.out.ground;
    const ox = this.ox, oz = this.oz;
    const probe = Math.max(0.6, raster.cell * 1.5);
    const land = this.opt.copingLand;
    const over = 0.25;
    walkRing(ring, miters, 6, (s: RingStep) => {
      if (onTileBorder(s.ax, s.az, s.bx, s.bz, ox, oz, TILE_SIZE)) return;
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
      const out = codeAt(raster, mx + s.nx * probe, mz + s.nz * probe);
      if (out === CODE_WATER) return; // deux morceaux du même plan d'eau
      const underDeck = (out & CODE_DECK) !== 0;
      let topA: number, topB: number;
      if (underDeck) {
        // Sous un pont : la culée monte jusqu'au dessous du tablier.
        topA = site.profile.deckY(s.ax, s.az, site.tin.y(s.ax, s.az)) - DECK_THICKNESS;
        topB = site.profile.deckY(s.bx, s.bz, site.tin.y(s.bx, s.bz)) - DECK_THICKNESS;
      } else {
        const lift = liftOfCode(out) + 0.02;
        topA = site.tin.y(s.ax, s.az) + lift;
        topB = site.tin.y(s.bx, s.bz) + lift;
      }
      // Le mur est posé un peu en avant du bord, au-dessus de l'eau ; il regarde l'eau.
      const wax = s.ax - s.max * over - ox, waz = s.az - s.maz * over - oz, wbx = s.bx - s.mbx * over - ox, wbz = s.bz - s.mbz * over - oz;
      const bottom = level - 0.8;
      if (Math.max(topA, topB) > bottom + 0.05) {
        wallQuad(g, wax, waz, wbx, wbz, topA, topB, bottom, bottom, -s.nx, -s.nz, CL_STONE, MODE_VERTICAL, 124, 255, 105);
      }
      if (underDeck) return;
      const cax = s.ax + s.max * land - ox, caz = s.az + s.maz * land - oz, cbx = s.bx + s.mbx * land - ox, cbz = s.bz + s.mbz * land - oz;
      flatQuad(g, wax, topA, waz, wbx, topB, wbz, cbx, topB, cbz, cax, topA, caz, CL_STONE, MODE_DECAL, 136, 255);
    });
  }

  // ─────────────────────────────── marquages, grilles d'arbres ───────────────────────────────

  private markings(): void {
    const site = this.site, raster = site.raster;
    const g = this.out.ground, cut = this.out.cutout;
    const ox = this.ox, oz = this.oz;
    const stats = this.stats;
    const sink: MarkingSink = {
      quad: (x0, z0, x1, z1, x2, z2, x3, z3, kind) => {
        const tint = kind === MARK_CROSSWALK || kind === MARK_STOP ? 136 : 126;
        flatQuad(
          g, x0 - ox, roadY(site, x0, z0) + PAINT_LIFT, z0 - oz, x1 - ox, roadY(site, x1, z1) + PAINT_LIFT, z1 - oz,
          x2 - ox, roadY(site, x2, z2) + PAINT_LIFT, z2 - oz, x3 - ox, roadY(site, x3, z3) + PAINT_LIFT, z3 - oz, CL_PAINT, MODE_DECAL, tint, 255,
        );
        stats.markingQuads++;
      },
      glyph: (x, z, heading, kind) => {
        if (kind !== GLYPH_BUS) return;
        // Lettres allongées dans le sens de la marche, lues en roulant.
        const fx = Math.sin(heading), fz = Math.cos(heading);
        const rx = -fz, rz = fx;
        const hw = 0.85, hl = 2.0;
        const uv = CUTOUT_UV.bus;
        const px = (a: number, b: number): number => x + rx * a + fx * b;
        const pz = (a: number, b: number): number => z + rz * a + fz * b;
        const y = roadY(site, x, z) + PAINT_LIFT + 0.004;
        // Le bas des lettres est du côté d'où l'on arrive.
        flatQuadUv(
          cut, px(-hw, -hl) - ox, y, pz(-hw, -hl) - oz, px(hw, -hl) - ox, y, pz(hw, -hl) - oz, px(hw, hl) - ox, y, pz(hw, hl) - oz,
          px(-hw, hl) - ox, y, pz(-hw, hl) - oz, uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3], CL_PAINT, MODE_DECAL, 128,
        );
        stats.glyphs++;
      },
    };
    const probe: MarkingProbe = {
      roadExtent: (x, z, vx, vz, fallback) => {
        if (!isCarriageway(codeAt(raster, x, z) & CODE_CLASS_MASK)) return fallback;
        const max = fallback * 1.8 + 4;
        const stepLen = Math.max(0.25, raster.cell);
        for (let d = stepLen; d <= max; d += stepLen) {
          const code = codeAt(raster, x + vx * d, z + vz * d);
          const flush = (code & CODE_NOT_FLUSH) === 0 || (code & CODE_DECK) !== 0;
          if (!flush || !isCarriageway(code & CODE_CLASS_MASK) || code === CODE_WATER) return d - stepLen * 0.5;
        }
        return fallback;
      },
    };
    tileMarkings(site.graph, site.tile.roadEdges, { minX: ox, minZ: oz, maxX: ox + TILE_SIZE, maxZ: oz + TILE_SIZE }, sink, probe);
  }

  /** Grilles de fonte au pied des arbres plantés dans un sol dur. */
  private grates(): void {
    const site = this.site, raster = site.raster;
    const trees = site.tile.trees;
    const cut = this.out.cutout;
    const ox = this.ox, oz = this.oz;
    const uv = CUTOUT_UV.grate;
    const dir = { x: 1, z: 0 };
    for (let i = 0; i < trees.count; i++) {
      const x = trees.x[i], z = trees.z[i];
      const code = codeAt(raster, x, z);
      if (code === CODE_WATER || !isHardGround(code & CODE_CLASS_MASK)) continue;
      this.streetDirection(x, z, dir);
      const h = trees.crownRadius[i] > 3.5 ? 0.9 : 0.7;
      const ground = site.tin.y(x, z);
      const y = ((code & CODE_DECK) !== 0 ? site.profile.deckY(x, z, ground) : ground) + liftOfCode(code) + 0.012;
      const ax = dir.x * h, az = dir.z * h, bx = -dir.z * h, bz = dir.x * h;
      flatQuadUv(
        cut, x - ax - bx - ox, y, z - az - bz - oz, x + ax - bx - ox, y, z + az - bz - oz, x + ax + bx - ox, y, z + az + bz - oz,
        x - ax + bx - ox, y, z - az + bz - oz, uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3], CL_CURB, MODE_DECAL, 128,
      );
      this.stats.grates++;
    }
  }

  /** Direction de la voie la plus proche (à moins de 30 m), pour aligner une grille d'arbre ; sinon l'axe des x. */
  private streetDirection(x: number, z: number, out: { x: number; z: number }): void {
    const graph = this.site.graph, ids = this.site.tile.roadEdges;
    let best = 900;
    out.x = 1;
    out.z = 0;
    for (let k = 0; k < ids.length; k++) {
      const ed = graph.edges[ids[k]];
      if (ed === undefined) continue;
      const pts = ed.points;
      for (let i = 2; i + 1 < pts.length; i += 2) {
        const ax = pts[i - 2], az = pts[i - 1], dx = pts[i] - ax, dz = pts[i + 1] - az;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-6) continue;
        let t = ((x - ax) * dx + (z - az) * dz) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const ex = ax + dx * t - x, ez = az + dz * t - z;
        const d2 = ex * ex + ez * ez;
        if (d2 < best) {
          best = d2;
          const len = Math.sqrt(len2);
          out.x = dx / len;
          out.z = dz / len;
        }
      }
    }
  }
}

/** Découpe un quadrilatère convexe aux limites d'une tuile ; retourne les sommets à plat (tableau réutilisé). */
const clipA: number[] = [];
const clipB: number[] = [];
function clipQuadToTile(ring: Float32Array, ox: number, oz: number): number[] {
  clipA.length = 0;
  for (let i = 0; i < 8; i++) clipA.push(ring[i]);
  let src = clipA, dst = clipB;
  const planes = [1, 0, -ox, -1, 0, ox + TILE_SIZE, 0, 1, -oz, 0, -1, oz + TILE_SIZE];
  for (let p = 0; p < 12; p += 3) {
    const a = planes[p], b = planes[p + 1], c = planes[p + 2];
    dst.length = 0;
    const n = src.length >> 1;
    for (let i = 0; i < n; i++) {
      const j = (i + n - 1) % n;
      const px = src[2 * j], pz = src[2 * j + 1], x = src[2 * i], z = src[2 * i + 1];
      const pd = a * px + b * pz + c, d = a * x + b * z + c;
      if (d >= 0) {
        if (pd < 0) dst.push(px + ((x - px) * pd) / (pd - d), pz + ((z - pz) * pd) / (pd - d));
        dst.push(x, z);
      } else if (pd >= 0) {
        dst.push(px + ((x - px) * pd) / (pd - d), pz + ((z - pz) * pd) / (pd - d));
      }
    }
    const t = src;
    src = dst;
    dst = t;
    if (src.length < 6) return src;
  }
  return src;
}

/** Libère les tampons de travail du module. */
export function releaseGroundScratch(): void {
  flat.length = 0;
  holeStarts.length = 0;
  tris.length = 0;
  clipA.length = 0;
  clipB.length = 0;
  miterScratch = new Float32Array(512);
}
