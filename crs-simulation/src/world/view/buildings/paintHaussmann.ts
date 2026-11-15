/* =====================================================================================
 * IMMEUBLES — peinture des façades haussmanniennes (canvas 2D)
 * -------------------------------------------------------------------------------------
 * Cinq cellules par variante : rez-de-chaussée à refends, porte cochère, étage courant,
 * étage noble (grande porte-fenêtre, entablement), dernier étage (corniche à modillons).
 * Une cellule = une travée de 2,8 m × un niveau de 3,2 m (4 m au rez-de-chaussée).
 * Aussi : les éléments communs à tous les styles (mur de pierre, fenêtre, garde-corps).
 * ===================================================================================== */

import { CellPainter, makeRandom, mix, rgba, tone } from './paint';

export const IRON = '#1b1c20';
const IRON_LIGHT = '#3a3c42';

export interface PaintEnv {
  /** Bruit raccordable : grain fin de la pierre, et grandes taches de patine. */
  grain: HTMLCanvasElement;
  blotch: HTMLCanvasElement;
  /** Bruit très fin, pour la couche de détail vue de près. */
  fine: HTMLCanvasElement;
  /** Peindre les balcons et garde-corps filants dans la texture (qualité basse : pas de balcons en volume). */
  paintedBalconies: boolean;
}

export interface HaussmannPalette {
  stone: string;
  frame: string;
  door: string;
  /** Refends (joints creusés) sur toute la hauteur de la façade. */
  refends: boolean;
  /** Fronton triangulaire à l'étage noble (sinon entablement droit). */
  pediment: boolean;
  /** Persiennes métalliques repliées dans l'embrasure. */
  shutters: boolean;
}

export const HAUSSMANN_PALETTES: HaussmannPalette[] = [
  { stone: '#dccfb5', frame: '#ebe8de', door: '#1f3a2c', refends: false, pediment: false, shutters: false },
  { stone: '#e0d4bb', frame: '#e6e2d6', door: '#1c2d49', refends: true, pediment: true, shutters: false },
  { stone: '#d3cab7', frame: '#dcd9d0', door: '#4b2721', refends: false, pediment: false, shutters: true },
];

// ─────────────────────────────────────────────────────────────────────────────────────
// Éléments communs
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Mur de pierre de taille : teinte, grain, assises. `course` = hauteur d'assise (m) ;
 * `deep` = joints creusés (refends), sinon joints fins.
 */
export function stoneWall(p: CellPainter, env: PaintEnv, w: number, h: number, stone: string, course: number, deep: boolean): void {
  p.begin(w, h, stone);
  const rows = Math.round(h / course);
  const ch = h / rows;
  const stones = 4;
  const rnd = makeRandom(1234 + Math.round(course * 100) + (deep ? 7 : 0));
  // chaque pierre a sa nuance : c'est ce qui fait la pierre de taille (et non un bruit uniforme)
  for (let r = 0; r < rows; r++) {
    for (let s = -1; s < stones; s++) {
      const x = ((s + (r % 2) * 0.5) / stones) * w;
      const k = rnd() - 0.5;
      p.rect(x, r * ch, w / stones, ch, k > 0 ? `rgba(255,250,235,${(k * 0.16).toFixed(3)})` : `rgba(70,50,20,${(-k * 0.13).toFixed(3)})`);
      if (s === -1) p.rect(x + w, r * ch, w / stones, ch, k > 0 ? `rgba(255,250,235,${(k * 0.16).toFixed(3)})` : `rgba(70,50,20,${(-k * 0.13).toFixed(3)})`);
    }
  }
  p.grain(env.blotch, 0.1, 'overlay');
  p.grain(env.grain, 0.3, 'overlay');
  for (let r = 0; r < rows; r++) {
    const y = r * ch;
    if (deep) {
      p.hline(0, y + 0.012, w, 0.035, 'rgba(40,32,20,0.42)');
      p.hline(0, y - 0.022, w, 0.02, 'rgba(255,250,235,0.22)');
    } else {
      p.hline(0, y, w, 0.012, 'rgba(60,48,30,0.16)');
      p.hline(0, y - 0.014, w, 0.01, 'rgba(255,250,235,0.08)');
    }
    // joints montants en quinconce (4 pierres par travée)
    for (let s = 0; s < stones; s++) {
      const x = ((s + (r % 2) * 0.5) / stones) * w;
      p.vline(x, y, ch, deep ? 0.016 : 0.01, deep ? 'rgba(40,32,20,0.2)' : 'rgba(60,48,30,0.1)');
    }
  }
}

export interface WindowOptions {
  frame: string;
  /** Nombre de petits bois horizontaux par vantail. */
  bars: number;
  /** Flèche du cintre (0 : linteau droit). */
  rise?: number;
  /** Voilages. */
  curtains?: boolean;
  /** Valeur du masque (1 = vitre claire ; moins = vitre qui s'éclaire peu). */
  glow?: number;
  /** Fenêtre à un seul vantail (pas de montant central). */
  single?: boolean;
}

/** Fenêtre : embrasure sombre, vitrage, voilages, menuiserie, ombre de l'embrasure. */
export function paintWindow(p: CellPainter, x: number, y: number, w: number, h: number, o: WindowOptions): void {
  const rise = o.rise ?? 0;
  p.arch(x, y, w, h, rise, p.gradient(y, h, '#141a20', '#2d3741'));
  p.archMask(x, y, w, h, rise, o.glow ?? 1);
  p.clipArch(x, y, w, h, rise);
  if (o.curtains !== false) {
    // voilages : deux pans clairs, plus opaques sur les bords
    p.hgrad(x, y, w * 0.34, h, 'rgba(226,220,205,0.5)', 'rgba(226,220,205,0.06)');
    p.hgrad(x + w * 0.66, y, w * 0.34, h, 'rgba(226,220,205,0.06)', 'rgba(226,220,205,0.5)');
    p.rect(x, y + h - 0.22, w, 0.22, 'rgba(226,220,205,0.25)');
  }
  // reflet du ciel en haut du vitrage
  p.light(x, y + h * 0.55, w, h * 0.45, 0, 0.09);
  const f = 0.055;
  // dormant et ouvrants
  p.bar(x, y, f, h, o.frame);
  p.bar(x + w - f, y, f, h, o.frame);
  p.bar(x, y, w, f * 0.9, o.frame);
  p.bar(x, y + h - f - rise * 0.25, w, f, o.frame);
  if (!o.single) {
    p.bar(x + w / 2 - 0.035, y, 0.07, h, o.frame);
    p.vline(x + w / 2, y, h, 0.012, 'rgba(0,0,0,0.35)');
  }
  for (let b = 1; b <= o.bars; b++) {
    const by = y + (h - rise * 0.5) * (b / (o.bars + 1));
    p.bar(x + f, by - 0.014, w - 2 * f, 0.028, o.frame);
  }
  if (rise > 0) p.bar(x, y + h - rise - 0.03, w, 0.05, o.frame);     // traverse d'imposte du cintre
  // ombre portée par le tableau : en haut et à gauche
  p.shade(x, y + h - 0.3 - rise, w, 0.3 + rise, 0, 0.5);
  p.hgrad(x, y, 0.16, h, 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0)');
  p.unclip();
}

/**
 * Garde-corps en fonte : lisses, barreaux et frise de cercles. Tracé de x0 à x1 ; les barreaux
 * sont calés pour se raccorder d'une travée à l'autre quand le garde-corps est filant.
 */
export function paintRailing(p: CellPainter, x0: number, x1: number, y: number, h: number, rich: boolean): void {
  const w = x1 - x0;
  const n = Math.max(2, Math.round(w / 0.115));
  const step = w / n;
  for (let i = 0; i < n; i++) p.bar(x0 + (i + 0.5) * step - 0.009, y + 0.04, 0.018, h - (rich ? 0.26 : 0.06), IRON);
  p.bar(x0, y + 0.03, w, 0.03, IRON);
  if (rich) {
    p.bar(x0, y + h - 0.25, w, 0.026, IRON);
    const rings = Math.max(1, Math.round(w / 0.23));
    const rs = w / rings;
    for (let i = 0; i < rings; i++) p.ring(x0 + (i + 0.5) * rs, y + h - 0.135, 0.075, 0.02, IRON);
  }
  p.bar(x0, y + h - 0.045, w, 0.045, IRON);
  p.hline(x0, y + h - 0.008, w, 0.012, IRON_LIGHT);
}

/** Encadrement de baie en pierre : jambages, linteau, appui ; lumière en haut à gauche. */
export function paintSurround(p: CellPainter, x: number, y: number, w: number, h: number, t: number, stone: string, sill: boolean): void {
  const lit = tone(stone, 0.1), dark = tone(stone, -0.1);
  // ombre portée de l'encadrement sur le mur, à droite et dessous
  p.rect(x + w + t, y, 0.035, h + t, 'rgba(0,0,0,0.2)');
  p.rect(x - t, y, t, h, lit);
  p.rect(x + w, y, t, h, tone(stone, 0.03));
  p.rect(x - t, y + h, w + 2 * t, t, lit);
  p.hline(x - t, y + h + t, w + 2 * t, 0.014, 'rgba(255,255,245,0.5)');
  p.vline(x - t, y, h + t, 0.012, 'rgba(255,255,245,0.35)');
  p.vline(x + w + t, y, h + t, 0.012, rgba(dark, 0.6));
  if (sill) {
    p.rect(x - t - 0.05, y - 0.07, w + 2 * t + 0.1, 0.07, lit);
    p.shade(x - t - 0.03, y - 0.2, w + 2 * t + 0.1, 0.13, 0, 0.3);
    // coulures sous les angles de l'appui
    p.shade(x - t - 0.02, y - 0.75, 0.08, 0.6, 0, 0.1);
    p.shade(x + w + t - 0.05, y - 0.75, 0.08, 0.6, 0, 0.1);
  }
}

/** Bandeau d'étage au pied de la cellule, et son ombre portée en tête de la cellule du dessous. */
export function paintStringCourse(p: CellPainter, w: number, h: number, stone: string, height: number): void {
  p.rect(0, 0, w, height, tone(stone, 0.07));
  p.hline(0, height, w, 0.014, 'rgba(255,255,245,0.45)');
  p.hline(0, 0.006, w, 0.014, 'rgba(0,0,0,0.25)');
  // en tête de cellule : ombre du bandeau (ou du balcon) de l'étage supérieur
  p.shade(0, h - 0.12, w, 0.12, 0, 0.26);
}

/** Dalle de balcon peinte (nez éclairé, sous-face dans l'ombre) et garde-corps filant. */
function paintedBalcony(p: CellPainter, w: number, stone: string): void {
  p.rect(0, 0, w, 0.16, tone(stone, 0.1));
  p.hline(0, 0.16, w, 0.016, 'rgba(255,255,245,0.6)');
  p.hline(0, 0.012, w, 0.03, 'rgba(0,0,0,0.4)');
  paintRailing(p, 0, w, 0.17, 0.98, true);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Cellules
// ─────────────────────────────────────────────────────────────────────────────────────

const W = 2.8;

function typicalFloor(p: CellPainter, env: PaintEnv, pal: HaussmannPalette): void {
  const H = 3.2;
  stoneWall(p, env, W, H, pal.stone, 0.4, pal.refends);
  paintStringCourse(p, W, H, pal.stone, 0.11);
  const ww = 1.22, wh = 2.28, wx = (W - ww) / 2, wy = 0.36;
  paintSurround(p, wx, wy, ww, wh, 0.14, pal.stone, true);
  // clef et petite corniche de linteau
  p.rect(wx - 0.2, wy + wh + 0.14, ww + 0.4, 0.05, tone(pal.stone, 0.12));
  p.shade(wx - 0.2, wy + wh + 0.09, ww + 0.4, 0.05, 0, 0.2);
  p.rect(W / 2 - 0.1, wy + wh, 0.2, 0.19, tone(pal.stone, 0.14));
  p.vline(W / 2 + 0.1, wy + wh, 0.19, 0.014, 'rgba(0,0,0,0.25)');
  paintWindow(p, wx, wy, ww, wh, { frame: pal.frame, bars: 3 });
  if (pal.shutters) {
    // persiennes repliées en tableau
    for (const sx of [wx, wx + ww - 0.13]) {
      p.bar(sx, wy, 0.13, wh, '#c9cdcc');
      for (let s = 0; s < 3; s++) p.vline(sx + 0.033 * (s + 1), wy, wh, 0.008, 'rgba(0,0,0,0.3)');
    }
  }
  paintRailing(p, wx - 0.03, wx + ww + 0.03, wy, 0.92, true);
}

function nobleFloor(p: CellPainter, env: PaintEnv, pal: HaussmannPalette): void {
  const H = 3.2;
  stoneWall(p, env, W, H, pal.stone, 0.4, pal.refends);
  paintStringCourse(p, W, H, pal.stone, 0.13);
  const ww = 1.28, wh = 2.52, wx = (W - ww) / 2, wy = 0.15;
  paintSurround(p, wx, wy, ww, wh, 0.15, pal.stone, false);
  const top = wy + wh + 0.15;
  const lit = tone(pal.stone, 0.13);
  if (pal.pediment) {
    // fronton triangulaire sur consoles
    const c = p.c;
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath();
    c.moveTo(p.px(wx - 0.3), p.py(top - 0.04)); c.lineTo(p.px(W / 2 + 0.03), p.py(top + 0.33)); c.lineTo(p.px(wx + ww + 0.36), p.py(top - 0.04)); c.closePath();
    c.fill();
    c.fillStyle = lit;
    c.beginPath();
    c.moveTo(p.px(wx - 0.32), p.py(top)); c.lineTo(p.px(W / 2), p.py(top + 0.36)); c.lineTo(p.px(wx + ww + 0.32), p.py(top)); c.closePath();
    c.fill();
    c.fillStyle = tone(pal.stone, -0.06);
    c.beginPath();
    c.moveTo(p.px(wx - 0.16), p.py(top + 0.05)); c.lineTo(p.px(W / 2), p.py(top + 0.26)); c.lineTo(p.px(wx + ww + 0.16), p.py(top + 0.05)); c.closePath();
    c.fill();
    p.rect(wx - 0.32, top - 0.06, ww + 0.64, 0.07, lit);
    p.shade(wx - 0.3, top - 0.16, ww + 0.6, 0.1, 0, 0.32);
  } else {
    // entablement droit sur consoles
    p.rect(wx - 0.3, top + 0.02, ww + 0.6, 0.13, lit);
    p.hline(wx - 0.3, top + 0.15, ww + 0.6, 0.014, 'rgba(255,255,245,0.6)');
    p.rect(wx - 0.24, top - 0.04, ww + 0.48, 0.06, tone(pal.stone, 0.04));
    p.shade(wx - 0.28, top - 0.16, ww + 0.6, 0.12, 0, 0.34);
  }
  for (const cx of [wx - 0.24, wx + ww + 0.12]) {
    p.rect(cx, top - 0.3, 0.12, 0.3, tone(pal.stone, 0.08));
    p.vline(cx + 0.12, top - 0.3, 0.3, 0.014, 'rgba(0,0,0,0.3)');
  }
  paintWindow(p, wx, wy, ww, wh, { frame: pal.frame, bars: 3 });
  if (env.paintedBalconies) paintedBalcony(p, W, pal.stone);
}

function topFloor(p: CellPainter, env: PaintEnv, pal: HaussmannPalette): void {
  const H = 3.2;
  stoneWall(p, env, W, H, pal.stone, 0.4, pal.refends);
  paintStringCourse(p, W, H, pal.stone, 0.13);
  const ww = 1.14, wh = 2.12, wx = (W - ww) / 2, wy = 0.15;
  paintSurround(p, wx, wy, ww, wh, 0.11, pal.stone, false);
  paintWindow(p, wx, wy, ww, wh, { frame: pal.frame, bars: 2 });
  // corniche : frise, modillons dans l'ombre, larmier éclairé, chéneau de zinc
  const y0 = 2.58;
  p.rect(0, y0, W, 0.1, tone(pal.stone, 0.06));
  p.rect(0, y0 + 0.1, W, 0.22, tone(pal.stone, -0.34));
  const blocks = 10;
  for (let i = 0; i < blocks; i++) {
    const bx = ((i + 0.25) / blocks) * W;
    p.rect(bx, y0 + 0.12, (W / blocks) * 0.5, 0.2, tone(pal.stone, -0.04));
    p.vline(bx, y0 + 0.12, 0.2, 0.012, 'rgba(255,255,245,0.3)');
  }
  p.rect(0, y0 + 0.32, W, 0.2, tone(pal.stone, 0.12));
  p.hline(0, y0 + 0.52, W, 0.016, 'rgba(255,255,245,0.6)');
  p.rect(0, y0 + 0.52, W, 0.1, '#868f96');
  p.hline(0, y0 + 0.535, W, 0.02, 'rgba(0,0,0,0.3)');
  p.shade(0, y0 - 0.22, W, 0.22, 0, 0.25);
  if (env.paintedBalconies) paintedBalcony(p, W, pal.stone);
}

function groundFloorWall(p: CellPainter, env: PaintEnv, pal: HaussmannPalette): number {
  const H = 4.0;
  stoneWall(p, env, W, H, tone(pal.stone, -0.03), 0.5, true);
  // soubassement
  p.rect(0, 0, W, 0.62, mix(pal.stone, '#8e897e', 0.55));
  p.grain(env.grain, 0.25, 'overlay');
  p.hline(0, 0.62, W, 0.03, 'rgba(255,255,245,0.35)');
  p.hline(0, 0.585, W, 0.02, 'rgba(0,0,0,0.25)');
  p.shade(0, 0, W, 1.1, 0.34, 0);
  // bandeau haut du rez-de-chaussée
  p.shade(0, H - 0.42, W, 0.16, 0, 0.3);
  p.rect(0, H - 0.26, W, 0.26, tone(pal.stone, 0.08));
  p.hline(0, H - 0.012, W, 0.02, 'rgba(255,255,245,0.5)');
  p.hline(0, H - 0.26, W, 0.02, 'rgba(0,0,0,0.3)');
  return H;
}

function groundFloor(p: CellPainter, env: PaintEnv, pal: HaussmannPalette, variant: number): void {
  groundFloorWall(p, env, pal);
  const ww = 1.2, wx = (W - ww) / 2, wy = 1.2;
  const rise = variant === 0 ? 0.6 : 0;
  const wh = variant === 0 ? 2.2 : 2.0;
  // encadrement : claveaux
  p.arch(wx - 0.15, wy - 0.02, ww + 0.3, wh + 0.17, rise > 0 ? rise + 0.15 : 0, tone(pal.stone, 0.07));
  if (rise === 0) p.rect(W / 2 - 0.12, wy + wh, 0.24, 0.24, tone(pal.stone, 0.13));
  p.rect(wx - 0.2, wy - 0.1, ww + 0.4, 0.09, tone(pal.stone, 0.1));
  p.shade(wx - 0.2, wy - 0.24, ww + 0.4, 0.14, 0, 0.28);
  paintWindow(p, wx, wy, ww, wh, { frame: pal.frame, bars: 2, rise, glow: 0.75 });
  // grille de défense
  const n = 9;
  for (let i = 1; i < n; i++) p.bar(wx + (ww * i) / n - 0.009, wy, 0.018, wh - rise - 0.25, IRON);
  p.bar(wx, wy + 0.18, ww, 0.025, IRON);
  p.bar(wx, wy + wh - rise - 0.28, ww, 0.025, IRON);
}

function carriageDoor(p: CellPainter, env: PaintEnv, pal: HaussmannPalette, variant: number): void {
  groundFloorWall(p, env, pal);
  const dw = 1.84, dx = (W - dw) / 2, dh = 3.3;
  const rise = variant === 0 ? 0.92 : variant === 1 ? 0.4 : 0;
  // encadrement et clef
  p.arch(dx - 0.17, 0, dw + 0.34, dh + 0.18, rise > 0 ? rise + 0.17 : 0, tone(pal.stone, 0.08));
  p.rect(W / 2 - 0.14, dh - 0.02, 0.28, 0.3, tone(pal.stone, 0.15));
  p.vline(W / 2 + 0.14, dh - 0.02, 0.3, 0.014, 'rgba(0,0,0,0.3)');
  // vantaux
  const door = pal.door;
  p.arch(dx, 0, dw, dh, rise, p.gradient(0, dh, tone(door, -0.25), tone(door, 0.06)));
  p.clipArch(dx, 0, dw, dh, rise);
  const transom = 2.42;
  // imposte vitrée et sa grille
  p.rect(dx, transom, dw, dh - transom, '#262c33');
  p.mask(dx, transom, dw, dh - transom, 0.8);
  p.light(dx, transom, dw, dh - transom, 0, 0.1);
  for (let i = 1; i < 8; i++) p.bar(dx + (dw * i) / 8 - 0.01, transom, 0.02, dh - transom, IRON);
  p.bar(dx, transom + (dh - transom) * 0.5, dw, 0.025, IRON);
  p.bar(dx, transom - 0.12, dw, 0.16, tone(door, 0.1));
  p.hline(dx, transom + 0.04, dw, 0.014, 'rgba(255,255,255,0.2)');
  p.hline(dx, transom - 0.12, dw, 0.02, 'rgba(0,0,0,0.4)');
  // panneaux moulurés
  for (let leaf = 0; leaf < 2; leaf++) {
    const lx = dx + leaf * (dw / 2) + 0.12, lw = dw / 2 - 0.24;
    for (const [py, ph] of [[0.24, 0.72], [1.1, 1.1]] as const) {
      p.rect(lx, py, lw, ph, tone(door, 0.07));
      p.rect(lx + 0.05, py + 0.05, lw - 0.1, ph - 0.1, tone(door, -0.08));
      p.hline(lx, py + ph, lw, 0.014, 'rgba(255,255,255,0.22)');
      p.vline(lx, py, ph, 0.012, 'rgba(255,255,255,0.16)');
      p.hline(lx, py, lw, 0.014, 'rgba(0,0,0,0.4)');
      p.vline(lx + lw, py, ph, 0.012, 'rgba(0,0,0,0.4)');
    }
  }
  p.vline(W / 2, 0, transom - 0.12, 0.022, 'rgba(0,0,0,0.55)');
  p.rect(dx, 0, dw, 0.16, tone(door, -0.35));
  p.disc(W / 2 - 0.09, 1.02, 0.035, '#b8994a');
  p.disc(W / 2 + 0.09, 1.02, 0.035, '#b8994a');
  // ombre de l'embrasure
  p.shade(dx, dh - 0.5 - rise, dw, 0.5 + rise, 0, 0.5);
  p.hgrad(dx, 0, 0.22, dh, 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0)');
  p.unclip();
  // seuil
  p.rect(dx - 0.05, 0, dw + 0.1, 0.07, '#a9a497');
}

/** Peint les cinq cellules d'une variante haussmannienne ; `emit` est appelé après chacune, dans l'ordre des couches. */
export function paintHaussmannFamily(p: CellPainter, env: PaintEnv, variant: number, emit: () => void): void {
  const pal = HAUSSMANN_PALETTES[variant % HAUSSMANN_PALETTES.length];
  groundFloor(p, env, pal, variant); emit();
  carriageDoor(p, env, pal, variant); emit();
  typicalFloor(p, env, pal); emit();
  nobleFloor(p, env, pal); emit();
  topFloor(p, env, pal); emit();
}
