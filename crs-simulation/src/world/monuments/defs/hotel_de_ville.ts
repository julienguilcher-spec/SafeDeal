/* Hôtel de Ville de Paris (reconstruit de 1874 à 1882 par Ballu et Deperthes, style néo-Renaissance).
 * Emprise réelle de 144 × 89 m ; façade principale (+z) de 143 m sur le parvis, haute de 18,80 m à la corniche,
 * 26,80 m aux pavillons ; pavillon central à horloge, campanile octogonal (≈ 50 m), pavillons d'angle à hauts
 * combles d'ardoise, lucarnes, souches de cheminée, statues dans les travées ; deux bronzes sur le parvis. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, cyl, dome, farMaterial, figureGeo, finishFar, frustum, lathe, pose, spire, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { chimneyRow, clock, farBody, flag, pavilion } from '../kit/x-palais-pieces';
import { planOf } from '../x-palais-plan';
import { COURS, EMPRISE, H_MUR, STATUES } from '../collide/hotel_de_ville';

const STYLE: PalaceStyle = {
  id: 'x_hotel_de_ville', bay: 4.4, stone: 0xdfd3b6,
  floors: [{ height: 7, kind: 'arcades' }, { height: 6.4, kind: 'noble' }, { height: 5.4, kind: 'etage' }],
  roof: { kind: 'mansart', height: 9, mat: 'ardoise', top: 'zinc', lucarnes: true },
  cornice: 0.9, balustrade: false, pavilions: null, pilasters: true, plinth: 1.1,
};

type Pav = [x: number, z: number, w: number, d: number, extra: number, roofH: number, top: number];
const PAVILLONS: Pav[] = [
  [-64.6, 35.4, 15.6, 14.4, 4, 12.5, 0.26], [64.6, 35.4, 15.6, 14.4, 4, 12.5, 0.26], [-64.6, -34.6, 15.6, 14.4, 4, 12.5, 0.26], [64.6, -34.6, 15.6, 14.4, 4, 12.5, 0.26],
  [-26.4, 40.1, 11, 9.6, 4, 10.5, 0.3], [26.8, 40.1, 11, 9.6, 4, 10.5, 0.3], [-35, -39.6, 11, 9.6, 4, 10.5, 0.3], [35, -39.9, 11, 9.6, 4, 10.5, 0.3],
];

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas', stone = 'pierre_lisse';
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    addBody(b, p.ring, STYLE, { holes: COURS as number[][], roofTol: 1.8, light: low });
    for (const [x, z, w, d, extra, roofH, top] of PAVILLONS) pavilion(b, { x, z, w, d, style: STYLE, extra, roof: 'pavillon', roofH, topScale: top, crest: 'plomb', lucarnes: !low, chimneys: !low });
    // pavillon central : attique à horloge, fronton, puis le campanile
    const cx = 0.2;
    pavilion(b, { x: cx, z: 40.3, w: 17, d: 9.2, style: STYLE, extra: 7, roof: 'pavillon', roofH: 5, topScale: 0.55 });
    b.with(pose(cx, H_MUR + 3.6, 44.95), () => clock(b, 1.75));
    b.add(stone, new Geo().append(box(8.6, 15.4, 8.6)).append(box(9.4, 0.7, 9.4, { bottom: true }).translate(0, 15.4, 0)).translate(cx, H_MUR, 34));
    b.push(pose(cx, H_MUR + 16.1, 34));
    b.add(stone, cyl(3.7, 3.7, 8, 8, { flat: true, top: false }));
    const bays = new Geo();
    for (let i = 0; i < 8; i++) bays.append(box(1.5, 5.2, 0.2).translate(0, 1.4, 3.45), pose(0, 0, 0, (i + 0.5) * Math.PI / 4));
    b.add('ombre', bays);
    b.add(stone, lathe([3.7, 7.4, 4.3, 7.7, 4.3, 8.2, 3.6, 8.2], 8));
    b.with(pose(0, 8.2, 0), () => {
      const t = dome(b, { radius: 3.8, height: 4.4, mat: 'plomb', seg: 16, rows: 6, shape: 0.9, ribs: 8 });
      b.with(pose(0, t - 0.2, 0), () => spire(b, { radius: 0.8, height: 6.2, mat: 'plomb', finial: 'pointe' }));
    });
    b.pop();
    // souches de cheminée sur les grands combles
    if (!low) {
      b.add(stone, chimneyRow(-52, 31, -32, 31, H_MUR + 5, 3, 5).append(chimneyRow(32, 31, 52, 31, H_MUR + 5, 3, 5)).append(chimneyRow(-52, -31, 52, -31, H_MUR + 5, 9, 5)));
      // statues des travées du corps central et hérauts du faîtage
      const st = new Geo();
      for (let i = 0; i < 10; i++) {
        const x = -19.6 + i * 4.4;
        if (Math.abs(x - cx) < 8) continue;
        const f = figureGeo({ height: 2.5, lod: 0, robe: i % 2 === 0, armR: { e: 0.9, a: 0.5 }, armL: { e: 0.4, a: 0.6 } });
        st.append(box(1.1, 0.3, 0.9).translate(x, 7, 44.7)).append(f.body.translate(x, 7.3, 44.75));
      }
      b.add(stone, st);
      for (const s of [-1, 1]) b.with(pose(cx + s * 6, 7.2, 45.3), () => flag(b, 4.6, 2.2, s * 0.5));
    }
    // deux bronzes du parvis
    for (const [x, z] of STATUES) {
      b.add('granit_gris', box(2.4, 2.2, 2.4).translate(x, 0, z));
      const f = figureGeo({ height: 3.4, lod: low ? 0 : 1, seated: true, robe: true, armR: { e: 1.2, a: 0.6 }, armL: { e: 0.6, a: 0.8 } });
      b.add('bronze', f.body.translate(x, 2.2, z + 0.2));
    }
  });
  return b.build('hotel_de_ville');
}

export const def: MonumentDef = {
  key: 'hotel_de_ville',
  name: 'Hôtel de Ville de Paris',
  radius: 92,
  height: 50,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xdacdb0), roof = farMaterial(0x4a5059, 0.2);
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      farBody(b, p.ring, H_MUR, 6.5, stone, roof, 4);
      for (const [x, z, w, d, extra, roofH] of PAVILLONS.slice(0, 4)) {
        b.add(stone, box(w, extra + 1, d, { top: false }).translate(x, H_MUR, z));
        b.add(roof, frustum(w, d, w * 0.26, d * 0.26, roofH).translate(x, H_MUR + extra + 1, z));
      }
      b.add(stone, box(8.6, 15.4, 8.6).translate(0.2, H_MUR, 34));
      b.add(roof, cyl(3.8, 0.2, 16, 8, { flat: true }).translate(0.2, H_MUR + 15.4, 34));
    });
    return finishFar(b, 'hotel_de_ville');
  },
};
