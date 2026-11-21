/* =====================================================================================
 * HUD — types internes : état lu une fois par image, contrat d'un élément du HUD.
 * ===================================================================================== */

import type {
  Button, CameraMode, GameContext, InputDevice, Person, PlayableRole, SeatRole, Vehicle,
} from '@/core/contracts';
import type { HudSlot } from '@/core/extensions';
import type { ObjectivesStore } from '../core/objectives';
import type { HudProfile } from './model';

export type TouchMode = 'none' | 'pied' | 'vehicule' | 'drone';

/** Instantané de la situation du joueur, recalculé une fois par image (objet réutilisé). */
export interface HudState {
  person: Person | null;
  vehicle: Vehicle | null;
  seat: SeatRole | null;
  role: PlayableRole;
  camera: CameraMode;
  profile: HudProfile;
  device: InputDevice;
  /** Disposition de la surcouche tactile affichée ('none' si elle est masquée). */
  touch: TouchMode;
  /** Écran bas (téléphone en paysage). */
  compact: boolean;
  /** Taille de la zone d'affichage (px). */
  width: number;
  height: number;
  /** Position de référence du joueur (personne incarnée, sinon caméra). */
  x: number;
  z: number;
  /** Cap du regard (rad). */
  yaw: number;
  /** Temps réel écoulé depuis la création du HUD (s). */
  time: number;
}

export interface HudEnv {
  readonly ctx: GameContext;
  readonly objectives: ObjectivesStore;
  /** Libellé courant de la touche d'une action (« E », « X »…). */
  keyLabel(button: Button): string;
}

/**
 * Élément interne du HUD. `slot` : zone d'accueil selon la disposition, ou null pour un calque
 * plein écran. `frame` ne fait que des transformations (aucune mise en page) ; `tick` (≈ 8 Hz)
 * met à jour textes et listes, et seulement quand la valeur change.
 */
export interface HudPart {
  readonly id: string;
  readonly el: HTMLElement;
  /** Rang dans sa zone (plus petit = plus près du bord d'ancrage haut). */
  readonly order: number;
  slot(state: HudState): HudSlot | null;
  visible(state: HudState): boolean;
  frame?(dt: number, state: HudState): void;
  tick?(state: HudState): void;
  /** Appelé quand l'élément vient d'être masqué (remise à zéro des effets). */
  hidden?(): void;
  reset?(): void;
  dispose?(): void;
}
