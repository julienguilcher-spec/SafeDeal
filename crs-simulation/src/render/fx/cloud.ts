/* =====================================================================================
 * Effets visuels — nuages de gaz lacrymogène et de fumée, dessinés à partir du champ des
 * dangers (service 'hazards.field').
 *
 * Dix fois par seconde au plus, les cellules actives autour de la caméra sont lues (sans
 * allocation) et regroupées en « bouffées » : une par cellule de près, une par pâté de 4, 16
 * ou 64 cellules au loin ou quand le nuage dépasse le budget. À chaque image, chaque bouffée
 * devient un ou deux quads éclairés dont l'opacité suit la concentration (loi de Beer-Lambert,
 * voir density.ts), qui s'écoulent et s'étirent dans le sens du vent.
 * Vue de dessus (carte tactique, drone), les bouffées se couchent en nappes horizontales.
 * ===================================================================================== */

import { TILE_MIST, TILE_PUFF } from './atlas';
import type { FxHazardField } from './api';
import { cellLodFor, nextLodBias } from './budget';
import type { FxCore } from './core';
import {
  GAS_SIGMA, GAS_VISIBLE_MIN, SMOKE_SIGMA, SMOKE_VISIBLE_MIN, cloudHeight, gasAlbedo, puffAlpha, smokeShare,
} from './density';
import { TAU, hash3i, linB, linG, linR } from './mathx';
import { KIND_LIT, MODE_FLAT, MODE_STRETCH, NO_FLOOR } from './pool';
import { SPRITE_STRIDE } from './spriteLayer';

const CELL_RECORD = 5;
/** Cellules lues au plus par reconstruction. */
const CELL_CAP = 16384;
/** Période minimale de reconstruction (s) : le champ avance à 10 Hz. */
const REBUILD_PERIOD = 0.1;
/** Part de la couche de particules que les nuages peuvent occuper. */
const SPRITE_SHARE = 0.72;

export class CloudRenderer {
  /** Bouffées issues de la dernière reconstruction. */
  count = 0;
  /** Cellules lues à la dernière reconstruction. */
  cells = 0;
  /** Surcharge courante (0 = niveaux de détail normaux). */
  bias = 0;
  /** Quads émis à la dernière image. */
  emitted = 0;

  private readonly buf = new Float32Array(CELL_CAP * CELL_RECORD);
  private bufCount = 0;

  // table de regroupement (adressage ouvert, vidée par numéro de génération)
  private readonly tableSize: number;
  private readonly mask: number;
  private readonly stamp: Uint32Array;
  private readonly keyL: Int8Array;
  private readonly keyX: Int32Array;
  private readonly keyZ: Int32Array;
  private readonly sumG: Float32Array;
  private readonly sumS: Float32Array;
  private readonly sumW: Float32Array;
  private readonly sumX: Float32Array;
  private readonly sumZ: Float32Array;
  private readonly sumR: Float32Array;
  private readonly sumGc: Float32Array;
  private readonly sumB: Float32Array;
  private readonly slots: Int32Array;
  private gen = 0;

  // bouffées
  private readonly max: number;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly pGas: Float32Array;
  private readonly pSmoke: Float32Array;
  private readonly pR: Float32Array;
  private readonly pG: Float32Array;
  private readonly pB: Float32Array;
  private readonly pCell: Float32Array;
  private readonly pSeed: Float32Array;
  private readonly pAlpha: Float32Array;
  private readonly albedo = new Float32Array(3);

  private lastRebuild = -1e9;
  private lastRevision = -1;
  private lastCamX = 1e9;
  private lastCamZ = 1e9;
  private readonly collect: (x: number, z: number, gas: number, smoke: number, color: number) => void;

  constructor(private readonly core: FxCore) {
    this.max = core.budget.maxPuffs;
    let t = 1024;
    while (t < this.max * 4) t <<= 1;
    this.tableSize = t;
    this.mask = t - 1;
    this.stamp = new Uint32Array(t);
    this.keyL = new Int8Array(t);
    this.keyX = new Int32Array(t);
    this.keyZ = new Int32Array(t);
    this.sumG = new Float32Array(t);
    this.sumS = new Float32Array(t);
    this.sumW = new Float32Array(t);
    this.sumX = new Float32Array(t);
    this.sumZ = new Float32Array(t);
    this.sumR = new Float32Array(t);
    this.sumGc = new Float32Array(t);
    this.sumB = new Float32Array(t);
    this.slots = new Int32Array(t);
    const n = this.max;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.pGas = new Float32Array(n);
    this.pSmoke = new Float32Array(n);
    this.pR = new Float32Array(n);
    this.pG = new Float32Array(n);
    this.pB = new Float32Array(n);
    this.pCell = new Float32Array(n);
    this.pSeed = new Float32Array(n);
    this.pAlpha = new Float32Array(n);
    // rappel conservé d'une image à l'autre (repli quand collectActiveCells n'existe pas)
    this.collect = (x, z, gas, smoke, color) => {
      const k = this.bufCount;
      if (k >= CELL_CAP) return;
      const o = k * CELL_RECORD;
      const b = this.buf;
      b[o] = x; b[o + 1] = z; b[o + 2] = gas; b[o + 3] = smoke; b[o + 4] = color;
      this.bufCount = k + 1;
    };
  }

  clear(): void {
    this.count = 0;
    this.cells = 0;
    this.bias = 0;
    this.lastRebuild = -1e9;
    this.lastRevision = -1;
  }

  /** Relit le champ si nécessaire (au plus dix fois par seconde) puis émet les quads de l'image. */
  update(field: FxHazardField | undefined): void {
    const core = this.core;
    if (!field) {
      this.count = 0;
      this.cells = 0;
      this.emitted = 0;
      return;
    }
    const since = core.time - this.lastRebuild;
    const moved = Math.abs(core.camX - this.lastCamX) + Math.abs(core.camZ - this.lastCamZ) > 6;
    if (since >= REBUILD_PERIOD && (field.revision !== this.lastRevision || moved || since > 0.5)) this.rebuild(field);
    this.emit(field);
  }

  private rebuild(field: FxHazardField): void {
    const core = this.core;
    const budget = core.budget;
    this.lastRebuild = core.time;
    this.lastRevision = field.revision;
    this.lastCamX = core.camX;
    this.lastCamZ = core.camZ;
    const radius = Math.min(budget.cloudRadius, Math.max(60, core.view.drawDistance));
    const minD = Math.min(GAS_VISIBLE_MIN, SMOKE_VISIBLE_MIN);
    let n: number;
    if (typeof field.collectActiveCells === 'function') {
      n = field.collectActiveCells(this.buf, minD, core.camX, core.camZ, radius);
      if (n > CELL_CAP) n = CELL_CAP;
    } else {
      this.bufCount = 0;
      field.forEachActiveCell(this.collect, minD, core.camX, core.camZ, radius);
      n = this.bufCount;
    }
    this.cells = n;
    const cs = field.cellSize > 0 ? field.cellSize : 2;
    // la caméra est arrondie à 16 m pour les choix de niveau : pas de bascule à chaque pas du joueur
    const qx = Math.round(core.camX / 16) * 16;
    const qz = Math.round(core.camZ / 16) * 16;
    const buf = this.buf;
    const mask = this.mask;
    const stamp = this.stamp;
    const gen = ++this.gen;
    let used = 0;
    const limit = this.tableSize >> 1;
    for (let i = 0; i < n; i++) {
      const o = i * CELL_RECORD;
      const x = buf[o]!;
      const z = buf[o + 1]!;
      const gas = buf[o + 2]!;
      const smoke = buf[o + 3]!;
      const dx = x - qx;
      const dz = z - qz;
      const L = cellLodFor(Math.sqrt(dx * dx + dz * dz), budget, this.bias);
      const S = cs * (1 << L);
      const ix = Math.floor(x / S);
      const iz = Math.floor(z / S);
      let h = hash3i(ix, iz, L) & mask;
      for (;;) {
        if (stamp[h] !== gen) {
          if (used >= limit) { h = -1; break; }
          stamp[h] = gen;
          this.keyL[h] = L; this.keyX[h] = ix; this.keyZ[h] = iz;
          this.sumG[h] = 0; this.sumS[h] = 0; this.sumW[h] = 0; this.sumX[h] = 0; this.sumZ[h] = 0;
          this.sumR[h] = 0; this.sumGc[h] = 0; this.sumB[h] = 0;
          this.slots[used++] = h;
          break;
        }
        if (this.keyL[h] === L && this.keyX[h] === ix && this.keyZ[h] === iz) break;
        h = (h + 1) & mask;
      }
      if (h < 0) continue;
      const w = gas * GAS_SIGMA + smoke * SMOKE_SIGMA + 1e-5;
      this.sumG[h] = this.sumG[h]! + gas;
      this.sumS[h] = this.sumS[h]! + smoke;
      this.sumW[h] = this.sumW[h]! + w;
      this.sumX[h] = this.sumX[h]! + x * w;
      this.sumZ[h] = this.sumZ[h]! + z * w;
      if (smoke > 0) {
        const c = buf[o + 4]!;
        this.sumR[h] = this.sumR[h]! + linR(c) * smoke;
        this.sumGc[h] = this.sumGc[h]! + linG(c) * smoke;
        this.sumB[h] = this.sumB[h]! + linB(c) * smoke;
      }
    }
    // bouffées
    let m = 0;
    const max = this.max;
    for (let k = 0; k < used && m < max; k++) {
      const h = this.slots[k]!;
      const L = this.keyL[h]!;
      const per = (1 << L) * (1 << L);
      const gas = this.sumG[h]! / per;
      const smoke = this.sumS[h]! / per;
      if (gas < GAS_VISIBLE_MIN && smoke < SMOKE_VISIBLE_MIN) continue;
      const w = this.sumW[h]!;
      const x = this.sumX[h]! / w;
      const z = this.sumZ[h]! / w;
      const S = cs * (1 << L);
      const alpha = puffAlpha(gas, smoke, S);
      if (alpha < 0.012) continue;
      this.px[m] = x;
      this.pz[m] = z;
      this.py[m] = core.ground(x, z);
      this.pGas[m] = gas;
      this.pSmoke[m] = smoke;
      this.pCell[m] = S;
      this.pAlpha[m] = alpha;
      this.pSeed[m] = (hash3i(this.keyX[h]!, this.keyZ[h]!, L + 7) & 0xffff) / 65536;
      // couleur : gaz blanc cassé, fumée de la couleur transportée par le champ (suie jamais tout à fait noire)
      gasAlbedo(gas, this.albedo);
      const share = smokeShare(gas, smoke);
      const ss = this.sumS[h]!;
      let sr = 0.03, sg = 0.03, sb = 0.03;
      if (ss > 1e-6) {
        sr = Math.max(0.022, this.sumR[h]! / ss);
        sg = Math.max(0.022, this.sumGc[h]! / ss);
        sb = Math.max(0.022, this.sumB[h]! / ss);
      }
      this.pR[m] = this.albedo[0]! + (sr - this.albedo[0]!) * share;
      this.pG[m] = this.albedo[1]! + (sg - this.albedo[1]!) * share;
      this.pB[m] = this.albedo[2]! + (sb - this.albedo[2]!) * share;
      m++;
    }
    this.count = m;
    this.bias = nextLodBias(this.bias, used, budget);
  }

  /** Écrit les quads des bouffées dans la couche de particules (boucle chaude : écriture directe). */
  private emit(field: FxHazardField): void {
    const core = this.core;
    const sp = core.sprites;
    const n = this.count;
    if (n === 0) {
      this.emitted = 0;
      return;
    }
    const stage = sp.stage;
    const depth = sp.depth;
    const cap = Math.min(sp.capacity, sp.count + Math.floor(sp.capacity * SPRITE_SHARE));
    let cnt = sp.count;
    const start = cnt;
    const time = core.time;
    const camX = sp.camX, camY = sp.camY, camZ = sp.camZ;
    const fx = sp.fwdX, fy = sp.fwdY, fz = sp.fwdZ;
    const rx = sp.rightX, ry = sp.rightY, rz = sp.rightZ;
    const driftX = field.driftX !== undefined ? field.driftX : core.windX;
    const driftZ = field.driftZ !== undefined ? field.driftZ : core.windZ;
    const speed = Math.sqrt(driftX * driftX + driftZ * driftZ);
    const dirX = speed > 1e-3 ? driftX / speed : 1;
    const dirZ = speed > 1e-3 ? driftZ / speed : 0;
    const layers = core.budget.puffLayers;
    const flat = core.topDown;
    const kindMode = KIND_LIT + 4 * (flat ? MODE_FLAT : MODE_STRETCH);
    // étirement dans le vent : jusqu'à 2,4 m par vent soutenu
    const stretch = Math.min(2.4, speed * 0.45);
    for (let i = 0; i < n; i++) {
      const S = this.pCell[i]!;
      const seed = this.pSeed[i]!;
      const dens = this.pGas[i]! + this.pSmoke[i]!;
      const D = S * 1.9 + 1.1;
      const hMax = cloudHeight(dens) * 1.45 + 1.4;
      // tailles et hauteurs inégales d'une bouffée à l'autre : le dessus du nuage moutonne
      const vary = 0.86 + 0.3 * ((seed * 13) % 1);
      const size = (flat ? D : D < hMax ? D : hMax) * vary;
      const gy = this.py[i]!;
      const baseA = this.pAlpha[i]!;
      const r = this.pR[i]!;
      const g = this.pG[i]!;
      const b = this.pB[i]!;
      // période d'écoulement : le temps de parcourir un peu plus d'une cellule
      const sp2 = speed > 0.3 ? speed : 0.3;
      let T = (S * 1.2) / sp2;
      if (T < 2) T = 2; else if (T > 8) T = 8;
      const flow = speed * T < S * 1.2 ? speed * T : S * 1.2;
      const wide = flat || D <= size ? 0 : D - size;
      for (let k = 0; k < layers; k++) {
        if (cnt >= cap) break;
        let w = 1;
        let off = 0;
        if (layers > 1) {
          let ph = time / T + seed + k * 0.5;
          ph -= Math.floor(ph);
          w = 1 - Math.abs(2 * ph - 1);
          off = (ph - 0.5) * flow;
          if (w < 0.03) continue;
        }
        // léger décalage propre à chaque bouffée, en travers du vent : pas de quadrillage visible vu de dessus
        const jit = (((seed * 53 + k * 0.37) % 1) - 0.5) * S * 0.7;
        const x = this.px[i]! + dirX * off - dirZ * jit;
        const z = this.pz[i]! + dirZ * off + dirX * jit;
        const y = flat ? gy + 1.5 + seed * 0.6 : gy + size * (0.3 + 0.08 * k) + ((seed * 29) % 1) * 0.9 * (dens < 0.5 ? dens * 2 : 1);
        const d = (x - camX) * fx + (y - camY) * fy + (z - camZ) * fz;
        if (d < -D) continue;
        const o = cnt * SPRITE_STRIDE;
        stage[o] = x; stage[o + 1] = y; stage[o + 2] = z; stage[o + 3] = size;
        stage[o + 4] = dirX * stretch + rx * wide;
        stage[o + 5] = ry * wide;
        stage[o + 6] = dirZ * stretch + rz * wide;
        stage[o + 7] = seed * TAU + k * 2.1 + time * (seed > 0.5 ? 0.06 : -0.06);
        stage[o + 8] = r; stage[o + 9] = g; stage[o + 10] = b;
        stage[o + 11] = baseA * w;
        stage[o + 12] = TILE_PUFF + (((seed * 8) | 0) + k) % 4;
        stage[o + 13] = kindMode;
        stage[o + 14] = flat ? NO_FLOOR : gy - 0.05;
        stage[o + 15] = seed;
        depth[cnt] = d;
        cnt++;
      }
      // nuage dense : des volutes plus hautes, inégales et plus légères, donnent l'épaisseur (3 à 5 m)
      if (!flat && layers > 1 && dens > 0.22 && cnt < cap) {
        const top = cloudHeight(dens);
        const rise = (seed * 37) % 1;
        const y = gy + top * (0.55 + 0.6 * rise);
        const x = this.px[i]! + dirX * stretch * 0.4;
        const z = this.pz[i]! + dirZ * stretch * 0.4;
        const d = (x - camX) * fx + (y - camY) * fy + (z - camZ) * fz;
        if (d > -D) {
          const o = cnt * SPRITE_STRIDE;
          const s2 = size * (0.7 + 0.5 * rise);
          stage[o] = x; stage[o + 1] = y; stage[o + 2] = z; stage[o + 3] = s2;
          stage[o + 4] = dirX * stretch * 1.3 + rx * wide; stage[o + 5] = ry * wide; stage[o + 6] = dirZ * stretch * 1.3 + rz * wide;
          stage[o + 7] = seed * 9.7 - time * 0.05;
          stage[o + 8] = r; stage[o + 9] = g; stage[o + 10] = b;
          stage[o + 11] = baseA * (0.55 - 0.3 * rise);
          stage[o + 12] = rise > 0.55 ? TILE_MIST : TILE_PUFF + ((seed * 16) | 0) % 4;
          stage[o + 13] = kindMode;
          stage[o + 14] = gy - 0.05;
          stage[o + 15] = seed;
          depth[cnt] = d;
          cnt++;
        }
      }
    }
    sp.count = cnt;
    this.emitted = cnt - start;
  }
}
