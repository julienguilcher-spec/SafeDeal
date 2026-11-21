/* Conciergerie, quai de l'Horloge (île de la Cité) : façade nord du palais de la Cité médiéval, sur son emprise
 * réelle (127 × 59 m). D'est en ouest : la tour de l'Horloge, carrée (≈ 47 m), portant sur le boulevard du Palais la
 * plus ancienne horloge publique de Paris (cadran doré sur fond d'azur) ; les tours jumelles de César et d'Argent ;
 * la tour Bonbec, à mâchicoulis. Tours rondes coiffées de poivrières d'ardoise, hauts combles à lucarnes. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, cyl, farMaterial, finishFar, frustum, pose, sweep, bandProfile, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { clock, farBody, roundTower } from '../kit/x-palais-pieces';
import { planOf } from '../x-palais-plan';
import { rectRing } from '../shape2d';
import { EMPRISE, HORLOGE, H_MUR, TOURS } from '../collide/conciergerie';

const STYLE: PalaceStyle = {
  id: 'x_conciergerie', bay: 5.2, stone: 0xcbc0a4,
  floors: [{ height: 6.5, kind: 'bossages' }, { height: 6, kind: 'etage' }, { height: 5.5, kind: 'etage' }],
  roof: { kind: 'comble', height: 8, mat: 'ardoise', top: 'ardoise', lucarnes: true },
  cornice: 0.5, balustrade: false, pavilions: null, pilasters: false, plinth: 1.2,
};

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas', T = HORLOGE;
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    addBody(b, p.ring, STYLE, { roofTol: 1.6, light: low });
    for (const t of TOURS) {
      b.with(pose(t.x, 0, t.z), () => roundTower(b, { r: t.r, h: t.h, roofH: t.roofH, mat: 'pierre_grise', seg: low ? 12 : 20 }));
      // archères et baies hautes
      const slits = new Geo();
      for (let i = -1; i <= 1; i++) slits.append(box(0.5, 2.2, 0.2).translate(0, t.h - 7.5, t.r + 0.02), pose(t.x, 0, t.z, i * 0.7));
      b.add('ombre', slits);
    }
    // tour de l'Horloge : fût carré, bandeaux, comble en pavillon et lanternon
    b.with(pose(T.x, 0, T.z), () => {
      const ring = rectRing(0, 0, T.w, T.d);
      b.add('pierre_grise', box(T.w, T.h, T.d, { top: false }));
      for (const y of [12, 24, T.h - 1.2]) b.add('pierre_lisse', sweep(bandProfile(y, 0.7, 0.35), ring, { closed: true }));
      b.add('pierre_lisse', sweep([0.45, T.h - 0.5, 0.45, T.h + 0.9, 0, T.h + 0.9], ring, { closed: true }));
      b.add('ardoise', frustum(T.w + 0.6, T.d + 0.6, 3.2, 3.2, 6.4).translate(0, T.h + 0.4, 0));
      b.add('plomb', new Geo().append(cyl(1.5, 1.5, 2.4, 8, { flat: true })).append(cyl(1.8, 0.05, 2.6, 8, { flat: true }).translate(0, 2.4, 0)).translate(0, T.h + 6.8, 0));
      const win = new Geo();
      for (const y of [15, 27]) for (const s of [-1, 1]) win.append(box(0.2, 3.2, 1.4).translate(s * (T.w / 2 + 0.02), y, 0)).append(box(1.4, 3.2, 0.2).translate(0, y, s * (T.d / 2 + 0.02)));
      b.add('ombre', win);
      // l'horloge, sur la face du boulevard du Palais, sous son auvent
      b.with(pose(-T.w / 2 - 0.3, 8.6, 0, -Math.PI / 2), () => {
        clock(b, 2.1, 'x_horloge_azur', 'or');
        b.add('or', new Geo().append(box(5.6, 0.3, 0.9).translate(0, 2.9, 0.2)).append(box(5.2, 0.4, 0.5).translate(0, -3.2, 0.1)));
        b.add('pierre_lisse', box(6, 7.6, 0.28).translate(0, -3.8, -0.16));
      });
    });
  });
  return b.build('conciergerie');
}

export const def: MonumentDef = {
  key: 'conciergerie',
  name: 'Conciergerie',
  radius: 72,
  height: HORLOGE.top,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xc6bca2), roof = farMaterial(0x4a5059, 0.2);
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      farBody(b, p.ring, H_MUR, 6, stone, roof, 3);
      for (const t of TOURS) {
        b.add(stone, cyl(t.r, t.r, t.h, 8, { top: false }).translate(t.x, 0, t.z));
        b.add(roof, cyl(t.r + 0.6, 0.05, t.roofH, 8, { top: false }).translate(t.x, t.h, t.z));
      }
      b.add(stone, box(HORLOGE.w, HORLOGE.h, HORLOGE.d).translate(HORLOGE.x, 0, HORLOGE.z));
      b.add(roof, frustum(HORLOGE.w, HORLOGE.d, 1, 1, 9).translate(HORLOGE.x, HORLOGE.h, HORLOGE.z));
    });
    return finishFar(b, 'conciergerie');
  },
};
