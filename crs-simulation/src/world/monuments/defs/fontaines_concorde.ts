/* Fontaines de la Concorde (Hittorff, 1840) : fontaine des Mers et fontaine des Fleuves.
 * Une définition construit UNE fontaine ; la carte la place deux fois (nord et sud de l'obélisque).
 * Bassin de pierre d'environ 17 m, massif central à six figures assises portant une grande vasque, groupe de
 * génies et de cygnes sous la vasque supérieure, tritons et néréides du bassin tenant des poissons qui crachent
 * vers la vasque ; hauteur totale ≈ 9 m. Fonte peinte en bronze vert sombre rehaussée d'or. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef } from '../types';
import {
  Builder, Geo, basin, cyl, farMaterial, figureGeo, finishFar, jetArc, jetVertical, lathe, pose, sphere, tube, vasque,
  waterfall,
} from '../kit';

const R_BASIN = 8.4, RIM = 0.8, WATER = 0.58;
const IRON = 'fonte', GOLD = 'or';

function build(quality: QualityLevel) {
  const b = new Builder();
  const lod = quality === 'bas' ? 0 : 1;
  const seg = quality === 'bas' ? 24 : 44;
  basin(b, { radius: R_BASIN, rim: RIM, water: WATER, mat: 'pierre_lisse', seg, inner: 3.1 });
  // massif central : socle hexagonal, piédouche, grande vasque
  b.add(IRON, cyl(3.25, 3.1, 1.15, 6, { flat: true }));
  b.add(IRON, lathe([1.5, 1.15, 1.5, 1.5, 1.2, 1.7, 1.05, 3.0, 1.35, 3.25], 12));
  const rim1 = vasque(b, { radius: 3.45, y: 3.2, height: 1.35, mat: IRON, seg: seg >> 1 << 1, stem: 1.3, facets: true });
  b.add(GOLD, lathe([3.43, rim1 - 0.16, 3.5, rim1 - 0.08, 3.43, rim1 + 0.01], seg));
  // six figures assises adossées au piédouche (fleuves ou mers, pêches, industries)
  const figs = new Geo(), gold = new Geo();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const f = figureGeo({
      height: 3.5, lod, seated: true, robe: i % 2 === 0, lean: -0.12,
      armL: { e: 0.9 + (i % 3) * 0.3, a: 0.8, e2: 1.3, a2: 0.2 }, armR: { e: 0.5, a: 1.2, e2: 0.9, a2: 0.4 },
      itemL: i % 2 === 0 ? undefined : 'couronne',
    });
    const m = pose(Math.sin(a) * 1.95, 1.15, Math.cos(a) * 1.95, a);
    figs.append(f.body, m);
    gold.append(f.items, m);
    // proue et dauphin entre deux figures
    const a2 = a + Math.PI / 6;
    figs.append(sphere(0.5, 6, 4).scale(0.7, 0.7, 1.5).translate(0, 0, 0), pose(Math.sin(a2) * 2.75, 1.25, Math.cos(a2) * 2.75, a2));
  }
  // génies et cygnes portant la vasque supérieure
  const y2 = rim1 - 0.25;
  b.add(IRON, lathe([1.25, y2, 1.25, y2 + 0.3, 0.55, y2 + 0.5, 0.42, y2 + 1.9, 0.7, y2 + 2.15], 10));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const f = figureGeo({ height: 1.75, lod, armL: { e: 2.7, a: 0.9 }, armR: { e: 2.7, a: 0.9 }, legL: { e: 0.2, a: 0 } });
    figs.append(f.body, pose(Math.sin(a) * 0.85, y2 + 0.3, Math.cos(a) * 0.85, a));
    const a2 = a + Math.PI / 4;
    const swan = new Geo().append(sphere(0.34, 6, 4).scale(0.8, 0.75, 1.3)).append(tube(0, 0.1, 0.35, 0, 0.75, 0.5, 0.09, 0.06, 5)).append(tube(0, 0.75, 0.5, 0, 0.62, 0.78, 0.06, 0.03, 5));
    figs.append(swan, pose(Math.sin(a2) * 1.0, y2 + 0.6, Math.cos(a2) * 1.0, a2));
  }
  const rim2 = vasque(b, { radius: 1.85, y: y2 + 2.1, height: 0.95, mat: IRON, seg: 20, stem: 0.6, facets: true });
  b.add(GOLD, lathe([1.83, rim2 - 0.12, 1.9, rim2 - 0.05, 1.83, rim2 + 0.01], 20));
  gold.append(lathe([0.22, rim2 - 0.1, 0.3, rim2 + 0.25, 0.2, rim2 + 0.6, 0.0, rim2 + 0.95], 8, { smooth: true }));
  // tritons et néréides du bassin : à mi-corps dans l'eau, un poisson doré dans les bras
  const jets = new Geo();
  const nT = 6, rT = 5.7;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * Math.PI * 2;
    const f = figureGeo({ height: 3.0, lod, robe: true, lean: 0.12, armL: { e: 1.25, a: 0.35, e2: 1.5, a2: 0 }, armR: { e: 1.25, a: 0.35, e2: 1.5, a2: 0 } });
    const m = pose(Math.sin(a) * rT, WATER - 1.5, Math.cos(a) * rT, a + Math.PI);
    figs.append(f.body.clone().transform(m).clampAxis(1, 0.12, 99));
    const fish = new Geo().append(sphere(0.3, 6, 4).scale(0.6, 0.75, 1.5)).append(tube(0, 0, -0.4, 0, 0.5, -0.75, 0.1, 0.02, 4));
    gold.append(fish, pose(Math.sin(a) * (rT - 0.75), WATER + 1.0, Math.cos(a) * (rT - 0.75), a + Math.PI));
    jets.append(jetArc([Math.sin(a) * (rT - 1.1), WATER + 1.2, Math.cos(a) * (rT - 1.1)], [Math.sin(a) * 2.2, rim1 - 0.1, Math.cos(a) * 2.2], 1.5, 0.13, quality === 'bas' ? 5 : 9));
  }
  b.add(IRON, figs);
  b.add(GOLD, gold);
  // eaux : gerbe sommitale, nappes tombant des deux vasques
  jets.append(jetVertical(0, rim2 + 0.8, 0, 1.5, 0.45));
  jets.append(waterfall(1.85, rim2 - 0.02, 2.25, rim1 - 0.15, 20, 7));
  jets.append(waterfall(3.45, rim1 - 0.02, 4.0, WATER, quality === 'bas' ? 20 : 32, 12));
  b.add('jet', jets);
  return b.build('fontaines_concorde');
}

export const def: MonumentDef = {
  key: 'fontaines_concorde',
  name: 'Fontaine de la Concorde',
  radius: 9.2,
  height: 9.2,
  build(_site, quality) { return build(quality); },
  buildFar() {
    const b = new Builder();
    b.add(farMaterial(0xd8ccb0), cyl(R_BASIN + 0.4, R_BASIN + 0.4, RIM, 14, { flat: true }));
    const iron = farMaterial(0x2b3a31);
    b.add(iron, cyl(2.6, 1.3, 3.4, 8, { top: false }));
    b.add(iron, cyl(1.3, 3.45, 1.2, 10).translate(0, 3.4, 0));
    b.add(iron, cyl(0.6, 0.6, 2.0, 6, { top: false }).translate(0, 4.6, 0));
    b.add(iron, cyl(0.6, 1.85, 0.9, 8).translate(0, 6.4, 0));
    b.add(farMaterial(0xe8f0f2, 0.6), cyl(0.3, 0.5, 1.6, 4, { top: false }).translate(0, 7.3, 0));
    return finishFar(b, 'fontaines_concorde');
  },
};
