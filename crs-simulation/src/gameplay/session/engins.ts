/* =====================================================================================
 * ENGINS — un véhicule en mission ne reste pas planté devant la foule ; les blindés sont toujours escortés.
 *
 * Demandes du commanditaire : « je donne un ordre de déplacement au Centaure et il me dit qu'il est bloqué par la
 * foule : il faut qu'il soit intelligent, qu'il contourne ou qu'il rentre dans le barrage » ; « déploie des unités
 * autour des véhicules blindés, Centaure ou canon à eau, pour toujours les protéger si les black blocs attaquent ».
 *
 *   dégagement   un véhicule de police qui roule sous pilote automatique (ordre, colonne) et que des personnes
 *                arrêtent : avertisseur et deux tons, la foule devant lui s'écarte (module de foule : stir) ; s'il
 *                reste arrêté, nouvel itinéraire ; un engin à lame (Centaure) pousse barricades et objets ;
 *   escorte      chaque Centaure et chaque canon à eau a un groupe à pied qui le protège (ordre « protéger » sur le
 *                véhicule : écran autour de lui, qui le suit) — pris parmi les groupes libres les plus proches,
 *                jamais retiré d'une manœuvre en cours ; un escorteur parti ailleurs est remplacé.
 * Simulation pure (aucun DOM).
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, Squad, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';

interface Autopilot {
  status(v: Vehicle): Readonly<{ mode: string; state: string; reason: string; blockedFor: number; remaining: number }>;
  driveTo(v: Vehicle, x: number, z: number, options?: { urgence?: boolean; speed?: number; stopBefore?: number; pushThrough?: boolean }): boolean;
}
interface CrowdCore {
  stir(x: number, z: number, radius: number, fear: number, anger: number): number;
}
interface VehiclesExt {
  setSiren?(v: Vehicle, mode: 0 | 1 | 2): void;
}

const ARMORED: ReadonlySet<string> = new Set(['centaure', 'canon_eau']);
/** Ordres d'un groupe qu'on peut prendre pour escorter (il n'est engagé dans rien). */
const FREE_ORDERS: ReadonlySet<string> = new Set(['libre', 'tenir', 'cesser', 'suivre']);
const ESCORT_RANGE = 400;
const THINK = 1;
const ESCORT_THINK = 8;
/** Arrêté par des personnes depuis : on dégage (s), on cherche un autre itinéraire (s). */
const CLEAR_AFTER = 2.5;
const REROUTE_AFTER = 12;

interface Blocked {
  since: number;
  rerouted: boolean;
  hornAt: number;
}

export class EnginsSystem implements GameSystem {
  readonly id = 'session.engins';
  readonly order = SystemOrder.CONTROL + 48;

  private ctx: GameContext | null = null;
  private nextThink = 0;
  private nextEscort = 0;
  private readonly blocked = new Map<EntityId, Blocked>();
  /** Véhicule blindé → groupe qui l'escorte. */
  private readonly escorts = new Map<EntityId, number>();
  private readonly target = new Map<EntityId, { x: number; z: number }>();

  init(ctx: GameContext): void {
    this.ctx = ctx;
  }

  reset(): void {
    this.nextThink = 0;
    this.nextEscort = 0;
    this.blocked.clear();
    this.escorts.clear();
    this.target.clear();
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.session.phase !== 'playing') return;
    const now = ctx.clock.now;
    if (now >= this.nextThink) {
      this.nextThink = now + THINK;
      this.clearWay(now);
    }
    if (now >= this.nextEscort) {
      this.nextEscort = now + ESCORT_THINK;
      this.keepEscorts();
    }
  }

  // ───────────────────────────── dégagement ─────────────────────────────

  private clearWay(now: number): void {
    const ctx = this.ctx!;
    const ap = ctx.service<Autopilot>('vehicles.autopilot');
    if (!ap) return;
    const crowd = ctx.service<CrowdCore>('crowd.core');
    const ext = ctx.service<VehiclesExt>('vehicles.ext');
    for (const v of ctx.vehicles.list) {
      if (v.faction !== 'police' || v.def.flying || v.seats[0] === 0) continue;
      const st = ap.status(v);
      if (st.mode !== 'drive' && st.mode !== 'follow') { this.blocked.delete(v.id); continue; }
      const byPeople = (st.state === 'attente' || st.state === 'bloque') && (st.reason === 'personne' || st.reason === '');
      const stopped = Math.abs(v.speed) < 0.4;
      if (!byPeople || !stopped || st.blockedFor < CLEAR_AFTER) {
        if (Math.abs(v.speed) > 1.5) this.blocked.delete(v.id);
        continue;
      }
      let b = this.blocked.get(v.id);
      if (!b) { b = { since: now, rerouted: false, hornAt: now }; this.blocked.set(v.id, b); }
      // avertisseur, deux tons : la foule devant l'engin s'écarte
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const ax = v.x + fx * (v.def.length * 0.5 + 4), az = v.z + fz * (v.def.length * 0.5 + 4);
      if (crowd) crowd.stir(ax, az, 6, 0.55, 0.04);
      if (v.def.hasSiren && v.siren === 0) {
        if (ext && ext.setSiren) ext.setSiren(v, 1);
        else v.siren = 1;
      }
      if (now >= b.hornAt) {
        b.hornAt = now + 3;
        ctx.events.emit('sfx', { id: 'klaxon', x: v.x, y: v.y + 1, z: v.z, volume: 1 });
      }
      // toujours arrêté : un autre itinéraire (le Centaure pousse barricades et objets à la lame)
      if (!b.rerouted && now - b.since > REROUTE_AFTER && st.mode === 'drive') {
        const t = this.destinationOf(v, ap);
        if (t) {
          ap.driveTo(v, t.x, t.z, { urgence: true, pushThrough: v.def.canPush === true });
          b.rerouted = true;
        }
      }
    }
  }

  /** Destination courante d'un véhicule : dernier point demandé (mémorisé au premier blocage), sinon inconnue. */
  private destinationOf(v: Vehicle, _ap: Autopilot): { x: number; z: number } | null {
    try {
      const rt = (this.ctx!.service('vehicles.autopilot') as { k?: { rt?(v: Vehicle): { ap?: { path?: Float64Array | number[]; n?: number } | null } } }).k?.rt?.(v);
      const st = rt && rt.ap;
      if (st && st.path && st.n && st.n >= 2) {
        const i = (st.n - 1) * 2;
        const p = { x: Number(st.path[i]), z: Number(st.path[i + 1]) };
        if (Number.isFinite(p.x) && Number.isFinite(p.z)) {
          this.target.set(v.id, p);
          return p;
        }
      }
    } catch {
      // état interne indisponible
    }
    return this.target.get(v.id) ?? null;
  }

  // ───────────────────────────── escorte des blindés ─────────────────────────────

  private keepEscorts(): void {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    const used = new Set<number>(this.escorts.values());
    for (const v of ctx.vehicles.list) {
      if (v.faction !== 'police' || !ARMORED.has(v.kind) || v.state === 'wrecked' || v.state === 'burnt') continue;
      // l'escorte en place tient-elle toujours ?
      const cur = this.escorts.get(v.id);
      if (cur !== undefined) {
        const s = ctx.squads.get(cur);
        if (s && s.members.length > 0 && s.order.type === 'proteger' && s.order.targetId === v.id) continue;
        this.escorts.delete(v.id);
        used.delete(cur);
      }
      // un groupe déjà placé sous l'équipage du joueur l'escorte (voir setup.attachEscort) : rien à faire
      if (this.playerEscort(v)) continue;
      const g = this.pickGroup(v, used, me ? me.id : 0);
      if (!g) continue;
      ctx.squads.issue(g.id, { type: 'proteger', targetId: v.id, x: v.x, z: v.z, heading: v.heading, width: 0, issuedBy: g.leaderId });
      this.escorts.set(v.id, g.id);
      used.add(g.id);
      ctx.radio.say({ channel: 'unite', from: g.name, priority: 0, text: `ICI ${g.name.toUpperCase()}. Je me place en protection de l’engin. TERMINÉ.` });
    }
  }

  private playerEscort(v: Vehicle): boolean {
    const ctx = this.ctx!;
    for (const s of ctx.squads.list) {
      if (s.vehicleId !== v.id) continue;
      for (const q of ctx.squads.list) if (q.parentId === s.id && q.kind === 'groupe' && q.members.length > 0) return true;
    }
    return false;
  }

  /** Groupe à pied libre le plus proche (ni celui du joueur, ni déjà escorteur, ni engagé dans une manœuvre). */
  private pickGroup(v: Vehicle, used: ReadonlySet<number>, playerId: EntityId): Squad | null {
    const ctx = this.ctx!;
    let best: Squad | null = null;
    let bd = ESCORT_RANGE;
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.kind !== 'groupe' || used.has(s.id) || s.members.length < 3) continue;
      if (s.leaderId === playerId || s.members.indexOf(playerId) >= 0) continue;
      if (!FREE_ORDERS.has(s.order.type)) continue;
      if (s.order.type === 'suivre' && s.order.targetId === playerId) continue;
      const lead = ctx.people.get(s.leaderId) ?? ctx.people.get(s.members[0]!);
      if (!lead || lead.vehicleId !== 0) continue;
      const d = Math.hypot(lead.x - v.x, lead.z - v.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
}
