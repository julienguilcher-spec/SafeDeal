/* =====================================================================================
 * CARTE DE PARIS — règle « aucune enseigne »
 * -------------------------------------------------------------------------------------
 * Le jeu ne publie aucune marque commerciale : les commerces n'ont qu'une catégorie, et les
 * noms de bâtiments, de lieux, de voies et de surfaces sont filtrés ici. Les noms d'enseignes
 * de la source ne servent qu'à ÉCARTER un nom ; ils n'entrent dans aucun fichier de sortie.
 * ===================================================================================== */
import { readLayer, normName } from './build-lib.mjs';

/** Noms d'enseignes de la source (normalisés) -> nombre de locaux. Sert à écarter, jamais à publier. */
export function loadBrandNames() {
  const brands = new Map();
  for (const f of readLayer('shops').features) {
    const n = f.properties.name;
    if (typeof n !== 'string' || n === '') continue;
    const k = normName(n);
    if (k.length >= 3) brands.set(k, (brands.get(k) ?? 0) + 1);
  }
  return brands;
}

/** Début de nom qui désigne un lieu ou un édifice public (sur un nom normalisé). */
export const PUBLIC_PREFIX = /^(rue|avenue|boulevard|place|quai|pont|passerelle|square|jardin|jardins|passage|impasse|cite|villa|cour|cours|allee|galerie|port|promenade|esplanade|parvis|voie|carrefour|rond point|chemin|sentier|terrasse|parc|pelouse|bassin|fontaine|eglise|chapelle|cathedrale|temple|synagogue|mosquee|musee|theatre|opera|palais|hotel de|mairie|ministere|ambassade|consulat|gare|ecole|college|lycee|universite|institut|hopital|bibliotheque|mediatheque|tour|arc|colonne|statue|monument|porte|caserne|commissariat|prefecture|tribunal|centre|maison de|fondation|conservatoire|creche|gymnase|piscine|marche|halle|bourse|archives|cimetiere|couvent|abbaye|basilique|oratoire|pavillon)\b/;

/**
 * Marques déposées repérées dans des noms de musées, de fondations, d'écoles ou de galeries (relevé à
 * la lecture des données, complété par la relecture de toutes les chaînes publiées : voir
 * docs/map-verification.md). Un nom qui contient l'une d'elles n'est jamais publié.
 */
export const TRADEMARK_RE = /\b(yves saint laurent|fragonard|fondation cartier|le lido|lido de paris|galeries lafayette|samaritaine|bateaux parisiens|ratp|sncf|baccarat|grevin|banksy|gainsbourg|alaia|mundolingua|bpifrance|credit municipal|point show|elysees 26|isec|mod spe)\b/;

/**
 * Noms écartés un à un à la relecture (formes normalisées). Deux familles :
 *   - établissements privés à vocation commerciale dont le nom est une enseigne (musées privés,
 *     théâtre privé, écoles privées de marque, galeries marchandes, anciennes enseignes classées) ;
 *   - libellés qui ne sont pas des lieux (pièces d'un bâtiment, adresse, mot générique isolé).
 * Les établissements publics, les lieux de culte, les ambassades et les écoles sous contrat gardent leur nom.
 */
export const REMOVED_NAMES = new Set([
  // enseignes et établissements commerciaux
  'musee du chocolat', 'musee du vin', 'musee de la magie', 'theatre daunou', 'au gagne petit', 'au planteur',
  'atlas justice office de paris', 'l ecole des arts joailliers', 'institut superieur europeen de gestion',
  'institut superieur du management public et politique', 'academie internationale de comedie musicale', 'college des ingenieurs',
  'learning planet institute', 'ifocap', 'ecole active bilingue monceau ecole elementaire privee', 'ecole maternelle montessori rive gauche',
  'ecole de la chambre syndicale de la couture parisienne', 'le centre de service de visa chinois', 'galerie berri washington',
  'galerie elysees la boetie',
  // libellés qui ne sont pas des lieux
  'direction', 'reserve', 'recherche reseau', 'emploi du temps materiel', 'vie associative', 'aumonerie', 'police station',
  '25 rue de ponthieu', 'fruitier paris', 'potager', 'jardins electroniques eceborg noise', 'auditorium', 'depose minute', 'parking handicape',
]);

/** Vrai si le nom est écarté à la relecture (enseigne d'un établissement privé ou libellé sans valeur de lieu). */
export function isRemovedName(name) {
  return REMOVED_NAMES.has(normName(name));
}

/** Vrai si le nom contient une marque déposée connue. */
export function hasTrademark(name) {
  const k = normName(name);
  return TRADEMARK_RE.test(k) || REMOVED_NAMES.has(k);
}

/** Début de nom d'une voie ou d'un cheminement public (sur un nom normalisé). */
const WAY_PREFIX = /^(rue|ruelle|avenue|boulevard|place|placette|quai|pont|petit pont|passerelle|passage|impasse|cite|villa|cour|cours|allee|galerie|port|promenade|esplanade|parvis|voie|square|jardin|jardins|chemin|sentier|sente|terrasse|rond point|carrefour|pelouse|souterrain|tunnel|route|escalier|rampe|arcade|arcades|hameau|peristyle|porte|chaussee|contre allee|mail|berge|berges|parc|cloitre|carre|belvedere|pavillon|ile|pointe|rotonde|colonnade|portique|traverse|venelle|faubourg|marche)\b/;

/**
 * Nom publié d'une arête. Une voie de desserte ou un cheminement dont le nom n'est pas celui
 * d'une voie (« Accès Parking … », « Dépose minute … ») perd son nom : ces libellés décrivent un
 * équipement, parfois par le nom d'une enseigne voisine.
 */
export function publicWayName(name, minor) {
  if (typeof name !== 'string' || name === '') return '';
  if (hasTrademark(name)) return '';
  if (minor && !WAY_PREFIX.test(normName(name))) return '';
  return name;
}

/** Noms identiques à celui d'un commerce mais qui désignent bien un édifice ou une œuvre publics (relus un à un). */
const PUBLIC_HOMONYMS = new Set(['jeanne d arc', 'la seine', 'diderot', 'missions etrangeres de paris', 'delegation de la polynesie francaise']);

/**
 * Vrai si le nom d'un bâtiment, d'un monument ou d'une institution doit être écarté : il contient
 * une marque déposée, ou c'est exactement le nom d'un commerce sans être un toponyme public.
 */
export function isCommercialName(name, brands) {
  const k = normName(name);
  if (TRADEMARK_RE.test(k) || REMOVED_NAMES.has(k)) return true;
  return brands.has(k) && !PUBLIC_PREFIX.test(k) && !PUBLIC_HOMONYMS.has(k);
}
