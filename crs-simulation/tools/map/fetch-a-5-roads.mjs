// fetch-a-5-roads.mjs — couche normalisée « roads » (raw/normalized/roads.geojson).
//
//   node tools/map/fetch-a-5-roads.mjs
//
// Géométrie et attributs : OpenStreetMap (nom, classe, sens unique, voies, pont, tunnel, revêtement, vitesse, couche).
// Largeur de chaussée (et nombre de voies quand OSM ne le donne pas) : IGN BD TOPO® (troncon_de_route), par
// appariement géométrique tronçon à tronçon.
//
// Le graphe : chaque objet est une arête. Les chemins OSM sont coupés à chaque nœud partagé avec une autre voie
// retenue ; deux arêtes qui se touchent ont donc exactement les mêmes coordonnées d'extrémité (7 décimales).
//
// Prérequis : fetch-a-1-osm.mjs et fetch-a-2-ign.mjs.

import path from 'node:path';
import {
  RAW, NORM, RECT_M, MX, MZ, LON0, LAT0, readJson, clipLineToRect, lineLengthM, bboxOf, GridIndex, writeGeojson, feature, round1,
} from './lib-a.mjs';

const osm = readJson(path.join(RAW, 'osm', 'extract-a.json'));
const ignIndex = readJson(path.join(RAW, 'ign', 'troncon_de_route.json'));
const ign = ignIndex.pages.flatMap((p) => readJson(path.join(RAW, 'ign', 'troncon_de_route', p)).features);

// ───────────── Sélection et classement des voies OSM ─────────────
const CLASS = {
  motorway: 'motorway', motorway_link: 'motorway', trunk: 'trunk', trunk_link: 'trunk',
  primary: 'primary', primary_link: 'primary', secondary: 'secondary', secondary_link: 'secondary',
  tertiary: 'tertiary', tertiary_link: 'tertiary',
  residential: 'residential', unclassified: 'residential', road: 'residential',
  living_street: 'living', pedestrian: 'pedestrian', service: 'service', busway: 'service',
  footway: 'footway', path: 'footway', bridleway: 'footway', steps: 'steps', cycleway: 'cycleway',
};
const CARRIAGE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living', 'service', 'pedestrian']);
const SURFACE = {
  asphalt: 'asphalt', chipseal: 'asphalt',
  sett: 'sett', cobblestone: 'sett', unhewn_cobblestone: 'sett', 'cobblestone:flattened': 'sett',
  paving_stones: 'paved', paved: 'paved', concrete: 'paved', 'concrete:plates': 'paved', 'concrete:lanes': 'paved', stone: 'paved', tiles: 'paved', metal: 'paved', wood: 'paved', bricks: 'paved', glass: 'paved', grass_paver: 'paved',
  compacted: 'gravel', gravel: 'gravel', fine_gravel: 'gravel', pebblestone: 'gravel', sand: 'gravel', dirt: 'gravel', ground: 'gravel', unpaved: 'gravel', earth: 'gravel', grass: 'gravel', rock: 'gravel', stepping_stones: 'gravel',
};
const num = (v) => {
  if (v == null) return null;
  const m = String(v).replace(',', '.').match(/^-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const excluded = {};
const bump = (k) => { excluded[k] = (excluded[k] || 0) + 1; };

function classify(t) {
  const c = CLASS[t.highway];
  if (!c) { bump(`highway=${t.highway}`); return null; }
  if (t.area === 'yes') { bump('surface (area=yes) → couche areas'); return null; }
  const indoor = (t.indoor && t.indoor !== 'no') || t.location === 'underground' || t.location === 'indoor';
  const level = t.level != null ? num(String(t.level).split(';')[0]) : null;
  if (c === 'footway' || c === 'steps') {
    if (t.footway === 'sidewalk' || t.footway === 'crossing' || t.footway === 'traffic_island' || t.footway === 'link' || t.footway === 'access_aisle') { bump(`footway=${t.footway}`); return null; }
    if (indoor || (level != null && level !== 0) || t.conveying) { bump('cheminement intérieur ou souterrain (stations, galeries)'); return null; }
  }
  if (c === 'service' && (indoor || (level != null && level < 0) || (t.service === 'parking_aisle' && (t.tunnel === 'yes' || num(t.layer) < 0)))) { bump('voie de service souterraine (parkings)'); return null; }
  // Les voies à accès restreint (access=no/private) sont conservées : elles existent physiquement.
  return c;
}

function maxspeedOf(t) {
  const m = t.maxspeed;
  if (m) {
    if (/^\d+$/.test(m)) return Number(m);
    if (/zone:?30|zone30/i.test(m)) return 30;
    if (/zone:?20|zone20|living/i.test(m)) return 20;
    if (/urban/i.test(m)) return 50;
    if (m === 'walk') return 6;
    const n = num(m);
    if (n) return n;
  }
  const z = t['zone:maxspeed'] || t['source:maxspeed'] || '';
  if (/:30$|zone30/i.test(z)) return 30;
  if (/:20$|zone20/i.test(z)) return 20;
  return null;
}

const kept = [];
for (const w of osm.ways) {
  if (!w.tags.highway || w.memberOnly) continue;
  const cls = classify(w.tags);
  if (cls) kept.push({ w, cls });
}

// ───────────── Nœuds de jonction (partagés par plusieurs voies retenues) ─────────────
// Compte les passages de voies par nœud ; un nœud traversé deux fois par le même chemin (boucle) compte double.
const use = new Map();
for (const { w } of kept) for (const r of w.refs) use.set(r, (use.get(r) || 0) + 1);

// ───────────── Index des tronçons IGN (pour la largeur) ─────────────
const toMx = (lon) => (lon - LON0) * MX, toMy = (lat) => (lat - LAT0) * MZ;
const segIdx = new GridIndex(40);
let ignUsable = 0;
for (const f of ign) {
  const p = f.properties;
  const wdt = Number(p.largeur_de_chaussee), ln = Number(p.nombre_de_voies);
  if (!(wdt > 0) && !(ln > 0)) continue;
  ignUsable++;
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const info = { id: p.cleabs, width: wdt > 0 ? wdt : null, lanes: ln > 0 ? ln : null, under: Number(p.position_par_rapport_au_sol) < 0 };
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const seg = { ax: toMx(a[0]), ay: toMy(a[1]), bx: toMx(b[0]), by: toMy(b[1]), info };
      segIdx.insert(bboxOf([a, b]), seg);
    }
  }
}
const PAD_X = 10 / MX, PAD_Y = 10 / MZ;
/** Tronçon IGN le plus proche d'un point (≤ 9 m, direction voisine à 30° près, même situation souterraine). */
function nearestIgn(pt, dirx, diry, tunnel) {
  const px = toMx(pt[0]), py = toMy(pt[1]);
  let best = null, bestD = 9;
  for (const s of segIdx.query([pt[0] - PAD_X, pt[1] - PAD_Y, pt[0] + PAD_X, pt[1] + PAD_Y])) {
    if (s.info.under !== tunnel) continue;
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const cos = Math.abs(dx * dirx + dy * diry) / Math.sqrt(len2);
    if (cos < 0.866) continue;
    const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
    const d = Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy));
    if (d < bestD) { bestD = d; best = s.info; }
  }
  return best;
}
function matchIgn(line, tunnel) {
  const votes = new Map();
  let samples = 0;
  const total = lineLengthM(line);
  const step = Math.max(6, total / 12);
  let next = Math.min(step / 2, total / 2), acc = 0;
  for (let i = 1; i < line.length; i++) {
    const ax = toMx(line[i - 1][0]), ay = toMy(line[i - 1][1]), bx = toMx(line[i][0]), by = toMy(line[i][1]);
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    while (next <= acc + len) {
      const t = (next - acc) / len;
      const pt = [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])];
      samples++;
      const m = nearestIgn(pt, (bx - ax) / len, (by - ay) / len, tunnel);
      if (m) votes.set(m, (votes.get(m) || 0) + 1);
      next += step;
    }
    acc += len;
  }
  let best = null, bestV = 0, sum = 0;
  for (const [m, v] of votes) { sum += v; if (v > bestV) { bestV = v; best = m; } }
  // au moins la moitié des points d'échantillonnage doivent tomber sur des tronçons IGN
  return samples > 0 && sum >= samples / 2 ? best : null;
}

// ───────────── Découpage en arêtes, attributs, écriture ─────────────
const feats = [];
const stats = { cheminsRetenus: kept.length, aretes: 0, largeurOsm: 0, largeurIgn: 0, largeurNulle: 0, voiesOsm: 0, voiesIgn: 0 };
for (const { w, cls } of kept) {
  const t = w.tags;
  let refs = w.refs, coords = w.coords;
  const onewayTag = t.oneway;
  let oneway = onewayTag === 'yes' || onewayTag === '1' || onewayTag === 'true' || onewayTag === '-1' || ((t.junction === 'roundabout' || t.junction === 'circular') && onewayTag !== 'no') || (t.highway === 'motorway' && onewayTag !== 'no');
  if (cls === 'footway' || cls === 'steps') oneway = false;
  if (onewayTag === '-1') { refs = refs.slice().reverse(); coords = coords.slice().reverse(); } // sens unique inversé : on retourne la géométrie
  const bridge = !!t.bridge && t.bridge !== 'no';
  const layerTag = num(t.layer);
  // Vrai tunnel = tunnel=* ET couche négative. Dans Paris, « tunnel=yes » sans couche désigne un passage au niveau
  // du sol sous un immeuble ou une dalle (porche, cité, passage) : il reste praticable en surface → covered.
  const tunnelTag = !!t.tunnel && t.tunnel !== 'no';
  const tunnel = tunnelTag && t.tunnel !== 'building_passage' && layerTag != null && layerTag < 0;
  const covered = (tunnelTag && !tunnel) || (!!t.covered && t.covered !== 'no');
  const layer = layerTag != null ? Math.round(layerTag) : bridge ? 1 : 0;
  const lanesOsm = num(t.lanes);
  const widthOsm = /^\d+([.,]\d+)?( ?m)?$/.test(t.width || '') ? num(t.width) : null;
  const base = {
    name: t.name || null, class: cls,
    oneway, bridge, tunnel,
    surface: SURFACE[t.surface] || null,
    maxspeed: maxspeedOf(t), layer,
  };
  // coupe aux jonctions
  const pieces = [];
  let start = 0;
  for (let i = 1; i < refs.length; i++) {
    if (i === refs.length - 1 || use.get(refs[i]) > 1) {
      pieces.push(coords.slice(start, i + 1));
      start = i;
    }
  }
  let k = 0;
  for (const piece of pieces) {
    for (const line of clipLineToRect(piece, RECT_M)) {
      if (line.length < 2 || lineLengthM(line) < 0.05) continue;
      let width = widthOsm > 0 && widthOsm < 80 ? round1(widthOsm) : null;
      let lanes = lanesOsm > 0 ? Math.round(lanesOsm) : null;
      let source = 'osm';
      if (width != null) stats.largeurOsm++;
      if (lanes != null) stats.voiesOsm++;
      if (CARRIAGE.has(cls) && (width == null || lanes == null)) {
        const m = matchIgn(line, tunnel);
        if (m) {
          if (width == null && m.width != null) { width = m.width; source = 'osm+ign'; stats.largeurIgn++; }
          if (lanes == null && m.lanes != null && cls !== 'pedestrian') { lanes = m.lanes; source = 'osm+ign'; stats.voiesIgn++; }
        }
      }
      if (width == null) stats.largeurNulle++;
      // identifiant : « w<id OSM> » pour un chemin resté entier, « w<id OSM>_<n> » pour ses morceaux ; clés dans l'ordre du contrat
      const id = pieces.length === 1 && k === 0 ? `w${w.id}` : `w${w.id}_${k}`;
      const ordered = { id, name: base.name, class: base.class, width, lanes, oneway: base.oneway, bridge: base.bridge, tunnel: base.tunnel, surface: base.surface, maxspeed: base.maxspeed, layer: base.layer, source };
      if (covered) ordered.covered = true; // passage sous immeuble / arcade (information hors contrat, facultative)
      feats.push(feature({ type: 'LineString', coordinates: line }, ordered));
      k++;
    }
  }
}
// identifiants uniques (un chemin non coupé mais découpé par l'emprise peut produire w123 puis w123_1)
const ids = new Set();
for (const f of feats) {
  if (ids.has(f.properties.id)) throw new Error(`identifiant en double : ${f.properties.id}`);
  ids.add(f.properties.id);
}
stats.aretes = feats.length;

const classes = {}, lengthByClass = {};
for (const f of feats) {
  const c = f.properties.class;
  classes[c] = (classes[c] || 0) + 1;
  lengthByClass[c] = Math.round((lengthByClass[c] || 0) + lineLengthM(f.geometry.coordinates));
}
const meta = {
  generated: new Date().toISOString(),
  sources: [`OpenStreetMap (extrait du ${osm.meta.timestamp}) — ODbL 1.0`, 'IGN BD TOPO® (BDTOPO_V3:troncon_de_route, largeur de chaussée) — Licence Ouverte 2.0'],
  count: feats.length, classes, lengthByClassM: lengthByClass, stats, excluded,
};
const size = writeGeojson(path.join(NORM, 'roads.geojson'), feats, meta);
console.log(`roads.geojson : ${feats.length} arêtes (${kept.length} chemins OSM), ${(size / 1e6).toFixed(1)} Mo`);
console.log('  classes     :', JSON.stringify(classes));
console.log('  longueur (m):', JSON.stringify(lengthByClass));
console.log('  stats       :', JSON.stringify(stats), `| tronçons IGN exploitables : ${ignUsable}/${ign.length}`);
console.log('  écartés     :', JSON.stringify(excluded));
const car = feats.filter((f) => CARRIAGE.has(f.properties.class) && f.properties.class !== 'service' && f.properties.class !== 'pedestrian');
console.log(`  passages couverts (covered) : ${feats.filter((f) => f.properties.covered).length} arêtes`);
console.log(`  voies carrossables : ${car.length} arêtes, largeur connue ${car.filter((f) => f.properties.width != null).length}, voies connues ${car.filter((f) => f.properties.lanes != null).length}, nommées ${car.filter((f) => f.properties.name).length}, sens unique ${car.filter((f) => f.properties.oneway).length}, ponts ${feats.filter((f) => f.properties.bridge).length}, tunnels ${feats.filter((f) => f.properties.tunnel).length}`);
