/* =====================================================================================
 * FOULE — FOYERS SECONDAIRES : pendant la manifestation, d'autres points chauds se déclarent ailleurs dans Paris.
 *
 *   - RASSEMBLEMENT SAUVAGE (40 à 150 personnes) : surtout des pacifiques et des militants, quelques radicaux ;
 *     statique autour d'une place, slogans, tension qui monte avec le temps (et plus vite quand les forces
 *     approchent) ; passé un seuil, ses radicaux s'en prennent aux vitrines voisines.
 *   - GROUPE DE CASSEURS (15 à 40 radicaux, pilleurs, suiveurs) : mobile, il va de vitrine en vitrine autour
 *     de son point d'apparition ; casse et pillage par les gestes du sous-module radical (radical/gestures.ts,
 *     radical/followers.ts) ; il s'égaille quand une unité arrive.
 *   - BLOCAGE (25 à 60 personnes) : sit-in en travers d'un carrefour (même mécanique que l'aléa sit-in :
 *     drapeau PINNED), levé par les sommations, la peur, ou la fin du foyer.
 *
 * Ce sont de VRAIES personnes de la foule (CrowdCoreApi.spawn, groupes d'affinité, issues propres au foyer) :
 * dangers, sommations, charges, nasses (« encercler »), interpellations, cartes de densité, tableau de situation
 * du commandement et incidents fonctionnent sans rien de particulier. Elles ne comptent pas dans les statistiques
 * du cortège (drapeau UNCOUNTED), n'ont pas de place dans la formation (slot −1) et, quand le comportement par
 * défaut reprend la main, restent attachées au point du foyer (drapeau FOYER, voir manners.ts).
 *
 * Combien, quand : clé extra['foyers'] (nombre, ou 'auto' par défaut : 0 pour une petite manifestation calme,
 * jusqu'à 4 pour une grande manifestation volatile ; 0 en mission sauf mention contraire) ; le premier après
 * 5 à 8 min de jeu, les suivants espacés de 2 min 30 à 6 min ; chacun vit 8 à 15 min (moins pour les casseurs)
 * ou jusqu'à sa dispersion. Lieux : places réelles de Paris (routes-data.ts, lieux du catalogue), places de la
 * carte, à défaut points du réseau de rues, à 600–2 500 m du parcours déclaré (moins dans un petit quartier).
 *
 * Déclaration à la volée (FoyersApi.declare, mode Patrouille) : un foyer qui commence tout de suite, dans un anneau
 * demandé ; en veille (pas de manifestation principale), la distance au parcours ne compte pas et la fin de journée
 * n'arrête rien. Ses tirages ont leur propre flux ('foule:foyers:declare') : le calendrier ne bouge pas.
 *
 * Annonce : CENTRAL sur le canal commandement, événement libre 'crowd:foyer' (début, fin) ; service
 * 'crowd.foyers' (FoyersApi) pour l'interface et le commandement.
 *
 * Coût : un pas de gestion toutes les 0,5 s (apparitions), un bilan toutes les 2 s ; le contrôleur de
 * comportement ne fait que quelques comparaisons par réflexion.
 * ===================================================================================== */

import type {
  EntityId, GameContext, GameSystem, Person, ProtestProfile, RoadSample, Rng, SessionConfig, Shop, Vec2,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { CROWD_FOYERS, CROWD_FOYERS_SYSTEM, FOYER_EVENT } from './api';
import type {
  BehaviorController, CrowdFamily, CrowdGroup, FoyerDeclareSpec, FoyerEvent, FoyerKind, FoyerView, FoyersApi, GroupKind, NearRing,
} from './api';
import { A, F, S, brainOf } from './brain';
import type { CrowdBrain } from './brain';
import type { CrowdCore } from './core';
import type { RadicalSystem } from './radical';
import { goBlack } from './radical/attire';
import { looterThink } from './radical/followers';
import { attackShop } from './radical/gestures';
import { ACT } from './radical/model';
import type { RadMember } from './radical/model';
import * as R from './radical/tuning';
import * as T from './tuning';

// ───────────────────────────── réglages ─────────────────────────────

/** Distance au parcours déclaré : souhaitée, puis paliers de repli pour un petit quartier (m). */
const DIST_MIN_TIERS: readonly number[] = [600, 420, 280, 180];
const DIST_MAX = 2500;
/** Écart minimal entre deux foyers (m), au plus. */
const SPACING_MAX = 450;
const TICK = 0.5;
const REVIEW = 2;
const MAX_FOYERS = 6;
/** Rayon dans lequel un groupe de casseurs tourne autour de son point d'apparition (m). */
const ROAM = 240;
/** Détail de la carte (vitrines, mobilier, obstacles) demandé autour d'un foyer, et sa relance (m, s). */
const DETAIL_RADIUS = 130;
const DETAIL_EVERY = 30;

/** Places de Paris où l'on se rassemble (nom tel que la carte le connaît, coordonnées de secours). */
export const PARIS_PLACES: readonly { name: string; x: number; z: number }[] = [
  { name: "Place de l'Hôtel de Ville", x: 2188, z: 982 },
  { name: 'Place du Châtelet', x: 1903, z: 916 },
  { name: 'Place de la République', x: 3133, z: -211 },
  { name: 'Place de la Bastille', x: 3493, z: 1442 },
  { name: "Place de l'Opéra", x: 803, z: -586 },
  { name: 'Place de la Madeleine', x: 239, z: -485 },
  { name: 'Place de la Concorde', x: -3, z: 12 },
  { name: 'Esplanade des Invalides', x: -532, z: 716 },
  { name: 'Place du Trocadéro', x: -2411, z: 387 },
  { name: 'Place Charles de Gaulle', x: -1920, z: -906 },
  { name: 'Boulevard Saint-Denis', x: 2416, z: -413 },
  { name: 'Boulevard Montmartre', x: 1478, z: -680 },
];

const PLACE_WEIGHT: Readonly<Record<string, number>> = { square: 2.5, garden: 1, institution: 1.5, station: 1.2, monument: 1.2 };

const GENERIC_WORDS: readonly string[] = [
  'place', 'rue', 'boulevard', 'avenue', 'esplanade', 'quai', 'pont', 'square', 'jardin', 'parvis', 'carrefour', 'cours',
  'allée', 'passage', 'porte', 'gare', 'parc', 'port', 'impasse', 'villa', 'cité', 'secteur', 'quartier',
];

/** Slogans d'un rassemblement sans cause connue (mode veille : pas de manifestation du jour). */
const RALLY_CHANTS: readonly string[] = ['Tous ensemble, tous ensemble !', 'Et la rue, elle est à qui ?', 'On ne lâche rien !'];
const HOSTILE: readonly string[] = ['Hou ! Hou !', 'Honte à vous !', 'Laissez-nous tranquilles !', 'On est là ! On est là !'];
const BLOCK_CHANTS: readonly string[] = ['On bloque tout !', 'Ici, on ne passe pas !', 'Tous ensemble ! Tous ensemble !'];

const enum State { PENDING, ACTIVE, ENDED }

interface Foyer {
  readonly id: number;
  kind: FoyerKind;
  state: State;
  /**
   * Tirages du foyer : le flux 'foule:foyers' pour un foyer programmé (partagé, comme toujours), le flux
   * 'foule:foyers:declare' pour un foyer déclaré à la volée — une déclaration ne décale jamais le calendrier.
   */
  rng: Rng;
  rand: () => number;
  /** Déclaré à la volée : lieu imposé, ou anneau où le chercher. */
  fixed: { x: number; z: number; name: string } | null;
  near: NearRing | null;
  /** Instant prévu, durée de vie, début effectif, fin prévue. */
  at: number;
  life: number;
  startedAt: number;
  endAt: number;
  /** Lieu (dans une phrase) et libellé. */
  name: string;
  label: string;
  /** Point d'apparition et centre courant. */
  ox: number;
  oz: number;
  cx: number;
  cz: number;
  /** Profils restant à faire apparaître (dépilés par la fin). */
  queue: ProtestProfile[];
  family: CrowdFamily;
  planned: number;
  spawned: number;
  /** Part des personnes déjà là au moment de l'annonce. */
  early: number;
  ids: EntityId[];
  squadId: number;
  groups: CrowdGroup[];
  forming: Person[];
  formSize: number;
  exits: number[];
  peak: number;
  present: number;
  nextTension: number;
  nextChant: number;
  response: string;
  responseAt: number;
  /** Fin du slogan en cours (gestes : poing levé). */
  chantUntil: number;
  /** Casseurs : vitrine visée, depuis quand, bande arrivée devant quand, brisée quand ; vitrines déjà faites. */
  shopId: EntityId;
  shopSince: number;
  arrivedAt: number;
  brokenAt: number;
  done: EntityId[];
  detailAt: number;
  view: FoyerView;
}

interface Tie {
  readonly f: Foyer;
  /** Place personnelle autour du centre du foyer. */
  ox: number;
  oz: number;
  /** Arrivé à sa place (blocage : assis). */
  settled: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Nom de lieu à placer dans une phrase (« place de l'Hôtel de Ville », « secteur Châtelet »). */
export function placeInSentence(name: string): string {
  const n = name.trim();
  if (n === '') return 'secteur non identifié';
  const first = (n.split(/[\s'’-]/)[0] ?? '').toLowerCase();
  if (GENERIC_WORDS.indexOf(first) >= 0) return n.charAt(0).toLowerCase() + n.slice(1);
  return 'secteur ' + n;
}

/** Effectif approximatif à la radio : « d’une trentaine d’individus », « d’environ 80 personnes ». */
function approx(n: number, noun: string): string {
  const vowel = /^[aeiouyéèh]/i.test(noun);
  const of = vowel ? 'd’' + noun : 'de ' + noun;
  if (n < 13) return 'd’une dizaine ' + of;
  if (n < 18) return 'd’une quinzaine ' + of;
  if (n < 26) return 'd’une vingtaine ' + of;
  if (n < 36) return 'd’une trentaine ' + of;
  if (n < 46) return 'd’une quarantaine ' + of;
  if (n < 56) return 'd’une cinquantaine ' + of;
  return 'd’environ ' + Math.round(n / 10) * 10 + ' ' + noun;
}

export class FoyersSystem implements GameSystem {
  readonly id = CROWD_FOYERS_SYSTEM;
  readonly order = SystemOrder.RULES + 1;
  private ctx!: GameContext;
  private rng!: Rng;
  private readonly foyers: Foyer[] = [];
  private readonly views: FoyerView[] = [];
  private readonly ties = new Map<EntityId, Tie>();
  private armed = false;
  private planned = 0;
  private startedCount = 0;
  private nextTick = 0;
  private nextReview = 0;
  private lastBase = '';
  private nextId = 1;
  /** Flux des foyers déclarés à la volée (créé à la première déclaration de la session). */
  private declareRng: Rng | null = null;
  private readonly rand = (): number => this.rng.next();
  private readonly v2: Vec2 = { x: 0, z: 0 };
  private readonly road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  private readonly shops: Shop[] = [];
  private readonly api: FoyersApi;
  private readonly controller: BehaviorController;

  constructor(readonly core: CrowdCore, readonly radical: RadicalSystem | null) {
    const self = this;
    this.api = {
      get list(): readonly FoyerView[] { return self.views; },
      get planned(): number { return self.planned; },
      get started(): number { return self.startedCount; },
      foyerOf(id: EntityId): FoyerView | null {
        const t = self.ties.get(id);
        return t && t.f.state === State.ACTIVE ? t.f.view : null;
      },
      declare(spec: FoyerDeclareSpec): FoyerView | null {
        return self.declare(spec);
      },
    };
    this.controller = {
      id: 'foule:foyers',
      priority: 20,
      think: (p, b) => this.think(p, b),
      release: (p, b) => this.release(p, b),
    };
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.rng = ctx.rng;
    ctx.provide(CROWD_FOYERS, this.api);
  }

  init(ctx: GameContext): void {
    this.core.register('*', this.controller);
    ctx.events.on('session:started', () => {
      // la manifestation est mise en place au même événement : le calendrier des foyers est établi au premier pas
      this.armed = true;
    });
  }

  reset(): void {
    this.foyers.length = 0;
    this.views.length = 0;
    this.ties.clear();
    this.armed = false;
    this.planned = 0;
    this.startedCount = 0;
    this.nextTick = 0;
    this.nextReview = 0;
    this.lastBase = '';
    this.nextId = 1;
    this.declareRng = null;
  }

  update(): void {
    const core = this.core;
    if (this.armed) {
      this.armed = false;
      const config = this.ctx.session.config;
      if (core.active && config) this.plan(config);
    }
    if (!core.active || this.foyers.length === 0) return;
    const now = this.ctx.clock.now;
    // les organisateurs du cortège annoncent la dispersion : leur horaire ne vaut pas pour les foyers
    const base = core.director.base;
    if (base !== this.lastBase) {
      if (base === 'dispersion') this.ignoreOrganisers();
      this.lastBase = base;
    }
    if (now < this.nextTick) return;
    this.nextTick = now + TICK;
    // la journée finie arrête les foyers ; en veille, il n'y a pas de journée (la phase reste 'aucune')
    const over = base === 'terminee' && !core.veille;
    for (const f of this.foyers) {
      if (f.state === State.PENDING && now >= f.at) {
        if (over || !this.begin(f)) f.state = State.ENDED;
      }
      if (f.state !== State.ACTIVE) continue;
      if (f.queue.length > 0) this.spawnSome(f, now);
      if (f.responseAt >= 0 && now >= f.responseAt) {
        f.responseAt = -1;
        this.ctx.events.emit('crowd:chant', { x: f.cx, z: f.cz, text: f.response, intensity: Math.min(1, 0.4 + f.present / 200) });
      }
    }
    if (now < this.nextReview) return;
    this.nextReview = now + REVIEW;
    for (const f of this.foyers) if (f.state === State.ACTIVE) this.review(f, now, over);
  }

  // ───────────────────────────── calendrier ─────────────────────────────

  /** Nombre de foyers de la session (extra['foyers'], sinon selon la taille et la volatilité). */
  static count(config: SessionConfig, size: number, volatility: number): number {
    const extra = (config.extra ?? {}) as Record<string, unknown>;
    const wish = extra['foyers'];
    const n = typeof wish === 'number' ? wish : typeof wish === 'string' && wish !== 'auto' && wish.trim() !== '' ? Number(wish) : NaN;
    if (Number.isFinite(n)) return clamp(Math.round(n), 0, MAX_FOYERS);
    // une mission a son propre scénario : pas de foyer sauf mention contraire
    if ((config.missionId || '') !== '' || extra['crowd.static'] === true) return 0;
    if (size < 250 || volatility < 0.3) return 0;
    const k = ((volatility - 0.25) / 0.75) * 4 * Math.min(1, size / 1800);
    return clamp(Math.round(k + 0.2), 0, 4);
  }

  private plan(config: SessionConfig): void {
    const core = this.core;
    const extra = core.extra;
    this.rng = this.ctx.rng.fork('foule:foyers');
    const n = FoyersSystem.count(config, core.size, core.volatility);
    // (une déclaration à la volée a pu précéder le calendrier : elle reste comptée)
    this.planned += n;
    if (n === 0) return;
    const k = clamp(core.timeScale, 0.6, 1.3);
    const rng = this.rng;
    const delay = Number(extra['foyers.delai']);
    const gap = Number(extra['foyers.ecart']);
    const life = Number(extra['foyers.duree']);
    const forcedSize = Number(extra['foyers.taille']);
    const types = Array.isArray(extra['foyers.types']) ? (extra['foyers.types'] as unknown[]).map(String) : [];
    const radicals = this.radical !== null && core.extra['radical.none'] !== true;
    let at = this.ctx.clock.now + (Number.isFinite(delay) && delay >= 0 ? delay : (300 + 180 * rng.next()) * k);
    for (let i = 0; i < n; i++) {
      let kind: FoyerKind;
      const forced = types.length > 0 ? types[i % types.length] : '';
      if (forced === 'rassemblement' || forced === 'casseurs' || forced === 'blocage') kind = forced;
      else {
        const v = core.volatility;
        const wCasse = radicals && v >= 0.45 ? 0.45 * v : 0;
        const r = rng.next() * (0.55 + 0.25 + wCasse);
        // le premier foyer est d'ordinaire un rassemblement : la casse vient ensuite
        kind = i === 0 && rng.chance(0.6) ? 'rassemblement' : r < 0.55 ? 'rassemblement' : r < 0.8 ? 'blocage' : 'casseurs';
      }
      const size = Number.isFinite(forcedSize) && forcedSize > 0 ? Math.round(clamp(forcedSize, 3, 300)) : this.drawSize(kind, rng);
      const span = Number.isFinite(life) && life > 0 ? life : this.drawLife(kind, k, rng);
      this.foyers.push(this.build(kind, at, span, size, rng, this.rand));
      at += Number.isFinite(gap) && gap >= 0 ? gap : (150 + 210 * rng.next()) * k;
    }
  }

  /**
   * Effectif tiré selon la nature (un rassemblement grossit avec la manifestation du jour ; en veille, sans
   * manifestation, on prend la référence d'une manifestation moyenne).
   */
  private drawSize(kind: FoyerKind, rng: Rng): number {
    const ref = this.core.veille ? 1200 : this.core.size;
    if (kind === 'rassemblement') return Math.round(40 + 110 * Math.min(1, ref / 2500) * (0.35 + 0.65 * rng.next()));
    if (kind === 'casseurs') return Math.round(15 + 25 * rng.next());
    return Math.round(25 + 35 * rng.next());
  }

  /** Durée de vie tirée selon la nature (s de jeu ; `k` : échelle de temps de la session). */
  private drawLife(kind: FoyerKind, k: number, rng: Rng): number {
    return (kind === 'rassemblement' ? 480 + 420 * rng.next() : kind === 'casseurs' ? 300 + 300 * rng.next() : 360 + 360 * rng.next()) * k;
  }

  /** Nouveau foyer en attente (composition puis famille tirées sur `rng`, dans cet ordre). */
  private build(kind: FoyerKind, at: number, span: number, size: number, rng: Rng, rand: () => number): Foyer {
    const f: Foyer = {
      id: this.nextId++, kind, state: State.PENDING, rng, rand, fixed: null, near: null, at, life: span, startedAt: -1, endAt: Infinity,
      name: '', label: '', ox: 0, oz: 0, cx: 0, cz: 0, queue: this.composition(kind, size, this.core.volatility, rng),
      family: this.family(kind, rng), planned: size, spawned: 0, early: kind === 'casseurs' ? 0.6 : 0.4, ids: [], squadId: 0, groups: [],
      forming: [], formSize: 4, exits: [], peak: 0, present: 0, nextTension: 0, nextChant: 0, response: '', responseAt: -1,
      chantUntil: -1, shopId: 0, shopSince: 0, arrivedAt: -1, brokenAt: -1, done: [], detailAt: -1e9,
      view: {
        id: 0, kind, name: '', label: '', x: 0, z: 0, people: 0, startedAt: 0, tension: 0, kettled: false, squadId: 0,
      },
    };
    (f.view as { id: number }).id = f.id;
    return f;
  }

  // ───────────────────────────── déclaration à la volée ─────────────────────────────

  /** FoyersApi.declare : un foyer qui se déclare tout de suite (voir api.ts). */
  private declare(spec: FoyerDeclareSpec): FoyerView | null {
    const core = this.core;
    if (!core.active || !this.ctx) return null;
    const kind = spec.kind;
    if (kind !== 'rassemblement' && kind !== 'casseurs' && kind !== 'blocage') return null;
    let running = 0;
    for (const o of this.foyers) if (o.state === State.ACTIVE) running++;
    if (running >= MAX_FOYERS) return null;
    if (this.declareRng === null) this.declareRng = this.ctx.rng.fork('foule:foyers:declare');
    const rng = this.declareRng;
    const rand = (): number => rng.next();
    const k = clamp(core.timeScale, 0.6, 1.3);
    const size = typeof spec.size === 'number' && Number.isFinite(spec.size) && spec.size > 0 ? Math.round(clamp(spec.size, 3, 300)) : this.drawSize(kind, rng);
    const span = typeof spec.life === 'number' && Number.isFinite(spec.life) && spec.life > 0 ? spec.life : this.drawLife(kind, k, rng);
    const f = this.build(kind, this.ctx.clock.now, span, size, rng, rand);
    const fx = spec.x;
    const fz = spec.z;
    if (typeof fx === 'number' && typeof fz === 'number' && Number.isFinite(fx) && Number.isFinite(fz)) {
      const name = typeof spec.name === 'string' && spec.name.trim() !== '' ? spec.name.trim() : placeInSentence(this.ctx.world.sectorName(fx, fz));
      f.fixed = { x: fx, z: fz, name };
    } else if (spec.near) {
      const r = spec.near;
      if ([r.x, r.z, r.min, r.max].every((v) => typeof v === 'number' && Number.isFinite(v)) && r.max > r.min && r.max > 0) {
        f.near = { x: r.x, z: r.z, min: Math.max(0, r.min), max: r.max };
      }
    }
    // retiré si aucun lieu : l'identifiant consommé n'apparaît nulle part
    if (!this.begin(f)) return null;
    this.foyers.push(f);
    this.planned++;
    return f.view;
  }

  /** Profils, dans l'ordre d'apparition (le tableau est dépilé par la fin : les premiers venus en dernier). */
  private composition(kind: FoyerKind, size: number, v: number, rng: Rng): ProtestProfile[] {
    const out: ProtestProfile[] = [];
    for (let i = 0; i < size; i++) {
      const r = rng.next();
      let p: ProtestProfile;
      if (kind === 'casseurs') p = r < 0.15 ? 'pilleur' : r < 0.27 ? 'opportuniste' : 'radical';
      else if (kind === 'blocage') p = r < 0.03 + 0.04 * v ? 'radical' : r < 0.55 ? 'militant' : 'pacifique';
      else {
        const rad = 0.03 + 0.09 * v;
        p = r < rad ? 'radical' : r < rad + 0.08 ? 'opportuniste' : r < rad + 0.43 ? 'militant' : 'pacifique';
      }
      out.push(p);
    }
    // un meneur au mégaphone (deux pour un grand rassemblement), parmi les premiers arrivés
    if (kind !== 'casseurs' && size >= 8) {
      out[size - 1] = 'meneur';
      if (size >= 100) out[size - 2] = 'meneur';
    }
    return out;
  }

  private family(kind: FoyerKind, rng: Rng): CrowdFamily {
    if (kind === 'casseurs') return 'black_bloc';
    if (kind === 'blocage') return rng.pick<CrowdFamily>(['climat', 'etudiants', 'divers', 'agriculteurs']);
    return rng.pick<CrowdFamily>(['divers', 'divers', 'etudiants', 'gilets_jaunes', 'syndical']);
  }

  // ───────────────────────────── début ─────────────────────────────

  private begin(f: Foyer): boolean {
    const core = this.core;
    const ctx = this.ctx;
    const spot = f.fixed ?? this.pickPlace(f);
    if (!spot) return false;
    const now = ctx.clock.now;
    f.state = State.ACTIVE;
    f.startedAt = now;
    f.endAt = now + f.life;
    f.ox = f.cx = spot.x;
    f.oz = f.cz = spot.z;
    f.name = spot.name;
    f.label = (f.kind === 'rassemblement' ? 'Rassemblement non déclaré — ' : f.kind === 'casseurs' ? 'Groupe de casseurs — ' : 'Blocage — ') + spot.name;
    f.squadId = ctx.squads.create('cortege', 'protest', f.label).id;
    f.nextTension = now + 10;
    f.nextChant = now + 6 + 8 * f.rng.next();
    f.shopSince = now;
    this.keepDetail(f, now);
    // issues propres au foyer : on repart par les rues voisines, pas vers le cortège
    const first = core.nav.addExitsAround(spot.x, spot.z, f.rand);
    for (let i = first; i < core.nav.exits.length; i++) f.exits.push(i);
    // les premiers sont déjà là quand la salle donne l'alerte
    const early = Math.max(1, Math.round(f.planned * f.early));
    for (let i = 0; i < early && f.queue.length > 0; i++) this.spawnOne(f, true);
    f.present = f.spawned;
    const v = f.view;
    v.kind = f.kind;
    v.name = f.name;
    v.label = f.label;
    v.startedAt = now;
    v.squadId = f.squadId;
    this.refreshView(f);
    this.views.push(v);
    this.startedCount++;
    this.announce(f, 'debut');
    return true;
  }

  /**
   * Choisit le lieu : loin du parcours déclaré et des autres foyers, dans la carte ; dans l'anneau demandé pour un foyer
   * déclaré à la volée. En veille, le parcours est réduit au point de la session : sa distance ne compte pas.
   */
  private pickPlace(f: Foyer): { x: number; z: number; name: string } | null {
    const ctx = this.ctx;
    const world = ctx.world;
    const core = this.core;
    const rng = f.rng;
    const b = world.bounds;
    const margin = 60;
    const inside = (x: number, z: number): boolean => x > b.minX + margin && x < b.maxX - margin && z > b.minZ + margin && z < b.maxZ - margin;
    type Cand = { x: number; z: number; name: string; w: number; named: boolean };
    const cands: Cand[] = [];
    // places réelles de Paris (si la carte est celle de Paris : au moins une est connue par son nom)
    let paris = false;
    const named: { x: number; z: number; name: string }[] = [];
    for (const pl of PARIS_PLACES) {
      const info = world.placeByName(pl.name);
      if (info) paris = true;
      named.push(info ? { x: info.x, z: info.z, name: info.name } : pl);
    }
    if (paris) for (const n of named) cands.push({ ...n, w: 1, named: true });
    // places de la carte (un groupe de casseurs, lui, tourne dans les rues commerçantes)
    if (f.kind !== 'casseurs') {
      for (const pl of world.places) {
        const w = PLACE_WEIGHT[pl.kind];
        if (w === undefined || pl.radius < 12) continue;
        // une place ou un jardin se nomme ; ailleurs, le nom du secteur parle mieux à la radio
        cands.push({ x: pl.x, z: pl.z, name: pl.kind === 'square' || pl.kind === 'garden' ? pl.name : '', w, named: false });
      }
    }
    // points du réseau de rues, tout autour du rassemblement (dans l'anneau demandé : tout autour de son centre)
    const near = f.near;
    const span = Math.min(DIST_MAX, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.5);
    const ox = near ? near.x : core.rallyX;
    const oz = near ? near.z : core.rallyZ;
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = near ? near.min + rng.next() * (near.max - near.min) : 150 + rng.next() * Math.max(100, span - 150);
      const x = ox + Math.sin(a) * d;
      const z = oz + Math.cos(a) * d;
      if (!world.nearestRoad(x, z, this.road, 80)) continue;
      cands.push({ x: this.road.x, z: this.road.z, name: '', w: f.kind === 'casseurs' ? 2 : 0.8, named: false });
    }
    // distance au parcours, une fois pour toutes (les plus proches du rassemblement d'abord écartées à vue)
    const kept: (Cand & { d: number })[] = [];
    const reach = DIST_MAX + this.routeSpan();
    const veille = core.veille;
    for (const c of cands) {
      if (!inside(c.x, c.z)) continue;
      if (near) {
        const r = Math.hypot(c.x - near.x, c.z - near.z);
        if (r < near.min || r > near.max) continue;
      } else if (Math.hypot(c.x - core.rallyX, c.z - core.rallyZ) > reach) continue;
      // en veille, pas de parcours : tous les paliers acceptent le lieu ; dans un anneau demandé, l'éloignement du
      // parcours n'a pas de plafond (c'est l'appelant qui a choisi le secteur)
      const d = veille ? DIST_MAX : Math.min(DIST_MAX, this.distToRoute(c.x, c.z));
      if (d >= DIST_MIN_TIERS[DIST_MIN_TIERS.length - 1]! && (near !== null || d <= DIST_MAX)) kept.push({ ...c, d });
    }
    // les grandes places connues d'abord (un rassemblement sauvage s'y tient d'ordinaire)
    const pNamed = f.kind === 'rassemblement' ? 0.65 : f.kind === 'blocage' ? 0.35 : 0.3;
    const wantNamed = rng.next() < pNamed;
    // écart aux autres foyers : les trois quarts de la distance minimale au parcours, au plus 450 m
    for (const dMin of DIST_MIN_TIERS) {
      const spacing = Math.min(SPACING_MAX, dMin * 0.75);
      let total = 0;
      let ok: Cand[] = [];
      const known: Cand[] = [];
      for (const c of kept) {
        if (c.d < dMin) continue;
        let near = false;
        for (const o of this.foyers) {
          if (o === f || o.state !== State.ACTIVE) continue;
          if (Math.hypot(o.cx - c.x, o.cz - c.z) < spacing) near = true;
        }
        if (near) continue;
        ok.push(c);
        if (c.named) known.push(c);
      }
      if (ok.length === 0) continue;
      if (wantNamed && known.length > 0) ok = known;
      for (const c of ok) total += c.w;
      let r = rng.next() * total;
      let pick = ok[ok.length - 1]!;
      for (const c of ok) {
        r -= c.w;
        if (r <= 0) {
          pick = c;
          break;
        }
      }
      let x = pick.x;
      let z = pick.z;
      let name = pick.name;
      if (f.kind === 'blocage') {
        // en travers d'un carrefour : le nœud le plus fréquenté de la voie la plus proche
        const cross = this.crossroads(x, z);
        if (cross) {
          x = cross.x;
          z = cross.z;
          if (cross.name !== '') name = cross.name;
        }
      }
      if (!world.isFree(x, z, 0.4) && world.randomFreePoint(x, z, 25, 'any', f.rand, this.v2)) {
        x = this.v2.x;
        z = this.v2.z;
      }
      if (name === '') name = world.sectorName(x, z);
      return { x, z, name: placeInSentence(name) };
    }
    return null;
  }

  /** Carrefour proche : extrémité de la voie la plus proche qui réunit le plus de voies. */
  private crossroads(x: number, z: number): { x: number; z: number; name: string } | null {
    const world = this.ctx.world;
    if (!world.nearestRoad(x, z, this.road, 120) || this.road.edgeId < 0) return null;
    const e = world.edge(this.road.edgeId);
    const na = world.node(e.a);
    const nb = world.node(e.b);
    const n = nb.edges.length > na.edges.length ? nb : na;
    const names: string[] = [];
    for (const id of n.edges) {
      const nm = placeInSentence(world.edge(id).name).replace(/^secteur /, '');
      if (nm !== '' && nm !== 'non identifié' && names.indexOf(nm) < 0) names.push(nm);
      if (names.length >= 2) break;
    }
    const name = names.length >= 2 ? 'carrefour ' + names[0] + ' / ' + names[1] : names.length === 1 ? names[0]! : '';
    return { x: n.x, z: n.z, name };
  }

  /** Plus grand éloignement du parcours par rapport au point de rassemblement (m). */
  private routeSpan(): number {
    const core = this.core;
    const r = core.route.points;
    let max = 0;
    for (let i = 0; i + 1 < r.length; i += 2) max = Math.max(max, Math.hypot(r[i]! - core.rallyX, r[i + 1]! - core.rallyZ));
    return max;
  }

  /** Distance au parcours déclaré (au point de rassemblement s'il n'y en a pas) ; tracé échantillonné (≈ 300 tronçons). */
  private distToRoute(x: number, z: number): number {
    const core = this.core;
    const r = core.route.points;
    if (r.length < 4) return Math.hypot(x - core.rallyX, z - core.rallyZ);
    const n = r.length >> 1;
    const stride = Math.max(1, Math.floor(n / 300));
    let best = Infinity;
    for (let a = 0; a < n - 1; a += stride) {
      const h = a * 2;
      const i = Math.min(a + stride, n - 1) * 2;
      const ax = r[h]!;
      const az = r[h + 1]!;
      const dx = r[i]! - ax;
      const dz = r[i + 1]! - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - x;
      const pz = az + dz * t - z;
      const d = px * px + pz * pz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // ───────────────────────────── apparitions ─────────────────────────────

  /** Les autres arrivent par les rues voisines, sur une minute environ. */
  private spawnSome(f: Foyer, now: number): void {
    const elapsed = now - f.startedAt;
    const rest = f.planned - Math.round(f.planned * f.early);
    const due = Math.min(f.planned, Math.round(f.planned * f.early) + Math.ceil(rest * Math.min(1, elapsed / 70)));
    let n = 0;
    while (f.spawned < due && f.queue.length > 0 && n < 6) {
      this.spawnOne(f, false);
      n++;
    }
    if (f.queue.length === 0) this.flushGroup(f);
  }

  private spawnOne(f: Foyer, there: boolean): void {
    const core = this.core;
    const world = this.ctx.world;
    const profile = f.queue.pop()!;
    const k = f.spawned++;
    // place personnelle : en spirale autour du centre (le meneur au milieu), ramenée vers le centre si elle tombe dans un mur
    const spacing = f.kind === 'blocage' ? 0.85 : f.kind === 'casseurs' ? 1.5 : 1.15;
    const a = k * 2.39996 + f.rng.next() * 0.3;
    let r = spacing * Math.sqrt(k + 0.5);
    let ox = Math.sin(a) * r;
    let oz = Math.cos(a) * r;
    for (let i = 0; i < 3 && !world.isFree(f.cx + ox, f.cz + oz, 0.3); i++) {
      r *= 0.55;
      ox = Math.sin(a) * r;
      oz = Math.cos(a) * r;
    }
    let x = f.cx + ox;
    let z = f.cz + oz;
    if (!there) {
      // arrivée : d'une rue voisine, à 40–90 m
      const b = f.rng.next() * Math.PI * 2;
      const d = 40 + 50 * f.rng.next();
      x = f.cx + Math.sin(b) * d;
      z = f.cz + Math.cos(b) * d;
      if (!world.randomFreePoint(x, z, 15, 'sidewalk', f.rand, this.v2) && !world.randomFreePoint(x, z, 25, 'any', f.rand, this.v2)) {
        this.v2.x = f.cx + ox;
        this.v2.z = f.cz + oz;
      }
      x = this.v2.x;
      z = this.v2.z;
    } else if (!world.isFree(x, z, 0.3) && world.randomFreePoint(x, z, 6, 'any', f.rand, this.v2)) {
      x = this.v2.x;
      z = this.v2.z;
    }
    const family: CrowdFamily = f.kind === 'casseurs' && profile !== 'radical' ? 'divers' : f.family;
    const p = core.api.spawn(profile, x, z, { family, counted: false, heading: Math.atan2(f.cx - x, f.cz - z) });
    if (!p) return;
    const b = brainOf(p);
    if (!b) return;
    b.flags |= F.FOYER;
    b.anchorX = f.cx + ox;
    b.anchorZ = f.cz + oz;
    b.leaveAt = Infinity;
    b.nextThink = core.now + f.rng.next() * 0.6;
    if (!there) core.steering.goTo(p, b, b.anchorX, b.anchorZ, T.WALK_MAX * b.pace, false);
    this.ties.set(p.id, { f, ox, oz, settled: false });
    f.ids.push(p.id);
    if (f.kind === 'casseurs' && profile === 'radical') this.equip(p, f.rng);
    // groupes d'affinité de 3 à 6 : ils arrivent et repartent ensemble
    f.forming.push(p);
    if (f.forming.length >= f.formSize) this.flushGroup(f);
  }

  private flushGroup(f: Foyer): void {
    if (f.forming.length === 0) return;
    const core = this.core;
    const kind: GroupKind = f.kind === 'casseurs' ? 'noyau' : 'amis';
    const g = core.createGroup(kind, f.forming);
    f.forming.length = 0;
    f.formSize = 3 + f.rng.int(0, 4);
    g.family = f.family;
    if (f.exits.length > 0) g.exit = f.exits[f.rng.int(0, f.exits.length)]!;
    const sq = this.ctx.squads.get(g.squadId);
    if (sq) sq.parentId = f.squadId;
    f.groups.push(g);
  }

  /** Outils d'un casseur, s'il n'en a pas déjà : marteau ou barre, pavés, bombe de peinture. */
  private equip(p: Person, rng: Rng): void {
    const actions = this.ctx.actions;
    if (actions.defs.length === 0) return;
    const give = (id: 'marteau' | 'barre' | 'pave' | 'bombe_peinture', n = 1): void => {
      if (actions.def(id) !== undefined && actions.has(p, id) === 0) actions.give(p, id, n);
    };
    const r = rng.next();
    if (r < 0.45) give('marteau');
    else if (r < 0.7) give('barre');
    if (rng.chance(0.45)) give('pave', 2);
    if (rng.chance(0.3)) give('bombe_peinture');
  }

  // ───────────────────────────── bilan ─────────────────────────────

  private review(f: Foyer, now: number, over: boolean): void {
    const ctx = this.ctx;
    const core = this.core;
    let present = 0;
    const ids = f.ids;
    for (let i = ids.length - 1; i >= 0; i--) {
      const p = ctx.people.get(ids[i]!);
      const b = p ? brainOf(p) : null;
      if (!p || !b || b.index < 0) {
        this.ties.delete(ids[i]!);
        ids[i] = ids[ids.length - 1]!;
        ids.pop();
        continue;
      }
      if (p.custody !== 'free' || p.posture === 'down' || (b.flags & F.LEAVING) !== 0) continue;
      present++;
      // blocage : on se lève quand on a décidé de partir (sommations) ou que la peur l'emporte
      if ((b.flags & F.PINNED) !== 0 && (b.leaveAt < Infinity || p.fear > 0.7)) b.flags &= ~F.PINNED;
    }
    f.present = present;
    if (present > f.peak) f.peak = present;
    if (now - f.detailAt >= DETAIL_EVERY) this.keepDetail(f, now);
    const police = core.sense.policeNear(f.cx, f.cz, 4);
    if (f.kind === 'casseurs') this.steerGang(f, now, police);
    const tension = core.director.tensionAt(f.cx, f.cz);
    // la tension monte sur place : l'attente, la colère, les forces qui approchent
    if (now >= f.nextTension && present >= 5) {
      f.nextTension = now + 10;
      const base = f.kind === 'casseurs' ? 0.025 : f.kind === 'blocage' ? 0.015 : 0.02;
      const near = police < 80 ? 0.025 : 0;
      if (tension < 0.85) core.director.addTension(base + near, f.cx, f.cz, 'foyer_' + f.kind);
      core.emotions.stir(f.cx, f.cz, 25 + Math.sqrt(present) * 2, 0, 0.015 + (near > 0 ? 0.02 : 0));
    }
    // slogans
    if (now >= f.nextChant && present >= 6 && f.kind !== 'casseurs') {
      f.nextChant = now + (14 + 14 * f.rng.next()) * (1.2 - 0.5 * Math.min(1, tension));
      const hostile = police < 50 && tension > 0.35;
      const chants = core.cause.chants;
      let call: string;
      let response = '';
      if (hostile) call = f.rng.pick(HOSTILE);
      else if (f.kind === 'blocage' && f.rng.chance(0.5)) call = f.rng.pick(BLOCK_CHANTS);
      else if (chants.length > 0) {
        const c = f.rng.pick(chants);
        call = c.call;
        response = c.response;
      } else call = f.rng.pick(f.kind === 'rassemblement' ? RALLY_CHANTS : BLOCK_CHANTS);
      this.ctx.events.emit('crowd:chant', { x: f.cx, z: f.cz, text: call, intensity: Math.min(1, 0.4 + present / 200) });
      f.response = response;
      f.responseAt = response !== '' ? now + 2.2 : -1;
      f.chantUntil = now + 6.5;
    }
    this.refreshView(f);
    // fin : le temps est écoulé, la foule s'est dispersée, ou la journée est finie
    const done = f.queue.length === 0 && present < Math.max(3, f.peak * 0.25);
    if (over || now >= f.endAt || done) this.end(f, now, done && !over && now < f.endAt);
  }

  /** Groupe de casseurs : la prochaine vitrine, à défaut un autre coin du quartier ; on s'égaille devant les forces. */
  private steerGang(f: Foyer, now: number, police: number): void {
    const ctx = this.ctx;
    const core = this.core;
    if (police < 35) {
      // une unité arrive : la moitié la moins hardie s'égaille aussitôt
      for (const id of f.ids) {
        const p = ctx.people.get(id);
        const b = p ? brainOf(p) : null;
        if (b && b.leaveAt === Infinity && b.docility < 0.5 && core.sense.kettleAt(p!.x, p!.z) === null) b.leaveAt = now + 3 * f.rng.next();
      }
      return;
    }
    const s = f.shopId !== 0 ? ctx.props.shop(f.shopId) : undefined;
    if (s && s.window === 'broken' && f.brokenAt < 0) f.brokenAt = now;
    // la bande est-elle arrivée devant ? (le temps passé sur une vitrine se compte à partir de là)
    if (f.arrivedAt < 0) {
      let near = 0;
      for (const id of f.ids) {
        const p = ctx.people.get(id);
        if (p && Math.hypot(p.x - f.cx, p.z - f.cz) < 15) near++;
      }
      if (near >= Math.max(2, f.present * 0.35)) f.arrivedAt = now;
    }
    const stale = !s || s.dormant || s.burning > 0 || (f.arrivedAt >= 0 && now - f.arrivedAt > 45) || now - f.shopSince > 150
      || (f.brokenAt >= 0 && now - f.brokenAt > 25);
    if (!stale) return;
    f.shopId = 0;
    f.brokenAt = -1;
    f.arrivedAt = -1;
    f.shopSince = now;
    const n = ctx.props.shopsNear(f.cx, f.cz, 70, this.shops);
    let best: Shop | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      const c = this.shops[i]!;
      if (c.dormant || c.window === 'broken' || c.burning > 0 || f.done.indexOf(c.id) >= 0) continue;
      if (Math.hypot(c.x - f.ox, c.z - f.oz) > ROAM) continue;
      const w = R.SHOP_WEIGHT[c.category] ?? 1;
      if (w <= 0) continue;
      // un rideau baissé décourage : on préfère une vitrine nue
      const score = w * (c.shutter < 0.5 ? 1 : 0.45) * (0.6 + 0.8 * f.rng.next()) - Math.hypot(c.x - f.cx, c.z - f.cz) / 20;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) {
      f.shopId = best.id;
      f.done.push(best.id);
      if (f.done.length > 40) f.done.shift();
      // le groupe se poste devant la façade, côté rue
      f.cx = best.x + Math.sin(best.heading) * 6;
      f.cz = best.z + Math.cos(best.heading) * 6;
      if (Math.hypot(f.cx - f.ox, f.cz - f.oz) > DETAIL_RADIUS * 0.5) this.keepDetail(f, now);
    } else {
      // rien à casser ici : un autre coin du quartier
      const a = f.rng.next() * Math.PI * 2;
      const d = 50 + 60 * f.rng.next();
      let x = f.cx + Math.sin(a) * d;
      let z = f.cz + Math.cos(a) * d;
      if (Math.hypot(x - f.ox, z - f.oz) > ROAM) {
        x = f.ox + (x - f.ox) * 0.3;
        z = f.oz + (z - f.oz) * 0.3;
      }
      if (ctx.world.nearestRoad(x, z, this.road, 60)) {
        f.cx = this.road.x;
        f.cz = this.road.z;
        this.keepDetail(f, now);
      }
    }
  }

  /**
   * Le détail de la carte (vitrines, mobilier, obstacles) n'existe qu'autour du centre d'intérêt du joueur : on le
   * demande aussi autour du foyer, pour que la casse, le pillage et les collisions y soient réels. Le magasin de tuiles
   * le décharge quand le joueur s'éloigne ; on le redemande périodiquement (les dégâts sont conservés par le décor).
   */
  private keepDetail(f: Foyer, now: number): void {
    f.detailAt = now;
    try {
      void this.ctx.world.whenLoaded(f.cx, f.cz, DETAIL_RADIUS).catch(() => undefined);
    } catch {
      // monde neutre ou sans tuiles : rien à charger
    }
  }

  private refreshView(f: Foyer): void {
    const v = f.view;
    v.x = f.cx;
    v.z = f.cz;
    v.people = f.present;
    v.tension = this.core.director.tensionAt(f.cx, f.cz);
    v.kettled = this.core.sense.kettleAt(f.cx, f.cz) !== null;
  }

  private end(f: Foyer, now: number, dispersed: boolean): void {
    const ctx = this.ctx;
    f.state = State.ENDED;
    f.queue.length = 0;
    this.flushGroup(f);
    const i = this.views.indexOf(f.view);
    if (i >= 0) this.views.splice(i, 1);
    // chacun s'en va à son heure, par les issues du foyer ; ceux qui sont pris dans une nasse attendent qu'on les laisse sortir
    for (const id of f.ids) {
      const p = ctx.people.get(id);
      const b = p ? brainOf(p) : null;
      if (!p || !b || b.index < 0) continue;
      b.flags &= ~F.PINNED;
      const at = now + (dispersed ? 2 : 5 + 40 * b.docility) * f.rng.next();
      if (at < b.leaveAt) b.leaveAt = at;
      b.nextThink = Math.min(b.nextThink, now + 0.5);
    }
    this.announce(f, 'fin');
  }

  private announce(f: Foyer, state: 'debut' | 'fin'): void {
    const ctx = this.ctx;
    const people = state === 'debut' ? f.planned : f.present;
    const ev: FoyerEvent = { id: f.id, kind: f.kind, x: f.cx, z: f.cz, people, name: f.name, state };
    ctx.events.emitAny(FOYER_EVENT, ev);
    let text: string;
    if (state === 'debut') {
      if (f.kind === 'rassemblement') text = `À toutes les unités de CENTRAL : rassemblement non déclaré ${approx(f.planned, 'personnes')}, ${f.name}. Tension montante.`;
      else if (f.kind === 'casseurs') text = `À toutes les unités de CENTRAL : groupe ${approx(f.planned, 'individus')} cagoulés, ${f.name}. Dégradations de vitrines en cours.`;
      else text = `À toutes les unités de CENTRAL : sit-in ${approx(f.planned, 'personnes')} bloquant la chaussée, ${f.name}. Circulation interrompue.`;
    } else if (f.kind === 'rassemblement') text = `CENTRAL : le rassemblement, ${f.name}, se disperse.`;
    else if (f.kind === 'casseurs') text = `CENTRAL : le groupe de casseurs, ${f.name}, s’est dispersé.`;
    else text = `CENTRAL : fin du blocage, ${f.name}. Circulation rétablie.`;
    ctx.radio.say({ channel: 'commandement', from: 'CENTRAL', priority: state === 'debut' ? 2 : 1, text });
  }

  /** Les organisateurs du cortège ont annoncé la dispersion : leur horaire ne vaut pas pour les foyers. */
  private ignoreOrganisers(): void {
    const ctx = this.ctx;
    for (const f of this.foyers) {
      if (f.state !== State.ACTIVE) continue;
      for (const id of f.ids) {
        const p = ctx.people.get(id);
        const b = p ? brainOf(p) : null;
        if (b && b.heard === 0 && (b.flags & F.LEAVING) === 0) b.leaveAt = Infinity;
      }
    }
  }

  // ───────────────────────────── contrôleur de comportement ─────────────────────────────

  private think(p: Person, b: CrowdBrain): boolean {
    if ((b.flags & F.FOYER) === 0) return false;
    const tie = this.ties.get(p.id);
    if (!tie) return false;
    const f = tie.f;
    // le comportement par défaut conduit les départs, et le sit-in une fois assis
    if (f.state !== State.ACTIVE || (b.flags & (F.LEAVING | F.PINNED)) !== 0 || b.state === S.LEAVE) return false;
    const core = this.core;
    const now = core.now;
    // place personnelle (le point d'attache sert aussi au comportement par défaut)
    b.anchorX = f.cx + tie.ox;
    b.anchorZ = f.cz + tie.oz;
    const m = this.radMember(p, b);
    let hold = false;
    if (this.calm(p, b, f, now)) {
      if (f.kind === 'casseurs') hold = this.gang(p, b, f, tie, m, now);
      else if (f.kind === 'blocage') hold = this.block(p, b, f, tie, now);
      else hold = this.rally(p, b, f, tie, m, now);
    }
    if (m !== null) {
      // les gestes du sous-module radical ne s'exécutent que pour un membre tenu par son contrôleur
      if (!hold && m.act !== ACT.NONE) this.radical!.acts.cancel(m);
      m.held = hold;
    }
    return hold;
  }

  private release(_p: Person, b: CrowdBrain): void {
    const m = b.data as RadMember | null;
    if (this.radical && m !== null && typeof m === 'object' && m.p === b.person && m.act !== ACT.NONE) this.radical.acts.cancel(m);
  }

  /** Rien qui demande un réflexe : sinon le comportement par défaut s'en charge (gaz, charge, forces, peur, nasse). */
  private calm(p: Person, b: CrowdBrain, f: Foyer, now: number): boolean {
    const core = this.core;
    if (p.gas > T.GAS_FEEL || p.burning > 0.05) return false;
    const hazards = core.ctx.hazards;
    if (hazards.gasAt(p.x, p.z) > T.GAS_AIR || hazards.fireAt(p.x, p.z) > 0.04) return false;
    if ((b.state === S.FLEE && now < b.fleeUntil) || b.state === S.AVOID || b.panic > now) return false;
    if (b.density >= T.DENSITY_ALERT) return false;
    const tune = T.PROFILE[p.profile ?? 'pacifique'];
    if (p.fear > tune.backOff || now >= b.leaveAt) return false;
    if (b.threatUntil > now && p.fear > 0.2) return false;
    const sense = core.sense;
    if (sense.kettleAt(p.x, p.z) !== null) return false;
    if (sense.policeTotal > 0) {
      const keep = f.kind === 'casseurs' ? 45 : 30;
      if (sense.policeNear(p.x, p.z, 3) < keep) return false;
      const charges = sense.charges.items;
      for (let i = 0; i < charges.length; i++) {
        const c = charges[i]!;
        if (c.t >= now && Math.hypot(c.x - p.x, c.z - p.z) < 70) return false;
      }
      if (sense.water.near(p.x, p.z, 20, now - 3) !== null) return false;
    }
    return true;
  }

  /** Rassemblement : on rejoint sa place, on piétine, on scande ; quand cela chauffe, les radicaux cassent. */
  private rally(p: Person, b: CrowdBrain, f: Foyer, tie: Tie, m: RadMember | null, now: number): boolean {
    const core = this.core;
    if (m !== null && m.act !== ACT.NONE) return true;
    if (m !== null && p.profile === 'radical' && core.director.tensionAt(f.cx, f.cz) > 0.5 && this.vandal(p, m, f, 40)) return true;
    this.mill(p, b, tie, now, 0.9);
    b.lookX = f.cx;
    b.lookZ = f.cz;
    const until = f.chantUntil;
    if (until > now && b.act === A.NONE) {
      const zeal = p.profile === 'militant' || p.profile === 'meneur' ? 0.75 : p.profile === 'radical' ? 0.3 : 0.5;
      if (core.rngThink.next() < zeal) core.behavior.gesture(p, b, A.CHANT, until - now);
    } else if (b.act === A.NONE && core.rngThink.next() < 0.012) core.behavior.gesture(p, b, A.FILM, 5 + 6 * core.rngThink.next());
    return true;
  }

  /** Blocage : on gagne sa place sur la chaussée, puis on s'assoit (le comportement par défaut tient le sit-in). */
  private block(p: Person, b: CrowdBrain, f: Foyer, tie: Tie, now: number): boolean {
    const d = Math.hypot(b.anchorX - p.x, b.anchorZ - p.z);
    if (d < 1.6 || (now - b.stateSince > 90 && d < 8)) {
      tie.settled = true;
      b.flags |= F.PINNED;
      b.path = null;
      b.tx = p.x;
      b.tz = p.z;
      b.lookX = f.cx;
      b.lookZ = f.cz;
      return false;
    }
    this.core.steering.goTo(p, b, b.anchorX, b.anchorZ, T.WALK_MAX * b.pace, false);
    return true;
  }

  /** Casseurs : en bande serrée derrière la vitrine visée ; ceux qui ont un outil frappent, les pilleurs se servent. */
  private gang(p: Person, b: CrowdBrain, f: Foyer, tie: Tie, m: RadMember | null, now: number): boolean {
    const core = this.core;
    if (m !== null) {
      if (m.act !== ACT.NONE) return true;
      const radical = this.radical!;
      if (p.profile === 'radical' && !m.black) goBlack(radical.k, m);
      if ((p.profile === 'pilleur' || p.profile === 'opportuniste') && radical.looting.spots.length > 0 && looterThink(radical.k, radical.acts, radical.looting, m)) return true;
      if (p.profile === 'radical' && this.vandal(p, m, f, 30)) return true;
    }
    const d = Math.hypot(b.anchorX - p.x, b.anchorZ - p.z);
    if (d > 3 || now >= b.timer) {
      b.timer = now + 6 + 8 * core.rngThink.next();
      core.steering.goTo(p, b, b.anchorX + (core.rngThink.next() - 0.5) * 2, b.anchorZ + (core.rngThink.next() - 0.5) * 2, d > 12 ? 2.4 : 1.3 * b.pace, d > 12);
    }
    tie.settled = d < 4;
    const s = f.shopId !== 0 ? core.ctx.props.shop(f.shopId) : undefined;
    b.lookX = s ? s.x : f.cx;
    b.lookZ = s ? s.z : f.cz;
    return true;
  }

  /** Frappe la vitrine visée par le foyer (à défaut la plus tentante tout près). */
  private vandal(p: Person, m: RadMember, f: Foyer, reach: number): boolean {
    const radical = this.radical;
    if (!radical || !radical.k.active) return false;
    const ctx = this.ctx;
    let s = f.shopId !== 0 ? ctx.props.shop(f.shopId) : undefined;
    if (!s && f.kind === 'rassemblement' && this.core.rngThink.next() < 0.1) {
      // rassemblement qui dégénère : la vitrine la plus tentante à deux pas
      const n = ctx.props.shopsNear(f.cx, f.cz, reach, this.shops);
      let best = 0;
      for (let i = 0; i < n; i++) {
        const c = this.shops[i]!;
        const w = R.SHOP_WEIGHT[c.category] ?? 1;
        if (c.window !== 'broken' && !c.dormant && c.burning <= 0 && w >= 4 && w > best) {
          best = w;
          s = c;
        }
      }
      if (s) {
        f.shopId = s.id;
        f.shopSince = this.core.now;
      }
    }
    if (!s || s.window === 'broken' || s.dormant || s.burning > 0) return false;
    if (Math.hypot(s.x - p.x, s.z - p.z) > reach) return false;
    if (this.core.now - m.toolsAt > 2.5) radical.k.refreshTools(m);
    return attackShop(radical.k, radical.acts, m, s);
  }

  /** Piétine autour de sa place : un petit déplacement de temps en temps, retour à sa place si l'on s'en écarte. */
  private mill(p: Person, b: CrowdBrain, tie: Tie, now: number, speed: number): void {
    const core = this.core;
    const d = Math.hypot(b.anchorX - p.x, b.anchorZ - p.z);
    if (d > 6) {
      core.steering.goTo(p, b, b.anchorX, b.anchorZ, d > 25 ? T.WALK_MAX * b.pace : speed * b.pace, false);
      b.timer = now + 4;
      return;
    }
    tie.settled = true;
    if (now < b.timer) return;
    b.timer = now + 10 + 15 * core.rngThink.next();
    const a = core.rngThink.next() * 6.283;
    const r = 0.5 + 1.5 * core.rngThink.next();
    core.steering.goTo(p, b, b.anchorX + Math.sin(a) * r, b.anchorZ + Math.cos(a) * r, speed * b.pace, false);
  }

  /**
   * Membre du sous-module radical (gestes, pillage) pour un radical, un pilleur ou un suiveur du foyer — tenu hors
   * de la réserve où le bloc du cortège recrute ses groupes.
   */
  private radMember(p: Person, b: CrowdBrain): RadMember | null {
    const radical = this.radical;
    const prof = p.profile;
    if (!radical || (prof !== 'radical' && prof !== 'pilleur' && prof !== 'opportuniste')) return null;
    const k = radical.k;
    const m = k.member(p, b);
    if (m.group === null) {
      const i = k.pool.indexOf(m);
      if (i >= 0) k.pool.splice(i, 1);
    }
    return m;
  }
}
