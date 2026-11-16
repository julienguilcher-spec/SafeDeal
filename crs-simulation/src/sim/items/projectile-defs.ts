/* =====================================================================================
 * PARAMÈTRES PHYSIQUES DES PROJECTILES et constantes d'effet.
 *
 * Sources (niveau gameplay) : docs/research/02-materiel-tenues-vehicules.md §3 et
 * 00-bible-realisme.md §B. Masses et dimensions : valeurs des fiches ; coefficients de traînée :
 * k = ½ · ρ · Cx · S / m (ρ = 1,2 kg/m³), arrondis ; rebonds et roulements : estimations.
 *   - grenade de 56 mm : Ø 0,056 × 0,199 m, 340 g ; grenade assourdissante-lacrymogène : 150 g ;
 *     désencerclement : 248 g, retard 1,5 s, 18 plots de 9,3 g à ≈ 126 km/h, rayon utile 7 à 10 m ;
 *   - balle de défense de 40 mm : ≈ 92 m/s à la bouche, ≈ 84 J à 40 m → masse 41 g, k = 0,0094 ;
 *   - palet : émission 30 s ; six palets par grenade ; nuage cumulé ≈ 800 m² ;
 *   - pavé : 1 à 3 kg ; engin incendiaire : nappe de Ø 2 à 3 m ; mortier : portée 30 à 60 m ;
 *   - fumigène : 60 s de fumée ; fusée rouge : apogée ≈ 80 m, visible 6 s.
 * ===================================================================================== */

import type { DamageKind, ForceMeans, ItemId, ProjectileKind } from '@/core/contracts';
import type { ContactAction, FuseAction, ProjectileClass, ProjectileSpec } from './api';

interface SpecOptions {
  cls: ProjectileClass;
  mass: number;
  radius: number;
  drag: number;
  restitution?: number;
  friction?: number;
  roll?: number;
  fuse?: number;
  fuseAction?: FuseAction;
  onGround?: ContactAction;
  onWall?: ContactAction;
  onPerson?: ContactAction;
  damageBase?: number;
  damagePerJoule?: number;
  headFactor?: number;
  legFactor?: number;
  damageKind?: DamageKind;
  stunBase?: number;
  stunPerDamage?: number;
  lifetime?: number;
  pickable?: boolean;
  spinRate?: number;
  means?: ForceMeans;
  item?: ItemId;
}

function spec(kind: ProjectileKind, o: SpecOptions): ProjectileSpec {
  const onGround = o.onGround ?? 'bounce';
  return {
    kind,
    cls: o.cls,
    mass: o.mass,
    radius: o.radius,
    drag: o.drag,
    restitution: o.restitution ?? 0.3,
    friction: o.friction ?? 0.4,
    roll: o.roll ?? 0.5,
    fuse: o.fuse ?? Infinity,
    fuseAction: o.fuseAction ?? 'none',
    onGround,
    onWall: o.onWall ?? onGround,
    onPerson: o.onPerson ?? 'stop',
    damageBase: o.damageBase ?? 0,
    damagePerJoule: o.damagePerJoule ?? 0,
    headFactor: o.headFactor ?? 1.9,
    legFactor: o.legFactor ?? 0.8,
    damageKind: o.damageKind ?? 'impact',
    stunBase: o.stunBase ?? 0,
    stunPerDamage: o.stunPerDamage ?? 0.04,
    lifetime: o.lifetime ?? 30,
    pickable: o.pickable ?? false,
    spinRate: o.spinRate ?? 6,
    means: o.means ?? null,
    item: o.item ?? null,
  };
}

/** Gabarit physique de chaque type de projectile du contrat. */
export const PROJECTILE_SPECS: readonly ProjectileSpec[] = Object.freeze([
  spec('grenade_lacrymo_main', {
    cls: 'grenade', mass: 0.34, radius: 0.028, drag: 0.006, restitution: 0.35, friction: 0.35, roll: 0.3,
    fuse: 2.2, fuseAction: 'burst', damageBase: 2, damagePerJoule: 0.1, pickable: true, spinRate: 9,
    means: 'lacrymo', item: 'grenade_lacrymo',
  }),
  spec('grenade_lacrymo_56', {
    cls: 'grenade', mass: 0.34, radius: 0.028, drag: 0.0026, restitution: 0.35, friction: 0.35, roll: 0.3,
    fuse: 6, fuseAction: 'burst', damageBase: 2, damagePerJoule: 0.1, pickable: true, spinRate: 4,
    means: 'lacrymo', item: 'lanceur_cougar',
  }),
  spec('palet_lacrymo', {
    cls: 'small', mass: 0.035, radius: 0.025, drag: 0.02, restitution: 0.3, friction: 0.5, roll: 0.45,
    fuse: 30, fuseAction: 'remove', damageBase: 1.5, damageKind: 'burn', pickable: true, spinRate: 14,
    means: 'lacrymo', item: 'grenade_lacrymo',
  }),
  spec('gm2l', {
    cls: 'grenade', mass: 0.15, radius: 0.028, drag: 0.0059, restitution: 0.3, friction: 0.4, roll: 0.35,
    fuse: 2, fuseAction: 'gm2l', damageBase: 1.5, damagePerJoule: 0.1, pickable: true, spinRate: 5,
    means: 'gm2l', item: 'grenade_gm2l',
  }),
  spec('desencerclement', {
    cls: 'grenade', mass: 0.248, radius: 0.028, drag: 0.007, restitution: 0.3, friction: 0.25, roll: 0.22,
    fuse: 1.5, fuseAction: 'sting', damageBase: 2, damagePerJoule: 0.1, spinRate: 12,
    means: 'desencerclement', item: 'grenade_desencerclement',
  }),
  spec('plot_caoutchouc', {
    cls: 'small', mass: 0.0093, radius: 0.012, drag: 0.039, restitution: 0.45, friction: 0.4, roll: 0.6,
    fuse: 0.45, fuseAction: 'remove', damageBase: 0.5, damagePerJoule: 1.2, headFactor: 2.2, stunBase: 0.3,
    lifetime: 1, spinRate: 20, means: 'desencerclement', item: 'grenade_desencerclement',
  }),
  spec('lbd', {
    cls: 'lbd', mass: 0.041, radius: 0.02, drag: 0.0094, restitution: 0.35, friction: 0.5, roll: 0.5,
    damagePerJoule: 0.225, headFactor: 2.6, legFactor: 0.75, stunBase: 1.2, stunPerDamage: 0.02,
    lifetime: 20, spinRate: 30, means: 'lbd', item: 'lbd40',
  }),
  spec('balle', {
    cls: 'bullet', mass: 0.008, radius: 0.005, drag: 0.0017, fuse: 2, fuseAction: 'remove',
    onGround: 'remove', onPerson: 'remove', damagePerJoule: 0.16, headFactor: 3, legFactor: 0.6,
    damageKind: 'bullet', stunBase: 2.5, stunPerDamage: 0.01, lifetime: 0, spinRate: 0,
    means: 'arme_feu', item: 'pistolet',
  }),
  spec('fusee_rouge', {
    cls: 'firework', mass: 0.1, radius: 0.02, drag: 0.004, fuse: 3.4, fuseAction: 'flare',
    onGround: 'remove', onPerson: 'stop', damageBase: 2, damagePerJoule: 0.08, damageKind: 'burn',
    lifetime: 0, spinRate: 0, item: 'fusee_sommation',
  }),
  spec('pave', {
    cls: 'heavy', mass: 1.5, radius: 0.06, drag: 0.005, restitution: 0.15, friction: 0.55, roll: 0.7,
    damageBase: 4, damagePerJoule: 0.14, stunBase: 0.4, stunPerDamage: 0.04, lifetime: 120, pickable: true,
    spinRate: 7, item: 'pave',
  }),
  spec('bouteille', {
    cls: 'small', mass: 0.5, radius: 0.04, drag: 0.011, onGround: 'shatter', onPerson: 'shatter',
    damageBase: 2.5, damagePerJoule: 0.09, stunBase: 0.2, lifetime: 0, spinRate: 10, item: 'bouteille',
  }),
  spec('molotov', {
    cls: 'fire', mass: 0.8, radius: 0.04, drag: 0.0072, onGround: 'ignite', onPerson: 'ignite',
    damageBase: 1, damagePerJoule: 0.05, lifetime: 0, spinRate: 8, item: 'molotov',
  }),
  spec('mortier', {
    cls: 'firework', mass: 0.12, radius: 0.025, drag: 0.004, fuse: 0.9, fuseAction: 'firework',
    onGround: 'explode', onPerson: 'explode', damageBase: 2, damagePerJoule: 0.04, damageKind: 'burn',
    lifetime: 0, spinRate: 0, item: 'mortier',
  }),
  spec('fumigene', {
    cls: 'small', mass: 0.3, radius: 0.03, drag: 0.01, restitution: 0.2, friction: 0.6, roll: 0.6,
    fuse: 60, fuseAction: 'remove', damageBase: 1, damagePerJoule: 0.05, pickable: true, spinRate: 8,
    item: 'fumigene',
  }),
  spec('oeuf_peinture', {
    cls: 'small', mass: 0.06, radius: 0.025, drag: 0.008, onGround: 'splat', onPerson: 'splat',
    lifetime: 0, spinRate: 6,
  }),
  spec('debris', {
    cls: 'small', mass: 0.3, radius: 0.04, drag: 0.012, restitution: 0.2, friction: 0.5, roll: 0.7,
    damageBase: 2, damagePerJoule: 0.1, stunBase: 0.1, lifetime: 30, spinRate: 9,
  }),
]);

const BY_KIND = new Map<string, ProjectileSpec>();
for (const s of PROJECTILE_SPECS) BY_KIND.set(s.kind, s);
const FALLBACK = BY_KIND.get('debris')!;

/** Gabarit d'un type de projectile ; un type inconnu se comporte comme un débris. */
export function projectileSpec(kind: ProjectileKind): ProjectileSpec {
  return BY_KIND.get(kind) ?? FALLBACK;
}

// ───────────────────────────── constantes d'effet ─────────────────────────────

/** Grenade lacrymogène : nombre de palets, durée d'émission de chacun (s), traîne après extinction (s). */
export const PALET_COUNT = 6;
export const PALET_EMIT_SECONDS = 30;
export const PALET_LINGER_SECONDS = 8;
/** Vitesse d'éjection horizontale des palets (m/s) : les disperse sur 5 à 15 m. */
export const PALET_EJECT_MIN = 5;
export const PALET_EJECT_MAX = 10;
/** Ouverture en l'air : vitesse d'éjection multipliée, part de la vitesse de la grenade conservée. */
export const PALET_AIR_BOOST = 1.35;
export const PALET_CARRY_AIR = 0.3;
export const PALET_CARRY_GROUND = 0.3;
/** Période des dépôts de gaz ou de fumée d'une source (s). */
export const EMIT_PERIOD = 0.2;
/** Marge avant le point de chute prévu à laquelle une grenade tirée au lanceur s'ouvre (s). */
export const AIRBURST_LEAD = 0.3;
/** Retard après le premier choc quand le retard principal n'a pas encore expiré (grenade de 56 mm). */
export const IMPACT_FUSE = 0.15;
/** Grenade lancée à la main : dispersion du retard (± s). */
export const HAND_FUSE_JITTER = 0.15;

/** Grenade assourdissante-lacrymogène : rayon de sidération, étourdissement au centre, nuage instantané. */
export const GM2L_STUN_RADIUS = 10;
export const GM2L_STUN_MAX = 6;
export const GM2L_BLAST_RADIUS = 3;
export const GM2L_BLAST_DAMAGE = 12;
export const GM2L_GAS_RADIUS = 5;
export const GM2L_GAS_AMOUNT = 1.2;
/** Retard après le point de chute prévu (tir au lanceur) et retard à la main (s). */
export const GM2L_LANDING_DELAY = 0.25;

/** Désencerclement : plots, vitesse d'éjection (≈ 126 km/h), rayon de la détonation. */
export const STING_PLOTS = 18;
export const STING_PLOT_SPEED = 35;
export const STING_RADIUS = 7;
export const STING_STUN_MAX = 3.5;
export const STING_BLAST_DAMAGE = 8;
export const STING_BLAST_RADIUS = 2;

/** Mortier d'artifice : rayon de brûlure et d'étourdissement, sursaut. */
export const FIREWORK_RADIUS = 3;
export const FIREWORK_STARTLE_RADIUS = 15;
export const FIREWORK_BURN = 7;
export const FIREWORK_STUN = 1.8;
export const FIREWORK_FUSE_JITTER = 0.2;
export const FIREWORK_COLORS: readonly number[] = Object.freeze([0xff3b30, 0x34c759, 0xffffff, 0xffd60a]);

/** Engin incendiaire : rayon de la nappe, rayon d'éclaboussure, brûlure directe. */
export const MOLOTOV_POOL_RADIUS = 1.25;
export const MOLOTOV_SPLASH_RADIUS = 1.7;
export const MOLOTOV_BURN = 14;

/** Bouteille : rayon des éclats et dégâts. */
export const BOTTLE_SHARD_RADIUS = 2;
export const BOTTLE_SHARD_DAMAGE = 3;

/** Fumigène : durée (s), fumée par seconde, rayon du dépôt, couleurs (cortège, signal de ralliement). */
export const SMOKE_SECONDS = 60;
export const SMOKE_RATE = 0.5;
export const SMOKE_RADIUS = 2.5;
export const SMOKE_COLOR_CORTEGE = 0xd62828;
export const SMOKE_COLOR_SIGNAL = 0x1a1a1a;

/** Fusée rouge : couleur et durée de visibilité de l'étoile (s). */
export const FLARE_COLOR = 0xff2a1a;
export const FLARE_SECONDS = 6;

/** Palet tenu ou relancé : vitesse de renvoi à la main et à la raquette (m/s). */
export const RETURN_SPEED_HAND = 13;
export const RETURN_SPEED_RACKET = 20;

/** Au-delà de cet âge un projectile encore en vol est retiré (sorti du monde). */
export const MAX_FLIGHT_SECONDS = 60;
/** Nombre maximal de projectiles simultanés : au-delà, le plus ancien projectile immobile disparaît. */
export const MAX_PROJECTILES = 900;
