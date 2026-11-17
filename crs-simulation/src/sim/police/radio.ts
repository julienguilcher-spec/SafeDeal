/* =====================================================================================
 * FORCES DE L'ORDRE — phraséologie radio des unités (docs/research/00-bible-realisme.md §E.5 à
 * §E.7) : gabarit « APPELÉ ICI APPELANT. Corps. PARLEZ / TERMINÉ », accusé « ICI X. REÇU, … »,
 * chiffres dits un par un sauf les milliers ronds, indicatifs fictifs.
 * Une unité accuse réception de chaque ordre (« REÇU »), puis rend compte de son exécution.
 * ===================================================================================== */

import type { OrderType, Person, SquadOrder } from '@/core/contracts';
import { cardinalFr } from '@/core/math';
import type { Unit } from './brain';
import { unitOf } from './brain';
import type { Kernel } from './kernel';

const DIGITS = ['ZÉRO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'];

/** Nombre épelé pour la radio : 45 → « QUATRE-CINQ », 5000 → « CINQ MILLE ». */
export function spell(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1000 && v % 1000 === 0) return spell(v / 1000) + ' MILLE';
  const s = String(v);
  let out = '';
  for (let i = 0; i < s.length; i++) out += (i > 0 ? '-' : '') + DIGITS[s.charCodeAt(i) - 48];
  return out;
}

/** Indicatif dit à la radio : « Mistral 1 Alfa » → « MISTRAL UN ALFA ». */
export function callsign(name: string): string {
  return name.toUpperCase().replace(/\d+/g, (d) => spell(Number(d)));
}

/** Message complet : « APPELÉ ICI APPELANT. Corps. PARLEZ. » */
export function frame(to: string, from: string, body: string, expectReply: boolean): string {
  const text = body.trim();
  const dot = /[.!?]$/.test(text) ? '' : '.';
  return `${callsign(to)} ICI ${callsign(from)}. ${text}${dot} ${expectReply ? 'PARLEZ.' : 'TERMINÉ.'}`;
}

/** Accusé de réception : « ICI X. REÇU, corps. TERMINÉ. » */
export function acknowledge(from: string, body: string): string {
  const text = body.trim();
  const dot = /[.!?]$/.test(text) ? '' : '.';
  return `ICI ${callsign(from)}. REÇU${text !== '' ? ', ' + text + dot : '.'} TERMINÉ.`;
}

/** Refus motivé : « ICI X. NÉGATIF. Motif. TERMINÉ. » */
export function negative(from: string, body: string): string {
  const text = body.trim();
  const dot = /[.!?]$/.test(text) ? '' : '.';
  return `ICI ${callsign(from)}. NÉGATIF. ${text}${dot} TERMINÉ.`;
}

/** Indicatif de l'échelon auquel l'unité rend compte : celui qui a donné l'ordre, sinon l'échelon supérieur, sinon la salle. */
export function superior(k: Kernel, u: Unit, order: SquadOrder | null): string {
  if (order && order.issuedBy !== 0) {
    const by = k.ctx.people.get(order.issuedBy);
    if (by && by.squadId !== 0) {
      const s = k.ctx.squads.get(by.squadId);
      // le chef rend compte à l'échelon au-dessus de lui, pas à lui-même — ni à l'un de ses propres groupes : l'ordre
      // de son chef de section (rangé dans le groupe de commandement) donnait « FILTRE CHARLIE ICI FILTRE »
      if (s && s.id !== u.id && !within(k, s.id, u.id)) return s.name;
      if (s && s.id === u.id && s.parentId !== 0) {
        const up = k.ctx.squads.get(s.parentId);
        if (up) return up.name;
      }
    }
  }
  for (let x = u.parent; x; x = x.parent) if (x.squad.name !== '') return x.squad.name;
  const own = unitOf(k.ctx.squads.get(u.squad.parentId));
  return own ? own.squad.name : 'CENTRAL';
}

/** L'unité `id` est-elle subordonnée (à un niveau quelconque) à l'unité `ancestor` ? */
function within(k: Kernel, id: number, ancestor: number): boolean {
  let s = k.ctx.squads.get(id);
  for (let guard = 0; s && guard < 8; guard++) {
    if (s.parentId === ancestor) return true;
    s = s.parentId !== 0 ? k.ctx.squads.get(s.parentId) : undefined;
  }
  return false;
}

function sector(k: Kernel, x: number, z: number): string {
  const s = k.ctx.world.sectorName(x, z);
  return s && s !== 'secteur inconnu' ? s : '';
}

function at(s: string): string {
  return s !== '' ? ', ' + s : '';
}

/** Corps de l'accusé de réception d'un ordre. */
export function ackBody(k: Kernel, o: SquadOrder, dist: number): string {
  const sec = sector(k, o.x, o.z);
  const d = spell(Math.max(5, Math.round(dist / 5) * 5));
  switch (o.type as OrderType) {
    case 'tenir': return 'je tiens la position' + at(sec);
    case 'ligne': return 'ligne de barrage' + at(sec) + ', face ' + cardinalFr(o.heading);
    case 'colonne': return 'en file, à pied, vers le point' + at(sec);
    case 'tortue': return 'tortue, boucliers hauts';
    case 'avancer': return 'en avant, ' + d + ' mètres';
    case 'bond_offensif': return 'bond offensif, puis halte et réalignement';
    case 'charge': return 'je charge, arrêt au sifflet';
    case 'refoulement': return 'refoulement par bonds' + (sec !== '' ? ', limite ' + sec : '');
    case 'repli': return 'je romps le contact, repli' + at(sec);
    case 'encercler': return 'bouclage' + at(sec) + ', je ferme les issues';
    case 'disperser_gaz': return 'lacrymogènes sur la zone' + at(sec) + ', tir courbe';
    case 'interpeller': return 'interpellation de l’objectif désigné';
    case 'proteger': return 'je protège l’élément désigné';
    case 'escorter': return 'j’escorte l’élément désigné';
    case 'suivre': return 'je suis votre mouvement';
    case 'embarquer': return 'j’embarque';
    case 'debarquer': return 'je débarque et je me mets en place';
    case 'degager_barricade': return 'je vérifie l’obstacle et je dégage la barricade';
    case 'eteindre': return 'j’envoie le porte-extincteur sous la protection des boucliers';
    case 'secourir': return 'je vais chercher le blessé';
    case 'releve': return 'je relève sur place, passage de ligne';
    case 'ravitailler': return 'ravitaillement aux véhicules';
    case 'couper_circulation': return 'je barre la rue' + at(sec);
    case 'filtrer': return 'barrage filtrant' + at(sec);
    case 'cesser': return 'halte à l’action en cours';
    case 'libre': return 'je reprends ma mission';
    default: return 'j’exécute';
  }
}

/** Compte rendu de situation « nature, volume, attitude » d'une unité prise à partie. */
export function attackReport(k: Kernel, u: Unit, to: string, hurt: number): string {
  const s = u.sense;
  const sec = sector(k, s.ox, s.oz);
  let body = 'Jets de projectiles sur ' + (u.order && (u.order.type === 'ligne' || u.order.type === 'tenir') ? 'le barrage' : 'l’unité') + at(sec);
  if (s.mortars > 0) body = 'Violences sur l’unité : mortiers d’artifice' + at(sec);
  if (hurt > 0) body += '. ' + spell(hurt) + (hurt > 1 ? ' agents blessés' : ' agent blessé');
  return frame(to, u.squad.name, body, true);
}

/** Personne désignée dans un message : nom, ou « un individu ». */
export function designate(p: Person | undefined): string {
  return p ? (p.name !== '' ? p.name : 'un individu') : 'l’objectif';
}

export function sectorOf(k: Kernel, x: number, z: number): string {
  return sector(k, x, z);
}
