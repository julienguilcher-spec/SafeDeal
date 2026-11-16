/* =====================================================================================
 * HISTORIQUE — module : chaque partie jouée est inscrite dans la sauvegarde (section « historique »),
 * avec ses chiffres clés et sa configuration, et des cumuls sur toutes les parties.
 * Branchement : import { createSystems as history } from '@/gameplay/history'.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { HistorySystem } from './system';

export { HistorySystem } from './system';
export type { HistorySystemOptions } from './system';
export {
  HISTORY_MAX, HISTORY_MAX_CONFIG_CHARS, HISTORY_MIN_SECONDS, HISTORY_SAVE_SECTION, HISTORY_SERVICE, HISTORY_UPDATED_EVENT,
} from './api';
export type {
  HistoryApi, HistoryCareer, HistoryEntry, HistoryFigures, HistoryFile, HistoryMissionResult, HistoryOutcome, HistoryTotals,
} from './api';
export { HistoryBook, addToTotals, emptyFigures, emptyTotals, keepConfig, sanitizeEntry, sanitizeHistory } from './book';

export const createSystems: ModuleFactory = () => [new HistorySystem()];
