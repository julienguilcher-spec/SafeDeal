/* Église de la Madeleine (Vignon puis Huvé, 1807-1842) : temple périptère octostyle, sans clocher ni fenêtres.
 * Cotes réelles : 108 × 43 m, 30 m de haut (le modèle fait 31,4 m, soubassement et corniche du fronton compris) ; 52 colonnes corinthiennes de 19,5 m (8 en façade, 8 au chevet,
 * 18 entre les angles sur chaque flanc) ; haut soubassement avec un emmarchement de 28 marches au sud et un autre au
 * nord ; fronton sud sculpté (Le Jugement dernier, Lemaire) ; portes de bronze de Triqueti ; niches à statues de
 * saints sur les murs de la cella. L'emprise réelle de la carte (43,3 × 128,5 m) comprend les deux emmarchements.
 * Repère local : portique sud (rue Royale) vers +z. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, band, box, boxAt, columnGeo, entablature, farMaterial, finishFar, pediment, plinth, polygon, pose, reliefPanel, stairs,
} from '../kit';
import { gableRoof, siteAlign } from '../kit/x-edifices';
import { gothicAtlas, rowWall } from '../kit/x-gothique-peint';
import { rectRing } from '../shape2d';
import { BOX, EMPRISE } from '../collide/madeleine';

export const MAD = {
  /** Demi-largeur du soubassement, demi-longueur du temple (hors emmarchements), recul des emmarchements. */
  HW: 21.65, HL: 54, RUN: 10.2,
  /** Soubassement, colonnes, entablement, flèche du fronton. */
  PODIUM: 3.4, COL: 19.5, ENT: 3.6, RISE: 4.2,
  /** Diamètre des colonnes et retrait de leur axe par rapport au bord du soubassement. */
  DIA: 2.0, INSET: 1.6,
} as const;

const STONE = 'pierre_blonde', TRIM = 'pierre_lisse', ROOF = 'zinc';
/** Niches à statues des murs de la cella : une niche par entrecolonnement. */
const NICHES = gothicAtlas('madeleine_niches', 0xe0cfa8, [{ id: 'niche', kind: 'rois', w: 5.5, h: 6.4, count: 1 }], 23);

function build(site: MonumentSite, quality: QualityLevel): Builder {
  const b = new Builder();
  const { HW, HL, RUN, PODIUM, COL, ENT, RISE, DIA, INSET } = MAD;
  const lod = quality === 'bas' ? 0 : 1;
  b.push(siteAlign(site, EMPRISE, BOX));
  const cx = HW - INSET, cz = HL - INSET;
  const yCol = PODIUM, yEnt = PODIUM + COL, yRoof = yEnt + ENT;
  // ── soubassement mouluré et emmarchements (sud : 28 marches ; nord : identique) ──
  const base = rectRing(0, 0, 2 * HW, 2 * HL);
  b.add(STONE, box(2 * HW, PODIUM, 2 * HL));
  plinth(b, base, 0, 0.9, 0.25, { mat: TRIM, closed: true });
  band(b, base, PODIUM - 0.45, 0.45, 0.22, { mat: TRIM, closed: true });
  for (const sg of [1, -1]) {
    b.with(pose(0, 0, sg * HL, sg > 0 ? 0 : Math.PI), () => {
      stairs(b, 2 * HW - 7, PODIUM, RUN, lod > 0 ? 24 : 12, TRIM);
      for (const sx of [-1, 1]) b.add(STONE, boxAt(sx * (HW - 3.5), 0, 0, sx * HW, PODIUM + 0.5, RUN));
      for (const sx of [-1, 1]) b.add(TRIM, box(3.7, 0.3, RUN + 0.2, { bottom: true }).translate(sx * (HW - 1.75), PODIUM + 0.5, RUN / 2));
    });
  }
  // ── péristyle : 52 colonnes corinthiennes ──
  const col = columnGeo({ order: 'corinthien', height: COL, diameter: DIA, mat: TRIM, flutes: lod > 0 ? 20 : 0, seg: lod > 0 ? 12 : 8 });
  const shafts = new Geo(), trims = new Geo();
  const place = (x: number, z: number): void => { shafts.append(col.shaft.clone().translate(x, yCol, z)); trims.append(col.trim.clone().translate(x, yCol, z)); };
  for (let i = 0; i < 8; i++) { const x = -cx + (i / 7) * 2 * cx; place(x, cz); place(x, -cz); }
  for (let i = 1; i <= 18; i++) { const z = -cz + (i / 19) * 2 * cz; place(cx, z); place(-cx, z); }
  b.add(TRIM, shafts); b.add(TRIM, trims);
  // ── cella : murs nus, niches à statues, portes de bronze au fond du pronaos ──
  const pitch = (2 * cz) / 19, wx = cx - 4.7, zFront = cz - 2 * pitch, zBack = -cz + pitch;
  b.add(STONE, boxAt(-wx, PODIUM, zBack, wx, yEnt, zFront, { top: false }));
  const cell = rectRing(0, (zFront + zBack) / 2, 2 * wx, zFront - zBack);
  plinth(b, cell, PODIUM, 1.4, 0.3, { mat: TRIM, closed: true });
  band(b, cell, yEnt - 2.6, 0.5, 0.2, { mat: TRIM, closed: true });
  const niches = new Geo(), nb = Math.round((zFront - zBack) / pitch);
  niches.append(rowWall(NICHES, 'niche', wx + 0.06, zFront, wx + 0.06, zBack, PODIUM + 4.2, PODIUM + 10.6, { bays: nb }));
  niches.append(rowWall(NICHES, 'niche', -wx - 0.06, zBack, -wx - 0.06, zFront, PODIUM + 4.2, PODIUM + 10.6, { bays: nb }));
  b.add(NICHES.key, niches);
  b.with(pose(0, PODIUM + 0.2, zFront), () => reliefPanel(b, { width: 5.4, height: 10.4, mat: 'relief_bronze', frame: TRIM }));
  b.with(pose(0, PODIUM + 11.6, zFront), () => reliefPanel(b, { width: 9, height: 2.2, mat: 'relief_pierre' }));
  for (const sx of [-1, 1]) b.with(pose(sx * 8.6, PODIUM + 4.2, zFront + 0.05), () => b.add(NICHES.key, rowWall(NICHES, 'niche', -2.75, 0, 2.75, 0, 0, 6.4, { bays: 1 })));
  // ── entablement, plafond à caissons du péristyle, frontons, toit ──
  const outer = rectRing(0, 0, 2 * (cx + DIA * 0.5), 2 * (cz + DIA * 0.5));
  entablature(b, outer, yEnt, ENT, 1.35, { mat: TRIM, closed: true });
  b.add('caissons', polygon(outer, yEnt, false));
  b.add(TRIM, box(2 * (cx + DIA * 0.5), 0.2, 2 * (cz + DIA * 0.5), { bottom: false }).translate(0, yRoof - 0.2, 0));
  const pw = 2 * (cx + DIA * 0.5) + 1.2;
  for (const sg of [1, -1]) {
    b.with(pose(0, yRoof, sg * (cz + DIA * 0.5 - 0.3), sg > 0 ? 0 : Math.PI), () => pediment(b, {
      width: pw, rise: RISE, depth: 1.5, mat: TRIM, matTympan: sg > 0 ? 'relief_pierre' : STONE, cornice: 0.75,
    }));
  }
  b.add(ROOF, gableRoof(pw / 2 + 0.2, -(cz + DIA * 0.5), cz + DIA * 0.5, RISE + 0.35).translate(0, yRoof + 0.1, 0));
  b.pop();
  return b;
}

export const def: MonumentDef = {
  key: 'madeleine',
  name: 'Église de la Madeleine',
  radius: 68,
  height: MAD.PODIUM + MAD.COL + MAD.ENT + MAD.RISE,
  build(site, quality) { return build(site, quality).build('madeleine'); },
  buildFar(site) {
    const b = new Builder();
    const { HW, HL, RUN, PODIUM, COL, ENT, RISE } = MAD;
    const stone = farMaterial(0xd6caaf), shade = farMaterial(0xa89c82), roof = farMaterial(0x7c8489, 0.3);
    b.push(siteAlign(site, EMPRISE, BOX));
    b.add(stone, box(2 * HW, PODIUM, 2 * HL));
    for (const sg of [-1, 1]) b.add(stone, boxAt(-HW + 3.5, 0, sg * HL, HW - 3.5, PODIUM * 0.5, sg * (HL + RUN)));
    b.add(shade, boxAt(-HW + 6.3, PODIUM, -HL + 7, HW - 6.3, PODIUM + COL, HL - 12, { top: false }));
    // colonnade suggérée : une colonne sur deux
    for (let i = 0; i < 8; i += 1) for (const sg of [-1, 1]) b.add(stone, box(1.9, COL, 1.9, { top: false }).translate(-HW + 1.6 + (i / 7) * (2 * HW - 3.2), PODIUM, sg * (HL - 1.6)));
    for (let i = 1; i < 10; i++) for (const sx of [-1, 1]) b.add(stone, box(1.9, COL, 1.9, { top: false }).translate(sx * (HW - 1.6), PODIUM, -HL + 1.6 + (i / 10) * (2 * HL - 3.2)));
    b.add(stone, box(2 * HW, ENT, 2 * HL, { bottom: true, top: false }).translate(0, PODIUM + COL, 0));
    b.add(roof, gableRoof(HW + 0.6, -HL, HL, RISE, false).translate(0, PODIUM + COL + ENT, 0));
    b.add(stone, gableRoof(HW + 0.6, -HL, HL, RISE, true).scale(0.985, 0.97, 1.004).translate(0, PODIUM + COL + ENT, 0));
    b.pop();
    return finishFar(b, 'madeleine');
  },
};
