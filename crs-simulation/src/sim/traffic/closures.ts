/* =====================================================================================
 * CIRCULATION — fermeture de rues : service EXT.traffic (TrafficControlApi de src/core/extensions.ts).
 *
 * Fermer une rue ferme tout le TRONÇON entre deux carrefours (les arêtes du graphe sont souvent très
 * courtes : 13 m en médiane à Paris) et pose un barrage de barrières Vauban en travers de la chaussée,
 * au point demandé (écarté des carrefours pour ne pas gêner la rue transversale). La bible (§I.3) donne
 * « 4 barrières par tranche de 10 m, mise en place en 30 à 60 s » : la rue est interdite aussitôt (les
 * itinéraires se recalculent), les barrières arrivent une à une, puis le compte rendu radio est émis.
 *
 * Le barrage S'OUVRE pour les véhicules prioritaires (police, secours, sirène ou feux allumés) et pour les
 * automobilistes déjà engagés qui sortent : les barrières sont rangées le long des trottoirs, puis remises.
 * Un périmètre (closeArea) ferme chaque rue qui franchit le cercle ; on peut toujours en sortir.
 * ===================================================================================== */

import type { EntityId, GameContext, Prop, Vehicle } from '@/core/contracts';
import type { RoadClosure, TrafficControlApi } from '@/core/extensions';
import type { RadioPhrases } from '@/gameplay/radio/api';
import { BARRED_EVENT, CLOSED_EVENT, GATE_EVENT, OPENED_EVENT } from './api';
import type { ClosureEvent, TrafficTuning } from './api';
import type { ChainInfo, EdgeHit, EdgePoint, RoadCache } from './graph';
import { E_ONEWAY, makeEdgeHit } from './graph';
import { BARRIER_LENGTH, CLOSURE_REACH } from './tuning';

const RADIO_PHRASES = 'radio.phrases';
/** État du pilote automatique (service du module des véhicules) : un véhicule arrêté devant le barrage veut-il passer ? */
const AUTOPILOT_SERVICE = 'vehicles.autopilot';
interface AutopilotView {
  status(v: Vehicle): Readonly<{ mode: string; state: string }>;
}

/** Fiche interne d'une fermeture. */
export class ClosureRec {
  readonly edges: number[] = [];
  readonly dirs: number[] = [];
  /** Direction du tronçon au barrage (unitaire) et largeur de chaussée. */
  dx = 0;
  dz = 1;
  width = 7;
  /** Écart à l'axe de la voie de circulation (0 en sens unique). */
  lane = 0;
  // barrières : identifiants et poses (fermée / rangée le long du trottoir)
  readonly barriers: EntityId[] = [];
  readonly lat: number[] = [];
  placed = 0;
  total = 0;
  placeT = 0;
  placeStep = 0;
  barred = false;
  byId: EntityId = 0;
  /** Périmètre dont cette fermeture fait partie (0 = rue fermée isolément) : on peut en sortir. */
  areaId = 0;
  areaX = 0;
  areaZ = 0;
  areaR = 0;
  /** Carrefours aux deux bouts du tronçon fermé. */
  nodeA = -1;
  nodeB = -1;
  /**
   * Côté vers lequel le barrage fait face (unitaire, le long de la rue) : la foule, la rue qu'il interdit. Inconnu
   * (faced = false) pour des barrières seules, sans unité ni foule : tout le tronçon est alors la rue fermée.
   */
  faced = false;
  faceX = 0;
  faceZ = 0;
  /** Véhicules déjà engagés au moment de la fermeture : autorisés à franchir le barrage pour sortir. */
  readonly permits = new Set<EntityId>();
  gateOpen = false;
  gateUntil = -1;
  gateFor: EntityId = 0;

  constructor(readonly closure: RoadClosure) {}
}

/** Un véhicule prioritaire franchit les barrages. */
export function isPriority(v: Vehicle): boolean {
  return v.faction === 'police' || v.faction === 'rescue' || v.faction === 'medic' || v.siren !== 0 || v.beacons;
}

export class Closures implements TrafficControlApi {
  readonly closures: RoadClosure[] = [];
  readonly recs: ClosureRec[] = [];
  /** Incrémenté à chaque fermeture ou réouverture : les automobilistes revoient leur itinéraire. */
  stamp = 0;
  /** Arêtes fermées (1) : lu par le calcul d'itinéraire. */
  closedEdges: Uint8Array = new Uint8Array(0);
  /** Compte les véhicules de la circulation (fourni par le gestionnaire des véhicules). */
  counter: ((x: number, z: number, r: number, out: { moving: number; stopped: number }) => void) | null = null;
  /** Résultat du dernier scan d'itinéraire (voir scan). */
  blockS = -1;
  blockRec: ClosureRec | null = null;
  passS = -1;
  passRec: ClosureRec | null = null;

  private ctx!: GameContext;
  private nextId = 1;
  private nextArea = 1;
  private tick = 0;
  private quiet = false;
  private readonly byEdge = new Map<number, ClosureRec>();
  private readonly hit: EdgeHit = makeEdgeHit();
  private readonly pt: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly info: ChainInfo = { nodeA: -1, nodeB: -1, length: 0, count: 0 };
  private readonly tmpEdges: number[] = [];
  private readonly tmpDirs: number[] = [];
  private readonly tmpNodes: number[] = [];
  private readonly tmpVehicles: Vehicle[] = [];
  private readonly count = { moving: 0, stopped: 0 };
  private seen: Uint32Array = new Uint32Array(0);
  private seenGen = 0;

  constructor(private readonly cache: RoadCache, private readonly tuning: TrafficTuning) {}

  attach(ctx: GameContext): void {
    this.ctx = ctx;
  }

  /** Remise à zéro de session : les objets du décor ont déjà été retirés par le moteur. */
  reset(): void {
    this.closures.length = 0;
    this.recs.length = 0;
    this.byEdge.clear();
    this.nextId = 1;
    this.nextArea = 1;
    this.tick = 0;
    this.stamp++;
    this.onGraph();
  }

  /** Le graphe a été reconstruit : les fermetures d'une autre carte n'ont plus de sens. */
  onGraph(): void {
    const n = this.cache.edgeCount;
    if (this.closedEdges.length !== n) {
      this.closedEdges = new Uint8Array(n);
      this.seen = new Uint32Array(n);
      this.seenGen = 0;
      for (let i = this.recs.length - 1; i >= 0; i--) this.remove(i, false);
    }
  }

  // ───────────────────────────── TrafficControlApi ─────────────────────────────

  isClosed(edgeId: number): boolean {
    return edgeId >= 0 && edgeId < this.closedEdges.length && this.closedEdges[edgeId] !== 0;
  }

  closeRoad(x: number, z: number, byId: EntityId, squadId = 0, held = false): RoadClosure | null {
    const rec = this.closeAt(x, z, byId, squadId, false, held);
    return rec ? rec.closure : null;
  }

  closeArea(x: number, z: number, radius: number, byId: EntityId): RoadClosure[] {
    return this.closeAreaWith(x, z, radius, byId, false);
  }

  open(closureId: number): void {
    for (let i = 0; i < this.recs.length; i++) {
      if (this.recs[i]!.closure.id === closureId) {
        this.remove(i, true);
        return;
      }
    }
  }

  openAll(): void {
    const n = this.recs.length;
    if (n === 0) return;
    this.quiet = true;
    for (let i = n - 1; i >= 0; i--) this.remove(i, true);
    this.quiet = false;
    this.radio('rue_rouverte', 'toutes les voies', `Toutes les rues sont rouvertes. La circulation reprend.`, 0, 0, 0);
  }

  countNear(x: number, z: number, radius: number): { moving: number; stopped: number } {
    const out = this.count;
    out.moving = 0;
    out.stopped = 0;
    if (this.counter) this.counter(x, z, radius, out);
    return out;
  }

  // ───────────────────────────── fermeture ─────────────────────────────

  /** Ferme une rue, barrières déjà en place et sans compte rendu radio (option de départ d'une session). */
  closeRoadInstant(x: number, z: number): RoadClosure | null {
    const rec = this.closeAt(x, z, 0, 0, true);
    return rec ? rec.closure : null;
  }

  /** Ferme un périmètre ; `instant` : barrières déjà en place (option de départ), sans compte rendu radio. */
  closeAreaWith(x: number, z: number, radius: number, byId: EntityId, instant: boolean): RoadClosure[] {
    const out: RoadClosure[] = [];
    const c = this.cache;
    if (!c.ready || !(radius > 0)) return out;
    const nodes = this.tmpNodes;
    const n = c.nodesInRadius(x, z, radius + Math.min(c.maxEdgeLen, 300), nodes);
    const gen = ++this.seenGen;
    const r2 = radius * radius;
    const areaId = this.nextArea++;
    const pt = this.pt;
    const before = this.nextId;
    this.quiet = true;
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      for (let k = c.adjStart[node]!; k < c.adjStart[node + 1]!; k++) {
        const e = c.adjEdge[k]!;
        if (this.seen[e] === gen) continue;
        this.seen[e] = gen;
        if (!c.isVehicle(e)) continue;
        const a = c.edgeA[e]!;
        const b = c.edgeB[e]!;
        const ax = c.nodeX[a]! - x;
        const az = c.nodeZ[a]! - z;
        const bx = c.nodeX[b]! - x;
        const bz = c.nodeZ[b]! - z;
        const inA = ax * ax + az * az < r2;
        const inB = bx * bx + bz * bz < r2;
        if (inA === inB) continue;
        // point où l'arête franchit le cercle (dichotomie sur l'abscisse)
        const len = c.edgeLen[e]!;
        let lo = 0;
        let hi = len;
        for (let it = 0; it < 12; it++) {
          const mid = (lo + hi) * 0.5;
          c.pointAt(e, mid, 0, pt);
          const dx = pt.x - x;
          const dz = pt.z - z;
          if ((dx * dx + dz * dz < r2) === inA) lo = mid;
          else hi = mid;
        }
        c.pointAt(e, (lo + hi) * 0.5, 0, pt);
        const rec = this.closeAt(pt.x, pt.z, byId, 0, instant);
        if (!rec) continue;
        if (rec.closure.id >= before) {
          rec.areaId = areaId;
          rec.areaX = x;
          rec.areaZ = z;
          rec.areaR = radius;
        }
        if (out.indexOf(rec.closure) < 0) out.push(rec.closure);
      }
    }
    this.quiet = false;
    // compte rendu seulement si ce périmètre a réellement fermé quelque chose de nouveau
    if (this.nextId > before && !instant) {
      const place = this.ctx.world.sectorName(x, z);
      this.radioPerimeter(place, out.length, x, z);
    }
    return out;
  }

  /**
   * `held` : la rue est barrée par la ligne de l'unité `squadId` elle-même (rue barrée par une troupe) — ni barrières
   * à poser, ni ordre « couper la circulation » à lui donner (elle tient déjà la rue, et cet ordre remplacerait le sien).
   */
  private closeAt(x: number, z: number, byId: EntityId, squadId: number, instant: boolean, held = false): ClosureRec | null {
    const c = this.cache;
    if (!c.ready || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const hit = this.hit;
    if (!c.nearestVehicleEdge(x, z, 45, hit)) return null;
    const known = this.byEdge.get(hit.edge);
    if (known) {
      if (squadId !== 0 && known.closure.squadId !== squadId) {
        known.closure.squadId = squadId;
        if (!held) this.order(known, byId);
      }
      return known;
    }
    const edges = this.tmpEdges;
    const dirs = this.tmpDirs;
    const info = this.info;
    c.chain(hit.edge, edges, dirs, info);
    // abscisse du point demandé le long du tronçon
    let s = 0;
    for (let i = 0; i < info.count; i++) {
      const e = edges[i]!;
      if (e === hit.edge) {
        s += dirs[i]! > 0 ? hit.s : c.edgeLen[e]! - hit.s;
        break;
      }
      s += c.edgeLen[e]!;
    }
    // le barrage se tient à l'écart des carrefours : le pilote automatique repère une fermeture à 6 m de son
    // itinéraire, il ne doit pas la voir depuis la rue transversale
    const half = info.length * 0.5;
    const mA = Math.min(half, Math.max(9, c.nodeRadius[info.nodeA]! + CLOSURE_REACH + 1));
    const mB = Math.min(half, Math.max(9, c.nodeRadius[info.nodeB]! + CLOSURE_REACH + 1));
    if (s < mA) s = mA;
    else if (s > info.length - mB) s = info.length - mB;
    const pt = this.pt;
    const at = c.chainPoint(edges, dirs, s, 0, pt);
    if (at < 0) return null;
    // cap de la rue : sens de numérisation de l'arête qui porte le barrage
    let sign = 1;
    for (let i = 0; i < info.count; i++) if (edges[i] === at) sign = dirs[i]!;
    const closure: RoadClosure = {
      id: this.nextId++, edgeId: at, x: pt.x, z: pt.z, heading: Math.atan2(pt.dx * sign, pt.dz * sign), squadId,
      createdAt: this.ctx.clock.now,
    };
    const rec = new ClosureRec(closure);
    for (let i = 0; i < info.count; i++) {
      rec.edges.push(edges[i]!);
      rec.dirs.push(dirs[i]!);
      this.closedEdges[edges[i]!] = 1;
      this.byEdge.set(edges[i]!, rec);
    }
    rec.dx = pt.dx;
    rec.dz = pt.dz;
    rec.nodeA = info.nodeA;
    rec.nodeB = info.nodeB;
    rec.width = Math.max(3, c.edgeWidth[at]!);
    rec.lane = (c.edgeFlags[at]! & E_ONEWAY) !== 0 ? 0 : Math.min(rec.width * 0.25, 3.2);
    rec.byId = byId;
    rec.total = held ? 0 : Math.max(2, Math.ceil((rec.width - 0.2) / BARRIER_LENGTH));
    const pitch = rec.width / rec.total;
    for (let i = 0; i < rec.total; i++) rec.lat.push((i - (rec.total - 1) * 0.5) * pitch);
    const t = this.tuning;
    if (instant || held || t.barrierTime <= 0) {
      while (rec.placed < rec.total) this.placeBarrier(rec);
      rec.barred = true;
    } else {
      rec.placeT = t.barrierDelay;
      rec.placeStep = Math.max(0.2, (t.barrierTime - t.barrierDelay) / rec.total);
    }
    this.recs.push(rec);
    this.closures.push(closure);
    this.stamp++;
    this.ctx.events.emitAny(CLOSED_EVENT, this.event(rec));
    if (rec.barred) {
      this.ctx.events.emitAny(BARRED_EVENT, this.event(rec));
      if (!instant) this.report(rec);
    }
    if (squadId !== 0 && !held) this.order(rec, byId);
    return rec;
  }

  private event(rec: ClosureRec): ClosureEvent {
    const cl = rec.closure;
    return { id: cl.id, edgeId: cl.edgeId, x: cl.x, z: cl.z, heading: cl.heading, squadId: cl.squadId, byId: rec.byId };
  }

  /** L'unité désignée reçoit l'ordre de tenir le barrage (sauf si elle l'a déjà). */
  private order(rec: ClosureRec, byId: EntityId): void {
    const cl = rec.closure;
    const squad = this.ctx.squads.get(cl.squadId);
    if (!squad) return;
    const o = squad.order;
    const dx = o.x - cl.x;
    const dz = o.z - cl.z;
    if (o.type === 'couper_circulation' && dx * dx + dz * dz < 400) return;
    // ni à une unité qui filtre ce barrage (elle le tient, avec sa porte), ni pendant une interpellation qu'elle mène
    // depuis ce barrage (tâche : sa formation ne change pas)
    if ((o.type === 'filtrer' || o.type === 'interpeller') && dx * dx + dz * dz < 50 * 50) return;
    this.ctx.squads.issue(cl.squadId, { type: 'couper_circulation', x: cl.x, z: cl.z, heading: cl.heading, width: rec.width, issuedBy: byId });
  }

  private placeBarrier(rec: ClosureRec): void {
    const i = rec.placed++;
    const cl = rec.closure;
    const lat = rec.lat[i]!;
    // droite du sens du tronçon = (−dz, dx) ; la barrière est posée en travers (sa longueur suit son axe x local)
    const x = cl.x - rec.dz * lat;
    const z = cl.z + rec.dx * lat;
    const prop = this.ctx.props.spawn('barriere_vauban', x, z, Math.atan2(rec.dx, rec.dz));
    rec.barriers.push(prop.id);
  }

  private remove(index: number, announce: boolean): void {
    const rec = this.recs[index]!;
    const cl = rec.closure;
    const props = this.ctx.props;
    for (let i = 0; i < rec.barriers.length; i++) {
      const p = props.get(rec.barriers[i]!);
      // une barrière emportée, renversée ou intégrée à une barricade n'est plus la nôtre : elle reste où elle est
      if (p && this.ours(rec, i, p)) props.remove(p.id);
    }
    for (let i = 0; i < rec.edges.length; i++) {
      const e = rec.edges[i]!;
      if (e < this.closedEdges.length) this.closedEdges[e] = 0;
      this.byEdge.delete(e);
    }
    this.recs.splice(index, 1);
    const k = this.closures.indexOf(cl);
    if (k >= 0) this.closures.splice(k, 1);
    this.stamp++;
    if (announce) {
      this.ctx.events.emitAny(OPENED_EVENT, this.event(rec));
      const name = this.streetName(rec);
      this.radio('rue_rouverte', name, `Barrières retirées, ${name}. Circulation rétablie.`, cl.squadId, cl.x, cl.z);
    }
  }

  private ours(rec: ClosureRec, i: number, p: Prop): boolean {
    if (p.kind !== 'barriere_vauban' || p.carriedBy !== 0 || p.toppled || p.state === 'burning') return false;
    const cl = rec.closure;
    const dx = p.x - cl.x;
    const dz = p.z - cl.z;
    const reach = rec.width * 0.5 + rec.total * 2.6 + 4;
    return dx * dx + dz * dz < reach * reach && i < rec.placed;
  }

  // ───────────────────────────── vie du barrage ─────────────────────────────

  update(dt: number): void {
    const recs = this.recs;
    if (recs.length === 0) return;
    const ctx = this.ctx;
    const now = ctx.clock.now;
    // pose progressive des barrières
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]!;
      if (rec.barred) continue;
      rec.placeT -= dt;
      if (rec.placeT > 0) continue;
      this.placeBarrier(rec);
      rec.placeT += rec.placeStep;
      if (rec.placed >= rec.total) {
        rec.barred = true;
        ctx.events.emitAny(BARRED_EVENT, this.event(rec));
        this.report(rec);
      }
    }
    // ouverture pour les prioritaires : un barrage examiné par pas, à tour de rôle
    const rec = recs[this.tick++ % recs.length]!;
    if (rec.placed === 0) return;
    const cl = rec.closure;
    const list = this.tmpVehicles;
    const reach = 30;
    const n = ctx.vehicles.queryRadius(cl.x, cl.z, reach, list);
    let want = now < rec.gateUntil;
    let priority = false;
    let who = rec.gateFor;
    let onLine = false;
    for (let i = 0; i < n; i++) {
      const v = list[i]!;
      if (v.def.flying || v.dormant) continue;
      const rx = v.x - cl.x;
      const rz = v.z - cl.z;
      const along = rx * rec.dx + rz * rec.dz;
      const across = -rx * rec.dz + rz * rec.dx;
      if (Math.abs(across) > rec.width * 0.5 + 1.5) continue;
      const halfL = v.def.length * 0.5;
      if (Math.abs(along) < halfL + 1.6) onLine = true;
      if (!isPriority(v)) continue;
      // il roule vers le barrage (un véhicule de police garé en travers ne l'ouvre pas) ; ou, arrêté nez aux
      // barrières, son conducteur veut passer (le pilote automatique attend devant elles, le joueur accélère) : sans
      // cela il attendait pour de bon devant un barrage qui ne s'ouvre qu'aux véhicules en mouvement
      const closing = -(v.vx * rx + v.vz * rz);
      if ((Math.abs(v.speed) > 0.4 && closing > 0) || this.waitsAtGate(v, rx, rz)) {
        want = true;
        priority = true;
        who = v.id;
      }
    }
    list.length = 0;
    // le barrage reste ouvert un instant après le passage, et jamais ne se referme sur un véhicule
    if (priority) rec.gateUntil = Math.max(rec.gateUntil, now + 2.5);
    if (want && !rec.gateOpen) this.setGate(rec, true, who);
    else if (!want && rec.gateOpen && !onLine) this.setGate(rec, false, 0);
  }

  /**
   * Véhicule prioritaire arrêté tout près du barrage, nez vers lui, qui veut avancer : conducteur à bord qui accélère,
   * ou pilote automatique en route arrêté devant un obstacle. (`rx`, `rz` : position du véhicule par rapport au barrage)
   */
  private waitsAtGate(v: Vehicle, rx: number, rz: number): boolean {
    if (v.seats[0] === 0 || Math.abs(v.speed) > 0.4) return false;
    const d = Math.hypot(rx, rz);
    if (d > v.def.length * 0.5 + 6) return false;
    // nez vers le barrage
    if (-(Math.sin(v.heading) * rx + Math.cos(v.heading) * rz) < 0.6 * d) return false;
    if (v.cmd.throttle > 0.05) return true;
    const ap = this.ctx.service<AutopilotView>(AUTOPILOT_SERVICE);
    if (!ap) return false;
    const st = ap.status(v);
    return (st.mode === 'drive' || st.mode === 'follow') && (st.state === 'attente' || st.state === 'bloque');
  }

  /** Un automobiliste autorisé approche : le barrage s'ouvre pour lui. */
  requestGate(rec: ClosureRec, vehicleId: EntityId): void {
    const until = this.ctx.clock.now + 3;
    if (until > rec.gateUntil) rec.gateUntil = until;
    rec.gateFor = vehicleId;
  }

  private setGate(rec: ClosureRec, open: boolean, vehicleId: EntityId): void {
    const ctx = this.ctx;
    const cl = rec.closure;
    rec.gateOpen = open;
    const h = Math.atan2(rec.dx, rec.dz);
    let left = 0;
    let right = 0;
    for (let i = 0; i < rec.placed; i++) {
      const p = ctx.props.get(rec.barriers[i]!);
      if (!p || !this.ours(rec, i, p)) continue;
      const lat = rec.lat[i]!;
      let x: number;
      let z: number;
      let heading: number;
      if (open) {
        // rangée sur le trottoir, de son côté, parallèle à la rue — assez loin de la voie pour que le pilote
        // automatique d'un engin large (qui voit chaque objet comme un disque de 1,25 m) ne s'y arrête pas
        const side = lat >= 0 ? 1 : -1;
        const rank = side > 0 ? right++ : left++;
        const off = side * Math.max(rec.width * 0.5 + 0.6, rec.lane + 3.3);
        p.blocksMove = false; // tenue ouverte : elle ne barre plus rien
        const fwd = 1.5 + rank * (BARRIER_LENGTH + 0.1);
        x = cl.x - rec.dz * off + rec.dx * fwd;
        z = cl.z + rec.dx * off + rec.dz * fwd;
        heading = h + Math.PI * 0.5;
      } else {
        x = cl.x - rec.dz * lat;
        z = cl.z + rec.dx * lat;
        heading = h;
        p.blocksMove = true;
      }
      p.x = x;
      p.z = z;
      p.heading = heading;
      p.y = ctx.world.heightAt(x, z);
      p.vx = 0;
      p.vz = 0;
      ctx.events.emit('prop:moved', { id: p.id, byId: 0 });
    }
    ctx.events.emitAny(GATE_EVENT, { id: cl.id, open, vehicleId });
  }

  // ───────────────────────────── itinéraires ─────────────────────────────

  /** Ce véhicule a-t-il le droit de franchir ce barrage ? (déjà engagé, ou sortie d'un périmètre) */
  allowed(rec: ClosureRec, v: Vehicle): boolean {
    if (rec.permits.has(v.id)) return true;
    if (rec.areaId !== 0) {
      const dx = v.x - rec.areaX;
      const dz = v.z - rec.areaZ;
      const cl = rec.closure;
      const bx = cl.x - rec.areaX;
      const bz = cl.z - rec.areaZ;
      // à l'intérieur du périmètre, et plus près du centre que le barrage : il sort
      return dx * dx + dz * dz < rec.areaR * rec.areaR && dx * dx + dz * dz < bx * bx + bz * bz + 100;
    }
    return false;
  }

  /**
   * Cherche les barrages sur un itinéraire (polyligne plate, abscisses cumulées) au-delà de `fromS`.
   * Renseigne blockS / blockRec (premier barrage que ce véhicule ne peut pas franchir, −1 si aucun) et
   * passS / passRec (premier barrage qu'il franchira avec autorisation).
   */
  scan(pts: readonly number[], cum: readonly number[], n: number, fromS: number, v: Vehicle | null): void {
    this.blockS = -1;
    this.blockRec = null;
    this.passS = -1;
    this.passRec = null;
    const recs = this.recs;
    if (recs.length === 0 || n < 2) return;
    const r2 = CLOSURE_REACH * CLOSURE_REACH;
    for (let c = 0; c < recs.length; c++) {
      const rec = recs[c]!;
      const cx = rec.closure.x;
      const cz = rec.closure.z;
      let best = Infinity;
      for (let i = 0; i < n - 1; i++) {
        if (cum[i + 1]! < fromS) continue;
        const ax = pts[i * 2]!;
        const az = pts[i * 2 + 1]!;
        const dx = pts[i * 2 + 2]! - ax;
        const dz = pts[i * 2 + 3]! - az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 1e-9 ? ((cx - ax) * dx + (cz - az) * dz) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const ex = cx - (ax + dx * t);
        const ez = cz - (az + dz * t);
        if (ex * ex + ez * ez > r2) continue;
        const s = cum[i]! + Math.sqrt(l2) * t;
        if (s > fromS && s < best) best = s;
      }
      if (best === Infinity) continue;
      if (v !== null && this.allowed(rec, v)) {
        if (this.passS < 0 || best < this.passS) {
          this.passS = best;
          this.passRec = rec;
        }
      } else if (this.blockS < 0 || best < this.blockS) {
        this.blockS = best;
        this.blockRec = rec;
      }
    }
  }

  /** Le point est-il à l'intérieur d'un périmètre fermé (closeArea) ? Rien n'y apparaît, rien n'y va. */
  inClosedArea(x: number, z: number): boolean {
    const recs = this.recs;
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]!;
      if (rec.areaId === 0) continue;
      const dx = x - rec.areaX;
      const dz = z - rec.areaZ;
      if (dx * dx + dz * dz < rec.areaR * rec.areaR) return true;
    }
    return false;
  }

  /** Fermeture qui interdit cette arête (null si elle est ouverte). */
  recOfEdge(edgeId: number): ClosureRec | null {
    return this.byEdge.get(edgeId) ?? null;
  }

  // ───────────────────────────── radio ─────────────────────────────

  private streetName(rec: ClosureRec): string {
    const cl = rec.closure;
    const name = this.ctx.world.edge(cl.edgeId).name;
    if (name) return name;
    return this.ctx.world.sectorName(cl.x, cl.z) || 'voie sans nom';
  }

  private report(rec: ClosureRec): void {
    if (rec.areaId !== 0) return; // le compte rendu du périmètre vaut pour toutes ses rues
    const cl = rec.closure;
    const name = this.streetName(rec);
    const held = cl.squadId !== 0 && this.ctx.squads.get(cl.squadId) !== undefined;
    this.radio(
      'rue_fermee', name,
      held ? `Voie fermée à la circulation : ${name}. Barrage tenu, demi-tour imposé aux automobilistes.`
        : `Circulation coupée, ${name}. Barrières posées, déviation en place.`,
      cl.squadId, cl.x, cl.z,
    );
  }

  private radio(key: string, name: string, text: string, squadId: number, x: number, z: number): void {
    if (!this.tuning.radio || this.quiet) return;
    const ctx = this.ctx;
    const squad = squadId !== 0 ? ctx.squads.get(squadId) : undefined;
    const phrases = ctx.service<RadioPhrases>(RADIO_PHRASES);
    if (phrases && phrases.has(key)) {
      // la bibliothèque de phrases choisit la variante, l'indicatif et applique son anti-répétition
      phrases.say(key, { voie: name }, squad ? { squad, at: { x, z } } : { at: { x, z } });
      return;
    }
    ctx.radio.say({ channel: 'commandement', from: squad ? squad.name : 'CENTRAL', text, priority: 1 });
  }

  private radioPerimeter(place: string, count: number, x: number, z: number): void {
    if (!this.tuning.radio) return;
    const ctx = this.ctx;
    const phrases = ctx.service<RadioPhrases>(RADIO_PHRASES);
    if (phrases && phrases.has('perimetre_ferme')) {
      phrases.say('perimetre_ferme', { lieu: place, nombre: count }, { at: { x, z } });
      return;
    }
    ctx.radio.say({
      channel: 'commandement', from: 'CENTRAL', priority: 1,
      text: `Périmètre fermé${place ? `, secteur ${place}` : ''}. Accès coupés sur ${count} point${count > 1 ? 's' : ''}, déviation en place.`,
    });
  }
}
