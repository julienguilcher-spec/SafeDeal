/* =====================================================================================
 * COMMISSARIATS — véhicule garé en réserve (« tenu » par un commissariat).
 *
 * Les véhicules garés dans les places réservées appartiennent au stock d'un site tant que personne ne les engage ni
 * ne monte dedans. Les autres systèmes (foule, circulation, escortes d'engins, « me suivre en colonne », remise des
 * interpellés, carte) doivent les ignorer : ils appellent isHeldVehicle(). Sans le module des commissariats, la
 * réponse est toujours false (comportement inchangé).
 * ===================================================================================== */

import type { EntityId, GameContext } from '@/core/contracts';

/** Clé du service publié par le module de jeu des commissariats (même valeur que COMMISSARIATS_SERVICE). */
const SERVICE = 'police.commissariats';

/** Forme minimale lue ici (le service complet est décrit dans src/gameplay/commissariats/api.ts). */
interface HoldsShape {
  holds?: unknown;
  entryOf?: unknown;
}

/** Le véhicule est-il garé en réserve d'un commissariat (à ignorer par les autres systèmes) ? */
export function isHeldVehicle(ctx: Pick<GameContext, 'service'>, vehicleId: EntityId): boolean {
  const svc = ctx.service<HoldsShape>(SERVICE);
  if (!svc || typeof svc.holds !== 'function') return false;
  return (svc.holds as (id: EntityId) => boolean)(vehicleId) === true;
}

/**
 * L'unité rentre-t-elle à son commissariat (« Rentrer au commissariat », ou relance d'un retour) ? La BRAV-M y rentre
 * à moto, jusqu'à ses places, même toute proche : à pied, elle laissait ses machines là où elle les avait quittées.
 * Sans le module des commissariats, la réponse est toujours false.
 */
export function isReturningHome(ctx: Pick<GameContext, 'service'>, squadId: number): boolean {
  const svc = ctx.service<HoldsShape>(SERVICE);
  if (!svc || typeof svc.entryOf !== 'function') return false;
  const e = (svc.entryOf as (id: number) => { state?: string } | undefined)(squadId);
  return !!e && e.state === 'retour';
}
