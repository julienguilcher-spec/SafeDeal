/* =====================================================================================
 * Module « mise en place de session » (src/gameplay/session) — cadre de mission provisoire.
 *
 * Branchement : `import { createSystems as session } from '@/gameplay/session'` puis l'ajouter aux modules.
 * Un système de simulation pure, id 'session.setup', ordre SystemOrder.RULES − 100 : sur 'session:started'
 * il crée le joueur à son poste, son unité immobile en ligne, les véhicules stationnés et quelques
 * passants, incarne le joueur, puis applique vent / circulation / métro du scénario.
 * Service : ctx.service<SessionSetupApi>('session.setup'). Événements libres : 'ui:loading', 'session:setup'.
 *
 * Côté navigateur, `installLoadingGate(ctx)` (loading.ts) tient l'écran de chargement jusqu'à ce que la
 * ville et les monuments proches soient construits autour du joueur ; la racine de composition l'appelle.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { SessionSetupSystem } from './setup';

export const createSystems: ModuleFactory = () => [new SessionSetupSystem()];

export { SessionSetupSystem } from './setup';
export { installLoadingGate } from './loading';
export type { LoadingGateOptions } from './loading';
export { castFor, isPoliceRole, rankOf } from './roster';
export type { Cast, CastSlot, CastSquad } from './roster';
export { chooseStand, parkingSpot, settle } from './placement';
export type { Stand } from './placement';
export {
  SCENARIO_AREA_RADIUS, SESSION_SETUP_EVENT, SESSION_SETUP_SERVICE, SESSION_SETUP_SYSTEM_ID, UI_LOADING_EVENT,
} from './api';
export type { LoadingProgress, SessionSetupApi, SessionSetupSummary } from './api';
