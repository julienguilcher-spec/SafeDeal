/* =====================================================================================
 * Page d'accueil — modèle du scénario (logique pure, testée sous Node).
 *
 *   defaultDraft()            brouillon de départ
 *   sanitizeDraft(d)          borne les valeurs et rétablit la cohérence rôle / grade / poste
 *   buildSessionConfig(d)     brouillon → SessionConfig (tout le reste dans config.extra, voir ScenarioExtra)
 *   draftFromConfig(c)        SessionConfig → brouillon (scénarios enregistrés, « Continuer », missions)
 *   surpriseDraft(rng, …)     « Surprends-moi » : tirage aléatoire cohérent
 *   summarize(d)              résumé du scénario en une ou deux phrases
 * ===================================================================================== */

import type {
  DurationPreset, GameMode, PlayableRole, PolicePoste, PoliceRank, Rng, SessionConfig, ViolenceLevel, WeatherKind,
} from '@/core/contracts';
import type { CauseLike, CrowdFamily, Derapage, ScenarioExtra, ScenarioMeans, ScenarioOptions } from '../core/api';
import {
  BLACK_BLOC_MAX, CROWD_MAX, CROWD_MIN, CROWD_STOPS, DEFAULT_CAUSES, DEFAULT_PLACES, DURATIONS, FAMILIES, FAMILY_IDS,
  MEANS_LIMITS, POSTE_LABELS, WEATHERS, rankLabel, roleInfo, weatherLabel,
} from './catalog';
import { cardinalName, hourLabel, int, plural } from '../core/format';

export type ScenarioMode = 'carriere' | 'libre' | 'monde_ouvert';

export interface ScenarioDraft {
  mode: ScenarioMode;
  missionId: string;
  role: PlayableRole;
  rank: PoliceRank | null;
  poste: PolicePoste | null;
  variante: string;
  place: string;
  /** Coordonnées de départ si elles sont connues (sinon le monde résout le nom). */
  x: number | null;
  z: number | null;
  timeOfDay: number;
  weather: WeatherKind;
  /** Vent : direction d'où il vient (degrés, 0 = nord) et vitesse (km/h). */
  windDir: number;
  windSpeed: number;
  crowdSize: number;
  cause: string;
  causeLabel: string;
  /**
   * Composition : poids 0..100 de chaque famille. Le black bloc est une part ABSOLUE en % (0..25) ;
   * les autres familles se partagent le reste au prorata de leur poids.
   */
  composition: Record<CrowdFamily, number>;
  tension: number;
  volatility: number;
  derapage: Derapage;
  duration: DurationPreset;
  moyens: ScenarioMeans;
  options: ScenarioOptions;
  seed: number;
}

const MODES: readonly ScenarioMode[] = ['carriere', 'libre', 'monde_ouvert'];
const DERAPAGE_IDS: readonly Derapage[] = ['personne', 'foule', 'forces', 'les_deux', 'hasard'];
const DURATION_IDS: readonly DurationPreset[] = ['courte', 'standard', 'longue', 'temps_reel'];
const WEATHER_IDS: readonly WeatherKind[] = WEATHERS.map((w) => w.id);
const ROLE_IDS: readonly PlayableRole[] = [
  'crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote',
  'street_medic', 'secouriste', 'journaliste', 'manifestant',
];

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function emptyComposition(): Record<CrowdFamily, number> {
  return { familles: 0, gilets_jaunes: 0, syndical: 0, etudiants: 0, climat: 0, soignants: 0, agriculteurs: 0, retraites: 0, black_bloc: 0 };
}

export function defaultMeans(): ScenarioMeans {
  return { sections: 4, fourgons: 12, centaure: 0, canon_eau: 1, bravm: 1, drone: 1, pompiers: 1, samu: 1, secours_sur_appel: true };
}

export function defaultDraft(violence: ViolenceLevel = 'realiste'): ScenarioDraft {
  const place = DEFAULT_PLACES[0]!;
  return {
    mode: 'libre',
    missionId: '',
    role: 'crs',
    rank: 'gardien',
    poste: 'bouclier',
    variante: '',
    place: place.name,
    x: place.x,
    z: place.z,
    timeOfDay: 14.5,
    weather: 'nuageux',
    windDir: 270,
    windSpeed: 10,
    crowdSize: 600,
    cause: 'retraites',
    causeLabel: 'Retraites',
    composition: { familles: 10, gilets_jaunes: 10, syndical: 40, etudiants: 15, climat: 5, soignants: 5, agriculteurs: 0, retraites: 15, black_bloc: 3 },
    tension: 0.25,
    volatility: 0.35,
    derapage: 'hasard',
    duration: 'standard',
    moyens: defaultMeans(),
    options: { sanctions: true, violence, circulation: 'ouverte', metro: 'ouvert' },
    seed: 1,
  };
}

/** Borne toutes les valeurs et rétablit la cohérence entre rôle, grade, poste et variante. */
export function sanitizeDraft(input: Partial<ScenarioDraft> | null | undefined, base: ScenarioDraft = defaultDraft()): ScenarioDraft {
  const d = { ...base, ...(input ?? {}) } as ScenarioDraft;
  const out: ScenarioDraft = { ...base };

  out.mode = MODES.indexOf(d.mode) >= 0 ? d.mode : 'libre';
  out.missionId = typeof d.missionId === 'string' ? d.missionId : '';
  out.role = ROLE_IDS.indexOf(d.role) >= 0 ? d.role : 'crs';
  const info = roleInfo(out.role);
  out.rank = info.ranks.length === 0 ? null : d.rank && info.ranks.indexOf(d.rank) >= 0 ? d.rank : info.defaultRank;
  out.poste = info.postes.length === 0 ? null : d.poste && info.postes.indexOf(d.poste) >= 0 ? d.poste : info.defaultPoste;
  out.variante = info.variantes.length === 0 ? '' : info.variantes.some((v) => v.id === d.variante) ? d.variante : info.variantes[0]!.id;

  out.place = typeof d.place === 'string' ? d.place : base.place;
  const hasXz = typeof d.x === 'number' && typeof d.z === 'number' && Number.isFinite(d.x) && Number.isFinite(d.z);
  out.x = hasXz ? d.x : null;
  out.z = hasXz ? d.z : null;

  const hour = num(d.timeOfDay, base.timeOfDay);
  out.timeOfDay = Math.round(clamp(hour >= 24 ? hour - 24 : hour, 0, 23.75) * 4) / 4;
  out.weather = WEATHER_IDS.indexOf(d.weather) >= 0 ? d.weather : 'clair';
  out.windDir = ((Math.round(num(d.windDir, base.windDir) / 45) * 45) % 360 + 360) % 360;
  out.windSpeed = Math.round(clamp(num(d.windSpeed, base.windSpeed), 0, 70));

  out.crowdSize = Math.round(clamp(num(d.crowdSize, base.crowdSize), CROWD_MIN, CROWD_MAX));
  out.cause = typeof d.cause === 'string' && d.cause ? d.cause : base.cause;
  out.causeLabel = typeof d.causeLabel === 'string' && d.causeLabel ? d.causeLabel : causeLabelOf(out.cause, DEFAULT_CAUSES);

  const comp = emptyComposition();
  const src: Record<string, unknown> = isRecord(d.composition) ? d.composition : {};
  let others = 0;
  for (const id of FAMILY_IDS) {
    const max = id === 'black_bloc' ? BLACK_BLOC_MAX : 100;
    comp[id] = Math.round(clamp(num(src[id], 0), 0, max));
    if (id !== 'black_bloc') others += comp[id];
  }
  if (others <= 0) comp.syndical = 50; // une foule ne peut pas être vide de toute famille
  out.composition = comp;

  out.tension = Math.round(clamp(num(d.tension, base.tension), 0, 1) * 100) / 100;
  out.volatility = Math.round(clamp(num(d.volatility, base.volatility), 0, 1) * 100) / 100;
  out.derapage = DERAPAGE_IDS.indexOf(d.derapage) >= 0 ? d.derapage : 'hasard';
  out.duration = DURATION_IDS.indexOf(d.duration) >= 0 ? d.duration : 'standard';

  const m: Record<string, unknown> = isRecord(d.moyens) ? d.moyens : {};
  const means = defaultMeans();
  for (const key of Object.keys(MEANS_LIMITS) as (keyof typeof MEANS_LIMITS)[]) {
    const [lo, hi] = MEANS_LIMITS[key];
    means[key] = Math.round(clamp(num(m[key], means[key]), lo, hi));
  }
  means.secours_sur_appel = typeof m.secours_sur_appel === 'boolean' ? m.secours_sur_appel : true;
  out.moyens = means;

  const o: Record<string, unknown> = isRecord(d.options) ? d.options : {};
  out.options = {
    sanctions: typeof o.sanctions === 'boolean' ? o.sanctions : true,
    violence: o.violence === 'sobre' ? 'sobre' : 'realiste',
    circulation: o.circulation === 'coupee' ? 'coupee' : 'ouverte',
    metro: o.metro === 'ferme' ? 'ferme' : 'ouvert',
  };

  const seed = num(d.seed, 1);
  out.seed = Math.abs(Math.trunc(seed)) % 1000000 || 1;
  return out;
}

/** Part de chaque famille (somme = 1), d'après les poids du brouillon. */
export function compositionShares(composition: Record<CrowdFamily, number>): Record<CrowdFamily, number> {
  const out = emptyComposition();
  const bloc = clamp(num(composition.black_bloc, 0), 0, BLACK_BLOC_MAX) / 100;
  let others = 0;
  for (const id of FAMILY_IDS) if (id !== 'black_bloc') others += Math.max(0, num(composition[id], 0));
  const rest = 1 - bloc;
  for (const id of FAMILY_IDS) {
    if (id === 'black_bloc') out[id] = round4(bloc);
    else out[id] = others > 0 ? round4((Math.max(0, num(composition[id], 0)) / others) * rest) : 0;
  }
  if (others <= 0) out.syndical = round4(rest);
  // l'arrondi ne doit pas faire dériver la somme : l'écart va à la famille la plus nombreuse
  let sum = 0;
  let top: CrowdFamily = 'syndical';
  for (const id of FAMILY_IDS) {
    sum += out[id];
    if (id !== 'black_bloc' && out[id] > out[top]) top = id;
  }
  out[top] = round4(out[top] + (1 - sum));
  return out;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** Famille la plus représentée (hors black bloc). */
export function dominantFamily(composition: Record<CrowdFamily, number>): CrowdFamily {
  let best: CrowdFamily = 'syndical';
  let bestV = -1;
  for (const id of FAMILY_IDS) {
    if (id === 'black_bloc') continue;
    if (composition[id] > bestV) {
      bestV = composition[id];
      best = id;
    }
  }
  return best;
}

export function causeLabelOf(id: string, causes: readonly CauseLike[]): string {
  for (const c of causes) if (c.id === id) return c.label;
  for (const c of DEFAULT_CAUSES) if (c.id === id) return c.label;
  return id;
}

/** Construit la configuration de session lancée par le bouton « Lancer ». */
export function buildSessionConfig(draft: ScenarioDraft): SessionConfig {
  const d = sanitizeDraft(draft, draft);
  const extra: ScenarioExtra = {
    scenario: 1,
    poste: d.poste,
    variante: d.variante,
    cause: d.cause,
    causeLabel: d.causeLabel,
    composition: compositionShares(d.composition),
    vent: { direction: d.windDir, vitesse: d.windSpeed },
    derapage: d.derapage,
    moyens: { ...d.moyens },
    options: { ...d.options },
  };
  const config: SessionConfig = {
    mode: d.mode as GameMode,
    missionId: d.missionId,
    role: d.role,
    rank: d.rank,
    place: d.place,
    timeOfDay: d.timeOfDay,
    weather: d.weather,
    crowdSize: d.crowdSize,
    tension: d.tension,
    volatility: d.volatility,
    duration: d.duration,
    seed: d.seed,
    extra: extra as unknown as Record<string, unknown>,
  };
  if (d.x !== null && d.z !== null) {
    config.x = d.x;
    config.z = d.z;
  }
  return config;
}

/** Relit une configuration (enregistrée, ou préréglage de mission) comme brouillon. Tolère toute valeur absente. */
export function draftFromConfig(config: Partial<SessionConfig> | null | undefined, base: ScenarioDraft = defaultDraft()): ScenarioDraft {
  if (!config || !isRecord(config)) return sanitizeDraft(base, base);
  const extra = isRecord(config.extra) ? config.extra : {};
  const partial: Partial<ScenarioDraft> = {};
  const mode = config.mode;
  if (mode === 'carriere' || mode === 'libre' || mode === 'monde_ouvert') partial.mode = mode;
  if (typeof config.missionId === 'string') partial.missionId = config.missionId;
  if (typeof config.role === 'string') partial.role = config.role;
  if (config.rank !== undefined) partial.rank = config.rank;
  if (typeof config.place === 'string' && config.place) {
    partial.place = config.place;
    // un lieu sans coordonnées ne doit pas hériter de celles du lieu précédent
    partial.x = typeof config.x === 'number' ? config.x : null;
    partial.z = typeof config.z === 'number' ? config.z : null;
  } else if (typeof config.x === 'number' && typeof config.z === 'number') {
    partial.x = config.x;
    partial.z = config.z;
  }
  if (typeof config.timeOfDay === 'number') partial.timeOfDay = config.timeOfDay;
  if (typeof config.weather === 'string') partial.weather = config.weather;
  if (typeof config.crowdSize === 'number') partial.crowdSize = config.crowdSize;
  if (typeof config.tension === 'number') partial.tension = config.tension;
  if (typeof config.volatility === 'number') partial.volatility = config.volatility;
  if (typeof config.duration === 'string') partial.duration = config.duration;
  if (typeof config.seed === 'number') partial.seed = config.seed;

  if (typeof extra.poste === 'string' || extra.poste === null) partial.poste = extra.poste as PolicePoste | null;
  if (typeof extra.variante === 'string') partial.variante = extra.variante;
  if (typeof extra.cause === 'string') {
    partial.cause = extra.cause;
    partial.causeLabel = typeof extra.causeLabel === 'string' ? extra.causeLabel : causeLabelOf(extra.cause, DEFAULT_CAUSES);
  }
  if (isRecord(extra.composition)) partial.composition = weightsFromShares(extra.composition);
  if (isRecord(extra.vent)) {
    partial.windDir = num(extra.vent.direction, base.windDir);
    partial.windSpeed = num(extra.vent.vitesse, base.windSpeed);
  }
  if (typeof extra.derapage === 'string') partial.derapage = extra.derapage as Derapage;
  if (isRecord(extra.moyens)) partial.moyens = extra.moyens as unknown as ScenarioMeans;
  if (isRecord(extra.options)) partial.options = extra.options as unknown as ScenarioOptions;
  return sanitizeDraft(partial, base);
}

/** Parts (somme = 1) → poids du brouillon : black bloc en % absolu, autres familles en % du reste. */
function weightsFromShares(shares: Record<string, unknown>): Record<CrowdFamily, number> {
  const out = emptyComposition();
  const bloc = clamp(num(shares.black_bloc, 0), 0, 1);
  let others = 0;
  for (const id of FAMILY_IDS) if (id !== 'black_bloc') others += Math.max(0, num(shares[id], 0));
  for (const id of FAMILY_IDS) {
    if (id === 'black_bloc') out[id] = Math.round(bloc * 100);
    else out[id] = others > 0 ? Math.round((Math.max(0, num(shares[id], 0)) / others) * 100) : 0;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Libellés
// ─────────────────────────────────────────────────────────────────────────────────────

export function tensionLabel(t: number): string {
  if (t < 0.15) return 'calme';
  if (t < 0.35) return 'modérée';
  if (t < 0.55) return 'tendue';
  if (t < 0.75) return 'très tendue';
  return 'explosive';
}

/** Propension à dégénérer, accordée au féminin (« propension … élevée »). */
export function volatilityLabel(v: number): string {
  if (v < 0.25) return 'faible';
  if (v < 0.5) return 'modérée';
  if (v < 0.75) return 'élevée';
  return 'très élevée';
}

/** Le même niveau accordé au masculin (« risque de débordement élevé »). */
export function volatilityLabelMasc(v: number): string {
  if (v < 0.25) return 'faible';
  if (v < 0.5) return 'modéré';
  if (v < 0.75) return 'élevé';
  return 'très élevé';
}

export type DayPhase = 'jour' | 'crepuscule' | 'nuit';

/** Moment de la journée pour l'aperçu de l'heure (lever vers 7 h, coucher vers 20 h : valeurs moyennes). */
export function dayPhase(hour: number): DayPhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 8 && h < 19) return 'jour';
  if ((h >= 6.5 && h < 8) || (h >= 19 && h < 21)) return 'crepuscule';
  return 'nuit';
}

export const DAY_PHASE_LABELS: Readonly<Record<DayPhase, string>> = { jour: 'Jour', crepuscule: 'Crépuscule', nuit: 'Nuit' };

/** Nombre d'agents à pied et rapport de forces pour 100 manifestants. */
export function forceRatio(draft: Pick<ScenarioDraft, 'moyens' | 'crowdSize'>): { agents: number; per100: number } {
  const agents = draft.moyens.sections * 16 + draft.moyens.bravm * 12;
  return { agents, per100: draft.crowdSize > 0 ? (agents / draft.crowdSize) * 100 : 0 };
}

/** Effectif réellement simulé d'après la densité de foule des paramètres. */
export function simulatedCrowd(crowdSize: number, crowdScale: number): number {
  return Math.max(1, Math.round(crowdSize * (Number.isFinite(crowdScale) && crowdScale > 0 ? crowdScale : 1)));
}

export function windLabel(dir: number, speed: number): string {
  if (speed < 1) return 'vent nul';
  const name = cardinalName(dir);
  const de = /^[aeiouyé]/.test(name) ? 'd’' : 'de ';
  return `vent ${de}${name}, ${speed} km/h`;
}

/** Résumé court des moyens : « 4 sections · 12 fourgons · canon à eau · drone ». */
export function meansSummary(m: ScenarioMeans): string {
  const parts: string[] = [];
  if (m.sections > 0) parts.push(plural(m.sections, 'section', 'sections'));
  if (m.fourgons > 0) parts.push(plural(m.fourgons, 'fourgon', 'fourgons'));
  if (m.centaure > 0) parts.push(m.centaure > 1 ? `${m.centaure} Centaure` : 'Centaure');
  if (m.canon_eau > 0) parts.push(m.canon_eau > 1 ? `${m.canon_eau} canons à eau` : 'canon à eau');
  if (m.bravm > 0) parts.push(m.bravm > 1 ? `${m.bravm} groupes BRAV-M` : 'BRAV-M');
  if (m.drone > 0) parts.push(m.drone > 1 ? `${m.drone} drones` : 'drone');
  const secours = m.pompiers + m.samu;
  if (secours > 0) parts.push(m.secours_sur_appel ? 'secours sur appel' : 'secours sur place');
  return parts.length ? parts.join(' · ') : 'aucun moyen engagé';
}

/** Qui vous êtes : « Gardien de la paix, porte-bouclier ». */
export function identityLabel(d: Pick<ScenarioDraft, 'role' | 'rank' | 'poste' | 'variante'>): string {
  const info = roleInfo(d.role);
  if (info.police) {
    const rank = rankLabel(d.rank, d.role);
    const poste = d.poste ? POSTE_LABELS[d.poste] : '';
    if (rank && poste && rank.toLowerCase() !== poste.toLowerCase()) return `${rank}, ${poste.toLowerCase()}`;
    return rank || poste || info.name;
  }
  const v = info.variantes.find((x) => x.id === d.variante);
  if (d.role === 'secouriste' && v) return v.label;
  if (v) return `${info.name}, ${v.label.toLowerCase()}`;
  return info.name;
}

/** Résumé du scénario en clair, pour le panneau « Votre scénario ». */
export function summarize(d: ScenarioDraft): string {
  const shares = compositionShares(d.composition);
  const top = dominantFamily(d.composition);
  const topInfo = FAMILIES.find((f) => f.id === top)!;
  const bloc = Math.round(shares.black_bloc * 100);
  const lieu = d.place || 'Paris';
  const where = `${lieu}, ${hourLabel(d.timeOfDay)}, temps ${weatherLabel(d.weather).toLowerCase()}.`;
  if (d.mode === 'monde_ouvert') {
    return `${where} Patrouille libre, sans objectif imposé. Vous êtes ${withArticle(identityLabel(d))}.`;
  }
  const crowd = `${int(d.crowdSize)} manifestants — ${d.causeLabel.toLowerCase()} —, ${topInfo.label.toLowerCase()} en tête`
    + (bloc > 0 ? `, ${bloc} % de black bloc.` : ', sans black bloc.');
  const mood = `Ambiance ${tensionLabel(d.tension)}, risque de débordement ${volatilityLabelMasc(d.volatility)}.`;
  return `${where} ${crowd} ${mood} Vous êtes ${withArticle(identityLabel(d))}.`;
}

function withArticle(label: string): string {
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  if (/^(crs|brav|samu)/i.test(label)) return label;
  return lower;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// « Surprends-moi »
// ─────────────────────────────────────────────────────────────────────────────────────

interface Archetype {
  id: string;
  weight: number;
  hours: readonly [number, number];
  crowd: readonly [number, number];
  tension: readonly [number, number];
  volatility: readonly [number, number];
  bloc: readonly [number, number];
  /** Familles possibles en tête de cortège. */
  leads: readonly CrowdFamily[];
}

/** Types de journée inspirés du tableau F.1 du dossier 00 (marche calme, journée tendue, samedi sans organisateur…). */
const ARCHETYPES: readonly Archetype[] = [
  { id: 'marche_calme', weight: 3, hours: [10, 16.5], crowd: [300, 2500], tension: [0.05, 0.22], volatility: [0.1, 0.35], bloc: [0, 2], leads: ['syndical', 'familles', 'climat', 'retraites', 'soignants'] },
  { id: 'journee_tendue', weight: 3, hours: [13, 17.5], crowd: [900, 5000], tension: [0.3, 0.55], volatility: [0.45, 0.75], bloc: [3, 10], leads: ['syndical', 'etudiants'] },
  { id: 'samedi_sans_organisateur', weight: 2, hours: [11, 18], crowd: [300, 2000], tension: [0.4, 0.65], volatility: [0.55, 0.9], bloc: [5, 15], leads: ['gilets_jaunes'] },
  { id: 'soir_spontane', weight: 1.5, hours: [19.5, 23.5], crowd: [100, 800], tension: [0.45, 0.75], volatility: [0.6, 0.95], bloc: [4, 12], leads: ['etudiants', 'gilets_jaunes'] },
  { id: 'rassemblement_statique', weight: 1.5, hours: [9, 16], crowd: [50, 600], tension: [0.05, 0.3], volatility: [0.1, 0.4], bloc: [0, 1], leads: ['soignants', 'agriculteurs', 'retraites', 'familles', 'climat'] },
];

export interface SurpriseSources {
  places?: readonly { name: string; x: number | null; z: number | null }[];
  causes?: readonly CauseLike[];
  violence?: ViolenceLevel;
}

function weighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  let total = 0;
  for (const it of items) total += weight(it);
  let r = rng.next() * total;
  for (const it of items) {
    r -= weight(it);
    if (r < 0) return it;
  }
  return items[items.length - 1]!;
}

function nearestCrowdStop(v: number): number {
  let best = CROWD_STOPS[0]!;
  for (const s of CROWD_STOPS) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}

/**
 * Tire un scénario au hasard mais cohérent : type de journée → heure, affluence, tension, composition
 * et cause accordées ; moyens proportionnés à la foule (3 à 10 agents pour 100 manifestants, jamais
 * moins de deux sections) ; le moyen du rôle tiré est toujours engagé (Centaure, canon à eau, drone…).
 */
export function surpriseDraft(rng: Rng, sources: SurpriseSources = {}): ScenarioDraft {
  const base = defaultDraft(sources.violence ?? 'realiste');
  const arch = weighted(rng, ARCHETYPES, (a) => a.weight);
  const d: ScenarioDraft = { ...base, mode: 'libre', missionId: '' };

  // rôle, grade, poste
  d.role = rng.pick(ROLE_IDS);
  const info = roleInfo(d.role);
  d.rank = info.ranks.length ? rng.pick(info.ranks) : null;
  d.poste = info.postes.length ? rng.pick(info.postes) : null;
  d.variante = info.variantes.length ? rng.pick(info.variantes).id : '';

  // lieu
  const places = sources.places && sources.places.length ? sources.places : DEFAULT_PLACES;
  const place = rng.pick(places);
  d.place = place.name;
  d.x = place.x;
  d.z = place.z;

  // heure (le drone ne vole que de 7 h à 20 h : arrêté préfectoral)
  let hour = rng.range(arch.hours[0], arch.hours[1]);
  if (d.role === 'telepilote') hour = clamp(hour, 8, 19.5);
  d.timeOfDay = Math.round(hour * 4) / 4;

  // météo et vent
  const night = dayPhase(d.timeOfDay) === 'nuit';
  d.weather = weighted(rng, WEATHERS, (w) => {
    switch (w.id) {
      case 'clair': return 3;
      case 'nuageux': return 3;
      case 'couvert': return 2;
      case 'pluie': return 1.5;
      case 'averse': return 0.7;
      case 'brouillard': return night || d.timeOfDay < 10 ? 0.9 : 0.2;
      default: return 0.4;
    }
  }).id;
  d.windDir = rng.int(0, 8) * 45;
  d.windSpeed = d.weather === 'orage' ? rng.int(30, 61) : d.weather === 'brouillard' ? rng.int(0, 9) : rng.int(0, 36);

  // foule
  d.crowdSize = nearestCrowdStop(Math.exp(rng.range(Math.log(arch.crowd[0]), Math.log(arch.crowd[1]))));
  d.tension = Math.round(rng.range(arch.tension[0], arch.tension[1]) * 100) / 100;
  d.volatility = Math.round(rng.range(arch.volatility[0], arch.volatility[1]) * 100) / 100;
  const lead = rng.pick(arch.leads);
  // une famille mène nettement le cortège, une à trois autres l'accompagnent
  const comp = emptyComposition();
  comp[lead] = rng.int(50, 81);
  const others = FAMILY_IDS.filter((id) => id !== 'black_bloc' && id !== lead);
  const companions = rng.int(1, 4);
  for (let k = 0; k < companions && others.length > 0; k++) {
    const id = others.splice(rng.int(0, others.length), 1)[0]!;
    comp[id] = rng.int(5, 21);
  }
  comp.black_bloc = rng.int(arch.bloc[0], arch.bloc[1] + 1);
  d.composition = comp;
  const causes = sources.causes && sources.causes.length ? sources.causes : DEFAULT_CAUSES;
  const leadCauses = FAMILIES.find((f) => f.id === lead)!.causes.filter((c) => causes.some((x) => x.id === c));
  d.cause = leadCauses.length ? rng.pick(leadCauses) : rng.pick(causes).id;
  d.causeLabel = causeLabelOf(d.cause, causes);
  d.derapage = arch.id === 'marche_calme' || arch.id === 'rassemblement_statique'
    ? weighted(rng, DERAPAGE_IDS, (x) => (x === 'personne' ? 3 : x === 'hasard' ? 2 : 0.5))
    : weighted(rng, DERAPAGE_IDS, (x) => (x === 'foule' ? 3 : x === 'hasard' ? 2 : x === 'personne' ? 0.3 : 1));
  d.duration = weighted(rng, DURATIONS, (x) => (x.id === 'standard' ? 6 : x.id === 'courte' ? 2 : x.id === 'longue' ? 1.5 : 0.5)).id;

  // moyens : 3 à 10 agents pour 100 manifestants selon la tension, jamais moins de deux sections
  const per100 = 3 + 7 * d.tension;
  const sections = clamp(Math.round((d.crowdSize * per100) / 100 / 16), 2, MEANS_LIMITS.sections[1]);
  const m: ScenarioMeans = {
    sections,
    fourgons: clamp(sections * 3, 0, MEANS_LIMITS.fourgons[1]),
    centaure: d.tension > 0.6 && rng.chance(0.25) ? 1 : 0,
    canon_eau: d.tension > 0.45 && rng.chance(0.6) ? 1 : 0,
    bravm: d.volatility > 0.7 ? rng.int(1, 3) : d.volatility > 0.4 && rng.chance(0.6) ? 1 : 0,
    drone: rng.chance(0.6) ? (d.crowdSize > 2000 && rng.chance(0.5) ? 2 : 1) : 0,
    pompiers: d.tension > 0.4 || rng.chance(0.5) ? 1 : 0,
    samu: d.tension > 0.5 || rng.chance(0.4) ? 1 : 0,
    secours_sur_appel: rng.chance(0.7),
  };
  // le moyen du rôle incarné est toujours présent
  if (d.role === 'gendarme_centaure') m.centaure = Math.max(1, m.centaure);
  if (d.role === 'operateur_canon_eau') m.canon_eau = Math.max(1, m.canon_eau);
  if (d.role === 'telepilote') m.drone = Math.max(1, m.drone);
  if (d.role === 'bravm') m.bravm = Math.max(1, m.bravm);
  if (d.role === 'secouriste') {
    if (d.variante === 'samu') m.samu = Math.max(1, m.samu);
    else m.pompiers = Math.max(1, m.pompiers);
  }
  if (night) m.drone = d.role === 'telepilote' ? m.drone : 0;
  d.moyens = m;

  d.options = {
    sanctions: true,
    violence: sources.violence ?? 'realiste',
    circulation: rng.chance(0.5) ? 'coupee' : 'ouverte',
    metro: rng.chance(0.25) ? 'ferme' : 'ouvert',
  };
  d.seed = rng.int(1, 1000000);
  return sanitizeDraft(d, base);
}

/** Nom proposé pour un scénario enregistré : « République — 600 manifestants — 14 h 30 ». */
export function suggestName(d: ScenarioDraft): string {
  const lieu = d.place.replace(/^(place|esplanade|parvis) (de la |de l’|de l'|des |du |de )?/i, '');
  const short = lieu.charAt(0).toUpperCase() + lieu.slice(1);
  if (d.mode === 'monde_ouvert') return `${short} — patrouille — ${hourLabel(d.timeOfDay)}`;
  return `${short} — ${int(d.crowdSize)} manifestants — ${hourLabel(d.timeOfDay)}`;
}
