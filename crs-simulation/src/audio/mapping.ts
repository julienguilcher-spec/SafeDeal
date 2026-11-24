/* =====================================================================================
 * Correspondances événement → son (logique pure, testable sous Node).
 * Aucune de ces fonctions n'alloue : le résultat est écrit dans l'objet `out` fourni.
 * ===================================================================================== */

import type {
  DamageKind, EntityKind, Faction, ProjectileKind, RayHit, SoundId, SurfaceKind, VehicleKind, WindowState,
} from '@/core/contracts';

export interface SoundChoice {
  id: SoundId;
  volume: number;
  pitch: number;
}

function set(out: SoundChoice, id: SoundId, volume = 1, pitch = 1): SoundChoice {
  out.id = id;
  out.volume = volume;
  out.pitch = pitch;
  return out;
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** Son d'une explosion d'après ce qui explose et son rayon d'effet (m). */
export function explosionSound(kind: ProjectileKind | 'vehicule', radius: number, out: SoundChoice): SoundChoice {
  switch (kind) {
    case 'vehicule': return set(out, 'explosion_vehicule');
    case 'gm2l': return set(out, 'detonation');
    case 'desencerclement': return set(out, 'desencerclement');
    case 'mortier': return set(out, 'mortier_explosion');
    case 'molotov': return set(out, 'molotov');
    case 'grenade_lacrymo_main': case 'grenade_lacrymo_56': case 'palet_lacrymo': case 'fumigene':
      return set(out, 'grenade_pop');
    case 'fusee_rouge': return set(out, 'mortier_explosion', 0.6, 1.3);
    default:
      if (radius < 2.5) return set(out, 'petard');
      return set(out, 'detonation', clamp(radius / 8, 0.5, 1));
  }
}

/**
 * Son de l'impact d'un projectile. `shielded` : la personne touchée tient son bouclier levé.
 * Retourne null quand l'impact est muet (l'explosion ou l'embrasement qui suit fait le bruit).
 */
export function impactSound(
  kind: ProjectileKind, hitKind: RayHit['kind'] | 'ground', shielded: boolean, out: SoundChoice,
): SoundChoice | null {
  if (kind === 'mortier' || kind === 'fusee_rouge') return null;
  if (kind === 'molotov') return set(out, 'molotov');
  if (shielded && hitKind === 'person') {
    const v = kind === 'pave' || kind === 'debris' ? 1 : kind === 'bouteille' ? 0.8 : 0.65;
    return set(out, 'impact_bouclier', v);
  }
  switch (kind) {
    case 'pave': case 'debris':
      if (hitKind === 'vehicle') return set(out, 'tole', 0.9);
      if (hitKind === 'person') return set(out, 'coup_baton', 0.8, 0.85);
      return set(out, 'impact_sol');
    case 'bouteille':
      return set(out, 'verre_brise', 0.55, 1.35);
    case 'grenade_lacrymo_main': case 'grenade_lacrymo_56': case 'gm2l': case 'desencerclement':
    case 'palet_lacrymo': case 'fumigene':
      // corps métallique ou plastique qui rebondit
      return hitKind === 'vehicle' ? set(out, 'tole', 0.4, 1.4) : set(out, 'impact_sol', 0.5, 1.5);
    case 'lbd': case 'plot_caoutchouc':
      return hitKind === 'person' ? set(out, 'coup_baton', 0.6, 1.2) : set(out, 'impact_sol', 0.35, 1.7);
    case 'balle':
      return hitKind === 'vehicle' ? set(out, 'tole', 0.5, 1.8) : set(out, 'impact_sol', 0.5, 2.2);
    case 'oeuf_peinture':
      return set(out, 'impact_sol', 0.35, 0.7);
    default:
      return set(out, 'impact_sol', 0.5);
  }
}

/**
 * Avertisseur d'un véhicule. mode 1 = deux-tons réglementaire du service, mode 2 = variante
 * « hurleur ». null si la sirène est éteinte.
 */
export function sirenSound(kind: VehicleKind, faction: Faction, mode: 0 | 1 | 2): SoundId | null {
  if (mode === 0) return null;
  if (mode === 2) return 'sirene_hurleur';
  if (kind === 'camion_pompiers') return 'sirene_pompiers';
  if (kind === 'ambulance') return 'sirene_samu';
  if (kind === 'centaure') return 'sirene_gendarmerie';
  if (faction === 'rescue') return 'sirene_pompiers';
  if (faction === 'medic') return 'sirene_samu';
  return 'sirene_police';
}

/** Variante de pas selon la surface et l'humidité du sol (0..1). */
export function footstepSound(surface: SurfaceKind, wetness: number): SoundId {
  switch (surface) {
    case 'water': return 'pas_eau';
    case 'park': return 'pas_herbe';
    case 'gravel': return 'pas_gravier';
    case 'sett': return wetness > 0.55 ? 'pas_eau' : 'pas_pave';
    default: return wetness > 0.55 ? 'pas_eau' : 'pas';
  }
}

/** Longueur d'une foulée (m) selon la vitesse (m/s) : ≈ 0,8 m en marchant, 1,2 m en courant, 1,5 m au sprint. */
export function strideLength(speed: number): number {
  return clamp(0.62 + 0.14 * speed, 0.65, 1.6);
}

/** Réaction vocale d'une personne blessée. null = pas de son. */
export function hurtSound(kind: DamageKind, amount: number, out: SoundChoice): SoundChoice | null {
  if (kind === 'gas') return set(out, 'toux', 0.8);
  if (kind === 'water') return null;
  if (kind === 'burn') return set(out, 'cri', 0.9, 1.15);
  if (amount < 4) return null;
  return set(out, 'cri', clamp(0.45 + amount / 40, 0.45, 1));
}

/** Son d'une collision de véhicule selon la vitesse d'impact (m/s) et ce qui est heurté. */
export function collisionSound(speed: number, otherKind: EntityKind | 'world', out: SoundChoice): SoundChoice | null {
  const s = Math.abs(speed);
  if (s < 0.8) return null;
  if (otherKind === 'person') return set(out, 'coup_baton', clamp(s / 8, 0.3, 1), 0.7);
  if (otherKind === 'prop' && s < 4) return set(out, 'tole', clamp(0.3 + s / 8, 0.3, 0.8), 1.1);
  return set(out, 'collision', clamp(0.3 + s / 14, 0.3, 1), clamp(1.15 - s / 60, 0.8, 1.15));
}

/** Son d'un changement d'état de vitrine. */
export function windowSound(state: WindowState, out: SoundChoice): SoundChoice | null {
  if (state === 'broken') return set(out, 'verre_brise');
  if (state === 'cracked') return set(out, 'verre_brise', 0.45, 1.5);
  if (state === 'tagged') return set(out, 'spray', 0.5);
  return null;
}

/** Hauteur de voix stable pour une personne (≈ 60 % de voix graves, 40 % de voix aiguës). */
export function voicePitchFor(personId: number): number {
  let h = Math.imul(personId ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  const u = (h & 0xffff) / 0xffff;
  const v = ((h >>> 16) & 0xff) / 255;
  return u < 0.6 ? 0.78 + 0.22 * v : 1.2 + 0.3 * v;
}
