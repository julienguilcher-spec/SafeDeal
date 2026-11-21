/* =====================================================================================
 * Droit — la foule a-t-elle une issue ?
 *
 * Le délit de maintien dans un attroupement suppose que la personne ait eu « le temps et la
 * possibilité matérielle de partir » (docs/research/01-doctrine-cadre-legal.md §1.6 ; relaxe d'une
 * personne prise dans un quadrillage policier). Une foule encerclée ne commet donc rien en restant,
 * et la disperser par la force n'a pas de sens.
 *
 * Méthode : depuis le centre de la foule, 32 rayons de 30 m. Un rayon est libre s'il n'est coupé
 * ni par le bâti, ni par un obstacle du mobilier (barrières), ni par un cordon de forces de l'ordre
 * (trois agents au moins à moins de 3,5 m d'un point du rayon), et s'il aboutit sur un sol
 * praticable. Deux rayons voisins libres valent une issue d'environ 6 m de large (bible A.3.13).
 * Appelé toutes les deux secondes au plus : son coût est négligeable.
 * ===================================================================================== */

import type { Person, RayHit } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import type { Kernel } from './kernel';

const RAYS = 32;
const RAY_LENGTH = 30;
/** Premier point examiné le long du rayon, et pas entre deux points (m). */
const SAMPLE_FROM = 6;
const SAMPLE_STEP = 4;
/** Cordon : nombre d'agents dans le rayon donné autour d'un point (m). */
const CORDON_COUNT = 3;
const CORDON_RADIUS = 3.5;

const DIR_X = new Float64Array(RAYS);
const DIR_Z = new Float64Array(RAYS);
for (let i = 0; i < RAYS; i++) {
  const a = (i / RAYS) * Math.PI * 2;
  DIR_X[i] = Math.sin(a);
  DIR_Z[i] = Math.cos(a);
}

export class Exits {
  private readonly hit: RayHit = makeRayHit();
  private readonly free = new Uint8Array(RAYS);

  constructor(private readonly k: Kernel) {}

  private readonly standingOfficer = (p: Person): boolean =>
    p.faction === 'police' && p.posture !== 'down' && p.health > 0 && p.vehicleId === 0;

  /** Existe-t-il une issue libre d'au moins 6 m autour du point (cx, cz) ? */
  open(cx: number, cz: number): boolean {
    const ctx = this.k.ctx;
    const world = ctx.world;
    const people = ctx.people;
    const free = this.free;
    const hit = this.hit;
    for (let i = 0; i < RAYS; i++) {
      const dx = DIR_X[i]!;
      const dz = DIR_Z[i]!;
      const ex = cx + dx * RAY_LENGTH;
      const ez = cz + dz * RAY_LENGTH;
      let ok = world.lineOfSight(cx, cz, ex, ez) && world.isFree(ex, ez, 0.4);
      if (ok && ctx.props.raycast(cx, cz, ex, ez, hit, 'move') && hit.hit) ok = false;
      for (let d = SAMPLE_FROM; ok && d <= RAY_LENGTH; d += SAMPLE_STEP) {
        if (people.countIn(cx + dx * d, cz + dz * d, CORDON_RADIUS, this.standingOfficer) >= CORDON_COUNT) ok = false;
      }
      free[i] = ok ? 1 : 0;
    }
    for (let i = 0; i < RAYS; i++) {
      if (free[i] === 1 && free[(i + 1) % RAYS] === 1) return true;
    }
    return false;
  }
}
