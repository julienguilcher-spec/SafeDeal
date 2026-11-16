/* =====================================================================================
 * GROUPES RADICAUX — système de jeu : contrôleurs de comportement, événements, services.
 *
 * Le système tourne juste après le contrôle de la foule (SystemOrder.CONTROL + 1) : le cœur de la foule
 * a fait réfléchir chaque personne (c'est là que nos contrôleurs décident) et écrit sa commande de
 * déplacement ; nous faisons alors avancer le bloc, les groupes, puis les gestes en cours (viser,
 * lancer, frapper, interagir), qui complètent ou remplacent cette commande pour le pas courant.
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, InteractionHandler, InteractionOption, Person } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import type { BehaviorController, CrowdCoreApi } from '../api';
import { F } from '../brain';
import type { CrowdBrain } from '../brain';
import type { CrowdCore } from '../core';
import { Acts } from './acts';
import { CROWD_RADICAL, CROWD_SIGNALS, RADICAL_SYSTEM } from './api';
import type { RadicalApi, RadicalGroupView } from './api';
import { plainClothes } from './attire';
import { BLOC_NAMES, Bloc } from './bloc';
import { Looting, followerThink, looterThink } from './followers';
import { RadKernel } from './kernel';
import { ACT, BLOC, KIND, PLAN, PLAN_NAMES, TASK, TOOL, isAble } from './model';
import type { RadGroup, RadMember } from './model';
import { binHandler } from './supply';
import { memberTask } from './tasks';
import * as R from './tuning';

export class RadicalSystem implements GameSystem {
  readonly id = RADICAL_SYSTEM;
  readonly order = SystemOrder.CONTROL + 1;
  readonly k: RadKernel;
  readonly bloc: Bloc;
  readonly acts: Acts;
  readonly looting: Looting;
  /** Mesure (essais de performance) : ms cumulées dans update() et dans les réflexions des contrôleurs. */
  profiling = false;
  cost = 0;
  /** Horloge de la mesure (ms). Les essais y branchent le temps processeur, insensible à la charge de la machine. */
  profClock: () => number = () => performance.now();
  private ctx!: GameContext;
  private readonly views: RadicalGroupView[] = [];
  private viewsFor = -1;
  private readonly spawned: EntityId[] = [];
  private readonly api: RadicalApi;
  /** Une session vient de commencer : mise en route au premier pas. */
  private armed = false;

  constructor(readonly core: CrowdCore) {
    this.k = new RadKernel(core);
    this.bloc = new Bloc(this.k);
    this.acts = new Acts(this.k);
    this.k.cancelAct = (m) => this.acts.cancel(m);
    this.looting = new Looting(this.k);
    const self = this;
    this.api = {
      get active(): boolean { return self.k.active; },
      get heat(): number { return self.k.heat; },
      get phase() { return BLOC_NAMES[self.bloc.phase]!; },
      get actAt(): number { return self.bloc.actAt; },
      get groups(): readonly RadicalGroupView[] { return self.groupViews(); },
      get stats() { return self.k.stats; },
      groupOf: (id) => {
        const m = self.k.byId.get(id);
        if (!m || !m.group) return null;
        const views = self.groupViews();
        for (const v of views) if (v.id === m.group.id) return v;
        return null;
      },
      scheduleAction: (at) => self.bloc.schedule(at),
      orderRetreat: () => {
        self.bloc.ordered = true;
      },
    };
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.k.bind(ctx);
    ctx.provide(CROWD_SIGNALS, this.k.signals);
    ctx.provide(CROWD_RADICAL, this.api);
  }

  init(ctx: GameContext): void {
    const core = this.core;
    core.register('radical', this.controller('radical'));
    core.register('opportuniste', this.controller('opportuniste'));
    core.register('pilleur', this.controller('pilleur'));
    this.bind(ctx);
    ctx.interactions.register(this.vehicleArson());
    ctx.interactions.register(binHandler(this.k));
  }

  reset(): void {
    this.k.reset();
    this.bloc.reset();
    this.looting.reset();
    this.spawned.length = 0;
    this.claimedGrenades.length = 0;
    this.armed = false;
    this.viewsFor = -1;
    this.cost = 0;
  }

  update(dt: number): void {
    const k = this.k;
    if (this.armed) {
      this.armed = false;
      k.start();
      if (k.active) this.bloc.start();
    }
    if (!k.active) return;
    const t0 = this.profiling ? this.profClock() : 0;
    k.now = this.ctx.clock.now;
    if (!this.core.active) {
      k.active = false;
      return;
    }
    this.undress();
    k.updateHeat(dt);
    this.bloc.update(dt);
    this.looting.update();
    this.acts.update();
    k.signals.update(k.now);
    if (k.stats.firstSignAt < 0 && k.signals.firstAt >= 0) k.stats.firstSignAt = k.signals.firstAt;
    if (this.profiling) this.cost += this.profClock() - t0;
  }

  // ───────────────────────────── contrôleurs ─────────────────────────────

  private controller(profile: string): BehaviorController {
    const self = this;
    return {
      id: 'radical:' + profile,
      priority: 10,
      think(p: Person, b: CrowdBrain, _core: CrowdCoreApi, _dt: number): boolean {
        if (!self.profiling) return self.think(p, b);
        const t0 = self.profClock();
        const r = self.think(p, b);
        self.cost += self.profClock() - t0;
        return r;
      },
      release(p: Person, b: CrowdBrain): void {
        const m = b.data as RadMember | null;
        if (m !== null && typeof m === 'object' && m.p === p) {
          m.held = false;
          if (m.act !== ACT.NONE) self.acts.cancel(m);
        }
      },
    };
  }

  /** Réflexion d'une personne de profil radical, opportuniste ou pilleur. true : le contrôleur garde la main. */
  private think(p: Person, b: CrowdBrain): boolean {
    const hold = this.decide(p, b);
    const m = b.data as RadMember | null;
    if (m !== null && typeof m === 'object' && m.p === p) {
      if (!hold && m.held && m.act !== ACT.NONE) this.acts.cancel(m);
      m.held = hold;
    }
    return hold;
  }

  private decide(p: Person, b: CrowdBrain): boolean {
    const k = this.k;
    if (!k.active) return false;
    const m = k.member(p, b);
    // changement de profil en cours de route (radicalisation, apaisement)
    const kind = p.profile === 'pilleur' ? KIND.LOOTER : p.profile === 'opportuniste' ? KIND.FOLLOWER : KIND.RADICAL;
    if (m.kind !== kind) {
      k.detach(m);
      m.kind = kind;
      m.task = TASK.NONE;
      if (kind === KIND.RADICAL) k.pool.push(m);
    }
    // en train de quitter les lieux : c'est le cœur de la foule qui conduit
    if ((b.flags & F.LEAVING) !== 0) return false;
    if (!(k.heat > 0) && this.bloc.phase === BLOC.DORMANT) return false;
    // dangers personnels : gaz qui submerge, flammes, peur panique — le réflexe par défaut prend le relais
    if (p.gas > R.GAS_PERSONAL || p.burning > 0.05 || k.ctx.hazards.fireAt(p.x, p.z) > 0.05) return false;
    if (p.fear > 0.8) return false;
    if (k.now - m.toolsAt > 2.5) k.refreshTools(m);
    if (kind === KIND.LOOTER) return looterThink(k, this.acts, this.looting, m);
    if (kind === KIND.FOLLOWER) return followerThink(k, this.acts, this.bloc, this.looting, m);
    const g = m.group;
    if (g === null || g.plan === PLAN.FOLLOW) return false;
    // engagé avec son groupe, il ne suit ni l'horaire de dispersion des organisateurs ni le départ d'un
    // ami : il ne quittera les lieux que si la peur l'emporte, ou avec le bloc
    if (b.leaveAt < Infinity) b.leaveAt = Infinity;
    // le groupe donne du cœur : tant que son moral tient, la peur de chacun retombe vite (détonations de
    // ses propres mortiers, feux qu'il a allumés) ; un groupe au moral brisé ne retient plus personne
    if (p.fear > 0.3) p.fear -= (p.fear - 0.3) * 0.3 * g.morale;
    if (this.returnGrenade(g, m)) return true;
    if (m.act === ACT.NONE && m.task === TASK.NONE) m.result = 0;
    return memberTask(k, this.acts, this.bloc, g, m);
  }

  /**
   * Un palet fumant tombé près du groupe : celui qui a une raquette le renvoie d'un revers, un autre le
   * ramasse et le relance vers les forces, un troisième l'éloigne d'un coup de pied.
   */
  private returnGrenade(g: RadGroup, m: RadMember): boolean {
    const k = this.k;
    const now = k.now;
    if (m.task === TASK.RETURN && m.act !== ACT.NONE) return true;
    if (m.act !== ACT.NONE || m.umbrella || m.banner || now < m.nextReflex || this.bloc.phase < BLOC.FORMING) return false;
    if (g.plan === PLAN.FOLLOW || g.plan === PLAN.SCATTER || g.plan === PLAN.MELT) return false;
    m.nextReflex = now + 0.7;
    const p = m.p;
    const pr = k.nearestGrenade(p.x, p.z, R.RETURN_RADIUS);
    if (!pr || k.claims.has(pr.id)) return false;
    // un seul s'en charge, pas tout le groupe : le plus proche parmi ceux qui réfléchissent
    k.claims.set(pr.id, g.id);
    this.claimedGrenades.push(pr.id, now + 6);
    const a = g.a;
    // vers les forces si on les voit, sinon loin du groupe
    let tx = a.police > 0 ? a.nx : p.x + (pr.x - g.ax) * 6;
    let tz = a.police > 0 ? a.nz : p.z + (pr.z - g.az) * 6;
    if (tx === p.x && tz === p.z) {
      tx = p.x + g.hx * 10;
      tz = p.z + g.hz * 10;
    }
    m.task = TASK.RETURN;
    m.taskSince = now;
    if ((m.tools & TOOL.RACKET) !== 0) this.acts.racket(m, pr.id, tx, tz);
    else if ((p.id & 1) === 0 || p.gasProtection >= 0.5) this.acts.verb(m, 'renvoyer', pr.id, pr.x, pr.z, 1.15, tx, tz, 8);
    else this.acts.kick(m, pr.id, tx, tz);
    return true;
  }

  /** Palets réservés par un membre : [identifiant, échéance, …]. */
  private readonly claimedGrenades: number[] = [];

  /** Avant le passage à l'acte, les radicaux qui arrivent sont en tenue de ville. */
  private undress(): void {
    const k = this.k;
    // palets réservés dont l'échéance est passée
    const cg = this.claimedGrenades;
    for (let i = cg.length - 2; i >= 0; i -= 2) {
      if (k.now >= cg[i + 1]!) {
        k.claims.delete(cg[i]!);
        cg.splice(i, 2);
      }
    }
    const q = this.spawned;
    if (q.length === 0) return;
    const early = this.bloc.phase === BLOC.DORMANT || this.bloc.phase === BLOC.SIGNS;
    for (let i = 0; i < q.length; i++) {
      const p = this.ctx.people.get(q[i]!);
      if (!p || p.faction !== 'protest' || p.profile !== 'radical' || p.isPlayer) continue;
      const b = this.core.api.brain(p);
      if (!b || b.index < 0) continue;
      const m = k.member(p, b);
      if (early) plainClothes(k, m);
      else {
        m.black = p.look.outfit === 'black_bloc';
        m.masked = p.look.faceCover;
      }
    }
    q.length = 0;
  }

  // ───────────────────────────── événements ─────────────────────────────

  private bind(ctx: GameContext): void {
    const k = this.k;
    const ev = ctx.events;
    ev.on('session:started', () => {
      // le calendrier du bloc est établi au premier pas, une fois la foule mise en place
      this.armed = true;
    });
    ev.on('session:ended', () => {
      k.active = false;
    });
    ev.on('person:spawned', (e) => {
      if (this.core.active) this.spawned.push(e.id);
    });
    ev.on('person:arrested', (e) => {
      if (!k.active) return;
      const m = k.byId.get(e.id);
      if (!m) return;
      if (!k.arrests.includes(e.id)) k.arrests.push(e.id);
      const g = m.group;
      if (g) g.morale = Math.max(0, g.morale - 0.06);
    });
    ev.onAny('law:escape', (payload) => {
      if (!k.active) return;
      const e = payload as { id?: EntityId };
      if (typeof e.id !== 'number' || !k.byId.has(e.id)) return;
      for (const g of k.groups) {
        if (g.plan !== PLAN.RESCUE || g.tId !== e.id) continue;
        k.stats.rescuesDone++;
        const p = ctx.people.get(e.id);
        k.emit('liberation_reussie', g, p ? p.x : g.ax, p ? p.z : g.az, g.a.able, e.id);
        return;
      }
    });
    ev.on('projectile:spawned', (e) => {
      if (!k.active) return;
      const m = k.byId.get(e.ownerId);
      if (!m || !k.isThrown(e.kind)) return;
      k.stats.thrown++;
      if (e.kind === 'mortier') k.stats.mortars++;
      else if (e.kind === 'molotov') k.stats.molotovs++;
      k.violence();
    });
    ev.on('projectile:returned', (e) => {
      if (!k.active) return;
      const m = k.byId.get(e.byId);
      if (!m) return;
      k.stats.returned++;
      k.violence();
      k.emit('grenade_renvoyee', m.group, m.p.x, m.p.z, 1, e.id);
    });
    ev.on('person:hurt', (e) => {
      if (!k.active || e.info.sourceId === 0) return;
      const m = k.byId.get(e.info.sourceId);
      if (!m) return;
      const victim = ctx.people.get(e.id);
      if (!victim || victim.faction !== 'police') return;
      k.violence();
      if (m.group) m.group.morale = Math.min(1, m.group.morale + 0.015);
    });
    ev.on('person:down', (e) => {
      if (!k.active || e.sourceId === 0) return;
      const m = k.byId.get(e.sourceId);
      const victim = ctx.people.get(e.id);
      if (m && m.group && victim && victim.faction === 'police') m.group.morale = Math.min(1, m.group.morale + 0.08);
    });
    ev.on('explosion', (e) => {
      if (!k.active || (e.kind !== 'gm2l' && e.kind !== 'desencerclement')) return;
      for (const g of k.groups) {
        if (g.plan === PLAN.FOLLOW) continue;
        if (Math.hypot(g.ax - e.x, g.az - e.z) < 18) g.morale = Math.max(0, g.morale - 0.07);
      }
    });
    ev.on('shop:window', (e) => {
      if (!k.active) return;
      const shop = ctx.props.shop(e.id);
      if (!shop) return;
      const m = k.byId.get(e.byId);
      if (m && (e.state === 'cracked' || e.state === 'broken')) {
        k.violence();
        if (m.group && e.state === 'broken') m.group.morale = Math.min(1, m.group.morale + 0.03);
      }
      if (e.state === 'broken') this.looting.opened(shop);
    });
    ev.on('shop:shutter', (e) => {
      // un rideau forcé ouvre la boutique aux pilleurs si la vitrine a déjà cédé
      if (!k.active || e.closed) return;
      const shop = ctx.props.shop(e.id);
      if (shop && shop.window === 'broken') this.looting.opened(shop);
    });
    ev.onAny('props:shutter_forced', (payload) => {
      if (!k.active) return;
      const e = payload as { id?: EntityId; byId?: EntityId };
      const m = typeof e.byId === 'number' ? k.byId.get(e.byId) : undefined;
      if (m && typeof e.id === 'number') {
        const shop = ctx.props.shop(e.id);
        k.emit('rideau_force', m.group, shop ? shop.x : m.p.x, shop ? shop.z : m.p.z, 1, e.id);
      }
    });
    ev.on('shop:looted', (e) => {
      if (!k.active) return;
      this.looting.looted(e.id);
      const m = k.byId.get(e.byId);
      if (!m) return;
      k.stats.looted++;
      const shop = ctx.props.shop(e.id);
      k.emit('pillage', m.group, shop ? shop.x : m.p.x, shop ? shop.z : m.p.z, 1, e.id);
    });
    ev.on('prop:damaged', (e) => {
      if (k.active && e.byId !== 0 && k.byId.has(e.byId)) k.violence();
    });
    ev.on('barricade:built', (e) => {
      if (!k.active) return;
      for (const g of k.groups) {
        const s = g.site;
        if (!s.active || s.barricadeId !== 0 || Math.hypot(s.x - e.x, s.z - e.z) > 9) continue;
        s.barricadeId = e.id;
        k.stats.barricades++;
        k.violence();
        g.morale = Math.min(1, g.morale + 0.05);
        return;
      }
    });
    ev.on('fire:started', (e) => {
      if (!k.active) return;
      const m = k.byId.get(e.sourceId);
      if (m) k.violence();
      if (e.targetKind === 'prop') {
        for (const g of k.groups) {
          const s = g.site;
          if (!s.active || s.lit || s.barricadeId !== e.targetId) continue;
          s.lit = true;
          k.stats.barricadesLit++;
          k.emit('barricade_incendiee', g, s.x, s.z, g.a.able, e.targetId);
        }
      } else if (e.targetKind === 'vehicle' && m) {
        k.stats.vehiclesLit++;
        k.emit('vehicule_incendie', m.group, e.x, e.z, 1, e.targetId);
      }
    });
    ev.onAny('vehicles:flipped', (payload) => {
      if (!k.active) return;
      const e = payload as { id?: EntityId; x?: number; z?: number };
      if (typeof e.id !== 'number') return;
      for (const g of k.groups) {
        if (g.plan !== PLAN.FLIP || g.tId !== e.id) continue;
        k.stats.vehiclesFlipped++;
        k.violence();
        k.emit('vehicule_renverse', g, e.x ?? g.tx, e.z ?? g.tz, g.a.able, e.id);
      }
    });
  }

  // ───────────────────────────── interaction : incendier un véhicule ─────────────────────────────

  /**
   * « Incendier » un véhicule à l'arrêt (le module du décor fournit le même geste pour le mobilier et les
   * boutiques). Réservé à qui n'est ni des forces ni des secours ; dix secondes accroupi contre la
   * carrosserie ; l'embrasement lui-même appartient au module des véhicules.
   */
  private vehicleArson(): InteractionHandler {
    const k = this.k;
    const opt: InteractionOption = { verb: 'incendier', targetKind: 'vehicle', targetId: 0, label: '', priority: 5, duration: 10, x: 0, z: 0 };
    const allowed = (a: Person): boolean =>
      a.faction === 'protest' && a.custody === 'free' && a.heldBy === 0 && a.vehicleId === 0 && a.posture !== 'down' && a.carrying === 0;
    return {
      verb: 'incendier',
      find(a: Person, targetId?: EntityId): InteractionOption | null {
        if (!k.vehExt || !allowed(a)) return null;
        // proposé sur désignation seulement (IA, ou invite du joueur visant le véhicule)
        if (targetId === undefined || targetId === 0) return null;
        const v = k.ctx.vehicles.get(targetId);
        if (!v || v.dormant || v.def.flying || v.burning > 0.05 || v.state === 'burnt' || v.state === 'burning') return null;
        if (Math.abs(v.speed) > 0.5 || Math.hypot(v.x - a.x, v.z - a.z) > v.def.length * 0.5 + 2) return null;
        opt.targetId = v.id;
        opt.label = 'Incendier — ' + v.def.name;
        opt.x = v.x;
        opt.z = v.z;
        return opt;
      },
      begin(a: Person, o: InteractionOption): boolean {
        const v = k.ctx.vehicles.get(o.targetId);
        if (!v || !allowed(a) || v.burning > 0.05) return false;
        a.upper = 'pickup';
        a.upperT = 0;
        return true;
      },
      tick(a: Person, o: InteractionOption): boolean {
        const v = k.ctx.vehicles.get(o.targetId);
        return !!v && v.burning <= 0.05 && Math.abs(v.speed) < 1 && allowed(a);
      },
      complete(a: Person, o: InteractionOption): void {
        if (a.upper === 'pickup') a.upper = 'none';
        const v = k.ctx.vehicles.get(o.targetId);
        if (!v || !k.vehExt) return;
        if (k.vehExt.ignite(v, a.id)) k.ctx.law.recordOffense(a, 'incendie', v.x, v.z, 4);
      },
      cancel(a: Person): void {
        if (a.upper === 'pickup') a.upper = 'none';
      },
    };
  }

  // ───────────────────────────── vues ─────────────────────────────

  private groupViews(): readonly RadicalGroupView[] {
    const k = this.k;
    const tick = this.ctx.clock.tick;
    if (this.viewsFor === tick) return this.views;
    this.viewsFor = tick;
    const out = this.views;
    out.length = 0;
    for (const g of k.groups) {
      // les groupes dissous ne sont plus présentés
      if (g.members.length === 0) continue;
      let able = 0;
      for (const m of g.members) if (isAble(m)) able++;
      out.push({
        id: g.id, squadId: g.squadId, name: g.name, leaderId: g.leader ? g.leader.p.id : 0, size: able, strength: g.size0,
        followers: g.followers.length, morale: g.morale, cohesion: g.cohesion, plan: PLAN_NAMES[g.plan]!, x: g.ax, z: g.az,
        heading: Math.atan2(g.hx, g.hz), ammo: g.ammo, inBlack: g.black, ratio: g.a.ratio,
      });
    }
    return out;
  }
}
