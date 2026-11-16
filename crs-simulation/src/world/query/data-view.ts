/* =====================================================================================
 * Service 'world.data' : données de carte décodées, pour le rendu de la ville. L'objet est
 * stable ; ses champs suivent le jeu de données courant (Paris ou quartier d'essai).
 * ===================================================================================== */

import type { Landmark, Manifest, Place, RoadGraph, Terrain, Tile } from '../mapdata';
import type { WorldData } from './api';
import type { WorldBase } from './base';

/** Service 'world.data' : vue stable sur le jeu de données courant. */
export class WorldDataView implements WorldData {
  private readonly current: () => WorldBase;

  constructor(current: () => WorldBase) {
    this.current = current;
  }

  get manifest(): Manifest {
    return this.current().manifest;
  }

  get roadGraph(): RoadGraph {
    return this.current().decoded.roadGraph;
  }

  get places(): readonly Place[] {
    return this.current().decoded.places;
  }

  get landmarks(): readonly Landmark[] {
    return this.current().decoded.landmarks;
  }

  get terrain(): Terrain {
    return this.current().terrain;
  }

  tile(tx: number, tz: number): Tile | null {
    const e = this.current().store.entry(tx, tz);
    return e !== null && e.state === 'loaded' ? e.tile : null;
  }

  loadedKeys(): readonly string[] {
    return this.current().store.loadedKeys();
  }
}
