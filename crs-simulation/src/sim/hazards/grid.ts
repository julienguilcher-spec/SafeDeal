/* =====================================================================================
 * DANGERS DIFFUS — grille creuse : blocs de 16 × 16 cellules de 2 m, alloués à la demande.
 *
 * Seules les zones où il y a du gaz ou de la fumée ont des blocs. Un bloc libéré retourne dans une
 * réserve et ressert tel quel : en régime établi, plus aucune allocation. Chaque bloc connaît ses
 * quatre voisins (pointeurs tenus à jour à la création et à la libération), ce qui évite toute
 * recherche pendant le transport.
 * ===================================================================================== */

import * as cfg from './config';
import { blockKey as staticBlockKey } from './statics';
import type { StaticBlock, StaticCache } from './statics';

// Copies locales (voir sampling.ts).
const BLOCK_AREA = cfg.BLOCK_AREA;
const BLOCK_MASK = cfg.BLOCK_MASK;
const BLOCK_SHIFT = cfg.BLOCK_SHIFT;
const MAX_BLOCKS = cfg.MAX_BLOCKS;
const blockKey = staticBlockKey;
/** Taille de la table de hachage : puissance de deux, au moins le double du plafond de blocs. */
const TABLE_BITS = 11;
const TABLE_SIZE = 1 << TABLE_BITS;
const TABLE_MASK = TABLE_SIZE - 1;
const TABLE_SHIFT = 32 - TABLE_BITS;
const EMPTY = -1;
if (TABLE_SIZE < MAX_BLOCKS * 2) throw new Error('[hazards] table de blocs trop petite pour MAX_BLOCKS');

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

  /**
   * Table de hachage à adressage ouvert (sondage linéaire) : clé de bloc → bloc. Deux fois plus rapide
   * qu'une Map pour les lectures dispersées (gasAt de centaines de personnes par pas), sans allocation.
   */
  private readonly keys = new Int32Array(TABLE_SIZE).fill(EMPTY);
  private readonly slots: (Block | null)[] = new Array<Block | null>(TABLE_SIZE).fill(null);
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
    const b = key < 0 ? null : this.lookup(key);
    this.lastKey = key;
    this.lastBlock = b;
    return b;
  }

  /**
   * La cellule d'indices globaux (ci, cj) est-elle libre (non bâtie) ? Répond aussi là où aucun bloc
   * n'est alloué (lecture du cache de bâti), ce qui évite d'allouer un bloc au cœur d'un immeuble.
   */
  isFree(ci: number, cj: number): boolean {
    const bx = ci >> BLOCK_SHIFT;
    const bz = cj >> BLOCK_SHIFT;
    const b = this.find(bx, bz);
    const st = b !== null ? b.st : this.statics.peek(bx, bz);
    if (st === null) return false;
    return st.solid === null || st.solid[((cj & BLOCK_MASK) << BLOCK_SHIFT) | (ci & BLOCK_MASK)] === 0;
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
    this.insert(key, b);
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
    this.remove(b.key);
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
    const nb = key < 0 ? null : this.lookup(key);
    if (nb === null) return;
    nb.dirty = true;
    if (side === 0) { b.w = nb; nb.e = b; }
    else if (side === 1) { b.e = nb; nb.w = b; }
    else if (side === 2) { b.n = nb; nb.s = b; }
    else { b.s = nb; nb.n = b; }
  }

  // ───────────────────────────── table de hachage ─────────────────────────────

  private lookup(key: number): Block | null {
    const keys = this.keys;
    let i = hashOf(key);
    for (;;) {
      const k = keys[i]!;
      if (k === key) return this.slots[i]!;
      if (k === EMPTY) return null;
      i = (i + 1) & TABLE_MASK;
    }
  }

  private insert(key: number, b: Block): void {
    const keys = this.keys;
    let i = hashOf(key);
    while (keys[i] !== EMPTY) i = (i + 1) & TABLE_MASK;
    keys[i] = key;
    this.slots[i] = b;
  }

  /** Retrait avec recul des suivants (pas de pierre tombale : les chaînes de sondage restent courtes). */
  private remove(key: number): void {
    const keys = this.keys;
    const slots = this.slots;
    let i = hashOf(key);
    while (keys[i] !== key) {
      if (keys[i] === EMPTY) return;
      i = (i + 1) & TABLE_MASK;
    }
    let j = i;
    for (;;) {
      j = (j + 1) & TABLE_MASK;
      const kj = keys[j]!;
      if (kj === EMPTY) break;
      const home = hashOf(kj);
      // l'élément j peut-il reculer en i ? Oui si sa case d'origine n'est pas dans l'intervalle cyclique ]i, j].
      if (i <= j ? home > i && home <= j : home > i || home <= j) continue;
      keys[i] = kj;
      slots[i] = slots[j]!;
      i = j;
    }
    keys[i] = EMPTY;
    slots[i] = null;
  }
}

/** Case d'origine d'une clé (hachage multiplicatif de Fibonacci, bits de poids fort). */
function hashOf(key: number): number {
  return Math.imul(key, 0x9e3779b1) >>> TABLE_SHIFT;
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
