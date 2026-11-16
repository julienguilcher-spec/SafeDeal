/* =====================================================================================
 * FORCES DE L'ORDRE — outils communs des manœuvres : phases, constitution d'un bloc de formation
 * avec l'effectif apte d'une unité, déplacement du repère (accélération bornée, arrêt net, vitesse
 * commune réduite si un agent prend du retard : la formation avance d'un bloc), marche d'une
 * colonne le long de son itinéraire, comptes rendus radio.
 * ===================================================================================== */

import type { EntityId, OrderType, Person, SquadOrder, Vehicle } from '@/core/contracts';
import { angleDiff } from '@/core/math';
import type { UnitPhase } from './api';
import { IN_PLACE_EVENT, ORDER_DONE_EVENT } from './api';
import type { Agent, FormGroup, Unit } from './brain';
import { F_BOX, F_COLUMN, F_HOLD, F_LINE, F_NONE, F_SCREEN, F_TORTUE, createGroup } from './brain';
import { buildBox, buildColumn, buildHold, buildLine, buildScreen, buildTortue } from './formation';
import type { Kernel } from './kernel';
import { centroid, measure, placeGroup, setPath, settleSlots } from './place';
import { frame, superior } from './radio';
import { formables, refreshFormable } from './tree';
import * as T from './tuning';

export function copyOrder(o: SquadOrder): SquadOrder {
  return {
    type: o.type, x: o.x, z: o.z, heading: o.heading, width: o.width, targetId: o.targetId, maxForce: o.maxForce,
    issuedAt: o.issuedAt, issuedBy: o.issuedBy,
  };
}

export function setPhase(k: Kernel, u: Unit, phase: UnitPhase): void {
  if (phase === 'mise_en_place') {
    // délai de grâce de la mise en place : le temps de marche du plus éloigné, plus une marge
    let far = 0;
    const agents = u.agents;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.hasSlot || !a.able) continue;
      const d = (a.sx - a.p.x) * (a.sx - a.p.x) + (a.sz - a.p.z) * (a.sz - a.p.z);
      if (d > far) far = d;
    }
    u.formDeadline = k.now + T.FORM_TIMEOUT + Math.sqrt(far) / 1.6;
  }
  if (u.phase === phase) return;
  u.phase = phase;
  u.phaseT = k.now;
}

/** La mise en place a-t-elle assez duré pour être déclarée faite malgré un retardataire ? */
export function formLate(k: Kernel, u: Unit): boolean {
  return k.now > u.formDeadline;
}

export function setStep(k: Kernel, u: Unit, step: number): void {
  u.man.step = step;
  u.man.stepT = k.now;
}

/** Premier bloc de formation de l'unité (créé au besoin) ; les autres blocs sont abandonnés. */
export function mainGroup(u: Unit): FormGroup {
  if (u.groups.length === 0) u.groups.push(createGroup());
  if (u.groups.length > 1) u.groups.length = 1;
  return u.groups[0];
}

/** Retire tout emplacement aux agents de l'unité (avant de reconstruire ses blocs). */
export function clearSlots(u: Unit): void {
  const agents = u.agents;
  for (let i = 0; i < agents.length; i++) {
    agents[i].hasSlot = false;
    agents[i].group = null;
  }
}

/** Copie dans le bloc la liste des agents qui y ont un emplacement (triés par rang pour la colonne). */
export function adopt(g: FormGroup, agents: readonly Agent[], n: number): void {
  const list = g.agents;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    if (a.group !== g || !a.hasSlot) continue;
    if (m < list.length) list[m] = a;
    else list.push(a);
    m++;
  }
  list.length = m;
  if (g.kind === F_COLUMN) list.sort(byRank);
}

function byRank(a: Agent, b: Agent): number {
  return a.rank - b.rank || a.lx - b.lx;
}

/** Délai de réaction individuel à un nouvel ordre (moins de 1,5 s). */
export function react(k: Kernel, u: Unit): void {
  const t = k.tuning;
  const agents = u.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    a.reactAt = k.now + t.reactionMin + a.seed * (t.reactionMax - t.reactionMin);
    a.pathN = 0;
  }
}

/** Agents aptes de l'unité, dans k.agentsTmp ; retourne leur nombre. */
export function gather(k: Kernel, u: Unit): number {
  u.formed = refreshFormable(k, u);
  return formables(u, k.agentsTmp);
}

export function formLine(k: Kernel, u: Unit, x: number, z: number, h: number, width: number, doorW = 0): FormGroup {
  const n = gather(k, u);
  clearSlots(u);
  const g = mainGroup(u);
  buildLine(k, g, k.agentsTmp, n, x, z, h, width, doorW);
  adopt(g, k.agentsTmp, n);
  finishBuild(k, g);
  return g;
}

export function formTortue(k: Kernel, u: Unit, x: number, z: number, h: number): FormGroup {
  const n = gather(k, u);
  clearSlots(u);
  const g = mainGroup(u);
  buildTortue(k, g, k.agentsTmp, n, x, z, h);
  adopt(g, k.agentsTmp, n);
  finishBuild(k, g);
  return g;
}

export function formScreen(k: Kernel, u: Unit, x: number, z: number, h: number, radius: number): FormGroup {
  const n = gather(k, u);
  clearSlots(u);
  const g = mainGroup(u);
  buildScreen(k, g, k.agentsTmp, n, x, z, h, radius);
  adopt(g, k.agentsTmp, n);
  finishBuild(k, g);
  return g;
}

export function formBox(k: Kernel, u: Unit, x: number, z: number, h: number, hl: number, hw: number): FormGroup {
  const n = gather(k, u);
  clearSlots(u);
  const g = mainGroup(u);
  buildBox(k, g, k.agentsTmp, n, x, z, h, hl, hw);
  adopt(g, k.agentsTmp, n);
  finishBuild(k, g);
  return g;
}

export function formHold(k: Kernel, u: Unit): FormGroup {
  const n = gather(k, u);
  clearSlots(u);
  const g = mainGroup(u);
  buildHold(g, k.agentsTmp, n);
  adopt(g, k.agentsTmp, n);
  placeGroup(k, g);
  return g;
}

/**
 * Colonne vers (tx, tz) par les rues. La tête part de (hx, hz) ; l'itinéraire vient du monde (ligne droite
 * à défaut). Retourne le bloc ; la colonne se forme d'abord sur place (g.moving reste false).
 */
export function formColumn(k: Kernel, u: Unit, hx: number, hz: number, tx: number, tz: number, files: number, straight = false): FormGroup {
  const n = gather(k, u);
  clearSlots(u);
  const g = mainGroup(u);
  const path = k.pathTmp;
  if (straight || !k.ctx.world.findPath(hx, hz, tx, tz, 'foot', path) || path.length < 4) {
    path.length = 0;
    path.push(hx, hz, tx, tz);
  }
  // l'itinéraire part exactement de la tête et finit exactement au but
  path[0] = hx;
  path[1] = hz;
  let count = path.length >> 1;
  // direction de départ : premier tronçon d'au moins 1 m
  let dx = tx - hx;
  let dz = tz - hz;
  for (let i = 1; i < count; i++) {
    const ex = path[i * 2] - hx;
    const ez = path[i * 2 + 1] - hz;
    if (ex * ex + ez * ez > 1) {
      dx = ex;
      dz = ez;
      break;
    }
  }
  const dl = Math.sqrt(dx * dx + dz * dz);
  if (dl > 1e-6) {
    dx /= dl;
    dz /= dl;
  } else {
    dx = Math.sin(g.ah);
    dz = Math.cos(g.ah);
  }
  if (count < 2) {
    path.push(hx + dx, hz + dz);
    count = 2;
  }
  buildColumn(g, k.agentsTmp, n, hx, hz, dx, dz, files, u.squad.leaderId);
  setPath(g, path, count);
  adopt(g, k.agentsTmp, n);
  g.dirty = true;
  placeGroup(k, g);
  settleSlots(k, g);
  return g;
}

function finishBuild(k: Kernel, g: FormGroup): void {
  placeGroup(k, g);
  settleSlots(k, g);
}

/** Nombre de files d'une colonne : ordre (largeur ≥ 1,6 m : par trois) ou effectif. */
export function filesFor(width: number, n: number): number {
  if (width >= 1.6) return 3;
  if (width > 0) return 2;
  return n > 24 ? 3 : 2;
}

/** Met le repère du bloc en marche vers (x, z), cap final h, à l'allure donnée. */
export function moveTo(g: FormGroup, x: number, z: number, h: number, speed: number, wheel = false): void {
  g.tx = x;
  g.tz = z;
  g.th = h;
  g.speed = speed;
  g.wheel = wheel;
  g.moving = true;
  g.settled = false;
}

/** Arrête le bloc où il se trouve. */
export function stopGroup(g: FormGroup): void {
  g.moving = false;
  g.v = 0;
  g.avx = 0;
  g.avz = 0;
  g.aw = 0;
  g.tx = g.ax;
  g.tz = g.az;
  g.th = g.ah;
  g.dirty = true;
  if (g.kind === F_COLUMN) g.total = Math.min(g.total, g.s);
}

function approachTo(v: number, target: number, up: number, down: number): number {
  if (target > v) return v + up > target ? target : v + up;
  return v - down < target ? target : v - down;
}

/**
 * Fait avancer le repère d'un bloc (ligne, tortue, écran, escorte) vers son objectif. La vitesse commune
 * baisse quand un agent prend du retard : la formation ne se disloque pas. Retourne true à l'arrivée.
 */
export function stepFrame(g: FormGroup, dt: number): boolean {
  const dx = g.tx - g.ax;
  const dz = g.tz - g.az;
  const dist = Math.sqrt(dx * dx + dz * dz);
  // un agent à un mètre de sa place ne doit pas immobiliser la ligne (elle tombait à 0,2 m/s pour 1,2 m de retard)
  let cohesion = 1 - (g.lag - 0.5) / 1.5;
  if (cohesion > 1) cohesion = 1;
  else if (cohesion < 0.25) cohesion = 0.25;
  let want = g.speed * cohesion;
  const stop = Math.sqrt(2 * T.FRAME_DECEL * dist);
  if (want > stop) want = stop;
  g.v = approachTo(g.v, want, T.FRAME_ACCEL * dt, T.FRAME_DECEL * 2 * dt);
  const step = g.v * dt;
  let there = false;
  if (dist <= step + 0.004) {
    g.ax = g.tx;
    g.az = g.tz;
    g.avx = 0;
    g.avz = 0;
    g.v = 0;
    there = true;
  } else {
    const ux = dx / dist;
    const uz = dz / dist;
    g.ax += ux * step;
    g.az += uz * step;
    g.avx = ux * g.v;
    g.avz = uz * g.v;
  }
  // conversion : pivot borné pour que les flancs suivent
  const goal = g.wheel && dist > g.width * 0.5 + 2 ? Math.atan2(dx, dz) : g.th;
  const dh = angleDiff(g.ah, goal);
  let turned = true;
  if (dh !== 0) {
    let wmax = T.FLANK_SPEED / Math.max(1, g.width * 0.5);
    if (wmax > T.FRAME_TURN) wmax = T.FRAME_TURN;
    wmax *= cohesion;
    if (Math.abs(dh) <= wmax * dt) {
      g.ah = goal;
      g.aw = 0;
    } else {
      const w = dh > 0 ? wmax : -wmax;
      g.ah += w * dt;
      g.aw = w;
      turned = false;
    }
  } else {
    g.aw = 0;
  }
  g.dirty = true;
  if (there && turned && goal === g.th) {
    g.moving = false;
    g.aw = 0;
    return true;
  }
  return false;
}

/** Fait avancer la tête d'une colonne le long de son itinéraire. Retourne true à l'arrivée. */
export function stepColumn(g: FormGroup, dt: number): boolean {
  const left = g.total - g.s;
  // cohésion : la tête ralentit quand un agent décroche de son emplacement. Un ou deux mètres de retard sont normaux
  // en marche (un agent qui contourne un potelet) : l'ancienne règle (pleine allure sous 0,6 m, 20 % à 2,2 m) faisait
  // avancer les colonnes par à-coups à 0,2-0,4 m/s — « ils ne vont pas directement sur la position ».
  let cohesion = 1 - (g.errAll - 0.6) / 1.6;
  // au trot (mouvement urgent ordonné par le commandement), la colonne n'attend pas un retardataire resté
  // derrière elle : il ne pourrait pas la remonter, et recolle à l'arrêt
  const floor = g.speed > T.SPEED_PACE * 1.4 ? 0.55 : 0.2;
  if (cohesion > 1) cohesion = 1;
  else if (cohesion < floor) cohesion = floor;
  let want = g.speed * cohesion;
  const stop = Math.sqrt(2 * T.FRAME_DECEL * (left > 0 ? left : 0));
  if (want > stop) want = stop;
  g.v = approachTo(g.v, want, T.FRAME_ACCEL * dt, T.FRAME_DECEL * 2 * dt);
  g.s += g.v * dt;
  g.dirty = true;
  if (g.s >= g.total - 0.004) {
    g.s = g.total;
    g.v = 0;
    g.moving = false;
    return true;
  }
  return false;
}

/** Reconstruit les blocs de l'unité avec l'effectif apte du moment (pertes, retours), sans changer de repère. */
export function reform(k: Kernel, u: Unit): void {
  if (u.groups.length !== 1) return;
  const g = u.groups[0];
  const kind = g.kind;
  if (kind === F_NONE) return;
  const moving = g.moving;
  const tx = g.tx;
  const tz = g.tz;
  const th = g.th;
  const speed = g.speed;
  const v = g.v;
  const wheel = g.wheel;
  const follow = g.followId;
  const doorW = g.doorW;
  const doorX = g.doorX;
  const doorUntil = g.doorUntil;
  const avx = g.avx;
  const avz = g.avz;
  const n = gather(k, u);
  clearSlots(u);
  const agents = k.agentsTmp;
  if (kind === F_LINE) buildLine(k, g, agents, n, g.ax, g.az, g.ah, g.width > 0 ? g.width : 0, 0);
  else if (kind === F_TORTUE) buildTortue(k, g, agents, n, g.ax, g.az, g.ah);
  else if (kind === F_SCREEN) buildScreen(k, g, agents, n, g.ax, g.az, g.ah, g.radius);
  else if (kind === F_BOX) buildBox(k, g, agents, n, g.ax, g.az, g.ah, g.radius, Math.max(0.3, g.width / 2 - T.ESCORT_SIDE));
  else if (kind === F_COLUMN) buildColumn(g, agents, n, g.ax, g.az, Math.sin(g.ah), Math.cos(g.ah), g.files, u.squad.leaderId);
  else buildHold(g, agents, n);
  adopt(g, agents, n);
  g.moving = moving;
  g.tx = tx;
  g.tz = tz;
  g.th = th;
  g.speed = speed;
  g.v = v;
  g.wheel = wheel;
  g.followId = follow;
  g.doorW = doorW;
  g.doorX = doorX;
  g.doorUntil = doorUntil;
  g.avx = avx;
  g.avz = avz;
  g.dirty = true;
  placeGroup(k, g);
  if (!moving) settleSlots(k, g);
}

/** Tous les blocs de l'unité sont-ils en place (écart toléré) ? Met à jour les mesures. */
export function allSettled(u: Unit, tolerance: number): boolean {
  let ok = true;
  for (let i = 0; i < u.groups.length; i++) {
    const g = u.groups[i];
    measure(g);
    g.settled = !g.moving && g.errAll <= tolerance;
    if (!g.settled) ok = false;
  }
  return ok;
}

/** Barycentre de l'effectif apte de l'unité, dans k.v2. */
export function unitCenter(k: Kernel, u: Unit): void {
  centroid(k, u.agents);
}

/** Chef de l'unité s'il est valide. */
export function leaderOf(k: Kernel, u: Unit): Person | null {
  const p = u.squad.leaderId !== 0 ? k.ctx.people.get(u.squad.leaderId) : undefined;
  return p ?? null;
}

/** Compte rendu radio de l'unité à l'échelon qui l'a commandée. */
export function report(k: Kernel, u: Unit, body: string, priority: 0 | 1 | 2 = 1, expectReply = true): void {
  k.say(u, frame(superior(k, u, u.task ?? u.order), u.squad.name, body, expectReply), priority, u.parent ? 'unite' : 'commandement');
}

/** Formation en place : événement et compte rendu (une fois par ordre). */
export function inPlace(k: Kernel, u: Unit, body: string): void {
  setPhase(k, u, 'en_place');
  if (u.reported) return;
  u.reported = true;
  const g = u.groups.length > 0 ? u.groups[0] : null;
  k.emit(IN_PLACE_EVENT, { squadId: u.id, x: g ? g.ax : 0, z: g ? g.az : 0 });
  if (body !== '') report(k, u, body);
}

/** Fin d'une manœuvre ou d'une tâche : événement libre pour le commandement et l'interface. */
export function done(k: Kernel, u: Unit, type: OrderType, ok: boolean, reason: string): void {
  k.emit(ORDER_DONE_EVENT, { squadId: u.id, type, ok, reason });
}

/** Personne ou véhicule désigné par un identifiant d'entité. */
export function personById(k: Kernel, id: EntityId): Person | null {
  if (id <= 0) return null;
  return k.ctx.people.get(id) ?? null;
}

export function vehicleById(k: Kernel, id: EntityId): Vehicle | null {
  if (id <= 0) return null;
  return k.ctx.vehicles.get(id) ?? null;
}

/** La formation en cours est-elle une formation alignée (ligne, tortue, écran, escorte) ? */
export function isAligned(g: FormGroup | undefined): boolean {
  return !!g && (g.kind === F_LINE || g.kind === F_TORTUE || g.kind === F_SCREEN || g.kind === F_BOX);
}

export function hasFormation(u: Unit): boolean {
  return u.groups.length > 0 && u.groups[0].kind !== F_NONE && u.groups[0].kind !== F_HOLD;
}

/** Vitesse commune que tout le premier rang peut tenir à l'allure de course (m/s). */
export function commonRunSpeed(u: Unit, wanted: number): number {
  return commonSpeed(u, wanted, 2, 0.94);
}

/**
 * Vitesse commune que tout le rang peut tenir au trot (m/s) : sous la vitesse de course de chacun (avec sa
 * charge, son souffle), pour que personne ne doive sprinter pour garder sa place.
 */
export function commonTrotSpeed(u: Unit, wanted: number): number {
  return commonSpeed(u, wanted, 1, 0.95);
}

function commonSpeed(u: Unit, wanted: number, gait: 1 | 2, margin: number): number {
  let lim = wanted;
  const agents = u.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.able || !a.hasSlot || a.op !== null) continue;
    const l = (gait === 2 ? a.lim2 : a.lim1) * margin;
    if (l < lim && l > 1) lim = l;
  }
  return lim;
}

/** Souffle moyen (0..100) des agents valides de l'unité, à pied et dans le rang. */
export function unitStamina(u: Unit): number {
  let s = 0;
  let n = 0;
  const agents = u.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.able || a.crew || a.op !== null || a.p.vehicleId !== 0) continue;
    s += a.p.stamina;
    n++;
  }
  return n > 0 ? s / n : 100;
}

/**
 * Allure maximale que le souffle de l'unité permet encore (m/s) : à bout de souffle, une unité lancée à la
 * course repasse au trot, puis au pas soutenu (Infinity : pas de limite).
 */
export function staminaCap(k: Kernel, u: Unit): number {
  const s = unitStamina(u);
  if (s >= T.STAMINA_UNIT_EASE) return Infinity;
  if (s >= T.STAMINA_UNIT_SPENT) return commonTrotSpeed(u, k.tuning.trot);
  return k.tuning.march;
}

/**
 * Allure d'une colonne (m/s) selon l'urgence et le trajet : course sur un mouvement urgent (appui d'une unité
 * prise à partie : u.trotUntil), trot vers un point éloigné ou sur ordre pressant du joueur (u.briskUntil),
 * pas soutenu sur un trajet court. Bornée par ce que le rang peut tenir et par son souffle.
 */
export function columnSpeed(k: Kernel, u: Unit, g: FormGroup): number {
  const tu = k.tuning;
  const left = g.total - g.s;
  let v: number;
  if (k.now < u.trotUntil) v = commonRunSpeed(u, tu.run);
  else if (k.now < u.briskUntil || left > T.TROT_FROM) v = commonTrotSpeed(u, tu.trot);
  else v = tu.march;
  const cap = staminaCap(k, u);
  return v < cap ? v : cap;
}

/**
 * Allure d'une ligne (ou d'un bloc aligné) qui se porte en avant d'un bloc : pas cadencé face à une foule
 * proche, pas soutenu hors contact, trot sur un mouvement urgent.
 */
export function lineSpeed(k: Kernel, u: Unit): number {
  const tu = k.tuning;
  if (k.now < u.trotUntil) return commonTrotSpeed(u, tu.trot);
  const s = u.sense;
  if (s.crowd > 0 || s.violent > 0 || k.now - s.lastIncomingAt < 8) return tu.pace;
  return tu.march;
}

/** L'unité est-elle sous la pression de la foule (violences, contact, projectiles ou blessé récents) ? */
export function underPressure(k: Kernel, u: Unit): boolean {
  const s = u.sense;
  return s.violent > 0 || s.contact > 0 || k.now - s.lastIncomingAt < 8 || k.now - s.hurtAt < 8;
}
