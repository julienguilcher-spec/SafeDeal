/* Porte Saint-Martin (Pierre Bullet, 1674) : arc de triomphe de Louis XIV sur les Grands Boulevards, au débouché de
 * la rue Saint-Martin. 18 m de haut et de large ; trois arches (la centrale plus haute) ; calcaire à bossages
 * vermiculés ; quatre bas-reliefs dans les écoinçons (Louis XIV en Hercule, prise de Besançon, de Limbourg, défaite
 * des Allemands) ; entablement à consoles ; attique de marbre portant la dédicace à LUDOVICO MAGNO.
 * Repère SUPPLÉMENTAIRE du système (extra.ts) : absent de landmarks.json. Façade sud (côté ville) vers +z. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef } from '../types';
import { Builder, Geo, archBlock, archivolt, band, box, entablature, farMaterial, finishFar, plinth, quadFit, reliefPanel, pose } from '../kit';
import { inscriptionPlate } from '../kit/x-ponts-portes';
import { PSM } from '../collide/porte_saint_martin';
import { rectRing } from '../shape2d';

inscriptionPlate('porte_martin_dedicace', 'LUDOVICO MAGNO VESONTIONE SEQUANISQUE BIS CAPTIS', 14 / 1.5, 0xe9e6de, 0x5a4a34);
const WALL = 'bossage_blond', TRIM = 'pierre_lisse', ATTIC = 'marbre_blanc';

function build(quality: QualityLevel) {
  const b = new Builder();
  const { W, H, D, midW, midH, sideX, sideW, sideH, entabY, entabTop } = PSM;
  const hd = D / 2, seg = quality === 'bas' ? 10 : 16;
  archBlock(b, {
    width: W, height: entabTop, depth: D, seg, top: false, mat: WALL, matVault: 'pierre_blonde', matJamb: 'pierre_blonde',
    openings: [{ x: 0, width: midW, height: midH }, { x: -sideX, width: sideW, height: sideH }, { x: sideX, width: sideW, height: sideH }],
  });
  const outer = rectRing(0, 0, W, D);
  // socle des quatre piles, imposte, entablement à consoles, attique de marbre
  const piers: [number, number][] = [];
  for (const s of [-1, 1]) {
    piers.push([s * (midW / 2 + (sideX - sideW / 2 - midW / 2) / 2), sideX - sideW / 2 - midW / 2]);
    piers.push([s * (sideX + sideW / 2 + (W / 2 - sideX - sideW / 2) / 2), W / 2 - sideX - sideW / 2]);
  }
  for (const [x, w] of piers) plinth(b, rectRing(x, 0, w, D), 0, 0.9, 0.22, { mat: TRIM, closed: true });
  band(b, outer, sideH - sideW / 2 - 0.45, 0.45, 0.2, { mat: TRIM, closed: true });
  entablature(b, outer, entabY, entabTop - entabY, 0.95, { mat: TRIM, closed: true });
  const cons = new Geo(), trim = new Geo();
  if (quality !== 'bas') {
    const n = 17;
    for (let i = 0; i < n; i++) for (const t of [-1, 1]) cons.append(box(0.34, 0.5, 0.6).translate(-W / 2 + 0.6 + (i / (n - 1)) * (W - 1.2), entabY + (entabTop - entabY) * 0.38, t * (hd + 0.3)));
  }
  b.add(TRIM, cons);
  b.add(ATTIC, box(W - 0.5, H - entabTop - 0.6, D - 0.4, { top: false }).translate(0, entabTop, 0));
  entablature(b, rectRing(0, 0, W - 0.5, D - 0.4), H - 0.75, 0.75, 0.42, { mat: TRIM, closed: true, corniceOnly: true });
  b.add(TRIM, box(W - 0.5, 0.05, D - 0.4).translate(0, H - 0.05, 0));
  const mid = archivolt({ x: 0, width: midW, height: midH }, 0.7, 0.2, seg);
  trim.append(mid.clone().translate(0, 0, hd)).append(mid.clone().rotateY(Math.PI).translate(0, 0, -hd));
  for (const s of [-1, 1]) {
    const side = archivolt({ x: s * sideX, width: sideW, height: sideH }, 0.5, 0.16, seg);
    trim.append(side.clone().translate(0, 0, hd)).append(side.clone().rotateY(Math.PI).translate(0, 0, -hd));
  }
  for (const t of [-1, 1]) {
    const turn = t > 0 ? 0 : Math.PI;
    trim.append(box(0.9, 1.4, 0.5).translate(0, midH - 0.15, hd + 0.05).rotateY(turn));
    // dédicace sur l'attique, bas-reliefs des écoinçons au-dessus des arches latérales
    const ay = entabTop + 0.95, ah = 1.5;
    b.add('porte_martin_dedicace', quadFit(-7, ay, hd - 0.14, 7, ay, hd - 0.14, 7, ay + ah, hd - 0.14, -7, ay + ah, hd - 0.14).rotateY(turn));
    for (const s of [-1, 1]) b.with(pose(s * (sideX + 0.35), sideH + 0.9, t * hd, turn), () => reliefPanel(b, { width: 5.0, height: entabY - sideH - 1.6, frame: TRIM, shift: (s + 1) * 2 + (t + 1) }));
  }
  b.add(TRIM, trim);
  return b.build('porte_saint_martin');
}

export const def: MonumentDef = {
  key: 'porte_saint_martin',
  name: 'Porte Saint-Martin',
  radius: 11,
  height: PSM.H,
  build(_site, quality) { return build(quality); },
  buildFar() {
    const b = new Builder();
    const stone = farMaterial(0xd6c49c), dark = farMaterial(0xb9a67e), marble = farMaterial(0xe9e6de);
    archBlock(b, {
      width: PSM.W, height: PSM.entabTop, depth: PSM.D, seg: 5, top: false, mat: stone, matVault: dark, matJamb: dark,
      openings: [{ x: 0, width: PSM.midW, height: PSM.midH }, { x: -PSM.sideX, width: PSM.sideW, height: PSM.sideH }, { x: PSM.sideX, width: PSM.sideW, height: PSM.sideH }],
    });
    b.add(stone, box(PSM.W + 1.5, 1.0, PSM.D + 1.5, { bottom: true }).translate(0, PSM.entabTop - 1.0, 0));
    b.add(marble, box(PSM.W - 0.5, PSM.H - PSM.entabTop, PSM.D - 0.4).translate(0, PSM.entabTop, 0));
    return finishFar(b, 'porte_saint_martin');
  },
};
