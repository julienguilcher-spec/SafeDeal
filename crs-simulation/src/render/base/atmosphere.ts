/* =====================================================================================
 * Modèle d'atmosphère : à partir de la hauteur du soleil, de la lune et de la météo, calcule les
 * couleurs du ciel, la lumière directe (soleil ou lune), la lumière d'ambiance, le brouillard et
 * l'exposition. Logique pure (aucun Three.js) : testable sous Node, sans allocation par image.
 *
 * Toutes les couleurs sont LINÉAIRES et « référées à la scène » : 1,0 ≈ une surface blanche en
 * plein soleil. Le tone mapping filmique du renderer se charge de la restitution.
 * ===================================================================================== */

import type { EnvState } from '@/core/contracts';
import { DEG, clamp, clamp01, lerp, luminance, smoothstep } from './util';

export interface AtmosphereInput {
  /** Direction réelle vers le soleil (unitaire, peut pointer sous l'horizon) et sa hauteur en degrés. */
  sunX: number; sunY: number; sunZ: number;
  sunElevDeg: number;
  /** Direction réelle vers la lune, hauteur en degrés, fraction éclairée 0..1. */
  moonX: number; moonY: number; moonZ: number;
  moonElevDeg: number;
  moonPhase: number;
  /** Météo (EnvState). */
  clouds: number;
  fog: number;
  rain: number;
  /** Éclat des éclairs 0..1. */
  lightning: number;
  /** Éclairage public 0..1 (lissé). */
  streetLights: number;
}

export interface Atmosphere {
  /** Dégradé du ciel : zénith, horizon côté opposé au soleil, horizon côté soleil. */
  zenith: Float32Array;
  horizon: Float32Array;
  horizonSun: Float32Array;
  /** Couleur du brouillard atmosphérique (= brume d'horizon du ciel) et du « sol » sous l'horizon. */
  fogColor: Float32Array;
  ground: Float32Array;
  /** Disque solaire (HDR) et halo autour du soleil. */
  sunDisc: Float32Array;
  sunGlow: Float32Array;
  /** Disque lunaire et force de son halo. */
  moonColor: Float32Array;
  moonGlow: number;
  /** Lumière directionnelle : direction VERS l'astre (relevée au-dessus de l'horizon), couleur, intensité. */
  lightX: number; lightY: number; lightZ: number;
  lightColor: Float32Array;
  lightIntensity: number;
  lightIsMoon: boolean;
  /** Lumière d'hémisphère : couleur du ciel et du sol (niveau compris), intensité. */
  hemiSky: Float32Array;
  hemiGround: Float32Array;
  hemiIntensity: number;
  /** Exposition du tone mapping. */
  exposure: number;
  /** Visibilité des étoiles 0..1 et niveau de nuit 0..1. */
  stars: number;
  night: number;
  /** Nuages : couleur éclairée, couleur à l'ombre. */
  cloudLit: Float32Array;
  cloudShade: Float32Array;
  /** Épaisseur de la brume d'horizon (échelle de hauteur en sinus de la hauteur angulaire). */
  haze: number;
  /** Luminosité générale du ciel 0 (nuit) … 1 (jour). */
  dayLevel: number;
  /** Décroissance en hauteur de la lueur chaude côté soleil (grand = bande serrée sur l'horizon). */
  warmFalloff: number;
  /** Couleur moyenne du ciel (pour de faux reflets sur sol mouillé). */
  skyReflect: Float32Array;
  /** Noirceur des nuages 0..1 (pluie forte, orage) : accentue le modelé du ciel bouché. */
  storm: number;
}

export function createAtmosphere(): Atmosphere {
  const v = (): Float32Array => new Float32Array(3);
  return {
    zenith: v(), horizon: v(), horizonSun: v(), fogColor: v(), ground: v(), sunDisc: v(), sunGlow: v(),
    moonColor: v(), moonGlow: 0, lightX: 0, lightY: 1, lightZ: 0, lightColor: v(), lightIntensity: 0,
    lightIsMoon: false, hemiSky: v(), hemiGround: v(), hemiIntensity: 1, exposure: 1, stars: 0, night: 0,
    cloudLit: v(), cloudShade: v(), haze: 0.05, dayLevel: 1, warmFalloff: 5, skyReflect: v(), storm: 0,
  };
}

// ───────────────────────────── palettes par hauteur du soleil ─────────────────────────────

/** Hauteurs du soleil (degrés) des points de contrôle. */
const KEYS = new Float32Array([-18, -9, -5, -2, 0, 3, 7, 15, 30, 60]);

const ZENITH = new Float32Array([
  0.0025, 0.004, 0.011,
  0.006, 0.011, 0.034,
  0.017, 0.035, 0.105,
  0.04, 0.085, 0.24,
  0.065, 0.135, 0.36,
  0.08, 0.175, 0.45,
  0.09, 0.2, 0.52,
  0.095, 0.22, 0.58,
  0.095, 0.23, 0.62,
  0.09, 0.225, 0.64,
]);

/** Horizon à l'opposé du soleil : rose-mauve au couchant (ceinture de Vénus), bleu pâle le jour. */
const HORIZON = new Float32Array([
  0.01, 0.011, 0.018,
  0.022, 0.028, 0.055,
  0.07, 0.078, 0.14,
  0.18, 0.18, 0.27,
  0.3, 0.3, 0.4,
  0.42, 0.45, 0.55,
  0.52, 0.57, 0.68,
  0.56, 0.66, 0.8,
  0.58, 0.71, 0.88,
  0.56, 0.7, 0.9,
]);

/** Horizon du côté du soleil : braise au crépuscule, or au couchant, bleu pâle le jour. */
const HORIZON_SUN = new Float32Array([
  0.01, 0.011, 0.018,
  0.07, 0.035, 0.04,
  0.4, 0.15, 0.065,
  0.82, 0.34, 0.1,
  0.9, 0.44, 0.13,
  0.9, 0.55, 0.2,
  0.86, 0.66, 0.36,
  0.82, 0.78, 0.66,
  0.66, 0.75, 0.86,
  0.58, 0.71, 0.9,
]);

/** Teinte de la lumière directe du soleil (rougie par l'épaisseur d'atmosphère traversée). */
const SUN_COLOR = new Float32Array([
  1, 0.24, 0.05,
  1, 0.26, 0.06,
  1, 0.28, 0.07,
  1, 0.32, 0.09,
  1, 0.4, 0.14,
  1, 0.5, 0.2,
  1, 0.6, 0.3,
  1, 0.78, 0.54,
  1, 0.92, 0.8,
  1, 0.96, 0.9,
]);

/** Intensité de la lumière directe du soleil selon sa hauteur (degrés → unités Three.js). */
const SUN_INTENSITY_KEYS = new Float32Array([-3, -1, 0, 3, 7, 15, 30, 60]);
const SUN_INTENSITY = new Float32Array([0, 0.14, 0.55, 1.6, 2.35, 2.75, 3.0, 3.2]);

const tmpA = new Float32Array(3);
const tmpB = new Float32Array(3);
const grey = new Float32Array(3);

function sampleRamp(keys: Float32Array, table: Float32Array, x: number, out: Float32Array): void {
  const n = keys.length;
  if (x <= keys[0]!) {
    out[0] = table[0]!; out[1] = table[1]!; out[2] = table[2]!;
    return;
  }
  if (x >= keys[n - 1]!) {
    const o = (n - 1) * 3;
    out[0] = table[o]!; out[1] = table[o + 1]!; out[2] = table[o + 2]!;
    return;
  }
  let i = 0;
  while (i < n - 2 && x > keys[i + 1]!) i++;
  const t = (x - keys[i]!) / (keys[i + 1]! - keys[i]!);
  const a = i * 3;
  const b = a + 3;
  out[0] = table[a]! + (table[b]! - table[a]!) * t;
  out[1] = table[a + 1]! + (table[b + 1]! - table[a + 1]!) * t;
  out[2] = table[a + 2]! + (table[b + 2]! - table[a + 2]!) * t;
}

function sampleScalar(keys: Float32Array, values: Float32Array, x: number): number {
  const n = keys.length;
  if (x <= keys[0]!) return values[0]!;
  if (x >= keys[n - 1]!) return values[n - 1]!;
  let i = 0;
  while (i < n - 2 && x > keys[i + 1]!) i++;
  const t = (x - keys[i]!) / (keys[i + 1]! - keys[i]!);
  return values[i]! + (values[i + 1]! - values[i]!) * t;
}

function mix3(out: Float32Array, r: number, g: number, b: number, t: number): void {
  out[0] = out[0]! + (r - out[0]!) * t;
  out[1] = out[1]! + (g - out[1]!) * t;
  out[2] = out[2]! + (b - out[2]!) * t;
}

function set3(out: Float32Array, r: number, g: number, b: number): void {
  out[0] = r; out[1] = g; out[2] = b;
}

/** Intensité de la lumière directe du soleil (ciel dégagé) pour une hauteur en degrés. */
export function sunIntensityAt(elevDeg: number): number {
  return sampleScalar(SUN_INTENSITY_KEYS, SUN_INTENSITY, elevDeg);
}

/** Part du soleil masquée par les nuages 0..1 pour une couverture donnée. */
export function cloudOcclusion(clouds: number): number {
  return smoothstep(0.4, 0.95, clouds);
}

/** Hauteur minimale de la lumière directionnelle : rasante, jamais sous le sol. */
const MIN_LIGHT_ELEVATION = 2.5 * DEG;
const MIN_LIGHT_Y = Math.sin(MIN_LIGHT_ELEVATION);
const MIN_LIGHT_H = Math.cos(MIN_LIGHT_ELEVATION);

/** Calcule toute l'atmosphère. Écrit dans `out` (aucune allocation). */
export function computeAtmosphere(inp: AtmosphereInput, out: Atmosphere): Atmosphere {
  const elev = inp.sunElevDeg;
  const clouds = clamp01(inp.clouds);
  const fog = clamp01(inp.fog);
  const rain = clamp01(inp.rain);
  const street = clamp01(inp.streetLights);

  // ── grandeurs de base ──
  const dayLevel = smoothstep(-9, 3, elev);          // luminosité générale du ciel
  const dayAmb = smoothstep(-10, 6, elev);           // lumière d'ambiance reçue au sol (l'œil s'adapte au couchant)
  const night = smoothstep(-4, -13, elev);
  const cover = smoothstep(0.55, 1, clouds);         // 0 = ciel dégagé … 1 = bouché
  const thickLin = cover * (0.25 + 0.75 * rain);
  const thick = thickLin * thickLin;                 // noirceur des nuages de pluie (l'orage est plombé)
  const occl = cloudOcclusion(clouds);
  out.dayLevel = dayLevel;
  out.night = night;
  out.warmFalloff = lerp(9, 3.2, smoothstep(-2, 14, elev));
  out.storm = thick;

  // ── ciel dégagé ──
  sampleRamp(KEYS, ZENITH, elev, out.zenith);
  sampleRamp(KEYS, HORIZON, elev, out.horizon);
  sampleRamp(KEYS, HORIZON_SUN, elev, out.horizonSun);
  // halo de la ville la nuit : l'horizon n'est jamais noir au-dessus de Paris
  const glow = night * (0.6 + 0.4 * street);
  out.horizon[0]! += 0.03 * glow; out.horizon[1]! += 0.02 * glow; out.horizon[2]! += 0.012 * glow;
  out.horizonSun[0]! += 0.03 * glow; out.horizonSun[1]! += 0.02 * glow; out.horizonSun[2]! += 0.012 * glow;

  // ── ciel couvert : gris clair le jour, plombé sous la pluie, brun orangé la nuit (reflet de la ville) ──
  const dim = 1 - 0.78 * thick;
  set3(grey,
    lerp(0.032 + 0.02 * street, 0.6 * dim, dayLevel),
    lerp(0.026 + 0.014 * street, 0.63 * dim, dayLevel),
    lerp(0.024 + 0.008 * street, 0.68 * dim, dayLevel));
  // au couchant, un ciel couvert garde une trace de chaleur du côté du soleil
  const warm = cover * smoothstep(12, 1, elev) * smoothstep(-6, -1, elev) * 0.35;
  mix3(out.zenith, grey[0]! * 0.82, grey[1]! * 0.82, grey[2]! * 0.82, cover);
  mix3(out.horizon, grey[0]! * 1.05, grey[1]! * 1.05, grey[2]! * 1.05, cover);
  mix3(out.horizonSun, grey[0]! * (1.12 + warm), grey[1]! * (1.1 + warm * 0.45), grey[2]! * 1.05, cover * 0.94);

  // ── brouillard : tout le ciel tend vers un voile laiteux ──
  const veilLevel = lerp(0.05 + 0.035 * street, 0.7, dayLevel);
  const veil = fog * 0.92;
  mix3(out.zenith, veilLevel * 0.94, veilLevel * 0.96, veilLevel, veil);
  mix3(out.horizon, veilLevel, veilLevel * 1.01, veilLevel * 1.02, veil);
  mix3(out.horizonSun, veilLevel * 1.08, veilLevel * 1.05, veilLevel, veil);

  // ── brume d'horizon et brouillard de scène : même couleur, pour que le lointain se fonde dans le ciel ──
  const f = out.fogColor;
  f[0] = lerp(out.horizon[0]!, out.horizonSun[0]!, 0.3);
  f[1] = lerp(out.horizon[1]!, out.horizonSun[1]!, 0.3);
  f[2] = lerp(out.horizon[2]!, out.horizonSun[2]!, 0.3);
  const wetDim = 1 - 0.18 * rain;
  f[0]! *= wetDim; f[1]! *= wetDim; f[2]! *= wetDim;
  set3(out.ground, f[0]! * 0.55, f[1]! * 0.55, f[2]! * 0.55);
  out.haze = lerp(lerp(0.05, 0.14, rain), 3.5, Math.pow(fog, 1.5));

  // ── lumière directe : soleil, puis lune quand le crépuscule s'achève ──
  sampleRamp(KEYS, SUN_COLOR, elev, tmpA);
  const through = (1 - 0.93 * occl) * (1 - 0.82 * fog);
  const sunI = sunIntensityAt(elev) * through;
  const moonUp = smoothstep(0, 10, inp.moonElevDeg);
  const phaseK = 0.06 + 0.94 * inp.moonPhase * inp.moonPhase;
  const moonI = 0.55 * phaseK * moonUp * smoothstep(-3, -8, elev) * (1 - 0.85 * occl) * (1 - 0.82 * fog);
  let lx: number;
  let ly: number;
  let lz: number;
  if (elev > -3) {
    out.lightIsMoon = false;
    out.lightIntensity = sunI;
    set3(out.lightColor, tmpA[0]!, tmpA[1]!, tmpA[2]!);
    lx = inp.sunX; ly = inp.sunY; lz = inp.sunZ;
  } else {
    out.lightIsMoon = true;
    out.lightIntensity = moonI;
    set3(out.lightColor, 0.62, 0.74, 1);
    if (inp.moonElevDeg > 0) {
      lx = inp.moonX; ly = inp.moonY; lz = inp.moonZ;
    } else {
      lx = 0.2; ly = 0.96; lz = 0.2;
    }
  }
  if (ly < MIN_LIGHT_Y) {
    const h = Math.hypot(lx, lz);
    const k = h > 1e-6 ? MIN_LIGHT_H / h : 0;
    lx = h > 1e-6 ? lx * k : MIN_LIGHT_H;
    lz *= k;
    ly = MIN_LIGHT_Y;
  }
  out.lightX = lx; out.lightY = ly; out.lightZ = lz;

  // ── disque et halo du soleil ──
  const discVisible = smoothstep(-1.6, -0.2, elev) * (1 - fog) * (1 - fog);
  set3(out.sunDisc, tmpA[0]! * 60 * discVisible, tmpA[1]! * 60 * discVisible, tmpA[2]! * 60 * discVisible);
  const glowK = lerp(0.26, 0.62, smoothstep(16, 1, elev)) * smoothstep(-7, -1, elev) * (1 - 0.55 * cover) * (1 - 0.5 * fog);
  set3(out.sunGlow, tmpA[0]! * glowK, tmpA[1]! * glowK, tmpA[2]! * glowK);

  // ── lune ──
  const moonSeen = smoothstep(-1.5, 2, inp.moonElevDeg) * lerp(0.22, 1, night) * (1 - 0.7 * fog);
  set3(out.moonColor, 0.86 * moonSeen, 0.88 * moonSeen, 0.92 * moonSeen);
  out.moonGlow = 0.07 * night * inp.moonPhase * moonUp;

  // ── lumière d'ambiance (hémisphère) ──
  // niveau : le ciel couvert devient la source principale ; la pluie et l'orage l'assombrissent
  let level = lerp(0.14, 0.95, dayAmb) * (1 + 0.7 * cover * dayAmb) * (1 - 0.55 * thick * dayAmb);
  level *= 1 - 0.12 * fog;
  // soleil bas par ciel dégagé : le ciel éclaire moins, la lumière dorée du soleil domine
  level *= 1 - 0.28 * smoothstep(-1, 3, elev) * smoothstep(16, 6, elev) * (1 - cover);
  // teinte : moyenne du ciel, ramenée à la luminance voulue
  const hs = out.hemiSky;
  hs[0] = out.zenith[0]! * 0.5 + out.horizon[0]! * 0.5;
  hs[1] = out.zenith[1]! * 0.5 + out.horizon[1]! * 0.5;
  hs[2] = out.zenith[2]! * 0.5 + out.horizon[2]! * 0.5;
  // on désature : le bleu pur du zénith donnerait des ombres trop froides
  const lum = Math.max(1e-5, luminance(hs[0]!, hs[1]!, hs[2]!));
  const sat = lerp(0.62, 0.5, night);
  hs[0] = lerp(lum, hs[0]!, sat) / lum * level;
  hs[1] = lerp(lum, hs[1]!, sat) / lum * level;
  hs[2] = lerp(lum, hs[2]!, sat) / lum * level;
  // éclairage public : une ambiance chaude qui rend la nuit lisible
  const lamp = street * lerp(0.35, 1, night);
  hs[0]! += 0.105 * lamp; hs[1]! += 0.08 * lamp; hs[2]! += 0.052 * lamp;
  // sol : rebond chaud de la pierre et du bitume ; la nuit, le halo des candélabres
  const bounce = level * 0.5 + sunI * 0.05;
  set3(out.hemiGround, 0.92 * bounce + 0.12 * lamp, 0.84 * bounce + 0.085 * lamp, 0.74 * bounce + 0.05 * lamp);
  out.hemiIntensity = 1;

  // ── éclairs : tout s'illumine un instant ──
  const flash = clamp01(inp.lightning);
  if (flash > 0) {
    hs[0]! += 0.8 * flash; hs[1]! += 0.86 * flash; hs[2]! += 1.05 * flash;
    out.hemiGround[0]! += 0.25 * flash; out.hemiGround[1]! += 0.28 * flash; out.hemiGround[2]! += 0.34 * flash;
  }

  // ── reflet du ciel sur les surfaces mouillées ──
  set3(out.skyReflect,
    out.zenith[0]! * 0.35 + out.horizon[0]! * 0.65, out.zenith[1]! * 0.35 + out.horizon[1]! * 0.65, out.zenith[2]! * 0.35 + out.horizon[2]! * 0.65);

  // ── exposition : l'œil (ou l'appareil) s'ouvre quand la lumière baisse ──
  const dayExp = smoothstep(-8, 6, elev);
  out.exposure = lerp(1.62, 1, dayExp) * (1 + 0.16 * cover * dayExp) * (1 + 0.1 * fog * dayExp);

  // ── étoiles ──
  out.stars = night * (1 - cover) * clamp01(1 - 1.6 * fog);

  // ── nuages ──
  // en altitude le soleil est encore haut quand il rase le sol : les nuages s'embrasent au couchant
  sampleRamp(KEYS, SUN_COLOR, elev + 2, tmpB);
  const cloudSun = sunIntensityAt(elev + 5) / 3.2;
  const lit = out.cloudLit;
  set3(lit,
    tmpB[0]! * cloudSun * 0.98 + hs[0]! * 0.2 * dayLevel,
    tmpB[1]! * cloudSun * 0.98 + hs[1]! * 0.2 * dayLevel,
    tmpB[2]! * cloudSun * 0.98 + hs[2]! * 0.2 * dayLevel);
  // à l'ombre : gris bleuté le jour, ardoise violacée au couchant (les nuages se découpent sur le ciel clair)
  const shade = out.cloudShade;
  const shadeLevel = dayLevel * lerp(0.34, 1, smoothstep(0, 16, elev));
  set3(shade, 0.36 * shadeLevel, 0.4 * shadeLevel, 0.5 * shadeLevel);
  // la nuit : dessous des nuages éclairé par la ville, dessus par la lune
  const cityR = 0.05 + 0.035 * street;
  lit[0]! += night * (cityR + 0.05 * moonI); lit[1]! += night * (cityR * 0.76 + 0.06 * moonI); lit[2]! += night * (cityR * 0.56 + 0.085 * moonI);
  shade[0]! += night * cityR * 0.55; shade[1]! += night * cityR * 0.42; shade[2]! += night * cityR * 0.34;
  // ciel bouché : les nuages prennent la teinte du couvercle gris
  mix3(lit, grey[0]! * 1.22, grey[1]! * 1.22, grey[2]! * 1.22, cover * 0.85);
  mix3(shade, grey[0]! * 0.5, grey[1]! * 0.52, grey[2]! * 0.56, cover * 0.9);
  return out;
}

/**
 * Visibilité météorologique (m) : distance à laquelle le brouillard de scène masque presque tout.
 * `clearDistance` est la distance d'affichage par temps clair.
 */
export function visibilityFor(clearDistance: number, fog: number, rain: number): number {
  const inv = 1 / clearDistance + Math.pow(clamp01(fog), 1.3) * Math.max(0, 1 / 55 - 1 / clearDistance) + clamp01(rain) / 520;
  return 1 / inv;
}

/** Densité du brouillard exponentiel (THREE.FogExp2) qui masque ~92 % à la distance de visibilité. */
export function fogDensityFor(visibility: number): number {
  return 1.6 / Math.max(10, visibility);
}

function rrtOdt(v: number): number {
  return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
}

/**
 * Tone mapping filmique ACES, identique à celui du renderer (THREE.ACESFilmicToneMapping).
 * Sert à donner au brouillard de scène — que Three.js applique APRÈS le tone mapping — exactement
 * la couleur qu'aurait le ciel à l'horizon une fois passé par le même tone mapping.
 */
export function toneMapAces(r: number, g: number, b: number, exposure: number, out: Float32Array): void {
  const k = exposure / 0.6;
  r *= k; g *= k; b *= k;
  const ir = rrtOdt(0.59719 * r + 0.35458 * g + 0.04823 * b);
  const ig = rrtOdt(0.076 * r + 0.90834 * g + 0.01566 * b);
  const ib = rrtOdt(0.0284 * r + 0.13383 * g + 0.83777 * b);
  out[0] = clamp01(1.60475 * ir - 0.53108 * ig - 0.07367 * ib);
  out[1] = clamp01(-0.10208 * ir + 1.10813 * ig - 0.00605 * ib);
  out[2] = clamp01(-0.00327 * ir - 0.07276 * ig + 1.07602 * ib);
}

/** Réciproque de smoothstep sur [0, 1]. */
function inverseSmoothstep(v: number): number {
  return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3);
}

/**
 * Sans le service étendu de l'environnement (module absent : environnement neutre), déduit le vrai
 * soleil et la lune du seul état du contrat : la nuit, la direction publiée est celle de la lune et
 * le soleil est supposé à l'opposé, sous l'horizon ; près de l'horizon, où la direction publiée est
 * relevée, on se fie à la lumière du jour pour retrouver la hauteur du soleil.
 */
export function bodiesFromEnvState(env: EnvState, inp: AtmosphereInput): void {
  const y = clamp(env.sunY, -1, 1);
  const elev = Math.asin(y) / DEG;
  // hauteur du soleil d'après la lumière du jour (crépuscule de -7° à +9°)
  const twilight = -7 + 16 * inverseSmoothstep(clamp01(env.daylight));
  if (env.isNight) {
    inp.moonX = env.sunX; inp.moonY = y; inp.moonZ = env.sunZ;
    inp.moonElevDeg = elev;
    inp.sunX = -env.sunX; inp.sunY = -y; inp.sunZ = -env.sunZ;
    inp.sunElevDeg = env.daylight > 0.001 ? Math.min(twilight, -0.5) : Math.min(-7, -elev);
  } else {
    inp.sunX = env.sunX; inp.sunY = y; inp.sunZ = env.sunZ;
    inp.sunElevDeg = env.daylight < 0.999 ? Math.min(Math.max(elev, 0), Math.max(twilight, -2.9)) : elev;
    inp.moonX = -env.sunX; inp.moonY = -y; inp.moonZ = -env.sunZ;
    inp.moonElevDeg = -elev;
  }
  inp.moonPhase = 1;
}
