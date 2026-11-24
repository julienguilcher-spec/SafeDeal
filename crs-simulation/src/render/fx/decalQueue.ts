/* =====================================================================================
 * Effets visuels — file des décalques persistants (logique pure, testable sous Node).
 *
 * Anneau de capacité fixe : un nouveau décalque prend la place du plus ancien. Pour que
 * cette disparition ne se voie pas, les plus anciens pâlissent à mesure qu'ils approchent
 * de la sortie (les derniers 15 % de l'anneau). Certains décalques ont en plus une durée de
 * vie (flaque qui sèche). Un décalque voisin du même type est agrandi plutôt que doublé.
 * ===================================================================================== */

/** Modes de rendu d'un décalque. */
export const DECAL_ALPHA = 0;     // matière posée (brûlure, verre, peinture)
export const DECAL_ADD = 1;       // lumière posée (lueur d'un feu au sol)
export const DECAL_PUDDLE = 2;    // flaque : assombrit et reflète le ciel

/** Part de l'anneau, côté sortie, sur laquelle les décalques pâlissent. */
export const DECAL_FADE_SHARE = 0.15;

export class DecalQueue {
  readonly capacity: number;
  /** Nombre de cases occupées (≤ capacity). */
  count = 0;
  /** Compteur d'ajouts : sert à ordonner les décalques (rang d'ancienneté). */
  serialCounter = 0;
  /** Incrémenté à chaque changement (ajout, fusion, effacement). */
  revision = 0;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  /** Normale de la surface (sol : 0, 1, 0). */
  readonly nx: Float32Array;
  readonly ny: Float32Array;
  readonly nz: Float32Array;
  readonly size: Float32Array;
  readonly rot: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly a: Float32Array;
  /** Instant de pose (s) et durée de vie (s ; Infinity = permanent). */
  readonly born: Float64Array;
  readonly life: Float32Array;
  readonly serial: Uint32Array;
  readonly tile: Uint8Array;
  readonly mode: Uint8Array;

  private head = 0;

  constructor(capacity: number) {
    const n = Math.max(1, capacity | 0);
    this.capacity = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.nx = new Float32Array(n);
    this.ny = new Float32Array(n);
    this.nz = new Float32Array(n);
    this.size = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a = new Float32Array(n);
    this.born = new Float64Array(n);
    this.life = new Float32Array(n);
    this.serial = new Uint32Array(n);
    this.tile = new Uint8Array(n);
    this.mode = new Uint8Array(n);
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    this.serialCounter = 0;
    this.revision++;
  }

  /** Ajoute un décalque (remplace le plus ancien si l'anneau est plein). Retourne son indice. */
  add(
    tile: number, mode: number, x: number, y: number, z: number, nx: number, ny: number, nz: number,
    size: number, rot: number, r: number, g: number, b: number, a: number, now: number, life = Infinity,
  ): number {
    const i = this.head;
    this.head = (i + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    this.tile[i] = tile;
    this.mode[i] = mode;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.nx[i] = nx; this.ny[i] = ny; this.nz[i] = nz;
    this.size[i] = size;
    this.rot[i] = rot;
    this.r[i] = r; this.g[i] = g; this.b[i] = b; this.a[i] = a;
    this.born[i] = now;
    this.life[i] = life;
    this.serial[i] = ++this.serialCounter;
    this.revision++;
    return i;
  }

  /**
   * Décalque vivant du même type le plus proche dans un rayon, parmi les `lookback` plus récents.
   * Retourne son indice ou -1.
   */
  findNear(tile: number, x: number, y: number, z: number, radius: number, now: number, lookback = 40): number {
    const n = this.count < lookback ? this.count : lookback;
    const cap = this.capacity;
    let best = -1;
    let bestD = radius * radius;
    for (let k = 1; k <= n; k++) {
      const i = (this.head - k + cap * 2) % cap;
      if (this.tile[i] !== tile) continue;
      if (now - this.born[i]! >= this.life[i]!) continue;
      const dx = this.x[i]! - x;
      const dy = this.y[i]! - y;
      const dz = this.z[i]! - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * Agrandit et rafraîchit un décalque existant (fusion) : taille portée vers `size` sans dépasser
   * `maxSize`, opacité portée vers `a`, vie relancée.
   */
  refresh(i: number, size: number, maxSize: number, a: number, now: number): void {
    const s = this.size[i]!;
    const grown = s + (size > s ? (size - s) * 0.5 : size * 0.06);
    this.size[i] = grown > maxSize ? (s > maxSize ? s : maxSize) : grown;
    if (a > this.a[i]!) this.a[i] = a;
    this.born[i] = now;
    this.revision++;
  }

  /** Rang d'ancienneté : 0 = le plus récent, capacity − 1 = le prochain à disparaître. */
  rankOf(i: number): number {
    return this.serialCounter - this.serial[i]!;
  }

  /** Multiplicateur d'opacité 0..1 : ancienneté dans l'anneau et durée de vie. 0 = à ne pas dessiner. */
  fade(i: number, now: number): number {
    const cap = this.capacity;
    const rank = this.serialCounter - this.serial[i]!;
    if (rank >= cap) return 0;
    const span = Math.max(1, cap * DECAL_FADE_SHARE);
    let f = (cap - rank) / span;
    if (f > 1) f = 1;
    const life = this.life[i]!;
    if (life !== Infinity) {
      const k = (now - this.born[i]!) / life;
      if (k >= 1) return 0;
      // fondu sur le dernier tiers de la vie
      if (k > 0.66) f *= (1 - k) / 0.34;
    }
    return f;
  }
}
