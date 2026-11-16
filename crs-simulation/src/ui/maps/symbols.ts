/* =====================================================================================
 * Symboles normalisés des unités, dessinés au canevas (aucune image). Inspirés de la symbologie
 * militaire courante : cadre rectangulaire « ami », marque d'échelon au-dessus (ø binôme, • groupe,
 * ••• section, | compagnie), pictogramme de spécialité dans le cadre, trait de cap, code court.
 * ===================================================================================== */

import type { Faction } from '@/core/contracts';
import type { UnitSymbol } from './units';

export const UNIT_COLORS = {
  police: '#1f66e0',
  policeDim: '#274a86',
  policeEdge: '#ffffff',
  rescue: '#d8362c',
  samu: '#f4f6fb',
  selected: '#ffd60a',
  hover: '#ffffff',
  hurt: '#ff9500',
  text: '#f4f7fd',
  halo: '#0b1322',
} as const;

export interface SymbolOptions {
  /** Hauteur du cadre en pixels (largeur = 1,5 × hauteur). */
  size: number;
  /** Angle écran du cap (rad, 0 = haut, sens horaire) ou NaN pour ne pas le dessiner. */
  headingAngle: number;
  faction: Faction;
  selected: boolean;
  hover: boolean;
  /** Unité hors du commandement du joueur : cadre atténué. */
  dim: boolean;
  /** Part de l'effectif valide (0..1) : cadre orange sous 0,6. */
  strength: number;
  injured: boolean;
  /** Code court sous le cadre ('' = aucun) et texte d'effectif à droite ('' = aucun). */
  code: string;
  detail: string;
  /** Dessin réduit (mini-carte) : ni échelon, ni texte. */
  compact: boolean;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

/** Pictogramme de spécialité, dans un cadre de demi-dimensions (hw, hh) centré sur l'origine. */
function drawGlyph(g: CanvasRenderingContext2D, symbol: UnitSymbol, hw: number, hh: number, ink: string): void {
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = Math.max(1.1, hh * 0.17);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const ix = hw * 0.74;
  const iy = hh * 0.66;
  switch (symbol) {
    case 'compagnie': case 'section': case 'groupe': case 'binome':
      // unité à pied : deux diagonales
      g.beginPath();
      g.moveTo(-ix, -iy);
      g.lineTo(ix, iy);
      g.moveTo(ix, -iy);
      g.lineTo(-ix, iy);
      g.stroke();
      break;
    case 'vehicule': {
      // fourgon : caisse, cabine, deux roues
      g.beginPath();
      g.moveTo(-ix, iy * 0.35);
      g.lineTo(-ix, -iy * 0.7);
      g.lineTo(ix * 0.35, -iy * 0.7);
      g.lineTo(ix, -iy * 0.05);
      g.lineTo(ix, iy * 0.35);
      g.closePath();
      g.stroke();
      const r = hh * 0.2;
      g.beginPath();
      g.arc(-ix * 0.5, iy * 0.55, r, 0, Math.PI * 2);
      g.arc(ix * 0.5, iy * 0.55, r, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'patrouille': {
      // voiture de police : berline de profil, gyrophare sur le toit
      g.beginPath();
      g.moveTo(-ix, iy * 0.4);
      g.lineTo(-ix, -iy * 0.05);
      g.lineTo(-ix * 0.55, -iy * 0.12);
      g.lineTo(-ix * 0.3, -iy * 0.55);
      g.lineTo(ix * 0.32, -iy * 0.55);
      g.lineTo(ix * 0.6, -iy * 0.12);
      g.lineTo(ix, -iy * 0.02);
      g.lineTo(ix, iy * 0.4);
      g.closePath();
      g.stroke();
      const r = hh * 0.19;
      g.beginPath();
      g.arc(-ix * 0.55, iy * 0.58, r, 0, Math.PI * 2);
      g.arc(ix * 0.55, iy * 0.58, r, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.rect(-hw * 0.12, -iy * 0.95, hw * 0.24, iy * 0.32);
      g.fill();
      break;
    }
    case 'centaure': {
      // blindé à roues : ovale, roues dessous
      g.beginPath();
      g.ellipse(0, -hh * 0.12, ix, iy * 0.62, 0, 0, Math.PI * 2);
      g.stroke();
      const r = hh * 0.14;
      g.beginPath();
      for (let i = -1; i <= 1; i++) {
        g.moveTo(i * ix * 0.55 + r, iy * 0.8);
        g.arc(i * ix * 0.55, iy * 0.8, r, 0, Math.PI * 2);
      }
      g.fill();
      break;
    }
    case 'canon_eau': {
      // goutte et jet
      g.beginPath();
      g.moveTo(-ix * 0.45, -iy);
      g.bezierCurveTo(-ix * 1.05, iy * 0.1, -ix * 0.95, iy, -ix * 0.45, iy);
      g.bezierCurveTo(ix * 0.05, iy, ix * 0.15, iy * 0.1, -ix * 0.45, -iy);
      g.fill();
      g.beginPath();
      g.moveTo(ix * 0.25, iy * 0.4);
      g.quadraticCurveTo(ix * 0.7, -iy * 0.9, ix, -iy * 0.2);
      g.moveTo(ix * 0.3, iy * 0.85);
      g.quadraticCurveTo(ix * 0.75, -iy * 0.2, ix, iy * 0.5);
      g.stroke();
      break;
    }
    case 'bravm': {
      // moto : deux roues et un cadre
      const r = hh * 0.36;
      g.beginPath();
      g.arc(-ix * 0.58, iy * 0.3, r, 0, Math.PI * 2);
      g.moveTo(ix * 0.58 + r, iy * 0.3);
      g.arc(ix * 0.58, iy * 0.3, r, 0, Math.PI * 2);
      g.moveTo(-ix * 0.58, iy * 0.3);
      g.lineTo(-ix * 0.1, -iy * 0.55);
      g.lineTo(ix * 0.35, -iy * 0.55);
      g.lineTo(ix * 0.58, iy * 0.3);
      g.stroke();
      break;
    }
    case 'drone': {
      // quatre rotors
      const r = hh * 0.22;
      g.beginPath();
      g.moveTo(-ix * 0.62, -iy * 0.62);
      g.lineTo(ix * 0.62, iy * 0.62);
      g.moveTo(ix * 0.62, -iy * 0.62);
      g.lineTo(-ix * 0.62, iy * 0.62);
      g.stroke();
      g.beginPath();
      for (let sx = -1; sx <= 1; sx += 2) {
        for (let sy = -1; sy <= 1; sy += 2) {
          g.moveTo(sx * ix * 0.62 + r, sy * iy * 0.62);
          g.arc(sx * ix * 0.62, sy * iy * 0.62, r, 0, Math.PI * 2);
        }
      }
      g.stroke();
      break;
    }
    case 'pompiers': {
      // flamme
      g.beginPath();
      g.moveTo(0, -iy);
      g.bezierCurveTo(ix * 0.9, -iy * 0.1, ix * 0.7, iy, 0, iy);
      g.bezierCurveTo(-ix * 0.7, iy, -ix * 0.75, iy * 0.1, -ix * 0.2, -iy * 0.25);
      g.bezierCurveTo(-ix * 0.1, iy * 0.1, ix * 0.1, -iy * 0.2, 0, -iy);
      g.fill();
      break;
    }
    case 'samu': {
      // croix
      const a = hh * 0.2;
      g.beginPath();
      g.rect(-a, -iy, a * 2, iy * 2);
      g.rect(-iy, -a, iy * 2, a * 2);
      g.fill();
      break;
    }
  }
}

/** Marque d'échelon au-dessus du cadre. */
function drawEchelon(g: CanvasRenderingContext2D, symbol: UnitSymbol, top: number, s: number, ink: string): void {
  g.fillStyle = ink;
  g.strokeStyle = ink;
  const y = top - s * 0.3;
  const r = Math.max(1.3, s * 0.11);
  if (symbol === 'groupe' || symbol === 'section') {
    const n = symbol === 'groupe' ? 1 : 3;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * r * 3.2;
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, Math.PI * 2);
    }
    g.fill();
  } else if (symbol === 'compagnie') {
    g.lineWidth = Math.max(1.6, s * 0.14);
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(0, y - s * 0.2);
    g.lineTo(0, y + s * 0.2);
    g.stroke();
  } else if (symbol === 'binome') {
    g.lineWidth = Math.max(1, s * 0.09);
    g.beginPath();
    g.arc(0, y, r * 1.7, 0, Math.PI * 2);
    g.moveTo(-r * 2, y + r * 2);
    g.lineTo(r * 2, y - r * 2);
    g.stroke();
  }
}

/** Dessine un symbole d'unité centré sur (x, y). */
export function drawUnitSymbol(g: CanvasRenderingContext2D, symbol: UnitSymbol, x: number, y: number, o: SymbolOptions): void {
  const s = o.size;
  const hh = s * 0.5;
  const hw = symbol === 'drone' ? hh : s * 0.75;
  g.save();
  g.translate(Math.round(x), Math.round(y));

  // trait de cap
  if (o.headingAngle === o.headingAngle) {
    const len = Math.max(hw, hh) + s * 0.55;
    const dx = Math.sin(o.headingAngle);
    const dy = -Math.cos(o.headingAngle);
    g.lineCap = 'round';
    g.lineWidth = Math.max(3, s * 0.2);
    g.strokeStyle = UNIT_COLORS.halo;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(dx * len, dy * len);
    g.stroke();
    g.lineWidth = Math.max(1.4, s * 0.1);
    g.strokeStyle = UNIT_COLORS.policeEdge;
    g.stroke();
    // pointe
    const ax = dx * len, ay = dy * len;
    const px = -dy, py = dx;
    const a = s * 0.2;
    g.fillStyle = UNIT_COLORS.policeEdge;
    g.beginPath();
    g.moveTo(ax + dx * a * 1.3, ay + dy * a * 1.3);
    g.lineTo(ax + px * a, ay + py * a);
    g.lineTo(ax - px * a, ay - py * a);
    g.closePath();
    g.fill();
  }

  // halo de sélection / survol
  if (o.selected || o.hover) {
    g.lineWidth = o.selected ? 2.5 : 1.5;
    g.strokeStyle = o.selected ? UNIT_COLORS.selected : UNIT_COLORS.hover;
    if (symbol === 'drone') {
      g.beginPath();
      g.arc(0, 0, hh + 4, 0, Math.PI * 2);
    } else roundRect(g, -hw - 4, -hh - 4, hw * 2 + 8, hh * 2 + 8, 5);
    g.stroke();
  }

  // cadre
  const rescue = o.faction === 'rescue';
  const fill = symbol === 'samu' ? UNIT_COLORS.samu : rescue ? UNIT_COLORS.rescue : o.dim ? UNIT_COLORS.policeDim : UNIT_COLORS.police;
  const ink = symbol === 'samu' ? '#d8362c' : '#ffffff';
  g.fillStyle = fill;
  g.strokeStyle = o.strength < 0.6 ? UNIT_COLORS.hurt : o.dim ? '#aebcda' : UNIT_COLORS.policeEdge;
  g.lineWidth = Math.max(1.2, s * 0.09);
  if (symbol === 'drone') {
    g.beginPath();
    g.arc(0, 0, hh, 0, Math.PI * 2);
  } else roundRect(g, -hw, -hh, hw * 2, hh * 2, Math.max(1.5, s * 0.14));
  g.fill();
  g.stroke();
  drawGlyph(g, symbol, hw, hh, ink);

  if (!o.compact) {
    drawEchelon(g, symbol, -hh, s, UNIT_COLORS.policeEdge);
    if (o.injured) {
      g.fillStyle = '#ff3b30';
      g.strokeStyle = UNIT_COLORS.halo;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(hw - 1, -hh + 1, Math.max(2.4, s * 0.17), 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    if (o.code !== '') {
      g.font = `700 ${Math.max(9.5, s * 0.62)}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.strokeStyle = UNIT_COLORS.halo;
      g.strokeText(o.code, 0, hh + 3);
      g.fillStyle = UNIT_COLORS.text;
      g.fillText(o.code, 0, hh + 3);
    }
    if (o.detail !== '') {
      g.font = `600 ${Math.max(9, s * 0.55)}px ${FONT}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.strokeStyle = UNIT_COLORS.halo;
      g.strokeText(o.detail, hw + 6, 0);
      g.fillStyle = o.strength < 0.6 ? UNIT_COLORS.hurt : '#c8d4ea';
      g.fillText(o.detail, hw + 6, 0);
    }
  }
  g.restore();
}

/** Pictogramme seul (légende, arborescence) dans un canevas carré. */
export function symbolIcon(symbol: UnitSymbol, faction: Faction, sizePx: number, pixelRatio = 2): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = Math.round(sizePx * 1.9);
  const h = Math.round(sizePx * 1.7);
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(pixelRatio, pixelRatio);
    drawUnitSymbol(g, symbol, w / 2, h / 2 + sizePx * 0.16, {
      size: sizePx, headingAngle: NaN, faction, selected: false, hover: false, dim: false, strength: 1, injured: false,
      code: '', detail: '', compact: false,
    });
  }
  return canvas;
}
