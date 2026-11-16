/* =====================================================================================
 * JOURNÉE DE SERVICE — prise de service à la caserne, trajet en colonne, manifestation, retour.
 *
 * Demande du commanditaire : « je veux avoir un début et après me déplacer dans la ville pour gérer les
 * manifestations, en colonne » ; « quand je suis un simple CRS, c'est pas moi qui conduis, je suis dans le van et on
 * va jusqu'à la mission ; il faut que l'IA soit totalement autonome ».
 *
 * Déroulé (extra.journee, rôles de police ; la mise en place pose la compagnie à la caserne de la Cité) :
 *   1. prise de service  : la salle (CENTRAL) annonce la manifestation du jour ;
 *   2. embarquement      : ordre de mouvement ; la compagnie embarque (police.command.arrive, boardFirst) ; la colonne
 *                          attend le joueur s'il fait partie de la compagnie (objectif « Embarquez », GPS sur son
 *                          fourgon) ; un joueur qui conduit son propre engin la suit ;
 *   3. route             : colonne en urgence, sirènes et gyrophares ; les chauffeurs de l'IA conduisent ;
 *   4. sur place         : débarquement (le joueur passager descend avec son groupe), le commandement prend la main ;
 *   5. retour            : fin de mission → rembarquement (la colonne attend le joueur) → retour à la caserne ;
 *   6. fin de service    : compte rendu.
 * Pendant toute la journée, la ville vit : feux de poubelles et de conteneurs dans d'autres quartiers, signalés à la
 * radio et sur la carte (module des incidents), traités par les pompiers ou confiés au joueur selon son rôle.
 * Simulation pure (aucun DOM).
 * ===================================================================================== */

import type { GameContext, GameSystem, Person, RoadSample, Vehicle } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { Objective, ObjectivesApi } from '@/core/extensions';
import { SESSION_SETUP_EVENT } from './api';
import type { SessionSetupSummary } from './api';
import { SERVICE_BASE, isJournee } from './journee-data';
import { chooseStandOffCrowd } from './placement';
import { pointOnPolyline } from '@/core/math';

export type JourneeStage = 'inactif' | 'prise_de_service' | 'embarquement' | 'route' | 'sur_place' | 'rembarquement' | 'retour' | 'fin';

export const JOURNEE_SERVICE = 'session.journee';
export const JOURNEE_OBJECTIVE_ID = 'journee';

export interface JourneeApi {
  readonly stage: JourneeStage;
  /** Le joueur est en déplacement commandé (embarquement, route, retour) : pas d'autre ordre de poste. */
  readonly travelling: boolean;
  /** Destination de la colonne (zone de stationnement), null avant l'ordre de mouvement. */
  readonly destination: { x: number; z: number; name: string } | null;
}

/** Vue minimale du commandement IA (police.command). */
interface CommandLike {
  arrive(companyId: number, dest: { x: number; z: number; heading: number; layout?: 'file' | 'bataille' | 'epi'; boardFirst?: boolean }): boolean;
  convoyOf(companyId: number): { stage: string } | null;
  stateOf(companyId: number): { phase: string; missionEnded: boolean } | null;
}
interface VehiclesExt {
  setSiren?(v: Vehicle, mode: 0 | 1 | 2): void;
  setBeacons?(v: Vehicle, on: boolean): void;
}

/** Instants du déroulé (s depuis la mise en place). */
const BRIEF_AT = 2;
const DISPATCH_AT = 9;
/** Fin de service : délai avant le compte rendu (s). */
const DEBRIEF_DELAY = 20;
/** Feux en ville : premier, puis intervalle aléatoire (s), distance au joueur (m), nombre maximal. */
const CITY_FIRST = 150;
const CITY_EVERY_MIN = 200;
const CITY_EVERY_MAX = 380;
const CITY_MIN_DIST = 400;
const CITY_MAX_DIST = 1800;
const CITY_MAX = 6;
/** Rayon d'arrivée à la caserne (m) ; durée maximale du retour avant de clore la journée (s). */
const BASE_RADIUS = 160;
const RETURN_MAX = 900;

const CONVOY_KINDS: ReadonlySet<string> = new Set(['fourgon_crs', 'car_crs', 'vl_commandement', 'fourgon_cellulaire', 'canon_eau', 'centaure']);

export class JourneeSystem implements GameSystem {
  readonly id = 'session.journee';
  readonly order = SystemOrder.CONTROL + 47;

  private ctx: GameContext | null = null;
  private stage_: JourneeStage = 'inactif';
  private companyId = 0;
  private startAt = 0;
  private briefed = false;
  private moveSaid = false;
  private dest: { x: number; z: number; heading: number; name: string } | null = null;
  private endAt = 0;
  private returnAt = 0;
  private nextCity = 0;
  private cityCount = 0;
  private sirensOn = false;
  private nextThink = 0;
  private rng: (() => number) | null = null;
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;

  provide(ctx: GameContext): void {
    const self = this;
    ctx.provide(JOURNEE_SERVICE, {
      get stage() { return self.stage_; },
      get travelling() { return self.stage_ === 'embarquement' || self.stage_ === 'route' || self.stage_ === 'rembarquement' || self.stage_ === 'retour'; },
      get destination() { return self.dest ? { x: self.dest.x, z: self.dest.z, name: self.dest.name } : null; },
    } satisfies JourneeApi);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.events.onAny(SESSION_SETUP_EVENT, (e) => this.onSetup(e as SessionSetupSummary));
  }

  reset(): void {
    this.stage_ = 'inactif';
    this.companyId = 0;
    this.briefed = false;
    this.moveSaid = false;
    this.dest = null;
    this.endAt = 0;
    this.returnAt = 0;
    this.cityCount = 0;
    this.sirensOn = false;
    this.nextThink = 0;
  }

  private onSetup(summary: SessionSetupSummary): void {
    const ctx = this.ctx!;
    this.reset();
    if (!isJournee(ctx.session.config) || !summary.usedPoliceUnits || summary.rootSquadId === 0) return;
    this.companyId = this.companyOf(summary.rootSquadId);
    this.startAt = ctx.clock.now;
    this.nextCity = this.startAt + CITY_FIRST;
    const r = ctx.rng.fork('session.journee');
    this.rng = () => r.next();
    this.stage_ = 'prise_de_service';
    // l'ordre de mouvement part tout de suite (avant la première décision du commandement IA, qui sinon déploierait
    // ses groupes à pied depuis la caserne) ; la radio l'annonce au fil des premières secondes
    this.dispatch();
  }

  /** Compagnie (racine) de l'unité. */
  private companyOf(id: number): number {
    const ctx = this.ctx!;
    let s = ctx.squads.get(id);
    for (let guard = 0; s && s.parentId !== 0 && guard < 8; guard++) s = ctx.squads.get(s.parentId) ?? undefined;
    return s ? s.id : id;
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx || this.stage_ === 'inactif') return;
    const now = ctx.clock.now;
    if (now < this.nextThink) return;
    this.nextThink = now + 0.5;
    const t = now - this.startAt;
    this.cityLife(now);
    switch (this.stage_) {
      case 'prise_de_service':
      case 'embarquement':
        if (!this.briefed && t >= BRIEF_AT) this.brief();
        if (t >= DISPATCH_AT && !this.moveSaid) this.sayMove();
        if (this.stage_ === 'embarquement') this.thinkEmbark();
        break;
      case 'route':
        this.thinkRoute();
        break;
      case 'sur_place':
        this.thinkOnSite();
        break;
      case 'rembarquement':
      case 'retour':
        this.thinkReturn(now);
        break;
      case 'fin':
        if (this.endAt > 0 && now >= this.endAt) {
          this.endAt = 0;
          ctx.session.end(true);
        }
        break;
      default:
        break;
    }
  }

  // ───────────────────────────── étapes ─────────────────────────────

  private companyName(): string {
    return this.ctx!.squads.get(this.companyId)?.name ?? 'COMPAGNIE';
  }

  private brief(): void {
    const ctx = this.ctx!;
    this.briefed = true;
    const cfg = ctx.session.config!;
    const cause = typeof cfg.extra?.['causeLabel'] === 'string' ? ` (${String(cfg.extra['causeLabel']).toLowerCase()})` : '';
    const hour = this.hourIn(15 * 60);
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 2,
      text: `${this.companyName()} de CENTRAL. Prise de service à la ${SERVICE_BASE.name}. Manifestation déclarée${cause}, rassemblement ${cfg.place || 'en ville'} vers ${hour}. Préparez-vous au départ.` });
    ctx.ui.notify('Prise de service à la caserne de la Cité : écoutez la radio.', 'info', 6);
  }

  /** Heure de jeu dans `seconds` secondes (« 14 h 25 »). */
  private hourIn(seconds: number): string {
    const ctx = this.ctx!;
    const h0 = ctx.env?.state?.timeOfDay ?? ctx.session.config?.timeOfDay ?? 14;
    const h = (h0 + seconds / 3600) % 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60 / 5) * 5;
    return `${hh} h ${mm < 10 ? '0' : ''}${mm}`;
  }

  /** Ordre de mouvement : zone de stationnement à l'écart du rassemblement, colonne par le commandement. */
  private dispatch(): void {
    const ctx = this.ctx!;
    const cfg = ctx.session.config!;
    const x = typeof cfg.x === 'number' ? cfg.x : 0;
    const z = typeof cfg.z === 'number' ? cfg.z : 0;
    const stand = chooseStandOffCrowd(ctx, x, z, ctx.director.route, (p) => p.faction === 'protest');
    const at = stand ?? { x, z, heading: 0 };
    const name = this.place(at.x, at.z);
    this.dest = { x: at.x, z: at.z, heading: at.heading, name };
    this.lineUp(at.x, at.z);
    const command = ctx.service<CommandLike>('police.command');
    const ok = !!command && command.arrive(this.companyId, { x: at.x, z: at.z, heading: at.heading, layout: 'file', boardFirst: true });
    this.stage_ = 'embarquement';
    if (!ok) {
      // pas de commandement (module absent) : le joueur s'y rend lui-même
      this.objective(`Rejoindre ${name}`, at.x, at.z, true);
      this.stage_ = 'route';
      return;
    }
    this.embarkObjective();
  }

  /** Ordre de mouvement à la radio (après le briefing). */
  private sayMove(): void {
    const ctx = this.ctx!;
    this.moveSaid = true;
    const cfg = ctx.session.config!;
    const name = this.dest ? this.dest.name : 'la zone indiquée';
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 2,
      text: `${this.companyName()}, faites mouvement sur ${cfg.place || name}. Zone de stationnement : ${name}. Départ en colonne, deux tons.` });
  }

  /** Le joueur à pied : objectif « Embarquez » sur le véhicule de son groupe ; au volant de son engin : « Suivez ». */
  private embarkObjective(): void {
    const ctx = this.ctx!;
    const me = ctx.player.person();
    if (!me) return;
    if (me.vehicleId !== 0) {
      const v = ctx.vehicles.get(me.vehicleId);
      if (v && v.seats[0] === me.id && this.dest) this.objective(`Suivez la colonne : ${this.dest.name}`, this.dest.x, this.dest.z, true);
      else this.objective('À bord : la colonne va partir', me.x, me.z, false);
      return;
    }
    const v = this.seatFor(me);
    if (v) this.objective(`Embarquez : ${this.vehicleLabel(v)}`, v.x, v.z, true);
    else if (this.dest) this.objective(`Rejoignez ${this.dest.name}`, this.dest.x, this.dest.z, true);
  }

  private thinkEmbark(): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    // la colonne roule dès que la tête bouge
    const lead = this.convoyLead();
    if (lead && Math.abs(lead.speed) > 1.2) {
      this.stage_ = 'route';
      this.setSirens(true);
      const d = this.dest!;
      this.objective(`En route en colonne : ${d.name}`, d.x, d.z, true);
      return;
    }
    if (st && (st.stage === 'debarquement' || st.stage === 'en_place')) {
      this.arrived();
      return;
    }
    this.embarkObjective();
  }

  private thinkRoute(): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    if (!st || st.stage === 'debarquement' || st.stage === 'en_place' || st.stage === 'stationnement') {
      if (st && st.stage === 'stationnement') return;
      this.arrived();
    }
  }

  /** Arrivée : sirènes coupées, le joueur passager descend avec son groupe, le commandement prend la main. */
  private arrived(): void {
    const ctx = this.ctx!;
    this.setSirens(false);
    const me = ctx.player.person();
    if (me && me.vehicleId !== 0) {
      const v = ctx.vehicles.get(me.vehicleId);
      // passager d'un véhicule de la colonne : il descend avec les autres
      if (v && v.seats[0] !== me.id && CONVOY_KINDS.has(v.kind)) ctx.vehicles.exit(me);
    }
    this.stage_ = 'sur_place';
    this.clearObjective();
    ctx.radio.say({ channel: 'commandement', from: this.companyName(), priority: 1,
      text: `CENTRAL de ${this.companyName()}. Sur place, ${this.dest ? this.dest.name : 'zone de stationnement'}. On débarque et on se met en place.` });
  }

  private thinkOnSite(): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    if (st && (st.stage === 'rembarquement' || st.stage === 'depart')) {
      this.stage_ = 'rembarquement';
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: `${this.companyName()}, fin de mission reçue. Rembarquez, retour ${SERVICE_BASE.name}.` });
    }
  }

  private thinkReturn(now: number): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    const me = ctx.player.person();
    if (this.stage_ === 'rembarquement') {
      if (me && me.vehicleId === 0) {
        const v = this.seatFor(me);
        if (v) this.objective(`Rembarquez : ${this.vehicleLabel(v)}`, v.x, v.z, true);
      } else this.clearObjective();
      if (st && st.stage === 'depart') {
        this.stage_ = 'retour';
        this.setSirens(false);
        this.objective(`Retour : ${SERVICE_BASE.name}`, SERVICE_BASE.x, SERVICE_BASE.z, true);
      }
      return;
    }
    // retour : la colonne (ou le joueur) arrive à la caserne ; filet de sécurité : la journée ne reste pas bloquée
    if (this.returnAt === 0) this.returnAt = now;
    const lead = this.convoyLead();
    const atBase = (lead && Math.hypot(lead.x - SERVICE_BASE.x, lead.z - SERVICE_BASE.z) < BASE_RADIUS && Math.abs(lead.speed) < 0.5)
      || (st && st.stage === 'parti' && me && Math.hypot(me.x - SERVICE_BASE.x, me.z - SERVICE_BASE.z) < BASE_RADIUS * 2)
      || now - this.returnAt > RETURN_MAX;
    if (atBase) {
      this.stage_ = 'fin';
      this.endAt = now + DEBRIEF_DELAY;
      this.clearObjective();
      ctx.radio.say({ channel: 'commandement', from: this.companyName(), priority: 2, text: `CENTRAL de ${this.companyName()}. Retour ${SERVICE_BASE.name}, fin de service. Rien à signaler de plus.` });
      ctx.ui.notify('Fin de service : compte rendu dans quelques secondes.', 'ok', 6);
    }
  }

  // ───────────────────────────── la ville vit ─────────────────────────────

  /** Feux de poubelles et de conteneurs dans d'autres quartiers : la radio les signale, les incidents les suivent. */
  private cityLife(now: number): void {
    if (now < this.nextCity || this.cityCount >= CITY_MAX || this.stage_ === 'fin') return;
    const ctx = this.ctx!;
    const rand = this.rng!;
    this.nextCity = now + CITY_EVERY_MIN + rand() * (CITY_EVERY_MAX - CITY_EVERY_MIN);
    const me = ctx.player.person();
    const ox = me ? me.x : SERVICE_BASE.x;
    const oz = me ? me.z : SERVICE_BASE.z;
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = rand() * Math.PI * 2;
      const d = CITY_MIN_DIST + rand() * (CITY_MAX_DIST - CITY_MIN_DIST);
      const x = ox + Math.cos(a) * d;
      const z = oz + Math.sin(a) * d;
      const b = ctx.world.bounds;
      if (x < b.minX + 50 || x > b.maxX - 50 || z < b.minZ + 50 || z > b.maxZ - 50) continue;
      if (!ctx.world.nearestRoad(x, z, this.road, 60) || this.road.width < 5) continue;
      // au bord de la chaussée (côté trottoir)
      const h = this.road.heading;
      const side = this.road.width * 0.5 + 1.2;
      const px = this.road.x + Math.cos(h) * side;
      const pz = this.road.z - Math.sin(h) * side;
      if (!ctx.world.isFree(px, pz, 0.8)) continue;
      const kind = rand() < 0.6 ? 'poubelle' : 'conteneur';
      const prop = ctx.props.spawn(kind, px, pz, h);
      ctx.props.damage(prop, 1000, 'burn', 0);
      ctx.hazards.ignite(px, pz, kind === 'conteneur' ? 1.6 : 1.0, 0.8, 0);
      this.cityCount++;
      const street = this.road.name || ctx.world.sectorName(px, pz) || 'en ville';
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1,
        text: `À tous de CENTRAL : feu de ${kind === 'poubelle' ? 'poubelles' : 'conteneur'}, ${street}. Pompiers engagés.` });
      return;
    }
  }

  // ───────────────────────────── aides ─────────────────────────────

  /**
   * À la caserne, les véhicules de la compagnie sont rangés en FILE le long du début de l'itinéraire, nez vers la
   * sortie, le véhicule de commandement en tête et le cellulaire en serre-file : la colonne part sans manœuvre.
   * (Garés en bloc sur le parvis, ils s'enfermaient les uns les autres.)
   */
  private lineUp(tx: number, tz: number): void {
    const ctx = this.ctx!;
    const list: Vehicle[] = [];
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (v && CONVOY_KINDS.has(v.kind) && !v.def.flying && list.indexOf(v) < 0 && Math.abs(v.speed) < 0.2) list.push(v);
    }
    if (list.length === 0) return;
    const rank = (v: Vehicle): number => (v.kind === 'vl_commandement' ? 0 : v.kind === 'fourgon_cellulaire' ? 3 : v.kind === 'fourgon_crs' || v.kind === 'car_crs' ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
    let cx = 0, cz = 0;
    for (const v of list) { cx += v.x; cz += v.z; }
    cx /= list.length;
    cz /= list.length;
    const path: number[] = [];
    let ok = false;
    try { ok = ctx.world.findPath(cx, cz, tx, tz, 'vehicle', path) && path.length >= 4; } catch { ok = false; }
    if (!ok) return;
    const p = { x: 0, z: 0 };
    let s = 6;
    // du serre-file (le plus près du départ) à la tête (la plus avancée sur l'itinéraire)
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i]!;
      s += v.def.length * 0.5;
      const h = pointOnPolyline(path, s, p);
      // à droite de l'axe de la voie si la place est libre
      const rx = Math.cos(h), rz = -Math.sin(h);
      let x = p.x + rx * 1.4, z = p.z + rz * 1.4;
      if (!ctx.world.isFree(x, z, v.def.width * 0.5)) { x = p.x; z = p.z; }
      if (ctx.world.isFree(x, z, v.def.width * 0.45)) {
        v.x = x;
        v.z = z;
        v.heading = h;
        v.vx = 0;
        v.vz = 0;
        v.speed = 0;
      }
      s += v.def.length * 0.5 + 4;
    }
  }

  /** Véhicule de tête de la colonne de la compagnie (véhicule de commandement, sinon un fourgon de la compagnie). */
  private convoyLead(): Vehicle | null {
    const ctx = this.ctx!;
    const company = ctx.squads.get(this.companyId);
    if (company && company.vehicleId !== 0) {
      const v = ctx.vehicles.get(company.vehicleId);
      if (v) return v;
    }
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (v && CONVOY_KINDS.has(v.kind)) return v;
    }
    return null;
  }

  /** Véhicule où le joueur doit monter : celui de son groupe s'il y reste une place, sinon un véhicule de la compagnie. */
  private seatFor(me: Person): Vehicle | null {
    const ctx = this.ctx!;
    const own = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    const free = (v: Vehicle): boolean => {
      for (let i = 1; i < v.seats.length; i++) if (v.seats[i] === 0) return true;
      return false;
    };
    if (own && own.vehicleId !== 0) {
      const v = ctx.vehicles.get(own.vehicleId);
      if (v && free(v)) return v;
    }
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || !CONVOY_KINDS.has(v.kind) || !free(v)) continue;
      const d = Math.hypot(v.x - me.x, v.z - me.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  /** « fourgon de CRS MISTRAL 1 BRAVO » (seule l'initiale passe en minuscule : les sigles restent). */
  private vehicleLabel(v: Vehicle): string {
    const ctx = this.ctx!;
    const name = v.def.name.charAt(0).toLowerCase() + v.def.name.slice(1);
    for (const s of ctx.squads.list) if (s.vehicleId === v.id) return `${name} ${s.name}`;
    return name;
  }

  /** Sirènes et gyrophares de toute la colonne. */
  private setSirens(on: boolean): void {
    const ctx = this.ctx!;
    if (this.sirensOn === on) return;
    this.sirensOn = on;
    const ext = ctx.service<VehiclesExt>('vehicles.ext');
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== this.companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (!v || !CONVOY_KINDS.has(v.kind)) continue;
      if (v.def.hasSiren) {
        if (ext && ext.setSiren) ext.setSiren(v, on ? 1 : 0);
        else v.siren = on ? 1 : 0;
      }
      if (v.def.hasBeacons) {
        if (ext && ext.setBeacons) ext.setBeacons(v, on);
        else v.beacons = on;
      }
    }
  }

  private place(x: number, z: number): string {
    const world = this.ctx!.world;
    if (world.edgeCount > 0 && world.nearestRoad(x, z, this.road, 40) && this.road.name) return this.road.name;
    return world.sectorName(x, z) || 'le point indiqué';
  }

  private objective(text: string, x: number, z: number, track: boolean): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (!api) return;
    const o: Objective = { id: JOURNEE_OBJECTIVE_ID, text, state: 'actif', secondary: false, x, z };
    const cur = api.list.find((q) => q.id === JOURNEE_OBJECTIVE_ID);
    if (!cur || cur.text !== text || cur.x !== x || cur.z !== z) api.upsert(o);
    if (track && api.tracked !== JOURNEE_OBJECTIVE_ID) api.tracked = JOURNEE_OBJECTIVE_ID;
  }

  private clearObjective(): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (!api) return;
    if (api.list.some((q) => q.id === JOURNEE_OBJECTIVE_ID)) api.remove(JOURNEE_OBJECTIVE_ID);
    if (api.tracked === JOURNEE_OBJECTIVE_ID) api.tracked = '';
  }
}
