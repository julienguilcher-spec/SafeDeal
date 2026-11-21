/* =====================================================================================
 * MISE EN PLACE DE SESSION — fin de chargement côté navigateur.
 *
 * Le cœur passe en « playing » dès que les données du monde sont chargées et la scène peuplée ; or la
 * ville en 3D se construit ensuite, tuile par tuile, avec un petit budget par image. Sans attendre, le
 * joueur verrait les immeubles surgir. Cette préparation (SessionController.addPreparation) garde
 * l'écran de chargement jusqu'à ce que :
 *   1. les textures des monuments proches soient générées (MonumentsApi.prewarm, un monument par image) ;
 *   2. les tuiles de la ville autour de la caméra soient construites (WorldViewApi.flush) ;
 *   3. quelques images aient été rendues (compilation des shaders).
 * Aucun accès au DOM : seulement des services, requestAnimationFrame et l'horloge. Sans rendu (headless),
 * rien n'est installé.
 * ===================================================================================== */

import type { GameContext, SessionConfig } from '@/core/contracts';
import { getCore } from '@/core/context';
import type { MonumentsApi } from '@/world/monuments/api';
import type { WorldViewApi } from '@/world/view/api';
import { UI_LOADING_EVENT } from './api';
import type { LoadingProgress } from './api';

export interface LoadingGateOptions {
  /** Durée maximale de la construction de la ville avant de rendre la main (ms). Défaut 60 000. */
  maxBuildMs?: number;
  /** Temps de construction accordé par image pendant le chargement (ms). Défaut 45. */
  sliceMs?: number;
  /** Nombre maximal de monuments préparés. Défaut 8. */
  maxMonuments?: number;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Image suivante ; au plus 250 ms d'attente (onglet en arrière-plan : requestAnimationFrame est suspendu). */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    const g = globalThis as { requestAnimationFrame?: (cb: () => void) => number };
    if (typeof g.requestAnimationFrame === 'function') g.requestAnimationFrame(finish);
    setTimeout(finish, 250);
  });
}

/** Mesures du dernier chargement (pour l'affichage des performances et les tests de bout en bout). */
export interface LoadingReport {
  monuments: number;
  monumentsMs: number;
  cityMs: number;
  cityTimedOut: boolean;
  totalMs: number;
}

export const LOADING_REPORT_SERVICE = 'session.loading';

/**
 * Installe la préparation de fin de chargement. Retourne la fonction de retrait.
 * À appeler depuis la racine de composition, après le boot (les services de rendu sont publiés).
 */
export function installLoadingGate(ctx: GameContext, options: LoadingGateOptions = {}): () => void {
  if (ctx.headless || !ctx.view) return () => {};
  const maxBuildMs = options.maxBuildMs ?? 60000;
  const sliceMs = options.sliceMs ?? 45;
  const maxMonuments = options.maxMonuments ?? 8;
  const event: LoadingProgress = { progress: 0, label: '' };
  const report: LoadingReport = { monuments: 0, monumentsMs: 0, cityMs: 0, cityTimedOut: false, totalMs: 0 };
  ctx.provide<LoadingReport>(LOADING_REPORT_SERVICE, report);
  const emit = (progress: number, label: string): void => {
    event.progress = progress;
    event.label = label;
    ctx.events.emitAny(UI_LOADING_EVENT, event);
  };

  const prepare = async (config: SessionConfig): Promise<void> => {
    const t0 = now();
    const x = ctx.player.person()?.x ?? config.x ?? 0;
    const z = ctx.player.person()?.z ?? config.z ?? 0;
    const quality = ctx.view ? ctx.view.quality : 'moyen';
    const detailBase = quality === 'bas' ? 160 : quality === 'moyen' ? 230 : quality === 'haut' ? 310 : 420;

    // 1. monuments proches : ceux qui seront affichés en détail dès la première image
    const monuments = ctx.service<MonumentsApi>('monuments');
    report.monuments = 0;
    if (monuments) {
      emit(0.58, 'Monuments');
      const near: { key: string; d: number }[] = [];
      const seen = new Set<string>();
      for (const lm of ctx.world.landmarks) {
        if (seen.has(lm.key) || !monuments.has(lm.key)) continue;
        const d = Math.hypot(lm.x - x, lm.z - z);
        if (d < detailBase + 2.5 * lm.height + 60) {
          seen.add(lm.key);
          near.push({ key: lm.key, d });
        }
      }
      near.sort((a, b) => a.d - b.d);
      const count = Math.min(near.length, maxMonuments);
      for (let i = 0; i < count; i++) {
        monuments.prewarm([near[i]!.key]);
        report.monuments++;
        emit(0.58 + 0.1 * ((i + 1) / count), 'Monuments');
        await nextFrame();
      }
    }
    report.monumentsMs = now() - t0;

    // 2. la ville autour de la caméra (la caméra est déjà sur le joueur : deux images pour remplir la file)
    const t1 = now();
    const city = ctx.service<WorldViewApi>('world.view');
    report.cityTimedOut = false;
    if (city) {
      emit(0.68, 'Construction de la ville');
      await nextFrame();
      await nextFrame();
      let total = Math.max(1, city.pending());
      while (city.pending() > 0) {
        if (now() - t1 > maxBuildMs) {
          report.cityTimedOut = true;
          console.warn(`[session] la ville n'est pas entièrement construite après ${Math.round(maxBuildMs / 1000)} s : la session démarre, le reste arrive en jeu`);
          break;
        }
        city.flush(sliceMs);
        const left = city.pending();
        if (left > total) total = left;
        emit(0.68 + 0.27 * (1 - left / total), 'Construction de la ville');
        await nextFrame();
      }
    }
    report.cityMs = now() - t1;

    // 3. quelques images pour compiler les shaders avant de lever l'écran
    emit(0.97, 'Derniers préparatifs');
    await nextFrame();
    await nextFrame();
    await nextFrame();
    emit(1, 'Prêt');
    report.totalMs = now() - t0;
  };

  return getCore(ctx).session.addPreparation(prepare);
}
