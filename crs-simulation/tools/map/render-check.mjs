#!/usr/bin/env node
/* =====================================================================================
 * CARTE DE PARIS — RENDU DE CONTRÔLE EN 2D
 * -------------------------------------------------------------------------------------
 *   node tools/map/render-check.mjs
 *       dessine la vue d'ensemble, le relief, la carte des trous et les gros plans dans docs/img/map-*.png
 *   node tools/map/render-check.mjs --out <dossier> --box nom:x0,z0,x1,z1[:pxParMetre] [--box …]
 *       dessine seulement les fenêtres demandées (mètres monde) dans <dossier>
 *   node tools/map/render-check.mjs --only etoile,concorde
 *       ne redessine que les vues nommées
 *
 * Le script lit les fichiers PUBLIÉS de public/data/paris/ (ou CRS_MAP_OUT) et les décode avec
 * son PROPRE décodeur, écrit d'après docs/map-format.md : il ne dépend pas de
 * src/world/mapdata.ts, ce qui en fait un contrôle indépendant du format. Le dessin se fait
 * dans un canvas 2D de Chromium piloté par Playwright ; aucune requête ne sort de la machine
 * (toutes les requêtes de la page sont servies depuis le disque).
 *
 * Repère du dessin : nord en haut, est à droite (x = est, z = sud).
 *
 * Ce que le dessin reprend du moteur (src/world/view/raster.ts), pour montrer ce que le joueur verra :
 *   - les surfaces sont peintes dans l'ordre du fichier ; l'eau y est au-dessus de tout ;
 *   - une surface dure (chaussée, trottoir, terre-plein, zone piétonne, place) qui recouvre l'eau est
 *     le tablier d'un pont : elle est redessinée par-dessus l'eau ;
 *   - là où aucune surface n'est fournie, le moteur met du trottoir : ces zones sont hachurées en rouge.
 * Les PNG sont écrits en couleurs indexées (256 couleurs) pour rester légers dans le dépôt.
 * ===================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.CRS_MAP_OUT ?? path.resolve(HERE, '..', '..', 'public', 'data', 'paris');
const IMG = path.resolve(HERE, '..', '..', 'docs', 'img');
const require = createRequire(import.meta.url);

/** Projection du BRIEF : sert à placer les fenêtres des gros plans à partir de coordonnées GPS. */
const LON0 = 2.321236, LAT0 = 48.865633;
const px = (lon) => (lon - LON0) * 73305;
const pz = (lat) => -(lat - LAT0) * 111214;
/** Fenêtre centrée sur un point GPS, de `w` × `h` mètres. */
function around(lat, lon, w, h) {
  const cx = Math.round(px(lon)), cz = Math.round(pz(lat));
  return { x0: cx - w / 2, z0: cz - h / 2, x1: cx + w / 2, z1: cz + h / 2 };
}

/** Vues standard. Gros plans à 0,5 m par pixel (2 px par mètre). */
const VIEWS = [
  { name: 'map-overview', title: 'Paris — vue d\'ensemble (grille des tuiles de 512 m)', x0: -3072, z0: -1536, x1: 4096, z1: 2048, scale: 4000 / 7168, mode: 'overview' },
  { name: 'map-relief', title: 'Relief (terrain.json) — courbes de niveau tous les 2 m', x0: -3072, z0: -1536, x1: 4096, z1: 2048, scale: 2400 / 7168, mode: 'relief' },
  { name: 'map-holes', title: 'Zones sans surface ni bâtiment (en rouge) dans l\'emprise demandée', x0: -2700, z0: -1420, x1: 3800, z1: 1780, scale: 0.5, mode: 'holes' },
  { name: 'map-etoile', title: 'Place Charles-de-Gaulle (Étoile)', ...around(48.873792, 2.295028, 1000, 1000), scale: 2, mode: 'detail' },
  { name: 'map-concorde', title: 'Place de la Concorde', ...around(48.865633, 2.321236, 1000, 900), scale: 2, mode: 'detail' },
  { name: 'map-cite', title: 'Île de la Cité', x0: 1300, z0: 850, x1: 2400, z1: 1600, scale: 2, mode: 'detail' },
  { name: 'map-republique', title: 'Place de la République', ...around(48.867500, 2.363800, 900, 800), scale: 2, mode: 'detail' },
  { name: 'map-bastille', title: 'Place de la Bastille', ...around(48.853200, 2.369200, 900, 800), scale: 2, mode: 'detail' },
  { name: 'map-trocadero', title: 'Trocadéro et palais de Chaillot', ...around(48.862500, 2.288500, 900, 800), scale: 2, mode: 'detail' },
  { name: 'map-tour-eiffel', title: 'Tour Eiffel et Champ-de-Mars', ...around(48.857500, 2.295500, 900, 900), scale: 2, mode: 'detail' },
];

// ─────────────────────────────────────────────────────────────────────────────────────
// Code exécuté DANS la page (sérialisé par Playwright : aucune variable de Node n'y est visible)
// ─────────────────────────────────────────────────────────────────────────────────────

/** Charge et décode toute la carte dans `window.MAP`. Retourne un résumé chiffré. */
async function pageLoad() {
  const getJson = async (p) => {
    const r = await fetch('/data/' + p);
    if (!r.ok) throw new Error('fichier absent : ' + p);
    return r.json();
  };
  const U = 10; // décimètres par mètre
  const T = 512;
  const BUILDING_KINDS = ['generic', 'residential', 'office', 'retail', 'hotel', 'public', 'government', 'school', 'hospital', 'religious', 'culture', 'station', 'police', 'fire_station', 'industrial', 'parking', 'monument', 'kiosk', 'roof', 'construction'];
  const SURFACE_KINDS = ['plaza', 'road', 'sidewalk', 'pedestrian', 'median', 'parking', 'construction', 'courtyard', 'park', 'garden', 'grass', 'gravel', 'quay', 'sports', 'cemetery', 'rail', 'water'];
  const BARRIER_KINDS = ['wall', 'fence', 'hedge', 'quay_wall', 'railing', 'gate'];
  const FURNITURE_KINDS = ['autre', 'banc', 'candelabre', 'poubelle', 'potelet', 'abribus', 'kiosque', 'colonne_morris', 'fontaine_wallace', 'sanisette', 'panneau_pub', 'station_velo', 'jardiniere', 'conteneur', 'barriere_vauban', 'barriere_chantier', 'table_terrasse', 'distributeur', 'echafaudage', 'boite_aux_lettres', 'arceau_velo', 'panneau', 'statue', 'mat_drapeau', 'bouche_incendie', 'horodateur', 'armoire_technique', 'colonne_verre', 'horloge', 'camera'];
  const SHOP_CATEGORIES = ['autre', 'banque', 'luxe', 'mode', 'bijouterie', 'alimentation', 'supermarche', 'cafe_restaurant', 'restauration_rapide', 'pharmacie', 'tabac_presse', 'telephonie', 'agence', 'hotel'];
  const ROAD_CLASSES = ['residential', 'motorway', 'primary', 'secondary', 'tertiary', 'service', 'pedestrian', 'footway'];
  const PLACE_KINDS = ['square', 'street', 'bridge', 'quay', 'garden', 'district', 'monument', 'station', 'institution'];

  /** Anneaux ou polylignes codés en deltas (§ 4.5 du format) -> tableaux plats en mètres monde. */
  const decodeLines = (len, xz, ox, oz, what) => {
    const out = [];
    let p = 0;
    for (const n of len) {
      const r = new Float64Array(n * 2);
      let x = 0, z = 0;
      for (let k = 0; k < n; k++, p += 2) {
        if (k === 0) { x = xz[p]; z = xz[p + 1]; } else { x += xz[p]; z += xz[p + 1]; }
        r[2 * k] = ox + x / U;
        r[2 * k + 1] = oz + z / U;
      }
      out.push(r);
    }
    if (p !== xz.length) throw new Error(what + ' : colonnes len et xz incohérentes');
    return out;
  };
  const sparse = (col, fn) => { if (col) for (let k = 0; k + 1 < col.length; k += 2) fn(col[k], col[k + 1]); };

  const manifest = await getJson('manifest.json');
  const rawGraph = await getJson(manifest.files.roadGraph);
  const rawPlaces = await getJson(manifest.files.places);
  const rawLandmarks = await getJson(manifest.files.landmarks);
  const rawTerrain = await getJson(manifest.files.terrain);

  const tiles = [];
  for (const t of manifest.tiles) {
    const raw = await getJson(t.file);
    const ox = raw.tx * T, oz = raw.tz * T;
    const str = raw.str ?? [''];
    const tile = { tx: raw.tx, tz: raw.tz, buildings: [], surfaces: [], barriers: [], trees: [], furniture: [], signals: [], metro: [], shops: [] };
    const polys = (layer, what, make) => {
      if (!layer || !layer.n) return;
      const rings = decodeLines(layer.len, layer.xz, ox, oz, what);
      let r = 0;
      for (let i = 0; i < layer.n; i++) {
        const nr = layer.rings ? layer.rings[i] : 1;
        make(i, rings.slice(r, r + nr));
        r += nr;
      }
      if (r !== rings.length) throw new Error(what + ' : colonnes rings et len incohérentes');
    };
    const b = raw.buildings;
    polys(b, 'bâtiments', (i, rings) => tile.buildings.push({
      id: b.id[i], h: b.h[i] / U, rings, kind: BUILDING_KINDS[b.kind ? b.kind[i] : 0], lm: '', name: '',
    }));
    if (b) {
      sparse(b.lm, (i, s) => { tile.buildings[i].lm = str[s]; });
      sparse(b.name, (i, s) => { tile.buildings[i].name = str[s]; });
    }
    const s = raw.surfaces;
    polys(s, 'surfaces', (i, rings) => tile.surfaces.push({ kind: SURFACE_KINDS[s.kind[i]], rings, name: '' }));
    if (s) sparse(s.name, (i, v) => { tile.surfaces[i].name = str[v]; });
    const w = raw.barriers;
    if (w && w.n) {
      const lines = decodeLines(w.len, w.xz, ox, oz, 'barrières');
      for (let i = 0; i < w.n; i++) tile.barriers.push({ kind: BARRIER_KINDS[w.kind ? w.kind[i] : 0], h: (w.h ? w.h[i] : 20) / U, pts: lines[i] });
    }
    const pt = (layer, i) => [ox + layer.xz[2 * i] / U, oz + layer.xz[2 * i + 1] / U];
    const ang = (layer, i) => ((layer.a ? layer.a[i] : 0) / 3600) * 2 * Math.PI;
    const tr = raw.trees;
    if (tr) for (let i = 0; i < tr.n; i++) { const [x, z] = pt(tr, i); tile.trees.push({ x, z, h: (tr.h ? tr.h[i] : 100) / U, r: (tr.r ? tr.r[i] : 30) / U }); }
    const fu = raw.furniture;
    if (fu) for (let i = 0; i < fu.n; i++) { const [x, z] = pt(fu, i); tile.furniture.push({ x, z, kind: FURNITURE_KINDS[fu.kind ? fu.kind[i] : 0], a: ang(fu, i) }); }
    const sg = raw.signals;
    if (sg) for (let i = 0; i < sg.n; i++) { const [x, z] = pt(sg, i); tile.signals.push({ x, z, a: ang(sg, i), node: sg.node ? sg.node[i] : -1 }); }
    const me = raw.metro;
    if (me) for (let i = 0; i < me.n; i++) { const [x, z] = pt(me, i); tile.metro.push({ x, z, a: ang(me, i), name: me.name ? str[me.name[i]] : '', lines: me.lines ? str[me.lines[i]] : '' }); }
    const sh = raw.shops;
    if (sh) for (let i = 0; i < sh.n; i++) { const [x, z] = pt(sh, i); tile.shops.push({ x, z, a: ang(sh, i), w: (sh.w ? sh.w[i] : 40) / U, cat: SHOP_CATEGORIES[sh.cat ? sh.cat[i] : 0], b: sh.b ? sh.b[i] : 0 }); }
    tiles.push(tile);
  }

  // Graphe routier : coordonnées relatives à l'origine du monde ; points intermédiaires en deltas depuis le nœud a.
  const gn = rawGraph.nodes, ge = rawGraph.edges, gstr = rawGraph.str ?? [''];
  const nodes = [];
  for (let i = 0; i < gn.n; i++) nodes.push({ x: gn.xz[2 * i] / U, z: gn.xz[2 * i + 1] / U, flags: gn.flags ? gn.flags[i] : 0 });
  const edges = [];
  let p = 0;
  for (let e = 0; e < ge.n; e++) {
    const a = ge.a[e], bb = ge.b[e], mid = ge.len ? ge.len[e] : 0;
    const pts = new Float64Array((mid + 2) * 2);
    let x = gn.xz[2 * a], z = gn.xz[2 * a + 1];
    pts[0] = x / U; pts[1] = z / U;
    for (let k = 1; k <= mid; k++, p += 2) { x += ge.xz[p]; z += ge.xz[p + 1]; pts[2 * k] = x / U; pts[2 * k + 1] = z / U; }
    pts[2 * mid + 2] = gn.xz[2 * bb] / U; pts[2 * mid + 3] = gn.xz[2 * bb + 1] / U;
    const f = ge.flags ? ge.flags[e] : 0;
    edges.push({
      a, b: bb, pts, w: ge.w[e] / U, sw: (ge.sw ? ge.sw[e] : 0) / U, cls: ROAD_CLASSES[ge.cls ? ge.cls[e] : 0],
      oneway: (f & 1) !== 0, bridge: (f & 2) !== 0, tunnel: (f & 4) !== 0, ped: (f & 8) !== 0,
      name: ge.name ? gstr[ge.name[e]] : '', lm: '',
    });
  }
  if (p !== (ge.xz ?? []).length) throw new Error('graphe : colonnes len et xz incohérentes');
  sparse(ge.lm, (i, s) => { edges[i].lm = gstr[s]; });

  const places = [];
  for (let i = 0; i < rawPlaces.n; i++) {
    places.push({
      name: rawPlaces.name[i], x: rawPlaces.xz[2 * i] / U, z: rawPlaces.xz[2 * i + 1] / U,
      kind: PLACE_KINDS[rawPlaces.kind ? rawPlaces.kind[i] : 0], r: rawPlaces.r ? rawPlaces.r[i] : 0, imp: rawPlaces.imp ? rawPlaces.imp[i] : 1,
    });
  }
  const lmRings = decodeLines(rawLandmarks.len, rawLandmarks.fxz, 0, 0, 'monuments');
  const landmarks = [];
  for (let i = 0; i < rawLandmarks.n; i++) {
    landmarks.push({
      key: rawLandmarks.key[i], name: rawLandmarks.name[i], x: rawLandmarks.xz[2 * i] / U, z: rawLandmarks.xz[2 * i + 1] / U,
      h: rawLandmarks.h[i] / U, a: ((rawLandmarks.a ? rawLandmarks.a[i] : 0) / 3600) * 2 * Math.PI, ring: lmRings[i],
    });
  }
  const th = new Float32Array(rawTerrain.nx * rawTerrain.nz);
  let acc = 0;
  for (let i = 0; i < th.length; i++) { acc += rawTerrain.h[i]; th[i] = acc * rawTerrain.scale; }
  const terrain = { x0: rawTerrain.x0, z0: rawTerrain.z0, step: rawTerrain.step, nx: rawTerrain.nx, nz: rawTerrain.nz, h: th };

  window.MAP = { manifest, tiles, nodes, edges, places, landmarks, terrain };
  const sum = (k) => tiles.reduce((n, t) => n + t[k].length, 0);
  // Empreinte : somme des coordonnées en décimètres, à comparer à celle de verify-map.mjs (décodeur du jeu).
  let ckB = 0, ckE = 0;
  for (const t of tiles) for (const bd of t.buildings) { const r = bd.rings[0]; for (let i = 0; i < r.length; i++) ckB += Math.round(r[i] * U); }
  for (const e of edges) for (let i = 0; i < e.pts.length; i++) ckE += Math.round(e.pts[i] * U);
  return {
    checksum: { buildings: ckB, edges: ckE },
    tiles: tiles.length, buildings: sum('buildings'), surfaces: sum('surfaces'), barriers: sum('barriers'), trees: sum('trees'),
    furniture: sum('furniture'), signals: sum('signals'), metro: sum('metro'), shops: sum('shops'),
    nodes: nodes.length, edges: edges.length, places: places.length, landmarks: landmarks.length,
  };
}

/** Dessine une vue et retourne le PNG en data URL. */
function pageRender(view) {
  const { manifest, tiles, nodes, edges, places, landmarks, terrain } = window.MAP;
  const { x0, z0, x1, z1, scale, mode, title } = view;
  const W = Math.round((x1 - x0) * scale), H = Math.round((z1 - z0) * scale);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const X = (x) => (x - x0) * scale, Z = (z) => (z - z0) * scale;
  const detail = mode === 'detail';
  const T = 512;

  const SURFACE_COLORS = {
    plaza: '#e6dcc8', road: '#b4b4b8', sidewalk: '#dddcd8', pedestrian: '#e9dfcb', median: '#cdd6bd', parking: '#c6c6d2',
    construction: '#d9c9a0', courtyard: '#efe9dc', park: '#b9dea6', garden: '#aed99b', grass: '#a2d387', gravel: '#ecdfbd',
    quay: '#cdc6b2', sports: '#b2d8c4', cemetery: '#c3d4bd', rail: '#aaa0a0', water: '#86bce8',
  };
  const CLASS_COLORS = {
    motorway: '#c2185b', primary: '#e65100', secondary: '#f59e0b', tertiary: '#e8d21d', residential: '#ffffff',
    service: '#9e9e9e', pedestrian: '#9575cd', footway: '#8d6e63',
  };
  const SHOP_COLORS = {
    autre: '#555555', banque: '#0d47a1', luxe: '#aa00ff', mode: '#d81b60', bijouterie: '#ffab00', alimentation: '#2e7d32',
    supermarche: '#00695c', cafe_restaurant: '#e53935', restauration_rapide: '#ff7043', pharmacie: '#00c853', tabac_presse: '#6d4c41',
    telephonie: '#00b8d4', agence: '#546e7a', hotel: '#3949ab',
  };
  const HEIGHT_STOPS = [[0, [247, 240, 222]], [6, [241, 221, 174]], [12, [233, 193, 124]], [18, [222, 155, 86]], [24, [207, 112, 68]], [32, [168, 67, 61]], [45, [109, 42, 69]], [80, [45, 27, 61]]];
  const ramp = (stops, v) => {
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return stops[i - 1][1].map((a, k) => Math.round(a + (stops[i][1][k] - a) * t));
      }
    }
    return stops[stops.length - 1][1];
  };
  const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
  const heightColor = (h) => rgb(ramp(HEIGHT_STOPS, h));

  const ringPath = (r, g = c) => {
    g.moveTo(X(r[0]), Z(r[1]));
    for (let i = 2; i < r.length; i += 2) g.lineTo(X(r[i]), Z(r[i + 1]));
    g.closePath();
  };
  const HARD = new Set(['road', 'sidewalk', 'median', 'pedestrian', 'plaza']);
  const linePath = (pts) => {
    c.moveTo(X(pts[0]), Z(pts[1]));
    for (let i = 2; i < pts.length; i += 2) c.lineTo(X(pts[i]), Z(pts[i + 1]));
  };
  const inView = (x, z, m = 0) => x >= x0 - m && x <= x1 + m && z >= z0 - m && z <= z1 + m;
  const lineInView = (pts, m) => {
    let a = Infinity, b = Infinity, d = -Infinity, e = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { if (pts[i] < a) a = pts[i]; if (pts[i] > d) d = pts[i]; if (pts[i + 1] < b) b = pts[i + 1]; if (pts[i + 1] > e) e = pts[i + 1]; }
    return d >= x0 - m && a <= x1 + m && e >= z0 - m && b <= z1 + m;
  };
  const label = (text, x, y, size, color = '#111', align = 'center', angle = 0, bold = false) => {
    c.save();
    c.translate(x, y);
    if (angle !== 0) c.rotate(angle);
    c.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2, size / 4);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.strokeText(text, 0, 0);
    c.fillStyle = color;
    c.fillText(text, 0, 0);
    c.restore();
  };
  /** Tuiles qui touchent la vue, marge d'une tuile comprise (un bâtiment peut déborder de la sienne). */
  const viewTiles = tiles.filter((t) => (t.tx + 2) * T >= x0 && (t.tx - 1) * T <= x1 && (t.tz + 2) * T >= z0 && (t.tz - 1) * T <= z1);

  // Fond : rose uni = tuile absente du manifeste. Dans une tuile présente, ce qui n'est couvert par aucune
  // surface ni aucun bâtiment est hachuré en rouge : le moteur y met du trottoir par défaut.
  c.fillStyle = '#f4b6c2';
  c.fillRect(0, 0, W, H);
  {
    const hatch = document.createElement('canvas');
    hatch.width = hatch.height = 6;
    const h = hatch.getContext('2d');
    h.fillStyle = '#fbf8f1'; h.fillRect(0, 0, 6, 6);
    h.strokeStyle = 'rgba(214,40,40,0.55)'; h.lineWidth = 1;
    h.beginPath(); h.moveTo(-1, 7); h.lineTo(7, -1); h.stroke();
    c.fillStyle = c.createPattern(hatch, 'repeat');
    for (const t of manifest.tiles) c.fillRect(X(t.tx * T), Z(t.tz * T), T * scale + 0.5, T * scale + 0.5);
  }

  if (mode === 'holes') {
    // Carte des trous : tout ce qui est couvert (surface ou bâtiment) en gris, le reste en rouge ; mesure dans l'emprise.
    const bb = manifest.bounds;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#e53935';
    c.fillRect(X(bb.minX), Z(bb.minZ), (bb.maxX - bb.minX) * scale, (bb.maxZ - bb.minZ) * scale);
    const paint = (col, pick) => {
      c.fillStyle = col;
      for (const t of tiles) for (const s of t.surfaces) { if (!pick(s.kind)) continue; c.beginPath(); for (const r of s.rings) ringPath(r); c.fill('evenodd'); }
    };
    paint('#d9d9d9', (k) => k !== 'water' && k !== 'road');
    paint('#bdbdbd', (k) => k === 'road');
    paint('#9ec5e8', (k) => k === 'water');
    c.fillStyle = '#8d8d8d';
    for (const t of tiles) for (const b of t.buildings) { c.beginPath(); for (const r of b.rings) ringPath(r); c.fill('evenodd'); }
    // Mesure : pixels restés rouges, au total et par tuile (part de la surface de la tuile située dans l'emprise).
    const px0 = Math.max(0, Math.ceil(X(bb.minX))), px1 = Math.min(W, Math.floor(X(bb.maxX))), pz0 = Math.max(0, Math.ceil(Z(bb.minZ))), pz1 = Math.min(H, Math.floor(Z(bb.maxZ)));
    const data = c.getImageData(px0, pz0, px1 - px0, pz1 - pz0).data;
    const per = new Map();
    let red = 0, total = 0;
    for (let j = 0; j < pz1 - pz0; j++) {
      const tz = Math.floor((z0 + (pz0 + j + 0.5) / scale) / T);
      for (let i = 0; i < px1 - px0; i++) {
        const k = (j * (px1 - px0) + i) * 4;
        const isRed = data[k] > 200 && data[k + 1] < 100 && data[k + 2] < 100;
        const key = Math.floor((x0 + (px0 + i + 0.5) / scale) / T) + '_' + tz;
        let e = per.get(key);
        if (e === undefined) { e = [0, 0]; per.set(key, e); }
        e[1]++; total++;
        if (isRed) { e[0]++; red++; }
      }
    }
    const worst = [...per].map(([key, e]) => ({ tile: key, share: Math.round((e[0] / e[1]) * 1000) / 10, hectares: Math.round((e[0] / (scale * scale)) / 100) / 100 })).sort((a, b) => b.share - a.share);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1;
    for (let gx = Math.ceil(x0 / T) * T; gx <= x1; gx += T) { c.beginPath(); c.moveTo(X(gx), 0); c.lineTo(X(gx), H); c.stroke(); }
    for (let gz = Math.ceil(z0 / T) * T; gz <= z1; gz += T) { c.beginPath(); c.moveTo(0, Z(gz)); c.lineTo(W, Z(gz)); c.stroke(); }
    for (const w of worst) { const [tx, tz] = w.tile.split('_').map(Number); label(`${w.tile} : ${w.share} %`, Math.max(X(tx * T), X(bb.minX)) + 5, Math.max(Z(tz * T), Z(bb.minZ)) + 12, 12, '#000', 'left'); }
    const share = Math.round((red / total) * 10000) / 100;
    label(`${title} : ${share} % de l'emprise (${Math.round(red / (scale * scale) / 10000 * 10) / 10} ha sur ${Math.round(total / (scale * scale) / 10000)} ha) — le moteur y met du trottoir`, 12, 16, 16, '#000', 'left', 0, true);
    return { canvas: cv, info: { uncoveredShare: share, uncoveredHectares: Math.round(red / (scale * scale) / 10000 * 10) / 10, worstTiles: worst.slice(0, 8) } };
  }

  if (mode === 'relief') {
    // Altitude par pixel (interpolation bilinéaire), courbes de niveau tous les 2 m, maîtresses tous les 10 m.
    const img = c.createImageData(W, H);
    const STOPS = [[-8, [40, 90, 150]], [-4, [90, 150, 200]], [0, [170, 215, 170]], [5, [235, 235, 170]], [12, [240, 200, 130]], [20, [220, 150, 100]], [30, [180, 100, 80]], [40, [120, 60, 60]]];
    const sample = (x, z) => {
      let fx = (x - terrain.x0) / terrain.step, fz = (z - terrain.z0) / terrain.step;
      fx = Math.min(Math.max(fx, 0), terrain.nx - 1.001); fz = Math.min(Math.max(fz, 0), terrain.nz - 1.001);
      const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, i = iz * terrain.nx + ix;
      return terrain.h[i] * (1 - u) * (1 - v) + terrain.h[i + 1] * u * (1 - v) + terrain.h[i + terrain.nx] * (1 - u) * v + terrain.h[i + terrain.nx + 1] * u * v;
    };
    const hs = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hs[j * W + i] = sample(x0 + (i + 0.5) / scale, z0 + (j + 0.5) / scale);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const h = hs[j * W + i];
        let col = ramp(STOPS, h);
        const hr = i + 1 < W ? hs[j * W + i + 1] : h, hd = j + 1 < H ? hs[(j + 1) * W + i] : h;
        // Ombrage simple (lumière du nord-ouest) pour faire ressortir les pentes.
        const shade = Math.max(0.6, Math.min(1.25, 1 + ((h - hr) + (h - hd)) * scale * 0.6));
        col = col.map((v) => Math.max(0, Math.min(255, Math.round(v * shade))));
        const major = Math.floor(h / 10) !== Math.floor(hr / 10) || Math.floor(h / 10) !== Math.floor(hd / 10);
        const minor = Math.floor(h / 2) !== Math.floor(hr / 2) || Math.floor(h / 2) !== Math.floor(hd / 2);
        if (major) col = [60, 30, 20]; else if (minor) col = col.map((v) => Math.round(v * 0.72));
        const k = (j * W + i) * 4;
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    // Eau et monuments par-dessus, pour se repérer.
    c.strokeStyle = '#0b3d91'; c.lineWidth = 1.2; c.fillStyle = 'rgba(40,110,220,0.35)';
    for (const t of tiles) for (const s of t.surfaces) if (s.kind === 'water') { c.beginPath(); for (const r of s.rings) ringPath(r); c.fill('evenodd'); c.stroke(); }
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.6;
    for (const e of edges) if (e.cls === 'primary') { c.beginPath(); linePath(e.pts); c.stroke(); }
    for (const p of places) if (p.imp >= 3 && (p.kind === 'square' || p.kind === 'monument')) {
      const y = sample(p.x, p.z);
      c.fillStyle = '#000'; c.beginPath(); c.arc(X(p.x), Z(p.z), 2.5, 0, 7); c.fill();
      label(`${p.name} ${y.toFixed(1)} m`, X(p.x), Z(p.z) - 9, 11, '#000');
    }
    label(`${title} — niveau de l'eau ${manifest.waterLevel} m — altitudes de ${Math.min(...terrain.h).toFixed(1)} à ${Math.max(...terrain.h).toFixed(1)} m`, 12, 16, 15, '#000', 'left', 0, true);
    return { canvas: cv, info: {} };
  }

  // 1. Surfaces, dans l'ordre du fichier (qui est l'ordre de superposition).
  for (const t of viewTiles) {
    for (const s of t.surfaces) {
      c.beginPath();
      for (const r of s.rings) ringPath(r);
      c.fillStyle = SURFACE_COLORS[s.kind] ?? '#ff00ff';
      c.fill('evenodd');
      if (detail && s.kind !== 'water') { c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 0.5; c.stroke(); }
    }
  }
  // 1 bis. Tabliers de pont : les surfaces dures, là où elles recouvrent l'eau, repassent au-dessus (règle du moteur).
  {
    const deck = document.createElement('canvas');
    deck.width = W; deck.height = H;
    const d = deck.getContext('2d');
    let any = false;
    for (const t of viewTiles) {
      for (const s of t.surfaces) {
        if (!HARD.has(s.kind)) continue;
        d.beginPath();
        for (const r of s.rings) ringPath(r, d);
        d.fillStyle = SURFACE_COLORS[s.kind];
        d.fill('evenodd');
      }
    }
    // Masque : l'union des plans d'eau (contours antihoraires, trous horaires : règle « non nulle »).
    d.globalCompositeOperation = 'destination-in';
    d.beginPath();
    for (const t of viewTiles) for (const s of t.surfaces) if (s.kind === 'water') { any = true; for (const r of s.rings) ringPath(r, d); }
    d.fill('nonzero');
    if (any) c.drawImage(deck, 0, 0);
  }

  // 2. Graphe routier : emprise (chaussée + trottoirs) en voile bleu, chaussée à sa largeur réelle selon la classe.
  const order = ['footway', 'pedestrian', 'service', 'residential', 'tertiary', 'secondary', 'primary', 'motorway'];
  const visEdges = edges.filter((e) => lineInView(e.pts, 60));
  c.lineCap = 'butt'; c.lineJoin = 'round';
  if (detail) {
    c.strokeStyle = 'rgba(30,80,255,0.07)';
    for (const e of visEdges) {
      if (e.sw <= 0) continue;
      c.lineWidth = (e.w + 2 * e.sw) * scale;
      c.beginPath(); linePath(e.pts); c.stroke();
    }
  }
  for (const cls of order) {
    for (const e of visEdges) {
      if (e.cls !== cls) continue;
      c.globalAlpha = detail ? 0.55 : 0.9;
      c.strokeStyle = CLASS_COLORS[cls];
      c.lineWidth = Math.max(e.w * scale, detail ? 1 : 0.6);
      if (cls === 'footway') c.setLineDash(detail ? [6, 4] : [2, 2]); else c.setLineDash([]);
      c.beginPath(); linePath(e.pts); c.stroke();
      c.globalAlpha = 1; c.setLineDash([]);
      if (e.bridge || e.lm !== '') {
        // Pont : liseré sombre de part et d'autre du tablier ; ouvrage remplacé par un monument : magenta.
        c.strokeStyle = e.lm !== '' ? '#d500f9' : '#3e2723';
        c.lineWidth = detail ? 1.5 : 0.8;
        c.beginPath(); linePath(e.pts); c.stroke();
      }
    }
  }
  if (detail) {
    // Axe et sens de circulation.
    for (const e of visEdges) {
      if (e.cls === 'footway') continue;
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.6;
      c.beginPath(); linePath(e.pts); c.stroke();
      if (e.oneway) {
        const n = e.pts.length / 2, k = Math.max(0, Math.floor(n / 2) - 1);
        const ax = e.pts[2 * k], az = e.pts[2 * k + 1], bx = e.pts[2 * k + 2], bz = e.pts[2 * k + 3];
        const L = Math.hypot(bx - ax, bz - az);
        if (L > 6) {
          const mx = X((ax + bx) / 2), mz = Z((az + bz) / 2), ang = Math.atan2(bz - az, bx - ax);
          c.save(); c.translate(mx, mz); c.rotate(ang);
          c.fillStyle = 'rgba(0,0,0,0.55)';
          c.beginPath(); c.moveTo(5, 0); c.lineTo(-3, -3); c.lineTo(-3, 3); c.closePath(); c.fill();
          c.restore();
        }
      }
    }
    // Nœuds : feu (rouge), passage piéton (blanc cerclé), limite de carte (noir).
    for (const n of nodes) {
      if (!inView(n.x, n.z, 5) || n.flags === 0) continue;
      if (n.flags & 2) { c.fillStyle = '#fff'; c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.arc(X(n.x), Z(n.z), 2.6, 0, 7); c.fill(); c.stroke(); }
      if (n.flags & 1) { c.fillStyle = '#e53935'; c.beginPath(); c.arc(X(n.x), Z(n.z), 1.8, 0, 7); c.fill(); }
      if (n.flags & 4) { c.fillStyle = '#000'; c.fillRect(X(n.x) - 3, Z(n.z) - 3, 6, 6); }
    }
  }

  // 3. Barrières (gros plans).
  if (detail) {
    const BAR = { wall: ['#424242', 1.6, []], fence: ['#111', 1, [4, 3]], hedge: ['#2e7d32', 2, []], quay_wall: ['#0d47a1', 2.4, []], railing: ['#757575', 1, [2, 2]], gate: ['#ef6c00', 2.5, []] };
    for (const t of viewTiles) {
      for (const b of t.barriers) {
        if (!lineInView(b.pts, 5)) continue;
        const [col, lw, dash] = BAR[b.kind] ?? ['#f0f', 2, []];
        c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash);
        c.beginPath(); linePath(b.pts); c.stroke();
      }
    }
    c.setLineDash([]);
  }

  // 4. Bâtiments, teintés selon la hauteur ; ceux d'un monument sont cerclés de magenta.
  for (const t of viewTiles) {
    for (const b of t.buildings) {
      c.beginPath();
      for (const r of b.rings) ringPath(r);
      c.fillStyle = heightColor(b.h);
      c.fill('evenodd');
      if (b.lm !== '') { c.strokeStyle = '#d500f9'; c.lineWidth = detail ? 2 : 1.2; } else { c.strokeStyle = detail ? 'rgba(40,20,10,0.75)' : 'rgba(40,20,10,0.35)'; c.lineWidth = detail ? 0.8 : 0.35; }
      c.stroke();
    }
  }

  // 5. Arbres (rayon de couronne réel).
  c.fillStyle = detail ? 'rgba(27,120,40,0.50)' : 'rgba(27,120,40,0.75)';
  for (const t of viewTiles) {
    for (const a of t.trees) {
      if (!inView(a.x, a.z, 10)) continue;
      c.beginPath(); c.arc(X(a.x), Z(a.z), Math.max(a.r * scale, 0.7), 0, 7); c.fill();
    }
  }

  // 6. Mobilier, feux (gros plans).
  if (detail) {
    const FUR = { candelabre: '#fdd835', banc: '#6d4c41', poubelle: '#455a64', potelet: '#9e9e9e', abribus: '#1e88e5', kiosque: '#00897b', colonne_morris: '#2e7d32', statue: '#7b1fa2', station_velo: '#00acc1' };
    for (const t of viewTiles) {
      for (const f of t.furniture) {
        if (!inView(f.x, f.z, 3)) continue;
        c.fillStyle = FUR[f.kind] ?? '#b0a090';
        c.fillRect(X(f.x) - 1.5, Z(f.z) - 1.5, 3, 3);
        if (f.kind === 'candelabre') { c.strokeStyle = '#8d6e00'; c.lineWidth = 0.5; c.strokeRect(X(f.x) - 1.5, Z(f.z) - 1.5, 3, 3); }
      }
      for (const s of t.signals) {
        if (!inView(s.x, s.z, 3)) continue;
        c.strokeStyle = '#b71c1c'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(X(s.x), Z(s.z)); c.lineTo(X(s.x + Math.sin(s.a) * 2.5), Z(s.z + Math.cos(s.a) * 2.5)); c.stroke();
        c.fillStyle = '#b71c1c'; c.beginPath(); c.arc(X(s.x), Z(s.z), 1.6, 0, 7); c.fill();
      }
    }
  }

  // 7. Commerces : la vitrine (trait le long de la façade) et sa normale sortante (petit trait).
  for (const t of viewTiles) {
    for (const s of t.shops) {
      if (!inView(s.x, s.z, 10)) continue;
      c.fillStyle = c.strokeStyle = SHOP_COLORS[s.cat] ?? '#000';
      if (!detail) { c.fillRect(X(s.x) - 0.8, Z(s.z) - 0.8, 1.6, 1.6); continue; }
      const nx = Math.sin(s.a), nz = Math.cos(s.a), tx = nz, tz = -nx, hw = s.w / 2;
      c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(X(s.x - tx * hw), Z(s.z - tz * hw)); c.lineTo(X(s.x + tx * hw), Z(s.z + tz * hw)); c.stroke();
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(X(s.x), Z(s.z)); c.lineTo(X(s.x + nx * 2.5), Z(s.z + nz * 2.5)); c.stroke();
    }
  }

  // 8. Bouches de métro.
  for (const t of viewTiles) {
    for (const m of t.metro) {
      if (!inView(m.x, m.z, 10)) continue;
      const r = detail ? 6 : 2.2;
      c.fillStyle = '#0d47a1'; c.strokeStyle = '#fff'; c.lineWidth = detail ? 1.5 : 0.6;
      c.beginPath(); c.arc(X(m.x), Z(m.z), r, 0, 7); c.fill(); c.stroke();
      if (detail) {
        c.strokeStyle = '#0d47a1'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(X(m.x), Z(m.z)); c.lineTo(X(m.x + Math.sin(m.a) * 6), Z(m.z + Math.cos(m.a) * 6)); c.stroke();
        c.font = 'bold 9px sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', X(m.x), Z(m.z) + 0.5);
      }
    }
  }

  // 9. Monuments en surbrillance : emprise, point d'ancrage, cap de la façade principale.
  for (const lm of landmarks) {
    if (!lineInView(lm.ring, 20)) continue;
    c.beginPath(); ringPath(lm.ring);
    c.fillStyle = 'rgba(213,0,249,0.28)'; c.fill();
    c.strokeStyle = '#d500f9'; c.lineWidth = detail ? 2.5 : 1.5; c.stroke();
    if (detail) {
      c.strokeStyle = '#4a0072'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(X(lm.x) - 6, Z(lm.z)); c.lineTo(X(lm.x) + 6, Z(lm.z)); c.moveTo(X(lm.x), Z(lm.z) - 6); c.lineTo(X(lm.x), Z(lm.z) + 6); c.stroke();
      c.beginPath(); c.moveTo(X(lm.x), Z(lm.z)); c.lineTo(X(lm.x + Math.sin(lm.a) * 25), Z(lm.z + Math.cos(lm.a) * 25)); c.stroke();
      label(`${lm.key} (${lm.h} m)`, X(lm.x), Z(lm.z) - 14, 13, '#4a0072', 'center', 0, true);
    }
  }

  // 10. Grille des tuiles et emprise demandée.
  c.strokeStyle = detail ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)'; c.lineWidth = 1; c.setLineDash(detail ? [10, 6] : []);
  for (let gx = Math.ceil(x0 / T) * T; gx <= x1; gx += T) { c.beginPath(); c.moveTo(X(gx), 0); c.lineTo(X(gx), H); c.stroke(); }
  for (let gz = Math.ceil(z0 / T) * T; gz <= z1; gz += T) { c.beginPath(); c.moveTo(0, Z(gz)); c.lineTo(W, Z(gz)); c.stroke(); }
  c.setLineDash([]);
  for (let gx = Math.floor(x0 / T) * T; gx <= x1; gx += T) {
    for (let gz = Math.floor(z0 / T) * T; gz <= z1; gz += T) {
      const lx = Math.max(X(gx), 0) + 4, lz = Math.max(Z(gz), detail ? 30 : 22) + 9;
      label(`t_${gx / T}_${gz / T}`, lx, lz, detail ? 12 : 11, '#000', 'left');
    }
  }
  const bb = manifest.bounds;
  c.strokeStyle = '#1565c0'; c.lineWidth = 2; c.setLineDash([12, 6]);
  c.strokeRect(X(bb.minX), Z(bb.minZ), (bb.maxX - bb.minX) * scale, (bb.maxZ - bb.minZ) * scale);
  c.setLineDash([]);

  // 11. Noms : lieux majeurs (vue d'ensemble) ; voies et lieux (gros plans).
  if (!detail) {
    for (const p of places) {
      if (p.imp < 3 || !inView(p.x, p.z)) continue;
      if (p.kind === 'street' || p.kind === 'quay' || p.kind === 'district' || p.kind === 'station') continue;
      label(p.name.length > 34 ? p.name.slice(0, 32) + '…' : p.name, X(p.x), Z(p.z), 12, p.kind === 'bridge' ? '#0d47a1' : '#000', 'center', 0, true);
    }
  } else {
    // Chaque nom de voie une fois, le long de sa plus longue arête visible.
    const best = new Map();
    for (const e of visEdges) {
      if (e.name === '') continue;
      for (let i = 0; i + 3 < e.pts.length; i += 2) {
        const ax = e.pts[i], az = e.pts[i + 1], bx = e.pts[i + 2], bz = e.pts[i + 3];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (!inView(mx, mz, -30)) continue;
        const L = Math.hypot(bx - ax, bz - az), cur = best.get(e.name);
        if (cur === undefined || L > cur.L) best.set(e.name, { L, mx, mz, ang: Math.atan2(bz - az, bx - ax), cls: e.cls });
      }
    }
    for (const [name, b] of best) {
      let ang = b.ang;
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      const big = b.cls === 'primary' || b.cls === 'secondary';
      label(name, X(b.mx), Z(b.mz), big ? 13 : 11, '#1a237e', 'center', ang, big);
    }
    for (const p of places) {
      if (!inView(p.x, p.z) || p.kind === 'street' || p.kind === 'quay' || p.kind === 'bridge' || p.kind === 'district') continue;
      if (p.imp < 2 && p.kind !== 'station' && p.kind !== 'square') continue;
      const col = p.kind === 'station' ? '#0d47a1' : p.kind === 'square' ? '#b71c1c' : p.kind === 'garden' ? '#1b5e20' : '#000';
      label((p.kind === 'station' ? 'Ⓜ ' : '') + p.name, X(p.x), Z(p.z) + (p.kind === 'station' ? 14 : 0), p.imp >= 3 ? 15 : 12, col, 'center', 0, p.imp >= 3);
    }
  }

  // 12. Cartouche : titre, échelle, nord, légende.
  const barM = detail ? 100 : 500, bx0 = 16, by0 = H - 22;
  c.fillStyle = 'rgba(255,255,255,0.88)';
  c.fillRect(6, H - (detail ? 204 : 190), detail ? 500 : 560, detail ? 198 : 184);
  c.strokeStyle = '#000'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(bx0, by0); c.lineTo(bx0 + barM * scale, by0); c.stroke();
  label(`${barM} m — ${(1 / scale).toFixed(2)} m par pixel — nord en haut`, bx0, by0 - 12, 12, '#000', 'left');
  let ly = H - (detail ? 190 : 176);
  label('Hauteur des bâtiments (m)', bx0, ly, 12, '#000', 'left', 0, true);
  ly += 16;
  for (let i = 0; i < 200; i++) { c.fillStyle = heightColor((i / 200) * 60); c.fillRect(bx0 + i * 1.5, ly - 6, 1.6, 12); }
  for (const v of [0, 10, 20, 30, 45, 60]) label(String(v), bx0 + (v / 60) * 300, ly + 14, 10, '#000');
  ly += 34;
  label('Voies (largeur de chaussée réelle)', bx0, ly, 12, '#000', 'left', 0, true);
  ly += 16;
  let lx = bx0;
  for (const cls of ['primary', 'secondary', 'tertiary', 'residential', 'service', 'pedestrian', 'footway']) {
    c.fillStyle = CLASS_COLORS[cls]; c.fillRect(lx, ly - 5, 16, 10); c.strokeStyle = '#555'; c.lineWidth = 0.5; c.strokeRect(lx, ly - 5, 16, 10);
    label(cls, lx + 19, ly, 10, '#000', 'left');
    lx += 19 + c.measureText(cls).width + 12;
  }
  ly += 20;
  lx = bx0;
  for (const [txt, col] of [['eau', SURFACE_COLORS.water], ['parc', SURFACE_COLORS.park], ['pelouse', SURFACE_COLORS.grass], ['place', SURFACE_COLORS.plaza], ['trottoir', SURFACE_COLORS.sidewalk], ['chaussée', SURFACE_COLORS.road], ['monument', 'rgba(213,0,249,0.5)'], ['tuile absente', '#f4b6c2']]) {
    c.fillStyle = col; c.fillRect(lx, ly - 5, 16, 10); c.strokeStyle = '#555'; c.lineWidth = 0.5; c.strokeRect(lx, ly - 5, 16, 10);
    label(txt, lx + 19, ly, 10, '#000', 'left');
    lx += 19 + c.measureText(txt).width + 10;
  }
  ly += 16;
  label('Hachures rouges = aucune surface fournie (le moteur y met du trottoir) ; tablier de pont = surface dure au-dessus de l\'eau', bx0, ly, 10, '#000', 'left');
  ly += 16;
  label(detail ? 'Trait de couleur sur une façade = vitrine (le petit trait sort du bâtiment) ; Ⓜ = bouche de métro ; ● rouge = feu' : 'Points de couleur = commerces ; points bleus = bouches de métro ; tirets bleus = emprise demandée', bx0, ly, 10, '#000', 'left');
  label(title, 12, 16, detail ? 18 : 16, '#000', 'left', 0, true);
  return { canvas: cv, info: {} };
}

/**
 * Dessine une vue et la réduit à 256 couleurs (coupe médiane sur un histogramme à 5 bits par
 * composante). Retourne { width, height, palette, indices (base64), info }.
 */
function pageRenderIndexed(view) {
  const { canvas, info } = window.pageRender(view);
  const W = canvas.width, H = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const n = W * H;
  const hist = new Uint32Array(32768);
  for (let i = 0; i < n; i++) hist[((data[4 * i] >> 3) << 10) | ((data[4 * i + 1] >> 3) << 5) | (data[4 * i + 2] >> 3)]++;
  const used = [];
  for (let b = 0; b < 32768; b++) if (hist[b] > 0) used.push(b);
  const comp = (b, k) => (b >> (10 - 5 * k)) & 31;
  let boxes = [used];
  while (boxes.length < 256) {
    // Boîte à couper : la plus étendue (étendue × population).
    let pick = -1, score = 0, axis = 0;
    for (let q = 0; q < boxes.length; q++) {
      const box = boxes[q];
      if (box.length < 2) continue;
      let pop = 0;
      const lo = [31, 31, 31], hi = [0, 0, 0];
      for (const b of box) { pop += hist[b]; for (let k = 0; k < 3; k++) { const v = comp(b, k); if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; } }
      let a = 0;
      for (let k = 1; k < 3; k++) if (hi[k] - lo[k] > hi[a] - lo[a]) a = k;
      const sc = (hi[a] - lo[a] + 1) * Math.sqrt(pop);
      if (sc > score) { score = sc; pick = q; axis = a; }
    }
    if (pick < 0) break;
    const box = boxes[pick].slice().sort((u, v) => comp(u, axis) - comp(v, axis));
    let pop = 0;
    for (const b of box) pop += hist[b];
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length - 1; i++) { acc += hist[box[i]]; if (acc >= pop / 2) { cut = i + 1; break; } cut = i + 1; }
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut));
  }
  const palette = [];
  const lut = new Uint8Array(32768);
  boxes.forEach((box, q) => {
    let pop = 0, r = 0, g = 0, bl = 0;
    for (const b of box) { const w = hist[b]; pop += w; r += (comp(b, 0) * 8 + 4) * w; g += (comp(b, 1) * 8 + 4) * w; bl += (comp(b, 2) * 8 + 4) * w; lut[b] = q; }
    palette.push(Math.round(r / pop), Math.round(g / pop), Math.round(bl / pop));
  });
  const idx = new Uint8Array(n);
  for (let i = 0; i < n; i++) idx[i] = lut[((data[4 * i] >> 3) << 10) | ((data[4 * i + 1] >> 3) << 5) | (data[4 * i + 2] >> 3)];
  let bin = '';
  for (let i = 0; i < n; i += 32768) bin += String.fromCharCode.apply(null, idx.subarray(i, Math.min(n, i + 32768)));
  return { width: W, height: H, palette, indices: btoa(bin), info };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Côté Node
// ─────────────────────────────────────────────────────────────────────────────────────

/** Écrit un PNG en couleurs indexées (8 bits, palette de 256 couleurs au plus). */
function writeIndexedPng(file, width, height, palette, indices) {
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) indices.copy(rows, y * (width + 1) + 1, y * width, (y + 1) * width);
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(palette)), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

function parseArgs(argv) {
  const opt = { out: IMG, boxes: [], only: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--out') opt.out = path.resolve(argv[++i]);
    else if (argv[i] === '--only') opt.only = argv[++i].split(',');
    else if (argv[i] === '--box') {
      const [name, box, scale] = argv[++i].split(':');
      const [x0, z0, x1, z1] = box.split(',').map(Number);
      if (![x0, z0, x1, z1].every(Number.isFinite) || x1 <= x0 || z1 <= z0) throw new Error(`--box invalide : ${argv[i]}`);
      opt.boxes.push({ name, title: name, x0, z0, x1, z1, scale: scale ? Number(scale) : 2, mode: 'detail' });
    } else throw new Error(`option inconnue : ${argv[i]}`);
  }
  return opt;
}

async function main() {
  const opt = parseArgs(process.argv);
  if (!fs.existsSync(path.join(DATA, 'manifest.json'))) throw new Error(`données de carte absentes : ${DATA} (lancer node tools/map/build.mjs)`);
  let views = opt.boxes.length > 0 ? opt.boxes : VIEWS;
  if (opt.only !== null) views = views.filter((v) => opt.only.some((o) => v.name === o || v.name === 'map-' + o));
  fs.mkdirSync(opt.out, { recursive: true });

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // Toutes les requêtes de la page sont servies depuis le disque : rien ne sort de la machine.
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>render-check</title>' });
      if (url.pathname.startsWith('/data/')) {
        const file = path.join(DATA, decodeURIComponent(url.pathname.slice('/data/'.length)));
        if (file.startsWith(DATA) && fs.existsSync(file)) return route.fulfill({ contentType: 'application/json', body: fs.readFileSync(file) });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('http://render-check.invalid/');
    const t0 = Date.now();
    const summary = await page.evaluate(pageLoad);
    console.log(`Carte lue et décodée dans la page en ${Date.now() - t0} ms : ${JSON.stringify(summary)}`);
    await page.evaluate(`window.pageRender = ${pageRender.toString()}`);
    for (const view of views) {
      const t = Date.now();
      const out = await page.evaluate(pageRenderIndexed, view);
      const file = path.join(opt.out, view.name + '.png');
      writeIndexedPng(file, out.width, out.height, out.palette, Buffer.from(out.indices, 'base64'));
      const info = Object.keys(out.info).length > 0 ? ' — ' + JSON.stringify(out.info) : '';
      console.log(`  ${path.relative(process.cwd(), file)} : ${out.width} × ${out.height} px, ${(fs.statSync(file).size / 1024).toFixed(0)} ko, ${Date.now() - t} ms — x ${view.x0}…${view.x1}, z ${view.z0}…${view.z1}${info}`);
    }
    if (errors.length > 0) throw new Error('erreurs dans la page : ' + errors.join(' | '));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('ÉCHEC du rendu de contrôle : ' + (err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
