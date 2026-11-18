/* =====================================================================================
 * Cœur du module de commandement : étendue du commandement (mise en cache), émission des ordres
 * par ctx.squads.issue avec compte rendu radio, contrôle du niveau de force, accès aux services
 * étendus (tous facultatifs). Partagé par la carte tactique, la roue d'ordres, la radio et le HUD.
 * ===================================================================================== */

import type { ForceLevel, GameContext, OrderType, Person, RoadSample, Squad } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, MetroApi, RescueApi, TrafficControlApi, UiKit } from '@/core/extensions';
import type { MapsRuntime } from '../maps/runtime';
import type { CommandApi, CommandScope, IssuedOrder } from './api';
import { issueObstacle } from './obstacleOrder';
import { BARRAGE_LET_PASSERSBY, forceWord, verbOf } from './orders';
import type { OrderGeom, OrderVerb } from './orders';
import { orderPhrase } from './phrases';
import { computeScope } from './scope';
import { isPoliceRole } from '../maps/visibility';
import type { FollowApi } from '@/gameplay/session/follow';
import type { NasseProposal } from './nasse';
import { LegalChain } from './legalChain';
import { cardEnvFromCore } from './reperes';
import { coreLegalDeps } from './sendLine';

const ISSUED_MAX = 50;
/** Distance (m) au-delà de laquelle un ordre de mouvement se fait en véhicules ; ordres concernés. */
const MOTOR_DISTANCE = 250;
const MOTOR_AUTO: ReadonlySet<string> = new Set(['colonne', 'avancer', 'tenir', 'ligne', 'proteger', 'encercler', 'couper_circulation', 'filtrer', 'repli']);
const SCOPE_PERIOD = 0.5;
/** Service des ordres « me suivre » (gameplay/session/follow.ts, FOLLOW_SERVICE). */
const FOLLOW_SERVICE = 'session.follow';
/**
 * Ordres « Me suivre à pied » / « Me suivre en colonne (véhicules) » : tout policier les donne, même sans autorité de
 * commandement (CRS, BRAV-M, équipage d'engin, télépilote) — à son unité, et avec elle à la colonne de sa compagnie quand
 * il prend le volant (session/follow.ts). Demande du commanditaire : « l'ordre suivre en colonne ou suivre à pied,
 * tu ne l'as pas mis ».
 */
export const FOLLOW_ORDERS: ReadonlySet<string> = new Set(['suivre_pied', 'avec_moi']);

export interface IssueResult {
  ok: boolean;
  /** Motif du refus (affiché au joueur) quand ok est faux. */
  reason: string;
  count: number;
}

export class CommandCore implements CommandApi {
  readonly issued: IssuedOrder[] = [];
  /** Plafond de force appliqué aux ordres du joueur (borné par la force autorisée au moment de l'ordre). */
  orderForce: ForceLevel = 4;
  /**
   * Proposition « Fermer la nasse » en attente (carte tactique) : montrée sur la carte, exécutée par Entrée sur la carte
   * ou par P (comme une proposition de l'adjoint), écartée par Échap ou Maj + P. Propre à la session.
   */
  nasse: NasseProposal | null = null;
  /**
   * Chaîne légale confirmée en S3 (« Faire les étapes dans l'ordre ») : sommations, autorisation, délai, puis l'ordre.
   * Avancée par CommandSystem.update, carte fermée comprise ; oubliée à chaque nouvelle session.
   */
  readonly legalChain: LegalChain = new LegalChain(coreLegalDeps(this, () => cardEnvFromCore(this)));
  private scope_: CommandScope | null = null;
  private scopeAt = -1e9;

  constructor(readonly ctx: GameContext, readonly maps: MapsRuntime, public kit: UiKit | undefined) {}

  /**
   * Engage une unité d'un commissariat (module des commissariats, qui fournit cette méthode) : elle quitte le poste et
   * passe sous les ordres du joueur ; l'ordre de la fiche lui est donné dans le même pas (sendLine.ts). Absente : les
   * lignes de renfort ne sont pas proposées.
   */
  engageFromCommissariat?(entryId: number): { ok: boolean; squadId: number; reason: string };

  // ───────────────────────────── services facultatifs ─────────────────────────────

  get incidents(): IncidentsApi | undefined {
    return this.ctx.service<IncidentsApi>(EXT.incidents);
  }

  get traffic(): TrafficControlApi | undefined {
    return this.ctx.service<TrafficControlApi>(EXT.traffic);
  }

  get metro(): MetroApi | undefined {
    return this.ctx.service<MetroApi>(EXT.metro);
  }

  get rescue(): RescueApi | undefined {
    return this.ctx.service<RescueApi>(EXT.rescue);
  }

  // ───────────────────────────── joueur, étendue ─────────────────────────────

  player(): Person | null {
    const id = this.ctx.player.state.personId;
    return id !== 0 ? this.ctx.people.get(id) ?? null : null;
  }

  /** Étendue du commandement (recalculée au plus deux fois par seconde). */
  scope(): CommandScope {
    const t = this.maps.time;
    if (!this.scope_ || t - this.scopeAt > SCOPE_PERIOD) {
      this.scope_ = computeScope(this.ctx);
      this.scopeAt = t;
    }
    return this.scope_;
  }

  invalidateScope(): void {
    this.scope_ = null;
  }

  canCommand(squadId: number): boolean {
    return squadId > 0 && this.scope().squadIds.has(squadId);
  }

  /**
   * Unité à qui s'adressent les ordres « me suivre » du joueur policier : celle qu'il commande ; sans autorité de
   * commandement, la sienne (null hors police, ou sans unité).
   */
  followUnit(): Squad | null {
    const p = this.player();
    if (!p || p.faction !== 'police' || !isPoliceRole(this.ctx.player.state.role)) return null;
    const sc = this.scope();
    const id = sc.level !== 'lecture' && sc.ownSquadId !== 0 ? sc.ownSquadId : p.squadId;
    const s = id !== 0 ? this.ctx.squads.get(id) : undefined;
    return s && s.faction === 'police' ? s : null;
  }

  /** Ordre « me suivre » du joueur à son unité (roue d'ordres, actions rapides) : `column` en colonne de véhicules. */
  callFollow(column: boolean): IssueResult {
    const unit = this.followUnit();
    if (!unit) return { ok: false, reason: 'Aucune unité avec vous\u00a0: personne à qui donner cet ordre.', count: 0 };
    return this.issue(column ? 'avec_moi' : 'suivre_pied', [unit], null);
  }

  /** Indicatif de celui qui parle à la radio : son unité, à défaut son nom. */
  callsign(): string {
    const p = this.player();
    const sc = this.scope();
    const own = sc.ownSquadId !== 0 ? this.ctx.squads.get(sc.ownSquadId) : p && p.squadId !== 0 ? this.ctx.squads.get(p.squadId) : undefined;
    if (own) return own.name;
    return p ? p.name : 'UNITÉ';
  }

  /** Force maximale transmise avec un ordre : plafond du joueur, borné par l'autorisation en vigueur. */
  effectiveForce(): ForceLevel {
    const authorized = this.ctx.law.roe.authorizedForce;
    return (this.orderForce < authorized ? this.orderForce : authorized) as ForceLevel;
  }

  /**
   * Un ordre de ce type peut-il partir ? Refusé si l'unité n'est pas sous les ordres du joueur ou si
   * la force qu'il suppose dépasse le niveau autorisé (hors riposte à des violences contre l'unité).
   */
  check(verb: OrderVerb): { ok: boolean; reason: string; warning: string } {
    const roe = this.ctx.law.roe;
    // sans autorité : seuls les ordres « me suivre » à sa propre unité
    if (this.scope().level === 'lecture' && !(FOLLOW_ORDERS.has(verb.type) && this.followUnit())) {
      return { ok: false, reason: 'Lecture seule\u00a0: vous ne donnez pas d’ordre.', warning: '' };
    }
    if (verb.force > roe.authorizedForce && !roe.underAttack) {
      return {
        ok: false, warning: '',
        reason: `Refusé\u00a0: «\u00a0${verb.plain}\u00a0» demande\u00a0: ${forceWord(verb.force)}\u00a0; la force autorisée n’est que\u00a0: ${forceWord(roe.authorizedForce)}.`,
      };
    }
    let warning = '';
    if (verb.coercive && roe.sommation < 3 && !roe.underAttack) {
      warning = 'Emploi de la force avant la dernière sommation\u00a0: l’ordre part, vous en répondrez.';
    }
    return { ok: true, reason: '', warning };
  }

  /**
   * Donne un ordre à des unités. `geoms[i]` s'applique à `squads[i]` ; un seul élément = le même pour
   * toutes. L'ordre part par ctx.squads.issue, est tracé dans `issued` et annoncé à la radio.
   */
  issue(type: OrderType, squads: readonly Squad[], geoms: readonly OrderGeom[] | null, targetId = 0, targetName = ''): IssueResult {
    const verb = verbOf(type);
    if (!verb) return { ok: false, reason: `Ordre inconnu\u00a0: ${String(type)}`, count: 0 };
    const chk = this.check(verb);
    if (!chk.ok) return { ok: false, reason: chk.reason, count: 0 };
    // « Dégager l'obstacle » : c'est un Centaure qui pousse (le désigné, sinon le plus proche sous vos ordres)
    if (type === 'degager_obstacle') return issueObstacle(this, squads, geoms);
    const ctx = this.ctx;
    const playerId = ctx.player.state.personId;
    const maxForce = this.effectiveForce();
    const follow = FOLLOW_ORDERS.has(type) ? this.followUnit() : null;
    // sans autorité, le joueur parle en son nom à son unité (« MISTRAL 1 ALFA ICI GARDIEN … »)
    const from = follow && this.scope().level === 'lecture' ? this.player()!.name : this.callsign();
    let count = 0;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i]!;
      if (!this.canCommand(s.id) && !(follow && follow.id === s.id)) continue;
      const g = geoms ? geoms[geoms.length === 1 ? 0 : i] : undefined;
      // un nouvel ordre annule celui qui attendait le débarquement d'une colonne précédente (motorize le repose au besoin)
      this.afterConvoy.delete(s.id);
      // voiture de patrouille (Police secours, BAC) : elle roule déjà, elle se rend elle-même sur le point en urgence
      // (service 'police.patrols') — ni colonne, ni débarquement ; « Faire mouvement » vaut « Avancer jusqu'à »
      // « Me suivre en colonne (véhicules) » / « Me suivre à pied » (session/follow.ts)
      if (type === 'avec_moi' || type === 'suivre_pied') {
        if (this.callWithMe(s, from, type === 'avec_moi')) count++;
        continue;
      }
      // tout autre ordre : l'unité quitte la colonne du joueur (ses véhicules cessent de le suivre)
      this.follow?.release(s.id);
      const patrol = this.isPatrol(s.id);
      const t: OrderType = patrol && type === 'faire_mouvement' ? 'avancer' : type;
      // mouvement motorisé : demandé (« Faire mouvement ») ou implicite pour un point éloigné d'une unité qui a ses
      // véhicules — elle embarque, roule en colonne jusqu'au point, débarque, puis exécute l'ordre donné
      if (g && !patrol && (type === 'faire_mouvement' || (MOTOR_AUTO.has(type) && this.farFor(s, g.x, g.z)))) {
        // une unité dont un supérieur est aussi désigné fait partie de sa colonne
        if (squads.some((q) => q !== s && this.isAncestor(q.id, s))) { count++; continue; }
        if (this.motorize(s, type, g, from, false, targetId)) { count++; continue; }
        if (type === 'faire_mouvement') {
          ctx.ui.notify(`${s.name} n’a pas de véhicule disponible : mouvement à pied.`, 'warn', 4);
          ctx.squads.issue(s.id, { type: 'colonne', x: g.x, z: g.z, heading: g.heading, width: 0, targetId, maxForce, issuedBy: playerId });
          count++;
          continue;
        }
      }
      if (g) {
        ctx.squads.issue(s.id, {
          type: t, x: g.x, z: g.z, heading: g.heading, width: g.width, targetId, maxForce, issuedBy: playerId,
        });
      } else {
        // ordre immédiat : point et cap du chef d'unité (valeurs par défaut du magasin)
        ctx.squads.issue(s.id, { type: t, targetId, maxForce, issuedBy: playerId });
      }
      const o = s.order;
      this.trace(s, t);
      // compte rendu radio : au plus trois messages détaillés pour un ordre groupé
      if (count < 3) {
        const leader = s.leaderId !== 0 ? ctx.people.get(s.leaderId) : undefined;
        const dist = leader ? Math.hypot(o.x - leader.x, o.z - leader.z) : 0;
        ctx.radio.say({
          channel: 'commandement', from, priority: verb.coercive ? 2 : 1, personId: playerId,
          text: orderPhrase({
            type: t, unit: s.name, from, sector: g ? this.placeName(t, o.x, o.z) : '', heading: o.heading, width: o.width,
            distance: dist, target: targetName, passersby: targetId === BARRAGE_LET_PASSERSBY,
          }),
        });
      }
      count++;
    }
    if (count === 0) return { ok: false, reason: 'Aucune des unités sélectionnées n’est sous vos ordres.', count: 0 };
    if (chk.warning !== '') ctx.ui.notify(chk.warning, 'warn', 5);
    ctx.audio.play('radio_bip');
    return { ok: true, reason: '', count };
  }

  private readonly road: RoadSample = {
    edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false,
  };

  /** Lieu dit à la radio : la rue elle-même pour un barrage (« Barrez la rue, rue de Rivoli »), sinon le secteur. */
  private placeName(type: OrderType, x: number, z: number): string {
    const world = this.ctx.world;
    if ((type === 'couper_circulation' || type === 'filtrer') && world.edgeCount > 0 && world.nearestRoad(x, z, this.road, 40) && this.road.name) {
      return this.road.name;
    }
    return world.sectorName(x, z);
  }

  /** Ordre donné : tracé dans `issued`. */
  private trace(s: Squad, type: OrderType): void {
    const o = s.order;
    this.issued.push({
      squadId: s.id, type, x: o.x, z: o.z, heading: o.heading, width: o.width, targetId: o.targetId, maxForce: o.maxForce,
      t: this.ctx.clock.now,
    });
    if (this.issued.length > ISSUED_MAX) this.issued.splice(0, this.issued.length - ISSUED_MAX);
  }

  /** Voiture de patrouille gérée par le service 'police.patrols' (module gameplay/patrols) ? */
  isPatrol(squadId: number): boolean {
    const api = this.ctx.service<{ isPatrol(id: number): boolean }>('police.patrols');
    return !!api && api.isPatrol(squadId);
  }

  // ───────────────────────────── mouvement motorisé ─────────────────────────────

  /** Ordres repris au débarquement, par unité (mouvement motorisé implicite). */
  readonly afterConvoy = new Map<number, { type: OrderType; geom: OrderGeom; targetId: number }>();

  /** Le point est-il assez loin pour que l'unité s'y rende en véhicules ? */
  private farFor(s: Squad, x: number, z: number): boolean {
    const ctx = this.ctx;
    const lead = s.leaderId !== 0 ? ctx.people.get(s.leaderId) : undefined;
    const p = lead ?? (s.members.length ? ctx.people.get(s.members[0]!) : undefined);
    return !!p && Math.hypot(p.x - x, p.z - z) > MOTOR_DISTANCE;
  }

  private isAncestor(id: number, s: Squad): boolean {
    let p = s.parentId;
    for (let guard = 0; p !== 0 && guard < 8; guard++) {
      if (p === id) return true;
      p = this.ctx.squads.get(p)?.parentId ?? 0;
    }
    return false;
  }

  /**
   * Lance la colonne de l'unité vers le point (police.command.arrive) ; false si elle n'a pas de véhicule.
   * `stayAboard` : l'unité reste à bord à l'arrivée (« Me suivre en colonne » : elle rejoint le joueur, sans débarquer).
   * `targetId` : seule l'option « passants laissés passer » de « Barrer la rue » est reprise au débarquement.
   */
  private motorize(s: Squad, type: OrderType, g: OrderGeom, from: string, stayAboard = false, targetId = 0): boolean {
    const ctx = this.ctx;
    const cmd = ctx.service<{ arrive(id: number, dest: Record<string, unknown>): boolean }>('police.command');
    if (!cmd || !this.hasVehicles(s)) return false;
    const lead = ctx.people.get(s.leaderId) ?? (s.members.length ? ctx.people.get(s.members[0]!) : undefined);
    const heading = lead ? Math.atan2(g.x - lead.x, g.z - lead.z) : g.heading;
    if (!cmd.arrive(s.id, { x: g.x, z: g.z, heading, layout: 'file', boardFirst: true, stagger: true, disembark: !stayAboard })) return false;
    if (type !== 'faire_mouvement' && type !== 'colonne' && !stayAboard) {
      // l'option du barrage (passants laissés passer) vaut aussi pour l'ordre repris au débarquement
      this.afterConvoy.set(s.id, { type, geom: g, targetId: targetId === BARRAGE_LET_PASSERSBY ? targetId : 0 });
    }
    else this.afterConvoy.delete(s.id);
    ctx.radio.say({
      channel: 'commandement', from, priority: 2, personId: ctx.player.state.personId,
      text: `${s.name} ICI ${from.toUpperCase()}. Embarquez, mouvement en véhicules, deux tons, sur ${ctx.world.sectorName(g.x, g.z) || 'le point indiqué'}. PARLEZ.`,
    });
    return true;
  }

  /** Ordres « me suivre » (session/follow.ts) : null si le module de session est absent. */
  private get follow(): FollowApi | undefined {
    const f = this.ctx.service<FollowApi>(FOLLOW_SERVICE);
    return f && typeof f.column === 'function' ? f : undefined;
  }

  /**
   * « Me suivre en colonne (véhicules) » (`column`) ou « Me suivre à pied ». En colonne, l'unité embarque, se range
   * derrière le véhicule du joueur et le suit ; sans véhicule utilisable, elle le dit à la radio et suit à pied. À pied,
   * elle descend si elle est à bord, puis suit en formation. Une unité loin du joueur à pied vient d'abord en véhicules.
   */
  private callWithMe(s: Squad, from: string, column: boolean): boolean {
    const ctx = this.ctx;
    const me = ctx.player.person();
    if (!me) return false;
    const playerId = me.id;
    const follow = this.follow;
    const caller = from.toUpperCase();
    const here = { x: me.x, z: me.z, heading: me.heading, width: 0 };
    const far = me.vehicleId === 0 && this.farFor(s, me.x, me.z);
    // l'ordre est dit avant d'être exécuté : l'accusé de réception de l'unité vient après lui
    const say = (text: string): void => ctx.radio.say({ channel: 'commandement', from, priority: 1, personId: playerId, text });
    // équipage sans unité subordonnée déjà à bord du véhicule du joueur (voiture de patrouille) : pas d'ordre à la radio
    // dans l'habitacle, il reste à bord
    if (column && me.vehicleId !== 0 && s.members.length > 0 && !ctx.squads.list.some((q) => q.parentId === s.id)
      && s.members.every((id) => id === playerId || ctx.people.get(id)?.vehicleId === me.vehicleId)) {
      ctx.ui.notify(`${s.name} : l’équipage est déjà à bord avec vous.`, 'info', 4);
      return true;
    }
    if (column && follow) {
      // loin d'un joueur à pied : la colonne vient jusqu'à lui (deux tons) et y reste à bord, prête à le suivre
      if (!far) say(`${s.name} ICI ${caller}. Me suivre en colonne : embarquez, prenez place derrière mon véhicule. PARLEZ.`);
      const motorized = far && this.motorize(s, 'avec_moi', here, from, true);
      if (follow.column(s.id)) {
        this.trace(s, 'embarquer');
        return true;
      }
      if (motorized) return true;
    }
    if (column) {
      if (!follow) say(`${s.name} ICI ${caller}. Me suivre en colonne : embarquez, prenez place derrière mon véhicule. PARLEZ.`);
      // aucun véhicule utilisable : l'unité le dit, et suit à pied
      ctx.radio.say({
        channel: 'commandement', from: s.name, priority: 1, personId: s.leaderId,
        text: `${caller} ICI ${s.name}. Pas de véhicule disponible, je vous suis à pied. TERMINÉ.`,
      });
    } else {
      say(`${s.name} ICI ${caller}. Me suivre à pied : en formation derrière moi. PARLEZ.`);
    }
    follow?.release(s.id);
    if (far && this.motorize(s, 'suivre', here, from)) {
      this.afterConvoy.set(s.id, { type: 'suivre', geom: here, targetId: playerId });
      return true;
    }
    if (follow) follow.onFoot(s.id);
    else ctx.squads.issue(s.id, { type: 'suivre', targetId: playerId, issuedBy: playerId });
    this.trace(s, 'suivre');
    return true;
  }

  /** L'unité (ou une de ses subordonnées) a-t-elle un véhicule de transport ? */
  private hasVehicles(s: Squad): boolean {
    const ctx = this.ctx;
    for (const q of ctx.squads.list) {
      if (q.vehicleId === 0 || (q.id !== s.id && !this.isAncestor(s.id, q))) continue;
      const v = ctx.vehicles.get(q.vehicleId);
      if (v && !v.def.flying && v.kind !== 'moto_bravm' && v.state !== 'wrecked' && v.state !== 'burnt') return true;
    }
    return false;
  }

  /** Fin du débarquement d'une colonne : l'ordre donné est exécuté sur place. */
  onConvoyStage(squadId: number, stage: string): void {
    if (stage !== 'en_place') return;
    const next = this.afterConvoy.get(squadId);
    if (!next) return;
    this.afterConvoy.delete(squadId);
    const ctx = this.ctx;
    const g = next.geom;
    ctx.squads.issue(squadId, { type: next.type, x: g.x, z: g.z, heading: g.heading, width: g.width, targetId: next.targetId, maxForce: this.effectiveForce(), issuedBy: ctx.player.state.personId });
  }

  /** Fixe le niveau de force autorisé (autorité ou commandant) et l'annonce à la radio. */
  authorize(level: ForceLevel): boolean {
    if (!this.scope().canAuthorize) return false;
    const ctx = this.ctx;
    const previous = ctx.law.roe.authorizedForce;
    if (previous === level) return true;
    ctx.law.authorize(level, ctx.player.state.personId);
    const from = this.callsign();
    const text = level > previous
      ? `À TOUS ICI ${from.toUpperCase()}. Emploi de la force autorisé jusqu’au niveau ${level}. FAITES L’APERÇU.`
      : `À TOUS ICI ${from.toUpperCase()}. Niveau de force ramené à ${level}. TERMINÉ.`;
    ctx.radio.say({ channel: 'commandement', from, priority: 2, personId: ctx.player.state.personId, text });
    return true;
  }
}
