/* =====================================================================================
 * VILLE EN 3D — peinture procédurale (canvas 2D) des textures hors atlas du sol : panneaux
 * découpés (grilles, garde-corps, portails, grilles d'arbres, lettres peintes), feuillage,
 * écorce, halo de candélabre, silhouette de toits.
 * ===================================================================================== */

import { seeded } from './paint';

// ─────────────────────────────── textures découpées ───────────────────────────────

/**
 * Texture découpée (alpha) : quatre bandes horizontales. De bas en haut (v croissant) :
 * grille à lances, garde-corps, portail (répétées en u), puis les éléments posés au sol
 * (grille d'arbre, lettres « BUS »). Voir CUTOUT_ROWS (barriers.ts) et CUTOUT_UV (ground.ts).
 */
export function paintCutoutAtlas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, size, size);
  const band = size / 4;
  // v = 0 est en bas de l'image : la bande k (v de k/4 à (k+1)/4) occupe les lignes y de size − (k+1)·band à size − k·band.
  const top = (k: number): number => size - (k + 1) * band;
  const pad = Math.max(2, size / 256);
  const iron = 'rgb(28,34,30)';

  // ── bande 0 : grille de jardin à barreaux et lances (1,6 m de large) ──
  {
    const y0 = top(0) + pad, y1 = top(0) + band - pad, hgt = y1 - y0;
    const bars = 12, step = size / bars, bw = Math.max(2, size / 110);
    g.fillStyle = iron;
    for (let i = 0; i < bars; i++) {
      const x = (i + 0.5) * step;
      g.fillRect(x - bw / 2, y0 + hgt * 0.1, bw, hgt * 0.9);
      // fer de lance
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + bw * 1.6, y0 + hgt * 0.1);
      g.lineTo(x, y0 + hgt * 0.14);
      g.lineTo(x - bw * 1.6, y0 + hgt * 0.1);
      g.closePath();
      g.fill();
    }
    g.fillRect(0, y0 + hgt * 0.17, size, hgt * 0.035);
    g.fillRect(0, y0 + hgt * 0.86, size, hgt * 0.04);
    // dorure discrète des pointes
    g.fillStyle = 'rgb(150,128,62)';
    for (let i = 0; i < bars; i++) g.fillRect((i + 0.5) * step - bw * 0.5, y0 + hgt * 0.02, bw, hgt * 0.05);
  }
  // ── bande 1 : garde-corps (2 m de large) : lisse haute, lisse basse, barreaudage, poteaux ──
  {
    const y0 = top(1) + pad, y1 = top(1) + band - pad, hgt = y1 - y0;
    const bars = 16, step = size / bars, bw = Math.max(2, size / 170);
    g.fillStyle = 'rgb(34,38,40)';
    g.fillRect(0, y0, size, hgt * 0.07);
    g.fillRect(0, y0 + hgt * 0.84, size, hgt * 0.05);
    for (let i = 0; i < bars; i++) g.fillRect((i + 0.5) * step - bw / 2, y0, bw, hgt * 0.88);
    g.fillRect(0, y0, bw * 3, hgt);
    g.fillRect(size - bw * 3, y0, bw * 3, hgt);
  }
  // ── bande 2 : portail à deux vantaux (3,2 m de large) ──
  {
    const y0 = top(2) + pad, y1 = top(2) + band - pad, hgt = y1 - y0;
    g.fillStyle = iron;
    const frame = Math.max(3, size / 90);
    for (let leaf = 0; leaf < 2; leaf++) {
      const x0 = (leaf * size) / 2, w = size / 2;
      g.fillRect(x0, y0 + hgt * 0.08, frame, hgt * 0.92);
      g.fillRect(x0 + w - frame, y0 + hgt * 0.08, frame, hgt * 0.92);
      g.fillRect(x0, y0 + hgt * 0.08, w, frame * 0.8);
      g.fillRect(x0, y0 + hgt * 0.6, w, frame * 0.7);
      g.fillRect(x0, y1 - frame, w, frame);
      const bars = 9;
      for (let i = 1; i < bars; i++) {
        const x = x0 + (i * w) / bars;
        g.fillRect(x - frame * 0.22, y0 + hgt * 0.02, frame * 0.44, hgt * 0.98);
      }
      // croisillons du soubassement
      g.lineWidth = frame * 0.4;
      g.strokeStyle = iron;
      g.beginPath();
      g.moveTo(x0, y0 + hgt * 0.6);
      g.lineTo(x0 + w, y1);
      g.moveTo(x0 + w, y0 + hgt * 0.6);
      g.lineTo(x0, y1);
      g.stroke();
    }
  }
  // ── bande 3 : éléments posés au sol ──
  {
    const y0 = top(3), cell = band;
    // grille d'arbre (u de 0 à 0,25) : fonte ajourée en rayons, trou central pour le tronc
    const cx = cell / 2, cy = y0 + cell / 2, r = cell / 2 - pad;
    g.save();
    g.beginPath();
    g.rect(pad, y0 + pad, cell - 2 * pad, cell - 2 * pad);
    g.clip();
    g.fillStyle = 'rgb(86,82,76)';
    g.fillRect(0, y0, cell, cell);
    g.strokeStyle = 'rgb(30,27,24)';
    g.lineWidth = Math.max(1.5, cell / 60);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r * 0.36, cy + Math.sin(a) * r * 0.36);
      g.lineTo(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5);
      g.stroke();
    }
    g.strokeStyle = 'rgb(112,106,98)';
    g.lineWidth = Math.max(2, cell / 40);
    for (const k of [0.36, 0.62, 0.9]) {
      g.beginPath();
      g.arc(cx, cy, r * k, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeRect(pad * 1.5, y0 + pad * 1.5, cell - 3 * pad, cell - 3 * pad);
    g.restore();
    // trou du tronc : transparent
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // lettres « BUS » (u de 0,25 à 0,625), étirées par le quadrilatère qui les porte
    g.fillStyle = 'rgb(232,232,226)';
    g.font = `bold ${Math.round(band * 0.86)}px Arial, Helvetica, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tx = size * 0.4375;
    g.save();
    g.beginPath();
    g.rect(size * 0.25 + pad, y0 + pad, size * 0.375 - 2 * pad, band - 2 * pad);
    g.clip();
    g.fillText('BUS', tx, y0 + band * 0.54, size * 0.36);
    g.restore();
  }
  return c;
}

/** Feuillage des houppiers : feuilles claires sur fond sombre ; alpha = densité (découpe de la silhouette). */
export function paintLeafTexture(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rnd = seeded(77);
  g.clearRect(0, 0, size, size);
  // fond : ombre intérieure du houppier, à demi opaque
  g.fillStyle = 'rgba(26,40,20,0.35)';
  g.fillRect(0, 0, size, size);
  const n = Math.round((size * size) / 30);
  for (let i = 0; i < n; i++) {
    const x = rnd() * size, y = rnd() * size;
    const r = (2.2 + rnd() * 3.4) * (size / 256), a = rnd() * Math.PI;
    const d = (rnd() - 0.4) * 60;
    const fill = `rgb(${Math.round(72 + d * 0.8)},${Math.round(98 + d)},${Math.round(44 + d * 0.5)})`;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        g.fillStyle = fill;
        g.beginPath();
        g.ellipse(x + dx * size, y + dy * size, r * 1.5, r * 0.85, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

/** Écorce de platane : plaques claires et sombres. */
export function paintBarkTexture(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rnd = seeded(88);
  g.fillStyle = 'rgb(132,122,100)';
  g.fillRect(0, 0, width, height);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * width, y = rnd() * height, w = (4 + rnd() * 12) * (width / 64), h = (8 + rnd() * 26) * (height / 128);
    const v = rnd();
    g.fillStyle = v < 0.4 ? 'rgba(92,84,68,0.7)' : v < 0.75 ? 'rgba(170,164,138,0.7)' : 'rgba(112,118,92,0.6)';
    for (let dx = -1; dx <= 1; dx++) {
      g.beginPath();
      g.ellipse(x + dx * width, y, w / 2, h / 2, (rnd() - 0.5) * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** Halo au sol d'un candélabre : tache douce, plus dense au centre. */
export function paintHaloTexture(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.07)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Silhouette de toits parisiens (alpha) : immeubles de hauteurs variées, cheminées, quelques dômes et clochers. */
export function paintSkyline(width: number, height: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rnd = seeded(seed);
  g.clearRect(0, 0, width, height);
  g.fillStyle = '#fff';
  let x = 0;
  while (x < width) {
    const w = width * (0.006 + rnd() * 0.014);
    const hgt = height * (0.42 + rnd() * 0.24);
    g.fillRect(x, height - hgt, w + 1, hgt);
    // comble en retrait
    g.fillRect(x + w * 0.08, height - hgt - height * 0.05, w * 0.84, height * 0.06);
    // cheminées
    const chimneys = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < chimneys; k++) g.fillRect(x + w * (0.15 + rnd() * 0.7), height - hgt - height * (0.08 + rnd() * 0.05), Math.max(1, w * 0.07), height * 0.1);
    const r = rnd();
    if (r < 0.035) {
      // dôme
      g.beginPath();
      g.ellipse(x + w / 2, height - hgt, w * 0.42, height * 0.2, 0, Math.PI, 0);
      g.fill();
      g.fillRect(x + w / 2 - 1, height - hgt - height * 0.27, 2, height * 0.08);
    } else if (r < 0.06) {
      // clocher
      g.beginPath();
      g.moveTo(x + w * 0.35, height - hgt);
      g.lineTo(x + w * 0.5, height - hgt - height * 0.34);
      g.lineTo(x + w * 0.65, height - hgt);
      g.fill();
    }
    x += w;
  }
  return c;
}
