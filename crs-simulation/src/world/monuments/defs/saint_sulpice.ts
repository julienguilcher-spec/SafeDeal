/* Église Saint-Sulpice (1646-1780 ; façade de Servandoni, tour nord achevée par Chalgrin).
 * Cotes réelles : 120 m de long, 57 m de large, voûtes à 34 m ; façade à deux colonnades superposées (dorique en
 * bas, formant un portique ouvert ; ionique en haut, formant une loggia) entre deux tours DISSYMÉTRIQUES : tour nord
 * de 73 m (étage carré à frontons, étage circulaire à colonnes, balustrade), tour sud de 68 m restée inachevée
 * (plus nue, plus basse). Corps classique à hautes fenêtres en plein cintre, épaulé de contreforts en console ;
 * chevet arrondi prolongé par la chapelle de la Vierge. Repère local : façade vers +z, tour nord du côté −x. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, balustrade, box, boxAt, columnGeo, cyl, dome, entablature, farMaterial, finishFar, pediment, pose, stairs,
} from '../kit';
import { gableRoof, siteAlign, wallM } from '../kit/x-edifices';
import { gothicAtlas, rowWall } from '../kit/x-gothique-peint';
import { gableWall, gothicApse, gothicNave, type NaveSpec } from '../kit/x-gothique';
import { rectRing } from '../shape2d';
import { BOX, EMPRISE, SUL, porticoColumns } from '../collide/saint_sulpice';

export const SULPICE = { WALL: 32, RIDGE: 40.5, LOW: 17.2, HIGH: 30.5, NORTH: 73, SOUTH: 68 } as const;

const TINT = 0xdccfae;
const STONE = 'pierre_blonde', TRIM = 'pierre_lisse', SLATE = 'ardoise', DARK = 'ombre';
const ATLAS = gothicAtlas('sulpice_baies', TINT, [
  { id: 'chapelle', kind: 'baie', w: 8.4, h: 13, base: true, cornice: true, pier: 1.4, win: { w: 3.4, h: 7.4, sill: 3.2, lancets: 1, round: true, glass: 'clair' } },
  { id: 'haute', kind: 'baie', w: 8.4, h: 12, cornice: true, pier: 1.2, win: { w: 3.8, h: 8.6, sill: 1.4, lancets: 1, round: true, glass: 'clair' } },
  { id: 'tour', kind: 'baie', w: 11.5, h: 14.6, base: true, cornice: true, pier: 2.2, win: { w: 3.2, h: 8.4, sill: 2.2, lancets: 1, round: true, glass: 'abat_son' } },
  { id: 'portes', kind: 'baie', w: 11, h: 13.8, pier: 1.6, win: { w: 4.4, h: 9.6, sill: 0, lancets: 1, round: true, glass: 'abat_son' } },
  { id: 'loggia', kind: 'baie', w: 11, h: 10.6, pier: 1.6, win: { w: 4.6, h: 8.2, sill: 0.8, lancets: 2, round: true, glass: 'clair' } },
], 29);

function spec(lod: 0 | 1): NaveSpec {
  return {
    atlas: ATLAS, stone: STONE, roof: SLATE, lod,
    tiers: [
      { half: SUL.HB, y0: 0, y1: 13, row: 'chapelle' },
      { half: SUL.HN, y0: 20, y1: SULPICE.WALL, row: 'haute' },
    ],
    roofRise: SULPICE.RIDGE - SULPICE.WALL,
    pier: { w: 1.3, out: 0.3, inn: 3.2, h: 16.5, pinnacle: 0 },
    flying: { y0: 15, y1: 25.5, t: 1.1 },
    strip: { w: 1.2, d: 0.5 },
  };
}

/** Façade d'un bras du transept : deux ordres superposés, grande baie cintrée, fronton. Plan du mur en z = 0, vers +z. */
function transeptFront(b: Builder, lod: 0 | 1): void {
  const w = SUL.ZT0 - SUL.ZT1, hw = w / 2, { WALL } = SULPICE;
  b.add(ATLAS.key, rowWall(ATLAS, 'portes', -hw, 0, hw, 0, 0, 15, { bays: 1 }));
  b.add(ATLAS.key, rowWall(ATLAS, 'loggia', -hw, 0, hw, 0, 15, WALL, { bays: 1 }));
  const lo = columnGeo({ order: 'dorique', height: 12, diameter: 1.25, mat: TRIM, flutes: 0, seg: lod > 0 ? 10 : 6 });
  const hi = columnGeo({ order: 'ionique', height: 12.4, diameter: 1.1, mat: TRIM, flutes: 0, seg: lod > 0 ? 10 : 6 });
  const g = new Geo();
  for (const x of [-hw + 1.2, -3.6, 3.6, hw - 1.2]) {
    g.append(box(1.7, 1.2, 1.7).translate(x, 0, 0.9)).append(lo.shaft.clone().translate(x, 1.2, 0.9)).append(lo.trim.clone().translate(x, 1.2, 0.9));
    g.append(hi.shaft.clone().translate(x, 15.6, 0.9)).append(hi.trim.clone().translate(x, 15.6, 0.9));
  }
  g.append(boxAt(-hw, 13.2, 0, hw, 15.6, 1.7, { bottom: true })).append(boxAt(-hw, 28, 0, hw, WALL, 1.7, { bottom: true }));
  b.add(TRIM, g);
  entablature(b, [-hw, 1.7, hw, 1.7], 14.2, 1.4, 0.6, { mat: TRIM, corniceOnly: true });
  entablature(b, [-hw, 1.7, hw, 1.7], WALL - 1.6, 1.6, 0.8, { mat: TRIM, corniceOnly: true });
  b.with(pose(0, WALL, 0.2), () => pediment(b, { width: w + 1.2, rise: 4.6, depth: 1.5, mat: TRIM, matTympan: STONE }));
}

/** Étages hauts d'une tour, au-dessus de la balustrade de la façade (repère : axe de la tour, y = 0 à 30,5 m). */
function towerTop(b: Builder, north: boolean, lod: 0 | 1): void {
  const g = new Geo(), dark = new Geo();
  const sq = north ? 15.5 : 14.5, half = 4.9;
  // étage carré : baies d'abat-son, frontons (triangulaires au nord, blocs épannelés au sud)
  g.append(box(2 * half, sq, 2 * half, { top: false }));
  for (let k = 0; k < 4; k++) {
    const rot = (k * Math.PI) / 2;
    dark.append(box(3.0, sq * 0.56, 0.2, { bottom: true }).translate(0, sq * 0.2, half + 0.02).rotateY(rot));
    if (north) {
      const col = columnGeo({ order: 'corinthien', height: sq - 3.2, diameter: 0.95, mat: TRIM, flutes: 0, seg: lod > 0 ? 8 : 6 });
      for (const sx of [-1, 1]) g.append(col.shaft.clone().translate(sx * (half - 0.6), 0.6, half + 0.55).rotateY(rot)).append(col.trim.clone().translate(sx * (half - 0.6), 0.6, half + 0.55).rotateY(rot));
      g.append(box(2 * half + 1.3, 0.6, 1.3).translate(0, 0, half + 0.5).rotateY(rot));
      b.with(pose(0, sq - 2.6, 0, rot), () => b.with(pose(0, 0, half + 0.1), () => pediment(b, { width: 2 * half + 1.4, rise: 2.3, depth: 1.1, mat: TRIM, baseCornice: true })));
    } else {
      g.append(box(1.5, sq - 1.5, 0.6).translate(-half + 0.75, 0, half + 0.3).rotateY(rot)).append(box(1.5, sq - 1.5, 0.6).translate(half - 0.75, 0, half + 0.3).rotateY(rot));
      g.append(box(2 * half + 1.2, 1.5, 1.2, { bottom: true }).translate(0, sq - 1.5, half).rotateY(rot));
    }
  }
  g.append(box(2 * half + 0.6, 0.5, 2 * half + 0.6, { bottom: true }).translate(0, sq, 0));
  // étage circulaire : colonnes engagées (nord) ou pilastres bruts (sud), entablement, balustrade
  const y1 = sq + 0.5, rd = 4.5, hr = north ? 15 : 13.5, n = 12;
  g.append(cyl(rd, rd, hr, lod > 0 ? 24 : 12, { top: false }).translate(0, y1, 0));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (north) {
      const c = columnGeo({ order: 'corinthien', height: hr - 2.2, diameter: 0.8, mat: TRIM, flutes: 0, seg: 6 });
      g.append(c.shaft.clone().translate(0, y1, rd + 0.25).rotateY(a)).append(c.trim.clone().translate(0, y1, rd + 0.25).rotateY(a));
    } else g.append(box(0.9, hr - 1.6, 0.5, { top: false }).translate(0, y1, rd + 0.1).rotateY(a));
    if (i % 2 === 0) dark.append(box(1.5, hr * 0.5, 0.2, { bottom: true }).translate(0, y1 + hr * 0.2, rd + 0.02).rotateY(a + Math.PI / n));
  }
  g.append(cyl(rd + 0.9, rd + 0.9, 1.6, lod > 0 ? 24 : 12, { bottom: true }).translate(0, y1 + hr - 1.6, 0));
  // couronnement : petit tambour et terrasse (balustrade au nord seulement)
  const y2 = y1 + hr, total = (north ? SULPICE.NORTH : SULPICE.SOUTH) - SULPICE.HIGH, ht = total - y2;
  g.append(cyl(3.2, 3.0, ht - 0.6, lod > 0 ? 20 : 10, { top: false }).translate(0, y2, 0));
  g.append(cyl(3.6, 3.6, 0.6, lod > 0 ? 20 : 10, { bottom: true }).translate(0, y2 + ht - 0.6, 0));
  for (let i = 0; i < 8; i++) dark.append(box(1.0, ht * 0.55, 0.2, { bottom: true }).translate(0, y2 + ht * 0.18, 3.12).rotateY((i / 8) * Math.PI * 2));
  if (north) {
    const ring: number[] = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ring.push((rd + 0.6) * Math.cos(a), -(rd + 0.6) * Math.sin(a)); }
    balustrade(b, ring, { y: y2, height: 1.0, mat: TRIM, closed: true, postEvery: 0 });
  }
  b.add(STONE, g); b.add(DARK, dark);
}

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { ZF, ZB, ZWALL, HF, HP, HN, HT, ZT0, ZT1, ZA, DIA, ENT, STEP } = SUL;
  const { WALL, RIDGE, LOW, HIGH } = SULPICE;
  b.push(siteAlign(site, EMPRISE, BOX));
  const s = spec(lod);
  // ── nef, chœur, chevet, chapelle de la Vierge ──
  b.with(pose(0, 0, ZT0), () => gothicNave(b, s, ZB - ZT0, 5, { skip: [0, 5] }));
  b.with(pose(0, 0, ZA), () => { gothicNave(b, s, ZT1 - ZA, 2, { skip: [2] }); gothicApse(b, s, 5); });
  const stone = new Geo(), walls = new Geo(), slate = new Geo(), trim = new Geo();
  stone.append(cyl(6.6, 6.6, 15, 16, { top: false }).translate(0, 0, -54.5));
  b.with(pose(0, 15, -54.5), () => dome(b, { radius: 6.8, height: 4.6, mat: SLATE, seg: 16, rows: 4, lantern: { radius: 1.1, height: 3, mat: TRIM, matRoof: SLATE, finial: 'croix' } }));
  stone.append(boxAt(9, 0, -57, 27.5, 10, -38));
  slate.append(boxAt(8.8, 10, -57.2, 27.7, 10.4, -37.8, { bottom: true }));
  // ── transept ──
  for (const sg of [-1, 1]) {
    const xi = sg * HN, xo = sg * HT;
    const west: [number, number] = sg > 0 ? [xi, xo] : [xo, xi], east: [number, number] = sg > 0 ? [xo, xi] : [xi, xo];
    stone.append(wallM(west[0], ZT0, west[1], ZT0, 0, 20)).append(wallM(east[0], ZT1, east[1], ZT1, 0, 20));
    walls.append(rowWall(ATLAS, 'haute', west[0], ZT0, west[1], ZT0, 20, WALL, { bays: 2 }));
    walls.append(rowWall(ATLAS, 'haute', east[0], ZT1, east[1], ZT1, 20, WALL, { bays: 2 }));
    b.with(pose(sg * HT, 0, (ZT0 + ZT1) / 2, (sg * Math.PI) / 2), () => transeptFront(b, lod));
  }
  slate.append(gableRoof((ZT0 - ZT1) / 2 + 0.3, -HT, HT, RIDGE - WALL).rotateY(Math.PI / 2).translate(0, WALL, (ZT0 + ZT1) / 2));
  slate.append(gableRoof(HN + 0.35, ZT1 - 0.5, ZT0 + 0.5, RIDGE - WALL).translate(0, WALL, 0));
  stone.append(gableWall(2 * HN + 0.6, WALL, RIDGE - WALL, 0.8).translate(0, 0, ZB + 0.4));
  // ── façade : perron, portique dorique ouvert, loggia ionique, balustrade ──
  b.add(TRIM, boxAt(-HF, 0, ZB, HF, STEP, ZF));
  b.with(pose(0, 0, ZF), () => stairs(b, 2 * HP + 6, STEP, 1.5, 3, TRIM));
  const xs = porticoColumns();
  const lo = columnGeo({ order: 'dorique', height: ENT - STEP, diameter: DIA, mat: TRIM, flutes: lod > 0 ? 20 : 0, seg: lod > 0 ? 12 : 8 });
  const hi = columnGeo({ order: 'ionique', height: 10.4, diameter: 1.3, mat: TRIM, flutes: lod > 0 ? 16 : 0, seg: lod > 0 ? 12 : 8 });
  for (const x of xs) {
    for (const z of [ZF - 1.4, ZF - 5.2]) trim.append(lo.shaft.clone().translate(x, STEP, z)).append(lo.trim.clone().translate(x, STEP, z));
    trim.append(hi.shaft.clone().translate(x, LOW + 0.2, ZF - 1.4)).append(hi.trim.clone().translate(x, LOW + 0.2, ZF - 1.4));
  }
  // murs du fond (portes en bas, baies de la loggia en haut), planchers
  walls.append(rowWall(ATLAS, 'portes', -HP, ZWALL, HP, ZWALL, STEP, ENT, { bays: 3 }));
  walls.append(rowWall(ATLAS, 'loggia', -HP, ZWALL + 2.4, HP, ZWALL + 2.4, LOW + 0.2, LOW + 10.6, { bays: 3 }));
  stone.append(boxAt(-HP, ENT, ZWALL, HP, LOW + 0.2, ZF - 0.4, { bottom: true }));
  b.add('caissons', new Geo().face(-HP, ENT - 0.02, ZWALL, HP, ENT - 0.02, ZWALL, HP, ENT - 0.02, ZF - 0.4, -HP, ENT - 0.02, ZF - 0.4));
  stone.append(boxAt(-HP, LOW + 10.6, ZWALL + 2.4, HP, HIGH, ZF - 0.4, { bottom: true }));
  stone.append(boxAt(-HP, 0, ZB, HP, HIGH, ZWALL, { top: false }));
  const frontPath = [-HF - 0.1, ZB, -HF - 0.1, ZF, HF + 0.1, ZF, HF + 0.1, ZB];
  entablature(b, frontPath, ENT, LOW - ENT, 0.9, { mat: TRIM });
  entablature(b, frontPath, HIGH - 2.6, 2.6, 1.0, { mat: TRIM });
  balustrade(b, [-HP, ZF - 0.5, HP, ZF - 0.5], { y: HIGH, height: 1.1, mat: TRIM, postEvery: 4.2 });
  for (let i = 0; i < xs.length - 1; i++) balustrade(b, [xs[i] + 0.9, ZF - 1.0, xs[i + 1] - 0.9, ZF - 1.0], { y: LOW + 0.2, height: 1.0, mat: TRIM, postEvery: 0 });
  // tours : deux niveaux pleins, puis les étages hauts dissymétriques
  for (const sg of [-1, 1]) {
    const tx = sg * (HF + HP) / 2, tw = HF - HP;
    const r = rectRing(tx, (ZF + ZB) / 2, tw, ZF - ZB);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      walls.append(rowWall(ATLAS, 'tour', r[2 * i], r[2 * i + 1], r[2 * j], r[2 * j + 1], STEP, ENT + 0.6, { bays: 1 }));
      walls.append(rowWall(ATLAS, 'tour', r[2 * i], r[2 * i + 1], r[2 * j], r[2 * j + 1], LOW, HIGH - 2, { bays: 1 }));
    }
    stone.append(boxAt(tx - tw / 2, HIGH - 0.2, ZB, tx + tw / 2, HIGH, ZF, { bottom: false }));
    b.with(pose(tx, HIGH, (ZF + ZB) / 2), () => towerTop(b, sg < 0, lod));
  }
  b.add(STONE, stone); b.add(ATLAS.key, walls); b.add(SLATE, slate); b.add(TRIM, trim);
  b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'saint_sulpice',
  name: 'Église Saint-Sulpice',
  radius: 70,
  height: SULPICE.NORTH,
  build(site, quality) { return build(site, quality).build('saint_sulpice'); },
  buildFar(site) {
    const b = new Builder();
    const { ZF, ZB, HF, HP, HB, HN, HT, ZT0, ZT1, ZA } = SUL, { WALL, RIDGE, HIGH } = SULPICE;
    const stone = farMaterial(0xdccfae), roof = farMaterial(0x4a5059, 0.25);
    b.push(siteAlign(site, EMPRISE, BOX));
    b.add(stone, boxAt(-HF, 0, ZB, HF, HIGH, ZF));
    for (const sg of [-1, 1]) {
      const tx = sg * (HF + HP) / 2, top = sg < 0 ? 73 : 68;
      b.add(stone, box(9.8, 15, 9.8, { top: false }).translate(tx, HIGH, (ZF + ZB) / 2));
      b.add(stone, cyl(4.6, 4.6, top - HIGH - 15 - 8, 8, { flat: true, top: false }).translate(tx, HIGH + 15, (ZF + ZB) / 2));
      b.add(stone, cyl(3.2, 3.2, 8, 8, { flat: true }).translate(tx, top - 8, (ZF + ZB) / 2));
    }
    b.add(stone, boxAt(-HB, 0, ZA, HB, 13, ZB, { top: true }));
    b.add(stone, boxAt(-HN, 13, ZA, HN, WALL, ZB, { top: false }));
    b.add(roof, gableRoof(HN + 0.35, ZA, ZB, RIDGE - WALL).translate(0, WALL, 0));
    b.add(stone, boxAt(-HT, 0, ZT1, HT, WALL, ZT0, { top: false }));
    b.add(roof, gableRoof((ZT0 - ZT1) / 2, -HT, HT, RIDGE - WALL, true).rotateY(Math.PI / 2).translate(0, WALL, (ZT0 + ZT1) / 2));
    b.add(stone, cyl(HB, HB, 13, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(0, 0, ZA));
    b.add(stone, cyl(HN, HN, WALL, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(0, 0, ZA));
    b.add(roof, cyl(HB, HN, 7, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(0, 13, ZA));
    b.add(roof, cyl(HN + 0.35, 0, RIDGE - WALL, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(0, WALL, ZA));
    b.add(stone, cyl(6.6, 5, 19, 8, { flat: true }).translate(0, 0, -54.5));
    b.pop();
    return finishFar(b, 'saint_sulpice');
  },
};
