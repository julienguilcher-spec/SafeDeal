/* =====================================================================================
 * ARCHÉTYPES — masse de l'équipement porté.
 *
 * Les vitesses écrites sur une personne (speedWalk / speedRun / speedSprint) sont ses vitesses de
 * BASE : âge et condition physique. Le poids de l'équipement est appliqué par la locomotion à partir
 * des protections (armorHead, armorBody), du sac à dos et de l'inventaire : un porteur de bouclier
 * (≈ 19 kg) court donc moins vite qu'un commandant sans bouclier, sans que ce module ne compte la
 * charge une seconde fois. loadKg() donne cette masse pour l'interface (vestiaire, fiche de poste).
 * ===================================================================================== */

import type { GameContext, ItemId, Person } from '@/core/contracts';

/** Casque (kg pour armorHead = 1), protections et gilet (kg pour armorBody = 1), sac à dos — mêmes repères que la locomotion. */
export const WEIGHT_HELMET = 2;
export const WEIGHT_BODY_ARMOR = 14;
export const WEIGHT_BACKPACK = 3;

/** Masses de repli (kg) quand le module du matériel n'est pas branché — docs/research/00-bible-realisme.md §B. */
const FALLBACK_WEIGHTS: Readonly<Record<string, number>> = {
  bouclier: 4, baton: 0.45, tonfa: 0.6, gazeuse: 0.15, grenade_lacrymo: 0.34, grenade_gm2l: 0.15,
  grenade_desencerclement: 0.25, lanceur_cougar: 3.67, lbd40: 2.05, pistolet: 0.9, menottes: 0.3, radio: 0.35,
  megaphone: 1.2, extincteur: 6, lampe: 0.15, masque_gaz: 0.7, fusee_sommation: 0.2, telecommande_drone: 0.8,
  pave: 1.5, bouteille: 0.5, molotov: 0.8, mortier: 1.2, fumigene: 0.3, pancarte: 0.6, banderole: 3, drapeau: 1,
  parapluie: 0.4, bombe_peinture: 0.35, marteau: 0.8, barre: 2, telephone: 0.2, butin: 2, raquette: 0.3,
  trousse_secours: 1.5, serum_physiologique: 0.5, brancard: 7, lance_incendie: 2.5, appareil_photo: 1.8,
  camera_tv: 7, micro: 0.3,
};
/** Objets dont chaque exemplaire pèse (grenades, pavés) ; pour les autres, la quantité est une charge ou une munition. */
const PER_UNIT: ReadonlySet<string> = new Set([
  'grenade_lacrymo', 'grenade_gm2l', 'grenade_desencerclement', 'pave', 'bouteille', 'molotov', 'fumigene', 'butin',
]);

function unitWeight(ctx: GameContext, id: ItemId): number {
  const def = ctx.actions.def(id);
  if (def && def.weight > 0) return def.weight;
  return FALLBACK_WEIGHTS[id] ?? 0;
}

/** Masse de l'équipement d'une personne (kg) : protections, sac, inventaire. */
export function loadKg(ctx: GameContext, p: Person): number {
  const ah = p.armorHead > 0 ? Math.min(1, p.armorHead) : 0;
  const ab = p.armorBody > 0 ? Math.min(1, p.armorBody) : 0;
  let w = ah * WEIGHT_HELMET + ab * WEIGHT_BODY_ARMOR + (p.look.backpack ? WEIGHT_BACKPACK : 0);
  const inv = p.inventory;
  for (let i = 0; i < inv.length; i++) {
    const s = inv[i]!;
    const units = PER_UNIT.has(s.id) && s.count > 1 ? s.count : 1;
    w += unitWeight(ctx, s.id) * units;
  }
  return w;
}
