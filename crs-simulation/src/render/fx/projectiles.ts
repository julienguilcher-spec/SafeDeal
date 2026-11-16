/* =====================================================================================
 * Effets visuels — rendu des projectiles (ctx.projectiles.list).
 *
 * UN maillage instancié pour tous les corps : la géométrie réunit toutes les formes (grenade,
 * palet, pavé, bouteille, bille, torche, plot, munition de défense) ; un attribut par sommet dit à
 * quelle forme il appartient et le vertex shader écrase les sommets des autres formes.
 * Les effets attachés (flamme de l'engin incendiaire, étincelles du mortier, étoile de la fusée
 * rouge, fumée du palet et du fumigène) et les traînées passent par la couche de particules.
 * Les corps sont grossis avec la distance pour rester lisibles (un palet fait 5 cm).
 * ===================================================================================== */

import * as THREE from 'three';
import type { Projectile } from '@/core/contracts';
import { TILE_DOT, TILE_PUFF, TILE_STAR, TILE_STREAK, TILE_WISP } from './atlas';
import type { FxCore } from './core';
import { TAU, hash01, linB, linG, linR } from './mathx';
import { F_FADE_IN, F_TURB, KIND_ALPHA, KIND_FLAME, KIND_GLOW, MODE_AXIS, MODE_BILLBOARD, NO_FLOOR, PRIO_LOW } from './pool';

const SHAPE_GRENADE = 0;
const SHAPE_PALET = 1;
const SHAPE_PAVE = 2;
const SHAPE_BOTTLE = 3;
const SHAPE_BALL = 4;
const SHAPE_STICK = 5;
const SHAPE_PLOT = 6;
const SHAPE_SLUG = 7;

/** Comportement visuel par type de projectile. */
const FX_NONE = 0;
const FX_GAS_TRAIL = 1;   // grenade lacrymogène : filet blanc
const FX_PALET = 2;       // palet : fume au sol
const FX_MOLOTOV = 3;     // flamme à la mèche
const FX_MORTAR = 4;      // étoile et traînée d'étincelles
const FX_FLARE = 5;       // fusée rouge
const FX_BULLET = 6;      // balle : trait seulement
const FX_SMOKE = 7;       // fumigène coloré

interface KindStyle {
  shape: number;
  scale: number;
  color: number;
  fx: number;
  /** Teinte de la traînée (0 = aucune). */
  trail: number;
}

const STYLES: Record<string, KindStyle> = {
  grenade_lacrymo_main: { shape: SHAPE_GRENADE, scale: 1, color: 0x9aa0a6, fx: FX_GAS_TRAIL, trail: 0xd8dad6 },
  grenade_lacrymo_56: { shape: SHAPE_GRENADE, scale: 1, color: 0x9aa0a6, fx: FX_GAS_TRAIL, trail: 0xd8dad6 },
  palet_lacrymo: { shape: SHAPE_PALET, scale: 1, color: 0xb9b6a8, fx: FX_PALET, trail: 0xe4e6e1 },
  gm2l: { shape: SHAPE_GRENADE, scale: 0.55, color: 0x6b7280, fx: FX_NONE, trail: 0xb0b4b8 },
  desencerclement: { shape: SHAPE_GRENADE, scale: 0.6, color: 0x181818, fx: FX_NONE, trail: 0x8a8a8a },
  plot_caoutchouc: { shape: SHAPE_PLOT, scale: 1, color: 0x151515, fx: FX_NONE, trail: 0 },
  lbd: { shape: SHAPE_SLUG, scale: 1, color: 0x24262a, fx: FX_NONE, trail: 0x9a9a9a },
  balle: { shape: SHAPE_PLOT, scale: 0.4, color: 0xb08d57, fx: FX_BULLET, trail: 0 },
  fusee_rouge: { shape: SHAPE_BALL, scale: 0.7, color: 0xff5a40, fx: FX_FLARE, trail: 0 },
  pave: { shape: SHAPE_PAVE, scale: 1, color: 0x6b6e72, fx: FX_NONE, trail: 0x6f6f6f },
  bouteille: { shape: SHAPE_BOTTLE, scale: 1, color: 0x6e8f7a, fx: FX_NONE, trail: 0x8fa596 },
  molotov: { shape: SHAPE_BOTTLE, scale: 1, color: 0x7a6a3a, fx: FX_MOLOTOV, trail: 0 },
  mortier: { shape: SHAPE_BALL, scale: 1.1, color: 0xfff0c0, fx: FX_MORTAR, trail: 0 },
  fumigene: { shape: SHAPE_STICK, scale: 1, color: 0xb02a2a, fx: FX_SMOKE, trail: 0 },
  oeuf_peinture: { shape: SHAPE_BALL, scale: 0.9, color: 0xe8e2d0, fx: FX_NONE, trail: 0xcfcfcf },
  debris: { shape: SHAPE_PAVE, scale: 0.7, color: 0x4a4744, fx: FX_NONE, trail: 0x5a5a5a },
};
const DEFAULT_STYLE: KindStyle = STYLES.debris!;

/** Lit la couleur portée par un projectile (fumée, étoile) si le module des objets l'a rangée dans `data`. */
export function projectileColor(p: Projectile, fallback: number): number {
  const d = p.data as { color?: unknown } | null | undefined;
  if (d && typeof d === 'object') {
    const c = d.color;
    if (typeof c === 'number' && c > 0 && c <= 0xffffff) return c;
  }
  return fallback;
}

/** Grossissement d'un corps selon sa distance à la caméra : taille réelle jusqu'à 10 m, × 5 au plus. */
export function projectileScale(distance: number): number {
  const s = distance / 10;
  return s < 1 ? 1 : s > 5 ? 5 : s;
}

function buildGeometry(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; shape: number }[] = [];
  const add = (geo: THREE.BufferGeometry, shape: number): void => {
    parts.push({ geo: geo.index ? geo.toNonIndexed() : geo, shape });
  };
  // toutes les formes ont leur grand axe sur +y (orienté ensuite le long de la vitesse)
  add(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 7), SHAPE_GRENADE);
  add(new THREE.CylinderGeometry(0.027, 0.027, 0.034, 7), SHAPE_PALET);
  add(new THREE.BoxGeometry(0.11, 0.1, 0.12), SHAPE_PAVE);
  const profile = [
    new THREE.Vector2(0.0, -0.13), new THREE.Vector2(0.036, -0.13), new THREE.Vector2(0.036, 0.02),
    new THREE.Vector2(0.014, 0.07), new THREE.Vector2(0.014, 0.13), new THREE.Vector2(0.0, 0.13),
  ];
  add(new THREE.LatheGeometry(profile, 6), SHAPE_BOTTLE);
  add(new THREE.SphereGeometry(0.03, 6, 4), SHAPE_BALL);
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6), SHAPE_STICK);
  add(new THREE.BoxGeometry(0.032, 0.032, 0.032), SHAPE_PLOT);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.055, 6), SHAPE_SLUG);
  let total = 0;
  for (const p of parts) total += p.geo.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const shape = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    p.geo.computeVertexNormals();
    const gp = p.geo.getAttribute('position');
    const gn = p.geo.getAttribute('normal');
    for (let i = 0; i < gp.count; i++) {
      pos[o * 3] = gp.getX(i); pos[o * 3 + 1] = gp.getY(i); pos[o * 3 + 2] = gp.getZ(i);
      nor[o * 3] = gn.getX(i); nor[o * 3 + 1] = gn.getY(i); nor[o * 3 + 2] = gn.getZ(i);
      shape[o] = p.shape;
      o++;
    }
    p.geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aShape', new THREE.BufferAttribute(shape, 1));
  return geo;
}

/** État de rendu d'un projectile : historique de positions pour la traînée, cadences d'émission. */
class Track {
  id = 0;
  stamp = 0;
  /** Historique en anneau (x, y, z). */
  readonly hist: Float32Array;
  head = 0;
  len = 0;
  sampleAt = 0;
  acc = 0;
  smokeAcc = 0;
  seed = 0;
  constructor(points: number) {
    this.hist = new Float32Array(points * 3);
  }
}

export class ProjectileRenderer {
  readonly mesh: THREE.InstancedMesh;
  /** Projectiles dessinés à la dernière image. */
  drawn = 0;

  private readonly capacity: number;
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array;
  private readonly shapes: Float32Array;
  private readonly aShape: THREE.InstancedBufferAttribute;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly tracks = new Map<number, Track>();
  private readonly freeTracks: Track[] = [];
  private readonly trackList: Track[] = [];
  private readonly points: number;
  private stamp = 0;

  constructor(private readonly core: FxCore) {
    const cap = core.budget.maxProjectiles;
    this.capacity = cap;
    this.points = core.budget.trailSegments + 1;
    const geo = buildGeometry();
    this.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aShape;\nattribute float iShape;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed *= step( abs( aShape - iShape ), 0.5 );');
    };
    this.material.customProgramCacheKey = () => 'fx-projectiles';
    this.mesh = new THREE.InstancedMesh(geo, this.material, cap);
    this.mesh.name = 'fx-projectiles';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrices = this.mesh.instanceMatrix.array as Float32Array;
    this.colors = new Float32Array(cap * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.colors, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.shapes = new Float32Array(cap);
    this.aShape = new THREE.InstancedBufferAttribute(this.shapes, 1);
    this.aShape.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iShape', this.aShape);
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  clear(): void {
    for (const t of this.trackList) this.freeTracks.push(t);
    this.trackList.length = 0;
    this.tracks.clear();
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.drawn = 0;
  }

  private track(id: number): Track {
    let t = this.tracks.get(id);
    if (!t) {
      t = this.freeTracks.pop() ?? new Track(this.points);
      t.id = id;
      t.head = 0;
      t.len = 0;
      t.sampleAt = 0;
      t.acc = 0;
      t.smokeAcc = 0;
      t.seed = hash01(id * 13 + 5);
      this.tracks.set(id, t);
      this.trackList.push(t);
    }
    t.stamp = this.stamp;
    return t;
  }

  update(): void {
    const core = this.core;
    const list = core.ctx.projectiles.list;
    const sp = core.sprites;
    const draw = core.view.drawDistance;
    const detailD = core.budget.detailDistance;
    const time = core.time;
    const dt = core.dt;
    const rng = core.rng;
    const m = this.matrices;
    const col = this.colors;
    const shapes = this.shapes;
    const cap = this.capacity;
    const camX = core.camX, camY = core.camY, camZ = core.camZ;
    const points = this.points;
    this.stamp++;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      const dx = p.x - camX;
      const dy = p.y - camY;
      const dz = p.z - camZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > draw) continue;
      const style = STYLES[p.kind] ?? DEFAULT_STYLE;
      const speed2 = p.vx * p.vx + p.vy * p.vy + p.vz * p.vz;
      const flying = !p.resting && speed2 > 0.25;
      const near = dist < detailD * 1.5;

      // ── corps ──
      if (n < cap && style.fx !== FX_BULLET && style.fx !== FX_MORTAR && style.fx !== FX_FLARE) {
        const s = style.scale * projectileScale(dist);
        // axe long : le long de la vitesse en vol ; couché sur le sol au repos
        let ax: number, ay: number, az: number;
        if (flying) {
          const inv = 1 / Math.sqrt(speed2);
          ax = p.vx * inv; ay = p.vy * inv; az = p.vz * inv;
          // culbute : l'axe tourne autour de la trajectoire selon la rotation propre
          if (style.shape !== SHAPE_BALL && style.shape !== SHAPE_SLUG) {
            const c = Math.cos(p.spin);
            const sn = Math.sin(p.spin);
            // vecteur perpendiculaire à la vitesse
            let ux = -az, uy = 0, uz = ax;
            const ul = Math.sqrt(ux * ux + uz * uz);
            if (ul > 1e-4) { ux /= ul; uz /= ul; } else { ux = 1; uz = 0; }
            ax = ax * c + ux * sn; ay = ay * c + uy * sn; az = az * c + uz * sn;
          }
        } else {
          const a = hash01(p.id) * TAU + p.spin;
          const lying = style.shape === SHAPE_PALET || style.shape === SHAPE_PAVE || style.shape === SHAPE_PLOT || style.shape === SHAPE_BALL;
          if (lying) { ax = 0; ay = 1; az = 0; } else { ax = Math.cos(a); ay = 0.04; az = Math.sin(a); }
        }
        let al = Math.sqrt(ax * ax + ay * ay + az * az);
        if (al < 1e-5) { ax = 0; ay = 1; az = 0; al = 1; }
        ax /= al; ay /= al; az /= al;
        // base orthonormée (X, Y = axe, Z)
        let xx: number, xy: number, xz: number;
        if (ay > 0.99 || ay < -0.99) { xx = 1; xy = 0; xz = 0; } else {
          xx = az; xy = 0; xz = -ax;
          const l = Math.sqrt(xx * xx + xz * xz);
          xx /= l; xz /= l;
        }
        const zx = xy * az - xz * ay;
        const zy = xz * ax - xx * az;
        const zz = xx * ay - xy * ax;
        const o = n * 16;
        m[o] = xx * s; m[o + 1] = xy * s; m[o + 2] = xz * s; m[o + 3] = 0;
        m[o + 4] = ax * s; m[o + 5] = ay * s; m[o + 6] = az * s; m[o + 7] = 0;
        m[o + 8] = zx * s; m[o + 9] = zy * s; m[o + 10] = zz * s; m[o + 11] = 0;
        // au repos, le corps est posé : relevé de son demi-diamètre grossi
        m[o + 12] = p.x; m[o + 13] = flying ? p.y : p.y + 0.028 * s; m[o + 14] = p.z; m[o + 15] = 1;
        const hex = style.fx === FX_SMOKE ? projectileColor(p, style.color) : style.color;
        col[n * 3] = linR(hex); col[n * 3 + 1] = linG(hex); col[n * 3 + 2] = linB(hex);
        shapes[n] = style.shape;
        n++;
      }

      // ── effets attachés et traînée ──
      const needsTrack = flying || style.fx === FX_PALET || style.fx === FX_SMOKE;
      if (!needsTrack || !near) {
        if (style.fx === FX_FLARE || style.fx === FX_MORTAR) this.head(p, style, dist);
        continue;
      }
      const tr = this.track(p.id);
      if (flying && time >= tr.sampleAt) {
        tr.sampleAt = time + 0.035;
        const h = tr.head;
        tr.hist[h * 3] = p.x; tr.hist[h * 3 + 1] = p.y; tr.hist[h * 3 + 2] = p.z;
        tr.head = (h + 1) % points;
        if (tr.len < points) tr.len++;
      } else if (!flying) {
        tr.len = 0;
      }
      // traînée : tronçons entre les positions passées, de plus en plus fins et pâles
      if (flying && style.trail !== 0 && tr.len >= 2 && sp.count + tr.len < sp.capacity) {
        const r = linR(style.trail), g = linG(style.trail), b = linB(style.trail);
        let px = p.x, py = p.y, pz = p.z;
        const w = 0.05 * projectileScale(dist);
        for (let k = 1; k <= tr.len; k++) {
          const h = (tr.head - k + points * 2) % points;
          const qx = tr.hist[h * 3]!, qy = tr.hist[h * 3 + 1]!, qz = tr.hist[h * 3 + 2]!;
          const f = 1 - (k - 1) / tr.len;
          sp.push((px + qx) * 0.5, (py + qy) * 0.5, (pz + qz) * 0.5, w * (0.6 + 0.8 * f), px - qx, py - qy, pz - qz, 0,
            r, g, b, 0.34 * f, TILE_STREAK, KIND_ALPHA + 4 * MODE_AXIS, NO_FLOOR, 0);
          px = qx; py = qy; pz = qz;
        }
      }
      switch (style.fx) {
        case FX_GAS_TRAIL:
          if (p.emitting || flying) this.emitSmoke(p, tr, 5, 0.8, 0.81, 0.78, 0.3, 0.25, 0.9, 0.9);
          break;
        case FX_PALET:
          if (p.emitting) {
            // jet sifflant : dense et rapide au ras du palet
            const rate = dist < detailD * 0.6 ? 9 : 4;
            this.emitSmoke(p, tr, rate, 0.84, 0.85, 0.82, 0.5, 0.22, 1.6, 1.5);
          }
          break;
        case FX_SMOKE:
          if (p.emitting) {
            const hex = projectileColor(p, 0xd62828);
            this.emitSmoke(p, tr, 8, Math.max(0.03, linR(hex)), Math.max(0.03, linG(hex)), Math.max(0.03, linB(hex)), 0.62, 0.3, 2.4, 2.2);
            // la torche brûle : point vif à son extrémité
            sp.push(p.x, p.y + 0.06, p.z, 0.3, 0, 0, 0, 0, linR(hex) + 0.6, linG(hex) + 0.3, linB(hex) + 0.2, 2.2, TILE_DOT, KIND_GLOW + 4 * MODE_BILLBOARD, NO_FLOOR, 0);
            core.lights.add(p.x, p.y + 0.3, p.z, hex, 12, 7, 0, 0.5, false);
          }
          break;
        case FX_MOLOTOV: {
          const fl = 0.34 * projectileScale(dist) * (0.85 + 0.3 * Math.sin(time * 31 + tr.seed * 9));
          sp.push(p.x, p.y + fl * 0.45, p.z, fl * 0.8, 0, fl, 0, 0, 1, 1, 1, 1.3, 0, KIND_FLAME + 4 * MODE_AXIS, NO_FLOOR, tr.seed * 5);
          core.lights.add(p.x, p.y, p.z, 0xff8a2a, 22, 9, 0, 0.5, false);
          tr.acc += 22 * core.budget.emission * dt;
          while (tr.acc >= 1) {
            tr.acc -= 1;
            const idx = core.glow(PRIO_LOW, p.x, p.y, p.z, 0.16, 0.04, 0.3 + rng.next() * 0.25, 1, 0.5, 0.12, 2.4, TILE_DOT);
            if (idx >= 0) { core.pool.vy[idx] = 0.6; core.pool.drag[idx] = 1; }
          }
          break;
        }
        case FX_MORTAR:
        case FX_FLARE:
          this.head(p, style, dist);
          tr.acc += (style.fx === FX_FLARE ? 46 : 60) * core.budget.emission * dt;
          while (tr.acc >= 1) {
            tr.acc -= 1;
            const hex = style.fx === FX_FLARE ? 0xff5030 : projectileColor(p, 0xffd60a);
            const back = rng.next() * dt;
            core.spark(
              PRIO_LOW, p.x - p.vx * back, p.y - p.vy * back, p.z - p.vz * back,
              p.vx * 0.15 + rng.signed() * 1.6, p.vy * 0.15 + rng.signed() * 1.6, p.vz * 0.15 + rng.signed() * 1.6,
              0.05, 0.25 + rng.next() * 0.45, linR(hex) + 0.3, linG(hex) + 0.25, linB(hex) + 0.15, 3.4,
            );
          }
          if (style.fx === FX_FLARE) this.emitSmoke(p, tr, 0, 0.5, 0.42, 0.4, 0.3, 0.35, 1.8, 1.6);
          break;
        default:
          break;
      }
    }
    // historiques des projectiles disparus
    const tl = this.trackList;
    let k = 0;
    while (k < tl.length) {
      const t = tl[k]!;
      if (t.stamp !== this.stamp) {
        this.tracks.delete(t.id);
        this.freeTracks.push(t);
        const last = tl.pop()!;
        if (last !== t) tl[k] = last;
        continue;
      }
      k++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
      this.aShape.needsUpdate = true;
    }
    this.drawn = n;
  }

  /** Tête lumineuse d'un engin pyrotechnique : étoile, halo, lumière qui l'accompagne. */
  private head(p: Projectile, style: KindStyle, dist: number): void {
    const core = this.core;
    const sp = core.sprites;
    const flare = style.fx === FX_FLARE;
    const hex = flare ? 0xff2a1a : projectileColor(p, 0xffd60a);
    const r = linR(hex), g = linG(hex), b = linB(hex);
    const k = projectileScale(dist) * 0.5 + 0.5;
    const tw = 0.8 + 0.2 * Math.sin(core.time * 47 + p.id);
    sp.push(p.x, p.y, p.z, (flare ? 0.8 : 0.45) * k, 0, 0, 0, 0, r * 0.5 + 0.7, g * 0.5 + 0.6, b * 0.5 + 0.5, 5 * tw, TILE_DOT, KIND_GLOW + 4 * MODE_BILLBOARD, NO_FLOOR, 0);
    sp.push(p.x, p.y, p.z, (flare ? 3 : 1.7) * k, 0, 0, 0, core.time * 2, r, g, b, 1.7 * tw, TILE_STAR, KIND_GLOW + 4 * MODE_BILLBOARD, NO_FLOOR, 0);
    sp.push(p.x, p.y, p.z, (flare ? 6 : 2.8) * k, 0, 0, 0, 0, r, g, b, 0.55 * tw, TILE_DOT, KIND_GLOW + 4 * MODE_BILLBOARD, NO_FLOOR, 0);
    // la fusée de sommation éclaire la place en montant
    core.lights.add(p.x, p.y, p.z, hex, flare ? 420 : 70, flare ? 90 : 16, 0x7f0000 + (p.id & 0xffff), 0.25, flare);
  }

  /** Fumée émise par un projectile : cadence en bouffées par seconde (qualité « haut »), 0 = filet de vol. */
  private emitSmoke(
    p: Projectile, tr: Track, rate: number, r: number, g: number, b: number, alpha: number, s0: number, s1: number, life: number,
  ): void {
    const core = this.core;
    const rng = core.rng;
    const base = rate > 0 ? rate : 14;
    tr.smokeAcc += base * core.budget.emission * (core.pool.load > 0.85 ? 0.3 : 1) * core.dt;
    while (tr.smokeAcc >= 1) {
      tr.smokeAcc -= 1;
      const idx = core.puff(
        PRIO_LOW, p.x + rng.signed() * 0.05, p.y + 0.05, p.z + rng.signed() * 0.05,
        p.vx * 0.2 + rng.signed() * 0.5, (p.resting ? 1.4 : 0.3) + rng.next() * 0.8, p.vz * 0.2 + rng.signed() * 0.5,
        s0, s1 * (0.8 + 0.5 * rng.next()), life * (0.7 + 0.6 * rng.next()), r, g, b, alpha, p.resting ? TILE_WISP : TILE_PUFF + rng.int(4),
      );
      if (idx >= 0) {
        const pool = core.pool;
        pool.drag[idx] = 1.1;
        pool.wind[idx] = 1.2;
        pool.grav[idx] = -0.03;
        pool.flags[idx] = F_TURB | F_FADE_IN;
        pool.floorY[idx] = NO_FLOOR;
      }
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
