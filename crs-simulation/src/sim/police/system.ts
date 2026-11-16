/* =====================================================================================
 * FORCES DE L'ORDRE — système (ordre SystemOrder.CONTROL) : l'IA des unités est un contrôleur.
 * Elle écrit person.cmd et appelle ctx.actions / ctx.interactions comme le joueur ; elle ne déplace
 * jamais une personne et ne pilote jamais celle qu'incarne le joueur (son emplacement lui est
 * seulement réservé, et publié par 'police.slot').
 *
 * Chaque pas :
 *   1. arborescence des unités à jour, ordres reçus pris en compte (dans le pas qui suit l'ordre) ;
 *   2. par unité racine : réflexion étalée (perception, fatigue, riposte, initiatives), marche des
 *      formations, opérations détachées, accusé de réception radio ;
 *   3. par agent : action d'arme en cours, réflexion étalée (quatre fois par seconde, deux fois loin
 *      du joueur), commande de déplacement vers son emplacement ou le point de sa tâche.
 * Aucune allocation dans ces boucles.
 * ===================================================================================== */

import type { GameContext, GameSystem, Person, SquadOrder } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import type {
  ExitInfo, FormationInfo, PoliceFormationApi, PoliceSlotApi, PoliceStatusApi, PoliceUnitsApi, SlotInfo, UnitStatus, VehicleReserve,
} from './api';
import {
  ENCIRCLE_CLOSE_ALL, OFFICER_DOWN_EVENT, ORDER_REFUSED_EVENT, POLICE_FORMATION_SERVICE, POLICE_KERNEL_SERVICE, POLICE_SLOT_SERVICE,
  POLICE_STATUS_SERVICE, POLICE_SYSTEM_ID, POLICE_TUNING_SERVICE, POLICE_UNITS_SERVICE,
} from './api';
import type { Agent, Op, Unit } from './brain';
import {
  ACT_NONE, F_BOX, F_COLUMN, F_HOLD, F_LINE, F_NONE, F_SCREEN, F_TORTUE, OP_EXTINGUISH, OP_RESUPPLY, agentOf, isTaskOrder, unitOf,
} from './brain';
import { senseUnit } from './force';
import { cancelAct, decideForce, updateAct } from './weapons';
import { lineError } from './place';
import { Kernel } from './kernel';
import { statusOf, updateCondition } from './logistics';
import { progress, startOrder } from './maneuver';
import { copyOrder, done, report } from './mcore';
import { measure, placeGroup } from './place';
import { abortOps, autoOps, opReport, resupplyNext, startTask, updateOps } from './ops';
import { ackBody, acknowledge, negative, spell } from './radio';
import { looksAhead, thinkAgent } from './reflex';
import { unjoin } from './encircle';
import { halt, steer } from './steer';
import { eachDescendant, refreshFormable, resolveLeads, syncTree, ledByPlayer, playerDetached } from './tree';
import * as T from './tuning';
import { createBravm, createCompany, createEquipage, createGroup, createPeloton, createSection, membersOf } from './units';

const G = 9.81;

/** Ordres de mise en place qu'un joueur fait exécuter au trot quand le point est à plus de PLAYER_RUSH_MIN mètres. */
const PLAYER_RUSH_ORDERS: ReadonlySet<string> = new Set(['tenir', 'ligne', 'colonne', 'avancer', 'couper_circulation', 'filtrer', 'proteger', 'encercler', 'escorter']);
const PLAYER_RUSH_MIN = 35;

export class PoliceSystem implements GameSystem {
  readonly id = POLICE_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL;

  readonly k = new Kernel();
  private ctx!: GameContext;
  /** Unités ayant reçu un ordre depuis le dernier pas. */
  private readonly ordered: number[] = [];
  private pruneAt = 0;
  private readonly slot: SlotInfo = { x: 0, z: 0, heading: 0 };
  private readonly noExits: ExitInfo[] = [];
  private readonly peopleTmp: Person[] = [];
  private readonly opEnded = (op: Op): void => this.onOpEnded(op);
  /** Coût du dernier pas (ms), pour les mesures. */
  lastStepMs = 0;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const k = this.k;
    k.bind(ctx);
    const units: PoliceUnitsApi = {
      createCompany: (o) => createCompany(k, o),
      createSection: (o) => createSection(k, o),
      createGroup: (o) => createGroup(k, o),
      createBravm: (n, o) => createBravm(k, n, o),
      createPeloton: (o) => createPeloton(k, o),
      createEquipage: (kind, o) => createEquipage(k, kind, o),
      encircle: (ids, x, z, radius, open, maxForce) => {
        for (let i = 0; i < ids.length; i++) {
          ctx.squads.issue(ids[i], {
            type: 'encercler', x, z, width: radius * 2, heading: open ?? 0, targetId: open === undefined ? ENCIRCLE_CLOSE_ALL : 0,
            ...(maxForce !== undefined ? { maxForce } : {}),
          });
        }
      },
      rootOf: (id) => {
        this.sync();
        const u = unitOf(ctx.squads.get(id));
        return u ? u.lead.id : id;
      },
      members: (id, out) => membersOf(k, id, out),
      reserveOf: (id): VehicleReserve | null => k.reserveOf(ctx.vehicles.get(id)),
      refillReserve: (id) => {
        k.reserves.delete(id);
        k.reserveOf(ctx.vehicles.get(id));
      },
    };
    const status: PoliceStatusApi = {
      of: (id): UnitStatus | null => {
        this.sync();
        const u = unitOf(ctx.squads.get(id));
        return u ? statusOf(k, u) : null;
      },
    };
    const slots: PoliceSlotApi = {
      slotOf: (id) => {
        const a = agentOf(ctx.people.get(id));
        if (!a || !a.hasSlot || !a.group || a.op !== null) return null;
        if (a.group.dirty) placeGroup(k, a.group);
        this.slot.x = a.sx;
        this.slot.z = a.sz;
        this.slot.heading = a.sh;
        return this.slot;
      },
      distanceToSlot: (id) => {
        const a = agentOf(ctx.people.get(id));
        if (!a || !a.hasSlot || !a.group) return -1;
        return Math.hypot(a.sx - a.p.x, a.sz - a.p.z);
      },
    };
    const formation: PoliceFormationApi = {
      of: (id, block = 0) => this.formationInfo(id, block),
      exits: (id) => {
        const u = unitOf(ctx.squads.get(id));
        return u ? u.lead.exits : this.noExits;
      },
    };
    ctx.provide(POLICE_UNITS_SERVICE, units);
    ctx.provide(POLICE_STATUS_SERVICE, status);
    ctx.provide(POLICE_SLOT_SERVICE, slots);
    ctx.provide(POLICE_FORMATION_SERVICE, formation);
    ctx.provide(POLICE_TUNING_SERVICE, k.tuning);
    // service privé du module : le commandement (src/sim/police/command) y trouve le noyau partagé
    ctx.provide(POLICE_KERNEL_SERVICE, k);
  }

  init(ctx: GameContext): void {
    const k = this.k;
    k.resolve();
    const ev = ctx.events;
    ev.on('session:started', () => {
      k.rng = ctx.rng.fork('police');
      k.resolve();
    });
    ev.on('order:issued', (e) => {
      const s = ctx.squads.get(e.squadId);
      if (s && s.faction === 'police' && this.ordered.indexOf(e.squadId) < 0) this.ordered.push(e.squadId);
    });
    ev.on('person:hurt', (e) => this.onHurt(e.id, e.info.sourceId, e.info.kind));
    ev.on('person:down', (e) => this.onDown(e.id));
    ev.on('projectile:spawned', (e) => this.onProjectile(e.id, e.kind, e.ownerId));
    ev.on('fire:started', (e) => {
      if (e.targetKind !== 'person') k.addDanger(e.x, e.z, e.targetKind === 'ground' ? 2.2 : 2.8, 4, true);
    });
  }

  reset(): void {
    this.k.reset();
    this.ordered.length = 0;
    this.pruneAt = 0;
  }

  // ───────────────────────────── événements ─────────────────────────────

  private sync(): void {
    const k = this.k;
    k.now = this.ctx.clock.now;
    syncTree(k, false);
  }

  private onHurt(id: number, sourceId: number, kind: string): void {
    const ctx = this.ctx;
    const a = agentOf(ctx.people.get(id));
    if (!a || !a.root) return;
    const src = sourceId !== 0 ? ctx.people.get(sourceId) : undefined;
    if (src && src.faction === 'police') return;
    if (!src && kind !== 'impact' && kind !== 'blunt' && kind !== 'blast' && kind !== 'burn') return;
    const s = a.root.sense;
    s.hurtAt = this.k.now;
    if (src) {
      s.ox = src.x;
      s.oz = src.z;
    }
    a.alertUntil = this.k.now + T.SHIELD_ALERT_TIME;
  }

  private onDown(id: number): void {
    const ctx = this.ctx;
    const k = this.k;
    const p = ctx.people.get(id);
    const a = agentOf(p);
    if (!p || !a || !a.root) return;
    const u = a.root;
    k.emit(OFFICER_DOWN_EVENT, { squadId: a.home ? a.home.id : u.id, personId: id, x: p.x, z: p.z });
    if (k.now - u.sense.hurtAt > 0.01 || u.attackReportAt < k.now - 4) {
      u.sense.hurtAt = k.now;
    }
    if (p.injury === 'serious' || p.injury === 'critical') {
      k.say(a.home ?? u, 'ICI ' + (a.home ?? u).squad.name.toUpperCase() + '. URGENT. Agent à terre ! Deux boucliers en couverture, je le dégage. PARLEZ.', 2, 'unite');
    }
  }

  /** Projectile hostile lancé : les unités vers lesquelles il se dirige lèvent les boucliers. */
  private onProjectile(id: number, kind: string, ownerId: number): void {
    if (kind !== 'pave' && kind !== 'bouteille' && kind !== 'molotov' && kind !== 'mortier' && kind !== 'oeuf_peinture' && kind !== 'debris') return;
    const ctx = this.ctx;
    const k = this.k;
    const owner = ownerId !== 0 ? ctx.people.get(ownerId) : undefined;
    if (owner && owner.faction === 'police') return;
    const pr = ctx.projectiles.get(id);
    if (!pr) return;
    const now = ctx.clock.now;
    // point de chute estimé (sans traînée, sol à la hauteur du lanceur)
    const h = pr.y - ctx.world.heightAt(pr.x, pr.z);
    const t = (pr.vy + Math.sqrt(pr.vy * pr.vy + 2 * G * (h > 0 ? h : 0))) / G;
    const sp = Math.sqrt(pr.vx * pr.vx + pr.vz * pr.vz);
    if (sp < 0.5) return;
    // mortier d'artifice : tir tendu qui éclate à plusieurs dizaines de mètres, quel que soit l'angle
    const reach = kind === 'mortier' ? 55 : sp * t * 0.92;
    const ux = pr.vx / sp;
    const uz = pr.vz / sp;
    const lx = pr.x + ux * reach;
    const lz = pr.z + uz * reach;
    const roots = k.roots;
    let aimedAtUs = false;
    for (let i = 0; i < roots.length; i++) {
      const u = roots[i];
      for (let j = 0; j < u.groups.length; j++) {
        const g = u.groups[j];
        if (g.kind === F_NONE || g.agents.length === 0) continue;
        // distance du repère au segment de vol (tir tendu) et au point de chute
        const ex = g.ax - pr.x;
        const ez = g.az - pr.z;
        let along = ex * ux + ez * uz;
        if (along < 0) along = 0;
        else if (along > reach) along = reach;
        const cx = pr.x + ux * along - g.ax;
        const cz = pr.z + uz * along - g.az;
        const margin = g.width * 0.5 + (kind === 'mortier' ? 12 : 9);
        const nearPath = kind === 'mortier' && cx * cx + cz * cz < margin * margin;
        const nearFall = (lx - g.ax) * (lx - g.ax) + (lz - g.az) * (lz - g.az) < margin * margin;
        if (!nearPath && !nearFall) continue;
        aimedAtUs = true;
        const s = u.sense;
        if (now - s.lastIncomingAt > 10) s.incoming = 0;
        s.incoming++;
        s.lastIncomingAt = now;
        if (owner) {
          s.ox = s.incoming > 1 ? s.ox + (owner.x - s.ox) * 0.5 : owner.x;
          s.oz = s.incoming > 1 ? s.oz + (owner.z - s.oz) * 0.5 : owner.z;
        } else if (s.incoming === 1) {
          s.ox = pr.x;
          s.oz = pr.z;
        }
        const until = now + t + 2;
        if (until > u.shieldsUntil) u.shieldsUntil = until;
        if (kind === 'mortier') {
          if (now - s.lastMortarAt > 6) s.mortars = 0;
          s.mortars++;
          s.lastMortarAt = now;
          // tortue réflexe sous les mortiers : accroupis derrière les boucliers
          if (s.mortars >= T.MORTAR_VOLLEY) u.duckUntil = now + 5;
        }
        break;
      }
    }
    // engin incendiaire : la zone de chute est évacuée
    if (kind === 'molotov' && aimedAtUs) k.addDanger(lx, lz, T.FIRE_CLEARANCE, t + 1.5, true);
  }

  // ───────────────────────────── ordres ─────────────────────────────

  private processOrders(): void {
    const ctx = this.ctx;
    const k = this.k;
    const list = this.ordered;
    for (let i = 0; i < list.length; i++) {
      const squad = ctx.squads.get(list[i]);
      const u = unitOf(squad);
      if (!squad || !u) continue;
      this.handleOrder(u, squad.order);
    }
    list.length = 0;
    // une unité absorbée par un nouvel ordre ne garde pas ses blocs
    void k;
  }

  private handleOrder(u: Unit, o: SquadOrder): void {
    const k = this.k;
    const type = o.type;
    // ordre de mise en place donné par le JOUEUR sur un point éloigné : l'unité s'y porte au pas de gymnastique
    // (trot) au lieu du pas cadencé — le joueur qui gère la manifestation veut voir ses unités y aller franchement
    if (o.issuedBy !== 0 && o.issuedBy === this.ctx.player.state.personId && PLAYER_RUSH_ORDERS.has(type)) {
      const d = Math.hypot(o.x - u.status.x, o.z - u.status.z);
      if (d > PLAYER_RUSH_MIN) u.trotUntil = k.now + d / T.SPEED_TROT + 25;
    }
    // unité spéciale pilotée par le commandement (BRAV-M en selle, engins, drone) : elle exécute elle-même cet ordre
    if (k.orderHook !== null && k.orderHook(u, o)) {
      u.storeOrder = o;
      return;
    }
    if (isTaskOrder(type)) {
      this.endTask(u, false);
      u.task = copyOrder(o);
      // le niveau de force de la tâche vaut pour toute l'unité qui la reçoit, le temps de la tâche ;
      // l'ordre de formation (dernier ordre du magasin qui ne soit pas une tâche) est rétabli ensuite
      u.restoreOrder = u.storeOrder && u.storeOrder !== o ? u.storeOrder : null;
      u.placedOrder = o;
      eachDescendant(u, (d) => {
        if (d === u) return;
        d.restoreOrder = d.squad.order;
        const c = copyOrder(d.squad.order);
        c.maxForce = o.maxForce;
        d.squad.order = c;
        d.placedOrder = c;
      });
      const dist = Math.hypot(o.x - u.status.x, o.z - u.status.z);
      const reason = startTask(k, u, u.task);
      const ops = u.lead.ops;
      for (let i = 0; i < ops.length; i++) if (ops[i].owner === u && ops[i].ordered && ops[i].taskAt < 0) ops[i].taskAt = o.issuedAt;
      if (reason !== '') {
        k.say(u, negative(u.squad.name, reason), 1, 'unite');
        if (type === 'interpeller') k.emit(ORDER_REFUSED_EVENT, { squadId: u.id, type, reason });
        done(k, u, type, false, reason);
        this.endTask(u, false);
      } else {
        k.say(u, acknowledge(u.squad.name, ackBody(k, o, dist)), 1, 'unite');
      }
      return;
    }
    u.storeOrder = o;
    if (type === 'cesser') {
      abortOps(k, u.lead, u.isRoot && !u.joinedTo ? null : u, 'Action interrompue sur ordre.');
      this.endTask(u, false);
      const agents = u.lead.agents;
      for (let i = 0; i < agents.length; i++) if (agents[i].act !== ACT_NONE && agents[i].act < 3) cancelAct(k, agents[i]);
      if (!u.isRoot || u.joinedTo) {
        k.say(u, acknowledge(u.squad.name, 'halte à l’action en cours'), 1, 'unite');
        return;
      }
    }
    // ordre de formation : l'unité manœuvre d'un bloc avec toute sa descendance
    if (u.joinedTo) unjoin(k, u);
    const old = u.lead;
    u.isRoot = true;
    eachDescendant(u, (d) => {
      if (d === u) return;
      // l'unité du joueur garde ses propres ordres
      if (playerDetached(k, d) && !ledByPlayer(k, u)) return;
      if (d.joinedTo) unjoin(k, d);
      // les opérations en cours des unités absorbées suivent leur nouvelle direction
      for (let i = 0; i < d.ops.length; i++) {
        d.ops[i].root = u;
        u.ops.push(d.ops[i]);
      }
      d.ops.length = 0;
      d.isRoot = false;
      d.groups.length = 0;
      d.order = null;
      d.task = null;
      d.restoreOrder = null;
      d.squad.order = copyOrder(o);
      d.storeOrder = d.squad.order;
    });
    resolveLeads(k);
    if (old !== u && old.isRoot) old.reformAt = k.now;
    startOrder(k, u, o);
  }

  /** Fin d'une tâche : l'ordre de formation du magasin est rétabli (sauf si un ordre plus récent est arrivé). */
  private endTask(u: Unit, _ok: boolean): void {
    if (!u.task && !u.restoreOrder) return;
    u.task = null;
    eachDescendant(u, (d) => {
      if (d.restoreOrder && d.squad.order === d.placedOrder) {
        d.squad.order = d.restoreOrder;
        d.storeOrder = d.restoreOrder;
      }
      d.restoreOrder = null;
      d.placedOrder = null;
    });
  }

  private onOpEnded(op: Op): void {
    const k = this.k;
    const owner = op.owner;
    if (!op.ordered) {
      if (op.kind === OP_EXTINGUISH && !op.ok && op.reason !== '') report(k, owner, op.reason);
      return;
    }
    const task = owner.task;
    // l'opération répondait à un ordre remplacé depuis : rien à clore
    if (!task || (op.taskAt >= 0 && op.taskAt !== task.issuedAt)) return;
    if (op.kind === OP_RESUPPLY) {
      owner.man.volleys += op.count;
      if (resupplyNext(k, owner)) return;
      const n = owner.man.volleys;
      owner.man.volleys = 0;
      report(k, owner, n > 0 ? 'Ravitaillement terminé, dotations complétées' : 'Ravitaillement impossible : réserve vide');
      done(k, owner, task.type, n > 0, '');
      this.endTask(owner, true);
      return;
    }
    const text = opReport(k, op);
    if (text !== '') report(k, owner, text);
    done(k, owner, task.type, op.ok, op.reason === 'refus' ? 'Moyen de force non autorisé.' : op.reason);
    this.endTask(owner, op.ok);
  }

  // ───────────────────────────── boucle ─────────────────────────────

  update(dt: number): void {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const ctx = this.ctx;
    const k = this.k;
    k.now = ctx.clock.now;
    k.dt = dt;
    if (this.ordered.length > 0 || k.now - k.treeAt >= 0.25) {
      syncTree(k, false);
      k.treeAt = k.now;
    }
    if (this.ordered.length > 0) this.processOrders();
    const roots = k.roots;
    const now = k.now;
    for (let i = 0; i < roots.length; i++) {
      const u = roots[i];
      if (now >= u.thinkAt) this.thinkUnit(u);
      progress(k, u, dt);
      if (u.ops.length > 0) updateOps(k, u, this.opEnded);
      if (u.ackText !== '' && now >= u.ackAt) {
        k.say(u, u.ackText, 1, 'unite');
        u.ackText = '';
      }
    }
    // agents : focalisation (réflexion moins fréquente loin du joueur)
    const player = ctx.player.person();
    const px = player ? player.x : 0;
    const pz = player ? player.z : 0;
    const far2 = player ? T.FAR_DISTANCE * T.FAR_DISTANCE : Infinity;
    for (let i = 0; i < roots.length; i++) {
      const agents = roots[i].agents;
      for (let j = 0; j < agents.length; j++) {
        const a = agents[j];
        const p = a.p;
        if (p.isPlayer) continue;
        if (!a.able) {
          if (a.act !== ACT_NONE) cancelAct(k, a);
          this.evacuate(a, roots[i]);
          continue;
        }
        if (a.act !== ACT_NONE) updateAct(k, a);
        if (now >= a.thinkAt) {
          const far = (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz) > far2;
          const interval = far ? T.THINK_AGENT_FAR : T.THINK_AGENT;
          thinkAgent(k, a, interval);
          a.thinkAt = now + interval;
        }
        this.drive(a);
      }
    }
    if (now >= this.pruneAt) {
      this.pruneAt = now + 0.5;
      k.pruneDangers();
    }
    if (t0 !== 0) this.lastStepMs = performance.now() - t0;
  }

  private thinkUnit(u: Unit): void {
    const k = this.k;
    const now = k.now;
    const dt = u.sense.at > 0 ? now - u.sense.at : T.THINK_UNIT;
    u.thinkAt = now + T.THINK_UNIT;
    const n = refreshFormable(k, u);
    if (n !== u.formed && u.reformAt === 0) {
      // pertes ou retours : la formation se resserre après un court délai
      u.reformAt = now + 1;
    }
    if (u.squad.kind === 'equipage') return;
    senseUnit(k, u);
    updateCondition(k, u, dt > 2 ? 2 : dt);
    decideForce(k, u);
    autoOps(k, u);
  }

  /** Commande de déplacement d'un agent pour ce pas. */
  private drive(a: Agent): void {
    const k = this.k;
    const p = a.p;
    const now = k.now;
    if (a.boardId !== 0) {
      this.board(a);
      return;
    }
    if (a.op !== null) {
      if (a.hold) halt(a, a.face);
      else steer(k, a, a.goalX, a.goalZ, 0, 0, a.face, a.vcap, a.opRole !== 3);
      return;
    }
    if (now < a.postUntil) {
      steer(k, a, a.postX, a.postZ, 0, 0, a.face, 2.4, false);
      return;
    }
    if (!a.hasSlot || now < a.reactAt) {
      // sans emplacement (ou ordre pas encore pris en compte) : immobile, le regard où il était
      const cmd = p.cmd;
      if (cmd.moveX !== 0 || cmd.moveZ !== 0 || !a.hasSlot) halt(a, a.hasSlot ? p.cmd.aimYaw : a.face);
      return;
    }
    if (now < a.yieldUntil) {
      // laisser passer un collègue : pas de côté momentané, puis retour à l'emplacement
      steer(k, a, a.sx + a.jx + a.yieldX, a.sz + a.jz + a.yieldZ, a.svx, a.svz, a.face, a.vcap, looksAhead(a));
      return;
    }
    steer(k, a, a.sx + a.jx, a.sz + a.jz, a.svx, a.svz, a.face, a.vcap, looksAhead(a));
  }

  /**
   * Agent hors de combat mais encore debout (blessure sérieuse) : il quitte le rang de lui-même et se replie
   * derrière la ligne, où il attend les secours. À terre, il ne reçoit aucune commande (ses collègues viennent le chercher).
   */
  private evacuate(a: Agent, root: Unit): void {
    const p = a.p;
    if (p.vehicleId !== 0 || p.custody !== 'free' || p.heldBy !== 0 || p.posture === 'down' || p.health <= 0 || p.dormant) return;
    const g = root.groups.length > 0 ? root.groups[0] : null;
    if (!g || g.kind === F_NONE || g.kind === F_HOLD) {
      halt(a, p.heading);
      return;
    }
    const fx = Math.sin(g.ah);
    const fz = Math.cos(g.ah);
    let lat = (p.x - g.ax) * -fz + (p.z - g.az) * fx;
    const half = Math.max(1, g.width * 0.4);
    if (lat > half) lat = half;
    else if (lat < -half) lat = -half;
    const back = T.RESCUE_DROP_BACK + 1.5;
    const gx = g.ax - fz * lat - fx * back;
    const gz = g.az + fx * lat - fz * back;
    a.crouch = false;
    if ((gx - p.x) * (gx - p.x) + (gz - p.z) * (gz - p.z) < 1.2) {
      halt(a, g.ah);
      return;
    }
    steer(this.k, a, gx, gz, 0, 0, g.ah, 1.1, true);
  }

  private board(a: Agent): void {
    const ctx = this.ctx;
    const k = this.k;
    const p = a.p;
    const v = ctx.vehicles.get(a.boardId);
    if (!v || p.vehicleId !== 0) {
      if (!v) a.boardId = 0;
      return;
    }
    const dx = v.x - p.x;
    const dz = v.z - p.z;
    const reach = Math.max(v.def.length, v.def.width) * 0.5 + 1;
    if (dx * dx + dz * dz <= (reach + 0.3) * (reach + 0.3)) {
      const ok = p.poste === 'conducteur' ? ctx.vehicles.enter(p, v, 'driver') || ctx.vehicles.enter(p, v, 'passenger') : ctx.vehicles.enter(p, v, 'passenger');
      if (!ok) a.boardId = 0;
      return;
    }
    steer(k, a, v.x, v.z, 0, 0, a.face, 2.2, true);
  }

  // ───────────────────────────── géométrie pour l'interface et les tests ─────────────────────────────

  private formationInfo(id: number, block: number): FormationInfo | null {
    const ctx = this.ctx;
    const k = this.k;
    this.sync();
    const u = unitOf(ctx.squads.get(id));
    if (!u) return null;
    const lead = u.lead;
    const info = lead.info;
    const g = lead.groups.length > block && block >= 0 ? lead.groups[block] : null;
    info.blocks = lead.groups.length;
    info.front.length = 0;
    if (!g || g.kind === F_NONE) {
      info.formation = 'aucune';
      info.slotErrorMax = 0;
      info.slotErrorRms = 0;
      info.slotErrorAll = 0;
      info.lineError = 0;
      info.moving = false;
      return info;
    }
    if (g.dirty) placeGroup(k, g);
    measure(g);
    info.formation = lead.groups.length > 1 ? 'encerclement' : g.kind === F_LINE ? 'ligne' : g.kind === F_COLUMN ? 'colonne'
      : g.kind === F_TORTUE ? 'tortue' : g.kind === F_SCREEN ? 'ecran' : g.kind === F_BOX ? 'escorte' : g.kind === F_HOLD ? 'libre' : 'aucune';
    info.x = g.ax;
    info.z = g.az;
    info.heading = g.ah;
    info.width = g.width;
    info.spacing = g.spacing;
    info.slotErrorMax = g.errMax;
    info.slotErrorRms = g.errRms;
    info.slotErrorAll = g.errAll;
    info.moving = g.moving;
    const tmp = this.peopleTmp;
    tmp.length = 0;
    for (let i = 0; i < g.front.length; i++) {
      const a = g.front[i];
      info.front.push(a.p.id);
      if (a.able && a.op === null && !a.p.isPlayer) tmp.push(a.p);
    }
    info.lineError = g.kind === F_LINE || g.kind === F_TORTUE ? lineError(tmp, tmp.length) : 0;
    return info;
  }
}

export { spell };
