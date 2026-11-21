// fetch-a-1-osm.mjs — OpenStreetMap : télécharge un extrait couvrant Paris et en tire tout ce qui touche
// l'emprise du jeu (nœuds étiquetés, chemins avec géométrie, relations).
//
//   node tools/map/fetch-a-1-osm.mjs [--force] [--mirror=osmfr|bbbike] [--out=fichier.json]
//
// Sources (données © les contributeurs d'OpenStreetMap, ODbL 1.0), essayées dans l'ordre :
//   osmfr  : https://download.openstreetmap.fr/extracts/europe/france/ile_de_france/paris.osm.pbf  (département 75, quotidien)
//   bbbike : https://download.bbbike.org/osm/bbbike/Paris/Paris.osm.pbf                            (agglomération, hebdomadaire)
// (overpass-api.de, overpass.openstreetmap.fr et download.geofabrik.de ne répondent pas depuis cette machine.)
// Sorties (cache, ignoré par git) :
//   raw/osm/<miroir>.osm.pbf     fichier brut
//   raw/osm/extract-a.json       { meta, nodes[], ways[], relations[] } limité à l'emprise + marge

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RAW, BBOX, BBOX_M, download, HostDownError, pbfBlobs, pbfHeader, decodePrimitiveBlock } from './lib-a.mjs';

const force = process.argv.includes('--force');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] || null;
const MIRRORS = [
  { key: 'osmfr', url: 'https://download.openstreetmap.fr/extracts/europe/france/ile_de_france/paris.osm.pbf', file: 'paris.osm.pbf' },
  { key: 'bbbike', url: 'https://download.bbbike.org/osm/bbbike/Paris/Paris.osm.pbf', file: 'paris-bbbike.osm.pbf' },
];
const dir = path.join(RAW, 'osm');
const out = arg('out') ? path.resolve(arg('out')) : path.join(dir, 'extract-a.json');
const wanted = arg('mirror');
const candidates = wanted ? MIRRORS.filter((m) => m.key === wanted) : MIRRORS;
if (!candidates.length) throw new Error(`miroir inconnu : ${wanted}`);

const isPbf = (buf) => (buf.length > 1e6 && buf.subarray(0, 64).includes('OSMHeader') ? null : 'pas un fichier PBF');
let mirror = null, pbf = null, cached = false;
for (const m of candidates) {
  const dest = path.join(dir, m.file);
  try {
    const d = await download(m.url, dest, { force, validate: isPbf, timeoutS: 1800 });
    mirror = m; pbf = dest; cached = d.cached;
    break;
  } catch (e) {
    if (!(e instanceof HostDownError)) throw e;
    console.error(`  ${m.key} indisponible, source suivante…`);
  }
}
if (!mirror) throw new Error('aucun miroir OpenStreetMap disponible');
const md5 = crypto.createHash('md5').update(fs.readFileSync(pbf)).digest('hex');
const header = pbfHeader(pbf);
const timestamp = header.timestamp || 'date inconnue';
console.log(`OSM (${mirror.key}) : ${pbf} (${(fs.statSync(pbf).size / 1e6).toFixed(1)} Mo, md5 ${md5}, données du ${timestamp})${cached ? ' [cache]' : ''}`);

if (!force && fs.existsSync(out)) {
  // lecture de la seule première ligne (métadonnées) : le fichier complet pèse des dizaines de Mo
  const fd0 = fs.openSync(out, 'r');
  const head = Buffer.alloc(4096);
  const n0 = fs.readSync(fd0, head, 0, 4096, 0);
  fs.closeSync(fd0);
  const first = head.subarray(0, n0).toString('utf8').split('\n')[0];
  let meta = null;
  try { meta = JSON.parse(first.replace(/^\{"meta":/, '').replace(/,$/, '')); } catch { meta = null; }
  if (meta && meta.md5 === md5 && meta.version === 3) {
    console.log(`${path.basename(out)} déjà à jour : ${meta.counts.nodes} nœuds étiquetés, ${meta.counts.ways} chemins, ${meta.counts.relations} relations`);
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
  version: 3,
  source: mirror.url, mirror: mirror.key,
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
