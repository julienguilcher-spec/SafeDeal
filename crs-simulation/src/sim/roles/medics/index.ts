/* =====================================================================================
 * MÉDECINS DE RUE (street medics) — bénévoles dans le cortège, et rôle jouable « médecin ».
 *
 * Brancher : game.addModule(createSystems). Un système, id « roles:medics », ordre CONTROL + 32.
 *   ctx.service<MedicsRecords>('medics.records')   tableau de tri et score du joueur médecin, activité des PNJ
 *   ctx.service<MedicsTuning>('medics.tuning')     réglages
 * Les gestes « soigner », « rincer_yeux », « remettre » et « evacuer » sont enregistrés ici si le module
 * des secours officiels (src/sim/roles/rescue) n'est pas branché ; le service de soins « roles.care » est partagé.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { MedicsSystem } from './system';

export const createSystems: ModuleFactory = () => [new MedicsSystem()];

export { MedicsSystem } from './system';
export { MEDICS_RECORDS_SERVICE, MEDICS_SYSTEM_ID, MEDICS_TUNING_SERVICE, MEDIC_CALL_EVENT } from './api';
export type { MedicCallEvent, MedicEntry, MedicsRecords, MedicsTuning, TriageEntry } from './api';
