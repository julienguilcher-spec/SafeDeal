/* Constructeur de géométrie fusionnée pour les personnages et les objets tenus.
 * Chaque sommet porte : position et normale (dans le repère de SON os), teinte (rgba), uv, et un
 * attribut aSeg = (os, case de palette, identifiant de pièce, mode d'échelle + type de texte × 8). */

import * as THREE from 'three';

/** Cases de palette (couleurs par personne) ; SLOT_FIXED = teinte du sommet seule ; SLOT_ITEM = couleur d'instance d'objet. */
export const SLOT_SKIN = 0;
export const SLOT_HAIR = 1;
export const SLOT_TOP = 2;
export const SLOT_BOTTOM = 3;
export const SLOT_SHOES = 4;
export const SLOT_VEST = 5;
export const SLOT_GEAR = 6;
export const SLOT_ACCENT = 7;
export const SLOT_SLEEVE = 8;
export const SLOT_SHIN = 9;
export const SLOT_HAND = 10;
export const SLOT_BAND = 11;
export const SLOT_FIXED = 12;
export const SLOT_ITEM = 13;
export const PALETTE_SIZE = 12;

/** Modes d'échelle : uniforme (taille), membre (épaisseur × carrure), tête, aucun (objets). */
export const SCALE_UNIFORM = 0;
export const SCALE_LIMB = 1;
export const SCALE_HEAD = 2;
export const SCALE_NONE = 3;

/** Types de texte plaqué (atlas de textes). */
export const TEXT_NONE = 0;
export const TEXT_BACK = 1;
export const TEXT_CHEST = 2;
export const TEXT_SLOGAN = 3;
export const TEXT_RANK = 4;

/** Anneau d'une surface de révolution elliptique : [y, rx, rz, oz?, ox?, détailMin?]. */
export type Ring = readonly number[];

export interface LoftOptions {
  /** Exposant de super-ellipse (2 = ellipse ; 3-4 = section plus carrée). */
  power?: number;
  /** Fermer les extrémités par un pôle. */
  capStart?: boolean;
  capEnd?: boolean;
}

export class GeoBuilder {
  /** 0 = détail complet, 1 = simplifié, 2 = silhouette. */
  detail = 0;
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  seg: number[] = [];
  idx: number[] = [];

  // contexte courant
  bone = 0;
  slot = SLOT_FIXED;
  part = 0;
  mode = SCALE_UNIFORM;
  textKind = TEXT_NONE;
  r = 1; g = 1; b = 1; a = 1;

  // transformation affine courante (3 × 4, lignes) et pile
  private m: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  private stack: number[][] = [];
  private det = 1;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Fixe os, case de palette, pièce et mode d'échelle. */
  ctx(bone: number, slot: number, part: number, mode: number): this {
    this.bone = bone; this.slot = slot; this.part = part; this.mode = mode;
    this.textKind = TEXT_NONE;
    return this;
  }

  /** Teinte (0xRRGGBB, espace sRGB) et opacité des sommets suivants. */
  tint(hex: number, alpha = 1): this {
    const c = new THREE.Color(hex);
    this.r = c.r; this.g = c.g; this.b = c.b; this.a = alpha;
    return this;
  }

  /** Teinte neutre (la couleur vient entièrement de la palette), facteur d'ombrage optionnel. */
  shade(k = 1): this {
    this.r = k; this.g = k; this.b = k; this.a = 1;
    return this;
  }

  push(): this {
    this.stack.push(this.m.slice());
    return this;
  }

  pop(): this {
    const m = this.stack.pop();
    if (m) this.m = m;
    this.updateDet();
    return this;
  }

  identity(): this {
    this.m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    this.det = 1;
    return this;
  }

  private mul(n: number[]): void {
    const a = this.m, o = new Array<number>(12);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        o[r * 4 + c] = a[r * 4] * n[c] + a[r * 4 + 1] * n[4 + c] + a[r * 4 + 2] * n[8 + c] + (c === 3 ? a[r * 4 + 3] : 0);
      }
    }
    this.m = o;
    this.updateDet();
  }

  private updateDet(): void {
    const m = this.m;
    this.det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
  }

  translate(x: number, y: number, z: number): this {
    this.mul([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]);
    return this;
  }

  scale(x: number, y: number, z: number): this {
    this.mul([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]);
    return this;
  }

  rotX(a: number): this {
    const c = Math.cos(a), s = Math.sin(a);
    this.mul([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]);
    return this;
  }

  rotY(a: number): this {
    const c = Math.cos(a), s = Math.sin(a);
    this.mul([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]);
    return this;
  }

  rotZ(a: number): this {
    const c = Math.cos(a), s = Math.sin(a);
    this.mul([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]);
    return this;
  }

  /** Ajoute un sommet (coordonnées locales, transformées par la matrice courante). Retourne son index. */
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u = 0, v = 0): number {
    const m = this.m;
    this.pos.push(m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]);
    // normale : transposée inverse approchée (rotation + échelle axiale) → on divise par le carré des échelles
    let ax = m[0] * nx + m[1] * ny + m[2] * nz, ay = m[4] * nx + m[5] * ny + m[6] * nz, az = m[8] * nx + m[9] * ny + m[10] * nz;
    const l = Math.hypot(ax, ay, az) || 1;
    ax /= l; ay /= l; az /= l;
    this.nrm.push(ax, ay, az);
    this.col.push(this.r, this.g, this.b, this.a);
    this.uv.push(u, v);
    this.seg.push(this.bone, this.slot, this.part, this.mode + this.textKind * 8);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    if (this.det < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  quadIdx(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** Nombre de segments radiaux selon le niveau de détail. */
  rad(n0: number, n1: number, n2: number): number {
    return this.detail === 0 ? n0 : this.detail === 1 ? n1 : n2;
  }

  /**
   * Surface « loftée » le long de Y : anneaux elliptiques [y, rx, rz, oz, ox, détailMin].
   * Un anneau dont détailMin < détail courant est ignoré (simplification).
   */
  loft(ringsIn: readonly Ring[], radial: number, opts: LoftOptions = {}): void {
    const rings: Ring[] = [];
    for (const rg of ringsIn) if ((rg[5] ?? 2) >= this.detail) rings.push(rg);
    const n = rings.length;
    if (n < 2) return;
    const power = opts.power ?? 2;
    const e = 2 / power;
    const P: number[] = [];
    for (let i = 0; i < n; i++) {
      const [y, rx, rz, oz = 0, ox = 0] = rings[i];
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * Math.PI * 2;
        let c = Math.cos(th), s = Math.sin(th);
        if (power !== 2) {
          c = Math.sign(c) * Math.pow(Math.abs(c), e);
          s = Math.sign(s) * Math.pow(Math.abs(s), e);
        }
        P.push(ox + rx * c, y, oz + rz * s);
      }
    }
    const flip = rings[n - 1][0] < rings[0][0];
    const base = this.vertexCount;
    const at = (i: number, j: number): number => (i * radial + ((j + radial) % radial)) * 3;
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : i, i1 = i < n - 1 ? i + 1 : i;
      for (let j = 0; j < radial; j++) {
        const a = at(i1, j), b = at(i0, j), c = at(i, j + 1), d = at(i, j - 1), p = at(i, j);
        const tx = P[a] - P[b], ty = P[a + 1] - P[b + 1], tz = P[a + 2] - P[b + 2];
        const ux = P[c] - P[d], uy = P[c + 1] - P[d + 1], uz = P[c + 2] - P[d + 2];
        let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux;
        if (flip) { nx = -nx; ny = -ny; nz = -nz; }
        let l = Math.hypot(nx, ny, nz);
        if (l < 1e-9) {
          // anneau dégénéré : normale radiale
          const th = (j / radial) * Math.PI * 2;
          nx = Math.cos(th); ny = 0; nz = Math.sin(th); l = 1;
        }
        this.vert(P[p], P[p + 1], P[p + 2], nx / l, ny / l, nz / l);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * radial + j, b = base + i * radial + ((j + 1) % radial);
        const c = base + (i + 1) * radial + j, d = base + (i + 1) * radial + ((j + 1) % radial);
        if (flip) { this.tri(a, b, c); this.tri(b, d, c); } else { this.tri(a, c, b); this.tri(b, c, d); }
      }
    }
    const dirY = flip ? -1 : 1;
    if (opts.capStart !== false) {
      const [y, , , oz = 0, ox = 0] = rings[0];
      const pole = this.vert(ox, y, oz, 0, -dirY, 0);
      for (let j = 0; j < radial; j++) {
        const a = base + j, b = base + ((j + 1) % radial);
        if (flip) this.tri(pole, b, a); else this.tri(pole, a, b);
      }
    }
    if (opts.capEnd !== false) {
      const [y, , , oz = 0, ox = 0] = rings[n - 1];
      const pole = this.vert(ox, y, oz, 0, dirY, 0);
      const o = base + (n - 1) * radial;
      for (let j = 0; j < radial; j++) {
        const a = o + j, b = o + ((j + 1) % radial);
        if (flip) this.tri(pole, a, b); else this.tri(pole, b, a);
      }
    }
  }

  /** Ellipsoïde centré. */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, segU: number, segV: number): void {
    const base = this.vertexCount;
    for (let i = 0; i <= segV; i++) {
      const ph = (i / segV) * Math.PI;
      const sy = Math.cos(ph), sr = Math.sin(ph);
      for (let j = 0; j < segU; j++) {
        const th = (j / segU) * Math.PI * 2;
        const x = sr * Math.cos(th), z = sr * Math.sin(th);
        this.vert(cx + rx * x, cy + ry * sy, cz + rz * z, x / rx, sy / ry, z / rz);
      }
    }
    for (let i = 0; i < segV; i++) {
      for (let j = 0; j < segU; j++) {
        const a = base + i * segU + j, b = base + i * segU + ((j + 1) % segU);
        const c = base + (i + 1) * segU + j, d = base + (i + 1) * segU + ((j + 1) % segU);
        if (i > 0) this.tri(a, b, c);
        if (i < segV - 1) this.tri(b, d, c);
      }
    }
  }

  /** Boîte centrée, faces planes. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces: number[][] = [
      [1, 0, 0, 0, 0, 1, 0, 1, 0], [-1, 0, 0, 0, 0, -1, 0, 1, 0],
      [0, 1, 0, 1, 0, 0, 0, 0, 1], [0, -1, 0, 1, 0, 0, 0, 0, -1],
      [0, 0, 1, -1, 0, 0, 0, 1, 0], [0, 0, -1, 1, 0, 0, 0, 1, 0],
    ];
    for (const f of faces) {
      const [nx, ny, nz, ux, uy, uz, vx, vy, vz] = f;
      const px = cx + nx * hx, py = cy + ny * hy, pz = cz + nz * hz;
      const eu = [ux * hx, uy * hy, uz * hz], ev = [vx * hx, vy * hy, vz * hz];
      const a = this.vert(px - eu[0] - ev[0], py - eu[1] - ev[1], pz - eu[2] - ev[2], nx, ny, nz, 0, 0);
      const b = this.vert(px + eu[0] - ev[0], py + eu[1] - ev[1], pz + eu[2] - ev[2], nx, ny, nz, 1, 0);
      const c = this.vert(px + eu[0] + ev[0], py + eu[1] + ev[1], pz + eu[2] + ev[2], nx, ny, nz, 1, 1);
      const d = this.vert(px - eu[0] + ev[0], py - eu[1] + ev[1], pz - eu[2] + ev[2], nx, ny, nz, 0, 1);
      // orientation : (u × v) doit valoir n
      const wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx;
      if (wx * nx + wy * ny + wz * nz > 0) this.quadIdx(a, b, c, d); else this.quadIdx(a, d, c, b);
    }
  }

  /** Cylindre / cône tronqué entre deux points, extrémités fermées (optionnel). */
  cyl(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number, radial: number, capped = true): void {
    let ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
    const len = Math.hypot(ax, ay, az) || 1;
    ax /= len; ay /= len; az /= len;
    // base orthonormée (u, v, axe)
    let ux = 0, uy = 0, uz = 0;
    if (Math.abs(ay) < 0.9) { ux = az; uy = 0; uz = -ax; } else { ux = 1; uy = 0; uz = 0; }
    const k = ux * ax + uy * ay + uz * az;
    ux -= k * ax; uy -= k * ay; uz -= k * az;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
    const base = this.vertexCount;
    const slope = (r0 - r1) / len;
    for (let i = 0; i < 2; i++) {
      const r = i === 0 ? r0 : r1, px = i === 0 ? x0 : x1, py = i === 0 ? y0 : y1, pz = i === 0 ? z0 : z1;
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const dx = ux * c + vx * s, dy = uy * c + vy * s, dz = uz * c + vz * s;
        this.vert(px + dx * r, py + dy * r, pz + dz * r, dx + ax * slope, dy + ay * slope, dz + az * slope);
      }
    }
    for (let j = 0; j < radial; j++) {
      const a = base + j, b = base + ((j + 1) % radial), c = base + radial + j, d = base + radial + ((j + 1) % radial);
      this.tri(a, b, c);
      this.tri(b, d, c);
    }
    if (capped) {
      const c0 = this.vert(x0, y0, z0, -ax, -ay, -az);
      const c1 = this.vert(x1, y1, z1, ax, ay, az);
      const e0 = this.vertexCount;
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const dx = ux * c + vx * s, dy = uy * c + vy * s, dz = uz * c + vz * s;
        this.vert(x0 + dx * r0, y0 + dy * r0, z0 + dz * r0, -ax, -ay, -az);
        this.vert(x1 + dx * r1, y1 + dy * r1, z1 + dz * r1, ax, ay, az);
      }
      for (let j = 0; j < radial; j++) {
        const j1 = (j + 1) % radial;
        this.tri(c0, e0 + j1 * 2, e0 + j * 2);
        this.tri(c1, e0 + j * 2 + 1, e0 + j1 * 2 + 1);
      }
    }
  }

  /**
   * Quadrilatère plan (a, b, c, d dans le sens direct vu de face), avec uv de 0..1 (a = bas gauche).
   * `double` ajoute la face arrière.
   */
  quad(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
    double = false,
  ): void {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = dx - ax, e2y = dy - ay, e2z = dz - az;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const a = this.vert(ax, ay, az, nx, ny, nz, 0, 0), b = this.vert(bx, by, bz, nx, ny, nz, 1, 0);
    const c = this.vert(cx, cy, cz, nx, ny, nz, 1, 1), d = this.vert(dx, dy, dz, nx, ny, nz, 0, 1);
    this.quadIdx(a, b, c, d);
    if (double) {
      const a2 = this.vert(ax, ay, az, -nx, -ny, -nz, 1, 0), b2 = this.vert(bx, by, bz, -nx, -ny, -nz, 0, 0);
      const c2 = this.vert(cx, cy, cz, -nx, -ny, -nz, 0, 1), d2 = this.vert(dx, dy, dz, -nx, -ny, -nz, 1, 1);
      this.quadIdx(a2, d2, c2, b2);
    }
  }

  /** Copie une géométrie Three.js (position, normale, couleur éventuelle) avec une matrice optionnelle. */
  mesh(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    let nAttr = g.getAttribute('normal');
    if (!nAttr) { g.computeVertexNormals(); nAttr = g.getAttribute('normal'); }
    const cAttr = g.getAttribute('color');
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    const r0 = this.r, g0 = this.g, b0 = this.b;
    const base = this.vertexCount;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      nv.fromBufferAttribute(nAttr, i);
      if (matrix && nm) { v.applyMatrix4(matrix); nv.applyMatrix3(nm).normalize(); }
      if (cAttr) { this.r = r0 * cAttr.getX(i); this.g = g0 * cAttr.getY(i); this.b = b0 * cAttr.getZ(i); }
      this.vert(v.x, v.y, v.z, nv.x, nv.y, nv.z);
    }
    this.r = r0; this.g = g0; this.b = b0;
    for (let i = 0; i + 2 < p.count; i += 3) this.tri(base + i, base + i + 1, base + i + 2);
  }

  /** Ajoute le contenu d'un autre constructeur (sans transformation). */
  append(o: GeoBuilder): void {
    const base = this.vertexCount;
    for (const x of o.pos) this.pos.push(x);
    for (const x of o.nrm) this.nrm.push(x);
    for (const x of o.col) this.col.push(x);
    for (const x of o.uv) this.uv.push(x);
    for (const x of o.seg) this.seg.push(x);
    for (const x of o.idx) this.idx.push(base + x);
  }

  /** Produit la géométrie instanciable (attributs de sommets ; les attributs d'instance sont ajoutés par l'appelant). */
  build(): THREE.InstancedBufferGeometry {
    const geo = new THREE.InstancedBufferGeometry();
    const n = this.vertexCount;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    const nrm = new Int8Array(n * 3);
    for (let i = 0; i < n * 3; i++) nrm[i] = Math.max(-127, Math.min(127, Math.round(this.nrm[i] * 127)));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    const col = new Uint8Array(n * 4);
    for (let i = 0; i < n * 4; i++) col[i] = Math.max(0, Math.min(255, Math.round(this.col[i] * 255)));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    geo.setAttribute('aSeg', new THREE.BufferAttribute(new Uint8Array(this.seg), 4, false));
    geo.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(this.idx), 1) : new THREE.BufferAttribute(new Uint16Array(this.idx), 1));
    return geo;
  }
}
