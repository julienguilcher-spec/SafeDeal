/* =====================================================================================
 * CIRCULATION — choix des destinations et des itinéraires des automobilistes : destination en pleine
 * rue de l'autre côté de la zone, itinéraire direct, déviation par un point de passage quand une rue est
 * fermée ou une chaussée signalée bloquée, repérage des barrages et du carrefour où l'on s'arrête devant
 * une rue fermée. L'itinéraire installé est toujours celui que calculera le pilote automatique :
 * ctx.world.findPath y est appelé avec les arguments exacts qui seront passés à driveTo.
 * ===================================================================================== */

import type { RoadSample, Vehicle } from '@/core/contracts';
import type { CarBrain } from './car-brain';
import type { EdgeHit, EdgePoint } from './graph';
import { E_ONEWAY, N_JUNCTION, makeEdgeHit } from './graph';
import { CP_BOX } from './route';
import type { TrafficKernel } from './shared';
import { makeRoadSample } from './shared';

/** Écart à l'axe d'un point d'arrêt (m) : assez pour ne pas être fusionné, assez peu pour rester « sur l'axe ». */
export const AXIS_NUDGE = 0.2;

/** Parts de la déviation essayées comme point de passage, de la plus longue à la plus courte. */
const FRACTIONS: readonly number[] = [1, 0.6, 0.3, 0.1];

export class CarRouter {
  /** Dernière destination tirée (pickDestination) ou dernier point écarté de l'axe (nudge). */
  destX = 0;
  destZ = 0;
  readonly buf: number[] = [];
  private readonly routeNodes: number[] = [];
  private readonly dp: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly hit: EdgeHit = makeEdgeHit();
  private readonly road: RoadSample = makeRoadSample();
  private mask: Uint8Array = new Uint8Array(0);
  private readonly chainEdges: number[] = [];
  private readonly chainDirs: number[] = [];
  private readonly chainInfo = { nodeA: -1, nodeB: -1, length: 0, count: 0 };

  constructor(private readonly k: TrafficKernel) {}

  /**
   * Destination d'un automobiliste : un point en pleine rue (jamais dans un carrefour), de préférence de
   * l'autre côté de la zone par rapport à son point de départ. Écrit destX / destZ.
   */
  pickDestination(fromX: number, fromZ: number): boolean {
    const k = this.k;
    const c = k.cache;
    const t = k.tuning;
    const rng = k.rng;
    const nodes = this.routeNodes;
    const cx = k.hasFocus ? k.focusX : fromX;
    const cz = k.hasFocus ? k.focusZ : fromZ;
    const n = c.nodesInRadius(cx, cz, t.spawnMax + 60, nodes);
    if (n === 0) return false;
    const ax = fromX - cx;
    const az = fromZ - cz;
    const min = t.spawnMin * 0.8;
    const pt = this.dp;
    let found = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const node = nodes[rng.int(0, n)]!;
      const deg = c.adjStart[node + 1]! - c.adjStart[node]!;
      if (deg === 0) continue;
      const e = c.adjEdge[c.adjStart[node]! + rng.int(0, deg)]!;
      if (!c.isVehicle(e) || k.closures.isClosed(e)) continue;
      // à l'écart des carrefours : au milieu de la partie courante de l'arête
      const a = c.edgeA[e]!;
      const b = c.edgeB[e]!;
      const len = c.edgeLen[e]!;
      const clearA = (c.nodeFlags[a]! & N_JUNCTION) !== 0 ? c.nodeRadius[a]! + 36 : 1;
      const clearB = (c.nodeFlags[b]! & N_JUNCTION) !== 0 ? c.nodeRadius[b]! + 36 : 1;
      if (len < clearA + clearB + 1) continue;
      c.pointAt(e, clearA + rng.next() * (len - clearA - clearB), 0, pt);
      // jamais à l'intérieur d'un périmètre fermé : il n'y entrerait pas
      if (k.closures.inClosedArea(pt.x, pt.z)) continue;
      const fx = pt.x - fromX;
      const fz = pt.z - fromZ;
      if (fx * fx + fz * fz < 120 * 120) continue;
      const dx = pt.x - cx;
      const dz = pt.z - cz;
      // premier point acceptable gardé en réserve ; on préfère un point lointain, de l'autre côté
      const far = dx * dx + dz * dz >= min * min
        && ax * dx + az * dz <= 0.17 * Math.sqrt((ax * ax + az * az) * (dx * dx + dz * dz));
      if (!found || far) {
        // à 20 cm de l'axe (voir nudge) : droite de l'arête = (−dz, dx)
        this.destX = pt.x - pt.dz * AXIS_NUDGE;
        this.destZ = pt.z + pt.dx * AXIS_NUDGE;
        found = true;
      }
      if (far) return true;
    }
    return found;
  }

  /**
   * Donne une nouvelle destination à un automobiliste d'ambiance. `ahead` : seulement une destination dont
   * l'itinéraire part devant lui (pas de demi-tour en pleine rue pour un véhicule qui roule).
   */
  newDestination(b: CarBrain, ahead: boolean): boolean {
    const v = b.v;
    const hx = Math.sin(v.heading);
    const hz = Math.cos(v.heading);
    const buf = this.buf;
    for (let attempt = 0; attempt < (ahead ? 4 : 1); attempt++) {
      if (!this.pickDestination(v.x, v.z)) return false;
      if (ahead) {
        if (!this.path(b, this.destX, this.destZ)) continue;
        // direction du premier tronçon utile de l'itinéraire
        let forward = false;
        for (let i = 2; i + 1 < buf.length; i += 2) {
          const dx = buf[i]! - v.x;
          const dz = buf[i + 1]! - v.z;
          if (dx * dx + dz * dz < 36) continue;
          forward = dx * hx + dz * hz > 0;
          break;
        }
        if (!forward) continue;
      }
      b.destX = this.destX;
      b.destZ = this.destZ;
      b.hasVia = false;
      return true;
    }
    return false;
  }

  /** Installe la polyligne de `buf` comme itinéraire : points de contrôle, réservations conservées, barrages. */
  install(b: CarBrain): void {
    const k = this.k;
    const r = b.route;
    const buf = this.buf;
    const v = b.v;
    const now = k.ctx.clock.now;
    r.setPath(buf, buf.length >> 1);
    r.buildControlPoints(k.cache, k.signals);
    for (let i = 0; i < r.cpCount; i++) {
      const cp = r.cps[i]!;
      // carrefour déjà réservé (on repart d'une ligne d'arrêt) : la réservation est conservée telle quelle,
      // avec la trajectoire du nouvel itinéraire (la rendre pour la redemander ferait perdre son tour)
      if ((cp.kind & CP_BOX) !== 0 && k.boxes.holds(cp.node, v.id, now)) {
        const engaged = cp.stopS - b.halfL < -1;
        if (engaged || k.boxes.sameMovement(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz)) {
          k.boxes.occupy(cp.node, v.id, cp.inDx, cp.inDz, cp.outDx, cp.outDz, now);
          cp.cleared = true;
        } else {
          // le nouvel itinéraire tourne autrement à ce carrefour : la réservation ne vaut plus, on la redemandera
          k.boxes.release(cp.node, v.id);
        }
      }
    }
    k.closures.scan(r.pts, r.cum, r.n, 0, v);
    b.blockS = k.closures.blockS;
    b.passS = k.closures.passS;
    b.passRec = k.closures.passRec;
    b.holdCp = null;
    this.markEntry(b);
  }

  /** Repère le dernier carrefour avant le barrage infranchissable de l'itinéraire : c'est là qu'on s'arrêtera. */
  markEntry(b: CarBrain): void {
    const r = b.route;
    b.entryCp = null;
    if (b.blockS < 0) return;
    for (let i = r.cpNext; i < r.cpCount; i++) {
      const cp = r.cps[i]!;
      if (cp.nodeS >= b.blockS) break;
      if ((cp.kind & CP_BOX) !== 0) b.entryCp = cp;
    }
  }

  path(b: CarBrain, x: number, z: number): boolean {
    const v = b.v;
    const buf = this.buf;
    return this.k.ctx.world.findPath(v.x, v.z, x, z, 'vehicle', buf) && buf.length >= 4;
  }

  private clean(b: CarBrain, avoid: boolean): boolean {
    const r = b.route;
    return b.blockS < 0 && !(avoid && this.k.obstructions.blocks(r.pts, r.cum, r.n, 0));
  }

  /**
   * Choisit l'itinéraire : direct vers la destination ; sinon déviation par un point de passage calculé sur le
   * graphe sans les rues fermées (ni, si `avoid`, les chaussées signalées bloquées : demi-tour si la rue est à
   * double sens) ; sinon, pour la circulation d'ambiance, une autre destination ; sinon l'itinéraire direct,
   * au bout duquel il attendra devant le barrage. false si aucun itinéraire n'existe.
   */
  retarget(b: CarBrain, avoid: boolean): boolean {
    const k = this.k;
    const c = k.cache;
    b.hasVia = false;
    const direct = this.path(b, b.destX, b.destZ);
    if (direct) {
      this.install(b);
      if (this.clean(b, avoid)) return true;
    }
    if (k.closures.recs.length > 0 || avoid) {
      const start = this.nodeNear(b.v, avoid);
      const end = c.nearestVehicleEdge(b.destX, b.destZ, 60, this.hit) ? this.endNode(this.hit, b.destX, b.destZ) : -1;
      const nodes = this.routeNodes;
      if (start >= 0 && end >= 0 && c.route(start, end, this.closedMask(avoid), nodes) && nodes.length >= 2) {
        const last = nodes.length - 1;
        let prev = -1;
        for (let f = 0; f < 4; f++) {
          const idx = Math.max(1, Math.min(last, Math.round(last * FRACTIONS[f]!)));
          if (idx === prev) continue;
          prev = idx;
          // point de passage au milieu de l'arête qui mène à ce nœud (jamais sur un carrefour : l'accroche de
          // l'itinéraire y serait ambiguë), écarté de 20 cm de l'axe
          const ve = c.edgeBetween(nodes[idx - 1]!, nodes[idx]!);
          if (ve < 0) continue;
          c.pointAt(ve, c.edgeLen[ve]! * 0.5, AXIS_NUDGE, this.dp);
          const vx = this.dp.x;
          const vz = this.dp.z;
          if (!this.path(b, vx, vz)) continue;
          this.install(b);
          if (!this.clean(b, avoid)) continue;
          b.hasVia = idx < last;
          b.viaX = vx;
          b.viaZ = vz;
          k.stats.reroutes++;
          return true;
        }
      }
    }
    if (b.ambient && k.hasFocus) {
      for (let i = 0; i < 3; i++) {
        if (!this.pickDestination(b.v.x, b.v.z) || !this.path(b, this.destX, this.destZ)) continue;
        this.install(b);
        if (!this.clean(b, avoid)) continue;
        b.destX = this.destX;
        b.destZ = this.destZ;
        k.stats.reroutes++;
        return true;
      }
    }
    if (avoid) return false;
    if (!this.path(b, b.destX, b.destZ)) return false;
    this.install(b);
    return true;
  }

  /** Arêtes interdites au calcul de déviation : rues fermées, et tronçons signalés bloqués si `avoid`. */
  private closedMask(avoid: boolean): Uint8Array {
    const k = this.k;
    const closed = k.closures.closedEdges;
    if (!avoid || k.obstructions.active === 0) return closed;
    if (this.mask.length !== closed.length) this.mask = new Uint8Array(closed.length);
    this.mask.set(closed);
    const list = k.obstructions.list;
    for (let i = 0; i < list.length; i++) {
      const o = list[i]!;
      if (o.until < 0 || !k.cache.nearestVehicleEdge(o.x, o.z, 10, this.hit)) continue;
      k.cache.chain(this.hit.edge, this.chainEdges, this.chainDirs, this.chainInfo);
      for (let j = 0; j < this.chainEdges.length; j++) this.mask[this.chainEdges[j]!] = 1;
    }
    return this.mask;
  }

  /** Nœud vers lequel roule le véhicule ; `behind` : celui qu'il a dans le dos (demi-tour), si la rue le permet. */
  private nodeNear(v: Vehicle, behind: boolean): number {
    const c = this.k.cache;
    const hit = this.hit;
    if (!c.nearestVehicleEdge(v.x, v.z, 25, hit)) return -1;
    const e = hit.edge;
    const fwd = Math.sin(v.heading) * hit.dx + Math.cos(v.heading) * hit.dz >= 0;
    const oneway = (c.edgeFlags[e]! & E_ONEWAY) !== 0;
    if (oneway) return c.edgeB[e]!;
    return fwd !== behind ? c.edgeB[e]! : c.edgeA[e]!;
  }

  private endNode(hit: EdgeHit, x: number, z: number): number {
    const c = this.k.cache;
    const a = c.edgeA[hit.edge]!;
    const b = c.edgeB[hit.edge]!;
    const da = (c.nodeX[a]! - x) * (c.nodeX[a]! - x) + (c.nodeZ[a]! - z) * (c.nodeZ[a]! - z);
    const db = (c.nodeX[b]! - x) * (c.nodeX[b]! - x) + (c.nodeZ[b]! - z) * (c.nodeZ[b]! - z);
    return da <= db ? a : b;
  }

  /**
   * Écarte de 20 cm de l'axe un point posé dessus (résultat dans destX / destZ). Une destination exactement
   * sur l'axe d'une rue serait confondue avec le point d'accroche de l'itinéraire (voir holdAt) : le pilote
   * automatique viendrait s'arrêter au milieu de la chaussée, face aux véhicules d'en face. Écarté, il
   * s'arrête sur sa voie. Le sens de l'écart est indifférent.
   */
  nudge(x: number, z: number): void {
    const road = this.road;
    this.destX = x;
    this.destZ = z;
    if (!this.k.ctx.world.nearestRoad(x, z, road, 2) || road.dist > 0.06) return;
    this.destX = x - Math.cos(road.heading) * AXIS_NUDGE;
    this.destZ = z + Math.sin(road.heading) * AXIS_NUDGE;
  }
}
