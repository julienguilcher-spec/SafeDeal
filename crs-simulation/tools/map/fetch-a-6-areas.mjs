// fetch-a-6-areas.mjs — couches normalisées « areas » et « barriers »
// (raw/normalized/areas.geojson, raw/normalized/barriers.geojson).
//
//   node tools/map/fetch-a-6-areas.mjs
//
// areas :
//   - water        : OpenStreetMap (Seine, bras, canal Saint-Martin à ciel ouvert, bassin de l'Arsenal, bassins, fontaines)
//   - park, garden : OpenStreetMap (leisure=park / garden, pelouses, massifs) + espaces verts de la Ville absents d'OSM
//   - plaza, pedestrian : OpenStreetMap (place=square, surfaces piétonnes) + aires mixtes de la Ville
//   - roadway, sidewalk : plan de voirie de la Ville de Paris (polygones réels de chaussée, trottoir, terre-plein, îlot)
//   - courtyard    : îlots privés du plan de voirie (sol des pâtés de maisons, visible dans les cours) + cours OSM
//   - parking, cemetery, sports, construction : OpenStreetMap
// barriers : OpenStreetMap (murs, grilles, haies, murs de quai) + IGN BD TOPO® (quais et murs de soutènement absents d'OSM).
//
// Hors contrat mais utile : chaque surface porte `sub` (détail), `source` et `z` (ordre de peinture conseillé, du
// dessous vers le dessus ; le fichier est trié dans cet ordre).
//
// Prérequis : fetch-a-1-osm.mjs, fetch-a-2-ign.mjs, fetch-a-3-paris.mjs.

import path from 'node:path';
import {
  RAW, NORM, RECT_M, MX, MZ, LON0, LAT0, readJson, cleanRing, orientPolygon, polygonAreaM, bboxOf, bboxIntersects,
  interiorPoint, pointInPolygon, assembleRings, groupRings, clipPolygonKeepingHoles, clipLineToRect, simplifyRing, simplifyLine,
  lineLengthM, GridIndex, writeGeojson, feature, polygonGeom, polysOf, round1, round7,
} from './lib-a.mjs';

const osm = readJson(path.join(RAW, 'osm', 'extract-a.json'));
const wayById = new Map(osm.ways.map((w) => [w.id, w]));
const paris = (id) => readJson(path.join(RAW, 'paris', `${id}.geojson`)).features;
const num = (v) => {
  if (v == null) return null;
  const m = String(v).replace(',', '.').match(/^-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const inRectM = (pt) => pt[0] >= RECT_M[0] && pt[0] <= RECT_M[2] && pt[1] >= RECT_M[1] && pt[1] <= RECT_M[3];
const warnings = [];

// ───────────── Polygones OSM (chemins fermés + relations multipolygones) ─────────────
/** Renvoie les polygones d'un objet OSM surfacique, ou [] ; ferme les chaînes ouvertes dont les bouts sont hors emprise. */
function polygonsOfRelation(r) {
  const members = (inner) => r.members.filter((m) => m.type === 'w' && (m.role === 'inner') === inner).map((m) => wayById.get(m.ref)).filter(Boolean);
  const out = assembleRings(members(false));
  const outers = out.rings.slice();
  // Relation tronquée par la limite de l'extrait (cas de la Seine) : on referme chaque chaîne ouverte par un segment
  // droit, à condition que ses deux extrémités soient hors de l'emprise (la fermeture n'est alors jamais visible).
  for (const ch of out.open) {
    const a = ch.coords[0], b = ch.coords[ch.coords.length - 1];
    if (ch.coords.length >= 3 && !inRectM(a) && !inRectM(b)) {
      outers.push(ch.coords.concat([a]));
      warnings.push(`relation ${r.id} (${r.tags.name || r.tags.natural || r.tags.leisure || '?'}) : chaîne ouverte refermée hors emprise (${ch.coords.length} points)`);
    } else if (bboxIntersects(bboxOf(ch.coords), RECT_M)) {
      warnings.push(`relation ${r.id} (${r.tags.name || '?'}) : chaîne ouverte dans l'emprise ignorée (${ch.coords.length} points)`);
    }
  }
  const inners = assembleRings(members(true)).rings;
  return groupRings(outers.map(cleanRing).filter(Boolean), inners.map(cleanRing).filter(Boolean)).map(orientPolygon);
}
// ───────────── Classement des surfaces OSM ─────────────
const PLAZA_NAME = /^(Place|Parvis|Esplanade|Cour|Carré|Forum|Rond-Point|Carrefour)\b/i;
const underground = (t) => t.location === 'underground' || (t.indoor && t.indoor !== 'no') || num(t.layer) < 0 || (t.level != null && num(String(t.level).split(';')[0]) !== 0) || (t.tunnel && t.tunnel !== 'no') || t.covered === 'yes';

/** → { kind, sub, z } ou null. */
function classifyOsm(t) {
  if (t.building && t.building !== 'no') return null;
  if (t['building:part']) return null;
  // eau
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.waterway === 'dock' || t.landuse === 'basin' || t.landuse === 'reservoir' || (t.amenity === 'fountain' && !t.highway)) {
    if (underground(t)) return null; // voûtes du canal Saint-Martin, réservoirs enterrés
    const w = t.water || (t.amenity === 'fountain' ? 'fountain' : t.waterway || t.landuse || 'water');
    // le bassin de l'Arsenal est étiqueté water=river dans OSM : c'est un bassin du canal
    if (w === 'river' && !/bassin|canal|écluse/i.test(t.name || '')) return { kind: 'water', sub: 'river', z: 1 };
    if (w === 'river') return { kind: 'water', sub: 'canal', z: 1 };
    if (w === 'canal' || w === 'lock' || w === 'dock') return { kind: 'water', sub: 'canal', z: 1 };
    return { kind: 'water', sub: w === 'fountain' || t.amenity === 'fountain' ? 'fountain' : 'basin', z: 9 };
  }
  if (t.leisure === 'park') return { kind: 'park', sub: null, z: 2 };
  if (t.leisure === 'garden') return { kind: 'garden', sub: t.access === 'private' ? 'private' : null, z: 2 };
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return { kind: 'cemetery', sub: null, z: 2 };
  if (t.landuse === 'construction' || t.landuse === 'brownfield') return { kind: 'construction', sub: null, z: 3 };
  if (t.man_made === 'courtyard') return { kind: 'courtyard', sub: 'court', z: 3 };
  if (t.highway === 'pedestrian' || t.highway === 'footway' || t.highway === 'living_street' || t['area:highway'] === 'pedestrian') {
    if (!(t.area === 'yes' || t.type === 'multipolygon' || t['area:highway'])) return null; // rue piétonne linéaire → couche roads
    if (underground(t)) return null;
    if (t.footway === 'sidewalk' || t.footway === 'traffic_island' || t.footway === 'crossing') return null; // doublon du plan de voirie
    const plaza = t.place === 'square' || (t.highway === 'pedestrian' && PLAZA_NAME.test(t.name || ''));
    return { kind: plaza ? 'plaza' : 'pedestrian', sub: null, z: 4 };
  }
  if (t.place === 'square') return { kind: 'plaza', sub: 'outline', z: 1 }; // contour de la place entière (chaussées comprises)
  if (t.amenity === 'parking') {
    if (underground(t) || t.parking === 'underground' || t.parking === 'multi-storey') return null;
    return { kind: 'parking', sub: null, z: 7 };
  }
  if (t.leisure === 'pitch' || t.leisure === 'track') return underground(t) ? null : { kind: 'sports', sub: t.sport || null, z: 8 };
  if (t.landuse === 'grass' || t.landuse === 'village_green' || t.landuse === 'meadow' || t.natural === 'grassland') return { kind: 'garden', sub: 'grass', z: 8 };
  if (t.landuse === 'flowerbed' || t.natural === 'shrubbery' || t.natural === 'scrub' || t.natural === 'heath') return { kind: 'garden', sub: t.landuse === 'flowerbed' ? 'flowerbed' : 'scrub', z: 8 };
  if (t.landuse === 'forest' || t.natural === 'wood') return { kind: 'garden', sub: 'wood', z: 8 };
  return null;
}

const feats = [];
const counts = {};
function pushArea(polys, kind, name, sub, z, source, { simplifyM = 0, minArea = 1 } = {}) {
  const outPolys = [];
  for (let poly of polys) {
    if (simplifyM > 0) {
      poly = poly.map((r) => simplifyRing(r, simplifyM)).filter(Boolean);
      if (!poly.length) continue;
    }
    const c = clipPolygonKeepingHoles(poly, RECT_M); // un trou (île) n'est jamais coupé : le polygone déborde alors de la marge
    if (!c) continue;
    const o = orientPolygon(c);
    if (polygonAreaM(o) < minArea) continue;
    outPolys.push(o);
  }
  if (!outPolys.length) return null;
  const area = outPolys.reduce((s, p) => s + polygonAreaM(p), 0);
  const f = feature(polygonGeom(outPolys), { kind, name: name || null, sub: sub || null, z, source });
  f._area = area;
  feats.push(f);
  counts[`${kind}${sub ? ':' + sub : ''} (${source})`] = (counts[`${kind}${sub ? ':' + sub : ''} (${source})`] || 0) + 1;
  return f;
}

// Surfaces OSM : on classe d'abord (sur les attributs), on ne construit les polygones que des objets retenus.
const osmAreas = []; // { id, tags, cls, polys }
for (const w of osm.ways) {
  if (w.memberOnly || w.refs[0] !== w.refs[w.refs.length - 1] || w.coords.length < 4) continue;
  const cls = classifyOsm(w.tags);
  if (!cls) continue;
  const ring = cleanRing(w.coords);
  if (ring) osmAreas.push({ id: `w${w.id}`, tags: w.tags, cls, polys: [orientPolygon([ring])] });
}
for (const r of osm.relations) {
  if (r.tags.type !== 'multipolygon') continue;
  const cls = classifyOsm(r.tags);
  if (!cls) continue;
  const polys = polygonsOfRelation(r);
  if (polys.length) osmAreas.push({ id: `r${r.id}`, tags: r.tags, cls, polys });
}

const greenIdx = new GridIndex(120); // parcs et jardins OSM, pour ne pas doubler ceux de la Ville
const waterBig = []; // rivière + canal, pour qualifier les murs de quai
for (const a of osmAreas) {
  const c = a.cls;
  const f = pushArea(a.polys, c.kind, a.tags.name, c.sub, c.z, 'osm', { minArea: c.kind === 'water' ? 1 : 4 });
  if (!f) continue;
  if (c.z === 2 && (c.kind === 'park' || c.kind === 'garden')) for (const p of polysOf(f.geometry)) greenIdx.insert(bboxOf(p[0]), p);
  if (c.kind === 'water' && c.z === 1) for (const p of polysOf(f.geometry)) waterBig.push(p);
}

// ───────────── Espaces verts de la Ville absents d'OSM ─────────────
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-'’(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Du|Des|La|Le|Les|Et|Au|Aux|En|Sur|Sous|À|A|L'|D')\b/g, (m, w, off) => (off === 0 ? m : m.toLowerCase())).replace(/(^|\s)([dl])'(\p{L})/giu, (m, a, b, c) => `${a}${b.toLowerCase()}'${c.toUpperCase()}`);
const EV_KIND = { Parc: 'park', Jardin: 'garden', Square: 'garden', Promenade: 'garden', Esplanade: 'garden', Jardinet: 'garden', 'Jardin partage': 'garden', 'Foret urbaine': 'garden', Archipel: 'garden', Pelouse: 'garden', 'Plate-bande': 'garden', Cimetière: 'cemetery' };
let evAdded = 0, evCovered = 0, evSkipped = 0;
for (const f of paris('espaces_verts')) {
  const p = f.properties;
  const kind = EV_KIND[p.categorie];
  if (!kind || !f.geometry) { evSkipped++; continue; }
  const polys = polysOf(f.geometry).map((poly) => poly.map(cleanRing).filter(Boolean)).filter((poly) => poly.length).map(orientPolygon);
  if (!polys.length) { evSkipped++; continue; }
  const big = polys.reduce((x, y) => (polygonAreaM(x) >= polygonAreaM(y) ? x : y));
  if (polygonAreaM(big) < 60) { evSkipped++; continue; }
  const ip = interiorPoint(big);
  let covered = false;
  for (const g of greenIdx.queryPoint(ip)) if (pointInPolygon(ip, g)) { covered = true; break; }
  if (covered) { evCovered++; continue; }
  if (pushArea(polys, kind, p.nom_ev ? titleCase(p.nom_ev) : null, kind === 'garden' && /Pelouse|Plate-bande/.test(p.categorie) ? 'grass' : null, kind === 'garden' && /Pelouse|Plate-bande/.test(p.categorie) ? 8 : 2, 'paris', { simplifyM: 0.05, minArea: 30 })) evAdded++;
}

// ───────────── Plan de voirie de la Ville : chaussées, trottoirs, terre-pleins, îlots, aires mixtes ─────────────
const VOIRIE = [
  ['plan-de-voirie-emprises-ilots-prives', 'courtyard', 'block', 0],
  ['plan-de-voirie-aires-mixtes-vehicules-et-pietons', 'pedestrian', 'shared', 4],
  ['plan-de-voirie-chaussees', 'roadway', null, 5],
  ['plan-de-voirie-trottoirs-emprises', 'sidewalk', null, 6],
  ['plan-de-voirie-terre-pleins', 'sidewalk', 'median', 6],
  ['plan-de-voirie-ilots-directionnels', 'sidewalk', 'traffic_island', 6],
];
for (const [id, kind, sub, z] of VOIRIE) {
  for (const f of paris(id)) {
    if (!f.geometry) continue;
    const polys = polysOf(f.geometry).map((poly) => poly.map(cleanRing).filter(Boolean)).filter((poly) => poly.length).map(orientPolygon);
    if (polys.length) pushArea(polys, kind, null, sub, z, 'paris', { simplifyM: 0.05, minArea: 1 });
  }
}

// (Les cours intérieures n'ont pas de polygone propre : elles sont la partie visible du polygone d'îlot
// « courtyard:block », peint sous les bâtiments.)

// ───────────── Tri (ordre de peinture) et écriture ─────────────
feats.sort((a, b) => a.properties.z - b.properties.z || b._area - a._area);
const areaByKind = {};
for (const f of feats) {
  areaByKind[f.properties.kind] = Math.round((areaByKind[f.properties.kind] || 0) + f._area);
  delete f._area;
}
const kinds = {};
for (const f of feats) kinds[f.properties.kind] = (kinds[f.properties.kind] || 0) + 1;
const srcMeta = readJson(path.join(RAW, 'paris', 'index.json'));
const sizeA = writeGeojson(path.join(NORM, 'areas.geojson'), feats, {
  generated: new Date().toISOString(),
  sources: [`OpenStreetMap (extrait du ${osm.meta.timestamp}) — ODbL 1.0`, ...srcMeta.filter((m) => /voirie|espaces_verts/.test(m.id)).map((m) => `Ville de Paris — ${m.title} (${m.id}) — ${m.license}`)],
  paintOrder: 'z croissant : 0 îlots (courtyard:block), 1 Seine et canal + contours de places, 2 parcs/jardins/cimetières, 3 chantiers et cours, 4 surfaces piétonnes, 5 chaussées, 6 trottoirs/terre-pleins/îlots directionnels, 7 parkings, 8 pelouses/massifs/terrains de sport, 9 bassins et fontaines',
  count: feats.length, kinds, areaM2ByKind: areaByKind, detail: counts,
  espacesVertsVille: { ajoutes: evAdded, dejaDansOsm: evCovered, ecartes: evSkipped }, warnings,
});
console.log(`areas.geojson : ${feats.length} surfaces, ${(sizeA / 1e6).toFixed(1)} Mo`);
console.log('  natures   :', JSON.stringify(kinds));
console.log('  aires (m²):', JSON.stringify(areaByKind));
console.log('  détail    :', JSON.stringify(counts));
console.log(`  espaces verts Ville : ${evAdded} ajoutés, ${evCovered} déjà dans OSM, ${evSkipped} écartés (catégorie ou taille)`);
for (const w of warnings) console.log('  ! ' + w);

// ═════════════════════════════ BARRIÈRES ═════════════════════════════
const toMx = (lon) => (lon - LON0) * MX, toMy = (lat) => (lat - LAT0) * MZ;
/** Distance (m) d'un point au bord le plus proche des grandes surfaces d'eau (Seine, canal). */
const waterSegIdx = new GridIndex(60);
for (const poly of waterBig) {
  for (const ring of poly) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      // on ignore les bords créés par le découpage à l'emprise
      const onEdge = (p) => p[0] <= RECT_M[0] + 1e-9 || p[0] >= RECT_M[2] - 1e-9 || p[1] <= RECT_M[1] + 1e-9 || p[1] >= RECT_M[3] - 1e-9;
      if (onEdge(a) && onEdge(b)) continue;
      waterSegIdx.insert(bboxOf([a, b]), { ax: toMx(a[0]), ay: toMy(a[1]), bx: toMx(b[0]), by: toMy(b[1]) });
    }
  }
}
function distToSegs(idx, pt, maxM) {
  const px = toMx(pt[0]), py = toMy(pt[1]);
  let best = Infinity;
  for (const s of idx.query([pt[0] - maxM / MX, pt[1] - maxM / MZ, pt[0] + maxM / MX, pt[1] + maxM / MZ])) {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
    const d = Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}
/** Points d'échantillonnage le long d'une ligne (tous les `step` mètres, extrémités comprises). */
function samplePoints(line, step) {
  const pts = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const len = Math.hypot((line[i][0] - line[i - 1][0]) * MX, (line[i][1] - line[i - 1][1]) * MZ);
    let d = step - carry;
    while (d < len) {
      const t = d / len;
      pts.push([line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])]);
      d += step;
    }
    carry = (carry + len) % step;
  }
  pts.push(line[line.length - 1]);
  return pts;
}
const nearWaterShare = (line) => {
  const pts = samplePoints(line, 8);
  return pts.filter((p) => distToSegs(waterSegIdx, p, 45) <= 45).length / pts.length;
};

const BARRIER_KIND = { wall: 'wall', city_wall: 'wall', retaining_wall: 'wall', fence: 'fence', railing: 'railing', guard_rail: 'railing', handrail: 'railing', hedge: 'hedge', jersey_barrier: 'wall' };
const GATE_NODE = new Set(['gate', 'entrance', 'lift_gate', 'swing_gate', 'kissing_gate', 'turnstile', 'full-height_turnstile', 'wicket_gate', 'sliding_gate', 'door', 'bollard', 'cycle_barrier', 'stile', 'yes']);
const gateNodes = new Set();
for (const n of osm.nodes) if ((n.tags.barrier && GATE_NODE.has(n.tags.barrier)) || n.tags.entrance) gateNodes.add(n.id);

const bfeats = [];
const bstats = { osm: 0, ignAjoutes: 0, ignDoublons: 0, portails: 0 };
const osmBarrierIdx = new GridIndex(40);
const GATE_HALF = 1.5; // demi-largeur (m) de l'ouverture laissée à chaque portail

/** Raccourcit une ligne de `d` mètres à son début (start=true) ou à sa fin. */
function trim(line, d, start) {
  const pts = start ? line.slice() : line.slice().reverse();
  let rest = d;
  while (pts.length >= 2) {
    const len = Math.hypot((pts[1][0] - pts[0][0]) * MX, (pts[1][1] - pts[0][1]) * MZ);
    if (len > rest) {
      const t = rest / len;
      pts[0] = [round7(pts[0][0] + t * (pts[1][0] - pts[0][0])), round7(pts[0][1] + t * (pts[1][1] - pts[0][1]))];
      return start ? pts : pts.reverse();
    }
    rest -= len;
    pts.shift();
  }
  return null;
}

function pushBarrier(line, kind, height, source, sub) {
  for (const part of clipLineToRect(line, RECT_M)) {
    if (lineLengthM(part) < 0.5) continue;
    const props = { kind, height };
    if (sub) props.sub = sub;
    props.source = source;
    bfeats.push(feature({ type: 'LineString', coordinates: part }, props));
  }
}

for (const w of osm.ways) {
  const t = w.tags;
  if (w.memberOnly || !t.barrier) continue;
  let kind = BARRIER_KIND[t.barrier];
  if (!kind) continue;
  if (underground(t)) continue;
  let sub = null;
  if (t.barrier === 'fence' && /railing|bars|metal/.test(t.fence_type || '')) kind = 'railing';
  if (t.barrier === 'retaining_wall') { sub = 'retaining'; if (nearWaterShare(w.coords) >= 0.5) { kind = 'quay_wall'; sub = null; } }
  if (t.barrier === 'city_wall') sub = 'city_wall';
  if (t.barrier === 'jersey_barrier') sub = 'jersey';
  const h = num(t.height);
  const height = h > 0 && h < 30 ? round1(h) : null;
  // coupe aux portails (nœuds barrier=gate, entrance=*…) en laissant une ouverture
  const pieces = [];
  let start = 0;
  for (let i = 1; i < w.refs.length - 1; i++) {
    if (gateNodes.has(w.refs[i])) { pieces.push([start, i]); start = i; bstats.portails++; }
  }
  pieces.push([start, w.refs.length - 1]);
  pieces.forEach(([a, b], idx) => {
    let line = w.coords.slice(a, b + 1).map((c) => [round7(c[0]), round7(c[1])]);
    // un portail peut aussi se trouver au tout début ou à la toute fin du chemin
    const gateAtStart = idx > 0 || gateNodes.has(w.refs[a]);
    const gateAtEnd = idx < pieces.length - 1 || gateNodes.has(w.refs[b]);
    if (gateAtStart && line) line = trim(line, GATE_HALF, true);
    if (gateAtEnd && line) line = trim(line, GATE_HALF, false);
    if (!line || line.length < 2) return;
    bstats.osm++;
    for (let i = 1; i < line.length; i++) osmBarrierIdx.insert(bboxOf([line[i - 1], line[i]]), { ax: toMx(line[i - 1][0]), ay: toMy(line[i - 1][1]), bx: toMx(line[i][0]), by: toMy(line[i][1]) });
    pushBarrier(line, kind, height, 'osm', sub);
  });
}

// IGN BD TOPO : quais et murs absents d'OSM
const NATURE_KIND = { Quai: 'quay_wall', 'Mur de soutènement': 'wall', Mur: 'wall' };
for (const f of readJson(path.join(RAW, 'ign', 'construction_lineaire', 'page-000.json')).features) {
  const p = f.properties;
  let kind = NATURE_KIND[p.nature];
  if (!kind || (p.nature === 'Quai' && p.nature_detaillee === 'Ponton')) continue;
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const raw of lines) {
    const line = simplifyLine(raw.map((c) => [round7(c[0]), round7(c[1])]), 0.05);
    if (line.length < 2) continue;
    const pts = samplePoints(line, 5);
    const dup = pts.filter((q) => distToSegs(osmBarrierIdx, q, 8) <= 6).length / pts.length;
    if (dup >= 0.5) { bstats.ignDoublons++; continue; }
    let sub = null;
    if (p.nature === 'Mur de soutènement') { sub = 'retaining'; if (nearWaterShare(line) >= 0.5) { kind = 'quay_wall'; sub = null; } }
    bstats.ignAjoutes++;
    pushBarrier(line, kind, null, 'ign', sub);
  }
}

const bk = {}, bl = {};
for (const f of bfeats) {
  bk[f.properties.kind] = (bk[f.properties.kind] || 0) + 1;
  bl[f.properties.kind] = Math.round((bl[f.properties.kind] || 0) + lineLengthM(f.geometry.coordinates));
}
const sizeB = writeGeojson(path.join(NORM, 'barriers.geojson'), bfeats, {
  generated: new Date().toISOString(),
  sources: [`OpenStreetMap (extrait du ${osm.meta.timestamp}) — ODbL 1.0`, 'IGN BD TOPO® (BDTOPO_V3:construction_lineaire) — Licence Ouverte 2.0'],
  count: bfeats.length, kinds: bk, lengthByKindM: bl, stats: bstats,
  note: 'height = attribut OSM « height » quand il existe, sinon null. Les lignes sont interrompues (3 m) aux portails connus.',
});
console.log(`barriers.geojson : ${bfeats.length} lignes, ${(sizeB / 1e6).toFixed(1)} Mo`);
console.log('  natures      :', JSON.stringify(bk));
console.log('  longueur (m) :', JSON.stringify(bl));
console.log('  stats        :', JSON.stringify(bstats), '| hauteur connue :', bfeats.filter((f) => f.properties.height != null).length);
