/* =====================================================================================
 * Équipement de tête : masque à gaz et visière, avec leurs contreparties.
 *
 *   masque à gaz : protection quasi totale contre le gaz (gasProtection 0,97) ; champ de vision
 *                  réduit de 30 %, endurance dégradée (loco-speed.ts lit look.gasMask) ;
 *   visière      : protège le visage (armorHead + 0,12) ; champ de vision réduit de 15 %,
 *                  récupération du souffle un peu moins bonne.
 * Les fonctions sont immédiates : le joueur (player-gear.ts) et les IA gèrent leur propre délai.
 * ===================================================================================== */

import type { GameContext, Person } from '@/core/contracts';
import type { PersonExtra } from './shared';
import * as T from './tuning';

/** Casques munis d'une visière relevable. */
export function hasVisor(p: Person): boolean {
  const h = p.look.headgear;
  return h === 'casque_crs' || h === 'casque_gendarme' || h === 'casque_moto' || h === 'casque_pompier';
}

/** La personne a-t-elle un masque à gaz (dans sa dotation, ou déjà sur le visage) ? */
export function hasMask(ctx: GameContext, p: Person): boolean {
  return p.look.gasMask || ctx.actions.has(p, 'masque_gaz') > 0;
}

/** Met ou retire le masque à gaz. Retourne false si la personne n'en a pas. */
export function setGasMask(ctx: GameContext, p: Person, e: PersonExtra, on: boolean): boolean {
  if (on) {
    if (p.look.gasMask) return true;
    if (!hasMask(ctx, p)) return false;
    e.maskBase = p.gasProtection;
    e.maskApplied = true;
    p.look.gasMask = true;
    if (p.gasProtection < T.MASK_PROTECTION) p.gasProtection = T.MASK_PROTECTION;
    return true;
  }
  if (!p.look.gasMask) return true;
  p.look.gasMask = false;
  // retour à la protection d'avant le masque (foulard : protection de fortune ; sinon rien)
  p.gasProtection = e.maskApplied ? e.maskBase : p.look.faceCover ? 0.3 : 0;
  e.maskApplied = false;
  return true;
}

/** Baisse ou relève la visière. Retourne false si le casque n'en a pas. */
export function setVisor(p: Person, e: PersonExtra, down: boolean): boolean {
  if (!hasVisor(p)) return false;
  if (down === p.look.visorDown) return true;
  p.look.visorDown = down;
  if (down) {
    if (e.visorDelta === 0) {
      const a = p.armorHead + T.VISOR_ARMOR;
      const capped = a < 0.97 ? a : p.armorHead > 0.97 ? p.armorHead : 0.97;
      e.visorDelta = capped - p.armorHead;
      p.armorHead = capped;
    }
  } else if (e.visorDelta !== 0) {
    const a = p.armorHead - e.visorDelta;
    p.armorHead = a > 0 ? a : 0;
    e.visorDelta = 0;
  }
  return true;
}

/** Facteur de champ de vision dû à la visière et au masque (1 = normal). */
export function fovScaleOf(p: Person): number {
  if (p.look.gasMask) return T.MASK_FOV;
  if (p.look.visorDown) return T.VISOR_FOV;
  return 1;
}
