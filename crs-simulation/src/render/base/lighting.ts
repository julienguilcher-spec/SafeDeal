/* =====================================================================================
 * Lumière naturelle de la scène : soleil (ou lune) directionnel avec ombres en cascade, lumière
 * d'hémisphère, brouillard atmosphérique exponentiel, exposition.
 *
 * Ombres : THREE.SunLight (r187) ajuste deux cascades au champ de la caméra à chaque image, avec
 * une projection stable en rotation (sphère englobante) et un alignement sur les texels : l'ombre
 * suit la caméra sans scintiller. Comme le soleil bouge, sa direction n'est transmise à l'ombre
 * que par pas d'un quart de degré, pour que la projection reste fixe entre deux pas.
 * ===================================================================================== */

import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { toneMapAces } from './atmosphere';
import type { Atmosphere } from './atmosphere';
import type { QualityPreset } from './quality';
import { DEG } from './util';

/** Pas angulaire de mise à jour de la direction de la lumière (rad). */
export const LIGHT_DIRECTION_STEP = 0.25 * DEG;

/**
 * Faut-il transmettre la nouvelle direction à la lumière ? Oui si elle s'écarte de plus d'un pas
 * de celle en vigueur (les deux unitaires).
 */
export function directionChanged(ax: number, ay: number, az: number, bx: number, by: number, bz: number, step = LIGHT_DIRECTION_STEP): boolean {
  const dot = ax * bx + ay * by + az * bz;
  return dot < Math.cos(step);
}

export class Lighting {
  readonly sun: SunLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  /** Direction en vigueur de la lumière directionnelle (vers l'astre). */
  private dirX = 0;
  private dirY = 1;
  private dirZ = 0;
  private wasMoon = false;
  private shadowsOn = false;
  private shadowFar = 0;
  private readonly fogDisplay = new Float32Array(3);

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene) {
    this.sun = new SunLight(0xffffff, 3);
    this.sun.name = 'soleil';
    this.sun.position.set(0, 1, 0);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.hemi.name = 'ciel-ambiance';
    this.fog = new THREE.FogExp2(0xb8c8d8, 0.003);
    scene.add(this.sun, this.hemi);
    scene.fog = this.fog;
  }

  get shadows(): boolean {
    return this.shadowsOn;
  }

  /** Applique un préréglage : taille et portée des ombres, ou pas d'ombre du tout. */
  configure(preset: QualityPreset, shadows: boolean): void {
    const on = shadows && preset.shadowMapSize > 0;
    const r = this.renderer;
    const sh = this.sun.shadow;
    if (on) {
      if (sh.mapSize.x !== preset.shadowMapSize) {
        sh.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
        // la texture est recréée à la bonne taille au prochain rendu
        if (sh.map) {
          sh.map.dispose();
          sh.map = null;
        }
      }
      sh.radius = preset.shadowRadius;
      sh.bias = -0.00025;
      sh.normalBias = 0.035;
      sh.camera.near = 1;
      this.shadowFar = 0;
    }
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.shadowsOn = on;
  }

  /**
   * Portée des ombres depuis la caméra (m). Les cascades couvrent le champ de vision jusqu'à cette
   * distance : en vue haute (drone, tactique) il faut l'allonger pour atteindre le sol.
   */
  setShadowDistance(distance: number): void {
    // par paliers : chaque changement redécoupe les cascades
    const d = Math.ceil(distance / 20) * 20;
    if (d === this.shadowFar) return;
    this.shadowFar = d;
    const cam = this.sun.shadow.camera;
    cam.far = d;
    cam.updateProjectionMatrix();
  }

  /** Applique l'atmosphère calculée : lumières, brouillard, exposition. */
  apply(atm: Atmosphere, fogDensity: number): void {
    const sun = this.sun;
    // direction : par pas, et d'un coup au passage soleil ↔ lune (l'intensité est alors nulle)
    if (atm.lightIsMoon !== this.wasMoon || directionChanged(this.dirX, this.dirY, this.dirZ, atm.lightX, atm.lightY, atm.lightZ)) {
      this.dirX = atm.lightX;
      this.dirY = atm.lightY;
      this.dirZ = atm.lightZ;
      this.wasMoon = atm.lightIsMoon;
      sun.position.set(this.dirX, this.dirY, this.dirZ);
    }
    sun.color.setRGB(atm.lightColor[0]!, atm.lightColor[1]!, atm.lightColor[2]!);
    sun.intensity = atm.lightIntensity;
    this.hemi.color.setRGB(atm.hemiSky[0]!, atm.hemiSky[1]!, atm.hemiSky[2]!);
    this.hemi.groundColor.setRGB(atm.hemiGround[0]!, atm.hemiGround[1]!, atm.hemiGround[2]!);
    this.hemi.intensity = atm.hemiIntensity;
    // Three.js applique le brouillard après le tone mapping : on lui donne la couleur déjà « développée »,
    // celle qu'aura la brume d'horizon du ciel à l'écran
    toneMapAces(atm.fogColor[0]!, atm.fogColor[1]!, atm.fogColor[2]!, atm.exposure, this.fogDisplay);
    this.fog.color.setRGB(this.fogDisplay[0]!, this.fogDisplay[1]!, this.fogDisplay[2]!);
    this.fog.density = fogDensity;
    this.renderer.toneMappingExposure = atm.exposure;
  }

  dispose(): void {
    this.scene.remove(this.sun, this.hemi);
    if (this.scene.fog === this.fog) this.scene.fog = null;
    this.sun.dispose();
    this.hemi.dispose();
  }
}
