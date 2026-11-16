/* Église Saint-Eustache (1532-1637) : structure gothique, décor Renaissance, façade classique inachevée (1754).
 * Cotes réelles : 105 m de long, 43,5 m de large, voûtes à 33,5 m. Flancs à trois étages (chapelles, bas-côtés,
 * fenêtres hautes) épaulés d'arcs-boutants à double volée ; bras du transept à rose et pignon, cantonnés de deux
 * tourelles d'escalier ; chevet arrondi et chapelle de la Vierge ; lanternon à la croisée. Façade ouest à deux
 * ordres superposés (dorique, ionique) : la tour nord seule a reçu son troisième niveau, la tour sud s'arrête au
 * deuxième. L'axe réel de l'église est tourné d'environ 5° par rapport au cap du repère de carte : le modèle est
 * dessiné dans le repère de l'église (EU.TILT, EU.OX, EU.OZ) pour rester sur l'emprise réelle. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, archBlock, box, boxAt, columnGeo, corniceProfile, cyl, entablature, farMaterial, finishFar, lantern, pediment, pose, sweep,
} from '../kit';
import { gableRoof, siteAlign, wallM } from '../kit/x-edifices';
import { gothicAtlas, openworkMaterial, roseMaterial, rowWall } from '../kit/x-gothique-peint';
import { gableWall, gothicApse, gothicNave, pinnacle, roseWindow, turret, type NaveSpec } from '../kit/x-gothique';
import { BOX, EMPRISE } from '../collide/saint_eustache';

export const EU = {
  /** Repère de l'église dans le repère du monument : rotation (rad) et origine. */
  TILT: -0.0872, OX: 2.2, OZ: 0.45,
  /** Dans le repère de l'église : façade, fond du massif de façade, transept (ouest, est), fin du chœur large, centre du chevet. */
  ZF: 51.5, ZB: 44.5, ZT0: 10, ZT1: -4, ZC: -22, ZA: -34.7,
  /** Demi-largeurs : chapelles, bas-côtés, vaisseau, transept, façade. */
  HB: 20.5, HM: 14, HN: 7.2, HT: 21.8, HF: 18,
  /** Chevet resserré par la rue Montmartre (emprise réelle) : décalage de son axe, demi-largeurs des chapelles et du déambulatoire. */
  AX2: 1.3, HB2: 14.5, HM2: 10.6,
  WALL: 33.5, RIDGE: 43, LANTERN: 52,
} as const;

const TINT = 0xd9cdb0;
const STONE = 'pierre_blonde', TRIM = 'pierre_lisse', SLATE = 'ardoise';
const AJOUR = openworkMaterial('gothique_ajour_blond', 0xe0cfa8);
const ROSE = roseMaterial('gothique_rose', 0xe9dfc6, 12);
const ATLAS = gothicAtlas('eustache_baies', TINT, [
  { id: 'chapelle', kind: 'baie', w: 6.9, h: 10.5, base: true, cornice: true, win: { w: 3.8, h: 6.4, sill: 2.2, lancets: 2, rose: true, round: true } },
  { id: 'tribune', kind: 'baie', w: 6.9, h: 8.5, cornice: true, win: { w: 3.2, h: 5.6, sill: 1.2, lancets: 2, rose: true, round: true } },
  { id: 'haute', kind: 'baie', w: 6.9, h: 10.5, cornice: true, win: { w: 3.8, h: 8.2, sill: 1, lancets: 3, rose: true, round: true } },
  { id: 'portail', kind: 'portail', w: 5, h: 10 },
  { id: 'etage', kind: 'baie', w: 12, h: 13, pier: 1.3, cornice: true, win: { w: 4, h: 8.6, sill: 2, lancets: 2, round: true, glass: 'clair' } },
  { id: 'beffroi', kind: 'baie', w: 10, h: 13, pier: 1.5, cornice: true, win: { w: 3, h: 8.6, sill: 2, lancets: 1, round: true, glass: 'abat_son' } },
], 37);

function spec(lod: 0 | 1, narrow = false): NaveSpec {
  return {
    atlas: ATLAS, stone: STONE, roof: SLATE, ajour: AJOUR, lod,
    tiers: [
      { half: narrow ? EU.HB2 : EU.HB, y0: 0, y1: 10.5, row: 'chapelle', rail: true },
      { half: narrow ? EU.HM2 : EU.HM, y0: 12, y1: 20.5, row: 'tribune' },
      { half: EU.HN, y0: 23, y1: EU.WALL, row: 'haute', rail: true },
    ],
    roofRise: EU.RIDGE - EU.WALL,
    pier: { w: 1.25, out: 0.4, inn: narrow ? 2 : 3, h: 23.5, pinnacle: 5 },
    flying: { y0: 20.5, y1: 28.5, t: 0.8, second: { y0: 12, y1: 18.5, land: 1 } },
    strip: { w: 0.9, d: 0.45, pinnacle: 2.2 },
  };
}

/** Façade d'un bras du transept (plan du mur en z = 0, vers +z) : portail Renaissance, rose, pignon, deux tourelles. */
function transeptFront(b: Builder, lod: 0 | 1): void {
  const W = EU.ZT0 - EU.ZT1, hw = W / 2, T = 1.0, { WALL, RIDGE } = EU;
  const stone = new Geo();
  b.with(pose(0, 0, T / 2), () => archBlock(b, { width: W, height: 14, depth: T, seg: lod > 0 ? 12 : 8, back: false, top: false, mat: STONE, openings: [{ x: 0, width: 5.2, height: 10.2 }] }));
  b.add(ATLAS.key, rowWall(ATLAS, 'portail', -2.6, 0.02, 2.6, 0.02, 0, 10.2, { bays: 1 }));
  stone.append(wallM(-hw, T, hw, T, 14, WALL));
  for (const s of [-1, 1]) stone.append(wallM(s * hw, s > 0 ? T : 0, s * hw, s > 0 ? 0 : T, 14, WALL));
  const col = columnGeo({ order: 'corinthien', height: 9, diameter: 0.8, mat: TRIM, flutes: 0, seg: 8 });
  for (const x of [-3.6, 3.6]) stone.append(col.shaft.clone().translate(x, 0.6, T + 0.6)).append(col.trim.clone().translate(x, 0.6, T + 0.6)).append(box(1.2, 0.6, 1.2).translate(x, 0, T + 0.6));
  b.with(pose(0, 11.2, T + 0.2), () => pediment(b, { width: 9.6, rise: 2.4, depth: 1.0, mat: TRIM, baseCornice: true }));
  const rose = roseWindow(4.7, { frame: 0.6, depth: 0.45, seg: lod > 0 ? 32 : 20 });
  b.add(ROSE, rose.glass.translate(0, 24, T + 0.04));
  stone.append(rose.frame.translate(0, 24, T + 0.04));
  stone.append(gableWall(W, 0, RIDGE - WALL + 0.8, T).translate(0, WALL, T / 2));
  const oc = roseWindow(1.6, { frame: 0.35, depth: 0.3, seg: 18 });
  b.add(ROSE, oc.glass.translate(0, WALL + 3.2, T + 0.04));
  stone.append(oc.frame.translate(0, WALL + 3.2, T + 0.04));
  stone.append(sweep(corniceProfile(WALL - 0.5, 0.5, 0.4), [-hw, T, hw, T]));
  stone.append(pinnacle(0.9, 3.4, lod).translate(0, RIDGE + 0.6, T / 2));
  for (const s of [-1, 1]) {
    stone.append(turret(1.7, 39, 0.01, 8).translate(s * (hw + 0.4), 0, T - 0.3));
    b.with(pose(s * (hw + 0.4), 39.4, T - 0.3), () => lantern(b, { radius: 1.5, height: 5.4, mat: STONE, matRoof: SLATE, bays: 6, finial: 'boule' }));
  }
  b.add(STONE, stone);
}

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { TILT, OX, OZ, ZF, ZB, ZT0, ZT1, ZC, ZA, HB, HM, HN, HT, HF, AX2, HB2, HM2, WALL, RIDGE, LANTERN } = EU;
  b.push(siteAlign(site, EMPRISE, BOX));
  b.push(pose(OX, 0, OZ, TILT));
  const s = spec(lod), s2 = spec(lod, true);
  b.with(pose(0, 0, ZT0), () => gothicNave(b, s, ZB - ZT0, 5, { skip: [0, 5] }));
  b.with(pose(0, 0, ZC), () => gothicNave(b, s, ZT1 - ZC, 3, { skip: [3] }));
  // chevet resserré : deux travées étroites puis l'abside, désaxées vers le sud (emprise réelle, rue Montmartre)
  b.with(pose(AX2, 0, ZA), () => { gothicNave(b, s2, ZC - ZA, 2, { skip: [2] }); gothicApse(b, s2, 7); });
  const stone = new Geo(), walls = new Geo(), slate = new Geo(), trim = new Geo();
  stone.append(wallM(HB, ZC, AX2 + HB2, ZC, 0, 10.5)).append(wallM(AX2 - HB2, ZC, -HB, ZC, 0, 10.5));
  stone.append(wallM(HM, ZC, AX2 + HM2, ZC, 10.5, 20.5)).append(wallM(AX2 - HM2, ZC, -HM, ZC, 10.5, 20.5));
  // ── chapelle de la Vierge et son clocheton ──
  const lx = AX2 + 1.3, lz = ZA - 13.4;
  stone.append(cyl(4.1, 4.1, 13, 12, { top: false }).translate(lx, 0, lz));
  slate.append(cyl(4.4, 0, 5, 12, { top: false }).translate(lx, 13, lz));
  b.with(pose(lx, 17.2, lz), () => lantern(b, { radius: 1.0, height: 5.4, mat: STONE, matRoof: SLATE, bays: 6, finial: 'croix' }));
  // ── transept, croisée, lanternon ──
  for (const sg of [-1, 1]) {
    const xi = sg * HN, xo = sg * HT;
    const west: [number, number] = sg > 0 ? [xi, xo] : [xo, xi], east: [number, number] = sg > 0 ? [xo, xi] : [xi, xo];
    stone.append(wallM(west[0], ZT0, west[1], ZT0, 0, 23)).append(wallM(east[0], ZT1, east[1], ZT1, 0, 23));
    walls.append(rowWall(ATLAS, 'haute', west[0], ZT0, west[1], ZT0, 23, WALL, { bays: 2 }));
    walls.append(rowWall(ATLAS, 'haute', east[0], ZT1, east[1], ZT1, 23, WALL, { bays: 2 }));
    b.with(pose(sg * HT, 0, (ZT0 + ZT1) / 2, (sg * Math.PI) / 2), () => transeptFront(b, lod));
  }
  slate.append(gableRoof((ZT0 - ZT1) / 2 + 0.3, -HT, HT, RIDGE - WALL).rotateY(Math.PI / 2).translate(0, WALL, (ZT0 + ZT1) / 2));
  slate.append(gableRoof(HN + 0.35, ZT1 - 0.5, ZT0 + 0.5, RIDGE - WALL).translate(0, WALL, 0));
  slate.append(cyl(2.4, 1.9, 3, 8, { flat: true, top: false }).translate(0, RIDGE - 1.2, (ZT0 + ZT1) / 2));
  b.with(pose(0, RIDGE + 1.6, (ZT0 + ZT1) / 2), () => lantern(b, { radius: 1.9, height: LANTERN - RIDGE - 3.4, mat: 'plomb', matRoof: SLATE, bays: 8, finial: 'croix' }));
  // ── façade classique : deux ordres, fronton central, tour nord à trois niveaux, tour sud inachevée ──
  const L1 = 14, L2 = 27;
  b.with(pose(0, 0, ZF - 1.5), () => archBlock(b, {
    width: 2 * HF, height: L1 - 2.5, depth: 3, seg: lod > 0 ? 12 : 8, back: false, top: false, mat: STONE,
    openings: [{ x: 0, width: 5, height: 9.6 }, { x: -11.6, width: 3.4, height: 7.6 }, { x: 11.6, width: 3.4, height: 7.6 }],
  }));
  for (const x of [0, -11.6, 11.6]) walls.append(rowWall(ATLAS, 'portail', x - (x === 0 ? 2.5 : 1.7), ZF - 2.9, x + (x === 0 ? 2.5 : 1.7), ZF - 2.9, 0, x === 0 ? 9.6 : 7.6, { bays: 1 }));
  stone.append(boxAt(-HF, 0, ZB, HF, L1 - 2.5, ZF - 3, { top: false }));
  stone.append(boxAt(-HF, L1 - 2.5, ZB, HF, L1, ZF, { bottom: true }));
  walls.append(rowWall(ATLAS, 'etage', -HF, ZF - 0.4, HF, ZF - 0.4, L1, L2 - 2.4, { bays: 3 }));
  stone.append(boxAt(-HF, L1, ZB, HF, L2, ZF - 0.4, { top: true }));
  const d1 = columnGeo({ order: 'dorique', height: L1 - 3.3, diameter: 1.2, mat: TRIM, flutes: 0, seg: lod > 0 ? 10 : 8 });
  const d2 = columnGeo({ order: 'ionique', height: L2 - L1 - 2.8, diameter: 1.05, mat: TRIM, flutes: 0, seg: lod > 0 ? 10 : 8 });
  for (const x of [-17, -15, -7.6, -5.6, 5.6, 7.6, 15, 17]) {
    trim.append(box(1.7, 0.8, 1.7).translate(x, 0, ZF + 0.9)).append(d1.shaft.clone().translate(x, 0.8, ZF + 0.9)).append(d1.trim.clone().translate(x, 0.8, ZF + 0.9));
    trim.append(d2.shaft.clone().translate(x, L1 + 0.2, ZF + 0.6)).append(d2.trim.clone().translate(x, L1 + 0.2, ZF + 0.6));
  }
  const path = [-HF - 0.1, ZB, -HF - 0.1, ZF + 1.7, HF + 0.1, ZF + 1.7, HF + 0.1, ZB];
  trim.append(boxAt(-HF, L1 - 2.5, ZF, HF, L1 + 0.2, ZF + 1.7, { bottom: true })).append(boxAt(-HF, L2 - 2.6, ZF - 0.4, HF, L2, ZF + 1.4, { bottom: true }));
  entablature(b, path, L1 - 2.5, 2.5, 0.8, { mat: TRIM });
  entablature(b, [-HF - 0.1, ZB, -HF - 0.1, ZF + 1.4, HF + 0.1, ZF + 1.4, HF + 0.1, ZB], L2 - 2.4, 2.4, 0.8, { mat: TRIM });
  b.with(pose(0, L2, ZF - 0.2), () => pediment(b, { width: 16.4, rise: 3.2, depth: 1.5, mat: TRIM, matTympan: STONE }));
  // tour nord (−x) : troisième niveau, corniche, balustrade pleine ; tour sud : simple comble bas
  const tx = HF - 5.2, tz = ZF - 5.2;
  for (let k = 0; k < 4; k++) walls.append(rowWall(ATLAS, 'beffroi', -5, 5, 5, 5, L2, L2 + 12.6, { bays: 1 }).rotateY((k * Math.PI) / 2).translate(-tx, 0, tz));
  stone.append(box(10.4, 1.6, 10.4, { bottom: true }).translate(-tx, L2 + 12.6, tz));
  stone.append(box(9.6, 0.3, 9.6, { bottom: false }).translate(-tx, L2 + 12.4, tz));
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) stone.append(pinnacle(1.0, 3.4, lod).translate(-tx + px * 4.6, L2 + 14.2, tz + pz * 4.6));
  slate.append(box(10.6, 0.5, 10.6, { bottom: true }).translate(tx, L2, tz));
  stone.append(gableWall(2 * HN + 0.6, WALL, RIDGE - WALL, 0.8).translate(0, 0, ZB + 0.4));
  b.add(STONE, stone); b.add(ATLAS.key, walls); b.add(SLATE, slate); b.add(TRIM, trim);
  b.pop(); b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'saint_eustache',
  name: 'Église Saint-Eustache',
  radius: 62,
  height: EU.LANTERN,
  build(site, quality) { return build(site, quality).build('saint_eustache'); },
  buildFar(site) {
    const b = new Builder();
    const { TILT, OX, OZ, ZF, ZB, ZT0, ZT1, ZC, ZA, HB, HM, HN, HT, HF, AX2, HB2, WALL, RIDGE, LANTERN } = EU;
    const stone = farMaterial(0xd9cdb0), roof = farMaterial(0x4a5059, 0.25);
    b.push(siteAlign(site, EMPRISE, BOX));
    b.push(pose(OX, 0, OZ, TILT));
    b.add(stone, boxAt(-HF, 0, ZB, HF, 27, ZF));
    b.add(stone, boxAt(-HF, 27, ZF - 10.4, -HF + 10.4, 41, ZF));
    b.add(stone, boxAt(-HB, 0, ZC, HB, 10.5, ZB, { top: true }));
    b.add(stone, boxAt(-HM, 10.5, ZC, HM, 20.5, ZB));
    b.add(stone, boxAt(AX2 - HB2, 0, ZA, AX2 + HB2, 14, ZC, { top: true }));
    b.add(stone, boxAt(-HN, 20.5, ZA, HN, WALL, ZB, { top: false }));
    b.add(roof, gableRoof(HN + 0.35, ZA, ZB, RIDGE - WALL).translate(0, WALL, 0));
    b.add(stone, boxAt(-HT - 1, 0, ZT1, HT + 1, WALL, ZT0, { top: false }));
    b.add(roof, gableRoof((ZT0 - ZT1) / 2, -HT - 1, HT + 1, RIDGE - WALL, true).rotateY(Math.PI / 2).translate(0, WALL, (ZT0 + ZT1) / 2));
    b.add(stone, cyl(HB2, HB2, 12, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(AX2, 0, ZA));
    b.add(stone, cyl(HN, HN, WALL, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(AX2, 0, ZA));
    b.add(roof, cyl(HB2, HN, 9, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(AX2, 12, ZA));
    b.add(roof, cyl(HN + 0.35, 0, RIDGE - WALL, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(AX2, WALL, ZA));
    b.add(roof, cyl(1.9, 0.2, LANTERN - RIDGE, 6, { flat: true }).translate(0, RIDGE, (ZT0 + ZT1) / 2));
    b.pop(); b.pop();
    return finishFar(b, 'saint_eustache');
  },
};
