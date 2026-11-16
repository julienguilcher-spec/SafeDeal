/* =====================================================================================
 * RENDU DU MOBILIER URBAIN, DES VITRINES ET DES BARRICADES — API publique.
 *
 * Service publié : ctx.service<PropsRenderApi>('propsRender') (dès provide()).
 *
 * Ce que le module LIT (jamais écrit) :
 *   - ctx.props.list : kind, x, y, z, heading, halfX, halfZ, height (ils changent au renversement et
 *     à la combustion), state, toppled, tags, carriedBy, dormant ;
 *   - ctx.props.shops : name, category, x, y, z, heading, width, window, shutter, stock, burning, dormant ;
 *   - ctx.env.state : streetLights, isNight, daylight ; ctx.view : scène, caméra, qualité, distance.
 * Événements écoutés : prop:spawned / removed / damaged / moved, shop:window / shutter / looted,
 * fire:started / fire:out, barricade:built, settings:changed, et les événements libres de la simulation
 * du décor ('props:glass', 'props:shutter_forced', 'props:barricade_extended', 'props:barricade_cleared').
 * Les listes sont en outre relues par tranches (objets déplacés ou modifiés sans événement, vitrines
 * créées ou retirées — aucun événement n'existe pour elles).
 *
 * Services FACULTATIFS (le module fonctionne sans eux) — formes attendues ci-dessous, compatibles avec
 * src/sim/props/api.ts et src/render/base/api.ts :
 *   - 'props.ext'       : vitrages restants d'un objet, rideau forcé / boutique calcinée / tags d'une
 *                         vitrine, composition réelle d'une barricade ;
 *   - 'render.lights'   : quelques vraies lumières pour les candélabres et les feux proches ;
 *   - 'render.uniforms' : niveau de nuit et d'allumage lissés, couleur du ciel pour les reflets.
 * ===================================================================================== */

import type { EntityId, Prop, Shop } from '@/core/contracts';

export const PROPS_RENDER_KEY = 'propsRender';
export const PROPS_EXT_KEY = 'props.ext';
export const RENDER_LIGHTS_KEY = 'render.lights';
export const RENDER_UNIFORMS_KEY = 'render.uniforms';

/** Sous-ensemble de PropsExtApi (simulation du décor) utilisé par le rendu. */
export interface PropsExtLike {
  propView(prop: Prop, out?: PropViewLike): PropViewLike | null;
  shopView(shop: Shop, out?: ShopViewLike): ShopViewLike | null;
  barricadeParts(id: EntityId): readonly BarricadePartLike[];
}
export interface PropViewLike { panesLeft: number }
export interface ShopViewLike { hasShutter: boolean; forced: boolean; boards: number; tags: number; burnt: boolean }
export interface BarricadePartLike {
  readonly kind: string;
  readonly lx: number;
  readonly lz: number;
  readonly heading: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly height: number;
}

/** Sous-ensemble de RenderLightsApi (rendu de base) utilisé par le rendu du décor. */
export interface LightLike {
  x: number; y: number; z: number;
  color: number;
  intensity: number;
  range: number;
  priority: number;
  enabled: boolean;
  flicker: number;
  release(): void;
}
export interface LightsLike {
  point(init?: Partial<Pick<LightLike, 'x' | 'y' | 'z' | 'color' | 'intensity' | 'range' | 'priority' | 'enabled' | 'flicker'>>): LightLike;
}

/** Sous-ensemble de RenderUniformsApi (rendu de base). */
export interface UniformsLike {
  readonly uniforms: {
    uNight: { value: number };
    uStreetLights: { value: number };
    uSkyColor: { value: { r: number; g: number; b: number } };
  };
}

export interface PropsRenderStats {
  /** Objets et vitrines suivis. */
  props: number;
  shops: number;
  /** Morceaux de 128 m connus, et morceaux construits (dans la distance d'affichage). */
  chunks: number;
  builtChunks: number;
  /** Objets en mouvement redessinés à chaque image. */
  dynamic: number;
  /** Halos et taches de lumière. */
  halos: number;
  /** Vraies lumières demandées au rendu de base. */
  lights: number;
  /** Appels de dessin du module à la dernière image (passe principale / passe d'ombre) et triangles. */
  drawCalls: number;
  shadowCalls: number;
  triangles: number;
  /** Temps CPU de frame() (ms) : dernière image, moyenne glissante, maximum depuis la remise à zéro. */
  cpuMs: number;
  cpuMsAvg: number;
  cpuMsMax: number;
  /** Morceaux reconstruits et objets réécrits en place depuis le début ; durée de la dernière reconstruction (ms). */
  rebuilds: number;
  rewrites: number;
  rebuildMs: number;
  /** Modèles construits (types × niveaux × états), cellules d'enseigne occupées, envois de l'atlas. */
  models: number;
  signs: number;
  atlasUploads: number;
}

export interface PropsRenderApi {
  readonly stats: PropsRenderStats;
  /**
   * Objets et vitrines endormis (loin de toute personne) : 'lointain' = dessinés seulement en version
   * lointaine (défaut : pas d'apparition brutale du mobilier ni des lanternes à la limite d'éveil) ;
   * 'masque' = non dessinés.
   */
  dormantMode: 'lointain' | 'masque';
  /** Force la reconstruction de tout l'affichage (changement de qualité, de définitions). */
  invalidate(): void;
  /** Remet à zéro le maximum de temps CPU. */
  resetPeak(): void;
}
