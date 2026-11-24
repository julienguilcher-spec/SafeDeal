/* =====================================================================================
 * Ordres directs — CE QUE DISENT LE BLOC D'ORDRES ET LA PUCE D'ÉTAT (aucun DOM : quickActions.ts et hud.ts l'écrivent,
 * les tests le lisent dans une vraie partie).
 *
 * Bloc d'ordres (ordinateur, zone 'left' sous la mini-carte, 262 px), une idée par ligne :
 *   AVEC VOUS · 3 sections + BRAV-M · en ligne face à la foule          ligne d'état (§3.2) ;
 *   Entrée  Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m             ordre prêt (service 'command.direct') ;
 *   Maj+Entrée  Disperser la foule · MISTRAL 1                          ligne « autre », seulement quand elle existe ;
 *   A avec moi · U autre unité · F tous les ordres · Tab carte          touches : les 5 premiers ordres, puis après 6 s
 *                                                                       sans ordre ; « ⌫ annuler — … » 5 s après un ordre ;
 *   MISTRAL 2 · rue de la Roquette barrée ✓                             unités détachées, 2 au plus, puis « +1 » ;
 *   Interpellés 5 · CELLULAIRE 1 3/8 · 2 au commissariat                 interpellés, dès le premier (plan §5.2) ;
 * (« Secours ici », la proposition de l'adjoint et le véhicule qui bloque restent tenus par quickActions.ts).
 * Puce d'état (en haut au centre) : la même ligne d'état ; pendant 6 s après un ordre, le ticket de l'unité qui l'a reçu.
 * Jamais « SANS ORDRE », « MONTE », « DESCEND » ni « EN FILE » pour une unité sous ses ordres : seuls l'ordre du joueur
 * (CommandCore.playerOrder) et le ticket sont lus, jamais l'ordre interne de la simulation.
 * Touches : celles de la table des affectations (labels.ts), réaffectées comprises.
 * ===================================================================================== */

import { withShift } from '@/input/labels';
import type { CommandCore } from './core';
import type { NaturalOrder } from './direct/natural';
import type { DirectApi, UndoInfo } from './direct/runtime';
import { AVEC_VOUS, CROWD_NEAR, countText, followPosture, groupSummary, unitLine } from './direct/state';
import type { UnitLineSnapshot } from './direct/state';
import { ticketText } from './direct/tickets';
import type { Ticket } from './direct/tickets';
import type { DirectEnv, DirectUnit } from './direct/types';
import { topUnits, whoCycle } from './direct/who';
import { CUSTODY_TEXTS, NOTHING_LINE, UNDO_HINT, keyedLine } from './direct/words';

/** Service des ordres directs (direct/runtime.ts DIRECT_SERVICE ; la valeur est répétée ici pour éviter un cycle d'imports). */
export const FIELD_DIRECT_SERVICE = 'command.direct';
/** Ligne des touches : montrée pendant les N premiers ordres, puis seulement après ce délai sans ordre (s). */
export const KEY_LINE_ORDERS = 5;
export const KEY_LINE_IDLE = 6;
/** La puce montre le ticket du dernier ordre pendant (s). */
export const CHIP_TICKET_TIME = 6;
/** Unités détachées montrées dans le bloc. */
export const DETACHED_MAX = 2;
/** Le joueur « bouge » tant qu'il s'éloigne de plus de 2 m de l'endroit où il s'est arrêté. */
export const STILL_RADIUS = 2;
/** Manifestants comptés comme une foule (même seuil que l'ordre prêt). */
const CROWD_MIN = 8;

/** Touches telles qu'imprimées (« Entrée », « A » sur AZERTY, « ⌫ »…). */
export interface FieldKeyLabels {
  go: string;
  withMe: string;
  who: string;
  orders: string;
  /** Carte de commandement (Tab) ; `map` : la carte simple (M) de qui ne commande pas. */
  tactical: string;
  map: string;
  undo: string;
}

/** Touches par défaut (Mac AZERTY), quand la boîte à outils d'interface n'est pas là (tests sans écran). */
export const DEFAULT_FIELD_KEYS: FieldKeyLabels = { go: 'Entrée', withMe: 'A', who: 'U', orders: 'F', tactical: 'Tab', map: 'M', undo: '⌫' };

/** Libellés des touches d'après la table des affectations (labels.ts), à défaut ceux par défaut. */
export function fieldKeyLabels(core: CommandCore): FieldKeyLabels {
  const kit = core.kit;
  if (!kit) return DEFAULT_FIELD_KEYS;
  const get = (b: Parameters<typeof kit.keyLabel>[0], d: string): string => {
    try {
      const t = kit.keyLabel(b);
      return t !== '' ? t : d;
    } catch {
      return d;
    }
  };
  return {
    go: get('order_go', DEFAULT_FIELD_KEYS.go), withMe: get('with_me', DEFAULT_FIELD_KEYS.withMe), who: get('order_who', DEFAULT_FIELD_KEYS.who),
    orders: get('orders', DEFAULT_FIELD_KEYS.orders), tactical: get('tactical', DEFAULT_FIELD_KEYS.tactical), map: get('map', DEFAULT_FIELD_KEYS.map),
    undo: get('order_undo', DEFAULT_FIELD_KEYS.undo),
  };
}

/**
 * Le joueur s'est-il arrêté, depuis combien de temps (posture « en ligne face à la foule » / « en garde » de ses
 * unités après 3 s, §3.4) ? Échantillonné par le HUD ; une nouvelle session repart de zéro.
 */
export class StillWatch {
  private ax = NaN;
  private az = NaN;
  private since = 0;
  private session: unknown = null;

  sample(x: number, z: number, now: number, session: unknown): number {
    if (session !== this.session || !Number.isFinite(this.ax) || now < this.since) {
      this.session = session;
      this.ax = x;
      this.az = z;
      this.since = now;
    } else if (Math.hypot(x - this.ax, z - this.az) > STILL_RADIUS) {
      this.ax = x;
      this.az = z;
      this.since = now;
    }
    return now - this.since;
  }
}

/**
 * Ordres du joueur comptés pour la ligne des touches (une rafale de tickets d'un même ordre compte pour un) ; dernier
 * ordre donné. Une nouvelle session repart de zéro.
 */
export class OrderCount {
  count = 0;
  lastAt = -1e9;
  private session: unknown = null;

  sample(tickets: readonly Ticket[], session: unknown): void {
    if (session !== this.session) {
      this.session = session;
      this.count = 0;
      this.lastAt = -1e9;
    }
    let newest = this.lastAt;
    const fresh = new Set<number>();
    for (const t of tickets) {
      if (t.issuedAt > this.lastAt + 1e-6) fresh.add(Math.round(t.issuedAt * 1000));
      if (t.issuedAt > newest) newest = t.issuedAt;
    }
    this.count += fresh.size;
    this.lastAt = newest;
  }
}

/** Une ligne d'ordre du bloc : texte, active (un appui fait quelque chose), clignote (vient de changer), sous-ligne. */
export interface FieldOrderLine {
  text: string;
  enabled: boolean;
  flash: boolean;
  /** Ligne grise : la phrase qui dit pourquoi (« Trop loin pour viser : Tab… »), '' sinon. */
  hint: string;
  /** L'ordre affiché, tel qu'Entrée le donnera. */
  order: NaturalOrder;
}

/** Ce que montrent le bloc d'ordres et la puce d'état à cet instant. */
export interface FieldHudModel {
  /** Le joueur commande (poste autre que « lecture ») : ordre prêt, À qui, unités détachées. */
  commander: boolean;
  /** A (« Avec moi ») fait quelque chose : il commande, ou une unité est avec lui. */
  canFollow: boolean;
  /** Ligne d'état (« AVEC VOUS · 3 sections + BRAV-M · en ligne face à la foule »), '' pour qui ne commande pas. */
  state: string;
  go: FieldOrderLine | null;
  other: FieldOrderLine | null;
  /** Ligne des touches, ou « ⌫ annuler — … » après un ordre ; '' : cachée. */
  keys: string;
  undo: UndoInfo | null;
  /** Unités détachées (2 au plus) et combien d'autres. */
  detached: string[];
  more: number;
  /** Texte de la puce d'état ('' : la puce garde son texte de lecture seule). */
  chip: string;
  /** La puce montre le ticket d'un ordre qui vient de partir. */
  chipTicket: boolean;
  /** « Interpellés 5 · CELLULAIRE 1 3/8 · 2 au commissariat » dès la première interpellation ('' avant). */
  custody: string;
}

/** Interpellations du dossier (law.records), vues par ce qu'on en lit. */
interface RecordsLike {
  readonly interpellations: readonly { status: string }[];
}
/** Fourgons cellulaires suivis par le transfert (service 'transfer'), vus par ce qu'on en lit. */
interface TransferVansLike {
  readonly vans: readonly { name: string; stage: string; detainees: number; seats: number }[];
}

/**
 * Ligne des interpellés du commandant et du chef de section (plan §5.2) : combien en tout, le fourgon de la remise et sa
 * charge (celui qui prend les interpellés : sur place avec une place libre, sinon le premier sur place), combien au
 * commissariat. '' avant la première interpellation. Fonction pure.
 */
export function custodyLine(arrests: readonly { status: string }[], vans: readonly { name: string; stage: string; detainees: number; seats: number }[]): string {
  if (arrests.length === 0) return '';
  let atStation = 0;
  for (const r of arrests) if (r.status === 'depose') atStation++;
  const onSite = vans.filter((v) => v.stage === 'sur_place' || v.stage === 'attend');
  const van = onSite.find((v) => v.detainees < v.seats) ?? onSite[0] ?? null;
  if (!van) return `Interpellés ${arrests.length} · ${atStation} au commissariat`;
  return CUSTODY_TEXTS.stateLine(arrests.length, van.name, van.detainees, van.seats > 0 ? van.seats : 8, atStation);
}

/** Unités résumées par la ligne d'état : celles du premier niveau sous lui (sections, BRAV-M, engins), sans les fourgons cellulaires. */
export function summaryUnits(env: DirectEnv): DirectUnit[] {
  if (env.poste === 'groupe' || env.poste === 'equipage' || env.poste === 'lecture') {
    const own = env.units.find((u) => u.squadId === env.ownSquadId);
    return own ? [own] : [];
  }
  return topUnits(env).filter((u) => u.kind !== 'cellulaire');
}

/** Ticket vivant le plus récent d'une unité (null : aucun). */
function ticketFor(tickets: readonly Ticket[], squadId: number): Ticket | null {
  let best: Ticket | null = null;
  for (const t of tickets) if (t.squadId === squadId && t.state !== 'remplace' && (!best || t.issuedAt >= best.issuedAt)) best = t;
  return best;
}

/** Ce que la ligne d'une unité lit d'elle (direct/state.ts unitLine). */
function lineSnapshot(u: DirectUnit, ticket: Ticket | null, stoppedFor: number, crowdNear: boolean): UnitLineSnapshot {
  const po = u.playerOrder;
  // « Avec moi » d'avant, que l'unité ne suit plus (un autre ordre de la simulation l'a pris) : on ne dit pas « avec vous »
  const verb = po && !(po.verb === 'avec_moi' && !u.avecVous) ? po.verb : null;
  return {
    name: u.name, commanded: true, playerVerb: verb, place: po ? po.place : '', done: po ? po.done : false, ticket,
    followsPlayer: u.avecVous, vehicles: null, playerMoving: false, playerStoppedFor: stoppedFor, crowdNear, returning: false, simTag: '',
  };
}

/** « 3 unités en mission » / « 1 unité en mission ». */
function awayText(n: number): string {
  return n === 1 ? '1 unité en mission' : `${n} unités en mission`;
}

/**
 * Ligne d'état du joueur qui commande (§3.2) : le résumé de ceux qui sont avec lui et leur posture ; en véhicule,
 * « montent dans les fourgons (14/19) » puis « en colonne derrière vous » ; personne avec lui : combien sont en mission.
 */
export function stateLine(env: DirectEnv, stoppedFor: number, crowdNear: boolean, tickets: readonly Ticket[]): string {
  const units = summaryUnits(env);
  if (units.length === 0) return 'Personne sous vos ordres ici.';
  if (env.poste === 'groupe' || env.poste === 'equipage') {
    const own = units[0]!;
    if (!own.avecVous || !env.player?.inVehicle) return unitLine(lineSnapshot(own, ticketFor(tickets, own.squadId), stoppedFor, crowdNear));
  }
  const withMe = units.filter((u) => u.avecVous);
  if (withMe.length === 0) {
    // en mission : celles qu'il a envoyées (les patrouilles du secteur qu'il n'a jamais ordonnées n'y comptent pas)
    const sent = units.filter((u) => u.playerOrder !== null || ticketFor(tickets, u.squadId) !== null).length;
    return sent > 0 ? `Personne avec vous · ${awayText(sent)}` : 'Personne avec vous';
  }
  const count = env.poste === 'groupe' || env.poste === 'equipage' ? '' : countText(withMe.map((u) => ({ symbol: u.symbol, avecVous: true })));
  if (env.player?.inVehicle) {
    let seated = 0;
    let total = 0;
    for (const u of withMe) {
      // (le joueur, compté dans l'effectif de son unité, ne l'est pas dans les agents assis : « (11/12) » pour de bon)
      const valid = Math.max(0, u.valid - (u.hasPlayer ? 1 : 0));
      total += valid;
      seated += Math.min(valid, u.seated);
    }
    // la BRAV-M seule avec lui (son chef en selle) : des motos, pas des fourgons
    const motos = withMe.every((u) => u.kind === 'bravm');
    const what = total > 0 && seated < total ? `${motos ? 'remontent sur les motos' : 'montent dans les fourgons'} (${seated}/${total})`
      : motos ? 'en selle derrière vous' : 'en colonne derrière vous';
    return [AVEC_VOUS, count, what].filter((s) => s !== '').join(' · ');
  }
  const posture = followPosture({ playerMoving: false, playerStoppedFor: stoppedFor, crowdNear });
  return count !== '' ? groupSummary(withMe.map((u) => ({ symbol: u.symbol, avecVous: true })), posture)
    : unitLine({ ...lineSnapshot(withMe[0]!, null, stoppedFor, crowdNear), followsPlayer: true });
}

/**
 * Unités détachées : celles qu'il a envoyées (un ordre du joueur ou un ticket) et qui ne sont pas avec lui, les plus
 * récemment ordonnées d'abord. Les unités qu'il n'a jamais ordonnées (patrouilles du secteur, fourgons cellulaires à la
 * remise) n'y sont pas : ce n'est pas lui qui les a détachées.
 */
export function detachedLines(env: DirectEnv, tickets: readonly Ticket[], stoppedFor: number, crowdNear: boolean): string[] {
  if (env.poste !== 'commandant' && env.poste !== 'section' && env.poste !== 'bravm') return [];
  const list: { u: DirectUnit; t: Ticket | null; at: number }[] = [];
  for (const u of topUnits(env)) {
    if (u.avecVous) continue;
    const t = ticketFor(tickets, u.squadId);
    if (!t && (!u.playerOrder || u.kind === 'cellulaire')) continue;
    list.push({ u, t, at: t ? t.issuedAt : u.playerOrder ? u.playerOrder.issuedAt : -1e9 });
  }
  list.sort((a, b) => (a.t ? 0 : 1) - (b.t ? 0 : 1) || b.at - a.at || a.u.squadId - b.u.squadId);
  return list.map((e) => (e.t ? ticketText(e.t) : unitLine(lineSnapshot(e.u, null, stoppedFor, crowdNear))));
}

/** Ligne des touches (« A avec moi · U autre unité · F tous les ordres · Tab carte ») ; sans choix d'unité, sans U. */
export function keyLine(env: DirectEnv, keys: FieldKeyLabels, commander: boolean): string {
  if (!commander) return `${keys.withMe} avec moi · ${keys.orders} ordres · ${keys.map} carte`;
  const parts = [`${keys.withMe} avec moi`];
  if (whoCycle(env).length > 1) parts.push(`${keys.who} autre unité`);
  parts.push(`${keys.orders} tous les ordres`, `${keys.tactical} carte`);
  return parts.join(' · ');
}

/** « ⌫ annuler — MISTRAL 1 · Bloquer » (5 s après un ordre). */
export function undoLine(keys: FieldKeyLabels, u: UndoInfo): string {
  const mark = keys.undo === DEFAULT_FIELD_KEYS.undo ? UNDO_HINT : `${keys.undo} annuler`;
  return `${mark} — ${u.who} · ${u.verb}`;
}

function orderLine(key: string, o: NaturalOrder, flash: boolean): FieldOrderLine {
  if (o.rule === 'i') return { text: NOTHING_LINE, enabled: false, flash: false, hint: '', order: o };
  // la ligne Disperser « sommations d'abord » est active : son appui fait faire les sommations (§4.3)
  const enabled = o.enabled || o.legalFirst;
  return { text: keyedLine(key, o.text), enabled, flash, hint: !o.enabled && o.lock && !o.legalFirst ? o.lock : '', order: o };
}

export interface FieldHudInput {
  core: CommandCore;
  direct: DirectApi;
  still: StillWatch;
  orders: OrderCount;
  keys: FieldKeyLabels;
}

/** Ce que disent le bloc d'ordres et la puce à cet instant (null : pas de joueur, ou pas de policier). */
export function readFieldHud(i: FieldHudInput): FieldHudModel | null {
  const { core, direct } = i;
  const ctx = core.ctx;
  const me = core.player();
  if (!me || me.faction !== 'police') return null;
  const now = ctx.clock.now;
  const env = direct.env();
  const commander = env.poste !== 'lecture';
  const canFollow = commander || core.followUnit() !== null;
  const stoppedFor = i.still.sample(me.x, me.z, now, ctx.session.config);
  const tickets = direct.tickets;
  i.orders.sample(tickets, ctx.session.config);
  const undo = direct.undoable();
  const empty: FieldHudModel = { commander, canFollow, state: '', go: null, other: null, keys: '', undo, detached: [], more: 0, chip: '', chipTicket: false, custody: '' };
  if (!commander) {
    // exécutant : A rappelle son groupe ; sans unité avec lui, la carte seulement
    empty.keys = undo ? undoLine(i.keys, undo) : canFollow ? keyLine(env, i.keys, false) : `${i.keys.map} carte`;
    return empty;
  }
  const crowdNear = env.demonstratorsAt(me.x, me.z, CROWD_NEAR).count >= CROWD_MIN;
  const state = stateLine(env, stoppedFor, crowdNear, tickets);
  const nat = direct.ready();
  const flash = direct.flashing();
  const go = nat ? orderLine(i.keys.go, nat, flash) : null;
  const other = nat && nat.autre && nat.rule !== 'i' ? orderLine(withShift(i.keys.go), nat.autre, false) : null;
  let keys = '';
  if (undo) keys = undoLine(i.keys, undo);
  else if (i.orders.count < KEY_LINE_ORDERS || now - i.orders.lastAt >= KEY_LINE_IDLE) keys = keyLine(env, i.keys, true);
  const all = detachedLines(env, tickets, stoppedFor, crowdNear);
  // la puce : le ticket du dernier ordre pendant 6 s (reçu, descend des fourgons, refus…), sinon la ligne d'état
  let latest: Ticket | null = null;
  for (const t of tickets) if (t.state !== 'remplace' && now - t.issuedAt < CHIP_TICKET_TIME && (!latest || t.issuedAt >= latest.issuedAt)) latest = t;
  const chip = latest ? ticketText(latest) : state;
  const records = ctx.service<RecordsLike>('law.records');
  const transfer = ctx.service<TransferVansLike>('transfer');
  const custody = records && Array.isArray(records.interpellations) ? custodyLine(records.interpellations, transfer && Array.isArray(transfer.vans) ? transfer.vans : []) : '';
  return {
    commander, canFollow, state, go, other, keys, undo,
    detached: all.slice(0, DETACHED_MAX), more: Math.max(0, all.length - DETACHED_MAX), chip, chipTicket: latest !== null, custody,
  };
}

/** Tête et reste d'une ligne (« AVEC VOUS » en gras, le reste à côté) : coupée au premier « · ». */
export function splitHead(line: string): { head: string; rest: string } {
  const i = line.indexOf(' · ');
  if (i < 0) return { head: line, rest: '' };
  return { head: line.slice(0, i), rest: line.slice(i + 3) };
}

/** Lecture partagée par le bloc d'ordres et la puce d'état : une seule par instant de la partie. */
interface SharedRead {
  still: StillWatch;
  orders: OrderCount;
  at: number;
  model: FieldHudModel | null;
}
const SHARED = new WeakMap<CommandCore, SharedRead>();

/** Le modèle du bloc et de la puce à cet instant (calculé une fois pour les deux). */
export function sharedFieldHud(core: CommandCore, direct: DirectApi): FieldHudModel | null {
  let r = SHARED.get(core);
  if (!r) {
    r = { still: new StillWatch(), orders: new OrderCount(), at: NaN, model: null };
    SHARED.set(core, r);
  }
  const now = core.ctx.clock.now;
  if (r.at === now) return r.model;
  r.at = now;
  r.model = readFieldHud({ core, direct, still: r.still, orders: r.orders, keys: fieldKeyLabels(core) });
  return r.model;
}
