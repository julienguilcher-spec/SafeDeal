/* Sainte-Chapelle (palais de la Cité, 1241-1248).
 * Cotes réelles : 36 m de long, 17 m de large hors contreforts, 42,5 m au faîtage, flèche de 33,25 m (sommet à
 * 75,75 m). Chapelle basse sous une chapelle haute dont les verrières de 15 m occupent tout l'entre-deux des
 * contreforts ; abside à sept pans ; à l'ouest, porche à deux niveaux, grande rose flamboyante de 9 m, pignon
 * cantonné de deux tourelles d'escalier à flèche ; toit d'ardoise très pentu à crête dorée.
 * Repère local : porche vers +z, abside vers −z. Dessiné sur l'emprise réelle (18,2 × 41,8 m avec contreforts). */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, archBlock, box, boxAt, cyl, farMaterial, figureGeo, finishFar, pose } from '../kit';
import { gableRoof, ribbonUv, siteAlign, wallM } from '../kit/x-edifices';
import { AJOUR_RAIL, gothicAtlas, openworkMaterial, roseMaterial, rowWall } from '../kit/x-gothique-peint';
import { gableWall, gothicApse, gothicNave, openworkSpire, pinnacle, roseWindow, turret, type NaveSpec } from '../kit/x-gothique';
import { BOX, EMPRISE } from '../collide/sainte_chapelle';

export const SC = {
  /** Demi-largeur des murs, mur ouest (rose), front du porche, centre de l'abside. */
  HW: 6.2, ZW: 14.4, ZP: 19.4, ZA: -13.2,
  /** Dessus de la chapelle basse, sommet des murs, faîtage, sommet de la flèche. */
  LOW: 8.8, WALL: 28.5, RIDGE: 42.5, SPIRE: 75.75,
} as const;

const TINT = 0xe2d7bc;
const STONE = 'pierre_blonde', SLATE = 'ardoise', LEAD = 'plomb', GOLD = 'or';
const AJOUR = openworkMaterial('gothique_ajour_blond', 0xe0cfa8);
const ROSE = roseMaterial('gothique_rose_flamboyante', TINT, 16, 9);
const ATLAS = gothicAtlas('sc_baies', TINT, [
  { id: 'basse', kind: 'baie', w: 6.9, h: 8.8, base: true, cornice: true, win: { w: 3.6, h: 4.3, sill: 2.4, lancets: 2, rose: true } },
  { id: 'haute', kind: 'baie', w: 6.9, h: 19.7, cornice: true, win: { w: 4.7, h: 15.4, sill: 0.9, lancets: 4, rose: true, gable: true } },
  { id: 'portail', kind: 'portail', w: 4, h: 6.6 },
  { id: 'arcature', kind: 'mur', w: 6.2, h: 4, count: 5, cornice: true },
], 11);

function spec(lod: 0 | 1): NaveSpec {
  return {
    atlas: ATLAS, stone: STONE, roof: SLATE, ajour: AJOUR, lod,
    tiers: [
      { half: SC.HW + 0.2, y0: 0, y1: SC.LOW, row: 'basse' },
      { half: SC.HW, y0: SC.LOW, y1: SC.WALL, row: 'haute', rail: true },
    ],
    roofRise: SC.RIDGE - SC.WALL,
    pier: { w: 1.1, out: 1.9, inn: 0, h: 27.5, pinnacle: 7.5 },
  };
}

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { HW, ZW, ZP, ZA, LOW, WALL, RIDGE } = SC;
  b.push(siteAlign(site, EMPRISE, BOX));
  const s = spec(lod);
  b.with(pose(0, 0, ZA), () => { gothicNave(b, s, ZW - ZA, 4); gothicApse(b, s, 7); });
  const stone = new Geo(), walls = new Geo(), ajour = new Geo();
  // ── porche à deux niveaux ──
  const pd = ZP - ZW;
  b.with(pose(0, 0, ZW + pd / 2), () => archBlock(b, {
    width: 2 * HW, height: LOW, depth: pd, seg: lod > 0 ? 10 : 6, back: false, mat: STONE,
    openings: [{ x: 0, width: 5.2, height: 7.2, kind: 'ogive' }, { x: -4.6, width: 2.2, height: 5.6, kind: 'ogive' }, { x: 4.6, width: 2.2, height: 5.6, kind: 'ogive' }],
  }));
  walls.append(rowWall(ATLAS, 'portail', -2, ZW + 0.05, 2, ZW + 0.05, 0, 6.6, { bays: 1 }));
  b.with(pose(0, LOW, ZW + pd / 2), () => archBlock(b, {
    width: 2 * HW, height: 9.4, depth: pd, seg: lod > 0 ? 10 : 6, back: false, mat: STONE,
    openings: [{ x: 0, width: 6.4, height: 8.2, kind: 'ogive', sill: 1.2 }],
  }));
  walls.append(rowWall(ATLAS, 'portail', -2, ZW + 0.05, 2, ZW + 0.05, LOW + 1.2, LOW + 7.4, { bays: 1 }));
  ajour.append(ribbonUv([-HW, ZW, -HW, ZP + 0.1, HW, ZP + 0.1, HW, ZW], LOW + 9.4, LOW + 10.5, false, 1.05, AJOUR_RAIL[0], AJOUR_RAIL[1]));
  for (const sx of [-1, 1]) stone.append(pinnacle(0.9, 4.6, lod).translate(sx * (HW - 0.3), LOW + 9.4, ZP - 0.4));
  // ── mur ouest : rose flamboyante, balustrade, pignon à oculus ──
  stone.append(wallM(-HW, ZW, HW, ZW, LOW + 9.4, WALL));
  const rose = roseWindow(4.5, { frame: 0.6, depth: 0.45, seg: lod > 0 ? 36 : 20 });
  b.add(ROSE, rose.glass.translate(0, 23.2, ZW + 0.05));
  stone.append(rose.frame.translate(0, 23.2, ZW + 0.05));
  ajour.append(ribbonUv([-HW, ZW + 0.3, HW, ZW + 0.3], WALL, WALL + 1.15, false, 1.05, AJOUR_RAIL[0], AJOUR_RAIL[1]));
  stone.append(gableWall(2 * HW, 0, RIDGE - WALL + 0.8, 0.7).translate(0, WALL, ZW - 0.35));
  const oc = roseWindow(1.8, { frame: 0.35, depth: 0.3, seg: 20 });
  b.add(ROSE, oc.glass.translate(0, WALL + 4.4, ZW + 0.05));
  stone.append(oc.frame.translate(0, WALL + 4.4, ZW + 0.05));
  stone.append(pinnacle(0.8, 3.6, lod).translate(0, RIDGE + 0.6, ZW - 0.35));
  // tourelles d'escalier à flèche, de part et d'autre du pignon
  for (const sx of [-1, 1]) {
    stone.append(turret(1.55, 37.5, 9.5, 8).translate(sx * (HW + 0.75), 0, ZW + 0.4));
    b.add(GOLD, cyl(1.7, 1.7, 0.35, 8, { flat: true, bottom: true }).translate(sx * (HW + 0.75), 38.2, ZW + 0.4));
  }
  // annexe basse au nord de l'abside (relevée dans l'emprise)
  stone.append(boxAt(-9, 0, -16, -HW, 7, -11));
  // crête dorée du faîtage et ange de l'abside
  b.add(GOLD, box(0.1, 0.75, ZW - ZA - 0.6, { bottom: true }).translate(0, RIDGE - 0.05, (ZW + ZA) / 2));
  if (lod > 0) b.add(GOLD, figureGeo({ height: 2.4, lod: 0, robe: true, wings: 1, armR: { e: 2.2, a: 0.3 } }).body.rotateY(Math.PI).translate(0, RIDGE - 0.4, ZA - 0.2));
  b.add(STONE, stone); b.add(ATLAS.key, walls); b.add(AJOUR, ajour);
  // ── flèche : 33,25 m au-dessus du faîtage ──
  b.with(pose(0, RIDGE - 0.8, 1.5), () => openworkSpire(b, { radius: 1.5, height: 31.6, mat: LEAD, matCore: 'ombre', matFinial: GOLD, lod, rooster: false }));
  b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'sainte_chapelle',
  name: 'Sainte-Chapelle',
  radius: 23,
  height: SC.SPIRE,
  build(site, quality) { return build(site, quality).build('sainte_chapelle'); },
  buildFar(site) {
    const b = new Builder();
    const { HW, ZW, ZP, ZA, WALL, RIDGE } = SC;
    const stone = farMaterial(0xdcd0b4), roof = farMaterial(0x4a5059, 0.25);
    b.push(siteAlign(site, EMPRISE, BOX));
    b.add(stone, boxAt(-HW - 1.2, 0, ZA, HW + 1.2, WALL, ZW, { top: false }));
    b.add(stone, boxAt(-HW, 0, ZW, HW, 18.2, ZP));
    b.add(stone, cyl(HW + 1.2, HW + 1.2, WALL, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(0, 0, ZA));
    b.add(roof, gableRoof(HW + 1.2, ZA, ZW, RIDGE - WALL, true).translate(0, WALL, 0));
    b.add(roof, cyl(HW + 1.2, 0, RIDGE - WALL, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(0, WALL, ZA));
    for (const sx of [-1, 1]) b.add(stone, cyl(1.5, 0.1, 47, 6, { flat: true, top: false }).translate(sx * (HW + 0.7), 0, ZW));
    b.add(roof, cyl(1.5, 0.05, SC.SPIRE - RIDGE, 6, { flat: true, top: false }).translate(0, RIDGE, 1.5));
    b.pop();
    return finishFar(b, 'sainte_chapelle');
  },
};
