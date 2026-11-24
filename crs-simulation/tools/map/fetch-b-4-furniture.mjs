// fetch-b-4-furniture.mjs — couche `furniture` : mobilier urbain ponctuel.
// Sources : Ville de Paris (fontaines à boire, toilettes publiques, stations Vélib', kiosques de presse) et OpenStreetMap
//           (lampadaires, bancs, corbeilles, abribus, colonnes Morris, panneaux, mâts, potelets, fontaines, statues…).
// Lit aussi, s'ils existent : landmarks.geojson (lot B) pour ne pas doubler ce qui fait partie d'un monument,
//           buildings.geojson et roads.geojson (lot A) pour écarter le mobilier d'intérieur et orienter les objets.
// Sortie : raw/normalized/furniture.geojson — props { kind, heading, … }.
// `heading` : azimut en degrés (0 = nord, 90 = est, sens horaire) vers lequel l'objet fait face ; null si inconnu.
//             Passage au cap du jeu (radians, 0 = +z = sud) : h = π − heading × π / 180.

import fs from 'node:fs';
import path from 'node:path';
import { RAW_B, NORM, inBox, toM, fromM, odsExport, odsMeta, odsInBox, PointGrid, pointFeature, writeGeoJSON, readFeatures, tally, requestLog,
  ringArea, ringCentroid, ringBBox, pointInPolygon, distPointSeg, round1, publicName, writeStatus, orDegraded } from './lib-b.mjs';
import { loadOsmExtract } from './fetch-b-1-osm.mjs';

const P = 'opendata.paris.fr';
const cache = (name) => path.join(RAW_B, 'paris', name);

// ───────────── Couches d'appui (facultatives) ─────────────
const optional = (name) => { const f = path.join(NORM, name); return fs.existsSync(f) ? readFeatures(f) : null; };
const landmarkPolys = (optional('landmarks.geojson') || []).map((f) => ({ key: f.properties.key, poly: f.geometry.coordinates.map((r) => r.map(toM)) }));
const inLandmark = (x, y) => landmarkPolys.find((l) => pointInPolygon(x, y, l.poly))?.key || null;

/** Index en grille de polygones (bâtiments) pour le test « ce point est-il dans un bâtiment ? ». */
const bFeatures = optional('buildings.geojson');
const B_CELL = 60; const bGrid = new Map();
if (bFeatures) for (const f of bFeatures) {
  const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((p) => p.map((r) => r.map(toM)));
  for (const poly of polys) {
    const [x0, y0, x1, y1] = ringBBox(poly[0]);
    for (let cx = Math.floor(x0 / B_CELL); cx <= Math.floor(x1 / B_CELL); cx++) for (let cy = Math.floor(y0 / B_CELL); cy <= Math.floor(y1 / B_CELL); cy++) {
      const k = cx * 100003 + cy; let a = bGrid.get(k); if (!a) bGrid.set(k, (a = [])); a.push(poly);
    }
  }
}
const inBuilding = (x, y) => (bGrid.get(Math.floor(x / B_CELL) * 100003 + Math.floor(y / B_CELL)) || []).some((poly) => pointInPolygon(x, y, poly));

/** Index des segments de chaussée pour orienter le mobilier vers la rue la plus proche. */
const rFeatures = optional('roads.geojson');
const R_CELL = 40; const rGrid = new Map();
const ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living', 'pedestrian', 'service']);
if (rFeatures) for (const f of rFeatures) {
  const p = f.properties;
  if (!ROAD_CLASSES.has(p.class) || p.tunnel || (p.layer != null && p.layer < 0)) continue;
  const c = f.geometry.coordinates.map(toM);
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i];
    for (let cx = Math.floor(Math.min(a[0], b[0]) / R_CELL); cx <= Math.floor(Math.max(a[0], b[0]) / R_CELL); cx++)
      for (let cy = Math.floor(Math.min(a[1], b[1]) / R_CELL); cy <= Math.floor(Math.max(a[1], b[1]) / R_CELL); cy++) {
        const k = cx * 100003 + cy; let arr = rGrid.get(k); if (!arr) rGrid.set(k, (arr = [])); arr.push([a[0], a[1], b[0], b[1]]);
      }
  }
}
/** Azimut (degrés) du point vers l'axe de chaussée le plus proche à moins de 35 m, ou null. */
function bearingToRoad(x, y) {
  let best = null, bd = 35;
  const c0 = Math.floor((x - 35) / R_CELL), c1 = Math.floor((x + 35) / R_CELL), d0 = Math.floor((y - 35) / R_CELL), d1 = Math.floor((y + 35) / R_CELL);
  for (let cx = c0; cx <= c1; cx++) for (let cy = d0; cy <= d1; cy++) for (const s of rGrid.get(cx * 100003 + cy) || []) {
    const d = distPointSeg(x, y, s[0], s[1], s[2], s[3]);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best || bd < 0.3) return null;
  const dx = best[2] - best[0], dy = best[3] - best[1], l2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, l2 > 0 ? ((x - best[0]) * dx + (y - best[1]) * dy) / l2 : 0));
  const qx = best[0] + t * dx, qy = best[1] + t * dy;
  return Math.round(((Math.atan2(qx - x, qy - y) * 180) / Math.PI + 360) % 360) % 360;
}
const ORIENTED = new Set(['bench', 'bus_shelter', 'newsstand', 'kiosk', 'toilet', 'advert_panel', 'lamp', 'morris_column']);

/** Étiquette OSM `direction` → azimut en degrés (première valeur d'une liste), ou null. */
const CARD = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
function parseDirection(v) {
  if (!v) return null;
  const first = String(v).split(/[;,]/)[0].trim().toUpperCase();
  if (first in CARD) return CARD[first];
  const n = Number(first);
  return Number.isFinite(n) && n >= 0 && n <= 360 ? Math.round(n) % 360 : null;
}

// ───────────── Accumulation ─────────────
const feats = [];
const grids = new Map(); // kind → PointGrid (dédoublonnage et recherche de voisinage par nature)
const gridOf = (kind) => { let g = grids.get(kind); if (!g) grids.set(kind, (g = new PointGrid(10))); return g; };
const dropped = { outside: 0, duplicate: 0, indoor: 0, inLandmark: 0, nearOfficial: 0 };
/**
 * Ajoute un objet. opts : dedup (m, même nature), noIndoor (écarte si dans un bâtiment), noLandmark (écarte si dans
 * l'emprise d'un monument modélisé à la main).
 */
function add(kind, lon, lat, extra = {}, { dedup = 0.7, noIndoor = false, noLandmark = false } = {}) {
  if (!inBox(lon, lat)) { dropped.outside++; return false; }
  const [x, y] = toM([lon, lat]);
  const g = gridOf(kind);
  if (g.nearest(x, y, dedup)) { dropped.duplicate++; return false; }
  const lmKey = inLandmark(x, y);
  if (noLandmark && lmKey) { dropped.inLandmark++; return false; }
  if (noIndoor && inBuilding(x, y)) { dropped.indoor++; return false; }
  const { direction, ...rest } = extra;
  let heading = parseDirection(direction), headingSrc = heading != null ? 'osm' : null;
  if (heading == null && ORIENTED.has(kind) && rGrid.size) { heading = bearingToRoad(x, y); if (heading != null) headingSrc = 'road'; }
  g.add(x, y, 1);
  // `landmark` : l'objet se trouve dans l'emprise d'un monument modélisé à la main (candélabres d'un pont, par exemple) ;
  // à la construction de décider s'il fait double emploi avec le modèle.
  feats.push(pointFeature(lon, lat, { kind, heading, ...(headingSrc ? { headingSrc } : {}), ...rest, ...(lmKey ? { landmark: lmKey } : {}) }));
  return true;
}
const near = (kind, lon, lat, r) => { const [x, y] = toM([lon, lat]); return !!gridOf(kind).nearest(x, y, r); };

// ───────────── A. Ville de Paris ─────────────
const metas = {};
const degraded = [];
const missing = new Set(); // jeux municipaux qui n'ont pas répondu : OpenStreetMap prend le relais
async function paris(dataset, select, geoField = 'geo_point_2d') {
  return orDegraded(degraded, `Ville de Paris « ${dataset} » indisponible : repli sur OpenStreetMap`, async () => {
    metas[dataset] = await odsMeta(P, dataset, cache(dataset + '.meta.json'));
    const { records } = await odsExport(P, dataset, cache(dataset + '.json'), { where: odsInBox(geoField), select });
    metas[dataset].inBox = records.length;
    return records;
  }, null).then((r) => { if (!r) missing.add(dataset); return r || []; });
}

for (const r of await paris('fontaines-a-boire', 'gid,type_objet,modele,dispo,geo_point_2d')) {
  const g = r.geo_point_2d; if (!g) continue;
  if (r.type_objet === 'FONTNE_WALLACE') add('wallace_fountain', g.lon, g.lat, { sub: (r.modele || '').toLowerCase() || null, source: 'paris' });
  else add('fountain', g.lon, g.lat, { sub: 'drinking', model: r.modele || r.type_objet || null, source: 'paris' });
}
for (const r of await paris('sanisettesparis', 'type,statut,geo_point_2d')) {
  const g = r.geo_point_2d; if (!g) continue;
  add('toilet', g.lon, g.lat, { sub: (r.type || '').toLowerCase() || null, source: 'paris' });
}
for (const r of await paris('velib-emplacement-des-stations', 'stationcode,name,capacity,coordonnees_geo', 'coordonnees_geo')) {
  const g = r.coordonnees_geo; if (!g) continue;
  add('velib', g.lon, g.lat, { name: publicName(r.name), capacity: r.capacity ?? null, source: 'paris' });
}
for (const r of await paris('kiosques-de-presse', 'code_mobilier,type_activite,geo_point_2d')) {
  const g = r.geo_point_2d; if (!g) continue;
  add('newsstand', g.lon, g.lat, { source: 'paris' }, { dedup: 3 });
}

// ───────────── B. OpenStreetMap ─────────────
const osm = await loadOsmExtract();
/** Objets ponctuels OSM : nœuds, et chemins fermés ramenés à leur centre (avec leur aire). */
const items = [];
for (const n of osm.nodes) items.push({ tags: n.tags, lon: n.lon, lat: n.lat, area: 0, way: false });
for (const w of osm.ways) {
  if (!w.closed && w.tags.amenity !== 'bench') continue;
  const ring = w.coords.map(toM);
  const c = w.closed ? ringCentroid(ring) : [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const [clon, clat] = fromM(c);
  items.push({ tags: w.tags, lon: clon, lat: clat, area: w.closed ? Math.abs(ringArea(ring)) : 0, way: true });
}
const indoor = (t) => t.indoor === 'yes' || t.location === 'indoor' || t.location === 'underground' || (t.level != null && !/^0(\.0)?$/.test(String(t.level).trim())) || (t.layer != null && Number(t.layer) < 0);
const SOFT = { noIndoor: true };

// Passe 1 : abribus et kiosques « en dur » (chemins), qui servent ensuite de référence aux nœuds.
for (const it of items) {
  const t = it.tags;
  if (t.amenity === 'shelter' && t.shelter_type === 'public_transport' && !indoor(t)) add('bus_shelter', it.lon, it.lat, { name: publicName(t.name), source: 'osm', direction: t.direction }, { dedup: 4 });
}
for (const it of items) {
  const t = it.tags;
  if (indoor(t)) continue;
  // ── éclairage
  if (t.highway === 'street_lamp') {
    const mount = (t.lamp_mount || t.support || '');
    add('lamp', it.lon, it.lat, { sub: /wall|ceiling|suspend/.test(mount) ? 'wall' : 'mast', source: 'osm', direction: /^\d+$/.test(String(t.direction || '')) ? t.direction : null });
  }
  // ── bancs et corbeilles
  else if (t.amenity === 'bench') add('bench', it.lon, it.lat, { source: 'osm', direction: t.direction }, SOFT);
  else if (t.amenity === 'waste_basket') add('bin', it.lon, it.lat, { source: 'osm' }, SOFT);
  // ── abribus (nœud d'arrêt avec abri, s'il n'y a pas déjà un abri surfacique tout près)
  else if (t.highway === 'bus_stop' && /^yes/.test(t.shelter || '')) { if (!near('bus_shelter', it.lon, it.lat, 12)) add('bus_shelter', it.lon, it.lat, { name: publicName(t.name), source: 'osm' }, { dedup: 4 }); else dropped.nearOfficial++; }
  // ── kiosques
  else if (t.leisure === 'bandstand') add('kiosk', it.lon, it.lat, { sub: 'bandstand', source: 'osm' }, { dedup: 5 });
  else if ((t.building === 'kiosk' || t.shop === 'kiosk' || (t.shop === 'newsagent' && it.way && t.building && it.area < 60)) && it.area < 120) {
    if (near('newsstand', it.lon, it.lat, 15)) dropped.nearOfficial++;
    else if (t.shop === 'newsagent' || /presse|journaux|kiosque de paris/i.test(t.name || '')) add('newsstand', it.lon, it.lat, { source: 'osm' }, { dedup: 5 });
    else if (it.way || !inBuilding(...toM([it.lon, it.lat]))) add('kiosk', it.lon, it.lat, { sub: t.shop === 'kiosk' ? 'shop' : 'other', source: 'osm' }, { dedup: 5 });
    else dropped.indoor++;
  }
  // ── publicité et affichage
  else if (t.advertising === 'column') add('morris_column', it.lon, it.lat, { source: 'osm' }, { dedup: 2 });
  else if (['poster_box', 'billboard', 'board', 'screen'].includes(t.advertising)) {
    if (!/kiosk|transit_shelter|showcase|wall|fence|scaffold|roof/.test(t.support || '')) add('advert_panel', it.lon, it.lat, { sub: t.advertising, source: 'osm', direction: t.direction }, SOFT);
  }
  // ── mâts et potelets
  else if (t.man_made === 'flagpole') { const [x, y] = toM([it.lon, it.lat]); add('flagpole', it.lon, it.lat, { sub: inBuilding(x, y) ? 'building' : 'ground', source: 'osm' }); }
  else if (t.barrier === 'bollard') add('bollard', it.lon, it.lat, { sub: t.bollard || null, source: 'osm' }, { dedup: 0.3 });
  // ── stations de vélos en libre-service : seulement si le jeu municipal manque
  else if (t.amenity === 'bicycle_rental' && missing.has('velib-emplacement-des-stations')) add('velib', it.lon, it.lat, { name: publicName(t.name), capacity: Number(t.capacity) || null, source: 'osm' }, { dedup: 10 });
  // ── téléphones publics (aucun dans l'emprise : la couche reste prête si OSM en gagne)
  else if (t.amenity === 'telephone') add('phone', it.lon, it.lat, { source: 'osm' }, SOFT);
  // ── toilettes : complément au jeu municipal
  else if (t.amenity === 'toilets') {
    if (/customers|private|no/.test(t.access || '')) continue;
    if (near('toilet', it.lon, it.lat, 25)) { dropped.nearOfficial++; continue; }
    add('toilet', it.lon, it.lat, { sub: 'osm', source: 'osm' }, it.way ? { dedup: 8 } : { dedup: 8, noIndoor: true });
  }
  // ── fontaines
  else if ((t.amenity === 'drinking_water' || t.amenity === 'fountain') && t.fountain === 'wallace') { if (!near('wallace_fountain', it.lon, it.lat, 15)) add('wallace_fountain', it.lon, it.lat, { sub: null, source: 'osm' }); else dropped.nearOfficial++; }
  else if (t.amenity === 'drinking_water') { if (!near('fountain', it.lon, it.lat, 15) && !near('wallace_fountain', it.lon, it.lat, 15)) add('fountain', it.lon, it.lat, { sub: 'drinking', model: null, source: 'osm' }, SOFT); else dropped.nearOfficial++; }
  else if (t.amenity === 'fountain') add('fountain', it.lon, it.lat, { sub: 'ornamental', name: t.name || null, radius: it.area ? round1(Math.sqrt(it.area / Math.PI)) : null, source: 'osm' }, { dedup: 3, noIndoor: !it.way, noLandmark: true });
  // ── statues et monuments commémoratifs en volume
  else if ((t.tourism === 'artwork' && /^(statue|sculpture|bust)$/.test(t.artwork_type || '')) || (t.historic === 'memorial' && /^(statue|bust|sculpture|war_memorial|stele|obelisk)$/.test(t.memorial || '')) || t.historic === 'monument') {
    if (it.area > 400) continue; // grande emprise : ce n'est plus du mobilier
    add('statue', it.lon, it.lat, { sub: t.artwork_type || t.memorial || 'monument', name: t.name || null, source: 'osm' }, { dedup: 2, noIndoor: !it.way, noLandmark: true });
  }
}

// ───────────── Sortie ─────────────
const size = writeGeoJSON(path.join(NORM, 'furniture.geojson'), feats);
const kinds = tally(feats, (f) => f.properties.kind);
console.log(`furniture : ${feats.length} objets (${(size / 1e6).toFixed(2)} Mo)`);
console.log('furniture : par nature', JSON.stringify(kinds));
console.log('furniture : par source', JSON.stringify(tally(feats, (f) => f.properties.source)));
console.log('furniture : cap', JSON.stringify(tally(feats, (f) => f.properties.headingSrc || 'aucun')));
console.log('furniture : écartés', JSON.stringify(dropped));
console.log('furniture : jeux Ville de Paris', JSON.stringify(metas));
console.log(`furniture : couches d'appui — monuments ${landmarkPolys.length}, bâtiments ${bFeatures ? bFeatures.length : 'absents'}, rues ${rFeatures ? rFeatures.length : 'absentes'}`);
const ALL_KINDS = ['lamp', 'bench', 'bin', 'bus_shelter', 'kiosk', 'morris_column', 'wallace_fountain', 'bollard', 'phone', 'toilet', 'velib', 'advert_panel', 'fountain', 'statue', 'newsstand', 'flagpole'];
const empty = ALL_KINDS.filter((k) => !kinds[k]);
if (empty.length) console.log('furniture : natures du contrat sans aucun objet → ' + empty.join(', '));
if (requestLog.size) console.log('requêtes :', JSON.stringify(Object.fromEntries(requestLog)));
writeStatus('furniture', degraded);
