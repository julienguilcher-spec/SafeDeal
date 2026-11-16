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
 *   6. seconde intervention (journée normale ou longue) : de retour à la caserne, la salle engage la compagnie sur
 *                          des feux de véhicules et de conteneurs dans un autre quartier (pompiers engagés) :
 *                          colonne, cordon autour des feux, retour quand ils sont éteints ;
 *   7. fin de service    : compte rendu.
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
import { SERVICE_BASE, baseOf, isJournee } from './journee-data';
import type { ServiceBase } from './journee-data';
import { chooseStandOffCrowd } from './placement';
import { pointOnPolyline } from '@/core/math';

export type JourneeStage =
  | 'inactif' | 'prise_de_service' | 'embarquement' | 'route' | 'sur_place' | 'rembarquement' | 'retour'
  | 'intervention_route' | 'intervention' | 'fin';

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
  depart(companyId: number, exit?: { x: number; z: number }): boolean;
  convoyOf(companyId: number): { stage: string } | null;
  stateOf(companyId: number): { phase: string; missionEnded: boolean } | null;
  special?(squadId: number): { kind: string } | null;
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
/** Durée maximale de la seconde intervention avant de lever le périmètre (s). */
const INTERVENTION_MAX = 420;
/** Arrivée sans colonne : distance du joueur (ou du chef de son unité) à la zone de stationnement (m). */
const SOLO_ARRIVE = 70;

const CONVOY_KINDS: ReadonlySet<string> = new Set(['fourgon_crs', 'car_crs', 'vl_commandement', 'fourgon_cellulaire', 'canon_eau', 'centaure']);

export class JourneeSystem implements GameSystem {
  readonly id = 'session.journee';
  readonly order = SystemOrder.CONTROL + 47;

  private ctx: GameContext | null = null;
  /** Lieu de prise de service (caserne ou commissariat, choisi au démarrage selon le lieu du rassemblement). */
  private base: ServiceBase = SERVICE_BASE;
  /** Session de mission : la mission a son propre déroulé (pas de feux en ville ni de seconde intervention). */
  private mission = false;
  /** Le joueur ne voyage pas dans une colonne de la compagnie (BRAV-M, unité sans véhicules) : arrivée à la distance. */
  private solo = false;
  private stage_: JourneeStage = 'inactif';
  private companyId = 0;
  private startAt = 0;
  private briefed = false;
  private moveSaid = false;
  private dest: { x: number; z: number; heading: number; name: string } | null = null;
  private endAt = 0;
  private returnAt = 0;
  private secondDone = false;
  private interventionAt = 0;
  private onSiteAt = 0;
  private site: { x: number; z: number; name: string } | null = null;
  private readonly fires: { x: number; z: number; vehicleId: number }[] = [];
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
      get travelling() { return self.stage_ === 'embarquement' || self.stage_ === 'route' || self.stage_ === 'rembarquement' || self.stage_ === 'retour' || self.stage_ === 'intervention_route'; },
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
    this.secondDone = false;
    this.solo = false;
    this.interventionAt = 0;
    this.site = null;
    this.fires.length = 0;
    this.cityCount = 0;
    this.sirensOn = false;
    this.nextThink = 0;
  }

  private onSetup(summary: SessionSetupSummary): void {
    const ctx = this.ctx!;
    this.reset();
    if (!isJournee(ctx.session.config) || !summary.usedPoliceUnits || summary.rootSquadId === 0) return;
    this.base = baseOf(ctx.session.config);
    this.mission = (ctx.session.config?.missionId ?? '') !== '';
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
    if (!this.mission) this.cityLife(now);
    // briefing et ordre de mouvement : aussi quand le joueur part sans colonne (BRAV-M en tête de ses motards)
    if (!this.briefed && t >= BRIEF_AT) this.brief();
    if (t >= DISPATCH_AT && !this.moveSaid && this.dest) this.sayMove();
    switch (this.stage_) {
      case 'prise_de_service':
      case 'embarquement':
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
      case 'intervention_route':
        this.thinkInterventionRoute();
        break;
      case 'intervention':
        this.thinkIntervention(now);
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

  /** Unité spéciale BRAV-M ? */
  private isBravm(squadId: number): boolean {
    const ctx = this.ctx!;
    // à la mise en place, le registre des unités spéciales n'est pas encore à jour : on regarde aussi les machines
    const s = ctx.squads.get(squadId);
    if (s && s.vehicleId !== 0 && ctx.vehicles.get(s.vehicleId)?.kind === 'moto_bravm') return true;
    const command = ctx.service<CommandLike>('police.command');
    const sp = command && command.special ? command.special(squadId) : null;
    return !!sp && sp.kind === 'bravm';
  }

  /**
   * Les autres unités de la session (compagnies, BRAV-M) font mouvement vers (x, z) — à l'aller vers la zone de
   * stationnement, au retour vers la base : colonne motorisée du commandement pour une compagnie, colonne de motos
   * pour une BRAV-M. Chacune roule de son côté ; tout le monde se retrouve au même endroit.
   */
  private engageOthers(x: number, z: number, heading: number, back: boolean): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    for (const s of ctx.squads.list) {
      if (s.faction !== 'police' || s.parentId !== 0 || s.id === this.companyId) continue;
      // (une BRAV-M n'a pas de membres propres : ses binômes sont des sous-unités)
      if (this.isBravm(s.id)) {
        ctx.squads.issue(s.id, { type: 'colonne', x, z, heading, width: 0, issuedBy: s.leaderId });
        continue;
      }
      if (s.kind !== 'compagnie' || !command) continue;
      if (back) command.depart(s.id, { x, z });
      else {
        // véhicules mis en file, nez vers la sortie : garés en bloc, la tête manœuvrait sans fin pour sortir
        this.lineUp(x, z, s.id);
        command.arrive(s.id, { x, z, heading, layout: 'file', boardFirst: true });
      }
    }
  }

  /** « à la caserne de la Cité », « au commissariat du 9e arrondissement… ». */
  private atBase(): string {
    const n = this.base.name;
    return (/^commissariat/.test(n) ? 'au ' : 'à la ') + n;
  }

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
      text: `${this.companyName()} de CENTRAL. Prise de service ${this.atBase()}. Manifestation déclarée${cause}, rassemblement ${cfg.place || 'en ville'} vers ${hour}. Préparez-vous au départ.` });
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
    const me = ctx.player.person();
    const own = ctx.squads.get(this.companyId);
    if (own && this.isBravm(own.id)) {
      // BRAV-M : le joueur chef de bord prend la tête (ses motards le suivent) ; équipier, l'unité part sans lui attendre
      if (!me || own.leaderId !== me.id) ctx.squads.issue(own.id, { type: 'colonne', x: at.x, z: at.z, heading: at.heading, width: 0, issuedBy: own.leaderId });
      this.solo = true;
      this.objective(me && own.leaderId === me.id ? `En selle, en tête de la BRAV-M : ${name}` : `En selle avec la BRAV-M : ${name}`, at.x, at.z, true);
      this.stage_ = 'route';
      this.setSirens(true);
      return;
    }
    const ok = !!command && command.arrive(this.companyId, { x: at.x, z: at.z, heading: at.heading, layout: 'file', boardFirst: true });
    this.stage_ = 'embarquement';
    if (!ok) {
      // pas de colonne (module absent, unité sans véhicules) : le joueur s'y rend lui-même
      this.solo = true;
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
    // toutes les unités de la session font mouvement vers le même point, chacune avec ses véhicules (à l'annonce :
    // à la mise en place, les unités spéciales ne sont pas encore toutes constituées)
    if (this.dest) this.engageOthers(this.dest.x, this.dest.z, this.dest.heading, false);
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
    if (this.solo) {
      // sans colonne de la compagnie : arrivé quand le joueur (ou le chef de son unité) est sur le point
      const d = this.dest;
      const me = ctx.player.person();
      const own = ctx.squads.get(this.companyId);
      const lead = own ? ctx.people.get(own.leaderId) : undefined;
      const near = (p: { x: number; z: number } | undefined | null): boolean => !!p && !!d && Math.hypot(p.x - d.x, p.z - d.z) < SOLO_ARRIVE;
      if (near(me) || near(lead)) this.arrived();
      return;
    }
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
      this.engageOthers(this.base.x, this.base.z, 0, true);
      this.stage_ = 'rembarquement';
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 1, text: `${this.companyName()}, fin de mission reçue. Rembarquez, retour ${this.atBase()}.` });
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
        this.objective(`Retour : ${this.base.name}`, this.base.x, this.base.z, true);
      }
      return;
    }
    // retour : la colonne (ou le joueur) arrive à la caserne ; filet de sécurité : la journée ne reste pas bloquée
    if (this.returnAt === 0) this.returnAt = now;
    const lead = this.convoyLead();
    const atBase = (lead && Math.hypot(lead.x - this.base.x, lead.z - this.base.z) < BASE_RADIUS && Math.abs(lead.speed) < 0.5)
      || (st && st.stage === 'parti' && me && Math.hypot(me.x - this.base.x, me.z - this.base.z) < BASE_RADIUS * 2)
      || now - this.returnAt > RETURN_MAX;
    if (atBase && !this.mission && !this.secondDone && this.wantSecond()) {
      // la journée continue : la salle engage la compagnie sur une seconde intervention, ailleurs dans Paris
      this.secondDone = true;
      if (this.startIntervention(now)) return;
    }
    if (atBase) {
      this.stage_ = 'fin';
      this.endAt = now + DEBRIEF_DELAY;
      this.clearObjective();
      ctx.radio.say({ channel: 'commandement', from: this.companyName(), priority: 2, text: `CENTRAL de ${this.companyName()}. Retour ${this.atBase()}, fin de service. Rien à signaler de plus.` });
      ctx.ui.notify('Fin de service : compte rendu dans quelques secondes.', 'ok', 6);
    }
  }

  // ───────────────────────────── seconde intervention ─────────────────────────────

  /** Seconde intervention pour une journée normale ou longue (une journée courte s'arrête après la manifestation). */
  private wantSecond(): boolean {
    const d = this.ctx!.session.config?.duration;
    return d !== 'courte';
  }

  /**
   * Feux de véhicules et de conteneurs dans un autre quartier : la salle engage les pompiers et la compagnie, qui s'y
   * porte en colonne et tient un cordon autour des feux le temps de l'extinction.
   */
  private startIntervention(now: number): boolean {
    const ctx = this.ctx!;
    const rand = this.rng!;
    const command = ctx.service<CommandLike>('police.command');
    if (!command) return false;
    const b = ctx.world.bounds;
    for (let attempt = 0; attempt < 80; attempt++) {
      const a = rand() * Math.PI * 2;
      const d = 600 + rand() * 1000;
      const x = this.base.x + Math.cos(a) * d;
      const z = this.base.z + Math.sin(a) * d;
      if (x < b.minX + 80 || x > b.maxX - 80 || z < b.minZ + 80 || z > b.maxZ - 80) continue;
      // une rue où l'on peut garer des voitures le long du trottoir et faire passer la colonne (6 m au moins)
      if (!ctx.world.nearestRoad(x, z, this.road, 80) || this.road.width < 6) continue;
      const h = this.road.heading;
      const rx = Math.cos(h), rz = -Math.sin(h);
      const curb = Math.max(1.2, this.road.width * 0.5 - 1.1);
      const fx = this.road.x, fz = this.road.z;
      const street = this.road.name || ctx.world.sectorName(fx, fz) || 'en ville';
      // zone de stationnement : 45 m en amont, côté caserne
      const ux = fx - this.base.x, uz = fz - this.base.z;
      const ul = Math.hypot(ux, uz) || 1;
      const sx = fx - (ux / ul) * 45, sz = fz - (uz / ul) * 45;
      if (!ctx.world.nearestRoad(sx, sz, this.road, 40)) continue;
      const stand = { x: this.road.x, z: this.road.z, heading: Math.atan2(fx - this.road.x, fz - this.road.z) };
      // deux voitures en feu le long du trottoir, deux conteneurs
      this.fires.length = 0;
      const kinds = ['citadine', 'voiture'] as const;
      for (let i = 0; i < 2; i++) {
        const along = (i === 0 ? -4 : 4);
        const vx = fx + rx * curb + Math.sin(h) * along, vz = fz + rz * curb + Math.cos(h) * along;
        if (!ctx.world.isFree(vx, vz, 1.0)) continue;
        const v = ctx.vehicles.spawn(kinds[i]!, vx, vz, h);
        ctx.vehicles.damage(v, { amount: 30, kind: 'burn', sourceId: 0, x: vx, z: vz });
        this.fires.push({ x: vx, z: vz, vehicleId: v.id });
      }
      for (let i = 0; i < 2; i++) {
        const px = fx - rx * curb + Math.sin(h) * (i === 0 ? -2 : 6), pz = fz - rz * curb + Math.cos(h) * (i === 0 ? -2 : 6);
        if (!ctx.world.isFree(px, pz, 0.8)) continue;
        const prop = ctx.props.spawn('conteneur', px, pz, h);
        ctx.props.damage(prop, 1000, 'burn', 0);
        ctx.hazards.ignite(px, pz, 1.6, 0.9, 0);
        this.fires.push({ x: px, z: pz, vehicleId: 0 });
      }
      if (this.fires.length === 0) continue;
      this.site = { x: fx, z: fz, name: street };
      this.dest = { x: stand.x, z: stand.z, heading: stand.heading, name: street };
      this.returnAt = 0;
      this.interventionAt = now;
      ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: 2,
        text: `${this.companyName()} de CENTRAL. Changement de mission : véhicules et conteneurs en feu, ${street}. Portez-vous sur place et sécurisez le périmètre pour les sapeurs-pompiers. Deux tons.` });
      // la salle engage les pompiers
      const rescue = ctx.service<{ request(kind: 'pompiers' | 'samu', x: number, z: number, byId: number): unknown }>(EXT.rescue);
      if (rescue) rescue.request('pompiers', fx, fz, 0);
      command.arrive(this.companyId, { x: stand.x, z: stand.z, heading: stand.heading, layout: 'file', boardFirst: true });
      this.stage_ = 'intervention_route';
      this.objective(`Intervention : feux, ${street}`, fx, fz, true);
      return true;
    }
    return false;
  }

  private thinkInterventionRoute(): void {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const st = command ? command.convoyOf(this.companyId) : null;
    const lead = this.convoyLead();
    if (lead && Math.abs(lead.speed) > 1.2) this.setSirens(true);
    const me = ctx.player.person();
    if (me && me.vehicleId === 0 && st && st.stage === 'route' && !(lead && Math.abs(lead.speed) > 1.2)) {
      const v = this.seatFor(me);
      if (v) this.objective(`Embarquez : ${this.vehicleLabel(v)}`, v.x, v.z, true);
    } else if (this.site) {
      this.objective(`Intervention : feux, ${this.site.name}`, this.site.x, this.site.z, true);
    }
    // sur place : la colonne débarque PRÈS du site (et non un ancien état du convoi), ou délai de garde dépassé
    const site = this.site!;
    const close = lead ? Math.hypot(lead.x - site.x, lead.z - site.z) < 160 : true;
    const late = ctx.clock.now - this.interventionAt > 900;
    if (!st || ((st.stage === 'debarquement' || st.stage === 'en_place') && close) || late) this.onIntervention();
  }

  /** Sur place : le joueur passager descend, la compagnie forme un cordon autour des feux. */
  private onIntervention(): void {
    const ctx = this.ctx!;
    this.setSirens(false);
    const me = ctx.player.person();
    if (me && me.vehicleId !== 0) {
      const v = ctx.vehicles.get(me.vehicleId);
      if (v && v.seats[0] !== me.id && CONVOY_KINDS.has(v.kind)) ctx.vehicles.exit(me);
    }
    const site = this.site!;
    const company = ctx.squads.get(this.companyId);
    if (company) {
      ctx.squads.issue(company.id, { type: 'proteger', x: site.x, z: site.z, heading: this.dest ? this.dest.heading : 0, width: 36, issuedBy: company.leaderId });
    }
    this.stage_ = 'intervention';
    this.onSiteAt = ctx.clock.now;
    this.objective(`Sécurisez le périmètre pour les pompiers : ${site.name}`, site.x, site.z, true);
    ctx.radio.say({ channel: 'commandement', from: this.companyName(), priority: 1,
      text: `CENTRAL de ${this.companyName()}. Sur place, ${site.name}. Périmètre en cours, j'attends les sapeurs-pompiers.` });
  }

  /** Feux éteints (ou sept minutes écoulées) : fin d'intervention, rembarquement, retour à la caserne. */
  private thinkIntervention(now: number): void {
    const ctx = this.ctx!;
    let burning = 0;
    for (const f of this.fires) {
      const v = f.vehicleId !== 0 ? ctx.vehicles.get(f.vehicleId) : undefined;
      if (v && v.state === 'burning') burning++;
      else if (!v && ctx.hazards.fireAt(f.x, f.z) > 0.05) burning++;
    }
    // le périmètre est tenu au moins une minute et demie, et jusqu'à l'extinction (sept minutes au plus)
    if (now - this.onSiteAt < 90) return;
    if (burning > 0 && now - this.onSiteAt < INTERVENTION_MAX) return;
    const command = ctx.service<CommandLike>('police.command');
    ctx.radio.say({ channel: 'commandement', from: this.companyName(), priority: 1,
      text: burning > 0 ? `CENTRAL de ${this.companyName()}. Les sapeurs-pompiers tiennent le feu, on lève le périmètre. Retour ${this.atBase()}.`
        : `CENTRAL de ${this.companyName()}. Feux éteints, fin d'intervention. Retour ${this.atBase()}.` });
    this.stage_ = 'rembarquement';
    if (!command || !command.depart(this.companyId, { x: this.base.x, z: this.base.z })) {
      this.stage_ = 'retour';
      this.objective(`Retour : ${this.base.name}`, this.base.x, this.base.z, true);
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
    const ox = me ? me.x : this.base.x;
    const oz = me ? me.z : this.base.z;
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
  private lineUp(tx: number, tz: number, companyId = this.companyId): void {
    const ctx = this.ctx!;
    const list: Vehicle[] = [];
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0 || this.companyOf(s.id) !== companyId) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      // (un véhicule sans conducteur — fourgon cellulaire sans équipage — ne part pas : le mettre en file sur
      // l'itinéraire bloquerait ceux qui le suivent)
      if (v && CONVOY_KINDS.has(v.kind) && !v.def.flying && list.indexOf(v) < 0 && Math.abs(v.speed) < 0.2 && v.seats[0] !== 0) list.push(v);
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
    // une place libre dans un véhicule qui a son conducteur (sans conducteur, il ne partira pas avec la colonne)
    const free = (v: Vehicle): boolean => {
      if (v.seats[0] === 0) return false;
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
