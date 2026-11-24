/* École militaire (Ange-Jacques Gabriel, 1751-1780), face au Champ-de-Mars. Emprise réelle de 316 × 187 m.
 * Façade nord-ouest (+z) : corps central — le « Château » — à avant-corps de colonnes corinthiennes colossales sous
 * fronton, coiffé d'un DÔME QUADRANGULAIRE ; longues ailes ; derrière, la cour d'honneur et les quartiers bas autour
 * de leurs cours. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, cyl, farMaterial, finishFar, frustum, pose, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { clock, farBody, flag, pavilion, portico } from '../kit/x-palais-pieces';
import { clipConvex, planOf, rectOf, solidsMinus } from '../x-palais-plan';
import { ringBounds, signedArea } from '../shape2d';
import { CHATEAU, COURS, EMPRISE, H_BAS } from '../collide/ecole_militaire';

const HAUT: PalaceStyle = {
  id: 'x_ecole_militaire', bay: 4.4, stone: 0xddd1b6,
  floors: [{ height: 5.6, kind: 'bossages' }, { height: 6, kind: 'noble' }, { height: 5, kind: 'etage' }],
  roof: { kind: 'mansart', height: 5.4, mat: 'ardoise', top: 'zinc', lucarnes: true },
  cornice: 0.8, balustrade: true, pavilions: null, pilasters: true, plinth: 0.9,
};
const BAS: PalaceStyle = {
  id: 'x_ecole_militaire_bas', bay: 4.2, stone: 0xd8ccb2,
  floors: [{ height: 5.2, kind: 'bossages' }, { height: 4.6, kind: 'etage' }],
  roof: { kind: 'comble', height: 3.6, mat: 'ardoise', top: 'ardoise', lucarnes: true },
  cornice: 0.6, balustrade: false, pavilions: null, pilasters: false, plinth: 0.8,
};

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas', C = CHATEAU;
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    const win = rectOf(C.x0, C.z0, C.x1, C.z1);
    const front = clipConvex(p.ring, win);
    for (const r of front) addBody(b, r, HAUT, { roofTol: 1.2, light: low, postEvery: 0 });
    for (const r of solidsMinus(p.ring, [win], 30)) {
      const holes = (COURS as number[][]).filter((h) => { const bb = ringBounds(h); return bb.w * bb.d > 60 && bb.cx > ringBounds(r).minX && bb.cx < ringBounds(r).maxX && bb.cz > ringBounds(r).minZ && bb.cz < ringBounds(r).maxZ; });
      if (signedArea(r) > 0) addBody(b, r, BAS, { holes, roofTol: 1.4, light: low });
    }
    // le Château : dôme quadrangulaire, avant-corps de colonnes corinthiennes sous fronton, horloge
    const top = pavilion(b, { x: C.cx, z: 80.6, w: 30, d: 23, style: HAUT, extra: 5.5, roof: 'imperiale', roofH: 15, topScale: 0.34, base: C.wallH, crest: 'plomb', lucarnes: false });
    b.add('plomb', new Geo().append(cyl(1.6, 1.6, 2.6, 8, { flat: true })).append(cyl(2.0, 0.05, 2.4, 8, { flat: true }).translate(0, 2.6, 0)).translate(C.cx, top - 0.3, 80.6));
    b.with(pose(C.cx, 0, 93.6), () => {
      portico(b, { width: 17.6, columns: 4, colH: 13, colD: 1.35, order: 'corinthien', depth: 3.4, baseY: 1.4, steps: 8, entabH: 2.2, pediment: 4, matTympan: 'relief_pierre', flutes: low ? 0 : 20, pairs: false });
      b.with(pose(0, C.wallH + 7.6, -0.9), () => clock(b, 1.5));
    });
    // façade sur la cour d'honneur : portique à l'arrière du Château
    b.with(pose(C.cx, 0, 67.3, Math.PI), () => portico(b, { width: 16.6, columns: 4, colH: 11, colD: 1.15, order: 'corinthien', depth: 2.6, baseY: 1.2, steps: 7, entabH: 2, pediment: 3.4, flutes: 0 }));
    // pavillons des ailes et drapeau
    for (const x of [-68.2, 74.6]) pavilion(b, { x, z: 70, w: 12.4, d: 16, style: BAS, extra: 3, roof: 'pavillon', roofH: 5, topScale: 0.4, base: H_BAS, crest: 'plomb' });
    b.with(pose(C.cx, top + 4.4, 80.6), () => flag(b, 5, 3));
  });
  return b.build('ecole_militaire');
}

export const def: MonumentDef = {
  key: 'ecole_militaire',
  name: 'École militaire',
  radius: 186,
  height: 45,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xd8ccb2), roof = farMaterial(0x4a5059, 0.2), C = CHATEAU;
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      farBody(b, p.ring, H_BAS, 3, stone, roof, 5);
      b.add(stone, box(C.x1 - C.x0, C.wallH + 4, 28).translate((C.x0 + C.x1) / 2, 0, 76));
      b.add(roof, frustum(30, 23, 10, 8, 19).translate(C.cx, C.wallH + 4, 80.6));
    });
    return finishFar(b, 'ecole_militaire');
  },
};
