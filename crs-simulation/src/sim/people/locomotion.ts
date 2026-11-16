/* =====================================================================================
 * Locomotion (ordre MOVEMENT) — déplacement de toutes les personnes, joueur et IA confondus.
 *
 * Pour chaque personne active, ni assise en véhicule ni tenue par quelqu'un :
 *   1. vitesse voulue = cmd.move × vitesse maximale de l'allure (loco-speed.ts) ;
 *   2. accélération et freinage bornés, rotation du corps bornée (vers le déplacement ou la visée) ;
 *   3. endurance ;
 *   4. séparation douce d'avec les voisins (grille fine reconstruite à chaque pas) : chacun
 *      s'écarte de sa part du chevauchement, inversement proportionnelle à sa résistance
 *      (bouclier levé, ligne tenue) ; on enjambe les personnes à terre ;
 *   5. collisions enchaînées world → props → vehicles, glissement le long des obstacles ;
 *   6. altitude = world.heightAt (+ arc du saut).
 * Puis les personnes tenues (portées, traînées, escortées) suivent leur porteur (loco-held.ts),
 * les occupants des véhicules sont recalés sur leur siège, et l'index spatial est reconstruit.
 *
 * Fréquence réduite : au-delà de 55 m du joueur une personne n'est mise à jour complètement
 * qu'un pas sur deux, au-delà de 110 m un pas sur quatre (étalé selon l'identifiant) ; entre-temps
 * elle prolonge simplement son mouvement. Une personne immobile et au calme ne vérifie sa
 * séparation qu'un pas sur quatre.
 * ===================================================================================== */

import type { GameContext, GameSystem, Person, RayHit, Vec2 } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { truncate } from '@/core/arrays';
import { TAU, turnToward, wrapAngle } from '@/core/math';
import { makeRayHit } from '@/core/null-services';
import { SpatialHash } from '@/core/spatial';
import { PEOPLE_LOCOMOTION_SERVICE } from './api';
import type { PeopleLocomotionApi } from './api';
import { CellMarks } from './cellmarks';
import { followHolder, syncSeat } from './loco-held';
import { tryJump } from './loco-jump';
import { refreshSlow, speedLimit, speedOut, updateStamina } from './loco-speed';
import type { PeopleShared, PersonExtra } from './shared';
import { HOLD_DRAG } from './shared';
import * as T from './tuning';

const LOD_MID2 = T.LOD_MID * T.LOD_MID;
const LOD_FAR2 = T.LOD_FAR * T.LOD_FAR;
const LOD_FAST2 = T.LOD_FAST_SPEED * T.LOD_FAST_SPEED;
const SEP_DEAD2 = T.SEP_DEAD * T.SEP_DEAD;
const SPEED_MAX2 = T.SPEED_HARD_MAX * T.SPEED_HARD_MAX;
const SLIDE_MIN_SPEED2 = T.SLIDE_MIN_CLOSING * T.SLIDE_MIN_CLOSING;
/** Réflexion lente : un pas sur 16 (sol, densité, résistance), un sur 64 pour la charge. */
const SLOW_MASK = 15;
const HEAVY_MASK = 63;

/** Exclues de la grille de séparation : endormies, en véhicule, tenues, à terre (on les enjambe). */
function notAnObstacle(p: Person): boolean {
  return p.dormant || p.vehicleId !== 0 || p.heldBy !== 0 || p.posture === 'down';
}

export class LocomotionSystem implements GameSystem {
  readonly id = 'people.locomotion';
  readonly order = SystemOrder.MOVEMENT;

  ctx!: GameContext;
  /** Grille fine des personnes debout, pour la séparation. */
  private readonly grid = new SpatialHash<Person>(T.SEP_CELL, 2048);
  /** Cellules proches d'un véhicule : évite d'interroger vehicles.resolveCircle pour tout le monde. */
  readonly marks = new CellMarks(8);
  private readonly nb: Person[] = [];
  private readonly held: Person[] = [];
  readonly pos: Vec2 = { x: 0, z: 0 };
  readonly hit: RayHit = makeRayHit();
  private tick = 0;
  /**
   * Valeurs de travail de la personne en cours, échangées entre les méthodes par champs plutôt que par
   * arguments (un flottant passé en argument à une fonction non intégrée est emballé dans un objet) :
   * direction voulue (mx, mz, norme² m2), vitesse, durée du pas, direction voulue unitaire (wx, wz).
   */
  private readonly k = { mx: 0.5, mz: 0.5, m2: 0.5, speed: 0.5, h: 0.5, wx: 0.5, wz: 0.5 };
  /** Mesures du dernier pas (diagnostic, tests). */
  readonly stats = { full: 0, coasting: 0, calm: 0, held: 0, seated: 0 };

  constructor(readonly shared: PeopleShared) {}

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.shared.bind(ctx);
    const shared = this.shared;
    const api: PeopleLocomotionApi = {
      isWinded: (p) => shared.peek(p.id)?.winded ?? false,
      isAirborne: (p) => (shared.peek(p.id)?.jumpT ?? 0) > 0,
      loadOf: (p) => shared.of(p).load,
      densityAt: (p) => shared.of(p).crowd,
      pressureOf: (p) => {
        const e = shared.peek(p.id);
        if (!e) return 0;
        const v = e.pressure / T.PRESSURE_REF;
        return v > 1 ? 1 : v;
      },
      speedLimit: (p, gait) => {
        const w = ctx.env.state.wetness;
        shared.wetness = w > 0 ? (w < 1 ? w : 1) : 0;
        speedLimit(shared, p, shared.of(p), gait);
        return speedOut.limit;
      },
    };
    ctx.provide(PEOPLE_LOCOMOTION_SERVICE, api);
  }

  reset(): void {
    this.shared.clear();
    this.grid.clear();
    truncate(this.nb, 0);
    truncate(this.held, 0);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const people = ctx.people;
    const list = people.list;
    const n = list.length;
    if (n === 0 || !(dt > 0)) return;
    this.tick = ctx.clock.tick;
    const w = ctx.env.state.wetness;
    this.shared.wetness = w > 0 ? (w < 1 ? w : 1) : 0;
    const st = this.stats;
    st.full = 0;
    st.coasting = 0;
    st.calm = 0;
    st.held = 0;
    st.seated = 0;

    this.marks.rebuild(ctx.vehicles.list);
    this.grid.rebuild(list, notAnObstacle);

    const held = this.held;
    let heldCount = 0;
    for (let i = 0; i < n; i++) {
      const p = list[i]!;
      if (p.dormant) continue;
      if (p.vehicleId !== 0) {
        syncSeat(ctx, p);
        st.seated++;
        continue;
      }
      if (p.heldBy !== 0) {
        if (heldCount < held.length) held[heldCount] = p;
        else held.push(p);
        heldCount++;
        continue;
      }
      this.stepPerson(p, dt);
    }
    // les personnes tenues suivent leur porteur, qui vient de bouger
    for (let i = 0; i < heldCount; i++) followHolder(this, held[i]!, dt);
    st.held = heldCount;
    truncate(held, 0);

    // index spatial à jour pour les systèmes suivants du même pas (objets, dangers, santé, règles)
    people.rebuildIndex();
  }

  // ───────────────────────────── une personne ─────────────────────────────

  private stepPerson(p: Person, dt: number): void {
    const shared = this.shared;
    const e = shared.of(p);
    const tick = this.tick;

    // ── fréquence réduite loin du centre d'intérêt ──
    let h = dt;
    if (shared.focusOn && !p.isPlayer) {
      const fx = p.x - shared.focusX;
      const fz = p.z - shared.focusZ;
      const d2 = fx * fx + fz * fz;
      if (d2 > LOD_MID2) {
        const k = d2 > LOD_FAR2 && p.vx * p.vx + p.vz * p.vz <= LOD_FAST2 ? 3 : 1;
        e.lodAcc += dt;
        if (((tick + p.id) & k) !== 0 && !e.fresh) {
          // pas intermédiaire : simple prolongement du mouvement
          if (p.vx !== 0 || p.vz !== 0) {
            p.x += p.vx * dt;
            p.z += p.vz * dt;
          }
          this.stats.coasting++;
          return;
        }
        h = e.lodAcc < T.LOD_MAX_DT ? e.lodAcc : T.LOD_MAX_DT;
        e.lodAcc = 0;
      } else if (e.lodAcc > 0) {
        h += e.lodAcc;
        if (h > T.LOD_MAX_DT) h = T.LOD_MAX_DT;
        e.lodAcc = 0;
      }
    }
    this.stats.full++;

    if (e.fresh || ((tick + p.id) & SLOW_MASK) === 0) {
      refreshSlow(this.ctx, shared, p, e, ((tick + p.id) & HEAVY_MASK) === 0);
    }
    if (e.jumpCd > 0) e.jumpCd -= h;

    const posture = p.posture;
    if (posture === 'down') {
      this.stepDown(p, e, dt, h);
      return;
    }

    // ── commande ──
    const cmd = p.cmd;
    let mx = cmd.moveX;
    let mz = cmd.moveZ;
    let m2 = mx * mx + mz * mz;
    if (!(m2 > 1e-6)) {
      mx = 0;
      mz = 0;
      m2 = 0;
    } else if (m2 > 1) {
      const inv = 1 / Math.sqrt(m2);
      mx *= inv;
      mz *= inv;
      m2 = 1;
    }

    // ── posture ──
    let canMove = true;
    if (posture !== 'stand' && posture !== 'crouch') {
      if (posture === 'seated') {
        p.posture = 'stand'; // n'est plus à bord d'un véhicule
      } else if (m2 > 0.01 && p.stun <= 0) {
        // assis, à genoux, à plat ventre : on se relève pour bouger
        e.getUp = posture === 'prone' ? T.GETUP_PRONE : T.GETUP_SIT;
        p.posture = cmd.crouch ? 'crouch' : 'stand';
      } else {
        canMove = false;
      }
    } else if (e.jumpT <= 0) {
      if (cmd.crouch) {
        if (posture === 'stand') p.posture = 'crouch';
      } else if (posture === 'crouch') {
        p.posture = 'stand';
      }
    }
    if (e.getUp > 0) {
      e.getUp -= h;
      canMove = false;
    }

    // ── saut, enjambement ──
    if (cmd.jump) {
      cmd.jump = false;
      if (canMove && e.jumpT <= 0 && e.jumpCd <= 0) tryJump(this, p, e, mx, mz);
    }
    const airborne = e.jumpT > 0;

    // ── vitesse voulue ──
    let vmax = 0;
    if (canMove) {
      speedLimit(shared, p, e, cmd.gait);
      vmax = speedOut.limit;
    } else {
      speedOut.gait = 0;
      speedOut.limit = 0;
      speedOut.hold = 0;
    }
    let tvx = 0;
    let tvz = 0;
    if (m2 > 0 && vmax > 0) {
      let lim = vmax;
      // au contact de quelqu'un qui barre le passage, on cesse de forcer (le joueur, lui, garde la moitié de son élan
      // pour se frayer un chemin à l'épaule)
      if (e.block > 0) lim *= 1 - T.BLOCK_K * e.block * (p.isPlayer ? 0.5 : 1);
      if (!cmd.faceMove && speedOut.hold !== HOLD_DRAG) {
        // corps tourné vers la visée : on recule et on se déplace de côté moins vite
        // (sauf en traînant un blessé : on tire à reculons, la vitesse est déjà celle du portage)
        const dot = (mx * Math.sin(p.heading) + mz * Math.cos(p.heading)) / Math.sqrt(m2);
        if (dot < 0.3) lim *= T.BACKWARD_FACTOR + (1 - T.BACKWARD_FACTOR) * (dot + 1) / 1.3;
      }
      tvx = mx * lim;
      tvz = mz * lim;
    }

    // ── accélération et freinage bornés (en l'air, la vitesse horizontale est conservée) ──
    let vx = p.vx;
    let vz = p.vz;
    if (!(vx === vx && vz === vz)) {
      vx = 0;
      vz = 0;
    }
    if (!airborne) {
      let dvx = tvx - vx;
      let dvz = tvz - vz;
      const dv2 = dvx * dvx + dvz * dvz;
      if (dv2 > 0) {
        const speeding = tvx * tvx + tvz * tvz > vx * vx + vz * vz;
        const maxDv = (speeding ? T.ACCEL_GROUND : T.DECEL_GROUND) * e.grip * h;
        if (dv2 > maxDv * maxDv) {
          const k = maxDv / Math.sqrt(dv2);
          dvx *= k;
          dvz *= k;
        }
        vx += dvx;
        vz += dvz;
      }
    }
    let sp2 = vx * vx + vz * vz;
    if (sp2 > SPEED_MAX2) {
      const k = T.SPEED_HARD_MAX / Math.sqrt(sp2);
      vx *= k;
      vz *= k;
      sp2 = SPEED_MAX2;
    }
    p.vx = vx;
    p.vz = vz;
    const speed = sp2 > 0 ? Math.sqrt(sp2) : 0;

    // ── orientation du corps et de la visée, endurance ──
    const k = this.k;
    k.mx = mx;
    k.mz = mz;
    k.m2 = m2;
    k.speed = speed;
    k.h = h;
    this.orient(p, e);
    speedOut.speed = speed;
    speedOut.h = h;
    updateStamina(shared, p, e);

    // ── saut en cours ──
    if (airborne) {
      e.jumpT -= h;
      if (e.jumpT <= 0) {
        e.jumpT = 0;
        e.vault = 0;
        e.jumpCd = T.JUMP_COOLDOWN;
      }
    }

    // ── déplacement, séparation, collisions ──
    const moving = sp2 > 0;
    if (!moving && !airborne && e.calm >= T.CALM_STEPS && ((tick + p.id) & 3) !== 0) {
      this.stats.calm++;
      return;
    }
    const nx = p.x + vx * dt;
    const nz = p.z + vz * dt;
    let pushed = false;
    if (!airborne) {
      // direction voulue (unitaire) : sert à savoir si quelqu'un barre le passage
      const mInv = m2 > 0 && vmax > 0 ? 1 / Math.sqrt(m2) : 0;
      k.wx = mx * mInv;
      k.wz = mz * mInv;
      const pos = this.pos;
      pos.x = nx;
      pos.z = nz;
      pushed = this.separate(p, e, dt);
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    if (moving || pushed) {
      this.collide(p, e);
      e.calm = 0;
      p.y = this.ctx.world.heightAt(p.x, p.z);
    } else if (e.calm < 255) {
      e.calm++;
    }
    if (airborne) {
      const ground = this.ctx.world.heightAt(p.x, p.z);
      const t = e.jumpDur > 0 ? 1 - e.jumpT / e.jumpDur : 1;
      p.y = ground + (e.jumpT > 0 ? 4 * e.jumpH * t * (1 - t) : 0);
    }
  }

  /** Personne à terre : elle glisse sur son élan (recul d'un coup) puis s'immobilise. */
  private stepDown(p: Person, e: PersonExtra, dt: number, h: number): void {
    e.jumpT = 0;
    e.vault = 0;
    if (p.stamina < 100) {
      speedOut.gait = 0;
      speedOut.limit = 0;
      speedOut.hold = 0;
      speedOut.speed = 0;
      speedOut.h = h;
      updateStamina(this.shared, p, e);
    }
    let vx = p.vx;
    let vz = p.vz;
    const sp2 = vx * vx + vz * vz;
    if (!(sp2 > 0)) {
      p.vx = 0;
      p.vz = 0;
      return;
    }
    const sp = Math.sqrt(sp2);
    let ns = sp - T.DOWN_FRICTION * h;
    if (ns > T.SPEED_HARD_MAX) ns = T.SPEED_HARD_MAX;
    if (ns <= 0) {
      p.vx = 0;
      p.vz = 0;
      return;
    }
    const k = ns / sp;
    vx *= k;
    vz *= k;
    p.vx = vx;
    p.vz = vz;
    this.pos.x = p.x + vx * dt;
    this.pos.z = p.z + vz * dt;
    this.collide(p, e);
    p.y = this.ctx.world.heightAt(p.x, p.z);
  }

  /** Rotation bornée du corps (vers le déplacement ou la visée) et de la visée. */
  private orient(p: Person, e: PersonExtra): void {
    const k = this.k;
    const mx = k.mx;
    const mz = k.mz;
    const h = k.h;
    const cmd = p.cmd;
    let target = p.heading;
    if (cmd.faceMove) {
      if (k.m2 > 0.01) {
        if (mx !== e.hmx || mz !== e.hmz) {
          e.hmx = mx;
          e.hmz = mz;
          e.hTarget = Math.atan2(mx, mz);
        }
        target = e.hTarget;
      }
    } else if (cmd.aimYaw === cmd.aimYaw) {
      target = cmd.aimYaw;
    }
    if (target !== p.heading) {
      const run = p.speedRun > 0.1 ? k.speed / p.speedRun : 0;
      let rate = T.TURN_RATE_SLOW + (T.TURN_RATE_FAST - T.TURN_RATE_SLOW) * (run < 1 ? run : 1);
      if (p.stun > 0) rate *= 0.5;
      p.heading = turnToward(p.heading, target, rate * h);
    }
    // visée : immédiate pour le joueur, à vitesse bornée pour les IA
    const ay = cmd.aimYaw;
    if (ay === ay && ay !== p.aimYaw) {
      if (p.isPlayer) {
        p.aimYaw = wrapAngle(ay);
      } else {
        let a = turnToward(p.aimYaw, ay, T.AIM_RATE * h);
        if (cmd.faceMove) {
          // le buste ne se tord pas au-delà d'un certain angle par rapport au corps
          const d = wrapAngle(a - p.heading);
          if (d > T.AIM_TWIST_MAX) a = wrapAngle(p.heading + T.AIM_TWIST_MAX);
          else if (d < -T.AIM_TWIST_MAX) a = wrapAngle(p.heading - T.AIM_TWIST_MAX);
        }
        p.aimYaw = a;
      }
    }
    let ap = cmd.aimPitch;
    if (ap === ap && ap !== p.aimPitch) {
      if (ap > T.AIM_PITCH_MAX) ap = T.AIM_PITCH_MAX;
      else if (ap < -T.AIM_PITCH_MAX) ap = -T.AIM_PITCH_MAX;
      if (p.isPlayer) {
        p.aimPitch = ap;
      } else {
        const d = ap - p.aimPitch;
        const step = T.AIM_RATE * h;
        p.aimPitch = d > step ? p.aimPitch + step : d < -step ? p.aimPitch - step : ap;
      }
    }
  }

  /**
   * Séparation douce : la personne s'écarte de sa part de chaque chevauchement (inversement
   * proportionnelle à sa résistance) ; une légère répulsion au-delà du contact aère la foule.
   * Lit la position voulue dans this.pos et la direction voulue dans this.k ; écrit la position corrigée
   * dans this.pos ; retourne true si la personne a été déplacée.
   */
  private separate(p: Person, e: PersonExtra, dt: number): boolean {
    const pos = this.pos;
    const nx = pos.x;
    const nz = pos.z;
    const wx = this.k.wx;
    const wz = this.k.wz;
    const nb = this.nb;
    const r = p.radius;
    const cnt = this.grid.query(nx, nz, r + T.SEP_REACH, nb);
    let px = 0;
    let pz = 0;
    let hard = 0;
    let ahead = 0;
    if (cnt > 1 || (cnt === 1 && nb[0] !== p)) {
      const resist = this.shared.resist;
      const rlen = resist.length;
      const wp = p.id < rlen ? resist[p.id]! : 1;
      // vecteur « à ma droite » selon mon mouvement, pour contourner ce qui me barre le passage
      const vx = p.vx;
      const vz = p.vz;
      const sp2 = vx * vx + vz * vz;
      const hasV = sp2 > SLIDE_MIN_SPEED2;
      let rx = 0;
      let rz = 0;
      if (hasV) {
        const inv = 1 / Math.sqrt(sp2);
        rx = -vz * inv;
        rz = vx * inv;
      }
      for (let j = 0; j < cnt; j++) {
        const o = nb[j]!;
        if (o === p) continue;
        const dx = nx - o.x;
        const dz = nz - o.z;
        const d2 = dx * dx + dz * dz;
        const minD = r + o.radius;
        const lim = minD + T.SEP_COMFORT;
        if (d2 >= lim * lim) continue;
        const wo = o.id < rlen ? resist[o.id]! : 1;
        const share = wo / (wp + wo);
        let ux: number;
        let uz: number;
        let d: number;
        if (d2 > 1e-8) {
          d = Math.sqrt(d2);
          ux = dx / d;
          uz = dz / d;
        } else {
          // centres confondus : direction arbitraire mais déterministe, propre à chaque personne
          const a = ((p.id * 0.6180339887) % 1) * TAU;
          ux = Math.cos(a);
          uz = Math.sin(a);
          d = 0;
        }
        let push = (lim - d) * T.SEP_COMFORT_K * share;
        if (d < minD) {
          const overlap = (minD - d) * share;
          push += overlap * T.SEP_STIFFNESS;
          hard += overlap;
          // contact avec quelqu'un qui se trouve dans la direction où je veux aller
          const into = -(ux * wx + uz * wz);
          if (into > 0) ahead += overlap * into;
        }
        px += ux * push;
        pz += uz * push;
        if (hasV) {
          // je me rapproche de quelqu'un qui me barre le passage : je le contourne par le côté le plus court
          // (pile en face : par la droite, comme lui — deux personnes face à face se croisent)
          const closing = -((vx - o.vx) * ux + (vz - o.vz) * uz);
          if (closing > T.SLIDE_MIN_CLOSING) {
            const side = -(ux * rx + uz * rz);
            const k = (lim - d) * share * T.SLIDE_K * (closing < T.SLIDE_FULL_CLOSING ? closing / T.SLIDE_FULL_CLOSING : 1);
            if (side > 0.02) {
              px -= rx * k;
              pz -= rz * k;
            } else {
              px += rx * k;
              pz += rz * k;
            }
          }
        }
      }
      // comprimée entre des poussées qui s'annulent : un léger décalage, propre à chacun, permet à la foule
      // de se réorganiser au lieu de rester figée dans un alignement parfait
      if (hard > 0.01) {
        const net2 = px * px + pz * pz;
        if (net2 < hard * hard * 0.09) {
          const a = ((p.id * 0.6180339887 + this.tick * 0.7548776662) % 1) * TAU;
          px += Math.cos(a) * hard * T.SQUEEZE_JITTER;
          pz += Math.sin(a) * hard * T.SQUEEZE_JITTER;
        }
      }
    }
    const c2 = px * px + pz * pz;
    let moved = 0;
    let done = false;
    if (c2 > SEP_DEAD2) {
      const cl = Math.sqrt(c2);
      const maxPush = T.SEP_MAX_SPEED * dt;
      const k = cl > maxPush ? maxPush / cl : 1;
      pos.x = nx + px * k;
      pos.z = nz + pz * k;
      moved = cl * k;
      // la vitesse dirigée contre la poussée est absorbée : on ne force pas le passage à pleine vitesse
      const ux = px / cl;
      const uz = pz / cl;
      const vn = p.vx * ux + p.vz * uz;
      if (vn < 0) {
        p.vx -= vn * ux * T.SEP_ABSORB;
        p.vz -= vn * uz * T.SEP_ABSORB;
      }
      done = true;
    }
    // passage barré : au contact, on cesse de forcer (la poussée ne s'accumule pas de rang en rang)
    if (ahead > 0) {
      const b = ahead / T.BLOCK_REF;
      if (b > e.block) e.block = b < 1 ? b : 1;
    } else if (e.block > 0) {
      e.block -= T.BLOCK_DECAY * dt;
      if (e.block < 0) e.block = 0;
    }
    // compression : poussées opposées qui s'annulent (m/s d'écrasement), lissée
    const squeeze = hard > moved ? (hard - moved) / dt : 0;
    e.pressure += (squeeze - e.pressure) * T.PRESSURE_SMOOTH;
    return done;
  }

  /**
   * Collisions enchaînées world → props → vehicles depuis la position voulue, lue dans this.pos ;
   * écrit la position finale dans la personne et fait glisser sa vitesse le long de l'obstacle.
   */
  collide(p: Person, e: PersonExtra): void {
    const ctx = this.ctx;
    const pos = this.pos;
    const r = p.radius;
    const nx = pos.x;
    const nz = pos.z;
    let hit = false;
    if (e.vault !== 2 && ctx.world.resolveCircle(pos, r)) hit = true;
    if (e.vault !== 1 && ctx.props.resolveCircle(pos, r)) hit = true;
    if (this.marks.has(pos.x, pos.z) && ctx.vehicles.resolveCircle(pos, r)) hit = true;
    if (hit) {
      const cx = pos.x - nx;
      const cz = pos.z - nz;
      const cl2 = cx * cx + cz * cz;
      if (cl2 > 1e-12) {
        const cl = Math.sqrt(cl2);
        const ux = cx / cl;
        const uz = cz / cl;
        const vn = p.vx * ux + p.vz * uz;
        if (vn < 0) {
          p.vx -= vn * ux;
          p.vz -= vn * uz;
        }
      }
    }
    // une collision défaillante ne doit jamais empoisonner la position
    if (pos.x === pos.x && pos.z === pos.z) {
      p.x = pos.x;
      p.z = pos.z;
    }
  }
}
