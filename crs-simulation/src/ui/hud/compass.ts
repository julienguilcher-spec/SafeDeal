/* =====================================================================================
 * HUD — boussole : ruban gradué (cap du regard), cap chiffré, secteur (ctx.world.sectorName),
 * vent, et repères des objectifs localisés et de l'incident confié au joueur. Zone : haut centre.
 * Le ruban et les repères ne bougent que par transformation.
 * ===================================================================================== */

import { compassBearing } from '@/core/math';
import { EXT } from '@/core/extensions';
import type { HudSlot, IncidentsApi } from '@/core/extensions';
import { Flag, Shown, Transform, Txt, h } from '../core/dom';
import { capitalize, cardinal8 } from '../core/format';
import { icon } from '../core/icons';
import { compassMarkerOffset, relativeBearing } from './model';
import type { HudEnv, HudPart, HudState } from './types';

/** Pixels du ruban par degré (une graduation tous les 15° = 45 px, voir .hud-compass__strip). */
const PX_PER_DEG = 3;
const MAX_MARKS = 5;
const LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

interface Mark {
  x: number;
  z: number;
  tracked: boolean;
  alert: boolean;
}

export function createCompass(env: HudEnv): HudPart {
  const ctx = env.ctx;
  const root = h('div', 'hud-compass');
  const win = h('div', 'hud-compass__win');
  const strip = h('div', 'hud-compass__strip');
  strip.style.width = 720 * PX_PER_DEG + 'px';
  // deux tours (de −180° à 540°) : le ruban couvre toujours la fenêtre, quel que soit le cap
  for (let deg = -180; deg <= 540; deg += 45) {
    const i = (((deg % 360) + 360) % 360) / 45;
    const label = h('span', i === 0 ? 'is-n' : i % 2 === 1 ? 'is-minor' : undefined, LABELS[i]);
    label.style.left = (deg + 180) * PX_PER_DEG + 'px';
    strip.append(label);
  }
  win.append(strip);
  const markEls: HTMLElement[] = [];
  const markMove: Transform[] = [];
  const markShown: Shown[] = [];
  const markTracked: Flag[] = [];
  const markAlert: Flag[] = [];
  const markEdge: Flag[] = [];
  for (let i = 0; i < MAX_MARKS; i++) {
    const m = h('div', 'hud-compass__mark');
    m.hidden = true;
    win.append(m);
    markEls.push(m);
    markMove.push(new Transform(m));
    markShown.push(new Shown(m));
    markTracked.push(new Flag(m, 'is-tracked'));
    markAlert.push(new Flag(m, 'is-alert'));
    markEdge.push(new Flag(m, 'is-edge'));
  }
  win.append(h('div', 'hud-compass__caret'));

  const info = h('div', 'hud-compass__info');
  const headEl = h('span', 'hud-compass__head');
  const sectorEl = h('span', 'hud-compass__sector');
  const windEl = h('span', 'hud-compass__wind');
  const windArrow = icon('arrow_up', 'hud-ic');
  const windText = h('span');
  windEl.append(windArrow, windText);
  info.append(headEl, sectorEl, windEl);
  root.append(win, info);

  const stripMove = new Transform(strip);
  const head = new Txt(headEl);
  const sector = new Txt(sectorEl);
  const wind = new Txt(windText);
  const windShown = new Shown(windEl);
  const windRot = new Transform(windArrow);
  const marks: Mark[] = [];
  let markCount = 0;
  let ticks = 0;
  let lastBearing = -999;
  let lastHalf = 0;

  return {
    id: 'compass',
    el: root,
    order: 10,
    slot(): HudSlot {
      return 'top';
    },
    visible(s: HudState): boolean {
      return s.profile.compass;
    },
    tick(s: HudState): void {
      const bearing = compassBearing(s.yaw);
      const rounded = Math.round(bearing) % 360;
      head.set(`${rounded}° ${cardinal8(bearing)}`);
      // secteur : deux fois par seconde suffisent
      if (ticks++ % 4 === 0) sector.set(capitalize(ctx.world.sectorName(s.x, s.z) || ''));

      const e = ctx.env.state;
      const speed = Math.hypot(e.windX, e.windZ) * 3.6;
      windShown.set(speed >= 1);
      if (speed >= 1) {
        wind.set(`${Math.round(speed)} km/h`);
        // flèche : sens où va le vent, par rapport au regard (haut de l'écran = droit devant)
        windRot.set(`rotate(${Math.round(relativeBearing(s.yaw, e.windX, e.windZ))}deg)`);
      }

      // repères : objectifs actifs localisés, puis incident confié au joueur
      markCount = 0;
      const list = env.objectives.list;
      const tracked = env.objectives.tracked;
      for (let i = 0; i < list.length && markCount < MAX_MARKS - 1; i++) {
        const o = list[i]!;
        if (o.state !== 'actif' || o.x === undefined || o.z === undefined) continue;
        const m = marks[markCount] ?? (marks[markCount] = { x: 0, z: 0, tracked: false, alert: false });
        m.x = o.x;
        m.z = o.z;
        m.tracked = o.id === tracked;
        m.alert = false;
        markCount++;
      }
      const incidents = ctx.service<IncidentsApi>(EXT.incidents);
      if (incidents && incidents.playerIncidentId !== 0 && markCount < MAX_MARKS) {
        const inc = incidents.get(incidents.playerIncidentId);
        if (inc) {
          const m = marks[markCount] ?? (marks[markCount] = { x: 0, z: 0, tracked: false, alert: false });
          m.x = inc.x;
          m.z = inc.z;
          m.tracked = false;
          m.alert = true;
          markCount++;
        }
      }
      for (let i = 0; i < MAX_MARKS; i++) {
        markShown[i]!.set(i < markCount && ctx.settings.values.hudMarkers);
        if (i < markCount) {
          markTracked[i]!.set(marks[i]!.tracked);
          markAlert[i]!.set(marks[i]!.alert);
        }
      }
    },
    frame(_dt: number, s: HudState): void {
      const half = s.compact ? 120 : 180;
      const bearing = compassBearing(s.yaw);
      if (Math.abs(bearing - lastBearing) > 0.04 || half !== lastHalf) {
        lastBearing = bearing;
        lastHalf = half;
        stripMove.set(`translate3d(${(half - (bearing + 180) * PX_PER_DEG).toFixed(1)}px,0,0)`);
      }
      for (let i = 0; i < markCount; i++) {
        const m = marks[i]!;
        const rel = relativeBearing(s.yaw, m.x - s.x, m.z - s.z);
        const pos = compassMarkerOffset(rel, PX_PER_DEG, half - 8);
        markMove[i]!.set(`translate3d(${(half + pos.x).toFixed(1)}px,0,0)`);
        markEdge[i]!.set(pos.clamped !== 0);
      }
    },
    reset(): void {
      markCount = 0;
      for (let i = 0; i < MAX_MARKS; i++) markShown[i]!.set(false);
      ticks = 0;
    },
  };
}
