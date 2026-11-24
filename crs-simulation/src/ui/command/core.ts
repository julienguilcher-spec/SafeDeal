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
import { orderPhrase, radioFrame } from './phrases';
import { computeScope } from './scope';
import { isPoliceRole } from '../maps/visibility';
import type { FollowApi } from '@/gameplay/session/follow';
import type { NasseProposal } from './nasse';
import { LegalChain } from './legalChain';
import { cardEnvFromCore } from './reperes';
import { coreLegalDeps } from './sendLine';
import { motorizes } from './direct/travel';
import type { DirectVerb, PlayerOrderInfo } from './direct/types';
import { COMMISSARIATS_SERVICE } from '@/gameplay/commissariats/api';
import type { CommissariatsApi, RecallTarget } from '@/gameplay/commissariats/api';
import { entryKey, stationAt } from './commissariatsModel';

const ISSUED_MAX = 50;
/** Ordres de mouvement qui se font en véhicules quand le point est loin (règle unique de direct/travel.ts). */
const MOTOR_AUTO: ReadonlySet<string> = new Set(['colonne', 'avancer', 'tenir', 'ligne', 'proteger', 'encercler', 'couper_circulation', 'filtrer', 'repli']);
/** Colonne qui se gare ou débarque : un point à moins de cela se rejoint à pied (m) — la portée de la fin à pied des tickets. */
const PARKING_ON_FOOT = 400;
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
/** Chef de bord d'une patrouille (CommandScope.crew) : ce que ses deux collègues font sur son ordre (§1.4, §4.3). */
export const CREW_ORDERS: ReadonlySet<string> = new Set(['suivre_pied', 'avec_moi', 'interpeller', 'secourir']);

export interface IssueResult {
  ok: boolean;
  /** Motif du refus (affiché au joueur) quand ok est faux. */
  reason: string;
  count: number;
}

/**
 * Dernier ordre du joueur à une unité, tel qu'il l'a donné (l'ordre de la fiche, même quand l'unité y va d'abord en
 * véhicules) : la ligne d'état, le choix « À qui » et l'annulation (⌫) le lisent ; la simulation n'en sait rien.
 */
export interface PlayerOrderRecord {
  squadId: number;
  type: OrderType;
  /** Verbe du terrain (« Bloquer », « Envoyer »…), null pour un ordre sans verbe direct (embarquer, protéger…). */
  verb: DirectVerb | null;
  /** Point, cap, largeur et lieu de l'ordre ; null pour un ordre immédiat (là où est l'unité). */
  geom: OrderGeom | null;
  targetId: number;
  issuedAt: number;
  place: string;
  /** Terminé (formation en place, tâche finie) : l'unité redevient libre pour un Envoyer, un Interpeller, un Secours. */
  done: boolean;
}

/** Où en est une unité (ligne d'état) : colonne, BRAV-M, agents encore assis dans les véhicules, ordre en attente. */
export interface SquadPhase {
  /** Colonne de véhicules dont elle fait partie (la sienne ou celle d'une unité supérieure), null : aucune. */
  convoy: { squadId: number; stage: string; remaining: number; departIn: number } | null;
  /** Étape de la BRAV-M (« remontee », « route », « a_pied »…), null : pas une BRAV-M. */
  bravm: string | null;
  /** Agents valides de l'unité (le joueur exclu) et agents assis dans un véhicule. */
  agents: number;
  seated: number;
  /** L'ordre du joueur attend la fin de la colonne (repris au débarquement). */
  queued: boolean;
}

/** Ordre de la simulation → verbe du terrain (mêmes mots que la carte). */
const VERB_OF_TYPE: Readonly<Partial<Record<string, DirectVerb>>> = {
  colonne: 'envoyer', avancer: 'envoyer', faire_mouvement: 'envoyer', couper_circulation: 'bloquer', filtrer: 'bloquer',
  ligne: 'face_foule', interpeller: 'interpeller', refoulement: 'disperser', secourir: 'secours', tenir: 'tenir', cesser: 'cesser',
  repli: 'repli', bond_offensif: 'bond', charge: 'charge', disperser_gaz: 'gaz', libre: 'libre', tortue: 'tortue', encercler: 'encercler',
  degager_obstacle: 'pousser', suivre: 'avec_moi', suivre_pied: 'avec_moi', avec_moi: 'avec_moi',
};

/** Verbe du terrain d'un ordre de la simulation (null : aucun). */
export function verbOfOrder(type: OrderType): DirectVerb | null {
  return VERB_OF_TYPE[String(type)] ?? null;
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

  // ───────────────────────────── commissariats ─────────────────────────────

  /** Service des commissariats (module gameplay/commissariats), s'il est branché et actif dans cette partie. */
  get commissariats(): CommissariatsApi | undefined {
    const a = this.ctx.service<CommissariatsApi>(COMMISSARIATS_SERVICE);
    return a && typeof a.engage === 'function' && a.enabled ? a : undefined;
  }

  /**
   * Unité d'un commissariat encore au poste, en alerte dans ses places ou au repos : écartée des propositions du jeu
   * (Qui), de « Toute la compagnie », de la nasse et du parcours des unités (U).
   */
  atPost(squadId: number): boolean {
    const a = squadId > 0 ? this.commissariats : undefined;
    return !!a && a.atPost(squadId);
  }

  /** Sous les ordres du joueur et pas au poste : unité que le jeu peut proposer ou parcourir. */
  canOrder(squadId: number): boolean {
    return this.canCommand(squadId) && !this.atPost(squadId);
  }

  /**
   * Engage une unité d'un commissariat (numéro d'entrée des fiches, commissariatsModel.entryNumber) : l'équipage est
   * créé à bord, « En alerte », et l'unité passe sous les ordres du joueur. L'étendue du commandement est recalculée
   * tout de suite : l'ordre de la fiche lui est donné dans le même pas (sendLine.ts).
   */
  engageFromCommissariat(entryId: number): { ok: boolean; squadId: number; reason: string } {
    const a = this.commissariats;
    if (!a) return { ok: false, squadId: 0, reason: 'Pas de commissariat dans cette partie.' };
    const key = entryKey(entryId);
    if (!key) return { ok: false, squadId: 0, reason: 'Unité inconnue.' };
    const r = a.engage(key, this.ctx.player.state.personId);
    this.invalidateScope();
    if (r.ok) {
      // la carte ne relit ses unités que deux fois par seconde : sans relecture, l'unité tout juste créée n'y est pas
      // encore et l'ordre de la fiche, donné dans le même pas, partait sans elle (« Sélectionnez d'abord une unité »)
      this.maps.scene.invalidate();
      this.maps.scene.ensureFresh();
    }
    return { ok: r.ok, squadId: r.squadId, reason: r.reason };
  }

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

  /**
   * Indicatif du joueur quand il parle à l'unité `s` : celui de son unité, sauf quand il parle à son unité même — sa
   * fonction alors, jamais « MISTRAL ICI MISTRAL » : « AUTORITÉ » pour le commandant ou le commissaire, « CHEF MISTRAL 1 »
   * pour un chef de section ou de groupe (même règle que les comptes rendus, sim/police/radio.ts playerCallsign).
   */
  callsignFor(s: Squad): string {
    const base = this.callsign();
    const p = this.player();
    const sc = this.scope();
    const ownId = sc.ownSquadId !== 0 ? sc.ownSquadId : p ? p.squadId : 0;
    if (!p || ownId === 0 || s.id !== ownId) return base;
    const role = this.ctx.player.state.role;
    if (role === 'commandant' || role === 'commissaire') return 'AUTORITÉ';
    return s.leaderId === p.id ? 'CHEF ' + s.name : p.name !== '' ? p.name : base;
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
    // sans autorité : seuls les ordres « me suivre » à sa propre unité ; chef de bord : ceux de son équipage
    const sc = this.scope();
    if (sc.level === 'lecture' && !(FOLLOW_ORDERS.has(verb.type) && this.followUnit()) && !(sc.crew === true && CREW_ORDERS.has(verb.type))) {
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
    // « Rentrer au commissariat » : retour sans deux-tons à ses places (ou à la porte), pas un ordre de la simulation
    if (type === 'retour_poste') return this.recallSquads(squads);
    const ctx = this.ctx;
    const playerId = ctx.player.state.personId;
    const maxForce = this.effectiveForce();
    const follow = FOLLOW_ORDERS.has(type) ? this.followUnit() : null;
    // sans autorité, le joueur parle en son nom à son unité (« MISTRAL 1 ALFA ICI GARDIEN … »)
    const lecture = follow !== null && this.scope().level === 'lecture';
    let count = 0;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i]!;
      if (!this.canCommand(s.id) && !(follow && follow.id === s.id)) continue;
      // à sa propre unité, il parle en sa fonction (« AUTORITÉ », « CHEF MISTRAL 1 »), jamais « MISTRAL ICI MISTRAL »
      const from = lecture ? this.player()!.name : this.callsignFor(s);
      const g = geoms ? geoms[geoms.length === 1 ? 0 : i] : undefined;
      // un nouvel ordre annule celui qui attendait le débarquement d'une colonne précédente (motorize le repose au besoin)
      this.afterConvoy.delete(s.id);
      // sa colonne se gare ou débarque (plan §2.5) : l'unité descend où est son fourgon et va à pied à un point proche —
      // relancée en véhicules, elle restait prise dans la file qui se gare, sans un agent en mouvement dix secondes après
      const arriving = this.phaseOf(s.id).convoy;
      const parking = !!arriving && (arriving.stage === 'stationnement' || arriving.stage === 'debarquement');
      // colonne de la journée encore en route ou qui se gare : son « débarquez » de fin de trajet ne remplacera pas cet ordre
      ctx.service<{ takeOver?(id: number): void }>('police.command')?.takeOver?.(s.id);
      // voiture de patrouille (Police secours, BAC) : elle roule déjà, elle se rend elle-même sur le point en urgence
      // (service 'police.patrols') — ni colonne, ni débarquement ; « Faire mouvement » vaut « Avancer jusqu'à »
      // « Me suivre en colonne (véhicules) » / « Me suivre à pied » (session/follow.ts)
      if (type === 'avec_moi' || type === 'suivre_pied') {
        if (this.callWithMe(s, from, type === 'avec_moi')) {
          this.record(s, type, null, playerId);
          count++;
        }
        continue;
      }
      // tout autre ordre : l'unité quitte la colonne du joueur (ses véhicules cessent de le suivre)
      this.follow?.release(s.id);
      const patrol = this.isPatrol(s.id);
      // BRAV-M : ses véhicules sont ses motos ; « Faire mouvement » vaut « En colonne » (elle remonte en selle d'elle-même
      // pour un point éloigné), sans l'avis trompeur « pas de véhicule : mouvement à pied »
      const bravm = !patrol && type === 'faire_mouvement' && !!g && this.isBravm(s);
      const t: OrderType = patrol && type === 'faire_mouvement' ? 'avancer' : bravm ? 'colonne' : type;
      // (« En colonne » à une BRAV-M : même phrase radio que « Faire mouvement » — « En file, à pied » se disait à une
      // BRAV-M qui partait à moto à 600 m)
      const bravmMove = bravm || (!patrol && type === 'colonne' && !!g && this.isBravm(s));
      // un seul nom de lieu pour tout l'ordre : celui de la fiche s'il y en a un, sinon la rue ou le secteur du point ;
      // il part avec l'ordre (SquadOrder.place) : la radio, l'accusé de réception et le suivi disent le même
      const place = g ? (g.place || this.placeHint || this.placeName(t, g.x, g.z)) : '';
      const gp: OrderGeom | undefined = g && place !== '' && g.place !== place ? { ...g, place } : g;
      // mouvement motorisé : demandé (« Faire mouvement ») ou implicite pour un point éloigné d'une unité qui a ses
      // véhicules — elle embarque, roule en colonne jusqu'au point, débarque, puis exécute l'ordre donné
      if (g && !patrol && !bravm && (type === 'faire_mouvement' || (MOTOR_AUTO.has(type) && !(parking && this.leadWithin(s, g.x, g.z, PARKING_ON_FOOT)) && this.drivesTo(s, g.x, g.z)))) {
        // une unité dont un supérieur est aussi désigné fait partie de sa colonne
        if (squads.some((q) => q !== s && this.isAncestor(q.id, s))) { count++; continue; }
        if (this.motorize(s, type, gp!, from, false, targetId)) {
          this.record(s, type, gp!, targetId);
          count++;
          continue;
        }
        if (type === 'faire_mouvement') {
          ctx.ui.notify(`${s.name} n’a pas de véhicule disponible : mouvement à pied.`, 'warn', 4);
          ctx.squads.issue(s.id, { type: 'colonne', x: g.x, z: g.z, heading: g.heading, width: 0, targetId, maxForce, issuedBy: playerId, place, byPlayer: true });
          this.record(s, 'colonne', gp!, targetId);
          count++;
          continue;
        }
      }
      this.record(s, t, gp ?? null, targetId);
      if (g) {
        ctx.squads.issue(s.id, {
          type: t, x: g.x, z: g.z, heading: g.heading, width: g.width, targetId, maxForce, issuedBy: playerId, place, byPlayer: true,
        });
      } else {
        // ordre immédiat : point et cap du chef d'unité (valeurs par défaut du magasin)
        ctx.squads.issue(s.id, { type: t, targetId, maxForce, issuedBy: playerId, byPlayer: true });
      }
      const o = s.order;
      this.trace(s, t);
      // compte rendu radio : au plus trois messages détaillés pour un ordre groupé ; écrit tout de suite (sous-titre,
      // journal), pas dit : c'est l'accusé de réception de l'unité qui s'entend, dans la seconde (RadioMessage.silent)
      if (count < 3) {
        const leader = s.leaderId !== 0 ? ctx.people.get(s.leaderId) : undefined;
        const dist = leader ? Math.hypot(o.x - leader.x, o.z - leader.z) : 0;
        ctx.radio.say({
          channel: 'commandement', from, priority: verb.coercive ? 2 : 1, personId: playerId, silent: true,
          // (BRAV-M : à moto ou à pied selon la règle même de sim/police/command/bravm.ts, voir direct/travel.ts)
          text: bravmMove ? radioFrame(s.name, from, (this.drivesTo(s, o.x, o.z, 'bravm') ? 'Mouvement à moto, en colonne, sur ' : 'Mouvement à pied sur ')
            + (place || 'le point indiqué')) : orderPhrase({
            type: t, unit: s.name, from, sector: place, heading: o.heading, width: o.width,
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

  /**
   * Nom du lieu visé par la fiche en cours d'envoi (sendLine.ts le pose le temps d'un envoi) : les ordres partis pendant
   * ce temps le disent à la radio et le gardent pour le suivi. '' : la rue ou le secteur du point.
   */
  placeHint = '';

  private readonly road: RoadSample = {
    edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false,
  };

  /** Lieu dit à la radio : la rue elle-même pour un barrage (« Barrez la rue, rue de Rivoli »), sinon le secteur. */
  private placeName(type: OrderType, x: number, z: number): string {
    const world = this.ctx.world;
    if ((type === 'couper_circulation' || type === 'filtrer') && world.edgeCount > 0 && world.nearestRoad(x, z, this.road, 40) && this.road.name) {
      return this.road.name;
    }
    const sector = world.sectorName(x, z);
    return sector === 'secteur inconnu' ? '' : sector;
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

  // ───────────────────────────── ordres du joueur (ligne d'état, À qui, annulation) ─────────────────────────────

  /** Dernier ordre du joueur, par unité (propre à la session). */
  readonly playerOrders = new Map<number, PlayerOrderRecord>();
  /**
   * Verbe du terrain de l'ordre en cours d'envoi (le moteur des ordres directs le pose le temps d'un envoi, comme
   * placeHint) : « Bloquer ici, face à la foule » part en `ligne`, mais c'est « Face à la foule » que la ligne dit.
   */
  verbHint: DirectVerb | null = null;
  /** Appelé à chaque ordre du joueur posé dans `playerOrders` (le moteur des ordres directs en fait un ticket). */
  onPlayerOrder: ((r: PlayerOrderRecord) => void) | null = null;

  private record(s: Squad, type: OrderType, geom: OrderGeom | null, targetId: number): void {
    const verb = this.verbHint ?? verbOfOrder(type);
    const r: PlayerOrderRecord = {
      squadId: s.id, type, verb, geom: geom ? { ...geom } : null, targetId, issuedAt: this.ctx.clock.now,
      place: geom ? geom.place ?? '' : '', done: false,
    };
    this.playerOrders.set(s.id, r);
    this.onPlayerOrder?.(r);
  }

  /**
   * Ordre du joueur qui vaut pour l'unité : le sien, ou celui d'une unité supérieure donné après (un ordre à la compagnie
   * est repris par toutes ses sections). null : aucun.
   */
  playerOrderRecord(squadId: number): PlayerOrderRecord | null {
    let best: PlayerOrderRecord | null = null;
    let s = this.ctx.squads.get(squadId);
    for (let guard = 0; s && guard < 9; guard++) {
      const r = this.playerOrders.get(s.id);
      if (r && (!best || r.issuedAt > best.issuedAt)) best = r;
      s = s.parentId !== 0 ? this.ctx.squads.get(s.parentId) : undefined;
    }
    return best;
  }

  /** Dernier ordre du joueur à cette unité, vu par les ordres directs (direct/types.ts PlayerOrderInfo). */
  playerOrder(squadId: number): PlayerOrderInfo | null {
    const r = this.playerOrderRecord(squadId);
    return r ? { type: r.type, verb: r.verb, issuedAt: r.issuedAt, done: r.done, place: r.place } : null;
  }

  /**
   * Fin d'une manœuvre ou d'une tâche (événements 'police:order_done', 'police:in_place') : l'ordre du joueur à cette
   * unité est fait quand c'est bien le sien qui s'achève (même type, posé avant).
   */
  notePoliceDone(squadId: number, type: OrderType | null, ok: boolean): void {
    const r = this.playerOrders.get(squadId);
    const s = this.ctx.squads.get(squadId);
    if (!r || !s || r.done || !ok) return;
    const t = type ?? s.order.type;
    if (t !== r.type || s.order.issuedAt + 1e-6 < r.issuedAt) return;
    r.done = true;
  }

  /** Où en est l'unité : colonne, BRAV-M, agents assis, ordre repris au débarquement (ligne d'état, tickets). */
  phaseOf(squadId: number): SquadPhase {
    const ctx = this.ctx;
    const phase: SquadPhase = { convoy: null, bravm: null, agents: 0, seated: 0, queued: this.afterConvoy.has(squadId) };
    const s = ctx.squads.get(squadId);
    if (!s) return phase;
    const cmd = ctx.service<{
      convoyOf?(id: number): { squadId: number; stage: string; remaining?: number; departIn?: number } | null;
      special?(id: number): { kind: string; stage: string } | null;
    }>('police.command');
    if (cmd && typeof cmd.convoyOf === 'function') {
      for (let q: Squad | undefined = s, guard = 0; q && guard < 9; q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined, guard++) {
        const c = cmd.convoyOf(q.id);
        if (c && c.stage !== 'en_place' && c.stage !== 'parti' && c.stage !== 'echec' && c.stage !== 'annule') {
          phase.convoy = { squadId: c.squadId, stage: c.stage, remaining: c.remaining ?? 0, departIn: c.departIn ?? 0 };
          break;
        }
      }
    }
    const sp = cmd && typeof cmd.special === 'function' ? cmd.special(s.id) : null;
    if (sp && sp.kind === 'bravm') phase.bravm = sp.stage;
    const me = ctx.player.state.personId;
    const walk = (q: Squad, depth: number): void => {
      for (const id of q.members) {
        if (id === me) continue;
        const p = ctx.people.get(id);
        if (!p || ctx.health.isIncapacitated(p)) continue;
        phase.agents++;
        if (p.vehicleId !== 0) phase.seated++;
      }
      if (depth < 8) for (const c of ctx.squads.childrenOf(q.id)) walk(c, depth + 1);
    };
    walk(s, 0);
    return phase;
  }

  /** Nouvelle session : les ordres du joueur de la précédente sont oubliés (les identifiants sont réattribués). */
  resetPlayerOrders(): void {
    this.playerOrders.clear();
    this.verbHint = null;
  }

  /**
   * L'unité ira-t-elle au point en véhicules ? La règle unique de direct/travel.ts (motorizes), la même que la fiche
   * et le Qui : jamais l'unité du joueur à pied (sa colonne l'attendrait) ; à bord, au-delà de 150 m ; à pied, au-delà
   * de 450 m. `symbol` 'bravm' : les seuils de la BRAV-M (en selle à partir de 60 m, à pied à partir de 150 m).
   */
  private drivesTo(s: Squad, x: number, z: number, symbol?: string): boolean {
    const ctx = this.ctx;
    const lead = ctx.people.get(s.leaderId) ?? (s.members.length ? ctx.people.get(s.members[0]!) : undefined);
    if (!lead) return false;
    const me = this.player();
    let total = 0, seated = 0, hasPlayer = false, aboard = false;
    const fleet = new Set<number>();
    const walk = (q: Squad, depth: number): void => {
      if (q.vehicleId !== 0) fleet.add(q.vehicleId);
      for (const id of q.members) {
        if (me && id === me.id) { hasPlayer = true; continue; }
        const p = ctx.people.get(id);
        if (!p) continue;
        total++;
        if (p.vehicleId !== 0) seated++;
      }
      if (depth < 8) for (const c of ctx.squads.childrenOf(q.id)) walk(c, depth + 1);
    };
    walk(s, 0);
    if (hasPlayer && me && me.vehicleId !== 0) aboard = fleet.has(me.vehicleId);
    return motorizes({ x: lead.x, z: lead.z, hasVehicles: this.hasVehicles(s), hasPlayer, seatedShare: total > 0 ? seated / total : 0, symbol }, x, z, aboard);
  }

  /** Le chef de l'unité (à défaut son premier membre) est-il à moins de `max` mètres du point ? */
  private leadWithin(s: Squad, x: number, z: number, max: number): boolean {
    const lead = this.ctx.people.get(s.leaderId) ?? (s.members.length ? this.ctx.people.get(s.members[0]!) : undefined);
    return !!lead && Math.hypot(lead.x - x, lead.z - z) <= max;
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
      channel: 'commandement', from, priority: 2, personId: ctx.player.state.personId, silent: true,
      text: `${s.name} ICI ${from.toUpperCase()}. Embarquez, mouvement en véhicules, deux tons, sur ${g.place || ctx.world.sectorName(g.x, g.z) || 'le point indiqué'}. PARLEZ.`,
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
    // loin d'un joueur à pied : la même règle que tout ordre (direct/travel.ts), jamais l'unité qui le contient
    const far = me.vehicleId === 0 && this.drivesTo(s, me.x, me.z);
    // l'ordre est dit avant d'être exécuté : l'accusé de réception de l'unité vient après lui
    const say = (text: string): void => ctx.radio.say({ channel: 'commandement', from, priority: 1, personId: playerId, text, silent: true });
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
    else ctx.squads.issue(s.id, { type: 'suivre', targetId: playerId, issuedBy: playerId, byPlayer: true });
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

  /** L'unité est-elle une BRAV-M (unité spéciale du commandement, ou binômes dotés d'une moto) ? */
  private isBravm(s: Squad): boolean {
    const ctx = this.ctx;
    const cmd = ctx.service<{ special(squadId: number): { kind: string } | null }>('police.command');
    if (cmd && typeof cmd.special === 'function' && cmd.special(s.id)?.kind === 'bravm') return true;
    const moto = (id: number): boolean => id !== 0 && ctx.vehicles.get(id)?.kind === 'moto_bravm';
    if (s.kind === 'binome') return moto(s.vehicleId);
    return ctx.squads.childrenOf(s.id).some((k) => k.kind === 'binome' && moto(k.vehicleId));
  }

  // ───────────────────────────── retour au commissariat ─────────────────────────────

  /**
   * « Rentrer au commissariat » : chaque unité rentre à son site (unité du stock : le sien ; patrouille : son
   * commissariat ; compagnie de la journée : sa base ; autre : le plus proche), sans deux-tons. Une partie d'une unité
   * du stock (binôme de la BRAV-M, groupe d'une section) ramène toute l'unité. À l'arrivée, le module des
   * commissariats remet les interpellés, complète les réserves et met l'équipage au repos.
   */
  private recallSquads(squads: readonly Squad[]): IssueResult {
    const api = this.commissariats;
    if (!api) return { ok: false, reason: 'Aucun commissariat joignable.', count: 0 };
    const ctx = this.ctx;
    const playerId = ctx.player.state.personId;
    const from = this.callsign();
    const seen = new Set<number>();
    let count = 0;
    let reason = '';
    for (const s0 of squads) {
      if (!this.canCommand(s0.id)) continue;
      const entry = api.entryOf(s0.id);
      const s = entry && entry.squadId !== 0 ? ctx.squads.get(entry.squadId) ?? s0 : s0;
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      if (entry && (entry.state === 'au_poste' || entry.state === 'repos')) {
        const home = api.get(entry.commissariatId);
        reason = `${s.name} est déjà ${home ? stationAt(home) : 'au commissariat'}.`;
        continue;
      }
      const alert = entry?.state === 'alerte';
      const target = api.recall(s.id);
      if (!target) {
        reason = 'Aucun commissariat joignable.';
        continue;
      }
      const view = api.get(target.commissariatId);
      const where = view ? stationAt(view) : 'au commissariat';
      this.afterConvoy.delete(s.id);
      this.follow?.release(s.id);
      // l'ordre est dit avant le départ : l'accusé de réception de l'unité (« Je rentre… ») vient après lui
      if (count < 3) {
        ctx.radio.say({
          channel: 'commandement', from, priority: 1, personId: playerId,
          text: alert ? radioFrame(s.name, from, `Alerte levée, restez ${where}`)
            : orderPhrase({ type: 'retour_poste' as OrderType, unit: s.name, from, sector: where, heading: 0, width: 0, distance: 0, target: '' }),
        });
      }
      // en alerte, l'unité est encore dans ses places : l'alerte est levée, elle ne bouge pas
      if (!alert) this.driveHome(s, target, playerId);
      this.trace(s, 'retour_poste' as OrderType);
      count++;
    }
    if (count === 0) return { ok: false, reason: reason || 'Aucune des unités sélectionnées n’est sous vos ordres.', count: 0 };
    ctx.audio.play('radio_bip');
    return { ok: true, reason: '', count };
  }

  /**
   * Mouvement de retour : une voiture de patrouille rentre seule à sa place ; une unité qui a ses véhicules embarque et
   * roule sans urgence jusqu'au centre de sa file de places, où elle se gare sans débarquer ; à pied (ou à moto : la
   * BRAV-M remonte en selle d'elle-même pour un point éloigné), elle va jusqu'à la porte.
   */
  private driveHome(s: Squad, t: RecallTarget, playerId: number): void {
    const ctx = this.ctx;
    const patrols = ctx.service<{ isPatrol(id: number): boolean; sendHome(id: number, at: { x: number; z: number; heading: number }, by?: number): boolean }>('police.patrols');
    if (patrols && typeof patrols.sendHome === 'function' && patrols.isPatrol(s.id) && patrols.sendHome(s.id, { x: t.x, z: t.z, heading: t.heading }, playerId)) return;
    const cmd = ctx.service<{ arrive(id: number, dest: Record<string, unknown>): boolean }>('police.command');
    if (cmd && this.hasVehicles(s) && cmd.arrive(s.id, {
      x: t.x, z: t.z, heading: t.heading, layout: 'file', boardFirst: true, stagger: true, disembark: false, urgence: false,
    })) return;
    // la BRAV-M rentre à moto jusqu'à ses places (souvent dans une autre rue que la porte : au 9e, boulevard Haussmann) ;
    // envoyée à la porte, elle s'arrêtait à 100 m de ses places et restait « Retour » sans fin
    const bravm = this.isBravm(s);
    ctx.squads.issue(s.id, {
      type: 'colonne', x: bravm ? t.x : t.doorX, z: bravm ? t.z : t.doorZ, heading: t.heading, width: 0, targetId: 0,
      maxForce: this.effectiveForce(), issuedBy: playerId,
    });
  }

  /** Fin du débarquement d'une colonne : l'ordre donné est exécuté sur place. */
  onConvoyStage(squadId: number, stage: string): void {
    if (stage !== 'en_place') return;
    const next = this.afterConvoy.get(squadId);
    if (!next) {
      // « Faire mouvement » (rien à reprendre au débarquement) : l'ordre du joueur est fait, la colonne en place
      const r = this.playerOrders.get(squadId);
      if (r && r.type === 'faire_mouvement') r.done = true;
      return;
    }
    this.afterConvoy.delete(squadId);
    const ctx = this.ctx;
    const g = next.geom;
    ctx.squads.issue(squadId, { type: next.type, x: g.x, z: g.z, heading: g.heading, width: g.width, targetId: next.targetId, maxForce: this.effectiveForce(), issuedBy: ctx.player.state.personId, place: g.place, byPlayer: true });
    // l'ordre repris au débarquement est celui que le joueur a donné : son suivi continue (« fait » quand il s'achève)
    const r = this.playerOrders.get(squadId);
    if (r && r.type === next.type) r.done = false;
  }

  /**
   * Annulation (⌫) : redonne à l'unité un ordre du joueur déjà donné (même type, même point, même lieu), sans phrase
   * nouvelle à la radio que celle de l'ordre. false s'il ne part pas.
   */
  reissue(s: Squad, r: PlayerOrderRecord): boolean {
    const before = this.verbHint;
    const hint = this.placeHint;
    this.verbHint = r.verb;
    if (r.place !== '') this.placeHint = r.place;
    try {
      if (r.verb === 'avec_moi' || r.type === 'suivre' || r.type === 'suivre_pied' || r.type === 'avec_moi') {
        const me = this.ctx.player.person();
        return this.issue(me && me.vehicleId !== 0 ? 'avec_moi' : 'suivre_pied', [s], null).ok;
      }
      return this.issue(r.type, [s], r.geom ? [r.geom] : null, r.targetId).ok;
    } finally {
      this.verbHint = before;
      this.placeHint = hint;
    }
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
      ? `À TOUS ICI ${from.toUpperCase()}. Emploi de la force autorisé jusqu’à\u00a0: ${forceWord(level)}. FAITES L’APERÇU.`
      : `À TOUS ICI ${from.toUpperCase()}. Force ramenée à\u00a0: ${forceWord(level)}. TERMINÉ.`;
    ctx.radio.say({ channel: 'commandement', from, priority: 2, personId: ctx.player.state.personId, text });
    return true;
  }
}
