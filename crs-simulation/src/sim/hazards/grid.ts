/* =====================================================================================
 * DANGERS DIFFUS — grille creuse : blocs de 16 × 16 cellules de 2 m, alloués à la demande.
 *
 * Seules les zones où il y a du gaz ou de la fumée ont des blocs. Un bloc libéré retourne dans une
 * réserve et ressert tel quel : en régime établi, plus aucune allocation. Chaque bloc connaît ses
 * quatre voisins (pointeurs tenus à jour à la création et à la libération), ce qui évite toute
 * recherche pendant le transport.
 * ===================================================================================== */

import { BLOCK_AREA, MAX_BLOCKS } from './config';
import { blockKey } from './statics';
import type { StaticBlock, StaticCache } from './statics';

export class Block {
  bx = 0;
  bz = 0;
  key = 0;
  /** Numéro d'ordre de création (étale les rafraîchissements, ordre déterministe). */
  serial = 0;
  /** Position dans FieldGrid.blocks. */
  index = -1;

  /** Concentration de lacrymogène par cellule. */
  readonly gas = new Float32Array(BLOCK_AREA);
  /** Densité de fumée et couleur prémultipliée (densité × composante 0..1). */
  readonly smoke = new Float32Array(BLOCK_AREA);
  readonly sr = new Float32Array(BLOCK_AREA);
  readonly sg = new Float32Array(BLOCK_AREA);
  readonly sb = new Float32Array(BLOCK_AREA);
  /** Variations accumulées pendant la passe de flux (remises à zéro par la passe d'application). */
  readonly dA = new Float32Array(BLOCK_AREA);
  readonly dR = new Float32Array(BLOCK_AREA);
  readonly dG = new Float32Array(BLOCK_AREA);
  readonly dB = new Float32Array(BLOCK_AREA);
  /**
   * Coefficients de transport par face : flux de la cellule k vers sa voisine est (pE) ou sud (pS)
   * = p × c[k] − q × c[voisine]. Une face fermée (bâti, bloc absent) a p = q = 0.
   */
  readonly pE = new Float32Array(BLOCK_AREA);
  readonly qE = new Float32Array(BLOCK_AREA);
  readonly pS = new Float32Array(BLOCK_AREA);
  readonly qS = new Float32Array(BLOCK_AREA);
  /** Facteur de conservation par sous-pas (dilution, envol au-dessus des façades), gaz et fumée. */
  readonly mG = new Float32Array(BLOCK_AREA);
  readonly mS = new Float32Array(BLOCK_AREA);

  /** Bâti et ouverture des rues (cache partagé). */
  st!: StaticBlock;
  w: Block | null = null;
  e: Block | null = null;
  n: Block | null = null;
  s: Block | null = null;

  /** Le bloc transporte de la fumée (sinon ses quatre canaux de fumée sont nuls et ignorés). */
  smokeOn = false;
  /** Coefficients à recalculer avant le prochain pas. */
  dirty = true;
  /** Maximum et somme des cellules, mis à jour par la passe d'application (et majorés à l'émission). */
  gasMax = 0;
  smokeMax = 0;
  gasSum = 0;
  smokeSum = 0;
  /** Dernier pas d'entretien où le bloc a servi (alimenté, ou voisin d'un bord chargé). */
  touched = 0;
  smokeTouched = 0;
}

export class FieldGrid {
  /** Blocs actifs (tableau dense, ordre de création sauf retraits par échange avec le dernier). */
  readonly blocks: Block[] = [];
  /** Compteur de pas d'entretien (horloge de l'inactivité des blocs). */
  step = 0;
  /** Nombre de blocs refusés parce que le plafond était atteint. */
  refused = 0;

  private readonly map = new Map<number, Block>();
  private readonly pool: Block[] = [];
  private serial = 0;
  /** Dernière recherche (résultat négatif compris) : les requêtes voisines évitent la table. */
  private lastKey = -2;
  private lastBlock: Block | null = null;

  constructor(private readonly statics: StaticCache) {}

  get pooled(): number {
    return this.pool.length;
  }

  /** Bloc d'indices (bx, bz), ou null s'il n'est pas alloué. */
  find(bx: number, bz: number): Block | null {
    const key = blockKey(bx, bz);
    if (key === this.lastKey) return this.lastBlock;
    const b = key < 0 ? undefined : this.map.get(key);
    this.lastKey = key;
    this.lastBlock = b === undefined ? null : b;
    return this.lastBlock;
  }

  /** Bloc d'indices (bx, bz), alloué au besoin. null hors limites ou si le plafond est atteint. */
  ensure(bx: number, bz: number): Block | null {
    const found = this.find(bx, bz);
    if (found !== null) return found;
    const key = blockKey(bx, bz);
    if (key < 0) return null;
    if (this.blocks.length >= MAX_BLOCKS) {
      this.refused++;
      return null;
    }
    const st = this.statics.acquire(bx, bz);
    if (st === null) return null;
    const b = this.pool.length > 0 ? this.pool.pop()! : new Block();
    b.bx = bx;
    b.bz = bz;
    b.key = key;
    b.serial = this.serial++;
    b.st = st;
    b.smokeOn = false;
    b.dirty = true;
    b.gasMax = 0;
    b.smokeMax = 0;
    b.gasSum = 0;
    b.smokeSum = 0;
    b.touched = this.step;
    b.smokeTouched = this.step;
    b.index = this.blocks.length;
    this.blocks.push(b);
    this.map.set(key, b);
    this.lastKey = key;
    this.lastBlock = b;
    // voisinage : liens dans les deux sens ; les voisins recalculeront leurs faces communes
    this.link(b, bx - 1, bz, 0);
    this.link(b, bx + 1, bz, 1);
    this.link(b, bx, bz - 1, 2);
    this.link(b, bx, bz + 1, 3);
    return b;
  }

  /** Libère un bloc : contenu effacé, liens défaits, retour en réserve. */
  release(b: Block): void {
    if (b.index < 0) return;
    const last = this.blocks.pop()!;
    if (last !== b) {
      this.blocks[b.index] = last;
      last.index = b.index;
    }
    b.index = -1;
    this.map.delete(b.key);
    this.lastKey = -2;
    this.lastBlock = null;
    if (b.w !== null) { b.w.e = null; b.w.dirty = true; b.w = null; }
    if (b.e !== null) { b.e.w = null; b.e.dirty = true; b.e = null; }
    if (b.n !== null) { b.n.s = null; b.n.dirty = true; b.n = null; }
    if (b.s !== null) { b.s.n = null; b.s.dirty = true; b.s = null; }
    this.statics.release(b.st);
    wipe(b);
    this.pool.push(b);
  }

  /** Libère tous les blocs (ils restent en réserve). */
  clear(): void {
    while (this.blocks.length > 0) this.release(this.blocks[this.blocks.length - 1]!);
    this.step = 0;
    this.serial = 0;
    this.refused = 0;
  }

  private link(b: Block, nbx: number, nbz: number, side: 0 | 1 | 2 | 3): void {
    const key = blockKey(nbx, nbz);
    const nb = key < 0 ? undefined : this.map.get(key);
    if (nb === undefined) return;
    nb.dirty = true;
    if (side === 0) { b.w = nb; nb.e = b; }
    else if (side === 1) { b.e = nb; nb.w = b; }
    else if (side === 2) { b.n = nb; nb.s = b; }
    else { b.s = nb; nb.n = b; }
  }
}

/** Remet à zéro tout le contenu transporté d'un bloc. */
export function wipe(b: Block): void {
  b.gas.fill(0);
  b.dA.fill(0);
  wipeSmoke(b);
  b.gasMax = 0;
  b.gasSum = 0;
}

/** Remet à zéro les canaux de fumée d'un bloc. */
export function wipeSmoke(b: Block): void {
  b.smoke.fill(0);
  b.sr.fill(0);
  b.sg.fill(0);
  b.sb.fill(0);
  b.dR.fill(0);
  b.dG.fill(0);
  b.dB.fill(0);
  b.smokeMax = 0;
  b.smokeSum = 0;
  b.smokeOn = false;
}
