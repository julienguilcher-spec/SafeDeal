/* =====================================================================================
 * Carte de commandement — COMMISSARIATS, modèle pur (sans DOM ni partie en cours ; testé tel quel).
 *
 * Demande du joueur : « plusieurs commissariats dans la ville pour, quand je serai commandant, pouvoir dispatcher
 * des unités ». Le service 'police.commissariats' (src/gameplay/commissariats) tient le stock des sept sites ; ce
 * fichier le met en mots pour la carte de commandement :
 *   entryNumber / entryKey     identifiant numérique d'une unité du stock (« 9e:tv19 » ↔ 12), celui des fiches ;
 *   entryCardState, entryStateLabel, entryShortState, entryWhat, entryIcon, defaultVerbOf
 *                              état et nature d'une unité en clair (« Au poste — prête », « Police secours, 3 gardiens ») ;
 *   cardStation                un site tel que la fiche du commissariat le lit (CardStation de cardTypes.ts) ;
 *   stationCandidate           une unité du stock dans la liste Qui (« Renforts des commissariats ») ;
 *   stationCard                retouche la fiche du commissariat (intents.ts) : ligne de l'unité choisie surlignée,
 *                              état de chaque unité quand le joueur ne peut pas engager ;
 *   buildRows                  « Plus… › Commissariats » : les sites, du plus proche au plus loin, et leurs unités.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import type { CommissariatView, EntryState, StockEntryView } from '@/gameplay/commissariats/api';
import { COMMISSARIATS } from '@/world/commissariats';
import type { IconName } from '../core/icons';
import type { Card, CardEnv, CardStation, CardStationEntry, Repere, WhoCandidate } from './cardTypes';
import { minutesText } from './intents';

// ───────────────────────────── identifiants ─────────────────────────────

const NUMBERS = new Map<string, number>();
const KEYS = new Map<number, string>();
let nextNumber = 1;

/** Identifiant numérique (stable pour la durée du jeu) d'une unité du stock, celui des lignes de fiche et de Qui. */
export function entryNumber(id: string): number {
  let n = NUMBERS.get(id);
  if (n === undefined) {
    n = nextNumber++;
    NUMBERS.set(id, n);
    KEYS.set(n, id);
  }
  return n;
}

/** Identifiant du service d'une unité du stock à partir de son numéro ; null s'il est inconnu. */
export function entryKey(n: number): string | null {
  return KEYS.get(n) ?? null;
}

// les unités du stock sont numérotées dans l'ordre des données (à délai égal, la fiche les range dans cet ordre) ;
// les unités accueillies plus tard prennent les numéros suivants
for (const def of COMMISSARIATS) for (const tpl of def.stock) entryNumber(tpl.id);

// ───────────────────────────── états et mots ─────────────────────────────

/**
 * État d'une unité pour l'affichage : 'pret' (au poste, engageable), 'alerte', 'engage', 'retour', 'repos',
 * 'indisponible', 'hors' (véhicule garé hors dispositif : car, PC mobile).
 */
export type StationEntryState = 'pret' | Exclude<EntryState, 'au_poste'> | 'hors';

export function entryCardState(e: Pick<StockEntryView, 'engageable' | 'state' | 'vehicles'>): StationEntryState {
  if (!e.engageable) return e.vehicles > 0 ? 'hors' : 'indisponible';
  if (e.state === 'au_poste') return e.vehicles > 0 ? 'pret' : 'indisponible';
  return e.state;
}

/** Durée restante d'un repos : « 1:20 ». */
export function restText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** État en clair, complet (listes, fiches en lecture seule) : « Au poste — prête », « Au repos 1:20 »… */
export function entryStateLabel(e: Pick<StockEntryView, 'engageable' | 'state' | 'vehicles' | 'where' | 'restUntil'>, now: number): string {
  switch (entryCardState(e)) {
    case 'pret': return 'Au poste — prête';
    case 'alerte': return 'En alerte (équipage à bord)';
    case 'engage': return e.where !== '' ? `Engagée — ${e.where}` : 'Engagée';
    case 'retour': return 'Retour au commissariat';
    case 'repos': return `Au repos ${restText(e.restUntil - now)}`;
    case 'hors': return 'Garé — hors dispositif';
    default: return 'Indisponible';
  }
}

/** État en un mot pour la ligne « Envoyer … · prête » de la fiche. */
export function entryShortState(st: StationEntryState): string {
  switch (st) {
    case 'pret': return 'prête';
    case 'alerte': return 'en alerte';
    case 'engage': return 'engagée';
    case 'retour': return 'rentre';
    case 'repos': return 'au repos';
    case 'hors': return 'hors dispositif';
    default: return 'indisponible';
  }
}

/** Ce qu'est l'unité, en clair (jargon expliqué) : « Police secours, 3 gardiens », « BRAV-M (policiers à moto), 6 motos ». */
export function entryWhat(e: Pick<StockEntryView, 'kind' | 'crew' | 'vehicles' | 'label'>): string {
  const n = (count: number, one: string, many: string): string => `${count} ${count > 1 ? many : one}`;
  switch (e.kind) {
    case 'police_secours': return `Police secours, ${n(e.crew, 'gardien', 'gardiens')}`;
    case 'bac': return `voiture banalisée, ${n(e.crew, 'policier', 'policiers')}`;
    case 'section_crs': return `section de CRS, ${n(e.vehicles, 'fourgon', 'fourgons')}, ${n(e.crew, 'agent', 'agents')}`;
    case 'peloton_gm': return `gendarmes mobiles, ${n(e.vehicles, 'fourgon', 'fourgons')}, ${n(e.crew, 'gendarme', 'gendarmes')}`;
    case 'bravm': return `BRAV-M (policiers à moto), ${n(e.vehicles, 'moto', 'motos')}`;
    case 'canon_eau': return 'canon à eau (camion qui arrose la foule)';
    case 'centaure': return 'blindé Centaure (pousse véhicules et barricades)';
    case 'cellulaire': return 'fourgon cellulaire (transfert des interpellés)';
    default: return e.label;
  }
}

export function entryIcon(e: Pick<StockEntryView, 'kind'>): IconName {
  switch (e.kind) {
    case 'police_secours': case 'bac': return 'car';
    case 'section_crs': return 'role_crs';
    case 'peloton_gm': return 'shield';
    case 'bravm': return 'role_bravm';
    case 'canon_eau': return 'role_operateur_canon_eau';
    case 'centaure': return 'role_gendarme_centaure';
    case 'cellulaire': return 'lock';
    default: return 'car';
  }
}

/**
 * Ordre proposé d'office une fois l'unité engagée (« OÙ L'ENVOYER ? ») : une voiture de patrouille y va d'elle-même
 * (« Avancer jusqu'à »), la BRAV-M en colonne (ses motos), les autres en véhicules (« Faire mouvement »).
 */
export function defaultVerbOf(e: Pick<StockEntryView, 'kind'>, patrol: boolean): OrderType {
  if (e.kind === 'police_secours' || e.kind === 'bac' || patrol) return 'avancer';
  if (e.kind === 'bravm') return 'colonne';
  return 'faire_mouvement';
}

/** Mots qui ouvrent un nom de voie : en minuscule dans un titre (« COMMISSARIAT DU 9E — rue Chauchat »). */
const VOIE_WORDS: ReadonlySet<string> = new Set(['rue', 'avenue', 'boulevard', 'place', 'quai', 'pont', 'cours', 'passage', 'square', 'allée', 'impasse', 'rond-point']);

/** « Rue Chauchat » → « rue Chauchat ». */
export function streetInText(s: string): string {
  const t = s.trim();
  const sp = t.indexOf(' ');
  const first = sp < 0 ? t : t.slice(0, sp);
  return VOIE_WORDS.has(first.toLocaleLowerCase('fr-FR')) ? first.toLocaleLowerCase('fr-FR') + t.slice(first.length) : t;
}

/** Nom et rue d'un site : « Commissariat du 9e — rue Chauchat » → { « Commissariat du 9e », « rue Chauchat » }. */
export function stationTitle(view: Pick<CommissariatView, 'name'>, street: string): { name: string; street: string } {
  const i = view.name.indexOf(' — ');
  const name = i >= 0 ? view.name.slice(0, i) : view.name;
  return { name, street: streetInText(street) };
}

/** Distance en clair : « 2,1 km », « 380 m ». */
export function distanceText(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.max(10, Math.round(m / 10) * 10)} m`;
}

/** Ligne d'un site : « à 2,1 km · ≈ 4 min deux-tons · 3 prêtes ». */
export function stationSub(distance: number, eta: number, ready: number): string {
  const parts: string[] = [];
  if (distance > 0) parts.push(`à ${distanceText(distance)} · ≈ ${minutesText(eta)} deux-tons`);
  parts.push(ready === 0 ? 'aucune unité prête' : `${ready} prête${ready > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

// ───────────────────────────── fiche et Qui ─────────────────────────────

/** Trajet estimé d'un site à un point : distance par les rues (m) et délai deux-tons (s). */
export type TravelFn = (stationId: string, x: number, z: number) => { distance: number; eta: number };

/** Unité de la fiche, avec son état complet (notes en lecture seule). */
export interface StationCardEntry extends CardStationEntry {
  /** « Au poste — prête », « Au repos 1:20 »… */
  longLabel: string;
  /** Identifiant du service (« 9e:tv19 »). */
  key: string;
}

export interface CardStationOptions {
  now: number;
  /** Point de référence des distances et délais (le joueur), null : aucun. */
  ref: { x: number; z: number } | null;
  travel: TravelFn;
  /** La mission permet les renforts (`extra.renforts` ≠ false). */
  renforts: boolean;
  /** L'unité engagée est une voiture de patrouille (module des patrouilles). */
  isPatrol(squadId: number): boolean;
  /** Rue du site (données figées), sinon ''. */
  streetOf(stationId: string): string;
}

/** Un site tel que la fiche du commissariat le lit. */
export function cardStation(view: CommissariatView, o: CardStationOptions): CardStation {
  const t = o.ref ? o.travel(view.id, o.ref.x, o.ref.z) : { distance: 0, eta: 0 };
  const title = stationTitle(view, o.streetOf(view.id));
  const entries: StationCardEntry[] = view.entries.map((e) => {
    const st = entryCardState(e);
    return {
      entryId: entryNumber(e.id), key: e.id, name: e.callsign, what: entryWhat(e), state: st, stateLabel: entryShortState(st),
      longLabel: entryStateLabel(e, o.now), eta: t.eta, defaultVerb: defaultVerbOf(e, e.squadId !== 0 && o.isPatrol(e.squadId)),
      icon: entryIcon(e),
    };
  });
  return { id: view.id, name: title.name, street: title.street, x: view.x, z: view.z, distance: t.distance, eta: t.eta, entries, renforts: o.renforts };
}

/** Article d'un site dans une phrase (« au commissariat du 9e »), d'après son nom court et son genre. */
export function stationAt(view: Pick<CommissariatView, 'kind' | 'short'>): string {
  if (view.kind === 'prefecture') return 'à la préfecture de police';
  if (view.kind === 'caserne_gendarmerie') return `à la caserne des ${view.short}`;
  return `au commissariat du ${view.short}`;
}

/** « commissariat du 9e », « préfecture de police », « caserne des Célestins ». */
export function stationHome(view: Pick<CommissariatView, 'kind' | 'short'>): string {
  if (view.kind === 'prefecture') return 'préfecture de police';
  if (view.kind === 'caserne_gendarmerie') return `caserne des ${view.short}`;
  return `commissariat du ${view.short}`;
}

/** Unité du stock proposée dans la liste Qui (« Renforts des commissariats ») : engagée seulement à l'envoi. */
export function stationCandidate(view: CommissariatView, e: StockEntryView, travel: { distance: number; eta: number }): WhoCandidate {
  const st = entryCardState(e);
  return {
    squadIds: [], label: `${e.callsign} (${stationHome(view)})`, mode: 'vehicules', eta: travel.eta, distance: travel.distance,
    busy: entryShortState(st), fromStation: entryNumber(e.id),
  };
}

/** Unités qu'on peut envoyer : au poste et prêtes, ou déjà en alerte. */
export function dispatchable(e: Pick<StockEntryView, 'engageable' | 'state' | 'vehicles'>): boolean {
  const st = entryCardState(e);
  return st === 'pret' || st === 'alerte';
}

/** Au plus autant de notes d'état dans la fiche d'un commissariat (la fiche ne défile pas). */
const MAX_STATE_NOTES = 6;

/**
 * Retouche la fiche du commissariat construite par intents.ts : l'unité désignée (`r.entryId`, rangée de « Plus… ›
 * Commissariats ») a sa ligne surlignée ; quand aucune ligne « Envoyer » n'est proposée (lecture seule, chef de groupe,
 * renforts fixés par l'ordre d'opération, aucune unité prête), l'état de chaque unité est écrit en notes.
 */
export function stationCard(base: Card, r: Repere, env: CardEnv): Card {
  const s = env.stations.find((q) => q.id === r.stationId);
  if (!s) return base;
  let defaultLine = base.defaultLine;
  if (r.entryId !== undefined) {
    const i = base.lines.findIndex((l) => l.action.kind === 'engage' && l.action.entryId === r.entryId);
    if (i >= 0) defaultLine = i;
  }
  const engageLines = base.lines.some((l) => l.action.kind === 'engage');
  if (engageLines) return defaultLine === base.defaultLine ? base : { ...base, defaultLine };
  const notes = base.notes.slice();
  const list = s.entries as readonly (CardStationEntry & Partial<StationCardEntry>)[];
  for (const e of list.slice(0, MAX_STATE_NOTES)) notes.push(`${e.name} — ${e.longLabel ?? e.stateLabel}`);
  if (list.length > MAX_STATE_NOTES) notes.push(`… et ${list.length - MAX_STATE_NOTES} autre${list.length - MAX_STATE_NOTES > 1 ? 's' : ''}`);
  return { ...base, notes, defaultLine };
}

// ───────────────────────────── « Plus… › Commissariats » ─────────────────────────────

/** Ce que fait un clic sur une unité de la liste : l'envoyer (fiche du poste, sa ligne surlignée), sa fiche, rien. */
export type StationUnitAction = 'envoyer' | 'fiche' | 'aucune';

export interface StationListUnit {
  key: string;
  entryId: number;
  squadId: number;
  /** « TV 75-19 ». */
  name: string;
  /** « Police secours, 3 gardiens ». */
  what: string;
  state: StationEntryState;
  /** « Au poste — prête ». */
  stateText: string;
  icon: IconName;
  action: StationUnitAction;
}

export interface StationListPatrol {
  squadId: number;
  name: string;
  /** « En patrouille », « En route (urgence) »… */
  status: string;
}

export interface StationListRow {
  id: string;
  /** « Commissariat du 9e — rue Chauchat ». */
  title: string;
  /** « à 2,1 km · ≈ 4 min deux-tons · 3 prêtes ». */
  sub: string;
  distance: number;
  ready: number;
  units: StationListUnit[];
  patrols: StationListPatrol[];
}

export interface RowsOptions extends Omit<CardStationOptions, 'renforts' | 'isPatrol'> {
  /** Le joueur peut engager (commandant, renforts permis). */
  canDispatch: boolean;
  /** L'unité existe et le joueur peut lui donner des ordres (sa fiche s'ouvre). */
  commandable(squadId: number): boolean;
  /** Patrouille rattachée au site : indicatif et état (null : inconnue). */
  patrol(squadId: number): { name: string; status: string } | null;
}

/** Les sites, du plus proche du point de référence au plus loin (à distance égale, l'ordre des données). */
export function buildRows(views: readonly CommissariatView[], o: RowsOptions): StationListRow[] {
  const rows = views.map((v, index) => {
    const t = o.ref ? o.travel(v.id, o.ref.x, o.ref.z) : { distance: 0, eta: 0 };
    const title = stationTitle(v, o.streetOf(v.id));
    const units: StationListUnit[] = v.entries.map((e) => {
      const st = entryCardState(e);
      const action: StationUnitAction = o.canDispatch && dispatchable(e) ? 'envoyer'
        : e.squadId !== 0 && o.commandable(e.squadId) ? 'fiche' : 'aucune';
      return {
        key: e.id, entryId: entryNumber(e.id), squadId: e.squadId, name: e.callsign, what: entryWhat(e), state: st,
        stateText: entryStateLabel(e, o.now), icon: entryIcon(e), action,
      };
    });
    const patrols: StationListPatrol[] = [];
    for (const id of v.patrols) {
      const p = o.patrol(id);
      if (p) patrols.push({ squadId: id, name: p.name, status: p.status });
    }
    const ready = units.filter((u) => u.state === 'pret').length;
    return {
      row: {
        id: v.id, title: title.street !== '' ? `${title.name} — ${title.street}` : title.name, sub: stationSub(t.distance, t.eta, ready),
        distance: t.distance, ready, units, patrols,
      },
      index,
    };
  });
  rows.sort((a, b) => a.row.distance - b.row.distance || a.index - b.index);
  return rows.map((r) => r.row);
}

/** Mémoire du parcours des commissariats par la touche C. */
export interface StationCycle {
  /** Ordre du parcours (identifiants, du plus proche au plus loin du point de départ). */
  order: string[];
  index: number;
}

/**
 * C : commissariat suivant. La première pression (ou la liste a changé) prend le plus proche de `from` ; les suivantes
 * (`cycling` : la fiche d'un commissariat est déjà ouverte) parcourent LA MÊME liste. Retriée depuis le commissariat
 * affiché, la liste recommençait par lui-même : la deuxième pression restait sur place.
 */
export function cycleStation(memo: StationCycle, all: readonly { id: string; x: number; z: number }[], from: { x: number; z: number }, cycling: boolean): string {
  if (all.length === 0) return '';
  const same = memo.order.length === all.length && all.every((s) => memo.order.indexOf(s.id) >= 0);
  if (cycling && same && memo.index >= 0) {
    memo.index = (memo.index + 1) % memo.order.length;
    return memo.order[memo.index]!;
  }
  const sorted = all.map((s, i) => ({ s, i, d: Math.hypot(s.x - from.x, s.z - from.z) }))
    .sort((a, b) => a.d - b.d || a.i - b.i);
  memo.order = sorted.map((q) => q.s.id);
  memo.index = 0;
  return memo.order[0]!;
}
