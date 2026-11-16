/* =====================================================================================
 * Effets visuels — API publique du module et formes des services facultatifs qu'il consomme.
 *
 * Service publié : ctx.service<FxRenderApi>('render.fx').
 *
 * Le module n'importe aucun autre module : les services étendus qu'il lit sont décrits ici par
 * leur FORME minimale (typage structurel). Tous sont facultatifs — absents, l'effet correspondant
 * est simplement omis ou remplacé par une valeur par défaut.
 * ===================================================================================== */

import type { EntityId, FxId, Prop, QualityLevel, Shop, Vec2 } from '@/core/contracts';
import type { FxBudget } from './budget';

export const FX_RENDER_SERVICE = 'render.fx';

/** Clés des services facultatifs consommés. */
export const FX_HAZARD_FIELD_KEY = 'hazards.field';
export const FX_LIGHTS_KEY = 'render.lights';
export const FX_RENDER_BASE_KEY = 'render.base';
export const FX_VEHICLES_RENDER_KEY = 'vehiclesRender';
export const FX_PROPS_EXT_KEY = 'props.ext';

/** Nappe de feu au sol (forme lue dans 'hazards.field'). */
export interface FxFireView {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly intensity: number;
  readonly age: number;
}

/** Forme minimale du service 'hazards.field' (voir docs/modules/simu-gaz-feu.md). */
export interface FxHazardField {
  readonly cellSize: number;
  readonly revision: number;
  forEachActiveCell(
    cb: (x: number, z: number, gas: number, smoke: number, color: number) => void,
    minDensity?: number, cx?: number, cz?: number, radius?: number,
  ): number;
  /** Facultatif : même parcours sans rappel, 5 nombres par cellule (x, z, gaz, fumée, couleur). */
  collectActiveCells?(out: Float32Array, minDensity?: number, cx?: number, cz?: number, radius?: number): number;
  readonly fires: readonly FxFireView[];
  readonly driftX?: number;
  readonly driftZ?: number;
  driftAt?(x: number, z: number, out: Vec2): Vec2;
}

/** Forme minimale d'une lumière de la réserve du rendu de base. */
export interface FxDynamicLight {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  range: number;
  priority: number;
  enabled: boolean;
  flicker: number;
  release(): void;
}

/** Forme minimale du service 'render.lights'. */
export interface FxLightsApi {
  point(init?: Partial<Pick<FxDynamicLight, 'x' | 'y' | 'z' | 'color' | 'intensity' | 'range' | 'priority' | 'enabled' | 'flicker'>>): FxDynamicLight;
  flash(x: number, y: number, z: number, color: number, intensity: number, range: number, seconds: number): void;
  pulse?(x: number, y: number, z: number, color: number, intensity: number, radius: number): void;
}

/** Forme minimale du service 'render.base' : lumières du soleil et du ciel, pour s'y accorder. */
export interface FxRenderBase {
  readonly sun?: { color: { r: number; g: number; b: number }; intensity: number; position: { x: number; y: number; z: number } };
  readonly hemisphere?: {
    color: { r: number; g: number; b: number };
    groundColor: { r: number; g: number; b: number };
    intensity: number;
  };
}

/** Forme minimale du service 'vehiclesRender' : on lui demande de ne plus dessiner ses propres flammes. */
export interface FxVehiclesRender {
  ownFire: boolean;
}

/** Forme minimale du service 'props.ext' : présence d'une batterie, éléments d'une barricade. */
export interface FxPropsExt {
  propView?(prop: Prop): { battery?: number | boolean } | null | undefined;
}

export interface FxRenderStats {
  /** Quads dessinés dans la couche de particules à la dernière image. */
  sprites: number;
  /** Particules libres vivantes. */
  particles: number;
  /** Bouffées des nuages (champ de gaz et de fumée). */
  puffs: number;
  /** Cellules du champ lues à la dernière reconstruction, et niveau de surcharge (0 = normal). */
  cells: number;
  lodBias: number;
  /** Flammes persistantes dessinées et foyers suivis. */
  flames: number;
  fires: number;
  /** Décalques persistants vivants et quads de la couche des décalques (lueurs comprises). */
  decals: number;
  decalQuads: number;
  /** Projectiles dessinés. */
  projectiles: number;
  /** Jets d'eau actifs. */
  jets: number;
  /** Appels de dessin du module à la dernière image (au plus 3) et triangles envoyés. */
  drawCalls: number;
  triangles: number;
  /** Temps CPU de frame() (ms) : dernière image, moyenne glissante, maximum depuis la remise à zéro. */
  cpuMs: number;
  cpuMsAvg: number;
  cpuMsMax: number;
  /** Événements d'effet traités à la dernière image / abandonnés (file pleine) depuis la remise à zéro. */
  events: number;
  eventsDropped: number;
  /** Particules refusées (réserve pleine) et quads refusés depuis la remise à zéro. */
  particlesDropped: number;
  spritesDropped: number;
  /** Lumières candidates à la dernière image. */
  lights: number;
}

export interface FxEmitOptions {
  size?: number;
  dirX?: number;
  dirY?: number;
  dirZ?: number;
  color?: number;
  seconds?: number;
}

export interface FxRenderApi {
  readonly stats: FxRenderStats;
  /** Budget courant (suit ctx.view.quality). */
  readonly budget: FxBudget;
  readonly quality: QualityLevel;
  /** Joue un effet tout de suite, sans passer par le bus (même sémantique que l'événement 'fx'). */
  emit(id: FxId, x: number, y: number, z: number, options?: FxEmitOptions): void;
  /** Efface particules, décalques, traînées et lumières (changement de scène d'un banc d'essai). */
  clear(): void;
  /** Dessine les flammes et la fumée des véhicules en feu (défaut : true ; coupe alors celles du rendu des véhicules). */
  vehicleFire: boolean;
  /** Entité dont les effets attachés ne sont pas dessinés (0 = aucune) : sert à la vue subjective d'une personne en feu. */
  hiddenPersonId: EntityId;
}

/** Références d'entités brûlantes relues par le module (documentation des champs utilisés). */
export type FxBurningShop = Pick<Shop, 'x' | 'y' | 'z' | 'heading' | 'width' | 'burning' | 'dormant'>;
