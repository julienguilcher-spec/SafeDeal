/* Registre automatique des monuments : un fichier defs/<clé>.ts exportant « def » suffit.
 * ALIAS : un fichier defs/<clé>.ts qui exporte `export const alias = '<clé cible>'` (sans « def ») fait de
 * <clé> un alias de carte de la définition cible : getMonument('<clé>') rend la définition cible. Les autres
 * orthographes d'une même clé restent dans keys.ts (KEY_ALIASES). */
import type { MonumentDef } from './types';
import { canonicalKey, keyFromPath, listAliases, registerAlias } from './keys';

type DefModule = { def?: MonumentDef; alias?: string };

const modules = import.meta.glob('./defs/*.ts', { eager: true }) as Record<string, DefModule>;

const table = new Map<string, MonumentDef>();
for (const path of Object.keys(modules).sort()) {
  const mod = modules[path];
  const fileKey = keyFromPath(path);
  if (typeof mod.alias === 'string' && !mod.def) { registerAlias(fileKey, mod.alias); continue; }
  const def = mod.def;
  if (!def) { console.error(`[monuments] defs/${fileKey}.ts n'exporte ni « def » ni « alias »`); continue; }
  if (def.key !== fileKey) console.error(`[monuments] defs/${fileKey}.ts : la clé « ${def.key} » devrait être « ${fileKey} »`);
  table.set(def.key, def);
}
for (const [alias, target] of listAliases()) {
  if (!table.has(canonicalKey(target))) console.error(`[monuments] alias « ${alias} » : la définition « ${target} » n'existe pas`);
}

/** Définition d'un monument d'après sa clé (alias acceptés), ou undefined. */
export function getMonument(key: string): MonumentDef | undefined {
  return table.get(key) ?? table.get(canonicalKey(key));
}

export function hasMonument(key: string): boolean {
  return getMonument(key) !== undefined;
}

/** Toutes les définitions, triées par clé (les alias n'y figurent pas : voir listMonumentAliases). */
export function listMonuments(): MonumentDef[] {
  return [...table.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Alias de carte : [clé de la carte, clé de la définition utilisée]. */
export function listMonumentAliases(): [string, string][] {
  return listAliases().map(([alias, target]) => [alias, canonicalKey(target)] as [string, string]);
}

export { registerAlias };
