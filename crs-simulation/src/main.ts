/* =====================================================================================
 * CRS SIMULATION FRANCE — racine de composition.
 *
 * C'est ici, et seulement ici, que les modules sont assemblés. Chaque module exporte depuis son
 * index.ts une fabrique `createSystems: ModuleFactory` ; elle est importée et ajoutée au tableau
 * MODULES ci-dessous. Les systèmes sont triés par leur champ `order` (SystemOrder dans
 * src/core/contracts.ts) ; à ordre égal ils s'exécutent dans l'ordre du tableau — d'où la place du
 * rendu de base AVANT les autres modules de rendu (la caméra est posée avant que personnages et
 * véhicules ne se dessinent). Le moteur appelle tous les provide(), puis tous les init().
 *
 * Paramètres d'URL (src/core/launch.ts) : ?autostart=test|paris &place=… &x=…&z=… &quality=bas|moyen|haut|ultra
 * &seed=… &nomenu=1 &map=test &mode=… &role=… &rank=… &time=… &weather=… &duration=… &debug=1
 * et, lus ici pour la session lancée d'office : &poste=… (poste tenu) &camera=fps|tps &passants=N.
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory, SessionConfig } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { installDebugApi } from '@/core/debug';
import { Game } from '@/core/game';
import { LAUNCH_SERVICE, launchSessionConfig, parseLaunchParams } from '@/core/launch';
import type { LaunchParams } from '@/core/launch';
import { applyQualityPreset } from '@/core/settings';

// ── modules terminés ──
import { createSystems as input } from '@/input';                    // clavier, souris, manette, tactile
import { createSystems as env } from '@/env';                        // heure, météo, vent
import { createSystems as worldQuery } from '@/world/query';         // relief, collisions, rues, lieux
import { createSystems as simRoles } from '@/sim/roles';             // archétypes : tenues, dotations
import { createSystems as simPeople } from '@/sim/people';           // locomotion, santé, interactions, joueur
import { createSystems as simVehicles } from '@/sim/vehicles';       // physique des véhicules, tourelles
import { createSystems as simItems } from '@/sim/items';             // objets, projectiles
import { createSystems as simProps } from '@/sim/props';             // mobilier, vitrines, barricades
import { createSystems as simHazards } from '@/sim/hazards';         // gaz, fumée, feu, eau
import { createSystems as law } from '@/gameplay/law';               // sommations, emploi de la force
import { createSystems as radio } from '@/gameplay/radio';           // messages radio
import { createSystems as session, installLoadingGate } from '@/gameplay/session'; // mise en place de la session
import { createSystems as renderBase } from '@/render/base';         // renderer, ciel, caméra (fournit ctx.view)
import { createSystems as worldView } from '@/world/view';           // maillages de la ville
import { createSystems as monuments } from '@/world/monuments';      // monuments
import { createSystems as renderPeople } from '@/render/people';     // personnages
import { createSystems as renderVehicles } from '@/render/vehicles'; // véhicules
import { createSystems as ui } from '@/ui';                          // accueil, HUD, cartes, commandement
import { createSystems as audio } from '@/audio';                    // sons, ambiances, voix
import type { Map2dService } from '@/ui/maps/api';
import type { Map2dApi } from '@/world/view/api';

// ── modules encore en cours d'écriture au moment de l'assemblage (à brancher quand ils seront livrés) ──
//   import { createSystems as simTraffic } from '@/sim/traffic';         // circulation, piétons civils
//   import { createSystems as simCrowd } from '@/sim/crowd';             // manifestants, tension, métro
//   import { createSystems as simPolice } from '@/sim/police';           // IA des unités, formations, ordres
//   import { createSystems as renderProps } from '@/render/props';       // mobilier urbain, vitrines, barricades
//   import { createSystems as renderFx } from '@/render/fx';             // particules (gaz, feu, eau), décals
//   import { createSystems as incidents } from '@/gameplay/incidents';   // incidents à traiter
//   import { createSystems as missions } from '@/gameplay/missions';     // cadre de mission (remplacera gameplay/session)
//   import { createSystems as career } from '@/gameplay/career';         // carrière, mode libre
//   import { createSystems as media } from '@/gameplay/media';           // journalistes, image publique

// ───────────────────────────── adaptateurs d'assemblage ─────────────────────────────

/**
 * Fond de carte 2D : le module de la ville (src/world/view) et l'interface (src/ui/maps) ont été écrits
 * séparément et ne parlent pas la même langue sous la clé « world.map2d » :
 *   - rotation : pour la ville, c'est le CAP placé en haut de l'écran (nord en haut = π) ; pour l'interface,
 *     0 = nord en haut ;
 *   - options : la ville attend { names, landmarks, complete… } et dessine dans le repère courant du contexte ;
 *     l'interface passe { labels, detail, pixelRatio } avec des tailles en pixels du canevas ;
 *   - l'interface garde son fond en cache et ne le refait que si `revision` change.
 * Cet adaptateur republie le service de la ville sous la forme attendue par l'interface (le service d'origine
 * reste disponible sous « world.map2d.native »). Les textes sont dessinés en pixels CSS : le contexte est mis à
 * l'échelle de la densité d'écran, de sorte que la taille des noms reste bornée (9 à 13 px) quel que soit l'écran.
 */
function map2dAdapter(): GameSystem[] {
  return [{
    id: 'main.map2d',
    // provide() juste après celui de la ville (ordre WORLD_VIEW), avant ceux de l'interface
    order: SystemOrder.WORLD_VIEW + 1,
    provide(ctx: GameContext): void {
      const native = ctx.service<Map2dApi>('world.map2d');
      if (!native || typeof native.draw !== 'function' || ctx.headless) return;
      let revision = 1;
      const bump = (): void => {
        revision++;
      };
      ctx.events.on('world:tile_loaded', bump);
      ctx.events.on('world:tile_unloaded', bump);
      ctx.events.onAny('world:source', bump);
      const adapted: Map2dService = {
        draw(g, centerX, centerZ, metersPerPixel, rotation, options) {
          const pr = options && options.pixelRatio && options.pixelRatio > 0 ? options.pixelRatio : 1;
          const width = (options?.width ?? g.canvas.width) / pr;
          const height = (options?.height ?? g.canvas.height) / pr;
          g.save();
          g.scale(pr, pr);
          try {
            native.draw(g, centerX, centerZ, metersPerPixel * pr, rotation + Math.PI, {
              width, height, names: options?.labels !== false, landmarks: true, complete: true,
            });
          } finally {
            g.restore();
          }
        },
        get revision(): number {
          return revision;
        },
      };
      ctx.provide('world.map2d.native', native);
      ctx.provide<Map2dService>('world.map2d', adapted);
    },
  }];
}

const MODULES: ModuleFactory[] = [
  // simulation
  input, env, worldQuery, simRoles, simPeople, simVehicles, simItems, simProps, simHazards, law, radio, session,
  // présentation — le rendu de base d'abord
  renderBase, worldView, map2dAdapter, monuments, renderPeople, renderVehicles, ui, audio,
];

// ───────────────────────────── démarrage ─────────────────────────────

/** Session lancée d'office par ?autostart= : configuration de l'URL, plus les clés lues par la mise en place. */
function autostartConfig(launch: LaunchParams): SessionConfig {
  const cfg = launchSessionConfig(launch);
  const extra: Record<string, unknown> = { ...(cfg.extra ?? {}) };
  const raw = launch.raw;
  if (raw['poste']) extra['poste'] = raw['poste'];
  if (raw['variante']) extra['variante'] = raw['variante'];
  if (raw['camera']) extra['camera'] = raw['camera'];
  const passants = Number(raw['passants']);
  if (raw['passants'] !== undefined && Number.isFinite(passants)) extra['passants'] = passants;
  if (Object.keys(extra).length > 0) cfg.extra = extra;
  return cfg;
}

async function main(): Promise<void> {
  const launch = parseLaunchParams(window.location.search);

  const game = new Game({ seed: launch.seed ?? undefined, debug: launch.debug });
  const ctx = game.ctx;
  const debug = installDebugApi(game);

  // Les modules lisent les paramètres de lancement par ctx.service<LaunchParams>('launch').
  ctx.provide(LAUNCH_SERVICE, launch);
  if (launch.quality) applyQualityPreset(ctx.settings, launch.quality);

  for (const factory of MODULES) game.addModule(factory);

  await game.boot();
  // L'écran de chargement reste levé tant que la ville n'est pas construite autour du joueur.
  installLoadingGate(ctx);
  game.run();

  removeSplash();
  if (!ctx.view) {
    // Sans WebGL, l'interface s'affiche mais rien ne peut être dessiné : on le dit clairement.
    ctx.ui.notify('L’affichage 3D (WebGL) est indisponible sur cet appareil : le jeu ne peut pas être dessiné.', 'alert', 60);
  }

  // ?autostart= : session lancée d'office, sans passer par la page d'accueil.
  if (launch.autostart) {
    try {
      await ctx.session.start(autostartConfig(launch));
    } catch (err) {
      debug.error = err instanceof Error ? err.message : String(err);
      console.error('[main] démarrage automatique de la session impossible', err);
    }
  }
  debug.ready = true;
}

function removeSplash(): void {
  document.getElementById('boot-splash')?.remove();
}

function showFatal(err: unknown): void {
  const splash = document.getElementById('boot-splash');
  const state = splash?.querySelector('.state');
  if (!splash || !state) return;
  splash.classList.add('failed');
  state.textContent = `Le jeu n'a pas pu démarrer : ${err instanceof Error ? err.message : String(err)}`;
}

main().catch((err: unknown) => {
  console.error('[main] démarrage impossible', err);
  showFatal(err);
});
