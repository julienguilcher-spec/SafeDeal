/* Lot « palais » — façade de Gabriel, place de la Concorde (hôtel de la Marine et son jumeau) : soubassement à
 * arcades et bossages, colonnade corinthienne de douze colonnes devant une loggia, entablement et balustrade,
 * deux pavillons d'extrémité à quatre colonnes et fronton. Façade vers +z. */
import type { QualityLevel } from '@/core/contracts';
import { Builder } from './builder';
import { Geo, pose } from './geo';
import { box, sweep } from './shapes';
import { balustrade, corniceProfile } from './classical';
import { arcade } from './arch';
import { column } from './column';
import { figureGeo } from './sculpture';
import type { PalaceStyle } from './facade';
import { portico } from './x-palais-pieces';

/** Niveaux de la façade : soubassement, colonnes, entablement (total 19,6 m à la corniche). */
export const GABRIEL = { baseH: 7.4, colH: 10, entabH: 2.2, colD: 0.98, top: 19.6 } as const;

/** Style des murs ordinaires des deux palais (mêmes niveaux que la colonnade). */
export const GABRIEL_STYLE: PalaceStyle = {
  id: 'x_gabriel', bay: 4.4, stone: 0xe2d7be,
  floors: [{ height: 7.4, kind: 'arcades' }, { height: 6.6, kind: 'noble' }, { height: 5.6, kind: 'attique' }],
  roof: { kind: 'comble', height: 3.2, mat: 'ardoise', top: 'ardoise', lucarnes: false },
  cornice: 0.9, balustrade: true, pavilions: null, pilasters: true, plinth: 0.9,
};

export interface GabrielOpts {
  /** Extrémités de la façade (le long de x) et plan du nu du soubassement central (z). */
  x0: number; x1: number; z: number;
  /** Plan du mur des pavillons, derrière leurs colonnes. */
  pavZ: number;
  /** Largeur d'un pavillon et de son avant-corps à colonnes ; saillie de l'avant-corps devant pavZ. */
  pavW?: number; frontW?: number; frontOut?: number;
  /** Profondeur de la loggia réelle derrière la colonnade ; 0 = colonnade plaquée devant un mur existant. */
  loggia: number;
  /** Épaisseur du soubassement à arcades (mur percé). */
  baseDepth: number;
  quality: QualityLevel;
}

/** Ajoute la façade : soubassement à onze arcades, douze colonnes, entablement, balustrades, pavillons. */
export function gabrielFacade(b: Builder, o: GabrielOpts): void {
  const { baseH, colH, entabH, colD } = GABRIEL;
  const pavW = o.pavW ?? 20.9, frontW = o.frontW ?? 14.4, frontOut = o.frontOut ?? 1.0;
  const xa = o.x0 + pavW, xb = o.x1 - pavW, L = xb - xa, xm = (xa + xb) / 2;
  const lod = o.quality === 'bas' ? 0 : 1;
  const stone = 'pierre_lisse', boss = 'bossage_blond';
  // soubassement : onze arcades en plein cintre
  b.with(pose(xm, 0, o.z - o.baseDepth / 2), () => arcade(b, { length: L, height: baseH, depth: o.baseDepth, count: 11, archWidth: (L / 11) * 0.6, archHeight: baseH * 0.8, mat: boss, matVault: stone, seg: lod ? 10 : 6 }));
  if (o.loggia > o.baseDepth) b.add(stone, box(L, 0.45, o.loggia - o.baseDepth, { bottom: true }).translate(xm, baseH - 0.45, o.z - (o.loggia + o.baseDepth) / 2));
  // douze colonnes à l'aplomb des piles
  const zc = o.z - 0.62;
  const col = { order: 'corinthien', height: colH, diameter: colD, mat: stone, flutes: lod ? 16 : 0, seg: 8 } as const;
  for (let i = 0; i < 12; i++) b.with(pose(xa + 0.62 + (i * (L - 1.24)) / 11, baseH, zc), () => column(b, col));
  // entablement : poutre, corniche, dessus ; balustrade haute
  const ya = baseH + colH, bh = entabH * 0.6;
  const beam = new Geo().append(box(L, bh, 1.16, { bottom: true }).translate(xm, ya, zc));
  if (o.loggia > 0) {
    beam.face(xa, ya + 0.02, o.z - o.loggia, xb, ya + 0.02, o.z - o.loggia, xb, ya + 0.02, zc, xa, ya + 0.02, zc);
    b.add('zinc', new Geo().face(xa, ya + entabH, o.z, xb, ya + entabH, o.z, xb, ya + entabH, o.z - o.loggia, xa, ya + entabH, o.z - o.loggia));
  } else b.add('zinc', new Geo().face(xa, ya + entabH, o.z, xb, ya + entabH, o.z, xb, ya + entabH, o.z - o.baseDepth, xa, ya + entabH, o.z - o.baseDepth));
  b.add(stone, beam);
  b.add(stone, sweep(corniceProfile(ya + bh, entabH - bh, 0.85), [xa, o.z - 0.04, xb, o.z - 0.04]));
  balustrade(b, [xa, o.z - 0.3, xb, o.z - 0.3], { y: ya + entabH, height: 1.05, mat: stone, postEvery: L / 11 });
  // garde-corps de la loggia, entre les colonnes
  balustrade(b, [xa, o.z - 0.28, xb, o.z - 0.28], { y: baseH, height: 0.95, mat: stone, postEvery: 0 });
  // pavillons : avant-corps de quatre colonnes sous fronton, sur un socle à bossages
  for (const s of [-1, 1]) {
    const xp = s < 0 ? o.x0 + pavW / 2 : o.x1 - pavW / 2;
    b.with(pose(xp, 0, o.pavZ + frontOut / 2), () => arcade(b, { length: frontW, height: baseH, depth: frontOut, count: 3, archWidth: 2.7, archHeight: baseH * 0.8, mat: boss, matVault: stone, seg: lod ? 10 : 6 }));
    b.add(stone, box(frontW + 0.3, 0.4, frontOut + 0.15, { bottom: true }).translate(xp, baseH - 0.4, o.pavZ + frontOut / 2 + 0.05));
    let top = 0;
    b.with(pose(xp, 0, o.pavZ), () => {
      top = portico(b, { width: frontW, columns: 4, colH, colD, depth: frontOut + 0.05, baseY: baseH, bare: true, pediment: 2.9, entabH, flutes: lod ? 16 : 0, matTympan: 'relief_pierre' }).top;
    });
    // trophée couronnant le pavillon : deux figures assises de part et d'autre d'un cartouche
    if (o.quality !== 'bas') {
      const g = new Geo().append(box(2.2, 2.6, 1.0).translate(0, 0, 0));
      for (const t of [-1, 1]) {
        const f = figureGeo({ height: 3.2, lod: 0, seated: true, robe: true, armR: { e: 1.2, a: 0.8 }, armL: { e: 0.6, a: 0.6 } });
        g.append(f.body.rotateY(t * 0.5).translate(t * 2.0, 0, 0.1));
      }
      b.add(stone, g.translate(xp, top - 0.5, o.pavZ + 0.2));
    }
  }
}
