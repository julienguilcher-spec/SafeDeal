/* =====================================================================================
 * Carte tactique au clavier seul (Mac portable sans souris) — logique pure, sans DOM.
 *
 *   flèches        curseur de la carte (Maj : plus vite) ; Entrée : toucher au curseur (sélectionner une unité,
 *                  désigner le point d'un ordre ; Entrée maintenue + flèches : tracer une ligne) ;
 *   1 … 9          sélectionne la section (ou le groupe) n de mon dispositif ; Maj : l'ajoute à la sélection ;
 *   U / Maj + U    unité suivante / précédente sous mes ordres (sélection seule, vue centrée) ;
 *   E              ordre rapide (roue) au curseur pour la sélection ;
 *   L              liste des ordres (palette de l'onglet « Ordres ») : flèches puis Entrée ; Échap revient à la carte.
 * ===================================================================================== */

/** Ce que la logique lit d'une unité de la carte (sous-ensemble de MapUnit). */
export interface KeyUnit {
  key: number;
  squadId: number;
  parentKey: number;
}

/** Légende affichée sur la carte tactique au clavier. */
export const TACTICAL_KEYS_LEGEND =
  'Clavier : flèches = curseur · Entrée = sélectionner / désigner · 1–9 = section · U = unité suivante · E = ordre rapide · L = liste des ordres · Échap = retour';

/** Unités que le joueur peut commander, dans l'ordre de l'arborescence. */
export function commandableUnits<U extends KeyUnit>(units: readonly U[], canCommand: (squadId: number) => boolean): U[] {
  const out: U[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.squadId !== 0 && canCommand(u.squadId)) out.push(u);
  }
  return out;
}

/**
 * Sections du clavier (touches 1 à 9) : les unités commandables les plus hautes de l'arborescence ; s'il n'y en a
 * qu'une (ma compagnie, ma section), ce sont ses subordonnées directes commandables — un commandant choisit ainsi
 * ses sections, un chef de section ses groupes.
 */
export function keyboardSections<U extends KeyUnit>(units: readonly U[], canCommand: (squadId: number) => boolean): U[] {
  const cmd = commandableUnits(units, canCommand);
  const byKey = new Map<number, U>();
  for (let i = 0; i < cmd.length; i++) byKey.set(cmd[i]!.key, cmd[i]!);
  let level = cmd.filter((u) => !hasAncestorIn(u, byKey, units));
  for (let guard = 0; level.length === 1 && guard < 4; guard++) {
    const parent = level[0]!.key;
    const children = cmd.filter((u) => u.parentKey === parent);
    if (children.length === 0) break;
    level = children;
  }
  return level;
}

function hasAncestorIn<U extends KeyUnit>(u: U, set: ReadonlyMap<number, U>, all: readonly U[]): boolean {
  let parentKey = u.parentKey;
  for (let guard = 0; parentKey !== 0 && guard < 8; guard++) {
    if (set.has(parentKey)) return true;
    const p = all.find((x) => x.key === parentKey);
    parentKey = p ? p.parentKey : 0;
  }
  return false;
}

/** Section choisie par une touche (Digit1…Digit9, pavé numérique compris) : son index, ou -1. */
export function sectionKeyIndex(code: string): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) - 1 : -1;
}

/**
 * Unité suivante (`step` = 1) ou précédente (−1) sous mes ordres, à partir de `current` (0 : aucune) ; on fait le
 * tour. Retourne 0 s'il n'y a aucune unité commandable.
 */
export function cycleUnitKey<U extends KeyUnit>(units: readonly U[], canCommand: (squadId: number) => boolean, current: number, step: 1 | -1): number {
  const cmd = commandableUnits(units, canCommand);
  if (cmd.length === 0) return 0;
  const at = cmd.findIndex((u) => u.key === current);
  if (at < 0) return step > 0 ? cmd[0]!.key : cmd[cmd.length - 1]!.key;
  return cmd[(at + step + cmd.length) % cmd.length]!.key;
}
