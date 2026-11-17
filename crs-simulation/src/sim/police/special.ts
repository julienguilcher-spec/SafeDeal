/* =====================================================================================
 * FORCES DE L'ORDRE — manœuvres particulières :
 *
 *   releve              la section fraîche s'aligne 10 m derrière, la section relevée se replie à
 *                       travers elle, puis la relève prend la position (bible §E.8) ;
 *   couper_circulation  barrage en travers de la voie la plus proche (service 'traffic.control') ;
 *   filtrer             le même avec une porte de passage (station de métro : 'crowd.metro') ;
 *   embarquer/debarquer véhicules de l'unité (un agent sort par véhicule toutes les 0,6 s) ;
 *   équipages           conduits par le service 'vehicles.autopilot'.
 * L'encerclement est dans encircle.ts.
 * ===================================================================================== */

import type { EntityId, SquadOrder, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { MetroApi, TrafficControlApi } from '@/core/extensions';
import { angleDiff, cardinalFr, wrapAngle } from '@/core/math';
import type { Unit } from './brain';
import { F_NONE, agentOf, unitOf } from './brain';
import type { Kernel } from './kernel';
import {
  allSettled, done, formHold, formLate, formLine, inPlace, leaderOf, mainGroup, moveTo, report, setPhase, setStep, unitCenter,
} from './mcore';
import { spell } from './radio';
import { formStreetBarrage, markBarrage } from './barrages';
import { fleetOf } from './tree';
import * as T from './tuning';

// ───────────────────────────── relève ─────────────────────────────

function findRelieved(k: Kernel, u: Unit, o: SquadOrder): Unit | null {
  if (o.targetId > 0) {
    const a = agentOf(k.ctx.people.get(o.targetId));
    if (a && a.root && a.root !== u) return a.root;
    const s = unitOf(k.ctx.squads.get(o.targetId));
    if (s && s.lead !== u) return s.lead;
  }
  let best: Unit | null = null;
  let bestD = 45 * 45;
  for (let i = 0; i < k.roots.length; i++) {
    const r = k.roots[i];
    if (r === u || r.groups.length === 0 || r.groups[0].kind === F_NONE) continue;
    const g = r.groups[0];
    const d = (g.ax - o.x) * (g.ax - o.x) + (g.az - o.z) * (g.az - o.z);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function startRelief(k: Kernel, u: Unit, o: SquadOrder): void {
  const target = findRelieved(k, u, o);
  const m = u.man;
  if (!target || target.groups.length === 0) {
    formLine(k, u, o.x, o.z, o.heading, o.width);
    m.otherId = 0;
    setStep(k, u, 3);
    setPhase(k, u, 'mise_en_place');
    return;
  }
  const tg = target.groups[0];
  m.otherId = target.id;
  m.x0 = tg.ax;
  m.z0 = tg.az;
  m.h0 = tg.ah;
  m.deployWidth = tg.width;
  const fx = Math.sin(tg.ah);
  const fz = Math.cos(tg.ah);
  formLine(k, u, tg.ax - fx * T.RELIEF_BEHIND, tg.az - fz * T.RELIEF_BEHIND, tg.ah, tg.width);
  setStep(k, u, 0);
  setPhase(k, u, 'mise_en_place');
}

export function progressRelief(k: Kernel, u: Unit, arrived: boolean): void {
  const m = u.man;
  const g = u.groups[0];
  const fx = Math.sin(m.h0);
  const fz = Math.cos(m.h0);
  switch (m.step) {
    case 0:
      if (allSettled(u, 0.5) || k.now - m.stepT > 30) {
        const target = unitOf(k.ctx.squads.get(m.otherId));
        const leader = leaderOf(k, u);
        report(k, u, 'Relève alignée derrière la ligne, passage de ligne');
        if (target && target.isRoot) {
          k.ctx.squads.issue(target.id, {
            type: 'repli', x: m.x0 - fx * T.RELIEF_WITHDRAW, z: m.z0 - fz * T.RELIEF_WITHDRAW, heading: m.h0, width: m.deployWidth,
            maxForce: target.order ? target.order.maxForce : u.order!.maxForce, issuedBy: leader ? leader.id : 0,
          });
        }
        setStep(k, u, 1);
        setPhase(k, u, 'action');
      }
      break;
    case 1: {
      // la section relevée passe derrière notre ligne, puis nous prenons sa position
      const target = unitOf(k.ctx.squads.get(m.otherId));
      const tg = target && target.groups.length > 0 ? target.groups[0] : null;
      const passed = !tg || (tg.ax - m.x0) * fx + (tg.az - m.z0) * fz < -(T.RELIEF_BEHIND + 2);
      if (passed || k.now - m.stepT > 25) {
        moveTo(g, m.x0, m.z0, m.h0, k.tuning.pace);
        setStep(k, u, 2);
        setPhase(k, u, 'mouvement');
      }
      break;
    }
    case 2:
      if (arrived) {
        setStep(k, u, 3);
        setPhase(k, u, 'mise_en_place');
      }
      break;
    case 3:
      if (u.phase === 'mise_en_place' && (allSettled(u, T.IN_PLACE_TOLERANCE) || formLate(k, u))) {
        const target = unitOf(k.ctx.squads.get(m.otherId));
        if (target) target.needsRelief = false;
        inPlace(k, u, 'Relève effectuée, je tiens la position face ' + cardinalFr(g.ah));
        done(k, u, 'releve', true, '');
      }
      break;
    default:
      break;
  }
}

// ───────────────────────────── barrages de rue ─────────────────────────────

export function startBarrage(k: Kernel, u: Unit, o: SquadOrder): void {
  const doorW = o.type === 'filtrer' ? T.FILTER_DOOR : 0;
  // rue bordée de façades : barrée de façade à façade, pour tout le monde (barrages.ts)
  if (formStreetBarrage(k, u, o.x, o.z, o.heading, doorW)) {
    setStep(k, u, 0);
    setPhase(k, u, 'mise_en_place');
    return;
  }
  let x = o.x;
  let z = o.z;
  let h = o.heading;
  const road = k.road;
  if (k.ctx.world.nearestRoad(x, z, road, 40)) {
    x = road.x;
    z = road.z;
    h = Math.cos(angleDiff(road.heading, o.heading)) >= 0 ? road.heading : wrapAngle(road.heading + Math.PI);
  }
  markBarrage(k, u, formLine(k, u, x, z, h, o.width, doorW, T.BARRAGE_SPACING));
  setStep(k, u, 0);
  setPhase(k, u, 'mise_en_place');
}

export function progressBarrage(k: Kernel, u: Unit): void {
  if (u.phase !== 'mise_en_place') return;
  if (!(allSettled(u, T.IN_PLACE_TOLERANCE) || formLate(k, u))) return;
  const ctx = k.ctx;
  const g = u.groups[0];
  const m = u.man;
  const type = u.order!.type;
  const leader = leaderOf(k, u);
  const traffic = ctx.service<TrafficControlApi>(EXT.traffic);
  if (traffic && m.closureId === 0) {
    // rue barrée de façade à façade : la ligne est le barrage (pas de barrières où les agents se tiennent, et la
    // ligne s'ouvre pour les collègues et les secours) ; ailleurs, barrières posées par la circulation
    if (m.bWalls && traffic.isClosed(m.bEdge)) {
      m.closureId = -1;
    } else {
      const c = traffic.closeRoad(g.ax, g.az, leader ? leader.id : 0, u.id, m.bWalls);
      if (c) m.closureId = c.id;
    }
  }
  let station = '';
  if (type === 'filtrer') {
    const metro = ctx.service<MetroApi>(EXT.metro);
    const st = metro ? metro.nearest(g.ax, g.az, 35) : null;
    if (metro && st) {
      metro.setFiltered(st.id, true, u.id);
      m.stationId = st.id;
      station = st.name;
    }
  }
  const sec = ctx.world.sectorName(g.ax, g.az);
  const where = sec && sec !== 'secteur inconnu' ? ', ' + sec : '';
  inPlace(k, u, type === 'filtrer'
    ? 'Barrage filtrant en place' + (station !== '' ? ', sortie de la station ' + station : where)
    : 'Circulation coupée' + where + ', barrage en place face ' + cardinalFr(g.ah));
  done(k, u, type, true, '');
}

// ───────────────────────────── véhicules ─────────────────────────────

const fleet: number[] = [];
const freeSeats: number[] = [];
const usedVehicles: EntityId[] = [];

function passengerSeatsFree(v: Vehicle): number {
  let n = 0;
  for (let i = 0; i < v.seats.length; i++) if (v.seats[i] === 0 && v.def.seats[i] && v.def.seats[i].role !== 'driver') n++;
  return n;
}

function driverSeatFree(v: Vehicle): boolean {
  for (let i = 0; i < v.seats.length; i++) if (v.def.seats[i] && v.def.seats[i].role === 'driver') return v.seats[i] === 0;
  return false;
}

function usable(v: Vehicle | undefined): v is Vehicle {
  return !!v && v.faction === 'police' && !v.def.flying && (v.state === 'ok' || v.state === 'damaged');
}

export function startEmbark(k: Kernel, u: Unit, o: SquadOrder): void {
  const ctx = k.ctx;
  const m = u.man;
  fleet.length = 0;
  const named = ctx.vehicles.get(o.targetId);
  if (o.targetId > 0 && usable(named)) fleet.push(named.id);
  else fleetOf(k, u, fleet);
  if (fleet.length === 0) {
    // à défaut : véhicules de police proches
    unitCenter(k, u);
    const n = ctx.vehicles.queryRadius(k.v2.x, k.v2.z, 60, k.vehicles);
    for (let i = 0; i < n; i++) if (usable(k.vehicles[i]) && k.vehicles[i].kind !== 'fourgon_cellulaire') fleet.push(k.vehicles[i].id);
  }
  if (u.groups.length === 0 || u.groups[0].kind === F_NONE) formHold(k, u);
  for (let i = 0; i < u.groups.length; i++) {
    u.groups[i].moving = false;
    u.groups[i].followId = 0;
  }
  if (fleet.length === 0) {
    setPhase(k, u, 'refuse');
    report(k, u, 'Aucun véhicule disponible pour embarquer');
    u.reported = true;
    done(k, u, 'embarquer', false, 'Aucun véhicule disponible.');
    return;
  }
  for (let i = 0; i < fleet.length; i++) {
    const v = ctx.vehicles.get(fleet[i]);
    // le fourgon cellulaire garde ses places pour les personnes interpellées
    freeSeats[i] = usable(v) && v.kind !== 'fourgon_cellulaire' ? passengerSeatsFree(v) : 0;
  }
  let assigned = 0;
  const agents = u.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    a.boardId = 0;
    const p = a.p;
    if (!a.able && !a.crew) continue;
    if (p.vehicleId !== 0 || p.isPlayer) continue;
    // véhicule de son groupe d'abord, puis le premier qui a de la place
    let pick = -1;
    for (let x: Unit | null = a.home; x && pick < 0; x = x.parent) {
      const vi = x.squad.vehicleId !== 0 ? fleet.indexOf(x.squad.vehicleId) : -1;
      if (vi < 0) continue;
      const v = ctx.vehicles.get(fleet[vi]);
      if (p.poste === 'conducteur' && usable(v) && driverSeatFree(v)) pick = vi;
      else if (freeSeats[vi] > 0) pick = vi;
    }
    for (let j = 0; j < fleet.length && pick < 0; j++) if (freeSeats[j] > 0) pick = j;
    if (pick < 0) continue;
    const v = ctx.vehicles.get(fleet[pick])!;
    if (!(p.poste === 'conducteur' && driverSeatFree(v) && fleet[pick] === (a.home ? a.home.squad.vehicleId : 0))) freeSeats[pick]--;
    a.boardId = v.id;
    a.boardAt = k.now;
    a.hasSlot = false;
    a.pathN = 0;
    assigned++;
  }
  m.pending = assigned;
  setStep(k, u, 0);
  setPhase(k, u, 'action');
}

export function startDisembark(k: Kernel, u: Unit, o: SquadOrder): void {
  const m = u.man;
  const leader = leaderOf(k, u);
  const fx = Math.sin(o.heading);
  const fz = Math.cos(o.heading);
  // ordre donné sans point (celui du chef, encore à bord) : la ligne se forme une douzaine de mètres devant les véhicules
  const ahead = leader && leader.vehicleId !== 0 && (o.x - leader.x) * (o.x - leader.x) + (o.z - leader.z) * (o.z - leader.z) < 64 ? 12 : 0;
  m.gx = o.x + fx * ahead;
  m.gz = o.z + fz * ahead;
  m.gh = o.heading;
  m.deployWidth = o.width;
  m.nextExitAt = k.now + 0.4;
  for (let i = 0; i < u.agents.length; i++) u.agents[i].boardId = 0;
  setStep(k, u, 0);
  setPhase(k, u, 'action');
}

export function progressBoarding(k: Kernel, u: Unit): void {
  const ctx = k.ctx;
  const m = u.man;
  const agents = u.agents;
  if (u.order!.type === 'embarquer') {
    if (m.step !== 0) return;
    let waiting = 0;
    let aboard = 0;
    let left = 0;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.p.vehicleId !== 0) aboard++;
      else if (a.boardId !== 0 && a.able) waiting++;
      else if (a.able && !a.p.isPlayer) left++;
    }
    if (waiting > 0 && k.now - m.stepT < 90) return;
    for (let i = 0; i < agents.length; i++) agents[i].boardId = 0;
    setStep(k, u, 1);
    setPhase(k, u, 'embarque');
    u.reported = true;
    report(k, u, 'Embarqué, ' + spell(aboard) + ' à bord' + (left + waiting > 0 ? ', ' + spell(left + waiting) + ' sans place restent à pied' : ''));
    done(k, u, 'embarquer', left + waiting === 0, left + waiting === 0 ? '' : 'Places insuffisantes.');
    return;
  }
  // débarquement : un agent par véhicule toutes les 0,6 s, puis mise en ligne
  if (m.step === 0) {
    if (k.now < m.nextExitAt) return;
    m.nextExitAt = k.now + T.EXIT_INTERVAL;
    usedVehicles.length = 0;
    let aboard = 0;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const p = a.p;
      if (p.vehicleId === 0 || a.crew || p.isPlayer) continue;
      aboard++;
      if (usedVehicles.indexOf(p.vehicleId) >= 0) continue;
      usedVehicles.push(p.vehicleId);
      if (ctx.vehicles.exit(p)) {
        aboard--;
        a.lastX = p.x;
        a.lastZ = p.z;
      }
    }
    if (aboard > 0 && k.now - m.stepT < 60) return;
    formLine(k, u, m.gx, m.gz, m.gh, m.deployWidth);
    setStep(k, u, 1);
    setPhase(k, u, 'mise_en_place');
  } else if (m.step === 1 && u.phase === 'mise_en_place') {
    if (allSettled(u, T.IN_PLACE_TOLERANCE) || formLate(k, u)) {
      const g = mainGroup(u);
      inPlace(k, u, 'Débarqué, en ligne face ' + cardinalFr(g.ah) + ', ' + spell(u.formed) + ' à pied');
      done(k, u, 'debarquer', true, '');
    }
  }
}

// ───────────────────────────── équipages ─────────────────────────────

/** Ordre donné à un équipage : conduite par le pilote automatique. Retourne false si l'unité n'a pas d'engin. */
export function startCrewOrder(k: Kernel, u: Unit, o: SquadOrder): boolean {
  const v = k.ctx.vehicles.get(u.squad.vehicleId);
  if (!v) return false;
  const ap = k.autopilot;
  const type = o.type;
  u.groups.length = 0;
  if (type === 'embarquer' || type === 'debarquer') {
    for (let i = 0; i < u.agents.length; i++) {
      const p = u.agents[i].p;
      if (type === 'debarquer') {
        if (p.vehicleId !== 0) k.ctx.vehicles.exit(p);
      } else if (p.vehicleId === 0 && !p.isPlayer) {
        k.ctx.vehicles.enter(p, v, p.poste === 'conducteur' ? 'driver' : undefined);
      }
    }
    setPhase(k, u, type === 'embarquer' ? 'embarque' : 'en_place');
    u.reported = true;
    return true;
  }
  if (!ap) {
    setPhase(k, u, 'refuse');
    u.reported = true;
    u.ackText = '';
    report(k, u, 'Engin immobilisé : pas de pilote disponible');
    done(k, u, type, false, 'Pilote automatique indisponible.');
    return true;
  }
  if (type === 'tenir' || type === 'cesser' || type === 'libre') {
    ap.stop(v);
    setPhase(k, u, 'en_place');
    u.reported = true;
    return true;
  }
  let ok: boolean;
  if (type === 'suivre' || type === 'escorter') {
    const id = o.targetId > 0 ? o.targetId : o.issuedBy;
    ok = id !== 0 && ap.follow(v, id, type === 'escorter' ? 10 : 8);
  } else {
    ok = ap.driveTo(v, o.x, o.z, { speed: type === 'refoulement' || type === 'avancer' ? 2.2 : undefined, stopBefore: 1 });
  }
  if (!ok) {
    setPhase(k, u, 'refuse');
    u.reported = true;
    report(k, u, 'Itinéraire impossible pour l’engin');
    done(k, u, type, false, 'Aucun itinéraire.');
    return true;
  }
  setStep(k, u, 1);
  setPhase(k, u, 'mouvement');
  return true;
}

/** Suivi d'un équipage en route. Retourne true si l'unité est bien un équipage conduit. */
export function progressCrew(k: Kernel, u: Unit): boolean {
  const v = k.ctx.vehicles.get(u.squad.vehicleId);
  const ap = k.autopilot;
  if (!v || !ap) return !!v;
  if (u.phase !== 'mouvement' || u.man.step !== 1) return true;
  const st = ap.status(v);
  if (st.mode === 'follow') return true;
  if (st.state === 'arrive' || st.mode === 'idle') {
    setStep(k, u, 2);
    inPlace(k, u, 'Engin en position');
    done(k, u, u.order!.type, true, '');
  } else if (st.state === 'echec' || (st.state === 'bloque' && st.blockedFor > 25)) {
    setStep(k, u, 2);
    setPhase(k, u, 'refuse');
    u.reported = true;
    report(k, u, st.state === 'echec' ? 'Engin arrêté : itinéraire impossible' : 'Engin bloqué par un obstacle, demande dégagement');
    done(k, u, u.order!.type, false, 'Engin bloqué.');
  }
  return true;
}
