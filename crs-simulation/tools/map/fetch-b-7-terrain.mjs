// fetch-b-7-terrain.mjs — relief : modèle numérique de terrain de l'emprise (+ 300 m de marge), pas de 25 m.
// Source : service d'altimétrie de la Géoplateforme IGN (RGE ALTI®), interrogé par paquets de points (POST).
// Sortie : raw/normalized/terrain.json. Si le service ne répond pas, un relief PLAT est écrit et signalé (flat: true).

import fs from 'node:fs';
import path from 'node:path';
import { RAW_B, NORM, BBOX, LON0, LAT0, MX, MZ, toX, toZ, download, jsonValidator, readJson, HostDownError, requestLog, round2, writeStatus } from './lib-b.mjs';

const CELL = 25; // pas de la grille (m)
const MARGIN = 300; // marge autour de l'emprise (m)
const RESOURCE = 'ign_rge_alti_wld'; // « RGE Alti - France entière »
const URL_ALTI = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
const MAX_POINTS = 4500; // le service accepte 5 000 points par requête
const FLAT_ALT = 33; // altitude du relief plat de secours (≈ place de la Concorde)

// Grille calée sur les multiples de 25 m du repère local : le jeu retrouve un nœud par (x - x0) / 25, (z - z0) / 25.
const x0 = Math.floor((toX(BBOX.west) - MARGIN) / CELL) * CELL;
const x1 = Math.ceil((toX(BBOX.east) + MARGIN) / CELL) * CELL;
const z0 = Math.floor((toZ(BBOX.north) - MARGIN) / CELL) * CELL; // bord nord (z minimal)
const z1 = Math.ceil((toZ(BBOX.south) + MARGIN) / CELL) * CELL;
const nx = Math.round((x1 - x0) / CELL) + 1;
const nz = Math.round((z1 - z0) / CELL) + 1;
const lonOf = (ix) => LON0 + (x0 + ix * CELL) / MX;
const latOf = (iz) => LAT0 - (z0 + iz * CELL) / MZ;

const dir = path.join(RAW_B, 'terrain', `${RESOURCE}_c${CELL}_x${x0}_z${z0}_${nx}x${nz}`);
const rowsPerReq = Math.max(1, Math.floor(MAX_POINTS / nx));
const heights = new Array(nx * nz).fill(null);
let flat = false, flatReason = null, cachedChunks = 0, fetchedChunks = 0;

try {
  for (let r0 = 0, c = 0; r0 < nz; r0 += rowsPerReq, c++) {
    const r1 = Math.min(nz, r0 + rowsPerReq);
    const lon = [], lat = [];
    for (let iz = r0; iz < r1; iz++) for (let ix = 0; ix < nx; ix++) { lon.push(lonOf(ix).toFixed(7)); lat.push(latOf(iz).toFixed(7)); }
    const dest = path.join(dir, `rows-${String(r0).padStart(3, '0')}-${String(r1 - 1).padStart(3, '0')}.json`);
    const n = lon.length;
    const res = await download(URL_ALTI, dest, {
      jsonBody: { lon: lon.join('|'), lat: lat.join('|'), resource: RESOURCE, delimiter: '|', zonly: 'true' },
      validate: jsonValidator((j) => (Array.isArray(j.elevations) && j.elevations.length === n ? null : `attendu ${n} altitudes, reçu ${JSON.stringify(j).slice(0, 120)}`)),
      timeoutS: 180,
    });
    if (res.cached) cachedChunks++; else fetchedChunks++;
    const el = readJson(dest).elevations;
    for (let i = 0; i < n; i++) heights[r0 * nx + i] = el[i];
    console.log(`relief : lignes ${r0}–${r1 - 1} (${n} points) ${res.cached ? 'depuis le cache' : 'téléchargées'}`);
  }
} catch (e) {
  if (!(e instanceof HostDownError)) throw e;
  flat = true; flatReason = String(e.message);
  console.error('RELIEF PLAT : le service d\'altimétrie ne répond pas → ' + flatReason);
  heights.fill(FLAT_ALT);
}

// Valeurs manquantes (le service renvoie -99999 hors couverture) : comblées par la moyenne des voisins valides.
const bad = (v) => v == null || !Number.isFinite(v) || v < -500 || v > 1000;
let missing = 0;
for (let pass = 0; pass < 50; pass++) {
  const todo = [];
  for (let i = 0; i < heights.length; i++) if (bad(heights[i])) todo.push(i);
  if (!todo.length) break;
  if (pass === 0) missing = todo.length;
  const fill = new Map();
  for (const i of todo) {
    const ix = i % nx, iz = (i - ix) / nx;
    let s = 0, k = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const v = heights[jz * nx + jx];
      if (!bad(v)) { s += v; k++; }
    }
    if (k) fill.set(i, s / k);
  }
  if (!fill.size) { for (const i of todo) heights[i] = FLAT_ALT; break; }
  for (const [i, v] of fill) heights[i] = v;
}

let min = Infinity, max = -Infinity, iMin = 0, iMax = 0;
heights.forEach((v, i) => { if (v < min) { min = v; iMin = i; } if (v > max) { max = v; iMax = i; } });
const where = (i) => { const ix = i % nx, iz = (i - ix) / nx; return { x: x0 + ix * CELL, z: z0 + iz * CELL, lon: +lonOf(ix).toFixed(6), lat: +latOf(iz).toFixed(6) }; };

const terrain = {
  // Premier échantillon (index 0) = coin NORD-OUEST de la grille. À ne pas confondre avec l'origine du monde (originLon/originLat).
  lon0: +lonOf(0).toFixed(7),
  lat0: +latOf(0).toFixed(7),
  cellM: CELL,
  cellDegLon: CELL / MX,
  cellDegLat: CELL / MZ,
  nx, nz,
  x0, z0, // position du premier échantillon dans le repère du jeu (mètres ; x vers l'est, z vers le sud)
  originLon: LON0, originLat: LAT0,
  order: 'heights[iz * nx + ix] ; ix croît vers l\'est (x = x0 + ix * cellM), iz croît vers le sud (z = z0 + iz * cellM)',
  unit: 'mètres, altitude NGF-IGN69 du terrain nu (échantillon ponctuel, non moyenné)',
  marginM: MARGIN,
  flat,
  ...(flat ? { flatReason } : {}),
  source: flat ? 'aucune (relief plat de secours)' : `IGN — RGE ALTI® (ressource ${RESOURCE} du service d'altimétrie de la Géoplateforme)`,
  license: flat ? null : 'Licence Ouverte / Open Licence 2.0 (Etalab)',
  min: round2(min), max: round2(max), missingFilled: missing,
  heights: heights.map(round2),
};
fs.mkdirSync(NORM, { recursive: true });
const out = path.join(NORM, 'terrain.json');
fs.writeFileSync(out, JSON.stringify(terrain) + '\n');

/** Altitude interpolée (bilinéaire) en un point WGS84 — même formule que celle attendue du jeu. */
export function heightAt(lon, lat, t = terrain) {
  const fx = Math.min(t.nx - 1.001, Math.max(0, (toX(lon) - t.x0) / t.cellM));
  const fz = Math.min(t.nz - 1.001, Math.max(0, (toZ(lat) - t.z0) / t.cellM));
  const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz;
  const h = (i, j) => t.heights[j * t.nx + i];
  return (h(ix, iz) * (1 - ax) + h(ix + 1, iz) * ax) * (1 - az) + (h(ix, iz + 1) * (1 - ax) + h(ix + 1, iz + 1) * ax) * az;
}

console.log(`relief : grille ${nx} × ${nz} = ${nx * nz} points, pas ${CELL} m, x ${x0}…${x1}, z ${z0}…${z1} → ${path.relative(RAW_B, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} Ko)`);
console.log(`relief : ${fetchedChunks} requêtes émises, ${cachedChunks} paquets lus dans le cache, ${missing} valeurs manquantes comblées, plat = ${flat}`);
console.log(`relief : min ${min.toFixed(2)} m en ${JSON.stringify(where(iMin))}, max ${max.toFixed(2)} m en ${JSON.stringify(where(iMax))}`);
if (requestLog.size) console.log('requêtes :', JSON.stringify(Object.fromEntries(requestLog)));
writeStatus('terrain', flat ? [`service d'altimétrie IGN indisponible : RELIEF PLAT à ${FLAT_ALT} m (${String(flatReason).slice(0, 90)})`] : []);
