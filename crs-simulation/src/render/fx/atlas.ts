/* =====================================================================================
 * Effets visuels — atlas procédural des particules (logique pure : produit des octets RGBA).
 *
 * 4 × 4 vignettes. Pour les volumes (bouffées, poussière, embruns) : R, G = normale apparente,
 * B = épaisseur au cœur, A = opacité. Pour les autres : RGB = teinte en niveaux de gris, A = forme.
 * Chaque vignette s'annule sur son bord : pas de débordement d'une vignette sur l'autre, même
 * dans les niveaux de mipmap. La ligne 0 du tableau est le BAS de l'image (convention WebGL).
 * ===================================================================================== */

import { hash2i, smoothstep } from './mathx';

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;

export const TILE_PUFF = 0;    // 0..3 : quatre bouffées différentes
export const TILE_DOT = 4;     // point lumineux doux
export const TILE_STREAK = 5;  // trait (étincelle filante, goutte étirée, traînée)
export const TILE_FLASH = 6;   // éclair à rayons
export const TILE_RING = 7;    // anneau (onde de choc)
export const TILE_SPLASH = 8;  // gerbe de gouttelettes
export const TILE_CHUNK = 9;   // débris anguleux
export const TILE_SHARD = 10;  // éclat de verre
export const TILE_WISP = 11;   // filet de fumée effiloché
export const TILE_DUST = 12;   // poussière granuleuse
export const TILE_DROP = 13;   // goutte
export const TILE_STAR = 14;   // étoile à quatre branches
export const TILE_MIST = 15;   // voile très doux (embruns, vapeur, poudre)

export interface AtlasData {
  /** Octets RGBA, ligne 0 en bas. */
  data: Uint8Array;
  width: number;
  height: number;
  tile: number;
}

function h01(ix: number, iy: number, seed: number): number {
  return hash2i(hash2i(ix, iy), seed) / 4294967296;
}

/** Bruit de valeur périodique (période `p` cellules), lissé, dans [0, 1]. */
export function tileNoise(x: number, y: number, p: number, seed: number): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const tx = x - fx;
  const ty = y - fy;
  const x0 = ((fx % p) + p) % p;
  const y0 = ((fy % p) + p) % p;
  const x1 = (x0 + 1) % p;
  const y1 = (y0 + 1) % p;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = h01(x0, y0, seed);
  const b = h01(x1, y0, seed);
  const c = h01(x0, y1, seed);
  const d = h01(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Somme d'octaves (bruit fractal), dans [0, 1]. Non périodique pour p grand. */
function fbm(x: number, y: number, octaves: number, seed: number): number {
  let v = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    v += tileNoise(x * f, y * f, 1024, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v / norm;
}

type VolumeStyle = 'puff' | 'dust' | 'mist' | 'wisp';

/** Bouffée volumique : densité bourgeonnante, normale apparente tirée du relief de la densité. */
function drawVolume(out: Uint8Array, W: number, ox: number, oy: number, T: number, seed: number, style: VolumeStyle): void {
  const dens = new Float32Array(T * T);
  const sx = (seed * 13.7) % 97;
  const sy = (seed * 7.3) % 89;
  for (let j = 0; j < T; j++) {
    const v = ((j + 0.5) / T) * 2 - 1;
    for (let i = 0; i < T; i++) {
      const u = ((i + 0.5) / T) * 2 - 1;
      let d: number;
      if (style === 'wisp') {
        // filet effiloché : étroit, tordu par un bruit lent
        const warp = (fbm(v * 1.4 + sx, sy, 2, seed) - 0.5) * 0.9;
        const uu = (u - warp * (0.4 + 0.6 * (v * 0.5 + 0.5))) * 2.1;
        const r = Math.sqrt(uu * uu + v * v * 0.92);
        const n = fbm(u * 3.2 + sx, v * 2.2 + sy, 3, seed + 3);
        d = smoothstep(1, 0.1, r + (n - 0.5) * 0.9) * (0.55 + 0.6 * n);
      } else {
        const r = Math.sqrt(u * u + v * v);
        const f1 = style === 'dust' ? 2.4 : style === 'mist' ? 1.1 : 1.7;
        const amp = style === 'dust' ? 0.7 : style === 'mist' ? 0.35 : 0.95;
        const n1 = fbm(u * f1 + sx, v * f1 + sy, 3, seed);
        const n2 = fbm(u * 4.6 + sy, v * 4.6 + sx, 2, seed + 9);
        d = smoothstep(1, style === 'mist' ? 0.0 : 0.18, r + (n1 - 0.5) * amp);
        if (style === 'dust') d *= 0.6 + 0.6 * n2;
        else if (style === 'mist') d = d * d * (0.7 + 0.3 * n2) * 0.8;
        else d *= 0.72 + 0.5 * n2;
      }
      // garde-fou : nul sur le bord de la vignette
      const m = Math.max(Math.abs(u), Math.abs(v));
      d *= smoothstep(1, 0.84, m);
      dens[j * T + i] = d < 0 ? 0 : d > 1 ? 1 : d;
    }
  }
  const relief = style === 'mist' ? 1.2 : style === 'dust' ? 3.2 : 2.6;
  for (let j = 0; j < T; j++) {
    const v = ((j + 0.5) / T) * 2 - 1;
    for (let i = 0; i < T; i++) {
      const u = ((i + 0.5) / T) * 2 - 1;
      const d = dens[j * T + i]!;
      const dl = dens[j * T + (i > 0 ? i - 1 : i)]!;
      const dr = dens[j * T + (i < T - 1 ? i + 1 : i)]!;
      const dd = dens[(j > 0 ? j - 1 : j) * T + i]!;
      const du = dens[(j < T - 1 ? j + 1 : j) * T + i]!;
      const gx = (dr - dl) * T * 0.25;
      const gy = (du - dd) * T * 0.25;
      // normale : mélange de la sphère englobante (rondeur d'ensemble) et du relief (bourgeons)
      const r2 = u * u + v * v;
      const sz = Math.sqrt(Math.max(0.05, 1 - Math.min(1, r2)));
      let nx = u * 0.5 - gx * relief * 0.12;
      let ny = v * 0.5 - gy * relief * 0.12;
      let nz = sz * 0.6 + 0.35;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= l; ny /= l; nz /= l;
      const k = ((oy + j) * W + ox + i) * 4;
      out[k] = Math.round((nx * 0.5 + 0.5) * 255);
      out[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[k + 2] = Math.round(d * d * 255);
      out[k + 3] = Math.round(Math.pow(d, 0.85) * 255);
    }
  }
}

/** Forme en niveaux de gris : `fn(u, v)` retourne [teinte 0..1, opacité 0..1] dans `tmp`. */
function drawShape(
  out: Uint8Array, W: number, ox: number, oy: number, T: number, fn: (u: number, v: number, tmp: Float32Array) => void,
): void {
  const tmp = new Float32Array(2);
  // suréchantillonnage 2 × 2 : bords nets sans crénelage
  for (let j = 0; j < T; j++) {
    for (let i = 0; i < T; i++) {
      let sh = 0;
      let al = 0;
      for (let sj = 0; sj < 2; sj++) {
        for (let si = 0; si < 2; si++) {
          const u = ((i + 0.25 + si * 0.5) / T) * 2 - 1;
          const v = ((j + 0.25 + sj * 0.5) / T) * 2 - 1;
          tmp[0] = 1; tmp[1] = 0;
          fn(u, v, tmp);
          const m = Math.max(Math.abs(u), Math.abs(v));
          const a = tmp[1]! * smoothstep(1, 0.9, m);
          sh += tmp[0]! * a;
          al += a;
        }
      }
      const k = ((oy + j) * W + ox + i) * 4;
      const shade = al > 1e-6 ? sh / al : 1;
      const c = Math.round(Math.min(1, Math.max(0, shade)) * 255);
      out[k] = c; out[k + 1] = c; out[k + 2] = c;
      out[k + 3] = Math.round(Math.min(1, al * 0.25) * 255);
    }
  }
}

/**
 * Construit l'atlas des particules. `tile` : côté d'une vignette en pixels (64 ou 128).
 * Fonction pure et déterministe (≈ 30 à 80 ms pour 128 px, une seule fois au démarrage).
 */
export function buildSpriteAtlas(tile: number): AtlasData {
  const T = Math.max(16, tile | 0);
  const W = T * ATLAS_COLS;
  const H = T * ATLAS_ROWS;
  const out = new Uint8Array(W * H * 4);
  const at = (index: number): [number, number] => [(index % ATLAS_COLS) * T, Math.floor(index / ATLAS_COLS) * T];

  for (let k = 0; k < 4; k++) {
    const [ox, oy] = at(TILE_PUFF + k);
    drawVolume(out, W, ox, oy, T, 11 + k * 37, 'puff');
  }
  {
    const [ox, oy] = at(TILE_WISP);
    drawVolume(out, W, ox, oy, T, 211, 'wisp');
  }
  {
    const [ox, oy] = at(TILE_DUST);
    drawVolume(out, W, ox, oy, T, 331, 'dust');
  }
  {
    const [ox, oy] = at(TILE_MIST);
    drawVolume(out, W, ox, oy, T, 457, 'mist');
  }
  {
    const [ox, oy] = at(TILE_DOT);
    drawShape(out, W, ox, oy, T, (u, v, t) => {
      const r2 = u * u + v * v;
      t[1] = Math.exp(-r2 * 7) * 0.75 + Math.exp(-r2 * 40) * 0.5;
    });
  }
  {
    const [ox, oy] = at(TILE_STREAK);
    drawShape(out, W, ox, oy, T, (u, v, t) => {
      // capsule douce : cœur clair le long de l'axe vertical, extrémités fondues
      const across = Math.exp(-u * u * 9);
      const along = smoothstep(1, 0.35, Math.abs(v));
      t[1] = across * along;
    });
  }
  {
    const [ox, oy] = at(TILE_FLASH);
    drawShape(out, W, ox, oy, T, (u, v, t) => {
      const r = Math.sqrt(u * u + v * v);
      const ang = Math.atan2(v, u);
      const rays = Math.pow(Math.abs(Math.cos(ang * 3 + 0.4)), 18) * 0.6 + Math.pow(Math.abs(Math.cos(ang * 5 + 1.3)), 30) * 0.4;
      t[1] = Math.exp(-r * r * 9) + rays * Math.exp(-r * 2.6) * 0.8 + Math.max(0, 1 - r) * Math.max(0, 1 - r) * 0.22;
    });
  }
  {
    const [ox, oy] = at(TILE_RING);
    drawShape(out, W, ox, oy, T, (u, v, t) => {
      const r = Math.sqrt(u * u + v * v);
      const ang = Math.atan2(v, u);
      const d = (r - 0.74) / 0.075;
      const rough = 0.75 + 0.25 * tileNoise(ang * 2.5 + 20, 0.5, 16, 71);
      t[1] = Math.exp(-d * d) * rough + Math.exp(-((r - 0.6) / 0.2) * ((r - 0.6) / 0.2)) * 0.12;
    });
  }
  {
    const [ox, oy] = at(TILE_SPLASH);
    drawShape(out, W, ox, oy, T, (u, v, t) => {
      let a = 0;
      for (let k = 0; k < 22; k++) {
        const px = h01(k, 1, 901) * 1.5 - 0.75;
        const py = h01(k, 2, 901) * 1.5 - 0.75;
        const pr = 0.04 + h01(k, 3, 901) * 0.09;
        const dx = u - px;
        const dy = v - py;
        const d = Math.sqrt(dx * dx + dy * dy);
        const s = smoothstep(pr, pr * 0.45, d);
        if (s > a) a = s;
      }
      const r = Math.sqrt(u * u + v * v);
      t[1] = Math.max(a, Math.exp(-r * r * 4) * 0.35);
    });
  }
  {
    const [ox, oy] = at(TILE_CHUNK);
    drawShape(out, W, ox, oy, T, (u, v, t) => {
      const r = Math.sqrt(u * u + v * v);
      const ang = Math.atan2(v, u);
      // contour anguleux : rayon par secteurs
      const sect = (ang + Math.PI) / (Math.PI * 2) * 7;
      const s0 = Math.floor(sect);
      const f = sect - s0;
      const r0 = 0.48 + 0.3 * h01(s0 % 7, 5, 433);
      const r1 = 0.48 + 0.3 * h01((s0 + 1) % 7, 5, 433);
      const edge = r0 + (r1 - r0) * f;
      t[1] = smoothstep(edge + 0.03, edge - 0.03, r);
      // facettes : éclairage venant du haut à gauche + grain
      const facet = h01(s0 % 7, 9, 433);
      t[0] = 0.42 + 0.3 * facet + 0.22 * (v * 0.7 - u * 0.4) + 0.12 * tileNoise(u * 9 + 5, v * 9 + 5, 64, 39);
    });
  }
  {
    const [ox, oy] = at(TILE_SHARD);
    drawShape(out, W, ox, oy, T, (u, v, t) => {
      // triangle effilé
      const ax = -0.55, ay = -0.6, bx = 0.62, by = -0.25, cx = -0.1, cy = 0.75;
      const e0 = (bx - ax) * (v - ay) - (by - ay) * (u - ax);
      const e1 = (cx - bx) * (v - by) - (cy - by) * (u - bx);
      const e2 = (ax - cx) * (v - cy) - (ay - cy) * (u - cx);
      const m = Math.min(e0, e1, e2);
      t[1] = smoothstep(0, 0.035, m) * 0.85;
      // arête brillante et dégradé (reflet du verre)
      t[0] = 0.55 + 0.45 * smoothstep(0.16, 0.0, e0) + 0.2 * (u + v) * 0.5;
    });
  }
  {
    const [ox, oy] = at(TILE_DROP);
    drawShape(out, W, ox, oy, T, (u, v, t) => {
      // goutte : disque en bas, pointe vers le haut
      const k = v > -0.2 ? 1 + (v + 0.2) * 1.5 : 1;
      const uu = u * k;
      const r = Math.sqrt(uu * uu + (v + 0.2) * (v + 0.2) * (v > -0.2 ? 0.55 : 1));
      t[1] = smoothstep(0.55, 0.42, r);
      t[0] = 0.75 + 0.25 * smoothstep(0.3, 0.0, Math.sqrt((u + 0.15) * (u + 0.15) + (v + 0.05) * (v + 0.05)));
    });
  }
  {
    const [ox, oy] = at(TILE_STAR);
    drawShape(out, W, ox, oy, T, (u, v, t) => {
      const r2 = u * u + v * v;
      const au = Math.abs(u);
      const av = Math.abs(v);
      t[1] = Math.exp(-r2 * 14) + (Math.exp(-au * 16) * Math.exp(-av * 3.4) + Math.exp(-av * 16) * Math.exp(-au * 3.4)) * 0.85
        + Math.exp(-r2 * 3.5) * 0.18;
    });
  }
  return { data: out, width: W, height: H, tile: T };
}

/**
 * Texture de bruit répétable (RGBA, `size` × `size`) pour animer les flammes : R = bruit large,
 * G = bruit moyen, B = bruit fin, A = 255.
 */
export function buildNoiseTexture(size: number): Uint8Array {
  const S = Math.max(8, size | 0);
  const out = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const u = i / S;
      const v = j / S;
      const a = tileNoise(u * 4, v * 4, 4, 5) * 0.6 + tileNoise(u * 8, v * 8, 8, 6) * 0.28 + tileNoise(u * 16, v * 16, 16, 7) * 0.12;
      const b = tileNoise(u * 8, v * 8, 8, 15) * 0.6 + tileNoise(u * 16, v * 16, 16, 16) * 0.4;
      const c = tileNoise(u * 16, v * 16, 16, 25) * 0.6 + tileNoise(u * 32, v * 32, 32, 26) * 0.4;
      const k = (j * S + i) * 4;
      out[k] = Math.round(a * 255);
      out[k + 1] = Math.round(b * 255);
      out[k + 2] = Math.round(c * 255);
      out[k + 3] = 255;
    }
  }
  return out;
}
