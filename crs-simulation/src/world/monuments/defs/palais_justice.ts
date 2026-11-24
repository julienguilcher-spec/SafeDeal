/* Palais de Justice de Paris, île de la Cité. Emprise réelle de 222 × 212 m, moins la Conciergerie (repère distinct,
 * au nord) et la cour où se dresse la Sainte-Chapelle (repère distinct, laissée libre).
 * Façade est (+z) sur le boulevard du Palais : cour du Mai fermée par la grille en fer forgé et doré de 1787, grand
 * perron, avant-corps à quatre colonnes doriques, dôme quadrangulaire. Façade ouest (place Dauphine) : colonnade
 * de Duc au-dessus d'un large emmarchement. Combles d'ardoise, une vingtaine de cours intérieures. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, farMaterial, figureGeo, finishFar, ironFence, pose, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { farBody, flag, pavilion, portico } from '../kit/x-palais-pieces';
import { planOf } from '../x-palais-plan';
import { pointInRing, ringBounds } from '../shape2d';
import { COURS, COUR_MAI, EMPRISE, H_MUR, ZONE_CONCIERGERIE, palaisRing } from '../collide/palais_justice';

const STYLE: PalaceStyle = {
  id: 'x_palais_justice', bay: 4.4, stone: 0xd6cbb0,
  floors: [{ height: 6, kind: 'bossages' }, { height: 7, kind: 'noble' }, { height: 5.5, kind: 'etage' }],
  roof: { kind: 'mansart', height: 6.5, mat: 'ardoise', top: 'zinc', lucarnes: true },
  cornice: 0.8, balustrade: false, pavilions: null, pilasters: true, plinth: 1,
};

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas', M = COUR_MAI, stone = 'pierre_lisse';
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    const holes = (COURS as number[][]).filter((h) => { const bb = ringBounds(h); return bb.w * bb.d > 40 && !pointInRing(bb.cx, bb.cz, ZONE_CONCIERGERIE); });
    addBody(b, palaisRing(p.ring), STYLE, { holes, roofTol: 1.8, light: low });
    // cour du Mai : grille dorée entre piles de pierre, perron et avant-corps à colonnes, dôme quadrangulaire
    const mx = (M.x0 + M.x1) / 2;
    ironFence(b, [M.x0, M.grille, M.x1, M.grille], { height: 5.6, mat: 'grille_doree', wall: { height: 0.9, mat: stone } });
    const piers = new Geo();
    for (const x of [M.x0, mx - 4.2, mx + 4.2, M.x1]) piers.append(box(1.5, 7.4, 1.5).translate(x, 0, M.grille)).append(box(1.9, 0.4, 1.9, { bottom: true }).translate(x, 7.4, M.grille));
    b.add(stone, piers);
    b.add('or', new Geo().append(box(8.4, 0.5, 0.3).translate(mx, 6.9, M.grille)).append(box(2.2, 2.2, 0.3).translate(mx, 7.4, M.grille)));
    b.with(pose(mx, 0, M.z0), () => portico(b, { width: 22, columns: 4, colH: 10.4, colD: 1.2, order: 'dorique', depth: 3.4, baseY: 4, steps: 22, tread: 0.36, entabH: 2.2, flutes: low ? 0 : 20 }));
    if (!low) {
      const st = new Geo();
      for (const x of [-7.5, -2.5, 2.5, 7.5]) { const f = figureGeo({ height: 3, lod: 0, robe: true, armR: { e: 0.9, a: 0.5 } }); st.append(f.body.translate(mx + x, 16.7, M.z0 + 2.4)); }
      b.add(stone, st);
    }
    pavilion(b, { x: mx, z: M.z0 - 8.4, w: 24, d: 16, style: STYLE, extra: 2.6, roof: 'imperiale', roofH: 8.5, topScale: 0.32, base: H_MUR, crest: 'plomb' });
    b.with(pose(mx, H_MUR + 11.8, M.z0 - 8.4), () => flag(b, 5.5, 3));
    // façade de la place Dauphine : colonnade au-dessus d'un emmarchement
    b.with(pose(19.2, 0, -102.1, Math.PI), () => portico(b, { width: 50, columns: 10, colH: 11, colD: 1.3, order: 'dorique', depth: 2.6, baseY: 3.2, steps: 18, tread: 0.36, entabH: 2.4, flutes: 0 }));
    b.add('pierre_blonde', box(55.4, 16.6, 13).translate(19.2, 0, -95.2));
  });
  return b.build('palais_justice');
}

export const def: MonumentDef = {
  key: 'palais_justice',
  name: 'Palais de Justice de Paris',
  radius: 158,
  height: 33,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    b.with(pose(p.ox, 0, p.oz, p.rot), () => farBody(b, palaisRing(p.ring), H_MUR, 6, farMaterial(0xd0c5aa), farMaterial(0x4a5059, 0.2), 5));
    return finishFar(b, 'palais_justice');
  },
};
