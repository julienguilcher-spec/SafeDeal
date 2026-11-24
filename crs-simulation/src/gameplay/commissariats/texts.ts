/* =====================================================================================
 * COMMISSARIATS (jeu) — textes en français : noms des sites à la radio, motifs de refus, messages radio.
 * ===================================================================================== */

import type { CommissariatDef } from '@/world/commissariats';

/** Nom du site tel qu'on le dit à la radio : « commissariat du 9e », « préfecture de police », « caserne des Célestins ». */
export function homeName(def: Pick<CommissariatDef, 'kind' | 'short' | 'id'>): string {
  if (def.kind === 'prefecture') return 'préfecture de police';
  if (def.kind === 'caserne_gendarmerie') return 'caserne des ' + def.short;
  return 'commissariat du ' + def.short;
}

/** « au commissariat du 9e », « à la préfecture de police », « à la caserne des Célestins ». */
export function atName(def: Pick<CommissariatDef, 'kind' | 'short' | 'id'>): string {
  if (def.kind === 'prefecture') return 'à la préfecture de police';
  if (def.kind === 'caserne_gendarmerie') return 'à la caserne des ' + def.short;
  return 'au commissariat du ' + def.short;
}

/** Motifs de refus d'un engagement (affichés tels quels par l'interface). */
export const REFUS = {
  inactif: 'Pas de commissariat dans cette partie',
  renforts: 'Moyens fixés par l’ordre d’opération',
  role: 'Seul le commandant engage les moyens des commissariats',
  inconnue: 'Unité inconnue',
  horsDispositif: 'Véhicule hors dispositif : il ne s’engage pas',
  indisponible: 'Unité indisponible',
  impossible: 'Engagement impossible : aucun véhicule en état',
} as const;

/** « CENTRAL ICI TV 75-19. Équipage prêt au commissariat du 9e, en attente de destination. PARLEZ. » */
export function radioFrame(to: string, from: string, body: string, reply = false): string {
  const text = body.trim();
  const dot = /[.!?]$/.test(text) ? '' : '.';
  return `${to} ICI ${from}. ${text.charAt(0).toUpperCase()}${text.slice(1)}${dot} ${reply ? 'PARLEZ.' : 'TERMINÉ.'}`;
}

/** Corps du message d'engagement. */
export function readyText(def: CommissariatDef): string {
  return `Équipage prêt ${atName(def)}, en attente de destination`;
}

/** « un interpellé remis », « 3 interpellés remis ». */
export function detaineesText(n: number): string {
  return n === 1 ? 'un interpellé remis à l’officier de police judiciaire'
    : `${n} interpellés remis à l’officier de police judiciaire`;
}

/** Corps du message d'arrivée d'une unité rappelée. */
export function returnedText(def: CommissariatDef, detainees: number, restSeconds: number): string {
  const rest = Math.round(restSeconds / 60);
  return `Arrivés ${atName(def)}` + (detainees > 0 ? `, ${detaineesText(detainees)}` : '')
    + `, réserves complétées, équipage au repos ${rest} minutes`;
}

/** Corps du message de fin de repos. */
export function availableText(def: CommissariatDef): string {
  return `Équipage reposé, disponible ${atName(def)}`;
}

/** Libellé d'une unité accueillie dans un site qui n'est pas le sien. */
export function adoptedLabel(): string {
  return 'Unité accueillie · places de réserve';
}
