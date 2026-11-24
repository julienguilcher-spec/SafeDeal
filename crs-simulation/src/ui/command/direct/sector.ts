/* =====================================================================================
 * Ordres directs — LES SECTEURS DE LA ROUE (F) en ordres (logique pure, déterministe).
 *
 *   sectorOrder(secteur, situation)   l'ordre d'un secteur de la roue (Envoyer, Bloquer une rue, Interpeller, Disperser,
 *                                     et la couronne « Plus… ») sur ce que le joueur désigne, adressé à la MÊME unité que
 *                                     l'ordre prêt (« À qui » : who.ts resolveWho, choix U compris) — jamais la racine de
 *                                     la compagnie. Le résultat a la forme de l'ordre prêt (NaturalOrder) : le moteur
 *                                     (runtime.ts giveSector) l'envoie par le même chemin que Entrée (ligne de fiche de
 *                                     la carte, Qui, sendCardLine) ;
 *   sectorItemText(ordre)             la deuxième ligne du secteur : l'unité qui obéira (« MISTRAL 1 · 90 m »), ou la
 *                                     raison du verrou en quelques mots (« sommations d'abord »).
 *
 * Verrous (§4.3) : un ordre de force que la loi ne permet pas encore reste grisé avec sa raison ; Disperser avant les
 * 3 sommations, et Charger / Gaz / Bond quand le commandant (l'autorité) doit d'abord donner son accord : le premier
 * appui dit pourquoi, le second dans les 3 s fait faire les sommations (et l'accord) — `legalFirst`. Sans autorité :
 * « Charger demande l'accord du commandant. Demandez-le à la radio (T). », aucun ordre.
 * « Avec moi » (1) et la couronne « Secours ici » (7) ne sont pas des ordres de ce module : la roue appelle « Avec moi »
 * du moteur (A) et la demande de secours du HUD.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import { verbOf } from '../orders';
import { REFUS, capRefusal, refusForce } from './caps';
import type { NaturalOrder, NaturalRule } from './natural';
import { RANGE } from './natural';
import type { Addressee, Designation, DirectEnv, DirectVerb, WhoKey } from './types';
import { resolveWho, whyNobody } from './who';
import type { DirectSector } from './words';
import { VERB_WORDS, distText, pillWhoText, placeBare, placeWithArticle } from './words';

/** Recul d'un repli ordonné depuis la roue (m), comme l'ancienne roue. */
export const REPLI_DISTANCE = 30;
/** Foule autour du point pour « Bloquer une rue » face à elle et pour Disperser (rayon, m). */
export const SECTOR_CROWD_RADIUS = 30;

/** Ce que la roue sait de la situation à son ouverture. */
export interface SectorSituation {
  env: DirectEnv;
  /** Ce que le joueur désigne (designate.ts), relevé à l'ouverture de la roue. */
  des: Designation;
  /** Choix « À qui » en cours (U). */
  whoKey: WhoKey;
  /** Droit : force autorisée, riposte en cours, le joueur est l'autorité qui donne l'accord (commandant). */
  law: { authorizedForce: number; underAttack: boolean; authority: boolean };
  /** Cap de la caméra (rad) : le repli se fait vers l'arrière du regard. */
  yaw: number;
}

/** Raison courte d'un secteur verrouillé (deuxième ligne du secteur, ≤ 3 lignes de 19 signes). */
export const SECTOR_LOCKS = {
  sommations: 'sommations d’abord',
  accord: 'il faut votre accord',
  accordChef: 'accord du commandant',
  visezQuelquun: 'visez quelqu’un',
  visezFoule: 'visez la foule',
  visezPoint: 'visez un point',
  tropLoin: 'trop loin : Tab',
  personne: 'personne pour cela',
  capacite: 'pas cette unité',
} as const;

/** Phrases des refus propres à la roue (le reste vient de caps.ts, §4.3). */
export const SECTOR_REFUS = {
  visezQuelquun: 'Interpeller : visez la personne, puis F et 5.',
  visezFoule: 'Disperser : visez la foule, puis F et 6.',
} as const;

function blank(rule: NaturalRule, verb: DirectVerb, x: number, z: number, distance: number): NaturalOrder {
  return {
    rule, verb, enabled: true, text: '', short: VERB_WORDS[verb].short, whoShort: '', who: null, x, z, heading: 0, distance, place: '',
    orderType: null, intent: null, targetId: 0, personId: 0, lock: null, legalFirst: false, autre: null, key: '',
  };
}

function finish(o: NaturalOrder, sectorKey: string): NaturalOrder {
  o.key = ['roue', sectorKey, o.verb, o.who ? o.who.squadIds.join('+') : '-', o.place, o.personId, o.enabled ? 1 : 0, o.legalFirst ? 1 : 0].join('|');
  return o;
}

/** Verrou dans la ligne et sa raison courte (le texte court est rangé dans `whoShort`, lu par sectorItemText). */
function lockWith(o: NaturalOrder, sentence: string, short: string): void {
  o.enabled = false;
  o.lock = sentence;
  o.whoShort = short;
}

/**
 * QUI pour le verbe au point (`at` : où chercher l'unité, le point de l'ordre par défaut) ; sans unité, ou unité qui ne
 * sait pas faire : ligne grise avec la phrase.
 */
function address(s: SectorSituation, o: NaturalOrder, phrase: string, showDistance: boolean, at: { x: number; z: number } = o): Addressee | null {
  const who = resolveWho(s.env, s.whoKey, o.verb, at.x, at.z);
  o.who = who;
  o.text = phrase;
  if (!who) {
    lockWith(o, whyNobody(o.verb, s.env), SECTOR_LOCKS.personne);
    return null;
  }
  const parts = [phrase, who.leaves !== '' ? `${who.label} (${who.leaves})` : who.label];
  if (showDistance) parts.push(distText(o.distance));
  o.text = parts.join(' · ');
  o.whoShort = pillWhoText(who.label, showDistance ? o.distance : null);
  if (who.squadIds.length === 1) {
    const u = s.env.units.find((q) => q.squadId === who.squadIds[0]);
    const refusal = u ? capRefusal(u.kind, o.verb) : null;
    if (refusal) lockWith(o, refusal, SECTOR_LOCKS.capacite);
  }
  return who;
}

/** Ordre de force : verrou de la loi (accord, sommations), ou rien. */
function forceLock(s: SectorSituation, o: NaturalOrder, type: OrderType): void {
  if (!o.enabled) return;
  const v = verbOf(type);
  if (!v) return;
  const forceMissing = v.force > s.law.authorizedForce && !s.law.underAttack;
  const sommationsMissing = v.coercive && s.env.sommations < 3 && !s.env.riposteAt(o.x, o.z);
  if (forceMissing) {
    if (s.law.authority) {
      // le commandant : le second appui fait faire les sommations et donne son accord (chaîne légale)
      o.legalFirst = true;
      o.lock = refusForce(o.verb, true);
      o.whoShort = sommationsMissing ? SECTOR_LOCKS.sommations : SECTOR_LOCKS.accord;
    } else lockWith(o, refusForce(o.verb, false), SECTOR_LOCKS.accordChef);
    return;
  }
  // Disperser : jamais avant les 3 sommations (hors riposte) — le second appui les fait faire, l'unité en ligne
  if (o.verb === 'disperser' && sommationsMissing && o.who) {
    o.legalFirst = true;
    o.lock = REFUS.disperserSommations(o.who.label);
    o.whoShort = SECTOR_LOCKS.sommations;
  }
}

/** Le point visé est-il exploitable (ni ciel, ni mur à moins de 6 m) ? Sinon la ligne grise de la règle i. */
function pointOk(s: SectorSituation, o: NaturalOrder): boolean {
  if (s.des.kind === 'none' || (s.des.distance < RANGE.minPoint && s.des.kind !== 'person')) {
    lockWith(o, REFUS.rien, SECTOR_LOCKS.visezPoint);
    return false;
  }
  return true;
}

/** Lieu nommé du point : celui de la désignation, sinon la rue, sinon le secteur. */
function placeOf(s: SectorSituation, x: number, z: number): string {
  const named = s.des.place !== '' ? s.des.place : s.env.roadAt(x, z, 40)?.name ?? s.env.placeName(x, z);
  return placeBare(named);
}

/**
 * L'ordre d'un secteur de la roue sur la désignation. null : le secteur n'est pas un ordre à une unité (« Avec moi »,
 * couronnes, appels de secours) — la roue s'en charge.
 */
export function sectorOrder(sector: DirectSector, s: SectorSituation): NaturalOrder | null {
  const des = s.des;
  const x = des.x, z = des.z, d = des.distance;
  const key = String(sector.key) + (sector.orders[0] ? `:${String(sector.orders[0])}` : '');
  switch (sector.action) {
    case 'envoyer': {
      const o = blank('h', 'envoyer', x, z, d);
      o.intent = 'envoyer';
      o.orderType = s.env.demonstratorsAt(x, z, RANGE.nearCrowd).count >= RANGE.crowdMin ? 'avancer' : 'colonne';
      if (!pointOk(s, o)) {
        o.text = 'Envoyer';
        return finish(o, key);
      }
      o.place = placeOf(s, x, z);
      address(s, o, o.place !== '' ? `Envoyer : ${o.place}` : 'Envoyer ici', true);
      if (o.enabled && d > RANGE.send) lockWith(o, REFUS.tropLoin, SECTOR_LOCKS.tropLoin);
      return finish(o, key);
    }
    case 'bloquer': {
      const crowd = s.env.demonstratorsAt(x, z, SECTOR_CROWD_RADIUS);
      const road = s.env.roadAt(x, z, RANGE.road);
      if (crowd.count >= RANGE.crowdMin || !road) {
        // une foule à 30 m : la ligne face à elle ; ni foule ni rue : une ligne au point, face au regard
        const o = blank('f', 'face_foule', x, z, d);
        o.orderType = 'ligne';
        o.intent = 'bloquer';
        if (!pointOk(s, o)) {
          o.text = 'Bloquer ici';
          return finish(o, key);
        }
        o.place = road ? placeBare(road.name) : placeOf(s, x, z);
        const p = s.env.player;
        const dx = crowd.x - x, dz = crowd.z - z;
        o.heading = crowd.count >= RANGE.crowdMin && Math.hypot(dx, dz) > 1 ? Math.atan2(dx, dz) : p ? Math.atan2(x - p.x, z - p.z) : s.yaw;
        address(s, o, crowd.count >= RANGE.crowdMin ? 'Bloquer ici, face à la foule' : 'Bloquer ici', true);
        if (o.enabled && d > RANGE.send) lockWith(o, REFUS.tropLoin, SECTOR_LOCKS.tropLoin);
        return finish(o, key);
      }
      const o = blank('g', 'bloquer', road.x, road.z, d);
      o.orderType = 'couper_circulation';
      o.intent = 'bloquer';
      o.heading = road.heading;
      o.place = placeBare(road.name);
      if (!pointOk(s, o)) {
        o.text = 'Bloquer une rue';
        return finish(o, key);
      }
      address(s, o, `Bloquer ${placeWithArticle(road.name)}`, true);
      if (o.enabled && d > RANGE.send) lockWith(o, REFUS.tropLoin, SECTOR_LOCKS.tropLoin);
      return finish(o, key);
    }
    case 'interpeller': {
      const person = des.kind === 'person' && des.person && des.person.kind !== 'police' ? des.person : null;
      if (!person) {
        const o = blank('c', 'interpeller', x, z, d);
        o.orderType = 'interpeller';
        o.text = 'Interpeller';
        lockWith(o, SECTOR_REFUS.visezQuelquun, SECTOR_LOCKS.visezQuelquun);
        return finish(o, key);
      }
      if (person.kind === 'offender') {
        const o = blank('c', 'interpeller', x, z, d);
        o.orderType = 'interpeller';
        o.intent = 'interpeller';
        o.targetId = person.id;
        o.personId = person.id;
        address(s, o, `Interpeller ${person.label}`, true);
        if (o.enabled && d > RANGE.send) lockWith(o, REFUS.tropLoin, SECTOR_LOCKS.tropLoin);
        return finish(o, key);
      }
      // personne n'a rien commis : l'unité va constater et surveille (la fiche de la carte dit la même chose)
      const o = blank('c', 'constater', x, z, d);
      o.orderType = 'interpeller';
      o.intent = 'interpeller';
      o.personId = person.id;
      address(s, o, VERB_WORDS.constater.label, true);
      if (o.enabled && d > RANGE.send) lockWith(o, REFUS.tropLoin, SECTOR_LOCKS.tropLoin);
      return finish(o, key);
    }
    case 'disperser': {
      const crowd = s.env.demonstratorsAt(x, z, SECTOR_CROWD_RADIUS);
      const o = blank('f', 'disperser', x, z, d);
      o.orderType = 'refoulement';
      o.intent = 'disperser';
      if (s.des.kind === 'none' || crowd.count < RANGE.crowdMin) {
        o.text = 'Disperser';
        lockWith(o, SECTOR_REFUS.visezFoule, SECTOR_LOCKS.visezFoule);
        return finish(o, key);
      }
      o.place = placeOf(s, x, z);
      address(s, o, 'Disperser la foule', false);
      if (o.enabled && d > RANGE.send) lockWith(o, REFUS.tropLoin, SECTOR_LOCKS.tropLoin);
      forceLock(s, o, 'refoulement');
      if (o.legalFirst) o.text = 'Disperser : sommations d’abord';
      return finish(o, key);
    }
    case 'repli':
    case 'tenir':
    case 'cesser':
    case 'libre':
    case 'tortue': {
      const type = sector.orders[0]!;
      const verb = sector.action;
      const o = blank('h', verb, x, z, d);
      o.orderType = type;
      // le point de l'ordre : l'unité elle-même (sur place) ; le repli, 30 m derrière elle, à l'opposé du regard
      const who = resolveWho(s.env, s.whoKey, verb, x, z);
      const u = who && who.squadIds.length > 0 ? s.env.units.find((q) => q.squadId === who.squadIds[0]) : undefined;
      const p = s.env.player;
      const ux = u ? u.x : p ? p.x : x, uz = u ? u.z : p ? p.z : z;
      o.x = verb === 'repli' ? ux - Math.sin(s.yaw) * REPLI_DISTANCE : ux;
      o.z = verb === 'repli' ? uz - Math.cos(s.yaw) * REPLI_DISTANCE : uz;
      o.heading = s.yaw;
      o.distance = p ? Math.hypot(o.x - p.x, o.z - p.z) : 0;
      // l'unité est celle de l'ordre prêt au point désigné (le repli n'en choisit pas une autre, plus près de l'arrière)
      address(s, o, VERB_WORDS[verb].label, false, { x, z });
      return finish(o, key);
    }
    case 'bond':
    case 'charge':
    case 'gaz':
    case 'pousser': {
      const type = sector.orders[0]!;
      const o = blank('h', sector.action, x, z, d);
      o.orderType = type;
      if (!pointOk(s, o)) {
        o.text = VERB_WORDS[sector.action].label;
        return finish(o, key);
      }
      o.place = placeOf(s, x, z);
      address(s, o, VERB_WORDS[sector.action].label, true);
      if (o.enabled && d > RANGE.send) lockWith(o, REFUS.tropLoin, SECTOR_LOCKS.tropLoin);
      forceLock(s, o, type);
      return finish(o, key);
    }
    default:
      return null;
  }
}

/** Deuxième ligne d'un secteur : l'unité qui obéira, ou la raison du verrou en quelques mots. */
export function sectorItemText(o: NaturalOrder | null, fallback: string): string {
  if (!o) return fallback;
  return o.whoShort !== '' ? o.whoShort : fallback;
}

/** Le secteur est-il grisé (verrou, rien à viser, personne) ? Un secteur `legalFirst` est grisé mais se choisit. */
export function sectorLocked(o: NaturalOrder | null): boolean {
  return o !== null && (!o.enabled || o.legalFirst);
}
