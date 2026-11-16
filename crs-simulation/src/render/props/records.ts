/* RENDU DU DÉCOR — fiches de suivi : un objet, une vitrine, un morceau de 128 m. */

import type { EntityId, Prop, Shop } from '@/core/contracts';
import type { Region } from './atlas-layout';
import { CHUNK_SIZE } from './mapping';
import type { KindInfo } from './mapping';
import type { PartLike } from './placement';
import type { ShopState } from './shopfront';
import type { ShopStyle } from './signtext';
import type { SlotMesh } from './slotmesh';

/** Emplacement réservé dans le tampon d'un morceau (v0 < 0 : absent). */
export interface Slot {
  v0: number;
  vCap: number;
  i0: number;
  iCap: number;
}

/** Position d'une lanterne candidate à une vraie lumière. */
export interface LampSpot { x: number; y: number; z: number; cd: number }

export class PropRec implements Slot {
  chunk: Chunk | null = null;
  /** Rang dans chunk.props, dans la liste du moteur, dans la liste des objets en mouvement. */
  ci = -1;
  li = -1;
  di = -1;
  v0 = -1;
  vCap = 0;
  i0 = -1;
  iCap = 0;
  sig = -1;
  x = NaN;
  y = 0;
  z = 0;
  heading = 0;
  hX = 0;
  hZ = 0;
  height = 0;
  panes = 0;
  /** Redessiné à chaque image tant qu'il bouge (lot dynamique). */
  dynamic = false;
  lastMove = 0;
  queued = false;
  readonly halos: number[] = [];
  lamp: LampSpot | null = null;
  lampIndex = -1;
  /** Éléments d'une barricade. */
  parts: readonly PartLike[] | null = null;

  constructor(
    readonly prop: Prop, readonly id: EntityId, readonly kind: string, readonly info: KindInfo, readonly skin: number,
    readonly seed: number, readonly barricade: boolean, readonly scaled: boolean, readonly mayGlass: boolean,
    /** Phase (0..255) des feux tricolores et du vacillement. */
    readonly phase: number,
  ) {}
}

export class ShopRec implements Slot {
  chunk: Chunk | null = null;
  ci = -1;
  li = -1;
  /** Rang dans la liste des rideaux en mouvement (-1 : immobile). */
  ai = -1;
  animUntil = 0;
  v0 = -1;
  vCap = 0;
  i0 = -1;
  iCap = 0;
  sig = -1;
  queued = false;
  signHeld = false;
  sign: Region | null = null;
  wasBurning = false;
  readonly halos: number[] = [];
  readonly state: ShopState = {
    window: 'intact', shutter: 0, stock: 1, burning: 0, forced: false, burnt: false, boards: false, tags: 0, hasShutter: true,
  };

  constructor(readonly shop: Shop, readonly id: EntityId, readonly style: ShopStyle, readonly seed: number) {}
}

export class Chunk {
  readonly ox: number;
  readonly oz: number;
  readonly props: PropRec[] = [];
  readonly shops: ShopRec[] = [];
  mesh: SlotMesh | null = null;
  /** Niveau construit (-1 : rien) et niveau voulu. */
  level = -1;
  want = -1;
  /** Reconstruction complète demandée (débordement, trop de trous). */
  dirty = false;
  /** Sommets abandonnés par des réécritures hors place. */
  holes = 0;
  dist = 0;
  /** Altitude moyenne du sol du morceau (pour la distance et la sphère englobante). */
  groundY = 0;

  constructor(readonly key: number, readonly cx: number, readonly cz: number) {
    this.ox = cx * CHUNK_SIZE;
    this.oz = cz * CHUNK_SIZE;
  }
}
