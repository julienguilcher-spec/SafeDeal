/* =====================================================================================
 * Lieux nommés : recherche par nom (insensible aux accents et à la casse, correspondance
 * partielle) et nom de secteur pour la radio.
 * ===================================================================================== */

import type { LandmarkInfo, PlaceInfo, PlaceKind } from '@/core/contracts';
import type { Landmark, Place } from '../mapdata';
import type { RoadNetwork } from './roads';

/** Mots vides ignorés dans une recherche (« place de la concorde » = « place concorde »). */
const STOP_WORDS = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'a', 'au', 'aux', 'et', 'en', 'sur']);

/**
 * Mots génériques : en tête de nom, ils s'écrivent en minuscule à la radio
 * (« Place de la Concorde » → « place de la Concorde »).
 */
const GENERIC_WORDS = new Set([
  'place', 'avenue', 'rue', 'boulevard', 'quai', 'pont', 'passerelle', 'jardin', 'jardins', 'square', 'parc', 'cours',
  'passage', 'allee', 'impasse', 'esplanade', 'port', 'voie', 'carrefour', 'parvis', 'galerie', 'cite', 'villa',
  'chemin', 'route', 'promenade', 'quartier', 'ile', 'berge', 'berges', 'terrasse', 'cour', 'porte', 'souterrain',
  'tunnel', 'mairie', 'gare', 'station', 'eglise', 'palais', 'hotel', 'musee', 'theatre', 'tour', 'colonne', 'fontaine',
  'statue', 'marche', 'hopital', 'caserne', 'ministere', 'prefecture', 'commissariat', 'bassin', 'kiosque', 'faubourg',
]);

const GENERIC_COMPOUNDS = new Set(['rond point', 'chemin de fer']);

/**
 * Noms d'usage (normalisés) → nom officiel porté par la carte. Consultés quand le nom demandé
 * n'existe pas tel quel ; sans effet si le nom officiel est absent de la carte.
 */
const USUAL_NAMES: Readonly<Record<string, string>> = {
  'etoile': 'place charles de gaulle',
  'l etoile': 'place charles de gaulle',
  'place de l etoile': 'place charles de gaulle',
  'place charles de gaulle etoile': 'place charles de gaulle',
  'champs': 'avenue des champs elysees',
  'les champs': 'avenue des champs elysees',
  'les champs elysees': 'avenue des champs elysees',
  'beaubourg': 'centre pompidou',
  'assemblee': 'assemblee nationale',
};

/** Préférence par nature de lieu, à qualité de correspondance égale. */
const KIND_BONUS: Readonly<Record<PlaceKind, number>> = {
  square: 12, monument: 10, institution: 8, garden: 8, bridge: 6, street: 5, quay: 4, district: 3, station: -25,
};

/** Rayon (m) dans lequel une voie nommée donne son nom au secteur. */
const SECTOR_ROAD_DISTANCE = 45;
/** Rayon (m) dans lequel le lieu le plus proche donne son nom au secteur, faute de voie. */
const SECTOR_PLACE_DISTANCE = 400;

/** Minuscules, sans accents ni ponctuation, espaces simples : « Champs-Élysées » → « champs elysees ». */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function significantWords(normalized: string): string[] {
  const out: string[] = [];
  for (const w of normalized.split(' ')) if (w !== '' && !STOP_WORDS.has(w)) out.push(w);
  return out;
}

/** Nom tel qu'on le dit à la radio : le mot générique de tête passe en minuscule. */
export function radioName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return trimmed;
  const head = trimmed.split(/\s+/)[0];
  const norm = normalizeName(head);
  // Mot composé générique (« Rond-Point ») : tout le mot passe en minuscules.
  if (GENERIC_COMPOUNDS.has(norm)) return head.toLowerCase() + trimmed.slice(head.length);
  if (!GENERIC_WORDS.has(norm)) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

export class PlaceIndex {
  readonly places: PlaceInfo[] = [];
  readonly landmarks: LandmarkInfo[] = [];
  private readonly norm: string[] = [];
  private readonly words: string[][] = [];
  private readonly importance: number[] = [];
  private readonly cache = new Map<string, PlaceInfo | null>();
  // Formulations radio, calculées une fois : sectorName n'alloue aucune chaîne.
  private readonly radio: string[] = [];
  private readonly radioSector: string[] = [];
  private readonly radioRoad = new Map<string, string>();

  constructor(places: readonly Place[], landmarks: readonly Landmark[]) {
    for (let i = 0; i < places.length; i++) {
      const p = places[i];
      this.places.push({ id: i, name: p.name, kind: p.kind, x: p.x, z: p.z, radius: p.radius });
      const n = normalizeName(p.name);
      this.norm.push(n);
      this.words.push(n.split(' '));
      this.importance.push(p.importance);
      const said = radioName(p.name);
      this.radio.push(said);
      this.radioSector.push(`secteur ${said}`);
    }
    for (const l of landmarks) {
      this.landmarks.push({ key: l.key, name: l.name, x: l.x, z: l.z, y: l.y, heading: l.heading, height: l.height, footprint: l.footprint });
    }
  }

  /**
   * Lieu dont le nom correspond le mieux. Ordre de qualité : nom identique, mots entiers tous
   * présents, sous-chaîne, débuts de mots. À qualité égale : importance, puis nature (une place
   * avant une station de métro), puis nom le plus court. null si rien ne correspond.
   */
  byName(name: string): PlaceInfo | null {
    const query = normalizeName(name);
    if (query === '') return null;
    const cached = this.cache.get(query);
    if (cached !== undefined) return cached;
    let best: PlaceInfo | null = null;
    let bestScore = -Infinity;
    // Nom d'usage : s'il désigne un lieu présent sur la carte, c'est lui.
    const usual = USUAL_NAMES[query];
    if (usual !== undefined && this.norm.indexOf(query) < 0) {
      for (let i = 0; i < this.places.length; i++) {
        if (this.norm[i] !== usual) continue;
        const score = this.importance[i] * 15 + (KIND_BONUS[this.places[i].kind] ?? 0);
        if (score > bestScore) {
          bestScore = score;
          best = this.places[i];
        }
      }
      if (best !== null) {
        this.cache.set(query, best);
        return best;
      }
    }
    const wanted = significantWords(query);
    for (let i = 0; i < this.places.length; i++) {
      const norm = this.norm[i];
      let quality = 0;
      if (norm === query) {
        quality = 100;
      } else if (wanted.length > 0 && this.hasAllWords(i, wanted, false)) {
        quality = 80;
      } else if (norm.indexOf(query) >= 0) {
        quality = 60;
      } else if (wanted.length > 0 && this.hasAllWords(i, wanted, true)) {
        quality = 50;
      } else {
        continue;
      }
      const p = this.places[i];
      const score = quality + this.importance[i] * 15 + (KIND_BONUS[p.kind] ?? 0) - norm.length * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(query, best);
    return best;
  }

  private hasAllWords(i: number, wanted: readonly string[], prefix: boolean): boolean {
    const words = this.words[i];
    for (const w of wanted) {
      let ok = false;
      for (const have of words) {
        if (prefix ? have.startsWith(w) : have === w) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }
    return true;
  }

  /**
   * Nom du secteur pour la radio : le pont sur lequel on se trouve ; sinon la place ou le jardin
   * où l'on se trouve ; sinon la voie nommée la plus proche ; sinon le lieu le plus proche ; sinon
   * le quartier.
   * @param onGreen le sol est-il un espace vert en ce point (sert à départager un jardin et la rue qui le longe)
   */
  sectorName(x: number, z: number, roads: RoadNetwork | null, onGreen: boolean): string {
    let roadName = '';
    let onRoad = false;
    if (roads !== null && roads.nearestNamedStreet(x, z, SECTOR_ROAD_DISTANCE)) {
      const ed = roads.edges[roads.snapEdge];
      const reach = ed.width / 2 + ed.sidewalk;
      // Sur un pont, le nom de l'ouvrage prime (il est porté par l'arête).
      if (ed.bridge && roads.snapDist <= reach) return this.roadRadioName(ed.name);
      roadName = ed.name;
      onRoad = roads.snapDist <= reach + 1.5;
    }
    // Emprise d'une place, d'un pont ou d'un jardin : la plus petite qui contient le point. Les
    // emprises sont des cercles approximatifs : un jardin ne « prend » pas la rue qui le longe.
    let best = -1, bestRadius = Infinity;
    for (let i = 0; i < this.places.length; i++) {
      const p = this.places[i];
      if (p.kind !== 'square' && p.kind !== 'bridge' && !(p.kind === 'garden' && (onGreen || !onRoad))) continue;
      if (!(p.radius > 0) || p.radius >= bestRadius) continue;
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz <= p.radius * p.radius) {
        best = i;
        bestRadius = p.radius;
      }
    }
    if (best >= 0) return this.radio[best];
    if (roadName !== '') return this.roadRadioName(roadName);
    // Lieu le plus proche (hors quartiers et voies, dont le point de référence est arbitraire).
    let nearest = -1, nearestD2 = SECTOR_PLACE_DISTANCE * SECTOR_PLACE_DISTANCE;
    let district = -1, districtRadius = Infinity;
    for (let i = 0; i < this.places.length; i++) {
      const p = this.places[i];
      const dx = p.x - x, dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (p.kind === 'district') {
        if (p.radius > 0 && p.radius < districtRadius && d2 <= p.radius * p.radius) {
          district = i;
          districtRadius = p.radius;
        }
        continue;
      }
      if (p.kind === 'street' || p.kind === 'quay') continue;
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearest = i;
      }
    }
    if (nearest >= 0) return this.radioSector[nearest];
    if (district >= 0) return this.radio[district];
    return 'secteur inconnu';
  }

  /** Formulation radio d'un nom de voie (mise en cache : il y a peu de noms distincts). */
  private roadRadioName(name: string): string {
    let said = this.radioRoad.get(name);
    if (said === undefined) {
      said = radioName(name);
      this.radioRoad.set(name, said);
    }
    return said;
  }
}
