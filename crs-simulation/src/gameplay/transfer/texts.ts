/* =====================================================================================
 * TRANSFERT DES INTERPELLÉS — textes en français : lignes d'état des fourgons cellulaires, messages radio.
 *
 * Les phrases communes au terrain (ligne d'ordre, carte « Ma mission ») viennent de src/ui/command/direct/words.ts
 * (CUSTODY_TEXTS, vanWords, durationText) : le même mot partout. Ici, ce que seul le transfert dit.
 * ===================================================================================== */

import { CUSTODY_TEXTS, durationText, vanWords } from '@/ui/command/direct/words';

/** « Fourgon cellulaire 1 » (majuscule en tête de ligne). */
export function vanTitle(callsign: string): string {
  const w = vanWords(callsign);
  return w.charAt(0).toLocaleUpperCase('fr-FR') + w.slice(1);
}

/** « 1 », « 75-03 » : ce qui suit « CELLULAIRE » dans l'indicatif (« le 2 arrive »). */
export function vanNumber(callsign: string): string {
  const rest = callsign.replace(/^\s*(fourgon\s+)?cellulaire\s*/i, '').trim();
  return rest === '' ? callsign : rest;
}

/** « 8 interpellés », « un interpellé ». */
export function detaineesWords(n: number): string {
  return n === 1 ? 'un interpellé' : `${n} interpellés`;
}

/**
 * Radio et ligne au départ d'un fourgon : « CELLULAIRE 1 part au commissariat du 3e avec 8 interpellés. CELLULAIRE 2
 * prend la remise dans 2 min. » `at` : « au commissariat du 3e », « à la préfecture de police », « au commissariat ».
 * `next` : l'indicatif du fourgon qui prend la remise ('' : aucun), `eta` : son arrivée (s ; 0 : il est déjà sur place),
 * `gap` : sans autre fourgon, la durée pendant laquelle il n'y en a plus sur place (s).
 */
export function departText(van: string, at: string, n: number, next: string, eta: number, gap: number): string {
  const head = `${van} part ${at} avec ${detaineesWords(n)}.`;
  if (next !== '') return eta > 1 ? `${head} ${next} prend la remise dans ${durationText(eta)}.` : `${head} ${next} prend la remise.`;
  return `${head} ${CUSTODY_TEXTS.noVanFor(gap)}.`;
}

/**
 * Ligne d'un fourgon qui doit partir mais attend son remplaçant (« un fourgon toujours sur place ») :
 * « Fourgon cellulaire 1 complet — part dès que le 2 arrive (40 s) » ; pas encore plein :
 * « Fourgon cellulaire 1 (5/8) — part dès que le 2 arrive (40 s) ».
 */
export function waitText(van: string, n: number, seats: number, next: string, eta: number): string {
  if (n >= seats && seats > 0) return CUSTODY_TEXTS.waitsForNext(van, vanNumber(next), eta);
  return `${vanTitle(van)} (${n}/${seats}) — part dès que le ${vanNumber(next)} arrive (${durationText(eta)})`;
}

/** « vers le commissariat du 3e », « vers la préfecture de police » d'après « au … » / « à la … ». */
export function towardText(at: string): string {
  if (at.startsWith('au ')) return 'vers le ' + at.slice(3);
  if (at.startsWith('à la ')) return 'vers la ' + at.slice(5);
  return 'vers ' + at;
}

/**
 * Ligne d'un fourgon qui doit partir, sans autre fourgon qui vienne (aucune relève possible) : il attend encore, au plus
 * trois minutes — « Fourgon cellulaire 1 complet — part dans 2 min 40, aucun autre fourgon en vue ».
 */
export function waitAloneText(van: string, n: number, seats: number, left: number): string {
  const head = n >= seats && seats > 0 ? `${vanTitle(van)} complet` : `${vanTitle(van)} (${n}/${seats})`;
  return `${head} — part dans ${durationText(left)}, aucun autre fourgon en vue`;
}

/** Ligne d'un fourgon en route vers le commissariat : « Fourgon cellulaire 1 — vers le commissariat du 3e (5 interpellés) ». */
export function enRouteText(van: string, at: string, n: number): string {
  return `${vanTitle(van)} — ${towardText(at)} (${detaineesWords(n)})`;
}

/** Radio d'un fourgon parti au commissariat, retenu par des voitures à l'arrêt, qui met le deux-tons pour passer. */
export function heldText(): string {
  return 'Retenu par des véhicules à l’arrêt, je passe au deux-tons';
}

/** Ligne d'un fourgon qui revient : « Fourgon cellulaire 1 — revient à la remise (2 min) ». */
export function backText(van: string, eta: number): string {
  return `${vanTitle(van)} — revient à la remise (${durationText(eta)})`;
}

/** Ligne d'un fourgon au commissariat : « Fourgon cellulaire 1 — au commissariat du 3e, repart dans 1 min 20 ». */
export function atStationText(van: string, at: string, wait: number): string {
  return `${vanTitle(van)} — ${at}, repart dans ${durationText(wait)}`;
}

/** Radio d'un fourgon de relève : « CELLULAIRE 75-03 prend la remise, arrivée dans 2 min. » */
export function reliefText(van: string, eta: number): string {
  return `${van} vient prendre la remise, arrivée dans ${durationText(eta)}`;
}

/** Radio d'un fourgon qui repart du commissariat : « CELLULAIRE 1 reprend la remise, arrivée dans 3 min. » */
export function returnText(van: string, eta: number): string {
  return `${van} reprend la remise, arrivée dans ${durationText(eta)}`;
}

/** Remise faite sans commissariat sur la carte : « 8 interpellés remis au commissariat, retour à la remise ». */
export function droppedText(n: number): string {
  return `${n === 1 ? 'Un interpellé remis' : `${n} interpellés remis`} au commissariat, à l’officier de police judiciaire, retour à la remise`;
}

/** Nom du commissariat sans site sur la carte (relevé « déposé au commissariat »). */
export const OFF_MAP_STATION = 'commissariat';
export const OFF_MAP_AT = 'au commissariat';

/** Patrouille : CENTRAL envoie un fourgon pour l'interpellé de l'équipage. */
export function patrolVanText(van: string, eta: number): string {
  return `Fourgon cellulaire ${vanNumber(van)} envoyé pour votre interpellé, arrivée dans ${durationText(eta)}. Ou ramenez-le à la voiture`;
}

/** Patrouille : la voiture arrivée au commissariat avec ses interpellés. */
export function carDeliveredText(at: string, n: number): string {
  return `Arrivés ${at}, ${n === 1 ? 'un interpellé remis' : `${n} interpellés remis`} à l’officier de police judiciaire`;
}

/** Cadre radio habituel : « CENTRAL ICI CELLULAIRE 1. Texte. TERMINÉ. » */
export function frame(to: string, from: string, body: string): string {
  const text = body.trim();
  const dot = /[.!?]$/.test(text) ? '' : '.';
  return `${to} ICI ${from}. ${text.charAt(0).toLocaleUpperCase('fr-FR')}${text.slice(1)}${dot} TERMINÉ.`;
}

/** Refus de « Partir au commissariat » (le terrain les met dans « X ne peut pas : … U : une autre unité. »). */
export const DEPART_REFUS = {
  inconnu: 'ce n’est pas un fourgon cellulaire',
  vide: 'aucun interpellé à bord',
  enRoute: 'il est déjà en route vers le commissariat',
  joueur: 'vous êtes à bord : descendez d’abord',
  conducteur: 'personne au volant',
  itineraire: 'aucun itinéraire jusqu’au commissariat',
} as const;
