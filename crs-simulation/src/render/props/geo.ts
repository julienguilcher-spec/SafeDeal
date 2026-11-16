/* =====================================================================================
 * RENDU DU DÉCOR — géométrie procédurale (logique pure, sans DOM ni Three.js).
 *
 * GeoBuilder construit un modèle pièce par pièce (boîtes, troncs de cône, révolutions, tubes, quads
 * texturés), avec une pile de transformations et des étiquettes de pièce (filtrées selon l'état).
 *
 * Repère d'un modèle : origine au sol au centre de l'emprise, +y vers le haut, +z vers l'avant
 * (cap), +x = axe local x du contrat (demi-largeur halfX).
 * Octets d'effet (attribut aFx) : x = type d'émission (FX_*), y = force, z = phase, w = brillance.
 * ===================================================================================== */

import { region, WHITE_U, WHITE_V } from './atlas-layout';
import type { Region } from './atlas-layout';
import { MeshBuf, matNew, matRotX, matRotY, matRotZ, matScale, matTranslate } from './meshbuf';
import type { Mat, TagSpot } from './meshbuf';

// ───────────────────────────── types d'émission ─────────────────────────────

export const FX_NONE = 0;
/** Lanterne d'éclairage public : suit l'allumage des candélabres. */
export const FX_LAMP = 1;
/** Intérieur de boutique, enseigne, caisson publicitaire : allumé la nuit. */
export const FX_NIGHT = 2;
/** Toujours allumé (écran de distributeur). */
export const FX_ON = 3;
/** Feux tricolores : rouge, orange, vert (cycle calculé par le shader, décalé par la phase). */
export const FX_TL_R = 4;
export const FX_TL_A = 5;
export const FX_TL_G = 6;
/** Lueur d'incendie vacillante (orangée, indépendante de la couleur de la surface). */
export const FX_FIRE = 7;
/** Clignotant (croix de pharmacie). */
export const FX_BLINK = 8;
/** Répétiteur piéton : rouge et vert, en opposition avec le feu des voitures. */
export const FX_PED_R = 9;
export const FX_PED_G = 10;

// ───────────────────────────── étiquettes de pièce ─────────────────────────────

export const P_BODY = 0;
/** Brûle et disparaît (pneus, selle, bâche, sac). */
export const P_SOFT = 1;
/** Fond en un amas (plastique). */
export const P_MELT = 2;
/** Source de lumière : supprimée quand l'objet est cassé. */
export const P_LIGHT = 3;
/** N'existe que calciné (amas fondu, cendres, sol noirci). */
export const P_ASH = 4;
/** N'existe que cassé (éclats au sol, fils qui pendent). */
export const P_WRECK = 5;
/** Détail absent quand l'objet est cassé ou calciné. */
export const P_FRAGILE = 6;
/** Vitrage n° i intact : P_PANE + i ; ce qui le remplace une fois brisé : P_SHARD + i. */
export const P_PANE = 8;
export const P_SHARD = 16;

// ───────────────────────────── modèle ─────────────────────────────

export interface Part {
  tag: number;
  /** Plages dans le tampon opaque. */
  v0: number; v1: number; i0: number; i1: number;
  /** Plages dans le tampon du verre. */
  gv0: number; gv1: number; gi0: number; gi1: number;
}

/** Source de lumière d'un modèle : halo (panneau face à la caméra) et tache au sol. */
export interface HaloSpec {
  x: number; y: number; z: number;
  /** Rayon du halo (m). */
  size: number;
  color: number;
  intensity: number;
  /** Condition d'allumage (FX_LAMP, FX_NIGHT, FX_TL_R…). */
  gate: number;
  /** Rayon de la tache de lumière au sol (0 = aucune). */
  pool: number;
  /** Intensité (cd) d'une vraie lumière si l'objet est proche de la caméra (0 = jamais). */
  light: number;
  /** Étiquette de la pièce porteuse. */
  tag: number;
}

export interface Tpl {
  o: MeshBuf;
  /** Sous-maillage transparent (verre), ou null. */
  g: MeshBuf | null;
  parts: Part[];
  halos: HaloSpec[];
  tags: TagSpot[];
}

export const F_PX = 1, F_NX = 2, F_PY = 4, F_NY = 8, F_PZ = 16, F_NZ = 32;
/** Faces à ne pas produire : dessous (objet posé au sol). */
export const NO_BOTTOM = F_NY;
export const NO_TOP = F_PY;
export const NO_ENDS = F_PY | F_NY;

const TAU = Math.PI * 2;

export class GeoBuilder {
  private readonly opaque = new MeshBuf(512, 1024);
  private readonly glassBuf = new MeshBuf(64, 128);
  /** Tampon principal : celui du modèle, ou un tampon extérieur en mode « plume » (voir begin()). */
  private main: MeshBuf = this.opaque;
  private cur: MeshBuf = this.opaque;
  private readonly parts: Part[] = [];
  private curPart: Part;
  private m: Mat = matNew();
  private readonly stack: Mat[] = [];
  private depth = 0;
  private readonly nm = new Float64Array(9);
  private nmDirty = true;
  private cr = 200; private cg = 200; private cb = 200; private ca = 255;
  private fk = 0; private fs = 0; private fp = 0; private fg = 0;
  private reg: Region | null = null;
  readonly halos: HaloSpec[] = [];
  readonly tagSpots: TagSpot[] = [];

  constructor(readonly lod: number, readonly skin: number) {
    this.curPart = this.openPart(P_BODY);
  }

  // ── état ──

  private openPart(tag: number): Part {
    const p: Part = {
      tag, v0: this.opaque.nv, v1: this.opaque.nv, i0: this.opaque.ni, i1: this.opaque.ni,
      gv0: this.glassBuf.nv, gv1: this.glassBuf.nv, gi0: this.glassBuf.ni, gi1: this.glassBuf.ni,
    };
    this.parts.push(p);
    return p;
  }

  private closePart(): void {
    const p = this.curPart;
    p.v1 = this.opaque.nv;
    p.i1 = this.opaque.ni;
    p.gv1 = this.glassBuf.nv;
    p.gi1 = this.glassBuf.ni;
  }

  /** Commence une nouvelle pièce étiquetée (les pièces sont filtrées selon l'état de l'objet). */
  part(tag: number): this {
    if (tag === this.curPart.tag) return this;
    this.closePart();
    this.curPart = this.openPart(tag);
    return this;
  }

  /** Couleur sRGB 0xRRGGBB des sommets à venir. */
  c(hex: number): this {
    this.cr = (hex >> 16) & 255;
    this.cg = (hex >> 8) & 255;
    this.cb = hex & 255;
    return this;
  }

  /** Région d'atlas des faces à venir ('' = sans texture). */
  tex(name: string): this {
    this.reg = name === '' ? null : region(name);
    return this;
  }

  texRegion(r: Region | null): this {
    this.reg = r;
    return this;
  }

  /** Émission : type FX_*, force 0..1, phase 0..1. */
  emit(kind: number, strength = 1, phase = 0): this {
    this.fk = kind;
    this.fs = Math.max(0, Math.min(255, Math.round(strength * 255)));
    this.fp = Math.max(0, Math.min(255, Math.round(phase * 255)));
    return this;
  }

  /** Brillance 0..1 (reflets de vitre, métal poli). */
  gloss(g: number): this {
    this.fg = Math.max(0, Math.min(255, Math.round(g * 255)));
    return this;
  }

  /** Les primitives suivantes vont dans le sous-maillage transparent, avec cette opacité. */
  glass(alpha: number): this {
    this.cur = this.glassBuf;
    this.ca = Math.max(0, Math.min(255, Math.round(alpha * 255)));
    return this;
  }

  /** Opacité des sommets à venir, sans changer de tampon (décalcomanies fondues écrites en mode « plume »). */
  alpha(a: number): this {
    this.ca = Math.max(0, Math.min(255, Math.round(a * 255)));
    return this;
  }

  solid(): this {
    this.cur = this.main;
    this.ca = 255;
    return this;
  }

  /**
   * Mode « plume » : réemploie ce constructeur pour écrire directement dans `dst`, dans le repère donné
   * par `base` (devantures, barricades). L'état (couleur, texture, émission, pile) est remis à zéro.
   * Ne pas appeler part() ni finish() dans ce mode.
   */
  begin(dst: MeshBuf, base: Mat): this {
    this.main = dst;
    this.cur = dst;
    this.m.set(base);
    this.depth = 0;
    this.nmDirty = true;
    this.cr = this.cg = this.cb = 200;
    this.ca = 255;
    this.fk = this.fs = this.fp = this.fg = 0;
    this.reg = null;
    this.halos.length = 0;
    this.tagSpots.length = 0;
    return this;
  }

  // ── transformations ──

  push(): this {
    let s = this.stack[this.depth];
    if (!s) {
      s = new Float64Array(12);
      this.stack[this.depth] = s;
    }
    s.set(this.m);
    this.depth++;
    return this;
  }

  pop(): this {
    if (this.depth > 0) {
      this.depth--;
      this.m.set(this.stack[this.depth]!);
      this.nmDirty = true;
    }
    return this;
  }

  move(x: number, y: number, z: number): this {
    matTranslate(this.m, x, y, z);
    return this;
  }

  rotY(a: number): this {
    matRotY(this.m, a);
    this.nmDirty = true;
    return this;
  }

  rotX(a: number): this {
    matRotX(this.m, a);
    this.nmDirty = true;
    return this;
  }

  rotZ(a: number): this {
    matRotZ(this.m, a);
    this.nmDirty = true;
    return this;
  }

  scale(sx: number, sy: number, sz: number): this {
    matScale(this.m, sx, sy, sz);
    this.nmDirty = true;
    return this;
  }

  private normalMatrix(): Float64Array {
    if (this.nmDirty) {
      const m = this.m, n = this.nm;
      const a = m[0]!, b = m[1]!, c = m[2]!, d = m[4]!, e = m[5]!, f = m[6]!, g = m[8]!, h = m[9]!, i = m[10]!;
      // cofacteurs : transposée inverse à un facteur près (exact même avec une échelle non uniforme)
      n[0] = e * i - f * h; n[1] = f * g - d * i; n[2] = d * h - e * g;
      n[3] = c * h - b * i; n[4] = a * i - c * g; n[5] = b * g - a * h;
      n[6] = b * f - c * e; n[7] = c * d - a * f; n[8] = a * e - b * d;
      this.nmDirty = false;
    }
    return this.nm;
  }

  // ── sommets et triangles ──

  private vtx(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    const b = this.cur;
    b.ensure(1, 0);
    const m = this.m;
    const k = b.nv;
    b.pos[k * 3] = m[0]! * x + m[1]! * y + m[2]! * z + m[3]!;
    b.pos[k * 3 + 1] = m[4]! * x + m[5]! * y + m[6]! * z + m[7]!;
    b.pos[k * 3 + 2] = m[8]! * x + m[9]! * y + m[10]! * z + m[11]!;
    const n = this.normalMatrix();
    let ax = n[0]! * nx + n[1]! * ny + n[2]! * nz;
    let ay = n[3]! * nx + n[4]! * ny + n[5]! * nz;
    let az = n[6]! * nx + n[7]! * ny + n[8]! * nz;
    const l = Math.sqrt(ax * ax + ay * ay + az * az);
    if (l > 1e-9) {
      ax /= l; ay /= l; az /= l;
    } else {
      ax = 0; ay = 1; az = 0;
    }
    b.nrm[k * 3] = Math.round(ax * 127);
    b.nrm[k * 3 + 1] = Math.round(ay * 127);
    b.nrm[k * 3 + 2] = Math.round(az * 127);
    b.col[k * 4] = this.cr;
    b.col[k * 4 + 1] = this.cg;
    b.col[k * 4 + 2] = this.cb;
    b.col[k * 4 + 3] = this.ca;
    const r = this.reg;
    if (r) {
      b.uv[k * 2] = r.u0 + (r.u1 - r.u0) * u;
      b.uv[k * 2 + 1] = r.v0 + (r.v1 - r.v0) * v;
    } else {
      b.uv[k * 2] = WHITE_U;
      b.uv[k * 2 + 1] = WHITE_V;
    }
    b.fx[k * 4] = this.fk;
    b.fx[k * 4 + 1] = this.fs;
    b.fx[k * 4 + 2] = this.fp;
    b.fx[k * 4 + 3] = this.fg;
    b.nv++;
    return k;
  }

  private tri(a: number, b: number, c: number): void {
    const buf = this.cur;
    buf.ensure(0, 3);
    buf.idx[buf.ni++] = a;
    buf.idx[buf.ni++] = b;
    buf.idx[buf.ni++] = c;
  }

  /**
   * Quadrilatère a (bas gauche) → b (bas droite) → c (haut droite) → d (haut gauche), vu de face.
   * `double` ajoute le revers (texture lisible des deux côtés). u0..u1, v0..v1 : portion de la région.
   */
  quad(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
    double = false, u0 = 0, v0 = 0, u1 = 1, v1 = 1,
  ): this {
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = dx - ax, fy = dy - ay, fz = dz - az;
    const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const i0 = this.vtx(ax, ay, az, nx, ny, nz, u0, v0);
    const i1 = this.vtx(bx, by, bz, nx, ny, nz, u1, v0);
    const i2 = this.vtx(cx, cy, cz, nx, ny, nz, u1, v1);
    const i3 = this.vtx(dx, dy, dz, nx, ny, nz, u0, v1);
    this.tri(i0, i1, i2);
    this.tri(i0, i2, i3);
    if (double) {
      const j0 = this.vtx(bx, by, bz, -nx, -ny, -nz, u0, v0);
      const j1 = this.vtx(ax, ay, az, -nx, -ny, -nz, u1, v0);
      const j2 = this.vtx(dx, dy, dz, -nx, -ny, -nz, u1, v1);
      const j3 = this.vtx(cx, cy, cz, -nx, -ny, -nz, u0, v1);
      this.tri(j0, j1, j2);
      this.tri(j0, j2, j3);
    }
    return this;
  }

  /** Rectangle vertical face à +z, centré en (cx, cy), dans le plan z. */
  quadZ(cx: number, cy: number, z: number, w: number, h: number, double = false, u0 = 0, v0 = 0, u1 = 1, v1 = 1): this {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    return this.quad(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z, double, u0, v0, u1, v1);
  }

  /** Rectangle vertical face à +x, centré en (cy, cz), dans le plan x. */
  quadX(x: number, cy: number, cz: number, d: number, h: number, double = false): this {
    const z0 = cz - d / 2, z1 = cz + d / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    return this.quad(x, y0, z1, x, y0, z0, x, y1, z0, x, y1, z1, double);
  }

  /** Rectangle vertical face à -z (revers d'un panneau). */
  quadNZ(cx: number, cy: number, z: number, w: number, h: number, u0 = 0, v0 = 0, u1 = 1, v1 = 1): this {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    return this.quad(x1, y0, z, x0, y0, z, x0, y1, z, x1, y1, z, false, u0, v0, u1, v1);
  }

  /** Rectangle vertical face à -x. */
  quadNX(x: number, cy: number, cz: number, d: number, h: number): this {
    const z0 = cz - d / 2, z1 = cz + d / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    return this.quad(x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0);
  }

  /** Rectangle horizontal face au ciel (décalcomanie de sol, plateau). */
  quadY(cx: number, y: number, cz: number, w: number, d: number, double = false): this {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    return this.quad(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0, double);
  }

  /** Boîte centrée. `skip` : faces à omettre (F_*). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, skip = 0): this {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    if (!(skip & F_PZ)) this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1);
    if (!(skip & F_NZ)) this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0);
    if (!(skip & F_PX)) this.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1);
    if (!(skip & F_NX)) this.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0);
    if (!(skip & F_PY)) this.quad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0);
    if (!(skip & F_NY)) this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1);
    return this;
  }

  /** Boîte évasée : section (sx0 × sz0) à la base y0, (sx1 × sz1) au sommet y0 + h. */
  taper(cx: number, y0: number, cz: number, sx0: number, sz0: number, sx1: number, sz1: number, h: number, skip = 0): this {
    const a = sx0 / 2, b = sz0 / 2, c = sx1 / 2, d = sz1 / 2, y1 = y0 + h;
    if (!(skip & F_PZ)) this.quad(cx - a, y0, cz + b, cx + a, y0, cz + b, cx + c, y1, cz + d, cx - c, y1, cz + d);
    if (!(skip & F_NZ)) this.quad(cx + a, y0, cz - b, cx - a, y0, cz - b, cx - c, y1, cz - d, cx + c, y1, cz - d);
    if (!(skip & F_PX)) this.quad(cx + a, y0, cz + b, cx + a, y0, cz - b, cx + c, y1, cz - d, cx + c, y1, cz + d);
    if (!(skip & F_NX)) this.quad(cx - a, y0, cz - b, cx - a, y0, cz + b, cx - c, y1, cz + d, cx - c, y1, cz - d);
    if (!(skip & F_PY)) this.quad(cx - c, y1, cz + d, cx + c, y1, cz + d, cx + c, y1, cz - d, cx - c, y1, cz - d);
    if (!(skip & F_NY)) this.quad(cx - a, y0, cz - b, cx + a, y0, cz - b, cx + a, y0, cz + b, cx - a, y0, cz + b);
    return this;
  }

  /**
   * Tronc de cône vertical : rayon r0 à la base y0, r1 au sommet y0 + h. caps : 1 = dessus, 2 = dessous,
   * 3 = les deux. flat : facettes (prisme). La texture s'enroule (u) et monte (v).
   */
  cyl(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, seg: number, caps = 1, flat = false): this {
    const y1 = y0 + h;
    const slope = r0 - r1;
    if (flat) {
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, am = (a0 + a1) / 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const nx = Math.cos(am) * h, nz = Math.sin(am) * h;
        const u0 = i / seg, u1 = (i + 1) / seg;
        const b0 = this.vtx(cx + r0 * c0, y0, cz + r0 * s0, nx, slope, nz, u0, 0);
        const t0 = this.vtx(cx + r1 * c0, y1, cz + r1 * s0, nx, slope, nz, u0, 1);
        const t1 = this.vtx(cx + r1 * c1, y1, cz + r1 * s1, nx, slope, nz, u1, 1);
        const b1 = this.vtx(cx + r0 * c1, y0, cz + r0 * s1, nx, slope, nz, u1, 0);
        this.tri(b0, t0, t1);
        this.tri(b0, t1, b1);
      }
    } else {
      let pb = -1, pt = -1;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
        const b = this.vtx(cx + r0 * c, y0, cz + r0 * s, c * h, slope, s * h, i / seg, 0);
        const t = this.vtx(cx + r1 * c, y1, cz + r1 * s, c * h, slope, s * h, i / seg, 1);
        if (i > 0) {
          this.tri(pb, pt, t);
          this.tri(pb, t, b);
        }
        pb = b;
        pt = t;
      }
    }
    if ((caps & 1) && r1 > 1e-4) this.disc(cx, y1, cz, r1, seg, true);
    if ((caps & 2) && r0 > 1e-4) this.disc(cx, y0, cz, r0, seg, false);
    return this;
  }

  /**
   * Portion de cylindre vertical tournée vers l'extérieur, de l'angle a0 à a1 (rad ; position =
   * (cos a, sin a) dans le plan x, z). La texture se lit de gauche à droite vue de l'extérieur.
   */
  arc(cx: number, y0: number, cz: number, r: number, h: number, a0: number, a1: number, seg: number): this {
    let pb = -1, pt = -1;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, a = a0 + (a1 - a0) * t, c = Math.cos(a), s = Math.sin(a);
      const b = this.vtx(cx + r * c, y0, cz + r * s, c, 0, s, 1 - t, 0);
      const tp = this.vtx(cx + r * c, y0 + h, cz + r * s, c, 0, s, 1 - t, 1);
      if (i > 0) {
        this.tri(pb, pt, tp);
        this.tri(pb, tp, b);
      }
      pb = b;
      pt = tp;
    }
    return this;
  }

  /** Disque horizontal (éventail), tourné vers le haut ou vers le bas. */
  disc(cx: number, y: number, cz: number, r: number, seg: number, up = true): this {
    const ny = up ? 1 : -1;
    const c = this.vtx(cx, y, cz, 0, ny, 0, 0.5, 0.5);
    let prev = -1;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU, co = Math.cos(a), si = Math.sin(a);
      const k = this.vtx(cx + r * co, y, cz + r * si, 0, ny, 0, 0.5 + co * 0.5, 0.5 - si * 0.5);
      if (i > 0) {
        if (up) this.tri(c, k, prev);
        else this.tri(c, prev, k);
      }
      prev = k;
    }
    return this;
  }

  /**
   * Surface de révolution autour de l'axe vertical passant par (cx, cz). profile = [r0, y0, r1, y1, …],
   * parcouru de bas en haut le long de la silhouette extérieure.
   */
  lathe(profile: readonly number[], seg: number, cx = 0, cz = 0, flat = false): this {
    const n = profile.length >> 1;
    for (let j = 0; j < n - 1; j++) {
      const r0 = profile[j * 2]!, y0 = profile[j * 2 + 1]!, r1 = profile[j * 2 + 2]!, y1 = profile[j * 2 + 3]!;
      // normales : segment courant, adoucies avec les voisins si la surface est lisse
      let dr0 = r1 - r0, dy0 = y1 - y0, dr1 = dr0, dy1 = dy0;
      if (!flat) {
        if (j > 0) {
          const pr = r0 - profile[j * 2 - 2]!, py = y0 - profile[j * 2 - 1]!;
          const l0 = Math.hypot(pr, py) || 1, l1 = Math.hypot(dr0, dy0) || 1;
          const tr = pr / l0 + dr0 / l1, ty = py / l0 + dy0 / l1;
          // arête vive (plus de ~60°) : pas de lissage
          if ((pr * dr0 + py * dy0) / (l0 * l1) > 0.45) {
            dr0 = tr;
            dy0 = ty;
          }
        }
        if (j < n - 2) {
          const qr = profile[j * 2 + 4]! - r1, qy = profile[j * 2 + 5]! - y1;
          const l0 = Math.hypot(r1 - r0, y1 - y0) || 1, l1 = Math.hypot(qr, qy) || 1;
          if (((r1 - r0) * qr + (y1 - y0) * qy) / (l0 * l1) > 0.45) {
            dr1 = (r1 - r0) / l0 + qr / l1;
            dy1 = (y1 - y0) / l0 + qy / l1;
          }
        }
      }
      let pb = -1, pt = -1;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
        const b = this.vtx(cx + r0 * c, y0, cz + r0 * s, c * dy0, -dr0, s * dy0, i / seg, j / (n - 1));
        const t = this.vtx(cx + r1 * c, y1, cz + r1 * s, c * dy1, -dr1, s * dy1, i / seg, (j + 1) / (n - 1));
        if (i > 0) {
          if (r1 > 1e-5) this.tri(pb, pt, t);
          if (r0 > 1e-5) this.tri(pb, t, b);
        }
        pb = b;
        pt = t;
      }
    }
    return this;
  }

  /** Sphère (ou ellipsoïde par scale()). */
  ball(cx: number, cy: number, cz: number, r: number, seg: number, rings: number): this {
    const prof: number[] = [];
    for (let j = 0; j <= rings; j++) {
      const a = -Math.PI / 2 + (j / rings) * Math.PI;
      prof.push(Math.max(0, Math.cos(a)) * r, cy + Math.sin(a) * r);
    }
    prof[0] = 0;
    prof[prof.length - 2] = 0;
    return this.lathe(prof, seg, cx, cz);
  }

  /**
   * Tube le long d'une polyligne [x, y, z, …] (cadres, crosses, arceaux). (rx, ry, rz) : vecteur de
   * référence perpendiculaire au plan de la courbe (évite toute torsion) ; par défaut il est déduit du
   * premier segment.
   */
  tube(pts: readonly number[], r: number, seg: number, rx = 0, ry = 0, rz = 0): this {
    const n = Math.floor(pts.length / 3);
    if (n < 2) return this;
    let prevRing = -1;
    let ux = rx, uy = ry, uz = rz;
    if (ux === 0 && uy === 0 && uz === 0) {
      const dx = Math.abs(pts[3]! - pts[0]!), dy = Math.abs(pts[4]! - pts[1]!), dz = Math.abs(pts[5]! - pts[2]!);
      if (dy <= dx && dy <= dz) uy = 1;
      else if (dx <= dz) ux = 1;
      else uz = 1;
    }
    for (let k = 0; k < n; k++) {
      const x = pts[k * 3]!, y = pts[k * 3 + 1]!, z = pts[k * 3 + 2]!;
      const ax = k > 0 ? x - pts[k * 3 - 3]! : 0, ay = k > 0 ? y - pts[k * 3 - 2]! : 0, az = k > 0 ? z - pts[k * 3 - 1]! : 0;
      const bx = k < n - 1 ? pts[k * 3 + 3]! - x : 0, by = k < n - 1 ? pts[k * 3 + 4]! - y : 0, bz = k < n - 1 ? pts[k * 3 + 5]! - z : 0;
      const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
      let tx = ax / la + bx / lb, ty = ay / la + by / lb, tz = az / la + bz / lb;
      const lt = Math.hypot(tx, ty, tz) || 1;
      tx /= lt; ty /= lt; tz /= lt;
      if (Math.abs(tx * ux + ty * uy + tz * uz) > 0.97) {
        // tangente parallèle à la référence (courbe hors de son plan annoncé) : on en change
        if (Math.abs(ty) > 0.9) { ux = 1; uy = 0; uz = 0; } else { ux = 0; uy = 1; uz = 0; }
      }
      // N = ref × T, B = N × T
      let nx = uy * tz - uz * ty, ny = uz * tx - ux * tz, nz = ux * ty - uy * tx;
      const ln = Math.hypot(nx, ny, nz) || 1;
      nx /= ln; ny /= ln; nz /= ln;
      const cxn = ny * tz - nz * ty, cyn = nz * tx - nx * tz, czn = nx * ty - ny * tx;
      const ring = this.cur.nv;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
        const dx = c * nx + s * cxn, dy = c * ny + s * cyn, dz = c * nz + s * czn;
        this.vtx(x + dx * r, y + dy * r, z + dz * r, dx, dy, dz, i / seg, k / (n - 1));
      }
      if (prevRing >= 0) {
        for (let i = 0; i < seg; i++) {
          const b0 = prevRing + i, b1 = prevRing + i + 1, t0 = ring + i, t1 = ring + i + 1;
          this.tri(b0, t0, t1);
          this.tri(b0, t1, b1);
        }
      }
      prevRing = ring;
    }
    return this;
  }

  /** Barre droite de section carrée entre deux points (tube à 4 pans). */
  bar(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, seg = 4): this {
    BAR[0] = x0; BAR[1] = y0; BAR[2] = z0; BAR[3] = x1; BAR[4] = y1; BAR[5] = z1;
    return this.tube(BAR, r, seg);
  }

  // ── lumières et graffitis ──

  /** Déclare une source de lumière (position dans le repère COURANT). */
  halo(x: number, y: number, z: number, size: number, color: number, intensity: number, gate: number, pool = 0, light = 0): this {
    const m = this.m;
    this.halos.push({
      x: m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
      y: m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
      z: m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
      size, color, intensity, gate, pool, light, tag: this.curPart.tag,
    });
    return this;
  }

  /** Déclare un emplacement de graffiti : rectangle vertical face à +z du repère courant. */
  tagSpot(cx: number, cy: number, z: number, w: number, h: number): this {
    const m = this.m;
    const hw = w / 2, hh = h / 2;
    this.tagSpots.push({
      cx: m[0]! * cx + m[1]! * cy + m[2]! * z + m[3]!,
      cy: m[4]! * cx + m[5]! * cy + m[6]! * z + m[7]!,
      cz: m[8]! * cx + m[9]! * cy + m[10]! * z + m[11]!,
      rx: m[0]! * hw, ry: m[4]! * hw, rz: m[8]! * hw,
      ux: m[1]! * hh, uy: m[5]! * hh, uz: m[9]! * hh,
    });
    return this;
  }

  finish(): Tpl {
    this.closePart();
    return {
      o: this.opaque.compact(),
      g: this.glassBuf.nv > 0 ? this.glassBuf.compact() : null,
      parts: this.parts.filter((p) => p.v1 > p.v0 || p.gv1 > p.gv0),
      halos: this.halos,
      tags: this.tagSpots,
    };
  }
}

const BAR = [0, 0, 0, 0, 0, 0];

