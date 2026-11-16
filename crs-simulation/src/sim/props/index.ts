/* =====================================================================================
 * DÉCOR DYNAMIQUE — mobilier urbain, vitrines, casse, pillage, incendies d'objets, barricades.
 *
 * Fichiers :
 *   api.ts         types publics : service étendu « props.ext », gabarits, événements libres
 *   defs.ts        gabarits réalistes des objets (dimensions, résistance, feu, renversement, ressources)
 *   shop-defs.ts   caractères des commerces par catégorie, enseignes fictives
 *   grid.ts        index spatial des boîtes (un objet inscrit dans toutes les cellules qu'il recouvre)
 *   shared.ts      objets internes (PropObj, ShopObj), noyau commun (infractions, tension, effets)
 *   store.ts       magasin : listes, requêtes, collisions et lancers de rayon exacts
 *   motion.ts      poussée, renversement, glissade, portage, lame des engins
 *   damage.ts      dégâts, vitrages, casse, tags, souffle des explosions
 *   fire.ts        incendie des objets : prise de feu, combustion, propagation, extinction
 *   shops.ts       vitrines : casse, rideau de fer, pillage, incendie de boutique
 *   barricades.ts  détection par regroupement, composite, démontage, enfoncement
 *   tiles.ts       peuplement depuis la carte, mobilier d'ambiance, mémoire des tuiles
 *   sweep.ts       balayage lent : sommeil, exposition au feu, commerçants
 *   handlers.ts    gestes : renverser, pousser, porter, déposer, dépaver, ramasser, piller, dégager,
 *                  éteindre, incendier
 *   system.ts      système de simulation, ctx.props et service étendu
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { PropsSystem } from './system';

export const createSystems: ModuleFactory = () => [new PropsSystem()];

export {
  BARRICADE_CLEARED_EVENT, BARRICADE_EXTENDED_EVENT, GLASS_EVENT, PROPS_EXT_SERVICE, SHUTTER_FORCED_EVENT,
} from './api';
export type {
  BarricadeEvent, BarricadePart, CarryMode, GlassEvent, PropDef, PropMaterial, PropsExtApi, PropsStats, PropsTuning,
  PropView, ShopView, ToppleMode,
} from './api';
export { PROP_DEFS, mapFurnitureKind, materialFactor, propDef } from './defs';
export { shopDef, shopName, shopOpenAt } from './shop-defs';
export type { ShopDef } from './shop-defs';
export { PropsSystem } from './system';
