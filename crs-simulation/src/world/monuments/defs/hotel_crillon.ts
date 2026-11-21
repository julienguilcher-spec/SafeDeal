/* Hôtel de Crillon, place de la Concorde (façade d'Ange-Jacques Gabriel, 1766-1775) : jumeau de l'hôtel de la Marine.
 * L'emprise du repère ne couvre que l'hôtel lui-même (33 × 91 m, à l'angle de la rue Boissy-d'Anglas) ; la façade de
 * Gabriel, elle, court sur 94 m jusqu'à la rue Royale devant trois autres hôtels. Pour que les deux palais se
 * répondent, la colonnade entière est modélisée ici : corps de bâtiment sur l'emprise du Crillon, puis colonnade,
 * soubassement à arcades et pavillon est PLAQUÉS (1,3 m d'épaisseur) devant les immeubles voisins. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, facadeMaterial, farMaterial, finishFar, pose, prism } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { flag, paintWalls } from '../kit/x-palais-pieces';
import { GABRIEL, GABRIEL_STYLE, gabrielFacade } from '../kit/x-palais-gabriel';
import { planOf, simplifyRing } from '../x-palais-plan';
import { insetRing } from '../shape2d';
import { COURS, EMPRISE, FACADE } from '../collide/hotel_crillon';

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const F = FACADE;
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    addBody(b, p.ring, GABRIEL_STYLE, { holes: COURS as number[][], light: quality === 'bas' });
    // mur de fond de la colonnade devant les immeubles voisins (même ordonnance que le Crillon)
    const { material, layout } = facadeMaterial(GABRIEL_STYLE);
    const wall = new Geo();
    paintWalls(wall, [16.4, F.wallZ + 0.12, F.x1, F.wallZ + 0.12], 0, layout.wallH, 0, layout.floorV[layout.floorV.length - 1], GABRIEL_STYLE.bay);
    b.add(material, wall);
    b.add('pierre_lisse', box(0.5, GABRIEL.top, 1.6).translate(F.x1 + 0.2, 0, F.wallZ + 0.6));
    gabrielFacade(b, { x0: F.x0, x1: F.x1, z: F.z, pavZ: F.pavZ, pavW: F.pavW, loggia: 0, baseDepth: F.baseDepth, quality });
    b.with(pose(-2, GABRIEL.top + 1, F.wallZ - 6), () => flag(b, 7, 3));
  });
  return b.build('hotel_crillon');
}

export const def: MonumentDef = {
  key: 'hotel_crillon',
  name: 'Hôtel de Crillon',
  radius: 100,
  height: 23.3,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xdcd0b6), roof = farMaterial(0x4a5059, 0.2);
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      const ring = simplifyRing(p.ring, 2.5);
      b.add(stone, prism(ring, 0, GABRIEL.top, { top: false }));
      b.add(roof, prism(insetRing(ring, -3), GABRIEL.top, GABRIEL.top + 2.4));
      b.add(stone, box(FACADE.x1 - 16.4, GABRIEL.top + 1, 1.4).translate((FACADE.x1 + 16.4) / 2, 0, FACADE.wallZ + 0.7));
      for (const s of [-1, 1]) b.add(stone, box(15, 22.6, 1.2).translate(s < 0 ? FACADE.x0 + FACADE.pavW / 2 : FACADE.x1 - FACADE.pavW / 2, 0, FACADE.pavZ + 0.5));
    });
    return finishFar(b, 'hotel_crillon');
  },
};
