// fetch-a-7-places.mjs — couche normalisée « places » (raw/normalized/places.geojson) : toponymes.
//
//   node tools/map/fetch-a-7-places.mjs
//
//   street, bridge, quay : LineString — plus longue chaîne d'arêtes portant le même nom (lue dans roads.geojson)
//   square               : Point — places (place=square, surfaces « plaza » nommées, voies nommées « Place … »)
//   garden               : Point — parcs et jardins nommés (lus dans areas.geojson)
//   district             : Point — arrondissements, quartiers administratifs, quartiers d'usage
//   monument             : Point — monuments, édifices historiques, lieux de culte, musées
//   station              : Point — gares et stations (métro, RER, train)
//   institution          : Point — mairies, ministères, ambassades, tribunaux, commissariats, hôpitaux, universités…
//
// Aucune enseigne : tout objet portant une marque (brand), un commerce (shop), un hôtel ou un restaurant est écarté.
// Hors contrat : `rank` (1 = majeur, 2 = moyen, 3 = mineur) et `source`.
//
// Prérequis : fetch-a-5-roads.mjs et fetch-a-6-areas.mjs (mêmes données OSM).

import path from 'node:path';
import {
  RAW, NORM, RECT_M, MX, MZ, readJson, cleanRing, orientPolygon, polygonAreaM, interiorPoint, assembleRings, groupRings,
  lineLengthM, polysOf, writeGeojson, feature, round7, normName, isCommercialTags, commercialNameSet,
} from './lib-a.mjs';

const osm = readJson(path.join(RAW, 'osm', 'extract-a.json'));
const roads = readJson(path.join(NORM, 'roads.geojson')).features;
const areas = readJson(path.join(NORM, 'areas.geojson')).features;
const wayById = new Map(osm.ways.map((w) => [w.id, w]));
const inRect = (pt) => pt[0] >= RECT_M[0] && pt[0] <= RECT_M[2] && pt[1] >= RECT_M[1] && pt[1] <= RECT_M[3];
const distM = (a, b) => Math.hypot((a[0] - b[0]) * MX, (a[1] - b[1]) * MZ);
const norm = normName;
const pt = (c) => ({ type: 'Point', coordinates: [round7(c[0]), round7(c[1])] });

const feats = [];
const add = (geometry, kind, name, rank, source = 'osm') => feats.push(feature(geometry, { kind, name, rank, source }));

// ───────────── 1. Rues, ponts, quais, places : d'après les arêtes nommées de roads.geojson ─────────────
const SQUARE_RE = /^(Place|Rond-Point|Carrefour|Parvis|Esplanade)\b/i;
const BRIDGE_RE = /^(Pont|Passerelle|Viaduc|Petit Pont)\b/i;
const QUAY_RE = /^(Quai|Port)\b/i;
const CLASS_RANK = { motorway: 1, trunk: 1, primary: 1, secondary: 2, tertiary: 2, residential: 3, living: 3, pedestrian: 3, service: 3, footway: 3, steps: 3, cycleway: 3 };
const byName = new Map();
for (const f of roads) {
  const p = f.properties;
  if (!p.name) continue;
  let g = byName.get(p.name);
  if (!g) byName.set(p.name, (g = []));
  g.push(f);
}
const squaresFromRoads = [];
const key = (c) => `${c[0]},${c[1]}`;
/** Segment le plus proche : distance d'un point à une ligne (m). */
function distToLine(p, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - p[0]) * MX, ay = (line[i - 1][1] - p[1]) * MZ, bx = (line[i][0] - p[0]) * MX, by = (line[i][1] - p[1]) * MZ;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
const midOf = (line) => {
  const half = lineLengthM(line) / 2;
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const len = distM(line[i - 1], line[i]);
    if (acc + len >= half && len > 0) {
      const t = (half - acc) / len;
      return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])];
    }
    acc += len;
  }
  return line[Math.floor(line.length / 2)];
};

for (const [name, edges] of byName) {
  // les voies principales priment : pistes cyclables et voies de service ne servent que si elles sont seules à porter le nom
  const main = edges.filter((f) => f.properties.class !== 'cycleway' && f.properties.class !== 'service');
  const use = main.length ? main : edges;
  const rank = Math.min(...use.map((f) => CLASS_RANK[f.properties.class] || 3));
  if (SQUARE_RE.test(name)) {
    let sx = 0, sy = 0, sl = 0;
    for (const f of use) {
      const l = lineLengthM(f.geometry.coordinates), m = midOf(f.geometry.coordinates);
      sx += m[0] * l; sy += m[1] * l; sl += l;
    }
    if (sl > 0) squaresFromRoads.push({ name, c: [sx / sl, sy / sl], rank });
    continue;
  }
  // graphe des arêtes de ce nom → composantes connexes → plus long chemin (double parcours de Dijkstra)
  const adj = new Map();
  const link = (a, b, f, rev) => { let l = adj.get(a); if (!l) adj.set(a, (l = [])); l.push({ to: b, f, rev }); };
  for (const f of use) {
    const c = f.geometry.coordinates;
    const a = key(c[0]), b = key(c[c.length - 1]);
    f._len = lineLengthM(c);
    link(a, b, f, false); link(b, a, f, true);
  }
  const seen = new Set();
  const chains = [];
  const farthest = (src) => {
    const dist = new Map([[src, 0]]), prev = new Map();
    const queue = [src];
    while (queue.length) {
      let bi = 0;
      for (let i = 1; i < queue.length; i++) if (dist.get(queue[i]) < dist.get(queue[bi])) bi = i;
      const u = queue.splice(bi, 1)[0];
      for (const e of adj.get(u)) {
        const nd = dist.get(u) + e.f._len;
        if (!dist.has(e.to) || nd < dist.get(e.to)) {
          if (!dist.has(e.to)) queue.push(e.to);
          dist.set(e.to, nd); prev.set(e.to, { from: u, e });
        }
      }
    }
    let far = src;
    for (const [k, d] of dist) if (d > dist.get(far)) far = k;
    return { far, dist, prev };
  };
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const a = farthest(start);
    for (const k of a.dist.keys()) seen.add(k);
    const b = farthest(a.far);
    const line = [];
    let cur = b.far;
    while (b.prev.has(cur)) {
      const { from, e } = b.prev.get(cur);
      // l'arête est parcourue de `from` vers `cur` ; on remonte de la fin vers le début
      const c = e.rev ? e.f.geometry.coordinates.slice().reverse() : e.f.geometry.coordinates;
      const seg = c.slice().reverse();
      line.push(...(line.length ? seg.slice(1) : seg));
      cur = from;
    }
    if (line.length >= 2) chains.push({ line: line.reverse(), len: b.dist.get(b.far) });
  }
  chains.sort((x, y) => y.len - x.len);
  const keptChains = [];
  for (const ch of chains) {
    if (ch.len < 20 && keptChains.length) continue;
    // chaussée jumelle ou contre-allée : même nom, tracé parallèle à moins de 45 m d'une chaîne déjà retenue
    const m = midOf(ch.line);
    if (keptChains.some((k) => distToLine(m, k.line) < 45 && distToLine(ch.line[0], k.line) < 60 && distToLine(ch.line[ch.line.length - 1], k.line) < 60)) continue;
    keptChains.push(ch);
  }
  const kind = BRIDGE_RE.test(name) ? 'bridge' : QUAY_RE.test(name) ? 'quay' : 'street';
  for (const ch of keptChains) add({ type: 'LineString', coordinates: ch.line }, kind, name, rank);
}

// ───────────── Objets OSM nommés (nœuds, chemins fermés, relations) → point représentatif ─────────────
function relationPolys(r) {
  const part = (inner) => assembleRings(r.members.filter((m) => m.type === 'w' && (m.role === 'inner') === inner).map((m) => wayById.get(m.ref)).filter(Boolean)).rings.map(cleanRing).filter(Boolean);
  const outers = part(false);
  return outers.length ? groupRings(outers, part(true)).map(orientPolygon) : [];
}
const objects = []; // { tags, c:[lon,lat], area, type }
for (const n of osm.nodes) if (n.tags.name) objects.push({ tags: n.tags, c: [n.lon, n.lat], area: 0, type: 'n' });
for (const w of osm.ways) {
  if (!w.tags.name || w.memberOnly || w.tags.highway) continue;
  if (w.refs[0] === w.refs[w.refs.length - 1] && w.coords.length >= 4) {
    const ring = cleanRing(w.coords);
    if (!ring) continue;
    const poly = orientPolygon([ring]);
    objects.push({ tags: w.tags, c: interiorPoint(poly), area: polygonAreaM(poly), type: 'w' });
  } else if (w.tags.man_made === 'bridge' || w.tags.bridge) objects.push({ tags: w.tags, c: midOf(w.coords), area: 0, type: 'w' });
}
for (const r of osm.relations) {
  if (!r.tags.name) continue;
  const polys = relationPolys(r);
  if (!polys.length) continue;
  const big = polys.reduce((x, y) => (polygonAreaM(x) >= polygonAreaM(y) ? x : y));
  objects.push({ tags: r.tags, c: interiorPoint(big), area: polys.reduce((s, p) => s + polygonAreaM(p), 0), type: 'r' });
}

const isCommercial = isCommercialTags;
const commercialNames = commercialNameSet(osm); // noms portés par au moins un commerce : jamais repris comme monument ou institution
const notable = (t) => !!(t.wikidata || t.wikipedia);

/**
 * Déduplique des candidats { name, c, score, rank } portant le même nom à moins de `radius` mètres : le meilleur score
 * donne la position, le meilleur rang (le plus petit) est conservé. `keyOf` permet d'assimiler des variantes de nom.
 */
function dedupe(cands, radius, keyOf = norm) {
  cands.sort((a, b) => b.score - a.score);
  const kept = [];
  const byN = new Map();
  for (const c of cands) {
    const k = keyOf(c.name);
    const same = byN.get(k) || [];
    const twin = same.find((o) => distM(o.c, c.c) < radius);
    if (twin) { twin.rank = Math.min(twin.rank, c.rank); continue; }
    same.push(c); byN.set(k, same); kept.push(c);
  }
  return kept;
}

// ───────────── 2. Places ─────────────
{
  const cands = [];
  // rang : 1 = grande place (≥ 12 000 m² ou traversée par un axe « primary »), 2 = moyenne, 3 = petite
  const areaRank = (a) => (a >= 12000 ? 1 : a >= 3000 ? 2 : 3);
  for (const o of objects) if (o.tags.place === 'square' && inRect(o.c)) cands.push({ name: o.tags.name, c: o.c, score: 3 + (notable(o.tags) ? 1 : 0) + (o.type !== 'n' ? 0.5 : 0), rank: o.type === 'n' ? 3 : areaRank(o.area) });
  for (const f of areas) {
    const p = f.properties;
    if (p.kind !== 'plaza' || !p.name) continue;
    const polys = polysOf(f.geometry);
    const big = polys.reduce((x, y) => (polygonAreaM(x) >= polygonAreaM(y) ? x : y));
    cands.push({ name: p.name, c: interiorPoint(big), score: 2, rank: areaRank(polys.reduce((s, q) => s + polygonAreaM(q), 0)) });
  }
  for (const s of squaresFromRoads) if (inRect(s.c)) cands.push({ name: s.name, c: s.c, score: 1, rank: s.rank });
  for (const c of dedupe(cands, 400)) add(pt(c.c), 'square', c.name, c.rank);
}

// ───────────── 3. Parcs et jardins nommés ─────────────
{
  const cands = [];
  for (const f of areas) {
    const p = f.properties;
    if ((p.kind !== 'park' && p.kind !== 'garden' && p.kind !== 'cemetery') || !p.name) continue;
    const polys = polysOf(f.geometry);
    const area = polys.reduce((s, q) => s + polygonAreaM(q), 0);
    const big = polys.reduce((x, y) => (polygonAreaM(x) >= polygonAreaM(y) ? x : y));
    cands.push({ name: p.name, c: interiorPoint(big), score: area, rank: area > 40000 ? 1 : area > 4000 ? 2 : 3, source: p.source });
  }
  for (const c of dedupe(cands, 600)) add(pt(c.c), 'garden', c.name, c.rank, c.source);
}

// ───────────── 4. Arrondissements et quartiers ─────────────
{
  const cands = [];
  for (const o of objects) {
    const t = o.tags;
    if (!inRect(o.c)) continue;
    if (['suburb', 'quarter', 'neighbourhood'].includes(t.place)) cands.push({ name: t.name, c: o.c, score: (o.type === 'n' ? 2 : 1) + (t.place === 'suburb' ? 1 : 0), rank: t.place === 'suburb' ? 1 : t.place === 'quarter' ? 2 : 3 });
    else if (t.boundary === 'administrative' && (t.admin_level === '9' || t.admin_level === '10')) cands.push({ name: t.name, c: o.c, score: 0.5, rank: t.admin_level === '9' ? 1 : 2 });
  }
  for (const c of dedupe(cands, 1500, (n) => norm(n).replace(/^paris /, ''))) add(pt(c.c), 'district', c.name, c.rank);
}

// ───────────── 5. Monuments ─────────────
{
  const HIST = new Set(['monument', 'castle', 'palace', 'city_gate', 'tower', 'fort', 'citywalls', 'church', 'ruins', 'archaeological_site', 'monastery', 'triumphal_arch']);
  const MM = new Set(['tower', 'obelisk', 'column', 'arch']);
  const MEMORIAL_OK = new Set(['statue', 'war_memorial', 'obelisk', 'stele', 'sculpture', 'bust', 'column', undefined]);
  const cands = [];
  for (const o of objects) {
    const t = o.tags;
    if (!inRect(o.c) || isCommercial(t)) continue;
    // déjà couverts par d'autres natures : places, jardins, voies, gares
    if (t.place === 'square' || t.leisure === 'park' || t.leisure === 'garden' || t.highway || t.railway === 'station' || t.public_transport === 'station') continue;
    const strong = HIST.has(t.historic) || t.amenity === 'place_of_worship';
    let ok = strong;
    if (!ok && t.historic === 'memorial') ok = notable(t) && MEMORIAL_OK.has(t.memorial);
    if (!ok && (t.tourism === 'attraction' || t.tourism === 'museum')) ok = notable(t);
    if (!ok && MM.has(t.man_made)) ok = notable(t);
    if (!ok && (t.historic === 'building' || t.historic === 'manor' || t.historic === 'yes') && notable(t)) ok = true; // hôtels particuliers, édifices historiques
    if (!ok) continue;
    if (!strong) {
      // ni grand magasin, ni siège d'entreprise, ni nom porté par un commerce
      if (['retail', 'commercial', 'supermarket', 'office', 'hotel', 'apartments', 'residential'].includes(t.building)) continue;
      if (commercialNames.has(norm(t.name))) continue;
    }
    cands.push({ name: t.name, c: o.c, score: (notable(t) ? 10 : 0) + (o.type === 'n' ? 0 : 2) + Math.min(5, o.area / 5000), rank: notable(t) && (o.area > 3000 || t.tourism === 'attraction') ? 1 : notable(t) ? 2 : 3 });
  }
  for (const c of dedupe(cands, 250)) add(pt(c.c), 'monument', c.name, c.rank);
}

// ───────────── 6. Gares et stations ─────────────
{
  const cands = [];
  for (const o of objects) {
    const t = o.tags;
    if (!inRect(o.c)) continue;
    if (t.railway === 'station' || t.railway === 'halt' || (t.public_transport === 'station' && (t.station || t.subway === 'yes' || t.train === 'yes'))) {
      const train = t.station !== 'subway' && t.subway !== 'yes' && (t.train === 'yes' || !t.station || t.station === 'train');
      cands.push({ name: t.name, c: o.c, score: (train ? 5 : 0) + (o.type === 'n' ? 1 : 0) + (notable(t) ? 1 : 0), rank: train ? 1 : 2 });
    }
  }
  for (const c of dedupe(cands, 500)) add(pt(c.c), 'station', c.name, c.rank);
}

// ───────────── 7. Institutions publiques ─────────────
{
  const AM = new Set(['townhall', 'courthouse', 'police', 'fire_station', 'embassy', 'hospital', 'university', 'college', 'library', 'prison', 'public_building']);
  const cands = [];
  for (const o of objects) {
    const t = o.tags;
    if (!inRect(o.c) || isCommercial(t)) continue;
    const ok = AM.has(t.amenity) || t.office === 'government' || t.office === 'diplomatic' || t.diplomatic === 'embassy' || t.building === 'government' || (t.government && t.government !== 'no');
    if (!ok || commercialNames.has(norm(t.name))) continue;
    const major = t.amenity === 'townhall' || t.office === 'government' || t.building === 'government' || t.amenity === 'courthouse' || t.amenity === 'hospital';
    cands.push({ name: t.name, c: o.c, score: (notable(t) ? 5 : 0) + (o.type === 'n' ? 0 : 2) + Math.min(5, o.area / 5000), rank: notable(t) && major ? 1 : major || notable(t) ? 2 : 3 });
  }
  // un édifice déjà étiqueté « monument » sous le même nom n'est pas répété
  const monuments = feats.filter((f) => f.properties.kind === 'monument');
  for (const c of dedupe(cands, 250)) {
    if (monuments.some((m) => norm(m.properties.name) === norm(c.name) && distM(m.geometry.coordinates, c.c) < 250)) continue;
    add(pt(c.c), 'institution', c.name, c.rank);
  }
}

// ───────────── Écriture ─────────────
const kinds = {};
for (const f of feats) kinds[f.properties.kind] = (kinds[f.properties.kind] || 0) + 1;
const size = writeGeojson(path.join(NORM, 'places.geojson'), feats, {
  generated: new Date().toISOString(),
  sources: [`OpenStreetMap (extrait du ${osm.meta.timestamp}) — ODbL 1.0`, 'Ville de Paris — Espaces verts et assimilés (noms des jardins absents d\'OSM) — ODbL'],
  count: feats.length, kinds,
});
console.log(`places.geojson : ${feats.length} toponymes, ${(size / 1e6).toFixed(1)} Mo`);
console.log('  natures :', JSON.stringify(kinds));
for (const k of ['square', 'bridge', 'quay', 'district', 'station', 'monument', 'institution', 'garden']) {
  const l = feats.filter((f) => f.properties.kind === k);
  const r1 = l.filter((f) => f.properties.rank === 1).map((f) => f.properties.name);
  console.log(`  ${k} (rang 1 : ${r1.length}) : ${r1.slice(0, 45).join(' | ')}`);
}
