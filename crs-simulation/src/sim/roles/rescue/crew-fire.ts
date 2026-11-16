/* =====================================================================================
 * SAPEURS-POMPIERS — travail sur place.
 *
 *   chef d'agrès        fait le tour du feu (relevé des foyers et des victimes), répartit, rend compte ;
 *   binôme d'attaque    établit la lance (10 s), se place à distance d'attaque en vue directe du foyer
 *                       (9 m ; 12 m pour un véhicule), arrose le foyer le plus fort jusqu'à extinction,
 *                       puis passe au suivant ; il ne s'éloigne pas de l'engin de plus que l'établissement ;
 *   binôme de secours   dégage les victimes exposées (portées jusqu'au point abrité près de l'engin),
 *                       les soigne, demande le SAMU pour une urgence et reste auprès d'elle.
 * L'eau vient de la cuve de l'engin (3 000 l à 8 l/s par lance), réalimentée si une bouche d'incendie
 * est à portée. Le feu est tenu pour éteint après six secondes sans foyer (surveillance des points chauds).
 * ===================================================================================== */

import type { EntityId, Person, Prop, Shop, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { RescueApi } from '@/core/extensions';
import { injuryRank } from './care';
import {
  ROLE_AID, ROLE_CHIEF, ROLE_DRIVER, ROLE_HOSE, T_CASUALTY, T_HOSE, T_IDLE, T_STANDBY, ableBody,
} from './crew';
import type { CallRec, Crew, FireTarget, RescueKernel, Rescuer } from './crew';
import { R_BUSY, R_NEEDS_EVAC, S_STAY } from './crew-tasks';
import type { CrewTasks } from './crew-tasks';
import { clearLine, holdFacing } from './nav';
import type { RescueRadio } from './radio';
import {
  FIRE_WATCH, HOSE_LENGTH, HOSE_RANGE, HOSE_SPLASH, HOSE_STAND, HOSE_STAND_VEHICLE, HYDRANT_FLOW, HYDRANT_RANGE, STAY_WITH_VICTIM,
  WORK_RADIUS,
} from './tuning';

/** Ce que le module lit du champ des dangers (« hazards.field »), s'il est branché. */
interface FireFieldLike {
  readonly fires: readonly { x: number; z: number; radius: number; intensity: number }[];
}
interface HealthExtLike {
  extinguish(p: Person, byId: EntityId): void;
}

const FIRE_MIN = 0.03;
const MAX_TARGETS = 16;
/** Angles essayés autour du foyer pour trouver un emplacement de lance (rad). */
const STAND_ANGLES: readonly number[] = [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.3, -2.3, Math.PI];

export class FireWork {
  private readonly nearProps: Prop[] = [];
  private readonly nearVehicles: Vehicle[] = [];
  private readonly nearShops: Shop[] = [];
  private readonly nearPeople: Person[] = [];
  private readonly burningProp = (p: Prop): boolean => !p.dormant && (p.state === 'burning' || p.burning > 0.05);
  private readonly isHydrant = (p: Prop): boolean => p.kind === 'bouche_incendie';
  private readonly isVictim = (q: Person): boolean => q.posture === 'down' && q.faction !== 'rescue' && q.vehicleId === 0 && !q.dormant;

  constructor(private readonly k: RescueKernel, private readonly tasks: CrewTasks, private readonly radio: RescueRadio) {}

  // ───────────────────────────── relevé des foyers ─────────────────────────────

  private put(crew: Crew, kind: FireTarget['kind'], id: EntityId, x: number, z: number, m: number, r: number, rank: number): void {
    if (crew.fireCount >= MAX_TARGETS) return;
    let f = crew.fires[crew.fireCount];
    if (!f) {
      f = { kind, id, x, z, m, r, rank };
      crew.fires.push(f);
    } else {
      f.kind = kind;
      f.id = id;
      f.x = x;
      f.z = z;
      f.m = m;
      f.r = r;
      f.rank = rank;
    }
    crew.fireCount++;
  }

  /** Foyers dans le rayon de travail autour du point (x, z), les plus graves d'abord. Retourne leur nombre. */
  collectFires(crew: Crew, x: number, z: number): number {
    const ctx = this.k.ctx;
    crew.fireCount = 0;
    const own = crew.vehicle ? crew.vehicle.id : 0;
    let n = ctx.vehicles.queryRadius(x, z, WORK_RADIUS, this.nearVehicles);
    for (let i = 0; i < n; i++) {
      const v = this.nearVehicles[i];
      if (v.id === own || v.def.flying || v.state === 'burnt') continue;
      const m = v.state === 'burning' && v.burning < 0.2 ? 0.2 : v.burning;
      if (m > FIRE_MIN) this.put(crew, 'vehicle', v.id, v.x, v.z, m, Math.max(v.def.length, v.def.width) * 0.5, 3);
    }
    n = ctx.props.shopsNear(x, z, WORK_RADIUS, this.nearShops);
    for (let i = 0; i < n; i++) {
      const s = this.nearShops[i];
      // on attaque une boutique depuis la rue : le point visé est devant la vitrine
      if (s.burning > FIRE_MIN) this.put(crew, 'shop', s.id, s.x + Math.sin(s.heading) * 0.6, s.z + Math.cos(s.heading) * 0.6, s.burning, s.width * 0.5, 4);
    }
    n = ctx.props.queryRadius(x, z, WORK_RADIUS, this.nearProps, this.burningProp);
    for (let i = 0; i < n; i++) {
      const p = this.nearProps[i];
      const m = p.state === 'burning' && p.burning < 0.15 ? 0.15 : p.burning;
      this.put(crew, 'prop', p.id, p.x, p.z, m, Math.max(p.halfX, p.halfZ), p.kind === 'barricade' ? 2 : 1);
    }
    // nappes au sol qui ne sont le pied d'aucun objet déjà relevé
    const entities = crew.fireCount;
    const field = ctx.service<FireFieldLike>('hazards.field');
    if (field) {
      const fires = field.fires;
      for (let i = 0; i < fires.length; i++) {
        const g = fires[i];
        if (g.intensity <= FIRE_MIN || Math.hypot(g.x - x, g.z - z) > WORK_RADIUS) continue;
        let covered = false;
        for (let j = 0; j < entities && !covered; j++) {
          const f = crew.fires[j];
          covered = Math.hypot(f.x - g.x, f.z - g.z) <= f.r + 3;
        }
        if (!covered) this.put(crew, 'place', 0, g.x, g.z, g.intensity, g.radius, 0);
      }
    } else if (entities === 0) {
      const m = ctx.hazards.fireAt(x, z);
      if (m > FIRE_MIN) this.put(crew, 'place', 0, x, z, m, 1.5, 0);
    }
    // tri par rang puis intensité (tri par insertion : la liste est courte et déjà presque triée d'un relevé à l'autre)
    const fires = crew.fires;
    for (let i = 1; i < crew.fireCount; i++) {
      const f = fires[i];
      let j = i - 1;
      while (j >= 0 && (fires[j].rank < f.rank || (fires[j].rank === f.rank && fires[j].m < f.m))) {
        fires[j + 1] = fires[j];
        j--;
      }
      fires[j + 1] = f;
    }
    return crew.fireCount;
  }

  /** Mesure courante d'un foyer suivi par un membre. */
  private measure(r: Rescuer): number {
    const ctx = this.k.ctx;
    switch (r.targetKind) {
      case 'prop': {
        const p = ctx.props.get(r.targetId);
        if (!p || p.state === 'burnt') return 0;
        r.tx = p.x;
        r.tz = p.z;
        return p.state === 'burning' && p.burning < 0.15 ? 0.15 : p.burning;
      }
      case 'vehicle': {
        const v = ctx.vehicles.get(r.targetId);
        if (!v || v.state === 'burnt') return 0;
        r.tx = v.x;
        r.tz = v.z;
        return v.state === 'burning' && v.burning < 0.2 ? 0.2 : v.burning;
      }
      case 'shop': {
        const s = ctx.props.shop(r.targetId);
        return s ? s.burning : 0;
      }
      default:
        return ctx.hazards.fireAt(r.tx, r.tz);
    }
  }

  // ───────────────────────────── victimes ─────────────────────────────

  private collectVictims(crew: Crew, x: number, z: number): number {
    const k = this.k;
    const n = k.ctx.people.queryRadius(x, z, WORK_RADIUS, this.nearPeople, this.isVictim);
    const out = crew.victims;
    let c = 0;
    for (let i = 0; i < n; i++) {
      const q = this.nearPeople[i];
      if (q.heldBy !== 0 || q.injury === 'dead') continue;
      const st = k.care.state(q.id);
      // déjà soignée et en attente d'une ambulance : elle n'est plus une victime « à dégager »
      if (st && st.treatedAt >= 0 && !k.care.needsCare(q) && !this.tasks.inDanger(crew, q)) continue;
      if (injuryRank(q.injury) === 0 && !this.tasks.inDanger(crew, q)) continue; // simple chute
      if (c < out.length) out[c] = q;
      else out.push(q);
      c++;
    }
    out.length = c;
    return c;
  }

  // ───────────────────────────── boucle de l'équipage ─────────────────────────────

  /** Un pas de réflexion de l'équipage sur place. Retourne true quand il n'y a plus rien à faire. */
  think(crew: Crew, call: CallRec, dt: number): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const fires = this.collectFires(crew, call.x, call.z);
    const victims = this.collectVictims(crew, call.x, call.z);
    if (fires > 0) {
      crew.lastFireAt = now;
      crew.foundWork = true;
    }
    if (victims > 0) crew.foundWork = true;
    this.refill(crew, dt);
    // point abrité où déposer les victimes : derrière l'engin, à l'opposé du feu
    let safeX = crew.posX();
    let safeZ = crew.posZ();
    {
      let dx = safeX - call.x;
      let dz = safeZ - call.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      const back = d < 12 ? 14 : 5;
      safeX += dx * back;
      safeZ += dz * back;
    }
    let working = false;
    let hoseIndex = 0;
    const members = crew.members;
    for (let i = 0; i < members.length; i++) {
      const r = members[i];
      const p = r.p;
      if (p.isPlayer || !ableBody(ctx, p)) continue;
      if (p.vehicleId !== 0) {
        if (r.role === ROLE_DRIVER) continue; // le conducteur reste à la pompe
        ctx.vehicles.exit(p);
        if (p.vehicleId !== 0) continue;
      }
      switch (r.role) {
        case ROLE_HOSE:
          if (this.hose(crew, r, hoseIndex++, dt)) working = true;
          break;
        case ROLE_AID:
          if (this.aid(crew, call, r, safeX, safeZ)) working = true;
          else if (fires > 0 && this.spare(crew, r, hoseIndex, dt)) {
            hoseIndex++;
            working = true;
          }
          break;
        case ROLE_CHIEF:
          this.chief(crew, call, r);
          break;
        default:
          break;
      }
    }
    if (working || fires > 0) return false;
    // plus de foyer : surveillance des points chauds, puis on rend compte
    if (crew.foundWork && now - crew.lastFireAt < FIRE_WATCH) return false;
    if (!crew.foundWork && now - crew.phaseAt < 8) return false; // tour du feu : rien trouvé, on vérifie quand même
    return true;
  }

  /** Le chef d'agrès se tient entre l'engin et le feu, d'où il voit son personnel. */
  private chief(crew: Crew, call: CallRec, r: Rescuer): void {
    const ctx = this.k.ctx;
    const p = r.p;
    if (this.tasks.busy(p)) return;
    const ox = crew.posX();
    const oz = crew.posZ();
    const sx = ox + (call.x - ox) * 0.35;
    const sz = oz + (call.z - oz) * 0.35;
    r.task = T_STANDBY;
    if (Math.hypot(sx - p.x, sz - p.z) > 2.5) {
      r.walker.goTo(ctx, p, sx, sz, 1.5);
    } else {
      r.walker.stop(p);
      holdFacing(p, call.x, call.z);
    }
  }

  /** Un équipier de secours sans victime renforce l'attaque avec un extincteur ou une seconde lance. */
  private spare(crew: Crew, r: Rescuer, index: number, dt: number): boolean {
    if (this.k.ctx.actions.def('lance_incendie') && this.k.ctx.actions.has(r.p, 'lance_incendie') <= 0) return false;
    return this.hose(crew, r, index, dt);
  }

  /** Alimentation : la cuve se remplit si une bouche d'incendie est à portée de l'engin. */
  private refill(crew: Crew, dt: number): void {
    const v = crew.vehicle;
    if (!v || v.turretAmmo.length === 0 || v.def.turrets.length === 0 || v.def.turrets[0].kind !== 'canon_eau') return;
    const cap = v.def.turrets[0].capacity;
    if (v.turretAmmo[0] >= cap) return;
    if (this.k.ctx.props.queryRadius(v.x, v.z, HYDRANT_RANGE, this.nearProps, this.isHydrant) === 0) return;
    const w = v.turretAmmo[0] + HYDRANT_FLOW * dt;
    v.turretAmmo[0] = w > cap ? cap : w;
  }

  /** Prélève l'eau d'un jet dans la cuve ; false si elle est vide. */
  private draw(crew: Crew, dt: number): boolean {
    const v = crew.vehicle;
    if (!v || crew.onFoot || v.turretAmmo.length === 0 || v.def.turrets.length === 0 || v.def.turrets[0].kind !== 'canon_eau') return true;
    const need = this.k.tuning.hoseFlow * dt;
    if (v.turretAmmo[0] < need) return false;
    v.turretAmmo[0] -= need;
    return true;
  }

  // ───────────────────────────── la lance ─────────────────────────────

  /** Emplacement d'où attaquer le foyer : à distance d'attaque, en vue directe, hors des flammes, du côté de l'engin. */
  private standPoint(crew: Crew, r: Rescuer, f: FireTarget, index: number): void {
    const ctx = this.k.ctx;
    const dist = (f.kind === 'vehicle' ? HOSE_STAND_VEHICLE : HOSE_STAND) + f.r * 0.5;
    const ox = crew.posX();
    const oz = crew.posZ();
    const base = Math.atan2(ox - f.x, oz - f.z) + (index % 2 === 0 ? 0.22 : -0.22) * (1 + (index >> 1));
    for (let i = 0; i < STAND_ANGLES.length; i++) {
      const a = base + STAND_ANGLES[i];
      const x = f.x + Math.sin(a) * dist;
      const z = f.z + Math.cos(a) * dist;
      if (!ctx.world.isFree(x, z, 0.45) || ctx.hazards.fireAt(x, z) > 0.1 || !clearLine(ctx, x, z, f.x, f.z)) continue;
      // la lance ne s'éloigne pas de l'engin de plus que l'établissement (sauf engin laissé en retrait : dévidoir à main)
      if (!crew.onFoot && !crew.walking && Math.hypot(x - ox, z - oz) > HOSE_LENGTH) continue;
      r.sx = x;
      r.sz = z;
      return;
    }
    // aucun emplacement dégagé : au plus près, sur la ligne vers l'engin
    const d = Math.hypot(ox - f.x, oz - f.z) || 1;
    r.sx = f.x + ((ox - f.x) / d) * Math.min(dist, d);
    r.sz = f.z + ((oz - f.z) / d) * Math.min(dist, d);
  }

  private aim(r: Rescuer, f: FireTarget, crew: Crew, index: number): void {
    r.task = T_HOSE;
    r.targetKind = f.kind;
    r.targetId = f.id;
    r.tx = f.x;
    r.tz = f.z;
    r.lastMeasure = f.m;
    const p = r.p;
    const d = Math.hypot(f.x - p.x, f.z - p.z);
    // déjà en position de l'atteindre : on réoriente la lance sans se déplacer
    const reach = d >= 3 + f.r * 0.5 && d <= HOSE_RANGE - 3 && r.hoseSet && clearLine(this.k.ctx, p.x, p.z, f.x, f.z);
    if (reach) {
      r.sx = p.x;
      r.sz = p.z;
      r.stage = 1;
      r.readyAt = this.k.now + 1.5;
    } else {
      this.standPoint(crew, r, f, index);
      r.stage = 0;
    }
  }

  /** Un pas du porte-lance. Retourne true tant qu'il a un foyer à combattre. */
  private hose(crew: Crew, r: Rescuer, index: number, dt: number): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const p = r.p;
    const now = k.now;
    if (this.tasks.busy(p)) return true;
    // foyer en cours : toujours là ?
    if (r.task === T_HOSE) {
      const m = this.measure(r);
      if (m <= FIRE_MIN) {
        if (r.lastMeasure > FIRE_MIN && crew.call) crew.call.record.firesOut++;
        r.task = T_IDLE;
        if (p.upper === 'extinguish') p.upper = 'none';
      } else {
        r.lastMeasure = m;
      }
    }
    if (r.task !== T_HOSE) {
      if (crew.fireCount === 0) {
        // surveillance : lance en main, face au dernier foyer
        r.walker.stop(p);
        if (p.upper === 'extinguish') p.upper = 'none';
        return false;
      }
      // deux lances sur le foyer principal s'il est seul ou gros ; sinon chacun le sien
      const f = crew.fires[crew.fireCount === 1 || crew.fires[0].rank >= 3 ? 0 : index % crew.fireCount];
      this.aim(r, f, crew, index);
    }
    if (r.stage === 0) {
      if (Math.hypot(r.sx - p.x, r.sz - p.z) > 1.1) {
        r.walker.goTo(ctx, p, r.sx, r.sz, 0.9);
        return true;
      }
      r.walker.stop(p);
      r.stage = 1;
      // établissement : la première fois seulement ; ensuite la lance suit
      r.readyAt = now + (r.hoseSet ? 2 : k.tuning.hoseSetup);
      if (ctx.actions.def('lance_incendie')) ctx.actions.selectById(p, 'lance_incendie');
    }
    holdFacing(p, r.tx, r.tz);
    if (now < r.readyAt) return true;
    r.hoseSet = true;
    // la vue s'est fermée (le foyer a bougé, un engin s'est mis en travers) : on se replace
    const d = Math.hypot(r.tx - p.x, r.tz - p.z);
    if (d > HOSE_RANGE || !clearLine(ctx, p.x, p.z, r.tx, r.tz)) {
      r.task = T_IDLE;
      return true;
    }
    if (!this.draw(crew, dt)) {
      // cuve vide : plus d'eau tant que l'alimentation ne suit pas
      if (p.upper === 'extinguish') p.upper = 'none';
      return true;
    }
    if (p.upper !== 'extinguish') {
      p.upper = 'extinguish';
      p.upperT = 0;
    } else {
      p.upperT += dt;
    }
    p.cmd.aimPitch = -0.08;
    k.douse(r.tx, r.tz, HOSE_SPLASH, k.tuning.hoseRate * dt);
    this.quenchPeople(r);
    if (now >= r.fxAt) {
      r.fxAt = now + 0.3;
      const ux = (r.tx - p.x) / (d || 1);
      const uz = (r.tz - p.z) / (d || 1);
      ctx.events.emit('fx', { id: 'jet_eau', x: p.x + ux * 0.6, y: p.y + 1.1, z: p.z + uz * 0.6, dirX: ux, dirY: 0.05, dirZ: uz, size: d, seconds: 0.35 });
      ctx.events.emit('fx', { id: 'eclaboussure', x: r.tx, y: ctx.world.heightAt(r.tx, r.tz) + 0.2, z: r.tz, size: 1 });
    }
    if (now >= r.sfxAt) {
      r.sfxAt = now + 1;
      ctx.events.emit('sfx', { id: 'canon_eau', x: p.x, y: p.y + 1.1, z: p.z, volume: 0.6, pitch: 1.2 });
    }
    return true;
  }

  /** Une personne en feu dans le jet est éteinte. */
  private quenchPeople(r: Rescuer): void {
    const ctx = this.k.ctx;
    const n = ctx.people.queryRadius(r.tx, r.tz, HOSE_SPLASH + 0.5, this.nearPeople);
    if (n === 0) return;
    const ext = ctx.service<HealthExtLike>('people.health');
    for (let i = 0; i < n; i++) {
      const q = this.nearPeople[i];
      if (!(q.burning > 0)) continue;
      if (ext) ext.extinguish(q, r.p.id);
      else q.burning = 0;
    }
  }

  // ───────────────────────────── secours à victime ─────────────────────────────

  /** Un pas de l'équipier de secours. Retourne true tant qu'il s'occupe d'une victime. */
  private aid(crew: Crew, call: CallRec, r: Rescuer, safeX: number, safeZ: number): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const now = k.now;
    const p = r.p;
    if (r.task === T_CASUALTY && r.stage === S_STAY) {
      // auprès d'une urgence stabilisée, jusqu'à l'arrivée de l'ambulance (ou un délai raisonnable)
      const victim = ctx.people.get(r.targetId);
      if (!victim || victim.posture !== 'down' || victim.heldBy !== 0 || victim.vehicleId !== 0 || now >= r.until || this.samuOnScene(victim)) {
        this.tasks.release(r);
        return false;
      }
      this.tasks.stayWith(r, victim.id);
      return true;
    }
    if (r.task !== T_CASUALTY) {
      // la victime la plus exposée d'abord, puis la plus atteinte
      let best: Person | null = null;
      let bestScore = -Infinity;
      for (let i = 0; i < crew.victims.length; i++) {
        const q = crew.victims[i];
        const claimed = k.care.claimedBy(q.id);
        if (claimed !== 0 && claimed !== p.id) continue;
        const score = k.care.priority(q) + (this.tasks.inDanger(crew, q) ? 200 : 0) - Math.hypot(q.x - p.x, q.z - p.z);
        if (score > bestScore) {
          bestScore = score;
          best = q;
        }
      }
      if (!best) return false;
      if (r.task === T_HOSE && p.upper === 'extinguish') p.upper = 'none';
      this.tasks.takeCasualty(r, best, safeX, safeZ);
    }
    const res = this.tasks.casualty(crew, r, false);
    if (res === R_BUSY) return true;
    const victim = ctx.people.get(r.targetId);
    if (res === R_NEEDS_EVAC && victim) {
      call.record.victimsTreated++;
      this.askSamu(crew, call, victim);
      r.stage = S_STAY;
      r.until = now + STAY_WITH_VICTIM;
      return true;
    }
    if (victim && k.care.state(victim.id)?.treatedBy === p.id) call.record.victimsTreated++;
    this.tasks.release(r);
    return crew.victims.length > 1;
  }

  private samuOnScene(victim: Person): boolean {
    const calls = this.k.calls;
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (c.kind === 'samu' && c.state === 'sur_place' && Math.hypot(c.x - victim.x, c.z - victim.z) < 40) return true;
    }
    return false;
  }

  /** Une urgence dégagée par les pompiers : le SAMU est demandé (une fois par intervention et par victime proche). */
  private askSamu(crew: Crew, call: CallRec, victim: Person): void {
    const k = this.k;
    const rescue = k.ctx.service<RescueApi>(EXT.rescue);
    if (!rescue) return;
    const chief = crew.members.length > 1 ? crew.members[1].p : crew.members[0].p;
    rescue.request('samu', victim.x, victim.z, chief.id, k.incidentOfPerson(victim.id) || undefined);
    if (!crew.askedSamu) {
      crew.askedSamu = true;
      this.radio.needSamu(call, crew, injuryRank(victim.injury) >= 3 ? 'critique' : 'sérieuse');
    }
  }
}
