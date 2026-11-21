/* Hôtel de la Marine, place de la Concorde (Ange-Jacques Gabriel, 1766-1775) : palais jumeau de l'hôtel de Crillon.
 * Façade de 94 m sur la place : soubassement à bossages et onze arcades (galerie couverte), colonnade de douze
 * colonnes corinthiennes devant une loggia, entablement et balustrade à 20,6 m, deux pavillons d'angle à quatre
 * colonnes et fronton (≈ 22,8 m). Bâti sur l'emprise réelle (94 × 65 m), cours intérieures comprises. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, balustrade, box, farMaterial, finishFar, pose, prism } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { flag } from '../kit/x-palais-pieces';
import { GABRIEL, GABRIEL_STYLE, gabrielFacade } from '../kit/x-palais-gabriel';
import { planOf, simplifyRing } from '../x-palais-plan';
import { insetRing } from '../shape2d';
import { COURS, EMPRISE, FACADE, bodyRing } from '../collide/hotel_marine';

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    addBody(b, bodyRing(p.ring), GABRIEL_STYLE, { holes: COURS as number[][], balustrade: false, light: quality === 'bas' });
    balustrade(b, insetRing(simplifyRing(p.ring, 0.3), -0.3), { y: GABRIEL.top, height: 1.05, closed: true, mat: 'pierre_lisse', postEvery: 4.4 });
    gabrielFacade(b, { x0: FACADE.x0, x1: FACADE.x1, z: FACADE.z, pavZ: FACADE.pavZ, pavW: FACADE.pavW, loggia: FACADE.loggia, baseDepth: FACADE.baseDepth, quality });
    b.with(pose(0, GABRIEL.top + 1, FACADE.z - 6), () => flag(b, 7, 3));
  });
  return b.build('hotel_marine');
}

export const def: MonumentDef = {
  key: 'hotel_marine',
  name: 'Hôtel de la Marine',
  radius: 60,
  height: 22.8,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xdcd0b6), roof = farMaterial(0x4a5059, 0.2);
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      b.add(stone, prism(simplifyRing(p.ring, 2.5), 0, GABRIEL.top, { top: false }));
      b.add(roof, prism(insetRing(simplifyRing(p.ring, 2.5), -3), GABRIEL.top, GABRIEL.top + 2.4));
      for (const s of [-1, 1]) b.add(stone, box(15, 22.6, 1.2).translate(s * (FACADE.x1 - FACADE.pavW / 2), 0, FACADE.pavZ + 0.5));
    });
    return finishFar(b, 'hotel_marine');
  },
};
