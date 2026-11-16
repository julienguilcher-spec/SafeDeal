/* =====================================================================================
 * Radio — types publics et clés de services.
 *
 * Services publiés par le module (ctx.provide) :
 *   'radio.phrases'    RadioPhrases   bibliothèque de phrases opérationnelles (clés documentées dans PHRASES.md)
 *   'radio.callsigns'  CallsignBook   indicatifs (salle, commandant, compagnie, sections, groupes, moyens spéciaux)
 *   'radio.control'    RadioControl   ambiance, sous-titres, statistiques de la file d'attente
 * Et ctx.radio (RadioApi du contrat) : say(), log, clear().
 * ===================================================================================== */

import type { EntityId, Person, RadioChannel, Squad } from '@/core/contracts';

export const RADIO_PHRASES_SERVICE = 'radio.phrases';
export const RADIO_CALLSIGNS_SERVICE = 'radio.callsigns';
export const RADIO_CONTROL_SERVICE = 'radio.control';

/** Valeur d'un paramètre de phrase : un nombre est dit « à la radio » (chiffres un par un). */
export type PhraseParam = string | number | null | undefined;
export type PhraseParams = Readonly<Record<string, PhraseParam>>;

/** Rôle d'un correspondant dans une phrase (détermine l'indicatif employé). */
export type PhraseRole =
  | 'central' | 'unite' | 'cible' | 'commandant' | 'drone' | 'canon' | 'centaure' | 'bravm'
  | 'samu' | 'pompiers' | 'liaison' | 'tous' | 'presse';

export type PhraseEnd = 'parlez' | 'termine' | 'aucun';

export interface PhraseInfo {
  readonly key: string;
  /** Famille de situations (pour la documentation). */
  readonly group: string;
  readonly from: PhraseRole;
  readonly to: PhraseRole;
  readonly channel: RadioChannel;
  readonly priority: 0 | 1 | 2;
  readonly end: PhraseEnd;
  /** Réponse à un appel : la formule d'appel se réduit à « ICI APPELANT. ». */
  readonly reply: boolean;
  /** Nombre de variantes. */
  readonly variants: number;
  /** Paramètres reconnus dans les variantes (tous facultatifs : une valeur par défaut existe). */
  readonly params: readonly string[];
}

export interface SayOptions {
  /** Remplace le canal par défaut de la phrase. */
  channel?: RadioChannel;
  /** Remplace la priorité par défaut (0 ambiance, 1 normal, 2 urgent). */
  priority?: 0 | 1 | 2;
  /**
   * Impose l'indicatif de l'émetteur (texte au format « MISTRAL 2 »), quel que soit le rôle prévu par la phrase :
   * permet par exemple aux pompiers (« SAPEUR 1 ») de dire une phrase écrite pour le SAMU.
   */
  from?: string;
  /** Destinataire : unité (ou son identifiant) dont l'indicatif remplace celui prévu, ou indicatif déjà écrit. */
  to?: Squad | number | string;
  /** Personne qui parle (animation, position, voix). */
  personId?: EntityId;
  /**
   * Unité qui parle quand la phrase est dite par une unité : fournit l'indicatif, le lieu ({lieu}, si « at » est absent)
   * et la direction de face ({direction}). Pour une phrase dite par un autre rôle (commandant, salle, secours…),
   * c'est l'unité concernée : elle ne fournit que le lieu, et l'indicatif du destinataire quand il est « unite ».
   */
  squad?: Squad | number;
  /** Position dont on parle : sert à nommer le secteur ({lieu}, {voie}) quand il n'est pas fourni. Prime sur l'unité. */
  at?: { x: number; z: number };
  /** Impose la variante (indice) au lieu du tirage. */
  variant?: number;
}

export interface RadioPhrases {
  /**
   * Compose et diffuse la phrase. Retourne false si la clé est inconnue ou si le message est écarté
   * par l'anti-répétition ou par la file d'attente.
   */
  say(key: string, params?: PhraseParams, options?: SayOptions): boolean;
  /** Texte complet (formule d'appel comprise) d'une variante ; chaîne vide si la clé est inconnue. */
  text(key: string, params?: PhraseParams, variant?: number): string;
  /** Texte de toutes les variantes. */
  variants(key: string, params?: PhraseParams): string[];
  has(key: string): boolean;
  info(key: string): PhraseInfo | undefined;
  /** Toutes les clés, dans l'ordre de la bibliothèque. */
  readonly keys: readonly string[];
}

export interface CallsignBook {
  /** Salle de commandement : « CENTRAL ». */
  readonly central: string;
  /** Nom de la compagnie (vent) : « MISTRAL » par défaut, modifiable par session.config.extra.compagnie. */
  readonly company: string;
  /**
   * Le commandant unique (commandement et autorité habilitée) : il parle sous l'indicatif de sa compagnie,
   * « MISTRAL » (bible E.5 et E.7 : « MISTRAL DEUX ICI MISTRAL »).
   */
  readonly commandant: string;
  /** Indicatif d'une unité (ou, à défaut, de la personne). */
  callsign(who: Squad | Person | number): string;
  /** Forme dite à la radio : chiffres épelés (« MISTRAL 2 » → « MISTRAL DEUX »). */
  spoken(callsign: string): string;
  /** Indice de voix stable (0..5) dérivé de l'indicatif. */
  voiceOf(callsign: string): number;
  /** Indicatif d'un moyen spécial : cherche une unité existante, sinon la valeur par défaut. */
  special(kind: 'canon' | 'centaure' | 'drone' | 'bravm' | 'samu' | 'pompiers' | 'liaison'): string;
}

export interface RadioStats {
  /** Messages diffusés depuis le début de la session. */
  broadcast: number;
  /** Messages écartés par l'anti-répétition. */
  repeated: number;
  /** Messages d'ambiance ou de file saturée abandonnés après une trop longue attente. */
  dropped: number;
  /** Messages en attente, tous canaux confondus. */
  pending: number;
}

export interface RadioControl {
  /** Ambiance radio automatique (messages de faible priorité toutes les 20 à 40 s). */
  ambient: boolean;
  /** Sous-titres des messages de priorité ≥ 1 (ctx.ui.subtitle). */
  subtitles: boolean;
  readonly stats: RadioStats;
  /** Nombre de messages en attente sur un canal. */
  pending(channel: RadioChannel): number;
  /** Instant (temps de session) où le canal sera libre. */
  busyUntil(channel: RadioChannel): number;
  /** Vide les files d'attente (sans toucher au journal). */
  flush(): void;
}
