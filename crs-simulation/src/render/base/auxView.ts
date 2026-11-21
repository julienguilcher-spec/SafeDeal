/* =====================================================================================
 * Vue annexe : seconde vue de la scène (retour vidéo du drone), dessinée à faible cadence.
 *
 * Méthode : AVANT l'image principale, la scène est rendue avec la caméra annexe dans le coin bas gauche du
 * tampon par défaut (viewport + scissor), puis ce coin est recopié tout de suite dans le canevas 2D de
 * l'interface (drawImage d'un canevas WebGL : valide tant que l'image n'est pas présentée). L'image principale
 * efface ensuite tout le tampon : rien de la vue annexe n'apparaît à l'écran ailleurs que dans son canevas.
 * Avantages : sortie déjà passée au tone mapping et en sRGB (comme l'image principale), aucune lecture de
 * pixels côté processeur, aucun tampon supplémentaire. Les ombres ne sont pas recalculées pour cette passe
 * (on reprend la carte d'ombres de l'image précédente). Le brouillard est allégé pendant la passe (`fogScale`) :
 * une caméra de drone à 60–120 m voit le sol à travers une brume qui, au ras du sol, borne la vue à quelques
 * centaines de mètres ; le brouillard réglé pour le regard du joueur noierait l'image.
 * ===================================================================================== */

import * as THREE from 'three';
import type { RenderAuxApi } from './api';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface Hook { before: () => void; after: () => void }

export class AuxView implements RenderAuxApi {
  readonly camera = new THREE.PerspectiveCamera(55, 16 / 9, 1.5, 2000);
  active = false;
  target: HTMLCanvasElement | null = null;
  fps = 12;
  range = 450;
  /** Facteur appliqué à la densité du brouillard pendant la passe annexe (1 = inchangé). */
  fogScale = 0.35;
  frames = 0;
  rendering = false;
  /** Durée moyenne d'une passe annexe (ms, lissée) : diagnostic. */
  ms = 0;
  private last = -1e9;
  private forced = false;
  private failures = 0;
  private readonly hooks: Hook[] = [];
  private readonly size = new THREE.Vector2();

  constructor() {
    this.camera.name = 'camera-annexe';
  }

  requestFrame(): void {
    this.forced = true;
  }

  addPassHook(before: () => void, after: () => void): () => void {
    const hook: Hook = { before, after };
    this.hooks.push(hook);
    return () => {
      const i = this.hooks.indexOf(hook);
      if (i >= 0) this.hooks.splice(i, 1);
    };
  }

  /** Une image annexe est-elle à dessiner maintenant ? */
  due(t = now()): boolean {
    if (!this.active || !this.target || this.failures > 3) return false;
    if (this.forced) return true;
    const fps = this.fps > 30 ? 30 : this.fps < 1 ? 1 : this.fps;
    return t - this.last >= 1000 / fps - 2;
  }

  /**
   * Dessine la vue annexe si elle est due. À appeler avant le rendu principal, qui efface tout le tampon.
   * Retourne true si une image a été dessinée.
   */
  draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene): boolean {
    const t = now();
    if (!this.due(t)) return false;
    const target = this.target!;
    if (!target.isConnected || target.width < 2 || target.height < 2) return false;
    const g = target.getContext('2d');
    if (!g) return false;
    this.forced = false;
    this.last = t;

    // zone du tampon (pixels physiques) : la définition de la cible, bornée par le tampon lui-même
    const src = renderer.domElement;
    const pr = renderer.getPixelRatio() || 1;
    renderer.getSize(this.size);
    let bw = Math.min(target.width, src.width);
    let bh = Math.min(target.height, src.height);
    // même rapport que la cible
    const aspect = target.width / target.height;
    if (bw / bh > aspect) bw = Math.max(1, Math.floor(bh * aspect));
    else bh = Math.max(1, Math.floor(bw / aspect));
    const vw = bw / pr;
    const vh = bh / pr;
    const cam = this.camera;
    if (Math.abs(cam.aspect - aspect) > 1e-4) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }

    const shadowAuto = renderer.shadowMap.autoUpdate;
    const autoClear = renderer.autoClear;
    const target0 = renderer.getRenderTarget();
    const fog = scene.fog;
    const fogDensity = fog && (fog as THREE.FogExp2).isFogExp2 ? (fog as THREE.FogExp2).density : -1;
    const fogFar = fog && (fog as THREE.Fog).isFog ? (fog as THREE.Fog).far : -1;
    let ok = false;
    this.rendering = true;
    try {
      for (let i = 0; i < this.hooks.length; i++) this.hooks[i]!.before();
      renderer.shadowMap.autoUpdate = false;
      renderer.autoClear = true;
      const k = this.fogScale > 0 ? this.fogScale : 1;
      if (fogDensity >= 0) (fog as THREE.FogExp2).density = fogDensity * k;
      if (fogFar >= 0) (fog as THREE.Fog).far = fogFar / k;
      renderer.setRenderTarget(null);
      renderer.setViewport(0, 0, vw, vh);
      renderer.setScissor(0, 0, vw, vh);
      renderer.setScissorTest(true);
      renderer.render(scene, cam);
      // le coin bas gauche du tampon (origine GL en bas) correspond au haut du canevas à src.height − bh
      g.drawImage(src, 0, src.height - bh, bw, bh, 0, 0, target.width, target.height);
      ok = true;
      this.frames++;
    } catch (err) {
      if (this.failures++ < 3) console.error('[render] vue annexe : rendu impossible', err);
    } finally {
      for (let i = 0; i < this.hooks.length; i++) {
        try {
          this.hooks[i]!.after();
        } catch (err) {
          console.error('[render] vue annexe : crochet en erreur', err);
        }
      }
      this.rendering = false;
      if (fogDensity >= 0) (fog as THREE.FogExp2).density = fogDensity;
      if (fogFar >= 0) (fog as THREE.Fog).far = fogFar;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, this.size.x, this.size.y);
      renderer.setScissor(0, 0, this.size.x, this.size.y);
      renderer.setRenderTarget(target0);
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAuto;
    }
    this.ms += (now() - t - this.ms) * 0.1;
    return ok;
  }

  dispose(): void {
    this.active = false;
    this.target = null;
    this.hooks.length = 0;
  }
}
