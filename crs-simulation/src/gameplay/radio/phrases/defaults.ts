/* =====================================================================================
 * Radio — valeurs par défaut des paramètres de phrase.
 * Chaque nom de paramètre employé dans une variante DOIT avoir ici une valeur : c'est ce qui garantit
 * qu'aucune accolade ne survit quels que soient les paramètres fournis (voir tests/unit/radio.phrases.test.ts).
 * Les valeurs sont choisies pour que la phrase reste correcte : « secteur courant », « quelques minutes »…
 * ===================================================================================== */

/** Paramètres qui désignent une unité : l'indicatif est dit avec ses chiffres épelés. */
export const UNIT_PARAMS: ReadonlySet<string> = new Set(['unite', 'cible']);

/** Paramètres calculés par le moteur (indicatif de la compagnie, heure de la session). */
export const DYNAMIC_PARAMS: ReadonlySet<string> = new Set(['unite', 'cible', 'heure']);

/** Valeurs par défaut fixes (hors paramètres dynamiques). */
export const PARAM_DEFAULTS: Readonly<Record<string, string>> = {
  lieu: 'courant',
  voie: 'voie concernée',
  station: 'concernée',
  direction: 'nord',
  nombre: 'plusieurs',
  reste: 'peu de',
  indisponibles: 'aucun',
  interpelles: 'aucun',
  effectif: 'complet',
  distance: 'quelques dizaines de',
  duree: 'quelques',
  litres: 'plusieurs milliers de',
  pct: 'moins de cinquante',
  moyen: 'à pied',
  nature: 'cortège déclaré',
  attitude: 'calme',
  gravite: 'léger',
  type: 'incident à traiter',
  objet: 'divers',
  mission: 'tenir le dispositif',
  limite: 'ligne actuelle',
  niveau: 'normale',
  meteo: 'stable',
};
