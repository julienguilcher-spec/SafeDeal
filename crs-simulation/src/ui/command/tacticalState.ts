/* =====================================================================================
 * État partagé de la carte tactique : sélection, outil et mode en cours, éléments mis en avant.
 * Toute modification passe par touch() : les panneaux et la carte se rafraîchissent à l'image suivante.
 * ===================================================================================== */

import type { RescueKind } from '@/core/extensions';
import type { TacticalTab } from './api';
import type { OrderVerb } from './orders';

export type TacticalMode =
  | { kind: 'idle' }
  | { kind: 'order'; verb: OrderVerb }
  | { kind: 'close_road' }
  | { kind: 'close_area' }
  | { kind: 'rescue'; rescue: RescueKind; incidentId: number };

export const IDLE: TacticalMode = { kind: 'idle' };

/** Vue minimale lue et réglée par tacticalFrame (MapTransform de src/ui/maps/transform.ts). */
export interface FrameView {
  mpp: number;
  fitBounds(minX: number, minZ: number, maxX: number, maxZ: number, paddingPx?: number): void;
  setMpp(mpp: number): void;
  setCenter(x: number, z: number): void;
}

/**
 * Cadrage à l'ouverture de la carte tactique : le rectangle des unités (et du joueur), à une échelle bornée.
 * Quand les unités sont éparpillées dans tout Paris (patrouilles, foyers secondaires : cas d'un équipier en
 * lecture seule, qui voit tout le monde), l'échelle plafonnée ne montre qu'une partie du rectangle : on centre
 * alors sur le joueur au lieu du milieu du rectangle, qui tombait loin de lui (il ne se trouvait plus sur la carte).
 */
export function tacticalFrame(
  v: FrameView, minX: number, minZ: number, maxX: number, maxZ: number, player: { x: number; z: number } | null,
  minMpp: number, maxMpp: number, paddingPx = 90,
): void {
  v.fitBounds(minX, minZ, maxX, maxZ, paddingPx);
  const fitted = v.mpp;
  v.setMpp(Math.min(maxMpp, Math.max(minMpp, fitted)));
  if (player && fitted > maxMpp * 1.001) v.setCenter(player.x, player.z);
}

export class TacticalState {
  /** Clés des unités sélectionnées (MapUnit.key). */
  readonly selection = new Set<number>();
  mode: TacticalMode = IDLE;
  /** Outil de la carte : main (déplacer, sélectionner) ou cadre de sélection. */
  tool: 'main' | 'box' = 'main';
  /** Sélection multiple : chaque toucher ajoute ou retire une unité (utile au doigt et à la manette). */
  multi = false;
  tab: TacticalTab = 'ordres';
  leftOpen = true;
  rightOpen = true;
  focusIncident = 0;
  focusStation = 0;
  focusClosure = 0;
  /** Foule touchée sur la carte (clé de SceneCrowdExits : 'f' + foyer…), visée par « Fermer la nasse » ; '' : aucune. */
  focusCrowd = '';
  /** Unité survolée (carte ou liste) et unité cible d'un dépôt d'incident. */
  hoverKey = 0;
  dropKey = 0;
  /**
   * Option de « Barrer la rue » : true = « Passants : laissés passer » (manifestants et véhicules restent bloqués),
   * false = « Passants : bloqués » (défaut). Retenue pour les ordres suivants.
   */
  passersby = false;
  /** Vrai dès qu'un changement attend d'être reflété à l'écran. */
  dirty = true;
  revision = 0;

  touch(): void {
    this.dirty = true;
    this.revision++;
  }

  select(key: number, additive: boolean): void {
    if (!additive) {
      if (this.selection.size === 1 && this.selection.has(key)) return;
      this.selection.clear();
      this.selection.add(key);
    } else if (this.selection.has(key)) this.selection.delete(key);
    else this.selection.add(key);
    this.touch();
  }

  setSelection(keys: Iterable<number>): void {
    this.selection.clear();
    for (const k of keys) this.selection.add(k);
    this.touch();
  }

  clearSelection(): void {
    if (this.selection.size === 0) return;
    this.selection.clear();
    this.touch();
  }

  /** Bascule « Passants : bloqués / laissés passer » (touche B, bouton de la palette et de l'ordre rapide). */
  togglePassersby(): boolean {
    this.passersby = !this.passersby;
    this.touch();
    return this.passersby;
  }

  setMode(mode: TacticalMode): void {
    this.mode = mode;
    this.touch();
  }

  setTab(tab: TacticalTab, open = true): void {
    this.tab = tab;
    if (open) this.rightOpen = true;
    this.touch();
  }
}
