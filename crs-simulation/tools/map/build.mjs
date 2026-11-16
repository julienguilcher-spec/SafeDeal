#!/usr/bin/env node
/* =====================================================================================
 * CARTE DE PARIS — CONSTRUCTION des données finales du jeu
 * -------------------------------------------------------------------------------------
 *   node tools/map/build.mjs            construit public/data/paris/ et écrit le rapport
 *   node tools/map/build.mjs --dry-run  construit et contrôle sans rien écrire dans public/
 *
 * Entrée : les couches normalisées de tools/map/raw/normalized/ (lots A et B).
 * Sortie : manifest.json, roadgraph.json, places.json, landmarks.json, terrain.json,
 * tiles/t_{tx}_{tz}.json et LICENCE.txt dans public/data/paris/ ; rapport détaillé dans
 * tools/map/raw/build/report.json. Aucun accès au réseau. Relançable : mêmes entrées, mêmes
 * fichiers. Code de sortie 1 si un contrôle échoue (format, connexité, budget).
 * ===================================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { M, NORM, OUT, REPORT_DIR, TILES, createTiles, normName, log } from './build-lib.mjs';
import { loadBrandNames, isCommercialName, hasTrademark } from './build-names.mjs';
import { buildTerrain } from './build-terrain.mjs';
import { loadLandmarkParts, buildLandmarks } from './build-landmarks.mjs';
import { buildBuildings, emitBuildings } from './build-buildings.mjs';
import { buildRoads, MIN_MAIN_COMPONENT } from './build-roads.mjs';
import { prepareAreas, waterBodies, emitSurfaces, buildBarriers } from './build-surfaces.mjs';
import { buildTrees, buildFurniture, buildSignals, buildMetro } from './build-points.mjs';
import { buildShops } from './build-shops.mjs';
import { buildPlaces } from './build-places.mjs';

/** Budget de la sortie. */
const MAX_FILES = 110;
const MAX_BYTES = 30 * 1024 * 1024;

/** Mentions exactes (docs/map-sources-a.md § 2 et docs/map-sources-b.md § 2). */
const ATTRIBUTION = [
  { source: 'OpenStreetMap', license: 'ODbL 1.0', text: '© les contributeurs d\'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
  { source: 'IGN', license: 'Licence Ouverte 2.0 (Etalab)', text: 'IGN — RGE ALTI® et BD TOPO®, données extraites en novembre 2026', url: 'https://geoservices.ign.fr/' },
  { source: 'Ville de Paris', license: 'ODbL', text: 'Ville de Paris — Paris Data (opendata.paris.fr), licence ODbL', url: 'https://opendata.paris.fr/' },
  { source: 'Apur', license: 'ODbL 1.0', text: 'Apur — BDCOM 2023, licence ODbL', url: 'https://opendata.apur.org/' },
  { source: 'Île-de-France Mobilités', license: 'Licence Ouverte 2.0 (Etalab)', text: 'Île-de-France Mobilités — référentiels des arrêts et des gares, Licence Ouverte 2.0', url: 'https://data.iledefrance-mobilites.fr/' },
  { source: 'Carte du jeu (base de données dérivée)', license: 'ODbL 1.0', text: 'Données de carte du jeu : base dérivée des sources ci-dessus, mise à disposition sous licence ODbL 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' },
];

const LICENCE_TEXT = `CRS SIMULATION FRANCE — données de carte « paris »

Les fichiers de ce dossier (manifest.json, roadgraph.json, places.json, landmarks.json,
terrain.json, tiles/*.json) forment une base de données DÉRIVÉE de sources ouvertes. Elle est
mise à disposition sous la licence Open Database License (ODbL) 1.0 :
https://opendatacommons.org/licenses/odbl/1-0/

Sources et mentions à reproduire :
${ATTRIBUTION.slice(0, 5).map((a) => `  - ${a.text} (${a.license}) — ${a.url}`).join('\n')}

Les noms d'enseignes commerciales présents dans les sources ont été retirés ; seule la catégorie
de chaque commerce est conservée. Construction : tools/map/build.mjs (voir docs/map-build.md).
`;

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const t0 = Date.now();
  const report = { inputs: NORM, output: OUT };
  const step = (name, fn) => {
    const t = Date.now();
    const r = fn();
    log(`  ${name} : ${Date.now() - t} ms`);
    return r;
  };

  log('Construction de la carte de Paris');
  const areas = step('surfaces (lecture, simplification)', () => prepareAreas());
  const terrain = step('relief', () => buildTerrain(waterBodies(areas)));
  report.terrain = terrain.report;
  const parts = step('monuments', () => loadLandmarkParts());
  const brands = loadBrandNames();
  const buildings = step('bâtiments', () => buildBuildings({ heightAt: terrain.heightAt, landmarkParts: parts, brands }));
  const roads = step('graphe routier', () => buildRoads({ buildings, landmarkParts: parts, onSidewalk: areas.onSidewalk, onPaved: areas.onPaved }));
  report.roads = roads.report;
  if (roads.report.connectivity.mainComponentShare < MIN_MAIN_COMPONENT) {
    throw new Error(`graphe routier : la plus grande composante ne porte que ${(roads.report.connectivity.mainComponentShare * 100).toFixed(2)} % des arêtes carrossables (minimum ${MIN_MAIN_COMPONENT * 100} %)`);
  }

  const tiles = createTiles();
  const ctx = {
    heightAt: terrain.heightAt, rawNgfAt: terrain.rawNgfAt, offset: terrain.offset, waterLevel: terrain.waterLevel,
    buildings, roads, areas, onSidewalk: areas.onSidewalk, inOpenWater: areas.inOpenWater, landmarkParts: parts,
  };
  report.surfaces = step('surfaces (découpage par tuile)', () => emitSurfaces(areas, tiles, ctx));
  report.barriers = step('barrières', () => buildBarriers(tiles, ctx));
  report.trees = step('arbres', () => buildTrees(tiles, ctx));
  report.furniture = step('mobilier', () => buildFurniture(tiles, ctx));
  report.signals = step('feux', () => buildSignals(tiles, ctx));
  const metro = step('métro', () => buildMetro(tiles, ctx));
  report.metro = metro.report;
  report.shops = step('commerces', () => buildShops(tiles, ctx));
  step('bâtiments (rangement)', () => emitBuildings(buildings, tiles));
  report.buildings = buildings.report;
  const places = step('lieux', () => buildPlaces({ roads, areas, stations: metro.stations, landmarkParts: parts, brands }));
  report.places = places.report;
  const landmarks = buildLandmarks(parts, ctx);
  report.landmarks = landmarks.report;

  // Arêtes par tuile (calculées sur le graphe tel que le jeu le lira, arrondi au décimètre), arbres en colonnes.
  const graph = { nodes: roads.nodes, edges: roads.edges };
  const rawGraph = M.encodeRoadGraph(graph);
  const refs = M.computeTileEdgeRefs(M.decodeRoadGraph(rawGraph));
  for (const tile of tiles.list) {
    tile.roadEdges = refs.get(M.tileKey(tile.tx, tile.tz)) ?? [];
    tile.trees = M.treeSetFromList(tile.treeList);
    delete tile.treeList;
  }

  // Date de génération = date des couches d'entrée (une reconstruction à l'identique ne change aucun fichier).
  let generatedAt = '';
  for (const name of ['buildings', 'roads', 'areas', 'barriers', 'places']) {
    const head = fs.readFileSync(path.join(NORM, `${name}.geojson`), 'utf8').slice(0, 400);
    const m = /"generated":"([^"]+)"/.exec(head);
    if (m !== null && m[1] > generatedAt) generatedAt = m[1];
  }
  const manifest = M.createManifest({ name: 'paris', tiles: TILES, attribution: ATTRIBUTION, waterLevel: terrain.waterLevel, generatedAt });

  // Encodage.
  const dropped = [];
  const raw = step('encodage', () => ({
    manifest,
    tiles: tiles.list.map((t) => M.encodeTile(t, dropped)),
    roadGraph: rawGraph,
    places: M.encodePlaces(places.list),
    landmarks: M.encodeLandmarks(landmarks.list),
    terrain: terrain.rawTerrain,
  }));
  report.droppedByEncoder = { count: dropped.length, sample: dropped.slice(0, 20) };

  // Contrôle : ce que le jeu lira.
  const files = M.mapDataFiles(raw).map((f) => ({ path: f.path, text: JSON.stringify(f.data) }));
  const sizeOf = new Map(files.map((f) => [f.path, Buffer.byteLength(f.text)]));
  for (const t of manifest.tiles) t.bytes = sizeOf.get(t.file);
  files[0].text = JSON.stringify(manifest);
  sizeOf.set(files[0].path, Buffer.byteLength(files[0].text));
  const check = step('contrôle (validateMapData)', () => {
    const rawErrors = [];
    for (const t of raw.tiles) {
      const r = M.validateRawTile(JSON.parse(JSON.stringify(t)));
      for (const e of r.errors) rawErrors.push(`tuile ${t.tx}_${t.tz} : ${e}`);
    }
    const reread = {
      manifest: JSON.parse(files[0].text),
      tiles: raw.tiles.map((_, i) => JSON.parse(files[5 + i].text)),
      roadGraph: JSON.parse(files[1].text), places: JSON.parse(files[2].text), landmarks: JSON.parse(files[3].text), terrain: JSON.parse(files[4].text),
    };
    const decoded = M.decodeMapData(reread);
    const v = M.validateMapData(decoded);
    return { rawErrors, v, decoded };
  });
  const warnKinds = new Map();
  for (const w of check.v.warnings) {
    const k = w.replace(/tuile -?\d+_-?\d+ : /, 'tuile : ').replace(/\d+(\.\d+)?/g, 'N').replace(/«[^»]*»/g, '« … »').slice(0, 110);
    warnKinds.set(k, (warnKinds.get(k) ?? 0) + 1);
  }
  report.validation = {
    ok: check.v.ok && check.rawErrors.length === 0,
    errors: check.rawErrors.concat(check.v.errors).slice(0, 60),
    warningCount: check.v.warnings.length,
    warningKinds: [...warnKinds].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${n} × ${k}`),
  };

  // Aucune enseigne : aucun nom publié ne doit être celui d'un commerce de la source.
  report.brandAudit = step('contrôle des enseignes', () => brandAudit(raw, brands));

  // Chiffres par tuile.
  report.tiles = raw.tiles.map((t, i) => ({
    key: `${t.tx}_${t.tz}`, bytes: sizeOf.get(manifest.tiles[i].file), buildings: t.buildings?.n ?? 0, surfaces: t.surfaces?.n ?? 0,
    barriers: t.barriers?.n ?? 0, trees: t.trees?.n ?? 0, furniture: t.furniture?.n ?? 0, signals: t.signals?.n ?? 0,
    metro: t.metro?.n ?? 0, shops: t.shops?.n ?? 0, roads: t.roads?.length ?? 0,
  }));
  const sum = (k) => report.tiles.reduce((s, t) => s + t[k], 0);
  let total = Buffer.byteLength(LICENCE_TEXT);
  for (const f of files) total += sizeOf.get(f.path);
  report.totals = {
    files: files.length + 1, bytes: total, megabytes: Math.round((total / 1048576) * 100) / 100,
    tiles: raw.tiles.length, tileBytes: sum('bytes'),
    globals: Object.fromEntries(files.slice(0, 5).map((f) => [f.path, sizeOf.get(f.path)])),
    buildings: sum('buildings'), surfaces: sum('surfaces'), barriers: sum('barriers'), trees: sum('trees'), furniture: sum('furniture'),
    signals: sum('signals'), metro: sum('metro'), shops: sum('shops'), roadNodes: roads.nodes.length, roadEdges: roads.edges.length,
    places: places.list.length, landmarks: landmarks.list.length,
    largestTile: report.tiles.reduce((a, b) => (b.bytes > a.bytes ? b : a)).key,
    largestTileBytes: Math.max(...report.tiles.map((t) => t.bytes)),
  };
  report.budget = { maxFiles: MAX_FILES, maxBytes: MAX_BYTES, ok: report.totals.files <= MAX_FILES && total <= MAX_BYTES };
  report.generatedAt = generatedAt;
  report.buildMs = Date.now() - t0;

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'report.json'), JSON.stringify(report, null, 1));

  log(`\nBilan : ${report.totals.files} fichiers, ${report.totals.megabytes} Mo (limites : ${MAX_FILES} fichiers, 30 Mo)`);
  log(`  ${report.totals.buildings} bâtiments, ${report.totals.surfaces} surfaces, ${report.totals.barriers} barrières, ${report.totals.trees} arbres, ${report.totals.furniture} objets de mobilier,`);
  log(`  ${report.totals.signals} supports de feux, ${report.totals.metro} bouches de métro, ${report.totals.shops} commerces, ${report.totals.roadNodes} nœuds et ${report.totals.roadEdges} arêtes, ${report.totals.places} lieux, ${report.totals.landmarks} monuments`);
  log(`  connexité des voies carrossables : ${(roads.report.connectivity.mainComponentShare * 100).toFixed(2)} % des arêtes dans la composante principale`);
  log(`  éléments écartés par l'encodeur : ${dropped.length} ; avertissements du contrôle : ${check.v.warnings.length}`);
  if (!report.validation.ok) {
    log('\nÉCHEC du contrôle du format :');
    for (const e of report.validation.errors) log('  - ' + e);
    process.exitCode = 1;
    return;
  }
  if (report.brandAudit.matches.length > 0) {
    log(`\nÉCHEC : ${report.brandAudit.matches.length} nom(s) publié(s) sont aussi des noms de commerces (voir report.json, brandAudit)`);
    for (const m of report.brandAudit.matches.slice(0, 20)) log('  - ' + m);
    process.exitCode = 1;
    return;
  }
  if (!report.budget.ok) {
    log('\nÉCHEC : budget dépassé (fichiers ou octets)');
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    log('\nContrôle réussi (--dry-run : rien n\'a été écrit dans ' + OUT + ')');
    return;
  }

  // Écriture : le dossier des tuiles est vidé pour ne laisser aucune tuile périmée.
  const tilesDir = path.join(OUT, M.MAP_FILES.tilesDir);
  fs.rmSync(tilesDir, { recursive: true, force: true });
  fs.mkdirSync(tilesDir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(OUT, f.path), f.text);
  fs.writeFileSync(path.join(OUT, 'LICENCE.txt'), LICENCE_TEXT);
  log(`\nÉcrit dans ${OUT} ; rapport : ${path.join(REPORT_DIR, 'report.json')} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

/**
 * Second contrôle, indépendant des filtres de construction, sur les fichiers ENCODÉS :
 *   - aucune chaîne publiée ne contient une marque déposée connue ni n'est un nom écarté à la relecture ;
 *   - aucun nom de bâtiment, de monument ou d'institution n'est le nom d'un commerce de la source ;
 *   - aucun commerce ne porte de nom (le format n'a pas de colonne pour cela : on le vérifie).
 * Les toponymes publics homonymes d'un commerce (une station « Bastille », un café « Bastille »)
 * sont comptés à titre d'information.
 */
function brandAudit(raw, brands) {
  const matches = [];
  const all = new Set();
  const buildingNames = new Set();
  for (const t of raw.tiles) {
    const str = t.str ?? [''];
    for (const s of str) all.add(s);
    const col = t.buildings?.name ?? [];
    for (let k = 1; k < col.length; k += 2) buildingNames.add(str[col[k]]);
    if (t.shops !== undefined && Object.keys(t.shops).some((c) => !['n', 'id', 'xz', 'a', 'w', 'cat', 'b'].includes(c))) matches.push(`tuile ${t.tx}_${t.tz} : colonne inattendue dans les commerces`);
  }
  for (const s of raw.roadGraph.str) all.add(s);
  for (const s of raw.places.name) all.add(s);
  for (const s of raw.places.ref ?? []) all.add(s);
  for (const s of raw.landmarks.name) all.add(s);
  for (const s of raw.landmarks.key) all.add(s);
  for (const s of all) if (hasTrademark(s)) matches.push(`marque déposée ou nom écarté dans « ${s} »`);
  for (const s of buildingNames) if (isCommercialName(s, brands)) matches.push(`bâtiment « ${s} » : nom de commerce`);
  const kinds = raw.places.kind ?? [];
  for (let i = 0; i < raw.places.n; i++) {
    const kind = M.PLACE_KINDS[kinds[i] ?? 0];
    if ((kind === 'monument' || kind === 'institution') && isCommercialName(raw.places.name[i], brands)) matches.push(`lieu « ${raw.places.name[i]} » : nom de commerce`);
  }
  const homonyms = [];
  for (const s of all) if (s !== '' && brands.has(normName(s))) homonyms.push(s);
  return { brandNames: brands.size, publishedStrings: all.size, buildingNames: buildingNames.size, matches, publicHomonyms: homonyms.length, publicHomonymsSample: homonyms.slice(0, 60) };
}

try {
  main();
} catch (err) {
  console.error('\nÉCHEC de la construction : ' + (err instanceof Error ? err.message : String(err)));
  if (err instanceof Error && process.argv.includes('--trace')) console.error(err.stack);
  process.exitCode = 1;
}
