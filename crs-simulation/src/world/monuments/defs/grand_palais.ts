/* Grand Palais (Deglane, Louvet, Thomas, Girault ; Exposition universelle de 1900).
 * Cotes réelles : emprise 240 × 159 m en H ; nef vitrée de 200 × 50 m, 35 m sous charpente, 45 m sous le dôme,
 * 60 m au sommet de la hampe ; charpente métallique vert réséda ; façade de pierre à colonnade ionique sur
 * l'avenue Winston-Churchill entre un porche central et deux pavillons d'angle portant les quadriges de cuivre de
 * Récipon (vers 40 m). Au revers, le palais d'Antin (Palais de la découverte) sur l'avenue Franklin-D.-Roosevelt.
 * Les deux avenues n'étant pas parallèles, le corps principal est tourné de 5° par rapport au repère du repère de
 * carte : le modèle est dessiné dans le repère de la grande façade (TILT), les murs suivent l'emprise réelle. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, PALACE_STYLES, addPalace, archBlock, balustrade, box, boxAt, columnGeo, cyl, dome, domeProfile, entablature, farMaterial, figureGeo,
  finishFar, lathe, polygon, pose, quadriga, sculptedGroup, stairs, type PalaceStyle,
} from '../kit';
import { barrelVault, designRing, domeRibs, glazingMaterial, plainMaterial, siteAlign, vaultEnd } from '../kit/x-edifices';
import { transformRing } from '../shape2d';
import { BOX, EMPRISE } from '../collide/grand_palais';

export const GP = {
  /** Rotation du corps principal par rapport au repère du monument (rad) : la grande façade regarde +z du repère tourné. */
  TILT: 0.08766,
  /** Dans le repère tourné : plan de la grande façade, revers du corps principal, axe de la nef. */
  ZF: 69.5, ZB: -22, ZN: 23.75,
  /** Demi-portée et flèche de la nef, demi-longueur de sa partie droite. */
  NAVE_HALF: 24, NAVE_RISE: 15, NAVE_LEN: 88,
  /** Corniche de pierre, naissance des verrières, sommet du dôme, sommet de la hampe. */
  WALL: 18.5, SPRING: 20, DOME: 45, MAST: 60,
} as const;

const TRIM = 'pierre_lisse_claire', COPPER = 'bronze_vert', ZINC = 'zinc';
const GLASS = glazingMaterial('verriere_grand_palais', { frame: 0xa9bfa6, glass: 0x9fb6b8, tile: [3, 3], panes: [4, 4], bar: 0.07, minor: 0.016, night: 1.5 });
const STEEL = plainMaterial('acier_reseda', 0xa9bfa6, { roughness: 0.55, metalness: 0.3, night: 0.9 });
const STYLE: PalaceStyle = {
  ...PALACE_STYLES.neoclassique, id: 'grand_palais', bay: 5.6, stone: 0xe6dcc4,
  floors: [{ height: 6.5, kind: 'bossages' }, { height: 12, kind: 'noble' }],
  roof: { kind: 'terrasse', height: 0.4, top: 'zinc' }, cornice: 1.1, balustrade: true, pavilions: null, plinth: 1.0,
};

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { TILT, ZF, ZN, NAVE_HALF, NAVE_RISE, NAVE_LEN, WALL, SPRING, DOME, MAST } = GP;
  // ── enveloppe de pierre sur l'emprise réelle (ramenée dans le repère de la grande façade), couverture basse ──
  const raw = transformRing(designRing(EMPRISE, 0.3), 0, 0, TILT), ring: number[] = [];
  for (let i = 0; i < raw.length; i += 2) if (!(raw[i + 1] > 75 && Math.abs(raw[i]) < 32)) ring.push(raw[i], raw[i + 1]);
  b.push(siteAlign(site, EMPRISE, BOX));
  b.push(pose(0, 0, 0, -TILT));
  addPalace(b, ring, STYLE, { matTrim: TRIM });
  b.add(ZINC, polygon(ring, WALL + 0.25));
  const trim = new Geo(), glass = new Geo(), steel = new Geo(), zinc = new Geo();
  // ── colonnade ionique de la grande façade, de part et d'autre du porche central ──
  const col = columnGeo({ order: 'ionique', height: 11.4, diameter: 1.25, mat: TRIM, flutes: lod > 0 ? 16 : 0, seg: lod > 0 ? 12 : 8 });
  for (const s of [-1, 1]) {
    const x0 = s * 35.5, x1 = s * 93;
    trim.append(boxAt(Math.min(x0, x1), 0, ZF, Math.max(x0, x1), 6.5, ZF + 2.3));
    trim.append(boxAt(Math.min(x0, x1), 6.5 + 11.4, ZF, Math.max(x0, x1), WALL + 1.6, ZF + 2.3, { bottom: true }));
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      trim.append(col.shaft.clone().translate(x, 6.5, ZF + 1.45)).append(col.trim.clone().translate(x, 6.5, ZF + 1.45));
    }
    entablature(b, s > 0 ? [x0, ZF + 2.3, x1, ZF + 2.3] : [x1, ZF + 2.3, x0, ZF + 2.3], WALL - 0.4, 2.0, 0.8, { mat: TRIM, corniceOnly: true });
    balustrade(b, s > 0 ? [x0, ZF + 2.0, x1, ZF + 2.0] : [x1, ZF + 2.0, x0, ZF + 2.0], { y: WALL + 1.6, height: 1.1, mat: TRIM, postEvery: 4.8 });
  }
  // ── entrée centrale (relevée sur l'emprise) : porche en retrait à trois arcades entre deux avant-corps, chacun précédé
  //    de deux colonnes sur piédestal ; attique, groupes sculptés, perron ──
  const zc = 71.6, zp = 74.6, top = 24.7;
  b.add(TRIM, boxAt(-16.5, 0, zc, 16.6, 3.2, zp));
  b.with(pose(0, 0, zp), () => stairs(b, 31, 3.2, 5.6, lod > 0 ? 16 : 8, TRIM));
  b.with(pose(0, 3.2, (zc + zp) / 2 + 0.05), () => archBlock(b, {
    width: 33.1, height: WALL + 1.2 - 3.2, depth: zp - zc - 0.1, seg: lod > 0 ? 14 : 8, back: false, left: false, right: false, mat: TRIM, matVault: 'caissons', coffers: { around: 9, across: 2 },
    openings: [{ x: 0, width: 7.6, height: 14.6 }, { x: -10.6, width: 6.6, height: 13.4 }, { x: 10.6, width: 6.6, height: 13.4 }],
  }));
  b.add('ombre', boxAt(-15.4, 3.2, zc + 0.08, 15.4, 18.4, zc + 0.2));
  b.add(TRIM, boxAt(-31, WALL, ZF, 33.6, top, zp + 0.1));
  entablature(b, [-31.2, ZF, -31.2, zp + 0.2, 33.8, zp + 0.2, 33.8, ZF], top - 2.2, 2.2, 1.1, { mat: TRIM, corniceOnly: true });
  const big = columnGeo({ order: 'ionique', height: WALL - 4.9, diameter: 1.55, mat: TRIM, flutes: lod > 0 ? 16 : 0, seg: lod > 0 ? 12 : 8 });
  const mid = columnGeo({ order: 'ionique', height: WALL - 3.6, diameter: 1.2, mat: TRIM, flutes: lod > 0 ? 16 : 0, seg: lod > 0 ? 12 : 8 });
  for (const x of [-5.3, 5.3, -15.6, 15.7]) trim.append(mid.shaft.clone().translate(x, 3.2, zp + 0.5)).append(mid.trim.clone().translate(x, 3.2, zp + 0.5));
  for (const cx of [-23.6, 26.2]) {
    trim.append(boxAt(cx - 3, 0, zp, cx + 3, 5.5, zp + 2.8));
    for (const dx of [-1.7, 1.7]) trim.append(big.shaft.clone().translate(cx + dx, 5.5, zp + 1.5)).append(big.trim.clone().translate(cx + dx, 5.5, zp + 1.5));
    trim.append(boxAt(cx - 3.2, WALL + 0.6, zp, cx + 3.2, WALL + 2.8, zp + 2.9, { bottom: true }));
    b.with(pose(cx, WALL + 2.8, zp + 0.7), () => sculptedGroup(b, TRIM, { width: 5, height: 5.4, depth: 1.9, seed: 70 + cx, count: lod > 0 ? 3 : 2 }));
    b.with(pose(cx, top, ZF + 2.4), () => sculptedGroup(b, TRIM, { width: 5.4, height: 5.2, depth: 2, seed: 80 + cx, count: lod > 0 ? 3 : 2, winged: false }));
  }
  b.with(pose(1.3, top, ZF + 2.6), () => sculptedGroup(b, TRIM, { width: 7, height: 4.6, depth: 2, seed: 77, count: lod > 0 ? 4 : 2 }));
  // ── pavillons d'angle et quadriges de Récipon ──
  for (const s of [-1, 1]) {
    b.with(pose(s * 104, 0, 60.5), () => {
      b.add(TRIM, box(15, 26, 15, { top: false }).translate(0, 0, 0));
      b.add(ZINC, box(15.6, 0.5, 15.6, { bottom: true }).translate(0, 26, 0));
      entablature(b, [-7.5, -7.5, -7.5, 7.5, 7.5, 7.5, 7.5, -7.5], 24, 2, 1.0, { mat: TRIM, corniceOnly: true, closed: true });
      b.add(TRIM, box(9, 3.2, 7, { bottom: true }).translate(0, 26.5, 0));
      b.with(pose(0, 29.7, 0, s * 0.6), () => quadriga(b, COPPER, { scale: 2.5, lod, driver: { wings: 1.2 } }));
      b.with(pose(0, 0, 7.5), () => b.add('ombre', box(6.4, 13, 0.3).translate(0, 6.6, 0)));
    });
  }
  // ── nef vitrée : berceau d'axe x, croupes rondes, fermes apparentes ──
  const nave = barrelVault(NAVE_HALF, NAVE_RISE, -NAVE_LEN, NAVE_LEN, lod > 0 ? 14 : 8).rotateY(Math.PI / 2).translate(0, SPRING, ZN);
  glass.append(nave);
  const prof = domeProfile(NAVE_HALF, NAVE_RISE, lod > 0 ? 7 : 4);
  for (const s of [-1, 1]) glass.append(lathe(prof, lod > 0 ? 14 : 8, { smooth: true, start: s > 0 ? 0 : Math.PI, sweep: Math.PI }).translate(s * NAVE_LEN, SPRING, ZN));
  // paddock (nef transversale vers le palais d'Antin) et sa verrière d'about
  glass.append(barrelVault(19, 12, ZN - 62, ZN - 6, lod > 0 ? 12 : 6).translate(0, SPRING, 0));
  glass.append(vaultEnd(19, 12, lod > 0 ? 12 : 6).rotateY(Math.PI).translate(0, SPRING, ZN - 62));
  // fermes et sablières
  const ribs = lod > 0 ? 17 : 9;
  for (let i = 0; i < ribs; i++) {
    const x = -NAVE_LEN + (i / (ribs - 1)) * 2 * NAVE_LEN;
    if (Math.abs(x) < 20) continue;
    steel.append(barrelVault(NAVE_HALF + 0.25, NAVE_RISE + 0.25, -0.35, 0.35, lod > 0 ? 14 : 8).rotateY(Math.PI / 2).translate(x, SPRING, ZN));
  }
  steel.append(boxAt(-NAVE_LEN, SPRING - 1.2, ZN - NAVE_HALF - 0.6, NAVE_LEN, SPRING + 0.3, ZN - NAVE_HALF + 0.4));
  steel.append(boxAt(-NAVE_LEN, SPRING - 1.2, ZN + NAVE_HALF - 0.4, NAVE_LEN, SPRING + 0.3, ZN + NAVE_HALF + 0.6));
  steel.append(box(2 * NAVE_LEN, 0.6, 1.2, { bottom: true }).translate(0, SPRING + NAVE_RISE - 0.1, ZN));
  // ── dôme surbaissé de la croisée, lanterneau, hampe ──
  const dr = 23.5, dBase = SPRING + NAVE_RISE - 4.2;
  steel.append(cyl(dr + 0.6, dr + 0.6, 1.6, lod > 0 ? 32 : 16, { top: false }).translate(0, dBase - 1.6, ZN));
  b.with(pose(0, dBase, ZN), () => dome(b, {
    radius: dr, height: DOME - dBase, shape: 0.9, mat: GLASS, seg: lod > 0 ? 32 : 16, rows: 6,
    lantern: { radius: 3.2, height: 6, mat: STEEL, matRoof: ZINC, bays: 10, finial: 'pointe' },
  }));
  steel.append(domeRibs(domeProfile(dr, DOME - dBase, 6, 0.9, 3.4), lod > 0 ? 24 : 12, 0.7, 0.3).translate(0, dBase, ZN));
  steel.append(cyl(0.16, 0.08, MAST - DOME - 5.5, 5).translate(0, DOME + 5.5, ZN));
  // ── palais d'Antin : rotonde vitrée ──
  b.with(pose(0.5, SPRING, ZN - 82), () => dome(b, { radius: 13, height: 8, shape: 1, mat: GLASS, seg: 24, rows: 5 }));
  steel.append(domeRibs(domeProfile(13, 8, 5), lod > 0 ? 16 : 8, 0.5, 0.25).translate(0.5, SPRING, ZN - 82));
  steel.append(cyl(13.5, 13.5, 1.4, 24, { top: false }).translate(0.5, SPRING - 1.4, ZN - 82));
  b.add(TRIM, trim); b.add(GLASS, glass); b.add(STEEL, steel); b.add(ZINC, zinc);
  // statues au droit du porche (lod haut)
  if (lod > 0) for (const x of [-17.6, 17.7]) b.add(TRIM, figureGeo({ height: 4, lod: 0, robe: true, seated: true }).body.translate(x, 3.4, zp + 3.6));
  b.pop(); b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'grand_palais',
  name: 'Grand Palais',
  radius: 136,
  height: GP.MAST,
  build(site, quality) { return build(site, quality).build('grand_palais'); },
  buildFar(site) {
    const b = new Builder();
    const { TILT, ZF, ZB, ZN, NAVE_HALF, NAVE_RISE, NAVE_LEN, WALL, SPRING, DOME, MAST } = GP;
    const stone = farMaterial(0xe6dcc4), glass = farMaterial(0xa9bfb4, 1.2, 0xffe2b0), copper = farMaterial(0x7fb09c, 0.6);
    b.push(siteAlign(site, EMPRISE, BOX));
    b.push(pose(0, 0, 0, -TILT));
    b.add(stone, boxAt(-113, 0, ZB, 113, WALL, ZF));
    b.add(stone, boxAt(-50, 0, -74, 52, WALL, ZB));
    b.add(stone, boxAt(-31, 0, ZF, 33.6, 24.7, ZF + 5));
    b.add(glass, barrelVault(NAVE_HALF, NAVE_RISE, -NAVE_LEN, NAVE_LEN, 6).rotateY(Math.PI / 2).translate(0, SPRING, ZN));
    for (const s of [-1, 1]) {
      b.add(glass, lathe(domeProfile(NAVE_HALF, NAVE_RISE, 3), 6, { smooth: true, start: s > 0 ? 0 : Math.PI, sweep: Math.PI }).translate(s * NAVE_LEN, SPRING, ZN));
      b.add(stone, box(15, 26, 15).translate(s * 104, 0, 60.5));
      b.add(copper, box(7, 8, 9).translate(s * 104, 29, 60.5));
    }
    b.add(glass, barrelVault(19, 12, ZN - 62, ZN - 6, 4).translate(0, SPRING, 0));
    b.add(glass, lathe(domeProfile(23.5, DOME - SPRING - NAVE_RISE + 4.2, 3), 10, { smooth: true }).translate(0, SPRING + NAVE_RISE - 4.2, ZN));
    b.add(glass, cyl(2.6, 0.2, MAST - DOME, 5, { flat: true }).translate(0, DOME, ZN));
    b.pop(); b.pop();
    return finishFar(b, 'grand_palais');
  },
};
