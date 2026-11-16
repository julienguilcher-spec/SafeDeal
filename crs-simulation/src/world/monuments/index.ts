/* =====================================================================================
 * MODULE « MONUMENTS » — monuments de Paris modélisés procéduralement.
 * Racine de composition : game.use(createSystems). Les autres modules n'importent que `./api` (types)
 * et, côté simulation, `./colliders` (données pures, sans Three.js).
 *
 * COMMENT AJOUTER UN MONUMENT (deux fichiers, aucun registre à modifier)
 *   1. defs/<clé>.ts — exporte `def: MonumentDef`. La clé est celle du repère de la carte (LandmarkInfo.key),
 *      identique au nom du fichier. Repère local : origine au centre, au sol ; y vers le haut ; façade vers +z ;
 *      mètres. Le système pose le groupe (heightAt) et l'oriente (rotation.y = cap).
 *        import { Builder, box, column, pose, finishFar, farMaterial } from '../kit';
 *        export const def: MonumentDef = {
 *          key: 'madeleine', name: 'Église de la Madeleine', radius: 62, height: 30,
 *          build(site, quality) { const b = new Builder(); …; return b.build('madeleine'); },
 *          buildFar(site) { const b = new Builder(); b.add(farMaterial(0xd8cba8), box(43, 30, 108)); return finishFar(b, 'madeleine'); },
 *        };
 *      - Tout passe par le Builder : b.add(matériau, géométrie) fusionne par matériau (un appel de dessin
 *        par matériau ; viser ≤ 12 matériaux et ≤ 60 000 triangles). b.with(pose(x, y, z, cap), () => …) pose un
 *        sous-ensemble. Les matériaux sont des clés du kit ('pierre_blonde', 'bronze', 'ardoise', 'or'… voir
 *        kit/materials.ts) ; un matériau propre au monument se déclare par defineMaterial('ma_cle', () => litMaterial(…)).
 *      - Un palais sur emprise réelle : addPalace(b, site.footprint, PALACE_STYLES.renaissance) puis ajouter
 *        dôme, portique, fronton… avec les pièces du kit (column, pediment, entablature, dome, arcade, balustrade…).
 *      - `quality` ('bas' | 'moyen' | 'haut' | 'ultra') : réduire segments et statuaire en 'bas'.
 *      - buildFar : ≤ 400 triangles, matériaux unis farMaterial(couleur), finir par finishFar().
 *      - animate(objet, image, lointain) est facultatif (jets, scintillement).
 *   2. collide/<clé>.ts — exporte `colliders(site): MonumentCollider[]` : polygones locaux antihoraires (rectRing,
 *      ngonRing de ../shape2d), `height`, `baseY` (> 2,5 m : on passe dessous). AUCUN import de three ni du kit.
 *      Sans ce fichier, l'emprise du site sert d'obstacle plein.
 *   3. Vérifier : /harness/monuments.html?key=<clé> (jour, nuit, piéton, silhouette), puis ajouter la clé à KEYS
 *      dans tests/e2e/monuments.mjs et dans tests/unit/monuments.*.test.ts (budgets, dimensions réelles, obstacles).
 *   Alias de clés (autres orthographes de la carte) : keys.ts.
 * ===================================================================================== */
import type { ModuleFactory } from '@/core/contracts';
import { MonumentSystem } from './system';

export const createSystems: ModuleFactory = () => [new MonumentSystem()];

export { getMonument, hasMonument, listMonuments } from './registry';
export { getColliders, getWorldColliders, siteOfLandmark, listColliderKeys } from './colliders';
export { canonicalKey } from './keys';
export type { MonumentsApi, MonumentsStats } from './api';
export type { MonumentCollider, MonumentDef, MonumentFrame, MonumentSite } from './types';
