/* =====================================================================================
 * RENDU DU DÉCOR — peinture des motifs (rideau de fer, contreplaqué, barreaux, grillage, filet, roue,
 * verre brisé, fissures, suie, pavés…) et des pictogrammes. Les régions « découpées » restent
 * transparentes hors du motif. Affiches et graffitis : atlas-paint-posters.ts.
 * ===================================================================================== */

import { hex } from './atlas-paint-shops';
import { GRAFFITI, POSTERS, SANS, SERIF, fill, label } from './atlas-paint-posters';
import type { G, Painter } from './atlas-paint-shops';

// ───────────────────────────── grands motifs opaques ─────────────────────────────

const rideau: Painter = (g, w, h, rnd) => {
  fill(g, w, h, '#b5b8ba');
  const n = 24, sh = h / n;
  for (let i = 0; i < n; i++) {
    const gr = g.createLinearGradient(0, i * sh, 0, (i + 1) * sh);
    gr.addColorStop(0, '#d2d5d7');
    gr.addColorStop(0.55, '#aeb1b4');
    gr.addColorStop(1, '#787b7e');
    g.fillStyle = gr;
    g.fillRect(0, i * sh, w, sh);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(60,50,40,${0.03 + rnd() * 0.06})`;
    g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 20 + rnd() * 60);
  }
};

const contreplaque: Painter = (g, w, h, rnd) => {
  fill(g, w, h, '#c9a873');
  for (let i = 0; i < 900; i++) {
    g.fillStyle = ['rgba(150,110,60,0.5)', 'rgba(226,196,140,0.6)', 'rgba(120,84,44,0.45)'][Math.floor(rnd() * 3)]!;
    g.save();
    g.translate(rnd() * w, rnd() * h);
    g.rotate(rnd() * 3);
    g.fillRect(0, 0, 4 + rnd() * 10, 1.5 + rnd() * 2.5);
    g.restore();
  }
  g.fillStyle = 'rgba(60,40,20,0.55)';
  g.fillRect(w / 2 - 1, 0, 2, h);
  g.fillStyle = '#4a4a4a';
  for (const x of [8, w / 2 - 8, w / 2 + 8, w - 8]) for (const y of [8, h / 2, h - 8]) {
    g.beginPath();
    g.arc(x, y, 2, 0, 7);
    g.fill();
  }
};

const planches: Painter = (g, w, h, rnd) => {
  const n = 5, bh = h / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = ['#a8875a', '#9a7a4e', '#b08d5b', '#93724a', '#a58256'][i]!;
    g.fillRect(0, i * bh, w, bh);
    g.strokeStyle = 'rgba(70,48,24,0.35)';
    g.lineWidth = 1;
    for (let k = 0; k < 7; k++) {
      const y = i * bh + 3 + rnd() * (bh - 6);
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.6, y + rnd() * 6 - 3, w, y + rnd() * 4 - 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(30,20,10,0.7)';
    g.fillRect(0, (i + 1) * bh - 1.5, w, 1.5);
  }
};

const store: Painter = (g, w, h, rnd) => {
  fill(g, w, h, '#f4f4f4');
  for (let i = 0; i < w; i += 2) {
    g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.04})`;
    g.fillRect(i, 0, 1, h);
  }
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, h - 6, w, 6);
};

const paves: Painter = (g, w, h, rnd) => {
  fill(g, w, h, '#3a3c3e');
  const n = 5, s = w / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = 96 + Math.floor(rnd() * 44);
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    g.beginPath();
    g.roundRect(c * s + 1.5 + (r % 2) * 3, r * s + 1.5, s - 3, s - 3, 3);
    g.fill();
  }
};

const bois: Painter = (g, w, h, rnd) => {
  fill(g, w, h, '#f0f0f0');
  g.lineWidth = 1;
  for (let k = 0; k < 14; k++) {
    g.strokeStyle = `rgba(0,0,0,${0.06 + rnd() * 0.1})`;
    const y = rnd() * h;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(w * 0.3, y + rnd() * 4 - 2, w * 0.7, y + rnd() * 4 - 2, w, y);
    g.stroke();
  }
};

const osier: Painter = (g, w, h) => {
  fill(g, w, h, '#f2f2f2');
  for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
    g.fillStyle = ((x + y) / 8) % 2 ? 'rgba(160,40,30,0.55)' : 'rgba(0,0,0,0.08)';
    g.fillRect(x + 1, y + 1, 6, 6);
  }
};

// ───────────────────────────── motifs découpés ─────────────────────────────

const barreaux: Painter = (g, w, h) => {
  const n = 18, step = w / n;
  for (let i = 0; i < n; i++) {
    const x = i * step + step / 2 - 2.5;
    const gr = g.createLinearGradient(x, 0, x + 5, 0);
    gr.addColorStop(0, '#d0d4d8');
    gr.addColorStop(0.5, '#a9aeb3');
    gr.addColorStop(1, '#70757a');
    g.fillStyle = gr;
    g.fillRect(x, 0, 5, h);
  }
};

const grillage: Painter = (g, w, h) => {
  g.fillStyle = '#9aa0a6';
  for (let x = 2; x < w; x += 10) g.fillRect(x, 0, 2.6, h);
  g.fillStyle = '#868c92';
  for (let y = 6; y < h; y += 30) g.fillRect(0, y, w, 3.2);
};

const filet: Painter = (g, w, h) => {
  g.fillStyle = '#f1f5f2';
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 2.6, h);
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2.6);
  g.fillStyle = 'rgba(47,107,69,0.9)';
  for (let y = 28; y < h; y += 64) g.fillRect(0, y, w, 5);
};

function wheel(g: G, w: number, tire: boolean, rim: string, spoke: string): void {
  const c = w / 2;
  if (tire) {
    g.fillStyle = '#131313';
    g.beginPath();
    g.arc(c, c, 62, 0, 7);
    g.arc(c, c, 52, 0, 7, true);
    g.fill('evenodd');
  }
  g.fillStyle = rim;
  g.beginPath();
  g.arc(c, c, 52, 0, 7);
  g.arc(c, c, 47.5, 0, 7, true);
  g.fill('evenodd');
  g.strokeStyle = spoke;
  g.lineWidth = 1.7;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * 6, c + Math.sin(a) * 6);
    g.lineTo(c + Math.cos(a + 0.2) * 48, c + Math.sin(a + 0.2) * 48);
    g.stroke();
  }
  g.fillStyle = rim;
  g.beginPath();
  g.arc(c, c, 7, 0, 7);
  g.fill();
}

const roue: Painter = (g, w) => wheel(g, w, true, '#b9bec3', '#9aa0a6');
const roueNue: Painter = (g, w) => wheel(g, w, false, '#e8e8e8', '#d0d0d0');

const verreBords: Painter = (g, w, h, rnd) => {
  const shard = (pts: number[]): void => {
    g.beginPath();
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.closePath();
    g.fillStyle = `rgba(${200 + rnd() * 30},${225 + rnd() * 20},${232 + rnd() * 20},1)`;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1;
    g.stroke();
  };
  // dents de verre le long des quatre bords
  for (let x = 0; x < w;) {
    const d = 10 + rnd() * 22;
    shard([x, 0, x + d, 0, x + d * (0.2 + rnd() * 0.6), 8 + rnd() * 34]);
    shard([x, h, x + d, h, x + d * (0.2 + rnd() * 0.6), h - 10 - rnd() * 46]);
    x += d;
  }
  for (let y = 0; y < h;) {
    const d = 9 + rnd() * 18;
    shard([0, y, 0, y + d, 8 + rnd() * 36, y + d * (0.2 + rnd() * 0.6)]);
    shard([w, y, w, y + d, w - 8 - rnd() * 36, y + d * (0.2 + rnd() * 0.6)]);
    y += d;
  }
};

const fissures: Painter = (g, w, h, rnd) => {
  g.strokeStyle = '#f4f8fa';
  g.lineCap = 'round';
  for (const [cx, cy] of [[84, 70], [186, 44]] as const) {
    const rays = 9 + Math.floor(rnd() * 4);
    const ends: number[] = [];
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + rnd() * 0.4;
      const len = 30 + rnd() * 90;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(cx, cy);
      const mx = cx + Math.cos(a + 0.12) * len * 0.5, my = cy + Math.sin(a + 0.12) * len * 0.5;
      g.lineTo(mx, my);
      g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.stroke();
      ends.push(mx, my);
    }
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 0; i < ends.length; i += 2) {
      if (i === 0) g.moveTo(ends[i]!, ends[i + 1]!);
      else g.lineTo(ends[i]!, ends[i + 1]!);
    }
    g.closePath();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, cy, 5, 0, 7);
    g.fill();
  }
  void w; void h;
};

const eclatsSol: Painter = (g, w, h, rnd) => {
  for (let i = 0; i < 150; i++) {
    const x = rnd() * w, y = Math.pow(rnd(), 1.6) * h;
    const s = 2.5 + rnd() * 7;
    g.fillStyle = ['#dfeef2', '#c6dde4', '#f4fbfd', '#b7d2c8'][Math.floor(rnd() * 4)]!;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + s, y + rnd() * s * 0.6);
    g.lineTo(x + rnd() * s, y + s * (0.5 + rnd() * 0.5));
    g.closePath();
    g.fill();
  }
};

/** Sol noirci : tache dont l'opacité décroît du centre vers le bord (la découpe hachée en fait un fondu). */
const suie: Painter = (g, w, h, rnd) => {
  const gr = g.createRadialGradient(w / 2, h / 2, w * 0.05, w / 2, h / 2, w * 0.5);
  gr.addColorStop(0, 'rgba(10,9,8,0.95)');
  gr.addColorStop(0.45, 'rgba(12,10,9,0.75)');
  gr.addColorStop(0.8, 'rgba(14,12,10,0.3)');
  gr.addColorStop(1, 'rgba(14,12,10,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // éclaboussures plus denses
  g.fillStyle = 'rgba(6,5,5,0.9)';
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * w * 0.36;
    g.beginPath();
    g.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 2 + rnd() * 6, 0, 7);
    g.fill();
  }
};

/** Suie sur un mur : langues qui montent d'une baie, denses en bas, effacées vers le haut. */
const suieMur: Painter = (g, w, h, rnd) => {
  for (let i = 0; i < 9; i++) {
    const x = (i + 0.5) * (w / 9) + (rnd() - 0.5) * 6;
    const top = h * (0.05 + rnd() * 0.5);
    const half = w / 9 * (0.7 + rnd() * 0.7);
    const edge = Math.min(1, Math.min(i + 0.6, 8.6 - i) / 2.2);
    const gr = g.createLinearGradient(0, h, 0, top);
    gr.addColorStop(0, `rgba(12,10,9,${0.85 * edge})`);
    gr.addColorStop(0.5, `rgba(14,12,10,${0.5 * edge})`);
    gr.addColorStop(1, 'rgba(16,14,12,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x - half, h);
    g.quadraticCurveTo(x - half * 0.6, (h + top) / 2, x, top);
    g.quadraticCurveTo(x + half * 0.6, (h + top) / 2, x + half, h);
    g.fill();
  }
};

const dechets: Painter = (g, w, h, rnd) => {
  const cl = ['#e8e4da', '#b08d5b', '#8a7a66', '#c9c1b2', '#9a3b2e', '#4a5a6a', '#f4f4f0'];
  for (let i = 0; i < 26; i++) {
    g.save();
    g.translate(8 + rnd() * (w - 16), 8 + rnd() * (h - 16));
    g.rotate(rnd() * 3);
    g.fillStyle = cl[Math.floor(rnd() * cl.length)]!;
    g.fillRect(-7, -5, 7 + rnd() * 12, 5 + rnd() * 9);
    g.restore();
  }
};

const feuillage: Painter = (g, w, h, rnd) => {
  for (let i = 0; i < 40; i++) {
    g.fillStyle = ['#3f6b35', '#4d7a3a', '#356030'][i % 3]!;
    g.beginPath();
    g.ellipse(rnd() * w, rnd() * h, 4, 8, rnd() * 3, 0, 7);
    g.fill();
  }
};

// ───────────────────────────── pictogrammes (64 × 64) ─────────────────────────────

const ICONS: Readonly<Record<string, Painter>> = {
  cadran: (g, w) => {
    const c = w / 2;
    g.fillStyle = '#1b1b1b';
    g.beginPath();
    g.arc(c, c, 31, 0, 7);
    g.fill();
    g.fillStyle = '#f6f3e8';
    g.beginPath();
    g.arc(c, c, 27.5, 0, 7);
    g.fill();
    g.fillStyle = '#1b1b1b';
    for (let i = 0; i < 12; i++) {
      g.save();
      g.translate(c, c);
      g.rotate((i / 12) * Math.PI * 2);
      g.fillRect(-1, -26, 2, i % 3 === 0 ? 6 : 3);
      g.restore();
    }
    g.lineCap = 'round';
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c - 9, c - 11);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + 13, c - 15);
    g.stroke();
  },
  ecran_dab: (g, w, h) => {
    fill(g, w, h, '#1b4f9a');
    g.fillStyle = '#ffffff';
    g.fillRect(8, 8, 34, 5);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(8, 22 + i * 9, 20, 4);
      g.fillStyle = '#7ec0ff';
      g.fillRect(40, 21 + i * 9, 16, 6);
    }
  },
  ecran_horo: (g, w, h) => {
    fill(g, w, h, '#9fb59a');
    g.fillStyle = '#1e2a1c';
    g.fillRect(6, 10, 52, 9);
    g.fillRect(6, 28, 30, 7);
    g.fillRect(6, 44, 40, 7);
  },
  sens_interdit: (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f4f4f4';
    g.beginPath();
    g.arc(c, c, 31, 0, 7);
    g.fill();
    g.fillStyle = '#d6202a';
    g.beginPath();
    g.arc(c, c, 29, 0, 7);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(c - 20, c - 5.5, 40, 11);
  },
  obligation: (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f4f4f4';
    g.beginPath();
    g.arc(c, c, 31, 0, 7);
    g.fill();
    g.fillStyle = '#1d5fd0';
    g.beginPath();
    g.arc(c, c, 29, 0, 7);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(c - 3.5, c - 12, 7, 30);
    g.beginPath();
    g.moveTo(c, c - 22);
    g.lineTo(c + 12, c - 8);
    g.lineTo(c - 12, c - 8);
    g.fill();
  },
  danger: (g, w) => {
    g.fillStyle = '#d6202a';
    g.beginPath();
    g.moveTo(w / 2, 2);
    g.lineTo(w - 1, w - 5);
    g.lineTo(1, w - 5);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(w / 2, 13);
    g.lineTo(w - 11, w - 11);
    g.lineTo(11, w - 11);
    g.fill();
    g.fillStyle = '#16181a';
    g.fillRect(w / 2 - 2.5, 26, 5, 18);
    g.fillRect(w / 2 - 2.5, 47, 5, 5);
  },
  stationnement: (g, w, h) => {
    fill(g, w, h, '#f4f4f4');
    g.fillStyle = '#1d5fd0';
    g.fillRect(2, 2, w - 4, h - 4);
    label(g, 'P', w / 2, 50, 50, '#ffffff');
  },
  croix_pharma: (g, w) => {
    g.fillStyle = '#17a455';
    g.fillRect(22, 2, 20, 60);
    g.fillRect(2, 22, 60, 20);
    g.fillStyle = '#7dffb0';
    g.fillRect(27, 7, 10, 50);
    g.fillRect(7, 27, 50, 10);
    void w;
  },
  carotte: (g, w, h) => {
    g.fillStyle = '#d6202a';
    g.beginPath();
    g.moveTo(w / 2, 1);
    g.lineTo(w - 12, h / 2);
    g.lineTo(w / 2, h - 1);
    g.lineTo(12, h / 2);
    g.fill();
    label(g, 'TABAC', w / 2, h / 2 + 4, 10, '#ffffff');
  },
  ecran_borne: (g, w, h, rnd) => {
    fill(g, w, h, '#0f6e6e');
    g.fillStyle = '#d9fff4';
    g.fillRect(6, 6, 52, 6);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = rnd() < 0.6 ? '#7dffb0' : '#ff9a7a';
      g.beginPath();
      g.arc(12 + (i % 3) * 20, 26 + Math.floor(i / 3) * 12, 4, 0, 7);
      g.fill();
    }
  },
  pieton_rouge: (g, w, h) => {
    fill(g, w, h, '#0c0c0c');
    g.fillStyle = '#ff3a2a';
    g.beginPath();
    g.arc(32, 12, 6, 0, 7);
    g.fill();
    g.fillRect(25, 20, 14, 22);
    g.fillRect(25, 42, 6, 18);
    g.fillRect(33, 42, 6, 18);
  },
  pieton_vert: (g, w, h) => {
    fill(g, w, h, '#0c0c0c');
    g.fillStyle = '#2aff7a';
    g.beginPath();
    g.arc(34, 12, 6, 0, 7);
    g.fill();
    g.save();
    g.translate(32, 31);
    g.rotate(0.1);
    g.fillRect(-6, -11, 12, 21);
    g.restore();
    g.save();
    g.translate(30, 40);
    g.rotate(0.45);
    g.fillRect(-3, 0, 6, 20);
    g.restore();
    g.save();
    g.translate(35, 40);
    g.rotate(-0.4);
    g.fillRect(-3, 0, 6, 20);
    g.restore();
  },
  ardoise: (g, w, h, rnd) => {
    fill(g, w, h, '#20241f');
    g.fillStyle = '#e8e8dc';
    for (let i = 0; i < 7; i++) g.fillRect(8, 9 + i * 7.5, 18 + rnd() * 28, 2);
  },
  clavier: (g, w, h) => {
    fill(g, w, h, '#3a3e44');
    g.fillStyle = '#c9ced4';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.fillRect(5 + c * 14.5, 5 + r * 14.5, 11, 11);
  },
  grille_aeration: (g, w, h) => {
    fill(g, w, h, '#a2a598');
    g.fillStyle = '#4e5148';
    for (let y = 5; y < h - 4; y += 7) g.fillRect(5, y, w - 10, 3.4);
  },
  lettres: (g, w, h) => {
    fill(g, w, h, '#f6f3e8');
    g.fillStyle = '#1d3f8a';
    g.fillRect(0, 0, w, 14);
    g.fillStyle = '#44484e';
    for (let i = 0; i < 5; i++) g.fillRect(6, 22 + i * 8, 30 + (i % 3) * 9, 2.4);
  },
};

const plaqueRue: Painter = (g, w, h) => {
  fill(g, w, h, '#2e7d4f');
  g.fillStyle = '#1b3a8c';
  g.fillRect(4, 4, w - 8, h - 8);
  label(g, 'RUE', w / 2, 26, 15, '#ffffff', SANS, '700');
  g.fillStyle = '#ffffff';
  g.fillRect(22, 36, w - 44, 7);
  g.fillRect(40, 49, w - 80, 4);
};

const hotelSign: Painter = (g, w, h) => {
  fill(g, w, h, '#5a1414');
  const t = 'HÔTEL';
  for (let i = 0; i < t.length; i++) label(g, t[i]!, w / 2, 13 + i * 12, 13, '#f3e3b0', SERIF, '700');
};

const texteFlou: Painter = (g, w, h, rnd) => {
  fill(g, w, h, '#ffffff');
  g.fillStyle = 'rgba(0,0,0,0.42)';
  let x = 28;
  while (x < w - 40) {
    const lw = 8 + rnd() * 16;
    g.fillRect(x, h * 0.32, lw, h * 0.36);
    x += lw + 3 + (rnd() < 0.25 ? 10 : 0);
  }
};

const toilettes: Painter = (g, w, h) => {
  fill(g, w, h, '#1d4e89');
  label(g, 'TOILETTES', w / 2, 42, 20, '#ffffff', SANS, '700');
};

const blanc: Painter = (g, w, h) => fill(g, w, h, '#ffffff');

/** Peintres de toutes les régions statiques hors étalages. */
export function staticPainters(): Record<string, Painter> {
  const out: Record<string, Painter> = {
    rideau, contreplaque, planches, store, paves, bois, osier, barreaux, grillage, filet, roue, roue_nue: roueNue,
    verre_bords: verreBords, fissures, eclats_sol: eclatsSol, suie, dechets, feuillage, plaque_rue: plaqueRue,
    hotel: hotelSign, texte_flou: texteFlou, toilettes, blanc, suie_mur: suieMur,
  };
  for (let i = 0; i < POSTERS.length; i++) out['affiche_' + i] = POSTERS[i]!;
  for (let i = 0; i < GRAFFITI.length; i++) out['tag_' + i] = GRAFFITI[i]!;
  for (const k of Object.keys(ICONS)) out[k] = ICONS[k]!;
  return out;
}

export { hex };
