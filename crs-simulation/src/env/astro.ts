/* =====================================================================================
 * Astronomie de position : où sont le soleil et la lune dans le ciel de Paris.
 *
 * Formules de basse précision de l'Astronomical Almanac (soleil : ~0,01° ; lune : ~0,3°),
 * largement suffisantes pour un jeu, et toutes analytiques : aucune table, aucune allocation.
 *
 * Repère du jeu : x = est, y = haut, z = sud (le nord est -z). Les directions renvoyées sont
 * unitaires et pointent VERS l'astre. Logique pure (tourne sous Node).
 * ===================================================================================== */

import { DEG, clamp, clamp01, wrapDeg } from './mathx';

/** Origine du monde : obélisque de la Concorde. */
export const PARIS_LATITUDE_DEG = 48.865633;
export const PARIS_LONGITUDE_DEG = 2.321236;

export interface CalendarDate {
  year: number;
  /** 1..12 */
  month: number;
  day: number;
  /** Décalage de l'heure légale sur le temps universel (heures) : +2 en heure d'été à Paris. */
  utcOffset: number;
}

/**
 * Date de référence du jeu : le 1er mai 2026, journée traditionnelle de manifestation, au printemps
 * et en heure d'été. Soleil levé vers 6 h 30, au plus haut (≈ 56°) vers 13 h 50, couché vers 21 h 05 ;
 * pleine lune ce soir-là : nuits claires.
 */
export const SPRING_DATE: Readonly<CalendarDate> = Object.freeze({ year: 2026, month: 5, day: 1, utcOffset: 2 });

export interface SkyBodies {
  /** Direction réelle vers le soleil (peut pointer sous l'horizon). */
  sunX: number; sunY: number; sunZ: number;
  /** Hauteur apparente du soleil (rad, réfraction comprise) et azimut (rad depuis le nord, vers l'est). */
  sunElevation: number;
  sunAzimuth: number;
  /** Direction réelle vers la lune (peut pointer sous l'horizon). */
  moonX: number; moonY: number; moonZ: number;
  moonElevation: number;
  moonAzimuth: number;
  /** Fraction éclairée du disque lunaire : 0 = nouvelle lune, 1 = pleine lune. */
  moonPhase: number;
  /** Lune croissante (premier quartier → pleine lune). */
  moonWaxing: boolean;
}

export function createSkyBodies(): SkyBodies {
  return {
    sunX: 0, sunY: 1, sunZ: 0, sunElevation: Math.PI / 2, sunAzimuth: Math.PI,
    moonX: 0, moonY: -1, moonZ: 0, moonElevation: -Math.PI / 2, moonAzimuth: 0,
    moonPhase: 1, moonWaxing: false,
  };
}

/** Jour julien d'une date grégorienne à l'heure `hourUT` (temps universel, peut dépasser 24). */
export function julianDay(year: number, month: number, day: number, hourUT: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5 + hourUT / 24;
}

/** Jour julien d'une heure légale (0..24) à la date donnée, `dayOffset` jours plus tard. */
export function julianDayLocal(date: CalendarDate, localHour: number, dayOffset = 0): number {
  return julianDay(date.year, date.month, date.day + dayOffset, localHour - date.utcOffset);
}

/**
 * Réfraction atmosphérique (degrés) à ajouter à une hauteur vraie (degrés) — formule de Sæmundsson.
 * Elle relève l'astre d'environ 0,5° à l'horizon ; atténuée en douceur sous -1° pour rester continue.
 */
export function refractionDeg(trueElevationDeg: number): number {
  const h = trueElevationDeg < -1 ? -1 : trueElevationDeg;
  let r = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG) / 60;
  if (trueElevationDeg < -1) r *= clamp01(1 + (trueElevationDeg + 1) / 3);
  return r;
}

const sinD = (deg: number): number => Math.sin(deg * DEG);
const cosD = (deg: number): number => Math.cos(deg * DEG);

/**
 * Calcule la position du soleil et de la lune pour un jour julien et un lieu (latitude en degrés,
 * longitude en degrés comptée positivement vers l'est). Écrit dans `out`, sans allocation.
 */
export function computeSkyBodies(jd: number, latitudeDeg: number, longitudeDeg: number, out: SkyBodies): SkyBodies {
  const n = jd - 2451545.0;
  const T = n / 36525;

  // ── temps sidéral local (degrés) ──
  const lst = wrapDeg(280.46061837 + 360.98564736629 * n + longitudeDeg);
  const sinLat = sinD(latitudeDeg);
  const cosLat = cosD(latitudeDeg);

  // ── soleil ──
  const g = 357.528 + 0.9856003 * n;
  const sunLon = 280.46 + 0.9856474 * n + 1.915 * sinD(g) + 0.02 * sinD(2 * g);
  const eps = 23.439 - 0.0000004 * n;
  const sx = cosD(sunLon);
  const sy = cosD(eps) * sinD(sunLon);
  const sz = sinD(eps) * sinD(sunLon);
  horizontal(Math.atan2(sy, sx), Math.asin(clamp(sz, -1, 1)), lst, sinLat, cosLat, 0);
  out.sunX = hX; out.sunY = hY; out.sunZ = hZ;
  out.sunElevation = hElev; out.sunAzimuth = hAz;

  // ── lune ──
  const moonLon = 218.32 + 481267.881 * T
    + 6.29 * sinD(135.0 + 477198.87 * T)
    - 1.27 * sinD(259.3 - 413335.36 * T)
    + 0.66 * sinD(235.7 + 890534.22 * T)
    + 0.21 * sinD(269.9 + 954397.74 * T)
    - 0.19 * sinD(357.5 + 35999.05 * T)
    - 0.11 * sinD(186.5 + 966404.03 * T);
  const moonLat = 5.13 * sinD(93.3 + 483202.02 * T)
    + 0.28 * sinD(228.2 + 960400.89 * T)
    - 0.28 * sinD(318.3 + 6003.15 * T)
    - 0.17 * sinD(217.6 - 407332.21 * T);
  const parallax = 0.9508
    + 0.0518 * cosD(135.0 + 477198.87 * T)
    + 0.0095 * cosD(259.3 - 413335.36 * T)
    + 0.0078 * cosD(235.7 + 890534.22 * T)
    + 0.0028 * cosD(269.9 + 954397.74 * T);
  const cb = cosD(moonLat);
  const ml = cb * cosD(moonLon);
  const mm = 0.9175 * cb * sinD(moonLon) - 0.3978 * sinD(moonLat);
  const mn = 0.3978 * cb * sinD(moonLon) + 0.9175 * sinD(moonLat);
  horizontal(Math.atan2(mm, ml), Math.asin(clamp(mn, -1, 1)), lst, sinLat, cosLat, parallax);
  out.moonX = hX; out.moonY = hY; out.moonZ = hZ;
  out.moonElevation = hElev; out.moonAzimuth = hAz;

  // ── phase : élongation géocentrique lune–soleil ──
  const cosElong = clamp(cb * cosD(moonLon - sunLon), -1, 1);
  out.moonPhase = (1 - cosElong) / 2;
  out.moonWaxing = wrapDeg(moonLon - sunLon) < 180;
  return out;
}

// Résultat de horizontal() (variables de module : pas d'allocation).
let hX = 0;
let hY = 0;
let hZ = 0;
let hElev = 0;
let hAz = 0;

/**
 * Passe des coordonnées équatoriales (ascension droite et déclinaison, rad) au repère du jeu.
 * `parallaxDeg` : parallaxe horizontale (lune), qui abaisse l'astre vu depuis la surface.
 */
function horizontal(ra: number, dec: number, lstDeg: number, sinLat: number, cosLat: number, parallaxDeg: number): void {
  const H = lstDeg * DEG - ra;
  const sinDec = Math.sin(dec);
  const cosDec = Math.cos(dec);
  const east = -cosDec * Math.sin(H);
  const north = cosLat * sinDec - sinLat * cosDec * Math.cos(H);
  const up = clamp(sinLat * sinDec + cosLat * cosDec * Math.cos(H), -1, 1);
  let elevDeg = Math.asin(up) / DEG;
  if (parallaxDeg !== 0) elevDeg -= parallaxDeg * Math.cos(elevDeg * DEG);
  elevDeg += refractionDeg(elevDeg);
  const elev = clamp(elevDeg, -90, 90) * DEG;
  const az = Math.atan2(east, north);
  const ce = Math.cos(elev);
  hX = Math.sin(az) * ce;       // est
  hY = Math.sin(elev);          // haut
  hZ = -Math.cos(az) * ce;      // sud = -nord
  hElev = elev;
  hAz = az < 0 ? az + Math.PI * 2 : az;
}

export interface SunTimes {
  /** Heures légales (0..24) ; NaN si le soleil ne se lève ou ne se couche pas ce jour-là. */
  sunrise: number;
  sunset: number;
  /** Heure de la culmination et hauteur atteinte (rad). */
  noon: number;
  noonElevation: number;
}

/** Lever, coucher (bord supérieur du disque : hauteur apparente du centre = -0,27°) et culmination du soleil. */
export function computeSunTimes(date: CalendarDate, latitudeDeg: number, longitudeDeg: number): SunTimes {
  const tmp = createSkyBodies();
  const limit = -0.27 * DEG;
  const elevAt = (hour: number): number =>
    computeSkyBodies(julianDayLocal(date, hour), latitudeDeg, longitudeDeg, tmp).sunElevation;
  const refine = (a: number, b: number): number => {
    // bissection sur le passage de la hauteur limite
    let lo = a;
    let hi = b;
    const rising = elevAt(a) < limit;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if ((elevAt(mid) < limit) === rising) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  let sunrise = NaN;
  let sunset = NaN;
  let noon = 12;
  let best = -Infinity;
  const step = 1 / 12;
  let prev = elevAt(0);
  for (let h = step; h <= 24 + 1e-9; h += step) {
    const e = elevAt(h);
    if (prev < limit && e >= limit) sunrise = refine(h - step, h);
    if (prev >= limit && e < limit) sunset = refine(h - step, h);
    if (e > best) {
      best = e;
      noon = h;
    }
    prev = e;
  }
  // culmination affinée par recherche ternaire autour du meilleur échantillon
  let lo = noon - step;
  let hi = noon + step;
  for (let i = 0; i < 30; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (elevAt(m1) < elevAt(m2)) lo = m1;
    else hi = m2;
  }
  noon = (lo + hi) / 2;
  return { sunrise, sunset, noon, noonElevation: elevAt(noon) };
}
