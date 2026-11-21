/* =====================================================================================
 * RENDU DES COMMISSARIATS — moteur et système de présentation.
 *
 * CommissariatsRenderer (indépendant du contexte, pour les essais et le banc) :
 *   - habillage proche d'un site construit paresseusement quand la caméra passe à moins de 450 m de sa porte ou de
 *     ses places (un site par image au plus), affiché à moins de 260 m (160 m en qualité « bas ») — façade et places
 *     jugées chacune à sa distance : les places peuvent être dans la rue large d'à côté ;
 *   - maillage lointain : un site y est montré de 260 m à 900 m (600 m en « bas », jamais au-delà de la distance
 *     d'affichage) tant que sa façade proche est masquée ; un attribut par sommet (aShow) le masque sans changer
 *     d'appel de dessin ;
 *   - émission (lanterne, enseigne, vitrage) réglée une fois par image sur le niveau de nuit ;
 *   - façade reconstruite si le sol dessiné sous la porte a bougé (tuile de la ville construite après coup).
 * CommissariatsRenderSystem : ordre VIEW, aucun effet sans ctx.view ; habillage proche libéré en fin de session.
 * ===================================================================================== */

import * as THREE from 'three';
import { SystemOrder } from '@/core/contracts';
import type { GameContext, GameSystem, QualityLevel, Unsubscribe } from '@/core/contracts';
import { COMMISSARIATS } from '@/world/commissariats';
import type { CommissariatDef } from '@/world/commissariats';
import { COMMISSARIATS_RENDER_KEY } from './api';
import type { CommissariatsRenderApi, CommissariatsRenderStats } from './api';
import { createCommissariatAtlas } from './atlas';
import type { CommissariatAtlas } from './atlas';
import { NIGHT_EMISSION, buildFar, buildSite, createMaterials } from './build';
import type { CommissariatMaterials, FarGeometry, GroundAt, SiteAnchors } from './build';

/** Construction de l'habillage proche (m). */
export const BUILD_RADIUS = 450;
/** Affichage de l'habillage proche (m), selon la qualité. */
export function nearRadius(quality: QualityLevel): number {
  return quality === 'bas' ? 160 : 260;
}
/** Portée du maillage lointain (m), selon la qualité. */
export function farRadius(quality: QualityLevel): number {
  return quality === 'bas' ? 600 : 900;
}
/** Écart de sol sous la porte (m) au-delà duquel la façade est reconstruite. */
const REGROUND_EPS = 0.03;
/** Contrôle du sol sous les portes (s). */
const REGROUND_PERIOD = 1;

/** Ce que le moteur demande à la vue. */
export interface ViewLike {
  readonly world: THREE.Object3D;
  readonly quality: QualityLevel;
  readonly drawDistance: number;
  readonly camX: number;
  readonly camZ: number;
}

/** Ce que le moteur demande au jeu. */
export interface RenderHost {
  /** Hauteur du sol DESSINÉ (relief + bordure de trottoir). */
  groundAt: GroundAt;
  /** Niveau de nuit 0..1. */
  night(): number;
  /** L'habillage doit-il être montré (vraie carte de Paris chargée, commissariats non désactivés) ? */
  active(): boolean;
}

interface SiteRec {
  readonly def: CommissariatDef;
  built: boolean;
  facade: THREE.Mesh | null;
  ground: THREE.Mesh | null;
  anchors: SiteAnchors | null;
  /** Sol sous la porte au moment de la construction. */
  builtBase: number;
  farShown: boolean;
}

const emptyStats = (sites: number): CommissariatsRenderStats => ({ sites, built: 0, visible: 0, farVisible: 0, drawCalls: 0, triangles: 0 });

function triangles(m: THREE.Mesh | null): number {
  const g = m?.geometry;
  if (!g) return 0;
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

export class CommissariatsRenderer {
  readonly stats: CommissariatsRenderStats;
  readonly root = new THREE.Group();
  private readonly sites: SiteRec[];
  private mats: CommissariatMaterials;
  private quality: QualityLevel;
  private far: { mesh: THREE.Mesh; geo: FarGeometry } | null = null;
  private regroundTimer = 0;

  constructor(
    private readonly view: ViewLike,
    private readonly host: RenderHost,
    private readonly atlas: CommissariatAtlas | null,
    defs: readonly CommissariatDef[] = COMMISSARIATS,
  ) {
    this.sites = defs.map((def) => ({ def, built: false, facade: null, ground: null, anchors: null, builtBase: 0, farShown: false }));
    this.stats = emptyStats(this.sites.length);
    this.quality = view.quality;
    this.mats = createMaterials(atlas ? atlas.texture : null, this.quality);
    this.root.name = 'commissariats';
    view.world.add(this.root);
  }

  /** Points remarquables d'un site construit (null sinon). */
  anchors(id: string): SiteAnchors | null {
    return this.sites.find((s) => s.def.id === id)?.anchors ?? null;
  }

  /** Matériaux partagés (essais). */
  get materials(): CommissariatMaterials {
    return this.mats;
  }

  /** Maillage lointain (null tant qu'il n'est pas construit). */
  get farMesh(): THREE.Mesh | null {
    return this.far ? this.far.mesh : null;
  }

  frame(dt: number): void {
    const st = this.stats;
    st.built = 0; st.visible = 0; st.farVisible = 0; st.drawCalls = 0; st.triangles = 0;
    if (!this.host.active()) {
      this.hideAll();
      for (const s of this.sites) if (s.built) st.built++;
      return;
    }
    this.syncQuality();
    const night = Math.max(0, Math.min(1, this.host.night()));
    this.mats.uNight.value = night * NIGHT_EMISSION;
    if (!this.far) this.buildFarMesh();

    const q = this.quality;
    const nearR = nearRadius(q);
    const farR = Math.max(nearR, Math.min(farRadius(q), this.view.drawDistance > 0 ? this.view.drawDistance : farRadius(q)));
    const cx = this.view.camX, cz = this.view.camZ;
    this.regroundTimer -= dt;
    const reground = this.regroundTimer <= 0;
    if (reground) this.regroundTimer = REGROUND_PERIOD;
    let builtThisFrame = false;
    let farDirty = false;

    for (const s of this.sites) {
      const def = s.def;
      const dDoor = Math.hypot(def.door.x - cx, def.door.z - cz);
      const bays = s.anchors?.bays ?? null;
      const dBays = bays ? Math.max(0, Math.hypot(bays.x - cx, bays.z - cz) - bays.radius) : this.baysDistance(def, cx, cz);
      if (!s.built && !builtThisFrame && Math.min(dDoor, dBays) < BUILD_RADIUS) {
        this.buildNear(s);
        builtThisFrame = true;
      } else if (s.built && reground && s.facade && dDoor < nearR) {
        const y = this.host.groundAt(def.door.x, def.door.z);
        if (Number.isFinite(y) && Math.abs(y - s.builtBase) > REGROUND_EPS) this.rebuildFacade(s);
      }
      const facadeOn = !!s.facade && dDoor < nearR;
      const groundOn = !!s.ground && dBays < nearR;
      if (s.facade) s.facade.visible = facadeOn;
      if (s.ground) s.ground.visible = groundOn;
      const farOn = !facadeOn && dDoor < farR;
      if (farOn !== s.farShown) {
        s.farShown = farOn;
        farDirty = true;
      }
      if (s.built) st.built++;
      if (facadeOn || groundOn) st.visible++;
      if (farOn) st.farVisible++;
      if (facadeOn) { st.drawCalls++; st.triangles += triangles(s.facade); }
      if (groundOn) { st.drawCalls++; st.triangles += triangles(s.ground); }
    }

    if (this.far) {
      if (farDirty) this.writeFarShow();
      this.far.mesh.visible = st.farVisible > 0;
      if (st.farVisible > 0) {
        st.drawCalls++;
        for (let i = 0; i < this.sites.length; i++) {
          if (this.sites[i]!.farShown) st.triangles += this.far.geo.ranges[i]!.count / 2;
        }
      }
    }
  }

  /** Distance aux places d'un site pas encore construit (sans ses points remarquables). */
  private baysDistance(def: CommissariatDef, cx: number, cz: number): number {
    let best = Infinity;
    for (const sl of def.slots) best = Math.min(best, Math.hypot(sl.x - cx, sl.z - cz));
    return best;
  }

  private buildNear(s: SiteRec): void {
    const geo = buildSite(s.def, this.host.groundAt, this.atlas !== null);
    s.anchors = geo.anchors;
    s.builtBase = this.host.groundAt(s.def.door.x, s.def.door.z);
    if (geo.facade) s.facade = this.makeMesh(geo.facade, this.mats.facade, `commissariat:${s.def.id}:facade`);
    if (geo.ground) s.ground = this.makeMesh(geo.ground, this.mats.ground, `commissariat:${s.def.id}:places`);
    s.built = true;
  }

  private rebuildFacade(s: SiteRec): void {
    const geo = buildSite(s.def, this.host.groundAt, this.atlas !== null);
    s.anchors = geo.anchors;
    s.builtBase = this.host.groundAt(s.def.door.x, s.def.door.z);
    if (s.facade && geo.facade) {
      s.facade.geometry.dispose();
      s.facade.geometry = geo.facade;
    }
    if (s.ground && geo.ground) {
      s.ground.geometry.dispose();
      s.ground.geometry = geo.ground;
    } else geo.ground?.dispose();
  }

  private makeMesh(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.visible = false;
    this.root.add(m);
    return m;
  }

  private buildFarMesh(): void {
    const geo = buildFar(this.sites.map((s) => s.def), this.host.groundAt);
    const mesh = new THREE.Mesh(geo.geometry, this.mats.far);
    mesh.name = 'commissariats:lointain';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    this.root.add(mesh);
    this.far = { mesh, geo };
    for (const s of this.sites) s.farShown = false;
    this.writeFarShow();
  }

  private writeFarShow(): void {
    if (!this.far) return;
    const attr = this.far.mesh.geometry.getAttribute('aShow') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < this.sites.length; i++) {
      const r = this.far.geo.ranges[i]!;
      arr.fill(this.sites[i]!.farShown ? 1 : 0, r.start, r.start + r.count);
    }
    attr.needsUpdate = true;
  }

  /** Changement de qualité : nouveaux matériaux (Lambert en « bas »), mêmes géométries. */
  private syncQuality(): void {
    if (this.view.quality === this.quality) return;
    this.quality = this.view.quality;
    const old = this.mats;
    this.mats = createMaterials(this.atlas ? this.atlas.texture : null, this.quality);
    for (const s of this.sites) {
      if (s.facade) s.facade.material = this.mats.facade;
      if (s.ground) s.ground.material = this.mats.ground;
    }
    if (this.far) this.far.mesh.material = this.mats.far;
    old.dispose();
  }

  private hideAll(): void {
    for (const s of this.sites) {
      if (s.facade) s.facade.visible = false;
      if (s.ground) s.ground.visible = false;
    }
    if (this.far) this.far.mesh.visible = false;
  }

  /** Libère l'habillage proche (fin de session) ; il sera reconstruit à la demande. */
  disposeNear(): void {
    for (const s of this.sites) {
      for (const m of [s.facade, s.ground]) {
        if (!m) continue;
        this.root.remove(m);
        m.geometry.dispose();
      }
      s.facade = null;
      s.ground = null;
      s.anchors = null;
      s.built = false;
    }
    if (this.far) {
      this.root.remove(this.far.mesh);
      this.far.mesh.geometry.dispose();
      this.far = null;
    }
    const st = this.stats;
    st.built = 0; st.visible = 0; st.farVisible = 0; st.drawCalls = 0; st.triangles = 0;
  }

  dispose(): void {
    this.disposeNear();
    this.root.removeFromParent();
    this.mats.dispose();
    this.atlas?.dispose();
  }
}

// ───────────────────────────── système ─────────────────────────────

interface LiftLike { liftAt(x: number, z: number): number }
interface NightLike { readonly night: number }

/** La carte chargée est-elle celle du cœur de Paris (toutes les portes dans l'emprise) ? */
function parisLoaded(ctx: GameContext): boolean {
  const w = ctx.world;
  if (!w || !w.ready) return false;
  const b = w.bounds;
  if (!b || !(b.maxX - b.minX >= 3000)) return false;
  for (const c of COMMISSARIATS) {
    if (c.door.x < b.minX || c.door.x > b.maxX || c.door.z < b.minZ || c.door.z > b.maxZ) return false;
  }
  return true;
}

export class CommissariatsRenderSystem implements GameSystem, CommissariatsRenderApi {
  readonly id = 'render.commissariats';
  readonly order = SystemOrder.VIEW;
  nightOverride: number | null = null;
  private ctx: GameContext | null = null;
  private renderer: CommissariatsRenderer | null = null;
  private failed = false;
  private errors = 0;
  private readonly unsub: Unsubscribe[] = [];
  private readonly idle = emptyStats(COMMISSARIATS.length);

  get stats(): CommissariatsRenderStats {
    return this.renderer ? this.renderer.stats : this.idle;
  }

  /** Moteur (bancs d'essai). */
  get engine(): CommissariatsRenderer | null {
    return this.renderer;
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide<CommissariatsRenderApi>(COMMISSARIATS_RENDER_KEY, this);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.unsub.push(ctx.events.on('session:ended', () => this.renderer?.disposeNear()));
    this.ensureRenderer();
  }

  private ensureRenderer(): void {
    const ctx = this.ctx;
    if (this.renderer || this.failed || !ctx || ctx.headless || !ctx.view) return;
    try {
      const view = ctx.view;
      const host: RenderHost = {
        groundAt: (x, z) => {
          const city = ctx.service<LiftLike>('world.view');
          const lift = city && typeof city.liftAt === 'function' ? city.liftAt(x, z) : 0;
          return ctx.world.heightAt(x, z) + (Number.isFinite(lift) ? lift : 0);
        },
        night: () => {
          if (this.nightOverride !== null) return this.nightOverride;
          const u = ctx.service<NightLike>('render.uniforms');
          if (u && typeof u.night === 'number') return u.night;
          const day = ctx.env?.state?.daylight ?? 1;
          return 1 - THREE.MathUtils.smoothstep(day, 0.08, 0.35);
        },
        active: () => {
          const cfg = ctx.session.config;
          if (cfg && (cfg.mode === 'test' || cfg.extra?.['commissariats'] === false)) return false;
          return parisLoaded(ctx);
        },
      };
      const anisotropy = view.renderer.capabilities.getMaxAnisotropy();
      this.renderer = new CommissariatsRenderer(view, host, createCommissariatAtlas(view.quality === 'bas' ? 2 : anisotropy));
    } catch (err) {
      this.failed = true;
      console.error('[commissariats] initialisation de l\'habillage des commissariats impossible :', err);
    }
  }

  frame(dt: number): void {
    if (!this.renderer) this.ensureRenderer();
    if (!this.renderer) return;
    try {
      this.renderer.frame(dt);
    } catch (err) {
      if (this.errors++ < 5) console.error('[commissariats] erreur pendant le rendu des commissariats :', err);
    }
  }

  reset(): void {
    this.errors = 0;
    this.renderer?.disposeNear();
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    this.renderer?.dispose();
    this.renderer = null;
  }
}
