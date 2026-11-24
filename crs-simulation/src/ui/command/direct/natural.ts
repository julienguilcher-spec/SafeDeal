/* =====================================================================================
 * Ordres directs — L'ORDRE PRÊT : ce que fait Entrée sur ce que le joueur regarde (logique pure, déterministe).
 *
 *   naturalOrder(env, désignation, à-qui)   la première règle qui s'applique (§1.3) :
 *     a  il tient un interpellé : Remettre (fourgon à 12 m), Confier (binôme libre à 60 m), Emmenez-le (fourgon à
 *        100 m), Faire venir le fourgon (plus loin) ;
 *     b  l'unité choisie (U) est un fourgon cellulaire : partir au commissariat / venir ici ;
 *     c  un auteur de fait constaté désigné à moins de 120 m : Interpeller ;
 *     d  un blessé au sol ou un feu à moins de 10 m du point : Secours ici ;
 *     e  le réticule même sur un policier d'une unité sous ses ordres qui n'est pas avec lui (≤ 60 m) : avec moi ;
 *     f  au moins 8 manifestants à 15 m du point (≤ 120 m) : Bloquer ici, face à la foule ;
 *     g  une rue sous le point (≤ 150 m) : Bloquer la rue ;
 *     h  un autre point du sol à 6 m au moins (≤ 400 m) : Envoyer ;
 *     i  rien : ligne grise, aucun ordre (Entrée sur le ciel ne rappelle jamais les barrages).
 *   Disperser, Charger, le gaz ne sont jamais l'ordre prêt : sur une foule, la ligne « autre » (Maj+Entrée) propose
 *   Disperser (les sommations d'abord si elles manquent) ; sur une rue, « Envoyer : rue … » sans la barrer.
 *   holdNatural(affiché, nouveau, t)        la ligne change au plus toutes les 0,5 s ; Entrée donne la ligne affichée.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import type { IntentId } from '../cardTypes';
import { CAP_REFUSALS, REFUS, accepts, capRefusal } from './caps';
import type { Addressee, Designation, DirectEnv, DirectUnit, DirectVerb, WhoKey } from './types';
import { addressableUnitOf, resolveWho, unitOfKey, whoLabel, whyNobody } from './who';
import { NOTHING_LINE, VERB_WORDS, distText, pillWhoText, placeBare, placeWithArticle, vanWords } from './words';

/** Portées (m) des règles du §1.3. */
export const RANGE = {
  /** remettre au fourgon cellulaire */
  vanHandover: 12,
  /** confier à un binôme libre */
  pair: 60,
  /** l'emmener à pied au fourgon (au-delà : le faire venir) */
  vanWalk: 100,
  /** interpeller un auteur désigné */
  arrest: 120,
  /** blessé ou feu autour du point */
  rescue: 10,
  /** rappeler une unité visée au réticule */
  recall: 60,
  /** foule autour du point (rayon) et nombre minimal de manifestants */
  crowdRadius: 15,
  crowdMin: 8,
  crowdOrder: 120,
  /** rue sous le point (recherche) et portée du barrage */
  road: 25,
  block: 150,
  /** point le plus proche, le plus loin pour Envoyer */
  minPoint: 6,
  send: 400,
  /** « Y aller » en formation à moins de 60 m d'une foule (intents.ts NEAR_CROWD) */
  nearCrowd: 60,
} as const;

/** Changement de ligne au plus toutes les HOLD s ; une ligne changée depuis moins de FLASH s clignote. */
export const HOLD = 0.5;
export const FLASH = 0.3;

export type NaturalRule = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i';

/** L'ordre prêt (ou la ligne « autre ») tel qu'il est affiché et donné. */
export interface NaturalOrder {
  rule: NaturalRule;
  verb: DirectVerb;
  /** Un appui donne un ordre (faux : ligne grise, `lock` dit pourquoi). */
  enabled: boolean;
  /** Ligne sans la touche (« Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m »). */
  text: string;
  /** Ligne 1 de la pastille (« Bloquer la rue ») et ligne 2 (« MISTRAL 1 · 90 m »). */
  short: string;
  whoShort: string;
  /** Unité qui reçoit l'ordre (null : le joueur agit lui-même, ou personne). */
  who: Addressee | null;
  /** Point de l'ordre, cap de la ligne (face à la foule), distance au joueur. */
  x: number;
  z: number;
  heading: number;
  distance: number;
  /** Lieu nommé, sans article (« rue Saint-Gilles », « carrefour Voltaire »), '' sinon. */
  place: string;
  /** Ordre de la simulation (null : action du joueur, appel de secours). */
  orderType: OrderType | null;
  /** Intention de la carte dont la ligne de fiche est prise (envoi par buildCard → sendCardLine), null sinon. */
  intent: IntentId | null;
  targetId: number;
  /** Personne désignée (interpellé, auteur, policier), 0 sinon. */
  personId: number;
  /** Phrase de refus ou d'explication (ligne grise, ou les sommations que le premier appui fait faire). */
  lock: string | null;
  /** Le premier appui lance la chaîne légale (sommations) au lieu de l'ordre. */
  legalFirst: boolean;
  /** Ligne « autre » (Maj+Entrée), null s'il n'y en a pas. */
  autre: NaturalOrder | null;
  /** Clé de stabilité : même clé = même ordre (la ligne ne « clignote » pas pour une distance qui bouge). */
  key: string;
}

/** « fourgon cellulaire 1 » d'après l'indicatif « CELLULAIRE 1 ». */
export const vanLabel = vanWords;

function blank(rule: NaturalRule, verb: DirectVerb, x: number, z: number, distance: number): NaturalOrder {
  return {
    rule, verb, enabled: true, text: '', short: VERB_WORDS[verb].short, whoShort: '', who: null, x, z, heading: 0, distance, place: '',
    orderType: null, intent: null, targetId: 0, personId: 0, lock: null, legalFirst: false, autre: null, key: '',
  };
}

function finish(o: NaturalOrder): NaturalOrder {
  o.key = [o.rule, o.verb, o.who ? o.who.squadIds.join('+') : '-', o.place, o.personId, o.enabled ? 1 : 0].join('|');
  return o;
}

/** Ligne d'ordre « VERBE · QUI (quitte …) · DISTANCE ». */
function withWho(verbPhrase: string, who: Addressee | null, distance: number | null): string {
  const parts = [verbPhrase];
  if (who) parts.push(who.leaves !== '' ? `${who.label} (${who.leaves})` : who.label);
  if (distance !== null) parts.push(distText(distance));
  return parts.join(' · ');
}

/** Refus propre à l'unité choisie (capacités, BRAV-M sur un barrage alors qu'une section existe). */
function refusalFor(env: DirectEnv, who: Addressee, verb: DirectVerb): string | null {
  if (who.squadIds.length !== 1) return null;
  const u = env.units.find((q) => q.squadId === who.squadIds[0]);
  if (!u) return null;
  const cap = capRefusal(u.kind, verb);
  if (cap) return cap;
  if (u.kind === 'bravm' && (verb === 'bloquer' || verb === 'face_foule') && who.manual
    && env.units.some((q) => q.kind === 'troupe' && q.squadId !== env.ownSquadId && q.symbol !== 'compagnie' && q.valid > 0)) {
    return CAP_REFUSALS.bravmBloquer;
  }
  return null;
}

/** Remplit QUI et la ligne ; sans unité ou avec un refus, la ligne devient grise avec la phrase. */
function addressed(env: DirectEnv, o: NaturalOrder, whoKey: WhoKey, verbPhrase: string, showDistance: boolean): NaturalOrder {
  const who = resolveWho(env, whoKey, o.verb, o.x, o.z);
  o.who = who;
  if (!who) {
    o.enabled = false;
    o.lock = whyNobody(o.verb, env);
    o.text = verbPhrase;
    o.whoShort = '';
    return finish(o);
  }
  const refusal = refusalFor(env, who, o.verb);
  if (refusal) {
    o.enabled = false;
    o.lock = refusal;
  }
  // la distance lue est celle que l'unité va parcourir (d'elle au point), pas celle du joueur au point : « MISTRAL 2 ·
  // 25 m » se lisait pour une section à 130 m de là, « MISTRAL 4 · 16 m » pour une section à plus d'un kilomètre
  const shown = showDistance ? unitDistance(env, who, o) : null;
  o.text = withWho(verbPhrase, who, shown);
  o.whoShort = pillWhoText(who.label, shown);
  return finish(o);
}

/** Distance des unités adressées au point de l'ordre (la plus éloignée, à plusieurs) ; à défaut celle du joueur. */
function unitDistance(env: DirectEnv, who: Addressee, o: NaturalOrder): number {
  let far = -1;
  for (const id of who.squadIds) {
    const u = env.units.find((q) => q.squadId === id);
    if (u) far = Math.max(far, Math.hypot(u.x - o.x, u.z - o.z));
  }
  return far >= 0 ? far : o.distance;
}

function demonstrators(env: DirectEnv, x: number, z: number, r: number): { count: number; x: number; z: number } {
  return env.demonstratorsAt(x, z, r);
}

/** Disperser possible sans sommations : seulement après la 3e, ou en riposte. */
function dispersalLock(env: DirectEnv, x: number, z: number): boolean {
  return env.sommations < 3 && !env.riposteAt(x, z);
}

/** Ligne « autre » Disperser (Maj+Entrée) sur une foule. */
function disperserOther(env: DirectEnv, base: NaturalOrder, whoKey: WhoKey): NaturalOrder {
  const o = blank(base.rule, 'disperser', base.x, base.z, base.distance);
  o.orderType = 'refoulement';
  o.intent = 'disperser';
  o.heading = base.heading;
  o.place = base.place;
  const who = resolveWho(env, whoKey, 'disperser', o.x, o.z);
  o.who = who;
  if (!who) {
    o.enabled = false;
    o.lock = whyNobody('disperser', env);
    o.text = 'Disperser la foule';
    return finish(o);
  }
  const refusal = refusalFor(env, who, 'disperser');
  if (refusal) {
    o.enabled = false;
    o.lock = refusal;
    o.text = withWho('Disperser la foule', who, null);
  } else if (dispersalLock(env, o.x, o.z)) {
    // le premier appui fait faire les sommations (chaîne légale) ; la ligne le dit
    o.legalFirst = true;
    o.lock = REFUS.disperserSommations(who.label);
    o.text = 'Disperser\u00a0: sommations d’abord';
  } else {
    o.text = withWho('Disperser la foule', who, null);
  }
  o.whoShort = pillWhoText(who.label, null);
  return finish(o);
}

/** « Y aller » : en formation près d'une foule, en file sinon (même règle que la fiche, intents.ts goLine). */
function goType(env: DirectEnv, x: number, z: number): OrderType {
  return demonstrators(env, x, z, RANGE.nearCrowd).count >= RANGE.crowdMin ? 'avancer' : 'colonne';
}

/** Ligne « autre » Envoyer sur une rue (y aller sans la barrer). */
function sendOther(env: DirectEnv, base: NaturalOrder, whoKey: WhoKey): NaturalOrder {
  const o = blank(base.rule, 'envoyer', base.x, base.z, base.distance);
  o.orderType = goType(env, o.x, o.z);
  o.intent = 'envoyer';
  o.place = base.place;
  const done = addressed(env, o, whoKey, `Envoyer\u00a0: ${o.place}`, false);
  done.text = `Envoyer\u00a0: ${o.place}`;
  return done;
}

// ───────────────────────────── règles ─────────────────────────────

/** Fourgons cellulaires sous ses ordres, le plus proche du joueur d'abord (places libres d'abord à distance égale). */
function vansByDistance(env: DirectEnv): { u: DirectUnit; d: number; free: boolean }[] {
  const p = env.player;
  if (!p) return [];
  return env.units.filter((u) => u.kind === 'cellulaire').map((u) => ({
    u, d: Math.hypot(u.x - p.x, u.z - p.z), free: (u.seats ?? 0) - (u.detainees ?? 0) > 0,
  })).sort((a, b) => a.d - b.d || a.u.squadId - b.u.squadId);
}

/** Règle a : le joueur tient un interpellé. null : aucune issue (pas de fourgon, pas de binôme). */
function detaineeRule(env: DirectEnv): NaturalOrder | null {
  const p = env.player;
  if (!env.detainee || !p) return null;
  const vans = vansByDistance(env).filter((v) => v.free);
  const near = vans[0];
  if (near && near.d <= RANGE.vanHandover && env.can.remettre) {
    const o = blank('a', 'remettre', near.u.x, near.u.z, near.d);
    o.personId = env.detainee.personId;
    o.text = `Remettre l’interpellé au ${vanLabel(near.u.name)}`;
    o.whoShort = vanLabel(near.u.name);
    return finish(o);
  }
  const pair = env.freePair;
  if (pair && pair.distance <= RANGE.pair && env.can.confier) {
    const o = blank('a', 'confier', p.x, p.z, pair.distance);
    o.personId = env.detainee.personId;
    o.who = { squadIds: [pair.squadId], label: pair.name, distance: pair.distance, leaves: '', manual: false };
    o.text = `Confier l’interpellé à ${pair.name}`;
    o.whoShort = pillWhoText(pair.name, pair.distance);
    return finish(o);
  }
  if (near && near.d <= RANGE.vanWalk) {
    // aucun binôme libre : l'emmener à pied, le fourgon est marqué et sa distance dite
    const o = blank('a', 'emmener', near.u.x, near.u.z, near.d);
    o.personId = env.detainee.personId;
    o.text = `Emmenez-le au ${vanLabel(near.u.name)} · ${distText(near.d)}`;
    o.whoShort = pillWhoText(vanLabel(near.u.name), near.d);
    return finish(o);
  }
  if (near && env.can.faireVenir) {
    const o = blank('a', 'faire_venir', p.x, p.z, near.d);
    o.personId = env.detainee.personId;
    o.orderType = 'colonne';
    o.who = { squadIds: [near.u.squadId], label: near.u.name, distance: near.d, leaves: '', manual: false };
    o.text = `Faire venir le ${vanLabel(near.u.name)} ici · ${distText(near.d)}`;
    o.whoShort = pillWhoText(vanLabel(near.u.name), near.d);
    return finish(o);
  }
  return null;
}

/** Règle b : l'unité choisie est un fourgon cellulaire. */
function vanRule(env: DirectEnv, whoKey: WhoKey): NaturalOrder | null {
  const van = unitOfKey(env, whoKey);
  const p = env.player;
  if (!van || van.kind !== 'cellulaire' || !p) return null;
  const n = van.detainees ?? 0;
  const who: Addressee = { squadIds: [van.squadId], label: van.name, distance: Math.hypot(van.x - p.x, van.z - p.z), leaves: '', manual: true };
  if (n > 0 && env.can.transfert) {
    const o = blank('b', 'partir', van.x, van.z, who.distance);
    o.who = who;
    o.text = `${van.name}\u00a0: partir au commissariat (${n}/${van.seats ?? 0})`;
    o.whoShort = pillWhoText(van.name, null);
    return finish(o);
  }
  const o = blank('b', 'venir', p.x, p.z, who.distance);
  o.who = who;
  o.orderType = 'colonne';
  o.text = `${van.name}\u00a0: venir ici`;
  o.whoShort = pillWhoText(van.name, who.distance);
  return finish(o);
}

/**
 * L'ordre prêt pour cette désignation et ce choix « À qui » (§1.3). Déterministe : mêmes entrées, même ordre.
 */
export function naturalOrder(env: DirectEnv, des: Designation, whoKey: WhoKey = 'auto'): NaturalOrder {
  const a = detaineeRule(env);
  if (a) return a;
  const b = vanRule(env, whoKey);
  if (b) return b;

  const x = des.x, z = des.z, d = des.distance;
  const nothing = (): NaturalOrder => {
    const o = blank('i', 'rien', x, z, d);
    o.enabled = false;
    o.text = NOTHING_LINE;
    o.lock = REFUS.rien;
    o.short = '';
    return finish(o);
  };
  if (des.kind === 'none' || (d < RANGE.minPoint && des.kind !== 'person')) return nothing();

  const person = des.person;
  // c : un auteur de fait constaté
  if (des.kind === 'person' && person && person.kind === 'offender' && d <= RANGE.arrest) {
    const o = blank('c', 'interpeller', x, z, d);
    o.orderType = 'interpeller';
    o.intent = 'interpeller';
    o.targetId = person.id;
    o.personId = person.id;
    return addressed(env, o, whoKey, `Interpeller ${person.label}`, true);
  }
  // d : un blessé au sol, un feu
  const rescue = env.rescueAt(x, z, RANGE.rescue);
  if (rescue) {
    const o = blank('d', 'secours', x, z, d);
    o.intent = 'secours';
    o.orderType = 'secourir';
    if (person && person.kind === 'wounded') o.personId = person.id;
    const done = addressed(env, o, whoKey, `Secours ici\u00a0: ${rescue.label}`, false);
    // l'appel des secours (pompiers, SAMU) part même sans unité à envoyer, pour tout policier (comme « Secours ici »)
    if (!done.who) {
      done.enabled = true;
      done.lock = null;
    }
    done.text = `Secours ici\u00a0: ${rescue.label}`;
    return finish(done);
  }
  // e : le réticule même sur un policier d'une unité sous ses ordres qui n'est pas avec lui
  if (des.kind === 'person' && person && person.kind === 'police' && person.exact && d <= RANGE.recall && person.squadId !== 0) {
    const u = addressableUnitOf(env, person.squadId);
    if (u && !u.avecVous) {
      const o = blank('e', 'avec_moi', x, z, d);
      o.orderType = 'suivre';
      o.personId = person.id;
      o.who = { squadIds: [u.squadId], label: whoLabel(u), distance: d, leaves: '', manual: true };
      o.text = `${whoLabel(u)}\u00a0: avec moi`;
      o.whoShort = pillWhoText(whoLabel(u), null);
      return finish(o);
    }
  }
  // f : la foule
  const crowd = demonstrators(env, x, z, RANGE.crowdRadius);
  const isCrowd = crowd.count >= RANGE.crowdMin;
  const road = env.roadAt(x, z, RANGE.road);
  if (isCrowd && d <= RANGE.crowdOrder) {
    const o = blank('f', 'face_foule', x, z, d);
    o.orderType = 'ligne';
    o.intent = 'bloquer';
    o.place = road ? placeBare(road.name) : placeBare(des.place);
    const p = env.player;
    const dx = crowd.x - x, dz = crowd.z - z;
    o.heading = Math.hypot(dx, dz) > 1 ? Math.atan2(dx, dz) : p ? Math.atan2(x - p.x, z - p.z) : 0;
    const done = addressed(env, o, whoKey, 'Bloquer ici, face à la foule', true);
    done.autre = disperserOther(env, done, whoKey);
    return finish(done);
  }
  // g : une rue
  if (road && d <= RANGE.block) {
    const o = blank('g', 'bloquer', road.x, road.z, d);
    o.orderType = 'couper_circulation';
    o.intent = 'bloquer';
    o.heading = road.heading;
    o.place = placeBare(road.name);
    const done = addressed(env, o, whoKey, `Bloquer ${placeWithArticle(road.name)}`, true);
    done.autre = isCrowd ? disperserOther(env, done, whoKey) : sendOther(env, done, whoKey);
    return finish(done);
  }
  // h : un point du sol
  const o = blank('h', 'envoyer', x, z, d);
  o.intent = 'envoyer';
  o.orderType = goType(env, x, z);
  const named = des.place !== '' ? des.place : env.roadAt(x, z, 40)?.name ?? env.placeName(x, z);
  o.place = placeBare(named);
  const phrase = o.place !== '' ? `Envoyer\u00a0: ${o.place}` : 'Envoyer ici';
  if (d > RANGE.send) {
    // trop loin pour viser : la carte s'ouvre sur ce point (même unité, même intention)
    const done = addressed(env, o, whoKey, phrase, true);
    done.enabled = false;
    done.lock = REFUS.tropLoin;
    return finish(done);
  }
  const done = addressed(env, o, whoKey, phrase, true);
  if (isCrowd) done.autre = disperserOther(env, done, whoKey);
  return finish(done);
}

// ───────────────────────────── stabilité de la ligne ─────────────────────────────

/** Ligne affichée : l'ordre, depuis quand il est affiché (pour l'hystérésis et le clignotement). */
export interface HeldNatural {
  order: NaturalOrder;
  since: number;
}

/**
 * Ligne à afficher à l'instant `now` : un autre ordre (autre clé) ne remplace l'affiché qu'après HOLD s ; le même ordre
 * met à jour ses chiffres (distance) sans attendre. Entrée donne `order` de la ligne retournée, jamais un ordre
 * recalculé à l'appui.
 */
export function holdNatural(shown: HeldNatural | null, next: NaturalOrder, now: number): HeldNatural {
  if (!shown) return { order: next, since: now };
  if (shown.order.key === next.key) return { order: next, since: shown.since };
  if (now - shown.since < HOLD) return shown;
  return { order: next, since: now };
}

/** La ligne vient de changer (< FLASH s) : la montrer en surbrillance pour que le joueur voie ce qu'il ordonne. */
export function isFlashing(shown: HeldNatural, now: number): boolean {
  return now - shown.since < FLASH;
}

/** Le verbe peut-il être donné à cette unité (capacités) ? Pour griser un secteur de la roue. */
export function verbAllowedFor(env: DirectEnv, who: Addressee | null, verb: DirectVerb): boolean {
  if (!who) return false;
  return who.squadIds.every((id) => {
    const u = env.units.find((q) => q.squadId === id);
    return !u || accepts(u.kind, verb);
  });
}
