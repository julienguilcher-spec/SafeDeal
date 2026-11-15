/* Registre automatique des monuments : un fichier defs/<clé>.ts exportant « def » suffit. */
import type { MonumentDef } from './types';
import { canonicalKey, keyFromPath } from './keys';

const modules = import.meta.glob('./defs/*.ts', { eager: true }) as Record<string, { def?: MonumentDef }>;

const table = new Map<string, MonumentDef>();
for (const path of Object.keys(modules).sort()) {
  const def = modules[path].def;
  const fileKey = keyFromPath(path);
  if (!def) { console.error(`[monuments] defs/${fileKey}.ts n'exporte pas « def »`); continue; }
  if (def.key !== fileKey) console.error(`[monuments] defs/${fileKey}.ts : la clé « ${def.key} » devrait être « ${fileKey} »`);
  table.set(def.key, def);
}

/** Définition d'un monument d'après sa clé (alias acceptés), ou undefined. */
export function getMonument(key: string): MonumentDef | undefined {
  return table.get(key) ?? table.get(canonicalKey(key));
}

export function hasMonument(key: string): boolean {
  return getMonument(key) !== undefined;
}

/** Toutes les définitions, triées par clé. */
export function listMonuments(): MonumentDef[] {
  return [...table.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
