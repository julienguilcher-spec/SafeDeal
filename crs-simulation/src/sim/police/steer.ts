/* =====================================================================================
 * FORCES DE L'ORDRE — pilotage individuel : l'IA écrit person.cmd comme le ferait un joueur.
 *
 * Chaque pas, l'agent vise son emplacement (ou le point de sa tâche) :
 *   vitesse voulue = vitesse de l'emplacement (la formation qui avance) + rappel proportionnel à
 *   l'écart, bornée par un freinage de référence — tous les agents d'une ligne en marche reçoivent
 *   donc la même vitesse de fond et la ligne avance d'un bloc ;
 *   allure et norme de la commande sont choisies pour que la locomotion atteigne exactement cette
 *   vitesse (limites d'allure lues dans 'people.locomotion', marche arrière compensée) ;
 *   le corps reste tourné vers la menace (cap de la formation) sauf en colonne et sur les longs
 *   trajets, où l'agent regarde où il va.
 * Quelques fois par seconde (navigate) : contournement d'un bâtiment par un itinéraire du monde,
 * pas de côté s'il reste bloqué, mise à jour des limites d'allure.
 * ===================================================================================== */

import type { Person } from '@/core/contracts';
import { distSqPointObb, segmentVsObb } from '@/core/math';
import type { SegmentCast } from '@/core/math';
import type { Agent } from './brain';
import { ACT_AIM, F_COLUMN } from './brain';
import type { Kernel } from './kernel';
import * as T from './tuning';

const DEAD2 = T.STEER_DEAD * T.STEER_DEAD;
const BRAKE2 = 2 * T.STEER_BRAKE;

/** Immobilise l'agent (commande neutre), le regard vers `face`. */
export function halt(a: Agent, face: number): void {
  const cmd = a.p.cmd;
  cmd.moveX = 0;
  cmd.moveZ = 0;
  cmd.gait = 0;
  if (a.act < ACT_AIM) {
    cmd.faceMove = false;
    cmd.aimYaw = face;
    cmd.aimPitch = a.highGuard ? 0.26 : 0;
  }
  cmd.crouch = a.crouch;
}

/**
 * Commande de déplacement vers (tx, tz), cible animée de la vitesse (tvx, tvz). `face` : cap du regard à
 * tenir ; `vcap` : vitesse maximale ; `lookAhead` : l'agent regarde où il va (colonne, longs trajets).
 */
export function steer(k: Kernel, a: Agent, tx: number, tz: number, tvx: number, tvz: number, face: number, vcap: number, lookAhead: boolean): void {
  // la consigne transite par les champs de l'agent : aucun nombre n'est alloué pour l'appel
  a.goX = tx;
  a.goZ = tz;
  a.goVx = tvx;
  a.goVz = tvz;
  a.goFace = face;
  a.goCap = vcap;
  steerGo(k, a, lookAhead);
}

function steerGo(k: Kernel, a: Agent, lookAhead: boolean): void {
  let tx = a.goX;
  let tz = a.goZ;
  let tvx = a.goVx;
  let tvz = a.goVz;
  const face = a.goFace;
  const vcap = a.goCap;
  const p = a.p;
  const cmd = p.cmd;
  let direct = true;
  // contournement : point de passage courant de l'itinéraire
  if (a.pathN > 0) {
    const path = a.path;
    let i = a.pathI;
    while (i < a.pathN) {
      const wx = path[i] - p.x;
      const wz = path[i + 1] - p.z;
      if (wx * wx + wz * wz > 0.8) break;
      i += 2;
    }
    a.pathI = i;
    if (i < a.pathN) {
      tx = path[i];
      tz = path[i + 1];
      tvx = 0;
      tvz = 0;
      direct = false;
    } else {
      a.pathN = 0;
    }
  }
  let dx = tx - p.x;
  let dz = tz - p.z;
  if (direct && a.avoidUntil > k.now) {
    dx += a.avoidX;
    dz += a.avoidZ;
  }
  if (direct && a.obR > 0) {
    // l'élément protégé est sur le trajet : on vise la tangente, du côté où l'on se trouve déjà
    const ox = a.obX - p.x;
    const oz = a.obZ - p.z;
    const dl = Math.sqrt(dx * dx + dz * dz);
    if (dl > 0.3) {
      const along = (ox * dx + oz * dz) / dl;
      const cross = (ox * dz - oz * dx) / dl;
      if (along > 0 && along < dl && Math.abs(cross) < a.obR) {
        const side = cross > 0 ? 1 : -1;
        const wx = a.obX - (dz / dl) * side * (a.obR + 0.35);
        const wz = a.obZ + (dx / dl) * side * (a.obR + 0.35);
        dx = wx - p.x;
        dz = wz - p.z;
        tvx = 0;
        tvz = 0;
      }
    }
  }
  const d2 = dx * dx + dz * dz;
  const still = tvx === 0 && tvz === 0;
  cmd.crouch = a.crouch;
  const aiming = a.act >= ACT_AIM;
  if (still && d2 < DEAD2 && k.now >= a.sideUntil) {
    cmd.moveX = 0;
    cmd.moveZ = 0;
    cmd.gait = 0;
    if (!aiming) {
      cmd.faceMove = false;
      cmd.aimYaw = face;
      cmd.aimPitch = a.highGuard ? 0.26 : 0;
    }
    return;
  }
  // rappel vers l'emplacement, borné par le freinage de référence : pas de dépassement à l'arrivée
  const d = Math.sqrt(d2);
  let pull = d * T.STEER_GAIN;
  const brake = Math.sqrt(BRAKE2 * d);
  if (pull > brake) pull = brake;
  let vx = tvx;
  let vz = tvz;
  if (d > 1e-5) {
    vx += (dx / d) * pull;
    vz += (dz / d) * pull;
  }
  if (k.now < a.sideUntil) {
    vx += a.sideX;
    vz += a.sideZ;
  }
  let v = Math.sqrt(vx * vx + vz * vz);
  if (v < 0.02) {
    cmd.moveX = 0;
    cmd.moveZ = 0;
    cmd.gait = 0;
    if (!aiming) {
      cmd.faceMove = false;
      cmd.aimYaw = face;
      cmd.aimPitch = a.highGuard ? 0.26 : 0;
    }
    return;
  }
  if (v > vcap) {
    const s = vcap / v;
    vx *= s;
    vz *= s;
    v = vcap;
  }
  const ux = vx / v;
  const uz = vz / v;
  const ahead = !aiming && (lookAhead || (d > T.FACE_MOVE_FROM && still) || !direct);
  // facteur de marche arrière ou latérale appliqué par la locomotion quand le corps suit la visée
  let factor = 1;
  if (!ahead) {
    const dot = ux * Math.sin(p.heading) + uz * Math.cos(p.heading);
    if (dot < 0.3) factor = 0.6 + (0.4 * (dot + 1)) / 1.3;
  }
  let gait: 0 | 1 | 2 = 0;
  let lim = a.lim0 * factor;
  if (v > lim * 0.985) {
    gait = 1;
    lim = a.lim1 * factor;
    if (v > lim * 0.985 && a.lim2 > a.lim1) {
      gait = 2;
      lim = a.lim2 * factor;
    }
  }
  let norm = lim > 0.05 ? v / lim : 1;
  if (norm > 1) norm = 1;
  cmd.moveX = ux * norm;
  cmd.moveZ = uz * norm;
  cmd.gait = gait;
  if (!aiming) {
    if (ahead) {
      cmd.faceMove = true;
      cmd.aimYaw = Math.atan2(ux, uz);
      cmd.aimPitch = 0;
    } else {
      cmd.faceMove = false;
      cmd.aimYaw = face;
      cmd.aimPitch = a.highGuard ? 0.26 : 0;
    }
  } else {
    cmd.faceMove = false;
  }
}

/** Met à jour les limites d'allure de l'agent (service 'people.locomotion' s'il est branché). */
export function refreshLimits(k: Kernel, a: Agent): void {
  const p = a.p;
  const loco = k.loco;
  if (loco) {
    a.lim0 = loco.speedLimit(p, 0);
    a.lim1 = loco.speedLimit(p, 1);
    a.lim2 = loco.speedLimit(p, 2);
  } else {
    a.lim0 = p.speedWalk;
    a.lim1 = p.speedRun;
    a.lim2 = p.speedSprint;
  }
  if (a.lim1 < a.lim0) a.lim1 = a.lim0;
  if (a.lim2 < a.lim1) a.lim2 = a.lim1;
  a.limAt = k.now;
}

/**
 * Ligne droite praticable à pied de (ax, az) à (bx, bz) : en vue ET sans obstacle du décor. Une grille (balustrade de la
 * Concorde, enclos) laisse passer le regard mais pas l'agent : jugé « en vue », l'itinéraire qui la contournait était
 * abandonné aussitôt calculé, et l'agent restait collé contre elle (l'opérateur du drone, à 15 m du fourgon où il devait
 * monter, laissé à pied quand la colonne est partie).
 */
function walkable(k: Kernel, ax: number, az: number, bx: number, bz: number): boolean {
  const world = k.ctx.world;
  return world.lineOfSight(ax, az, bx, bz) && !world.raycast(ax, az, bx, bz, k.hit);
}

/**
 * Navigation (quelques fois par seconde) vers (tx, tz) : itinéraire de contournement si un bâtiment
 * masque le but, abandon de l'itinéraire dès que le but est en vue, pas de côté si l'agent piétine.
 * `interval` : temps écoulé depuis le dernier appel.
 */
export function navigate(k: Kernel, a: Agent, tx: number, tz: number, interval: number): void {
  const p = a.p;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d2 = dx * dx + dz * dz;
  const world = k.ctx.world;
  if (a.pathN > 0) {
    // le but a bougé (formation en marche) ou est en vue : on reprend le trajet direct
    const last = a.path.length;
    // (le but de l'itinéraire, et non son dernier point : vers un but pris dans un obstacle, l'itinéraire à pied
    // s'arrête au sol libre le plus proche — comparé au dernier point, il était abandonné aussitôt calculé)
    const ex = a.pathGx - tx;
    const ez = a.pathGz - tz;
    // un contournement de véhicule (un ou deux coins, puis le but) est suivi jusqu'au bout
    const detour = (a.pathN === 4 && last === 6) || (a.pathN === 6 && last === 8);
    if (ex * ex + ez * ez > 36 || (!detour && d2 < 900 && walkable(k, p.x, p.z, tx, tz))) a.pathN = 0;
  } else if (d2 > 25 && k.now - a.pathAt >= T.REPATH_INTERVAL && !walkable(k, p.x, p.z, tx, tz)) {
    a.pathAt = k.now;
    if (world.findPath(p.x, p.z, tx, tz, 'foot', a.path) && a.path.length >= 4) {
      a.pathN = a.path.length;
      a.pathI = 2;
      a.pathGx = tx;
      a.pathGz = tz;
    } else {
      a.pathN = 0;
    }
  }
  // véhicule ou mobilier en travers du trajet direct : on passe par le coin de l'obstacle le plus avantageux
  if (a.pathN === 0 && d2 > 6.25 && k.now >= a.sideUntil) {
    const d = Math.sqrt(d2);
    const reach = d < 7 ? d : 7;
    const ux = dx / d;
    const uz = dz / d;
    const hit = k.hit;
    const ctx = k.ctx;
    if (ctx.vehicles.raycast(p.x, p.z, p.x + ux * reach, p.z + uz * reach, hit, 'move') && hit.hit && hit.id !== a.boardId) {
      const v = ctx.vehicles.get(hit.id);
      if (v) cornerDetour(k, a, v.x, v.z, v.def.width * 0.5, v.def.length * 0.5, v.heading, tx, tz);
    } else if (
      // pas pendant un enjambement ni juste après : en l'air au-dessus de la barrière, l'agent « voyait » encore
      // celle-ci en travers, prenait un contournement par son coin, retombait de l'autre côté… puis revenait vers ce
      // coin et restait collé à la barrière (cinq agents d'une section sur seize, derrière une rue fermée)
      k.now - a.vaultAt >= VAULT_SETTLE &&
      ctx.props.raycast(p.x, p.z, p.x + ux * reach, p.z + uz * reach, hit, 'move') && hit.hit && hit.height > 0.9 && hit.t * reach < d - 1
    ) {
      // obstacle bas déjà contourné par un coin il y a un instant et toujours en travers (ligne de barrières
      // jointives : le coin de l'une est dans la suivante) : plus de contournement, l'agent va droit dessus et
      // l'enjambe — il oscillait sinon d'un coin à l'autre de la barrière sans jamais piétiner assez pour sauter
      const again = hit.height <= VAULT_HEIGHT && k.now - a.detourAt < DETOUR_RETRY;
      const prop = again ? undefined : ctx.props.get(hit.id);
      if (prop) {
        cornerDetour(k, a, prop.x, prop.z, prop.halfX, prop.halfZ, prop.heading, tx, tz);
        a.detourAt = k.now;
      }
    }
  }
  // piétinement : l'agent veut avancer mais n'avance pas
  const mx = p.x - a.lastX;
  const mz = p.z - a.lastZ;
  a.lastX = p.x;
  a.lastZ = p.z;
  if (d2 > 0.5 && mx * mx + mz * mz < T.STUCK_SPEED * interval * (T.STUCK_SPEED * interval) && p.stun <= 0) {
    a.stuckT += interval;
    // barrière Vauban (ou autre obstacle bas) en travers du trajet : l'agent l'enjambe. La navigation ignore le
    // mobilier : une rue fermée par une ligne de barrières bloquait une section entière à 30 m de son poste
    // (« Barrage filtrant en place » annoncé alors que personne n'avait franchi les barrières).
    if (a.stuckT >= T.WAY_TIME * 2 && vaultOver(k, a, tx, tz)) {
      a.stuckT = 0;
      return;
    }
    if (a.stuckT >= T.WAY_TIME && k.now - a.wayAt >= 1.2) {
      a.wayAt = k.now;
      askWay(k, a, tx, tz);
    }
    if (a.stuckT >= T.STUCK_TIME) {
      a.stuckT = 0;
      // pas de côté : du même côté trois fois de suite (le temps de longer l'obstacle), puis de l'autre
      const d = Math.sqrt(d2);
      if (k.now - a.sideUntil > 8) a.sideCount = 0;
      const first = p.id & 1 ? 1 : -1;
      const side = Math.floor(a.sideCount / 3) & 1 ? -first : first;
      a.sideCount++;
      a.sideX = (-dz / d) * side * 1.6;
      a.sideZ = (dx / d) * side * 1.6;
      a.sideUntil = k.now + 1.3;
      if (a.pathN === 0 && d2 > 9 && k.now - a.pathAt >= T.REPATH_INTERVAL) {
        a.pathAt = k.now;
        if (world.findPath(p.x, p.z, tx, tz, 'foot', a.path) && a.path.length >= 6) {
          a.pathN = a.path.length;
          a.pathI = 2;
          a.pathGx = tx;
          a.pathGz = tz;
        }
      }
    }
  } else {
    a.stuckT = 0;
  }
}


/** Hauteur maximale d'un obstacle que l'agent enjambe (m) : celle que la locomotion sait franchir. */
const VAULT_HEIGHT = 1.15;
/** Portée de la recherche d'un obstacle à enjamber devant l'agent (m). */
const VAULT_LOOK = 1.2;
/** Après un enjambement, délai sans nouveau contournement de mobilier (s) : le temps de franchir et de se recevoir. */
const VAULT_SETTLE = 1.5;
/** Délai pendant lequel un obstacle bas encore en travers après un contournement est enjambé au lieu d'être contourné (s). */
const DETOUR_RETRY = 8;

/**
 * Obstacle bas (barrière Vauban, banc, jardinière) juste devant l'agent, vers son but : il l'enjambe (cmd.jump,
 * franchissement géré par la locomotion), droit vers le but — le contournement en cours est abandonné. Jamais par-dessus
 * un objet en feu, ni s'il n'y a qu'un mur derrière.
 */
function vaultOver(k: Kernel, a: Agent, tx: number, tz: number): boolean {
  const p = a.p;
  if (p.posture !== 'stand' || p.carrying !== 0 || p.custody !== 'free') return false;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1.5) return false;
  const ux = dx / d;
  const uz = dz / d;
  const hit = k.hit;
  const ctx = k.ctx;
  const bx = p.x + ux * VAULT_LOOK;
  const bz = p.z + uz * VAULT_LOOK;
  if (!ctx.props.raycast(p.x, p.z, bx, bz, hit, 'move') || !hit.hit || hit.height > VAULT_HEIGHT) return false;
  const prop = ctx.props.get(hit.id);
  if (!prop || prop.state === 'burning') return false;
  if (!ctx.world.isFree(p.x + ux * (VAULT_LOOK + 1), p.z + uz * (VAULT_LOOK + 1), 0.3)) return false;
  a.pathN = 0;
  a.sideUntil = 0;
  a.avoidUntil = 0;
  a.vaultAt = k.now;
  p.cmd.jump = true;
  return true;
}

const cast: SegmentCast = { t: 0, nx: 0, nz: 0 };

/**
 * Contournement d'une boîte orientée (véhicule, mobilier) : parmi ses quatre coins (avec une marge), celui
 * que l'agent voit et qui donne le trajet le plus court vers le but devient un point de passage. Si le but n'est pas
 * en vue de ce coin (il est de l'autre côté de la boîte, le long de son flanc), le coin voisin s'ajoute : sans lui,
 * l'agent arrivé au coin repartait droit vers le but, butait de nouveau contre la caisse, revenait au même coin… et
 * n'embarquait jamais (équipier du fourgon garé dans l'autre file du bloc).
 */
function cornerDetour(k: Kernel, a: Agent, cx: number, cz: number, halfX: number, halfZ: number, heading: number, tx: number, tz: number): void {
  const p = a.p;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = -fz;
  const rz = fx;
  const world = k.ctx.world;
  const mx = halfX + 0.75;
  const mz = halfZ + 0.75;
  // marge de 0,3 m autour de la boîte pour juger qu'un coin est caché ; moins si l'agent est déjà plaqué contre elle :
  // dans cette marge, chaque trajet vers un coin « entrait » dans la boîte dès le départ, tous les coins étaient écartés
  // et l'agent poussait la caisse sans fin (équipage coincé contre le fourgon voisin, à 5 m de sa portière)
  const gap = Math.sqrt(distSqPointObb(p.x, p.z, cx, cz, halfX, halfZ, heading));
  const pad = gap < 0.35 ? Math.max(0, gap - 0.05) : 0.3;
  // (le but lui-même dans la marge de la boîte : on ne juge que la caisse)
  const tgap = Math.sqrt(distSqPointObb(tx, tz, cx, cz, halfX, halfZ, heading));
  const tpad = tgap < 0.35 ? Math.max(0, tgap - 0.05) : 0.3;
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  let b2 = -1;
  for (let i = 0; i < 4; i++) {
    const x = cornerX(cx, rx, fx, mx, mz, i);
    const z = cornerZ(cz, rz, fz, mx, mz, i);
    // coin caché par la boîte elle-même, ou pris dans le décor : écarté
    if (segmentVsObb(p.x, p.z, x, z, cx, cz, halfX + pad, halfZ + pad, heading, cast) && cast.t < 0.97) continue;
    if (!world.isFree(x, z, 0.3)) continue;
    const near = Math.hypot(x - p.x, z - p.z);
    if (!(segmentVsObb(x, z, tx, tz, cx, cz, halfX + tpad, halfZ + tpad, heading, cast) && cast.t < 0.97)) {
      const cost = near + Math.hypot(tx - x, tz - z);
      if (cost < best) {
        best = cost;
        bx = x;
        bz = z;
        b2 = -1;
      }
      continue;
    }
    // but caché depuis ce coin : on longe le flanc jusqu'au coin voisin (même bout, ou même flanc)
    for (let s = 1; s <= 2; s++) {
      const j = i ^ s;
      const x2 = cornerX(cx, rx, fx, mx, mz, j);
      const z2 = cornerZ(cz, rz, fz, mx, mz, j);
      if (!world.isFree(x2, z2, 0.3)) continue;
      if (segmentVsObb(x2, z2, tx, tz, cx, cz, halfX + tpad, halfZ + tpad, heading, cast) && cast.t < 0.97) continue;
      const cost = near + Math.hypot(x2 - x, z2 - z) + Math.hypot(tx - x2, tz - z2);
      if (cost < best) {
        best = cost;
        bx = x;
        bz = z;
        b2 = j;
      }
    }
  }
  if (best === Infinity) return;
  const path = a.path;
  path[0] = p.x;
  path[1] = p.z;
  path[2] = bx;
  path[3] = bz;
  if (b2 < 0) {
    path[4] = tx;
    path[5] = tz;
    path.length = 6;
    a.pathN = 4;
  } else {
    path[4] = cornerX(cx, rx, fx, mx, mz, b2);
    path[5] = cornerZ(cz, rz, fz, mx, mz, b2);
    path[6] = tx;
    path[7] = tz;
    path.length = 8;
    a.pathN = 6;
  }
  a.pathI = 2;
  a.pathGx = tx;
  a.pathGz = tz;
}

/** Coin n° i (0 à 3) d'une boîte orientée agrandie de la marge (mx, mz). */
function cornerX(cx: number, rx: number, fx: number, mx: number, mz: number, i: number): number {
  return cx + rx * mx * (i & 1 ? 1 : -1) + fx * mz * (i & 2 ? 1 : -1);
}

function cornerZ(cz: number, rz: number, fz: number, mx: number, mz: number, i: number): number {
  return cz + rz * mx * (i & 1 ? 1 : -1) + fz * mz * (i & 2 ? 1 : -1);
}

/** Distance entre deux personnes. */
export function distPP(a: Person, b: Person): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Laisser passer : les collègues du bloc rangés entre l'agent et son but s'écartent un instant de part et
 * d'autre de son trajet (les rangs s'ouvrent, puis se referment). L'écart décroît avec la distance au
 * trajet : l'ordre latéral du rang est conservé et personne n'est comprimé.
 */
function askWay(k: Kernel, a: Agent, tx: number, tz: number): void {
  const g = a.group;
  if (!g || g.kind === F_COLUMN) return;
  const fx = Math.sin(g.ah);
  const fz = Math.cos(g.ah);
  const p = a.p;
  // repère du bloc : abscisse latérale (vers la droite) et profondeur (vers l'avant)
  const la = (p.x - g.ax) * -fz + (p.z - g.az) * fx;
  const fa = (p.x - g.ax) * fx + (p.z - g.az) * fz;
  const lt = (tx - g.ax) * -fz + (tz - g.az) * fx;
  const ft = (tx - g.ax) * fx + (tz - g.az) * fz;
  const lo = (fa < ft ? fa : ft) + 0.25;
  const hi = (fa < ft ? ft : fa) - 0.25;
  if (hi <= lo) return;
  const agents = g.agents;
  const until = k.now + T.WAY_HOLD;
  for (let i = 0, n = agents.length; i < n; i++) {
    const b = agents[i];
    if (b === a || !b.hasSlot || b.lf < lo || b.lf > hi) continue;
    const cross = la + ((lt - la) * (b.lf - fa)) / (ft - fa);
    const d = b.lx - cross;
    const ad = d < 0 ? -d : d;
    if (ad >= T.WAY_REACH) continue;
    const shift = (d < 0 ? -1 : 1) * T.WAY_HALF * (1 - ad / T.WAY_REACH);
    b.yieldX = -fz * shift;
    b.yieldZ = fx * shift;
    b.yieldUntil = until;
  }
}
