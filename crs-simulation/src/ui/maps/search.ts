/* =====================================================================================
 * Recherche de lieu (logique pure) : insensible à la casse, aux accents et à la ponctuation ;
 * classe d'abord les noms qui commencent par la requête, puis ceux dont un mot commence par elle.
 * ===================================================================================== */

import type { PlaceInfo, PlaceKind } from '@/core/contracts';

/** Minuscules sans accents ni ponctuation, espaces simples. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Libellé français de la nature d'un lieu. */
export const PLACE_KIND_LABELS: Readonly<Record<PlaceKind, string>> = {
  square: 'Place', street: 'Voie', bridge: 'Pont', quay: 'Quai', garden: 'Jardin', district: 'Quartier',
  monument: 'Monument', station: 'Station', institution: 'Institution',
};

const KIND_BONUS: Readonly<Record<PlaceKind, number>> = {
  square: 30, monument: 26, station: 20, bridge: 18, garden: 16, street: 14, quay: 12, institution: 8, district: 4,
};

/** Petits mots ignorés au début d'un nom pour la comparaison (« place de la … »). */
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et']);

export interface SearchHit {
  place: PlaceInfo;
  score: number;
}

const INDEX = new WeakMap<readonly PlaceInfo[], string[]>();

function indexOf(places: readonly PlaceInfo[]): string[] {
  let idx = INDEX.get(places);
  if (!idx || idx.length !== places.length) {
    idx = places.map((p) => normalizeText(p.name));
    INDEX.set(places, idx);
  }
  return idx;
}

/** Note d'un nom normalisé pour une requête normalisée (0 = ne correspond pas). */
export function matchScore(name: string, query: string): number {
  if (query === '' || name === '') return 0;
  if (name === query) return 1000;
  if (name.startsWith(query)) return 700 - Math.min(200, name.length - query.length);
  const tokens = query.split(' ');
  const words = name.split(' ');
  let score = 0;
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (STOP.has(tok) && tokens.length > 1) continue;
    let best = 0;
    for (let w = 0; w < words.length; w++) {
      const word = words[w]!;
      if (word === tok) best = Math.max(best, 120 + (w >= cursor ? 10 : 0));
      else if (word.startsWith(tok)) best = Math.max(best, 80 + (w >= cursor ? 10 : 0));
      else if (tok.length >= 3 && word.includes(tok)) best = Math.max(best, 30);
      if (best >= 120) cursor = w;
    }
    if (best === 0) return 0;
    score += best;
  }
  if (score === 0) return 0;
  return score - Math.min(60, words.length * 4);
}

/**
 * Lieux correspondant à la requête, du plus pertinent au moins pertinent. À note égale, la nature
 * du lieu (place, monument, station…) puis la proximité de `near` départagent.
 */
export function searchPlaces(
  places: readonly PlaceInfo[], query: string, limit = 8, near?: { x: number; z: number },
): SearchHit[] {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const idx = indexOf(places);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < places.length; i++) {
    const base = matchScore(idx[i]!, q);
    if (base <= 0) continue;
    const p = places[i]!;
    let score = base + (KIND_BONUS[p.kind] ?? 0);
    if (near) score -= Math.min(20, Math.hypot(p.x - near.x, p.z - near.z) / 300);
    hits.push({ place: p, score });
  }
  hits.sort((a, b) => b.score - a.score);
  const out: SearchHit[] = [];
  for (let i = 0; i < hits.length && out.length < limit; i++) {
    const key = idxKey(hits[i]!.place);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hits[i]!);
  }
  return out;
}

function idxKey(p: PlaceInfo): string {
  return p.kind + '|' + normalizeText(p.name);
}
