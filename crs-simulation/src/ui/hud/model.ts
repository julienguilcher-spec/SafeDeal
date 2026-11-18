/* =====================================================================================
 * HUD — logique pure (aucun DOM) : ce qui s'affiche selon le rôle et la situation, libellés du
 * cadre légal, de la phase et des blessures, géométrie de la boussole et des indicateurs de coups.
 * ===================================================================================== */

import type {
  CameraMode, CrowdPhase, ForceLevel, InjuryLevel, ItemId, PlayableRole, RoeState, SeatRole, Vehicle,
} from '@/core/contracts';
import { compassBearing } from '@/core/math';

export const POLICE_ROLES: readonly PlayableRole[] = [
  'crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote',
  'patrouille',
];

export function isPoliceRole(role: PlayableRole): boolean {
  return POLICE_ROLES.indexOf(role) >= 0;
}

/** Éléments du HUD affichés. Les six premiers sont les indicateurs PERMANENTS (au plus six à la fois). */
export interface HudProfile {
  /** Santé, endurance, exposition au gaz, blessure. */
  status: boolean;
  /** Barre d'objets. */
  items: boolean;
  /** Boussole, cap, secteur. */
  compass: boolean;
  /** Liste d'objectifs. */
  objectives: boolean;
  /** Horloge, météo, phase et tension. */
  situation: boolean;
  /** Cadre légal : complet pour les forces de l'ordre, simple rappel pour les civils. */
  legal: 'full' | 'reminder' | 'none';
  /** Tableau de bord du véhicule (remplace la barre d'objets). */
  vehicle: boolean;
  /** Habillage de la caméra du drone (remplace l'état physique et la barre d'objets). */
  drone: boolean;
  /** Viseur du journaliste. */
  viewfinder: boolean;
  /** Réticule : point (à pied), tourelle, ou aucun. */
  reticle: 'none' | 'dot' | 'turret';
}

/** Ce que le HUD montre pour un rôle, une caméra et un siège donnés. */
export function hudProfile(role: PlayableRole, camera: CameraMode, seat: SeatRole | null, hasPerson: boolean): HudProfile {
  const legal: HudProfile['legal'] = isPoliceRole(role) ? 'full' : 'reminder';
  const p: HudProfile = {
    status: hasPerson, items: hasPerson, compass: true, objectives: true, situation: true, legal,
    vehicle: false, drone: false, viewfinder: false, reticle: hasPerson ? 'dot' : 'none',
  };
  if (camera === 'tactical' || camera === 'free') {
    // vue de commandement : la carte tactique porte ses propres éléments
    p.status = false;
    p.items = false;
    p.compass = false;
    p.reticle = 'none';
    return p;
  }
  if (camera === 'drone') {
    // l'habillage du drone porte déjà le cap : la boussole ferait double emploi
    p.status = false;
    p.items = false;
    p.compass = false;
    p.drone = true;
    p.reticle = 'none';
    return p;
  }
  if (seat !== null) {
    p.items = false;
    p.vehicle = true;
    p.reticle = seat === 'gunner' || camera === 'turret' ? 'turret' : 'none';
    return p;
  }
  if (camera === 'viewfinder') {
    // l'œil au viseur : on voit mieux, et beaucoup moins autour de soi
    p.items = false;
    p.objectives = false;
    p.viewfinder = true;
    p.reticle = 'none';
    return p;
  }
  if (camera === 'turret') p.reticle = 'turret';
  return p;
}

/** Nombre d'indicateurs permanents d'un profil (règle de sobriété : six au plus). */
export function permanentCount(p: HudProfile): number {
  let n = 0;
  if (p.status) n++;
  if (p.items) n++;
  if (p.compass) n++;
  if (p.objectives) n++;
  if (p.situation) n++;
  if (p.legal === 'full') n++;
  if (p.vehicle) n++;
  if (p.drone) n++;
  if (p.viewfinder) n++;
  return n;
}

// ───────────────────────────── phase et tension ─────────────────────────────

const PHASE_LABELS: Readonly<Record<CrowdPhase, string>> = {
  aucune: 'Calme',
  rassemblement: 'Rassemblement',
  depart: 'Départ du cortège',
  cortege: 'Cortège',
  tension: 'Tension',
  affrontement: 'Affrontements',
  dispersion: 'Dispersion',
  apres_manif: 'Après-manifestation',
  terminee: 'Manifestation terminée',
};

export function phaseLabel(phase: CrowdPhase): string {
  return PHASE_LABELS[phase] ?? String(phase);
}

export type Tone = 'ok' | 'warn' | 'hot' | 'alert';

/** Couleur de la jauge de tension. */
export function tensionTone(t: number): Tone {
  if (t < 0.25) return 'ok';
  if (t < 0.5) return 'warn';
  if (t < 0.75) return 'hot';
  return 'alert';
}

/** Nombre de segments allumés (sur cinq) pour une tension 0..1 ; toujours au moins un. */
export function tensionSegments(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.max(1, Math.min(5, Math.floor(c * 5) + 1));
}

// ───────────────────────────── cadre légal ─────────────────────────────

export type LegalCode = 'cortege' | 'annonce' | 'sommation1' | 'derniere' | 'force' | 'armes' | 'riposte';

export interface LegalState {
  code: LegalCode;
  /** Libellé affiché (« Annonce faite », « Riposte directe »…). */
  label: string;
  /** Couleur de la pastille : gris, orange, rouge, rouge cerclé, jaune (dossier 06 §2.8). */
  tone: 'neutral' | 'orange' | 'red' | 'ring' | 'yellow';
  /** Sommations prononcées 0..3. */
  sommation: number;
  lawful: ForceLevel;
  authorized: ForceLevel;
  /** Niveau réellement utilisable : le plus petit des deux. */
  usable: ForceLevel;
}

export function legalState(roe: RoeState): LegalState {
  const lawful = roe.lawfulForce;
  const authorized = roe.authorizedForce;
  const usable = (lawful < authorized ? lawful : authorized) as ForceLevel;
  let code: LegalCode;
  let label: string;
  let tone: LegalState['tone'];
  if (roe.underAttack) {
    code = 'riposte';
    label = 'Riposte directe';
    tone = 'yellow';
  } else if (roe.sommation <= 0) {
    code = 'cortege';
    label = 'Aucune sommation';
    tone = 'neutral';
  } else if (roe.sommation === 1) {
    code = 'annonce';
    label = 'Annonce faite';
    tone = 'orange';
  } else if (roe.sommation === 2) {
    code = 'sommation1';
    label = 'Première sommation';
    tone = 'orange';
  } else if (lawful >= 4) {
    code = 'armes';
    label = 'Usage des armes autorisé';
    tone = 'ring';
  } else if (lawful >= 2) {
    code = 'force';
    label = 'Emploi de la force autorisé';
    tone = 'red';
  } else {
    code = 'derniere';
    label = 'Dernière sommation';
    tone = 'orange';
  }
  return { code, label, tone, sommation: roe.sommation, lawful, authorized, usable };
}

/** Moyen le plus fort permis à chaque niveau de la gradation (contracts.ts, ForceLevel) — libellés courts pour le HUD. */
// mêmes mots que la pastille « ⚖ … · Force : mains nues » de la carte de commandement (§7.1), jamais de chiffre
const FORCE_LABELS: readonly string[] = [
  'Aucune force', 'Mains nues', 'Bâton et gazeuse', 'Gaz', 'Grenades', 'Arme à feu',
];

export function forceLabel(level: number): string {
  return FORCE_LABELS[level < 0 ? 0 : level > 5 ? 5 : Math.round(level)]!;
}

/** Rappel du droit pour les rôles civils (une ligne, vide tant qu'aucune sommation n'a été faite). */
export function legalReminder(roe: RoeState): string {
  if (roe.sommation >= 3) return 'Dernière sommation entendue : rester est un délit';
  if (roe.sommation === 2) return 'Première sommation : quittez les lieux';
  if (roe.sommation === 1) return 'Annonce entendue : la dispersion est demandée';
  return '';
}

// ───────────────────────────── état physique ─────────────────────────────

const INJURY_LABELS: Readonly<Record<InjuryLevel, string>> = {
  none: '',
  light: 'Blessure légère',
  serious: 'Blessure grave',
  critical: 'État critique',
  dead: 'Hors de combat',
};

export function injuryLabel(injury: InjuryLevel): string {
  return INJURY_LABELS[injury] ?? '';
}

export function healthTone(health: number): Tone {
  if (health > 60) return 'ok';
  if (health > 35) return 'warn';
  return 'alert';
}

// ───────────────────────────── boussole, directions ─────────────────────────────

/** Écart signé en degrés ramené à ]−180, 180]. */
export function wrap180(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d;
}

/**
 * Gisement d'un point par rapport au regard, en degrés : 0 = droit devant, +90 = à droite,
 * −90 = à gauche, ±180 = derrière. (dx, dz) = cible − observateur, camYaw = cap du regard.
 */
export function relativeBearing(camYaw: number, dx: number, dz: number): number {
  if (dx === 0 && dz === 0) return 0;
  return wrap180(compassBearing(Math.atan2(dx, dz)) - compassBearing(camYaw));
}

/** Position d'un repère sur le ruban de la boussole : décalage en px depuis le centre, borné aux bords. */
export function compassMarkerOffset(relDeg: number, pxPerDeg: number, halfWidth: number): { x: number; clamped: -1 | 0 | 1 } {
  const x = relDeg * pxPerDeg;
  if (x > halfWidth) return { x: halfWidth, clamped: 1 };
  if (x < -halfWidth) return { x: -halfWidth, clamped: -1 };
  return { x, clamped: 0 };
}

// ───────────────────────────── véhicule, caméras ─────────────────────────────

export function gearLabel(v: Pick<Vehicle, 'gear' | 'speed' | 'engineOn'>): string {
  if (!v.engineOn) return 'P';
  if (v.gear < 0 || v.speed < -0.3) return 'R';
  if (v.gear === 0) return 'N';
  return String(v.gear);
}

export interface TurretReadout {
  kind: 'lance_grenades' | 'canon_eau';
  label: string;
  value: number;
  max: number;
  unit: string;
}

/** Munitions de tourelle ou eau restante du premier armement du véhicule ; null s'il n'y en a pas. */
export function turretReadout(v: Pick<Vehicle, 'def' | 'turretAmmo'>): TurretReadout | null {
  const turrets = v.def.turrets;
  for (let i = 0; i < turrets.length; i++) {
    const t = turrets[i]!;
    if (t.kind === 'camera') continue;
    const value = v.turretAmmo[i] ?? 0;
    return t.kind === 'canon_eau'
      ? { kind: 'canon_eau', label: 'Eau', value, max: t.capacity, unit: 'L' }
      : { kind: 'lance_grenades', label: 'Grenades', value, max: t.capacity, unit: '' };
  }
  return null;
}

/** Focale équivalente du viseur du journaliste : 24 mm au zoom 1, 200 mm au plus. */
export function focalLength(zoom: number): number {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Math.round(Math.min(200, Math.max(24, 24 * z)));
}

// ───────────────────────────── objets ─────────────────────────────

/** Noms français de repli quand le module des objets (ctx.actions.def) n'est pas branché. */
const ITEM_NAMES: Readonly<Record<string, string>> = {
  bouclier: 'Bouclier', baton: 'Bâton de défense', tonfa: 'Tonfa', gazeuse: 'Gazeuse', grenade_lacrymo: 'Grenade lacrymogène',
  grenade_gm2l: 'Grenade GM2L', grenade_desencerclement: 'Désencerclement', lanceur_cougar: 'Lanceur Cougar', lbd40: 'LBD 40',
  pistolet: 'Arme de service', menottes: 'Menottes', radio: 'Radio', megaphone: 'Mégaphone', extincteur: 'Extincteur', lampe: 'Lampe',
  masque_gaz: 'Masque à gaz', fusee_sommation: 'Fusée rouge', telecommande_drone: 'Télécommande du drone',
  pave: 'Pavé', bouteille: 'Bouteille', molotov: 'Cocktail Molotov', mortier: 'Mortier d’artifice', fumigene: 'Fumigène',
  pancarte: 'Pancarte', banderole: 'Banderole', drapeau: 'Drapeau', parapluie: 'Parapluie', bombe_peinture: 'Bombe de peinture',
  marteau: 'Marteau', barre: 'Barre', telephone: 'Téléphone', butin: 'Butin', raquette: 'Raquette',
  trousse_secours: 'Trousse de secours', serum_physiologique: 'Sérum physiologique', brancard: 'Brancard', lance_incendie: 'Lance à incendie',
  appareil_photo: 'Appareil photo', camera_tv: 'Caméra', micro: 'Micro',
};

export function itemName(id: ItemId, defName?: string): string {
  if (defName) return defName;
  return ITEM_NAMES[id] ?? String(id).replace(/_/g, ' ');
}

/** Objets dont la quantité n'a pas de sens à l'écran (un seul exemplaire, pas de munitions). */
export function showsCount(_id: ItemId, count: number, maxCount: number | undefined): boolean {
  if (maxCount !== undefined) return maxCount > 1;
  return count > 1;
}
