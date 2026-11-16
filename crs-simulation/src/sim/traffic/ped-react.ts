/* =====================================================================================
 * CIRCULATION — réactions des piétons civils au contexte (une fois par seconde environ, étalées) :
 *   - gaz lacrymogène, détonations, incendies : fuite en courant par la rue qui éloigne du danger, de
 *     préférence une rue adjacente ; refuge dans une bouche de métro ouverte s'il y en a une à portée ;
 *   - cortège : ils se serrent contre les façades, s'arrêtent pour regarder, certains filment ; si la
 *     tension monte ou si la foule est dense, ils s'en vont ; s'il y a des violences, ils fuient ;
 *   - vie ordinaire : arrêt devant une vitrine, photo pour un touriste, pause en terrasse.
 * Dossier 03 §2 : « badaud : regarde depuis le trottoir, filme au téléphone, tarde à partir, se fait
 * surprendre par le gaz » ; « touriste : photographie le cortège » ; gaz : « départ par les rues latérales ».
 * ===================================================================================== */

import type { EntityId, Person, Prop, Shop, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { MetroApi } from '@/core/extensions';
import type { EdgeHit } from './graph';
import { makeEdgeHit } from './graph';
import type { PedBrain } from './ped-brain';
import {
  S_CORNER, S_CROSS, S_FLEE, S_IDLE, S_LEAVE, S_SHOP, S_SIT, S_WAIT, S_WALK, S_WATCH,
} from './ped-brain';
import type { Peds } from './peds';
import type { TrafficKernel } from './shared';
import { PED_THINK } from './tuning';

export class PedReactor {
  /** Chaises de terrasse occupées. */
  private readonly chairs = new Set<EntityId>();
  private readonly people: Person[] = [];
  private readonly vehicles: Vehicle[] = [];
  private readonly shops: Shop[] = [];
  private readonly props: Prop[] = [];
  private readonly hit: EdgeHit = makeEdgeHit();
  readonly protest = (p: Person): boolean => p.faction === 'protest' && p.vehicleId === 0;
  private readonly chair = (p: Prop): boolean => p.kind === 'chaise' && !p.toppled && p.state === 'intact' && p.carriedBy === 0;

  constructor(private readonly k: TrafficKernel, private readonly peds: Peds) {}

  reset(): void {
    this.chairs.clear();
  }

  // ───────────────────────────── perception ─────────────────────────────

  /** Regarde autour de soi : danger, gaz, foule ; envies d'arrêt ; déblocage. */
  sense(b: PedBrain): void {
    const k = this.k;
    const ctx = k.ctx;
    const p = b.p;
    const now = ctx.clock.now;
    if (b.fear > 0) b.fear = b.fear > 0.035 ? b.fear - 0.035 : 0;

    // ── gaz lacrymogène : on fuit du côté où l'air est le plus respirable ──
    const gas = ctx.hazards.gasAt(p.x, p.z);
    if (gas > 0.03 || (p.gas > 0.1 && gas > 0.004)) {
      const c = k.cache;
      const hit = this.hit;
      let dx = Math.sin(p.heading);
      let dz = Math.cos(p.heading);
      if (b.edge >= 0 && b.edge < c.edgeCount) {
        c.project(b.edge, p.x, p.z, hit);
        dx = hit.dx;
        dz = hit.dz;
      }
      const gPlus = ctx.hazards.gasAt(p.x + dx * 8, p.z + dz * 8);
      const gMinus = ctx.hazards.gasAt(p.x - dx * 8, p.z - dz * 8);
      const s = gPlus >= gMinus ? 1 : -1;
      p.upper = 'cover_face';
      this.startFlee(b, p.x + dx * s * 14, p.z + dz * s * 14, 0.9);
      return;
    }
    if (p.upper === 'cover_face' && b.state !== S_FLEE) p.upper = 'none';

    // ── détonation, incendie, personne à terre ──
    const danger = k.dangers.at(p.x, p.z);
    if (danger > 0.15) {
      this.startFlee(b, k.dangers.lastX, k.dangers.lastZ, Math.min(1, danger + 0.45));
      return;
    }
    if (p.burning > 0) {
      this.startFlee(b, p.x - Math.sin(p.heading) * 5, p.z - Math.cos(p.heading) * 5, 1);
      return;
    }

    // ── cortège à proximité ──
    const s = b.state;
    if (k.protestNear > 0 && s !== S_FLEE && s !== S_CROSS && s !== S_CORNER) {
      const list = this.people;
      const n = ctx.people.queryRadius(p.x, p.z, 24, list, this.protest);
      if (n >= 4) {
        let cx = 0;
        let cz = 0;
        let anger = 0;
        for (let i = 0; i < n; i++) {
          const q = list[i]!;
          cx += q.x;
          cz += q.z;
          anger += q.anger;
        }
        cx /= n;
        cz /= n;
        anger /= n;
        list.length = 0;
        const tension = ctx.director.tensionAt(cx, cz);
        b.jitter = b.jitter < 0.85 ? 0.85 : b.jitter; // on se serre contre les façades
        if (tension > 0.6 || anger > 0.6) {
          this.startFlee(b, cx, cz, 0.7);
          return;
        }
        const dx = cx - p.x;
        const dz = cz - p.z;
        const close = dx * dx + dz * dz < 81;
        if (tension > 0.3 || n >= 30 || close) {
          if (s !== S_LEAVE) this.leave(b, cx, cz);
          return;
        }
        if (s === S_WALK && now >= b.calmUntil) {
          this.watch(b, cx, cz);
          return;
        }
      } else {
        list.length = 0;
      }
    }

    // ── coincé contre un obstacle ──
    if (s === S_WALK || s === S_CORNER || s === S_CROSS || s === S_FLEE || s === S_LEAVE) {
      const mx = p.x - b.lastX;
      const mz = p.z - b.lastZ;
      b.lastX = p.x;
      b.lastZ = p.z;
      if (mx * mx + mz * mz < 0.03) b.stuckN++;
      else b.stuckN = 0;
      if (b.stuckN >= 3) {
        b.stuckN = 0;
        b.stuckTotal++;
        b.dir = -b.dir;
        b.side = -b.side;
        b.nextEdge = -1;
        b.state = s === S_FLEE || s === S_LEAVE ? s : S_WALK;
        if (b.stuckTotal >= 4 && b.ambient && !k.visible(p.x, p.z)) {
          this.peds.despawn(b);
          return;
        }
      }
    }

    // ── vie ordinaire ──
    if (s === S_WALK && b.walked > 16 && b.fear < 0.1) {
      b.walked = 0;
      this.idle(b);
    }
  }

  /** Envie de s'arrêter : vitrine, terrasse, photo, téléphone. */
  private idle(b: PedBrain): void {
    const k = this.k;
    const ctx = k.ctx;
    const rng = k.rng;
    const p = b.p;
    const r = rng.next();
    if (r < 0.3) {
      const shops = this.shops;
      const n = ctx.props.shopsNear(p.x, p.z, 6.5, shops);
      if (n > 0) {
        const shop = shops[0]!;
        shops.length = 0;
        if (shop.shutter < 0.5 && shop.burning === 0) {
          b.state = S_IDLE;
          b.timer = 4 + rng.next() * 10;
          b.faceX = shop.x;
          b.faceZ = shop.z;
          return;
        }
      }
      shops.length = 0;
    }
    if (r > 0.3 && r < 0.42 && ctx.env.state.rain < 0.3) {
      const props = this.props;
      const n = ctx.props.queryRadius(p.x, p.z, 5.5, props, this.chair);
      for (let i = 0; i < n; i++) {
        const chair = props[i]!;
        if (this.chairs.has(chair.id)) continue;
        this.chairs.add(chair.id);
        b.chairId = chair.id;
        b.seated = false;
        b.state = S_SIT;
        b.tx = chair.x;
        b.tz = chair.z;
        b.timer = 12;
        b.faceX = chair.x + Math.sin(chair.heading) * 4;
        b.faceZ = chair.z + Math.cos(chair.heading) * 4;
        props.length = 0;
        return;
      }
      props.length = 0;
    }
    if (p.kind === 'touriste' && r > 0.42 && r < 0.7) {
      // photo : dans l'axe de la rue, vers le haut des façades
      b.state = S_IDLE;
      b.timer = 3 + rng.next() * 4;
      b.faceX = p.x + Math.sin(p.heading + (rng.next() - 0.5) * 2) * 20;
      b.faceZ = p.z + Math.cos(p.heading + (rng.next() - 0.5) * 2) * 20;
      p.upper = 'photo';
      p.upperT = 0;
      return;
    }
    if (r > 0.95) {
      b.state = S_IDLE;
      b.timer = 3 + rng.next() * 6;
      b.faceX = p.x + Math.sin(p.heading) * 5;
      b.faceZ = p.z + Math.cos(p.heading) * 5;
    }
  }

  /** Fin d'un arrêt : il reprend sa marche (ou s'éloigne, s'il regardait le cortège). */
  resume(b: PedBrain): void {
    const p = b.p;
    const watching = b.state === S_WATCH;
    if (p.upper === 'film' || p.upper === 'photo') p.upper = 'none';
    if (watching && this.k.rng.chance(0.5)) {
      this.leave(b, b.faceX, b.faceZ);
      return;
    }
    b.state = S_WALK;
  }

  private watch(b: PedBrain, cx: number, cz: number): void {
    const k = this.k;
    const p = b.p;
    const rng = k.rng;
    b.state = S_WATCH;
    b.timer = 8 + rng.next() * 24;
    b.calmUntil = k.ctx.clock.now + b.timer + 45;
    b.faceX = cx;
    b.faceZ = cz;
    // un sur trois sort son téléphone
    if (rng.chance(p.kind === 'touriste' ? 0.55 : 0.33)) {
      p.upper = 'film';
      p.upperT = 0;
    }
  }

  /** La rue est à la manifestation : ce passant s'en va (il disparaîtra une fois loin, ou hors de vue). */
  dismiss(b: PedBrain): void {
    this.leave(b, this.k.focusX, this.k.focusZ);
    b.fleeLeft = 200;
  }

  /** S'éloigne de la manifestation en marchant. */
  private leave(b: PedBrain, cx: number, cz: number): void {
    const p = b.p;
    this.leaveChair(b);
    if (p.upper === 'film' || p.upper === 'photo') p.upper = 'none';
    b.dangerX = cx;
    b.dangerZ = cz;
    b.hasRefuge = false;
    b.fleeLeft = 60 + this.k.rng.next() * 60;
    b.state = S_LEAVE;
    this.orient(b);
  }

  // ───────────────────────────── fuite ─────────────────────────────

  /** Déclenche (ou entretient) la fuite devant un danger situé en (x, z). */
  startFlee(b: PedBrain, x: number, z: number, fear: number): void {
    const k = this.k;
    const p = b.p;
    b.dangerX = x;
    b.dangerZ = z;
    if (fear > b.fear) b.fear = fear;
    if (p.fear < b.fear) p.fear = b.fear;
    if (b.state === S_FLEE) {
      if (b.fleeLeft < 40) b.fleeLeft = 40;
      return;
    }
    this.leaveChair(b);
    if (p.upper === 'film' || p.upper === 'photo') p.upper = 'none';
    b.fleeLeft = 80 + k.rng.next() * 70;
    // refuge : une bouche de métro ouverte à portée, si elle n'est pas du côté du danger
    b.hasRefuge = false;
    const metro = k.ctx.service<MetroApi>(EXT.metro);
    if (metro) {
      const st = metro.nearest(p.x, p.z, 150);
      if (st && st.open) {
        let rx = st.x;
        let rz = st.z;
        let best = (rx - p.x) * (rx - p.x) + (rz - p.z) * (rz - p.z);
        const en = st.entrances;
        for (let i = 0; i + 1 < en.length; i += 2) {
          const d = (en[i]! - p.x) * (en[i]! - p.x) + (en[i + 1]! - p.z) * (en[i + 1]! - p.z);
          if (d < best) {
            best = d;
            rx = en[i]!;
            rz = en[i + 1]!;
          }
        }
        // l'abri ne doit pas ramener vers le danger
        if ((rx - p.x) * (x - p.x) + (rz - p.z) * (z - p.z) <= 0.3 * Math.sqrt(best) * Math.hypot(x - p.x, z - p.z)) {
          b.hasRefuge = true;
          b.refugeX = rx;
          b.refugeZ = rz;
        }
      }
    }
    // en pleine traversée ou à l'angle d'une rue : il termine en courant, puis fuit
    if (b.state === S_CROSS || b.state === S_CORNER) return;
    b.state = S_FLEE;
    this.orient(b);
  }

  /** Choisit, sur la rue courante, le sens qui éloigne du danger (ou rapproche de l'abri). */
  private orient(b: PedBrain): void {
    const c = this.k.cache;
    const p = b.p;
    if (b.edge < 0 || b.edge >= c.edgeCount) return;
    const hit = this.hit;
    c.project(b.edge, p.x, p.z, hit);
    let ax = p.x - b.dangerX;
    let az = p.z - b.dangerZ;
    const l = Math.sqrt(ax * ax + az * az);
    if (l > 0.01) {
      ax /= l;
      az /= l;
    }
    if (b.hasRefuge) {
      const rx = b.refugeX - p.x;
      const rz = b.refugeZ - p.z;
      const rl = Math.sqrt(rx * rx + rz * rz);
      if (rl > 1) {
        ax = ax * 0.5 + (rx / rl) * 0.9;
        az = az * 0.5 + (rz / rl) * 0.9;
      }
    }
    const along = (hit.dx * ax + hit.dz * az) * b.dir;
    if (along < -0.05) {
      b.dir = -b.dir;
      b.side = -b.side;
    }
  }

  /** Un pas de fuite. */
  flee(b: PedBrain): void {
    const k = this.k;
    const p = b.p;
    const sprint = b.fear > 0.55;
    this.peds.walk(b, sprint ? 2 : 1, 1, 1);
    b.fleeLeft -= PED_THINK * (sprint ? 5 : 3.2);
    if (b.hasRefuge) {
      const dx = b.refugeX - p.x;
      const dz = b.refugeZ - p.z;
      if (dx * dx + dz * dz < 30) {
        // il descend dans le métro
        k.ctx.events.emit('person:fled', { id: p.id });
        this.peds.despawn(b);
        return;
      }
    }
    if (b.fleeLeft <= 0 && b.fear < 0.3) {
      if (p.upper === 'cover_face') p.upper = 'none';
      b.hasRefuge = false;
      // à bonne distance : il reprend son souffle, puis s'en va (un passant d'ambiance disparaît hors champ)
      b.state = b.ambient ? S_LEAVE : S_WALK;
      b.calmUntil = k.ctx.clock.now + 60;
    }
  }

  // ───────────────────────────── traversée ─────────────────────────────

  /** Le piéton qui attend au bord du trottoir peut-il traverser ? (feu, puis créneau entre les voitures) */
  mayCross(b: PedBrain): boolean {
    const k = this.k;
    const ctx = k.ctx;
    const p = b.p;
    if (b.waited > 25) return true; // il s'impose : les voitures s'arrêtent pour un piéton engagé
    const dx = b.tx - p.x;
    const dz = b.tz - p.z;
    const width = Math.sqrt(dx * dx + dz * dz);
    let signal = false;
    // un véhicule engagé dans le carrefour va passer par cette embouchure (il tourne, ou il arrive) : on attend
    if (b.crossNode >= 0 && (k.boxes.uses(b.crossNode, b.crossDx, b.crossDz, ctx.clock.now)
      || k.boxes.uses(b.crossNode, -b.crossDx, -b.crossDz, ctx.clock.now))) return false;
    if (b.crossNode >= 0 && k.tuning.signals) {
      const ctrl = k.signals.crossingCtrl(b.crossNode);
      if (ctrl) {
        signal = true;
        // les véhicules de la rue traversée doivent avoir le rouge pour la durée de la traversée
        if (k.signals.redLeft(ctrl, b.crossDx, b.crossDz, ctx.clock.now) < (width / 1.3) * 0.75) return false;
      }
    }
    // créneau : aucun véhicule en mouvement qui arrive sur le passage dans les secondes qui viennent
    const mx = p.x + dx * 0.5;
    const mz = p.z + dz * 0.5;
    const list = this.vehicles;
    const n = ctx.vehicles.queryRadius(mx, mz, 20, list);
    const horizon = signal ? 2 : b.waited > 9 ? 2.2 : 4.5;
    for (let i = 0; i < n; i++) {
      const v = list[i]!;
      const sp = Math.abs(v.speed);
      if (sp < 1.2 || v.def.flying) continue;
      const rx = mx - v.x;
      const rz = mz - v.z;
      const d = Math.sqrt(rx * rx + rz * rz);
      const closing = (v.vx * rx + v.vz * rz) / (d > 0.1 ? d : 0.1);
      if (closing > sp * 0.6 && d / sp < horizon) {
        list.length = 0;
        return false;
      }
    }
    list.length = 0;
    return true;
  }

  // ───────────────────────────── terrasse ─────────────────────────────

  /** Va jusqu'à la chaise, s'assoit, reste un moment. */
  sit(b: PedBrain): void {
    const k = this.k;
    const p = b.p;
    if (!b.seated) {
      const d = this.peds.moveTo(b, b.tx, b.tz, 0.7, 0);
      b.timer -= PED_THINK;
      if (d < 0.95) {
        b.seated = true;
        p.posture = 'sit';
        b.timer = 40 + k.rng.next() * 110;
        this.peds.stand(b, b.faceX, b.faceZ);
      } else if (b.timer <= 0) {
        this.leaveChair(b);
        b.state = S_WALK;
      }
      return;
    }
    this.peds.stand(b, b.faceX, b.faceZ);
    b.timer -= PED_THINK;
    const chair = k.ctx.props.get(b.chairId);
    if (b.timer <= 0 || !chair || chair.toppled || chair.carriedBy !== 0 || k.ctx.env.state.rain > 0.5) {
      this.leaveChair(b);
      b.state = S_WALK;
    }
  }

  leaveChair(b: PedBrain): void {
    if (b.chairId === 0) return;
    this.chairs.delete(b.chairId);
    b.chairId = 0;
    b.seated = false;
    if (b.p.posture === 'sit') b.p.posture = 'stand';
  }
}

/** États où le piéton est à l'arrêt de son plein gré (lus par les tests et le débogage). */
export const RESTING_STATES: readonly number[] = [S_IDLE, S_WATCH, S_SIT, S_SHOP, S_WAIT];
