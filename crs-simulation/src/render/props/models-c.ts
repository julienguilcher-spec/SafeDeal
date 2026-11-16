/* =====================================================================================
 * RENDU DU DÉCOR — modèles des grands équipements et des types propres à la carte :
 * échafaudage, sanisette, station de vélos, boîte aux lettres, arceau à vélos, panneau de
 * signalisation, statue, mât et drapeau, bouche d'incendie, horodateur, armoire technique,
 * colonne à verre, horloge publique, caméra, objet générique.
 * ===================================================================================== */

import { FX_NIGHT, FX_ON, NO_BOTTOM, P_BODY, P_PANE, P_SHARD, P_SOFT } from './geo';
import { S } from './models-a';
import type { ModelFn } from './models-a';
import * as C from './palette';

const PI = Math.PI;

/** Échafaudage de façade (8 × 1,2 × 9 m) : tubes, planchers, filet côté rue ; on passe dessous. */
export const echafaudage: ModelFn = (b, lod) => {
  const xs = [-3.95, -1.32, 1.32, 3.95];
  const seg = S(lod, 5, 4, 3);
  b.c(C.GALVA).gloss(0.1);
  for (const x of xs) {
    b.bar(x, 0, 0.55, x, 8.95, 0.55, 0.025, seg);
    if (lod < 2) b.bar(x, 0, -0.55, x, 8.95, -0.55, 0.025, seg);
    if (lod === 0) b.box(x, 0.012, 0.55, 0.16, 0.024, 0.16).box(x, 0.012, -0.55, 0.16, 0.024, 0.16);
  }
  const levels = [2.2, 4.4, 6.6, 8.8];
  for (let i = 0; i < levels.length; i++) {
    const y = levels[i]!;
    if (lod < 2) {
      b.c(C.GALVA).bar(-3.95, y, 0.55, 3.95, y, 0.55, 0.022, seg).bar(-3.95, y, -0.55, 3.95, y, -0.55, 0.022, seg);
      if (lod === 0) {
        for (const x of xs) b.bar(x, y, -0.55, x, y, 0.55, 0.022, 4);
        if (i < 3) b.bar(-3.95, y + 1.0, 0.55, 3.95, y + 1.0, 0.55, 0.018, 4);
      }
    }
    if (i < 3) b.gloss(0).c(0x9a7a50).tex('bois').box(0, y + 0.045, 0, 7.9, 0.05, 1.0).tex('').gloss(0.1);
  }
  if (lod === 0) {
    // contreventements et échelle
    b.c(C.GALVA);
    b.bar(-3.95, 0.1, -0.55, -1.32, 2.2, -0.55, 0.018, 4).bar(1.32, 0.1, -0.55, 3.95, 2.2, -0.55, 0.018, 4);
    b.bar(-1.32, 2.2, -0.55, 1.32, 4.4, -0.55, 0.018, 4).bar(-3.95, 4.4, -0.55, -1.32, 6.6, -0.55, 0.018, 4);
    b.bar(3.3, 0, 0.2, 3.3, 2.25, -0.3, 0.016, 4).bar(3.7, 0, 0.2, 3.7, 2.25, -0.3, 0.016, 4);
    for (let k = 1; k < 7; k++) b.bar(3.3, k * 0.32, 0.2 - k * 0.071, 3.7, k * 0.32, 0.2 - k * 0.071, 0.012, 3);
  }
  // filet de protection côté rue, à partir du premier plancher
  b.part(P_SOFT).gloss(0).c(0xdfe8e2);
  if (lod === 2) {
    // de loin, un filet de chantier est un voile opaque
    b.c(0xc9d3cc).quadZ(0, 5.575, 0.58, 7.9, 6.75, true);
  } else {
    b.tex('filet');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) b.quadZ(-2.9625 + i * 1.975, 3.325 + j * 2.25, 0.58, 1.975, 2.25, true);
  }
  b.tex('').part(P_BODY);
};

/** Sanisette : cabine aux extrémités arrondies, toit débordant, porte coulissante. */
export const sanisette: ModelFn = (b, lod) => {
  const seg = S(lod, 8, 5, 3);
  b.c(0x9a9c97);
  if (lod === 2) {
    b.box(0, 1.2, 0, 3.0, 2.4, 1.96, NO_BOTTOM);
    b.c(C.ACIER_SOMBRE).box(0, 2.5, 0, 3.2, 0.2, 2.1);
    return;
  }
  b.box(0, 1.2, 0, 1.2, 2.4, 2.0, NO_BOTTOM | 1 | 2 | 4);
  b.arc(0.6, 0, 0, 1.0, 2.4, -PI / 2, PI / 2, seg).arc(-0.6, 0, 0, 1.0, 2.4, PI / 2, PI * 1.5, seg);
  // toit débordant
  b.c(C.ACIER_SOMBRE).box(0, 2.499, 0, 1.2, 0.198, 2.1);
  b.cyl(0.6, 2.4, 0, 1.05, 1.05, 0.2, seg * 2, 3).cyl(-0.6, 2.4, 0, 1.05, 1.05, 0.2, seg * 2, 3);
  // porte, bandeau, voyants
  b.c(0xb8bcc0).gloss(0.45).box(0, 1.1, 1.0, 1.0, 2.0, 0.04).gloss(0);
  b.c(0xffffff).tex('toilettes').emit(FX_NIGHT, 0.7).quadZ(0, 2.24, 1.025, 1.0, 0.24).tex('').emit(0);
  if (lod === 0) {
    b.c(0x21c45d).emit(FX_ON, 1).box(0.62, 1.3, 1.005, 0.05, 0.05, 0.02).emit(0);
    b.c(0xe9ecef).box(0.4, 1.9, 1.03, 0.16, 0.12, 0.01);
    b.c(0x2c3035).box(0.62, 1.15, 1.0, 0.1, 0.16, 0.03);
  }
  b.push().rotY(PI).tagSpot(0, 1.2, 1.005, 1.5, 0.6).pop();
  b.push().rotY(PI / 2).tagSpot(0, 1.2, 1.605, 1.2, 0.6).pop();
  b.halo(0, 2.2, 1.2, 0.4, 0xf0f4ff, 0.3, FX_NIGHT, 2.4);
};

/** Station de vélos en libre-service : sept bornettes d'accrochage et une borne à écran. */
export const station_velo: ModelFn = (b, lod) => {
  b.c(0x55595c).box(-0.35, 0.03, 0, 5.1, 0.06, 0.5, NO_BOTTOM);
  if (lod === 2) {
    b.c(0x6f767c).box(-0.35, 0.42, 0, 4.9, 0.72, 0.22);
  } else {
    for (let i = 0; i < 7; i++) {
      const x = -2.6 + i * 0.75;
      b.c(0x6f767c).taper(x, 0.06, 0, 0.16, 0.22, 0.14, 0.2, 0.62, NO_BOTTOM);
      b.c(C.BORNE_VELO).box(x, 0.75, 0.02, 0.18, 0.14, 0.26);
      if (lod === 0) b.c(0x30d060).emit(FX_ON, 1).box(x, 0.8, 0.152, 0.03, 0.02, 0.01).emit(0);
    }
  }
  // borne
  b.c(0x4a5058).box(2.6, 0.95, 0, 0.42, 1.9, 0.3, NO_BOTTOM);
  b.c(C.BORNE_VELO).box(2.6, 1.95, 0, 0.46, 0.12, 0.34);
  b.c(0xffffff).tex('ecran_borne').emit(FX_ON, 0.8).gloss(0.4).quadZ(2.6, 1.35, 0.152, 0.3, 0.3).tex('').emit(0).gloss(0);
  if (lod < 2) {
    b.tagSpot(2.6, 0.7, 0.152, 0.36, 0.5);
    b.halo(2.6, 1.35, 0.3, 0.3, 0xa8e8d0, 0.25, FX_ON, 1.2);
  }
};

/** Boîte aux lettres jaune sur pied. */
export const boite_aux_lettres: ModelFn = (b, lod) => {
  b.c(0x4a4f55).box(0, 0.3, 0, 0.16, 0.6, 0.16, NO_BOTTOM);
  b.c(C.JAUNE_POSTE).box(0, 0.98, 0, 0.5, 0.78, 0.42);
  if (lod === 2) return;
  b.taper(0, 1.37, 0, 0.5, 0.42, 0.42, 0.34, 0.035, NO_BOTTOM);
  b.c(0x1a1a1a).box(-0.12, 1.2, 0.212, 0.18, 0.03, 0.01).box(0.12, 1.2, 0.212, 0.18, 0.03, 0.01);
  if (lod === 0) {
    b.c(0xffffff).tex('lettres').quadZ(0, 1.03, 0.213, 0.4, 0.2).tex('');
    b.c(0xc99f00).box(0, 0.74, 0.212, 0.3, 0.2, 0.006);
  }
  b.push().rotY(PI / 2).tagSpot(0, 0.95, 0.252, 0.36, 0.3).pop();
};

/** Arceau à vélos en tube d'acier. */
export const arceau_velo: ModelFn = (b, lod) => {
  b.c(0x8d9299).gloss(0.25);
  if (lod === 0) b.tube([-0.42, 0, 0, -0.42, 0.7, 0, -0.38, 0.8, 0, -0.28, 0.84, 0, 0.28, 0.84, 0, 0.38, 0.8, 0, 0.42, 0.7, 0, 0.42, 0, 0], 0.024, 6, 0, 0, 1);
  else b.tube([-0.42, 0, 0, -0.42, 0.82, 0, 0.42, 0.82, 0, 0.42, 0, 0], 0.024, 3, 0, 0, 1);
  b.gloss(0);
};

/** Panneau de signalisation : sens interdit, obligation, danger, stationnement et plaque de rue. */
export const panneau: ModelFn = (b, lod, skin) => {
  b.c(0x8d9299).cyl(0, 0, 0, 0.03, 0.03, 2.75, S(lod, 6, 4, 3), 1);
  const icons = ['sens_interdit', 'obligation', 'danger', 'stationnement'];
  const sizes = [0.66, 0.6, 0.74, 0.52];
  const k = skin % 4;
  const s = sizes[k]!;
  b.c(0xffffff).tex(icons[k]!).quadZ(0, 2.35, 0.04, s, s);
  b.c(0x3a3e44).quadNZ(0, 2.35, 0.03, s, s).tex('');
  if (k === 3 && lod < 2) {
    b.c(0xffffff).tex('plaque_rue').quadZ(0, 1.82, 0.04, 0.72, 0.36);
    b.c(0x3a3e44).quadNZ(0, 1.82, 0.03, 0.72, 0.36).tex('');
  }
};

/** Statue de bronze sur son piédestal de pierre. */
export const statue: ModelFn = (b, lod) => {
  b.c(C.PIERRE);
  if (lod === 2) {
    b.box(0, 0.9, 0, 1.4, 1.8, 1.4, NO_BOTTOM);
    b.c(C.BRONZE).cyl(0, 1.8, 0, 0.24, 0.16, 1.7, 4, 1).box(0, 3.6, 0, 0.24, 0.26, 0.24);
    return;
  }
  b.box(0, 0.15, 0, 1.6, 0.3, 1.6, NO_BOTTOM).box(0, 0.45, 0, 1.4, 0.3, 1.4).box(0, 1.15, 0, 1.1, 1.1, 1.1).box(0, 1.75, 0, 1.3, 0.1, 1.3);
  if (lod === 0) b.c(0x5c5140).gloss(0.3).quadZ(0, 1.15, 0.552, 0.6, 0.4).gloss(0);
  const seg = S(lod, 8, 6, 4);
  b.c(C.BRONZE).gloss(0.3);
  b.cyl(-0.11, 1.8, 0, 0.11, 0.09, 0.85, seg, 0).cyl(0.11, 1.8, 0.04, 0.11, 0.09, 0.85, seg, 0);
  b.lathe([0.2, 2.6, 0.22, 2.66, 0.2, 2.9, 0.25, 3.25, 0.12, 3.4, 0.07, 3.47], seg);
  b.ball(0, 3.6, 0, 0.14, seg, S(lod, 5, 4, 3));
  b.bar(0.22, 3.3, 0, 0.5, 3.86, 0.15, 0.05, S(lod, 5, 4, 3)).bar(-0.22, 3.3, 0, -0.3, 2.72, 0.1, 0.05, S(lod, 5, 4, 3));
  if (lod === 0) b.lathe([0.3, 2.3, 0.26, 2.62], seg);
  b.gloss(0).tagSpot(0, 1.1, 0.553, 0.8, 0.5);
};

/** Mât et drapeau tricolore. */
export const mat_drapeau: ModelFn = (b, lod) => {
  b.c(0xd9dcdf).cyl(0, 0, 0, 0.05, 0.03, 7.9, S(lod, 8, 5, 3), 1);
  if (lod < 2) {
    b.cyl(0, 0, 0, 0.1, 0.08, 0.3, 8, 0);
    b.c(C.OR_FRISE).ball(0, 7.95, 0, 0.06, 6, 4);
  }
  // trois bandes verticales, légèrement ondulées
  b.part(P_SOFT);
  const cols = [0x1f3c88, 0xf2f2f2, 0xd1242f];
  const n = lod === 2 ? 3 : 6;
  const w = 1.5 / n;
  for (let k = 0; k < n; k++) {
    const x0 = 0.04 + k * w, x1 = x0 + w;
    const z0 = 0.09 * Math.sin(k * (3 / n) * 1.1), z1 = 0.09 * Math.sin((k + 1) * (3 / n) * 1.1);
    const d0 = 0.03 * k * (3 / n), d1 = 0.03 * (k + 1) * (3 / n);
    b.c(cols[Math.floor((k * 3) / n)]!).quad(x0, 6.8 - d0, z0, x1, 6.8 - d1, z1, x1, 7.8 - d1, z1, x0, 7.8 - d0, z0, true);
  }
  b.part(P_BODY);
};

/** Bouche d'incendie rouge. */
export const bouche_incendie: ModelFn = (b, lod) => {
  const seg = S(lod, 8, 6, 5);
  b.c(C.ROUGE_BORNE).gloss(0.2);
  b.cyl(0, 0, 0, 0.13, 0.13, 0.04, seg, 1).cyl(0, 0.04, 0, 0.09, 0.085, 0.42, seg, 0);
  b.lathe([0.105, 0.46, 0.11, 0.5, 0.09, 0.6, 0.04, 0.67, 0, 0.69], seg);
  if (lod === 0) {
    b.push().move(0, 0.34, 0).rotZ(PI / 2).cyl(0, -0.15, 0, 0.045, 0.045, 0.3, 6, 3).pop();
    b.push().move(0, 0.3, 0).rotX(PI / 2).cyl(0, 0, 0, 0.055, 0.055, 0.14, 6, 1).pop();
  }
  b.gloss(0);
};

/** Horodateur à panneau solaire. */
export const horodateur: ModelFn = (b, lod) => {
  b.c(0x5b6660).box(0, 0.6, 0, 0.2, 1.2, 0.16, NO_BOTTOM).box(0, 1.36, 0, 0.3, 0.36, 0.22);
  b.part(P_PANE).c(0xffffff).tex('ecran_horo').emit(FX_ON, 0.7).gloss(0.4).quadZ(0, 1.42, 0.112, 0.2, 0.12);
  b.part(P_SHARD).emit(0).gloss(0).tex('').c(0x0e0f11).quadZ(0, 1.42, 0.112, 0.2, 0.12);
  b.part(P_BODY);
  if (lod < 2) {
    b.c(0x1b2540).gloss(0.6).push().move(0, 1.6, 0).rotX(-0.45).box(0, 0, 0, 0.3, 0.016, 0.26).pop().gloss(0);
    if (lod === 0) {
      b.c(0x1a1a1a).box(0.06, 1.29, 0.112, 0.08, 0.02, 0.008);
      b.c(0xffffff).tex('stationnement').quadZ(0, 1.02, 0.082, 0.14, 0.14).tex('');
    }
    b.tagSpot(0, 0.62, 0.082, 0.18, 0.36);
  }
};

/** Armoire technique de voirie (éclairage, télécoms). */
export const armoire_technique: ModelFn = (b, lod) => {
  b.c(C.BETON).box(0, 0.06, 0, 0.94, 0.12, 0.44, NO_BOTTOM);
  b.c(0xa8ab9f).box(0, 0.72, 0, 0.9, 1.2, 0.4);
  b.c(0x8f9288).box(0, 1.35, 0, 0.96, 0.06, 0.46);
  if (lod === 0) {
    b.c(0x6f7268).box(0, 0.72, 0.201, 0.012, 1.14, 0.004).box(0.06, 0.75, 0.205, 0.03, 0.12, 0.012);
    b.c(0xffffff).tex('grille_aeration').quadZ(-0.22, 1.14, 0.203, 0.3, 0.16).quadZ(0.22, 1.14, 0.203, 0.3, 0.16).tex('');
  }
  if (lod < 2) b.tagSpot(0, 0.62, 0.204, 0.74, 0.5);
};

/** Colonne à verre : silo arrondi à opercules. */
export const colonne_verre: ModelFn = (b, lod) => {
  const seg = S(lod, 14, 8, 6);
  b.c(0x5f7f6a);
  b.lathe(lod === 2 ? [0.72, 0, 0.74, 1.1, 0.45, 1.6, 0, 1.68] : [0.7, 0, 0.74, 0.1, 0.74, 1.1, 0.66, 1.4, 0.45, 1.6, 0.18, 1.68, 0, 1.68], seg);
  if (lod === 2) return;
  b.c(0xe8e8e0).cyl(0, 0.72, 0, 0.746, 0.746, 0.22, seg, 0);
  if (lod === 0) {
    for (const a of [0.5, -0.9, 2.6]) {
      b.push().rotY(a).move(0, 1.2, 0.735).rotX(PI / 2 - 0.12);
      b.c(0x2a2a2a).disc(0, 0, 0, 0.14, 10, true).c(0x0c0c0c).disc(0, 0.004, 0, 0.11, 10, true).pop();
    }
    b.c(C.ACIER_SOMBRE).tube([-0.08, 1.66, 0, -0.08, 1.78, 0, 0.08, 1.78, 0, 0.08, 1.66, 0], 0.012, 4, 0, 0, 1);
  }
  b.tagSpot(0, 0.4, 0.747, 0.7, 0.4);
  b.push().rotY(2.4).tagSpot(0, 0.42, 0.747, 0.7, 0.4).pop();
};

/** Horloge publique sur colonne de fonte, deux cadrans éclairés. */
export const horloge: ModelFn = (b, lod) => {
  const seg = S(lod, 8, 6, 4);
  b.c(C.VERT_PARIS).gloss(0.15);
  if (lod === 2) b.cyl(0, 0, 0, 0.1, 0.05, 3.3, 3, 0);
  else b.lathe([0.16, 0, 0.16, 0.1, 0.11, 0.2, 0.1, 0.9, 0.08, 1.0], seg).cyl(0, 1.0, 0, 0.07, 0.05, 2.3, seg, 0).box(0, 3.26, 0, 0.12, 0.1, 0.12);
  b.push().move(0, 3.6, 0).rotX(PI / 2).cyl(0, -0.13, 0, 0.38, 0.38, 0.26, S(lod, 16, 10, 6), 0).pop();
  if (lod < 2) b.lathe([0.05, 3.97, 0.07, 4.0, 0.02, 4.04, 0, 4.05], 6);
  b.gloss(0);
  b.part(P_PANE).c(0xffffff).tex('cadran').emit(FX_NIGHT, 0.75).quadZ(0, 3.6, 0.131, 0.76, 0.76).quadNZ(0, 3.6, -0.131, 0.76, 0.76);
  b.part(P_SHARD).emit(0).c(0x2a2c2e).quadZ(0, 3.6, 0.131, 0.76, 0.76).quadNZ(0, 3.6, -0.131, 0.76, 0.76);
  b.part(P_BODY).tex('');
};

/** Caméra de vidéoprotection sur mât. */
export const camera: ModelFn = (b, lod) => {
  b.c(0x8d9299).cyl(0, 0, 0, 0.06, 0.045, 4.9, S(lod, 8, 5, 3), 1);
  if (lod === 2) {
    b.c(0xe6e8ea).box(0, 4.6, 0.3, 0.2, 0.22, 0.4);
    return;
  }
  b.bar(0, 4.74, 0, 0, 4.86, 0.45, 0.025, 4);
  b.c(0xe6e8ea).cyl(0, 4.62, 0.45, 0.11, 0.11, 0.2, S(lod, 8, 6, 4), 3);
  b.part(P_PANE).c(0x15181c).gloss(0.8).lathe([0, 4.49, 0.05, 4.5, 0.09, 4.56, 0.1, 4.62], S(lod, 8, 6, 4), 0, 0.45);
  b.part(P_SHARD).gloss(0).c(0x1a1a1a).bar(0, 4.62, 0.45, 0.05, 4.36, 0.5, 0.008, 3);
  b.part(P_BODY).gloss(0);
};

/** Objet de voirie générique (type inconnu de la carte) : borne à chapeau. */
export const autre: ModelFn = (b, lod) => {
  b.c(0x6f767c).box(0, 0.45, 0, 0.36, 0.9, 0.36, NO_BOTTOM);
  if (lod < 2) b.c(0x565c62).taper(0, 0.9, 0, 0.4, 0.4, 0.3, 0.3, 0.1, NO_BOTTOM);
};
