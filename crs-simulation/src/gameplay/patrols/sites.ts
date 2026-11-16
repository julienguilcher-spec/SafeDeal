/* =====================================================================================
 * PATROUILLES — lieux de rattachement (commissariats et points de stationnement réels du cœur de Paris) et choix
 * des secteurs : les voitures sont réparties dans la ville, loin les unes des autres et à l'écart de la
 * manifestation, chacune à partir de son commissariat. Logique pure (aucun service).
 *
 * Coordonnées : relevées en WGS84 puis passées au repère du jeu (origine : obélisque de la Concorde, x vers l'est,
 * z vers le sud ; voir src/world/mapdata.ts lonLatToWorld). Toutes dans l'emprise de la carte.
 * ===================================================================================== */

import type { PatrolKind } from './api';

export interface PatrolSite {
  kind: PatrolKind;
  /** Indicatif radio de la voiture. */
  callsign: string;
  /** Lieu de rattachement, tel qu'on le dit à la radio. */
  home: string;
  x: number;
  z: number;
}

const ORIGIN_LAT = 48.865633;
const ORIGIN_LON = 2.321236;
const M_PER_DEG_LON = 73305;
const M_PER_DEG_LAT = 111214;

function site(kind: PatrolKind, callsign: string, home: string, lat: number, lon: number): PatrolSite {
  return { kind, callsign, home, x: Math.round((lon - ORIGIN_LON) * M_PER_DEG_LON), z: Math.round(-(lat - ORIGIN_LAT) * M_PER_DEG_LAT) };
}

/** Police secours (« TV ») : un équipage par commissariat d'arrondissement. */
export const TV_SITES: readonly PatrolSite[] = [
  site('tv', 'TV 75-01', 'commissariat du 1er arrondissement', 48.8667, 2.3318),
  site('tv', 'TV 75-03', 'commissariat du 3e arrondissement', 48.8630, 2.3525),
  site('tv', 'TV 75-04', 'commissariat du 4e arrondissement', 48.8510, 2.3667),
  site('tv', 'TV 75-06', 'commissariat du 6e arrondissement', 48.8510, 2.3337),
  site('tv', 'TV 75-07', 'commissariat du 7e arrondissement', 48.8598, 2.3097),
  site('tv', 'TV 75-08', 'commissariat du 8e arrondissement', 48.8665, 2.3124),
  site('tv', 'TV 75-09', 'commissariat du 9e arrondissement', 48.8741, 2.3405),
];

/** Brigades anticriminalité de nuit et de jour, par secteur de la ville. */
export const BAC_SITES: readonly PatrolSite[] = [
  site('bac', 'BAC 75N', 'gare Saint-Lazare', 48.8763, 2.3249),
  site('bac', 'BAC 75E', 'place de la République', 48.8675, 2.3640),
  site('bac', 'BAC 75S', 'carrefour de l’Odéon', 48.8521, 2.3390),
  site('bac', 'BAC 75O', 'place du Trocadéro', 48.8629, 2.2884),
];

/** Ordre de composition : alternance Police secours / BAC, Police secours en majorité. */
const MIX: readonly PatrolKind[] = ['tv', 'bac', 'tv', 'bac', 'tv', 'tv', 'bac', 'tv'];

export interface Avoid {
  x: number;
  z: number;
  /** Distance souhaitée (m) : en deçà, le lieu est pénalisé. */
  radius: number;
}

/**
 * Choisit `count` lieux, de façon à disperser les voitures : à chaque tour, le lieu du type voulu le plus éloigné de
 * tout ce qui est déjà pris (et des points à éviter : manifestation, emplacement des forces). `jitter` (0..1, tirage
 * de la session) varie le choix entre sessions sans nuire à la dispersion.
 */
export function chooseSites(count: number, avoid: readonly Avoid[], jitter: () => number, inside: (x: number, z: number) => boolean): PatrolSite[] {
  const pool = [...TV_SITES, ...BAC_SITES].filter((s) => inside(s.x, s.z));
  const out: PatrolSite[] = [];
  const bonus = new Map<PatrolSite, number>();
  for (const s of pool) bonus.set(s, jitter() * 150);
  const score = (s: PatrolSite): number => {
    let best = Infinity;
    for (const a of avoid) {
      // un point à éviter compte comme un lieu déjà pris, avec une marge en plus de sa distance souhaitée
      const d = Math.hypot(s.x - a.x, s.z - a.z) - a.radius;
      if (d < best) best = d;
    }
    for (const o of out) {
      const d = Math.hypot(s.x - o.x, s.z - o.z);
      if (d < best) best = d;
    }
    return (best === Infinity ? 5000 : best) + (bonus.get(s) ?? 0);
  };
  for (let i = 0; i < count && pool.length > 0; i++) {
    const want = MIX[i % MIX.length]!;
    let pick = -1;
    let pickScore = -Infinity;
    for (let pass = 0; pass < 2 && pick < 0; pass++) {
      for (let k = 0; k < pool.length; k++) {
        const s = pool[k]!;
        if (pass === 0 && s.kind !== want) continue;
        const sc = score(s);
        if (sc > pickScore) {
          pickScore = sc;
          pick = k;
        }
      }
    }
    if (pick < 0) break;
    out.push(pool[pick]!);
    pool.splice(pick, 1);
  }
  return out;
}

// ───────────────────────────── phraséologie ─────────────────────────────

/** Volume « à l'estime », comme on le dit à la radio : 47 → « une cinquantaine ». */
export function approx(n: number): string {
  if (n < 5) return 'quelques';
  if (n < 8) return 'une demi-douzaine de';
  if (n < 13) return 'une dizaine de';
  if (n < 18) return 'une quinzaine de';
  if (n < 26) return 'une vingtaine de';
  if (n < 36) return 'une trentaine de';
  if (n < 46) return 'une quarantaine de';
  if (n < 56) return 'une cinquantaine de';
  if (n < 70) return 'une soixantaine de';
  if (n < 90) return 'environ quatre-vingts';
  if (n < 150) return 'une centaine de';
  if (n < 250) return 'environ deux cents';
  if (n < 400) return 'environ trois cents';
  return 'plusieurs centaines de';
}

/** Élision devant voyelle : « une cinquantaine de individus » → « une cinquantaine d’individus ». */
export function people(n: number, noun: string): string {
  const a = approx(n);
  if (a.endsWith(' de') && /^[aeéèêiïoôuh]/i.test(noun)) return a.slice(0, -3) + ' d’' + noun;
  return a + ' ' + noun;
}

/** Humeur d'un rassemblement d'après sa tension 0..1. */
export function mood(tension: number): string {
  if (tension < 0.3) return 'calme pour l’instant';
  if (tension < 0.55) return 'ça s’échauffe';
  if (tension < 0.75) return 'ça se tend';
  return 'très tendu, risque de débordements';
}

/** Palier de tension (pour ne redire un foyer que quand il change vraiment). */
export function moodLevel(tension: number): number {
  return tension < 0.3 ? 0 : tension < 0.55 ? 1 : tension < 0.75 ? 2 : 3;
}

/** Distance dite à la radio : 640 → « six cents mètres », 1 480 → « un kilomètre cinq ». */
export function distanceWords(d: number): string {
  if (d < 1000) {
    const h = Math.max(1, Math.round(d / 100));
    const words = ['', 'cent', 'deux cents', 'trois cents', 'quatre cents', 'cinq cents', 'six cents', 'sept cents', 'huit cents', 'neuf cents', 'mille'];
    return words[h] + ' mètres';
  }
  const km = Math.round(d / 100) / 10;
  const whole = Math.floor(km);
  const tenth = Math.round((km - whole) * 10);
  const units = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
  return (whole < 10 ? units[whole] : String(whole)) + (whole > 1 ? ' kilomètres' : ' kilomètre') + (tenth > 0 ? ' ' + units[tenth] : '');
}

/** « CENTRAL ICI TV 75-09. corps. TERMINÉ. » */
export function radioFrame(to: string, from: string, body: string, reply = false): string {
  const text = body.trim();
  const dot = /[.!?]$/.test(text) ? '' : '.';
  return `${to} ICI ${from}. ${text.charAt(0).toUpperCase()}${text.slice(1)}${dot} ${reply ? 'PARLEZ.' : 'TERMINÉ.'}`;
}
