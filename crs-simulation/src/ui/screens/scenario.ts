/* =====================================================================================
 * Page d'accueil — modèle du scénario (logique pure, testée sous Node).
 *
 *   defaultDraft()            brouillon de départ
 *   sanitizeDraft(d)          borne les valeurs et rétablit la cohérence rôle / grade / poste
 *   buildSessionConfig(d)     brouillon → SessionConfig (tout le reste dans config.extra, voir ScenarioExtra)
 *   draftFromConfig(c)        SessionConfig → brouillon (scénarios enregistrés, « Continuer », missions)
 *   surpriseDraft(rng, …)     « Surprends-moi » : tirage aléatoire cohérent
 *   summarize(d)              résumé du scénario en une ou deux phrases
 *   suggestManifName(d)       nom de manifestation proposé d'après la cause et les organisateurs
 *   columnsPreview(d)         colonnes engagées en journée de service, celle du joueur marquée
 *
 * Mode libre : nom et organisateurs de la manifestation, curseur « Imprévu » (0 à 3), lieu tiré au hasard, point de
 * départ des colonnes. Chaque réglage laissé à sa valeur par défaut n'écrit AUCUNE clé : un brouillon par défaut
 * produit exactement la configuration des versions précédentes.
 * Mode « Patrouille » (identifiant interne 'monde_ouvert') : la configuration lancée est toujours une vacation
 * (src/gameplay/patrols/model.ts) ; les anciennes configurations « Monde ouvert » y sont converties.
 * ===================================================================================== */

import { createRng } from '@/core/rng';
import {
  RYTHME_AMBIANCE, crewInfo, migrateLegacyPatrol, nearestDepart, readImprevus, readVacation, sanitizePatrolSetup,
  vacationSessionConfig,
} from '@/gameplay/patrols/model';
import type { PatrolCrew, PatrolRythme, PatrolSetup } from '@/gameplay/patrols/model';
import { BASE_MAX_DIST, BASE_MIN_DIST, SERVICE_BASES, basePreload, bravmBasePreload, isJournee } from '@/gameplay/session/journee-data';
import type { ServiceBase } from '@/gameplay/session/journee-data';
import { sectionsFor } from '@/gameplay/session/manifestations';
import type {
  DurationPreset, GameMode, PlayableRole, PolicePoste, PoliceRank, Rng, SessionConfig, ViolenceLevel, WeatherKind,
} from '@/core/contracts';
import type {
  CauseLike, CrowdFamily, Derapage, Organisateurs, ScenarioExtra, ScenarioManif, ScenarioMeans, ScenarioOptions,
} from '../core/api';
import {
  BLACK_BLOC_MAX, COLUMN_DEPARTS, CROWD_MAX, CROWD_MIN, CROWD_STOPS, DEFAULT_CAUSES, DEFAULT_PLACES, DURATIONS, FAMILIES,
  FAMILY_IDS, IMPREVU_LEVELS, MEANS_LIMITS, ORGANISATEURS, ORGANISATEUR_IDS, ROLE_IDS, WEATHERS, posteLabel, rankLabel,
  roleInfo, weatherLabel,
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
  /** Manifestations déclarées supplémentaires, simultanées (0 à 3 ; la principale est celle du lieu choisi). */
  manifestations: ScenarioManif[];
  /** Nom de la manifestation ('' : aucun ; l'écran propose suggestManifName). */
  manifNom: string;
  organisateurs: Organisateurs;
  /** Curseur « Imprévu » : 0 « Comme annoncé », 1 « Quelques débordements » (défaut), 2 « Agité », 3 « Imprévisible ». */
  imprevu: ImprevuLevel;
  /** Lieu tiré au hasard au lancement (dans DEFAULT_PLACES, d'après la graine). */
  lieuHasard: boolean;
  /** Point de départ des colonnes (identifiant de COLUMN_DEPARTS). */
  depart: string;
}

export type ImprevuLevel = 0 | 1 | 2 | 3;

/** Longueur maximale du nom de la manifestation. */
export const MANIF_NOM_MAX = 60;

/** Nombre maximal de manifestations simultanées (la principale comprise). */
export const MANIFS_MAX = 4;
/** Écart minimal entre deux lieux de rassemblement (m). */
export const MANIF_APART = 1200;

const MODES: readonly ScenarioMode[] = ['carriere', 'libre', 'monde_ouvert'];
const DERAPAGE_IDS: readonly Derapage[] = ['personne', 'foule', 'forces', 'les_deux', 'hasard'];
const DURATION_IDS: readonly DurationPreset[] = ['courte', 'standard', 'longue', 'temps_reel'];
const WEATHER_IDS: readonly WeatherKind[] = WEATHERS.map((w) => w.id);
/**
 * Rôles tirés par « Surprends-moi » (ordre figé : même graine, même tirage qu'avant l'ajout de l'équipage de patrouille,
 * qui se choisit lui-même : une voiture seule n'a pas sa place dans une manifestation tirée au hasard).
 */
const SURPRISE_ROLES: readonly PlayableRole[] = [
  'crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote',
  'street_medic', 'secouriste', 'journaliste', 'manifestant',
];
const COLUMN_DEPART_IDS: readonly string[] = COLUMN_DEPARTS.map((c) => c.id);

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
    options: { sanctions: true, violence, circulation: 'ouverte', metro: 'ouvert', journee: true },
    seed: 1,
    manifestations: [],
    manifNom: '',
    organisateurs: 'intersyndicale',
    imprevu: 1,
    lieuHasard: false,
    depart: 'auto',
  };
}

/** Nom assaini : une ligne, espaces resserrés, sans caractère de contrôle, MANIF_NOM_MAX caractères au plus. */
export function cleanManifName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MANIF_NOM_MAX).trim();
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
    journee: typeof o.journee === 'boolean' ? o.journee : true,
  };

  const seed = num(d.seed, 1);
  out.seed = Math.abs(Math.trunc(seed)) % 1000000 || 1;
  out.manifestations = sanitizeManifs(d.manifestations);

  out.manifNom = cleanManifName(d.manifNom);
  out.organisateurs = ORGANISATEUR_IDS.indexOf(d.organisateurs) >= 0 ? d.organisateurs : 'intersyndicale';
  const level = Math.round(num(d.imprevu, 1));
  out.imprevu = (level < 0 ? 0 : level > 3 ? 3 : level) as ImprevuLevel;
  out.lieuHasard = d.lieuHasard === true;
  // départ des colonnes et case « journée de service » vont ensemble : « Déjà sur place » = pas de journée de service
  const depart = typeof d.depart === 'string' && COLUMN_DEPART_IDS.indexOf(d.depart) >= 0 ? d.depart : 'auto';
  if (depart === 'sur_place') {
    out.depart = 'sur_place';
    out.options = { ...out.options, journee: false };
  } else {
    out.depart = out.options.journee ? depart : 'sur_place';
  }
  return out;
}

function sanitizeManifs(list: unknown): ScenarioManif[] {
  const out: ScenarioManif[] = [];
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (!isRecord(item) || out.length >= MANIFS_MAX - 1) continue;
    const place = typeof item.place === 'string' ? item.place : '';
    const known = DEFAULT_PLACES.find((p) => p.name === place);
    const x = num(item.x, known ? known.x : NaN);
    const z = num(item.z, known ? known.z : NaN);
    if (place === '' || !Number.isFinite(x) || !Number.isFinite(z)) continue;
    const cause = typeof item.cause === 'string' && item.cause ? item.cause : 'climat';
    const m: ScenarioManif = {
      place, x, z, crowdSize: Math.round(clamp(num(item.crowdSize, 400), CROWD_MIN, CROWD_MAX)), cause,
      causeLabel: typeof item.causeLabel === 'string' && item.causeLabel ? item.causeLabel : causeLabelOf(cause, DEFAULT_CAUSES),
    };
    if (typeof item.tension === 'number' && Number.isFinite(item.tension)) m.tension = Math.round(clamp(item.tension, 0, 1) * 100) / 100;
    if (typeof item.volatility === 'number' && Number.isFinite(item.volatility)) m.volatility = Math.round(clamp(item.volatility, 0, 1) * 100) / 100;
    out.push(m);
  }
  return out;
}

/** Lieux possibles pour une manifestation supplémentaire : à plus de MANIF_APART m de toutes les autres. */
export function manifPlaces(d: Pick<ScenarioDraft, 'x' | 'z' | 'place' | 'manifestations'>, except = -1): typeof DEFAULT_PLACES[number][] {
  const taken: { x: number; z: number }[] = [];
  if (d.x !== null && d.z !== null) taken.push({ x: d.x, z: d.z });
  else {
    const main = DEFAULT_PLACES.find((p) => p.name === d.place);
    if (main) taken.push(main);
  }
  d.manifestations.forEach((m, i) => { if (i !== except) taken.push(m); });
  return DEFAULT_PLACES.filter((p) => taken.every((t) => Math.hypot(t.x - p.x, t.z - p.z) >= MANIF_APART));
}

/**
 * « Manifestations simultanées » : `total` manifestations en tout (1 à 4). Les manifestations déjà réglées sont
 * gardées ; les nouvelles prennent des lieux à plus de 1,2 km des autres, une autre cause, un effectif plus modeste.
 */
export function withManifCount(d: ScenarioDraft, total: number, causes: readonly CauseLike[] = DEFAULT_CAUSES): ScenarioManif[] {
  const want = clamp(Math.round(total), 1, MANIFS_MAX) - 1;
  const list = d.manifestations.slice(0, want);
  const pool = causes.length > 0 ? causes : DEFAULT_CAUSES;
  for (let i = list.length; i < want; i++) {
    const free = manifPlaces({ ...d, manifestations: list });
    if (free.length === 0) break;
    // choix déterministe d'après la graine : le lieu le plus éloigné de la principale, puis en tournant
    const place = free[(d.seed + i * 3) % free.length]!;
    const used = new Set<string>([d.cause, ...list.map((m) => m.cause)]);
    let cause = pool[(d.seed + i) % pool.length]!;
    for (let k = 0; k < pool.length && used.has(cause.id); k++) cause = pool[(d.seed + i + k + 1) % pool.length]!;
    const size = nearestCrowdStop(clamp(d.crowdSize * (0.7 - 0.15 * i), CROWD_MIN, CROWD_MAX));
    list.push({ place: place.name, x: place.x, z: place.z, crowdSize: size, cause: cause.id, causeLabel: cause.label });
  }
  return list;
}

/** Rétablit l'écart entre les lieux (après un changement du lieu principal) : les manifestations trop proches sont replacées. */
export function respaceManifs(d: ScenarioDraft, causes: readonly CauseLike[] = DEFAULT_CAUSES): ScenarioManif[] {
  const total = d.manifestations.length + 1;
  const kept: ScenarioManif[] = [];
  for (const m of d.manifestations) {
    if (manifPlaces({ ...d, manifestations: kept }).some((p) => p.name === m.place) || !DEFAULT_PLACES.some((p) => p.name === m.place)) {
      const main = d.x !== null && d.z !== null ? { x: d.x, z: d.z } : null;
      const ok = (!main || Math.hypot(main.x - m.x, main.z - m.z) >= MANIF_APART) && kept.every((k) => Math.hypot(k.x - m.x, k.z - m.z) >= MANIF_APART);
      if (ok) kept.push(m);
    }
  }
  return withManifCount({ ...d, manifestations: kept }, total, causes);
}

/** Effectif total de toutes les manifestations (la principale comprise). */
export function totalCrowd(d: { crowdSize: number; manifestations?: readonly ScenarioManif[] }): number {
  let n = Math.max(0, d.crowdSize);
  for (const m of d.manifestations ?? []) n += Math.max(0, m.crowdSize);
  return n;
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

/** Nombre de foyers « automatique » du module de foule (même règle que FoyersSystem.count, src/sim/crowd/foyers.ts). */
export function autoFoyers(crowdSize: number, volatility: number): number {
  if (crowdSize < 250 || volatility < 0.3) return 0;
  const k = ((volatility - 0.25) / 0.75) * 4 * Math.min(1, crowdSize / 1800);
  return clamp(Math.round(k + 0.2), 0, 4);
}

/** Lieu effectif d'un brouillon « lieu tiré au hasard » : un lieu de DEFAULT_PLACES d'après la graine, loin des autres manifestations. */
export function randomPlace(d: Pick<ScenarioDraft, 'seed' | 'manifestations'>): typeof DEFAULT_PLACES[number] {
  const free = DEFAULT_PLACES.filter((p) => d.manifestations.every((m) => Math.hypot(m.x - p.x, m.z - p.z) >= MANIF_APART));
  return createRng(d.seed).fork('accueil:lieu').pick(free.length > 0 ? free : DEFAULT_PLACES);
}

/** Base imposée par le point de départ des colonnes (null : automatique ou déjà sur place). */
function departBase(id: string): ServiceBase | null {
  return COLUMN_DEPARTS.find((c) => c.id === id)?.base ?? null;
}

/** Construit la configuration de session lancée par le bouton « Lancer ». */
export function buildSessionConfig(draft: ScenarioDraft): SessionConfig {
  const d = sanitizeDraft(draft, draft);
  // Patrouille : toujours une vacation d'équipage (aucune manifestation fantôme)
  if (d.mode === 'monde_ouvert') return patrolConfigOf(d);
  const free = d.missionId === '';
  // lieu tiré au hasard (scénario libre seulement : une mission a son lieu)
  if (free && d.lieuHasard) {
    const p = randomPlace(d);
    d.place = p.name;
    d.x = p.x;
    d.z = p.z;
  }
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
    // journée de service : départ d'une caserne ou d'un commissariat, trajet en colonne jusqu'au lieu — aussi en
    // mission (la mission commence à l'arrivée sur place, voir missions/system.ts). Jamais pour l'équipage de
    // patrouille : une voiture seule part de son secteur (journee-data.ts, isJournee).
    journee: d.options.journee && d.role !== 'patrouille',
  };
  // manifestations simultanées : jamais en mission (scénario propre)
  if (d.manifestations.length > 0 && free) {
    extra.manifestations = d.manifestations.map((m) => ({ ...m, tension: m.tension ?? d.tension, volatility: m.volatility ?? d.volatility }));
  }
  if (free) applyLibre(d, extra);
  if (extra.journee) {
    // la caserne est loin du rassemblement : ses données sont chargées aussi avant la mise en place ; un point de
    // départ choisi limite le choix de la session à cette seule base
    const base = departBase(d.depart);
    const main = base ? { candidates: [{ ...base }], minDist: 0, maxDist: 1e6, as: 'base' } : basePreload();
    extra.preload = d.moyens.bravm > 0 || d.role === 'bravm' ? [main, bravmBasePreload()] : [main];
    if (base) extra.depart = d.depart;
  }
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

/** Réglages du scénario libre : nom, organisateurs, imprévu, lieu tiré au hasard (aucune clé pour une valeur par défaut). */
function applyLibre(d: ScenarioDraft, extra: ScenarioExtra): void {
  if (d.manifNom !== '') extra['manif.nom'] = d.manifNom;
  if (d.organisateurs !== 'intersyndicale' || d.manifNom !== '') extra['manif.organisateurs'] = d.organisateurs;
  if (d.organisateurs === 'aucun') {
    // appel lancé sur les réseaux : ni camion sono ni service d'ordre (type de journée du module de foule)
    extra['crowd.sono'] = false;
    extra['crowd.scenario'] = 'samedi_sans_organisateur';
  }
  if (d.lieuHasard) extra['lieu.hasard'] = true;
  switch (d.imprevu) {
    case 0:
      extra.foyers = 0;
      break;
    case 2:
      extra.foyers = Math.max(2, autoFoyers(d.crowdSize, d.volatility));
      extra['foyers.delai'] = 240;
      // (partie courte, 10 min : la manifestation sauvage tombe à 6 min, avant la fin — sinon de 10 à 15 min)
      extra.imprevus = d.duration === 'courte' ? { sauvages: 1, premier: 360 } : { sauvages: 1 };
      break;
    case 3:
      extra.foyers = 5;
      extra['foyers.delai'] = 150;
      extra['foyers.ecart'] = 120;
      // (partie courte : les deux manifestations sauvages tombent à 4 et 7 min, avant la fin)
      extra.imprevus = d.duration === 'courte' ? { sauvages: 2, premier: 240, ecart: 180 } : { sauvages: 2, premier: 300 };
      break;
    default:
      break; // cran 1 : comportement du module de foule (foyers « automatique »)
  }
}

/** Rythme de patrouille le plus proche d'une tension de départ. */
function rythmeOf(tension: number): PatrolRythme {
  let best: PatrolRythme = 'normal';
  let bestD = Infinity;
  for (const [id, amb] of Object.entries(RYTHME_AMBIANCE) as [PatrolRythme, { tension: number }][]) {
    const dd = Math.abs(amb.tension - tension);
    if (dd < bestD - 1e-9) { bestD = dd; best = id; }
  }
  return best;
}

/**
 * Brouillon en mode Patrouille → vacation. Un brouillon d'équipage de patrouille garde équipage, place, grade, départ
 * (celui du lieu, sinon le plus proche) et rythme (d'après la tension) ; tout autre rôle devient, comme une ancienne
 * configuration « Monde ouvert », une vacation BAC au secteur le plus proche (migrateLegacyPatrol).
 */
function patrolConfigOf(d: ScenarioDraft): SessionConfig {
  if (d.role !== 'patrouille') {
    const legacy: SessionConfig = {
      mode: 'monde_ouvert', missionId: '', role: d.role, rank: d.rank, place: d.place, timeOfDay: d.timeOfDay, weather: d.weather,
      crowdSize: d.crowdSize, tension: d.tension, volatility: d.volatility, duration: d.duration, seed: d.seed,
      extra: { scenario: 1, vent: { direction: d.windDir, vitesse: d.windSpeed }, options: { ...d.options } },
    };
    if (d.x !== null && d.z !== null) {
      legacy.x = d.x;
      legacy.z = d.z;
    }
    return migrateLegacyPatrol(legacy);
  }
  const crew: PatrolCrew = d.variante === 'police_secours' ? 'police_secours' : 'bac';
  const departs = crewInfo(crew).departs();
  const exact = departs.find((p) => (d.x !== null && d.z !== null ? Math.hypot(p.x - d.x, p.z - d.z) < 1 : p.name === d.place));
  const depart = exact ?? (d.x !== null && d.z !== null ? nearestDepart(crew, d.x, d.z) : departs[0]!);
  const setup: Partial<PatrolSetup> = {
    crew, seat: d.poste === 'interpellation' ? 'chef_bord' : 'conducteur', rank: d.rank ?? 'gardien', departId: depart.id,
    rythme: rythmeOf(d.tension), timeOfDay: d.timeOfDay, weather: d.weather, windDir: d.windDir, windSpeed: d.windSpeed,
    duration: d.duration, seed: d.seed, violence: d.options.violence,
  };
  return vacationSessionConfig(sanitizePatrolSetup(setup));
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
  partial.manifestations = Array.isArray(extra.manifestations) ? (extra.manifestations as ScenarioManif[]) : [];

  // Mode libre : nom, organisateurs, imprévu, lieu tiré au hasard, départ des colonnes (absents : valeurs par défaut)
  partial.manifNom = typeof extra['manif.nom'] === 'string' ? extra['manif.nom'] : '';
  partial.organisateurs = typeof extra['manif.organisateurs'] === 'string' ? extra['manif.organisateurs'] as Organisateurs : 'intersyndicale';
  partial.lieuHasard = extra['lieu.hasard'] === true;
  const imprevus = readImprevus({ extra });
  partial.imprevu = imprevus ? (imprevus.sauvages >= 2 ? 3 : 2) : extra.foyers === 0 ? 0 : 1;
  partial.depart = typeof extra.depart === 'string' ? extra.depart : 'auto';

  // vacation : l'équipage, sa place et son grade, son secteur ou commissariat de départ
  const vacation = readVacation({ role: partial.role ?? base.role, extra });
  if (vacation) {
    partial.role = 'patrouille';
    partial.rank = vacation.rank;
    partial.variante = vacation.crew;
    partial.poste = vacation.seat === 'chef_bord' ? 'interpellation' : 'conducteur';
    partial.place = vacation.depart.name;
    partial.x = vacation.depart.x;
    partial.z = vacation.depart.z;
    partial.tension = RYTHME_AMBIANCE[vacation.rythme].tension;
    partial.volatility = RYTHME_AMBIANCE[vacation.rythme].volatility;
  }
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
export function forceRatio(draft: Pick<ScenarioDraft, 'moyens' | 'crowdSize'> & { manifestations?: readonly ScenarioManif[] }): { agents: number; per100: number } {
  let agents = draft.moyens.sections * 16 + draft.moyens.bravm * 12;
  // une compagnie est engagée sur chaque manifestation supplémentaire
  for (const m of draft.manifestations ?? []) agents += sectionsFor(m.crowdSize) * 16;
  const crowd = totalCrowd({ crowdSize: draft.crowdSize, manifestations: draft.manifestations ?? [] });
  return { agents, per100: crowd > 0 ? (agents / crowd) * 100 : 0 };
}

/**
 * Moyens recommandés pour une manifestation : d'après l'affluence, la propension à dégénérer et la part de black bloc
 * (ordre de grandeur parisien : 3 à 10 agents pour 100 manifestants, davantage d'engins quand la casse est probable).
 * Bornés par MEANS_LIMITS ; la case « secours sur appel » est conservée.
 */
export function recommendedMeans(
  d: Pick<ScenarioDraft, 'crowdSize' | 'volatility' | 'composition' | 'moyens'> & { manifestations?: readonly ScenarioManif[] },
): ScenarioMeans {
  const main = Math.max(0, d.crowdSize);
  // les sections de la compagnie du joueur couvrent SA manifestation (une compagnie est engagée sur chacune des
  // autres) ; les moyens mobiles et d'appui (BRAV-M, drone, canons, secours) servent dans tout Paris : effectif total
  const crowd = totalCrowd({ crowdSize: main, manifestations: d.manifestations ?? [] });
  const extra = (d.manifestations ?? []).length;
  const vol = clamp(d.volatility, 0, 1);
  const bloc = compositionShares(d.composition).black_bloc;
  const lim = (key: keyof typeof MEANS_LIMITS, v: number): number => clamp(Math.round(v), MEANS_LIMITS[key][0], MEANS_LIMITS[key][1]);
  const sections = lim('sections', Math.max(2, Math.ceil(main / 220 + vol * 3 + bloc * 20)));
  return {
    sections,
    fourgons: lim('fourgons', sections * 3),
    canon_eau: lim('canon_eau', crowd >= 800 ? Math.max(1, crowd / 1500 + vol * 2 + bloc * 10) : vol > 0.6 ? 1 : 0),
    centaure: lim('centaure', bloc >= 0.05 && crowd >= 1500 ? Math.max(1, crowd / 2500 + bloc * 15) : 0),
    bravm: lim('bravm', crowd >= 300 ? Math.max(1, crowd / 1200 + vol * 2 + bloc * 12) : 0),
    drone: lim('drone', crowd >= 500 ? crowd / 2000 + 1 + (extra > 0 ? 1 : 0) : 0),
    pompiers: lim('pompiers', 1 + crowd / 2000 + vol * 2),
    samu: lim('samu', 1 + crowd / 2500 + vol),
    secours_sur_appel: d.moyens.secours_sur_appel,
  };
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

/** Qui vous êtes : « Gardien de la paix, porte-bouclier » ; « Gardien de la paix, chef de bord (BAC) ». */
export function identityLabel(d: Pick<ScenarioDraft, 'role' | 'rank' | 'poste' | 'variante'>): string {
  const info = roleInfo(d.role);
  if (info.police) {
    const rank = rankLabel(d.rank, d.role);
    const poste = d.poste ? posteLabel(d.role, d.poste) : '';
    const label = rank && poste && rank.toLowerCase() !== poste.toLowerCase() ? `${rank}, ${poste.toLowerCase()}` : rank || poste || info.name;
    if (d.role === 'patrouille') {
      const crew = info.variantes.find((v) => v.id === d.variante) ?? info.variantes[0];
      return crew ? `${label} (${crew.label})` : label;
    }
    return label;
  }
  const v = info.variantes.find((x) => x.id === d.variante);
  if (d.role === 'secouriste' && v) return v.label;
  if (v) return `${info.name}, ${v.label.toLowerCase()}`;
  return info.name;
}

/** Libellé du cran du curseur « Imprévu ». */
export function imprevuLabel(level: number): string {
  return (IMPREVU_LEVELS.find((x) => x.level === level) ?? IMPREVU_LEVELS[1]!).label;
}

/** Libellé des organisateurs. */
export function organisateursLabel(id: Organisateurs): string {
  return (ORGANISATEURS.find((o) => o.id === id) ?? ORGANISATEURS[0]!).label;
}

/** Résumé du scénario en clair, pour le panneau « Votre scénario ». */
export function summarize(d: ScenarioDraft): string {
  const shares = compositionShares(d.composition);
  const top = dominantFamily(d.composition);
  const topInfo = FAMILIES.find((f) => f.id === top)!;
  const bloc = Math.round(shares.black_bloc * 100);
  const free = d.missionId === '';
  const lieu = free && d.lieuHasard && d.mode !== 'monde_ouvert' ? 'Lieu tiré au hasard' : d.place || 'Paris';
  const where = `${lieu}, ${hourLabel(d.timeOfDay)}, temps ${weatherLabel(d.weather).toLowerCase()}.`;
  if (d.mode === 'monde_ouvert') {
    // ce qui sera lancé : la vacation (un autre rôle devient un équipage BAC au secteur le plus proche)
    const v = draftFromConfig(patrolConfigOf(d), d);
    const crew = v.variante === 'police_secours' ? 'Police secours' : 'BAC';
    const start = `Départ ${v.place}, ${hourLabel(v.timeOfDay)}, temps ${weatherLabel(v.weather).toLowerCase()}.`;
    return `${start} Patrouille en ${crew} : la radio vous envoie sur ce qui se déclare dans Paris. Vous êtes ${withArticle(identityLabel(v))}.`;
  }
  const named = free && d.manifNom !== '' ? `« ${d.manifNom} » : ` : '';
  const who = free && (d.manifNom !== '' || d.organisateurs !== 'intersyndicale')
    ? (d.organisateurs === 'aucun' ? ', sans organisateur' : `, à l’appel : ${organisateursLabel(d.organisateurs).toLowerCase()}`)
    : '';
  const crowd = `${named}${int(d.crowdSize)} manifestants — ${d.causeLabel.toLowerCase()} —${who}, ${topInfo.label.toLowerCase()} en tête`
    + (bloc > 0 ? `, ${bloc} % de black bloc.` : ', sans black bloc.');
  const mood = `Ambiance ${tensionLabel(d.tension)}, risque de débordement ${volatilityLabelMasc(d.volatility)}.`
    + (free ? ` Imprévu : ${imprevuLabel(d.imprevu).toLowerCase()}.` : '');
  const others = d.manifestations.length > 0 && free
    ? ` En même temps : ${d.manifestations.map((m) => `${int(m.crowdSize)} manifestants (${m.causeLabel.toLowerCase()}) ${m.place}`).join(', ')}.`
    : '';
  return `${where} ${crowd}${others} ${mood} Vous êtes ${withArticle(identityLabel(d))}.`;
}

function withArticle(label: string): string {
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  if (/^(crs|brav|samu)/i.test(label)) return label;
  return lower;
}

/** Complément de la cause pour le nom proposé (« de l’hôpital », « des retraites », « pour le climat »). */
function ofCause(label: string): string {
  const l = label.charAt(0).toLowerCase() + label.slice(1);
  if (/^[aeiouyhéèêâîôû]/i.test(l)) return 'pour l’' + l;
  if (/s$/.test(l.split(' ')[0]!)) return 'pour les ' + l;
  return 'pour le ' + l;
}

/** Nom de manifestation proposé d'après la cause et les organisateurs (MANIF_NOM_MAX caractères au plus). */
export function suggestManifName(d: Pick<ScenarioDraft, 'causeLabel' | 'organisateurs'>): string {
  const cause = d.causeLabel || 'Retraites';
  const lower = cause.charAt(0).toLowerCase() + cause.slice(1);
  let name: string;
  switch (d.organisateurs) {
    case 'collectif': name = `Marche citoyenne ${ofCause(cause)}`; break;
    case 'coordination_etudiante': name = `Mobilisation étudiante — ${lower}`; break;
    case 'aucun': name = `Appel à manifester — ${lower}`; break;
    default: name = `Journée de mobilisation — ${lower}`; break;
  }
  return cleanManifName(name);
}

/** Colonne engagée (aperçu de la rubrique « Moyens engagés »). */
export interface ColumnPreview {
  id: string;
  /** « Compagnie — 4 sections, 12 fourgons ». */
  label: string;
  /** D'où elle part : « depuis caserne de la Cité », « déjà sur place », « sur appel radio ». */
  from: string;
  /** Colonne du joueur. */
  mine: boolean;
}

/** Base la mieux placée parmi des candidats (même règle que la session : écart à l'anneau min–max, voir core/session.ts). */
function pickBase(candidates: readonly ServiceBase[], minDist: number, maxDist: number, x: number, z: number): ServiceBase | null {
  let best: ServiceBase | null = null;
  let bestGap = Infinity;
  for (const c of candidates) {
    const dd = Math.hypot(c.x - x, c.z - z);
    const gap = dd < minDist ? minDist - dd : dd > maxDist ? dd - maxDist : 0;
    if (gap < bestGap) {
      bestGap = gap;
      best = c;
    }
    if (gap === 0) break;
  }
  return best;
}

/**
 * Colonnes engagées, déduites des moyens et du point de départ : la compagnie (sections et fourgons), la BRAV-M (depuis
 * son propre commissariat), les engins (Centaure, canon à eau), l'équipe du drone, les secours. La colonne du joueur est
 * marquée (une seule ; aucune pour un rôle civil). Hors journée de service, les forces sont déjà sur place.
 */
export function columnsPreview(draft: ScenarioDraft): ColumnPreview[] {
  const d = sanitizeDraft(draft, draft);
  const m = d.moyens;
  const cfg = buildSessionConfig(d);
  const journee = isJournee(cfg);
  const x = typeof cfg.x === 'number' ? cfg.x : null;
  const z = typeof cfg.z === 'number' ? cfg.z : null;
  const chosen = departBase(d.depart);
  const main = !journee ? null : chosen ?? (x !== null && z !== null ? pickBase(SERVICE_BASES, BASE_MIN_DIST, BASE_MAX_DIST, x, z) : null);
  const mainFrom = !journee ? 'déjà sur place' : main ? 'depuis ' + main.name : 'depuis la base la mieux placée';
  let bravmFrom = mainFrom;
  if (journee && main && x !== null && z !== null) {
    const b = bravmBasePreload();
    const pick = pickBase(b.candidates, b.minDist, b.maxDist, x, z);
    if (pick && Math.hypot(pick.x - main.x, pick.z - main.z) >= 300) bravmFrom = 'depuis ' + pick.name;
  }
  const role = d.role;
  const out: ColumnPreview[] = [];
  const add = (id: string, label: string, from: string, mine: boolean): void => {
    out.push({ id, label, from, mine });
  };
  if (role === 'patrouille') {
    const crew = roleInfo(role).variantes.find((v) => v.id === d.variante);
    add('equipage', `Équipage ${crew ? crew.label : 'de patrouille'} — une voiture, trois policiers`, 'déjà sur place, à l’écart du rassemblement', true);
  }
  // un rôle à pied de la compagnie l'engage toujours (une section au moins, comme la mise en place)
  const foot = role === 'crs' || role === 'chef_groupe' || role === 'commandant' || role === 'commissaire';
  const sections = foot ? Math.max(1, m.sections) : m.sections;
  if (sections > 0) {
    const vans = m.fourgons > 0 ? `, ${plural(m.fourgons, 'fourgon', 'fourgons')}` : ', à pied';
    add('compagnie', `Compagnie — ${plural(sections, 'section', 'sections')}${vans}`, mainFrom, foot);
  }
  const bravm = role === 'bravm' ? Math.max(1, m.bravm) : m.bravm;
  if (bravm > 0) add('bravm', `BRAV-M — ${plural(bravm, 'groupe', 'groupes')} de motos`, bravmFrom, role === 'bravm');
  const centaure = role === 'gendarme_centaure' ? Math.max(1, m.centaure) : m.centaure;
  if (centaure > 0) add('centaure', centaure > 1 ? `${centaure} Centaure (gendarmerie)` : 'Centaure (gendarmerie)', mainFrom, role === 'gendarme_centaure');
  const canon = role === 'operateur_canon_eau' ? Math.max(1, m.canon_eau) : m.canon_eau;
  if (canon > 0) add('canon_eau', canon > 1 ? `${canon} engins lanceurs d’eau` : 'Engin lanceur d’eau', mainFrom, role === 'operateur_canon_eau');
  const drone = role === 'telepilote' ? Math.max(1, m.drone) : m.drone;
  if (drone > 0) add('drone', `Équipe drone — ${plural(drone, 'appareil', 'appareils')}`, mainFrom, role === 'telepilote');
  const pompier = role === 'secouriste' && d.variante !== 'samu';
  const samu = role === 'secouriste' && d.variante === 'samu';
  const rescueFrom = (mine: boolean): string => (m.secours_sur_appel && !mine ? 'sur appel radio' : 'déjà sur place');
  if (m.pompiers > 0 || pompier) add('pompiers', `Sapeurs-pompiers — ${plural(Math.max(1, m.pompiers), 'engin', 'engins')}`, rescueFrom(pompier), pompier);
  if (m.samu > 0 || samu) add('samu', `SAMU — ${plural(Math.max(1, m.samu), 'équipe', 'équipes')}`, rescueFrom(samu), samu);
  return out;
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
  d.role = rng.pick(SURPRISE_ROLES);
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
    journee: true,
  };
  d.seed = rng.int(1, 1000000);
  // un samedi sans organisateur n'a ni service d'ordre ni sono ; l'imprévu est tiré en dernier, pour que les tirages
  // précédents restent ceux des versions antérieures (même graine, même scénario)
  d.organisateurs = arch.id === 'samedi_sans_organisateur' ? 'aucun' : 'intersyndicale';
  d.imprevu = rng.int(1, 4) as ImprevuLevel;
  return sanitizeDraft(d, base);
}

/** Nom proposé pour un scénario enregistré : « République — 600 manifestants — 14 h 30 ». */
export function suggestName(d: ScenarioDraft): string {
  if (d.mode !== 'monde_ouvert' && d.missionId === '' && d.manifNom !== '') return `${d.manifNom} — ${hourLabel(d.timeOfDay)}`;
  const lieu = d.place.replace(/^(place|esplanade|parvis) (de la |de l’|de l'|des |du |de )?/i, '');
  const short = lieu.charAt(0).toUpperCase() + lieu.slice(1);
  if (d.mode === 'monde_ouvert') return `${short} — patrouille — ${hourLabel(d.timeOfDay)}`;
  return `${short} — ${int(d.crowdSize)} manifestants — ${hourLabel(d.timeOfDay)}`;
}
