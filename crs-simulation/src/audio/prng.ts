/* =====================================================================================
 * Aléatoire local du module audio.
 * La présentation n'a pas le droit de consommer ctx.rng (elle désynchroniserait la simulation) :
 * le moteur sonore possède donc son propre générateur, déterministe et sans allocation.
 * ===================================================================================== */

/** Générateur « mulberry32 » : rapide, 32 bits d'état, suffisant pour du bruit et des variations. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hachage FNV-1a d'une chaîne (graine stable pour un texte, un indicatif radio…). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mélange deux entiers en une graine (identifiant d'entité + compteur, par exemple). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x7f4a7c15 + (h << 6) + (h >>> 2)), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}
