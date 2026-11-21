/* Kit monuments — fontaines : bassins, vasques, jets et nappes d'eau. */
import { Builder } from './builder';
import { Geo } from './geo';
import { annulus, disc, lathe } from './shapes';
import type { MatRef } from './materials';

export interface BasinOpts {
  radius: number;
  /** Hauteur de la margelle au-dessus du sol et son épaisseur. */
  rim: number;
  thickness?: number;
  /** Niveau de l'eau (sous la margelle). */
  water?: number;
  mat: MatRef;
  matWater?: MatRef;
  seg?: number;
  /** Rayon du massif central (l'eau est une couronne autour) ; 0 = disque plein. */
  inner?: number;
}

/** Bassin circulaire : margelle moulurée et plan d'eau. Centré, posé sur y = 0. */
export function basin(b: Builder, o: BasinOpts): void {
  const R = o.radius, t = o.thickness ?? Math.max(0.35, R * 0.06), h = o.rim, seg = o.seg ?? 40;
  const wl = o.water ?? h * 0.72;
  b.add(o.mat, lathe([
    R + t * 0.25, 0, R + t * 0.25, h * 0.18, R, h * 0.26, R, h * 0.78, R + t * 0.18, h * 0.86, R + t * 0.18, h,
    R - t, h, R - t, wl - 0.25,
  ], seg));
  const inner = o.inner ?? 0;
  b.add(o.matWater ?? 'eau', inner > 0 ? annulus(inner, R - t, seg, wl) : disc(R - t, seg, wl));
}

export interface VasqueOpts {
  radius: number;
  /** Altitude du pied de la vasque et hauteur totale (pied + coupe). */
  y: number;
  height: number;
  mat: MatRef;
  matWater?: MatRef;
  seg?: number;
  /** Rayon du pied. */
  stem?: number;
  /** Godrons : normales à facettes pour suggérer une coupe côtelée. */
  facets?: boolean;
}

/** Vasque sur pied (coupe évasée) avec son plan d'eau. Retourne l'altitude du bord. */
export function vasque(b: Builder, o: VasqueOpts): number {
  const R = o.radius, h = o.height, s = o.stem ?? R * 0.16, seg = o.seg ?? 28;
  const prof = [
    s * 1.5, 0, s * 1.5, h * 0.06, s, h * 0.14, s * 0.9, h * 0.45, s * 1.3, h * 0.55, R * 0.55, h * 0.72, R * 0.9, h * 0.9,
    R, h * 0.96, R, h, R * 0.94, h, R * 0.9, h * 0.93,
  ];
  b.add(o.mat, lathe(prof, seg, { smooth: !o.facets }).translate(0, o.y, 0));
  b.add(o.matWater ?? 'eau', disc(R * 0.9, seg, o.y + h * 0.95));
  return o.y + h;
}

/**
 * Jet d'eau parabolique de `from` à `to`, culminant à `apex` au-dessus du plus haut des deux points :
 * deux rubans croisés à texture défilante (v croît dans le sens de l'écoulement).
 */
export function jetArc(from: [number, number, number], to: [number, number, number], apex: number, width: number, seg = 8): Geo {
  const g = new Geo();
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const hl = Math.hypot(dx, dz) || 1e-6;
  const px = -dz / hl, pz = dx / hl;                       // perpendiculaire horizontale
  const top = Math.max(from[1], to[1]) + apex;
  // parabole passant par from, to et de sommet `top`
  const s1 = Math.sqrt(Math.max(1e-6, top - from[1])), s2 = Math.sqrt(Math.max(1e-6, top - to[1]));
  const tm = s1 / (s1 + s2);                               // abscisse du sommet
  const yAt = (t: number): number => top - (top - from[1]) * Math.pow((t - tm) / tm, 2);
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= seg; i++) { const t = i / seg; pts.push([from[0] + dx * t, t <= tm ? yAt(t) : top - (top - to[1]) * Math.pow((t - tm) / (1 - tm), 2), from[2] + dz * t]); }
  let len = 0;
  const total = pts.reduce((acc, p, i) => (i === 0 ? 0 : acc + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2])), 0) || 1;
  for (let i = 0; i < seg; i++) {
    const a = pts[i], c = pts[i + 1];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const w0 = width * (0.55 + 0.9 * (len / total)), w1 = width * (0.55 + 0.9 * ((len + l) / total));
    const v0 = (len / total) * (total / (width * 6)), v1 = ((len + l) / total) * (total / (width * 6));
    // ruban horizontal
    g.face(a[0] - px * w0, a[1], a[2] - pz * w0, a[0] + px * w0, a[1], a[2] + pz * w0, c[0] + px * w1, c[1], c[2] + pz * w1, c[0] - px * w1, c[1], c[2] - pz * w1, 0, v0, { u1: 1, v1 });
    // ruban vertical
    g.face(a[0], a[1] - w0, a[2], a[0], a[1] + w0, a[2], c[0], c[1] + w1, c[2], c[0], c[1] - w1, c[2], 0, v0, { u1: 1, v1 });
    len += l;
  }
  return g;
}

/** Jet vertical (gerbe) : deux plans croisés, plus large en haut. */
export function jetVertical(x: number, y: number, z: number, height: number, width: number): Geo {
  const g = new Geo();
  const v1 = height / (width * 5);
  for (const [ax, az] of [[1, 0], [0, 1]] as const) {
    const w0 = width * 0.35, w1 = width;
    g.face(x - ax * w0, y, z - az * w0, x + ax * w0, y, z + az * w0, x + ax * w1, y + height, z + az * w1, x - ax * w1, y + height, z - az * w1, 0, 0, { u1: 1, v1 });
  }
  return g;
}

/** Nappe d'eau tombant du bord d'une vasque (rayon rTop à yTop) vers un rayon rBottom à yBottom. v croît vers le bas. */
export function waterfall(rTop: number, yTop: number, rBottom: number, yBottom: number, seg = 24, strands = 12): Geo {
  const g = new Geo();
  const mid = (yTop + yBottom) / 2, rMid = rTop + (rBottom - rTop) * 0.35;
  const vLen = (yTop - yBottom) / 2.2;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
    const u0 = (i / seg) * strands, u1 = ((i + 1) / seg) * strands;
    g.face(rMid * s0, mid, rMid * c0, rMid * s1, mid, rMid * c1, rTop * s1, yTop, rTop * c1, rTop * s0, yTop, rTop * c0, u0, vLen * 0.5, { u1, v1: 0 });
    g.face(rBottom * s0, yBottom, rBottom * c0, rBottom * s1, yBottom, rBottom * c1, rMid * s1, mid, rMid * c1, rMid * s0, mid, rMid * c0, u0, vLen, { u1, v1: vLen * 0.5 });
  }
  return g;
}

/** Ajoute des jets au matériau d'eau courante ('jet' par défaut). */
export function addJets(b: Builder, geo: Geo, mat: MatRef = 'jet'): void {
  b.add(mat, geo);
}
