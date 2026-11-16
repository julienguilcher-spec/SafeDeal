/* =====================================================================================
 * Effets visuels — système de présentation (ordre VIEW + 5).
 *
 * Trois maillages instanciés en tout, donc trois appels de dessin au plus :
 *   1. décalques (sol et façades) et lueurs des feux sur le sol ;
 *   2. corps des projectiles ;
 *   3. particules : nuages de gaz et de fumée, flammes, étincelles, eau, débris, traînées.
 *
 * Le module lit la simulation (ctx.projectiles, ctx.props, ctx.vehicles, ctx.people, service
 * 'hazards.field') et écoute les événements 'fx', 'explosion' et 'projectile:impact'. Il ne
 * modifie rien dans la simulation.
 * ===================================================================================== */

import * as THREE from 'three';
import { SystemOrder } from '@/core/contracts';
import type { EntityId, FxId, GameContext, GameSystem, QualityLevel, ViewApi } from '@/core/contracts';
import {
  FX_HAZARD_FIELD_KEY, FX_LIGHTS_KEY, FX_PROPS_EXT_KEY, FX_RENDER_BASE_KEY, FX_RENDER_SERVICE, FX_VEHICLES_RENDER_KEY,
} from './api';
import type {
  FxEmitOptions, FxHazardField, FxLightsApi, FxPropsExt, FxRenderApi, FxRenderBase, FxRenderStats, FxVehiclesRender,
} from './api';
import { budgetFor } from './budget';
import type { FxBudget } from './budget';
import { CloudRenderer } from './cloud';
import { FxCore } from './core';
import { DecalLayer } from './decalLayer';
import { Effects } from './effects';
import { EV_EXPLOSION, EV_IMPACT, FX_CODE, FxEventQueue } from './events';
import { FireRenderer } from './fire';
import { LightRig } from './lights';
import { hash01 } from './mathx';
import { writeParticles } from './particles';
import { ProjectileRenderer } from './projectiles';
import { SpriteLayer } from './spriteLayer';
import { WaterRenderer } from './water';

export const FX_SYSTEM_ID = 'render.fx';
const INV_PI = 1 / Math.PI;
const MAX_GLOW_QUADS = 48;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function emptyStats(): FxRenderStats {
  return {
    sprites: 0, particles: 0, puffs: 0, cells: 0, lodBias: 0, flames: 0, fires: 0, decals: 0, decalQuads: 0,
    projectiles: 0, jets: 0, drawCalls: 0, triangles: 0, cpuMs: 0, cpuMsAvg: 0, cpuMsMax: 0, events: 0,
    eventsDropped: 0, particlesDropped: 0, spritesDropped: 0, lights: 0,
  };
}

/** Tout ce qui dépend de la vue et du niveau de qualité : reconstruit quand la qualité change. */
class FxRuntime {
  readonly budget: FxBudget;
  readonly sprites: SpriteLayer;
  readonly decals: DecalLayer;
  readonly lights: LightRig;
  readonly core: FxCore;
  readonly cloud: CloudRenderer;
  readonly fire: FireRenderer;
  readonly water: WaterRenderer;
  readonly projectiles: ProjectileRenderer;
  readonly effects: Effects;
  readonly group = new THREE.Group();
  /** Triangles de la géométrie réunie des projectiles (par instance). */
  readonly projectileTris: number;

  constructor(ctx: GameContext, readonly view: ViewApi, readonly quality: QualityLevel) {
    const budget = budgetFor(quality);
    this.budget = budget;
    this.sprites = new SpriteLayer(budget.maxSprites, budget.atlasTile, budget.shaderLights);
    let aniso = 1;
    try {
      aniso = view.renderer.capabilities.getMaxAnisotropy();
    } catch { /* rendu factice */ }
    this.decals = new DecalLayer(budget.maxDecals + MAX_GLOW_QUADS, budget.decalAtlas, aniso);
    this.lights = new LightRig(budget.shaderLights);
    this.core = new FxCore(ctx, view, budget, this.sprites, this.decals, this.lights);
    this.cloud = new CloudRenderer(this.core);
    this.fire = new FireRenderer(this.core);
    this.water = new WaterRenderer(this.core);
    this.projectiles = new ProjectileRenderer(this.core);
    this.effects = new Effects(this.core);
    this.projectileTris = this.projectiles.mesh.geometry.getAttribute('position').count / 3;
    this.group.name = 'fx';
    this.group.add(this.decals.mesh, this.projectiles.mesh, this.sprites.mesh);
    view.world.add(this.group);
  }

  clear(): void {
    this.core.clear();
    this.cloud.clear();
    this.fire.clear();
    this.water.clear();
    this.projectiles.clear();
    this.effects.flare.active = false;
  }

  dispose(): void {
    this.lights.reset();
    this.view.world.remove(this.group);
    this.sprites.dispose();
    this.decals.dispose();
    this.projectiles.dispose();
  }
}

export class FxSystem implements GameSystem, FxRenderApi {
  readonly id = FX_SYSTEM_ID;
  readonly order = SystemOrder.VIEW + 5;
  readonly stats: FxRenderStats = emptyStats();
  hiddenPersonId: EntityId = 0;

  private ctx: GameContext | null = null;
  private rt: FxRuntime | null = null;
  private failed = false;
  private errors = 0;
  private readonly queue = new FxEventQueue(512);
  private readonly unsubscribe: (() => void)[] = [];
  private vehicleFire_ = true;
  private topDown = false;
  private sceneScanAt = 0;
  private sunLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private readonly tmpColor = new THREE.Color();

  get budget(): FxBudget {
    return this.rt ? this.rt.budget : budgetFor(this.ctx?.settings.values.quality);
  }

  get quality(): QualityLevel {
    return this.budget.level;
  }

  get vehicleFire(): boolean {
    return this.vehicleFire_;
  }

  set vehicleFire(value: boolean) {
    this.vehicleFire_ = value;
    this.applyVehicleFire();
  }

  /** Accès aux rouages (bancs d'essai, mesures). */
  get runtime(): FxRuntime | null {
    return this.rt;
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide<FxRenderApi>(FX_RENDER_SERVICE, this);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    if (ctx.headless) return;
    const q = this.queue;
    this.unsubscribe.push(
      ctx.events.on('fx', (e) => {
        const code = FX_CODE[e.id] ?? 0;
        if (code === 0) return;
        q.push(
          code, e.x, e.y, e.z, e.size !== undefined ? e.size : 1, e.dirX !== undefined ? e.dirX : 0, e.dirY !== undefined ? e.dirY : 0,
          e.dirZ !== undefined ? e.dirZ : 0, e.color !== undefined ? e.color : -1, e.seconds !== undefined ? e.seconds : 0, '', '',
        );
      }),
      ctx.events.on('explosion', (e) => {
        q.push(EV_EXPLOSION, e.x, e.y, e.z, e.radius, 0, 0, 0, -1, 0, e.kind, '');
      }),
      ctx.events.on('projectile:impact', (e) => {
        q.push(EV_IMPACT, e.x, e.y, e.z, 0, 0, 0, 0, -1, 0, e.kind, e.hitKind);
      }),
    );
    this.ensure();
  }

  private ensure(): FxRuntime | null {
    const ctx = this.ctx;
    if (!ctx || this.failed || ctx.headless) return null;
    const view = ctx.view;
    if (!view) return null;
    const quality = view.quality;
    if (this.rt && this.rt.view === view && this.rt.quality === quality) return this.rt;
    try {
      if (this.rt) this.rt.dispose();
      this.rt = new FxRuntime(ctx, view, quality);
      this.sunLight = null;
      this.hemiLight = null;
      this.sceneScanAt = 0;
      this.applyVehicleFire();
    } catch (err) {
      this.failed = true;
      this.rt = null;
      console.error('[fx] initialisation des effets visuels impossible :', err);
    }
    return this.rt;
  }

  /** Demande au rendu des véhicules de ne pas dessiner ses propres flammes quand ce module s'en charge. */
  private applyVehicleFire(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const vr = ctx.service<FxVehiclesRender>(FX_VEHICLES_RENDER_KEY);
    if (vr && typeof vr === 'object' && 'ownFire' in vr) {
      try {
        vr.ownFire = !this.vehicleFire_;
      } catch { /* service en lecture seule : tant pis */ }
    }
    if (this.rt) {
      this.rt.fire.vehicleFire = this.vehicleFire_;
      // ce rendu-là allume déjà une lumière par véhicule en feu
      this.rt.fire.vehicleLightsElsewhere = !!vr;
    }
  }

  emit(id: FxId, x: number, y: number, z: number, options?: FxEmitOptions): void {
    const code = FX_CODE[id] ?? 0;
    if (code === 0) return;
    const o = options;
    this.queue.push(
      code, x, y, z, o && o.size !== undefined ? o.size : 1, o && o.dirX !== undefined ? o.dirX : 0, o && o.dirY !== undefined ? o.dirY : 0,
      o && o.dirZ !== undefined ? o.dirZ : 0, o && o.color !== undefined ? o.color : -1, o && o.seconds !== undefined ? o.seconds : 0, '', '',
    );
  }

  clear(): void {
    this.queue.clear();
    this.rt?.clear();
  }

  reset(): void {
    this.clear();
    this.queue.dropped = 0;
    this.stats.cpuMsMax = 0;
    this.stats.eventsDropped = 0;
    if (this.rt) {
      this.rt.core.pool.dropped = 0;
      this.rt.core.pool.recycled = 0;
    }
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
    this.unsubscribe.length = 0;
    this.rt?.dispose();
    this.rt = null;
  }

  frame(dt: number): void {
    const rt = this.ensure();
    if (!rt) {
      this.queue.clear();
      return;
    }
    try {
      this.render(rt, dt);
    } catch (err) {
      this.queue.clear();
      if (this.errors++ < 5) console.error('[fx] erreur pendant le rendu des effets :', err);
    }
  }

  private render(rt: FxRuntime, realDt: number): void {
    const t0 = now();
    const ctx = this.ctx!;
    const view = rt.view;
    const core = rt.core;
    const sprites = rt.sprites;
    // temps des effets : figé en pause, accéléré avec la simulation, borné
    const phase = ctx.session.phase;
    let dt = phase === 'paused' ? 0 : realDt * (phase === 'playing' ? ctx.clock.timeScale : 1);
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    core.dt = dt;
    core.time += dt;

    const camera = view.camera;
    camera.updateMatrixWorld();
    sprites.begin(camera, core.time);
    core.camX = sprites.camX; core.camY = sprites.camY; core.camZ = sprites.camZ;
    // vue plongeante : les volumes se couchent (avec hystérésis)
    if (this.topDown) { if (sprites.fwdY > -0.7) this.topDown = false; } else if (sprites.fwdY < -0.82) this.topDown = true;
    core.topDown = this.topDown;

    const env = ctx.env.state;
    const field = ctx.service<FxHazardField>(FX_HAZARD_FIELD_KEY);
    core.windX = field && field.driftX !== undefined ? field.driftX : env.windX * 0.8;
    core.windZ = field && field.driftZ !== undefined ? field.driftZ : env.windZ * 0.8;
    core.night = 1 - (env.daylight < 0 ? 0 : env.daylight > 1 ? 1 : env.daylight);
    core.rain = env.rain;
    core.blood = ctx.settings.values.violence === 'realiste';
    this.applyLighting(rt);

    const lights = rt.lights;
    lights.setSceneApi(ctx.service<FxLightsApi>(FX_LIGHTS_KEY) ?? null, rt.budget.sceneLights);
    lights.begin(dt);

    // événements accumulés pendant les pas de simulation
    const events = this.drain(rt);

    rt.fire.hiddenPersonId = this.hiddenPersonId;
    this.updateFlare(rt, dt);
    rt.water.update();
    rt.fire.update(field, ctx.service<FxPropsExt>(FX_PROPS_EXT_KEY));
    rt.projectiles.update();
    this.beacons(rt);
    core.pool.update(dt, core.windX, core.windZ);
    rt.cloud.update(field);
    writeParticles(core.pool, sprites);

    lights.finish(core.camX, core.camY, core.camZ, dt);
    // le shader divise comme un matériau diffus : éclairement / π
    const col = lights.shaderCol;
    for (let i = 0; i < lights.shaderCount * 3; i++) col[i] = col[i]! * INV_PI;
    sprites.setLights(lights.shaderPos, col, lights.shaderCount);
    const drawn = sprites.finish();

    const decals = rt.decals;
    decals.begin();
    decals.writeQueue(core.queue, core.time);
    rt.fire.writeGlows();
    const decalQuads = decals.finish();

    // mesures
    const s = this.stats;
    s.sprites = drawn;
    s.particles = core.pool.count;
    s.puffs = rt.cloud.count;
    s.cells = rt.cloud.cells;
    s.lodBias = rt.cloud.bias;
    s.flames = rt.fire.flames;
    s.fires = rt.fire.count;
    s.decals = core.queue.count;
    s.decalQuads = decalQuads;
    s.projectiles = rt.projectiles.drawn;
    s.jets = rt.water.active;
    s.drawCalls = (drawn > 0 ? 1 : 0) + (decalQuads > 0 ? 1 : 0) + (rt.projectiles.drawn > 0 ? 1 : 0);
    s.triangles = drawn * 2 + decalQuads * 2 + rt.projectiles.drawn * rt.projectileTris;
    s.events = events;
    s.eventsDropped = this.queue.dropped;
    s.particlesDropped = core.pool.dropped;
    s.spritesDropped += sprites.overflow;
    s.lights = lights.count;
    const ms = now() - t0;
    s.cpuMs = ms;
    s.cpuMsAvg = s.cpuMsAvg === 0 ? ms : s.cpuMsAvg + (ms - s.cpuMsAvg) * 0.05;
    if (ms > s.cpuMsMax) s.cpuMsMax = ms;
  }

  /** Joue les événements en attente ; retourne leur nombre. */
  private drain(rt: FxRuntime): number {
    const q = this.queue;
    const fx = rt.effects;
    const n = q.count;
    fx.impactsThisFrame = 0;
    for (let i = 0; i < n; i++) {
      const x = q.x[i]!, y = q.y[i]!, z = q.z[i]!;
      const size = q.size[i]!;
      const color = q.color[i]!;
      const seconds = q.seconds[i]!;
      switch (q.type[i]) {
        case 1: fx.gas(x, y, z, size, seconds > 0 ? seconds : 1.5, q.dx[i]!, q.dy[i]!, q.dz[i]!); break;
        case 2: fx.smoke(x, y, z, size, color, seconds > 0 ? seconds : 1.5, q.dx[i]!, q.dy[i]!, q.dz[i]!); break;
        case 3: fx.fireBurst(x, y, z, size, seconds > 0 ? seconds : 1); break;
        case 4: fx.sparks(x, y, z, size, color, seconds); break;
        case 5: fx.explosion(x, y, z, size); break;
        case 6: fx.flash(x, y, z, size, color, seconds); break;
        case 7: fx.glass(x, y, z, size); break;
        case 8: fx.dust(x, y, z, size); break;
        case 9: rt.water.onJet(x, y, z, q.dx[i]!, q.dy[i]!, q.dz[i]!, size, seconds > 0 ? seconds : 0.2); break;
        case 10: fx.splash(x, y, z, size); break;
        case 11: fx.tracer(x, y, z, q.dx[i]!, q.dy[i]!, q.dz[i]!, size, color, seconds); break;
        case 12: fx.firework(x, y, z, size, color, seconds); break;
        case 13: fx.paint(x, y, z, size, color); break;
        case 14: fx.debris(x, y, z, size); break;
        case 15: fx.powder(x, y, z, size, color, seconds > 0 ? seconds : 0.6, q.dx[i]!, q.dy[i]!, q.dz[i]!); break;
        case 16: fx.blood(x, y, z, size, q.dx[i]!, q.dy[i]!, q.dz[i]!); break;
        case 17: fx.scorch(x, z, size); break;
        case 18: fx.tag(x, y, z, size, color); break;
        case 19: fx.impact(x, y, z, size, false); break;
        case EV_EXPLOSION: fx.onExplosion(q.kind[i]!, x, y, z, size); break;
        case EV_IMPACT: fx.onImpact(q.kind[i]!, x, y, z, q.hit[i]!); break;
        default: break;
      }
    }
    q.clear();
    return n;
  }

  /** Fusée de sommation suspendue : elle descend lentement et éclaire la place et les fumées. */
  private updateFlare(rt: FxRuntime, dt: number): void {
    const f = rt.effects.flare;
    if (!f.active) return;
    f.life -= dt;
    if (f.life <= 0) {
      f.active = false;
      return;
    }
    f.y -= 1.6 * dt;
    const k = f.life < 1 ? f.life : 1;
    rt.lights.add(f.x, f.y, f.z, f.hex, 520 * k, 110, 0x7e0001, 0.22, true);
  }

  /** Gyrophares : éclats bleus vus par les fumées (la lumière de scène est l'affaire du rendu des véhicules). */
  private beacons(rt: FxRuntime): void {
    const core = rt.core;
    const list = core.ctx.vehicles.list;
    const t = core.time;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (!v.beacons || v.dormant) continue;
      const dx = v.x - core.camX;
      const dz = v.z - core.camZ;
      if (dx * dx + dz * dz > 150 * 150) continue;
      // double éclat, deux fois par seconde, déphasé d'un véhicule à l'autre
      let ph = t * 1.9 + hash01(v.id) * 3;
      ph -= Math.floor(ph);
      if (ph < 0.1 || (ph > 0.18 && ph < 0.28)) rt.lights.add(v.x, v.y + v.def.height + 0.25, v.z, 0x2a6bff, 38, 26, 0, 0, false);
    }
  }

  /** Accorde l'éclairage des particules et des décalques à celui de la scène (soleil, ciel, nuit). */
  private applyLighting(rt: FxRuntime): void {
    const ctx = this.ctx!;
    const env = ctx.env.state;
    const u = rt.sprites.uniforms;
    let sx = env.sunX, sy = env.sunY, sz = env.sunZ;
    const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (sl > 1e-6) { sx /= sl; sy /= sl; sz /= sl; } else { sx = 0; sy = 1; sz = 0; }
    u.uSunDir.value.set(sx, sy, sz);
    // lumières de la scène : service du rendu de base, sinon recherche dans la scène, sinon estimation
    let sun: FxRenderBase['sun'] | THREE.DirectionalLight | null = null;
    let hemi: FxRenderBase['hemisphere'] | THREE.HemisphereLight | null = null;
    const base = ctx.service<FxRenderBase>(FX_RENDER_BASE_KEY);
    if (base && base.sun && base.hemisphere) {
      sun = base.sun;
      hemi = base.hemisphere;
    } else {
      if ((!this.sunLight || !this.hemiLight) && rt.core.time >= this.sceneScanAt) {
        this.sceneScanAt = rt.core.time + 2;
        rt.view.scene.traverse((o) => {
          if (!this.sunLight && (o as THREE.DirectionalLight).isDirectionalLight) this.sunLight = o as THREE.DirectionalLight;
          if (!this.hemiLight && (o as THREE.HemisphereLight).isHemisphereLight) this.hemiLight = o as THREE.HemisphereLight;
        });
      }
      sun = this.sunLight;
      hemi = this.hemiLight;
    }
    const d = env.daylight < 0 ? 0 : env.daylight > 1 ? 1 : env.daylight;
    if (sun) u.uSunCol.value.setRGB(sun.color.r * sun.intensity * INV_PI, sun.color.g * sun.intensity * INV_PI, sun.color.b * sun.intensity * INV_PI);
    else u.uSunCol.value.setRGB((0.08 + 2.9 * d) * INV_PI, (0.1 + 2.7 * d) * INV_PI, (0.14 + 2.4 * d) * INV_PI);
    if (hemi) {
      const k = hemi.intensity * INV_PI;
      u.uSkyCol.value.setRGB(hemi.color.r * k, hemi.color.g * k, hemi.color.b * k);
      u.uGroundCol.value.setRGB(hemi.groundColor.r * k, hemi.groundColor.g * k, hemi.groundColor.b * k);
    } else {
      u.uSkyCol.value.setRGB((0.03 + 0.55 * d) * INV_PI, (0.04 + 0.68 * d) * INV_PI, (0.07 + 0.85 * d) * INV_PI);
      u.uGroundCol.value.setRGB((0.02 + 0.3 * d) * INV_PI, (0.02 + 0.28 * d) * INV_PI, (0.02 + 0.25 * d) * INV_PI);
    }
    // nuit en ville : l'éclairage public donne aux fumées une lueur sourde et chaude, sans quoi un nuage
    // de gaz hors de portée d'un feu ou d'un gyrophare serait invisible
    if (env.streetLights) {
      const k = (1 - d) * INV_PI;
      u.uSkyCol.value.r += 0.2 * k; u.uSkyCol.value.g += 0.15 * k; u.uSkyCol.value.b += 0.09 * k;
      u.uGroundCol.value.r += 0.34 * k; u.uGroundCol.value.g += 0.24 * k; u.uGroundCol.value.b += 0.13 * k;
    }
    // décalques : éclairement d'une surface horizontale, et ciel reflété par les flaques
    const du = rt.decals.uniforms;
    const up = sy > 0 ? sy : 0;
    const sc = u.uSunCol.value;
    const sk = u.uSkyCol.value;
    du.uLight.value.setRGB(sc.r * up + sk.r, sc.g * up + sk.g, sc.b * up + sk.b);
    this.tmpColor.copy(sk).multiplyScalar(1.7);
    du.uSky.value.copy(this.tmpColor);
  }
}
