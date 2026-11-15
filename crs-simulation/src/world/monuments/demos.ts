/* Vitrines du kit pour le banc d'essai (harness/monuments.html?demo=kit | palais). Non chargé par le jeu. */
import * as THREE from 'three';
import type { QualityLevel } from '@/core/contracts';
import {
  Builder, Geo, PALACE_STYLES, addPalace, arcade, archBlock, balustrade, basin, birdGeo, box, column, dome, entablature, figure, horse,
  ironFence, jetArc, jetVertical, lionGeo, pedestal, pedestalRound, pediment, pilaster, pose, quadFit, quadriga, sculptedGroup, spire, stairs,
  steppedBase, steppedBaseRound, tileOf, vasque, waterfall, type KitMat, type Order,
} from './kit';
import { rectRing } from './shape2d';

/** Toutes les pièces du kit côte à côte, pour un contrôle visuel. */
export function buildKitDemo(quality: QualityLevel): THREE.Group {
  const b = new Builder();
  const lod = quality === 'bas' ? 0 : 1;
  // 1. les trois ordres sous un entablement
  const orders: Order[] = ['dorique', 'ionique', 'corinthien'];
  orders.forEach((order, i) => {
    b.with(pose(-30 + i * 4, 0, 0), () => column(b, { order, height: 9, diameter: 0.95, mat: 'pierre_lisse' }));
  });
  entablature(b, [-32, 0.55, -20, 0.55], 9, 1.9, 0.75, { mat: 'pierre_lisse', capEnds: true });
  entablature(b, [-20, -0.55, -32, -0.55], 9, 1.9, 0.75, { mat: 'pierre_lisse', capEnds: true });
  b.add('pierre_lisse', box(12, 0.02, 1.1).translate(-26, 10.9, 0));
  // 2. portique à fronton sur quatre colonnes corinthiennes, mur à pilastres derrière
  b.with(pose(-10, 0, 0), () => {
    stairs(b, 13, 1.2, 2.4, 8, 'pierre_blonde');
    b.with(pose(0, 1.2, -4), () => {
      b.add('pierre_blonde', box(13, 0.01, 8).translate(0, 0, 0));
      for (let i = 0; i < 4; i++) b.with(pose(-4.8 + i * 3.2, 0, 3), () => column(b, { order: 'corinthien', height: 8, diameter: 0.85, mat: 'pierre_lisse' }));
      b.add('pierre_blonde', box(12, 10, 0.6).translate(0, 0, -1));
      for (let i = 0; i < 4; i++) b.with(pose(-4.8 + i * 3.2, 0, -0.7), () => pilaster(b, { order: 'corinthien', height: 8, width: 0.85, mat: 'pierre_lisse' }));
      entablature(b, rectRing(0, 1.1, 11.2, 4.6), 8, 1.6, 0.6, { mat: 'pierre_lisse', closed: true });
      b.with(pose(0, 9.6, 2.9), () => pediment(b, { width: 12.4, rise: 2.6, depth: 0.7, mat: 'pierre_lisse', matTympan: 'relief_pierre' }));
    });
  });
  // 3. arcade à voûtes à caissons, balustrade au-dessus
  b.with(pose(8, 0, 0), () => {
    arcade(b, { length: 15, height: 8, depth: 3, count: 3, mat: 'bossage_blond', matVault: 'caissons' });
    balustrade(b, [-7.5, 1.3, 7.5, 1.3], { y: 8, mat: 'pierre_lisse' });
  });
  // 4. grande arche à voûte à caissons calés
  b.with(pose(24, 0, 0), () => {
    archBlock(b, { width: 12, height: 13, depth: 6, openings: [{ x: 0, width: 6.4, height: 10 }], mat: 'pierre_doree', matVault: 'caissons', coffers: { around: 9, across: 4 }, seg: 18 });
    entablature(b, rectRing(0, 0, 12, 6), 13, 1.6, 0.7, { mat: 'pierre_lisse', closed: true });
    b.with(pose(-4.6, 2, 3), () => sculptedGroup(b, 'pierre_lisse', { width: 2.6, height: 6, depth: 1.1, seed: 3 }));
    const [tw, th] = tileOf('relief_pierre');
    b.add('relief_pierre', quadFit(3.2, 5, 3.02, 5.8, 5, 3.02, 5.8, 7, 3.02, 3.2, 7, 3.02, 0, 0, tw * (2.6 / 8), th));
  });
  // 5. dôme nervuré à lanternon sur tambour, flèche
  b.with(pose(42, 0, 0), () => {
    b.add('pierre_blonde', new Geo().append(box(12, 5, 12)));
    b.with(pose(0, 5, 0), () => {
      pedestalRound(b, 5, 3, 'pierre_lisse', 24, 0.35);
      b.with(pose(0, 3, 0), () => dome(b, { radius: 5, height: 6.5, mat: 'plomb', ribs: 12, matRibs: 'or', lantern: { radius: 1.1, height: 4.2, mat: 'pierre_lisse', matRoof: 'or', finial: 'croix' } }));
    });
  });
  b.with(pose(54, 0, 0), () => {
    b.add('pierre_grise', box(4, 8, 4));
    b.with(pose(0, 8, 0), () => spire(b, { radius: 2.2, height: 14, mat: 'ardoise', finial: 'croix', matFinial: 'or' }));
  });
  // 6. socles, emmarchements et statuaire
  b.with(pose(-30, 0, 16), () => {
    const y = steppedBase(b, rectRing(0, 0, 4, 4), 3, 0.4, 0.2, 'granit_gris');
    b.with(pose(0, y, 0), () => {
      const top = pedestal(b, { width: 2.4, depth: 2.4, height: 3, mat: 'pierre_lisse', matDie: 'relief_bronze' });
      b.with(pose(0, top, 0), () => figure(b, 'bronze', { height: 3, lod, robe: true, hat: 'phrygien', armR: { e: 2.6, a: 0.6 }, itemR: 'rameau', itemL: 'tablette' }));
    });
  });
  b.with(pose(-22, 0, 16), () => {
    const y = steppedBaseRound(b, 1.8, 2, 0.4, 0.2, 'marbre_blanc');
    b.with(pose(0, y, 0), () => {
      const top = pedestalRound(b, 1.2, 2.2, 'marbre_rouge');
      b.with(pose(0, top, 0), () => figure(b, 'or', { height: 2.4, lod, wings: 1, fly: true, armR: { e: 2.7, a: 0.3 }, itemR: 'torche', itemL: 'chaine', legR: { e: 0.9, a: Math.PI, e2: 1.4, a2: Math.PI } }));
    });
  });
  b.with(pose(-14, 0, 16), () => horse(b, 'bronze_vert', { scale: 1.6, rear: 0.55 }));
  b.with(pose(-6, 0, 16), () => quadriga(b, 'bronze_vert', { scale: 1.5, lod }, 'or'));
  b.add('bronze', lionGeo('debout', 1.6).translate(4, 0, 16));
  b.add('bronze', lionGeo('couche', 1.6).translate(8, 0, 16));
  b.add('or', birdGeo('aigle', 1.6).translate(12, 0, 16));
  b.add('or', birdGeo('coq', 1.6).translate(15, 0, 16));
  b.with(pose(18, 0, 16), () => figure(b, 'pierre_lisse', { height: 1.8, lod }));
  b.with(pose(20.5, 0.5, 16), () => figure(b, 'pierre_lisse', { height: 1.9, lod, seated: true, robe: true, armL: { e: 1.2, a: 0.3 }, itemL: 'torche' }));
  b.add('pierre_lisse', box(0.9, 0.5 + 0.52, 0.9).translate(20.5, 0, 15.6));
  // 7. fontaine : bassin, vasque, jets
  b.with(pose(34, 0, 18), () => {
    basin(b, { radius: 6, rim: 0.8, mat: 'pierre_lisse', inner: 1.2 });
    pedestalRound(b, 1.2, 1.6, 'fonte');
    const rim = vasque(b, { radius: 2.4, y: 1.6, height: 1.8, mat: 'fonte' });
    const jets = new Geo();
    jets.append(jetVertical(0, rim - 0.1, 0, 2.6, 0.5));
    jets.append(waterfall(2.4, rim - 0.05, 2.9, 0.6, 24));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      jets.append(jetArc([Math.sin(a) * 5.2, 0.9, Math.cos(a) * 5.2], [Math.sin(a) * 1.6, rim - 0.1, Math.cos(a) * 1.6], 1.6, 0.14));
    }
    b.add('jet', jets);
  });
  // 8. grille, et nuancier des matériaux
  ironFence(b, [26, 26, 44, 26], { height: 2.2, mat: 'grille_doree', wall: { height: 0.5, mat: 'pierre_lisse' }, postEvery: 3, matPost: 'fer_noir' });
  const swatches: KitMat[] = ['pierre_blonde', 'pierre_claire', 'pierre_grise', 'pierre_doree', 'bossage_blond', 'bossage_gris', 'calcaire_patine', 'marbre_blanc',
    'marbre_rose', 'marbre_rouge', 'granit_rose', 'granit_gris', 'zinc', 'plomb', 'ardoise', 'bronze', 'bronze_vert', 'bronze_sombre', 'or', 'fonte', 'fer_eiffel', 'verre'];
  swatches.forEach((m, i) => b.add(m, box(3, 3, 0.6).translate(-30 + i * 3.4, 0, 30)));
  b.add('treillis_eiffel', quadFit(46, 0, 30, 52, 0, 30, 52, 6, 30, 46, 6, 30, 0, 0, 2, 2));
  b.add('treillis_eiffel_fin', quadFit(53, 0, 30, 59, 0, 30, 59, 6, 30, 53, 6, 30, 0, 0, 1, 1));
  return b.build('vitrine-kit');
}

/** Emprises d'essai : palais en U à pavillons, quadrilatère à cour, emprise biaise, corps de logis étroit. */
export function buildPalaceDemo(): THREE.Group {
  const b = new Builder();
  // U ouvert vers +z (cour d'honneur), 120 × 80 m, ailes de 22 m
  const u = [-60, -40, -60, 40, -38, 40, -38, -16, 38, -16, 38, 40, 60, 40, 60, -40];
  addPalace(b, u, PALACE_STYLES.renaissance);
  // quadrilatère à cour intérieure
  b.with(pose(150, 0, 0), () => addPalace(b, rectRing(0, 0, 90, 70), PALACE_STYLES.classique, { holes: [rectRing(0, 0, 50, 32)] }));
  // emprise biaise à pans coupés (comme une emprise relevée sur le plan de la ville)
  const skew = [-40, -18, -46, 6, -30, 30, 8, 34, 44, 20, 50, -8, 30, -30, -10, -32];
  b.with(pose(0, 0, 130), () => addPalace(b, skew, PALACE_STYLES.sobre));
  // corps de logis étroit à toit-terrasse
  b.with(pose(150, 0, 120), () => addPalace(b, rectRing(0, 0, 110, 16), PALACE_STYLES.neoclassique));
  return b.build('vitrine-palais');
}
