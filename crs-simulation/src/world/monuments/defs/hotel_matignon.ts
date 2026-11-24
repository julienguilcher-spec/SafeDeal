/* Hôtel de Matignon (1722-1725), 57 rue de Varenne : résidence du Premier ministre — site sensible.
 * Hôtel particulier entre cour et jardin sur son emprise réelle (61 × 75 m) : portail monumental au fond d'un
 * hémicycle sur la rue, cour d'honneur, corps de logis à deux niveaux couronné d'une balustrade, avant-corps en
 * rotonde sur le jardin (porté par l'emprise). Le parc de 3 hectares, au sud, relève de la carte. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, farMaterial, finishFar, pose, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { farBody, flag, gatePortal, pavilion, portico } from '../kit/x-palais-pieces';
import { planOf } from '../x-palais-plan';
import { COURS, EMPRISE, H_MUR, PORTAIL } from '../collide/hotel_matignon';

const STYLE: PalaceStyle = {
  id: 'x_matignon', bay: 3.6, stone: 0xe0d5bb,
  floors: [{ height: 5.4, kind: 'bossages' }, { height: 6, kind: 'noble' }],
  roof: { kind: 'comble', height: 3.2, mat: 'ardoise', top: 'zinc', lucarnes: false },
  cornice: 0.6, balustrade: true, pavilions: null, pilasters: true, plinth: 0.7,
};

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    addBody(b, p.ring, STYLE, { holes: COURS as number[][], passages: [PORTAIL], roofTol: 1.0, light: quality === 'bas' });
    // portail : massif à colonnes ioniques, vantaux fermés, drapeau
    b.with(pose(PORTAIL.x, 0, PORTAIL.z, PORTAIL.rot ?? 0), () => {
      const top = gatePortal(b, { width: PORTAIL.width, height: PORTAIL.height, depth: PORTAIL.length + 0.7, archW: 3.6, archH: 6.2, door: 'fer_noir', noBlock: true });
      b.with(pose(0, top, 0), () => flag(b, 4, 2.2));
    });
    // corps de logis : avant-corps central sur la cour (perron, quatre colonnes), attique sur les trois travées centrales
    pavilion(b, { x: -10.4, z: -26.6, w: 12, d: 18.6, style: STYLE, extra: 2.6, roof: 'pavillon', roofH: 2.4, topScale: 0.6, base: H_MUR });
    b.with(pose(-10.4, 0, -17.4), () => portico(b, { width: 10.5, columns: 4, colH: 5.6, colD: 0.6, order: 'ionique', depth: 2.2, baseY: 1, steps: 6, entabH: 1, flutes: 0 }));
    b.with(pose(-10.4, H_MUR + 5, -26.6), () => flag(b, 5, 2.6));
  });
  return b.build('hotel_matignon');
}

export const def: MonumentDef = {
  key: 'hotel_matignon',
  name: 'Hôtel de Matignon',
  radius: 50,
  height: 15,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    b.with(pose(p.ox, 0, p.oz, p.rot), () => farBody(b, p.ring, H_MUR, 2.6, farMaterial(0xdbd0b6), farMaterial(0x4a5059, 0.2), 2.5));
    return finishFar(b, 'hotel_matignon');
  },
};
