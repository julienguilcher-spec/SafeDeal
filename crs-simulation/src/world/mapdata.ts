/* =====================================================================================
 * CRS SIMULATION FRANCE — FORMAT DE DONNÉES DE LA CARTE (côté jeu ET côté outils)
 * -------------------------------------------------------------------------------------
 * Ce module est AUTONOME : aucun import, et uniquement de la syntaxe TypeScript
 * « effaçable » (pas d'enum, pas de namespace, pas de propriété de paramètre). Le script
 * de construction de la carte (Node 22, effacement de types) l'importe tel quel, et le
 * moteur du jeu l'importe via Vite. Description complète : docs/map-format.md.
 *
 * Deux familles de types :
 *   - BRUTS (Raw…) : ce qui est écrit sur disque en JSON. Compact : colonnes (tableaux
 *     plats), coordonnées ENTIÈRES en décimètres relatives à l'origine de la tuile,
 *     polylignes et anneaux codés en deltas, énumérations codées par leur indice.
 *   - DÉCODÉS : confortables pour le moteur. Coordonnées monde en mètres, Float32Array
 *     pour les géométries, énumérations en chaînes, caps en radians.
 *
 * Repère : x = est, z = sud, y = haut (mètres). Cap h : vecteur avant = (sin h, cos h)
 * dans le plan (x, z). Altitudes relatives au sol de la place de la Concorde (y = 0).
 *
 * Arborescence : manifest.json, roadgraph.json, places.json, landmarks.json, terrain.json,
 * tiles/t_{tx}_{tz}.json.
 * ===================================================================================== */

// ─────────────────────────────────────────────────────────────────────────────────────
// 1. Constantes, projection, tuiles
// ─────────────────────────────────────────────────────────────────────────────────────

/** Signature du format (champ `format` du manifeste). */
export const FORMAT_NAME = 'crs-paris-map';
/**
 * Version du format. Elle n'augmente que pour un changement INCOMPATIBLE. Les ajouts
 * compatibles (nouvelle colonne, nouvelle couche, nouvelle valeur ajoutée EN FIN d'une
 * énumération) ne la changent pas : un décodeur ignore ce qu'il ne connaît pas.
 */
export const FORMAT_VERSION = 1;

/** Origine du monde : obélisque de la Concorde. */
export const ORIGIN_LAT = 48.865633;
export const ORIGIN_LON = 2.321236;
/** Projection locale équirectangulaire : mètres par degré à la latitude de Paris. */
export const M_PER_DEG_LON = 73305;
export const M_PER_DEG_LAT = 111214;

/** Côté d'une tuile (m). */
export const TILE_SIZE = 512;
/** Unités entières par mètre dans les fichiers (10 = décimètre). */
export const UNITS_PER_METER = 10;
/** Côté d'une tuile en unités entières. */
export const TILE_UNITS = TILE_SIZE * UNITS_PER_METER;
/** Unités d'angle par tour dans les fichiers (3600 = dixième de degré). */
export const ANGLE_UNITS = 3600;
/**
 * Débord maximal (m) d'une géométrie hors de sa tuile. Un bâtiment n'est jamais découpé :
 * il appartient à la tuile qui contient le centre de sa boîte englobante et peut déborder.
 */
export const MAX_OVERHANG = 512;

/** Noms des fichiers, relatifs au dossier de la carte (public/data/paris/). */
export const MAP_FILES = {
  manifest: 'manifest.json',
  roadGraph: 'roadgraph.json',
  places: 'places.json',
  landmarks: 'landmarks.json',
  terrain: 'terrain.json',
  tilesDir: 'tiles',
} as const;

export interface XZ { x: number; z: number }
export interface LonLat { lon: number; lat: number }
export interface TileIndex { tx: number; tz: number }
/** Rectangle en mètres monde. */
export interface Bounds { minX: number; minZ: number; maxX: number; maxZ: number }
/** Rectangle géographique WGS84 (degrés). */
export interface LonLatBox { west: number; south: number; east: number; north: number }

/** Emprise du jeu : cœur de Paris. */
export const PARIS_BBOX: LonLatBox = { west: 2.285, south: 48.85, east: 2.3725, north: 48.878 };

/** WGS84 -> mètres monde. `out` évite une allocation dans les boucles. */
export function lonLatToWorld(lon: number, lat: number, out: XZ = { x: 0, z: 0 }): XZ {
  out.x = (lon - ORIGIN_LON) * M_PER_DEG_LON;
  out.z = -(lat - ORIGIN_LAT) * M_PER_DEG_LAT;
  return out;
}

/** Mètres monde -> WGS84. */
export function worldToLonLat(x: number, z: number, out: LonLat = { lon: 0, lat: 0 }): LonLat {
  out.lon = ORIGIN_LON + x / M_PER_DEG_LON;
  out.lat = ORIGIN_LAT - z / M_PER_DEG_LAT;
  return out;
}

/** Indices de la tuile contenant le point : tx = floor(x / 512), tz = floor(z / 512). */
export function tileIndexOf(x: number, z: number, out: TileIndex = { tx: 0, tz: 0 }): TileIndex {
  out.tx = Math.floor(x / TILE_SIZE) + 0;
  out.tz = Math.floor(z / TILE_SIZE) + 0;
  return out;
}

/** Clé texte d'une tuile, ex. « -3_2 ». */
export function tileKey(tx: number, tz: number): string {
  return `${tx}_${tz}`;
}

/** Inverse de tileKey. Lève une erreur si la clé est mal formée. */
export function parseTileKey(key: string): TileIndex {
  const m = /^(-?\d+)_(-?\d+)$/.exec(key);
  if (m === null) throw new Error(`mapdata: clé de tuile invalide « ${key} »`);
  return { tx: Number(m[1]), tz: Number(m[2]) };
}

/** Chemin du fichier d'une tuile, relatif au dossier de la carte : « tiles/t_-3_2.json ». */
export function tilePath(tx: number, tz: number): string {
  return `${MAP_FILES.tilesDir}/t_${tx}_${tz}.json`;
}

/** Rectangle monde couvert par une tuile : [minX, maxX[ × [minZ, maxZ[. */
export function tileBounds(tx: number, tz: number): Bounds {
  return { minX: tx * TILE_SIZE, minZ: tz * TILE_SIZE, maxX: (tx + 1) * TILE_SIZE, maxZ: (tz + 1) * TILE_SIZE };
}

/** Rectangle monde d'une emprise géographique. */
export function boundsOfBbox(bbox: LonLatBox): Bounds {
  const nw = lonLatToWorld(bbox.west, bbox.north);
  const se = lonLatToWorld(bbox.east, bbox.south);
  return { minX: nw.x, minZ: nw.z, maxX: se.x, maxZ: se.z };
}

/** Tuiles qui recouvrent un rectangle monde, rangées par tz puis tx. */
export function tilesCoveringBounds(b: Bounds): TileIndex[] {
  const out: TileIndex[] = [];
  const tx0 = Math.floor(b.minX / TILE_SIZE), tz0 = Math.floor(b.minZ / TILE_SIZE);
  // La borne haute est exclue : un rectangle qui s'arrête pile sur une limite de tuile n'entame pas la suivante.
  const tx1 = Math.ceil(b.maxX / TILE_SIZE) - 1, tz1 = Math.ceil(b.maxZ / TILE_SIZE) - 1;
  for (let tz = tz0; tz <= tz1; tz++) {
    for (let tx = tx0; tx <= tx1; tx++) out.push({ tx: tx + 0, tz: tz + 0 });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 2. Énumérations (codées sur disque par leur indice — on n'ajoute qu'EN FIN de liste)
// ─────────────────────────────────────────────────────────────────────────────────────
// Un code inconnu (données plus récentes que le code) est décodé comme la valeur d'indice 0.

/** Type de bâtiment. 'generic' = immeuble parisien courant (logements, commerces en rez-de-chaussée). */
export const BUILDING_KINDS = [
  'generic', 'residential', 'office', 'retail', 'hotel', 'public', 'government', 'school', 'hospital',
  'religious', 'culture', 'station', 'police', 'fire_station', 'industrial', 'parking', 'monument',
  'kiosk', 'roof', 'construction',
] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

/** Forme de toit : plat, mansarde, deux pans, dôme. */
export const ROOF_SHAPES = ['flat', 'mansard', 'gabled', 'dome'] as const;
export type RoofShape = (typeof ROOF_SHAPES)[number];

/** Indice de style de façade : haussmannien, moderne, monumental, faubourg. */
export const BUILDING_STYLES = ['haussmann', 'modern', 'monumental', 'faubourg'] as const;
export type BuildingStyle = (typeof BUILDING_STYLES)[number];

/**
 * Type de surface au sol (polygone). 'plaza' = place minérale ; 'pedestrian' = zone piétonne ;
 * 'road' = chaussée ; 'median' = terre-plein ou îlot directionnel ; 'courtyard' = cour d'îlot ;
 * 'gravel' = sol stabilisé (allées de jardin) ; 'quay' = berge basse.
 */
export const MAP_SURFACE_KINDS = [
  'plaza', 'road', 'sidewalk', 'pedestrian', 'median', 'parking', 'construction', 'courtyard',
  'park', 'garden', 'grass', 'gravel', 'quay', 'sports', 'cemetery', 'rail', 'water',
] as const;
export type MapSurfaceKind = (typeof MAP_SURFACE_KINDS)[number];

/**
 * Ordre de superposition conseillé, du dessous vers le dessus. Dans une tuile, l'ordre du tableau
 * `surfaces` EST l'ordre de superposition : une surface recouvre celles qui la précèdent.
 */
export const MAP_SURFACE_LAYER_ORDER: readonly MapSurfaceKind[] = [
  'road', 'rail', 'sidewalk', 'median', 'pedestrian', 'plaza', 'quay', 'courtyard', 'parking',
  'construction', 'cemetery', 'sports', 'park', 'garden', 'gravel', 'grass', 'water',
];

/** Barrière linéaire : mur, grille, haie, mur de quai, garde-corps (parapet), portail. */
export const BARRIER_KINDS = ['wall', 'fence', 'hedge', 'quay_wall', 'railing', 'gate'] as const;
export type BarrierKind = (typeof BARRIER_KINDS)[number];

/**
 * Mobilier urbain. Les noms repris de `PropKind` (src/core/contracts.ts) sont identiques, pour que
 * le moteur puisse créer l'objet correspondant sans table de conversion.
 */
export const FURNITURE_KINDS = [
  'autre', 'banc', 'candelabre', 'poubelle', 'potelet', 'abribus', 'kiosque', 'colonne_morris',
  'fontaine_wallace', 'sanisette', 'panneau_pub', 'station_velo', 'jardiniere', 'conteneur',
  'barriere_vauban', 'barriere_chantier', 'table_terrasse', 'distributeur', 'echafaudage',
  'boite_aux_lettres', 'arceau_velo', 'panneau', 'statue', 'mat_drapeau', 'bouche_incendie',
  'horodateur', 'armoire_technique', 'colonne_verre', 'horloge', 'camera',
] as const;
export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

/** Catégorie de jeu d'un commerce (mêmes valeurs que `ShopCategory` des contrats). Aucune enseigne. */
export const SHOP_CATEGORIES = [
  'autre', 'banque', 'luxe', 'mode', 'bijouterie', 'alimentation', 'supermarche', 'cafe_restaurant',
  'restauration_rapide', 'pharmacie', 'tabac_presse', 'telephonie', 'agence', 'hotel',
] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/** Classe de voie (mêmes valeurs que `RoadClass` des contrats). */
export const ROAD_CLASSES = [
  'residential', 'motorway', 'primary', 'secondary', 'tertiary', 'service', 'pedestrian', 'footway',
] as const;
export type RoadClass = (typeof ROAD_CLASSES)[number];

/** Revêtement de voie. 'sett' = pavés ; 'paving' = dalles. */
export const ROAD_SURFACES = ['asphalt', 'sett', 'paving', 'concrete', 'gravel', 'wood'] as const;
export type RoadSurface = (typeof ROAD_SURFACES)[number];

/** Nature d'un lieu nommé (mêmes valeurs que `PlaceKind` des contrats). */
export const PLACE_KINDS = [
  'square', 'street', 'bridge', 'quay', 'garden', 'district', 'monument', 'station', 'institution',
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** Bits du champ `flags` des nœuds du graphe routier. */
export const NODE_SIGNAL = 1;
export const NODE_CROSSING = 2;
export const NODE_BOUNDARY = 4;
/** Bits du champ `flags` des arêtes du graphe routier. */
export const EDGE_ONEWAY = 1;
export const EDGE_BRIDGE = 2;
export const EDGE_TUNNEL = 4;
export const EDGE_PEDESTRIAN = 8;

/** Vitesse limite par défaut (km/h) quand la colonne est absente : Paris est en zone 30. */
export const DEFAULT_SPEED_KMH = 30;

/**
 * Clés conseillées pour les monuments modélisés à la main (minuscules ASCII, chiffres, « _ »).
 * La liste est indicative : une clé absente d'ici reste valide.
 */
export const SUGGESTED_LANDMARK_KEYS = [
  'arc_de_triomphe', 'tour_eiffel', 'obelisque_concorde', 'fontaines_concorde', 'louvre',
  'pyramide_louvre', 'notre_dame', 'opera_garnier', 'invalides', 'grand_palais', 'petit_palais',
  'madeleine', 'assemblee_nationale', 'hotel_de_ville', 'colonne_vendome', 'colonne_juillet',
  'statue_republique', 'palais_chaillot', 'pont_alexandre_iii',
] as const;

// ─────────────────────────────────────────────────────────────────────────────────────
// 3. Types DÉCODÉS (moteur) — mètres monde, radians, chaînes
// ─────────────────────────────────────────────────────────────────────────────────────

export interface Building {
  /** Identifiant stable : entier > 0, unique parmi tous les bâtiments de la carte. */
  id: number;
  kind: BuildingKind;
  roof: RoofShape;
  style: BuildingStyle;
  /** Altitude du pied du bâtiment (m ; 0 = sol de la Concorde). */
  baseY: number;
  /** Hauteur totale au-dessus de baseY, toit compris (m). */
  height: number;
  /** Nombre de niveaux, rez-de-chaussée compris, combles exclus (≥ 1). */
  levels: number;
  /** Anneau extérieur [x0, z0, x1, z1, …] : antihoraire vu de dessus, non refermé. */
  outer: Float32Array;
  /** Cours intérieures : anneaux horaires vus de dessus, non refermés. */
  holes: Float32Array[];
  /**
   * Clé du monument modélisé à la main qui remplace ce bâtiment ('' = aucun). Le rendu générique
   * ignore un bâtiment dont la clé est renseignée ; l'emprise reste utile aux collisions.
   */
  landmarkKey: string;
  /** Nom propre éventuel ('' = aucun). Jamais une enseigne commerciale. */
  name: string;
}

export interface Surface {
  kind: MapSurfaceKind;
  /** Nom propre éventuel ('' = aucun) : « Jardin des Tuileries », « La Seine »… */
  name: string;
  /** Altitude imposée (m), par exemple le niveau de l'eau ; null = la surface épouse le relief. */
  level: number | null;
  /** Anneau extérieur, antihoraire vu de dessus, non refermé. */
  outer: Float32Array;
  /** Trous, horaires vus de dessus. */
  holes: Float32Array[];
}

export interface Barrier {
  kind: BarrierKind;
  /**
   * Hauteur (m). Pour 'quay_wall' : hauteur du mur de soutènement, de son pied (eau ou berge
   * basse) à sa crête ; la polyligne suit la crête.
   */
  height: number;
  /** Polyligne [x0, z0, x1, z1, …], au moins 2 points. */
  points: Float32Array;
}

/** Arbres d'une tuile, en colonnes (prêts pour l'instancing). */
export interface TreeSet {
  count: number;
  x: Float32Array;
  z: Float32Array;
  /** Hauteur totale (m). */
  height: Float32Array;
  /** Rayon de la couronne (m). */
  crownRadius: Float32Array;
}

export interface FurnitureItem {
  kind: FurnitureKind;
  x: number;
  z: number;
  /** Cap (rad) : direction vers laquelle l'objet « regarde ». */
  heading: number;
}

/** Support de feu tricolore (objet physique). Le carrefour régulé est un nœud du graphe. */
export interface TrafficSignal {
  x: number;
  z: number;
  /** Cap (rad) de la face lumineuse : elle regarde les véhicules qui arrivent. */
  heading: number;
  /** Indice du nœud du graphe routier commandé par ce feu, -1 si inconnu. */
  node: number;
}

export interface MetroEntrance {
  x: number;
  z: number;
  /** Cap (rad) : direction dans laquelle on marche en SORTANT de la bouche. */
  heading: number;
  /** Nom de la station. */
  name: string;
  /** Lignes desservies, séparées par « ; » ('' si inconnu). */
  lines: string;
}

export interface Shop {
  /** Identifiant stable : entier > 0, unique parmi tous les commerces de la carte. */
  id: number;
  /** Milieu de la vitrine, sur la façade. */
  x: number;
  z: number;
  /** Cap (rad) de la normale sortante de la façade (vers la rue). */
  heading: number;
  /** Largeur de vitrine (m). */
  width: number;
  category: ShopCategory;
  /** Identifiant du bâtiment qui porte la vitrine (0 = inconnu). Il peut être dans une tuile voisine. */
  buildingId: number;
}

export interface Tile {
  version: number;
  tx: number;
  tz: number;
  buildings: Building[];
  /** Indices (dans le graphe routier global) des arêtes qui traversent la tuile, croissants. */
  roadEdges: number[];
  /** Surfaces, du dessous vers le dessus. */
  surfaces: Surface[];
  barriers: Barrier[];
  trees: TreeSet;
  furniture: FurnitureItem[];
  signals: TrafficSignal[];
  metroEntrances: MetroEntrance[];
  shops: Shop[];
}

export interface RoadNode {
  x: number;
  z: number;
  /** Carrefour à feux. */
  signal: boolean;
  /** Passage piéton. */
  crossing: boolean;
  /** Nœud en limite de carte (entrée / sortie de la circulation). */
  boundary: boolean;
  /** DÉRIVÉ au décodage : indices des arêtes incidentes (les deux sens confondus). */
  edges: number[];
}

export interface RoadEdge {
  /** Nœud de départ et nœud d'arrivée (indices). */
  a: number;
  b: number;
  /** Polyligne [x0, z0, …] de a vers b, extrémités comprises (elles coïncident avec les nœuds). */
  points: Float32Array;
  /** Largeur de chaussée (m), hors trottoirs. */
  width: number;
  /** Voies dans le sens a -> b, puis b -> a (0 si sens unique ou voie piétonne). */
  lanesForward: number;
  lanesBackward: number;
  /** Sens unique : circulation de a vers b uniquement. */
  oneway: boolean;
  roadClass: RoadClass;
  /** Nom de la voie ('' si aucun). */
  name: string;
  /** Pont : le tablier relie l'altitude du sol aux deux extrémités sans suivre le relief. */
  bridge: boolean;
  /** Souterrain : non praticable en surface. */
  tunnel: boolean;
  /** Revêtement ('sett' = pavés). */
  surface: RoadSurface;
  /** Vitesse limite (m/s). Stockée en km/h entiers. */
  speedLimit: number;
  /** Largeur estimée de CHAQUE trottoir (m) ; 0 = pas de trottoir. */
  sidewalk: number;
  /** Voie interdite aux véhicules (rue piétonne, allée, escalier). */
  pedestrianOnly: boolean;
  /** Clé du monument modélisé à la main qui remplace cet ouvrage, ex. un pont ('' = aucun). */
  landmarkKey: string;
  /** DÉRIVÉ au décodage : longueur de la polyligne (m). */
  length: number;
}

export interface RoadGraph {
  version: number;
  nodes: RoadNode[];
  edges: RoadEdge[];
}

export interface Place {
  name: string;
  kind: PlaceKind;
  /** Point de référence (centre de la place, milieu de la rue…). */
  x: number;
  z: number;
  /** Rayon approximatif de l'emprise (m). */
  radius: number;
  /** Importance : 0 = mineur, 1 = ordinaire, 2 = important, 3 = majeur. */
  importance: number;
  /** Référence libre ('' si aucune) : lignes d'une station (« 1;8;12 »), arrondissement… */
  ref: string;
}

export interface Landmark {
  /** Clé stable (minuscules ASCII, chiffres, « _ ») : relie données, bâtiments et modèle 3D. */
  key: string;
  name: string;
  /** Point d'ancrage du modèle. */
  x: number;
  z: number;
  /** Altitude du sol au point d'ancrage (m). */
  y: number;
  /** Cap (rad) de la façade principale. */
  heading: number;
  /** Hauteur totale (m). */
  height: number;
  /** Emprise au sol [x0, z0, …], antihoraire vue de dessus, non refermée. */
  footprint: Float32Array;
}

/** Relief : grille régulière d'altitudes. Nœud (ix, iz) en (x0 + ix·step, z0 + iz·step). */
export interface Terrain {
  x0: number;
  z0: number;
  /** Pas de la grille (m). */
  step: number;
  nx: number;
  nz: number;
  /** nx·nz altitudes (m), ligne par ligne : indice = iz·nx + ix. */
  heights: Float32Array;
  /** DÉRIVÉS au décodage. */
  minY: number;
  maxY: number;
}

export interface Attribution {
  /** Nom de la source, ex. « OpenStreetMap ». */
  source: string;
  /** Licence, ex. « ODbL 1.0 ». */
  license: string;
  /** Mention exacte à afficher dans le jeu. */
  text: string;
  url?: string;
}

export interface ManifestTile {
  tx: number;
  tz: number;
  /** Chemin relatif au dossier de la carte. */
  file: string;
  /** Taille du fichier (octets), informative. */
  bytes?: number;
}

/** manifest.json — lisible tel quel, sans décodage. */
export interface Manifest {
  format: string;
  version: number;
  /** 'paris' ou 'test-district'. */
  name: string;
  /** Date ISO 8601 de génération ('' pour un jeu de données déterministe). */
  generatedAt: string;
  bbox: LonLatBox;
  origin: { lat: number; lon: number };
  projection: { mPerDegLon: number; mPerDegLat: number };
  tileSize: number;
  /** Emprise en mètres monde. */
  bounds: Bounds;
  /** Niveau de l'eau du fleuve (m). */
  waterLevel: number;
  files: { roadGraph: string; places: string; landmarks: string; terrain: string };
  tiles: ManifestTile[];
  attribution: Attribution[];
}

/** Carte entière décodée. */
export interface MapData {
  manifest: Manifest;
  /** Même ordre que manifest.tiles. */
  tiles: Tile[];
  roadGraph: RoadGraph;
  places: Place[];
  landmarks: Landmark[];
  terrain: Terrain;
}

/**
 * Forme « entrée d'encodeur » d'un type décodé : partout où le type décodé porte un Float32Array,
 * un simple tableau de nombres est accepté. Un objet décodé est toujours une entrée valide.
 */
export type Loose<T> =
  T extends Float32Array ? ArrayLike<number>
  : T extends (infer U)[] ? readonly Loose<U>[]
  : T extends object ? { [K in keyof T]: Loose<T[K]> }
  : T;

export type TileInput = Loose<Tile>;
/** Les champs dérivés (`edges` des nœuds, `length` des arêtes) ne sont pas demandés à l'encodage. */
export type RoadNodeInput = Omit<RoadNode, 'edges'>;
export type RoadEdgeInput = Loose<Omit<RoadEdge, 'length'>>;
export interface RoadGraphInput { nodes: readonly RoadNodeInput[]; edges: readonly RoadEdgeInput[] }
export type TerrainInput = Loose<Omit<Terrain, 'minY' | 'maxY'>>;
export type LandmarkInput = Loose<Landmark>;

// ─────────────────────────────────────────────────────────────────────────────────────
// 4. Types BRUTS (disque) — entiers, colonnes, deltas
// ─────────────────────────────────────────────────────────────────────────────────────
// Conventions communes :
//   - `n` : nombre d'éléments de la couche ; toute colonne « dense » a `n` valeurs.
//   - `xz` de points : [x0, z0, x1, z1, …] en décimètres relatifs à l'origine de la tuile.
//   - `xz` d'anneaux / de polylignes : le premier sommet de chaque anneau est relatif à l'origine
//     de la tuile, chaque sommet suivant est un delta par rapport au précédent ; `len` donne le
//     nombre de sommets de chaque anneau.
//   - colonne facultative absente = toutes les valeurs valent le défaut indiqué.
//   - colonne « creuse » : paires [indice d'élément, valeur, …], indices strictement croissants.
//   - les chaînes passent par la table `str` du fichier ; str[0] vaut toujours ''.

export interface RawBuildings {
  n: number;
  id: number[];
  /** Hauteur (dm). */
  h: number[];
  /** Nombre de sommets de chaque anneau (extérieurs et trous, dans l'ordre). */
  len: number[];
  xz: number[];
  /** Indice dans BUILDING_KINDS. Défaut 0. */
  kind?: number[];
  /** Indice dans ROOF_SHAPES. Défaut 0. */
  roof?: number[];
  /** Indice dans BUILDING_STYLES. Défaut 0. */
  style?: number[];
  /** Altitude de base (dm). Défaut 0. */
  base?: number[];
  /** Niveaux. Défaut 0 = inconnu (estimé d'après la hauteur au décodage). */
  lv?: number[];
  /** Nombre d'anneaux par bâtiment (1 extérieur + trous). Défaut 1. */
  rings?: number[];
  /** Creuse : [indice de bâtiment, indice str de la clé de monument, …]. */
  lm?: number[];
  /** Creuse : [indice de bâtiment, indice str du nom, …]. */
  name?: number[];
}

export interface RawSurfaces {
  n: number;
  /** Indice dans MAP_SURFACE_KINDS. */
  kind: number[];
  len: number[];
  xz: number[];
  /** Défaut 1. */
  rings?: number[];
  /** Creuse : [indice de surface, indice str du nom, …]. */
  name?: number[];
  /** Creuse : [indice de surface, altitude imposée (dm), …]. */
  y?: number[];
}

export interface RawBarriers {
  n: number;
  /** Nombre de points de chaque polyligne. */
  len: number[];
  xz: number[];
  /** Indice dans BARRIER_KINDS. Défaut 0. */
  kind?: number[];
  /** Hauteur (dm). Défaut 20 (2 m). */
  h?: number[];
}

export interface RawTrees {
  n: number;
  xz: number[];
  /** Hauteur (dm). Défaut 100 (10 m). */
  h?: number[];
  /** Rayon de couronne (dm). Défaut 30 (3 m). */
  r?: number[];
}

export interface RawFurniture {
  n: number;
  xz: number[];
  /** Indice dans FURNITURE_KINDS. Défaut 0. */
  kind?: number[];
  /** Cap en dixièmes de degré, 0..3599. Défaut 0. */
  a?: number[];
}

export interface RawSignals {
  n: number;
  xz: number[];
  /** Cap en dixièmes de degré. Défaut 0. */
  a?: number[];
  /** Indice du nœud commandé. Défaut -1. */
  node?: number[];
}

export interface RawMetro {
  n: number;
  xz: number[];
  /** Cap en dixièmes de degré. Défaut 0. */
  a?: number[];
  /** Indice str du nom de station. Défaut 0. */
  name?: number[];
  /** Indice str des lignes. Défaut 0. */
  lines?: number[];
}

export interface RawShops {
  n: number;
  id: number[];
  xz: number[];
  /** Cap de la normale sortante, dixièmes de degré. Défaut 0. */
  a?: number[];
  /** Largeur de vitrine (dm). Défaut 40 (4 m). */
  w?: number[];
  /** Indice dans SHOP_CATEGORIES. Défaut 0. */
  cat?: number[];
  /** Identifiant du bâtiment. Défaut 0. */
  b?: number[];
}

/** tiles/t_{tx}_{tz}.json */
export interface RawTile {
  v: number;
  tx: number;
  tz: number;
  /** Table de chaînes ; str[0] === ''. Absente si aucune chaîne. */
  str?: string[];
  buildings?: RawBuildings;
  /** Indices globaux d'arêtes, strictement croissants. */
  roads?: number[];
  surfaces?: RawSurfaces;
  barriers?: RawBarriers;
  trees?: RawTrees;
  furniture?: RawFurniture;
  signals?: RawSignals;
  metro?: RawMetro;
  shops?: RawShops;
}

/** roadgraph.json — coordonnées en décimètres relatifs à l'ORIGINE DU MONDE. */
export interface RawRoadGraph {
  v: number;
  /** Table de chaînes (noms de voies, clés de monuments) ; str[0] === ''. */
  str: string[];
  nodes: {
    n: number;
    xz: number[];
    /** Bits NODE_*. Défaut 0. */
    flags?: number[];
  };
  edges: {
    n: number;
    a: number[];
    b: number[];
    /** Largeur de chaussée (dm). */
    w: number[];
    /** Nombre de points INTERMÉDIAIRES de chaque arête (extrémités exclues). Défaut 0. */
    len?: number[];
    /** Points intermédiaires : deltas successifs à partir du nœud a. */
    xz?: number[];
    /** Voies a -> b. Défaut 1. */
    lf?: number[];
    /** Voies b -> a. Défaut 1. */
    lb?: number[];
    /** Indice dans ROAD_CLASSES. Défaut 0. */
    cls?: number[];
    /** Bits EDGE_*. Défaut 0. */
    flags?: number[];
    /** Indice dans ROAD_SURFACES. Défaut 0. */
    surf?: number[];
    /** Vitesse limite (km/h). Défaut 30. */
    speed?: number[];
    /** Largeur de trottoir (dm). Défaut 0. */
    sw?: number[];
    /** Indice str du nom. Défaut 0. */
    name?: number[];
    /** Creuse : [indice d'arête, indice str de la clé de monument, …]. */
    lm?: number[];
  };
}

/** places.json — coordonnées en décimètres relatifs à l'origine du monde. */
export interface RawPlaces {
  v: number;
  n: number;
  name: string[];
  xz: number[];
  /** Indice dans PLACE_KINDS. Défaut 0. */
  kind?: number[];
  /** Rayon (m entiers). Défaut 0. */
  r?: number[];
  /** Importance 0..3. Défaut 1. */
  imp?: number[];
  /** Référence libre. Défaut ''. */
  ref?: string[];
}

/** landmarks.json — coordonnées en décimètres relatifs à l'origine du monde. */
export interface RawLandmarks {
  v: number;
  n: number;
  key: string[];
  name: string[];
  xz: number[];
  /** Hauteur (dm). */
  h: number[];
  /** Nombre de sommets de chaque emprise. */
  len: number[];
  /** Emprises : premier sommet absolu, puis deltas. */
  fxz: number[];
  /** Cap en dixièmes de degré. Défaut 0. */
  a?: number[];
  /** Altitude du sol (dm). Défaut 0. */
  y?: number[];
}

/** terrain.json */
export interface RawTerrain {
  v: number;
  x0: number;
  z0: number;
  step: number;
  nx: number;
  nz: number;
  /** Mètres par unité entière (0.1 = décimètre). */
  scale: number;
  /** nx·nz entiers codés en deltas successifs (le premier est absolu), ligne par ligne. */
  h: number[];
}

/** Carte entière sous sa forme disque (ce que produit le générateur de quartier d'essai). */
export interface RawMapData {
  manifest: Manifest;
  /** Même ordre que manifest.tiles. */
  tiles: RawTile[];
  roadGraph: RawRoadGraph;
  places: RawPlaces;
  landmarks: RawLandmarks;
  terrain: RawTerrain;
}

export interface MapFile {
  /** Chemin relatif au dossier de la carte. */
  path: string;
  /** Contenu à sérialiser avec JSON.stringify. */
  data: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 5. Géométrie utilitaire (plan x/z)
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Aire signée (m²) d'un anneau [x0, z0, x1, z1, …]. POSITIVE si l'anneau tourne dans le sens
 * antihoraire vu de dessus (carte nord en haut, est à droite), négative sinon.
 */
export function ringSignedArea(ring: ArrayLike<number>): number {
  const n = ring.length >> 1;
  let s = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    s += ring[2 * i] * ring[2 * j + 1] - ring[2 * j] * ring[2 * i + 1];
  }
  return s / 2;
}

/** Vrai si l'anneau tourne dans le sens antihoraire vu de dessus. */
export function ringIsCCW(ring: ArrayLike<number>): boolean {
  return ringSignedArea(ring) > 0;
}

/** Copie de l'anneau parcourue en sens inverse (le premier sommet reste le premier). */
export function reverseRing(ring: ArrayLike<number>): number[] {
  const n = ring.length >> 1;
  const out: number[] = [];
  if (n === 0) return out;
  out.push(ring[0], ring[1]);
  for (let i = n - 1; i >= 1; i--) out.push(ring[2 * i], ring[2 * i + 1]);
  return out;
}

/** Boîte englobante d'une suite de points [x0, z0, …]. */
export function ringBounds(ring: ArrayLike<number>): Bounds {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const x = ring[i], z = ring[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

/** Le point est-il à l'intérieur de l'anneau ? (parité, bord non garanti) */
export function pointInRing(ring: ArrayLike<number>, x: number, z: number): boolean {
  const n = ring.length >> 1;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i], zi = ring[2 * i + 1];
    const xj = ring[2 * j], zj = ring[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Le point est-il dans le polygone (anneau extérieur moins ses trous) ? */
export function pointInPolygon(outer: ArrayLike<number>, holes: readonly ArrayLike<number>[], x: number, z: number): boolean {
  if (!pointInRing(outer, x, z)) return false;
  for (let h = 0; h < holes.length; h++) if (pointInRing(holes[h], x, z)) return false;
  return true;
}

/** Cap (rad) du vecteur (dx, dz) : avant = (sin h, cos h). */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/**
 * Cap de la normale SORTANTE du côté (ax, az) -> (bx, bz) d'un anneau correctement orienté
 * (extérieur antihoraire, trou horaire) : la normale (-dz, dx) pointe à l'opposé de la matière.
 */
export function outwardHeading(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(-(bz - az), bx - ax);
}

/** Longueur d'une polyligne [x0, z0, …] (m). */
export function polylineLength(points: ArrayLike<number>): number {
  let len = 0;
  for (let i = 2; i + 1 < points.length; i += 2) {
    len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  }
  return len;
}

// Résultat du dernier découpage de segment (paramètres d'entrée et de sortie, 0..1).
let clipT0 = 0;
let clipT1 = 1;

/** Liang–Barsky : découpe le segment par le rectangle ; écrit clipT0 / clipT1. */
function clipSegment(ax: number, az: number, bx: number, bz: number, minX: number, minZ: number, maxX: number, maxZ: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (let side = 0; side < 4; side++) {
    const p = side === 0 ? -dx : side === 1 ? dx : side === 2 ? -dz : dz;
    const q = side === 0 ? ax - minX : side === 1 ? maxX - ax : side === 2 ? az - minZ : maxZ - az;
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  clipT0 = t0;
  clipT1 = t1;
  return true;
}

/** Le segment touche-t-il le rectangle (bords compris) ? */
export function segmentIntersectsRect(ax: number, az: number, bx: number, bz: number, rect: Bounds): boolean {
  return clipSegment(ax, az, bx, bz, rect.minX, rect.minZ, rect.maxX, rect.maxZ);
}

/**
 * Découpe un anneau par un rectangle (Sutherland–Hodgman). Retourne [] si rien ne reste. Un anneau
 * concave peut donner des côtés confondus le long du bord du rectangle : c'est toléré par le format.
 */
export function clipRingToRect(ring: ArrayLike<number>, rect: Bounds): number[] {
  let cur: number[] = Array.prototype.slice.call(ring) as number[];
  for (let side = 0; side < 4 && cur.length >= 6; side++) {
    const out: number[] = [];
    const n = cur.length >> 1;
    for (let i = 0; i < n; i++) {
      const j = (i + n - 1) % n;
      const px = cur[2 * j], pz = cur[2 * j + 1];
      const qx = cur[2 * i], qz = cur[2 * i + 1];
      // Distance signée au bord (≥ 0 = dedans).
      const dp = side === 0 ? px - rect.minX : side === 1 ? rect.maxX - px : side === 2 ? pz - rect.minZ : rect.maxZ - pz;
      const dq = side === 0 ? qx - rect.minX : side === 1 ? rect.maxX - qx : side === 2 ? qz - rect.minZ : rect.maxZ - qz;
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        let ix = px + (qx - px) * t, iz = pz + (qz - pz) * t;
        // Le point d'intersection est posé exactement sur le bord.
        if (side === 0) ix = rect.minX; else if (side === 1) ix = rect.maxX; else if (side === 2) iz = rect.minZ; else iz = rect.maxZ;
        out.push(ix, iz);
      }
      if (dq >= 0) out.push(qx, qz);
    }
    cur = out;
  }
  // Retire les sommets consécutifs confondus.
  const clean: number[] = [];
  const m = cur.length >> 1;
  for (let i = 0; i < m; i++) {
    const x = cur[2 * i], z = cur[2 * i + 1];
    const k = clean.length;
    if (k >= 2 && clean[k - 2] === x && clean[k - 1] === z) continue;
    clean.push(x, z);
  }
  while (clean.length >= 4 && clean[0] === clean[clean.length - 2] && clean[1] === clean[clean.length - 1]) clean.length -= 2;
  return clean.length >= 6 ? clean : [];
}

/** Découpe une polyligne par un rectangle. Retourne les morceaux qui restent (chacun ≥ 2 points). */
export function clipPolylineToRect(points: ArrayLike<number>, rect: Bounds): number[][] {
  const pieces: number[][] = [];
  let cur: number[] | null = null;
  for (let i = 2; i + 1 < points.length; i += 2) {
    const ax = points[i - 2], az = points[i - 1], bx = points[i], bz = points[i + 1];
    if (!clipSegment(ax, az, bx, bz, rect.minX, rect.minZ, rect.maxX, rect.maxZ) || clipT0 === clipT1) {
      cur = null;
      continue;
    }
    const sx = ax + (bx - ax) * clipT0, sz = az + (bz - az) * clipT0;
    const ex = clipT1 === 1 ? bx : ax + (bx - ax) * clipT1, ez = clipT1 === 1 ? bz : az + (bz - az) * clipT1;
    if (cur !== null && clipT0 === 0) {
      cur.push(ex, ez);
    } else {
      cur = [sx, sz, ex, ez];
      pieces.push(cur);
    }
    if (clipT1 < 1) cur = null;
  }
  return pieces;
}

/** Les segments [p1 p2] et [p3 p4] se croisent-ils franchement (hors extrémités, hors colinéaires) ? */
function segmentsCross(x1: number, z1: number, x2: number, z2: number, x3: number, z3: number, x4: number, z4: number): boolean {
  const d1 = (x4 - x3) * (z1 - z3) - (z4 - z3) * (x1 - x3);
  const d2 = (x4 - x3) * (z2 - z3) - (z4 - z3) * (x2 - x3);
  const d3 = (x2 - x1) * (z3 - z1) - (z2 - z1) * (x3 - x1);
  const d4 = (x2 - x1) * (z4 - z1) - (z2 - z1) * (x4 - x1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** L'anneau se recoupe-t-il franchement ? (O(n²) : réservé à la validation hors ligne) */
export function ringSelfIntersects(ring: ArrayLike<number>): boolean {
  const n = ring.length >> 1;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      const j2 = (j + 1) % n;
      if (j2 === i) continue;
      if (segmentsCross(ring[2 * i], ring[2 * i + 1], ring[2 * i2], ring[2 * i2 + 1], ring[2 * j], ring[2 * j + 1], ring[2 * j2], ring[2 * j2 + 1])) return true;
    }
  }
  return false;
}

/** Estimation du nombre de niveaux d'après la hauteur totale (≈ 3,1 m par niveau, au moins 1). */
export function estimateLevels(height: number): number {
  return Math.max(1, Math.round(height / 3.1));
}

/**
 * Identifiant stable dérivé d'un identifiant OpenStreetMap : unique même si un nœud, un chemin
 * et une relation portent le même numéro.
 */
export function osmStableId(type: 'node' | 'way' | 'relation', osmId: number): number {
  return osmId * 4 + (type === 'node' ? 1 : type === 'way' ? 2 : 3);
}

/** Tuile vide (pour construire une tuile couche par couche). */
export function createEmptyTile(tx: number, tz: number): Tile {
  return {
    version: FORMAT_VERSION,
    tx,
    tz,
    buildings: [],
    roadEdges: [],
    surfaces: [],
    barriers: [],
    trees: createTreeSet(0),
    furniture: [],
    signals: [],
    metroEntrances: [],
    shops: [],
  };
}

/** Jeu d'arbres de taille donnée, à remplir. */
export function createTreeSet(count: number): TreeSet {
  return {
    count,
    x: new Float32Array(count),
    z: new Float32Array(count),
    height: new Float32Array(count),
    crownRadius: new Float32Array(count),
  };
}

/** Construit un TreeSet à partir d'une liste d'objets. */
export function treeSetFromList(list: readonly { x: number; z: number; height: number; crownRadius: number }[]): TreeSet {
  const t = createTreeSet(list.length);
  for (let i = 0; i < list.length; i++) {
    t.x[i] = list[i].x;
    t.z[i] = list[i].z;
    t.height[i] = list[i].height;
    t.crownRadius[i] = list[i].crownRadius;
  }
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 6. Outils internes d'encodage
// ─────────────────────────────────────────────────────────────────────────────────────

const TWO_PI = Math.PI * 2;
const NO_STRINGS: readonly string[] = [''];

/** Mètres -> unités entières. Le « + 0 » transforme -0 en 0 (JSON et comparaisons stables). */
function quantize(v: number): number {
  return Math.round(v * UNITS_PER_METER) + 0;
}

/** Radians -> dixièmes de degré dans [0, 3600[. */
function encodeAngle(h: number): number {
  let a = Math.round((h / TWO_PI) * ANGLE_UNITS) % ANGLE_UNITS;
  if (a < 0) a += ANGLE_UNITS;
  return a + 0;
}

function decodeAngle(a: number): number {
  return (a * TWO_PI) / ANGLE_UNITS;
}

function assertVersion(v: unknown, what: string): void {
  if (v !== FORMAT_VERSION) {
    throw new Error(`mapdata: ${what} en version ${String(v)}, ce code lit la version ${FORMAT_VERSION}`);
  }
}

function codeOf(list: readonly string[], value: string, what: string): number {
  const i = list.indexOf(value);
  if (i < 0) throw new Error(`mapdata: valeur inconnue « ${value} » pour ${what}`);
  return i;
}

function allEqual(values: readonly number[], v: number): boolean {
  for (let i = 0; i < values.length; i++) if (values[i] !== v) return false;
  return true;
}

function strAt(str: readonly string[], i: number): string {
  const s = str[i];
  return typeof s === 'string' ? s : '';
}

interface StringTable { list: string[]; intern(s: string): number }

function createStringTable(): StringTable {
  const list: string[] = [''];
  const index = new Map<string, number>([['', 0]]);
  return {
    list,
    intern(s: string): number {
      let i = index.get(s);
      if (i === undefined) {
        i = list.length;
        list.push(s);
        index.set(s, i);
      }
      return i;
    },
  };
}

/**
 * Quantifie un anneau en unités entières relatives à (ox, oz), retire les sommets confondus et
 * la fermeture explicite, impose le sens demandé. Retourne null si l'anneau est dégénéré
 * (moins de 3 sommets distincts, coordonnée non finie ou aire nulle).
 */
function quantizeRing(ring: ArrayLike<number>, ox: number, oz: number, wantCCW: boolean): number[] | null {
  const n = ring.length >> 1;
  const q: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = quantize(ring[2 * i] - ox), z = quantize(ring[2 * i + 1] - oz);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const k = q.length;
    if (k >= 2 && q[k - 2] === x && q[k - 1] === z) continue;
    q.push(x, z);
  }
  while (q.length >= 4 && q[0] === q[q.length - 2] && q[1] === q[q.length - 1]) q.length -= 2;
  if (q.length < 6) return null;
  const area = ringSignedArea(q);
  if (area === 0) return null;
  return area > 0 === wantCCW ? q : reverseRing(q);
}

/** Quantifie une polyligne ; null s'il reste moins de 2 points distincts. */
function quantizeLine(points: ArrayLike<number>, ox: number, oz: number): number[] | null {
  const n = points.length >> 1;
  const q: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = quantize(points[2 * i] - ox), z = quantize(points[2 * i + 1] - oz);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const k = q.length;
    if (k >= 2 && q[k - 2] === x && q[k - 1] === z) continue;
    q.push(x, z);
  }
  return q.length >= 4 ? q : null;
}

/** Ajoute à `out` les sommets en deltas : le premier relatif à (fromX, fromZ), les suivants au précédent. */
function pushDeltas(out: number[], q: readonly number[], fromX: number, fromZ: number): void {
  let px = fromX, pz = fromZ;
  for (let i = 0; i < q.length; i += 2) {
    out.push(q[i] - px, q[i + 1] - pz);
    px = q[i];
    pz = q[i + 1];
  }
}

/**
 * Décode une colonne `xz` d'anneaux ou de polylignes en coordonnées monde (un seul Float32Array,
 * dans lequel chaque anneau est ensuite une vue).
 */
function decodeDeltaCoords(xz: readonly number[], len: readonly number[], ox: number, oz: number, what: string): Float32Array {
  const out = new Float32Array(xz.length);
  let p = 0;
  for (let r = 0; r < len.length; r++) {
    const end = p + len[r] * 2;
    if (end > xz.length) break;
    let x = 0, z = 0;
    for (; p < end; p += 2) {
      x += xz[p];
      z += xz[p + 1];
      out[p] = ox + x / UNITS_PER_METER;
      out[p + 1] = oz + z / UNITS_PER_METER;
    }
  }
  if (p !== xz.length) throw new Error(`mapdata: ${what} — colonnes len et xz incohérentes`);
  return out;
}

/**
 * Coordonnée d'un point de tuile en unités entières, ramenée dans [0, TILE_UNITS - 1].
 * NaN si le point est hors de la tuile de plus d'un décimètre.
 */
function quantizeInTile(v: number, origin: number): number {
  const q = quantize(v - origin);
  if (!(q >= -1 && q <= TILE_UNITS)) return NaN;
  return q < 0 ? 0 : q >= TILE_UNITS ? TILE_UNITS - 1 : q;
}

function note(dropped: string[] | undefined, msg: string): void {
  if (dropped !== undefined) dropped.push(msg);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 7. Tuiles : encodeTile / decodeTile
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Encode une tuile. Les coordonnées sont arrondies au décimètre ; le sens des anneaux est imposé
 * (extérieur antihoraire, trous horaires) ; les sommets confondus sont retirés. Un élément qui ne
 * peut pas être représenté (anneau dégénéré après arrondi, point hors de la tuile) est ÉCARTÉ et
 * signalé dans `dropped` si ce tableau est fourni. Une valeur d'énumération inconnue lève une erreur.
 */
export function encodeTile(tile: TileInput, dropped?: string[]): RawTile {
  const tx = tile.tx, tz = tile.tz;
  if (!Number.isInteger(tx) || !Number.isInteger(tz)) throw new Error('mapdata: indices de tuile non entiers');
  const ox = tx * TILE_SIZE, oz = tz * TILE_SIZE;
  const where = `tuile ${tileKey(tx, tz)}`;
  const strings = createStringTable();

  // Bâtiments
  let buildings: RawBuildings | undefined;
  {
    const id: number[] = [], h: number[] = [], len: number[] = [], xz: number[] = [];
    const kind: number[] = [], roof: number[] = [], style: number[] = [], base: number[] = [], lv: number[] = [];
    const rings: number[] = [], lm: number[] = [], name: number[] = [];
    let n = 0;
    for (const b of tile.buildings) {
      const outer = quantizeRing(b.outer, ox, oz, true);
      if (outer === null) {
        note(dropped, `${where} : bâtiment ${b.id} écarté (anneau extérieur dégénéré)`);
        continue;
      }
      const kindCode = codeOf(BUILDING_KINDS, b.kind, 'Building.kind');
      const roofCode = codeOf(ROOF_SHAPES, b.roof, 'Building.roof');
      const styleCode = codeOf(BUILDING_STYLES, b.style, 'Building.style');
      let nr = 1;
      len.push(outer.length >> 1);
      pushDeltas(xz, outer, 0, 0);
      for (const hole of b.holes) {
        const qh = quantizeRing(hole, ox, oz, false);
        if (qh === null) {
          note(dropped, `${where} : bâtiment ${b.id}, trou écarté (anneau dégénéré)`);
          continue;
        }
        nr++;
        len.push(qh.length >> 1);
        pushDeltas(xz, qh, 0, 0);
      }
      id.push(b.id);
      h.push(quantize(b.height));
      kind.push(kindCode);
      roof.push(roofCode);
      style.push(styleCode);
      base.push(quantize(b.baseY));
      lv.push(Math.round(b.levels) + 0);
      rings.push(nr);
      if (b.landmarkKey !== '') lm.push(n, strings.intern(b.landmarkKey));
      if (b.name !== '') name.push(n, strings.intern(b.name));
      n++;
    }
    if (n > 0) {
      buildings = { n, id, h, len, xz };
      if (!allEqual(kind, 0)) buildings.kind = kind;
      if (!allEqual(roof, 0)) buildings.roof = roof;
      if (!allEqual(style, 0)) buildings.style = style;
      if (!allEqual(base, 0)) buildings.base = base;
      if (!allEqual(lv, 0)) buildings.lv = lv;
      if (!allEqual(rings, 1)) buildings.rings = rings;
      if (lm.length > 0) buildings.lm = lm;
      if (name.length > 0) buildings.name = name;
    }
  }

  // Arêtes du graphe routier : triées, sans doublon
  let roads: number[] | undefined;
  if (tile.roadEdges.length > 0) {
    const sorted = Array.prototype.slice.call(tile.roadEdges) as number[];
    sorted.sort((p, q) => p - q);
    roads = [];
    for (let i = 0; i < sorted.length; i++) {
      if (!Number.isInteger(sorted[i]) || sorted[i] < 0) throw new Error(`mapdata: ${where} — indice d'arête invalide ${sorted[i]}`);
      if (i === 0 || sorted[i] !== sorted[i - 1]) roads.push(sorted[i]);
    }
  }

  // Surfaces
  let surfaces: RawSurfaces | undefined;
  {
    const kind: number[] = [], len: number[] = [], xz: number[] = [];
    const rings: number[] = [], name: number[] = [], y: number[] = [];
    let n = 0;
    for (const s of tile.surfaces) {
      const outer = quantizeRing(s.outer, ox, oz, true);
      if (outer === null) {
        note(dropped, `${where} : surface « ${s.kind} » n° ${n} écartée (anneau extérieur dégénéré)`);
        continue;
      }
      const kindCode = codeOf(MAP_SURFACE_KINDS, s.kind, 'Surface.kind');
      let nr = 1;
      len.push(outer.length >> 1);
      pushDeltas(xz, outer, 0, 0);
      for (const hole of s.holes) {
        const qh = quantizeRing(hole, ox, oz, false);
        if (qh === null) {
          note(dropped, `${where} : surface « ${s.kind} », trou écarté (anneau dégénéré)`);
          continue;
        }
        nr++;
        len.push(qh.length >> 1);
        pushDeltas(xz, qh, 0, 0);
      }
      kind.push(kindCode);
      rings.push(nr);
      if (s.name !== '') name.push(n, strings.intern(s.name));
      if (s.level !== null) y.push(n, quantize(s.level));
      n++;
    }
    if (n > 0) {
      surfaces = { n, kind, len, xz };
      if (!allEqual(rings, 1)) surfaces.rings = rings;
      if (name.length > 0) surfaces.name = name;
      if (y.length > 0) surfaces.y = y;
    }
  }

  // Barrières
  let barriers: RawBarriers | undefined;
  {
    const len: number[] = [], xz: number[] = [], kind: number[] = [], h: number[] = [];
    let n = 0;
    for (const b of tile.barriers) {
      const line = quantizeLine(b.points, ox, oz);
      if (line === null) {
        note(dropped, `${where} : barrière « ${b.kind} » écartée (moins de 2 points distincts)`);
        continue;
      }
      kind.push(codeOf(BARRIER_KINDS, b.kind, 'Barrier.kind'));
      h.push(quantize(b.height));
      len.push(line.length >> 1);
      pushDeltas(xz, line, 0, 0);
      n++;
    }
    if (n > 0) {
      barriers = { n, len, xz };
      if (!allEqual(kind, 0)) barriers.kind = kind;
      if (!allEqual(h, 20)) barriers.h = h;
    }
  }

  // Arbres
  let trees: RawTrees | undefined;
  {
    const t = tile.trees;
    const xz: number[] = [], h: number[] = [], r: number[] = [];
    for (let i = 0; i < t.count; i++) {
      const qx = quantizeInTile(t.x[i], ox), qz = quantizeInTile(t.z[i], oz);
      if (Number.isNaN(qx) || Number.isNaN(qz)) {
        note(dropped, `${where} : arbre n° ${i} écarté (hors de la tuile)`);
        continue;
      }
      xz.push(qx, qz);
      h.push(quantize(t.height[i]));
      r.push(quantize(t.crownRadius[i]));
    }
    if (h.length > 0) {
      trees = { n: h.length, xz };
      if (!allEqual(h, 100)) trees.h = h;
      if (!allEqual(r, 30)) trees.r = r;
    }
  }

  // Mobilier
  let furniture: RawFurniture | undefined;
  {
    const xz: number[] = [], kind: number[] = [], a: number[] = [];
    for (let i = 0; i < tile.furniture.length; i++) {
      const f = tile.furniture[i];
      const qx = quantizeInTile(f.x, ox), qz = quantizeInTile(f.z, oz);
      if (Number.isNaN(qx) || Number.isNaN(qz)) {
        note(dropped, `${where} : mobilier « ${f.kind} » n° ${i} écarté (hors de la tuile)`);
        continue;
      }
      xz.push(qx, qz);
      kind.push(codeOf(FURNITURE_KINDS, f.kind, 'FurnitureItem.kind'));
      a.push(encodeAngle(f.heading));
    }
    if (kind.length > 0) {
      furniture = { n: kind.length, xz };
      if (!allEqual(kind, 0)) furniture.kind = kind;
      if (!allEqual(a, 0)) furniture.a = a;
    }
  }

  // Feux
  let signals: RawSignals | undefined;
  {
    const xz: number[] = [], a: number[] = [], node: number[] = [];
    for (let i = 0; i < tile.signals.length; i++) {
      const s = tile.signals[i];
      const qx = quantizeInTile(s.x, ox), qz = quantizeInTile(s.z, oz);
      if (Number.isNaN(qx) || Number.isNaN(qz)) {
        note(dropped, `${where} : feu n° ${i} écarté (hors de la tuile)`);
        continue;
      }
      xz.push(qx, qz);
      a.push(encodeAngle(s.heading));
      node.push(Number.isInteger(s.node) && s.node >= 0 ? s.node : -1);
    }
    if (a.length > 0) {
      signals = { n: a.length, xz };
      if (!allEqual(a, 0)) signals.a = a;
      if (!allEqual(node, -1)) signals.node = node;
    }
  }

  // Entrées de métro
  let metro: RawMetro | undefined;
  {
    const xz: number[] = [], a: number[] = [], name: number[] = [], lines: number[] = [];
    for (let i = 0; i < tile.metroEntrances.length; i++) {
      const m = tile.metroEntrances[i];
      const qx = quantizeInTile(m.x, ox), qz = quantizeInTile(m.z, oz);
      if (Number.isNaN(qx) || Number.isNaN(qz)) {
        note(dropped, `${where} : entrée de métro « ${m.name} » écartée (hors de la tuile)`);
        continue;
      }
      xz.push(qx, qz);
      a.push(encodeAngle(m.heading));
      name.push(strings.intern(m.name));
      lines.push(strings.intern(m.lines));
    }
    if (a.length > 0) {
      metro = { n: a.length, xz };
      if (!allEqual(a, 0)) metro.a = a;
      if (!allEqual(name, 0)) metro.name = name;
      if (!allEqual(lines, 0)) metro.lines = lines;
    }
  }

  // Commerces
  let shops: RawShops | undefined;
  {
    const id: number[] = [], xz: number[] = [], a: number[] = [], w: number[] = [], cat: number[] = [], b: number[] = [];
    for (let i = 0; i < tile.shops.length; i++) {
      const s = tile.shops[i];
      const qx = quantizeInTile(s.x, ox), qz = quantizeInTile(s.z, oz);
      if (Number.isNaN(qx) || Number.isNaN(qz)) {
        note(dropped, `${where} : commerce ${s.id} écarté (hors de la tuile)`);
        continue;
      }
      id.push(s.id);
      xz.push(qx, qz);
      a.push(encodeAngle(s.heading));
      w.push(quantize(s.width));
      cat.push(codeOf(SHOP_CATEGORIES, s.category, 'Shop.category'));
      b.push(s.buildingId);
    }
    if (id.length > 0) {
      shops = { n: id.length, id, xz };
      if (!allEqual(a, 0)) shops.a = a;
      if (!allEqual(w, 40)) shops.w = w;
      if (!allEqual(cat, 0)) shops.cat = cat;
      if (!allEqual(b, 0)) shops.b = b;
    }
  }

  const raw: RawTile = { v: FORMAT_VERSION, tx, tz };
  if (strings.list.length > 1) raw.str = strings.list;
  if (buildings !== undefined) raw.buildings = buildings;
  if (roads !== undefined) raw.roads = roads;
  if (surfaces !== undefined) raw.surfaces = surfaces;
  if (barriers !== undefined) raw.barriers = barriers;
  if (trees !== undefined) raw.trees = trees;
  if (furniture !== undefined) raw.furniture = furniture;
  if (signals !== undefined) raw.signals = signals;
  if (metro !== undefined) raw.metro = metro;
  if (shops !== undefined) raw.shops = shops;
  return raw;
}

/** Décode en une passe les anneaux d'une couche de polygones ; appelle `emit` pour chaque polygone. */
function decodePolygons(
  n: number,
  ringsCol: readonly number[] | undefined,
  len: readonly number[],
  xz: readonly number[],
  ox: number,
  oz: number,
  what: string,
  emit: (i: number, outer: Float32Array, holes: Float32Array[]) => void,
): void {
  const coords = decodeDeltaCoords(xz, len, ox, oz, what);
  let ring = 0, pos = 0;
  for (let i = 0; i < n; i++) {
    const nr = ringsCol !== undefined ? ringsCol[i] : 1;
    if (!(nr >= 1) || ring + nr > len.length) throw new Error(`mapdata: ${what} — colonnes rings et len incohérentes`);
    let end = pos + len[ring] * 2;
    const outer = coords.subarray(pos, end);
    pos = end;
    ring++;
    const holes: Float32Array[] = [];
    for (let k = 1; k < nr; k++) {
      end = pos + len[ring] * 2;
      holes.push(coords.subarray(pos, end));
      pos = end;
      ring++;
    }
    emit(i, outer, holes);
  }
  if (ring !== len.length) throw new Error(`mapdata: ${what} — colonnes rings et len incohérentes`);
}

/**
 * Décode une tuile lue sur disque. Rapide : une passe par couche, aucune dépendance. Les colonnes
 * et couches inconnues sont ignorées, les colonnes absentes prennent leur valeur par défaut, un
 * code d'énumération inconnu devient la valeur d'indice 0. Lève une erreur si la version n'est pas
 * prise en charge ou si la structure est incohérente (voir validateRawTile pour un diagnostic).
 */
export function decodeTile(raw: RawTile): Tile {
  assertVersion(raw.v, 'tuile');
  const tile = createEmptyTile(raw.tx, raw.tz);
  const ox = raw.tx * TILE_SIZE, oz = raw.tz * TILE_SIZE;
  const str: readonly string[] = raw.str ?? NO_STRINGS;

  const rb = raw.buildings;
  if (rb !== undefined && rb.n > 0) {
    const out = tile.buildings;
    const kind = rb.kind, roof = rb.roof, style = rb.style, base = rb.base, lv = rb.lv;
    decodePolygons(rb.n, rb.rings, rb.len, rb.xz, ox, oz, 'bâtiments', (i, outer, holes) => {
      const height = rb.h[i] / UNITS_PER_METER;
      const levels = lv !== undefined ? lv[i] : 0;
      out.push({
        id: rb.id[i],
        kind: (kind !== undefined ? BUILDING_KINDS[kind[i]] : undefined) ?? BUILDING_KINDS[0],
        roof: (roof !== undefined ? ROOF_SHAPES[roof[i]] : undefined) ?? ROOF_SHAPES[0],
        style: (style !== undefined ? BUILDING_STYLES[style[i]] : undefined) ?? BUILDING_STYLES[0],
        baseY: base !== undefined ? base[i] / UNITS_PER_METER : 0,
        height,
        levels: levels > 0 ? levels : estimateLevels(height),
        outer,
        holes,
        landmarkKey: '',
        name: '',
      });
    });
    const lm = rb.lm;
    if (lm !== undefined) {
      for (let k = 0; k + 1 < lm.length; k += 2) {
        const b = out[lm[k]];
        if (b !== undefined) b.landmarkKey = strAt(str, lm[k + 1]);
      }
    }
    const name = rb.name;
    if (name !== undefined) {
      for (let k = 0; k + 1 < name.length; k += 2) {
        const b = out[name[k]];
        if (b !== undefined) b.name = strAt(str, name[k + 1]);
      }
    }
  }

  if (raw.roads !== undefined) tile.roadEdges = raw.roads.slice();

  const rs = raw.surfaces;
  if (rs !== undefined && rs.n > 0) {
    const out = tile.surfaces;
    decodePolygons(rs.n, rs.rings, rs.len, rs.xz, ox, oz, 'surfaces', (i, outer, holes) => {
      out.push({ kind: MAP_SURFACE_KINDS[rs.kind[i]] ?? MAP_SURFACE_KINDS[0], name: '', level: null, outer, holes });
    });
    const name = rs.name;
    if (name !== undefined) {
      for (let k = 0; k + 1 < name.length; k += 2) {
        const s = out[name[k]];
        if (s !== undefined) s.name = strAt(str, name[k + 1]);
      }
    }
    const y = rs.y;
    if (y !== undefined) {
      for (let k = 0; k + 1 < y.length; k += 2) {
        const s = out[y[k]];
        if (s !== undefined) s.level = y[k + 1] / UNITS_PER_METER;
      }
    }
  }

  const rw = raw.barriers;
  if (rw !== undefined && rw.n > 0) {
    if (rw.len.length !== rw.n) throw new Error('mapdata: barrières — colonne len incohérente');
    const coords = decodeDeltaCoords(rw.xz, rw.len, ox, oz, 'barrières');
    const kind = rw.kind, h = rw.h;
    let pos = 0;
    for (let i = 0; i < rw.n; i++) {
      const end = pos + rw.len[i] * 2;
      tile.barriers.push({
        kind: (kind !== undefined ? BARRIER_KINDS[kind[i]] : undefined) ?? BARRIER_KINDS[0],
        height: (h !== undefined ? h[i] : 20) / UNITS_PER_METER,
        points: coords.subarray(pos, end),
      });
      pos = end;
    }
  }

  const rt = raw.trees;
  if (rt !== undefined && rt.n > 0) {
    const n = rt.n, xz = rt.xz, h = rt.h, r = rt.r;
    if (xz.length !== n * 2) throw new Error('mapdata: arbres — colonne xz incohérente');
    const t = createTreeSet(n);
    for (let i = 0; i < n; i++) {
      t.x[i] = ox + xz[2 * i] / UNITS_PER_METER;
      t.z[i] = oz + xz[2 * i + 1] / UNITS_PER_METER;
      t.height[i] = (h !== undefined ? h[i] : 100) / UNITS_PER_METER;
      t.crownRadius[i] = (r !== undefined ? r[i] : 30) / UNITS_PER_METER;
    }
    tile.trees = t;
  }

  const rf = raw.furniture;
  if (rf !== undefined && rf.n > 0) {
    const xz = rf.xz, kind = rf.kind, a = rf.a;
    if (xz.length !== rf.n * 2) throw new Error('mapdata: mobilier — colonne xz incohérente');
    for (let i = 0; i < rf.n; i++) {
      tile.furniture.push({
        kind: (kind !== undefined ? FURNITURE_KINDS[kind[i]] : undefined) ?? FURNITURE_KINDS[0],
        x: ox + xz[2 * i] / UNITS_PER_METER,
        z: oz + xz[2 * i + 1] / UNITS_PER_METER,
        heading: a !== undefined ? decodeAngle(a[i]) : 0,
      });
    }
  }

  const rl = raw.signals;
  if (rl !== undefined && rl.n > 0) {
    const xz = rl.xz, a = rl.a, node = rl.node;
    if (xz.length !== rl.n * 2) throw new Error('mapdata: feux — colonne xz incohérente');
    for (let i = 0; i < rl.n; i++) {
      tile.signals.push({
        x: ox + xz[2 * i] / UNITS_PER_METER,
        z: oz + xz[2 * i + 1] / UNITS_PER_METER,
        heading: a !== undefined ? decodeAngle(a[i]) : 0,
        node: node !== undefined ? node[i] : -1,
      });
    }
  }

  const rm = raw.metro;
  if (rm !== undefined && rm.n > 0) {
    const xz = rm.xz, a = rm.a, name = rm.name, lines = rm.lines;
    if (xz.length !== rm.n * 2) throw new Error('mapdata: métro — colonne xz incohérente');
    for (let i = 0; i < rm.n; i++) {
      tile.metroEntrances.push({
        x: ox + xz[2 * i] / UNITS_PER_METER,
        z: oz + xz[2 * i + 1] / UNITS_PER_METER,
        heading: a !== undefined ? decodeAngle(a[i]) : 0,
        name: name !== undefined ? strAt(str, name[i]) : '',
        lines: lines !== undefined ? strAt(str, lines[i]) : '',
      });
    }
  }

  const rc = raw.shops;
  if (rc !== undefined && rc.n > 0) {
    const xz = rc.xz, a = rc.a, w = rc.w, cat = rc.cat, b = rc.b;
    if (xz.length !== rc.n * 2) throw new Error('mapdata: commerces — colonne xz incohérente');
    for (let i = 0; i < rc.n; i++) {
      tile.shops.push({
        id: rc.id[i],
        x: ox + xz[2 * i] / UNITS_PER_METER,
        z: oz + xz[2 * i + 1] / UNITS_PER_METER,
        heading: a !== undefined ? decodeAngle(a[i]) : 0,
        width: (w !== undefined ? w[i] : 40) / UNITS_PER_METER,
        category: (cat !== undefined ? SHOP_CATEGORIES[cat[i]] : undefined) ?? SHOP_CATEGORIES[0],
        buildingId: b !== undefined ? b[i] : 0,
      });
    }
  }

  return tile;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 8. Graphe routier global
// ─────────────────────────────────────────────────────────────────────────────────────

/** Écart toléré (m) entre une extrémité de polyligne et son nœud. */
const NODE_SNAP_TOLERANCE = 0.11;

/**
 * Encode le graphe routier. Les extrémités de chaque polyligne doivent coïncider avec les nœuds
 * a et b (à 11 cm près) : seuls les points intermédiaires sont écrits. Lève une erreur sinon.
 */
export function encodeRoadGraph(graph: RoadGraphInput): RawRoadGraph {
  const strings = createStringTable();
  const nodeCount = graph.nodes.length;

  const nxz: number[] = [], nflags: number[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const nd = graph.nodes[i];
    const qx = quantize(nd.x), qz = quantize(nd.z);
    if (!Number.isFinite(qx) || !Number.isFinite(qz)) throw new Error(`mapdata: nœud ${i} — coordonnées non finies`);
    nxz.push(qx, qz);
    nflags.push((nd.signal ? NODE_SIGNAL : 0) | (nd.crossing ? NODE_CROSSING : 0) | (nd.boundary ? NODE_BOUNDARY : 0));
  }

  const a: number[] = [], b: number[] = [], w: number[] = [], len: number[] = [], xz: number[] = [];
  const lf: number[] = [], lb: number[] = [], cls: number[] = [], flags: number[] = [], surf: number[] = [];
  const speed: number[] = [], sw: number[] = [], name: number[] = [], lm: number[] = [];
  for (let e = 0; e < graph.edges.length; e++) {
    const ed = graph.edges[e];
    if (!Number.isInteger(ed.a) || !Number.isInteger(ed.b) || ed.a < 0 || ed.b < 0 || ed.a >= nodeCount || ed.b >= nodeCount) {
      throw new Error(`mapdata: arête ${e} — nœuds ${ed.a} / ${ed.b} hors du graphe`);
    }
    const pts = ed.points;
    const np = pts.length >> 1;
    if (np < 2) throw new Error(`mapdata: arête ${e} — la polyligne a moins de 2 points`);
    const na = graph.nodes[ed.a], nb = graph.nodes[ed.b];
    if (Math.hypot(pts[0] - na.x, pts[1] - na.z) > NODE_SNAP_TOLERANCE || Math.hypot(pts[2 * np - 2] - nb.x, pts[2 * np - 1] - nb.z) > NODE_SNAP_TOLERANCE) {
      throw new Error(`mapdata: arête ${e} — les extrémités de la polyligne ne coïncident pas avec les nœuds ${ed.a} et ${ed.b}`);
    }
    // Points intermédiaires, sans doublon, en deltas depuis le nœud a.
    const ax = nxz[2 * ed.a], az = nxz[2 * ed.a + 1], bx = nxz[2 * ed.b], bz = nxz[2 * ed.b + 1];
    const mid: number[] = [];
    let px = ax, pz = az;
    for (let i = 1; i < np - 1; i++) {
      const qx = quantize(pts[2 * i]), qz = quantize(pts[2 * i + 1]);
      if (!Number.isFinite(qx) || !Number.isFinite(qz)) throw new Error(`mapdata: arête ${e} — coordonnées non finies`);
      if (qx === px && qz === pz) continue;
      mid.push(qx, qz);
      px = qx;
      pz = qz;
    }
    while (mid.length >= 2 && mid[mid.length - 2] === bx && mid[mid.length - 1] === bz) mid.length -= 2;
    a.push(ed.a);
    b.push(ed.b);
    w.push(quantize(ed.width));
    len.push(mid.length >> 1);
    pushDeltas(xz, mid, ax, az);
    lf.push(Math.round(ed.lanesForward) + 0);
    lb.push(Math.round(ed.lanesBackward) + 0);
    cls.push(codeOf(ROAD_CLASSES, ed.roadClass, 'RoadEdge.roadClass'));
    flags.push((ed.oneway ? EDGE_ONEWAY : 0) | (ed.bridge ? EDGE_BRIDGE : 0) | (ed.tunnel ? EDGE_TUNNEL : 0) | (ed.pedestrianOnly ? EDGE_PEDESTRIAN : 0));
    surf.push(codeOf(ROAD_SURFACES, ed.surface, 'RoadEdge.surface'));
    speed.push(Math.round(ed.speedLimit * 3.6) + 0);
    sw.push(quantize(ed.sidewalk));
    name.push(strings.intern(ed.name));
    if (ed.landmarkKey !== '') lm.push(e, strings.intern(ed.landmarkKey));
  }

  const rawNodes: RawRoadGraph['nodes'] = { n: nodeCount, xz: nxz };
  if (!allEqual(nflags, 0)) rawNodes.flags = nflags;
  const rawEdges: RawRoadGraph['edges'] = { n: a.length, a, b, w };
  if (!allEqual(len, 0)) {
    rawEdges.len = len;
    rawEdges.xz = xz;
  }
  if (!allEqual(lf, 1)) rawEdges.lf = lf;
  if (!allEqual(lb, 1)) rawEdges.lb = lb;
  if (!allEqual(cls, 0)) rawEdges.cls = cls;
  if (!allEqual(flags, 0)) rawEdges.flags = flags;
  if (!allEqual(surf, 0)) rawEdges.surf = surf;
  if (!allEqual(speed, DEFAULT_SPEED_KMH)) rawEdges.speed = speed;
  if (!allEqual(sw, 0)) rawEdges.sw = sw;
  if (!allEqual(name, 0)) rawEdges.name = name;
  if (lm.length > 0) rawEdges.lm = lm;
  return { v: FORMAT_VERSION, str: strings.list, nodes: rawNodes, edges: rawEdges };
}

/** Décode le graphe routier et calcule les champs dérivés (adjacence des nœuds, longueur des arêtes). */
export function decodeRoadGraph(raw: RawRoadGraph): RoadGraph {
  assertVersion(raw.v, 'graphe routier');
  const str: readonly string[] = raw.str ?? NO_STRINGS;
  const rn = raw.nodes, re = raw.edges;
  if (rn.xz.length !== rn.n * 2) throw new Error('mapdata: graphe routier — colonne xz des nœuds incohérente');

  const nodes: RoadNode[] = [];
  for (let i = 0; i < rn.n; i++) {
    const f = rn.flags !== undefined ? rn.flags[i] : 0;
    nodes.push({
      x: rn.xz[2 * i] / UNITS_PER_METER,
      z: rn.xz[2 * i + 1] / UNITS_PER_METER,
      signal: (f & NODE_SIGNAL) !== 0,
      crossing: (f & NODE_CROSSING) !== 0,
      boundary: (f & NODE_BOUNDARY) !== 0,
      edges: [],
    });
  }

  const edges: RoadEdge[] = [];
  const len = re.len, xz = re.xz ?? [];
  const lf = re.lf, lb = re.lb, cls = re.cls, flags = re.flags, surf = re.surf, speed = re.speed, sw = re.sw, name = re.name;
  let p = 0;
  for (let e = 0; e < re.n; e++) {
    const ia = re.a[e], ib = re.b[e];
    if (!(ia >= 0 && ia < rn.n && ib >= 0 && ib < rn.n)) throw new Error(`mapdata: graphe routier — arête ${e} : nœud hors du graphe`);
    const mid = len !== undefined ? len[e] : 0;
    if (p + mid * 2 > xz.length) throw new Error('mapdata: graphe routier — colonnes len et xz des arêtes incohérentes');
    const points = new Float32Array((mid + 2) * 2);
    let x = rn.xz[2 * ia], z = rn.xz[2 * ia + 1];
    points[0] = x / UNITS_PER_METER;
    points[1] = z / UNITS_PER_METER;
    for (let k = 1; k <= mid; k++, p += 2) {
      x += xz[p];
      z += xz[p + 1];
      points[2 * k] = x / UNITS_PER_METER;
      points[2 * k + 1] = z / UNITS_PER_METER;
    }
    points[2 * mid + 2] = rn.xz[2 * ib] / UNITS_PER_METER;
    points[2 * mid + 3] = rn.xz[2 * ib + 1] / UNITS_PER_METER;
    const f = flags !== undefined ? flags[e] : 0;
    edges.push({
      a: ia,
      b: ib,
      points,
      width: re.w[e] / UNITS_PER_METER,
      lanesForward: lf !== undefined ? lf[e] : 1,
      lanesBackward: lb !== undefined ? lb[e] : 1,
      oneway: (f & EDGE_ONEWAY) !== 0,
      roadClass: (cls !== undefined ? ROAD_CLASSES[cls[e]] : undefined) ?? ROAD_CLASSES[0],
      name: name !== undefined ? strAt(str, name[e]) : '',
      bridge: (f & EDGE_BRIDGE) !== 0,
      tunnel: (f & EDGE_TUNNEL) !== 0,
      surface: (surf !== undefined ? ROAD_SURFACES[surf[e]] : undefined) ?? ROAD_SURFACES[0],
      speedLimit: (speed !== undefined ? speed[e] : DEFAULT_SPEED_KMH) / 3.6,
      sidewalk: (sw !== undefined ? sw[e] : 0) / UNITS_PER_METER,
      pedestrianOnly: (f & EDGE_PEDESTRIAN) !== 0,
      landmarkKey: '',
      length: polylineLength(points),
    });
    nodes[ia].edges.push(e);
    if (ib !== ia) nodes[ib].edges.push(e);
  }
  if (p !== xz.length) throw new Error('mapdata: graphe routier — colonnes len et xz des arêtes incohérentes');
  const lm = re.lm;
  if (lm !== undefined) {
    for (let k = 0; k + 1 < lm.length; k += 2) {
      const ed = edges[lm[k]];
      if (ed !== undefined) ed.landmarkKey = strAt(str, lm[k + 1]);
    }
  }
  return { version: raw.v, nodes, edges };
}

/**
 * Pour chaque tuile, la liste croissante des arêtes qui la traversent, emprise comprise
 * (demi-chaussée + trottoir + `extraMargin`). C'est la règle de référence pour remplir
 * `Tile.roadEdges` ; validateMapData vérifie qu'elle est respectée.
 */
export function computeTileEdgeRefs(
  graph: { edges: readonly { points: ArrayLike<number>; width: number; sidewalk: number }[] },
  extraMargin = 0,
): Map<string, number[]> {
  const refs = new Map<string, number[]>();
  const rect: Bounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  for (let e = 0; e < graph.edges.length; e++) {
    const ed = graph.edges[e];
    const margin = ed.width / 2 + ed.sidewalk + extraMargin;
    const pts = ed.points;
    for (let i = 2; i + 1 < pts.length; i += 2) {
      const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
      const tx0 = Math.floor((Math.min(ax, bx) - margin) / TILE_SIZE), tx1 = Math.floor((Math.max(ax, bx) + margin) / TILE_SIZE);
      const tz0 = Math.floor((Math.min(az, bz) - margin) / TILE_SIZE), tz1 = Math.floor((Math.max(az, bz) + margin) / TILE_SIZE);
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          rect.minX = tx * TILE_SIZE - margin;
          rect.minZ = tz * TILE_SIZE - margin;
          rect.maxX = (tx + 1) * TILE_SIZE + margin;
          rect.maxZ = (tz + 1) * TILE_SIZE + margin;
          if (!segmentIntersectsRect(ax, az, bx, bz, rect)) continue;
          const key = tileKey(tx + 0, tz + 0);
          let list = refs.get(key);
          if (list === undefined) {
            list = [];
            refs.set(key, list);
          }
          if (list.length === 0 || list[list.length - 1] !== e) list.push(e);
        }
      }
    }
  }
  return refs;
}

/**
 * Composantes connexes du graphe, sens de circulation ignorés. `labels[i]` est le numéro de la
 * composante du nœud i (0 = celle du nœud 0).
 */
export function roadGraphComponents(graph: { nodes: readonly unknown[]; edges: readonly { a: number; b: number }[] }): { count: number; labels: Int32Array } {
  const n = graph.nodes.length;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  for (const ed of graph.edges) {
    const ra = find(ed.a), rb = find(ed.b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const labels = new Int32Array(n);
  const ids = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let id = ids.get(r);
    if (id === undefined) {
      id = ids.size;
      ids.set(r, id);
    }
    labels[i] = id;
  }
  return { count: ids.size, labels };
}

/** Indices des arêtes par nom de voie (les arêtes sans nom sont ignorées). */
export function edgesByName(graph: { edges: readonly { name: string }[] }): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (let e = 0; e < graph.edges.length; e++) {
    const name = graph.edges[e].name;
    if (name === '') continue;
    const list = out.get(name);
    if (list === undefined) out.set(name, [e]);
    else list.push(e);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 9. Relief
// ─────────────────────────────────────────────────────────────────────────────────────

/** Encode le relief. `scale` = mètres par unité entière (0.1 par défaut : décimètre). */
export function encodeTerrain(terrain: TerrainInput, scale = 1 / UNITS_PER_METER): RawTerrain {
  const { x0, z0, step, nx, nz } = terrain;
  if (!Number.isInteger(nx) || !Number.isInteger(nz) || nx < 1 || nz < 1 || !(step > 0) || !(scale > 0)) {
    throw new Error('mapdata: relief — dimensions invalides');
  }
  if (terrain.heights.length !== nx * nz) throw new Error('mapdata: relief — heights doit contenir nx·nz valeurs');
  const h: number[] = [];
  let prev = 0;
  for (let i = 0; i < nx * nz; i++) {
    const q = Math.round(terrain.heights[i] / scale) + 0;
    if (!Number.isFinite(q)) throw new Error(`mapdata: relief — altitude non finie à l'indice ${i}`);
    h.push(q - prev);
    prev = q;
  }
  return { v: FORMAT_VERSION, x0, z0, step, nx, nz, scale, h };
}

export function decodeTerrain(raw: RawTerrain): Terrain {
  assertVersion(raw.v, 'relief');
  const n = raw.nx * raw.nz;
  if (!(n >= 1) || raw.h.length !== n) throw new Error('mapdata: relief — h doit contenir nx·nz valeurs');
  const heights = new Float32Array(n);
  let acc = 0, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    acc += raw.h[i];
    const y = acc * raw.scale;
    heights[i] = y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x0: raw.x0, z0: raw.z0, step: raw.step, nx: raw.nx, nz: raw.nz, heights, minY, maxY };
}

/** Construit un relief en évaluant une fonction d'altitude à chaque nœud de la grille. */
export function terrainFromFunction(x0: number, z0: number, step: number, nx: number, nz: number, fn: (x: number, z: number) => number): Terrain {
  const heights = new Float32Array(nx * nz);
  let minY = Infinity, maxY = -Infinity;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const y = fn(x0 + ix * step, z0 + iz * step);
      heights[iz * nx + ix] = y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { x0, z0, step, nx, nz, heights, minY, maxY };
}

/**
 * Altitude du sol (m) au point (x, z) : interpolation bilinéaire entre les 4 nœuds voisins.
 * Hors de la grille, le point est ramené sur son bord. Aucune allocation.
 */
export function sampleTerrain(terrain: Terrain, x: number, z: number): number {
  const nx = terrain.nx, mx = nx - 1, mz = terrain.nz - 1;
  let fx = (x - terrain.x0) / terrain.step, fz = (z - terrain.z0) / terrain.step;
  if (fx < 0) fx = 0; else if (fx > mx) fx = mx;
  if (fz < 0) fz = 0; else if (fz > mz) fz = mz;
  let ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix >= mx) ix = mx > 0 ? mx - 1 : 0;
  if (iz >= mz) iz = mz > 0 ? mz - 1 : 0;
  const ix1 = ix < mx ? ix + 1 : ix, iz1 = iz < mz ? iz + 1 : iz;
  const ax = fx - ix, az = fz - iz;
  const h = terrain.heights;
  const top = h[iz * nx + ix] + (h[iz * nx + ix1] - h[iz * nx + ix]) * ax;
  const bottom = h[iz1 * nx + ix] + (h[iz1 * nx + ix1] - h[iz1 * nx + ix]) * ax;
  return top + (bottom - top) * az;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 10. Lieux nommés et monuments
// ─────────────────────────────────────────────────────────────────────────────────────

export function encodePlaces(places: readonly Place[]): RawPlaces {
  const name: string[] = [], xz: number[] = [], kind: number[] = [], r: number[] = [], imp: number[] = [], ref: string[] = [];
  let anyRef = false;
  for (const p of places) {
    name.push(p.name);
    xz.push(quantize(p.x), quantize(p.z));
    kind.push(codeOf(PLACE_KINDS, p.kind, 'Place.kind'));
    r.push(Math.round(p.radius) + 0);
    imp.push(Math.round(p.importance) + 0);
    ref.push(p.ref);
    if (p.ref !== '') anyRef = true;
  }
  const raw: RawPlaces = { v: FORMAT_VERSION, n: name.length, name, xz };
  if (!allEqual(kind, 0)) raw.kind = kind;
  if (!allEqual(r, 0)) raw.r = r;
  if (!allEqual(imp, 1)) raw.imp = imp;
  if (anyRef) raw.ref = ref;
  return raw;
}

export function decodePlaces(raw: RawPlaces): Place[] {
  assertVersion(raw.v, 'lieux');
  if (raw.xz.length !== raw.n * 2 || raw.name.length !== raw.n) throw new Error('mapdata: lieux — colonnes incohérentes');
  const out: Place[] = [];
  for (let i = 0; i < raw.n; i++) {
    out.push({
      name: raw.name[i],
      kind: (raw.kind !== undefined ? PLACE_KINDS[raw.kind[i]] : undefined) ?? PLACE_KINDS[0],
      x: raw.xz[2 * i] / UNITS_PER_METER,
      z: raw.xz[2 * i + 1] / UNITS_PER_METER,
      radius: raw.r !== undefined ? raw.r[i] : 0,
      importance: raw.imp !== undefined ? raw.imp[i] : 1,
      ref: raw.ref !== undefined ? strAt(raw.ref, i) : '',
    });
  }
  return out;
}

/** Encode les monuments. Une emprise dégénérée lève une erreur (un monument ne s'écarte pas en silence). */
export function encodeLandmarks(landmarks: readonly LandmarkInput[]): RawLandmarks {
  const key: string[] = [], name: string[] = [], xz: number[] = [], h: number[] = [], len: number[] = [], fxz: number[] = [];
  const a: number[] = [], y: number[] = [];
  for (const lm of landmarks) {
    const ring = quantizeRing(lm.footprint, 0, 0, true);
    if (ring === null) throw new Error(`mapdata: monument « ${lm.key} » — emprise dégénérée`);
    key.push(lm.key);
    name.push(lm.name);
    xz.push(quantize(lm.x), quantize(lm.z));
    h.push(quantize(lm.height));
    len.push(ring.length >> 1);
    pushDeltas(fxz, ring, 0, 0);
    a.push(encodeAngle(lm.heading));
    y.push(quantize(lm.y));
  }
  const raw: RawLandmarks = { v: FORMAT_VERSION, n: key.length, key, name, xz, h, len, fxz };
  if (!allEqual(a, 0)) raw.a = a;
  if (!allEqual(y, 0)) raw.y = y;
  return raw;
}

export function decodeLandmarks(raw: RawLandmarks): Landmark[] {
  assertVersion(raw.v, 'monuments');
  if (raw.xz.length !== raw.n * 2 || raw.len.length !== raw.n) throw new Error('mapdata: monuments — colonnes incohérentes');
  const coords = decodeDeltaCoords(raw.fxz, raw.len, 0, 0, 'monuments');
  const out: Landmark[] = [];
  let pos = 0;
  for (let i = 0; i < raw.n; i++) {
    const end = pos + raw.len[i] * 2;
    out.push({
      key: raw.key[i],
      name: raw.name[i],
      x: raw.xz[2 * i] / UNITS_PER_METER,
      z: raw.xz[2 * i + 1] / UNITS_PER_METER,
      y: raw.y !== undefined ? raw.y[i] / UNITS_PER_METER : 0,
      heading: raw.a !== undefined ? decodeAngle(raw.a[i]) : 0,
      height: raw.h[i] / UNITS_PER_METER,
      footprint: coords.subarray(pos, end),
    });
    pos = end;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 11. Manifeste et carte entière
// ─────────────────────────────────────────────────────────────────────────────────────

export interface ManifestParams {
  name: string;
  tiles: readonly TileIndex[];
  attribution: readonly Attribution[];
  /** Défaut : PARIS_BBOX. */
  bbox?: LonLatBox;
  /** Défaut : rectangle monde de `bbox`. */
  bounds?: Bounds;
  /** Défaut 0. */
  waterLevel?: number;
  /** Défaut ''. */
  generatedAt?: string;
}

/** Fabrique un manifeste complet (origine, projection, noms de fichiers) à partir de l'essentiel. */
export function createManifest(params: ManifestParams): Manifest {
  const bbox = params.bbox ?? PARIS_BBOX;
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    name: params.name,
    generatedAt: params.generatedAt ?? '',
    bbox: { west: bbox.west, south: bbox.south, east: bbox.east, north: bbox.north },
    origin: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
    projection: { mPerDegLon: M_PER_DEG_LON, mPerDegLat: M_PER_DEG_LAT },
    tileSize: TILE_SIZE,
    bounds: params.bounds ?? boundsOfBbox(bbox),
    waterLevel: params.waterLevel ?? 0,
    files: {
      roadGraph: MAP_FILES.roadGraph,
      places: MAP_FILES.places,
      landmarks: MAP_FILES.landmarks,
      terrain: MAP_FILES.terrain,
    },
    tiles: params.tiles.map((t) => ({ tx: t.tx, tz: t.tz, file: tilePath(t.tx, t.tz) })),
    attribution: params.attribution.map((a) => ({ ...a })),
  };
}

/**
 * Contrôle un manifeste lu sur disque et le retourne typé. Lève une erreur si ce n'est pas un
 * manifeste de ce format, si la version n'est pas prise en charge, ou si la projection ou la
 * taille de tuile diffèrent de celles de ce code.
 */
export function parseManifest(json: unknown): Manifest {
  const check = validateManifest(json);
  if (!check.ok) throw new Error(`mapdata: manifeste invalide — ${check.errors.join(' ; ')}`);
  return json as Manifest;
}

/** Mention d'attribution à afficher dans le jeu (une ligne par source). */
export function attributionText(manifest: Manifest): string {
  return manifest.attribution.map((a) => a.text).join('\n');
}

/** Encode une carte entière. Les éléments écartés par encodeTile sont signalés dans `dropped`. */
export function encodeMapData(data: Loose<Omit<MapData, 'roadGraph'>> & { roadGraph: RoadGraphInput }, dropped?: string[]): RawMapData {
  return {
    manifest: data.manifest as Manifest,
    tiles: data.tiles.map((t) => encodeTile(t, dropped)),
    roadGraph: encodeRoadGraph(data.roadGraph),
    places: encodePlaces(data.places as readonly Place[]),
    landmarks: encodeLandmarks(data.landmarks),
    terrain: encodeTerrain(data.terrain),
  };
}

/** Décode une carte entière (toutes les tuiles : réservé aux outils, aux tests et aux petites cartes). */
export function decodeMapData(raw: RawMapData): MapData {
  return {
    manifest: parseManifest(raw.manifest),
    tiles: raw.tiles.map(decodeTile),
    roadGraph: decodeRoadGraph(raw.roadGraph),
    places: decodePlaces(raw.places),
    landmarks: decodeLandmarks(raw.landmarks),
    terrain: decodeTerrain(raw.terrain),
  };
}

/** Liste des fichiers à écrire pour une carte, dans l'arborescence attendue par le jeu. */
export function mapDataFiles(raw: RawMapData): MapFile[] {
  const files: MapFile[] = [
    { path: MAP_FILES.manifest, data: raw.manifest },
    { path: raw.manifest.files.roadGraph, data: raw.roadGraph },
    { path: raw.manifest.files.places, data: raw.places },
    { path: raw.manifest.files.landmarks, data: raw.landmarks },
    { path: raw.manifest.files.terrain, data: raw.terrain },
  ];
  for (const t of raw.tiles) files.push({ path: tilePath(t.tx, t.tz), data: t });
  return files;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 12. Contrôles d'intégrité
// ─────────────────────────────────────────────────────────────────────────────────────
// Une ERREUR est une violation du format : le moteur peut mal se comporter. Un AVERTISSEMENT
// signale une donnée douteuse mais utilisable.

export interface ValidationResult {
  /** Vrai s'il n'y a aucune erreur (les avertissements n'empêchent pas). */
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Contexte facultatif pour contrôler les références d'une tuile vers les fichiers globaux. */
export interface TileValidationContext {
  /** Nombre d'arêtes du graphe routier. */
  edgeCount?: number;
  /** Nombre de nœuds du graphe routier. */
  nodeCount?: number;
  /** Clés des monuments connus. */
  landmarkKeys?: ReadonlySet<string>;
}

/** Nombre maximal de messages conservés par catégorie (le total reste compté). */
const MAX_MESSAGES = 200;
/** Écart toléré (m) entre un point et sa tuile, dû à l'arrondi au décimètre. */
const TILE_EPSILON = 0.051;
/** Distance maximale (m) entre un commerce et la façade de son bâtiment. */
export const SHOP_FACADE_TOLERANCE = 1.5;
/** Débord (m) au-delà duquel on conseille de découper une surface ou une barrière. */
const CLIP_ADVICE_OVERHANG = 64;

interface Collector {
  error(msg: string): void;
  warn(msg: string): void;
  merge(prefix: string, r: ValidationResult): void;
  done(): ValidationResult;
}

function createCollector(): Collector {
  const errors: string[] = [], warnings: string[] = [];
  let errorCount = 0, warningCount = 0;
  return {
    error(msg: string): void {
      errorCount++;
      if (errors.length < MAX_MESSAGES) errors.push(msg);
    },
    warn(msg: string): void {
      warningCount++;
      if (warnings.length < MAX_MESSAGES) warnings.push(msg);
    },
    merge(prefix: string, r: ValidationResult): void {
      for (const m of r.errors) this.error(prefix + m);
      for (const m of r.warnings) this.warn(prefix + m);
    },
    done(): ValidationResult {
      if (errorCount > errors.length) errors.push(`… et ${errorCount - errors.length} autre(s) erreur(s)`);
      if (warningCount > warnings.length) warnings.push(`… et ${warningCount - warnings.length} autre(s) avertissement(s)`);
      return { ok: errorCount === 0, errors, warnings };
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// ── manifeste ──

export function validateManifest(json: unknown): ValidationResult {
  const c = createCollector();
  if (!isRecord(json)) {
    c.error("le manifeste n'est pas un objet");
    return c.done();
  }
  if (json.format !== FORMAT_NAME) c.error(`format « ${String(json.format)} », « ${FORMAT_NAME} » attendu`);
  if (json.version !== FORMAT_VERSION) c.error(`version ${String(json.version)}, ce code lit la version ${FORMAT_VERSION}`);
  if (typeof json.name !== 'string' || json.name === '') c.error('name absent');
  if (typeof json.generatedAt !== 'string') c.error('generatedAt absent');
  if (json.tileSize !== TILE_SIZE) c.error(`tileSize ${String(json.tileSize)}, ${TILE_SIZE} attendu`);
  const origin = json.origin;
  if (!isRecord(origin) || origin.lat !== ORIGIN_LAT || origin.lon !== ORIGIN_LON) c.error("origin diffère de l'origine du jeu (obélisque de la Concorde)");
  const proj = json.projection;
  if (!isRecord(proj) || proj.mPerDegLon !== M_PER_DEG_LON || proj.mPerDegLat !== M_PER_DEG_LAT) c.error('projection diffère de celle du jeu');
  const bbox = json.bbox;
  if (!isRecord(bbox) || !isFiniteNumber(bbox.west) || !isFiniteNumber(bbox.east) || !isFiniteNumber(bbox.south) || !isFiniteNumber(bbox.north)) {
    c.error('bbox absente ou incomplète');
  } else if (!(bbox.west < bbox.east && bbox.south < bbox.north)) {
    c.error('bbox vide ou inversée');
  }
  const bounds = json.bounds;
  if (!isRecord(bounds) || !isFiniteNumber(bounds.minX) || !isFiniteNumber(bounds.maxX) || !isFiniteNumber(bounds.minZ) || !isFiniteNumber(bounds.maxZ)) {
    c.error('bounds absent ou incomplet');
  } else if (!(bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ)) {
    c.error('bounds vide ou inversé');
  }
  if (!isFiniteNumber(json.waterLevel)) c.error('waterLevel absent');
  const files = json.files;
  if (!isRecord(files)) {
    c.error('files absent');
  } else {
    for (const k of ['roadGraph', 'places', 'landmarks', 'terrain']) {
      if (typeof files[k] !== 'string' || files[k] === '') c.error(`files.${k} absent`);
    }
  }
  const tiles = json.tiles;
  if (!Array.isArray(tiles)) {
    c.error("tiles n'est pas un tableau");
  } else {
    const seen = new Set<string>();
    for (let i = 0; i < tiles.length; i++) {
      const t: unknown = tiles[i];
      if (!isRecord(t) || !Number.isInteger(t.tx) || !Number.isInteger(t.tz) || typeof t.file !== 'string' || t.file === '') {
        c.error(`tiles[${i}] : il faut tx, tz entiers et file`);
        continue;
      }
      const key = tileKey(t.tx as number, t.tz as number);
      if (seen.has(key)) c.error(`tiles[${i}] : tuile ${key} en double`);
      seen.add(key);
    }
  }
  const attribution = json.attribution;
  if (!Array.isArray(attribution) || attribution.length === 0) {
    c.error('attribution absente : chaque source doit être créditée');
  } else {
    for (let i = 0; i < attribution.length; i++) {
      const a: unknown = attribution[i];
      if (!isRecord(a) || typeof a.source !== 'string' || typeof a.license !== 'string' || typeof a.text !== 'string' || a.text === '') {
        c.error(`attribution[${i}] : il faut source, license et text`);
      }
    }
  }
  return c.done();
}

// ── tuile brute ──

/** Colonne d'entiers dans [min, max]. `length` < 0 = longueur libre. Retourne la colonne si elle est saine. */
function checkIntColumn(c: Collector, where: string, value: unknown, length: number, min: number, max: number, required: boolean): number[] | undefined {
  if (value === undefined) {
    if (required) c.error(`${where} : colonne absente`);
    return undefined;
  }
  if (!Array.isArray(value)) {
    c.error(`${where} : n'est pas un tableau`);
    return undefined;
  }
  if (length >= 0 && value.length !== length) {
    c.error(`${where} : ${value.length} valeurs, ${length} attendues`);
    return undefined;
  }
  for (let i = 0; i < value.length; i++) {
    const v: unknown = value[i];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      c.error(`${where}[${i}] : ${String(v)} n'est pas un entier de [${min}, ${max}]`);
      return undefined;
    }
  }
  return value as number[];
}

/** Colonne de codes d'énumération : un code au-delà de la liste connue n'est qu'un avertissement. */
function checkCodeColumn(c: Collector, where: string, value: unknown, length: number, list: readonly string[], required: boolean): void {
  const col = checkIntColumn(c, where, value, length, 0, 65535, required);
  if (col === undefined) return;
  for (let i = 0; i < col.length; i++) {
    if (col[i] >= list.length) {
      c.warn(`${where}[${i}] : code ${col[i]} inconnu de cette version (lu comme « ${list[0]} »)`);
      return;
    }
  }
}

/** Colonne creuse : paires [indice, valeur], indices strictement croissants dans [0, n[. */
function checkPairs(c: Collector, where: string, value: unknown, n: number, min: number, max: number): void {
  const col = checkIntColumn(c, where, value, -1, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, false);
  if (col === undefined) return;
  if (col.length % 2 !== 0) {
    c.error(`${where} : nombre impair de valeurs`);
    return;
  }
  let prev = -1;
  for (let k = 0; k < col.length; k += 2) {
    if (col[k] <= prev || col[k] >= n) {
      c.error(`${where} : indice ${col[k]} hors de [0, ${n}[ ou non croissant`);
      return;
    }
    prev = col[k];
    if (col[k + 1] < min || col[k + 1] > max) {
      c.error(`${where} : valeur ${col[k + 1]} hors de [${min}, ${max}]`);
      return;
    }
  }
}

/** Colonnes rings / len / xz d'une couche d'anneaux ou de polylignes. */
function checkRingColumns(c: Collector, where: string, n: number, ringsV: unknown, lenV: unknown, xzV: unknown, minLen: number): void {
  let total = n;
  if (ringsV !== undefined) {
    const rings = checkIntColumn(c, `${where}.rings`, ringsV, n, 1, 100000, false);
    if (rings === undefined) return;
    total = 0;
    for (let i = 0; i < n; i++) total += rings[i];
  }
  const len = checkIntColumn(c, `${where}.len`, lenV, total, minLen, 1000000, true);
  if (len === undefined) return;
  let points = 0;
  for (let i = 0; i < len.length; i++) points += len[i];
  const xz = checkIntColumn(c, `${where}.xz`, xzV, points * 2, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, true);
  if (xz === undefined) return;
  const lo = -MAX_OVERHANG * UNITS_PER_METER, hi = TILE_UNITS + MAX_OVERHANG * UNITS_PER_METER;
  let p = 0;
  for (let r = 0; r < len.length; r++) {
    let x = 0, z = 0;
    for (let k = 0; k < len[r]; k++, p += 2) {
      x += xz[p];
      z += xz[p + 1];
      if (x < lo || x > hi || z < lo || z > hi) {
        c.error(`${where} : anneau ${r} à plus de ${MAX_OVERHANG} m de la tuile`);
        return;
      }
    }
  }
}

function checkPointColumn(c: Collector, where: string, value: unknown, n: number): void {
  checkIntColumn(c, where, value, n * 2, 0, TILE_UNITS - 1, true);
}

/** Lit le champ `n` d'une couche ; -1 si la couche est inutilisable. */
function layerCount(c: Collector, where: string, layer: unknown): number {
  if (!isRecord(layer)) {
    c.error(`${where} : n'est pas un objet`);
    return -1;
  }
  const n = layer.n;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    c.error(`${where}.n : entier ≥ 0 attendu`);
    return -1;
  }
  return n;
}

/**
 * Contrôle la STRUCTURE d'une tuile telle que lue sur disque (avant décodage) : version, types,
 * longueurs de colonnes, entiers, bornes, références à la table de chaînes.
 */
export function validateRawTile(raw: unknown): ValidationResult {
  const c = createCollector();
  if (!isRecord(raw)) {
    c.error("la tuile n'est pas un objet");
    return c.done();
  }
  if (raw.v !== FORMAT_VERSION) c.error(`v = ${String(raw.v)}, ce code lit la version ${FORMAT_VERSION}`);
  if (!Number.isInteger(raw.tx) || !Number.isInteger(raw.tz)) c.error('tx et tz doivent être entiers');

  let strCount = 1;
  if (raw.str !== undefined) {
    const str = raw.str;
    if (!Array.isArray(str) || str[0] !== '' || !str.every((s) => typeof s === 'string')) {
      c.error("str : tableau de chaînes attendu, avec str[0] === ''");
    } else {
      strCount = str.length;
      if (new Set(str).size !== str.length) c.warn('str : chaînes en double');
    }
  }
  const maxInt = Number.MAX_SAFE_INTEGER;

  if (raw.buildings !== undefined) {
    const L = raw.buildings, w = 'buildings', n = layerCount(c, w, L);
    if (n >= 0 && isRecord(L)) {
      checkIntColumn(c, `${w}.id`, L.id, n, 1, maxInt, true);
      checkIntColumn(c, `${w}.h`, L.h, n, 1, 5000, true);
      checkCodeColumn(c, `${w}.kind`, L.kind, n, BUILDING_KINDS, false);
      checkCodeColumn(c, `${w}.roof`, L.roof, n, ROOF_SHAPES, false);
      checkCodeColumn(c, `${w}.style`, L.style, n, BUILDING_STYLES, false);
      checkIntColumn(c, `${w}.base`, L.base, n, -1000, 3000, false);
      checkIntColumn(c, `${w}.lv`, L.lv, n, 0, 150, false);
      checkRingColumns(c, w, n, L.rings, L.len, L.xz, 3);
      checkPairs(c, `${w}.lm`, L.lm, n, 1, strCount - 1);
      checkPairs(c, `${w}.name`, L.name, n, 1, strCount - 1);
    }
  }
  if (raw.roads !== undefined) {
    const roads = checkIntColumn(c, 'roads', raw.roads, -1, 0, maxInt, false);
    if (roads !== undefined) {
      for (let i = 1; i < roads.length; i++) {
        if (roads[i] <= roads[i - 1]) {
          c.error('roads : indices non strictement croissants');
          break;
        }
      }
    }
  }
  if (raw.surfaces !== undefined) {
    const L = raw.surfaces, w = 'surfaces', n = layerCount(c, w, L);
    if (n >= 0 && isRecord(L)) {
      checkCodeColumn(c, `${w}.kind`, L.kind, n, MAP_SURFACE_KINDS, true);
      checkRingColumns(c, w, n, L.rings, L.len, L.xz, 3);
      checkPairs(c, `${w}.name`, L.name, n, 1, strCount - 1);
      checkPairs(c, `${w}.y`, L.y, n, -1000, 3000);
    }
  }
  if (raw.barriers !== undefined) {
    const L = raw.barriers, w = 'barriers', n = layerCount(c, w, L);
    if (n >= 0 && isRecord(L)) {
      checkRingColumns(c, w, n, undefined, L.len, L.xz, 2);
      checkCodeColumn(c, `${w}.kind`, L.kind, n, BARRIER_KINDS, false);
      checkIntColumn(c, `${w}.h`, L.h, n, 0, 500, false);
    }
  }
  if (raw.trees !== undefined) {
    const L = raw.trees, w = 'trees', n = layerCount(c, w, L);
    if (n >= 0 && isRecord(L)) {
      checkPointColumn(c, `${w}.xz`, L.xz, n);
      checkIntColumn(c, `${w}.h`, L.h, n, 1, 800, false);
      checkIntColumn(c, `${w}.r`, L.r, n, 1, 300, false);
    }
  }
  if (raw.furniture !== undefined) {
    const L = raw.furniture, w = 'furniture', n = layerCount(c, w, L);
    if (n >= 0 && isRecord(L)) {
      checkPointColumn(c, `${w}.xz`, L.xz, n);
      checkCodeColumn(c, `${w}.kind`, L.kind, n, FURNITURE_KINDS, false);
      checkIntColumn(c, `${w}.a`, L.a, n, 0, ANGLE_UNITS - 1, false);
    }
  }
  if (raw.signals !== undefined) {
    const L = raw.signals, w = 'signals', n = layerCount(c, w, L);
    if (n >= 0 && isRecord(L)) {
      checkPointColumn(c, `${w}.xz`, L.xz, n);
      checkIntColumn(c, `${w}.a`, L.a, n, 0, ANGLE_UNITS - 1, false);
      checkIntColumn(c, `${w}.node`, L.node, n, -1, maxInt, false);
    }
  }
  if (raw.metro !== undefined) {
    const L = raw.metro, w = 'metro', n = layerCount(c, w, L);
    if (n >= 0 && isRecord(L)) {
      checkPointColumn(c, `${w}.xz`, L.xz, n);
      checkIntColumn(c, `${w}.a`, L.a, n, 0, ANGLE_UNITS - 1, false);
      checkIntColumn(c, `${w}.name`, L.name, n, 0, strCount - 1, false);
      checkIntColumn(c, `${w}.lines`, L.lines, n, 0, strCount - 1, false);
    }
  }
  if (raw.shops !== undefined) {
    const L = raw.shops, w = 'shops', n = layerCount(c, w, L);
    if (n >= 0 && isRecord(L)) {
      checkIntColumn(c, `${w}.id`, L.id, n, 1, maxInt, true);
      checkPointColumn(c, `${w}.xz`, L.xz, n);
      checkIntColumn(c, `${w}.a`, L.a, n, 0, ANGLE_UNITS - 1, false);
      checkIntColumn(c, `${w}.w`, L.w, n, 1, 1000, false);
      checkCodeColumn(c, `${w}.cat`, L.cat, n, SHOP_CATEGORIES, false);
      checkIntColumn(c, `${w}.b`, L.b, n, 0, maxInt, false);
    }
  }
  return c.done();
}

// ── tuile décodée ──

function allFinite(values: ArrayLike<number>): boolean {
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return false;
  return true;
}

/** Contrôle un anneau décodé. Retourne false si l'anneau est inutilisable. */
function checkRing(c: Collector, where: string, ring: ArrayLike<number>, wantCCW: boolean): boolean {
  const n = ring.length >> 1;
  if (ring.length % 2 !== 0 || n < 3) {
    c.error(`${where} : un anneau a au moins 3 sommets (${ring.length} nombres reçus)`);
    return false;
  }
  if (!allFinite(ring)) {
    c.error(`${where} : coordonnée non finie`);
    return false;
  }
  const area = ringSignedArea(ring);
  if (Math.abs(area) < 0.005) {
    c.error(`${where} : aire nulle`);
    return false;
  }
  if (area > 0 !== wantCCW) {
    c.error(`${where} : mauvais sens (${wantCCW ? 'antihoraire' : 'horaire'} attendu vu de dessus)`);
    return false;
  }
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (Math.abs(ring[2 * i] - ring[2 * j]) < 0.01 && Math.abs(ring[2 * i + 1] - ring[2 * j + 1]) < 0.01) {
      c.warn(`${where} : sommets consécutifs confondus`);
      break;
    }
  }
  if (ringSelfIntersects(ring)) c.warn(`${where} : l'anneau se recoupe`);
  return true;
}

/** Débord (m) d'une suite de points hors du rectangle (0 si tout est dedans). */
function overhang(points: ArrayLike<number>, rect: Bounds): number {
  const b = ringBounds(points);
  return Math.max(0, rect.minX - b.minX, b.maxX - rect.maxX, rect.minZ - b.minZ, b.maxZ - rect.maxZ);
}

function inTile(x: number, z: number, rect: Bounds): boolean {
  return x >= rect.minX - TILE_EPSILON && x < rect.maxX + TILE_EPSILON && z >= rect.minZ - TILE_EPSILON && z < rect.maxZ + TILE_EPSILON;
}

/**
 * Distance (m) du commerce au côté de façade le plus proche et écart (rad) entre son cap et la
 * normale sortante de ce côté. Écrit le résultat dans facadeDist / facadeAngle.
 */
let facadeDist = 0;
let facadeAngle = 0;
function measureFacade(shop: { x: number; z: number; heading: number }, building: { outer: ArrayLike<number>; holes: readonly ArrayLike<number>[] }): void {
  let best = Infinity, bestAngle = Math.PI;
  const sx = Math.sin(shop.heading), sz = Math.cos(shop.heading);
  for (let r = -1; r < building.holes.length; r++) {
    const ring = r < 0 ? building.outer : building.holes[r];
    const n = ring.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = ring[2 * j], az = ring[2 * j + 1], bx = ring[2 * i], bz = ring[2 * i + 1];
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      if (l2 === 0) continue;
      let t = ((shop.x - ax) * dx + (shop.z - az) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(shop.x - (ax + dx * t), shop.z - (az + dz * t));
      // Normale sortante (-dz, dx) normalisée, comparée au cap du commerce.
      const l = Math.sqrt(l2);
      const cos = (-dz * sx + dx * sz) / l;
      const angle = Math.acos(cos > 1 ? 1 : cos < -1 ? -1 : cos);
      if (d < best - 0.05 || (d < best + 0.05 && angle < bestAngle)) {
        best = Math.min(best, d);
        bestAngle = angle;
      }
    }
  }
  facadeDist = best;
  facadeAngle = bestAngle;
}

function checkShopFacade(c: Collector, where: string, shop: { x: number; z: number; heading: number }, building: { outer: ArrayLike<number>; holes: readonly ArrayLike<number>[] }): void {
  measureFacade(shop, building);
  if (facadeDist > SHOP_FACADE_TOLERANCE) {
    c.error(`${where} : à ${facadeDist.toFixed(1)} m de la façade de son bâtiment (maximum ${SHOP_FACADE_TOLERANCE} m)`);
  } else if (facadeAngle > Math.PI / 4) {
    c.warn(`${where} : le cap s'écarte de ${Math.round((facadeAngle * 180) / Math.PI)}° de la normale sortante de la façade`);
  }
}

/**
 * Contrôle les INVARIANTS d'une tuile décodée (ou d'une tuile construite par les outils, avant
 * encodage) : sens et simplicité des anneaux, bornes, appartenance à la tuile, identifiants
 * uniques, références. Le contexte permet de contrôler les références vers les fichiers globaux.
 */
export function validateTile(tile: TileInput, ctx: TileValidationContext = {}): ValidationResult {
  const c = createCollector();
  if (tile.version !== FORMAT_VERSION) c.error(`version ${String(tile.version)}, ${FORMAT_VERSION} attendue`);
  if (!Number.isInteger(tile.tx) || !Number.isInteger(tile.tz)) {
    c.error('tx et tz doivent être entiers');
    return c.done();
  }
  const rect = tileBounds(tile.tx, tile.tz);
  let clipAdvice = 0;

  // Bâtiments
  const buildingById = new Map<number, Loose<Building>>();
  for (let i = 0; i < tile.buildings.length; i++) {
    const b = tile.buildings[i];
    const w = `bâtiment ${b.id} (n° ${i})`;
    if (!Number.isSafeInteger(b.id) || b.id <= 0) c.error(`${w} : identifiant entier > 0 attendu`);
    else if (buildingById.has(b.id)) c.error(`${w} : identifiant en double dans la tuile`);
    else buildingById.set(b.id, b);
    if (!(BUILDING_KINDS as readonly string[]).includes(b.kind)) c.error(`${w} : type « ${b.kind} » inconnu`);
    if (!(ROOF_SHAPES as readonly string[]).includes(b.roof)) c.error(`${w} : toit « ${b.roof} » inconnu`);
    if (!(BUILDING_STYLES as readonly string[]).includes(b.style)) c.error(`${w} : style « ${b.style} » inconnu`);
    if (!Number.isFinite(b.baseY) || b.baseY < -100 || b.baseY > 300) c.error(`${w} : altitude de base ${b.baseY} invraisemblable`);
    if (!(b.height > 0) || b.height > 500) c.error(`${w} : hauteur ${b.height} hors de ]0, 500] m`);
    else if (b.height > 120 && b.landmarkKey === '') c.warn(`${w} : hauteur ${b.height} m sans monument associé`);
    if (!Number.isInteger(b.levels) || b.levels < 1) c.error(`${w} : niveaux ${b.levels}, entier ≥ 1 attendu`);
    if (typeof b.landmarkKey !== 'string' || typeof b.name !== 'string') c.error(`${w} : landmarkKey et name doivent être des chaînes`);
    else if (b.landmarkKey !== '' && ctx.landmarkKeys !== undefined && !ctx.landmarkKeys.has(b.landmarkKey)) {
      c.error(`${w} : monument « ${b.landmarkKey} » absent de landmarks.json`);
    }
    if (!checkRing(c, `${w}, anneau extérieur`, b.outer, true)) continue;
    const bb = ringBounds(b.outer);
    if (!inTile((bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2, rect)) c.error(`${w} : le centre de la boîte englobante est hors de la tuile`);
    if (overhang(b.outer, rect) > MAX_OVERHANG) c.error(`${w} : déborde de plus de ${MAX_OVERHANG} m`);
    for (let k = 0; k < b.holes.length; k++) {
      const hole = b.holes[k];
      if (checkRing(c, `${w}, trou ${k}`, hole, false) && !pointInRing(b.outer, hole[0], hole[1])) {
        const hb = ringBounds(hole);
        if (hb.minX < bb.minX - 0.1 || hb.maxX > bb.maxX + 0.1 || hb.minZ < bb.minZ - 0.1 || hb.maxZ > bb.maxZ + 0.1) c.warn(`${w}, trou ${k} : sort de l'anneau extérieur`);
      }
    }
  }

  // Arêtes référencées
  for (let i = 0; i < tile.roadEdges.length; i++) {
    const e = tile.roadEdges[i];
    if (!Number.isInteger(e) || e < 0) c.error(`roadEdges[${i}] : indice ${e} invalide`);
    else if (ctx.edgeCount !== undefined && e >= ctx.edgeCount) c.error(`roadEdges[${i}] : arête ${e} absente du graphe (${ctx.edgeCount} arêtes)`);
    if (i > 0 && e <= tile.roadEdges[i - 1]) c.error(`roadEdges[${i}] : indices non strictement croissants`);
  }

  // Surfaces
  for (let i = 0; i < tile.surfaces.length; i++) {
    const s = tile.surfaces[i];
    const w = `surface « ${s.kind} » n° ${i}`;
    if (!(MAP_SURFACE_KINDS as readonly string[]).includes(s.kind)) c.error(`${w} : type inconnu`);
    if (typeof s.name !== 'string') c.error(`${w} : name doit être une chaîne`);
    if (s.level !== null && (!Number.isFinite(s.level) || s.level < -100 || s.level > 300)) c.error(`${w} : altitude imposée ${String(s.level)} invraisemblable`);
    if (!checkRing(c, `${w}, anneau extérieur`, s.outer, true)) continue;
    const over = overhang(s.outer, rect);
    if (over > MAX_OVERHANG) c.error(`${w} : déborde de plus de ${MAX_OVERHANG} m`);
    else if (over > CLIP_ADVICE_OVERHANG) clipAdvice++;
    for (let k = 0; k < s.holes.length; k++) checkRing(c, `${w}, trou ${k}`, s.holes[k], false);
  }

  // Barrières
  for (let i = 0; i < tile.barriers.length; i++) {
    const b = tile.barriers[i];
    const w = `barrière « ${b.kind} » n° ${i}`;
    if (!(BARRIER_KINDS as readonly string[]).includes(b.kind)) c.error(`${w} : type inconnu`);
    if (!Number.isFinite(b.height) || b.height < 0 || b.height > 50) c.error(`${w} : hauteur ${b.height} hors de [0, 50] m`);
    if (b.points.length % 2 !== 0 || b.points.length < 4 || !allFinite(b.points)) {
      c.error(`${w} : polyligne d'au moins 2 points finis attendue`);
      continue;
    }
    if (polylineLength(b.points) < 0.05) c.error(`${w} : longueur nulle`);
    const over = overhang(b.points, rect);
    if (over > MAX_OVERHANG) c.error(`${w} : déborde de plus de ${MAX_OVERHANG} m`);
    else if (over > CLIP_ADVICE_OVERHANG) clipAdvice++;
  }
  if (clipAdvice > 0) {
    c.warn(`${clipAdvice} surface(s) ou barrière(s) débordent de plus de ${CLIP_ADVICE_OVERHANG} m : découpage par tuile conseillé (clipRingToRect, clipPolylineToRect)`);
  }

  // Arbres
  const t = tile.trees;
  if (!Number.isInteger(t.count) || t.count < 0 || t.x.length !== t.count || t.z.length !== t.count || t.height.length !== t.count || t.crownRadius.length !== t.count) {
    c.error('arbres : count et longueurs des colonnes incohérents');
  } else {
    for (let i = 0; i < t.count; i++) {
      if (!inTile(t.x[i], t.z[i], rect)) c.error(`arbre n° ${i} : hors de la tuile`);
      if (!(t.height[i] > 0) || t.height[i] > 80) c.error(`arbre n° ${i} : hauteur ${t.height[i]} hors de ]0, 80] m`);
      if (!(t.crownRadius[i] > 0) || t.crownRadius[i] > 30) c.error(`arbre n° ${i} : rayon de couronne ${t.crownRadius[i]} hors de ]0, 30] m`);
    }
  }

  // Mobilier, feux, métro
  for (let i = 0; i < tile.furniture.length; i++) {
    const f = tile.furniture[i];
    const w = `mobilier « ${f.kind} » n° ${i}`;
    if (!(FURNITURE_KINDS as readonly string[]).includes(f.kind)) c.error(`${w} : type inconnu`);
    if (!inTile(f.x, f.z, rect)) c.error(`${w} : hors de la tuile`);
    if (!Number.isFinite(f.heading)) c.error(`${w} : cap non fini`);
  }
  for (let i = 0; i < tile.signals.length; i++) {
    const s = tile.signals[i];
    const w = `feu n° ${i}`;
    if (!inTile(s.x, s.z, rect)) c.error(`${w} : hors de la tuile`);
    if (!Number.isFinite(s.heading)) c.error(`${w} : cap non fini`);
    if (!Number.isInteger(s.node) || s.node < -1) c.error(`${w} : nœud ${s.node} invalide`);
    else if (ctx.nodeCount !== undefined && s.node >= ctx.nodeCount) c.error(`${w} : nœud ${s.node} absent du graphe (${ctx.nodeCount} nœuds)`);
  }
  for (let i = 0; i < tile.metroEntrances.length; i++) {
    const m = tile.metroEntrances[i];
    const w = `entrée de métro n° ${i}`;
    if (!inTile(m.x, m.z, rect)) c.error(`${w} : hors de la tuile`);
    if (!Number.isFinite(m.heading)) c.error(`${w} : cap non fini`);
    if (typeof m.name !== 'string' || m.name === '') c.error(`${w} : nom de station absent`);
    if (typeof m.lines !== 'string') c.error(`${w} : lines doit être une chaîne`);
  }

  // Commerces
  const shopIds = new Set<number>();
  let orphanShops = 0;
  for (let i = 0; i < tile.shops.length; i++) {
    const s = tile.shops[i];
    const w = `commerce ${s.id} (n° ${i})`;
    if (!Number.isSafeInteger(s.id) || s.id <= 0) c.error(`${w} : identifiant entier > 0 attendu`);
    else if (shopIds.has(s.id)) c.error(`${w} : identifiant en double dans la tuile`);
    shopIds.add(s.id);
    if (!(SHOP_CATEGORIES as readonly string[]).includes(s.category)) c.error(`${w} : catégorie « ${s.category} » inconnue`);
    if (!inTile(s.x, s.z, rect)) c.error(`${w} : hors de la tuile`);
    if (!Number.isFinite(s.heading)) c.error(`${w} : cap non fini`);
    if (!(s.width > 0) || s.width > 100) c.error(`${w} : largeur de vitrine ${s.width} hors de ]0, 100] m`);
    if (!Number.isSafeInteger(s.buildingId) || s.buildingId < 0) {
      c.error(`${w} : identifiant de bâtiment ${s.buildingId} invalide`);
    } else if (s.buildingId === 0) {
      orphanShops++;
    } else {
      const b = buildingById.get(s.buildingId);
      if (b !== undefined && Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.heading)) checkShopFacade(c, w, s, b);
    }
  }
  if (orphanShops > 0) c.warn(`${orphanShops} commerce(s) sans bâtiment associé (buildingId = 0)`);

  return c.done();
}

// ── graphe routier ──

export function validateRoadGraph(graph: RoadGraphInput): ValidationResult {
  const c = createCollector();
  const n = graph.nodes.length;
  const degree = new Int32Array(n);
  const seen = new Set<string>();
  let duplicates = 0;
  for (let i = 0; i < n; i++) {
    const nd = graph.nodes[i];
    if (!Number.isFinite(nd.x) || !Number.isFinite(nd.z)) {
      c.error(`nœud ${i} : coordonnées non finies`);
      continue;
    }
    const key = `${quantize(nd.x)}_${quantize(nd.z)}`;
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  if (duplicates > 0) c.warn(`${duplicates} nœud(s) superposé(s) à un autre nœud`);

  for (let e = 0; e < graph.edges.length; e++) {
    const ed = graph.edges[e];
    const w = `arête ${e}${ed.name !== '' ? ` (${ed.name})` : ''}`;
    if (!Number.isInteger(ed.a) || !Number.isInteger(ed.b) || ed.a < 0 || ed.b < 0 || ed.a >= n || ed.b >= n) {
      c.error(`${w} : nœuds ${ed.a} / ${ed.b} hors du graphe`);
      continue;
    }
    degree[ed.a]++;
    degree[ed.b]++;
    const pts = ed.points, np = pts.length >> 1;
    if (pts.length % 2 !== 0 || np < 2 || !allFinite(pts)) {
      c.error(`${w} : polyligne d'au moins 2 points finis attendue`);
      continue;
    }
    const na = graph.nodes[ed.a], nb = graph.nodes[ed.b];
    if (Math.hypot(pts[0] - na.x, pts[1] - na.z) > NODE_SNAP_TOLERANCE) c.error(`${w} : le premier point ne coïncide pas avec le nœud ${ed.a}`);
    if (Math.hypot(pts[2 * np - 2] - nb.x, pts[2 * np - 1] - nb.z) > NODE_SNAP_TOLERANCE) c.error(`${w} : le dernier point ne coïncide pas avec le nœud ${ed.b}`);
    if (polylineLength(pts) < 0.1) c.error(`${w} : longueur nulle`);
    if (!(ed.width > 0) || ed.width > 100) c.error(`${w} : largeur de chaussée ${ed.width} hors de ]0, 100] m`);
    if (!Number.isInteger(ed.lanesForward) || !Number.isInteger(ed.lanesBackward) || ed.lanesForward < 0 || ed.lanesBackward < 0) {
      c.error(`${w} : nombres de voies invalides (${ed.lanesForward} / ${ed.lanesBackward})`);
    } else {
      if (ed.oneway && ed.lanesBackward !== 0) c.error(`${w} : sens unique avec ${ed.lanesBackward} voie(s) à contresens`);
      if (!ed.pedestrianOnly && ed.lanesForward + ed.lanesBackward === 0) c.error(`${w} : voie ouverte aux véhicules sans aucune voie`);
      if (!ed.pedestrianOnly && !ed.oneway && ed.lanesForward === 0) c.error(`${w} : double sens sans voie dans le sens a -> b`);
    }
    if (!(ROAD_CLASSES as readonly string[]).includes(ed.roadClass)) c.error(`${w} : classe « ${ed.roadClass} » inconnue`);
    if (!(ROAD_SURFACES as readonly string[]).includes(ed.surface)) c.error(`${w} : revêtement « ${ed.surface} » inconnu`);
    if (!Number.isFinite(ed.speedLimit) || ed.speedLimit < 0 || ed.speedLimit > 37) c.error(`${w} : vitesse limite ${ed.speedLimit} m/s hors de [0, 37]`);
    if (!Number.isFinite(ed.sidewalk) || ed.sidewalk < 0 || ed.sidewalk > 40) c.error(`${w} : largeur de trottoir ${ed.sidewalk} hors de [0, 40] m`);
    if (ed.bridge && ed.tunnel) c.error(`${w} : à la fois pont et souterrain`);
    if (typeof ed.name !== 'string' || typeof ed.landmarkKey !== 'string') c.error(`${w} : name et landmarkKey doivent être des chaînes`);
  }
  let isolated = 0;
  for (let i = 0; i < n; i++) if (degree[i] === 0) isolated++;
  if (isolated > 0) c.warn(`${isolated} nœud(s) sans arête`);
  if (c.done().ok && n > 0) {
    const comp = roadGraphComponents(graph);
    if (comp.count > 1) c.warn(`le graphe comporte ${comp.count} composantes connexes`);
  }
  return c.done();
}

// ── relief, lieux, monuments ──

export function validateTerrain(terrain: TerrainInput): ValidationResult {
  const c = createCollector();
  const { nx, nz, step } = terrain;
  if (!Number.isInteger(nx) || !Number.isInteger(nz) || nx < 2 || nz < 2) c.error(`grille ${nx} × ${nz} : au moins 2 × 2 nœuds attendus`);
  if (!(step > 0)) c.error(`pas ${step} : valeur > 0 attendue`);
  if (!Number.isFinite(terrain.x0) || !Number.isFinite(terrain.z0)) c.error('x0 / z0 non finis');
  if (terrain.heights.length !== nx * nz) c.error(`heights : ${terrain.heights.length} valeurs, ${nx * nz} attendues`);
  else if (!allFinite(terrain.heights)) c.error('heights : altitude non finie');
  if (c.done().ok) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < terrain.heights.length; i++) {
      const y = terrain.heights[i];
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    if (lo < -100 || hi > 300) c.warn(`altitudes de ${lo.toFixed(1)} à ${hi.toFixed(1)} m : invraisemblable pour Paris`);
    const coversOrigin = terrain.x0 <= 0 && terrain.z0 <= 0 && terrain.x0 + (nx - 1) * step >= 0 && terrain.z0 + (nz - 1) * step >= 0;
    if (coversOrigin) {
      const y0 = sampleTerrain({ x0: terrain.x0, z0: terrain.z0, step, nx, nz, heights: terrain.heights as Float32Array, minY: lo, maxY: hi }, 0, 0);
      if (Math.abs(y0) > 0.5) c.warn(`altitude ${y0.toFixed(2)} m à l'origine : 0 attendu (sol de la Concorde)`);
    }
  }
  return c.done();
}

export function validatePlaces(places: readonly Place[]): ValidationResult {
  const c = createCollector();
  const seen = new Set<string>();
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    const w = `lieu n° ${i} (${p.name})`;
    if (typeof p.name !== 'string' || p.name === '') c.error(`lieu n° ${i} : nom absent`);
    if (!(PLACE_KINDS as readonly string[]).includes(p.kind)) c.error(`${w} : nature « ${p.kind} » inconnue`);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) c.error(`${w} : coordonnées non finies`);
    if (!Number.isFinite(p.radius) || p.radius < 0) c.error(`${w} : rayon ${p.radius} invalide`);
    if (!Number.isInteger(p.importance) || p.importance < 0 || p.importance > 3) c.error(`${w} : importance ${p.importance} hors de 0..3`);
    if (typeof p.ref !== 'string') c.error(`${w} : ref doit être une chaîne`);
    const key = `${p.kind}|${p.name}`;
    if (seen.has(key)) c.warn(`${w} : lieu en double`);
    seen.add(key);
  }
  return c.done();
}

export function validateLandmarks(landmarks: readonly LandmarkInput[]): ValidationResult {
  const c = createCollector();
  const seen = new Set<string>();
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const w = `monument « ${lm.key} »`;
    if (typeof lm.key !== 'string' || lm.key === '') c.error(`monument n° ${i} : clé absente`);
    else if (seen.has(lm.key)) c.error(`${w} : clé en double`);
    else if (!/^[a-z0-9_]+$/.test(lm.key)) c.warn(`${w} : clé hors convention (minuscules ASCII, chiffres, « _ »)`);
    seen.add(lm.key);
    if (typeof lm.name !== 'string' || lm.name === '') c.error(`${w} : nom absent`);
    if (!Number.isFinite(lm.x) || !Number.isFinite(lm.z) || !Number.isFinite(lm.y)) c.error(`${w} : position non finie`);
    if (!Number.isFinite(lm.heading)) c.error(`${w} : cap non fini`);
    if (!(lm.height > 0) || lm.height > 500) c.error(`${w} : hauteur ${lm.height} hors de ]0, 500] m`);
    if (checkRing(c, `${w}, emprise`, lm.footprint, true)) {
      const b = ringBounds(lm.footprint);
      if (lm.x < b.minX - 50 || lm.x > b.maxX + 50 || lm.z < b.minZ - 50 || lm.z > b.maxZ + 50) c.warn(`${w} : le point d'ancrage est loin de l'emprise`);
    }
  }
  return c.done();
}

// ── carte entière ──

/**
 * Contrôle une carte entière décodée : chaque fichier, puis les références croisées (tuiles du
 * manifeste, arêtes référencées par les tuiles, bâtiments des commerces, clés de monuments,
 * identifiants uniques sur toute la carte).
 */
export function validateMapData(data: MapData): ValidationResult {
  const c = createCollector();
  c.merge('manifeste : ', validateManifest(data.manifest));
  c.merge('graphe routier : ', validateRoadGraph(data.roadGraph));
  c.merge('relief : ', validateTerrain(data.terrain));
  c.merge('lieux : ', validatePlaces(data.places));
  c.merge('monuments : ', validateLandmarks(data.landmarks));

  const landmarkKeys = new Set<string>();
  for (const lm of data.landmarks) landmarkKeys.add(lm.key);
  const ctx: TileValidationContext = { edgeCount: data.roadGraph.edges.length, nodeCount: data.roadGraph.nodes.length, landmarkKeys };

  // Tuiles du manifeste
  const listed = Array.isArray(data.manifest.tiles) ? data.manifest.tiles : [];
  if (listed.length !== data.tiles.length) c.error(`le manifeste annonce ${listed.length} tuile(s), ${data.tiles.length} fournie(s)`);
  const tileKeys = new Set<string>();
  for (let i = 0; i < data.tiles.length; i++) {
    const t = data.tiles[i];
    const key = tileKey(t.tx, t.tz);
    if (tileKeys.has(key)) c.error(`tuile ${key} en double`);
    tileKeys.add(key);
    const m = listed[i];
    if (m !== undefined && (m.tx !== t.tx || m.tz !== t.tz)) c.error(`tuile n° ${i} : ${key} fournie, ${tileKey(m.tx, m.tz)} annoncée par le manifeste`);
    c.merge(`tuile ${key} : `, validateTile(t, ctx));
  }

  // Identifiants uniques sur toute la carte
  const buildings = new Map<number, Building>();
  const shopIds = new Set<number>();
  for (const t of data.tiles) {
    for (const b of t.buildings) {
      if (buildings.has(b.id)) c.error(`bâtiment ${b.id} présent dans plusieurs tuiles`);
      else buildings.set(b.id, b);
    }
  }
  for (const t of data.tiles) {
    const local = new Set<number>();
    for (const b of t.buildings) local.add(b.id);
    for (const s of t.shops) {
      if (shopIds.has(s.id)) c.error(`commerce ${s.id} présent plusieurs fois sur la carte`);
      shopIds.add(s.id);
      if (s.buildingId > 0 && !local.has(s.buildingId)) {
        const b = buildings.get(s.buildingId);
        if (b === undefined) c.error(`tuile ${tileKey(t.tx, t.tz)} : commerce ${s.id} — bâtiment ${s.buildingId} introuvable`);
        else checkShopFacade(c, `tuile ${tileKey(t.tx, t.tz)} : commerce ${s.id}`, s, b);
      }
    }
  }

  // Arêtes : chaque tuile référence exactement celles qui la traversent
  const refs = computeTileEdgeRefs(data.roadGraph);
  const referenced = new Uint8Array(data.roadGraph.edges.length);
  for (const t of data.tiles) {
    const key = tileKey(t.tx, t.tz);
    const have = new Set<number>(t.roadEdges);
    const expected = refs.get(key) ?? [];
    let missing = 0;
    for (const e of expected) if (!have.has(e)) missing++;
    if (missing > 0) c.error(`tuile ${key} : ${missing} arête(s) traversent la tuile sans y être référencée(s) (voir computeTileEdgeRefs)`);
    if (have.size > expected.length - missing) c.warn(`tuile ${key} : ${have.size - (expected.length - missing)} arête(s) référencée(s) ne traversent pas la tuile`);
    for (const e of t.roadEdges) if (e >= 0 && e < referenced.length) referenced[e] = 1;
  }
  let unreferenced = 0;
  for (let e = 0; e < referenced.length; e++) if (referenced[e] === 0) unreferenced++;
  if (unreferenced > 0) c.warn(`${unreferenced} arête(s) du graphe ne sont référencées par aucune tuile`);
  for (let e = 0; e < data.roadGraph.edges.length; e++) {
    const key = data.roadGraph.edges[e].landmarkKey;
    if (key !== '' && !landmarkKeys.has(key)) c.error(`arête ${e} : monument « ${key} » absent de landmarks.json`);
  }

  // Emprise
  const b = data.manifest.bounds;
  if (isRecord(b) && isFiniteNumber(b.minX) && isFiniteNumber(b.maxX) && isFiniteNumber(b.minZ) && isFiniteNumber(b.maxZ)) {
    const margin = 100;
    let outside = 0;
    for (const p of data.places) if (p.x < b.minX - margin || p.x > b.maxX + margin || p.z < b.minZ - margin || p.z > b.maxZ + margin) outside++;
    if (outside > 0) c.warn(`${outside} lieu(x) hors de l'emprise de la carte`);
    for (const lm of data.landmarks) {
      if (lm.x < b.minX - margin || lm.x > b.maxX + margin || lm.z < b.minZ - margin || lm.z > b.maxZ + margin) c.warn(`monument « ${lm.key} » hors de l'emprise de la carte`);
    }
    const t = data.terrain;
    if (t.x0 > b.minX || t.z0 > b.minZ || t.x0 + (t.nx - 1) * t.step < b.maxX || t.z0 + (t.nz - 1) * t.step < b.maxZ) {
      c.warn("le relief ne couvre pas toute l'emprise de la carte");
    }
    for (const t2 of data.tiles) {
      const r = tileBounds(t2.tx, t2.tz);
      if (r.maxX <= b.minX || r.minX >= b.maxX || r.maxZ <= b.minZ || r.minZ >= b.maxZ) c.warn(`tuile ${tileKey(t2.tx, t2.tz)} entièrement hors de l'emprise de la carte`);
    }
  }
  return c.done();
}
