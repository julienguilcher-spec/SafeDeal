/* =====================================================================================
 * Outils d'analyse du banc d'essai (hors jeu livré) : mesures d'un signal rendu hors ligne,
 * transformée de Fourier, tracé de spectrogrammes sur canvas.
 * ===================================================================================== */

export interface SignalMetrics {
  samples: number;
  sampleRate: number;
  /** Crête absolue. */
  peak: number;
  /** Valeur efficace sur toute la fenêtre. */
  rms: number;
  /** Nombre d'échantillons non finis (NaN, ±Infinity). */
  nonFinite: number;
  /** Instants (s) du premier et du dernier échantillon au-dessus de −46 dB. */
  firstAudible: number;
  lastAudible: number;
  /** Valeur efficace par tranche de 0,5 s. */
  segments: number[];
  /** Composante continue moyenne. */
  dc: number;
}

export function measure(data: Float32Array, sampleRate: number): SignalMetrics {
  let peak = 0;
  let sum = 0;
  let dc = 0;
  let nonFinite = 0;
  let first = -1;
  let last = -1;
  const thr = 0.005;
  const segLen = Math.floor(sampleRate * 0.5);
  const segments: number[] = [];
  let segSum = 0;
  let segCount = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (!Number.isFinite(v)) {
      nonFinite++;
      continue;
    }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
    dc += v;
    if (a > thr) {
      if (first < 0) first = i;
      last = i;
    }
    segSum += v * v;
    segCount++;
    if (segCount === segLen) {
      segments.push(Math.sqrt(segSum / segCount));
      segSum = 0;
      segCount = 0;
    }
  }
  if (segCount > segLen * 0.5) segments.push(Math.sqrt(segSum / segCount));
  const n = Math.max(1, data.length);
  return {
    samples: data.length,
    sampleRate,
    peak,
    rms: Math.sqrt(sum / n),
    nonFinite,
    firstAudible: first < 0 ? -1 : first / sampleRate,
    lastAudible: last < 0 ? -1 : last / sampleRate,
    segments,
    dc: dc / n,
  };
}

/** FFT radix 2 en place (re, im de longueur puissance de 2). */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
      const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export interface Stft {
  frames: number;
  bins: number;
  fftSize: number;
  hop: number;
  sampleRate: number;
  /** Niveaux en dB (pleine échelle), frames × bins. */
  db: Float32Array;
}

export function stft(data: Float32Array, sampleRate: number, fftSize = 2048, hop = 256): Stft {
  const bins = fftSize / 2;
  const frames = Math.max(1, Math.floor((data.length - fftSize) / hop) + 1);
  const db = new Float32Array(frames * bins);
  const win = new Float32Array(fftSize);
  let wsum = 0;
  for (let i = 0; i < fftSize; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
    wsum += win[i]!;
  }
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < fftSize; i++) {
      re[i] = (data[off + i] ?? 0) * win[i]!;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bins; b++) {
      const mag = (2 * Math.hypot(re[b]!, im[b]!)) / wsum;
      db[f * bins + b] = 20 * Math.log10(mag + 1e-9);
    }
  }
  return { frames, bins, fftSize, hop, sampleRate, db };
}

/** Fréquence dominante (Hz) entre fMin et fMax dans la tranche temporelle [t0, t1]. */
export function dominantFrequency(s: Stft, t0: number, t1: number, fMin: number, fMax: number): number {
  const f0 = Math.max(0, Math.floor((t0 * s.sampleRate) / s.hop));
  const f1 = Math.min(s.frames - 1, Math.floor((t1 * s.sampleRate) / s.hop));
  const b0 = Math.max(1, Math.floor((fMin * s.fftSize) / s.sampleRate));
  const b1 = Math.min(s.bins - 1, Math.ceil((fMax * s.fftSize) / s.sampleRate));
  let best = b0;
  let bestV = -Infinity;
  for (let b = b0; b <= b1; b++) {
    let acc = 0;
    for (let f = f0; f <= f1; f++) acc += Math.pow(10, s.db[f * s.bins + b]! / 10);
    if (acc > bestV) {
      bestV = acc;
      best = b;
    }
  }
  return (best * s.sampleRate) / s.fftSize;
}

/** Palette « magma » approchée : t 0..1 → [r, g, b]. */
function palette(t: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122],
    [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
  ];
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const u = x - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

export interface SpectroOpts {
  fMin?: number;
  fMax?: number;
  /** Axe des fréquences logarithmique (défaut) ou linéaire. */
  log?: boolean;
  dbMin?: number;
  dbMax?: number;
  fftSize?: number;
  hop?: number;
  /** Lignes repères horizontales (Hz). */
  guides?: readonly number[];
}

/** Trace le spectrogramme de `data` dans le rectangle (x, y, w, h) du contexte 2D. */
export function drawSpectrogram(
  g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  data: Float32Array, sampleRate: number, o: SpectroOpts = {},
): void {
  const fMin = o.fMin ?? 50;
  const fMax = Math.min(o.fMax ?? 16000, sampleRate / 2);
  const log = o.log ?? true;
  const dbMin = o.dbMin ?? -90;
  const dbMax = o.dbMax ?? -18;
  const s = stft(data, sampleRate, o.fftSize ?? 2048, o.hop ?? 256);
  const img = g.createImageData(w, h);
  const freqOfRow = (row: number): number => {
    const u = 1 - row / (h - 1);
    return log ? fMin * Math.pow(fMax / fMin, u) : fMin + (fMax - fMin) * u;
  };
  for (let row = 0; row < h; row++) {
    const fa = freqOfRow(Math.min(h - 1, row + 0.5));
    const fb = freqOfRow(Math.max(0, row - 0.5));
    const ba = (fa * s.fftSize) / sampleRate;
    const bb = (fb * s.fftSize) / sampleRate;
    for (let col = 0; col < w; col++) {
      const fr = Math.min(s.frames - 1, Math.floor((col / w) * s.frames));
      let v: number;
      if (bb - ba <= 1) {
        // moins d'une case de fréquence par pixel : interpolation
        const bc = (ba + bb) / 2;
        const i0 = Math.min(s.bins - 1, Math.floor(bc));
        const i1 = Math.min(s.bins - 1, i0 + 1);
        const u = bc - i0;
        v = s.db[fr * s.bins + i0]! * (1 - u) + s.db[fr * s.bins + i1]! * u;
      } else {
        v = -200;
        const hi = Math.min(s.bins - 1, Math.ceil(bb));
        for (let b = Math.max(0, Math.floor(ba)); b <= hi; b++) v = Math.max(v, s.db[fr * s.bins + b]!);
      }
      const [r, gg, b] = palette((v - dbMin) / (dbMax - dbMin));
      const p = (row * w + col) * 4;
      img.data[p] = r;
      img.data[p + 1] = gg;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  }
  g.putImageData(img, x, y);
  // repères
  g.save();
  g.font = '10px monospace';
  g.textBaseline = 'middle';
  const ticks = log ? [100, 1000, 10000] : [];
  if (!log) for (let f = Math.ceil(fMin / 250) * 250; f <= fMax; f += 250) ticks.push(f);
  const rowOf = (f: number): number =>
    (log ? 1 - Math.log(f / fMin) / Math.log(fMax / fMin) : 1 - (f - fMin) / (fMax - fMin)) * (h - 1);
  for (const f of ticks) {
    if (f < fMin || f > fMax) continue;
    const ry = y + rowOf(f);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(x, ry, 6, 1);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 8, ry);
  }
  if (o.guides) {
    for (const f of o.guides) {
      if (f < fMin || f > fMax) continue;
      const ry = y + rowOf(f);
      g.fillStyle = 'rgba(80,220,255,0.55)';
      for (let dx = 0; dx < w; dx += 8) g.fillRect(x + dx, ry, 3, 1);
      g.fillStyle = 'rgba(120,235,255,0.95)';
      g.fillText(f + ' Hz', x + w - 50, ry - 7);
    }
  }
  g.restore();
}

/** Trace la forme d'onde (enveloppe min/max) dans le rectangle donné. */
export function drawWaveform(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, data: Float32Array): void {
  g.save();
  g.fillStyle = '#10141c';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#7fd4ff';
  const step = data.length / w;
  for (let col = 0; col < w; col++) {
    let lo = 1;
    let hi = -1;
    const a = Math.floor(col * step);
    const b = Math.min(data.length, Math.floor((col + 1) * step) + 1);
    for (let i = a; i < b; i++) {
      const v = data[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const y0 = y + (1 - (hi + 1) / 2) * h;
    const y1 = y + (1 - (lo + 1) / 2) * h;
    g.fillRect(x + col, y0, 1, Math.max(1, y1 - y0));
  }
  g.restore();
}
