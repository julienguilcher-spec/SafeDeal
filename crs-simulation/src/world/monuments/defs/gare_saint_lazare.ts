/* Gare Saint-Lazare (façade de Juste Lisch, 1885-1889), sur son emprise réelle (≈ 247 × 248 m).
 * Bâtiment des voyageurs de 213 m sur la rue Saint-Lazare, de biais : pavillon central à horloge sous un comble en
 * dôme carré, pavillons intermédiaires et d'extrémité, grandes baies cintrées ; derrière, la salle des pas perdus puis
 * la halle des voies sous ses six verrières à deux versants. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, box, farMaterial, finishFar, pose, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { clock, farBody, flag, gableRoof, pavilion } from '../kit/x-palais-pieces';
import { clipConvex, planOf, solidsMinus } from '../x-palais-plan';
import { signedArea, worldRingToLocal } from '../shape2d';
import { EMPRISE, FACADE, H_FACADE, H_HALLE, H_VERRIERE, facadeStrip } from '../collide/gare_saint_lazare';

const STYLE: PalaceStyle = {
  id: 'x_saint_lazare', bay: 5.4, stone: 0xdcd0b4,
  floors: [{ height: 8.5, kind: 'arcades' }, { height: 7.5, kind: 'noble' }, { height: 5, kind: 'etage' }],
  roof: { kind: 'mansart', height: 6.4, mat: 'ardoise', top: 'zinc', lucarnes: true },
  cornice: 0.9, balustrade: false, pavilions: null, pilasters: true, plinth: 1,
};
const HALLE: PalaceStyle = {
  id: 'x_saint_lazare_halle', bay: 6, stone: 0xd2c7ac,
  floors: [{ height: 6.5, kind: 'arcades' }, { height: 5.5, kind: 'attique' }],
  roof: { kind: 'terrasse', height: 0.4, top: 'zinc' }, cornice: 0.6, balustrade: false, pavilions: null, pilasters: false, plinth: 0.8,
};
/** Pavillons de la façade (abscisse dans le repère de la façade, largeur, attique, comble). */
const PAVILLONS: [x: number, w: number, extra: number, roofH: number, kind: 'imperiale' | 'pavillon'][] = [
  [0.4, 30, 4.6, 9.5, 'imperiale'], [-52, 13.6, 3, 7, 'pavillon'], [52.4, 13.6, 3, 7, 'pavillon'], [-100.1, 13.4, 3, 7.5, 'pavillon'], [100.4, 13.4, 3, 7.5, 'pavillon'],
];

/** Étendue de l'emprise (dans le repère de la façade) le long de la droite x = cste : [zMin, zMax] ou null. */
function spanAt(ring: number[], x: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, n = ring.length >> 1, j = n - 1; i < n; j = i++) {
    const ax = ring[2 * j], bx = ring[2 * i];
    if ((ax > x) === (bx > x)) continue;
    const z = ring[2 * j + 1] + ((x - ax) / (bx - ax)) * (ring[2 * i + 1] - ring[2 * j + 1]);
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  return lo < hi ? [lo, hi] : null;
}

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas', F = FACADE;
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    const strip = facadeStrip();
    for (const r of clipConvex(p.ring, strip)) addBody(b, r, STYLE, { roofTol: 1.4, light: low });
    const rest = solidsMinus(p.ring, [strip], 100);
    for (const r of rest) if (signedArea(r) > 0) addBody(b, r, HALLE, { light: true });
    b.with(pose(F.ox, 0, F.oz, F.rot), () => {
      // pavillons du bâtiment des voyageurs ; horloge du pavillon central
      for (const [x, w, extra, roofH, kind] of PAVILLONS) pavilion(b, { x, z: -8.1 + (x === 0.4 ? 0.9 : 0), w, d: 18.8, style: STYLE, extra, roof: kind, roofH, topScale: kind === 'imperiale' ? 0.36 : 0.4, base: H_FACADE, crest: 'plomb', lucarnes: !low && kind === 'imperiale' });
      b.with(pose(0.4, H_FACADE + 2.2, 2.3), () => clock(b, 1.9));
      for (const s of [-1, 1]) b.with(pose(0.4 + s * 9, H_FACADE + 4.6, 1.2), () => flag(b, 5, 2.6));
      // halle des voies : six verrières à deux versants, perpendiculaires à la façade
      const ring = worldRingToLocal(rest[0] ?? p.ring, F.ox, F.oz, F.rot);
      const span = (F.half * 2 - 6) / 6, glass = new Geo(), gutters = new Geo();
      for (let k = 0; k < 6; k++) {
        const x = -F.half + 3 + (k + 0.5) * span;
        const s = spanAt(ring, x);
        if (!s) continue;
        const z1 = Math.min(s[1], -F.depth + 3), z0 = s[0] + 4, len = z1 - z0;
        if (len < 20) continue;
        glass.append(gableRoof(len, span - 1.2, H_VERRIERE - H_HALLE).rotateY(Math.PI / 2).translate(x, H_HALLE, (z0 + z1) / 2));
        glass.face3(x - span / 2 + 0.6, H_HALLE, z0, x, H_VERRIERE, z0, x + span / 2 - 0.6, H_HALLE, z0, 0, 0, span / 2, 7, span, 0);
        gutters.append(box(1.2, 0.5, len).translate(x - span / 2, H_HALLE, (z0 + z1) / 2));
      }
      b.add('x_verriere', glass);
      b.add('zinc', gutters);
    });
  });
  return b.build('gare_saint_lazare');
}

export const def: MonumentDef = {
  key: 'gare_saint_lazare',
  name: 'Gare Saint-Lazare',
  radius: 178,
  height: 35.4,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xd4c9ae), glass = farMaterial(0x9db1b9, 0.8, 0xffe2b0), F = FACADE;
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      farBody(b, p.ring, H_HALLE, 5, stone, glass, 6);
      b.add(stone, box(F.half * 2, H_FACADE + 4, F.depth - 4).translate(0, 0, -F.depth / 2 + 1), pose(F.ox, 0, F.oz, F.rot));
      b.add(farMaterial(0x4a5059, 0.2), box(30, 12, 18).translate(0.4, H_FACADE + 4, -8), pose(F.ox, 0, F.oz, F.rot));
    });
    return finishFar(b, 'gare_saint_lazare');
  },
};
