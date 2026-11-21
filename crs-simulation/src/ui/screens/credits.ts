/* =====================================================================================
 * Écran « credits » : le jeu, les données cartographiques (ctx.world.attribution), les
 * composants libres utilisés, et l'avertissement sur la fiction.
 * ===================================================================================== */

import { version } from '../../../package.json';
import type { ScreenInstance } from '@/core/extensions';
import { el, h } from '../core/dom';
import type { UiEnv } from '../core/kit';

/** Mention affichée quand le monde ne fournit pas la sienne (carte non chargée). */
export const DEFAULT_ATTRIBUTION =
  '© les contributeurs d’OpenStreetMap (ODbL) ; IGN ; Ville de Paris — Paris Data ; Apur ; Île-de-France Mobilités. Base dérivée distribuée sous licence ODbL 1.0.';

export function createCredits(env: UiEnv): (host: HTMLElement) => ScreenInstance {
  const { ctx, widgets } = env;
  return (host: HTMLElement): ScreenInstance => {
    const wrap = h('div', 'ui-window-wrap');
    const win = h('div', 'ui-panel ui-panel--flag ui-window ui-window--narrow');
    win.setAttribute('aria-label', 'Crédits');
    const close = widgets.button('Retour', () => ctx.ui.close('credits'), 'secondary', 'back');
    close.dataset.id = 'credits-retour';
    close.setAttribute('data-autofocus', '');
    const head = el('div', 'ui-window__head', h('h2', 'ui-title', 'Crédits'), close);
    const body = h('div', 'ui-credits ui-scroll');
    body.tabIndex = -1;

    const section = (title: string, ...paragraphs: (string | HTMLElement)[]): void => {
      const box = h('div');
      box.append(h('h3', undefined, title));
      for (const p of paragraphs) box.append(typeof p === 'string' ? h('p', undefined, p) : p);
      body.append(box);
    };
    const intro = h('p');
    intro.append(h('b', undefined, 'CRS Simulation France'), ` — version ${version}. Simulation de maintien de l’ordre en monde ouvert dans le cœur de Paris, où chaque rôle est jouable.`);
    section('Le jeu', intro);

    const attribution = (ctx.world.attribution || '').trim() || DEFAULT_ATTRIBUTION;
    const map = h('p');
    map.dataset.id = 'attribution';
    map.textContent = attribution;
    section('Données cartographiques', 'Le plan des rues, le bâti, le relief et les lieux proviennent de sources ouvertes :', map);

    section(
      'Technique',
      'Rendu 3D : Three.js (licence MIT). Outils : TypeScript, Vite, Vitest. Géométries, textures et sons sont générés par le programme : le jeu ne contient aucune image ni aucun son enregistré.',
    );
    section(
      'Avertissement',
      'Ceci est une œuvre de fiction, sans parti pris. Les organisations, mouvements, enseignes et personnes représentés sont fictifs ; toute ressemblance avec des personnes réelles serait fortuite. Les noms de rues, de places, de monuments et d’institutions publiques sont réels.',
      'Les règles d’emploi de la force s’inspirent des textes publics en vigueur ; les valeurs de jeu sont des estimations, non une référence juridique.',
    );
    win.append(head, body);
    wrap.append(win);
    host.append(wrap);

    return {
      dispose(): void {
        wrap.remove();
      },
    };
  };
}
