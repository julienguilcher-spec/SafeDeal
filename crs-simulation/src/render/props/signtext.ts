/* =====================================================================================
 * RENDU DU DÉCOR — enseignes des commerces (logique pure, testée sous Node).
 *
 *   - shopStyle() : habillage déterministe d'une devanture selon la catégorie et une graine
 *     (couleur de la boiserie, du bandeau, des lettres, store banne, enseigne en drapeau…) ;
 *   - layoutSign() : mise en page du NOM D'ENSEIGNE FICTIF dans une cellule d'atlas — une ou deux
 *     lignes, corps maximal qui tient, coupure équilibrée, troncature par « … » en dernier recours.
 * Les noms viennent de Shop.name (composés par la simulation, aucune marque réelle).
 * ===================================================================================== */

export interface ShopStyle {
  /** Couleur de la boiserie / de l'encadrement. */
  frame: number;
  /** Fond du bandeau d'enseigne et couleur des lettres. */
  band: number;
  ink: number;
  /** Soubassement. */
  plinth: number;
  /** 0 romain à empattements, 1 linéale, 2 linéale étroite grasse, 3 italique. */
  font: 0 | 1 | 2 | 3;
  upper: boolean;
  /** Store banne : couleur (0 = pas de store) et seconde couleur des rayures (0 = uni). */
  awning: number;
  stripes: number;
  /** Enseigne éclairée la nuit ; vitrine éclairée la nuit. */
  litSign: boolean;
  lightsOn: boolean;
  /** Côté de la porte : -1 gauche, 1 droite, 0 au centre. */
  doorSide: -1 | 0 | 1;
  /** Hauteur du soubassement (m). */
  sill: number;
  /** Enseigne en drapeau : '' ou nom de pictogramme. */
  blade: '' | 'croix_pharma' | 'carotte' | 'hotel';
  /** Filet autour du bandeau. */
  border: boolean;
}

function h32(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  return h >>> 0;
}

function pick<T>(list: readonly T[], h: number): T {
  return list[h % list.length]!;
}

interface Palette { frame: number; band: number; ink: number }

const P = (frame: number, band: number, ink: number): Palette => ({ frame, band, ink });

const GOLD = 0xc9a227, CREAM = 0xf2ead8, WHITE = 0xf5f5f2, BLACK = 0x141414;

const PALETTES: Readonly<Record<string, readonly Palette[]>> = {
  banque: [P(0x2b3440, 0xe6e2d8, 0x1d3557), P(0x39424e, 0x1d3557, WHITE), P(0x4a4f57, 0xdcd8cc, 0x234a36)],
  luxe: [P(0x141414, 0x141414, GOLD), P(0x2a2320, 0xece6d8, 0x2a2320), P(0x1b1b1f, 0x1b1b1f, WHITE)],
  bijouterie: [P(0x1c2b3a, 0x1c2b3a, GOLD), P(0x3b1f2b, 0x3b1f2b, 0xe8d9a8), P(0x18241c, 0x18241c, GOLD)],
  mode: [P(0xf2efe6, 0xf2efe6, BLACK), P(0x1a1a1a, 0x1a1a1a, WHITE), P(0xd9c7b8, 0xd9c7b8, 0x3a2a22), P(0x2b3a4a, 0x2b3a4a, CREAM)],
  alimentation: [P(0x2f5d3a, 0x2f5d3a, CREAM), P(0x8c2f2a, 0x8c2f2a, CREAM), P(0x9c6b1e, 0xe9d8a6, 0x5a3a12)],
  supermarche: [P(0xc9c9c6, 0xb3261e, WHITE), P(0xc9c9c6, 0x1f7a3f, WHITE), P(0xc9c9c6, 0x1d4e89, 0xffd23f)],
  cafe_restaurant: [P(0x5a1e1e, 0x5a1e1e, GOLD), P(0x1f3d2b, 0x1f3d2b, CREAM), P(0x1e2f4a, 0x1e2f4a, GOLD), P(0x191919, 0x191919, CREAM)],
  restauration_rapide: [P(0x3a3a3a, 0xd9480f, WHITE), P(0x2a2a2a, 0xf2b705, 0x1a1a1a), P(0x3a3a3a, 0xb3261e, 0xffe08a)],
  pharmacie: [P(0xf0f0ec, 0x1f8f4e, WHITE), P(0xe8ece8, 0x17713e, WHITE)],
  tabac_presse: [P(0x7a1f1f, 0x7a1f1f, WHITE), P(0x2a2a2a, 0x8c1c1c, WHITE)],
  telephonie: [P(0xf2f2f2, 0x1b6ca8, WHITE), P(0x1a1a1a, 0xa61e69, WHITE), P(0xf2f2f2, 0x111111, 0x7ee0c3)],
  agence: [P(0x2c3e50, 0x1d3557, WHITE), P(0xe9e6df, 0x0f6e6e, WHITE), P(0x34383d, 0xd97a1c, WHITE)],
  hotel: [P(0x2a2320, 0x2a2320, GOLD), P(0x1e2f4a, 0x1e2f4a, CREAM)],
  autre: [P(0x1f3d2b, 0x1f3d2b, CREAM), P(0x1e2f4a, 0x1e2f4a, WHITE), P(0x5a1e1e, 0x5a1e1e, CREAM), P(0x33302c, 0xe9e2d0, 0x33302c),
    P(0x6b4a2a, 0x6b4a2a, CREAM), P(0x3f5a4a, 0x3f5a4a, WHITE)],
};

const AWNINGS: readonly number[] = [0x7a1f1f, 0x1f3d2b, 0xe8dcc0, 0x1e2f4a, 0xb3441e];

/** Habillage déterministe de la devanture d'un commerce. */
export function shopStyle(category: string, seed: number): ShopStyle {
  const pal = pick(Object.prototype.hasOwnProperty.call(PALETTES, category) ? PALETTES[category]! : PALETTES.autre!, h32(seed, 1));
  const r2 = h32(seed, 2), r3 = h32(seed, 3), r4 = h32(seed, 4), r5 = h32(seed, 5);
  let font: 0 | 1 | 2 | 3 = 1;
  let upper = true;
  let awning = 0;
  let stripes = 0;
  let litSign = false;
  let blade: ShopStyle['blade'] = '';
  let sill = 0.45;
  let lightsOn = r5 % 10 < 8;
  switch (category) {
    case 'luxe': case 'bijouterie': case 'hotel': case 'banque':
      font = 0;
      break;
    case 'cafe_restaurant':
      font = r2 % 3 === 0 ? 3 : 0;
      upper = r2 % 3 !== 0;
      break;
    case 'supermarche': case 'restauration_rapide':
      font = 2;
      break;
    case 'alimentation': case 'tabac_presse':
      font = r2 % 2 === 0 ? 0 : 1;
      break;
    default:
      font = (r2 % 3) as 0 | 1 | 2;
      upper = r2 % 4 !== 3;
  }
  if (category === 'cafe_restaurant' || category === 'alimentation' || (category === 'autre' && r3 % 3 === 0) || category === 'hotel') {
    awning = category === 'cafe_restaurant' || category === 'alimentation' ? pick(AWNINGS, r3) : pal.frame;
    if (category === 'alimentation' && r3 % 2 === 0) stripes = 0xf2ead8;
    if (awning === 0xe8dcc0) stripes = 0;
  }
  if (category === 'pharmacie') { blade = 'croix_pharma'; litSign = true; lightsOn = true; }
  if (category === 'tabac_presse') { blade = 'carotte'; litSign = true; }
  if (category === 'hotel') { blade = 'hotel'; litSign = true; lightsOn = true; }
  if (category === 'restauration_rapide' || category === 'supermarche' || category === 'telephonie') litSign = true;
  if (category === 'bijouterie') sill = 0.9;
  if (category === 'banque') { sill = 0.7; lightsOn = r5 % 10 < 3; }
  if (category === 'luxe') sill = 0.3;
  const doorSide: -1 | 0 | 1 = r4 % 5 === 0 ? 0 : r4 % 2 === 0 ? -1 : 1;
  return {
    frame: pal.frame, band: pal.band, ink: pal.ink, plinth: darker(pal.frame, 0.72), font, upper, awning, stripes,
    litSign, lightsOn, doorSide, sill, blade, border: font === 0 && r2 % 2 === 0,
  };
}

function darker(hex: number, k: number): number {
  const r = Math.round(((hex >> 16) & 255) * k), g = Math.round(((hex >> 8) & 255) * k), b = Math.round((hex & 255) * k);
  return (r << 16) | (g << 8) | b;
}

/** Clé d'atlas d'une enseigne : même nom et même habillage → même cellule. */
export function signKey(name: string, style: ShopStyle): string {
  return `${name}|${style.band.toString(16)}|${style.ink.toString(16)}|${style.font}${style.upper ? 'U' : 'l'}${style.border ? 'b' : ''}`;
}

// ───────────────────────────── mise en page ─────────────────────────────

/** Largeur (px) d'un texte pour un corps donné : fournie par le canvas en jeu, estimée dans les tests. */
export type Measure = (text: string, fontPx: number) => number;

export interface SignLayout {
  /** Une ou deux lignes (aucune si le nom est vide). */
  lines: string[];
  /** Corps du texte (px). */
  fontPx: number;
  /** Ordonnée de la ligne de base de chaque ligne (px depuis le haut de la cellule). */
  baselines: number[];
  /** Le nom a dû être tronqué. */
  truncated: boolean;
}

const NARROW = 'iljtfI.,;:!\'|1 ';
const WIDE = 'mwMWŒÆ@%';

/** Estimation de largeur sans canvas (chasse moyenne d'une linéale). */
export function estimateWidth(text: string, fontPx: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (NARROW.includes(ch)) w += 0.3;
    else if (WIDE.includes(ch)) w += 0.86;
    else if (ch >= 'A' && ch <= 'Z') w += 0.68;
    else if (ch.toUpperCase() !== ch.toLowerCase() && ch === ch.toUpperCase()) w += 0.68;
    else w += 0.54;
  }
  return w * fontPx;
}

/** Réduit `text` jusqu'à ce qu'il tienne dans maxW, en terminant par « … ». */
function truncate(text: string, fontPx: number, maxW: number, measure: Measure): string {
  let t = text;
  while (t.length > 1 && measure(t + '…', fontPx) > maxW) {
    // retirer d'abord un mot entier, sinon un caractère
    const sp = t.lastIndexOf(' ');
    t = sp > t.length * 0.5 ? t.slice(0, sp) : t.slice(0, -1);
    t = t.replace(/[\s,&'’-]+$/u, '');
  }
  return t + '…';
}

/**
 * Met en page un nom d'enseigne dans une cellule de cellW × cellH pixels.
 * Une ligne au plus grand corps possible ; si le corps tomberait sous 44 % de la hauteur, deux lignes
 * coupées à l'espace qui les équilibre le mieux ; en dernier recours, troncature.
 */
export function layoutSign(name: string, cellW: number, cellH: number, measure: Measure = estimateWidth, upper = false): SignLayout {
  let text = name.replace(/\s+/gu, ' ').trim();
  if (upper) text = text.toLocaleUpperCase('fr-FR');
  if (text === '') return { lines: [], fontPx: 0, baselines: [], truncated: false };
  const maxW = cellW * 0.92;
  const f1Max = Math.floor(cellH * 0.62);
  const f1Min = cellH * 0.44;
  const w1 = measure(text, f1Max);
  if (w1 <= maxW) return oneLine(text, f1Max, cellH, false);
  const f1 = Math.floor((f1Max * maxW) / w1);
  if (f1 >= f1Min) return oneLine(text, f1, cellH, false);

  // deux lignes : meilleure coupure à une espace
  const f2Max = Math.floor(cellH * 0.4);
  const f2Min = cellH * 0.27;
  let best = -1;
  let bestW = Infinity;
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== ' ') continue;
    const w = Math.max(measure(text.slice(0, i), f2Max), measure(text.slice(i + 1), f2Max));
    if (w < bestW) {
      bestW = w;
      best = i;
    }
  }
  if (best < 0) {
    // un seul mot trop long : une ligne réduite, puis tronquée
    const fMin = Math.floor(cellH * 0.3);
    const f = Math.max(fMin, Math.min(f1Max, Math.floor((f1Max * maxW) / w1)));
    if (measure(text, f) <= maxW) return oneLine(text, f, cellH, false);
    return oneLine(truncate(text, fMin, maxW, measure), fMin, cellH, true);
  }
  let a = text.slice(0, best);
  let b = text.slice(best + 1);
  let f2 = f2Max;
  let truncated = false;
  if (bestW > maxW) {
    f2 = Math.floor((f2Max * maxW) / bestW);
    if (f2 < f2Min) {
      f2 = Math.ceil(f2Min);
      if (measure(a, f2) > maxW) {
        // la première ligne elle-même déborde : recouper au mieux
        let cut = -1;
        for (let i = a.length - 1; i > 0; i--) {
          if (a[i] === ' ' && measure(a.slice(0, i), f2) <= maxW) {
            cut = i;
            break;
          }
        }
        if (cut > 0) {
          b = a.slice(cut + 1) + ' ' + b;
          a = a.slice(0, cut);
        } else {
          a = truncate(a, f2, maxW, measure);
          truncated = true;
        }
      }
      if (measure(b, f2) > maxW) {
        b = truncate(b, f2, maxW, measure);
        truncated = true;
      }
    }
  }
  const gap = f2 * 0.16;
  const total = f2 * 2 + gap;
  const top = (cellH - total) / 2;
  return { lines: [a, b], fontPx: f2, baselines: [top + f2 * 0.82, top + f2 + gap + f2 * 0.82], truncated };
}

function oneLine(text: string, fontPx: number, cellH: number, truncated: boolean): SignLayout {
  return { lines: [text], fontPx, baselines: [cellH / 2 + fontPx * 0.35], truncated };
}
