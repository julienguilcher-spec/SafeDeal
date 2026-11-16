/* Institut de France (ancien collège des Quatre-Nations, Louis Le Vau, 1662-1688), quai de Conti.
 * Sur son emprise réelle : la chapelle au centre, son portique de quatre colonnes corinthiennes sous fronton, et la
 * COUPOLE — tambour à pilastres et hautes baies, dôme d'ardoise à côtes dorées, lanternon ; de part et d'autre, deux
 * ailes en quart de cercle (portées par l'emprise) aboutissant à des pavillons carrés ; ailes arrière de biais. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, cyl, dome, farMaterial, finishFar, lathe, pose, domeProfile, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { farBody, flag, pavilion, portico } from '../kit/x-palais-pieces';
import { planOf } from '../x-palais-plan';
import { ringBounds } from '../shape2d';
import { COUPOLE, COURS, EMPRISE, H_MUR, PAVILLONS, PORTIQUE } from '../collide/institut_de_france';

const STYLE: PalaceStyle = {
  id: 'x_institut', bay: 4.0, stone: 0xdccfb2,
  floors: [{ height: 6.2, kind: 'arcades' }, { height: 6.4, kind: 'noble' }, { height: 4, kind: 'attique' }],
  roof: { kind: 'mansart', height: 4.6, mat: 'ardoise', top: 'zinc', lucarnes: true },
  cornice: 0.7, balustrade: false, pavilions: null, pilasters: true, plinth: 0.9,
};

function addCupola(b: Builder, quality: QualityLevel): void {
  const C = COUPOLE, low = quality === 'bas', seg = low ? 16 : 28, stone = 'pierre_lisse';
  // massif de la chapelle sous le tambour
  b.add('pierre_blonde', box(21, H_MUR + 4, 21, { top: true }).translate(0, 0, 0));
  b.add(stone, lathe([C.r + 1.4, H_MUR + 4, C.r + 1.4, H_MUR + 5.4, C.r, H_MUR + 5.4], seg));
  // tambour : pilastres jumelés, huit hautes baies, entablement
  const y0 = H_MUR + 5.4, dh = C.drumTop - y0;
  b.add('pierre_blonde', cyl(C.r, C.r, dh, seg, { top: false }).translate(0, y0, 0));
  const pil = new Geo(), bays = new Geo();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bays.append(box(2.3, dh * 0.62, 0.2).translate(0, y0 + dh * 0.16, C.r + 0.02), pose(0, 0, 0, a));
    for (const s of [-1, 1]) pil.append(box(0.75, dh - 0.6, 0.5).translate(0, y0, C.r + 0.1), pose(0, 0, 0, a + Math.PI / 8 + s * 0.085));
  }
  b.add('ombre', bays);
  b.add(stone, pil);
  b.add(stone, lathe([C.r, C.drumTop - 0.8, C.r + 0.9, C.drumTop - 0.3, C.r + 0.9, C.drumTop + 0.5, C.r - 0.1, C.drumTop + 0.5], seg));
  // dôme d'ardoise à côtes dorées, œils-de-bœuf, lanternon doré
  b.push(pose(0, C.drumTop + 0.5, 0));
  const dr = C.r + 0.1, dhh = 9.6;
  const top = dome(b, { radius: dr, height: dhh, mat: 'ardoise', ribs: 8, matRibs: 'or', seg, rows: low ? 6 : 9, shape: 0.9, lantern: { radius: 2.0, height: 5.6, mat: 'pierre_lisse', matRoof: 'or', bays: 8, finial: 'boule' } });
  const prof = domeProfile(dr + 0.1, dhh + 0.05, 9, 0.9, 2.1);
  const gilt = new Geo();
  for (let i = 0; i < 8; i++) gilt.append(lathe(prof.slice(4, 10), 2, { smooth: true, start: ((i + 0.5) / 8) * Math.PI * 2 - 0.1, sweep: 0.2 }));
  b.add('or', gilt);
  b.with(pose(0, top, 0), () => b.add('or', cyl(0.06, 0.03, 1.6, 5)));
  b.pop();
}

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas';
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    // les « cours » de la carte comprennent le massif de la coupole : on ne garde que les vraies cours
    const holes = (COURS as number[][]).filter((h) => { const bb = ringBounds(h); return Math.hypot(bb.cx - COUPOLE.x, bb.cz - COUPOLE.z) > 12; });
    addBody(b, p.ring, STYLE, { holes, roofTol: 1.5, light: low });
    b.with(pose(COUPOLE.x, 0, COUPOLE.z), () => addCupola(b, quality));
    b.with(pose(PORTIQUE.x, 0, PORTIQUE.z), () => portico(b, { width: PORTIQUE.width, columns: 4, colH: 12, colD: 1.25, order: 'corinthien', depth: 2.8, baseY: 1.4, steps: 8, entabH: 2.4, pediment: 3.8, matTympan: 'relief_pierre', flutes: low ? 0 : 20 }));
    for (const v of PAVILLONS) pavilion(b, { x: v.x, z: v.z, w: v.w + 0.8, d: v.d + 0.8, rot: v.rot, style: STYLE, extra: 2.4, roof: 'pavillon', roofH: 6.5, topScale: 0.4, base: H_MUR, crest: 'plomb' });
    b.with(pose(PORTIQUE.x, H_MUR + 2, PORTIQUE.z - 4), () => flag(b, 5, 2.8));
  });
  return b.build('institut_de_france');
}

export const def: MonumentDef = {
  key: 'institut_de_france',
  name: 'Institut de France',
  radius: 172,
  height: COUPOLE.top,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xd8cbae), roof = farMaterial(0x4a5059, 0.2), C = COUPOLE;
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      farBody(b, p.ring, H_MUR, 3.5, stone, roof, 3);
      b.add(stone, cyl(C.r, C.r, C.drumTop - H_MUR, 10, { top: false }).translate(C.x, H_MUR, C.z));
      b.add(roof, lathe(domeProfile(C.r, 9.6, 4, 0.9), 10, { smooth: true }).translate(C.x, C.drumTop, C.z));
      b.add(farMaterial(0xd9b23a, 1.0, 0xffd27a), cyl(1.8, 0.1, 6, 6).translate(C.x, C.drumTop + 9.4, C.z));
    });
    return finishFar(b, 'institut_de_france');
  },
};
