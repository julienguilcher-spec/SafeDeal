/* =====================================================================================
 * GROUPES RADICAUX — appréciation de la situation locale d'un groupe (le « rapport de force »).
 *
 * Refaite à chaque réflexion du groupe (une fois par seconde) à partir de ce que le groupe peut voir :
 *   - les forces à pied : nombre à 110 m et à 30 m, barycentre, agent le plus proche, vitesse de
 *     rapprochement (une ligne qui avance, qui tient ou qui recule), direction de la ligne, fatigue
 *     (endurance moyenne), part de boucliers levés ;
 *   - les cibles d'occasion : un agent isolé (au plus un collègue à moins de 10 m), un agent à terre,
 *     un camarade interpellé et son escorte ;
 *   - les moyens lourds : engin lanceur d'eau, blindé, véhicule de police ;
 *   - le gaz (exposition moyenne des membres, concentration au point du groupe) ;
 *   - ses propres forces : membres valides, moral, projectiles, manifestants qui le couvrent.
 * Le rapport de force résume le tout ; les plans (tactics.ts) le lisent, avec le détail.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import { isPolice } from './kernel';
import type { RadKernel } from './kernel';
import { isAble } from './model';
import type { Assessment, RadGroup } from './model';
import * as R from './tuning';

const SCAN = 110;

export function assess(k: RadKernel, g: RadGroup): Assessment {
  const a = g.a;
  const ctx = k.ctx;
  const gx = g.ax;
  const gz = g.az;

  // ── ses propres forces ──
  let able = 0;
  let gas = 0;
  let ammo = 0;
  let throwers = 0;
  const ms = g.members;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]!;
    if (!isAble(m)) continue;
    able++;
    gas += m.p.gas;
    ammo += m.ammo;
    if (!m.umbrella && !m.banner) throwers++;
  }
  a.able = able;
  a.gas = able > 0 ? gas / able : 0;
  a.gasField = ctx.hazards.gasAt(gx, gz);
  g.ammo = ammo;
  g.throwers = throwers;
  a.cover = k.core.sense.coverAt(gx, gz, 25);

  // ── forces de l'ordre ──
  a.police = 0;
  a.near = 0;
  a.nearId = 0;
  a.dist = Infinity;
  a.closing = 0;
  a.isolatedId = 0;
  a.isolatedDist = Infinity;
  a.downId = 0;
  a.downDist = Infinity;
  a.stamina = 1;
  a.shields = 0;
  a.sight = false;
  const list = k.people;
  const n = ctx.people.queryRadius(gx, gz, SCAN, list, isPolice);
  let sx = 0;
  let sz = 0;
  let svx = 0;
  let svz = 0;
  let stamina = 0;
  let shields = 0;
  let up = 0;
  for (let i = 0; i < n; i++) {
    const q = list[i]!;
    const dx = q.x - gx;
    const dz = q.z - gz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (q.posture === 'down') {
      if (q.vehicleId === 0 && d < a.downDist) {
        a.downDist = d;
        a.downId = q.id;
      }
      continue;
    }
    if (q.vehicleId !== 0) continue;
    up++;
    sx += q.x;
    sz += q.z;
    svx += q.vx;
    svz += q.vz;
    stamina += q.stamina;
    if (q.alt && k.items !== undefined ? k.items.shieldRaised(q) : q.alt) shields++;
    if (d < 30) a.near++;
    if (d < a.dist) {
      a.dist = d;
      a.nearId = q.id;
      a.nx = q.x;
      a.nz = q.z;
    }
  }
  a.police = up;
  if (up > 0) {
    a.px = sx / up;
    a.pz = sz / up;
    a.stamina = stamina / up / 100;
    a.shields = shields / up;
    // vitesse moyenne des forces, projetée vers le groupe
    const dx = gx - a.px;
    const dz = gz - a.pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.5) a.closing = ((svx / up) * dx + (svz / up) * dz) / d;
    // direction de la ligne : axe principal de la dispersion des agents
    let cxx = 0;
    let czz = 0;
    let cxz = 0;
    for (let i = 0; i < n; i++) {
      const q = list[i]!;
      if (q.posture === 'down' || q.vehicleId !== 0) continue;
      const ex = q.x - a.px;
      const ez = q.z - a.pz;
      cxx += ex * ex;
      czz += ez * ez;
      cxz += ex * ez;
    }
    const ang = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    a.lineX = Math.cos(ang);
    a.lineZ = Math.sin(ang);
    a.sight = ctx.world.lineOfSight(gx, gz, a.px, a.pz);
    // agent isolé : au plus un collègue valide à moins de dix mètres
    if (up <= 40) {
      const r2 = R.ISOLATED_RADIUS * R.ISOLATED_RADIUS;
      for (let i = 0; i < n; i++) {
        const q = list[i]!;
        if (q.posture === 'down' || q.vehicleId !== 0) continue;
        const d = Math.hypot(q.x - gx, q.z - gz);
        if (d > R.ASSAULT_RANGE || d >= a.isolatedDist) continue;
        let mates = 0;
        for (let j = 0; j < n && mates <= R.ISOLATED_MATES; j++) {
          const o = list[j]!;
          if (o === q || o.posture === 'down' || o.vehicleId !== 0) continue;
          if ((o.x - q.x) * (o.x - q.x) + (o.z - q.z) * (o.z - q.z) <= r2) mates++;
        }
        if (mates <= R.ISOLATED_MATES) {
          a.isolatedDist = d;
          a.isolatedId = q.id;
        }
      }
    }
  }

  // ── camarade interpellé ──
  a.heldId = 0;
  a.heldEscort = 0;
  const arrests = k.arrests;
  let bestHeld = R.RESCUE_RANGE;
  for (let i = arrests.length - 1; i >= 0; i--) {
    const q = ctx.people.get(arrests[i]!);
    if (!q || q.custody === 'free' || q.custody === 'in_vehicle' || q.custody === 'handed_over' || q.vehicleId !== 0) {
      arrests.splice(i, 1);
      continue;
    }
    const d = Math.hypot(q.x - gx, q.z - gz);
    if (d < bestHeld) {
      bestHeld = d;
      a.heldId = q.id;
      a.heldX = q.x;
      a.heldZ = q.z;
    }
  }
  if (a.heldId !== 0) a.heldEscort = ctx.people.countIn(a.heldX, a.heldZ, 12, isEscort);

  // ── moyens lourds ──
  a.water = Infinity;
  a.armour = Infinity;
  a.vehicleId = 0;
  a.vehicleDist = Infinity;
  const vs = k.vehicles;
  const nv = ctx.vehicles.queryRadius(gx, gz, 90, vs);
  for (let i = 0; i < nv; i++) {
    const v = vs[i]!;
    if (v.faction !== 'police' || v.dormant || v.def.flying || v.state === 'wrecked' || v.state === 'burnt') continue;
    const d = Math.hypot(v.x - gx, v.z - gz);
    if (v.kind === 'canon_eau') {
      if (d < a.water) a.water = d;
    } else if (v.kind === 'centaure') {
      if (d < a.armour) a.armour = d;
    }
    if (v.state !== 'burning' && d < a.vehicleDist) {
      a.vehicleDist = d;
      a.vehicleId = v.id;
    }
  }

  // ── rapport de force ──
  const ours = able * (0.5 + g.morale) * (0.7 + 0.3 * Math.min(1, ammo / Math.max(1, able))) + 0.08 * Math.min(60, a.cover)
    + 0.4 * g.followers.length;
  let theirs = (a.near * 1.6 + (up - a.near) * 0.7) * (0.8 + 0.4 * a.shields) * (0.55 + 0.45 * a.stamina);
  if (a.water < 70) theirs += 8;
  if (a.armour < 80) theirs += 10;
  if (a.closing > 0.8) theirs *= 1.3;
  else if (a.closing < -0.4) theirs *= 0.7;
  a.ratio = ours / Math.max(1, theirs);
  return a;
}

function isEscort(p: Person): boolean {
  return p.faction === 'police' && p.posture !== 'down' && p.vehicleId === 0 && !p.dormant;
}

/**
 * Choix d'un axe et d'un point d'où agir contre les forces : sur un cercle de rayon `dist` autour de
 * l'agent le plus proche, cinq directions autour de l'axe actuel (de face, de trois quarts, de flanc).
 * On écarte les points dans un mur, sans vue sur les forces, dans le gaz, ou qu'on ne peut atteindre sans
 * passer à leur contact ; on préfère le flanc d'une ligne (ses boucliers regardent ailleurs) et le plus
 * court. Écrit le point dans k.v2 et retourne true ; false si aucun point ne convient.
 */
export function pickStandoff(k: RadKernel, g: RadGroup, dist: number): boolean {
  const a = g.a;
  const ctx = k.ctx;
  const world = ctx.world;
  let bx = g.ax - a.nx;
  let bz = g.az - a.nz;
  const bl = Math.hypot(bx, bz);
  if (bl < 0.5) return false;
  bx /= bl;
  bz /= bl;
  // normale à la ligne, du côté du groupe : c'est là que regardent les boucliers
  let fx = -a.lineZ;
  let fz = a.lineX;
  if (fx * bx + fz * bz < 0) {
    fx = -fx;
    fz = -fz;
  }
  let best = -Infinity;
  let found = false;
  for (let c = 0; c < 5; c++) {
    const ang = c === 0 ? 0 : (c & 1 ? 1 : -1) * (c <= 2 ? 0.7 : 1.4);
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    const dx = bx * cs - bz * sn;
    const dz = bx * sn + bz * cs;
    const x = a.nx + dx * dist;
    const z = a.nz + dz * dist;
    if (!world.isFree(x, z, 0.6)) continue;
    if (!world.lineOfSight(x, z, a.nx, a.nz)) continue;
    // personne des forces à moins de quinze mètres du point
    if (c > 0 && ctx.people.countIn(x, z, 15, isEscort) > 0) continue;
    // le trajet ne frôle pas la ligne
    const tx = x - g.ax;
    const tz = z - g.az;
    const tl2 = tx * tx + tz * tz;
    if (tl2 > 4) {
      let t = ((a.px - g.ax) * tx + (a.pz - g.az) * tz) / tl2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(g.ax + tx * t - a.px, g.az + tz * t - a.pz) < 14) continue;
    }
    if (c > 0 && !world.lineOfSight(g.ax, g.az, x, z)) continue;
    let score = 0;
    // de flanc : les boucliers regardent ailleurs
    score += 0.5 * (1 - Math.abs(dx * fx + dz * fz)) * (a.police >= 4 ? 1 : 0.3);
    score -= Math.sqrt(tl2) * 0.02;
    score -= ctx.hazards.gasAt(x, z) * 3;
    if (c === 0) score += 0.15;
    if (score > best) {
      best = score;
      k.v2.x = x;
      k.v2.z = z;
      found = true;
    }
  }
  return found;
}
