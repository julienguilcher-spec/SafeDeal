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
import { createSystems as simTraffic } from '@/sim/traffic';         // circulation, piétons civils, fermeture de rues
import { createSystems as simCrowd } from '@/sim/crowd';             // manifestants, cortège, tension, métro, groupes radicaux
import { createSystems as simPolice } from '@/sim/police';           // IA des unités, formations, ordres, commandement
import { createSystems as simItems } from '@/sim/items';             // objets, projectiles
import { createSystems as simProps } from '@/sim/props';             // mobilier, vitrines, barricades
import { createSystems as simHazards } from '@/sim/hazards';         // gaz, fumée, feu, eau
import { createSystems as law } from '@/gameplay/law';               // sommations, emploi de la force
import { createSystems as radio } from '@/gameplay/radio';           // messages radio
import { createSystems as incidents } from '@/gameplay/incidents';   // incidents à traiter ou à déléguer
import { createSystems as rescue } from '@/sim/roles/rescue';        // pompiers et SAMU sur appel
import { createSystems as medics } from '@/sim/roles/medics';        // médecins de rue
import { createSystems as session, installLoadingGate } from '@/gameplay/session'; // mise en place de la session
import { createSystems as patrols } from '@/gameplay/patrols';         // voitures de police en patrouille dans Paris
import { createSystems as missions, missionById, missionConfig } from '@/gameplay/missions'; // cadre de mission
import { createSystems as career } from '@/gameplay/career';         // carrière : grades, chapitres, sanctions
import { createSystems as history } from '@/gameplay/history';       // historique des parties jouées
import { createSystems as renderBase } from '@/render/base';         // renderer, ciel, caméra (fournit ctx.view)
import { createSystems as worldView } from '@/world/view';           // maillages de la ville
import { createSystems as monuments } from '@/world/monuments';      // monuments
import { createSystems as renderPeople } from '@/render/people';     // personnages
import { createSystems as renderVehicles } from '@/render/vehicles'; // véhicules
import { createSystems as renderProps } from '@/render/props';       // mobilier urbain, vitrines, barricades
import { createSystems as renderFx } from '@/render/fx';             // gaz, fumée, feu, eau, projectiles, décalques
import { createSystems as ui } from '@/ui';                          // accueil, HUD, cartes, commandement
import { createSystems as audio } from '@/audio';                    // sons, ambiances, voix
import type * as THREE from 'three';
import { RENDER_CLEAR_AIR_SERVICE } from '@/render/base';
import type { RenderClearAirApi } from '@/render/base';
import type { Map2dService } from '@/ui/maps/api';
import type { Map2dApi } from '@/world/view/api';

// ── modules qui n'existent pas encore (à brancher quand ils seront livrés) ──
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
  let native: Map2dApi | undefined;
  let revision = 1;
  /** Délai (s) avant le prochain changement de révision ; négatif : rien en attente. */
  let pending = -1;
  /**
   * Le fond a changé (tuile arrivée ou partie) ou reste à compléter : on attend que les événements se calment, puis
   * la révision change UNE fois. Sans cette attente, chaque tuile chargée faisait redessiner tout le fond de la
   * mini-carte, plusieurs fois de suite (images de 0,4 à 1 s relevées par la recette à chaque changement de tuiles).
   */
  const touch = (delay: number): void => {
    if (pending < 0 || delay < pending) pending = delay;
  };
  return [{
    id: 'main.map2d',
    // provide() juste après celui de la ville (ordre WORLD_VIEW), avant ceux de l'interface
    order: SystemOrder.WORLD_VIEW + 1,
    provide(ctx: GameContext): void {
      native = ctx.service<Map2dApi>('world.map2d');
      if (!native || typeof native.draw !== 'function' || ctx.headless) {
        native = undefined;
        return;
      }
      const source = native;
      const changed = (): void => touch(0.35);
      ctx.events.on('world:tile_loaded', changed);
      ctx.events.on('world:tile_unloaded', changed);
      ctx.events.onAny('world:source', changed);
      const adapted: Map2dService = {
        draw(g, centerX, centerZ, metersPerPixel, rotation, options) {
          const pr = options && options.pixelRatio && options.pixelRatio > 0 ? options.pixelRatio : 1;
          const width = (options?.width ?? g.canvas.width) / pr;
          const height = (options?.height ?? g.canvas.height) / pr;
          g.save();
          g.scale(pr, pr);
          try {
            // Les tracés des tuiles sont construits par tranches (trois tuiles par dessin) : un fond incomplet est
            // redessiné aux images suivantes, au lieu de tout construire dans une seule image très longue.
            source.draw(g, centerX, centerZ, metersPerPixel * pr, rotation + Math.PI, {
              width, height, names: options?.labels !== false, landmarks: true, complete: false,
            });
            if (source.incomplete === true) touch(0.08);
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
    frame(dt: number): void {
      if (pending < 0) return;
      pending -= dt;
      if (pending > 0) return;
      pending = -1;
      revision++;
    },
  }];
}

/**
 * Air clair des monuments : le brouillard de scène est calé sur la distance d'affichage de la ville (220 m en qualité
 * basse) ; appliqué aux monuments, il délavait l'Arc de Triomphe à 120 m et effaçait la tour Eiffel à 750 m. Le rendu
 * de base publie un voile d'« air clair » (visibilité de 5 km par beau temps, réduite par la météo) ; cet adaptateur
 * lui confie le groupe « monuments » de la scène, que le module des monuments remplit et vide au fil du trajet — d'où
 * le passage en revue périodique (les maillages déjà équipés sont ignorés).
 */
function monumentsClearAir(): GameSystem[] {
  let ctx: GameContext | null = null;
  let air: RenderClearAirApi | undefined;
  let root: THREE.Object3D | null = null;
  let timer = 0;
  return [{
    id: 'main.monuments.air',
    // après le système des monuments (ordre VIEW, ajouté avant) et avant le rendu de l'image (VIEW + 90)
    order: SystemOrder.VIEW + 5,
    init(c: GameContext): void {
      ctx = c;
      air = c.service<RenderClearAirApi>(RENDER_CLEAR_AIR_SERVICE);
    },
    frame(dt: number): void {
      if (!ctx || !air || !ctx.view) return;
      // le groupe des monuments est cherché de temps en temps ; une fois trouvé, il est revu à chaque image
      // (un monument qui vient d'être construit ne doit pas apparaître une fraction de seconde dans la brume)
      if (!root || root.parent === null) {
        timer -= dt;
        if (timer > 0) return;
        timer = 0.25;
        root = ctx.view.world.getObjectByName('monuments') ?? null;
      }
      if (root) air.exempt(root);
    },
    reset(): void {
      timer = 0;
    },
  }];
}

const MODULES: ModuleFactory[] = [
  // simulation
  // (la circulation après les véhicules : elle attend leur pilote automatique)
  // (la police après la foule : à ordre égal, les manifestants décident avant les unités qui leur répondent)
  input, env, worldQuery, simRoles, simPeople, simVehicles, simTraffic, simCrowd, simPolice, simItems, simProps, simHazards,
  law, radio, incidents, rescue, medics, session, patrols, missions, career, history,
  // présentation — le rendu de base d'abord
  renderBase, worldView, map2dAdapter, monuments, monumentsClearAir, renderPeople, renderVehicles, renderProps, renderFx, ui, audio,
];

// ───────────────────────────── démarrage ─────────────────────────────

/** Session lancée d'office par ?autostart= : configuration de l'URL, plus les clés lues par la mise en place. */
function autostartConfig(launch: LaunchParams): SessionConfig {
  let cfg = launchSessionConfig(launch);
  // ?mission=… : la fiche de la mission fixe le scénario (les autres paramètres d'URL ne la remplacent pas)
  const def = launch.mission ? missionById(launch.mission) : undefined;
  if (def) cfg = { ...cfg, ...missionConfig(def, null), extra: { ...(cfg.extra ?? {}), ...(missionConfig(def, null).extra ?? {}) } };
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
