/* Obélisque de Louxor, place de la Concorde.
 * Monolithe de granit rose de 23 m (≈ 2,4 m de côté à la base, 1,5 m au sommet), pyramidion doré de
 * 3,6 m (1998), piédestal de granit de Bretagne à schémas dorés ; sommet à 33,4 m. Grille à piques dorées. */
import type { MonumentDef } from '../types';
import {
  Builder, box, canvas2d, css, defineMaterial, finishFar, farMaterial, frustum, ironFence, litMaterial, paintMatter, pedestal, pose,
  quadFit, rngOf, steppedBase, texFrom,
} from '../kit';
import { rectRing } from '../shape2d';

/** Faces du piédestal : schémas dorés du transport et de l'érection (moitié gauche), dédicace (moitié droite). */
defineMaterial('obelisque_schemas', () => {
  const cv = canvas2d(512, 256);
  if (!cv) return litMaterial('obelisque_schemas', { color: 0xb88a7c, roughness: 0.6, night: 0.9 });
  paintMatter(cv, 0xb88a7c, 0.08, 6, 12, 0.05, 0x7d5a52, 0.5);
  const g = cv.g, rnd = rngOf(5), gold = css(0xe2b53c, 0.95);
  g.strokeStyle = gold; g.fillStyle = gold; g.lineWidth = 2;
  // schéma : rampe, obélisque incliné, chevalets, cabestans et haubans
  g.beginPath(); g.moveTo(14, 214); g.lineTo(242, 214); g.moveTo(30, 214); g.lineTo(150, 150); g.lineTo(150, 214); g.stroke();
  g.save(); g.translate(96, 176); g.rotate(-0.5); g.strokeRect(-70, -7, 140, 14); g.restore();
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(160 + i * 16, 214); g.lineTo(176 + i * 9, 60 + i * 6); g.stroke(); }
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(34 + i * 22, 226, 5, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(34 + i * 22, 221); g.lineTo(176, 60); g.stroke(); }
  g.lineWidth = 1.4;
  for (let i = 0; i < 6; i++) g.fillRect(24 + i * 34, 34 + (i % 2) * 10, 22, 3);
  // dédicace : lignes de capitales
  for (let r = 0; r < 9; r++) {
    let x = 288 + rnd() * 16;
    const end = 488 - rnd() * 16;
    while (x < end) { const w = 4 + rnd() * 7; if (rnd() < 0.88) g.fillRect(x, 40 + r * 21, w, 9); x += w + 3 + (rnd() < 0.16 ? 9 : 0); }
  }
  g.lineWidth = 2; g.strokeRect(8, 8, 240, 240); g.strokeRect(264, 8, 240, 240);
  return litMaterial('obelisque_schemas', { color: 0xffffff, roughness: 0.6, night: 0.9 }, { map: texFrom(cv, { clamp: true }), bump: null });
});

const PEDESTAL_H = 6.2, SHAFT_H = 23, PYRAMIDION_H = 3.6, BASE_W = 2.42, TOP_W = 1.54;

export const def: MonumentDef = {
  key: 'obelisque_concorde',
  name: 'Obélisque de Louxor',
  radius: 8,
  height: 33.4,
  build() {
    const b = new Builder();
    // emmarchement et piédestal
    const y0 = steppedBase(b, rectRing(0, 0, 6.2, 6.2), 2, 0.6, 0.28, 'granit_gris');
    b.push(pose(0, y0, 0));
    pedestal(b, { width: 3.9, depth: 3.9, height: PEDESTAL_H, mat: 'granit_rose', projection: 0.42, baseH: 1.3, capH: 0.9 });
    // schémas dorés du transport et de l'érection sur deux faces, inscriptions sur les deux autres
    for (let i = 0; i < 4; i++) {
      const g = quadFit(-1.5, 1.7, 1.96, 1.5, 1.7, 1.96, 1.5, PEDESTAL_H - 1.3, 1.96, -1.5, PEDESTAL_H - 1.3, 1.96, i % 2 === 0 ? 0 : 0.5, 0, i % 2 === 0 ? 0.5 : 1, 1);
      b.add('obelisque_schemas', g.rotateY((i * Math.PI) / 2));
    }
    // monolithe : quatre faces à hiéroglyphes (UV 0..1 par face)
    const yS = PEDESTAL_H + 0.25;
    b.add('granit_rose', box(BASE_W + 0.5, 0.25, BASE_W + 0.5).translate(0, PEDESTAL_H, 0));
    const hb = BASE_W / 2, ht = TOP_W / 2;
    for (let i = 0; i < 4; i++) {
      b.add('hieroglyphes', quadFit(-hb, yS, hb, hb, yS, hb, ht, yS + SHAFT_H, ht, -ht, yS + SHAFT_H, ht).rotateY((i * Math.PI) / 2));
    }
    // pyramidion doré
    b.add('or', frustum(TOP_W, TOP_W, 0.02, 0.02, PYRAMIDION_H, { top: false }).translate(0, yS + SHAFT_H, 0));
    b.pop();
    // grille basse à piques dorées
    ironFence(b, rectRing(0, 0, 9.6, 9.6), { height: 1.25, closed: true, mat: 'grille_doree' });
    return b.build('obelisque_concorde');
  },
  buildFar() {
    const b = new Builder();
    const stone = farMaterial(0xb48878);
    b.add(stone, box(3.9, PEDESTAL_H + 0.5, 3.9));
    b.add(stone, frustum(BASE_W, BASE_W, TOP_W, TOP_W, SHAFT_H, { top: false }).translate(0, PEDESTAL_H + 0.5, 0));
    b.add(farMaterial(0xd8ab33, 1.2), frustum(TOP_W, TOP_W, 0.02, 0.02, PYRAMIDION_H, { top: false }).translate(0, PEDESTAL_H + 0.5 + SHAFT_H, 0));
    return finishFar(b, 'obelisque_concorde');
  },
};
