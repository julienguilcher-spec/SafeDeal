/* =====================================================================================
 * CRS SIMULATION FRANCE — catalogue de missions : point d'entrée
 * -------------------------------------------------------------------------------------
 * MISSIONS regroupe toutes les missions ; missionById et missionsFor les retrouvent.
 * Les missions sont des données (MissionDef) : le cadre de mission les interprète.
 * ===================================================================================== */

import type { PlayableRole } from '../../../core/contracts';
import type { MissionDef } from '../../../core/missions-schema';
import { BRAVM } from './bravm';
import { CANON_EAU } from './canon-eau';
import { CENTAURE } from './centaure';
import { CHEF_GROUPE } from './chef-groupe';
import { COMMANDANT } from './commandant';
import { CRS } from './crs';
import { DRONE } from './drone';
import { ECOLE } from './ecole';
import { JOURNALISTE } from './journaliste';
import { MANIFESTANT } from './manifestant';
import { MEDECIN } from './medecin';
import { POMPIER } from './pompier';

export { BRAVM, CANON_EAU, CENTAURE, CHEF_GROUPE, COMMANDANT, CRS, DRONE, ECOLE, JOURNALISTE, MANIFESTANT, MEDECIN, POMPIER };

/** Toutes les missions du catalogue, dans l'ordre : école, rôles de police, détachements, rôles civils. */
export const MISSIONS: readonly MissionDef[] = [
  ...ECOLE, ...CRS, ...CHEF_GROUPE, ...COMMANDANT, ...BRAVM, ...CENTAURE, ...CANON_EAU, ...DRONE,
  ...MEDECIN, ...POMPIER, ...JOURNALISTE, ...MANIFESTANT,
];

const BY_ID: ReadonlyMap<string, MissionDef> = new Map(MISSIONS.map((m) => [m.id, m]));

/** Retrouve une mission par son identifiant (undefined si elle n'existe pas). */
export function missionById(id: string): MissionDef | undefined {
  return BY_ID.get(id);
}

/**
 * Missions dont le rôle principal est celui demandé. Le rôle « commissaire » n'existe plus : c'est un alias
 * du commandant (BRIEF §1). Les versions d'une même scène sous d'autres rôles s'obtiennent par mirrorsOf.
 */
export function missionsFor(role: PlayableRole): MissionDef[] {
  const r: PlayableRole = role === 'commissaire' ? 'commandant' : role;
  return MISSIONS.filter((m) => m.role === r);
}

/** Missions miroirs d'une mission : la même scène (lieu, heure, foule) jouée sous un autre rôle. */
export function mirrorsOf(id: string): MissionDef[] {
  return MISSIONS.filter((m) => m.mirrorOf === id);
}
