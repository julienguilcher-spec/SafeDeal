/* Fontaine de Varsovie (1937), jardins du Trocadéro, en contrebas du palais de Chaillot et dans son axe.
 * Grand bassin de 25 × 114 m terminé en demi-cercle, tête en croix de 59 m, cascade en gradins entre deux petits
 * bassins hauts, vingt canons à eau tirant vers la tour Eiffel (portée ≈ 50 m), gerbes et colonnes d'eau ; au bas,
 * groupes de bronze doré (taureau et daim de Jouve, chevaux et chien de Guyot) ; en haut, groupes de pierre.
 * Repère SUPPLÉMENTAIRE du système (extra.ts) : absent de landmarks.json. Les plans d'eau eux-mêmes figurent dans la
 * carte ; le modèle apporte margelles, cascade, jets et sculptures, et sa propre lame d'eau 4 cm au-dessus. Les
 * murs des bassins suivent le relief (site.groundAt). Origine au milieu du grand bassin ; +z vers la Seine. */
import type { MonumentDef, MonumentSite } from '../types';
import { Builder, box, farMaterial, finishFar, polygon } from '../kit';
import { varsovieFountain } from '../kit/x-ponts-chaillot';
import { VARSOVIE, varsovieGround, varsovieOutline } from '../x-ponts-chaillot';

function groundOf(site: MonumentSite): (x: number, z: number) => number {
  return (x, z) => { if (site.groundAt) { const y = site.groundAt(x, z); if (Number.isFinite(y)) return y; } return varsovieGround(z); };
}

export const def: MonumentDef = {
  key: 'fontaine_varsovie',
  name: 'Fontaine de Varsovie',
  radius: 82,
  height: 10,
  build(site, quality) {
    const b = new Builder();
    varsovieFountain(b, quality, groundOf(site));
    return b.build('fontaine_varsovie');
  },
  buildFar(site) {
    const b = new Builder();
    const V = VARSOVIE, g = groundOf(site);
    const water = farMaterial(0x5f8f9a, 0.4), stone = farMaterial(0xe2dac6), gold = farMaterial(0xd9b23a, 1.0, 0xffd27a), spray = farMaterial(0xe8f0f2, 0.6);
    b.add(water, polygon(varsovieOutline(6), V.waterY + 0.05));
    for (const [x, z] of V.upper) b.add(water, box(V.upperSize, 0.4, V.upperSize).translate(x, V.waterY + V.drop - 0.3, z));
    b.add(stone, box(2 * V.stepsHalf, V.drop, V.stepsZ1 - V.stepsZ0).translate(0, V.waterY, (V.stepsZ0 + V.stepsZ1) / 2));
    for (const [x, z] of V.animals) { b.add(stone, box(3, 3.4, 5.6).translate(x, g(x, z), z)); b.add(gold, box(1.6, 2.8, 4).translate(x, g(x, z) + 3.4, z)); }
    // panache des canons
    b.add(spray, box(22, 7, 1.2).rotateX(-0.5).translate(0, V.waterY + 1, V.headZ0 + 14));
    return finishFar(b, 'fontaine_varsovie');
  },
};
