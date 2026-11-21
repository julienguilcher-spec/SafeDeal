/* =====================================================================================
 * Couches « unités » et « ordres en cours » dessinées par-dessus le fond de plan.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import { LABEL_PRIORITY } from './labelLayout';
import type { LabelBoard } from './labelLayout';
import type { MapScene } from './scene';
import { UNIT_COLORS, drawUnitSymbol } from './symbols';
import type { SymbolOptions } from './symbols';
import type { MapTransform, ScreenPoint } from './transform';
import type { MapUnit } from './units';

/** Des unités sœurs plus serrées que cela à l'écran (px) sont fondues dans le symbole de leur unité supérieure. */
export const COLLAPSE_PX = 24;
export const COLLAPSE_PX_COMPACT = 13;

export interface UnitLayerOptions {
  compact: boolean;
  selection: ReadonlySet<number> | null;
  hoverKey: number;
  /** Unité que le joueur peut commander (les autres sont atténuées) ; null = aucune atténuation. */
  commandable: ((key: number) => boolean) | null;
  /** Taille de base du cadre (px). */
  size: number;
  /** Unités en simples pions, sans cadre ni texte (plan de ville). */
  dots?: boolean;
  /**
   * Unités mises en avant (clés) : Qui de l'aperçu d'un ordre, groupe du joueur sur la carte en lecture seule. Les
   * autres sont estompées à `emphasisAlpha` (0,6 par défaut). null ou vide : aucune mise en avant.
   */
  emphasis?: ReadonlySet<number> | null;
  emphasisAlpha?: number;
  /**
   * Planche des étiquettes de l'image (labelLayout.ts) : les textes des unités et des ordres y sont demandés, posés en
   * fin d'image sans se chevaucher. Absente (mini-carte, aperçus) : textes écrits sur place, comme avant.
   */
  labels?: LabelBoard | null;
}

/** Unités à dessiner pour une échelle donnée, avec l'étendue de leur sous-arbre dans scene.units. */
export interface ShownUnits {
  units: MapUnit[];
  /** Pour chaque unité montrée : indices [début, fin[ de son sous-arbre (elle comprise) dans scene.units. */
  start: number[];
  end: number[];
}

export function createShown(): ShownUnits {
  return { units: [], start: [], end: [] };
}

/**
 * Choisit les symboles à dessiner : les unités sans subordonnées, sauf quand des unités sœurs se
 * chevaucheraient à l'écran — on montre alors le seul symbole de l'unité supérieure (section,
 * compagnie). Un poste de commandement de compagnie reste visible à côté de ses sections.
 * Règle partagée par le dessin et par la désignation à la souris.
 */
export function visibleUnits(scene: MapScene, mpp: number, compact: boolean, out: ShownUnits): ShownUnits {
  const units = scene.units;
  const n = units.length;
  const limit = (compact ? COLLAPSE_PX_COMPACT : COLLAPSE_PX) * mpp;
  out.units.length = 0;
  out.start.length = 0;
  out.end.length = 0;
  let i = 0;
  while (i < n) {
    const u = units[i]!;
    let j = i + 1;
    while (j < n && units[j]!.depth > u.depth) j++;
    if (j > i + 1) {
      // étendue des unités terminales du sous-arbre autour de leur barycentre
      let sx = 0, sz = 0, leaves = 0;
      for (let k = i + 1; k < j; k++) {
        const c = units[k]!;
        if (c.childCount === 0 && c.total > 0) {
          sx += c.x;
          sz += c.z;
          leaves++;
        }
      }
      if (leaves === 0) {
        if (u.total > 0) push(out, u, i, j);
        i = j;
        continue;
      }
      sx /= leaves;
      sz /= leaves;
      let crowded = false;
      if (leaves > 1) {
        if (leaves === j - i - 1) {
          // dernier échelon (section et ses groupes) : on fond dès que deux symboles se toucheraient
          let min = Infinity;
          for (let a = i + 1; a < j && min > limit; a++) {
            const ua = units[a]!;
            if (ua.total === 0) continue;
            for (let b = a + 1; b < j; b++) {
              const ub = units[b]!;
              if (ub.total === 0) continue;
              const d = Math.hypot(ua.x - ub.x, ua.z - ub.z);
              if (d < min) min = d;
            }
          }
          crowded = min <= limit;
        } else if (!(u.symbol === 'compagnie' && u.own > 0)) {
          // échelon supérieur : seulement quand tout le dispositif tient dans un symbole (une compagnie
          // dont le poste de commandement est figuré à part ne se fond jamais : ses sections restent lisibles)
          let spread = 0;
          for (let k = i + 1; k < j; k++) {
            const c = units[k]!;
            if (c.childCount !== 0 || c.total === 0) continue;
            const d = Math.hypot(c.x - sx, c.z - sz);
            if (d > spread) spread = d;
          }
          crowded = spread <= limit;
        }
      }
      if (crowded) {
        push(out, u, i, j);
        i = j;
        continue;
      }
      // unités assez écartées : on les montre une à une ; le poste de commandement d'une compagnie reste affiché
      if (u.symbol === 'compagnie' && u.own > 0 && !compact) push(out, u, i, i + 1);
      i++;
      continue;
    }
    if (u.total > 0 || u.squadId === 0) push(out, u, i, j);
    i++;
  }
  return out;
}

function push(out: ShownUnits, u: MapUnit, start: number, end: number): void {
  out.units.push(u);
  out.start.push(start);
  out.end.push(end);
}

/** Une unité sélectionnée directement ou par l'une de ses unités supérieures. */
export function isSelected(scene: MapScene, u: MapUnit, selection: ReadonlySet<number> | null): boolean {
  if (!selection || selection.size === 0) return false;
  let cur: MapUnit | undefined = u;
  for (let guard = 0; cur && guard < 8; guard++) {
    if (selection.has(cur.key)) return true;
    cur = cur.parentKey !== 0 ? scene.unitModel.get(cur.parentKey) : undefined;
  }
  return false;
}

const SP: ScreenPoint = { x: 0, y: 0 };
const SQ: ScreenPoint = { x: 0, y: 0 };
const SYM: SymbolOptions = {
  size: 14, headingAngle: NaN, faction: 'police', selected: false, hover: false, dim: false, strength: 1,
  injured: false, code: '', detail: '', compact: false,
};

const SHOWN = createShown();

/** L'unité montrée (ou l'une des unités fondues dans son symbole, ou l'une de ses supérieures) est mise en avant. */
function emphasised(scene: MapScene, shown: ShownUnits, i: number, set: ReadonlySet<number>): boolean {
  const u = shown.units[i]!;
  if (isSelected(scene, u, set)) return true;
  const all = scene.units;
  for (let k = shown.start[i]! + 1; k < shown.end[i]!; k++) if (set.has(all[k]!.key)) return true;
  return false;
}

/** Véhicule de service hors unité : petit rectangle orienté, à l'échelle quand on zoome. */
function drawVehicleMark(g: CanvasRenderingContext2D, x: number, y: number, angle: number, mpp: number, rescue: boolean, hot: boolean): void {
  const len = Math.max(9, 6 / mpp);
  const wid = Math.max(4.5, 2.3 / mpp);
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = rescue ? UNIT_COLORS.rescue : '#2a59b8';
  g.strokeStyle = hot ? UNIT_COLORS.selected : 'rgba(236,242,252,.9)';
  g.lineWidth = hot ? 2 : 1;
  g.beginPath();
  g.rect(-wid / 2, -len / 2, wid, len);
  g.fill();
  g.stroke();
  // pare-brise : indique l'avant
  g.fillStyle = 'rgba(236,242,252,.85)';
  g.fillRect(-wid / 2 + 1, -len / 2 + 1.5, wid - 2, Math.max(1.5, len * 0.16));
  g.restore();
}

/** Mini-carte : un simple pion par unité (carré bleu, disque pour un drone, rouge pour les secours). */
function drawDot(g: CanvasRenderingContext2D, u: MapUnit, x: number, y: number, mine: boolean): void {
  const r = u.childCount > 0 ? 4.5 : 3.6;
  g.fillStyle = u.faction === 'rescue' ? UNIT_COLORS.rescue : UNIT_COLORS.police;
  g.strokeStyle = mine ? UNIT_COLORS.selected : '#ffffff';
  g.lineWidth = mine ? 1.8 : 1.2;
  g.beginPath();
  if (u.symbol === 'drone') g.arc(x, y, r, 0, Math.PI * 2);
  else g.rect(x - r, y - r, r * 2, r * 2);
  g.fill();
  g.stroke();
}

// ───────────────────────────── unités au même endroit : une étiquette ─────────────────────────────

/** Deux symboles plus proches que cela à l'écran (px, × taille du cadre) se recouvrent : ils forment une pile. */
export const STACK_FACTOR = 1.25;
/** Décalage (px) de chaque symbole d'une pile, vers le haut à droite, au plus pour les trois premiers. */
const STACK_STEP = 4;

/** Indicatif commun d'unités (« MISTRAL 1 ALFA », « MISTRAL 1 », « MISTRAL » → « MISTRAL »), sinon le premier nom. */
export function commonName(names: readonly string[]): string {
  if (names.length === 0) return '';
  let words = names[0]!.split(/\s+/);
  for (let i = 1; i < names.length; i++) {
    const w = names[i]!.split(/\s+/);
    let k = 0;
    while (k < words.length && k < w.length && words[k] === w[k]) k++;
    words = words.slice(0, k);
  }
  return words.length > 0 ? words.join(' ') : names[0]!;
}

/**
 * Étiquette d'une pile d'unités : « MISTRAL · 3 unités · 45 » (indicatif commun, nombre, agents valides). L'effectif
 * d'une unité compte ses subordonnées : une unité dont un supérieur est dans la même pile n'est pas comptée deux fois
 * (`parentOf` : clé de l'unité supérieure, d'après le modèle de la scène ; à défaut, `parentKey` seul).
 */
export function stackLabel(
  units: readonly Pick<MapUnit, 'name' | 'valid' | 'total' | 'squadId' | 'key' | 'parentKey'>[], parentOf?: (key: number) => number,
): string {
  const name = commonName(units.map((u) => u.name));
  let valid = 0;
  for (const u of units) {
    if (u.squadId === 0 || u.total <= 0) continue;
    let inPile = false;
    let p = u.parentKey;
    for (let guard = 0; p !== 0 && guard < 8 && !inPile; guard++) {
      for (const v of units) if (v !== u && v.key === p) inPile = true;
      p = parentOf ? parentOf(p) : 0;
    }
    if (!inPile) valid += u.valid;
  }
  return `${name} · ${units.length} unités${valid > 0 ? ' · ' + valid : ''}`;
}

/**
 * Regroupe en piles les unités montrées dont les symboles se recouvrent à l'écran (`pos` : x, y par unité ; NaN hors
 * champ) : `pile[i]` = indice de la première unité de sa pile, `rank[i]` = rang dans la pile (0 : la première). Les
 * véhicules sans unité ne s'empilent pas. Logique pure.
 */
export function stackUnits(units: readonly MapUnit[], pos: readonly number[], radius: number, pile: number[], rank: number[]): void {
  const n = units.length;
  pile.length = n;
  rank.length = n;
  for (let i = 0; i < n; i++) {
    pile[i] = i;
    rank[i] = 0;
    const x = pos[i * 2]!, y = pos[i * 2 + 1]!;
    if (!(x === x) || (units[i]!.squadId === 0 && units[i]!.symbol === 'vehicule')) continue;
    for (let j = 0; j < i; j++) {
      if (pile[j] !== j) continue;
      const u = units[j]!;
      if (u.squadId === 0 && u.symbol === 'vehicule') continue;
      const dx = pos[j * 2]! - x, dy = pos[j * 2 + 1]! - y;
      if (dx * dx + dy * dy <= radius * radius) {
        pile[i] = j;
        let r = 0;
        for (let k = j; k < i; k++) if (pile[k] === j) r++;
        rank[i] = r;
        break;
      }
    }
  }
}

const POS: number[] = [];
const PILE: number[] = [];
const RANK: number[] = [];
const PILE_SIZE: number[] = [];
const PILE_OPEN: boolean[] = [];
const PILE_UNITS: MapUnit[] = [];

export function drawUnits(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: UnitLayerOptions): void {
  const shown = visibleUnits(scene, t.mpp, o.compact, SHOWN);
  const all = scene.units;
  const sel = o.selection;
  // planche des étiquettes : les unités qui se recouvrent forment une pile, sous UNE étiquette (dépliée si l'une
  // d'elles est sélectionnée ou survolée) ; chaque texte est posé à une place libre en fin d'image
  const board = !o.compact && !o.dots ? o.labels ?? null : null;
  if (board) {
    const n = shown.units.length;
    POS.length = n * 2;
    for (let i = 0; i < n; i++) {
      const u = shown.units[i]!;
      if (!t.contains(u.x, u.z, 40)) {
        POS[i * 2] = NaN;
        POS[i * 2 + 1] = NaN;
        continue;
      }
      t.worldToScreen(u.x, u.z, SP);
      POS[i * 2] = SP.x;
      POS[i * 2 + 1] = SP.y;
    }
    stackUnits(shown.units, POS, o.size * STACK_FACTOR, PILE, RANK);
    PILE_SIZE.length = n;
    PILE_OPEN.length = n;
    for (let i = 0; i < n; i++) {
      PILE_SIZE[i] = 0;
      PILE_OPEN[i] = false;
    }
    for (let i = 0; i < n; i++) {
      const p = PILE[i]!;
      PILE_SIZE[p]!++;
      const u = shown.units[i]!;
      if (u.key === o.hoverKey || isSelected(scene, u, sel)) PILE_OPEN[p] = true;
    }
  }
  // deux passes : les unités sélectionnées par-dessus les autres
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < shown.units.length; i++) {
      const u = shown.units[i]!;
      let selected = isSelected(scene, u, sel);
      if (!selected && sel && sel.size > 0) {
        // symbole d'une unité fondue : il s'allume si l'une de ses subordonnées est sélectionnée
        for (let k = shown.start[i]! + 1; k < shown.end[i]!; k++) {
          if (sel.has(all[k]!.key)) {
            selected = true;
            break;
          }
        }
      }
      if ((pass === 1) !== selected) continue;
      if (!t.contains(u.x, u.z, 40)) continue;
      const emph = o.emphasis;
      g.globalAlpha = emph && emph.size > 0 && !emphasised(scene, shown, i, emph) ? (o.emphasisAlpha ?? 0.6) : 1;
      t.worldToScreen(u.x, u.z, SP);
      // pile refermée : symboles décalés en escalier, lisibles comme une pile
      const piled = board !== null && PILE_SIZE[PILE[i]!]! > 1 && !PILE_OPEN[PILE[i]!];
      if (piled) {
        const k = Math.min(2, RANK[i]!);
        SP.x += k * STACK_STEP;
        SP.y -= k * STACK_STEP;
      }
      if (o.compact || o.dots) {
        if (u.squadId === 0 && u.symbol === 'vehicule') drawVehicleMark(g, SP.x, SP.y, t.headingToScreenAngle(u.heading), t.mpp * 1.6, false, false);
        else drawDot(g, u, SP.x, SP.y, u.hasPlayer);
        continue;
      }
      if (u.squadId === 0 && u.symbol === 'vehicule') {
        drawVehicleMark(g, SP.x, SP.y, t.headingToScreenAngle(u.heading), t.mpp, u.faction === 'rescue', selected || u.key === o.hoverKey);
        continue;
      }
      SYM.size = o.size;
      SYM.headingAngle = u.symbol === 'drone' ? NaN : t.headingToScreenAngle(u.heading);
      SYM.faction = u.faction;
      SYM.selected = selected;
      SYM.hover = u.key === o.hoverKey;
      SYM.dim = o.commandable !== null && !o.commandable(u.key);
      SYM.strength = u.total > 0 ? u.valid / u.total : 1;
      SYM.injured = u.injured > 0;
      SYM.code = u.code;
      // voiture de patrouille : son état (patrouille, en route, sur place) se lit de loin ; les autres unités, leur effectif
      if (u.patrol) SYM.detail = selected || t.mpp < 6 ? u.status : '';
      else SYM.detail = (selected || t.mpp < 0.75) && u.squadId !== 0 && u.total > 0 ? `${u.valid}/${u.total}${selected && u.status !== '' ? ' · ' + u.status : ''}` : '';
      SYM.compact = false;
      if (board) {
        // le texte part sur la planche : sous le symbole s'il y a la place, sinon à côté, sinon il n'est pas écrit
        const text = piled ? '' : [SYM.code, SYM.detail].filter((s) => s !== '').join(' · ');
        const color = SYM.strength < 0.6 ? UNIT_COLORS.hurt : UNIT_COLORS.text;
        SYM.code = '';
        SYM.detail = '';
        const r = o.size * 0.62;
        board.avoid(SP.x - o.size * 0.8, SP.y - o.size * 0.8, SP.x + o.size * 0.8, SP.y + o.size * 0.6);
        if (text !== '') board.text(text, SP.x, SP.y, color, 9.5, 700, selected ? LABEL_PRIORITY.selected : LABEL_PRIORITY.unit, 'below', r);
        if (piled && PILE[i] === i) {
          PILE_UNITS.length = 0;
          for (let k = i; k < shown.units.length; k++) if (PILE[k] === i) PILE_UNITS.push(shown.units[k]!);
          board.text(stackLabel(PILE_UNITS, (k) => scene.unitModel.get(k)?.parentKey ?? 0), SP.x + STACK_STEP, SP.y - STACK_STEP, UNIT_COLORS.text, 10, 700, LABEL_PRIORITY.unit, 'below', r + STACK_STEP);
        }
      }
      drawUnitSymbol(g, u.symbol, SP.x, SP.y, SYM);
    }
  }
  g.globalAlpha = 1;
}

// ───────────────────────────── ordres en cours ─────────────────────────────

type OrderShape = 'none' | 'line' | 'arrow' | 'circle' | 'target';

const ORDER_SHAPES: Readonly<Record<string, OrderShape>> = {
  libre: 'none', suivre: 'none', cesser: 'none', embarquer: 'none', debarquer: 'none', tortue: 'none',
  tenir: 'line', ligne: 'line',
  colonne: 'arrow', avancer: 'arrow', bond_offensif: 'arrow', charge: 'arrow', refoulement: 'arrow', repli: 'arrow',
  proteger: 'arrow', escorter: 'arrow', degager_barricade: 'arrow',
  disperser_gaz: 'target', interpeller: 'target',
  encercler: 'circle',
};

const ORDER_COLORS: Readonly<Record<string, string>> = {
  charge: '#ff6b4a', bond_offensif: '#ff9f43', refoulement: '#ff9f43', disperser_gaz: '#e6f1f6', interpeller: '#ffd60a',
  encercler: '#ff9f43', repli: '#9fd0ff',
};
const ORDER_DEFAULT_COLOR = '#58a6ff';

/**
 * Étiquette d'un ordre sur la carte, en clair (les mêmes mots que la fiche, la pastille d'unité et « Mes unités » :
 * colonne `tag` du catalogue des ordres, src/ui/command/orders.ts, que la couche des cartes n'importe pas). Un test
 * vérifie que les deux listes restent identiques.
 */
export const ORDER_TAGS: Readonly<Record<string, string>> = {
  tenir: 'TIENT', ligne: 'EN LIGNE', colonne: 'VA À PIED', couper_circulation: 'BARRE', filtrer: 'FILTRE', tortue: 'TORTUE',
  avancer: 'AVANCE', bond_offensif: 'BOND', charge: 'CHARGE', refoulement: 'REPOUSSE', suivre_pied: 'ME SUIT À PIED',
  avec_moi: 'ME SUIT EN VÉHICULE', faire_mouvement: 'VA EN VÉHICULE', repli: 'SE REPLIE', encercler: 'ENCERCLE',
  disperser_gaz: 'GAZ', interpeller: 'INTERPELLE', degager_barricade: 'DÉGAGE', degager_obstacle: 'POUSSE UN VÉHICULE',
  proteger: 'PROTÈGE', escorter: 'ESCORTE', suivre: 'SUIT', embarquer: 'MONTE', debarquer: 'DESCEND', cesser: 'ARRÊTE',
  libre: 'SANS ORDRE', retour_poste: 'RENTRE',
};

/** Les mêmes au pluriel, pour une étiquette partagée par plusieurs unités (« 1A 1B 1C · BARRENT · ~2 min »). */
export const ORDER_TAGS_PLURAL: Readonly<Record<string, string>> = {
  tenir: 'TIENNENT', ligne: 'EN LIGNE', colonne: 'VONT À PIED', couper_circulation: 'BARRENT', filtrer: 'FILTRENT',
  tortue: 'TORTUE', avancer: 'AVANCENT', bond_offensif: 'BOND', charge: 'CHARGENT', refoulement: 'REPOUSSENT',
  suivre_pied: 'ME SUIVENT À PIED', avec_moi: 'ME SUIVENT EN VÉHICULE', faire_mouvement: 'VONT EN VÉHICULE',
  repli: 'SE REPLIENT', encercler: 'ENCERCLENT', disperser_gaz: 'GAZ', interpeller: 'INTERPELLENT',
  degager_barricade: 'DÉGAGENT', degager_obstacle: 'POUSSENT UN VÉHICULE', proteger: 'PROTÈGENT', escorter: 'ESCORTENT',
  suivre: 'SUIVENT', embarquer: 'MONTENT', debarquer: 'DESCENDENT', cesser: 'ARRÊTENT', libre: 'SANS ORDRE',
  retour_poste: 'RENTRENT',
};

/** « Barrer la rue, passants admis » (SquadOrder.targetId = −2, BARRAGE_LET_PASSERSBY de orders.ts). */
const LET_PASSERSBY = -2;

/**
 * Étiquette d'un ordre en cours (« BARRE », « BARRE (PASSANTS) », « EN LIGNE »), au pluriel pour plusieurs unités.
 * Ordre inconnu : '' — jamais le type brut en majuscules (« COUPER_CIRCULATION »).
 */
export function orderTag(type: string, targetId = 0, plural = false): string {
  const base = (plural ? ORDER_TAGS_PLURAL[type] : ORDER_TAGS[type]) ?? '';
  if (base !== '' && type === 'couper_circulation' && targetId === LET_PASSERSBY) return `${base} (PASSANTS)`;
  return base;
}

/** Tolérance d'arrivée d'une unité sur le point de son ordre (m). */
export function arrivalRadius(width: number): number {
  return 6 + width * 0.25;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const TAG_FONT = `700 9.5px ${FONT}`;

function tag(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  g.font = TAG_FONT;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.strokeStyle = UNIT_COLORS.halo;
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

function arrowHead(g: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, size: number, color: string): void {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - ux * size - uy * size * 0.55, y - uy * size + ux * size * 0.55);
  g.lineTo(x - ux * size + uy * size * 0.55, y - uy * size - ux * size * 0.55);
  g.closePath();
  g.fill();
}

/**
 * Dessine une ligne de barrage : segment centré, perpendiculaire au cap, avec des dents du côté
 * où l'unité fait face. Sert aussi à l'aperçu pendant le tracé.
 */
export function drawBarrageLine(
  g: CanvasRenderingContext2D, t: MapTransform, x: number, z: number, heading: number, width: number, color: string,
  dashed: boolean, lineWidth = 3,
): void {
  const half = Math.max(1.5, width * 0.5);
  // droite de la formation = (−cos h, sin h)
  const rx = -Math.cos(heading), rz = Math.sin(heading);
  t.worldToScreen(x - rx * half, z - rz * half, SP);
  const ax = SP.x, ay = SP.y;
  t.worldToScreen(x + rx * half, z + rz * half, SP);
  const bx = SP.x, by = SP.y;
  t.worldToScreen(x + Math.sin(heading) * 4, z + Math.cos(heading) * 4, SQ);
  t.worldToScreen(x, z, SP);
  let fx = SQ.x - SP.x, fy = SQ.y - SP.y;
  const fl = Math.hypot(fx, fy) || 1;
  fx /= fl;
  fy /= fl;
  g.lineCap = 'round';
  g.lineWidth = lineWidth + 3;
  g.strokeStyle = 'rgba(8,14,26,.75)';
  g.setLineDash([]);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
  g.lineWidth = lineWidth;
  g.strokeStyle = color;
  if (dashed) g.setLineDash([7, 6]);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
  g.setLineDash([]);
  // dents vers l'avant
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.min(12, Math.floor(len / 16)));
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const k = n === 0 ? 0.5 : i / n;
    const px = ax + (bx - ax) * k, py = ay + (by - ay) * k;
    g.moveTo(px, py);
    g.lineTo(px + fx * 7, py + fy * 7);
  }
  g.stroke();
  // flèche de face au centre
  const cx = (ax + bx) * 0.5, cy = (ay + by) * 0.5;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + fx * 18, cy + fy * 18);
  g.stroke();
  arrowHead(g, cx + fx * 24, cy + fy * 24, fx, fy, 8, color);
}

/** Cercle d'encerclement avec l'issue laissée ouverte dans la direction du cap. */
export function drawNasse(
  g: CanvasRenderingContext2D, t: MapTransform, x: number, z: number, heading: number, diameter: number, color: string,
  dashed: boolean,
): void {
  t.worldToScreen(x, z, SP);
  const r = Math.max(8, (diameter * 0.5) / t.mpp);
  // angle écran (repère du canevas : 0 = +x, sens horaire) de la direction de l'issue
  const a = t.headingToScreenAngle(heading) - Math.PI / 2;
  const gap = Math.min(0.5, 14 / r + 0.22);
  g.lineCap = 'round';
  g.setLineDash([]);
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(8,14,26,.7)';
  g.beginPath();
  g.arc(SP.x, SP.y, r, a + gap, a - gap + Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = color;
  if (dashed) g.setLineDash([8, 6]);
  g.beginPath();
  g.arc(SP.x, SP.y, r, a + gap, a - gap + Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,159,67,.07)';
  g.beginPath();
  g.arc(SP.x, SP.y, r, 0, Math.PI * 2);
  g.fill();
  // l'issue : flèche verte vers l'extérieur
  const ex = SP.x + Math.cos(a) * r, ey = SP.y + Math.sin(a) * r;
  g.strokeStyle = '#34c759';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(ex - Math.cos(a) * 8, ey - Math.sin(a) * 8);
  g.lineTo(ex + Math.cos(a) * 16, ey + Math.sin(a) * 16);
  g.stroke();
  arrowHead(g, ex + Math.cos(a) * 23, ey + Math.sin(a) * 23, Math.cos(a), Math.sin(a), 8, '#34c759');
  tag(g, 'ISSUE', ex + Math.cos(a) * 40, ey + Math.sin(a) * 40, '#7be495');
}

export function drawOrderArrow(
  g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, color: string, dashed: boolean,
): void {
  const dx = bx - ax, dy = by - ay;
  const l = Math.hypot(dx, dy);
  if (l < 6) return;
  const ux = dx / l, uy = dy / l;
  const ex = bx - ux * 7, ey = by - uy * 7;
  g.lineCap = 'round';
  g.setLineDash([]);
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(8,14,26,.7)';
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(ex, ey);
  g.stroke();
  g.lineWidth = 2.2;
  g.strokeStyle = color;
  if (dashed) g.setLineDash([6, 6]);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(ex, ey);
  g.stroke();
  g.setLineDash([]);
  arrowHead(g, bx, by, ux, uy, 10, color);
}

/** Itinéraire d'un ordre : pointillés le long des rues (le trait droit de la flèche reste le cap du but). */
function drawRoute(g: CanvasRenderingContext2D, t: MapTransform, path: readonly number[], color: string): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = pass === 0 ? 4.5 : 2;
    g.strokeStyle = pass === 0 ? 'rgba(8,14,26,.55)' : color;
    g.setLineDash(pass === 0 ? [] : [2, 5]);
    g.beginPath();
    for (let i = 0; i < path.length; i += 2) {
      t.worldToScreen(path[i]!, path[i + 1]!, SQ);
      if (i === 0) g.moveTo(SQ.x, SQ.y);
      else g.lineTo(SQ.x, SQ.y);
    }
    g.stroke();
  }
  g.setLineDash([]);
}

function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 5) * 5} m`;
}

function etaLabel(seconds: number): string {
  if (seconds < 50) return `${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  return `${Math.round(seconds / 60)} min`;
}

export function drawTargetMark(g: CanvasRenderingContext2D, x: number, y: number, color: string, radius: number): void {
  g.lineWidth = 4.5;
  g.strokeStyle = 'rgba(8,14,26,.7)';
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.moveTo(x - radius - 5, y);
    g.lineTo(x - radius + 4, y);
    g.moveTo(x + radius - 4, y);
    g.lineTo(x + radius + 5, y);
    g.moveTo(x, y - radius - 5);
    g.lineTo(x, y - radius + 4);
    g.moveTo(x, y + radius - 4);
    g.lineTo(x, y + radius + 5);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = color;
  }
}

// ───────────────────────────── étiquettes des ordres ─────────────────────────────

/** Étiquette d'ordre d'une unité, avant regroupement et placement. */
export interface OrderLabelItem {
  /** Code court de l'unité (« 2A »), '' s'il n'y en a pas. */
  code: string;
  type: string;
  targetId: number;
  /** Ancrage à l'écran (px) : centre de l'étiquette sans décalage. */
  x: number;
  y: number;
  arrived: boolean;
  /** Reste à parcourir (m) et délai estimé (s), en route. */
  dist: number;
  eta: number;
  color: string;
}

/** Étiquette retenue : texte, centre et boîte (px), unités qu'elle nomme. */
export interface PlacedLabel {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  codes: string[];
}

/** Deux ancrages plus proches que cela (px), même ordre, même état : une seule étiquette pour toutes ces unités. */
export const LABEL_MERGE_PX = 36;
/** Hauteur d'une étiquette (px) et décalages essayés tour à tour pour éviter un chevauchement. */
export const LABEL_HEIGHT = 13;
export const LABEL_OFFSETS: readonly number[] = [0, -16, 16, -32];

function followText(arrived: boolean, dist: number, eta: number, withDist: boolean): string {
  if (arrived) return 'EN PLACE';
  return withDist ? `${formatMeters(dist)} · ~${etaLabel(eta)}` : `~${etaLabel(eta)}`;
}

/**
 * Regroupe les étiquettes des unités qui ont le même ordre au même endroit (« 1A 1B 1C · BARRENT · ~2 min »), puis
 * place chaque étiquette au premier décalage vertical libre (0, −16, +16, −32 px) ; une étiquette sans place n'est pas
 * dessinée — celles des unités arrivées d'abord. Logique pure : `measure` donne la largeur d'un texte en px.
 */
export function layoutOrderLabels(items: readonly OrderLabelItem[], measure: (text: string) => number): PlacedLabel[] {
  // regroupement (dans l'ordre reçu)
  const groups: { items: OrderLabelItem[]; x: number; y: number }[] = [];
  for (const it of items) {
    let g = groups.find((q) => {
      const a = q.items[0]!;
      return a.type === it.type && a.targetId === it.targetId && a.arrived === it.arrived && Math.hypot(q.x - it.x, q.y - it.y) <= LABEL_MERGE_PX;
    });
    if (!g) {
      g = { items: [], x: it.x, y: it.y };
      groups.push(g);
    }
    g.items.push(it);
    const n = g.items.length;
    g.x = g.items.reduce((sum, q) => sum + q.x, 0) / n;
    g.y = Math.min(g.y, it.y);
  }
  // les unités en route d'abord : à l'arrivée, l'étiquette est moins utile et cède la place
  groups.sort((a, b) => Number(a.items[0]!.arrived) - Number(b.items[0]!.arrived));
  const out: PlacedLabel[] = [];
  for (const g of groups) {
    const first = g.items[0]!;
    const plural = g.items.length > 1;
    const codes = g.items.map((q) => q.code).filter((c) => c !== '');
    const eta = Math.max(...g.items.map((q) => q.eta));
    const dist = Math.max(...g.items.map((q) => q.dist));
    const parts = [codes.join(' '), orderTag(first.type, first.targetId, plural), followText(first.arrived, dist, eta, !plural)].filter((p) => p !== '');
    const text = parts.join(' · ');
    const w = measure(text) + 6;
    const h = LABEL_HEIGHT;
    for (const off of LABEL_OFFSETS) {
      const y = g.y + off;
      const free = out.every((b) => Math.abs(b.x - g.x) * 2 >= b.w + w || Math.abs(b.y - y) * 2 >= b.h + h);
      if (free) {
        out.push({ text, x: g.x, y, w, h, color: first.color, codes });
        break;
      }
    }
  }
  return out;
}

const LABELS: OrderLabelItem[] = [];

/** Tracés des ordres en cours : flèche jusqu'à l'arrivée, puis ligne ou zone tenue en trait fin. */
export function drawOrders(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: UnitLayerOptions): void {
  const units = scene.units;
  // l'étiquette d'un ordre n'est écrite que pour une unité qui a son propre symbole à cette échelle
  const shown = visibleUnits(scene, t.mpp, o.compact, SHOWN).units;
  LABELS.length = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const ord = u.order;
    if (!ord || u.total === 0) continue;
    if (o.compact && !u.hasPlayer) continue;
    const shape = ORDER_SHAPES[ord.type as OrderType] ?? 'arrow';
    if (shape === 'none') continue;
    // un ordre « tenir » sans largeur ne se dessine pas (position actuelle)
    if (ord.type === 'tenir' && ord.width <= 0) continue;
    const arrived = u.orderDist <= arrivalRadius(ord.width);
    const color = ORDER_COLORS[ord.type] ?? ORDER_DEFAULT_COLOR;
    if (!t.contains(ord.x, ord.z, 200) && !t.contains(u.x, u.z, 60)) continue;
    const selected = isSelected(scene, u, o.selection);
    g.globalAlpha = arrived && !selected ? 0.55 : 1;
    // itinéraire réel (par les rues) quand il s'écarte de la ligne droite : le joueur voit le détour
    const route = !arrived && !o.compact ? scene.routes.get(u.squadId) : undefined;
    if (route && route.path.length >= 6 && route.length > u.orderDist * 1.15) drawRoute(g, t, route.path, color);
    t.worldToScreen(u.x, u.z, SQ);
    const ux = SQ.x, uy = SQ.y;
    t.worldToScreen(ord.x, ord.z, SQ);
    const tx = SQ.x, ty = SQ.y;
    if (shape === 'line') {
      if (!arrived) drawOrderArrow(g, ux, uy, tx, ty, color, true);
      drawBarrageLine(g, t, ord.x, ord.z, ord.heading, ord.width, color, !arrived, arrived ? 2.5 : 3);
    } else if (shape === 'circle') {
      if (!arrived && u.orderDist > ord.width * 0.5 + 8) drawOrderArrow(g, ux, uy, tx, ty, color, true);
      drawNasse(g, t, ord.x, ord.z, ord.heading, ord.width > 0 ? ord.width : 30, color, !arrived);
    } else if (shape === 'target') {
      if (!arrived) drawOrderArrow(g, ux, uy, tx, ty, color, true);
      drawTargetMark(g, tx, ty, color, ord.type === 'disperser_gaz' ? 11 : 8);
    } else if (!arrived) {
      drawOrderArrow(g, ux, uy, tx, ty, color, ord.type === 'repli');
    } else {
      g.globalAlpha = 1;
      continue;
    }
    // étiquette : unités qui ont leur propre symbole, et toute unité en route (suivi de l'ordre, même regroupée)
    if (!o.compact && (!arrived || selected) && (shown.indexOf(u) >= 0 || !arrived)) {
      // suivi : distance restante et temps estimé en route ; « EN PLACE » à l'arrivée
      const len = route ? route.length : u.orderDist;
      const off = shape === 'circle' ? -(Math.max(8, (ord.width * 0.5) / t.mpp) + 12) : -14;
      LABELS.push({
        code: u.code, type: String(ord.type), targetId: ord.targetId, x: tx, y: ty + off, arrived, dist: len,
        eta: len / (u.embarked ? 8 : 1.8), color,
      });
    }
    g.globalAlpha = 1;
  }
  if (LABELS.length === 0) return;
  g.font = TAG_FONT;
  const placed = layoutOrderLabels(LABELS, (text) => g.measureText(text).width);
  const board = o.labels;
  for (const p of placed) {
    // planche des étiquettes : posée par priorité avec la bulle, l'aperçu et les unités (aucun chevauchement)
    if (board) board.text(p.text, p.x, p.y, p.color, 9.5, 700, LABEL_PRIORITY.order, 'center', 0);
    else tag(g, p.text, p.x, p.y, p.color);
  }
}

// ───────────────────────────── carte de l'exécutant ─────────────────────────────

/** Carte en lecture seule (CRS, gardien…) : son groupe, et où l'ordre reçu l'envoie. */
export interface ExecutantFrame {
  /** Unité du joueur (clé = identifiant d'unité). */
  squadId: number;
  /** Destination de l'ordre reçu (« ICI — Avenue de la République ») ; null sans ordre. */
  dest: { x: number; z: number; label: string } | null;
}

const EXEC_COLOR = '#ffd60a';

/**
 * Trajet du groupe du joueur en jaune épais (par les rues quand il est calculé, sinon en ligne droite) et destination
 * cerclée « ICI — <lieu> ». Les autres unités sont estompées par `emphasis` (posé par l'écran).
 */
export function drawExecutantFrame(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, f: ExecutantFrame, time: number): void {
  const dest = f.dest;
  if (!dest) return;
  const u = scene.unitModel.get(f.squadId);
  const route = scene.routes.get(f.squadId);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.setLineDash([]);
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = pass === 0 ? 9 : 5;
    g.strokeStyle = pass === 0 ? 'rgba(8,14,26,.75)' : EXEC_COLOR;
    g.beginPath();
    if (route && route.path.length >= 4) {
      for (let i = 0; i + 1 < route.path.length; i += 2) {
        t.worldToScreen(route.path[i]!, route.path[i + 1]!, SQ);
        if (i === 0) g.moveTo(SQ.x, SQ.y);
        else g.lineTo(SQ.x, SQ.y);
      }
    } else {
      const fx = u ? u.x : scene.hasPlayer ? scene.px : dest.x;
      const fz = u ? u.z : scene.hasPlayer ? scene.pz : dest.z;
      t.worldToScreen(fx, fz, SQ);
      g.moveTo(SQ.x, SQ.y);
    }
    t.worldToScreen(dest.x, dest.z, SQ);
    g.lineTo(SQ.x, SQ.y);
    g.stroke();
  }
  t.worldToScreen(dest.x, dest.z, SP);
  // anneau qui pulse sur la destination
  const k = (time * 0.9) % 1;
  g.strokeStyle = EXEC_COLOR;
  g.globalAlpha = 1 - k;
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(SP.x, SP.y, 12 + k * 16, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(SP.x, SP.y, 11, 0, Math.PI * 2);
  g.stroke();
  g.font = `800 12px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 3.5;
  g.strokeStyle = UNIT_COLORS.halo;
  const text = dest.label !== '' ? `ICI — ${dest.label}` : 'ICI';
  g.strokeText(text, SP.x, SP.y - 26);
  g.fillStyle = '#ffe680';
  g.fillText(text, SP.x, SP.y - 26);
}
