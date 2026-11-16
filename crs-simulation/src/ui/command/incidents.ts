/* =====================================================================================
 * Incidents : tri par urgence, libellés, moyens adaptés à chaque nature (logique pure).
 * ===================================================================================== */

import type { Incident, IncidentKind, IncidentMeans, IncidentState } from '@/core/extensions';
import type { UnitSymbol } from '../maps/units';

export const INCIDENT_KIND_LABELS: Readonly<Record<IncidentKind, string>> = {
  feu_poubelle: 'Feu de poubelles', feu_barricade: 'Barricade en feu', feu_vehicule: 'Véhicule en feu', feu_boutique: 'Commerce en feu',
  blesse: 'Blessé', agent_a_terre: 'Agent à terre', agent_isole: 'Agent isolé', pillage: 'Pillage en cours',
  barricade: 'Barricade', automobiliste_bloque: 'Automobiliste bloqué', secours_bloques: 'Secours bloqués', suspect: 'Suspect à interpeller',
};

export const URGENCY_LABELS: readonly string[] = ['', 'À traiter', 'Urgent', 'Vital'];

export const STATE_LABELS: Readonly<Record<IncidentState, string>> = {
  ouvert: 'Non traité', assigne: 'Confié', en_cours: 'En cours', resolu: 'Résolu', echoue: 'Échec',
};

export const MEANS_LABELS: Readonly<Record<IncidentMeans, string>> = {
  '': '—', unite: 'Unité', joueur: 'Moi-même', canon_eau: 'Canon à eau', centaure: 'Centaure', bravm: 'BRAV-M',
  pompiers: 'Pompiers', samu: 'SAMU',
};

/** Rang d'un état dans la liste : ce qui attend une décision d'abord. */
const STATE_RANK: Readonly<Record<IncidentState, number>> = { ouvert: 0, assigne: 1, en_cours: 2, echoue: 3, resolu: 4 };

/**
 * Ordre de la liste : non traités avant les incidents confiés, puis urgence décroissante, gravité
 * décroissante, enfin le plus ancien d'abord.
 */
export function compareIncidents(a: Incident, b: Incident): number {
  const sa = STATE_RANK[a.state] ?? 9;
  const sb = STATE_RANK[b.state] ?? 9;
  if (sa !== sb) return sa - sb;
  if (a.urgency !== b.urgency) return b.urgency - a.urgency;
  if (a.severity !== b.severity) return b.severity - a.severity;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id - b.id;
}

/** Copie triée des incidents non clos. */
export function sortIncidents(list: readonly Incident[], out: Incident[] = []): Incident[] {
  out.length = 0;
  for (let i = 0; i < list.length; i++) {
    const inc = list[i]!;
    if (inc.state !== 'resolu' && inc.state !== 'echoue') out.push(inc);
  }
  out.sort(compareIncidents);
  return out;
}

/**
 * Moyens adaptés à une nature d'incident, du plus indiqué au moins indiqué (réalisme des moyens :
 * c'est le canon à eau qui éteint, pas le Centaure ; le Centaure pousse et dégage ; un extincteur
 * suffit pour un petit feu, pas pour un véhicule embrasé).
 */
export const MEANS_FOR: Readonly<Record<IncidentKind, readonly IncidentMeans[]>> = {
  feu_poubelle: ['unite', 'canon_eau', 'pompiers'],
  feu_barricade: ['canon_eau', 'pompiers', 'unite'],
  feu_vehicule: ['pompiers', 'canon_eau'],
  feu_boutique: ['pompiers', 'canon_eau'],
  blesse: ['samu', 'unite', 'pompiers'],
  agent_a_terre: ['unite', 'samu', 'centaure'],
  agent_isole: ['unite', 'bravm', 'centaure'],
  pillage: ['bravm', 'unite'],
  barricade: ['centaure', 'unite', 'canon_eau'],
  automobiliste_bloque: ['unite', 'bravm'],
  secours_bloques: ['unite', 'centaure', 'bravm'],
  suspect: ['bravm', 'unite'],
};

/** Conseil affiché sous l'incident sélectionné. */
export const MEANS_ADVICE: Readonly<Record<IncidentKind, string>> = {
  feu_poubelle: 'Petit feu : un porte-extincteur suffit. Canon à eau ou pompiers s’il se propage.',
  feu_barricade: 'Canon à eau ou pompiers sous protection ; l’extincteur ne suffit pas longtemps.',
  feu_vehicule: 'Véhicule embrasé : pompiers (itinéraire dégagé et protection) ou canon à eau.',
  feu_boutique: 'Feu de bâtiment : pompiers en priorité, sous protection.',
  blesse: 'Blessé grave : SAMU. Sinon un groupe l’extrait vers l’arrière.',
  agent_a_terre: 'Deux boucliers couvrent, deux agents le tirent derrière la ligne.',
  agent_isole: 'Un groupe ou une BRAV-M le rejoint sans délai.',
  pillage: 'BRAV-M ou groupe d’intervention : interpellation sur fait constaté.',
  barricade: 'Le Centaure pousse à la lame après vérification de l’obstacle ; à défaut, un groupe.',
  automobiliste_bloque: 'Un groupe dégage le véhicule et le fait sortir de la zone.',
  secours_bloques: 'Ouvrir un couloir de 3,50 m et escorter les secours.',
  suspect: 'Binôme d’interpellation ou BRAV-M, sur fait constaté.',
};

/** Moyen d'incident correspondant à une unité d'après son symbole. */
export function meansOfSymbol(symbol: UnitSymbol): IncidentMeans {
  switch (symbol) {
    case 'canon_eau': return 'canon_eau';
    case 'centaure': return 'centaure';
    case 'bravm': return 'bravm';
    case 'pompiers': return 'pompiers';
    case 'samu': return 'samu';
    default: return 'unite';
  }
}

/** Âge d'un incident en clair : « 45 s », « 3 min ». */
export function ageLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min`;
}
