/* =====================================================================================
 * Entrées — détection des fronts (pressed / released) pour deux « vues » indépendantes.
 *
 * Problème : le moteur appelle update() 0, 1 ou plusieurs fois par image puis frame() une fois,
 * alors que les événements du clavier, de la souris et des doigts arrivent n'importe quand.
 *   - Un système de simulation qui lit pressed('interact') dans update() doit voir chaque appui
 *     exactement dans UN pas, même s'il y a 3 pas dans l'image ou aucun pendant 4 images.
 *   - L'interface qui lit pressed('pause') dans frame() doit le voir dans UNE image, y compris
 *     en pause (update() n'est alors plus appelé).
 *
 * Solution : deux vues (VIEW_SIM, VIEW_FRAME). Chaque transition physique est notée « en
 * attente » dans les deux ; chaque vue les consomme à son propre verrouillage (latch) :
 * au début de chaque pas pour la simulation, au début de chaque image pour la présentation.
 *
 * Garanties d'une vue :
 *   - au plus une transition par verrouillage ; pressed et released ne sont jamais vrais ensemble ;
 *   - un appui bref (enfoncé puis relâché entre deux verrouillages) n'est jamais perdu : il donne
 *     un verrouillage avec pressed = down = true, puis au suivant released = true ;
 *   - l'état converge toujours vers l'état physique (jamais de bouton « collé ») ;
 *   - sync() recale la vue sur l'état physique SANS produire de front (sortie de pause : ce qui
 *     s'est passé dans les menus ne fuit pas dans le jeu).
 *
 * Plusieurs sources (clavier/souris, manette, tactile, script) peuvent tenir le même bouton :
 * il est enfoncé tant qu'au moins une source le tient (masque de bits par bouton).
 * Aucune allocation après la construction.
 * ===================================================================================== */

export const VIEW_SIM = 0;
export const VIEW_FRAME = 1;
export type ViewId = typeof VIEW_SIM | typeof VIEW_FRAME;

/** Nombre maximal de sources (bits du masque). */
export const MAX_SOURCES = 8;

export class ButtonLatch {
  readonly count: number;
  /** Masque des sources qui tiennent chaque bouton (0 = relâché). */
  private readonly mask: Uint8Array;
  private readonly pendPress: [Uint8Array, Uint8Array];
  private readonly pendRelease: [Uint8Array, Uint8Array];
  private readonly vDown: [Uint8Array, Uint8Array];
  private readonly vPressed: [Uint8Array, Uint8Array];
  private readonly vReleased: [Uint8Array, Uint8Array];

  constructor(count: number) {
    this.count = count;
    this.mask = new Uint8Array(count);
    this.pendPress = [new Uint8Array(count), new Uint8Array(count)];
    this.pendRelease = [new Uint8Array(count), new Uint8Array(count)];
    this.vDown = [new Uint8Array(count), new Uint8Array(count)];
    this.vPressed = [new Uint8Array(count), new Uint8Array(count)];
    this.vReleased = [new Uint8Array(count), new Uint8Array(count)];
  }

  /** Une source enfonce ou relâche un bouton. Sans effet si l'état de cette source ne change pas. */
  set(source: number, index: number, down: boolean): void {
    if (index < 0 || index >= this.count) return;
    const bit = 1 << source;
    const before = this.mask[index]!;
    const after = down ? before | bit : before & ~bit;
    if (after === before) return;
    this.mask[index] = after;
    if (before === 0) {
      this.pendPress[0][index] = 1;
      this.pendPress[1][index] = 1;
    } else if (after === 0) {
      this.pendRelease[0][index] = 1;
      this.pendRelease[1][index] = 1;
    }
  }

  /** Appui bref : enfoncé puis relâché aussitôt (molette, perte du verrouillage de la souris…). */
  pulse(source: number, index: number): void {
    if (index < 0 || index >= this.count) return;
    if ((this.mask[index]! & (1 << source)) !== 0) return; // déjà tenu par cette source
    this.set(source, index, true);
    this.set(source, index, false);
  }

  /** Relâche tout ce que tient une source (perte de focus, manette débranchée). */
  releaseSource(source: number): void {
    const bit = 1 << source;
    for (let i = 0; i < this.count; i++) {
      if ((this.mask[i]! & bit) !== 0) this.set(source, i, false);
    }
  }

  /** La source tient-elle ce bouton ? */
  heldBy(source: number, index: number): boolean {
    return index >= 0 && index < this.count && (this.mask[index]! & (1 << source)) !== 0;
  }

  /** État physique fusionné (toutes sources), sans passer par une vue. */
  rawDown(index: number): boolean {
    return index >= 0 && index < this.count && this.mask[index] !== 0;
  }

  /** Consomme les transitions en attente de la vue : à appeler une fois par pas (ou par image). */
  latch(view: ViewId): void {
    const mask = this.mask;
    const pp = this.pendPress[view];
    const pr = this.pendRelease[view];
    const d = this.vDown[view];
    const p = this.vPressed[view];
    const r = this.vReleased[view];
    for (let i = 0; i < this.count; i++) {
      const raw = mask[i] !== 0;
      if (d[i] === 0) {
        if (pp[i] === 1 || raw) {
          d[i] = 1;
          p[i] = 1;
          // un relâchement en attente reste dû : il sera servi au verrouillage suivant
        } else {
          p[i] = 0;
          pr[i] = 0;
        }
        pp[i] = 0;
        r[i] = 0;
      } else {
        if (pr[i] === 1 || !raw) {
          d[i] = 0;
          r[i] = 1;
          // un nouvel appui en attente reste dû
        } else {
          r[i] = 0;
          pp[i] = 0;
        }
        pr[i] = 0;
        p[i] = 0;
      }
    }
  }

  /** Recale la vue sur l'état physique sans produire de front et oublie ce qui était en attente. */
  sync(view: ViewId): void {
    const mask = this.mask;
    const d = this.vDown[view];
    this.pendPress[view].fill(0);
    this.pendRelease[view].fill(0);
    this.vPressed[view].fill(0);
    this.vReleased[view].fill(0);
    for (let i = 0; i < this.count; i++) d[i] = mask[i] !== 0 ? 1 : 0;
  }

  down(view: ViewId, index: number): boolean {
    return this.vDown[view][index] === 1;
  }

  pressed(view: ViewId, index: number): boolean {
    return this.vPressed[view][index] === 1;
  }

  released(view: ViewId, index: number): boolean {
    return this.vReleased[view][index] === 1;
  }

  /** Tout relâcher et tout oublier (nouvelle session). */
  clear(): void {
    this.mask.fill(0);
    for (let v = 0; v < 2; v++) {
      this.pendPress[v]!.fill(0);
      this.pendRelease[v]!.fill(0);
      this.vDown[v]!.fill(0);
      this.vPressed[v]!.fill(0);
      this.vReleased[v]!.fill(0);
    }
  }
}

/**
 * Accumulateur à deux vues pour les grandeurs « par image » (rotation du regard, molette) :
 * ce qui arrive entre deux verrouillages est additionné, puis rendu une seule fois à chaque vue.
 * Les sources écrivent directement dans `pending` (pending[canal] += valeur) : passer un nombre
 * flottant en argument d'une fonction coûterait une allocation au moteur JavaScript à chaque appel.
 */
export class DeltaLatch {
  /** Apports pas encore répartis entre les vues : un nombre par canal. */
  readonly pending: Float64Array;
  private readonly acc: Float64Array;
  private readonly out: Float64Array;
  readonly channels: number;

  constructor(channels: number) {
    this.channels = channels;
    this.pending = new Float64Array(channels);
    this.acc = new Float64Array(channels * 2);
    this.out = new Float64Array(channels * 2);
  }

  add(channel: number, amount: number): void {
    if (amount !== amount) return;
    this.pending[channel] += amount;
  }

  /** Crédite aux deux vues ce que les sources ont déposé. */
  private absorb(): void {
    const n = this.channels;
    const p = this.pending;
    const a = this.acc;
    for (let c = 0; c < n; c++) {
      const v = p[c]!;
      if (v !== 0) {
        if (v === v) {
          a[c] += v;
          a[n + c] += v;
        }
        p[c] = 0;
      }
    }
  }

  latch(view: ViewId): void {
    this.absorb();
    const o = view * this.channels;
    for (let c = 0; c < this.channels; c++) {
      this.out[o + c] = this.acc[o + c]!;
      this.acc[o + c] = 0;
    }
  }

  /** Oublie ce qui était en attente pour cette vue (sortie de pause : pas de saut de caméra). */
  flush(view: ViewId): void {
    this.absorb();
    const o = view * this.channels;
    for (let c = 0; c < this.channels; c++) {
      this.out[o + c] = 0;
      this.acc[o + c] = 0;
    }
  }

  get(view: ViewId, channel: number): number {
    return this.out[view * this.channels + channel]!;
  }

  clear(): void {
    this.pending.fill(0);
    this.acc.fill(0);
    this.out.fill(0);
  }
}
