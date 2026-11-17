/* =====================================================================================
 * ORDRES AU JOUEUR — la chaîne de commandement IA donne au joueur exécutant un poste où se rendre.
 *
 * Demande du commanditaire : « si je suis pilote du Centaure, il faut me donner un ordre et me mettre le point
 * sur le GPS : rends-toi à… Sinon je ne sers à rien. » Les incidents (feux, barricades, pillages) sont déjà confiés
 * au joueur par la salle (gameplay/incidents) ; ce système couvre le reste du temps : le commandant de la compagnie
 * (indicatif radio de la compagnie) poste le joueur selon la situation réelle :
 *   - foyers de tension repérés par le commandement (police.command.hotspots), barrages du dispositif (posts),
 *     à défaut le gros de la foule ;
 *   - selon le rôle : canon à eau et Centaure en appui derrière le barrage le plus exposé, BRAV-M en réserve
 *     d'intervention, chef de groupe en renfort d'un barrage, télépilote au-dessus du foyer ; CRS : l'ordre de son
 *     groupe (donné par l'IA) lui est rappelé.
 * Présentation : message radio, objectif « Ordre » au HUD (suivi par le GPS : itinéraire sur la carte et la
 * boussole). À l'arrivée (mesurée à chaque pas, sur la position du joueur, comme la distance affichée), le joueur
 * rend compte « en place » et l'objectif devient un stand-by explicite (« En place — stand-by, en attente des
 * ordres », avec quoi faire en attendant) : il y a toujours un objectif en cours. Le commandant réévalue la
 * situation (foyers, gros de la foule) et donne le poste suivant quand elle change.
 * Désignation de tir (Centaure, canon à eau) : quand le commandement engage l'engin du joueur (salve de
 * lacrymogènes, jet sur un groupe, extinction), le joueur reçoit la zone à battre (point, rayon, gisement et
 * distance), validée quand il tire réellement dedans ; hors du cadre légal, la carte dit « Tir non autorisé ».
 * Pendant une tâche d'incident confiée au joueur, l'ordre s'efface (la tâche passe avant).
 * Commandant et commissaire ne reçoivent pas d'ordres : ils les donnent.
 * Simulation pure (aucun DOM).
 * ===================================================================================== */

import type { GameContext, GameSystem, Person, RoadSample, Squad } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, Objective, ObjectivesApi } from '@/core/extensions';

/** Vue minimale du cadre de mission (service 'missions', src/gameplay/missions/system.ts). */
interface MissionLike {
  readonly current: unknown;
  readonly objectives: readonly { state: string; at: unknown; def: { secondary: boolean } }[];
}

/** Vue minimale du commandement IA (police.command). */
interface PostLike { kind: string; x: number; z: number; heading: number; name: string; state: string }
interface CommandLike {
  readonly commands: readonly { squadId: number; phase: string; posts: readonly PostLike[] }[];
  readonly hotspots: readonly { x: number; z: number; heat: number; kind: string; seen: boolean; knownAt: number }[];
}

export const ORDER_OBJECTIVE_ID = 'ordre';
export const ORDERS_SERVICE = 'session.orders';

/** Ordre en cours donné au joueur (null s'il n'en a pas). */
export interface PlayerOrdersApi {
  readonly current: Readonly<{
    x: number; z: number; text: string; arrived: boolean;
    /** Ce que le joueur fait (en route, en stand-by, ou pour le tir désigné : gisement et distance). */
    detail: string;
    /** Désignation de tir en cours (zone à battre), null s'il n'y en a pas. */
    fire: Readonly<{ kind: FireKind; radius: number; allowed: boolean }> | null;
  }> | null;
}

/** Libellé du stand-by après « en place ». */
export const STANDBY_TEXT = 'En place — stand-by, en attente des ordres';

/** Nature d'un tir désigné : salve de lacrymogènes (Centaure), jet sur un groupe, extinction (canon à eau). */
export type FireKind = 'lacrymo' | 'jet' | 'extinction';

/** Rythme de réévaluation (s), délai minimal entre deux ordres (s), distance qui justifie un nouvel ordre (m). */
const THINK_PERIOD = 4;
const FIRST_ORDER_DELAY = 8;
const MIN_ORDER_GAP = 45;
const RETARGET_DIST = 70;
/** Après « en place », un nouveau poste n'est donné qu'au bout de ce délai (s), si la situation a changé. */
const HOLD_TIME = 60;
/** Distance d'arrivée (m) : à pied, en véhicule. */
const ARRIVE_FOOT = 12;
const ARRIVE_VEHICLE = 25;
/** Désignation de tir : durée de validité (s), tolérance autour de la zone (m), portée utile du jet (m). */
const FIRE_TTL = 90;
const FIRE_TOLERANCE = 8;
const JET_RANGE = 60;
/** Rayon de la zone désignée (m) : salve (zone d'arrivée de la grenade), groupe à repousser, foyer. */
const FIRE_RADIUS: Readonly<Record<FireKind, number>> = { lacrymo: 18, jet: 15, extinction: 6 };
/** Intensité minimale d'un foyer pour y envoyer du monde. */
const HOT_MIN = 0.8;
/** Côté des cases du repérage du gros de la foule (m). */
const CELL = 60;

type Kind = 'engin' | 'bravm' | 'chef' | 'drone' | 'crs';

const ROLE_KIND: Readonly<Record<string, Kind>> = {
  operateur_canon_eau: 'engin', gendarme_centaure: 'engin', bravm: 'bravm', chef_groupe: 'chef', telepilote: 'drone', crs: 'crs',
};

/** Libellés des ordres de groupe rappelés au CRS. */
const GROUP_ORDER_TEXT: Readonly<Record<string, string>> = {
  tenir: 'tenir la position', ligne: 'tenir la ligne', colonne: 'se déplacer en colonne', avancer: 'avancer',
  proteger: 'protéger le site', couper_circulation: 'barrer la rue, personne ne passe', filtrer: 'tenir un barrage filtrant',
  encercler: 'encercler', refoulement: 'refouler', charge: 'charger', repli: 'se replier', degager_barricade: 'dégager la barricade',
  escorter: 'escorter', releve: 'relever une unité', eteindre: 'éteindre le feu', secourir: 'secourir',
};

interface FireOrder {
  kind: FireKind;
  radius: number;
  /** Cadre légal réuni (force licite, sommations faites) : on peut demander au joueur de tirer. */
  allowed: boolean;
  /** Type de l'ordre de groupe d'origine et son instant (pour le retirer s'il change). */
  type: string;
  issuedAt: number;
  /** Niveau de force autorisé par l'ordre. */
  maxForce: number;
  /** Secondes de jet dans la zone (canon à eau). */
  jetHeld: number;
}

interface Current {
  x: number;
  z: number;
  text: string;
  detail: string;
  since: number;
  arrived: boolean;
  arrivedAt: number;
  /** Ordre de groupe rappelé (CRS) : pas de compte rendu radio. */
  mirror: boolean;
  fire: FireOrder | null;
  /** Stand-by faute d'ordre : remplacé dès qu'il y a un poste à donner. */
  idle?: boolean;
}

/** Ordre de groupe reçu par l'engin du joueur, en attente de traduction en désignation. */
interface PendingFire { kind: FireKind; x: number; z: number; type: string; maxForce: number; issuedAt: number }

export class PlayerOrdersSystem implements GameSystem {
  readonly id = 'session.orders';
  readonly order = SystemOrder.CONTROL + 46;

  private ctx: GameContext | null = null;
  private cur: Current | null = null;
  private nextThink = 0;
  private startedAt = -1;
  private pendingFire: PendingFire | null = null;
  private nextDetail = 0;
  private offs: (() => void)[] = [];
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;
  private readonly cells = new Map<number, number>();

  provide(ctx: GameContext): void {
    const self = this;
    ctx.provide(ORDERS_SERVICE, { get current() { return self.cur; } } satisfies PlayerOrdersApi);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    const ev = ctx.events;
    // l'engin du joueur est engagé par le commandement : désignation de tir
    this.offs.push(ev.on('order:issued', (e) => this.onSquadOrder(e.squadId, e.order)));
    // tir réel du joueur : salve dans la zone, jet sur le groupe ou le feu, feu éteint
    this.offs.push(ev.on('projectile:impact', (e) => this.onImpact(e.ownerId, e.kind, e.x, e.z)));
    this.offs.push(ev.on('vehicle:turret_fired', (e) => this.onTurret(e.id, e.turret, e.byId)));
    this.offs.push(ev.on('fire:out', (e) => this.onFireOut(e.x, e.z)));
  }

  reset(): void {
    this.cur = null;
    this.nextThink = 0;
    this.startedAt = -1;
    this.pendingFire = null;
    this.nextDetail = 0;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }

  /** Ordre en cours (lecture, pour l'interface et les tests). */
  get current(): Readonly<Current> | null {
    return this.cur;
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const me = ctx.player.person();
    const kind = me ? this.kindOf(me) : null;
    if (!me || !kind) {
      if (this.cur) this.drop();
      return;
    }
    const now = ctx.clock.now;
    if (this.startedAt < 0) this.startedAt = now;
    // arrivée mesurée à chaque pas (pas toutes les THINK_PERIOD secondes) : à 0 m, l'ordre est validé tout de suite
    const cur0 = this.cur;
    if (cur0 && !cur0.arrived && !cur0.mirror && !cur0.fire) this.checkArrival(me, now);
    if (cur0 && cur0.fire && now >= this.nextDetail) {
      this.nextDetail = now + 0.5;
      this.fireDetail(me, cur0);
    }
    if (now < this.nextThink) return;
    this.nextThink = now + THINK_PERIOD;

    // une tâche d'incident confiée au joueur passe avant : l'ordre s'efface, il reviendra ensuite
    const incidents = ctx.service<IncidentsApi>(EXT.incidents);
    if (incidents && incidents.playerIncidentId !== 0) {
      if (this.cur) this.drop();
      return;
    }
    if (now - this.startedAt < FIRST_ORDER_DELAY) return;
    // journée de service : pendant l'embarquement, la route et le retour, c'est le déplacement qui est l'ordre
    const journee = ctx.service<{ travelling: boolean }>('session.journee');
    if (journee && journee.travelling) {
      if (this.cur) this.drop();
      return;
    }

    if (kind === 'crs') {
      // la carte « Ma mission » (session.mission) tient l'ordre du groupe, en mots simples, avec son propre GPS
      if (ctx.service('session.mission') !== undefined) {
        if (this.cur) this.drop();
        return;
      }
      this.mirrorGroup(me, now);
      return;
    }
    // désignation de tir : prime sur le poste ; retirée quand la situation change
    if (kind === 'engin' && this.thinkFire(me, now)) return;
    // mission du catalogue qui dit elle-même où aller (objectif principal en cours, placé sur la carte) : pas de poste
    // du commandement IA en plus, ailleurs (un seul objectif clair à la fois)
    if (this.missionPlaces()) {
      if (this.cur) this.drop();
      return;
    }
    const want = this.decide(me, kind);
    const cur = this.cur;
    if (!want) {
      // rien à ordonner (ni foule ni dispositif) : stand-by explicite sur place, jamais une liste vide
      if (!cur) this.standby(me, now);
      else this.republish();
      return;
    }
    const far = !cur || cur.idle || Math.hypot(want.x - cur.x, want.z - cur.z) > RETARGET_DIST;
    const due = !cur || cur.idle === true || (cur.arrived ? now - cur.arrivedAt > HOLD_TIME : now - cur.since > MIN_ORDER_GAP);
    if (far && due) this.give(me, want.x, want.z, want.text, want.radio, now, false);
    else this.republish();
  }

  /** Une mission du catalogue est en cours et l'un de ses objectifs principaux en cours porte un lieu. */
  private missionPlaces(): boolean {
    const m = this.ctx!.service<MissionLike>('missions');
    if (!m || !m.current) return false;
    return m.objectives.some((r) => r.state === 'actif' && !r.def.secondary && r.at !== null);
  }

  // ───────────────────────────── choix du poste ─────────────────────────────

  private kindOf(me: Person): Kind | null {
    if (me.faction !== 'police' || me.custody !== 'free') return null;
    const role = this.ctx!.session.config?.role ?? '';
    return ROLE_KIND[role] ?? null;
  }

  /** Poste voulu selon le rôle et la situation, ou null si rien à ordonner. */
  private decide(me: Person, kind: Kind): { x: number; z: number; text: string; radio: string } | null {
    const ctx = this.ctx!;
    const command = ctx.service<CommandLike>('police.command');
    const now = ctx.clock.now;
    // foyer le plus chaud connu du commandement
    let hot: { x: number; z: number; kind: string } | null = null;
    let heat = HOT_MIN;
    if (command) {
      for (const h of command.hotspots) {
        if (!h.seen || h.knownAt > now || h.heat < heat) continue;
        heat = h.heat;
        hot = h;
      }
    }
    // barrages du dispositif
    const posts: PostLike[] = [];
    let reserve: PostLike | null = null;
    if (command) {
      for (const c of command.commands) {
        if (c.phase === 'termine') continue;
        for (const p of c.posts) {
          if (p.state === 'leve') continue;
          if (p.kind === 'reserve') reserve = p;
          else posts.push(p);
        }
      }
    }
    const crowd = this.crowdCenter();
    const focus = hot ?? crowd;
    if (!focus && posts.length === 0) return null;
    // barrage le plus proche du foyer (ou de la foule)
    let post: PostLike | null = null;
    if (focus) {
      let best = Infinity;
      for (const p of posts) {
        const d = Math.hypot(p.x - focus.x, p.z - focus.z);
        if (d < best) { best = d; post = p; }
      }
    } else post = posts[0] ?? null;
    const hotText = hot ? ` (${this.hotLabel(hot.kind)})` : '';
    // « du barrage Rue Royale », ou « du barrage » tout court quand le barrage porte le nom du lieu annoncé
    const of = (name: string): string => (post ? (post.name && post.name !== name ? ` du barrage ${post.name}` : ' du barrage') : '');

    switch (kind) {
      case 'engin': {
        // en appui, 20 m derrière le barrage exposé, face à la foule ; sans barrage : à 45 m du foyer, côté police
        const at = this.reachable(post ? this.behind(post, 20) : this.standOff(focus!, me, 45), true);
        const name = this.place(at.x, at.z);
        const what = ctx.session.config?.role === 'gendarme_centaure' ? 'prêt à dégager' : 'prêt à mettre en eau sur ordre';
        return { x: at.x, z: at.z, text: `Appui${of(name)} — ${name}`,
          radio: `rendez-vous ${name}${post ? `, en appui${of(name)}` : ''}${hotText}, ${what}. Rendez compte en place.` };
      }
      case 'bravm': {
        const at = this.reachable(reserve ? { x: reserve.x, z: reserve.z } : post ? this.behind(post, 60) : this.standOff(focus!, me, 90), me.vehicleId !== 0);
        const name = this.place(at.x, at.z);
        return { x: at.x, z: at.z, text: `Réserve d'intervention — ${name}`,
          radio: `rejoignez ${name} en réserve d'intervention${hotText}, prêts à interpeller sur ordre. Rendez compte en place.` };
      }
      case 'chef': {
        if (!post && !focus) return null;
        const at = this.reachable(post ? this.behind(post, 6) : this.standOff(focus!, me, 35), me.vehicleId !== 0);
        const name = this.place(at.x, at.z);
        return { x: at.x, z: at.z, text: `Renfort${of(name)} — ${name}`,
          radio: `portez votre groupe ${name}${post ? `, en renfort${of(name)}` : ''}${hotText}. Rendez compte en place.` };
      }
      case 'drone': {
        if (!focus) return null;
        // le drone survole : le point peut être sur un toit, mais le télépilote doit pouvoir s'y rendre
        const at = this.reachable(focus, false);
        const name = this.place(at.x, at.z);
        return { x: at.x, z: at.z, text: `Surveillance aérienne — ${name}`,
          radio: `portez le drone au-dessus de ${name}${hotText}, renseignez-moi sur les effectifs et les meneurs.` };
      }
      default:
        return null;
    }
  }

  /**
   * Centre du gros de la foule (manifestants), ou null s'il n'y a personne. Le groupe le plus dense (cases de
   * 60 m), pas la moyenne de tous les manifestants de Paris : avec deux cortèges à 2 km l'un de l'autre, la
   * moyenne tomberait entre les deux, dans un quartier vide.
   */
  private crowdCenter(): { x: number; z: number } | null {
    const ctx = this.ctx!;
    const cells = this.cells;
    cells.clear();
    const list = ctx.people.list;
    const step = list.length > 600 ? 3 : 1;
    let bestKey = 0, bestN = 0, n = 0;
    for (let i = 0; i < list.length; i += step) {
      const p = list[i]!;
      if (p.faction !== 'protest' || p.custody !== 'free' || p.posture === 'down') continue;
      n++;
      const key = Math.floor(p.x / CELL) * 100003 + Math.floor(p.z / CELL);
      const c = (cells.get(key) ?? 0) + 1;
      cells.set(key, c);
      if (c > bestN) { bestN = c; bestKey = key; }
    }
    if (n < 5) return null;
    // moyenne des manifestants de la case la plus dense et de ses voisines
    const kx = Math.round(bestKey / 100003);
    const kz = bestKey - kx * 100003;
    let sx = 0, sz = 0, m = 0;
    for (let i = 0; i < list.length; i += step) {
      const p = list[i]!;
      if (p.faction !== 'protest' || p.custody !== 'free' || p.posture === 'down') continue;
      if (Math.abs(Math.floor(p.x / CELL) - kx) > 1 || Math.abs(Math.floor(p.z / CELL) - kz) > 1) continue;
      sx += p.x; sz += p.z; m++;
    }
    return m > 0 ? { x: sx / m, z: sz / m } : null;
  }

  /**
   * Point atteignable : un point dans un bâtiment, dans l'eau ou contre un mur est ramené au sol libre le plus
   * proche (à défaut sur la voie la plus proche), pour que « 0 m » soit possible.
   */
  private reachable(at: { x: number; z: number }, vehicle: boolean): { x: number; z: number } {
    const world = this.ctx!.world;
    const r = vehicle ? 1.6 : 0.5;
    if (world.isFree(at.x, at.z, r) && world.buildingHeightAt(at.x, at.z) <= 0) return at;
    const p = { x: at.x, z: at.z };
    world.resolveCircle(p, r);
    if (Math.hypot(p.x - at.x, p.z - at.z) < 25 && world.isFree(p.x, p.z, r) && world.buildingHeightAt(p.x, p.z) <= 0) return p;
    if (world.edgeCount > 0 && world.nearestRoad(at.x, at.z, this.road, 150)) return { x: this.road.x, z: this.road.z };
    return at;
  }

  /** Point à `d` m derrière un poste (dos au parcours qu'il regarde). */
  private behind(p: PostLike, d: number): { x: number; z: number } {
    return { x: p.x - Math.sin(p.heading) * d, z: p.z - Math.cos(p.heading) * d };
  }

  /** Point à `d` m du foyer, du côté du joueur. */
  private standOff(focus: { x: number; z: number }, me: Person, d: number): { x: number; z: number } {
    const dx = me.x - focus.x, dz = me.z - focus.z;
    const l = Math.hypot(dx, dz) || 1;
    if (l < d) return { x: me.x, z: me.z };
    return { x: focus.x + (dx / l) * d, z: focus.z + (dz / l) * d };
  }

  /** Nom parlé d'un lieu : la voie la plus proche si elle est nommée, sinon le secteur. */
  private place(x: number, z: number): string {
    const world = this.ctx!.world;
    if (world.edgeCount > 0 && world.nearestRoad(x, z, this.road, 35) && this.road.name) return this.road.name;
    return world.sectorName(x, z) || 'le point indiqué';
  }

  private hotLabel(kind: string): string {
    switch (kind) {
      case 'violences': return 'violences en cours';
      case 'casse': return 'dégradations';
      case 'feu': return 'feux';
      case 'barricade': return 'barricade';
      case 'groupe_hostile': return 'groupe hostile';
      case 'compression': return 'compression de foule';
      default: return 'secteur sensible';
    }
  }

  // ───────────────────────────── CRS : ordre du groupe ─────────────────────────────

  private mirrorGroup(me: Person, now: number): void {
    const ctx = this.ctx!;
    const s: Squad | undefined = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    if (!s || s.leaderId === me.id) { if (this.cur) this.drop(); return; }
    const o = s.order;
    const label = GROUP_ORDER_TEXT[o.type];
    if (!label || (o.x === 0 && o.z === 0)) { if (this.cur) this.drop(); return; }
    const text = `Groupe ${s.name} : ${label} — ${this.place(o.x, o.z)}`;
    const cur = this.cur;
    if (cur && cur.text === text && Math.hypot(cur.x - o.x, cur.z - o.z) < 15) {
      if (!cur.arrived && Math.hypot(me.x - o.x, me.z - o.z) < ARRIVE_FOOT * 1.5) { cur.arrived = true; cur.arrivedAt = now; }
      this.republish();
      return;
    }
    this.give(me, o.x, o.z, text, '', now, true);
  }

  // ───────────────────────────── ordre, arrivée, affichage ─────────────────────────────

  private give(me: Person, x: number, z: number, text: string, radio: string, now: number, mirror: boolean): void {
    const ctx = this.ctx!;
    this.cur = { x, z, text, detail: mirror ? '' : this.travelDetail(), since: now, arrived: false, arrivedAt: 0, mirror, fire: null };
    if (radio !== '') {
      const own = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
      ctx.radio.say({ channel: 'commandement', from: this.commandName(), text: `${own ? own.name : 'Unité'}, ${radio}`, priority: 2 });
      ctx.ui.notify(`Ordre : ${text}`, 'info', 5);
    }
    this.publish(true);
  }

  /** Consigne pendant le trajet vers le poste. */
  private travelDetail(): string {
    return this.ctx!.session.config?.role === 'telepilote'
      ? 'Portez le drone au-dessus du point indiqué (ou rendez-vous-y), puis rendez compte « en place ».'
      : 'Rendez-vous au point indiqué, puis rendez compte « en place ».';
  }

  /** Quoi faire pendant le stand-by, selon le rôle. */
  private standbyDetail(): string {
    switch (this.ctx!.session.config?.role) {
      case 'gendarme_centaure': return 'Tenez la position, moteur tournant ; surveillez la foule. Dégagement ou tir seulement sur ordre.';
      case 'operateur_canon_eau': return 'Tenez la position, moteur tournant, canons prêts ; surveillez la foule. Jet seulement sur ordre.';
      case 'bravm': return 'Restez groupés près des motos, prêts à partir ; surveillez la foule. Interpellation seulement sur ordre.';
      case 'chef_groupe': return 'Tenez la position avec votre groupe ; surveillez la foule et rendez compte de ce que vous voyez.';
      case 'telepilote': return 'Drone en stationnaire au-dessus du secteur ; renseignez sur les effectifs et les meneurs.';
      default: return 'Tenez la position ; surveillez la foule et rendez compte de ce que vous voyez.';
    }
  }

  private checkArrival(me: Person, now: number): void {
    const ctx = this.ctx!;
    const cur = this.cur!;
    const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    // même mesure que la distance affichée au HUD (position du joueur, au sol, sans l'altitude) ; télépilote :
    // le drone au-dessus du point compte aussi (il en est le pilote)
    const telepilote = ctx.session.config?.role === 'telepilote';
    const reach = v || telepilote ? ARRIVE_VEHICLE : ARRIVE_FOOT;
    let d = Math.hypot(me.x - cur.x, me.z - cur.z);
    if (telepilote && d > reach) {
      const drone = this.droneOf(me);
      if (drone) d = Math.min(d, Math.hypot(drone.x - cur.x, drone.z - cur.z));
    }
    if (d > reach) return;
    cur.arrived = true;
    cur.arrivedAt = now;
    cur.detail = this.standbyDetail();
    const own = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    ctx.radio.say({ channel: 'commandement', from: own ? own.name : 'Unité', text: `${this.commandName()}, ${own ? own.name : 'unité'} en place. J'attends vos ordres.`, priority: 2, personId: me.id });
    ctx.radio.say({ channel: 'commandement', from: this.commandName(), text: 'Reçu. Stand-by, tenez la position, je vous rappelle.', priority: 0 });
    ctx.events.emit('player:order_reached' as never, { x: cur.x, z: cur.z } as never);
    this.publish(false);
  }

  private droneOf(me: Person): { x: number; z: number } | null {
    const ctx = this.ctx!;
    for (const v of ctx.vehicles.list) {
      if (!v.def.flying || v.state === 'wrecked' || v.state === 'burnt') continue;
      const s = ctx.squads.get(me.squadId);
      if (s && (s.vehicleId === v.id || Math.hypot(v.x - me.x, v.z - me.z) < 400)) return v;
    }
    return null;
  }

  // ───────────────────────────── désignation de tir (Centaure, canon à eau) ─────────────────────────────

  /** Nature du tir qu'un ordre de groupe demande à l'engin du joueur (null si ce n'est pas un tir). */
  private fireKindOf(type: string): FireKind | null {
    const role = this.ctx!.session.config?.role;
    if (role === 'gendarme_centaure') return type === 'disperser_gaz' ? 'lacrymo' : null;
    if (role === 'operateur_canon_eau') return type === 'eteindre' ? 'extinction' : type === 'refoulement' || type === 'disperser_gaz' ? 'jet' : null;
    return null;
  }

  private onSquadOrder(squadId: number, o: { type: string; x: number; z: number; maxForce: number; issuedAt: number; issuedBy: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const me = ctx.player.person();
    if (!me || me.squadId === 0 || squadId !== me.squadId || o.issuedBy === me.id) return;
    const kind = this.fireKindOf(o.type);
    if (kind) {
      this.pendingFire = { kind, x: o.x, z: o.z, type: o.type, maxForce: o.maxForce, issuedAt: o.issuedAt };
      this.nextThink = 0; // traduit au prochain pas
    } else if (this.cur && this.cur.fire && o.type !== this.cur.fire.type) {
      this.endFire(me, 'retrait'); // l'engin reçoit autre chose (cesser, repli…) : la désignation est retirée
    }
  }

  /** Cadre légal du tir (mêmes conditions que l'IA de l'engin : centaure.ts, canon.ts). */
  private fireAllowed(kind: FireKind, maxForce: number): boolean {
    if (kind === 'extinction') return true; // l'extinction n'est pas un emploi de la force
    const roe = this.ctx!.law.roe;
    if (maxForce < 3) return false;
    if (kind === 'lacrymo') return roe.lawfulForce >= 4 || (roe.underAttack && roe.lawfulForce >= 3);
    return roe.lawfulForce >= 3;
  }

  /** Désignation en cours ou à donner ; true si elle occupe le joueur (pas de poste à donner). */
  private thinkFire(me: Person, now: number): boolean {
    const pend = this.pendingFire;
    if (pend) {
      this.pendingFire = null;
      this.designate(me, pend, now);
      return true;
    }
    const cur = this.cur;
    const f = cur?.fire;
    if (!cur || !f) return false;
    if (now - cur.since > FIRE_TTL) {
      this.endFire(me, 'retrait');
      return true;
    }
    // zone vide (la foule est partie) : plus de raison de tirer
    if (f.kind !== 'extinction' && this.ctx!.people.countIn(cur.x, cur.z, f.radius + 6, isFreeProtester) === 0) {
      this.endFire(me, 'retrait');
      return true;
    }
    // le cadre légal évolue (sommations faites, ou halte au feu)
    const allowed = this.fireAllowed(f.kind, f.maxForce);
    if (allowed !== f.allowed) {
      f.allowed = allowed;
      cur.text = this.fireText(f.kind, allowed);
      this.fireDetail(me, cur);
      this.publish(true);
      if (allowed) this.ctx!.radio.say({ channel: 'commandement', from: this.commandName(), text: `${this.ownName(me)}, sommations faites : tir autorisé sur la zone désignée.`, priority: 2 });
    } else this.republish();
    return true;
  }

  private designate(me: Person, pend: PendingFire, now: number): void {
    const ctx = this.ctx!;
    const allowed = this.fireAllowed(pend.kind, pend.maxForce);
    const fire: FireOrder = { kind: pend.kind, radius: FIRE_RADIUS[pend.kind], allowed, type: pend.type, issuedAt: pend.issuedAt, maxForce: pend.maxForce, jetHeld: 0 };
    this.cur = { x: pend.x, z: pend.z, text: this.fireText(pend.kind, allowed), detail: '', since: now, arrived: false, arrivedAt: 0, mirror: false, fire };
    this.fireDetail(me, this.cur);
    const where = this.place(pend.x, pend.z);
    const what = pend.kind === 'lacrymo' ? `salve de lacrymogènes sur la zone désignée, ${where}, tir courbe`
      : pend.kind === 'jet' ? `jet sur le groupe désigné, ${where}, pluie d'abord` : `éteignez le feu désigné, ${where}`;
    const text = allowed ? `${this.ownName(me)}, ${what}. Rendez compte.` : `${this.ownName(me)}, préparez ${pend.kind === 'lacrymo' ? 'une salve' : 'le jet'} sur ${where}. Tir non autorisé : attendez les sommations.`;
    ctx.radio.say({ channel: 'commandement', from: this.commandName(), text, priority: 2 });
    ctx.ui.notify(this.cur.text, allowed ? 'warn' : 'info', 5);
    this.publish(true);
  }

  private fireText(kind: FireKind, allowed: boolean): string {
    if (!allowed) return 'Tir non autorisé : attendez les sommations';
    return kind === 'lacrymo' ? 'Tir de lacrymogènes sur la zone désignée' : kind === 'jet' ? 'Jet sur le groupe désigné' : 'Éteignez le feu désigné';
  }

  /** « Zone à 45 m, sur votre droite — rayon 18 m. Tir courbe, engin à l'arrêt. » */
  private fireDetail(me: Person, cur: Current): void {
    const f = cur.fire;
    if (!f) return;
    const ctx = this.ctx!;
    const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    const fx = v ? v.x : me.x, fz = v ? v.z : me.z;
    const d = Math.hypot(cur.x - fx, cur.z - fz);
    const where = `à ${Math.max(1, Math.round(d))} m, ${sideOf(ctx.player.state.camYaw, cur.x - fx, cur.z - fz)}`;
    if (!f.allowed) {
      cur.detail = `Zone ${where}. Ne tirez pas : le cadre légal n'est pas réuni (sommations). Tenez-vous prêt.`;
      return;
    }
    const how = f.kind === 'lacrymo' ? (d < 45 ? 'Trop près pour un tir courbe : reculez à 45 m au moins.' : "Engin à l'arrêt, tir courbe dans le cercle.")
      : f.kind === 'jet' ? (d > JET_RANGE ? `Approchez à moins de ${JET_RANGE} m, puis jet en pluie sur le groupe.` : 'Pluie d\'abord, jet droit seulement si nécessaire.')
        : (d > JET_RANGE ? `Approchez à moins de ${JET_RANGE} m du feu.` : 'Jet sur le foyer jusqu\'à extinction.');
    cur.detail = `Zone ${where} — rayon ${f.radius} m. ${how}`;
  }

  /** Fin de la désignation : tir effectué (compte rendu) ou retrait ; le joueur repasse en stand-by sur place. */
  private endFire(me: Person, why: 'fait' | 'retrait'): void {
    const ctx = this.ctx!;
    const cur = this.cur;
    if (!cur || !cur.fire) return;
    const kind = cur.fire.kind;
    const now = ctx.clock.now;
    if (why === 'fait') {
      const said = kind === 'lacrymo' ? 'salve tirée sur la zone désignée' : kind === 'jet' ? 'jet effectué sur le groupe désigné' : 'feu éteint';
      ctx.radio.say({ channel: 'commandement', from: this.ownName(me), text: `${this.commandName()}, ${said}.`, priority: 2, personId: me.id });
      ctx.radio.say({ channel: 'commandement', from: this.commandName(), text: 'Reçu. Cessez le tir, stand-by.', priority: 0 });
    } else {
      ctx.radio.say({ channel: 'commandement', from: this.commandName(), text: `${this.ownName(me)}, annulez le tir. Stand-by, tenez la position.`, priority: 1 });
    }
    const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    const x = v ? v.x : me.x, z = v ? v.z : me.z;
    this.cur = { x, z, text: `Stand-by — ${this.place(x, z)}`, detail: this.standbyDetail(), since: now, arrived: true, arrivedAt: now, mirror: false, fire: null };
    this.publish(false);
  }

  /** Stand-by sur place faute d'ordre à donner. */
  private standby(me: Person, now: number): void {
    this.cur = { x: me.x, z: me.z, text: `Stand-by — ${this.place(me.x, me.z)}`, detail: this.standbyDetail(), since: now, arrived: true,
      arrivedAt: now, mirror: false, fire: null, idle: true };
    this.publish(false);
  }

  private onImpact(ownerId: number, kind: string, x: number, z: number): void {
    const cur = this.cur;
    const me = this.ctx?.player.person();
    if (!cur || !cur.fire || !cur.fire.allowed || cur.fire.kind !== 'lacrymo' || !me || ownerId !== me.id) return;
    if (!/lacrymo|gm2l/.test(kind)) return;
    if (Math.hypot(x - cur.x, z - cur.z) <= cur.fire.radius + FIRE_TOLERANCE) this.endFire(me, 'fait');
  }

  /** Canon à eau : le jet du joueur (événement toutes les 0,5 s) vise-t-il la zone ? 1 s de jet dans la zone valide. */
  private onTurret(vehicleId: number, turret: number, byId: number): void {
    const ctx = this.ctx;
    const cur = this.cur;
    const me = ctx?.player.person();
    // extinction : validée par le feu éteint (fire:out), pas par une seconde de jet
    if (!ctx || !cur || !cur.fire || !cur.fire.allowed || cur.fire.kind !== 'jet' || !me || byId !== me.id) return;
    const v = ctx.vehicles.get(vehicleId);
    if (!v || v.def.turrets[turret]?.kind !== 'canon_eau') return;
    const yaw = v.heading - (v.turretYaw[turret] ?? 0);
    const dx = cur.x - v.x, dz = cur.z - v.z;
    const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const across = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw));
    if (along < 0 || along > JET_RANGE + cur.fire.radius || across > cur.fire.radius + along * 0.1) return;
    cur.fire.jetHeld += 0.5;
    if (cur.fire.jetHeld >= 1) this.endFire(me, 'fait');
  }

  private onFireOut(x: number, z: number): void {
    const cur = this.cur;
    const me = this.ctx?.player.person();
    if (!cur || !cur.fire || cur.fire.kind !== 'extinction' || !me) return;
    if (Math.hypot(x - cur.x, z - cur.z) <= cur.fire.radius + FIRE_TOLERANCE) this.endFire(me, 'fait');
  }

  private ownName(me: Person): string {
    const own = me.squadId !== 0 ? this.ctx!.squads.get(me.squadId) : undefined;
    return own ? own.name : 'Unité';
  }

  /** Indicatif de la compagnie (celui du commandant qui parle). */
  private commandName(): string {
    const ctx = this.ctx!;
    for (const s of ctx.squads.list) if (s.faction === 'police' && s.kind === 'compagnie') return s.name;
    return 'PC';
  }

  private objective(): Objective | null {
    const cur = this.cur;
    if (!cur) return null;
    // stand-by après « en place » : un objectif en cours, jamais une liste vide
    const text = cur.fire ? cur.text : cur.arrived && !cur.mirror ? STANDBY_TEXT : `Ordre : ${cur.text}`;
    const o: Objective = { id: ORDER_OBJECTIVE_ID, text, state: cur.mirror && cur.arrived ? 'reussi' : 'actif', secondary: false, x: cur.x, z: cur.z };
    return o;
  }

  /** Affiche l'ordre et le fait suivre au GPS (sans voler le suivi d'un objectif de mission choisi). */
  private publish(track: boolean): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    const o = this.objective();
    if (!api || !o) return;
    api.upsert(o);
    if (track && (api.tracked === '' || api.tracked === ORDER_OBJECTIVE_ID || !api.list.some((x) => x.id === api.tracked && x.state === 'actif'))) {
      api.tracked = ORDER_OBJECTIVE_ID;
    }
  }

  /** Les missions remplacent la liste des objectifs : on remet l'ordre s'il a disparu. */
  private republish(): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (!api || !this.cur) return;
    if (!api.list.some((o) => o.id === ORDER_OBJECTIVE_ID)) this.publish(!this.cur.arrived);
  }

  private drop(): void {
    const api = this.ctx!.service<ObjectivesApi>(EXT.objectives);
    if (api) {
      api.remove(ORDER_OBJECTIVE_ID);
      if (api.tracked === ORDER_OBJECTIVE_ID) api.tracked = '';
    }
    this.cur = null;
  }
}

function isFreeProtester(p: Person): boolean {
  return p.faction === 'protest' && p.custody === 'free' && p.posture !== 'down';
}

/** Côté d'un point vu du joueur (cap de la caméra, même convention que la flèche de la carte « Ma mission »). */
export function sideOf(yaw: number, dx: number, dz: number): string {
  let d = ((yaw - Math.atan2(dx, dz)) * 180) / Math.PI;
  d = ((d % 360) + 540) % 360 - 180;
  if (Math.abs(d) <= 30) return 'devant vous';
  if (Math.abs(d) >= 150) return 'derrière vous';
  return d > 0 ? 'sur votre droite' : 'sur votre gauche';
}
