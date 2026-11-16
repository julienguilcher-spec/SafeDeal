/* =====================================================================================
 * DÉCOR DYNAMIQUE — déplacement des objets : poussée, renversement, glissade, portage, lame.
 *
 *   - push() : la « force » est la vitesse communiquée à un objet léger (m/s), réduite pour les
 *     objets lourds ; au-delà d'un seuil propre à chaque type, l'objet se renverse ;
 *   - glissade : frottement au sol (un bac sur roulettes va plus loin qu'une barrière), arrêt contre
 *     le décor statique, chocs entre objets (un bac lancé en bouscule un autre, s'arrête contre un
 *     kiosque) ;
 *   - renversement : le gabarit change (un bac couché est long et bas ; une barrière à plat ne gêne
 *     plus le passage) ;
 *   - portage : l'objet suit son porteur (carriedBy) sans gêner personne, puis est reposé devant lui ;
 *   - lame : les engins dotés d'une lame (VehicleDef.canPush) chassent le mobilier mobile et
 *     enfoncent barricades, bancs, jardinières — seulement si aucun module de véhicules ne s'en
 *     charge déjà (réglage `blade`).
 * Un objet déplacé par quelqu'un puis immobilisé est proposé au détecteur de barricades.
 * ===================================================================================== */

import type { EntityId, Person, Vec2, Vehicle } from '@/core/contracts';
import { getCore } from '@/core/context';
import { circleVsObb } from '@/core/math';
import type { Mod } from './mod';
import { ACT_CARRIED, ACT_MOVING } from './shared';
import type { PropObj } from './shared';

/** Vitesse maximale d'un objet projeté (m/s). */
const MAX_SPEED = 16;
/** Sous cette vitesse l'objet est considéré comme arrêté (m/s). */
const REST_SPEED = 0.05;
/** Frottement d'un objet renversé ou cassé (m/s²). */
const DRAG_FRICTION = 7;
/** Intervalle minimal entre deux événements prop:moved pour un même objet (s). */
const MOVED_EVENT_GAP = 0.25;
/** Restitution d'un choc entre objets. */
const BOUNCE = 0.15;
/** Types fixes que la lame d'un engin peut enfoncer. */
const BLADE_KINDS: Record<string, true> = { barricade: true, banc: true, jardiniere: true, pile_paves: true };
/** Dégâts de la lame par seconde à l'allure de référence (1,4 m/s). */
const BLADE_RATE = 100;

export class Motion {
  private readonly tmp: Vec2 = { x: 0, z: 0 };
  private readonly near: PropObj[] = [];
  private readonly bladeBuf: PropObj[] = [];

  constructor(private readonly m: Mod) {}

  /** Note qu'une personne (ou un engin) a déplacé l'objet. */
  markMoved(p: PropObj, byId: EntityId): void {
    const now = this.m.k.ctx.clock.now;
    if (byId !== 0) p.movedBy = byId;
    p.movedAt = now;
    p.dirty = true;
    p.dormant = false;
  }

  private emitMoved(p: PropObj, byId: EntityId): void {
    const ctx = this.m.k.ctx;
    if (ctx.clock.now - p.movedEventAt < MOVED_EVENT_GAP) return;
    p.movedEventAt = ctx.clock.now;
    ctx.events.emit('prop:moved', { id: p.id, byId });
  }

  // ───────────────────────────── poussée ─────────────────────────────

  push(p: PropObj, dirX: number, dirZ: number, force: number, byId: EntityId): void {
    if (p.slot < 0 || !p.movable || !(force > 0) || p.carriedBy !== 0) return;
    const l = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (!(l > 1e-9)) return;
    const dx = dirX / l;
    const dz = dirZ / l;
    const def = p.def;
    const dv = force * def.pushFactor;
    p.vx += dx * dv;
    p.vz += dz * dv;
    const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    if (speed > MAX_SPEED) {
      p.vx *= MAX_SPEED / speed;
      p.vz *= MAX_SPEED / speed;
    }
    this.markMoved(p, byId);
    if (!p.toppled && def.topple !== 'none' && dv >= def.toppleSpeed) this.applyTopple(p, dx, dz);
    this.m.store.activate(p, ACT_MOVING);
    this.emitMoved(p, byId);
  }

  // ───────────────────────────── renversement ─────────────────────────────

  /** Renverse l'objet dans la direction donnée. false s'il ne se renverse pas (fixe, déjà à terre). */
  topple(p: PropObj, dirX: number, dirZ: number, byId: EntityId): boolean {
    if (p.slot < 0 || p.toppled || p.def.topple === 'none' || p.carriedBy !== 0) return false;
    const l = Math.sqrt(dirX * dirX + dirZ * dirZ);
    const dx = l > 1e-9 ? dirX / l : Math.sin(p.heading);
    const dz = l > 1e-9 ? dirZ / l : Math.cos(p.heading);
    this.markMoved(p, byId);
    this.applyTopple(p, dx, dz);
    const k = this.m.k;
    k.sfx('tole', p.x, p.y + 0.3, p.z, p.def.mass > 30 ? 1 : 0.6, p.def.material === 'plastique' ? 0.8 : 1.1);
    k.ctx.events.emit('prop:moved', { id: p.id, byId });
    p.movedEventAt = k.ctx.clock.now;
    this.m.barricades.schedule(p);
    return true;
  }

  /** Applique le gabarit « renversé » (aussi quand un autre module a posé prop.toppled lui-même). */
  applyTopple(p: PropObj, dx: number, dz: number): void {
    p.toppled = true;
    if (p.toppledDone) return;
    p.toppledDone = true;
    p.dirty = true;
    const def = p.def;
    if (def.topple === 'none' || p.parts !== null) return;
    const hx = p.standHalfX;
    const hz = p.standHalfZ;
    const H = p.standHeight;
    if (def.topple === 'lie') {
      const ratio = hx > hz ? hx / hz : hz / hx;
      if (ratio < 1.3) {
        // emprise presque carrée (corbeille, table) : l'objet tombe exactement dans la direction du coup
        p.heading = Math.atan2(dx, dz);
        p.halfX = hx > hz ? hx : hz;
        p.halfZ = H * 0.5;
        p.height = 2 * (hx < hz ? hx : hz);
        const shift = H * 0.5 - (hx < hz ? hx : hz);
        p.x += dx * shift;
        p.z += dz * shift;
      } else {
        // emprise allongée (bac roulant) : il bascule autour de son grand côté ou de son petit côté
        const s = Math.sin(p.heading);
        const c = Math.cos(p.heading);
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lz) >= Math.abs(lx)) {
          const sign = lz >= 0 ? 1 : -1;
          const shift = (H * 0.5 - hz) * sign;
          p.halfZ = H * 0.5;
          p.height = 2 * hz;
          p.x += s * shift;
          p.z += c * shift;
        } else {
          const sign = lx >= 0 ? 1 : -1;
          const shift = (H * 0.5 - hx) * sign;
          p.halfX = H * 0.5;
          p.height = 2 * hx;
          p.x += c * shift;
          p.z += -s * shift;
        }
      }
    } else {
      // à plat : le grand côté reste, la hauteur se couche sur le petit côté
      const s = Math.sin(p.heading);
      const c = Math.cos(p.heading);
      if (hx >= hz) {
        const lz = dx * s + dz * c;
        const shift = (H * 0.5 - hz) * (lz >= 0 ? 1 : -1);
        p.halfZ = H * 0.5;
        p.height = Math.max(0.15, 2 * hz);
        p.x += s * shift;
        p.z += c * shift;
      } else {
        const lx = dx * c - dz * s;
        const shift = (H * 0.5 - hx) * (lx >= 0 ? 1 : -1);
        p.halfX = H * 0.5;
        p.height = Math.max(0.15, 2 * hx);
        p.x += c * shift;
        p.z += -s * shift;
      }
    }
    if (p.blocksMove && !def.toppledBlocks) p.blocksMove = false;
    p.blocksSight = false;
    this.m.store.reindex(p);
  }

  // ───────────────────────────── portage ─────────────────────────────

  carry(p: PropObj, by: Person): boolean {
    if (p.slot < 0 || p.def.carry === 'non' || p.carriedBy !== 0 || by.carrying !== 0 || p.parts !== null) return false;
    if (p.burning > 0.2 || !p.movable) return false;
    const store = this.m.store;
    p.carriedBy = by.id;
    by.carrying = p.id;
    p.vx = 0;
    p.vz = 0;
    store.deactivate(p, ACT_MOVING);
    store.activate(p, ACT_CARRIED);
    this.markMoved(p, by.id);
    this.follow(p, by);
    this.emitMoved(p, by.id);
    return true;
  }

  /** La personne repose l'objet qu'elle porte devant elle. */
  drop(by: Person): boolean {
    const p = by.carrying !== 0 ? this.m.store.get(by.carrying) : undefined;
    if (!p || p.carriedBy !== by.id) return false;
    this.follow(p, by);
    by.carrying = 0;
    this.release(p, by.id);
    return true;
  }

  private follow(p: PropObj, by: Person): void {
    const d = by.radius + (p.halfX < p.halfZ ? p.halfX : p.halfZ) + 0.25;
    p.x = by.x + Math.sin(by.heading) * d;
    p.z = by.z + Math.cos(by.heading) * d;
    p.y = by.y;
    // un objet long est tenu en travers, face au porteur
    p.heading = p.halfX >= p.halfZ ? by.heading : by.heading + Math.PI * 0.5;
    this.m.store.reindex(p);
  }

  private release(p: PropObj, byId: EntityId): void {
    const ctx = this.m.k.ctx;
    const store = this.m.store;
    p.carriedBy = 0;
    store.deactivate(p, ACT_CARRIED);
    // posé contre un mur : l'objet reste du bon côté
    const tmp = this.tmp;
    tmp.x = p.x;
    tmp.z = p.z;
    if (ctx.world.resolveCircle(tmp, (p.halfX < p.halfZ ? p.halfX : p.halfZ) + 0.05)) {
      p.x = tmp.x;
      p.z = tmp.z;
    }
    const y = ctx.world.heightAt(p.x, p.z);
    p.y = Number.isFinite(y) ? y : 0;
    store.reindex(p);
    this.markMoved(p, byId);
    ctx.events.emit('prop:moved', { id: p.id, byId });
    p.movedEventAt = ctx.clock.now;
    this.m.barricades.schedule(p);
  }

  // ───────────────────────────── pas de simulation ─────────────────────────────

  update(dt: number): void {
    const store = this.m.store;
    const k = this.m.k;
    const ctx = k.ctx;

    // objets portés : ils suivent leur porteur ; lâchés si celui-ci tombe, disparaît ou porte autre chose
    const carried = store.carried;
    for (let i = carried.length - 1; i >= 0; i--) {
      const p = carried[i]!;
      const by = p.carriedBy !== 0 ? ctx.people.get(p.carriedBy) : undefined;
      if (!by || by.carrying !== p.id || by.posture === 'down' || by.vehicleId !== 0) {
        if (by && by.carrying === p.id) by.carrying = 0;
        this.release(p, by ? by.id : 0);
        continue;
      }
      this.follow(p, by);
    }

    // objets qui glissent
    const moving = store.moving;
    const tmp = this.tmp;
    for (let i = moving.length - 1; i >= 0; i--) {
      const p = moving[i]!;
      if (p.carriedBy !== 0) {
        p.vx = 0;
        p.vz = 0;
      }
      if (p.toppled && !p.toppledDone) this.applyTopple(p, p.vx, p.vz);
      let speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      if (speed > REST_SPEED) {
        const friction = p.toppled || p.state === 'broken' || p.state === 'burnt' ? DRAG_FRICTION : p.def.friction;
        const drop = friction * dt;
        if (speed <= drop) {
          const d = (speed * speed) / (2 * friction);
          p.x += (p.vx / speed) * d;
          p.z += (p.vz / speed) * d;
          p.vx = 0;
          p.vz = 0;
          speed = 0;
        } else {
          const f = (speed - drop) / speed;
          p.x += p.vx * dt * (1 + f) * 0.5;
          p.z += p.vz * dt * (1 + f) * 0.5;
          p.vx *= f;
          p.vz *= f;
          speed -= drop;
        }
        const r = (p.halfX < p.halfZ ? p.halfX : p.halfZ) + 0.05;
        // décor statique : l'objet s'arrête contre le mur
        tmp.x = p.x;
        tmp.z = p.z;
        if (ctx.world.resolveCircle(tmp, r)) {
          p.x = tmp.x;
          p.z = tmp.z;
          p.vx = 0;
          p.vz = 0;
          speed = 0;
        }
        if (speed > 0) speed = this.collide(p, r, speed);
        const y = ctx.world.heightAt(p.x, p.z);
        p.y = Number.isFinite(y) ? y : 0;
        store.reindex(p);
      }
      if (speed <= REST_SPEED) {
        p.vx = 0;
        p.vz = 0;
        p.act &= ~ACT_MOVING;
        moving[i] = moving[moving.length - 1]!;
        moving.pop();
        if (store.stale(p)) store.reindex(p);
        this.m.barricades.schedule(p);
      }
    }

    this.updateBlades(dt);
  }

  /** Chocs de l'objet qui glisse contre les autres objets solides. Retourne sa vitesse après les chocs. */
  private collide(p: PropObj, r: number, speed: number): number {
    const store = this.m.store;
    const near = this.near;
    const n = store.collectAround(p.x, p.z, r + 0.05, near);
    if (n <= 1) return speed;
    const tmp = this.tmp;
    for (let j = 0; j < n; j++) {
      const q = near[j]!;
      if (q === p || !q.blocksMove || q.dormant || q.carriedBy !== 0) continue;
      if (!circleVsObb(p.x, p.z, r, q.x, q.z, q.halfX, q.halfZ, q.heading, tmp)) continue;
      const l = Math.sqrt(tmp.x * tmp.x + tmp.z * tmp.z);
      p.x += tmp.x;
      p.z += tmp.z;
      if (l < 1e-9) continue;
      const nx = tmp.x / l;
      const nz = tmp.z / l;
      const vn = (p.vx - q.vx) * nx + (p.vz - q.vz) * nz;
      if (vn >= 0) continue; // ils s'éloignent déjà
      if (q.movable) {
        const mp = p.def.mass;
        const mq = q.def.mass;
        const j2 = (-(1 + BOUNCE) * vn) / (1 / mp + 1 / mq);
        p.vx += (nx * j2) / mp;
        p.vz += (nz * j2) / mp;
        q.vx -= (nx * j2) / mq;
        q.vz -= (nz * j2) / mq;
        this.markMoved(q, p.movedBy);
        store.activate(q, ACT_MOVING);
      } else {
        p.vx -= nx * vn * (1 + BOUNCE);
        p.vz -= nz * vn * (1 + BOUNCE);
      }
    }
    return Math.sqrt(p.vx * p.vx + p.vz * p.vz);
  }

  // ───────────────────────────── lame des engins ─────────────────────────────

  /** La lame est-elle gérée ici ? ('auto' : oui tant que ctx.vehicles est le magasin de base du cœur.) */
  private bladeActive(): boolean {
    const mode = this.m.k.tuning.blade;
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    const ctx = this.m.k.ctx;
    try {
      return ctx.vehicles === getCore(ctx).stores.vehicles;
    } catch {
      return false;
    }
  }

  private updateBlades(dt: number): void {
    const ctx = this.m.k.ctx;
    const vehicles = ctx.vehicles.list;
    if (vehicles.length === 0 || this.m.store.list.length === 0) return;
    if (!this.bladeActive()) return;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]!;
      if (!v.def.canPush || v.dormant || v.def.flying) continue;
      const sn = Math.sin(v.heading);
      const cs = Math.cos(v.heading);
      // vitesse d'avance : celle du contrat, ou à défaut la projection de la vitesse sur l'avant
      let u = v.speed;
      const proj = v.vx * sn + v.vz * cs;
      if (Math.abs(proj) > Math.abs(u)) u = proj;
      if (u < 0.3) continue;
      this.blade(v, sn, cs, u, dt);
    }
  }

  private blade(v: Vehicle, sn: number, cs: number, u: number, dt: number): void {
    const store = this.m.store;
    const halfL = v.def.length * 0.5;
    const halfW = v.def.width * 0.5;
    // bande balayée par la lame pendant ce pas, juste devant le nez de l'engin
    const depth = 0.45 + u * dt;
    const bx = v.x + sn * (halfL + depth * 0.5);
    const bz = v.z + cs * (halfL + depth * 0.5);
    const buf = this.bladeBuf;
    const n = store.collectAround(bx, bz, halfW + depth + 0.5, buf);
    const driverId = v.seats.length > 0 ? v.seats[0]! : 0;
    for (let i = 0; i < n; i++) {
      const p = buf[i]!;
      if (p.dormant || p.carriedBy !== 0 || p.slot < 0) continue;
      // boîte de l'objet contre la bande de la lame : test par les rayons projetés (suffisant à cette échelle)
      const rx = p.x - bx;
      const rz = p.z - bz;
      const along = rx * sn + rz * cs;
      const side = -rx * cs + rz * sn;
      const ps = Math.sin(p.heading);
      const pc = Math.cos(p.heading);
      const extAlong = Math.abs(pc * sn - ps * cs) * p.halfX + Math.abs(ps * sn + pc * cs) * p.halfZ;
      const extSide = Math.abs(pc * cs + ps * sn) * p.halfX + Math.abs(ps * cs - pc * sn) * p.halfZ;
      if (Math.abs(along) > depth * 0.5 + extAlong || Math.abs(side) > halfW + extSide) continue;
      if (p.movable) {
        // mobilier léger : chassé devant l'engin, un peu vers le côté où il se trouve
        const lateral = side > 0 ? 0.35 : -0.35;
        this.push(p, sn - cs * lateral, cs + sn * lateral, Math.max(1.5, u * 1.15 + 0.4) / p.def.pushFactor, driverId);
        if (u > 1.5 && !p.toppled && p.def.topple !== 'none') this.applyTopple(p, sn, cs);
        continue;
      }
      if (!BLADE_KINDS[p.kind]) continue;
      // obstacle lourd : il recule avec la lame et se disloque
      const pace = u / 1.4;
      const step = u * dt;
      p.x += sn * step;
      p.z += cs * step;
      this.markMoved(p, driverId);
      store.reindex(p);
      this.emitMoved(p, driverId);
      this.m.damage.damage(p, BLADE_RATE * dt * (pace < 0.3 ? 0.3 : pace > 1.6 ? 1.6 : pace), 'crush', driverId);
    }
  }
}
