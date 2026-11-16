/* =====================================================================================
 * HUD — objectifs (service EXT.objectives). Zone : haut droite (liste) ; sur écran bas, une seule
 * ligne sous la boussole (objectif suivi + compteur). La liste n'est reconstruite que lorsque le
 * service change de version ; seules les distances sont rafraîchies ensuite.
 * ===================================================================================== */

import type { HudSlot, Objective } from '@/core/extensions';
import { Txt, clear, h } from '../core/dom';
import { distanceLabel } from '../core/format';
import type { HudEnv, HudPart, HudState } from './types';

/** Lignes affichées au plus dans la liste. */
export const MAX_OBJECTIVE_ROWS = 5;

/** Ordre d'affichage : principaux actifs, secondaires actifs, puis objectifs clos. */
export function sortObjectives(list: readonly Objective[]): Objective[] {
  const rank = (o: Objective): number => (o.state === 'actif' ? (o.secondary ? 1 : 0) : 2);
  return list.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i).map((x) => x.o);
}

export function createObjectivesPart(env: HudEnv): HudPart {
  const store = env.objectives;
  const root = h('div', 'hud-objw');
  const full = h('div', 'hud-box hud-obj');
  const line = h('div', 'hud-box hud-obj1');
  const lineText = h('span', 'hud-obj1__text');
  const lineMeta = h('span', 'hud-obj1__meta');
  line.append(h('span', 'hud-obj1__dot'), lineText, lineMeta);
  root.append(full, line);

  const lineTextB = new Txt(lineText);
  const lineMetaB = new Txt(lineMeta);
  let version = -1;
  let compact: boolean | null = null;
  /** Distances de la liste : objectif et liaison de texte. */
  let dists: { o: Objective; txt: Txt }[] = [];
  let lineTarget: Objective | null = null;
  let activeCount = 0;
  let ticks = 0;

  function rebuild(): void {
    clear(full);
    dists = [];
    const sorted = sortObjectives(store.list);
    activeCount = 0;
    for (const o of store.list) if (o.state === 'actif') activeCount++;
    const title = h('div', 'hud-obj__title');
    title.append(h('span', 'hud-cap', 'Objectifs'), h('span', 'hud-cap', `${store.list.length - activeCount}/${store.list.length}`));
    full.append(title);
    const shown = sorted.slice(0, MAX_OBJECTIVE_ROWS);
    for (const o of shown) {
      const row = h('div', 'hud-obj__row');
      if (o.state === 'reussi') row.classList.add('is-done');
      if (o.state === 'echoue') row.classList.add('is-failed');
      if (o.secondary) row.classList.add('is-secondary');
      const isTracked = o.id === store.tracked && o.state === 'actif';
      if (isTracked) row.classList.add('is-tracked');
      const distEl = h('span', 'hud-obj__dist');
      row.append(h('span', 'hud-obj__state'), h('span', 'hud-obj__text', o.text), distEl);
      if (o.state === 'actif' && o.x !== undefined && o.z !== undefined) dists.push({ o, txt: new Txt(distEl) });
      if (o.state === 'actif' && o.progress !== undefined) {
        const bar = h('div', 'hud-obj__bar');
        const fill = h('i');
        fill.style.transform = `scaleX(${o.progress.toFixed(3)})`;
        bar.append(fill);
        row.append(bar);
      }
      full.append(row);
    }
    if (sorted.length > shown.length) {
      const more = sorted.length - shown.length;
      full.append(h('div', 'hud-obj__more', more > 1 ? `+ ${more} autres` : '+ 1 autre'));
    }
    // ligne unique : objectif suivi, sinon premier objectif actif
    lineTarget = null;
    for (const o of sorted) {
      if (o.state !== 'actif') continue;
      if (!lineTarget) lineTarget = o;
      if (o.id === store.tracked) {
        lineTarget = o;
        break;
      }
    }
    lineTextB.set(lineTarget ? lineTarget.text : 'Objectifs remplis');
  }

  function distances(s: HudState): void {
    for (const d of dists) d.txt.set(distanceLabel(Math.hypot(d.o.x! - s.x, d.o.z! - s.z)));
    let meta = '';
    if (lineTarget && lineTarget.x !== undefined && lineTarget.z !== undefined) {
      meta = distanceLabel(Math.hypot(lineTarget.x - s.x, lineTarget.z - s.z));
    }
    if (activeCount > 1) meta += (meta ? ' · ' : '') + `+${activeCount - 1}`;
    lineMetaB.set(meta);
  }

  return {
    id: 'objectives',
    el: root,
    order: 20,
    slot(s: HudState): HudSlot {
      return s.compact ? 'top' : 'top-right';
    },
    visible(s: HudState): boolean {
      return s.profile.objectives && store.list.length > 0;
    },
    tick(s: HudState): void {
      if (compact !== s.compact) {
        compact = s.compact;
        full.hidden = compact;
        line.hidden = !compact;
      }
      if (version !== store.version) {
        version = store.version;
        rebuild();
        distances(s);
      } else if (ticks % 4 === 0) {
        distances(s);
      }
      ticks++;
    },
    reset(): void {
      version = -1;
    },
  };
}
