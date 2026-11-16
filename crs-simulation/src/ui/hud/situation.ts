/* =====================================================================================
 * HUD — situation (horloge, météo, phase de la manifestation, jauge de tension) et cadre légal
 * (sommations prononcées, niveau de force licite et autorisé — ctx.law.roe). Zone : haut gauche.
 * Les civils ne voient qu'un rappel du droit, et la tension en couleur seulement (dossier 06 §1.5).
 * ===================================================================================== */

import type { WeatherKind } from '@/core/contracts';
import type { PerfApi } from '@/core/game';
import type { HudSlot } from '@/core/extensions';
import { Attr, Flag, Shown, Txt, h } from '../core/dom';
import { hourClock } from '../core/format';
import { iconMarkup, weatherIconName } from '../core/icons';
import { forceLabel, legalReminder, legalState, phaseLabel, tensionSegments, tensionTone } from './model';
import type { HudEnv, HudPart, HudState } from './types';

export function createSituation(env: HudEnv): HudPart {
  const ctx = env.ctx;
  const root = h('div', 'hud-box hud-sit');

  // ligne 1 : heure, météo, phase, tension
  const row1 = h('div', 'hud-sit__row');
  const clockEl = h('span', 'hud-sit__clock');
  const weatherEl = h('span', 'hud-sit__weather');
  const phaseEl = h('span', 'hud-sit__phase');
  const tensionEl = h('span', 'hud-tension');
  tensionEl.setAttribute('role', 'img');
  const segs: Flag[] = [];
  for (let i = 0; i < 5; i++) {
    const seg = h('i');
    tensionEl.append(seg);
    segs.push(new Flag(seg, 'is-on'));
  }
  row1.append(clockEl, weatherEl, h('span', 'hud-sit__sep'), phaseEl, tensionEl);

  // ligne 2 : état des sommations
  const row2 = h('div', 'hud-sit__row hud-legal');
  const legalLabelEl = h('span', 'hud-legal__label');
  const sommEl = h('span', 'hud-somm');
  const sommFlags: Flag[] = [];
  for (let i = 0; i < 3; i++) {
    const pip = h('i');
    sommEl.append(pip);
    sommFlags.push(new Flag(pip, 'is-on'));
  }
  row2.append(h('span', 'hud-legal__dot'), legalLabelEl, sommEl);

  // ligne 3 : niveau de force
  const row3 = h('div', 'hud-sit__row hud-force');
  const pipsEl = h('span', 'hud-force__pips');
  const usable: Flag[] = [];
  const lawful: Flag[] = [];
  for (let i = 0; i < 5; i++) {
    const pip = h('i');
    pipsEl.append(pip);
    usable.push(new Flag(pip, 'is-usable'));
    lawful.push(new Flag(pip, 'is-lawful'));
  }
  const forceLabelEl = h('span', 'hud-force__label');
  const forceNumsEl = h('span', 'hud-force__nums');
  row3.append(h('span', 'hud-cap', 'Force'), pipsEl, forceLabelEl, forceNumsEl);

  // rappel du droit pour les civils
  const row4 = h('div', 'hud-sit__row hud-remind');

  root.append(row1, row2, row3, row4);

  const clock = new Txt(clockEl);
  const phase = new Txt(phaseEl);
  const tone = new Attr(tensionEl, 'data-tone');
  const tensionAria = new Attr(tensionEl, 'aria-label');
  const legalTone = new Attr(row2, 'data-tone');
  const legalLabel = new Txt(legalLabelEl);
  const sommAria = new Attr(sommEl, 'aria-label');
  const forceText = new Txt(forceLabelEl);
  const forceNums = new Txt(forceNumsEl);
  const forceAria = new Attr(row3, 'aria-label');
  const remind = new Txt(row4);
  const showRow2 = new Shown(row2);
  const showRow3 = new Shown(row3);
  const showRow4 = new Shown(row4);
  const phaseNew = new Flag(phaseEl, 'is-new');
  let weatherKey = '';
  let lastPhase = '';
  let flashLeft = 0;

  return {
    id: 'situation',
    el: root,
    order: 10,
    slot(): HudSlot {
      return 'top-left';
    },
    visible(s: HudState): boolean {
      return s.profile.situation;
    },
    tick(s: HudState): void {
      const e = ctx.env.state;
      clock.set(hourClock(e.timeOfDay));
      const weather: WeatherKind = e.weather;
      const key = weather === 'clair' && e.isNight ? 'moon' : weather;
      if (key !== weatherKey) {
        weatherKey = key;
        weatherEl.innerHTML = iconMarkup(key === 'moon' ? 'moon' : weatherIconName(weather), 'hud-ic');
      }

      const d = ctx.director;
      const label = phaseLabel(d.phase);
      if (label !== lastPhase) {
        if (lastPhase !== '') flashLeft = 1.3;
        lastPhase = label;
      }
      phase.set(label);
      // tension locale autour du joueur (repli : tension globale)
      let t = d.tension;
      if (s.person) {
        const local = d.tensionAt(s.x, s.z);
        if (Number.isFinite(local) && local > t) t = local;
      }
      const lit = tensionSegments(t);
      for (let i = 0; i < 5; i++) segs[i]!.set(i < lit);
      tone.set(tensionTone(t));
      tensionAria.set(`Tension : ${lit} sur 5`);

      const roe = ctx.law.roe;
      const mode = s.profile.legal;
      showRow2.set(mode === 'full');
      showRow3.set(mode === 'full');
      if (mode === 'full') {
        const st = legalState(roe);
        legalTone.set(st.tone);
        legalLabel.set(st.label);
        for (let i = 0; i < 3; i++) sommFlags[i]!.set(i < st.sommation);
        sommAria.set(`Sommations prononcées : ${st.sommation} sur 3`);
        for (let i = 0; i < 5; i++) {
          usable[i]!.set(i < st.usable);
          lawful[i]!.set(i < st.lawful);
        }
        forceText.set(forceLabel(st.usable));
        forceNums.set(`licite ${st.lawful} · autorisée ${st.authorized}`);
        forceAria.set(`Force utilisable : ${forceLabel(st.usable)} (niveau licite ${st.lawful} sur 5, niveau autorisé ${st.authorized} sur 5)`);
        showRow4.set(false);
      } else {
        const text = mode === 'reminder' ? legalReminder(roe) : '';
        remind.set(text);
        showRow4.set(text !== '');
      }
    },
    frame(dt: number): void {
      if (flashLeft > 0) {
        flashLeft -= dt;
        phaseNew.set(flashLeft > 0);
      }
    },
    reset(): void {
      lastPhase = '';
      flashLeft = 0;
      phaseNew.set(false);
    },
  };
}

/** Compteur d'images (Settings.showFps), sous la situation. */
export function createFps(env: HudEnv): HudPart {
  const ctx = env.ctx;
  const root = h('div', 'hud-box hud-fps');
  const text = new Txt(root);
  let acc = 0;
  let frames = 0;
  let measured = 0;
  return {
    id: 'fps',
    el: root,
    order: 90,
    slot(): HudSlot {
      return 'top-left';
    },
    visible(): boolean {
      return ctx.settings.values.showFps;
    },
    frame(dt: number): void {
      acc += dt;
      frames++;
      if (acc < 0.5) return;
      measured = frames / acc;
      acc = 0;
      frames = 0;
      const perf = ctx.service<PerfApi>('perf');
      const fps = perf && perf.stats.fps > 0 ? perf.stats.fps : measured;
      text.set(`${Math.round(fps)} images/s`);
    },
  };
}
