/* Kit monuments — matériaux PARTAGÉS à textures procédurales, et illumination nocturne.
 * Un matériau est créé à la première demande puis réutilisé par tous les monuments : la fusion par
 * matériau du Builder garantit alors peu d'appels de dessin. Les matériaux « éclairés » portent une
 * émission chaude (projecteurs) dont l'intensité suit setNightLevel(). */
import * as THREE from 'three';
import { mixHex } from './canvas';
import {
  balusterTex, cofferTex, fenceTex, glyphTex, jetTex, latticeTex, marbleTex, metalTex, reliefTex, slateTex, stoneTex,
  waterTex, zincTex, type StoneOpts, type TexPair,
} from './textures';

/** Clés des matériaux fournis par le kit. */
export type KitMat =
  | 'pierre_blonde' | 'pierre_claire' | 'pierre_grise' | 'pierre_doree' | 'pierre_lisse' | 'pierre_lisse_claire'
  | 'bossage_blond' | 'bossage_gris' | 'calcaire_patine' | 'marbre_blanc' | 'marbre_rose' | 'marbre_rouge'
  | 'granit_rose' | 'granit_gris' | 'hieroglyphes' | 'zinc' | 'plomb' | 'ardoise' | 'bronze' | 'bronze_vert'
  | 'bronze_sombre' | 'or' | 'fonte' | 'fer_noir' | 'fer_eiffel' | 'treillis_eiffel' | 'treillis_eiffel_fin'
  | 'verre' | 'eau' | 'jet' | 'caissons' | 'relief_pierre' | 'relief_bronze' | 'balustres' | 'grille'
  | 'grille_doree' | 'flamme' | 'ombre';

export type MatRef = KitMat | (string & {}) | THREE.Material;

/** Couleur des projecteurs nocturnes (blanc chaud). */
export const NIGHT_WARM = 0xffd49c;
/** « Brun Tour Eiffel » (teinte moyenne des trois tons). */
export const BRUN_EIFFEL = 0x7b6349;

interface LitEntry { m: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; base: number; gain: number }

const factories = new Map<string, () => THREE.Material>();
const cache = new Map<string, THREE.Material>();
const lit: LitEntry[] = [];
const scrolling: { tex: THREE.Texture; vx: number; vy: number }[] = [];
const dayTint: { m: THREE.MeshBasicMaterial; day: THREE.Color; night: THREE.Color }[] = [];
let nightLevel = 0;

/** Ombrage des projecteurs : la lumière vient d'en bas, les dessus restent sombres, les faces se distinguent. */
function floodlightPatch(shader: { fragmentShader: string }): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
    {
      vec3 kitN = inverseTransformDirection( normal, viewMatrix );
      float kitUp = clamp( 0.66 - 0.40 * kitN.y, 0.0, 1.0 );
      float kitAz = 0.84 + 0.16 * dot( normalize( kitN.xz + vec2( 1e-4 ) ), vec2( 0.6, 0.8 ) );
      totalEmissiveRadiance *= kitUp * kitAz;
    }`,
  );
}

export interface LitParams extends THREE.MeshStandardMaterialParameters {
  /** Gain d'émission à pleine nuit (0 = n'est pas illuminé). */
  night?: number;
  /** Couleur de l'illumination (par défaut blanc chaud). */
  nightColor?: number;
  /** Émission permanente (dorure qui accroche la lumière, flamme). */
  glow?: number;
}

/** Crée un MeshStandardMaterial du kit, enregistré pour l'illumination nocturne. */
export function litMaterial(name: string, p: LitParams, tex?: TexPair | null): THREE.MeshStandardMaterial {
  const { night = 0, nightColor = NIGHT_WARM, glow = 0, ...params } = p;
  const m = new THREE.MeshStandardMaterial(params);
  m.name = name;
  if (tex) {
    m.map = tex.map;
    if (tex.bump) { m.bumpMap = tex.bump; if (params.bumpScale === undefined) m.bumpScale = 1.5; }
  }
  if (night > 0 || glow > 0) {
    m.emissive = new THREE.Color(nightColor);
    if (m.map) m.emissiveMap = m.map; else m.emissive.multiply(m.color);
    m.emissiveIntensity = glow + night * nightLevel;
    m.onBeforeCompile = floodlightPatch;
    m.customProgramCacheKey = () => 'kit-floodlight';
    lit.push({ m, base: glow, gain: night });
  }
  return m;
}

/** Déclare (ou remplace si `override`) la fabrique d'un matériau nommé. Les monuments peuvent ajouter les leurs. */
export function defineMaterial(key: string, make: () => THREE.Material, override = false): void {
  if (factories.has(key) && !override) return;
  factories.set(key, make);
}

/** Matériau partagé du kit (créé à la première demande). */
export function mat(key: MatRef): THREE.Material {
  if (typeof key !== 'string') return key;
  let m = cache.get(key);
  if (m) return m;
  const f = factories.get(key);
  if (!f) throw new Error(`[monuments] matériau inconnu : ${key}`);
  m = f();
  if (!m.name) m.name = key;
  cache.set(key, m);
  return m;
}

/** Niveau d'illumination nocturne 0 (jour) … 1 (nuit) : règle l'émission de tous les matériaux éclairés. */
export function setNightLevel(level: number): void {
  nightLevel = Math.max(0, Math.min(1, level));
  for (let i = 0; i < lit.length; i++) {
    const e = lit[i];
    (e.m as THREE.MeshStandardMaterial).emissiveIntensity = e.base + e.gain * nightLevel;
  }
  for (let i = 0; i < dayTint.length; i++) dayTint[i].m.color.copy(dayTint[i].day).lerp(dayTint[i].night, nightLevel);
}

export function getNightLevel(): number { return nightLevel; }

/** Fait défiler les textures animées (eau, jets). À appeler chaque image avec le temps réel. */
export function tickMaterials(time: number): void {
  for (let i = 0; i < scrolling.length; i++) {
    const s = scrolling[i];
    s.tex.offset.set((time * s.vx) % 1, (time * s.vy) % 1);
  }
}

/** Libère tous les matériaux et textures du kit (fin de partie, tests). */
export function disposeKitMaterials(): void {
  for (const m of cache.values()) {
    const s = m as THREE.MeshStandardMaterial;
    s.map?.dispose(); s.bumpMap?.dispose(); s.alphaMap?.dispose();
    m.dispose();
  }
  cache.clear(); lit.length = 0; scrolling.length = 0; dayTint.length = 0;
}

// ───────────────────────────── fabriques ─────────────────────────────

/** Teinte de repli quand aucune texture n'est disponible (tests sous Node). */
const fallbackColors = new Map<string, number>();

function finalize(m: THREE.MeshStandardMaterial, key: string): THREE.MeshStandardMaterial {
  if (!m.map) { const c = fallbackColors.get(key); if (c !== undefined) m.color.setHex(c); }
  return m;
}

function def(key: string, color: number, make: () => THREE.MeshStandardMaterial): void {
  fallbackColors.set(key, color);
  defineMaterial(key, () => finalize(make(), key));
}

function stone(key: string, tint: number, joint: 'taille' | 'bossage' | 'lisse', extra: Partial<StoneOpts> = {}, night = 0.85): void {
  def(key, tint, () => litMaterial(key, { color: 0xffffff, roughness: 0.92, metalness: 0, night, bumpScale: joint === 'bossage' ? 3.2 : 1.6 },
    stoneTex({ tint, joint, ...extra })));
}

const P_BLONDE = 0xe0cfa8, P_CLAIRE = 0xe9dfc6, P_GRISE = 0xc2baa8, P_DOREE = 0xe2ca98;

stone('pierre_blonde', P_BLONDE, 'taille', { seed: 1 });
stone('pierre_claire', P_CLAIRE, 'taille', { seed: 2 });
stone('pierre_grise', P_GRISE, 'taille', { seed: 3, streaks: 14 });
stone('pierre_doree', P_DOREE, 'taille', { seed: 4, courses: 5, perRow: 2 });
stone('pierre_lisse', P_BLONDE, 'lisse', { seed: 5 });
stone('pierre_lisse_claire', P_CLAIRE, 'lisse', { seed: 6 });
stone('bossage_blond', mixHex(P_BLONDE, 0x000000, 0.04), 'bossage', { seed: 7, courses: 5, perRow: 2 });
stone('bossage_gris', P_GRISE, 'bossage', { seed: 8, courses: 5, perRow: 2 });
stone('calcaire_patine', 0xb3ab97, 'taille', { seed: 9, streaks: 30, streakColor: 0x2e2b26 });
stone('granit_gris', 0x9a9892, 'taille', { seed: 10, courses: 4, perRow: 2 });
stone('granit_rose', 0xb88a7c, 'lisse', { seed: 12 });

def('marbre_blanc', 0xe9e6de, () => litMaterial('marbre_blanc', { roughness: 0.55, night: 0.85 }, marbleTex(0xece9e2, 0x9a9690, 3)));
def('marbre_rose', 0xd9b3a2, () => litMaterial('marbre_rose', { roughness: 0.5, night: 0.8 }, marbleTex(0xdcb8a8, 0x9c6f66, 4)));
def('marbre_rouge', 0x8e4a3c, () => litMaterial('marbre_rouge', { roughness: 0.45, night: 0.7 }, marbleTex(0x93503f, 0xd8b9a6, 5)));
def('hieroglyphes', 0xb98474, () => litMaterial('hieroglyphes', { roughness: 0.8, night: 0.9, bumpScale: 2 }, glyphTex()));
def('zinc', 0x8f999d, () => litMaterial('zinc', { roughness: 0.55, metalness: 0.35, night: 0.25, bumpScale: 2 }, zincTex(0x8f999d, 5)));
def('plomb', 0x6c767b, () => litMaterial('plomb', { roughness: 0.6, metalness: 0.3, night: 0.3, bumpScale: 2 }, zincTex(0x6c767b, 6)));
def('ardoise', 0x3e4651, () => litMaterial('ardoise', { roughness: 0.7, metalness: 0.1, night: 0.2, bumpScale: 1.5 }, slateTex()));
def('bronze', 0x5a4630, () => litMaterial('bronze', { roughness: 0.48, metalness: 0.35, night: 0.9 }, metalTex(0x5c4832, 0x4d6a58, 0.45, 0x2a2118, 0.12, 61)));
def('bronze_vert', 0x5d8a7a, () => litMaterial('bronze_vert', { roughness: 0.62, metalness: 0.2, night: 0.85 }, metalTex(0x5d8a7a, 0x3d5148, 0.55, 0xa8d2c2, 0.16, 62)));
def('bronze_sombre', 0x33302a, () => litMaterial('bronze_sombre', { roughness: 0.45, metalness: 0.4, night: 0.9 }, metalTex(0x37332b, 0x44584c, 0.4, 0x15130f, 0.12, 63)));
def('or', 0xd8ab33, () => litMaterial('or', { roughness: 0.3, metalness: 0.45, night: 1.0, glow: 0.22, nightColor: 0xffd27a }, metalTex(0xdcae36, 0xf2d476, 0.5, 0x9a6f14, 0.08, 64)));
def('fonte', 0x3a4f43, () => litMaterial('fonte', { roughness: 0.5, metalness: 0.2, night: 0.9 }, metalTex(0x3c5246, 0x263830, 0.5, 0x141d18, 0.12, 65)));
def('fer_noir', 0x1c1d1e, () => litMaterial('fer_noir', { roughness: 0.55, metalness: 0.4, night: 0.3 }, metalTex(0x1e1f20, 0x2c2a27, 0.4, 0x000000, 0.1, 66)));
def('fer_eiffel', BRUN_EIFFEL, () => litMaterial('fer_eiffel', { roughness: 0.6, metalness: 0.25, night: 3.0, nightColor: 0xffd488, glow: 0.1 }, metalTex(BRUN_EIFFEL, mixHex(BRUN_EIFFEL, 0x2c2218, 0.6), 0.4, 0x2a2018, 0.08, 67, 3)));
def('caissons', P_CLAIRE, () => litMaterial('caissons', { roughness: 0.9, night: 0.95, bumpScale: 4 }, cofferTex(P_DOREE, 17, 1)));
def('relief_pierre', P_BLONDE, () => litMaterial('relief_pierre', { roughness: 0.9, night: 0.9, bumpScale: 3 }, reliefTex(P_DOREE, 21)));
def('relief_bronze', 0x5a4630, () => litMaterial('relief_bronze', { roughness: 0.5, metalness: 0.35, night: 0.9, bumpScale: 3 }, reliefTex(0x66513a, 22)));
def('ombre', 0x15140f, () => litMaterial('ombre', { color: 0x15140f, roughness: 1 }));
def('verre', 0x1d2730, () => litMaterial('verre', { color: 0x1d2730, roughness: 0.12, metalness: 0.6, night: 2.2, nightColor: 0xffd59a }));
def('flamme', 0xffa030, () => litMaterial('flamme', { color: 0xff9a2e, roughness: 1, glow: 2.2, nightColor: 0xff9a2e }));

function alphaMat(key: string, color: number, tex: THREE.Texture | null, alphaTest: number, extra: LitParams = {}): THREE.MeshStandardMaterial {
  const m = litMaterial(key, { color: tex ? 0xffffff : color, roughness: 0.6, metalness: 0.25, side: THREE.DoubleSide, alphaTest: tex ? alphaTest : 0, ...extra },
    tex ? { map: tex, bump: null } : null);
  m.userData.cutout = true;
  return m;
}

defineMaterial('treillis_eiffel', () => alphaMat('treillis_eiffel', BRUN_EIFFEL, latticeTex({ color: BRUN_EIFFEL, bar: 0.085, sub: 2 }), 0.3, { night: 3.0, nightColor: 0xffd488, glow: 0.1 }));
defineMaterial('treillis_eiffel_fin', () => alphaMat('treillis_eiffel_fin', BRUN_EIFFEL, latticeTex({ color: BRUN_EIFFEL, bar: 0.06, sub: 4, seed: 43 }), 0.3, { night: 3.0, nightColor: 0xffd488, glow: 0.1 }));
defineMaterial('balustres', () => alphaMat('balustres', P_CLAIRE, balusterTex(P_CLAIRE), 0.5, { roughness: 0.9, metalness: 0, night: 0.85 }));
defineMaterial('grille', () => alphaMat('grille', 0x1b1c1d, fenceTex(0x1b1c1d, false), 0.5, { night: 0.3 }));
defineMaterial('grille_doree', () => alphaMat('grille_doree', 0x1b1c1d, fenceTex(0x1b1c1d, true), 0.5, { night: 0.6 }));

defineMaterial('eau', () => {
  const t = waterTex();
  const m = new THREE.MeshStandardMaterial({ color: t ? 0xffffff : 0x4a7078, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.86, depthWrite: false });
  m.name = 'eau';
  if (t) {
    m.map = t.map; m.bumpMap = t.bump; m.bumpScale = 1.2;
    scrolling.push({ tex: t.map, vx: 0.012, vy: 0.02 });
    if (t.bump) scrolling.push({ tex: t.bump, vx: 0.012, vy: 0.02 });
  }
  m.emissive = new THREE.Color(0x9fd0d8); if (m.map) m.emissiveMap = m.map;
  m.emissiveIntensity = 0;
  lit.push({ m, base: 0, gain: 0.5 });
  m.userData.shadow = false;
  return m;
});

defineMaterial('jet', () => {
  const t = jetTex();
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: t ? 0.8 : 0.3, depthWrite: false, side: THREE.DoubleSide, fog: true });
  m.name = 'jet';
  if (t) { m.map = t; scrolling.push({ tex: t, vx: 0, vy: -0.9 }); }
  dayTint.push({ m, day: new THREE.Color(0xf4fbff), night: new THREE.Color(0xb89a6a) });
  m.userData.shadow = false;
  return m;
});

/** Taille réelle (m) du motif d'un matériau : [largeur, hauteur]. [1, 1] si le matériau n'a pas de texture répétée. */
export function tileOf(key: MatRef): [number, number] {
  const m = mat(key) as THREE.MeshStandardMaterial;
  const t = m.map;
  if (!t || t.repeat.x === 0 || t.repeat.y === 0) return [1, 1];
  return [1 / t.repeat.x, 1 / t.repeat.y];
}
