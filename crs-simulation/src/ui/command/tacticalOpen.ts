/* =====================================================================================
 * La carte de commandement ouverte DEPUIS LE TERRAIN (ordres directs) :
 *
 *   openTacticalAt(core, x, z, unités, intention)   la carte s'ouvre sur ce point, la fiche du point avec cette
 *                                                  intention, ces unités pour Qui ; « Donner l'ordre » la referme ;
 *   fieldOpenData(core)                            Tab (ou un clic sur la ligne grise) quand l'ordre prêt affiché est
 *                                                  « Trop loin pour viser : Tab, la carte s'ouvre sur ce point » :
 *                                                  les données d'ouverture sur ce point (null sinon) ;
 *   fieldWhoIds(core)                              l'unité choisie avec U sur le terrain (« À qui », un seul ordre) :
 *                                                  la carte la prend pour Qui à l'ouverture (même choix des deux côtés).
 * Aucun DOM : l'écran (tacticalScreen.ts) lit ces données dans son constructeur.
 * ===================================================================================== */

import type { TacticalOpenData } from './api';
import type { IntentId } from './cardTypes';
import type { CommandCore } from './core';
import { REFUS } from './direct/caps';
import type { DirectApi } from './direct/runtime';
import { FIELD_DIRECT_SERVICE } from './fieldHud';

function direct(core: CommandCore): DirectApi | undefined {
  const d = core.ctx.service<DirectApi>(FIELD_DIRECT_SERVICE);
  return d && typeof d.ready === 'function' ? d : undefined;
}

/** Ouvre la carte de commandement sur (x, z) avec cette intention et ces unités pour Qui (fermée après l'envoi). */
export function openTacticalAt(core: CommandCore, x: number, z: number, squadIds: readonly number[], intent: IntentId): void {
  const data: TacticalOpenData = { x, z, squadIds: squadIds.slice(), intent, fromField: true };
  core.ctx.ui.open('carte_tactique', data);
}

/** Ordre prêt affiché « trop loin pour viser » : la carte s'ouvre sur son point (null : rien de tel). */
export function fieldOpenData(core: CommandCore): TacticalOpenData | null {
  const d = direct(core);
  const n = d ? d.ready() : null;
  if (!n || n.enabled || n.lock !== REFUS.tropLoin) return null;
  return { x: n.x, z: n.z, squadIds: n.who ? n.who.squadIds.slice() : [], intent: 'envoyer', fromField: true };
}

/** Unité choisie à la main sur le terrain (U), que la carte reprend pour Qui ; [] : choix automatique. */
export function fieldWhoIds(core: CommandCore): number[] {
  const d = direct(core);
  if (!d) return [];
  const key = d.whoKey();
  if (key.charAt(0) !== 'u') return [];
  const id = Number(key.slice(1));
  return Number.isFinite(id) && id > 0 && core.canCommand(id) ? [id] : [];
}

/**
 * La carte se ferme : son choix de Qui vaut pour le prochain ordre du terrain (une seule unité choisie à la main), ou,
 * si un ordre est parti de la carte, le terrain revient au choix automatique (le choix manuel ne vaut qu'une fois).
 */
export function handWhoBack(core: CommandCore, picked: readonly number[], sent: boolean): void {
  const d = direct(core);
  if (!d) return;
  if (picked.length === 1 && core.canCommand(picked[0]!)) d.setWho(`u${picked[0]!}`);
  else if (sent && d.whoKey() !== 'auto') d.setWho('auto');
}
