/* =====================================================================================
 * Écran « chargement » : lieu et rôle de la partie, progression réelle (événement libre
 * 'ui:loading' { progress, label }) et conseils tirés de la doctrine. Tant qu'aucun module
 * n'annonce de progression, la barre est en attente (animation), sans pourcentage inventé.
 * ===================================================================================== */

import type { ScreenInstance } from '@/core/extensions';
import { UI_LOADING_EVENT } from '../core/api';
import type { UiLoadingEvent } from '../core/api';
import { Txt, el, h } from '../core/dom';
import { capitalize, hourLabel } from '../core/format';
import type { UiEnv } from '../core/kit';
import { weatherLabel } from './catalog';
import { draftFromConfig, identityLabel } from './scenario';
import { tipsFor } from './tips';

/** Durée d'affichage d'un conseil (s). */
const TIP_TIME = 7;

export function createLoading(env: UiEnv): (host: HTMLElement) => ScreenInstance {
  const { ctx } = env;
  return (host: HTMLElement): ScreenInstance => {
    const config = ctx.session.config;
    const root = h('div', 'ui-full ui-load');
    root.setAttribute('aria-label', 'Chargement');
    root.setAttribute('aria-busy', 'true');
    const box = h('div', 'ui-load__box');
    const place = config && config.place ? capitalize(config.place) : 'Paris';
    let who = '';
    if (config) {
      const d = draftFromConfig(config);
      who = `${identityLabel(d)} · ${hourLabel(config.timeOfDay)} · temps ${weatherLabel(config.weather).toLowerCase()}`;
    }
    const bar = h('div', 'ui-load__bar is-wait');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const fill = h('div', 'ui-load__fill');
    bar.append(fill);
    const labelEl = h('div', 'ui-load__label', 'Préparation du secteur…');
    const tipText = h('p');
    const tip = el('div', 'ui-panel ui-load__tip', h('div', 'ui-kicker', 'À savoir'), tipText);
    box.append(h('span', 'ui-flagline'), h('div', 'ui-kicker', 'CRS Simulation France'), h('h2', 'ui-load__place', place), h('p', 'ui-load__who', who), bar, labelEl, tip);
    root.append(box);
    host.append(root);

    const label = new Txt(labelEl);
    const tips = tipsFor(config ? config.role : null);
    // premier conseil choisi d'après la graine du scénario : pas toujours le même, mais reproductible
    let index = tips.length ? Math.abs(config ? config.seed : 0) % tips.length : 0;
    let tipLeft = TIP_TIME;
    tipText.textContent = tips.length ? tips[index]!.text : '';
    let progress = -1;

    const off = ctx.events.onAny(UI_LOADING_EVENT, (payload) => {
      const e = payload as Partial<UiLoadingEvent> | null;
      if (!e || typeof e !== 'object') return;
      if (typeof e.progress === 'number' && Number.isFinite(e.progress)) {
        const p = e.progress < 0 ? 0 : e.progress > 1 ? 1 : e.progress;
        // la progression ne recule jamais à l'écran
        if (p > progress) {
          progress = p;
          bar.classList.remove('is-wait');
          fill.style.transform = `scaleX(${p.toFixed(3)})`;
          bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        }
      }
      if (typeof e.label === 'string' && e.label) label.set(e.label);
    });

    return {
      update(dt: number): void {
        if (tips.length < 2) return;
        tipLeft -= dt;
        if (tipLeft > 0) return;
        tipLeft = TIP_TIME;
        index = (index + 1) % tips.length;
        tipText.textContent = tips[index]!.text;
      },
      back(): boolean {
        return true; // le chargement ne se ferme pas par un retour arrière
      },
      dispose(): void {
        off();
        root.remove();
      },
    };
  };
}
