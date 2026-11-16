/* Palais Bourbon (Assemblée nationale) — site sensible. Emprise réelle de 141 × 185 m.
 * Façade nord plaquée par Poyet (1806-1810) : douze colonnes corinthiennes sous un fronton allégorique, au sommet
 * d'un emmarchement d'une trentaine de marches, volontairement DÉSAXÉE par rapport au palais pour répondre à la
 * Madeleine. Derrière : le bâtiment de l'hémicycle et sa verrière ; au sud, la cour d'honneur et les ailes basses.
 * Quatre statues assises sur le parvis, Minerve et Thémis au pied des marches, drapeaux tricolores. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, farMaterial, figureGeo, finishFar, hemisphere, pose, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { farBody, flag, pavilion, portico } from '../kit/x-palais-pieces';
import { orect, planOf, solidsMinus } from '../x-palais-plan';
import { signedArea } from '../shape2d';
import { COLONNADE, COURS, EMPRISE, HEMICYCLE, STATUES, fromPortico } from '../collide/palais_bourbon';

const STYLE: PalaceStyle = {
  id: 'x_bourbon', bay: 4.2, stone: 0xdcd0b6,
  floors: [{ height: 5.2, kind: 'bossages' }, { height: 6.5, kind: 'noble' }],
  roof: { kind: 'terrasse', height: 0.4, top: 'zinc' }, cornice: 0.7, balustrade: true, pavilions: null, pilasters: true, plinth: 0.8,
};
const HAUT: PalaceStyle = {
  id: 'x_bourbon_haut', bay: 4.8, stone: 0xdcd0b6,
  floors: [{ height: 6, kind: 'bossages' }, { height: 8, kind: 'noble' }, { height: 5, kind: 'attique' }],
  roof: { kind: 'terrasse', height: 0.4, top: 'zinc' }, cornice: 0.9, balustrade: false, pavilions: null, pilasters: true, plinth: 0.9,
};

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas', C = COLONNADE, stone = 'pierre_lisse';
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    // corps bas : l'emprise réelle, privée du bloc de la colonnade (emmarchement et portique)
    const c = fromPortico(0, -C.depth / 2 + 0.6);
    const pieces = solidsMinus(p.ring, [orect(c[0], c[1], C.width + 0.6, C.depth + 1.4, C.rot)], 30);
    let ring = pieces[0] ?? Array.from(p.ring);
    for (const q of pieces) if (signedArea(q) > signedArea(ring)) ring = q;
    addBody(b, ring, STYLE, { holes: COURS as number[][], light: low, postEvery: 0 });
    // bâtiment de l'hémicycle : plus haut, coiffé de la verrière de la salle des séances
    const H = HEMICYCLE;
    const top = pavilion(b, { x: H.x, z: H.z, w: H.w, d: H.d, rot: H.rot, style: HAUT, roof: 'pavillon', roofH: 2.6, topScale: 0.82, roofMat: 'zinc' });
    b.add('x_verriere', hemisphere(13, low ? 12 : 20, 4, 0.42).translate(0, top - 0.2, -4), pose(H.x, 0, H.z, H.rot));
    // colonnade : emmarchement entre deux murs d'échiffre, douze colonnes, fronton ; mur de fond percé de trois portes
    b.with(pose(C.ox, 0, C.oz, C.rot), () => {
      const hw = C.width / 2, zs = -C.stepsRun;
      b.with(pose(0, 0, zs - 5.6), () => portico(b, {
        width: C.width - 3.2, columns: 12, colH: C.colH, colD: C.colD, order: 'corinthien', depth: 5.6, baseY: C.baseY, steps: 30, tread: C.stepsRun / 30,
        entabH: C.entabH, pediment: C.pediment, matTympan: 'relief_pierre', flutes: low ? 0 : 20,
      }));
      const back = new Geo();
      back.append(box(C.width, C.baseY + C.colH + C.entabH, C.depth + zs - 5.6).translate(0, 0, (zs - 5.6 - C.depth) / 2));
      for (const s of [-1, 1]) back.append(box(1.8, C.baseY + 1.2, C.stepsRun + 0.6).translate(s * (hw - 0.9), 0, zs / 2));
      b.add('pierre_blonde', back);
      const doors = new Geo();
      for (const x of [-9.6, 0, 9.6]) doors.append(box(3, 7.2, 0.2).translate(x, C.baseY, zs - 5.5));
      b.add('ombre', doors);
      // Minerve et Thémis au sommet des murs d'échiffre ; quatre grands commis assis sur le parvis
      const st = new Geo();
      for (const s of [-1, 1]) {
        const f = figureGeo({ height: 3.6, lod: low ? 0 : 1, robe: true, hat: s < 0 ? 'casque' : 'couronne', armR: { e: 0.8, a: 0.5 }, armL: { e: 0.5, a: 0.8 }, itemR: s < 0 ? 'lance' : 'tablette' });
        st.append(f.body.translate(s * (hw - 0.9), C.baseY + 1.2, zs + 2)).append(f.items.translate(s * (hw - 0.9), C.baseY + 1.2, zs + 2));
      }
      for (const [x, z] of STATUES) {
        st.append(box(2.6, 2.6, 2.6).translate(x, 0, z));
        const f = figureGeo({ height: 3.4, lod: 0, seated: true, robe: true, armR: { e: 0.9, a: 0.4 }, armL: { e: 0.6, a: 0.7 } });
        st.append(f.body.translate(x, 2.6, z + 0.2));
      }
      b.add(stone, st);
      if (!low) for (const x of [-12, -4, 4, 12]) b.with(pose(x, C.baseY + 6.5, zs - 1.2), () => flag(b, 4.5, 2.6, 0.55));
      b.with(pose(0, C.baseY + C.colH + C.entabH + C.pediment + 0.6, zs - 8), () => flag(b, 7, 3.4));
    });
  });
  return b.build('palais_bourbon');
}

export const def: MonumentDef = {
  key: 'palais_bourbon',
  name: 'Palais Bourbon (Assemblée nationale)',
  radius: 118,
  height: 28.8,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xd8ccb2), roof = farMaterial(0x8e969d, 0.3), C = COLONNADE, H = HEMICYCLE;
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      farBody(b, p.ring, 11.7, 0, stone, roof, 4);
      b.add(stone, box(H.w, 19, H.d).translate(0, 0, 0), pose(H.x, 0, H.z, H.rot));
      b.add(stone, box(C.width - 3, C.baseY + C.colH + C.entabH, 6).translate(0, 0, -C.stepsRun - 3), pose(C.ox, 0, C.oz, C.rot));
      b.add(stone, new Geo().face3(-C.width / 2 + 1.5, 21.5, 0, C.width / 2 - 1.5, 21.5, 0, 0, 27.7, 0).translate(0, 0, -C.stepsRun), pose(C.ox, 0, C.oz, C.rot));
    });
    return finishFar(b, 'palais_bourbon');
  },
};
