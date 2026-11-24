/* =====================================================================================
 * Effets visuels — file des événements d'effet.
 *
 * Les événements 'fx', 'explosion' et 'projectile:impact' arrivent pendant les pas de
 * simulation (parfois plusieurs dizaines dans la même image : salve de grenades). Ils sont
 * recopiés ici, sans allocation, puis joués une fois par image dans frame().
 * ===================================================================================== */

export const EV_EXPLOSION = 100;
export const EV_IMPACT = 101;

/** Code de chaque FxId du contrat (0 = inconnu : ignoré). */
export const FX_CODE: Readonly<Record<string, number>> = {
  gaz: 1, fumee: 2, feu: 3, etincelles: 4, explosion: 5, flash: 6, eclats_verre: 7, poussiere: 8, jet_eau: 9,
  eclaboussure: 10, traceur: 11, feu_artifice: 12, peinture: 13, debris: 14, poudre: 15, sang: 16, trace_brulure: 17,
  tag: 18, impact: 19,
};

export class FxEventQueue {
  readonly capacity: number;
  count = 0;
  dropped = 0;
  readonly type: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly size: Float32Array;
  readonly dx: Float32Array;
  readonly dy: Float32Array;
  readonly dz: Float32Array;
  readonly seconds: Float32Array;
  /** Couleur 0xRRGGBB, ou -1 si non précisée. */
  readonly color: Int32Array;
  /** Type de projectile ou d'explosion, et nature de l'obstacle touché. */
  readonly kind: string[];
  readonly hit: string[];

  constructor(capacity = 512) {
    this.capacity = capacity;
    this.type = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.dx = new Float32Array(capacity);
    this.dy = new Float32Array(capacity);
    this.dz = new Float32Array(capacity);
    this.seconds = new Float32Array(capacity);
    this.color = new Int32Array(capacity);
    this.kind = new Array<string>(capacity).fill('');
    this.hit = new Array<string>(capacity).fill('');
  }

  clear(): void {
    this.count = 0;
  }

  /** Ajoute un événement ; retourne false si la file est pleine (l'événement est compté comme abandonné). */
  push(
    type: number, x: number, y: number, z: number, size: number, dx: number, dy: number, dz: number,
    color: number, seconds: number, kind: string, hit: string,
  ): boolean {
    const i = this.count;
    if (i >= this.capacity) {
      this.dropped++;
      return false;
    }
    // coordonnées non finies : l'événement est ignoré (jamais d'exception dans un gestionnaire)
    if (!(x === x && y === y && z === z)) return false;
    this.type[i] = type;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.size[i] = size;
    this.dx[i] = dx; this.dy[i] = dy; this.dz[i] = dz;
    this.color[i] = color;
    this.seconds[i] = seconds;
    this.kind[i] = kind;
    this.hit[i] = hit;
    this.count = i + 1;
    return true;
  }
}
