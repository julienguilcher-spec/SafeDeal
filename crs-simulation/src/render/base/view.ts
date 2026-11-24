/* =====================================================================================
 * Vue 3D : crée le WebGLRenderer, la scène, la caméra et le groupe « monde », puis orchestre à
 * chaque image le rig de caméra, le ciel, la lumière, le brouillard, la pluie, les lumières
 * dynamiques et les effets d'écran. Implémente ViewApi (ctx.view).
 * ===================================================================================== */

import * as THREE from 'three';
import type { GameContext, QualityLevel, ViewApi } from '@/core/contracts';
import type { EnvExtApi } from '@/env/api';
import type { RenderBaseApi, RenderStats } from './api';
import { bodiesFromEnvState, computeAtmosphere, createAtmosphere, fogDensityFor, visibilityFor } from './atmosphere';
import { AuxView } from './auxView';
import { ClearAir } from './clearAir';
import type { Atmosphere, AtmosphereInput } from './atmosphere';
import { CameraRig } from './cameraRig';
import { Lighting } from './lighting';
import { LightPool } from './lights';
import { baseDrawDistance, effectivePixelRatio, presetFor, shadowsEnabled } from './quality';
import type { QualityPreset } from './quality';
import { Rain } from './rain';
import { ScreenFxOverlay, ScreenFxState } from './screenFx';
import type { ScreenEffect } from './screenFx';
import { Sky } from './sky';
import { SharedUniformsHub } from './uniforms';
import { DEG, clamp, clamp01, damp } from './util';

const CAMERA_FAR = 8000;
const EMA = 0.08;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class RenderView implements ViewApi, RenderBaseApi {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly world: THREE.Group;
  readonly rig: CameraRig;
  readonly lights: LightPool;
  readonly shared = new SharedUniformsHub();
  /** Voile d'air clair des monuments (insensible à la distance d'affichage). */
  readonly clearAir = new ClearAir();
  /** Vue annexe (retour vidéo du drone) : dessinée avant l'image principale, à faible cadence. */
  readonly aux = new AuxView();
  readonly stats: RenderStats = {
    drawCalls: 0, triangles: 0, prepareMs: 0, renderMs: 0, width: 0, height: 0, pixelRatio: 1,
    lightsWanted: 0, lightsLit: 0, rainStreaks: 0,
  };
  paused = false;

  private preset: QualityPreset;
  private readonly sky: Sky;
  private readonly lighting: Lighting;
  private readonly rain: Rain;
  private readonly fx = new ScreenFxState();
  private readonly overlay: ScreenFxOverlay | null;
  private readonly atm: Atmosphere = createAtmosphere();
  private readonly atmIn: AtmosphereInput = {
    sunX: 0, sunY: 1, sunZ: 0, sunElevDeg: 60, moonX: 0, moonY: -1, moonZ: 0, moonElevDeg: -60, moonPhase: 1,
    clouds: 0.1, fog: 0, rain: 0, lightning: 0, streetLights: 0,
  };
  private readonly canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private sizeDirty = true;
  private settingsDirty = true;
  private drawDistance_ = 500;
  private visibility_ = 500;
  private streetLevel = 0;
  private wetLevel = 0;
  private nightLevel = 0;
  private cloudX = 0;
  private cloudZ = 0;
  private contextLost = false;
  private antialiasWarned = false;
  private readonly unsubscribe: (() => void)[] = [];
  private readonly onWindowResize = (): void => {
    this.sizeDirty = true;
  };

  constructor(private readonly ctx: GameContext, private readonly container: HTMLElement) {
    const settings = ctx.settings.values;
    this.preset = presetFor(settings.quality);
    const renderer = new THREE.WebGLRenderer({
      antialias: this.preset.antialias,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(0x8fa3b8, 1);
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.outline = 'none';
    this.canvas.style.touchAction = 'none';
    this.canvas.setAttribute('aria-label', 'Vue du jeu');
    container.insertBefore(this.canvas, container.firstChild);

    this.scene = new THREE.Scene();
    this.scene.name = 'scene';
    this.camera = new THREE.PerspectiveCamera(clamp(settings.fov, 30, 120), 16 / 9, 0.1, CAMERA_FAR);
    this.camera.name = 'camera';
    this.scene.add(this.camera);
    this.world = new THREE.Group();
    this.world.name = 'monde';
    this.scene.add(this.world);

    this.sky = new Sky(this.preset);
    this.scene.add(this.sky.mesh);
    this.lighting = new Lighting(renderer, this.scene);
    this.rain = new Rain(this.preset);
    this.scene.add(this.rain.mesh);
    this.lights = new LightPool(this.scene, this.preset.pointLights, this.preset.spotLights);
    this.rig = new CameraRig(ctx, this.camera);

    let overlay: ScreenFxOverlay | null = null;
    try {
      overlay = new ScreenFxOverlay(container, this.canvas);
    } catch (err) {
      console.error('[render] surcouches d’effets d’écran indisponibles', err);
    }
    this.overlay = overlay;

    // redimensionnement : le conteneur fait foi
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onWindowResize);
      this.resizeObserver.observe(container);
    }
    window.addEventListener('resize', this.onWindowResize);
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.warn('[render] contexte WebGL perdu : rendu suspendu');   // (cas prévu : le rendu reprend à la restauration)
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.sizeDirty = true;
      this.settingsDirty = true;
    });
    this.unsubscribe.push(ctx.events.on('settings:changed', () => {
      this.settingsDirty = true;
    }));
    this.applySettings();
    this.resize();
    // première image cohérente avant même la première frame
    this.prepare(0);
  }

  // ───────────────────────────── ViewApi ─────────────────────────────

  get quality(): QualityLevel {
    return this.preset.level;
  }

  get drawDistance(): number {
    return this.drawDistance_;
  }

  get camX(): number {
    return this.camera.position.x;
  }

  get camY(): number {
    return this.camera.position.y;
  }

  get camZ(): number {
    return this.camera.position.z;
  }

  shake(amount: number, seconds: number): void {
    this.rig.shake(amount, seconds);
  }

  setScreenEffect(effect: ScreenEffect, amount: number): void {
    this.fx.set(effect, amount);
  }

  // ───────────────────────────── RenderBaseApi ─────────────────────────────

  get shadows(): boolean {
    return this.lighting.shadows;
  }

  get visibility(): number {
    return this.visibility_;
  }

  get exposure(): number {
    return this.renderer.toneMappingExposure;
  }

  get sun(): THREE.Light {
    return this.lighting.sun;
  }

  get hemisphere(): THREE.HemisphereLight {
    return this.lighting.hemi;
  }

  /** Niveau courant d'un effet d'écran (bancs d'essai, tests). */
  screenEffect(effect: ScreenEffect): number {
    return this.fx.get(effect);
  }

  snap(): void {
    const env = this.ctx.env.state;
    this.streetLevel = env.streetLights ? 1 : 0;
    this.wetLevel = clamp01(env.wetness);
    this.nightLevel = -1;
  }

  clearScreenEffects(): void {
    this.fx.reset();
    if (this.overlay) this.overlay.apply(this.fx);
  }

  renderNow(): void {
    this.prepare(0);
    this.present(0);
  }

  // ───────────────────────────── cycle ─────────────────────────────

  /** Remise à zéro de session : coupe de caméra, effets d'écran effacés, éclats lumineux éteints. */
  reset(): void {
    this.rig.reset();
    this.fx.reset();
    this.lights.clearFlashes();
    this.cloudX = 0;
    this.cloudZ = 0;
    // l'état lissé repart de la valeur exacte du nouvel environnement
    this.snap();
  }

  /** Prépare l'image : caméra, ciel, lumière, pluie, lumières dynamiques, effets d'écran. */
  prepare(dt: number): void {
    const t0 = now();
    const ctx = this.ctx;
    if (this.settingsDirty) this.applySettings();
    if (this.sizeDirty) this.resize();

    const settings = ctx.settings.values;
    this.rig.update(dt, clamp(settings.fov, 30, 120), this.camera.aspect);
    const cam = this.camera.position;

    // ── environnement ──
    const env = ctx.env.state;
    const ext = ctx.service<EnvExtApi>('env.ext');
    const inp = this.atmIn;
    let lightning = 0;
    let lightningX = 1;
    let lightningZ = 0;
    if (ext) {
      const sky = ext.sky;
      inp.sunX = sky.sunX; inp.sunY = sky.sunY; inp.sunZ = sky.sunZ;
      inp.sunElevDeg = sky.sunElevation / DEG;
      inp.moonX = sky.moonX; inp.moonY = sky.moonY; inp.moonZ = sky.moonZ;
      inp.moonElevDeg = sky.moonElevation / DEG;
      inp.moonPhase = sky.moonPhase;
      lightning = sky.lightning;
      lightningX = sky.lightningX;
      lightningZ = sky.lightningZ;
      this.cloudX = sky.cloudX;
      this.cloudZ = sky.cloudZ;
    } else {
      bodiesFromEnvState(env, inp);
      this.cloudX += env.windX * dt * 2.2;
      this.cloudZ += env.windZ * dt * 2.2;
    }
    inp.clouds = env.clouds;
    inp.fog = env.fog;
    inp.rain = env.rain;
    inp.lightning = lightning;
    // les candélabres montent en puissance en quelques secondes ; le sol brille ou ternit sans à-coup
    this.streetLevel += ((env.streetLights ? 1 : 0) - this.streetLevel) * (dt > 0 ? damp(0.9, dt) : 1);
    this.wetLevel += (clamp01(env.wetness) - this.wetLevel) * (dt > 0 ? damp(2, dt) : 1);
    inp.streetLights = this.streetLevel;
    const atm = computeAtmosphere(inp, this.atm);
    this.nightLevel = this.nightLevel < 0 || dt <= 0 ? atm.night : this.nightLevel + (atm.night - this.nightLevel) * damp(1.5, dt);

    // ── brouillard, distance d'affichage ──
    const clear = baseDrawDistance(settings, this.preset);
    const vis = visibilityFor(clear, env.fog, env.rain);
    this.visibility_ = vis;
    // inutile de dessiner plus loin que ce que le brouillard laisse voir (par paliers de 10 m)
    let draw = Math.min(clear, Math.ceil((vis * 1.15) / 10) * 10);
    let density = fogDensityFor(vis);
    if (this.rig.mode === 'tactical') {
      // vue de commandement : on regarde le sol depuis très haut ; la brume ne doit pas noyer la carte,
      // et tout ce qui est sous la caméra doit rester dans la distance d'affichage
      const above = Math.max(1, cam.y - ctx.world.heightAt(cam.x, cam.z));
      density *= Math.min(1, 110 / above);
      draw = Math.max(draw, Math.ceil((above * 1.7 + 150) / 10) * 10);
    }
    this.drawDistance_ = draw;
    this.lighting.apply(atm, density);
    this.clearAir.update(env.fog, env.rain);

    // ── ombres : portée selon la hauteur de la caméra (vues hautes) ──
    if (this.lighting.shadows) {
      const above = cam.y - ctx.world.heightAt(cam.x, cam.z);
      this.lighting.setShadowDistance(Math.max(this.preset.shadowDistance, above * 2.4));
    }

    // ── ciel, pluie ──
    this.sky.update(dt, atm, env.clouds, inp.sunX, inp.sunY, inp.sunZ, inp.moonX, inp.moonY, inp.moonZ,
      this.cloudX, this.cloudZ, lightning, lightningX, lightningZ);
    this.rain.update(dt, env.rain, env.windX, env.windZ, cam.x, cam.y, cam.z, atm.dayLevel * 0.85 + 0.15 * this.streetLevel + lightning);

    // ── effets d'écran (les lumières dynamiques sont attribuées dans present(), une fois que tous les
    //    modules de rendu ont fait leurs demandes pour cette image) ──
    this.fx.update(dt);
    if (this.overlay) this.overlay.apply(this.fx);

    // ── uniformes partagés ──
    const u = this.shared.uniforms;
    u.uTime.value = (u.uTime.value + dt) % 3600;
    u.uWetness.value = this.wetLevel;
    u.uRain.value = env.rain;
    u.uWind.value.set(env.windX, Math.hypot(env.windX, env.windZ), env.windZ);
    u.uSunDir.value.set(atm.lightX, atm.lightY, atm.lightZ);
    u.uSunColor.value.setRGB(atm.lightColor[0]! * atm.lightIntensity, atm.lightColor[1]! * atm.lightIntensity, atm.lightColor[2]! * atm.lightIntensity);
    u.uDaylight.value = env.daylight;
    u.uNight.value = this.nightLevel;
    u.uStreetLights.value = this.streetLevel;
    u.uFogColor.value.copy(this.lighting.fog.color);
    u.uLightning.value = lightning;
    u.uSkyColor.value.setRGB(atm.skyReflect[0]!, atm.skyReflect[1]!, atm.skyReflect[2]!);

    const st = this.stats;
    st.rainStreaks = this.rain.drawn;
    st.prepareMs += (now() - t0 - st.prepareMs) * EMA;
  }

  /** Attribue les lumières dynamiques demandées pour cette image, puis dessine. */
  present(dt: number): void {
    const t0 = now();
    const cam = this.camera.position;
    this.lights.update(dt, cam.x, cam.y, cam.z);
    const st = this.stats;
    st.lightsWanted = this.lights.wantedCount;
    st.lightsLit = this.lights.litCount;
    if (this.paused || this.contextLost) return;
    // vue annexe d'abord : elle occupe un coin du tampon que l'image principale efface ensuite
    if (this.aux.active) this.aux.draw(this.renderer, this.scene);
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info.render;
    st.drawCalls = info.calls;
    st.triangles = info.triangles;
    st.renderMs += (now() - t0 - st.renderMs) * EMA;
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    window.removeEventListener('resize', this.onWindowResize);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.overlay?.dispose();
    this.aux.dispose();
    this.lights.dispose();
    this.rain.dispose();
    this.sky.dispose();
    this.lighting.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ───────────────────────────── interne ─────────────────────────────

  /** Applique les réglages : préréglage de qualité, ombres, densité de pixels, budgets. */
  private applySettings(): void {
    this.settingsDirty = false;
    const settings = this.ctx.settings.values;
    const preset = presetFor(settings.quality);
    if (preset !== this.preset) {
      if (preset.antialias !== this.preset.antialias && !this.antialiasWarned) {
        this.antialiasWarned = true;
        console.info('[render] l’anticrénelage ne change qu’au prochain lancement du jeu (il est fixé à la création du contexte WebGL)');
      }
      this.preset = preset;
      this.sky.setQuality(preset);
      this.rain.setQuality(preset);
      this.lights.setBudget(preset.pointLights, preset.spotLights);
    }
    this.lighting.configure(preset, shadowsEnabled(settings, preset));
    if (this.overlay) this.overlay.blur = preset.screenBlur;
    this.sizeDirty = true;
  }

  private resize(): void {
    this.sizeDirty = false;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (!(w > 0) || !(h > 0)) {
      this.sizeDirty = true;
      return;
    }
    const pr = effectivePixelRatio(window.devicePixelRatio, this.preset, this.ctx.settings.values.renderScale);
    const r = this.renderer;
    if (r.getPixelRatio() !== pr) r.setPixelRatio(pr);
    r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const st = this.stats;
    st.width = Math.floor(w * pr);
    st.height = Math.floor(h * pr);
    st.pixelRatio = pr;
  }
}
