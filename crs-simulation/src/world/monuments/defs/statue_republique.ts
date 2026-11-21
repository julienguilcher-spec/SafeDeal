/* Monument à la République, place de la République (frères Morice, 1883) : 25 m.
 * Marianne de bronze de 9,5 m (bonnet phrygien, rameau d'olivier levé, main gauche sur la tablette des Droits de
 * l'Homme) sur un piédestal de pierre de 15,5 m ; soubassement circulaire d'environ 13 m ceint de douze
 * hauts-reliefs de bronze ; statues assises de pierre : la Liberté (flambeau) à senestre, l'Égalité (drapeau)
 * à dextre, la Fraternité (avec deux enfants) au dos ; lion de bronze de 3 m gardant l'urne du suffrage universel. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef } from '../types';
import {
  Builder, Geo, box, cyl, farMaterial, figure, figureGeo, finishFar, lathe, lionGeo, pedestalRound, pose, steppedBaseRound,
} from '../kit';

const STEPS_H = 0.6, DRUM_H = 3.6, PIER_H = 15.5 - STEPS_H - DRUM_H;
/** La statue mesure 9,5 m rameau compris : le corps fait environ 8 m. */
const MARIANNE_H = 9.5, BODY_H = 8.0;
const STONE = 'pierre_lisse_claire', BRONZE = 'bronze';

function build(quality: QualityLevel) {
  const b = new Builder();
  const lod = quality === 'bas' ? 0 : 1, seg = quality === 'bas' ? 20 : 36;
  steppedBaseRound(b, 5.6, 3, 0.45, STEPS_H / 3, 'granit_gris', seg);
  // soubassement circulaire et ceinture de douze hauts-reliefs de bronze (dates de la République)
  b.push(pose(0, STEPS_H, 0));
  pedestalRound(b, 5.0, DRUM_H, STONE, seg, 0.35, 0.8, 0.7);
  b.add('relief_bronze', cyl(5.06, 5.06, 2.0, seg, { top: false }).translate(0, 0.85, 0));
  const posts = new Geo();
  for (let i = 0; i < 12; i++) { const a = ((i + 0.5) / 12) * Math.PI * 2; posts.append(box(0.5, 2.1, 0.3).translate(0, 0.8, 5.0), pose(0, 0, 0, a)); }
  b.add(STONE, posts);
  // fût du piédestal : corps cylindrique mouluré, guirlande et corniche
  const y0 = DRUM_H;
  b.add(STONE, lathe([
    3.6, y0, 3.6, y0 + 0.5, 3.1, y0 + 0.9, 2.75, y0 + 1.2, 2.6, y0 + 4.2, 2.75, y0 + 4.4, 2.75, y0 + 4.9, 2.45, y0 + 5.1, 2.3, y0 + PIER_H - 1.5,
    2.6, y0 + PIER_H - 1.25, 2.6, y0 + PIER_H - 0.95, 2.95, y0 + PIER_H - 0.6, 2.95, y0 + PIER_H, 0, y0 + PIER_H,
  ], seg));
  b.add(BRONZE, lathe([2.47, y0 + 6.2, 2.62, y0 + 6.35, 2.47, y0 + 6.5], seg));
  // trois statues assises sur des consoles : Liberté, Égalité, Fraternité
  const seats: { a: number; item: 'torche' | 'drapeau' | 'rameau'; kids: boolean }[] = [
    { a: Math.PI / 3, item: 'torche', kids: false }, { a: -Math.PI / 3, item: 'drapeau', kids: false }, { a: Math.PI, item: 'rameau', kids: true },
  ];
  const stone = new Geo();
  for (const s of seats) {
    const m = pose(Math.sin(s.a) * 3.55, y0, Math.cos(s.a) * 3.55, s.a);
    stone.append(box(3.0, 1.6, 2.5).translate(0, 0, -0.3), m);
    stone.append(box(2.6, 4.6, 0.7).translate(0, 1.6, -1.05), m);
    const f = figureGeo({
      height: 5.8, lod, seated: true, robe: true, hat: s.kids ? 'aucun' : 'phrygien',
      armL: s.item === 'torche' ? { e: 1.5, a: 0.9, e2: 2.6, a2: 0.6 } : { e: 0.5, a: 0.9, e2: 1.1, a2: 0.2 },
      armR: s.item === 'drapeau' ? { e: 1.2, a: 0.9, e2: 1.9, a2: 0.4 } : { e: 0.55, a: 0.8, e2: 1.2, a2: 0.1 },
      itemL: s.item === 'torche' ? 'torche' : undefined, itemR: s.item === 'drapeau' ? 'drapeau' : s.item === 'rameau' ? 'rameau' : undefined,
    });
    const fm = pose(Math.sin(s.a) * 3.75, y0 + 0.05, Math.cos(s.a) * 3.75, s.a);
    stone.append(f.body, fm).append(f.items, fm);
    if (s.kids) {
      for (const side of [-1, 1]) {
        const k = figureGeo({ height: 2.1, lod: 0, armL: { e: 0.6, a: 0.5 }, armR: { e: 1.3, a: 0.4 } });
        stone.append(k.body, pose(Math.sin(s.a) * 4.2 + Math.cos(s.a) * side * 1.25, y0 + 1.5, Math.cos(s.a) * 4.2 - Math.sin(s.a) * side * 1.25, s.a));
      }
    }
  }
  b.add(STONE, stone);
  b.pop();
  // Marianne
  const yM = STEPS_H + DRUM_H + PIER_H;
  b.with(pose(0, yM, 0), () => {
    figure(b, BRONZE, {
      height: BODY_H, lod, robe: true, hat: 'phrygien', lean: -0.03,
      armR: { e: 2.4, a: 0.45, e2: 2.75, a2: 0.3 }, armL: { e: 0.45, a: 1.35, e2: 0.75, a2: 1.0 }, itemR: 'rameau', itemScale: 0.32,
    });
    // tablette des Droits de l'Homme, posée à sa gauche, et épée au côté
    b.add(BRONZE, box(1.1, 3.0, 0.28, { bottom: true }).rotateY(-0.35).translate(1.5, 0, 0.45));
    b.add(BRONZE, box(0.1, 2.2, 0.1).rotateZ(0.25).translate(-0.9, 2.2, 0.42));
  });
  // lion de bronze gardant l'urne du suffrage universel, devant le soubassement
  b.add(STONE, box(2.6, 1.1, 5.4).translate(0, 0, 7.6));
  b.add(BRONZE, lionGeo('debout', 1.95, lod).translate(-0.25, 1.1, 7.3));
  b.add(BRONZE, lathe([0.3, 1.1, 0.42, 1.2, 0.3, 1.35, 0.62, 1.9, 0.7, 2.4, 0.45, 2.7, 0.5, 2.85, 0, 2.95], 10, { smooth: true }).translate(0.95, 0, 8.9));
  return b.build('statue_republique');
}

export const def: MonumentDef = {
  key: 'statue_republique',
  name: 'Monument à la République',
  radius: 10.5,
  height: 25,
  build(_site, quality) { return build(quality); },
  buildFar() {
    const b = new Builder();
    const stone = farMaterial(0xe3dcc8), bronze = farMaterial(0x4c4030, 0.9);
    b.add(stone, cyl(6.4, 5.2, STEPS_H + DRUM_H, 12, { flat: true }));
    b.add(stone, cyl(3.4, 2.4, PIER_H, 10, { flat: true }).translate(0, STEPS_H + DRUM_H, 0));
    for (const a of [Math.PI / 3, -Math.PI / 3, Math.PI]) b.add(stone, box(2.6, 5.6, 2.4).rotateY(a).translate(Math.sin(a) * 3.6, STEPS_H + DRUM_H, Math.cos(a) * 3.6));
    b.add(bronze, cyl(1.3, 0.75, BODY_H * 0.86, 6, { top: false }).translate(0, 15.5, 0));
    b.add(bronze, cyl(0.5, 0.5, BODY_H * 0.14, 5).translate(0, 15.5 + BODY_H * 0.86, 0));
    b.add(bronze, box(0.5, MARIANNE_H - BODY_H * 0.72, 0.5, { bottom: true }).translate(-0.95, 15.5 + BODY_H * 0.72, 0.2));
    b.add(bronze, box(1.4, 2.6, 3.2).translate(0, 1.1, 7.3));
    return finishFar(b, 'statue_republique');
  },
};
