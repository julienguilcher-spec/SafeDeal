/* =====================================================================================
 * Ordres directs — LES TICKETS : un état par ordre du joueur, de « reçu » à « en place », avec sa raison et son
 * compte à rebours (logique pure : un réducteur sur des instantanés de la simulation ; P8 en fait le moteur).
 *
 *   newTicket(...)                 créé au moment même de l'ordre (état « recu ») ;
 *   readiness(instantané)          ce que l'unité finit avant d'y aller et dans combien de temps : assis dans les
 *                                  fourgons (« descend des fourgons », max par véhicule des assis × 0,35 s + 1 s), en
 *                                  colonne (« en fourgons », reste du trajet / 9 m/s), stationnement (« se garent »,
 *                                  ≤ 10 s), BRAV-M qui remonte (« remonte sur les motos », 6 s) ou qui descend de ses
 *                                  motos (« descend des motos ») ;
 *   next(ticket, instantané, t)    l'état suivant :
 *     recu      0 à 1 s après l'ordre        « MISTRAL 2 · Bloquer rue de Rivoli · reçu »
 *     attente   assis, colonne, motos        « MISTRAL 2 · Bloquer · descend des fourgons — prêt dans 5 s »
 *     route     ≥ 20 % des agents en marche  « MISTRAL 2 · Bloquer rue de Rivoli · en route — 40 m »
 *     action    interpellation, refoulement  « BRAV-M · Interpeller · poursuite — 12 m »
 *     en_place  manœuvre faite               « MISTRAL 2 · rue de Rivoli barrée ✓ » (6 s)
 *     bloque    surveillance (P8)            « MISTRAL 2 · bloqué : la route est barrée — ils finissent à pied »
 *     refuse    refus                        la phrase du refus (6 s)
 *     remplace  nouvel ordre à cette unité   (retiré)
 *   ticketText(ticket)             la ligne ; expired(ticket, t) : à retirer.
 * La puce d'état, les étiquettes d'ordre de la carte et les tests lisent le même ticket.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import { simRefusal } from './caps';
import type { DirectVerb } from './types';
import { VERB_WORDS, atPlace, distText, durationText, placeBare, placeWithArticle } from './words';

export type TicketState = 'recu' | 'attente' | 'route' | 'action' | 'en_place' | 'bloque' | 'refuse' | 'remplace';

/** Durées (s) : « reçu » au plus, « en place » et « refus » affichés avant retrait. */
export const RECU_TIME = 1;
export const SHOW_DONE = 6;
export const SHOW_REFUSED = 6;
/** Part minimale des agents en marche pour « en route ». */
export const ROUTE_SHARE = 0.2;
/** Sortie d'un agent assis (s, chaque véhicule en parallèle) + 1 s de marge. */
export const EXIT_PER_AGENT = 0.35;
/** Vitesse moyenne d'une colonne (m/s), remontée sur les motos (s), stationnement au plus (s). */
export const CONVOY_SPEED = 9;
export const REMOUNT_TIME = 6;
export const PARK_MAX = 10;
/** Vitesse à pied pour l'ETA « en route » (m/s), sans autre indication. */
export const FOOT_SPEED = 2.4;

export interface Ticket {
  id: number;
  squadId: number;
  /** Indicatif (« MISTRAL 2 », « FAUCON 1 »). */
  who: string;
  verb: DirectVerb;
  orderType: OrderType | null;
  /** Lieu sans article (« rue de Rivoli »), '' sinon. */
  place: string;
  issuedAt: number;
  state: TicketState;
  /** Entrée dans l'état actuel. */
  since: number;
  /** Raison (« descend des fourgons », « en fourgons ») et délai (s) pour attente / route / action ; -1 : sans délai. */
  reason: string;
  eta: number;
  /** Distance restante (m) pour « en route », -1 : inconnue. */
  distance: number;
  /** Phrase du refus, ou raison du blocage, '' sinon. */
  why: string;
  /**
   * Retour de l'unité après une interpellation ou un secours terminé : elle reprend d'elle-même « Avec moi » (plan
   * §3.2) — la ligne dit « revient avec vous », pas « Avec moi · reçu » (le joueur n'a rien ordonné).
   */
  back?: boolean;
}

/** Étape d'un convoi (sim/police/command/convoy.ts). */
export type ConvoyStage = 'embarquement' | 'depart' | 'route' | 'stationnement' | 'debarquement' | 'annule' | 'fini' | string;

/** Ce que la simulation dit de l'unité à cet instant (P8 le lit ; les tests l'écrivent). */
export interface TicketSnapshot {
  /** Agents valides de l'unité, agents assis (hors conducteurs qui ne bougent pas) et assis par véhicule. */
  agents: number;
  seated: number;
  seatedPerVehicle: readonly number[];
  /** Parmi les assis, ceux qui sont en selle sur une moto (BRAV-M : « descend des motos », pas « des fourgons »). */
  seatedOnMotos?: number;
  /** Agents en marche vers le point. */
  moving: number;
  /** Distance du centre de l'unité au point (m). */
  distance: number;
  /** Colonne : étape, reste du trajet (m), attente restante au stationnement (s). */
  convoy: { stage: ConvoyStage; remaining: number; waitLeft: number } | null;
  /** L'ordre attend la fin de la colonne (afterConvoy) : délai estimé (s). */
  queued: { eta: number } | null;
  /** BRAV-M : étape (« remontee », « en_selle », « a_pied »…) et temps restant estimé (s). */
  bravm: { stage: string; eta: number } | null;
  /** Action en cours : poursuite d'un individu, refoulement, extraction, distance (m). */
  action: { kind: 'poursuite' | 'refoulement' | 'secours' | 'remise'; distance: number } | null;
  /** Manœuvre terminée (seuil « en place » du §2.3) ; ok faux : abandonnée avec `reason`. */
  done: { ok: boolean; reason: string } | null;
  /** Refus de la simulation (police:order_refused, startTask) : motif brut. */
  refused: string | null;
  /** Blocage relevé par la surveillance (P8), en clair (« la route est barrée »). */
  blocked: string | null;
  /** Un nouvel ordre du joueur à cette unité remplace celui-ci. */
  replaced: boolean;
}

/** Ticket au moment même de l'ordre (état « reçu »). */
export function newTicket(id: number, squadId: number, who: string, verb: DirectVerb, orderType: OrderType | null, place: string, now: number): Ticket {
  return {
    id, squadId, who, verb, orderType, place: placeBare(place), issuedAt: now, state: 'recu', since: now, reason: '', eta: -1, distance: -1, why: '',
  };
}

/** Instantané vide (aucune information) : base des tests et du moteur. */
export function emptySnapshot(): TicketSnapshot {
  return {
    agents: 0, seated: 0, seatedPerVehicle: [], seatedOnMotos: 0, moving: 0, distance: -1, convoy: null, queued: null, bravm: null, action: null, done: null,
    refused: null, blocked: null, replaced: false,
  };
}

/** Ce que l'unité finit avant d'y aller, et dans combien de temps (null : rien, elle y va). */
export function readiness(s: TicketSnapshot): { reason: string; eta: number; state: 'attente' | 'route' } | null {
  const c = s.convoy;
  if (s.queued) return { reason: 'à l’arrivée', eta: s.queued.eta, state: 'route' };
  if (c && c.stage === 'route') return { reason: 'en fourgons', eta: c.remaining / CONVOY_SPEED, state: 'route' };
  if (c && c.stage === 'stationnement') return { reason: 'se garent', eta: Math.min(PARK_MAX, Math.max(0, c.waitLeft)), state: 'attente' };
  if (s.bravm && s.bravm.stage === 'remontee') return { reason: 'remonte sur les motos', eta: s.bravm.eta >= 0 ? s.bravm.eta : REMOUNT_TIME, state: 'attente' };
  // la BRAV-M roule vers le point (ou amène ses motos) : « en selle », pas « descend des motos — prêt dans … » — elle
  // est assise parce qu'elle y va à moto
  if (s.bravm && (s.bravm.stage === 'route' || s.bravm.stage === 'rapprochement') && s.seated > 0) return { reason: 'en selle', eta: -1, state: 'route' };
  if (s.seated > 0) {
    let worst = 0;
    for (const n of s.seatedPerVehicle) worst = Math.max(worst, n);
    if (worst === 0) worst = s.seated;
    const out = Math.max(0, s.agents - s.seated);
    const counted = c && (c.stage === 'debarquement' || c.stage === 'embarquement' || c.stage === 'depart') && s.agents > 0 ? ` (${out}/${s.agents})` : '';
    // à moto (BRAV-M) : ils descendent des motos, pas des fourgons
    const motos = (s.seatedOnMotos ?? 0) >= s.seated;
    return { reason: `${motos ? 'descend des motos' : 'descend des fourgons'}${counted}`, eta: worst * EXIT_PER_AGENT + 1, state: 'attente' };
  }
  return null;
}

function enter(t: Ticket, state: TicketState, now: number): Ticket {
  return state === t.state ? t : { ...t, state, since: now };
}

/** État suivant du ticket d'après l'instantané (réducteur pur). */
export function next(t: Ticket, s: TicketSnapshot, now: number): Ticket {
  if (t.state === 'remplace' || t.state === 'refuse' || t.state === 'en_place') {
    return s.replaced && t.state !== 'remplace' ? enter(t, 'remplace', now) : t;
  }
  if (s.replaced) return enter(t, 'remplace', now);
  if (s.refused !== null) return { ...enter(t, 'refuse', now), why: simRefusal(t.who, s.refused) };
  if (s.done) {
    if (s.done.ok) return { ...enter(t, 'en_place', now), reason: '', eta: -1 };
    return { ...enter(t, 'refuse', now), why: simRefusal(t.who, s.done.reason) };
  }
  if (s.blocked !== null) return { ...enter(t, 'bloque', now), why: s.blocked };
  // « reçu » d'abord, pendant une seconde (le joueur voit que l'ordre est pris), puis ce que fait l'unité
  if (t.state === 'recu' && now - t.issuedAt < RECU_TIME) return t;
  if (s.action) return { ...enter(t, 'action', now), reason: s.action.kind, eta: -1, distance: s.action.distance };
  const r = readiness(s);
  if (r) return { ...enter(t, r.state, now), reason: r.reason, eta: r.eta, distance: s.distance };
  if (s.agents > 0 && s.moving / s.agents >= ROUTE_SHARE) {
    return { ...enter(t, 'route', now), reason: 'en route', eta: s.distance >= 0 ? s.distance / FOOT_SPEED : -1, distance: s.distance };
  }
  // « reçu » une seconde au plus ; ensuite l'état reste celui d'avant (formation sur place)
  if (t.state === 'recu' && now - t.issuedAt >= RECU_TIME) return { ...enter(t, 'route', now), reason: 'en route', distance: s.distance };
  return t.state === 'route' ? { ...t, distance: s.distance } : t;
}

/** Le ticket est à retirer (« en place » et refus après 6 s, remplacé tout de suite). */
export function expired(t: Ticket, now: number): boolean {
  if (t.state === 'remplace') return true;
  if (t.state === 'en_place') return now - t.since >= SHOW_DONE;
  if (t.state === 'refuse') return now - t.since >= SHOW_REFUSED;
  return false;
}

/** Libellé du verbe dans un ticket, avec le lieu quand il y en a un (« Bloquer rue de Rivoli »). */
export function ticketVerb(t: Pick<Ticket, 'verb' | 'place'>): string {
  const w = VERB_WORDS[t.verb].label;
  if (t.place === '') return w;
  if (t.verb === 'envoyer') return `${w}\u00a0: ${t.place}`;
  if (t.verb === 'bloquer' || t.verb === 'face_foule' || t.verb === 'disperser' || t.verb === 'tenir' || t.verb === 'repli') return `${w} ${t.place}`;
  return w;
}

/** Voie masculine dont l'article s'élide (« l’escalier ») : l'accord ne se lit pas sur l'article. */
const MASCULINE_ELIDED = /^escalier\b/i;

/** Ce qui est fait, pour « ✓ » (« rue de Rivoli barrée », « au carrefour Voltaire », « interpellé »). */
export function doneText(t: Pick<Ticket, 'verb' | 'place'>): string {
  const w = VERB_WORDS[t.verb];
  // (accord avec la voie : « rue de Rivoli barrée », « boulevard de Magenta barré »)
  if (t.verb === 'bloquer') return t.place !== '' ? `${t.place} ${placeWithArticle(t.place).startsWith('le ') || MASCULINE_ELIDED.test(t.place) ? 'barré' : w.done}` : 'rue barrée';
  if (t.verb === 'envoyer' || t.verb === 'venir') return t.place !== '' ? atPlace(t.place) : 'sur le point';
  return w.done;
}

/** La ligne du ticket (puce d'état, bloc d'ordres, étiquettes de la carte). */
export function ticketText(t: Ticket): string {
  const verb = ticketVerb(t);
  const short = VERB_WORDS[t.verb].label;
  // (retour après une interpellation ou un secours : §3.2 « BRAV-M · revient avec vous », jusqu'à « avec vous ✓ »)
  if (t.back === true && (t.state === 'recu' || t.state === 'attente' || t.state === 'route')) return `${t.who} · revient avec vous`;
  switch (t.state) {
    case 'recu':
      return `${t.who} · ${verb} · reçu`;
    case 'attente':
      return `${t.who} · ${short} · ${t.reason}${t.eta >= 0 ? ` — prêt dans ${durationText(t.eta)}` : ''}`;
    case 'route':
      if (t.reason === 'en fourgons' || t.reason === 'à l’arrivée') return `${t.who} · ${verb} · ${t.reason}${t.eta >= 0 ? ` — ${durationText(t.eta)}` : ''}`;
      if (t.reason === 'en selle') return `${t.who} · ${verb} · en selle${t.distance >= 0 ? ` — ${distText(t.distance)}` : ''}`;
      return `${t.who} · ${verb} · en route${t.distance >= 0 ? ` — ${distText(t.distance)}` : ''}`;
    case 'action':
      return `${t.who} · ${short} · ${actionWord(t.reason)}${t.distance >= 0 ? ` — ${distText(t.distance)}` : ''}`;
    case 'en_place':
      return `${t.who} · ${doneText(t)} ✓`;
    case 'bloque':
      return `${t.who} · bloqué\u00a0: ${t.why} — ils finissent à pied`;
    case 'refuse':
      return t.why;
    case 'remplace':
      return '';
    default:
      return '';
  }
}

function actionWord(kind: string): string {
  switch (kind) {
    case 'poursuite': return 'poursuite';
    case 'refoulement': return 'refoulement en cours';
    case 'secours': return 'secours en cours';
    case 'remise': return 'remise au fourgon';
    default: return kind;
  }
}

/** Raisons de blocage de la surveillance (raison du pilote automatique → mots). */
export const BLOCK_WORDS: Readonly<Record<string, string>> = {
  obstacle: 'la route est barrée',
  personne: 'un piéton bloque le fourgon de tête',
  vehicule: 'un véhicule bloque la route',
  foule: 'la foule barre la route',
  mur: 'la route est barrée',
};

/** Mots d'une raison de blocage (inconnue : « la route est barrée »). */
export function blockWords(reason: string): string {
  return BLOCK_WORDS[reason] ?? 'la route est barrée';
}
