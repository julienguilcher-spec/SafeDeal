/* =====================================================================================
 * RENDU DU DÉCOR — modèles du petit mobilier mobile, matière première des barricades :
 * corbeille de rue, bac roulant, barrière Vauban, barrière de chantier, palette, vélo et
 * trottinette en libre-service, table et chaise de terrasse, cône, débris, tas de pavés.
 * Cotes : docs/research/02-materiel-tenues-vehicules.md § 7.3 et 7.4, et gabarits de la simulation.
 * ===================================================================================== */

import { F_PY, NO_BOTTOM, P_ASH, P_BODY, P_FRAGILE, P_MELT, P_SOFT } from './geo';
import type { GeoBuilder } from './geo';
import * as C from './palette';

export type ModelFn = (b: GeoBuilder, lod: number, skin: number) => void;

const PI = Math.PI;
/** Choix selon le niveau de détail. */
export const S = (lod: number, a: number, b: number, c: number): number => (lod === 0 ? a : lod === 1 ? b : c);

/** Générateur pseudo-aléatoire déterministe (variantes de débris, pavés). */
export function lcg(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function circle(y: number, r: number, n: number): number[] {
  const p: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * PI * 2;
    p.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  return p;
}

/** Corbeille de rue : potelet, cerclage métallique et sac transparent (hauteur 1 m, Ø 0,45). */
export const poubelle: ModelFn = (b, lod) => {
  b.c(C.CORBEILLE);
  if (lod === 2) {
    b.box(0, 0.5, -0.2, 0.06, 1.0, 0.06, NO_BOTTOM);
    b.part(P_SOFT).c(0xa9cc9c).cyl(0, 0.16, 0, 0.16, 0.2, 0.78, 5, 1);
    return;
  }
  b.cyl(0, 0, -0.2, 0.03, 0.03, 1.0, S(lod, 6, 4, 4), 1);
  if (lod === 0) b.cyl(0, 0, -0.2, 0.075, 0.075, 0.015, 6, 1);
  // cerclage et son attache
  b.tube(circle(0.93, 0.2, S(lod, 14, 8, 6)), 0.015, S(lod, 5, 3, 3), 0, 1, 0);
  b.box(0, 0.93, -0.2, 0.05, 0.05, 0.06);
  if (lod === 0) {
    // couvercle partiel et éteignoir à cigarettes
    b.box(0, 0.975, -0.12, 0.3, 0.012, 0.18);
    b.box(0.15, 0.9, -0.16, 0.05, 0.1, 0.05);
  }
  const bag = [0, 0.15, 0.12, 0.16, 0.17, 0.25, 0.195, 0.6, 0.2, 0.93];
  if (lod === 0) {
    // déchets visibles à travers le sac
    b.part(P_SOFT);
    const r = lcg(7);
    const cols = [0xd8d2c4, 0x9a3b2e, 0x2f5f8a, 0xe0c060, 0x6a6a6a, 0xf0f0f0];
    for (let i = 0; i < 6; i++) {
      b.c(cols[i]!).push().move((r() - 0.5) * 0.2, 0.22 + r() * 0.3, (r() - 0.5) * 0.2).rotY(r() * 3).rotX(r());
      b.box(0, 0, 0, 0.07 + r() * 0.07, 0.05 + r() * 0.06, 0.06 + r() * 0.07).pop();
    }
    b.glass(0.42).c(C.SAC).gloss(0.5).lathe(bag, 10).solid().gloss(0);
  } else {
    b.part(P_SOFT).c(0xa9cc9c).lathe(bag, 6);
  }
  // calcinée : résidu fondu au pied
  b.part(P_ASH).c(C.SUIE).push().move(0, 0.02, 0).scale(1, 0.22, 1).ball(0, 0, 0, 0.24, 7, 3).pop();
};

/** Bac roulant de 660 l (1,26 × 0,77 × 1,22) : cuve, couvercle de couleur, quatre roues. */
export const conteneur: ModelFn = (b, lod, skin) => {
  const lid = C.COUVERCLES[skin % C.COUVERCLES.length]!;
  const tub = skin === 0 ? C.PLASTIQUE_VERT : C.PLASTIQUE_GRIS;
  b.part(P_MELT).c(tub);
  b.taper(0, 0.16, 0, 1.06, 0.62, 1.22, 0.74, 0.86, F_PY);
  if (lod === 2) {
    b.c(lid).taper(0, 1.02, 0, 1.26, 0.78, 1.0, 0.5, 0.16, NO_BOTTOM);
    return;
  }
  b.box(0, 1.035, 0, 1.26, 0.035, 0.78);
  b.c(lid).taper(0, 1.05, 0, 1.26, 0.78, 1.02, 0.52, 0.13, NO_BOTTOM);
  if (lod === 0) {
    b.box(0, 1.19, 0, 0.5, 0.025, 0.2);
    // nervures de la cuve et prises latérales
    b.c(tub);
    for (const x of [-0.36, 0, 0.36]) {
      b.box(x, 0.6, 0.345, 0.05, 0.78, 0.03);
      b.box(x, 0.6, -0.345, 0.05, 0.78, 0.03);
    }
    b.box(0.64, 0.96, 0, 0.05, 0.05, 0.5);
    b.box(-0.64, 0.96, 0, 0.05, 0.05, 0.5);
    // axe d'accrochage au camion
    b.c(C.ACIER).bar(-0.5, 1.0, 0.41, 0.5, 1.0, 0.41, 0.014);
  }
  // roues (caoutchouc : disparaissent au feu)
  b.part(P_SOFT).c(C.PNEU);
  for (const x of [-0.46, 0.46]) {
    for (const z of [-0.25, 0.25]) {
      if (lod === 0) b.push().move(x, 0.08, z).rotZ(PI / 2).cyl(0, -0.025, 0, 0.08, 0.08, 0.05, 8, 3).pop();
      else b.box(x, 0.08, z, 0.05, 0.16, 0.16);
    }
  }
  b.part(P_BODY).c(C.ACIER);
  if (lod === 0) for (const x of [-0.46, 0.46]) for (const z of [-0.25, 0.25]) b.box(x, 0.15, z, 0.07, 0.04, 0.07);
  b.tagSpot(0, 0.62, 0.352, 0.74, 0.42);
  // calciné : flaque de plastique fondu teintée par le couvercle
  b.part(P_ASH).c(C.SUIE).push().move(0, 0.01, 0).scale(1.25, 0.14, 0.85).ball(0, 0, 0, 0.6, 9, 3).pop();
  b.c(lid).push().move(0.2, 0.05, 0.1).scale(1, 0.12, 0.7).ball(0, 0, 0, 0.3, 6, 3).pop();
};

/** Barrière de police dite « Vauban » : 2,50 × 1,10 m, 18 barreaux, pieds plats, acier galvanisé. */
export const barriere_vauban: ModelFn = (b, lod) => {
  b.c(C.GALVA).gloss(0.12);
  const r = 0.019;
  const seg = S(lod, 5, 4, 3);
  b.bar(-1.23, 1.08, 0, 1.23, 1.08, 0, r, seg);
  b.bar(-1.23, 0.2, 0, 1.23, 0.2, 0, r, seg);
  if (lod < 2) {
    b.bar(-1.23, 0.2, 0, -1.23, 1.08, 0, r, seg);
    b.bar(1.23, 0.2, 0, 1.23, 1.08, 0, r, seg);
    // pieds plats
    for (const x of [-0.95, 0.95]) {
      b.bar(x, 0.02, 0, x, 0.2, 0, r, seg);
      b.box(x, 0.012, 0, 0.05, 0.024, 0.42);
    }
    if (lod === 0) {
      // crochet et œillet d'enchaînement
      b.box(1.27, 0.8, 0, 0.06, 0.03, 0.03);
      b.box(-1.27, 0.8, 0, 0.06, 0.03, 0.03);
    }
  }
  b.gloss(0).c(0xffffff).tex('barreaux').quadZ(0, 0.64, 0, 2.44, 0.86, true).tex('');
};

/** Grille de chantier mobile de 3,5 × 2 m sur plots (variante 1 : bâche verte). */
export const barriere_chantier: ModelFn = (b, lod, skin) => {
  b.c(C.GALVA).gloss(0.1);
  const seg = S(lod, 5, 4, 3);
  if (lod < 2) {
    b.tube([-1.72, 0.14, 0, -1.72, 1.98, 0, 1.72, 1.98, 0, 1.72, 0.14, 0, -1.72, 0.14, 0], 0.021, seg, 0, 0, 1);
    if (lod === 0) b.bar(-1.72, 1.05, 0, 1.72, 1.05, 0, 0.016, 4);
  } else {
    b.bar(-1.72, 1.98, 0, 1.72, 1.98, 0, 0.021, 3);
    b.bar(-1.72, 0.14, 0, -1.72, 1.98, 0, 0.021, 3);
    b.bar(1.72, 0.14, 0, 1.72, 1.98, 0, 0.021, 3);
  }
  b.gloss(0).c(0xffffff).tex('grillage');
  // la maille se répète deux fois sur la longueur
  b.quadZ(-0.86, 1.06, 0, 1.72, 1.84, true).quadZ(0.86, 1.06, 0, 1.72, 1.84, true).tex('');
  // plots
  b.c(C.GRIS_PLOT);
  for (const x of [-1.72, 1.72]) b.box(x, 0.07, 0, 0.24, 0.14, 0.56, lod === 0 ? 0 : NO_BOTTOM);
  if (skin % 2 === 1) {
    b.part(P_SOFT).c(0x2f6b45);
    b.quadZ(0, 0.98, 0.03, 3.36, 1.56, true);
    b.part(P_BODY).tagSpot(0, 1.0, 0.035, 1.6, 0.8);
  }
};

/** Palette de manutention 1,20 × 0,80 × 0,144 m. */
export const palette: ModelFn = (b, lod) => {
  b.c(C.BOIS_CLAIR);
  if (lod > 0) {
    b.tex('bois').box(0, 0.133, 0, 1.2, 0.022, 0.8).tex('');
    b.c(0x9a7a4e);
    for (const z of [-0.35, 0, 0.35]) b.box(0, 0.061, z, 1.2, 0.122, 0.1, NO_BOTTOM);
    return;
  }
  const zs = [-0.3275, -0.165, 0, 0.165, 0.3275];
  const ws = [0.145, 0.1, 0.145, 0.1, 0.145];
  for (let i = 0; i < 5; i++) {
    // une planche sur deux part en fumée
    b.part(i % 2 === 1 ? P_SOFT : P_BODY).tex('bois').box(0, 0.133, zs[i]!, 1.2, 0.022, ws[i]!);
  }
  b.part(P_BODY).tex('');
  for (const x of [-0.5275, 0, 0.5275]) b.box(x, 0.111, 0, 0.145, 0.022, 0.8);
  b.c(0x9a7a4e);
  for (const x of [-0.5275, 0, 0.5275]) for (const z of [-0.35, 0, 0.35]) b.box(x, 0.061, z, 0.145, 0.078, 0.1);
  b.c(C.BOIS_CLAIR);
  for (const z of [-0.35, 0, 0.35]) b.box(0, 0.011, z, 1.2, 0.022, 0.1);
};

/** Vélo en libre-service (opérateur fictif) : cadre ouvert, panier, variante 1 à assistance électrique. */
export const velo: ModelFn = (b, lod, skin) => {
  const frame = skin % 2 === 1 ? C.VELO_ELEC : C.VELO_MECA;
  const R = 0.335;
  // roues : disque découpé (jante, rayons, pneu) et bande de roulement
  b.part(P_SOFT).c(0xffffff).tex('roue');
  b.quadX(0, R, 0.56, 2 * R, 2 * R, true).quadX(0, R, -0.56, 2 * R, 2 * R, true).tex('');
  if (lod === 0) {
    b.c(C.PNEU);
    for (const z of [0.56, -0.56]) b.push().move(0, R, z).rotZ(PI / 2).cyl(0, -0.022, 0, R, R, 0.044, 14, 0).pop();
  }
  // calciné : il ne reste que les jantes voilées
  b.part(P_ASH).c(0x8a8480).tex('roue_nue');
  b.push().move(0, 0, 0.56).rotY(0.25).rotZ(0.12).quadX(0, R * 0.96, 0, 2 * R, 2 * R, true).pop();
  b.push().move(0, 0, -0.56).rotY(-0.2).rotZ(-0.1).quadX(0, R * 0.96, 0, 2 * R, 2 * R, true).pop();
  b.tex('').part(P_BODY).c(frame).gloss(0.2);
  const seg = S(lod, 6, 4, 3);
  if (lod === 2) {
    b.bar(0, 0.72, 0.38, 0, 0.3, -0.04, 0.035, 3);
    b.bar(0, 0.3, -0.04, 0, 0.9, -0.2, 0.03, 3);
    b.bar(0, 0.98, 0.34, 0, R, 0.56, 0.025, 3);
    return;
  }
  // cadre ouvert, bas, à gros tube
  b.tube([0, 0.74, 0.39, 0, 0.44, 0.17, 0, 0.3, -0.04], 0.036, seg, 1, 0, 0);
  b.bar(0, 0.3, -0.04, 0, 0.9, -0.2, 0.027, seg);
  b.bar(0, 0.62, 0.41, 0, 1.0, 0.34, 0.03, seg);
  const side = lod === 0 ? [-0.05, 0.05] : [0];
  for (const x of side) {
    b.bar(x, 0.64, 0.41, x, R, 0.56, 0.018, 4);
    b.bar(x, 0.3, -0.04, x, R, -0.56, 0.018, 4);
    b.bar(x, 0.72, -0.16, x, R, -0.56, 0.014, 4);
  }
  // potence, guidon, poignées
  b.c(C.ACIER_SOMBRE).bar(0, 1.0, 0.34, 0, 1.05, 0.29, 0.02, 4);
  b.bar(-0.27, 1.05, 0.27, 0.27, 1.05, 0.27, 0.014, 4);
  b.part(P_SOFT).c(C.PNEU).box(0, 0.93, -0.22, 0.15, 0.06, 0.27);
  if (lod === 0) {
    b.box(-0.24, 1.05, 0.27, 0.1, 0.036, 0.036).box(0.24, 1.05, 0.27, 0.1, 0.036, 0.036);
    // garde-boue arrière et carter de chaîne
    b.part(P_BODY).c(0x6f7f76);
    b.tube([0, R + 0.2, -0.2, 0, R + 0.34, -0.42, 0, R + 0.38, -0.56, 0, R + 0.3, -0.78, 0, R + 0.08, -0.93], 0.022, 3, 1, 0, 0);
    b.c(frame).box(0.045, 0.33, -0.3, 0.02, 0.1, 0.52);
    // pédalier
    b.c(C.ACIER_SOMBRE).bar(-0.1, 0.3, -0.04, 0.1, 0.3, -0.04, 0.018, 4);
    b.box(0.11, 0.22, 0.04, 0.08, 0.02, 0.05).box(-0.11, 0.38, -0.12, 0.08, 0.02, 0.05);
  }
  // panier avant
  b.part(P_FRAGILE).c(0x55595c).box(0, 0.86, 0.6, 0.34, 0.2, 0.24, F_PY);
  if (lod === 0) {
    b.c(0xf0f0e8).emit(0, 0).box(0, 0.74, 0.725, 0.05, 0.04, 0.02);
    b.c(0xb01818).box(0, 0.62, -0.92, 0.05, 0.04, 0.02);
  }
  b.part(P_BODY);
  if (skin % 2 === 1) {
    // batterie sur le tube diagonal
    b.c(0x22262a).push().move(0, 0.56, 0.24).rotX(-0.93).box(0, 0, 0, 0.1, 0.34, 0.09).pop();
  }
  // attache de station à l'avant
  b.c(C.ACIER).box(0, 0.6, 0.47, 0.07, 0.07, 0.07);
};

/** Trottinette électrique en libre-service (trois opérateurs fictifs). */
export const trottinette: ModelFn = (b, lod, skin) => {
  const col = C.TROTTINETTES[skin % C.TROTTINETTES.length]!;
  b.part(P_SOFT).c(C.PNEU);
  for (const z of [0.44, -0.44]) {
    if (lod === 0) b.push().move(0, 0.11, z).rotZ(PI / 2).cyl(0, -0.022, 0, 0.11, 0.11, 0.044, 10, 3).pop();
    else b.box(0, 0.11, z, 0.045, 0.22, 0.22);
  }
  b.part(P_BODY).c(0x1b1b1d).box(0, 0.135, -0.03, 0.17, 0.06, 0.64);
  b.c(col).gloss(0.2);
  b.bar(0, 0.17, 0.4, 0, 1.11, 0.33, 0.026, S(lod, 6, 4, 3));
  b.c(0x1b1b1d).gloss(0).bar(-0.22, 1.11, 0.33, 0.22, 1.11, 0.33, 0.015, 4);
  if (lod === 0) {
    b.box(0, 0.22, 0.4, 0.075, 0.12, 0.085);
    b.bar(0, 0.11, 0.44, 0, 0.2, 0.41, 0.02, 4);
    b.box(0, 0.215, -0.42, 0.1, 0.02, 0.22);
    b.box(0, 1.14, 0.33, 0.09, 0.03, 0.06);
    b.c(col).box(0, 0.168, -0.03, 0.15, 0.006, 0.5);
    b.part(P_SOFT).c(C.PNEU).box(-0.19, 1.11, 0.33, 0.09, 0.036, 0.036).box(0.19, 1.11, 0.33, 0.09, 0.036, 0.036);
    b.part(P_BODY).c(C.ACIER_SOMBRE).bar(0.06, 0.12, -0.1, 0.16, 0.01, -0.06, 0.008, 3);
  }
};

/** Guéridon de bistrot Ø 0,70 m (variante 0 : marbre cerclé de laiton ; 1 : bois sombre). */
export const table_terrasse: ModelFn = (b, lod, skin) => {
  const seg = S(lod, 16, 8, 6);
  b.c(skin % 2 === 0 ? 0xe8e4da : 0x4a3424).gloss(skin % 2 === 0 ? 0.3 : 0.1);
  b.cyl(0, 0.715, 0, 0.33, 0.33, 0.03, seg, 3);
  if (lod === 0) b.c(0xa88b4a).gloss(0.4).cyl(0, 0.71, 0, 0.338, 0.338, 0.04, seg, 0);
  b.gloss(0).c(0x1c1c1c).cyl(0, 0.04, 0, 0.025, 0.025, 0.68, S(lod, 6, 4, 3), 0);
  if (lod === 0) b.lathe([0.21, 0, 0.2, 0.02, 0.07, 0.05, 0.03, 0.11], 10);
  else b.cyl(0, 0, 0, 0.2, 0.05, 0.05, 6, 0);
};

/** Chaise de bistrot en rotin tressé (variante 0 : crème et rouge ; 1 : vert et crème). */
export const chaise: ModelFn = (b, lod, skin) => {
  const wood = 0xb98b4e;
  const weave = skin % 2 === 0 ? 0xd8c7a6 : 0x9fbf9a;
  b.c(wood);
  const seg = S(lod, 4, 3, 3);
  for (const x of [-0.19, 0.19]) {
    b.bar(x, 0, 0.2, x * 0.9, 0.45, 0.18, 0.015, seg);
    b.bar(x, 0, -0.21, x * 0.9, 0.86, -0.25, 0.015, seg);
  }
  if (lod === 0) {
    b.bar(-0.18, 0.2, 0.19, 0.18, 0.2, 0.19, 0.01, 3);
    b.bar(-0.18, 0.2, -0.21, 0.18, 0.2, -0.21, 0.01, 3);
    b.bar(-0.17, 0.85, -0.25, 0.17, 0.85, -0.25, 0.016, 4);
  }
  b.c(weave).tex('osier');
  b.box(0, 0.455, -0.01, 0.4, 0.035, 0.41);
  b.box(0, 0.68, -0.243, 0.34, 0.27, 0.022).tex('');
};

/** Cône de chantier de 0,60 m à deux bandes blanches. */
export const cone: ModelFn = (b, lod) => {
  const seg = S(lod, 10, 6, 5);
  b.part(P_MELT).c(0x1d1d1d).box(0, 0.015, 0, 0.36, 0.03, 0.36);
  b.c(C.CONE).cyl(0, 0.03, 0, 0.135, 0.105, 0.19, seg, 0);
  b.c(0xf2f2f2).cyl(0, 0.22, 0, 0.105, 0.082, 0.14, seg, 0);
  b.c(C.CONE).cyl(0, 0.36, 0, 0.082, 0.03, 0.24, seg, 1);
};

/** Débris : gravats, morceaux de mobilier, éclats (trois variantes). */
export const debris: ModelFn = (b, lod, skin) => {
  const r = lcg(31 + skin * 17);
  const n = lod === 0 ? 9 : 4;
  const cols = [C.BETON, C.GRANIT, 0x77736c, C.GRANIT_BLEU, 0x5a5650];
  for (let i = 0; i < n; i++) {
    const a = r() * PI * 2, d = r() * 0.3;
    const sx = 0.1 + r() * 0.22, sy = 0.06 + r() * 0.16, sz = 0.1 + r() * 0.2;
    b.c(cols[i % cols.length]!).push().move(Math.cos(a) * d, sy * 0.45, Math.sin(a) * d).rotY(r() * 3).rotX((r() - 0.5) * 0.7);
    b.box(0, 0, 0, sx, sy, sz).pop();
  }
  if (lod === 0) {
    b.c(0xffffff).gloss(0.5).tex('eclats_sol').quadY(0, 0.012, 0, 0.95, 0.95).tex('').gloss(0);
    // une planche et une barre tordue
    b.c(C.BOIS).push().move(0.1, 0.05, -0.05).rotY(0.7).rotZ(0.12).box(0, 0, 0, 0.7, 0.025, 0.09).pop();
    b.c(C.ACIER_SOMBRE).bar(-0.35, 0.03, 0.2, 0.2, 0.12, 0.33, 0.012, 3);
  }
};

/** Tas de pavés de granit (dépavage, chantier) : 1 × 1 × 0,5 m. */
export const pile_paves: ModelFn = (b, lod, skin) => {
  b.c(0xffffff).tex('paves').taper(0, 0, 0, 1.0, 1.0, lod === 2 ? 0.4 : 0.66, lod === 2 ? 0.4 : 0.66, lod === 2 ? 0.46 : 0.3, NO_BOTTOM).tex('');
  if (lod === 2) return;
  const r = lcg(5 + skin);
  const n = lod === 0 ? 12 : 4;
  const cols = [C.GRANIT, C.GRANIT_BLEU, 0x7a7d80, 0x64676b];
  for (let i = 0; i < n; i++) {
    const a = r() * PI * 2, d = r() * (i < n / 2 ? 0.22 : 0.42);
    const y = i < n / 2 ? 0.37 + r() * 0.06 : 0.07;
    b.c(cols[i % 4]!).push().move(Math.cos(a) * d, y, Math.sin(a) * d).rotY(r() * 3).rotX((r() - 0.5) * 0.5).rotZ((r() - 0.5) * 0.5);
    b.box(0, 0, 0, 0.14, 0.14, 0.2).pop();
  }
};
