/* =====================================================================================
 * Effets visuels — atlas procédural des décalques, dessiné sur un canvas 2D (4 × 4 vignettes).
 * Vignettes « masque » (blanches) : teintées par la couleur du décalque (peinture, tag, flaque).
 * Vignettes « matière » : couleurs propres (brûlure, verre, débris).
 * Tout le contenu reste à l'intérieur de sa vignette (bord transparent).
 * ===================================================================================== */

import { FxRandom, TAU } from './mathx';

export const DECAL_COLS = 4;
export const DECAL_ROWS = 4;

export const DTILE_SCORCH = 0;    // 0, 1 : trace de brûlure
export const DTILE_ASPHALT = 2;   // bitume noirci (grande tache diffuse)
export const DTILE_GLASS = 3;     // 3, 4 : éclats de verre
export const DTILE_PUDDLE = 5;    // flaque (masque)
export const DTILE_SPLAT = 6;     // 6, 7 : éclaboussure de peinture (masque)
export const DTILE_TAG = 8;       // 8, 9 : tag (masque)
export const DTILE_DEBRIS = 10;   // débris éparpillés
export const DTILE_CHIP = 11;     // éclat d'impact
export const DTILE_GLOW = 12;     // lueur ronde (masque)
export const DTILE_SOOT = 13;     // suie montante (façade)
export const DTILE_MELT = 14;     // plastique fondu, cendres
export const DTILE_WET = 15;      // traînée mouillée (masque)

/** Vignettes dont seule l'opacité compte (la couleur vient du décalque). */
export function isMaskTile(tile: number): boolean {
  return tile === DTILE_PUDDLE || tile === DTILE_SPLAT || tile === DTILE_SPLAT + 1 || tile === DTILE_TAG
    || tile === DTILE_TAG + 1 || tile === DTILE_GLOW || tile === DTILE_WET;
}

type Ctx2D = CanvasRenderingContext2D;

function blob(c: Ctx2D, x: number, y: number, r: number, rgb: string, a0: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a0})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

function scorch(c: Ctx2D, T: number, rng: FxRandom): void {
  const m = T / 2;
  blob(c, m, m, T * 0.4, '6,5,4', 0.9);
  for (let i = 0; i < 46; i++) {
    const a = rng.next() * TAU;
    const d = rng.next() * rng.next() * T * 0.3;
    blob(c, m + Math.cos(a) * d, m + Math.sin(a) * d, T * (0.05 + rng.next() * 0.1), '4,4,4', 0.3 + rng.next() * 0.3);
  }
  // langues de suie rayonnantes
  c.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const a = rng.next() * TAU;
    const r0 = T * (0.1 + rng.next() * 0.12);
    const r1 = T * (0.26 + rng.next() * 0.14);
    c.strokeStyle = `rgba(8,7,6,${0.12 + rng.next() * 0.22})`;
    c.lineWidth = T * (0.012 + rng.next() * 0.03);
    c.beginPath();
    c.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0);
    c.lineTo(m + Math.cos(a + rng.signed() * 0.12) * r1, m + Math.sin(a + rng.signed() * 0.12) * r1);
    c.stroke();
  }
  // cendres claires au centre
  for (let i = 0; i < 30; i++) {
    const a = rng.next() * TAU;
    const d = rng.next() * T * 0.16;
    blob(c, m + Math.cos(a) * d, m + Math.sin(a) * d, T * (0.008 + rng.next() * 0.014), '120,114,104', 0.35);
  }
}

function asphalt(c: Ctx2D, T: number, rng: FxRandom): void {
  const m = T / 2;
  blob(c, m, m, T * 0.44, '10,9,9', 0.62);
  for (let i = 0; i < 70; i++) {
    const a = rng.next() * TAU;
    const d = Math.sqrt(rng.next()) * T * 0.3;
    blob(c, m + Math.cos(a) * d, m + Math.sin(a) * d, T * (0.04 + rng.next() * 0.09), '7,7,7', 0.1 + rng.next() * 0.16);
  }
}

function glass(c: Ctx2D, T: number, rng: FxRandom, n: number): void {
  const m = T / 2;
  for (let i = 0; i < n; i++) {
    const a = rng.next() * TAU;
    const d = Math.abs(rng.signed() + rng.signed()) * 0.5 * T * 0.4;
    const x = m + Math.cos(a) * d;
    const y = m + Math.sin(a) * d;
    const s = T * (0.008 + rng.next() * rng.next() * 0.045);
    const rot = rng.next() * TAU;
    const k = 3 + rng.int(2);
    c.beginPath();
    for (let j = 0; j < k; j++) {
      const aa = rot + (j / k) * TAU + rng.signed() * 0.5;
      const rr = s * (0.5 + rng.next());
      if (j === 0) c.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
      else c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
    }
    c.closePath();
    const bright = rng.next();
    c.fillStyle = bright > 0.75 ? `rgba(246,252,255,${0.85})` : `rgba(207,227,234,${0.45 + rng.next() * 0.4})`;
    c.fill();
  }
}

function irregular(c: Ctx2D, T: number, rng: FxRandom, radius: number, wobble: number, lobes: number): void {
  const m = T / 2;
  const N = 48;
  const ph: number[] = [];
  for (let k = 0; k < lobes; k++) ph.push(rng.next() * TAU, 0.3 + rng.next() * 0.7);
  c.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    let r = 1;
    for (let k = 0; k < lobes; k++) r += Math.sin(a * (k + 2) + ph[k * 2]!) * wobble * ph[k * 2 + 1]! / (k + 1);
    const rr = radius * T * r;
    if (i === 0) c.moveTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr);
    else c.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr);
  }
  c.closePath();
}

function puddle(c: Ctx2D, T: number, rng: FxRandom): void {
  c.save();
  c.filter = `blur(${Math.max(1, T * 0.02)}px)`;
  c.fillStyle = 'rgba(255,255,255,1)';
  irregular(c, T, rng, 0.3, 0.22, 4);
  c.fill();
  c.restore();
}

function splat(c: Ctx2D, T: number, rng: FxRandom): void {
  const m = T / 2;
  c.fillStyle = 'rgba(255,255,255,1)';
  irregular(c, T, rng, 0.17, 0.3, 5);
  c.fill();
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,1)';
  for (let i = 0; i < 22; i++) {
    const a = rng.next() * TAU;
    const r0 = T * 0.14;
    const r1 = T * (0.22 + rng.next() * 0.2);
    c.lineWidth = T * (0.008 + rng.next() * 0.022);
    c.beginPath();
    c.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0);
    c.lineTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1);
    c.stroke();
    c.beginPath();
    c.arc(m + Math.cos(a) * (r1 + T * 0.02), m + Math.sin(a) * (r1 + T * 0.02), T * (0.008 + rng.next() * 0.02), 0, TAU);
    c.fill();
  }
}

function tag(c: Ctx2D, T: number, rng: FxRandom): void {
  // gribouillis abstrait à la bombe : boucles et zigzags, sans mot ni symbole
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(255,255,255,0.95)';
  c.shadowColor = 'rgba(255,255,255,0.6)';
  c.shadowBlur = T * 0.02;
  const strokes = 3 + rng.int(2);
  for (let s = 0; s < strokes; s++) {
    c.lineWidth = T * (0.022 + rng.next() * 0.018);
    let x = T * (0.16 + rng.next() * 0.15);
    let y = T * (0.3 + rng.next() * 0.4);
    c.beginPath();
    c.moveTo(x, y);
    const seg = 4 + rng.int(4);
    for (let i = 0; i < seg; i++) {
      const nx = x + T * (0.08 + rng.next() * 0.1);
      const ny = T * (0.25 + rng.next() * 0.5);
      c.bezierCurveTo(x + T * 0.05, y + rng.signed() * T * 0.25, nx - T * 0.05, ny + rng.signed() * T * 0.25, Math.min(nx, T * 0.86), ny);
      x = Math.min(nx, T * 0.86);
      y = ny;
    }
    c.stroke();
  }
  // coulures
  c.shadowBlur = 0;
  for (let i = 0; i < 5; i++) {
    const x = T * (0.2 + rng.next() * 0.6);
    const y = T * (0.45 + rng.next() * 0.2);
    c.lineWidth = T * 0.01;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, y + T * (0.08 + rng.next() * 0.16));
    c.stroke();
  }
}

function debris(c: Ctx2D, T: number, rng: FxRandom): void {
  const m = T / 2;
  for (let i = 0; i < 44; i++) {
    const a = rng.next() * TAU;
    const d = Math.sqrt(rng.next()) * T * 0.38;
    const x = m + Math.cos(a) * d;
    const y = m + Math.sin(a) * d;
    const s = T * (0.01 + rng.next() * rng.next() * 0.05);
    const rot = rng.next() * TAU;
    const shade = 18 + rng.int(46);
    c.fillStyle = `rgba(${shade},${shade - 3},${shade - 6},${0.75 + rng.next() * 0.25})`;
    c.beginPath();
    for (let j = 0; j < 4; j++) {
      const aa = rot + (j / 4) * TAU + rng.signed() * 0.4;
      const rr = s * (0.6 + rng.next() * 0.8);
      if (j === 0) c.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
      else c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
    }
    c.closePath();
    c.fill();
  }
  blob(c, m, m, T * 0.36, '20,18,16', 0.25);
}

function chip(c: Ctx2D, T: number, rng: FxRandom): void {
  const m = T / 2;
  blob(c, m, m, T * 0.3, '30,28,26', 0.45);
  c.fillStyle = 'rgba(176,172,164,0.9)';
  irregular(c, T, rng, 0.1, 0.45, 5);
  c.fill();
  for (let i = 0; i < 16; i++) {
    const a = rng.next() * TAU;
    const d = T * (0.12 + rng.next() * 0.2);
    blob(c, m + Math.cos(a) * d, m + Math.sin(a) * d, T * (0.01 + rng.next() * 0.02), '170,166,158', 0.7);
  }
}

function soot(c: Ctx2D, T: number, rng: FxRandom): void {
  // suie qui monte : dense en bas (y grand sur le canvas), effilée vers le haut
  for (let i = 0; i < 16; i++) {
    const x = T * (0.2 + rng.next() * 0.6);
    const w = T * (0.06 + rng.next() * 0.12);
    const top = T * (0.1 + rng.next() * 0.35);
    const g = c.createLinearGradient(0, T * 0.92, 0, top);
    g.addColorStop(0, 'rgba(6,5,5,0.55)');
    g.addColorStop(1, 'rgba(6,5,5,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - w, T * 0.92);
    c.quadraticCurveTo(x - w * 0.6, (T * 0.92 + top) / 2, x + rng.signed() * w * 0.4, top);
    c.quadraticCurveTo(x + w * 0.6, (T * 0.92 + top) / 2, x + w, T * 0.92);
    c.closePath();
    c.fill();
  }
  // fondu du bord bas pour ne pas couper net
  c.globalCompositeOperation = 'destination-out';
  const g2 = c.createLinearGradient(0, T * 0.8, 0, T * 0.94);
  g2.addColorStop(0, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = g2;
  c.fillRect(0, T * 0.8, T, T * 0.2);
  c.globalCompositeOperation = 'source-over';
}

function melt(c: Ctx2D, T: number, rng: FxRandom): void {
  const m = T / 2;
  blob(c, m, m, T * 0.42, '8,8,8', 0.5);
  c.fillStyle = 'rgba(9,9,10,0.95)';
  irregular(c, T, rng, 0.24, 0.25, 5);
  c.fill();
  for (let i = 0; i < 40; i++) {
    const a = rng.next() * TAU;
    const d = Math.sqrt(rng.next()) * T * 0.3;
    blob(c, m + Math.cos(a) * d, m + Math.sin(a) * d, T * (0.006 + rng.next() * 0.016), '135,130,124', 0.5);
  }
  // reflet du plastique figé
  blob(c, m - T * 0.06, m - T * 0.05, T * 0.07, '70,70,76', 0.35);
}

function wet(c: Ctx2D, T: number, rng: FxRandom): void {
  const m = T / 2;
  c.save();
  c.filter = `blur(${Math.max(1, T * 0.025)}px)`;
  c.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 9; i++) {
    c.beginPath();
    c.ellipse(m + rng.signed() * T * 0.12, m + rng.signed() * T * 0.2, T * (0.05 + rng.next() * 0.08), T * (0.12 + rng.next() * 0.14), rng.signed() * 0.3, 0, TAU);
    c.fill();
  }
  c.restore();
}

/** Dessine l'atlas des décalques. `size` : côté du canvas (512 ou 1024). */
export function buildDecalAtlas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('[fx] canvas 2D indisponible pour les décalques');
  const T = size / DECAL_COLS;
  const rng = new FxRandom(0xdeca1);
  const draw = (tile: number, fn: () => void): void => {
    // la texture est lue avec la ligne 0 en bas : la rangée r de l'atlas est dessinée en partant du bas
    const col = tile % DECAL_COLS;
    const row = Math.floor(tile / DECAL_COLS);
    c.save();
    c.translate(col * T, size - (row + 1) * T);
    c.beginPath();
    c.rect(1, 1, T - 2, T - 2);
    c.clip();
    fn();
    c.restore();
  };
  draw(DTILE_SCORCH, () => scorch(c, T, rng));
  draw(DTILE_SCORCH + 1, () => scorch(c, T, rng));
  draw(DTILE_ASPHALT, () => asphalt(c, T, rng));
  draw(DTILE_GLASS, () => glass(c, T, rng, 90));
  draw(DTILE_GLASS + 1, () => glass(c, T, rng, 55));
  draw(DTILE_PUDDLE, () => puddle(c, T, rng));
  draw(DTILE_SPLAT, () => splat(c, T, rng));
  draw(DTILE_SPLAT + 1, () => splat(c, T, rng));
  draw(DTILE_TAG, () => tag(c, T, rng));
  draw(DTILE_TAG + 1, () => tag(c, T, rng));
  draw(DTILE_DEBRIS, () => debris(c, T, rng));
  draw(DTILE_CHIP, () => chip(c, T, rng));
  draw(DTILE_GLOW, () => {
    // lueur : chute quadratique, sans bord visible
    const g = c.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T * 0.47);
    for (let k = 0; k <= 10; k++) {
      const q = 1 - k / 10;
      g.addColorStop(k / 10, `rgba(255,255,255,${(q * q * q).toFixed(4)})`);
    }
    c.fillStyle = g;
    c.fillRect(0, 0, T, T);
  });
  draw(DTILE_SOOT, () => soot(c, T, rng));
  draw(DTILE_MELT, () => melt(c, T, rng));
  draw(DTILE_WET, () => wet(c, T, rng));
  return canvas;
}
