/* =====================================================================================
 * DÉCOR DYNAMIQUE — assemblage interne : chaque partie du module reçoit cet objet et y trouve
 * les autres (références résolues à l'usage, pas à la construction).
 * ===================================================================================== */

import type { Barricades } from './barricades';
import type { Damage } from './damage';
import type { Fire } from './fire';
import type { Motion } from './motion';
import type { Kernel } from './shared';
import type { Shops } from './shops';
import type { Sweep } from './sweep';
import type { Store } from './store';
import type { Tiles } from './tiles';

export interface Mod {
  k: Kernel;
  store: Store;
  motion: Motion;
  fire: Fire;
  damage: Damage;
  shops: Shops;
  barricades: Barricades;
  tiles: Tiles;
  sweep: Sweep;
}
