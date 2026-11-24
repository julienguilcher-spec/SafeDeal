/* =====================================================================================
 * Ordres directs — LE TOUCHER DU MONDE (téléphone) : toucher brièvement l'image (zone du regard, moins de 220 ms, moins
 * de 12 px de glissement : input/touch/overlay.ts) désigne ce qui est sous le doigt pendant 4 s, à la place du regard.
 * Le pouce n'a pas la précision d'une souris : toucher un casseur (à 28 px près) le désigne pour « Interpeller »,
 * toucher la chaussée désigne le point (la rue, la foule autour) ; un glissé pour regarder n'est jamais un toucher.
 *
 * Le rayon part de la caméra, à travers le point touché : on avance d'un mètre à la fois jusqu'au sol, ou jusqu'à une
 * façade (le point est alors pris 2 m devant elle), à 400 m au plus ; le ciel ne désigne rien (le regard reprend).
 * Personnes : celles qu'on voit à moins de 28 px du doigt (à l'échelle du téléphone), devant la façade que touche le
 * rayon ;
 * l'auteur d'un fait constaté d'abord, puis un blessé, puis un policier que la règle e peut rappeler (jamais un policier
 * d'une unité qui suit déjà le joueur : designate.ts recallable), puis les autres ; à égalité, le plus près du doigt.
 * La personne désignée est suivie tant que dure la désignation.
 *
 * Lecture seule : aucune écriture dans la partie. Temps : celui de la simulation (aucun hasard).
 * ===================================================================================== */

import type { GameContext, Person } from '@/core/contracts';
import { touchScale } from '../../hud/layout';
import { projectPoint } from '../../hud/markers';
import type { Projected } from '../../hud/markers';
import type { CommandCore } from '../core';
import { AIM_GROUND_RANGE, FAR_RANGE, recallable } from './designate';
import { designationAt } from './env';
import type { Designation } from './types';

/** Durée de la désignation d'un toucher (s). */
export const TAP_DESIGNATION_TIME = 4;
/** Rayon de prise d'une personne autour du doigt (px à l'échelle 1 du téléphone). */
export const TAP_PICK_PX = 28;
/** Pas du rayon (m, horizontal) et recul devant une façade (m). */
const RAY_STEP = 1;
const FACADE_BACKOFF = 2;
/** Hauteur visée sur une personne (m au-dessus du sol) : le buste. */
const CHEST = 1.2;

/** Surcouche tactile (service 'input.touch') vue par la seule méthode lue ici. */
interface TouchTapLike { takeWorldTap?(): { x: number; y: number } | null }

/** Rayon de la caméra : origine et direction normalisée (monde). */
export interface ScreenRay {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Rayon de la caméra passant par le point (nx, ny) en coordonnées normalisées de l'écran (−1…1, y vers le haut).
 * `world` = matrixWorld de la caméra, `projInv` = projectionMatrixInverse (tableaux de 16 nombres, colonnes d'abord,
 * comme THREE.Matrix4.elements). Fonction pure.
 */
export function screenRay(world: ArrayLike<number>, projInv: ArrayLike<number>, nx: number, ny: number): ScreenRay {
  // point du plan médian (z = 0,5 en coordonnées de découpe) ramené dans le repère de la caméra
  const cx = nx, cy = ny, cz = 0.5, cw = 1;
  let vx = projInv[0]! * cx + projInv[4]! * cy + projInv[8]! * cz + projInv[12]! * cw;
  let vy = projInv[1]! * cx + projInv[5]! * cy + projInv[9]! * cz + projInv[13]! * cw;
  let vz = projInv[2]! * cx + projInv[6]! * cy + projInv[10]! * cz + projInv[14]! * cw;
  const vw = projInv[3]! * cx + projInv[7]! * cy + projInv[11]! * cz + projInv[15]! * cw;
  if (Math.abs(vw) > 1e-9) {
    vx /= vw;
    vy /= vw;
    vz /= vw;
  }
  // direction : rotation seule (la caméra regarde vers −z de son repère)
  let dx = world[0]! * vx + world[4]! * vy + world[8]! * vz;
  let dy = world[1]! * vx + world[5]! * vy + world[9]! * vz;
  let dz = world[2]! * vx + world[6]! * vy + world[10]! * vz;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  return { ox: world[12]!, oy: world[13]!, oz: world[14]!, dx, dy, dz };
}

/**
 * Point du sol que touche le rayon (façade : 2 m devant elle), à `maxRange` m au plus à l'horizontale ; null s'il
 * monte vers le ciel ou ne rencontre rien. `range` : distance horizontale de la caméra au point.
 */
export function rayGround(ctx: GameContext, ray: ScreenRay, maxRange = FAR_RANGE): { x: number; z: number; range: number; facade: boolean } | null {
  const h = Math.hypot(ray.dx, ray.dz);
  if (h < 1e-6) {
    // tout droit vers le bas (vue de dessus) : sous la caméra
    return ray.dy < 0 ? { x: ray.ox, z: ray.oz, range: 0, facade: false } : null;
  }
  const kx = ray.dx / h, kz = ray.dz / h, ky = ray.dy / h;
  const world = ctx.world;
  let px = ray.ox, pz = ray.oz, py = ray.oy;
  for (let d = RAY_STEP; d <= maxRange; d += RAY_STEP) {
    const x = ray.ox + kx * d;
    const z = ray.oz + kz * d;
    const y = ray.oy + ky * d;
    const ground = world.heightAt(x, z);
    const roof = world.buildingHeightAt(x, z);
    if (roof > 0 && y <= ground + roof) {
      // une façade : le point de la rue juste devant
      const back = Math.max(0, d - FACADE_BACKOFF);
      return { x: ray.ox + kx * back, z: ray.oz + kz * back, range: back, facade: true };
    }
    if (y <= ground) {
      // entre le pas précédent et celui-ci : interpolation sur la hauteur au-dessus du sol
      const prevAbove = py - world.heightAt(px, pz);
      const above = y - ground;
      const t = prevAbove > above ? prevAbove / (prevAbove - above) : 1;
      const dd = d - RAY_STEP + t * RAY_STEP;
      return { x: ray.ox + kx * dd, z: ray.oz + kz * dd, range: dd, facade: false };
    }
    px = x;
    pz = z;
    py = y;
  }
  return null;
}

/** Rang d'une personne sous le doigt (plus petit = choisi d'abord) ; −1 : jamais désignée par un toucher. */
function tapRank(core: CommandCore, p: Person, meId: number): number {
  const ctx = core.ctx;
  if (p.id === meId || p.injury === 'dead') return -1;
  if (p.faction === 'police') return p.vehicleId === 0 && recallable(core, p, meId) ? 2 : -1;
  if (p.custody === 'free' && p.vehicleId === 0 && ctx.law.canArrest(p)) return 0;
  if (p.vehicleId === 0 && (p.injury === 'serious' || p.injury === 'critical' || ctx.health.isIncapacitated(p))) return 1;
  return p.vehicleId === 0 ? 3 : -1;
}

export class TapDesignation {
  private held: { d: Designation; personId: number; until: number } | null = null;
  private readonly near: Person[] = [];
  private readonly proj: Projected = { x: 0, y: 0, front: true };

  constructor(private readonly core: CommandCore) {}

  /** Nouvelle session. */
  reset(): void {
    this.held = null;
  }

  /** Désignation d'un toucher en cours (rafraîchie : une personne est suivie), null hors de ses 4 s. */
  current(): Designation | null {
    const h = this.held;
    if (!h) return null;
    const now = this.core.ctx.clock.now;
    if (now > h.until) {
      this.held = null;
      return null;
    }
    if (h.personId !== 0) {
      const p = this.core.ctx.people.get(h.personId);
      if (!p || p.injury === 'dead') {
        this.held = null;
        return null;
      }
      h.d = this.make(p.x, p.z, p.id);
    }
    return h.d;
  }

  /**
   * À chaque image : lit le dernier toucher du monde (service 'input.touch') et, s'il désigne quelque chose, le tient
   * 4 s. Retourne la désignation en cours (null : le regard décide).
   */
  update(): Designation | null {
    const ctx = this.core.ctx;
    const touch = ctx.service<TouchTapLike>('input.touch');
    const tap = touch && typeof touch.takeWorldTap === 'function' ? touch.takeWorldTap() : null;
    if (tap) {
      const d = this.designateAtScreen(tap.x, tap.y);
      if (d) this.held = { d, personId: d.person ? d.person.id : 0, until: ctx.clock.now + TAP_DESIGNATION_TIME };
    }
    return this.current();
  }

  /** Ce qui est sous le point (x, y) de l'écran (coordonnées de la page) ; null : le ciel, pas de vue 3D. */
  designateAtScreen(clientX: number, clientY: number): Designation | null {
    const ctx = this.core.ctx;
    const view = ctx.view;
    const me = this.core.player();
    if (!view || !me) return null;
    const cam = view.camera;
    cam.updateMatrixWorld();
    const canvas = view.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return null;
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((clientY - r.top) / r.height) * 2 - 1);
    const ray = screenRay(cam.matrixWorld.elements, cam.projectionMatrixInverse.elements, nx, ny);
    const hit = rayGround(ctx, ray);
    // une personne sous le doigt, devant la façade que le rayon touche (le sol, touché en rasant derrière elle, ne la
    // cache pas : son buste dépasse)
    const reach = hit && hit.facade ? hit.range + 3 : FAR_RANGE;
    const pick = TAP_PICK_PX * touchScale(r.width, r.height);
    const viewM = cam.matrixWorldInverse.elements;
    const projM = cam.projectionMatrix.elements;
    const list = this.near;
    list.length = 0;
    ctx.people.queryRadius(ray.ox, ray.oz, Math.min(reach, FAR_RANGE), list);
    let best: Person | null = null;
    let bestRank = 99;
    let bestPx = Infinity;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      const rank = tapRank(this.core, p, me.id);
      if (rank < 0) continue;
      projectPoint(viewM, projM, p.x, ctx.world.heightAt(p.x, p.z) + CHEST, p.z, r.width, r.height, this.proj);
      if (!this.proj.front) continue;
      const px = Math.hypot(this.proj.x - (clientX - r.left), this.proj.y - (clientY - r.top));
      if (px > pick) continue;
      if (rank < bestRank || (rank === bestRank && px < bestPx)) {
        best = p;
        bestRank = rank;
        bestPx = px;
      }
    }
    list.length = 0;
    if (best) return this.make(best.x, best.z, best.id);
    if (!hit) return null;
    return this.make(hit.x, hit.z, 0);
  }

  private make(x: number, z: number, personId: number): Designation {
    const me = this.core.player();
    const d = designationAt(this.core, x, z, personId, true);
    d.distance = me ? Math.hypot(d.x - me.x, d.z - me.z) : d.distance;
    d.far = d.distance > AIM_GROUND_RANGE;
    return d;
  }
}
