/* =====================================================================================
 * Radio — paramètres des phrases : sens et valeur par défaut.
 * Chaque nom de paramètre employé dans une variante DOIT figurer ici : c'est ce qui garantit qu'aucune accolade
 * ne survit quels que soient les paramètres fournis (voir tests/unit/radio.phrases.test.ts).
 *
 * Une valeur par défaut ne doit rien affirmer que le jeu ignore : une quantité absente est dite « non précisé »,
 * une gravité absente « à évaluer ». Les gabarits sont écrits pour que la valeur par défaut donne une phrase
 * correcte : quantités derrière un libellé au masculin singulier (« Volume : {nombre} », « Nombre d'agents
 * aptes : {nombre} »), mesures suivies de leur unité (« {distance} mètres », « {duree} minutes »).
 * ===================================================================================== */

export interface ParamSpec {
  /** Valeur dite quand le paramètre est absent, vide ou nul. */
  readonly fallback: string;
  /** Sens du paramètre (documentation, PHRASES.md). */
  readonly doc: string;
}

/** Paramètres qui désignent une unité : l'indicatif est dit avec ses chiffres épelés (« MISTRAL 2 » → « MISTRAL DEUX »). */
export const UNIT_PARAMS: ReadonlySet<string> = new Set(['unite', 'cible', 'renfort', 'autre']);

/** Paramètres calculés par le moteur (indicatifs de la formule d'appel, heure de la session). */
export const DYNAMIC_PARAMS: ReadonlySet<string> = new Set(['unite', 'cible', 'heure']);

/** Tous les paramètres de corps de message, dans l'ordre de la documentation. */
export const PARAM_SPECS: Readonly<Record<string, ParamSpec>> = {
  // lieux
  lieu: { fallback: 'actuel', doc: 'secteur dont on parle, toujours écrit « secteur {lieu} » ; déduit de la position (options.at, sinon l\'unité qui parle) par ctx.world.sectorName' },
  destination: { fallback: 'désigné', doc: 'secteur vers lequel l\'émetteur se déplace (« vers le secteur {destination} ») ; jamais déduit de sa position' },
  voie: { fallback: 'voie désignée', doc: 'rue ou carrefour fermé ou rouvert à la circulation ; déduit de la position comme {lieu} s\'il est absent' },
  issue: { fallback: 'à l\'opposé de la ligne', doc: 'issue laissée libre à la foule (« rue Saint-Antoine »)' },
  acces: { fallback: 'par l\'arrière du dispositif', doc: 'accès conseillé aux secours (« rue Royale »)' },
  station: { fallback: 'désignée', doc: 'nom de la station de métro, écrit « station {station} »' },
  direction: { fallback: 'à la foule', doc: 'direction vers laquelle l\'unité fait face, écrit « face {direction} » : point cardinal (« nord ») ; déduit du cap de l\'unité qui parle' },
  vers: { fallback: 'non précisée', doc: 'direction prise par un groupe ou un cortège (« rue Cambon », « nord »)' },
  limite: { fallback: 'ligne actuelle', doc: 'limite géographique d\'une autorisation ou d\'un refoulement (« rue de la Paix »)' },
  // quantités (nombre = dit chiffre par chiffre)
  nombre: { fallback: 'non précisé', doc: 'quantité nommée par le libellé qui précède : volume de foule, effectif d\'un groupe, nombre d\'agents, de fourgons, de grenades…' },
  effectif: { fallback: 'complet', doc: 'effectif à pied de la compagnie' },
  indisponibles: { fallback: 'non précisé', doc: 'agents blessés ou hors de combat' },
  interpelles: { fallback: 'non précisé', doc: 'nombre d\'interpellés' },
  lanceur: { fallback: 'non précisé', doc: 'grenades tirées au lanceur (compte rendu de consommation)' },
  lbd: { fallback: 'non précisé', doc: 'tirs de lanceur de balles de défense (compte rendu de consommation)' },
  // mesures (toujours suivies de leur unité)
  distance: { fallback: 'quelques dizaines de', doc: 'distance en mètres' },
  duree: { fallback: 'quelques', doc: 'délai en minutes' },
  litres: { fallback: 'plusieurs milliers de', doc: 'eau restante dans la cuve du canon à eau, en litres' },
  eau: { fallback: 'quelques centaines de', doc: 'eau restante quand la cuve est presque vide, en litres' },
  pct: { fallback: 'moins de cinquante', doc: 'part de la dotation restante, en pour cent' },
  // libellés
  moyen: { fallback: 'à pied', doc: 'mode de déplacement (« à pied », « en véhicule »)' },
  mission: { fallback: 'tenir le dispositif', doc: 'mission confiée, à l\'infinitif (« interdire le pont de la Concorde »)' },
  cadre: { fallback: 'à préciser', doc: 'cadre juridique de la mission (« manifestation déclarée », « manifestation interdite »)' },
  nature: { fallback: 'à préciser', doc: 'nature de la foule (« cortège déclaré », « rassemblement spontané »)' },
  attitude: { fallback: 'à préciser', doc: 'attitude de la foule (« calme », « tendue », « hostile »)' },
  gravite: { fallback: 'à évaluer', doc: 'gravité d\'une blessure, au féminin (« légère », « sérieuse », « critique »)' },
  type: { fallback: 'à préciser', doc: 'nature d\'un incident ou d\'un feu (« feu de poubelles », « véhicule en feu »)' },
  objet: { fallback: 'poubelles et barrières', doc: 'matériaux d\'une barricade' },
  motif: { fallback: 'infraction constatée', doc: 'fait reproché à un interpellé (« jet de projectile sur agents »)' },
  signalement: { fallback: 'à préciser', doc: 'signalement d\'un individu, trois indices (« veste verte, bonnet noir, sac rouge »)' },
  raison: { fallback: 'unité déjà engagée', doc: 'raison pour laquelle un ordre ne peut pas être exécuté' },
  demande: { fallback: 'l\'arrêt de la tête de cortège', doc: 'ce que la liaison demande aux organisateurs, avec son article (« un changement de parcours », « l\'isolement des éléments violents »)' },
  meteo: { fallback: 'sans changement', doc: 'temps et vent (« ciel couvert, vent d\'ouest »)' },
  // autres unités citées dans le corps du message
  renfort: { fallback: 'une section de réserve', doc: 'indicatif de l\'unité envoyée en renfort' },
  autre: { fallback: 'l\'unité en ligne', doc: 'indicatif de l\'unité à relever' },
};

/** Valeurs par défaut, par nom de paramètre. */
export const PARAM_DEFAULTS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PARAM_SPECS).map(([name, spec]) => [name, spec.fallback]),
);
