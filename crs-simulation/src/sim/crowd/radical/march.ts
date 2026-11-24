/* =====================================================================================
 * GROUPES RADICAUX — déplacement groupé : le « point du groupe » et la formation compacte.
 *
 * Un groupe d'affinité se déplace comme un bloc : son point (l'ancre) suit un itinéraire à l'allure
 * décidée par le plan — progression au pas, avance pour lancer, recul hors de portée — et attend les
 * traînards ; chaque membre tient une place dans la formation, exprimée dans le repère du groupe
 * (rangs serrés derrière la banderole : porteurs de banderole au premier rang, parapluies ensuite,
 * lanceurs derrière). Les personnes ne sont jamais déplacées : on écrit leur destination (mémoire de
 * foule), la conduite du cœur et la locomotion font le reste.
 * ===================================================================================== */

import type { RadKernel } from './kernel';
import { ACT, TASK, TOOL, isAble } from './model';
import type { RadGroup, RadMember } from './model';
import * as R from './tuning';

/** Fixe la destination du point du groupe (itinéraire par les rues si elle est loin ou masquée). */
export function moveGroup(k: RadKernel, g: RadGroup, x: number, z: number, speed: number): void {
  g.speed = speed;
  const shift = Math.hypot(x - g.destX, z - g.destZ);
  if (shift < 1.2 && (!g.arrived || Math.hypot(x - g.ax, z - g.az) < 1.2)) return;
  g.destX = x;
  g.destZ = z;
  const d = Math.hypot(x - g.ax, z - g.az);
  if (d < 0.6) {
    g.arrived = true;
    g.path = null;
    return;
  }
  g.arrived = false;
  // un itinéraire en cours reste valable si la destination n'a que glissé (cortège qui avance)
  if (g.path !== null && shift < 12) return;
  if (d > 22 || (d > 4 && !k.ctx.world.lineOfSight(g.ax, g.az, x, z))) {
    g.path = k.core.nav.compute(g.ax, g.az, x, z);
    g.pathI = 0;
  } else g.path = null;
}

/** Oriente le groupe vers un point (direction de l'axe d'action). */
export function faceGroup(g: RadGroup, x: number, z: number): void {
  const dx = x - g.ax;
  const dz = z - g.az;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return;
  g.hx = dx / d;
  g.hz = dz / d;
}

/** Recale le point du groupe sur le barycentre de ses membres valides (groupe dispersé, prise en main). */
export function recenter(g: RadGroup): void {
  let n = 0;
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < g.members.length; i++) {
    const m = g.members[i]!;
    if (!isAble(m)) continue;
    n++;
    sx += m.p.x;
    sz += m.p.z;
  }
  if (n === 0) return;
  g.ax = sx / n;
  g.az = sz / n;
  g.destX = g.ax;
  g.destZ = g.az;
  g.arrived = true;
  g.path = null;
}

/**
 * Répartit les membres dans la formation : `tight` = rangs serrés du bloc, sinon grappe lâche. Les porteurs
 * de banderole prennent le premier rang, les parapluies le suivant, les suiveurs se tiennent derrière.
 */
export function layout(k: RadKernel, g: RadGroup, tight: boolean): void {
  g.tight = tight;
  const ms = g.members;
  let n = 0;
  for (let i = 0; i < ms.length; i++) if (isAble(ms[i]!)) n++;
  if (n === 0) return;
  // largeur disponible : jusqu'aux façades, de part et d'autre du point du groupe
  const world = k.ctx.world;
  const rx = -g.hz;
  const rz = g.hx;
  const hit = k.hit;
  let half = 9;
  if (world.raycast(g.ax, g.az, g.ax + rx * 9, g.az + rz * 9, hit)) half = Math.min(half, hit.t * 9);
  if (world.raycast(g.ax, g.az, g.ax - rx * 9, g.az - rz * 9, hit)) half = Math.min(half, hit.t * 9);
  const file = tight ? R.FILE_GAP : R.FILE_GAP * 1.7;
  const row = tight ? R.ROW_GAP : R.ROW_GAP * 1.7;
  let cols = Math.ceil(Math.sqrt(n * 1.8));
  const fit = Math.max(2, Math.floor((2 * half - 0.8) / file));
  if (cols > fit) cols = fit;
  if (cols > R.BLOC_COLUMNS_MAX) cols = R.BLOC_COLUMNS_MAX;
  if (cols < 1) cols = 1;
  g.cols = cols;
  // ordre : banderole, parapluies, puis les autres (ordre stable des membres)
  let slot = 0;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]!;
      if (!isAble(m)) continue;
      const rank = m.banner || ((m.tools & TOOL.BANNER) !== 0 && g.rank === 0) ? 0 : (m.tools & TOOL.UMBRELLA) !== 0 ? 1 : 2;
      if (rank !== pass) continue;
      const r = Math.floor(slot / cols);
      const c = slot % cols;
      // rang incomplet : centré
      const inRow = Math.min(cols, n - r * cols);
      m.lx = (c - (inRow - 1) * 0.5) * file;
      m.lz = r * row;
      slot++;
    }
  }
  const depth = Math.ceil(n / cols) * row;
  const fs = g.followers;
  for (let i = 0; i < fs.length; i++) {
    const m = fs[i]!;
    const c = i % (cols + 1);
    m.lx = (c - cols * 0.5) * file * 1.8;
    m.lz = depth + 2 + Math.floor(i / (cols + 1)) * 1.6;
  }
}

/** Profondeur de la formation du groupe (m). */
export function depthOf(g: RadGroup): number {
  let n = 0;
  for (let i = 0; i < g.members.length; i++) if (isAble(g.members[i]!)) n++;
  return Math.ceil(n / Math.max(1, g.cols)) * (g.tight ? R.ROW_GAP : R.ROW_GAP * 1.7);
}

/**
 * On bute sur quelque chose. Si c'est un objet posé sur la chaussée, on le contourne par le côté le plus
 * court ; sinon (des gens arrêtés) un pas de côté, d'un côté puis de l'autre, avant de reprendre sa route.
 */
export function dodge(k: RadKernel, m: RadMember, tx: number, tz: number): void {
  const p = m.p;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  const b = m.b;
  b.path = null;
  b.speed = 2.4;
  b.run = true;
  const hit = k.hit;
  const look = Math.min(3, d);
  if (k.ctx.props.raycast(p.x, p.z, p.x + ux * look, p.z + uz * look, hit, 'move') && hit.kind === 'prop') {
    const pr = k.ctx.props.get(hit.id);
    if (pr) {
      const r = Math.max(pr.halfX, pr.halfZ) + 0.8;
      // on laisse l'objet du côté où il dépasse le moins de notre route
      const cross = (pr.x - p.x) * uz - (pr.z - p.z) * ux;
      const side = cross > 0 ? -1 : 1;
      b.tx = pr.x + -uz * side * -r + ux * 0.4;
      b.tz = pr.z + ux * side * -r + uz * 0.4;
      m.dodgeUntil = k.now + Math.min(2.2, 0.5 + Math.hypot(b.tx - p.x, b.tz - p.z) / 2.4);
      return;
    }
  }
  const side = (m.stN & 1) === 0 ? 1 : -1;
  b.tx = p.x + -uz * side * 2.2 + ux * 0.8;
  b.tz = p.z + ux * side * 2.2 + uz * 0.8;
  m.dodgeUntil = k.now + 0.9;
}

/** Emplacement d'un membre dans le monde, d'après le point et l'orientation du groupe. */
export function slotOf(g: RadGroup, m: RadMember, out: { x: number; z: number }): void {
  out.x = g.ax - g.hz * m.lx - g.hx * m.lz;
  out.z = g.az + g.hx * m.lx - g.hz * m.lz;
}

/** Direction et allure du point du groupe à ce pas (pour que chacun marche avec lui, sans freiner à chaque mètre). */
let mvx = 0;
let mvz = 0;
let mv = 0;

function driveSlot(g: RadGroup, m: RadMember, moving: boolean, now: number): void {
  if (now < m.dodgeUntil) return;
  const p = m.p;
  const b = m.b;
  const wx = g.ax - g.hz * m.lx - g.hx * m.lz;
  const wz = g.az + g.hx * m.lx - g.hz * m.lz;
  const dx = wx - p.x;
  const dz = wz - p.z;
  const d2 = dx * dx + dz * dz;
  // loin de sa place et hors de vue : l'itinéraire demandé à la réflexion fait foi ; sinon on vise la place
  if (d2 > 400 && (b.path !== null || b.pathPending)) return;
  b.path = null;
  const d = Math.sqrt(d2);
  if (moving) {
    // la place avance : on vise devant elle, à l'allure du groupe corrigée du retard
    const lag = dx * mvx + dz * mvz;
    b.tx = wx + mvx * 3;
    b.tz = wz + mvz * 3;
    let v = mv + lag * 1.1;
    const max = mv > 2 ? R.SPEED_RUN : 3;
    if (v > max) v = max;
    if (v < mv * 0.5) v = mv * 0.5;
    b.speed = v;
    b.run = v > 1.5;
    b.lookX = NaN;
  } else {
    b.tx = wx;
    b.tz = wz;
    let v = d * 1.4;
    if (v > 3) v = 3;
    b.speed = v;
    b.run = v > 1.6;
    b.lookX = wx + g.hx * 30;
    b.lookZ = wz + g.hz * 30;
  }
}

/**
 * Pas de simulation d'un groupe : le point du groupe avance le long de son itinéraire (en attendant
 * les traînards), puis chaque membre « à sa place » reçoit sa destination.
 */
export function stepGroup(k: RadKernel, g: RadGroup, dt: number): void {
  let moving = false;
  if (!g.arrived) {
    let tx = g.destX;
    let tz = g.destZ;
    const path = g.path;
    if (path !== null) {
      const i = g.pathI * 2;
      if (i + 1 < path.length) {
        tx = path[i]!;
        tz = path[i + 1]!;
      } else g.path = null;
    }
    const dx = tx - g.ax;
    const dz = tz - g.az;
    const d = Math.hypot(dx, dz);
    // le groupe reste groupé : le point ralentit quand la cohésion baisse
    const v = g.speed * (g.cohesion > 0.7 ? 1 : g.cohesion > 0.4 ? 0.6 : 0.3);
    const stepLen = v * dt;
    if (d <= stepLen || d < 0.3) {
      g.ax = tx;
      g.az = tz;
      if (g.path !== null) g.pathI++;
      else g.arrived = true;
    } else {
      mvx = dx / d;
      mvz = dz / d;
      mv = v;
      g.ax += mvx * stepLen;
      g.az += mvz * stepLen;
      // l'orientation suit la marche, sauf en recul (on recule face à ce que l'on fuit : fixée par le plan)
      if (g.speed <= R.SPEED_ADVANCE + 0.01) {
        const t = Math.min(1, dt * 3);
        const hx = g.hx + (dx / d - g.hx) * t;
        const hz = g.hz + (dz / d - g.hz) * t;
        const hl = Math.hypot(hx, hz);
        if (hl > 0.2) {
          g.hx = hx / hl;
          g.hz = hz / hl;
        }
      }
      moving = v > 0.05;
    }
  }
  const ms = g.members;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]!;
    if (!m.held || m.task !== TASK.SLOT) {
      // un lanceur qui attend l'instant de la salve tient encore sa place
      if (!(m.held && m.act === ACT.THROW && m.actStage <= 1 && k.now < m.actNotBefore - 1.1)) continue;
    } else if (m.act !== ACT.NONE) continue;
    driveSlot(g, m, moving, k.now);
  }
  const fs = g.followers;
  for (let i = 0; i < fs.length; i++) {
    const m = fs[i]!;
    if (m.held && m.task === TASK.SLOT && m.act === ACT.NONE) driveSlot(g, m, moving, k.now);
  }
}
