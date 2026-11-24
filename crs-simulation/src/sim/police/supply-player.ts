/* =====================================================================================
 * FORCES DE L'ORDRE — ravitaillement du JOUEUR (système 'police.supply', ordre CONTROL + 6 ; service
 * 'session.supply', PlayerSupplyApi).
 *
 *   au fourgon     interaction « Se ravitailler » à l'arrière d'un fourgon de groupe, du car ou du véhicule de
 *                  commandement (les caisses de munitions y sont) : quelques secondes immobile, la dotation du poste
 *                  est complétée depuis la réserve du véhicule (décomptée ; partielle si elle est basse), puis une
 *                  notification dit ce qui a été pris et ce qui reste dans le véhicule. Pas pour un civil, une
 *                  personne interpellée ou hors de combat, ni à un véhicule en feu ou qui roule ;
 *   réserve vide   la même touche, au fourgon vide, passe la demande de ravitaillement par radio (aussi depuis le
 *                  menu Radio, et par le commandant IA : command/sustain.ts) ; la logistique complète les réserves
 *                  des fourgons de la compagnie après un délai : « Ravitaillement arrivé, zone de stationnement » ;
 *   indication     sous le quart de la dotation d'un objet du poste, ou à zéro : texte et objectif localisé (GPS)
 *                  sur le véhicule le plus proche qui a encore de quoi ; engins : tubes du Centaure vides (arrêt pour
 *                  recharger, grenades en soute), cuve du canon à eau basse (bouche d'incendie la plus proche ; plein
 *                  lancé de lui-même quand l'engin du joueur s'arrête à moins de 45 m d'une bouche).
 * ===================================================================================== */

import type {
  EntityId, GameContext, GameSystem, InteractionOption, ItemId, Person, Vehicle,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import type { VehiclesExtApi } from '@/sim/vehicles/api';
import type { PlayerSupplyApi, SupplyHint, VehicleReserve } from './api';
import { PLAYER_SUPPLY_SERVICE, POLICE_KERNEL_SERVICE } from './api';
import { unitOf } from './brain';
import type { Kernel } from './kernel';
import { SUPPLY, haveOf } from './ops-supply';
import { acknowledge, frame, spell } from './radio';
import { fullLoad } from './roster';
import { PLAYER_RESUPPLY_TIME, RESERVE_FOURGON, RESTOCK_DELAY } from './tuning';

/** Identifiant de l'objectif affiché (GPS). */
export const SUPPLY_OBJECTIVE_ID = 'ravitaillement';
/** Distance à l'arrière du véhicule en deçà de laquelle on atteint les caisses (m). */
const REAR_REACH = 1.8;
/** Recherche du véhicule à indiquer (m). */
const HINT_RADIUS = 800;
/** Le canon à eau fait son plein à moins de … m d'une bouche d'incendie (longueur de tuyau, cf. command/canon.ts). */
export const HYDRANT_REACH = 45;
/** Part de la dotation sous laquelle l'indication apparaît. */
export const LOW_RATIO = 0.25;
const THINK = 0.5;
/** Durée (s) après la prise de poste pendant laquelle un équipement distribué compte encore dans la dotation perçue. */
const ISSUE_WINDOW = 3;

/** Véhicules qui portent les caisses de munitions de la compagnie. */
export function isCarrier(v: Vehicle): boolean {
  return v.faction === 'police' && (v.kind === 'fourgon_crs' || v.kind === 'car_crs' || v.kind === 'vl_commandement');
}

const NAMES: Readonly<Record<string, readonly [string, string]>> = {
  grenade_lacrymo: ['grenade lacrymogène', 'grenades lacrymogènes'],
  lanceur_cougar: ['grenade de 56 mm', 'grenades de 56 mm'],
  grenade_gm2l: ['grenade GM2L', 'grenades GM2L'],
  lbd40: ['munition LBD', 'munitions LBD'],
  grenade_desencerclement: ['grenade de désencerclement', 'grenades de désencerclement'],
  extincteur: ['seconde de poudre d’extincteur', 'secondes de poudre d’extincteur'],
  gazeuse: ['jet d’aérosol', 'jets d’aérosol'],
  menottes: ['paire de menottes', 'paires de menottes'],
};

/** « 4 grenades lacrymogènes ». */
export function itemCount(id: ItemId, n: number): string {
  const w = NAMES[id] ?? [id, id];
  return n + ' ' + (n > 1 ? w[1] : w[0]);
}

/** Nom au pluriel, sans nombre (« grenades lacrymogènes »). */
function plural(id: ItemId): string {
  return id === 'extincteur' ? 'poudre d’extincteur' : (NAMES[id] ?? [id, id])[1];
}

export interface LoadLine {
  id: ItemId;
  have: number;
  full: number;
}

/**
 * État de la dotation : 'vide' si un objet du poste est épuisé, 'bas' s'il est au quart ou moins, sinon 'ok'.
 * `ids` : les objets concernés (épuisés d'abord).
 */
export function assessLoad(lines: readonly LoadLine[]): { level: 'ok' | 'bas' | 'vide'; ids: ItemId[] } {
  const empty: ItemId[] = [];
  const low: ItemId[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.full <= 0) continue;
    if (l.have <= 0) empty.push(l.id);
    else if (l.have <= l.full * LOW_RATIO) low.push(l.id);
  }
  if (empty.length > 0) return { level: 'vide', ids: empty.concat(low) };
  if (low.length > 0) return { level: 'bas', ids: low };
  return { level: 'ok', ids: [] };
}

/** Texte de l'indication à pied. `where` : « au fourgon », « au véhicule de commandement » ; '' si aucune réserve à portée. */
export function footHintText(level: 'bas' | 'vide', ids: readonly ItemId[], where: string, pendingMin: number): string {
  const what = level === 'vide' ? 'Plus de ' + plural(ids[0]) : 'Munitions basses (' + ids.map(plural).join(', ') + ')';
  if (where !== '') return what + ' : ravitaillez-vous ' + where + ' (touche d’interaction, à l’arrière du véhicule)';
  if (pendingMin >= 0) return what + ' : ravitaillement demandé, arrivée à la zone de stationnement dans environ ' + Math.max(1, pendingMin) + ' min';
  return what + ' et réserves des fourgons vides : demandez le ravitaillement par radio (menu Radio, ou touche d’interaction à l’arrière du fourgon)';
}

/** Indication du lance-grenades du Centaure (null : rien à signaler). */
export function launcherHint(ammo: number, capacity: number, reserve: number, reloading: boolean, pendingMin = -1): { text: string; level: 'bas' | 'vide' | 'attente' } | null {
  if (capacity <= 0) return null;
  if (reloading) return { text: 'Rechargement des tubes en cours : restez à l’arrêt', level: 'vide' };
  if (ammo <= 0) {
    if (reserve > 0) return { text: 'Tubes vides : arrêtez l’engin, l’équipage recharge les tubes (' + itemCount('lanceur_cougar', reserve) + ' en soute)', level: 'vide' };
    // soute épuisée : la logistique la complète sur demande (menu Radio), comme les réserves des fourgons
    if (pendingMin >= 0) return { text: 'Tubes vides et soute épuisée : ravitaillement demandé, soute complétée dans environ ' + Math.max(1, pendingMin) + ' min', level: 'attente' };
    return { text: 'Tubes vides et soute épuisée : demandez le ravitaillement par radio (menu Radio, « Demande de ravitaillement »)', level: 'vide' };
  }
  if (ammo <= capacity * LOW_RATIO) {
    return { text: 'Tubes presque vides (' + ammo + ' / ' + capacity + ') : une fois vides, arrêtez l’engin pour recharger (' + (reserve > 0 ? itemCount('lanceur_cougar', reserve) + ' en soute' : 'soute épuisée') + ')', level: 'bas' };
  }
  return null;
}

/** Indication de la cuve du canon à eau. `hydrant` : distance à la bouche d'incendie la plus proche (m), −1 si aucune. */
export function tankHint(litres: number, capacity: number, refilling: boolean, hydrant: number): { text: string; level: 'bas' | 'vide' } | null {
  if (capacity <= 0) return null;
  if (refilling) return { text: 'Plein en cours à la bouche d’incendie (' + Math.round((100 * litres) / capacity) + ' %) : restez à l’arrêt', level: 'bas' };
  if (litres > capacity * LOW_RATIO) return null;
  const what = litres <= 0 ? 'Cuve vide' : 'Cuve basse (' + Math.round(litres) + ' l)';
  if (hydrant < 0) return { text: what + ' : aucune bouche d’incendie connue à proximité, rendez compte par radio', level: litres <= 0 ? 'vide' : 'bas' };
  return {
    text: what + ' : arrêtez l’engin à moins de ' + HYDRANT_REACH + ' m de la bouche d’incendie (marqueur), plein en 90 s',
    level: litres <= 0 ? 'vide' : 'bas',
  };
}

function key(id: ItemId): keyof VehicleReserve | null {
  for (let i = 0; i < SUPPLY.length; i++) if (SUPPLY[i][0] === id) return SUPPLY[i][1];
  return null;
}

function where(v: Vehicle): string {
  return v.kind === 'vl_commandement' ? 'au véhicule de commandement' : v.kind === 'car_crs' ? 'au car' : 'au fourgon';
}

export class PlayerSupplySystem implements GameSystem {
  readonly id = 'police.supply';
  readonly order = SystemOrder.CONTROL + 6;

  private ctx!: GameContext;
  private k: Kernel | undefined;
  /** Demandes en cours : unité racine (compagnie) → instant d'arrivée. */
  private readonly pending = new Map<number, number>();
  private readonly near: Vehicle[] = [];
  private readonly engines: Vehicle[] = [];
  /** Dotation perçue par le joueur à sa prise de poste (objet → quantité) ; complétée pendant ISSUE_WINDOW secondes. */
  private readonly issued = new Map<ItemId, number>();
  private issuedFor: EntityId = 0;
  private issuedUntil = 0;
  private readonly opt: InteractionOption = { verb: 'ravitailler', targetKind: 'vehicle', targetId: 0, label: '', priority: 58, duration: 0, x: 0, z: 0 };
  private readonly rear = { x: 0, z: 0 };
  private readonly lines: LoadLine[] = SUPPLY.map(([id]) => ({ id, have: 0, full: 0 }));
  private hintCur: SupplyHint | null = null;
  private readonly hintBuf: SupplyHint = { text: '', x: 0, z: 0, level: 'bas', vehicleId: 0 };
  private thinkAt = 0;
  private published = '';
  /** Bouches d'incendie (mobilier fixe, relevé une fois par session). */
  private hydrants: number[] | null = null;
  private stillSince = -1;
  private refillVehicle: EntityId = 0;
  readonly api: PlayerSupplyApi;

  constructor() {
    const self = this;
    this.api = {
      hint: () => this.hintCur,
      request: (squadId) => this.request(squadId),
      pendingUntil: (squadId) => {
        const root = this.rootOf(squadId ?? this.playerSquad());
        return root !== 0 ? this.pending.get(root) ?? -1 : -1;
      },
      get restockDelay(): number {
        return self.delay;
      },
      set restockDelay(s: number) {
        self.delay = s;
      },
    };
  }

  private delay = RESTOCK_DELAY;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.provide(PLAYER_SUPPLY_SERVICE, this.api);
  }

  init(ctx: GameContext): void {
    this.k = ctx.service<Kernel>(POLICE_KERNEL_SERVICE);
    // prise de poste : la dotation perçue par le joueur est relevée à cet instant
    ctx.events.on('player:possessed', (e) => {
      const p = ctx.people.get(e.personId);
      this.issuedFor = 0;
      if (p) this.issue(p);
    });
    ctx.interactions.register({
      verb: 'ravitailler',
      find: (actor, targetId) => this.find(actor, targetId),
      begin: (actor, opt) => this.canReach(actor, opt.targetId),
      tick: (actor, opt) => this.canReach(actor, opt.targetId),
      complete: (actor, opt) => {
        if (opt.duration > 0) this.take(actor, opt.targetId);
        else this.empty(actor, opt.targetId);
      },
    });
  }

  reset(): void {
    this.pending.clear();
    this.hintCur = null;
    this.thinkAt = 0;
    this.hydrants = null;
    this.stillSince = -1;
    this.refillVehicle = 0;
    this.delay = RESTOCK_DELAY;
    this.issued.clear();
    this.issuedFor = 0;
    this.issuedUntil = 0;
    const api = this.ctx ? this.ctx.service<ObjectivesApi>(EXT.objectives) : undefined;
    if (api && this.published !== '') {
      api.remove(SUPPLY_OBJECTIVE_ID);
      if (api.tracked === SUPPLY_OBJECTIVE_ID) api.tracked = '';
    }
    this.published = '';
  }

  // ───────────────────────────── unités ─────────────────────────────

  private playerSquad(): number {
    const p = this.ctx.player.person();
    return p ? p.squadId : 0;
  }

  /** Unité racine (compagnie) d'une unité, ou 0. */
  private rootOf(squadId: number): number {
    let s = squadId !== 0 ? this.ctx.squads.get(squadId) : undefined;
    for (let guard = 0; s && s.parentId !== 0 && guard < 16; guard++) {
      const up = this.ctx.squads.get(s.parentId);
      if (!up) break;
      s = up;
    }
    return s ? s.id : 0;
  }

  /** Véhicules porteurs de réserve de la compagnie `root`. */
  private carriersOf(root: number, out: Vehicle[]): number {
    out.length = 0;
    if (root === 0) return 0;
    const ctx = this.ctx;
    const add = (id: EntityId): void => {
      const v = id !== 0 ? ctx.vehicles.get(id) : undefined;
      if (v && isCarrier(v) && out.indexOf(v) < 0) out.push(v);
    };
    const list = ctx.squads.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.faction !== 'police' || this.rootOf(s.id) !== root) continue;
      add(s.vehicleId);
      const u = unitOf(s);
      if (u) for (let j = 0; j < u.extraVehicles.length; j++) add(u.extraVehicles[j]);
    }
    return out.length;
  }

  /** Engins lanceurs de grenades (Centaure) de la compagnie `root` : leur soute se complète aussi. */
  private launchersOf(root: number, out: Vehicle[]): number {
    out.length = 0;
    if (root === 0) return 0;
    const ctx = this.ctx;
    const list = ctx.squads.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.faction !== 'police' || s.vehicleId === 0 || this.rootOf(s.id) !== root) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (v && out.indexOf(v) < 0 && v.def.turrets.some((d) => d.kind === 'lance_grenades')) out.push(v);
    }
    return out.length;
  }

  // ───────────────────────────── au fourgon ─────────────────────────────

  /** Personne à qui l'on peut proposer le ravitaillement : policier libre, valide, à pied. */
  private eligible(p: Person): boolean {
    return p.faction === 'police' && p.vehicleId === 0 && p.custody === 'free' && p.heldBy === 0 && p.posture !== 'down'
      && p.health > 0 && !this.ctx.health.isIncapacitated(p);
  }

  /** Remplit `lines` d'après le poste de la personne ; retourne le nombre d'unités manquantes. */
  private load(p: Person): number {
    const k = this.k!;
    let missing = 0;
    if (p.isPlayer && this.issuedFor !== p.id) this.issue(p);
    for (let i = 0; i < SUPPLY.length; i++) {
      const l = this.lines[i];
      l.full = fullLoad(p.poste, l.id);
      // le joueur : seulement ce qu'il a réellement perçu (un télépilote n'a jamais eu d'aérosol à « épuiser »)
      if (p.isPlayer) l.full = this.issued.has(l.id) ? l.full || this.issued.get(l.id)! : 0;
      l.have = l.full > 0 ? haveOf(k, p, l.id) : 0;
      if (l.have < l.full) missing += l.full - l.have;
    }
    return missing;
  }

  /** Relève la dotation perçue par le joueur (objets ravitaillables qu'il porte), à sa prise de poste. */
  private issue(p: Person): void {
    const k = this.k;
    if (!k) return;
    if (this.issuedFor !== p.id) {
      this.issued.clear();
      this.issuedFor = p.id;
      this.issuedUntil = this.ctx.clock.now + ISSUE_WINDOW;
    }
    for (let i = 0; i < SUPPLY.length; i++) {
      const id = SUPPLY[i][0];
      const n = haveOf(k, p, id);
      if (n > 0 && n > (this.issued.get(id) ?? 0)) this.issued.set(id, n);
    }
  }

  /** Le véhicule contient-il au moins un objet qui manque (lines à jour) ? */
  private useful(r: VehicleReserve): boolean {
    for (let i = 0; i < SUPPLY.length; i++) {
      const l = this.lines[i];
      if (l.have < l.full && (r[SUPPLY[i][1]] as number) > 0) return true;
    }
    return false;
  }

  /** Point derrière le véhicule (portes arrière). */
  private rearOf(v: Vehicle): { x: number; z: number } {
    const back = v.def.length * 0.5 + 0.6;
    this.rear.x = v.x - Math.sin(v.heading) * back;
    this.rear.z = v.z - Math.cos(v.heading) * back;
    return this.rear;
  }

  private rearDist(p: Person, v: Vehicle): number {
    const r = this.rearOf(v);
    return Math.hypot(p.x - r.x, p.z - r.z);
  }

  private find(actor: Person, targetId?: EntityId): InteractionOption | null {
    const k = this.k;
    if (!k || !this.eligible(actor) || this.load(actor) <= 0) return null;
    const ctx = this.ctx;
    const near = this.near;
    let n: number;
    if (targetId !== undefined && targetId !== 0) {
      near.length = 0;
      const v = ctx.vehicles.get(targetId);
      if (v) near.push(v);
      n = near.length;
    } else {
      n = ctx.vehicles.queryRadius(actor.x, actor.z, 9, near);
    }
    const mine = actor.squadId !== 0 ? ctx.squads.get(actor.squadId) : undefined;
    const root = this.rootOf(actor.squadId);
    let best: Vehicle | null = null;
    let bestScore = Infinity;
    let bestUseful = false;
    for (let i = 0; i < n; i++) {
      const v = near[i];
      if (!isCarrier(v) || !k.canSupply(v)) continue;
      const d = this.rearDist(actor, v);
      if (d > REAR_REACH) continue;
      const use = this.useful(k.reserveOf(v)!);
      // un fourgon qui a de quoi d'abord, puis celui de son unité, puis de sa compagnie
      let score = d + (use ? 0 : 100);
      if (!(mine && mine.vehicleId === v.id)) score += root !== 0 && this.inCompany(v, root) ? 10 : 20;
      if (score < bestScore) {
        bestScore = score;
        best = v;
        bestUseful = use;
      }
    }
    if (!best) return null;
    const o = this.opt;
    const rr = this.rearOf(best);
    o.targetId = best.id;
    o.x = rr.x;
    o.z = rr.z;
    if (bestUseful) {
      o.label = 'Se ravitailler — ' + best.def.name;
      o.duration = PLAYER_RESUPPLY_TIME;
    } else {
      o.label = this.pendingOf(actor) >= 0 ? 'Réserve vide — ravitaillement déjà demandé' : 'Réserve vide — demander le ravitaillement par radio';
      o.duration = 0;
    }
    return o;
  }

  private inCompany(v: Vehicle, root: number): boolean {
    const list = this.ctx.squads.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.vehicleId === v.id || (unitOf(s)?.extraVehicles.indexOf(v.id) ?? -1) >= 0) return this.rootOf(s.id) === root;
    }
    return false;
  }

  private canReach(actor: Person, vehicleId: EntityId): boolean {
    const k = this.k;
    const v = this.ctx.vehicles.get(vehicleId);
    return !!k && this.eligible(actor) && k.canSupply(v) && isCarrier(v) && this.rearDist(actor, v) <= REAR_REACH + 0.8;
  }

  /** Complète la dotation du poste depuis la réserve du véhicule. */
  private take(actor: Person, vehicleId: EntityId): void {
    const k = this.k!;
    const ctx = this.ctx;
    const v = ctx.vehicles.get(vehicleId);
    const r = k.reserveOf(v);
    if (!v || !r) return;
    this.load(actor);
    const got: string[] = [];
    const left: string[] = [];
    for (let i = 0; i < SUPPLY.length; i++) {
      const l = this.lines[i];
      if (l.full <= 0 || l.have >= l.full) continue;
      const rk = SUPPLY[i][1];
      const stock = r[rk] as number;
      const take = Math.min(l.full - l.have, stock);
      if (take > 0) {
        (r[rk] as number) = stock - take;
        if (l.id === 'extincteur') {
          // appareil échangé contre un plein, dans la limite de ce que contient la réserve
          const held = k.held(actor) === 'extincteur';
          ctx.actions.remove(actor, 'extincteur');
          const st = ctx.actions.give(actor, 'extincteur', l.have + take);
          st.state = (l.have + take) / l.full;
          if (held) ctx.actions.selectById(actor, 'extincteur');
          got.push('extincteur rechargé (' + (l.have + take) + ' s de poudre)');
        } else {
          ctx.actions.give(actor, l.id, take);
          got.push('+' + itemCount(l.id, take));
        }
      }
      const base = RESERVE_FOURGON[rk as keyof typeof RESERVE_FOURGON];
      left.push(plural(l.id) + ' ' + (r[rk] as number) + ' / ' + base);
    }
    if (!actor.isPlayer) return;
    if (got.length === 0) {
      this.empty(actor, vehicleId);
      return;
    }
    // dotation encore incomplète : réserve trop basse pour tout reprendre
    const short = this.load(actor) > 0 && !this.useful(r) ? ' Dotation incomplète.' : '';
    ctx.ui.notify(got.join(', ') + ' — réserve ' + (v.kind === 'vl_commandement' ? 'du véhicule' : 'du fourgon') + ' : ' + left.join(', ') + '.' + short, 'ok', 6);
    this.thinkAt = 0;
  }

  /** Réserve vide pour ce qui manque : message, et demande de ravitaillement par radio. */
  private empty(actor: Person, vehicleId: EntityId): void {
    if (!actor.isPlayer) return;
    const ctx = this.ctx;
    const v = ctx.vehicles.get(vehicleId);
    const what = v ? 'Réserve ' + (v.kind === 'vl_commandement' ? 'du véhicule de commandement' : 'du fourgon') + ' vide' : 'Réserve vide';
    const pend = this.pendingOf(actor);
    if (pend >= 0) {
      ctx.ui.notify(what + ' : ravitaillement déjà demandé, arrivée à la zone de stationnement dans environ ' + this.minutes(pend) + ' min.', 'warn', 6);
      return;
    }
    if (!this.request(actor.squadId)) ctx.ui.notify(what + ' : aucune réserve de compagnie à faire compléter. Cherchez un autre fourgon.', 'warn', 6);
  }

  private pendingOf(p: Person): number {
    const root = this.rootOf(p.squadId);
    return root !== 0 ? this.pending.get(root) ?? -1 : -1;
  }

  private minutes(at: number): number {
    return Math.max(1, Math.ceil((at - this.ctx.clock.now) / 60));
  }

  // ───────────────────────────── demande à la logistique ─────────────────────────────

  private request(squadId?: number): boolean {
    const ctx = this.ctx;
    const sid = squadId ?? this.playerSquad();
    const root = this.rootOf(sid);
    if (root === 0 || this.pending.has(root)) return false;
    const engines = this.launchersOf(root, this.engines);
    if (this.carriersOf(root, this.near) === 0 && engines === 0) return false;
    const company = ctx.squads.get(root)!;
    const from = ctx.squads.get(sid) ?? company;
    const p = ctx.player.person();
    const byPlayer = !!p && p.squadId === sid;
    const sector = p && byPlayer ? ctx.world.sectorName(p.x, p.z) : '';
    const at = ctx.clock.now + this.delay;
    this.pending.set(root, at);
    const min = Math.max(1, Math.round(this.delay / 60));
    const pv = p && byPlayer && p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) : undefined;
    const aboard = !!pv && this.engines.indexOf(pv) >= 0;
    const body = 'Demande de ravitaillement' + (sector && sector !== 'secteur inconnu' ? ', secteur ' + sector : '')
      + (aboard ? ' : soute du lance-grenades épuisée, grenades de 56 mm' : ' : réserves des fourgons épuisées, grenades et munitions');
    ctx.radio.say({ channel: 'commandement', from: from.name, text: frame(from.id === root ? 'Logistique' : company.name, from.name, body, true), priority: 1, personId: byPlayer ? p!.id : from.leaderId || undefined });
    ctx.radio.say({ channel: 'commandement', from: from.id === root ? 'Logistique' : company.name, text: acknowledge(from.id === root ? 'Logistique' : company.name, 'ravitaillement acheminé vers la zone de stationnement, délai ' + spell(min) + ' minute' + (min > 1 ? 's' : '')), priority: 1 });
    if (byPlayer) ctx.ui.notify(aboard ? 'Demande de ravitaillement transmise : soute complétée dans environ ' + min + ' min.'
      : 'Demande de ravitaillement transmise : arrivée à la zone de stationnement dans environ ' + min + ' min.', 'info', 6);
    this.thinkAt = 0;
    return true;
  }

  /** Arrivée du ravitaillement : les réserves des fourgons de la compagnie sont complétées. */
  private restock(root: number): void {
    const ctx = this.ctx;
    const k = this.k;
    const company = ctx.squads.get(root);
    if (!k || !company) return;
    const n = this.carriersOf(root, this.near);
    let done = 0;
    for (let i = 0; i < n; i++) {
      const v = this.near[i];
      if (v.state === 'burnt' || v.state === 'burning') continue;
      const r = k.reserveOf(v);
      if (!r) continue;
      for (let j = 0; j < SUPPLY.length; j++) {
        const rk = SUPPLY[j][1];
        const base = RESERVE_FOURGON[rk as keyof typeof RESERVE_FOURGON];
        if ((r[rk] as number) < base) (r[rk] as number) = base;
      }
      done++;
    }
    // soutes des engins lanceurs de grenades (Centaure) : complétées elles aussi
    const ext = ctx.service<VehiclesExtApi>('vehicles.ext');
    let holds = 0;
    const ne = ext && typeof ext.restockTurret === 'function' ? this.launchersOf(root, this.engines) : 0;
    for (let i = 0; i < ne; i++) {
      const v = this.engines[i];
      for (let j = 0; j < v.def.turrets.length; j++) if (v.def.turrets[j].kind === 'lance_grenades' && ext!.restockTurret(v, j) > 0) holds++;
    }
    if (done === 0 && holds === 0) return;
    const what = done > 0 && holds > 0 ? 'Réserves des fourgons et soutes des engins complétées' : done > 0 ? 'Réserves des fourgons complétées' : 'Soutes des engins complétées';
    ctx.radio.say({ channel: 'commandement', from: 'Logistique', text: frame(company.name, 'Logistique', (done > 0 ? 'Ravitaillement arrivé, zone de stationnement. ' : 'Ravitaillement arrivé. ') + what, false), priority: 1 });
    const p = ctx.player.person();
    if (p && this.rootOf(p.squadId) === root) ctx.ui.notify('Ravitaillement arrivé : ' + what.charAt(0).toLowerCase() + what.slice(1) + '.', 'ok', 6);
    this.thinkAt = 0;
  }

  // ───────────────────────────── indication ─────────────────────────────

  private setHint(text: string, x: number, z: number, level: SupplyHint['level'], vehicleId: EntityId): void {
    const h = this.hintBuf;
    h.text = text;
    h.x = x;
    h.z = z;
    h.level = level;
    h.vehicleId = vehicleId;
    this.hintCur = h;
  }

  /** Recalcule l'indication du joueur. */
  private think(): void {
    this.hintCur = null;
    const ctx = this.ctx;
    const k = this.k;
    const p = ctx.player.person();
    if (!k || !p || p.faction !== 'police' || p.custody !== 'free') return;
    if (p.vehicleId !== 0) {
      const v = ctx.vehicles.get(p.vehicleId);
      if (v && this.engine(p, v)) return;
    }
    if (this.load(p) <= 0) return;
    const a = assessLoad(this.lines);
    if (a.level === 'ok') return;
    // véhicule le plus proche qui a encore de quoi (pour les objets concernés), quelle que soit l'unité
    const n = ctx.vehicles.queryRadius(p.x, p.z, HINT_RADIUS, this.near);
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const v = this.near[i];
      if (!isCarrier(v) || !k.canSupply(v)) continue;
      const r = k.reserveOf(v)!;
      let has = false;
      for (let j = 0; j < a.ids.length && !has; j++) {
        const rk = key(a.ids[j]);
        if (rk && (r[rk] as number) > 0) has = true;
      }
      if (!has) continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    if (best) {
      const rr = this.rearOf(best);
      this.setHint(footHintText(a.level, a.ids, where(best), -1), rr.x, rr.z, a.level, best.id);
      return;
    }
    // aucune réserve utile : la demande à la logistique (ou son attente), au fourgon de la compagnie le plus proche
    const pend = this.pendingOf(p);
    const m = this.carriersOf(this.rootOf(p.squadId), this.near);
    let x = p.x;
    let z = p.z;
    let id: EntityId = 0;
    bestD = Infinity;
    for (let i = 0; i < m; i++) {
      const v = this.near[i];
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bestD && v.state !== 'burnt') {
        bestD = d;
        const rr = this.rearOf(v);
        x = rr.x;
        z = rr.z;
        id = v.id;
      }
    }
    this.setHint(footHintText(a.level, a.ids, '', pend >= 0 ? this.minutes(pend) : -1), x, z, pend >= 0 ? 'attente' : a.level, id);
  }

  /** Engin armé (Centaure, canon à eau) : indication de la tourelle ; true si le véhicule en est un. */
  private engine(p: Person, v: Vehicle): boolean {
    const ext = this.ctx.service<VehiclesExtApi>('vehicles.ext');
    const defs = v.def.turrets;
    let armed = false;
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (d.kind !== 'lance_grenades' && d.kind !== 'canon_eau') continue;
      armed = true;
      const ts = ext ? ext.turretStatus(v, i) : null;
      const ammo = v.turretAmmo[i] ?? 0;
      if (d.kind === 'lance_grenades') {
        const pend = this.pendingOf(p);
        const h = launcherHint(ammo, d.capacity, ts ? ts.reserve : 0, !!ts && ts.service >= 0, pend >= 0 ? this.minutes(pend) : -1);
        if (h) this.setHint(h.text, v.x, v.z, h.level, v.id);
      } else {
        const hy = this.nearestHydrant(v.x, v.z);
        const h = tankHint(ammo, d.capacity, !!ts && ts.service >= 0, hy < 0 ? -1 : this.hydrantD);
        if (h) {
          if (hy >= 0) this.setHint(h.text, this.hydrants![hy], this.hydrants![hy + 1], h.level, 0);
          else this.setHint(h.text, v.x, v.z, h.level, v.id);
        }
      }
      if (this.hintCur) break;
    }
    return armed;
  }

  private hydrantD = 0;

  /** Index (dans this.hydrants) de la bouche d'incendie la plus proche, ou −1 ; distance dans hydrantD. */
  private nearestHydrant(x: number, z: number): number {
    if (!this.hydrants) {
      const list = this.ctx.props.list;
      const out: number[] = [];
      for (let i = 0; i < list.length; i++) if (list[i].kind === 'bouche_incendie') out.push(list[i].x, list[i].z);
      this.hydrants = out;
    }
    const h = this.hydrants;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < h.length; i += 2) {
      const d = Math.hypot(h[i] - x, h[i + 1] - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.hydrantD = bestD;
    return best;
  }

  /** Canon à eau du joueur à l'arrêt près d'une bouche : l'équipage branche le tuyau et fait le plein. */
  private waterRefill(dt: number): void {
    const ctx = this.ctx;
    const v = ctx.player.vehicle();
    let cannon = -1;
    // une seule cuve pour les canons de l'engin : le premier suffit
    if (v) for (let i = 0; i < v.def.turrets.length && cannon < 0; i++) if (v.def.turrets[i].kind === 'canon_eau') cannon = i;
    if (!v || cannon < 0 || Math.abs(v.speed) > 0.3) {
      this.stillSince = -1;
      this.refillVehicle = 0;
      return;
    }
    if (this.stillSince < 0) this.stillSince = 0;
    this.stillSince += dt;
    const cap = v.def.turrets[cannon].capacity;
    const ext = ctx.service<VehiclesExtApi>('vehicles.ext');
    if (!ext || this.stillSince < 2 || v.turretAmmo[cannon] >= cap * 0.97) return;
    if (ext.turretStatus(v, cannon).service >= 0) return;
    if (this.refillVehicle === v.id) return;
    if (this.nearestHydrant(v.x, v.z) < 0 || this.hydrantD > HYDRANT_REACH) return;
    if (ext.refill(v)) {
      this.refillVehicle = v.id;
      ctx.ui.notify('Branchement sur la bouche d’incendie : plein en cours, restez à l’arrêt.', 'info', 5);
    }
  }

  // ───────────────────────────── objectif affiché ─────────────────────────────

  private publish(): void {
    const api = this.ctx.service<ObjectivesApi>(EXT.objectives);
    if (!api) return;
    const h = this.hintCur;
    const has = api.list.some((o) => o.id === SUPPLY_OBJECTIVE_ID);
    if (!h) {
      if (this.published !== '' || has) {
        api.remove(SUPPLY_OBJECTIVE_ID);
        if (api.tracked === SUPPLY_OBJECTIVE_ID) api.tracked = '';
        this.published = '';
      }
      return;
    }
    const sig = h.text + '|' + Math.round(h.x / 2) + '|' + Math.round(h.z / 2);
    if (sig === this.published && has) return;
    api.upsert({ id: SUPPLY_OBJECTIVE_ID, text: h.text, state: 'actif', secondary: true, x: h.x, z: h.z });
    this.published = sig;
    // à zéro, l'indication prend le GPS s'il ne suit rien d'actif ; au quart, seulement s'il ne suit rien
    const tracking = api.tracked !== '' && api.list.some((o) => o.id === api.tracked && o.state === 'actif');
    if (api.tracked === '' || (h.level !== 'bas' && !tracking)) api.tracked = SUPPLY_OBJECTIVE_ID;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const now = ctx.clock.now;
    if (this.pending.size > 0) {
      for (const [root, at] of this.pending) {
        if (now < at) continue;
        this.pending.delete(root);
        this.restock(root);
      }
    }
    this.waterRefill(dt);
    // équipement distribué juste après la prise de poste : il fait partie de la dotation perçue
    if (now < this.issuedUntil) {
      const p = ctx.player.person();
      if (p && p.id === this.issuedFor) this.issue(p);
    }
    if (now < this.thinkAt) return;
    this.thinkAt = now + THINK;
    this.think();
    this.publish();
  }
}
