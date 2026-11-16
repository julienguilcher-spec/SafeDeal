/* =====================================================================================
 * CIRCULATION — piétons civils (passants, touristes, commerçants) : apparition autour du joueur, densité
 * selon l'heure, la météo et le quartier, effacement quand la manifestation occupe la rue ; marche sur les
 * trottoirs, traversée aux carrefours et aux passages (attente du feu, d'un créneau), arrêts.
 *
 * Un piéton suit le trottoir d'une arête du graphe : ligne parallèle à l'axe, décalée de la demi-chaussée
 * plus une part du trottoir, d'un côté donné. Au bout de l'arête il choisit la suite : tourner du côté de
 * son trottoir (il contourne l'angle sans traverser), continuer tout droit (il traverse la rue transversale
 * s'il y en a une de son côté), ou changer de trottoir (il traverse sa propre rue). Il écrit person.cmd
 * comme toute IA ; sa réflexion est étalée (≈ 3,5 fois par seconde). Les réactions sont dans ped-react.ts.
 * ===================================================================================== */

import type { EntityId, Person, PersonKind, Shop, Vehicle } from '@/core/contracts';
import type { EdgeHit, EdgePoint } from './graph';
import { E_PED, E_TUNNEL, N_CROSSING, N_JUNCTION, N_SIGNAL, makeEdgeHit } from './graph';
import {
  PedBrain, S_CORNER, S_CROSS, S_FLEE, S_IDLE, S_LEAVE, S_SHOP, S_SIT, S_WAIT, S_WALK, S_WATCH,
} from './ped-brain';
import { PedReactor } from './ped-react';
import type { PedAdopter, TrafficKernel } from './shared';
import { PED_THINK, pedHourFactor, weatherPedFactor } from './tuning';

/** Distance du point visé devant le piéton, le long de son trottoir (m). */
const CARROT = 3.2;

export class Peds implements PedAdopter {
  readonly list: PedBrain[] = [];
  readonly byPerson = new Map<EntityId, PedBrain>();
  readonly react: PedReactor;
  /** Facteur de quartier : rues commerçantes et abords des monuments plus fréquentés. */
  district = 1;
  private popT = 0;
  private districtT = 0;
  private readonly nodes: number[] = [];
  private readonly hit: EdgeHit = makeEdgeHit();
  private readonly ep: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly ep2: EdgePoint = { x: 0, z: 0, dx: 0, dz: 1 };
  private readonly vehicles: Vehicle[] = [];
  private readonly shops: Shop[] = [];

  constructor(readonly k: TrafficKernel) {
    this.react = new PedReactor(k, this);
  }

  reset(): void {
    this.list.length = 0;
    this.byPerson.clear();
    this.popT = 0;
    this.districtT = 0;
    this.district = 1;
    this.react.reset();
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const k = this.k;
    const list = this.list;
    let fleeing = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      if (b.state === S_FLEE) fleeing++;
      b.thinkT -= dt;
      if (b.thinkT > 0) continue;
      b.thinkT += PED_THINK;
      if (b.thinkT < 0) b.thinkT = 0;
      this.think(b);
    }
    k.stats.pedestrians = list.length;
    k.stats.fleeing = fleeing;
    this.popT -= dt;
    if (this.popT <= 0) {
      this.popT = 0.3;
      this.populate();
    }
  }

  /** Effectif visé : heure, météo, quartier, réglage du nombre de PNJ, place prise par la manifestation. */
  target(): number {
    const k = this.k;
    const t = k.tuning;
    if (!t.ambient || !k.hasFocus || !k.cache.ready) return 0;
    const env = k.ctx.env.state;
    const scale = k.ctx.settings.values.crowdScale;
    const n = t.pedestrianBase * t.pedestrianDensity * k.sessionPedestrians * pedHourFactor(env.timeOfDay)
      * weatherPedFactor(env.weather) * scale * this.district * (1 - 0.9 * k.crowd);
    const max = Math.min(t.pedestrianMax, Math.round(t.pedestrianMax * Math.max(0.25, scale)));
    return Math.max(0, Math.min(max, Math.round(n)));
  }

  private populate(): void {
    const k = this.k;
    const t = k.tuning;
    const ctx = k.ctx;
    const list = this.list;
    this.districtT -= 0.3;
    if (this.districtT <= 0 && k.hasFocus) {
      this.districtT = 5;
      // commerces alentour : 0,7 dans une rue sans boutique, jusqu'à 1,5 dans une rue commerçante
      const n = ctx.props.shopsNear(k.focusX, k.focusZ, 90, this.shops);
      this.shops.length = 0;
      this.district = Math.min(1.5, 0.7 + n / 22);
    }
    const target = this.target();
    k.stats.pedestrianTarget = target;
    const now = ctx.clock.now;
    const far2 = t.pedDespawn * t.pedDespawn;
    const near2 = t.pedSpawnMin * t.pedSpawnMin;
    let excess = list.length - target;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      if (!b.ambient) continue;
      const p = b.p;
      const d2 = k.distToFocus2(p.x, p.z);
      if (d2 > far2) {
        this.despawn(b);
        excess--;
      } else if (excess > 0 && d2 > near2 && now - b.bornAt > 8 && !k.visible(p.x, p.z)) {
        this.despawn(b);
        excess--;
      } else if ((b.state === S_LEAVE || b.state === S_FLEE) && d2 > near2 * 2 && b.fleeLeft <= 0 && !k.visible(p.x, p.z)) {
        this.despawn(b); // parti se mettre à l'abri : il ne reviendra pas
      }
    }
    if (!k.hasFocus || !t.ambient) return;
    if (list.length < target) {
      const tries = list.length < target * 0.5 ? 6 : 2;
      for (let i = 0; i < tries && list.length < target; i++) this.trySpawn();
    }
  }

  private trySpawn(): boolean {
    const k = this.k;
    const c = k.cache;
    const t = k.tuning;
    const rng = k.rng;
    const ctx = k.ctx;
    const nodes = this.nodes;
    const n = c.nodesInRadius(k.focusX, k.focusZ, t.pedSpawnMax, nodes);
    if (n === 0) return false;
    const node = nodes[rng.int(0, n)]!;
    const deg = c.adjStart[node + 1]! - c.adjStart[node]!;
    if (deg === 0) return false;
    const e = c.adjEdge[c.adjStart[node]! + rng.int(0, deg)]!;
    const flags = c.edgeFlags[e]!;
    if ((flags & E_TUNNEL) !== 0) return false;
    if ((flags & E_PED) === 0 && c.edgeSidewalk[e]! < 1) return false;
    const len = c.edgeLen[e]!;
    const s = rng.next() * len;
    const side = rng.chance(0.5) ? 1 : -1;
    const jitter = rng.next();
    const ep = this.ep;
    c.pointAt(e, s, side * this.lat(e, jitter), ep);
    const x = ep.x;
    const z = ep.z;
    const d2 = k.distToFocus2(x, z);
    if (d2 < t.pedSpawnMin * t.pedSpawnMin || d2 > t.pedSpawnMax * t.pedSpawnMax) return false;
    if (d2 < 75 * 75 && k.visible(x, z)) return false; // pas d'apparition sous les yeux du joueur
    if (!ctx.world.isLoaded(x, z) || !this.walkable(x, z) || !ctx.world.isFree(x, z, 0.35)) return false;
    if (ctx.people.countIn(x, z, 1.4) > 0) return false;
    if (ctx.hazards.gasAt(x, z) > 0.02 || k.dangers.at(x, z) > 0.1) return false;
    if (k.crowd > 0.05 && ctx.people.countIn(x, z, 12, this.react.protest) > 3) return false; // la rue est au cortège
    // nature du piéton : commerçant devant une boutique, touriste, sinon passant
    let kind: PersonKind = 'passant';
    const shops = this.shops;
    const ns = ctx.props.shopsNear(x, z, 7, shops);
    let shop: Shop | null = null;
    if (ns > 0 && rng.chance(0.2)) {
      shop = shops[0]!;
      kind = 'commercant';
    } else if (rng.chance(this.district > 1.1 ? 0.28 : 0.14)) {
      kind = 'touriste';
    }
    shops.length = 0;
    const dir = rng.chance(0.5) ? 1 : -1;
    const heading = Math.atan2(ep.dx * dir, ep.dz * dir);
    const p = ctx.archetypes.spawn(kind, x, z, { heading });
    const b = this.attach(p, e, dir, dir > 0 ? side : -side, jitter);
    b.ambient = true;
    if (shop) {
      // il se tient devant sa vitrine
      b.state = S_SHOP;
      b.tx = shop.x + Math.sin(shop.heading) * 1.1;
      b.tz = shop.z + Math.cos(shop.heading) * 1.1;
      b.faceX = shop.x + Math.sin(shop.heading) * 6;
      b.faceZ = shop.z + Math.cos(shop.heading) * 6;
    }
    k.stats.spawned++;
    return true;
  }

  /** Crée la fiche d'une personne et la met sur un trottoir. `side` est relatif au sens de marche. */
  private attach(p: Person, edge: number, dir: number, side: number, jitter: number): PedBrain {
    const k = this.k;
    const b = new PedBrain(p);
    b.edge = edge;
    b.dir = dir;
    b.side = side;
    b.jitter = jitter;
    b.pace = 0.72 + k.rng.next() * 0.28;
    b.thinkT = k.rng.next() * PED_THINK;
    b.walked = k.rng.next() * 15;
    b.bornAt = k.ctx.clock.now;
    p.brain = b;
    this.list.push(b);
    this.byPerson.set(p.id, b);
    return b;
  }

  /** Piéton créé à la demande (mission, test) : sur le trottoir le plus proche du point. */
  spawnAt(kind: PersonKind, x: number, z: number): Person | null {
    const k = this.k;
    const c = k.cache;
    const hit = this.hit;
    if (!c.ready || !c.nearestVehicleEdge(x, z, 80, hit)) return null;
    const e = hit.edge;
    const side = hit.lat >= 0 ? 1 : -1;
    const w = c.edgeWidth[e]! * 0.5;
    const sw = c.edgeSidewalk[e]!;
    const off = Math.abs(hit.lat);
    let px = x;
    let pz = z;
    let jitter = 0.5;
    if (off < w + 0.3 || !this.walkable(x, z)) {
      c.pointAt(e, hit.s, side * this.lat(e, jitter), this.ep);
      px = this.ep.x;
      pz = this.ep.z;
    } else if (sw > 1) {
      jitter = Math.max(0, Math.min(1, (off - w - 0.5) / Math.max(0.1, Math.min(sw - 0.9, 3))));
    }
    const dir = k.rng.chance(0.5) ? 1 : -1;
    const p = k.ctx.archetypes.spawn(kind, px, pz, { heading: Math.atan2(hit.dx * dir, hit.dz * dir) });
    const b = this.attach(p, e, dir, dir > 0 ? side : -side, jitter);
    b.ambient = false;
    return p;
  }

  /** Un automobiliste vient de descendre de voiture : il devient piéton (en fuite s'il a abandonné son véhicule). */
  adopt(p: Person, fleeing: boolean, fromX: number, fromZ: number): void {
    const k = this.k;
    const c = k.cache;
    const hit = this.hit;
    if (this.byPerson.has(p.id) || !c.ready || !c.nearestVehicleEdge(p.x, p.z, 60, hit)) return;
    const side = hit.lat >= 0 ? 1 : -1;
    const dir = k.rng.chance(0.5) ? 1 : -1;
    const b = this.attach(p, hit.edge, dir, dir > 0 ? side : -side, 0.3 + k.rng.next() * 0.5);
    b.ambient = true;
    b.bornAt = k.ctx.clock.now;
    if (fleeing) this.react.startFlee(b, fromX, fromZ, 0.85);
  }

  despawn(b: PedBrain): void {
    const p = b.p;
    this.forget(b);
    if (this.k.ctx.people.get(p.id) === p) this.k.ctx.people.remove(p.id);
    this.k.stats.despawned++;
  }

  forget(b: PedBrain): void {
    const p = b.p;
    this.react.leaveChair(b);
    const i = this.list.indexOf(b);
    if (i >= 0) {
      this.list[i] = this.list[this.list.length - 1]!;
      this.list.pop();
    }
    this.byPerson.delete(p.id);
    if (p.brain === b) p.brain = null;
  }

  clear(): void {
    for (let i = this.list.length - 1; i >= 0; i--) this.despawn(this.list[i]!);
  }

  // ───────────────────────────── géométrie ─────────────────────────────

  /** Écart à l'axe de la ligne de marche sur le trottoir d'une arête (m). */
  lat(e: number, jitter: number): number {
    const c = this.k.cache;
    const half = c.edgeWidth[e]! * 0.5;
    if ((c.edgeFlags[e]! & E_PED) !== 0) return Math.max(0, half - 0.6) * jitter; // rue piétonne : dans la rue
    const sw = c.edgeSidewalk[e]!;
    if (sw < 1) return half + 0.45;
    return half + 0.55 + Math.min(sw - 0.95, 3) * jitter;
  }

  walkable(x: number, z: number): boolean {
    const s = this.k.ctx.world.surfaceAt(x, z);
    return s !== 'building' && s !== 'water' && s !== 'road' && s !== 'sett' && s !== 'bridge' && s !== 'interior';
  }

  /** Commande de marche vers un point ; retourne la distance restante. */
  moveTo(b: PedBrain, x: number, z: number, pace: number, gait: 0 | 1 | 2): number {
    const p = b.p;
    const cmd = p.cmd;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.08) {
      cmd.moveX = 0;
      cmd.moveZ = 0;
      return d;
    }
    const f = pace / d;
    cmd.moveX = dx * f;
    cmd.moveZ = dz * f;
    cmd.gait = gait;
    cmd.faceMove = true;
    cmd.crouch = false;
    return d;
  }

  /** Immobile, tourné vers un point. */
  stand(b: PedBrain, faceX: number, faceZ: number): void {
    const p = b.p;
    const cmd = p.cmd;
    cmd.moveX = 0;
    cmd.moveZ = 0;
    cmd.gait = 0;
    const dx = faceX - p.x;
    const dz = faceZ - p.z;
    if (dx * dx + dz * dz > 0.04) {
      cmd.faceMove = false;
      cmd.aimYaw = Math.atan2(dx, dz);
    }
  }

  // ───────────────────────────── réflexion ─────────────────────────────

  private think(b: PedBrain): void {
    const k = this.k;
    const ctx = k.ctx;
    const p = b.p;
    if (ctx.people.get(p.id) !== p) {
      this.forget(b);
      return;
    }
    // quelqu'un d'autre décide pour lui : à bord, tenu, interpellé, à terre
    if (p.vehicleId !== 0 || p.heldBy !== 0 || p.custody !== 'free' || p.isPlayer || ctx.health.isIncapacitated(p)) {
      if (p.isPlayer || p.vehicleId !== 0) this.forget(b);
      else {
        p.cmd.moveX = 0;
        p.cmd.moveZ = 0;
      }
      return;
    }
    b.tick++;
    if (((b.tick + p.id) & 3) === 0) {
      this.react.sense(b);
      if (p.brain !== b) return; // parti (réfugié dans le métro)
    }
    switch (b.state) {
      case S_WALK:
        this.walk(b, 0, b.pace, 0);
        break;
      case S_CORNER: {
        const d = this.moveTo(b, b.tx, b.tz, b.fear > 0.4 ? 1 : b.pace, b.fear > 0.4 ? 2 : 0);
        if (d < 0.8) this.commit(b);
        else if ((b.timer -= PED_THINK) < 0) this.commit(b);
        break;
      }
      case S_WAIT:
        this.stand(b, b.tx, b.tz);
        b.waited += PED_THINK;
        if (b.fear > 0.4 || this.react.mayCross(b)) {
          b.state = S_CROSS;
          b.timer = 30;
        }
        break;
      case S_CROSS: {
        const hurry = b.fear > 0.4 ? 2 : b.waited > 12 ? 1 : 0;
        const d = this.moveTo(b, b.tx, b.tz, 1, hurry);
        if (d < 0.9 || (b.timer -= PED_THINK) < 0) this.commit(b);
        break;
      }
      case S_FLEE:
        this.react.flee(b);
        break;
      case S_LEAVE:
        this.walk(b, b.fear > 0.3 ? 1 : 0, 1, 2);
        b.fleeLeft -= PED_THINK * 1.6;
        if (b.fleeLeft <= 0 && !b.ambient) b.state = S_WALK;
        break;
      case S_IDLE:
      case S_WATCH:
        this.stand(b, b.faceX, b.faceZ);
        if ((b.timer -= PED_THINK) <= 0) this.react.resume(b);
        break;
      case S_SIT:
        this.react.sit(b);
        break;
      case S_SHOP:
        if (this.moveTo(b, b.tx, b.tz, 0.6, 0) < 0.9) this.stand(b, b.faceX, b.faceZ);
        break;
      default:
        b.state = S_WALK;
    }
  }

  /** La cible (angle, trottoir d'en face) est atteinte : on marche maintenant sur la rue suivante. */
  private commit(b: PedBrain): void {
    if (b.nextEdge >= 0) {
      b.edge = b.nextEdge;
      b.dir = b.nextDir;
      b.side = b.nextSide;
    }
    b.nextEdge = -1;
    b.waited = 0;
    b.crossNode = -1;
    b.state = b.fear > 0.4 ? S_FLEE : b.fleeLeft > 0 ? S_LEAVE : S_WALK;
  }

  /**
   * Marche le long du trottoir de l'arête courante. `mode` : 0 promenade, 1 fuite (à chaque carrefour,
   * la rue qui éloigne le plus du danger, sans attendre pour traverser), 2 départ (même choix, en marchant).
   */
  walk(b: PedBrain, gait: 0 | 1 | 2, pace: number, mode: number): void {
    const c = this.k.cache;
    const p = b.p;
    const e = b.edge;
    if (e < 0 || e >= c.edgeCount) {
      this.reattach(b);
      return;
    }
    const hit = this.hit;
    c.project(e, p.x, p.z, hit);
    const len = c.edgeLen[e]!;
    const s = hit.s;
    const remaining = b.dir > 0 ? len - s : s;
    const node = b.dir > 0 ? c.edgeB[e]! : c.edgeA[e]!;
    const lat = this.lat(e, b.jitter);
    // trop loin de sa rue (bousculé, descendu de voiture au milieu de la chaussée) : il y revient d'abord
    const turnAt = (c.nodeFlags[node]! & N_JUNCTION) !== 0 ? c.nodeRadius[node]! + 1 : Math.min(lat + 0.4, 5);
    if (remaining <= turnAt && hit.dist < lat + 6) {
      this.atNode(b, node, mode);
      if (b.state !== S_WALK && b.state !== S_FLEE && b.state !== S_LEAVE) return;
      if (b.edge !== e) return;
    }
    let sc = s + b.dir * CARROT;
    if (sc < 0) sc = 0;
    else if (sc > len) sc = len;
    const ep = this.ep;
    c.pointAt(b.edge, sc, b.side * b.dir * lat, ep);
    this.moveTo(b, ep.x, ep.z, pace, gait);
    b.walked += pace * 1.4 * PED_THINK;
  }

  /** La rue du piéton n'existe plus (carte rechargée) : on le raccroche à la plus proche, ou il disparaît. */
  private reattach(b: PedBrain): void {
    const c = this.k.cache;
    const hit = this.hit;
    if (!c.ready || !c.nearestVehicleEdge(b.p.x, b.p.z, 80, hit)) {
      if (b.ambient) this.despawn(b);
      else this.forget(b);
      return;
    }
    b.edge = hit.edge;
    b.side = (hit.lat >= 0 ? 1 : -1) * b.dir;
  }

  /**
   * Au bout de l'arête : choix de la suite et de la manœuvre (angle, traversée de la rue transversale,
   * traversée de sa propre rue, demi-tour).
   */
  private atNode(b: PedBrain, node: number, mode: number): void {
    const k = this.k;
    const c = k.cache;
    const rng = k.rng;
    const e = b.edge;
    const ep = this.ep;
    const ep2 = this.ep2;
    c.dirFrom(e, node, ep);
    const nx = ep.x;
    const nz = ep.z;
    // sens de marche en arrivant au nœud, et vecteur vers mon trottoir (droite = (−dz, dx))
    const tx = -ep.dx;
    const tz = -ep.dz;
    const sx = -tz * b.side;
    const sz = tx * b.side;
    // direction qui éloigne du danger (fuite, départ)
    let awayX = 0;
    let awayZ = 0;
    if (mode !== 0) {
      awayX = nx - b.dangerX;
      awayZ = nz - b.dangerZ;
      const l = Math.sqrt(awayX * awayX + awayZ * awayZ);
      if (l > 0.01) {
        awayX /= l;
        awayZ /= l;
      }
      if (b.hasRefuge) {
        // l'abri (bouche de métro) attire autant que le danger repousse
        const rx = b.refugeX - nx;
        const rz = b.refugeZ - nz;
        const rl = Math.sqrt(rx * rx + rz * rz);
        if (rl > 1) {
          awayX = awayX * 0.5 + (rx / rl) * 0.9;
          awayZ = awayZ * 0.5 + (rz / rl) * 0.9;
        }
      }
    }
    const own = (c.nodeFlags[node]! & (N_CROSSING | N_SIGNAL | N_JUNCTION)) !== 0 && c.isVehicle(e);
    let best = -1;
    let bestKind = 0; // 0 angle ou suite, 1 traversée de ma rue d'abord
    let total = 0;
    let bestScore = mode !== 0 ? -(tx * awayX + tz * awayZ) - 0.35 : 0; // rebrousser chemin : dernier recours
    for (let j = c.adjStart[node]!; j < c.adjStart[node + 1]!; j++) {
      const e2 = c.adjEdge[j]!;
      if (e2 === e || (c.edgeFlags[e2]! & E_TUNNEL) !== 0) continue;
      c.dirFrom(e2, node, ep2);
      const dot = ep2.dx * tx + ep2.dz * tz;
      const toward = ep2.dx * sx + ep2.dz * sz;
      const vehicle = c.isVehicle(e2);
      const away = toward < -0.35 && dot <= 0.7;
      if (mode !== 0) {
        const score = ep2.dx * awayX + ep2.dz * awayZ + 0.3 * (1 - Math.abs(dot)) + rng.next() * 0.1;
        if (score > bestScore) {
          bestScore = score;
          best = e2;
          bestKind = away && own ? 1 : 0;
        }
        continue;
      }
      let w = dot > 0.7 ? 3 : toward > 0.35 ? 2 : away ? (own && b.waited >= 0 ? 0.5 : 0) : 0.1;
      if (vehicle && c.edgeSidewalk[e2]! < 1) w *= 0.12;
      else if (!vehicle) w *= 0.7;
      if (w <= 0) continue;
      total += w;
      if (rng.next() * total < w) {
        best = e2;
        bestKind = away ? 1 : 0;
      }
    }
    // de temps en temps, à un passage piéton, il change de trottoir
    if (mode === 0 && own && best >= 0 && bestKind === 0 && b.waited >= 0 && rng.chance(0.07)) bestKind = 1;
    if (best < 0) {
      // impasse, ou le danger est partout ailleurs : demi-tour sur le même trottoir
      b.dir = -b.dir;
      b.side = -b.side;
      return;
    }
    const lat1 = this.lat(e, b.jitter);
    if (bestKind === 1) {
      // traversée de ma propre rue : même abscisse, trottoir d'en face ; la suite se décidera de l'autre côté
      const px = b.p.x - nx;
      const pz = b.p.z - nz;
      const along = px * tx + pz * tz;
      b.tx = nx + tx * along - sx * lat1;
      b.tz = nz + tz * along - sz * lat1;
      if (!this.walkable(b.tx, b.tz)) {
        b.waited = -1; // pas de trottoir en face : on n'essaiera plus ici
        return;
      }
      b.nextEdge = e;
      b.nextDir = b.dir;
      b.nextSide = -b.side;
      b.crossNode = node;
      b.crossDx = tx;
      b.crossDz = tz;
      b.waited = 0;
      b.state = mode === 1 ? S_CROSS : S_WAIT;
      b.timer = 30;
      return;
    }
    // suite sur l'arête choisie, du même côté par rapport au sens de marche
    c.dirFrom(best, node, ep2);
    const ux = ep2.dx;
    const uz = ep2.dz;
    const n2x = -uz * b.side;
    const n2z = ux * b.side;
    const lat2 = this.lat(best, b.jitter);
    b.nextEdge = best;
    b.nextDir = c.edgeA[best] === node ? 1 : -1;
    b.nextSide = b.side;
    b.waited = 0;
    // une rue débouche-t-elle de mon côté entre les deux ? alors il faut la traverser
    let arm = false;
    if (ux * sx + uz * sz <= 0.35) {
      for (let j = c.adjStart[node]!; j < c.adjStart[node + 1]!; j++) {
        const e3 = c.adjEdge[j]!;
        if (e3 === e || e3 === best || !c.isVehicle(e3)) continue;
        c.dirFrom(e3, node, ep);
        if (ep.dx * sx + ep.dz * sz > 0.35) {
          arm = true;
          b.crossDx = ep.dx;
          b.crossDz = ep.dz;
        }
      }
    }
    if (arm) {
      const reach = c.nodeRadius[node]! + 1;
      b.tx = nx + ux * reach + n2x * lat2;
      b.tz = nz + uz * reach + n2z * lat2;
      b.crossNode = node;
      b.state = mode === 1 ? S_CROSS : S_WAIT;
      b.timer = 30;
      return;
    }
    // angle des deux trottoirs : intersection des deux lignes de marche
    const cos = sx * n2x + sz * n2z;
    const den = 1 - cos * cos;
    let cx: number;
    let cz: number;
    if (den < 0.03) {
      const m = (lat1 + lat2) * 0.5;
      cx = sx * m;
      cz = sz * m;
    } else {
      const a = (lat1 - cos * lat2) / den;
      const bb = (lat2 - cos * lat1) / den;
      cx = sx * a + n2x * bb;
      cz = sz * a + n2z * bb;
      const l = Math.sqrt(cx * cx + cz * cz);
      const max = Math.max(lat1, lat2) * 2.2 + 1;
      if (l > max) {
        cx *= max / l;
        cz *= max / l;
      }
    }
    b.tx = nx + cx;
    b.tz = nz + cz;
    b.state = S_CORNER;
    b.timer = 12;
  }
}
