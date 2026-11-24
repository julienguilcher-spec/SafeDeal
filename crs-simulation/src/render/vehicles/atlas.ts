/* Atlas de marquages des véhicules, dessiné sur canvas : sérigraphie « POLICE », « GENDARMERIE »,
 * « SAPEURS-POMPIERS », « SAMU », lumineux « TAXI », bandes tricolores, grilles de protection à découpe alpha,
 * jantes, vitrages (intact, brisé, brûlé), banderole du camion sono… Aucune marque réelle.
 *
 * Les niveaux de mipmap sont construits à la main : la grille de protection est REDESSINÉE en vectoriel à
 * chaque niveau (ses fils gardent au moins un pixel d'épaisseur, la découpe alpha ne la fait donc pas
 * disparaître à distance) ; les autres tuiles sont réduites de niveau en niveau. */

import * as THREE from 'three';
import { ATLAS_H, ATLAS_W, GLASS_CELL, PLATE_COLS, PLATE_H, PLATE_ROWS, PLATE_SLOTS, PLATE_W, TILE_PX } from './atlas-layout';
import type { TileName } from './atlas-layout';

type Ctx = CanvasRenderingContext2D;
type Painter = (g: Ctx, w: number, h: number, px: number) => void;

const FONT = '"Arial Black", "Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif';
const BLUE = '#1d4e9e';

/** Texte centré, ajusté à la largeur disponible. */
function fitText(g: Ctx, text: string, cx: number, cy: number, maxW: number, size: number, color: string, weight = 900, spacing = 0): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const sp = g as unknown as { letterSpacing?: string };
  if (spacing && 'letterSpacing' in g) sp.letterSpacing = `${spacing}px`;
  let w = g.measureText(text).width;
  let s = size;
  if (w > maxW) { s = (size * maxW) / w; g.font = `${weight} ${s}px ${FONT}`; w = maxW; }
  g.fillStyle = color;
  g.fillText(text, cx + spacing / 2, cy + s * 0.04);
  if (spacing && 'letterSpacing' in g) sp.letterSpacing = '0px';
}

/** Générateur pseudo-aléatoire déterministe (les textures sont identiques d'une exécution à l'autre). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rim(g: Ctx, w: number, kind: 'tole' | 'alu' | 'pl' | 'moto'): void {
  const c = w / 2, R = w / 2;
  const disc = (r: number, color: string): void => { g.fillStyle = color; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill(); };
  if (kind === 'alu') {
    disc(R, '#2a2c30');
    disc(R * 0.98, '#b9bec5');
    disc(R * 0.84, '#17181b');
    g.strokeStyle = '#c3c8ce'; g.lineCap = 'butt';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const d of [-0.16, 0.16]) {
        g.lineWidth = R * 0.13;
        g.beginPath(); g.moveTo(c + Math.cos(a) * R * 0.16, c + Math.sin(a) * R * 0.16); g.lineTo(c + Math.cos(a + d) * R * 0.88, c + Math.sin(a + d) * R * 0.88); g.stroke();
      }
    }
    disc(R * 0.24, '#aeb3ba'); disc(R * 0.1, '#3a3d42');
  } else if (kind === 'tole') {
    disc(R, '#2a2c30'); disc(R * 0.98, '#8e939a'); disc(R * 0.8, '#6f747b'); disc(R * 0.62, '#9da2a9');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillStyle = '#1b1c1f'; g.beginPath(); g.ellipse(c + Math.cos(a) * R * 0.72, c + Math.sin(a) * R * 0.72, R * 0.11, R * 0.06, a + Math.PI / 2, 0, Math.PI * 2); g.fill();
    }
    disc(R * 0.3, '#5c6168');
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(c + Math.cos(a) * R * 0.19, c + Math.sin(a) * R * 0.19, R * 0.04, 0, Math.PI * 2); g.fill(); }
  } else if (kind === 'pl') {
    disc(R, '#3a3d42'); disc(R * 0.97, '#a4a9b0'); disc(R * 0.8, '#7d838b'); disc(R * 0.55, '#8f959c');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      g.fillStyle = '#1f2023'; g.beginPath(); g.arc(c + Math.cos(a) * R * 0.68, c + Math.sin(a) * R * 0.68, R * 0.075, 0, Math.PI * 2); g.fill();
    }
    disc(R * 0.4, '#5c6168');
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.fillStyle = '#c9ccd1'; g.beginPath(); g.arc(c + Math.cos(a) * R * 0.3, c + Math.sin(a) * R * 0.3, R * 0.04, 0, Math.PI * 2); g.fill(); }
    disc(R * 0.16, '#3a3d42');
  } else {
    disc(R, '#1b1c1f'); disc(R * 0.97, '#2f3136'); disc(R * 0.86, '#111214');
    g.strokeStyle = '#3a3d42'; g.lineWidth = R * 0.1;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * R * 0.9, c + Math.sin(a) * R * 0.9); g.stroke(); }
    // disque de frein
    g.strokeStyle = '#9aa0a6'; g.lineWidth = R * 0.12; g.beginPath(); g.arc(c, c, R * 0.5, 0, Math.PI * 2); g.stroke();
    disc(R * 0.2, '#55595f');
  }
}

const PAINTERS: Record<TileName, Painter> = {
  blanc: (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); },

  // trois cellules : intact (dégradé clair multiplié par la teinte du vitrage), brisé (rouge = fêlures,
  // vert = trous), brûlé (couleur directe : baie noircie, éclats de verre restants)
  verre: (g, _w, h) => {
    const c = GLASS_CELL;
    const grad = g.createLinearGradient(0, 0, c * 0.6, h);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.5, '#c8ced4'); grad.addColorStop(1, '#9aa3ab');
    g.fillStyle = grad; g.fillRect(0, 0, c, h);
    g.globalAlpha = 0.5; g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(c * 0.1, h); g.lineTo(c * 0.45, 0); g.lineTo(c * 0.6, 0); g.lineTo(c * 0.25, h); g.fill();
    g.globalAlpha = 1;
    // cellule 1 : brisé
    g.fillStyle = '#000000'; g.fillRect(c, 0, c, h);
    const r = rng(7);
    g.save(); g.beginPath(); g.rect(c, 0, c, h); g.clip();
    const impacts = [[c * 1.34, h * 0.4], [c * 1.72, h * 0.66]];
    g.lineCap = 'round';
    for (const [ix, iy] of impacts as [number, number][]) {
      // trou (canal vert) et auréole fêlée (canal rouge)
      const halo = g.createRadialGradient(ix, iy, 0, ix, iy, c * 0.34);
      halo.addColorStop(0, 'rgba(255,0,0,0.95)'); halo.addColorStop(0.5, 'rgba(255,0,0,0.5)'); halo.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = halo; g.fillRect(c, 0, c, h);
      g.strokeStyle = 'rgb(255,0,0)';
      for (let i = 0; i < 13; i++) {
        const a = (i / 13) * Math.PI * 2 + r() * 0.4;
        let x = ix, y = iy;
        g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { const d = c * (0.1 + r() * 0.14); const aa = a + (r() - 0.5) * 0.5; x += Math.cos(aa) * d; y += Math.sin(aa) * d; g.lineTo(x, y); }
        g.stroke();
      }
      for (let ring = 1; ring <= 3; ring++) {
        g.lineWidth = 1.1; g.beginPath();
        for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2; const d = c * 0.09 * ring * (0.85 + r() * 0.3); const x = ix + Math.cos(a) * d, y = iy + Math.sin(a) * d; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
      g.fillStyle = 'rgb(0,255,0)'; g.beginPath();
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const d = c * (0.045 + r() * 0.05); const x = ix + Math.cos(a) * d, y = iy + Math.sin(a) * d; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.fill();
    }
    g.restore();
    // cellule 2 : brûlé
    g.save(); g.beginPath(); g.rect(c * 2, 0, c, h); g.clip();
    g.fillStyle = '#050505'; g.fillRect(c * 2, 0, c, h);
    const r2 = rng(19);
    g.fillStyle = '#2a211b';
    for (let i = 0; i < 26; i++) {
      // dents de verre fondu sur le pourtour
      const along = r2(); const side = Math.floor(r2() * 4); const len = c * (0.05 + r2() * 0.12); const wd = c * (0.03 + r2() * 0.05);
      const x = c * 2 + (side < 2 ? along * c : side === 2 ? 0 : c), y = side < 2 ? (side === 0 ? 0 : h) : along * h;
      g.beginPath();
      if (side === 0) { g.moveTo(x - wd, y); g.lineTo(x + wd, y); g.lineTo(x, y + len); }
      else if (side === 1) { g.moveTo(x - wd, y); g.lineTo(x + wd, y); g.lineTo(x, y - len); }
      else if (side === 2) { g.moveTo(x, y - wd); g.lineTo(x, y + wd); g.lineTo(x + len, y); }
      else { g.moveTo(x, y - wd); g.lineTo(x, y + wd); g.lineTo(x - len, y); }
      g.fill();
    }
    g.restore();
  },

  // treillis soudé à mailles rectangulaires : la tuile couvre 1,6 m × 0,8 m (mailles de 5 cm)
  grille: (g, w, h, px) => {
    g.clearRect(0, 0, w, h);
    const cell = 16;
    const lw = Math.max(2.2, px * 1.05);
    g.strokeStyle = '#3d4147'; g.lineWidth = lw;
    for (let x = cell / 2; x < w; x += cell) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = cell / 2; y < h; y += cell) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // reflet du fil
    g.strokeStyle = '#6a7077'; g.lineWidth = Math.max(0.7, lw * 0.3);
    for (let x = cell / 2; x < w; x += cell) { g.beginPath(); g.moveTo(x - lw * 0.25, 0); g.lineTo(x - lw * 0.25, h); g.stroke(); }
  },

  jante_tole: (g, w) => rim(g, w, 'tole'),
  jante_alu: (g, w) => rim(g, w, 'alu'),
  jante_pl: (g, w) => rim(g, w, 'pl'),
  jante_moto: (g, w) => rim(g, w, 'moto'),

  police: (g, w, h) => { g.clearRect(0, 0, w, h); fitText(g, 'POLICE', w / 2, h / 2, w * 0.96, h * 0.98, BLUE, 900, h * 0.06); },
  gendarmerie: (g, w, h) => { g.clearRect(0, 0, w, h); fitText(g, 'GENDARMERIE', w / 2, h / 2, w * 0.97, h * 0.95, '#ffffff', 900, h * 0.05); },
  pompiers: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    fitText(g, 'SAPEURS-POMPIERS', w / 2, h * 0.36, w * 0.97, h * 0.6, '#ffffff', 900, h * 0.02);
    fitText(g, 'DE PARIS', w / 2, h * 0.8, w * 0.5, h * 0.34, '#ffffff', 900, h * 0.06);
  },
  samu: (g, w, h) => { g.clearRect(0, 0, w, h); fitText(g, 'SAMU', w / 2, h / 2, w * 0.96, h * 1.0, '#003da5', 900, h * 0.05); },
  ambulance: (g, w, h) => { g.clearRect(0, 0, w, h); fitText(g, 'AMBULANCE', w / 2, h / 2, w * 0.97, h * 0.95, '#003da5', 900, h * 0.06); },
  taxi: (g, w, h) => {
    g.fillStyle = '#f7f1cf'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = h * 0.06; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h * 0.9);
    fitText(g, 'TAXI', w / 2, h / 2, w * 0.8, h * 0.78, '#141414', 900, h * 0.08);
  },

  // sérigraphie latérale : hachures tricolores obliques en tête, puis liseré bleu continu
  bande_police: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const sk = h * 0.7;
    const bar = (x0: number, x1: number, color: string): void => {
      g.fillStyle = color; g.beginPath(); g.moveTo(x0 + sk, 0); g.lineTo(x1 + sk, 0); g.lineTo(x1, h); g.lineTo(x0, h); g.fill();
    };
    const u = h * 0.62;
    bar(u * 0.2, u * 1.2, BLUE); bar(u * 1.5, u * 2.5, '#ffffff'); bar(u * 2.8, u * 3.8, '#ef4135');
    bar(u * 4.3, u * 4.75, BLUE); bar(u * 5.0, u * 5.45, BLUE);
    g.fillStyle = BLUE;
    g.beginPath(); g.moveTo(u * 5.8 + sk * 0.72, h * 0.28); g.lineTo(w, h * 0.28); g.lineTo(w, h * 0.72); g.lineTo(u * 5.8 + sk * 0.28, h * 0.72); g.fill();
  },

  // chevrons arrière de signalisation (jaune fluo / rouge)
  chevrons: (g, w, h) => {
    g.fillStyle = '#e8ee30'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d3202a';
    const s = h * 0.5;
    for (let i = -6; i < 14; i++) {
      for (const dir of [1, -1]) {
        const x0 = w / 2 + dir * i * s;
        g.beginPath();
        g.moveTo(x0, h); g.lineTo(x0 + dir * s * 0.5, h); g.lineTo(x0 + dir * s * 0.5 - dir * h, 0); g.lineTo(x0 - dir * h, 0);
        g.fill();
      }
    }
    g.fillStyle = '#e8ee30'; g.fillRect(w / 2 - 1.5, 0, 3, h);
  },

  damier: (g, w, h) => {
    g.fillStyle = '#e6e22a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d3202a';
    const s = h / 2;
    for (let x = 0, i = 0; x < w; x += s, i++) g.fillRect(x, i % 2 ? 0 : s, s, s);
  },

  // girouette à LED ambre (numéro de ligne fictif, destination = lieu public réel)
  girouette: (g, w, h) => {
    g.fillStyle = '#0b0906'; g.fillRect(0, 0, w, h);
    fitText(g, '74   HÔTEL DE VILLE', w / 2, h / 2, w * 0.94, h * 0.72, '#ffb21e', 700, h * 0.04);
  },

  // banderole du camion sono : organisation et slogan fictifs (dossier 05)
  banderole: (g, w, h) => {
    g.fillStyle = '#1fa3a3'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.7, w, h * 0.3);
    g.fillStyle = '#f2c94c'; g.fillRect(0, h * 0.68, w, h * 0.035);
    fitText(g, 'HORIZON, C\'EST NON !', w / 2, h * 0.36, w * 0.94, h * 0.56, '#ffffff', 900, h * 0.02);
    fitText(g, 'FRONT COMMUN DES ATELIERS', w / 2, h * 0.86, w * 0.9, h * 0.2, '#147878', 900, h * 0.03);
    // œillets
    g.fillStyle = '#d7dadd';
    for (let x = h * 0.08; x < w; x += h * 0.9) { g.beginPath(); g.arc(x, h * 0.06, h * 0.022, 0, Math.PI * 2); g.fill(); }
  },

  enceinte: (g, w, h) => {
    g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a2b2f'; g.lineWidth = w * 0.03; g.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
    const cone = (cx: number, cy: number, r: number): void => {
      const gr = g.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      gr.addColorStop(0, '#3a3b40'); gr.addColorStop(0.3, '#17181b'); gr.addColorStop(0.9, '#26272b'); gr.addColorStop(1, '#4a4c52');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    };
    cone(w * 0.5, h * 0.63, w * 0.31); cone(w * 0.28, h * 0.2, w * 0.12); cone(w * 0.72, h * 0.2, w * 0.12);
  },

  calandre: (g, w, h) => {
    g.fillStyle = '#0d0e10'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2d31';
    const n = 6;
    for (let i = 0; i < n; i++) g.fillRect(w * 0.03, h * (0.08 + (i / n) * 0.86), w * 0.94, h * 0.055);
    g.fillStyle = '#1a1b1e'; g.fillRect(0, 0, w, h * 0.06); g.fillRect(0, h * 0.94, w, h * 0.06);
  },

  // face avant d'un berceau du lance-grenades : 15 tubes de 56 mm (3 rangées de 5)
  tubes: (g, w, h) => {
    g.fillStyle = '#1b1f26'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#30353e'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
    const cols = 5, rows = 3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = w * ((c + 0.5) / cols), cy = h * ((r + 0.5) / rows);
        const rad = Math.min(w / cols, h / rows) * 0.36;
        g.fillStyle = '#5a616c'; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#050607'; g.beginPath(); g.arc(cx, cy, rad * 0.76, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2a2f37'; g.beginPath(); g.arc(cx + rad * 0.2, cy - rad * 0.2, rad * 0.3, 0, Math.PI * 2); g.fill();
      }
    }
  },

  // tôles de blindage rapportées : joints et têtes de boulons (teinte multipliée par la carrosserie)
  blindage: (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8f8f8f'; g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
    for (const x of [w * 0.33, w * 0.66]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = '#9c9c9c';
    for (let x = 0.03; x < 1; x += 0.0605) {
      for (const y of [0.06, 0.94]) { g.beginPath(); g.arc(w * x, h * y, 1.8, 0, Math.PI * 2); g.fill(); }
    }
    for (let y = 0.2; y < 0.9; y += 0.2) for (const x of [0.03, 0.3, 0.36, 0.63, 0.69, 0.97]) { g.beginPath(); g.arc(w * x, h * y, 1.8, 0, Math.PI * 2); g.fill(); }
  },

  optique: (g, w, h) => {
    g.fillStyle = '#101114'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w * 0.42, h * 0.4, 1, w / 2, h / 2, w * 0.42);
    gr.addColorStop(0, '#5f7fa8'); gr.addColorStop(0.25, '#1c2c44'); gr.addColorStop(0.8, '#06080c'); gr.addColorStop(1, '#3a3d42');
    g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2); g.fill();
  },

  rideau: (g, w, h) => {
    g.fillStyle = '#b4b9bf'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      g.fillStyle = '#d4d8dc'; g.fillRect(0, y, w, 2);
      g.fillStyle = '#878c93'; g.fillRect(0, y + 6, w, 2);
    }
    g.fillStyle = '#5c6168'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#2a2c30'; g.fillRect(w * 0.4, h - 8, w * 0.2, 5);
  },

  led: (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b8c4d8';
    for (let x = 4; x < w; x += 8) for (let y = 4; y < h; y += 8) { g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill(); }
  },

  plancher: (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let x = 0; x < w; x += 16) {
      const v = 200 + Math.floor(r() * 50);
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 15, h);
      g.fillStyle = '#7a7a7a'; g.fillRect(x + 15, 0, 1, h);
    }
  },
};

/** Tuiles redessinées en vectoriel à chaque niveau de mipmap (fils fins qui doivent garder un pixel d'épaisseur). */
const VECTOR_MIPS: ReadonlySet<TileName> = new Set<TileName>(['grille']);
/** Tuiles à fond transparent (découpe alpha) : leur couverture est renforcée à chaque réduction. */
const CUTOUT: ReadonlySet<TileName> = new Set<TileName>(['police', 'gendarmerie', 'pompiers', 'samu', 'ambulance', 'bande_police']);

/**
 * Dessine l'atlas dans un canvas de largeur `width`. Niveau 0 (`prev` nul) : dessin vectoriel de chaque tuile.
 * Niveaux suivants : chaque tuile est la réduction de la même tuile du niveau précédent — les lettres gardent
 * exactement la même forme d'un niveau à l'autre, sans quoi le mélange trilinéaire suivi de la découpe alpha les
 * déchiquette. Les tuiles à découpe sont dessinées deux fois pour compenser la perte de couverture des traits fins.
 */
function drawAtlas(width: number, prev: HTMLCanvasElement | null): HTMLCanvasElement {
  const scale = width / ATLAS_W;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(ATLAS_H * scale));
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const ps = prev ? prev.width / ATLAS_W : 0;
  for (const name of Object.keys(TILE_PX) as TileName[]) {
    const t = TILE_PX[name];
    if (prev && !VECTOR_MIPS.has(name)) {
      const passes = CUTOUT.has(name) ? 2 : 1;
      for (let i = 0; i < passes; i++) g.drawImage(prev, t.x * ps, t.y * ps, t.w * ps, t.h * ps, t.x * scale, t.y * scale, t.w * scale, t.h * scale);
      continue;
    }
    g.save();
    g.setTransform(scale, 0, 0, scale, t.x * scale, t.y * scale);
    g.beginPath(); g.rect(0, 0, t.w, t.h); g.clip();
    PAINTERS[name](g, t.w, t.h, 1 / scale);
    g.restore();
  }
  return canvas;
}

/** Texture de l'atlas : `size` = largeur du niveau 0 (2048 ou 1024 selon la qualité). */
export function createAtlasTexture(size: number, anisotropy: number): THREE.CanvasTexture {
  const levels: HTMLCanvasElement[] = [];
  let prev: HTMLCanvasElement | null = null;
  for (let w = size; w >= 8; w >>= 1) {
    prev = drawAtlas(w, prev);
    levels.push(prev);
  }
  const tex = new THREE.CanvasTexture(levels[0]!);
  tex.mipmaps = levels as unknown as THREE.Texture['mipmaps'];
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ── plaques d'immatriculation ─────────────────────────────────────────────────────────

/**
 * Petite texture de plaques : 64 emplacements attribués aux véhicules affichés en détail, recyclés du plus
 * ancien au plus récent. Format français « AB-123-CD », bandeaux bleus latéraux (sans emblème).
 */
export class PlateAtlas {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: Ctx;
  private readonly owner = new Int32Array(PLATE_SLOTS);
  private readonly stamp = new Float64Array(PLATE_SLOTS);
  private readonly slotOf = new Map<number, number>();
  private clock = 0;
  private dirty = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = PLATE_COLS * PLATE_W;
    this.canvas.height = PLATE_ROWS * PLATE_H;
    this.g = this.canvas.getContext('2d')!;
    this.g.fillStyle = '#f2f2ee';
    this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.anisotropy = 4;
  }

  /** Emplacement de la plaque d'un véhicule (attribué et dessiné au besoin). Sans allocation une fois attribué. */
  slot(vehicleId: number, text: string): number {
    this.clock++;
    const known = this.slotOf.get(vehicleId);
    if (known !== undefined) { this.stamp[known] = this.clock; return known; }
    // emplacement libre, sinon le plus anciennement utilisé
    let best = 0, bestStamp = Infinity;
    for (let i = 0; i < PLATE_SLOTS; i++) {
      if (this.owner[i] === 0) { best = i; bestStamp = -1; break; }
      if (this.stamp[i]! < bestStamp) { bestStamp = this.stamp[i]!; best = i; }
    }
    if (this.owner[best] !== 0) this.slotOf.delete(this.owner[best]!);
    this.owner[best] = vehicleId;
    this.stamp[best] = this.clock;
    this.slotOf.set(vehicleId, best);
    this.draw(best, text);
    return best;
  }

  release(vehicleId: number): void {
    const s = this.slotOf.get(vehicleId);
    if (s === undefined) return;
    this.slotOf.delete(vehicleId);
    this.owner[s] = 0;
  }

  clear(): void {
    this.slotOf.clear();
    this.owner.fill(0);
  }

  /** À appeler une fois par image : téléverse la texture si une plaque a été dessinée. */
  flush(): void {
    if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; }
  }

  private draw(slot: number, text: string): void {
    const g = this.g;
    const x = (slot % PLATE_COLS) * PLATE_W, y = Math.floor(slot / PLATE_COLS) * PLATE_H;
    g.fillStyle = '#f4f4f0'; g.fillRect(x, y, PLATE_W, PLATE_H);
    g.fillStyle = '#1f3f93'; g.fillRect(x, y, 11, PLATE_H); g.fillRect(x + PLATE_W - 11, y, 11, PLATE_H);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.5; g.strokeRect(x + 0.75, y + 0.75, PLATE_W - 1.5, PLATE_H - 1.5);
    g.fillStyle = '#111111';
    g.font = `700 21px "Arial Narrow", Arial, "Liberation Sans Narrow", "DejaVu Sans Condensed", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text || 'AA-000-AA', x + PLATE_W / 2, y + PLATE_H / 2 + 1.5, PLATE_W - 28);
    this.dirty = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
