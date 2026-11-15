// fetch-a-1-osm.mjs — OpenStreetMap : télécharge l'extrait « Paris » (département 75) et en tire
// tout ce qui touche l'emprise du jeu (nœuds étiquetés, chemins avec géométrie, relations).
//
//   node tools/map/fetch-a-1-osm.mjs [--force]
//
// Source : https://download.openstreetmap.fr/extracts/europe/france/ile_de_france/paris.osm.pbf
//          (extraits quotidiens d'OpenStreetMap France ; données © les contributeurs d'OpenStreetMap, ODbL 1.0)
// Sorties (cache, ignoré par git) :
//   raw/osm/paris.osm.pbf        fichier brut
//   raw/osm/paris.state.txt      date de l'extrait
//   raw/osm/extract-a.json       { meta, nodes[], ways[], relations[] } limité à l'emprise + marge

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RAW, BBOX, BBOX_M, download, pbfBlobs, decodePrimitiveBlock } from './lib-a.mjs';

const force = process.argv.includes('--force');
const BASE = 'https://download.openstreetmap.fr/extracts/europe/france/ile_de_france';
const dir = path.join(RAW, 'osm');
const pbf = path.join(dir, 'paris.osm.pbf');
const out = path.join(dir, 'extract-a.json');

const isPbf = (buf) => (buf.length > 1e6 && buf.includes('OSMHeader', 0, 'latin1') ? null : 'pas un fichier PBF');
const d1 = await download(`${BASE}/paris.osm.pbf`, pbf, { force, validate: isPbf, timeoutS: 900 });
await download(`${BASE}/paris.state.txt`, path.join(dir, 'paris.state.txt'), { force: force || !d1.cached });
const md5 = crypto.createHash('md5').update(fs.readFileSync(pbf)).digest('hex');
const state = fs.readFileSync(path.join(dir, 'paris.state.txt'), 'utf8');
const timestamp = (state.match(/timestamp=(.*)/)?.[1] || '').replace(/\\/g, '');
console.log(`OSM : ${pbf} (${(fs.statSync(pbf).size / 1e6).toFixed(1)} Mo, md5 ${md5}, extrait du ${timestamp})${d1.cached ? ' [cache]' : ''}`);

if (!force && fs.existsSync(out)) {
  const meta = JSON.parse(fs.readFileSync(out, 'utf8')).meta;
  if (meta.md5 === md5 && meta.version === 2) {
    console.log(`extract-a.json déjà à jour : ${meta.counts.nodes} nœuds étiquetés, ${meta.counts.ways} chemins, ${meta.counts.relations} relations`);
    process.exit(0);
  }
}

// ── Passe 1 : tous les nœuds (coordonnées), chemins touchant l'emprise, toutes les relations utiles ──
const W = Math.round(BBOX_M.west * 1e7), E = Math.round(BBOX_M.east * 1e7);
const S = Math.round(BBOX_M.south * 1e7), N = Math.round(BBOX_M.north * 1e7);

let cap = 1 << 22, n = 0;
let ids = new Float64Array(cap), lons = new Int32Array(cap), lats = new Int32Array(cap);
const taggedNodes = [];
const ways = new Map(); // id → { id, tags, refs }
const relationsAll = [];
const IGNORED_NODE_KEYS = new Set(['source', 'created_by', 'note', 'fixme', 'FIXME']);

function nodeIndex(id) {
  let lo = 0, hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = ids[mid];
    if (v === id) return mid;
    if (v < id) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

const t0 = Date.now();
let lastNodeId = -1;
for (const blob of pbfBlobs(pbf)) {
  if (blob.type !== 'OSMData') continue;
  decodePrimitiveBlock(blob.data, {
    onNode(id, lon, lat, tags) {
      if (id <= lastNodeId) throw new Error('nœuds non triés : fichier PBF inattendu');
      lastNodeId = id;
      if (n === cap) {
        cap *= 2;
        const a = new Float64Array(cap); a.set(ids); ids = a;
        const b = new Int32Array(cap); b.set(lons); lons = b;
        const c = new Int32Array(cap); c.set(lats); lats = c;
      }
      ids[n] = id; lons[n] = lon; lats[n] = lat; n++;
      if (tags && lon >= W && lon <= E && lat >= S && lat <= N) {
        let useful = false;
        for (const k in tags) if (!IGNORED_NODE_KEYS.has(k)) { useful = true; break; }
        if (useful) taggedNodes.push({ id, lon: lon / 1e7, lat: lat / 1e7, tags });
      }
    },
    onWay(id, tags, refs) {
      // conservé si sa boîte englobante touche l'emprise élargie
      let w = Infinity, e = -Infinity, s = Infinity, nn = -Infinity;
      for (const ref of refs) {
        const i = nodeIndex(ref);
        if (i < 0) continue;
        const x = lons[i], y = lats[i];
        if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > nn) nn = y;
      }
      if (e >= W && w <= E && nn >= S && s <= N) ways.set(id, { id, tags, refs });
    },
    onRelation(id, tags, members) {
      const t = tags.type;
      if (t === 'multipolygon' || (t === 'boundary' && (tags.admin_level === '9' || tags.admin_level === '10')) || t === 'bridge' || t === 'tunnel') {
        relationsAll.push({ id, tags, members });
      }
    },
  });
}
console.log(`passe 1 : ${n} nœuds lus, ${ways.size} chemins touchant l'emprise, ${relationsAll.length} relations candidates (${Date.now() - t0} ms)`);

// Relations conservées : au moins un chemin membre conservé (ou un nœud membre dans l'emprise).
const relations = relationsAll.filter((r) => r.members.some((m) => (m.type === 'w' && ways.has(m.ref))));
const missing = new Set();
for (const r of relations) for (const m of r.members) if (m.type === 'w' && !ways.has(m.ref)) missing.add(m.ref);

// ── Passe 2 : chemins membres de relations conservées mais situés hors de l'emprise ──
const memberOnly = new Set();
if (missing.size) {
  for (const blob of pbfBlobs(pbf)) {
    if (blob.type !== 'OSMData') continue;
    decodePrimitiveBlock(blob.data, {
      onWay(id, tags, refs) {
        if (missing.has(id)) { ways.set(id, { id, tags, refs }); memberOnly.add(id); }
      },
    });
  }
  console.log(`passe 2 : ${memberOnly.size}/${missing.size} chemins membres supplémentaires`);
}

// ── Résolution des géométries ──
let unresolved = 0;
const waysOut = [];
for (const w of ways.values()) {
  const coords = [];
  const refs = [];
  for (const ref of w.refs) {
    const i = nodeIndex(ref);
    if (i < 0) { unresolved++; continue; }
    coords.push([lons[i] / 1e7, lats[i] / 1e7]);
    refs.push(ref);
  }
  if (coords.length < 2) continue;
  const o = { id: w.id, tags: w.tags, refs, coords };
  if (memberOnly.has(w.id)) o.memberOnly = true;
  waysOut.push(o);
}

const meta = {
  version: 2,
  source: `${BASE}/paris.osm.pbf`,
  license: 'ODbL 1.0 — © les contributeurs d\'OpenStreetMap',
  md5, timestamp, bbox: BBOX, bboxWithMargin: BBOX_M,
  counts: { nodes: taggedNodes.length, ways: waysOut.length, relations: relations.length, unresolvedRefs: unresolved },
};
// Écriture en flux (le JSON complet dépasse la taille maximale d'une chaîne s'il est sérialisé d'un bloc)
const fd = fs.openSync(out + '.part', 'w');
const writeArr = (name, arr, last) => {
  fs.writeSync(fd, `"${name}":[\n`);
  let chunk = '';
  for (let i = 0; i < arr.length; i++) {
    chunk += JSON.stringify(arr[i]) + (i < arr.length - 1 ? ',\n' : '\n');
    if (chunk.length > 1 << 22) { fs.writeSync(fd, chunk); chunk = ''; }
  }
  fs.writeSync(fd, chunk + (last ? ']\n' : '],\n'));
};
fs.writeSync(fd, `{"meta":${JSON.stringify(meta)},\n`);
writeArr('nodes', taggedNodes);
writeArr('ways', waysOut);
writeArr('relations', relations, true);
fs.writeSync(fd, '}\n');
fs.closeSync(fd);
fs.renameSync(out + '.part', out);
console.log(`écrit ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} Mo) :`, meta.counts);
