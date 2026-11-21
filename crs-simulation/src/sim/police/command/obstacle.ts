/* =====================================================================================
 * COMMANDEMENT — véhicule qui barre la voie du joueur : faire venir le Centaure (service 'police.obstacle').
 *
 * Demande du commanditaire : « il y avait un bus qui me bloquait […] j'appelle le Centaure pour le dégager quand il y
 * a un obstacle, appeler le Centaure pour faire partir le bus, en le poussant ».
 *
 *   demande          request(x, z) : le Centaure désigné, sinon le plus proche qui est libre, reçoit l'ordre
 *                    « Dégager l'obstacle » (degager_obstacle, centaure.ts) sur le véhicule au point ;
 *   blocage          une fois par seconde : le véhicule du joueur (conducteur ou passager), ou la tête de sa colonne,
 *                    est arrêté par un véhicule à l'arrêt qui barre son couloir à moins de 25 m (circulation,
 *                    véhicule garé, abandonné, épave) ;
 *   indication       arrêté depuis 4 s : « Véhicule bloquant : deux-tons (R) pour le faire dégager, ou P pour appeler
 *                    le Centaure » (selon ce qui est possible ; P n'est annoncé qu'une fois la proposition faite) ;
 *   proposition      arrêté depuis 10 s, joueur commandant : l'adjoint propose de faire venir le Centaure (touche P) ;
 *                    sans Centaure, de le faire circuler par l'unité à pied la plus proche ;
 *   radio            exécutant (CRS, opérateur BRAV-M…) : « Demande Centaure pour dégager un obstacle » (menu Radio),
 *                    accordée par le commandant IA si un Centaure est libre, refusée sinon, par radio.
 * ===================================================================================== */

import type { EntityId, Squad, Vehicle } from '@/core/contracts';
import type { Adjoint } from './adjoint';
import type { CentaureUnit } from './centaure';
import type { Command } from './command';
import type { CommandCore } from './core';
import type { SpecialUnit } from './special';
import { spell } from './texts';

export const OBSTACLE_SERVICE = 'police.obstacle';

/** Réponse à une demande de Centaure. */
export interface ObstacleAnswer {
  ok: boolean;
  /** Unité du Centaure engagé (0 si aucun). */
  squadId: number;
  /** Indicatif du Centaure engagé ('' si aucun). */
  name: string;
  /** Motif du refus ('' si accordé). */
  reason: string;
}

/** Véhicule du joueur (ou sa colonne) arrêté par un véhicule qui barre la voie. */
export interface PlayerBlock {
  /** Véhicule arrêté (celui du joueur, ou la tête de sa colonne) et véhicule qui le bloque. */
  vehicleId: EntityId;
  blockerId: EntityId;
  /** Depuis quand (s). */
  since: number;
  /** Position de l'obstacle et nom de la rue. */
  x: number;
  z: number;
  street: string;
  /** L'obstacle a un conducteur (il peut dégager de lui-même : deux-tons, « Faire circuler »). */
  driven: boolean;
}

export interface ObstacleApi {
  /**
   * Fait venir un Centaure pour pousser hors de la voie le véhicule au point (x, z) (ou `targetId`). `squadId` : le
   * Centaure voulu ; sinon le plus proche qui est libre (et accepté par `allow`, s'il est donné).
   */
  request(x: number, z: number, options?: { byId?: EntityId; squadId?: number; targetId?: EntityId; allow?: (squadId: number) => boolean }): ObstacleAnswer;
  /** Blocage en cours du véhicule du joueur (ou de sa colonne), ou null. */
  blocked(): Readonly<PlayerBlock> | null;
  /**
   * Demande radio d'un exécutant (« Demande Centaure pour dégager un obstacle ») : pour l'obstacle qui bloque son
   * véhicule, sinon le véhicule à l'arrêt le plus proche de lui ; accordée si un Centaure est libre, refusée sinon.
   */
  radioRequest(from: string): ObstacleAnswer;
}

/** Vue minimale du service 'traffic' (src/sim/traffic). */
interface TrafficLike {
  blockerAhead(v: Vehicle, range?: number): Vehicle | null;
  motorist(v: Vehicle): unknown;
  clearOff(v: Vehicle, byId: EntityId): string;
}

/** Arrêté depuis … : indication à l'écran (s) ; proposition de l'adjoint (s). */
const HINT_AFTER = 4;
const PROPOSE_AFTER = 10;
/** Délai avant de redire l'indication, de reproposer pour le même obstacle (s). */
const HINT_AGAIN = 25;
const PROPOSE_AGAIN = 60;
/** Portée du couloir regardé devant le véhicule (m). */
const BLOCK_RANGE = 25;
/** Unité à pied la plus loin qu'on envoie « faire circuler » (m). */
const FOOT_RANGE = 400;

export class ObstacleDesk {
  readonly api: ObstacleApi;
  private block: PlayerBlock | null = null;
  private readonly cur: PlayerBlock = { vehicleId: 0, blockerId: 0, since: 0, x: 0, z: 0, street: '', driven: false };
  private hintAt = 0;
  private offeredFor = 0;
  private offeredAt = -1e9;
  private readonly near: Vehicle[] = [];

  constructor(
    private readonly core: CommandCore,
    private readonly specials: () => readonly SpecialUnit[],
    private readonly isCentaure: (sp: SpecialUnit) => sp is CentaureUnit,
    private readonly adjoint: Adjoint,
    private readonly playerCommand: () => Command | null,
  ) {
    this.api = {
      request: (x, z, options) => this.request(x, z, options),
      blocked: () => this.block,
      radioRequest: (from) => this.radioRequest(from),
    };
  }

  reset(): void {
    this.block = null;
    this.hintAt = 0;
    this.offeredFor = 0;
    this.offeredAt = -1e9;
  }

  private traffic(): TrafficLike | undefined {
    const t = this.core.ctx.service<TrafficLike>('traffic');
    return t && typeof t.blockerAhead === 'function' ? t : undefined;
  }

  // ───────────────────────────── demande ─────────────────────────────

  /** Centaure libre le plus proche du point (ou celui demandé). */
  private pick(x: number, z: number, squadId: number, allow?: (id: number) => boolean): CentaureUnit | null {
    const ctx = this.core.ctx;
    let best: CentaureUnit | null = null;
    let bestD = Infinity;
    const list = this.specials();
    for (let i = 0; i < list.length; i++) {
      const sp = list[i];
      if (!this.isCentaure(sp) || !sp.alive()) continue;
      if (squadId !== 0 && sp.squad.id !== squadId) continue;
      if (allow && !allow(sp.squad.id)) continue;
      const v = ctx.vehicles.get(sp.squad.vehicleId);
      if (!v || (v.state !== 'ok' && v.state !== 'damaged') || v.seats[0] === 0) continue;
      // déjà engagé sur un obstacle ou une barricade : pas libre (sauf s'il est celui qu'on demande)
      if (squadId === 0 && sp.order !== null && (sp.order.type === 'degager_obstacle' || sp.order.type === 'degager_barricade' || sp.order.type === 'disperser_gaz')) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bestD) {
        bestD = d;
        best = sp;
      }
    }
    return best;
  }

  private request(x: number, z: number, options?: { byId?: EntityId; squadId?: number; targetId?: EntityId; allow?: (squadId: number) => boolean }): ObstacleAnswer {
    const sp = this.pick(x, z, options?.squadId ?? 0, options?.allow);
    if (!sp) return { ok: false, squadId: 0, name: '', reason: 'Aucun Centaure disponible.' };
    const o = this.core.issue(sp.squad.id, { type: 'degager_obstacle', x, z, targetId: options?.targetId ?? 0, issuedBy: options?.byId ?? 0 });
    if (!o) return { ok: false, squadId: 0, name: '', reason: 'Le Centaure n’a pas reçu l’ordre.' };
    return { ok: true, squadId: sp.squad.id, name: sp.squad.name, reason: '' };
  }

  // ───────────────────────────── demande radio d'un exécutant ─────────────────────────────

  /** Unité racine (compagnie) d'une unité. */
  private rootOf(squadId: number): Squad | undefined {
    const ctx = this.core.ctx;
    let s = squadId !== 0 ? ctx.squads.get(squadId) : undefined;
    for (let guard = 0; s && s.parentId !== 0 && guard < 16; guard++) {
      const up = ctx.squads.get(s.parentId);
      if (!up) break;
      s = up;
    }
    return s;
  }

  /** Véhicule à l'arrêt (ni police, ni secours) le plus proche du point, ou null. */
  private nearestStopped(x: number, z: number, r: number): Vehicle | null {
    const ctx = this.core.ctx;
    const n = ctx.vehicles.queryRadius(x, z, r, this.near);
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const q = this.near[i];
      if (q.faction === 'police' || q.faction === 'rescue' || q.def.flying || Math.abs(q.speed) > 1 || q.kind === 'velo' || q.kind === 'scooter') continue;
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    this.near.length = 0;
    return best;
  }

  private radioRequest(from: string): ObstacleAnswer {
    const core = this.core;
    const ctx = core.ctx;
    const me = ctx.player.person();
    if (!me) return { ok: false, squadId: 0, name: '', reason: 'Aucun joueur.' };
    const b = this.block;
    const target = b ? ctx.vehicles.get(b.blockerId) ?? null : this.nearestStopped(me.x, me.z, 40);
    const x = target ? target.x : me.x;
    const z = target ? target.z : me.z;
    const street = ctx.world.sectorName(x, z);
    const call = from.toUpperCase();
    const root = this.rootOf(me.squadId);
    const chief = root && root.name !== '' ? root.name.toUpperCase() : 'CENTRAL';
    core.say(from, `${chief} ICI ${call}. Demande Centaure pour dégager un obstacle${street ? ', ' + street : ''}. PARLEZ.`, 2, 'commandement', me.id);
    if (!target) {
      core.say(chief, `${call} ICI ${chief}. Négatif, aucun obstacle signalé à votre position. TERMINÉ.`, 1, 'commandement', root ? root.leaderId : 0);
      return { ok: false, squadId: 0, name: '', reason: 'Aucun obstacle à proximité.' };
    }
    const answer = this.request(x, z, { targetId: target.id, byId: root ? root.leaderId : 0 });
    if (answer.ok) {
      core.say(chief, `${call} ICI ${chief}. Reçu, ${answer.name.toUpperCase().replace(/\d+/g, (d) => spell(Number(d)))} fait mouvement pour dégager l’obstacle. Restez à distance du véhicule. TERMINÉ.`, 1, 'commandement', root ? root.leaderId : 0);
    } else {
      core.say(chief, `${call} ICI ${chief}. Négatif, aucun Centaure disponible. Faites circuler le véhicule ou contournez. TERMINÉ.`, 1, 'commandement', root ? root.leaderId : 0);
    }
    return answer;
  }

  // ───────────────────────────── blocage du joueur ─────────────────────────────

  /** Une fois par seconde. */
  update(): void {
    const core = this.core;
    const ctx = core.ctx;
    const now = core.now;
    const traffic = this.traffic();
    const pv = ctx.player.vehicle();
    if (!traffic || !pv || pv.faction !== 'police' || pv.def.flying) {
      this.block = null;
      return;
    }
    // le véhicule du joueur, puis ceux qui le précèdent dans la colonne (meneurs suivis)
    let v: Vehicle | undefined = pv;
    let blocker: Vehicle | null = null;
    let stopped: Vehicle | null = null;
    for (let guard = 0; v && guard < 8 && !blocker; guard++) {
      if (Math.abs(v.speed) < 0.5) {
        blocker = traffic.blockerAhead(v, BLOCK_RANGE);
        if (blocker) stopped = v;
      } else if (v === pv) {
        break; // le joueur roule : rien ne le bloque
      }
      const lead: number = core.autopilot ? core.autopilot.status(v).leaderId : 0;
      v = lead !== 0 ? ctx.vehicles.get(lead) : undefined;
    }
    if (!blocker || !stopped) {
      this.block = null;
      return;
    }
    const b = this.cur;
    if (!this.block || b.blockerId !== blocker.id) b.since = now;
    b.vehicleId = stopped.id;
    b.blockerId = blocker.id;
    b.x = blocker.x;
    b.z = blocker.z;
    b.street = ctx.world.sectorName(blocker.x, blocker.z);
    b.driven = traffic.motorist(blocker) !== null;
    this.block = b;
    const held = now - b.since;
    const cmd = this.playerCommand();
    const centaure = this.pick(blocker.x, blocker.z, 0) !== null;
    if (held >= PROPOSE_AFTER && cmd && (this.offeredFor !== blocker.id || now - this.offeredAt > PROPOSE_AGAIN)) {
      if (this.propose(cmd, blocker, b, centaure)) {
        this.offeredFor = blocker.id;
        this.offeredAt = now;
        this.hintAt = now; // l'indication est redite aussitôt : P accepte maintenant la proposition
      }
    }
    if (held >= HINT_AFTER && now >= this.hintAt) {
      this.hintAt = now + HINT_AGAIN;
      // (P n'est annoncé qu'une fois la proposition faite : avant, P accepterait une autre proposition de l'adjoint)
      const offered = this.offeredFor === blocker.id && now - this.offeredAt <= PROPOSE_AGAIN;
      ctx.ui.notify(this.hint(pv, b, cmd !== null, centaure, offered), 'warn', 7);
    }
  }

  /** Indication à l'écran, selon ce qui est possible. */
  private hint(pv: Vehicle, b: PlayerBlock, commander: boolean, centaure: boolean, offered: boolean): string {
    const ctx = this.core.ctx;
    const me = ctx.player.person();
    const driving = !!me && me.vehicleId === pv.id && pv.seats[0] === me.id;
    const ways: string[] = [];
    if (b.driven) {
      if (driving && pv.def.hasSiren) {
        const labels = ctx.service<{ labelFor(button: string): string }>('input.labels');
        const key = labels ? labels.labelFor('siren') : 'R';
        ways.push(`deux-tons (${key || 'R'}) pour le faire dégager`);
      } else {
        ways.push('à pied, « Faire circuler ce véhicule » (touche d’interaction)');
      }
    }
    if (centaure) {
      ways.push(!commander ? 'demandez le Centaure (menu Radio)'
        : offered ? 'P pour appeler le Centaure' : 'ordre « Dégager l’obstacle » pour le Centaure');
    }
    const what = b.driven ? 'Véhicule bloquant' : 'Véhicule sans conducteur en travers de la voie';
    if (ways.length === 0) return `${what} : aucun Centaure disponible, contournez par une autre rue.`;
    return `${what} : ${ways.join(', ou ')}.`;
  }

  /** Proposition de l'adjoint ; false si rien n'est possible. */
  private propose(cmd: Command, blocker: Vehicle, b: PlayerBlock, centaure: boolean): boolean {
    const core = this.core;
    const ctx = core.ctx;
    const at = b.street ? ', ' + b.street : '';
    const playerId = ctx.player.state.personId;
    if (centaure) {
      const id = blocker.id;
      this.adjoint.offer(cmd, 'obstacle_voie', 3, blocker.x, blocker.z,
        `Chef, un véhicule bloque la voie${at}. Faire venir le Centaure pour le dégager ?`,
        () => {
          const q = ctx.vehicles.get(id);
          const r = this.request(q ? q.x : b.x, q ? q.z : b.z, { targetId: id, byId: playerId });
          if (!r.ok) ctx.ui.notify(r.reason, 'warn', 4);
        });
      return true;
    }
    if (!b.driven) return false;
    // pas de Centaure : l'unité à pied la plus proche fait circuler le véhicule
    const unit = this.nearestFoot(blocker.x, blocker.z);
    if (!unit) return false;
    const id = blocker.id;
    const name = unit.name;
    this.adjoint.offer(cmd, 'obstacle_voie', 3, blocker.x, blocker.z,
      `Chef, un véhicule bloque la voie${at}. Le faire circuler par ${name} ?`,
      () => {
        const q = ctx.vehicles.get(id);
        const traffic = this.traffic();
        const s = ctx.squads.get(unit.id);
        if (!q || !traffic || !s) return;
        const r = traffic.clearOff(q, s.leaderId !== 0 ? s.leaderId : playerId);
        const call = name.toUpperCase().replace(/\d+/g, (d) => spell(Number(d)));
        core.say(name, r === 'ok' ? `ICI ${call}. Je fais circuler le véhicule. TERMINÉ.` : `ICI ${call}. NÉGATIF, le conducteur ne peut pas dégager. TERMINÉ.`, 1, 'unite', s.leaderId);
      });
    return true;
  }

  /** Unité de police à pied (groupe, section) la plus proche du point, hors de l'unité du joueur. */
  private nearestFoot(x: number, z: number): Squad | null {
    const ctx = this.core.ctx;
    const me = ctx.player.person();
    let best: Squad | null = null;
    let bestD = FOOT_RANGE;
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || (s.kind !== 'groupe' && s.kind !== 'section' && s.kind !== 'binome') || s.members.length === 0) continue;
      if (me && (s.leaderId === me.id || s.members.indexOf(me.id) >= 0)) continue;
      const lead = ctx.people.get(s.leaderId) ?? ctx.people.get(s.members[0]);
      if (!lead || lead.vehicleId !== 0) continue;
      const d = Math.hypot(lead.x - x, lead.z - z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }
}
