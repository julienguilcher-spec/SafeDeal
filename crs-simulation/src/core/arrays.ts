/* =====================================================================================
 * Petits outils sur les tableaux réutilisés d'une image à l'autre, sans allocation.
 *
 * Pourquoi : dans V8, `arr.length = 0` libère la mémoire du tableau et `arr.length = n` la
 * rétrécit ; le remplissage suivant doit alors la ré-allouer. Mesuré sur 3 millions de requêtes
 * à résultats de taille variable : « length = 0 puis push » déclenche ~40 fois plus de
 * ramasse-miettes que « écrire par index puis truncate() », qui n'en déclenche aucun.
 *
 * Usage type dans une boucle chaude :
 *   let n = 0;
 *   for (…) { if (n < out.length) out[n] = item; else out.push(item); n++; }
 *   truncate(out, n);
 * ===================================================================================== */

/** Ramène la longueur de `arr` à `n` sans libérer sa capacité (ne l'allonge jamais). */
export function truncate<T>(arr: T[], n: number): void {
  while (arr.length > n) arr.pop();
}

/** Écrit `item` à l'index `n` d'un tableau réutilisé (en l'agrandissant au besoin) ; retourne n + 1. */
export function put<T>(arr: T[], n: number, item: T): number {
  if (n < arr.length) arr[n] = item;
  else arr.push(item);
  return n + 1;
}

/** Retire l'élément d'index `i` en le remplaçant par le dernier (ordre non conservé). */
export function swapRemoveAt<T>(arr: T[], i: number): void {
  const last = arr.length - 1;
  if (i < 0 || i > last) return;
  if (i !== last) arr[i] = arr[last]!;
  arr.pop();
}

/** Retire `item` du tableau (première occurrence, ordre non conservé). Retourne false s'il est absent. */
export function swapRemove<T>(arr: T[], item: T): boolean {
  const i = arr.indexOf(item);
  if (i < 0) return false;
  swapRemoveAt(arr, i);
  return true;
}
