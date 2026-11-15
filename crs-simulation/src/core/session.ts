/* =====================================================================================
 * Session de jeu (SessionApi) : démarrage, pause, fin.
 *
 * start(config) :
 *   1. phase « loading » ;
 *   2. remise à zéro de l'horloge, des identifiants et du générateur aléatoire (config.seed) ;
 *   3. vidage des magasins d'entités et des journaux (people, projectiles, vehicles, props,
 *      squads, hazards, law, radio), puis reset() de tous les systèmes, dans l'ordre ;
 *   4. point de départ : config.x / config.z s'ils sont fournis, sinon world.placeByName(config.place),
 *      sinon le centre du monde. Le point retenu est recopié dans session.config.x / .z ;
 *   5. world.setFocus(x, z) puis attente de world.whenLoaded(x, z, 250) ;
 *   6. heure et météo de la configuration appliquées à ctx.env ;
 *   7. événement session:started (les modules de mission peuplent la scène), puis phase « playing ».
 *
 * Chaque changement de phase émet aussi l'événement libre « session:phase » { phase, previous }.
 * ===================================================================================== */

import type { GameContext, SessionApi, SessionConfig, SessionPhase } from './contracts';
import type { GameClock } from './clock';
import type { SeededRng } from './rng';

/** Rayon (m) dont le chargement est attendu autour du point de départ. */
export const START_LOAD_RADIUS = 250;

/** Charge utile de l'événement libre « session:phase ». */
export interface SessionPhaseEvent {
  phase: SessionPhase;
  previous: SessionPhase;
}

/** Configuration de session complète à partir de valeurs partielles (session d'essai par défaut). */
export function defaultSessionConfig(partial: Partial<SessionConfig> = {}): SessionConfig {
  return {
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
    ...partial,
  };
}

/** Ce dont la session a besoin du cœur du moteur. */
export interface SessionCore {
  readonly ctx: GameContext;
  readonly clock: GameClock;
  readonly rng: SeededRng;
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

export class SessionController implements SessionApi {
  private phase_: SessionPhase = 'boot';
  private config_: SessionConfig | null = null;
  private core: SessionCore | null = null;
  private hooks: SessionHooks = {};
  /** Incrémenté à chaque démarrage ou fin : un démarrage dépassé s'abandonne de lui-même. */
  private token = 0;

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

  /** Fin du boot : le jeu passe au menu. */
  markBooted(): void {
    if (this.phase_ === 'boot') this.setPhase('menu');
  }

  private setPhase(phase: SessionPhase): void {
    const previous = this.phase_;
    if (previous === phase) return;
    this.phase_ = phase;
    const event: SessionPhaseEvent = { phase, previous };
    this.core?.ctx.events.emitAny('session:phase', event);
  }

  async start(config: SessionConfig): Promise<void> {
    const core = this.core;
    if (!core) throw new Error('[session] contexte non assemblé');
    const ctx = core.ctx;
    const token = ++this.token;
    if (this.hooks.beforeStart) await this.hooks.beforeStart();
    if (token !== this.token) return;

    // une session en cours est d'abord terminée proprement
    if (this.phase_ === 'playing' || this.phase_ === 'paused') {
      this.finish(false);
      if (token !== this.token) return; // un abonné de session:ended a relancé autre chose
    }

    const cfg: SessionConfig = { ...config };
    this.config_ = cfg;
    this.setPhase('loading');

    core.clock.reset();
    core.resetIds();
    core.rng.reseed(cfg.seed);
    core.resetNeutral();
    this.clearStores(ctx);
    this.hooks.resetSystems?.();

    // point de départ
    let x = 0;
    let z = 0;
    if (typeof cfg.x === 'number' && typeof cfg.z === 'number' && Number.isFinite(cfg.x) && Number.isFinite(cfg.z)) {
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

    try {
      ctx.world.setFocus(x, z);
      await ctx.world.whenLoaded(x, z, START_LOAD_RADIUS);
    } catch (err) {
      if (token === this.token) {
        this.config_ = null;
        this.setPhase('menu');
      }
      throw err;
    }
    if (token !== this.token) return; // remplacée ou annulée pendant le chargement

    ctx.env.setTime(cfg.timeOfDay);
    ctx.env.setWeather(cfg.weather, true);
    ctx.events.emit('session:started', { config: cfg });
    if (token !== this.token) return; // un abonné a mis fin à la session
    this.setPhase('playing');
  }

  end(toDebrief = false): void {
    if (this.phase_ === 'playing' || this.phase_ === 'paused') {
      this.token++;
      this.finish(toDebrief);
    } else if (this.phase_ === 'loading') {
      this.token++;
      this.setPhase('menu');
      this.config_ = null;
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
    if (this.core) this.core.clock.timeScale = 1;
    this.setPhase(toDebrief ? 'debrief' : 'menu');
    this.core?.ctx.events.emit('session:ended', { toDebrief });
    if (this.phase_ === 'menu') this.config_ = null;
  }

  /** Vide les magasins d'entités et les journaux par les méthodes du contrat (quel qu'en soit le fournisseur). */
  private clearStores(ctx: GameContext): void {
    const steps: [string, () => void][] = [
      ['people', () => ctx.people.clear()],
      ['projectiles', () => ctx.projectiles.clear()],
      ['vehicles', () => ctx.vehicles.clear()],
      ['props', () => ctx.props.clear()],
      ['squads', () => ctx.squads.clear()],
      ['hazards', () => ctx.hazards.clear()],
      ['law', () => ctx.law.reset()],
      ['radio', () => ctx.radio.clear()],
    ];
    for (const [name, run] of steps) {
      try {
        run();
      } catch (err) {
        console.error(`[session] remise à zéro de « ${name} » impossible`, err);
      }
    }
  }
}
