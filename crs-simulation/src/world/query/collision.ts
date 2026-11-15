/* =====================================================================================
 * Collisions avec le décor statique.
 *
 * Les obstacles sont rangés par « lots » (CollisionBucket) : un lot par tuile chargée, plus un
 * lot permanent pour les monuments. Chaque lot possède son index spatial compact à cellules de
 * 16 m (segments et polygones pleins) : ajouter ou retirer une tuile ne touche à rien d'autre.
 *
 *   - segments à UNE face (murs de bâtiments, berges, parapets générés) : la matière est du
 *     côté opposé à la normale ; on est toujours repoussé du côté de la normale ;
 *   - segments à DEUX faces avec une demi-épaisseur (murs isolés, grilles, haies, garde-corps) ;
 *   - polygones pleins (bâtiments, monuments, plans d'eau) : si le centre du disque s'y trouve
 *     (pas trop grand, téléportation, erreur d'apparition), il est ramené sur la face libre la
 *     plus proche — c'est ce qui interdit de « traverser » un mur à grande vitesse ;
 *   - capsules d'exemption : passage d'une voie à travers un polygone (porche sous un immeuble,
 *     tablier d'un pont au-dessus de l'eau).
 *
 * Aucune requête n'alloue de mémoire.
 * ===================================================================================== */

import type { RayHit, Vec2, WorldBounds } from '@/core/contracts';
import type { ObstacleSegmentView } from './api';

/** Côté d'une cellule de l'index des obstacles (m). */
export const COLLISION_CELL = 16;

/** Nature d'un segment (3 bits de poids faible de segFlags). */
export const KIND_BUILDING = 0;
export const KIND_BARRIER = 1;
export const KIND_BANK = 2;
export const KIND_LANDMARK = 3;
export const FLAG_KIND_MASK = 7;
/** Segment à une face : la normale stockée pointe vers l'espace libre. */
export const FLAG_ONE_SIDED = 8;
/** Le segment arrête le regard (lineOfSight). */
export const FLAG_SIGHT = 16;

/** Nature d'un polygone plein. */
export const SOLID_BUILDING = 0;
export const SOLID_WATER = 2;
export const SOLID_LANDMARK = 3;

/** Nombre de valeurs par segment dans `seg` : ax, az, bx, bz, nx, nz, 1/longueur², demi-épaisseur. */
export const SEG_STRIDE = 8;
/** Nombre de valeurs par capsule : ax, az, bx, bz, rayon. */
export const CAP_STRIDE = 5;

/** Bit de polyCellItems : la cellule est entièrement dans le polygone (pas de test de parité). */
export const POLY_FULL_CELL = 0x40000000;

/** Marge laissée entre le disque et l'obstacle après résolution (m). */
const SKIN = 0.001;
const KIND_NAMES = ['building', 'barrier', 'bank', 'landmark'] as const;

export class CollisionBucket {
  /** Boîte englobante du contenu (épaisseurs comprises). */
  minX = 0;
  minZ = 0;
  maxX = 0;
  maxZ = 0;
  /** Grille : origine, dimensions. */
  gx0 = 0;
  gz0 = 0;
  nx = 0;
  nz = 0;

  segCount = 0;
  seg: Float32Array = new Float32Array(0);
  segHeight: Float32Array = new Float32Array(0);
  segFlags: Uint8Array = new Uint8Array(0);
  cellStart: Uint32Array = new Uint32Array(1);
  cellItems: Uint32Array = new Uint32Array(0);

  polyCount = 0;
  /** 4 valeurs par polygone : minX, minZ, maxX, maxZ. */
  polyBox: Float32Array = new Float32Array(0);
  polyKind: Uint8Array = new Uint8Array(0);
  polyHeight: Float32Array = new Float32Array(0);
  /** Anneaux du polygone q : [polyRing0[q], polyRing0[q + 1][. */
  polyRing0: Uint32Array = new Uint32Array(1);
  /** Points de l'anneau r : [ringPt0[r], ringPt0[r + 1][ (indices de points dans xz). */
  ringPt0: Uint32Array = new Uint32Array(1);
  xz: Float32Array = new Float32Array(0);
  /** Capsules d'exemption du polygone q : [polyCap0[q], polyCap0[q + 1][. */
  polyCap0: Uint32Array = new Uint32Array(1);
  caps: Float32Array = new Float32Array(0);
  /** Arête du graphe à l'origine de chaque capsule. */
  capEdge: Int32Array = new Int32Array(0);
  polyCellStart: Uint32Array = new Uint32Array(1);
  polyCellItems: Uint32Array = new Uint32Array(0);

  /** Le point est-il dans le polygone q (règle de parité sur tous ses anneaux) ? */
  insidePolygon(q: number, x: number, z: number): boolean {
    const xz = this.xz;
    let inside = false;
    for (let r = this.polyRing0[q], rEnd = this.polyRing0[q + 1]; r < rEnd; r++) {
      const p0 = this.ringPt0[r], p1 = this.ringPt0[r + 1];
      for (let i = p0, j = p1 - 1; i < p1; j = i++) {
        const zi = xz[2 * i + 1], zj = xz[2 * j + 1];
        if (zi > z !== zj > z) {
          const xi = xz[2 * i], xj = xz[2 * j];
          if (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
        }
      }
    }
    return inside;
  }

  /** Le point est-il dans une capsule d'exemption du polygone q ? */
  inCapsules(q: number, x: number, z: number): boolean {
    const caps = this.caps;
    for (let c = this.polyCap0[q], end = this.polyCap0[q + 1]; c < end; c++) {
      const o = c * CAP_STRIDE;
      const ax = caps[o], az = caps[o + 1];
      const dx = caps[o + 2] - ax, dz = caps[o + 3] - az;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const ex = x - ax - dx * t, ez = z - az - dz * t;
      const r = caps[o + 4];
      if (ex * ex + ez * ez < r * r) return true;
    }
    return false;
  }

  /** Le point est-il dans un obstacle plein de ce lot ? */
  solidAt(x: number, z: number): boolean {
    if (this.polyCount === 0 || x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return false;
    const i = Math.floor((x - this.gx0) / COLLISION_CELL), j = Math.floor((z - this.gz0) / COLLISION_CELL);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return false;
    const c = j * this.nx + i;
    const box = this.polyBox;
    for (let p = this.polyCellStart[c], end = this.polyCellStart[c + 1]; p < end; p++) {
      const item = this.polyCellItems[p];
      const q = item & ~POLY_FULL_CELL;
      if ((item & POLY_FULL_CELL) === 0) {
        if (x < box[4 * q] || x > box[4 * q + 2] || z < box[4 * q + 1] || z > box[4 * q + 3]) continue;
        if (!this.insidePolygon(q, x, z)) continue;
      }
      if (this.polyCap0[q + 1] > this.polyCap0[q] && this.inCapsules(q, x, z)) continue;
      return true;
    }
    return false;
  }
}

export class CollisionWorld {
  /** Lots actifs (monuments + tuiles chargées). */
  readonly buckets: CollisionBucket[] = [];
  private bounds: WorldBounds = { minX: -Infinity, minZ: -Infinity, maxX: Infinity, maxZ: Infinity };
  // Résultat du dernier lancer de rayon.
  private hitT = 1;
  private hitSeg = -1;
  private hitBucket: CollisionBucket | null = null;
  // Résultat de la dernière recherche d'issue.
  private exitX = 0;
  private exitZ = 0;

  setBounds(b: WorldBounds): void {
    this.bounds = { minX: b.minX, minZ: b.minZ, maxX: b.maxX, maxZ: b.maxZ };
  }

  add(bucket: CollisionBucket): void {
    if (this.buckets.indexOf(bucket) < 0) this.buckets.push(bucket);
  }

  remove(bucket: CollisionBucket): void {
    const i = this.buckets.indexOf(bucket);
    if (i >= 0) {
      this.buckets[i] = this.buckets[this.buckets.length - 1];
      this.buckets.pop();
    }
  }

  clear(): void {
    this.buckets.length = 0;
  }

  /** Nombre total de segments et de polygones (diagnostic). */
  count(out: { segments: number; solids: number }): void {
    out.segments = 0;
    out.solids = 0;
    for (let k = 0; k < this.buckets.length; k++) {
      out.segments += this.buckets[k].segCount;
      out.solids += this.buckets[k].polyCount;
    }
  }

  /** Le point est-il dans un obstacle plein (bâtiment, monument, eau hors pont) ? */
  solidAt(x: number, z: number): boolean {
    const buckets = this.buckets;
    for (let k = 0; k < buckets.length; k++) if (buckets[k].solidAt(x, z)) return true;
    return false;
  }

  /**
   * Cherche, autour d'un point situé DANS un obstacle plein, la face libre la plus proche : un
   * segment à une face dont on est du côté « matière » et dont le devant n'est pas lui-même dans
   * un obstacle. Écrit exitX / exitZ.
   */
  private findExit(x: number, z: number, radius: number): boolean {
    const buckets = this.buckets;
    for (let reach = 8; reach <= 200; reach *= 3) {
      let best = reach * reach;
      let found = false;
      for (let k = 0; k < buckets.length; k++) {
        const b = buckets[k];
        if (b.segCount === 0 || x + reach < b.minX || x - reach > b.maxX || z + reach < b.minZ || z - reach > b.maxZ) continue;
        const i0 = Math.max(0, Math.floor((x - reach - b.gx0) / COLLISION_CELL)), i1 = Math.min(b.nx - 1, Math.floor((x + reach - b.gx0) / COLLISION_CELL));
        const j0 = Math.max(0, Math.floor((z - reach - b.gz0) / COLLISION_CELL)), j1 = Math.min(b.nz - 1, Math.floor((z + reach - b.gz0) / COLLISION_CELL));
        const seg = b.seg, flags = b.segFlags;
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const c = j * b.nx + i;
            for (let p = b.cellStart[c], end = b.cellStart[c + 1]; p < end; p++) {
              const s = b.cellItems[p];
              if ((flags[s] & FLAG_ONE_SIDED) === 0) continue;
              const o = s * SEG_STRIDE;
              const ax = seg[o], az = seg[o + 1];
              const dx = seg[o + 2] - ax, dz = seg[o + 3] - az;
              let t = ((x - ax) * dx + (z - az) * dz) * seg[o + 6];
              if (t < 0) t = 0; else if (t > 1) t = 1;
              const cx = ax + dx * t, cz = az + dz * t;
              const ex = x - cx, ez = z - cz;
              const d2 = ex * ex + ez * ez;
              if (d2 >= best) continue;
              const nx = seg[o + 4], nz = seg[o + 5];
              // On doit être derrière cette face (côté matière), sinon ce n'est pas une issue.
              if (ex * nx + ez * nz > 0.01) continue;
              const qx = cx + nx * (radius + SKIN), qz = cz + nz * (radius + SKIN);
              if (this.solidAt(qx, qz)) continue;
              best = d2;
              found = true;
              this.exitX = qx;
              this.exitZ = qz;
            }
          }
        }
      }
      if (found) return true;
    }
    return false;
  }

  /** Une passe de répulsion hors des segments. true si le disque a été déplacé. */
  private pushOut(pos: Vec2, radius: number): boolean {
    const buckets = this.buckets;
    let moved = false;
    let x = pos.x, z = pos.z;
    for (let k = 0; k < buckets.length; k++) {
      const b = buckets[k];
      if (b.segCount === 0 || x + radius < b.minX || x - radius > b.maxX || z + radius < b.minZ || z - radius > b.maxZ) continue;
      const i0 = Math.max(0, Math.floor((x - radius - b.gx0) / COLLISION_CELL)), i1 = Math.min(b.nx - 1, Math.floor((x + radius - b.gx0) / COLLISION_CELL));
      const j0 = Math.max(0, Math.floor((z - radius - b.gz0) / COLLISION_CELL)), j1 = Math.min(b.nz - 1, Math.floor((z + radius - b.gz0) / COLLISION_CELL));
      const seg = b.seg, flags = b.segFlags;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const c = j * b.nx + i;
          for (let p = b.cellStart[c], end = b.cellStart[c + 1]; p < end; p++) {
            const s = b.cellItems[p];
            const o = s * SEG_STRIDE;
            const ax = seg[o], az = seg[o + 1];
            const dx = seg[o + 2] - ax, dz = seg[o + 3] - az;
            let t = ((x - ax) * dx + (z - az) * dz) * seg[o + 6];
            if (t < 0) t = 0; else if (t > 1) t = 1;
            const ex = x - ax - dx * t, ez = z - az - dz * t;
            const rr = radius + seg[o + 7];
            const d2 = ex * ex + ez * ez;
            if (d2 >= rr * rr) continue;
            const nx = seg[o + 4], nz = seg[o + 5];
            if ((flags[s] & FLAG_ONE_SIDED) !== 0 && t > 0 && t < 1) {
              // Mur à une face, contact en pleine face : on ressort toujours du côté de la normale,
              // même si le centre est passé légèrement derrière.
              const push = rr + SKIN - (ex * nx + ez * nz);
              x += nx * push;
              z += nz * push;
            } else if (d2 > 1e-12) {
              // Coin, ou obstacle à deux faces : on s'écarte du point le plus proche.
              const d = Math.sqrt(d2);
              const push = (rr + SKIN - d) / d;
              x += ex * push;
              z += ez * push;
            } else {
              x += nx * (rr + SKIN);
              z += nz * (rr + SKIN);
            }
            moved = true;
          }
        }
      }
    }
    pos.x = x;
    pos.z = z;
    return moved;
  }

  /** Repousse le disque hors des obstacles (modifie pos). true s'il y a eu contact. */
  resolveCircle(pos: Vec2, radius: number): boolean {
    let hit = false;
    const bd = this.bounds;
    if (pos.x < bd.minX) { pos.x = bd.minX; hit = true; } else if (pos.x > bd.maxX) { pos.x = bd.maxX; hit = true; }
    if (pos.z < bd.minZ) { pos.z = bd.minZ; hit = true; } else if (pos.z > bd.maxZ) { pos.z = bd.maxZ; hit = true; }
    // 1. Centre dans un obstacle plein : retour sur la face libre la plus proche.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!this.solidAt(pos.x, pos.z)) break;
      hit = true;
      if (!this.findExit(pos.x, pos.z, radius)) break;
      pos.x = this.exitX;
      pos.z = this.exitZ;
    }
    // 2. Répulsion hors des segments, répétée tant qu'un contact subsiste (coins rentrants).
    for (let iter = 0; iter < 8; iter++) {
      if (!this.pushOut(pos, radius)) break;
      hit = true;
    }
    return hit;
  }

  /** Aucun obstacle ne touche le disque, et son centre n'est pas dans un obstacle plein. */
  isFree(x: number, z: number, radius: number): boolean {
    const bd = this.bounds;
    if (x < bd.minX || x > bd.maxX || z < bd.minZ || z > bd.maxZ) return false;
    const buckets = this.buckets;
    for (let k = 0; k < buckets.length; k++) {
      const b = buckets[k];
      if (x + radius < b.minX || x - radius > b.maxX || z + radius < b.minZ || z - radius > b.maxZ) continue;
      if (b.solidAt(x, z)) return false;
      if (b.segCount === 0) continue;
      const i0 = Math.max(0, Math.floor((x - radius - b.gx0) / COLLISION_CELL)), i1 = Math.min(b.nx - 1, Math.floor((x + radius - b.gx0) / COLLISION_CELL));
      const j0 = Math.max(0, Math.floor((z - radius - b.gz0) / COLLISION_CELL)), j1 = Math.min(b.nz - 1, Math.floor((z + radius - b.gz0) / COLLISION_CELL));
      const seg = b.seg;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const c = j * b.nx + i;
          for (let p = b.cellStart[c], end = b.cellStart[c + 1]; p < end; p++) {
            const o = b.cellItems[p] * SEG_STRIDE;
            const ax = seg[o], az = seg[o + 1];
            const dx = seg[o + 2] - ax, dz = seg[o + 3] - az;
            let t = ((x - ax) * dx + (z - az) * dz) * seg[o + 6];
            if (t < 0) t = 0; else if (t > 1) t = 1;
            const ex = x - ax - dx * t, ez = z - az - dz * t;
            const rr = radius + seg[o + 7];
            if (ex * ex + ez * ez < rr * rr) return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Parcourt les cellules traversées par le segment dans chaque lot et cherche l'intersection la
   * plus proche (ou la première venue si `any`). `mask` : 0 = tous les segments, FLAG_SIGHT = ceux
   * qui arrêtent le regard. Résultat dans hitT / hitSeg / hitBucket.
   */
  private cast(ax: number, az: number, bx: number, bz: number, mask: number, any: boolean): boolean {
    const dx = bx - ax, dz = bz - az;
    let bestT = 1.0000001;
    this.hitSeg = -1;
    this.hitBucket = null;
    if (dx === 0 && dz === 0) return false;
    const buckets = this.buckets;
    for (let k = 0; k < buckets.length; k++) {
      const b = buckets[k];
      if (b.segCount === 0) continue;
      // Découpe du rayon par la boîte du lot (Liang–Barsky).
      let t0 = 0, t1 = bestT < 1 ? bestT : 1;
      if (dx !== 0) {
        let ta = (b.minX - ax) / dx, tb = (b.maxX - ax) / dx;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
      } else if (ax < b.minX || ax > b.maxX) continue;
      if (dz !== 0) {
        let ta = (b.minZ - az) / dz, tb = (b.maxZ - az) / dz;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
      } else if (az < b.minZ || az > b.maxZ) continue;
      if (t0 > t1) continue;

      // Parcours de grille (DDA) à partir du point d'entrée.
      const px = ax + dx * t0, pz = az + dz * t0;
      let i = Math.floor((px - b.gx0) / COLLISION_CELL), j = Math.floor((pz - b.gz0) / COLLISION_CELL);
      if (i < 0) i = 0; else if (i >= b.nx) i = b.nx - 1;
      if (j < 0) j = 0; else if (j >= b.nz) j = b.nz - 1;
      const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
      const tDeltaX = dx !== 0 ? COLLISION_CELL / Math.abs(dx) : Infinity;
      const tDeltaZ = dz !== 0 ? COLLISION_CELL / Math.abs(dz) : Infinity;
      let tMaxX = dx !== 0 ? (b.gx0 + (dx > 0 ? i + 1 : i) * COLLISION_CELL - ax) / dx : Infinity;
      let tMaxZ = dz !== 0 ? (b.gz0 + (dz > 0 ? j + 1 : j) * COLLISION_CELL - az) / dz : Infinity;
      const seg = b.seg, flags = b.segFlags;
      for (;;) {
        const c = j * b.nx + i;
        for (let p = b.cellStart[c], end = b.cellStart[c + 1]; p < end; p++) {
          const s = b.cellItems[p];
          if ((flags[s] & mask) !== mask) continue;
          const o = s * SEG_STRIDE;
          const sx = seg[o], sz = seg[o + 1];
          const ex = seg[o + 2] - sx, ez = seg[o + 3] - sz;
          const denom = dx * ez - dz * ex;
          if (denom > -1e-12 && denom < 1e-12) continue;
          const wx = sx - ax, wz = sz - az;
          const t = (wx * ez - wz * ex) / denom;
          if (t < 0 || t >= bestT) continue;
          const u = (wx * dz - wz * dx) / denom;
          if (u < -1e-5 || u > 1.00001) continue;
          bestT = t;
          this.hitSeg = s;
          this.hitBucket = b;
          if (any) {
            this.hitT = t;
            return true;
          }
        }
        // Cellule suivante ; arrêt dès qu'elle commence après la meilleure intersection ou la sortie du lot.
        const tNext = tMaxX < tMaxZ ? tMaxX : tMaxZ;
        if (tNext > t1 || tNext > bestT) break;
        if (tMaxX < tMaxZ) {
          i += stepI;
          tMaxX += tDeltaX;
          if (i < 0 || i >= b.nx) break;
        } else {
          j += stepJ;
          tMaxZ += tDeltaZ;
          if (j < 0 || j >= b.nz) break;
        }
      }
    }
    this.hitT = bestT > 1 ? 1 : bestT;
    return this.hitSeg >= 0;
  }

  /** Premier obstacle rencontré de (ax, az) vers (bx, bz). Remplit toujours `out`. */
  raycast(ax: number, az: number, bx: number, bz: number, out: RayHit): boolean {
    out.id = 0;
    if (!this.cast(ax, az, bx, bz, 0, false) || this.hitBucket === null) {
      out.hit = false;
      out.t = 1;
      out.x = bx;
      out.z = bz;
      out.nx = 0;
      out.nz = 0;
      out.kind = 'none';
      out.height = 0;
      return false;
    }
    const b = this.hitBucket, s = this.hitSeg, o = s * SEG_STRIDE;
    const t = this.hitT;
    out.hit = true;
    out.t = t;
    out.x = ax + (bx - ax) * t;
    out.z = az + (bz - az) * t;
    // La normale retournée fait face à l'origine du rayon.
    let nx = b.seg[o + 4], nz = b.seg[o + 5];
    if (nx * (bx - ax) + nz * (bz - az) > 0) {
      nx = -nx;
      nz = -nz;
    }
    out.nx = nx;
    out.nz = nz;
    const kind = b.segFlags[s] & FLAG_KIND_MASK;
    out.kind = kind === KIND_BUILDING || kind === KIND_LANDMARK ? 'building' : 'barrier';
    out.height = b.segHeight[s];
    return true;
  }

  /** Rien n'arrête le regard entre les deux points. */
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    return !this.cast(ax, az, bx, bz, FLAG_SIGHT, true);
  }

  /** Un obstacle au déplacement (mur, grille, berge…) coupe-t-il le segment ? */
  blocked(ax: number, az: number, bx: number, bz: number): boolean {
    return this.cast(ax, az, bx, bz, 0, true);
  }

  /** Segments d'obstacles qui touchent le rectangle (diagnostic et banc d'essai : alloue). */
  forEachSegment(minX: number, minZ: number, maxX: number, maxZ: number, visit: (s: ObstacleSegmentView) => void): void {
    for (const b of this.buckets) {
      if (maxX < b.minX || minX > b.maxX || maxZ < b.minZ || minZ > b.maxZ) continue;
      for (let s = 0; s < b.segCount; s++) {
        const o = s * SEG_STRIDE;
        const ax = b.seg[o], az = b.seg[o + 1], bx = b.seg[o + 2], bz = b.seg[o + 3];
        if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX || Math.max(az, bz) < minZ || Math.min(az, bz) > maxZ) continue;
        visit({
          ax, az, bx, bz,
          kind: KIND_NAMES[b.segFlags[s] & FLAG_KIND_MASK] ?? 'barrier',
          height: b.segHeight[s],
          sight: (b.segFlags[s] & FLAG_SIGHT) !== 0,
        });
      }
    }
  }
}
