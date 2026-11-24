/* =====================================================================================
 * COMMISSARIATS (jeu) — système de simulation (ordre SystemOrder.CONTROL + 7 : juste après les patrouilles). Sans DOM.
 *
 * Demande du joueur : « fais plusieurs commissariats dans la ville pour, quand je serai commandant, pouvoir dispatcher
 * des unités ». Le service 'police.commissariats' (api.ts) tient le stock des sept sites réels :
 *
 *   mise en place   à la mise en place de la session ('session:setup'), les véhicules du stock sont garés sur leurs
 *                   places réservées, sans équipage (places occupées, par la compagnie à la caserne de la Cité par
 *                   exemple : places de réserve, sinon véhicule « virtuel », créé à l'engagement) ;
 *   engagement      engage() : l'unité réelle est construite à la place des véhicules garés, équipage à bord, « En
 *                   alerte » ; l'interface lui donne ensuite sa destination par les ordres habituels. Partie à plus de
 *                   60 m de ses places : « Engagé — <secteur> » ;
 *   retour          recall() : destination du retour (centre de la file de ses places ; unité d'ailleurs accueillie
 *                   sur les places de réserve) ; l'interface la fait rouler sans urgence. À l'arrivée : interpellés
 *                   encore à bord remis à l'officier de police judiciaire, réserves complétées, repos (2 min, 5 min si
 *                   le moral est bas), puis « Au poste ». Les véhicules se garent dans leurs places (un véhicule rentré
 *                   à contresens fait le tour) ; ce qui reste mal garé est rangé hors de la vue du joueur ; une BRAV-M
 *                   arrêtée en route loin de ses places reçoit de nouveau l'ordre de rentrer ;
 *   véhicule pris   un policier qui monte dans un véhicule garé, ou un véhicule garé détruit, le retire du stock.
 *
 * Les autres systèmes ignorent les véhicules garés par isHeldVehicle() ('@/world/commissariats'), qui interroge holds().
 * Aucun tirage au hasard : tout suit l'ordre des données.
 * ===================================================================================== */

import type { EntityId, GameContext, GameSystem, Person, PoliceRank, RoadSample, SquadOrder, Unsubscribe, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import type { PatrolsApi } from '@/gameplay/patrols/api';
import { SESSION_SETUP_EVENT, SESSION_SETUP_SERVICE } from '@/gameplay/session/api';
import type { SessionSetupApi } from '@/gameplay/session/api';
import { baseOf, isJournee } from '@/gameplay/session/journee-data';
import { isPoliceRole } from '@/gameplay/session/roster';
import type { CommandApi, ConvoyEvent } from '@/sim/police/command/api';
import type { PoliceUnitsApi } from '@/sim/police/api';
import { COMMISSARIATS, fileCentre, nearestCommissariat, vehicleLen } from '@/world/commissariats';
import type { CommissariatDef, Pose, StockTemplate } from '@/world/commissariats';
import {
  COMMISSARIATS_SERVICE, COMMISSARIATS_SYSTEM_ID, COMMISSARIAT_ENGAGED_EVENT, COMMISSARIAT_RETURNED_EVENT,
  COMMISSARIAT_STOCK_EVENT,
} from './api';
import type {
  CommissariatEngagedEvent, CommissariatReturnedEvent, CommissariatStockEvent, CommissariatView, CommissariatsApi,
  EngageResult, EntryState, RecallTarget, StockEntryView,
} from './api';
import { buildUnit, crewCount, unitVehicles } from './engage';
import { approachClear, freeSlot, parkTemplate, realKind, slotFree } from './stock';
import { REFUS, adoptedLabel, availableText, radioFrame, readyText, returnedText } from './texts';

// ───────────────────────────── réglages ─────────────────────────────

/** Mise à jour des états (s). */
const TICK = 0.5;
/** Unité en alerte (ou au poste) partie à plus de … m de ses places : engagée. */
const LEFT_AT = 60;
/** Arrivée d'une unité rappelée : à moins de … m du centre de sa file (véhicules) ou de la porte (à pied). */
const ARRIVE_AT = 40;
/** Repos à l'arrivée (s), et repos d'une unité au moral bas (moral < 0,5). */
const REST = 120;
const REST_LOW_MORALE = 300;
/** Patrouille rattachée à un site : son centre de secteur à moins de … m de la porte. */
const PATROL_HOME_AT = 300;
/** Compagnie de la journée de service : base de prise de service à moins de … m de la porte du site. */
const BASE_AT = 150;
/** Ordres donnés juste après le rappel (par l'interface, pour le mouvement de retour) : ne l'interrompent pas (s). */
const RECALL_GRACE = 0.5;

const RANK_LEVEL: Readonly<Record<PoliceRank, number>> = {
  gardien_stagiaire: 0, gardien: 1, brigadier: 2, brigadier_chef: 3, major: 4, capitaine: 5, commandant: 6, commissaire: 7,
};

/** Rangement final sur les places : véhicule à moins de … m d'une place libre de sa file. */
const PARK_REACH = 12;
/** Manœuvre directe du pilote automatique : point d'approche à moins de … m. */
const PARK_DIRECT = 15;
/**
 * Rangement d'un véhicule arrêté en amont de ses places, dans l'axe (queue d'une colonne de motos) : places à moins de
 * … m, points d'approche droit devant lui, à moins de PARK_AHEAD_LAT m de côté.
 */
const PARK_AHEAD = 40;
const PARK_AHEAD_LAT = 8;

/**
 * Le pilote automatique peut-il ranger ce véhicule sur cette place sans faire le tour du pâté de maisons ?
 * `ahead` faux : ses deux points d'approche (`back`, `run` m derrière la place) à moins de PARK_DIRECT m (il y va
 * directement) ; vrai : le véhicule roule dans le sens de la place et les deux points sont droit devant lui.
 */
function reachable(v: Vehicle, s: Pose, back: number, run: number, ahead: boolean): boolean {
  const hs = Math.sin(s.heading), hc = Math.cos(s.heading);
  for (const k of [back, run]) {
    const dx = s.x - hs * k - v.x;
    const dz = s.z - hc * k - v.z;
    if (!ahead) {
      if (Math.hypot(dx, dz) > PARK_DIRECT) return false;
      continue;
    }
    if (Math.cos(v.heading - s.heading) < 0.7) return false;
    const lon = dx * hs + dz * hc;
    const lat = Math.abs(dx * hc - dz * hs);
    if (lon < 0 || lat > PARK_AHEAD_LAT || Math.hypot(dx, dz) > PARK_AHEAD) return false;
  }
  return true;
}

/** Durée pendant laquelle la manœuvre de rangement ne compte pas comme un départ (s). */
const PARK_TIME = 90;
/**
 * Journée de service : les places à moins de … m du point de rassemblement de la compagnie (base de prise de service)
 * restent libres — c'est là que la colonne du jour se forme et fait demi-tour (à la Cité, le PC mobile garé sur la
 * base bloquait le demi-tour du fourgon de tête). Le véhicule prend une autre place, sinon il n'est créé qu'à
 * l'engagement.
 */
const JOURNEE_BASE_CLEAR = 10;

/** Forme attendue du pilote automatique (src/sim/vehicles). */
interface AutopilotLike {
  park(v: Vehicle, x: number, z: number, heading: number): boolean;
  driveTo(v: Vehicle, x: number, z: number, options?: { urgence?: boolean; stopBefore?: number }): boolean;
  status(v: Vehicle): Readonly<{ mode: string; state: string }>;
  stop(v: Vehicle): void;
}

/**
 * Véhicule rentré à contresens de sa place (rue à double sens : arrivé par la voie d'en face) : il fait le tour —
 * d'abord jusqu'à un point loin derrière sa place, puis il revient vers elle dans son sens (demi-tour ou tour du pâté
 * de maisons) et s'y gare. Un véhicule ne se gare jamais à contresens ni en travers de la voie.
 */
interface Homing {
  entry: Entry;
  slot: Pose;
  stage: 'tour' | 'approche';
  viaX: number;
  viaZ: number;
  /** Début de l'étape en cours (s), abandon (s), tours déjà faits. */
  since: number;
  until: number;
  turns: number;
  /** Point d'approche : à … m derrière la place (début de la manœuvre de rangement du pilote automatique). */
  approach: number;
}

/** Tour d'un véhicule rentré à contresens : point de demi-tour à … m (au moins) derrière sa place. */
const TURN_FAR = 60;
/** Durée maximale du tour (s) ; tours au plus. */
const TURN_TIME = 300;
const TURN_MAX = 2;
/** Cap « dans le sens de la place » (cosinus de l'écart). */
const ALIGNED = 0.7;
/** Rangement final hors de la vue du joueur : joueur à plus de … m ; véhicule à moins de … m de la porte du site. */
const TIDY_UNSEEN = 160;
const TIDY_REACH = 260;
/** Retour d'une BRAV-M arrêtée loin de ses places : relance au bout de … s, au plus … fois. */
const RELAUNCH_AFTER = 30;
const RELAUNCH_MAX = 4;
/** Arrivée le long des places du site (et non au centre de sa file) : à moins de ARRIVE_AT − … m d’une place. */
const SITE_SLACK = 0;
/** Reprise du rangement sur les places après un retour, toutes les … s. */
const PARK_RETRY = 6;

/** Ordres que l'unité se donne elle-même en route (convoi) : ils n'interrompent pas un retour. */
const CONVOY_ORDERS: ReadonlySet<string> = new Set(['embarquer', 'debarquer', 'libre']);

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Une unité du stock (ou accueillie), état interne. */
interface Entry {
  view: Mutable<StockEntryView>;
  def: CommissariatDef;
  /** Modèle de stock (null : unité accueillie). */
  template: StockTemplate | null;
  /** Véhicules garés (au poste, sans équipage) et leur place. */
  parked: { id: EntityId; slot: number }[];
  /** Véhicules sans place libre à la mise en place, créés à l'engagement. */
  virtual: number;
  /** Unité gérée par le module des patrouilles. */
  patrol: boolean;
  /** Effectif à l'engagement (seuil d'indisponibilité). */
  crewTotal: number;
  /** Instant du rappel (−1 : aucun). */
  recallAt: number;
  /** Place de retour d'une patrouille accueillie (null : sa place de tête, ou le centre de sa file). */
  homeSlot: Pose | null;
  /** Fin de la manœuvre de rangement sur les places après un retour (temps de simulation). */
  parkUntil: number;
  /** Retour : arrêtée loin de ses places depuis (s ; −1 : elle roule), relances déjà faites. */
  stuckSince: number;
  relaunches: number;
  /** Dernière arrivée au site après un retour (s ; −1 : jamais), dernier ordre du joueur (s ; −1 : aucun). */
  arrivedAt: number;
  orderedAt: number;
  /** Prochaine reprise du rangement sur les places pendant le repos (s). */
  retryAt: number;
}

interface Site {
  def: CommissariatDef;
  view: Mutable<CommissariatView> & { entries: StockEntryView[]; patrols: number[] };
  entries: Entry[];
}

export class CommissariatsSystem implements GameSystem {
  readonly id = COMMISSARIATS_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL + 7;

  private ctx: GameContext | null = null;
  private readonly offs: Unsubscribe[] = [];
  private readonly sites: Site[] = [];
  private readonly views: CommissariatView[] = [];
  private readonly byEntry = new Map<string, Entry>();
  private readonly bySquad = new Map<number, Entry>();
  /** Véhicule garé → son unité du stock. */
  private readonly held = new Map<EntityId, Entry>();
  private active = false;
  private tickAt = 0;
  /** Retrait volontaire en cours (engagement) : l'événement 'vehicle:removed' ne doit pas compter comme une perte. */
  private removing = false;
  private readonly vbuf: Vehicle[] = [];
  /** Véhicules de l'unité examinée par think() (vbuf sert aux fonctions qu'elle appelle). */
  private readonly tbuf: Vehicle[] = [];
  private readonly changed = new Set<string>();
  /** Véhicules rentrés à contresens qui font le tour avant de se garer. */
  private readonly homing = new Map<EntityId, Homing>();
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const self = this;
    const api: CommissariatsApi = {
      get enabled(): boolean {
        return self.active;
      },
      get canDispatch(): boolean {
        return self.refusal() === '';
      },
      get list(): readonly CommissariatView[] {
        return self.views;
      },
      get: (id) => self.siteOf(id)?.view,
      entry: (id) => self.byEntry.get(id)?.view,
      engage: (id, by) => self.engage(id, by ?? 0),
      recall: (id) => self.recall(id),
      holds: (id) => self.held.has(id),
      isStationUnit: (id) => self.entryOfSquad(id) !== null,
      entryOf: (id) => self.entryOfSquad(id)?.view,
      atPost: (id) => {
        const e = self.entryOfSquad(id);
        return !!e && (e.view.state === 'au_poste' || e.view.state === 'alerte' || e.view.state === 'repos');
      },
    };
    ctx.provide<CommissariatsApi>(COMMISSARIATS_SERVICE, api);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.offs.push(ctx.events.onAny(SESSION_SETUP_EVENT, () => {
      this.reset();
      try {
        this.setup();
      } catch (err) {
        console.error('[commissariats] mise en place impossible', err);
      }
    }));
    this.offs.push(ctx.events.on('session:ended', () => this.reset()));
    this.offs.push(ctx.events.on('vehicle:entered', ({ vehicleId }) => this.release(vehicleId)));
    this.offs.push(ctx.events.on('vehicle:state', ({ id, state }) => {
      if (state === 'wrecked' || state === 'burnt') this.release(id);
    }));
    this.offs.push(ctx.events.on('vehicle:removed', ({ id }) => {
      if (!this.removing) this.release(id);
    }));
    this.offs.push(ctx.events.onAny('command:convoy', (e) => this.onConvoy(e as ConvoyEvent)));
    this.offs.push(ctx.events.on('order:issued', ({ squadId, order }) => this.onOrder(squadId, order)));
  }

  reset(): void {
    this.active = false;
    this.sites.length = 0;
    this.views.length = 0;
    this.byEntry.clear();
    this.bySquad.clear();
    this.held.clear();
    this.changed.clear();
    this.homing.clear();
    this.tickAt = 0;
    this.removing = false;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  // ───────────────────────────── activation, droits ─────────────────────────────

  /** Module actif pour cette configuration (hors éditeur et quartier d'essai ; extra.commissariats ≠ false). */
  private static enabledFor(config: { mode: string; extra?: Record<string, unknown> } | null): boolean {
    if (!config || config.mode === 'editeur' || config.mode === 'test') return false;
    return !(config.extra && config.extra['commissariats'] === false);
  }

  /** Motif qui empêche le joueur d'engager une unité ('' : il le peut). */
  private refusal(): string {
    const ctx = this.ctx;
    if (!ctx || !this.active) return REFUS.inactif;
    const cfg = ctx.session.config;
    if (cfg && cfg.extra && cfg.extra['renforts'] === false) return REFUS.renforts;
    const role = ctx.player.state.role;
    const me = ctx.player.person();
    if (!isPoliceRole(role) || (me && me.faction !== 'police')) return REFUS.role;
    const rank = me && me.rank ? RANK_LEVEL[me.rank] ?? -1 : -1;
    if (role === 'commandant' || role === 'commissaire' || rank >= RANK_LEVEL.commandant) return '';
    return REFUS.role;
  }

  // ───────────────────────────── mise en place ─────────────────────────────

  private setup(): void {
    const ctx = this.ctx!;
    const cfg = ctx.session.config;
    if (!CommissariatsSystem.enabledFor(cfg) || ctx.world.edgeCount === 0) return;
    const b = ctx.world.bounds;
    for (const def of COMMISSARIATS) {
      // (carte d'essai ou extrait plus petit : un site hors de la carte n'existe pas)
      if (def.door.x < b.minX || def.door.x > b.maxX || def.door.z < b.minZ || def.door.z > b.maxZ) continue;
      const ret = fileCentre(def, null);
      const view = {
        id: def.id, name: def.name, short: def.short, kind: def.kind, x: def.door.x, z: def.door.z,
        returnX: ret.x, returnZ: ret.z, returnHeading: ret.heading, entries: [] as StockEntryView[],
        available: 0, engaged: 0, resting: 0, patrols: [] as number[],
      };
      const site: Site = { def, view, entries: [] };
      const used = new Set<number>();
      if (cfg && isJournee(cfg)) {
        const base = baseOf(cfg);
        for (let i = 0; i < def.slots.length; i++) {
          const sl = def.slots[i]!;
          if (Math.hypot(sl.x - base.x, sl.z - base.z) < JOURNEE_BASE_CLEAR) used.add(i);
        }
      }
      for (const tpl of def.stock) {
        const p = parkTemplate(ctx, def, tpl, used);
        const kind = realKind(ctx, tpl.vehicle);
        const entry: Entry = {
          view: {
            id: tpl.id, commissariatId: def.id, kind: tpl.kind, callsign: tpl.callsign, label: tpl.label, vehicle: kind,
            vehicles: p.parked.length + p.virtual, crew: tpl.crew, state: 'au_poste', squadId: 0, restUntil: 0,
            vehicleIds: p.parked.map((x) => x.id), engageable: tpl.engageable, where: '',
          },
          def, template: tpl, parked: p.parked, virtual: p.virtual, patrol: false, crewTotal: 0, recallAt: -1, homeSlot: null, parkUntil: 0, stuckSince: -1, relaunches: 0, arrivedAt: -1, orderedAt: -1, retryAt: 0,
        };
        if (p.virtual > 0) {
          console.info(`[commissariats] ${def.short} : ${tpl.callsign}, ${p.virtual} véhicule(s) sans place libre (créé(s) à l'engagement)`);
        }
        for (const x of p.parked) this.held.set(x.id, entry);
        site.entries.push(entry);
        view.entries.push(entry.view);
        this.byEntry.set(tpl.id, entry);
      }
      this.sites.push(site);
      this.views.push(view);
    }
    this.active = this.sites.length > 0;
    for (const s of this.sites) this.recount(s);
  }

  // ───────────────────────────── lectures ─────────────────────────────

  private siteOf(id: string): Site | undefined {
    for (const s of this.sites) if (s.def.id === id) return s;
    return undefined;
  }

  /** Unité du stock de cette unité ou d'une unité qui la contient. */
  private entryOfSquad(squadId: number): Entry | null {
    const ctx = this.ctx;
    if (!ctx || squadId === 0 || this.bySquad.size === 0) return null;
    let s = ctx.squads.get(squadId);
    for (let guard = 0; s && guard < 8; guard++) {
      const e = this.bySquad.get(s.id);
      if (e) return e;
      s = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined;
    }
    return null;
  }

  /** Point de retour d'une unité : sa place de tête (patrouille), sinon le centre de sa file. */
  private homeOf(e: Entry): Pose {
    if (e.homeSlot) return e.homeSlot;
    if (e.patrol && e.template && e.template.slots.length > 0) {
      const s = e.def.slots[e.template.slots[0]!]!;
      return { x: s.x, z: s.z, heading: s.heading };
    }
    return fileCentre(e.def, e.template);
  }

  private recount(site: Site): void {
    let available = 0, engaged = 0, resting = 0;
    for (const e of site.entries) {
      const st = e.view.state;
      if ((st === 'au_poste' || st === 'alerte') && e.view.engageable && e.view.vehicles > 0) available++;
      else if (st === 'engage' || st === 'retour') engaged++;
      else if (st === 'repos') resting++;
    }
    const v = site.view;
    if (v.available !== available || v.engaged !== engaged || v.resting !== resting) this.changed.add(site.def.id);
    v.available = available;
    v.engaged = engaged;
    v.resting = resting;
  }

  private setState(e: Entry, state: EntryState): void {
    if (e.view.state === state) return;
    e.view.state = state;
    if (state !== 'repos') e.view.restUntil = 0;
    this.changed.add(e.def.id);
  }

  /** Compteurs des sites changés remis à jour, puis un événement 'commissariat:stock' par site. */
  private flushChanged(): void {
    if (this.changed.size === 0) return;
    const ids = [...this.changed];
    for (const id of ids) {
      const site = this.siteOf(id);
      if (site) this.recount(site);
    }
    this.changed.clear();
    for (const id of ids) {
      const ev: CommissariatStockEvent = { commissariatId: id };
      this.ctx!.events.emitAny(COMMISSARIAT_STOCK_EVENT, ev);
    }
  }

  // ───────────────────────────── véhicules garés ─────────────────────────────

  /** Un véhicule garé est pris (quelqu'un y monte), détruit ou retiré : il quitte le stock. */
  private release(vehicleId: EntityId): void {
    const e = this.held.get(vehicleId);
    if (!e) return;
    this.held.delete(vehicleId);
    const i = e.parked.findIndex((x) => x.id === vehicleId);
    if (i >= 0) e.parked.splice(i, 1);
    e.view.vehicles = Math.max(0, e.view.vehicles - 1);
    e.view.vehicleIds = e.parked.map((x) => x.id);
    if (e.view.vehicles === 0 && e.view.squadId === 0) this.setState(e, 'indisponible');
    this.changed.add(e.def.id);
    this.flushChanged();
  }

  // ───────────────────────────── engagement ─────────────────────────────

  private engage(entryId: string, by: EntityId): EngageResult {
    const fail = (reason: string): EngageResult => ({ ok: false, reason, squadId: 0, defaultVerb: 'faire_mouvement' });
    const ctx = this.ctx;
    const refused = this.refusal();
    if (!ctx || refused !== '') return fail(refused);
    const e = this.byEntry.get(entryId);
    if (!e) return fail(REFUS.inconnue);
    if (!e.view.engageable) return fail(REFUS.horsDispositif);
    if (e.view.state === 'indisponible') return fail(REFUS.indisponible);
    const verb = this.defaultVerb(e);
    // déjà engagée (unité existante) : la même unité, remise en alerte si elle était au poste
    if (e.view.squadId !== 0) {
      if (!ctx.squads.get(e.view.squadId)) {
        this.setState(e, 'indisponible');
        this.flushChanged();
        return fail(REFUS.indisponible);
      }
      if (e.view.state === 'au_poste') {
        this.setState(e, 'alerte');
        this.announce(e, by);
      }
      this.flushChanged();
      return { ok: true, reason: '', squadId: e.view.squadId, defaultVerb: verb };
    }
    const tpl = e.template!;
    // places : celles des véhicules garés (retirés), puis des places libres pour les véhicules sans place
    const parking: Pose[] = [];
    const used = new Set<number>();
    for (const x of e.parked) used.add(x.slot);
    for (const x of e.parked) {
      const s = e.def.slots[x.slot]!;
      parking.push({ x: s.x, z: s.z, heading: s.heading });
    }
    const ignore = new Set<EntityId>(e.parked.map((x) => x.id));
    const kind = realKind(ctx, tpl.vehicle);
    for (let i = 0; i < e.virtual; i++) {
      const idx = freeSlot(ctx, e.def, tpl, kind, used, ignore);
      if (idx < 0) break;
      const s = e.def.slots[idx]!;
      parking.push({ x: s.x, z: s.z, heading: s.heading });
    }
    const count = e.view.vehicles;
    // véhicules garés retirés avant la construction (l'unité est posée exactement à leur place)
    this.removing = true;
    try {
      for (const x of e.parked) {
        this.held.delete(x.id);
        ctx.vehicles.remove(x.id);
      }
    } finally {
      this.removing = false;
    }
    e.parked.length = 0;
    e.virtual = 0;
    let built = null;
    try {
      built = buildUnit(ctx, e.def, tpl, parking, count);
    } catch (err) {
      console.error(`[commissariats] engagement de ${tpl.callsign} impossible`, err);
    }
    if (!built) {
      e.view.vehicles = 0;
      e.view.vehicleIds = [];
      this.setState(e, 'indisponible');
      this.flushChanged();
      return fail(REFUS.impossible);
    }
    ctx.people.rebuildIndex();
    e.patrol = built.patrol;
    e.crewTotal = built.crew;
    e.view.squadId = built.squadId;
    e.view.vehicles = built.vehicles.length;
    e.view.vehicleIds = built.vehicles.map((v) => v.id);
    this.bySquad.set(built.squadId, e);
    this.setState(e, 'alerte');
    this.announce(e, by);
    const ev: CommissariatEngagedEvent = { commissariatId: e.def.id, entryId: e.view.id, squadId: built.squadId, t: ctx.clock.now };
    ctx.events.emitAny(COMMISSARIAT_ENGAGED_EVENT, ev);
    this.flushChanged();
    return { ok: true, reason: '', squadId: built.squadId, defaultVerb: verb };
  }

  private defaultVerb(e: Entry): EngageResult['defaultVerb'] {
    const k = e.view.kind;
    if (k === 'police_secours' || k === 'bac' || e.patrol) return 'avancer';
    if (k === 'bravm') return 'colonne';
    return 'faire_mouvement';
  }

  /** « CENTRAL ICI TV 75-19. Équipage prêt au commissariat du 9e, en attente de destination. PARLEZ. » */
  private announce(e: Entry, by: EntityId): void {
    const ctx = this.ctx!;
    const squad = ctx.squads.get(e.view.squadId);
    ctx.radio.say({
      channel: 'commandement', from: e.view.callsign, priority: 1, personId: squad ? squad.leaderId : undefined,
      text: radioFrame(this.superiorOf(by), e.view.callsign, readyText(e.def), true),
    });
  }

  /** Indicatif de celui qui ordonne (son unité), sinon CENTRAL. */
  private superiorOf(by: EntityId): string {
    const ctx = this.ctx!;
    if (by !== 0) {
      const p = ctx.people.get(by);
      const s = p && p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
      if (s && s.name !== '') return s.name.toUpperCase();
    }
    return 'CENTRAL';
  }

  // ───────────────────────────── rappel ─────────────────────────────

  private recall(squadId: number): RecallTarget | null {
    const ctx = this.ctx;
    if (!ctx || !this.active) return null;
    const squad = ctx.squads.get(squadId);
    if (!squad || squad.faction !== 'police') return null;
    let e = this.entryOfSquad(squadId);
    if (!e) {
      const def = this.homeFor(squadId);
      if (!def) return null;
      e = this.adopt(squadId, def);
    }
    const now = ctx.clock.now;
    if (e.patrol && e.view.state !== 'alerte') e.homeSlot = this.patrolSlot(e);
    const home = this.homeOf(e);
    const st = e.view.state;
    if (st === 'alerte') {
      // pas encore partie : elle reste dans ses places, l'alerte est levée
      this.setState(e, 'au_poste');
    } else if (st === 'engage' || st === 'retour') {
      e.recallAt = now;
      e.stuckSince = -1;
      e.relaunches = 0;
      this.setState(e, 'retour');
    }
    this.flushChanged();
    return { commissariatId: e.def.id, x: home.x, z: home.z, heading: home.heading, doorX: e.def.door.x, doorZ: e.def.door.z };
  }

  /**
   * Site de rattachement d'une unité qui n'est pas du stock : patrouille → son commissariat ; compagnie de la journée
   * de service → sa base de prise de service ; autre → le site le plus proche.
   */
  private homeFor(squadId: number): CommissariatDef | null {
    const ctx = this.ctx!;
    const active = (c: CommissariatDef): boolean => this.siteOf(c.id) !== undefined;
    const patrols = ctx.service<PatrolsApi>('police.patrols');
    const pv = patrols ? patrols.statusOf(squadId) : null;
    if (pv) {
      const c = nearestCommissariat(pv.homeX, pv.homeZ, active);
      if (c && Math.hypot(c.door.x - pv.homeX, c.door.z - pv.homeZ) <= PATROL_HOME_AT) return c;
    }
    const cfg = ctx.session.config;
    const setup = ctx.service<SessionSetupApi>(SESSION_SETUP_SERVICE);
    const root = this.rootOf(squadId);
    if (cfg && isJournee(cfg) && setup && setup.summary && setup.summary.rootSquadId !== 0 && root === setup.summary.rootSquadId) {
      const base = baseOf(cfg);
      const c = nearestCommissariat(base.x, base.z, active);
      if (c && Math.hypot(c.door.x - base.x, c.door.z - base.z) <= BASE_AT) return c;
    }
    const at = this.positionOf(squadId);
    return at ? nearestCommissariat(at.x, at.z, active) : null;
  }

  private rootOf(squadId: number): number {
    const ctx = this.ctx!;
    let s = ctx.squads.get(squadId);
    let id = squadId;
    for (let guard = 0; s && guard < 8; guard++) {
      id = s.id;
      s = s.parentId !== 0 ? ctx.squads.get(s.parentId) : undefined;
    }
    return id;
  }

  /** Position de l'unité : son premier véhicule, sinon son chef, sinon un membre. */
  private positionOf(squadId: number): { x: number; z: number } | null {
    const ctx = this.ctx!;
    const vs = unitVehicles(ctx, squadId, this.vbuf);
    if (vs.length > 0) return { x: vs[0]!.x, z: vs[0]!.z };
    const s = ctx.squads.get(squadId);
    if (!s) return null;
    const lead = ctx.people.get(s.leaderId) ?? (s.members.length > 0 ? ctx.people.get(s.members[0]!) : undefined);
    if (lead) return { x: lead.x, z: lead.z };
    for (const c of ctx.squads.childrenOf(s.id)) {
      const p = this.positionOf(c.id);
      if (p) return p;
    }
    return null;
  }

  /**
   * Place de retour d'une voiture de patrouille : la sienne si elle est libre et qu'on peut y entrer par l'arrière
   * (couloir d'approche libre), sinon la première place de réserve libre et accessible, sinon la sienne quand même
   * (null : sa place de tête ; unité accueillie sans place accessible : la première place de réserve).
   */
  private patrolSlot(e: Entry): Pose | null {
    const ctx = this.ctx!;
    const def = e.def;
    const vs = unitVehicles(ctx, e.view.squadId, this.vbuf);
    const kind = vs.length > 0 ? vs[0]!.kind : 'voiture_police';
    const ignore = new Set<EntityId>(vs.map((v) => v.id));
    const cands: number[] = e.template ? [...e.template.slots] : [];
    for (let i = 0; i < def.slots.length; i++) if (def.slots[i]!.spare && cands.indexOf(i) < 0) cands.push(i);
    for (const i of cands) {
      const s = def.slots[i]!;
      if (s.len + 0.05 < vehicleLen(kind) || !slotFree(ctx, s, kind, ignore) || !approachClear(ctx, s, kind, ignore)) continue;
      return e.template && i === e.template.slots[0] ? null : { x: s.x, z: s.z, heading: s.heading };
    }
    if (e.template) return null;
    const spare = def.slots.find((s) => s.spare);
    return spare ? { x: spare.x, z: spare.z, heading: spare.heading } : null;
  }

  /** Unité d'ailleurs accueillie sur les places de réserve d'un site. */
  private adopt(squadId: number, def: CommissariatDef): Entry {
    const ctx = this.ctx!;
    const squad = ctx.squads.get(squadId)!;
    const vs = unitVehicles(ctx, squadId, this.vbuf);
    const patrols = ctx.service<PatrolsApi>('police.patrols');
    const patrol = !!patrols && patrols.isPatrol(squadId);
    let homeSlot: Pose | null = null;
    if (patrol) {
      // une voiture : la première place de réserve libre (à défaut, la première place de réserve)
      const kind = vs.length > 0 ? vs[0]!.kind : 'voiture_police';
      const ignore = new Set<EntityId>(vs.map((v) => v.id));
      let idx = freeSlot(ctx, def, null, kind, new Set<number>(), ignore);
      if (idx < 0) idx = def.slots.findIndex((s) => s.spare);
      const s = idx >= 0 ? def.slots[idx]! : null;
      homeSlot = s ? { x: s.x, z: s.z, heading: s.heading } : null;
    }
    const e: Entry = {
      view: {
        id: 'adopte:' + squadId, commissariatId: def.id, kind: 'adopte', callsign: squad.name, label: adoptedLabel(),
        vehicle: vs.length > 0 ? vs[0]!.kind : 'fourgon_crs', vehicles: vs.length, crew: crewCount(ctx, squadId),
        state: 'engage', squadId, restUntil: 0, vehicleIds: vs.map((v) => v.id), engageable: true, where: '',
      },
      def, template: null, parked: [], virtual: 0, patrol, crewTotal: crewCount(ctx, squadId), recallAt: -1, homeSlot, parkUntil: 0, stuckSince: -1, relaunches: 0, arrivedAt: -1, orderedAt: -1, retryAt: 0,
    };
    const site = this.siteOf(def.id)!;
    site.entries.push(e);
    site.view.entries.push(e.view);
    this.byEntry.set(e.view.id, e);
    this.bySquad.set(squadId, e);
    this.changed.add(def.id);
    return e;
  }

  /** Unité accueillie repartie : elle n'appartient plus au site. */
  private drop(e: Entry): void {
    const site = this.siteOf(e.def.id);
    if (site) {
      const i = site.entries.indexOf(e);
      if (i >= 0) site.entries.splice(i, 1);
      const j = site.view.entries.indexOf(e.view);
      if (j >= 0) site.view.entries.splice(j, 1);
    }
    this.byEntry.delete(e.view.id);
    this.bySquad.delete(e.view.squadId);
    this.changed.add(e.def.id);
  }

  // ───────────────────────────── événements ─────────────────────────────

  private onConvoy(ev: ConvoyEvent): void {
    if (!this.active || !ev) return;
    const e = this.entryOfSquad(ev.squadId);
    if (!e || e.view.state !== 'retour') return;
    const now = this.ctx!.clock.now;
    // nouvelle colonne (autre destination) donnée après le rappel : l'unité repart en mission
    if ((ev.stage === 'route' || ev.stage === 'depart' || ev.stage === 'rembarquement') && now - e.recallAt > RECALL_GRACE) {
      this.setState(e, 'engage');
      e.recallAt = -1;
      this.flushChanged();
      return;
    }
    if (ev.stage === 'en_place') this.checkArrival(e, true);
  }

  private onOrder(squadId: number, order: SquadOrder): void {
    if (!this.active || this.bySquad.size === 0) return;
    const e = this.entryOfSquad(squadId);
    if (!e) return;
    // ordre donné pendant le rangement sur les places : un départ se verra de nouveau à la distance
    if (order.issuedBy !== 0 && !CONVOY_ORDERS.has(order.type)) {
      e.parkUntil = 0;
      e.orderedAt = this.ctx!.clock.now;
    }
    if (e.view.state !== 'retour') return;
    const now = this.ctx!.clock.now;
    if (now - e.recallAt <= RECALL_GRACE || order.issuedBy === 0 || CONVOY_ORDERS.has(order.type)) return;
    // la patrouille qui rentre est conduite par son module (ordre « libre » qu'il se donne lui-même)
    if (e.patrol) return;
    this.setState(e, 'engage');
    e.recallAt = -1;
    this.flushChanged();
  }

  // ───────────────────────────── arrivée ─────────────────────────────

  /** Unité rappelée arrivée ? (`convoyDone` : la colonne vient de se garer.) */
  private checkArrival(e: Entry, convoyDone: boolean): void {
    const ctx = this.ctx!;
    const id = e.view.squadId;
    if (e.patrol) {
      const patrols = ctx.service<PatrolsApi>('police.patrols');
      const pv = patrols ? patrols.statusOf(id) : null;
      if (pv && pv.state === 'au_poste') this.arrive(e);
      else if (pv && ctx.clock.now - e.recallAt > RECALL_GRACE * 4 && pv.label !== 'Retour au poste' && pv.state !== 'hors_service') {
        // autre ordre donné à la voiture pendant son retour
        this.setState(e, 'engage');
        e.recallAt = -1;
      }
      return;
    }
    const home = this.homeOf(e);
    const vs = unitVehicles(ctx, id, this.vbuf);
    if (vs.length > 0) {
      // arrivée : près du centre de sa file, ou le long des places du site (la colonne se range parfois plus loin
      // sur le trottoir du site, derrière les véhicules déjà garés : elle restait « Retour » à 45 m de sa file)
      let near = Infinity, moving = false;
      for (const v of vs) {
        if (v.state === 'wrecked' || v.state === 'burnt') continue;
        near = Math.min(near, Math.hypot(v.x - home.x, v.z - home.z));
        for (const sl of e.def.slots) near = Math.min(near, Math.hypot(v.x - sl.x, v.z - sl.z) + SITE_SLACK);
        if (Math.abs(v.speed) > 0.3) moving = true;
      }
      if (near > ARRIVE_AT) return;
      if (convoyDone) {
        this.arrive(e);
        return;
      }
      // sans compte rendu de la colonne (garée hors colonne, ou colonne terminée) : arrêtée près de ses places
      const cmd = ctx.service<CommandApi>('police.command');
      const c = cmd ? cmd.convoyOf(id) : null;
      const rolling = !!c && (c.stage === 'route' || c.stage === 'stationnement' || c.stage === 'debarquement'
        || c.stage === 'rembarquement' || c.stage === 'depart');
      if (!rolling && !moving && (!c || c.stage === 'en_place' || ctx.clock.now - e.recallAt > 20)) this.arrive(e);
      return;
    }
    // à pied : le chef à moins de 40 m de la porte
    const at = this.positionOf(id);
    if (at && Math.hypot(at.x - e.def.door.x, at.z - e.def.door.z) <= ARRIVE_AT) this.arrive(e);
  }

  /** Arrivée au site : interpellés remis, réserves complétées, repos. */
  private arrive(e: Entry): void {
    const ctx = this.ctx!;
    const id = e.view.squadId;
    const squad = ctx.squads.get(id);
    if (!squad) return;
    const morale = squad.morale;
    // véhicules de l'unité, et ceux où sont assis ses agents (fourgon pris en route)
    const vs = unitVehicles(ctx, id, this.vbuf).slice();
    const seen = new Set<EntityId>(vs.map((v) => v.id));
    const units = ctx.service<PoliceUnitsApi>('police.units');
    if (units) {
      const people: Person[] = [];
      units.members(id, people);
      for (const p of people) {
        if (p.vehicleId === 0 || seen.has(p.vehicleId)) continue;
        const v = ctx.vehicles.get(p.vehicleId);
        if (v && v.faction === 'police') {
          seen.add(v.id);
          vs.push(v);
        }
      }
    }
    // interpellés encore à bord (procédure close, custody 'in_vehicle') : remis à l'OPJ, ils quittent la scène
    let detainees = 0;
    for (const v of vs) {
      for (let s = 0; s < v.seats.length; s++) {
        const pid = v.seats[s]!;
        const p = pid !== 0 ? ctx.people.get(pid) : undefined;
        if (!p || p.custody !== 'in_vehicle' || p.isPlayer) continue;
        ctx.vehicles.exit(p);
        ctx.people.remove(p.id);
        detainees++;
      }
    }
    if (units) {
      for (const v of vs) units.refillReserve(v.id);
      units.rest(id);
    }
    this.parkInBays(e, vs, e.patrol);
    const rest = morale < 0.5 ? REST_LOW_MORALE : REST;
    const now = ctx.clock.now;
    e.recallAt = -1;
    this.setState(e, 'repos');
    e.arrivedAt = now;
    e.view.restUntil = now + rest;
    e.view.where = '';
    e.view.vehicles = unitVehicles(ctx, id, this.vbuf).length;
    e.view.vehicleIds = this.vbuf.map((v) => v.id);
    ctx.radio.say({
      channel: 'commandement', from: e.view.callsign, priority: 1, personId: squad.leaderId,
      text: radioFrame('CENTRAL', e.view.callsign, returnedText(e.def, detainees, rest)),
    });
    if (detainees > 0) ctx.people.rebuildIndex();
    const ev: CommissariatReturnedEvent = { commissariatId: e.def.id, squadId: id, detainees, t: now };
    ctx.events.emitAny(COMMISSARIAT_RETURNED_EVENT, ev);
    this.flushChanged();
  }

  /**
   * Derniers mètres : un véhicule laissé près de ses places par la colonne (en biais, sur la voie, en queue d'une
   * colonne de motos) se gare exactement sur une place libre — la tête de la colonne aux places de tête de sa file, dans
   * l'ordre de la file, puis la réserve (unité accueillie : réserve seulement). Le pilote automatique y va directement
   * (points d'approche à moins de 15 m) ou droit devant lui dans le sens de la place (jusqu'à 40 m), jamais par le tour
   * du pâté de maisons. Un véhicule rentré à contresens fait le tour (turnAround). `misalignedOnly` : seulement ce
   * dernier cas (voiture de patrouille, que le module des patrouilles gare lui-même).
   */
  private parkInBays(e: Entry, vs: readonly Vehicle[], misalignedOnly = false): void {
    const ctx = this.ctx!;
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    if (!ap) return;
    const def = e.def;
    const idx: number[] = e.template ? [...e.template.slots] : [];
    for (let i = 0; i < def.slots.length; i++) if (def.slots[i]!.spare && idx.indexOf(i) < 0) idx.push(i);
    const own = new Set<EntityId>(vs.map((v) => v.id));
    const used = new Set<number>();
    const fileSlots = e.template ? e.template.slots : [];
    const settled = (v: Vehicle, s: Pose): boolean =>
      Math.hypot(s.x - v.x, s.z - v.z) <= 0.6
      && Math.abs(Math.atan2(Math.sin(v.heading - s.heading), Math.cos(v.heading - s.heading))) <= 0.1;
    // véhicules déjà rangés : ils gardent leur place
    const done = new Set<EntityId>();
    for (const v of vs) {
      for (const i of idx) {
        if (!used.has(i) && settled(v, def.slots[i]!)) {
          used.add(i);
          done.add(v.id);
          break;
        }
      }
    }
    // puis les plus avancés d'abord : la tête de la colonne prend les places de tête de sa file (dans l'ordre de la
    // file), les places de réserve ensuite (la plus proche)
    const h = def.exit.heading;
    const order = vs.filter((v) => !done.has(v.id)).sort((a, b) =>
      (b.x * Math.sin(h) + b.z * Math.cos(h)) - (a.x * Math.sin(h) + a.z * Math.cos(h)));
    for (const v of order) {
      if (v.state === 'wrecked' || v.state === 'burnt' || v.seats.length === 0 || v.seats[0] === 0) continue;
      // rentré à contresens (voie d'en face d'une rue à double sens) : il fait le tour avant de se garer
      if (this.turnAround(e, v, fileSlots, idx, used, own)) continue;
      if (misalignedOnly) continue;
      // points d'approche du pilote automatique (autopilot.ts, park) : à moins de 15 m, il y va directement ; plus
      // loin il calcule un itinéraire, sans détour quand le point est droit devant lui dans le sens de la place
      const len = v.def.length;
      const back = Math.max(7, len * 1.4 + 2);
      const run = back + Math.max(8, len * 1.6);
      const ok = (i: number): boolean => {
        const s = def.slots[i]!;
        if (used.has(i) || s.len + 0.05 < vehicleLen(v.kind)) return false;
        const d = Math.hypot(s.x - v.x, s.z - v.z);
        if (d > PARK_AHEAD) return false;
        if (!(d < PARK_REACH && reachable(v, s, back, run, false)) && !reachable(v, s, back, run, true)) return false;
        return slotFree(ctx, s, v.kind, own);
      };
      let best = -1;
      for (const i of fileSlots) {
        if (ok(i)) {
          best = i;
          break;
        }
      }
      if (best < 0) {
        let bestD = Infinity;
        for (const i of idx) {
          if (fileSlots.indexOf(i) >= 0) continue;
          const d = Math.hypot(def.slots[i]!.x - v.x, def.slots[i]!.z - v.z);
          if (d < bestD && ok(i)) {
            bestD = d;
            best = i;
          }
        }
      }
      if (best < 0) {
        // aucune place qu'il atteigne sans détour (engin long arrêté à côté de sa place, sur la voie) : il fait le
        // tour et revient par l'arrière ; sous les yeux du joueur, mieux qu'un engin planté sur la voie
        // (pas les motos : courtes, elles se rangent à la reprise suivante, une fois la colonne arrêtée)
        if (!misalignedOnly && v.kind !== 'moto_bravm') this.turnAround(e, v, fileSlots, idx, used, own, true);
        continue;
      }
      used.add(best);
      const s = def.slots[best]!;
      if (ap.park(v, s.x, s.z, s.heading)) e.parkUntil = ctx.clock.now + PARK_TIME;
    }
  }

  /**
   * Véhicule arrêté près de ses places mais tourné à contresens (écart de cap de plus de 72°) : place retenue (la
   * première libre de sa file, sinon la réserve libre la plus proche) et tour lancé. false s'il est dans le bon sens.
   */
  private turnAround(
    e: Entry, v: Vehicle, fileSlots: readonly number[], idx: readonly number[], used: Set<number>, own: ReadonlySet<EntityId>,
    force = false,
  ): boolean {
    const ctx = this.ctx!;
    const def = e.def;
    // sens de la place la plus proche (au 1er, les places de réserve sont dans une autre rue, dans un autre sens)
    let s0: Pose | null = null;
    let d0 = Infinity;
    for (const i of idx) {
      const s = def.slots[i]!;
      const d = Math.hypot(s.x - v.x, s.z - v.z);
      if (d < d0) {
        d0 = d;
        s0 = s;
      }
    }
    if (!s0 || d0 > PARK_AHEAD || (!force && Math.cos(v.heading - s0.heading) >= 0.3)) return false;
    const free = (i: number): boolean => {
      const s = def.slots[i]!;
      return !used.has(i) && s.len + 0.05 >= vehicleLen(v.kind) && slotFree(ctx, s, v.kind, own);
    };
    let best = -1;
    for (const i of fileSlots) {
      if (free(i)) {
        best = i;
        break;
      }
    }
    if (best < 0) {
      let bestD = Infinity;
      for (const i of idx) {
        const d = Math.hypot(def.slots[i]!.x - v.x, def.slots[i]!.z - v.z);
        if (d < bestD && fileSlots.indexOf(i) < 0 && free(i)) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best < 0) return false;
    used.add(best);
    const s = def.slots[best]!;
    const now = ctx.clock.now;
    // point d'approche : là où le pilote automatique commence sa manœuvre de rangement (autopilot.ts, park)
    const back = Math.max(7, v.def.length * 1.4 + 2);
    const approach = back + Math.max(8, v.def.length * 1.6) + 1;
    const h: Homing = {
      entry: e, slot: { x: s.x, z: s.z, heading: s.heading }, stage: 'tour', viaX: 0, viaZ: 0, since: now, until: now + TURN_TIME,
      turns: 0, approach,
    };
    this.homing.set(v.id, h);
    this.startTurn(v, h);
    return true;
  }

  /** Étape 1 du tour : loin derrière la place (d'où l'on revient vers elle dans son sens). */
  private startTurn(v: Vehicle, h: Homing): void {
    const ctx = this.ctx!;
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    if (!ap) return;
    const fx = Math.sin(h.slot.heading), fz = Math.cos(h.slot.heading);
    const far = Math.max(TURN_FAR, h.approach + 25);
    let x = h.slot.x - fx * far, z = h.slot.z - fz * far;
    if (ctx.world.nearestRoad(x, z, this.road, 25)) {
      x = this.road.x;
      z = this.road.z;
    }
    h.stage = 'tour';
    h.viaX = x;
    h.viaZ = z;
    h.since = ctx.clock.now;
    h.turns++;
    ap.driveTo(v, x, z, { urgence: false, stopBefore: 0 });
    h.entry.parkUntil = Math.max(h.entry.parkUntil, h.until);
  }

  /** Suivi des tours en cours (toutes les TICK s). */
  private updateHoming(now: number): void {
    if (this.homing.size === 0) return;
    const ctx = this.ctx!;
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    for (const [id, h] of [...this.homing]) {
      const v = ctx.vehicles.get(id);
      const st = h.entry.view.state;
      if (!ap || !v || v.state === 'wrecked' || v.state === 'burnt' || v.seats[0] === 0 || now > h.until
        || (st !== 'repos' && st !== 'au_poste')) {
        this.homing.delete(id);
        continue;
      }
      const arrived = now - h.since > 1 && ap.status(v).state === 'arrive';
      if (h.stage === 'tour') {
        if (!arrived && Math.hypot(v.x - h.viaX, v.z - h.viaZ) > 10) continue;
        // étape 2 : revenir vers la place par l'arrière, dans son sens (demi-tour ou tour du pâté de maisons)
        const fx = Math.sin(h.slot.heading), fz = Math.cos(h.slot.heading);
        h.stage = 'approche';
        h.since = now;
        ap.driveTo(v, h.slot.x - fx * h.approach, h.slot.z - fz * h.approach, { urgence: false, stopBefore: 0 });
        continue;
      }
      const fx = Math.sin(h.slot.heading), fz = Math.cos(h.slot.heading);
      const d = Math.hypot(v.x - (h.slot.x - fx * h.approach), v.z - (h.slot.z - fz * h.approach));
      if ((d < 8 || arrived) && Math.cos(v.heading - h.slot.heading) >= ALIGNED) {
        ap.park(v, h.slot.x, h.slot.z, h.slot.heading);
        h.entry.parkUntil = Math.max(h.entry.parkUntil, now + PARK_TIME);
        this.homing.delete(id);
      } else if (arrived) {
        // encore à contresens : un autre tour, sinon on le laisse où il est
        if (h.turns < TURN_MAX) this.startTurn(v, h);
        else this.homing.delete(id);
      }
    }
  }

  // ───────────────────────────── mise à jour ─────────────────────────────

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.active) return;
    const now = ctx.clock.now;
    if (now < this.tickAt) return;
    this.tickAt = now + TICK;
    this.updateHoming(now);
    const patrols = ctx.service<PatrolsApi>('police.patrols');
    for (const site of this.sites) {
      for (let i = site.entries.length - 1; i >= 0; i--) this.think(site.entries[i]!, now);
      // patrouilles du secteur (hors stock)
      const list = site.view.patrols;
      list.length = 0;
      if (patrols) {
        for (const pv of patrols.list) {
          if (this.bySquad.has(pv.squadId)) continue;
          if (Math.hypot(pv.homeX - site.def.door.x, pv.homeZ - site.def.door.z) <= PATROL_HOME_AT) list.push(pv.squadId);
        }
      }
      this.recount(site);
    }
    this.flushChanged();
  }

  private think(e: Entry, now: number): void {
    const ctx = this.ctx!;
    const st = e.view.state;
    if (e.view.squadId === 0 || st === 'indisponible') return;
    const id = e.view.squadId;
    const squad = ctx.squads.get(id);
    if (!squad) {
      this.setState(e, 'indisponible');
      if (!e.template) this.drop(e);
      return;
    }
    const vs = unitVehicles(ctx, id, this.tbuf);
    let alive = 0;
    for (const v of vs) if (v.state !== 'wrecked' && v.state !== 'burnt') alive++;
    // véhicules tous détruits et moins de la moitié de l'équipage valide : indisponible
    if (alive === 0 && this.validCrew(id) < Math.max(1, e.crewTotal) * 0.5) {
      this.setState(e, 'indisponible');
      e.view.where = '';
      if (!e.template) this.drop(e);
      return;
    }
    e.view.vehicles = alive;
    if (e.view.vehicleIds.length !== vs.length) e.view.vehicleIds = vs.map((v) => v.id);
    const home = this.homeOf(e);
    const at = vs.length > 0 ? null : this.positionOf(id);
    // (distance à sa file, ou aux places du site : une unité rangée au bout des places n'est pas « partie »)
    let far = 0;
    if (vs.length > 0) {
      for (const v of vs) {
        let d = Math.hypot(v.x - home.x, v.z - home.z);
        for (const sl of e.def.slots) d = Math.min(d, Math.hypot(v.x - sl.x, v.z - sl.z));
        far = Math.max(far, d);
      }
    }
    else if (at) far = Math.hypot(at.x - e.def.door.x, at.z - e.def.door.z);
    if (st === 'alerte' || st === 'au_poste' || st === 'repos') {
      if (far > LEFT_AT && now >= e.parkUntil) {
        // partie de ses places (ordre donné) : engagée
        this.setState(e, 'engage');
        if (!e.template) {
          this.drop(e);
          return;
        }
      } else if (st === 'repos' && now >= e.view.restUntil) {
        this.setState(e, 'au_poste');
        ctx.radio.say({
          channel: 'commandement', from: e.view.callsign, priority: 0, personId: squad.leaderId,
          text: radioFrame('CENTRAL', e.view.callsign, availableText(e.def)),
        });
      }
    } else if (st === 'retour') {
      this.checkArrival(e, false);
      if (e.view.state === 'retour') this.relaunchMotos(e, vs, far, now);
    }
    const s2 = e.view.state;
    if ((s2 === 'repos' || s2 === 'au_poste') && vs.length > 0 && e.arrivedAt >= 0 && e.orderedAt <= e.arrivedAt) {
      this.tidy(e, vs);
      if (now >= e.retryAt) {
        e.retryAt = now + PARK_RETRY;
        this.retryPark(e, vs);
      }
    }
    if (s2 === 'engage' || s2 === 'retour') {
      const p = vs.length > 0 ? vs[0]! : at;
      if (p) {
        let name = '';
        try { name = ctx.world.sectorName(p.x, p.z); } catch { name = ''; }
        e.view.where = name;
      }
    } else e.view.where = '';
  }

  /**
   * Rangement final, hors de la vue du joueur : un véhicule rentré qui ne s'est pas garé exactement (manœuvre
   * inachevée ou ratée, en biais, resté sur la voie, tour du pâté de maisons en cours) est posé sur une place libre de
   * sa file (à défaut une place de réserve). Seulement pour une unité rentrée à laquelle le joueur n'a rien ordonné
   * depuis, et quand le joueur est à plus de TIDY_UNSEEN m : il ne voit jamais un véhicule bouger tout seul, et quand
   * il revient au commissariat, les files sont propres.
   */
  private tidy(e: Entry, vs: readonly Vehicle[]): void {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    for (const v of vs) {
      if (me && (me.vehicleId === v.id || Math.hypot(me.x - v.x, me.z - v.z) < TIDY_UNSEEN)) return;
    }
    const def = e.def;
    const idx: number[] = e.template ? [...e.template.slots] : [];
    for (let i = 0; i < def.slots.length; i++) if (def.slots[i]!.spare && idx.indexOf(i) < 0) idx.push(i);
    const used = new Set<number>();
    const loose: Vehicle[] = [];
    for (const v of vs) {
      if (v.state === 'wrecked' || v.state === 'burnt') continue;
      let on = -1;
      for (const i of idx) {
        const sl = def.slots[i]!;
        if (used.has(i) || Math.hypot(sl.x - v.x, sl.z - v.z) > 0.6) continue;
        if (Math.abs(Math.atan2(Math.sin(v.heading - sl.heading), Math.cos(v.heading - sl.heading))) > 0.1) continue;
        on = i;
        break;
      }
      if (on >= 0) used.add(on);
      else if (Math.hypot(v.x - def.door.x, v.z - def.door.z) < TIDY_REACH) loose.push(v);
    }
    if (loose.length === 0) return;
    const own = new Set<EntityId>(vs.map((v) => v.id));
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    for (const v of loose) {
      let best = -1;
      for (const i of idx) {
        const sl = def.slots[i]!;
        if (!used.has(i) && sl.len + 0.05 >= vehicleLen(v.kind) && slotFree(ctx, sl, v.kind, own)) {
          best = i;
          break;
        }
      }
      if (best < 0) continue;
      used.add(best);
      const sl = def.slots[best]!;
      this.homing.delete(v.id);
      if (ap && typeof ap.stop === 'function') ap.stop(v);
      v.x = sl.x;
      v.z = sl.z;
      v.y = ctx.world.heightAt(sl.x, sl.z);
      v.heading = sl.heading;
      v.speed = 0;
      v.vx = 0;
      v.vz = 0;
    }
  }

  /**
   * Unité qui rentre, arrêtée loin de ses places (colonne de motos bloquée dans une rue étroite : le contrôleur de la
   * BRAV-M déclare alors « En position » sur place ; cellulaire ou section dont la colonne s'est arrêtée devant un
   * obstacle et s'est déclarée « en place ») : l'ordre de retour est redonné, au plus RELAUNCH_MAX fois. Sans relance,
   * l'unité restait « Retour » au milieu de Paris, jamais disponible.
   */
  private relaunchMotos(e: Entry, vs: readonly Vehicle[], far: number, now: number): void {
    if (e.patrol || vs.length === 0) return;
    const motos = vs.every((v) => v.kind === 'moto_bravm');
    const ctx = this.ctx!;
    const cmd = motos ? null : ctx.service<CommandApi>('police.command');
    if (!motos && !cmd) return;
    // (colonne de véhicules : seulement une colonne qui a fini sans arriver — arrêtée par un obstacle, déclarée « en
    // place » loin de ses places ; jamais tant que le joueur tient le volant d'un de ses véhicules, elle l'attend)
    const c = cmd ? cmd.convoyOf(e.view.squadId) : null;
    const pid = ctx.player.state.personId;
    const gaveUp = motos || !c || c.stage === 'en_place' || c.stage === 'echec';
    const moving = vs.some((v) => Math.abs(v.speed) > 0.3);
    if (moving || far <= ARRIVE_AT || !gaveUp || (pid !== 0 && vs.some((v) => v.seats[0] === pid))) {
      e.stuckSince = -1;
      return;
    }
    if (e.stuckSince < 0) {
      e.stuckSince = now;
      return;
    }
    if (now - e.stuckSince < RELAUNCH_AFTER || e.relaunches >= RELAUNCH_MAX) return;
    e.relaunches++;
    e.stuckSince = now;
    const home = this.homeOf(e);
    if (motos) {
      ctx.squads.issue(e.view.squadId, { type: 'colonne', x: home.x, z: home.z, heading: home.heading, width: 0, targetId: 0, issuedBy: 0 });
      return;
    }
    // même retour que « Rentrer au commissariat » (carte tactique) : sans urgence, sans débarquer ; l'ordre
    // d'embarquement qui l'accompagne est le rappel redonné (délai de grâce), pas un nouvel ordre du joueur
    e.recallAt = now;
    cmd!.arrive(e.view.squadId, { x: home.x, z: home.z, heading: home.heading, layout: 'file', boardFirst: true, stagger: true, disembark: false, urgence: false });
  }

  /**
   * Après le retour, sous les yeux du joueur : un véhicule resté hors de ses places (une moto en queue de colonne,
   * une place occupée au moment de l'arrivée par un autre véhicule en manœuvre) retente de s'y garer, quand plus aucun
   * véhicule de l'unité ne manœuvre.
   */
  private retryPark(e: Entry, vs: readonly Vehicle[]): void {
    const ap = this.ctx!.service<AutopilotLike>('vehicles.autopilot');
    if (!ap) return;
    for (const v of vs) {
      if (this.homing.has(v.id) || Math.abs(v.speed) > 0.3) return;
      const st = ap.status(v);
      // (une moto lancée vers la tête de sa colonne, ou vers une place, et arrêtée derrière une autre n'est plus en
      // manœuvre : elle reçoit une autre place)
      if ((st.mode === 'park' || st.mode === 'drive' || st.mode === 'follow') && st.state !== 'bloque' && st.state !== 'attente') return;
    }
    this.parkInBays(e, vs, e.patrol);
  }

  /** Agents valides de l'unité (libres, en état). */
  private validCrew(squadId: number): number {
    const ctx = this.ctx!;
    let n = 0;
    const visit = (id: number, depth: number): void => {
      const s = ctx.squads.get(id);
      if (!s || depth > 8) return;
      for (const m of s.members) {
        const p = ctx.people.get(m);
        if (p && p.custody === 'free' && !ctx.health.isIncapacitated(p)) n++;
      }
      for (const c of ctx.squads.childrenOf(s.id)) visit(c.id, depth + 1);
    };
    visit(squadId, 0);
    return n;
  }
}
