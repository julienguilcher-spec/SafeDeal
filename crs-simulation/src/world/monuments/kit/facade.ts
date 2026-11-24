/* Kit monuments — façades ordonnancées peintes : une « travée » complète (soubassement, étages, comble)
 * est dessinée sur canvas avec son relief et son éclairage nocturne, puis répétée le long des murs. */
import * as THREE from 'three';
import { canvas2d, css, mixHex, paintBumpBase, paintMatter, rngOf, texFrom, type Canvas2D } from './canvas';
import { defineMaterial, litMaterial, mat } from './materials';

export type FloorKind = 'arcades' | 'bossages' | 'noble' | 'etage' | 'attique';

export interface PalaceFloor { height: number; kind: FloorKind }

export interface PalaceStyle {
  /** Identifiant du style : les textures sont générées une seule fois par identifiant. */
  id: string;
  /** Largeur visée d'une travée (m). */
  bay: number;
  /** Niveaux, du sol vers le haut. */
  floors: PalaceFloor[];
  /** Teinte de la pierre. */
  stone: number;
  roof: {
    kind: 'mansart' | 'comble' | 'terrasse';
    /** Hauteur du comble (m). */
    height: number;
    /** Couverture du versant raide et du dessus. */
    mat?: 'ardoise' | 'zinc' | 'plomb';
    top?: 'ardoise' | 'zinc' | 'plomb';
    /** Lucarnes peintes sur le versant raide. */
    lucarnes?: boolean;
  };
  /** Saillie de la corniche (m). */
  cornice?: number;
  /** Balustrade au-dessus de la corniche. */
  balustrade?: boolean;
  /** Pavillons d'angle : côté (m), surélévation (m), hauteur de toit (m). null = aucun. */
  pavilions?: { size: number; extra: number; roof: number } | null;
  /** Pilastres entre les travées des étages nobles. */
  pilasters?: boolean;
  /** Hauteur de la plinthe (m). */
  plinth?: number;
}

/** Styles de départ : à copier / ajuster par monument. */
export const PALACE_STYLES = {
  /** Palais classique à la française (XVIIe–XVIIIe) : arcades, étage noble, attique, comble à la Mansart. */
  classique: {
    id: 'classique', bay: 4.4, stone: 0xd8cba8,
    floors: [{ height: 7, kind: 'arcades' }, { height: 7.2, kind: 'noble' }, { height: 4.2, kind: 'attique' }],
    roof: { kind: 'mansart', height: 6, mat: 'ardoise', top: 'zinc', lucarnes: true },
    cornice: 0.8, balustrade: false, pavilions: { size: 13, extra: 4.2, roof: 9 }, pilasters: true, plinth: 0.9,
  },
  /** Palais Renaissance / néo-Renaissance (Louvre, Hôtel de Ville) : décor riche, hauts combles d'ardoise. */
  renaissance: {
    id: 'renaissance', bay: 4.8, stone: 0xdccfb0,
    floors: [{ height: 7.5, kind: 'arcades' }, { height: 7, kind: 'noble' }, { height: 5, kind: 'etage' }],
    roof: { kind: 'mansart', height: 8, mat: 'ardoise', top: 'zinc', lucarnes: true },
    cornice: 0.9, balustrade: true, pavilions: { size: 15, extra: 5, roof: 13 }, pilasters: true, plinth: 1.1,
  },
  /** Grand corps de logis sobre (Invalides, casernes, hôtels) : soubassement à refends, étages simples, comble à lucarnes. */
  sobre: {
    id: 'sobre', bay: 4.0, stone: 0xd2c7a8,
    floors: [{ height: 5.5, kind: 'bossages' }, { height: 5, kind: 'etage' }, { height: 4.6, kind: 'etage' }],
    roof: { kind: 'comble', height: 6.5, mat: 'ardoise', top: 'ardoise', lucarnes: true },
    cornice: 0.6, balustrade: false, pavilions: null, pilasters: false, plinth: 0.7,
  },
  /** Palais à toit-terrasse et balustrade (Petit Trianon, hôtels néoclassiques, Crillon). */
  neoclassique: {
    id: 'neoclassique', bay: 4.6, stone: 0xe0d6bc,
    floors: [{ height: 6.5, kind: 'bossages' }, { height: 7.5, kind: 'noble' }, { height: 4, kind: 'attique' }],
    roof: { kind: 'terrasse', height: 0.4, top: 'zinc' },
    cornice: 1.0, balustrade: true, pavilions: null, pilasters: true, plinth: 0.8,
  },
} satisfies Record<string, PalaceStyle>;

export interface FacadeLayout {
  /** Hauteur des murs (m), hauteur de la bande de comble peinte (m), hauteur totale de l'atlas (m). */
  wallH: number; roofBand: number; total: number;
  /** v (0..1) du bas de chaque niveau, puis du sommet des murs. */
  floorV: number[];
}

export function facadeLayout(style: PalaceStyle): FacadeLayout {
  let wallH = 0;
  const y: number[] = [];
  for (const f of style.floors) { y.push(wallH); wallH += f.height; }
  const hasBand = style.roof.kind !== 'terrasse' && style.roof.lucarnes !== false;
  const roofBand = hasBand ? brisisLength(style) : 0;
  const total = wallH + roofBand;
  y.push(wallH);
  return { wallH, roofBand, total, floorV: y.map((v) => v / total) };
}

/** Hauteur et recul du versant raide du comble. */
export function brisis(style: PalaceStyle): { rise: number; run: number } {
  if (style.roof.kind === 'mansart') return { rise: style.roof.height * 0.72, run: style.roof.height * 0.72 * 0.3 };
  if (style.roof.kind === 'comble') return { rise: style.roof.height, run: style.roof.height * 0.85 };
  return { rise: 0, run: 0 };
}

function brisisLength(style: PalaceStyle): number {
  const { rise, run } = brisis(style);
  return Math.hypot(rise, run);
}

const GLASS = 0x232c36;

function paintFacade(style: PalaceStyle, L: FacadeLayout, cv: Canvas2D, bp: Canvas2D, em: Canvas2D): void {
  const W = cv.w, H = cv.h, bw = W / 2;
  const sx = bw / style.bay, sy = H / L.total;
  const stone = style.stone, light = mixHex(stone, 0xffffff, 0.22), dark = mixHex(stone, 0x000000, 0.42), mid = mixHex(stone, 0x000000, 0.14);
  paintMatter(cv, stone, 0.05, 6, 77, 0.03, mixHex(stone, 0x6b6558, 0.5), 0.3);
  paintBumpBase(bp, 150, 6, 16, 78);
  const g = cv.g, b = bp.g;
  const rnd = rngOf(1234);
  const lit: { x: number; y: number; w: number; h: number; arch: boolean }[] = [];
  /** Rectangle en mètres dans la travée `k` (x depuis le bord gauche de la travée, y depuis le sol). */
  const R = (ctx: CanvasRenderingContext2D, k: number, x0: number, y0: number, x1: number, y1: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.fillRect(k * bw + x0 * sx, H - y1 * sy, (x1 - x0) * sx, (y1 - y0) * sy);
  };
  const windowAt = (k: number, cx: number, y0: number, w: number, h: number, arch: boolean, frame: number): void => {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const px = k * bw + x0 * sx, py = H - (y0 + h) * sy, pw = w * sx, phh = h * sy;
    const path = (ctx: CanvasRenderingContext2D, grow: number): void => {
      ctx.beginPath();
      if (arch) {
        const r = pw / 2 + grow;
        ctx.moveTo(px - grow, py + phh); ctx.lineTo(px - grow, py + pw / 2); ctx.arc(px + pw / 2, py + pw / 2, r, Math.PI, 0); ctx.lineTo(px + pw + grow, py + phh);
      } else ctx.rect(px - grow, py - grow, pw + 2 * grow, phh + grow);
      ctx.closePath();
    };
    // chambranle
    g.fillStyle = css(light); path(g, frame * sx); g.fill();
    b.fillStyle = '#f4f4f4'; path(b, frame * sx); b.fill();
    g.fillStyle = css(dark, 0.55); path(g, frame * sx * 0.25); g.fill();
    // vitrage
    const gr = g.createLinearGradient(0, py, 0, py + phh);
    gr.addColorStop(0, css(mixHex(GLASS, 0x000000, 0.35))); gr.addColorStop(0.55, css(GLASS)); gr.addColorStop(1, css(mixHex(GLASS, 0x8fa6b8, 0.35)));
    g.fillStyle = gr; path(g, 0); g.fill();
    b.fillStyle = '#101010'; path(b, 0); b.fill();
    // reflet et petits bois
    g.save(); path(g, 0); g.clip();
    g.fillStyle = 'rgba(190,210,225,0.16)'; g.beginPath(); g.moveTo(px, py + phh * 0.5); g.lineTo(px + pw, py + phh * 0.1); g.lineTo(px + pw, py + phh * 0.3); g.lineTo(px, py + phh * 0.75); g.fill();
    g.fillStyle = css(0xcfc9ba, 0.85);
    g.fillRect(px + pw / 2 - 1, py, 2, phh);
    const bars = Math.max(2, Math.round(h / 1.1));
    for (let i = 1; i < bars; i++) g.fillRect(px, py + (i / bars) * phh - 0.6, pw, 1.4);
    g.restore();
    void x1;
    lit.push({ x: px, y: py, w: pw, h: phh, arch });
  };
  for (let k = 0; k < 2; k++) {
    let y = 0;
    for (let fi = 0; fi < style.floors.length; fi++) {
      const f = style.floors[fi], h = f.height, bay = style.bay, cx = bay / 2;
      if (f.kind === 'arcades' || f.kind === 'bossages') {
        // refends horizontaux
        const n = Math.max(3, Math.round(h / 0.55));
        for (let i = 1; i < n; i++) {
          const yy = y + (i / n) * h;
          R(g, k, 0, yy - 0.03, bay, yy + 0.03, css(dark, 0.6)); R(g, k, 0, yy - 0.09, bay, yy - 0.03, css(light, 0.35));
          R(b, k, 0, yy - 0.05, bay, yy + 0.05, '#202020');
        }
        if (f.kind === 'arcades') {
          const w = bay * 0.56, hh = h * 0.84;
          windowAt(k, cx, y, w, hh, true, 0.22);
          // clef
          R(g, k, cx - 0.22, y + hh - 0.1, cx + 0.22, y + hh + 0.55, css(light)); R(b, k, cx - 0.22, y + hh - 0.1, cx + 0.22, y + hh + 0.55, '#ffffff');
          // imposte
          R(g, k, cx - w / 2 - 0.3, y + hh - w / 2 - 0.12, cx - w / 2, y + hh - w / 2 + 0.12, css(light));
          R(g, k, cx + w / 2, y + hh - w / 2 - 0.12, cx + w / 2 + 0.3, y + hh - w / 2 + 0.12, css(light));
        } else {
          windowAt(k, cx, y + h * 0.2, bay * 0.3, h * 0.56, false, 0.14);
          R(g, k, cx - bay * 0.2, y + h * 0.2 - 0.14, cx + bay * 0.2, y + h * 0.2, css(light)); R(b, k, cx - bay * 0.2, y + h * 0.2 - 0.14, cx + bay * 0.2, y + h * 0.2, '#ffffff');
        }
      } else {
        const noble = f.kind === 'noble', att = f.kind === 'attique';
        if (style.pilasters !== false && !att) {
          const pw = bay * 0.085;
          for (const [x0, x1] of [[0, pw], [bay - pw, bay]] as const) {
            R(g, k, x0, y + 0.05, x1, y + h - 0.3, css(light, 0.8)); R(b, k, x0, y + 0.05, x1, y + h - 0.3, '#e6e6e6');
            R(g, k, x0 === 0 ? x1 - 0.04 : x0, y + 0.05, x0 === 0 ? x1 + 0.05 : x0 + 0.05, y + h - 0.3, css(dark, x0 === 0 ? 0.45 : 0.15));
            // base et chapiteau
            R(g, k, x0 === 0 ? 0 : x0 - 0.1, y + 0.05, x0 === 0 ? x1 + 0.1 : bay, y + 0.42, css(light)); R(b, k, x0 === 0 ? 0 : x0 - 0.1, y + 0.05, x0 === 0 ? x1 + 0.1 : bay, y + 0.42, '#ffffff');
            R(g, k, x0 === 0 ? 0 : x0 - 0.14, y + h - 0.95, x0 === 0 ? x1 + 0.14 : bay, y + h - 0.3, css(light)); R(b, k, x0 === 0 ? 0 : x0 - 0.14, y + h - 0.95, x0 === 0 ? x1 + 0.14 : bay, y + h - 0.3, '#ffffff');
            R(g, k, x0 === 0 ? 0 : x0 - 0.14, y + h - 0.98, x0 === 0 ? x1 + 0.14 : bay, y + h - 0.92, css(dark, 0.5));
          }
        }
        const w = bay * (att ? 0.28 : 0.34), hh = h * (att ? 0.5 : noble ? 0.64 : 0.6), y0 = y + h * (att ? 0.22 : 0.12);
        windowAt(k, cx, y0, w, hh, false, att ? 0.1 : 0.16);
        // appui et garde-corps
        R(g, k, cx - w / 2 - 0.25, y0 - 0.16, cx + w / 2 + 0.25, y0, css(light)); R(b, k, cx - w / 2 - 0.25, y0 - 0.16, cx + w / 2 + 0.25, y0, '#ffffff');
        R(g, k, cx - w / 2 - 0.25, y0 - 0.22, cx + w / 2 + 0.25, y0 - 0.16, css(dark, 0.5));
        if (!att) {
          for (let i = 0; i < 7; i++) R(g, k, cx - w / 2 + (i + 0.3) * (w / 7), y0, cx - w / 2 + (i + 0.7) * (w / 7), y0 + 0.85, css(0x1a1a1a, 0.8));
          R(g, k, cx - w / 2, y0 + 0.82, cx + w / 2, y0 + 0.9, css(0x1a1a1a, 0.9));
        }
        // corniche de baie, fronton (étage noble)
        const ty = y0 + hh + 0.2;
        if (!att) { R(g, k, cx - w / 2 - 0.35, ty, cx + w / 2 + 0.35, ty + 0.2, css(light)); R(b, k, cx - w / 2 - 0.35, ty, cx + w / 2 + 0.35, ty + 0.2, '#ffffff'); R(g, k, cx - w / 2 - 0.3, ty - 0.08, cx + w / 2 + 0.3, ty, css(dark, 0.5)); }
        if (noble) {
          for (const ctx of [g, b]) {
            ctx.fillStyle = ctx === g ? css(light) : '#ffffff';
            ctx.beginPath();
            const X = (m: number): number => k * bw + m * sx, Y = (m: number): number => H - m * sy;
            if ((fi + k) % 2 === 0) { ctx.moveTo(X(cx - w / 2 - 0.35), Y(ty + 0.2)); ctx.lineTo(X(cx), Y(ty + 0.2 + w * 0.3)); ctx.lineTo(X(cx + w / 2 + 0.35), Y(ty + 0.2)); }
            else { ctx.moveTo(X(cx - w / 2 - 0.35), Y(ty + 0.2)); ctx.quadraticCurveTo(X(cx), Y(ty + 0.2 + w * 0.5), X(cx + w / 2 + 0.35), Y(ty + 0.2)); }
            ctx.closePath(); ctx.fill();
          }
        }
      }
      // bandeau d'étage
      const top = y + h;
      R(g, k, 0, top - 0.3, bay, top, css(light)); R(b, k, 0, top - 0.3, bay, top, '#f0f0f0');
      R(g, k, 0, top - 0.38, bay, top - 0.3, css(dark, 0.55)); R(g, k, 0, top - 0.04, bay, top, css(mid, 0.6));
      y += h;
    }
    // comble : ardoise et lucarne
    if (L.roofBand > 0) {
      const y0 = L.wallH, y1 = L.total, bay = style.bay, cx = bay / 2;
      const slate = style.roof.mat === 'zinc' ? 0x8f999d : style.roof.mat === 'plomb' ? 0x6c767b : 0x3e4651;
      R(g, k, 0, y0, bay, y1, css(slate)); R(b, k, 0, y0, bay, y1, '#787878');
      const rows = Math.max(6, Math.round(L.roofBand / 0.14));
      for (let i = 0; i < rows; i++) {
        const yy = y0 + (i / rows) * (y1 - y0);
        R(g, k, 0, yy, bay, yy + 0.03, 'rgba(0,0,0,0.38)');
        for (let q = 0; q < 16; q++) { const v = rnd(); R(g, k, (q + (i % 2) * 0.5) * (bay / 16), yy, (q + (i % 2) * 0.5) * (bay / 16) + 0.02, yy + (y1 - y0) / rows, 'rgba(0,0,0,0.3)'); if (v > 0.6) R(g, k, q * (bay / 16), yy, (q + 1) * (bay / 16), yy + (y1 - y0) / rows, `rgba(190,205,225,${(v - 0.6) * 0.2})`); }
      }
      const lw = bay * 0.3, lh = Math.min(L.roofBand * 0.62, 2.6);
      R(g, k, cx - lw / 2 - 0.2, y0 + 0.25, cx + lw / 2 + 0.2, y0 + 0.3 + lh + 0.25, css(light)); R(b, k, cx - lw / 2 - 0.2, y0 + 0.25, cx + lw / 2 + 0.2, y0 + 0.3 + lh + 0.25, '#ffffff');
      windowAt(k, cx, y0 + 0.4, lw, lh, false, 0.08);
      for (const ctx of [g, b]) {
        ctx.fillStyle = ctx === g ? css(light) : '#ffffff';
        ctx.beginPath(); ctx.moveTo(k * bw + (cx - lw / 2 - 0.35) * sx, H - (y0 + 0.55 + lh) * sy); ctx.lineTo(k * bw + cx * sx, H - (y0 + 0.55 + lh + lw * 0.36) * sy); ctx.lineTo(k * bw + (cx + lw / 2 + 0.35) * sx, H - (y0 + 0.55 + lh) * sy); ctx.closePath(); ctx.fill();
      }
      R(g, k, 0, y1 - 0.18, bay, y1, css(0x9aa3a6)); R(g, k, 0, y0, bay, y0 + 0.2, css(0x8f999d));
    }
  }
  // éclairage nocturne : façade vue sous les projecteurs, fenêtres allumées au hasard
  const e = em.g;
  e.drawImage(cv.c, 0, 0);
  e.fillStyle = 'rgba(20,14,6,0.28)'; e.fillRect(0, 0, W, H);
  for (const w of lit) {
    const on = rnd() < 0.5;
    e.save();
    e.beginPath();
    if (w.arch) { e.moveTo(w.x, w.y + w.h); e.lineTo(w.x, w.y + w.w / 2); e.arc(w.x + w.w / 2, w.y + w.w / 2, w.w / 2, Math.PI, 0); e.lineTo(w.x + w.w, w.y + w.h); } else e.rect(w.x, w.y, w.w, w.h);
    e.closePath(); e.clip();
    if (on) {
      const gr = e.createLinearGradient(0, w.y, 0, w.y + w.h);
      gr.addColorStop(0, 'rgba(255,214,140,0.95)'); gr.addColorStop(1, 'rgba(255,170,90,0.85)');
      e.fillStyle = gr; e.fillRect(w.x, w.y, w.w, w.h);
      e.fillStyle = 'rgba(60,40,20,0.7)'; e.fillRect(w.x + w.w / 2 - 1, w.y, 2, w.h);
    } else { e.fillStyle = 'rgba(8,10,14,0.85)'; e.fillRect(w.x, w.y, w.w, w.h); }
    e.restore();
  }
}

const layouts = new Map<string, FacadeLayout>();

/** Matériau de façade d'un style (créé une fois) et sa mise en page verticale. */
export function facadeMaterial(style: PalaceStyle): { material: THREE.Material; layout: FacadeLayout } {
  const key = `facade:${style.id}`;
  let layout = layouts.get(key);
  if (!layout) { layout = facadeLayout(style); layouts.set(key, layout); }
  const L = layout;
  defineMaterial(key, () => {
    const tall = L.total / style.bay > 2.2;
    const cv = canvas2d(512, tall ? 1024 : 512), bp = canvas2d(512, tall ? 1024 : 512), em = canvas2d(512, tall ? 1024 : 512);
    if (!cv || !bp || !em) return litMaterial(key, { color: style.stone, roughness: 0.9, night: 0.85 });
    paintFacade(style, L, cv, bp, em);
    const m = litMaterial(key, { color: 0xffffff, roughness: 0.88, night: 1.0, bumpScale: 3 }, { map: texFrom(cv), bump: texFrom(bp, { srgb: false }) });
    m.emissiveMap = texFrom(em);
    m.emissive.setHex(0xffd9a8);
    return m;
  });
  return { material: mat(key), layout: L };
}
