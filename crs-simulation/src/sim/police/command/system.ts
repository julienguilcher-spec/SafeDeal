/* =====================================================================================
 * COMMANDEMENT — système (ordre SystemOrder.CONTROL + 5 : juste après l'IA des unités).
 *
 * Chaque pas : unités spéciales (gestes continus à chaque pas, réflexion quatre fois par seconde),
 * convois (deux fois par seconde) ; une fois par seconde : tableau de situation, prise de
 * commandement automatique, réflexion de chaque commandant (décalée d'une compagnie à l'autre),
 * propositions de l'adjoint. Aucune réflexion n'est faite pour chaque personne : le coût ne dépend
 * pas de la taille de la foule, sauf les comptages spatiaux des points chauds (quelques-uns par seconde).
 * ===================================================================================== */

import type { GameContext, GameSystem, Person, Squad, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { BARRAGE_EVENT, IN_PLACE_EVENT, ORDER_DONE_EVENT } from '../api';
import type { PoliceOrderDone, UnitHandle } from '../api';
import { Adjoint } from './adjoint';
import {
  COMMAND_POST_SERVICE, COMMAND_SYSTEM_ID, CROWD_SIGNAL_EVENT, POLICE_COMMAND_SERVICE,
} from './api';
import type {
  AssumeOptions, CommandApi, CommandMode, CommandPost, CommandState, CortegeSource, CrowdSignal, DroneTeamOptions,
} from './api';
import { BravmUnit, isBravmGroup } from './bravm';
import { CanonUnit, isCanon } from './canon';
import { CentaureUnit, isCentaure } from './centaure';
import { Command } from './command';
import { ConvoyControl } from './convoy';
import { CommandCore } from './core';
import { Delegation } from './delegate';
import { DroneUnit, isDroneTeam } from './drone';
import { Picture } from './picture';
import { Reaction } from './react';
import { SpecialRegistry } from './special';
import { OBSTACLE_SERVICE, ObstacleDesk } from './obstacle';
import { onMetroWave } from './sustain';
import * as TX from './texts';

/** Un barrage renforcé (ou une unité envoyée en renfort) ne redemande pas de renfort avant ce délai (s). */
const REINFORCE_MEMORY = 600;

const HOSTILE_PROJECTILES: Readonly<Record<string, number>> = { pave: 0.25, bouteille: 0.25, molotov: 0.7, mortier: 0.5, oeuf_peinture: 0.1, debris: 0.15 };

export class CommandSystem implements GameSystem {
  readonly id = COMMAND_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL + 5;

  readonly core = new CommandCore();
  readonly pic = new Picture(this.core);
  readonly specials = new SpecialRegistry(this.core);
  readonly convoy = new ConvoyControl(this.core);
  readonly adjoint = new Adjoint(this.core);
  readonly delegation = new Delegation(this.core, this.pic);
  readonly commands: Command[] = [];
  /** Véhicule qui barre la voie du joueur : Centaure à faire venir, proposition de l'adjoint, demande radio. */
  readonly obstacle = new ObstacleDesk(this.core, () => this.specials.list, (sp): sp is CentaureUnit => sp instanceof CentaureUnit, this.adjoint, () => this.playerCommand());
  private readonly reactions: Reaction[] = [];
  private readonly states: CommandState[] = [];
  private ctx!: GameContext;
  private hooked = false;
  private secondAt = 0;
  private forcedMode: CommandMode | 'aucun' | '' = '';
  private readonly members: Person[] = [];
  /** Compagnies chargées d'une autre manifestation que la principale : cortège suivi. */
  private readonly sources = new Map<number, CortegeSource>();
  /** Barrages incomplets déjà renforcés et unités envoyées en renfort : instant du renfort. */
  private readonly reinforced = new Map<number, number>();
  /** Coût du dernier pas (ms), pour les mesures. */
  lastStepMs = 0;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const core = this.core;
    core.bind(ctx);
    const self = this;
    const api: CommandApi = {
      tuning: core.tuning,
      assume: (id, options) => this.assume(id, options) !== null,
      release: (id) => this.release(id),
      assignCortege: (id, source) => {
        if (this.indexOf(id) < 0) return false;
        if (source) this.sources.set(id, source);
        else this.sources.delete(id);
        return true;
      },
      stateOf: (id) => {
        const c = this.commandOf(id);
        return c ? c.state : null;
      },
      commands: this.states,
      attach: (companyId, unitId) => {
        const c = this.commandOf(companyId);
        if (c && c.attached.indexOf(unitId) < 0) c.attached.push(unitId);
      },
      escort: (centaureId, footId) => {
        this.specials.scan(true);
        const sp = this.specials.of(centaureId);
        if (sp instanceof CentaureUnit) sp.escortId = footId;
      },
      endMission: (id) => {
        const c = this.commandOf(id);
        if (c) c.endRequested = true;
      },
      pin: (id, on) => {
        if (on) core.pinned.add(id);
        else core.pinned.delete(id);
        if (on) for (let i = 0; i < this.commands.length; i++) this.commands[i].dropPinned();
      },
      requestSommation: (id, x, z) => {
        const i = this.indexOf(id);
        return i >= 0 && this.reactions[i].start(x, z, 0, true);
      },
      hotspots: this.pic.spots,
      observations: this.pic.observations,
      decisions: core.decisions,
      proposals: this.adjoint.proposals,
      accept: (id) => this.adjoint.accept(id),
      dismiss: (id) => this.adjoint.dismiss(id),
      createDroneTeam: (options) => this.createDroneTeam(options),
      special: (id) => {
        this.specials.scan(true);
        const sp = this.specials.of(id);
        return sp ? sp.status : null;
      },
      specials: this.specials.statuses,
      arrive: (id, dest) => this.convoy.arrive(id, dest),
      depart: (id, exit) => this.convoy.depart(id, exit),
      convoyOf: (id) => this.convoy.statusOf(id),
      takeOver: (id, order) => this.convoy.takeOver(id, order),
      carrying: (id) => this.convoy.carrying(id),
      holding: (id) => this.convoy.holding(id),
      quietRun: (id) => this.convoy.quietRun(id),
    };
    const post: CommandPost = {
      get atVehicle(): boolean { return self.postState(0); },
      get vehicleId(): number { return self.postVehicle() ? self.postVehicle()!.id : 0; },
      get lost(): boolean { return self.postState(1); },
      get commanderId(): number { const p = self.postCommander(); return p ? p.id : 0; },
    };
    ctx.provide(POLICE_COMMAND_SERVICE, api);
    ctx.provide(COMMAND_POST_SERVICE, post);
    ctx.provide(OBSTACLE_SERVICE, this.obstacle.api);
    // reconnaissance des unités spéciales
    this.specials.register((s) => (isCentaure(core, s) ? new CentaureUnit(core, this.pic, s) : null));
    this.specials.register((s) => (isCanon(core, s) ? new CanonUnit(core, this.pic, s) : null));
    this.specials.register((s) => (isBravmGroup(core, s) ? new BravmUnit(core, this.pic, s) : null));
    this.specials.register((s) => {
      if (s.members.length === 0 || s.members.length > 4) return null;
      this.members.length = 0;
      for (let i = 0; i < s.members.length; i++) {
        const p = ctx.people.get(s.members[i]);
        if (p) this.members.push(p);
      }
      return isDroneTeam(core, s, this.members) ? new DroneUnit(core, this.pic, s) : null;
    });
  }

  init(ctx: GameContext): void {
    const core = this.core;
    core.resolve();
    this.hook();
    const ev = ctx.events;
    ev.on('session:started', ({ config }) => {
      core.rng = ctx.rng.fork('police.command');
      core.resolve();
      this.hook();
      const extra = config.extra ?? {};
      const mode = extra['commandement'];
      this.forcedMode = mode === 'ia' ? 'ia' : mode === 'joueur' ? 'adjoint' : mode === 'aucun' ? 'aucun' : '';
      const apt = Number(extra['commandement.aptitude']);
      if (Number.isFinite(apt)) core.tuning.aptitude = Math.max(0, Math.min(1, apt));
      const adj = Number(extra['commandement.adjoint']);
      if (extra['commandement.adjoint'] !== undefined && Number.isFinite(adj)) core.tuning.adjointInterval = Math.max(0, adj);
    });
    ev.onAny(IN_PLACE_EVENT, (payload) => {
      const e = payload as { squadId: number };
      for (let i = 0; i < this.commands.length; i++) this.commands[i].onInPlace(e.squadId);
    });
    ev.onAny(ORDER_DONE_EVENT, (payload) => {
      const e = payload as PoliceOrderDone;
      this.specials.onPoliceDone(e);
      this.convoy.onPoliceDone(e.squadId, e.type);
      for (let i = 0; i < this.commands.length; i++) {
        this.delegation.onOrderDone(e, this.commands[i]);
        this.commands[i].onOrderDone(e);
      }
    });
    // rue barrée trop large pour l'unité qui la tient : renfort proposé (adjoint, touche P) ou envoyé (IA)
    ev.onAny(BARRAGE_EVENT, (payload) => {
      const e = payload as { squadId: number; state: string; x: number; z: number };
      if (e.state !== 'incomplet') return;
      for (let i = 0; i < this.commands.length; i++) this.reinforce(this.commands[i], e.squadId, e.x, e.z);
    });
    ev.on('order:issued', (e) => {
      // ordre du joueur (d'où qu'il vienne : carte, terrain, proposition acceptée, « avec moi ») : la colonne où roule
      // l'unité le laisse s'exécuter — elle la libère ou l'emporte jusqu'à l'arrêt (convoy.ts takeOver)
      if (e.order.byPlayer) this.convoy.takeOver(e.squadId, e.order);
      // ordre du joueur-commandant : le dispositif conseillé en tient compte
      const pid = ctx.player.state.personId;
      if (pid === 0 || e.order.issuedBy !== pid) return;
      for (let i = 0; i < this.commands.length; i++) {
        const c = this.commands[i];
        if (!c.ia && core.isUnder(e.squadId, c.squad.id)) c.onPlayerOrder(e.squadId, e.order);
      }
    });
    // ── faits qui nourrissent le tableau de situation ──
    ev.on('projectile:spawned', (e) => {
      const w = HOSTILE_PROJECTILES[e.kind];
      if (w === undefined) return;
      const owner = e.ownerId !== 0 ? ctx.people.get(e.ownerId) : undefined;
      if (!owner || owner.faction === 'police') return;
      this.pic.note('violences', owner.x, owner.z, w, false, ctx.law.roe.underAttack);
    });
    ev.on('person:hurt', (e) => {
      const victim = ctx.people.get(e.id);
      const src = e.info.sourceId !== 0 ? ctx.people.get(e.info.sourceId) : undefined;
      if (!victim || victim.faction !== 'police' || !src || src.faction === 'police') return;
      this.pic.note('violences', src.x, src.z, 0.5, true, true);
    });
    ev.on('person:down', (e) => {
      const p = ctx.people.get(e.id);
      if (!p || p.faction === 'police') return;
      if (e.injury === 'serious' || e.injury === 'critical') this.delegation.detect('blesse', p.x, p.z, 'person', p.id, e.injury === 'critical' ? 3 : 2);
    });
    ev.on('shop:window', (e) => {
      if (e.state !== 'broken' && e.state !== 'cracked') return;
      const shop = ctx.props.shop(e.id);
      const by = e.byId !== 0 ? ctx.people.get(e.byId) : undefined;
      if (!shop || (by && by.faction === 'police')) return;
      this.pic.note('casse', shop.x, shop.z, e.state === 'broken' ? 0.45 : 0.25, false);
    });
    ev.on('shop:looted', (e) => {
      const shop = ctx.props.shop(e.id);
      if (!shop) return;
      this.pic.note('casse', shop.x, shop.z, 0.4, false);
      this.delegation.detect('pillage', shop.x, shop.z, 'shop', shop.id, 2);
    });
    ev.on('fire:started', (e) => {
      if (e.targetKind === 'person') return;
      this.pic.note('feu', e.x, e.z, 0.5, false);
      let kind: 'feu_poubelle' | 'feu_barricade' | 'feu_vehicule' | 'feu_boutique' = 'feu_poubelle';
      if (e.targetKind === 'vehicle') kind = 'feu_vehicule';
      else if (e.targetKind === 'shop') kind = 'feu_boutique';
      else if (e.targetKind === 'prop') {
        const prop = ctx.props.get(e.targetId);
        if (prop && prop.kind === 'barricade') kind = 'feu_barricade';
      }
      this.delegation.detect(kind, e.x, e.z, e.targetKind === 'ground' ? 'place' : e.targetKind, e.targetId, kind === 'feu_poubelle' ? 1 : 2);
    });
    ev.on('barricade:built', (e) => {
      this.pic.note('barricade', e.x, e.z, 0.6, false);
      this.delegation.detect('barricade', e.x, e.z, 'prop', e.id, 2);
    });
    ev.onAny('crowd:density', (payload) => {
      const e = payload as { level: string; x: number; z: number };
      if (e && e.level !== 'fin') this.pic.note('compression', e.x, e.z, e.level === 'danger' ? 1 : 0.5, false);
    });
    ev.onAny(CROWD_SIGNAL_EVENT, (payload) => this.pic.signal(payload as CrowdSignal, false));
    ev.onAny('crowd:alea', (payload) => {
      const e = payload as { gravity: number; stage: string; x: number; z: number };
      if (e && e.stage === 'debut' && e.gravity >= 1) this.pic.note('groupe_hostile', e.x, e.z, 0.2 * e.gravity, false);
    });
    // foyer secondaire annoncé par CENTRAL (rassemblement sauvage, casseurs, blocage) : connu d'emblée
    ev.onAny('crowd:foyer', (payload) => {
      const e = payload as { kind: string; state: string; x: number; z: number };
      if (e && e.state === 'debut') this.pic.note(e.kind === 'casseurs' ? 'casse' : 'groupe_hostile', e.x, e.z, e.kind === 'casseurs' ? 0.5 : 0.3, true);
    });
    ev.onAny('crowd:metro', (payload) => {
      const e = payload as { type: string; stationId: number; count: number };
      if (!e || e.type !== 'vague') return;
      for (let i = 0; i < this.commands.length; i++) onMetroWave(this.commands[i], e.stationId, e.count);
    });
    ev.onAny('vehicles:cleared', (payload) => {
      const e = payload as { vehicleId: number; propId: number };
      for (let i = 0; i < this.specials.list.length; i++) {
        const sp = this.specials.list[i];
        if (sp instanceof CentaureUnit) sp.onNotifyCleared(e.vehicleId, e.propId);
      }
    });
  }

  reset(): void {
    this.core.reset();
    this.pic.reset();
    this.specials.reset();
    this.convoy.reset();
    this.adjoint.reset();
    this.obstacle.reset();
    this.delegation.reset();
    this.commands.length = 0;
    this.reactions.length = 0;
    this.states.length = 0;
    this.sources.clear();
    this.reinforced.clear();
    this.secondAt = 0;
    this.forcedMode = '';
    this.hook();
  }

  /** Branche le crochet d'ordres du module de police (s'il est là). */
  private hook(): void {
    const pk = this.core.pk;
    if (!pk || (this.hooked && pk.orderHook !== null)) return;
    pk.orderHook = (u, o) => this.specials.hook(u.squad, o);
    this.hooked = true;
  }

  // ───────────────────────────── commandement ─────────────────────────────

  /** Renfort d'un barrage incomplet : un élément disponible vient barrer la rue juste derrière la ligne. */
  private reinforce(c: Command, squadId: number, x: number, z: number): void {
    const el = c.elementOver(squadId);
    if (!el) return;
    // poste du dispositif que le commandant (IA) a lui-même dimensionné, ou sa réserve en attente : il garde ses
    // moyens pour l'action
    if (c.ia && (el.role === 'poste' || el.role === 'reserve')) return;
    // un seul renfort par barrage, et un renfort ne demande pas à son tour un renfort (pas de cascade d'unités
    // retirées les unes après les autres pour se renforcer mutuellement)
    const now = this.core.now;
    const was = this.reinforced.get(squadId);
    if (was !== undefined && now - was < REINFORCE_MEMORY) return;
    const st = this.core.status ? this.core.status.of(squadId) : null;
    // pas une fraction de l'unité qui tient déjà le barrage (elle y est), ni l'unité qui la commande
    const res = c.available(x, z, (r) => this.core.isUnder(r.squadId, squadId) || this.core.isUnder(squadId, r.squadId));
    if (!res) return;
    const name = this.ctx.squads.get(squadId)?.name ?? el.name;
    const h = st ? st.heading : 0;
    const bx = x - Math.sin(h) * 3;
    const bz = z - Math.cos(h) * 3;
    const sector = this.core.sector(x, z);
    c.act('renfort:' + squadId, 2, bx, bz, TX.propose(name + ' : largeur insuffisante' + (sector !== '' ? ', ' + sector : ''), 'd’envoyer ' + res.name + ' en renfort sur le barrage'), () => {
      this.reinforced.set(squadId, this.core.now);
      this.reinforced.set(res.squadId, this.core.now);
      c.order(res, 'renfort', { type: 'couper_circulation', x: bx, z: bz, heading: h, width: 0 }, TX.orderBarrage(res.name, c.squad.name, sector, h, true));
    });
  }

  private indexOf(squadId: number): number {
    for (let i = 0; i < this.commands.length; i++) if (this.commands[i].squad.id === squadId) return i;
    return -1;
  }

  /** Commandement tenu par le joueur (mode adjoint) dont il fait partie, ou null (exécutant, commandant IA). */
  private playerCommand(): Command | null {
    const me = this.ctx.player.person();
    if (!me) return null;
    for (let i = 0; i < this.commands.length; i++) {
      const c = this.commands[i];
      if (c.ia) continue;
      if (c.squad.leaderId === me.id || (me.squadId !== 0 && this.core.isUnder(me.squadId, c.squad.id))) return c;
    }
    return null;
  }

  private commandOf(squadId: number): Command | null {
    const i = this.indexOf(squadId);
    return i >= 0 ? this.commands[i] : null;
  }

  private assume(squadId: number, options?: AssumeOptions): Command | null {
    const core = this.core;
    const ctx = this.ctx;
    const squad = ctx.squads.get(squadId);
    if (!squad || squad.faction !== 'police') return null;
    const existing = this.indexOf(squadId);
    if (existing >= 0) {
      if (!options || options.mode === undefined || options.mode === this.commands[existing].state.mode) return this.commands[existing];
      this.release(squadId);
    }
    const leader = core.leader(squad);
    let mode: CommandMode = leader && leader.isPlayer ? 'adjoint' : 'ia';
    if (this.forcedMode === 'ia' || this.forcedMode === 'adjoint') mode = this.forcedMode;
    if (options && options.mode) mode = options.mode;
    // l'IA ne commande jamais à la place d'un joueur qui incarne le commandant
    if (leader && leader.isPlayer) mode = 'adjoint';
    const aptitude = options && options.aptitude !== undefined ? Math.max(0, Math.min(1, options.aptitude)) : core.tuning.aptitude;
    const cmd = new Command(core, this.pic, this.specials, this.convoy, this.adjoint, squad, mode, aptitude);
    if (options && options.base) cmd.base = { x: options.base.x, z: options.base.z };
    cmd.thinkAt = core.now + 0.2 + (this.commands.length % 5) * 0.2;
    this.commands.push(cmd);
    this.reactions.push(new Reaction(core, this.pic, cmd));
    this.states.push(cmd.state);
    this.pic.reportDelay = 2 + 10 * (1 - aptitude);
    this.autoAttach();
    return cmd;
  }

  private release(squadId: number): void {
    const i = this.indexOf(squadId);
    if (i < 0) return;
    this.adjoint.clear(this.commands[i]);
    this.commands.splice(i, 1);
    this.reactions.splice(i, 1);
    this.states.splice(i, 1);
    this.sources.delete(squadId);
  }

  /** Prise de commandement automatique des compagnies ; rattachement des moyens spéciaux sans compagnie. */
  private autoAssume(): void {
    const core = this.core;
    if (!core.tuning.autoAssume || this.forcedMode === 'aucun') return;
    const squads = this.ctx.squads.list;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i];
      if (s.kind !== 'compagnie' || s.faction !== 'police' || s.leaderId === 0 || this.indexOf(s.id) >= 0) continue;
      this.assume(s.id);
    }
    this.autoAttach();
  }

  private autoAttach(): void {
    if (this.commands.length === 0) return;
    const first = this.commands[0];
    const taken = (id: number): boolean => {
      for (let i = 0; i < this.commands.length; i++) if (this.commands[i].attached.indexOf(id) >= 0) return true;
      return false;
    };
    const list = this.specials.list;
    for (let i = 0; i < list.length; i++) {
      const id = list[i].squad.id;
      if (taken(id)) continue;
      // un moyen subordonné à une compagnie lui revient ; sinon il va à la première compagnie commandée
      let owner: Command = first;
      for (let c = 0; c < this.commands.length; c++) if (this.core.isUnder(id, this.commands[c].squad.id)) owner = this.commands[c];
      owner.attached.push(id);
    }
    // pelotons sans échelon supérieur (gendarmes mobiles en renfort)
    const squads = this.ctx.squads.list;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i];
      if (s.faction !== 'police' || s.kind !== 'peloton' || s.parentId !== 0 || taken(s.id) || first.state.phase !== 'mise_en_place') continue;
      first.attached.push(s.id);
    }
  }

  private think(i: number): void {
    const src = this.sources.get(this.commands[i].squad.id);
    if (!src) {
      this.thinkOne(i);
      return;
    }
    // compagnie chargée d'une autre manifestation : le tableau de situation suit SON cortège le temps de sa réflexion
    this.pic.pushSource(src);
    try {
      this.thinkOne(i);
    } finally {
      this.pic.popSource();
    }
  }

  private thinkOne(i: number): void {
    const cmd = this.commands[i];
    const core = this.core;
    cmd.thinkAt = core.now + core.tuning.thinkInterval;
    if (this.ctx.squads.get(cmd.squad.id) !== cmd.squad) return;
    cmd.commander();
    // le joueur vient d'incarner le commandant (ou de le quitter) : l'IA s'efface ou reprend
    const leader = core.leader(cmd.squad);
    if (leader && leader.isPlayer && cmd.ia) cmd.state.mode = 'adjoint';
    else if (leader && !leader.isPlayer && !cmd.ia && this.forcedMode !== 'adjoint' && this.ctx.player.state.personId !== 0
      && this.ctx.player.state.role !== 'commandant' && this.ctx.player.state.role !== 'commissaire') cmd.state.mode = 'ia';
    switch (cmd.state.phase) {
      case 'arrivee':
      case 'mise_en_place':
        if (cmd.thinkDeploy()) cmd.setPhase('conduite');
        else if (cmd.engaged && cmd.state.phase === 'mise_en_place') {
          // la mise en place n'attend pas : un incident ou un trouble se traite dès que les ordres sont partis
          this.reactions[i].update();
          this.delegation.update(cmd);
        }
        break;
      case 'conduite':
        cmd.thinkConduct();
        if (cmd.state.phase === 'conduite') {
          this.reactions[i].update();
          this.delegation.update(cmd);
        }
        break;
      case 'fin':
        cmd.thinkFinish();
        break;
      default:
        break;
    }
  }

  // ───────────────────────────── poste du commandant ─────────────────────────────

  private postCommander(): Person | null {
    const player = this.ctx.player.person();
    for (let i = 0; i < this.commands.length; i++) {
      const c = this.commands[i];
      const p = this.core.leader(c.squad);
      if (p && (p === player || !player || this.commands.length === 1)) return p;
    }
    return this.commands.length > 0 ? this.core.leader(this.commands[0].squad) : null;
  }

  private postVehicle(): Vehicle | null {
    const p = this.postCommander();
    if (!p) return null;
    const squad: Squad | undefined = this.ctx.squads.get(p.squadId);
    const v = squad && squad.vehicleId !== 0 ? this.ctx.vehicles.get(squad.vehicleId) : undefined;
    return v ?? null;
  }

  /** 0 : commandant au véhicule de commandement ; 1 : poste perdu. */
  private postState(what: number): boolean {
    const v = this.postVehicle();
    if (what === 1) return v !== null && !this.core.usable(v);
    const p = this.postCommander();
    if (!v || !p || !this.core.usable(v)) return false;
    if (p.vehicleId === v.id) return true;
    const reach = 8 + v.def.length * 0.5;
    return (p.x - v.x) * (p.x - v.x) + (p.z - v.z) * (p.z - v.z) <= reach * reach;
  }

  // ───────────────────────────── équipe du drone ─────────────────────────────

  private createDroneTeam(options: DroneTeamOptions = {}): UnitHandle {
    const ctx = this.ctx;
    const cfg = ctx.session.config;
    const x = options.x ?? (cfg && cfg.x !== undefined ? cfg.x : 0);
    const z = options.z ?? (cfg && cfg.z !== undefined ? cfg.z : 0);
    const heading = options.heading ?? 0;
    const squad = ctx.squads.create('equipage', 'police', options.callsign ?? 'ICARE', options.parentId ?? 0);
    const pilot = ctx.archetypes.spawn('telepilote', x, z, { poste: 'telepilote', rank: 'brigadier_chef', faction: 'police', squadId: squad.id, heading, seed: 9101 });
    const operator = ctx.archetypes.spawn('telepilote', x - Math.cos(heading) * 1.1, z + Math.sin(heading) * 1.1, {
      poste: 'operateur', rank: 'gardien', faction: 'police', squadId: squad.id, heading, seed: 9102,
    });
    for (const p of [pilot, operator]) if (p.squadId !== squad.id) ctx.squads.addMember(squad.id, p.id);
    ctx.squads.setLeader(squad.id, pilot.id);
    if (ctx.actions.def('telecommande_drone') !== undefined && ctx.actions.has(pilot, 'telecommande_drone') === 0) ctx.actions.give(pilot, 'telecommande_drone');
    this.specials.scan(true);
    const sp = this.specials.of(squad.id);
    if (sp instanceof DroneUnit && options.deploy === false) sp.wantsFlight = false;
    return { squad, sections: [], groups: [], people: [pilot, operator], vehicles: [], leader: pilot };
  }

  // ───────────────────────────── boucle ─────────────────────────────

  update(dt: number): void {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const core = this.core;
    const now = this.ctx.clock.now;
    core.now = now;
    core.dt = dt;
    if (!this.hooked) {
      if (!core.pk) core.resolve();
      this.hook();
    }
    this.specials.scan();
    this.specials.think();
    this.convoy.update();
    if (now >= this.secondAt) {
      this.secondAt = now + 1;
      this.pic.refreshCortege();
      this.pic.update(1);
      this.autoAssume();
      this.obstacle.update();
    }
    for (let i = 0; i < this.commands.length; i++) if (now >= this.commands[i].thinkAt) this.think(i);
    this.adjoint.update();
    if (t0 !== 0) this.lastStepMs = performance.now() - t0;
  }
}
