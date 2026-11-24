/* SILHOUETTES D'HORIZON : grands repères HORS CARTE, visibles au loin dans la bonne direction et à la bonne distance
 * depuis le cœur de Paris (dossier 04, § 3.23). Elles sont déclarées ici avec leurs coordonnées réelles (projection
 * du BRIEF) et ne chargent JAMAIS de modèle détaillé : une silhouette de moins de 400 triangles, posée par le système
 * (system.ts) qui règle leur voile atmosphérique et les rapproche si elles sortent du champ de la caméra.
 * Altitudes : y = 0 au sol de la Concorde (≈ 34 m NGF) ; `baseY` = altitude NGF du sol − 34.
 * Repère local d'une silhouette : origine au centre au sol, façade principale vers +z, puis rotation `heading`. */
import * as THREE from 'three';
import { Builder, archBlock, box, cyl, finishFar, frustum, horizonMaterial, lathe, pose, prism } from './kit';
import { lonLatToXZ } from './extra';

export interface HorizonDef {
  key: string;
  name: string;
  lon: number; lat: number;
  /** Position dans le monde (m), déduite de lon/lat. */
  x: number; z: number;
  /** Altitude du pied au-dessus du zéro du jeu (m) et hauteur du repère (m). */
  baseY: number; height: number;
  /** Cap de la façade principale (rad). */
  heading: number;
  /** Silhouette (≤ 400 triangles). */
  build(): THREE.Object3D;
}

const NGF0 = 34;
const deg = (d: number): number => (d * Math.PI) / 180;

/** Profil d'un dôme ovoïde (rayon r à la base y0, sommet à y1), de bas en haut. */
function ovoid(r: number, y0: number, y1: number, rows: number, tip = 0): number[] {
  const p: number[] = [];
  for (let k = 0; k <= rows; k++) { const a = (k / rows) * (Math.PI / 2); p.push(Math.max(tip, r * Math.cos(a)), y0 + (y1 - y0) * Math.sin(a)); }
  return p;
}

/** Sacré-Cœur de Montmartre : basilique blanche à dôme ovoïde (83 m), quatre coupoles, campanile (91 m), sur sa butte. */
function buildSacreCoeur(): THREE.Object3D {
  const b = new Builder();
  const white = horizonMaterial('sacre_coeur:pierre', 0xede9dd, 0.95, 0xfff4e0), hill = horizonMaterial('sacre_coeur:butte', 0x5d6a58, 0.05), roofs = horizonMaterial('sacre_coeur:toits', 0x8d8c86, 0.12);
  // la butte : gradins de toits puis de verdure, 96 m sous le parvis (le pied se perd derrière la ville)
  b.add(roofs, cyl(620, 330, 62, 8, { flat: true }).translate(15, -96, 50));
  b.add(hill, cyl(300, 110, 34, 8, { flat: true }).translate(0, -34, 30));
  // nef et abside, porche à trois arches, tambour et grand dôme, lanternon
  b.add(white, box(36, 24, 62).translate(0, 0, -6));
  b.add(white, box(30, 17, 9).translate(0, 0, 29));
  b.add(white, cyl(17, 17, 22, 8, { flat: true, start: -Math.PI / 2, sweep: Math.PI }).rotateY(Math.PI).translate(0, 0, -37));
  b.add(white, cyl(9.5, 9, 26, 10, { top: false }).translate(0, 24, 4));
  b.add(white, lathe(ovoid(9.2, 50, 76, 4, 1.6), 10, { smooth: true }).translate(0, 0, 4));
  b.add(white, cyl(1.7, 1.2, 5, 6).translate(0, 76, 4));
  b.add(white, cyl(1.2, 0, 3, 6).translate(0, 81, 4));
  // quatre coupoles d'angle
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    b.add(white, cyl(5.2, 5, 9, 6, { top: false }).translate(sx * 13.5, 24, 4 + sz * 14));
    b.add(white, lathe(ovoid(5, 33, 46, 2, 0.8), 6, { smooth: true }).translate(sx * 13.5, 0, 4 + sz * 14));
    b.add(white, cyl(0.8, 0, 4, 4).translate(sx * 13.5, 46, 4 + sz * 14));
  }
  // campanile, au chevet
  b.add(white, frustum(9.5, 9.5, 8.2, 8.2, 78).translate(0, 0, -47));
  b.add(white, frustum(8.4, 8.4, 0.6, 0.6, 13, { top: false }).translate(0, 78, -47));
  return finishFar(b, 'sacre_coeur');
}

/** Tour Montparnasse : prisme sombre de 209 m, plan en amande de 62 × 39 m. */
function buildMontparnasse(): THREE.Object3D {
  const b = new Builder();
  const glass = horizonMaterial('tour_montparnasse:verre', 0x3a342f, 0.5, 0xffd9a0), dark = horizonMaterial('tour_montparnasse:sommet', 0x2a2623, 0.2);
  // amande : deux longues faces bombées, pignons étroits (anneau antihoraire vu de dessus)
  const ring: number[] = [];
  const n = 5, L = 31, W = 19.5, tip = 6.5;
  for (let i = 0; i <= n; i++) { const t = -1 + (2 * i) / n; ring.push(t * L, -(tip + (W - tip) * (1 - t * t))); }
  for (let i = 0; i <= n; i++) { const t = 1 - (2 * i) / n; ring.push(t * L, tip + (W - tip) * (1 - t * t)); }
  const ccw: number[] = [];
  for (let i = ring.length - 2; i >= 0; i -= 2) ccw.push(ring[i], ring[i + 1]);
  b.add(glass, prism(ccw, 0, 201));
  // étage technique en retrait et mâts
  const top: number[] = [];
  for (let i = 0; i < ccw.length; i += 2) top.push(ccw[i] * 0.9, ccw[i + 1] * 0.86);
  b.add(dark, prism(top, 201, 209));
  b.add(dark, box(1.2, 14, 1.2).translate(-8, 209, 0));
  b.add(dark, box(0.8, 9, 0.8).translate(9, 209, 2));
  return finishFar(b, 'tour_montparnasse');
}

/** La Défense : la Grande Arche (cube évidé de 110 m) dans l'axe des Champs-Élysées et le bouquet de tours. */
function buildDefense(): THREE.Object3D {
  const b = new Builder();
  const arche = horizonMaterial('la_defense:arche', 0xdcdcda, 0.75, 0xfff2de), verre = horizonMaterial('la_defense:verre', 0x5a6b7d, 0.42, 0xffe2b0), sombre = horizonMaterial('la_defense:sombre', 0x39424d, 0.5, 0xffd9a0);
  // Grande Arche : 108 m de large, 110 m de haut, 112 m de profondeur ; vide de 70 × 90 m ; désaxée de 6,3°
  b.with(pose(0, 0, 0, deg(6.3)), () => archBlock(b, {
    width: 108, height: 110, depth: 112, mat: arche, matVault: arche, matJamb: arche,
    openings: [{ x: 0, width: 70, height: 91, kind: 'plat' }],
  }));
  // tours : le quartier s'étend en avant de l'Arche (+z = vers Paris), de part et d'autre de l'esplanade (|x| ≥ 110 m
  // pour laisser l'axe historique dégagé : l'Arche reste visible dans l'enfilade des Champs-Élysées)
  const towers: [number, number, number, number, number, number][] = [
    // z (vers Paris), x (côté), largeur, profondeur, hauteur, teinte (0 = verre bleuté, 1 = sombre)
    [330, -210, 52, 52, 231, 0], [210, 250, 46, 46, 194, 1], [470, 160, 44, 44, 178, 0], [560, -130, 40, 60, 187, 1],
    [120, -330, 56, 40, 161, 0], [690, 260, 50, 36, 165, 0], [760, -260, 42, 42, 220, 1], [420, -420, 60, 30, 142, 0],
    [880, 140, 38, 38, 152, 0], [620, 430, 46, 30, 128, 1], [980, -160, 36, 50, 110, 0], [260, 470, 40, 40, 110, 0],
  ];
  for (const [z, x, w, d, h, tint] of towers) b.add(tint ? sombre : verre, box(w, h, d).rotateY((z * 0.013) % 0.6).translate(x, -6, z));
  return finishFar(b, 'la_defense');
}

/** Panthéon : croix grecque de 110 × 84 m, portique à fronton vers l'ouest, dôme de plomb à 83 m sur tambour à colonnade. */
function buildPantheon(): THREE.Object3D {
  const b = new Builder();
  const stone = horizonMaterial('pantheon:pierre', 0xd8cdb3, 0.85), lead = horizonMaterial('pantheon:plomb', 0x8e9498, 0.7, 0xffe6c0), dark = horizonMaterial('pantheon:ombre', 0x8a8170, 0.4);
  b.add(stone, box(32, 26, 110));
  b.add(stone, box(84, 26, 34));
  b.add(lead, box(33, 2.5, 111, { bottom: true }).translate(0, 26, 0));
  b.add(lead, box(85, 2.5, 35, { bottom: true }).translate(0, 26, 0));
  // portique : colonnade suggérée par un volume en retrait, fronton
  b.add(dark, box(30, 20, 9).translate(0, 0, 58));
  b.add(stone, box(32, 3, 12, { bottom: true }).translate(0, 20, 58));
  b.add(stone, prism([-16, 0, 16, 0, 0, -7.5], 0, 12).rotateX(Math.PI / 2).translate(0, 23, 52));
  // tambour à colonnade, attique, dôme, lanterne
  b.add(stone, cyl(17, 17, 7, 14).translate(0, 28.5, 0));
  b.add(dark, cyl(13.2, 13.2, 14, 14, { top: false }).translate(0, 35.5, 0));
  b.add(stone, cyl(15.6, 15.6, 2, 14, { bottom: true }).translate(0, 49.5, 0));
  b.add(stone, cyl(12.6, 12.4, 6, 14, { top: false }).translate(0, 51.5, 0));
  b.add(lead, lathe(ovoid(12.3, 57.5, 72.5, 5, 2.4), 14, { smooth: true }));
  b.add(stone, cyl(2.6, 2.4, 7, 8).translate(0, 72.5, 0));
  b.add(lead, cyl(2.6, 0, 3.5, 8).translate(0, 79.5, 0));
  return finishFar(b, 'pantheon');
}

function horizon(key: string, name: string, lat: number, lon: number, groundNgf: number, height: number, headingDeg: number, build: () => THREE.Object3D): HorizonDef {
  const { x, z } = lonLatToXZ(lon, lat);
  return { key, name, lon, lat, x, z, baseY: groundNgf - NGF0, height, heading: deg(headingDeg), build };
}

/**
 * Repères d'horizon du cœur de Paris. Caps : le Sacré-Cœur regarde le sud (la ville) ; les grandes faces de la tour
 * Montparnasse regardent le nord-ouest et le sud-est ; la Défense est décrite avec +z vers l'est-sud-est (l'axe
 * historique : Arc de Triomphe, Concorde) ; le portique du Panthéon regarde l'ouest (rue Soufflot).
 */
export const HORIZON: readonly HorizonDef[] = [
  horizon('sacre_coeur', 'Basilique du Sacré-Cœur de Montmartre', 48.88680, 2.34302, 130, 91, 0, buildSacreCoeur),
  horizon('tour_montparnasse', 'Tour Montparnasse', 48.84211, 2.32198, 52.7, 209, 135, buildMontparnasse),
  horizon('la_defense', 'La Défense (Grande Arche et tours)', 48.89256, 2.23588, 64.6, 231, 116, buildDefense),
  horizon('pantheon', 'Panthéon', 48.84620, 2.34608, 58.4, 83, 270, buildPantheon),
];

export function getHorizon(key: string): HorizonDef | undefined {
  for (const h of HORIZON) if (h.key === key) return h;
  return undefined;
}
