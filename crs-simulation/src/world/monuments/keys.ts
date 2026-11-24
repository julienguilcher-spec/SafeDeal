/* Clés des monuments — DONNÉES PURES (aucun import de Three.js : chargé aussi par la simulation). */

/** Autres orthographes acceptées → clé canonique (nom du fichier dans defs/ et collide/). */
export const KEY_ALIASES: Readonly<Record<string, string>> = {
  arc_de_triomphe: 'arc_triomphe',
  arc_de_triomphe_etoile: 'arc_triomphe',
  obelisque: 'obelisque_concorde',
  obelisque_louxor: 'obelisque_concorde',
  fontaine_concorde: 'fontaines_concorde',
  fontaine_des_mers: 'fontaines_concorde',
  fontaine_des_fleuves: 'fontaines_concorde',
  colonne_de_juillet: 'colonne_juillet',
  colonne_bastille: 'colonne_juillet',
  monument_republique: 'statue_republique',
  statue_de_la_republique: 'statue_republique',
};

/**
 * ALIAS DE CARTE : une clé de la carte → une définition existante (seconde fontaine de la Concorde, monument
 * jumeau…). Déclarés soit par un fichier defs/<alias>.ts et collide/<alias>.ts qui exporte
 * `export const alias = '<clé cible>'`, soit par registerAlias(). Table commune au registre et aux obstacles.
 */
const mapAliases = new Map<string, string>();

function normalize(key: string): string {
  return key.trim().toLowerCase().replace(/[-\s]+/g, '_');
}

/** Déclare qu'une clé de la carte utilise la définition (et les obstacles) d'une autre. Les chaînes d'alias sont suivies. */
export function registerAlias(alias: string, target: string): void {
  const a = normalize(alias), t = normalize(target);
  if (a === '' || t === '' || a === t) return;
  // pas de boucle : la cible ne doit pas mener à l'alias
  let k = t;
  for (let i = 0; i < 8; i++) { const n = mapAliases.get(k) ?? KEY_ALIASES[k]; if (n === undefined) break; if (n === a) return; k = n; }
  mapAliases.set(a, t);
}

/** Alias de carte déclarés : [alias, cible] triés par alias. */
export function listAliases(): [string, string][] {
  return [...mapAliases.entries()].sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
}

/** Clé canonique d'un monument (résout les alias, tolère majuscules et tirets). */
export function canonicalKey(key: string): string {
  let k = normalize(key);
  for (let i = 0; i < 8; i++) {
    const n = mapAliases.get(k) ?? KEY_ALIASES[k];
    if (n === undefined || n === k) break;
    k = n;
  }
  return k;
}

/** Clé d'un fichier « ./defs/arc_triomphe.ts » → « arc_triomphe ». */
export function keyFromPath(path: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return path.slice(slash + 1, dot > slash ? dot : undefined);
}
