/* Système d'affichage des monuments : modèle détaillé près de la caméra, silhouette au loin, libération
 * hors de portée, illumination nocturne et scintillement de début d'heure. Ne dépend que du contexte. */
import * as THREE from 'three';
import { SystemOrder, type GameContext, type GameSystem, type LandmarkInfo, type QualityLevel, type Unsubscribe } from '@/core/contracts';
import type { MonumentsApi, MonumentsStats } from './api';
import type { MonumentDef, MonumentFrame, MonumentSite } from './types';
import { getMonument, listMonuments } from './registry';
import { getWorldColliders, siteOfLandmark } from './colliders';
import { disposeKitMaterials, disposeObject, setNightLevel, statsOf, tickMaterials } from './kit';

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

/** Distance de base (m) du modèle détaillé selon la qualité ; s'y ajoute 2,5 × la hauteur du monument. */
const NEAR_BASE: Record<QualityLevel, number> = { bas: 160, moyen: 230, haut: 310, ultra: 420 };
const HYSTERESIS = 1.14;
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
    stats: () => this.stats(),
    prewarm: (keys) => this.prewarm(keys),
  };

  provide(ctx: GameContext): void {
    ctx.provide<MonumentsApi>('monuments', this.api);
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
    const list = ctx.world.landmarks;
    // signature peu coûteuse : la liste peut être recréée à chaque lecture ou complétée après chargement
    let sig = list.length;
    for (let i = 0; i < list.length; i++) sig += list[i].x * 31 + list[i].z * 17 + list[i].heading;
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
      this.slots.push({ lm, def, site: siteOfLandmark(lm), group, near: null, far: null, level: 0, dist: Infinity });
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
      this.updateLight(dt);
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
      this.show(s, want);
    }
    if (buildNear) {
      const s = buildNear;
      s.near = s.def.build(s.site, this.quality);
      s.group.add(s.near);
      this.show(s, 2);
    }
  }

  private show(s: Slot, level: 0 | 1 | 2): void {
    s.level = level;
    s.group.visible = level !== 0;
    if (s.near) s.near.visible = level === 2;
    if (s.far) s.far.visible = level === 1;
    // libération : le détaillé dès qu'on s'en éloigne, la silhouette quand on sort de la distance d'affichage
    if (level !== 2 && s.near && s.dist > (NEAR_BASE[this.quality] + s.def.height * 2.5) * HYSTERESIS) { s.group.remove(s.near); disposeObject(s.near); s.near = null; }
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

  private stats(): MonumentsStats {
    let detailed = 0, distant = 0, triangles = 0, drawCalls = 0;
    for (const s of this.slots) {
      const shown = s.level === 2 ? s.near : s.level === 1 ? s.far : null;
      if (!shown) continue;
      if (s.level === 2) detailed++; else distant++;
      const st = statsOf(shown);
      triangles += st.triangles; drawCalls += st.drawCalls;
    }
    return { known: this.slots.length, detailed, distant, triangles, drawCalls, night: this.night, sparkle: this.sparkle };
  }

  /** Entre deux sessions : on relâche les modèles (les matériaux partagés restent en mémoire). */
  reset(): void {
    this.clear();
    this.signature = NaN;
    this.scanTimer = 0;
  }

  dispose(): void {
    this.clear();
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    if (this.root) { this.root.removeFromParent(); this.root = null; }
    this.ctx = null;
    // fin de vie du module : on rend aussi les matériaux et textures partagés (ils seront recréés à la demande)
    disposeKitMaterials();
  }
}
