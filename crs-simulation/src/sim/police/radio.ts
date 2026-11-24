/* =====================================================================================
 * FORCES DE L'ORDRE — phraséologie radio des unités (docs/research/00-bible-realisme.md §E.5 à
 * §E.7) : gabarit « APPELÉ ICI APPELANT. Corps. PARLEZ / TERMINÉ », accusé « ICI X. REÇU, … »,
 * chiffres dits un par un sauf les milliers ronds, indicatifs fictifs.
 * Une unité accuse réception de chaque ordre (« REÇU »), puis rend compte de son exécution.
 * L'accusé (ou le refus, « NÉGATIF ») d'un ordre du JOUEUR passe en priorité sur le réseau du commandement
 * (`replyFlag`, drapeau RadioMessage.reply) : il s'entend moins d'une seconde après l'ordre, jamais avant lui.
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

/**
 * Délai pendant lequel l'accusé de réception d'un ordre du joueur passe en priorité (s) : au-delà, ce n'est plus la
 * réponse à l'ordre qu'il vient de donner, c'est un message comme un autre.
 */
export const REPLY_WINDOW = 5;

/** Le texte est-il un accusé de réception (« ICI X. REÇU… ») ou un refus (« ICI X. NÉGATIF… ») ? */
export function isAckText(text: string): boolean {
  return /^ICI [^.]+\. (REÇU|NÉGATIF)(?=[ ,.]|$)/.test(text);
}

/**
 * L'unité qui dit ce texte répond-elle à un ordre du joueur (accusé ou refus de l'ordre qu'il vient de donner) ?
 * Alors le message part sur le réseau du commandement avec `reply: true` : il passe devant tout ce qui attend et coupe
 * le trafic ordinaire (gameplay/radio/queue.ts). `order` : l'ordre en cours de l'unité qui parle (squad.order) ;
 * seul `byPlayer` le dit donné par le joueur (les ordres de la colonne et de l'adjoint portent aussi son identifiant).
 * Règle unique pour kernel.say (unités de police) et le commandement (BRAV-M, engins, drone).
 */
export function replyFlag(order: SquadOrder | null | undefined, now: number, text: string): boolean {
  if (!order || order.byPlayer !== true) return false;
  const age = now - order.issuedAt;
  return age >= 0 && age < REPLY_WINDOW && isAckText(text);
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

/**
 * Indicatif de l'échelon auquel l'unité rend compte : celui qui a donné l'ordre, sinon l'échelon supérieur, sinon la salle.
 * Un ordre du JOUEUR (`byPlayer`) est rendu au joueur, jamais à la salle ni à un échelon au-dessus de lui : voir
 * `playerCallsign`.
 */
export function superior(k: Kernel, u: Unit, order: SquadOrder | null): string {
  if (order && order.byPlayer === true) {
    const to = playerCallsign(k, u);
    if (to !== '') return to;
  }
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

/**
 * Indicatif du joueur pour l'unité `u` qui lui rend compte : celui de l'unité qu'il commande (la plus haute dont il
 * est le chef, sinon la sienne). Quand c'est `u` elle-même (il a donné l'ordre à sa propre unité), sa fonction, pour
 * ne pas faire dire « MISTRAL ICI MISTRAL » : « AUTORITÉ » pour le commandant ou le commissaire, « CHEF MISTRAL 1 »
 * pour un chef de section ou de groupe. Sans commandement, son nom (« MISTRAL 1 ALFA ICI … » vers lui). '' si le joueur
 * n'est pas un policier connu.
 */
export function playerCallsign(k: Kernel, u: Unit): string {
  const ctx = k.ctx;
  const me = ctx.player.person();
  if (!me) return '';
  let top: { id: number; name: string } | null = null;
  let topDepth = Infinity;
  const list = ctx.squads.list;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    if (s.leaderId !== me.id || s.name === '') continue;
    let depth = 0;
    for (let q = s; q.parentId !== 0 && depth < 8; depth++) {
      const up = ctx.squads.get(q.parentId);
      if (!up) break;
      q = up;
    }
    if (depth < topDepth) {
      topDepth = depth;
      top = s;
    }
  }
  if (!top) {
    // il ne commande aucune unité (agent, équipier) : il parle en son nom à la sienne, comme le fait l'interface
    const own = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    if (!own || own.name === '') return '';
    return own.id !== u.id ? own.name : me.name !== '' ? me.name : own.name;
  }
  if (top.id !== u.id) return top.name;
  const role = ctx.player.state.role;
  return role === 'commandant' || role === 'commissaire' ? 'AUTORITÉ' : 'CHEF ' + top.name;
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

/**
 * Arrondi « de compte rendu » des distances : le même que celui de la phrase d'ordre du joueur
 * (ui/command/phrases.ts roundVolume), pour que l'accusé redise le chiffre de l'ordre (« QUATRE-ZÉRO » pour 40 m, pas
 * « QUATRE-CINQ »).
 */
export function roundSpoken(n: number): number {
  if (n < 8) return Math.round(n);
  if (n < 30) return Math.round(n / 5) * 5;
  if (n < 100) return Math.round(n / 10) * 10;
  if (n < 400) return Math.round(n / 50) * 50;
  if (n < 2000) return Math.round(n / 100) * 100;
  return Math.round(n / 500) * 500;
}

/**
 * Distance de l'ordre telle que l'ordre l'a dite : mesurée depuis le chef de l'unité qui le reçoit (comme la phrase
 * d'ordre), pas depuis le centre du dispositif. `dist` sert si l'unité n'est pas retrouvée.
 */
function orderDistance(k: Kernel, o: SquadOrder, dist: number): number {
  const units = k.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.order !== o && u.task !== o && u.squad.order !== o) continue;
    const lead = u.squad.leaderId !== 0 ? k.ctx.people.get(u.squad.leaderId) : undefined;
    if (!lead) break;
    const v = lead.vehicleId !== 0 ? k.ctx.vehicles.get(lead.vehicleId) : undefined;
    const x = v ? v.x : lead.x;
    const z = v ? v.z : lead.z;
    return Math.hypot(o.x - x, o.z - z);
  }
  return dist;
}

/** Ce que protège un ordre « proteger » : l'engin par son nom (« le canon à eau »), sinon « l'élément désigné ». */
function protectedThing(k: Kernel, o: SquadOrder): string {
  const v = o.targetId > 0 ? k.ctx.vehicles.get(o.targetId) : undefined;
  if (v) {
    switch (v.kind) {
      case 'canon_eau': return 'le canon à eau';
      case 'centaure': return 'le Centaure';
      case 'fourgon_cellulaire': return 'le fourgon cellulaire';
      case 'ambulance': return 'l’ambulance';
      case 'camion_pompiers': return 'l’engin des pompiers';
      default: return 'le véhicule désigné';
    }
  }
  const p = o.targetId > 0 ? k.ctx.people.get(o.targetId) : undefined;
  return p ? 'la personne désignée' : 'l’élément désigné';
}

/** Corps de l'accusé de réception d'un ordre. */
export function ackBody(k: Kernel, o: SquadOrder, dist: number): string {
  // le lieu nommé par celui qui a donné l'ordre (le même mot à l'ordre et à l'accusé de réception), sinon le secteur
  const sec = o.place ? o.place : sector(k, o.x, o.z);
  const d = spell(roundSpoken(Math.max(5, orderDistance(k, o, dist))));
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
    case 'proteger': return 'je protège ' + protectedThing(k, o);
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

/**
 * Compte rendu d'un « Avancer » arrivé : « Sur le point, rue de Rivoli, en ligne face nord, DOUZE à pied » (en ligne)
 * ou « Sur le point, en colonne par deux » — jamais « Barrage en place » : ce n'était pas l'ordre donné.
 */
export function onPointBody(street: string, line: boolean, heading: number, formed: number, files = 2): string {
  if (!line) return 'Sur le point' + at(street) + ', en colonne par ' + (files === 3 ? 'trois' : 'deux');
  return 'Sur le point' + at(street) + ', en ligne face ' + cardinalFr(heading) + (formed > 0 ? ', ' + spell(formed) + ' à pied' : '');
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
