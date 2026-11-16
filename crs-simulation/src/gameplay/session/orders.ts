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
 * boussole). À l'arrivée, le joueur rend compte « en place » ; un nouvel ordre vient quand la situation change.
 * Pendant une tâche d'incident confiée au joueur, l'ordre s'efface (la tâche passe avant).
 * Commandant et commissaire ne reçoivent pas d'ordres : ils les donnent.
 * Simulation pure (aucun DOM).
 * ===================================================================================== */

import type { GameContext, GameSystem, Person, RoadSample, Squad } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, Objective, ObjectivesApi } from '@/core/extensions';

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
  readonly current: Readonly<{ x: number; z: number; text: string; arrived: boolean }> | null;
}

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
/** Intensité minimale d'un foyer pour y envoyer du monde. */
const HOT_MIN = 0.8;

type Kind = 'engin' | 'bravm' | 'chef' | 'drone' | 'crs';

const ROLE_KIND: Readonly<Record<string, Kind>> = {
  operateur_canon_eau: 'engin', gendarme_centaure: 'engin', bravm: 'bravm', chef_groupe: 'chef', telepilote: 'drone', crs: 'crs',
};

/** Libellés des ordres de groupe rappelés au CRS. */
const GROUP_ORDER_TEXT: Readonly<Record<string, string>> = {
  tenir: 'tenir la position', ligne: 'tenir la ligne', colonne: 'se déplacer en colonne', avancer: 'avancer',
  proteger: 'protéger le site', couper_circulation: 'couper la circulation', filtrer: 'filtrer le passage',
  encercler: 'encercler', refoulement: 'refouler', charge: 'charger', repli: 'se replier', degager_barricade: 'dégager la barricade',
  escorter: 'escorter', releve: 'relever une unité', eteindre: 'éteindre le feu', secourir: 'secourir',
};

interface Current {
  x: number;
  z: number;
  text: string;
  since: number;
  arrived: boolean;
  arrivedAt: number;
  /** Ordre de groupe rappelé (CRS) : pas de compte rendu radio. */
  mirror: boolean;
}

export class PlayerOrdersSystem implements GameSystem {
  readonly id = 'session.orders';
  readonly order = SystemOrder.CONTROL + 46;

  private ctx: GameContext | null = null;
  private cur: Current | null = null;
  private nextThink = 0;
  private startedAt = -1;
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as RoadSample;

  provide(ctx: GameContext): void {
    const self = this;
    ctx.provide(ORDERS_SERVICE, { get current() { return self.cur; } } satisfies PlayerOrdersApi);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
  }

  reset(): void {
    this.cur = null;
    this.nextThink = 0;
    this.startedAt = -1;
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
    if (this.cur && !this.cur.arrived) this.checkArrival(me, now);
    const want = this.decide(me, kind);
    const cur = this.cur;
    if (!want) {
      this.republish();
      return;
    }
    const far = !cur || Math.hypot(want.x - cur.x, want.z - cur.z) > RETARGET_DIST;
    const due = !cur || (cur.arrived ? now - cur.arrivedAt > HOLD_TIME : now - cur.since > MIN_ORDER_GAP);
    if (far && due) this.give(me, want.x, want.z, want.text, want.radio, now, false);
    else this.republish();
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
        const at = post ? this.behind(post, 20) : this.standOff(focus!, me, 45);
        const name = this.place(at.x, at.z);
        const what = ctx.session.config?.role === 'gendarme_centaure' ? 'prêt à dégager' : 'prêt à mettre en eau sur ordre';
        return { x: at.x, z: at.z, text: `Appui${of(name)} — ${name}`,
          radio: `rendez-vous ${name}${post ? `, en appui${of(name)}` : ''}${hotText}, ${what}. Rendez compte en place.` };
      }
      case 'bravm': {
        const at = reserve ? { x: reserve.x, z: reserve.z } : post ? this.behind(post, 60) : this.standOff(focus!, me, 90);
        const name = this.place(at.x, at.z);
        return { x: at.x, z: at.z, text: `Réserve d'intervention — ${name}`,
          radio: `rejoignez ${name} en réserve d'intervention${hotText}, prêts à interpeller sur ordre. Rendez compte en place.` };
      }
      case 'chef': {
        if (!post && !focus) return null;
        const at = post ? this.behind(post, 6) : this.standOff(focus!, me, 35);
        const name = this.place(at.x, at.z);
        return { x: at.x, z: at.z, text: `Renfort${of(name)} — ${name}`,
          radio: `portez votre groupe ${name}${post ? `, en renfort${of(name)}` : ''}${hotText}. Rendez compte en place.` };
      }
      case 'drone': {
        const at = focus!;
        if (!at) return null;
        const name = this.place(at.x, at.z);
        return { x: at.x, z: at.z, text: `Surveillance aérienne — ${name}`,
          radio: `portez le drone au-dessus de ${name}${hotText}, renseignez-moi sur les effectifs et les meneurs.` };
      }
      default:
        return null;
    }
  }

  /** Centre du gros de la foule (manifestants), ou null s'il n'y a personne. */
  private crowdCenter(): { x: number; z: number } | null {
    const ctx = this.ctx!;
    let sx = 0, sz = 0, n = 0;
    const list = ctx.people.list;
    const step = list.length > 600 ? 3 : 1;
    for (let i = 0; i < list.length; i += step) {
      const p = list[i]!;
      if (p.faction !== 'protest' || p.custody !== 'free' || p.posture === 'down') continue;
      sx += p.x; sz += p.z; n++;
    }
    return n >= 5 ? { x: sx / n, z: sz / n } : null;
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
    this.cur = { x, z, text, since: now, arrived: false, arrivedAt: 0, mirror };
    if (radio !== '') {
      const own = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
      ctx.radio.say({ channel: 'commandement', from: this.commandName(), text: `${own ? own.name : 'Unité'}, ${radio}`, priority: 2 });
      ctx.ui.notify(`Ordre : ${text}`, 'info', 5);
    }
    this.publish(true);
  }

  private checkArrival(me: Person, now: number): void {
    const ctx = this.ctx!;
    const cur = this.cur!;
    const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    // télépilote : c'est le drone qui doit être sur place
    let px = me.x, pz = me.z;
    if (ctx.session.config?.role === 'telepilote') {
      const drone = this.droneOf(me);
      if (drone) { px = drone.x; pz = drone.z; }
    }
    const reach = v || ctx.session.config?.role === 'telepilote' ? ARRIVE_VEHICLE : ARRIVE_FOOT;
    if (Math.hypot(px - cur.x, pz - cur.z) > reach) return;
    cur.arrived = true;
    cur.arrivedAt = now;
    const own = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    ctx.radio.say({ channel: 'commandement', from: own ? own.name : 'Unité', text: `${this.commandName()}, ${own ? own.name : 'unité'} en place. J'attends vos ordres.`, priority: 2, personId: me.id });
    ctx.radio.say({ channel: 'commandement', from: this.commandName(), text: 'Reçu. Tenez la position, je vous rappelle.', priority: 0 });
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

  /** Indicatif de la compagnie (celui du commandant qui parle). */
  private commandName(): string {
    const ctx = this.ctx!;
    for (const s of ctx.squads.list) if (s.faction === 'police' && s.kind === 'compagnie') return s.name;
    return 'PC';
  }

  private objective(): Objective | null {
    const cur = this.cur;
    if (!cur) return null;
    const o: Objective = { id: ORDER_OBJECTIVE_ID, text: cur.arrived && !cur.mirror ? `En place : ${cur.text}` : `Ordre : ${cur.text}`,
      state: cur.arrived ? 'reussi' : 'actif', secondary: false, x: cur.x, z: cur.z };
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
