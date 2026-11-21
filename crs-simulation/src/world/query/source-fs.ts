/* =====================================================================================
 * Source « fichiers » : lit la carte sur disque, sous Node (tests sur les vraies données).
 * Ce fichier est le SEUL à toucher node:fs ; il n'est importé que dynamiquement
 * (`await import('./source-fs')`), et node:fs lui-même n'est chargé qu'au premier appel :
 * rien de tout cela n'entre dans le chemin d'exécution du navigateur.
 * ===================================================================================== */

import { MAP_FILES } from '../mapdata';
import type { Manifest, ManifestTile, RawLandmarks, RawPlaces, RawRoadGraph, RawTerrain, RawTile } from '../mapdata';
import type { MapSource } from './api';

interface FsPromises {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  access(path: string): Promise<void>;
}

let fsPromise: Promise<FsPromises> | null = null;

function loadFs(): Promise<FsPromises> {
  if (fsPromise === null) {
    // Spécificateur variable : ni Vite ni le vérificateur de types ne cherchent à résoudre le module.
    const spec = 'node:fs/promises';
    fsPromise = import(/* @vite-ignore */ spec) as Promise<FsPromises>;
  }
  return fsPromise;
}

interface NodeProcess {
  cwd?: () => string;
  versions?: { node?: string };
  getBuiltinModule?: (id: string) => unknown;
}

interface FsSync {
  readFileSync(path: string, encoding: 'utf8'): string;
}

let fsSync: FsSync | null | undefined;

/** node:fs synchrone, sans import statique (rien n'entre dans le chemin du navigateur) ; null s'il est inaccessible. */
function syncFs(): FsSync | null {
  if (fsSync !== undefined) return fsSync;
  const proc = (globalThis as { process?: NodeProcess }).process;
  const mod = proc !== undefined && typeof proc.getBuiltinModule === 'function' ? (proc.getBuiltinModule('node:fs') as FsSync | undefined) : undefined;
  fsSync = mod !== undefined && typeof mod.readFileSync === 'function' ? mod : null;
  return fsSync;
}

/** Dossier par défaut des données de Paris sous Node : <dossier courant>/public/data/paris. */
export function defaultParisDir(): string {
  const proc = (globalThis as { process?: NodeProcess }).process;
  const cwd = proc !== undefined && typeof proc.cwd === 'function' ? proc.cwd() : '.';
  return `${cwd.replace(/\\/g, '/').replace(/\/$/, '')}/public/data/paris`;
}

export class FsMapSource implements MapSource {
  readonly label: string;
  private readonly dir: string;

  /** Lecture synchrone d'une tuile (voir MapSource.tileSync) ; absente si node:fs synchrone est inaccessible. */
  readonly tileSync?: (entry: ManifestTile) => RawTile;

  constructor(dir: string = defaultParisDir()) {
    this.dir = dir.replace(/\\/g, '/').replace(/\/$/, '');
    this.label = `fichiers ${this.dir}`;
    const fs = syncFs();
    if (fs !== null) this.tileSync = (entry: ManifestTile): RawTile => JSON.parse(fs.readFileSync(`${this.dir}/${entry.file}`, 'utf8')) as RawTile;
  }

  private async read<T>(path: string): Promise<T> {
    const fs = await loadFs();
    return JSON.parse(await fs.readFile(`${this.dir}/${path}`, 'utf8')) as T;
  }

  /** Le manifeste est-il présent sur disque ? (ne lève jamais) */
  async exists(): Promise<boolean> {
    try {
      const fs = await loadFs();
      await fs.access(`${this.dir}/${MAP_FILES.manifest}`);
      return true;
    } catch {
      return false;
    }
  }

  manifest(): Promise<unknown> {
    return this.read<unknown>(MAP_FILES.manifest);
  }

  tile(entry: ManifestTile): Promise<RawTile> {
    return this.read<RawTile>(entry.file);
  }

  roadGraph(manifest: Manifest): Promise<RawRoadGraph> {
    return this.read<RawRoadGraph>(manifest.files.roadGraph);
  }

  places(manifest: Manifest): Promise<RawPlaces> {
    return this.read<RawPlaces>(manifest.files.places);
  }

  landmarks(manifest: Manifest): Promise<RawLandmarks> {
    return this.read<RawLandmarks>(manifest.files.landmarks);
  }

  terrain(manifest: Manifest): Promise<RawTerrain> {
    return this.read<RawTerrain>(manifest.files.terrain);
  }
}
