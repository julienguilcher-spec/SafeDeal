/* Système d'affichage des monuments : modèle détaillé près de la caméra, silhouette au loin, libération
 * hors de portée, illumination nocturne et scintillement de début d'heure. Ne dépend que du contexte.
 * Il complète les repères de la carte par les repères supplémentaires (extra.ts), donne à chaque définition son
 * site (emprise locale, relief relatif, niveau de l'eau) et pose les silhouettes d'horizon hors carte (horizon.ts). */
import * as THREE from 'three';
import { SystemOrder, type GameContext, type GameSystem, type LandmarkInfo, type QualityLevel, type Unsubscribe } from '@/core/contracts';
import type { MonumentsApi, MonumentsStats, WorldMonumentsApi } from './api';
import type { MonumentDef, MonumentFrame, MonumentSite } from './types';
import { getMonument, listMonuments } from './registry';
import { getWorldColliders, siteOfLandmark } from './colliders';
import { disposeKitMaterials, disposeObject, hazesOf, setNightLevel, statsOf, tickMaterials, type Haze } from './kit';
import { EXTRA_LANDMARKS, mergeLandmarks } from './extra';
import { HORIZON, type HorizonDef } from './horizon';
import { pointInRing } from './shape2d';

interface Slot {
  lm: LandmarkInfo;
  def: MonumentDef;
  site: MonumentSite;
  group: THREE.Group;
  near: THREE.Object3D | null;
  far: THREE.Object3D | null;
  /** 0 = rien, 1 = silhouette, 2 = détaillé. */
  level: 0 | 1 | 2;
  dist: number;
}

/** Silhouette d'horizon : repère hors carte, jamais de modèle détaillé. */
interface HorizonSlot {
  def: HorizonDef;
  group: THREE.Group;
  obj: THREE.Object3D;
  hazes: Haze[];
  stats: { triangles: number; drawCalls: number };
}

/** Les silhouettes d'horizon n'existent que sur une vraie carte du cœur de Paris : emprise finie, large, contenant la Concorde. */
const HORIZON_MIN_SPAN = 3000;
/** Part de camera.far au-delà de laquelle une silhouette est rapprochée (et réduite d'autant : même taille apparente). */
const HORIZON_SHELL = 0.82;
/** Portée du voile atmosphérique (m) par temps clair et par brouillard dense. */
const HAZE_CLEAR = 9500, HAZE_FOG = 500;

const _hazeColor = new THREE.Color();

/** Distance de base (m) du modèle détaillé selon la qualité ; s'y ajoute 2,5 × la hauteur du monument. */
const NEAR_BASE: Record<QualityLevel, number> = { bas: 160, moyen: 230, haut: 310, ultra: 420 };
const HYSTERESIS = 1.14;
/**
 * Construction anticipée : le modèle détaillé est construit (caché) dès PREBUILD × la distance de détail, tant que la
 * silhouette reste affichée ; l'à-coup de construction arrive donc loin, avant que le monument ne soit regardé de près.
 * Il n'est libéré qu'au-delà de RELEASE × cette distance, pour ne pas reconstruire à chaque aller-retour.
 */
const PREBUILD = 1.7;
const RELEASE = 2.4;
/** Durée du scintillement en début d'heure (minutes de jeu). */
const SPARKLE_MINUTES = 5;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class MonumentSystem implements GameSystem {
  readonly id = 'monuments';
  readonly order = SystemOrder.WORLD_VIEW;

  private ctx: GameContext | null = null;
  private root: THREE.Group | null = null;
  private slots: Slot[] = [];
  private horizon: HorizonSlot[] = [];
  private horizonChecked = false;
  private merged: readonly LandmarkInfo[] = [];
  private mergedFrom: readonly LandmarkInfo[] | null = null;
  private mergedCount = -1;
  private mergedStamp = NaN;
  private signature = NaN;
  private time = 0;
  private scanTimer = 0;
  private night = 0;
  private sparkle = 0;
  private quality: QualityLevel = 'moyen';
  private unsub: Unsubscribe[] = [];
  private errorCount = 0;
  private readonly info: MonumentFrame = { time: 0, dt: 0, daylight: 1, night: 0, hour: 12, sparkle: 0 };
  private readonly api: MonumentsApi = {
    has: (key) => getMonument(key) !== undefined,
    keys: () => listMonuments().map((d) => d.key),
    collidersOf: (lm) => getWorldColliders(lm),
    landmarks: () => this.landmarks(),
    stats: () => this.stats(),
    prewarm: (keys) => this.prewarm(keys),
  };

  /** Service facultatif attendu par le module des immeubles : ne pas extruder ce qu'un monument remplace. */
  private readonly worldApi: WorldMonumentsApi = {
    has: (key) => getMonument(key) !== undefined,
    covers: (x, z) => this.covers(x, z),
    horizonKeys: () => HORIZON.map((h) => h.key),
  };

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide<MonumentsApi>('monuments', this.api);
    ctx.provide<WorldMonumentsApi>('world.monuments', this.worldApi);
  }

  /** Repères de la carte + repères supplémentaires situés dans l'emprise (liste recalculée seulement si la carte change). */
  private landmarks(): readonly LandmarkInfo[] {
    const ctx = this.ctx;
    if (!ctx) return EXTRA_LANDMARKS.slice(0, 0);
    const base = ctx.world.landmarks, b = ctx.world.bounds;
    const stamp = b ? b.minX * 3 + b.minZ * 5 + b.maxX * 7 + b.maxZ * 11 : NaN;
    if (base !== this.mergedFrom || base.length !== this.mergedCount || !Object.is(stamp, this.mergedStamp)) {
      this.mergedFrom = base; this.mergedCount = base.length; this.mergedStamp = stamp;
      this.merged = mergeLandmarks(base, b);
    }
    return this.merged;
  }

  /** Emprise d'un repère supplémentaire modélisé, ou obstacle plein d'un monument de la carte, en ce point ? */
  private covers(x: number, z: number): boolean {
    const list = this.landmarks();
    for (let i = 0; i < list.length; i++) {
      const lm = list[i];
      const def = getMonument(lm.key);
      if (!def) continue;
      const reach = def.radius + 4;
      if (Math.abs(x - lm.x) > reach || Math.abs(z - lm.z) > reach) continue;
      if (EXTRA_LANDMARKS.includes(lm) && lm.footprint.length >= 6 && pointInRing(x, z, lm.footprint)) return true;
      const cols = getWorldColliders(lm);
      for (let k = 0; k < cols.length; k++) if (cols[k].baseY <= 0.5 && pointInRing(x, z, cols[k].ring)) return true;
    }
    return false;
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.unsub.push(ctx.events.on('settings:changed', (e) => { if (e.key === 'quality') this.dropDetailed(); }));
  }

  /** Construit puis relâche chaque modèle demandé : matériaux et textures partagés restent en cache. */
  private prewarm(keys?: readonly string[]): void {
    const ctx = this.ctx;
    if (!ctx || !ctx.view) return;
    const defs = keys ? keys.map((k) => getMonument(k)).filter((d): d is MonumentDef => d !== undefined) : listMonuments();
    for (const def of defs) {
      try {
        disposeObject(def.build({ footprint: [], height: def.height }, ctx.view.quality));
      } catch (err) {
        console.error(`[monuments] préparation de « ${def.key} » impossible :`, err);
      }
    }
  }

  /** Reconstruit la liste des emplacements quand les repères de la carte changent (chargement différé). */
  private sync(): void {
    const ctx = this.ctx!;
    const list = this.landmarks();
    // signature peu coûteuse : la liste peut être recréée à chaque lecture ou complétée après chargement
    let sig = list.length;
    // (la clé compte : deux repères au même endroit, ou un repère dont la clé change, doivent être revus)
    for (let i = 0; i < list.length; i++) sig += list[i].x * 31 + list[i].z * 17 + list[i].heading + list[i].key.length * 0.37 + list[i].key.charCodeAt(0) * 0.011;
    if (sig === this.signature) return;
    this.clear();
    this.signature = sig;
    for (let i = 0; i < list.length; i++) {
      const lm = list[i];
      const def = getMonument(lm.key);
      if (!def) continue;
      const group = new THREE.Group();
      group.name = `monument:${def.key}`;
      group.position.set(lm.x, ctx.world.heightAt(lm.x, lm.z), lm.z);
      group.rotation.y = lm.heading;
      group.visible = false;
      this.root!.add(group);
      this.slots.push({ lm, def, site: this.siteOf(lm), group, near: null, far: null, level: 0, dist: Infinity });
    }
  }

  /**
   * Site d'un repère : emprise locale, et ce que le monde sait du terrain — altitude du sol relative à l'origine du
   * monument (tabliers de pont compris) et niveau de l'eau. Les ouvrages qui épousent le relief s'en servent.
   */
  private siteOf(lm: LandmarkInfo): MonumentSite {
    const site = siteOfLandmark(lm);
    const world = this.ctx!.world;
    if (typeof world.heightAt !== 'function') return site;
    const c = Math.cos(lm.heading), s = Math.sin(lm.heading);
    site.groundAt = (x, z) => world.heightAt(lm.x + x * c + z * s, lm.z - x * s + z * c) - world.heightAt(lm.x, lm.z);
    if (typeof world.waterLevel === 'number' && Number.isFinite(world.waterLevel)) site.waterY = world.waterLevel - world.heightAt(lm.x, lm.z);
    return site;
  }

  /** Crée (une fois) les silhouettes d'horizon si le monde est une vraie carte du cœur de Paris. */
  private syncHorizon(): void {
    if (this.horizonChecked) return;
    const ctx = this.ctx!;
    const b = ctx.world.bounds;
    const paris = !!b && Number.isFinite(b.maxX - b.minX + b.maxZ - b.minZ) && b.maxX - b.minX >= HORIZON_MIN_SPAN && b.minX < 0 && b.maxX > 0 && b.minZ < 0 && b.maxZ > 0;
    // tant que le monde n'est pas chargé, son emprise n'est qu'un bouche-trou : on reviendra
    if (!paris) { if (ctx.world.ready) this.horizonChecked = true; return; }
    this.horizonChecked = true;
    for (const def of HORIZON) {
      // dans l'emprise (ce ne serait plus un repère lointain) : la carte devrait alors fournir un vrai monument
      if (def.x > b.minX && def.x < b.maxX && def.z > b.minZ && def.z < b.maxZ) continue;
      try {
        const obj = def.build();
        const group = new THREE.Group();
        group.name = `horizon:${def.key}`;
        group.rotation.y = def.heading;
        group.add(obj);
        this.root!.add(group);
        const st = statsOf(obj);
        this.horizon.push({ def, group, obj, hazes: hazesOf(obj), stats: { triangles: st.triangles, drawCalls: st.drawCalls } });
      } catch (err) {
        console.error(`[monuments] silhouette d'horizon « ${def.key} » impossible :`, err);
      }
    }
  }

  /**
   * Pose les silhouettes d'horizon : position réelle tant qu'elle tient dans le champ de la caméra, sinon rapprochée
   * sur la même ligne de visée et réduite d'autant (taille apparente inchangée) ; voile atmosphérique d'après la
   * distance réelle et le brouillard (le brouillard de scène, réglé sur la distance d'affichage, les effacerait).
   */
  private placeHorizon(): void {
    if (this.horizon.length === 0) return;
    const ctx = this.ctx!, view = ctx.view!;
    const env = ctx.env.state;
    const camFar = view.camera && view.camera.far > 0 ? view.camera.far : 8000;
    const shell = camFar * HORIZON_SHELL;
    const fogAmount = Math.max(0, Math.min(1, env.fog ?? 0)), rain = Math.max(0, Math.min(1, env.rain ?? 0));
    const reach = (HAZE_CLEAR + (HAZE_FOG - HAZE_CLEAR) * Math.pow(fogAmount, 0.6)) * (1 - 0.45 * rain);
    // couleur du voile : celle du brouillard de scène s'il existe (dans l'espace de sortie), sinon un ciel d'horizon
    const fog = view.scene ? (view.scene.fog as THREE.Fog | THREE.FogExp2 | null) : null;
    if (fog && fog.color) fog.color.getRGB(_hazeColor, THREE.SRGBColorSpace);
    else _hazeColor.setRGB(0.79 - 0.7 * this.night, 0.86 - 0.75 * this.night, 0.93 - 0.76 * this.night);
    const cx = view.camX, cy = view.camY, cz = view.camZ;
    for (let i = 0; i < this.horizon.length; i++) {
      const h = this.horizon[i];
      const dx = h.def.x - cx, dz = h.def.z - cz;
      const dist = Math.hypot(dx, dz);
      const k = dist > shell ? shell / dist : 1;
      h.group.position.set(cx + dx * k, cy + (h.def.baseY - cy) * k, cz + dz * k);
      if (h.group.scale.x !== k) h.group.scale.setScalar(k);
      const amount = Math.min(0.97, 1 - Math.exp(-dist / reach));
      for (let j = 0; j < h.hazes.length; j++) h.hazes[j].set(_hazeColor.r, _hazeColor.g, _hazeColor.b, amount);
    }
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !ctx.view) return;
    try {
      const view = ctx.view;
      if (!this.root) {
        this.root = new THREE.Group();
        this.root.name = 'monuments';
        view.world.add(this.root);
      }
      this.time += dt;
      this.quality = view.quality;
      this.sync();
      this.syncHorizon();
      this.updateLight(dt);
      this.placeHorizon();
      this.scanTimer -= dt;
      if (this.scanTimer <= 0) {
        this.scanTimer = 0.2;
        this.scan(view.camX, view.camZ, view.drawDistance);
      }
      const info = this.info;
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (s.level === 0 || !s.def.animate) continue;
        const shown = s.level === 2 && s.near ? s.near : s.far;
        if (shown) s.def.animate(shown, info, shown === s.far);
      }
    } catch (err) {
      // une erreur persistante ne doit ni interrompre le jeu ni inonder la console
      if (this.errorCount++ < 5) console.error('[monuments] erreur pendant l\'affichage :', err);
    }
  }

  /** Illumination nocturne et scintillement, d'après l'heure et la lumière du jour. */
  private updateLight(dt: number): void {
    const env = this.ctx!.env.state;
    const target = 1 - smoothstep(0.16, 0.5, env.daylight);
    const k = 1 - Math.exp(-dt * 1.5);
    this.night += (target - this.night) * k;
    if (Math.abs(target - this.night) < 0.002) this.night = target;
    const minute = (env.timeOfDay - Math.floor(env.timeOfDay)) * 60;
    const sparkleTarget = this.night > 0.6 && minute < SPARKLE_MINUTES ? 1 : 0;
    this.sparkle += (sparkleTarget - this.sparkle) * (1 - Math.exp(-dt * 2.5));
    if (Math.abs(sparkleTarget - this.sparkle) < 0.004) this.sparkle = sparkleTarget;
    setNightLevel(this.night);
    tickMaterials(this.time);
    const info = this.info;
    info.time = this.time; info.dt = dt; info.daylight = env.daylight; info.night = this.night; info.hour = env.timeOfDay; info.sparkle = this.sparkle;
  }

  /** Choisit le niveau de détail de chaque monument ; construit au plus un modèle détaillé par passe. */
  private scan(camX: number, camZ: number, drawDistance: number): void {
    const ctx = this.ctx!;
    let buildNear: Slot | null = null;
    let farBuilt = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const d = Math.max(0, Math.hypot(s.lm.x - camX, s.lm.z - camZ) - s.def.radius);
      s.dist = d;
      const nearDist = NEAR_BASE[this.quality] + s.def.height * 2.5;
      const farDist = Math.max(drawDistance * 1.5, 800) + s.def.height * 25;
      let want: 0 | 1 | 2 = s.level;
      if (s.level === 2) want = d > nearDist * HYSTERESIS ? (d > farDist * HYSTERESIS ? 0 : 1) : 2;
      else if (s.level === 1) want = d < nearDist ? 2 : d > farDist * HYSTERESIS ? 0 : 1;
      else want = d < nearDist ? 2 : d < farDist ? 1 : 0;
      if (want !== 0) {
        const y = ctx.world.heightAt(s.lm.x, s.lm.z);
        if (Math.abs(y - s.group.position.y) > 0.01) s.group.position.y = y;
      }
      if (want === 2 && !s.near) {
        if (!buildNear || d < buildNear.dist) buildNear = s;
        // en attendant le modèle détaillé, la silhouette tient lieu
        if (!s.far && farBuilt < 4) { s.far = s.def.buildFar(s.site); s.group.add(s.far); farBuilt++; }
        this.show(s, 1);
        continue;
      }
      if (want === 1 && !s.far) {
        if (farBuilt >= 4) continue;
        s.far = s.def.buildFar(s.site); s.group.add(s.far); farBuilt++;
      }
      // anticipation : le détaillé se construit pendant que la silhouette est encore affichée
      if (want === 1 && !s.near && d < nearDist * PREBUILD && (!buildNear || d < buildNear.dist)) buildNear = s;
      this.show(s, want);
    }
    if (buildNear) {
      const s = buildNear;
      s.near = s.def.build(s.site, this.quality);
      s.group.add(s.near);
      // construit d'avance : il reste caché tant que le monument n'est pas assez proche
      const nearDist = NEAR_BASE[this.quality] + s.def.height * 2.5;
      this.show(s, s.dist < nearDist ? 2 : s.level);
    }
  }

  private show(s: Slot, level: 0 | 1 | 2): void {
    s.level = level;
    s.group.visible = level !== 0;
    if (s.near) s.near.visible = level === 2;
    if (s.far) s.far.visible = level === 1;
    // libération : le détaillé dès qu'on s'en éloigne, la silhouette quand on sort de la distance d'affichage
    if (level !== 2 && s.near && s.dist > (NEAR_BASE[this.quality] + s.def.height * 2.5) * RELEASE) { s.group.remove(s.near); disposeObject(s.near); s.near = null; }
    if (level === 0 && s.far) { s.group.remove(s.far); disposeObject(s.far); s.far = null; }
  }

  private dropDetailed(): void {
    for (const s of this.slots) {
      if (!s.near) continue;
      s.group.remove(s.near); disposeObject(s.near); s.near = null;
      if (s.level === 2) s.level = 1;
      if (s.far) s.far.visible = s.level === 1;
    }
    this.scanTimer = 0;
  }

  private clear(): void {
    for (const s of this.slots) {
      if (s.near) disposeObject(s.near);
      if (s.far) disposeObject(s.far);
      s.group.removeFromParent();
    }
    this.slots.length = 0;
  }

  private clearHorizon(): void {
    for (const h of this.horizon) { disposeObject(h.obj); h.group.removeFromParent(); }
    this.horizon.length = 0;
    this.horizonChecked = false;
  }

  private stats(): MonumentsStats {
    let detailed = 0, distant = 0, triangles = 0, drawCalls = 0;
    for (const s of this.slots) {
      const shown = s.level === 2 ? s.near : s.level === 1 ? s.far : null;
      if (!shown) continue;
      if (s.level === 2) detailed++; else distant++;
      const st = statsOf(shown);
      triangles += st.triangles; drawCalls += st.drawCalls;
    }
    let horizonTriangles = 0, horizonDrawCalls = 0;
    for (const h of this.horizon) { horizonTriangles += h.stats.triangles; horizonDrawCalls += h.stats.drawCalls; }
    return {
      known: this.slots.length, detailed, distant, triangles, drawCalls, night: this.night, sparkle: this.sparkle,
      horizon: this.horizon.length, horizonTriangles, horizonDrawCalls,
    };
  }

  /** Entre deux sessions : on relâche les modèles (les matériaux partagés restent en mémoire). */
  reset(): void {
    this.clear();
    this.clearHorizon();
    this.signature = NaN;
    this.scanTimer = 0;
  }

  dispose(): void {
    this.clear();
    this.clearHorizon();
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    if (this.root) { this.root.removeFromParent(); this.root = null; }
    this.ctx = null;
    // fin de vie du module : on rend aussi les matériaux et textures partagés (ils seront recréés à la demande)
    disposeKitMaterials();
  }
}
