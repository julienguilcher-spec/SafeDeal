/* =====================================================================================
 * Effets visuels — lumières des effets.
 *
 * À chaque image, les émetteurs (foyers, engins en vol, éclairs, gyrophares) déposent des
 * lumières « candidates ». Deux usages :
 *   1. le shader des fumées reçoit les N plus importantes pour la caméra : la fumée noire d'un
 *      incendie rougeoie par en dessous, le gaz bleuit au rythme des gyrophares ;
 *   2. si le service 'render.lights' existe, quelques lumières persistantes de sa réserve
 *      suivent les foyers les plus importants (lueur vacillante sur le sol et les façades), et
 *      les éclairs (explosion, bouquet d'artifice) y sont envoyés comme éclats brefs.
 * Aucune allocation par image.
 * ===================================================================================== */

import type { FxDynamicLight, FxLightsApi } from './api';
import { linB, linG, linR, noise1 } from './mathx';

const MAX_CANDIDATES = 96;
const MAX_TRANSIENTS = 24;

export class LightRig {
  // candidates de l'image
  private readonly cx = new Float32Array(MAX_CANDIDATES);
  private readonly cy = new Float32Array(MAX_CANDIDATES);
  private readonly cz = new Float32Array(MAX_CANDIDATES);
  private readonly cr = new Float32Array(MAX_CANDIDATES);
  private readonly cg = new Float32Array(MAX_CANDIDATES);
  private readonly cb = new Float32Array(MAX_CANDIDATES);
  /** Intensité (candelas) et portée (m). */
  private readonly ci = new Float32Array(MAX_CANDIDATES);
  private readonly crange = new Float32Array(MAX_CANDIDATES);
  private readonly cscore = new Float32Array(MAX_CANDIDATES);
  /** Clé stable du foyer (0 = lumière sans identité) et couleur 0xRRGGBB pour la réserve. */
  private readonly ckey = new Int32Array(MAX_CANDIDATES);
  private readonly chex = new Int32Array(MAX_CANDIDATES);
  /** 1 = à proposer aussi à la réserve du rendu de base. */
  private readonly cscene = new Uint8Array(MAX_CANDIDATES);
  private readonly ctaken = new Uint8Array(MAX_CANDIDATES);
  count = 0;

  // éclairs en cours (décroissance quadratique)
  private readonly tx = new Float32Array(MAX_TRANSIENTS);
  private readonly ty = new Float32Array(MAX_TRANSIENTS);
  private readonly tz = new Float32Array(MAX_TRANSIENTS);
  private readonly thex = new Int32Array(MAX_TRANSIENTS);
  private readonly ti = new Float32Array(MAX_TRANSIENTS);
  private readonly trange = new Float32Array(MAX_TRANSIENTS);
  private readonly tlife = new Float32Array(MAX_TRANSIENTS);
  private readonly ttotal = new Float32Array(MAX_TRANSIENTS);
  private tcount = 0;

  // sortie pour le shader
  readonly shaderPos: Float32Array;
  readonly shaderCol: Float32Array;
  shaderCount = 0;

  // lumières persistantes prises dans la réserve du rendu de base
  private api: FxLightsApi | null = null;
  private readonly handles: FxDynamicLight[] = [];
  private readonly handleKey: number[] = [];
  private readonly handleRamp: number[] = [];
  private sceneBudget = 0;
  private time = 0;

  constructor(private readonly shaderBudget: number) {
    this.shaderPos = new Float32Array(shaderBudget * 4);
    this.shaderCol = new Float32Array(shaderBudget * 3);
  }

  /** Branche (ou débranche) la réserve du rendu de base. */
  setSceneApi(api: FxLightsApi | null, budget: number): void {
    if (api === this.api && budget === this.sceneBudget) return;
    this.releaseHandles();
    this.api = api;
    this.sceneBudget = api ? budget : 0;
  }

  begin(dt: number): void {
    this.count = 0;
    this.time += dt;
    // éclairs : vieillissement
    let i = 0;
    while (i < this.tcount) {
      const life = this.tlife[i]! - dt;
      if (life <= 0) {
        const last = --this.tcount;
        this.tx[i] = this.tx[last]!; this.ty[i] = this.ty[last]!; this.tz[i] = this.tz[last]!;
        this.thex[i] = this.thex[last]!; this.ti[i] = this.ti[last]!; this.trange[i] = this.trange[last]!;
        this.tlife[i] = this.tlife[last]!; this.ttotal[i] = this.ttotal[last]!;
        continue;
      }
      this.tlife[i] = life;
      const k = life / this.ttotal[i]!;
      this.add(this.tx[i]!, this.ty[i]!, this.tz[i]!, this.thex[i]!, this.ti[i]! * k * k, this.trange[i]!, 0, 0, false);
      i++;
    }
  }

  /**
   * Dépose une lumière candidate pour cette image. `key` : identité stable du foyer (≠ 0) pour que
   * la lumière de scène qui le suit ne saute pas d'un foyer à l'autre ; `flicker` 0..1 ; `scene` :
   * la proposer à la réserve du rendu de base.
   */
  add(x: number, y: number, z: number, hex: number, candela: number, range: number, key: number, flicker: number, scene: boolean): void {
    const n = this.count;
    if (n >= MAX_CANDIDATES || !(candela > 0.01) || !(range > 0)) return;
    let k = 1;
    if (flicker > 0) {
      const t = this.time;
      k = 1 - flicker * (0.3 + 0.4 * (0.6 * noise1(t * 9, key & 1023) + 0.4 * noise1(t * 23, (key & 1023) + 5)));
    }
    this.cx[n] = x; this.cy[n] = y; this.cz[n] = z;
    this.cr[n] = linR(hex); this.cg[n] = linG(hex); this.cb[n] = linB(hex);
    this.ci[n] = candela * k;
    this.crange[n] = range;
    this.ckey[n] = key;
    this.chex[n] = hex;
    this.cscene[n] = scene ? 1 : 0;
    this.count = n + 1;
  }

  /** Éclair bref (explosion, grenade, bouquet) : visible dans les fumées et envoyé à la réserve du rendu de base. */
  flash(x: number, y: number, z: number, hex: number, candela: number, range: number, seconds: number): void {
    if (!(seconds > 0) || !(candela > 0)) return;
    if (this.api) {
      try {
        this.api.flash(x, y, z, hex, candela, range, seconds);
      } catch { /* la réserve ne doit jamais faire échouer un effet */ }
    }
    let i = this.tcount;
    if (i >= MAX_TRANSIENTS) {
      // remplace le plus proche de sa fin
      let best = 0;
      for (let j = 1; j < MAX_TRANSIENTS; j++) if (this.tlife[j]! < this.tlife[best]!) best = j;
      i = best;
    } else {
      this.tcount++;
    }
    this.tx[i] = x; this.ty[i] = y; this.tz[i] = z;
    this.thex[i] = hex;
    this.ti[i] = candela;
    this.trange[i] = range;
    this.tlife[i] = seconds;
    this.ttotal[i] = seconds;
  }

  /** Fin d'image : classe les candidates pour la caméra, remplit les tableaux du shader, pilote la réserve. */
  finish(camX: number, camY: number, camZ: number, dt: number): void {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const dx = this.cx[i]! - camX;
      const dy = this.cy[i]! - camY;
      const dz = this.cz[i]! - camZ;
      const d2 = dx * dx + dy * dy + dz * dz;
      const reach = this.crange[i]! * 3;
      this.cscore[i] = (this.ci[i]! * this.crange[i]!) / (d2 + reach * reach * 0.06 + 4);
      this.ctaken[i] = 0;
    }
    // shader : sélection directe des meilleures (peu d'éléments)
    const budget = this.shaderBudget;
    let m = 0;
    for (let k = 0; k < budget; k++) {
      let best = -1;
      let bestScore = 0;
      for (let i = 0; i < n; i++) {
        if (this.ctaken[i] === 1) continue;
        const s = this.cscore[i]!;
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      }
      if (best < 0) break;
      this.ctaken[best] = 1;
      const I = this.ci[best]!;
      this.shaderPos[m * 4] = this.cx[best]!;
      this.shaderPos[m * 4 + 1] = this.cy[best]!;
      this.shaderPos[m * 4 + 2] = this.cz[best]!;
      this.shaderPos[m * 4 + 3] = this.crange[best]!;
      this.shaderCol[m * 3] = this.cr[best]! * I;
      this.shaderCol[m * 3 + 1] = this.cg[best]! * I;
      this.shaderCol[m * 3 + 2] = this.cb[best]! * I;
      m++;
    }
    this.shaderCount = m;
    if (this.api && this.sceneBudget > 0) this.driveScene(dt);
  }

  /** Les lumières persistantes suivent les foyers les mieux classés, sans sauter de l'un à l'autre. */
  private driveScene(dt: number): void {
    const api = this.api!;
    const n = this.count;
    const budget = this.sceneBudget;
    for (let i = 0; i < n; i++) this.ctaken[i] = this.cscene[i] === 1 && this.ckey[i] !== 0 ? 0 : 1;
    // 1. chaque lumière déjà attribuée retrouve son foyer s'il existe encore
    for (let h = 0; h < this.handles.length; h++) {
      const key = this.handleKey[h]!;
      let found = -1;
      if (key !== 0) {
        for (let i = 0; i < n; i++) {
          if (this.ctaken[i] === 0 && this.ckey[i] === key) {
            found = i;
            break;
          }
        }
      }
      const light = this.handles[h]!;
      if (found >= 0) {
        this.ctaken[found] = 1;
        const ramp = Math.min(1, this.handleRamp[h]! + dt * 4);
        this.handleRamp[h] = ramp;
        this.writeHandle(light, found, ramp);
      } else {
        // foyer disparu : extinction progressive, puis lumière libre
        const ramp = this.handleRamp[h]! - dt * 3;
        if (ramp <= 0) {
          this.handleRamp[h] = 0;
          this.handleKey[h] = 0;
          light.enabled = false;
          light.intensity = 0;
        } else {
          this.handleRamp[h] = ramp;
          light.intensity *= Math.max(0, 1 - dt * 6);
        }
      }
    }
    // 2. les lumières libres prennent les meilleurs foyers restants
    for (let h = 0; h < budget; h++) {
      if (h < this.handles.length && this.handleKey[h] !== 0) continue;
      let best = -1;
      let bestScore = 0;
      for (let i = 0; i < n; i++) {
        if (this.ctaken[i] === 1) continue;
        const s = this.cscore[i]!;
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      }
      if (best < 0) break;
      if (h >= this.handles.length) {
        try {
          this.handles.push(api.point({ intensity: 0, enabled: false }));
        } catch {
          this.sceneBudget = this.handles.length;
          break;
        }
        this.handleKey.push(0);
        this.handleRamp.push(0);
      }
      this.ctaken[best] = 1;
      this.handleKey[h] = this.ckey[best]!;
      this.handleRamp[h] = 0;
      this.writeHandle(this.handles[h]!, best, 0);
    }
  }

  private writeHandle(light: FxDynamicLight, i: number, ramp: number): void {
    light.x = this.cx[i]!;
    light.y = this.cy[i]!;
    light.z = this.cz[i]!;
    light.color = this.chex[i]!;
    light.intensity = this.ci[i]! * ramp;
    light.range = this.crange[i]!;
    light.flicker = 0;
    light.priority = 0.3;
    light.enabled = ramp > 0;
  }

  private releaseHandles(): void {
    for (const h of this.handles) {
      try {
        h.release();
      } catch { /* rien */ }
    }
    this.handles.length = 0;
    this.handleKey.length = 0;
    this.handleRamp.length = 0;
  }

  /** Remise à zéro (changement de session) : rend les lumières à la réserve. */
  reset(): void {
    this.count = 0;
    this.tcount = 0;
    this.shaderCount = 0;
    this.releaseHandles();
  }
}
