/* =====================================================================================
 * HUD — marqueurs 3D projetés à l'écran (seulement si ctx.view existe et si Settings.hudMarkers) :
 * objectifs localisés, incident confié au joueur, suspect désigné (incident de type « suspect »).
 * La liste des cibles est relue à 8 Hz ; la projection, par transformation, suit l'image.
 * Hors champ, le marqueur est ramené sur le bord de l'écran.
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { HudSlot, IncidentsApi } from '@/core/extensions';
import { Attr, Flag, Shown, Transform, Txt, h } from '../core/dom';
import { distanceLabel } from '../core/format';
import { touchScale } from './layout';
import type { HudEnv, HudPart, HudState } from './types';

export const MAX_MARKERS = 6;

export interface Projected {
  x: number;
  y: number;
  /** Devant la caméra. */
  front: boolean;
}

/**
 * Projette un point du monde à l'écran avec les matrices d'une caméra en perspective (tableaux
 * de 16 nombres, colonnes d'abord, comme THREE.Matrix4.elements) : `view` = matrixWorldInverse,
 * `proj` = projectionMatrix. Fonction pure.
 */
export function projectPoint(
  view: ArrayLike<number>, proj: ArrayLike<number>, x: number, y: number, z: number, width: number, height: number, out: Projected,
): Projected {
  const vx = view[0]! * x + view[4]! * y + view[8]! * z + view[12]!;
  const vy = view[1]! * x + view[5]! * y + view[9]! * z + view[13]!;
  const vz = view[2]! * x + view[6]! * y + view[10]! * z + view[14]!;
  const vw = view[3]! * x + view[7]! * y + view[11]! * z + view[15]!;
  const cx = proj[0]! * vx + proj[4]! * vy + proj[8]! * vz + proj[12]! * vw;
  const cy = proj[1]! * vx + proj[5]! * vy + proj[9]! * vz + proj[13]! * vw;
  const cw = proj[3]! * vx + proj[7]! * vy + proj[11]! * vz + proj[15]! * vw;
  const front = cw > 1e-4;
  // derrière la caméra, diviser par |w| garde le bon côté : une cible derrière à droite reste à droite
  const w = front ? cw : Math.max(1e-4, -cw);
  const nx = cx / w;
  const ny = cy / w;
  out.x = (nx * 0.5 + 0.5) * width;
  out.y = (-ny * 0.5 + 0.5) * height;
  out.front = front;
  return out;
}

/** Ramène un point dans le cadre (marge en px) ; true s'il a fallu le ramener. */
export interface FrameMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function clampToFrame(p: Projected, width: number, height: number, m: FrameMargins): boolean {
  const cx = width * 0.5;
  const cy = height * 0.5;
  let dx = p.x - cx;
  let dy = p.y - cy;
  const inside = p.front && p.x >= m.left && p.x <= width - m.right && p.y >= m.top && p.y <= height - m.bottom;
  if (inside) return false;
  if (!p.front && Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; // exactement derrière : vers le bas
  // prolonge la direction (depuis le centre de l'écran) jusqu'au bord du cadre
  let scale = Infinity;
  if (dx < 0) scale = Math.min(scale, (cx - m.left) / -dx);
  else if (dx > 0) scale = Math.min(scale, (cx - m.right) / dx);
  if (dy < 0) scale = Math.min(scale, (cy - m.top) / -dy);
  else if (dy > 0) scale = Math.min(scale, (cy - m.bottom) / dy);
  if (!Number.isFinite(scale)) scale = 0;
  dx *= scale;
  dy *= scale;
  p.x = cx + dx;
  p.y = cy + dy;
  return true;
}

interface Target {
  kind: 'objectif' | 'objectif2' | 'incident' | 'suspect';
  label: string;
  x: number;
  z: number;
  /** Personne suivie (suspect) : sa position est relue à chaque image. */
  personId: number;
}

interface View {
  el: HTMLElement;
  move: Transform;
  shown: Shown;
  kind: Attr;
  edge: Flag;
  label: Txt;
}

export function createMarkers(env: HudEnv): HudPart {
  const ctx: GameContext = env.ctx;
  const root = h('div', 'hud-markers');
  const views: View[] = [];
  for (let i = 0; i < MAX_MARKERS; i++) {
    const m = h('div', 'hud-marker');
    m.hidden = true;
    const label = h('span', 'hud-marker__label');
    m.append(h('span', 'hud-marker__pin'), label);
    root.append(m);
    views.push({ el: m, move: new Transform(m), shown: new Shown(m), kind: new Attr(m, 'data-kind'), edge: new Flag(m, 'is-edge'), label: new Txt(label) });
  }
  const targets: Target[] = [];
  let count = 0;
  const projected: Projected = { x: 0, y: 0, front: true };
  const margins: FrameMargins = { left: 44, right: 44, top: 110, bottom: 130 };

  function target(i: number): Target {
    return targets[i] ?? (targets[i] = { kind: 'objectif', label: '', x: 0, z: 0, personId: 0 });
  }

  return {
    id: 'markers',
    el: root,
    order: 0,
    slot(): HudSlot | null {
      return null;
    },
    visible(s: HudState): boolean {
      return ctx.view !== null && ctx.settings.values.hudMarkers && s.camera !== 'tactical';
    },
    tick(s: HudState): void {
      count = 0;
      const store = env.objectives;
      for (let i = 0; i < store.list.length && count < MAX_MARKERS - 2; i++) {
        const o = store.list[i]!;
        if (o.state !== 'actif' || o.x === undefined || o.z === undefined) continue;
        const t = target(count++);
        t.kind = o.id === store.tracked ? 'objectif' : 'objectif2';
        t.x = o.x;
        t.z = o.z;
        t.personId = 0;
        t.label = distanceLabel(Math.hypot(o.x - s.x, o.z - s.z));
      }
      const incidents = ctx.service<IncidentsApi>(EXT.incidents);
      if (incidents) {
        const mine = incidents.playerIncidentId !== 0 ? incidents.get(incidents.playerIncidentId) : undefined;
        if (mine && count < MAX_MARKERS) {
          const t = target(count++);
          t.kind = mine.kind === 'suspect' ? 'suspect' : 'incident';
          t.x = mine.x;
          t.z = mine.z;
          t.personId = mine.targetKind === 'person' ? mine.targetId : 0;
          t.label = `${mine.label} · ${distanceLabel(Math.hypot(mine.x - s.x, mine.z - s.z))}`;
        }
        const list = incidents.list;
        for (let i = 0; i < list.length && count < MAX_MARKERS; i++) {
          const inc = list[i]!;
          if (inc.kind !== 'suspect' || inc === mine) continue;
          if (inc.state === 'resolu' || inc.state === 'echoue') continue;
          const t = target(count++);
          t.kind = 'suspect';
          t.x = inc.x;
          t.z = inc.z;
          t.personId = inc.targetKind === 'person' ? inc.targetId : 0;
          t.label = `Suspect · ${distanceLabel(Math.hypot(inc.x - s.x, inc.z - s.z))}`;
        }
      }
      for (let i = 0; i < MAX_MARKERS; i++) {
        const v = views[i]!;
        v.shown.set(i < count);
        if (i < count) {
          v.kind.set(targets[i]!.kind);
          v.label.set(targets[i]!.label);
        }
      }
    },
    frame(_dt: number, s: HudState): void {
      const view = ctx.view;
      if (!view || count === 0) return;
      const cam = view.camera;
      const viewM = cam.matrixWorldInverse.elements;
      const projM = cam.projectionMatrix.elements;
      // cadre utile : hors des panneaux du HUD et, en tactile, hors des commandes à l'écran
      const compact = s.compact;
      if (s.touch === 'none') {
        // le repère est dessiné 30 px au-dessus du point projeté : la marge haute en tient compte
        margins.left = margins.right = compact ? 30 : 44;
        margins.top = compact ? 124 : 150;
        margins.bottom = compact ? 96 : 130;
      } else {
        const ts = touchScale(s.width, s.height);
        margins.left = 176 * ts;
        margins.right = (s.touch === 'vehicule' ? 290 : 214) * ts;
        margins.top = 124 * ts + 30;
        margins.bottom = 80 * ts;
      }
      for (let i = 0; i < count; i++) {
        const t = targets[i]!;
        let x = t.x;
        let z = t.z;
        if (t.personId !== 0) {
          const person = ctx.people.get(t.personId);
          if (person) {
            x = person.x;
            z = person.z;
          }
        }
        const y = ctx.world.heightAt(x, z) + (t.personId !== 0 ? 2.25 : 2.6);
        projectPoint(viewM, projM, x, y, z, s.width, s.height, projected);
        const edge = clampToFrame(projected, s.width, s.height, margins);
        const v = views[i]!;
        v.edge.set(edge);
        v.move.set(`translate3d(${projected.x.toFixed(1)}px,${projected.y.toFixed(1)}px,0)`);
      }
    },
    reset(): void {
      count = 0;
      for (const v of views) v.shown.set(false);
    },
  };
}
