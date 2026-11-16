/* =====================================================================================
 * RENDU DU DÉCOR — modèles du mobilier fixe parisien : banc, abribus vitré, panneau publicitaire,
 * kiosque à journaux, colonne Morris, potelet, candélabre, feu tricolore, distributeur de billets,
 * fontaine Wallace, jardinière.
 * Cotes et teintes : docs/research/02-materiel-tenues-vehicules.md § 7.3.
 * ===================================================================================== */

import {
  FX_LAMP, FX_NIGHT, FX_ON, FX_PED_G, FX_PED_R, FX_TL_A, FX_TL_G, FX_TL_R, NO_BOTTOM, P_BODY, P_FRAGILE, P_LIGHT, P_PANE,
  P_SHARD, P_SOFT,
} from './geo';
import { S } from './models-a';
import type { ModelFn } from './models-a';
import * as C from './palette';

const PI = Math.PI;

/** Banc public à lattes de bois sur piètements de fonte (2,0 × 0,6 × 0,8 m). */
export const banc: ModelFn = (b, lod) => {
  if (lod === 2) {
    b.c(C.BOIS_VERT).box(0, 0.42, 0.02, 2.0, 0.08, 0.42).box(0, 0.66, -0.25, 2.0, 0.3, 0.05);
    return;
  }
  b.c(C.VERT_PARIS);
  for (const x of [-0.82, 0.82]) {
    if (lod === 0) {
      b.bar(x, 0, 0.22, x, 0.42, 0.2, 0.03, 5);
      b.tube([x, 0, -0.2, x, 0.4, -0.2, x, 0.6, -0.24, x, 0.8, -0.3], 0.03, 5, 1, 0, 0);
      b.bar(x, 0.4, 0.22, x, 0.4, -0.2, 0.025, 4);
      b.tube([x, 0.4, 0.22, x, 0.62, 0.2, x, 0.62, -0.1, x, 0.58, -0.24], 0.018, 4, 1, 0, 0);
    } else {
      b.box(x, 0.21, 0.02, 0.06, 0.42, 0.46, NO_BOTTOM).box(x, 0.6, -0.25, 0.06, 0.4, 0.06);
    }
  }
  b.c(C.BOIS_VERT).tex('bois');
  if (lod === 0) {
    const zs = [-0.15, -0.06, 0.03, 0.12, 0.21];
    for (let i = 0; i < 5; i++) b.part(i % 2 === 1 ? P_SOFT : P_BODY).box(0, 0.44, zs[i]!, 2.0, 0.03, 0.08);
    const ys = [0.56, 0.67, 0.78];
    for (let i = 0; i < 3; i++) b.part(i === 1 ? P_SOFT : P_BODY).box(0, ys[i]!, -0.235 - (ys[i]! - 0.5) * 0.2, 2.0, 0.085, 0.028);
  } else {
    b.box(0, 0.44, 0.03, 2.0, 0.03, 0.44).box(0, 0.67, -0.27, 2.0, 0.3, 0.028);
  }
  b.part(P_BODY).tex('').tagSpot(0, 0.67, -0.25, 1.1, 0.26);
};

/** Abribus : toit plat, trois vitres de fond, une vitre latérale, caisson publicitaire lumineux, banc. */
export const abribus: ModelFn = (b, lod, skin) => {
  const A = 'affiche_' + (skin % 4) * 2, B = 'affiche_' + ((skin % 4) * 2 + 1);
  b.c(C.ACIER_SOMBRE);
  // toit
  b.box(0, 2.53, 0.05, 4.3, 0.1, 1.75);
  b.c(C.ACIER);
  if (lod === 2) {
    b.box(-1.95, 1.24, -0.72, 0.08, 2.48, 0.08, NO_BOTTOM).box(0, 1.24, -0.72, 0.08, 2.48, 0.08, NO_BOTTOM);
  } else {
    for (const x of [-1.95, 1.95]) for (const z of [-0.72, 0.6]) b.box(x, 1.24, z, 0.07, 2.48, 0.07, NO_BOTTOM);
    // lisses hautes et basses du fond, montants
    b.box(0, 0.28, -0.74, 3.9, 0.045, 0.045).box(0, 2.22, -0.74, 3.9, 0.045, 0.045);
    if (lod === 0) {
      b.box(-0.65, 1.25, -0.74, 0.04, 1.9, 0.04).box(0.65, 1.25, -0.74, 0.04, 1.9, 0.04);
      b.c(0xe7ebee).box(0, 2.475, 0.05, 4.2, 0.012, 1.66);
      // bandeau lumineux sous le toit
      b.c(0xfff2d0).emit(FX_NIGHT, 0.9).box(0, 2.462, -0.3, 3.4, 0.02, 0.12).emit(0);
      // signal d'arrêt
      b.c(0x1f8f6a).box(-1.55, 2.72, 0.88, 0.8, 0.26, 0.05);
      b.c(0xf2f2f2).box(-1.55, 2.66, 0.907, 0.7, 0.05, 0.002);
    }
    // banc
    b.c(0x8a6a45).box(-0.5, 0.46, -0.5, 2.2, 0.05, 0.3);
    b.c(C.ACIER).box(-1.4, 0.22, -0.5, 0.05, 0.44, 0.26, NO_BOTTOM).box(0.4, 0.22, -0.5, 0.05, 0.44, 0.26, NO_BOTTOM);
  }
  // caisson publicitaire (côté droit), éclairé la nuit
  b.c(0x33373c).box(1.95, 1.3, -0.06, 0.14, 1.86, 1.26);
  b.c(0xffffff).gloss(0.5).emit(FX_NIGHT, 0.8);
  b.tex(A).quadX(2.022, 1.3, -0.06, 1.16, 1.74).tex(B).quadNX(1.878, 1.3, -0.06, 1.16, 1.74);
  b.tex('').emit(0).gloss(0);
  if (lod < 2) {
    // vitres : trois au fond, une sur le côté gauche
    const xs = [-1.3, 0, 1.3];
    for (let i = 0; i < 3; i++) {
      b.part(P_PANE + i).glass(0.3).c(C.VERRE).gloss(0.9).quadZ(xs[i]!, 1.25, -0.74, 1.24, 1.9, true).solid();
      b.part(P_SHARD + i).c(0xffffff).gloss(0.7).tex('verre_bords').quadZ(xs[i]!, 1.25, -0.74, 1.24, 1.9, true);
      b.tex('eclats_sol').quadY(xs[i]!, 0.012, -0.45, 1.3, 0.9).tex('');
    }
    b.part(P_PANE + 3).glass(0.3).c(C.VERRE).gloss(0.9).quadX(-1.95, 1.25, -0.08, 1.2, 1.9, true).solid();
    b.part(P_SHARD + 3).c(0xffffff).gloss(0.7).tex('verre_bords').quadX(-1.95, 1.25, -0.08, 1.2, 1.9, true);
    b.tex('eclats_sol').quadY(-1.9, 0.012, -0.05, 0.9, 1.2).tex('');
    b.part(P_BODY).gloss(0);
    b.halo(0, 2.4, -0.1, 0.3, 0xfff0d0, 0.45, FX_NIGHT, 3.6);
    b.tagSpot(0, 1.15, -0.725, 1.0, 0.5);
  }
};

/** Panneau publicitaire de 2 m² sur pied (« sucette »), affiches rétro-éclairées sous verre. */
export const panneau_pub: ModelFn = (b, lod, skin) => {
  const A = 'affiche_' + ((skin * 2 + 1) % 8), B = 'affiche_' + ((skin * 2 + 4) % 8);
  b.c(C.ACIER_SOMBRE).taper(0, 0, 0, 0.36, 0.17, 0.26, 0.13, 0.92, NO_BOTTOM);
  b.c(0x4a5058).box(0, 1.8, 0, 1.3, 1.78, 0.2);
  if (lod === 0) b.c(0x2c3035).box(0, 2.7, 0, 1.34, 0.03, 0.24).box(0, 0.905, 0, 1.34, 0.03, 0.24);
  b.c(0xffffff).gloss(0.55).emit(FX_NIGHT, 0.85);
  b.part(P_PANE).tex(A).quadZ(0, 1.8, 0.102, 1.18, 1.66);
  b.part(P_PANE + 1).tex(B).quadNZ(0, 1.8, -0.102, 1.18, 1.66);
  b.emit(0).gloss(0).tex('');
  // vitrage brisé : fond sombre, restes de verre, éclats au sol
  b.part(P_SHARD).c(0x15171a).quadZ(0, 1.8, 0.102, 1.18, 1.66);
  if (lod < 2) b.c(0xffffff).gloss(0.7).tex('verre_bords').quadZ(0, 1.8, 0.106, 1.18, 1.66).tex('eclats_sol').quadY(0, 0.012, 0.5, 1.3, 0.8).tex('').gloss(0);
  b.part(P_SHARD + 1).c(0x15171a).quadNZ(0, 1.8, -0.102, 1.18, 1.66);
  if (lod < 2) b.c(0xffffff).gloss(0.7).tex('verre_bords').quadNZ(0, 1.8, -0.106, 1.18, 1.66).tex('eclats_sol').quadY(0, 0.012, -0.5, 1.3, 0.8).tex('').gloss(0);
  b.part(P_BODY);
  if (lod < 2) {
    b.halo(0, 1.8, 0.25, 0.7, 0xf4f0e6, 0.3, FX_NIGHT, 2.6);
    b.tagSpot(0, 1.45, 0.107, 0.9, 0.45);
  }
};

/** Kiosque à journaux : édicule vert à frise dorée et dôme, étals de presse éclairés, auvent. */
export const kiosque: ModelFn = (b, lod, skin) => {
  const seg = S(lod, 16, 10, 6);
  b.c(C.VERT_PARIS).gloss(0.12);
  b.box(0, 1.25, -0.1, 2.8, 2.5, 1.9, NO_BOTTOM);
  if (lod < 2) {
    b.c(0x183d2e).box(0, 0.2, -0.1, 2.9, 0.4, 2.0, NO_BOTTOM);
    if (lod === 0) {
      b.c(0x245a44);
      for (const x of [-1.4, 1.4]) for (const z of [-1.05, 0.85]) b.box(x, 1.45, z, 0.12, 2.1, 0.12);
    }
    // frise
    b.c(C.VERT_PARIS).box(0, 2.62, -0.1, 3.0, 0.24, 2.1);
    b.c(C.OR_FRISE).gloss(0.35).box(0, 2.72, -0.1, 3.03, 0.035, 2.13).box(0, 2.53, -0.1, 3.03, 0.02, 2.13);
  }
  // dôme et épi
  b.c(0x234f3d).gloss(0.2).push().move(0, 2.74, -0.1).scale(1.5, 1, 1.05);
  b.lathe(lod === 2 ? [1.0, 0, 0.8, 0.34, 0.2, 0.66, 0, 0.7] : [1.0, 0, 0.97, 0.12, 0.82, 0.34, 0.52, 0.55, 0.2, 0.66, 0.06, 0.7], seg).pop();
  if (lod < 2) b.c(C.OR_FRISE).lathe([0.06, 3.44, 0.09, 3.48, 0.03, 3.54, 0, 3.56], 6, 0, -0.1);
  b.gloss(0);
  // étals de presse (vitrés) en façade
  const xs = [-0.68, 0.68];
  for (let i = 0; i < 2; i++) {
    b.part(P_PANE + i).c(0xffffff).gloss(0.4).emit(FX_NIGHT, 0.9).tex(i === 0 ? 'etal_tabac_presse' : 'affiche_' + (skin % 2 ? 3 : 6));
    b.quadZ(xs[i]!, 1.45, 0.855, 1.25, 1.6);
    b.part(P_SHARD + i).emit(0).gloss(0).tex('').c(0x121416).quadZ(xs[i]!, 1.45, 0.855, 1.25, 1.6);
    if (lod < 2) b.c(0xffffff).gloss(0.7).tex('verre_bords').quadZ(xs[i]!, 1.45, 0.86, 1.25, 1.6).tex('eclats_sol').quadY(xs[i]!, 0.012, 1.4, 1.3, 0.9).tex('').gloss(0);
  }
  b.part(P_BODY).emit(0).gloss(0).tex('');
  if (lod < 2) {
    // affiches latérales
    b.c(0xffffff).tex('affiche_' + ((skin + 2) % 8)).quadX(1.405, 1.4, -0.1, 1.1, 1.5).tex('affiche_' + ((skin + 5) % 8)).quadNX(-1.405, 1.4, -0.1, 1.1, 1.5).tex('');
    // auvent
    b.part(P_FRAGILE).c(C.VERT_PARIS).quad(-1.4, 2.25, 1.55, 1.4, 2.25, 1.55, 1.4, 2.5, 0.85, -1.4, 2.5, 0.85, true);
    b.part(P_BODY).halo(0, 1.6, 1.25, 0.8, 0xfff0d0, 0.45, FX_NIGHT, 3.6);
    b.push().rotY(PI).tagSpot(0, 1.3, 0.86, 1.7, 0.7).pop();
  }
};

/** Colonne Morris : fût d'affichage, marquise hexagonale, dôme à écailles et flèche. */
export const colonne_morris: ModelFn = (b, lod, skin) => {
  const seg = S(lod, 16, 10, 6);
  b.c(C.VERT_PARIS).gloss(0.15);
  b.lathe(lod === 2 ? [0.72, 0, 0.66, 0.18, 0.62, 0.48] : [0.72, 0, 0.72, 0.12, 0.66, 0.18, 0.66, 0.42, 0.62, 0.48], seg);
  b.gloss(0);
  // quatre affiches enroulées autour du fût (deux sous verre)
  const arcSeg = S(lod, 4, 3, 2);
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * PI * 2 + PI / 4, a1 = a0 + PI / 2;
    const name = 'affiche_' + ((skin * 3 + k * 2) % 8);
    if (k < 2) {
      b.part(P_PANE + k).c(0xffffff).gloss(0.3).emit(FX_NIGHT, 0.7).tex(name).arc(0, 0.48, 0, 0.62, 2.57, a0, a1, arcSeg);
      b.part(P_SHARD + k).emit(0).gloss(0).tex('').c(0x1a1c1e).arc(0, 0.48, 0, 0.62, 2.57, a0, a1, arcSeg);
    } else {
      b.part(P_BODY).c(0xffffff).gloss(0.3).emit(FX_NIGHT, 0.7).tex(name).arc(0, 0.48, 0, 0.62, 2.57, a0, a1, arcSeg);
    }
  }
  b.part(P_BODY).emit(0).gloss(0.15).tex('').c(C.VERT_PARIS);
  if (lod === 0) for (let k = 0; k < 4; k++) b.push().rotY((k / 4) * PI * 2 + PI / 4).box(0, 1.76, 0.625, 0.05, 2.57, 0.03).pop();
  // marquise hexagonale
  b.cyl(0, 3.05, 0, 0.66, 0.92, 0.12, 6, 0, true).cyl(0, 3.17, 0, 0.92, 0.92, 0.1, 6, 1, true);
  if (lod === 0) {
    b.c(C.OR_FRISE);
    for (let k = 0; k < 6; k++) b.push().rotY((k / 6) * PI * 2).box(0.9, 3.2, 0, 0.07, 0.09, 0.09).pop();
    b.c(C.VERT_PARIS);
  }
  // dôme à écailles, flèche
  b.lathe(lod === 2 ? [0.8, 3.27, 0.58, 3.75, 0.16, 4.15, 0, 4.5] : [0.8, 3.27, 0.75, 3.45, 0.58, 3.75, 0.36, 4.0, 0.16, 4.15, 0.07, 4.22], seg);
  if (lod < 2) b.lathe([0.07, 4.22, 0.1, 4.28, 0.04, 4.36, 0.02, 4.48, 0, 4.5], 6);
  b.gloss(0);
  if (lod < 2) {
    b.halo(0, 1.9, 0, 1.2, 0xfff0d8, 0.22, FX_NIGHT, 3.2);
    b.tagSpot(0, 1.15, 0.632, 0.7, 0.4);
    b.push().rotY(2.2).tagSpot(0, 1.3, 0.632, 0.7, 0.4).pop();
  }
};

/** Potelet anti-stationnement à boule blanche. */
export const potelet: ModelFn = (b, lod) => {
  b.c(C.BRUN_POTELET).cyl(0, 0, 0, 0.035, 0.035, 0.93, S(lod, 8, 5, 4), 0);
  if (lod === 0) {
    b.cyl(0, 0.8, 0, 0.043, 0.043, 0.03, 8, 3);
    b.c(C.BLANC_BOULE).ball(0, 0.975, 0, 0.05, 8, 4);
  } else {
    b.c(C.BLANC_BOULE).box(0, 0.965, 0, 0.08, 0.08, 0.08);
  }
};

/** Candélabre de boulevard : fût de fonte, crosse côté chaussée (+z), lanterne piétonne côté trottoir. */
export const candelabre: ModelFn = (b, lod) => {
  b.c(C.VERT_SOMBRE).gloss(0.1);
  if (lod === 2) {
    b.cyl(0, 0, 0, 0.11, 0.06, 8.05, 3, 0);
    b.bar(0, 8.0, 0, 0, 8.8, 1.4, 0.04, 3);
    b.part(P_LIGHT).gloss(0).c(0xffe2b0).emit(FX_LAMP, 1).box(0, 8.48, 1.4, 0.36, 0.4, 0.36);
    b.halo(0, 8.45, 1.4, 0.9, C.LAMPE, 1.0, FX_LAMP, 9, 80);
    b.box(0, 4.48, -0.55, 0.22, 0.26, 0.22);
    b.halo(0, 4.48, -0.55, 0.5, C.LAMPE, 0.6, FX_LAMP, 0, 0);
    return;
  }
  const seg = S(lod, 10, 6, 4);
  b.lathe([0.2, 0, 0.2, 0.08, 0.16, 0.14, 0.15, 0.9, 0.11, 1.0, 0.12, 1.06, 0.1, 1.12], seg);
  b.cyl(0, 1.12, 0, 0.09, 0.06, 6.9, S(lod, 8, 5, 3), 0);
  if (lod === 0) {
    b.lathe([0.075, 4.3, 0.1, 4.36, 0.075, 4.42], 8);
    b.lathe([0.06, 7.9, 0.09, 7.98, 0.06, 8.06], 8);
  }
  // crosse et sa volute
  b.tube([0, 8.02, 0, 0, 8.5, 0.05, 0, 8.8, 0.3, 0, 8.9, 0.7, 0, 8.86, 1.15, 0, 8.78, 1.4], 0.035, S(lod, 6, 4, 3), 1, 0, 0);
  if (lod === 0) b.tube([0, 8.3, 0.06, 0, 8.52, 0.3, 0, 8.6, 0.62, 0, 8.5, 0.82, 0, 8.4, 0.74], 0.016, 4, 1, 0, 0);
  // lanterne principale
  b.lathe([0.05, 8.8, 0.22, 8.71, 0.24, 8.64], S(lod, 8, 6, 4), 0, 1.4);
  b.part(P_LIGHT).gloss(0).c(0xffe2b0).emit(FX_LAMP, 1).lathe([0, 8.26, 0.07, 8.27, 0.17, 8.37, 0.2, 8.64], S(lod, 8, 6, 4), 0, 1.4);
  b.halo(0, 8.45, 1.4, 0.9, C.LAMPE, 1.0, FX_LAMP, 9, 80);
  // lanterne piétonne
  b.part(P_BODY).emit(0).gloss(0.1).c(C.VERT_SOMBRE);
  b.tube([0, 4.5, -0.06, 0, 4.72, -0.3, 0, 4.7, -0.55], 0.022, 4, 1, 0, 0);
  b.lathe([0.03, 4.72, 0.15, 4.66, 0.16, 4.62], 6, 0, -0.55);
  b.part(P_LIGHT).gloss(0).c(0xffe2b0).emit(FX_LAMP, 0.9).lathe([0, 4.35, 0.05, 4.36, 0.12, 4.44, 0.14, 4.62], 6, 0, -0.55);
  b.halo(0, 4.48, -0.55, 0.5, C.LAMPE, 0.6, FX_LAMP, 4.5, 0);
  b.part(P_BODY).emit(0);
};

/** Feu tricolore : mât, caisson à trois feux tourné vers +z, répétiteur piéton sur le côté. */
export const feu_tricolore: ModelFn = (b, lod) => {
  b.c(C.MAT_FEU).cyl(0, 0, 0, 0.065, 0.055, 3.45, S(lod, 8, 5, 3), 1);
  if (lod === 0) b.cyl(0, 0, 0, 0.09, 0.08, 0.25, 8, 0);
  b.c(C.NOIR).box(0, 2.93, 0.14, 0.3, 0.95, 0.2);
  const ys = [3.24, 2.93, 2.62];
  const cols = [C.FEU_ROUGE, C.FEU_ORANGE, C.FEU_VERT];
  const kinds = [FX_TL_R, FX_TL_A, FX_TL_G];
  const halos = [0xff3020, 0xffa018, 0x20e070];
  for (let i = 0; i < 3; i++) {
    b.part(P_PANE).c(cols[i]!).emit(kinds[i]!, 1);
    if (lod === 2) b.quadZ(0, ys[i]!, 0.243, 0.2, 0.2);
    else b.push().move(0, ys[i]!, 0.243).rotX(PI / 2).disc(0, 0, 0, 0.1, S(lod, 10, 6, 4), true).pop();
    b.halo(0, ys[i]!, 0.3, 0.34, halos[i]!, 0.9, kinds[i]!, 0, 0);
    b.part(P_SHARD).emit(0).c(0x202224).quadZ(0, ys[i]!, 0.243, 0.18, 0.18);
    b.part(P_BODY).emit(0).c(C.NOIR);
    if (lod === 0) b.box(0, ys[i]! + 0.125, 0.31, 0.26, 0.02, 0.14);
  }
  if (lod < 2) {
    // répétiteur piéton (regarde vers +x) et bouton d'appel
    b.box(0.16, 2.1, 0, 0.12, 0.38, 0.14);
    b.c(0xffffff).tex('pieton_rouge').emit(FX_PED_R, 1).quadX(0.2215, 2.19, 0, 0.11, 0.11);
    b.tex('pieton_vert').emit(FX_PED_G, 1).quadX(0.2215, 2.01, 0, 0.11, 0.11).tex('').emit(0);
    if (lod === 0) b.c(0xd8b400).box(0, 1.1, 0.075, 0.08, 0.12, 0.05);
  }
};

/** Distributeur automatique de billets en façade ou sur pied. */
export const distributeur: ModelFn = (b, lod) => {
  b.c(0x7c8088).box(0, 0.9, -0.03, 0.9, 1.8, 0.64, NO_BOTTOM);
  b.c(0x1d3557).emit(FX_NIGHT, 0.6).box(0, 1.66, 0.295, 0.86, 0.2, 0.03).emit(0);
  b.c(0x2a2d31).box(0, 1.12, 0.292, 0.74, 0.78, 0.02);
  b.part(P_PANE).c(0xffffff).tex('ecran_dab').emit(FX_ON, 0.9).gloss(0.5).quadZ(0, 1.3, 0.305, 0.38, 0.3);
  b.part(P_SHARD).emit(0).gloss(0.3).c(0x8a9096).tex('fissures').quadZ(0, 1.3, 0.306, 0.38, 0.3).tex('').c(0x0e0f11).quadZ(0, 1.3, 0.304, 0.38, 0.3);
  b.part(P_BODY).gloss(0).tex('');
  if (lod === 0) {
    b.c(0x4a4e55).box(0, 0.94, 0.34, 0.52, 0.04, 0.14);
    b.c(0xffffff).tex('clavier').quadY(0, 0.961, 0.34, 0.2, 0.1).tex('');
    b.c(0x0e0f11).box(0.22, 1.1, 0.303, 0.14, 0.02, 0.01).box(0, 0.78, 0.303, 0.34, 0.03, 0.01);
  }
  if (lod < 2) {
    b.halo(0, 1.3, 0.5, 0.36, 0x9fc8ff, 0.28, FX_ON, 1.5);
    b.tagSpot(0, 0.42, 0.292, 0.62, 0.4);
  }
};

/** Fontaine Wallace (grand modèle, 2,71 m) : socle à huit pans, quatre cariatides, dôme à pointe. */
export const fontaine_wallace: ModelFn = (b, lod) => {
  const seg = S(lod, 12, 8, 5);
  b.c(C.VERT_PARIS).gloss(0.25);
  b.cyl(0, 0, 0, 0.42, 0.4, 0.12, 8, 1, true);
  if (lod === 2) {
    b.lathe([0.34, 0.12, 0.3, 0.5, 0.36, 0.62, 0.22, 0.8], seg);
    b.cyl(0, 0.8, 0, 0.19, 0.19, 0.92, 4, 0);
    b.lathe([0.33, 1.72, 0.3, 1.86, 0.12, 2.16, 0, 2.7], seg);
    return;
  }
  b.lathe([0.36, 0.12, 0.33, 0.2, 0.3, 0.5, 0.34, 0.56, 0.38, 0.6, 0.38, 0.66, 0.3, 0.72, 0.22, 0.78], seg);
  b.lathe([0.22, 0.78, 0.27, 0.84, 0.27, 0.88, 0.1, 0.86], seg);
  // quatre cariatides dos à dos
  for (let k = 0; k < 4; k++) {
    b.push().rotY((k / 4) * PI * 2 + PI / 4).move(0, 0.86, 0.17);
    if (lod === 0) {
      b.lathe([0.05, 0, 0.068, 0.25, 0.05, 0.5, 0.062, 0.62, 0.034, 0.7, 0.046, 0.76, 0.03, 0.82, 0, 0.84], 6);
      b.bar(0.05, 0.62, 0, 0.09, 0.86, 0.02, 0.018, 3).bar(-0.05, 0.62, 0, -0.09, 0.86, 0.02, 0.018, 3);
    } else {
      b.cyl(0, 0, 0, 0.055, 0.045, 0.86, 4, 0);
    }
    b.pop();
  }
  if (lod === 0) b.cyl(0, 0.86, 0, 0.02, 0.02, 0.86, 5, 0);
  // entablement, dôme à écailles, pointe aux dauphins
  b.cyl(0, 1.72, 0, 0.33, 0.33, 0.06, seg, 2);
  b.lathe([0.33, 1.78, 0.3, 1.86, 0.22, 2.02, 0.12, 2.16, 0.06, 2.24], seg);
  b.lathe([0.06, 2.24, 0.09, 2.32, 0.05, 2.42, 0.07, 2.5, 0.02, 2.62, 0, 2.7], S(lod, 8, 6, 4));
  b.gloss(0);
};

/** Jardinière de voirie : bac de pierre reconstituée, arbustes. */
export const jardiniere: ModelFn = (b, lod) => {
  b.c(C.BETON).taper(0, 0, 0, 1.4, 0.5, 1.5, 0.6, 0.45, NO_BOTTOM);
  if (lod === 2) {
    b.c(0x3f6b35).box(0, 0.58, 0, 1.3, 0.26, 0.46);
    return;
  }
  b.c(0x9a9d9f).box(0, 0.47, 0, 1.54, 0.04, 0.64);
  b.c(0x3b2c1f).quadY(0, 0.492, 0, 1.4, 0.5);
  const greens = [0x3f6b35, 0x4d7a3a, 0x356030];
  const xs = [-0.45, 0, 0.45];
  for (let i = 0; i < 3; i++) {
    b.c(greens[i]!).push().move(xs[i]!, 0.6, i === 1 ? 0.03 : -0.02).scale(1, 0.62, 0.78);
    b.ball(0, 0, 0, 0.3, S(lod, 8, 6, 5), S(lod, 5, 4, 3)).pop();
  }
  if (lod === 0) {
    const fl = [0xd94f6a, 0xf2d14a, 0xf2f2f2, 0xb565d9];
    for (let i = 0; i < 8; i++) b.c(fl[i % 4]!).box(-0.6 + i * 0.17, 0.74 + (i % 3) * 0.02, (i % 2 ? 0.14 : -0.12), 0.05, 0.05, 0.05);
  }
  b.tagSpot(0, 0.22, 0.29, 0.9, 0.3);
};
