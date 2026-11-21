/* Préfecture de police de Paris (ancienne caserne de la Cité, 1863-1867), île de la Cité — siège du commandement.
 * Grand quadrilatère de 105 × 118 m autour d'une cour centrale, sur son emprise réelle : soubassement à refends,
 * trois étages, combles à lucarnes, pavillons d'angle, portail d'honneur surmonté du drapeau ; porche d'entrée des
 * véhicules dans l'aile ouest, ouvert sur la cour. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, farMaterial, finishFar, pose, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { farBody, flag, pavilion, portico } from '../kit/x-palais-pieces';
import { planOf, rectOf } from '../x-palais-plan';
import { COUR, EMPRISE, H_MUR, PORCHE } from '../collide/prefecture_police';

const STYLE: PalaceStyle = {
  id: 'x_prefecture', bay: 4.2, stone: 0xd4c9ae,
  floors: [{ height: 6.5, kind: 'bossages' }, { height: 5.5, kind: 'noble' }, { height: 5.2, kind: 'etage' }, { height: 3.6, kind: 'attique' }],
  roof: { kind: 'mansart', height: 5.6, mat: 'ardoise', top: 'zinc', lucarnes: true },
  cornice: 0.8, balustrade: false, pavilions: null, pilasters: true, plinth: 1,
};

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas';
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    addBody(b, p.ring, STYLE, { holes: [rectOf(COUR.x0, COUR.z0, COUR.x1, COUR.z1)], passages: [PORCHE], roofTol: 1.6, light: low });
    for (const [x, z] of [[-34.6, 50.8], [45.6, 52.4], [-45.4, -52], [37.4, -49]]) pavilion(b, { x, z, w: 13.6, d: 13.6, style: STYLE, extra: 2.6, roof: 'pavillon', roofH: 6, topScale: 0.35, base: H_MUR, crest: 'plomb' });
    // pavillon central de la façade principale : portail, balcon à colonnes, drapeau
    pavilion(b, { x: 4, z: 53.6, w: 22, d: 10.4, style: STYLE, extra: 3.2, roof: 'pavillon', roofH: 5.5, topScale: 0.45, base: H_MUR, crest: 'plomb' });
    b.with(pose(4, 0, 58.7), () => {
      portico(b, { width: 13, columns: 4, colH: 6.6, colD: 0.75, order: 'dorique', depth: 1.5, baseY: 6.5, bare: true, entabH: 1.3, pediment: 1.9, flutes: 0 });
      b.add('pierre_lisse', box(13.6, 0.5, 1.7, { bottom: true }).translate(0, 6.0, 0.8));
      b.add('ombre', new Geo().append(box(4, 5.4, 0.2).translate(0, 0, 0.14)));
      for (const s of [-1, 1]) b.with(pose(s * 3.4, 6.6, 1.4), () => flag(b, 4.4, 2.3, s * 0.5));
    });
    b.with(pose(4, H_MUR + 8.9, 53.6), () => flag(b, 6, 3.2));
  });
  return b.build('prefecture_police');
}

export const def: MonumentDef = {
  key: 'prefecture_police',
  name: 'Préfecture de police',
  radius: 82,
  height: 30,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    b.with(pose(p.ox, 0, p.oz, p.rot), () => farBody(b, p.ring, H_MUR, 5, farMaterial(0xcfc4a8), farMaterial(0x4a5059, 0.2), 3));
    return finishFar(b, 'prefecture_police');
  },
};
