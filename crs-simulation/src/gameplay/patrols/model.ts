/* =====================================================================================
 * PATROUILLE — modèle partagé de la vacation (pur : aucun DOM, aucun service).
 *
 * Une « vacation » est une session 'monde_ouvert' jouée dans le rôle 'patrouille' (équipage d'une voiture : BAC en
 * civil dans une voiture banalisée, ou Police secours en tenue dans une voiture sérigraphiée) et portant la clé
 * extra.vacation (VacationConfig). Le mode de jeu interne reste 'monde_ouvert' : l'interface l'appelle « Patrouille ».
 * Les sessions 'monde_ouvert' lancées hors de l'interface (?autostart=paris : CRS, place de la Concorde, une foule)
 * ne sont JAMAIS converties : migrateLegacyPatrol ne touche que les configurations produites par la page d'accueil.
 *
 * Ce module est lu par :
 *   - la vue Patrouille de l'accueil (PatrolSetup → SessionConfig : vacationSessionConfig) ;
 *   - la mise en place de l'équipage (src/gameplay/session) et le répartiteur d'appels (PatrolModeSystem, service
 *     'patrol.mode') : readVacation ;
 *   - le module de foule (ManifsSystem) : readImprevus (manifestations sauvages du Mode libre, extra.imprevus).
 * Les types d'exécution des appels (DispatchCall, PatrolModeApi…) sont définis ici pour être partagés par la
 * simulation et l'interface sans dépendance entre elles.
 *
 * Tout tirage au hasard passe par createRng(seed) : même graine, même résultat.
 * ===================================================================================== */

import type {
  DurationPreset, EntityId, PoliceRank, SessionConfig, VehicleKind, ViolenceLevel, WeatherKind,
} from '@/core/contracts';
import { createRng } from '@/core/rng';
import { defaultRankForRole } from '@/core/session';
import { BAC_SITES, TV_SITES, type PatrolSite } from './sites';

// ───────────────────────────── identifiants ─────────────────────────────

/** Clé de SessionConfig.extra : configuration de la vacation (VacationConfig). */
export const VACATION_KEY = 'vacation';
/** Clé de SessionConfig.extra : imprévus du Mode libre (ImprevusConfig), lue par le module de foule. */
export const IMPREVUS_KEY = 'imprevus';
/** Clé de SessionConfig.extra : cœur de foule en veille (aucune manifestation principale ; src/sim/crowd/core.ts). */
export const VEILLE_KEY = 'crowd.veille';
/** Service du répartiteur d'appels de la vacation (PatrolModeApi). */
export const PATROL_MODE_SERVICE = 'patrol.mode';
/** Identifiant du système du répartiteur d'appels. */
export const PATROL_MODE_SYSTEM_ID = 'gameplay.patrol-mode';
/** Événement émis à chaque changement d'état d'un appel (PatrolCallEvent). */
export const PATROL_CALL_EVENT = 'patrol:call';

// ───────────────────────────── types de base ─────────────────────────────

export type PatrolCrew = 'bac' | 'police_secours';
/** Place du joueur : au volant, ou chef de bord (poste 'interpellation', passager avant). */
export type PatrolSeat = 'conducteur' | 'chef_bord';
/** Rythme des appels de CENTRAL. */
export type PatrolRythme = 'calme' | 'normal' | 'agite';

/** Point de départ de l'équipage : secteur BAC ou commissariat, coordonnées réelles. */
export interface PatrolDepart {
  /** Identifiant stable (« bac-75n », « tv-75-09 »). */
  id: string;
  /** Libellé dit à la radio et affiché (« secteur gare Saint-Lazare », « commissariat du 9e arrondissement »). */
  name: string;
  x: number;
  z: number;
  /** Indicatif radio de l'équipage (« BAC 75N », « TV 75-09 »). */
  callsign: string;
}

/** Natures d'appel autorisées pendant la vacation. */
export interface PatrolCallTypes {
  feux: boolean;
  rassemblements: boolean;
  blocages: boolean;
  casseurs: boolean;
  manifs: boolean;
}

/** Contenu de extra.vacation. */
export interface VacationConfig {
  crew: PatrolCrew;
  seat: PatrolSeat;
  rank: PoliceRank;
  depart: PatrolDepart;
  /** Le départ a été tiré au hasard (« Au hasard » dans la vue Patrouille) : relu tel quel par l'accueil. */
  hasard?: boolean;
  rythme: PatrolRythme;
  types: PatrolCallTypes;
  /** Délai (s) du premier appel, imposé (essais : paramètre d'URL &premier=) ; absent : tirage selon le rythme. */
  premier?: number;
  /** Écart (s) imposé entre deux appels ; absent : tirage selon le rythme. */
  ecart?: number;
}

/** Réglages de la vue Patrouille de l'accueil. */
export interface PatrolSetup {
  crew: PatrolCrew;
  seat: PatrolSeat;
  rank: PoliceRank;
  /** Identifiant d'un départ de l'équipage (PatrolDepart.id), ou 'hasard'. */
  departId: string;
  rythme: PatrolRythme;
  timeOfDay: number;
  weather: WeatherKind;
  /** Direction d'où vient le vent (°, pas de 45). */
  windDir: number;
  /** Vitesse du vent (km/h). */
  windSpeed: number;
  duration: DurationPreset;
  seed: number;
  /** Délai (s) du premier appel imposé (essais) ; absent : tirage normal. */
  premier?: number;
  /** Niveau de violence affiché (recopié des paramètres au lancement). */
  violence: ViolenceLevel;
}

/** Imprévus du Mode libre (extra.imprevus) : manifestations sauvages programmées par le module de foule. */
export interface ImprevusConfig {
  /** Nombre de manifestations sauvages (0..3). */
  sauvages: number;
  /** Instant (s) de la première ; absent : tirage du module de foule. */
  premier?: number;
  /** Écart (s) entre deux ; absent : tirage du module de foule. */
  ecart?: number;
}

// ───────────────────────────── types d'exécution (répartiteur d'appels) ─────────────────────────────

export type CallKind = 'rassemblement' | 'casseurs' | 'blocage' | 'manif_sauvage' | 'feu';

/**
 * annonce  : CENTRAL appelle, en attente de réponse ;
 * acceptee : pris par le joueur, en route ;
 * sur_place: le joueur est arrivé (moins de 60 m) ;
 * confiee  : confié à une patrouille de l'IA (décliné ou sans réponse) ;
 * declinee : refusé par le joueur sans patrouille libre pour le reprendre ;
 * terminee : le foyer s'est dispersé, la manifestation est finie, le feu est éteint, ou fin d'intervention.
 */
export type CallState = 'annonce' | 'acceptee' | 'sur_place' | 'confiee' | 'declinee' | 'terminee';

export type BackupKind = 'patrouille' | 'compagnie' | 'pompiers' | 'samu';

export interface DispatchCall {
  readonly id: number;
  readonly kind: CallKind;
  /** Titre de l'appel (« Rassemblement non déclaré »). */
  readonly label: string;
  /** Lieu dit à la radio (« place de l'Opéra »). */
  readonly place: string;
  readonly x: number;
  readonly z: number;
  /** Effectif estimé (0 pour un feu). */
  readonly people: number;
  readonly priority: 1 | 2 | 3;
  /** Instant de l'annonce (s de simulation). */
  readonly t: number;
  state: CallState;
  /** Indicatif de l'équipage qui traite l'appel ('' tant que personne). */
  assignedTo: string;
  /** Renforts demandés, dans l'ordre. */
  backup: BackupKind[];
  /** Foyer de foule lié (0 : aucun). */
  foyerId: number;
  /** Manifestation sauvage liée (0 : aucune). */
  manifId: number;
  /** Feu lié : identifiant du danger allumé (0 : aucun). */
  fireId: EntityId;
  /** Incident de feu détecté et rattaché (0 : pas encore). */
  incidentId: number;
}

/** Compte rendu de vacation. */
export interface VacationSummary {
  /** Durée jouée (s). */
  duration: number;
  calls: number;
  accepted: number;
  resolved: number;
  delegated: number;
  declined: number;
  arrests: number;
  injured: number;
  backups: number;
}

/** Service 'patrol.mode' : répartiteur d'appels de la vacation. */
export interface PatrolModeApi {
  /** Une vacation est en cours (session portant extra.vacation). */
  readonly active: boolean;
  /** Indicatif de l'équipage du joueur ('' hors vacation). */
  readonly callsign: string;
  /** Tous les appels de la vacation, du plus ancien au plus récent. */
  readonly calls: readonly DispatchCall[];
  /** Appel à traiter (annoncé, accepté ou sur place), null sinon. */
  readonly current: DispatchCall | null;
  /** Fin de vacation annoncée : l'équipage regagne le service. */
  readonly ending: boolean;
  accept(id: number): boolean;
  decline(id: number): boolean;
  /** Fin d'intervention (le joueur clôt l'appel). */
  close(id: number): boolean;
  requestBackup(id: number, kind: BackupKind): boolean;
  summary(): VacationSummary;
}

/** Charge utile de l'événement 'patrol:call'. */
export interface PatrolCallEvent {
  call: DispatchCall;
  state: CallState;
}

// ───────────────────────────── équipages ─────────────────────────────

export interface PatrolSeatInfo {
  id: PatrolSeat;
  label: string;
  /** Poste tenu (SessionConfig.extra.poste). */
  poste: 'conducteur' | 'interpellation';
}

export interface PatrolCrewInfo {
  id: PatrolCrew;
  label: string;
  desc: string;
  /** Variante du rôle 'patrouille' (SessionConfig.extra.variante). */
  variante: PatrolCrew;
  vehicle: VehicleKind;
  seats: readonly PatrolSeatInfo[];
  ranks: readonly PoliceRank[];
  departs(): readonly PatrolDepart[];
}

const SEATS: readonly PatrolSeatInfo[] = [
  { id: 'conducteur', label: 'Conducteur', poste: 'conducteur' },
  { id: 'chef_bord', label: 'Chef de bord', poste: 'interpellation' },
];
const RANKS: readonly PoliceRank[] = ['gardien', 'brigadier_chef', 'major'];

function slug(callsign: string): string {
  return callsign.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function departOf(s: PatrolSite): PatrolDepart {
  return { id: slug(s.callsign), name: s.kind === 'bac' ? 'secteur ' + s.home : s.home, x: s.x, z: s.z, callsign: s.callsign };
}

const BAC_DEPARTS: readonly PatrolDepart[] = Object.freeze(BAC_SITES.map(departOf));
const TV_DEPARTS: readonly PatrolDepart[] = Object.freeze(TV_SITES.map(departOf));

export const CREWS: readonly PatrolCrewInfo[] = [
  {
    id: 'bac', label: 'BAC', desc: 'Trois policiers en civil dans une voiture banalisée, gyrophare aimanté et deux-tons.',
    variante: 'bac', vehicle: 'voiture_bac', seats: SEATS, ranks: RANKS, departs: () => BAC_DEPARTS,
  },
  {
    id: 'police_secours', label: 'Police secours', desc: 'Trois policiers en tenue dans une voiture sérigraphiée.',
    variante: 'police_secours', vehicle: 'voiture_police', seats: SEATS, ranks: RANKS, departs: () => TV_DEPARTS,
  },
];

export function crewInfo(crew: PatrolCrew): PatrolCrewInfo {
  return CREWS.find((c) => c.id === crew) ?? CREWS[0]!;
}

/** Tension et volatilité de départ de la ville selon le rythme. */
export const RYTHME_AMBIANCE: Readonly<Record<PatrolRythme, { tension: number; volatility: number }>> = {
  calme: { tension: 0.15, volatility: 0.3 },
  normal: { tension: 0.3, volatility: 0.5 },
  agite: { tension: 0.45, volatility: 0.75 },
};
const RYTHMES: readonly PatrolRythme[] = ['calme', 'normal', 'agite'];
const WEATHERS: readonly WeatherKind[] = ['clair', 'nuageux', 'couvert', 'pluie', 'averse', 'brouillard', 'orage'];
const DURATIONS: readonly DurationPreset[] = ['courte', 'standard', 'longue', 'temps_reel'];
/** Nombre de voitures de patrouille de l'IA pendant une vacation (en plus de celle du joueur). */
const VACATION_PATROLS = 4;

// ───────────────────────────── réglages ─────────────────────────────

export function defaultPatrolSetup(): PatrolSetup {
  return {
    crew: 'bac', seat: 'conducteur', rank: 'gardien', departId: BAC_DEPARTS[0]!.id, rythme: 'normal',
    timeOfDay: 16, weather: 'nuageux', windDir: 270, windSpeed: 10, duration: 'standard', seed: 1, violence: 'realiste',
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).indexOf(v) >= 0 ? (v as T) : fallback;
}

/** Délai d'essai : nombre fini ≥ 0 (s), borné à une heure ; undefined sinon. */
function delay(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(3600, v) : undefined;
}

/** Borne toutes les valeurs ; un départ inconnu de l'équipage revient au premier de sa liste. */
export function sanitizePatrolSetup(input: Partial<PatrolSetup> | null | undefined): PatrolSetup {
  const base = defaultPatrolSetup();
  const d: Record<string, unknown> = isRecord(input) ? input : {};
  const crew = oneOf<PatrolCrew>(d.crew, ['bac', 'police_secours'], base.crew);
  const info = crewInfo(crew);
  const departs = info.departs();
  const departId = d.departId === 'hasard' ? 'hasard'
    : typeof d.departId === 'string' && departs.some((p) => p.id === d.departId) ? d.departId : departs[0]!.id;
  const hour = num(d.timeOfDay, base.timeOfDay);
  const out: PatrolSetup = {
    crew,
    seat: oneOf<PatrolSeat>(d.seat, ['conducteur', 'chef_bord'], base.seat),
    rank: oneOf<PoliceRank>(d.rank, info.ranks, base.rank),
    departId,
    rythme: oneOf<PatrolRythme>(d.rythme, RYTHMES, base.rythme),
    timeOfDay: Math.round(clamp(hour >= 24 ? hour % 24 : hour, 0, 23.75) * 4) / 4,
    weather: oneOf<WeatherKind>(d.weather, WEATHERS, base.weather),
    windDir: ((Math.round(num(d.windDir, base.windDir) / 45) * 45) % 360 + 360) % 360,
    windSpeed: Math.round(clamp(num(d.windSpeed, base.windSpeed), 0, 70)),
    duration: oneOf<DurationPreset>(d.duration, DURATIONS, base.duration),
    seed: Math.abs(Math.trunc(num(d.seed, base.seed))) % 1000000 || 1,
    violence: d.violence === 'sobre' ? 'sobre' : 'realiste',
  };
  const premier = delay(d.premier);
  if (premier !== undefined) out.premier = premier;
  return out;
}

/** Départ effectif : celui choisi, ou un départ de l'équipage tiré par createRng(seed) pour « Au hasard ». */
export function resolveDepart(setup: PatrolSetup): PatrolDepart {
  const s = sanitizePatrolSetup(setup);
  const list = crewInfo(s.crew).departs();
  const pick = s.departId === 'hasard' ? createRng(s.seed).fork('patrouille:depart').pick(list) : list.find((p) => p.id === s.departId) ?? list[0]!;
  return { ...pick };
}

function allTypes(): PatrolCallTypes {
  return { feux: true, rassemblements: true, blocages: true, casseurs: true, manifs: true };
}

/** Configuration de session d'une vacation. */
export function vacationSessionConfig(setup: PatrolSetup): SessionConfig {
  const s = sanitizePatrolSetup(setup);
  const crew = crewInfo(s.crew);
  const seat = crew.seats.find((p) => p.id === s.seat) ?? crew.seats[0]!;
  const depart = resolveDepart(s);
  const vacation: VacationConfig = {
    crew: s.crew, seat: s.seat, rank: s.rank, depart, rythme: s.rythme, types: allTypes(),
  };
  if (s.departId === 'hasard') vacation.hasard = true;
  if (s.premier !== undefined) vacation.premier = s.premier;
  const amb = RYTHME_AMBIANCE[s.rythme];
  const extra: Record<string, unknown> = {
    scenario: 1,
    poste: seat.poste,
    variante: crew.variante,
    [VACATION_KEY]: vacation,
    [VEILLE_KEY]: true,
    journee: false,
    patrouilles: VACATION_PATROLS,
    foyers: 0,
    vent: { direction: s.windDir, vitesse: s.windSpeed },
    // aucune compagnie ni engin : une voiture seule ; secours sur appel (pompiers et SAMU demandés à la radio)
    moyens: { sections: 0, fourgons: 0, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 1, samu: 1, secours_sur_appel: true },
    options: { sanctions: true, violence: s.violence, circulation: 'ouverte', metro: 'ouvert', journee: false },
  };
  return {
    mode: 'monde_ouvert',
    missionId: '',
    role: 'patrouille',
    rank: s.rank,
    place: depart.name,
    x: depart.x,
    z: depart.z,
    timeOfDay: s.timeOfDay,
    weather: s.weather,
    crowdSize: 0,
    tension: amb.tension,
    volatility: amb.volatility,
    duration: s.duration,
    seed: s.seed,
    extra,
  };
}

// ───────────────────────────── relecture ─────────────────────────────

function readDepart(v: unknown): PatrolDepart | null {
  if (!isRecord(v)) return null;
  const x = v.x, z = v.z;
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const callsign = typeof v.callsign === 'string' ? v.callsign.trim().slice(0, 24) : '';
  if (callsign === '') return null;
  const id = typeof v.id === 'string' && v.id ? v.id : slug(callsign);
  const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 80) : callsign;
  return { id, name, x, z, callsign };
}

/**
 * extra.vacation d'une session de patrouille, assainie ; null hors vacation (clé absente ou invalide, ou rôle autre
 * que 'patrouille').
 */
export function readVacation(cfg: Pick<SessionConfig, 'role' | 'extra'> | null | undefined): VacationConfig | null {
  if (!cfg || cfg.role !== 'patrouille' || !isRecord(cfg.extra)) return null;
  const v = cfg.extra[VACATION_KEY];
  if (!isRecord(v)) return null;
  const depart = readDepart(v.depart);
  if (!depart) return null;
  const crew = oneOf<PatrolCrew>(v.crew, ['bac', 'police_secours'], 'bac');
  const t = isRecord(v.types) ? v.types : {};
  const flag = (k: keyof PatrolCallTypes): boolean => (typeof t[k] === 'boolean' ? (t[k] as boolean) : true);
  const out: VacationConfig = {
    crew,
    seat: oneOf<PatrolSeat>(v.seat, ['conducteur', 'chef_bord'], 'conducteur'),
    rank: oneOf<PoliceRank>(v.rank, RANKS, 'gardien'),
    depart,
    rythme: oneOf<PatrolRythme>(v.rythme, RYTHMES, 'normal'),
    types: { feux: flag('feux'), rassemblements: flag('rassemblements'), blocages: flag('blocages'), casseurs: flag('casseurs'), manifs: flag('manifs') },
  };
  if (v.hasard === true) out.hasard = true;
  const premier = delay(v.premier);
  if (premier !== undefined) out.premier = premier;
  const ecart = typeof v.ecart === 'number' && Number.isFinite(v.ecart) && v.ecart > 0 ? Math.min(3600, v.ecart) : undefined;
  if (ecart !== undefined) out.ecart = ecart;
  return out;
}

/** Réglages de la vue Patrouille relus depuis une configuration de vacation ; null si ce n'en est pas une. */
export function patrolSetupFromConfig(cfg: SessionConfig | null | undefined): PatrolSetup | null {
  const v = readVacation(cfg);
  if (!cfg || !v) return null;
  const extra = isRecord(cfg.extra) ? cfg.extra : {};
  const vent = isRecord(extra.vent) ? extra.vent : {};
  const options = isRecord(extra.options) ? extra.options : {};
  const known = crewInfo(v.crew).departs().find((p) => p.id === v.depart.id);
  const raw: Partial<PatrolSetup> = {
    crew: v.crew,
    seat: v.seat,
    rank: v.rank,
    departId: v.hasard ? 'hasard' : known ? known.id : nearestDepart(v.crew, v.depart.x, v.depart.z).id,
    rythme: v.rythme,
    timeOfDay: cfg.timeOfDay,
    weather: cfg.weather,
    windDir: num(vent.direction, 270),
    windSpeed: num(vent.vitesse, 10),
    duration: cfg.duration,
    seed: cfg.seed,
  };
  if (v.premier !== undefined) raw.premier = v.premier;
  if (options.violence === 'sobre' || options.violence === 'realiste') raw.violence = options.violence;
  return sanitizePatrolSetup(raw);
}

/** Départ de l'équipage le plus proche d'un point. */
export function nearestDepart(crew: PatrolCrew, x: number, z: number): PatrolDepart {
  const list = crewInfo(crew).departs();
  let best = list[0]!;
  let bestD = Infinity;
  for (const p of list) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return { ...best };
}

/**
 * Ancienne configuration « Monde ouvert » de l'accueil (extra.scenario présent, sans vacation) → vacation BAC au
 * secteur le plus proche de son lieu, heure, météo, vent, durée et graine conservés. Appliquée SEULEMENT par
 * l'interface (Continuer, scénarios enregistrés, Rejouer, lancement) : ces configurations produisaient une
 * manifestation que l'écran n'annonçait pas. Toute autre configuration (mode libre, carrière, ?autostart=paris
 * construite hors de l'interface, vacation déjà formée) est rendue telle quelle.
 */
export function migrateLegacyPatrol(cfg: SessionConfig): SessionConfig {
  if (!cfg || cfg.mode !== 'monde_ouvert' || !isRecord(cfg.extra) || cfg.extra.scenario !== 1) return cfg;
  if (readVacation(cfg)) return cfg;
  const extra = cfg.extra;
  const vent = isRecord(extra.vent) ? extra.vent : {};
  const options = isRecord(extra.options) ? extra.options : {};
  const hasXz = typeof cfg.x === 'number' && typeof cfg.z === 'number' && Number.isFinite(cfg.x) && Number.isFinite(cfg.z);
  const depart = hasXz ? nearestDepart('bac', cfg.x!, cfg.z!) : crewInfo('bac').departs()[0]!;
  const rank: PoliceRank = cfg.rank && RANKS.indexOf(cfg.rank) >= 0 ? cfg.rank : (defaultRankForRole('patrouille') ?? 'gardien');
  const setup: Partial<PatrolSetup> = {
    crew: 'bac', seat: 'conducteur', rank, departId: depart.id, rythme: 'normal',
    timeOfDay: cfg.timeOfDay, weather: cfg.weather, windDir: num(vent.direction, 270), windSpeed: num(vent.vitesse, 10),
    duration: cfg.duration, seed: cfg.seed,
  };
  if (options.violence === 'sobre' || options.violence === 'realiste') setup.violence = options.violence;
  return vacationSessionConfig(sanitizePatrolSetup(setup));
}

/** extra.imprevus assaini ; null quand la clé est absente ou ne programme aucune manifestation sauvage. */
export function readImprevus(cfg: Pick<SessionConfig, 'extra'> | null | undefined): ImprevusConfig | null {
  const v = cfg && isRecord(cfg.extra) ? cfg.extra[IMPREVUS_KEY] : undefined;
  if (!isRecord(v)) return null;
  const sauvages = Math.round(clamp(num(v.sauvages, 0), 0, 3));
  if (sauvages <= 0) return null;
  const out: ImprevusConfig = { sauvages };
  const premier = delay(v.premier);
  if (premier !== undefined) out.premier = premier;
  const ecart = typeof v.ecart === 'number' && Number.isFinite(v.ecart) && v.ecart > 0 ? Math.min(3600, v.ecart) : undefined;
  if (ecart !== undefined) out.ecart = ecart;
  return out;
}
