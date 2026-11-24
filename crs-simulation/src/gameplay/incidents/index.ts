/* =====================================================================================
 * INCIDENTS À TRAITER — déléguer ou faire soi-même (BRIEF §1).
 *
 * Brancher : game.addModule(createSystems). Un système, id « gameplay:incidents », ordre RULES.
 *   ctx.service<IncidentsApi>(EXT.incidents)            incidents : list, get, open, assign, unassign, close, nearest,
 *                                                       playerIncidentId (interface de src/core/extensions.ts)
 *   ctx.service<IncidentsRecords>('incidents.records')  journal pour l'évaluation (délais, aggravations, tâches du joueur)
 *   ctx.service<IncidentsTuning>('incidents.tuning')    réglages
 * Aucune dépendance d'exécution sur un autre module : tout passe par le contexte (services neutres acceptés).
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { IncidentsSystem } from './system';

export const createSystems: ModuleFactory = () => [new IncidentsSystem()];

export { IncidentsSystem } from './system';
export {
  INCIDENTS_RECORDS_SERVICE, INCIDENTS_SYSTEM_ID, INCIDENTS_TUNING_SERVICE, INCIDENT_CLOSED_EVENT, INCIDENT_OPENED_EVENT,
  INCIDENT_UPDATED_EVENT,
} from './api';
export type {
  IncidentChange, IncidentEvent, IncidentOutcome, IncidentRecord, IncidentStats, IncidentsRecords, IncidentsTuning, PlayerTaskRecord,
} from './api';
