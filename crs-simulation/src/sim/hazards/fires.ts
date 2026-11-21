/* =====================================================================================
 * DANGERS DIFFUS — nappes de feu au sol (engin incendiaire brisé, carburant répandu…).
 *
 * Vie d'une nappe : embrasement en moins d'une seconde, combustion à pleine intensité, puis
 * extinction progressive (flammes qui baissent, nappe qui se rétracte) quand le combustible s'épuise.
 * Durée : 18 s (intensité faible) à 36 s (pleine intensité), ± 12 %, allongée pour les grandes nappes
 * — docs/research/00-bible-realisme.md table B (« flaque de feu 20 à 40 s, Ø 2 à 3 m »).
 * La pluie abrège la combustion et rabat les flammes. L'eau ou la poudre (douse) abat les flammes :
 * une extinction incomplète laisse le feu reprendre en quelques secondes.
 *
 * Les feux d'objets, de véhicules et de vitrines appartiennent à leurs modules respectifs ; ils
 * peuvent entretenir une nappe ici en rappelant ignite() au même endroit (les appels fusionnent).
 * ===================================================================================== */

import { truncate } from '@/core/arrays';
import type { EntityId, GameContext, Rng } from '@/core/contracts';
import type { FireView } from './api';
import type { HazardTuning } from './config';
import { blockKey } from './statics';

/** Côté d'une case de l'index des feux (m). */
const BUCKET = 16;
/** Rayon de référence (m) : flaque d'un engin incendiaire, Ø 2,5 m. */
const REF_RADIUS = 1.25;
const MIN_RADIUS = 0.4;
const MAX_RADIUS = 12;
/** Durée de l'embrasement initial (s). */
const FLARE_SECONDS = 0.8;
/** Le feu touche jusqu'à 1,1 × son rayon ; plein effet jusqu'à 0,6 × son rayon. */
const REACH = 1.1;
const CORE = 0.6;
/** Reprise des flammes après un arrosage incomplet (part d'abattement perdue par seconde)… */
const RECOVERY = 0.12;
/** …une fois l'arrosage interrompu depuis ce délai (s) : tant que l'eau tombe, le feu ne reprend pas. */
const RECOVERY_DELAY = 1;
/** Vapeur dégagée (unités de fumée au cœur de la nappe) par dose d'eau ramenée au besoin total du feu. */
const STEAM_PER_DOSE = 2.5;
/** Intervalle minimal entre deux gerbes d'étincelles, tous feux confondus (s). */
const SPARK_GAP = 0.2;

export class Fire implements FireView {
  id = 0;
  x = 0;
  z = 0;
  y = 0;
  radius = 0;
  intensity = 0;
  age = 0;
  sourceId: EntityId = 0;
  /** Rayon de la nappe à pleine combustion. */
  baseRadius = 0;
  /** Intensité de pleine combustion demandée à l'allumage. */
  peak = 0;
  /** Combustible restant (s) et durée totale prévue (s). */
  fuel = 0;
  duration = 0;
  /** Abattement par l'eau 0..1 (1 = éteint) et instant du dernier arrosage (s). */
  suppress = 0;
  dousedAt = -1e9;
  sparkAt = 0;
}

export class FireSet {
  /** Nappes actives (objets stables ; retrait par échange avec le dernier). */
  readonly list: Fire[] = [];
  /** Appelé quand de l'eau tombe sur un feu : (x, z, rayon, quantité de vapeur). */
  onSteam: ((x: number, z: number, radius: number, amount: number) => void) | null = null;
  /** Incrémenté à chaque allumage ou extinction. */
  changes = 0;

  private readonly pool: Fire[] = [];
  private readonly buckets = new Map<number, Fire[]>();
  private readonly bucketPool: Fire[][] = [];
  private indexDirty = false;
  private nextId = 1;
  private nextSparkAt = 0;
  private rng: Rng;

  constructor(
    private readonly ctx: GameContext,
    private readonly tuning: HazardTuning,
  ) {
    this.rng = ctx.rng.fork('hazards:feux');
  }

  /** Début de session : plus aucun feu, générateur re-dérivé de la graine de la session. */
  reset(): void {
    this.clear();
    this.rng = this.ctx.rng.fork('hazards:feux');
    this.nextId = 1;
    this.nextSparkAt = 0;
  }

  /** Retire tous les feux sans émettre d'événement. */
  clear(): void {
    while (this.list.length > 0) this.pool.push(this.list.pop()!);
    this.indexDirty = true;
    this.changes++;
  }

  /** Allume une nappe (ou ré-alimente celle qui brûle déjà à cet endroit). */
  ignite(x: number, z: number, radius: number, intensity: number, sourceId: EntityId): Fire | null {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !(radius > 0) || !(intensity > 0)) return null;
    const t = this.tuning;
    const r = radius < MIN_RADIUS ? MIN_RADIUS : radius > MAX_RADIUS ? MAX_RADIUS : radius;
    const peak = intensity > 1 ? 1 : intensity < 0.05 ? 0.05 : intensity;
    let duration = t.fireMinSeconds + (t.fireMaxSeconds - t.fireMinSeconds) * peak;
    if (r > 1.5) duration *= Math.min(3, 1 + 0.25 * (r - 1.5));
    duration *= this.rng.range(0.88, 1.12);

    // fusion avec une nappe déjà là : on ré-alimente au lieu d'empiler
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      const dx = f.x - x;
      const dz = f.z - z;
      const merge = 0.6 * (f.baseRadius > r ? f.baseRadius : r);
      if (dx * dx + dz * dz > merge * merge) continue;
      if (duration > f.fuel) f.fuel = duration;
      if (f.fuel > f.duration) f.duration = f.fuel;
      if (peak > f.peak) f.peak = peak;
      if (r > f.baseRadius) {
        f.baseRadius = r;
        this.indexDirty = true;
      }
      f.suppress *= 0.5;
      if (f.sourceId === 0) f.sourceId = sourceId;
      return f;
    }

    if (list.length >= t.maxFires) this.dropWeakest();
    const f = this.pool.length > 0 ? this.pool.pop()! : new Fire();
    const y = this.ctx.world.heightAt(x, z);
    f.id = this.nextId++;
    f.x = x;
    f.z = z;
    f.y = Number.isFinite(y) ? y : 0;
    f.baseRadius = r;
    f.radius = r * 0.5;
    f.peak = peak;
    f.intensity = 0;
    f.age = 0;
    f.fuel = duration;
    f.duration = duration;
    f.suppress = 0;
    f.dousedAt = -1e9;
    f.sourceId = sourceId;
    f.sparkAt = this.ctx.clock.now + this.rng.range(0.4, 1.6);
    list.push(f);
    this.indexDirty = true;
    this.changes++;
    const events = this.ctx.events;
    // 'fire:started' lance la boucle sonore côté audio ; les flammes se dessinent d'après la liste des feux.
    // L'éclair d'embrasement (fx « feu ») est demandé par celui qui allume (objet, véhicule), pas ici.
    events.emit('fire:started', { x, z, targetKind: 'ground', targetId: 0, sourceId });
    events.emit('fx', { id: 'trace_brulure', x, y: f.y, z, size: r * 1.5 });
    return f;
  }

  /** Fait vivre les feux pendant dt (s). `rain` = pluie 0..1. */
  update(dt: number, rain: number): void {
    const list = this.list;
    if (list.length === 0) return;
    const now = this.ctx.clock.now;
    const burn = dt * (1 + 1.5 * rain);
    const damp = 1 - 0.35 * rain;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i]!;
      f.age += dt;
      f.fuel -= burn;
      if (f.fuel <= 0) {
        this.removeAt(i, 0);
        continue;
      }
      if (f.suppress > 0 && now - f.dousedAt > RECOVERY_DELAY) {
        f.suppress -= RECOVERY * dt;
        if (f.suppress < 0) f.suppress = 0;
      }
      const fadeTime = Math.min(8, 0.3 * f.duration);
      const fade = f.fuel < fadeTime ? f.fuel / fadeTime : 1;
      const flare = f.age < FLARE_SECONDS ? f.age / FLARE_SECONDS : 1;
      f.intensity = f.peak * flare * fade * (1 - f.suppress) * damp;
      f.radius = f.baseRadius * (0.55 + 0.45 * fade) * (0.5 + 0.5 * flare) * (1 - 0.3 * f.suppress);
      if (f.intensity > 0.3 && now >= f.sparkAt && now >= this.nextSparkAt) {
        const a = this.rng.next() * 6.283185307179586;
        const d = this.rng.next() * f.radius * 0.7;
        this.ctx.events.emit('fx', {
          id: 'etincelles', x: f.x + Math.cos(a) * d, y: f.y + 0.4, z: f.z + Math.sin(a) * d, size: 0.4 + f.intensity * 0.6,
        });
        f.sparkAt = now + this.rng.range(0.8, 2.4);
        this.nextSparkAt = now + SPARK_GAP;
      }
    }
  }

  /** Intensité du feu en un point, 0..1 (0 = pas de feu). */
  fireAt(x: number, z: number): number {
    if (this.list.length === 0) return 0;
    if (this.indexDirty) this.rebuildIndex();
    const key = blockKey(Math.floor(x / BUCKET), Math.floor(z / BUCKET));
    const bucket = key < 0 ? undefined : this.buckets.get(key);
    if (bucket === undefined) return 0;
    let best = 0;
    for (let i = 0; i < bucket.length; i++) {
      const f = bucket[i]!;
      const dx = x - f.x;
      const dz = z - f.z;
      const reach = f.radius * REACH;
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach) continue;
      const core = f.radius * CORE;
      let v = f.intensity;
      if (d2 > core * core) v *= 1 - (Math.sqrt(d2) - core) / (reach - core);
      if (v > best) best = v;
    }
    return best;
  }

  /**
   * Eau ou poudre dans un disque. `amount` : 1 ≈ une seconde de jet d'extincteur. Une nappe de
   * 1,25 m de rayon à pleine intensité demande `fireHeat` unités (3 par défaut) ; le besoin croît
   * comme la surface. Retourne le nombre de nappes atteintes.
   */
  douse(x: number, z: number, radius: number, amount: number): number {
    const list = this.list;
    let hit = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i]!;
      const dx = f.x - x;
      const dz = f.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const edge = f.baseRadius > 0.5 ? f.baseRadius : 0.5;
      if (d >= radius + edge) continue;
      // couverture : totale si le cœur de la nappe est dans le jet, partielle si seul le bord est touché
      const cover = d <= radius ? 1 : 1 - (d - radius) / edge;
      const size = f.baseRadius / REF_RADIUS;
      const heat = this.tuning.fireHeat * Math.max(0.4, size * size) * Math.max(0.3, f.peak);
      const dose = (amount * cover) / heat;
      hit++;
      if (this.onSteam !== null && f.intensity > 0.05) {
        this.onSteam(f.x, f.z, f.baseRadius + 1, Math.min(0.6, STEAM_PER_DOSE * dose) * f.intensity);
      }
      f.suppress += dose;
      f.dousedAt = this.ctx.clock.now;
      f.fuel -= dose * f.duration * 0.5; // le combustible mouillé ne brûlera plus
      if (f.suppress >= 1 || f.fuel <= 0) this.removeAt(i, 0);
      else {
        f.intensity *= Math.max(0, 1 - dose);
      }
    }
    return hit;
  }

  private dropWeakest(): void {
    const list = this.list;
    let worst = 0;
    for (let i = 1; i < list.length; i++) if (list[i]!.fuel < list[worst]!.fuel) worst = i;
    this.removeAt(worst, 0);
  }

  private removeAt(i: number, byId: EntityId): void {
    const list = this.list;
    const f = list[i]!;
    const last = list.pop()!;
    if (last !== f) list[i] = last;
    f.intensity = 0;
    this.pool.push(f);
    this.indexDirty = true;
    this.changes++;
    this.ctx.events.emit('fire:out', { x: f.x, z: f.z, targetKind: 'ground', targetId: 0, byId });
  }

  /** Reconstruit l'index spatial (cases de 16 m) : chaque feu est inscrit dans les cases qu'il peut toucher. */
  private rebuildIndex(): void {
    this.indexDirty = false;
    for (const bucket of this.buckets.values()) {
      truncate(bucket, 0);
      this.bucketPool.push(bucket);
    }
    this.buckets.clear();
    const list = this.list;
    for (let n = 0; n < list.length; n++) {
      const f = list[n]!;
      const reach = f.baseRadius * REACH;
      const i0 = Math.floor((f.x - reach) / BUCKET);
      const i1 = Math.floor((f.x + reach) / BUCKET);
      const j0 = Math.floor((f.z - reach) / BUCKET);
      const j1 = Math.floor((f.z + reach) / BUCKET);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const key = blockKey(i, j);
          if (key < 0) continue;
          let bucket = this.buckets.get(key);
          if (bucket === undefined) {
            bucket = this.bucketPool.length > 0 ? this.bucketPool.pop()! : [];
            this.buckets.set(key, bucket);
          }
          bucket.push(f);
        }
      }
    }
  }
}
