// fetch-a-8-check.mjs — contrôle des couches structurelles normalisées (buildings, roads, areas, barriers, places).
//
//   node tools/map/fetch-a-8-check.mjs
//
// Vérifie : le schéma de chaque couche (contrat), les comptes, la couverture de l'emprise par un quadrillage de
// 500 m, les 12 avenues de la place de l'Étoile, la traversée de l'emprise par la Seine, la connexité du graphe
// des rues, la présence des grands toponymes et l'absence de nom d'enseigne.
// Code de sortie 1 si un contrôle bloquant échoue. Écrit aussi raw/check-a.json.

import fs from 'node:fs';
import path from 'node:path';
import {
  RAW, NORM, BBOX, RECT_M, MX, MZ, readJson, polysOf, polygonAreaM, lineLengthM, interiorPoint, pointInPolygon, bboxOf,
  GridIndex, normName, commercialNameSet,
} from './lib-a.mjs';

const report = { ok: true, failures: [], layers: {} };
const fail = (msg) => { report.ok = false; report.failures.push(msg); console.log(`  ✗ ÉCHEC : ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);
const load = (name) => {
  const file = path.join(NORM, `${name}.geojson`);
  const fc = readJson(file);
  return { feats: fc.features, bytes: fs.statSync(file).size, meta: fc.meta };
};

// ───────────── 1. Schéma ─────────────
console.log('1. Schéma et comptes');
const ENUM = {
  buildings: { kind: ['residential', 'commercial', 'office', 'public', 'religious', 'monument', 'industrial', 'station', 'hotel', 'school', 'hospital', 'other'] },
  roads: { class: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living', 'pedestrian', 'service', 'footway', 'steps', 'cycleway'], surface: ['asphalt', 'sett', 'paved', 'gravel', null] },
  areas: { kind: ['water', 'park', 'garden', 'plaza', 'pedestrian', 'sidewalk', 'roadway', 'parking', 'cemetery', 'sports', 'construction', 'courtyard'] },
  barriers: { kind: ['wall', 'fence', 'railing', 'hedge', 'quay_wall'] },
  places: { kind: ['square', 'street', 'bridge', 'quay', 'garden', 'district', 'monument', 'station', 'institution'] },
};
const REQUIRED = {
  buildings: ['id', 'height', 'levels', 'kind', 'name', 'roofShape', 'source'],
  roads: ['id', 'name', 'class', 'width', 'lanes', 'oneway', 'bridge', 'tunnel', 'surface', 'maxspeed', 'layer', 'source'],
  areas: ['kind', 'name'],
  barriers: ['kind', 'height'],
  places: ['kind', 'name'],
};
const GEOM = {
  buildings: ['Polygon', 'MultiPolygon'], roads: ['LineString'], areas: ['Polygon', 'MultiPolygon'], barriers: ['LineString'], places: ['Point', 'LineString'],
};
const L = {};
const eachCoord = (g, fn) => {
  const walk = (c) => { if (typeof c[0] === 'number') fn(c); else for (const x of c) walk(x); };
  walk(g.coordinates);
};
for (const name of Object.keys(REQUIRED)) {
  const l = (L[name] = load(name));
  let bad = 0, outside = 0, badCoord = 0;
  const firstBad = [];
  const note = (f, why) => { bad++; if (firstBad.length < 3) firstBad.push(`${why} ${JSON.stringify(f.properties).slice(0, 120)}`); };
  for (const f of l.feats) {
    if (!f.geometry || !GEOM[name].includes(f.geometry.type)) { note(f, 'géométrie'); continue; }
    for (const k of REQUIRED[name]) if (!(k in f.properties)) note(f, `clé absente ${k}`);
    for (const [k, vals] of Object.entries(ENUM[name])) if (!vals.includes(f.properties[k])) note(f, `valeur ${k}=${f.properties[k]}`);
    let anyIn = false, n = 0;
    eachCoord(f.geometry, (c) => {
      n++;
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1]) || c.length !== 2) badCoord++;
      if (c[0] >= RECT_M[0] - 1e-9 && c[0] <= RECT_M[2] + 1e-9 && c[1] >= RECT_M[1] - 1e-9 && c[1] <= RECT_M[3] + 1e-9) anyIn = true;
    });
    if (!anyIn && name !== 'buildings') outside++;
    if (name === 'buildings' || name === 'areas') {
      for (const poly of polysOf(f.geometry)) for (const ring of poly) if (ring.length < 4 || ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) note(f, 'anneau non fermé');
    } else if (f.geometry.type === 'LineString' && f.geometry.coordinates.length < 2) note(f, 'ligne dégénérée');
  }
  report.layers[name] = { count: l.feats.length, bytes: l.bytes, schemaErrors: bad, outside, badCoord };
  const line = `${name} : ${l.feats.length} objets, ${(l.bytes / 1e6).toFixed(1)} Mo`;
  if (bad || outside || badCoord || !l.feats.length) fail(`${line} — ${bad} erreurs de schéma, ${outside} hors emprise, ${badCoord} coordonnées invalides ${firstBad.join(' | ')}`);
  else pass(`${line} — schéma conforme, tout dans l'emprise (+ marge)`);
}
// types des valeurs
{
  const b = L.buildings.feats, r = L.roads.feats;
  const badH = b.filter((f) => f.properties.height !== null && !(f.properties.height > 0 && f.properties.height < 400)).length;
  const badL = b.filter((f) => f.properties.levels !== null && !(Number.isInteger(f.properties.levels) && f.properties.levels > 0 && f.properties.levels < 80)).length;
  const badW = r.filter((f) => f.properties.width !== null && !(f.properties.width > 0 && f.properties.width < 80)).length;
  const badB = r.filter((f) => typeof f.properties.oneway !== 'boolean' || typeof f.properties.bridge !== 'boolean' || typeof f.properties.tunnel !== 'boolean' || !Number.isInteger(f.properties.layer)).length;
  const dupB = b.length - new Set(b.map((f) => f.properties.id)).size, dupR = r.length - new Set(r.map((f) => f.properties.id)).size;
  if (badH || badL || badW || badB || dupB || dupR) fail(`types : hauteurs ${badH}, niveaux ${badL}, largeurs ${badW}, booléens/couche ${badB}, identifiants en double bâtiments ${dupB} rues ${dupR}`);
  else pass('types des valeurs corrects, identifiants uniques (bâtiments, rues)');
  const nullH = b.filter((f) => f.properties.height === null).length;
  report.layers.buildings.heightNull = nullH;
  console.log(`    hauteur absente : ${nullH} bâtiments (${(100 * nullH / b.length).toFixed(1)} %) ; niveaux absents : ${b.filter((f) => f.properties.levels === null).length}`);
  const car = r.filter((f) => ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living'].includes(f.properties.class));
  console.log(`    rues carrossables : ${car.length} arêtes ; largeur absente : ${car.filter((f) => f.properties.width === null).length} ; sans nom : ${car.filter((f) => !f.properties.name).length}`);
}

// ───────────── 2. Quadrillage de 500 m ─────────────
console.log('2. Couverture de l\'emprise (cases de 500 m)');
{
  const CELL = 500;
  const nx = Math.ceil(((BBOX.east - BBOX.west) * MX) / CELL), ny = Math.ceil(((BBOX.north - BBOX.south) * MZ) / CELL);
  const cellOf = (c) => {
    const ix = Math.floor(((c[0] - BBOX.west) * MX) / CELL), iy = Math.floor(((BBOX.north - c[1]) * MZ) / CELL);
    return ix >= 0 && ix < nx && iy >= 0 && iy < ny ? iy * nx + ix : -1;
  };
  const nb = new Int32Array(nx * ny), nr = new Int32Array(nx * ny), open = new Float32Array(nx * ny);
  for (const f of L.buildings.feats) {
    const polys = polysOf(f.geometry);
    const c = cellOf(interiorPoint(polys[0]));
    if (c >= 0) nb[c]++;
  }
  for (const f of L.roads.feats) {
    if (['footway', 'steps', 'cycleway'].includes(f.properties.class)) continue;
    const seen = new Set();
    for (const c of f.geometry.coordinates) { const k = cellOf(c); if (k >= 0 && !seen.has(k)) { seen.add(k); nr[k]++; } }
  }
  // part de la case occupée par l'eau, les parcs et les jardins (échantillonnage 20 × 20)
  const idx = new GridIndex(100);
  for (const f of L.areas.feats) {
    const p = f.properties;
    if (p.kind === 'water' || p.kind === 'park' || (p.kind === 'garden' && p.z === 2)) for (const poly of polysOf(f.geometry)) idx.insert(bboxOf(poly[0]), poly);
  }
  const S = 20;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      let hit = 0, tot = 0;
      for (let a = 0; a < S; a++) {
        for (let b2 = 0; b2 < S; b2++) {
          const pt = [BBOX.west + ((ix + (a + 0.5) / S) * CELL) / MX, BBOX.north - ((iy + (b2 + 0.5) / S) * CELL) / MZ];
          if (pt[0] > BBOX.east || pt[1] < BBOX.south) continue;
          tot++;
          for (const poly of idx.queryPoint(pt)) if (pointInPolygon(pt, poly)) { hit++; break; }
        }
      }
      open[iy * nx + ix] = tot ? hit / tot : 1;
    }
  }
  const empty = [], excused = [];
  console.log(`    grille ${nx} × ${ny} = ${nx * ny} cases ; par case : bâtiments/arêtes de rue (· = case excusée par l'eau ou un jardin)`);
  for (let iy = 0; iy < ny; iy++) {
    let row = '    ';
    for (let ix = 0; ix < nx; ix++) {
      const k = iy * nx + ix;
      const missing = nb[k] === 0 || nr[k] === 0;
      if (missing) (open[k] >= 0.5 ? excused : empty).push({ ix, iy, buildings: nb[k], roads: nr[k], openShare: Number(open[k].toFixed(2)) });
      row += `${String(nb[k]).padStart(4)}/${String(nr[k]).padEnd(3)}${missing ? (open[k] >= 0.5 ? '·' : '!') : ' '}`;
    }
    console.log(row);
  }
  report.grid = { nx, ny, cells: nx * ny, minBuildings: Math.min(...nb), minRoads: Math.min(...nr), empty, excused };
  if (empty.length) fail(`${empty.length} case(s) sans bâtiment ou sans rue hors Seine et jardins : ${JSON.stringify(empty)}`);
  else pass(`aucune case vide : ${nx * ny - excused.length} cases avec bâtiments et rues, ${excused.length} case(s) excusée(s) (Seine / grands jardins) ${JSON.stringify(excused)}`);
}

// ───────────── 3. Place de l'Étoile : 12 avenues ─────────────
console.log('3. Place de l\'Étoile');
{
  const EXPECTED = ['Avenue des Champs-Élysées', 'Avenue Marceau', "Avenue d'Iéna", 'Avenue Kléber', 'Avenue Victor Hugo', 'Avenue Foch', 'Avenue de la Grande Armée', 'Avenue Carnot', 'Avenue Mac-Mahon', 'Avenue de Wagram', 'Avenue Hoche', 'Avenue de Friedland'];
  const key = (c) => `${c[0]},${c[1]}`;
  const ring = L.roads.feats.filter((f) => f.properties.name === 'Place Charles de Gaulle' && ['primary', 'secondary', 'tertiary', 'residential'].includes(f.properties.class));
  const ringNodes = new Set();
  for (const f of ring) for (const c of f.geometry.coordinates) ringNodes.add(key(c));
  const touching = new Map();
  for (const f of L.roads.feats) {
    const p = f.properties;
    if (!p.name || p.name === 'Place Charles de Gaulle' || !['primary', 'secondary', 'tertiary', 'residential'].includes(p.class)) continue;
    const c = f.geometry.coordinates;
    if (ringNodes.has(key(c[0])) || ringNodes.has(key(c[c.length - 1]))) touching.set(p.name, (touching.get(p.name) || 0) + 1);
  }
  const n = (s) => normName(s);
  const found = EXPECTED.filter((e) => [...touching.keys()].some((t) => n(t) === n(e)));
  const missing = EXPECTED.filter((e) => !found.includes(e));
  const extra = [...touching.keys()].filter((t) => !EXPECTED.some((e) => n(e) === n(t)));
  report.etoile = { ringEdges: ring.length, avenues: [...touching.keys()], missing, extra };
  console.log(`    anneau « Place Charles de Gaulle » : ${ring.length} arêtes ; voies qui s'y raccordent : ${[...touching.entries()].map(([k, v]) => `${k} (${v})`).join(', ')}`);
  if (ring.length === 0 || missing.length) fail(`place de l'Étoile : avenues manquantes ${JSON.stringify(missing)}`);
  else pass(`les 12 avenues rejoignent l'anneau${extra.length ? ` (autres voies raccordées : ${extra.join(', ')})` : ''}`);
}

// ───────────── 4. La Seine traverse l'emprise ─────────────
console.log('4. Seine');
{
  const river = [];
  for (const f of L.areas.feats) if (f.properties.kind === 'water' && f.properties.sub === 'river') for (const poly of polysOf(f.geometry)) river.push(poly);
  const idx = new GridIndex(200);
  for (const poly of river) idx.insert(bboxOf(poly[0]), poly);
  const isWater = (pt) => { for (const poly of idx.queryPoint(pt)) if (pointInPolygon(pt, poly)) return true; return false; };
  // trame de 10 m sur l'emprise ; parcours en largeur depuis le bord ouest
  const STEP = 10;
  const nx = Math.floor(((BBOX.east - BBOX.west) * MX) / STEP), ny = Math.floor(((BBOX.north - BBOX.south) * MZ) / STEP);
  const grid = new Uint8Array(nx * ny);
  let waterCells = 0;
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (isWater([BBOX.west + ((ix + 0.5) * STEP) / MX, BBOX.south + ((iy + 0.5) * STEP) / MZ])) { grid[iy * nx + ix] = 1; waterCells++; }
  }
  const queue = [];
  const westRows = [];
  for (let iy = 0; iy < ny; iy++) if (grid[iy * nx] === 1) { grid[iy * nx] = 2; queue.push(iy * nx); westRows.push(iy); }
  let reached = 0, maxIx = 0;
  while (queue.length) {
    const k = queue.pop();
    reached++;
    const ix = k % nx, iy = (k - ix) / nx;
    if (ix > maxIx) maxIx = ix;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = ix + dx, y = iy + dy;
      if (x < 0 || x >= nx || y < 0 || y >= ny) continue;
      const kk = y * nx + x;
      if (grid[kk] === 1) { grid[kk] = 2; queue.push(kk); }
    }
  }
  const southExit = [];
  for (let ix = 0; ix < nx; ix++) if (grid[ix] === 2) southExit.push(ix);
  const lonOf = (ix) => (BBOX.west + ((ix + 0.5) * STEP) / MX).toFixed(4), latOf = (iy) => (BBOX.south + ((iy + 0.5) * STEP) / MZ).toFixed(4);
  const riverArea = river.reduce((s, p) => s + polygonAreaM(p), 0);
  report.seine = {
    polygons: river.length, areaM2: Math.round(riverArea),
    entersWestAtLat: westRows.length ? [latOf(westRows[0]), latOf(westRows[westRows.length - 1])] : null,
    exitsSouthAtLon: southExit.length ? [lonOf(southExit[0]), lonOf(southExit[southExit.length - 1])] : null,
    connectedShare: waterCells ? Number((reached / waterCells).toFixed(3)) : 0, eastmostLon: lonOf(maxIx),
  };
  console.log(`    ${river.length} polygone(s) de rivière, ${(riverArea / 1e6).toFixed(3)} km² ; entre par le bord ouest entre lat ${report.seine.entersWestAtLat?.join(' et ')} ; sort par le bord sud entre lon ${report.seine.exitsSouthAtLon?.join(' et ')} ; point le plus à l'est : lon ${report.seine.eastmostLon}`);
  const probes = [
    ['milieu de la Seine au pont de la Concorde', [2.3192, 48.8634], true],
    ['milieu de la Seine au pont d\'Iéna', [2.2925, 48.8597], true],
    ['petit bras au sud de l\'île de la Cité (pont Saint-Michel)', [2.3447, 48.8540], true],
    ['parvis Notre-Dame (île de la Cité)', [2.3488, 48.8534], false],
    ['île Saint-Louis', [2.3565, 48.8518], false],
    ['obélisque de la Concorde', [2.321236, 48.865633], false],
  ];
  const wrong = probes.filter(([, pt, want]) => isWater(pt) !== want).map(([n]) => n);
  if (!westRows.length || !southExit.length) fail('la Seine ne relie pas le bord ouest au bord sud de l\'emprise d\'un seul tenant');
  else if (reached / waterCells < 0.97) fail(`rivière en plusieurs morceaux : ${(100 * reached / waterCells).toFixed(1)} % seulement d'un seul tenant`);
  else if (wrong.length) fail(`points de contrôle de la Seine faux : ${wrong.join(', ')}`);
  else pass(`la Seine traverse l'emprise d'un seul tenant (${(100 * reached / waterCells).toFixed(1)} % des cellules d'eau reliées), du bord ouest jusqu'à sa sortie par le bord sud ; ${probes.length} points de contrôle corrects (îles hors de l'eau)`);
  // canal Saint-Martin et bassin de l'Arsenal
  const canal = L.areas.feats.filter((f) => f.properties.kind === 'water' && f.properties.sub === 'canal');
  const names = [...new Set(canal.map((f) => f.properties.name).filter(Boolean))];
  console.log(`    canal / bassins navigables : ${canal.length} polygones (${names.join(', ')})`);
  report.canal = { polygons: canal.length, names };
  if (!names.some((n) => /Arsenal/.test(n))) fail('bassin de l\'Arsenal absent');
}

// ───────────── 5. Connexité du graphe des rues ─────────────
console.log('5. Graphe des rues');
{
  const DRIVE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living', 'pedestrian', 'service']);
  const parent = new Map();
  const find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(k) !== r) { const n = parent.get(k); parent.set(k, r); k = n; } return r; };
  const add = (k) => { if (!parent.has(k)) parent.set(k, k); };
  const key = (c) => `${c[0]},${c[1]}`;
  const edges = L.roads.feats.filter((f) => DRIVE.has(f.properties.class));
  for (const f of edges) {
    const c = f.geometry.coordinates;
    const a = key(c[0]), b = key(c[c.length - 1]);
    add(a); add(b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const lenByComp = new Map();
  let total = 0;
  for (const f of edges) {
    const c = f.geometry.coordinates;
    const r = find(key(c[0])), l = lineLengthM(c);
    lenByComp.set(r, (lenByComp.get(r) || 0) + l); total += l;
  }
  const comps = [...lenByComp.values()].sort((a, b) => b - a);
  const share = comps[0] / total;
  report.graph = { edges: edges.length, nodes: parent.size, components: comps.length, mainShare: Number(share.toFixed(4)), totalKm: Math.round(total / 100) / 10 };
  console.log(`    ${edges.length} arêtes (hors cheminements piétons et pistes cyclables), ${parent.size} nœuds, ${(total / 1000).toFixed(1)} km ; ${comps.length} composantes ; la principale porte ${(100 * share).toFixed(2)} % de la longueur`);
  if (share < 0.97) fail('graphe des rues morcelé : la composante principale porte moins de 97 % de la longueur');
  else pass('graphe d\'un seul tenant (les petites composantes sont des voies de service isolées ou coupées par le bord de l\'emprise)');
}

// ───────────── 6. Toponymes attendus ─────────────
console.log('6. Toponymes');
{
  const byKind = (k) => L.places.feats.filter((f) => f.properties.kind === k).map((f) => f.properties.name);
  const has = (list, name) => list.some((n) => normName(n) === normName(name) || normName(n).includes(normName(name)));
  const EXPECT = {
    street: ['Avenue des Champs-Élysées', 'Rue de Rivoli', 'Boulevard Haussmann', 'Boulevard Saint-Germain', "Avenue de l'Opéra", 'Rue Royale', 'Boulevard de Sébastopol', 'Rue du Faubourg Saint-Honoré', 'Boulevard des Capucines', 'Rue Saint-Antoine', 'Boulevard Beaumarchais', 'Avenue Montaigne', 'Rue de la Paix', 'Boulevard Saint-Michel', 'Avenue de la Grande Armée', 'Boulevard du Temple', 'Rue La Fayette', 'Avenue George V', 'Boulevard Voltaire', 'Rue du Faubourg Saint-Antoine'],
    square: ['Place de la Concorde', 'Place Charles de Gaulle', 'Place de la République', 'Place de la Bastille', 'Place Vendôme', "Place de l'Opéra", 'Place de la Madeleine', 'Place du Trocadéro', "Place de l'Hôtel de Ville", 'Place des Vosges', 'Place du Châtelet', 'Place Saint-Michel', 'Place de la Nation'],
    bridge: ["Pont d'Iéna", 'Passerelle Debilly', "Pont de l'Alma", 'Pont des Invalides', 'Pont Alexandre III', 'Pont de la Concorde', 'Passerelle Léopold-Sédar-Senghor', 'Pont Royal', 'Pont du Carrousel', 'Pont des Arts', 'Pont Neuf', 'Pont Saint-Michel', 'Petit Pont', 'Pont au Double', "Pont de l'Archevêché", 'Pont au Change', 'Pont Notre-Dame', "Pont d'Arcole", 'Pont Saint-Louis', 'Pont Louis-Philippe', 'Pont Marie', 'Pont de la Tournelle', 'Pont de Sully', 'Pont de Bir-Hakeim'],
    garden: ['Jardin des Tuileries', 'Champ-de-Mars', 'Jardins du Trocadéro', 'Jardin du Palais Royal', 'Jardins des Champs-Élysées', 'Esplanade des Invalides', 'Jardin du Luxembourg', 'Square du Vert-Galant', 'Jardin Nelson Mandela'],
    monument: ['Arc de Triomphe', 'Tour Eiffel', 'Palais du Louvre', 'Cathédrale Notre-Dame de Paris', 'Opéra Garnier', 'Hôtel des Invalides', 'Grand Palais', 'Petit Palais', 'Église de la Madeleine', 'Palais Bourbon', 'Palais de Chaillot', 'Sainte-Chapelle', 'Colonne Vendôme', 'Colonne de Juillet', 'Obélisque de Louxor', "Palais de l'Élysée", 'Hôtel de ville', 'Panthéon'],
    station: ['Paris-Saint-Lazare', "Paris Gare de l'Est", 'Châtelet - Les Halles', 'Concorde', 'Charles de Gaulle-Étoile', 'République', 'Bastille', 'Opéra', 'Invalides', 'Trocadéro'],
  };
  report.toponyms = {};
  for (const [kind, list] of Object.entries(EXPECT)) {
    const names = kind === 'monument' ? [...byKind('monument'), ...byKind('institution')] : kind === 'garden' ? [...byKind('garden'), ...byKind('square')] : byKind(kind);
    const missing = list.filter((n) => !has(names, n));
    report.toponyms[kind] = { expected: list.length, missing };
    console.log(`    ${kind} : ${list.length - missing.length}/${list.length} présents${missing.length ? ` ; absents : ${missing.join(', ')}` : ''}`);
  }
  console.log('    (Jardin du Luxembourg, Panthéon et place de la Nation sont hors de l\'emprise : leur absence est attendue.)');
  const outOfExtent = new Set(['Jardin du Luxembourg', 'Panthéon', 'Place de la Nation']);
  const really = Object.entries(report.toponyms).flatMap(([k, v]) => v.missing.filter((n) => !outOfExtent.has(n)).map((n) => `${k}:${n}`));
  report.toponyms.missingInsideExtent = really;
  if (really.length > 6) fail(`trop de grands toponymes absents : ${really.join(', ')}`);
  else pass(`grands toponymes présents (absents dans l'emprise : ${really.length ? really.join(', ') : 'aucun'})`);
}

// ───────────── 7. Aucune enseigne ─────────────
console.log('7. Noms d\'enseignes');
{
  const osm = readJson(path.join(RAW, 'osm', 'extract-a.json'));
  const commercial = commercialNameSet(osm);
  const hitsB = L.buildings.feats.filter((f) => f.properties.name && commercial.has(normName(f.properties.name)) && !['religious', 'monument', 'station'].includes(f.properties.kind)).map((f) => f.properties.name);
  const hitsP = L.places.feats.filter((f) => ['monument', 'institution'].includes(f.properties.kind) && commercial.has(normName(f.properties.name))).map((f) => `${f.properties.kind}:${f.properties.name}`);
  const hitsA = L.areas.feats.filter((f) => f.properties.name && commercial.has(normName(f.properties.name))).map((f) => `${f.properties.kind}:${f.properties.name}`);
  report.brands = { commercialNamesKnown: commercial.size, buildings: hitsB, places: hitsP, areas: [...new Set(hitsA)] };
  console.log(`    ${commercial.size} noms de commerces / enseignes connus dans l'extrait OSM`);
  console.log(`    bâtiments (hors monuments, cultes, gares) portant un de ces noms : ${hitsB.length} ${hitsB.slice(0, 8).join(' | ')}`);
  console.log(`    institutions non historiques portant un de ces noms : ${hitsP.filter((h) => h.startsWith('institution')).length}`);
  console.log(`    monuments (édifices historiques ou cultuels) homonymes d'un commerce, conservés : ${hitsP.filter((h) => h.startsWith('monument')).length} ${hitsP.filter((h) => h.startsWith('monument')).slice(0, 12).join(' | ')}`);
  console.log(`    surfaces nommées homonymes d'un commerce (jardins, places : noms publics conservés) : ${report.brands.areas.length} ${report.brands.areas.slice(0, 8).join(' | ')}`);
  if (hitsB.length || hitsP.some((h) => h.startsWith('institution'))) fail('des noms d\'enseignes subsistent dans les bâtiments ou les institutions');
  else pass('aucun bâtiment ordinaire ni institution ne porte un nom de commerce');
}

fs.writeFileSync(path.join(RAW, 'check-a.json'), JSON.stringify(report, null, 1));
console.log(report.ok ? '\nRÉSULTAT : tous les contrôles bloquants passent.' : `\nRÉSULTAT : ${report.failures.length} contrôle(s) en échec.`);
process.exit(report.ok ? 0 : 1);
