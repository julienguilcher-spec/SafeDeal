/* Rendu des personnages : lit ctx.people.list à chaque image et dessine chaque personne non dormante par
 * instancing — corps (3 niveaux de détail), objets tenus, ombres de contact, bras à la première personne.
 * Un emplacement (ligne des textures de poses et d'apparence) est attribué à chaque personne. */

import * as THREE from 'three';
import type { GameContext, Person, PersonLook, QualityLevel, Vec3, ViewApi } from '@/core/contracts';
import { BONE_CHEST, BONE_COUNT, BONE_HAND_L, BONE_HAND_R, BONE_HEAD, BONE_STRIDE, REF_HEIGHT } from './skeleton';
import { hash32, srgbToLinear } from './mathx';
import { PeopleAnimator, createAnimSample, sampleFromPerson, type AnimSample } from './animator';
import { FpRig } from './fp';
import { HOLD_NONE, U_CARRIED, U_DRAGGED, U_NONE, U_RIDE } from './poseparams';
import { Placement } from './placement';
import { QUALITY } from './quality';
import { LOOK_W, lookSignature, resolveLook } from './look';
import { SLOGANS, TextAtlas, createBlobTexture } from './atlas';
import {
  FLAG_FP, FLAG_NORMAL, FLAG_NO_BLOB, FLAG_SHADOW_ONLY, createPeopleDepthMaterial,
  createPeopleDistanceMaterial, createPeopleMaterial, createUniforms, type PeopleUniforms,
} from './shader';
import {
  commitLayer, createBlobLayer, createBodyLayer, createItemLayers, resizeLayer,
  type InstancedLayer, type ItemLayer,
} from './meshes';
import { findHeldModel, heldRegistryVersion, type HeldModel } from './held';
import { ensureModels } from './models';
import type { HeldBone, PeopleRenderStats } from './api';

/** Largeur d'une ligne de la texture de poses : racine, paramètres, puis 2 texels par os. */
const POSE_W = 2 + BONE_COUNT * 2;
const POSE_STRIDE = POSE_W * 4;
const LOOK_STRIDE = LOOK_W * 4;
const FP_SLOT = 0;

export class PeopleRenderer {
  readonly stats: PeopleRenderStats = { near: 0, mid: 0, far: 0, items: 0, posed: 0, cpuMs: 0, cpuMsAvg: 0, drawCalls: 0 };
  /** Désactive les niveaux de détail (tout au niveau proche) — bancs d'essai uniquement. */
  forceLod = -1;

  private readonly ctx: GameContext;
  private readonly view: ViewApi;
  private readonly group = new THREE.Group();
  private readonly uniforms: PeopleUniforms = createUniforms();
  private readonly atlas: TextAtlas;
  private readonly blobTexture: THREE.Texture;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly bodyDepth: THREE.MeshDepthMaterial;
  private readonly bodyDistance: THREE.MeshDistanceMaterial;

  private capacity = 0;
  private poseData: Float32Array = new Float32Array(0);
  private lookData: Float32Array = new Float32Array(0);
  private poseTex: THREE.DataTexture | null = null;
  private lookTex: THREE.DataTexture | null = null;
  private animator = new PeopleAnimator(1);
  private readonly fpRig = new FpRig();

  // emplacements
  private readonly slotOfId = new Map<number, number>();
  private readonly freeSlots: number[] = [];
  private nextSlot = 1;
  private slotId: Int32Array = new Int32Array(0);
  private seen: Int32Array = new Int32Array(0);
  private lodOf: Int8Array = new Int8Array(0);
  private lastPose: Float64Array = new Float64Array(0);
  private lookSig: Float64Array = new Float64Array(0);
  private stateSig: Int32Array = new Int32Array(0);
  private modelOf: Int16Array = new Int16Array(0);
  private visorOf: Int8Array = new Int8Array(0);
  private itemCell: Float32Array = new Float32Array(0);
  private itemCol: Float32Array = new Float32Array(0);
  private lookRef: (PersonLook | null)[] = [];
  private outfitRef: string[] = [];
  private headgearRef: string[] = [];
  private backTextRef: string[] = [];
  private extrasRef: (Record<string, number> | undefined)[] = [];
  private listSlot: Int32Array = new Int32Array(0);

  // couches
  private lods: InstancedLayer[] = [];
  private items: ItemLayer[] = [];
  private blob: InstancedLayer | null = null;
  private modelById: (HeldModel | undefined)[] = [];
  private registryVersion = -1;
  private readonly itemModelCache = new Map<string, HeldModel | null>();
  private readonly heldText = new Map<number, number>();
  private visorUp: HeldModel | undefined;
  private visorDown: HeldModel | undefined;
  private visorGold: HeldModel | undefined;

  // état d'image
  private frameNo = 0;
  private animTime = 0;
  private lastClock = -1;
  private nearScale = 1;
  private midScale = 1;
  private lookDirty = false;
  private fpLookSlot = -1;
  private originX = 0;
  private originZ = 0;
  private readonly planes = new Float64Array(24);
  private readonly sample: AnimSample = createAnimSample();
  private readonly m4 = new THREE.Matrix4();
  private readonly inv = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  private readonly unsub: (() => void)[] = [];
  private quality: QualityLevel = 'moyen';
  private growTo = 0;
  private shadowsOn = true;

  private readonly placement = new Placement();

  constructor(ctx: GameContext, view: ViewApi) {
    this.ctx = ctx;
    this.view = view;
    ensureModels();
    this.atlas = new TextAtlas();
    this.blobTexture = createBlobTexture();
    this.uniforms.uAtlas.value = this.atlas.texture;
    const caps = view.renderer.capabilities as { logarithmicDepthBuffer?: boolean; reversedDepthBuffer?: boolean };
    if (caps.logarithmicDepthBuffer || caps.reversedDepthBuffer) this.uniforms.uFpDepth.value = 1;
    this.bodyMaterial = createPeopleMaterial(this.uniforms, false, false);
    this.bodyDepth = createPeopleDepthMaterial(this.uniforms, false);
    this.bodyDistance = createPeopleDistanceMaterial(this.uniforms, false);
    this.group.name = 'personnages';
    view.world.add(this.group);
    this.resize(256);
    this.buildLayers();
    this.unsub.push(ctx.events.on('person:removed', (e) => this.release(e.id)));
  }

  // ── capacité et couches ───────────────────────────────────────────────────────────

  private resize(capacity: number): void {
    const old = this.capacity;
    if (capacity <= old) return;
    const g32 = (a: Float32Array, k: number): Float32Array => { const b = new Float32Array(capacity * k); b.set(a); return b; };
    this.poseData = g32(this.poseData, POSE_STRIDE);
    this.lookData = g32(this.lookData, LOOK_STRIDE);
    const i32 = (a: Int32Array): Int32Array => { const b = new Int32Array(capacity); b.set(a); return b; };
    this.slotId = i32(this.slotId);
    this.seen = i32(this.seen);
    this.stateSig = i32(this.stateSig);
    const lod = new Int8Array(capacity); lod.set(this.lodOf); this.lodOf = lod;
    const lp = new Float64Array(capacity); lp.set(this.lastPose); this.lastPose = lp;
    const ls = new Float64Array(capacity); ls.set(this.lookSig); this.lookSig = ls;
    const mo = new Int16Array(capacity); mo.set(this.modelOf); this.modelOf = mo;
    const vo = new Int8Array(capacity); vo.set(this.visorOf); this.visorOf = vo;
    this.itemCell = g32(this.itemCell, 1);
    this.itemCol = g32(this.itemCol, 3);
    for (let i = old; i < capacity; i++) {
      this.lookRef[i] = null; this.outfitRef[i] = ''; this.headgearRef[i] = ''; this.backTextRef[i] = ''; this.extrasRef[i] = undefined;
    }
    this.animator.grow(capacity);
    this.capacity = capacity;
    // textures de données : poses (réécrite chaque image) et apparence (réécrite quand un look change)
    this.poseTex?.dispose();
    this.lookTex?.dispose();
    const mk = (data: Float32Array, w: number): THREE.DataTexture => {
      const t = new THREE.DataTexture(data, w, capacity, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    this.poseTex = mk(this.poseData, POSE_W);
    this.lookTex = mk(this.lookData, LOOK_W);
    this.uniforms.uPose.value = this.poseTex;
    this.uniforms.uLook.value = this.lookTex;
    for (const l of this.lods) resizeLayer(l, capacity);
    for (const l of this.items) resizeLayer(l, capacity);
    if (this.blob) resizeLayer(this.blob, capacity);
  }

  private buildLayers(): void {
    for (const l of this.lods) { this.group.remove(l.mesh); l.geo.dispose(); }
    for (const l of this.items) { this.group.remove(l.mesh); l.geo.dispose(); (l.mesh.material as THREE.Material).dispose(); }
    if (this.blob) { this.group.remove(this.blob.mesh); this.blob.geo.dispose(); (this.blob.mesh.material as THREE.Material).dispose(); }
    this.lods = [];
    for (let d = 0; d < 3; d++) {
      const l = createBodyLayer(d, this.capacity, this.uniforms, this.bodyMaterial, this.bodyDepth, this.bodyDistance);
      l.mesh.receiveShadow = true;
      this.lods.push(l);
      this.group.add(l.mesh);
    }
    this.blob = createBlobLayer(this.capacity, this.uniforms, this.blobTexture);
    this.group.add(this.blob.mesh);
    this.buildItemLayers();
  }

  private buildItemLayers(): void {
    for (const l of this.items) { this.group.remove(l.mesh); l.geo.dispose(); (l.mesh.material as THREE.Material).dispose(); }
    this.items = createItemLayers(this.capacity, this.uniforms);
    for (const l of this.items) { l.mesh.receiveShadow = !l.transparent; this.group.add(l.mesh); }
    this.registryVersion = heldRegistryVersion();
    this.itemModelCache.clear();
    this.modelById = [];
    this.visorUp = findHeldModel('_visor_up');
    this.visorDown = findHeldModel('_visor_down');
    this.visorGold = findHeldModel('_visor_gold');
    for (let s = 0; s < this.capacity; s++) this.modelOf[s] = -1;   // force la relecture des objets tenus
    this.stats.drawCalls = 3 + 1 + this.items.length;
  }

  // ── emplacements ──────────────────────────────────────────────────────────────────

  private alloc(id: number): number {
    let slot = this.freeSlots.pop();
    if (slot === undefined) {
      // plus de place : la personne attend l'image suivante (les tableaux ne changent pas en cours de boucle)
      if (this.nextSlot >= this.capacity) { this.growTo = Math.max(this.growTo, this.capacity * 2); return -1; }
      slot = this.nextSlot++;
    }
    this.slotOfId.set(id, slot);
    this.slotId[slot] = id;
    this.lodOf[slot] = 2;
    this.lastPose[slot] = -1e9;
    this.lookRef[slot] = null;
    this.modelOf[slot] = -1;
    this.visorOf[slot] = 0;
    this.animator.assign(slot, id);
    return slot;
  }

  private release(id: number): void {
    const slot = this.slotOfId.get(id);
    if (slot === undefined) return;
    this.slotOfId.delete(id);
    this.heldText.delete(id);
    this.slotId[slot] = 0;
    this.lookRef[slot] = null;
    this.freeSlots.push(slot);
  }

  /** Libère tous les emplacements (nouvelle session). */
  reset(): void {
    this.slotOfId.clear();
    this.heldText.clear();
    this.freeSlots.length = 0;
    this.nextSlot = 1;
    this.slotId.fill(0);
    for (let i = 0; i < this.capacity; i++) this.lookRef[i] = null;
    this.listSlot.fill(0);
    this.fpRig.reset();
    this.fpLookSlot = -1;
    this.lastClock = -1;
  }

  /** Texte de la pancarte / banderole d'une personne (null : slogan générique). */
  setHeldText(personId: number, text: string | null): void {
    if (text === null || text === '') this.heldText.delete(personId);
    else this.heldText.set(personId, this.atlas.cellOf(text.toUpperCase()));
    const slot = this.slotOfId.get(personId);
    if (slot !== undefined) this.modelOf[slot] = -1;   // relu à la prochaine image
  }

  invalidate(personId?: number): void {
    if (personId === undefined) {
      for (let i = 0; i < this.capacity; i++) this.lookRef[i] = null;
    } else {
      const s = this.slotOfId.get(personId);
      if (s !== undefined) this.lookRef[s] = null;
    }
  }

  /** Position monde d'un os d'une personne affichée. */
  bonePosition(personId: number, bone: HeldBone, out: Vec3): boolean {
    const slot = this.slotOfId.get(personId);
    if (slot === undefined || this.seen[slot] < this.frameNo - 1) return false;
    const b = bone === 'head' ? BONE_HEAD : bone === 'chest' ? BONE_CHEST : bone === 'handL' ? BONE_HAND_L : BONE_HAND_R;
    const r = slot * POSE_STRIDE, o = r + 8 + b * BONE_STRIDE;
    const d = this.poseData;
    out.x = this.originX + d[r] + d[o + 4];
    out.y = d[r + 1] + d[o + 5];
    out.z = this.originZ + d[r + 2] + d[o + 6];
    return true;
  }

  // ── objets tenus ──────────────────────────────────────────────────────────────────

  private modelFor(p: Person): HeldModel | null {
    const a = p.active;
    const inv = p.inventory;
    if (a < 0 || a >= inv.length) return null;
    const id = inv[a].id;
    let m = this.itemModelCache.get(id);
    if (m === undefined) {
      const def = this.ctx.actions.def(id);
      m = findHeldModel(def && def.heldModel ? def.heldModel : id) ?? findHeldModel(id) ?? null;
      this.itemModelCache.set(id, m);
    }
    return m;
  }

  private refreshItem(slot: number, p: Person, m: HeldModel | null): void {
    this.modelOf[slot] = m ? m.id : 0;
    this.modelById[m ? m.id : 0] = m ?? undefined;
    let r = 1, g = 1, b = 1, cell = 0;
    if (m) {
      const h = hash32(p.id * 2654435 + m.id * 97);
      if (m.colors) {
        const c = m.colors[h % m.colors.length];
        r = srgbToLinear(((c >> 16) & 255) / 255); g = srgbToLinear(((c >> 8) & 255) / 255); b = srgbToLinear((c & 255) / 255);
      }
      if (m.text === 'slogan') {
        const custom = this.heldText.get(p.id);
        cell = custom !== undefined && custom > 0 ? custom : this.atlas.sloganBase + ((h >>> 8) % SLOGANS.length);
      }
      else if (m.text === 'unit') {
        const t = p.look.backText;
        cell = this.atlas.cellOf(t === 'CRS' || t === 'GENDARMERIE' || t === 'POLICE' ? t : 'POLICE');
      }
    }
    this.itemCol[slot * 3] = r; this.itemCol[slot * 3 + 1] = g; this.itemCol[slot * 3 + 2] = b;
    this.itemCell[slot] = cell;
  }

  private pushItem(layer: ItemLayer, slot: number, modelId: number, cell: number, r: number, g: number, b: number): void {
    const n = layer.count;
    if (n >= layer.slots.length) return;
    layer.slots[n] = slot;
    layer.item[n * 4] = modelId;
    layer.item[n * 4 + 1] = cell;
    layer.col[n * 3] = r; layer.col[n * 3 + 1] = g; layer.col[n * 3 + 2] = b;
    layer.count = n + 1;
  }

  // ── apparence ─────────────────────────────────────────────────────────────────────

  private writeLook(slot: number, p: Person, state: number): void {
    const look = p.look;
    const m = this.modelById[this.modelOf[slot]];
    const fistR = !!m && (m.bone === BONE_HAND_R || m.twoHanded);
    const fistL = !!m && (m.bone === BONE_HAND_L || m.twoHanded);
    const info = resolveLook(look, this.animator.variantOf(slot), fistL, fistR, p.wet, p.burning, this.atlas.cellOf, this.lookData, slot * LOOK_STRIDE, (state & 64) !== 0);
    this.visorOf[slot] = info.visor;
    this.lookRef[slot] = look;
    this.outfitRef[slot] = look.outfit;
    this.headgearRef[slot] = look.headgear;
    this.backTextRef[slot] = look.backText;
    this.extrasRef[slot] = look.extras;
    this.lookSig[slot] = lookSignature(look);
    this.stateSig[slot] = state;
    this.lookDirty = true;
    if (m && m.text === 'unit') this.refreshItem(slot, p, m);
  }

  // ── image ─────────────────────────────────────────────────────────────────────────

  frame(dt: number): void {
    const t0 = performance.now();
    const ctx = this.ctx, view = this.view;
    const people = ctx.people.list;
    const n = people.length;
    if (heldRegistryVersion() !== this.registryVersion) this.buildItemLayers();
    // capacité : au moins toutes les personnes connues, plus une marge (puissance de deux)
    if (this.growTo > 0 || n + 2 > this.capacity) {
      let cap = Math.max(this.capacity, this.growTo);
      while (cap < n + 2) cap *= 2;
      this.growTo = 0;
      this.resize(cap);
    }
    if (this.listSlot.length < n) this.listSlot = new Int32Array(Math.max(n, this.listSlot.length * 2, 256));

    // temps d'animation : suit l'horloge de simulation (figé en pause, accéléré en avance rapide)
    const clockNow = ctx.clock.now;
    if (this.lastClock < 0 || clockNow < this.lastClock) this.lastClock = clockNow;
    let adt = clockNow - this.lastClock;
    this.lastClock = clockNow;
    if (adt > 0.25) adt = 0.25;
    const paused = ctx.session.phase === 'paused';
    if (adt <= 0 && !paused && ctx.session.phase !== 'playing') adt = dt > 0.1 ? 0.1 : dt;   // menus, bancs d'essai sans horloge
    this.animTime += adt;
    const now = this.animTime;
    const frozen = adt <= 0;

    // réglages de qualité
    const quality = view.quality;
    const Q = QUALITY[quality] ?? QUALITY.moyen;
    const shadowsOn = ctx.settings.values.shadows !== false && view.renderer.shadowMap.enabled;
    if (quality !== this.quality || shadowsOn !== this.shadowsOn) {
      this.quality = quality;
      this.shadowsOn = shadowsOn;
    }
    const cast = shadowsOn ? Q.castLevels : 0;
    this.lods[0].mesh.castShadow = cast >= 1;
    this.lods[1].mesh.castShadow = cast >= 2;
    this.lods[2].mesh.castShadow = false;
    for (const l of this.items) l.mesh.castShadow = cast >= 1 && !l.transparent;
    // l'ombre de contact s'efface quand les ombres portées réelles sont actives
    ((this.blob as InstancedLayer).mesh.material as THREE.MeshBasicMaterial).opacity = cast >= 1 ? 0.2 : 0.42;

    // caméra : position, plans du champ de vision, origine locale (précision des flottants 32 bits)
    const cam = view.camera;
    cam.updateMatrixWorld();
    const ce = cam.matrixWorld.elements;
    const camX = ce[12], camY = ce[13], camZ = ce[14];
    this.inv.copy(cam.matrixWorld).invert();
    this.m4.multiplyMatrices(cam.projectionMatrix, this.inv);
    this.frustum.setFromProjectionMatrix(this.m4);
    const planes = this.planes;
    for (let i = 0; i < 6; i++) {
      const pl = this.frustum.planes[i];
      planes[i * 4] = pl.normal.x; planes[i * 4 + 1] = pl.normal.y; planes[i * 4 + 2] = pl.normal.z; planes[i * 4 + 3] = pl.constant;
    }
    const ox = Math.round(camX / 64) * 64, oz = Math.round(camZ / 64) * 64;
    this.originX = ox; this.originZ = oz;
    this.group.position.set(ox, 0, oz);
    this.group.updateMatrix();
    this.group.updateMatrixWorld(true);

    const ps = ctx.player.state;
    const zoom = ps.zoom > 0.1 ? ps.zoom : 1;
    const mode = ps.cameraMode;
    const fpId = mode === 'fps' ? ps.personId : 0;
    const hideId = mode === 'vehicle_int' || mode === 'turret' || mode === 'viewfinder' ? ps.personId : 0;
    const maxD = Math.min(view.drawDistance > 0 ? view.drawDistance : 1e9, Q.maxDistance * zoom);
    const maxD2 = maxD * maxD;
    const nearD = Q.near * this.nearScale * zoom, midD = Q.mid * this.midScale * zoom;
    const force = this.forceLod;

    const lods = this.lods, items = this.items, blob = this.blob as InstancedLayer;
    for (let d = 0; d < 3; d++) lods[d].count = 0;
    for (let i = 0; i < items.length; i++) items[i].count = 0;
    blob.count = 0;
    const pose = this.poseData;
    const sample = this.sample;
    const place = this.placement;
    const frameNo = ++this.frameNo;
    let posed = 0;
    let fpPerson: Person | null = null;
    let fpSlot = -1;

    for (let i = 0; i < n; i++) {
      const p = people[i];
      if (p.dormant) continue;
      const id = p.id;
      let slot = this.listSlot[i];
      if (slot <= 0 || this.slotId[slot] !== id) {
        const known = this.slotOfId.get(id);
        slot = known !== undefined ? known : this.alloc(id);
        if (slot < 0) continue;
        this.listSlot[i] = slot;
      }
      if (id === hideId) continue;

      // position affichée (siège de véhicule, porteur) et élimination par distance / champ de vision
      let x = p.x, y = p.y, z = p.z;
      const special = p.vehicleId !== 0 || p.heldBy !== 0;
      if (special) { place.resolve(ctx, p); x = place.x; y = place.y; z = place.z; }
      const dx = x - camX, dy = y + 0.9 - camY, dz = z - camZ;
      const d2 = dx * dx + dy * dy + dz * dz;
      const isFp = id === fpId;
      if (!isFp) {
        if (d2 > maxD2) continue;
        const cy = y + 0.9;
        const rad = d2 < 900 ? 3.2 : 2.4;
        if (planes[0] * x + planes[1] * cy + planes[2] * z + planes[3] < -rad
          || planes[4] * x + planes[5] * cy + planes[6] * z + planes[7] < -rad
          || planes[8] * x + planes[9] * cy + planes[10] * z + planes[11] < -rad
          || planes[12] * x + planes[13] * cy + planes[14] * z + planes[15] < -rad) continue;
      }
      const fresh = this.seen[slot] !== frameNo - 1;
      this.seen[slot] = frameNo;

      // niveau de détail avec hystérésis
      let lod: number;
      if (force >= 0) lod = force;
      else {
        const dist = Math.sqrt(d2);
        const prev = fresh ? 2 : this.lodOf[slot];
        if (prev === 0) lod = dist < nearD * 1.1 ? 0 : dist < midD ? 1 : 2;
        else if (prev === 1) lod = dist < nearD * 0.92 ? 0 : dist < midD * 1.08 ? 1 : 2;
        else lod = dist < nearD * 0.92 ? 0 : dist < midD * 0.93 ? 1 : 2;
      }
      this.lodOf[slot] = lod;

      // objet tenu
      const model = p.active >= 0 ? this.modelFor(p) : null;
      const mid = model ? model.id : 0;
      let lookStale = this.lookRef[slot] !== p.look;
      if (this.modelOf[slot] !== mid) { this.refreshItem(slot, p, model); lookStale = true; }

      // apparence : vérifiée à chaque image de près, par roulement sinon
      const st = (p.wet * 4 | 0) + ((p.burning * 6 | 0) << 3) + (p.posture !== 'stand' && p.posture !== 'crouch' ? 64 : 0);
      if (!lookStale && this.stateSig[slot] !== st) lookStale = true;
      if (!lookStale && (lod === 0 || ((frameNo + slot) & 7) === 0)) {
        const lk = p.look;
        lookStale = this.outfitRef[slot] !== lk.outfit || this.headgearRef[slot] !== lk.headgear
          || this.backTextRef[slot] !== lk.backText || this.extrasRef[slot] !== lk.extras || this.lookSig[slot] !== lookSignature(lk);
      }
      if (lookStale) this.writeLook(slot, p, st);

      // racine et paramètres d'instance
      const look = p.look;
      const s = look.height / REF_HEIGHT;
      const r = slot * POSE_STRIDE;
      let flag = FLAG_NORMAL;
      if (isFp) flag = FLAG_SHADOW_ONLY;
      else if (special && place.noBlob) flag = FLAG_NO_BLOB;
      pose[r] = x - ox; pose[r + 1] = y; pose[r + 2] = z - oz; pose[r + 3] = 0;
      pose[r + 4] = s; pose[r + 5] = look.build; pose[r + 6] = Math.sqrt(Math.sqrt(s)); pose[r + 7] = flag;

      // pose : à chaque image de près, moins souvent de loin
      const since = now - this.lastPose[slot];
      if (fresh || lod === 0 || since >= (lod === 1 ? Q.midInterval : Q.farInterval)) {
        if (!frozen || fresh) {
          sampleFromPerson(p, model ? model.hold : HOLD_NONE, sample);
          if (special) {
            sample.x = x; sample.z = z; sample.heading = place.heading;
            sample.pitch = place.pitch; sample.roll = place.roll; sample.steer = place.steer;
            sample.attached = place.attached;
            if (place.posture >= 0) sample.posture = place.posture;
            if (place.upper >= 0 && (sample.upper === U_NONE || place.upper === U_CARRIED || place.upper === U_DRAGGED || place.upper === U_RIDE)) sample.upper = place.upper;
          }
          if (fresh) this.animator.markFresh(slot);
          this.animator.update(slot, sample, now, pose, r + 8);
          // première pose : échéance décalée d'une fraction d'intervalle propre à l'emplacement, pour que
          // les recalculs des personnages lointains se répartissent sur les images au lieu de tomber ensemble
          this.lastPose[slot] = fresh ? now - ((slot * 0.6180339887) % 1) * Q.farInterval : now;
          posed++;
        }
      }

      if (isFp) {
        fpPerson = p;
        fpSlot = slot;
        if (cast >= 1) { const L = lods[1]; L.slots[L.count++] = slot; }
        continue;
      }
      const L = lods[lod];
      L.slots[L.count++] = slot;
      blob.slots[blob.count++] = slot;

      // objet tenu et visière
      if (model && (lod < 2 || model.big)) {
        this.pushItem(items[model.family], slot, mid, this.itemCell[slot], this.itemCol[slot * 3], this.itemCol[slot * 3 + 1], this.itemCol[slot * 3 + 2]);
      }
      if (lod < 2) {
        const vz = this.visorOf[slot];
        if (vz !== 0) {
          const vm = vz === 1 ? this.visorUp : vz === 2 ? this.visorDown : this.visorGold;
          if (vm) this.pushItem(items[vm.family], slot, vm.id, 0, 1, 1, 1);
        }
      }
    }

    // bras à la première personne (emplacement réservé, os en espace caméra)
    if (fpPerson && fpSlot >= 0) this.frameFp(fpPerson, fpSlot, now);
    else this.fpLookSlot = -1;

    // budget de personnages détaillés : resserre ou relâche les distances de bascule
    const cNear = lods[0].count, cMid = lods[1].count;
    if (cNear > Q.maxNear) this.nearScale = Math.max(0.3, this.nearScale * 0.95);
    else if (cNear < Q.maxNear * 0.8) this.nearScale = Math.min(1, this.nearScale * 1.02);
    if (cMid > Q.maxMid) this.midScale = Math.max(0.3, this.midScale * 0.95);
    else if (cMid < Q.maxMid * 0.8) this.midScale = Math.min(1, this.midScale * 1.02);

    // envoi au GPU
    for (let d = 0; d < 3; d++) commitLayer(lods[d]);
    let itemCount = 0;
    for (let i = 0; i < items.length; i++) { commitLayer(items[i]); itemCount += items[i].count; }
    commitLayer(blob);
    if (this.poseTex) this.poseTex.needsUpdate = true;
    if (this.lookDirty && this.lookTex) { this.lookTex.needsUpdate = true; this.lookDirty = false; }

    // ménage : emplacements de personnes disparues sans événement
    if ((frameNo & 255) === 0) this.sweep();

    const st = this.stats;
    st.near = cNear; st.mid = cMid; st.far = lods[2].count; st.items = itemCount; st.posed = posed;
    st.cpuMs = performance.now() - t0;
    st.cpuMsAvg = st.cpuMsAvg === 0 ? st.cpuMs : st.cpuMsAvg * 0.95 + st.cpuMs * 0.05;
  }

  private frameFp(p: Person, bodySlot: number, now: number): void {
    const pose = this.poseData;
    const model = this.modelById[this.modelOf[bodySlot]];
    const sample = this.sample;
    sampleFromPerson(p, model ? model.hold : HOLD_NONE, sample);
    // l'apparence des bras est celle du joueur
    if (this.fpLookSlot !== bodySlot || this.lookDirty) {
      this.lookData.copyWithin(FP_SLOT * LOOK_STRIDE, bodySlot * LOOK_STRIDE, (bodySlot + 1) * LOOK_STRIDE);
      this.fpLookSlot = bodySlot;
      this.lookDirty = true;
    }
    const r = FP_SLOT * POSE_STRIDE, br = bodySlot * POSE_STRIDE;
    pose[r] = 0; pose[r + 1] = 0; pose[r + 2] = 0; pose[r + 3] = 0;
    pose[r + 4] = pose[br + 4]; pose[r + 5] = pose[br + 5]; pose[r + 6] = pose[br + 6]; pose[r + 7] = FLAG_FP;
    this.fpRig.update(sample, now, this.animator.phaseOf(bodySlot), this.animator.speedOf(bodySlot), pose, r + 8);
    const L = this.lods[0];
    L.slots[L.count++] = FP_SLOT;
    if (model) {
      this.pushItem(this.items[model.family], FP_SLOT, model.id, this.itemCell[bodySlot], this.itemCol[bodySlot * 3], this.itemCol[bodySlot * 3 + 1], this.itemCol[bodySlot * 3 + 2]);
    }
    // la visière baissée du joueur relève de l'effet d'écran (ViewApi.setScreenEffect), pas de ce module
  }

  private sweep(): void {
    const people = this.ctx.people;
    for (let s = 1; s < this.nextSlot; s++) {
      const id = this.slotId[s];
      if (id !== 0 && this.seen[s] < this.frameNo - 240 && !people.get(id)) this.release(id);
    }
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.unsub.length = 0;
    this.view.world.remove(this.group);
    for (const l of this.lods) l.geo.dispose();
    for (const l of this.items) { l.geo.dispose(); (l.mesh.material as THREE.Material).dispose(); }
    if (this.blob) { this.blob.geo.dispose(); (this.blob.mesh.material as THREE.Material).dispose(); }
    this.bodyMaterial.dispose();
    this.bodyDepth.dispose();
    this.bodyDistance.dispose();
    this.poseTex?.dispose();
    this.lookTex?.dispose();
    this.atlas.dispose();
    this.blobTexture.dispose();
  }
}
