/* =====================================================================================
 * Carte de commandement — ce qui est dessiné par-dessus les couches (fonctions de dessin sans état propre) :
 *   - l'aperçu de la ligne surlignée de la fiche (« voir avant d'envoyer ») : rue barrée d'une façade à l'autre, flèches
 *     de Qui avec le mode et le délai, ligne automatique, nasse (chaque unité → sa rue), encerclement, gaz et vent,
 *     secours, trajet depuis un commissariat, étapes légales ①②③ ; anneaux « QUI » sur les unités choisies ;
 *   - le nom du repère visé (« ◎ RUE DE RIVOLI » + « Entrée : que faire ici ? ») ;
 *   - la ligne tracée en deux clics (« Tracer la ligne moi-même ») ;
 *   - les aperçus des gestes experts (glisser une ligne au clic droit, cadre de sélection, glisser un incident sur une
 *     unité) et des modes hérités des panneaux (fermer une rue, un périmètre, appeler les secours).
 * ===================================================================================== */

import type { RoadSample } from '@/core/contracts';
import { LABEL_PRIORITY } from '../maps/labelLayout';
import type { LabelBoard } from '../maps/labelLayout';
import { drawBarrageLine, drawNasse, drawOrderArrow, drawTargetMark } from '../maps/overlay-units';
import type { MapTransform } from '../maps/transform';
import type { MapUnit } from '../maps/units';
import type { CardPreview, Repere } from './cardTypes';
import type { CommandCore } from './core';
import { MIN_LINE, areaToOrder, barrerHint, lineToOrder } from './orders';
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
  /** Aperçu de la ligne surlignée de la fiche (null : aucune fiche, ou ligne sans aperçu). */
  readonly cardPreview: CardPreview | null;
  /** Repère visé (clavier) ou accroché par le pointeur : son nom est écrit en grand. */
  readonly visee: Repere | null;
  /** Ligne tracée en deux clics en cours, et son premier bout (null : pas encore posé). */
  readonly tracing: boolean;
  readonly traceEnds: { ax: number; az: number } | null;
  /** Bout libre du tracé (pointeur, ou curseur du clavier), en pixels ; false s'il n'y en a pas. */
  traceTip(out: { x: number; y: number }): boolean;
  /** Planche des étiquettes de l'image (labelLayout.ts) ; absente : textes écrits sur place. */
  readonly labels?: LabelBoard | null;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const EMPTY_UNITS: MapUnit[] = [];
const GEOM: OrderGeom = { x: 0, z: 0, heading: 0, width: 0 };
const SP = { x: 0, y: 0 };

/** Planche des étiquettes de l'image en cours de dessin (posée par drawTacticalPreview), null sans planche. */
let BOARD: LabelBoard | null = null;

/**
 * Texte de l'aperçu : demandé à la planche (priorité de l'aperçu, au-dessus des étiquettes d'unités et d'ordres, posé à
 * une place libre), ou écrit sur place sans planche.
 */
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, size = 11, priority: number = LABEL_PRIORITY.preview): void {
  if (BOARD) {
    BOARD.text(s, x, y, color, size, 700, priority, 'center', 0);
    return;
  }
  g.font = `700 ${size}px ${FONT}`;
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
  BOARD = tm.labels ?? null;
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
  if (tm.tracing) {
    drawTrace(g, view, tm);
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
  if (mode.kind === 'idle') {
    if (tm.cardPreview) drawCardPreview(g, view, tm.cardPreview);
    // « Entrée : que faire ici ? » seulement au repos : une fiche ouverte dit déjà ce qu'on peut faire
    if (tm.visee) drawViseeLabel(g, view, tm.visee, st.card ? '' : viseeHint(st.lastInput, core.scope().level === 'lecture'));
    return;
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
    text(g, `${r.name || 'Voie sans nom'} — ${mode.verb.type === 'filtrer' ? 'une porte, sortie une à une' : barrerHint(st.passersby).toLowerCase()}`, SP.x, SP.y - 20, '#ffffff');
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

// ───────────────────────────── fiche : aperçu, visée, tracé ─────────────────────────────

const YELLOW = '#ffd60a';
const RED = '#ff3b30';
const GREEN = '#34c759';
const CYAN = '#3ddcff';

/** Seconde ligne sous le nom du repère visé, au repos (la façon d'ouvrir sa fiche) ; '' en lecture seule. */
export function viseeHint(input: 'keys' | 'pointer' | 'touch', readOnly: boolean): string {
  if (readOnly) return '';
  return input === 'touch' ? 'Touchez : que faire ici ?' : input === 'pointer' ? 'Cliquez : que faire ici ?' : 'Entrée : que faire ici ?';
}

/** Libellé de la visée : « ◎ RUE DE RIVOLI ». */
export function viseeTitle(r: Pick<Repere, 'name'>): string {
  return `◎ ${r.name.toLocaleUpperCase('fr-FR')}`;
}

/** Pastille de texte (fond sombre, liseré) centrée en (x, y) ; renvoie sa hauteur. */
function pill(g: CanvasRenderingContext2D, lines: readonly { s: string; size: number; color: string; weight: number }[], x: number, y: number, border: string): number {
  let w = 0;
  let h = 8;
  for (const l of lines) {
    g.font = `${l.weight} ${l.size}px ${FONT}`;
    w = Math.max(w, g.measureText(l.s).width);
    h += l.size + 4;
  }
  w += 18;
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  g.fillStyle = 'rgba(11,19,34,.9)';
  g.strokeStyle = border;
  g.lineWidth = 1.5;
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(x0, y0, w, h, 7);
  else g.rect(x0, y0, w, h);
  g.fill();
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let ly = y0 + 6;
  for (const l of lines) {
    g.font = `${l.weight} ${l.size}px ${FONT}`;
    g.fillStyle = l.color;
    g.fillText(l.s, x, ly + l.size / 2);
    ly += l.size + 4;
  }
  return h;
}

/** Nom du repère visé en grand, au-dessus de lui (au-dessous près du haut de la carte), et un halo sur le repère. */
function drawViseeLabel(g: CanvasRenderingContext2D, view: MapTransform, r: Repere, hint: string): void {
  if (!view.contains(r.x, r.z, 40)) return;
  view.worldToScreen(r.x, r.z, SP);
  const sx = SP.x, sy = SP.y;
  g.strokeStyle = 'rgba(8,14,26,.8)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(sx, sy, 17, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = YELLOW;
  g.lineWidth = 2.5;
  g.stroke();
  const lines = [{ s: viseeTitle(r), size: 14, color: '#ffe680', weight: 800 }];
  if (hint !== '') lines.push({ s: hint, size: 11, color: '#e8eef9', weight: 600 });
  if (BOARD) {
    // la bulle passe avant tout autre texte ; elle cherche une place sans nom de lieu dessous (au-dessus, au-dessous…)
    BOARD.pill(lines, sx, sy, 24, YELLOW, LABEL_PRIORITY.bubble, 'above', true);
    return;
  }
  const h = 8 + lines.reduce((sum, l) => sum + l.size + 4, 0);
  let y = sy - 26 - h / 2;
  if (y - h / 2 < 6) y = sy + 26 + h / 2;
  g.font = `800 14px ${FONT}`;
  const half = Math.min(view.width / 2 - 8, g.measureText(lines[0]!.s).width / 2 + 12);
  const x = Math.max(half + 8, Math.min(view.width - half - 8, sx));
  pill(g, lines, x, y, YELLOW);
}

/** Anneau jaune « QUI » sur une unité choisie pour l'ordre. */
function quiRing(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(8,14,26,.75)';
  g.beginPath();
  g.arc(x, y, 15, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2.5;
  g.strokeStyle = YELLOW;
  g.stroke();
  if (BOARD) BOARD.text('QUI', x, y, '#ffe680', 10, 700, LABEL_PRIORITY.qui, 'above', 15);
  else text(g, 'QUI', x, y - 24, '#ffe680', 10);
}

/** Flèches de Qui vers le point, avec « à pied · 2 min » / « en véhicules · 6 min » au milieu. */
function drawArrows(g: CanvasRenderingContext2D, view: MapTransform, p: CardPreview, color: string): void {
  for (const a of p.arrows) {
    view.worldToScreen(a.fromX, a.fromZ, SP);
    const ax = SP.x, ay = SP.y;
    view.worldToScreen(a.toX, a.toZ, SP);
    const bx = SP.x, by = SP.y;
    drawOrderArrow(g, ax, ay, bx, by, a.vehicles ? CYAN : color, true);
    quiRing(g, ax, ay);
    if (a.text !== '' && Math.hypot(bx - ax, by - ay) > 60) text(g, a.text, (ax + bx) / 2, (ay + by) / 2 - 10, a.vehicles ? '#bdf2ff' : '#ffffff', 11);
  }
}

/** Petit texte sous le point de l'aperçu (« Rue de Rivoli — personne ne passe, dans les deux sens »). */
function previewText(g: CanvasRenderingContext2D, view: MapTransform, p: CardPreview, color: string): void {
  if (p.label === '') return;
  view.worldToScreen(p.x, p.z, SP);
  text(g, p.label, SP.x, SP.y + 28, color, 11.5);
}

/**
 * Aperçu de la ligne surlignée de la fiche (preview.ts le calcule ; ici on ne fait que dessiner, avec les fonctions
 * de dessin des ordres en cours).
 */
export function drawCardPreview(g: CanvasRenderingContext2D, view: MapTransform, p: CardPreview): void {
  switch (p.kind) {
    case 'street': {
      drawArrows(g, view, p, 'rgba(255,214,10,.85)');
      const w = Math.max(6, p.width);
      if (p.filter) drawBarrageLine(g, view, p.x, p.z, p.heading, w, GREEN, false, 4);
      else {
        drawBarrageLine(g, view, p.x, p.z, p.heading, w, RED, false, 4);
        // passants admis (ou barrières seules) : la barre rouge est rayée de vert
        if (p.passersby) drawBarrageLine(g, view, p.x, p.z, p.heading, w, GREEN, true, 2);
      }
      previewText(g, view, p, '#ffffff');
      break;
    }
    case 'line':
      drawArrows(g, view, p, 'rgba(255,214,10,.85)');
      drawBarrageLine(g, view, p.x, p.z, p.heading, Math.max(4, p.width), YELLOW, false, 3.5);
      previewText(g, view, p, '#ffe680');
      break;
    case 'arrows':
    case 'route': {
      const color = p.kind === 'route' ? CYAN : YELLOW;
      drawArrows(g, view, p, color);
      view.worldToScreen(p.x, p.z, SP);
      drawTargetMark(g, SP.x, SP.y, color, 8);
      previewText(g, view, p, '#ffffff');
      break;
    }
    case 'nasse':
      for (const sgm of p.segments) {
        view.worldToScreen(sgm.ax, sgm.az, SP);
        const ax = SP.x, ay = SP.y;
        view.worldToScreen(sgm.bx, sgm.bz, SP);
        drawOrderArrow(g, ax, ay, SP.x, SP.y, 'rgba(255,214,10,.9)', true);
        drawTargetMark(g, SP.x, SP.y, YELLOW, 6);
        quiRing(g, ax, ay);
        text(g, sgm.label, SP.x, SP.y - 16, '#ffe680', 10.5);
      }
      if (p.label !== '') {
        view.worldToScreen(p.x, p.z, SP);
        text(g, p.label, SP.x, SP.y, '#ffffff', 12);
      }
      break;
    case 'circle':
      drawArrows(g, view, p, 'rgba(255,214,10,.85)');
      // un cercle de plus de 40 m est le périmètre d'une fermeture aux voitures (closeArea), pas un encerclement
      if (p.radius > 40) {
        view.worldToScreen(p.x, p.z, SP);
        g.fillStyle = 'rgba(255,59,48,.12)';
        g.strokeStyle = '#ff6a5f';
        g.lineWidth = 2;
        g.setLineDash([7, 5]);
        g.beginPath();
        g.arc(SP.x, SP.y, p.radius / view.mpp, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.setLineDash([]);
        text(g, p.label, SP.x, SP.y, '#ffb3ad', 12);
      } else {
        drawNasse(g, view, p.x, p.z, p.heading, p.radius * 2, '#ff9f43', true);
        previewText(g, view, p, '#ffd1a1');
      }
      break;
    case 'gas':
      drawArrows(g, view, p, 'rgba(255,214,10,.85)');
      drawGas(g, view, p);
      break;
    case 'rescue': {
      view.worldToScreen(p.x, p.z, SP);
      drawTargetMark(g, SP.x, SP.y, p.service === 'pompiers' ? '#ff6259' : '#ffffff', 10);
      text(g, p.label, SP.x, SP.y + 26, '#ffffff', 12);
      break;
    }
    case 'none':
      break;
  }
  drawSteps(g, view, p);
}

/** Gaz : nuage sur le point, et flèche du vent (le nuage dérive dans son sens). */
function drawGas(g: CanvasRenderingContext2D, view: MapTransform, p: CardPreview): void {
  view.worldToScreen(p.x, p.z, SP);
  const cx = SP.x, cy = SP.y;
  const r = Math.max(10, p.radius / view.mpp);
  const wind = p.wind;
  const speed = wind ? Math.hypot(wind.x, wind.z) : 0;
  if (wind && speed > 0.2) {
    // nuage dérivé de 20 s de vent, estompé
    view.worldToScreen(p.x + wind.x * 20, p.z + wind.z * 20, SP);
    g.fillStyle = 'rgba(230,241,246,.12)';
    g.beginPath();
    g.arc(SP.x, SP.y, r * 1.3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(230,241,246,.28)';
  g.strokeStyle = '#e6f1f6';
  g.lineWidth = 2;
  g.setLineDash([5, 4]);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.setLineDash([]);
  if (wind && speed > 0.2) {
    view.worldToScreen(p.x + wind.x, p.z + wind.z, SP);
    let dx = SP.x - cx, dy = SP.y - cy;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const len = r + 26 + Math.min(40, speed * 6);
    drawOrderArrow(g, cx + dx * (r + 4), cy + dy * (r + 4), cx + dx * len, cy + dy * len, '#9fd0ff', false);
    text(g, `vent ${Math.round(speed * 3.6)} km/h`, cx + dx * (len + 18), cy + dy * (len + 18), '#cfe6ff', 11);
  } else {
    text(g, 'vent nul', cx, cy - r - 12, '#cfe6ff', 11);
  }
  text(g, p.label, cx, cy + r + 14, '#ffffff', 11.5);
}

/** Étapes légales ①②③ à droite du point (ligne 🔒). */
function drawSteps(g: CanvasRenderingContext2D, view: MapTransform, p: CardPreview): void {
  if (p.steps.length === 0) return;
  view.worldToScreen(p.x, p.z, SP);
  const lines = p.steps.map((s) => ({ s, size: 11, color: '#ffe0b3', weight: 700 }));
  if (BOARD) {
    BOARD.pill(lines, SP.x, SP.y, 28, '#ff9f43', LABEL_PRIORITY.preview, 'right', false);
    return;
  }
  g.font = `700 11px ${FONT}`;
  let w = 0;
  for (const l of lines) w = Math.max(w, g.measureText(l.s).width);
  const x = Math.min(view.width - w / 2 - 16, SP.x + 40 + w / 2);
  pill(g, lines, x, SP.y, '#ff9f43');
}

const TIP = { x: 0, y: 0 };

/** « Tracer la ligne moi-même » : premier bout posé → la ligne suit le pointeur (ou le curseur), avec sa longueur. */
function drawTrace(g: CanvasRenderingContext2D, view: MapTransform, tm: PreviewSource): void {
  const a = tm.traceEnds;
  const tip = tm.traceTip(TIP);
  if (!a) {
    if (tip) {
      drawTargetMark(g, TIP.x, TIP.y, YELLOW, 7);
      text(g, 'Premier bout de la ligne', TIP.x, TIP.y - 22, '#ffe680', 11.5);
    }
    return;
  }
  view.worldToScreen(a.ax, a.az, SP);
  const ax = SP.x, ay = SP.y;
  drawTargetMark(g, ax, ay, YELLOW, 6);
  if (!tip) return;
  view.screenToWorld(TIP.x, TIP.y, W);
  lineToOrder(a.ax, a.az, W.x, W.z, GEOM);
  if (GEOM.width >= MIN_LINE) {
    drawBarrageLine(g, view, GEOM.x, GEOM.z, GEOM.heading, GEOM.width, YELLOW, false, 3.5);
    view.worldToScreen(GEOM.x, GEOM.z, SP);
    text(g, `${Math.round(GEOM.width)} m — second bout`, SP.x, SP.y + 18, '#ffe680', 11.5);
  } else {
    g.strokeStyle = YELLOW;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(TIP.x, TIP.y);
    g.stroke();
  }
}

const W = { x: 0, z: 0 };
