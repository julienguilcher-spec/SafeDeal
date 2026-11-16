/* =====================================================================================
 * Module « mise en place de session » (src/gameplay/session) — cadre de mission provisoire.
 *
 * Branchement : `import { createSystems as session } from '@/gameplay/session'` puis l'ajouter aux modules.
 * Deux systèmes de simulation pure :
 *   - 'session.setup' (ordre SystemOrder.RULES − 100) : sur 'session:started' il choisit l'emplacement des forces
 *     (à l'écart de la manifestation quand il y en a une), fait construire la compagnie et les « moyens engagés » par
 *     le module de police quand il est branché (sinon crée le joueur et son unité directement), gare les véhicules
 *     nez vers la sortie, incarne le joueur, puis applique vent / circulation / métro du scénario.
 *     Service : ctx.service<SessionSetupApi>('session.setup'). Événements libres : 'ui:loading', 'session:setup'.
 *   - 'session.timewarp' (ordre INPUT + 10) : avance rapide ×4 par le bouton « fast_forward ».
 *     Service : ctx.service<TimeWarpApi>('session.timewarp').
 *
 * Côté navigateur, `installLoadingGate(ctx)` (loading.ts) tient l'écran de chargement jusqu'à ce que la
 * ville et les monuments proches soient construits autour du joueur ; la racine de composition l'appelle.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { SessionSetupSystem } from './setup';
import { TimeWarpSystem } from './timewarp';

import { FollowLeaderSystem } from './follow';
import { PlayerOrdersSystem } from './orders';
import { JourneeSystem } from './journee';
export { FollowLeaderSystem } from './follow';
export { ORDER_OBJECTIVE_ID, ORDERS_SERVICE, PlayerOrdersSystem } from './orders';
export type { PlayerOrdersApi } from './orders';
export { JOURNEE_OBJECTIVE_ID, JOURNEE_SERVICE, JourneeSystem } from './journee';
export type { JourneeApi, JourneeStage } from './journee';
export { SERVICE_BASE, isJournee } from './journee-data';

/**
 * Systèmes : mise en place ('session.setup'), avance rapide ('session.timewarp', touche « . »), l'unité suit le joueur
 * ('session.follow', colonne de véhicules), les ordres de la chaîne de commandement IA au joueur ('session.orders') et la
 * journée de service ('session.journee' : caserne, colonne, manifestation, retour).
 */
export const createSystems: ModuleFactory = () => [new SessionSetupSystem(), new TimeWarpSystem(), new FollowLeaderSystem(), new PlayerOrdersSystem(), new JourneeSystem()];

export { SessionSetupSystem } from './setup';
export { FAST_FORWARD_SCALE, TIME_WARP_SERVICE, TimeWarpSystem } from './timewarp';
export type { TimeWarpApi } from './timewarp';
export { installLoadingGate } from './loading';
export type { LoadingGateOptions } from './loading';
export { castFor, isPoliceRole, meansOf, rankOf } from './roster';
export type { Cast, CastSlot, CastSquad, RequestedMeans } from './roster';
export { chooseStand, chooseStandOffCrowd, distanceToRoute, parkingRoom, parkingSpot, settle, supportSpot } from './placement';
export type { Stand } from './placement';
export {
  SCENARIO_AREA_RADIUS, SESSION_SETUP_EVENT, SESSION_SETUP_SERVICE, SESSION_SETUP_SYSTEM_ID, UI_LOADING_EVENT,
} from './api';
export type { EngagedMeans, LoadingProgress, SessionSetupApi, SessionSetupSummary } from './api';
