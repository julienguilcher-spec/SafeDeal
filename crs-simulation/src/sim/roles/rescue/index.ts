/* =====================================================================================
 * SECOURS OFFICIELS — sapeurs-pompiers et SAMU (BRIEF §1 : « appeler les secours », pompier jouable).
 *
 * Brancher : game.addModule(createSystems). Un système, id « roles:rescue », ordre CONTROL + 30.
 *   ctx.service<RescueApi>(EXT.rescue)               calls, request(kind, x, z, byId, incidentId?), cancel(callId)
 *   ctx.service<RescueExtApi>('rescue.ext')          équipages, unité d'un appel, évaluation de sécurité, pré-positionnement, réglages
 *   ctx.service<RescueRecords>('rescue.records')     journal des interventions
 *   ctx.service<CareApi>('roles.care')               tri et prise en charge des victimes (partagé avec les médecins de rue)
 * Gestes enregistrés : « soigner », « rincer_yeux », « remettre » (aux secours), « evacuer » (charger dans l'ambulance).
 * Aucune dépendance d'exécution sur un autre module : sans module de véhicules, les équipes viennent à pied.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { RescueSystem } from './system';

export const createSystems: ModuleFactory = () => [new RescueSystem()];

export { RescueSystem } from './system';
export {
  CARE_DONE_EVENT, CARE_SERVICE, CARE_TRIAGE_EVENT, RESCUE_CALL_EVENT, RESCUE_EVACUATED_EVENT, RESCUE_EXT_SERVICE,
  RESCUE_RECORDS_SERVICE, RESCUE_SYSTEM_ID,
} from './api';
export type {
  CareApi, CareRecord, CareState, CareVerb, CrewView, RescueCallEvent, RescueExtApi, RescueRecord, RescueRecords, RescueTuning,
  SafetyReport, TriageColor,
} from './api';
