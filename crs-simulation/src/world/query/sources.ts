/* =====================================================================================
 * Sources de données de carte : fetch (navigateur) et mémoire (quartier d'essai, tests).
 * La source « fichiers » (Node) est dans source-fs.ts, chargée dynamiquement.
 * ===================================================================================== */

import { MAP_FILES } from '../mapdata';
import type {
  Manifest, ManifestTile, RawLandmarks, RawMapData, RawPlaces, RawRoadGraph, RawTerrain, RawTile,
} from '../mapdata';
import { generateTestDistrict } from '../testDistrict';
import type { MapSource } from './api';

/** URL de base par défaut des données de Paris, relative à la page du jeu (hébergement statique). */
export const DEFAULT_BASE_URL = './data/paris/';

/**
 * Source « fetch » : lit les fichiers JSON à côté de la page (chemins relatifs, jamais de CDN).
 * `baseUrl` se termine par « / ». Un fichier absent ou qui n'est pas du JSON rejette la promesse.
 */
export class FetchMapSource implements MapSource {
  readonly label: string;
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.label = `fetch ${this.baseUrl}`;
  }

  private async get<T>(path: string): Promise<T> {
    const url = this.baseUrl + path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[world] ${url} : HTTP ${res.status}`);
    // Un hébergement « SPA » peut répondre 200 avec la page d'accueil : le JSON invalide est une absence.
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`[world] ${url} : le contenu n'est pas du JSON (fichier absent ?)`);
    }
  }

  manifest(): Promise<unknown> {
    return this.get<unknown>(MAP_FILES.manifest);
  }

  tile(entry: ManifestTile): Promise<RawTile> {
    return this.get<RawTile>(entry.file);
  }

  roadGraph(manifest: Manifest): Promise<RawRoadGraph> {
    return this.get<RawRoadGraph>(manifest.files.roadGraph);
  }

  places(manifest: Manifest): Promise<RawPlaces> {
    return this.get<RawPlaces>(manifest.files.places);
  }

  landmarks(manifest: Manifest): Promise<RawLandmarks> {
    return this.get<RawLandmarks>(manifest.files.landmarks);
  }

  terrain(manifest: Manifest): Promise<RawTerrain> {
    return this.get<RawTerrain>(manifest.files.terrain);
  }
}

/** Source « mémoire » : sert une carte entière déjà en mémoire sous sa forme disque (RawMapData). */
export class MemoryMapSource implements MapSource {
  readonly label: string;
  private readonly raw: RawMapData;
  private readonly byFile = new Map<string, RawTile>();

  constructor(raw: RawMapData, label = 'mémoire') {
    this.raw = raw;
    this.label = label;
    for (let i = 0; i < raw.tiles.length; i++) {
      const t = raw.tiles[i];
      const listed = raw.manifest.tiles[i];
      if (listed !== undefined && listed.tx === t.tx && listed.tz === t.tz) this.byFile.set(listed.file, t);
    }
  }

  manifest(): Promise<unknown> {
    return Promise.resolve(this.raw.manifest);
  }

  tile(entry: ManifestTile): Promise<RawTile> {
    let t = this.byFile.get(entry.file);
    if (t === undefined) {
      for (const cand of this.raw.tiles) {
        if (cand.tx === entry.tx && cand.tz === entry.tz) {
          t = cand;
          break;
        }
      }
    }
    if (t === undefined) return Promise.reject(new Error(`[world] tuile ${entry.tx}_${entry.tz} absente de la carte en mémoire`));
    return Promise.resolve(t);
  }

  roadGraph(): Promise<RawRoadGraph> {
    return Promise.resolve(this.raw.roadGraph);
  }

  places(): Promise<RawPlaces> {
    return Promise.resolve(this.raw.places);
  }

  landmarks(): Promise<RawLandmarks> {
    return Promise.resolve(this.raw.landmarks);
  }

  terrain(): Promise<RawTerrain> {
    return Promise.resolve(this.raw.terrain);
  }
}

// Le quartier d'essai est déterministe et jamais modifié : une seule génération par graine (≈ 30 ms).
const districtCache = new Map<number, RawMapData>();

/** Carte brute du quartier d'essai (mise en cache par graine ; ne pas la modifier). */
export function testDistrictRaw(seed = 1): RawMapData {
  let raw = districtCache.get(seed);
  if (raw === undefined) {
    raw = generateTestDistrict({ seed });
    districtCache.set(seed, raw);
  }
  return raw;
}

/** Source mémoire du quartier d'essai. */
export function createTestDistrictSource(seed = 1): MemoryMapSource {
  return new MemoryMapSource(testDistrictRaw(seed), "quartier d'essai");
}
