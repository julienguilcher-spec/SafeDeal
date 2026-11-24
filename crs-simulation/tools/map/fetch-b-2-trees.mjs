// fetch-b-2-trees.mjs — couche `trees` : un point par arbre, avec hauteur et diamètre de houppier.
// Sources : Ville de Paris « Les arbres » (arbres gérés par la Ville : alignements, jardins, écoles, cimetières…)
//           + OpenStreetMap natural=tree pour les arbres absents du jeu municipal (jardins de l'État : Tuileries,
//           Palais-Royal, Invalides… et domaines privés).
// Sortie : raw/normalized/trees.geojson — props { height, crown, genus, source }.

import path from 'node:path';
import { RAW_B, NORM, inBox, toM, odsExport, odsMeta, odsInBox, PointGrid, pointFeature, writeGeoJSON, tally, requestLog, round1, writeStatus, orDegraded } from './lib-b.mjs';
import { loadOsmExtract } from './fetch-b-1-osm.mjs';

const DEDUP_SAME_M = 1.0; // deux enregistrements municipaux à moins de 1 m : doublon
const DEDUP_OSM_M = 3.0; // un arbre OSM à moins de 3 m d'un arbre municipal : même arbre

const num = (v) => { if (v == null) return null; const x = Number(String(v).replace(',', '.').replace(/\s*m$/, '')); return Number.isFinite(x) ? x : null; };
/** Hauteur plausible d'un arbre parisien (m) ; 0 et les valeurs aberrantes de la source deviennent null. */
const cleanHeight = (h) => (h != null && h >= 1 && h <= 45 ? round1(h) : null);
/**
 * Diamètre du houppier (m) ESTIMÉ : aucune des deux sources ne le mesure (sauf l'étiquette OSM diameter_crown).
 * Règle : 1,5 + 0,045 × circonférence du tronc (cm), borné à 2–14 m ; à défaut 1 + 0,45 × hauteur, borné à 2–12 m.
 */
function estimateCrown(circCm, height) {
  if (circCm != null && circCm >= 5 && circCm <= 900) return Math.round(Math.min(14, Math.max(2, 1.5 + 0.045 * circCm)) * 2) / 2;
  if (height != null) return Math.round(Math.min(12, Math.max(2, 1 + 0.45 * height)) * 2) / 2;
  return null;
}

const degraded = [];
const paris = await orDegraded(degraded, 'Ville de Paris « les-arbres » indisponible : arbres OpenStreetMap seuls', async () => ({
  meta: await odsMeta('opendata.paris.fr', 'les-arbres', path.join(RAW_B, 'paris', 'les-arbres.meta.json')),
  records: (await odsExport('opendata.paris.fr', 'les-arbres', path.join(RAW_B, 'paris', 'les-arbres.json'), {
  where: odsInBox('geo_point_2d'),
  select: 'idbase,typeemplacement,domanialite,libellefrancais,genre,espece,circonferenceencm,hauteurenm,stadedeveloppement,remarquable,geo_point_2d',
  })).records,
}), { meta: null, records: [] });
const { meta, records } = paris;

const grid = new PointGrid(6);
const features = [];
const stats = { parisRecords: records.length, parisKept: 0, parisNoGeom: 0, parisOutside: 0, parisDuplicates: 0, osmNodes: 0, osmKept: 0, osmDuplicates: 0 };
for (const r of records) {
  const g = r.geo_point_2d;
  if (!g || g.lon == null) { stats.parisNoGeom++; continue; }
  if (!inBox(g.lon, g.lat)) { stats.parisOutside++; continue; }
  const [x, y] = toM([g.lon, g.lat]);
  if (grid.nearest(x, y, DEDUP_SAME_M)) { stats.parisDuplicates++; continue; }
  const height = cleanHeight(num(r.hauteurenm));
  const circ = num(r.circonferenceencm);
  grid.add(x, y, 1);
  features.push(pointFeature(g.lon, g.lat, { height, crown: estimateCrown(circ, height), genus: r.genre || null, source: 'paris' }));
  stats.parisKept++;
}

const osm = await loadOsmExtract();
for (const n of osm.nodes) {
  if (n.tags.natural !== 'tree') continue;
  stats.osmNodes++;
  const [x, y] = toM([n.lon, n.lat]);
  if (grid.nearest(x, y, DEDUP_OSM_M)) { stats.osmDuplicates++; continue; }
  const height = cleanHeight(num(n.tags.height));
  const circM = num(n.tags.circumference); // OSM : circonférence en mètres
  const crownTag = num(n.tags.diameter_crown);
  const crown = crownTag != null && crownTag >= 1 && crownTag <= 30 ? round1(crownTag) : estimateCrown(circM != null ? circM * 100 : null, height);
  grid.add(x, y, 1);
  features.push(pointFeature(n.lon, n.lat, { height, crown, genus: n.tags.genus || null, source: 'osm' }));
  stats.osmKept++;
}

const size = writeGeoJSON(path.join(NORM, 'trees.geojson'), features);
const withH = features.filter((f) => f.properties.height != null).length;
const withC = features.filter((f) => f.properties.crown != null).length;
console.log(`trees : ${features.length} arbres (${(size / 1e6).toFixed(2)} Mo)` + (meta ? ` — jeu « ${meta.title} » (${meta.license}, mis à jour ${meta.modified})` : ' — jeu municipal ABSENT'));
writeStatus('trees', degraded);
console.log('trees :', JSON.stringify(stats));
console.log(`trees : hauteur connue ${withH} (${(100 * withH / features.length).toFixed(1)} %), houppier estimé ${withC} (${(100 * withC / features.length).toFixed(1)} %)`);
console.log('trees : genres principaux', JSON.stringify(Object.fromEntries(Object.entries(tally(features, (f) => f.properties.genus || '(inconnu)')).slice(0, 10))));
if (requestLog.size) console.log('requêtes :', JSON.stringify(Object.fromEntries(requestLog)));
