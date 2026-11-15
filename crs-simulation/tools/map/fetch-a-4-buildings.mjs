// fetch-a-4-buildings.mjs — couche normalisée « buildings » (raw/normalized/buildings.geojson).
//
//   node tools/map/fetch-a-4-buildings.mjs [--stats]
//
// Géométrie, hauteur et nombre de niveaux : IGN BD TOPO® (un objet = un bâtiment cadastral, hauteur à la gouttière).
// Nature (kind), nom et forme de toit : OpenStreetMap, par jointure spatiale (point intérieur du bâtiment IGN
// contenu dans un bâtiment OSM) ; à défaut, nature déduite de l'enceinte OSM qui contient le bâtiment (école, hôpital,
// ministère, lieu de culte…) ou d'un point d'intérêt institutionnel situé dans le bâtiment.
// Bâtiments présents dans OSM mais absents de la BD TOPO : ajoutés (source « osm »).
//
// Prérequis : fetch-a-1-osm.mjs et fetch-a-2-ign.mjs.

import path from 'node:path';
import {
  RAW, NORM, RECT_M, readJson, cleanRing, orientPolygon, polygonAreaM, bboxOf, bboxIntersects, interiorPoint,
  pointInPolygon, assembleRings, groupRings, GridIndex, writeGeojson, feature, polygonGeom, round1,
  normName, isCommercialTags, commercialNameSet,
} from './lib-a.mjs';

const showStats = process.argv.includes('--stats');
const LEVEL_H = 3.2; // m par niveau quand seule l'information « niveaux » existe
const MIN_AREA = 5; // m² : en dessous, éclats de numérisation sans intérêt

// ───────────── Chargement ─────────────
const ignIndex = readJson(path.join(RAW, 'ign', 'batiment.json'));
const ign = ignIndex.pages.flatMap((p) => readJson(path.join(RAW, 'ign', 'batiment', p)).features);
const osm = readJson(path.join(RAW, 'osm', 'extract-a.json'));
const wayById = new Map(osm.ways.map((w) => [w.id, w]));

// ───────────── Bâtiments OSM (polygones + attributs) ─────────────
const isBuildingTag = (t) => t.building && t.building !== 'no';
const osmB = [];
for (const w of osm.ways) {
  if (!isBuildingTag(w.tags) || w.memberOnly) continue;
  if (w.refs[0] !== w.refs[w.refs.length - 1]) continue;
  const ring = cleanRing(w.coords);
  if (!ring) continue;
  osmB.push({ id: `osm:w${w.id}`, tags: w.tags, polys: [orientPolygon([ring])] });
}
for (const r of osm.relations) {
  if (r.tags.type !== 'multipolygon' || !isBuildingTag(r.tags)) continue;
  const part = (role) => assembleRings(r.members.filter((m) => m.type === 'w' && (role === 'inner' ? m.role === 'inner' : m.role !== 'inner')).map((m) => wayById.get(m.ref)).filter(Boolean)).rings.map(cleanRing).filter(Boolean);
  const outers = part('outer');
  if (!outers.length) continue;
  osmB.push({ id: `osm:r${r.id}`, tags: r.tags, polys: groupRings(outers, part('inner')).map(orientPolygon) });
}
for (const b of osmB) {
  b.area = b.polys.reduce((s, p) => s + polygonAreaM(p), 0);
  b.bbox = bboxOf(b.polys.flatMap((p) => p[0]));
}
const osmIdx = new GridIndex(80);
for (const b of osmB) osmIdx.insert(b.bbox, b);

// ───────────── Enceintes (sites) et points d'intérêt institutionnels OSM ─────────────
/** Nature portée par une enceinte ou un point d'intérêt (jamais « commercial » : trop de commerces en pied d'immeuble). */
function kindFromSite(t) {
  const a = t.amenity;
  if (a === 'place_of_worship' || t.landuse === 'religious') return 'religious';
  if (a === 'hospital') return 'hospital';
  if (a === 'school' || a === 'university' || a === 'college' || a === 'kindergarten' || t.landuse === 'education') return 'school';
  if (a === 'townhall' || a === 'courthouse' || a === 'police' || a === 'fire_station' || a === 'embassy' || a === 'prison' || a === 'library'
    || t.office === 'government' || t.office === 'diplomatic' || t.diplomatic === 'embassy' || t.landuse === 'military' || t.military || t.tourism === 'museum') return 'public';
  return null;
}
const sites = []; // { kind, polys, bbox, area }
for (const w of osm.ways) {
  if (w.memberOnly || isBuildingTag(w.tags) || w.tags.highway) continue;
  const k = kindFromSite(w.tags);
  if (!k || w.refs[0] !== w.refs[w.refs.length - 1]) continue;
  const ring = cleanRing(w.coords);
  if (ring) sites.push({ kind: k, tags: w.tags, polys: [orientPolygon([ring])] });
}
for (const r of osm.relations) {
  if (r.tags.type !== 'multipolygon' || isBuildingTag(r.tags)) continue;
  const k = kindFromSite(r.tags);
  if (!k) continue;
  const part = (inner) => assembleRings(r.members.filter((m) => m.type === 'w' && (m.role === 'inner') === inner).map((m) => wayById.get(m.ref)).filter(Boolean)).rings.map(cleanRing).filter(Boolean);
  const outers = part(false);
  if (outers.length) sites.push({ kind: k, tags: r.tags, polys: groupRings(outers, part(true)).map(orientPolygon) });
}
const siteIdx = new GridIndex(80);
for (const s of sites) {
  s.area = s.polys.reduce((a, p) => a + polygonAreaM(p), 0);
  s.bbox = bboxOf(s.polys.flatMap((p) => p[0]));
  siteIdx.insert(s.bbox, s);
}
const pois = []; // { kind, pt }
for (const n of osm.nodes) {
  const k = n.tags.tourism === 'hotel' ? 'hotel' : kindFromSite(n.tags);
  if (k) pois.push({ kind: k, pt: [n.lon, n.lat] });
}
const poiIdx = new GridIndex(80);
for (const q of pois) poiIdx.insert([q.pt[0], q.pt[1], q.pt[0], q.pt[1]], q);
/** Nature déduite du contexte : plus petite enceinte contenant le point, sinon point d'intérêt dans l'emprise du bâtiment. */
function kindFromContext(it) {
  let best = null;
  for (const s of siteIdx.queryPoint(it.ip)) {
    if (it.ip[0] < s.bbox[0] || it.ip[0] > s.bbox[2] || it.ip[1] < s.bbox[1] || it.ip[1] > s.bbox[3]) continue;
    if (s.polys.some((q) => pointInPolygon(it.ip, q)) && (!best || s.area < best.area)) best = s;
  }
  if (best) return best.kind;
  const votes = {};
  for (const q of poiIdx.query(it.bbox)) {
    if (it.polys.some((poly) => pointInPolygon(q.pt, poly))) votes[q.kind] = (votes[q.kind] || 0) + 1;
  }
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

// ───────────── Correspondances d'attributs ─────────────
const num = (v) => {
  if (v == null) return null;
  const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const RELIGIOUS_B = new Set(['church', 'cathedral', 'chapel', 'temple', 'synagogue', 'mosque', 'convent', 'monastery', 'religious', 'basilica', 'presbytery']);
const SCHOOL = new Set(['school', 'university', 'college', 'kindergarten']);
const PUBLIC_B = new Set(['civic', 'government', 'public', 'fire_station', 'museum']);
const PUBLIC_A = new Set(['townhall', 'courthouse', 'police', 'fire_station', 'embassy', 'library', 'community_centre', 'prison', 'arts_centre', 'theatre', 'public_building', 'social_facility', 'conference_centre', 'exhibition_centre', 'events_venue']);
const COMM_B = new Set(['retail', 'commercial', 'kiosk', 'supermarket', 'department_store']);
const COMM_A = new Set(['restaurant', 'cafe', 'bar', 'fast_food', 'bank', 'cinema', 'nightclub', 'marketplace', 'pub', 'pharmacy', 'casino', 'fuel']);
const RES_B = new Set(['apartments', 'residential', 'house', 'dormitory', 'detached', 'terrace', 'semidetached_house']);
const MONUMENT_H = new Set(['monument', 'castle', 'palace', 'city_gate', 'tower', 'fort', 'citywalls', 'triumphal_arch']);
const MONUMENT_B = new Set(['palace', 'castle', 'city_gate', 'triumphal_arch', 'tower']);

/** Nature d'après les attributs OSM, ou null si OSM ne dit rien d'utile. */
function kindFromOsm(t) {
  const b = t.building, a = t.amenity;
  if (b === 'train_station' || b === 'transportation' || t.railway === 'station' || t.public_transport === 'station') return 'station';
  if (RELIGIOUS_B.has(b) || a === 'place_of_worship') return 'religious';
  if (b === 'hospital' || a === 'hospital') return 'hospital';
  if (SCHOOL.has(b) || SCHOOL.has(a)) return 'school';
  if (MONUMENT_H.has(t.historic) || MONUMENT_B.has(b)) return 'monument';
  if (PUBLIC_B.has(b) || PUBLIC_A.has(a) || t.office === 'government' || t.office === 'diplomatic' || t.tourism === 'museum' || t.government || t.diplomatic || t.military) return 'public';
  if (b === 'hotel' || t.tourism === 'hotel') return 'hotel';
  if (COMM_B.has(b) || t.shop || COMM_A.has(a)) return 'commercial';
  if (b === 'office' || t.office) return 'office';
  if (b === 'industrial' || b === 'warehouse' || b === 'factory') return 'industrial';
  if (RES_B.has(b)) return 'residential';
  if (b === 'yes') return null;
  return 'other';
}
/** Nature d'après la BD TOPO (nature + usages). */
function kindFromIgn(p) {
  const n = p.nature, u1 = p.usage_1, u2 = p.usage_2;
  if (n === 'Eglise' || n === 'Chapelle' || u1 === 'Religieux') return 'religious';
  if (n === 'Monument' || n === 'Arc de triomphe' || n === 'Château' || n === 'Tour, donjon') return 'monument';
  if (n === 'Industriel, agricole ou commercial') return u1 === 'Industriel' ? 'industrial' : 'commercial';
  if (u1 === 'Résidentiel') return 'residential';
  if (u1 === 'Commercial et services') return u2 === 'Résidentiel' ? 'residential' : 'office';
  if (u1 === 'Industriel') return 'industrial';
  if (u1 === 'Sportif') return 'public';
  if (u1 === 'Annexe' || p.construction_legere) return 'other';
  return null; // « Indifférencié »
}
/**
 * Le nom n'est conservé que pour les monuments, lieux de culte, gares, hôpitaux, établissements d'enseignement et
 * institutions publiques — jamais pour une enseigne, une entreprise, un hôtel ou une salle privée.
 */
const commercialNames = commercialNameSet(osm);
const NAME_PUBLIC_A = new Set(['townhall', 'courthouse', 'police', 'fire_station', 'embassy', 'library', 'prison', 'public_building']);
const SCHOOL_RE = /^(École|Ecole|Collège|Lycée|Université|Faculté|Institut|Sorbonne|Conservatoire|Gymnase|Crèche|Groupe scolaire|Cité scolaire)/i;
function nameFromOsm(t, kind) {
  if (!t.name || isCommercialTags(t)) return null;
  const strong = kind === 'religious' || kind === 'monument' || kind === 'station';
  if (!strong && commercialNames.has(normName(t.name))) return null;
  if (strong || kind === 'hospital') return t.name;
  if (kind === 'school') return SCHOOL_RE.test(t.name) ? t.name : null;
  if (kind === 'public') {
    const institution = NAME_PUBLIC_A.has(t.amenity) || t.office === 'government' || t.office === 'diplomatic' || t.diplomatic || t.government || t.military
      || t.tourism === 'museum' || t.building === 'government' || t.building === 'civic' || t.building === 'public';
    return institution ? t.name : null;
  }
  return null;
}

// ───────────── Bâtiments IGN ─────────────
const feats = [];
const ignIdx = new GridIndex(80);
const stats = { ignLus: ign.length, ignTropPetits: 0, ignHorsEmprise: 0, appariesOsm: 0, appariesSerres: 0, hauteurIgn: 0, hauteurOsm: 0, hauteurNiveaux: 0, hauteurNulle: 0, osmAjoutes: 0, natureParContexte: 0 };
const cross = new Map();
const ignItems = [];
for (const f of ign) {
  const p = f.properties;
  if (p.etat_de_l_objet && p.etat_de_l_objet !== 'En service') continue;
  const polys = [];
  for (const poly of f.geometry.coordinates) {
    const rings = poly.map(cleanRing).filter(Boolean);
    if (!rings.length) continue;
    const op = orientPolygon(rings);
    if (polygonAreaM(op) >= MIN_AREA) polys.push(op);
  }
  if (!polys.length) { stats.ignTropPetits++; continue; }
  const bbox = bboxOf(polys.flatMap((q) => q[0]));
  if (!bboxIntersects(bbox, RECT_M)) { stats.ignHorsEmprise++; continue; }
  const area = polys.reduce((s, q) => s + polygonAreaM(q), 0);
  const ip = interiorPoint(polys.reduce((a, b) => (polygonAreaM(a) >= polygonAreaM(b) ? a : b)));
  const item = { p, polys, bbox, area, ip, osm: null };
  ignItems.push(item);
  ignIdx.insert(bbox, item);
}

for (const it of ignItems) {
  // bâtiment OSM contenant le point intérieur (le plus petit s'il y en a plusieurs)
  let best = null;
  for (const b of osmIdx.queryPoint(it.ip)) {
    if (it.ip[0] < b.bbox[0] || it.ip[0] > b.bbox[2] || it.ip[1] < b.bbox[1] || it.ip[1] > b.bbox[3]) continue;
    if (!b.polys.some((q) => pointInPolygon(it.ip, q))) continue;
    if (!best || b.area < best.area) best = b;
  }
  it.osm = best;
  if (best) (best.matched ??= []).push(it);
}

for (const it of ignItems) {
  const { p } = it;
  const t = it.osm?.tags || null;
  // « serré » : le bâtiment OSM et le bâtiment IGN décrivent à peu près le même volume → ses attributs de forme s'appliquent
  const tight = !!t && it.area >= 0.5 * it.osm.area && it.area <= 1.6 * it.osm.area;
  if (t) stats.appariesOsm++;
  if (tight) stats.appariesSerres++;
  const kOsm = t ? kindFromOsm(t) : null;
  const kIgn = kindFromIgn(p);
  // priorité : bâtiment OSM explicite > contexte institutionnel (enceinte, point d'intérêt) > usage BD TOPO > « other »
  const kCtx = kOsm && kOsm !== 'residential' && kOsm !== 'other' ? null : kindFromContext(it);
  if (kCtx) stats.natureParContexte++;
  let kind = (kOsm && kOsm !== 'residential' && kOsm !== 'other' ? kOsm : null) || kCtx || kOsm || kIgn || 'other';
  // un petit volume annexe (cour) rattaché à un grand bâtiment OSM garde la nature du grand bâtiment,
  // sauf si la BD TOPO sait que c'est un édifice remarquable
  if (kIgn === 'religious' || kIgn === 'monument') kind = kOsm === 'religious' || kOsm === 'monument' || kOsm === 'station' || kOsm === 'public' || kOsm === 'school' || kOsm === 'hospital' ? kOsm : kIgn;
  if (showStats) {
    const k = `${p.nature === 'Indifférenciée' ? '' : p.nature + ' / '}${p.usage_1}+${p.usage_2 || '-'} → osm:${t ? t.building : '(aucun)'}`;
    cross.set(k, (cross.get(k) || 0) + 1);
  }
  const levelsIgn = Number.isFinite(p.nombre_d_etages) && p.nombre_d_etages > 0 ? Math.round(p.nombre_d_etages) : null;
  const levelsOsm = tight ? num(t['building:levels']) : null;
  const levels = levelsIgn ?? (levelsOsm && levelsOsm > 0 ? Math.round(levelsOsm) : null);
  let height = null, hsrc = null;
  if (Number.isFinite(p.hauteur) && p.hauteur >= 1.5) { height = round1(p.hauteur); hsrc = 'ign'; stats.hauteurIgn++; } else if (tight && num(t.height) > 1.5) { height = round1(num(t.height)); hsrc = 'osm'; stats.hauteurOsm++; } else if (levels) { height = round1(levels * LEVEL_H); hsrc = 'levels'; stats.hauteurNiveaux++; } else stats.hauteurNulle++;
  const name = t ? nameFromOsm(t, kind) : null;
  const roofShape = tight && t['roof:shape'] ? t['roof:shape'] : null;
  const usedOsm = !!kCtx || (!!t && (kOsm || name || roofShape || hsrc === 'osm' || (levelsIgn == null && levels != null)));
  feats.push(feature(polygonGeom(it.polys), {
    id: p.cleabs, height, levels, kind, name, roofShape, source: usedOsm ? 'ign+osm' : 'ign',
  }));
}

// ───────────── Bâtiments OSM absents de la BD TOPO ─────────────
for (const b of osmB) {
  if (b.matched || b.area < MIN_AREA || !bboxIntersects(b.bbox, RECT_M)) continue;
  const t = b.tags;
  if (t.building === 'roof' || t.location === 'underground' || num(t.layer) < 0 || t.building === 'boat' || t.building === 'houseboat') continue;
  const ip = interiorPoint(b.polys.reduce((x, y) => (polygonAreaM(x) >= polygonAreaM(y) ? x : y)));
  let covered = false;
  for (const it of ignIdx.queryPoint(ip)) {
    if (it.polys.some((q) => pointInPolygon(ip, q))) { covered = true; break; }
  }
  if (covered) continue;
  const k0 = kindFromOsm(t);
  const kind = (k0 && k0 !== 'residential' && k0 !== 'other' ? k0 : null) || kindFromContext({ ip, bbox: b.bbox, polys: b.polys }) || k0 || 'other';
  const lv = num(t['building:levels']);
  const levels = lv && lv > 0 ? Math.round(lv) : null;
  const h = num(t.height);
  const height = h > 1.5 ? round1(h) : levels ? round1(levels * LEVEL_H) : null;
  if (height == null) stats.hauteurNulle++; else if (h > 1.5) stats.hauteurOsm++; else stats.hauteurNiveaux++;
  stats.osmAjoutes++;
  feats.push(feature(polygonGeom(b.polys), { id: b.id, height, levels, kind, name: nameFromOsm(t, kind), roofShape: t['roof:shape'] || null, source: 'osm' }));
}

// ───────────── Écriture ─────────────
const kinds = {};
for (const f of feats) kinds[f.properties.kind] = (kinds[f.properties.kind] || 0) + 1;
const meta = {
  generated: new Date().toISOString(),
  sources: ['IGN BD TOPO® (BDTOPO_V3:batiment, WFS Géoplateforme) — Licence Ouverte 2.0', `OpenStreetMap (extrait du ${osm.meta.timestamp}) — ODbL 1.0`],
  count: feats.length, kinds, stats,
};
const out = path.join(NORM, 'buildings.geojson');
const size = writeGeojson(out, feats, meta);
console.log(`buildings.geojson : ${feats.length} bâtiments, ${(size / 1e6).toFixed(1)} Mo`);
console.log('  natures :', JSON.stringify(kinds));
console.log('  stats   :', JSON.stringify(stats));
console.log('  nommés  :', feats.filter((f) => f.properties.name).length, '| toits renseignés :', feats.filter((f) => f.properties.roofShape).length, '| niveaux renseignés :', feats.filter((f) => f.properties.levels != null).length);
if (showStats) {
  console.log('\nCroisement BD TOPO → building OSM (40 premiers) :');
  for (const [k, v] of [...cross].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${String(v).padStart(6)}  ${k}`);
}
