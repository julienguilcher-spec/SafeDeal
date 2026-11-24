// fetch-b-1-osm.mjs — OpenStreetMap : extrait des objets utiles aux couches de détail (lot B).
// Entrée : extrait .osm.pbf de Paris (réutilise raw/osm/paris.osm.pbf s'il a déjà été téléchargé par le lot A,
//          sinon le télécharge dans raw/b/osm/). Sortie : raw/b/osm-extract-b.json (cache, relancer avec --force pour le refaire).
// Contenu de l'extrait : nœuds étiquetés (points d'intérêt, mobilier, feux, arbres, bouches de métro), chemins et relations
// porteurs d'une étiquette utile (bâtiments, monuments, ponts, commerces surfaciques, fontaines…), avec leur géométrie.

import fs from 'node:fs';
import path from 'node:path';
import { RAW, RAW_B, BBOX_M, bboxWithMargin, inBox, round7, download, HostDownError, readPbf, FORCE, tally } from './lib-b.mjs';

const OUT = path.join(RAW_B, 'osm-extract-b.json');
// --force ne refait l'extrait OSM que si CE script est lancé directement : les autres scripts fetch-b-* l'importent
// et ne doivent pas retélécharger 48 Mo chacun.
const IS_MAIN = import.meta.url === `file://${process.argv[1]}`;
const FORCE_OSM = FORCE && IS_MAIN;
const PBF_SHARED = path.join(RAW, 'osm', 'paris.osm.pbf'); // cache du lot A (lecture seule)
const PBF_OWN = path.join(RAW_B, 'osm', 'paris.osm.pbf');
const MIRRORS = [
  'https://download.openstreetmap.fr/extracts/europe/france/ile_de_france/paris.osm.pbf',
  'https://download.bbbike.org/osm/bbbike/Paris/Paris.osm.pbf',
];

/** Clés qui rendent un nœud intéressant pour le lot B. */
const NODE_KEYS = ['shop', 'amenity', 'tourism', 'highway', 'railway', 'natural', 'barrier', 'man_made', 'historic', 'advertising', 'emergency',
  'public_transport', 'office', 'craft', 'leisure', 'healthcare', 'station', 'artwork_type', 'memorial', 'crossing', 'vending'];
/** Clés qui rendent un chemin ou une relation intéressant (emprises de monuments, commerces surfaciques, ponts…). */
const AREA_KEYS = ['building', 'building:part', 'shop', 'amenity', 'tourism', 'man_made', 'historic', 'office', 'craft', 'leisure', 'healthcare',
  'railway', 'public_transport', 'natural', 'bridge', 'wikidata', 'landuse', 'place', 'memorial'];

async function ensurePbf() {
  if (!FORCE_OSM && fs.existsSync(PBF_SHARED) && fs.statSync(PBF_SHARED).size > 1e6) return { file: PBF_SHARED, origin: 'cache du lot A (raw/osm/paris.osm.pbf)', url: MIRRORS[0] };
  const pbfOk = (buf) => (buf.length > 1e6 && buf.subarray(0, 64).includes('OSMHeader') ? null : 'ce fichier n\'est pas un extrait PBF');
  for (const url of MIRRORS) {
    try {
      const r = await download(url, PBF_OWN, { validate: pbfOk, timeoutS: 900, force: FORCE_OSM });
      return { file: PBF_OWN, origin: r.cached ? 'cache du lot B' : 'téléchargé', url };
    } catch (e) {
      if (!(e instanceof HostDownError)) throw e;
      console.error('  miroir abandonné : ' + url);
    }
  }
  throw new Error('aucun miroir OpenStreetMap ne répond');
}

export async function loadOsmExtract() {
  if (!FORCE_OSM && fs.existsSync(OUT)) return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const pbf = await ensurePbf();
  console.log(`OSM : lecture de ${path.relative(RAW, pbf.file)} (${(fs.statSync(pbf.file).size / 1e6).toFixed(1)} Mo, ${pbf.origin})`);
  const t0 = Date.now();
  // Boîte large : coordonnées gardées pour reconstituer les chemins qui débordent de l'emprise.
  const wide = bboxWithMargin(1500);
  let cap = 1 << 20, n = 0, sorted = true, last = -Infinity;
  let ids = new Float64Array(cap), lons = new Float64Array(cap), lats = new Float64Array(cap);
  const nodes = [];
  const waysAll = new Map(); // id → { refs, tags } pour tout chemin touchant l'emprise
  const relsAll = [];
  let nodeIndex = null;
  const find = (id) => {
    let lo = 0, hi = n - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; const v = ids[mid]; if (v === id) return mid; if (v < id) lo = mid + 1; else hi = mid - 1; }
    return -1;
  };
  const inMain = new Set(); // identifiants des nœuds dans l'emprise (+ marge de 60 m)
  readPbf(pbf.file, {
    onNode(id, lon, lat, tags) {
      if (!inBox(lon, lat, wide)) return;
      if (n === cap) { cap *= 2; const a = new Float64Array(cap), b = new Float64Array(cap), c = new Float64Array(cap); a.set(ids); b.set(lons); c.set(lats); ids = a; lons = b; lats = c; }
      if (id < last) sorted = false;
      last = id;
      ids[n] = id; lons[n] = lon; lats[n] = lat; n++;
      if (inBox(lon, lat)) {
        inMain.add(id);
        if (tags && NODE_KEYS.some((k) => k in tags)) nodes.push({ id, lon: round7(lon), lat: round7(lat), tags });
      }
    },
    onWay(id, refs, tags) {
      if (!sorted && !nodeIndex) { // fichier non trié : on trie une fois, avant la première recherche
        const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => ids[a] - ids[b]);
        const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n);
        order.forEach((o, i) => { a[i] = ids[o]; b[i] = lons[o]; c[i] = lats[o]; });
        ids = a; lons = b; lats = c; nodeIndex = true;
      }
      for (const r of refs) if (inMain.has(r)) { waysAll.set(id, { refs, tags }); return; }
    },
    onRelation(id, members, tags) {
      if (tags.type !== 'multipolygon' && tags.type !== 'building' && tags.type !== 'site' && tags.type !== 'bridge') return;
      if (members.some((m) => m.type === 'w' && waysAll.has(m.ref))) relsAll.push({ id, members, tags });
    },
  });
  const coordsOf = (refs) => {
    const out = []; let missing = 0;
    for (const r of refs) { const i = find(r); if (i < 0) missing++; else out.push([round7(lons[i]), round7(lats[i])]); }
    return { coords: out, missing };
  };
  const interesting = (tags) => AREA_KEYS.some((k) => k in tags);
  const ways = [];
  const usedByRel = new Set();
  const relations = [];
  for (const r of relsAll) {
    if (!interesting(r.tags)) continue;
    const members = [];
    for (const m of r.members) {
      if (m.type !== 'w') { members.push({ type: m.type, ref: m.ref, role: m.role }); continue; }
      const w = waysAll.get(m.ref);
      if (!w) { members.push({ type: 'w', ref: m.ref, role: m.role, coords: null }); continue; }
      usedByRel.add(m.ref);
      members.push({ type: 'w', ref: m.ref, role: m.role, coords: coordsOf(w.refs).coords });
    }
    relations.push({ id: r.id, tags: r.tags, members });
  }
  for (const [id, w] of waysAll) {
    if (!interesting(w.tags)) continue;
    // Les voies ordinaires relèvent du lot A : on ne garde ici que les ponts nommés (emprise des ponts-monuments).
    if (w.tags.highway && !w.tags.building && !w.tags.man_made && !(w.tags.bridge && w.tags.bridge !== 'no')) continue;
    if (w.tags.railway && ['rail', 'subway', 'light_rail', 'tram', 'platform'].includes(w.tags.railway) && !w.tags.building) continue;
    const { coords, missing } = coordsOf(w.refs);
    if (coords.length < 2) continue;
    ways.push({ id, tags: w.tags, coords, closed: w.refs.length > 3 && w.refs[0] === w.refs[w.refs.length - 1], ...(missing ? { missing } : {}) });
  }
  const extract = {
    meta: { source: pbf.url, file: path.relative(RAW, pbf.file), bytes: fs.statSync(pbf.file).size, mtime: fs.statSync(pbf.file).mtime.toISOString(), bbox: BBOX_M,
      counts: { nodes: nodes.length, ways: ways.length, relations: relations.length, nodesWideBox: n, waysTouching: waysAll.size } },
    nodes, ways, relations,
  };
  fs.mkdirSync(RAW_B, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(extract));
  console.log(`OSM : ${nodes.length} nœuds utiles, ${ways.length} chemins, ${relations.length} relations → ${path.relative(RAW, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} Mo, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return extract;
}

if (IS_MAIN) {
  const ex = await loadOsmExtract();
  console.log('OSM extrait :', JSON.stringify(ex.meta.counts));
  if (process.argv.includes('--stats')) {
    for (const k of ['shop', 'amenity', 'tourism', 'highway', 'railway', 'natural', 'barrier', 'man_made', 'historic', 'advertising', 'emergency', 'office', 'craft', 'leisure']) {
      const t = tally(ex.nodes.filter((n) => k in n.tags), (n) => n.tags[k]);
      console.log(`\nnœuds ${k} :`, Object.entries(t).slice(0, 60).map(([a, b]) => `${a}=${b}`).join(' '));
    }
  }
}
