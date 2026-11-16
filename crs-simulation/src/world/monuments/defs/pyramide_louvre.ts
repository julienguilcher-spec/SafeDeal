/* Pyramide du Louvre (Ieoh Ming Pei, 1989), cour Napoléon : base carrée de 35,42 m, hauteur 21,64 m (pente ≈ 50,7°),
 * 603 losanges et 70 triangles de verre dans une résille d'acier ; trois pyramidions d'environ 5 m ; sept bassins
 * triangulaires de granit autour, l'entrée restant dégagée du côté du Carrousel (+z). */
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, beam, box, farMaterial, finishFar, polygon, pose, sweep } from '../kit';
import '../kit/x-palais-pieces';
import { planOf } from '../x-palais-plan';
import { insetRing } from '../shape2d';
import { BASSINS, EMPRISE, PYRAMIDE, PYRAMIDIONS } from '../collide/pyramide_louvre';

/** Pyramide de verre : quatre faces, `div` mailles le long de chaque arêtier (UV en mailles). */
function glassPyramid(side: number, height: number, div: number): Geo {
  const g = new Geo(), h = side / 2;
  const c: [number, number][] = [[-h, h], [h, h], [h, -h], [-h, -h]];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4];
    g.face3(a[0], 0, a[1], b[0], 0, b[1], 0, height, 0, 0, 0, div, 0, 0, div);
  }
  return g;
}

/** Arêtiers et lisse basse d'une pyramide (profilés d'acier). */
function frame(side: number, height: number, t: number): Geo {
  const g = new Geo(), h = side / 2;
  for (const [x, z] of [[-h, h], [h, h], [h, -h], [-h, -h]]) g.append(beam(x, 0, z, 0, height, 0, t, t));
  g.append(box(side + t, t, t).translate(0, 0, h)).append(box(side + t, t, t).translate(0, 0, -h));
  g.append(box(t, t, side + t).translate(h, 0, 0)).append(box(t, t, side + t).translate(-h, 0, 0));
  return g;
}

function build(site: MonumentSite) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const P = PYRAMIDE;
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    b.add('x_verre_pyramide', glassPyramid(P.side, P.height, 18));
    b.add('zinc', frame(P.side, P.height, 0.22));
    // porte d'entrée, face ouest : cadre d'acier et auvent
    b.add('zinc', new Geo().append(box(0.25, 3.2, 0.25).translate(-2.6, 0, P.side / 2 - 2.5)).append(box(0.25, 3.2, 0.25).translate(2.6, 0, P.side / 2 - 2.5)).append(box(5.6, 0.25, 2.8).translate(0, 3.2, P.side / 2 - 1.3)));
    for (const [x, z] of PYRAMIDIONS) {
      b.add('x_verre_pyramide', glassPyramid(P.smallSide, P.smallHeight, 4), pose(x, 0, z, Math.PI / 4));
      b.add('zinc', frame(P.smallSide, P.smallHeight, 0.12), pose(x, 0, z, Math.PI / 4));
    }
    // bassins : margelle de granit sombre, plan d'eau affleurant
    for (const r of BASSINS) {
      b.add('granit_gris', sweep([0, 0, 0, 0.42, -0.45, 0.42, -0.45, 0.18], r, { closed: true }));
      b.add('eau', polygon(insetRing(r, -0.42), 0.34));
      b.add('granit_gris', polygon(insetRing(r, -0.42), 0.02));
    }
  });
  return b.build('pyramide_louvre');
}

export const def: MonumentDef = {
  key: 'pyramide_louvre',
  name: 'Pyramide du Louvre',
  radius: 56,
  height: PYRAMIDE.height,
  build(site) { return build(site); },
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const glass = farMaterial(0x9fb6be, 1.0, 0xffe0a8);
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      b.add(glass, glassPyramid(PYRAMIDE.side, PYRAMIDE.height, 1));
      for (const [x, z] of PYRAMIDIONS) b.add(glass, glassPyramid(PYRAMIDE.smallSide, PYRAMIDE.smallHeight, 1), pose(x, 0, z, Math.PI / 4));
    });
    return finishFar(b, 'pyramide_louvre');
  },
};
