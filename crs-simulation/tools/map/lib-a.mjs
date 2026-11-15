// lib-a.mjs — utilitaires communs des scripts fetch-a-* (couches structurelles de la carte).
// Zéro dépendance : Node 22 + curl (curl traverse le proxy tel quel, contrairement au fetch intégré de Node).
//
// Contenu :
//   1. constantes (emprise, origine, projection locale)
//   2. téléchargement poli avec cache disque (1 requête/s par hôte, reprises avec attente croissante)
//   3. lecteur OSM PBF minimal (protobuf + zlib), sans dépendance
//   4. géométrie plane (aires, point dans polygone, découpage, assemblage de multipolygones, index spatial)
//   5. écriture GeoJSON en flux

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
export const NORM = path.join(RAW, 'normalized');
export const USER_AGENT = 'crs-sim-mapbuilder/0.1';

/** Emprise du jeu (WGS84). */
export const BBOX = { west: 2.2850, east: 2.3725, south: 48.8500, north: 48.8780 };
/** Origine du monde : obélisque de la Concorde. */
export const LAT0 = 48.865633;
export const LON0 = 2.321236;
export const MX = 73305; // mètres par degré de longitude à cette latitude
export const MZ = 111214; // mètres par degré de latitude

/** Marge (m) autour de l'emprise : les objets qui la touchent sont conservés, les lignes et grandes surfaces y sont découpées. */
export const MARGIN_M = 60;
export const BBOX_M = {
  west: BBOX.west - MARGIN_M / MX,
  east: BBOX.east + MARGIN_M / MX,
  south: BBOX.south - MARGIN_M / MZ,
  north: BBOX.north + MARGIN_M / MZ,
};

/** WGS84 → mètres locaux (x est, z sud). */
export const toX = (lon) => (lon - LON0) * MX;
export const toZ = (lat) => -(lat - LAT0) * MZ;
/** Mètres locaux « y vers le nord » (pratique pour la géométrie : repère direct). */
export const toM = ([lon, lat]) => [(lon - LON0) * MX, (lat - LAT0) * MZ];
export const fromM = ([x, y]) => [round7(x / MX + LON0), round7(y / MZ + LAT0)];
export const round7 = (v) => Math.round(v * 1e7) / 1e7;
export const round1 = (v) => Math.round(v * 10) / 10;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── 2. Téléchargement avec cache ─────────────────────────

const lastHit = new Map(); // hôte → horodatage de la dernière requête
const hostFailures = new Map(); // hôte → nombre d'échecs consécutifs

async function throttle(host) {
  const now = Date.now();
  const wait = (lastHit.get(host) || 0) + 1100 - now;
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

/**
 * Télécharge `url` vers `dest` si le fichier n'existe pas déjà (cache disque systématique).
 * - params : paramètres de requête (encodés par curl, méthode GET)
 * - validate(tampon) : renvoie null si la réponse est correcte, sinon un message (la réponse est alors rejetée)
 * - force : ignore le cache
 * Renvoie { path, cached }.
 */
export async function download(url, dest, { params = null, validate = null, force = false, timeoutS = 300, tries = 3 } = {}) {
  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) return { path: dest, cached: true };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const host = new URL(url).host;
  if ((hostFailures.get(host) || 0) >= 3) throw new Error(`hôte ${host} abandonné après 3 échecs : changer de source`);
  const tmp = dest + '.part';
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    await throttle(host);
    const args = ['-sS', '--compressed', '-L', '-A', USER_AGENT, '-m', String(timeoutS), '-o', tmp, '-w', '%{http_code}'];
    if (params) {
      args.push('-G');
      for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
    }
    args.push(url);
    try {
      const { stdout } = await execFileP('curl', args, { maxBuffer: 1 << 20 });
      const code = Number(stdout.trim().slice(-3));
      if (code !== 200) throw new Error(`HTTP ${code}`);
      if (validate) {
        const msg = validate(fs.readFileSync(tmp));
        if (msg) throw new Error(`réponse invalide : ${msg}`);
      }
      fs.renameSync(tmp, dest);
      hostFailures.set(host, 0);
      return { path: dest, cached: false };
    } catch (e) {
      lastErr = e;
      fs.rmSync(tmp, { force: true });
      console.error(`  ! ${host} tentative ${attempt}/${tries} : ${String(e.message || e).slice(0, 200)}`);
      if (attempt < tries) await sleep(2000 * attempt * attempt); // 2 s, 8 s
    }
  }
  hostFailures.set(host, (hostFailures.get(host) || 0) + 1);
  throw new Error(`échec du téléchargement ${url} : ${lastErr?.message || lastErr}`);
}

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// ───────────────────────────── 3. Lecteur OSM PBF ─────────────────────────────
// Format : suite de [longueur BE sur 4 octets][BlobHeader][Blob] ; Blob.zlib_data → HeaderBlock / PrimitiveBlock.

class PbReader {
  constructor(buf, pos = 0, end = buf.length) {
    this.buf = buf;
    this.pos = pos;
    this.end = end;
  }
  /** varint non signé (jusqu'à 2^53 exact — suffisant pour les identifiants OSM). */
  varint() {
    const b = this.buf;
    let p = this.pos;
    let byte = b[p++];
    let result = byte & 0x7f;
    if (byte < 0x80) { this.pos = p; return result; }
    let mul = 128;
    for (;;) {
      byte = b[p++];
      result += (byte & 0x7f) * mul;
      if (byte < 0x80) break;
      mul *= 128;
    }
    this.pos = p;
    return result;
  }
  /** varint signé (zigzag). */
  svarint() {
    const n = this.varint();
    return n % 2 === 1 ? -(n + 1) / 2 : n / 2;
  }
  /** Lit une clé de champ ; renvoie [numéro, type de fil]. */
  tag() {
    const t = this.varint();
    return [Math.floor(t / 8), t & 7];
  }
  /** Sous-lecteur pour un champ « longueur délimitée ». */
  sub() {
    const len = this.varint();
    const r = new PbReader(this.buf, this.pos, this.pos + len);
    this.pos += len;
    return r;
  }
  bytes() {
    const len = this.varint();
    const s = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return s;
  }
  skip(wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) { const len = this.varint(); this.pos += len; } // lire la longueur avant de déplacer le curseur
    else if (wire === 5) this.pos += 4;
    else throw new Error(`type de fil protobuf inconnu ${wire}`);
  }
  get done() { return this.pos >= this.end; }
}

function packedVarints(r, signed, out = []) {
  const s = r.sub();
  if (signed) while (!s.done) out.push(s.svarint());
  else while (!s.done) out.push(s.varint());
  return out;
}

/** Itère les blobs décompressés d'un fichier .osm.pbf : { type: 'OSMHeader'|'OSMData', data: Buffer }. */
export function* pbfBlobs(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const lenBuf = Buffer.alloc(4);
    let off = 0;
    while (off < size) {
      fs.readSync(fd, lenBuf, 0, 4, off); off += 4;
      const hlen = lenBuf.readUInt32BE(0);
      const hbuf = Buffer.alloc(hlen);
      fs.readSync(fd, hbuf, 0, hlen, off); off += hlen;
      let type = '', datasize = 0;
      const hr = new PbReader(hbuf);
      while (!hr.done) {
        const [f, w] = hr.tag();
        if (f === 1) type = hr.bytes().toString('utf8');
        else if (f === 3) datasize = hr.varint();
        else hr.skip(w);
      }
      const bbuf = Buffer.alloc(datasize);
      fs.readSync(fd, bbuf, 0, datasize, off); off += datasize;
      let data = null;
      const br = new PbReader(bbuf);
      while (!br.done) {
        const [f, w] = br.tag();
        if (f === 1) data = Buffer.from(br.bytes());
        else if (f === 3) data = zlib.inflateSync(br.bytes());
        else if (f === 4 || f === 6 || f === 7) throw new Error('compression PBF non gérée (lzma/lz4/zstd)');
        else br.skip(w);
      }
      yield { type, data };
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Décode un PrimitiveBlock et appelle les rappels fournis.
 *   onNode(id, lon1e7, lat1e7, tagsOuNull)   — tags : objet {clé: valeur} seulement si le nœud en porte
 *   onWay(id, tags, refs)
 *   onRelation(id, tags, members[{type:'n'|'w'|'r', ref, role}])
 * `want` = { nodes, ways, relations } permet de sauter le décodage des groupes inutiles.
 */
export function decodePrimitiveBlock(data, { onNode, onWay, onRelation }) {
  const r = new PbReader(data);
  const strings = [];
  const groups = [];
  let granularity = 100, latOffset = 0, lonOffset = 0;
  while (!r.done) {
    const [f, w] = r.tag();
    if (f === 1) {
      const st = r.sub();
      while (!st.done) {
        const [sf, sw] = st.tag();
        if (sf === 1) strings.push(st.bytes().toString('utf8'));
        else st.skip(sw);
      }
    } else if (f === 2) groups.push(r.sub());
    else if (f === 17) granularity = r.varint();
    else if (f === 19) latOffset = r.varint();
    else if (f === 20) lonOffset = r.varint();
    else r.skip(w);
  }
  const scale = granularity / 100; // → unités de 1e-7 degré
  const toE7 = (v, off) => Math.round(v * scale + off / 100);
  const tagsOf = (keys, vals) => {
    const t = {};
    for (let i = 0; i < keys.length; i++) t[strings[keys[i]]] = strings[vals[i]];
    return t;
  };
  for (const g of groups) {
    while (!g.done) {
      const [f, w] = g.tag();
      if (f === 2 && onNode) {
        // DenseNodes
        const d = g.sub();
        let ids = null, lats = null, lons = null, kv = null;
        while (!d.done) {
          const [df, dw] = d.tag();
          if (df === 1) ids = packedVarints(d, true);
          else if (df === 8) lats = packedVarints(d, true);
          else if (df === 9) lons = packedVarints(d, true);
          else if (df === 10) kv = packedVarints(d, false);
          else d.skip(dw);
        }
        let id = 0, lat = 0, lon = 0, k = 0;
        for (let i = 0; i < ids.length; i++) {
          id += ids[i]; lat += lats[i]; lon += lons[i];
          let tags = null;
          if (kv && kv.length) {
            while (kv[k] !== 0 && k < kv.length) {
              (tags ??= {})[strings[kv[k]]] = strings[kv[k + 1]];
              k += 2;
            }
            k++;
          }
          onNode(id, toE7(lon, lonOffset), toE7(lat, latOffset), tags);
        }
      } else if (f === 1 && onNode) {
        // Node non dense (rare)
        const n = g.sub();
        let id = 0, lat = 0, lon = 0; const keys = [], vals = [];
        while (!n.done) {
          const [nf, nw] = n.tag();
          if (nf === 1) id = n.svarint();
          else if (nf === 2) packedVarints(n, false, keys);
          else if (nf === 3) packedVarints(n, false, vals);
          else if (nf === 8) lat = n.svarint();
          else if (nf === 9) lon = n.svarint();
          else n.skip(nw);
        }
        onNode(id, toE7(lon, lonOffset), toE7(lat, latOffset), keys.length ? tagsOf(keys, vals) : null);
      } else if (f === 3 && onWay) {
        const wy = g.sub();
        let id = 0; const keys = [], vals = [], refs = [];
        while (!wy.done) {
          const [wf, ww] = wy.tag();
          if (wf === 1) id = wy.varint();
          else if (wf === 2) packedVarints(wy, false, keys);
          else if (wf === 3) packedVarints(wy, false, vals);
          else if (wf === 8) packedVarints(wy, true, refs);
          else wy.skip(ww);
        }
        let acc = 0;
        for (let i = 0; i < refs.length; i++) { acc += refs[i]; refs[i] = acc; }
        onWay(id, tagsOf(keys, vals), refs);
      } else if (f === 4 && onRelation) {
        const rl = g.sub();
        let id = 0; const keys = [], vals = [], roles = [], memids = [], types = [];
        while (!rl.done) {
          const [rf, rw] = rl.tag();
          if (rf === 1) id = rl.varint();
          else if (rf === 2) packedVarints(rl, false, keys);
          else if (rf === 3) packedVarints(rl, false, vals);
          else if (rf === 8) packedVarints(rl, false, roles);
          else if (rf === 9) packedVarints(rl, true, memids);
          else if (rf === 10) packedVarints(rl, false, types);
          else rl.skip(rw);
        }
        const members = [];
        let acc = 0;
        for (let i = 0; i < memids.length; i++) {
          acc += memids[i];
          members.push({ type: 'nwr'[types[i]], ref: acc, role: strings[roles[i]] });
        }
        onRelation(id, tagsOf(keys, vals), members);
      } else g.skip(w);
    }
  }
}

// ───────────────────────────── 4. Géométrie plane ─────────────────────────────
// Les anneaux sont des tableaux de [lon, lat] ; les calculs métriques passent par toM() (x est, y nord).

/** Aire signée d'un anneau en m² (positive si l'anneau tourne dans le sens trigonométrique, y vers le nord). */
export function ringAreaM(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x1 = (ring[j][0] - LON0) * MX, y1 = (ring[j][1] - LAT0) * MZ;
    const x2 = (ring[i][0] - LON0) * MX, y2 = (ring[i][1] - LAT0) * MZ;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
/** Aire d'un polygone [extérieur, trous…] en m². */
export function polygonAreaM(poly) {
  let a = Math.abs(ringAreaM(poly[0]));
  for (let i = 1; i < poly.length; i++) a -= Math.abs(ringAreaM(poly[i]));
  return a;
}
/** Longueur d'une ligne en m. */
export function lineLengthM(line) {
  let d = 0;
  for (let i = 1; i < line.length; i++) d += Math.hypot((line[i][0] - line[i - 1][0]) * MX, (line[i][1] - line[i - 1][1]) * MZ);
  return d;
}
/** Boîte englobante [ouest, sud, est, nord] d'une liste de points. */
export function bboxOf(coords, out = [Infinity, Infinity, -Infinity, -Infinity]) {
  for (const c of coords) {
    if (c[0] < out[0]) out[0] = c[0];
    if (c[1] < out[1]) out[1] = c[1];
    if (c[0] > out[2]) out[2] = c[0];
    if (c[1] > out[3]) out[3] = c[1];
  }
  return out;
}
export const bboxIntersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export const RECT = [BBOX.west, BBOX.south, BBOX.east, BBOX.north];
export const RECT_M = [BBOX_M.west, BBOX_M.south, BBOX_M.east, BBOX_M.north];

export function pointInRing(pt, ring) {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInPolygon(pt, poly) {
  if (!pointInRing(pt, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(pt, poly[i])) return false;
  return true;
}
/** Centroïde (surfacique) d'un anneau. */
export function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  const x0 = ring[0][0], y0 = ring[0][1]; // décalage pour la précision numérique
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x1 = ring[j][0] - x0, y1 = ring[j][1] - y0, x2 = ring[i][0] - x0, y2 = ring[i][1] - y0;
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-18) return [x0, y0];
  return [cx / (3 * a) + x0, cy / (3 * a) + y0];
}
/** Point garanti à l'intérieur du polygone (centroïde si possible, sinon milieu du plus long segment intérieur d'une ligne de balayage). */
export function interiorPoint(poly) {
  const c = ringCentroid(poly[0]);
  if (pointInPolygon(c, poly)) return c;
  const bb = bboxOf(poly[0]);
  let best = null, bestLen = -1;
  for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const y = bb[1] + (bb[3] - bb[1]) * t;
    const xs = [];
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i][1], yj = ring[j][1];
        if ((yi > y) !== (yj > y)) xs.push(((ring[j][0] - ring[i][0]) * (y - yi)) / (yj - yi) + ring[i][0]);
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1] - xs[k] > bestLen) { bestLen = xs[k + 1] - xs[k]; best = [(xs[k] + xs[k + 1]) / 2, y]; }
    }
    if (best && t === 0.5) break;
  }
  return best || c;
}

/** Ferme un anneau (premier point répété à la fin) et retire les points consécutifs identiques. */
export function cleanRing(ring) {
  const out = [];
  for (const p of ring) {
    const q = [round7(p[0]), round7(p[1])];
    if (!out.length || out[out.length - 1][0] !== q[0] || out[out.length - 1][1] !== q[1]) out.push(q);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([out[0][0], out[0][1]]);
  return out.length >= 4 ? out : null;
}
/** Oriente un polygone à la norme GeoJSON (extérieur trigonométrique, trous horaires). */
export function orientPolygon(poly) {
  return poly.map((ring, i) => {
    const ccw = ringAreaM(ring) > 0;
    return (i === 0) === ccw ? ring : ring.slice().reverse();
  });
}

/** Simplification de Douglas-Peucker (tolérance en mètres). Conserve les extrémités. */
export function simplifyLine(line, tolM) {
  if (line.length <= 2) return line;
  const pts = line.map((p) => [(p[0] - LON0) * MX, (p[1] - LAT0) * MZ]);
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  const tol2 = tolM * tolM;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1, worstD = tol2;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] - ax, py = pts[i][1] - ay;
      let d;
      if (len2 === 0) d = px * px + py * py;
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const ex = px - t * dx, ey = py - t * dy;
        d = ex * ex + ey * ey;
      }
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst >= 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return line.filter((_, i) => keep[i]);
}
/** Simplifie un anneau fermé sans le dégénérer (renvoie null s'il devient trop petit). */
export function simplifyRing(ring, tolM) {
  if (ring.length <= 5) return ring;
  // coupe l'anneau en deux moitiés pour que la simplification ait deux points d'ancrage éloignés
  let far = 0, farD = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = Math.hypot((ring[i][0] - ring[0][0]) * MX, (ring[i][1] - ring[0][1]) * MZ);
    if (d > farD) { farD = d; far = i; }
  }
  const a = simplifyLine(ring.slice(0, far + 1), tolM);
  const b = simplifyLine(ring.slice(far), tolM);
  const out = a.concat(b.slice(1));
  return out.length >= 4 ? out : null;
}

/** Découpe une ligne par un rectangle [o, s, e, n] ; renvoie 0..n morceaux. */
export function clipLineToRect(line, rect) {
  const [W, S, E, N] = rect;
  const out = [];
  let cur = null;
  for (let i = 1; i < line.length; i++) {
    const x0 = line[i - 1][0], y0 = line[i - 1][1], x1 = line[i][0], y1 = line[i][1];
    // Liang-Barsky
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    let ok = true;
    for (const [p, q] of [[-dx, x0 - W], [dx, E - x0], [-dy, y0 - S], [dy, N - y0]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } } else {
        const r = q / p;
        if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
      }
    }
    if (!ok) { cur = null; continue; }
    const a = t0 === 0 ? line[i - 1] : [round7(x0 + t0 * dx), round7(y0 + t0 * dy)];
    const b = t1 === 1 ? line[i] : [round7(x0 + t1 * dx), round7(y0 + t1 * dy)];
    if (cur && t0 === 0) cur.push(b);
    else { cur = [a, b]; out.push(cur); }
    if (t1 < 1) cur = null;
  }
  return out.filter((l) => l.length >= 2 && !(l.length === 2 && l[0][0] === l[1][0] && l[0][1] === l[1][1]));
}

/** Découpe un anneau par un rectangle (Sutherland-Hodgman). Renvoie un anneau fermé ou null. */
export function clipRingToRect(ring, rect) {
  const [W, S, E, N] = rect;
  let pts = ring.slice(0, -1);
  const edges = [
    [(p) => p[0] >= W, (a, b) => [W, a[1] + ((b[1] - a[1]) * (W - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= E, (a, b) => [E, a[1] + ((b[1] - a[1]) * (E - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= S, (a, b) => [a[0] + ((b[0] - a[0]) * (S - a[1])) / (b[1] - a[1]), S]],
    [(p) => p[1] <= N, (a, b) => [a[0] + ((b[0] - a[0]) * (N - a[1])) / (b[1] - a[1]), N]],
  ];
  for (const [inside, cut] of edges) {
    if (!pts.length) return null;
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) next.push(cut(prev, cur)); next.push(cur); } else if (pi) next.push(cut(prev, cur));
    }
    pts = next;
  }
  if (pts.length < 3) return null;
  return cleanRing(pts);
}
/** Découpe un polygone [extérieur, trous…] par un rectangle. Renvoie le polygone découpé ou null. */
export function clipPolygonToRect(poly, rect) {
  const bb = bboxOf(poly[0]);
  if (!bboxIntersects(bb, rect)) return null;
  if (bb[0] >= rect[0] && bb[1] >= rect[1] && bb[2] <= rect[2] && bb[3] <= rect[3]) return poly; // entièrement dedans
  const outer = clipRingToRect(poly[0], rect);
  if (!outer || Math.abs(ringAreaM(outer)) < 0.5) return null;
  const res = [outer];
  for (let i = 1; i < poly.length; i++) {
    const h = clipRingToRect(poly[i], rect);
    if (h && Math.abs(ringAreaM(h)) >= 0.5) res.push(h);
  }
  return res;
}

/**
 * Assemble des chemins (avec identifiants de nœuds) en anneaux fermés.
 * ways : [{ refs:[id…], coords:[[lon,lat]…] }]. Renvoie { rings:[coords fermés], open:[chaînes ouvertes {refs, coords}] }.
 */
export function assembleRings(ways) {
  const rings = [];
  const pool = [];
  for (const w of ways) {
    if (w.coords.length < 2) continue;
    if (w.refs[0] === w.refs[w.refs.length - 1]) { if (w.coords.length >= 4) rings.push(w.coords.slice()); } else pool.push({ refs: w.refs.slice(), coords: w.coords.slice() });
  }
  const open = [];
  while (pool.length) {
    const cur = pool.pop();
    let extended = true;
    while (extended && cur.refs[0] !== cur.refs[cur.refs.length - 1]) {
      extended = false;
      const tail = cur.refs[cur.refs.length - 1];
      for (let i = 0; i < pool.length; i++) {
        const o = pool[i];
        if (o.refs[0] === tail) {
          cur.refs.push(...o.refs.slice(1)); cur.coords.push(...o.coords.slice(1));
        } else if (o.refs[o.refs.length - 1] === tail) {
          cur.refs.push(...o.refs.slice(0, -1).reverse()); cur.coords.push(...o.coords.slice(0, -1).reverse());
        } else continue;
        pool.splice(i, 1); extended = true; break;
      }
      if (!extended) {
        // essaie de prolonger par la tête
        const head = cur.refs[0];
        for (let i = 0; i < pool.length; i++) {
          const o = pool[i];
          if (o.refs[o.refs.length - 1] === head) {
            cur.refs.unshift(...o.refs.slice(0, -1)); cur.coords.unshift(...o.coords.slice(0, -1));
          } else if (o.refs[0] === head) {
            cur.refs.unshift(...o.refs.slice(1).reverse()); cur.coords.unshift(...o.coords.slice(1).reverse());
          } else continue;
          pool.splice(i, 1); extended = true; break;
        }
      }
    }
    if (cur.refs[0] === cur.refs[cur.refs.length - 1] && cur.coords.length >= 4) rings.push(cur.coords);
    else open.push(cur);
  }
  return { rings, open };
}

/** Répartit des anneaux extérieurs et intérieurs en polygones [[ext, trou…], …]. */
export function groupRings(outers, inners) {
  const polys = outers.map((o) => ({ ring: o, area: Math.abs(ringAreaM(o)), holes: [] }));
  polys.sort((a, b) => a.area - b.area); // le plus petit extérieur contenant gagne
  for (const h of inners) {
    const p = h[0];
    const host = polys.find((o) => pointInRing(p, o.ring)) || polys.find((o) => pointInRing(ringCentroid(h), o.ring));
    if (host) host.holes.push(h);
  }
  return polys.map((p) => [p.ring, ...p.holes]);
}

/** Index spatial en grille (cellules en degrés ≈ cellM mètres). Les éléments sont rangés par boîte englobante. */
export class GridIndex {
  constructor(cellM = 100) {
    this.cx = cellM / MX;
    this.cy = cellM / MZ;
    this.cells = new Map();
  }
  key(ix, iy) { return ix * 100003 + iy; }
  insert(bb, item) {
    const x0 = Math.floor(bb[0] / this.cx), x1 = Math.floor(bb[2] / this.cx);
    const y0 = Math.floor(bb[1] / this.cy), y1 = Math.floor(bb[3] / this.cy);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const k = this.key(ix, iy);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(item);
      }
    }
  }
  /** Éléments dont la cellule recoupe la boîte (sans doublon). */
  query(bb) {
    const x0 = Math.floor(bb[0] / this.cx), x1 = Math.floor(bb[2] / this.cx);
    const y0 = Math.floor(bb[1] / this.cy), y1 = Math.floor(bb[3] / this.cy);
    const seen = new Set();
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const c = this.cells.get(this.key(ix, iy));
        if (c) for (const it of c) seen.add(it);
      }
    }
    return seen;
  }
  queryPoint(pt) { return this.cells.get(this.key(Math.floor(pt[0] / this.cx), Math.floor(pt[1] / this.cy))) || []; }
}

// ───────────────────────────── 5. Écriture GeoJSON ─────────────────────────────

/** Écrit une FeatureCollection, un objet par ligne (lisible par diff, analysable en flux). */
export function writeGeojson(file, features, meta = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file + '.part', 'w');
  fs.writeSync(fd, `{"type":"FeatureCollection","name":${JSON.stringify(path.basename(file, '.geojson'))},"meta":${JSON.stringify(meta)},"features":[\n`);
  let chunk = '';
  for (let i = 0; i < features.length; i++) {
    chunk += JSON.stringify(features[i]) + (i < features.length - 1 ? ',\n' : '\n');
    if (chunk.length > 1 << 22) { fs.writeSync(fd, chunk); chunk = ''; }
  }
  fs.writeSync(fd, chunk + ']}\n');
  fs.closeSync(fd);
  fs.renameSync(file + '.part', file);
  return fs.statSync(file).size;
}
export const feature = (geometry, properties) => ({ type: 'Feature', properties, geometry });
export const polygonGeom = (polys) => (polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys });
/** Géométrie GeoJSON Polygon/MultiPolygon → liste de polygones. */
export const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
