/* Petit Palais (Charles Girault, Exposition universelle de 1900) — musée des Beaux-Arts de la Ville de Paris.
 * Emprise réelle en trapèze de 130 × 90 m autour d'un jardin semi-circulaire ; façade d'environ 125 m sur
 * l'avenue Winston-Churchill : porche monumental en plein cintre fermé par une grille dorée, en haut d'un grand
 * escalier, coiffé d'un dôme ; ailes à colonnade ionique sur soubassement ; pavillons d'angle à dôme bas.
 * Repère local : façade vers +z. Les murs suivent l'emprise réelle de la carte. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, PALACE_STYLES, addPalace, archBlock, archivolt, balustrade, box, boxAt, columnGeo, cyl, dome, domeProfile, entablature, farMaterial, finishFar,
  pose, prism, quadFit, sculptedGroup, stairs, tileOf, type PalaceStyle,
} from '../kit';
import { designRing, domeRibs, siteAlign } from '../kit/x-edifices';
import { BOX, EMPRISE } from '../collide/petit_palais';

export const PP = {
  /** Plan des ailes, front des pavillons d'angle, front du porche. */
  ZW: 38.5, ZP: 41, ZPORCH: 44.6,
  /** Soubassement, corniche, sommet du dôme du porche. */
  BASE: 4.5, WALL: 14.5, DOME: 31,
} as const;

const TRIM = 'pierre_lisse_claire', ROOF = 'zinc', SLATE = 'ardoise', GOLD = 'or';
const STYLE: PalaceStyle = {
  ...PALACE_STYLES.neoclassique, id: 'petit_palais', bay: 5.2, stone: 0xe2d8be,
  floors: [{ height: 4.5, kind: 'bossages' }, { height: 10, kind: 'noble' }],
  roof: { kind: 'comble', height: 3.6, mat: 'zinc', top: 'zinc', lucarnes: false }, cornice: 0.9, balustrade: true, pavilions: null, plinth: 0.9,
};

/** Jardin intérieur semi-circulaire (côté droit vers la façade, arrondi vers le fond). */
function courtyard(): number[] {
  const out: number[] = [-21, 9, 21, 9];
  for (let i = 1; i < 16; i++) { const a = (i / 16) * Math.PI; out.push(21 * Math.cos(a), 9 - 23 * Math.sin(a)); }
  return out;
}

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { ZW, ZPORCH, BASE, WALL, DOME } = PP;
  b.push(siteAlign(site, EMPRISE, BOX));
  addPalace(b, designRing(EMPRISE, 0.3), STYLE, { matTrim: TRIM, holes: [courtyard()] });
  const trim = new Geo(), dark = new Geo();
  // ── ailes : colonnade ionique sur le soubassement, entre le porche et les pavillons d'angle ──
  const col = columnGeo({ order: 'ionique', height: 8.3, diameter: 0.95, mat: TRIM, flutes: lod > 0 ? 16 : 0, seg: lod > 0 ? 10 : 8 });
  for (const s of [-1, 1]) {
    const x0 = s * 12.2, x1 = s * 47.3, lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    trim.append(boxAt(lo, 0, ZW - 0.2, hi, BASE, ZW + 1.5));
    trim.append(boxAt(lo, BASE + 8.3, ZW - 0.2, hi, WALL, ZW + 1.5, { bottom: true }));
    for (let i = 0; i <= 7; i++) { const x = x0 + ((x1 - x0) * i) / 7; trim.append(col.shaft.clone().translate(x, BASE, ZW + 0.9)).append(col.trim.clone().translate(x, BASE, ZW + 0.9)); }
    entablature(b, [lo, ZW + 1.5, hi, ZW + 1.5], WALL - 1.1, 1.1, 0.7, { mat: TRIM, corniceOnly: true });
    balustrade(b, [lo, ZW + 1.3, hi, ZW + 1.3], { y: WALL, height: 1.05, mat: TRIM, postEvery: 5 });
    // pavillon d'angle : attique et dôme bas d'ardoise
    b.with(pose(s * 55, WALL, 29.5), () => {
      b.add(TRIM, cyl(8.6, 8.6, 2.6, 24, { top: false }));
      b.with(pose(0, 2.6, 0), () => dome(b, { radius: 8.6, height: 5.2, shape: 0.95, mat: SLATE, seg: 24, rows: 5, lantern: { radius: 1.1, height: 2.4, mat: ROOF, matRoof: GOLD, finial: 'boule' } }));
      if (lod > 0) b.add(ROOF, domeRibs(domeProfile(8.6, 5.2, 5, 0.95, 1.16), 8, 0.5, 0.18).translate(0, 2.6, 0));
    });
  }
  // ── porche monumental : escalier, arc en plein cintre, grille dorée, colonnes jumelées, groupes sculptés ──
  const PH = 20.5, PW = 22;
  b.with(pose(0, 0, ZPORCH), () => stairs(b, 17, BASE, 7.2, lod > 0 ? 16 : 8, TRIM));
  for (const s of [-1, 1]) {
    trim.append(boxAt(s * 8.5, 0, ZPORCH, s * 12.4, BASE + 1.2, ZPORCH + 7.4));
    b.with(pose(s * 10.45, BASE + 1.2, ZPORCH + 4.6), () => sculptedGroup(b, TRIM, { width: 3.4, height: 4.6, depth: 2.2, seed: 91 + s, count: lod > 0 ? 3 : 2, winged: false }));
  }
  b.with(pose(0, 0, ZPORCH - 1.6), () => archBlock(b, {
    width: PW, height: PH, depth: 3.2, seg: lod > 0 ? 16 : 10, back: false, mat: TRIM, matVault: 'caissons', coffers: { around: 11, across: 2 },
    openings: [{ x: 0, width: 9.6, height: 16.4, sill: BASE }],
  }));
  trim.append(boxAt(-PW / 2, 0, ZW - 4, PW / 2, PH, ZPORCH - 3.2, { top: false }));
  trim.append(archivolt({ x: 0, width: 9.6, height: 16.4 }, 1.0, 0.35, lod > 0 ? 16 : 10).translate(0, 0, ZPORCH));
  // grille dorée : vantaux et tympan en fer forgé
  const [gw, gh] = tileOf('grille_doree');
  b.add('grille_doree', quadFit(-4.8, BASE, ZPORCH - 2.2, 4.8, BASE, ZPORCH - 2.2, 4.8, BASE + 7.2, ZPORCH - 2.2, -4.8, BASE + 7.2, ZPORCH - 2.2, 0, 0, 6 * gw, gh));
  b.add('grille_doree', quadFit(-4.8, BASE + 7.2, ZPORCH - 2.2, 4.8, BASE + 7.2, ZPORCH - 2.2, 4.8, 16.4, ZPORCH - 2.2, -4.8, 16.4, ZPORCH - 2.2, 0, 0, 6 * gw, gh));
  b.add(GOLD, box(9.8, 0.3, 0.3, { bottom: true }).translate(0, BASE + 7.2, ZPORCH - 2.2));
  dark.append(boxAt(-4.9, BASE, ZPORCH - 3.3, 4.9, 16.6, ZPORCH - 3.1));
  const big = columnGeo({ order: 'ionique', height: 11.2, diameter: 1.3, mat: TRIM, flutes: lod > 0 ? 16 : 0, seg: lod > 0 ? 12 : 8 });
  for (const x of [-9.6, -7.2, 7.2, 9.6]) {
    trim.append(box(1.9, BASE + 1.2, 1.9).translate(x, 0, ZPORCH + 1.0));
    trim.append(big.shaft.clone().translate(x, BASE + 1.2, ZPORCH + 1.0)).append(big.trim.clone().translate(x, BASE + 1.2, ZPORCH + 1.0));
  }
  trim.append(boxAt(-PW / 2 - 0.3, BASE + 12.4, ZPORCH, PW / 2 + 0.3, PH, ZPORCH + 2.0, { bottom: true }));
  entablature(b, [-PW / 2 - 0.3, ZW, -PW / 2 - 0.3, ZPORCH + 2.0, PW / 2 + 0.3, ZPORCH + 2.0, PW / 2 + 0.3, ZW], PH - 1.6, 1.6, 0.9, { mat: TRIM, corniceOnly: true });
  b.with(pose(0, PH, ZPORCH + 0.6), () => sculptedGroup(b, TRIM, { width: 9, height: 4.4, depth: 1.6, seed: 97, count: lod > 0 ? 4 : 2 }));
  // dôme du porche : tambour à œils-de-bœuf, calotte d'ardoise à nervures, lanternon doré
  const dz = ZW - 6;
  b.add(TRIM, cyl(10.2, 10.2, 3.6, 28, { top: false }).translate(0, PH - 1, dz));
  for (let i = 0; i < 10; i++) { const a = ((i + 0.5) / 10) * Math.PI * 2; dark.append(cyl(0.9, 0.9, 0.25, 10, { bottom: true }).rotateX(Math.PI / 2).translate(0, PH + 1.0, 10.15).rotateY(a).translate(0, 0, dz)); }
  b.with(pose(0, PH + 2.6, dz), () => dome(b, {
    radius: 10.2, height: DOME - PH - 2.6 - 4.4, shape: 0.9, mat: SLATE, seg: 28, rows: 6,
    lantern: { radius: 1.7, height: 4.4, mat: ROOF, matRoof: GOLD, bays: 8, finial: 'pointe' },
  }));
  b.add(ROOF, domeRibs(domeProfile(10.2, DOME - PH - 2.6 - 4.4, 6, 0.9, 1.8), lod > 0 ? 12 : 6, 0.6, 0.2).translate(0, PH + 2.6, dz));
  b.add(TRIM, trim); b.add('ombre', dark);
  b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'petit_palais',
  name: 'Petit Palais',
  radius: 80,
  height: PP.DOME,
  build(site, quality) { return build(site, quality).build('petit_palais'); },
  buildFar(site) {
    const b = new Builder();
    const { ZW, ZPORCH, WALL, DOME } = PP;
    const stone = farMaterial(0xe2d8be), roof = farMaterial(0x596069, 0.3);
    b.push(siteAlign(site, EMPRISE, BOX));
    // trapèze de l'emprise (simplifié), porche, dômes
    const ring = [-62, ZW + 2, 62, ZW + 2, 64, 26, 40, -40, -40, -40, -64, 26];
    b.add(stone, prism(ring, 0, WALL));
    b.add(stone, boxAt(-11, 0, ZW - 4, 11, 20.5, ZPORCH));
    b.add(roof, cyl(10.2, 1.6, DOME - 22, 10, { flat: true }).translate(0, 22, ZW - 6));
    for (const s of [-1, 1]) b.add(roof, cyl(8.6, 1, 6.5, 8, { flat: true }).translate(s * 55, WALL, 29.5));
    b.pop();
    return finishFar(b, 'petit_palais');
  },
};
