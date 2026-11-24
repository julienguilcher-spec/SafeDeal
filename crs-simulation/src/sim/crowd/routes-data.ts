/* =====================================================================================
 * FOULE — table des parcours réels du cœur de Paris (docs/research/04-paris-lieux-monuments.md §1.2,
 * docs/research/03-dynamique-manifestation.md §1.5, bible §I.2).
 *
 * Chaque parcours est une suite de lieux à relier dans l'ordre ; le tracé exact est calculé par les rues
 * (ctx.world.findPath). Chaque étape porte le nom du lieu tel que la carte le connaît et des coordonnées
 * de secours (repère du jeu, mètres). Un parcours n'est retenu que si son lieu de départ existe dans la
 * carte chargée, là où on l'attend : dans le quartier d'essai, aucun ne correspond.
 * ===================================================================================== */

export interface RouteStop {
  /** Nom du lieu (place ou voie) pour ctx.world.placeByName. */
  name: string;
  x: number;
  z: number;
}

export interface RouteDef {
  id: string;
  label: string;
  /** Longueur réelle approximative (m), pour information. */
  length: number;
  stops: readonly RouteStop[];
}

const REPUBLIQUE: RouteStop = { name: 'Place de la République', x: 3133, z: -211 };
const BASTILLE: RouteStop = { name: 'Place de la Bastille', x: 3493, z: 1442 };
const OPERA: RouteStop = { name: "Place de l'Opéra", x: 803, z: -586 };
const MADELEINE: RouteStop = { name: 'Place de la Madeleine', x: 239, z: -485 };
const CONCORDE: RouteStop = { name: 'Place de la Concorde', x: -3, z: 12 };
const HOTEL_DE_VILLE: RouteStop = { name: "Place de l'Hôtel de Ville", x: 2188, z: 982 };
const INVALIDES: RouteStop = { name: 'Esplanade des Invalides', x: -532, z: 716 };
const BD_TEMPLE: RouteStop = { name: 'Boulevard du Temple', x: 3261, z: 92 };
const BD_BEAUMARCHAIS: RouteStop = { name: 'Boulevard Beaumarchais', x: 3440, z: 939 };
const BD_SAINT_MARTIN: RouteStop = { name: 'Boulevard Saint-Martin', x: 2772, z: -313 };
const BD_SAINT_DENIS: RouteStop = { name: 'Boulevard Saint-Denis', x: 2416, z: -413 };
const BD_POISSONNIERE: RouteStop = { name: 'Boulevard Poissonnière', x: 1778, z: -606 };
const BD_MONTMARTRE: RouteStop = { name: 'Boulevard Montmartre', x: 1478, z: -680 };
const BD_ITALIENS: RouteStop = { name: 'Boulevard des Italiens', x: 1189, z: -656 };
const BD_CAPUCINES: RouteStop = { name: 'Boulevard des Capucines', x: 730, z: -539 };
const BD_MADELEINE: RouteStop = { name: 'Boulevard de la Madeleine', x: 363, z: -444 };
const RUE_ROYALE: RouteStop = { name: 'Rue Royale', x: 126, z: -259 };
const RUE_SAINT_ANTOINE: RouteStop = { name: 'Rue Saint-Antoine', x: 3135, z: 1268 };
const BD_INVALIDES: RouteStop = { name: 'Boulevard des Invalides', x: -476, z: 1324 };

const BOULEVARDS_EST: readonly RouteStop[] = [BD_ITALIENS, BD_MONTMARTRE, BD_POISSONNIERE, BD_SAINT_DENIS, BD_SAINT_MARTIN];

function reversed(stops: readonly RouteStop[]): RouteStop[] {
  const out: RouteStop[] = [];
  for (let i = stops.length - 1; i >= 0; i--) out.push(stops[i]!);
  return out;
}

/** Parcours déclarés classiques. Le premier arrêt est le lieu de rassemblement. */
export const ROUTES: readonly RouteDef[] = [
  { id: 'republique_bastille', label: 'République → Bastille', length: 1500, stops: [REPUBLIQUE, BD_TEMPLE, BD_BEAUMARCHAIS, BASTILLE] },
  { id: 'bastille_republique', label: 'Bastille → République', length: 1500, stops: [BASTILLE, BD_BEAUMARCHAIS, BD_TEMPLE, REPUBLIQUE] },
  { id: 'opera_republique', label: 'Opéra → République par les Grands Boulevards', length: 2200, stops: [OPERA, ...BOULEVARDS_EST, REPUBLIQUE] },
  { id: 'republique_opera', label: 'République → Opéra par les Grands Boulevards', length: 2200, stops: [REPUBLIQUE, ...reversed(BOULEVARDS_EST), OPERA] },
  { id: 'madeleine_republique', label: 'Madeleine → République', length: 2650, stops: [MADELEINE, BD_MADELEINE, BD_CAPUCINES, OPERA, ...BOULEVARDS_EST, REPUBLIQUE] },
  { id: 'hotel_de_ville_bastille', label: 'Hôtel de Ville → Bastille', length: 1400, stops: [HOTEL_DE_VILLE, RUE_SAINT_ANTOINE, BASTILLE] },
  { id: 'invalides_sud', label: 'Invalides → boulevard des Invalides', length: 800, stops: [INVALIDES, BD_INVALIDES] },
  {
    id: 'bastille_concorde', label: 'Bastille → République → Opéra → Madeleine → Concorde (parcours contesté)', length: 4400,
    stops: [BASTILLE, BD_BEAUMARCHAIS, BD_TEMPLE, REPUBLIQUE, ...reversed(BOULEVARDS_EST), OPERA, BD_CAPUCINES, BD_MADELEINE, MADELEINE, RUE_ROYALE, CONCORDE],
  },
];

/** Distance maximale entre le point de départ de la session et le premier arrêt d'un parcours (m). */
export const ROUTE_MATCH_RADIUS = 260;
