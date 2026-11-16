/* =====================================================================================
 * Droit — textes : sommations réglementaires, libellés des infractions et des moyens.
 *
 * Les trois phrases des sommations sont celles de l'article R. 211-11 du code de la sécurité
 * intérieure (décret n° 2021-556 du 5 mai 2021), reproduites au caractère près : le texte
 * réglementaire ne porte ni point ni point d'exclamation final (docs/research/00-bible-realisme.md, A.1).
 * ===================================================================================== */

import type { ForceMeans, ForceVerdictKind, OffenseType, SommationStage } from '@/core/contracts';

export const SOMMATION_TEXTS: readonly string[] = [
  '',
  'Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux',
  'Première sommation : nous allons faire usage de la force. Quittez immédiatement les lieux',
  'Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux',
];

export function sommationText(stage: SommationStage): string {
  return SOMMATION_TEXTS[stage] ?? '';
}

/** Nom courant d'une étape (comptes rendus, refus). */
export const STAGE_NAMES: readonly string[] = ['aucune sommation', 'annonce', 'première sommation', 'dernière sommation'];

/** Gravité par défaut des infractions : 1 (contravention) … 5 (crime). */
export const OFFENSE_SEVERITY: Readonly<Record<string, number>> = {
  attroupement_apres_sommations: 2,
  dissimulation_visage: 2,
  jet_projectile: 3,
  violence_agent: 4,
  degradation: 2,
  tag: 1,
  incendie: 4,
  pillage: 3,
  recel: 2,
  barricade: 2,
  port_arme: 3,
  rebellion: 3,
  outrage: 2,
  entrave_circulation: 1,
  violence: 3,
  intrusion: 2,
};

/** Qualification affichée (docs/research/01-doctrine-cadre-legal.md §6.4). */
const OFFENSE_LABELS: Readonly<Record<string, string>> = {
  attroupement_apres_sommations: 'maintien dans un attroupement après les sommations (art. 431-4 du code pénal)',
  dissimulation_visage: "dissimulation du visage aux abords d'une manifestation (art. 431-9-1 du code pénal)",
  jet_projectile: 'jet de projectile',
  violence_agent: "violences sur une personne dépositaire de l'autorité publique (art. 222-14-5 du code pénal)",
  degradation: "dégradation d'un bien (art. 322-1 du code pénal)",
  tag: 'inscription sur un bien (art. 322-1 II du code pénal)',
  incendie: 'destruction par incendie (art. 322-6 du code pénal)',
  pillage: 'vol en réunion dans un commerce',
  recel: 'recel de vol',
  barricade: "édification d'une barricade",
  port_arme: "participation à un attroupement en étant porteur d'une arme (art. 431-5 du code pénal)",
  rebellion: 'rébellion (art. 433-6 du code pénal)',
  outrage: "outrage à une personne dépositaire de l'autorité publique (art. 433-5 du code pénal)",
  entrave_circulation: 'entrave à la circulation',
  violence: 'violences volontaires',
  intrusion: 'intrusion dans un lieu interdit',
};

export function offenseLabel(type: OffenseType): string {
  return OFFENSE_LABELS[type] ?? String(type).replace(/_/g, ' ');
}

export function offenseSeverity(type: OffenseType): number {
  return OFFENSE_SEVERITY[type] ?? 2;
}

/** Nom du moyen, avec article indéfini (« une grenade lacrymogène »). */
export const MEANS_LABELS: Readonly<Record<ForceMeans, string>> = {
  presence: 'la simple présence',
  contact: 'le contact physique',
  baton: 'le bâton de défense',
  gazeuse: "l'aérosol lacrymogène",
  lacrymo: 'la grenade lacrymogène',
  canon_eau: "l'engin lanceur d'eau",
  gm2l: 'la grenade assourdissante-lacrymogène',
  desencerclement: 'la grenade de désencerclement',
  lbd: 'le lanceur de balles de défense',
  arme_feu: "l'arme de service",
  vehicule: 'le véhicule',
};

/** Nom court du moyen (listes, statistiques). */
export const MEANS_SHORT: Readonly<Record<ForceMeans, string>> = {
  presence: 'présence',
  contact: 'contact',
  baton: 'bâton',
  gazeuse: 'aérosol lacrymogène',
  lacrymo: 'grenade lacrymogène',
  canon_eau: "lanceur d'eau",
  gm2l: 'grenade assourdissante-lacrymogène',
  desencerclement: 'grenade de désencerclement',
  lbd: 'LBD',
  arme_feu: 'arme de service',
  vehicule: 'véhicule',
};

export const VERDICT_LABELS: Readonly<Record<ForceVerdictKind, string>> = {
  licite: 'licite',
  disproportionne: 'disproportionné',
  sans_sommation: 'sans sommation',
  non_autorise: 'non autorisé',
  cible_illegitime: 'cible illégitime',
  interdit: 'interdit',
};

/** Objets dont le port en manifestation caractérise le port d'arme (armes par nature ou par destination). */
export const WEAPON_ITEMS: Readonly<Record<string, string>> = {
  pave: 'pavé',
  bouteille: 'bouteille',
  molotov: 'engin incendiaire',
  mortier: "mortier d'artifice",
  marteau: 'marteau',
  barre: 'barre de fer',
  pistolet: 'arme de poing',
  baton: 'bâton de défense',
  tonfa: 'bâton de défense',
  gazeuse: 'aérosol lacrymogène',
  grenade_lacrymo: 'grenade lacrymogène',
  grenade_gm2l: 'grenade assourdissante-lacrymogène',
  grenade_desencerclement: 'grenade de désencerclement',
  lbd40: 'lanceur de balles de défense',
  lanceur_cougar: 'lanceur de grenades',
};

/** Objets saisis à la palpation sans caractériser un port d'arme. */
export const SEIZED_ITEMS: Readonly<Record<string, string>> = {
  fumigene: 'fumigène',
  bombe_peinture: 'bombe de peinture',
  butin: 'marchandise volée',
};

/** Objets tenus en main qui signalent une menace : niveau de menace associé. */
export const HELD_THREAT: Readonly<Record<string, number>> = {
  pave: 2,
  bouteille: 2,
  marteau: 2,
  barre: 2,
  mortier: 4,
  molotov: 4,
  pistolet: 5,
};

/** Projectiles hostiles (lancés par des manifestants). */
export const HOSTILE_PROJECTILES: Readonly<Record<string, boolean>> = {
  pave: true,
  bouteille: true,
  molotov: true,
  mortier: true,
  oeuf_peinture: true,
  debris: true,
};

/** Projectiles tirés au lanceur de grenades (tir tendu interdit). */
export const LAUNCHER_PROJECTILES: Readonly<Record<string, boolean>> = {
  grenade_lacrymo_56: true,
  gm2l: true,
};

/** Durée mm:ss d'un instant de session. */
export function clockText(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
}

/** Heure locale « 16 h 42 » à partir d'une heure décimale. */
export function hourText(timeOfDay: number): string {
  let total = Math.floor((((timeOfDay % 24) + 24) % 24) * 60 + 0.5);
  if (total >= 1440) total -= 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h + ' h ' + (m < 10 ? '0' : '') + m;
}

/** Durée en secondes arrondie pour un message (« 12 s »). */
export function secondsText(s: number): string {
  return Math.max(1, Math.ceil(s)) + ' s';
}
