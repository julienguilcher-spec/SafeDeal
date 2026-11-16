/* =====================================================================================
 * Sauvegarde complète en fichier : export (téléchargement d'un fichier JSON) et import (choix d'un
 * fichier). Partagé par l'écran des paramètres (onglet « Sauvegarde ») et l'écran « historique ».
 * Dans l'application de bureau, le téléchargement ouvre la boîte « Enregistrer sous » du système.
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';

/** Nom proposé pour le fichier exporté (date du jour incluse : plusieurs exports ne s'écrasent pas). */
export function saveFileName(now: Date = new Date()): string {
  const p = (n: number): string => (n < 10 ? '0' : '') + n;
  return `crs-simulation-france-sauvegarde-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/**
 * Télécharge la sauvegarde complète (ctx.save.exportAll) dans un fichier JSON.
 * Retourne le texte exporté et si le téléchargement a pu être lancé.
 */
export function downloadSave(ctx: Pick<GameContext, 'save'>): { json: string; downloaded: boolean } {
  const json = ctx.save.exportAll();
  let downloaded = false;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saveFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    downloaded = true;
  } catch {
    downloaded = false;
  }
  return { json, downloaded };
}

/**
 * Fait choisir un fichier de sauvegarde, puis appelle `onText` avec son contenu (ou `onError` s'il est
 * illisible). L'élément de choix est posé, caché, dans `host` le temps du choix.
 */
export function pickSaveFile(host: HTMLElement, onText: (text: string) => void, onError: () => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    f.text().then(onText).catch(onError);
  });
  host.appendChild(input);
  input.click();
}
