/* Porte Saint-Denis (François Blondel, 1672) : arc de triomphe de Louis XIV sur les Grands Boulevards, au débouché
 * de la rue Saint-Denis. 24,65 m de haut, 25 m de large, 5 m d'épaisseur ; arche unique de 8 m sur 15,35 m ; deux
 * petites portes piétonnes dans les piédestaux ; sur chaque face, deux obélisques en applique chargés de trophées,
 * avec des figures assises à leur pied (la Hollande vaincue, le Rhin) ; bas-relief au-dessus de l'arche (passage du
 * Rhin au sud, prise de Maastricht au nord) ; frise à l'inscription de bronze doré LUDOVICO MAGNO.
 * Repère SUPPLÉMENTAIRE du système (extra.ts) : absent de landmarks.json. Façade sud (côté ville) vers +z. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef } from '../types';
import {
  Builder, Geo, archBlock, archivolt, band, box, entablature, farMaterial, figureGeo, finishFar, plinth, quadFit, reliefPanel, sculptedGroup, pose,
} from '../kit';
import { appliedObelisk, inscriptionPlate } from '../kit/x-ponts-portes';
import { PSD } from '../collide/porte_saint_denis';
import { rectRing } from '../shape2d';

inscriptionPlate('porte_ludovico', 'LUDOVICO MAGNO', 13.5 / 1.25);
const WALL = 'pierre_blonde', TRIM = 'pierre_lisse';

function build(quality: QualityLevel) {
  const b = new Builder();
  const { W, H, D, archW, archH, doorX, doorW, doorH, entabY, entabTop } = PSD;
  const hd = D / 2, lod = quality === 'bas' ? 0 : 1, seg = quality === 'bas' ? 10 : 18;
  archBlock(b, {
    width: W, height: entabTop, depth: D, seg, top: false, mat: WALL, matVault: 'caissons', coffers: { around: 13, across: 3 },
    openings: [{ x: 0, width: archW, height: archH }, { x: -doorX, width: doorW, height: doorH }, { x: doorX, width: doorW, height: doorH }],
  });
  const outer = rectRing(0, 0, W, D);
  // socle, cordon des piédestaux, imposte, entablement, attique
  for (const s of [-1, 1]) plinth(b, rectRing(s * (archW / 2 + (W - archW) / 4), 0, (W - archW) / 2, D), 0, 1.1, 0.3, { mat: TRIM, closed: true });
  for (const s of [-1, 1]) band(b, rectRing(s * (archW / 2 + (W - archW) / 4), 0, (W - archW) / 2, D), 6.2, 0.55, 0.28, { mat: TRIM, closed: true });
  entablature(b, outer, entabY, entabTop - entabY, 1.0, { mat: TRIM, closed: true });
  b.add(WALL, box(W - 0.7, H - entabTop - 0.7, D - 0.5, { top: false }).translate(0, entabTop, 0));
  entablature(b, rectRing(0, 0, W - 0.7, D - 0.5), H - 0.9, 0.9, 0.5, { mat: TRIM, closed: true, corniceOnly: true });
  b.add(TRIM, box(W - 0.7, 0.05, D - 0.5).translate(0, H - 0.05, 0));
  const trim = new Geo(), relief = new Geo(), stone = new Geo();
  const arch = archivolt({ x: 0, width: archW, height: archH }, 0.85, 0.22, seg);
  trim.append(arch.clone().translate(0, 0, hd)).append(arch.clone().rotateY(Math.PI).translate(0, 0, -hd));
  for (const t of [-1, 1]) {
    const turn = t > 0 ? 0 : Math.PI;
    // clef, inscription de la frise, bas-relief au-dessus de l'arche
    trim.append(box(1.2, 1.9, 0.6).translate(0, archH - 0.2, hd + 0.05).rotateY(turn));
    const fy = entabY + (entabTop - entabY) * 0.32, fh = (entabTop - entabY) * 0.3;
    b.add('porte_ludovico', quadFit(-6.75, fy, hd + 0.09, 6.75, fy, hd + 0.09, 6.75, fy + fh, hd + 0.09, -6.75, fy + fh, hd + 0.09).rotateY(turn));
    b.with(pose(0, archH + 0.55, t * hd, turn), () => reliefPanel(b, { width: archW + 1.6, height: entabY - archH - 1.0, frame: TRIM, shift: t > 0 ? 0 : 3 }));
    for (const s of [-1, 1]) {
      const x = s * (archW / 2 + (W - archW) / 4);
      // obélisque en applique chargé de trophées, figure assise à son pied, sur le piédestal
      relief.append(appliedObelisk(4.1, entabY - 6.9, 0.75).translate(x, 6.75, hd).rotateY(turn));
      stone.append(box(5.4, 0.5, 1.5).translate(x, 6.75, hd + 0.75).rotateY(turn));
      const f = figureGeo({ height: 3.9, lod, seated: true, robe: s * t > 0, lean: 0.22, armL: { e: 1.0, a: 0.9, e2: 1.7, a2: 0.3 }, armR: { e: 0.5, a: 1.1 }, hat: s * t > 0 ? 'couronne' : 'aucun' });
      stone.append(f.body.translate(x, 7.25, hd + 0.85).rotateY(turn));
    }
  }
  b.add(TRIM, trim); b.add('relief_pierre', relief); b.add(TRIM, stone);
  // trophées de bronze au sommet des obélisques : suggérés par un groupe en haut-relief dans chaque tympan de l'attique
  if (quality !== 'bas') for (const t of [-1, 1]) b.with(pose(0, entabTop + 0.2, t * (hd - 0.25), t > 0 ? 0 : Math.PI), () => sculptedGroup(b, TRIM, { width: 9, height: H - entabTop - 1.4, depth: 0.5, seed: 31 + t, count: 4 }));
  return b.build('porte_saint_denis');
}

export const def: MonumentDef = {
  key: 'porte_saint_denis',
  name: 'Porte Saint-Denis',
  radius: 14,
  height: PSD.H,
  build(_site, quality) { return build(quality); },
  buildFar() {
    const b = new Builder();
    const stone = farMaterial(0xdcc9a0), dark = farMaterial(0xc2ad84);
    archBlock(b, { width: PSD.W, height: PSD.entabTop, depth: PSD.D, seg: 6, top: false, mat: stone, matVault: dark, matJamb: dark, openings: [{ x: 0, width: PSD.archW, height: PSD.archH }] });
    b.add(stone, box(PSD.W + 1.6, 1.2, PSD.D + 1.6, { bottom: true }).translate(0, PSD.entabTop - 1.2, 0));
    b.add(stone, box(PSD.W - 0.7, PSD.H - PSD.entabTop, PSD.D - 0.5).translate(0, PSD.entabTop, 0));
    return finishFar(b, 'porte_saint_denis');
  },
};
