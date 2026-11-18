/* =====================================================================================
 * Unités — fournisseur de contenu des panneaux de la carte de commandement : image du symbole d'une unité, ordre en
 * cours en clair, effectif et relève conseillée. L'arborescence et la fiche de sélection d'autrefois sont remplacées
 * par « Mes unités » (panelFollow.ts) et par la fiche d'une unité (intents.ts) ; ces fonctions servent aux deux, à la
 * pastille d'unité du HUD (hud.ts) et aux tests.
 * ===================================================================================== */

import type { Faction, OrderType } from '@/core/contracts';
import { symbolIcon } from '../maps/symbols';
import type { UnitSymbol } from '../maps/units';
import { orderLabel, verbOf } from './orders';

const ICON_URLS = new Map<string, string>();

/** Image (URL de données) du symbole d'une unité, fabriquée une fois par type. */
export function unitIconUrl(symbol: UnitSymbol, faction: Faction): string {
  const key = symbol + '|' + faction;
  let url = ICON_URLS.get(key);
  if (!url) {
    url = symbolIcon(symbol, faction, 14, 2).toDataURL();
    ICON_URLS.set(key, url);
  }
  return url;
}

/** Ce qu'il faut d'une unité pour dire son ordre en cours. */
export interface OrderStatusUnit {
  squadId: number;
  patrol: boolean;
  status: string;
  order: { type: OrderType } | null;
}

/**
 * Ordre en cours d'une unité, en clair (« Barre », « En ligne », « Sans ordre »), s'il est libre et s'il emploie la
 * force. Une voiture de patrouille dit son état propre (« Patrouille », « En route (urgence) », « Sur place »).
 */
export function orderStatus(u: OrderStatusUnit): { text: string; free: boolean; force: boolean } {
  if (u.patrol) return { text: u.status, free: u.status === 'Patrouille', force: false };
  const o = u.order;
  if (!o || o.type === 'libre') return { text: u.squadId !== 0 ? 'Sans ordre' : '', free: true, force: false };
  const v = verbOf(o.type);
  return { text: orderLabel(o.type), free: false, force: v ? v.coercive : false };
}

/** Seuil d'agents valides en deçà duquel la relève est conseillée (60 %). */
export const RELIEF_RATIO = 0.6;

/** Relève conseillée : moins de 60 % d'agents valides. */
export function reliefAdvised(valid: number, total: number): boolean {
  return total > 0 && valid / total < RELIEF_RATIO;
}

/** Effectif « 19/19 » d'une unité ; le nombre seul pour un véhicule hors unité ; '' sans effectif. */
export function strengthText(u: { squadId: number; valid: number; total: number }): string {
  if (u.total <= 0) return '';
  return u.squadId !== 0 ? `${u.valid}/${u.total}` : String(u.total);
}
