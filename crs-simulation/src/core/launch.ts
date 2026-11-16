/* =====================================================================================
 * Paramètres de lancement lus dans l'URL (docs/ARCHITECTURE.md §6) :
 *   ?autostart=test|paris  démarre une session sans passer par le menu
 *   &place=…               lieu de départ (nom connu du monde)
 *   &x=…&z=…               ou coordonnées de départ
 *   &quality=bas|moyen|haut|ultra
 *   &seed=…                graine (entier, ou texte quelconque)
 *   &nomenu=1              pas de menu principal (tests)
 *   &debug=1               journalisation bavarde
 *   &mode=carriere|libre|monde_ouvert|editeur|test   mode de jeu (défaut : monde_ouvert pour paris, test sinon)
 *   &journee=1                                  journée de service (caserne de la Cité, trajet en colonne)
 *   &role=… &rank=… &time=… &weather=… &crowd=… &tension=… &volatility=… &mission=… &duration=…
 * Exemple, mode libre en commandant d'emblée :
 *   ?autostart=paris&mode=libre&role=commandant&mission=…&crowd=800&tension=0.4
 * Sans &rank=, le grade est celui du rôle (defaultRankForRole).
 * La racine de composition les publie sous la clé de service « launch » :
 *   ctx.service<LaunchParams>('launch')
 * ===================================================================================== */

import type {
  DurationPreset, GameMode, PlayableRole, PoliceRank, QualityLevel, SessionConfig, WeatherKind,
} from './contracts';
import { hashString } from './rng';
import { defaultSessionConfig } from './session';

/** Clé du service publié par la racine de composition. */
export const LAUNCH_SERVICE = 'launch';

export interface LaunchParams {
  /** Session à démarrer d'office : quartier d'essai, Paris, ou aucune. */
  autostart: 'test' | 'paris' | null;
  place: string | null;
  x: number | null;
  z: number | null;
  quality: QualityLevel | null;
  seed: number | null;
  nomenu: boolean;
  debug: boolean;
  /** Mode de jeu demandé (null : déduit de autostart). */
  mode: GameMode | null;
  role: PlayableRole | null;
  rank: PoliceRank | null;
  /** Heure de départ 0..24. */
  time: number | null;
  weather: WeatherKind | null;
  crowd: number | null;
  tension: number | null;
  volatility: number | null;
  mission: string | null;
  duration: DurationPreset | null;
  /** Tous les paramètres bruts de l'URL. */
  raw: Readonly<Record<string, string>>;
}

const QUALITIES: readonly string[] = ['bas', 'moyen', 'haut', 'ultra'];
const MODES: readonly string[] = ['carriere', 'libre', 'monde_ouvert', 'editeur', 'test'];
const ROLES: readonly string[] = [
  'crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau',
  'telepilote', 'street_medic', 'secouriste', 'journaliste', 'manifestant',
];
const RANKS: readonly string[] = [
  'gardien_stagiaire', 'gardien', 'brigadier', 'brigadier_chef', 'major', 'capitaine', 'commandant', 'commissaire',
];
const WEATHERS: readonly string[] = ['clair', 'nuageux', 'couvert', 'pluie', 'averse', 'brouillard', 'orage'];
const DURATIONS: readonly string[] = ['courte', 'standard', 'longue', 'temps_reel'];

function oneOf<T extends string>(value: string | undefined, allowed: readonly string[]): T | null {
  return value !== undefined && allowed.indexOf(value) >= 0 ? (value as T) : null;
}

function num(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function flag(value: string | undefined): boolean {
  return value !== undefined && value !== '0' && value !== 'false' && value !== 'non';
}

/** Analyse la partie « ?a=b&c=d » d'une URL. Ne lève jamais d'exception. */
export function parseLaunchParams(search: string): LaunchParams {
  // objet sans prototype : « ?constructor=… » ou « ?__proto__=… » restent de simples paramètres
  const raw = Object.create(null) as Record<string, string>;
  const q = typeof search === 'string' ? (search.startsWith('?') ? search.slice(1) : search) : '';
  for (const part of q.split('&')) {
    if (!part) continue;
    try {
      const eq = part.indexOf('=');
      const k = decodeURIComponent((eq < 0 ? part : part.slice(0, eq)).replace(/\+/g, ' '));
      const v = eq < 0 ? '' : decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
      if (k) raw[k] = v;
    } catch {
      // paramètre mal encodé : ignoré, les suivants sont lus quand même
    }
  }

  const auto = raw.autostart;
  let seed: number | null = null;
  if (raw.seed !== undefined && raw.seed !== '') {
    const n = Number(raw.seed);
    seed = Number.isFinite(n) ? n : hashString(raw.seed);
  }
  const time = num(raw.time);

  return {
    autostart: auto === undefined || auto === '0' || auto === 'false' ? null : auto === 'paris' ? 'paris' : 'test',
    place: raw.place ? raw.place : null,
    x: num(raw.x),
    z: num(raw.z),
    quality: oneOf<QualityLevel>(raw.quality, QUALITIES),
    seed,
    nomenu: flag(raw.nomenu),
    debug: flag(raw.debug),
    mode: oneOf<GameMode>(raw.mode, MODES),
    role: oneOf<PlayableRole>(raw.role, ROLES),
    rank: oneOf<PoliceRank>(raw.rank, RANKS),
    time: time !== null && time >= 0 && time <= 24 ? time : null,
    weather: oneOf<WeatherKind>(raw.weather, WEATHERS),
    crowd: num(raw.crowd),
    tension: num(raw.tension),
    volatility: num(raw.volatility),
    mission: raw.mission ? raw.mission : null,
    duration: oneOf<DurationPreset>(raw.duration, DURATIONS),
    raw: Object.freeze(raw),
  };
}

/** Configuration de la session démarrée d'office par ?autostart=… */
export function launchSessionConfig(launch: LaunchParams): SessionConfig {
  const paris = launch.autostart === 'paris';
  const cfg = defaultSessionConfig({
    mode: launch.mode ?? (paris ? 'monde_ouvert' : 'test'),
    place: launch.place ?? (paris ? 'place de la Concorde' : ''),
    seed: launch.seed ?? 1,
    // sans grade demandé, defaultSessionConfig retient celui du rôle (commandant → commandant…)
    role: launch.role ?? undefined,
    rank: launch.rank ?? undefined,
  });
  if (launch.x !== null && launch.z !== null) {
    cfg.x = launch.x;
    cfg.z = launch.z;
  }
  if (launch.time !== null) cfg.timeOfDay = launch.time;
  if (launch.weather) cfg.weather = launch.weather;
  if (launch.crowd !== null && launch.crowd >= 0) cfg.crowdSize = Math.round(launch.crowd);
  if (launch.tension !== null) cfg.tension = Math.min(1, Math.max(0, launch.tension));
  if (launch.volatility !== null) cfg.volatility = Math.min(1, Math.max(0, launch.volatility));
  if (launch.mission) cfg.missionId = launch.mission;
  if (launch.duration) cfg.duration = launch.duration;
  // &journee=1 : journée de service (prise de service à la caserne, trajet en colonne)
  if (launch.raw['journee'] === '1') cfg.extra = { ...(cfg.extra ?? {}), journee: true };
  return cfg;
}
