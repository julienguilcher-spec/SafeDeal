/* Cathédrale Notre-Dame de Paris — état après restauration (réouverture de décembre 2024).
 * Cotes réelles : longueur 127–130 m, largeur 48 m au transept, façade ouest 41–43,5 m, tours 69 m, voûtes à 33 m,
 * faîtage à 43 m, flèche (reconstruite à l'identique, plomb neuf) à 96 m coq compris, roses du transept de 13 m,
 * rose ouest de 9,6 m. Le modèle est dessiné sur l'emprise réelle de la carte (repère local : façade ouest vers +z,
 * chevet vers −z, sacristie et Seine du côté +x) : axe du vaisseau en x = −12,4, croisée en z = −3,1.
 * Façade ouest de bas en haut : trois portails ébrasés, galerie des Rois, étage de la rose, grande galerie ajourée,
 * deux tours à hautes baies d'abat-son. Flancs : chapelles, tribunes, fenêtres hautes, culées et arcs-boutants
 * d'une seule volée ; chevet arrondi ; flèche ajourée à la croisée, cantonnée des seize statues de cuivre. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, archBlock, archivolt, beam, box, boxAt, cyl, farMaterial, figureGeo, finishFar, horseGeo, pedestal, pose, sweep, corniceProfile,
} from '../kit';
import { gableRoof, hipRoof, ribbonUv, roofingMaterial, siteAlign, wallM } from '../kit/x-edifices';
import { AJOUR_ARCADE, AJOUR_RAIL, gothicAtlas, openworkMaterial, roseMaterial, rowWall } from '../kit/x-gothique-peint';
import {
  buttress, gableWall, gothicApse, gothicNave, openworkSpire, pinnacle, roseWindow, type NaveSpec,
} from '../kit/x-gothique';
import { rectRing } from '../shape2d';
import { BOX, EMPRISE } from '../collide/notre_dame';

export const ND = {
  /** Axe du vaisseau, plan de la façade ouest, arrière du massif des tours, centre de la croisée, centre du chevet. */
  AX: -12.4, ZF: 66.7, ZT: 46.7, ZC: -3.1, ZA: -43.3,
  /** Demi-largeurs : façade, corps (chapelles), tribunes, vaisseau central, transept. */
  HF: 21, HB: 24.4, HM: 15.2, HN: 7.3, HT: 25.4,
  /** Largeur du transept. */
  TW: 17.4,
  /** Niveaux de la façade : galerie des Rois, étage de la rose, grande galerie, base des tours, sommet. */
  L1: 17.5, L2: 21, L3: 39, L4: 46, TOWER: 69,
  /** Sommet des murs gouttereaux, faîtage, sommet de la flèche. */
  WALL: 33.5, RIDGE: 43.5, SPIRE: 96,
} as const;

const STONE_TINT = 0xe9dfc6;
const STONE = 'pierre_claire', DARK = 'ombre', COPPER = 'bronze_vert', GOLD = 'or';
/** Plomb neuf de la toiture et de la flèche reconstruites : gris clair mat, pas encore patiné. */
const LEAD = roofingMaterial('plomb_neuf', 0x8c9297, 0.75, 6);
const AJOUR = openworkMaterial('gothique_ajour_clair', STONE_TINT);
const ROSE = roseMaterial('gothique_rose', STONE_TINT, 12);
const ATLAS = gothicAtlas('nd_baies', STONE_TINT, [
  { id: 'chapelle', kind: 'baie', w: 5.87, h: 11.5, base: true, win: { w: 4.3, h: 7.4, sill: 2.2, lancets: 3, rose: true, gable: true } },
  { id: 'tribune', kind: 'baie', w: 5.87, h: 8, win: { w: 3.4, h: 5.6, sill: 1.0, lancets: 2, rose: true } },
  { id: 'haute', kind: 'baie', w: 5.87, h: 9.5, cornice: true, win: { w: 3.6, h: 7.7, sill: 0.7, lancets: 2, rose: true } },
  { id: 'rois', kind: 'rois', w: 6, h: 3.5, count: 4 },
  { id: 'portail', kind: 'portail', w: 5.6, h: 11 },
  { id: 'jumelles', kind: 'baie', w: 14.4, h: 18, win: { w: 8.6, h: 14.4, sill: 1.6, lancets: 2, rose: true, glass: 'clair' } },
  { id: 'arcature', kind: 'mur', w: 8.7, h: 4.5, count: 6, cornice: true },
], 3);

function naveSpec(lod: 0 | 1): NaveSpec {
  return {
    atlas: ATLAS, stone: STONE, roof: LEAD, ajour: AJOUR, lod,
    tiers: [
      { half: ND.HB, y0: 0, y1: 11.5, row: 'chapelle', rail: true },
      { half: ND.HM, y0: 13.5, y1: 21.5, row: 'tribune' },
      { half: ND.HN, y0: 24, y1: ND.WALL, row: 'haute', rail: true },
    ],
    roofRise: ND.RIDGE - ND.WALL,
    pier: { w: 1.35, out: 0.5, inn: 3.0, h: 25, pinnacle: 6.5 },
    flying: { y0: 21.5, y1: 29, t: 0.9 },
    strip: { w: 0.9, d: 0.5, pinnacle: 2.6 },
  };
}

/** Faces verticales choisies d'un pavé (pierre courante). */
function shell(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, f: { px?: boolean; nx?: boolean; pz?: boolean; nz?: boolean; top?: boolean }): Geo {
  const g = new Geo();
  if (f.pz) g.append(wallM(x0, z1, x1, z1, y0, y1));
  if (f.nz) g.append(wallM(x1, z0, x0, z0, y0, y1));
  if (f.px) g.append(wallM(x1, z1, x1, z0, y0, y1));
  if (f.nx) g.append(wallM(x0, z0, x0, z1, y0, y1));
  if (f.top) g.face(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0);
  return g;
}

/** Façade ouest et tours. Repère : x = écart à l'axe du vaisseau, z monde. */
function westFront(b: Builder, lod: 0 | 1): void {
  const { ZF, ZT, HF, L1, L2, L3, L4 } = ND;
  const seg = lod > 0 ? 14 : 8, ZS = ZF - 0.9;
  const stone = new Geo(), walls = new Geo(), ajour = new Geo(), lead = new Geo(), dark = new Geo();
  // ── portails : mur épais percé de trois arcs brisés, voussures en retraite, fond peint ──
  const portals = [{ x: 0, w: 10, h: 15.2 }, { x: -13.8, w: 8.6, h: 13.6 }, { x: 13.8, w: 8.6, h: 13.6 }];
  b.with(pose(0, 0, ZF - 1.5), () => archBlock(b, {
    width: 2 * HF, height: L1, depth: 3, seg, back: false, top: false, mat: STONE,
    openings: portals.map((p) => ({ x: p.x, width: p.w, height: p.h, kind: 'ogive' as const })),
  }));
  for (const p of portals) {
    const n = 4, step = p.w * 0.055;
    for (let j = 1; j <= n; j++) {
      stone.append(archivolt({ x: p.x, width: p.w - 2 * step * j, height: p.h - step * j, kind: 'ogive' }, step, 0.6, seg, true).translate(0, 0, ZF - 0.6 * (j + 1)));
    }
    const wj = p.w - 2 * step * n, hj = p.h - step * n;
    walls.append(rowWall(ATLAS, 'portail', p.x - wj / 2, ZF - 2.98, p.x + wj / 2, ZF - 2.98, 0, hj, { bays: 1 }));
  }
  // gâble du portail de la Vierge (au nord, à gauche pour qui regarde la façade)
  for (const s of [-1, 1]) stone.append(beam(-13.8 + s * 5.3, 10.6, ZF + 0.2, -13.8, 17.0, ZF + 0.2, 0.34, 0.3));
  stone.append(shell(-HF, HF, ZT, ZF - 3, 0, L1, { px: true, nx: true, nz: true }));
  // ── galerie des Rois : 28 statues dans leurs niches ──
  walls.append(rowWall(ATLAS, 'rois', -HF, ZF + 0.12, HF, ZF + 0.12, L1, L2, { bays: 7 }));
  stone.append(shell(-HF, HF, ZT, ZF + 0.12, L1, L2, { px: true, nx: true, nz: true }));
  const front = [-HF, ZF + 0.12, HF, ZF + 0.12];
  stone.append(sweep(corniceProfile(L1 - 0.55, 0.55, 0.45), front)).append(sweep(corniceProfile(L2 - 0.4, 0.4, 0.5), front));
  ajour.append(ribbonUv([-HF, ZF + 0.3, HF, ZF + 0.3], L2, L2 + 1.15, false, 1.05, AJOUR_RAIL[0], AJOUR_RAIL[1]));
  // ── étage de la rose : baies géminées des tours, rose de 9,6 m au centre ──
  for (const s of [-1, 1]) walls.append(rowWall(ATLAS, 'jumelles', s < 0 ? -HF : 6.6, ZS, s < 0 ? -6.6 : HF, ZS, L2, L3, { bays: 1 }));
  stone.append(wallM(-6.6, ZS, 6.6, ZS, L2, L3));
  stone.append(shell(-HF, HF, ZT, ZS, L2, L3, { px: true, nx: true, nz: true, top: true }));
  const rose = roseWindow(4.8, { frame: 0.85, depth: 0.5, seg: lod > 0 ? 36 : 20 });
  b.add(ROSE, rose.glass.translate(0, L2 + 9.6, ZS + 0.04));
  stone.append(rose.frame.translate(0, L2 + 9.6, ZS + 0.04));
  // ── grande galerie ajourée, d'une tour à l'autre et en retour sur les flancs ──
  const around = [-HF - 0.05, ZT, -HF - 0.05, ZS, HF + 0.05, ZS, HF + 0.05, ZT];
  ajour.append(ribbonUv(around, L3, L4 - 0.6, false, 1.2, AJOUR_ARCADE[0], AJOUR_ARCADE[1]));
  stone.append(sweep(corniceProfile(L4 - 0.6, 0.6, 0.5), around));
  stone.append(sweep([0, L3 - 0.3, 0.3, L3 - 0.3, 0.3, L3, 0, L3], around));
  ajour.append(ribbonUv(around, L4, L4 + 1.15, false, 1.05, AJOUR_RAIL[0], AJOUR_RAIL[1]));
  stone.append(box(13.2, 0.35, 0.5, { bottom: true }).translate(0, L4 - 0.6, ZS - 0.25));
  // ── tours ──
  const TH = 21.6, half = 7.2;
  for (const s of [-1, 1]) {
    const cx = s * 13.8, cz = ZF - 1.4 - half;
    stone.append(shell(s < 0 ? -HF : 6.6, s < 0 ? -6.6 : HF, ZT, ZF - 2.1, L3, L4, { px: true, nx: true, pz: true, nz: true, top: true }));
    for (let k = 0; k < 4; k++) {
      b.with(pose(cx, L4, cz, (k * Math.PI) / 2), () => b.with(pose(0, 0, half - 0.5), () => archBlock(b, {
        width: 2 * half, height: TH, depth: 1, seg: lod > 0 ? 10 : 6, back: false, left: false, right: false, top: false, mat: STONE,
        openings: [{ x: -3.3, width: 3, height: 19.4, sill: 1.2, kind: 'ogive' }, { x: 3.3, width: 3, height: 19.4, sill: 1.2, kind: 'ogive' }],
      })));
      // piles d'angle
      const a = (k * Math.PI) / 2 + Math.PI / 4, r = half * Math.SQRT2 - 0.75;
      stone.append(box(2.3, TH, 2.3, { top: false }).translate(cx + Math.sin(a) * r, L4, cz + Math.cos(a) * r));
      // abat-son
      if (lod > 0) {
        for (const ox of [-3.3, 3.3]) for (let q = 0; q < 8; q++) {
          lead.append(box(3.0, 0.1, 0.8, { bottom: true }).rotateX(0.6).translate(ox, 2.2 + q * 1.9, half - 0.75).rotateY((k * Math.PI) / 2).translate(cx, L4, cz));
        }
      }
    }
    dark.append(box(2 * half - 1.9, TH - 0.2, 2 * half - 1.9, { top: false }).translate(cx, L4, cz));
    const ring = rectRing(cx, cz, 2 * half + 0.2, 2 * half + 0.2);
    stone.append(sweep(corniceProfile(L4 + TH - 0.9, 0.9, 0.7), ring, { closed: true }));
    stone.append(sweep([0, L4 + 9.6, 0.25, L4 + 9.6, 0.25, L4 + 9.95, 0, L4 + 9.95], ring, { closed: true }));
    ajour.append(ribbonUv(rectRing(cx, cz, 2 * half + 1.1, 2 * half + 1.1), L4 + TH, L4 + TH + 1.2, true, 1.05, AJOUR_RAIL[0], AJOUR_RAIL[1]));
    lead.append(box(2 * half, 0.25, 2 * half, { bottom: false }).translate(cx, L4 + TH - 0.2, cz));
    // gargouilles d'angle et contreforts latéraux du massif
    for (const zb of [ZF - 3.1, ZF - 9.3, ZF - 15.1]) b.add(STONE, buttress(2.2, 3.5, 44, 3, 0.3), pose(s * HF, 0, zb, (s * Math.PI) / 2));
  }
  // ── contreforts de la façade et leurs statues ──
  for (const u of [-19.9, -6.5, 6.5, 19.9]) {
    stone.append(boxAt(u - 1.05, 0, ZF, u + 1.05, L2, ZF + 0.85));
    stone.append(boxAt(u - 0.95, L2, ZS, u + 0.95, L4 - 0.6, ZS + 0.8));
    stone.append(pinnacle(1.5, 4.2, lod).translate(u, L4 + 0.3, ZS + 0.3));
    if (lod > 0) {
      stone.append(box(1.5, 0.5, 0.9, { bottom: true }).translate(u, 7.4, ZF + 1.1));
      stone.append(figureGeo({ height: 3.3, lod: 0, robe: true, hat: Math.abs(u) < 10 ? 'couronne' : 'aucun' }).body.translate(u, 7.9, ZF + 1.15));
    }
  }
  // pignon du vaisseau entre les tours
  stone.append(gableWall(2 * ND.HN + 0.8, ND.WALL, ND.RIDGE - ND.WALL, 0.8).translate(0, 0, ZT + 0.4));
  b.add(STONE, stone); b.add(ATLAS.key, walls); b.add(AJOUR, ajour); b.add(LEAD, lead); b.add(DARK, dark);
}

/** Façade d'un bras du transept, dans son repère : plan du mur en z = 0, face vers +z, centrée en x. */
function transeptFront(b: Builder, lod: 0 | 1): void {
  const W = ND.TW, hw = W / 2, T = 1.2;
  const stone = new Geo(), walls = new Geo();
  b.with(pose(0, 0, T / 2), () => archBlock(b, {
    width: W, height: 13, depth: T, seg: lod > 0 ? 12 : 8, back: false, top: false, mat: STONE,
    openings: [{ x: 0, width: 5.8, height: 10.4, kind: 'ogive' }],
  }));
  stone.append(archivolt({ x: 0, width: 4.8, height: 9.9, kind: 'ogive' }, 0.5, 0.5, lod > 0 ? 12 : 8, true).translate(0, 0, T - 1.0));
  walls.append(rowWall(ATLAS, 'portail', -2.4, T - 1.02, 2.4, T - 1.02, 0, 9.9, { bays: 1 }));
  for (const s of [-1, 1]) stone.append(beam(s * 4.6, 8.4, T + 0.15, 0, 15.6, T + 0.15, 0.32, 0.28));
  walls.append(rowWall(ATLAS, 'arcature', -hw, T, hw, T, 13, 17.5, { bays: 2 }));
  stone.append(wallM(-hw, T, hw, T, 17.5, ND.WALL));
  for (const s of [-1, 1]) stone.append(wallM(s * hw, s > 0 ? T : 0, s * hw, s > 0 ? 0 : T, 13, ND.WALL));
  const rose = roseWindow(6.4, { frame: 0.75, depth: 0.5, seg: lod > 0 ? 40 : 24 });
  b.add(ROSE, rose.glass.translate(0, 24.6, T + 0.04));
  stone.append(rose.frame.translate(0, 24.6, T + 0.04));
  // pignon percé d'un oculus, pinacle de faîte
  stone.append(gableWall(W, 0, ND.RIDGE - ND.WALL + 0.9, T).translate(0, ND.WALL, T / 2));
  const oc = roseWindow(1.7, { frame: 0.4, depth: 0.3, seg: 20 });
  b.add(ROSE, oc.glass.translate(0, ND.WALL + 3.3, T + 0.04));
  stone.append(oc.frame.translate(0, ND.WALL + 3.3, T + 0.04));
  stone.append(sweep(corniceProfile(ND.WALL - 0.5, 0.5, 0.4), [-hw, T, hw, T]));
  stone.append(pinnacle(1.0, 4, lod).translate(0, ND.RIDGE + 0.6, T / 2));
  // tourelles d'angle à pinacle
  for (const s of [-1, 1]) {
    stone.append(box(2.3, 37, 2.3, { top: false }).translate(s * (hw + 0.2), 0, T - 0.6));
    stone.append(box(2.7, 0.5, 2.7, { bottom: true }).translate(s * (hw + 0.2), 37, T - 0.6));
    stone.append(pinnacle(2.0, 8.2, lod).translate(s * (hw + 0.2), 37.5, T - 0.6));
  }
  b.add(STONE, stone); b.add(ATLAS.key, walls);
}

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { AX, ZF, ZT, ZC, ZA, HB, HN, HT, TW, WALL, RIDGE } = ND;
  const zTa = ZC + TW / 2, zTb = ZC - TW / 2, rise = RIDGE - WALL;
  b.push(siteAlign(site, EMPRISE, BOX));
  const s = naveSpec(lod);
  // ── vaisseau, chœur et chevet ──
  b.with(pose(AX, 0, zTa), () => gothicNave(b, s, ZT - zTa, 7, { skip: [0, 7] }));
  b.with(pose(AX, 0, ZA), () => { gothicNave(b, s, zTb - ZA, 5, { skip: [5] }); gothicApse(b, s, 7); });
  // ── transept : murs, comble d'axe x, toit de la croisée, façades ──
  const stone = new Geo(), walls = new Geo(), lead = new Geo();
  for (const sg of [-1, 1]) {
    const xi = AX + sg * HN, xo = AX + sg * HT;
    const west: [number, number] = sg > 0 ? [xi, xo] : [xo, xi], east: [number, number] = sg > 0 ? [xo, xi] : [xi, xo];
    stone.append(wallM(west[0], zTa, west[1], zTa, 0, 24)).append(wallM(east[0], zTb, east[1], zTb, 0, 24));
    walls.append(rowWall(ATLAS, 'haute', west[0], zTa, west[1], zTa, 24, WALL, { bays: 2 }));
    walls.append(rowWall(ATLAS, 'haute', east[0], zTb, east[1], zTb, 24, WALL, { bays: 2 }));
    stone.append(sweep(corniceProfile(WALL - 0.45, 0.45, 0.32, true), [west[0], zTa, west[1], zTa]));
    stone.append(sweep(corniceProfile(WALL - 0.45, 0.45, 0.32, true), [east[0], zTb, east[1], zTb]));
    b.with(pose(AX + sg * HT, 0, ZC, (sg * Math.PI) / 2), () => transeptFront(b, lod));
  }
  lead.append(gableRoof(TW / 2 + 0.35, -HT, HT, rise).rotateY(Math.PI / 2).translate(AX, WALL, ZC));
  lead.append(gableRoof(HN + 0.35, zTb - 0.5, zTa + 0.5, rise).translate(AX, WALL, 0));
  // ── façade ouest ──
  b.with(pose(AX, 0, 0), () => westFront(b, lod));
  // ── flèche : 96 m au coq ; seize statues de cuivre le long des noues ──
  b.with(pose(AX, RIDGE - 0.9, ZC), () => openworkSpire(b, { radius: 2.9, height: 50, mat: LEAD, matCore: DARK, matFinial: GOLD, lod }));
  const statues = new Geo();
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (let k = 0; k < 4; k++) {
    const e = 2.7 + k * 1.45, y = RIDGE - e * (rise / (HN + 0.35)) + 0.2;
    statues.append(box(0.9, 0.5, 0.9, { bottom: true }).translate(AX + dx * e, y, ZC + dz * e));
    statues.append(figureGeo({ height: 3.3, lod: 0, robe: true, armR: { e: 0.9, a: 0.5 } }).body.rotateY(Math.atan2(dx, dz)).translate(AX + dx * e, y + 0.5, ZC + dz * e));
  }
  b.add(COPPER, statues);
  // ── sacristie (sud) : corps bas à haut comble, relié au chœur ──
  const sx0 = 15, sx1 = 38.4, sz0 = -44.4, sz1 = -15.2, sh = 9.5;
  const sr = rectRing((sx0 + sx1) / 2, (sz0 + sz1) / 2, sx1 - sx0, sz1 - sz0);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; walls.append(rowWall(ATLAS, 'tribune', sr[2 * i], sr[2 * i + 1], sr[2 * j], sr[2 * j + 1], 0, sh)); }
  stone.append(sweep(corniceProfile(sh - 0.45, 0.45, 0.35, true), sr, { closed: true }));
  lead.append(hipRoof((sx1 - sx0) / 2 + 0.3, sz0 - 0.3, sz1 + 0.3, 6.5, 6).translate((sx0 + sx1) / 2, sh, 0));
  stone.append(boxAt(AX + HB - 0.5, 0, -37.5, sx0 + 0.2, 6.2, -21));
  for (const [px, pz] of [[sx0, sz0], [sx1, sz0], [sx0, sz1], [sx1, sz1]]) stone.append(pinnacle(1.1, 5, lod).translate(px, sh, pz));
  b.add(STONE, stone); b.add(ATLAS.key, walls); b.add(LEAD, lead);
  b.pop();
  // ── parvis : dallage clair, point zéro des routes de France, Charlemagne et ses leudes (bronze) ──
  b.add('pierre_grise', boxAt(AX - 32, 0, ZF + 1.2, AX + 42, 0.05, ZF + 54));
  b.add(COPPER, cyl(0.6, 0.6, 0.03, 8).translate(AX, 0.05, ZF + 27));
  b.with(pose(24, 0.05, 92, -Math.PI / 2), () => {
    pedestal(b, { width: 3.4, depth: 5.6, height: 3.6, mat: 'pierre_grise' });
    const g = new Geo();
    g.append(horseGeo({ scale: 1.9, lod, gait: 0.2 }).translate(0, 3.6, -0.2));
    g.append(figureGeo({ height: 3.3, lod, seated: true, hat: 'couronne', armR: { e: 1.2, a: 0.3 }, itemR: 'lance' }).body.translate(0, 5.9, -0.5));
    for (const sd of [-1, 1]) g.append(figureGeo({ height: 3.4, lod: 0, hat: 'casque', armL: { e: 0.4, a: 0.2 }, itemR: 'lance' }).body.translate(sd * 1.25, 3.6, 2.2));
    b.add(COPPER, g);
  });
  return b;
}

export const def: MonumentDef = {
  key: 'notre_dame',
  name: 'Cathédrale Notre-Dame de Paris',
  radius: 132,
  height: ND.SPIRE,
  build(site, quality) { return build(site, quality).build('notre_dame'); },
  buildFar(site) {
    const b = new Builder();
    const { AX, ZF, ZT, ZC, ZA, HF, HB, HN, HT, TW, WALL, RIDGE, L4 } = ND;
    const stone = farMaterial(0xe3d9c0), roof = farMaterial(0x8c9297, 0.3);
    b.push(siteAlign(site, EMPRISE, BOX));
    b.add(stone, boxAt(AX - HF, 0, ZT, AX + HF, L4, ZF));
    for (const s of [-1, 1]) b.add(stone, boxAt(AX + s * 6.6, L4, ZF - 15.8, AX + s * HF, 68.8, ZF - 1.4));
    b.add(stone, boxAt(AX - HB, 0, ZA, AX + HB, 12, ZT, { top: true }));
    b.add(stone, boxAt(AX - 15.2, 12, ZA, AX + 15.2, 22, ZT));
    b.add(stone, boxAt(AX - HN, 22, ZA, AX + HN, WALL, ZT, { top: false }));
    b.add(roof, gableRoof(HN + 0.35, ZA, ZT, RIDGE - WALL).translate(AX, WALL, 0));
    b.add(stone, boxAt(AX - HT - 1, 0, ZC - TW / 2, AX + HT + 1, WALL, ZC + TW / 2, { top: false }));
    b.add(roof, gableRoof(TW / 2, -HT - 1, HT + 1, RIDGE - WALL, true).rotateY(Math.PI / 2).translate(AX, WALL, ZC));
    b.add(stone, cyl(HB, HB, 12, 10, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(AX, 0, ZA));
    b.add(stone, cyl(HN, HN, WALL, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(AX, 0, ZA));
    b.add(roof, cyl(HB, HN, 10, 10, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(AX, 12, ZA));
    b.add(roof, cyl(HN + 0.35, 0, RIDGE - WALL, 8, { start: Math.PI / 2, sweep: Math.PI, flat: true, top: false }).translate(AX, WALL, ZA));
    b.add(roof, cyl(3.4, 2.2, 14, 8, { flat: true, top: false }).translate(AX, RIDGE - 1, ZC));
    b.add(roof, cyl(1.9, 0.05, ND.SPIRE - RIDGE - 13, 8, { flat: true, top: false }).translate(AX, RIDGE + 13, ZC));
    b.add(stone, boxAt(15, 0, -44.4, 38.4, 11, -15.2));
    b.pop();
    return finishFar(b, 'notre_dame');
  },
};
