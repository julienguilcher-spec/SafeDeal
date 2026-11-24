/* =====================================================================================
 * Ordres directs — LE MOTEUR DU TERRAIN (service 'command.direct') : désignation en entrée, ordre prêt en sortie,
 * unité qui obéira (« À qui »), envoi, tickets, annulation.
 *
 *   setDesignation(d)      ce que le joueur regarde (designate.ts, P9) ; sans elle, le réticule (PlayerState.aim*) ;
 *   ready()                l'ordre prêt AFFICHÉ (stable : il change au plus toutes les 0,5 s) — Entrée donne celui-là,
 *                          jamais un ordre recalculé à l'appui ; ready().autre : la ligne Maj+Entrée ;
 *   give('go' | 'autre')   Entrée / Maj+Entrée : l'ordre affiché part par le même chemin que la carte (buildCard →
 *                          ligne de fiche → sendCardLine → CommandCore.issue) ; Disperser avant les sommations : le
 *                          premier appui dit pourquoi, le second (≤ 3 s) fait faire les sommations (chaîne légale) ;
 *   avecMoi()              A : tout le monde (ou l'unité choisie par U) revient avec le joueur ;
 *   cycle(±1)              U / Maj+U : unité suivante ; un choix manuel vaut pour le prochain ordre seulement ;
 *   undo()                 ⌫ dans les 5 s : chaque unité reprend l'ordre du joueur qu'elle avait (ou « Avec moi ») ;
 *   tickets                un état par ordre du joueur (« reçu » à l'appui même, puis « descend des fourgons », « en
 *                          route », « en place ✓ »…), tenu à jour par la simulation, avec la SURVEILLANCE : une unité
 *                          en route qui ne s'est pas rapprochée de 5 m en 15 s est « bloquée » (raison du pilote
 *                          automatique) ; à moins de 400 m du point, elle finit à pied (une fois par ticket).
 * Garde-fous : Entrée, Maj+Entrée, A et ⌫ sont ignorés pendant qu'un écran est ouvert et 0,6 s après sa fermeture
 * (l'Entrée qui ferme la carte ne donne pas un second ordre) ; deux ordres à moins de 0,6 s : le second est ignoré.
 * Ordres de l'interpellé et des fourgons cellulaires (règles a, b) : services cherchés au moment même
 * ('police.arrests', 'law.custody', 'transfer', 'police.command') ; absent, la règle n'est pas proposée (env.ts).
 * Temps : celui de la simulation (ctx.clock.now), aucun hasard.
 * ===================================================================================== */

import type { GameContext, OrderType, Person, Squad } from '@/core/contracts';
import type { RescueKind } from '@/core/extensions';
import type { MapUnit } from '../../maps/units';
import type { CardEnv, CardLine, Repere, SendEnv, SendMapLike, WhoCandidate } from '../cardTypes';
import type { CommandCore, PlayerOrderRecord } from '../core';
import { INCIDENT_KIND_LABELS, meansOfSymbol } from '../incidents';
import { verbLine } from '../intents';
import { verbOf } from '../orders';
import { pointRepere, roadRepere, cardEnvFromCore, crowdRepere } from '../reperes';
import { radioFrame, rescueRequest } from '../phrases';
import { requestRescueAtPlayer } from '../quickActions';
import { DirectIssuer, legalCheck, sendCardLine } from '../sendLine';
import { REFUS } from './caps';
import { designationAt, directEnvFromCore } from './env';
import { holdNatural, isFlashing, naturalOrder } from './natural';
import type { HeldNatural, NaturalOrder } from './natural';
import { blockWords, emptySnapshot, expired, newTicket, next } from './tickets';
import type { Ticket, TicketSnapshot } from './tickets';
import type { Addressee, Designation, DirectEnv, DirectVerb, WhoKey } from './types';
import { WHO_AUTO, consumeWho, nextWho, unitOfKey } from './who';
import type { WhoState } from './who';
import { CUSTODY_TEXTS, VERB_WORDS, vanWords } from './words';

/** Clé du service. */
export const DIRECT_SERVICE = 'command.direct';

/** Garde après la fermeture d'un écran et entre deux ordres (s). */
export const GUARD_TIME = 0.6;
/** Fenêtre de l'annulation (⌫) après un ordre (s). */
export const UNDO_WINDOW = 5;
/** Recalcul de l'ordre prêt (s). */
export const EVAL_PERIOD = 0.25;
/** Désignation fournie par designate.ts : valable tant qu'elle est rafraîchie (s). */
export const DESIGNATION_TTL = 1;
/** Second appui sur un ordre qui demande d'abord les sommations (s). */
export const LEGAL_REPEAT = 3;
/** Surveillance : période (s), fenêtre (s), gain minimal (m), portée de la fin à pied (m), proximité ignorée à pied (m). */
export const WATCH_PERIOD = 0.5;
export const WATCH_WINDOW = 15;
export const WATCH_GAIN = 5;
export const WATCH_RELEASE = 400;
export const WATCH_NEAR = 25;
/**
 * Colonne à moins de 150 m du point : elle se gare (la colonne finit seule, sim/police/command/convoy.ts) — la
 * surveillance ne la coupe pas en pleine manœuvre de stationnement.
 */
export const WATCH_CONVOY_NEAR = 150;
/** Ligne « bloqué » montrée (s) avant de revenir à l'état de l'unité. */
export const BLOCK_SHOW = 8;
/** Relecture des tickets (s). */
export const TICKET_PERIOD = 0.25;
/** Ticket sans nouvelle de la simulation retiré au bout de (s). */
export const TICKET_STALE = 600;
/** Tickets gardés au plus. */
const TICKETS_MAX = 24;
/** Vitesse au-dessus de laquelle un agent « marche » (m/s). */
const MOVING_SPEED = 0.6;
/** Ordres terminés d'eux-mêmes (pas de « en place » à attendre). */
const IMMEDIATE_DONE: ReadonlySet<string> = new Set(['libre', 'cesser']);
/** Tâche réussie par l'unité elle-même (BRAV-M) : elle reprend son ordre d'avant après tant de secondes (le temps de lire « ✓ »). */
const RETURN_AFTER_DONE = 2;
/** Verbes dont la fin est dite par une tâche d'une sous-unité (binôme qui interpelle, groupe qui secourt). */
const TASK_VERBS: ReadonlySet<DirectVerb> = new Set<DirectVerb>(['interpeller', 'constater', 'secours']);

/** Ce que rend un appui (Entrée, A, ⌫, la pastille du téléphone). */
export interface GiveResult {
  ok: boolean;
  /** Succès : ce qui part (« MISTRAL 1 → Barrer la rue Saint-Gilles ») ; refus : la phrase du refus ; '' si ignoré. */
  text: string;
  /** Unités qui ont reçu l'ordre. */
  squads: number[];
  /** L'appui n'a rien fait exprès (écran ouvert, garde de 0,6 s, rien à annuler) : pas de message. */
  ignored: boolean;
}

/** Ce que l'annulation défera (bouton « ↶ Annuler » du téléphone, ligne « ⌫ annuler »). */
export interface UndoInfo {
  who: string;
  verb: string;
  /** Instant (temps de session) où l'annulation n'est plus possible. */
  until: number;
}

/** Point qu'on ne peut pas viser (au-delà de 400 m) : la carte s'ouvre dessus (Tab, P10). */
export interface FarTarget {
  x: number;
  z: number;
  squadIds: number[];
  intent: 'envoyer';
}

/** Service 'command.direct' (lu par le clavier P9, le HUD P10, le téléphone P11, les cartes P15, les robots P16). */
export interface DirectApi {
  setDesignation(d: Designation | null): void;
  /** Désignation en vigueur (celle de designate.ts, sinon le réticule). */
  designation(): Designation | null;
  /** Ordre prêt affiché (null : pas de joueur). */
  ready(): NaturalOrder | null;
  /** La ligne vient de changer (< 0,3 s) : à montrer en surbrillance. */
  flashing(): boolean;
  /** Choix « À qui » en cours ('auto', 'tous', 'u<id>') et l'unité qui obéira à l'ordre prêt. */
  whoKey(): WhoKey;
  addressee(): Addressee | null;
  cycle(step: 1 | -1): WhoKey;
  /** Choix fait ailleurs (le « Qui » de la carte) : il vaut pour le prochain ordre. */
  setWho(key: WhoKey): void;
  give(which?: 'go' | 'autre'): GiveResult;
  /** `fromScreen` : appui venu d'un écran lui-même (la roue, secteur 1) — pas de garde d'écran. */
  avecMoi(opts?: { fromScreen?: boolean }): GiveResult;
  /** Secteur de la roue (F) : envoyé comme l'ordre prêt, sans la garde d'écran (la roue est l'écran). */
  giveSector(nat: NaturalOrder): GiveResult;
  undo(): GiveResult;
  undoable(): UndoInfo | null;
  readonly tickets: readonly Ticket[];
  ticketOf(squadId: number): Ticket | null;
  /** Un écran vient de se fermer : 0,6 s sans ordre du terrain. */
  noteScreenClosed(): void;
  /** Dernier point trop loin pour viser, et ouvrir la carte dessus. */
  farTarget(): FarTarget | null;
  openFar(): boolean;
  /** Vue étroite de la partie à cet instant (tests, HUD). */
  env(): DirectEnv;
}

interface TicketEntry {
  ticket: Ticket;
  record: PlayerOrderRecord | null;
  /** Point suivi (le point de l'ordre ; le joueur pour « Avec moi » ; la personne pour Interpeller). */
  x: number;
  z: number;
  personId: number;
  done: { ok: boolean; reason: string } | null;
  refused: string | null;
  blocked: string | null;
  blockedAt: number;
  /** Échantillons de la surveillance : instant, distance au point, itinéraire restant de la colonne (−1 : aucune). */
  watch: { t: number; d: number; r: number }[];
  watchUsed: boolean;
  /** Dernier changement d'état (pour retirer un ticket oublié). */
  changedAt: number;
  /** Ordre du joueur que l'unité tenait avant celui-ci (null : aucun) ; fin de la tâche vue à ; retour déjà donné. */
  before: PlayerOrderRecord | null;
  doneAt: number;
  returned: boolean;
  /** La simulation a dit la tâche finie et réussie par l'unité elle-même ('police:order_done', pas la mise en place). */
  taskDone: boolean;
}

interface UndoEntry {
  at: number;
  who: string;
  verb: DirectVerb;
  targets: number[];
  /** Ordre du joueur qui valait pour chaque unité visée, avant (null : aucun). */
  prev: Map<number, PlayerOrderRecord | null>;
  /** Sous-unités qui avaient leur propre ordre du joueur, écrasé par la copie de l'ordre de leur unité (parents d'abord). */
  own: { squadId: number; record: PlayerOrderRecord }[];
}

/** Charges des événements de la simulation. */
interface DoneEvent { squadId: number; type?: OrderType; ok?: boolean; reason?: string }

/** Services facultatifs des règles a et b, vus par leur méthode. */
interface ArrestsLike { takeOver?(targetId: number, byPlayer: number): { ok: boolean; reason: string; squadName?: string } | boolean | void }
interface CustodyLike {
  handover?(actorId: number): unknown;
  callVan?(actorId: number, vanSquadId?: number): { ok: boolean; reason: string };
}
interface CommandLike {
  arrive?(squadId: number, dest: Record<string, unknown>): boolean;
  takeOver?(squadId: number, order?: Record<string, unknown>): unknown;
}
interface TransferLike { depart?(squadId: number): unknown }
interface FollowLike { release?(squadId: number): void; inColumn?(squadId: number): boolean }
interface AutopilotLike { status?(v: unknown): { reason: string } }

/**
 * Carte sans écran pour l'envoi d'une ligne de fiche depuis le terrain : les ordres aux unités (DirectIssuer), les
 * secours, la circulation et les incidents comme la carte de commandement (tacticalActions.ts), sans son état d'écran.
 */
class FieldMap extends DirectIssuer implements SendMapLike {
  constructor(core: CommandCore) {
    super(core, []);
  }

  closeRoad(x: number, z: number): void {
    const core = this.core;
    const traffic = core.traffic;
    if (!traffic || !core.scope().canTraffic) return;
    const c = traffic.closeRoad(x, z, core.ctx.player.state.personId, 0);
    if (!c) {
      core.ctx.ui.notify('Aucune rue à fermer à cet endroit.', 'warn', 3);
      return;
    }
    const e = core.ctx.world.edge(c.edgeId);
    const name = e && e.name ? e.name : core.ctx.world.sectorName(c.x, c.z) || 'voie sans nom';
    core.ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: 1, personId: core.ctx.player.state.personId,
      text: radioFrame('CENTRAL', core.callsign(), `Circulation coupée, ${name}`, false),
    });
  }

  closeArea(x: number, z: number, radius: number): void {
    const core = this.core;
    const traffic = core.traffic;
    if (!traffic || !core.scope().canTraffic) return;
    const list = traffic.closeArea(x, z, radius, core.ctx.player.state.personId);
    if (list.length === 0) core.ctx.ui.notify('Aucune rue n’entre dans ce périmètre.', 'warn', 3);
  }

  callRescue(kind: RescueKind, x: number, z: number, incidentId: number): void {
    const core = this.core;
    const rescue = core.rescue;
    if (!rescue || !core.scope().canDelegate) return;
    const ctx = core.ctx;
    const call = rescue.request(kind, x, z, ctx.player.state.personId, incidentId !== 0 ? incidentId : undefined);
    const eta = Math.max(0, Math.round(call.eta));
    ctx.ui.notify(`${kind === 'pompiers' ? 'Pompiers' : 'SAMU'} demandés — arrivée estimée dans ${Math.floor(eta / 60)} min ${eta % 60 < 10 ? '0' : ''}${eta % 60}`, 'ok', 4);
    ctx.radio.say({
      channel: 'secours', from: core.callsign(), priority: 2, personId: ctx.player.state.personId,
      text: rescueRequest(core.callsign(), ctx.world.sectorName(x, z), kind),
    });
  }

  assignToUnit(incidentId: number, u: MapUnit): boolean {
    const core = this.core;
    const api = core.incidents;
    const inc = api?.get(incidentId);
    if (!api || !inc) return false;
    if (!api.assign(incidentId, meansOfSymbol(u.symbol), u.squadId)) {
      core.ctx.ui.notify(`${u.name} ne peut pas traiter « ${INCIDENT_KIND_LABELS[inc.kind] ?? inc.label} ».`, 'warn', 4);
      return false;
    }
    return true;
  }
}

export class DirectRuntime implements DirectApi {
  private external: { d: Designation; at: number } | null = null;
  private shown: HeldNatural | null = null;
  private evalAt = -1e9;
  private readAt = -1e9;
  private who: WhoState = WHO_AUTO;
  private lastGiveAt = -1e9;
  private closedAt = -1e9;
  private lastScreen: string | null = null;
  private legalPress: { key: string; at: number } | null = null;
  private undoEntry: UndoEntry | null = null;
  private far: FarTarget | null = null;
  private watchAt = -1e9;
  private ticketAt = -1e9;
  private nextTicketId = 1;
  private readonly entries: TicketEntry[] = [];
  /** Dernier ordre du joueur de chaque unité (pour le lui rendre après une interpellation ou un secours). */
  private readonly lastRecords = new Map<number, PlayerOrderRecord>();
  private readonly list: Ticket[] = [];
  private readonly field: FieldMap;

  constructor(private readonly core: CommandCore) {
    this.field = new FieldMap(core);
    core.onPlayerOrder = (r) => this.onRecord(r);
  }

  private get ctx(): GameContext {
    return this.core.ctx;
  }

  private now(): number {
    return this.ctx.clock.now;
  }

  // ───────────────────────────── désignation, ordre prêt ─────────────────────────────

  setDesignation(d: Designation | null): void {
    this.external = d ? { d, at: this.now() } : null;
    // la ligne suit la nouvelle désignation au prochain calcul (l'hystérésis la garde stable)
    this.evalAt = -1e9;
  }

  designation(): Designation | null {
    const now = this.now();
    if (this.external && now - this.external.at <= DESIGNATION_TTL) return this.external.d;
    const me = this.core.player();
    if (!me) return null;
    const st = this.ctx.player.state;
    const aimed = st.aimedPersonId !== 0 && st.aimedPersonId !== me.id ? st.aimedPersonId : 0;
    return designationAt(this.core, st.aimX, st.aimZ, aimed, true);
  }

  env(): DirectEnv {
    return directEnvFromCore(this.core, { playerOrder: (id) => this.core.playerOrder(id) });
  }

  /** Recalcule l'ordre prêt (au plus toutes les 0,25 s) ; `force` : tout de suite (changement d'unité, ordre donné). */
  private evaluate(force: boolean): void {
    const now = this.now();
    if (!force && now - this.evalAt < EVAL_PERIOD && this.shown) return;
    this.evalAt = now;
    const des = this.designation();
    if (!des || !this.core.player()) {
      this.shown = null;
      return;
    }
    const nat = naturalOrder(this.env(), des, this.who.key);
    this.shown = force ? { order: nat, since: now } : holdNatural(this.shown, nat, now);
  }

  ready(): NaturalOrder | null {
    this.readAt = this.now();
    this.evaluate(false);
    return this.shown ? this.shown.order : null;
  }

  flashing(): boolean {
    return this.shown !== null && isFlashing(this.shown, this.now());
  }

  whoKey(): WhoKey {
    return this.who.key;
  }

  addressee(): Addressee | null {
    const o = this.ready();
    return o ? o.who : null;
  }

  cycle(step: 1 | -1): WhoKey {
    this.who = nextWho(this.env(), this.who, step);
    this.evaluate(true);
    return this.who.key;
  }

  setWho(key: WhoKey): void {
    this.who = { key, lastManual: key !== 'auto' ? key : this.who.lastManual, justOrdered: false };
    this.evaluate(true);
  }

  // ───────────────────────────── garde-fous ─────────────────────────────

  noteScreenClosed(): void {
    this.closedAt = this.now();
  }

  /** Un écran est ouvert, ou s'est fermé il y a moins de 0,6 s. */
  private screenGuard(): boolean {
    this.trackScreens();
    const ui = this.ctx.ui;
    const cur = ui ? ui.current : null;
    if (cur !== null && cur !== undefined) return true;
    return this.now() - this.closedAt < GUARD_TIME;
  }

  /** Suit l'ouverture et la fermeture des écrans (appelé à chaque pas et à chaque image). */
  trackScreens(): void {
    const ui = this.ctx.ui;
    const cur = ui && ui.current !== undefined ? ui.current : null;
    if (this.lastScreen !== null && cur === null) this.closedAt = this.now();
    this.lastScreen = cur;
  }

  private ignored(): GiveResult {
    return { ok: false, text: '', squads: [], ignored: true };
  }

  private refuse(text: string, toast: boolean, who: Addressee | null = null, verb: DirectVerb | null = null): GiveResult {
    if (toast && text !== '') this.ctx.ui.notify(text, 'warn', 5);
    // la ligne d'état de l'unité dit le refus 6 s (ticket « refuse »)
    if (who && verb && who.squadIds.length === 1) {
      const s = this.ctx.squads.get(who.squadIds[0]!);
      if (s) {
        const t = newTicket(this.nextTicketId++, s.id, s.name, verb, null, '', this.now());
        this.addEntry({ ...t, state: 'refuse', why: text }, null, 0);
      }
    }
    return { ok: false, text, squads: [], ignored: false };
  }

  // ───────────────────────────── Entrée, Maj+Entrée ─────────────────────────────

  give(which: 'go' | 'autre' = 'go'): GiveResult {
    if (this.screenGuard()) return this.ignored();
    const now = this.now();
    if (now - this.lastGiveAt < GUARD_TIME) return this.ignored();
    // la ligne affichée ; si personne ne l'a lue récemment (robot, premier appui), elle est calculée maintenant
    if (!this.shown || now - this.readAt > 2 * EVAL_PERIOD) this.evaluate(!this.shown);
    const shown = this.shown ? this.shown.order : null;
    if (!shown) return this.refuse(REFUS.personne, true);
    const nat = which === 'autre' ? shown.autre : shown;
    if (!nat) return this.ignored();
    return this.giveShown(nat);
  }

  /**
   * Secteur de la roue (F, ui/command/orderWheel.ts) : l'ordre du secteur (direct/sector.ts) part comme l'ordre prêt
   * (Disperser avant les sommations : le second appui dans les 3 s les fait faire ; ⌫ l'annule). La roue est l'écran
   * ouvert : la garde d'écran ne s'applique pas à ses propres secteurs.
   */
  giveSector(nat: NaturalOrder): GiveResult {
    return this.giveShown(nat);
  }

  /** Donne une ligne affichée (ordre prêt, ligne « autre » ou secteur de la roue). */
  private giveShown(nat: NaturalOrder): GiveResult {
    const now = this.now();
    if (!nat.enabled) {
      if (nat.lock === REFUS.tropLoin) this.far = { x: nat.x, z: nat.z, squadIds: nat.who ? nat.who.squadIds.slice() : [], intent: 'envoyer' };
      // règle i : la ligne grise suffit (pas de message)
      return this.refuse(nat.lock ?? '', nat.rule !== 'i', nat.who, nat.who ? nat.verb : null);
    }
    if (nat.legalFirst) {
      // le premier appui dit ce qu'il faut ; le second (≤ 3 s) fait faire les sommations, l'unité se met en ligne
      const lp = this.legalPress;
      if (!lp || lp.key !== nat.key || now - lp.at > LEGAL_REPEAT) {
        this.legalPress = { key: nat.key, at: now };
        return this.refuse(nat.lock ?? '', true);
      }
      this.legalPress = null;
      const r = this.legal(nat);
      if (r.ok) this.after(nat, r.squads);
      return r;
    }
    const before = this.snapshotFor(nat);
    const r = this.issueDirect(nat, nat.who);
    if (r.ok) {
      this.after(nat, r.squads);
      if (r.squads.length > 0 && before) this.undoEntry = { ...before, at: now };
    } else if (r.text !== '') {
      this.ctx.ui.notify(r.text, 'warn', 5);
    }
    return r;
  }

  /** Après un ordre : garde de 0,6 s, le choix manuel est consommé, la ligne est recalculée. */
  private after(_nat: NaturalOrder, _squads: readonly number[]): void {
    this.lastGiveAt = this.now();
    this.who = consumeWho(this.who);
    this.evaluate(true);
  }

  /**
   * Donne un ordre prêt (ou une ligne « autre ») à l'unité choisie, par le chemin de la carte : repère du lieu, ligne de
   * la fiche, Qui, sendCardLine. Public : la roue (P9) et les robots (P16) passent par ici.
   */
  issueDirect(nat: NaturalOrder, who: Addressee | null): GiveResult {
    const core = this.core;
    const ctx = this.ctx;
    const ok = (text: string, squads: readonly number[]): GiveResult => ({ ok: true, text, squads: squads.slice(), ignored: false });
    const fail = (text: string): GiveResult => ({ ok: false, text, squads: [], ignored: false });
    const me = core.player();
    if (!me) return fail(REFUS.personne);
    switch (nat.verb) {
      // ── l'interpellé du joueur (règle a) ──
      case 'remettre': {
        const custody = ctx.service<CustodyLike>('law.custody');
        if (!custody || typeof custody.handover !== 'function') return fail(REFUS.personne);
        const r = custody.handover(me.id);
        return r === false ? fail('Remise impossible : approchez-vous du fourgon cellulaire.') : ok(nat.text, []);
      }
      case 'confier': {
        const arrests = ctx.service<ArrestsLike>('police.arrests');
        if (!arrests || typeof arrests.takeOver !== 'function') return fail(REFUS.personne);
        const r = arrests.takeOver(nat.personId, me.id);
        const done = typeof r === 'object' && r !== null ? r.ok : r !== false;
        if (!done) return fail(typeof r === 'object' && r && r.reason ? r.reason : 'Personne pour le prendre.');
        ctx.ui.notify(CUSTODY_TEXTS.confided(nat.who ? nat.who.label : ''), 'ok', 3);
        return ok(nat.text, nat.who ? nat.who.squadIds : []);
      }
      case 'emmener': {
        // il l'emmène lui-même : le fourgon est montré, avec sa distance
        const van = this.nearestVanName(nat.x, nat.z);
        ctx.ui.notify(CUSTODY_TEXTS.takeToVan(van, nat.distance), 'info', 5);
        return ok(nat.text, []);
      }
      case 'faire_venir':
      case 'venir': {
        if (!who || who.squadIds.length === 0) return fail(REFUS.personne);
        const id = who.squadIds[0]!;
        // l'interpellé du joueur : le fourgon vient le chercher par le module de droit (le même appel que la touche
        // Interagir « Faire venir le fourgon », place retenue, attente du joueur)
        const custody = nat.verb === 'faire_venir' ? ctx.service<CustodyLike>('law.custody') : undefined;
        if (custody && typeof custody.callVan === 'function') {
          const r = custody.callVan(me.id, id);
          return r.ok ? ok(nat.text, [id]) : fail(r.reason);
        }
        const r = this.callVan(id, me);
        if (!r) return fail(`${who.label} ne peut pas venir : aucun chemin pour y aller. U : une autre unité.`);
        return ok(nat.text, [id]);
      }
      case 'partir': {
        const transfer = ctx.service<TransferLike>('transfer');
        if (!who || !transfer || typeof transfer.depart !== 'function') return fail(REFUS.personne);
        const r = transfer.depart(who.squadIds[0]!);
        // (le service du transfert dit pourquoi : { ok: false, reason })
        const why = r !== null && typeof r === 'object' && (r as { ok?: unknown }).ok === false ? String((r as { reason?: unknown }).reason ?? '') : '';
        if (r === false || why !== '') return fail(why !== '' ? `${who.label} ne peut pas\u00a0: ${why}. U\u00a0: une autre unité.` : `${who.label} ne peut pas partir maintenant.`);
        return ok(nat.text, who.squadIds);
      }
      // ── « avec moi » à une unité visée (règle e) ──
      case 'avec_moi': {
        if (!who) return fail(REFUS.personne);
        return this.withMe(who.squadIds, nat.text);
      }
      // ── secours (règle d) : les secours au point, le groupe le plus proche y va ──
      case 'secours':
        return this.rescue(nat, who);
      default:
        break;
    }
    if (!who || who.squadIds.length === 0) return fail(nat.lock ?? REFUS.personne);
    const card = cardEnvFromCore(core, who.squadIds);
    const where = this.repereOf(nat, card);
    const line = this.lineOf(nat, card);
    if (!line) return fail('Cet ordre n’existe pas dans cette version.');
    return this.send(nat, line, who, where, card);
  }

  /** Envoie une ligne de fiche à Qui (verbe et lieu de l'ordre prêt posés le temps de l'envoi). */
  private send(nat: NaturalOrder, line: CardLine, who: Addressee, where: Repere, card: CardEnv): GiveResult {
    const core = this.core;
    const env: SendEnv = {
      core, map: this.field, card, trace: null,
      setSelection: (ids) => this.field.setIds(ids),
    };
    this.field.setIds(who.squadIds);
    const verbBefore = core.verbHint;
    const placeBefore = core.placeHint;
    core.verbHint = nat.verb;
    if (nat.place !== '') core.placeHint = nat.place;
    try {
      const r = sendCardLine(env, line, candidate(who), where);
      return { ok: r.ok, text: r.text, squads: r.squads, ignored: false };
    } finally {
      core.verbHint = verbBefore;
      core.placeHint = placeBefore;
    }
  }

  /** Repère de l'ordre : la rue barrée, la foule à disperser, sinon le point (nommé d'après l'ordre prêt). */
  private repereOf(nat: NaturalOrder, card: CardEnv): Repere {
    if (nat.verb === 'bloquer') {
      const road = card.roadAt(nat.x, nat.z, 25);
      if (road) return roadRepere(road);
    }
    if (nat.verb === 'disperser') {
      let best: CardEnv['crowds'][number] | null = null;
      let bd = 60;
      for (const c of card.crowds) {
        const d = Math.hypot(c.x - nat.x, c.z - nat.z);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (best) return crowdRepere(best);
    }
    const r = pointRepere(nat.x, nat.z, card);
    if (nat.verb === 'interpeller' && nat.personId !== 0) {
      // la radio dit qui est visé (« Interpellez l'auteur désigné »), le suivi aussi
      const label = nat.text.split(' · ')[0]!.replace(/^Interpeller\s+/, '');
      return { ...r, name: label };
    }
    if (nat.place !== '') return { ...r, name: `Ici : ${nat.place}` };
    return r;
  }

  /** Ligne de fiche de l'ordre prêt (les mêmes fonctions que la fiche de la carte : verbLine). */
  private lineOf(nat: NaturalOrder, card: CardEnv): CardLine | null {
    const x = nat.x, z = nat.z;
    switch (nat.verb) {
      case 'bloquer':
        return verbLine(card, 'couper_circulation', 'street', x, z, { targetId: 0 });
      case 'face_foule':
        return verbLine(card, 'ligne', 'autoLine', x, z, { label: 'Bloquer ici, face à la foule', explain: 'Une ligne entre vos unités et la foule, boucliers levés.' });
      case 'envoyer':
        return verbLine(card, nat.orderType ?? 'colonne', 'point', x, z, { label: 'Y aller' });
      case 'interpeller':
      case 'constater':
        return verbLine(card, 'interpeller', 'target', x, z, { targetId: nat.targetId });
      case 'disperser':
        return verbLine(card, 'refoulement', 'point', x, z);
      default: {
        const type = nat.orderType;
        // ordres sur place (tenir, arrêter, agir seuls, tortue) : aucun point à rejoindre
        return type ? verbLine(card, type, verbOf(type)?.gesture === 'immediate' ? 'immediate' : 'point', x, z) : null;
      }
    }
  }

  /** Disperser après les sommations : l'unité se met en ligne face à la foule, la chaîne légale fait le reste. */
  private legal(nat: NaturalOrder): GiveResult {
    const core = this.core;
    const who = nat.who;
    if (!who) return this.refuse(REFUS.personne, true);
    const card = cardEnvFromCore(core, who.squadIds);
    const where = this.repereOf(nat, card);
    const line = this.lineOf(nat, card);
    if (!line) return this.refuse('Cet ordre n’existe pas dans cette version.', true);
    const r = legalCheck(core, card, line, candidate(who), where);
    if (!r.chain || !r.plan) return this.refuse(r.reason !== '' ? r.reason : 'Sommations impossibles ici.', true, who, nat.verb);
    // en attendant, l'unité se met en ligne face à la foule
    const hold = verbLine(card, 'ligne', 'autoLine', nat.x, nat.z, { label: 'Bloquer ici, face à la foule' });
    let sent: number[] = [];
    if (hold) {
      const h = this.send({ ...nat, verb: 'face_foule' }, hold, who, where, card);
      if (h.ok) sent = h.squads;
    }
    core.legalChain.start(r.plan);
    return { ok: true, text: r.plan.viaOfficer ? 'Sommations demandées à l’officier sur place' : 'Sommations lancées', squads: sent, ignored: false };
  }

  /** Secours ici : pompiers (feu) ou SAMU (blessé) au point ; le groupe choisi y va (secourir). */
  private rescue(nat: NaturalOrder, who: Addressee | null): GiveResult {
    const core = this.core;
    const fire = /feu|incendie/i.test(nat.text);
    const kind: RescueKind = fire ? 'pompiers' : 'samu';
    let called = false;
    if (core.rescue && core.scope().canDelegate) {
      this.field.callRescue(kind, nat.x, nat.z, 0);
      called = true;
    } else {
      called = requestRescueAtPlayer(core, kind);
    }
    let squads: number[] = [];
    if (who && who.squadIds.length > 0) {
      const list = who.squadIds.map((id) => this.ctx.squads.get(id)).filter((s): s is Squad => !!s);
      const before = core.verbHint;
      core.verbHint = 'secours';
      try {
        const r = core.issue('secourir', list, [{ x: nat.x, z: nat.z, heading: 0, width: 0, place: nat.place }], nat.personId);
        if (r.ok) squads = list.map((s) => s.id);
      } finally {
        core.verbHint = before;
      }
    }
    if (!called && squads.length === 0) return { ok: false, text: 'Les secours sont déjà demandés.', squads: [], ignored: false };
    return { ok: true, text: nat.text, squads, ignored: false };
  }

  /** « Avec moi » à ces unités : à pied s'il est à pied, en colonne derrière lui s'il est à bord. */
  private withMe(ids: readonly number[], text: string): GiveResult {
    const core = this.core;
    const me = core.player();
    const list = ids.map((id) => this.ctx.squads.get(id)).filter((s): s is Squad => !!s);
    if (!me || list.length === 0) return { ok: false, text: REFUS.personne, squads: [], ignored: false };
    const before = core.verbHint;
    core.verbHint = 'avec_moi';
    try {
      const r = core.issue(me.vehicleId !== 0 ? 'avec_moi' : 'suivre_pied', list, null);
      return r.ok ? { ok: true, text, squads: list.map((s) => s.id), ignored: false } : { ok: false, text: r.reason, squads: [], ignored: false };
    } finally {
      core.verbHint = before;
    }
  }

  /** Le fourgon cellulaire vient au joueur (sans débarquer) ; ticket « Faire venir ». */
  private callVan(squadId: number, me: Person): boolean {
    const cmd = this.ctx.service<CommandLike>('police.command');
    const s = this.ctx.squads.get(squadId);
    if (!cmd || typeof cmd.arrive !== 'function' || !s) return false;
    const lead = s.vehicleId !== 0 ? this.ctx.vehicles.get(s.vehicleId) : undefined;
    const heading = lead ? Math.atan2(me.x - lead.x, me.z - lead.z) : me.heading;
    if (!cmd.arrive(squadId, { x: me.x, z: me.z, heading, layout: 'file', boardFirst: false, disembark: false })) return false;
    const t = newTicket(this.nextTicketId++, s.id, s.name, 'faire_venir', 'colonne', '', this.now());
    this.addEntry(t, null, 0, me.x, me.z);
    const d = lead ? Math.hypot(lead.x - me.x, lead.z - me.z) : 0;
    this.ctx.ui.notify(CUSTODY_TEXTS.vanComing(s.name, d / 6 + 10), 'info', 5);
    return true;
  }

  private nearestVanName(x: number, z: number): string {
    let best = '';
    let bd = Infinity;
    for (const s of this.ctx.squads.list) {
      if (s.vehicleId === 0) continue;
      const v = this.ctx.vehicles.get(s.vehicleId);
      if (!v || v.kind !== 'fourgon_cellulaire') continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) {
        bd = d;
        best = s.name;
      }
    }
    return best !== '' ? best : vanWords('');
  }

  // ───────────────────────────── A : avec moi ─────────────────────────────

  avecMoi(opts: { fromScreen?: boolean } = {}): GiveResult {
    if (!opts.fromScreen && this.screenGuard()) return this.ignored();
    const now = this.now();
    if (now - this.lastGiveAt < GUARD_TIME) return this.ignored();
    const core = this.core;
    const me = core.player();
    if (!me) return this.refuse(REFUS.personne, true);
    const env = this.env();
    const unit = unitOfKey(env, this.who.key);
    let targets: number[];
    if (unit) targets = [unit.squadId];
    else {
      const own = core.followUnit();
      targets = (own ? [own.id] : []).concat(this.outsideUnits(own));
    }
    if (targets.length === 0) return this.refuse(REFUS.personne, true);
    const before = this.snapshotOf(targets, 'avec_moi', unit ? unit.name : 'tout le monde');
    let r: GiveResult;
    const own = core.followUnit();
    if (!unit && own) {
      // son unité entière (sa racine : l'état-major compris), comme « Suivez-moi » ; puis les unités hors de sa racine
      const verbBefore = core.verbHint;
      core.verbHint = 'avec_moi';
      try {
        const a = core.callFollow(me.vehicleId !== 0);
        const rest = targets.slice(1);
        const b = rest.length > 0 ? this.withMe(rest, '') : null;
        const squads = [...(a.ok ? [own.id] : []), ...(b && b.ok ? b.squads : [])];
        r = squads.length > 0 ? { ok: true, text: 'Avec moi', squads, ignored: false } : { ok: false, text: a.reason, squads: [], ignored: false };
      } finally {
        core.verbHint = verbBefore;
      }
    } else r = this.withMe(targets, 'Avec moi');
    if (r.ok) {
      this.lastGiveAt = now;
      this.who = consumeWho(this.who);
      this.undoEntry = { ...before, at: now };
      this.evaluate(true);
    } else if (r.text !== '') this.ctx.ui.notify(r.text, 'warn', 5);
    return r;
  }

  /** Unités sous ses ordres qui ne dépendent pas de son unité (attachées), sans les fourgons cellulaires. */
  private outsideUnits(own: Squad | null): number[] {
    const core = this.core;
    const ctx = this.ctx;
    const scope = core.scope().squadIds;
    const out: number[] = [];
    for (const id of scope) {
      const s = ctx.squads.get(id);
      if (!s || (own && (s.id === own.id || isUnder(ctx, s.id, own.id)))) continue;
      if (s.parentId !== 0 && scope.has(s.parentId)) continue;
      // (unité d'un commissariat au poste, en alerte ou au repos : elle n'est pas engagée)
      if (core.atPost(s.id)) continue;
      const v = s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
      if (v && v.kind === 'fourgon_cellulaire') continue;
      out.push(s.id);
    }
    return out.sort((a, b) => a - b);
  }

  // ───────────────────────────── ⌫ : annuler ─────────────────────────────

  /** État avant l'ordre prêt (pour ⌫) : null si l'ordre ne s'adresse à aucune unité. */
  private snapshotFor(nat: NaturalOrder): Omit<UndoEntry, 'at'> | null {
    if (!nat.who || nat.who.squadIds.length === 0) return null;
    if (nat.verb === 'confier' || nat.verb === 'remettre' || nat.verb === 'emmener' || nat.verb === 'partir' || nat.verb === 'secours') return null;
    return this.snapshotOf(nat.who.squadIds, nat.verb, nat.who.label);
  }

  private snapshotOf(targets: readonly number[], verb: DirectVerb, who: string): Omit<UndoEntry, 'at'> {
    const ctx = this.ctx;
    const prev = new Map<number, PlayerOrderRecord | null>();
    const own: UndoEntry['own'] = [];
    const seen = new Set<number>(targets);
    for (const id of targets) {
      const r = this.core.playerOrderRecord(id);
      prev.set(id, r ? { ...r } : null);
    }
    // les sous-unités qui avaient leur propre ordre (le plus récent de leur lignée), parents d'abord
    const queue = targets.slice();
    for (let i = 0; i < queue.length && i < 400; i++) {
      for (const c of ctx.squads.childrenOf(queue[i]!)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        queue.push(c.id);
        const r = this.core.playerOrderRecord(c.id);
        if (r && r.squadId === c.id) own.push({ squadId: c.id, record: { ...r } });
      }
    }
    return { who, verb, targets: targets.slice(), prev, own };
  }

  undoable(): UndoInfo | null {
    const u = this.undoEntry;
    if (!u) return null;
    const until = u.at + UNDO_WINDOW;
    if (this.now() > until) return null;
    return { who: u.who, verb: VERB_WORDS[u.verb].label, until };
  }

  undo(): GiveResult {
    if (this.screenGuard()) return this.ignored();
    const u = this.undoEntry;
    if (!u || this.now() - u.at > UNDO_WINDOW) {
      this.undoEntry = null;
      return this.ignored();
    }
    this.undoEntry = null;
    const core = this.core;
    const done: number[] = [];
    for (const id of u.targets) {
      const s = this.ctx.squads.get(id);
      if (!s) continue;
      const prev = u.prev.get(id) ?? null;
      if (prev) {
        if (core.reissue(s, prev)) done.push(id);
      } else if (u.verb !== 'avec_moi') {
        // aucun ordre du joueur avant : l'unité revient avec lui
        if (core.reissue(s, followRecord(s.id, this.now()))) done.push(id);
      }
    }
    for (const o of u.own) {
      const s = this.ctx.squads.get(o.squadId);
      if (s && core.reissue(s, o.record)) done.push(s.id);
    }
    this.evaluate(true);
    return { ok: done.length > 0, text: done.length > 0 ? `Ordre annulé — ${u.who}` : '', squads: done, ignored: done.length === 0 };
  }

  // ───────────────────────────── carte (trop loin) ─────────────────────────────

  farTarget(): FarTarget | null {
    return this.far;
  }

  openFar(): boolean {
    const f = this.far;
    if (!f) return false;
    this.ctx.ui.open('carte_tactique', { x: f.x, z: f.z, squadIds: f.squadIds, intent: f.intent });
    return true;
  }

  // ───────────────────────────── tickets ─────────────────────────────

  get tickets(): readonly Ticket[] {
    return this.list;
  }

  ticketOf(squadId: number): Ticket | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.ticket.squadId === squadId && e.ticket.state !== 'remplace') return e.ticket;
    }
    return null;
  }

  /** Un ordre du joueur vient d'être posé (CommandCore.issue) : son ticket, à l'instant même (« reçu »). */
  private onRecord(r: PlayerOrderRecord): void {
    const s = this.ctx.squads.get(r.squadId);
    if (!s) return;
    if (!r.verb) {
      // un ordre sans verbe direct (embarquer, protéger…) remplace quand même le ticket de l'unité
      this.replace(s.id);
      return;
    }
    const t = newTicket(this.nextTicketId++, s.id, s.name, r.verb, r.type, r.place, r.issuedAt);
    // l'ordre d'avant : le sien, ou celui de l'unité dont elle dépend s'il est plus récent (« Avec moi » à toute la
    // compagnie) — pas une autre tâche : c'est l'ordre tenu avant elle qui compte
    let last = this.lastRecords.get(s.id) ?? null;
    const up = s.parentId !== 0 ? this.core.playerOrderRecord(s.parentId) : null;
    if (up && up.squadId !== s.id && (!last || up.issuedAt > last.issuedAt)) last = up;
    const before = last && last.verb && TASK_VERBS.has(last.verb) ? null : last;
    if (!TASK_VERBS.has(r.verb)) this.lastRecords.set(s.id, { ...r });
    const g = r.geom;
    const me = this.core.player();
    const lead = s.leaderId !== 0 ? this.ctx.people.get(s.leaderId) : undefined;
    const x = g ? g.x : r.verb === 'avec_moi' && me ? me.x : lead ? lead.x : 0;
    const z = g ? g.z : r.verb === 'avec_moi' && me ? me.z : lead ? lead.z : 0;
    this.addEntry(t, r, r.targetId > 0 && (r.verb === 'interpeller' || r.verb === 'constater') ? r.targetId : 0, x, z, before);
  }

  /**
   * Un nouvel ordre à l'unité `squadId` remplace son ticket — et ceux des unités qui dépendent d'elle : l'ordre donné à
   * la compagnie (« Suivez-moi ») vaut pour ses sections, dont le ticket périmé restait à l'écran (« MISTRAL 4 · Bloquer
   * … en route » alors qu'elle suivait le joueur).
   */
  private replace(squadId: number): void {
    const now = this.now();
    for (const e of this.entries) {
      if (e.ticket.state === 'remplace') continue;
      if (e.ticket.squadId !== squadId && !isUnder(this.ctx, e.ticket.squadId, squadId)) continue;
      e.ticket = { ...e.ticket, state: 'remplace', since: now };
    }
  }

  private addEntry(t: Ticket, record: PlayerOrderRecord | null, personId: number, x = 0, z = 0, before: PlayerOrderRecord | null = null): void {
    this.replace(t.squadId);
    this.entries.push({
      ticket: t, record, x, z, personId, done: null, refused: null, blocked: null, blockedAt: -1e9, watch: [], watchUsed: false,
      changedAt: t.issuedAt, before, doneAt: -1, returned: false, taskDone: false,
    });
    this.prune();
  }

  private prune(): void {
    const now = this.now();
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (expired(e.ticket, now) || (now - e.changedAt > TICKET_STALE && e.ticket.state !== 'refuse')) this.entries.splice(i, 1);
    }
    while (this.entries.length > TICKETS_MAX) this.entries.shift();
    this.list.length = 0;
    for (const e of this.entries) if (e.ticket.state !== 'remplace') this.list.push(e.ticket);
  }

  /** Événements de la simulation : fin d'une manœuvre, formation en place, refus. */
  onPoliceEvent(kind: 'done' | 'in_place' | 'refused', e: DoneEvent): void {
    if (!e || typeof e.squadId !== 'number') return;
    if (kind !== 'refused') this.core.notePoliceDone(e.squadId, kind === 'done' ? e.type ?? null : null, kind === 'in_place' ? true : e.ok === true);
    const ctx = this.ctx;
    for (const en of this.entries) {
      const t = en.ticket;
      if (t.state === 'remplace' || t.state === 'en_place' || t.state === 'refuse') continue;
      const own = e.squadId === t.squadId;
      const under = !own && TASK_VERBS.has(t.verb) && isUnder(ctx, e.squadId, t.squadId);
      if (!own && !under) continue;
      const s = ctx.squads.get(t.squadId);
      if (!s) continue;
      const type = kind === 'in_place' ? s.order.type : e.type;
      if (t.orderType && type !== t.orderType) continue;
      if (kind === 'in_place') {
        if (s.order.issuedAt + 1e-6 < t.issuedAt) continue;
        en.done = { ok: true, reason: '' };
      } else if (kind === 'done') {
        // un abandon sans motif (ordre remplacé) n'est pas un refus à dire
        if (e.ok !== true && (!e.reason || e.reason === '')) continue;
        en.done = { ok: e.ok === true, reason: e.reason ?? '' };
        if (own && e.ok === true) en.taskDone = true;
      } else {
        en.refused = e.reason ?? '';
      }
    }
  }

  /**
   * Interpellation ou secours réussi par une unité dont c'est l'ordre même — la BRAV-M, qui n'en fait pas la
   * tâche d'un de ses groupes : elle reprend l'ordre du joueur qu'elle tenait avant, ou revient avec lui (plan §3.2 :
   * jamais laissée au fourgon cellulaire, « interpelle » affiché pour de bon). Une section, elle, garde son ordre : la
   * simulation le lui rend dès que son binôme a fini.
   */
  private backAfterTask(e: TicketEntry, now: number): void {
    const t = e.ticket;
    const s = this.ctx.squads.get(t.squadId);
    if (!s || s.order.type !== t.orderType || s.order.byPlayer !== true || s.order.issuedAt + 1e-6 < t.issuedAt) {
      e.returned = true;
      return;
    }
    if (e.doneAt < 0) e.doneAt = now;
    if (now - e.doneAt < RETURN_AFTER_DONE) return;
    e.returned = true;
    const prev = e.before ?? followRecord(s.id, now);
    if (!this.core.reissue(s, prev)) return;
    // le ticket de ce retour (créé à l'instant par l'ordre redonné) le dit : « revient avec vous », pas « Avec moi · reçu »
    if (prev.verb === 'avec_moi') {
      for (const en of this.entries) {
        if (en.ticket.squadId === s.id && en.ticket.verb === 'avec_moi' && en.ticket.state !== 'remplace' && en.ticket.issuedAt >= now - 1e-6) en.ticket = { ...en.ticket, back: true };
      }
    }
  }

  /**
   * Étape d'une colonne ('command:convoy') : un mouvement en véhicules sans ordre à reprendre au débarquement (« Faire
   * mouvement », « Y aller » loin) est fait quand la colonne est en place.
   */
  onConvoyStage(squadId: number, stage: string): void {
    if (stage !== 'en_place') return;
    for (const en of this.entries) {
      const t = en.ticket;
      if (t.squadId !== squadId || en.done || t.state === 'remplace' || t.state === 'en_place' || t.state === 'refuse') continue;
      if (this.core.afterConvoy.has(squadId)) continue;
      if (t.orderType === 'faire_mouvement' || t.orderType === 'colonne' || t.orderType === 'avancer') en.done = { ok: true, reason: '' };
    }
  }

  /** À chaque pas de la simulation : écrans, tickets, surveillance. */
  update(): void {
    this.trackScreens();
    if (this.entries.length === 0) return;
    const now = this.now();
    // tickets relus quatre fois par seconde (la ligne d'état n'en demande pas plus)
    if (now - this.ticketAt < TICKET_PERIOD) return;
    this.ticketAt = now;
    const watch = now - this.watchAt >= WATCH_PERIOD;
    if (watch) this.watchAt = now;
    for (const e of this.entries) {
      const t = e.ticket;
      if (t.state === 'remplace') continue;
      if (!this.ctx.squads.get(t.squadId)) {
        e.ticket = { ...t, state: 'remplace', since: now };
        continue;
      }
      const snap = this.snapshot(e);
      if (watch) this.watchdog(e, snap);
      if (e.blocked !== null && now - e.blockedAt > BLOCK_SHOW) e.blocked = null;
      snap.blocked = e.blocked;
      const n = next(t, snap, now);
      if (n.state !== t.state) e.changedAt = now;
      e.ticket = n;
      // (tâche réussie seulement : refusée ou abandonnée, le ticket dit pourquoi et l'unité rend compte d'elle-même)
      if (!e.returned && e.taskDone && TASK_VERBS.has(t.verb)) this.backAfterTask(e, now);
    }
    this.prune();
  }

  /** Ce que la simulation dit de l'unité du ticket à cet instant. */
  private snapshot(e: TicketEntry): TicketSnapshot {
    const ctx = this.ctx;
    const core = this.core;
    const t = e.ticket;
    const snap = emptySnapshot();
    const s = ctx.squads.get(t.squadId)!;
    const me = core.player();
    const meId = me ? me.id : 0;
    // le point suivi : le joueur (Avec moi), la personne à interpeller
    if (t.verb === 'avec_moi' && me) {
      e.x = me.x;
      e.z = me.z;
    } else if (e.personId !== 0) {
      const p = ctx.people.get(e.personId);
      if (p) {
        e.x = p.x;
        e.z = p.z;
      }
    }
    const perVehicle = new Map<number, number>();
    let sx = 0, sz = 0, n = 0, nearest = Infinity;
    const walk = (q: Squad, depth: number): void => {
      for (const id of q.members) {
        if (id === meId) continue;
        const p = ctx.people.get(id);
        if (!p || ctx.health.isIncapacitated(p)) continue;
        snap.agents++;
        if (p.vehicleId !== 0) {
          const v = ctx.vehicles.get(p.vehicleId);
          // le conducteur reste au volant : il ne « descend » pas
          const driver = v ? v.def.seats.some((seat, i) => seat.role === 'driver' && v.seats[i] === p.id) : false;
          if (!driver) {
            snap.seated++;
            if (v && v.kind === 'moto_bravm') snap.seatedOnMotos = (snap.seatedOnMotos ?? 0) + 1;
            perVehicle.set(p.vehicleId, (perVehicle.get(p.vehicleId) ?? 0) + 1);
          }
          const vx = v ? v.x : p.x, vz = v ? v.z : p.z;
          sx += vx;
          sz += vz;
        } else {
          sx += p.x;
          sz += p.z;
          if (Math.hypot(p.vx, p.vz) > MOVING_SPEED) snap.moving++;
        }
        n++;
        nearest = Math.min(nearest, Math.hypot(p.x - e.x, p.z - e.z));
      }
      if (depth < 8) for (const c of ctx.squads.childrenOf(q.id)) walk(c, depth + 1);
    };
    walk(s, 0);
    snap.seatedPerVehicle = [...perVehicle.values()];
    snap.distance = n > 0 ? Math.hypot(sx / n - e.x, sz / n - e.z) : -1;
    const phase = core.phaseOf(s.id);
    if (phase.convoy) snap.convoy = { stage: phase.convoy.stage, remaining: phase.convoy.remaining, waitLeft: phase.convoy.departIn };
    if (phase.bravm) snap.bravm = { stage: phase.bravm, eta: -1 };
    snap.done = e.done;
    snap.refused = e.refused;
    // fins qui ne passent pas par un événement
    if (!snap.done && now(ctx) - t.issuedAt >= 1) {
      if (t.verb === 'avec_moi' && this.followsPlayer(s, meId)) snap.done = { ok: true, reason: '' };
      else if (t.orderType && IMMEDIATE_DONE.has(t.orderType)) snap.done = { ok: true, reason: '' };
      else if ((t.verb === 'faire_venir' || t.verb === 'venir') && s.vehicleId !== 0) {
        const v = ctx.vehicles.get(s.vehicleId);
        if (v && Math.hypot(v.x - e.x, v.z - e.z) < 20) snap.done = { ok: true, reason: '' };
      }
    }
    // action en cours : poursuite d'un individu, refoulement, secours
    if (!snap.done) {
      if ((t.verb === 'interpeller' || t.verb === 'constater') && e.personId !== 0) {
        const p = ctx.people.get(e.personId);
        if (p && p.custody === 'free' && nearest < 60) snap.action = { kind: 'poursuite', distance: nearest };
        else if (p && p.custody !== 'free') snap.action = { kind: 'remise', distance: -1 };
      } else if (t.verb === 'disperser' && s.order.type === 'refoulement' && snap.moving > 0 && snap.distance < 30) {
        snap.action = { kind: 'refoulement', distance: -1 };
      } else if (t.verb === 'secours' && snap.distance >= 0 && snap.distance < 15) {
        snap.action = { kind: 'secours', distance: -1 };
      }
    }
    return snap;
  }

  private followsPlayer(s: Squad, meId: number): boolean {
    const o = s.order;
    if (meId !== 0 && o.type === 'suivre' && o.targetId === meId) return true;
    if (o.type === 'avec_moi') return true;
    const f = this.ctx.service<FollowLike>('session.follow');
    return !!f && typeof f.inColumn === 'function' && f.inColumn(s.id);
  }

  /**
   * Surveillance (§2.5) : en route, l'unité (ou son véhicule de tête) s'est-elle rapprochée de 5 m en 15 s ? Sinon,
   * « bloqué » avec la raison du pilote automatique, et — une fois, à moins de 400 m du point — elle quitte sa colonne,
   * descend là où elle est et finit à pied (l'ordre est redonné à pied).
   */
  private watchdog(e: TicketEntry, snap: TicketSnapshot): void {
    const t = e.ticket;
    const c = snap.convoy;
    // pas de surveillance : « Avec moi », tâche (interpeller, constater, secours : seul un binôme sort, le centre de
    // l'unité ne bouge pas — l'ordre redonné relançait la tâche), hors route, déjà sur place, ou colonne qui attend
    // encore son départ ; ni la BRAV-M : elle met pied à terre d'elle-même quand ses motos n'avancent plus et finit à pied
    // (sim/police/command/bravm.ts) — l'ordre redonné ici la renvoyait remonter en selle, pour un point à plus de 150 m
    if (e.watchUsed || t.verb === 'avec_moi' || TASK_VERBS.has(t.verb) || snap.bravm !== null || t.state !== 'route' || snap.distance < 0 || snap.distance < WATCH_NEAR || snap.done
      || (c !== null && (c.stage !== 'route' || c.waitLeft > 0 || snap.distance < WATCH_CONVOY_NEAR))) {
      e.watch.length = 0;
      return;
    }
    // l'unité tient depuis un autre ordre du joueur — donné à l'unité dont elle dépend (« Suivez-moi » à toute la
    // compagnie : le ticket de la section, lui, n'est pas remplacé) : son ancien ordre ne lui est jamais redonné. Relevé
    // du commandant (cdt-05) : MISTRAL 4, rappelée par « Suivez-moi », repartait barrer sa rue vingt secondes plus tard.
    const held = this.ctx.squads.get(t.squadId)?.order;
    if (held && held.byPlayer === true && held.type !== t.orderType && held.issuedAt > t.issuedAt + 1e-6) {
      e.watchUsed = true;
      e.watch.length = 0;
      return;
    }
    const now = this.now();
    // progrès : l'unité elle-même (centre), ou sa colonne (itinéraire restant de la tête)
    e.watch.push({ t: now, d: snap.distance, r: c ? c.remaining : -1 });
    while (e.watch.length > 1 && now - e.watch[1]!.t >= WATCH_WINDOW) e.watch.shift();
    const first = e.watch[0]!;
    if (now - first.t < WATCH_WINDOW || first.d - snap.distance >= WATCH_GAIN) return;
    if (c && first.r >= 0 && first.r - c.remaining >= WATCH_GAIN) return;
    if (snap.distance > WATCH_RELEASE) {
      // trop loin pour finir à pied : la colonne garde la main (la ligne ne promet pas « à pied »)
      e.watch.length = 0;
      return;
    }
    e.watchUsed = true;
    e.watch.length = 0;
    e.blocked = blockWords(this.blockReason(t.squadId, snap));
    e.blockedAt = now;
    this.finishOnFoot(e);
  }

  /** Raison d'un blocage : celle du pilote automatique du véhicule de l'unité, sinon la foule ou la route barrée. */
  private blockReason(squadId: number, snap: TicketSnapshot): string {
    const ctx = this.ctx;
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    for (let q = ctx.squads.get(squadId), guard = 0; q && guard < 9; q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined, guard++) {
      const v = q.vehicleId !== 0 ? ctx.vehicles.get(q.vehicleId) : undefined;
      if (v && ap && typeof ap.status === 'function') {
        const r = ap.status(v).reason;
        if (r && r !== '') return r;
      }
    }
    return snap.seated > snap.agents / 2 ? 'obstacle' : 'foule';
  }

  /** L'unité quitte sa colonne et redonne l'ordre à pied (elle descend d'abord : sim/police/maneuver.ts). */
  private finishOnFoot(e: TicketEntry): void {
    const ctx = this.ctx;
    const core = this.core;
    const r = e.record;
    const s = ctx.squads.get(e.ticket.squadId);
    if (!s || !r || !r.geom) return;
    core.afterConvoy.delete(s.id);
    // libérée de sa colonne tout de suite (un ordre sans point : police.command.takeOver la libère où qu'elle soit)
    ctx.service<CommandLike>('police.command')?.takeOver?.(s.id, { type: r.type, byPlayer: true });
    ctx.service<FollowLike>('session.follow')?.release?.(s.id);
    const g = r.geom;
    ctx.squads.issue(s.id, {
      type: r.type, x: g.x, z: g.z, heading: g.heading, width: g.width, targetId: r.targetId, maxForce: core.effectiveForce(),
      issuedBy: ctx.player.state.personId, place: r.place, byPlayer: true,
    });
    r.done = false;
  }

  /** Nouvelle session : tout est oublié. */
  reset(): void {
    this.external = null;
    this.shown = null;
    this.evalAt = -1e9;
    this.readAt = -1e9;
    this.who = WHO_AUTO;
    this.lastGiveAt = -1e9;
    this.closedAt = -1e9;
    this.legalPress = null;
    this.undoEntry = null;
    this.far = null;
    this.watchAt = -1e9;
    this.ticketAt = -1e9;
    this.entries.length = 0;
    this.list.length = 0;
    this.lastRecords.clear();
  }
}

function now(ctx: GameContext): number {
  return ctx.clock.now;
}

/** L'unité `id` est-elle sous l'unité `ancestor` (à un niveau quelconque) ? */
function isUnder(ctx: GameContext, id: number, ancestor: number): boolean {
  let s = ctx.squads.get(id);
  for (let guard = 0; s && guard < 9; guard++) {
    if (s.parentId === ancestor) return true;
    s = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined;
  }
  return false;
}

/** « Avec moi » comme ordre du joueur à redonner (annulation sans ordre précédent). */
function followRecord(squadId: number, t: number): PlayerOrderRecord {
  return { squadId, type: 'suivre_pied', verb: 'avec_moi', geom: null, targetId: 0, issuedAt: t, place: '', done: false };
}

/** Qui de la carte pour une unité choisie par les ordres directs. */
function candidate(who: Addressee): WhoCandidate {
  return { squadIds: who.squadIds.slice(), label: who.label, mode: 'pied', eta: 0, distance: who.distance, busy: who.leaves };
}
