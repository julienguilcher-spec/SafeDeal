/* =====================================================================================
 * Carte de commandement — colonne de droite au repos (téléphone : feuille « ☰ Suivi ») :
 *   « À TRAITER »  au plus 3 rangées : une chaîne légale arrêtée qui attend le joueur, les incidents dont personne ne
 *                  s'occupe (les plus urgents d'abord), la proposition de l'adjoint (titre en clair), les nasses
 *                  fermées (« Nasse fermée — ouvrir une sortie filtrée ? ») ;
 *   « MES UNITÉS » une rangée par section (ses groupes repliés dessous), les autres unités de premier niveau,
 *                  « Patrouilles (n) », « Engins (n) » ; chaque rangée dit qui, combien, ce qu'elle fait, où, et où elle
 *                  en est (« en route à pied · ~1 min », « embarque (5/7 à bord) », « en place depuis 3 min »,
 *                  « bloquée : chemin coupé »), avec une barre de progression ; c'est aussi le suivi des ordres. La
 *                  chaîne légale en cours y a sa rangée (« Dispersion au gaz — sommation 2 sur 3 dans 25 s ») et
 *                  son bouton « Annuler ».
 * Un clic sur une rangée ouvre la fiche du repère (onPickRepere, branché par l'écran) ; la flèche de gauche d'une
 * section la déplie. Les rangées sont des boutons tabindex −1 (la carte garde le focus, §2.0).
 * Les constructeurs de rangées (todoItems, followRows, unitActivity) sont purs et testés sans DOM.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import type { IconName } from '../core/icons';
import { iconMarkup } from '../core/icons';
import { el, setClass, setText } from '../maps/icons';
import { arrivalRadius } from '../maps/overlay-units';
import { coarsePointer } from '../maps/style';
import { proposalTitle } from './adjointPlays';
import type { CardCrowd, CardEnv, CardIncident, CardProposal, CardUnit, Repere } from './cardTypes';
import type { CommandCore } from './core';
import { INCIDENT_KIND_LABELS, ageLabel } from './incidents';
import { compareCardIncidents } from './intents';
import { BARRAGE_LET_PASSERSBY, doingAt } from './orders';
import { chainOf, watchOrderedForce } from './panelLegal';
import type { ChainView } from './panelLegal';
import { reliefAdvised, strengthText } from './panelUnits';
import { cardEnvFromCore, crowdRepere, incidentRepere, peopleText, unitRepere, unitTitle } from './reperes';
import type { TacticalState } from './tacticalState';

export { chainOf } from './panelLegal';
export type { ChainView } from './panelLegal';

// ───────────────────────────── « À traiter » (pur) ─────────────────────────────

export type TodoKind = 'chaine' | 'incident' | 'proposition' | 'nasse';

export interface TodoItem {
  key: string;
  kind: TodoKind;
  icon: IconName;
  /** « Véhicule en feu · rue Royale », « L'adjoint propose : … », « Nasse fermée — ouvrir une sortie filtrée ? ». */
  title: string;
  /** « personne n'y va · depuis 40 s ». */
  sub: string;
  /** Repère dont la fiche s'ouvre au clic (null : la chaîne légale, qui ouvre « Cadre légal »). */
  repere: Repere | null;
}

const INCIDENT_ICONS: Readonly<Record<string, IconName>> = {
  feu_poubelle: 'flame', feu_barricade: 'flame', feu_vehicule: 'flame', feu_boutique: 'flame', blesse: 'heart', agent_a_terre: 'heart',
  agent_isole: 'shield', pillage: 'box', barricade: 'box', suspect: 'hand', automobiliste_bloque: 'car', secours_bloques: 'siren',
};

/** La chaîne légale attend le joueur : arrêtée (refus) ou suspendue à une autorisation demandée par radio. */
export function chainNeedsPlayer(c: ChainView | null): boolean {
  if (!c) return false;
  return c.status.stage === 'refus' || (!c.active && c.status.stage === 'autorisation');
}

/** Ligne d'un incident non traité : « Véhicule en feu · rue Royale » / « personne n'y va · depuis 40 s ». */
export function incidentTodo(i: CardIncident): TodoItem {
  const kind = INCIDENT_KIND_LABELS[i.kind] ?? 'Incident';
  return {
    key: `incident:${i.id}`, kind: 'incident', icon: INCIDENT_ICONS[i.kind] ?? 'warning',
    title: i.place !== '' ? `${kind} · ${i.place}` : kind,
    sub: `${i.urgency >= 3 ? 'vital · ' : i.urgency === 2 ? 'urgent · ' : ''}personne n’y va · depuis ${ageLabel(i.age)}`,
    repere: incidentRepere(i),
  };
}

function proposalTodo(p: CardProposal, at: { x: number; z: number } | null, keys: boolean): TodoItem {
  const located = p.x !== 0 || p.z !== 0;
  const x = located ? p.x : at ? at.x : 0;
  const z = located ? p.z : at ? at.z : 0;
  return {
    key: `proposition:${p.id}`, kind: 'proposition', icon: 'radio',
    title: `L’adjoint propose\u00a0: ${proposalTitle(p)}`,
    sub: !keys ? (p.executable ? 'Touchez pour accepter ou remettre à plus tard' : 'Conseil\u00a0: à faire vous-même')
      : p.executable ? 'Accepter\u00a0: P · plus tard\u00a0: Maj+P' : 'Conseil\u00a0: à faire vous-même · l’écarter\u00a0: Maj+P',
    repere: { kind: 'proposition', key: `proposition:${p.id}`, x, z, proposalId: p.id, name: 'Proposition de l’adjoint' },
  };
}

function kettleTodo(c: CardCrowd): TodoItem {
  return {
    key: `nasse:${c.key}`, kind: 'nasse', icon: 'target',
    title: 'Nasse fermée — ouvrir une sortie filtrée\u00a0?',
    sub: [c.place, peopleText(c.people)].filter((s) => s !== '').join(' · '),
    repere: crowdRepere(c),
  };
}

function chainTodo(c: ChainView): TodoItem {
  const parts = c.status.text.split(' — ');
  return {
    key: 'chaine', kind: 'chaine', icon: 'scale',
    title: parts[0] ?? c.status.title,
    sub: parts.slice(1).join(' — ') || c.status.text,
    repere: null,
  };
}

/**
 * « À traiter », dans l'ordre : la chaîne légale qui attend le joueur, les incidents dont personne ne s'occupe (vital,
 * puis urgent, puis le plus ancien), la proposition de l'adjoint, les nasses fermées. Au plus `max` éléments (3 à
 * l'écran ; Infinity pour compter). `keys` : le joueur a un clavier (les touches P / Maj+P sont rappelées).
 */
export function todoItems(
  env: Pick<CardEnv, 'incidents' | 'proposals' | 'crowds' | 'player' | 'level'>, chain: ChainView | null, max = 3, keys = true,
): TodoItem[] {
  const out: TodoItem[] = [];
  if (env.level === 'lecture') return out;
  if (chain && chainNeedsPlayer(chain)) out.push(chainTodo(chain));
  const open = env.incidents.filter((i) => i.state === 'ouvert').slice().sort(compareCardIncidents);
  for (const i of open) out.push(incidentTodo(i));
  for (const p of env.proposals) out.push(proposalTodo(p, env.player, keys));
  for (const c of env.crowds) if (c.closed) out.push(kettleTodo(c));
  return out.slice(0, Math.max(0, max));
}

// ───────────────────────────── « Mes unités » (pur) ─────────────────────────────

/** Colonne de véhicules d'une unité (police.command, convoyOf), réduite à ce que la rangée lit. */
export interface ConvoyView {
  stage: string;
  aboard?: number;
  total?: number;
  departIn?: number;
  remaining?: number;
  /** La colonne n'attend plus que le joueur, à pied (ConvoyStatus.awaitingPlayer). */
  awaitingPlayer?: boolean;
  /** Le joueur tient le volant d'un de ses véhicules et n'a pas démarré (ConvoyStatus.awaitingDriver). */
  awaitingDriver?: boolean;
}

/** Suivi d'une unité, calculé par le panneau d'après la carte (itinéraire réel) et la colonne de véhicules. */
export interface FollowTrack {
  /** L'unité est sur le point de son ordre (tolérance d'arrivée de la carte). */
  arrived: boolean;
  /** Instant (s de session) de l'arrivée ; −1 inconnu. */
  since: number;
  /** Mètres restants par les rues et mètres au départ ; −1 inconnu. */
  remaining: number;
  total: number;
  embarked: boolean;
  /** Colonne de véhicules en cours (ou qui vient d'échouer), null sinon. */
  convoy: ConvoyView | null;
  /** Ordre donné par le joueur et repris au débarquement (la colonne roule d'abord), null sinon. */
  intended: { type: OrderType; place: string; targetId: number } | null;
}

export type FollowTone = 'normal' | 'free' | 'warn' | 'alert';

export interface FollowRow {
  /** « u:27 » (unité), « g:patrouilles », « g:engins » (groupes de rangées), « chaine ». */
  key: string;
  kind: 'unit' | 'bucket' | 'chain';
  depth: 0 | 1;
  squadId: number;
  /** « Section MISTRAL 2 », « Patrouilles (2) », « Dispersion au gaz ». */
  name: string;
  /** « 19/19 ». */
  strength: string;
  /** « Barre la rue de Rivoli », « Sans ordre ». */
  doing: string;
  /** « en route à pied · ~1 min », « embarque (5/7 à bord) », « bloquée : chemin coupé ». */
  status: string;
  tone: FollowTone;
  /** Avancement 0..1 vers le point de l'ordre ; −1 : pas de barre. */
  progress: number;
  /** « ⚠ relève conseillée » (moins de 60 % d'agents valides). */
  relief: boolean;
  /** Rangée repliable : true repliée, false dépliée ; null : rien dessous. */
  folded: boolean | null;
  /** La rangée de la chaîne légale a « Annuler » (la chaîne avance encore). */
  cancel: boolean;
}

/** Vitesses du suivi (m/s), les mêmes que les étiquettes d'ordres de la carte (overlay-units.ts, drawOrders). */
export const FOLLOW_WALK = 1.8;
export const FOLLOW_DRIVE = 8;

/** Ordres sans point à rejoindre : l'unité suit, couvre ou reste où elle est. */
const NO_TRIP: ReadonlySet<string> = new Set([
  'libre', 'cesser', 'tortue', 'embarquer', 'debarquer', 'suivre', 'suivre_pied', 'avec_moi', 'proteger', 'escorter',
]);
/** Étapes d'une colonne qui roule ou va rouler (mission.ts, CONVOY_BUSY). */
const CONVOY_BUSY: ReadonlySet<string> = new Set(['route', 'stationnement', 'debarquement', 'rembarquement', 'depart']);

const ENGINS: ReadonlySet<string> = new Set(['canon_eau', 'centaure', 'drone', 'vehicule', 'pompiers', 'samu']);

/** Mots qui commencent un nom de voie et s'écrivent en minuscule dans une phrase (« Barre la rue Royale »). */
const STREET_WORDS: ReadonlySet<string> = new Set([
  'rue', 'avenue', 'boulevard', 'place', 'quai', 'pont', 'cours', 'passage', 'square', 'allée', 'impasse', 'esplanade', 'jardin', 'port',
  'parvis', 'carrefour', 'faubourg', 'villa', 'cité', 'galerie', 'chaussée', 'route', 'voie', 'rond-point', 'porte', 'sentier', 'promenade',
]);

/** Lieu écrit dans une phrase : « Rue Royale » (nom de la carte) → « rue Royale » ; les autres noms sont laissés tels quels. */
export function placeInText(place: string): string {
  const p = place.trim();
  const sp = p.indexOf(' ');
  const first = (sp < 0 ? p : p.slice(0, sp));
  return STREET_WORDS.has(first.toLocaleLowerCase('fr-FR')) ? first.toLocaleLowerCase('fr-FR') + p.slice(first.length) : p;
}

/** Ce que fait une unité, avec le lieu écrit comme dans une phrase. */
function doingText(type: OrderType, place: string, targetId: number): string {
  return doingAt(type, placeInText(place), targetId);
}

function minutes(seconds: number): string {
  return `~${Math.max(1, Math.round(seconds / 60))}\u00a0min`;
}

/**
 * Ce que fait une unité et où elle en est, en clair : « Barre la rue de Rivoli » / « en route à pied · ~1 min »,
 * « embarque (5/7 à bord) », « en route en véhicules · ~3 min », « débarque », « en place », « en place depuis 3 min »,
 * « bloquée : chemin coupé » ; « Sans ordre » quand elle n'en a pas. Une voiture de patrouille dit son état propre.
 */
export function unitActivity(u: CardUnit, t: FollowTrack | undefined, now: number): { doing: string; status: string; tone: FollowTone; progress: number } {
  const relief = reliefAdvised(u.valid, u.total);
  const base: FollowTone = relief ? 'warn' : 'normal';
  if (u.patrol) {
    const o = t?.intended ?? (u.order ? { type: u.order.type, place: u.orderPlace, targetId: u.order.targetId } : null);
    return {
      doing: u.status !== '' ? u.status : 'Patrouille', status: o && u.status !== 'Patrouille' ? doingText(o.type, o.place, o.targetId).toLocaleLowerCase('fr-FR') : '',
      tone: base, progress: -1,
    };
  }
  const order = t?.intended ?? (u.order ? { type: u.order.type, place: u.orderPlace, targetId: u.order.targetId } : null);
  const c = t?.convoy ?? null;
  // colonne de véhicules : l'ordre du joueur est repris au débarquement (l'unité a reçu « embarquer » en attendant)
  const trip = t?.intended ?? null;
  const tripDoing = trip ? doingText(trip.type, trip.place, trip.targetId) || 'Va en véhicules' : 'Va en véhicules';
  if (c && c.stage === 'echec') {
    return { doing: tripDoing, status: 'bloquée\u00a0: chemin coupé', tone: 'alert', progress: -1 };
  }
  if (c && CONVOY_BUSY.has(c.stage)) {
    const doing = tripDoing;
    const total = c.total ?? 0;
    const aboard = c.aboard ?? 0;
    const boarding = c.stage === 'rembarquement' || (c.stage === 'route' && (c.departIn ?? 0) > 0);
    // la colonne attend le joueur lui-même (comme le dit sa fiche « Ma mission ») : jamais « en route » à l'arrêt
    if (c.awaitingDriver) return { doing, status: 'attend votre départ\u00a0: vous êtes au volant', tone: 'warn', progress: total > 0 ? aboard / total * 0.2 : -1 };
    if (c.awaitingPlayer) return { doing, status: 'attend que vous montiez', tone: 'warn', progress: total > 0 ? aboard / total * 0.2 : -1 };
    if (boarding) {
      return { doing, status: total > 0 ? `embarque (${aboard}/${total} à bord)` : 'embarque', tone: base, progress: total > 0 ? aboard / total * 0.2 : -1 };
    }
    if (c.stage === 'stationnement' || c.stage === 'debarquement') return { doing, status: 'débarque', tone: base, progress: 0.95 };
    const rem = c.remaining ?? (t ? t.remaining : -1);
    return {
      doing, status: rem > 0 ? `en route en véhicules · ${minutes(rem / FOLLOW_DRIVE)}` : 'en route en véhicules', tone: base,
      progress: t && t.total > 0 && rem >= 0 ? Math.max(0, Math.min(1, 1 - rem / t.total)) : -1,
    };
  }
  if (!order) return { doing: 'Sans ordre', status: '', tone: relief ? 'warn' : 'free', progress: -1 };
  const doing = doingText(order.type, order.place, order.targetId) || 'Ordre en cours';
  if (NO_TRIP.has(String(order.type)) || !t) return { doing, status: '', tone: base, progress: -1 };
  if (t.arrived) {
    const held = t.since >= 0 ? now - t.since : 0;
    return { doing, status: held >= 60 ? `en place depuis ${Math.floor(held / 60)}\u00a0min` : 'en place', tone: base, progress: 1 };
  }
  const rem = Math.max(0, t.remaining);
  const speed = t.embarked ? FOLLOW_DRIVE : FOLLOW_WALK;
  return {
    doing, status: `en route ${t.embarked ? 'en véhicules' : 'à pied'} · ${minutes(rem / speed)}`, tone: base,
    progress: t.total > 0 ? Math.max(0, Math.min(1, 1 - rem / t.total)) : 0,
  };
}

/** Mot des éléments d'une unité (« 1 groupe sur 3 en action »). */
function childWord(symbol: string, n: number): string {
  const w = symbol === 'groupe' ? 'groupe' : symbol === 'binome' || symbol === 'bravm' ? 'binôme' : 'élément';
  return n > 1 ? w + 's' : w;
}

function unitRow(u: CardUnit, t: FollowTrack | undefined, now: number, depth: 0 | 1, folded: boolean | null, kids: readonly CardUnit[], tracks: ReadonlyMap<number, FollowTrack>): FollowRow {
  const a = unitActivity(u, t, now);
  let doing = a.doing;
  // une section sans ordre dont des groupes agissent : « Sans ordre · 1 groupe sur 3 en action »
  if (doing === 'Sans ordre' && kids.length > 0) {
    let busy = 0;
    for (const k of kids) if (unitActivity(k, tracks.get(k.squadId), now).doing !== 'Sans ordre') busy++;
    if (busy > 0) doing = `Sans ordre · ${busy} ${childWord(kids[0]!.symbol, busy)} sur ${kids.length} en action`;
  }
  return {
    key: `u:${u.squadId}`, kind: 'unit', depth, squadId: u.squadId, name: unitTitle(u), strength: strengthText(u), doing,
    status: a.status, tone: a.tone, progress: a.progress, relief: reliefAdvised(u.valid, u.total), folded, cancel: false,
  };
}

export interface FollowOptions {
  now: number;
  /** Rangées dépliées par le joueur (clé de rangée → dépliée) ; absentes : pliées, sauf l'unique section. */
  unfolded: ReadonlyMap<string, boolean>;
  chain: ChainView | null;
}

/**
 * Rangées de « Mes unités » : la compagnie se déplie en ses sections (groupes repliés dessous) et ses autres unités ;
 * les patrouilles et les engins (canon à eau, blindé, drone…) sont regroupés quand ils sont plusieurs ; la chaîne
 * légale en cours vient en dernier. Seules les unités sous les ordres du joueur sont listées.
 */
export function followRows(units: readonly CardUnit[], tracks: ReadonlyMap<number, FollowTrack>, opt: FollowOptions): FollowRow[] {
  const mine = units.filter((u) => u.mine && u.squadId > 0);
  const ids = new Set(mine.map((u) => u.squadId));
  const kidsOf = (id: number): CardUnit[] => mine.filter((k) => k.parentId === id);
  // premier niveau : les racines, la compagnie remplacée par ce qu'elle contient
  const tops: CardUnit[] = [];
  for (const r of mine) {
    if (ids.has(r.parentId)) continue;
    const kids = kidsOf(r.squadId);
    if (r.symbol === 'compagnie' && kids.length > 0) tops.push(...kids);
    else tops.push(r);
  }
  const plain: CardUnit[] = [];
  const patrols: CardUnit[] = [];
  const engins: CardUnit[] = [];
  for (const u of tops) {
    if (u.patrol || u.symbol === 'patrouille') patrols.push(u);
    else if (ENGINS.has(u.symbol) && kidsOf(u.squadId).length === 0) engins.push(u);
    else plain.push(u);
  }
  const rows: FollowRow[] = [];
  const onlyOne = plain.length === 1 && patrols.length === 0 && engins.length === 0;
  const isOpen = (key: string): boolean => opt.unfolded.get(key) ?? onlyOne;
  for (const u of plain) {
    const kids = kidsOf(u.squadId);
    const key = `u:${u.squadId}`;
    const open = kids.length > 0 && isOpen(key);
    rows.push(unitRow(u, tracks.get(u.squadId), opt.now, 0, kids.length > 0 ? !open : null, kids, tracks));
    if (open) for (const k of kids) rows.push(unitRow(k, tracks.get(k.squadId), opt.now, 1, null, [], tracks));
  }
  const bucket = (key: string, word: string, list: CardUnit[]): void => {
    if (list.length === 0) return;
    if (list.length === 1) {
      rows.push(unitRow(list[0]!, tracks.get(list[0]!.squadId), opt.now, 0, null, [], tracks));
      return;
    }
    const open = opt.unfolded.get(key) ?? false;
    let busy = 0;
    for (const u of list) if (unitActivity(u, tracks.get(u.squadId), opt.now).doing !== 'Sans ordre') busy++;
    rows.push({
      key, kind: 'bucket', depth: 0, squadId: 0, name: `${word} (${list.length})`, strength: '',
      doing: word === 'Patrouilles' ? 'en patrouille' : busy > 0 ? `${busy} en action` : 'Sans ordre',
      status: '', tone: busy > 0 || word === 'Patrouilles' ? 'normal' : 'free', progress: -1, relief: false, folded: !open, cancel: false,
    });
    if (open) for (const u of list) rows.push(unitRow(u, tracks.get(u.squadId), opt.now, 1, null, [], tracks));
  };
  bucket('g:patrouilles', 'Patrouilles', patrols);
  bucket('g:engins', 'Engins', engins);
  const c = opt.chain;
  if (c && (c.active || !chainNeedsPlayer(c))) {
    const parts = c.status.text.split(' — ');
    rows.push({
      key: 'chaine', kind: 'chain', depth: 0, squadId: 0, name: parts[0] ?? c.status.title, strength: '',
      doing: parts.slice(1).join(' — '), status: '', tone: c.status.stage === 'refus' ? 'alert' : 'normal', progress: -1, relief: false,
      folded: null, cancel: c.active,
    });
  }
  return rows;
}

// ───────────────────────────── suivi lu dans la partie ─────────────────────────────

interface ConvoyLike extends ConvoyView { t0?: number; route?: readonly number[] }
interface CommandLike { convoyOf?(squadId: number): ConvoyLike | null }

/** Colonne vue au plus depuis (s) quand elle échoue : au-delà, l'échec est ancien et n'est plus dit. */
const ECHEC_FRESH = 120;

/**
 * Suivi des unités lu dans la partie : itinéraire réel de la carte (scene.routes), tolérance d'arrivée, colonne de
 * véhicules (police.command, convoyOf), ordre repris au débarquement (core.afterConvoy). `memory` garde l'instant
 * d'arrivée et la longueur du trajet au départ de chaque ordre (clé : unité).
 */
export function readTracks(
  core: CommandCore, env: Pick<CardEnv, 'roadAt' | 'placeName'>, memory: Map<number, { issuedAt: number; total: number; since: number }>,
): Map<number, FollowTrack> {
  const ctx = core.ctx;
  const scene = core.maps.scene;
  const now = ctx.clock.now;
  const cmd = ctx.service<CommandLike>('police.command');
  const out = new Map<number, FollowTrack>();
  const seen = new Set<number>();
  for (const u of scene.units) {
    if (u.squadId <= 0 || !core.canCommand(u.squadId)) continue;
    seen.add(u.squadId);
    const o = u.order;
    let convoy: ConvoyView | null = null;
    if (cmd && typeof cmd.convoyOf === 'function') {
      const c = cmd.convoyOf(u.squadId);
      if (c && (CONVOY_BUSY.has(c.stage) || (c.stage === 'echec' && now - (c.t0 ?? -Infinity) < ECHEC_FRESH))) {
        convoy = {
          stage: c.stage, aboard: c.aboard, total: c.total, departIn: c.departIn, remaining: c.remaining,
          awaitingPlayer: c.awaitingPlayer === true, awaitingDriver: c.awaitingDriver === true,
        };
      }
    }
    const next = core.afterConvoy.get(u.squadId);
    let intended: FollowTrack['intended'] = null;
    if (next && convoy) {
      const g = next.geom;
      const street = next.type === 'couper_circulation' || next.type === 'filtrer' ? env.roadAt(g.x, g.z, 30) : null;
      intended = { type: next.type, place: g.place || (street ? street.name : env.placeName(g.x, g.z)), targetId: next.targetId === BARRAGE_LET_PASSERSBY ? next.targetId : 0 };
    } else if (convoy && cmd && typeof cmd.convoyOf === 'function') {
      // simple mouvement en véhicules : la destination est la fin de l'itinéraire de la colonne
      const r = cmd.convoyOf(u.squadId)?.route ?? [];
      const n = r.length;
      intended = { type: 'faire_mouvement', place: n >= 2 ? env.placeName(r[n - 2]!, r[n - 1]!) : '', targetId: 0 };
    }
    const route = scene.routes.get(u.squadId);
    const remaining = convoy && convoy.remaining !== undefined && convoy.remaining > 0 ? convoy.remaining : route ? route.length : o ? u.orderDist : -1;
    const issuedAt = o ? o.issuedAt : -1;
    let m = memory.get(u.squadId);
    if (!m || m.issuedAt !== issuedAt) {
      m = { issuedAt, total: remaining, since: -1 };
      memory.set(u.squadId, m);
    }
    if (remaining > m.total) m.total = remaining;
    const arrived = !!o && !convoy && u.orderDist <= arrivalRadius(o.width);
    if (arrived && m.since < 0) m.since = now;
    if (!arrived) m.since = -1;
    out.set(u.squadId, { arrived, since: m.since, remaining, total: m.total, embarked: u.embarked, convoy, intended });
  }
  for (const id of memory.keys()) if (!seen.has(id)) memory.delete(id);
  return out;
}

// ───────────────────────────── panneau (DOM) ─────────────────────────────

export interface FollowPanelOptions {
  /** Ouvre la fiche d'un repère (rangée cliquée) : l'écran (TacticalScreen.openRepere) et la carte qui y va. */
  onPickRepere(r: Repere): void;
  /** Ouvre « Cadre légal » (rangée de la chaîne légale arrêtée). */
  onOpenLegal?(): void;
  /** Annule la chaîne légale ; par défaut core.legalChain.cancel(). */
  onCancelChain?(): void;
  /** Environnement des fiches déjà calculé par l'écran (sinon lu ici). */
  env?(): CardEnv;
  /** État de l'écran : le survol d'une rangée met l'unité en évidence sur la carte. */
  state?: TacticalState;
}

interface RowEls {
  root: HTMLElement;
  main: HTMLButtonElement;
  name: HTMLElement;
  num: HTMLElement;
  doing: HTMLElement;
  status: HTMLElement;
  line2: HTMLElement;
  bar: HTMLElement;
  relief: HTMLElement;
  fold: HTMLElement | null;
}

/** Durée (s) du surlignage jaune d'une rangée dont l'unité vient de recevoir un ordre. */
const FLASH_SECONDS = 3;

export class FollowPanel {
  readonly root: HTMLDivElement;
  private readonly todoBox: HTMLDivElement;
  private readonly todoEmpty: HTMLElement;
  private readonly unitsBox: HTMLDivElement;
  private readonly unitsEmpty: HTMLElement;
  private todo: TodoItem[] = [];
  private todoAll = 0;
  private rows: FollowRow[] = [];
  private readonly rowEls = new Map<string, RowEls>();
  private todoSig = '';
  private rowsSig = '';
  private readonly unfolded = new Map<string, boolean>();
  private readonly memory = new Map<number, { issuedAt: number; total: number; since: number }>();
  /** Dernier ordre vu par unité, et fin du surlignage d'une rangée. */
  private readonly lastIssued = new Map<number, number>();
  private readonly flashUntil = new Map<number, number>();
  private primed = false;

  constructor(private readonly core: CommandCore, host: HTMLElement, private readonly opts: FollowPanelOptions) {
    this.root = el('div', 'cp-follow ct-scroll');
    this.root.dataset.id = 'tac-follow';
    const keys = !coarsePointer();
    const head = (title: string, key: string): HTMLElement => {
      const h = el('div', 'cp-head');
      h.appendChild(el('span', 'cp-head-t', title));
      if (keys) h.appendChild(el('span', 'cm-kbd', key));
      return h;
    };
    this.todoBox = el('div', 'cp-list');
    this.todoBox.dataset.id = 'tac-todo';
    this.todoEmpty = el('div', 'cp-empty', 'Rien à traiter pour l’instant.');
    this.unitsBox = el('div', 'cp-list');
    this.unitsBox.dataset.id = 'tac-units';
    this.unitsEmpty = el('div', 'cp-empty', 'Aucune unité n’est sous vos ordres pour l’instant.');
    this.root.append(head('À traiter', 'Espace'), this.todoEmpty, this.todoBox, head('Mes unités', 'U'), this.unitsEmpty, this.unitsBox);
    host.appendChild(this.root);
    // le niveau de force ordonné est suivi dès l'ouverture de la carte (« Cadre légal » le montre)
    watchOrderedForce(core);
  }

  /** Nombre d'éléments « À traiter » (pastille de « ☰ Suivi » au téléphone). */
  get todoCount(): number {
    return this.todoAll;
  }

  /** Éléments « À traiter » montrés (Espace les parcourt dans cet ordre). */
  get todoList(): readonly TodoItem[] {
    return this.todo;
  }

  /** Rangées de « Mes unités » montrées. */
  get unitRows(): readonly FollowRow[] {
    return this.rows;
  }

  /**
   * Plie (`open` faux) ou déplie la rangée surlignée au clavier (classe is-hl posée par l'écran), ou la rangée `key`.
   * true si quelque chose a changé (→ / ← dans la feuille « Suivi »).
   */
  fold(open: boolean, key?: string): boolean {
    let k = key;
    if (k === undefined) {
      for (const [rk, r] of this.rowEls) if (r.main.classList.contains('is-hl')) k = rk;
    }
    if (k === undefined) return false;
    const row = this.rows.find((r) => r.key === k);
    if (!row || row.folded === null || row.folded === !open) return false;
    this.unfolded.set(k, open);
    this.refresh(true);
    return true;
  }

  refresh(force: boolean): void {
    const core = this.core;
    // l'écran appelle au plus quatre fois par seconde (et le temps de jeu s'arrête en pause : pas de cadence ici)
    const now = core.ctx.clock.now;
    const env = this.opts.env ? this.opts.env() : cardEnvFromCore(core);
    const chain = chainOf(core);
    const all = todoItems(env, chain, Infinity, !coarsePointer());
    this.todoAll = all.length;
    this.todo = all.slice(0, 3);
    const tracks = readTracks(core, env, this.memory);
    this.rows = followRows(env.units, tracks, { now, unfolded: this.unfolded, chain });
    this.noteNewOrders(env.units, now);
    this.renderTodo(force);
    this.renderRows(force, now);
  }

  /** Une unité vient de recevoir un ordre : sa rangée (ou celle de sa section) clignote en jaune 3 s. */
  private noteNewOrders(units: readonly CardUnit[], now: number): void {
    for (const u of units) {
      if (!u.mine || u.squadId <= 0) continue;
      const at = u.order ? u.order.issuedAt : -1;
      const before = this.lastIssued.get(u.squadId);
      if (this.primed && at >= 0 && before !== at) {
        this.flashUntil.set(u.squadId, now + FLASH_SECONDS);
        if (u.parentId !== 0) this.flashUntil.set(u.parentId, now + FLASH_SECONDS);
      }
      this.lastIssued.set(u.squadId, at);
    }
    this.primed = true;
  }

  private renderTodo(force: boolean): void {
    const sig = this.todo.map((t) => t.key).join('|');
    this.todoEmpty.style.display = this.todo.length === 0 ? '' : 'none';
    if (sig !== this.todoSig || force) {
      this.todoSig = sig;
      this.todoBox.textContent = '';
      for (let i = 0; i < this.todo.length; i++) {
        const t = this.todo[i]!;
        const b = document.createElement('button');
        b.type = 'button';
        b.tabIndex = -1;
        b.className = 'cp-row cp-todo is-' + t.kind;
        b.dataset.id = 'todo-' + (i + 1);
        b.dataset.key = t.key;
        const ic = el('span', 'cp-ic');
        ic.innerHTML = iconMarkup(t.icon, 'cp-svg');
        const main = el('span', 'cp-main');
        main.append(el('b', 'cp-t'), el('small', 'cp-s'));
        b.append(ic, main);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const cur = this.todo.find((q) => q.key === t.key) ?? t;
          if (cur.repere) this.opts.onPickRepere(cur.repere);
          else this.opts.onOpenLegal?.();
        });
        this.todoBox.appendChild(b);
      }
    }
    for (let i = 0; i < this.todo.length; i++) {
      const b = this.todoBox.children[i] as HTMLElement | undefined;
      if (!b) continue;
      setText(b.querySelector('.cp-t') as HTMLElement, this.todo[i]!.title);
      setText(b.querySelector('.cp-s') as HTMLElement, this.todo[i]!.sub);
    }
  }

  private renderRows(force: boolean, now: number): void {
    const rows = this.rows;
    const sig = rows.map((r) => `${r.key}:${r.depth}:${r.folded === null ? '-' : r.folded ? 'f' : 'o'}:${r.cancel ? 1 : 0}`).join('|');
    this.unitsEmpty.style.display = rows.length === 0 ? '' : 'none';
    if (sig !== this.rowsSig || force) {
      this.rowsSig = sig;
      this.unitsBox.textContent = '';
      this.rowEls.clear();
      for (const r of rows) this.buildRow(r);
    }
    for (const r of rows) {
      const e = this.rowEls.get(r.key);
      if (!e) continue;
      setText(e.name, r.name);
      setText(e.num, r.strength);
      setText(e.doing, r.doing);
      setText(e.status, r.status);
      e.status.style.display = r.status === '' ? 'none' : '';
      e.relief.style.display = r.relief ? '' : 'none';
      e.line2.style.display = r.status === '' && !r.relief && r.progress < 0 ? 'none' : '';
      setClass(e.root, 'is-free', r.tone === 'free');
      setClass(e.root, 'is-warn', r.tone === 'warn');
      setClass(e.root, 'is-alert', r.tone === 'alert');
      setClass(e.root, 'is-new', r.squadId > 0 && (this.flashUntil.get(r.squadId) ?? -Infinity) > now);
      setClass(e.num, 'is-low', r.relief);
      if (r.progress >= 0) {
        e.bar.style.display = '';
        const v = (Math.round(r.progress * 40) / 40).toString();
        if (e.bar.style.getPropertyValue('--v') !== v) e.bar.style.setProperty('--v', v);
      } else e.bar.style.display = 'none';
      if (e.fold) e.fold.setAttribute('aria-label', r.folded ? 'Déplier' : 'Replier');
    }
  }

  private buildRow(r: FollowRow): void {
    const root = el('div', `cp-urow d${r.depth}${r.kind === 'chain' ? ' is-chain' : ''}`);
    root.dataset.key = r.key;
    let fold: HTMLElement | null = null;
    if (r.folded !== null) {
      // flèche de dépliage : un élément cliquable qui n'est pas un bouton (les listes de l'écran ne comptent que les boutons)
      fold = el('span', 'cp-fold' + (r.folded ? '' : ' is-open'));
      fold.setAttribute('role', 'button');
      fold.innerHTML = iconMarkup(r.folded ? 'chevron_right' : 'chevron_down', 'cp-svg');
      fold.addEventListener('click', (e) => {
        e.stopPropagation();
        this.fold(!!r.folded, r.key);
      });
      root.appendChild(fold);
    } else if (r.depth === 0) root.appendChild(el('span', 'cp-fold is-none'));
    const main = document.createElement('button');
    main.type = 'button';
    main.tabIndex = -1;
    main.className = 'cp-row cp-unit';
    main.dataset.id = r.kind === 'chain' ? 'follow-chaine' : 'follow-' + r.key.replace(':', '-');
    const top = el('span', 'cp-line');
    const name = el('b', 'cp-name');
    const num = el('span', 'cp-num');
    const doing = el('span', 'cp-doing');
    top.append(name, num, doing);
    const bottom = el('span', 'cp-line cp-line2');
    const relief = el('span', 'cp-relief', '⚠ relève conseillée');
    const status = el('span', 'cp-status');
    const bar = el('i', 'cp-bar');
    bottom.append(relief, status, bar);
    const box = el('span', 'cp-main');
    box.append(top, bottom);
    main.appendChild(box);
    main.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pick(r.key);
    });
    const state = this.opts.state;
    if (state && r.squadId > 0) {
      main.addEventListener('pointerenter', () => {
        if (state.hoverKey !== r.squadId) {
          state.hoverKey = r.squadId;
          state.touch();
        }
      });
      main.addEventListener('pointerleave', () => {
        if (state.hoverKey === r.squadId) {
          state.hoverKey = 0;
          state.touch();
        }
      });
    }
    root.appendChild(main);
    if (r.kind === 'chain' && r.cancel) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.tabIndex = -1;
      cancel.className = 'cm-btn is-small cp-cancel';
      cancel.dataset.id = 'chain-cancel';
      cancel.textContent = 'Annuler';
      cancel.title = 'Arrêter la chaîne légale (les sommations déjà faites restent faites)';
      cancel.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelChain();
      });
      root.appendChild(cancel);
    }
    this.unitsBox.appendChild(root);
    this.rowEls.set(r.key, { root, main, name, num, doing, status, line2: bottom, bar, relief, fold });
  }

  private cancelChain(): void {
    if (this.opts.onCancelChain) this.opts.onCancelChain();
    else (this.core as { legalChain?: { cancel(): void } }).legalChain?.cancel();
    this.refresh(true);
  }

  /** Clic sur une rangée : la fiche de l'unité ; un groupe de rangées se plie / se déplie ; la chaîne : « Cadre légal ». */
  private pick(key: string): void {
    const row = this.rows.find((r) => r.key === key);
    if (!row) return;
    if (row.kind === 'bucket') {
      this.fold(!!row.folded, key);
      return;
    }
    if (row.kind === 'chain') {
      this.opts.onOpenLegal?.();
      return;
    }
    const env = this.opts.env ? this.opts.env() : cardEnvFromCore(this.core);
    const u = env.units.find((q) => q.squadId === row.squadId);
    if (u) this.opts.onPickRepere(unitRepere(u));
  }

  dispose(): void {
    const st = this.opts.state;
    if (st && st.hoverKey !== 0) st.hoverKey = 0;
    this.root.remove();
  }
}
