/* =====================================================================================
 * IMMEUBLES — peinture des toitures et accessoires (canvas 2D)
 * -------------------------------------------------------------------------------------
 * Matériaux continus (ils se répètent tous les 2,8 m × 3,2 m) : zinc à joints debout,
 * ardoise, terrasson, toit-terrasse gravillonné, tuile, souche de cheminée, pierre lisse.
 * Cellules calées sur les travées : brisis avec lucarne peinte, face de lucarne en volume.
 * Et la texture ajourée des garde-corps et des mitrons.
 * ===================================================================================== */

import { CellPainter, createCanvas, makeRandom, tone } from './paint';
import { IRON, paintWindow } from './paintHaussmann';
import type { PaintEnv } from './paintHaussmann';

const ZINC = '#848c93';
const SLATE = '#4e555e';

/** Zinc à joints debout : `seams` joints montants par cellule, recouvrements horizontaux. */
function zinc(p: CellPainter, env: PaintEnv, base: string, seams: number, laps: number): void {
  const W = 2.8, H = 3.2;
  p.begin(W, H, base);
  p.grain(env.blotch, 0.2, 'overlay');
  p.grain(env.grain, 0.14, 'overlay');
  for (let i = 0; i < seams; i++) {
    const x = ((i + 0.5) / seams) * W;
    p.vline(x - 0.012, 0, H, 0.018, 'rgba(255,255,255,0.4)');
    p.vline(x + 0.012, 0, H, 0.022, 'rgba(0,0,0,0.38)');
    // nuance d'une feuille à l'autre
    if (i % 2 === 0) p.rect(x, 0, W / seams, H, 'rgba(255,255,255,0.035)');
  }
  for (let j = 0; j < laps; j++) {
    const y = ((j + 0.5) / laps) * H;
    p.hline(0, y, W, 0.014, 'rgba(0,0,0,0.22)');
    p.hline(0, y - 0.016, W, 0.012, 'rgba(255,255,255,0.14)');
  }
}

/** Ardoise : rangs en recouvrement, joints en quinconce, teinte variable d'une ardoise à l'autre. */
function slate(p: CellPainter, env: PaintEnv): void {
  const W = 2.8, H = 3.2;
  p.begin(W, H, SLATE);
  const rows = 16, cols = 10;
  const rnd = makeRandom(4242);
  const rh = H / rows, cw = W / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x = (c - (r % 2) * 0.5) * cw;
      const k = (rnd() - 0.5) * 0.16;
      p.rect(x, r * rh, cw, rh, tone(SLATE, k));
      p.vline(x, r * rh, rh, 0.012, 'rgba(0,0,0,0.3)');
    }
    p.hline(0, r * rh + 0.012, W, 0.022, 'rgba(0,0,0,0.42)');
    p.hline(0, r * rh + rh - 0.012, W, 0.012, 'rgba(255,255,255,0.08)');
  }
  p.grain(env.blotch, 0.4, 'overlay');
  p.grain(env.grain, 0.2, 'overlay');
}

/** Lucarne peinte sur un brisis : ombre portée, jouées, fronton cintré en zinc, fenêtre. */
function paintedDormer(p: CellPainter, frame: string): void {
  const W = 2.8;
  const dw = 1.18, dx = (W - dw) / 2, dy = 0.62, dh = 1.95;
  // ombre portée sur la couverture, à droite et dessous
  p.rect(dx + 0.1, dy - 0.1, dw + 0.12, dh, 'rgba(0,0,0,0.28)');
  // corps de la lucarne : encadrement clair, fronton cintré
  p.arch(dx - 0.09, dy, dw + 0.18, dh + 0.12, 0.42, '#b9c0c5');
  p.arch(dx - 0.02, dy + 0.05, dw + 0.04, dh, 0.36, '#d9d4c6');
  paintWindow(p, dx + 0.12, dy + 0.14, dw - 0.24, dh - 0.38, { frame, bars: 2, rise: 0.2 });
  p.rect(dx - 0.12, dy - 0.07, dw + 0.24, 0.09, '#c5cbd0');
  p.hline(dx - 0.12, dy - 0.07, dw + 0.24, 0.02, 'rgba(0,0,0,0.35)');
  // garde-corps bas
  p.bar(dx + 0.12, dy + 0.5, dw - 0.24, 0.03, IRON);
  for (let i = 1; i < 8; i++) p.bar(dx + 0.12 + ((dw - 0.24) * i) / 8 - 0.008, dy + 0.14, 0.016, 0.36, IRON);
}

/** Face avant d'une lucarne en volume : la cellule entière est la lucarne. */
function dormerFace(p: CellPainter, env: PaintEnv): void {
  const W = 1.24, H = 1.6;
  p.begin(W, H, '#d9d4c6');
  p.grain(env.grain, 0.3, 'overlay');
  // fronton de zinc et piédroits
  p.rect(0, H - 0.2, W, 0.2, '#aab2b8');
  p.hline(0, H - 0.2, W, 0.025, 'rgba(0,0,0,0.4)');
  p.hline(0, H - 0.015, W, 0.03, 'rgba(255,255,255,0.35)');
  p.rect(0, 0, W, 0.1, '#c5cbd0');
  p.hline(0, 0.1, W, 0.02, 'rgba(0,0,0,0.3)');
  p.vline(0.01, 0, H, 0.03, 'rgba(255,255,255,0.3)');
  p.vline(W - 0.012, 0, H, 0.03, 'rgba(0,0,0,0.25)');
  paintWindow(p, 0.15, 0.14, W - 0.3, H - 0.4, { frame: '#ebe8de', bars: 2, rise: 0.16 });
  p.bar(0.15, 0.5, W - 0.3, 0.03, IRON);
  for (let i = 1; i < 8; i++) p.bar(0.15 + ((W - 0.3) * i) / 8 - 0.008, 0.14, 0.016, 0.36, IRON);
}

/** Toit-terrasse : étanchéité gravillonnée, taches, relevés. */
function gravel(p: CellPainter, env: PaintEnv): void {
  const W = 2.8, H = 3.2;
  p.begin(W, H, '#8f8d86');
  p.grain(env.blotch, 0.3, 'overlay');
  p.grain(env.grain, 0.5, 'overlay');
  const rnd = makeRandom(31);
  for (let i = 0; i < 260; i++) {
    const v = rnd();
    p.rect(rnd() * W, rnd() * H, 0.03, 0.03, v < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)');
  }
  p.hline(0, 1.6, W, 0.02, 'rgba(0,0,0,0.12)');
}

/** Tuiles mécaniques : rangs réguliers, nuances de terre cuite. */
function tiles(p: CellPainter, env: PaintEnv): void {
  const W = 2.8, H = 3.2;
  const base = '#8c5a48';
  p.begin(W, H, base);
  const rows = 10, cols = 12;
  const rnd = makeRandom(555);
  const rh = H / rows, cw = W / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      p.rect(c * cw, r * rh, cw, rh, tone(base, (rnd() - 0.5) * 0.22));
      p.vline(c * cw, r * rh, rh, 0.016, 'rgba(0,0,0,0.28)');
      p.vline(c * cw + cw * 0.5, r * rh, rh, 0.03, 'rgba(255,255,255,0.07)');
    }
    p.hline(0, r * rh + 0.016, W, 0.032, 'rgba(0,0,0,0.4)');
    p.hline(0, r * rh + rh - 0.02, W, 0.016, 'rgba(255,255,255,0.1)');
  }
  p.grain(env.blotch, 0.45, 'overlay');
  p.grain(env.grain, 0.2, 'overlay');
}

/** Souche de cheminée : maçonnerie enduite, briques apparentes par endroits, couronnement noirci. */
function stack(p: CellPainter, env: PaintEnv): void {
  const W = 2.8, H = 3.2;
  const base = '#c9bca4';
  p.begin(W, H, base);
  p.grain(env.blotch, 0.6, 'overlay');
  // briques : assises fines
  const rows = 40;
  for (let r = 0; r < rows; r++) {
    p.hline(0, (r / rows) * H, W, 0.012, 'rgba(90,50,30,0.14)');
    for (let c = 0; c < 12; c++) p.vline(((c + (r % 2) * 0.5) / 12) * W, (r / rows) * H, H / rows, 0.01, 'rgba(90,50,30,0.1)');
  }
  p.rect(0, 0, W, H, 'rgba(150,80,50,0.1)');
  p.grain(env.grain, 0.3, 'overlay');
  // couronnement et suie
  p.rect(0, H - 0.16, W, 0.16, tone(base, 0.06));
  p.hline(0, H - 0.16, W, 0.025, 'rgba(0,0,0,0.4)');
  p.shade(0, H - 1.1, W, 0.94, 0, 0.3);
  p.shade(0, H - 0.16, W, 0.16, 0.1, 0.25);
}

/** Dessus de souche : un mitron de terre cuite vu d'en haut (la cellule se répète le long de la souche). */
function stackTop(p: CellPainter, env: PaintEnv): void {
  const W = 0.7, H = 0.52;
  p.begin(W, H, '#b7ab96');
  p.grain(env.grain, 0.3, 'overlay');
  p.rect(0, 0, W, 0.04, 'rgba(0,0,0,0.2)');
  p.rect(0, H - 0.04, W, 0.04, 'rgba(255,255,255,0.15)');
  p.disc(W / 2 + 0.02, H / 2 - 0.02, 0.17, 'rgba(0,0,0,0.3)');
  p.disc(W / 2, H / 2, 0.16, '#b2633b');
  p.disc(W / 2, H / 2, 0.11, '#7c4127');
  p.disc(W / 2, H / 2, 0.085, '#1a1412');
}

/** Pierre lisse : dalles de balcon, corniches, acrotères. */
function plainStone(p: CellPainter, env: PaintEnv): void {
  p.begin(2.8, 3.2, '#d9cdb3');
  p.grain(env.blotch, 0.3, 'overlay');
  p.grain(env.grain, 0.35, 'overlay');
}

/** Grain fin : détail vu de près (rouge = intensité, centrée sur 128). */
function fineGrain(p: CellPainter, env: PaintEnv): void {
  p.begin(1, 1, '#808080');
  p.grain(env.fine, 1, 'source-over');
}

/** Peint les couches de toiture, dans l'ordre des indices de layers.ts (de LAYER_ZINC_BRISIS à LAYER_GRAIN). */
export function paintRoofLayers(p: CellPainter, env: PaintEnv, emit: () => void): void {
  zinc(p, env, ZINC, 6, 2); emit();                                   // LAYER_ZINC_BRISIS
  zinc(p, env, ZINC, 6, 2); paintedDormer(p, '#ebe8de'); emit();      // LAYER_ZINC_LUCARNE
  slate(p, env); emit();                                              // LAYER_ARDOISE_BRISIS
  slate(p, env); paintedDormer(p, '#ebe8de'); emit();                 // LAYER_ARDOISE_LUCARNE
  zinc(p, env, tone(ZINC, 0.12), 5, 2); emit();                       // LAYER_ZINC_PLAT
  gravel(p, env); emit();                                             // LAYER_GRAVIER
  tiles(p, env); emit();                                              // LAYER_TUILE
  stack(p, env); emit();                                              // LAYER_SOUCHE
  stackTop(p, env); emit();                                           // LAYER_SOUCHE_TOP
  plainStone(p, env); emit();                                         // LAYER_PIERRE
  dormerFace(p, env); emit();                                         // LAYER_LUCARNE_FACE
  fineGrain(p, env); emit();                                          // LAYER_GRAIN
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Texture ajourée : garde-corps (moitié haute) et mitrons (moitié basse)
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Canvas RVBA transparent, répétable horizontalement.
 *   v ∈ [0,5 ; 1] : garde-corps de fonte, une période de 1,4 m sur toute la largeur ;
 *   v ∈ [0 ; 0,5] : deux mitrons de terre cuite (une période de 0,7 m sur la demi-largeur).
 * (v = 0 en bas de l'image.)
 */
export function paintRailTexture(width: number, height: number): HTMLCanvasElement {
  const c = createCanvas(width, height);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, width, height);
  const half = height / 2;
  // ── garde-corps : moitié haute de l'image (y de 0 à half), 1 m de haut pour 1,4 m de large ──
  const mx = width / 1.4, my = half / 1.0;
  const X = (x: number): number => x * mx;
  const Y = (y: number): number => half - y * my;      // y = 0 au pied du garde-corps
  g.fillStyle = IRON;
  const bars = 12;
  for (let i = 0; i < bars; i++) {
    const x = ((i + 0.5) / bars) * 1.4;
    g.fillRect(X(x) - Math.max(1, mx * 0.011), Y(0.74), Math.max(2, mx * 0.022), my * 0.7);
  }
  g.fillRect(0, Y(0.07), width, Math.max(2, my * 0.035));
  g.fillRect(0, Y(0.76), width, Math.max(2, my * 0.03));
  g.fillRect(0, Y(1.0), width, Math.max(3, my * 0.055));
  g.strokeStyle = IRON;
  g.lineWidth = Math.max(2, mx * 0.024);
  const rings = 6;
  for (let i = 0; i < rings; i++) {
    g.beginPath();
    g.ellipse(X(((i + 0.5) / rings) * 1.4), Y(0.865), mx * 0.085, my * 0.085, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // volutes entre les barreaux, à mi-hauteur
  for (let i = 0; i < bars / 2; i++) {
    g.beginPath();
    g.ellipse(X(((2 * i + 1) / bars) * 1.4), Y(0.4), mx * 0.055, my * 0.13, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // reflet sur la main courante
  g.fillStyle = '#4a4d54';
  g.fillRect(0, Y(1.0), width, Math.max(1, my * 0.016));
  // ── mitrons : moitié basse (y de half à height), 0,5 m de haut ──
  const pw = width / 2;
  for (let k = 0; k < 2; k++) {
    const cx = (k + 0.5) * pw;
    const top = half + half * 0.12, bottom = height;
    const w0 = pw * 0.2, w1 = pw * 0.15;
    const grad = g.createLinearGradient(cx - w0, 0, cx + w0, 0);
    grad.addColorStop(0, '#c0754a');
    grad.addColorStop(0.45, '#b2633b');
    grad.addColorStop(1, '#6f3a22');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx - w0, bottom);
    g.lineTo(cx - w1, top + half * 0.1);
    g.lineTo(cx - w1 * 1.25, top + half * 0.1);
    g.lineTo(cx - w1 * 1.25, top);
    g.lineTo(cx + w1 * 1.25, top);
    g.lineTo(cx + w1 * 1.25, top + half * 0.1);
    g.lineTo(cx + w1, top + half * 0.1);
    g.lineTo(cx + w0, bottom);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(cx - w1 * 1.25, top, w1 * 2.5, Math.max(1, half * 0.03));
  }
  return c;
}
