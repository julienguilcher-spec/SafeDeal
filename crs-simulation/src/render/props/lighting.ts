/* =====================================================================================
 * RENDU DU DÉCOR — lumières : halos et taches au sol des objets et des devantures (coût fixe), et
 * attribution de quelques VRAIES lumières aux candélabres et aux feux les plus proches de la caméra
 * quand le rendu de base fournit le service 'render.lights'.
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import type { LightLike, LightsLike } from './api';
import { FX_FIRE } from './geo';
import { HaloBatch } from './halos';
import { stateCode } from './mapping';
import type { LodConfig } from './mapping';
import type { PropUniforms } from './material';
import { matIdentity, matNew, matRotY, matTranslate } from './meshbuf';
import type { ModelLibrary } from './models';
import { V_BURNING } from './models';
import { LAMPE } from './palette';
import type { PropRec, ShopRec } from './records';
import { shopGlows } from './shopfront';
import type { ShopGlow } from './shopfront';

/** Gains accordés à l'exposition du jeu : halo (cœur brillant) et tache au sol (lueur discrète). */
const HALO_GAIN = 2.6;
const POOL_GAIN = 0.34;
/** Intensité d'une vraie lumière de candélabre (cd), portée (m) — ordres de grandeur du rendu de base. */
const LAMP_RANGE = 26;
const LAMP_REACH = 46;
const FIRE_REACH = 70;

interface FireSpot { x: number; y: number; z: number; cd: number; range: number }

export class LightRig {
  readonly halos: HaloBatch;
  private readonly lamps: PropRec[] = [];
  private readonly fires = new Map<number, FireSpot>();
  private readonly lampLights: LightLike[] = [];
  private readonly fireLights: LightLike[] = [];
  private readonly m = matNew();
  private readonly glows: ShopGlow[] = [];
  private readonly bestLamp: (PropRec | null)[] = [];
  private readonly bestFire: (FireSpot | null)[] = [];
  private readonly bestD: number[] = [];
  /** Vraies lumières actuellement allumées. */
  lit = 0;

  constructor(
    private readonly ctx: GameContext, uniforms: PropUniforms, private cfg: LodConfig,
    private lights: LightsLike | undefined,
  ) {
    this.halos = new HaloBatch(uniforms);
  }

  setConfig(cfg: LodConfig): void {
    this.cfg = cfg;
  }

  private ground(x: number, z: number, fallback: number): number {
    const h = this.ctx.world.heightAt(x, z);
    return Number.isFinite(h) ? h : fallback;
  }

  private pool(x: number, z: number, fallbackY: number, radius: number, color: number, intensity: number, gate: number, phase: number): number {
    const d = radius * 0.6;
    const y = this.ground(x, z, fallbackY);
    const sx = (this.ground(x + d, z, y) - this.ground(x - d, z, y)) / (2 * d);
    const sz = (this.ground(x, z + d, y) - this.ground(x, z - d, y)) / (2 * d);
    return this.halos.add(x, y, z, radius, color, intensity * POOL_GAIN, gate, phase, true, sx, sz);
  }

  /** Rend les halos d'une fiche et la retire des listes de lumières. */
  free(rec: PropRec | ShopRec): void {
    const hs = rec.halos;
    for (let i = 0; i < hs.length; i++) this.halos.remove(hs[i]!);
    hs.length = 0;
    this.fires.delete(rec.id);
    const pr = rec as PropRec;
    if (pr.lampIndex !== undefined && pr.lampIndex >= 0) {
      const last = this.lamps.pop()!;
      if (last !== pr) {
        this.lamps[pr.lampIndex] = last;
        last.lampIndex = pr.lampIndex;
      }
      pr.lampIndex = -1;
      pr.lamp = null;
    }
  }

  /** (Re)crée les lumières d'un objet d'après son modèle et son état. `hidden` : objet non dessiné. */
  prop(rec: PropRec, lib: ModelLibrary, hidden: boolean): void {
    this.free(rec);
    if (hidden) return;
    const p = rec.prop;
    const variant = stateCode(p.state);
    const phase = rec.phase / 255;
    const low = this.cfg.d0 === 0;
    if (variant === V_BURNING) {
      const n = rec.barricade ? Math.max(1, Math.round(p.halfX / 1.2)) : 1;
      const c = Math.cos(p.heading), s = Math.sin(p.heading);
      const size = Math.min(3, Math.max(0.9, 0.7 + Math.max(p.halfX, p.halfZ) * (rec.barricade ? 0.25 : 0.9) + p.height * 0.3));
      for (let k = 0; k < n; k++) {
        const lx = n === 1 ? 0 : -p.halfX + ((k + 0.5) * 2 * p.halfX) / n;
        const x = p.x + lx * c, z = p.z - lx * s;
        const ph = (phase + k * 0.37) % 1;
        rec.halos.push(this.halos.add(x, p.y + Math.min(1.5, 0.4 + p.height * 0.6), z, size, 0xff7a1a, 0.9 * HALO_GAIN * 0.5, FX_FIRE, ph, false));
        if (!low || k === 0) rec.halos.push(this.pool(x, z, p.y, size * 2.4 + 1.6, 0xff6a12, 1.5, FX_FIRE, ph));
      }
      this.fires.set(rec.id, { x: p.x, y: p.y + 1, z: p.z, cd: rec.barricade ? 150 : 40 + 30 * size, range: rec.barricade ? 28 : 16 });
    }
    if (rec.barricade) return;
    const tpl = lib.get(rec.kind, 1, variant, rec.skin, rec.panes);
    if (tpl.halos.length === 0) return;
    const m = matIdentity(this.m);
    matTranslate(m, p.x, p.y, p.z);
    matRotY(m, p.heading);
    for (let i = 0; i < tpl.halos.length; i++) {
      const h = tpl.halos[i]!;
      if (low && h.intensity < 0.4) continue;
      const x = m[0]! * h.x + m[2]! * h.z + m[3]!, y = p.y + h.y, z = m[8]! * h.x + m[10]! * h.z + m[11]!;
      rec.halos.push(this.halos.add(x, y, z, h.size, h.color, h.intensity * HALO_GAIN, h.gate, phase, false));
      if (h.pool > 0 && !(low && h.pool < 6)) rec.halos.push(this.pool(x, z, p.y, h.pool, h.color, h.intensity, h.gate, phase));
      if (h.light > 0 && rec.lampIndex < 0) {
        rec.lamp = { x, y, z, cd: h.light };
        rec.lampIndex = this.lamps.length;
        this.lamps.push(rec);
      }
    }
  }

  /** (Re)crée les lumières d'une devanture d'après son état. */
  shop(rec: ShopRec, hidden: boolean): void {
    this.free(rec);
    if (hidden) return;
    const s = rec.shop;
    const glows = this.glows;
    shopGlows(glows, s.width, rec.style, rec.state);
    if (glows.length === 0) return;
    const c = Math.cos(s.heading), sn = Math.sin(s.heading);
    const phase = (rec.seed % 255) / 255;
    for (let i = 0; i < glows.length; i++) {
      const g = glows[i]!;
      const x = s.x + g.x * c + g.z * sn, z = s.z - g.x * sn + g.z * c;
      if (g.ground) rec.halos.push(this.pool(x, z, s.y, g.radius, g.color, g.intensity / POOL_GAIN, g.gate, phase));
      else rec.halos.push(this.halos.add(x, s.y + g.y, z, g.radius, g.color, g.intensity, g.gate, phase, false));
      if (g.gate === FX_FIRE && !g.ground) this.fires.set(rec.id, { x, y: s.y + 1.6, z, cd: 150, range: 28 });
    }
  }

  private light(pool: LightLike[], i: number, color: number, flicker: number): LightLike | null {
    let l = pool[i];
    if (!l && this.lights) {
      l = this.lights.point({ color, intensity: 0, range: LAMP_RANGE, enabled: false, flicker, priority: flicker > 0 ? 0.5 : 0 });
      pool[i] = l;
    }
    return l ?? null;
  }

  /** Donne les vraies lumières aux candélabres allumés et aux feux les plus proches de la caméra. */
  update(camX: number, camY: number, camZ: number, lampsOn: number): void {
    this.lit = 0;
    if (!this.lights) return;
    const nl = this.cfg.lamps, nf = this.cfg.fires;
    const bl = this.bestLamp, bd = this.bestD;
    // candélabres : sélection des nl plus proches par insertion
    for (let i = 0; i < nl; i++) { bl[i] = null; bd[i] = LAMP_REACH * LAMP_REACH; }
    if (lampsOn > 0.05) {
      const lamps = this.lamps;
      for (let k = 0; k < lamps.length; k++) {
        const s = lamps[k]!.lamp!;
        const dx = s.x - camX, dz = s.z - camZ, dy = s.y - camY;
        const d = dx * dx + dz * dz + dy * dy * 0.25;
        if (d >= bd[nl - 1]!) continue;
        let j = nl - 1;
        while (j > 0 && bd[j - 1]! > d) { bd[j] = bd[j - 1]!; bl[j] = bl[j - 1]!; j--; }
        bd[j] = d;
        bl[j] = lamps[k]!;
      }
    }
    for (let i = 0; i < nl; i++) {
      const l = this.light(this.lampLights, i, LAMPE, 0);
      if (!l) break;
      const r = bl[i];
      if (r && r.lamp) {
        l.x = r.lamp.x; l.y = r.lamp.y - 0.3; l.z = r.lamp.z;
        l.intensity = r.lamp.cd * lampsOn;
        l.range = LAMP_RANGE;
        l.enabled = true;
        this.lit++;
      } else {
        l.enabled = false;
      }
    }
    // feux
    const bf = this.bestFire;
    for (let i = 0; i < nf; i++) { bf[i] = null; bd[i] = FIRE_REACH * FIRE_REACH; }
    if (this.fires.size > 0) {
      for (const f of this.fires.values()) {
        const dx = f.x - camX, dz = f.z - camZ;
        const d = dx * dx + dz * dz;
        if (d >= bd[nf - 1]!) continue;
        let j = nf - 1;
        while (j > 0 && bd[j - 1]! > d) { bd[j] = bd[j - 1]!; bf[j] = bf[j - 1]!; j--; }
        bd[j] = d;
        bf[j] = f;
      }
    }
    for (let i = 0; i < nf; i++) {
      const l = this.light(this.fireLights, i, 0xff7a2a, 0.6);
      if (!l) break;
      const f = bf[i];
      if (f) {
        l.x = f.x; l.y = f.y; l.z = f.z;
        l.intensity = f.cd;
        l.range = f.range;
        l.enabled = true;
        this.lit++;
      } else {
        l.enabled = false;
      }
    }
  }

  /** Oublie toutes les lumières (changement de session) ; les vraies lumières sont éteintes, pas rendues. */
  clear(): void {
    this.halos.clear();
    this.lamps.length = 0;
    this.fires.clear();
    for (const l of this.lampLights) l.enabled = false;
    for (const l of this.fireLights) l.enabled = false;
    this.lit = 0;
  }

  dispose(): void {
    for (const l of this.lampLights) l.release();
    for (const l of this.fireLights) l.release();
    this.lampLights.length = 0;
    this.fireLights.length = 0;
    this.halos.dispose();
  }
}
