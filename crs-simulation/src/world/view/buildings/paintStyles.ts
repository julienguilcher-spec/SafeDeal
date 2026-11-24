/* =====================================================================================
 * IMMEUBLES — peinture des autres façades (canvas 2D)
 * -------------------------------------------------------------------------------------
 *   faubourg   : enduit clair, fenêtres à persiennes, corniche de plâtre ;
 *   moderne    : trame béton et verre (allèges, bandeaux vitrés), ou mur-rideau ;
 *   monumental : pierre à refends, pilastres, grandes baies cintrées, attique à balustres ;
 *   cour       : enduit sans ornement ; pignons aveugles ; béton brut.
 * Quatre cellules par famille de style : rez-de-chaussée, porte, étage courant, dernier étage.
 * ===================================================================================== */

import { CellPainter, makeRandom, mix, rgba, tone } from './paint';
import { IRON, paintRailing, paintStringCourse, paintSurround, paintWindow, stoneWall } from './paintHaussmann';
import type { PaintEnv } from './paintHaussmann';

// ─────────────────────────────────────────────────────────────────────────────────────
// Faubourg
// ─────────────────────────────────────────────────────────────────────────────────────

interface FaubourgPalette { plaster: string; frame: string; shutter: string; door: string; base: string }

const FAUBOURG: FaubourgPalette[] = [
  { plaster: '#e6e0d1', frame: '#f0eee8', shutter: '#c3c9cb', door: '#34493f', base: '#9a9388' },
  { plaster: '#e2dccf', frame: '#ecebe6', shutter: '#9aaaa2', door: '#5a3a2b', base: '#8f8a84' },
];

function plasterWall(p: CellPainter, env: PaintEnv, w: number, h: number, color: string): void {
  p.begin(w, h, color);
  p.grain(env.blotch, 0.42, 'overlay');
  p.grain(env.grain, 0.2, 'overlay');
}

/** Persienne ouverte, plaquée contre le mur. */
function shutter(p: CellPainter, x: number, y: number, w: number, h: number, color: string): void {
  p.rect(x + 0.03, y - 0.03, w, h, 'rgba(0,0,0,0.22)');       // ombre sur le mur
  p.rect(x, y, w, h, color);
  const slats = Math.round(h / 0.065);
  for (let i = 1; i < slats; i++) p.hline(x + 0.03, y + (h * i) / slats, w - 0.06, 0.012, 'rgba(0,0,0,0.28)');
  p.vline(x, y, h, 0.02, tone(color, 0.2));
  p.vline(x + w, y, h, 0.02, tone(color, -0.25));
  p.hline(x, y + h * 0.5, w, 0.03, tone(color, -0.12));
}

function faubourgFloor(p: CellPainter, env: PaintEnv, pal: FaubourgPalette, top: boolean): void {
  const W = 2.7, H = 3.0;
  plasterWall(p, env, W, H, pal.plaster);
  // bandeau plat à la naissance de l'étage
  p.rect(0, 0, W, 0.09, tone(pal.plaster, 0.05));
  p.hline(0, 0.09, W, 0.012, 'rgba(255,255,255,0.4)');
  p.shade(0, H - 0.08, W, 0.08, 0, 0.18);
  const ww = 1.04, wh = 1.72, wx = (W - ww) / 2, wy = 0.78;
  // appui et tableau
  p.rect(wx - 0.08, wy - 0.07, ww + 0.16, 0.07, tone(pal.plaster, 0.07));
  p.shade(wx - 0.06, wy - 0.2, ww + 0.16, 0.13, 0, 0.26);
  p.shade(wx - 0.02, wy - 0.9, 0.07, 0.7, 0, 0.1);
  p.shade(wx + ww - 0.05, wy - 0.9, 0.07, 0.7, 0, 0.1);
  p.rect(wx - 0.05, wy, ww + 0.1, wh + 0.05, tone(pal.plaster, 0.04));
  paintWindow(p, wx, wy, ww, wh, { frame: pal.frame, bars: 2 });
  shutter(p, wx - 0.56, wy, 0.5, wh, pal.shutter);
  shutter(p, wx + ww + 0.06, wy, 0.5, wh, pal.shutter);
  // barre d'appui
  p.bar(wx, wy + 0.36, ww, 0.03, IRON);
  p.bar(wx, wy + 0.1, ww, 0.02, IRON);
  for (let i = 1; i < 8; i++) p.bar(wx + (ww * i) / 8 - 0.008, wy + 0.1, 0.016, 0.26, IRON);
  if (top) {
    // corniche de plâtre et gouttière de zinc
    p.shade(0, H - 0.5, W, 0.2, 0, 0.26);
    p.rect(0, H - 0.3, W, 0.2, tone(pal.plaster, 0.06));
    p.hline(0, H - 0.3, W, 0.02, 'rgba(0,0,0,0.3)');
    p.hline(0, H - 0.2, W, 0.012, 'rgba(0,0,0,0.12)');
    p.rect(0, H - 0.1, W, 0.1, '#878f95');
    p.hline(0, H - 0.1, W, 0.02, 'rgba(0,0,0,0.35)');
  }
}

function faubourgGround(p: CellPainter, env: PaintEnv, pal: FaubourgPalette, door: boolean): void {
  const W = 2.7, H = 3.5;
  plasterWall(p, env, W, H, tone(pal.plaster, -0.03));
  // soubassement peint
  p.rect(0, 0, W, 0.55, pal.base);
  p.grain(env.grain, 0.15, 'overlay');
  p.hline(0, 0.55, W, 0.02, 'rgba(255,255,255,0.25)');
  p.shade(0, 0, W, 1.0, 0.32, 0);
  // bandeau haut
  p.shade(0, H - 0.3, W, 0.14, 0, 0.24);
  p.rect(0, H - 0.16, W, 0.16, tone(pal.plaster, 0.06));
  p.hline(0, H - 0.16, W, 0.018, 'rgba(0,0,0,0.25)');
  if (door) {
    const dw = 1.1, dx = (W - dw) / 2, dh = 2.6;
    p.rect(dx - 0.1, 0, dw + 0.2, dh + 0.1, tone(pal.plaster, 0.06));
    p.rect(dx, 0, dw, dh, pal.door);
    p.vgrad(dx, 0, dw, dh, rgba('#000000', 0.25), rgba('#000000', 0));
    // imposte vitrée
    p.rect(dx + 0.06, dh - 0.48, dw - 0.12, 0.42, '#262c33');
    p.mask(dx + 0.06, dh - 0.48, dw - 0.12, 0.42, 0.85);
    p.bar(dx + dw / 2 - 0.012, dh - 0.48, 0.024, 0.42, IRON);
    // panneaux
    for (const [py, ph] of [[0.2, 0.7], [1.05, 0.95]] as const) {
      p.rect(dx + 0.14, py, dw - 0.28, ph, tone(pal.door, 0.08));
      p.rect(dx + 0.19, py + 0.05, dw - 0.38, ph - 0.1, tone(pal.door, -0.08));
      p.hline(dx + 0.14, py, dw - 0.28, 0.014, 'rgba(0,0,0,0.4)');
    }
    p.disc(dx + dw - 0.14, 1.02, 0.03, '#b8994a');
    p.shade(dx, dh - 0.25, dw, 0.25, 0, 0.45);
    p.hgrad(dx, 0, 0.14, dh, 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)');
    p.rect(dx - 0.04, 0, dw + 0.08, 0.06, '#a9a497');
    return;
  }
  const ww = 1.0, wh = 1.62, wx = (W - ww) / 2, wy = 1.15;
  p.rect(wx - 0.08, wy - 0.07, ww + 0.16, 0.07, tone(pal.plaster, 0.07));
  p.shade(wx - 0.06, wy - 0.2, ww + 0.16, 0.13, 0, 0.26);
  p.rect(wx - 0.05, wy, ww + 0.1, wh + 0.05, tone(pal.plaster, 0.04));
  paintWindow(p, wx, wy, ww, wh, { frame: pal.frame, bars: 2, glow: 0.8 });
  for (let i = 1; i < 8; i++) p.bar(wx + (ww * i) / 8 - 0.009, wy, 0.018, wh, IRON);
  p.bar(wx, wy + 0.25, ww, 0.025, IRON);
  p.bar(wx, wy + wh - 0.3, ww, 0.025, IRON);
}

export function paintFaubourgFamily(p: CellPainter, env: PaintEnv, variant: number, emit: () => void): void {
  const pal = FAUBOURG[variant % FAUBOURG.length];
  faubourgGround(p, env, pal, false); emit();
  faubourgGround(p, env, pal, true); emit();
  faubourgFloor(p, env, pal, false); emit();
  faubourgFloor(p, env, pal, true); emit();
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Moderne
// ─────────────────────────────────────────────────────────────────────────────────────

const GLASS_LOW = '#27313a';
const GLASS_HIGH = '#566a7c';
const ALU = '#aeb4b8';

/** Variante A : trame de béton, allège en panneau, bandeau vitré. */
function modernGrid(p: CellPainter, env: PaintEnv, cell: number): void {
  const W = 3.0;
  const concrete = '#c6c3bb';
  if (cell <= 1) {
    // rez-de-chaussée : hall vitré en retrait entre poteaux, bandeau de béton
    const H = 3.8;
    p.begin(W, H, concrete);
    p.grain(env.blotch, 0.35, 'overlay');
    p.grain(env.grain, 0.3, 'overlay');
    p.vgrad(0.26, 0.12, W - 0.52, 3.1, '#161b20', '#39454f');
    p.mask(0.26, 0.12, W - 0.52, 3.1, 0.7);
    p.light(0.26, 1.9, W - 0.52, 1.3, 0, 0.1);
    if (cell === 1) {
      // porte vitrée à deux vantaux
      for (const x of [0.8, 1.5, 2.2]) p.bar(x - 0.03, 0.12, 0.06, 2.3, '#4a4f54');
      p.bar(0.8, 2.36, 1.4, 0.07, '#4a4f54');
      p.bar(1.38, 1.0, 0.03, 0.45, '#c9ced1');
      p.bar(1.59, 1.0, 0.03, 0.45, '#c9ced1');
    }
    for (const x of [0.26, 1.5, W - 0.26]) p.bar(x - 0.025, 0.12, 0.05, 3.1, '#5b6166');
    p.bar(0.26, 2.42, W - 0.52, 0.05, '#5b6166');
    p.shade(0.26, 2.6, W - 0.52, 0.62, 0, 0.55);
    p.rect(0, 0, W, 0.12, '#8d8b85');
    // poteaux et bandeau
    for (const x of [0, W - 0.26]) {
      p.rect(x, 0, 0.26, 3.22, tone(concrete, 0.03));
      p.vline(x + 0.26, 0, 3.22, 0.016, 'rgba(0,0,0,0.3)');
    }
    p.rect(0, 3.22, W, 0.58, tone(concrete, 0.02));
    p.hline(0, 3.22, W, 0.03, 'rgba(0,0,0,0.4)');
    p.hline(0, 3.78, W, 0.02, 'rgba(255,255,255,0.3)');
    p.shade(0, 0, W, 0.9, 0.25, 0);
    return;
  }
  const H = 3.1;
  p.begin(W, H, concrete);
  p.grain(env.blotch, 0.35, 'overlay');
  p.grain(env.grain, 0.3, 'overlay');
  // allège : panneau gravillonné
  p.rect(0.2, 0.06, W - 0.4, 0.88, '#b3ac9c');
  p.grain(env.grain, 0.25, 'overlay');
  p.hline(0.2, 0.94, W - 0.4, 0.016, 'rgba(0,0,0,0.3)');
  p.hline(0.2, 0.06, W - 0.4, 0.016, 'rgba(255,255,255,0.25)');
  // bandeau vitré : trois châssis
  const gy = 1.0, gh = 1.78, gx = 0.2, gw = W - 0.4;
  p.vgrad(gx, gy, gw, gh, GLASS_LOW, GLASS_HIGH);
  p.mask(gx, gy, gw, gh, 1);
  // stores à mi-hauteur sur certains châssis
  p.rect(gx, gy + gh - 0.5, gw / 3, 0.5, 'rgba(225,222,212,0.5)');
  p.rect(gx + (2 * gw) / 3, gy + gh - 0.9, gw / 3, 0.9, 'rgba(225,222,212,0.42)');
  for (let i = 0; i <= 3; i++) p.bar(gx + (gw * i) / 3 - 0.025, gy, 0.05, gh, ALU);
  p.bar(gx, gy, gw, 0.05, ALU);
  p.bar(gx, gy + gh - 0.05, gw, 0.05, ALU);
  p.shade(gx, gy + gh - 0.22, gw, 0.22, 0, 0.4);
  // poteaux en saillie, nez de dalle
  for (const x of [0, W - 0.2]) {
    p.rect(x, 0, 0.2, H, tone(concrete, 0.04));
    p.vline(x + 0.2, 0, H, 0.016, 'rgba(0,0,0,0.28)');
    p.vline(x, 0, H, 0.012, 'rgba(255,255,255,0.25)');
  }
  p.rect(0, H - 0.3, W, 0.3, tone(concrete, 0.03));
  p.hline(0, H - 0.3, W, 0.02, 'rgba(0,0,0,0.35)');
  p.shade(0.2, H - 0.42, W - 0.4, 0.12, 0, 0.25);
  if (cell === 3) {
    // couronnement : acrotère
    p.rect(0, H - 0.3, W, 0.3, tone(concrete, 0.08));
    p.hline(0, H - 0.02, W, 0.04, '#7d8389');
    p.hline(0, H - 0.3, W, 0.03, 'rgba(0,0,0,0.4)');
  }
}

/** Variante B : mur-rideau, allèges en verre opaque, meneaux d'aluminium. */
function modernCurtain(p: CellPainter, env: PaintEnv, cell: number): void {
  const W = 3.0;
  if (cell <= 1) {
    const H = 3.8;
    p.begin(W, H, '#3a3f44');
    p.grain(env.grain, 0.2, 'overlay');
    // soubassement de pierre sombre, vitrage toute hauteur
    p.vgrad(0.06, 0.3, W - 0.12, 3.0, '#141a1f', '#3d4b57');
    p.mask(0.06, 0.3, W - 0.12, 3.0, 0.75);
    p.light(0.06, 2.0, W - 0.12, 1.3, 0, 0.1);
    if (cell === 1) {
      for (const x of [0.75, 1.5, 2.25]) p.bar(x - 0.03, 0.3, 0.06, 2.25, '#2a2e32');
      p.bar(0.75, 2.5, 1.5, 0.08, '#2a2e32');
      p.bar(1.37, 1.05, 0.035, 0.6, '#d0d4d6');
      p.bar(1.6, 1.05, 0.035, 0.6, '#d0d4d6');
    }
    for (const x of [0.03, 1.5, W - 0.03]) p.bar(x - 0.03, 0.3, 0.06, 3.0, ALU);
    p.rect(0, 0, W, 0.3, '#4d4a47');
    p.hline(0, 0.3, W, 0.02, 'rgba(255,255,255,0.2)');
    p.rect(0, 3.3, W, 0.5, '#70777c');
    p.hline(0, 3.3, W, 0.03, 'rgba(0,0,0,0.5)');
    p.hline(0, 3.78, W, 0.02, 'rgba(255,255,255,0.3)');
    p.shade(0.06, 2.9, W - 0.12, 0.4, 0, 0.45);
    p.shade(0, 0, W, 0.8, 0.25, 0);
    return;
  }
  const H = 3.1;
  p.begin(W, H, '#37424b');
  // allège en verre émaillé
  p.vgrad(0, 0, W, 0.95, '#2e373f', '#3a454e');
  // vitrage
  p.vgrad(0, 0.95, W, H - 0.95, '#2b3740', '#627789');
  p.mask(0, 0.95, W, H - 0.95, 1);
  p.rect(W / 2, H - 0.7, W / 2, 0.7, 'rgba(220,220,214,0.3)');
  p.light(0, 2.2, W, 0.9, 0, 0.08);
  // meneaux et traverses
  for (const x of [0, W / 2, W]) p.bar(x - 0.035, 0, 0.07, H, ALU);
  p.vline(0.045, 0, H, 0.012, 'rgba(0,0,0,0.35)');
  p.vline(W / 2 + 0.045, 0, H, 0.012, 'rgba(0,0,0,0.35)');
  p.bar(0, 0.93, W, 0.045, ALU);
  p.bar(0, 0, W, 0.04, ALU);
  p.hline(0, 0.92, W, 0.012, 'rgba(0,0,0,0.35)');
  if (cell === 3) {
    p.rect(0, H - 0.28, W, 0.28, '#8b9196');
    p.hline(0, H - 0.28, W, 0.03, 'rgba(0,0,0,0.45)');
    p.hline(0, H - 0.015, W, 0.03, '#c3c8cb');
  }
}

export function paintModernFamily(p: CellPainter, env: PaintEnv, variant: number, emit: () => void): void {
  for (let cell = 0; cell < 4; cell++) {
    if (variant % 2 === 0) modernGrid(p, env, cell); else modernCurtain(p, env, cell);
    emit();
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Monumental
// ─────────────────────────────────────────────────────────────────────────────────────

const MONU_STONE = '#d2c7b0';

/** Demi-pilastres aux deux bords de la travée : ils forment un pilastre entier d'une cellule à la suivante. */
function pilasters(p: CellPainter, w: number, y: number, h: number, stone: string): void {
  const pw = 0.3;
  for (const side of [0, 1]) {
    const x = side === 0 ? 0 : w - pw;
    p.rect(x, y, pw, h, tone(stone, 0.08));
    // cannelures suggérées
    for (let i = 1; i < 3; i++) p.vline(x + (pw * i) / 3, y + 0.35, h - 0.8, 0.014, 'rgba(0,0,0,0.12)');
    if (side === 0) { p.vline(pw, y, h, 0.03, 'rgba(0,0,0,0.3)'); p.rect(pw, y, 0.07, h, 'rgba(0,0,0,0.12)'); }
    else p.vline(x, y, h, 0.02, 'rgba(255,255,245,0.4)');
    // base et chapiteau
    const bx = side === 0 ? 0 : w - pw - 0.06;
    p.rect(bx, y, pw + 0.06, 0.26, tone(stone, 0.11));
    p.hline(bx, y + 0.26, pw + 0.06, 0.016, 'rgba(0,0,0,0.25)');
    p.rect(bx, y + h - 0.36, pw + 0.06, 0.36, tone(stone, 0.13));
    p.hline(bx, y + h - 0.36, pw + 0.06, 0.02, 'rgba(0,0,0,0.3)');
    p.hline(bx, y + h - 0.18, pw + 0.06, 0.014, 'rgba(0,0,0,0.18)');
  }
}

function monumentalFloor(p: CellPainter, env: PaintEnv, top: boolean): void {
  const W = 3.6, H = 4.6;
  stoneWall(p, env, W, H, MONU_STONE, 0.46, false);
  paintStringCourse(p, W, H, MONU_STONE, 0.16);
  if (!top) {
    pilasters(p, W, 0.16, H - 0.16 - 0.3, MONU_STONE);
    // entablement
    p.shade(0, H - 0.5, W, 0.2, 0, 0.3);
    p.rect(0, H - 0.3, W, 0.3, tone(MONU_STONE, 0.1));
    p.hline(0, H - 0.3, W, 0.02, 'rgba(0,0,0,0.3)');
    p.hline(0, H - 0.14, W, 0.014, 'rgba(0,0,0,0.15)');
    // grande baie cintrée, archivolte, allège à balustres
    const ww = 1.6, wx = (W - ww) / 2, wy = 0.95, wh = 3.0, rise = 0.8;
    p.arch(wx - 0.2, wy - 0.02, ww + 0.4, wh + 0.22, rise + 0.2, tone(MONU_STONE, 0.1));
    p.arch(wx - 0.07, wy, ww + 0.14, wh + 0.07, rise + 0.07, tone(MONU_STONE, -0.08));
    p.rect(W / 2 - 0.13, wy + wh - 0.05, 0.26, 0.36, tone(MONU_STONE, 0.16));
    p.vline(W / 2 + 0.13, wy + wh - 0.05, 0.36, 0.016, 'rgba(0,0,0,0.3)');
    paintWindow(p, wx, wy, ww, wh, { frame: '#e6e3da', bars: 3, rise });
    // balustres de l'allège
    p.rect(wx - 0.2, 0.2, ww + 0.4, 0.72, tone(MONU_STONE, -0.3));
    const nb = 9;
    for (let i = 0; i < nb; i++) {
      const bx = wx - 0.2 + ((i + 0.5) / nb) * (ww + 0.4);
      p.rect(bx - 0.045, 0.24, 0.09, 0.6, tone(MONU_STONE, 0.1));
      p.rect(bx - 0.065, 0.42, 0.13, 0.2, tone(MONU_STONE, 0.1));
      p.vline(bx + 0.05, 0.24, 0.6, 0.012, 'rgba(0,0,0,0.25)');
    }
    p.rect(wx - 0.24, 0.84, ww + 0.48, 0.1, tone(MONU_STONE, 0.13));
    p.shade(wx - 0.2, 0.74, ww + 0.4, 0.1, 0, 0.3);
    return;
  }
  // attique : fenêtre carrée, forte corniche, balustrade de couronnement
  const ww = 1.4, wx = (W - ww) / 2, wy = 0.75, wh = 1.75;
  paintSurround(p, wx, wy, ww, wh, 0.16, MONU_STONE, true);
  paintWindow(p, wx, wy, ww, wh, { frame: '#e6e3da', bars: 2 });
  pilasters(p, W, 0.16, 2.95, MONU_STONE);
  const cy = 3.2;
  p.shade(0, cy - 0.28, W, 0.28, 0, 0.32);
  p.rect(0, cy, W, 0.14, tone(MONU_STONE, -0.3));
  for (let i = 0; i < 12; i++) p.rect(((i + 0.2) / 12) * W, cy + 0.01, (W / 12) * 0.55, 0.13, tone(MONU_STONE, 0.02));
  p.rect(0, cy + 0.14, W, 0.3, tone(MONU_STONE, 0.14));
  p.hline(0, cy + 0.44, W, 0.02, 'rgba(255,255,245,0.6)');
  // balustrade
  p.rect(0, cy + 0.46, W, 0.94, tone(MONU_STONE, -0.36));
  const nb = 12;
  for (let i = 0; i < nb; i++) {
    const bx = ((i + 0.5) / nb) * W;
    p.rect(bx - 0.05, cy + 0.56, 0.1, 0.62, tone(MONU_STONE, 0.1));
    p.rect(bx - 0.075, cy + 0.74, 0.15, 0.22, tone(MONU_STONE, 0.1));
    p.vline(bx + 0.055, cy + 0.56, 0.62, 0.012, 'rgba(0,0,0,0.3)');
  }
  p.rect(0, cy + 0.46, W, 0.1, tone(MONU_STONE, 0.1));
  p.rect(0, cy + 1.18, W, 0.22, tone(MONU_STONE, 0.14));
  p.hline(0, cy + 1.18, W, 0.02, 'rgba(0,0,0,0.3)');
  for (const x of [0, W - 0.22]) p.rect(x, cy + 0.46, 0.22, 0.94, tone(MONU_STONE, 0.1));
}

function monumentalGround(p: CellPainter, env: PaintEnv, door: boolean): void {
  const W = 3.6, H = 5.0;
  stoneWall(p, env, W, H, tone(MONU_STONE, -0.04), 0.5, true);
  p.rect(0, 0, W, 0.85, mix(MONU_STONE, '#8e897e', 0.5));
  p.grain(env.grain, 0.2, 'overlay');
  p.hline(0, 0.85, W, 0.035, 'rgba(255,255,245,0.35)');
  p.hline(0, 0.8, W, 0.02, 'rgba(0,0,0,0.25)');
  p.shade(0, 0, W, 1.3, 0.34, 0);
  p.shade(0, H - 0.5, W, 0.18, 0, 0.32);
  p.rect(0, H - 0.32, W, 0.32, tone(MONU_STONE, 0.1));
  p.hline(0, H - 0.32, W, 0.025, 'rgba(0,0,0,0.3)');
  p.hline(0, H - 0.012, W, 0.02, 'rgba(255,255,245,0.5)');
  if (door) {
    const dw = 2.2, dx = (W - dw) / 2, dh = 4.2, rise = 1.1;
    p.arch(dx - 0.22, 0, dw + 0.44, dh + 0.24, rise + 0.22, tone(MONU_STONE, 0.1));
    p.rect(W / 2 - 0.16, dh - 0.02, 0.32, 0.4, tone(MONU_STONE, 0.17));
    const wood = '#3a2a1e';
    p.arch(dx, 0, dw, dh, rise, p.gradient(0, dh, tone(wood, -0.3), tone(wood, 0.08)));
    p.clipArch(dx, 0, dw, dh, rise);
    const tr = 3.0;
    p.rect(dx, tr, dw, dh - tr, '#252b32');
    p.mask(dx, tr, dw, dh - tr, 0.8);
    for (let i = 1; i < 10; i++) p.bar(dx + (dw * i) / 10 - 0.012, tr, 0.024, dh - tr, IRON);
    p.bar(dx, tr - 0.14, dw, 0.18, tone(wood, 0.12));
    for (let leaf = 0; leaf < 2; leaf++) {
      const lx = dx + leaf * (dw / 2) + 0.14, lw = dw / 2 - 0.28;
      for (const [py, ph] of [[0.28, 0.85], [1.3, 1.4]] as const) {
        p.rect(lx, py, lw, ph, tone(wood, 0.1));
        p.rect(lx + 0.06, py + 0.06, lw - 0.12, ph - 0.12, tone(wood, -0.1));
        p.hline(lx, py + ph, lw, 0.016, 'rgba(255,255,255,0.2)');
        p.hline(lx, py, lw, 0.016, 'rgba(0,0,0,0.45)');
      }
    }
    p.vline(W / 2, 0, tr - 0.14, 0.026, 'rgba(0,0,0,0.6)');
    p.disc(W / 2 - 0.11, 1.1, 0.045, '#b8994a');
    p.disc(W / 2 + 0.11, 1.1, 0.045, '#b8994a');
    p.shade(dx, dh - 0.6 - rise, dw, 0.6 + rise, 0, 0.5);
    p.hgrad(dx, 0, 0.26, dh, 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0)');
    p.unclip();
    p.rect(dx - 0.06, 0, dw + 0.12, 0.09, '#a9a497');
    return;
  }
  const ww = 1.5, wx = (W - ww) / 2, wy = 1.5, wh = 2.7, rise = 0.75;
  p.arch(wx - 0.2, wy - 0.02, ww + 0.4, wh + 0.22, rise + 0.2, tone(MONU_STONE, 0.08));
  p.rect(wx - 0.26, wy - 0.12, ww + 0.52, 0.11, tone(MONU_STONE, 0.12));
  p.shade(wx - 0.24, wy - 0.3, ww + 0.5, 0.18, 0, 0.3);
  paintWindow(p, wx, wy, ww, wh, { frame: '#e6e3da', bars: 3, rise, glow: 0.75 });
  for (let i = 1; i < 10; i++) p.bar(wx + (ww * i) / 10 - 0.01, wy, 0.02, wh - rise - 0.2, IRON);
  p.bar(wx, wy + 0.2, ww, 0.03, IRON);
  p.bar(wx, wy + wh - rise - 0.24, ww, 0.03, IRON);
}

export function paintMonumentalFamily(p: CellPainter, env: PaintEnv, _variant: number, emit: () => void): void {
  monumentalGround(p, env, false); emit();
  monumentalGround(p, env, true); emit();
  monumentalFloor(p, env, false); emit();
  monumentalFloor(p, env, true); emit();
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Cours, pignons, béton
// ─────────────────────────────────────────────────────────────────────────────────────

const COUR = '#d6d0c2';

export function paintCourtyardGround(p: CellPainter, env: PaintEnv): void {
  const W = 2.7, H = 3.5;
  plasterWall(p, env, W, H, tone(COUR, -0.04));
  p.rect(0, 0, W, 0.9, '#8f8b84');
  p.grain(env.grain, 0.15, 'overlay');
  p.shade(0, 0, W, 1.4, 0.35, 0);
  const ww = 0.95, wh = 1.5, wx = (W - ww) / 2, wy = 1.25;
  p.rect(wx - 0.06, wy - 0.06, ww + 0.12, 0.06, tone(COUR, 0.06));
  p.shade(wx - 0.05, wy - 0.18, ww + 0.12, 0.12, 0, 0.25);
  paintWindow(p, wx, wy, ww, wh, { frame: '#e4e1d9', bars: 2, glow: 0.8 });
  p.shade(0, H - 0.06, W, 0.06, 0, 0.14);
}

export function paintCourtyardFloor(p: CellPainter, env: PaintEnv): void {
  const W = 2.7, H = 3.0;
  plasterWall(p, env, W, H, COUR);
  p.hline(0, 0.02, W, 0.02, 'rgba(0,0,0,0.12)');
  const ww = 0.95, wh = 1.6, wx = (W - ww) / 2, wy = 0.85;
  p.rect(wx - 0.06, wy - 0.06, ww + 0.12, 0.06, tone(COUR, 0.06));
  p.shade(wx - 0.05, wy - 0.18, ww + 0.12, 0.12, 0, 0.25);
  p.shade(wx - 0.02, wy - 0.95, 0.07, 0.75, 0, 0.12);
  p.shade(wx + ww - 0.05, wy - 0.95, 0.07, 0.75, 0, 0.12);
  paintWindow(p, wx, wy, ww, wh, { frame: '#e4e1d9', bars: 2 });
  p.bar(wx, wy + 0.4, ww, 0.028, IRON);
  // descente d'eaux pluviales
  p.rect(W - 0.26, 0, 0.1, H, '#8a9299');
  p.vline(W - 0.16, 0, H, 0.014, 'rgba(0,0,0,0.35)');
  p.vline(W - 0.25, 0, H, 0.012, 'rgba(255,255,255,0.25)');
  p.rect(W - 0.28, 1.4, 0.14, 0.05, '#6f777d');
}

/** Mur pignon enduit : taches, coulures, fantômes de planchers et de conduits. */
export function paintGable(p: CellPainter, env: PaintEnv, variant: number): void {
  const W = 2.8, H = 3.2;
  const base = variant === 0 ? '#d3cbb9' : '#bfbbb2';
  p.begin(W, H, base);
  p.grain(env.blotch, 0.75, 'overlay');
  p.grain(env.grain, 0.25, 'overlay');
  const rnd = makeRandom(900 + variant);
  // coulures verticales
  for (let i = 0; i < 9; i++) {
    const x = rnd() * W, w = 0.05 + rnd() * 0.22, y = rnd() * H * 0.5;
    p.shade(x, y, w, H - y, 0, 0.05 + rnd() * 0.08);
  }
  // reprises d'enduit
  for (let i = 0; i < 3; i++) {
    const x = rnd() * (W - 0.9), y = rnd() * (H - 0.8);
    p.rect(x, y, 0.4 + rnd() * 0.5, 0.3 + rnd() * 0.5, rgba(tone(base, 0.12), 0.35));
  }
  if (variant === 0) {
    // trace d'un ancien conduit de fumée
    p.rect(1.05, 0, 0.42, H, 'rgba(60,45,30,0.1)');
    p.vline(1.05, 0, H, 0.014, 'rgba(0,0,0,0.12)');
    p.vline(1.47, 0, H, 0.014, 'rgba(0,0,0,0.12)');
  }
  p.hline(0, 0.01, W, 0.02, 'rgba(0,0,0,0.07)');
}

/** Béton brut : banches, trous d'écarteurs, coulures. */
export function paintConcrete(p: CellPainter, env: PaintEnv): void {
  const W = 2.8, H = 3.2;
  p.begin(W, H, '#b4b2ab');
  p.grain(env.blotch, 0.6, 'overlay');
  p.grain(env.grain, 0.35, 'overlay');
  for (let r = 0; r < 4; r++) p.hline(0, r * 0.8, W, 0.014, 'rgba(0,0,0,0.2)');
  for (let cx = 0; cx < 2; cx++) p.vline(cx * 1.4, 0, H, 0.012, 'rgba(0,0,0,0.16)');
  for (let r = 0; r < 4; r++) for (let cx = 0; cx < 4; cx++) p.disc(0.35 + cx * 0.7, 0.4 + r * 0.8, 0.022, 'rgba(0,0,0,0.3)');
  const rnd = makeRandom(77);
  for (let i = 0; i < 6; i++) p.shade(rnd() * W, 0, 0.08 + rnd() * 0.2, H * (0.4 + rnd() * 0.6), 0.1, 0);
}
