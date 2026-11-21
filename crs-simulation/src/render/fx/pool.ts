/* =====================================================================================
 * Effets visuels — réserve de particules (logique pure, sans Three.js, testable sous Node).
 *
 * Structure en tableaux typés parallèles, de capacité fixe : aucune allocation après la
 * construction. Les particules vivantes occupent toujours les indices [0, count) ; une
 * particule morte est remplacée par la dernière (retrait par échange).
 * Quand la réserve est pleine, spawn() peut recycler une particule moins prioritaire et
 * presque éteinte : une explosion trouve toujours de la place, un panache lointain cède la sienne.
 * ===================================================================================== */

import { FxRandom } from './mathx';

/** Familles de rendu (voir le shader des particules). */
export const KIND_LIT = 0;    // volume éclairé : gaz, fumée, poussière, embruns
export const KIND_FLAME = 1;  // flamme procédurale animée
export const KIND_GLOW = 2;   // lumière additive : étincelles, éclairs, braises, étoiles
export const KIND_ALPHA = 3;  // matière opaque ou translucide : débris, verre, gouttes

/** Orientation du quad. */
export const MODE_BILLBOARD = 0; // face à la caméra
export const MODE_AXIS = 1;      // étiré le long d'un axe du monde (traits, jets, flammes dressées)
export const MODE_FLAT = 2;      // à plat sur le sol (onde, lueur)
export const MODE_STRETCH = 3;   // face à la caméra, allongé selon la projection d'un axe (volutes sous le vent)

/** Drapeaux de comportement. */
export const F_BOUNCE = 1;      // rebondit sur le sol puis s'immobilise
export const F_STREAK = 2;      // dessinée comme un trait étiré par la vitesse
export const F_FADE_IN = 4;     // apparition progressive (15 % de la vie)
export const F_FLASH = 8;       // extinction quadratique (éclair)
export const F_TURB = 16;       // tourbillonne (fumée)
export const F_FLOORFADE = 32;  // fondu au contact du sol (volumes)
export const F_HOLD = 64;       // opacité tenue, fondu sur le dernier quart
export const F_SHRINK = 128;    // la taille va de s0 à s1 linéairement (sinon : croissance rapide puis lente)

/** Priorités de recyclage. */
export const PRIO_LOW = 0;   // panaches, embruns continus
export const PRIO_MID = 1;   // étincelles, débris
export const PRIO_HIGH = 2;  // explosions, éclairs, bouquets

export const NO_FLOOR = -1e9;
const GRAVITY = 9.81;

/** Courbe d'opacité d'une particule à la fraction de vie t ∈ [0, 1]. */
export function alphaCurve(t: number, flags: number): number {
  if (t >= 1 || t < 0) return 0;
  let k: number;
  if (flags & F_FLASH) {
    const u = 1 - t;
    k = u * u;
  } else if (flags & F_HOLD) {
    k = t < 0.75 ? 1 : (1 - t) / 0.25;
  } else {
    k = 1 - t;
  }
  if (flags & F_FADE_IN && t < 0.15) k *= t / 0.15;
  return k;
}

/** Taille à la fraction de vie t : croissance rapide au début (bouffée qui se dilate), ou linéaire. */
export function sizeCurve(s0: number, s1: number, t: number, flags: number): number {
  if (flags & F_SHRINK) return s0 + (s1 - s0) * t;
  const u = 1 - t;
  return s0 + (s1 - s0) * (1 - u * u);
}

export class ParticlePool {
  readonly capacity: number;
  count = 0;
  /** Particules refusées faute de place (statistique). */
  dropped = 0;
  /** Particules recyclées avant leur fin de vie (statistique). */
  recycled = 0;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  /** Taille au début et à la fin de la vie (m). */
  readonly s0: Float32Array;
  readonly s1: Float32Array;
  readonly rot: Float32Array;
  readonly spin: Float32Array;
  /** Couleur linéaire (peut dépasser 1 pour les lumières) et opacité de base. */
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly a: Float32Array;
  /** Frottement de l'air (1/s). */
  readonly drag: Float32Array;
  /** Poids : 1 = chute libre, 0 = flotte, négatif = monte (air chaud). */
  readonly grav: Float32Array;
  /** Couplage au vent (1/s) : vitesse horizontale ramenée vers celle du vent. */
  readonly wind: Float32Array;
  /** Altitude du sol sous la particule (rebond, fondu). NO_FLOOR = sans sol. */
  readonly floorY: Float32Array;
  /** Durée d'étirement des traits (s) : longueur = vitesse × stretch. */
  readonly stretch: Float32Array;
  /** Graine propre (phase d'animation). */
  readonly seed: Float32Array;
  readonly tile: Uint8Array;
  readonly kind: Uint8Array;
  readonly flags: Uint8Array;
  readonly prio: Uint8Array;

  private readonly rng: FxRandom;

  constructor(capacity: number, seed = 0x51f15e) {
    const n = Math.max(1, capacity | 0);
    this.capacity = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.wind = new Float32Array(n);
    this.floorY = new Float32Array(n);
    this.stretch = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.tile = new Uint8Array(n);
    this.kind = new Uint8Array(n);
    this.flags = new Uint8Array(n);
    this.prio = new Uint8Array(n);
    this.rng = new FxRandom(seed);
  }

  /** Place restante avant recyclage. */
  get free(): number {
    return this.capacity - this.count;
  }

  /** Taux de remplissage 0..1 : les émetteurs continus s'en servent pour se modérer. */
  get load(): number {
    return this.count / this.capacity;
  }

  clear(): void {
    this.count = 0;
  }

  /**
   * Réserve une particule et la remet aux valeurs par défaut. Retourne son indice, ou -1 si la
   * réserve est pleine et qu'aucune particule moins prioritaire n'a pu être recyclée.
   * L'indice n'est valable que jusqu'au prochain update() (les particules sont compactées).
   */
  spawn(prio: number = PRIO_LOW): number {
    let i: number;
    if (this.count < this.capacity) {
      i = this.count++;
    } else {
      i = this.findVictim(prio);
      if (i < 0) {
        this.dropped++;
        return -1;
      }
      this.recycled++;
    }
    this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
    this.age[i] = 0;
    this.life[i] = 1;
    this.s0[i] = 1; this.s1[i] = 1;
    this.rot[i] = 0; this.spin[i] = 0;
    this.r[i] = 1; this.g[i] = 1; this.b[i] = 1; this.a[i] = 1;
    this.drag[i] = 0; this.grav[i] = 0; this.wind[i] = 0;
    this.floorY[i] = NO_FLOOR;
    this.stretch[i] = 0;
    this.seed[i] = this.rng.next();
    this.tile[i] = 0;
    this.kind[i] = KIND_LIT;
    this.flags[i] = 0;
    this.prio[i] = prio;
    return i;
  }

  /** Cherche, parmi quelques particules tirées au hasard, la moins prioritaire et la plus proche de sa fin. */
  private findVictim(prio: number): number {
    let best = -1;
    let bestScore = -1;
    const n = this.count;
    for (let k = 0; k < 8; k++) {
      const j = this.rng.int(n);
      const pj = this.prio[j]!;
      if (pj > prio) continue;
      // une particule de même priorité n'est recyclée qu'en fin de vie
      const t = this.age[j]! / this.life[j]!;
      if (pj === prio && t < 0.6) continue;
      const score = (prio - pj) * 2 + t;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    return best;
  }

  /** Retire la particule i (la dernière prend sa place). */
  kill(i: number): void {
    const last = --this.count;
    if (i === last || last < 0) return;
    this.x[i] = this.x[last]!; this.y[i] = this.y[last]!; this.z[i] = this.z[last]!;
    this.vx[i] = this.vx[last]!; this.vy[i] = this.vy[last]!; this.vz[i] = this.vz[last]!;
    this.age[i] = this.age[last]!; this.life[i] = this.life[last]!;
    this.s0[i] = this.s0[last]!; this.s1[i] = this.s1[last]!;
    this.rot[i] = this.rot[last]!; this.spin[i] = this.spin[last]!;
    this.r[i] = this.r[last]!; this.g[i] = this.g[last]!; this.b[i] = this.b[last]!; this.a[i] = this.a[last]!;
    this.drag[i] = this.drag[last]!; this.grav[i] = this.grav[last]!; this.wind[i] = this.wind[last]!;
    this.floorY[i] = this.floorY[last]!;
    this.stretch[i] = this.stretch[last]!;
    this.seed[i] = this.seed[last]!;
    this.tile[i] = this.tile[last]!; this.kind[i] = this.kind[last]!;
    this.flags[i] = this.flags[last]!; this.prio[i] = this.prio[last]!;
  }

  /**
   * Avance toutes les particules de dt secondes. `windX`, `windZ` : dérive de l'air (m/s).
   * Retourne le nombre de particules vivantes.
   */
  update(dt: number, windX: number, windZ: number): number {
    if (!(dt > 0)) return this.count;
    const { x, y, z, vx, vy, vz, age, life, rot, spin, drag, grav, wind, floorY, seed, flags } = this;
    let i = 0;
    while (i < this.count) {
      const a = age[i]! + dt;
      if (a >= life[i]!) {
        this.kill(i);
        continue;
      }
      age[i] = a;
      const f = flags[i]!;
      let ux = vx[i]!;
      let uy = vy[i]!;
      let uz = vz[i]!;
      const d = drag[i]!;
      if (d > 0) {
        const k = 1 - d * dt;
        const kk = k > 0 ? k : 0;
        ux *= kk; uy *= kk; uz *= kk;
      }
      const w = wind[i]!;
      if (w > 0) {
        const k = w * dt < 1 ? w * dt : 1;
        ux += (windX - ux) * k;
        uz += (windZ - uz) * k;
      }
      uy -= GRAVITY * grav[i]! * dt;
      if (f & F_TURB) {
        // tourbillon lent propre à chaque particule (deux sinusoïdes déphasées)
        const s = seed[i]! * 61.7;
        const amp = 0.9 * dt;
        ux += Math.sin(s + a * 1.9) * amp;
        uz += Math.cos(s * 1.3 + a * 1.6) * amp;
      }
      let ny = y[i]! + uy * dt;
      if (f & F_BOUNCE) {
        const fl = floorY[i]! + 0.03;
        if (ny < fl && uy < 0) {
          ny = fl;
          uy = -uy * 0.32;
          ux *= 0.55;
          uz *= 0.55;
          spin[i] = spin[i]! * 0.5;
          if (uy < 0.45) {
            // immobilisée au sol
            uy = 0; ux = 0; uz = 0;
            grav[i] = 0;
            spin[i] = 0;
          }
        }
      }
      x[i] = x[i]! + ux * dt;
      y[i] = ny;
      z[i] = z[i]! + uz * dt;
      vx[i] = ux; vy[i] = uy; vz[i] = uz;
      rot[i] = rot[i]! + spin[i]! * dt;
      i++;
    }
    return this.count;
  }
}

/**
 * Tri par profondeur, du plus loin au plus proche (tri par comptage stable, sans allocation).
 * `depth[i]` : distance à la caméra le long de l'axe de visée (≥ 0). Écrit dans `order` les
 * indices triés et retourne n. `counts` doit avoir au moins `buckets + 1` cases.
 */
export function sortFarToNear(
  depth: Float32Array, n: number, maxDepth: number, order: Uint32Array, counts: Uint32Array, buckets: number,
): number {
  const B = buckets;
  for (let b = 0; b <= B; b++) counts[b] = 0;
  const inv = maxDepth > 0 ? 1 / maxDepth : 0;
  // racine carrée : plus de résolution près de la caméra, là où l'ordre se voit
  for (let i = 0; i < n; i++) {
    let t = depth[i]! * inv;
    if (!(t > 0)) t = 0;
    else if (t > 1) t = 1;
    const b = (Math.sqrt(t) * (B - 1)) | 0;
    counts[b] = counts[b]! + 1;
  }
  // positions de départ : le seau le plus lointain d'abord
  let start = 0;
  for (let b = B - 1; b >= 0; b--) {
    const c = counts[b]!;
    counts[b] = start;
    start += c;
  }
  for (let i = 0; i < n; i++) {
    let t = depth[i]! * inv;
    if (!(t > 0)) t = 0;
    else if (t > 1) t = 1;
    const b = (Math.sqrt(t) * (B - 1)) | 0;
    const at = counts[b]!;
    order[at] = i;
    counts[b] = at + 1;
  }
  return n;
}
