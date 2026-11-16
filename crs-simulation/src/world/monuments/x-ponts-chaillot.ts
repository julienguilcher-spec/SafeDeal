/* Lot « ponts » — plan du palais de Chaillot et de la fontaine de Varsovie. DONNÉES PURES : aucun import de Three.js
 * ni du kit (ce fichier est chargé par collide/*.ts, donc aussi par la simulation sous Node).
 *
 * Le palais est fait de DEUX repères de la carte, symétriques par rapport à l'axe du parvis : l'aile de Paris
 * (palais_chaillot, au nord-est) et l'aile de Passy (palais_chaillot_passy, au sud-ouest). Chaque aile est une barre
 * courbe entre un grand pavillon de tête (au bord du parvis) et un petit pavillon de queue. Les deux ailes sont
 * DESSINÉES dans un même repère « canonique » — celui de l'aile de Paris : pavillon de tête vers −x, façade sur les
 * jardins vers +z — l'aile de Passy en étant le miroir (x ↦ −x). wingPlan() rend l'emprise réelle du site dans ce
 * repère et la pose qui ramène le dessin sur le site (recalage rigide si la carte change d'ancre ou de cap). */
import type { MonumentCollider, MonumentSite } from './types';
import { alignRigid, ALIGN_ID, type Align } from './x-edifices-align';
import { cleanRing, ensureCCW, rectRing, signedArea } from './shape2d';

export const REF_PARIS: readonly number[] = [
  83.72, 41.21, 82.39, 32.48, 79.79, 23.18, 74, 10.84, 69.38, 3.9, 66.33, 0.17, 60.42, -5.52, 50.1, -13.62, 35.18, -22.02, 27.18, -25.69,
  16.08, -29.85, 7.64, -32.4, -0.95, -34.53, -11.53, -36.41, -34.95, -39.65, -52.12, -40.87, -52.07, -47.59, -50.42, -48.62, -49.55, -50.16,
  -49.44, -52.49, -49.84, -53.63, -52, -55.58, -51.99, -56.42, -59.2, -56.41, -58.81, -62.34, -63.13, -62.35, -63.1, -63.76, -83.4, -63.9,
  -83.35, -62.42, -87.31, -62.34, -87.34, -56.62, -94.56, -56.6, -94.56, -48.26, -96.26, -48.29, -96.28, -47.01, -94.44, -46.98, -94.44, -43.09,
  -96.28, -43.12, -96.3, -41.71, -94.54, -41.61, -94.46, -37.79, -96.3, -37.68, -96.25, -36.48, -94.49, -36.37, -94.56, -32.27, -96.25, -32.3,
  -96.28, -31.03, -94.58, -31, -94.58, -26.83, -96.28, -26.86, -96.23, -25.51, -94.53, -25.62, -94.68, -21.45, -96.44, -21.41, -96.47, -20,
  -94.63, -19.97, -94.77, -16.08, -96.32, -16.11, -96.34, -14.98, -94.72, -14.88, -94.7, -11.84, -87.56, -11.92, -87.45, -6.05, -83.77, -5.99,
  -83.74, -3.94, -81.47, -3.9, -79.24, -6.19, -77.31, -7.22, -73.06, -7.99, -68.83, -6.79, -65.56, -3.83, -63.37, -3.86, -63.33, -5.99,
  -59.44, -5.99, -59.49, -11.65, -52.91, -11.74, -52.89, -12.59, -43.78, -12.08, -24.57, -10.19, -6.67, -6.76, 7.47, -2.63, 21.03, 2.49, 29.79, 6.96,
  39.78, 13.99, 46.66, 21.25, 50.17, 26.62, 52.83, 32.39, 55.18, 43.33, 55.69, 51.04, 55.1, 60.37, 56.02, 60.31, 55.98, 62.58, 63.55, 62.5,
  63.47, 67.16, 68.13, 67.24, 68.12, 68.09, 85.02, 68.17, 85.03, 67.33, 89.56, 67.26, 89.57, 62.67, 90.49, 62.61, 90.72, 45.71, 89.8, 45.63,
  89.8, 41.17,
];

export const REF_PASSY: readonly number[] = [
  52.94, -47.1, 52.97, -40.59, 40.3, -39.75, 15.5, -36.93, -10.06, -31.58, -26.36, -25.42, -43.69, -16.89, -52.77, -11.32, -62.61, -3.07,
  -71.2, 6.89, -75.27, 13.47, -78.13, 19.29, -80.73, 26.24, -82.55, 33.28, -87.71, 33.41, -87.63, 41.12, -89.69, 41.15, -89.77, 45.82, -90.62, 45.8,
  -90.84, 62.56, -89.85, 62.58, -89.93, 67.24, -85.26, 67.32, -85.21, 68.24, -68.3, 68.19, -68.22, 67.27, -63.69, 67.21, -63.61, 62.54, -56.18, 62.6,
  -56.22, 60.55, -55.51, 60.56, -55.67, 53.2, -55.22, 43.73, -54.27, 38.09, -51.8, 30.28, -47.35, 22.37, -42.45, 16.94, -34.42, 10.71, -29.41, 7.55,
  -20.21, 2.97, -7.31, -2.53, -1.19, -4.69, 14.93, -8.44, 41.93, -11.57, 52.9, -12.16, 52.95, -11.24, 60.24, -11.18, 60.14, -5.39, 63.88, -5.39,
  63.92, -3.2, 66.18, -3.16, 69.34, -6.07, 73.61, -7.27, 77.84, -6.49, 80.63, -4.75, 82.09, -3.09, 84.28, -3.13, 84.39, -5.32, 88.07, -5.25,
  88.1, -10.98, 95.31, -11, 95.43, -13.89, 97.06, -13.94, 97.01, -15, 95.38, -15.1, 95.38, -19.13, 97.01, -19.17, 96.96, -20.37, 95.41, -20.4,
  95.48, -24.5, 97.03, -24.47, 97.05, -25.75, 95.43, -25.84, 95.43, -29.88, 97.06, -29.92, 97.08, -31.19, 95.52, -31.22, 95.52, -35.25,
  97.01, -35.29, 97.03, -36.57, 95.48, -36.59, 95.55, -40.55, 97.1, -40.53, 97.05, -41.87, 95.5, -41.9, 95.5, -45.93, 97.05, -45.9, 97.08, -47.17,
  95.52, -47.06, 95.52, -51.23, 97.07, -51.21, 97.16, -52.26, 95.54, -52.36, 95.46, -55.76, 88.24, -55.6, 88.13, -61.47, 84.24, -61.47,
  84.27, -62.89, 64.04, -62.96, 63.94, -61.47, 60.13, -61.54, 60.02, -55.6, 52.95, -55.72, 52.94, -55.02, 51.07, -53.21, 50.4, -51.03, 50.86, -49.11,
];

export type WingKey = 'paris' | 'passy';

/** Cotes du palais dans le repère canonique (m). Altitudes comptées au-dessus du PARVIS. */
export const CHAILLOT = {
  /** Abscisse de l'axe de symétrie du palais (milieu du parvis) et demi-largeur du parvis entre les deux pavillons. */
  axisX: -122.5, parvisHalf: 27.9,
  /** Limites des volumes : pavillon de tête à l'ouest de headX, pavillon de queue au sud de tailZ. */
  headX: -49.3, tailZ: 41.0,
  /** Hauteurs au-dessus du parvis : corniche des ailes, pavillon de tête, pavillon de queue. */
  wingH: 15.5, headH: 25, tailH: 18,
  /** Point du parvis qui sert de niveau de référence, et altitude du parvis au-dessus de l'ancre faute de relief. */
  parvisX: -100, parvisZ: -35, parvisY: 3.7,
  /** Sol le plus bas au pied des murs, sous l'ancre, faute de relief (les murs descendent jusque-là). */
  lowY: -9,
  /** Quatre statues de bronze doré au bord du parvis (relevées sur la carte), tournées vers l'axe. */
  statues: [[-99.3, -50.5], [-99.4, -39.6], [-99.3, -28.9], [-99.4, -18.0]] as readonly (readonly [number, number])[],
  /** Groupe de bronze sur son pylône, devant la niche du pavillon, côté jardins (Hercule à Paris, Apollon à Passy). */
  group: [-73.4, 2.2] as readonly [number, number], groupPedH: 9.5,
} as const;

export interface WingPlan {
  /** Emprise de l'aile dans le repère canonique, antihoraire. */
  ring: number[];
  /** Pose du repère canonique dans le repère local du site : rigide (c, s, tx, tz), précédée d'un miroir x ↦ −x si `mirror`. */
  align: Align; mirror: boolean;
  /** Niveau du parvis et du sol le plus bas, relatifs à l'origine du monument. */
  parvisY: number; lowY: number;
}

function mirrorRing(ring: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = (ring.length >> 1) - 1; i >= 0; i--) out.push(-ring[2 * i], ring[2 * i + 1]);
  return out;
}

/** Point du repère canonique → repère local du site. */
export function wingPoint(p: WingPlan, x: number, z: number): [number, number] {
  const xx = p.mirror ? -x : x, a = p.align;
  return [a.tx + xx * a.c - z * a.s, a.tz + xx * a.s + z * a.c];
}

/** Anneau du repère canonique → repère local du site (toujours antihoraire). */
export function wingRing(p: WingPlan, ring: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) { const q = wingPoint(p, ring[i], ring[i + 1]); out.push(q[0], q[1]); }
  return ensureCCW(out);
}

/** Plan d'une aile pour un site : emprise réelle (ou de référence), pose, niveaux lus dans le relief si le site les donne. */
export function wingPlan(site: MonumentSite, wing: WingKey): WingPlan {
  const ref = wing === 'paris' ? REF_PARIS : REF_PASSY;
  let align: Align = ALIGN_ID;
  let local: ArrayLike<number> = ref;
  if (site.footprint.length >= 6) {
    const a = alignRigid(ref, site.footprint);
    // même contour : le dessin suit la pose ; autre contour (carte régénérée) : on habille l'emprise fournie telle quelle
    if (a) align = a; else if (Math.abs(signedArea(site.footprint)) > 2000) local = site.footprint;
  }
  const ccw = cleanRing(ensureCCW(local), 0.05);
  const mirror = wing === 'passy';
  const plan: WingPlan = { ring: mirror ? mirrorRing(ccw) : ccw, align, mirror, parvisY: CHAILLOT.parvisY, lowY: CHAILLOT.lowY };
  if (site.groundAt) {
    const q = wingPoint(plan, CHAILLOT.parvisX, CHAILLOT.parvisZ);
    const y = site.groundAt(q[0], q[1]);
    if (Number.isFinite(y)) plan.parvisY = y;
    let low = Infinity;
    for (let i = 0; i + 1 < plan.ring.length; i += 2) { const r = wingPoint(plan, plan.ring[i], plan.ring[i + 1]); const g = site.groundAt(r[0], r[1]); if (g < low) low = g; }
    if (Number.isFinite(low)) plan.lowY = low - 1.5;
  }
  return plan;
}

/** Découpe un anneau par le demi-plan a·x + b·z ≤ c (Sutherland-Hodgman) ; rend un anneau antihoraire, éventuellement vide. */
export function clipRing(ring: ArrayLike<number>, a: number, b: number, c: number): number[] {
  const out: number[] = [];
  const n = ring.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = ring[2 * i], z0 = ring[2 * i + 1], x1 = ring[2 * j], z1 = ring[2 * j + 1];
    const d0 = a * x0 + b * z0 - c, d1 = a * x1 + b * z1 - c;
    if (d0 <= 0) out.push(x0, z0);
    if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) { const t = d0 / (d0 - d1); out.push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t); }
  }
  return out.length >= 6 ? cleanRing(out, 0.02) : [];
}

/** Les trois volumes d'une aile (repère canonique) : pavillon de tête, barre courbe, pavillon de queue. */
export function wingParts(ring: ArrayLike<number>): { head: number[]; body: number[]; tail: number[] } {
  const head = clipRing(ring, 1, 0, CHAILLOT.headX);
  const rest = clipRing(ring, -1, 0, -CHAILLOT.headX);
  const tail = clipRing(rest, 0, -1, -CHAILLOT.tailZ);
  const body = clipRing(rest, 0, 1, CHAILLOT.tailZ);
  return { head, body, tail };
}

/** Obstacles d'une aile : ses trois volumes pleins, les socles des quatre statues du parvis et le pylône du groupe de bronze. */
export function wingColliders(site: MonumentSite, wing: WingKey): MonumentCollider[] {
  const p = wingPlan(site, wing);
  const parts = wingParts(p.ring);
  const out: MonumentCollider[] = [];
  const top = (h: number): number => p.parvisY + h - p.lowY;
  if (parts.head.length >= 6) out.push({ ring: wingRing(p, parts.head), height: top(CHAILLOT.headH), baseY: p.lowY });
  if (parts.body.length >= 6) out.push({ ring: wingRing(p, parts.body), height: top(CHAILLOT.wingH), baseY: p.lowY });
  if (parts.tail.length >= 6) out.push({ ring: wingRing(p, parts.tail), height: top(CHAILLOT.tailH), baseY: p.lowY });
  for (const [x, z] of CHAILLOT.statues) { const q = wingPoint(p, x, z); out.push({ ring: rectRing(q[0], q[1], 1.9, 1.9, Math.atan2(p.align.s, p.align.c) * -1), height: 5.2, baseY: 0 }); }
  const g = wingPoint(p, CHAILLOT.group[0], CHAILLOT.group[1]);
  out.push({ ring: rectRing(g[0], g[1], 4.6, 4.6, Math.atan2(p.align.s, p.align.c) * -1), height: CHAILLOT.groupPedH + 7, baseY: 0 });
  return out;
}

// ───────────────────────────── fontaine de Varsovie ─────────────────────────────

/**
 * Fontaine de Varsovie (1937), dans l'axe du palais, en contrebas du parvis. Repère local du repère supplémentaire
 * « fontaine_varsovie » (extra.ts) : origine au milieu du grand bassin, +z vers la Seine et la tour Eiffel.
 * Cotes relevées sur les plans d'eau de la carte : grand bassin de 24,8 × 101,8 m terminé en demi-cercle, tête en
 * croix de 59 m, deux petits bassins hauts, bassin en fer à cheval au bas.
 */
export const VARSOVIE = {
  /** Grand bassin : demi-largeur, z de la tête et z du centre du demi-cercle final. */
  half: 12.4, z0: -41.6, z1: 47.8,
  /** Tête en croix (bassin des cascades) : demi-largeur, z amont et aval. */
  headHalf: 29.5, headZ0: -50.4, headZ1: -41.6,
  /** Cascade centrale : gradins entre les deux petits bassins hauts. */
  stepsZ0: -61, stepsZ1: -50.4, stepsHalf: 11.2, steps: 6, drop: 6.1,
  /** Petits bassins hauts (centres) et leur côté. */
  upper: [[-16.75, -62.9], [16.75, -62.9]] as readonly (readonly [number, number])[], upperSize: 11.8,
  /** Groupes de bronze doré sur leurs socles (taureau et daim, chevaux et chien), au bas du grand bassin. */
  animals: [[24.2, 47.6], [-24.3, 47.2]] as readonly (readonly [number, number])[],
  /** Groupes de pierre au bord des petits bassins. */
  stones: [[-16.0, -72], [16.5, -72]] as readonly (readonly [number, number])[],
  /** Niveau de l'eau du grand bassin sous l'origine (carte : plan d'eau à 4,6 m, sol à 6,85 m au point d'ancrage). */
  waterY: -2.25,
  /** Bassin en fer à cheval, au bas : rayons intérieur et extérieur autour du centre du demi-cercle, niveau de l'eau. */
  shoeIn: 14.4, shoeOut: 20.2, shoeY: -2.45,
  /** Vingt canons à eau : dix de chaque côté de la cascade, portée et flèche du jet. */
  cannons: 20, range: 52, apex: 11,
} as const;

/** Altitude du sol autour de la fontaine faute de relief (pente des jardins : ≈ 6,6 % en haut, 3,4 % en bas). */
export function varsovieGround(z: number): number {
  return z < 0 ? -0.066 * z : -0.034 * z;
}

/** Contour (antihoraire) du grand bassin et de sa tête en croix, demi-cercle final compris. */
export function varsovieOutline(seg = 12): number[] {
  const V = VARSOVIE;
  const r: number[] = [-V.half, V.headZ1, -V.headHalf, V.headZ1, -V.headHalf, V.headZ0, V.headHalf, V.headZ0, V.headHalf, V.headZ1, V.half, V.headZ1, V.half, V.z1];
  for (let i = 1; i < seg; i++) { const a = (i / seg) * Math.PI; r.push(Math.cos(a) * V.half, V.z1 + Math.sin(a) * V.half); }
  r.push(-V.half, V.z1);
  return ensureCCW(r);
}

/** Obstacles de la fontaine : margelles des bassins (on ne traverse pas l'eau), gradins de la cascade, socles des groupes. */
export function varsovieColliders(): MonumentCollider[] {
  const V = VARSOVIE;
  const out: MonumentCollider[] = [];
  out.push({ ring: rectRing(0, (V.z0 + V.z1) / 2, 2 * V.half + 1.2, V.z1 - V.z0 + 1.2), height: 0.9, baseY: 0 });
  // demi-cercle final
  const cap: number[] = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; cap.push(Math.cos(a) * (V.half + 0.6), V.z1 + Math.sin(a) * (V.half + 0.6)); }
  out.push({ ring: ensureCCW(cap), height: 0.9, baseY: 0 });
  out.push({ ring: rectRing(0, (V.headZ0 + V.headZ1) / 2, 2 * V.headHalf + 1.2, V.headZ1 - V.headZ0 + 1.2), height: 0.9, baseY: 0 });
  out.push({ ring: rectRing(0, (V.stepsZ0 + V.stepsZ1) / 2, 2 * V.stepsHalf + 2, V.stepsZ1 - V.stepsZ0), height: 2.5, baseY: 0 });
  for (const [x, z] of V.upper) out.push({ ring: rectRing(x, z, V.upperSize + 1, V.upperSize + 1), height: 1.0, baseY: 0 });
  for (const [x, z] of V.animals) out.push({ ring: rectRing(x, z, 3.6, 6.4), height: 6, baseY: 0 });
  for (const [x, z] of V.stones) out.push({ ring: rectRing(x, z, 4.2, 3.2), height: 5, baseY: 0 });
  return out;
}
