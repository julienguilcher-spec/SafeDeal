/* Palais du Louvre : le palais entier sur son emprise réelle (≈ 665 × 327 m, 71 000 m² bâtis).
 * Au fond (côté −z, à l'est) la cour Carrée et sa colonnade ; deux longues ailes — Richelieu au nord (−x, rue de
 * Rivoli), Denon au sud (+x, Seine) — encadrent la cour Napoléon puis le Carrousel jusqu'aux pavillons de Marsan et
 * de Flore. Pavillons à haut comble en dôme carré, guichets traversants (grands guichets du Carrousel, guichets de
 * Rohan, passage Richelieu, porte des Lions, quatre passages de la cour Carrée), verrières des cours de l'aile nord.
 * Murs ≈ 22,5 m à la corniche, combles ≈ 29 m, pavillons 38 à 44 m. La pyramide et l'arc du Carrousel sont des
 * monuments distincts. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, Geo, archBlock, balustrade, box, farMaterial, finishFar, frustum, pose, prism, type PalaceStyle } from '../kit';
import { addBody } from '../kit/x-palais-corps';
import { flag, hipRoof, pavilion, portico, type PavilionOpts } from '../kit/x-palais-pieces';
import { orect, planOf, simplifyRing, solidsMinus } from '../x-palais-plan';
import { ringBounds, signedArea, transformRing } from '../shape2d';
import { COURS_DENON, COURS_RICHELIEU, COUR_CARREE, EMPRISE, H_MUR, PASSAGES } from '../collide/louvre';

const STYLE: PalaceStyle = {
  id: 'x_louvre', bay: 5.0, stone: 0xdcd0b6,
  floors: [{ height: 8.5, kind: 'arcades' }, { height: 8, kind: 'noble' }, { height: 6, kind: 'etage' }],
  roof: { kind: 'mansart', height: 7.5, mat: 'ardoise', top: 'zinc', lucarnes: true },
  cornice: 1.0, balustrade: true, pavilions: null, pilasters: true, plinth: 1.2,
};

type Pav = [name: string, x: number, z: number, w: number, d: number, rot: number, extra: number, roofH: number, base: number, kind: PavilionOpts['roof']];
/** Pavillons : centre, largeur (x), profondeur (z), rotation, attique, hauteur de comble, altitude de départ des murs. */
const PAVILLONS: Pav[] = [
  ['Turgot', -66.5, 39, 21, 22, 0, 5, 11, 0, 'imperiale'],
  ['Richelieu', -65.6, -38.2, 21, 30, 0, 6, 13.5, H_MUR, 'imperiale'],
  ['Colbert', -67.1, -114.1, 21, 22, 0, 5, 11, 0, 'imperiale'],
  ['Bibliothèque', -124.3, -37.8, 22, 26, -0.08, 5, 11.5, H_MUR, 'imperiale'],
  ['Mollien', 81.1, 38, 21, 22, 0, 5, 11, 0, 'imperiale'],
  ['Denon', 78.9, -39.7, 21, 30, 0, 6, 13.5, 0, 'imperiale'],
  ['Daru', 79.0, -118.5, 21, 22, 0, 5, 11, 0, 'imperiale'],
  ['Marsan', -147.6, 299.6, 33, 30, -0.07, 6, 13, 0, 'imperiale'],
  ['Flore', 147.8, 322.4, 30.6, 29.6, -0.07, 6, 13.5, 0, 'imperiale'],
  ['Horloge', 0.6, -175.1, 30, 21.6, 0.038, 7, 15, H_MUR, 'imperiale'],
  ['Marengo', -73.4, -246.2, 21.4, 26, 0.038, 3.5, 8, H_MUR, 'pavillon'],
  ['Arts', 77.3, -252.2, 26.4, 26, 0.038, 3.5, 8, H_MUR, 'pavillon'],
  ['Lesdiguières', 142.3, 73.6, 17.6, 12, 0.033, 4, 9, 0, 'imperiale'],
  ['La Trémoille', 143.0, 121.0, 17.6, 12, 0.033, 4, 9, 0, 'imperiale'],
];

/** Colonnade de Perrault (façade est) : repère posé sur le nu du mur, +z vers l'extérieur. */
const COL = { ox: -2.75, oz: -330.58, rot: Math.PI + 0.043, half: 37.85, len: 47.5, depth: 4.2, baseH: 8.5, colH: 12, entabH: 2 } as const;

function colonnadeVoids(): number[][] {
  const out: number[][] = [];
  for (const s of [-1, 1]) {
    const c = transformRing([s * COL.half, -COL.depth / 2 + 0.5], COL.ox, COL.oz, COL.rot);
    out.push(orect(c[0], c[1], COL.len, COL.depth + 1, COL.rot));
  }
  return out;
}

function biggest(pieces: number[][], fallback: ArrayLike<number>): number[] {
  let best: number[] = Array.from(fallback), area = 0;
  for (const p of pieces) { const a = Math.abs(signedArea(p)); if (a > area) { area = a; best = p; } }
  return best;
}

function build(site: MonumentSite, quality: QualityLevel) {
  const p = planOf(site, EMPRISE);
  const b = new Builder();
  const low = quality === 'bas';
  b.with(pose(p.ox, 0, p.oz, p.rot), () => {
    // corps : l'emprise réelle, creusée des deux loggias de la colonnade
    const ring = biggest(solidsMinus(p.ring, colonnadeVoids(), 50), p.ring);
    const holes = [COUR_CARREE as number[], ...(COURS_RICHELIEU as number[][]), ...(COURS_DENON as number[][])];
    // le passage de la colonnade reste sous le plancher de la loggia
    const passages = PASSAGES.map((g, i) => (i === 6 ? { ...g, height: 8.4, archHeight: 7, archWidth: 5 } : { ...g }));
    addBody(b, ring, STYLE, { holes, passages, roofTol: 2.5, postEvery: 0, light: low, matVault: 'caissons' });
    // verrières des trois cours de l'aile Richelieu
    for (const c of COURS_RICHELIEU) {
      const bb = ringBounds(c);
      b.add('x_verriere', hipRoof(bb.w + 1.2, bb.d + 1.2, 5.5, 0.25).translate(bb.cx, H_MUR - 1.2, bb.cz));
    }
    for (const [, x, z, w, d, rot, extra, roofH, base, kind] of PAVILLONS) {
      pavilion(b, { x, z, w, d, rot, style: STYLE, extra, roof: kind, roofH, base, topScale: kind === 'imperiale' ? 0.34 : 0.45, crest: 'plomb', lucarnes: !low && base === 0, chimneys: !low && roofH > 10 });
    }
    // colonnade de Perrault : soubassement plein, colonnes jumelées devant deux loggias, avant-corps central à fronton
    b.with(pose(COL.ox, 0, COL.oz, COL.rot), () => {
      const base = new Geo();
      for (const s of [-1, 1]) {
        base.append(box(COL.len, COL.baseH, COL.depth + 0.2).translate(s * COL.half, 0, -COL.depth / 2 + 0.1));
        b.with(pose(s * COL.half, 0, -COL.depth), () => portico(b, { width: COL.len, columns: 7, pairs: true, colH: COL.colH, colD: 1.15, depth: COL.depth + 0.15, baseY: COL.baseH, bare: true, entabH: COL.entabH, flutes: 0 }));
        balustrade(b, [s * COL.half - COL.len / 2, -0.25, s * COL.half + COL.len / 2, -0.25], { y: H_MUR, height: 1.05, mat: 'pierre_lisse', postEvery: 0 });
      }
      b.add('bossage_blond', base);
      // avant-corps central : soubassement percé de la porte, quatre paires de colonnes, fronton
      b.with(pose(0, 0, 2.4), () => archBlock(b, { width: 28.2, height: COL.baseH, depth: 1.7, openings: [{ x: -0.35, width: 5, height: 7 }], mat: 'bossage_blond', seg: 8 }));
      b.with(pose(0, 0, 1.55), () => portico(b, { width: 28, columns: 4, pairs: true, colH: COL.colH, colD: 1.15, depth: 1.7, baseY: COL.baseH, bare: true, entabH: COL.entabH, pediment: 5.2, matTympan: 'relief_pierre', flutes: 0 }));
    });
    b.with(pose(0.6, H_MUR + 22, -175.1), () => flag(b, 6, 3.4));
  });
  return b.build('louvre');
}

export const def: MonumentDef = {
  key: 'louvre',
  name: 'Palais du Louvre',
  radius: 380,
  height: 44.3,
  build,
  buildFar(site) {
    const p = planOf(site, EMPRISE);
    const b = new Builder();
    const stone = farMaterial(0xd6cab0), roof = farMaterial(0x4f5660, 0.2);
    b.with(pose(p.ox, 0, p.oz, p.rot), () => {
      const cour = simplifyRing(COUR_CARREE, 4).reverse();
      const hole: number[] = [];
      for (let i = 0; i < cour.length; i += 2) hole.push(cour[i + 1], cour[i]);
      b.add(stone, prism(simplifyRing(p.ring, 7), 0, H_MUR + 3, {}, [hole]));
      for (const [, x, z, w, d, rot, extra, roofH] of PAVILLONS) {
        if (roofH < 11) continue;
        b.add(roof, frustum(w, d, w * 0.4, d * 0.4, roofH + extra - 3).translate(0, H_MUR + 3, 0), pose(x, 0, z, rot));
      }
    });
    return finishFar(b, 'louvre');
  },
};
