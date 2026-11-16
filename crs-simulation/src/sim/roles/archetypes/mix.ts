/* =====================================================================================
 * ARCHÉTYPES — parts de chaque profil selon le type de journée.
 * Table reprise telle quelle de docs/research/03-dynamique-manifestation.md §2.3 et de la bible §F.1
 * (valeurs estimées ; les scénarios tendus forcent le trait).
 * ===================================================================================== */

import type { ProtestProfile } from '@/core/contracts';
import type { CrowdScenario } from './api';

export type ProfileShares = Readonly<Record<ProtestProfile, number>>;

function shares(
  pacifique: number, famille: number, militant: number, service_ordre: number, meneur: number, opportuniste: number,
  radical: number, pilleur: number,
): ProfileShares {
  return Object.freeze({
    pacifique: pacifique / 100, famille: famille / 100, militant: militant / 100, service_ordre: service_ordre / 100,
    meneur: meneur / 100, opportuniste: opportuniste / 100, radical: radical / 100, pilleur: pilleur / 100,
  });
}

/** Parts en pourcentage de l'effectif de manifestants (somme = 100). */
export const SCENARIO_PROFILES: Readonly<Record<CrowdScenario, ProfileShares>> = {
  marche_calme: shares(62, 10, 20, 5, 0.5, 2, 0.3, 0.2),
  journee_tendue: shares(59, 5, 20, 4, 0.5, 8, 2, 1.5),
  samedi_sans_organisateur: shares(60, 3, 5, 0, 0.5, 20, 10, 1.5),
  soir_spontane: shares(55, 0, 8, 0, 0.5, 25, 8, 3.5),
  soir_de_match: shares(78, 6, 0, 0, 0, 10, 2, 4),
};

/** Mobilisation agricole : beaucoup de militants de la profession, très peu de suiveurs (estimé). */
export const FARMERS_PROFILES: ProfileShares = shares(60, 5, 25, 4, 1, 4, 0.8, 0.2);

export const SCENARIO_IDS: readonly CrowdScenario[] = [
  'marche_calme', 'journee_tendue', 'samedi_sans_organisateur', 'soir_spontane', 'soir_de_match',
];

/** Tiers du cortège pour 1 000 manifestants : journalistes, observateurs, street medics (bible §F.1). */
export const BYSTANDERS_PER_1000: Readonly<Record<CrowdScenario, readonly [number, number, number]>> = {
  marche_calme: [4, 2, 3],
  journee_tendue: [8, 3, 6],
  samedi_sans_organisateur: [10, 3, 8],
  soir_spontane: [8, 2, 5],
  soir_de_match: [3, 0, 0],
};
