#!/usr/bin/env node
/* =====================================================================================
 * CARTE DE PARIS — CONTRÔLES CHIFFRÉS, indépendants de la construction
 * -------------------------------------------------------------------------------------
 *   node tools/map/verify-map.mjs           contrôle public/data/paris/ et écrit le rapport
 *   node tools/map/verify-map.mjs --quiet   n'affiche que le bilan
 *
 * Ce script ne partage AUCUN code avec build*.mjs. Il relit les fichiers publiés avec le
 * décodeur du jeu (src/world/mapdata.ts) puis refait ses propres mesures avec sa propre
 * géométrie : positions de repères connus, hauteurs, connexité du graphe, arêtes en double,
 * polygones invalides, orientation des commerces, relief, budget, temps de décodage, noms
 * d'enseignes, attribution. Rapport détaillé : tools/map/raw/build/verify.json et
 * verify-names.txt (toutes les chaînes publiées, pour relecture humaine).
 *
 * Code de sortie 1 si un contrôle marqué « ÉCHEC » ne passe pas. Les « à surveiller » sont des
 * défauts connus et tolérés : ils sont chiffrés, pas cachés.
 * Aucun accès au réseau. Les coordonnées de référence des monuments viennent de Wikidata
 * (CC0), relevées le 16 novembre 2026 et recopiées ci-dessous.
 * ===================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../../src/world/mapdata.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.CRS_MAP_OUT ?? path.resolve(HERE, '..', '..', 'public', 'data', 'paris');
const NORM = process.env.CRS_MAP_NORM ?? path.join(HERE, 'raw', 'normalized');
const REPORT_DIR = path.join(HERE, 'raw', 'build');
const QUIET = process.argv.includes('--quiet');

const MAX_FILES = 110;
const MAX_BYTES = 30 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────────────
// Références indépendantes
// ─────────────────────────────────────────────────────────────────────────────────────

/** Repères : [clé du monument, nom, latitude, longitude] — Wikidata (P625), CC0. */
const REFERENCE_POINTS = [
  ['arc_triomphe', 'Arc de Triomphe', 48.87378, 2.29504],
  ['tour_eiffel', 'Tour Eiffel', 48.858296, 2.294479],
  ['obelisque_concorde', 'Obélisque de Louxor', 48.865475, 2.321133],
  ['notre_dame', 'Notre-Dame de Paris', 48.853, 2.3498],
  ['opera_garnier', 'Opéra Garnier', 48.871944, 2.331667],
  ['pyramide_louvre', 'Pyramide du Louvre', 48.861, 2.335861],
  ['colonne_vendome', 'Colonne Vendôme', 48.867469, 2.329414],
  ['colonne_juillet', 'Colonne de Juillet', 48.853056, 2.369167],
  ['statue_republique', 'Monument à la République', 48.86751, 2.363818],
  ['madeleine', 'Église de la Madeleine', 48.87, 2.324444],
  ['sainte_chapelle', 'Sainte-Chapelle', 48.855369, 2.345028],
  ['tour_saint_jacques', 'Tour Saint-Jacques', 48.857764, 2.348778],
  ['pont_alexandre_iii', 'Pont Alexandre III', 48.86361, 2.31361],
  ['grand_palais', 'Grand Palais', 48.866111, 2.3125],
  ['hotel_de_ville', 'Hôtel de Ville', 48.856389, 2.352222],
  ['centre_pompidou', 'Centre Pompidou', 48.860642, 2.352245],
  ['invalides', 'Hôtel des Invalides', 48.855, 2.3125],
  ['saint_sulpice', 'Église Saint-Sulpice', 48.851002, 2.334923],
  ['palais_chaillot', 'Palais de Chaillot', 48.86234, 2.28807],
  ['musee_orsay', 'Musée d\'Orsay', 48.859972, 2.326527],
];
/**
 * Noms publiés (bâtiment, surface, monument, institution) qu'un commerce du relevé porte aussi, relus un à
 * un : ce sont des toponymes publics dont un commerce voisin a repris le nom, pas l'inverse.
 */
const SHOP_HOMONYMS_ALLOWED = new Set([
  'Square Louvois', 'Porte Saint-Martin', 'La Seine', 'Palais Royal', 'Palais-Royal', 'Fondation Henri Cartier-Bresson', 'Champ-de-Mars',
  'Missions Étrangères de Paris', 'Opéra Garnier', 'Opéra Bastille', 'Jeanne d\'Arc', 'Maison de Victor Hugo', 'Église évangélique',
  'Église Évangélique', 'Centre Saint-Paul', 'Bibliothèque Andrée Chedid', 'Ministère de la Culture', 'Délégation de la Polynésie française',
]);

/** Écart toléré (m) entre l'ancrage d'un monument et sa référence, si la référence n'est pas dans son emprise. */
const REFERENCE_TOLERANCE = 40;

/** Hauteurs de référence (m, sommet) de quelques monuments, de notoriété publique. Tolérance : 15 %. */
const REFERENCE_HEIGHTS = {
  tour_eiffel: 330, arc_triomphe: 50, notre_dame: 96, colonne_juillet: 50.5, colonne_vendome: 44.3, pyramide_louvre: 21.6,
  opera_garnier: 56, invalides: 107, sainte_chapelle: 75, tour_saint_jacques: 54, arc_carrousel: 19, saint_sulpice: 73,
};

/** Altitudes NGF de notoriété publique (m) : sert à vérifier les DIFFÉRENCES de niveau, pas l'absolu. */
const REFERENCE_ALTITUDES = [
  ['Concorde (origine)', 48.865633, 2.321236, 33],
  ['Étoile', 48.87378, 2.29504, 58],
  ['Trocadéro (parvis)', 48.8629, 2.2885, 60],
  ['République', 48.86751, 2.363818, 37],
  ['Bastille', 48.853056, 2.369167, 37],
  ['Champ-de-Mars (milieu)', 48.8556, 2.2986, 35],
  ['Parvis Notre-Dame', 48.8534, 2.3488, 35],
];
/** Retenue normale de la Seine dans Paris (bief de Suresnes) : 26,72 m NGF. */
const SEINE_NGF = 26.72;

/**
 * Enseignes et marques connues (forme normalisée : minuscules, sans accents, ponctuation -> espace).
 * Liste écrite à la main pour ce contrôle, sans lien avec le filtre de construction.
 */
const BRANDS = [
  // grands magasins, mode, luxe
  'galeries lafayette', 'printemps haussmann', 'le printemps', 'bhv', 'samaritaine', 'bon marche', 'grande epicerie', 'zara', 'h m', 'uniqlo', 'celio', 'kiabi',
  'mango', 'bershka', 'pull bear', 'stradivarius', 'primark', 'levi s', 'nike', 'adidas', 'puma', 'foot locker', 'courir', 'jd sports', 'decathlon',
  'go sport', 'intersport', 'lacoste', 'ralph lauren', 'tommy hilfiger', 'calvin klein', 'hugo boss', 'armani', 'gucci', 'prada', 'chanel', 'dior',
  'louis vuitton', 'vuitton', 'hermes', 'cartier', 'chaumet', 'boucheron', 'van cleef', 'bulgari', 'bvlgari', 'tiffany', 'rolex', 'swatch', 'longchamp',
  'yves saint laurent', 'saint laurent', 'givenchy', 'balenciaga', 'celine', 'chloe', 'kenzo', 'lanvin', 'balmain', 'valentino', 'versace', 'fendi',
  'burberry', 'moncler', 'guerlain', 'lancome', 'sephora', 'marionnaud', 'nocibe', 'yves rocher', 'l occitane', 'swarovski', 'pandora', 'tati',
  'petit bateau', 'du pareil au meme', 'jacadi', 'etam', 'promod', 'camaieu', 'naf naf', 'kookai', 'sandro', 'maje', 'the kooples', 'zadig', 'agnes b',
  'comptoir des cotonniers', 'eric bompard', 'minelli', 'eram', 'bata', 'san marina', 'jonak', 'bocage', 'repetto', 'weston', 'berluti',
  // alimentation, distribution
  'monoprix', 'monop', 'franprix', 'carrefour city', 'carrefour market', 'carrefour express', 'auchan', 'leclerc', 'casino', 'picard', 'naturalia',
  'bio c bon', 'biocoop', 'lidl', 'aldi', 'g20', 'intermarche', 'u express', 'la grande recre', 'fnac', 'darty', 'conforama', 'ikea',
  'leroy merlin', 'castorama', 'maisons du monde', 'nature et decouvertes', 'cultura', 'gibert', 'relay', 'lego', 'disney', 'nespresso',
  'apple store', 'samsung', 'orange', 'sfr', 'bouygues', 'free mobile', 'micromania', 'ladurree', 'laduree', 'pierre herme', 'fauchon', 'hediard',
  'angelina', 'la maison du chocolat', 'jeff de bruges', 'leonidas', 'kusmi', 'mariage freres', 'dalloyau', 'lenotre', 'eric kayser', 'kayser',
  // restauration
  'mcdonald', 'burger king', 'kfc', 'quick', 'subway', 'starbucks', 'brioche doree', 'pomme de pain', 'pret a manger', 'exki', 'cojean', 'five guys',
  'domino s', 'pizza hut', 'hippopotamus', 'leon de bruxelles', 'flunch', 'buffalo grill', 'big fernand', 'cafe de flore', 'deux magots', 'lipp',
  'maxim s', 'fouquet', 'harry s bar', 'hard rock', 'lido', 'crazy horse', 'moulin rouge', 'folies bergere', 'olympia', 'grand rex', 'ugc', 'gaumont',
  'pathe', 'mk2', 'bofinger', 'la coupole', 'le procope', 'procope', 'tour d argent', 'drouant', 'cafe de la paix', 'paradis latin',
  // banques, assurances, services
  'bnp', 'paribas', 'societe generale', 'credit agricole', 'credit lyonnais', 'lcl', 'credit mutuel', 'cic', 'caisse d epargne', 'banque populaire',
  'hsbc', 'banque postale', 'barclays', 'rothschild', 'lazard', 'axa', 'allianz', 'generali', 'groupama', 'maif', 'macif', 'mma', 'western union',
  'moneygram', 'travelex', 'century 21', 'orpi', 'foncia', 'laforet', 'guy hoquet', 'nexity', 'wework', 'regus', 'chronopost', 'dhl', 'fedex',
  'amazon', 'google', 'microsoft', 'facebook', 'publicis', 'drugstore', 'drouot', 'christie s', 'sotheby', 'artcurial',
  // hôtels
  'ritz', 'crillon', 'meurice', 'plaza athenee', 'four seasons', 'bristol', 'lutetia', 'shangri la', 'peninsula', 'mandarin oriental', 'hyatt',
  'hilton', 'marriott', 'sofitel', 'novotel', 'mercure', 'ibis', 'pullman', 'westin', 'intercontinental', 'kimpton', 'best western', 'holiday inn',
  'radisson', 'raphael', 'lancaster', 'scribe', 'regina', 'costes', 'prince de galles', 'royal monceau', 'napoleon paris', 'majestic',
  // automobile, énergie, stationnement
  'renault', 'peugeot', 'citroen', 'tesla', 'toyota', 'mercedes', 'bmw', 'audi', 'porsche', 'ferrari', 'totalenergies', 'total', 'shell', 'esso',
  'indigo', 'saemes', 'effia', 'q park', 'interparking', 'onepark', 'zenpark', 'vinci park', 'autolib', 'uber', 'g7',
  // établissements privés à nom d'enseigne relevés à la relecture des chaînes publiées
  'baccarat', 'grevin', 'banksy', 'gainsbourg', 'alaia', 'mundolingua', 'bpifrance', 'credit municipal', 'point show', 'theatre daunou',
  'au gagne petit', 'au planteur', 'theatre mogador', 'theatre du chatelet', 'bobino', 'comedia', 'casino de paris', 'musee du parfum', 'aquarium de paris',
  'bateaux mouches', 'bateaux parisiens', 'vedettes du pont neuf', 'batobus',
];

/**
 * Chaînes publiées où un mot de la liste apparaît légitimement : toponymes publics (voies, places,
 * stations, institutions), relus un à un. Toute AUTRE occurrence fait échouer le contrôle.
 */
const BRAND_ALLOWED = new Set([
  // « Longchamp » : ancienne abbaye et plaine de Longchamp, bien avant la maison de maroquinerie.
  'Rue de Longchamp', 'Rue du Bouquet de Longchamp', 'Villa de Longchamp',
  // Voies et station nommées d'après des personnes ou des lieux homonymes d'une enseigne.
  'Rue Scribe', 'Rue Crillon', 'Rue Drouot', 'Richelieu-Drouot', 'Bibliothèque Drouot', 'Rue Saint-Laurent', 'Square Saint-Laurent', 'Église Saint-Laurent',
  // Personnes : le photographe et le navigateur, sans lien avec le joaillier ; la famille, pour un hôtel particulier devenu fondation publique.
  'Fondation Henri Cartier-Bresson', 'Jacques Cartier', 'Hôtel Salomon de Rothschild', 'Jardin de l’Hôtel Salomon de Rothschild',
]);

// ─────────────────────────────────────────────────────────────────────────────────────
// Outils
// ─────────────────────────────────────────────────────────────────────────────────────

const px = (lon) => (lon - M.ORIGIN_LON) * M.M_PER_DEG_LON;
const pz = (lat) => -(lat - M.ORIGIN_LAT) * M.M_PER_DEG_LAT;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 10000) / 100);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const quantile = (sorted, q) => (sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);

/** Aire signée, positive pour un anneau antihoraire vu de dessus (nord en haut, x = est, z = sud). */
function areaCcw(r) {
  let s = 0;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    s += r[i] * r[j + 1] - r[j] * r[i + 1];
  }
  return -s / 2;
}
function inRing(r, x, z) {
  let inside = false;
  for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
    const zi = r[i + 1], zj = r[j + 1];
    if (zi > z !== zj > z && x < ((r[j] - r[i]) * (z - zi)) / (zj - zi) + r[i]) inside = !inside;
  }
  return inside;
}
function inPoly(p, x, z) {
  if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) return false;
  if (!inRing(p.outer, x, z)) return false;
  for (const h of p.holes) if (inRing(h, x, z)) return false;
  return true;
}
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  let t = L === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / L;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}
/** Distance d'un point à un anneau fermé, et le côté le plus proche. */
function ringNearest(r, x, z) {
  let best = Infinity, bi = -1;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const d = segDist(x, z, r[i], r[i + 1], r[j], r[j + 1]);
    if (d < best) { best = d; bi = i; }
  }
  return { d: best, i: bi };
}
function lineDist(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const d = segDist(x, z, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    if (d < best) best = d;
  }
  return best;
}
const cross = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
/** Vrai si les segments ab et cd se croisent franchement (pas un simple contact d'extrémité). */
function properCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = cross(ax, az, bx, bz, cx, cz), d2 = cross(ax, az, bx, bz, dx, dz);
  const d3 = cross(cx, cz, dx, dz, ax, az), d4 = cross(cx, cz, dx, dz, bx, bz);
  const E = 1e-6;
  return ((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E));
}
function ringSelfCrossings(r) {
  const n = r.length / 2;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const j2 = (j + 1) % n;
      if (properCross(r[2 * i], r[2 * i + 1], r[2 * i2], r[2 * i2 + 1], r[2 * j], r[2 * j + 1], r[2 * j2], r[2 * j2 + 1])) count++;
    }
  }
  return count;
}
function bboxOf(r, o = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity }) {
  for (let i = 0; i < r.length; i += 2) {
    if (r[i] < o.minX) o.minX = r[i];
    if (r[i] > o.maxX) o.maxX = r[i];
    if (r[i + 1] < o.minZ) o.minZ = r[i + 1];
    if (r[i + 1] > o.maxZ) o.maxZ = r[i + 1];
  }
  return o;
}
/** Un point strictement à l'intérieur d'un polygone (milieu de la plus large travée d'une ligne horizontale). */
function interiorPoint(p) {
  const z = (p.minZ + p.maxZ) / 2 + 0.0137;
  const xs = [];
  for (const r of [p.outer, ...p.holes]) {
    for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
      const zi = r[i + 1], zj = r[j + 1];
      if (zi > z !== zj > z) xs.push(((r[j] - r[i]) * (z - zi)) / (zj - zi) + r[i]);
    }
  }
  xs.sort((a, b) => a - b);
  let best = null, w = 0;
  for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > w) { w = xs[k + 1] - xs[k]; best = (xs[k] + xs[k + 1]) / 2; }
  return best === null ? null : { x: best, z, w };
}
/** Grille de hachage spatial (cellules de `cell` mètres). */
class Grid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(cx, cz) { return cx * 100003 + cz; }
  addBox(b, id) {
    const c = this.cell;
    for (let cx = Math.floor(b.minX / c); cx <= Math.floor(b.maxX / c); cx++) {
      for (let cz = Math.floor(b.minZ / c); cz <= Math.floor(b.maxZ / c); cz++) {
        const k = this.key(cx, cz);
        let a = this.map.get(k);
        if (a === undefined) { a = []; this.map.set(k, a); }
        a.push(id);
      }
    }
  }
  at(x, z) { return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? []; }
  near(x, z, r) {
    const c = this.cell, out = new Set();
    for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
      for (let cz = Math.floor((z - r) / c); cz <= Math.floor((z + r) / c); cz++) {
        const a = this.map.get(this.key(cx, cz));
        if (a !== undefined) for (const id of a) out.add(id);
      }
    }
    return out;
  }
}

const results = [];
/** Enregistre un contrôle. level : 'fail' (bloquant), 'warn' (à surveiller), 'info' (mesure). */
function check(name, ok, level, summary, detail = undefined) {
  results.push({ name, ok, level: ok ? 'ok' : level, summary, detail });
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Lecture (avec le décodeur du jeu)
// ─────────────────────────────────────────────────────────────────────────────────────

if (!fs.existsSync(path.join(DATA, 'manifest.json'))) {
  console.error(`ÉCHEC : données de carte absentes dans ${DATA} (lancer node tools/map/build.mjs)`);
  process.exit(1);
}
const readText = (rel) => fs.readFileSync(path.join(DATA, rel), 'utf8');
const manifest = M.parseManifest(JSON.parse(readText('manifest.json')));
const rawTiles = [];
const tiles = [];
const tileBytes = new Map();
for (const t of manifest.tiles) {
  const text = readText(t.file);
  tileBytes.set(t.file, Buffer.byteLength(text));
  const raw = JSON.parse(text);
  rawTiles.push(raw);
  tiles.push(M.decodeTile(raw));
}
const rawGraph = JSON.parse(readText(manifest.files.roadGraph));
const graph = M.decodeRoadGraph(rawGraph);
const rawPlaces = JSON.parse(readText(manifest.files.places));
const places = M.decodePlaces(rawPlaces);
const rawLandmarks = JSON.parse(readText(manifest.files.landmarks));
const landmarks = M.decodeLandmarks(rawLandmarks);
const terrain = M.decodeTerrain(JSON.parse(readText(manifest.files.terrain)));
const heightAt = (x, z) => M.sampleTerrain(terrain, x, z);
const B = manifest.bounds;
const inBounds = (x, z, m = 0) => x >= B.minX - m && x <= B.maxX + m && z >= B.minZ - m && z <= B.maxZ + m;

// Index des bâtiments et de l'eau.
const buildings = [];
const buildingById = new Map();
const bGrid = new Grid(32);
for (const t of tiles) {
  for (const b of t.buildings) {
    const p = { ...bboxOf(b.outer), outer: b.outer, holes: b.holes, b, tile: `${t.tx}_${t.tz}`, idx: buildings.length };
    buildings.push(p);
    buildingById.set(b.id, p);
    bGrid.addBox(p, p.idx);
  }
}
function buildingAt(x, z, exclude = -1) {
  for (const i of bGrid.at(x, z)) if (i !== exclude && inPoly(buildings[i], x, z)) return i;
  return -1;
}
const waters = [];
const wGrid = new Grid(64);
for (const t of tiles) {
  for (const s of t.surfaces) {
    if (s.kind !== 'water') continue;
    const p = { ...bboxOf(s.outer), outer: s.outer, holes: s.holes, s };
    wGrid.addBox(p, waters.length);
    waters.push(p);
  }
}
const inWater = (x, z) => wGrid.at(x, z).some((i) => inPoly(waters[i], x, z));
// Surfaces dures : là où elles recouvrent l'eau, le moteur en fait le tablier d'un pont (src/world/view/raster.ts).
const paved = [];
const pGrid = new Grid(32);
for (const t of tiles) {
  for (const s of t.surfaces) {
    if (s.kind !== 'road' && s.kind !== 'sidewalk' && s.kind !== 'median' && s.kind !== 'pedestrian' && s.kind !== 'plaza') continue;
    const p = { ...bboxOf(s.outer), outer: s.outer, holes: s.holes };
    pGrid.addBox(p, paved.length);
    paved.push(p);
  }
}
const onPaved = (x, z) => pGrid.at(x, z).some((i) => inPoly(paved[i], x, z));
// Chaussées du plan de voirie (polygones « road »), pour comparer la largeur des arêtes à la largeur de bordure à bordure.
const roadSurf = [];
const rGrid = new Grid(32);
for (const t of tiles) {
  for (const s of t.surfaces) {
    if (s.kind !== 'road') continue;
    const p = { ...bboxOf(s.outer), outer: s.outer, holes: s.holes };
    rGrid.addBox(p, roadSurf.length);
    roadSurf.push(p);
  }
}
const onRoadSurface = (x, z) => rGrid.at(x, z).some((i) => inPoly(roadSurf[i], x, z));

const isDrivable = (e) => !e.pedestrianOnly && e.roadClass !== 'footway' && e.roadClass !== 'pedestrian';
const eGrid = new Grid(64);
graph.edges.forEach((e, i) => eGrid.addBox(bboxOf(e.points), i));

// ─────────────────────────────────────────────────────────────────────────────────────
// 1. Fichiers et budget
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const files = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p); else files.push({ rel: path.relative(DATA, p), bytes: fs.statSync(p).size });
    }
  };
  walk(DATA);
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const sizes = files.filter((f) => f.rel.startsWith('tiles')).map((f) => f.bytes).sort((a, b) => a - b);
  const biggest = files.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  check('Budget : nombre de fichiers', files.length <= MAX_FILES, 'fail', `${files.length} fichiers (limite ${MAX_FILES})`);
  check('Budget : taille totale', total <= MAX_BYTES, 'fail', `${total} octets = ${r2(total / 1048576)} Mo (limite 30 Mo)`, {
    tiles: sizes.length, tileBytes: sizes.reduce((a, b) => a + b, 0), smallestTile: sizes[0], medianTile: quantile(sizes, 0.5), largestTile: sizes[sizes.length - 1],
    biggestFile: biggest, others: files.filter((f) => !f.rel.startsWith('tiles')),
  });
  // Tuiles : celles du manifeste = celles du disque = celles qui recouvrent l'emprise ; taille annoncée exacte.
  const expected = new Set(M.tilesCoveringBounds(M.boundsOfBbox(M.PARIS_BBOX)).map((t) => M.tilePath(t.tx, t.tz)));
  const announced = new Set(manifest.tiles.map((t) => t.file));
  const onDisk = new Set(files.filter((f) => f.rel.startsWith('tiles')).map((f) => f.rel.split(path.sep).join('/')));
  const missing = [...expected].filter((f) => !announced.has(f) || !onDisk.has(f));
  const stale = [...onDisk].filter((f) => !announced.has(f));
  const wrongSize = manifest.tiles.filter((t) => t.bytes !== undefined && t.bytes !== tileBytes.get(t.file)).map((t) => t.file);
  check('Tuiles : manifeste, disque et emprise concordent', missing.length === 0 && stale.length === 0 && wrongSize.length === 0, 'fail',
    `${announced.size} tuiles annoncées, ${onDisk.size} sur disque, ${expected.size} attendues ; ${missing.length} manquantes, ${stale.length} périmées, ${wrongSize.length} de taille annoncée fausse`,
    { missing, stale, wrongSize });
  // Tuiles vides ou presque.
  const empties = [];
  const perTile = [];
  for (const t of tiles) {
    const row = {
      key: `${t.tx}_${t.tz}`, buildings: t.buildings.length, surfaces: t.surfaces.length, roads: t.roadEdges.length, trees: t.trees.count,
      furniture: t.furniture.length, shops: t.shops.length, signals: t.signals.length, metro: t.metroEntrances.length, barriers: t.barriers.length,
    };
    perTile.push(row);
    // Part de la tuile située dans l'emprise demandée.
    const tb = M.tileBounds(t.tx, t.tz);
    const w = Math.max(0, Math.min(tb.maxX, B.maxX) - Math.max(tb.minX, B.minX)), h = Math.max(0, Math.min(tb.maxZ, B.maxZ) - Math.max(tb.minZ, B.minZ));
    row.shareInBounds = r2((w * h) / (512 * 512));
    if (row.shareInBounds > 0.2 && (row.surfaces === 0 || row.roads === 0 || (row.buildings === 0 && row.surfaces < 5))) empties.push(row.key);
  }
  check('Tuiles : aucune tuile vide dans l\'emprise', empties.length === 0, 'fail', `${empties.length} tuile(s) sans surface, sans voie ou sans contenu`, { empties, perTile });
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 2. Projection et repères
// ─────────────────────────────────────────────────────────────────────────────────────
{
  // Constantes du BRIEF comparées à l'ellipsoïde WGS84 à la latitude de l'origine.
  const phi = (M.ORIGIN_LAT * Math.PI) / 180;
  const mLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi) - 0.0023 * Math.cos(6 * phi);
  const mLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi);
  const eLat = (M.M_PER_DEG_LAT - mLat) / mLat, eLon = (M.M_PER_DEG_LON - mLon) / mLon;
  check('Projection : constantes du BRIEF proches de l\'ellipsoïde', Math.abs(eLat) < 0.002 && Math.abs(eLon) < 0.002, 'fail',
    `m/° de latitude ${M.M_PER_DEG_LAT} (WGS84 : ${r1(mLat)}, écart ${(eLat * 100).toFixed(3)} %) ; m/° de longitude ${M.M_PER_DEG_LON} (WGS84 : ${r1(mLon)}, écart ${(eLon * 100).toFixed(3)} %) — soit ${r1(Math.abs(eLon) * 6414)} m d'est en ouest et ${r1(Math.abs(eLat) * 3114)} m du nord au sud sur toute l'emprise`);
  const mb = M.boundsOfBbox(M.PARIS_BBOX);
  const sameBounds = ['minX', 'minZ', 'maxX', 'maxZ'].every((k) => Math.abs(mb[k] - B[k]) < 0.01);
  check('Projection : emprise du manifeste = emprise du BRIEF', sameBounds && manifest.origin.lat === 48.865633 && manifest.origin.lon === 2.321236 && manifest.tileSize === 512, 'fail',
    `x de ${r1(B.minX)} à ${r1(B.maxX)}, z de ${r1(B.minZ)} à ${r1(B.maxZ)} ; origine ${manifest.origin.lat}, ${manifest.origin.lon} ; tuile ${manifest.tileSize} m`);

  const byKey = new Map();
  for (const lm of landmarks) if (!byKey.has(lm.key)) byKey.set(lm.key, lm);
  const rows = [];
  let bad = 0;
  for (const [key, name, lat, lon] of REFERENCE_POINTS) {
    const ex = px(lon), ez = pz(lat);
    // Un monument en plusieurs morceaux a plusieurs entrées (palais_chaillot, palais_chaillot_passy) : on les prend toutes.
    const parts = landmarks.filter((l) => l.key === key || l.key.startsWith(key + '_'));
    if (parts.length === 0) { rows.push({ key, name, error: 'monument absent de landmarks.json' }); bad++; continue; }
    // Écart : distance de la référence à l'emprise du monument (0 si elle est dedans) ; l'ancrage est donné pour information.
    let dFoot = Infinity, dAnchor = Infinity, lm = parts[0];
    for (const part of parts) {
      const df = inRing(part.footprint, ex, ez) ? 0 : ringNearest(part.footprint, ex, ez).d;
      if (df < dFoot) { dFoot = df; lm = part; }
      dAnchor = Math.min(dAnchor, Math.hypot(part.x - ex, part.z - ez));
    }
    const ok = dFoot <= REFERENCE_TOLERANCE;
    if (!ok) bad++;
    rows.push({ key, name, expected: [r1(ex), r1(ez)], anchor: [r1(lm.x), r1(lm.z)], distanceToAnchor: r1(dAnchor), distanceToFootprint: r1(dFoot), ok });
  }
  const ds = rows.filter((r) => r.distanceToAnchor !== undefined).map((r) => r.distanceToAnchor).sort((a, b) => a - b);
  const inside = rows.filter((r) => r.distanceToFootprint === 0).length;
  check(`Repères : ${REFERENCE_POINTS.length} monuments à leur place`, bad === 0, 'fail',
    `${REFERENCE_POINTS.length - bad}/${REFERENCE_POINTS.length} : la position Wikidata tombe dans l'emprise publiée du monument (${inside}) ou à moins de ${REFERENCE_TOLERANCE} m d'elle ; écart à l'ancrage : médiane ${quantile(ds, 0.5)} m, maximum ${ds[ds.length - 1]} m (grands ensembles : Invalides, Chaillot)`, rows);

  // Écart systématique : s'il y avait une erreur de projection, les écarts auraient tous le même sens.
  const small = rows.filter((r) => r.distanceToAnchor !== undefined && r.distanceToAnchor < 25);
  const mx = small.reduce((s, r) => s + (r.anchor[0] - r.expected[0]), 0) / small.length, mz = small.reduce((s, r) => s + (r.anchor[1] - r.expected[1]), 0) / small.length;
  check('Repères : pas de décalage systématique', Math.hypot(mx, mz) < 6, 'fail', `décalage moyen sur ${small.length} repères ponctuels : ${r1(mx)} m vers l'est, ${r1(mz)} m vers le sud`);

  const o = byKey.get('obelisque_concorde');
  if (o !== undefined) check('Origine du monde et obélisque', Math.hypot(o.x, o.z) < 30, 'warn', `l'obélisque est à ${r1(Math.hypot(o.x, o.z))} m de l'origine (${r1(o.x)} ; ${r1(o.z)}) : l'origine du BRIEF est le centre de la place, pas le pied de l'obélisque`);

  const hrows = [];
  let hbad = 0;
  for (const [key, ref] of Object.entries(REFERENCE_HEIGHTS)) {
    const lm = byKey.get(key);
    if (lm === undefined) continue;
    const ok = Math.abs(lm.height - ref) <= ref * 0.15;
    if (!ok) hbad++;
    hrows.push({ key, height: lm.height, reference: ref, ok });
  }
  check('Monuments : hauteurs plausibles', hbad === 0, 'warn', `${hrows.length - hbad}/${hrows.length} hauteurs à 15 % près de la valeur de notoriété publique`, hrows);

  // Cohérence interne des monuments.
  const keys = new Set(landmarks.map((l) => l.key));
  const orphanB = new Set(), orphanE = new Set();
  let keyed = 0;
  for (const p of buildings) if (p.b.landmarkKey !== '') { keyed++; if (!keys.has(p.b.landmarkKey)) orphanB.add(p.b.landmarkKey); }
  for (const e of graph.edges) if (e.landmarkKey !== '' && !keys.has(e.landmarkKey)) orphanE.add(e.landmarkKey);
  // L'ancrage d'un palais en U est dans sa cour, hors de l'anneau : on demande seulement qu'il soit dans la boîte englobante.
  const outside = landmarks.filter((l) => { const b = bboxOf(l.footprint); return l.x < b.minX - 1 || l.x > b.maxX + 1 || l.z < b.minZ - 1 || l.z > b.maxZ + 1; }).map((l) => l.key);
  const dup = landmarks.map((l) => l.key).filter((k, i, a) => a.indexOf(k) !== i);
  check('Monuments : clés cohérentes', orphanB.size === 0 && orphanE.size === 0 && dup.length === 0, 'fail',
    `${landmarks.length} entrées, ${keyed} bâtiments et ${graph.edges.filter((e) => e.landmarkKey !== '').length} arêtes portent une clé ; clés inconnues : ${[...orphanB, ...orphanE].join(', ') || 'aucune'} ; clés en double : ${dup.join(', ') || 'aucune'}`);
  const inCourt = landmarks.filter((l) => !inRing(l.footprint, l.x, l.z) && ringNearest(l.footprint, l.x, l.z).d > 15).map((l) => l.key);
  check('Monuments : ancrage dans l\'emprise du monument', outside.length === 0, 'fail', `${outside.length} ancrage(s) hors de la boîte englobante de leur emprise : ${outside.join(', ') || 'aucun'} ; ${inCourt.length} dans une cour, à plus de 15 m du contour (${inCourt.join(', ') || 'aucun'})`);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 3. Hauteurs des bâtiments
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const hs = buildings.map((p) => p.b.height).sort((a, b) => a - b);
  const bins = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 35, 40, 50, 70, 1000];
  const hist = [];
  for (let i = 0; i + 1 < bins.length; i++) {
    const n = hs.filter((h) => h >= bins[i] && h < bins[i + 1]).length;
    hist.push({ from: bins[i], to: bins[i + 1], count: n, share: pct(n, hs.length) });
  }
  const tall = buildings.filter((p) => p.b.height > 60 && p.b.landmarkKey === '').map((p) => ({ id: p.b.id, h: p.b.height, name: p.b.name, at: [r1((p.minX + p.maxX) / 2), r1((p.minZ + p.maxZ) / 2)] }));
  const low = hs.filter((h) => h < 2.5).length;
  const med = quantile(hs, 0.5);
  check('Hauteurs : distribution parisienne', med >= 15 && med <= 26 && hs[0] > 0 && hs[hs.length - 1] <= 500, 'fail',
    `${hs.length} bâtiments ; médiane ${med} m, 5 % sous ${quantile(hs, 0.05)} m, 95 % sous ${quantile(hs, 0.95)} m, maximum ${hs[hs.length - 1]} m ; ${low} sous 2,5 m ; ${tall.length} de plus de 60 m hors monuments`,
    { hist, tallNonLandmark: tall.slice(0, 40) });
  // Niveaux : hauteur par niveau plausible.
  let badLv = 0;
  for (const p of buildings) { const per = p.b.height / p.b.levels; if (p.b.landmarkKey === '' && p.b.height > 6 && (per < 2.2 || per > 7)) badLv++; }
  check('Hauteurs : hauteur par niveau plausible', badLv / buildings.length < 0.02, 'warn', `${badLv} bâtiments de plus de 6 m (${pct(badLv, buildings.length)} %) ont moins de 2,2 m ou plus de 7 m par niveau`);
  // Base posée sur le relief.
  let off = 0, worst = 0;
  for (const p of buildings) {
    let min = Infinity;
    for (let i = 0; i < p.outer.length; i += 2) min = Math.min(min, heightAt(p.outer[i], p.outer[i + 1]));
    const d = Math.abs(p.b.baseY - min);
    if (d > 0.5) off++;
    if (d > worst) worst = d;
  }
  check('Hauteurs : base des bâtiments sur le relief', off / buildings.length < 0.01, 'warn', `${off} bâtiments dont la base s'écarte de plus de 0,5 m du point le plus bas du relief sous leur emprise (écart maximal ${r1(worst)} m)`);
  // Hauteur absente de la source (couche normalisée, si elle est là).
  const file = path.join(NORM, 'buildings.geojson');
  if (fs.existsSync(file)) {
    const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const none = fc.features.filter((f) => f.properties.height === null || f.properties.height === undefined || !(f.properties.height > 0)).length;
    const noLevels = fc.features.filter((f) => !(f.properties.levels > 0)).length;
    check('Hauteurs : part des bâtiments sans hauteur dans la source', none / fc.features.length < 0.1, 'warn',
      `${none} sur ${fc.features.length} emprises de la source (${pct(none, fc.features.length)} %) n'ont pas de hauteur : la leur est déduite des voisins ; ${noLevels} (${pct(noLevels, fc.features.length)} %) n'ont pas de nombre de niveaux`);
  } else {
    check('Hauteurs : part des bâtiments sans hauteur dans la source', false, 'warn', `couche normalisée absente (${file}) : non mesuré`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 4. Polygones
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const stat = { rings: 0, tooFew: 0, tinyArea: 0, wrongOrientation: 0, selfCrossing: 0, repeatedVertex: 0, holeOutside: 0 };
  const samples = [];
  const checkPoly = (what, outer, holes) => {
    const rings = [outer, ...holes];
    rings.forEach((r, k) => {
      stat.rings++;
      const n = r.length / 2;
      if (n < 3) { stat.tooFew++; samples.push(`${what} : anneau de ${n} sommets`); return; }
      const a = areaCcw(r);
      if (Math.abs(a) < 0.05) { stat.tinyArea++; if (samples.length < 40) samples.push(`${what} : aire ${a.toFixed(3)} m²`); }
      if ((k === 0) !== (a > 0)) { stat.wrongOrientation++; if (samples.length < 40) samples.push(`${what} : anneau ${k} mal orienté`); }
      for (let i = 0; i < r.length; i += 2) { const j = (i + 2) % r.length; if (r[i] === r[j] && r[i + 1] === r[j + 1]) { stat.repeatedVertex++; break; } }
      const x = ringSelfCrossings(r);
      if (x > 0) { stat.selfCrossing++; if (samples.length < 40) samples.push(`${what} : anneau ${k} se recoupe (${x} croisement(s)) vers ${r1(r[0])} ; ${r1(r[1])}`); }
      if (k > 0) {
        // Un trou est dans son contour : aucun sommet à plus de 15 cm dehors, aucun côté qui croise le contour.
        let outside = false;
        for (let i = 0; i < r.length && !outside; i += 2) if (!inRing(outer, r[i], r[i + 1]) && ringNearest(outer, r[i], r[i + 1]).d > 0.15) outside = true;
        for (let i = 0; i < r.length && !outside; i += 2) {
          const j = (i + 2) % r.length;
          for (let u = 0; u < outer.length; u += 2) {
            const v = (u + 2) % outer.length;
            if (properCross(r[i], r[i + 1], r[j], r[j + 1], outer[u], outer[u + 1], outer[v], outer[v + 1])) {
              // Croisement franc seulement si un bout du côté est nettement dehors.
              if ((!inRing(outer, r[i], r[i + 1]) && ringNearest(outer, r[i], r[i + 1]).d > 0.15) || (!inRing(outer, r[j], r[j + 1]) && ringNearest(outer, r[j], r[j + 1]).d > 0.15)) { outside = true; break; }
            }
          }
        }
        if (outside) { stat.holeOutside++; if (samples.length < 40) samples.push(`${what} : trou qui déborde du contour`); }
      }
    });
  };
  for (const p of buildings) checkPoly(`bâtiment ${p.b.id} (tuile ${p.tile})`, p.outer, p.holes);
  const bStat = { ...stat };
  for (const k of Object.keys(stat)) stat[k] = 0;
  let surfOut = 0, surfaces = 0;
  for (const t of tiles) {
    const tb = M.tileBounds(t.tx, t.tz);
    t.surfaces.forEach((s, i) => {
      surfaces++;
      checkPoly(`surface ${s.kind} n° ${i} (tuile ${t.tx}_${t.tz})`, s.outer, s.holes);
      const bb = bboxOf(s.outer);
      if (bb.minX < tb.minX - 0.06 || bb.maxX > tb.maxX + 0.06 || bb.minZ < tb.minZ - 0.06 || bb.maxZ > tb.maxZ + 0.06) surfOut++;
    });
  }
  const sStat = { ...stat };
  for (const k of Object.keys(stat)) stat[k] = 0;
  for (const lm of landmarks) checkPoly(`monument ${lm.key}`, lm.footprint, []);
  const lStat = { ...stat };
  const hard = (s) => s.tooFew + s.wrongOrientation + s.holeOutside;
  check('Polygones : structure valide (sommets, sens, trous)', hard(bStat) + hard(sStat) + hard(lStat) === 0, 'fail',
    `bâtiments : ${bStat.rings} anneaux, ${hard(bStat)} défauts ; surfaces : ${sStat.rings} anneaux, ${hard(sStat)} défauts ; monuments : ${lStat.rings} anneaux, ${hard(lStat)} défauts`,
    { buildings: bStat, surfaces: sStat, landmarks: lStat, samples });
  const cross = bStat.selfCrossing + sStat.selfCrossing + lStat.selfCrossing;
  check('Polygones : aucun contour qui se recoupe', cross === 0, 'fail', `${bStat.selfCrossing} bâtiments, ${sStat.selfCrossing} surfaces, ${lStat.selfCrossing} monuments ont un anneau qui se recoupe`);
  check('Polygones : aucune aire quasi nulle', bStat.tinyArea + sStat.tinyArea === 0, 'warn', `${bStat.tinyArea} anneaux de bâtiment et ${sStat.tinyArea} anneaux de surface de moins de 0,05 m²`);
  check('Polygones : surfaces découpées à leur tuile', surfOut === 0, 'fail', `${surfOut} surfaces sur ${surfaces} débordent de leur tuile`);

  // Bâtiments en double ou superposés : un point intérieur de l'un tombe dans un autre.
  const ids = new Set();
  let dupId = 0, overlap = 0, misTile = 0;
  const overlapSample = [];
  for (const p of buildings) {
    if (ids.has(p.b.id)) dupId++;
    ids.add(p.b.id);
    const ip = interiorPoint(p);
    if (ip !== null && ip.w > 0.6) {
      const o = buildingAt(ip.x, ip.z, p.idx);
      if (o >= 0) { overlap++; if (overlapSample.length < 30) overlapSample.push({ a: p.b.id, b: buildings[o].b.id, at: [r1(ip.x), r1(ip.z)], ha: p.b.height, hb: buildings[o].b.height }); }
    }
    // Le centre de la boîte englobante est dans la tuile, à l'arrondi du format près (11 cm).
    const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
    const [ttx, ttz] = p.tile.split('_').map(Number);
    if (cx < ttx * 512 - 0.11 || cx > (ttx + 1) * 512 + 0.11 || cz < ttz * 512 - 0.11 || cz > (ttz + 1) * 512 + 0.11) misTile++;
  }
  check('Bâtiments : identifiants uniques, rangés dans la bonne tuile', dupId === 0 && misTile === 0, 'fail', `${dupId} identifiants en double, ${misTile} bâtiments hors de la tuile de leur centre`);
  check('Bâtiments : aucun bâtiment posé sur un autre', overlap / buildings.length < 0.002, 'warn', `${overlap} bâtiments (${pct(overlap, buildings.length)} %) ont un point intérieur situé dans un autre bâtiment`, overlapSample);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 5. Graphe routier
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const N = graph.nodes.length, E = graph.edges.length;
  const find = (uf, i) => { while (uf[i] !== i) { uf[i] = uf[uf[i]]; i = uf[i]; } return i; };
  const components = (filter) => {
    const uf = new Int32Array(N).map((_, i) => i);
    const used = new Uint8Array(N);
    let edges = 0;
    graph.edges.forEach((e) => { if (!filter(e)) return; edges++; used[e.a] = used[e.b] = 1; const a = find(uf, e.a), b = find(uf, e.b); if (a !== b) uf[a] = b; });
    const byRoot = new Map();
    graph.edges.forEach((e) => { if (!filter(e)) return; const r = find(uf, e.a); const c = byRoot.get(r) ?? { edges: 0, length: 0 }; c.edges++; c.length += e.length; byRoot.set(r, c); });
    const list = [...byRoot.values()].sort((a, b) => b.edges - a.edges);
    const totalLen = list.reduce((s, c) => s + c.length, 0);
    return { edges, components: list.length, mainEdges: list[0]?.edges ?? 0, mainShare: pct(list[0]?.edges ?? 0, edges), mainLengthShare: pct(list[0]?.length ?? 0, totalLen), others: list.slice(1, 12).map((c) => ({ edges: c.edges, m: Math.round(c.length) })), uf };
  };
  const all = components(() => true);
  const drv = components(isDrivable);
  check('Graphe : connexité des voies carrossables', drv.mainShare >= 97, 'fail',
    `${drv.edges} arêtes carrossables en ${drv.components} composantes ; la plus grande porte ${drv.mainShare} % des arêtes et ${drv.mainLengthShare} % de la longueur (seuil 97 %)`, { others: drv.others });
  check('Graphe : connexité, voies piétonnes comprises', all.mainShare >= 90, 'warn',
    `${E} arêtes en ${all.components} composantes ; la plus grande porte ${all.mainShare} % des arêtes (${all.mainLengthShare} % de la longueur) : les autres sont des allées de jardin et des cheminements non reliés aux rues`, { others: all.others });

  // Forte connexité en respectant les sens uniques (Tarjan itératif) sur les voies carrossables.
  // Les nœuds de limite (bord de carte, bouche de tunnel) sont des entrées-sorties : un nœud fictif « dehors »,
  // d'indice N, relié dans les deux sens à chacun d'eux, représente le reste de la ville.
  const adj = Array.from({ length: N + 1 }, () => []);
  const drivNode = new Uint8Array(N + 1);
  graph.edges.forEach((e) => {
    if (!isDrivable(e)) return;
    drivNode[e.a] = drivNode[e.b] = 1;
    adj[e.a].push(e.b);
    if (!e.oneway) adj[e.b].push(e.a);
  });
  let portals = 0;
  for (let i = 0; i < N; i++) if (drivNode[i] && graph.nodes[i].boundary) { adj[i].push(N); adj[N].push(i); portals++; }
  const index = new Int32Array(N + 1).fill(-1), low = new Int32Array(N + 1), onStack = new Uint8Array(N + 1), comp = new Int32Array(N + 1).fill(-1);
  let idx = 0, ncomp = 0;
  const stack = [];
  for (let s = 0; s <= N; s++) {
    if (!drivNode[s] || index[s] !== -1) continue;
    const work = [[s, 0]];
    while (work.length > 0) {
      const top = work[work.length - 1], v = top[0];
      if (top[1] === 0) { index[v] = low[v] = idx++; stack.push(v); onStack[v] = 1; }
      if (top[1] < adj[v].length) {
        const w = adj[v][top[1]++];
        if (index[w] === -1) work.push([w, 0]); else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
      } else {
        if (low[v] === index[v]) { let w; do { w = stack.pop(); onStack[w] = 0; comp[w] = ncomp; } while (w !== v); ncomp++; }
        work.pop();
        if (work.length > 0) { const u = work[work.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
      }
    }
  }
  const sizes = new Map();
  let dn = 0;
  for (let i = 0; i < N; i++) if (drivNode[i]) { dn++; sizes.set(comp[i], (sizes.get(comp[i]) ?? 0) + 1); }
  const main = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0];
  // Nœuds hors de la composante forte principale, loin du bord (au bord, c'est attendu : la rue sort de la carte).
  let trapped = 0, trappedInner = 0;
  const trappedSample = [];
  for (let i = 0; i < N; i++) {
    if (!drivNode[i] || comp[i] === main[0]) continue;
    trapped++;
    const n = graph.nodes[i];
    if (n.x > B.minX + 300 && n.x < B.maxX - 300 && n.z > B.minZ + 300 && n.z < B.maxZ - 300) { trappedInner++; if (trappedSample.length < 25) trappedSample.push([r1(n.x), r1(n.z)]); }
  }
  check('Graphe : circulation possible en respectant les sens uniques', main[1] / dn >= 0.95, 'warn',
    `${main[1]} nœuds carrossables sur ${dn} (${pct(main[1], dn)} %) sont mutuellement atteignables en respectant les sens uniques, les ${portals} nœuds de limite servant d'entrées et de sorties ; ${trapped} ne le sont pas, dont ${trappedInner} à plus de 300 m du bord (poches desservies seulement par une rue piétonne ou une rampe de parking)`, { sample: trappedSample });

  // Arêtes en double, boucles, arêtes nulles.
  const seen = new Map();
  let loops = 0, zero = 0, dup = 0, badOneway = 0, badLanes = 0, badRef = 0;
  const dupSample = [];
  graph.edges.forEach((e, i) => {
    if (e.a === e.b) loops++;
    if (e.length < 0.3) zero++;
    if (e.oneway && e.lanesBackward !== 0) badOneway++;
    if (isDrivable(e) && e.lanesForward + e.lanesBackward < 1) badLanes++;
    if (!(e.a >= 0 && e.a < N && e.b >= 0 && e.b < N)) badRef++;
    const k = e.a < e.b ? `${e.a}_${e.b}` : `${e.b}_${e.a}`;
    const prev = seen.get(k);
    if (prev === undefined) { seen.set(k, [i]); return; }
    // Même paire de nœuds : doublon si les deux tracés se suivent à moins de 1 m.
    const n = e.points.length / 2, mid = Math.floor(n / 2);
    for (const j of prev) {
      const o = graph.edges[j];
      const dm = lineDist(o.points, e.points[2 * mid], e.points[2 * mid + 1]);
      const q = Math.floor(n / 4);
      const dq = lineDist(o.points, e.points[2 * q], e.points[2 * q + 1]);
      if (dm < 1 && dq < 1 && Math.abs(o.length - e.length) < 2) { dup++; if (dupSample.length < 25) dupSample.push({ edges: [j, i], name: e.name, cls: e.roadClass, length: r1(e.length), at: [r1(e.points[2 * mid]), r1(e.points[2 * mid + 1])] }); break; }
    }
    prev.push(i);
  });
  check('Graphe : aucune arête en double', dup === 0, 'fail', `${dup} arêtes doublent une autre arête entre les mêmes nœuds`, dupSample);
  // Chevauchement entre arêtes de nœuds différents : le milieu et les quarts d'une arête sont sur une autre arête.
  let over = 0;
  const overSample = [];
  graph.edges.forEach((e, i) => {
    if (e.length < 4) return;
    const n = e.points.length / 2;
    const probes = [];
    // Points à 25 %, 50 %, 75 % de la longueur.
    let acc = 0;
    const targets = [0.25 * e.length, 0.5 * e.length, 0.75 * e.length];
    let ti = 0;
    for (let k = 0; k + 1 < n && ti < 3; k++) {
      const ax = e.points[2 * k], az = e.points[2 * k + 1], bx = e.points[2 * k + 2], bz = e.points[2 * k + 3];
      const L = Math.hypot(bx - ax, bz - az);
      while (ti < 3 && acc + L >= targets[ti]) { const t = L === 0 ? 0 : (targets[ti] - acc) / L; probes.push([ax + (bx - ax) * t, az + (bz - az) * t]); ti++; }
      acc += L;
    }
    if (probes.length < 3) return;
    for (const j of eGrid.at(probes[1][0], probes[1][1])) {
      if (j <= i) continue;
      const o = graph.edges[j];
      if (o.a === e.a && o.b === e.b) continue;
      if (probes.every((p) => lineDist(o.points, p[0], p[1]) < 0.25)) { over++; if (overSample.length < 25) overSample.push({ edges: [i, j], names: [e.name, o.name], cls: [e.roadClass, o.roadClass], at: probes[1].map(r1) }); break; }
    }
  });
  check('Graphe : aucune arête superposée à une autre', over === 0, 'warn', `${over} arêtes ont leur quart, leur milieu et leurs trois quarts à moins de 25 cm d'une autre arête`, overSample);
  check('Graphe : aucune boucle ni arête nulle', loops === 0 && zero === 0 && badRef === 0, 'fail', `${loops} boucles (arête qui revient à son nœud de départ), ${zero} arêtes de moins de 30 cm, ${badRef} références de nœud invalides`);
  check('Graphe : sens uniques et voies cohérents', badOneway === 0 && badLanes === 0, 'fail', `${badOneway} sens uniques avec des voies à contresens, ${badLanes} voies carrossables sans voie`);
  const iso = graph.nodes.filter((n) => n.edges.length === 0).length;
  // Nœuds confondus : deux nœuds distincts à moins de 20 cm.
  const nGrid = new Map();
  let twin = 0;
  graph.nodes.forEach((n) => {
    const k = `${Math.round(n.x * 5)}_${Math.round(n.z * 5)}`;
    if (nGrid.has(k)) twin++; else nGrid.set(k, 1);
  });
  check('Graphe : aucun nœud isolé ni nœud confondu', iso === 0 && twin === 0, 'warn', `${iso} nœuds sans arête, ${twin} nœuds à moins de 20 cm d'un autre`);

  // Largeurs par classe.
  const byClass = {};
  for (const e of graph.edges) (byClass[e.roadClass] ??= []).push(e);
  const widths = {};
  for (const [cls, list] of Object.entries(byClass)) {
    const w = list.map((e) => e.width).sort((a, b) => a - b);
    const full = list.map((e) => e.width + 2 * e.sidewalk).sort((a, b) => a - b);
    widths[cls] = { edges: list.length, km: r1(list.reduce((s, e) => s + e.length, 0) / 1000), widthMin: w[0], widthMedian: quantile(w, 0.5), widthP95: quantile(w, 0.95), widthMax: w[w.length - 1], footprintMedian: r1(quantile(full, 0.5)), footprintMax: r1(full[full.length - 1]) };
  }
  // La plus large chaussée de l'emprise est l'anneau de la place Charles-de-Gaulle (36 à 38 m, douze files).
  const absurd = graph.edges.filter((e) => isDrivable(e) && (e.width < 2.5 || e.width > 40));
  const veryWide = graph.edges.filter((e) => isDrivable(e) && e.width > 26);
  const wideNames = [...new Set(veryWide.map((e) => e.name || '(sans nom)'))];
  const wide = graph.edges.filter((e) => e.width + 2 * e.sidewalk > 75).length;
  check('Voies : largeurs de chaussée plausibles', absurd.length === 0 && wideNames.length <= 3, 'fail',
    `${absurd.length} arêtes carrossables de moins de 2,5 m ou de plus de 40 m de chaussée ; ${veryWide.length} de plus de 26 m (${wideNames.join(', ') || 'aucune'}) ; ${wide} emprises (chaussée + trottoirs) de plus de 75 m`, widths);

  // Chaussée plus large que l'espace entre les façades ; axe qui traverse un bâtiment.
  let through = 0, throughLen = 0, squeezed = 0, measured = 0;
  const throughSample = [], squeezedSample = [];
  const gap = (x, z, nx, nz, max) => { for (let d = 0.5; d <= max; d += 0.5) if (buildingAt(x + nx * d, z + nz * d) >= 0) return d; return Infinity; };
  graph.edges.forEach((e, i) => {
    if (!isDrivable(e) || e.tunnel) return;
    let inside = 0, samples = 0;
    for (let k = 0; k + 3 < e.points.length; k += 2) {
      const ax = e.points[k], az = e.points[k + 1], bx = e.points[k + 2], bz = e.points[k + 3];
      const L = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.round(L / 4));
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        samples++;
        const hit = buildingAt(x, z);
        if (hit >= 0 && buildings[hit].b.landmarkKey === '') inside++;
      }
    }
    if (inside >= 2) {
      through++; throughLen += (inside / samples) * e.length;
      if (throughSample.length < 30) throughSample.push({ edge: i, name: e.name, cls: e.roadClass, insideM: r1((inside / samples) * e.length), length: r1(e.length), at: [r1(e.points[0]), r1(e.points[1])] });
    }
    // Espace entre façades au milieu de l'arête.
    const n = e.points.length / 2, m = Math.max(0, Math.floor(n / 2) - 1);
    const ax = e.points[2 * m], az = e.points[2 * m + 1], bx = e.points[2 * m + 2], bz = e.points[2 * m + 3];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 2 || e.bridge) return;
    const x = (ax + bx) / 2, z = (az + bz) / 2, nx = -(bz - az) / L, nz = (bx - ax) / L;
    if (buildingAt(x, z) >= 0) return;
    const dl = gap(x, z, nx, nz, 40), dr = gap(x, z, -nx, -nz, 40);
    if (!Number.isFinite(dl) || !Number.isFinite(dr)) return;
    measured++;
    if (e.width > dl + dr + 1) { squeezed++; if (squeezedSample.length < 30) squeezedSample.push({ edge: i, name: e.name, width: e.width, facades: r1(dl + dr), at: [r1(x), r1(z)] }); }
  });
  check('Voies : aucune chaussée plus large que l\'espace entre façades', squeezed / Math.max(1, measured) < 0.005, 'warn',
    `${squeezed} arêtes carrossables sur ${measured} mesurées (${pct(squeezed, measured)} %) ont une chaussée plus large que la distance entre les façades de part et d'autre`, squeezedSample);
  check('Voies : axes qui traversent un bâtiment', throughLen < 6000, 'warn',
    `${through} arêtes carrossables passent sous ou à travers un bâtiment sur ${Math.round(throughLen)} m au total (porches et passages couverts, que le format ne marque pas)`, throughSample);

  // Feux : chaque support désigne un nœud à feux proche.
  let sig = 0, sigBad = 0, sigFar = 0, sigNone = 0;
  for (const t of tiles) for (const s of t.signals) {
    sig++;
    if (s.node < 0) { sigNone++; continue; }
    const n = graph.nodes[s.node];
    if (n === undefined || !n.signal) { sigBad++; continue; }
    if (Math.hypot(n.x - s.x, n.z - s.z) > 45) sigFar++;
  }
  check('Feux : supports rattachés à un nœud à feux', sigBad === 0 && sigFar / Math.max(1, sig) < 0.02, 'fail', `${sig} supports ; ${sigNone} sans nœud ; ${sigBad} désignent un nœud sans feu ; ${sigFar} sont à plus de 45 m de leur nœud`);
  const flags = { signal: graph.nodes.filter((n) => n.signal).length, crossing: graph.nodes.filter((n) => n.crossing).length, boundary: graph.nodes.filter((n) => n.boundary).length };
  // Un nœud de limite est au bord des données, ou c'est la bouche d'un souterrain : dans les deux cas une seule arête carrossable y aboutit.
  let edgeB = 0, mouthB = 0, badB = 0;
  for (const n of graph.nodes) {
    if (!n.boundary) continue;
    const drv = n.edges.filter((i) => isDrivable(graph.edges[i])).length;
    if (!inBounds(n.x, n.z, -30)) { edgeB++; if (n.edges.length !== 1) badB++; }
    else { mouthB++; if (drv !== 1) badB++; }
  }
  check('Graphe : nœuds de limite en bout de voie', badB === 0 && edgeB > 50, 'fail', `${flags.boundary} nœuds de limite : ${edgeB} au bord de la carte, ${mouthB} bouches de souterrain à l'intérieur ; ${badB} ne sont pas un bout de voie ; ${flags.signal} nœuds à feux, ${flags.crossing} passages piétons`);

  // Références d'arêtes par tuile : recalcul indépendant de la règle (emprise = demi-chaussée + trottoir).
  const refs = M.computeTileEdgeRefs(graph);
  let refDiff = 0;
  for (const t of tiles) {
    const want = refs.get(M.tileKey(t.tx, t.tz)) ?? [];
    if (want.length !== t.roadEdges.length || want.some((v, i) => v !== t.roadEdges[i])) refDiff++;
  }
  check('Tuiles : listes d\'arêtes exactes', refDiff === 0, 'fail', `${refDiff} tuile(s) dont la liste d'arêtes diffère de la règle du format`);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 6. Largeur des Champs-Élysées, mesurée de façade à façade
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const gap = (x, z, nx, nz, max) => { for (let d = 0.5; d <= max; d += 0.5) if (buildingAt(x + nx * d, z + nz * d) >= 0) return d; return Infinity; };
  // Largeur entre façades : une mesure tous les 10 m le long des arêtes principales de la voie (les contre-allées
  // homonymes, plus étroites, sont écartées). On retient le quartile bas : à un carrefour ou devant une place,
  // l'écart entre façades ne peut que grandir, jamais rétrécir.
  const measure = (name, official, onlyIf = () => true) => {
    const all = graph.edges.filter((e) => e.name === name && isDrivable(e) && e.roadClass !== 'service');
    const wmax = all.reduce((m, e) => Math.max(m, e.width), 0);
    const fac = [], foot = [], road = [];
    for (const e of all) {
      let used = false;
      for (let k = 0; k + 3 < e.points.length; k += 2) {
        const ax = e.points[k], az = e.points[k + 1], bx = e.points[k + 2], bz = e.points[k + 3];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 3) continue;
        const nx = -(bz - az) / L, nz = (bx - ax) / L, steps = Math.max(1, Math.round(L / 10));
        for (let q = 0; q < steps; q++) {
          const t = (q + 0.5) / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          if (!onlyIf(x, z) || buildingAt(x, z) >= 0) continue;
          used = true;
          const dl = gap(x, z, nx, nz, 70), dr = gap(x, z, -nx, -nz, 70);
          if (Number.isFinite(dl) && Number.isFinite(dr)) fac.push(dl + dr);
        }
      }
      // Chaussée et emprise du graphe : sur les arêtes principales seulement (les contre-allées homonymes sont plus étroites).
      if (used && e.width >= 0.6 * wmax) { road.push(e.width); foot.push(e.width + 2 * e.sidewalk); }
    }
    fac.sort((a, b) => a - b); foot.sort((a, b) => a - b); road.sort((a, b) => a - b);
    // Valeur la plus fréquente (classes de 2 m) : c'est la largeur de la rue courante, hors carrefours et places.
    const bins = new Map();
    for (const v of fac) { const k = Math.floor(v / 2); bins.set(k, (bins.get(k) ?? 0) + 1); }
    let top = -1, topN = 0;
    for (const [k, n] of bins) if (n > topN || (n === topN && k < top)) { top = k; topN = n; }
    const inTop = fac.filter((v) => Math.floor(v / 2) === top);
    const mode = inTop.length > 0 ? inTop.reduce((a, b) => a + b, 0) / inTop.length : NaN;
    return { name, official, edges: road.length, roadMedian: quantile(road, 0.5), footprintMedian: r1(quantile(foot, 0.5)), facadesMode: r1(mode), facadesQ1: r1(quantile(fac, 0.25)), facadesMedian: r1(quantile(fac, 0.5)), facadesSamples: fac.length };
  };
  // Haut de l'avenue (du Rond-Point à l'Étoile) : seule partie bordée d'immeubles des deux côtés.
  const rp = px(2.3096);
  // Largeurs officielles (nomenclature des voies de la Ville de Paris, arrondies au mètre).
  const rows = [
    measure('Avenue des Champs-Élysées', 70, (x) => x < rp),
    measure('Avenue de la Grande Armée', 70), measure('Boulevard Haussmann', 30), measure('Boulevard de Sébastopol', 30),
    measure('Boulevard Saint-Germain', 30), measure('Rue de Rivoli', 21), measure('Avenue de l\'Opéra', 30), measure('Boulevard Beaumarchais', 35),
    measure('Avenue Kléber', 36), measure('Boulevard Saint-Michel', 30), measure('Rue La Fayette', 20), measure('Boulevard Voltaire', 30),
    measure('Boulevard de Magenta', 30), measure('Avenue Marceau', 40), measure('Rue Saint-Antoine', 22), measure('Boulevard Malesherbes', 34),
  ];
  const ce = rows[0];
  const usable = rows.filter((r) => r.facadesSamples >= 8);
  const bad = usable.filter((r) => Math.abs(r.facadesMode - r.official) > Math.max(4, r.official * 0.15));
  check('Champs-Élysées : 70 m de façade à façade', ce.edges > 0 && Math.abs(ce.facadesMode - 70) <= 4 && Math.abs(ce.footprintMedian - 70) <= 8, 'fail',
    `entre le Rond-Point et l'Étoile : ${ce.facadesMode} m entre façades (valeur la plus fréquente de ${ce.facadesSamples} mesures sur les bâtiments publiés ; médiane ${ce.facadesMedian} m), emprise du graphe ${ce.footprintMedian} m (chaussée ${ce.roadMedian} m + 2 trottoirs), pour 70 m officiels`);
  check('Voies : largeurs entre façades des grands axes', bad.length === 0, 'warn',
    `${usable.length - bad.length}/${usable.length} grands axes à 15 % près de leur largeur officielle (valeur la plus fréquente de l'écart entre façades)${bad.length ? ' ; hors tolérance : ' + bad.map((r) => `${r.name} ${r.facadesMode} m (${r.official})`).join(', ') : ''}`, rows);
  // Chaussée du graphe comparée à la chaussée du plan de voirie (bordure à bordure), au milieu de chaque arête
  // carrossable de plus de 25 m, quand elle est seule dans sa chaussée (pas de chaussée parallèle du même boulevard).
  const ratios = [], narrowBy = new Map();
  let offCentre = 0, measuredK = 0, noSurface = 0;
  graph.edges.forEach((e, i) => {
    if (!isDrivable(e) || e.bridge || e.roadClass === 'service' || e.length < 25) return;
    let acc = 0, x = 0, z = 0, tx = 1, tz = 0;
    for (let k = 0; k + 3 < e.points.length; k += 2) {
      const L = Math.hypot(e.points[k + 2] - e.points[k], e.points[k + 3] - e.points[k + 1]);
      if (L > 0 && acc + L >= e.length / 2) { const t = (e.length / 2 - acc) / L; x = e.points[k] + (e.points[k + 2] - e.points[k]) * t; z = e.points[k + 1] + (e.points[k + 3] - e.points[k + 1]) * t; tx = (e.points[k + 2] - e.points[k]) / L; tz = (e.points[k + 3] - e.points[k + 1]) / L; break; }
      acc += L;
    }
    if (!onRoadSurface(x, z)) { noSurface++; return; }
    const ext = (side) => { let d = 0; while (d < 30 && onRoadSurface(x - tz * side * (d + 0.25), z + tx * side * (d + 0.25))) d += 0.25; return d; };
    const dl = ext(1), dr = ext(-1), kerb = dl + dr;
    if (kerb >= 59) return;
    for (const j of eGrid.near(x, z, kerb)) {
      if (j === i) continue;
      const o = graph.edges[j];
      if (!isDrivable(o) || o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) continue;
      if (lineDist(o.points, x, z) < kerb) return;
    }
    measuredK++;
    ratios.push(e.width / kerb);
    if (Math.abs(dl - dr) > 3) offCentre++;
    if (e.width < 0.6 * kerb && kerb - e.width > 3) { const k = e.name || '(sans nom)'; const c = narrowBy.get(k) ?? { n: 0, w: 0, kerb: 0 }; c.n++; c.w += e.width; c.kerb += kerb; narrowBy.set(k, c); }
  });
  ratios.sort((a, b) => a - b);
  const narrowCount = [...narrowBy.values()].reduce((n, c) => n + c.n, 0);
  const worstStreets = [...narrowBy].sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([k, c]) => ({ name: k, edges: c.n, graph: r1(c.w / c.n), kerbToKerb: r1(c.kerb / c.n) }));
  check('Voies : chaussée du graphe et chaussée du plan de voirie', quantile(ratios, 0.5) >= 0.9, 'warn',
    `sur ${measuredK} arêtes seules dans leur chaussée, la largeur du graphe vaut ${Math.round(quantile(ratios, 0.5) * 100)} % (médiane) de la largeur de bordure à bordure des polygones « road » : c'est la largeur roulable (voies de circulation), sans les files de stationnement ni les pistes cyclables ; ${narrowCount} arêtes sont à moins de 60 % (${worstStreets.slice(0, 4).map((w) => `${w.name} ${w.graph} m pour ${w.kerbToKerb} m`).join(', ')}) ; ${offCentre} axes sont décentrés de plus de 3 m dans leur chaussée ; ${noSurface} arêtes n'ont pas de polygone de chaussée sous leur milieu`,
    { quartiles: [r2(quantile(ratios, 0.25)), r2(quantile(ratios, 0.5)), r2(quantile(ratios, 0.75))], worstStreets });
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 7. Commerces
// ─────────────────────────────────────────────────────────────────────────────────────
{
  let n = 0, noBuilding = 0, offFacade = 0, inward = 0, skew = 0, blind = 0, dupPos = 0, dupId = 0, farStreet = 0;
  const ids = new Set(), pos = new Set();
  const sample = { inward: [], blind: [], offFacade: [] };
  const cats = {};
  for (const t of tiles) {
    for (const s of t.shops) {
      n++;
      cats[s.category] = (cats[s.category] ?? 0) + 1;
      if (ids.has(s.id)) dupId++;
      ids.add(s.id);
      const pk = `${Math.round(s.x * 2)}_${Math.round(s.z * 2)}`;
      if (pos.has(pk)) dupPos++;
      pos.add(pk);
      const p = buildingById.get(s.buildingId);
      if (p === undefined) { noBuilding++; continue; }
      // Côté de façade le plus proche (contour ou cour).
      let near = ringNearest(p.outer, s.x, s.z), ring = p.outer, isHole = false;
      for (const h of p.holes) { const q = ringNearest(h, s.x, s.z); if (q.d < near.d) { near = q; ring = h; isHole = true; } }
      if (near.d > 1.5) { offFacade++; if (sample.offFacade.length < 15) sample.offFacade.push({ id: s.id, d: r1(near.d), at: [r1(s.x), r1(s.z)] }); continue; }
      const nx = Math.sin(s.heading), nz = Math.cos(s.heading);
      // La normale doit SORTIR : 1 m devant la vitrine on est dehors, 1 m derrière on est dedans.
      const out = !inPoly(p, s.x + nx * 1, s.z + nz * 1), back = inPoly(p, s.x - nx * 1, s.z - nz * 1);
      if (!out || !back) {
        // Départage sur un mur très mince ou un angle : on compare à la normale géométrique du côté.
        const j = (near.i + 2) % ring.length;
        const ex = ring[j] - ring[near.i], ez = ring[j + 1] - ring[near.i + 1], L = Math.hypot(ex, ez) || 1;
        // Anneau antihoraire (nord en haut) : la matière est à gauche, la normale sortante est (-ez, ex) dans (x, z).
        const ox = -ez / L, oz = ex / L;
        const dot = nx * ox + nz * oz;
        if (dot < 0) { inward++; if (sample.inward.length < 15) sample.inward.push({ id: s.id, at: [r1(s.x), r1(s.z)], building: s.buildingId, hole: isHole }); }
        else if (dot < Math.SQRT1_2) skew++;
      }
      // Vitrine aveugle : 2 m devant, on est dans un AUTRE bâtiment (mur mitoyen).
      const o = buildingAt(s.x + nx * 2, s.z + nz * 2, p.idx);
      if (o >= 0) { blind++; if (sample.blind.length < 15) sample.blind.push({ id: s.id, at: [r1(s.x), r1(s.z)], building: s.buildingId, other: buildings[o].b.id }); }
      // Une vitrine donne sur une voie : une arête du graphe à moins de 45 m.
      let dmin = Infinity;
      for (const i of eGrid.near(s.x, s.z, 45)) { const d = lineDist(graph.edges[i].points, s.x, s.z); if (d < dmin) dmin = d; }
      if (dmin > 45) farStreet++;
    }
  }
  check('Commerces : rattachés à un bâtiment, sur sa façade', noBuilding === 0 && offFacade === 0 && dupId === 0, 'fail', `${n} commerces ; ${noBuilding} sans bâtiment, ${offFacade} à plus de 1,5 m de la façade, ${dupId} identifiants en double`, sample.offFacade);
  check('Commerces : la normale sort du bâtiment', inward === 0, 'fail', `${inward} vitrines tournées vers l'intérieur du bâtiment ; ${skew} de biais (plus de 45° de la normale de leur façade)`, sample.inward);
  check('Commerces : aucune vitrine contre un mur mitoyen', blind / n < 0.005, 'warn', `${blind} vitrines (${pct(blind, n)} %) ont un autre bâtiment à 2 m devant elles`, sample.blind);
  check('Commerces : vitrines sur rue', farStreet / n < 0.01, 'warn', `${farStreet} vitrines (${pct(farStreet, n)} %) à plus de 45 m de toute voie du graphe ; ${dupPos} paires à moins de 50 cm l'une de l'autre`, cats);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 8. Arbres, mobilier, métro
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const onRoad = (x, z) => {
    for (const i of eGrid.at(x, z)) {
      const e = graph.edges[i];
      if (!isDrivable(e) || e.bridge || e.roadClass === 'service') continue;
      if (lineDist(e.points, x, z) < e.width / 2 - 1.2) return true;
    }
    return false;
  };
  // Les ponts franchissent les polygones d'eau : un point sur un tablier n'est pas dans l'eau. Le tablier, c'est une
  // surface dure au-dessus de l'eau, ou à défaut l'emprise d'une arête de pont (demi-chaussée + trottoir + 1 m).
  const onDeck = (x, z) => {
    // Un candélabre de parapet est posé sur le bord même du tablier : on accepte 60 cm d'écart.
    if (onPaved(x, z)) return true;
    for (let k = 0; k < 8; k++) if (onPaved(x + Math.cos((k * Math.PI) / 4) * 0.6, z + Math.sin((k * Math.PI) / 4) * 0.6)) return true;
    for (const i of eGrid.near(x, z, 40)) {
      const e = graph.edges[i];
      if (e.bridge && lineDist(e.points, x, z) <= e.width / 2 + e.sidewalk + 1) return true;
    }
    return false;
  };
  // Seuls le fleuve et les grands plans d'eau comptent : une statue ou un jet d'eau a sa place dans un bassin.
  // Un objet posé sur le parapet, pile sur le bord du polygone d'eau, n'est pas « dans l'eau » : il faut y être de 50 cm.
  const deepIn = (w, x, z) => { let d = ringNearest(w.outer, x, z).d; for (const h of w.holes) d = Math.min(d, ringNearest(h, x, z).d); return d > 0.5; };
  const bigWater = (x, z) => wGrid.at(x, z).some((i) => inPoly(waters[i], x, z) && (Math.abs(waters[i].s.level - manifest.waterLevel) < 0.01 || waters[i].s.name.startsWith('Bassin ') || waters[i].s.name.includes('cluse')) && deepIn(waters[i], x, z));
  const inOpenWater = (x, z) => bigWater(x, z) && !onDeck(x, z);
  let trees = 0, tInB = 0, tInW = 0, tOnRoad = 0, tDup = 0;
  const tp = new Set();
  for (const t of tiles) {
    const s = t.trees;
    for (let i = 0; i < s.count; i++) {
      trees++;
      const x = s.x[i], z = s.z[i];
      const k = `${Math.round(x * 2)}_${Math.round(z * 2)}`;
      if (tp.has(k)) tDup++;
      tp.add(k);
      if (buildingAt(x, z) >= 0) tInB++;
      else if (inOpenWater(x, z)) tInW++;
      else if (onRoad(x, z)) tOnRoad++;
    }
  }
  check('Arbres : ni dans un bâtiment, ni dans l\'eau', tInB === 0 && tInW === 0, 'fail', `${trees} arbres ; ${tInB} dans un bâtiment, ${tInW} dans le fleuve ou un canal (hors tabliers de pont), ${tDup} en double (moins de 50 cm)`);
  check('Arbres : aucun au milieu d\'une chaussée', tOnRoad / trees < 0.01, 'warn', `${tOnRoad} arbres (${pct(tOnRoad, trees)} %) à plus de 1,2 m à l'intérieur de la chaussée d'une arête carrossable`);
  let fur = 0, fInB = 0, fInW = 0, fOnRoad = 0, fOnDeck = 0;
  const kinds = {}, wet = {};
  for (const t of tiles) for (const f of t.furniture) {
    fur++;
    kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
    if (buildingAt(f.x, f.z) >= 0) fInB++;
    else if (bigWater(f.x, f.z)) { if (onDeck(f.x, f.z)) fOnDeck++; else { fInW++; wet[f.kind] = (wet[f.kind] ?? 0) + 1; } }
    else if (onRoad(f.x, f.z)) fOnRoad++;
  }
  check('Mobilier : ni dans un bâtiment, ni dans l\'eau', fInB === 0 && fInW === 0, 'fail', `${fur} objets ; ${fInB} dans un bâtiment, ${fInW} dans le fleuve ou un canal, ${fOnDeck} sur un tablier de pont (au-dessus de l'eau, ce qui est normal)`, { kinds, inWater: wet });
  let sg = 0, sInB = 0, sInW = 0;
  for (const t of tiles) for (const q of t.signals) { sg++; if (buildingAt(q.x, q.z) >= 0) sInB++; else if (inOpenWater(q.x, q.z)) sInW++; }
  check('Feux : supports ni dans un bâtiment, ni dans l\'eau', sInB === 0 && sInW === 0, 'fail', `${sg} supports ; ${sInB} dans un bâtiment, ${sInW} dans le fleuve ou un canal`);
  check('Mobilier : aucun au milieu d\'une chaussée', fOnRoad / fur < 0.02, 'warn', `${fOnRoad} objets (${pct(fOnRoad, fur)} %) à plus de 1,2 m à l'intérieur de la chaussée d'une arête carrossable`);
  let me = 0, mInB = 0, mInW = 0, mNoName = 0;
  const stations = new Map();
  const mInside = [];
  for (const t of tiles) for (const m of t.metroEntrances) {
    me++;
    if (m.name === '') mNoName++;
    stations.set(m.name, (stations.get(m.name) ?? 0) + 1);
    const hit = buildingAt(m.x, m.z);
    // Dans un bâtiment : à plus de 30 cm de son contour (en deçà, c'est l'arrondi d'un point posé contre la façade).
    if (hit >= 0 && ringNearest(buildings[hit].outer, m.x, m.z).d > 0.3) { mInB++; mInside.push(m.name); } else if (inWater(m.x, m.z)) mInW++;
  }
  const wanted = ['Concorde', 'Charles de Gaulle - Étoile', 'République', 'Bastille', 'Châtelet', 'Opéra', 'Trocadéro', 'Invalides', 'Cité', 'Hôtel de Ville', 'Madeleine', 'Franklin D. Roosevelt', 'George V', 'Palais Royal - Musée du Louvre', 'Saint-Michel', 'Tuileries', 'Champs-Élysées - Clemenceau', 'Assemblée Nationale'];
  const names = [...stations.keys()];
  const missing = wanted.filter((w) => !names.some((nm) => norm(nm) === norm(w)));
  check('Métro : bouches nommées, hors des bâtiments', mNoName === 0 && mInW === 0 && mInB <= 4, 'fail', `${me} bouches pour ${stations.size} stations ; ${mNoName} sans nom, ${mInB} restées dans l'emprise d'un bâtiment${mInB ? ' (' + [...new Set(mInside)].join(', ') + ' : halle de gare dont l\'emprise recouvre le parvis)' : ''}, ${mInW} dans l'eau`);
  check('Métro : grandes stations présentes', missing.length === 0, 'fail', `${wanted.length - missing.length}/${wanted.length} stations attendues ont au moins une bouche${missing.length ? ' ; absentes : ' + missing.join(', ') : ''}`, Object.fromEntries([...stations].sort((a, b) => b[1] - a[1]).slice(0, 30)));
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 9. Relief
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const rows = REFERENCE_ALTITUDES.map(([name, lat, lon, ngf]) => ({ name, y: r2(heightAt(px(lon), pz(lat))), ngf }));
  const c0 = rows[0];
  let worst = 0;
  for (const r of rows) { r.expectedY = r.ngf - c0.ngf; r.error = r2(r.y - r.expectedY); worst = Math.max(worst, Math.abs(r.error)); }
  const etoile = rows[1].y, concorde = rows[0].y;
  check('Relief : y = 0 à l\'origine', Math.abs(heightAt(0, 0)) < 0.3, 'fail', `altitude à l'origine : ${r2(heightAt(0, 0))} m`);
  check('Relief : l\'Étoile domine la Concorde', etoile - concorde > 20 && etoile - concorde < 30, 'fail', `Étoile ${etoile} m, Concorde ${concorde} m : ${r1(etoile - concorde)} m de dénivelée (25 m attendus)`);
  check('Relief : différences de niveau conformes aux altitudes connues', worst <= 3, 'fail', `écart maximal ${r1(worst)} m sur ${rows.length} repères (altitudes NGF de notoriété publique, au mètre près)`, rows);
  check('Relief : niveau de la Seine', Math.abs(manifest.waterLevel - (SEINE_NGF - c0.ngf)) < 1.5, 'fail', `waterLevel ${manifest.waterLevel} m ; retenue normale ${SEINE_NGF} m NGF, soit ${r1(SEINE_NGF - c0.ngf)} m sous la Concorde (33 m NGF environ)`);

  // Pentes dans l'emprise.
  let maxSlope = 0, steep = 0, pairs = 0, minY = Infinity, maxY = -Infinity;
  for (let iz = 0; iz < terrain.nz; iz++) {
    for (let ix = 0; ix < terrain.nx; ix++) {
      const x = terrain.x0 + ix * terrain.step, z = terrain.z0 + iz * terrain.step;
      if (!inBounds(x, z)) continue;
      const h = terrain.heights[iz * terrain.nx + ix];
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        if (ix + dx >= terrain.nx || iz + dz >= terrain.nz) continue;
        const s = Math.abs(terrain.heights[(iz + dz) * terrain.nx + ix + dx] - h) / terrain.step;
        pairs++;
        if (s > 0.08) steep++;
        if (s > maxSlope) maxSlope = s;
      }
    }
  }
  check('Relief : pentes douces', maxSlope < 0.25, 'fail', `dans l'emprise : de ${r2(minY)} à ${r2(maxY)} m ; pente maximale ${r1(maxSlope * 100)} % ; ${steep} paires de nœuds voisins sur ${pairs} au-delà de 8 %`);

  // Surfaces d'eau : niveau imposé partout ; le fleuve est au niveau du manifeste.
  let noLevel = 0, river = 0, riverArea = 0, otherWater = 0;
  for (const w of waters) {
    if (w.s.level === null) noLevel++;
    else if (Math.abs(w.s.level - manifest.waterLevel) < 0.01) { river++; riverArea += Math.abs(areaCcw(w.outer)); } else otherWater++;
  }
  check('Eau : chaque plan d\'eau porte son niveau', noLevel === 0 && river > 0, 'fail', `${waters.length} morceaux d'eau ; ${river} au niveau du fleuve (${r1(riverArea / 10000)} ha), ${otherWater} à un autre niveau (canaux, bassins), ${noLevel} sans niveau`);

  // Murs de quai : chacun borde une eau à ciel ouvert. (La BD TOPO trace aussi les quais du canal Saint-Martin sous sa
  // voûte, du Faubourg-du-Temple à l'Arsenal : en surface, sur le boulevard Richard-Lenoir, il n'y a ni eau ni mur.)
  let quayM = 0, strayM = 0, quayPieces = 0;
  const straySample = [];
  const distToWater = (x, z) => {
    let best = Infinity;
    for (const i of wGrid.near(x, z, 60)) {
      const w = waters[i];
      if (inPoly(w, x, z)) return 0;
      best = Math.min(best, ringNearest(w.outer, x, z).d);
      for (const h of w.holes) best = Math.min(best, ringNearest(h, x, z).d);
    }
    return best;
  };
  for (const t of tiles) {
    for (const b of t.barriers) {
      if (b.kind !== 'quay_wall') continue;
      quayPieces++;
      for (let i = 0; i + 3 < b.points.length; i += 2) {
        const ax = b.points[i], az = b.points[i + 1], bx = b.points[i + 2], bz = b.points[i + 3];
        const L = Math.hypot(bx - ax, bz - az);
        quayM += L;
        if (distToWater((ax + bx) / 2, (az + bz) / 2) > 50) { strayM += L; if (straySample.length < 12) straySample.push([r1((ax + bx) / 2), r1((az + bz) / 2)]); }
      }
    }
  }
  check('Barrières : murs de quai au bord de l\'eau', strayM < 20, 'fail', `${quayPieces} morceaux de mur de quai, ${r1(quayM / 1000)} km ; ${Math.round(strayM)} m à plus de 50 m de toute eau à ciel ouvert`, straySample);

  // Quais : au bord du fleuve, le sol est-il au-dessus de l'eau ? Mesuré sur les arêtes nommées « Quai … » et « Port … ».
  const quay = [], port = [];
  for (const e of graph.edges) {
    const m = Math.floor(e.points.length / 4) * 2;
    const y = heightAt(e.points[m], e.points[m + 1]) - manifest.waterLevel;
    if (/^Quai /.test(e.name) && isDrivable(e) && !e.bridge) quay.push(y);
    else if (/^(Port|Promenade|Voie Georges)/.test(e.name)) port.push(y);
  }
  quay.sort((a, b) => a - b); port.sort((a, b) => a - b);
  check('Relief : les quais hauts dominent le fleuve', quay.length > 50 && quantile(quay, 0.05) > 2, 'fail',
    `${quay.length} arêtes de quai : de ${r1(quay[0])} à ${r1(quay[quay.length - 1])} m au-dessus de l'eau, médiane ${r1(quantile(quay, 0.5))} m ; ${port.length} arêtes de port ou de berge : médiane ${r1(quantile(port, 0.5))} m, minimum ${r1(port[0] ?? NaN)} m`);

  // Ponts. Le moteur ne suit pas le relief sous un pont : il relie en ligne droite l'altitude du relief aux deux
  // bouts de la chaîne d'arêtes de pont (src/world/query/roads.ts, buildBridges). On vérifie donc l'altitude du
  // relief à ces bouts : c'est elle qui fixe la hauteur du tablier au-dessus de l'eau.
  const interior = (n) => graph.nodes[n].edges.length >= 2 && graph.nodes[n].edges.every((i) => graph.edges[i].bridge);
  const byName = new Map();
  graph.edges.forEach((e) => { if (e.bridge && e.name !== '') { const a = byName.get(e.name) ?? []; a.push(e); byName.set(e.name, a); } });
  const decks = [];
  for (const [name, list] of byName) {
    const ends = [];
    let len = 0, overWater = 0;
    for (const e of list) {
      len += e.length;
      for (const n of [e.a, e.b]) if (!interior(n)) ends.push(r1(heightAt(graph.nodes[n].x, graph.nodes[n].z) - manifest.waterLevel));
      const n2 = e.points.length / 2, i0 = Math.max(0, Math.floor(n2 / 2) - 1);
      if (inWater((e.points[2 * i0] + e.points[2 * i0 + 2]) / 2, (e.points[2 * i0 + 1] + e.points[2 * i0 + 3]) / 2)) overWater++;
    }
    if (ends.length === 0) continue;
    decks.push({ name, edges: list.length, length: Math.round(len), overWater: overWater > 0, endsAboveWater: ends, min: Math.min(...ends), max: Math.max(...ends) });
  }
  const seine = decks.filter((d) => d.overWater && Math.abs(d.min) < 30);
  const low = seine.filter((d) => d.min < 4), tilted = seine.filter((d) => d.max - d.min > 4);
  seine.sort((a, b) => a.min - b.min);
  check('Ponts : tabliers au-dessus de l\'eau', low.length === 0, 'warn',
    `${seine.length} ponts nommés franchissent l'eau ; bouts de tablier de ${seine[0]?.min} à ${Math.max(...seine.map((d) => d.max))} m au-dessus de l'eau ; ${low.length} ont un bout à moins de 4 m de l'eau${low.length ? ' (' + low.map((d) => `${d.name} ${d.min} m`).join(', ') + ')' : ''} ; ${tilted.length} ont plus de 4 m d'écart entre leurs bouts${tilted.length ? ' (' + tilted.map((d) => `${d.name} ${d.min}→${d.max} m`).join(', ') + ')' : ''}`, decks);
  // Largeur des tabliers. Le moteur prend pour tablier les surfaces dures qui recouvrent l'eau ; l'arête (chaussée +
  // 2 trottoirs) ne sert qu'à défaut. On mesure les deux au milieu de chaque pont et on compare aux largeurs connues.
  const KNOWN = { 'Pont de la Concorde': 35, 'Pont Alexandre III': 40, 'Pont Neuf': 22, 'Pont d\'Iéna': 35, 'Pont au Change': 30, 'Pont Royal': 17, 'Pont de l\'Alma': 42, 'Pont des Invalides': 18, 'Pont Notre-Dame': 20, 'Pont Saint-Michel': 30, 'Pont du Carrousel': 33, 'Pont de Sully': 20, 'Pont des Arts': 11, 'Passerelle Léopold-Sédar-Senghor': 15, 'Passerelle Debilly': 8, 'Pont Marie': 22, 'Pont au Double': 20 };
  const wrows = [];
  for (const [name, list] of byName) {
    const main = list.reduce((a, b) => (b.length > a.length ? b : a));
    // Milieu de l'arête la plus longue, et sa normale.
    let acc = 0, x = main.points[0], z = main.points[1], tx = 1, tz = 0;
    for (let k = 0; k + 3 < main.points.length; k += 2) {
      const L = Math.hypot(main.points[k + 2] - main.points[k], main.points[k + 3] - main.points[k + 1]);
      if (L > 0 && acc + L >= main.length / 2) { const t = (main.length / 2 - acc) / L; x = main.points[k] + (main.points[k + 2] - main.points[k]) * t; z = main.points[k + 1] + (main.points[k + 3] - main.points[k + 1]) * t; tx = (main.points[k + 2] - main.points[k]) / L; tz = (main.points[k + 3] - main.points[k + 1]) / L; break; }
      acc += L;
    }
    if (!inWater(x, z)) continue;
    let surf = 0;
    if (onPaved(x, z)) for (const side of [1, -1]) { let d = 0; while (d < 40 && onPaved(x - tz * side * (d + 0.5), z + tx * side * (d + 0.5))) d += 0.5; surf += d; }
    wrows.push({ name, known: KNOWN[name] ?? null, fromSurfaces: surf > 0 ? r1(surf) : null, fromEdge: r1(main.width + 2 * main.sidewalk), used: surf > 0 ? r1(surf) : r1(main.width + 2 * main.sidewalk), edges: list.length, cls: main.roadClass });
  }
  const known = wrows.filter((r) => r.known !== null);
  const wbad = known.filter((r) => Math.abs(r.used - r.known) > Math.max(3, r.known * 0.25));
  const noSurf = wrows.filter((r) => r.fromSurfaces === null).map((r) => `${r.name} (${r.fromEdge} m)`);
  const thin = wrows.filter((r) => r.used < 2.6 && r.length > 30).map((r) => r.name);
  check('Ponts : largeur des tabliers', wbad.length === 0 && thin.length === 0, 'warn',
    `${wrows.length} ponts nommés au-dessus de l'eau ; ${known.length - wbad.length}/${known.length} tabliers à 25 % près de leur largeur connue${wbad.length ? ' ; hors tolérance : ' + wbad.map((r) => `${r.name} ${r.used} m (${r.known})`).join(', ') : ''} ; sans surface dure au-dessus de l'eau (tablier tiré de l'arête) : ${noSurf.join(', ') || 'aucun'}`, wrows);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 10. Lieux
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const byName = M.edgesByName(graph);
  const kinds = {};
  let out = 0, noEdges = 0, empty = 0;
  const noEdgeSample = [];
  const seen = new Set();
  let dup = 0;
  for (const p of places) {
    kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
    if (p.name.trim() === '') empty++;
    if (!(p.x >= -3072 && p.x <= 4096 && p.z >= -1536 && p.z <= 2048)) out++;
    const k = p.kind + '|' + p.name;
    if (seen.has(k)) dup++;
    seen.add(k);
    if ((p.kind === 'street' || p.kind === 'bridge' || p.kind === 'quay') && !byName.has(p.name)) { noEdges++; if (noEdgeSample.length < 30) noEdgeSample.push(`${p.kind} ${p.name}`); }
  }
  const wanted = ['Place de la Concorde', 'Place Charles de Gaulle', 'Place de la République', 'Place de la Bastille', 'Place Vendôme', 'Place de l\'Opéra', 'Place du Trocadéro et du 11 Novembre', 'Place de la Madeleine', 'Place du Châtelet', 'Avenue des Champs-Élysées', 'Rue de Rivoli', 'Pont Neuf', 'Pont Alexandre III', 'Pont de la Concorde', 'Jardin des Tuileries', 'Champ-de-Mars'];
  const have = new Set(places.map((p) => norm(p.name)));
  const missing = wanted.filter((w) => !have.has(norm(w)));
  check('Lieux : noms, positions, lieux majeurs', empty === 0 && out === 0 && missing.length === 0, 'fail', `${places.length} lieux ; ${empty} sans nom, ${out} hors des tuiles, ${dup} homonymes de même nature ; lieux majeurs absents : ${missing.join(', ') || 'aucun'}`, kinds);
  check('Lieux : chaque voie nommée a ses arêtes', noEdges === 0, 'warn', `${noEdges} voies, ponts ou quais sans arête de même nom dans le graphe`, noEdgeSample);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 11. Enseignes et attribution
// ─────────────────────────────────────────────────────────────────────────────────────
{
  // Toutes les chaînes publiées, avec leur provenance.
  const strings = new Map();
  const add = (s, where) => { if (typeof s !== 'string' || s === '') return; const a = strings.get(s) ?? new Set(); a.add(where); strings.set(s, a); };
  let shopColumns = 0;
  rawTiles.forEach((raw) => {
    const str = raw.str ?? [''];
    const used = new Set();
    const col = (c, step, off, where) => { if (c) for (let k = off; k < c.length; k += step) { used.add(c[k]); add(str[c[k]], where); } };
    col(raw.buildings?.name, 2, 1, 'bâtiment');
    col(raw.buildings?.lm, 2, 1, 'clé de monument');
    col(raw.surfaces?.name, 2, 1, 'surface');
    col(raw.metro?.name, 1, 0, 'station');
    col(raw.metro?.lines, 1, 0, 'lignes');
    str.forEach((s, i) => { if (i > 0 && !used.has(i)) add(s, 'chaîne non référencée'); });
    if (raw.shops) for (const c of Object.keys(raw.shops)) if (!['n', 'id', 'xz', 'a', 'w', 'cat', 'b'].includes(c)) shopColumns++;
    for (const layer of Object.keys(raw)) if (!['v', 'tx', 'tz', 'str', 'buildings', 'roads', 'surfaces', 'barriers', 'trees', 'furniture', 'signals', 'metro', 'shops'].includes(layer)) shopColumns++;
  });
  const usedG = new Set(rawGraph.edges.name ?? []);
  (rawGraph.str ?? []).forEach((s, i) => add(s, usedG.has(i) ? 'voie' : 'graphe (clé)'));
  places.forEach((p) => { add(p.name, 'lieu:' + p.kind); add(p.ref, 'lieu:ref'); });
  landmarks.forEach((l) => { add(l.name, 'monument'); add(l.key, 'clé de monument'); });
  manifest.attribution.forEach((a) => { add(a.text, 'attribution'); });

  const brandRes = BRANDS.map((b) => [b, new RegExp(`(^| )${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`)]);
  const hits = [], allowedHits = [];
  for (const [s, where] of strings) {
    if (where.has('attribution') || [...where].every((w) => w === 'lignes' || w === 'lieu:ref' || w === 'clé de monument' || w === 'graphe (clé)')) continue;
    const ns = norm(s);
    for (const [b, re] of brandRes) {
      if (!re.test(ns)) continue;
      (BRAND_ALLOWED.has(s) ? allowedHits : hits).push({ string: s, brand: b, where: [...where].join(', ') });
      break;
    }
  }
  check('Enseignes : aucune colonne de nom dans les commerces', shopColumns === 0, 'fail', `${shopColumns} colonne(s) ou couche(s) inattendue(s) dans les tuiles`);
  check('Enseignes : aucune marque connue dans les chaînes publiées', hits.length === 0, 'fail',
    `${strings.size} chaînes publiées comparées à ${BRANDS.length} enseignes connues : ${hits.length} occurrence(s) fautive(s), ${allowedHits.length} toponyme(s) public(s) homonyme(s) relu(s) et admis`, { hits, allowed: allowedHits });

  // Noms des commerces de la source : aucun ne doit être publié comme nom de bâtiment, de surface ou d'institution.
  const shopFile = path.join(NORM, 'shops.geojson');
  if (fs.existsSync(shopFile)) {
    const fc = JSON.parse(fs.readFileSync(shopFile, 'utf8'));
    const shopNames = new Map();
    for (const f of fc.features) { const nm = f.properties.name; if (typeof nm === 'string' && norm(nm).length >= 4) shopNames.set(norm(nm), nm); }
    const exact = [];
    for (const [s, where] of strings) {
      const w = [...where];
      if (!w.some((x) => x === 'bâtiment' || x === 'surface' || x === 'lieu:institution' || x === 'lieu:monument' || x === 'monument' || x === 'chaîne non référencée')) continue;
      if (shopNames.has(norm(s))) exact.push({ string: s, where: w.join(', '), shop: shopNames.get(norm(s)) });
    }
    const fresh = exact.filter((e) => !SHOP_HOMONYMS_ALLOWED.has(e.string));
    check('Enseignes : aucun nom de bâtiment ou d\'institution identique à un commerce du relevé', fresh.length === 0, 'fail',
      `${shopNames.size} noms de commerces du relevé (Apur BDCOM, OpenStreetMap) ; ${exact.length} chaîne(s) publiée(s) comme bâtiment, surface, monument ou institution portent le même nom qu'un commerce : ${exact.length - fresh.length} toponymes publics relus et admis, ${fresh.length} à examiner${fresh.length ? ' (' + fresh.map((e) => e.string).join(', ') + ')' : ''}`, exact.slice(0, 80));
  } else {
    check('Enseignes : comparaison au relevé des commerces', false, 'warn', `couche normalisée absente (${shopFile}) : non mesuré`);
  }

  const need = [['OpenStreetMap', /openstreetmap/i, /odbl/i], ['IGN', /ign/i, /licence ouverte|etalab/i], ['Ville de Paris', /ville de paris|paris data/i, /odbl/i], ['Apur', /apur/i, /odbl/i], ['Île-de-France Mobilités', /le-de-france mobilit/i, /licence ouverte|etalab/i]];
  const missing = need.filter(([, re, lic]) => !manifest.attribution.some((a) => re.test(a.source + ' ' + a.text) && lic.test(a.license + ' ' + a.text) && a.text.trim() !== '')).map(([n]) => n);
  const text = M.attributionText(manifest);
  check('Attribution : sources et licences dans le manifeste', missing.length === 0 && /OpenStreetMap/.test(text), 'fail', `${manifest.attribution.length} mentions ; sources absentes ou sans licence : ${missing.join(', ') || 'aucune'}`, { attributionText: text, entries: manifest.attribution });
  check('Attribution : fichier de licence présent', fs.existsSync(path.join(DATA, 'LICENCE.txt')) && /ODbL/.test(readText('LICENCE.txt')), 'fail', 'LICENCE.txt présent et cite la licence ODbL');

  // Liste complète pour relecture humaine.
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const lines = [...strings].map(([s, w]) => `${[...w].sort().join(',')}\t${s}`).sort((a, b) => a.localeCompare(b, 'fr'));
  fs.writeFileSync(path.join(REPORT_DIR, 'verify-names.txt'), lines.join('\n') + '\n');
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 12. Temps de décodage
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const dense = manifest.tiles.reduce((a, b) => ((tileBytes.get(b.file) ?? 0) > (tileBytes.get(a.file) ?? 0) ? b : a));
  const text = readText(dense.file);
  const time = (fn, runs) => { const ts = []; for (let i = 0; i < runs; i++) { const t = performance.now(); fn(); ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return ts[Math.floor(ts.length / 2)]; };
  for (let i = 0; i < 15; i++) M.decodeTile(JSON.parse(text));
  const parse = time(() => JSON.parse(text), 41);
  const raw = JSON.parse(text);
  const decode = time(() => M.decodeTile(raw), 41);
  const texts = manifest.tiles.map((t) => readText(t.file));
  const all = time(() => { for (const s of texts) M.decodeTile(JSON.parse(s)); }, 7);
  const gText = readText(manifest.files.roadGraph);
  const g = time(() => M.decodeRoadGraph(JSON.parse(gText)), 7);
  const t = M.decodeTile(raw);
  check('Décodage : tuile la plus dense', parse + decode < 25, 'fail',
    `${dense.file} (${tileBytes.get(dense.file)} octets, ${t.buildings.length} bâtiments, ${t.surfaces.length} surfaces, ${t.shops.length} commerces) : JSON.parse ${parse.toFixed(2)} ms + decodeTile ${decode.toFixed(2)} ms (médianes, Node ${process.version}) ; les 98 tuiles : ${all.toFixed(0)} ms ; le graphe : ${g.toFixed(0)} ms`);
}

// ─────────────────────────────────────────────────────────────────────────────────────
// 13. Contrôle du format par le jeu, et empreinte pour le recoupement avec render-check
// ─────────────────────────────────────────────────────────────────────────────────────
{
  const v = M.validateMapData({ manifest, tiles, roadGraph: graph, places, landmarks, terrain });
  let rawErr = 0;
  for (const raw of rawTiles) rawErr += M.validateRawTile(raw).errors.length;
  check('Format : validateRawTile et validateMapData sans erreur', v.errors.length === 0 && rawErr === 0, 'fail', `${rawErr} erreurs de format brut, ${v.errors.length} erreurs et ${v.warnings.length} avertissement(s) de validateMapData`, { errors: v.errors.slice(0, 30), warnings: v.warnings.slice(0, 30) });
  let sum = 0;
  for (const p of buildings) for (let i = 0; i < p.outer.length; i++) sum += Math.round(p.outer[i] * 10);
  let esum = 0;
  for (const e of graph.edges) for (let i = 0; i < e.points.length; i++) esum += Math.round(e.points[i] * 10);
  check('Empreinte des coordonnées (à comparer à celle de render-check.mjs)', true, 'info', `bâtiments ${sum} ; arêtes ${esum}`, { buildings: sum, edges: esum });
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Bilan
// ─────────────────────────────────────────────────────────────────────────────────────
const fails = results.filter((r) => r.level === 'fail'), warns = results.filter((r) => r.level === 'warn');
fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(path.join(REPORT_DIR, 'verify.json'), JSON.stringify({ data: DATA, generatedAt: manifest.generatedAt, checks: results.length, failed: fails.length, warned: warns.length, results }, null, 1));
const mark = { ok: 'ok     ', fail: 'ÉCHEC  ', warn: 'à voir ', info: 'mesure ' };
if (!QUIET) for (const r of results) console.log(`${mark[r.level]} ${r.name}\n          ${r.summary}`);
console.log(`\n${results.length} contrôles : ${results.length - fails.length - warns.length} réussis, ${warns.length} à surveiller, ${fails.length} en échec — détail dans ${path.relative(process.cwd(), path.join(REPORT_DIR, 'verify.json'))}`);
if (fails.length > 0) {
  for (const f of fails) console.log(`  ÉCHEC : ${f.name} — ${f.summary}`);
  process.exitCode = 1;
}
