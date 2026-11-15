/* Colonne Vendôme (1810) : 44,3 m, fût de 3,6 m de diamètre moyen revêtu de 425 plaques de bronze formant une
 * frise en spirale de 280 m (22 révolutions), piédestal à trophées et aigles, statue de Napoléon en César au sommet. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef } from '../types';
import {
  Builder, Geo, birdGeo, box, canvas2d, css, cyl, defineMaterial, farMaterial, figure, finishFar, hemisphere, ironFence, lathe, litMaterial,
  paintBumpBase, paintFigures, paintMatter, pedestal, pose, ribbon, steppedBase, texFrom,
} from '../kit';
import { rectRing } from '../shape2d';

const TURNS = 22, STEPS_H = 0.5, PED_H = 6.6, BASE_H = 1.2, SHAFT_H = 26.3, CAP_H = 1.9, LANTERN_H = 3.6, STATUE_H = 3.95;
const R0 = 1.86, R1 = 1.68;

/** Frise hélicoïdale : un tour par motif ; la bande de personnages est cisaillée d'un pas sur la largeur. */
defineMaterial('vendome_spirale', () => {
  const W = 1024, H = 128;
  const cv = canvas2d(W, H), bp = canvas2d(W, H);
  if (!cv || !bp) return litMaterial('vendome_spirale', { color: 0x4c4a38, roughness: 0.5, metalness: 0.35, night: 0.9 });
  paintMatter(cv, 0x454c3a, 0.1, 8, 31, 0.04, 0x4f6e5c, 0.5);
  paintBumpBase(bp, 80, 8, 16, 32);
  paintFigures(cv, bp, 0, 8, W, H - 16, 46, 33, css(0x6f7256, 0.95), css(0x1c1a12, 0.6));
  for (const [c, fill] of [[cv, css(0x767a5c)], [bp, '#ffffff']] as const) { c.g.fillStyle = fill; c.g.fillRect(0, 0, W, 7); }
  cv.g.fillStyle = 'rgba(0,0,0,0.5)'; cv.g.fillRect(0, 7, W, 2);
  for (const c of [cv, bp]) {
    const src = c.g.getImageData(0, 0, W, H), dst = c.g.createImageData(W, H);
    for (let x = 0; x < W; x++) {
      const shift = Math.round((x / W) * H);
      for (let y = 0; y < H; y++) {
        const sy = (y + shift) % H, i = (y * W + x) * 4, j = (sy * W + x) * 4;
        dst.data[i] = src.data[j]; dst.data[i + 1] = src.data[j + 1]; dst.data[i + 2] = src.data[j + 2]; dst.data[i + 3] = 255;
      }
    }
    c.g.putImageData(dst, 0, 0);
  }
  return litMaterial('vendome_spirale', { color: 0xffffff, roughness: 0.5, metalness: 0.35, night: 0.9, bumpScale: 3 }, { map: texFrom(cv), bump: texFrom(bp, { srgb: false }) });
});

function build(quality: QualityLevel) {
  const b = new Builder();
  const lod = quality === 'bas' ? 0 : 1, seg = quality === 'bas' ? 16 : 28;
  steppedBase(b, rectRing(0, 0, 7.6, 7.6), 2, 0.55, STEPS_H / 2, 'granit_gris');
  b.push(pose(0, STEPS_H, 0));
  // piédestal : bas-reliefs de trophées d'armes, corniche, aigles aux angles
  pedestal(b, { width: 5.7, depth: 5.7, height: PED_H, mat: 'bronze', matDie: 'relief_bronze', projection: 0.45, baseH: 1.2, capH: 1.0 });
  const eagles = new Geo();
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    eagles.append(birdGeo('aigle', 1.75), pose(Math.sin(a) * 3.55, PED_H, Math.cos(a) * 3.55, a));
  }
  b.add('bronze', eagles);
  // base : tore de laurier
  let y = PED_H;
  b.add('bronze', lathe([2.75, y, 2.75, y + 0.3, 2.45, y + 0.35, 2.6, y + 0.55, 2.6, y + 0.8, 2.2, y + 0.95, R0, y + BASE_H], seg));
  y += BASE_H;
  // fût à spirale de bas-reliefs
  b.add('vendome_spirale', cyl(R0, R1, SHAFT_H, seg, { top: false, uvFit: true }).scaleUv(1, TURNS).translate(0, y, 0));
  y += SHAFT_H;
  // chapiteau dorique, tailloir et garde-corps de la plateforme
  b.add('bronze', lathe([R1, y, R1 + 0.12, y + 0.1, R1 + 0.12, y + 0.3, R1, y + 0.38, R1 + 0.05, y + 0.6, 2.45, y + 1.1, 2.45, y + 1.2], seg));
  b.add('bronze', box(5.2, CAP_H - 1.2, 5.2, { bottom: true }).translate(0, y + 1.2, 0));
  y += CAP_H;
  b.add('grille', ribbon(rectRing(0, 0, 4.9, 4.9), y, y + 1.05, true, 1));
  // lanternon, calotte, statue de Napoléon en César (laurier, glaive, globe à la Victoire)
  b.add('bronze', cyl(1.3, 1.25, LANTERN_H - 1.0, 14, { top: false }).translate(0, y, 0));
  b.add('bronze', hemisphere(1.3, 14, 4, 0.75).translate(0, y + LANTERN_H - 1.0, 0));
  y += LANTERN_H - 0.05;
  b.with(pose(0, y, 0), () => figure(b, 'bronze', {
    height: STATUE_H, lod, robe: true, hat: 'couronne', armR: { e: 0.55, a: 0.5, e2: 0.9, a2: 0.2 }, armL: { e: 1.0, a: 0.6, e2: 1.7, a2: 0.2 }, itemR: 'epee', itemL: 'globe', itemScale: 0.7,
  }));
  b.pop();
  ironFence(b, rectRing(0, 0, 10.4, 10.4), { height: 1.5, closed: true, mat: 'grille' });
  return b.build('colonne_vendome');
}

export const def: MonumentDef = {
  key: 'colonne_vendome',
  name: 'Colonne Vendôme',
  radius: 7.5,
  height: 44.3,
  build(_site, quality) { return build(quality); },
  buildFar() {
    const b = new Builder();
    const bronze = farMaterial(0x4f4b39, 0.9);
    b.add(bronze, box(5.9, PED_H + STEPS_H + 0.6, 5.9));
    b.add(bronze, cyl(R0, R1, SHAFT_H + BASE_H, 8, { top: false }).translate(0, PED_H + STEPS_H, 0));
    b.add(bronze, box(5.0, 0.9, 5.0, { bottom: true }).translate(0, PED_H + STEPS_H + BASE_H + SHAFT_H + 0.9, 0));
    b.add(bronze, cyl(1.3, 0.9, LANTERN_H, 6, { top: false }).translate(0, 36.5, 0));
    b.add(bronze, cyl(0.75, 0.45, STATUE_H, 5).translate(0, 40.1, 0));
    return finishFar(b, 'colonne_vendome');
  },
};
