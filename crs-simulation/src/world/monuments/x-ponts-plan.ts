/* Lot « ponts » — géométrie plane des ponts sur emprise réelle. DONNÉES PURES : aucun import de Three.js ni du kit
 * (ce fichier est chargé par collide/*.ts, donc aussi par la simulation sous Node).
 *
 * REPÈRE D'UN PONT. Le tablier (chaussée, trottoirs) est dessiné par le module de la ville le long de l'arête du
 * graphe routier, sur une largeur « chaussée + deux trottoirs », à une altitude qui relie en ligne droite le sol des
 * deux rives. Le modèle du monument doit s'y ajuster au décimètre : chaque pont est donc DESSINÉ dans le repère de son
 * tablier — s le long de l'axe (vers +z local), v en travers (vers +x local), y au-dessus de la chaussée — à partir
 * de cotes relevées dans la carte (axe de l'arête, demi-largeur, abscisse des murs de quai, biais des rives) et
 * exprimées dans le repère local de l'emprise de référence. Si la carte est régénérée avec un autre point d'ancrage
 * ou un autre cap, bridgeFrame() recale ce repère sur l'emprise réellement fournie (pose rigide, sommet pour sommet). */
import type { MonumentCollider, MonumentSite } from './types';
import { alignOf, type Align } from './x-edifices-align';
import { ensureCCW } from './shape2d';

export interface BridgeDesign {
  /** Emprise de référence (repère local de la carte au moment du dessin). */
  ref: readonly number[];
  /** Axe du tablier dans ce repère : point O (projection du point d'ancrage) et direction unitaire (vers +z). */
  ox: number; oz: number; ux: number; uz: number;
  /** Demi-largeur du tablier (chaussée + trottoir) et de la chaussée seule. */
  half: number; roadHalf: number;
  /** Abscisses des deux murs de quai sur l'axe : la Seine coule entre s0 et s1. */
  s0: number; s1: number;
  /** Biais des rives : décalage le long de l'axe par mètre en travers (ds/dv). Les piles et les culées le suivent. */
  skew: number;
  /** Sans relief connu (banc d'essai, tests) : niveau de l'eau sous l'origine et pente du tablier (m/m). */
  waterY: number; slope: number;
}

/** Repère du tablier dans le repère local du SITE. */
export interface BridgeFrame {
  ox: number; oz: number; ux: number; uz: number;
  /** Normale en travers (v croissant), unitaire. */
  nx: number; nz: number;
  half: number; roadHalf: number; s0: number; s1: number; skew: number;
  /** Altitude de la chaussée sur l'axe : y(s) = y0 + slope·s (relative à l'origine du monument). */
  y0: number; slope: number;
  /** Niveau de l'eau relatif à l'origine du monument. */
  waterY: number;
  /** Cap de l'axe (rad, comme rotation.y : +z → direction de l'axe). */
  heading: number;
  /** Pose rigide du dessin sur le site (identité si l'emprise est celle de référence ou absente). */
  align: Align;
}

/** Point local d'un point (s, v) du tablier. `skewed` : avec le biais des rives (piles, culées). */
export function deckPoint(f: BridgeFrame, s: number, v: number, skewed = false): [number, number] {
  const ss = skewed ? s + f.skew * v : s;
  return [f.ox + f.ux * ss + f.nx * v, f.oz + f.uz * ss + f.nz * v];
}

/** Altitude de la chaussée à l'abscisse s. */
export function deckY(f: BridgeFrame, s: number): number {
  return f.y0 + f.slope * s;
}

/** Repère du tablier pour un site : recalage sur l'emprise réelle, altitude et pente lues dans le relief si le site les donne. */
export function bridgeFrame(site: MonumentSite, d: BridgeDesign): BridgeFrame {
  const a = alignOf(site.footprint, d.ref);
  const ox = a.tx + d.ox * a.c - d.oz * a.s, oz = a.tz + d.ox * a.s + d.oz * a.c;
  const ux = d.ux * a.c - d.uz * a.s, uz = d.ux * a.s + d.uz * a.c;
  const f: BridgeFrame = {
    ox, oz, ux, uz, nx: uz, nz: -ux, half: d.half, roadHalf: d.roadHalf, s0: d.s0, s1: d.s1, skew: d.skew,
    y0: 0, slope: d.slope, waterY: site.waterY ?? d.waterY, heading: Math.atan2(ux, uz), align: a,
  };
  if (site.groundAt) {
    // droite des moindres carrés sur l'axe, au-dessus de l'eau (le tablier y est rectiligne par construction)
    const n = 7;
    let sum = 0, sumS = 0, sumY = 0, sumSS = 0, sumSY = 0;
    for (let i = 0; i < n; i++) {
      const s = d.s0 + 3 + ((d.s1 - d.s0 - 6) * i) / (n - 1);
      const p = deckPoint(f, s, 0);
      const y = site.groundAt(p[0], p[1]);
      if (!Number.isFinite(y)) continue;
      sum++; sumS += s; sumY += y; sumSS += s * s; sumSY += s * y;
    }
    const den = sum * sumSS - sumS * sumS;
    if (sum >= 2 && Math.abs(den) > 1e-6) {
      const slope = (sum * sumSY - sumS * sumY) / den;
      // garde-fou : un tablier ne dépasse pas 6 % ; au-delà le relief lu n'est pas celui d'un tablier
      if (Math.abs(slope) < 0.06) { f.slope = slope; f.y0 = (sumY - slope * sumS) / sum; }
    }
  }
  return f;
}

/** Rectangle (anneau antihoraire, repère local) centré en (s, v) du tablier : `along` selon l'axe, `across` en travers. */
export function deckRect(f: BridgeFrame, s: number, v: number, along: number, across: number): number[] {
  const ha = along / 2, hc = across / 2;
  const p: number[] = [];
  for (const [ds, dv] of [[-ha, -hc], [-ha, hc], [ha, hc], [ha, -hc]] as const) { const q = deckPoint(f, s + ds, v + dv); p.push(q[0], q[1]); }
  return ensureCCW(p);
}

/**
 * Parapets d'un pont : deux bandes pleines le long des rives du tablier, de sA à sB, juste à l'extérieur de la
 * largeur praticable (elles n'empiètent pas sur le trottoir). `gaps` : abscisses [de, à] laissées ouvertes.
 */
export function parapetColliders(f: BridgeFrame, sA: number, sB: number, height: number, thickness = 0.4, gaps: readonly [number, number][] = []): MonumentCollider[] {
  const out: MonumentCollider[] = [];
  const cuts = gaps.slice().sort((p, q) => p[0] - q[0]);
  for (const side of [-1, 1]) {
    let from = sA;
    const push = (to: number): void => {
      if (to - from < 0.5) return;
      out.push({ ring: deckRect(f, (from + to) / 2, side * (f.half + 0.05 + thickness / 2), to - from, thickness), height, baseY: 0 });
    };
    for (const [g0, g1] of cuts) { if (g1 <= from || g0 >= sB) continue; push(Math.min(g0, sB)); from = Math.max(from, g1); }
    push(sB);
  }
  return out;
}

/** Point du repère de référence d'un pont (local au moment du dessin) → repère local du site. */
export function designPoint(f: BridgeFrame, x: number, z: number): [number, number] {
  const a = f.align;
  return [a.tx + x * a.c - z * a.s, a.tz + x * a.s + z * a.c];
}

/** Cap (rad) dans le repère local du site d'une direction de cap `h` dans le repère de référence. */
export function designHeading(f: BridgeFrame, h: number): number {
  return h - Math.atan2(f.align.s, f.align.c);
}

/** Rectangle (antihoraire) de centre (x, z) donné dans le repère de référence, tourné de `rot` (rad) dans ce repère. */
export function designRect(f: BridgeFrame, x: number, z: number, w: number, d: number, rot = 0): number[] {
  const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
  const p: number[] = [];
  for (const [dx, dz] of [[-hw, -hd], [-hw, hd], [hw, hd], [hw, -hd]] as const) {
    const q = designPoint(f, x + dx * c + dz * s, z - dx * s + dz * c);
    p.push(q[0], q[1]);
  }
  return ensureCCW(p);
}

// ───────────────────────────── cotes relevées dans la carte ─────────────────────────────

/** Pont Alexandre III : arête de 145,7 m, tablier de 40 m (chaussée 18 + deux trottoirs de 11), Seine sur 109,6 m. */
export const PA3: BridgeDesign = {
  ref: [-32.63, 76.71, 31.15, 70.87, 30.38, 67.7, 26.08, 67.63, 25.83, 63.03, 22.63, 63, 22.73, 55.39, 20.32, 55.31, 20.32, 53.31, 21.53, -57.31, 25.11, -57.79, 24.82, -67.09, 28.32, -67.27, 28.29, -71.68, 32.51, -73.2, 32.53, -76.71, -32.5, -75.6, -28.82, -68.49, -26.35, -67.11, -24.73, -62.99, -21.61, -62.65, -21.16, -54.17, -18.45, -53.91, -21.4, 57.8, -24.9, 57.88, -24.48, 65.97, -27.97, 66.35, -27.8, 71.35],
  ox: 0.55, oz: 0.01, ux: -0.0267, uz: 0.9996, half: 20, roadHalf: 9, s0: -54.3, s1: 55.3, skew: -0.114, waterY: -5.65, slope: -0.0058,
};
/** Les quatre pylônes d'angle (centres relevés sur les bâtiments de la carte, repère de référence) ; +z = rive gauche (Invalides). */
export const PA3_PYLONS: readonly (readonly [number, number])[] = [[23.4, 68.2], [-25.9, 72.7], [-23.4, -61.6], [25.5, -65.8]];

/** Pont Neuf, grand bras (rive droite → île de la Cité) : tablier de 19,6 m, Seine sur 120,6 m, rives biaisées. */
export const PONT_NEUF: BridgeDesign = {
  ref: [-16.72, -60.82, -11.15, -55.29, -11.11, 66.89, 10.81, 65.23, 10.83, -59.59, 16.52, -66.95, -0.23, -64.33],
  ox: -0.3, oz: 0, ux: 0.0014, uz: 1, half: 9.8, roadHalf: 3.5, s0: -53.7, s1: 66.9, skew: -0.29, waterY: -7.35, slope: 0.0081,
};
/** Statue équestre d'Henri IV sur le terre-plein (socle relevé sur la carte, repère de référence du grand bras) ; cap local 90° (vers la place Dauphine). */
export const HENRI_IV = { x: -26.3, z: 105.1, heading: Math.PI / 2, fence: [-33.5, 98.8, -18.5, 111.8] as const };

/** Pont Neuf, petit bras (île de la Cité → rive gauche) : tablier de 19 m, Seine sur 54,9 m, biais inverse. */
export const PONT_NEUF_PETIT_BRAS: BridgeDesign = {
  ref: [13.47, -38.42, 4.43, -42.8, -4.07, -45.98, -14.53, 20.61, -16.88, 25.83, -26.11, 29.72, 3.98, 46.01, 5.05, 35.51, 16.04, -28.72, 20.77, -31.82, 23.27, -32.84],
  ox: -1.03, oz: -0.15, ux: -0.1468, uz: 0.9892, half: 9.5, roadHalf: 3.5, s0: -30.4, s1: 24.5, skew: 0.28, waterY: -5.8, slope: 0.0005,
};

/** Découpage d'un pont de pierre en arches égales entre les deux quais : axes des piles et ouverture des arches. */
export function archLayout(d: Pick<BridgeDesign, 's0' | 's1'>, arches: number, pier: number): { pitch: number; opening: number; piers: number[]; centers: number[] } {
  const pitch = (d.s1 - d.s0) / arches;
  const piers: number[] = [], centers: number[] = [];
  for (let i = 1; i < arches; i++) piers.push(d.s0 + i * pitch);
  for (let i = 0; i < arches; i++) centers.push(d.s0 + (i + 0.5) * pitch);
  return { pitch, opening: pitch - pier, piers, centers };
}

/** Nombre d'arches et épaisseur des piles : sept arches au grand bras, cinq au petit bras (comme en vrai). */
export const PONT_NEUF_ARCHES = { arches: 7, pier: 3.5 } as const;
export const PETIT_BRAS_ARCHES = { arches: 5, pier: 2.7 } as const;
