/* =====================================================================================
 * Écran « pause » : reprendre, paramètres, recommencer, terminer la mission, quitter vers l'accueil.
 * À droite : objectifs en cours et rappel des commandes du périphérique utilisé.
 * ===================================================================================== */

import { toggleFullscreen } from '../core/fullscreen';
import type { Button } from '@/core/contracts';
import type { ScreenInstance } from '@/core/extensions';
import type { InputLabelsApi, InputPointerApi } from '@/input/api';
import { clear, el, h } from '../core/dom';
import { capitalize, hourLabel, stopwatch } from '../core/format';
import type { UiEnv } from '../core/kit';
import { sortObjectives } from '../hud/objectives';

const KEY_ROWS: readonly { label: string; button: Button }[] = [
  { label: 'Sprint (tenir) · avance tenue : course', button: 'sprint' },
  { label: 'Marcher / trottiner', button: 'jog' },
  { label: 'Interagir', button: 'interact' },
  { label: 'Action principale', button: 'primary' },
  { label: 'Viser, lever le bouclier', button: 'secondary' },
  { label: 'Radio', button: 'radio' },
  { label: 'Ordres', button: 'orders' },
  { label: 'Carte', button: 'map' },
  { label: 'Carte tactique', button: 'tactical' },
  { label: 'Changer de caméra', button: 'camera' },
  { label: 'Avance rapide', button: 'fast_forward' },
];

export function createPause(env: UiEnv): (host: HTMLElement) => ScreenInstance {
  const { ctx, widgets } = env;
  return (host: HTMLElement): ScreenInstance => {
    const root = h('div', 'ui-pause');
    const menu = h('div', 'ui-panel ui-panel--flag ui-pause__menu');
    menu.setAttribute('aria-label', 'Pause');
    const config = ctx.session.config;
    const place = config ? capitalize(config.place || ctx.world.sectorName(config.x ?? 0, config.z ?? 0) || 'Paris') : 'Paris';
    const sub = `${place} · ${hourLabel(ctx.env.state.timeOfDay)} · ${stopwatch(ctx.clock.now)} de jeu`;
    menu.append(el('div', 'ui-pause__head', h('div', 'ui-kicker', 'Partie en pause'), h('h2', 'ui-title', 'Pause'), h('p', 'ui-sub', sub)));

    const resume = (): void => {
      ctx.ui.close('pause');
      // la capture de la souris doit être redemandée depuis un geste du joueur
      ctx.service<InputPointerApi>('input.pointer')?.request();
    };
    const list = h('div', 'ui-pause__list');
    const b1 = widgets.button('Reprendre', resume, 'primary', 'resume');
    b1.dataset.id = 'pause-reprendre';
    b1.setAttribute('data-autofocus', '');
    const b2 = widgets.button('Paramètres', () => ctx.ui.open('parametres'), 'secondary', 'gear');
    b2.dataset.id = 'pause-parametres';
    const bfs = widgets.button('Plein écran', () => {
      void toggleFullscreen().then((ok) => { if (!ok) ctx.ui.notify('Plein écran indisponible ici : F11 sur PC, ou ouvrez le jeu dans un onglet à part depuis l’accueil.', 'warn', 6); });
    }, 'secondary', 'fullscreen');
    bfs.dataset.id = 'pause-plein-ecran';
    const b3 = widgets.button('Recommencer', () => {
      widgets.confirm(host, {
        title: 'Recommencer la partie ?',
        text: 'La partie reprend du début avec les mêmes réglages. La progression en cours est perdue.',
        confirm: 'Recommencer',
        onConfirm: () => {
          const cfg = ctx.session.config;
          if (!cfg) return;
          ctx.session.start({ ...cfg }).catch((err: unknown) => {
            console.error('[ui] redémarrage impossible', err);
            ctx.ui.notify('La partie n’a pas pu être relancée.', 'alert');
          });
        },
      });
    }, 'secondary', 'restart');
    b3.dataset.id = 'pause-recommencer';
    const b4 = widgets.button('Terminer et voir le compte rendu', () => {
      widgets.confirm(host, {
        title: 'Terminer la mission ?',
        text: 'La partie s’arrête ici et le compte rendu d’opération est établi sur ce qui a été fait.',
        confirm: 'Terminer',
        onConfirm: () => ctx.session.end(true),
      });
    }, 'secondary', 'flag');
    b4.dataset.id = 'pause-terminer';
    const b5 = widgets.button('Quitter vers l’accueil', () => {
      widgets.confirm(host, {
        title: 'Quitter vers l’accueil ?',
        text: 'La partie en cours est abandonnée, sans compte rendu.',
        confirm: 'Quitter',
        danger: true,
        onConfirm: () => ctx.session.end(false),
      });
    }, 'danger', 'exit');
    b5.dataset.id = 'pause-quitter';
    // Carte tactique : accessible d'ici aussi — à la manette aucun bouton ne lui est réservé (BRIEF : la carte
    // tactique doit être utilisable à la souris, à la manette et au doigt).
    const buttons: HTMLButtonElement[] = [b1];
    if (env.screens.has('carte_tactique')) {
      const bt = widgets.button('Carte tactique', () => {
        ctx.ui.close('pause');
        ctx.ui.open('carte_tactique');
      }, 'secondary', 'target');
      bt.dataset.id = 'pause-tactique';
      buttons.push(bt);
    }
    buttons.push(bfs, b2, b3, b4, b5);
    list.append(...buttons);
    for (const b of buttons) b.classList.add('ui-btn--block');
    menu.append(list);

    // ── côté : objectifs et commandes ──
    const side = h('div', 'ui-panel ui-pause__side ui-scroll');
    const objectives = sortObjectives(env.objectives.list);
    if (objectives.length > 0) {
      side.append(h('div', 'ui-kicker', 'Objectifs'));
      const ol = h('div', 'ui-objlist');
      for (const o of objectives.slice(0, 6)) {
        const row = el('div', 'ui-objlist__row', h('span', 'ui-objlist__dot'), h('span', undefined, o.text));
        if (o.state === 'reussi') row.classList.add('is-done');
        if (o.state === 'echoue') row.classList.add('is-failed');
        if (o.secondary) row.classList.add('is-secondary');
        ol.append(row);
      }
      side.append(ol);
    }
    const keysTitle = h('div', 'ui-kicker', 'Commandes');
    const keys = h('div', 'ui-keys');
    side.append(keysTitle, keys);
    let labelVersion = -2;
    let device = '';
    const paintKeys = (): void => {
      clear(keys);
      const touch = ctx.input.device === 'touch';
      for (const r of KEY_ROWS) {
        const label = env.keyLabel(r.button);
        if (!label) continue;
        const key = h('span', 'ui-key', label);
        keys.append(h('span', undefined, r.label), key);
      }
      keysTitle.textContent = touch ? 'Boutons à l’écran' : ctx.input.device === 'gamepad' ? 'Commandes — manette' : 'Commandes — clavier et souris';
    };
    paintKeys();
    root.append(el('div', 'ui-pause__inner', menu, side));
    host.append(root);

    return {
      update(): void {
        const labels = ctx.service<InputLabelsApi>('input.labels');
        const v = labels ? labels.version : -1;
        if (v !== labelVersion || ctx.input.device !== device) {
          labelVersion = v;
          device = ctx.input.device;
          paintKeys();
        }
      },
      back(): boolean {
        resume();
        return true;
      },
      dispose(): void {
        root.remove();
      },
    };
  };
}
