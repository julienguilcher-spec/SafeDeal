/* =====================================================================================
 * Page d'accueil — mode carrière : lecture du service 'career' et ajustement du brouillon.
 *
 * En mode « carriere », le brouillon suit la progression enregistrée :
 *   - le rôle doit être ouvert par le grade de carrière (CareerApi.availableRoles), sinon il revient
 *     au rôle de CRS, toujours ouvert ;
 *   - le grade est celui de la carrière ; dans un rôle dont l'échelle ne le contient pas (un commandant
 *     qui rejoue une mission de CRS), c'est le plus haut grade de cette échelle qui ne le dépasse pas ;
 *   - une mission verrouillée n'est pas retenue.
 * Dans les autres modes, rien ne change. Aucun DOM ici : fonctions pures sur le brouillon.
 * ===================================================================================== */

import type { GameContext, PlayableRole, PoliceRank } from '@/core/contracts';
import { CAREER_SERVICE, RANK_ORDER } from '@/gameplay/career/api';
import type { CareerApi } from '@/gameplay/career/api';
import { roleInfo } from './catalog';
import type { ScenarioDraft } from './scenario';

/** Service de carrière s'il est branché (null sinon). */
export function readCareer(ctx: Pick<GameContext, 'service'>): CareerApi | null {
  const api = ctx.service<CareerApi>(CAREER_SERVICE);
  if (!api || typeof api.isMissionAvailable !== 'function' || typeof api.availableRoles !== 'function' || !api.progress) return null;
  return api;
}

/** Grade tenu dans un rôle pour un grade de carrière donné (null pour les rôles civils). */
export function careerRankFor(role: PlayableRole, careerRank: PoliceRank): PoliceRank | null {
  const ladder = roleInfo(role).ranks;
  if (ladder.length === 0) return null;
  const level = RANK_ORDER.indexOf(careerRank);
  let best: PoliceRank | null = null;
  for (const r of ladder) {
    if (RANK_ORDER.indexOf(r) > level) continue;
    if (!best || RANK_ORDER.indexOf(r) > RANK_ORDER.indexOf(best)) best = r;
  }
  return best ?? ladder[0]!;
}

/** Ajuste le brouillon (en place) à la carrière quand le mode carrière est choisi. */
export function fitDraftToCareer(draft: ScenarioDraft, career: CareerApi | null): ScenarioDraft {
  if (!career || draft.mode !== 'carriere') return draft;
  const roles = career.availableRoles();
  if (roles.indexOf(draft.role) < 0) {
    const crs = roleInfo('crs');
    draft.role = 'crs';
    draft.poste = crs.defaultPoste;
    draft.variante = '';
  }
  draft.rank = careerRankFor(draft.role, career.progress.rank);
  if (draft.missionId && !career.isMissionAvailable(draft.missionId)) draft.missionId = '';
  return draft;
}
