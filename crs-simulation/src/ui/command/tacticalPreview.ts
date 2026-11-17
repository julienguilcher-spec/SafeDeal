/* =====================================================================================
 * Carte tactique — aperçus dessinés pendant un geste (fonctions de dessin sans état propre).
 * ===================================================================================== */

import type { RoadSample } from '@/core/contracts';
import { drawBarrageLine, drawNasse, drawOrderArrow, drawTargetMark } from '../maps/overlay-units';
import type { MapTransform } from '../maps/transform';
import type { MapUnit } from '../maps/units';
import type { CommandCore } from './core';
import { BARRER_HINT, MIN_LINE, areaToOrder, lineToOrder } from './orders';
import type { OrderGeom, OrderVerb } from './orders';
import type { TacticalState } from './tacticalState';

/** Geste en cours sur la carte. */
export interface Drag {
  kind: 'order' | 'box' | 'area' | 'incident';
  verb: OrderVerb | null;
  incidentId: number;
  /** Départ et position courante : monde et écran. */
  ax: number; az: number; bx: number; bz: number;
  sx0: number; sy0: number; sx: number; sy: number;
  /** Tracé au bouton secondaire : ligne directe sans passer par la palette. */
  quick: boolean;
}

/** Ce que l'aperçu lit de la carte tactique. */
export interface PreviewSource {
  readonly drag: Drag | null;
  readonly hoverX: number;
  readonly hoverY: number;
  readonly hoverRoad: RoadSample | null;
  selectedUnits(): MapUnit[];
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const EMPTY_UNITS: MapUnit[] = [];
const GEOM: OrderGeom = { x: 0, z: 0, heading: 0, width: 0 };
const SP = { x: 0, y: 0 };

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string): void {
  g.font = `700 11px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 3.5;
  g.lineJoin = 'round';
  g.strokeStyle = '#0b1322';
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/**
 * Aperçus de l'outil en cours, par-dessus les couches : ligne de barrage en cours de tracé (avec sa
 * longueur), nasse et son issue, flèches vers le point désigné, cadre de sélection, rue visée,
 * périmètre, point d'intervention des secours.
 */
export function drawTacticalPreview(
  g: CanvasRenderingContext2D, view: MapTransform, tm: PreviewSource, core: CommandCore, st: TacticalState,
): void {
  const d = tm.drag;
  const mode = st.mode;
  const units = mode.kind === 'order' || (d && d.kind === 'order') ? tm.selectedUnits() : EMPTY_UNITS;
  if (d) {
    if (d.kind === 'box') {
      g.fillStyle = 'rgba(88,166,255,.14)';
      g.strokeStyle = '#9cc4ff';
      g.lineWidth = 1.5;
      g.setLineDash([5, 4]);
      g.fillRect(d.sx0, d.sy0, d.sx - d.sx0, d.sy - d.sy0);
      g.strokeRect(d.sx0, d.sy0, d.sx - d.sx0, d.sy - d.sy0);
      g.setLineDash([]);
    } else if (d.kind === 'incident') {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.setLineDash([6, 5]);
      g.beginPath();
      g.moveTo(d.sx0, d.sy0);
      g.lineTo(d.sx, d.sy);
      g.stroke();
      g.setLineDash([]);
    } else if (d.kind === 'area') {
      if (d.verb) {
        areaToOrder(d.ax, d.az, d.bx, d.bz, GEOM);
        drawNasse(g, view, GEOM.x, GEOM.z, GEOM.heading, GEOM.width, '#ffd60a', true);
        text(g, `Nasse · rayon ${Math.round(GEOM.width / 2)}\u00a0m`, d.sx0, d.sy0, '#ffe680');
      } else {
        const r = Math.max(30, Math.hypot(d.bx - d.ax, d.bz - d.az));
        g.fillStyle = 'rgba(255,59,48,.12)';
        g.strokeStyle = '#ff6a5f';
        g.lineWidth = 2;
        g.setLineDash([7, 5]);
        g.beginPath();
        g.arc(d.sx0, d.sy0, r / view.mpp, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.setLineDash([]);
        text(g, `Périmètre · rayon ${Math.round(r)}\u00a0m`, d.sx0, d.sy0, '#ffb3ad');
      }
    } else if (d.verb) {
      if (d.verb.gesture === 'line') {
        lineToOrder(d.ax, d.az, d.bx, d.bz, GEOM);
        if (GEOM.width >= MIN_LINE) {
          drawBarrageLine(g, view, GEOM.x, GEOM.z, GEOM.heading, GEOM.width, '#ffd60a', false, 3.5);
          view.worldToScreen(GEOM.x, GEOM.z, SP);
          text(g, `${Math.round(GEOM.width)}\u00a0m`, SP.x, SP.y + 16, '#ffe680');
        }
      } else {
        for (let i = 0; i < units.length; i++) {
          view.worldToScreen(units[i]!.x, units[i]!.z, SP);
          drawOrderArrow(g, SP.x, SP.y, d.sx0, d.sy0, '#ffd60a', true);
        }
        drawTargetMark(g, d.sx0, d.sy0, '#ffd60a', 7);
        if (Math.hypot(d.sx - d.sx0, d.sy - d.sy0) > 14) drawOrderArrow(g, d.sx0, d.sy0, d.sx, d.sy, '#ffffff', false);
      }
    }
    return;
  }
  // proposition « Fermer la nasse » en attente : chaque unité, en pointillés, vers l'issue qu'elle barrera
  const nasse = core.nasse;
  if (nasse) {
    for (let i = 0; i < nasse.lines.length; i++) {
      const l = nasse.lines[i]!;
      view.worldToScreen(l.ux, l.uz, SP);
      const ux = SP.x, uy = SP.y;
      view.worldToScreen(l.x, l.z, SP);
      drawOrderArrow(g, ux, uy, SP.x, SP.y, 'rgba(255,214,10,.9)', true);
      drawBarrageLine(g, view, l.x, l.z, l.heading, Math.max(6, l.width), '#ffd60a', true, 3.5);
      text(g, `${l.unit} → ${l.street}`, SP.x, SP.y - 18, '#ffe680');
    }
  }
  if (tm.hoverX < 0) return;
  if (mode.kind === 'order' && (mode.verb.type === 'couper_circulation' || mode.verb.type === 'filtrer') && tm.hoverRoad) {
    // « Barrer la rue » : la rue visée, barrée d'une façade à l'autre
    const r = tm.hoverRoad;
    for (let i = 0; i < units.length; i++) {
      view.worldToScreen(units[i]!.x, units[i]!.z, SP);
      drawOrderArrow(g, SP.x, SP.y, tm.hoverX, tm.hoverY, 'rgba(255,214,10,.75)', true);
    }
    // la barre suit la perpendiculaire à la rue : cap de la formation = axe de la rue
    drawBarrageLine(g, view, r.x, r.z, r.heading, Math.max(6, r.width), mode.verb.type === 'filtrer' ? '#34c759' : '#ff3b30', false, 4);
    view.worldToScreen(r.x, r.z, SP);
    text(g, `${r.name || 'Voie sans nom'} — ${mode.verb.type === 'filtrer' ? 'une porte, sortie une à une' : BARRER_HINT.toLowerCase()}`, SP.x, SP.y - 20, '#ffffff');
  } else if (mode.kind === 'order' && mode.verb.gesture !== 'immediate') {
    for (let i = 0; i < units.length; i++) {
      view.worldToScreen(units[i]!.x, units[i]!.z, SP);
      drawOrderArrow(g, SP.x, SP.y, tm.hoverX, tm.hoverY, 'rgba(255,214,10,.75)', true);
    }
    drawTargetMark(g, tm.hoverX, tm.hoverY, '#ffd60a', 7);
  } else if (mode.kind === 'close_road' && tm.hoverRoad) {
    const e = core.ctx.world.edge(tm.hoverRoad.edgeId);
    if (e && e.points && e.points.length >= 4) {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i + 1 < e.points.length; i += 2) {
        view.worldToScreen(e.points[i]!, e.points[i + 1]!, SP);
        if (i === 0) g.moveTo(SP.x, SP.y);
        else g.lineTo(SP.x, SP.y);
      }
      g.lineWidth = Math.max(5, e.width / view.mpp + 2);
      g.strokeStyle = 'rgba(255,59,48,.45)';
      g.stroke();
    }
    view.worldToScreen(tm.hoverRoad.x, tm.hoverRoad.z, SP);
    drawTargetMark(g, SP.x, SP.y, '#ff6a5f', 7);
    text(g, tm.hoverRoad.name || 'Voie sans nom', SP.x, SP.y - 20, '#ffb3ad');
  } else if (mode.kind === 'close_area') {
    g.strokeStyle = '#ff6a5f';
    g.lineWidth = 1.6;
    g.setLineDash([6, 5]);
    g.beginPath();
    g.arc(tm.hoverX, tm.hoverY, 100 / view.mpp, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  } else if (mode.kind === 'rescue') {
    drawTargetMark(g, tm.hoverX, tm.hoverY, mode.rescue === 'pompiers' ? '#ff6259' : '#ffffff', 10);
    text(g, mode.rescue === 'pompiers' ? 'POMPIERS ICI' : 'SAMU ICI', tm.hoverX, tm.hoverY - 24, '#ffffff');
  }
}
