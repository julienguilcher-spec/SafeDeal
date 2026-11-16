/* Constructeur de géométrie fusionnée des véhicules — sans Three.js ni DOM (utilisable sous Node).
 *
 * Un modèle = une seule géométrie indexée. Chaque sommet porte, en plus de la position, de la normale et
 * des coordonnées d'atlas :
 *   - une couleur sRGB et un type de surface (peinture teintée par l'instance, vitre, pneu, feu…) ;
 *   - une « pièce mobile » (roue, tourelle, porte, rotor…) avec son pivot : c'est le vertex shader qui
 *     anime les pièces à partir des attributs d'instance, sans maillage ni matrice supplémentaire ;
 *   - un code de feu (phare, stop, clignotant, gyrophare A ou B…) pour l'émission lumineuse.
 *
 * Règle d'orientation : chaque triangle est émis avec une normale VOULUE (analytique, ou « à l'opposé d'un
 * point de référence intérieur ») ; si l'ordre des sommets donne la normale inverse, deux indices sont
 * permutés. Aucune face ne peut donc être à l'envers, y compris sous un miroir (échelle négative).
 */

/** Types de surface (stockés dans le canal alpha de la couleur du sommet). */
export const SURF_PAINT = 0;   // carrosserie : multipliée par la couleur de l'instance
export const SURF_FIXED = 1;   // couleur propre, mate (plastiques, sérigraphie)
export const SURF_GLASS = 2;   // vitrage : se brise, reflète le ciel, rougeoie quand l'habitacle brûle
export const SURF_RUBBER = 3;  // pneus, joints
export const SURF_METAL = 4;   // acier nu, jantes, grilles
export const SURF_LAMP = 5;    // optiques (émission pilotée par le code de feu)
export const SURF_PLATE = 6;   // plaque d'immatriculation (texture dédiée)
export const SURF_DARK = 7;    // intérieur sombre, dessous de caisse (insensible à la couleur d'instance)

/** Pièces mobiles (animation dans le vertex shader). */
export const PART_NONE = 0;
export const PART_WHEEL_STEER = 1; // roue directrice : rotation d'essieu puis braquage
export const PART_WHEEL = 2;       // roue fixe
export const PART_TURRET0 = 3;     // embase de la tourelle 0 (gisement)
export const PART_BARREL0 = 4;     // canon de la tourelle 0 (site puis gisement)
export const PART_TURRET1 = 5;
export const PART_BARREL1 = 6;
export const PART_DOOR = 7;        // porte battante (charnière verticale au pivot) ; param = ±(indice + 1)
export const PART_SLIDE = 8;       // porte coulissante ; param = ±(indice + 1)
export const PART_ROTOR = 9;       // rotor d'axe vertical ; param = multiplicateur de vitesse (signé)
export const PART_ROTOR_X = 10;    // rotor d'axe transversal (anticouple)
export const PART_FORK = 11;       // fourche et guidon de deux-roues (braquage autour du pivot)
export const PART_BIKE_WHEEL = 12; // roue avant de deux-roues : essieu au pivot, puis direction autour de l'axe de fourche
export const PART_STEERING = 13;   // volant (habitacle) : rotation autour de la colonne ; param = inclinaison de la colonne (rad)

/** Codes de feu. */
export const LIGHT_NONE = 0;
export const LIGHT_HEAD = 1;
export const LIGHT_TAIL = 2;     // feu arrière : veilleuse avec les phares, pleine intensité au freinage
export const LIGHT_BRAKE = 3;    // troisième feu stop
export const LIGHT_REVERSE = 4;
export const LIGHT_IND_L = 5;
export const LIGHT_IND_R = 6;
export const LIGHT_BEACON_A = 7; // gyrophares, groupe A (gauche)
export const LIGHT_BEACON_B = 8; // gyrophares, groupe B (droite)
export const LIGHT_SIGN = 9;     // enseigne éclairée (lumineux de taxi, girouette de bus) : allumée avec les phares

/** Rectangle de texture dans l'atlas (u0, v0 = coin bas-gauche ; u1, v1 = coin haut-droit). */
export interface UvRect { u0: number; v0: number; u1: number; v1: number }

/** Géométrie finale, prête à être versée dans des BufferAttribute. */
export interface GeoData {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  /** r, g, b (sRGB 0..255) et type de surface. */
  color: Uint8Array;
  pivot: Float32Array;
  /** type de pièce, paramètre, code de feu. */
  part: Float32Array;
  index: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

const DEG = Math.PI / 180;

export class Geo {
  private pos: number[] = [];
  private nor: number[] = [];
  private uvs: number[] = [];
  private col: number[] = [];
  private piv: number[] = [];
  private prt: number[] = [];
  private idx: number[] = [];

  // état courant
  private cr = 255; private cg = 255; private cb = 255;
  private surfType = SURF_FIXED;
  private partType = PART_NONE; private partParam = 0;
  private pvx = 0; private pvy = 0; private pvz = 0;
  private lightCode = LIGHT_NONE;
  private rect: UvRect;
  private readonly blank: UvRect;

  // matrice affine courante 3×4 (ligne) et pile
  private m: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  private stack: number[][] = [];

  /** @param blank rectangle d'atlas d'un aplat blanc opaque (coordonnées par défaut des faces non texturées). */
  constructor(blank: UvRect) {
    this.blank = blank;
    this.rect = blank;
  }

  get vertexCount(): number { return this.pos.length / 3; }
  get triangleCount(): number { return this.idx.length / 3; }

  // ── état ───────────────────────────────────────────────────────────────────────────
  /** Couleur sRGB 0xRRGGBB et type de surface des prochains sommets. */
  paint(hex: number, surf: number = SURF_FIXED): this {
    this.cr = (hex >> 16) & 255; this.cg = (hex >> 8) & 255; this.cb = hex & 255;
    this.surfType = surf;
    return this;
  }

  /** Carrosserie teintée par la couleur de l'instance (blanc × teinte). `shade` assombrit (0..1). */
  body(shade = 1): this {
    const v = Math.round(255 * shade);
    this.cr = v; this.cg = v; this.cb = v;
    this.surfType = SURF_PAINT;
    return this;
  }

  light(code: number): this { this.lightCode = code; return this; }

  /** Rectangle d'atlas appliqué aux prochaines faces planes (null = aplat blanc). */
  tile(rect: UvRect | null): this { this.rect = rect ?? this.blank; return this; }

  /** Pièce mobile des prochains sommets ; le pivot est donné dans le repère courant. */
  part(type: number, px = 0, py = 0, pz = 0, param = 0): this {
    this.partType = type;
    this.partParam = param;
    const m = this.m;
    this.pvx = m[0]! * px + m[1]! * py + m[2]! * pz + m[3]!;
    this.pvy = m[4]! * px + m[5]! * py + m[6]! * pz + m[7]!;
    this.pvz = m[8]! * px + m[9]! * py + m[10]! * pz + m[11]!;
    return this;
  }

  noPart(): this { this.partType = PART_NONE; this.partParam = 0; this.pvx = this.pvy = this.pvz = 0; return this; }

  /** Pivot courant dans le repère du modèle (après transformation). */
  get pivotX(): number { return this.pvx; }

  // ── transformations ────────────────────────────────────────────────────────────────
  push(): this { this.stack.push(this.m.slice()); return this; }
  pop(): this { const m = this.stack.pop(); if (m) this.m = m; return this; }

  private mul(b: number[]): void {
    const a = this.m;
    this.m = [
      a[0]! * b[0]! + a[1]! * b[4]! + a[2]! * b[8]!, a[0]! * b[1]! + a[1]! * b[5]! + a[2]! * b[9]!, a[0]! * b[2]! + a[1]! * b[6]! + a[2]! * b[10]!, a[0]! * b[3]! + a[1]! * b[7]! + a[2]! * b[11]! + a[3]!,
      a[4]! * b[0]! + a[5]! * b[4]! + a[6]! * b[8]!, a[4]! * b[1]! + a[5]! * b[5]! + a[6]! * b[9]!, a[4]! * b[2]! + a[5]! * b[6]! + a[6]! * b[10]!, a[4]! * b[3]! + a[5]! * b[7]! + a[6]! * b[11]! + a[7]!,
      a[8]! * b[0]! + a[9]! * b[4]! + a[10]! * b[8]!, a[8]! * b[1]! + a[9]! * b[5]! + a[10]! * b[9]!, a[8]! * b[2]! + a[9]! * b[6]! + a[10]! * b[10]!, a[8]! * b[3]! + a[9]! * b[7]! + a[10]! * b[11]! + a[11]!,
    ];
  }

  translate(x: number, y: number, z: number): this { this.mul([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]); return this; }
  scale(x: number, y: number, z: number): this { this.mul([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]); return this; }
  rotX(a: number): this { const c = Math.cos(a), s = Math.sin(a); this.mul([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]); return this; }
  rotY(a: number): this { const c = Math.cos(a), s = Math.sin(a); this.mul([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]); return this; }
  rotZ(a: number): this { const c = Math.cos(a), s = Math.sin(a); this.mul([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]); return this; }

  /** Exécute `fn` deux fois : telle quelle, puis en miroir par rapport au plan x = 0 (côté gauche / côté droit). */
  mirror(fn: () => void): this {
    fn();
    this.push();
    this.scale(-1, 1, 1);
    fn();
    this.pop();
    return this;
  }

  // ── émission bas niveau ────────────────────────────────────────────────────────────
  private tx(x: number, y: number, z: number): [number, number, number] {
    const m = this.m;
    return [
      m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
      m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
      m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
    ];
  }

  private td(x: number, y: number, z: number): [number, number, number] {
    const m = this.m;
    const dx = m[0]! * x + m[1]! * y + m[2]! * z;
    const dy = m[4]! * x + m[5]! * y + m[6]! * z;
    const dz = m[8]! * x + m[9]! * y + m[10]! * z;
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  }

  /** Ajoute un sommet déjà exprimé dans le repère du modèle. */
  private rawVertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uvs.push(u, v);
    this.col.push(this.cr, this.cg, this.cb, this.surfType);
    this.piv.push(this.pvx, this.pvy, this.pvz);
    this.prt.push(this.partType, this.partParam, this.lightCode);
    return i;
  }

  /** Triangle orienté selon la normale voulue (somme des normales des trois sommets). */
  private rawTri(a: number, b: number, c: number): void {
    const p = this.pos, n = this.nor;
    const ax = p[a * 3]!, ay = p[a * 3 + 1]!, az = p[a * 3 + 2]!;
    const ux = p[b * 3]! - ax, uy = p[b * 3 + 1]! - ay, uz = p[b * 3 + 2]! - az;
    const vx = p[c * 3]! - ax, vy = p[c * 3 + 1]! - ay, vz = p[c * 3 + 2]! - az;
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * gx + gy * gy + gz * gz < 1e-14) return; // triangle dégénéré : ignoré
    const wx = n[a * 3]! + n[b * 3]! + n[c * 3]!;
    const wy = n[a * 3 + 1]! + n[b * 3 + 1]! + n[c * 3 + 1]!;
    const wz = n[a * 3 + 2]! + n[b * 3 + 2]! + n[c * 3 + 2]!;
    if (gx * wx + gy * wy + gz * wz >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  private mapU(s: number): number { return this.rect.u0 + (this.rect.u1 - this.rect.u0) * s; }
  private mapV(t: number): number { return this.rect.v0 + (this.rect.v1 - this.rect.v0) * t; }

  /**
   * Face plane à 3 ou 4 sommets (repère courant), normale géométrique orientée À L'OPPOSÉ du point de
   * référence `ref` (repère courant) ou, si `hint` est fourni, dans le sens de cette direction.
   * Coordonnées de texture : (0,0) (1,0) (1,1) (0,1) dans le rectangle d'atlas courant, dans l'ordre des points.
   */
  face(pts: readonly number[], ref: readonly number[] | null, hint: readonly number[] | null = null): this {
    const n = pts.length / 3;
    if (n < 3) return this;
    const t: [number, number, number][] = [];
    for (let i = 0; i < n; i++) t.push(this.tx(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!));
    // normale de Newell (robuste pour les quadrilatères légèrement gauches)
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const a = t[i]!, b = t[(i + 1) % n]!;
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return this;
    nx /= l; ny /= l; nz /= l;
    let flip = false;
    if (hint) {
      const h = this.td(hint[0]!, hint[1]!, hint[2]!);
      flip = nx * h[0] + ny * h[1] + nz * h[2] < 0;
    } else if (ref) {
      const r = this.tx(ref[0]!, ref[1]!, ref[2]!);
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += t[i]![0]; cy += t[i]![1]; cz += t[i]![2]; }
      flip = nx * (cx / n - r[0]) + ny * (cy / n - r[1]) + nz * (cz / n - r[2]) < 0;
    }
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const us = [0, 1, 1, 0], vs = [0, 0, 1, 1];
    const base: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = n === 3 ? [0, 1, 0.5][i]! : us[i % 4]!;
      const w = n === 3 ? [0, 0, 1][i]! : vs[i % 4]!;
      base.push(this.rawVertex(t[i]![0], t[i]![1], t[i]![2], nx, ny, nz, this.mapU(s), this.mapV(w)));
    }
    for (let i = 1; i < n - 1; i++) this.rawTri(base[0]!, base[i]!, base[i + 1]!);
    return this;
  }

  /** Face plane avec coordonnées de texture explicites (s, t dans 0..1 du rectangle courant) par sommet. */
  faceUv(pts: readonly number[], st: readonly number[], hint: readonly number[]): this {
    const n = pts.length / 3;
    const t: [number, number, number][] = [];
    for (let i = 0; i < n; i++) t.push(this.tx(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!));
    const h = this.td(hint[0]!, hint[1]!, hint[2]!);
    const base: number[] = [];
    for (let i = 0; i < n; i++) {
      base.push(this.rawVertex(t[i]![0], t[i]![1], t[i]![2], h[0], h[1], h[2], this.mapU(st[i * 2]!), this.mapV(st[i * 2 + 1]!)));
    }
    for (let i = 1; i < n - 1; i++) this.rawTri(base[0]!, base[i]!, base[i + 1]!);
    return this;
  }

  /** Plaque d'immatriculation : quadrilatère dont les coordonnées de texture brutes (0..1) seront replacées par le shader. */
  rawPlate(pts: readonly number[], hint: readonly number[]): this {
    const h = this.td(hint[0]!, hint[1]!, hint[2]!);
    const st = [0, 0, 1, 0, 1, 1, 0, 1];
    const base: number[] = [];
    for (let i = 0; i < 4; i++) {
      const t = this.tx(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!);
      base.push(this.rawVertex(t[0], t[1], t[2], h[0], h[1], h[2], st[i * 2]!, st[i * 2 + 1]!));
    }
    this.rawTri(base[0]!, base[1]!, base[2]!);
    this.rawTri(base[0]!, base[2]!, base[3]!);
    return this;
  }

  // ── primitives ─────────────────────────────────────────────────────────────────────
  /** Hexaèdre quelconque : 4 sommets du bas puis 4 du haut, dans le même ordre de tour. `skip` : masque de faces (bit 0 bas, 1 haut, 2..5 côtés). */
  hexa(c: readonly number[], skip = 0): this {
    let rx = 0, ry = 0, rz = 0;
    for (let i = 0; i < 8; i++) { rx += c[i * 3]!; ry += c[i * 3 + 1]!; rz += c[i * 3 + 2]!; }
    const ref = [rx / 8, ry / 8, rz / 8];
    const q = (i: number, j: number, k: number, l: number): number[] => [
      c[i * 3]!, c[i * 3 + 1]!, c[i * 3 + 2]!, c[j * 3]!, c[j * 3 + 1]!, c[j * 3 + 2]!,
      c[k * 3]!, c[k * 3 + 1]!, c[k * 3 + 2]!, c[l * 3]!, c[l * 3 + 1]!, c[l * 3 + 2]!,
    ];
    if (!(skip & 1)) this.face(q(0, 1, 2, 3), ref);
    if (!(skip & 2)) this.face(q(4, 5, 6, 7), ref);
    for (let i = 0; i < 4; i++) {
      if (skip & (4 << i)) continue;
      const j = (i + 1) % 4;
      this.face(q(i, j, j + 4, i + 4), ref);
    }
    return this;
  }

  /** Pavé droit par ses bornes. `skip` : bit 0 bas, 1 haut, 2 = −z, 3 = +x, 4 = +z, 5 = −x. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, skip = 0): this {
    return this.hexa([
      x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1,
      x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1,
    ], skip);
  }

  /** Pavé centré : centre et dimensions. */
  cube(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, skip = 0): this {
    return this.box(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, skip);
  }

  /**
   * Tronc de pyramide droit : rectangle bas (demi-largeur wb en x, z de zb0 à zb1, hauteur y0) et rectangle
   * haut (wt, zt0..zt1, y1). Sert aux capots, pavillons, coffres en biseau.
   */
  taper(y0: number, wb: number, zb0: number, zb1: number, y1: number, wt: number, zt0: number, zt1: number, skip = 0): this {
    return this.hexa([
      -wb, y0, zb0, wb, y0, zb0, wb, y0, zb1, -wb, y0, zb1,
      -wt, y1, zt0, wt, y1, zt0, wt, y1, zt1, -wt, y1, zt1,
    ], skip);
  }

  /**
   * Prisme : polygone CONVEXE dans le plan (z, y), extrudé en x de x0 à x1. `profile` = [z0, y0, z1, y1, …].
   * `caps` : bit 0 = flanc x0, bit 1 = flanc x1.
   */
  prism(profile: readonly number[], x0: number, x1: number, caps = 3): this {
    const n = profile.length / 2;
    let cz = 0, cy = 0;
    for (let i = 0; i < n; i++) { cz += profile[i * 2]!; cy += profile[i * 2 + 1]!; }
    cz /= n; cy /= n;
    const ref = [(x0 + x1) / 2, cy, cz];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.face([
        x0, profile[i * 2 + 1]!, profile[i * 2]!, x1, profile[i * 2 + 1]!, profile[i * 2]!,
        x1, profile[j * 2 + 1]!, profile[j * 2]!, x0, profile[j * 2 + 1]!, profile[j * 2]!,
      ], ref);
    }
    for (let side = 0; side < 2; side++) {
      if (!(caps & (1 << side))) continue;
      const x = side === 0 ? x0 : x1;
      const pts: number[] = [];
      for (let i = 0; i < n; i++) pts.push(x, profile[i * 2 + 1]!, profile[i * 2]!);
      this.face(pts, ref);
    }
    return this;
  }

  /**
   * Coque par sections : chaque section est un anneau fermé de points [x, y, z, …] de même longueur.
   * Les quadrilatères relient les sections consécutives ; `capStart` / `capEnd` ferment les extrémités.
   * `style(k, j)` est appelé avant chaque quadrilatère (section k → k+1, arête j → j+1) pour changer la couleur ;
   * s'il retourne false, le quadrilatère est omis.
   */
  loft(rings: readonly (readonly number[])[], capStart = true, capEnd = true, style?: (k: number, j: number) => boolean | void): this {
    const n = rings[0]!.length / 3;
    let rx = 0, ry = 0, rz = 0, count = 0;
    for (const r of rings) for (let i = 0; i < n; i++) { rx += r[i * 3]!; ry += r[i * 3 + 1]!; rz += r[i * 3 + 2]!; count++; }
    const ref = [rx / count, ry / count, rz / count];
    for (let k = 0; k + 1 < rings.length; k++) {
      const a = rings[k]!, b = rings[k + 1]!;
      for (let j = 0; j < n; j++) {
        const j2 = (j + 1) % n;
        if (style && style(k, j) === false) continue;
        this.face([
          a[j * 3]!, a[j * 3 + 1]!, a[j * 3 + 2]!, a[j2 * 3]!, a[j2 * 3 + 1]!, a[j2 * 3 + 2]!,
          b[j2 * 3]!, b[j2 * 3 + 1]!, b[j2 * 3 + 2]!, b[j * 3]!, b[j * 3 + 1]!, b[j * 3 + 2]!,
        ], ref);
      }
    }
    if (capStart) { if (style) style(-1, 0); this.face(rings[0]!, ref); }
    if (capEnd) { if (style) style(rings.length - 1, 0); this.face(rings[rings.length - 1]!, ref); }
    return this;
  }

  /**
   * Tube (cylindre ou cône tronqué) entre deux points, normales lissées. `capA` / `capB` ferment les bouts.
   */
  tube(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, seg = 8, capA = true, capB = true): this {
    const A = this.tx(ax, ay, az), B = this.tx(bx, by, bz);
    // facteur d'échelle moyen de la matrice (rayons)
    const sc = Math.cbrt(Math.abs(this.det()));
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-7) return this;
    const wx = dx / len, wy = dy / len, wz = dz / len;
    // base orthonormée (u, v) perpendiculaire à l'axe
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(wy) > 0.9) { ux = 1; uy = 0; }
    let vx = wy * uz - wz * uy, vy = wz * ux - wx * uz, vz = wx * uy - wy * ux;
    let l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
    ux = vy * wz - vz * wy; uy = vz * wx - vx * wz; uz = vx * wy - vy * wx;
    l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
    const ra = r0 * sc, rb = r1 * sc;
    const u = this.mapU(0.5), v = this.mapV(0.5);
    const ringA: number[] = [], ringB: number[] = [];
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      const nx = ux * c + vx * s, ny = uy * c + vy * s, nz = uz * c + vz * s;
      ringA.push(this.rawVertex(A[0] + nx * ra, A[1] + ny * ra, A[2] + nz * ra, nx, ny, nz, u, v));
      ringB.push(this.rawVertex(B[0] + nx * rb, B[1] + ny * rb, B[2] + nz * rb, nx, ny, nz, u, v));
    }
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.rawTri(ringA[i]!, ringA[j]!, ringB[j]!);
      this.rawTri(ringA[i]!, ringB[j]!, ringB[i]!);
    }
    const cap = (C: [number, number, number], r: number, sign: number): void => {
      if (r < 1e-6) return;
      const nx = wx * sign, ny = wy * sign, nz = wz * sign;
      const c0 = this.rawVertex(C[0], C[1], C[2], nx, ny, nz, u, v);
      const ring: number[] = [];
      for (let i = 0; i < seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        const c = Math.cos(t), s = Math.sin(t);
        ring.push(this.rawVertex(C[0] + (ux * c + vx * s) * r, C[1] + (uy * c + vy * s) * r, C[2] + (uz * c + vz * s) * r, nx, ny, nz, u, v));
      }
      for (let i = 0; i < seg; i++) this.rawTri(c0, ring[i]!, ring[(i + 1) % seg]!);
    };
    if (capA) cap(A, ra, -1);
    if (capB) cap(B, rb, 1);
    return this;
  }

  private det(): number {
    const m = this.m;
    return m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[1]! * (m[4]! * m[10]! - m[6]! * m[8]!) + m[2]! * (m[4]! * m[9]! - m[5]! * m[8]!);
  }

  /**
   * Solide de révolution autour d'un axe parallèle à x passant par (cy, cz). `profile` = [x0, rayon0, x1, rayon1, …],
   * parcouru DANS LE SENS HORAIRE du plan (x à droite, rayon en haut) : flanc intérieur en montant, bande de
   * roulement vers +x, flanc extérieur en redescendant vers l'axe. La normale voulue est la perpendiculaire à
   * gauche du sens de parcours, ce qui reste juste pour un profil concave (voile de jante en creux).
   * `uvDisc` : la texture courante est plaquée en disque de rayon `discRadius` (jante vue de face).
   */
  lathe(cy: number, cz: number, profile: readonly number[], seg: number, uvDisc = false, discRadius = 1): this {
    const n = profile.length / 2;
    for (let k = 0; k + 1 < n; k++) {
      const xa = profile[k * 2]!, ra = profile[k * 2 + 1]!, xb = profile[k * 2 + 2]!, rb = profile[k * 2 + 3]!;
      const tx = xb - xa, tr = rb - ra;
      const tl = Math.hypot(tx, tr);
      if (tl < 1e-7) continue;
      const nx = -tr / tl, nr = tx / tl; // perpendiculaire à gauche du sens de parcours
      for (let i = 0; i < seg; i++) {
        // déphasage de −90° : un sommet de chaque couronne est exactement au point bas (roue posée au sol)
        const t0 = (i / seg) * Math.PI * 2 - Math.PI / 2, t1 = ((i + 1) / seg) * Math.PI * 2 - Math.PI / 2;
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
        const tm = (t0 + t1) / 2;
        const pts = [
          xa, cy + ra * s0, cz + ra * c0, xa, cy + ra * s1, cz + ra * c1,
          xb, cy + rb * s1, cz + rb * c1, xb, cy + rb * s0, cz + rb * c0,
        ];
        const hint = [nx, nr * Math.sin(tm), nr * Math.cos(tm)];
        if (uvDisc) {
          const ka = 0.5 * ra / discRadius, kb = 0.5 * rb / discRadius;
          this.faceUv(pts, [0.5 + ka * c0, 0.5 + ka * s0, 0.5 + ka * c1, 0.5 + ka * s1, 0.5 + kb * c1, 0.5 + kb * s1, 0.5 + kb * c0, 0.5 + kb * s0], hint);
        } else {
          this.face(pts, null, hint);
        }
      }
    }
    return this;
  }

  /** Demi-sphère (dôme) d'axe +y posée en (cx, cy, cz). */
  dome(cx: number, cy: number, cz: number, r: number, seg = 8, rings = 3, squash = 1): this {
    const C = this.tx(cx, cy, cz);
    const sc = Math.cbrt(Math.abs(this.det()));
    const u = this.mapU(0.5), v = this.mapV(0.5);
    const up = this.td(0, 1, 0), ex = this.td(1, 0, 0), ez = this.td(0, 0, 1);
    const rows: number[][] = [];
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * Math.PI * 0.5;
      const rr = Math.cos(phi) * r * sc, yy = Math.sin(phi) * r * sc * squash;
      const row: number[] = [];
      const count = j === rings ? 1 : seg;
      for (let i = 0; i < count; i++) {
        const t = (i / seg) * Math.PI * 2;
        const c = Math.cos(t), s = Math.sin(t);
        const lx = c * Math.cos(phi), ly = Math.sin(phi), lz = s * Math.cos(phi);
        const nx = ex[0] * lx + up[0] * ly + ez[0] * lz, ny = ex[1] * lx + up[1] * ly + ez[1] * lz, nz = ex[2] * lx + up[2] * ly + ez[2] * lz;
        row.push(this.rawVertex(
          C[0] + ex[0] * c * rr + ez[0] * s * rr + up[0] * yy,
          C[1] + ex[1] * c * rr + ez[1] * s * rr + up[1] * yy,
          C[2] + ex[2] * c * rr + ez[2] * s * rr + up[2] * yy, nx, ny, nz, u, v));
      }
      rows.push(row);
    }
    for (let j = 0; j < rings; j++) {
      const a = rows[j]!, b = rows[j + 1]!;
      for (let i = 0; i < seg; i++) {
        const i2 = (i + 1) % seg;
        if (b.length === 1) this.rawTri(a[i]!, a[i2]!, b[0]!);
        else { this.rawTri(a[i]!, a[i2]!, b[i2]!); this.rawTri(a[i]!, b[i2]!, b[i]!); }
      }
    }
    return this;
  }

  /** Sphère basse définition (deux dômes). */
  ball(cx: number, cy: number, cz: number, r: number, seg = 8, rings = 3): this {
    this.dome(cx, cy, cz, r, seg, rings);
    this.push().translate(cx, cy, cz).scale(1, -1, 1).dome(0, 0, 0, r, seg, rings).pop();
    return this;
  }

  /**
   * Panneau texturé (sérigraphie, plaque, grille) : centre, vecteur « droite » et vecteur « haut » du texte,
   * largeur et hauteur. La normale est droite × haut. `sub` restreint la portion du rectangle d'atlas [s0, t0, s1, t1].
   */
  panel(cx: number, cy: number, cz: number, right: readonly number[], up: readonly number[], w: number, h: number, sub?: readonly number[]): this {
    const rl = Math.hypot(right[0]!, right[1]!, right[2]!) || 1, ul = Math.hypot(up[0]!, up[1]!, up[2]!) || 1;
    const rx = (right[0]! / rl) * w / 2, ry = (right[1]! / rl) * w / 2, rz = (right[2]! / rl) * w / 2;
    const ux = (up[0]! / ul) * h / 2, uy = (up[1]! / ul) * h / 2, uz = (up[2]! / ul) * h / 2;
    const nx = right[1]! * up[2]! - right[2]! * up[1]!, ny = right[2]! * up[0]! - right[0]! * up[2]!, nz = right[0]! * up[1]! - right[1]! * up[0]!;
    const s0 = sub ? sub[0]! : 0, t0 = sub ? sub[1]! : 0, s1 = sub ? sub[2]! : 1, t1 = sub ? sub[3]! : 1;
    return this.faceUv([
      cx - rx - ux, cy - ry - uy, cz - rz - uz, cx + rx - ux, cy + ry - uy, cz + rz - uz,
      cx + rx + ux, cy + ry + uy, cz + rz + uz, cx - rx + ux, cy - ry + uy, cz - rz + uz,
    ], [s0, t0, s1, t0, s1, t1, s0, t1], [nx, ny, nz]);
  }

  // ── finitions ──────────────────────────────────────────────────────────────────────
  /** Repère pour smooth() : nombre de sommets déjà émis. */
  mark(): number { return this.pos.length / 3; }

  /**
   * Lisse les normales des sommets émis depuis `from` : les sommets confondus dont les normales font moins de
   * `creaseDeg` degrés entre elles reçoivent leur moyenne (arêtes vives conservées au-delà).
   */
  smooth(from: number, creaseDeg = 40): this {
    const p = this.pos, n = this.nor;
    const end = p.length / 3;
    const cosT = Math.cos(creaseDeg * DEG);
    const buckets = new Map<string, number[]>();
    for (let i = from; i < end; i++) {
      const key = Math.round(p[i * 3]! * 2000) + ',' + Math.round(p[i * 3 + 1]! * 2000) + ',' + Math.round(p[i * 3 + 2]! * 2000);
      const b = buckets.get(key);
      if (b) b.push(i); else buckets.set(key, [i]);
    }
    const out = new Float32Array((end - from) * 3);
    for (const group of buckets.values()) {
      for (const i of group) {
        const ax = n[i * 3]!, ay = n[i * 3 + 1]!, az = n[i * 3 + 2]!;
        let sx = 0, sy = 0, sz = 0;
        for (const j of group) {
          const bx = n[j * 3]!, by = n[j * 3 + 1]!, bz = n[j * 3 + 2]!;
          if (ax * bx + ay * by + az * bz >= cosT) { sx += bx; sy += by; sz += bz; }
        }
        const l = Math.hypot(sx, sy, sz) || 1;
        out[(i - from) * 3] = sx / l; out[(i - from) * 3 + 1] = sy / l; out[(i - from) * 3 + 2] = sz / l;
      }
    }
    for (let i = from; i < end; i++) {
      n[i * 3] = out[(i - from) * 3]!; n[i * 3 + 1] = out[(i - from) * 3 + 1]!; n[i * 3 + 2] = out[(i - from) * 3 + 2]!;
    }
    return this;
  }

  /** Boîte englobante de tous les sommets (ou des seuls sommets d'un type de pièce). */
  bounds(partFilter = -1): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const p = this.pos, prt = this.prt;
    for (let i = 0; i < p.length / 3; i++) {
      if (partFilter >= 0 && prt[i * 3] !== partFilter) continue;
      const x = p[i * 3]!, y = p[i * 3 + 1]!, z = p[i * 3 + 2]!;
      if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
      if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z;
    }
    return b;
  }

  build(): GeoData {
    return {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nor),
      uv: new Float32Array(this.uvs),
      color: new Uint8Array(this.col),
      pivot: new Float32Array(this.piv),
      part: new Float32Array(this.prt),
      index: new Uint32Array(this.idx),
      vertexCount: this.pos.length / 3,
      triangleCount: this.idx.length / 3,
    };
  }
}
