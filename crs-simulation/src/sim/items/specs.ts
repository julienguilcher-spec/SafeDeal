/* =====================================================================================
 * PARAMÈTRES D'EMPLOI DES OBJETS (ItemSpec) — ce que le contrat ItemDef ne dit pas : famille
 * d'usage, dotation, consommation, lancer, mêlée, jet.
 *
 * Sources : 00-bible-realisme.md §B (portées, cadences, dotations, durées), 02 §2-3, 03 §3.3.
 *   - lancer à la main d'une grenade de 340 g : 5 à 30 m → ≈ 17,5 m/s à pleine force ;
 *   - pavé de 1,5 kg : 15 à 30 m, dispersion ± 3 m à 20 m ; bouteille : 15 à 30 m ; engin incendiaire : 15 à 25 m ;
 *   - balle de défense : ≈ 92 m/s, viseur réglé à 25 m, dispersion ≈ 14 cm à 25 m ;
 *   - mortier d'artifice : portée utile 30 à 60 m, tir tendu imprécis ;
 *   - bâton : allonge 1,2 m ; gazeuse : cône de 30° sur 4 m, jets d'une seconde ; extincteur : 4 m ;
 *     lance : 25 m ; inscription à la bombe : 4 à 8 s ; vitrine brisée en 2 à 6 coups.
 * ===================================================================================== */

import type { InteractVerb, ItemId, SoundId, UpperAnim } from '@/core/contracts';
import { DEG2RAD } from '@/core/math';
import type { AimStyle, ItemSpec, ItemUse, LaunchSpec, MeleeSpec, SpraySpec } from './api';
import { zeroingAngle } from './ballistics';
import { projectileSpec } from './projectile-defs';

/** Distance de réglage du viseur du LBD et de l'arme de service (m). */
export const ZERO_RANGE = 25;
export const LBD_SPEED = 92;
export const PISTOL_SPEED = 350;
/** Inclinaison imposée par la crosse du lanceur de 56 mm : aucun tir sous cet angle. */
export const LAUNCHER_MIN_PITCH = 30 * DEG2RAD;
export const LAUNCHER_MAX_PITCH = 80 * DEG2RAD;

interface LaunchOptions {
  speed: number;
  minFraction?: number;
  byHand?: boolean;
  aim?: AimStyle;
  loft?: number;
  pitchMin?: number;
  pitchMax?: number;
  preferredPitch?: number;
  spread: number;
  speedSpread?: number;
  heightFactor?: number;
  forward?: number;
  sound?: SoundId;
  stamina?: number;
}

function launch(o: LaunchOptions): LaunchSpec {
  const byHand = o.byHand ?? true;
  return {
    speed: o.speed,
    minFraction: o.minFraction ?? (byHand ? 0.35 : 1),
    byHand,
    aim: o.aim ?? (byHand ? 'lob' : 'direct'),
    loft: o.loft ?? (byHand ? 8 * DEG2RAD : 0),
    pitchMin: o.pitchMin ?? (byHand ? -30 * DEG2RAD : -70 * DEG2RAD),
    pitchMax: o.pitchMax ?? 70 * DEG2RAD,
    preferredPitch: o.preferredPitch ?? 32 * DEG2RAD,
    spread: o.spread,
    speedSpread: o.speedSpread ?? (byHand ? 0.04 : 0.01),
    heightFactor: o.heightFactor ?? (byHand ? 1.02 : 0.87),
    forward: o.forward ?? (byHand ? 0.35 : 0.55),
    sound: o.sound ?? 'grenade_lancer',
    stamina: o.stamina ?? (byHand ? 3 : 0),
  };
}

function melee(
  reach: number, arcDeg: number, damage: number, stun: number, knockback: number,
  shopDamage: number, propDamage: number, delay: number, stamina: number,
): MeleeSpec {
  return { reach, arc: arcDeg * DEG2RAD, damage, stun, knockback, kind: 'blunt', shopDamage, propDamage, delay, stamina };
}

function spray(range: number, halfAngleDeg: number, burst: number): SpraySpec {
  return { range, halfAngle: halfAngleDeg * DEG2RAD, burst };
}

interface SpecOptions {
  dotation?: number;
  consume?: 'unit' | 'charge' | 'none';
  drawTime?: number;
  useTime?: number;
  seated?: boolean;
  launch?: LaunchSpec;
  melee?: MeleeSpec;
  spray?: SpraySpec;
  verb?: InteractVerb;
  altAnim?: UpperAnim;
}

function spec(id: ItemId, use: ItemUse, o: SpecOptions = {}): ItemSpec {
  return {
    id,
    use,
    dotation: o.dotation ?? 1,
    consume: o.consume ?? 'none',
    drawTime: o.drawTime ?? 0.4,
    useTime: o.useTime ?? 0.6,
    seated: o.seated ?? false,
    launch: o.launch ?? null,
    melee: o.melee ?? null,
    spray: o.spray ?? null,
    verb: o.verb ?? null,
    altAnim: o.altAnim ?? null,
  };
}

const lbdZero = zeroingAngle(projectileSpec('lbd').drag, LBD_SPEED, ZERO_RANGE);
const pistolZero = zeroingAngle(projectileSpec('balle').drag, PISTOL_SPEED, ZERO_RANGE);

export const ITEM_SPECS: readonly ItemSpec[] = Object.freeze([
  // ───────────── forces de l'ordre ─────────────
  spec('bouclier', 'shield', { drawTime: 0.6, useTime: 0.5, melee: melee(1.0, 50, 6, 0.3, 1.6, 2, 4, 0.2, 5), altAnim: 'block' }),
  spec('baton', 'melee', { drawTime: 0.3, melee: melee(1.1, 50, 13, 0.5, 0.5, 4, 8, 0.28, 4), altAnim: 'block' }),
  spec('tonfa', 'melee', { melee: melee(1.2, 50, 15, 0.6, 0.6, 5, 10, 0.28, 4), altAnim: 'block' }),
  spec('gazeuse', 'spray_gas', { dotation: 7, consume: 'charge', useTime: 1, spray: spray(4, 15, 1) }),
  spec('grenade_lacrymo', 'throw', {
    consume: 'unit', drawTime: 0.6, useTime: 0.5,
    launch: launch({ speed: 17.5, loft: 10 * DEG2RAD, preferredPitch: 36 * DEG2RAD, spread: 0.022, speedSpread: 0.025 }),
  }),
  spec('grenade_gm2l', 'throw', {
    consume: 'unit', drawTime: 0.6, useTime: 0.5,
    launch: launch({ speed: 20, loft: 10 * DEG2RAD, preferredPitch: 36 * DEG2RAD, spread: 0.022, speedSpread: 0.025 }),
  }),
  spec('grenade_desencerclement', 'throw', {
    consume: 'unit', drawTime: 0.6, useTime: 0.5,
    launch: launch({
      speed: 24, minFraction: 0.3, aim: 'timed', loft: 0, pitchMin: -10 * DEG2RAD, pitchMax: 45 * DEG2RAD,
      preferredPitch: 6 * DEG2RAD, spread: 0.03, heightFactor: 0.3, forward: 0.4,
    }),
  }),
  spec('lanceur_cougar', 'launch', {
    dotation: 8, consume: 'charge', drawTime: 0.9, useTime: 0.5, altAnim: 'aim_long',
    // la vitesse réelle dépend du dispositif de propulsion et de la munition : voir launcherSpeed() (aim.ts)
    launch: launch({
      speed: 36, byHand: false, aim: 'cloche', loft: LAUNCHER_MIN_PITCH, pitchMin: LAUNCHER_MIN_PITCH,
      pitchMax: LAUNCHER_MAX_PITCH, preferredPitch: LAUNCHER_MIN_PITCH, spread: 0.012, speedSpread: 0.015,
      sound: 'lanceur_tir',
    }),
  }),
  spec('lbd40', 'launch', {
    dotation: 6, consume: 'charge', drawTime: 0.8, useTime: 0.4, altAnim: 'aim_long',
    launch: launch({ speed: LBD_SPEED, byHand: false, loft: lbdZero, spread: 0.005, heightFactor: 0.88, forward: 0.5, sound: 'lbd_tir' }),
  }),
  spec('pistolet', 'launch', {
    dotation: 15, consume: 'charge', drawTime: 0.7, useTime: 0.25, altAnim: 'aim_pistol',
    launch: launch({ speed: PISTOL_SPEED, byHand: false, loft: pistolZero, spread: 0.012, heightFactor: 0.86, sound: 'tir_arme' }),
  }),
  spec('menottes', 'interact', { dotation: 6, consume: 'charge', useTime: 4, verb: 'menotter' }),
  spec('radio', 'radio', { drawTime: 0.2, useTime: 2.5, seated: true }),
  spec('megaphone', 'megaphone', { useTime: 5, seated: true, altAnim: 'megaphone' }),
  spec('extincteur', 'spray_powder', { dotation: 15, consume: 'charge', drawTime: 0.8, useTime: 1, spray: spray(4, 14, 1) }),
  spec('lampe', 'lamp', { drawTime: 0.2, useTime: 0.3, seated: true }),
  spec('masque_gaz', 'mask', { drawTime: 0.3, useTime: 8, seated: true }),
  spec('fusee_sommation', 'launch', {
    consume: 'unit', useTime: 1,
    launch: launch({
      speed: 46, byHand: false, aim: 'up', loft: 80 * DEG2RAD, pitchMin: 72 * DEG2RAD, pitchMax: 88 * DEG2RAD,
      preferredPitch: 80 * DEG2RAD, spread: 0.03, speedSpread: 0.03, heightFactor: 1.1, forward: 0.2, sound: 'mortier_tir',
    }),
  }),
  spec('telecommande_drone', 'drone', { drawTime: 0.6, useTime: 1, seated: true }),

  // ───────────── manifestants ─────────────
  spec('pave', 'throw', {
    consume: 'unit', drawTime: 0.5, useTime: 0.5,
    launch: launch({ speed: 16, preferredPitch: 30 * DEG2RAD, spread: 0.045, speedSpread: 0.05, stamina: 4 }),
  }),
  spec('bouteille', 'throw', {
    consume: 'unit', useTime: 0.5,
    launch: launch({ speed: 18, preferredPitch: 32 * DEG2RAD, spread: 0.045, speedSpread: 0.05 }),
  }),
  spec('molotov', 'throw', {
    consume: 'unit', drawTime: 1.2, useTime: 0.5,
    launch: launch({ speed: 15.5, preferredPitch: 34 * DEG2RAD, spread: 0.05, speedSpread: 0.05 }),
  }),
  spec('mortier', 'launch', {
    dotation: 6, consume: 'charge', drawTime: 0.8, useTime: 0.4, altAnim: 'aim_long',
    launch: launch({
      speed: 60, byHand: false, pitchMin: -30 * DEG2RAD, spread: 0.07, speedSpread: 0.08, heightFactor: 0.8,
      forward: 0.6, sound: 'mortier_tir',
    }),
  }),
  spec('fumigene', 'throw', {
    consume: 'unit', useTime: 0.5,
    launch: launch({ speed: 17, preferredPitch: 35 * DEG2RAD, spread: 0.04 }),
  }),
  spec('pancarte', 'sign', { useTime: 1.5, altAnim: 'carry_sign' }),
  spec('banderole', 'sign', { drawTime: 1, useTime: 1.5, altAnim: 'carry_banner' }),
  spec('drapeau', 'sign', { useTime: 1.5, altAnim: 'carry_sign' }),
  spec('parapluie', 'umbrella', { useTime: 0.6, altAnim: 'umbrella' }),
  spec('bombe_peinture', 'spray_paint', { dotation: 12, consume: 'charge', useTime: 4, spray: spray(1.5, 25, 4) }),
  spec('marteau', 'melee', { drawTime: 0.5, melee: melee(1.0, 40, 26, 1, 0.4, 12, 18, 0.28, 4) }),
  spec('barre', 'melee', { drawTime: 0.5, melee: melee(1.4, 50, 30, 1.2, 0.9, 15, 30, 0.3, 6) }),
  spec('telephone', 'media', { drawTime: 0.3, useTime: 1.5, seated: true, altAnim: 'film' }),
  spec('butin', 'drop', { consume: 'unit', drawTime: 0.2, useTime: 0.6 }),
  spec('raquette', 'racket', { useTime: 0.6 }),

  // ───────────── secours ─────────────
  spec('trousse_secours', 'interact', { dotation: 10, consume: 'charge', useTime: 2, verb: 'soigner' }),
  spec('serum_physiologique', 'interact', { dotation: 20, consume: 'charge', useTime: 2, verb: 'rincer_yeux' }),
  spec('brancard', 'interact', { drawTime: 1.5, useTime: 2, verb: 'porter' }),
  spec('lance_incendie', 'spray_water', { drawTime: 1, useTime: 0.5, spray: spray(25, 4, 0.5) }),

  // ───────────── presse ─────────────
  spec('appareil_photo', 'media', { dotation: 24, consume: 'charge', useTime: 0.4, seated: true, altAnim: 'photo' }),
  spec('camera_tv', 'media', { drawTime: 0.8, useTime: 1, seated: true, altAnim: 'film' }),
  spec('micro', 'interact', { useTime: 2, seated: true, verb: 'interviewer' }),
]);

const BY_ID = new Map<string, ItemSpec>();
for (const s of ITEM_SPECS) BY_ID.set(s.id, s);

/** Paramètres d'emploi d'un objet (undefined pour un identifiant inconnu). */
export function itemSpec(id: ItemId): ItemSpec | undefined {
  return BY_ID.get(id);
}
