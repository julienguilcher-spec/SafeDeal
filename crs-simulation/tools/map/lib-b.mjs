// lib-b.mjs — utilitaires communs des scripts fetch-b-* (couches de détail de la carte :
// arbres, mobilier, commerces, feux, métro, monuments, relief).
// Zéro dépendance : Node 22 + curl (curl traverse le proxy tel quel, contrairement au fetch intégré de Node).
// Ce fichier est indépendant de lib-a.mjs (lot A) : aucun import croisé.
//
// Contenu :
//   1. constantes (emprise, origine, projection locale)
//   2. téléchargement poli avec cache disque (1 requête/s par hôte, reprises avec attente croissante)
//   3. lecteur OSM PBF minimal (protobuf + zlib)
//   4. géométrie plane (aire, centre, point dans polygone, distance) et index spatial en grille
//   5. lecture / écriture GeoJSON (un objet par ligne)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);

// ───────────────────────────── 1. Constantes ─────────────────────────────

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RAW = path.join(HERE, 'raw');
/** Cache propre au lot B (réponses brutes des serveurs). */
export const RAW_B = path.join(RAW, 'b');
/**
 * Couches normalisées. Pour les essais, CRS_MAP_NORM redirige les sorties vers un autre dossier (les couches du lot A
 * y sont alors absentes : les scripts doivent s'en passer).
 */
export const TEST_OUT = process.env.CRS_MAP_NORM || null;
export const NORM = TEST_OUT || path.join(RAW, 'normalized');
/** Essais : hôtes déclarés en panne (liste séparée par des virgules) — aucune requête ne leur est envoyée, même en cache. */
const FAIL_HOSTS = new Set((process.env.CRS_MAP_FAIL_HOSTS || '').split(',').filter(Boolean));
/** Dossier des comptes rendus (état des scripts, contrôle). */
export const STATUS_DIR = TEST_OUT ? path.join(TEST_OUT, '_etat-b') : path.join(RAW_B, 'status');
export const USER_AGENT = 'crs-sim-mapbuilder/0.1';

/** Emprise du jeu (WGS84). */
export const BBOX = { west: 2.2850, east: 2.3725, south: 48.8500, north: 48.8780 };
/** Origine du monde : obélisque de la Concorde. */
export const LAT0 = 48.865633;
export const LON0 = 2.321236;
export const MX = 73305; // mètres par degré de longitude à cette latitude
export const MZ = 111214; // mètres par degré de latitude

/** Emprise élargie de `m` mètres. */
export function bboxWithMargin(m) {
  return { west: BBOX.west - m / MX, east: BBOX.east + m / MX, south: BBOX.south - m / MZ, north: BBOX.north + m / MZ };
}
/** Marge (m) des couches ponctuelles : même valeur que le lot A (les objets à cheval sur le bord sont conservés). */
export const MARGIN_M = 60;
export const BBOX_M = bboxWithMargin(MARGIN_M);
export const inBox = (lon, lat, b = BBOX_M) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;

/** WGS84 → mètres locaux du jeu (x est, z sud). */
export const toX = (lon) => (lon - LON0) * MX;
export const toZ = (lat) => -(lat - LAT0) * MZ;
/** Mètres locaux « y vers le nord » (repère direct, pratique pour la géométrie). */
export const toM = ([lon, lat]) => [(lon - LON0) * MX, (lat - LAT0) * MZ];
export const fromM = ([x, y]) => [round7(x / MX + LON0), round7(y / MZ + LAT0)];
export const round7 = (v) => Math.round(v * 1e7) / 1e7;
export const round1 = (v) => Math.round(v * 10) / 10;
export const round2 = (v) => Math.round(v * 100) / 100;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const FORCE = process.argv.includes('--force');

// ───────────────────────── 2. Téléchargement avec cache ─────────────────────────

const lastHit = new Map(); // hôte → horodatage de la dernière requête
const hostFailures = new Map(); // hôte → nombre d'échecs consécutifs
/** Journal des requêtes réellement émises pendant ce processus (hôte → nombre). */
export const requestLog = new Map();

async function throttle(host) {
  const wait = (lastHit.get(host) || 0) + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

export class HostDownError extends Error {}

/**
 * Télécharge `url` vers `dest` si le fichier n'existe pas déjà (cache disque systématique).
 * - params : paramètres de requête (encodés par curl ; GET, ou corps de formulaire si method = 'POST')
 * - jsonBody : corps JSON (POST application/json)
 * - validate(tampon) : renvoie null si la réponse est correcte, sinon un message (la réponse est alors rejetée)
 * Politesse : 1 requête par seconde et par hôte, reprises avec attente croissante (2 s puis 8 s). Après 3 échecs
 * consécutifs sur un même hôte, celui-ci est abandonné pour le reste du processus (HostDownError) : à l'appelant
 * de changer de source.
 * Renvoie { path, cached }.
 */
export async function download(url, dest, { params = null, jsonBody = null, method = 'GET', validate = null, force = FORCE, timeoutS = 300 } = {}) {
  const host = new URL(url).host;
  if (FAIL_HOSTS.has(host)) throw new HostDownError(`hôte ${host} déclaré en panne (CRS_MAP_FAIL_HOSTS)`);
  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) return { path: dest, cached: true };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  let lastErr = null;
  for (;;) {
    const failures = hostFailures.get(host) || 0;
    if (failures >= 3) throw new HostDownError(`hôte ${host} abandonné après 3 échecs consécutifs (${lastErr?.message || 'échecs précédents'}) : changer de source`);
    if (failures > 0 && lastErr) await sleep(2000 * failures * failures); // 2 s, puis 8 s
    await throttle(host);
    requestLog.set(host, (requestLog.get(host) || 0) + 1);
    const args = ['-sS', '--compressed', '-L', '-A', USER_AGENT, '-m', String(timeoutS), '-o', tmp, '-w', '%{http_code}'];
    if (jsonBody != null) {
      const bodyFile = dest + '.body';
      fs.writeFileSync(bodyFile, JSON.stringify(jsonBody));
      args.push('-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', '@' + bodyFile);
    } else if (params) {
      if (method === 'GET') args.push('-G');
      for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
    }
    args.push(url);
    try {
      const { stdout } = await execFileP('curl', args, { maxBuffer: 1 << 20 });
      const code = Number(stdout.trim().slice(-3));
      if (code !== 200) throw new Error(`HTTP ${code} ${fs.existsSync(tmp) ? fs.readFileSync(tmp).subarray(0, 160).toString('utf8') : ''}`);
      if (validate) {
        const msg = validate(fs.readFileSync(tmp));
        if (msg) throw new Error(`réponse invalide : ${msg}`);
      }
      fs.renameSync(tmp, dest);
      fs.rmSync(dest + '.body', { force: true });
      hostFailures.set(host, 0);
      return { path: dest, cached: false };
    } catch (e) {
      lastErr = e;
      fs.rmSync(tmp, { force: true });
      fs.rmSync(dest + '.body', { force: true });
      hostFailures.set(host, failures + 1);
      console.error(`  ! ${host} échec ${failures + 1}/3 : ${String(e.message || e).replace(/\s+/g, ' ').slice(0, 220)}`);
    }
  }
}

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/**
 * Enregistre l'état d'un script : `degraded` liste les sources qui n'ont pas répondu et le repli employé. Le contrôle
 * (fetch-b-8-check.mjs) refuse une couche produite en mode dégradé.
 */
export function writeStatus(script, degraded = []) {
  fs.mkdirSync(STATUS_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATUS_DIR, script + '.json'), JSON.stringify({ script, at: new Date().toISOString(), degraded }, null, 1));
  if (degraded.length) console.error(`${script} : MODE DÉGRADÉ — ${degraded.join(' ; ')}`);
}
/** Exécute `fn` ; si l'hôte est en panne (HostDownError), note le repli dans `degraded` et renvoie `fallback`. */
export async function orDegraded(degraded, what, fn, fallback = null) {
  try { return await fn(); } catch (e) {
    if (!(e instanceof HostDownError)) throw e;
    degraded.push(`${what} (${String(e.message).slice(0, 90)})`);
    return fallback;
  }
}
/** Valide qu'un tampon est du JSON ; `check(objet)` peut renvoyer un message d'erreur. */
export const jsonValidator = (check = null) => (buf) => {
  let j;
  try { j = JSON.parse(buf.toString('utf8')); } catch (e) { return 'JSON illisible : ' + buf.subarray(0, 120).toString('utf8'); }
  return check ? check(j) : null;
};

/**
 * Export d'un jeu de données d'un portail Opendatasoft (API Explore v2.1) en JSON (tableau d'enregistrements).
 * `where` et `select` sont en ODSQL. Une seule requête par jeu ; mise en cache dans `dest`.
 */
export async function odsExport(portal, dataset, dest, { where = null, select = null } = {}) {
  const params = { timezone: 'UTC' };
  if (where) params.where = where;
  if (select) params.select = select;
  const r = await download(`https://${portal}/api/explore/v2.1/catalog/datasets/${dataset}/exports/json`, dest, {
    params,
    validate: jsonValidator((j) => (Array.isArray(j) ? null : 'tableau attendu : ' + JSON.stringify(j).slice(0, 160))),
  });
  return { ...r, records: readJson(dest) };
}
/** Métadonnées d'un jeu Opendatasoft (titre, licence, date de mise à jour, producteur). */
export async function odsMeta(portal, dataset, dest) {
  await download(`https://${portal}/api/explore/v2.1/catalog/datasets/${dataset}`, dest, { validate: jsonValidator((j) => (j.dataset_id ? null : 'métadonnées inattendues')) });
  const j = readJson(dest);
  const d = j.metas?.default || {};
  return { id: j.dataset_id, title: d.title, license: d.license, publisher: d.publisher, modified: (d.modified || '').slice(0, 10), records: d.records_count };
}
/** Clause ODSQL « dans l'emprise » pour un champ point. */
export const odsInBox = (field, b = BBOX_M) => `in_bbox(${field}, ${b.south.toFixed(6)}, ${b.west.toFixed(6)}, ${b.north.toFixed(6)}, ${b.east.toFixed(6)})`;

// ───────────────────────────── 3. Lecteur OSM PBF ─────────────────────────────
// Format : suite de [longueur BE sur 4 octets][BlobHeader][Blob] ; Blob.zlib_data → HeaderBlock / PrimitiveBlock.

class Pb {
  constructor(buf, pos = 0, end = buf.length) { this.b = buf; this.p = pos; this.e = end; }
  more() { return this.p < this.e; }
  /** varint non signé (jusqu'à 2^53) */
  v() {
    const b = this.b;
    let x = 0, mul = 1, c;
    do { c = b[this.p++]; x += (c & 0x7f) * mul; mul *= 128; } while (c >= 128);
    return x;
  }
  /** varint zigzag (sint64) — exact jusqu'à 2^53 */
  s() { const x = this.v(); return x % 2 === 0 ? x / 2 : -(x + 1) / 2; }
  /** saute un champ de type filaire `wt` */
  skip(wt) {
    if (wt === 0) this.v();
    else if (wt === 1) this.p += 8;
    else if (wt === 2) { const n = this.v(); this.p += n; }
    else if (wt === 5) this.p += 4;
    else throw new Error('protobuf : type filaire ' + wt);
  }
  /** sous-lecteur d'un champ « longueur + octets » */
  sub() { const n = this.v(); const r = new Pb(this.b, this.p, this.p + n); this.p += n; return r; }
  bytes() { const n = this.v(); const r = this.b.subarray(this.p, this.p + n); this.p += n; return r; }
}

/**
 * Parcourt un fichier .osm.pbf. Rappels : onNode(id, lon, lat, tags|null), onWay(id, refs[], tags), onRelation(id, members[], tags)
 * avec members = [{ type: 'n'|'w'|'r', ref, role }]. Les objets arrivent dans l'ordre du fichier (nœuds, chemins, relations).
 */
export function readPbf(file, { onNode = null, onWay = null, onRelation = null } = {}) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const head = Buffer.alloc(4);
  let off = 0;
  try {
    while (off < size) {
      fs.readSync(fd, head, 0, 4, off); off += 4;
      const hlen = head.readUInt32BE(0);
      const hbuf = Buffer.alloc(hlen);
      fs.readSync(fd, hbuf, 0, hlen, off); off += hlen;
      let type = '', dsize = 0;
      const h = new Pb(hbuf);
      while (h.more()) {
        const key = h.v(), f = key >>> 3, wt = key & 7;
        if (f === 1) type = h.bytes().toString('utf8');
        else if (f === 3) dsize = h.v();
        else h.skip(wt);
      }
      const bbuf = Buffer.alloc(dsize);
      fs.readSync(fd, bbuf, 0, dsize, off); off += dsize;
      if (type !== 'OSMData') continue;
      let raw = null;
      const bl = new Pb(bbuf);
      while (bl.more()) {
        const key = bl.v(), f = key >>> 3, wt = key & 7;
        if (f === 1) raw = bl.bytes();
        else if (f === 3) raw = zlib.inflateSync(bl.bytes());
        else bl.skip(wt);
      }
      if (!raw) throw new Error('bloc PBF : compression non gérée');
      primitiveBlock(raw, onNode, onWay, onRelation);
    }
  } finally { fs.closeSync(fd); }
}

function primitiveBlock(buf, onNode, onWay, onRelation) {
  const r = new Pb(buf);
  const strings = [];
  const groups = [];
  let gran = 100, latOff = 0, lonOff = 0;
  while (r.more()) {
    const key = r.v(), f = key >>> 3, wt = key & 7;
    if (f === 1) { const st = r.sub(); while (st.more()) { const k = st.v(); if (k >>> 3 === 1) strings.push(st.bytes().toString('utf8')); else st.skip(k & 7); } }
    else if (f === 2) groups.push(r.sub());
    else if (f === 17) gran = r.v();
    else if (f === 19) latOff = r.v();
    else if (f === 20) lonOff = r.v();
    else r.skip(wt);
  }
  const scale = gran * 1e-9;
  for (const g of groups) {
    while (g.more()) {
      const key = g.v(), f = key >>> 3, wt = key & 7;
      if (f === 2) { // DenseNodes
        const d = g.sub();
        let ids = null, lats = null, lons = null, kv = null;
        while (d.more()) {
          const k = d.v(), ff = k >>> 3;
          if (ff === 1) ids = d.sub(); else if (ff === 8) lats = d.sub(); else if (ff === 9) lons = d.sub(); else if (ff === 10) kv = d.sub(); else d.skip(k & 7);
        }
        if (!onNode || !ids) continue;
        let id = 0, la = 0, lo = 0;
        while (ids.more()) {
          id += ids.s(); la += lats.s(); lo += lons.s();
          let tags = null;
          if (kv && kv.more()) {
            for (;;) { const ks = kv.v(); if (ks === 0) break; const vs = kv.v(); (tags ||= {})[strings[ks]] = strings[vs]; }
          }
          onNode(id, (lonOff + lo * gran) * 1e-9, (latOff + la * gran) * 1e-9, tags);
        }
      } else if (f === 1) { // Node (non dense)
        const n = g.sub();
        let id = 0, la = 0, lo = 0; const ks = [], vs = [];
        while (n.more()) {
          const k = n.v(), ff = k >>> 3;
          if (ff === 1) id = n.s(); else if (ff === 2) { const p = n.sub(); while (p.more()) ks.push(p.v()); } else if (ff === 3) { const p = n.sub(); while (p.more()) vs.push(p.v()); }
          else if (ff === 8) la = n.s(); else if (ff === 9) lo = n.s(); else n.skip(k & 7);
        }
        if (onNode) { let tags = null; for (let i = 0; i < ks.length; i++) (tags ||= {})[strings[ks[i]]] = strings[vs[i]]; onNode(id, lonOff * 1e-9 + lo * scale, latOff * 1e-9 + la * scale, tags); }
      } else if (f === 3) { // Way
        if (!onWay) { g.skip(wt); continue; }
        const w = g.sub();
        let id = 0; const tags = {}; const ks = [], vs = [], refs = [];
        while (w.more()) {
          const k = w.v(), ff = k >>> 3;
          if (ff === 1) id = w.v();
          else if (ff === 2) { const p = w.sub(); while (p.more()) ks.push(p.v()); }
          else if (ff === 3) { const p = w.sub(); while (p.more()) vs.push(p.v()); }
          else if (ff === 8) { const p = w.sub(); let ref = 0; while (p.more()) { ref += p.s(); refs.push(ref); } }
          else w.skip(k & 7);
        }
        for (let i = 0; i < ks.length; i++) tags[strings[ks[i]]] = strings[vs[i]];
        onWay(id, refs, tags);
      } else if (f === 4) { // Relation
        if (!onRelation) { g.skip(wt); continue; }
        const rl = g.sub();
        let id = 0; const tags = {}; const ks = [], vs = [], roles = [], mem = [], types = [];
        while (rl.more()) {
          const k = rl.v(), ff = k >>> 3;
          if (ff === 1) id = rl.v();
          else if (ff === 2) { const p = rl.sub(); while (p.more()) ks.push(p.v()); }
          else if (ff === 3) { const p = rl.sub(); while (p.more()) vs.push(p.v()); }
          else if (ff === 8) { const p = rl.sub(); while (p.more()) roles.push(p.v()); }
          else if (ff === 9) { const p = rl.sub(); let ref = 0; while (p.more()) { ref += p.s(); mem.push(ref); } }
          else if (ff === 10) { const p = rl.sub(); while (p.more()) types.push(p.v()); }
          else rl.skip(k & 7);
        }
        for (let i = 0; i < ks.length; i++) tags[strings[ks[i]]] = strings[vs[i]];
        const members = mem.map((ref, i) => ({ type: 'nwr'[types[i]], ref, role: strings[roles[i]] || '' }));
        onRelation(id, members, tags);
      } else g.skip(wt);
    }
  }
}

// ───────────────────────────── 4. Géométrie ─────────────────────────────
// Les anneaux sont des tableaux de [x, y] en mètres (repère direct, y vers le nord) ou de [lon, lat] selon le contexte.

/** Aire signée d'un anneau (positive si antihoraire dans un repère direct). */
export function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}
/** Centre de gravité d'un anneau (repli sur la moyenne des sommets si l'aire est nulle). */
export function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0, sy = 0; for (const p of ring) { sx += p[0]; sy += p[1]; }
    return [sx / ring.length, sy / ring.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Polygone = [extérieur, trou, trou…]. */
export function pointInPolygon(x, y, poly) {
  if (!pointInRing(x, y, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(x, y, poly[i])) return false;
  return true;
}
export function ringBBox(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
/** Distance d'un point à un segment. */
export function distPointSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Distance d'un point au bord d'un anneau. */
export function distPointRing(px, py, ring) {
  let d = Infinity;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) d = Math.min(d, distPointSeg(px, py, ring[j][0], ring[j][1], ring[i][0], ring[i][1]));
  return d;
}
/** Ferme, dédoublonne et oriente un anneau (extérieur antihoraire si ccw = true). Renvoie null s'il est dégénéré. */
export function cleanRing(ring, ccw = true) {
  const out = [];
  for (const p of ring) { const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); }
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  if (out.length < 3) return null;
  const a = ringArea(out);
  if (Math.abs(a) < 1e-12) return null;
  if ((a > 0) !== ccw) out.reverse();
  out.push(out[0]);
  return out;
}
/** Assemble des chemins (listes de sommets) en anneaux fermés en les raccordant par leurs extrémités. */
export function assembleRings(ways) {
  const rings = [];
  const open = [];
  const key = (p) => p[0] + ',' + p[1];
  for (const w of ways) {
    if (w.length < 2) continue;
    if (key(w[0]) === key(w[w.length - 1])) { if (w.length >= 4) rings.push(w.slice()); } else open.push(w.slice());
  }
  while (open.length) {
    let cur = open.pop();
    let grown = true;
    while (grown && key(cur[0]) !== key(cur[cur.length - 1])) {
      grown = false;
      for (let i = 0; i < open.length; i++) {
        const w = open[i];
        const ce = key(cur[cur.length - 1]), cs = key(cur[0]);
        if (key(w[0]) === ce) cur = cur.concat(w.slice(1));
        else if (key(w[w.length - 1]) === ce) cur = cur.concat(w.slice(0, -1).reverse());
        else if (key(w[w.length - 1]) === cs) cur = w.slice(0, -1).concat(cur);
        else if (key(w[0]) === cs) cur = w.slice(1).reverse().concat(cur);
        else continue;
        open.splice(i, 1); grown = true; break;
      }
    }
    if (key(cur[0]) === key(cur[cur.length - 1]) && cur.length >= 4) rings.push(cur);
  }
  return rings;
}

/** Index spatial en grille pour des points en mètres. */
export class PointGrid {
  constructor(cell = 8) { this.cell = cell; this.m = new Map(); this.size = 0; }
  _k(cx, cy) { return cx * 100003 + cy; }
  add(x, y, data) {
    const k = this._k(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let a = this.m.get(k); if (!a) this.m.set(k, (a = []));
    a.push({ x, y, data }); this.size++;
  }
  /** Plus proche point à moins de `r` (et vérifiant `filter` s'il est fourni), ou null. */
  nearest(x, y, r, filter = null) {
    const c = this.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    let best = null, bd = r;
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const a = this.m.get(this._k(cx, cy)); if (!a) continue;
      for (const p of a) { const d = Math.hypot(p.x - x, p.y - y); if (d <= bd && (!filter || filter(p.data))) { bd = d; best = p; } }
    }
    return best ? { ...best, d: bd } : null;
  }
  /** Tous les points à moins de `r`. */
  within(x, y, r) {
    const c = this.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    const out = [];
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const a = this.m.get(this._k(cx, cy)); if (!a) continue;
      for (const p of a) if (Math.hypot(p.x - x, p.y - y) <= r) out.push(p);
    }
    return out;
  }
}

// ───────────────────────────── 5. GeoJSON ─────────────────────────────

/** Écrit une FeatureCollection, un objet par ligne (lisible ligne à ligne, diff propre). Renvoie la taille en octets. */
export function writeGeoJSON(file, features, meta = null) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, '{"type":"FeatureCollection",' + (meta ? '"meta":' + JSON.stringify(meta) + ',' : '') + '"features":[\n');
  const CH = 2000;
  for (let i = 0; i < features.length; i += CH) {
    const part = features.slice(i, i + CH).map((f) => JSON.stringify(f)).join(',\n');
    fs.writeSync(fd, part + (i + CH < features.length ? ',\n' : '\n'));
  }
  fs.writeSync(fd, ']}\n');
  fs.closeSync(fd);
  fs.renameSync(tmp, file);
  return fs.statSync(file).size;
}
export const pointFeature = (lon, lat, properties) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [round7(lon), round7(lat)] } });
export const readFeatures = (file) => readJson(file).features;

/**
 * Enseignes susceptibles d'apparaître dans un nom d'arrêt ou de sortie de métro (liste explicite, au mieux) :
 * le jeu ne doit contenir aucune marque commerciale.
 */
export const BRAND_RE = /galeries? lafayette|\bprintemps\b|\bbhv\b|bazar de l.h[oô]tel de ville|bon march[eé]|samaritaine|louis vuitton|monoprix|\bfnac\b|drugstore|gr[eé]vin/i;
/** Nom d'arrêt, de station de vélos ou de sortie : parenthèses retirées (elles citent souvent un magasin), null si le reste cite une enseigne. */
export function publicName(s) {
  if (!s) return null;
  const t = String(s).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return !t || BRAND_RE.test(t) ? null : t;
}

/** Compte les valeurs d'une clé (pour les comptes rendus). */
export function tally(items, fn) {
  const m = new Map();
  for (const it of items) { const k = fn(it); m.set(k, (m.get(k) || 0) + 1); }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
}
