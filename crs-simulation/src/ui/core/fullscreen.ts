/* =====================================================================================
 * Plein écran : bascule de la page entière (API Fullscreen, préfixe WebKit pour Safari).
 * Dans une page intégrée (iframe) dont l'hôte n'autorise pas le plein écran, la demande échoue :
 * on le dit au joueur et on lui propose d'ouvrir le jeu dans un onglet à part.
 * ===================================================================================== */

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/** Le plein écran est-il possible ici ? (faux dans une iframe sans l'autorisation « fullscreen »). */
export function fullscreenAvailable(): boolean {
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  return !!(d.fullscreenEnabled ?? d.webkitFullscreenEnabled);
}

/** Bascule le plein écran. Retourne une promesse résolue à vrai si l'état demandé est atteint. */
export async function toggleFullscreen(): Promise<boolean> {
  const d = document as FsDoc;
  try {
    if (isFullscreen()) {
      if (d.exitFullscreen) await d.exitFullscreen();
      else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
      return true;
    }
    const el = document.documentElement as FsEl;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    // sur téléphone : verrouiller le paysage quand c'est possible
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (orientation && typeof orientation.lock === 'function') orientation.lock('landscape').catch(() => {});
    return isFullscreen();
  } catch {
    return false;
  }
}

/** Le jeu tourne-t-il dans une page intégrée (iframe) ? */
export function embedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Ouvre le jeu dans un onglet à part (seul moyen d'avoir l'écran entier quand l'hôte bloque le plein écran). */
export function openStandalone(): boolean {
  try {
    const w = window.open(window.location.href, '_blank', 'noopener');
    return w !== null;
  } catch {
    return false;
  }
}
