/* =====================================================================================
 * CARRIÈRE — module : grades, chapitres, missions ouvertes, sanctions, progression sauvegardée.
 * Branchement : import { createSystems as career } from '@/gameplay/career'.
 * ===================================================================================== */

import type { ModuleFactory } from '@/core/contracts';
import { CareerSystem } from './system';

export { CareerSystem } from './system';
export {
  CAREER_RANK_LABELS, CAREER_SAVE_SECTION, CAREER_SERVICE, CAREER_UPDATED_EVENT, CIVIL_ROLES, GRADE_VALUES, MISSION_FINISHED_EVENT,
  RANK_ORDER, ROLES_BY_RANK, gradeLetter, rankIndex, rankOpeningRole,
} from './api';
export type {
  CareerApi, CareerChapterView, CareerGrade, CareerMissionRecord, CareerOutcome, CareerProgress, CareerSanction, ChapterStatus,
  MissionAvailability, SanctionKind,
} from './api';
export {
  CIVIL_CHAPTER, CIVIL_PER_CHAPTER, CareerBook, DETACHMENT_OPENS_AT, LAST_MAIN_CHAPTER, chapterName, defaultProgress, gradeOfResult,
  rolesForRank, sanitizeProgress, sanctionFor,
} from './rules';

export const createSystems: ModuleFactory = () => [new CareerSystem()];
