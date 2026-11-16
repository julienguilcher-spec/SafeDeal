/* =====================================================================================
 * API de débogage : window.__CRS (docs/ARCHITECTURE.md §6).
 *   { ready, game, ctx, start(config), step(seconds), teleport(x, z), summary() }
 * Utilisée par les tests de bout en bout et depuis la console du navigateur.
 * Aucun accès au DOM : l'objet est posé sur globalThis (donc window dans un navigateur).
 * ===================================================================================== */

import type { GameContext, SessionConfig, SessionPhase } from './contracts';
import type { Game } from './game';
import { defaultSessionConfig } from './session';

export interface DebugSystemSummary {
  id: string;
  order: number;
  /** Moyennes glissantes par image (ms). */
  updateMs: number;
  frameMs: number;
  errors: number;
  disabled: boolean;
}

export interface DebugSummary {
  ready: boolean;
  phase: SessionPhase;
  headless: boolean;
  /** Un module de rendu est branché. */
  view: boolean;
  time: number;
  tick: number;
  timeScale: number;
  seed: number;
  entities: { people: number; vehicles: number; props: number; shops: number; projectiles: number; squads: number };
  player: { personId: number; role: string; x: number; z: number } | null;
  systems: DebugSystemSummary[];
  stats: { fps: number; frameMs: number; simMs: number; presentMs: number; steps: number; frames: number };
}

export interface DebugApi {
  /** Le moteur est démarré (et la session demandée par ?autostart= est lancée, le cas échéant). */
  ready: boolean;
  /** Message de la dernière erreur de démarrage, s'il y en a eu une. */
  error: string | null;
  readonly game: Game;
  readonly ctx: GameContext;
  /** Démarre une session ; les champs absents prennent les valeurs d'une session d'essai. */
  start(config?: Partial<SessionConfig>): Promise<SessionConfig | null>;
  /** Avance la simulation de `seconds` secondes (pas de 1/30 s), immédiatement. Retourne le nombre de pas. */
  step(seconds: number): number;
  /** Déplace le joueur (ou son véhicule) et le centre de chargement du monde. */
  teleport(x: number, z: number): { x: number; y: number; z: number };
  /** État du moteur : phase, nombres d'entités, temps par système. */
  summary(): DebugSummary;
}

/** Nom de la propriété globale. */
export const DEBUG_GLOBAL = '__CRS';

/** Installe l'API de débogage sur `target` (globalThis par défaut) et la retourne. */
export function installDebugApi(game: Game, target: object = globalThis): DebugApi {
  const ctx = game.ctx;
  const api: DebugApi = {
    ready: false,
    error: null,
    game,
    ctx,
    async start(config: Partial<SessionConfig> = {}): Promise<SessionConfig | null> {
      await ctx.session.start(defaultSessionConfig(config));
      return ctx.session.config;
    },
    step(seconds: number): number {
      if (!(seconds > 0) || seconds === Infinity) return 0; // durée invalide ou infinie : rien
      const n = Math.max(1, Math.round(seconds * 30));
      const h = seconds / n;
      let steps = 0;
      for (let i = 0; i < n; i++) steps += game.step(h);
      return steps;
    },
    teleport(x: number, z: number): { x: number; y: number; z: number } {
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        console.warn(`[debug] teleport(${x}, ${z}) : coordonnées invalides, déplacement ignoré`);
        const here = ctx.player.person();
        return here ? { x: here.x, y: here.y, z: here.z } : { x: 0, y: 0, z: 0 };
      }
      const y = ctx.world.heightAt(x, z);
      const p = ctx.player.person();
      if (p) {
        const v = p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) : undefined;
        if (v) {
          v.x = x;
          v.z = z;
          v.y = y;
          v.vx = 0;
          v.vz = 0;
          v.speed = 0;
        }
        p.x = x;
        p.z = z;
        p.y = y;
        p.vx = 0;
        p.vz = 0;
        ctx.people.rebuildIndex();
      }
      ctx.world.setFocus(x, z);
      return { x, y, z };
    },
    summary(): DebugSummary {
      const p = ctx.player.person();
      const seed = (ctx.rng as { seed?: unknown }).seed;
      return {
        ready: api.ready,
        phase: ctx.session.phase,
        headless: ctx.headless,
        view: ctx.view !== null,
        time: ctx.clock.now,
        tick: ctx.clock.tick,
        timeScale: ctx.clock.timeScale,
        seed: typeof seed === 'number' ? seed : 0,
        entities: {
          people: ctx.people.list.length,
          vehicles: ctx.vehicles.list.length,
          props: ctx.props.list.length,
          shops: ctx.props.shops.length,
          projectiles: ctx.projectiles.list.length,
          squads: ctx.squads.list.length,
        },
        player: p ? { personId: p.id, role: ctx.player.state.role, x: p.x, z: p.z } : null,
        systems: game.perf.map((s) => ({
          id: s.id, order: s.order, updateMs: s.avgUpdateMs, frameMs: s.avgFrameMs, errors: s.errors, disabled: s.disabled,
        })),
        stats: {
          fps: game.stats.fps,
          frameMs: game.stats.avgFrameMs,
          simMs: game.stats.simMs,
          presentMs: game.stats.presentMs,
          steps: game.stats.steps,
          frames: game.stats.frames,
        },
      };
    },
  };
  (target as Record<string, unknown>)[DEBUG_GLOBAL] = api;
  return api;
}
