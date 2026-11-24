/* Arc de triomphe du Carrousel (Percier et Fontaine, 1806-1808) : 14,6 m de haut sans le quadrige (≈ 19 m avec),
 * mur de 18,4 × 7 m sur la carte. Trois baies sur chaque grande face ; huit colonnes corinthiennes à fût de marbre
 * rose, bases et chapiteaux de bronze, portant huit soldats de la Grande Armée ; attique à bas-reliefs ; au sommet,
 * le quadrige de bronze conduit par la Paix, entre deux Victoires dorées.
 * Simplification : les arches des petits côtés, traversantes en réalité, sont figurées en renfoncement. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import {
  Builder, Geo, archBlock, archivolt, band, box, column, entablature, farMaterial, figure, figureGeo, finishFar, plinth, pose, quadriga,
  reliefPanel, sweep, corniceProfile,
} from '../kit';
import { planOf } from '../x-palais-plan';
import { rectRing } from '../shape2d';
import { ARC, EMPRISE } from '../collide/arc_carrousel';

const WALL = 'pierre_claire', TRIM = 'pierre_lisse_claire';

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const A = ARC, hw = A.W / 2, hd = A.D / 2, lod = quality === 'bas' ? 0 : 1, seg = lod ? 14 : 8;
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    // massif percé des trois baies, voûtes à caissons
    archBlock(b, {
      width: A.W, height: A.entabTop, depth: A.D, seg, top: false, mat: WALL, matVault: 'caissons', coffers: { around: 7, across: 6 },
      openings: [{ x: 0, width: A.bigW, height: A.bigH }, { x: -A.smallX, width: A.smallW, height: A.smallH }, { x: A.smallX, width: A.smallW, height: A.smallH }],
    });
    const outer = rectRing(0, 0, A.W, A.D);
    for (const s of [-1, 1]) {
      plinth(b, rectRing(s * (A.smallX + A.smallW / 2 + (hw - A.smallX - A.smallW / 2) / 2), 0, hw - A.smallX - A.smallW / 2, A.D), 0, 1.0, 0.14, { mat: TRIM, closed: true });
      plinth(b, rectRing(s * ((A.bigW / 2 + A.smallX - A.smallW / 2) / 2), 0, A.smallX - A.smallW / 2 - A.bigW / 2, A.D), 0, 1.0, 0.14, { mat: TRIM, closed: true });
    }
    // archivoltes des six baies, renfoncements des petits côtés
    const arch = new Geo();
    const big = archivolt({ x: 0, width: A.bigW, height: A.bigH }, 0.42, 0.14, seg);
    arch.append(big.clone().translate(0, 0, hd)).append(big.clone().rotateY(Math.PI).translate(0, 0, -hd));
    for (const s of [-1, 1]) {
      const small = archivolt({ x: s * A.smallX, width: A.smallW, height: A.smallH }, 0.32, 0.12, seg);
      arch.append(small.clone().translate(0, 0, hd)).append(small.clone().rotateY(Math.PI).translate(0, 0, -hd));
      const side = archivolt({ x: 0, width: A.smallW, height: A.smallH }, 0.32, 0.12, seg, true);
      arch.append(side.rotateY(s * Math.PI / 2).translate(s * hw, 0, 0));
      b.add('ombre', new Geo().append(box(0.06, A.smallH - A.smallW / 2, A.smallW).translate(s * (hw + 0.03), 0, 0)).append(box(0.06, A.smallW * 0.42, A.smallW * 0.8).translate(s * (hw + 0.03), A.smallH - A.smallW / 2, 0)));
    }
    b.add(TRIM, arch);
    // bas-reliefs de marbre au-dessus des petites baies
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      b.with(pose(s * A.smallX, A.smallH + 0.7, t * hd, t > 0 ? 0 : Math.PI), () => reliefPanel(b, { width: 3.1, height: 1.9, mat: 'relief_pierre', frame: 'marbre_rose', shift: s + t }));
    }
    // entablement à frise de marbre rose, en ressaut au droit des colonnes
    entablature(b, outer, A.entabY, A.entabTop - A.entabY, 0.55, { mat: TRIM, closed: true });
    const frieze = new Geo();
    for (const t of [-1, 1]) frieze.append(box(A.W - 0.3, 0.62, 0.1).translate(0, A.entabY + 0.66, t * (hd + 0.05)));
    for (const s of [-1, 1]) frieze.append(box(0.1, 0.62, A.D - 0.3).translate(s * (hw + 0.05), A.entabY + 0.66, 0));
    b.add('marbre_rose', frieze);
    // huit colonnes sur piédestaux, ressauts d'entablement et soldats
    const colH = A.entabY - 2.3;
    const ped = new Geo(), res = new Geo(), sold = new Geo();
    for (const sx of [-1, 1]) for (const cx of A.colX) for (const t of [-1, 1]) {
      const x = sx * cx, z = t * A.colZ;
      ped.append(box(1.6, 2.3, 1.6).translate(x, 0, z)).append(box(1.8, 0.28, 1.8, { bottom: true }).translate(x, 2.02, z)).append(box(1.8, 0.4, 1.8).translate(x, 0, z));
      b.with(pose(x, 2.3, z), () => column(b, { order: 'corinthien', height: colH, diameter: 0.74, mat: 'marbre_rose', matCapital: 'bronze', flutes: 0, seg: lod ? 12 : 8 }));
      res.append(box(1.35, A.entabTop - A.entabY - 0.5, t * 0 + (A.colZ - hd) + 0.75).translate(x, A.entabY, t * (hd + (A.colZ - hd + 0.75) / 2 - 0.05)));
      res.append(box(1.75, 0.5, A.colZ - hd + 1.05, { bottom: true }).translate(x, A.entabTop - 0.5, t * (hd + (A.colZ - hd + 1.05) / 2 - 0.05)));
      const f = figureGeo({ height: 2.5, lod: lod as 0 | 1, hat: 'bicorne', armR: { e: 0.5, a: 0.6, e2: 1.3, a2: 0.2 }, armL: { e: 0.2, a: 0.3 }, itemR: 'lance', itemScale: 0.6 });
      const m = pose(x, A.entabTop, t * (A.colZ - 0.05), t > 0 ? 0 : Math.PI);
      sold.append(f.body, m).append(f.items, m);
    }
    b.add(WALL, ped);
    b.add(TRIM, res);
    b.add(TRIM, sold);
    // attique : mur en retrait, panneaux sculptés, table d'inscription, corniche
    const aW = A.W - 0.9, aD = A.D - 0.9;
    b.add(WALL, box(aW, A.H - A.entabTop, aD, { top: true }).translate(0, A.entabTop, 0));
    b.add(TRIM, sweep(corniceProfile(A.H - 0.7, 0.7, 0.5), rectRing(0, 0, aW, aD), { closed: true }));
    band(b, rectRing(0, 0, aW, aD), A.entabTop, 0.45, 0.12, { mat: TRIM, closed: true });
    for (const t of [-1, 1]) {
      b.with(pose(0, A.entabTop + 0.75, t * aD / 2, t > 0 ? 0 : Math.PI), () => reliefPanel(b, { width: 4.6, height: 1.9, mat: 'marbre_rose', frame: TRIM }));
      for (const s of [-1, 1]) b.with(pose(s * A.smallX, A.entabTop + 0.75, t * aD / 2, t > 0 ? 0 : Math.PI), () => reliefPanel(b, { width: 2.6, height: 1.9, mat: 'relief_pierre', shift: 2 + s }));
    }
    // quadrige de bronze sur son socle, la Paix sur le char, deux Victoires dorées
    b.add(WALL, box(7.6, 0.9, 4.6).translate(0, A.H, 0));
    b.with(pose(0, A.H + 0.9, -0.2), () => quadriga(b, 'bronze', { scale: 1.3, lod: lod as 0 | 1, driver: { robe: true, armR: { e: 2.2, a: 0.5 }, itemR: 'rameau' } }, 'bronze'));
    for (const s of [-1, 1]) b.with(pose(s * 3.1, A.H + 0.9, 0.9, s * 0.25), () => figure(b, 'or', { height: 2.5, lod: lod as 0 | 1, robe: true, wings: 0.9, armR: { e: 2.3, a: 0.4 }, armL: { e: 0.7, a: 0.7 }, itemR: 'couronne' }, 'or'));
  });
  return b.build('arc_carrousel');
}

export const def: MonumentDef = {
  key: 'arc_carrousel',
  name: 'Arc de triomphe du Carrousel',
  radius: 12,
  height: 19,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const A = ARC, stone = farMaterial(0xe0d6bf), dark = farMaterial(0xc9bea6), bronze = farMaterial(0x3d4a42, 0.9);
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      archBlock(b, {
        width: A.W, height: A.entabTop, depth: A.D, seg: 5, top: false, mat: stone, matVault: dark,
        openings: [{ x: 0, width: A.bigW, height: A.bigH }, { x: -A.smallX, width: A.smallW, height: A.smallH }, { x: A.smallX, width: A.smallW, height: A.smallH }],
      });
      b.add(stone, box(A.W - 0.9, A.H - A.entabTop, A.D - 0.9).translate(0, A.entabTop, 0));
      b.add(bronze, box(5, 3.4, 3.6).translate(0, A.H + 0.6, 0));
    });
    return finishFar(b, 'arc_carrousel');
  },
};
