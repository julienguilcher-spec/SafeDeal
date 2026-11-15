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

/** Clé canonique d'un monument (résout les alias, tolère majuscules et tirets). */
export function canonicalKey(key: string): string {
  const k = key.trim().toLowerCase().replace(/[-\s]+/g, '_');
  return KEY_ALIASES[k] ?? k;
}

/** Clé d'un fichier « ./defs/arc_triomphe.ts » → « arc_triomphe ». */
export function keyFromPath(path: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return path.slice(slash + 1, dot > slash ? dot : undefined);
}
