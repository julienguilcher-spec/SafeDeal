/* Bourse de commerce (ancienne halle au blé ; Blondel, 1889 ; collection Pinault depuis 2021).
 * Rotonde d'environ 67 m de diamètre : anneau de pierre à arcades et pilastres, coupole de fer et de verre (bandeau
 * bas couvert d'ardoise, calotte vitrée, lanterneau) ; avant-corps d'entrée à quatre colonnes corinthiennes et
 * groupe sculpté, tourné vers l'ouest-nord-ouest ; colonne Médicis (colonne astronomique cannelée de 31 m, cage
 * de fer au sommet) adossée au sud-est. Les murs suivent l'emprise réelle. L'avant-corps est sur la corde relevée
 * dans l'emprise : à 45° entre +z et −x dans le repère du monument (BC.PORCH). */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, PALACE_STYLES, addPalace, archBlock, box, columnGeo, cyl, domeProfile, entablature, farMaterial, finishFar, lathe, pedestalRound,
  pose, sculptedGroup, tube, type PalaceStyle,
} from '../kit';
import { designRing, domeRibs, glazingMaterial, plainMaterial, siteAlign } from '../kit/x-edifices';
import { BOX, EMPRISE, MEDICIS } from '../collide/bourse_commerce';

export const BC = {
  /** Rayon de l'anneau, rayon de la coupole, cap de l'avant-corps d'entrée (rad) et distance de sa façade au centre. */
  R: 33.3, RD: 19.6, PORCH: -Math.PI / 4, PORCH_D: 35.7,
  /** Corniche de l'anneau, naissance et sommet de la coupole, sommet de la colonne Médicis. */
  WALL: 19, SPRING: 24.5, TOP: 37, COLUMN: 31,
} as const;

const TRIM = 'pierre_lisse', ZINC = 'zinc', SLATE = 'ardoise';
const GLASS = glazingMaterial('verriere_bourse', { frame: 0x8d979c, glass: 0xa9bcc2, tile: [2.4, 2.4], panes: [3, 3], bar: 0.06, minor: 0.02, night: 1.4, lit: 0.97 });
const IRON = plainMaterial('fer_bourse', 0x59636a, { roughness: 0.5, metalness: 0.4, night: 0.6 });
const STYLE: PalaceStyle = {
  ...PALACE_STYLES.classique, id: 'bourse_commerce', bay: 4.35, stone: 0xdbd0b8,
  floors: [{ height: 7, kind: 'arcades' }, { height: 7.5, kind: 'noble' }, { height: 4.5, kind: 'attique' }],
  roof: { kind: 'terrasse', height: 0.4, top: 'zinc' }, cornice: 0.9, balustrade: true, pavilions: null, plinth: 1.0,
};

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const lod: 0 | 1 = quality === 'bas' ? 0 : 1;
  const { R, RD, PORCH, PORCH_D, WALL, SPRING, TOP, COLUMN } = BC;
  b.push(siteAlign(site, EMPRISE, BOX));
  addPalace(b, designRing(EMPRISE, 0.2), STYLE, { matTrim: TRIM, roof: false });
  // ── couverture de l'anneau, tambour, coupole (ardoise en bas, verrière au-dessus), lanterneau ──
  const seg = lod > 0 ? 48 : 24, rows = 8, hd = TOP - SPRING - 1.8;
  b.add(ZINC, lathe([R - 0.6, WALL + 0.2, RD + 0.4, SPRING - 1.6], seg));
  b.add(TRIM, lathe([RD + 0.4, SPRING - 1.6, RD + 0.4, SPRING - 0.3, RD + 0.9, SPRING - 0.3, RD + 0.9, SPRING, RD, SPRING], seg));
  const prof = domeProfile(RD, hd, rows, 0.92, 2.6);
  b.add(SLATE, lathe(prof.slice(0, 8), seg, { smooth: true }).translate(0, SPRING, 0));
  b.add(GLASS, lathe(prof.slice(6), seg, { smooth: true }).translate(0, SPRING, 0));
  const g = new Geo();
  g.append(domeRibs(prof, lod > 0 ? 24 : 12, 0.4, 0.22).translate(0, SPRING, 0));
  g.append(lathe([prof[6] + 0.05, prof[7] - 0.2, prof[6] + 0.4, prof[7], prof[6] + 0.05, prof[7] + 0.2], seg).translate(0, SPRING, 0));
  g.append(cyl(2.8, 2.8, 1.3, 16, { top: false }).translate(0, SPRING + hd - 0.2, 0)).append(cyl(3.2, 0.2, 0.8, 16, { top: false }).translate(0, SPRING + hd + 1.1, 0));
  b.add(IRON, g);
  // ── avant-corps d'entrée : soubassement à porte cintrée, quatre colonnes corinthiennes, groupe sculpté ──
  b.with(pose(0, 0, 0, PORCH), () => {
    const W = 15, zf = PORCH_D;
    b.with(pose(0, 0, zf - 2.2), () => archBlock(b, { width: W, height: 7.6, depth: 4.4, seg: lod > 0 ? 12 : 8, back: false, mat: 'bossage_blond', openings: [{ x: 0, width: 4.2, height: 6.2 }] }));
    b.add('ombre', box(4.6, 6.4, 0.3).translate(0, 0, zf - 4.2));
    b.add(TRIM, box(W, WALL + 3.2 - 7.6, 3.4, { top: true }).translate(0, 7.6, zf - 2.7));
    const col = columnGeo({ order: 'corinthien', height: 11.6, diameter: 1.2, mat: TRIM, flutes: lod > 0 ? 16 : 0, seg: lod > 0 ? 12 : 8 });
    const cg = new Geo();
    for (const x of [-5.6, -2.2, 2.2, 5.6]) cg.append(col.shaft.clone().translate(x, 7.6, zf - 0.75)).append(col.trim.clone().translate(x, 7.6, zf - 0.75));
    cg.append(box(W + 0.4, 2.2, 1.9, { bottom: true }).translate(0, 19.2, zf - 0.95));
    b.add(TRIM, cg);
    entablature(b, [-W / 2 - 0.2, zf - 4.4, -W / 2 - 0.2, zf, W / 2 + 0.2, zf, W / 2 + 0.2, zf - 4.4], 19.2, 2.2, 0.8, { mat: TRIM, corniceOnly: true });
    for (const x of [-3.9, 0, 3.9]) b.add('ombre', box(1.9, 7.2, 0.25).translate(x, 9.4, zf - 2.5 + 1.55));
    b.with(pose(0, 21.4, zf - 2.6), () => sculptedGroup(b, TRIM, { width: 9, height: 5.2, depth: 2, seed: 113, count: lod > 0 ? 4 : 2 }));
  });
  // ── colonne Médicis : fût cannelé, plate-forme, cage de fer ──
  b.with(pose(MEDICIS.x, 0, MEDICIS.z), () => {
    pedestalRound(b, MEDICIS.r + 0.5, 3.2, TRIM, 16);
    const c = columnGeo({ order: 'dorique', height: COLUMN - 3.2 - 3.4, diameter: 2 * MEDICIS.r, mat: TRIM, flutes: lod > 0 ? 18 : 0, seg: lod > 0 ? 14 : 8, base: true });
    b.add(TRIM, c.shaft.translate(0, 3.2, 0)); b.add(TRIM, c.trim.translate(0, 3.2, 0));
    const y = COLUMN - 3.4, cage = new Geo();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, s = Math.sin(a), co = Math.cos(a);
      cage.append(tube(1.5 * s, y, 1.5 * co, 1.3 * s, y + 2.2, 1.3 * co, 0.05, 0.05, 4)).append(tube(1.3 * s, y + 2.2, 1.3 * co, 0, y + 3.4, 0, 0.05, 0.04, 4));
    }
    cage.append(cyl(1.55, 1.55, 0.08, 12, { bottom: true }).translate(0, y + 1.0, 0)).append(cyl(1.35, 1.35, 0.08, 12, { bottom: true }).translate(0, y + 2.2, 0));
    b.add(IRON, cage);
  });
  b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'bourse_commerce',
  name: 'Bourse de commerce',
  radius: 40,
  height: BC.TOP,
  build(site, quality) { return build(site, quality).build('bourse_commerce'); },
  buildFar(site) {
    const b = new Builder();
    const { R, RD, PORCH, PORCH_D, WALL, SPRING, TOP, COLUMN } = BC;
    const stone = farMaterial(0xdbd0b8), glass = farMaterial(0x9fb0b6, 1.2, 0xffe2b0), roof = farMaterial(0x6b747b, 0.3);
    b.push(siteAlign(site, EMPRISE, BOX));
    b.add(stone, cyl(R, R, WALL, 20, { flat: true, top: false }));
    b.add(roof, cyl(R, RD, SPRING - WALL, 20, { flat: true, top: false }).translate(0, WALL, 0));
    b.add(roof, cyl(RD, RD * 0.82, (TOP - SPRING) * 0.42, 16, { flat: true, top: false }).translate(0, SPRING, 0));
    b.add(glass, cyl(RD * 0.82, 2.6, (TOP - SPRING) * 0.5, 16, { flat: true }).translate(0, SPRING + (TOP - SPRING) * 0.42, 0));
    b.add(stone, box(15, WALL + 3, 5).translate(0, 0, PORCH_D - 2.5).rotateY(PORCH));
    b.add(stone, cyl(MEDICIS.r, MEDICIS.r * 0.85, COLUMN, 8, { flat: true }).translate(MEDICIS.x, 0, MEDICIS.z));
    b.pop();
    return finishFar(b, 'bourse_commerce');
  },
};
