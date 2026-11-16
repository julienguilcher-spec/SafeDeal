/* =====================================================================================
 * RENDU DU DÉCOR — peinture des affiches (publicités et annonces FICTIVES : aucune marque, aucun
 * lieu de spectacle réel) et des graffitis (slogans génériques, sans cible réelle).
 * ===================================================================================== */

import type { G, Painter } from './atlas-paint-shops';

export const SANS = 'Arial, "Helvetica Neue", "DejaVu Sans", sans-serif';
export const SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif';

export function fill(g: G, w: number, h: number, c: string): void {
  g.fillStyle = c;
  g.fillRect(0, 0, w, h);
}

export function label(g: G, text: string, x: number, y: number, px: number, color: string, font = SANS, weight = '800', align: CanvasTextAlign = 'center'): void {
  g.font = `${weight} ${px}px ${font}`;
  g.textAlign = align;
  g.fillStyle = color;
  g.fillText(text, x, y);
}

// ───────────────────────────── affiches (128 × 192) ─────────────────────────────

export const POSTERS: readonly Painter[] = [
  (g, w, h, rnd) => {
    fill(g, w, h, '#f3ecdc');
    const cl = ['#d9480f', '#1d4e89', '#f2b705', '#16a085', '#a61e69'];
    for (let i = 0; i < 9; i++) {
      g.fillStyle = cl[i % cl.length]!;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.arc(20 + rnd() * 88, 24 + rnd() * 90, 10 + rnd() * 22, 0, 7);
      g.fill();
    }
    g.globalAlpha = 1;
    label(g, 'LUMIÈRES', w / 2, 146, 19, '#1a1a1a');
    label(g, "D'HIVER", w / 2, 166, 19, '#1a1a1a');
    label(g, 'Galerie des Arcades', w / 2, 182, 9, '#44484e', SANS, '400');
  },
  (g, w, h) => {
    fill(g, w, h, '#0f1020');
    for (let i = 0; i < 5; i++) {
      const gr = g.createLinearGradient(20 + i * 22, 0, 64, 150);
      gr.addColorStop(0, ['#ff5ea8', '#5ec8ff', '#ffe14a', '#7dff9a', '#c08aff'][i]!);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(16 + i * 24, 0);
      g.lineTo(30 + i * 24, 0);
      g.lineTo(96 - i * 10, 150);
      g.lineTo(40 - i * 4, 150);
      g.fill();
    }
    g.globalAlpha = 1;
    label(g, 'LES NUITS', w / 2, 138, 18, '#ffffff');
    label(g, 'DU CANAL', w / 2, 158, 18, '#ffe14a');
    label(g, 'concerts · 3 soirs', w / 2, 178, 9, '#c9c9d9', SANS, '400');
  },
  (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#f6d5c9');
    gr.addColorStop(1, '#c98a6a');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // flacon
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.roundRect(42, 58, 44, 64, 8);
    g.fill();
    g.fillStyle = '#c9a227';
    g.fillRect(54, 40, 20, 18);
    g.fillStyle = 'rgba(160,80,40,0.45)';
    g.fillRect(46, 88, 36, 30);
    label(g, 'ÉCLAT', w / 2, 152, 22, '#3a2218', SERIF, '600');
    label(g, 'eau de parfum', w / 2, 170, 10, '#3a2218', SERIF, 'italic 400');
  },
  (g, w, h) => {
    fill(g, w, h, '#5a0f14');
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#7a1a20' : '#460a0e';
      g.fillRect(i * 16, 0, 16, 120);
    }
    g.fillStyle = '#12090a';
    g.fillRect(0, 112, w, 80);
    label(g, 'LE SONGE', w / 2, 140, 17, '#f3e3b0', SERIF, '700');
    label(g, "D'UNE VILLE", w / 2, 158, 15, '#f3e3b0', SERIF, '700');
    label(g, 'Théâtre de la Rotonde', w / 2, 178, 9, '#c9a227', SERIF, '400');
  },
  (g, w, h) => {
    fill(g, w, h, '#ffd400');
    g.save();
    g.translate(w / 2, 84);
    g.rotate(-0.12);
    label(g, 'SOLDES', 0, 0, 30, '#d6202a');
    label(g, '−50 %', 0, 40, 34, '#16181a');
    g.restore();
    g.fillStyle = '#16181a';
    g.fillRect(0, 160, w, 32);
    label(g, 'DERNIERS JOURS', w / 2, 181, 12, '#ffd400');
  },
  (g, w, h) => {
    fill(g, w, h, '#16181a');
    g.fillStyle = '#e8e4da';
    for (let i = 0; i < 9; i++) {
      g.fillRect(6, 8 + i * 20, 8, 10);
      g.fillRect(114, 8 + i * 20, 8, 10);
    }
    const gr = g.createLinearGradient(20, 20, 108, 120);
    gr.addColorStop(0, '#2a7ad9');
    gr.addColorStop(1, '#a61e69');
    g.fillStyle = gr;
    g.fillRect(22, 14, 84, 104);
    label(g, 'FESTIVAL', w / 2, 142, 16, '#ffffff');
    label(g, 'DU FILM COURT', w / 2, 160, 12, '#ffffff');
    label(g, '12e édition', w / 2, 178, 9, '#9fa6ad', SANS, '400');
  },
  (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#4fb3e8');
    gr.addColorStop(0.55, '#bfe6f7');
    gr.addColorStop(0.56, '#2a8fb8');
    gr.addColorStop(0.8, '#f1dfae');
    gr.addColorStop(1, '#e6cf96');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff1a8';
    g.beginPath();
    g.arc(92, 36, 18, 0, 7);
    g.fill();
    label(g, 'PARTEZ', w / 2, 150, 20, '#ffffff');
    label(g, 'AU SOLEIL', w / 2, 170, 16, '#ffffff');
  },
  (g, w, h, rnd) => {
    fill(g, w, h, '#eef4e6');
    for (let i = 0; i < 26; i++) {
      g.fillStyle = ['#3f8a4a', '#7fae3a', '#d94f6a', '#f2d14a', '#2f6b45'][i % 5]!;
      g.beginPath();
      g.ellipse(rnd() * w, 10 + rnd() * 100, 5 + rnd() * 9, 9 + rnd() * 12, rnd() * 3, 0, 7);
      g.fill();
    }
    g.fillStyle = '#2f6b45';
    g.fillRect(0, 122, w, 70);
    label(g, 'FÊTE DES', w / 2, 146, 17, '#ffffff');
    label(g, 'JARDINS', w / 2, 166, 20, '#ffffff');
    label(g, 'entrée libre', w / 2, 182, 9, '#d9ead3', SANS, '400');
  },
];

// ───────────────────────────── graffitis (256 × 128, découpés) ─────────────────────────────

function spray(g: G, text: string, px: number, color: string, outline: string | null, x: number, y: number, rot: number, skew: number, font = SANS): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.transform(1, 0, skew, 1, 0, 0);
  g.font = `italic 900 ${px}px ${font}`;
  g.textAlign = 'center';
  g.lineJoin = 'round';
  if (outline) {
    g.strokeStyle = outline;
    g.lineWidth = px * 0.24;
    g.strokeText(text, 0, 0);
  }
  // trait épaissi : un graffiti doit rester lisible de loin
  g.strokeStyle = color;
  g.lineWidth = px * 0.07;
  g.strokeText(text, 0, 0);
  g.fillStyle = color;
  g.fillText(text, 0, 0);
  g.restore();
}

function scribble(g: G, rnd: () => number, color: string, width: number): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(24, 80);
  let x = 24;
  while (x < 228) {
    const dx = 14 + rnd() * 20;
    g.bezierCurveTo(x + dx * 0.2, 14 + rnd() * 30, x + dx * 0.8, 114 - rnd() * 30, x + dx, 50 + rnd() * 40);
    x += dx;
  }
  g.stroke();
}

export const GRAFFITI: readonly Painter[] = [
  (g) => spray(g, 'ZEK', 92, '#c9ced4', '#16181a', 128, 98, -0.06, -0.15),
  (g) => {
    spray(g, 'ON LÂCHE', 46, '#c8202a', null, 126, 56, -0.05, -0.2);
    spray(g, 'RIEN', 56, '#c8202a', null, 150, 112, -0.03, -0.2);
  },
  (g) => {
    spray(g, 'LA RUE', 44, '#111111', null, 110, 50, 0.03, -0.1);
    spray(g, 'EST À NOUS', 40, '#111111', null, 132, 104, -0.02, -0.1);
  },
  (g, _w, _h, rnd) => {
    scribble(g, rnd, '#e0489a', 7);
    spray(g, 'moko', 30, '#e0489a', null, 200, 118, -0.2, -0.3);
  },
  (g) => spray(g, 'RÉVOLTE', 54, '#f2f2f2', '#111111', 128, 86, -0.08, -0.18),
  (g) => {
    g.strokeStyle = '#1d5fd0';
    g.lineWidth = 9;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(52, 50);
    g.bezierCurveTo(52, 14, 6, 26, 52, 92);
    g.bezierCurveTo(98, 26, 52, 14, 52, 50);
    g.stroke();
    spray(g, 'PARIS', 52, '#1d5fd0', null, 168, 88, 0.04, -0.12);
  },
  (g) => {
    spray(g, 'FIN DU MOIS', 38, '#111111', null, 128, 52, -0.03, -0.1);
    spray(g, '= FIN DU MONDE', 30, '#111111', null, 128, 100, -0.03, -0.1);
  },
  (g, _w, _h, rnd) => {
    scribble(g, rnd, '#2f9a55', 8);
    scribble(g, rnd, '#111111', 3);
  },
];
