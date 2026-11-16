/* =====================================================================================
 * Réserve de lumières dynamiques (incendies, gyrophares, explosions, phares, lampes).
 *
 * Le nombre de lumières de la scène est FIXE (budget du préréglage) : Three.js recompile tous les
 * matériaux quand ce nombre change, ce qui provoquerait des à-coups. Les modules créent autant de
 * lumières « virtuelles » qu'ils veulent ; à chaque image, les plus importantes pour la caméra
 * reçoivent une vraie lumière, avec un fondu à l'attribution comme au retrait.
 * Aucune allocation par image.
 * ===================================================================================== */

import * as THREE from 'three';
import type { DynamicLight, DynamicLightInit, RenderLightsApi } from './api';
import { hash01, noise1 } from './util';

/** Vitesse des fondus (1/s) : une lumière s'allume ou s'éteint en ~0,15 s. */
const FADE_RATE = 7;
/** Une lumière déjà allumée garde un avantage, pour éviter les permutations incessantes. */
const KEEP_BONUS = 1.3;
/** Nombre maximal de lumières « à l'image » (pulse) par image. */
const MAX_PULSES = 48;

class VirtualLight implements DynamicLight {
  x = 0;
  y = 0;
  z = 0;
  color = 0xffffff;
  intensity = 0;
  range = 10;
  priority = 0;
  enabled = true;
  flicker = 0;
  dirX = 0;
  dirY = -1;
  dirZ = 0;
  angle = 0.5;
  penumbra = 0.4;
  /** Fondu courant 0..1 et emplacement réel occupé (-1 = aucun). */
  shown = 0;
  slot = -1;
  score = 0;
  wanted = false;
  alive = true;
  /** Éclat bref : durée de vie restante et totale (s) ; 0 = lumière permanente. */
  life = 0;
  lifeTotal = 0;
  baseIntensity = 0;
  /** Lumière « à l'image » (pulse) : allumée et éteinte sans fondu, redemandée à chaque image. */
  instant = false;
  readonly seed: number;

  constructor(readonly kind: 'point' | 'spot', private readonly pool: LightPool, id: number) {
    this.seed = hash01(id * 31 + 7) * 1000;
  }

  release(): void {
    this.pool.release(this);
  }
}

interface Slot {
  light: THREE.PointLight | THREE.SpotLight;
  owner: VirtualLight | null;
}

export class LightPool implements RenderLightsApi {
  private readonly points: Slot[] = [];
  private readonly spots: Slot[] = [];
  private readonly virtuals: VirtualLight[] = [];
  private readonly free: VirtualLight[] = [];
  private readonly group = new THREE.Group();
  private readonly tmpColor = new THREE.Color();
  private nextId = 1;
  private time = 0;
  /** Lumières « à l'image » : la n-ième demande d'une image réutilise la n-ième lumière. */
  private readonly pulses: VirtualLight[] = [];
  private pulseCount = 0;
  private pulseActive = 0;
  /** Lumières virtuelles actives et vraies lumières allumées à la dernière image. */
  wantedCount = 0;
  litCount = 0;

  constructor(private readonly scene: THREE.Scene, pointBudget: number, spotBudget: number) {
    this.group.name = 'lumieres-dynamiques';
    scene.add(this.group);
    this.setBudget(pointBudget, spotBudget);
  }

  get pointBudget(): number {
    return this.points.length;
  }

  get spotBudget(): number {
    return this.spots.length;
  }

  get count(): number {
    // les lumières « à l'image » au repos ne comptent pas
    return this.virtuals.length - (this.pulses.length - Math.max(this.pulseCount, this.pulseActive));
  }

  /** Change le nombre de vraies lumières (changement de qualité : recompile les matériaux une fois). */
  setBudget(pointBudget: number, spotBudget: number): void {
    this.resize(this.points, Math.max(0, pointBudget | 0), false);
    this.resize(this.spots, Math.max(0, spotBudget | 0), true);
  }

  private resize(slots: Slot[], n: number, spot: boolean): void {
    while (slots.length > n) {
      const s = slots.pop()!;
      if (s.owner) {
        s.owner.slot = -1;
        s.owner.shown = 0;
      }
      this.group.remove(s.light);
      if ((s.light as THREE.SpotLight).isSpotLight) this.group.remove((s.light as THREE.SpotLight).target);
      s.light.dispose();
    }
    while (slots.length < n) {
      let light: THREE.PointLight | THREE.SpotLight;
      if (spot) {
        const sl = new THREE.SpotLight(0xffffff, 0, 30, 0.5, 0.4, 2);
        this.group.add(sl.target);
        light = sl;
      } else {
        light = new THREE.PointLight(0xffffff, 0, 10, 2);
      }
      // toujours « visibles » : c'est l'intensité nulle qui les éteint, sans recompiler quoi que ce soit
      light.castShadow = false;
      light.position.set(0, -1000, 0);
      this.group.add(light);
      slots.push({ light, owner: null });
    }
  }

  point(init?: DynamicLightInit): DynamicLight {
    return this.create('point', init);
  }

  spot(init?: DynamicLightInit): DynamicLight {
    return this.create('spot', init);
  }

  private create(kind: 'point' | 'spot', init?: DynamicLightInit): VirtualLight {
    let v: VirtualLight | undefined;
    for (let i = this.free.length - 1; i >= 0; i--) {
      if (this.free[i]!.kind === kind) {
        v = this.free[i]!;
        this.free.splice(i, 1);
        break;
      }
    }
    if (!v) v = new VirtualLight(kind, this, this.nextId++);
    v.x = 0; v.y = 0; v.z = 0;
    v.color = 0xffffff;
    v.intensity = 0;
    v.range = 10;
    v.priority = 0;
    v.enabled = true;
    v.flicker = 0;
    v.dirX = 0; v.dirY = -1; v.dirZ = 0;
    v.angle = 0.5;
    v.penumbra = 0.4;
    v.shown = 0;
    v.slot = -1;
    v.alive = true;
    v.life = 0;
    v.lifeTotal = 0;
    if (init) Object.assign(v, init);
    this.virtuals.push(v);
    return v;
  }

  flash(x: number, y: number, z: number, color: number, intensity: number, range: number, seconds: number): void {
    if (!(seconds > 0) || !(intensity > 0)) return;
    const v = this.create('point');
    v.x = x; v.y = y; v.z = z;
    v.color = color;
    v.intensity = intensity;
    v.baseIntensity = intensity;
    v.range = range;
    v.priority = 1;
    v.life = seconds;
    v.lifeTotal = seconds;
    // un éclat n'a pas le temps d'un fondu d'entrée
    v.shown = 1;
  }

  pulse(x: number, y: number, z: number, color: number, intensity: number, radius: number): void {
    if (!(intensity > 0) || !(radius > 0) || this.pulseCount >= MAX_PULSES) return;
    let v = this.pulses[this.pulseCount];
    if (!v) {
      v = new VirtualLight('point', this, this.nextId++);
      v.instant = true;
      this.pulses.push(v);
      this.virtuals.push(v);
    }
    this.pulseCount++;
    v.x = x; v.y = y; v.z = z;
    v.color = color;
    v.intensity = intensity;
    v.range = radius;
    v.enabled = true;
  }

  release(v: VirtualLight): void {
    if (v.instant) {
      // une lumière « à l'image » appartient à la réserve : on l'éteint seulement
      v.enabled = false;
      return;
    }
    if (!v.alive) return;
    v.alive = false;
    v.enabled = false;
    const i = this.virtuals.indexOf(v);
    if (i >= 0) {
      this.virtuals[i] = this.virtuals[this.virtuals.length - 1]!;
      this.virtuals.pop();
    }
    if (v.slot >= 0) {
      const slots = v.kind === 'spot' ? this.spots : this.points;
      const s = slots[v.slot];
      if (s && s.owner === v) {
        s.owner = null;
        s.light.intensity = 0;
      }
      v.slot = -1;
    }
    v.shown = 0;
    this.free.push(v);
  }

  /** Rend toutes les lumières (libération du module, tests). */
  clear(): void {
    for (let i = this.virtuals.length - 1; i >= 0; i--) this.release(this.virtuals[i]!);
    this.pulseCount = 0;
    this.pulseActive = 0;
  }

  /** Éteint les éclats brefs en cours (changement de session) ; les lumières des modules restent à leurs propriétaires. */
  clearFlashes(): void {
    for (let i = this.virtuals.length - 1; i >= 0; i--) {
      const v = this.virtuals[i]!;
      if (v.lifeTotal > 0) this.release(v);
    }
  }

  /** Attribue les vraies lumières pour cette image. `camX/Y/Z` : position de la caméra. */
  update(dt: number, camX: number, camY: number, camZ: number): void {
    this.time = (this.time + dt) % 3600;
    const list = this.virtuals;
    // lumières « à l'image » : celles qui n'ont pas été redemandées depuis la dernière image s'éteignent
    for (let i = this.pulseCount; i < this.pulses.length; i++) this.pulses[i]!.enabled = false;
    this.pulseActive = this.pulseCount;
    this.pulseCount = 0;
    // éclats brefs : extinction progressive puis retour à la réserve
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i]!;
      if (v.lifeTotal > 0) {
        v.life -= dt;
        if (v.life <= 0) {
          this.release(v);
          continue;
        }
        const k = v.life / v.lifeTotal;
        v.intensity = v.baseIntensity * k * k;
      }
    }
    // importance de chaque lumière pour la caméra
    let wanted = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      v.wanted = false;
      if (!v.enabled || !(v.intensity > 0) || !(v.range > 0)) {
        v.score = 0;
        continue;
      }
      wanted++;
      const dx = v.x - camX;
      const dy = v.y - camY;
      const dz = v.z - camZ;
      const d2 = dx * dx + dy * dy + dz * dz;
      const reach = v.range * 4;
      // éclairement apporté autour de la caméra : fort et proche d'abord, portée comprise
      v.score = (v.intensity * (1 + v.priority * 2) * v.range) / (d2 + reach * reach * 0.05 + 1);
      if (v.slot >= 0) v.score *= KEEP_BONUS;
    }
    this.wantedCount = wanted;
    this.litCount = this.assign(this.points, 'point', dt) + this.assign(this.spots, 'spot', dt);
  }

  private assign(slots: Slot[], kind: 'point' | 'spot', dt: number): number {
    const list = this.virtuals;
    const budget = slots.length;
    // sélection des `budget` meilleures (peu d'éléments : sélection directe, sans tri ni allocation)
    for (let k = 0; k < budget; k++) {
      let best: VirtualLight | null = null;
      for (let i = 0; i < list.length; i++) {
        const v = list[i]!;
        if (v.kind !== kind || v.wanted || v.score <= 0) continue;
        if (!best || v.score > best.score) best = v;
      }
      if (!best) break;
      best.wanted = true;
    }
    const step = FADE_RATE * dt;
    // libère les emplacements dont la lumière n'est plus retenue (après son fondu de sortie)
    for (let s = 0; s < budget; s++) {
      const slot = slots[s]!;
      const o = slot.owner;
      if (!o) continue;
      if (o.wanted) {
        o.shown = o.instant ? 1 : Math.min(1, o.shown + step);
      } else {
        o.shown = o.instant ? 0 : o.shown - step;
        if (o.shown <= 0) {
          o.shown = 0;
          o.slot = -1;
          slot.owner = null;
        }
      }
    }
    // donne les emplacements libres aux lumières retenues qui n'en ont pas
    let lit = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (v.kind !== kind || !v.wanted || v.slot >= 0) continue;
      for (let s = 0; s < budget; s++) {
        if (!slots[s]!.owner) {
          slots[s]!.owner = v;
          v.slot = s;
          if (v.instant) v.shown = 1;
          else if (v.lifeTotal <= 0) v.shown = Math.min(1, step);
          break;
        }
      }
    }
    // écrit les vraies lumières
    for (let s = 0; s < budget; s++) {
      const slot = slots[s]!;
      const o = slot.owner;
      const light = slot.light;
      if (!o) {
        light.intensity = 0;
        continue;
      }
      let k = o.shown;
      if (o.flicker > 0) {
        const n = 0.6 * noise1(this.time * 9, o.seed) + 0.4 * noise1(this.time * 23, o.seed + 5);
        k *= 1 - o.flicker * (0.35 + 0.35 * n);
      }
      light.position.set(o.x, o.y, o.z);
      light.color.copy(this.tmpColor.setHex(o.color));
      light.intensity = o.enabled ? o.intensity * k : 0;
      light.distance = o.range;
      if (kind === 'spot') {
        const sl = light as THREE.SpotLight;
        sl.angle = o.angle;
        sl.penumbra = o.penumbra;
        sl.target.position.set(o.x + o.dirX, o.y + o.dirY, o.z + o.dirZ);
        sl.target.updateMatrixWorld();
      }
      if (light.intensity > 0) lit++;
    }
    return lit;
  }

  dispose(): void {
    this.clear();
    this.setBudget(0, 0);
    this.scene.remove(this.group);
  }
}
