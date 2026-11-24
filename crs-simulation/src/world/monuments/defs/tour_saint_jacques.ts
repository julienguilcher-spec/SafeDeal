/* Tour Saint-Jacques (1509-1523) : clocher gothique flamboyant de l'ancienne église Saint-Jacques-de-la-Boucherie,
 * isolé au milieu de son square depuis 1797. 54 m au sommet de la statue de saint Jacques (plate-forme vers 50 m) ;
 * fût carré d'une dizaine de mètres épaulé de contreforts d'angle chargés de niches et de pinacles ; base ouverte
 * par quatre arcades (statue de Blaise Pascal sous la voûte) ; étage de hautes baies aveugles à remplage, étage du
 * beffroi à abat-son, balustrade ajourée, tourelle d'escalier d'angle portant le saint, et aux trois autres angles
 * les symboles des évangélistes (lion, taureau, aigle). Emprise réelle du socle : 13,3 × 12,3 m. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, archBlock, birdGeo, box, corniceProfile, cyl, farMaterial, figureGeo, finishFar, lionGeo, pedestal, pose, steppedBase, sweep,
} from '../kit';
import { ribbonUv, siteAlign, slabXY } from '../kit/x-edifices';
import { AJOUR_RAIL, gothicAtlas, openworkMaterial, rowWall } from '../kit/x-gothique-peint';
import { buttress, pinnacle, turret } from '../kit/x-gothique';
import { rectRing } from '../shape2d';
import { BOX, EMPRISE, TSJ } from '../collide/tour_saint_jacques';

export const TOWER = {
  /** Demi-côté du fût ; niveaux : dessus des arcades, dessus des baies aveugles, dessus du beffroi (plate-forme). */
  HALF: TSJ.half, L1: 11.5, L2: 30.5, L3: 48.5,
  /** Sommet de la statue de saint Jacques. */
  TOP: 54,
} as const;

const TINT = 0xddd3bb;
const STONE = 'pierre_claire', DARK = 'ombre';
const AJOUR = openworkMaterial('gothique_ajour_clair', 0xe9dfc6);
const ATLAS = gothicAtlas('tsj_baies', TINT, [
  { id: 'aveugle', kind: 'baie', w: 9.6, h: 19, cornice: true, win: { w: 2.9, h: 13.6, sill: 1.6, lancets: 2, rose: true, gable: true, glass: 'clair', count: 2 } },
  { id: 'arcature', kind: 'mur', w: 9.6, h: 3.4, count: 8, cornice: true },
], 17);

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { HALF, L1, L2, L3 } = TOWER, W = 2 * HALF;
  b.push(siteAlign(site, EMPRISE, BOX));
  const stone = new Geo(), walls = new Geo(), dark = new Geo();
  // ── socle bas à emmarchement ──
  steppedBase(b, rectRing(0, 0, 13.0, 12.0), 2, 0.35, 0.18, STONE);
  for (let k = 0; k < 4; k++) {
    const rot = (k * Math.PI) / 2;
    // base ouverte : une grande arcade brisée par face
    b.with(pose(0, 0.36, 0, rot), () => b.with(pose(0, 0, HALF - 0.75), () => archBlock(b, {
      width: W, height: L1 - 0.36, depth: 1.5, seg: lod > 0 ? 12 : 8, left: false, right: false, top: false, mat: STONE,
      openings: [{ x: 0, width: 5.4, height: TSJ.vault, kind: 'ogive' }],
    })));
    // baies aveugles à remplage, arcature, puis beffroi à deux baies d'abat-son
    walls.append(rowWall(ATLAS, 'aveugle', -HALF, HALF, HALF, HALF, L1, L2, { bays: 1 }).rotateY(rot));
    walls.append(rowWall(ATLAS, 'arcature', -HALF, HALF, HALF, HALF, L2, L2 + 3.2, { bays: 1 }).rotateY(rot));
    b.with(pose(0, L2 + 3.2, 0, rot), () => b.with(pose(0, 0, HALF - 0.5), () => archBlock(b, {
      width: W, height: L3 - L2 - 3.2, depth: 1, seg: lod > 0 ? 10 : 6, back: false, left: false, right: false, top: false, mat: STONE,
      openings: [{ x: -2.15, width: 2.5, height: 12.6, sill: 1, kind: 'ogive' }, { x: 2.15, width: 2.5, height: 12.6, sill: 1, kind: 'ogive' }],
    })));
    if (lod > 0) for (const ox of [-2.15, 2.15]) for (let q = 0; q < 6; q++) stone.append(box(2.5, 0.09, 0.7, { bottom: true }).rotateX(0.6).translate(ox, L2 + 5.4 + q * 1.75, HALF - 0.7).rotateY(rot));
    // gâbles en accolade et fleurons au-dessus des baies du beffroi et des baies aveugles
    for (const ox of [-2.15, 2.15]) {
      stone.append(slabXY([-1.7, 0, 1.7, 0, 0, 3.6], 0.25, { back: false }).translate(ox, L2 + 3.2 + 12.2, HALF + 0.18).rotateY(rot));
      stone.append(pinnacle(0.45, 2.2, 0).translate(ox, L2 + 3.2 + 15.4, HALF + 0.2).rotateY(rot));
    }
    stone.append(pinnacle(0.7, 4.6, lod).translate(0, L2 + 3.6, HALF + 0.3).rotateY(rot));
    stone.append(box(0.7, L2 - L1, 0.45, { top: false }).translate(0, L1, HALF + 0.2).rotateY(rot));
    // contreforts d'angle (deux par angle) à quatre ressauts, niches à statue sur deux niveaux, pinacles en applique
    for (const sx of [-1, 1]) {
      const bx = sx * (HALF - 0.85);
      const g = buttress(1.7, 1.9, L3 - 2.2, 4, 0.4).translate(bx, 0, HALF);
      g.append(pinnacle(0.95, 6.2, lod).translate(bx, L3 - 2.6, HALF + 0.45));
      // un pinacle sur le glacis de chaque ressaut (le contrefort a 5 assises de hauteur égale, saillie décroissante)
      const bh = L3 - 2.2;
      for (let k = 1; k <= 4; k++) g.append(pinnacle(0.55, 3.4, 0).translate(bx, (k / 5) * bh - 0.45, HALF + 1.9 * (1 - 0.6 * (k / 5)) + 0.22));
      if (lod > 0) {
        for (const [fy, fz] of [[13.6, 1.75], [25.4, 1.35]] as const) {
          g.append(box(1.2, 0.3, 0.75, { bottom: true }).translate(bx, fy, HALF + fz));
          g.append(figureGeo({ height: 2.5, lod: 0, robe: true }).body.translate(bx, fy + 0.3, HALF + fz + 0.05));
          g.append(slabXY([-0.75, 0, 0.75, 0, 0, 1.5], 0.7, { back: false }).translate(bx, fy + 3.1, HALF + fz));
        }
      }
      stone.append(g.rotateY(rot));
    }
  }
  // voûte de la base (vue de dessous), planchers et noyau sombre du beffroi
  stone.append(box(W - 2.9, 0.5, W - 2.9, { bottom: true }).translate(0, TSJ.vault + 1.6, 0));
  dark.append(box(W - 1.9, L3 - L2 - 3.4, W - 1.9, { top: false }).translate(0, L2 + 3.2, 0));
  const ring = rectRing(0, 0, W, W);
  stone.append(sweep(corniceProfile(L1 - 0.5, 0.5, 0.4), ring, { closed: true }));
  stone.append(sweep(corniceProfile(L3 - 0.8, 0.8, 0.7), rectRing(0, 0, W + 0.2, W + 0.2), { closed: true }));
  stone.append(box(W, 0.3, W, { bottom: false }).translate(0, L3 - 0.3, 0));
  b.add(AJOUR, ribbonUv(rectRing(0, 0, W + 1.0, W + 1.0), L3, L3 + 1.25, true, 1.05, AJOUR_RAIL[0], AJOUR_RAIL[1]));
  for (let k = 0; k < 4; k++) stone.append(pinnacle(0.55, 3.0, 0).translate(0, L3, HALF + 0.5).rotateY((k * Math.PI) / 2));
  // ── couronnement : tourelle d'escalier et saint Jacques au nord-ouest, symboles des évangélistes aux autres angles ──
  const c = HALF - 0.9;
  stone.append(turret(1.25, L3 + 2.0, 0.01, 8).translate(-c, 0, -c));
  stone.append(figureGeo({ height: TOWER.TOP - L3 - 2.4, lod, robe: true, hat: 'bicorne', armR: { e: 0.5, a: 0.3 }, itemR: 'lance' }).body.rotateY(Math.PI).translate(-c, L3 + 2.4, -c));
  stone.append(box(1.3, 1.5, 1.3).translate(c, L3, c)).append(lionGeo('couche', 1.3, lod).translate(c, L3 + 1.5, c - 0.2));
  stone.append(box(1.3, 1.5, 1.3).translate(-c, L3, c)).append(lionGeo('debout', 1.1, lod).translate(-c, L3 + 1.5, c - 0.2));
  stone.append(box(1.3, 1.5, 1.3).translate(c, L3, -c)).append(birdGeo('aigle', 2.2).rotateY(Math.PI).translate(c, L3 + 1.5, -c));
  b.add(STONE, stone); b.add(ATLAS.key, walls); b.add(DARK, dark);
  // ── statue de Blaise Pascal sous la voûte (marbre blanc) ──
  pedestal(b, { width: 1.5, depth: 1.5, height: 1.9, mat: 'marbre_blanc' });
  b.add('marbre_blanc', figureGeo({ height: 2.4, lod, robe: true, armL: { e: 0.6, a: 0.5, e2: 1.3, a2: 0.2 } }).body.translate(0, 1.9, 0));
  b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'tour_saint_jacques',
  name: 'Tour Saint-Jacques',
  radius: 10,
  height: TOWER.TOP,
  build(site, quality) { return build(site, quality).build('tour_saint_jacques'); },
  buildFar(site) {
    const b = new Builder();
    const { HALF, L1, L3 } = TOWER, stone = farMaterial(0xddd3bb), dark = farMaterial(0x4a463c, 0.2);
    b.push(siteAlign(site, EMPRISE, BOX));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(stone, box(3.2, L3, 3.2, { top: false }).translate(sx * (HALF - 0.1), 0, sz * (HALF - 0.1)));
    b.add(dark, box(2 * HALF - 3, 8.4, 2 * HALF - 3, { top: false }).translate(0, 0, 0));
    b.add(stone, box(2 * HALF, L3 - L1 + 3, 2 * HALF, { bottom: true }).translate(0, L1 - 3, 0));
    for (let k = 0; k < 4; k++) b.add(dark, box(5.6, 11, 0.2, { bottom: true }).translate(0, 35.5, HALF + 0.05).rotateY((k * Math.PI) / 2));
    b.add(stone, cyl(1.3, 0.3, TOWER.TOP - L3, 6, { flat: true }).translate(-HALF + 0.9, L3, -HALF + 0.9));
    b.pop();
    return finishFar(b, 'tour_saint_jacques');
  },
};
