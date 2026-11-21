/* =====================================================================================
 * RENDU DU DÉCOR — morceaux de 128 m : un maillage fusionné par morceau, à emplacements.
 *
 *   - rebuild() reconstruit un morceau entier à un niveau de détail (il change avec la distance) ;
 *   - put() réécrit un seul objet ou une seule devanture : en place si sa nouvelle géométrie tient
 *     dans l'emplacement réservé, sinon en fin de tampon ; à défaut le morceau est reconstruit ;
 *   - erase() efface un objet (triangles dégénérés) sans toucher au reste ;
 *   - evaluate() calcule le niveau voulu de chaque morceau d'après la caméra et dresse la file des
 *     reconstructions, les plus proches d'abord.
 * ===================================================================================== */

import type * as THREE from 'three';
import type { ViewApi } from '@/core/contracts';
import type { PropsRenderStats } from './api';
import type { Assembler } from './assemble';
import { CHUNK_SIZE, chunkCoord, chunkDistance, chunkKey, chunkLevel, objectLod, shopLod } from './mapping';
import type { LodConfig } from './mapping';
import type { PropMaterials } from './material';
import { MeshBuf } from './meshbuf';
import { Chunk } from './records';
import type { PropRec, ShopRec, Slot } from './records';
import { SlotMesh } from './slotmesh';

/** Marge laissée après chaque objet dans le tampon d'un morceau (graffitis, éclats qui s'ajoutent). */
const PROP_SLACK_V = 8, PROP_SLACK_I = 12;
const SHOP_SLACK_V = 64, SHOP_SLACK_I = 96;

export class ChunkStore {
  readonly chunks = new Map<number, Chunk>();
  readonly list: Chunk[] = [];
  /** File des morceaux à reconstruire, le plus proche en dernier (dépilée par la fin). */
  readonly todo: Chunk[] = [];
  /** Une évaluation des niveaux est demandée (morceau créé, vidé ou à reconstruire). */
  evalWanted = true;
  /** Le lot de verre doit être reconstruit (un morceau proche a changé). */
  glassDirty = false;
  dormantMode: 'lointain' | 'masque' = 'lointain';
  private readonly scratch = new MeshBuf(1024, 2048);

  constructor(
    private readonly root: THREE.Group, private materials: PropMaterials, private readonly asm: Assembler,
    private cfg: LodConfig, private readonly stats: PropsRenderStats,
  ) {}

  setConfig(cfg: LodConfig): void {
    this.cfg = cfg;
  }

  /** Nouveaux matériaux (changement de qualité) : appliqués aux maillages existants. */
  setMaterials(materials: PropMaterials): void {
    this.materials = materials;
    for (const ch of this.list) {
      if (ch.mesh) {
        ch.mesh.mesh.material = materials.opaque;
        ch.mesh.mesh.customDepthMaterial = materials.depth;
      }
    }
  }

  /** Morceau qui contient le point (créé au besoin). */
  at(x: number, z: number): Chunk {
    const cx = chunkCoord(x), cz = chunkCoord(z);
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(key, cx, cz);
      this.chunks.set(key, c);
      this.list.push(c);
      this.evalWanted = true;
    }
    return c;
  }

  /** Un objet endormi est-il masqué (mode « masque ») ? */
  hidden(dormant: boolean): boolean {
    return dormant && this.dormantMode === 'masque';
  }

  private copyInto(buf: MeshBuf, v0: number, i0: number, s: MeshBuf): void {
    buf.pos.set(s.pos.subarray(0, s.nv * 3), v0 * 3);
    buf.nrm.set(s.nrm.subarray(0, s.nv * 3), v0 * 3);
    buf.col.set(s.col.subarray(0, s.nv * 4), v0 * 4);
    buf.uv.set(s.uv.subarray(0, s.nv * 2), v0 * 2);
    buf.fx.set(s.fx.subarray(0, s.nv * 4), v0 * 4);
    const si = s.idx, di = buf.idx;
    for (let i = 0; i < s.ni; i++) di[i0 + i] = si[i]! + v0;
  }

  /** Écrit le contenu de `s` à l'emplacement de `slot` dans le morceau : en place s'il tient, en fin de tampon sinon. */
  put(ch: Chunk, slot: Slot, s: MeshBuf, slackV: number, slackI: number): void {
    const mesh = ch.mesh;
    if (!mesh || ch.level < 0) return;
    const buf = mesh.buf;
    if (slot.v0 >= 0 && s.nv <= slot.vCap && s.ni <= slot.iCap) {
      this.copyInto(buf, slot.v0, slot.i0, s);
      buf.idx.fill(0, slot.i0 + s.ni, slot.i0 + slot.iCap);
      mesh.syncRange(slot.v0, slot.v0 + s.nv, slot.i0, slot.i0 + slot.iCap);
      this.stats.rewrites++;
      return;
    }
    if (s.nv === 0) return;
    const needV = s.nv + slackV, needI = s.ni + slackI;
    if (buf.nv + needV <= buf.vCap && buf.ni + needI <= buf.iCap) {
      if (slot.v0 >= 0) {
        buf.idx.fill(0, slot.i0, slot.i0 + slot.iCap);
        mesh.syncRange(0, 0, slot.i0, slot.i0 + slot.iCap);
        ch.holes += slot.vCap;
      }
      slot.v0 = buf.nv;
      slot.vCap = needV;
      slot.i0 = buf.ni;
      slot.iCap = needI;
      this.copyInto(buf, slot.v0, slot.i0, s);
      buf.idx.fill(0, slot.i0 + s.ni, slot.i0 + needI);
      buf.nv += needV;
      buf.ni += needI;
      mesh.syncRange(slot.v0, slot.v0 + s.nv, slot.i0, slot.i0 + needI);
      this.stats.rewrites++;
      if (ch.holes > 4000 && ch.holes > buf.nv * 0.5) this.markDirty(ch);
      return;
    }
    this.markDirty(ch);
  }

  /** Efface un emplacement (triangles dégénérés) et l'abandonne. */
  erase(ch: Chunk | null, slot: Slot, keep: boolean): void {
    if (ch && ch.mesh && ch.level >= 0 && slot.v0 >= 0) {
      ch.mesh.buf.idx.fill(0, slot.i0, slot.i0 + slot.iCap);
      ch.mesh.syncRange(0, 0, slot.i0, slot.i0 + slot.iCap);
      if (!keep) ch.holes += slot.vCap;
    }
    if (!keep) {
      slot.v0 = -1;
      slot.i0 = -1;
      slot.vCap = 0;
      slot.iCap = 0;
    }
  }

  markDirty(ch: Chunk): void {
    ch.dirty = true;
    this.evalWanted = true;
  }

  /** (Ré)écrit un objet dans son morceau, en place si possible. */
  placeProp(rec: PropRec): void {
    const ch = rec.chunk;
    if (!ch || ch.level < 0 || rec.dynamic) return;
    const p = rec.prop;
    const lod = this.hidden(p.dormant) ? -1 : objectLod(ch.level, rec.info.size, p.dormant);
    const s = this.scratch;
    s.reset();
    if (lod >= 0) this.asm.prop(s, rec, lod, ch.ox, ch.oz, null);
    this.put(ch, rec, s, PROP_SLACK_V, PROP_SLACK_I);
  }

  /** (Ré)écrit une devanture dans son morceau, en place si possible. */
  placeShop(rec: ShopRec): void {
    const ch = rec.chunk;
    if (!ch || ch.level < 0) return;
    const lod = this.hidden(rec.shop.dormant) ? -1 : shopLod(ch.level, rec.shop.dormant);
    const s = this.scratch;
    s.reset();
    if (lod >= 0) this.asm.shop(s, rec, lod, ch.ox, ch.oz);
    else this.asm.releaseSign(rec);
    this.put(ch, rec, s, lod <= 1 ? SHOP_SLACK_V : PROP_SLACK_V, lod <= 1 ? SHOP_SLACK_I : PROP_SLACK_I);
  }

  /** Reconstruit entièrement un morceau au niveau de détail donné. */
  rebuild(ch: Chunk, level: number): void {
    const t0 = performance.now();
    if (!ch.mesh) {
      ch.mesh = new SlotMesh(this.materials.opaque, this.materials.depth, `decor-${ch.cx}_${ch.cz}`);
      ch.mesh.mesh.position.set(ch.ox, 0, ch.oz);
      ch.mesh.mesh.updateMatrix();
      this.root.add(ch.mesh.mesh);
    }
    const mesh = ch.mesh;
    const buf = mesh.buf;
    buf.reset();
    let minY = Infinity, maxY = -Infinity;
    const props = ch.props;
    for (let i = 0; i < props.length; i++) {
      const rec = props[i]!;
      rec.v0 = rec.i0 = -1;
      rec.vCap = rec.iCap = 0;
      const p = rec.prop;
      if (p.y < minY) minY = p.y;
      if (p.y + p.height > maxY) maxY = p.y + p.height;
      if (rec.dynamic) continue;
      const lod = this.hidden(p.dormant) ? -1 : objectLod(level, rec.info.size, p.dormant);
      if (lod < 0) continue;
      const v0 = buf.nv, i0 = buf.ni;
      this.asm.prop(buf, rec, lod, ch.ox, ch.oz, null);
      if (buf.nv === v0) continue;
      this.reserve(buf, rec, v0, i0, PROP_SLACK_V, PROP_SLACK_I);
    }
    const shops = ch.shops;
    for (let i = 0; i < shops.length; i++) {
      const rec = shops[i]!;
      rec.v0 = rec.i0 = -1;
      rec.vCap = rec.iCap = 0;
      const s = rec.shop;
      if (s.y < minY) minY = s.y;
      if (s.y + 6 > maxY) maxY = s.y + 6;
      const lod = this.hidden(s.dormant) ? -1 : shopLod(level, s.dormant);
      if (lod < 0) {
        this.asm.releaseSign(rec);
        continue;
      }
      const v0 = buf.nv, i0 = buf.ni;
      this.asm.shop(buf, rec, lod, ch.ox, ch.oz);
      if (buf.nv === v0) continue;
      this.reserve(buf, rec, v0, i0, lod <= 1 ? SHOP_SLACK_V : PROP_SLACK_V, lod <= 1 ? SHOP_SLACK_I : PROP_SLACK_I);
    }
    // marge de fin de tampon pour les objets qui arriveront
    buf.ensure(Math.max(256, buf.nv >> 2), Math.max(384, buf.ni >> 2));
    if (minY > maxY) { minY = 0; maxY = 4; }
    ch.groundY = minY;
    const half = CHUNK_SIZE / 2;
    mesh.syncAll();
    mesh.setBounds(half, (minY + maxY) / 2, half, half * 1.42 + 10 + (maxY - minY) / 2);
    mesh.mesh.castShadow = level <= this.cfg.shadowLevel;
    if (level <= 1 || ch.level <= 1) this.glassDirty = true;
    ch.level = level;
    ch.dirty = false;
    ch.holes = 0;
    this.stats.rebuilds++;
    this.stats.rebuildMs = performance.now() - t0;
  }

  private reserve(buf: MeshBuf, slot: Slot, v0: number, i0: number, slackV: number, slackI: number): void {
    buf.ensure(slackV, slackI);
    buf.idx.fill(0, buf.ni, buf.ni + slackI);
    slot.v0 = v0;
    slot.i0 = i0;
    slot.vCap = buf.nv - v0 + slackV;
    slot.iCap = buf.ni - i0 + slackI;
    buf.nv += slackV;
    buf.ni += slackI;
  }

  /** Libère la géométrie d'un morceau sorti de la distance d'affichage. */
  free(ch: Chunk): void {
    if (ch.level <= 1 && ch.level >= 0) this.glassDirty = true;
    ch.level = -1;
    ch.dirty = false;
    ch.holes = 0;
    if (ch.mesh) ch.mesh.release();
    for (const r of ch.props) { r.v0 = r.i0 = -1; r.vCap = r.iCap = 0; }
    for (const r of ch.shops) {
      r.v0 = r.i0 = -1;
      r.vCap = r.iCap = 0;
      this.asm.releaseSign(r);
    }
  }

  /** Niveau voulu de chaque morceau d'après la caméra ; file des reconstructions, les plus proches d'abord. */
  evaluate(v: ViewApi): void {
    const cx = v.camX, cy = v.camY, cz = v.camZ;
    const todo = this.todo;
    todo.length = 0;
    const list = this.list;
    let built = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const ch = list[i]!;
      if (ch.props.length === 0 && ch.shops.length === 0) {
        // morceau vidé (tuile déchargée) : on le supprime
        if (ch.mesh) ch.mesh.dispose();
        this.chunks.delete(ch.key);
        list[i] = list[list.length - 1]!;
        list.pop();
        continue;
      }
      const dH = chunkDistance(cx, cz, ch.cx, ch.cz);
      const dy = Math.max(0, Math.abs(cy - ch.groundY) - 4);
      ch.dist = Math.sqrt(dH * dH + dy * dy);
      ch.want = chunkLevel(dH, ch.dist, this.cfg, ch.level, v.drawDistance);
      if (ch.want < 0) {
        if (ch.level >= 0) this.free(ch);
        continue;
      }
      built++;
      if (ch.want !== ch.level || ch.dirty) todo.push(ch);
    }
    todo.sort(byDistance);
    this.stats.builtChunks = built;
    this.stats.chunks = list.length;
  }

  /** Supprime tous les morceaux (changement de session). */
  clear(): void {
    for (const ch of this.list) if (ch.mesh) ch.mesh.dispose();
    this.chunks.clear();
    this.list.length = 0;
    this.todo.length = 0;
    this.evalWanted = true;
  }
}

function byDistance(a: Chunk, b: Chunk): number {
  // la file est dépilée par la fin : le plus proche en dernier
  return b.dist - a.dist;
}
