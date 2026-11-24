/* Opéra Garnier (Charles Garnier, 1861-1875).
 * Cotes réelles : façade principale haute de 32,12 m ; comble de la scène à 55,97 m ; le groupe d'Apollon (7,5 m) porte
 * sa lyre vers 64 m ;
 * emprise de la carte 101 × 148,8 m (façade sud de 57 m, corps de 67 m, pavillons latéraux à rotonde, cage de
 * scène, bâtiment de l'administration au nord). Façade : perron, sept arcades, loggia à seize colonnes
 * corinthiennes jumelées devant des baies à colonnettes de marbre et bustes dorés, attique, deux groupes dorés
 * (L'Harmonie, La Poésie) aux extrémités. Derrière : coupole basse de cuivre vert de la salle, couronnée ; grand
 * pignon de la scène portant Apollon élevant sa lyre entre deux Pégases ; pavillons latéraux à dôme.
 * Repère local : façade sud (place de l'Opéra) vers +z ; pavillon des Abonnés à +x (est), de l'Empereur à −x. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, PALACE_STYLES, addPalace, archBlock, balustrade, box, boxAt, columnGeo, corniceProfile, cyl, dome, domeProfile, entablature, farMaterial,
  figureGeo, finishFar, horseGeo, pose, reliefPanel, sculptedGroup, sphere, stairs, sweep, type PalaceStyle,
} from '../kit';
import { domeRibs, gableRoof, hipRoof, siteAlign, slabXY, wallM } from '../kit/x-edifices';
import { gableWall } from '../kit/x-gothique';
import { rectRing } from '../shape2d';
import { BOX, EMPRISE } from '../collide/opera_garnier';

export const OPERA = {
  /** Plan du fond de la loggia, front de la façade, demi-largeur de la façade et du corps. */
  ZL: 69.2, ZF: 72.9, HF: 28.5, HB: 33.6,
  /** Niveaux de la façade : perron, sol de la loggia, entablement, attique, sommet. */
  PERRON: 1.6, LOGGIA: 11.5, ENT: 24, ATTIC: 26.6, TOP: 32.1,
  /** Sommet des murs du corps, centre et rayon de la coupole, cage de scène (murs, faîtage). */
  WALL: 27, DOME_Z: 9, DOME_R: 18.5, STAGE_WALL: 46.5, STAGE_TOP: 56,
} as const;

const STONE = 'pierre_blonde', TRIM = 'pierre_lisse', COPPER = 'bronze_vert', GOLD = 'or', ZINC = 'zinc';
const STYLE: PalaceStyle = {
  ...PALACE_STYLES.classique, id: 'opera_garnier', bay: 5.2, stone: 0xddd1b7,
  floors: [{ height: 10, kind: 'arcades' }, { height: 12, kind: 'noble' }, { height: 5, kind: 'attique' }],
  roof: { kind: 'terrasse', height: 0.4, top: 'zinc' }, cornice: 1.0, balustrade: true, pavilions: null, plinth: 1.2,
};

/** Contour simplifié et symétrique du corps (sans les ressauts de piles), relevé sur l'emprise réelle. */
function bodyRing(): number[] {
  const { ZL, HF, HB } = OPERA;
  const half: [number, number][] = [
    [HF, ZL], [HF, 65], [HB, 65], [HB, 21.5], [45.2, 21.5], [45.2, -10.2], [HB, -10.2], [HB, -55.1], [27.8, -55.1], [27.8, -63.5],
    [20.6, -74.2], [9.4, -74.2], [9.4, -64.8],
  ];
  const out: number[] = [];
  for (const [x, z] of half) out.push(x, z);
  for (let i = half.length - 1; i >= 0; i--) out.push(-half[i][0], half[i][1]);
  return out;
}

/** Façade principale. Repère : fond de la loggia en z = 0, façade vers +z. */
function facade(b: Builder, lod: 0 | 1): void {
  const { HF, PERRON, LOGGIA, ENT, ATTIC, TOP } = OPERA;
  const D = OPERA.ZF - OPERA.ZL, pitch = (2 * HF) / 7.5, seg = lod > 0 ? 12 : 8;
  const trim = new Geo(), gold = new Geo(), marble = new Geo();
  // perron
  b.add(TRIM, boxAt(-HF - 0.6, 0, 0, HF + 0.6, PERRON, D));
  b.with(pose(0, 0, D), () => stairs(b, 2 * HF - 4, PERRON, 2.6, lod > 0 ? 10 : 5, TRIM));
  // rez-de-chaussée : sept arcades
  const xs: number[] = [];
  for (let i = 0; i < 7; i++) xs.push((i - 3) * pitch);
  b.with(pose(0, PERRON, D - 0.9), () => archBlock(b, {
    width: 2 * HF, height: LOGGIA - PERRON, depth: 1.8, seg, top: false, mat: STONE, matVault: TRIM,
    openings: xs.map((x) => ({ x, width: 4.4, height: 8.1 })),
  }));
  b.add('ombre', wallM(-HF + 1, D - 2.6, HF - 1, D - 2.6, PERRON, LOGGIA - 0.6));
  trim.append(sweep(corniceProfile(LOGGIA - 0.7, 0.7, 0.5), [-HF, 0, -HF, D, HF, D, HF, 0]));
  // groupes sculptés des avant-corps (La Poésie, La Musique instrumentale, La Danse, Le Drame lyrique) et statues des piles
  for (let i = 0; i <= 7; i++) {
    const x = (i - 3.5) * pitch, end = i <= 1 || i >= 6;
    b.with(pose(x, PERRON, D + 0.05), () => {
      b.add(TRIM, box(end ? 3.4 : 1.8, 1.5, 1.5).translate(0, 0, 0.75));
      if (end) b.with(pose(0, 1.5, 0), () => sculptedGroup(b, TRIM, { width: 3.2, height: 5.4, depth: 1.4, seed: 40 + i, count: lod > 0 ? 3 : 2 }));
      else b.add(TRIM, figureGeo({ height: 3.4, lod: 0, robe: true, armR: { e: 0.9, a: 0.6 } }).body.translate(0, 1.5, 0.75));
    });
  }
  // loggia : plancher, balustrade, seize colonnes corinthiennes jumelées sur piédestaux
  b.add(TRIM, boxAt(-HF, LOGGIA - 0.4, 0, HF, LOGGIA, D));
  const colH = ENT - LOGGIA - 1.2;
  const col = columnGeo({ order: 'corinthien', height: colH, diameter: 1.2, mat: TRIM, flutes: lod > 0 ? 16 : 0, seg: lod > 0 ? 12 : 8 });
  const small = columnGeo({ order: 'ionique', height: 6.4, diameter: 0.62, mat: 'marbre_rose', flutes: 0, seg: 8 });
  for (let i = 0; i <= 7; i++) {
    const x = (i - 3.5) * pitch;
    trim.append(box(3.3, 1.2, 1.7).translate(x, LOGGIA, D - 0.85));
    for (const s of [-1, 1]) { trim.append(col.shaft.clone().translate(x + s * 0.9, LOGGIA + 1.2, D - 0.85)); trim.append(col.trim.clone().translate(x + s * 0.9, LOGGIA + 1.2, D - 0.85)); }
    if (i < 7) {
      const xm = x + pitch / 2;
      balustrade(b, [xm - pitch / 2 + 1.65, D - 0.5, xm + pitch / 2 - 1.65, D - 0.5], { y: LOGGIA, height: 1.1, mat: TRIM, postEvery: 0 });
      // baie du foyer : colonnettes de marbre rose, linteau, œil-de-bœuf à buste doré
      for (const s of [-1, 1]) { marble.append(small.shaft.clone().translate(xm + s * 1.9, LOGGIA, 0.55)); trim.append(small.trim.clone().translate(xm + s * 1.9, LOGGIA, 0.55)); }
      trim.append(box(4.8, 0.7, 1.0, { bottom: true }).translate(xm, LOGGIA + 6.4, 0.5));
      gold.append(cyl(0.78, 0.78, 0.25, 12, { bottom: true }).rotateX(Math.PI / 2).translate(xm, LOGGIA + 9.2, 0.1));
      gold.append(sphere(0.42, 8, 5).translate(xm, LOGGIA + 9.3, 0.5)).append(box(0.9, 0.6, 0.4, { bottom: true }).translate(xm, LOGGIA + 8.5, 0.45));
    }
  }
  b.add(STONE, wallM(-HF, 0.2, HF, 0.2, LOGGIA, ENT));
  const glassG = new Geo();
  for (const x of xs) glassG.append(wallM(x - 1.55, 0.26, x + 1.55, 0.26, LOGGIA + 0.4, LOGGIA + 6.3));
  b.add('ombre', glassG);
  // entablement, attique à bas-reliefs et masques dorés, corniche
  b.add(STONE, boxAt(-HF - 0.2, ENT, -1.2, HF + 0.2, ATTIC, D - 0.1, { bottom: true }));
  entablature(b, [-HF - 0.2, -1.2, -HF - 0.2, D - 0.1, HF + 0.2, D - 0.1, HF + 0.2, -1.2], ENT, ATTIC - ENT, 0.9, { mat: TRIM });
  b.add(STONE, boxAt(-HF - 0.2, ATTIC, -1.2, HF + 0.2, TOP - 0.9, D - 0.5));
  trim.append(sweep(corniceProfile(TOP - 0.9, 0.9, 0.8), [-HF - 0.2, -1.2, -HF - 0.2, D - 0.5, HF + 0.2, D - 0.5, HF + 0.2, -1.2]));
  trim.append(boxAt(-HF - 0.2, TOP - 0.2, -1.2, HF + 0.2, TOP, D - 0.5, { bottom: false }));
  for (let i = 0; i < 7; i++) {
    b.with(pose(xs[i], ATTIC + 0.9, D - 0.5), () => reliefPanel(b, { width: pitch - 2.6, height: 2.6, mat: 'relief_pierre', frame: TRIM, shift: i * 1.7 }));
    gold.append(cyl(0.55, 0.55, 0.3, 10, { bottom: true }).rotateX(Math.PI / 2).translate(xs[i] + pitch / 2, ATTIC + 2.2, D - 0.45));
    if (i === 0) gold.append(cyl(0.55, 0.55, 0.3, 10, { bottom: true }).rotateX(Math.PI / 2).translate(xs[i] - pitch / 2, ATTIC + 2.2, D - 0.45));
  }
  gold.append(boxAt(-HF - 0.2, TOP, D - 1.0, HF + 0.2, TOP + 0.35, D - 0.75, { bottom: false }));
  // avant-corps d'extrémité : fronton cintré, puis groupes dorés (L'Harmonie à l'ouest, La Poésie à l'est)
  for (const s of [-1, 1]) {
    const pts: number[] = [];
    for (let k = 0; k <= 10; k++) { const a = Math.PI * (1 - k / 10); pts.push(3.6 * Math.cos(a), 1.5 * Math.sin(a)); }
    trim.append(slabXY(pts, 0.7).translate(s * 3 * pitch, ATTIC - 0.1, D + 0.2));
    b.with(pose(s * 3 * pitch, TOP, D - 2.2), () => {
      b.add(TRIM, box(4.6, 1.3, 3));
      const g = new Geo();
      const fg = figureGeo({ height: 5.6, lod, robe: true, wings: 1.25, armR: { e: 2.6, a: 0.4 }, armL: { e: 2.2, a: 0.6 }, itemR: 'couronne', itemScale: 1.4 });
      g.append(fg.body.translate(0, 1.3, 0)).append(fg.items.translate(0, 1.3, 0));
      for (const t of [-1, 1]) g.append(figureGeo({ height: 3.3, lod: 0, robe: true, seated: true, armR: { e: 1.1, a: 0.5 } }).body.rotateY(t * 0.5).translate(t * 1.5, 1.3, 0.5));
      b.add(GOLD, g);
    });
  }
  b.add(TRIM, trim); b.add(GOLD, gold); b.add('marbre_rose', marble);
}

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { ZL, HF, WALL, DOME_Z, DOME_R, STAGE_WALL, STAGE_TOP } = OPERA;
  b.push(siteAlign(site, EMPRISE, BOX));
  addPalace(b, bodyRing(), STYLE, { matTrim: TRIM });
  b.with(pose(0, 0, ZL), () => facade(b, lod));
  const stone = new Geo(), zinc = new Geo(), copper = new Geo();
  // ── foyer et grand escalier : combles en pavillon derrière l'attique ──
  stone.append(boxAt(-HF, WALL, 56, HF, OPERA.TOP - 0.9, ZL - 1.2, { top: false }));
  zinc.append(hipRoof(HF, 56, ZL - 1.2, 4.2, 9).translate(0, OPERA.TOP - 0.9, 0));
  stone.append(boxAt(-21, WALL, 30, 21, 33, 56, { top: false }));
  zinc.append(hipRoof(21, 30, 56, 6.5, 11).translate(0, 33, 0));
  // ── salle : tambour à œils-de-bœuf, coupole de cuivre vert, couronne ──
  stone.append(cyl(DOME_R + 0.6, DOME_R + 0.6, 7.5, 40, { top: false }).translate(0, WALL, DOME_Z));
  b.add(TRIM, sweep(corniceProfile(WALL + 6.6, 0.9, 0.8, true), ringOf(0, DOME_Z, DOME_R + 0.6, 40), { closed: true }));
  b.with(pose(0, WALL + 7.5, DOME_Z), () => dome(b, {
    radius: DOME_R + 0.4, height: 9.6, shape: 0.82, mat: COPPER, seg: lod > 0 ? 40 : 24, rows: 7,
    lantern: { radius: 3.4, height: 6.2, mat: COPPER, matRoof: GOLD, bays: 12, finial: 'pointe' },
  }));
  copper.append(domeRibs(domeProfile(DOME_R + 0.4, 9.6, 7, 0.82, 3.6), lod > 0 ? 16 : 8, 1.5, 0.3).translate(0, WALL + 7.5, DOME_Z));
  const eyes = new Geo();
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; eyes.append(cyl(1.25, 1.25, 0.3, 10, { bottom: true }).rotateX(Math.PI / 2).translate(0, WALL + 3.6, DOME_R + 0.55).rotateY(a).translate(0, 0, DOME_Z)); }
  // ── cage de scène : murs, comble de cuivre, grand pignon sud ──
  const sw = 26, sz0 = -53, sz1 = -9.5;
  stone.append(boxAt(-sw, WALL, sz0, sw, STAGE_WALL, sz1, { top: false }));
  b.add(TRIM, sweep(corniceProfile(STAGE_WALL - 1.2, 1.2, 1.0), rectRing(0, (sz0 + sz1) / 2, 2 * sw, sz1 - sz0), { closed: true }));
  copper.append(gableRoof(sw + 0.8, sz0 - 0.4, sz1 - 0.2, STAGE_TOP - STAGE_WALL).translate(0, STAGE_WALL, 0));
  for (const z of [sz1 - 0.3, sz0 + 0.3]) stone.append(gableWall(2 * sw, 0, STAGE_TOP - STAGE_WALL - 0.4, 1.2).translate(0, STAGE_WALL, z));
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) stone.append(box(1.6, STAGE_WALL - WALL - 1.2, 0.5).translate(s * (4 + k * 4.2), WALL, sz1 + 0.25));
  // Apollon élevant sa lyre, la Poésie et la Musique ; Pégases aux angles du pignon
  b.with(pose(0, STAGE_TOP, sz1 - 0.3), () => {
    b.add(TRIM, box(4.2, 0.9, 2.2));
    const g = new Geo(), ap = figureGeo({ height: 5.2, lod, armR: { e: 2.9, a: 0.25 }, armL: { e: 2.9, a: 0.25 }, robe: false });
    g.append(ap.body.translate(0, 0.9, 0));
    for (const t of [-1, 1]) g.append(figureGeo({ height: 3.0, lod: 0, robe: true, seated: true }).body.rotateY(t * 0.6).translate(t * 1.4, 0.9, 0.3));
    b.add('bronze', g);
    const lyre = new Geo();
    lyre.append(box(0.2, 1.9, 0.2).translate(-0.65, 6.2, 0.2)).append(box(0.2, 1.9, 0.2).translate(0.65, 6.2, 0.2));
    lyre.append(box(1.7, 0.2, 0.2).translate(0, 7.9, 0.2)).append(box(1.2, 0.28, 0.28).translate(0, 6.05, 0.2));
    b.add(GOLD, lyre);
  });
  for (const s of [-1, 1]) {
    const pg = horseGeo({ scale: 2.3, rear: 0.55, lod, gait: 0.1 });
    for (const t of [-1, 1]) pg.face3(t * 0.6, 3.6, 0, t * 4.2, 6.6, -1.2, t * 2.2, 3.2, -1.6).face3(t * 0.6, 3.6, 0, t * 2.2, 3.2, -1.6, t * 4.2, 6.6, -1.2);
    b.add('bronze', pg.rotateY(s * 0.5).translate(s * (sw - 2.5), STAGE_WALL + 0.9, sz1 - 0.2));
    stone.append(box(4, 0.9, 5.2).translate(s * (sw - 2.5), STAGE_WALL, sz1 - 0.4));
  }
  // ── pavillons latéraux : rotonde à dôme de cuivre (Abonnés à l'est, Empereur à l'ouest) ──
  for (const s of [-1, 1]) {
    const px = s * 41.5, pz = 5.6;
    stone.append(cyl(9.2, 9.2, WALL - 3, 24, { top: false }).translate(px, 0, pz));
    b.add(TRIM, sweep(corniceProfile(WALL - 4, 1.0, 0.8, true), ringOf(px, pz, 9.2, 24), { closed: true }));
    b.add(TRIM, sweep([0, 9.6, 0.3, 9.6, 0.3, 10.2, 0, 10.2], ringOf(px, pz, 9.2, 24), { closed: true }));
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      if (Math.sin(a) * s < -0.55) continue;
      eyes.append(box(2.2, 7.2, 0.2, { bottom: true }).translate(0, 1.4, 9.2).rotateY(a).translate(px, 0, pz));
      eyes.append(box(2.0, 8.2, 0.2, { bottom: true }).translate(0, 11.4, 9.2).rotateY(a).translate(px, 0, pz));
      stone.append(box(0.9, WALL - 4, 0.5, { top: false }).translate(0, 0, 9.2).rotateY(a + Math.PI / 12).translate(px, 0, pz));
    }
    b.with(pose(px, WALL - 3, pz), () => dome(b, {
      radius: 9.4, height: 6.6, shape: 0.9, mat: COPPER, seg: 24, rows: 6,
      lantern: { radius: 1.6, height: 3.4, mat: COPPER, matRoof: GOLD, finial: s < 0 ? 'boule' : 'pointe' },
    }));
    copper.append(domeRibs(domeProfile(9.4, 6.6, 6, 0.9, 1.7), lod > 0 ? 12 : 6, 0.9, 0.2).translate(px, WALL - 3, pz));
  }
  // rampes carrossables du pavillon de l'Empereur (ouest) : deux rampes en pente adossées à la rotonde, parapet plein
  for (const t of [-1, 1]) {
    const ramp = slabXY([0, 0, 9.5, 0, 9.5, 3.4, 8.6, 3.4, 0, 0.5], 2.6).rotateY(t > 0 ? Math.PI / 2 : -Math.PI / 2);
    stone.append(ramp.translate(-49.2, 0, 5.6 + t * (9.4 + 9.5)));
  }
  stone.append(boxAt(-52, 0, 5.6 - 9.4, -47.6, 3.4, 5.6 + 9.4));
  // ── administration (nord) : comble brisé d'ardoise ──
  zinc.append(hipRoof(26.5, -74, -56, 6.5, 8).translate(0, WALL, 0));
  b.add(STONE, stone); b.add(ZINC, zinc); b.add(COPPER, copper); b.add('ombre', eyes);
  b.pop();
  return b;
}

/** Anneau régulier antihoraire (convention de la carte) de rayon r. */
function ringOf(cx: number, cz: number, r: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(cx + r * Math.cos(a), cz - r * Math.sin(a)); }
  return out;
}

export const def: MonumentDef = {
  key: 'opera_garnier',
  name: 'Opéra Garnier',
  radius: 92,
  height: 64,
  build(site, quality) { return build(site, quality).build('opera_garnier'); },
  buildFar(site) {
    const b = new Builder();
    const { HF, HB, WALL, DOME_Z, DOME_R, STAGE_WALL, STAGE_TOP, ZF } = OPERA;
    const stone = farMaterial(0xddd1b7), copper = farMaterial(0x7fb09c, 0.6), roof = farMaterial(0x8e969d, 0.3), gold = farMaterial(0xd9b23a, 1.0, 0xffd27a);
    b.push(siteAlign(site, EMPRISE, BOX));
    b.add(stone, boxAt(-HB, 0, -55, HB, WALL, 65, { top: false }));
    b.add(roof, boxAt(-HB, WALL - 0.1, -55, HB, WALL, 65, { bottom: false }));
    b.add(stone, boxAt(-HF, 0, 65, HF, OPERA.TOP, ZF));
    b.add(stone, boxAt(-27.8, 0, -74.2, 27.8, WALL, -55));
    for (const s of [-1, 1]) {
      b.add(stone, cyl(9.2, 9.2, WALL - 3, 8, { flat: true, top: false }).translate(s * 41.5, 0, 5.6));
      b.add(copper, cyl(9.4, 1.5, 6.5, 8, { flat: true }).translate(s * 41.5, WALL - 3, 5.6));
      b.add(gold, box(3, 6, 2.4).translate(s * 22.8, OPERA.TOP, ZF - 2));
    }
    b.add(stone, cyl(DOME_R + 0.6, DOME_R + 0.6, 7.5, 12, { flat: true, top: false }).translate(0, WALL, DOME_Z));
    b.add(copper, cyl(DOME_R + 0.4, DOME_R * 0.72, 5.5, 12, { flat: true, top: false }).translate(0, WALL + 7.5, DOME_Z));
    b.add(copper, cyl(DOME_R * 0.72, 3.4, 4.1, 12, { flat: true }).translate(0, WALL + 13, DOME_Z));
    b.add(gold, cyl(3.2, 0.4, 6, 6, { flat: true }).translate(0, WALL + 17.1, DOME_Z));
    b.add(stone, boxAt(-26, WALL, -53, 26, STAGE_WALL, -9.5, { top: false }));
    b.add(copper, gableRoof(26.8, -53.4, -9.3, STAGE_TOP - STAGE_WALL, true).translate(0, STAGE_WALL, 0));
    b.add(gold, box(1.6, 4.5, 1).translate(0, STAGE_TOP, -9.6));
    b.pop();
    return finishFar(b, 'opera_garnier');
  },
};
