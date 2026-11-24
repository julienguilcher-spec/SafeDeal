/* =====================================================================================
 * Ordres directs — LA LIGNE D'UNE UNITÉ (puce d'état, bloc d'ordres) : « QUI · QUOI · pour qui / où » (logique pure).
 *
 *   unitLine(instantané)        jamais « sans ordre » pour une unité sous ses ordres (§3.2) :
 *     suit le joueur, il marche          « AVEC VOUS · vous suivent »
 *     il s'est arrêté 3 s, foule ≤ 120 m « AVEC VOUS · en ligne face à la foule »
 *     il s'est arrêté, pas de foule      « AVEC VOUS · en garde autour de vous »
 *     « Avec moi » en véhicules          « AVEC VOUS · montent dans les fourgons (14/19) » / « … en colonne derrière vous »
 *     autre ordre du joueur              le ticket, puis l'étiquette (« MISTRAL 2 · barre rue de Rivoli »)
 *     « Laisser agir seuls »             « MISTRAL 2 · agissent seuls »
 *     interpellation / secours finis     « BRAV-M · revient avec vous »
 *     Envoyer fini                       « FAUCON 1 · au carrefour Voltaire · attend vos ordres »
 *   groupSummary(unités, posture)  « AVEC VOUS · 3 sections + BRAV-M · en ligne face à la foule ».
 *   NO_ORDER_TAG « SANS ORDRE » ne sert qu'aux unités que le joueur ne commande pas.
 * ===================================================================================== */

import type { Ticket } from './tickets';
import { ticketText } from './tickets';
import type { DirectVerb } from './types';
import { VERB_WORDS, atPlace } from './words';

export const AVEC_VOUS = 'AVEC VOUS';
export const NO_ORDER_TAG = 'SANS ORDRE';
/** Le joueur est « arrêté » après 3 s sur place ; une foule compte jusqu'à 120 m. */
export const STOP_TIME = 3;
export const CROWD_NEAR = 120;

/** Posture de « Avec moi » quand le joueur est à pied (P2 la donne dans la simulation, sans ordre). */
export type FollowPosture = 'suivent' | 'face_foule' | 'en_garde';

/** Ce que la puce lit d'une unité à cet instant. */
export interface UnitLineSnapshot {
  name: string;
  /** Sous les ordres du joueur. */
  commanded: boolean;
  /** Ordre du joueur en cours ou dernier (null : aucun) et son lieu sans article. */
  playerVerb: DirectVerb | null;
  place: string;
  /** L'ordre du joueur est terminé (« ✓ » montré, puis l'étiquette). */
  done: boolean;
  /** Ticket vivant (reçu → en place, 6 s), null sinon. */
  ticket: Ticket | null;
  /** L'unité suit le joueur (« Avec moi »). */
  followsPlayer: boolean;
  /** « Avec moi » quand le joueur est en véhicule : montée (assis / total) ou colonne derrière lui. */
  vehicles: { boarded: number; total: number; driving: boolean } | null;
  /** Le joueur marche ; arrêté depuis (s) ; une foule à moins de 120 m. */
  playerMoving: boolean;
  playerStoppedFor: number;
  crowdNear: boolean;
  /** Retour vers le joueur après une interpellation ou un secours terminés. */
  returning: boolean;
  /** Étiquette de l'ordre de la simulation pour une unité que le joueur ne commande pas (« TIENT »), '' sinon. */
  simTag: string;
}

/** Posture affichée d'une unité qui suit le joueur à pied. */
export function followPosture(s: Pick<UnitLineSnapshot, 'playerMoving' | 'playerStoppedFor' | 'crowdNear'>): FollowPosture {
  if (s.playerMoving || s.playerStoppedFor < STOP_TIME) return 'suivent';
  return s.crowdNear ? 'face_foule' : 'en_garde';
}

const POSTURE_WORDS: Readonly<Record<FollowPosture, string>> = {
  suivent: 'vous suivent', face_foule: 'en ligne face à la foule', en_garde: 'en garde autour de vous',
};

/** Ce que fait l'unité après un ordre du joueur terminé (« barre rue de Rivoli », « tient sa position »). */
export function orderTag(verb: DirectVerb, place: string): string {
  const w = VERB_WORDS[verb];
  switch (verb) {
    case 'bloquer':
      return place !== '' ? `${w.doing} ${place}` : 'barre la rue';
    case 'envoyer':
    case 'venir':
      return `${place !== '' ? atPlace(place) : 'sur le point'} · attend vos ordres`;
    case 'face_foule':
    case 'tenir':
    case 'tortue':
    case 'libre':
    case 'cesser':
      return w.doing;
    default:
      return place !== '' && w.doing !== '' ? `${w.doing} · ${place}` : w.doing;
  }
}

/** La ligne d'une unité (§3.2). */
export function unitLine(s: UnitLineSnapshot): string {
  if (!s.commanded) return `${s.name} · ${s.simTag !== '' ? s.simTag : NO_ORDER_TAG}`;
  if (s.ticket && s.ticket.state !== 'remplace') return ticketText(s.ticket);
  if (s.returning) return `${s.name} · revient avec vous`;
  if (s.followsPlayer || s.playerVerb === 'avec_moi') {
    const v = s.vehicles;
    if (v) return v.driving ? `${AVEC_VOUS} · en colonne derrière vous` : `${AVEC_VOUS} · montent dans les fourgons (${v.boarded}/${v.total})`;
    return `${AVEC_VOUS} · ${POSTURE_WORDS[followPosture(s)]}`;
  }
  if (s.playerVerb === 'libre') return `${s.name} · agissent seuls`;
  if (s.playerVerb !== null && s.playerVerb !== 'rien') return `${s.name} · ${orderTag(s.playerVerb, s.place)}`;
  return `${s.name} · attend vos ordres`;
}

/** Unité comptée dans le résumé du groupe « avec vous ». */
export interface SummaryUnit {
  symbol: string;
  avecVous: boolean;
}

const COUNT_WORDS: readonly { symbol: string; one: string; many: string }[] = [
  { symbol: 'section', one: 'section', many: 'sections' },
  { symbol: 'groupe', one: 'groupe', many: 'groupes' },
  { symbol: 'binome', one: 'binôme', many: 'binômes' },
  { symbol: 'bravm', one: 'BRAV-M', many: 'BRAV-M' },
  { symbol: 'centaure', one: 'Centaure', many: 'Centaures' },
  { symbol: 'canon_eau', one: 'canon à eau', many: 'canons à eau' },
  { symbol: 'drone', one: 'drone', many: 'drones' },
  { symbol: 'patrouille', one: 'patrouille', many: 'patrouilles' },
];

/** « 3 sections + BRAV-M » : les unités avec le joueur, par genre (la BRAV-M sans nombre). */
export function countText(units: readonly SummaryUnit[]): string {
  const parts: string[] = [];
  for (const w of COUNT_WORDS) {
    const n = units.filter((u) => u.avecVous && u.symbol === w.symbol).length;
    if (n === 0) continue;
    if (w.symbol === 'bravm') parts.push('BRAV-M');
    else parts.push(n === 1 ? `1 ${w.one}` : `${n} ${w.many}`);
  }
  return parts.join(' + ');
}

/** « AVEC VOUS · 3 sections + BRAV-M · en ligne face à la foule » ; '' si personne n'est avec lui. */
export function groupSummary(units: readonly SummaryUnit[], posture: FollowPosture): string {
  const c = countText(units);
  if (c === '') return '';
  return `${AVEC_VOUS} · ${c} · ${POSTURE_WORDS[posture]}`;
}
