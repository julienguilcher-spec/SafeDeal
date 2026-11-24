/* =====================================================================================
 * AIR CLAIR — voile atmosphérique des grands repères (monuments), indépendant de la distance d'affichage.
 *
 * Le brouillard de scène est calé sur la distance d'affichage de la ville : il masque 92 % à 220 m en
 * qualité basse, pour cacher la limite de ce qui est dessiné. Appliqué aux monuments, il délavait l'Arc
 * de Triomphe à 120 m et effaçait la tour Eiffel à 750 m. Les objets confiés à ce service reçoivent à la
 * place le voile d'une atmosphère réelle : visibilité de CLEAR_AIR_VISIBILITY mètres par temps clair,
 * réduite par le brouillard et la pluie selon la même loi que la scène — par brouillard épais, les deux
 * voiles se rejoignent (un monument ne perce pas la brume).
 *
 * Mise en œuvre : chaque maillage confié abaisse la densité du brouillard de scène juste avant d'être
 * dessiné (onBeforeRender) et la rétablit juste après (onAfterRender). Le moteur relit le brouillard de la
 * scène à chaque changement de matériau : le réglage vaut pour ce maillage et pour lui seul, à condition que
 * ses matériaux ne servent pas à des objets non confiés (c'est le cas des monuments, qui ont les leurs).
 * ===================================================================================== */

import type * as THREE from 'three';
import { fogDensityFor, visibilityFor } from './atmosphere';

/** Visibilité (m) de l'air clair, par beau temps. */
export const CLEAR_AIR_VISIBILITY = 5000;

export interface RenderClearAirApi {
  /** Densité (brouillard exponentiel au carré) du voile d'air clair pour la météo courante. */
  readonly density: number;
  /**
   * Confie `root` et toute sa descendance : leurs maillages prennent le voile d'air clair au lieu du brouillard de
   * distance d'affichage. Peut être rappelé à volonté (les maillages déjà équipés sont ignorés) : c'est ainsi que
   * l'on suit un groupe dont le contenu change. Retourne le nombre de maillages nouvellement équipés.
   */
  exempt(root: THREE.Object3D): number;
}

type FogLike = { density?: number } | null | undefined;
type SceneLike = { fog?: FogLike };
type Hook = (renderer: unknown, scene: SceneLike) => void;

export class ClearAir implements RenderClearAirApi {
  density = fogDensityFor(CLEAR_AIR_VISIBILITY);
  /** Densité de la scène mise de côté pendant le dessin d'un maillage confié (−1 : rien en cours). */
  private saved = -1;

  private readonly before: Hook = (_renderer, scene) => {
    const fog = scene.fog;
    if (!fog || typeof fog.density !== 'number' || this.saved >= 0 || fog.density <= this.density) return;
    this.saved = fog.density;
    fog.density = this.density;
  };

  private readonly after: Hook = (_renderer, scene) => {
    if (this.saved < 0) return;
    const fog = scene.fog;
    if (fog && typeof fog.density === 'number') fog.density = this.saved;
    this.saved = -1;
  };

  /** À appeler une fois par image avec l'état de l'environnement (brouillard et pluie, 0..1). */
  update(fog: number, rain: number): void {
    this.density = fogDensityFor(visibilityFor(CLEAR_AIR_VISIBILITY, fog, rain));
  }

  exempt(root: THREE.Object3D): number {
    let added = 0;
    const before = this.before as unknown as THREE.Object3D['onBeforeRender'];
    const after = this.after as unknown as THREE.Object3D['onAfterRender'];
    root.traverse((c) => {
      const o = c as THREE.Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean };
      if (!(o.isMesh || o.isPoints || o.isLine) || o.onBeforeRender === before) return;
      o.onBeforeRender = before;
      o.onAfterRender = after;
      added++;
    });
    return added;
  }
}
