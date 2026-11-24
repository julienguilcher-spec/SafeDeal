/* =====================================================================================
 * Ordres directs sur le terrain (« J'ordonne, ils y vont ») — logique pure et contrats.
 *
 *   types.ts    DirectEnv, Designation, DirectUnit, Addressee (la vue étroite de la partie) ;
 *   words.ts    la roue (numéros gardés), « Plus… », formes courtes de la pastille, mots des verbes, distances ;
 *   natural.ts  l'ordre prêt (Entrée) et la ligne « autre » (Maj+Entrée), la stabilité de la ligne ;
 *   who.ts      « À qui » : choix automatique par poste, cycle de U, choix manuel pour un seul ordre ;
 *   caps.ts     ce que chaque unité accepte, refus en une phrase, motifs de la simulation en clair ;
 *   travel.ts   quand rouler (une règle pour la fiche, le terrain et le Qui) ;
 *   tickets.ts  l'état d'un ordre du joueur, de « reçu » à « en place » ;
 *   state.ts    la ligne d'une unité, le résumé « AVEC VOUS · … » ;
 *   env.ts      lecture de la partie en cours (seul fichier qui lit ctx, en lecture seule).
 * Le moteur (runtime.ts, P8), le clavier et la désignation (P9), le HUD (P10) et le téléphone (P11) s'appuient dessus.
 * ===================================================================================== */

export type {
  Addressee, Designation, DesignatedPerson, DetaineeInfo, DirectEnv, DirectUnit, DirectVerb, FreePair, PlayerOrderInfo, Poste,
  UnitKind, WhoKey,
} from './types';
export {
  COERCIVE_VERBS, DIGIT_ALIASES, DIRECT_FOLLOW_WHEEL, DIRECT_MORE_RING, DIRECT_RESCUE_RING, DIRECT_WHEEL, KEY_GO, KEY_LINE, KEY_OTHER,
  NOTHING_LINE, OFFENDER_WORDS, PILL_SHORT_FORMS, RESCUE_LINE, RESCUE_LINE_KEYS, UNDO_HINT, VERB_WORDS, atPlace, distText, durationText,
  fitsPill, keyedLine, offenderWords, pillWhoText, placeBare, placeWithArticle, sectorForDigit, textWidthPx, undoButtonText,
  CUSTODY_TEXTS, DETAINEE_GUIDANCE, ownUnitAboardText, vanLabelText, vanWords,
} from './words';
export type { DirectSector, DirectSectorAction, VerbWords } from './words';
export { FLASH, HOLD, RANGE, holdNatural, isFlashing, naturalOrder, vanLabel, verbAllowedFor } from './natural';
export type { HeldNatural, NaturalOrder, NaturalRule } from './natural';
export {
  BRAVM_ARREST_RANGE, RECENT_ORDER, VERB_ORDER, WHO_AUTO, addressableUnitOf, consumeWho, cycleWho, defaultAddressee, everyone, isFree,
  leavesText, nextWho, resolveWho, topUnits, unitOfKey, wholeLabelOf, whoCycle, whoLabel, whyNobody,
} from './who';
export type { WhoState } from './who';
export {
  CAP_REFUSALS, REFUS, SIM_REASON_WORDS, accepts, capRefusal, isKnownSimReason, reasonKey, refusForce, simReasonWords, simRefusal,
  unitKindOf,
} from './caps';
export { motorizes, travelOf } from './travel';
export type { TravelUnit } from './travel';
export {
  BLOCK_WORDS, blockWords, doneText, emptySnapshot, expired, newTicket, next, readiness, ticketText, ticketVerb,
} from './tickets';
export type { ConvoyStage, Ticket, TicketSnapshot, TicketState } from './tickets';
export { AVEC_VOUS, NO_ORDER_TAG, countText, followPosture, groupSummary, orderTag, unitLine } from './state';
export type { FollowPosture, SummaryUnit, UnitLineSnapshot } from './state';
export { designationAt, directEnvFromCore, offenderLabel, posteOf } from './env';
export type { DirectEnvOptions } from './env';
