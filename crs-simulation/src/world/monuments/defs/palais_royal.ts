/* Palais-Royal (Conseil d'État, Conseil constitutionnel, ministère de la Culture) et Comédie-Française.
 * Emprise réelle de 144 × 137 m. Au sud (+z), la cour de l'Horloge ouverte sur la place derrière un portique à
 * arcades ; au centre, la cour d'honneur et ses 260 colonnes tronquées, rayées de noir et de blanc (trame de
 * 3,19 m) ; au nord, la double colonnade de la galerie d'Orléans et ses fontaines à sphères d'acier, ouverte sur le
 * jardin ; galeries à arcades au rez-de-chaussée, combles d'ardoise. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, arcade, box, column, cyl, farMaterial, finishFar, pediment, pose, sphere, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { clock, farBody, flag } from '../kit/x-palais-pieces';
import { planOf } from '../x-palais-plan';
import { COLONNADES, COLONNES, COURS_OUVERTES, ECRAN, EMPRISE, H_MUR, PASSAGES, bodyRing, hauteurColonne } from '../collide/palais_royal';

const STYLE: PalaceStyle = {
  id: 'x_palais_royal', bay: 4.2, stone: 0xddd1b6,
  floors: [{ height: 6.2, kind: 'arcades' }, { height: 6.2, kind: 'noble' }, { height: 3.6, kind: 'attique' }],
  roof: { kind: 'mansart', height: 5.2, mat: 'ardoise', top: 'zinc', lucarnes: true },
  cornice: 0.7, balustrade: true, pavilions: null, pilasters: true, plinth: 0.8,
};

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas', C = COURS_OUVERTES, K = COLONNES, L = COLONNADES, E = ECRAN, stone = 'pierre_lisse';
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    addBody(b, bodyRing(p.ring), STYLE, { passages: PASSAGES.map((g) => ({ ...g })), roofTol: 1.4, light: low, postEvery: 0 });
    // colonnes de la cour d'honneur : fûts rayés, dessus de marbre blanc
    const shafts = new Geo(), caps = new Geo();
    const seg = low ? 6 : 10;
    for (let i = 0; i < K.nx; i++) for (let j = 0; j < K.nz; j++) {
      const h = hauteurColonne(i, j), x = K.x0 + i * K.pitch, z = K.z0 + j * K.pitch;
      shafts.append(cyl(K.d / 2, K.d / 2, h, seg, { top: false }).translate(x, 0, z));
      caps.append(cyl(K.d / 2, K.d / 2, 0.02, seg).translate(x, h - 0.02, z));
    }
    b.add('x_rayures', shafts);
    b.add('marbre_blanc', caps);
    // galerie d'Orléans : deux doubles colonnades portant une terrasse
    const w = C.x1 - C.x0, cx = (C.x0 + C.x1) / 2;
    for (const z of L.z) {
      for (let x = C.x0 + 1.2; x < C.x1 - 0.5; x += L.pitch) for (const s of [-1, 1]) b.with(pose(x, 0, z + s * L.gap / 2), () => column(b, { order: 'dorique', height: L.colH, diameter: 0.62, mat: stone, flutes: 0, seg: low ? 6 : 8 }));
      b.add(stone, box(w, 0.9, L.gap + 1.1, { bottom: true }).translate(cx, L.colH, z));
      b.add(stone, new Geo().append(box(w, 0.9, 0.2).translate(cx, L.colH + 0.9, z - L.gap / 2 - 0.45)).append(box(w, 0.9, 0.2).translate(cx, L.colH + 0.9, z + L.gap / 2 + 0.45)));
    }
    // fontaines à sphères d'acier, dans la cour de la galerie d'Orléans
    for (const x of [2.6, 28.2]) {
      b.add('granit_gris', new Geo().append(box(8.4, 0.45, 8.4)).translate(x, 0, -47.4));
      b.add('eau', box(7.6, 0.06, 7.6).translate(x, 0.44, -47.4));
      const balls = new Geo();
      for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 0.6 + (k % 3) * 0.9; balls.append(sphere(0.38 + (k % 4) * 0.12, 8, 5).translate(x + Math.cos(a) * r, 0.85 + (k % 2) * 0.3, -47.4 + Math.sin(a) * r)); }
      b.add('zinc', balls);
    }
    // cour de l'Horloge : portique à arcades sur la place, fronton à horloge sur la façade du palais
    b.with(pose((E.x0 + E.x1) / 2, 0, E.z), () => arcade(b, { length: E.x1 - E.x0, height: E.height, depth: E.depth, count: E.count, mat: stone, seg: low ? 6 : 10 }));
    b.with(pose(30.8, H_MUR, 36.75), () => { pediment(b, { width: 15, rise: 3.4, depth: 0.6, mat: stone }); b.with(pose(0, 1.5, 0.1), () => clock(b, 1.1)); });
    b.with(pose(30.8, H_MUR + 6.5, 30), () => flag(b, 5, 2.8));
  });
  return b.build('palais_royal');
}

export const def: MonumentDef = {
  key: 'palais_royal',
  name: 'Palais-Royal',
  radius: 104,
  height: 30,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    b.with(pose(p.ox, 0, p.oz, p.rot), () => farBody(b, bodyRing(p.ring), H_MUR, 4, farMaterial(0xd8ccb2), farMaterial(0x4a5059, 0.2), 3));
    return finishFar(b, 'palais_royal');
  },
};
