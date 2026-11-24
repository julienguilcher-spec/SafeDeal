/* Palais de l'Élysée (hôtel d'Évreux, 1722), 55 rue du Faubourg-Saint-Honoré — site sensible du jeu.
 * Hôtel particulier entre cour et jardin sur son emprise réelle (112 × 120 m) : portail d'honneur à colonnes ioniques
 * fermé par sa grille, cour d'honneur, corps de logis à péristyle, ailes basses, combles d'ardoise ; au nord, le jardin
 * clos de murs jusqu'à la grille du Coq (avenue Gabriel), surmontée de son coq doré. Pavillon tricolore sur le toit. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, birdGeo, box, farMaterial, finishFar, ironFence, pose, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { farBody, flag, gardenWall, gatePortal, pavilion, portico } from '../kit/x-palais-pieces';
import { planOf } from '../x-palais-plan';
import { CLOTURE_EST, CLOTURE_OUEST, COURS, EMPRISE, GRILLE_COQ, H_MUR, PORTAIL } from '../collide/palais_elysee';

const STYLE: PalaceStyle = {
  id: 'x_elysee', bay: 3.8, stone: 0xe2d8c0,
  floors: [{ height: 5, kind: 'bossages' }, { height: 5.6, kind: 'noble' }],
  roof: { kind: 'mansart', height: 4.6, mat: 'ardoise', top: 'zinc', lucarnes: true },
  cornice: 0.6, balustrade: true, pavilions: null, pilasters: true, plinth: 0.7,
};

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas';
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    addBody(b, p.ring, STYLE, { holes: COURS as number[][], passages: [PORTAIL], roofTol: 1.2, light: low, postEvery: 0 });
    // portail d'honneur : colonnes ioniques, attique, grille fermée
    b.with(pose(PORTAIL.x, 0, PORTAIL.z, PORTAIL.rot ?? 0), () => {
      const top = gatePortal(b, { width: PORTAIL.width, height: PORTAIL.height, depth: PORTAIL.length + 0.7, archW: 4.2, archH: 7, door: 'grille_doree', noBlock: true });
      b.with(pose(0, top, 0), () => flag(b, 4.5, 2.4));
    });
    // corps de logis : pavillon central surélevé, péristyle sur la cour, avant-corps sur le jardin
    pavilion(b, { x: 2, z: -16.2, w: 16.4, d: 18.8, style: STYLE, extra: 3, roof: 'pavillon', roofH: 3.4, topScale: 0.5, base: H_MUR, crest: 'plomb' });
    b.with(pose(2, 0, -6.9), () => portico(b, { width: 13, columns: 4, colH: 5.2, colD: 0.6, order: 'ionique', depth: 2.6, baseY: 0.9, steps: 5, entabH: 1, flutes: 0 }));
    b.with(pose(-0.4, 0, -25.9, Math.PI), () => portico(b, { width: 10.6, columns: 4, colH: 5.2, colD: 0.6, order: 'ionique', depth: 2.2, baseY: 0.9, steps: 5, entabH: 1, flutes: 0 }));
    b.with(pose(2, H_MUR + 6.4, -16.2), () => flag(b, 6, 3));
    // jardin : murs de clôture et grille du Coq
    b.add('pierre_grise', gardenWall(CLOTURE_OUEST, 3.2).append(gardenWall(CLOTURE_EST, 3.2)));
    b.with(pose(GRILLE_COQ.x, 0, GRILLE_COQ.z, GRILLE_COQ.rot), () => {
      const w = GRILLE_COQ.width, piers = new Geo();
      for (const s of [-1, 1]) piers.append(box(1.1, 5.2, 1.1).translate(s * (w / 2 + 0.55), 0, 0)).append(box(1.4, 0.35, 1.4, { bottom: true }).translate(s * (w / 2 + 0.55), 5.2, 0));
      b.add('pierre_lisse', piers);
      ironFence(b, [-w / 2, 0, w / 2, 0], { height: 4.6, mat: 'grille_doree', postEvery: 2 });
      b.add('or', new Geo().append(box(w, 0.18, 0.18).translate(0, 4.6, 0)).append(birdGeo('coq', 1.5).translate(0, 4.78, 0)));
    });
  });
  return b.build('palais_elysee');
}

export const def: MonumentDef = {
  key: 'palais_elysee',
  name: 'Palais de l\'Élysée',
  radius: 240,
  height: 16,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    b.with(pose(p.ox, 0, p.oz, p.rot), () => farBody(b, p.ring, H_MUR, 3.6, farMaterial(0xddd2b8), farMaterial(0x4a5059, 0.2), 3));
    return finishFar(b, 'palais_elysee');
  },
};
