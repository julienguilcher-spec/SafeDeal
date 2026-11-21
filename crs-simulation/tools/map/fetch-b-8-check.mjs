// fetch-b-8-check.mjs — contrôles de cohérence des couches de détail (lot B).
//   node tools/map/fetch-b-8-check.mjs [--preview]
// Vérifie : présence et schéma de chaque couche, coordonnées dans l'emprise, doublons, couverture par tuile de 512 m,
// couverture commerciale des grands axes, monuments (40 clés, polygones valides, sourceIds existants), relief (dimensions,
// altitudes plausibles). Écrit raw/b/check-b.json ; code de sortie 1 si un contrôle bloquant échoue.
// --preview : écrit aussi raw/b/preview-b.svg (plan d'ensemble des couches, pour un contrôle visuel).

import fs from 'node:fs';
import path from 'node:path';
import { RAW_B, NORM, STATUS_DIR, TEST_OUT, BBOX, BBOX_M, inBox, toM, toX, toZ, readJson, PointGrid, ringArea, tally, distPointSeg } from './lib-b.mjs';

const failures = [], warnings = [];
const fail = (m) => { failures.push(m); console.error('  ÉCHEC : ' + m); };
const warn = (m) => { warnings.push(m); console.log('  attention : ' + m); };
const report = { generated: new Date().toISOString(), layers: {} };

const FURNITURE_KINDS = ['lamp', 'bench', 'bin', 'bus_shelter', 'kiosk', 'morris_column', 'wallace_fountain', 'bollard', 'phone', 'toilet', 'velib', 'advert_panel', 'fountain', 'statue', 'newsstand', 'flagpole'];
const LANDMARK_KEYS = ['arc_triomphe', 'tour_eiffel', 'obelisque_concorde', 'fontaines_concorde', 'louvre', 'pyramide_louvre', 'arc_carrousel', 'notre_dame', 'sainte_chapelle', 'conciergerie', 'opera_garnier', 'invalides',
  'grand_palais', 'petit_palais', 'pont_alexandre_iii', 'madeleine', 'palais_bourbon', 'hotel_de_ville', 'colonne_vendome', 'colonne_juillet', 'opera_bastille', 'statue_republique', 'palais_chaillot', 'ecole_militaire',
  'centre_pompidou', 'tour_saint_jacques', 'palais_royal', 'bourse_commerce', 'palais_elysee', 'hotel_marine', 'hotel_crillon', 'saint_eustache', 'saint_sulpice', 'pont_neuf', 'institut_de_france', 'musee_orsay',
  'gare_saint_lazare', 'prefecture_police', 'palais_justice', 'hotel_matignon'];
const numOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
const strOrNull = (v) => v === null || typeof v === 'string';

/** Schéma de chaque couche ponctuelle : nom → { min (nombre d'objets attendu au moins), props(p) → message d'erreur ou null }. */
const POINT_LAYERS = {
  trees: { min: 20000, dupKey: () => 'tree', dupM: 0.9,
    props: (p) => (!numOrNull(p.height) ? 'height' : !numOrNull(p.crown) ? 'crown' : p.height != null && (p.height < 1 || p.height > 45) ? 'height hors bornes' : p.crown != null && (p.crown < 1 || p.crown > 30) ? 'crown hors bornes' : null) },
  furniture: { min: 8000, dupKey: (p) => p.kind, dupM: 0.25,
    props: (p) => (!FURNITURE_KINDS.includes(p.kind) ? 'kind ' + p.kind : !numOrNull(p.heading) ? 'heading' : p.heading != null && (p.heading < 0 || p.heading >= 360) ? 'heading hors [0, 360[' : null) },
  shops: { min: 10000, dupKey: null,
    props: (p) => (typeof p.category !== 'string' || !p.category ? 'category' : !strOrNull(p.name) ? 'name' : null) },
  signals: { min: 5000, dupKey: (p) => p.kind + ':' + (p.sub || ''), dupM: 0.25,
    props: (p) => (!['traffic_signals', 'crossing'].includes(p.kind) ? 'kind ' + p.kind : null) },
  metro: { min: 150, dupKey: (p) => p.kind, dupM: 0.5,
    props: (p) => (!['entrance', 'station'].includes(p.kind) ? 'kind ' + p.kind : !strOrNull(p.name) ? 'name' : !Array.isArray(p.lines) ? 'lines' : null) },
};

// ── États des scripts : une couche produite en mode dégradé (source en panne, repli) est refusée.
report.degraded = {};
for (const s of ['trees', 'landmarks', 'furniture', 'shops', 'signals-metro', 'terrain']) {
  const f = path.join(STATUS_DIR, s + '.json');
  if (!fs.existsSync(f)) { warn(`état du script ${s} introuvable (script jamais lancé ?)`); continue; }
  const st = readJson(f);
  if (st.degraded.length) { report.degraded[s] = st.degraded; fail(`${s} : produit en mode dégradé — ${st.degraded.join(' ; ')}`); }
}

const layers = {};
const TILE = 512;
const tx0 = Math.floor(toX(BBOX.west) / TILE), tx1 = Math.floor(toX(BBOX.east) / TILE), tz0 = Math.floor(toZ(BBOX.north) / TILE), tz1 = Math.floor(toZ(BBOX.south) / TILE);
function tileCounts(feats, filter = null) {
  const m = new Map();
  for (const f of feats) { if (filter && !filter(f)) continue; const [lon, lat] = f.geometry.coordinates; const k = Math.floor(toX(lon) / TILE) + ',' + Math.floor(toZ(lat) / TILE); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
function tileSummary(m) {
  let empty = 0, total = 0; const rows = [];
  for (let tz = tz0; tz <= tz1; tz++) { let row = ''; for (let tx = tx0; tx <= tx1; tx++) { const n = m.get(tx + ',' + tz) || 0; total++; if (!n) empty++; row += n === 0 ? '.' : n < 10 ? '1' : n < 50 ? '2' : n < 200 ? '3' : n < 800 ? '4' : '5'; } rows.push(row); }
  return { tiles: total, empty, map: rows };
}

for (const [name, spec] of Object.entries(POINT_LAYERS)) {
  const file = path.join(NORM, name + '.geojson');
  console.log(`\n── ${name}`);
  if (!fs.existsSync(file)) { fail(`${name}.geojson absent`); continue; }
  const j = readJson(file);
  if (j.type !== 'FeatureCollection' || !Array.isArray(j.features)) { fail(`${name} : pas une FeatureCollection`); continue; }
  const feats = j.features; layers[name] = feats;
  let schema = 0, outside = 0, bad = 0, firstErr = null;
  for (const f of feats) {
    const g = f.geometry;
    if (f.type !== 'Feature' || !g || g.type !== 'Point' || !Array.isArray(g.coordinates) || !Number.isFinite(g.coordinates[0]) || !Number.isFinite(g.coordinates[1])) { bad++; continue; }
    if (!inBox(g.coordinates[0], g.coordinates[1])) outside++;
    const e = spec.props(f.properties || {}); if (e) { schema++; firstErr ||= e + ' → ' + JSON.stringify(f.properties).slice(0, 160); }
  }
  // doublons : même position exacte, puis quasi-doublons de même nature
  let exact = 0, close = 0;
  if (spec.dupKey) {
    const seen = new Set(); const grids = new Map();
    for (const f of feats) {
      const k = spec.dupKey(f.properties); const c = f.geometry.coordinates;
      const ek = k + '|' + c[0] + ',' + c[1]; if (seen.has(ek)) exact++; seen.add(ek);
      let g = grids.get(k); if (!g) grids.set(k, (g = new PointGrid(5)));
      const [x, y] = toM(c); if (g.nearest(x, y, spec.dupM)) close++; g.add(x, y, 1);
    }
  }
  const ts = tileSummary(tileCounts(feats));
  const bytes = fs.statSync(file).size;
  report.layers[name] = { count: feats.length, bytes, schemaErrors: schema, badGeometry: bad, outside, exactDuplicates: exact, nearDuplicates: close, emptyTiles: ts.empty, tiles: ts.tiles };
  console.log(`  ${feats.length} objets, ${(bytes / 1e6).toFixed(2)} Mo ; schéma ${schema} erreur(s), géométrie ${bad}, hors emprise ${outside}, doublons exacts ${exact}, quasi-doublons ${close}, tuiles vides ${ts.empty}/${ts.tiles}`);
  if (feats.length < spec.min) fail(`${name} : ${feats.length} objets, moins que le minimum attendu (${spec.min})`);
  if (schema) fail(`${name} : ${schema} objets hors schéma (ex. ${firstErr})`);
  if (bad) fail(`${name} : ${bad} géométries invalides`);
  if (outside) fail(`${name} : ${outside} objets hors de l'emprise (+ 60 m)`);
  if (exact) fail(`${name} : ${exact} doublons exacts`);
  if (close > feats.length * 0.01) warn(`${name} : ${close} quasi-doublons (moins de ${spec.dupM} m, même nature)`);
}

// ── Détail par nature et couverture
if (layers.furniture) {
  const kinds = tally(layers.furniture, (f) => f.properties.kind);
  report.layers.furniture.kinds = kinds;
  console.log('\n── furniture : natures', JSON.stringify(kinds));
  const missing = FURNITURE_KINDS.filter((k) => !kinds[k]);
  if (missing.length) warn(`furniture : aucune occurrence pour ${missing.join(', ')}`);
  const lampTiles = tileSummary(tileCounts(layers.furniture, (f) => f.properties.kind === 'lamp'));
  report.layers.furniture.lampTiles = lampTiles;
  console.log(`  lampadaires par tuile de 512 m (. = 0, 1 < 10, 2 < 50, 3 < 200, 4 < 800) — ${lampTiles.empty} tuiles sans lampadaire sur ${lampTiles.tiles} :`);
  for (const r of lampTiles.map) console.log('    ' + r);
  if (lampTiles.empty > lampTiles.tiles * 0.25) warn(`furniture : lampadaires absents de ${lampTiles.empty} tuiles sur ${lampTiles.tiles} (OpenStreetMap partiel)`);
}
if (layers.trees) { const t = tileSummary(tileCounts(layers.trees)); console.log('\n── trees : densité par tuile'); for (const r of t.map) console.log('    ' + r); }
if (layers.shops) {
  const feats = layers.shops;
  const groups = tally(feats, (f) => f.properties.group); report.layers.shops.groups = groups;
  const t = tileSummary(tileCounts(feats)); console.log('\n── shops : densité par tuile'); for (const r of t.map) console.log('    ' + r);
  // Couverture des grands axes commerçants : commerces à moins de `w` m de la polyligne (lon, lat).
  const AXES = {
    'Champs-Élysées (Étoile → Concorde)': { w: 60, min: 150, line: [[2.2958, 48.8734], [2.3075, 48.8698], [2.3194, 48.8662]] },
    'Rue de Rivoli (Concorde → Saint-Paul)': { w: 40, min: 250, line: [[2.3225, 48.8660], [2.3323, 48.8635], [2.3420, 48.8604], [2.3522, 48.8572], [2.3610, 48.8554]] },
    'Grands Boulevards (Madeleine → République)': { w: 50, min: 400, line: [[2.3256, 48.8700], [2.3320, 48.8707], [2.3390, 48.8716], [2.3437, 48.8713], [2.3484, 48.8706], [2.3541, 48.8692], [2.3572, 48.8687], [2.3632, 48.8677]] },
    'Boulevard Saint-Germain (Assemblée → Maubert)': { w: 50, min: 250, line: [[2.3200, 48.8605], [2.3242, 48.8574], [2.3300, 48.8545], [2.3335, 48.8537], [2.3390, 48.8527], [2.3440, 48.8512], [2.3490, 48.8502]] },
  };
  const ZONES = { 'Marais': { min: 1500, box: [2.3520, 48.8530, 2.3680, 48.8640] }, 'Châtelet – Les Halles': { min: 600, box: [2.3420, 48.8570, 2.3520, 48.8650] }, 'Saint-Germain-des-Prés': { min: 500, box: [2.3280, 48.8510, 2.3400, 48.8570] } };
  report.layers.shops.axes = {};
  console.log('  couverture commerciale :');
  for (const [name, a] of Object.entries(AXES)) {
    const line = a.line.map(toM); let n = 0;
    for (const f of feats) { const [x, y] = toM(f.geometry.coordinates); for (let i = 1; i < line.length; i++) if (distPointSeg(x, y, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]) <= a.w) { n++; break; } }
    let len = 0; for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    report.layers.shops.axes[name] = { count: n, lengthM: Math.round(len), per100m: +(n / len * 100).toFixed(1) };
    console.log(`    ${name.padEnd(48)} ${String(n).padStart(5)} locaux sur ${Math.round(len)} m (${(n / len * 100).toFixed(1)} / 100 m)`);
    if (n < a.min) fail(`shops : ${name} — ${n} locaux, moins que ${a.min}`);
  }
  for (const [name, z] of Object.entries(ZONES)) {
    const n = feats.filter((f) => { const [lo, la] = f.geometry.coordinates; return lo >= z.box[0] && lo <= z.box[2] && la >= z.box[1] && la <= z.box[3]; }).length;
    report.layers.shops.axes[name] = { count: n };
    console.log(`    ${name.padEnd(48)} ${String(n).padStart(5)} locaux`);
    if (n < z.min) fail(`shops : ${name} — ${n} locaux, moins que ${z.min}`);
  }
  // La nomenclature ne doit plus citer d'enseigne.
  const brandish = [...new Set(feats.map((f) => f.properties.category))].filter((c) => /monoprix|acadomia|citadines|franprix|carrefour|appart hotel/i.test(c));
  if (brandish.length) fail('shops : catégories citant une enseigne → ' + brandish.join(' ; '));
  report.layers.shops.withName = feats.filter((f) => f.properties.name).length;
}
if (layers.signals) report.layers.signals.kinds = tally(layers.signals, (f) => f.properties.kind + (f.properties.sub ? ':' + f.properties.sub : ''));
if (layers.metro) {
  const st = layers.metro.filter((f) => f.properties.kind === 'station'), en = layers.metro.filter((f) => f.properties.kind === 'entrance');
  report.layers.metro.stations = st.length; report.layers.metro.entrances = en.length;
  const noName = en.filter((f) => !f.properties.name).length, noLines = layers.metro.filter((f) => !f.properties.lines.length).length;
  console.log(`\n── metro : ${st.length} stations, ${en.length} bouches ; bouches sans station ${noName}, objets sans ligne ${noLines}`);
  if (st.length < 70) fail(`metro : ${st.length} stations seulement`);
  if (noName) warn(`metro : ${noName} bouches sans station`);
  for (const must of ['Concorde', 'Opéra', 'République', 'Bastille', 'Châtelet', 'Invalides', 'Trocadéro', 'Hôtel de Ville']) if (!st.some((f) => f.properties.name === must)) fail(`metro : station ${must} absente`);
}

// ── landmarks
console.log('\n── landmarks');
{
  const file = path.join(NORM, 'landmarks.geojson');
  if (!fs.existsSync(file)) fail('landmarks.geojson absent');
  else {
    const feats = readJson(file).features;
    const keys = new Set(feats.map((f) => f.properties.key));
    const missing = LANDMARK_KEYS.filter((k) => !keys.has(k)), extra = [...keys].filter((k) => !LANDMARK_KEYS.includes(k));
    let badGeom = 0, noHeight = [], outside = [];
    for (const f of feats) {
      const g = f.geometry, p = f.properties;
      const okRing = (r) => Array.isArray(r) && r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
      if (!g || g.type !== 'Polygon' || !g.coordinates.every(okRing) || !(ringArea(g.coordinates[0].map(toM)) > 1)) badGeom++; // > 0 : anneau extérieur antihoraire
      if (typeof p.key !== 'string' || typeof p.name !== 'string' || !numOrNull(p.height) || !Array.isArray(p.sourceIds)) fail(`landmarks : propriétés invalides pour ${p.key}`);
      if (p.height == null && !noHeight.includes(p.key)) noHeight.push(p.key);
      if (g.coordinates[0].some(([lo, la]) => !inBox(lo, la)) && !outside.includes(p.key)) outside.push(p.key);
    }
    // les sourceIds doivent exister dans la couche buildings du lot A
    let unknown = 0, checked = 0;
    const bFile = path.join(NORM, 'buildings.geojson');
    if (fs.existsSync(bFile)) {
      const ids = new Set(readJson(bFile).features.map((f) => f.properties.id));
      for (const f of feats) for (const id of f.properties.sourceIds) { checked++; if (!ids.has(id)) unknown++; }
    } else warn('landmarks : buildings.geojson absent, sourceIds non vérifiés');
    const multi = Object.entries(tally(feats, (f) => f.properties.key)).filter(([, n]) => n > 1).map(([k, n]) => `${k} × ${n}`);
    report.layers.landmarks = { polygons: feats.length, keys: keys.size, missing, extra, badGeometry: badGeom, withoutHeight: noHeight, beyondBox: outside, sourceIdsChecked: checked, sourceIdsUnknown: unknown, multiPart: multi, bytes: fs.statSync(file).size };
    console.log(`  ${feats.length} polygones, ${keys.size} clés sur ${LANDMARK_KEYS.length} ; en plusieurs morceaux : ${multi.join(', ') || '—'} ; sans hauteur : ${noHeight.join(', ') || '—'} ; débordant de l'emprise : ${outside.join(', ') || '—'}`);
    console.log(`  sourceIds : ${checked} identifiants vérifiés dans buildings.geojson, ${unknown} inconnus`);
    if (missing.length) fail('landmarks : clés manquantes → ' + missing.join(', '));
    if (extra.length) warn('landmarks : clés inattendues → ' + extra.join(', '));
    if (badGeom) fail(`landmarks : ${badGeom} polygones invalides`);
    if (unknown) fail(`landmarks : ${unknown} sourceIds absents de buildings.geojson (couche du lot A régénérée ? relancer fetch-b-3-landmarks.mjs)`);
    layers.landmarks = feats;
  }
}

// ── terrain
console.log('\n── terrain');
{
  const file = path.join(NORM, 'terrain.json');
  if (!fs.existsSync(file)) fail('terrain.json absent');
  else {
    const t = readJson(file);
    const okDims = Number.isInteger(t.nx) && Number.isInteger(t.nz) && Array.isArray(t.heights) && t.heights.length === t.nx * t.nz;
    if (!okDims) fail('terrain : dimensions incohérentes');
    if (!Number.isFinite(t.lon0) || !Number.isFinite(t.lat0) || !Number.isFinite(t.cellM)) fail('terrain : lon0 / lat0 / cellM manquants');
    if (t.heights.some((v) => !Number.isFinite(v))) fail('terrain : altitudes non numériques');
    // la grille doit couvrir l'emprise + 300 m
    const cover = t.x0 <= toX(BBOX.west) - 300 && t.x0 + (t.nx - 1) * t.cellM >= toX(BBOX.east) + 300 && t.z0 <= toZ(BBOX.north) - 300 && t.z0 + (t.nz - 1) * t.cellM >= toZ(BBOX.south) + 300;
    if (!cover) fail('terrain : la grille ne couvre pas l\'emprise + 300 m');
    const h = (lon, lat) => { const fx = (toX(lon) - t.x0) / t.cellM, fz = (toZ(lat) - t.z0) / t.cellM; const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz; const g = (i, k) => t.heights[k * t.nx + i]; return (g(ix, iz) * (1 - ax) + g(ix + 1, iz) * ax) * (1 - az) + (g(ix, iz + 1) * (1 - ax) + g(ix + 1, iz + 1) * ax) * az; };
    const spots = {
      'Concorde (obélisque)': [2.321236, 48.865633, 30, 37], 'Étoile (Arc de Triomphe)': [2.295028, 48.873792, 54, 62], 'Trocadéro (parvis)': [2.2885, 48.8625, 52, 66],
      'République': [2.3638, 48.8675, 33, 41], 'Bastille': [2.3692, 48.8532, 33, 42], 'Opéra': [2.3320, 48.8703, 32, 40], 'Champ-de-Mars': [2.2976, 48.8556, 31, 38],
      'Seine sous le pont de la Concorde': [2.3193, 48.8635, 24, 29], 'Seine au Pont Neuf': [2.3415, 48.8578, 24, 29], 'Seine au pont d\'Iéna': [2.2925, 48.8597, 24, 29],
    };
    const got = {};
    for (const [name, [lon, lat, lo, hi]] of Object.entries(spots)) {
      const v = h(lon, lat); got[name] = +v.toFixed(1);
      console.log(`  ${name.padEnd(36)} ${v.toFixed(1)} m (attendu ${lo}–${hi})`);
      if (!t.flat && (v < lo || v > hi)) fail(`terrain : ${name} à ${v.toFixed(1)} m, hors de ${lo}–${hi} m`);
    }
    if (!t.flat) {
      // les quais et le fleuve doivent être plus bas que les places voisines
      if (!(got['Seine sous le pont de la Concorde'] < got['Concorde (obélisque)'] - 3)) fail('terrain : la Seine n\'est pas plus basse que la place de la Concorde');
      if (!(got['Seine au pont d\'Iéna'] < got['Trocadéro (parvis)'] - 20)) fail('terrain : le Trocadéro ne domine pas la Seine');
    } else fail('terrain : RELIEF PLAT (le service d\'altimétrie n\'a pas répondu)');
    let steps = 0; for (let k = 0; k < t.nz; k++) for (let i = 0; i + 1 < t.nx; i++) if (Math.abs(t.heights[k * t.nx + i] - t.heights[k * t.nx + i + 1]) > 4) steps++;
    report.layers.terrain = { nx: t.nx, nz: t.nz, cellM: t.cellM, points: t.heights.length, min: t.min, max: t.max, flat: !!t.flat, missingFilled: t.missingFilled, stepsOver4m: steps, spots: got, bytes: fs.statSync(file).size };
    console.log(`  grille ${t.nx} × ${t.nz}, pas ${t.cellM} m, ${t.min}–${t.max} m, plat = ${!!t.flat}, ${steps} ressauts de plus de 4 m entre voisins (tranchées, quais, talus)`);
  }
}

// ── Aperçu SVG
if (process.argv.includes('--preview')) {
  const W = 2200, sx = W / (toX(BBOX_M.east) - toX(BBOX_M.west)), H = Math.round((toZ(BBOX_M.south) - toZ(BBOX_M.north)) * sx);
  const X = (lon) => ((toX(lon) - toX(BBOX_M.west)) * sx).toFixed(1), Y = (lat) => ((toZ(lat) - toZ(BBOX_M.north)) * sx).toFixed(1);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#f4f1ea"/>`];
  const tfile = path.join(NORM, 'terrain.json');
  if (fs.existsSync(tfile)) { // relief en fond (teintes hypsométriques)
    const t = readJson(tfile); const c = t.cellM * sx;
    for (let k = 0; k < t.nz; k++) for (let i = 0; i < t.nx; i++) {
      const v = t.heights[k * t.nx + i]; const u = Math.max(0, Math.min(1, (v - 25) / 40));
      const col = v < 27.3 ? '#a9c8e6' : `rgb(${Math.round(236 - 70 * u)},${Math.round(240 - 95 * u)},${Math.round(214 - 110 * u)})`;
      const px = (t.x0 + i * t.cellM - toX(BBOX_M.west)) * sx - c / 2, py = (t.z0 + k * t.cellM - toZ(BBOX_M.north)) * sx - c / 2;
      if (px > -c && py > -c && px < W && py < H) out.push(`<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(c + 0.3).toFixed(1)}" height="${(c + 0.3).toFixed(1)}" fill="${col}"/>`);
    }
  }
  const dots = (feats, color, r, filter = null) => { const d = []; for (const f of feats || []) { if (filter && !filter(f)) continue; const [lo, la] = f.geometry.coordinates; d.push(`M${X(lo)} ${Y(la)}h0`); } out.push(`<path d="${d.join('')}" stroke="${color}" stroke-width="${r}" stroke-linecap="round" fill="none"/>`); };
  dots(layers.trees, '#2e8b3a', 2.2);
  dots(layers.shops, '#c2185b', 1.8);
  dots(layers.furniture, '#f5a000', 1.6, (f) => f.properties.kind === 'lamp');
  dots(layers.furniture, '#6d4c41', 1.6, (f) => f.properties.kind !== 'lamp');
  dots(layers.signals, '#d50000', 2, (f) => f.properties.sub === 'pole');
  dots(layers.signals, '#555', 1.4, (f) => f.properties.kind === 'crossing');
  for (const f of layers.landmarks || []) {
    out.push(`<path d="${f.geometry.coordinates.map((r) => 'M' + r.map(([lo, la]) => X(lo) + ' ' + Y(la)).join('L') + 'Z').join('')}" fill="#1a237e" fill-opacity="0.75" stroke="#000" stroke-width="0.6" fill-rule="evenodd"/>`);
    const c = f.properties.center; if (f.properties.part == null || f.properties.part === 1 || f.properties.part === 'nord') out.push(`<text x="${X(c[0])}" y="${(+Y(c[1]) - 6).toFixed(1)}" font-size="11" font-family="sans-serif" text-anchor="middle" fill="#000" stroke="#fff" stroke-width="2.5" paint-order="stroke">${f.properties.key}</text>`);
  }
  dots(layers.metro, '#0d47a1', 5, (f) => f.properties.kind === 'entrance');
  dots(layers.metro, '#00e5ff', 8, (f) => f.properties.kind === 'station');
  out.push(`<rect x="${X(BBOX.west)}" y="${Y(BBOX.north)}" width="${(+X(BBOX.east) - +X(BBOX.west)).toFixed(1)}" height="${(+Y(BBOX.south) - +Y(BBOX.north)).toFixed(1)}" fill="none" stroke="#000" stroke-dasharray="6 4"/>`);
  out.push('</svg>');
  const pf = path.join(TEST_OUT || RAW_B, 'preview-b.svg'); fs.writeFileSync(pf, out.join('\n'));
  console.log(`\naperçu : ${pf} (${W} × ${H}) — vert arbres, rose commerces, orange lampadaires, brun autre mobilier, rouge feux, gris passages, bleu monuments et métro`);
}

report.ok = failures.length === 0; report.failures = failures; report.warnings = warnings;
const checkFile = path.join(TEST_OUT || RAW_B, 'check-b.json');
fs.mkdirSync(path.dirname(checkFile), { recursive: true });
fs.writeFileSync(checkFile, JSON.stringify(report, null, 1));
console.log(`\n${failures.length ? 'CONTRÔLE EN ÉCHEC' : 'CONTRÔLE RÉUSSI'} : ${failures.length} échec(s), ${warnings.length} avertissement(s) → ${checkFile}`);
if (failures.length) process.exitCode = 1;
