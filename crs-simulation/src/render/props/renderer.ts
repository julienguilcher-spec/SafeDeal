/* =====================================================================================
 * RENDU DU MOBILIER URBAIN, DES VITRINES ET DES BARRICADES — moteur.
 *
 * Principe : la rue est découpée en morceaux de 128 m. Chaque morceau est UN maillage fusionné
 * (un appel de dessin) qui contient ses objets et ses devantures au niveau de détail voulu par la
 * distance et la qualité. Quand un objet change (événement ou relecture des listes), seule sa plage
 * de sommets est réécrite ; rien n'est recalculé par image. S'y ajoutent trois lots globaux d'un
 * appel de dessin chacun : les objets en mouvement (poussés, portés), le verre, les halos.
 * ===================================================================================== */

import * as THREE from 'three';
import type { EntityId, GameContext, Prop, Shop, Unsubscribe, ViewApi } from '@/core/contracts';
import { PROPS_EXT_KEY, RENDER_LIGHTS_KEY, RENDER_UNIFORMS_KEY } from './api';
import type { LightsLike, PropsExtLike, PropsRenderStats, PropViewLike, ShopViewLike, UniformsLike } from './api';
import { Assembler } from './assemble';
import { PropAtlas } from './atlas';
import { LightRig } from './lighting';
import { ChunkStore } from './chunkstore';
import { kindInfo, lodConfig, modelFor, objectLod, propSignature, shopSignature } from './mapping';
import type { LodConfig } from './mapping';
import { createMaterials, createUniforms, disposeMaterials } from './material';
import type { PropMaterials } from './material';
import { hash01 } from './meshbuf';
import { ModelLibrary } from './models';
import { synthParts } from './placement';
import { PropRec, ShopRec } from './records';
import { hasSoot } from './shopfront';
import { shopStyle } from './signtext';
import { SlotMesh } from './slotmesh';

/** Un objet immobile depuis ce délai (s) quitte le lot dynamique et retourne dans son morceau. */
const SETTLE_SECONDS = 0.9;
/** Temps de reconstruction accordé par image (ms) ; au moins un morceau est traité. */
const REBUILD_BUDGET_MS = 3.5;

export class PropsRenderer {
  readonly stats: PropsRenderStats = {
    props: 0, shops: 0, chunks: 0, builtChunks: 0, dynamic: 0, halos: 0, lights: 0, drawCalls: 0, shadowCalls: 0,
    triangles: 0, cpuMs: 0, cpuMsAvg: 0, cpuMsMax: 0, rebuilds: 0, rewrites: 0, rebuildMs: 0, models: 0, signs: 0, atlasUploads: 0,
  };

  private readonly root = new THREE.Group();
  private readonly lib = new ModelLibrary();
  private readonly uniforms = createUniforms();
  private atlas: PropAtlas;
  private materials: PropMaterials;
  private readonly asm: Assembler;
  private readonly rig: LightRig;
  private readonly store: ChunkStore;
  private dyn: SlotMesh;
  private glass: SlotMesh;
  private cfg: LodConfig;
  private quality: string;

  private readonly propRecs = new Map<EntityId, PropRec>();
  private readonly propList: PropRec[] = [];
  private readonly shopRecs = new Map<EntityId, ShopRec>();
  private readonly shopList: ShopRec[] = [];
  private readonly spawned: EntityId[] = [];
  private readonly removed: EntityId[] = [];
  private readonly queueP: PropRec[] = [];
  private readonly queueS: ShopRec[] = [];
  private readonly dynList: PropRec[] = [];
  private readonly animShops: ShopRec[] = [];
  private readonly unsub: Unsubscribe[] = [];
  private readonly propViewOut: PropViewLike = { panesLeft: 0 };
  private readonly shopViewOut: ShopViewLike = { hasShutter: true, forced: false, boards: 0, tags: 0, burnt: false };

  private ext: PropsExtLike | undefined;
  private shared: UniformsLike | undefined;
  private time = 0;
  private scanP = 0;
  private checkP = 0;
  private scanS = 0;
  private checkS = 0;
  private evalTimer = 0;
  private lightTimer = 0;
  private lastCamX = NaN;
  private lastCamZ = NaN;
  private lastCamY = NaN;
  private dynDirty = false;
  private first = true;
  private warming = true;
  private night = 0;
  private lamps = 0;

  constructor(private readonly ctx: GameContext, private readonly view: ViewApi) {
    this.quality = view.quality;
    this.cfg = lodConfig(view.quality);
    const aniso = view.renderer.capabilities.getMaxAnisotropy();
    this.atlas = new PropAtlas(this.cfg.atlas, this.quality === 'bas' ? 2 : aniso);
    this.materials = this.makeMaterials();
    this.asm = new Assembler(this.lib, this.atlas);
    this.ext = ctx.service<PropsExtLike>(PROPS_EXT_KEY);
    this.shared = ctx.service<UniformsLike>(RENDER_UNIFORMS_KEY);
    this.rig = new LightRig(ctx, this.uniforms, this.cfg, ctx.service<LightsLike>(RENDER_LIGHTS_KEY));
    this.root.name = 'decor';
    this.store = new ChunkStore(this.root, this.materials, this.asm, this.cfg, this.stats);
    this.dyn = this.makeBatch('decor-mobiles', false);
    this.glass = this.makeBatch('decor-verre', true);
    this.root.add(this.rig.halos.mesh);
    view.world.add(this.root);
    this.subscribe();
  }

  private makeMaterials(): PropMaterials {
    return createMaterials(this.atlas.texture, this.uniforms, this.quality === 'bas', this.quality !== 'bas');
  }

  private makeBatch(name: string, glass: boolean): SlotMesh {
    const m = new SlotMesh(glass ? this.materials.glass : this.materials.opaque, glass ? null : this.materials.depth, name);
    m.mesh.frustumCulled = false;
    m.mesh.castShadow = !glass && this.cfg.shadowLevel >= 0;
    if (glass) m.mesh.renderOrder = 10;
    this.root.add(m.mesh);
    return m;
  }

  // ───────────────────────────── événements ─────────────────────────────

  private subscribe(): void {
    const ev = this.ctx.events;
    const prop = (e: { id: EntityId }): void => this.touchProp(e.id);
    const shop = (e: { id: EntityId }): void => this.touchShop(e.id);
    const any = (e: unknown): void => {
      const id = (e as { id?: EntityId } | null)?.id;
      if (typeof id === 'number') {
        this.touchProp(id);
        this.touchShop(id);
      }
    };
    this.unsub.push(
      // les événements partent du pas de simulation : on ne fait qu'y noter l'identifiant, le travail attend frame()
      ev.on('prop:spawned', (e) => { this.spawned.push(e.id); }),
      ev.on('prop:removed', (e) => { this.removed.push(e.id); }),
      ev.on('prop:damaged', prop),
      ev.on('prop:moved', prop),
      ev.on('barricade:built', prop),
      ev.on('shop:window', shop),
      ev.on('shop:shutter', shop),
      ev.on('shop:looted', shop),
      ev.on('fire:started', (e) => { this.touchProp(e.targetId); this.touchShop(e.targetId); }),
      ev.on('fire:out', (e) => { this.touchProp(e.targetId); this.touchShop(e.targetId); }),
      ev.on('settings:changed', (e) => { if (e.key === 'quality') this.store.evalWanted = true; }),
      ev.onAny('props:glass', any),
      ev.onAny('props:shutter_forced', any),
      ev.onAny('props:barricade_extended', any),
      ev.onAny('props:barricade_cleared', any),
    );
  }

  private touchProp(id: EntityId): void {
    const rec = this.propRecs.get(id);
    if (rec && !rec.queued) {
      rec.queued = true;
      this.queueP.push(rec);
    }
  }

  private touchShop(id: EntityId): void {
    const rec = this.shopRecs.get(id);
    if (rec && !rec.queued) {
      rec.queued = true;
      this.queueS.push(rec);
    }
  }

  // ───────────────────────────── objets ─────────────────────────────

  private readPanes(rec: PropRec): number {
    const info = rec.info;
    if (info.panes === 0) return 0;
    const v = this.ext ? this.ext.propView(rec.prop, this.propViewOut) : null;
    if (v) return Math.max(0, Math.min(info.panes, v.panesLeft | 0));
    // sans le service étendu : déduit de l'état
    const st = rec.prop.state;
    return st === 'broken' || st === 'burnt' ? 0 : st === 'damaged' ? Math.max(0, info.panes - 1) : info.panes;
  }

  private addProp(p: Prop): void {
    if (this.propRecs.has(p.id)) return;
    const kind = String(p.kind);
    const info = kindInfo(kind);
    const barricade = kind === 'barricade';
    const scaled = modelFor(kind) === 'autre' && kind !== 'autre';
    // feux tricolores : les deux axes d'un carrefour sont en opposition, chaque carrefour a son décalage
    let phase = Math.floor(hash01(p.id * 7 + 3) * 255);
    if (info.model === 'feu_tricolore') {
      const quarter = Math.round(p.heading / (Math.PI / 2)) & 1;
      const cell = hash01(Math.round(p.x / 40) * 7919 + Math.round(p.z / 40) * 104729);
      phase = Math.floor((((quarter ? 0.5 : 0) + cell) % 1) * 255);
    }
    // variante de couleur tirée de la position de création : stable quand la tuile est rechargée
    const where = (Math.round(p.x * 4) * 73856093) ^ (Math.round(p.z * 4) * 19349663);
    const rec = new PropRec(p, p.id, kind, info, Math.floor(hash01(where) * 64), where & 0xffff, barricade, scaled,
      info.model === 'abribus' || info.model === 'poubelle', phase);
    this.propRecs.set(p.id, rec);
    rec.li = this.propList.length;
    this.propList.push(rec);
    const ch = this.store.at(p.x, p.z);
    rec.chunk = ch;
    rec.ci = ch.props.length;
    if (ch.level < 0 && ch.props.length === 0 && ch.shops.length === 0) ch.groundY = p.y;
    ch.props.push(rec);
    this.syncProp(rec, true);
  }

  private removeProp(id: EntityId): void {
    const rec = this.propRecs.get(id);
    if (!rec) return;
    this.propRecs.delete(id);
    this.rig.free(rec);
    if (rec.dynamic) this.leaveDynamic(rec);
    this.detach(rec);
    const last = this.propList.pop()!;
    if (last !== rec) {
      this.propList[rec.li] = last;
      last.li = rec.li;
    }
    rec.li = -1;
    if (rec.mayGlass) this.store.glassDirty = true;
  }

  /** Retire l'objet de son morceau (géométrie effacée en place). */
  private detach(rec: PropRec): void {
    const ch = rec.chunk;
    if (!ch) return;
    this.store.erase(ch, rec, false);
    const last = ch.props.pop()!;
    if (last !== rec) {
      ch.props[rec.ci] = last;
      last.ci = rec.ci;
    }
    rec.chunk = null;
    rec.ci = -1;
    if (ch.props.length === 0 && ch.shops.length === 0) this.store.evalWanted = true;
  }

  private enterDynamic(rec: PropRec): void {
    // l'emplacement dans le morceau reste réservé : l'objet y reviendra souvent
    this.store.erase(rec.chunk, rec, true);
    rec.dynamic = true;
    rec.di = this.dynList.length;
    this.dynList.push(rec);
    this.dynDirty = true;
  }

  private leaveDynamic(rec: PropRec): void {
    const last = this.dynList.pop()!;
    if (last !== rec) {
      this.dynList[rec.di] = last;
      last.di = rec.di;
    }
    rec.di = -1;
    rec.dynamic = false;
    this.dynDirty = true;
  }

  /**
   * Compare l'objet à sa dernière image connue et met à jour ce qui a changé : morceau, lumières,
   * géométrie (en place), passage dans le lot dynamique s'il bouge.
   */
  private syncProp(rec: PropRec, force: boolean): void {
    const p = rec.prop;
    const moved = p.x !== rec.x || p.z !== rec.z || p.y !== rec.y || p.heading !== rec.heading
      || p.halfX !== rec.hX || p.halfZ !== rec.hZ || p.height !== rec.height;
    const panes = this.readPanes(rec);
    const carried = p.carriedBy !== 0;
    const sig = propSignature(p.state, p.toppled, p.tags, carried, p.dormant, panes);
    if (!moved && sig === rec.sig && !force) return;
    const changed = sig !== rec.sig || force;
    const first = Number.isNaN(rec.x);
    rec.sig = sig;
    rec.panes = panes;
    rec.x = p.x; rec.y = p.y; rec.z = p.z; rec.heading = p.heading;
    rec.hX = p.halfX; rec.hZ = p.halfZ; rec.height = p.height;
    if (rec.barricade) {
      const real = this.ext ? this.ext.barricadeParts(rec.id) : null;
      rec.parts = real && real.length > 0 ? real : synthParts(rec.id, p.halfX, p.halfZ);
    }
    if (!(Number.isFinite(p.x) && Number.isFinite(p.z))) return;
    const ch = this.store.at(p.x, p.z);
    if (ch !== rec.chunk) {
      this.detach(rec);
      rec.chunk = ch;
      rec.ci = ch.props.length;
      if (ch.level < 0 && ch.props.length === 0 && ch.shops.length === 0) ch.groundY = p.y;
      ch.props.push(rec);
    }
    if (changed || moved) this.rig.prop(rec, this.lib, this.store.hidden(p.dormant));
    if (rec.mayGlass) this.store.glassDirty = true;
    if (!rec.dynamic && !first && (carried || (moved && p.movable)) && this.dynList.length < this.cfg.maxDynamic) this.enterDynamic(rec);
    if (rec.dynamic) {
      if (moved || carried) rec.lastMove = this.time;
      this.dynDirty = true;
    } else {
      this.store.placeProp(rec);
    }
  }

  // ───────────────────────────── vitrines ─────────────────────────────

  private readShop(rec: ShopRec): number {
    const s = rec.shop, st = rec.state;
    st.window = s.window;
    st.shutter = s.shutter;
    st.stock = s.stock;
    st.burning = s.burning;
    const v = this.ext ? this.ext.shopView(s, this.shopViewOut) : null;
    if (v) {
      st.forced = v.forced;
      st.burnt = v.burnt;
      st.boards = s.window === 'boarded';
      st.tags = v.tags;
      st.hasShutter = v.hasShutter;
    } else {
      // sans le service étendu : boutique calcinée = a brûlé et n'a plus rien
      if (s.burning > 0.05) rec.wasBurning = true;
      st.burnt = rec.wasBurning && s.burning <= 0 && s.stock <= 0;
      st.forced = false;
      st.boards = s.window === 'boarded';
      st.tags = s.window === 'tagged' ? 1 : 0;
      st.hasShutter = true;
    }
    return shopSignature(st.window, st.shutter, st.stock, st.burning, s.dormant, st.forced, st.burnt, st.boards, st.tags);
  }

  private addShop(s: Shop): void {
    if (this.shopRecs.has(s.id)) return;
    // habillage tiré de la position : la même boutique garde son aspect d'une session à l'autre
    const seed = (Math.round(s.x * 10) * 73856093) ^ (Math.round(s.z * 10) * 19349663);
    const rec = new ShopRec(s, s.id, shopStyle(String(s.category), seed), seed & 0x7fffffff);
    this.shopRecs.set(s.id, rec);
    rec.li = this.shopList.length;
    this.shopList.push(rec);
    const ch = this.store.at(s.x, s.z);
    rec.chunk = ch;
    rec.ci = ch.shops.length;
    if (ch.level < 0 && ch.props.length === 0 && ch.shops.length === 0) ch.groundY = s.y;
    ch.shops.push(rec);
    rec.sig = this.readShop(rec);
    rec.wasSooty = hasSoot(rec.state);
    if (rec.wasSooty) this.store.glassDirty = true;
    this.rig.shop(rec, this.store.hidden(s.dormant));
    this.store.placeShop(rec);
  }

  private removeShop(rec: ShopRec): void {
    this.shopRecs.delete(rec.id);
    if (rec.wasSooty) this.store.glassDirty = true;
    this.rig.free(rec);
    this.asm.releaseSign(rec);
    const ch = rec.chunk;
    if (ch) {
      this.store.erase(ch, rec, false);
      const last = ch.shops.pop()!;
      if (last !== rec) {
        ch.shops[rec.ci] = last;
        last.ci = rec.ci;
      }
      rec.chunk = null;
      if (ch.props.length === 0 && ch.shops.length === 0) this.store.evalWanted = true;
    }
    const last = this.shopList.pop()!;
    if (last !== rec) {
      this.shopList[rec.li] = last;
      last.li = rec.li;
    }
    if (rec.ai >= 0) this.stopAnim(rec);
  }

  private stopAnim(rec: ShopRec): void {
    const last = this.animShops.pop()!;
    if (last !== rec) {
      this.animShops[rec.ai] = last;
      last.ai = rec.ai;
    }
    rec.ai = -1;
  }

  private syncShop(rec: ShopRec, force: boolean): void {
    const sig = this.readShop(rec);
    if (sig === rec.sig && !force) return;
    rec.sig = sig;
    if (hasSoot(rec.state) !== rec.wasSooty) {
      rec.wasSooty = !rec.wasSooty;
      this.store.glassDirty = true;
    }
    this.rig.shop(rec, this.store.hidden(rec.shop.dormant));
    this.store.placeShop(rec);
    // un rideau qui bouge est suivi à chaque image pendant une seconde
    rec.animUntil = this.time + 1;
    if (rec.ai < 0) {
      rec.ai = this.animShops.length;
      this.animShops.push(rec);
    }
  }

  // ───────────────────────────── relecture des listes ─────────────────────────────

  /** Relit une tranche des listes de la simulation : nouveaux venus, disparus, changements sans événement. */
  private poll(all: boolean): void {
    const store = this.ctx.props;
    const list = store.list;
    let n = all ? list.length : Math.min(list.length, 96 + (list.length >> 5));
    while (n-- > 0) {
      if (this.scanP >= list.length) this.scanP = 0;
      const p = list[this.scanP++];
      if (p && !this.propRecs.has(p.id)) this.addProp(p);
    }
    const mine = this.propList;
    n = all ? mine.length : Math.min(mine.length, 96 + (mine.length >> 5));
    while (n-- > 0) {
      if (this.checkP >= mine.length) this.checkP = 0;
      const rec = mine[this.checkP++];
      if (!rec) break;
      if (store.get(rec.id) !== rec.prop) {
        this.removeProp(rec.id);
        this.checkP--;
      } else if (!rec.dynamic) {
        this.syncProp(rec, false);
      }
    }
    const shops = store.shops;
    n = all ? shops.length : Math.min(shops.length, 64 + (shops.length >> 4));
    while (n-- > 0) {
      if (this.scanS >= shops.length) this.scanS = 0;
      const s = shops[this.scanS++];
      if (s && !this.shopRecs.has(s.id)) this.addShop(s);
    }
    const mineS = this.shopList;
    n = all ? mineS.length : Math.min(mineS.length, 64 + (mineS.length >> 4));
    while (n-- > 0) {
      if (this.checkS >= mineS.length) this.checkS = 0;
      const rec = mineS[this.checkS++];
      if (!rec) break;
      if (store.shop(rec.id) !== rec.shop) {
        this.removeShop(rec);
        this.checkS--;
      } else if (rec.ai < 0) {
        this.syncShop(rec, false);
      }
    }
  }

  // ───────────────────────────── image ─────────────────────────────

  private syncQuality(): void {
    const q = this.view.quality;
    if (q === this.quality) return;
    this.quality = q;
    const old = this.cfg;
    this.cfg = lodConfig(q);
    this.rig.setConfig(this.cfg);
    this.store.setConfig(this.cfg);
    if (this.cfg.atlas !== old.atlas || (q === 'bas') !== (old.d0 === 0)) {
      // atlas d'une autre taille ou autre famille de matériau : tout est recréé
      for (const r of this.shopList) { r.signHeld = false; r.sign = null; }
      this.atlas.dispose();
      disposeMaterials(this.materials);
      this.atlas = new PropAtlas(this.cfg.atlas, q === 'bas' ? 2 : this.view.renderer.capabilities.getMaxAnisotropy());
      this.asm.setAtlas(this.atlas);
      this.materials = this.makeMaterials();
      this.dyn.mesh.material = this.materials.opaque;
      this.dyn.mesh.customDepthMaterial = this.materials.depth;
      this.glass.mesh.material = this.materials.glass;
      this.store.setMaterials(this.materials);
    }
    this.dyn.mesh.castShadow = this.cfg.shadowLevel >= 0;
    this.invalidate();
  }

  private updateUniforms(dt: number): void {
    const u = this.uniforms;
    u.uPTime.value = (u.uPTime.value + dt) % 3600;
    const env = this.ctx.env.state;
    if (this.shared) {
      const su = this.shared.uniforms;
      this.night = su.uNight.value;
      this.lamps = su.uStreetLights.value;
      const c = su.uSkyColor.value;
      u.uPSky.value.setRGB(c.r, c.g, c.b);
    } else {
      // lissage maison : allumage en ~1,5 s
      const k = this.first ? 1 : Math.min(1, dt * 1.6);
      this.night += ((env.isNight ? 1 : 1 - Math.min(1, env.daylight * 1.6)) - this.night) * k;
      this.lamps += ((env.streetLights ? 1 : 0) - this.lamps) * k;
      const d = Math.max(0.03, env.daylight);
      u.uPSky.value.setRGB(0.5 * d + 0.012, 0.64 * d + 0.016, 0.86 * d + 0.03);
    }
    u.uPNight.value = this.night;
    u.uPLamps.value = this.lamps;
    const s = u.uPSky.value;
    u.uPWarm.value.setRGB(s.r * 0.9 + 0.01, s.g * 0.74 + 0.008, s.b * 0.52 + 0.006);
  }

  private dynLod(rec: PropRec): number {
    const p = rec.prop;
    const dx = p.x - this.view.camX, dz = p.z - this.view.camZ, dy = p.y - this.view.camY;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const level = d < this.cfg.d0 * 1.4 ? 0 : d < this.cfg.d1 ? 1 : d < this.cfg.d2 ? 2 : d < this.cfg.cap ? 3 : -1;
    return objectLod(level, rec.info.size, false);
  }

  private updateDynamic(): void {
    const list = this.dynList;
    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i]!;
      const p = rec.prop;
      if (p.x !== rec.x || p.z !== rec.z || p.y !== rec.y || p.heading !== rec.heading || p.halfX !== rec.hX || p.height !== rec.height) {
        this.syncProp(rec, false);
        rec.lastMove = this.time;
      } else if (p.carriedBy === 0 && this.time - rec.lastMove > SETTLE_SECONDS) {
        this.leaveDynamic(rec);
        this.syncProp(rec, true);
      }
    }
    if (!this.dynDirty) return;
    this.dynDirty = false;
    const d = this.dyn.buf;
    d.reset();
    for (let i = 0; i < list.length; i++) {
      const rec = list[i]!;
      const lod = this.dynLod(rec);
      if (lod >= 0) this.asm.prop(d, rec, lod, 0, 0, null);
    }
    this.dyn.syncAll();
  }

  private rebuildGlass(): void {
    this.store.glassDirty = false;
    const g = this.glass.buf;
    g.reset();
    for (const ch of this.store.list) {
      if (ch.level < 0 || ch.level > 1) continue;
      const props = ch.props;
      for (let i = 0; i < props.length; i++) {
        const rec = props[i]!;
        if (!rec.mayGlass || rec.dynamic || rec.prop.dormant) continue;
        this.asm.glassOnly(g, rec, ch.level);
      }
    }
    for (const rec of this.dynList) if (rec.mayGlass) this.asm.glassOnly(g, rec, 1);
    // traînées de suie des boutiques proches
    for (const ch of this.store.list) {
      if (ch.level < 0 || ch.level > 1) continue;
      const shops = ch.shops;
      for (let i = 0; i < shops.length; i++) {
        const rec = shops[i]!;
        if (hasSoot(rec.state) && !rec.shop.dormant) this.asm.shopSoot(g, rec);
      }
    }
    this.glass.syncAll();
  }

  frame(dt: number): void {
    const t0 = performance.now();
    // compteurs de l'image précédente (remplis par les maillages au moment du dessin)
    const st = this.stats;
    st.drawCalls = SlotMesh.drawn + (this.rig.halos.count > 0 ? 1 : 0);
    st.shadowCalls = SlotMesh.shadowDrawn;
    st.triangles = Math.round(SlotMesh.triangles) + this.rig.halos.count * 2;
    SlotMesh.drawn = SlotMesh.shadowDrawn = SlotMesh.triangles = 0;

    this.time += dt;
    this.syncQuality();
    this.updateUniforms(dt);

    // 1. changements signalés par les événements, puis relecture d'une tranche des listes
    const props = this.ctx.props;
    const sp = this.spawned;
    for (let i = 0; i < sp.length; i++) {
      const p = props.get(sp[i]!);
      if (p) this.addProp(p);
    }
    sp.length = 0;
    const rm = this.removed;
    for (let i = 0; i < rm.length; i++) {
      // on ne retire la fiche que si l'objet a bien quitté le magasin
      const rec = this.propRecs.get(rm[i]!);
      if (rec && props.get(rec.id) !== rec.prop) this.removeProp(rec.id);
    }
    rm.length = 0;
    const qp = this.queueP;
    for (let i = 0; i < qp.length; i++) {
      const rec = qp[i]!;
      rec.queued = false;
      if (rec.li >= 0) this.syncProp(rec, true);
    }
    qp.length = 0;
    const qs = this.queueS;
    for (let i = 0; i < qs.length; i++) {
      const rec = qs[i]!;
      rec.queued = false;
      if (this.shopRecs.get(rec.id) === rec) this.syncShop(rec, true);
    }
    qs.length = 0;
    this.poll(this.first);

    // 2. rideaux en mouvement et objets en mouvement
    const anim = this.animShops;
    for (let i = anim.length - 1; i >= 0; i--) {
      const rec = anim[i]!;
      this.syncShop(rec, false);
      if (this.time > rec.animUntil) this.stopAnim(rec);
    }
    this.updateDynamic();

    // 3. niveaux de détail des morceaux
    const v = this.view;
    this.evalTimer -= dt;
    const dx = v.camX - this.lastCamX, dz = v.camZ - this.lastCamZ, dy = v.camY - this.lastCamY;
    if (this.store.evalWanted || this.evalTimer <= 0 || !(dx * dx + dz * dz + dy * dy < 9)) {
      this.store.evalWanted = false;
      this.evalTimer = 0.5;
      this.lastCamX = v.camX;
      this.lastCamY = v.camY;
      this.lastCamZ = v.camZ;
      this.store.evaluate(v);
    }
    const todo = this.store.todo;
    let done = 0;
    while (todo.length > 0 && (done === 0 || this.first || performance.now() - t0 < REBUILD_BUDGET_MS)) {
      const ch = todo.pop()!;
      if (ch.want >= 0 && (ch.props.length > 0 || ch.shops.length > 0)) this.store.rebuild(ch, ch.want);
      done++;
    }
    if (this.store.glassDirty) this.rebuildGlass();
    // modèles construits d'avance tant qu'il reste du temps dans l'image
    if (done === 0 && this.warming) this.warming = this.lib.warm(0.8);

    // 4. lumières, atlas
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.3;
      this.rig.update(v.camX, v.camY, v.camZ, this.lamps, this.night);
    }
    this.rig.halos.flush(v.camera, v.renderer.domElement.height);
    if (this.atlas.flush()) st.atlasUploads = this.atlas.uploads;

    this.first = false;
    st.props = this.propList.length;
    st.shops = this.shopList.length;
    st.dynamic = this.dynList.length;
    st.halos = this.rig.halos.count;
    st.lights = this.rig.lit;
    st.models = this.lib.built;
    st.signs = this.atlas.signs.inUse;
    st.atlasUploads = this.atlas.uploads;
    const ms = performance.now() - t0;
    st.cpuMs = ms;
    st.cpuMsAvg += (ms - st.cpuMsAvg) * 0.05;
    if (ms > st.cpuMsMax) st.cpuMsMax = ms;
  }

  get dormantMode(): 'lointain' | 'masque' {
    return this.store.dormantMode;
  }

  set dormantMode(value: 'lointain' | 'masque') {
    this.store.dormantMode = value;
  }

  /** Reconstruit tout l'affichage (changement de qualité ou de mode d'affichage des objets endormis). */
  invalidate(): void {
    for (const ch of this.store.list) if (ch.level >= 0) ch.dirty = true;
    for (const rec of this.propList) this.rig.prop(rec, this.lib, this.store.hidden(rec.prop.dormant));
    for (const rec of this.shopList) this.rig.shop(rec, this.store.hidden(rec.shop.dormant));
    this.dynDirty = true;
    this.store.glassDirty = true;
    this.store.evalWanted = true;
  }

  /** Nouvelle session : tout oublier (les listes de la simulation ont été vidées). */
  reset(): void {
    this.store.clear();
    this.propRecs.clear();
    this.propList.length = 0;
    this.shopRecs.clear();
    this.shopList.length = 0;
    this.spawned.length = 0;
    this.removed.length = 0;
    this.queueP.length = 0;
    this.queueS.length = 0;
    this.dynList.length = 0;
    this.animShops.length = 0;
    this.rig.clear();
    this.atlas.signs.clear();
    this.dyn.buf.reset();
    this.dyn.syncAll();
    this.glass.buf.reset();
    this.glass.syncAll();
    this.scanP = this.checkP = this.scanS = this.checkS = 0;
    this.first = true;
    this.store.evalWanted = true;
    this.ext = this.ctx.service<PropsExtLike>(PROPS_EXT_KEY);
    this.shared = this.ctx.service<UniformsLike>(RENDER_UNIFORMS_KEY);
    this.stats.cpuMsMax = 0;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    this.store.clear();
    this.dyn.dispose();
    this.glass.dispose();
    this.rig.dispose();
    this.atlas.dispose();
    disposeMaterials(this.materials);
    this.root.removeFromParent();
  }

  /** Accès pour le banc d'essai : atlas (aperçu), nombre de cellules d'enseigne. */
  get atlasCanvas(): HTMLCanvasElement {
    return this.atlas.canvas;
  }
}

