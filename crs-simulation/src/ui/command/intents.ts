/* =====================================================================================
 * Carte de commandement — INTENTIONS et FICHES (logique pure, sans DOM).
 *
 *   INTENTS                         les six boutons du bas (Envoyer E, Bloquer une rue B, Encercler N, Disperser D,
 *                                   Interpeller I, Secours S) : touches physiques communes à l'AZERTY et au QWERTY ;
 *   buildCard(repère, env, intent)  la fiche d'un repère : au plus six lignes + « Autres ordres ici… », la ligne par
 *                                   défaut (celle de l'intention, toujours parmi les six), les étapes légales (🔒 / ⚖) ;
 *   intentCandidates(intent, env…)  les repères que ←/→ parcourent pour une intention, le meilleur d'abord ;
 *   allOrdersGrouped()              « Plus… › Tous les ordres », par famille.
 *
 * AJOUTER UNE FICHE OU DES LIGNES (module des commissariats, ou tout autre module) — trois appels, chacun renvoie sa
 * fonction de retrait :
 *   registerRepereProvider(kind, (env) => Repere[])          de nouveaux repères (reperes.ts) ;
 *   registerCardBuilder(kind, (repère, env, intent) => Card)  remplace la fiche d'un genre de repère (la fiche
 *                                                             d'origine reste disponible par defaultCardBuilder) ;
 *   registerCardLines(kind, (repère, env) => ({ lines, others }))
 *                                                             ajoute des lignes à la fiche d'un genre : elles prennent
 *                                                             les places libres parmi les six, le reste va dans
 *                                                             « Autres ordres ici… ».
 * Une ligne est un CardLine (cardTypes.ts) : libellé, explication, icône, action (LineAction). Les lignes d'ordre se
 * construisent avec verbLine(env, type, géométrie, point) : libellé, explication et cadenas légal viennent du verbe.
 * ===================================================================================== */

import type { ForceLevel, OrderType } from '@/core/contracts';
import type { IncidentKind, IncidentMeans, IncidentState } from '@/core/extensions';
import type { IconName } from '../core/icons';
import { exitOpen } from '../maps/barrages';
import type {
  Card, CardCrowd, CardEnv, CardIncident, CardLine, CardStation, CardUnit, IntentDef, IntentId, LineAction, Repere,
  RepereKind, VerbGeom,
} from './cardTypes';
import { INCIDENT_KIND_LABELS, MEANS_ADVICE, MEANS_FOR, ageLabel } from './incidents';
import { proposalTitle } from './adjointPlays';
import {
  BARRAGE_LET_PASSERSBY, EXTRA_PLAIN, ORDER_GROUP_LABELS, ORDER_VERBS, authorizeWord, doingAt, forceWord, plainOf, upperTitle, verbOf,
} from './orders';
import type { OrderGroup, OrderVerb } from './orders';
import { travelOf } from './direct/travel';
import {
  capFirst, crowdRepere, crowdWeight, exitRepere, incidentOpen, incidentRepere, mainCrowd, orderedCrowds, peopleText, placeRepere,
  pointRepere, roadRepere, unitTitle,
} from './reperes';

export type {
  Card, CardEnv, CardLine, IntentDef, IntentId, LineAction, Repere, RepereKind,
} from './cardTypes';
export { registerRepereProvider, collectReperes, pickAt, nextInDirection } from './reperes';

// ───────────────────────────── intentions ─────────────────────────────

/** Les six intentions du bas de la carte (tableau du §2.1). Lettres lues sur KeyboardEvent.code. */
export const INTENTS: readonly IntentDef[] = [
  {
    id: 'envoyer', code: 'KeyE', key: 'E', label: 'Envoyer', sub: 'une unité quelque part', icon: 'nav', sticky: false,
    tooltip: 'Envoyer une unité quelque part (à pied ou en véhicules, le jeu choisit)',
  },
  {
    id: 'bloquer', code: 'KeyB', key: 'B', label: 'Bloquer une rue', sub: 'barrage, passants, voitures', icon: 'shield', sticky: true,
    tooltip: 'Bloquer une rue\u00a0: barrage complet, barrage qui laisse passer les passants, ou barrières contre les voitures',
  },
  {
    id: 'encercler', code: 'KeyN', key: 'N', label: 'Encercler (nasse)', sub: 'tenir chaque rue autour', icon: 'target', sticky: false,
    tooltip: 'Encercler une foule\u00a0: chaque rue autour d’elle est tenue par une unité (une nasse)',
  },
  {
    id: 'disperser', code: 'KeyD', key: 'D', label: 'Disperser', sub: 'repousser, gaz, charge', icon: 'chevrons', sticky: false,
    tooltip: 'Disperser une foule\u00a0: la repousser, le gaz ou la charge, avec les sommations exigées par la loi',
  },
  {
    id: 'interpeller', code: 'KeyI', key: 'I', label: 'Interpeller', sub: 'arrêter un casseur', icon: 'hand', sticky: true,
    tooltip: 'Faire arrêter un casseur ou un pilleur',
  },
  {
    id: 'secours', code: 'KeyS', key: 'S', label: 'Secours', sub: 'pompiers, SAMU', icon: 'heart', sticky: true,
    tooltip: 'Envoyer les pompiers ou le SAMU',
  },
];

/** Bouton « Plus… » (même barre que les intentions). */
export const MORE_BUTTON = {
  code: 'KeyO', key: 'O', label: 'Plus…', sub: 'tous les ordres, journal…', icon: 'list' as IconName,
  tooltip: 'Tous les ordres, les incidents, la circulation, les commissariats, le journal radio, l’affichage de la carte, l’aide',
};

/** Pastille légale de la barre du haut : info-bulle. */
export const LEGAL_CHIP_TOOLTIP = 'Les sommations\u00a0: 3 avertissements au mégaphone, obligatoires avant d’employer la force contre un attroupement. Cliquez pour voir ce que la loi permet.';

export function intentById(id: IntentId): IntentDef {
  return INTENTS.find((i) => i.id === id)!;
}

/** Intention d'une touche physique (« KeyB » → bloquer), undefined sinon. */
export function intentOfCode(code: string): IntentDef | undefined {
  return INTENTS.find((i) => i.code === code);
}

// ───────────────────────────── outils ─────────────────────────────

/** Distance (m) à une foule en deçà de laquelle « Y aller » se fait en formation (`avancer`) plutôt qu'en file. */
export const NEAR_CROWD = 60;
/** Vitesses de calcul des délais (m/s) : au pas, en véhicules. Quand rouler : direct/travel.ts motorizes (une règle). */
export { DRIVE_SPEED, WALK_SPEED } from './direct/travel';

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Une foule à moins de NEAR_CROWD m du point ? */
export function nearCrowd(env: Pick<CardEnv, 'crowds'>, x: number, z: number): boolean {
  for (const c of env.crowds) if (c.people > 0 && dist(c.x, c.z, x, z) <= NEAR_CROWD) return true;
  return false;
}

/**
 * Délai d'arrivée estimé (s) d'une unité jusqu'au point, à pied ou en véhicules selon motorizes (direct/travel.ts) :
 * jamais en véhicules pour l'unité du joueur à pied ; à bord au-delà de 150 m ; à pied au-delà de 450 m.
 */
export function etaFor(
  u: Pick<CardUnit, 'x' | 'z' | 'hasVehicles'> & Partial<Pick<CardUnit, 'embarked' | 'hasPlayer' | 'symbol' | 'patrol'>>, x: number, z: number,
  playerAboard = false,
): { eta: number; vehicles: boolean; distance: number } {
  const t = travelOf(u, x, z, playerAboard);
  return { eta: t.eta, vehicles: t.mode === 'vehicules', distance: t.distance };
}

/** Durée en clair : « 1 min », « 4 min » (au moins 1 min). */
export function minutesText(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))}\u00a0min`;
}

/** Ce qu'il manque légalement pour cet ordre au point (x, z) : cadenas (🔒) ou balance (⚖). */
export function legalOf(v: Pick<OrderVerb, 'force' | 'coercive'>, env: CardEnv, x: number, z: number): { coercive: boolean; lock: CardLine['lock'] } {
  const missingSom = v.coercive && env.sommations < 3 && !env.riposteAt(x, z) ? 3 - env.sommations : 0;
  const missingForce = v.force > env.authorised && !env.underAttack;
  if (missingForce) {
    const parts: string[] = [];
    if (missingSom > 0) parts.push(`sommations ${env.sommations}/3`);
    parts.push(env.canAuthorize ? authorizeWord(v.force) : `${authorizeWord(v.force)} (demande radio)`);
    return { coercive: false, lock: { sommations: missingSom, force: v.force as ForceLevel, text: parts.join(' + ') } };
  }
  return { coercive: missingSom > 0, lock: null };
}

interface VerbLineOpts {
  label?: string;
  explain?: string;
  icon?: IconName;
  targetId?: number;
  needsWho?: boolean;
}

/** Icône d'un verbe dans les fiches. */
const VERB_ICONS: Readonly<Record<string, IconName>> = {
  tenir: 'pin', ligne: 'minus', colonne: 'nav', couper_circulation: 'shield', filtrer: 'sliders', tortue: 'shield',
  avancer: 'arrow_up', bond_offensif: 'arrow_up', charge: 'bolt', refoulement: 'chevrons', suivre_pied: 'arrow_up',
  avec_moi: 'car', faire_mouvement: 'car', repli: 'chevron_down', encercler: 'target', disperser_gaz: 'wind',
  interpeller: 'hand', degager_barricade: 'box', degager_obstacle: 'car', proteger: 'shield', escorter: 'nav', suivre: 'chevrons',
  embarquer: 'car', debarquer: 'car', cesser: 'close', libre: 'resume', retour_poste: 'back',
};

/**
 * Ligne de fiche pour un ordre du catalogue au point (x, z) : libellé et explication du verbe (sauf `opts`), cadenas
 * légal, règle. null si le verbe n'existe pas (encore) dans le catalogue — la ligne n'est alors pas proposée.
 */
/** Rayon (m) où l'envoi cherche l'auteur d'un fait constaté dans une foule (sendLine.ts). */
const NO_FACT_RADIUS = 40;

export function verbLine(env: CardEnv, type: OrderType, geom: VerbGeom, x: number, z: number, opts: VerbLineOpts = {}): CardLine | null {
  const v = verbOf(type);
  if (!v) return null;
  const legal = legalOf(v, env, x, z);
  const verb: Extract<LineAction, { kind: 'verb' }> = opts.targetId !== undefined ? { kind: 'verb', type, geom, targetId: opts.targetId } : { kind: 'verb', type, geom };
  // « Interpeller » sans auteur désigné et sans fait constaté autour : l'unité ira constater, mais n'interpellera
  // personne (la fiche disait « interpelle l'auteur », puis l'unité répondait « négatif » à la radio) — la ligne le dit
  // d'emblée : « Aller constater » (mêmes mots sur le terrain, direct/words.ts)
  if (type === 'interpeller' && (opts.targetId ?? 0) === 0 && env.offenderAt && !env.offenderAt(x, z, NO_FACT_RADIUS)) verb.noFact = true;
  const action: LineAction = verb;
  const label = verb.noFact ? NO_FACT_LABEL : opts.label ?? v.plain;
  const explain = verb.noFact ? NO_FACT_EXPLAIN : opts.explain ?? v.explain;
  return {
    label, explain, icon: opts.icon ?? VERB_ICONS[type] ?? 'nav', action,
    coercive: legal.coercive, lock: legal.lock, needsWho: opts.needsWho ?? true, rule: v.rule,
  };
}

/** Ligne « Interpeller » sans fait constaté près du point : l'unité va constater et surveille. */
export const NO_FACT_LABEL = 'Aller constater';
export const NO_FACT_EXPLAIN = 'Personne n’a rien commis ici\u00a0: ils surveillent.';

/** Unités qui peuvent tenir une rue d'une nasse (sections, groupes, BRAV-M sous mes ordres, valides). */
const NASSE_SYMBOLS: ReadonlySet<string> = new Set(['section', 'groupe', 'bravm']);

/** « Encercler » demande au moins deux unités : sinon l'intention et la ligne ne sont pas proposées. */
export const NASSE_MIN_UNITS = 2;

/** Nombre d'unités sous mes ordres qui peuvent tenir une rue d'une nasse (la BRAV-M compte une fois, sans ses binômes). */
export function encircleUnitCount(env: Pick<CardEnv, 'units'>): number {
  let n = 0;
  for (const u of env.units) {
    if (!u.mine || u.valid <= 0 || !NASSE_SYMBOLS.has(u.symbol)) continue;
    if (u.symbol === 'bravm' && u.parentId > 0 && env.units.some((q) => q.squadId === u.parentId && q.symbol === 'bravm')) continue;
    n++;
  }
  return n;
}

/** Ligne sans ordre du catalogue (secours, métro, proposition…). */
export function plainLine(label: string, explain: string, icon: IconName, action: LineAction, needsWho = false, rule = ''): CardLine {
  return { label, explain, icon, action, coercive: false, lock: null, needsWho, rule };
}

function push(list: CardLine[], line: CardLine | null): void {
  if (line) list.push(line);
}

/** « Y aller » : en file (`colonne`), en formation (`avancer`) à moins de 60 m d'une foule. */
function goLine(env: CardEnv, x: number, z: number): CardLine | null {
  if (nearCrowd(env, x, z)) {
    return verbLine(env, 'avancer', 'point', x, z, { label: 'Y aller', explain: 'À pied, en formation\u00a0: la foule est à moins de 60\u00a0m.', icon: 'nav' });
  }
  return verbLine(env, 'colonne', 'point', x, z, { label: 'Y aller', explain: 'À pied\u00a0; en véhicules au-delà de 450\u00a0m (150\u00a0m si l’unité est à bord).' });
}

const RESCUE_EXPLAIN = {
  pompiers: 'Les sapeurs-pompiers viennent éteindre ou secourir.',
  samu: 'Le SAMU vient soigner et évacuer les blessés.',
} as const;

function rescueLine(service: 'pompiers' | 'samu', incidentId: number, label: string): CardLine {
  return plainLine(label, RESCUE_EXPLAIN[service], service === 'pompiers' ? 'flame' : 'heart', { kind: 'rescue', service, incidentId });
}

/** Explications du jargon des moyens, données une fois dans la ligne. */
const MEANS_EXPLAIN = {
  bravm: 'La BRAV-M\u00a0: policiers à moto, rapides pour interpeller.',
  centaure: 'Le Centaure\u00a0: blindé qui pousse les véhicules et les barricades.',
  canon: 'Le canon à eau\u00a0: camion qui arrose la foule ou le feu.',
} as const;

function tensionWord(t: number): string {
  if (t < 0.3) return 'calme';
  if (t < 0.55) return 'tension montante';
  if (t < 0.8) return 'tendue';
  return 'très tendue';
}

function crowdOf(env: CardEnv, key: string | undefined): CardCrowd | null {
  if (key === undefined) return null;
  return env.crowds.find((c) => c.key === key) ?? null;
}

function unitOf(env: CardEnv, squadId: number | undefined): CardUnit | null {
  if (squadId === undefined || squadId <= 0) return null;
  return env.units.find((u) => u.squadId === squadId) ?? null;
}

/** Note des sommations sous l'en-tête d'une foule. */
function sommationNote(env: CardEnv): string {
  if (env.sommations >= 3) return `Sommations faites — la loi permet\u00a0: ${forceWord(env.lawful)}.`;
  return `Sommations\u00a0: ${env.sommations} sur 3 — gaz et charge pas encore permis.`;
}

function exitsNote(c: CardCrowd): string {
  const n = c.exits.length;
  if (n === 0) return '';
  let held = 0;
  for (const e of c.exits) if (!exitOpen(e)) held++;
  return `${n} rue${n > 1 ? 's' : ''} parte${n > 1 ? 'nt' : ''} d’ici\u00a0: ${held === 0 ? 'aucune n’est tenue' : held === n ? 'toutes sont tenues' : `${held} ${held > 1 ? 'sont tenues' : 'est tenue'}`}.`;
}

// ───────────────────────────── fiches ─────────────────────────────

interface Built {
  /** En-tête sans intention (majuscules). */
  title: string;
  /** Nom du repère en clair, repris sous le titre de l'intention quand une intention est active. */
  name?: string;
  sub: string;
  notes: string[];
  lines: CardLine[];
  others: CardLine[];
  whoFixed?: number[] | null;
}

function rueCard(r: Repere, env: CardEnv): Built {
  const x = r.x, z = r.z;
  const crowd = crowdOf(env, r.crowdKey) ?? nearestCrowd(env, x, z, 150);
  const exit = crowd ? crowd.exits.find((e) => (r.roadEdge !== undefined && r.roadEdge >= 0 ? e.edgeId === r.roadEdge : dist(e.x, e.z, x, z) < 5)) : undefined;
  const parts: string[] = [];
  if (crowd) parts.push(`à ${Math.round(dist(crowd.x, crowd.z, x, z) / 10) * 10}\u00a0m de la foule`);
  if (exit && !exitOpen(exit)) {
    const holder = unitOf(env, exit.squadId);
    parts.push(holder ? `tenue par ${holder.name}` : 'tenue');
  } else parts.push('personne ne la tient');
  const closure = env.closures.find((c) => dist(c.x, c.z, x, z) < 25);
  if (closure) parts.push('fermée aux voitures');
  const lines: CardLine[] = [];
  const others: CardLine[] = [];
  push(lines, verbLine(env, 'couper_circulation', 'street', x, z, { targetId: 0 }));
  push(lines, verbLine(env, 'couper_circulation', 'street', x, z, {
    targetId: BARRAGE_LET_PASSERSBY, label: 'Barrer la rue, passants admis', explain: 'Les manifestants ne passent pas, les passants oui.', icon: 'crowd',
  }));
  push(lines, verbLine(env, 'filtrer', 'street', x, z));
  if (env.canTraffic) {
    lines.push(plainLine('Fermer aux voitures (barrières)', 'Barrières seules\u00a0; les piétons passent.', 'car', { kind: 'closeRoad' }));
  }
  push(lines, verbLine(env, 'ligne', 'autoLine', x, z, { explain: 'Ligne en travers de la rue, face à la foule.' }));
  push(lines, goLine(env, x, z));
  push(others, verbLine(env, 'ligne', 'trace', x, z, { label: 'Tracer la ligne moi-même', explain: 'Désignez les deux bouts de la ligne\u00a0: deux clics, ou Entrée, déplacer, Entrée.' }));
  push(others, verbLine(env, 'avancer', 'point', x, z));
  push(others, verbLine(env, 'faire_mouvement', 'point', x, z));
  push(others, verbLine(env, 'repli', 'point', x, z));
  push(others, verbLine(env, 'degager_obstacle', 'point', x, z, { explain: MEANS_EXPLAIN.centaure }));
  if (env.canTraffic) {
    others.push(plainLine('Fermer le quartier aux voitures', 'Toutes les rues à 100\u00a0m autour sont fermées par barrières.', 'car', { kind: 'closeArea', radius: 100 }));
    if (closure) others.push(plainLine('Rouvrir à la circulation', 'Les barrières sont levées.', 'check', { kind: 'reopen', closureId: closure.id }));
  }
  return { title: r.name.toLocaleUpperCase('fr-FR'), name: capFirst(r.name), sub: parts.join(' · '), notes: [], lines, others };
}

function nearestCrowd(env: CardEnv, x: number, z: number, maxDist: number): CardCrowd | null {
  let best: CardCrowd | null = null;
  let bd = maxDist;
  for (const c of env.crowds) {
    const d = dist(c.x, c.z, x, z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Lignes communes de « Autres ordres ici… » d'une foule ou d'une nasse. */
function crowdOthers(env: CardEnv, x: number, z: number, inLines: (t: OrderType) => boolean): CardLine[] {
  const others: CardLine[] = [];
  if (!inLines('bond_offensif')) push(others, verbLine(env, 'bond_offensif', 'point', x, z));
  push(others, verbLine(env, 'encercler', 'circle', x, z));
  if (!inLines('interpeller')) push(others, verbLine(env, 'interpeller', 'target', x, z, { label: 'Interpeller dans la foule', targetId: 0 }));
  push(others, verbLine(env, 'avancer', 'point', x, z));
  push(others, verbLine(env, 'tortue', 'immediate', x, z));
  if (env.sommations < 3 && (env.canSommation || env.salle)) {
    others.push(plainLine(
      env.salle && !env.canSommation ? 'Faire faire la sommation suivante (officier sur place)' : 'Faire la sommation suivante seulement',
      'Une seule annonce au mégaphone.', 'megaphone', { kind: 'sommation', all: false },
    ));
  }
  return others;
}

function crowdHeader(c: CardCrowd | null, env: CardEnv): { sub: string; notes: string[] } {
  const notes: string[] = [sommationNote(env)];
  if (!c) return { sub: '', notes };
  const ex = exitsNote(c);
  if (ex !== '') notes.push(ex);
  return { sub: [peopleText(c.people), tensionWord(c.tension)].join(' · '), notes };
}

function fouleCard(r: Repere, env: CardEnv): Built {
  const c = crowdOf(env, r.crowdKey);
  const x = r.x, z = r.z;
  const lines: CardLine[] = [];
  // une nasse demande deux unités au moins (une rue chacune) : avec une seule, la ligne ne promet pas ce qu'elle ne peut
  // pas tenir (diag-arrivee P7)
  if (encircleUnitCount(env) >= NASSE_MIN_UNITS) {
    lines.push(plainLine('Encercler (nasse)', 'Chaque rue autour de la foule est tenue par une unité.', 'target', { kind: 'nasse' }, true,
      'Une issue doit rester ouverte et annoncée.'));
  }
  push(lines, verbLine(env, 'ligne', 'autoLine', x, z, { label: 'Contenir\u00a0: ligne face à la foule', explain: 'Une ligne entre vos unités et la foule, boucliers levés.' }));
  push(lines, verbLine(env, 'refoulement', 'point', x, z));
  push(lines, verbLine(env, 'disperser_gaz', 'point', x, z));
  push(lines, verbLine(env, 'charge', 'point', x, z));
  if (env.sommations < 3 && (env.canSommation || env.salle)) {
    lines.push(plainLine(
      env.salle && !env.canSommation ? 'Faire faire les sommations (officier sur place)' : 'Faire les sommations',
      'Les 3 avertissements au mégaphone, ~1\u00a0min\u00a030.', 'megaphone', { kind: 'sommation', all: true },
    ));
  } else push(lines, verbLine(env, 'bond_offensif', 'point', x, z));
  const has = (t: OrderType): boolean => lines.some((l) => l.action.kind === 'verb' && l.action.type === t);
  const h = crowdHeader(c, env);
  const name = c ? capFirst(c.name) : r.name;
  const others = crowdOthers(env, x, z, has);
  // LIAISON — « Négocier un parcours (liaison) » : le dialogue avant la force, en tête de « Autres ordres ici… » de la
  // foule principale (le cortège, celui du directeur de la foule), pour qui commande tout le dispositif, tant que
  // l'équipe de liaison n'est pas déjà au contact (env.liaison, lu par cardEnvFromCore ; envoi : sendLine.ts).
  if (c && c.main && env.liaison === false) {
    others.unshift(plainLine(
      'Négocier un parcours (liaison)',
      'L’équipe de liaison va au contact des organisateurs : la tension monte moins vite et retombe plus vite.',
      'radio', { kind: 'liaison' },
    ));
  }
  return { title: name.toLocaleUpperCase('fr-FR'), name, sub: h.sub, notes: h.notes, lines, others };
}

function nasseCard(r: Repere, env: CardEnv): Built {
  const c = crowdOf(env, r.crowdKey);
  const x = r.x, z = r.z;
  const lines: CardLine[] = [];
  lines.push(plainLine('Ouvrir une sortie filtrée', 'La plus large sortie s’ouvre\u00a0: les gens sortent un par un.', 'sliders', { kind: 'filteredExit' }, false,
    'Issue de nasse\u00a0: annoncez-la à la foule.'));
  push(lines, verbLine(env, 'refoulement', 'point', x, z));
  push(lines, verbLine(env, 'disperser_gaz', 'point', x, z));
  push(lines, verbLine(env, 'interpeller', 'target', x, z, { label: 'Interpeller dans la foule', targetId: 0 }));
  const has = (t: OrderType): boolean => lines.some((l) => l.action.kind === 'verb' && l.action.type === t);
  const place = c && c.place ? ` — ${c.place}` : '';
  const h = crowdHeader(c, env);
  return {
    title: `NASSE FERMÉE${place.toLocaleUpperCase('fr-FR')}`, name: `Nasse fermée${place}`, sub: c ? peopleText(c.people) : '', notes: h.notes, lines,
    others: crowdOthers(env, x, z, has),
  };
}

/** Unité à moi la plus proche d'un point, parmi celles qu'accepte `ok` (null si aucune). */
function nearestMine(env: CardEnv, x: number, z: number, ok: (u: CardUnit) => boolean): CardUnit | null {
  let best: CardUnit | null = null;
  let bd = Infinity;
  for (const u of env.units) {
    if (!u.mine || u.valid <= 0 || !ok(u)) continue;
    const d = dist(u.x, u.z, x, z);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

/** Ordres qui retiennent une unité (barrage, interpellation, tâche) : elle n'est pas proposée pour un incident. */
const BUSY_ORDERS: ReadonlySet<string> = new Set([
  'couper_circulation', 'filtrer', 'encercler', 'interpeller', 'escorter', 'proteger', 'degager_barricade', 'degager_obstacle',
  'charge', 'disperser_gaz', 'refoulement',
]);

/** Unité à pied qui peut prendre un incident (section, groupe, binôme : ni engin, ni patrouille, ni drone). */
function footUnit(u: CardUnit): boolean {
  return (u.symbol === 'section' || u.symbol === 'groupe' || u.symbol === 'binome') && !(u.order && BUSY_ORDERS.has(String(u.order.type)));
}

const FIRE_KINDS: ReadonlySet<IncidentKind> = new Set(['feu_poubelle', 'feu_barricade', 'feu_vehicule', 'feu_boutique']);
const INJURY_KINDS: ReadonlySet<IncidentKind> = new Set(['blesse', 'agent_a_terre']);
const ARREST_KINDS: ReadonlySet<IncidentKind> = new Set(['suspect', 'pillage']);

function meansLine(env: CardEnv, inc: CardIncident, means: IncidentMeans): CardLine | null {
  const x = inc.x, z = inc.z;
  const eta = (u: CardUnit): string => minutesText(etaFor(u, x, z).eta);
  const arrest = ARREST_KINDS.has(inc.kind);
  switch (means) {
    case 'unite': {
      const u = nearestMine(env, x, z, footUnit);
      if (!u) return null;
      const label = arrest ? `Interpeller avec ${u.name} (${eta(u)})` : `Envoyer ${u.name} (la plus proche, ${eta(u)})`;
      return plainLine(label, arrest ? 'Le groupe le plus proche interpelle, sur fait constaté.' : 'L’unité libre la plus proche s’en occupe.',
        arrest ? 'hand' : 'nav', { kind: 'means', incidentId: inc.id, means, squadId: u.squadId }, true);
    }
    case 'canon_eau': {
      const u = nearestMine(env, x, z, (q) => q.symbol === 'canon_eau');
      if (!u) return null;
      return plainLine(`Envoyer le canon à eau ${u.name} (${eta(u)})`, MEANS_EXPLAIN.canon, 'drop', { kind: 'means', incidentId: inc.id, means, squadId: u.squadId }, true);
    }
    case 'centaure': {
      const u = nearestMine(env, x, z, (q) => q.symbol === 'centaure');
      if (!u) return null;
      const label = inc.kind === 'barricade' ? `Dégager avec le blindé Centaure (${eta(u)})` : `Envoyer le blindé Centaure (${eta(u)})`;
      return plainLine(label, MEANS_EXPLAIN.centaure, 'shield', { kind: 'means', incidentId: inc.id, means, squadId: u.squadId }, true);
    }
    case 'bravm': {
      const u = nearestMine(env, x, z, (q) => q.symbol === 'bravm');
      if (!u) return null;
      const label = arrest ? `Interpeller avec la BRAV-M (${eta(u)})` : `Envoyer la BRAV-M (${eta(u)})`;
      return plainLine(label, MEANS_EXPLAIN.bravm, 'bolt', { kind: 'means', incidentId: inc.id, means, squadId: u.squadId }, true);
    }
    case 'pompiers':
    case 'samu':
      if (!env.hasRescue || !env.canDelegate) return null;
      return rescueLine(means, inc.id, means === 'pompiers' ? 'Envoyer les pompiers' : 'Envoyer le SAMU');
    default:
      return null;
  }
}

function incidentCard(r: Repere, env: CardEnv): Built {
  const inc = env.incidents.find((i) => i.id === r.incidentId);
  if (!inc) return { title: r.name.toLocaleUpperCase('fr-FR'), sub: 'Incident clos', notes: [], lines: [], others: [] };
  const lines: CardLine[] = [];
  const others: CardLine[] = [];
  for (const m of MEANS_FOR[inc.kind] ?? []) push(lines, meansLine(env, inc, m));
  const assigned = inc.means !== '' && (inc.state === 'assigne' || inc.state === 'en_cours');
  if (assigned) lines.push(plainLine('Retirer l’affectation', 'Plus personne n’en est chargé.', 'close', { kind: 'unassign', incidentId: inc.id }));
  if (inc.callId !== 0) lines.push(plainLine('Annuler la demande de secours', 'Les secours appelés font demi-tour.', 'close', { kind: 'cancelCall', callId: inc.callId }));
  if (env.level !== 'lecture') others.push(plainLine('Confier à une autre unité…', 'Choisissez l’unité dans la liste.', 'list', { kind: 'assignOther', incidentId: inc.id }, true));
  if (env.hasRescue) {
    push(others, verbLine(env, 'proteger', inc.callVehicleId !== 0 ? 'target' : 'point', inc.x, inc.z, {
      label: 'Protéger les secours', explain: 'Une unité couvre les secours pendant leur intervention.',
      targetId: inc.callVehicleId !== 0 ? inc.callVehicleId : undefined,
    }));
  }
  others.push(plainLine('Centrer la carte', 'La carte se centre sur l’incident.', 'eye', { kind: 'centre' }));
  // « à les pompiers » / « à le SAMU » se contractent (« aux pompiers », « au SAMU »)
  const to = inc.assignee || (inc.means === 'pompiers' ? 'les pompiers' : inc.means === 'samu' ? 'le SAMU' : 'une unité');
  const who = assigned ? `confié ${/^les /i.test(to) ? 'aux ' + to.slice(4) : /^le /i.test(to) ? 'au ' + to.slice(3) : 'à ' + to}` : 'personne n’y va';
  return {
    title: INCIDENT_KIND_LABELS[inc.kind].toLocaleUpperCase('fr-FR'), name: INCIDENT_KIND_LABELS[inc.kind],
    sub: [inc.place, who, `depuis ${ageLabel(inc.age)}`].filter((s) => s !== '').join(' · '),
    notes: [MEANS_ADVICE[inc.kind]], lines: lines.slice(0, 6), others: lines.slice(6).concat(others),
  };
}

function moraleWord(m: number): string {
  if (m >= 0.7) return 'moral bon';
  if (m >= 0.4) return 'moral moyen';
  return 'moral bas';
}

function uniteCard(r: Repere, env: CardEnv): Built {
  const u = unitOf(env, r.squadId);
  if (!u) return { title: r.name.toLocaleUpperCase('fr-FR'), sub: '', notes: [], lines: [], others: [], whoFixed: null };
  const x = u.x, z = u.z;
  const lines: CardLine[] = [];
  const others: CardLine[] = [];
  // fourgon cellulaire : il part au commissariat avec ses interpellés (le transfert fait venir un autre fourgon)
  if (u.cellular && u.mine) {
    lines.push(plainLine('Partir au commissariat', `${u.status !== '' ? u.status + '\u00a0; ' : ''}ses interpellés y sont remis, un autre fourgon prend la remise.`, 'flag', { kind: 'transfer', squadId: u.squadId }));
  }
  lines.push(plainLine('L’envoyer ailleurs…', 'Montrez ensuite le lieu sur la carte.', 'nav', { kind: 'sendElsewhere' }, true));
  push(lines, verbLine(env, 'tenir', 'immediate', x, z));
  push(lines, verbLine(env, 'cesser', 'immediate', x, z));
  push(lines, verbLine(env, 'libre', 'immediate', x, z));
  if (u.hasVehicles) push(lines, verbLine(env, u.embarked ? 'debarquer' : 'embarquer', 'immediate', x, z));
  const home = u.homeStation !== '' ? verbLine(env, 'retour_poste', 'immediate', x, z, { explain: `Vers ${u.homeStation}\u00a0; ${plainOf('retour_poste')?.explain ?? ''}`.trim() }) : null;
  if (home) lines.push(home);
  else push(lines, verbLine(env, 'tortue', 'immediate', x, z));
  if (home) push(others, verbLine(env, 'tortue', 'immediate', x, z));
  others.push(plainLine('Se replier…', 'Montrez ensuite la position de repli.', 'chevron_down', { kind: 'sendElsewhere', type: 'repli' }, true));
  others.push(plainLine('Avancer en formation…', 'Montrez ensuite le point à atteindre.', 'arrow_up', { kind: 'sendElsewhere', type: 'avancer' }, true));
  others.push(plainLine('Protéger une autre unité…', 'Désignez ensuite l’unité à couvrir.', 'shield', { kind: 'pickTarget', type: 'proteger' }, true));
  others.push(plainLine('Escorter une autre unité…', 'Désignez ensuite l’unité à accompagner.', 'nav', { kind: 'pickTarget', type: 'escorter' }, true));
  others.push(plainLine('Suivre une autre unité…', 'Désignez ensuite l’unité à suivre.', 'chevrons', { kind: 'pickTarget', type: 'suivre' }, true));
  if (!home && verbOf('retour_poste')) push(others, verbLine(env, 'retour_poste', 'immediate', x, z));
  others.push(plainLine('Centrer la carte', 'La carte se centre sur l’unité.', 'eye', { kind: 'centre' }));
  const facts = [`${u.valid}/${u.total} agents`, moraleWord(u.morale)];
  if (u.ammo >= 0) facts.push(`munitions ${u.ammo}`);
  const notes: string[] = [];
  const o = u.order;
  if (o) {
    const ago = Math.max(0, env.now - o.issuedAt);
    const state = u.status !== '' ? ` · ${u.status}` : '';
    notes.push(`Ce qu’elle fait\u00a0: ${doingAt(o.type, u.orderPlace, o.targetId) || 'un ordre en cours'}${state} · ordre donné il y a ${ageLabel(ago)}`);
  } else notes.push(`Ce qu’elle fait\u00a0: ${u.status !== '' ? u.status : 'sans ordre'}`);
  if (u.total > 0 && u.valid / u.total < 0.6) notes.push('⚠ Moins de 60\u00a0% d’agents valides\u00a0: relève conseillée.');
  return { title: unitTitle(u).toLocaleUpperCase('fr-FR'), name: unitTitle(u), sub: facts.join(' · '), notes, lines, others, whoFixed: [u.squadId] };
}

function cibleCard(r: Repere, env: CardEnv): Built {
  const u = unitOf(env, r.squadId) ?? env.units.find((q) => `cible:${q.key}` === r.key) ?? null;
  const lines: CardLine[] = [];
  const target = u ? u.targetEntity : 0;
  const x = r.x, z = r.z;
  push(lines, verbLine(env, 'proteger', 'target', x, z, { label: 'La protéger', targetId: target }));
  push(lines, verbLine(env, 'escorter', 'target', x, z, { label: 'L’escorter', targetId: target }));
  push(lines, verbLine(env, 'suivre', 'target', x, z, { label: 'La suivre', targetId: target }));
  const doing = u && u.order ? doingAt(u.order.type, u.orderPlace, u.order.targetId) : u && u.status ? capFirst(u.status) : '';
  return {
    title: (u ? unitTitle(u) : r.name).toLocaleUpperCase('fr-FR'), name: u ? unitTitle(u) : r.name, sub: [doing, 'pas sous vos ordres'].filter((s) => s !== '').join(' · '),
    notes: [], lines: target !== 0 ? lines : [], others: [],
  };
}

/** « Toute la compagnie », « Toute la section », « Votre groupe » : ce que les ordres « Suivez-moi » visent. */
function followSubject(env: CardEnv): string {
  return env.command === 'compagnie' ? 'Toute la compagnie' : env.command === 'section' ? 'Toute la section' : 'Votre groupe';
}

function vousCard(r: Repere, env: CardEnv): Built {
  const who = followSubject(env);
  const lines: CardLine[] = [
    plainLine('Suivez-moi à pied', `${who} descend et vous suit à pied.`, 'arrow_up', { kind: 'follow', column: false }),
    plainLine('Suivez-moi en véhicules', `${who} remonte et suit votre véhicule.`, 'car', { kind: 'follow', column: true }),
    plainLine('Centrer sur moi', 'La carte se centre sur votre position.', 'eye', { kind: 'centre' }),
  ];
  const title = env.player && env.player.title !== '' && env.player.title !== 'Vous' ? `VOUS — ${env.player.title}` : 'VOUS';
  return { title, name: r.name, sub: env.player?.inVehicle ? 'à bord de votre véhicule' : 'à pied', notes: [], lines, others: [] };
}

function pointCard(r: Repere, env: CardEnv): Built {
  const x = r.x, z = r.z;
  const lines: CardLine[] = [];
  const others: CardLine[] = [];
  push(lines, goLine(env, x, z));
  push(lines, verbLine(env, 'avancer', 'point', x, z));
  push(lines, verbLine(env, 'ligne', 'autoLine', x, z));
  push(lines, verbLine(env, 'repli', 'point', x, z));
  if (env.hasRescue && env.canDelegate) {
    lines.push(rescueLine('pompiers', 0, 'Pompiers ici'));
    lines.push(rescueLine('samu', 0, 'SAMU ici'));
  }
  push(others, verbLine(env, 'faire_mouvement', 'point', x, z));
  push(others, verbLine(env, 'ligne', 'trace', x, z, { label: 'Tracer la ligne moi-même', explain: 'Désignez les deux bouts de la ligne\u00a0: deux clics, ou Entrée, déplacer, Entrée.' }));
  push(others, verbLine(env, 'bond_offensif', 'point', x, z, { label: 'Bond en avant jusqu’ici' }));
  push(others, verbLine(env, 'charge', 'point', x, z, { label: 'Charger jusqu’ici' }));
  push(others, verbLine(env, 'disperser_gaz', 'point', x, z, { label: 'Disperser au gaz ici' }));
  push(others, verbLine(env, 'encercler', 'circle', x, z, { label: 'Encercler en cercle serré ici' }));
  push(others, verbLine(env, 'interpeller', 'target', x, z, { targetId: 0 }));
  push(others, verbLine(env, 'degager_obstacle', 'point', x, z, { explain: MEANS_EXPLAIN.centaure }));
  if (env.canTraffic) others.push(plainLine('Fermer le quartier aux voitures (100\u00a0m)', 'Toutes les rues à 100\u00a0m autour sont fermées par barrières.', 'car', { kind: 'closeArea', radius: 100 }));
  return { title: r.name.toLocaleUpperCase('fr-FR'), name: r.name, sub: '', notes: [], lines, others };
}

function bloqueurCard(r: Repere, env: CardEnv): Built {
  const street = env.blocked?.street ?? '';
  const lines: CardLine[] = [];
  push(lines, verbLine(env, 'degager_obstacle', 'point', r.x, r.z, { label: 'Envoyer le blindé Centaure le pousser', explain: MEANS_EXPLAIN.centaure }));
  return { title: `UN VÉHICULE BLOQUE VOTRE COLONNE${street ? ' — ' + street.toLocaleUpperCase('fr-FR') : ''}`, name: r.name, sub: '', notes: [], lines, others: [] };
}

function metroCard(r: Repere, env: CardEnv): Built {
  const m = env.metro.find((s) => s.id === r.metroId);
  if (!m) return { title: r.name.toLocaleUpperCase('fr-FR'), sub: '', notes: [], lines: [], others: [] };
  const lines: CardLine[] = [];
  if (env.canMetro && env.level === 'tout') {
    lines.push(m.open
      ? plainLine('Fermer la station', 'Plus personne n’arrive par cette station\u00a0: le flux passe aux stations voisines.', 'metro', { kind: 'metro', stationId: m.id, op: 'close' })
      : plainLine('Rouvrir la station', 'Les voyageurs arrivent de nouveau par cette station.', 'metro', { kind: 'metro', stationId: m.id, op: 'open' }));
    lines.push(m.filtered
      ? plainLine('Lever le filtrage', 'L’unité quitte la sortie de la station.', 'close', { kind: 'metro', stationId: m.id, op: 'unfilter' })
      : plainLine('Filtrer la sortie', 'Une unité contrôle la sortie\u00a0: les arrivées ralentissent.', 'sliders', { kind: 'metro', stationId: m.id, op: 'filter' }, true));
  }
  const rate = Math.round(m.inflow);
  const state = [m.open ? 'ouverte' : 'fermée', m.filtered ? 'sortie filtrée' : '', m.open ? `${rate} arrivée${rate > 1 ? 's' : ''}/min` : ''].filter((s) => s !== '');
  return { title: `STATION ${m.name.toLocaleUpperCase('fr-FR')}`, name: `Station ${m.name}`, sub: state.join(' · '), notes: [], lines, others: [] };
}

function fermetureCard(r: Repere, env: CardEnv): Built {
  const c = env.closures.find((q) => q.id === r.closureId);
  if (!c) return { title: r.name.toLocaleUpperCase('fr-FR'), sub: '', notes: [], lines: [], others: [] };
  const lines: CardLine[] = [];
  const others: CardLine[] = [];
  if (env.canTraffic) {
    lines.push(plainLine('Rouvrir à la circulation', 'Les barrières sont levées.', 'check', { kind: 'reopen', closureId: c.id }));
    others.push(plainLine('Tout rouvrir', 'Toutes les rues fermées sont rouvertes.', 'check', { kind: 'reopenAll' }));
  }
  return {
    title: (c.name || 'Rue fermée').toLocaleUpperCase('fr-FR'), name: capFirst(c.name || 'rue fermée'),
    sub: `fermée aux voitures · ${c.heldBy !== '' ? `tenue par ${c.heldBy}` : 'barrières seules'}`, notes: [], lines, others,
  };
}

function propositionCard(r: Repere, env: CardEnv): Built {
  const p = env.proposals.find((q) => q.id === r.proposalId);
  if (!p) return { title: 'PROPOSITION DE L’ADJOINT', sub: 'Proposition retirée', notes: [], lines: [], others: [] };
  const lines: CardLine[] = [];
  if (p.executable) lines.push(plainLine('Accepter', 'L’ordre part en votre nom.', 'check', { kind: 'proposal', accept: true }));
  else if (p.key.startsWith('sommation') && env.sommations < 3 && (env.canSommation || env.salle)) {
    lines.push(plainLine(env.canSommation ? 'Faire les sommations' : 'Faire faire les sommations (officier sur place)',
      'Les 3 avertissements au mégaphone, ~1\u00a0min\u00a030.', 'megaphone', { kind: 'sommation', all: true }));
  }
  lines.push(plainLine('Plus tard', 'La proposition est écartée.', 'clock', { kind: 'proposal', accept: false }));
  return { title: proposalTitle(p).toLocaleUpperCase('fr-FR'), name: proposalTitle(p), sub: 'L’adjoint propose', notes: [], lines, others: [] };
}

/** Unités d'un poste dans l'ordre de la fiche : prêtes d'abord, puis en alerte, chacune par délai d'arrivée. */
export function stationEntriesOrdered(s: CardStation): CardStation['entries'][number][] {
  const rank = (state: string): number => (state === 'pret' ? 0 : state === 'alerte' ? 1 : 2);
  return s.entries.filter((e) => rank(e.state) < 2).sort((a, b) => rank(a.state) - rank(b.state) || a.eta - b.eta || a.entryId - b.entryId);
}

function commissariatCard(r: Repere, env: CardEnv): Built {
  const s = env.stations.find((q) => q.id === r.stationId);
  if (!s) return { title: r.name.toLocaleUpperCase('fr-FR'), sub: '', notes: [], lines: [], others: [] };
  const ready = stationEntriesOrdered(s);
  const notes: string[] = [];
  const lines: CardLine[] = [];
  if (env.level !== 'tout') notes.push('Seul le commandant engage les moyens des commissariats.');
  else if (!s.renforts) notes.push('Moyens fixés par l’ordre d’opération.');
  else {
    for (const e of ready.slice(0, 5)) {
      lines.push(plainLine(`Envoyer ${e.name} — ${e.what} · ${e.stateLabel}`, `Arrivée ~${minutesText(e.eta)}\u00a0; vous montrez ensuite où l’envoyer.`, e.icon,
        { kind: 'engage', entryId: e.entryId, defaultVerb: e.defaultVerb }));
    }
  }
  lines.push(plainLine('Toutes les unités du poste…', 'La liste complète du commissariat et l’état de chaque unité.', 'list', { kind: 'stationList', stationId: s.id }));
  const km = s.distance >= 1000 ? `${(s.distance / 1000).toFixed(1).replace('.', ',')}\u00a0km` : `${Math.round(s.distance / 10) * 10}\u00a0m`;
  const nReady = s.entries.filter((e) => e.state === 'pret').length;
  return {
    title: `${upperTitle(s.name)}${s.street ? ' — ' + s.street : ''}`, name: capFirst(s.name),
    sub: `${km} · ≈\u00a0${minutesText(s.eta)} deux-tons · ${nReady} prête${nReady > 1 ? 's' : ''}`, notes, lines,
    others: [plainLine('Centrer la carte', 'La carte se centre sur le commissariat.', 'eye', { kind: 'centre' })],
  };
}

const BUILDERS: Readonly<Record<RepereKind, (r: Repere, env: CardEnv) => Built>> = {
  rue: rueCard, foule: fouleCard, nasse: nasseCard, incident: incidentCard, unite: uniteCard, cible: cibleCard, vous: vousCard,
  point: pointCard, metro: metroCard, fermeture: fermetureCard, proposition: propositionCard, commissariat: commissariatCard,
  bloqueur: bloqueurCard,
};

// ───────────────────────────── registres (extensions) ─────────────────────────────

type CardBuilder = (r: Repere, env: CardEnv, intent: IntentId | null) => Card;
type LineProvider = (r: Repere, env: CardEnv) => { lines?: readonly CardLine[]; others?: readonly CardLine[] };

const customBuilders = new Map<RepereKind, CardBuilder>();
const lineProviders: { kind: RepereKind; fn: LineProvider }[] = [];

/** Remplace la fiche d'un genre de repère. Retourne la fonction de retrait (la fiche d'origine revient). */
export function registerCardBuilder(kind: RepereKind, builder: CardBuilder): () => void {
  customBuilders.set(kind, builder);
  return () => {
    if (customBuilders.get(kind) === builder) customBuilders.delete(kind);
  };
}

/** Ajoute des lignes à la fiche d'un genre de repère (places libres parmi les six, sinon « Autres ordres ici… »). */
export function registerCardLines(kind: RepereKind, fn: LineProvider): () => void {
  const entry = { kind, fn };
  lineProviders.push(entry);
  return () => {
    const i = lineProviders.indexOf(entry);
    if (i >= 0) lineProviders.splice(i, 1);
  };
}

// ───────────────────────────── ligne par défaut de l'intention ─────────────────────────────

/** Nombre maximal de lignes numérotées d'une fiche. */
export const MAX_LINES = 6;

function isVerb(l: CardLine, type: OrderType, targetId?: number): boolean {
  return l.action.kind === 'verb' && l.action.type === type && (targetId === undefined || (l.action.targetId ?? 0) === targetId);
}

/** Ligne voulue par l'intention sur ce genre de repère (dans `lines` ou `others`), null : la ligne 1. */
function intentPick(intent: IntentId, r: Repere, all: readonly CardLine[]): CardLine | null {
  const find = (pred: (l: CardLine) => boolean): CardLine | null => all.find(pred) ?? null;
  switch (intent) {
    case 'envoyer':
      if (r.kind === 'unite') return find((l) => l.action.kind === 'sendElsewhere' && l.action.type === undefined);
      if (r.kind === 'incident') return find((l) => l.action.kind === 'means' || l.action.kind === 'rescue');
      return find((l) => l.label === 'Y aller');
    case 'bloquer':
      return find((l) => isVerb(l, 'couper_circulation', 0));
    case 'encercler':
      return find((l) => l.action.kind === 'nasse') ?? find((l) => l.action.kind === 'filteredExit') ?? find((l) => isVerb(l, 'encercler'));
    case 'disperser': {
      // la ligne la moins forte qui soit permise (sinon la moins forte)
      const order: OrderType[] = ['refoulement', 'bond_offensif', 'charge', 'disperser_gaz'];
      const cands = order.map((t) => find((l) => isVerb(l, t))).filter((l): l is CardLine => l !== null);
      return cands.find((l) => l.lock === null) ?? cands[0] ?? null;
    }
    case 'interpeller':
      if (r.kind === 'incident') {
        return find((l) => l.action.kind === 'means' && l.action.means === 'bravm') ?? find((l) => l.action.kind === 'means' && l.action.means === 'unite');
      }
      return find((l) => isVerb(l, 'interpeller'));
    case 'secours':
      if (r.kind === 'incident') return find((l) => l.action.kind === 'rescue');
      return find((l) => l.action.kind === 'rescue' && l.action.service === 'pompiers');
    default:
      return null;
  }
}

/**
 * Ligne « Y aller » ajoutée à une fiche qui n'en a pas quand l'intention est « Envoyer » (une foule : on y va en
 * formation).
 */
function synthIntentLine(intent: IntentId, r: Repere, env: CardEnv): CardLine | null {
  if (intent === 'envoyer' && (r.kind === 'foule' || r.kind === 'nasse' || r.kind === 'bloqueur' || r.kind === 'fermeture' || r.kind === 'metro')) {
    return goLine(env, r.x, r.z);
  }
  return null;
}

// ───────────────────────────── construction ─────────────────────────────

/**
 * Ordres qu'une voiture de patrouille (Police secours, BAC : trois policiers, sans boucliers) n'exécute pas : le module
 * des patrouilles en fait un simple trajet en urgence (gameplay/patrols, MOVE_ORDERS) — la fiche offrait « Tenir une
 * ligne ici », « Charger », « Disperser au gaz »… et la phrase promettait « boucliers levés ».
 */
const PATROL_UNFIT: ReadonlySet<string> = new Set([
  'ligne', 'avancer', 'charge', 'refoulement', 'bond_offensif', 'disperser_gaz', 'encercler', 'tortue', 'couper_circulation', 'filtrer',
  'degager_obstacle', 'degager_barricade',
]);

/** Ordres restants dont la voiture fait un trajet en urgence (« Y aller », « Se replier ici »…). */
const PATROL_DRIVES_TO: ReadonlySet<string> = new Set(['avancer', 'colonne', 'faire_mouvement', 'repli']);

/** Les unités visées par la fiche (l'unité de sa fiche, sinon la sélection) sont-elles toutes des voitures de patrouille ? */
function patrolOnly(r: Repere, env: CardEnv): boolean {
  const ids = r.kind === 'unite' && r.squadId !== undefined && r.squadId > 0 ? [r.squadId] : env.selection;
  return ids.length > 0 && ids.every((id) => env.units.find((u) => u.squadId === id)?.patrol === true);
}

/** Ligne qu'une voiture de patrouille ne peut pas tenir (« Y aller » reste : la voiture s'y rend). */
function patrolUnfit(l: CardLine): boolean {
  const a = l.action;
  if (a.kind === 'verb') return l.label !== 'Y aller' && PATROL_UNFIT.has(String(a.type));
  if (a.kind === 'sendElsewhere') return a.type !== undefined && PATROL_UNFIT.has(String(a.type));
  return a.kind === 'nasse' || a.kind === 'filteredExit';
}

/** Fiche d'origine d'un repère (sans les fiches remplacées par registerCardBuilder). */
export function defaultCardBuilder(r: Repere, env: CardEnv, intent: IntentId | null): Card {
  const b = BUILDERS[r.kind](r, env);
  let lines = b.lines.slice();
  let others = b.others.slice();
  for (const p of lineProviders) {
    if (p.kind !== r.kind) continue;
    let extra: ReturnType<LineProvider> = {};
    try { extra = p.fn(r, env); } catch { extra = {}; }
    for (const l of extra.lines ?? []) (lines.length < MAX_LINES ? lines : others).push(l);
    for (const l of extra.others ?? []) others.push(l);
  }
  // une voiture de patrouille ne tient ni ligne ni barrage, ne charge pas, ne gaze pas : ces lignes ne lui sont pas offertes
  if (patrolOnly(r, env)) {
    // ce qui reste roule : « Y aller » ne dit plus « à pied, en formation » (gameplay/patrols, MOVE_ORDERS)
    const drive = (l: CardLine): CardLine => (l.action.kind === 'verb' && PATROL_DRIVES_TO.has(String(l.action.type))
      ? { ...l, explain: 'En voiture, deux-tons ; elle s’arrête juste avant.' } : l);
    lines = lines.filter((l) => !patrolUnfit(l)).map(drive);
    others = others.filter((l) => !patrolUnfit(l)).map(drive);
  }
  // lecture seule : aucune action (la fiche ne fait que renseigner)
  if (env.level === 'lecture') {
    lines = [];
    others = [];
  }
  if (lines.length > MAX_LINES) {
    others = lines.slice(MAX_LINES).concat(others);
    lines = lines.slice(0, MAX_LINES);
  }
  let defaultLine = 0;
  if (intent && lines.length > 0) {
    let pick = intentPick(intent, r, lines.concat(others));
    if (!pick) {
      const synth = synthIntentLine(intent, r, env);
      if (synth) {
        others.unshift(synth);
        pick = synth;
      }
    }
    if (pick) {
      const i = lines.indexOf(pick);
      if (i >= 0) defaultLine = i;
      else {
        // la ligne de l'intention est toujours visible : elle prend la place de la ligne 6
        others.splice(others.indexOf(pick), 1);
        if (lines.length >= MAX_LINES) others.unshift(lines.pop()!);
        lines.push(pick);
        defaultLine = lines.length - 1;
      }
    }
  }
  // avec une intention, le titre la dit (« BLOQUER UNE RUE ») et le lieu passe dans le sous-titre
  const title = intent ? intentById(intent).label.toLocaleUpperCase('fr-FR') : b.title;
  const sub = intent ? [b.name ?? r.name, b.sub].filter((t) => t !== '').join(' · ') : b.sub;
  return {
    repere: r, title, sub, notes: b.notes, lines, others, defaultLine, stack: [r],
    whoFixed: b.whoFixed ?? null,
  };
}

/**
 * Fiche d'un repère pour l'intention active (null : aucune). Au plus six lignes ; la ligne par défaut est celle de
 * l'intention, toujours parmi les six ; en lecture seule, aucune ligne.
 */
export function buildCard(r: Repere, env: CardEnv, intent: IntentId | null): Card {
  const custom = customBuilders.get(r.kind);
  if (custom) {
    try {
      const c = custom(r, env, intent);
      if (env.level === 'lecture') return { ...c, lines: [], others: [], defaultLine: 0 };
      return c;
    } catch {
      /* fiche d'extension défaillante : la fiche d'origine */
    }
  }
  return defaultCardBuilder(r, env, intent);
}

// ───────────────────────────── candidats d'une intention ─────────────────────────────

const STATE_RANK: Readonly<Record<IncidentState, number>> = { ouvert: 0, assigne: 1, en_cours: 2, echoue: 3, resolu: 4 };

/** Ordre des incidents : non traités d'abord, puis urgence décroissante, puis le plus ancien. */
export function compareCardIncidents(a: CardIncident, b: CardIncident): number {
  return (STATE_RANK[a.state] ?? 9) - (STATE_RANK[b.state] ?? 9) || b.urgency - a.urgency || b.age - a.age || a.id - b.id;
}

function sortedIncidents(env: CardEnv, ok: (i: CardIncident) => boolean): CardIncident[] {
  return env.incidents.filter((i) => incidentOpen(i.state) && ok(i)).sort(compareCardIncidents);
}

/** Ordres sans point à rejoindre (leur objectif n'est pas un lieu). */
const NO_POINT: ReadonlySet<string> = new Set(['libre', 'suivre', 'escorter', 'cesser', 'embarquer', 'debarquer', 'tortue', 'tenir', 'suivre_pied', 'avec_moi']);

function targetRepere(u: CardUnit, env: CardEnv): Repere | null {
  const o = u.order;
  if (!o || NO_POINT.has(String(o.type)) || !Number.isFinite(o.x) || !Number.isFinite(o.z) || (o.x === 0 && o.z === 0)) return null;
  return placeRepere(o.x, o.z, env);
}

/** La rue d'issue est-elle devant la foule (dans son sens de marche) ? Faux si la foule ne marche pas. */
function ahead(c: CardCrowd, x: number, z: number): boolean {
  if (!Number.isFinite(c.heading)) return false;
  return (x - c.x) * Math.sin(c.heading) + (z - c.z) * Math.cos(c.heading) > 0;
}

/** Rues d'issue de toutes les foules : libres d'abord (la foule principale, puis devant la marche, puis les plus proches), puis tenues. */
export function blockCandidates(env: CardEnv, from: { x: number; z: number }): Repere[] {
  const main = mainCrowd(env);
  const items: { r: Repere; held: number; other: number; path: number; behind: number; d: number }[] = [];
  const seen = new Set<string>();
  for (const c of orderedCrowds(env)) {
    for (const e of c.exits) {
      const r = exitRepere(e, c.key, env, c);
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      // les rues d'abord, les trouées piétonnes hors voie ensuite (à rang égal : libre, foule principale)
      items.push({
        r, held: exitOpen(e) ? 0 : 1, other: c === main ? 0 : 1, path: e.edgeId < 0 ? 1 : 0, behind: ahead(c, e.x, e.z) ? 0 : 1,
        d: dist(e.x, e.z, from.x, from.z),
      });
    }
  }
  items.sort((a, b) => a.held - b.held || a.other - b.other || a.path - b.path || a.behind - b.behind || a.d - b.d);
  return items.map((i) => i.r);
}

/** Foules et nasses, par effectif × tension décroissant. */
function crowdsByWeight(env: CardEnv): Repere[] {
  return env.crowds.slice().sort((a, b) => crowdWeight(b) - crowdWeight(a) || (a.key < b.key ? -1 : 1)).map(crowdRepere);
}

function dedupe(list: readonly (Repere | null)[]): Repere[] {
  const seen = new Set<string>();
  const out: Repere[] = [];
  for (const r of list) {
    if (!r || seen.has(r.key)) continue;
    seen.add(r.key);
    out.push(r);
  }
  return out;
}

/**
 * Repères que ←/→ parcourent pour une intention, le premier étant celui où la visée se pose (tableau des intentions,
 * §2.3). `from` : position actuelle de la visée.
 */
export function intentCandidates(intent: IntentId, env: CardEnv, from: { x: number; z: number }): Repere[] {
  switch (intent) {
    case 'envoyer': {
      const sel = env.selection.map((id) => env.units.find((u) => u.squadId === id)).find((u) => u && u.order) ?? null;
      const main = mainCrowd(env);
      const todo = sortedIncidents(env, (i) => i.state === 'ouvert').map(incidentRepere);
      const kettles = env.crowds.filter((c) => c.closed).map(crowdRepere);
      const targets = env.units.filter((u) => u.mine).sort((a, b) => (b.order?.issuedAt ?? 0) - (a.order?.issuedAt ?? 0)).map((u) => targetRepere(u, env));
      return dedupe([sel ? targetRepere(sel, env) : null, main ? crowdRepere(main) : null, ...todo, ...kettles, ...crowdsByWeight(env), ...targets]);
    }
    case 'bloquer': {
      const list = blockCandidates(env, from);
      if (list.length > 0) return list;
      const road = env.roadAt(from.x, from.z, 40);
      return road ? [roadRepere(road)] : [];
    }
    case 'encercler': {
      if (encircleUnitCount(env) < NASSE_MIN_UNITS) return [];
      const near = env.crowds.slice().sort((a, b) => dist(a.x, a.z, from.x, from.z) - dist(b.x, b.z, from.x, from.z))[0];
      return dedupe([near ? crowdRepere(near) : null, ...crowdsByWeight(env)]);
    }
    case 'disperser':
      return crowdsByWeight(env);
    case 'interpeller':
      return dedupe([...sortedIncidents(env, (i) => ARREST_KINDS.has(i.kind)).map(incidentRepere), ...crowdsByWeight(env)]);
    case 'secours':
      return dedupe([
        ...sortedIncidents(env, (i) => FIRE_KINDS.has(i.kind) || INJURY_KINDS.has(i.kind)).map(incidentRepere),
        pointRepere(from.x, from.z, env),
      ]);
    default:
      return [];
  }
}

// ───────────────────────────── « Tous les ordres » ─────────────────────────────

export interface OrderFamily {
  group: OrderGroup;
  label: string;
  verbs: OrderVerb[];
}

const GROUP_ORDER: readonly OrderGroup[] = ['posture', 'mouvement', 'manoeuvre', 'appui', 'fin'];

/** Tous les ordres du catalogue par famille (« Se placer », « Se déplacer »…), dans l'ordre du catalogue. */
export function allOrdersGrouped(): OrderFamily[] {
  const out: OrderFamily[] = [];
  for (const g of GROUP_ORDER) {
    const verbs = ORDER_VERBS.filter((v) => v.group === g);
    if (verbs.length > 0) out.push({ group: g, label: ORDER_GROUP_LABELS[g], verbs });
  }
  // un verbe d'une famille inconnue (ajouté par un autre module) n'est pas perdu
  const known = new Set<string>(GROUP_ORDER);
  const extra = ORDER_VERBS.filter((v) => !known.has(v.group));
  if (extra.length > 0) out[out.length - 1]!.verbs.push(...extra);
  return out;
}

/** Textes en clair des ordres ajoutés hors catalogue (réexport pour les fiches de P5). */
export { EXTRA_PLAIN };
