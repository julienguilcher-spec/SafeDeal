/* =====================================================================================
 * Couches « unités » et « ordres en cours » dessinées par-dessus le fond de plan.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import type { MapScene } from './scene';
import { UNIT_COLORS, drawUnitSymbol } from './symbols';
import type { SymbolOptions } from './symbols';
import type { MapTransform, ScreenPoint } from './transform';
import type { MapUnit } from './units';

/** Des unités sœurs plus serrées que cela à l'écran (px) sont fondues dans le symbole de leur unité supérieure. */
export const COLLAPSE_PX = 24;
export const COLLAPSE_PX_COMPACT = 13;

export interface UnitLayerOptions {
  compact: boolean;
  selection: ReadonlySet<number> | null;
  hoverKey: number;
  /** Unité que le joueur peut commander (les autres sont atténuées) ; null = aucune atténuation. */
  commandable: ((key: number) => boolean) | null;
  /** Taille de base du cadre (px). */
  size: number;
  /** Unités en simples pions, sans cadre ni texte (plan de ville). */
  dots?: boolean;
}

/** Unités à dessiner pour une échelle donnée, avec l'étendue de leur sous-arbre dans scene.units. */
export interface ShownUnits {
  units: MapUnit[];
  /** Pour chaque unité montrée : indices [début, fin[ de son sous-arbre (elle comprise) dans scene.units. */
  start: number[];
  end: number[];
}

export function createShown(): ShownUnits {
  return { units: [], start: [], end: [] };
}

/**
 * Choisit les symboles à dessiner : les unités sans subordonnées, sauf quand des unités sœurs se
 * chevaucheraient à l'écran — on montre alors le seul symbole de l'unité supérieure (section,
 * compagnie). Un poste de commandement de compagnie reste visible à côté de ses sections.
 * Règle partagée par le dessin et par la désignation à la souris.
 */
export function visibleUnits(scene: MapScene, mpp: number, compact: boolean, out: ShownUnits): ShownUnits {
  const units = scene.units;
  const n = units.length;
  const limit = (compact ? COLLAPSE_PX_COMPACT : COLLAPSE_PX) * mpp;
  out.units.length = 0;
  out.start.length = 0;
  out.end.length = 0;
  let i = 0;
  while (i < n) {
    const u = units[i]!;
    let j = i + 1;
    while (j < n && units[j]!.depth > u.depth) j++;
    if (j > i + 1) {
      // étendue des unités terminales du sous-arbre autour de leur barycentre
      let sx = 0, sz = 0, leaves = 0;
      for (let k = i + 1; k < j; k++) {
        const c = units[k]!;
        if (c.childCount === 0 && c.total > 0) {
          sx += c.x;
          sz += c.z;
          leaves++;
        }
      }
      if (leaves === 0) {
        if (u.total > 0) push(out, u, i, j);
        i = j;
        continue;
      }
      sx /= leaves;
      sz /= leaves;
      let crowded = false;
      if (leaves > 1) {
        if (leaves === j - i - 1) {
          // dernier échelon (section et ses groupes) : on fond dès que deux symboles se toucheraient
          let min = Infinity;
          for (let a = i + 1; a < j && min > limit; a++) {
            const ua = units[a]!;
            if (ua.total === 0) continue;
            for (let b = a + 1; b < j; b++) {
              const ub = units[b]!;
              if (ub.total === 0) continue;
              const d = Math.hypot(ua.x - ub.x, ua.z - ub.z);
              if (d < min) min = d;
            }
          }
          crowded = min <= limit;
        } else {
          // échelon supérieur (compagnie) : seulement quand tout le dispositif tient dans un symbole
          let spread = 0;
          for (let k = i + 1; k < j; k++) {
            const c = units[k]!;
            if (c.childCount !== 0 || c.total === 0) continue;
            const d = Math.hypot(c.x - sx, c.z - sz);
            if (d > spread) spread = d;
          }
          crowded = spread <= limit;
        }
      }
      if (crowded) {
        push(out, u, i, j);
        i = j;
        continue;
      }
      // unités assez écartées : on les montre une à une ; le poste de commandement d'une compagnie reste affiché
      if (u.symbol === 'compagnie' && u.own > 0 && !compact) push(out, u, i, i + 1);
      i++;
      continue;
    }
    if (u.total > 0 || u.squadId === 0) push(out, u, i, j);
    i++;
  }
  return out;
}

function push(out: ShownUnits, u: MapUnit, start: number, end: number): void {
  out.units.push(u);
  out.start.push(start);
  out.end.push(end);
}

/** Une unité sélectionnée directement ou par l'une de ses unités supérieures. */
export function isSelected(scene: MapScene, u: MapUnit, selection: ReadonlySet<number> | null): boolean {
  if (!selection || selection.size === 0) return false;
  let cur: MapUnit | undefined = u;
  for (let guard = 0; cur && guard < 8; guard++) {
    if (selection.has(cur.key)) return true;
    cur = cur.parentKey !== 0 ? scene.unitModel.get(cur.parentKey) : undefined;
  }
  return false;
}

const SP: ScreenPoint = { x: 0, y: 0 };
const SQ: ScreenPoint = { x: 0, y: 0 };
const SYM: SymbolOptions = {
  size: 14, headingAngle: NaN, faction: 'police', selected: false, hover: false, dim: false, strength: 1,
  injured: false, code: '', detail: '', compact: false,
};

const SHOWN = createShown();

/** Véhicule de service hors unité : petit rectangle orienté, à l'échelle quand on zoome. */
function drawVehicleMark(g: CanvasRenderingContext2D, x: number, y: number, angle: number, mpp: number, rescue: boolean, hot: boolean): void {
  const len = Math.max(9, 6 / mpp);
  const wid = Math.max(4.5, 2.3 / mpp);
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = rescue ? UNIT_COLORS.rescue : '#2a59b8';
  g.strokeStyle = hot ? UNIT_COLORS.selected : 'rgba(236,242,252,.9)';
  g.lineWidth = hot ? 2 : 1;
  g.beginPath();
  g.rect(-wid / 2, -len / 2, wid, len);
  g.fill();
  g.stroke();
  // pare-brise : indique l'avant
  g.fillStyle = 'rgba(236,242,252,.85)';
  g.fillRect(-wid / 2 + 1, -len / 2 + 1.5, wid - 2, Math.max(1.5, len * 0.16));
  g.restore();
}

/** Mini-carte : un simple pion par unité (carré bleu, disque pour un drone, rouge pour les secours). */
function drawDot(g: CanvasRenderingContext2D, u: MapUnit, x: number, y: number, mine: boolean): void {
  const r = u.childCount > 0 ? 4.5 : 3.6;
  g.fillStyle = u.faction === 'rescue' ? UNIT_COLORS.rescue : UNIT_COLORS.police;
  g.strokeStyle = mine ? UNIT_COLORS.selected : '#ffffff';
  g.lineWidth = mine ? 1.8 : 1.2;
  g.beginPath();
  if (u.symbol === 'drone') g.arc(x, y, r, 0, Math.PI * 2);
  else g.rect(x - r, y - r, r * 2, r * 2);
  g.fill();
  g.stroke();
}

export function drawUnits(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: UnitLayerOptions): void {
  const shown = visibleUnits(scene, t.mpp, o.compact, SHOWN);
  const all = scene.units;
  const sel = o.selection;
  // deux passes : les unités sélectionnées par-dessus les autres
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < shown.units.length; i++) {
      const u = shown.units[i]!;
      let selected = isSelected(scene, u, sel);
      if (!selected && sel && sel.size > 0) {
        // symbole d'une unité fondue : il s'allume si l'une de ses subordonnées est sélectionnée
        for (let k = shown.start[i]! + 1; k < shown.end[i]!; k++) {
          if (sel.has(all[k]!.key)) {
            selected = true;
            break;
          }
        }
      }
      if ((pass === 1) !== selected) continue;
      if (!t.contains(u.x, u.z, 40)) continue;
      t.worldToScreen(u.x, u.z, SP);
      if (o.compact || o.dots) {
        if (u.squadId === 0 && u.symbol === 'vehicule') drawVehicleMark(g, SP.x, SP.y, t.headingToScreenAngle(u.heading), t.mpp * 1.6, false, false);
        else drawDot(g, u, SP.x, SP.y, u.hasPlayer);
        continue;
      }
      if (u.squadId === 0 && u.symbol === 'vehicule') {
        drawVehicleMark(g, SP.x, SP.y, t.headingToScreenAngle(u.heading), t.mpp, u.faction === 'rescue', selected || u.key === o.hoverKey);
        continue;
      }
      SYM.size = o.size;
      SYM.headingAngle = u.symbol === 'drone' ? NaN : t.headingToScreenAngle(u.heading);
      SYM.faction = u.faction;
      SYM.selected = selected;
      SYM.hover = u.key === o.hoverKey;
      SYM.dim = o.commandable !== null && !o.commandable(u.key);
      SYM.strength = u.total > 0 ? u.valid / u.total : 1;
      SYM.injured = u.injured > 0;
      SYM.code = u.code;
      SYM.detail = (selected || t.mpp < 0.75) && u.squadId !== 0 && u.total > 0 ? `${u.valid}/${u.total}` : '';
      SYM.compact = false;
      drawUnitSymbol(g, u.symbol, SP.x, SP.y, SYM);
    }
  }
}

// ───────────────────────────── ordres en cours ─────────────────────────────

type OrderShape = 'none' | 'line' | 'arrow' | 'circle' | 'target';

const ORDER_SHAPES: Readonly<Record<string, OrderShape>> = {
  libre: 'none', suivre: 'none', cesser: 'none', embarquer: 'none', debarquer: 'none', tortue: 'none',
  tenir: 'line', ligne: 'line',
  colonne: 'arrow', avancer: 'arrow', bond_offensif: 'arrow', charge: 'arrow', refoulement: 'arrow', repli: 'arrow',
  proteger: 'arrow', escorter: 'arrow', degager_barricade: 'arrow',
  disperser_gaz: 'target', interpeller: 'target',
  encercler: 'circle',
};

const ORDER_COLORS: Readonly<Record<string, string>> = {
  charge: '#ff6b4a', bond_offensif: '#ff9f43', refoulement: '#ff9f43', disperser_gaz: '#e6f1f6', interpeller: '#ffd60a',
  encercler: '#ff9f43', repli: '#9fd0ff',
};
const ORDER_DEFAULT_COLOR = '#58a6ff';

/** Libellés très courts affichés près du tracé d'un ordre. */
export const ORDER_TAGS: Readonly<Record<string, string>> = {
  tenir: 'TENIR', ligne: 'LIGNE', colonne: 'COLONNE', tortue: 'TORTUE', avancer: 'EN AVANT', bond_offensif: 'BOND',
  charge: 'CHARGE', refoulement: 'REFOULEMENT', repli: 'REPLI', encercler: 'NASSE', disperser_gaz: 'GAZ',
  interpeller: 'INTERPELLER', proteger: 'PROTÉGER', embarquer: 'EMBARQUER', debarquer: 'DÉBARQUER',
  degager_barricade: 'DÉGAGER', escorter: 'ESCORTER', cesser: 'CESSER', suivre: 'SUIVRE', libre: 'LIBRE',
};

/** Tolérance d'arrivée d'une unité sur le point de son ordre (m). */
export function arrivalRadius(width: number): number {
  return 6 + width * 0.25;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function tag(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  g.font = `700 9.5px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.strokeStyle = UNIT_COLORS.halo;
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

function arrowHead(g: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, size: number, color: string): void {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - ux * size - uy * size * 0.55, y - uy * size + ux * size * 0.55);
  g.lineTo(x - ux * size + uy * size * 0.55, y - uy * size - ux * size * 0.55);
  g.closePath();
  g.fill();
}

/**
 * Dessine une ligne de barrage : segment centré, perpendiculaire au cap, avec des dents du côté
 * où l'unité fait face. Sert aussi à l'aperçu pendant le tracé.
 */
export function drawBarrageLine(
  g: CanvasRenderingContext2D, t: MapTransform, x: number, z: number, heading: number, width: number, color: string,
  dashed: boolean, lineWidth = 3,
): void {
  const half = Math.max(1.5, width * 0.5);
  // droite de la formation = (−cos h, sin h)
  const rx = -Math.cos(heading), rz = Math.sin(heading);
  t.worldToScreen(x - rx * half, z - rz * half, SP);
  const ax = SP.x, ay = SP.y;
  t.worldToScreen(x + rx * half, z + rz * half, SP);
  const bx = SP.x, by = SP.y;
  t.worldToScreen(x + Math.sin(heading) * 4, z + Math.cos(heading) * 4, SQ);
  t.worldToScreen(x, z, SP);
  let fx = SQ.x - SP.x, fy = SQ.y - SP.y;
  const fl = Math.hypot(fx, fy) || 1;
  fx /= fl;
  fy /= fl;
  g.lineCap = 'round';
  g.lineWidth = lineWidth + 3;
  g.strokeStyle = 'rgba(8,14,26,.75)';
  g.setLineDash([]);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
  g.lineWidth = lineWidth;
  g.strokeStyle = color;
  if (dashed) g.setLineDash([7, 6]);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
  g.setLineDash([]);
  // dents vers l'avant
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.min(12, Math.floor(len / 16)));
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const k = n === 0 ? 0.5 : i / n;
    const px = ax + (bx - ax) * k, py = ay + (by - ay) * k;
    g.moveTo(px, py);
    g.lineTo(px + fx * 7, py + fy * 7);
  }
  g.stroke();
  // flèche de face au centre
  const cx = (ax + bx) * 0.5, cy = (ay + by) * 0.5;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + fx * 18, cy + fy * 18);
  g.stroke();
  arrowHead(g, cx + fx * 24, cy + fy * 24, fx, fy, 8, color);
}

/** Cercle d'encerclement avec l'issue laissée ouverte dans la direction du cap. */
export function drawNasse(
  g: CanvasRenderingContext2D, t: MapTransform, x: number, z: number, heading: number, diameter: number, color: string,
  dashed: boolean,
): void {
  t.worldToScreen(x, z, SP);
  const r = Math.max(8, (diameter * 0.5) / t.mpp);
  // angle écran (repère du canevas : 0 = +x, sens horaire) de la direction de l'issue
  const a = t.headingToScreenAngle(heading) - Math.PI / 2;
  const gap = Math.min(0.5, 14 / r + 0.22);
  g.lineCap = 'round';
  g.setLineDash([]);
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(8,14,26,.7)';
  g.beginPath();
  g.arc(SP.x, SP.y, r, a + gap, a - gap + Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = color;
  if (dashed) g.setLineDash([8, 6]);
  g.beginPath();
  g.arc(SP.x, SP.y, r, a + gap, a - gap + Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,159,67,.07)';
  g.beginPath();
  g.arc(SP.x, SP.y, r, 0, Math.PI * 2);
  g.fill();
  // l'issue : flèche verte vers l'extérieur
  const ex = SP.x + Math.cos(a) * r, ey = SP.y + Math.sin(a) * r;
  g.strokeStyle = '#34c759';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(ex - Math.cos(a) * 8, ey - Math.sin(a) * 8);
  g.lineTo(ex + Math.cos(a) * 16, ey + Math.sin(a) * 16);
  g.stroke();
  arrowHead(g, ex + Math.cos(a) * 23, ey + Math.sin(a) * 23, Math.cos(a), Math.sin(a), 8, '#34c759');
  tag(g, 'ISSUE', ex + Math.cos(a) * 40, ey + Math.sin(a) * 40, '#7be495');
}

export function drawOrderArrow(
  g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, color: string, dashed: boolean,
): void {
  const dx = bx - ax, dy = by - ay;
  const l = Math.hypot(dx, dy);
  if (l < 6) return;
  const ux = dx / l, uy = dy / l;
  const ex = bx - ux * 7, ey = by - uy * 7;
  g.lineCap = 'round';
  g.setLineDash([]);
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(8,14,26,.7)';
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(ex, ey);
  g.stroke();
  g.lineWidth = 2.2;
  g.strokeStyle = color;
  if (dashed) g.setLineDash([6, 6]);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(ex, ey);
  g.stroke();
  g.setLineDash([]);
  arrowHead(g, bx, by, ux, uy, 10, color);
}

export function drawTargetMark(g: CanvasRenderingContext2D, x: number, y: number, color: string, radius: number): void {
  g.lineWidth = 4.5;
  g.strokeStyle = 'rgba(8,14,26,.7)';
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.moveTo(x - radius - 5, y);
    g.lineTo(x - radius + 4, y);
    g.moveTo(x + radius - 4, y);
    g.lineTo(x + radius + 5, y);
    g.moveTo(x, y - radius - 5);
    g.lineTo(x, y - radius + 4);
    g.moveTo(x, y + radius - 4);
    g.lineTo(x, y + radius + 5);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = color;
  }
}

/** Tracés des ordres en cours : flèche jusqu'à l'arrivée, puis ligne ou zone tenue en trait fin. */
export function drawOrders(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: UnitLayerOptions): void {
  const units = scene.units;
  // l'étiquette d'un ordre n'est écrite que pour une unité qui a son propre symbole à cette échelle
  const shown = visibleUnits(scene, t.mpp, o.compact, SHOWN).units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const ord = u.order;
    if (!ord || u.total === 0) continue;
    if (o.compact && !u.hasPlayer) continue;
    const shape = ORDER_SHAPES[ord.type as OrderType] ?? 'arrow';
    if (shape === 'none') continue;
    // un ordre « tenir » sans largeur ne se dessine pas (position actuelle)
    if (ord.type === 'tenir' && ord.width <= 0) continue;
    const arrived = u.orderDist <= arrivalRadius(ord.width);
    const color = ORDER_COLORS[ord.type] ?? ORDER_DEFAULT_COLOR;
    if (!t.contains(ord.x, ord.z, 200) && !t.contains(u.x, u.z, 60)) continue;
    const selected = isSelected(scene, u, o.selection);
    g.globalAlpha = arrived && !selected ? 0.55 : 1;
    t.worldToScreen(u.x, u.z, SQ);
    const ux = SQ.x, uy = SQ.y;
    t.worldToScreen(ord.x, ord.z, SQ);
    const tx = SQ.x, ty = SQ.y;
    if (shape === 'line') {
      if (!arrived) drawOrderArrow(g, ux, uy, tx, ty, color, true);
      drawBarrageLine(g, t, ord.x, ord.z, ord.heading, ord.width, color, !arrived, arrived ? 2.5 : 3);
    } else if (shape === 'circle') {
      if (!arrived && u.orderDist > ord.width * 0.5 + 8) drawOrderArrow(g, ux, uy, tx, ty, color, true);
      drawNasse(g, t, ord.x, ord.z, ord.heading, ord.width > 0 ? ord.width : 30, color, !arrived);
    } else if (shape === 'target') {
      if (!arrived) drawOrderArrow(g, ux, uy, tx, ty, color, true);
      drawTargetMark(g, tx, ty, color, ord.type === 'disperser_gaz' ? 11 : 8);
    } else if (!arrived) {
      drawOrderArrow(g, ux, uy, tx, ty, color, ord.type === 'repli');
    } else {
      g.globalAlpha = 1;
      continue;
    }
    if (!o.compact && (!arrived || selected) && shown.indexOf(u) >= 0) {
      const label = `${u.code !== '' ? u.code + ' · ' : ''}${ORDER_TAGS[ord.type] ?? String(ord.type).toUpperCase()}`;
      const off = shape === 'circle' ? -(Math.max(8, (ord.width * 0.5) / t.mpp) + 12) : -14;
      tag(g, label, tx, ty + off, color);
    }
    g.globalAlpha = 1;
  }
}
