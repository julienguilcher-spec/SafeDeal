/* Musée d'Orsay : ancienne gare d'Orsay (Victor Laloux, 1900), sur son emprise réelle (188 × 78 m).
 * Façade de pierre sur la Seine (+z) : sept grandes arcades vitrées entre deux pavillons coiffés de combles en dôme
 * carré, chacun portant une horloge monumentale ; trois statues de villes au faîte ; derrière, la grande nef sous sa
 * voûte vitrée en berceau (≈ 32 m) ; au sud, l'ancien hôtel et ses combles d'ardoise ; à l'ouest, la marquise d'entrée. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, farMaterial, figureGeo, finishFar, pose, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { barrelVault, clock, farBody, hipRoof, pavilion } from '../kit/x-palais-pieces';
import { clipConvex, planOf, rectOf } from '../x-palais-plan';
import { CORPS, EMPRISE, H_MUR, H_NEF } from '../collide/musee_orsay';

const STYLE: PalaceStyle = {
  id: 'x_orsay', bay: 12.2, stone: 0xddd2b8,
  floors: [{ height: 12.6, kind: 'arcades' }, { height: 6.4, kind: 'attique' }],
  roof: { kind: 'terrasse', height: 0.4, top: 'zinc' }, cornice: 1.0, balustrade: true, pavilions: null, pilasters: true, plinth: 1.2,
};
/** Pavillons de la façade sur la Seine (centre en x) : amont et aval. */
const PAV_X = [-85.2, 70.2];

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas', C = CORPS;
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    const main = clipConvex(p.ring, rectOf(C.x0 - 2, C.z0 - 2, C.x1, C.z1 + 2))[0] ?? Array.from(p.ring);
    addBody(b, main, STYLE, { light: low, postEvery: 0 });
    // grande nef : voûte vitrée en berceau, entre le bâtiment du quai et l'ancien hôtel
    const nl = C.x1 - C.x0 - 34, nx = (C.x0 + C.x1) / 2;
    b.add('x_verriere', barrelVault(nl, 39, H_NEF - H_MUR, low ? 8 : 14).translate(nx, H_MUR, 0.5));
    b.add('zinc', new Geo().append(box(nl + 1, 0.5, 1.2).translate(nx, H_MUR - 0.2, 20.2)).append(box(nl + 1, 0.5, 1.2).translate(nx, H_MUR - 0.2, -19.2)));
    // ancien hôtel, côté rue de Lille : comble d'ardoise
    b.add('ardoise', hipRoof(C.x1 - C.x0 - 1, 18.6, 6.4, 0.5).translate(nx, H_MUR, C.z0 + 9.6));
    // pavillons du quai : attique, comble en dôme carré, grande horloge
    for (const x of PAV_X) {
      pavilion(b, { x, z: 29.8, w: 18.8, d: 19.2, style: STYLE, extra: 7, roof: 'imperiale', roofH: 9.5, topScale: 0.36, crest: 'plomb', lucarnes: !low });
      b.with(pose(x, H_MUR + 3.4, 39.5), () => clock(b, 3.1));
    }
    // statues de Bordeaux, Toulouse et Nantes, au faîte de la façade
    const st = new Geo();
    for (const x of [-52, -7.5, 37]) {
      const f = figureGeo({ height: 4.4, lod: low ? 0 : 1, seated: true, robe: true, hat: 'couronne', armR: { e: 0.9, a: 0.6 }, armL: { e: 0.6, a: 0.7 } });
      st.append(box(3, 1.4, 2.4).translate(x, H_MUR, 36.6)).append(f.body.translate(x, H_MUR + 1.4, 36.8));
    }
    b.add('pierre_lisse', st);
    // marquise d'entrée (ouest) : halle basse vitrée
    b.add('pierre_blonde', box(14.6, 7, 36.4, { top: false }).translate(86.6, 0, -8.6));
    b.add('x_verriere', barrelVault(36.4, 14.6, 4.2, 8).rotateY(Math.PI / 2).translate(86.6, 7, -8.6));
  });
  return b.build('musee_orsay');
}

export const def: MonumentDef = {
  key: 'musee_orsay',
  name: 'Musée d\'Orsay',
  radius: 104,
  height: 36,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xd8ccb2), glass = farMaterial(0x9db1b9, 0.9, 0xffe2b0), roof = farMaterial(0x4a5059, 0.2);
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      farBody(b, p.ring, H_MUR, 0, stone, roof, 3);
      b.add(glass, barrelVault(139, 39, H_NEF - H_MUR, 5).translate(-7.5, H_MUR, 0.5));
      for (const x of PAV_X) b.add(roof, box(18.8, 15, 19.2).translate(x, H_MUR, 29.8));
    });
    return finishFar(b, 'musee_orsay');
  },
};
