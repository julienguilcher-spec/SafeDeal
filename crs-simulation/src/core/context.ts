/* =====================================================================================
 * Assemblage du GameContext : bus d'événements, horloge, générateur aléatoire, sauvegarde,
 * réglages, session, magasins d'entités et services neutres.
 *
 *   createContext(options)  → GameContext prêt à l'emploi (headless ou non)
 *   getCore(ctx)            → accès aux rouages internes (réservé à Game, aux tests et au débogage)
 * ===================================================================================== */

import type {
  ActionApi, ArchetypeApi, AudioApi, DirectorApi, EntityId, EnvApi, GameContext, HazardApi, HealthApi,
  InputState, InteractionApi, LawApi, PeopleStore, PlayerApi, ProjectileApi, PropApi, RadioApi, SquadApi,
  UiApi, VehicleApi, ViewApi, WorldQuery,
} from './contracts';
import { GameClock } from './clock';
import { createEventBus } from './events';
import type { EventBusEx } from './events';
import { createNeutralServices } from './null-services';
import type { NeutralServices } from './null-services';
import { createRng } from './rng';
import type { SeededRng } from './rng';
import { createSave } from './save';
import type { SaveStore, StorageLike } from './save';
import { SessionController } from './session';
import { createSettings } from './settings';
import type { DeviceHints, SettingsStore } from './settings';
import {
  createPeopleStore, createProjectileStore, createPropStore, createSquadStore, createVehicleStore,
} from './stores';
import type { PropStore, VehicleStore } from './stores';

export interface ContextOptions {
  /** true = aucun rendu, aucun DOM (tests Node). Par défaut : détecté (absence de `document`). */
  headless?: boolean;
  /** Graine du générateur aléatoire avant le premier démarrage de session (défaut 1). */
  seed?: number;
  /** Mode bavard : l'interface neutre journalise en console, avertissements supplémentaires. */
  debug?: boolean;
  /** Stockage de la sauvegarde : `null` = mémoire ; absent = localStorage s'il est utilisable. */
  storage?: StorageLike | null;
  /** Indices matériels pour la qualité initiale (par défaut : lus sur le navigateur). */
  device?: DeviceHints;
}

/** Magasins d'entités de base créés avec le contexte. */
export interface CoreStores {
  people: PeopleStore;
  projectiles: ProjectileApi;
  vehicles: VehicleStore;
  props: PropStore;
  squads: SquadApi;
}

/** Rouages internes du contexte. */
export interface CoreInternals {
  readonly ctx: GameContext;
  readonly clock: GameClock;
  readonly rng: SeededRng;
  readonly bus: EventBusEx;
  readonly save: SaveStore;
  readonly settings: SettingsStore;
  readonly session: SessionController;
  /** Magasins de base (toujours ceux du cœur, même si un module a remplacé ctx.people, etc.). */
  readonly stores: CoreStores;
  /** Services neutres d'origine (même remarque). */
  readonly neutral: NeutralServices;
  readonly debug: boolean;
  /** Repart à l'identifiant 1 (début de session). */
  resetIds(): void;
  /** Fait vivre les services neutres encore en place pendant un pas de simulation. */
  updateNeutral(dt: number): void;
  /** Remet à zéro l'état interne des services neutres (début de session). */
  resetNeutral(): void;
}

class ContextImpl implements GameContext {
  people!: PeopleStore;
  projectiles!: ProjectileApi;
  vehicles!: VehicleApi;
  props!: PropApi;
  squads!: SquadApi;

  world!: WorldQuery;
  env!: EnvApi;
  hazards!: HazardApi;
  health!: HealthApi;
  actions!: ActionApi;
  interactions!: InteractionApi;
  archetypes!: ArchetypeApi;
  law!: LawApi;
  director!: DirectorApi;
  radio!: RadioApi;
  player!: PlayerApi;

  input!: InputState;
  ui!: UiApi;
  audio!: AudioApi;
  view: ViewApi | null = null;

  private readonly services = new Map<string, unknown>();
  private nextId = 1;

  constructor(
    readonly events: EventBusEx,
    readonly clock: GameClock,
    readonly rng: SeededRng,
    readonly settings: SettingsStore,
    readonly save: SaveStore,
    readonly session: SessionController,
    readonly headless: boolean,
    private readonly debug: boolean,
  ) {}

  provide<T>(key: string, service: T): void {
    if (this.debug && this.services.has(key)) console.warn(`[core] service « ${key} » remplacé`);
    this.services.set(key, service);
  }

  service<T>(key: string): T | undefined {
    return this.services.get(key) as T | undefined;
  }

  require<T>(key: string): T {
    if (!this.services.has(key)) {
      throw new Error(`[core] service « ${key} » absent : aucun module branché ne le fournit`);
    }
    return this.services.get(key) as T;
  }

  newId(): EntityId {
    return this.nextId++;
  }

  resetIds(): void {
    this.nextId = 1;
  }
}

const internals = new WeakMap<GameContext, CoreInternals>();

/** Détecte l'absence de navigateur (Node, tests). */
export function detectHeadless(): boolean {
  const g = globalThis as { document?: unknown; window?: unknown };
  return typeof g.document === 'undefined' || typeof g.window === 'undefined';
}

/** Assemble un GameContext complet, équipé des magasins de base et des services neutres. */
export function createContext(options: ContextOptions = {}): GameContext {
  const headless = options.headless ?? detectHeadless();
  const debug = options.debug ?? false;
  const bus = createEventBus();
  const clock = new GameClock();
  const rng = createRng(options.seed ?? 1);
  const save = createSave({ storage: options.storage });
  const settings = createSettings({ save, events: bus, device: options.device });
  const session = new SessionController();
  const ctx = new ContextImpl(bus, clock, rng, settings, save, session, headless, debug);

  // Les services neutres sont posés avant les magasins : ceux-ci lisent ctx.world, ctx.law… à l'usage.
  const neutral = createNeutralServices(ctx, debug);
  ctx.world = neutral.world;
  ctx.env = neutral.env;
  ctx.hazards = neutral.hazards;
  ctx.health = neutral.health;
  ctx.actions = neutral.actions;
  ctx.interactions = neutral.interactions;
  ctx.archetypes = neutral.archetypes;
  ctx.law = neutral.law;
  ctx.director = neutral.director;
  ctx.radio = neutral.radio;
  ctx.player = neutral.player;
  ctx.ui = neutral.ui;
  ctx.audio = neutral.audio;
  ctx.input = neutral.input;

  const stores: CoreStores = {
    people: createPeopleStore(ctx),
    projectiles: createProjectileStore(ctx),
    vehicles: createVehicleStore(ctx),
    props: createPropStore(ctx),
    squads: createSquadStore(ctx),
  };
  ctx.people = stores.people;
  ctx.projectiles = stores.projectiles;
  ctx.vehicles = stores.vehicles;
  ctx.props = stores.props;
  ctx.squads = stores.squads;

  const core: CoreInternals = {
    ctx,
    clock,
    rng,
    bus,
    save,
    settings,
    session,
    stores,
    neutral,
    debug,
    resetIds: () => ctx.resetIds(),
    updateNeutral(dt: number): void {
      if (ctx.interactions === neutral.interactions) neutral.interactions.update(dt);
      if (ctx.props === stores.props) stores.props.update(dt);
    },
    resetNeutral(): void {
      neutral.interactions.reset();
      neutral.player.reset();
      neutral.ui.reset();
    },
  };
  session.attach(core);
  internals.set(ctx, core);
  return ctx;
}

/** Rouages internes d'un contexte créé par createContext() ; lève une erreur pour tout autre objet. */
export function getCore(ctx: GameContext): CoreInternals {
  const core = internals.get(ctx);
  if (!core) throw new Error('[core] ce contexte ne provient pas de createContext()');
  return core;
}
