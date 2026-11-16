/* =====================================================================================
 * DÉCOR DYNAMIQUE — barricades : détection par regroupement, objet composite, démontage, enfoncement.
 *
 *   - matière : objets mobiles DÉPLACÉS par quelqu'un (poussés, renversés, portés puis posés) —
 *     poubelles, conteneurs, barrières, palettes, mobilier de terrasse, vélos, trottinettes ; une
 *     terrasse en place ou des vélos en station ne forment donc jamais une barricade ;
 *   - formation : quand un tel objet s'immobilise, on regroupe de proche en proche tout ce qui se
 *     touche à moins d'un mètre ; si le tas est assez volumineux (volume ≥ 4 : quatre corbeilles, deux
 *     conteneurs…), assez long (≥ 2,5 m) et, là où il y a une rue, posé en travers et non le long de
 *     la chaussée, les objets sont remplacés par un composite 'barricade' orienté selon l'axe
 *     principal du tas, haut de 1 à 1,5 m, qui barre le passage et la vue — événement barricade:built,
 *     infraction 'barricade' pour ceux qui ont apporté les objets, tension +0,06 (table F.4) ;
 *   - extension : un objet posé contre une barricade existante y est absorbé ('props:barricade_extended') ;
 *   - le composite brûle avec le combustible de ses éléments (fire.ts) ;
 *   - démontage à la main : takePart() retire un élément (le geste « dégager » dure 6 s par élément :
 *     une barricade de 8 m se dégage en une trentaine de secondes à six) ; en dessous de deux
 *     éléments elle se dissout ; enfoncée (lame, choc, souffle), elle éclate en épaves poussées de
 *     côté, dont quelques-unes continuent de brûler si elle était en feu.
 * ===================================================================================== */

import type { EntityId, Person, RoadSample, Vec2 } from '@/core/contracts';
import { clamp, distSqPointObb } from '@/core/math';
import { BARRICADE_CLEARED_EVENT, BARRICADE_EXTENDED_EVENT } from './api';
import type { BarricadeEvent, BarricadePart } from './api';
import type { Mod } from './mod';
import { ACT_BURNING, ACT_MOVING, TENSION } from './shared';
import type { PartRec, PropObj } from './shared';

/** Distance bord à bord qui relie deux éléments (m). */
const LINK_GAP = 1.0;
/** Volume, nombre d'éléments et longueur à partir desquels un tas devient une barricade. */
const MIN_BULK = 4;
const MIN_COUNT = 3;
const MIN_LENGTH = 2.5;
/** Délai entre l'arrêt d'un objet et le contrôle de regroupement (s). */
const SETTLE = 0.4;
const MAX_MEMBERS = 40;
/** Résistance : base + par unité de volume ; la lame retire 100 points par seconde. */
const HP_BASE = 120;
const HP_PER_BULK = 22;
const HP_MAX = 520;
/** Cosinus de l'angle (35°) en deçà duquel un tas est « le long » de la rue. */
const ALONG_ROAD = 0.82;

const NO_PARTS: readonly BarricadePart[] = Object.freeze([]);

function makeRoadSample(): RoadSample {
  return { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
}

export class Barricades {
  private readonly pending: PropObj[] = [];
  private readonly members: PropObj[] = [];
  private readonly buf: PropObj[] = [];
  private readonly road = makeRoadSample();
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly event: BarricadeEvent = { id: 0, x: 0, z: 0, parts: 0, byId: 0 };
  private markId = 1;

  constructor(private readonly m: Mod) {}

  reset(): void {
    this.pending.length = 0;
  }

  partsOf(id: EntityId): readonly BarricadePart[] {
    const p = this.m.store.get(id);
    return p && p.parts !== null ? p.parts : NO_PARTS;
  }

  /** L'objet peut-il entrer dans une barricade ? */
  private material(p: PropObj): boolean {
    return (
      p.slot >= 0 && p.parts === null && p.def.bulk > 0 && p.movable && p.carriedBy === 0 && (p.act & ACT_MOVING) === 0 &&
      p.movedAt > -1e8 && p.state !== 'broken' && p.state !== 'burnt'
    );
  }

  /** Un objet déplacé vient de s'immobiliser : contrôle de regroupement dans un instant. */
  schedule(p: PropObj): void {
    if (p.slot < 0 || p.def.bulk <= 0 || p.parts !== null) return;
    const at = this.m.k.ctx.clock.now + SETTLE;
    if (p.clusterAt === 0) this.pending.push(p);
    p.clusterAt = at;
  }

  update(): void {
    const pending = this.pending;
    if (pending.length === 0) return;
    const now = this.m.k.ctx.clock.now;
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i]!;
      if (p.slot >= 0 && now < p.clusterAt) continue;
      pending[i] = pending[pending.length - 1]!;
      pending.pop();
      p.clusterAt = 0;
      if (p.slot >= 0) this.check(p);
    }
  }

  // ───────────────────────────── détection ─────────────────────────────

  /** Distance bord à bord approchée de deux boîtes (chacune vue comme une capsule le long de son grand axe). */
  private gap(a: PropObj, b: PropObj): number {
    const d1 = this.capsuleToBox(a, b);
    const d2 = this.capsuleToBox(b, a);
    return d1 < d2 ? d1 : d2;
  }

  private capsuleToBox(a: PropObj, b: PropObj): number {
    const long = a.halfX >= a.halfZ;
    const r = long ? a.halfZ : a.halfX;
    const e = (long ? a.halfX : a.halfZ) - r;
    // grand axe de a dans le monde
    const ux = long ? Math.cos(a.heading) : Math.sin(a.heading);
    const uz = long ? -Math.sin(a.heading) : Math.cos(a.heading);
    let best = distSqPointObb(a.x, a.z, b.x, b.z, b.halfX, b.halfZ, b.heading);
    if (e > 0.05) {
      const d1 = distSqPointObb(a.x + ux * e, a.z + uz * e, b.x, b.z, b.halfX, b.halfZ, b.heading);
      const d2 = distSqPointObb(a.x - ux * e, a.z - uz * e, b.x, b.z, b.halfX, b.halfZ, b.heading);
      if (d1 < best) best = d1;
      if (d2 < best) best = d2;
    }
    const d = Math.sqrt(best) - r;
    return d > 0 ? d : 0;
  }

  private check(seed: PropObj): void {
    if (!this.material(seed)) return;
    const store = this.m.store;
    const members = this.members;
    const buf = this.buf;
    const id = ++this.markId;
    let n = 0;
    members[n++] = seed;
    seed.mark = id;
    let host: PropObj | null = null;
    for (let i = 0; i < n && n < MAX_MEMBERS; i++) {
      const a = members[i]!;
      const reach = (a.halfX > a.halfZ ? a.halfX : a.halfZ) + LINK_GAP;
      const found = store.collectAround(a.x, a.z, reach, buf);
      for (let j = 0; j < found && n < MAX_MEMBERS; j++) {
        const q = buf[j]!;
        if (q.mark === id || q.dormant) continue;
        if (q.parts !== null) {
          if (host === null && q.state !== 'burnt' && this.gap(a, q) <= LINK_GAP) host = q;
          continue;
        }
        if (!this.material(q) || this.gap(a, q) > LINK_GAP) continue;
        q.mark = id;
        if (n < members.length) members[n] = q;
        else members.push(q);
        n++;
      }
    }
    if (host !== null) {
      this.extend(host, n);
      return;
    }
    let bulk = 0;
    for (let i = 0; i < n; i++) bulk += members[i]!.def.bulk;
    if (n < MIN_COUNT || bulk < MIN_BULK) return;

    // axe principal du tas : analyse en composantes principales des coins des boîtes
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < n; i++) {
      cx += members[i]!.x;
      cz += members[i]!.z;
    }
    cx /= n;
    cz /= n;
    let sxx = 0;
    let szz = 0;
    let sxz = 0;
    for (let i = 0; i < n; i++) {
      const p = members[i]!;
      const c = Math.cos(p.heading);
      const s = Math.sin(p.heading);
      for (let k = 0; k < 4; k++) {
        const lx = k & 1 ? p.halfX : -p.halfX;
        const lz = k & 2 ? p.halfZ : -p.halfZ;
        const dx = p.x + lx * c + lz * s - cx;
        const dz = p.z - lx * s + lz * c - cz;
        sxx += dx * dx;
        szz += dz * dz;
        sxz += dx * dz;
      }
    }
    const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const ax = Math.cos(theta);
    const az = Math.sin(theta);
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = members[i]!;
      const c = Math.cos(p.heading);
      const s = Math.sin(p.heading);
      for (let k = 0; k < 4; k++) {
        const lx = k & 1 ? p.halfX : -p.halfX;
        const lz = k & 2 ? p.halfZ : -p.halfZ;
        const dx = p.x + lx * c + lz * s - cx;
        const dz = p.z - lx * s + lz * c - cz;
        const u = dx * ax + dz * az;
        const v = -dx * az + dz * ax;
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }
    const length = uMax - uMin;
    if (length < MIN_LENGTH) return;
    const uMid = (uMin + uMax) * 0.5;
    const vMid = (vMin + vMax) * 0.5;
    const X = cx + ax * uMid - az * vMid;
    const Z = cz + az * uMid + ax * vMid;

    // en travers d'une rue, pas rangés le long du trottoir
    const world = this.m.k.ctx.world;
    const road = this.road;
    if (world.edgeCount > 0 && world.nearestRoad(X, Z, road, 30)) {
      const along = Math.abs(ax * Math.sin(road.heading) + az * Math.cos(road.heading));
      if (road.dist <= road.width * 0.5 + 2.5 && along > ALONG_ROAD) return;
    }
    this.build(n, X, Z, Math.atan2(-az, ax), length * 0.5, (vMax - vMin) * 0.5, bulk);
  }

  // ───────────────────────────── formation et extension ─────────────────────────────

  private partOf(p: PropObj, b: PropObj): PartRec {
    const c = Math.cos(b.heading);
    const s = Math.sin(b.heading);
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    return {
      kind: p.kind, lx: dx * c - dz * s, lz: dx * s + dz * c, heading: p.heading - b.heading,
      halfX: p.halfX, halfZ: p.halfZ, height: p.height, hp: p.hp, fuel: p.state === 'burnt' ? 0 : p.fuel,
      state: p.state === 'burning' ? p.preFire : p.state, toppled: p.toppled, battery: p.battery, bulk: p.def.bulk,
      movedBy: p.movedBy,
    };
  }

  private heightFor(bulk: number): number {
    return clamp(0.85 + 0.06 * bulk, 1.0, 1.5);
  }

  /** Déclare l'infraction 'barricade' pour chacun de ceux qui ont apporté les `n` premiers objets de `members`. */
  private blame(n: number, x: number, z: number): EntityId {
    const members = this.members;
    const k = this.m.k;
    let last: EntityId = 0;
    for (let i = 0; i < n; i++) {
      const by = members[i]!.movedBy;
      if (by === 0) continue;
      let seen = false;
      for (let j = 0; j < i; j++) if (members[j]!.movedBy === by) seen = true;
      if (!seen) k.offense(by, 'barricade', x, z, 0, 'barricade');
      last = by;
    }
    return last;
  }

  private build(n: number, x: number, z: number, heading: number, halfX: number, halfZ: number, bulk: number): void {
    const m = this.m;
    const k = m.k;
    const store = m.store;
    const members = this.members;
    const now = k.ctx.clock.now;
    const b = store.create('barricade', x, z, heading);
    b.halfX = halfX;
    b.halfZ = clamp(halfZ, 0.45, 1.6);
    b.height = this.heightFor(bulk);
    b.standHalfX = b.halfX;
    b.standHalfZ = b.halfZ;
    b.standHeight = b.height;
    b.bulk = bulk;
    b.hp = b.maxHp = clamp(HP_BASE + HP_PER_BULK * bulk, 150, HP_MAX);
    b.movable = false;
    b.blocksMove = true;
    b.blocksSight = true;
    b.dirty = true;
    const parts: PartRec[] = [];
    let fuel = 0;
    let burning = false;
    let igniter: EntityId = 0;
    for (let i = 0; i < n; i++) {
      const p = members[i]!;
      const part = this.partOf(p, b);
      parts.push(part);
      fuel += part.fuel;
      if (p.battery) b.battery = true;
      if (p.act & ACT_BURNING) {
        burning = true;
        igniter = p.igniterId;
      }
    }
    b.parts = parts;
    b.fuel = b.fuelMax = fuel;
    b.movedAt = now;
    b.movedBy = this.blame(n, x, z);
    for (let i = 0; i < n; i++) store.remove(members[i]!);
    store.reindex(b);
    k.stats.barricadesBuilt++;
    k.ctx.events.emit('barricade:built', { id: b.id, x, z });
    k.tension(TENSION.barricade, x, z, 'barricade');
    if (burning) m.fire.ignite(b, igniter, true, true);
  }

  /** Les `n` premiers objets de `members` rejoignent la barricade `b`. */
  private extend(b: PropObj, n: number): void {
    const m = this.m;
    const k = m.k;
    const store = m.store;
    const members = this.members;
    const parts = b.parts!;
    const c = Math.cos(b.heading);
    const s = Math.sin(b.heading);
    let uMin = -b.halfX;
    let uMax = b.halfX;
    let vMin = -b.halfZ;
    let vMax = b.halfZ;
    let bulk = 0;
    let burning = false;
    let igniter: EntityId = 0;
    for (let i = 0; i < n; i++) {
      const p = members[i]!;
      const pc = Math.cos(p.heading);
      const ps = Math.sin(p.heading);
      for (let q = 0; q < 4; q++) {
        const lx = q & 1 ? p.halfX : -p.halfX;
        const lz = q & 2 ? p.halfZ : -p.halfZ;
        const dx = p.x + lx * pc + lz * ps - b.x;
        const dz = p.z - lx * ps + lz * pc - b.z;
        const u = dx * c - dz * s;
        const v = dx * s + dz * c;
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
      const part = this.partOf(p, b);
      parts.push(part);
      bulk += part.bulk;
      b.fuel += part.fuel;
      b.fuelMax += part.fuel;
      if (p.battery) b.battery = true;
      if (p.act & ACT_BURNING) {
        burning = true;
        igniter = p.igniterId;
      }
    }
    this.recenter(b, uMin, uMax, vMin, vMax);
    b.bulk += bulk;
    b.height = b.state === 'burnt' ? b.height : this.heightFor(b.bulk);
    b.standHeight = b.height;
    const add = HP_PER_BULK * bulk;
    b.maxHp = Math.min(HP_MAX, b.maxHp + add);
    b.hp = Math.min(b.maxHp, b.hp + add);
    b.dirty = true;
    const by = this.blame(n, b.x, b.z);
    for (let i = 0; i < n; i++) store.remove(members[i]!);
    store.reindex(b);
    k.ctx.events.emit('prop:moved', { id: b.id, byId: by });
    this.emit(BARRICADE_EXTENDED_EVENT, b, by);
    k.tension(TENSION.barricade / 3, b.x, b.z, 'barricade renforcée');
    if (burning && (b.act & ACT_BURNING) === 0) m.fire.ignite(b, igniter, true, true);
  }

  /** Recale le centre et les demi-dimensions sur une étendue donnée dans le repère de la barricade. */
  private recenter(b: PropObj, uMin: number, uMax: number, vMin: number, vMax: number): void {
    const c = Math.cos(b.heading);
    const s = Math.sin(b.heading);
    const uMid = (uMin + uMax) * 0.5;
    const vMid = (vMin + vMax) * 0.5;
    b.x += uMid * c + vMid * s;
    b.z += -uMid * s + vMid * c;
    const parts = b.parts!;
    for (let i = 0; i < parts.length; i++) {
      parts[i]!.lx -= uMid;
      parts[i]!.lz -= vMid;
    }
    b.halfX = Math.max(0.5, (uMax - uMin) * 0.5);
    b.halfZ = clamp((vMax - vMin) * 0.5, 0.45, 1.6);
    b.standHalfX = b.halfX;
    b.standHalfZ = b.halfZ;
  }

  private emit(name: string, b: PropObj, byId: EntityId): void {
    const e = this.event;
    e.id = b.id;
    e.x = b.x;
    e.z = b.z;
    e.parts = b.parts !== null && b.slot >= 0 ? b.parts.length : 0;
    e.byId = byId;
    this.m.k.ctx.events.emitAny(name, e);
  }

  // ───────────────────────────── démontage ─────────────────────────────

  /** Recrée l'objet d'un élément à la position donnée. */
  private restore(b: PropObj, part: PartRec, x: number, z: number, heading: number): PropObj {
    const m = this.m;
    const q = m.store.create(part.kind, x, z, heading);
    q.hp = Math.min(q.maxHp, Math.max(1, part.hp));
    q.battery = part.battery;
    const left = b.fuelMax > 0 ? clamp(b.fuel / b.fuelMax, 0, 1) : 1;
    q.fuelMax = Math.max(q.fuelMax, part.fuel);
    q.fuel = part.fuel * left;
    q.state = part.state;
    if (b.state === 'burnt' && part.fuel > 0) {
      q.state = 'burnt';
      q.fuel = 0;
      q.height = Math.max(0.1, q.height * q.def.burntHeight);
      q.blocksSight = false;
      if (!q.def.burntBlocks) q.blocksMove = false;
    } else if (q.state === 'intact' && (b.state === 'burning' || b.state === 'damaged')) {
      q.state = 'damaged';
    }
    if (part.toppled) m.motion.applyTopple(q, Math.sin(heading), Math.cos(heading));
    q.dirty = true;
    return q;
  }

  /**
   * Retire de la barricade l'élément le plus proche de `actor` et le dépose de son côté, hors du passage.
   * Retourne l'objet recréé, ou null s'il n'y a rien à retirer.
   */
  takePart(b: PropObj, actor: Person): PropObj | null {
    const parts = b.parts;
    if (b.slot < 0 || parts === null || parts.length === 0) return null;
    const m = this.m;
    const k = m.k;
    const c = Math.cos(b.heading);
    const s = Math.sin(b.heading);
    const adx = actor.x - b.x;
    const adz = actor.z - b.z;
    const alx = adx * c - adz * s;
    const alz = adx * s + adz * c;
    let idx = 0;
    let bestD = Infinity;
    for (let i = 0; i < parts.length; i++) {
      const d = (parts[i]!.lx - alx) * (parts[i]!.lx - alx) + (parts[i]!.lz - alz) * (parts[i]!.lz - alz);
      if (d < bestD) {
        bestD = d;
        idx = i;
      }
    }
    const part = parts[idx]!;
    parts[idx] = parts[parts.length - 1]!;
    parts.pop();
    // dépôt du côté de celui qui dégage, en retrait de la barricade
    const side = alz >= 0 ? 1 : -1;
    const lx = part.lx + k.rng.range(-0.4, 0.4);
    const lz = side * (b.halfZ + 1.6 + k.rng.range(0, 1.2));
    const tmp = this.tmp;
    tmp.x = b.x + lx * c + lz * s;
    tmp.z = b.z - lx * s + lz * c;
    k.ctx.world.resolveCircle(tmp, 0.4);
    const q = this.restore(b, part, tmp.x, tmp.z, b.heading + part.heading + k.rng.range(-0.5, 0.5));
    // rangé : il ne compte plus comme matière de barricade tant que personne n'y retouche
    q.movedAt = -1e9;
    q.movedBy = 0;

    b.bulk -= part.bulk;
    b.fuel = Math.max(0, b.fuel - (b.fuelMax > 0 ? (part.fuel * b.fuel) / b.fuelMax : 0));
    b.fuelMax = Math.max(0, b.fuelMax - part.fuel);
    b.maxHp = Math.max(60, b.maxHp - HP_PER_BULK * part.bulk);
    if (b.hp > b.maxHp) b.hp = b.maxHp;
    b.dirty = true;
    if (parts.length < 2 || b.bulk < 1.5) {
      this.dissolve(b, actor.id);
      return q;
    }
    this.refit(b);
    k.ctx.events.emit('prop:moved', { id: b.id, byId: actor.id });
    return q;
  }

  /** Resserre la boîte de la barricade sur les éléments qui restent. */
  private refit(b: PropObj): void {
    const parts = b.parts!;
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      const pc = Math.abs(Math.cos(p.heading));
      const ps = Math.abs(Math.sin(p.heading));
      const eu = pc * p.halfX + ps * p.halfZ;
      const ev = ps * p.halfX + pc * p.halfZ;
      if (p.lx - eu < uMin) uMin = p.lx - eu;
      if (p.lx + eu > uMax) uMax = p.lx + eu;
      if (p.lz - ev < vMin) vMin = p.lz - ev;
      if (p.lz + ev > vMax) vMax = p.lz + ev;
    }
    this.recenter(b, uMin, uMax, vMin, vMax);
    if (b.state !== 'burnt') b.height = b.standHeight = this.heightFor(b.bulk);
    this.m.store.reindex(b);
  }

  /** Il ne reste presque rien : les derniers éléments retombent sur place et la barricade disparaît. */
  private dissolve(b: PropObj, byId: EntityId): void {
    const parts = b.parts!;
    const c = Math.cos(b.heading);
    const s = Math.sin(b.heading);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const q = this.restore(b, part, b.x + part.lx * c + part.lz * s, b.z - part.lx * s + part.lz * c, b.heading + part.heading);
      q.movedAt = -1e9;
      q.movedBy = 0;
    }
    parts.length = 0;
    this.emit(BARRICADE_CLEARED_EVENT, b, byId);
    this.m.store.remove(b);
    this.m.k.tension(TENSION.feuEteint * 0.5, b.x, b.z, 'barricade dégagée');
  }

  /** La barricade cède (lame, choc, souffle) : elle éclate en épaves chassées de côté. */
  burst(b: PropObj, byId: EntityId): void {
    const parts = b.parts;
    if (b.slot < 0 || parts === null) return;
    const m = this.m;
    const k = m.k;
    const c = Math.cos(b.heading);
    const s = Math.sin(b.heading);
    const wasBurning = (b.act & ACT_BURNING) !== 0;
    let embers = wasBurning ? k.rng.int(2, 5) : 0; // « en feu, la poussée la divise en 2 à 4 foyers »
    // sens de la poussée : à l'opposé de celui qui enfonce
    const by = k.person(byId);
    let px = 0;
    let pz = 0;
    if (by) {
      px = b.x - by.x;
      pz = b.z - by.z;
      const l = Math.sqrt(px * px + pz * pz);
      if (l > 1e-3) {
        px /= l;
        pz /= l;
      }
    }
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const x = b.x + part.lx * c + part.lz * s;
      const z = b.z - part.lx * s + part.lz * c;
      const q = this.restore(b, part, x, z, b.heading + part.heading + k.rng.range(-0.8, 0.8));
      if (q.state !== 'burnt') q.state = 'broken';
      q.hp = Math.min(q.hp, q.maxHp * 0.2);
      if (!q.toppled) m.motion.applyTopple(q, px !== 0 || pz !== 0 ? px : c, px !== 0 || pz !== 0 ? pz : -s);
      if (!q.def.brokenBlocks) {
        q.blocksMove = false;
        q.blocksSight = false;
      }
      // chassée vers l'avant et vers le côté de la barricade où elle se trouvait
      const sideSign = part.lx >= 0 ? 1 : -1;
      const dx = px * 0.8 + c * sideSign * 0.6;
      const dz = pz * 0.8 - s * sideSign * 0.6;
      const l = Math.sqrt(dx * dx + dz * dz) || 1;
      const speed = k.rng.range(2, 4);
      q.vx = (dx / l) * speed;
      q.vz = (dz / l) * speed;
      q.movedBy = byId;
      m.store.activate(q, ACT_MOVING);
      if (embers > 0 && q.fuel > 5 && q.state !== 'burnt') {
        embers--;
        m.fire.ignite(q, b.igniterId, true, true);
      }
    }
    parts.length = 0;
    k.fx('debris', b.x, b.y + 0.5, b.z, 2);
    this.emit(BARRICADE_CLEARED_EVENT, b, byId);
    m.store.remove(b);
  }
}
