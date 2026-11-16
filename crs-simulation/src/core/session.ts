/* =====================================================================================
 * Session de jeu (SessionApi) : démarrage, pause, fin.
 *
 * start(config) :
 *   1. phase « loading » ;
 *   2. remise à zéro de l'horloge et des services neutres ;
 *   3. vidage des magasins d'entités et des journaux (squads, people, projectiles, vehicles,
 *      props, hazards, law, radio) ; puis les identifiants repartent de 1 et le générateur
 *      aléatoire est re-semé (config.seed) ; puis reset() de tous les systèmes, dans l'ordre ;
 *   4. point de départ : config.x / config.z s'ils sont fournis, sinon world.placeByName(config.place),
 *      sinon le centre du monde. Le point retenu est recopié dans session.config.x / .z ;
 *   5. world.setFocus(x, z) puis attente de world.whenLoaded(x, z, 250) ;
 *   6. heure et météo de la configuration appliquées à ctx.env ;
 *   7. événement session:started (les modules de mission peuplent la scène), puis phase « playing ».
 *
 * La configuration reçue est copiée puis assainie (sanitizeSessionConfig) : jamais de NaN ni de
 * valeur hors domaine dans session.config.
 * Chaque changement de phase émet l'événement « session:phase » { phase, previous }.
 * À tout « session:started » correspond un « session:ended », même si la session est interrompue
 * ou remplacée depuis un abonné de session:started (avant d'avoir atteint la phase « playing »).
 * end() ne vide pas les magasins : les entités restent consultables (compte rendu, relecture)
 * jusqu'au démarrage suivant.
 * ===================================================================================== */

import type {
  DurationPreset, GameContext, PlayableRole, PoliceRank, SessionApi, SessionConfig, SessionPhase, WeatherKind,
} from './contracts';
import type { GameClock } from './clock';
import type { SeededRng } from './rng';

/** Rayon (m) dont le chargement est attendu autour du point de départ. */
export const START_LOAD_RADIUS = 250;

/**
 * Durée cible d'une manifestation selon le préréglage (docs/BRIEF.md §1) : 10, 25 ou 45 minutes.
 * « temps_reel » n'a pas de durée cible : la manifestation suit son rythme réel (Infinity).
 */
export function sessionDurationSeconds(preset: DurationPreset): number {
  switch (preset) {
    case 'courte':
      return 600;
    case 'standard':
      return 1500;
    case 'longue':
      return 2700;
    default:
      return Infinity;
  }
}

/** Charge utile de l'événement « session:phase ». */
export interface SessionPhaseEvent {
  phase: SessionPhase;
  previous: SessionPhase;
}

/**
 * Grade par défaut d'un rôle jouable, quand le joueur n'en a pas choisi (mode libre : « on choisit
 * son rôle et son grade — y compris commandant directement »). null pour les rôles hors forces de l'ordre.
 */
export function defaultRankForRole(role: PlayableRole): PoliceRank | null {
  switch (role) {
    case 'crs':
    case 'bravm':
    case 'gendarme_centaure':
      return 'gardien';
    case 'operateur_canon_eau':
    case 'telepilote':
      return 'brigadier';
    case 'chef_groupe':
      return 'brigadier_chef';
    case 'commandant':
      return 'commandant';
    case 'commissaire':
      return 'commissaire';
    default:
      return null; // street_medic, secouriste, journaliste, manifestant
  }
}

/**
 * Configuration de session complète à partir de valeurs partielles (session d'essai par défaut).
 * Un champ absent ou « undefined » prend sa valeur par défaut ; sans grade fourni, celui du rôle.
 */
export function defaultSessionConfig(partial: Partial<SessionConfig> = {}): SessionConfig {
  const cfg: SessionConfig = {
    mode: 'test',
    missionId: '',
    role: 'crs',
    rank: 'gardien',
    place: '',
    timeOfDay: 14,
    weather: 'clair',
    crowdSize: 0,
    tension: 0,
    volatility: 0,
    duration: 'standard',
    seed: 1,
  };
  const target = cfg as unknown as Record<string, unknown>;
  const source = partial as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (source[key] !== undefined) target[key] = source[key];
  }
  if (partial.rank === undefined) cfg.rank = defaultRankForRole(cfg.role);
  return cfg;
}

const WEATHERS: readonly string[] = ['clair', 'nuageux', 'couvert', 'pluie', 'averse', 'brouillard', 'orage'];
const DURATIONS: readonly string[] = ['courte', 'standard', 'longue', 'temps_reel'];

/**
 * Assainit une configuration AVANT qu'elle n'atteigne les modules : une valeur NaN ou hors domaine
 * (éditeur de scénario, URL, sauvegarde abîmée) se propagerait sinon dans toute la simulation.
 * Corrige sur place et retourne la liste des champs corrigés (vide si tout était valide).
 */
export function sanitizeSessionConfig(cfg: SessionConfig): string[] {
  const fixed: string[] = [];
  const unit = (key: 'tension' | 'volatility'): void => {
    const v = cfg[key];
    const ok = typeof v === 'number' && v >= 0 && v <= 1;
    if (!ok) {
      cfg[key] = typeof v === 'number' && v > 1 ? 1 : 0; // NaN, négatif ou mauvais type → 0
      fixed.push(key);
    }
  };
  unit('tension');
  unit('volatility');
  if (typeof cfg.crowdSize !== 'number' || !Number.isFinite(cfg.crowdSize) || cfg.crowdSize < 0) {
    cfg.crowdSize = 0;
    fixed.push('crowdSize');
  } else {
    cfg.crowdSize = Math.round(cfg.crowdSize); // un effectif est un nombre entier de personnes
  }
  if (typeof cfg.timeOfDay !== 'number' || !Number.isFinite(cfg.timeOfDay)) {
    cfg.timeOfDay = 14;
    fixed.push('timeOfDay');
  } else if (cfg.timeOfDay < 0 || cfg.timeOfDay >= 24) {
    cfg.timeOfDay = ((cfg.timeOfDay % 24) + 24) % 24;
    fixed.push('timeOfDay');
  }
  if (typeof cfg.seed !== 'number' || !Number.isFinite(cfg.seed)) {
    cfg.seed = 1;
    fixed.push('seed');
  }
  if (WEATHERS.indexOf(cfg.weather) < 0) {
    cfg.weather = 'clair' as WeatherKind;
    fixed.push('weather');
  }
  if (DURATIONS.indexOf(cfg.duration) < 0) {
    cfg.duration = 'standard';
    fixed.push('duration');
  }
  if (typeof cfg.place !== 'string') {
    cfg.place = '';
    fixed.push('place');
  }
  if (typeof cfg.missionId !== 'string') {
    cfg.missionId = '';
    fixed.push('missionId');
  }
  // coordonnées de départ : toutes deux finies, ou aucune (le lieu ou le centre du monde décide alors)
  const hasX = cfg.x !== undefined;
  const hasZ = cfg.z !== undefined;
  if ((hasX || hasZ) && !(typeof cfg.x === 'number' && typeof cfg.z === 'number' && Number.isFinite(cfg.x) && Number.isFinite(cfg.z))) {
    delete cfg.x;
    delete cfg.z;
    fixed.push('x/z');
  }
  return fixed;
}

/** Ce dont la session a besoin du cœur du moteur. */
export interface SessionCore {
  readonly ctx: GameContext;
  readonly clock: GameClock;
  readonly rng: SeededRng;
  /** Mode strict (tests) : une erreur pendant la remise à zéro fait échouer le démarrage. */
  readonly strict?: boolean;
  resetIds(): void;
  resetNeutral(): void;
}

/** Points d'accroche fournis par Game. */
export interface SessionHooks {
  /** Attendu avant tout démarrage (fin du boot). */
  beforeStart?(): Promise<void>;
  /** reset() de tous les systèmes, dans l'ordre. */
  resetSystems?(): void;
}

/**
 * Préparation de fin de chargement (ajout de l'assemblage) : tâche asynchrone attendue APRÈS
 * 'session:started' (la scène est peuplée, le joueur est en place) et AVANT la phase « playing ».
 * Sert à la présentation : construction des maillages de la ville, textures des monuments… La phase
 * reste « loading » (écran de chargement affiché) tant que les préparations ne sont pas terminées.
 */
export type SessionPreparation = (config: SessionConfig) => void | Promise<void>;

/** Durée maximale accordée à une préparation (ms) : au-delà, la session démarre quand même. */
export const SESSION_PREPARATION_TIMEOUT_MS = 90000;

export class SessionController implements SessionApi {
  private phase_: SessionPhase = 'boot';
  private config_: SessionConfig | null = null;
  private core: SessionCore | null = null;
  private hooks: SessionHooks = {};
  private readonly preparations: SessionPreparation[] = [];
  /** Incrémenté à chaque démarrage ou fin : un démarrage dépassé s'abandonne de lui-même. */
  private token = 0;
  /**
   * session:started a été émis et session:ended ne l'a pas encore été. Garantit qu'à tout début
   * annoncé aux modules correspond une fin, même si la session est interrompue avant d'être jouée.
   */
  private live = false;

  get phase(): SessionPhase {
    return this.phase_;
  }

  get config(): SessionConfig | null {
    return this.config_;
  }

  attach(core: SessionCore): void {
    this.core = core;
  }

  setHooks(hooks: SessionHooks): void {
    this.hooks = hooks;
  }

  /**
   * Enregistre une préparation de fin de chargement (voir SessionPreparation). Sans préparation
   * enregistrée — tests headless, modules de simulation seuls — le démarrage est inchangé.
   * Retourne la fonction de retrait.
   */
  addPreparation(run: SessionPreparation): () => void {
    this.preparations.push(run);
    return () => {
      const i = this.preparations.indexOf(run);
      if (i >= 0) this.preparations.splice(i, 1);
    };
  }

  /** Attend chaque préparation à son tour ; une erreur ou un délai dépassé n'empêche pas de jouer. */
  private async runPreparations(cfg: SessionConfig, token: number): Promise<void> {
    const list = this.preparations.slice();
    for (const run of list) {
      if (token !== this.token) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), SESSION_PREPARATION_TIMEOUT_MS);
        });
        const outcome = await Promise.race([Promise.resolve(run(cfg)).then(() => 'done' as const), timeout]);
        if (outcome === 'timeout') console.warn('[session] une préparation de fin de chargement ne répond pas : la session démarre sans elle');
      } catch (err) {
        console.error('[session] préparation de fin de chargement en échec', err);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  }

  /** Fin du boot : le jeu passe au menu. */
  markBooted(): void {
    if (this.phase_ === 'boot') this.setPhase('menu');
  }

  private setPhase(phase: SessionPhase): void {
    const previous = this.phase_;
    if (previous === phase) return;
    this.phase_ = phase;
    this.core?.ctx.events.emit('session:phase', { phase, previous });
  }

  async start(config: SessionConfig): Promise<void> {
    const core = this.core;
    if (!core) throw new Error('[session] contexte non assemblé');
    const ctx = core.ctx;
    const token = ++this.token;
    if (this.hooks.beforeStart) await this.hooks.beforeStart();
    if (token !== this.token) return;

    // une session en cours (ou annoncée aux modules) est d'abord terminée proprement
    if (this.phase_ === 'playing' || this.phase_ === 'paused' || this.live) {
      this.finish(false);
      if (token !== this.token) return; // un abonné de session:ended a relancé autre chose
    }

    const cfg: SessionConfig = { ...config };
    const fixed = sanitizeSessionConfig(cfg);
    if (fixed.length > 0) {
      console.warn(`[session] configuration corrigée avant le démarrage (valeurs invalides) : ${fixed.join(', ')}`);
    }
    this.config_ = cfg;
    this.setPhase('loading');

    try {
      core.clock.reset();
      core.resetNeutral();
      this.clearStores(ctx, core.strict === true);
      // La numérotation et le générateur aléatoire ne repartent qu'une fois les magasins vides :
      // aucun identifiant de la nouvelle session ne peut désigner une entité de l'ancienne encore en
      // cours de retrait, et un abonné de *:removed qui tirerait au sort pendant le vidage ne décale
      // pas la suite aléatoire de la nouvelle session (même graine → même déroulement, toujours).
      core.resetIds();
      core.rng.reseed(cfg.seed);
      this.hooks.resetSystems?.();
      if (token !== this.token) return; // un reset() ou un abonné a relancé ou annulé le démarrage

      // point de départ
      let x = 0;
      let z = 0;
      if (typeof cfg.x === 'number' && typeof cfg.z === 'number') {
        x = cfg.x;
        z = cfg.z;
      } else {
        const place = cfg.place ? ctx.world.placeByName(cfg.place) : null;
        if (place) {
          x = place.x;
          z = place.z;
        } else {
          if (cfg.place) console.warn(`[session] lieu inconnu « ${cfg.place} » : départ au centre du monde`);
          const b = ctx.world.bounds;
          if (b.minX > 0 || b.maxX < 0 || b.minZ > 0 || b.maxZ < 0) {
            x = (b.minX + b.maxX) * 0.5;
            z = (b.minZ + b.maxZ) * 0.5;
          }
        }
      }
      cfg.x = x;
      cfg.z = z;

      ctx.world.setFocus(x, z);
      await ctx.world.whenLoaded(x, z, START_LOAD_RADIUS);
      if (token !== this.token) return; // remplacée ou annulée pendant le chargement

      ctx.env.setTime(cfg.timeOfDay);
      ctx.env.setWeather(cfg.weather, true);
      this.live = true;
      ctx.events.emit('session:started', { config: cfg });
      if (token !== this.token) return; // un abonné a mis fin à la session ou en a relancé une autre
      if (this.preparations.length > 0) {
        // présentation : la ville se construit autour du joueur avant que l'écran de chargement ne tombe
        await this.runPreparations(cfg, token);
        if (token !== this.token) return; // remplacée ou annulée pendant les préparations
      }
      this.setPhase('playing');
    } catch (err) {
      // chargement impossible (ou, en mode strict, erreur d'un système ou d'un abonné) : retour au menu
      if (token === this.token) {
        this.token++;
        this.live = false;
        this.config_ = null;
        this.setPhase('menu');
      }
      throw err;
    }
  }

  end(toDebrief = false): void {
    if (this.phase_ === 'playing' || this.phase_ === 'paused') {
      this.token++;
      this.finish(toDebrief);
    } else if (this.phase_ === 'loading') {
      this.token++;
      if (this.live) {
        // session:started est déjà parti : les modules reçoivent la fin correspondante
        this.finish(toDebrief);
      } else {
        this.setPhase('menu');
        this.config_ = null;
      }
    } else if (this.phase_ === 'debrief' && !toDebrief) {
      this.setPhase('menu');
      this.config_ = null;
    }
  }

  pause(paused: boolean): void {
    if (paused && this.phase_ === 'playing') {
      this.setPhase('paused');
      this.core?.ctx.events.emit('session:paused', { paused: true });
    } else if (!paused && this.phase_ === 'paused') {
      this.setPhase('playing');
      this.core?.ctx.events.emit('session:paused', { paused: false });
    }
  }

  private finish(toDebrief: boolean): void {
    this.live = false;
    if (this.core) this.core.clock.timeScale = 1;
    this.setPhase(toDebrief ? 'debrief' : 'menu');
    this.core?.ctx.events.emit('session:ended', { toDebrief });
    if (this.phase_ === 'menu') this.config_ = null;
  }

  /**
   * Vide les magasins d'entités et les journaux par les méthodes du contrat (quel qu'en soit le
   * fournisseur). Les unités d'abord : les personnes retirées ensuite n'ont plus à en être détachées
   * une à une. Une erreur est journalisée et n'empêche pas de vider le reste ; en mode strict, la
   * première est relancée une fois tout vidé.
   */
  private clearStores(ctx: GameContext, strict: boolean): void {
    const steps: [string, () => void][] = [
      ['squads', () => ctx.squads.clear()],
      ['people', () => ctx.people.clear()],
      ['projectiles', () => ctx.projectiles.clear()],
      ['vehicles', () => ctx.vehicles.clear()],
      ['props', () => ctx.props.clear()],
      ['hazards', () => ctx.hazards.clear()],
      ['law', () => ctx.law.reset()],
      ['radio', () => ctx.radio.clear()],
    ];
    let failed = false;
    let firstError: unknown;
    const pass = (): void => {
      for (const [name, run] of steps) {
        try {
          run();
        } catch (err) {
          console.error(`[session] remise à zéro de « ${name} » impossible`, err);
          if (!failed) {
            failed = true;
            firstError = err;
          }
        }
      }
    };
    pass();
    // un abonné a pu créer des entités en réaction aux retraits (« réapparition », débris…) :
    // elles appartiennent à la session qui se termine et ne doivent pas survivre dans la suivante
    for (let extra = 0; extra < 3 && this.leftovers(ctx) > 0; extra++) {
      console.warn(
        `[session] ${this.leftovers(ctx)} entité(s) créée(s) pendant la remise à zéro (par un abonné de *:removed ?) : supprimée(s)`,
      );
      pass();
    }
    if (failed && strict) throw firstError;
  }

  /** Nombre d'entités encore présentes dans les magasins. */
  private leftovers(ctx: GameContext): number {
    try {
      return (
        ctx.people.list.length + ctx.projectiles.list.length + ctx.vehicles.list.length +
        ctx.props.list.length + ctx.props.shops.length + ctx.squads.list.length
      );
    } catch {
      return 0; // magasin d'un module défaillant : déjà signalé par la passe de vidage
    }
  }
}
