/* =====================================================================================
 * Étiquettes de la carte : une planche par image, posée en une passe, par priorité.
 *
 * Les couches (ordres en cours, unités) et l'aperçu de la carte de commandement ne dessinent plus leurs textes
 * eux-mêmes : ils les DEMANDENT à la planche (`request`), puis MapCanvas la vide en fin d'image (`flush`). Les textes
 * sont alors posés du plus important au moins important :
 *     nom du repère visé (bulle) > aperçu de l'ordre (« en véhicules · 1 min », « QUI ») > étiquettes d'ordres en cours
 *     > étiquettes des unités > noms de lieux du fond de plan.
 * Chaque texte essaie ses positions tour à tour (sous le symbole, à droite, au-dessus, à gauche…) ; une position qui
 * recouvre un texte déjà posé est écartée ; un texte qui n'a aucune place libre n'est pas écrit (sauf la bulle, qui
 * prend sa première position). Les noms de lieux du fond de plan (déjà peints dans l'image du fond) et les symboles
 * d'unités sont des obstacles « mous » : évités quand c'est possible, recouverts sinon (le texte posé dessus a son
 * halo ou son fond, le nom de lieu en dessous disparaît derrière lui).
 *
 * Coût : quelques dizaines de textes par image, comparaisons de boîtes en tableau plat, aucune allocation par texte une
 * fois les tableaux à leur taille. Logique de placement pure (`placeLabels`) : testée sans canevas.
 * ===================================================================================== */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const HALO = '#0b1322';

/** Priorités usuelles (plus grand = posé d'abord). */
export const LABEL_PRIORITY = {
  bubble: 100,
  preview: 80,
  qui: 75,
  selected: 65,
  order: 50,
  /** Textes des couches (barrages, foules, métro, secours en route). */
  layer: 45,
  unit: 40,
} as const;

/**
 * Positions essayées autour de l'ancrage, dans l'ordre :
 *   'below'  sous le symbole, à droite, au-dessus, à gauche (étiquette d'unité) ;
 *   'above'  au-dessus, au-dessous, à droite, à gauche, puis plus haut et plus bas (bulle, étiquette d'aperçu) ;
 *   'center' sur le point, puis 16 px plus haut, plus bas, 32 px plus haut, à droite, à gauche (étiquette d'ordre) ;
 *   'right'  à droite, à gauche, au-dessous, au-dessus (étapes légales à côté du point).
 */
export type LabelMode = 'below' | 'above' | 'center' | 'right';

export interface LabelRequest {
  /** Lignes de texte (une seule pour un texte à halo). */
  lines: string[];
  /** Corps (px) et graisse de chaque ligne ; couleur de chaque ligne. */
  sizes: number[];
  weights: number[];
  colors: string[];
  /** Pastille à fond sombre et liseré (`border`) ; sinon texte à halo. */
  pill: boolean;
  border: string;
  x: number;
  y: number;
  /** Rayon (px) de ce qu'étiquette le texte (symbole, anneau) : les positions s'écartent d'autant de l'ancrage. */
  r: number;
  mode: LabelMode;
  priority: number;
  /** Toujours écrit (la bulle du repère visé), à sa première position si aucune n'est libre. */
  required: boolean;
  /** Rang d'arrivée (départage à priorité égale). */
  seq: number;
  /** Boîte retenue (px) après placement ; w = 0 : non écrit. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

/** Une boîte à placer : taille déjà mesurée. */
export interface LabelSlot {
  w: number;
  h: number;
  x: number;
  y: number;
  r: number;
  mode: LabelMode;
  priority: number;
  required: boolean;
}

/** Résultat d'un placement : coin haut gauche, ou x = NaN si le texte n'est pas écrit. */
export interface PlacedSlot {
  x: number;
  y: number;
}

const TRIES: number[] = [];

/** Décalages (centre de la boîte − ancrage) essayés pour une boîte w × h, dans l'ordre (paires dx, dy). */
export function triesFor(mode: LabelMode, w: number, h: number, r: number, out: number[]): number[] {
  out.length = 0;
  const gx = r + w / 2 + 4;
  const gy = r + h / 2 + 2;
  if (mode === 'below') {
    out.push(0, gy, gx, 0, 0, -gy, -gx, 0, gx, gy, -gx, gy, gx, -gy, -gx, -gy);
  } else if (mode === 'above') {
    out.push(0, -gy, 0, gy, gx, 0, -gx, 0, 0, -gy - h - 4, 0, gy + h + 4, gx, -gy, -gx, -gy);
  } else if (mode === 'right') {
    out.push(gx, 0, -gx, 0, 0, gy, 0, -gy, gx, gy, gx, -gy);
  } else {
    out.push(0, 0, 0, -16, 0, 16, 0, -32, w / 2 + 10, 0, -w / 2 - 10, 0, 0, 32);
  }
  return out;
}

function overlaps(b: readonly number[], n: number, x0: number, y0: number, x1: number, y1: number): boolean {
  for (let i = 0; i < n; i += 4) {
    if (x0 < b[i + 2]! && x1 > b[i]! && y0 < b[i + 3]! && y1 > b[i + 1]!) return true;
  }
  return false;
}

/**
 * Pose des boîtes par priorité décroissante (à priorité égale : dans l'ordre reçu). `hard` : boîtes déjà prises
 * (jamais recouvertes) ; `soft` : obstacles évités si possible (noms de lieux, symboles). Une boîte posée devient dure
 * pour les suivantes. Les boîtes restent dans le cadre `width` × `height`. Logique pure.
 */
export function placeLabels(
  slots: readonly LabelSlot[], hard: number[], soft: readonly number[], width: number, height: number, out: PlacedSlot[],
): PlacedSlot[] {
  out.length = slots.length;
  const order: number[] = [];
  for (let i = 0; i < slots.length; i++) order.push(i);
  order.sort((a, b) => slots[b]!.priority - slots[a]!.priority || a - b);
  let nHard = hard.length;
  for (const i of order) {
    const s = slots[i]!;
    const tries = triesFor(s.mode, s.w, s.h, s.r, TRIES);
    let pick = -1;
    let pickSoft = -1;
    for (let k = 0; k < tries.length; k += 2) {
      const cx = s.x + tries[k]!, cy = s.y + tries[k + 1]!;
      const x0 = cx - s.w / 2, y0 = cy - s.h / 2, x1 = x0 + s.w, y1 = y0 + s.h;
      if (x0 < 2 || y0 < 2 || x1 > width - 2 || y1 > height - 2) continue;
      if (overlaps(hard, nHard, x0, y0, x1, y1)) continue;
      if (!overlaps(soft, soft.length, x0, y0, x1, y1)) {
        pick = k;
        break;
      }
      if (pickSoft < 0) pickSoft = k;
    }
    if (pick < 0) pick = pickSoft;
    let px: number, py: number;
    if (pick >= 0) {
      px = s.x + tries[pick]! - s.w / 2;
      py = s.y + tries[pick + 1]! - s.h / 2;
    } else if (s.required) {
      // la bulle s'écrit toujours : première position, ramenée dans le cadre
      px = Math.max(2, Math.min(width - s.w - 2, s.x + tries[0]! - s.w / 2));
      py = Math.max(2, Math.min(height - s.h - 2, s.y + tries[1]! - s.h / 2));
    } else {
      out[i] = { x: NaN, y: NaN };
      continue;
    }
    out[i] = { x: px, y: py };
    hard[nHard++] = px;
    hard[nHard++] = py;
    hard[nHard++] = px + s.w;
    hard[nHard++] = py + s.h;
  }
  hard.length = nHard;
  return out;
}

/** Planche des étiquettes d'une image de carte (une par MapCanvas). */
export class LabelBoard {
  private readonly reqs: LabelRequest[] = [];
  private count = 0;
  private readonly hard: number[] = [];
  private readonly soft: number[] = [];
  private readonly slots: LabelSlot[] = [];
  private readonly placed: PlacedSlot[] = [];
  /** Textes écrits à la dernière image (boîtes en px) : vérifications et tests. */
  readonly last: { text: string; x: number; y: number; w: number; h: number; priority: number }[] = [];

  /** Nouvelle image : planche vide. */
  reset(): void {
    this.count = 0;
    this.hard.length = 0;
    this.soft.length = 0;
  }

  /** Obstacle mou (nom de lieu du fond de plan, symbole d'unité) : évité quand c'est possible. */
  avoid(x0: number, y0: number, x1: number, y1: number): void {
    this.soft.push(x0, y0, x1, y1);
  }

  /** Texte à halo demandé (une ligne). */
  text(text: string, x: number, y: number, color: string, size: number, weight: number, priority: number, mode: LabelMode = 'center', r = 0): void {
    if (text === '') return;
    const q = this.next();
    q.lines.push(text);
    q.sizes.push(size);
    q.weights.push(weight);
    q.colors.push(color);
    q.pill = false;
    q.border = '';
    this.anchor(q, x, y, r, mode, priority, false);
  }

  /** Pastille (fond sombre, liseré) de plusieurs lignes : la bulle du repère visé, les étapes légales. */
  pill(lines: readonly { s: string; size: number; color: string; weight: number }[], x: number, y: number, r: number, border: string, priority: number, mode: LabelMode, required: boolean): void {
    const q = this.next();
    for (const l of lines) {
      q.lines.push(l.s);
      q.sizes.push(l.size);
      q.weights.push(l.weight);
      q.colors.push(l.color);
    }
    q.pill = true;
    q.border = border;
    this.anchor(q, x, y, r, mode, priority, required);
  }

  private next(): LabelRequest {
    let q = this.reqs[this.count];
    if (!q) {
      q = { lines: [], sizes: [], weights: [], colors: [], pill: false, border: '', x: 0, y: 0, r: 0, mode: 'center', priority: 0, required: false, seq: 0, bx: 0, by: 0, bw: 0, bh: 0 };
      this.reqs.push(q);
    }
    q.lines.length = 0;
    q.sizes.length = 0;
    q.weights.length = 0;
    q.colors.length = 0;
    q.seq = this.count++;
    return q;
  }

  private anchor(q: LabelRequest, x: number, y: number, r: number, mode: LabelMode, priority: number, required: boolean): void {
    q.x = x;
    q.y = y;
    q.r = r;
    q.mode = mode;
    q.priority = priority;
    q.required = required;
  }

  /** Mesure, place et écrit tous les textes demandés pour cette image (cadre `width` × `height` px). */
  flush(g: CanvasRenderingContext2D, width: number, height: number): void {
    this.last.length = 0;
    const n = this.count;
    if (n === 0) return;
    const slots = this.slots;
    slots.length = n;
    for (let i = 0; i < n; i++) {
      const q = this.reqs[i]!;
      let w = 0, h = 0;
      for (let k = 0; k < q.lines.length; k++) {
        g.font = `${q.weights[k]} ${q.sizes[k]}px ${FONT}`;
        w = Math.max(w, g.measureText(q.lines[k]!).width);
        h += q.sizes[k]! + (q.pill ? 4 : 0);
      }
      if (q.pill) {
        w += 18;
        h += 8;
      } else {
        w += 6;
        h += 3;
      }
      const s = slots[i] ?? (slots[i] = { w: 0, h: 0, x: 0, y: 0, r: 0, mode: 'center', priority: 0, required: false });
      s.w = w;
      s.h = h;
      s.x = q.x;
      s.y = q.y;
      s.r = q.r;
      s.mode = q.mode;
      s.priority = q.priority;
      s.required = q.required;
    }
    placeLabels(slots, this.hard, this.soft, width, height, this.placed);
    for (let i = 0; i < n; i++) {
      const p = this.placed[i]!;
      if (!(p.x === p.x)) continue;
      const q = this.reqs[i]!;
      const s = slots[i]!;
      if (q.pill) drawPill(g, q, p.x, p.y, s.w, s.h);
      else drawHalo(g, q, p.x + s.w / 2, p.y + s.h / 2);
      this.last.push({ text: q.lines.join(' / '), x: p.x, y: p.y, w: s.w, h: s.h, priority: q.priority });
    }
    this.count = 0;
  }
}

function drawHalo(g: CanvasRenderingContext2D, q: LabelRequest, cx: number, cy: number): void {
  g.font = `${q.weights[0]} ${q.sizes[0]}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = q.sizes[0]! >= 11 ? 3.5 : 3;
  g.lineJoin = 'round';
  g.strokeStyle = HALO;
  g.strokeText(q.lines[0]!, cx, cy);
  g.fillStyle = q.colors[0]!;
  g.fillText(q.lines[0]!, cx, cy);
}

function drawPill(g: CanvasRenderingContext2D, q: LabelRequest, x0: number, y0: number, w: number, h: number): void {
  g.fillStyle = 'rgba(11,19,34,.9)';
  g.strokeStyle = q.border;
  g.lineWidth = 1.5;
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(x0, y0, w, h, 7);
  else g.rect(x0, y0, w, h);
  g.fill();
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let ly = y0 + 6;
  const cx = x0 + w / 2;
  for (let k = 0; k < q.lines.length; k++) {
    const size = q.sizes[k]!;
    g.font = `${q.weights[k]} ${size}px ${FONT}`;
    g.fillStyle = q.colors[k]!;
    g.fillText(q.lines[k]!, cx, ly + size / 2);
    ly += size + 4;
  }
}

// ───────────────────────────── noms de lieux du fond de plan ─────────────────────────────

/** Corps (px) des noms de monuments peints par le fond de plan (world/view/map2d.ts), au-dessus du monument. */
const LANDMARK_SIZE = 12;
const LANDMARK_FONT = `700 ${LANDMARK_SIZE}px ${FONT}`;
const NAME_WIDTH = new Map<string, number>();
const LM = { x: 0, y: 0 };

/**
 * Marque comme obstacles mous les noms de monuments que le fond de plan écrit dans le champ (« Obélisque de Louxor ») :
 * la bulle et les étiquettes cherchent d'abord une place qui ne les recouvre pas. Largeurs mesurées une fois par nom.
 */
export function avoidLandmarkNames(
  board: LabelBoard, g: CanvasRenderingContext2D,
  view: { mpp: number; contains(x: number, z: number, margin: number): boolean; worldToScreen(x: number, z: number, out: { x: number; y: number }): unknown },
  landmarks: readonly { name: string; x: number; z: number }[],
): void {
  if (view.mpp > 8) return;
  for (let i = 0; i < landmarks.length; i++) {
    const m = landmarks[i]!;
    if (m.name === '' || !view.contains(m.x, m.z, 0)) continue;
    let w = NAME_WIDTH.get(m.name);
    if (w === undefined) {
      const font = g.font;
      g.font = LANDMARK_FONT;
      w = g.measureText(m.name).width;
      g.font = font;
      if (NAME_WIDTH.size > 2000) NAME_WIDTH.clear();
      NAME_WIDTH.set(m.name, w);
    }
    view.worldToScreen(m.x, m.z, LM);
    const cy = LM.y - LANDMARK_SIZE;
    board.avoid(LM.x - w / 2 - 3, cy - LANDMARK_SIZE / 2 - 3, LM.x + w / 2 + 3, cy + LANDMARK_SIZE / 2 + 3);
  }
}
