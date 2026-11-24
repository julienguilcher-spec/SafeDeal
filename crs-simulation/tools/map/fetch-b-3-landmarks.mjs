// fetch-b-3-landmarks.mjs — couche `landmarks` : emprise au sol réelle des monuments à modéliser à la main.
// Sources : OpenStreetMap (contour du bâtiment ou de l'ouvrage, retrouvé par son identifiant Wikidata puis par son
//           identifiant OSM), IGN BD TOPO® `construction_surfacique` pour les ponts, couche `buildings` du lot A pour
//           retrouver les bâtiments génériques à retirer du rendu (sourceIds).
// Sortie : raw/normalized/landmarks.geojson — Polygon ; props { key, name, height, sourceIds, … }.
// Un monument en plusieurs morceaux (deux fontaines, deux ailes, deux travées de pont) donne PLUSIEURS objets de même
// `key`, numérotés par `part` (1…`parts`) : le contrat impose des Polygon simples.

import fs from 'node:fs';
import path from 'node:path';
import { RAW_B, NORM, BBOX_M, toM, fromM, download, jsonValidator, readJson, readFeatures, ringArea, ringCentroid, ringBBox, pointInRing, pointInPolygon,
  cleanRing, assembleRings, writeGeoJSON, round1, HostDownError, requestLog, writeStatus } from './lib-b.mjs';
import { loadOsmExtract } from './fetch-b-1-osm.mjs';

// ───────────── Liste des monuments ─────────────
// at : position attendue [lat, lon] (contrôle de cohérence) ; wd : identifiant Wikidata porté par l'objet OSM ;
// osm : identifiant OSM de secours (w = chemin, r = relation) ; ref : hauteur hors tout de référence (m), valeur
// encyclopédique arrondie, uniquement là où elle est bien établie ; sinon la hauteur vient des données (OSM, BD TOPO) ;
// est : estimation grossière, seulement quand aucune donnée ne fournit de hauteur ; partOf : monument englobant.
const LANDMARKS = [
  { key: 'arc_triomphe', name: 'Arc de Triomphe', at: [48.873792, 2.295028], wd: 'Q64436', osm: 'w226413508', ref: 50 },
  { key: 'tour_eiffel', name: 'Tour Eiffel', at: [48.85837, 2.294481], wd: 'Q243', osm: 'w5013364', ref: 330 },
  { key: 'obelisque_concorde', name: 'Obélisque de Louxor', at: [48.865633, 2.321236], wd: 'Q1503331', osm: 'w72937686' },
  { key: 'fontaines_concorde', name: 'Fontaines de la Concorde', at: [48.865633, 2.321236], multi: [
    { part: 'nord', name: 'Fontaine des Fleuves', wd: 'Q15972378', osm: 'w72937684' },
    { part: 'sud', name: 'Fontaine des Mers', wd: 'Q15972365', osm: 'w72937685' },
  ], ref: 9 },
  { key: 'louvre', name: 'Palais du Louvre', at: [48.860611, 2.337644], wd: 'Q1075988', osm: 'r3262297', tol: 250 },
  { key: 'pyramide_louvre', name: 'Pyramide du Louvre', at: [48.861, 2.33583], wd: 'Q13397', osm: 'w375076234', ref: 21.6 },
  { key: 'arc_carrousel', name: 'Arc de Triomphe du Carrousel', at: [48.861717, 2.332903], wd: 'Q631104', osm: 'w227483542', ref: 19 },
  { key: 'notre_dame', name: 'Cathédrale Notre-Dame de Paris', at: [48.852968, 2.349902], wd: 'Q2981', osm: 'w201611261', ref: 96 },
  { key: 'sainte_chapelle', name: 'Sainte-Chapelle', at: [48.855369, 2.345], wd: 'Q193193', osm: 'r3344870', ref: 75 },
  { key: 'conciergerie', name: 'Conciergerie', at: [48.8562, 2.3458], derive: 'conciergerie', tol: 120, partOf: 'palais_justice' },
  { key: 'opera_garnier', name: 'Opéra Garnier', at: [48.87197, 2.331601], wd: 'Q187840', osm: 'w54667456', ref: 56 },
  { key: 'invalides', name: 'Hôtel des Invalides', at: [48.8567, 2.3126], wd: 'Q188977', osm: 'r1463538', ref: 107, tol: 250 },
  { key: 'grand_palais', name: 'Grand Palais', at: [48.866109, 2.312451], wd: 'Q457318', osm: 'w56185523', ref: 45 },
  { key: 'petit_palais', name: 'Petit Palais', at: [48.86605, 2.314578], wd: 'Q820892', osm: 'r2778854' },
  { key: 'pont_alexandre_iii', name: 'Pont Alexandre III', at: [48.863889, 2.313611], bridge: 'Pont Alexandre III', wd: 'Q390418', osm: 'w183620685', ref: 17 },
  { key: 'madeleine', name: 'Église de la Madeleine', at: [48.870044, 2.32455], wd: 'Q330564', osm: 'w54180046', ref: 30 },
  { key: 'palais_bourbon', name: 'Palais Bourbon (Assemblée nationale)', at: [48.862036, 2.318593], wd: 'Q936633', osm: 'r1019368', tol: 200 },
  { key: 'hotel_de_ville', name: 'Hôtel de Ville de Paris', at: [48.856483, 2.352414], wd: 'Q640968', osm: 'r284089' },
  { key: 'colonne_vendome', name: 'Colonne Vendôme', at: [48.867454, 2.329436], wd: 'Q1111051', osm: 'w227762241', ref: 44.3 },
  { key: 'colonne_juillet', name: 'Colonne de Juillet', at: [48.853151, 2.369146], wd: 'Q269641', osm: 'w227757683', ref: 50.5 },
  { key: 'opera_bastille', name: 'Opéra Bastille', at: [48.8522, 2.3702], osm: 'w78149064', siteWd: 'Q638423', ref: 48, tol: 200 },
  { key: 'statue_republique', name: 'Monument à la République', at: [48.867493, 2.363756], wd: 'Q15057808', osm: 'w227150549', ref: 25 },
  { key: 'palais_chaillot', name: 'Palais de Chaillot', at: [48.862, 2.288], wd: 'Q13360213', osm: 'r6826569', tol: 250 },
  { key: 'ecole_militaire', name: 'École Militaire', at: [48.8525, 2.3035], osm: 'r1083195', siteWd: 'Q273480', tol: 300 },
  { key: 'centre_pompidou', name: 'Centre Georges-Pompidou', at: [48.860642, 2.352245], wd: 'Q178065', osm: 'w55503397', ref: 42 },
  { key: 'tour_saint_jacques', name: 'Tour Saint-Jacques', at: [48.858056, 2.348889], wd: 'Q1431547', osm: 'w20326709', ref: 54 },
  { key: 'palais_royal', name: 'Palais-Royal', at: [48.8637, 2.3371], wd: 'Q329948', osm: 'r3300400', tol: 200 },
  { key: 'bourse_commerce', name: 'Bourse de commerce', at: [48.8628, 2.3427], wd: 'Q691375', osm: 'w19856722' },
  { key: 'palais_elysee', name: 'Palais de l\'Élysée', at: [48.8704, 2.3167], wd: 'Q188190', osm: 'r1060803' },
  { key: 'hotel_marine', name: 'Hôtel de la Marine', at: [48.8668, 2.3229], wd: 'Q2059518', osm: 'r1060822' },
  { key: 'hotel_crillon', name: 'Hôtel de Crillon', at: [48.8676, 2.3215], wd: 'Q692768', osm: 'r1060804' },
  { key: 'saint_eustache', name: 'Église Saint-Eustache', at: [48.8634, 2.3451], wd: 'Q1338207', osm: 'w53762963' },
  { key: 'saint_sulpice', name: 'Église Saint-Sulpice', at: [48.851, 2.3348], wd: 'Q295844', osm: 'w16077204', ref: 73 },
  { key: 'pont_neuf', name: 'Pont Neuf', at: [48.857, 2.3413], bridge: 'Pont Neuf', width: 20.5, tol: 200 },
  { key: 'institut_de_france', name: 'Institut de France', at: [48.8573, 2.337], wd: 'Q19297902', osm: 'r967665' },
  { key: 'musee_orsay', name: 'Musée d\'Orsay', at: [48.86, 2.3266], wd: 'Q23402', osm: 'w63178753', ref: 32 },
  { key: 'gare_saint_lazare', name: 'Gare Saint-Lazare', at: [48.8763, 2.3254], wd: 'Q747506', osm: 'w727994377', tol: 300 },
  { key: 'prefecture_police', name: 'Préfecture de police', at: [48.8545, 2.347], wd: 'Q163265', osm: 'r537263' },
  { key: 'palais_justice', name: 'Palais de Justice de Paris', at: [48.8556, 2.345], wd: 'Q143080', osm: 'r536982', tol: 200 },
  { key: 'hotel_matignon', name: 'Hôtel de Matignon', at: [48.8546, 2.3207], wd: 'Q912192', osm: 'r1076880', est: 15 },
];

// ───────────── OSM : polygones d'un chemin ou d'une relation ─────────────
const osm = await loadOsmExtract();
const wayById = new Map(osm.ways.map((w) => [w.id, w]));
const relById = new Map(osm.relations.map((r) => [r.id, r]));
const isFootprint = (t) => t.building || t.man_made || t.amenity === 'fountain' || t.tourism === 'artwork' || t.historic;

/** Polygones (en mètres, [extérieur, trous…]) d'un objet OSM 'w123' / 'r456'. */
function osmPolygons(ref) {
  const id = Number(ref.slice(1));
  if (ref[0] === 'w') {
    const w = wayById.get(id);
    if (!w || !w.closed) return null;
    const ring = cleanRing(w.coords.map(toM), true);
    return ring ? { tags: w.tags, polys: [[ring]] } : null;
  }
  const r = relById.get(id);
  if (!r) return null;
  const ways = (role) => r.members.filter((m) => m.type === 'w' && m.coords && (role === 'inner' ? m.role === 'inner' : m.role !== 'inner')).map((m) => m.coords.map(toM));
  const outers = assembleRings(ways('outer')).map((g) => cleanRing(g, true)).filter(Boolean);
  const inners = assembleRings(ways('inner')).map((g) => cleanRing(g, false)).filter(Boolean);
  const polys = outers.map((o) => [o]);
  for (const h of inners) { const p = polys.find((pl) => pointInRing(h[0][0], h[0][1], pl[0])); if (p) p.push(h); }
  return polys.length ? { tags: r.tags, polys } : null;
}
/** Retrouve un objet OSM par Wikidata (parmi les emprises bâties), sinon par identifiant. */
function findOsm({ wd, osm: ref }) {
  if (wd) {
    const cands = [];
    for (const w of osm.ways) if (w.tags.wikidata === wd && w.closed && isFootprint(w.tags)) cands.push('w' + w.id);
    for (const r of osm.relations) if (r.tags.wikidata === wd && isFootprint(r.tags)) cands.push('r' + r.id);
    if (ref && cands.includes(ref)) return { ref, by: 'wikidata+id' };
    if (cands.length) return { ref: cands[0], by: 'wikidata' };
  }
  if (ref && osmPolygons(ref)) return { ref, by: 'id' };
  return null;
}

// ───────────── IGN : ponts (construction_surfacique) ─────────────
let ignBridges = null, ignError = null;
try {
  const b = BBOX_M;
  const dest = path.join(RAW_B, 'ign', 'construction_surfacique.json');
  await download('https://data.geopf.fr/wfs/ows', dest, {
    params: { SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'BDTOPO_V3:construction_surfacique', SRSNAME: 'EPSG:4326', OUTPUTFORMAT: 'application/json', COUNT: '5000',
      BBOX: `${b.south.toFixed(6)},${b.west.toFixed(6)},${b.north.toFixed(6)},${b.east.toFixed(6)},urn:ogc:def:crs:EPSG::4326` },
    validate: jsonValidator((j) => (Array.isArray(j.features) ? null : 'pas de tableau features')),
  });
  ignBridges = readJson(dest).features.filter((f) => f.properties.nature === 'Pont');
} catch (e) {
  if (!(e instanceof HostDownError)) throw e;
  ignError = String(e.message);
  console.error('landmarks : BD TOPO indisponible, les ponts viendront d\'OSM → ' + ignError);
}
function ignBridgePolys(toponyme) {
  if (!ignBridges) return null;
  const out = { polys: [], ids: [] };
  for (const f of ignBridges) {
    if (f.properties.toponyme !== toponyme) continue;
    out.ids.push(f.properties.cleabs);
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) {
      const o = cleanRing(p[0].map(toM), true);
      if (!o) continue;
      out.polys.push([o, ...p.slice(1).map((h) => cleanRing(h.map(toM), false)).filter(Boolean)]);
    }
  }
  return out.polys.length ? out : null;
}

/**
 * Repli quand la BD TOPO ne répond pas et qu'OSM n'a pas de surface de pont : tampon de `width` mètres autour de l'axe
 * des chaussées OSM portant ce nom (bridge=yes). Une emprise par travée ; emprise APPROCHÉE (rectangle le long de l'axe).
 */
function osmBridgeBuffer(name, width) {
  const lines = osm.ways.filter((w) => w.tags.name === name && w.tags.bridge && w.tags.bridge !== 'no' && w.tags.highway && !/footway|path|steps|cycleway|pedestrian/.test(w.tags.highway))
    .map((w) => ({ ref: 'w' + w.id, pts: w.coords.map(toM) }));
  // raccorde les chemins bout à bout
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
  const chains = [];
  while (lines.length) {
    const c = lines.pop(); const refs = [c.ref]; let pts = c.pts; let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].pts;
        if (near(l[0], pts[pts.length - 1])) pts = pts.concat(l.slice(1));
        else if (near(l[l.length - 1], pts[pts.length - 1])) pts = pts.concat(l.slice(0, -1).reverse());
        else if (near(l[l.length - 1], pts[0])) pts = l.slice(0, -1).concat(pts);
        else if (near(l[0], pts[0])) pts = l.slice(1).reverse().concat(pts);
        else continue;
        refs.push(lines[i].ref); lines.splice(i, 1); grown = true; break;
      }
    }
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    chains.push({ pts, refs, len, mid: pts[pts.length >> 1] });
  }
  // chaussées parallèles d'une même travée : on ne garde que la plus longue
  chains.sort((a, b) => b.len - a.len);
  const kept = [];
  for (const c of chains) if (c.len > 15 && !kept.some((k) => Math.hypot(k.mid[0] - c.mid[0], k.mid[1] - c.mid[1]) < 40)) kept.push(c);
  const hw = width / 2; const polys = []; const refs = [];
  for (const c of kept) {
    const left = [], right = [];
    for (let i = 0; i < c.pts.length; i++) {
      const a = c.pts[Math.max(0, i - 1)], b = c.pts[Math.min(c.pts.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
      left.push([c.pts[i][0] + nx * hw, c.pts[i][1] + ny * hw]); right.push([c.pts[i][0] - nx * hw, c.pts[i][1] - ny * hw]);
    }
    const ring = cleanRing(left.concat(right.reverse()), true);
    if (ring) { polys.push([ring]); refs.push(...c.refs); }
  }
  return polys.length ? { polys, refs } : null;
}

// ───────────── Découpe d'un anneau par un demi-plan (Sutherland–Hodgman) ─────────────
/** Garde la partie de l'anneau située à gauche de la droite orientée a → b. */
function clipRing(ring, a, b) {
  const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out = [];
  const n = ring.length - 1; // anneau fermé
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[i + 1];
    const sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  }
  return out.length >= 3 ? cleanRing(out, ringArea(ring) > 0) : null;
}
const clipConvex = (ring, quad) => { let r = ring; for (let i = 0; i < quad.length && r; i++) r = clipRing(r, quad[i], quad[(i + 1) % quad.length]); return r; };

/**
 * Conciergerie : ni OSM ni la BD TOPO ne l'isolent du Palais de Justice (un seul bâtiment). On découpe donc le contour
 * du Palais : bande de 50 m de profondeur le long du quai de l'Horloge, de la tour Bonbec (ouest) à la tour de
 * l'Horloge (est). Emprise DÉRIVÉE, approximative au sud (limite intérieure non cadastrée).
 */
function deriveConciergerie() {
  const pj = osmPolygons('r536982') || (findOsm({ wd: 'Q143080' }) && osmPolygons(findOsm({ wd: 'Q143080' }).ref));
  if (!pj) return null;
  const tower = (re) => { const w = osm.ways.find((x) => x.tags.name && re.test(x.tags.name) && x.closed && pointInRing(...ringCentroid(x.coords.map(toM)), pj.polys[0][0])); return w ? ringCentroid(w.coords.map(toM)) : null; };
  const west = tower(/^Tour Bonbec$/), east = tower(/Tour (Carrée )?de l'Horloge/);
  if (!west || !east) return null;
  const L = Math.hypot(east[0] - west[0], east[1] - west[1]);
  const u = [(east[0] - west[0]) / L, (east[1] - west[1]) / L]; // le long du quai, vers l'est
  const s = [u[1], -u[0]]; // vers l'intérieur du palais (sud)
  const P = (du, ds) => [west[0] + u[0] * du + s[0] * ds, west[1] + u[1] * du + s[1] * ds];
  const quad = [P(-14, -30), P(-14, 50), P(L + 30, 50), P(L + 30, -30)]; // sens antihoraire (repère direct)
  if (ringArea(quad) < 0) quad.reverse();
  const outer = clipConvex(pj.polys[0][0], quad);
  if (!outer) return null;
  const holes = pj.polys[0].slice(1).map((h) => clipConvex(h, quad)).filter((h) => h && Math.abs(ringArea(h)) > 15);
  return { polys: [[outer, ...holes]], note: 'emprise dérivée : contour OSM du Palais de Justice (r536982) découpé sur 50 m de profondeur le long du quai de l\'Horloge, de la tour Bonbec à la tour de l\'Horloge' };
}

// ───────────── Bâtiments génériques recouverts (sourceIds) ─────────────
const buildingsFile = path.join(NORM, 'buildings.geojson');
let buildings = null;
if (fs.existsSync(buildingsFile)) {
  buildings = [];
  for (const f of readFeatures(buildingsFile)) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const mp = polys.map((p) => p.map((r) => r.map(toM)));
    let bb = [Infinity, Infinity, -Infinity, -Infinity], area = 0;
    for (const p of mp) { const b = ringBBox(p[0]); bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]; area += Math.abs(ringArea(p[0])); for (let i = 1; i < p.length; i++) area -= Math.abs(ringArea(p[i])); }
    buildings.push({ id: f.properties.id, height: f.properties.height, mp, bb, area });
  }
} else console.error('landmarks : raw/normalized/buildings.geojson absent (lot A) → sourceIds vides');

/**
 * Bâtiments du lot A dont au moins la moitié de la surface tombe dans l'emprise du monument (échantillonnage en grille).
 * Renvoie aussi la part de l'emprise du monument couverte par ces bâtiments.
 */
function coveredBuildings(polys) {
  if (!buildings) return { ids: [], maxHeight: null, coverage: null };
  let lb = [Infinity, Infinity, -Infinity, -Infinity], lArea = 0;
  for (const p of polys) { const b = ringBBox(p[0]); lb = [Math.min(lb[0], b[0]), Math.min(lb[1], b[1]), Math.max(lb[2], b[2]), Math.max(lb[3], b[3])]; lArea += Math.abs(ringArea(p[0])); for (let i = 1; i < p.length; i++) lArea -= Math.abs(ringArea(p[i])); }
  const inLm = (x, y) => polys.some((p) => pointInPolygon(x, y, p));
  const ids = []; let maxHeight = null, coveredArea = 0;
  for (const b of buildings) {
    if (b.bb[2] < lb[0] || b.bb[0] > lb[2] || b.bb[3] < lb[1] || b.bb[1] > lb[3]) continue;
    const step = Math.min(3, Math.max(0.4, Math.sqrt(Math.max(b.area, 1)) / 14));
    let nB = 0, nBoth = 0;
    for (let x = b.bb[0] + step / 2; x < b.bb[2]; x += step) for (let y = b.bb[1] + step / 2; y < b.bb[3]; y += step) {
      if (!b.mp.some((p) => pointInPolygon(x, y, p))) continue;
      nB++; if (inLm(x, y)) nBoth++;
    }
    if (!nB || nBoth / nB < 0.5) continue;
    ids.push(b.id); coveredArea += nBoth * step * step;
    if (b.height != null && (maxHeight == null || b.height > maxHeight)) maxHeight = b.height;
  }
  return { ids, maxHeight, coverage: lArea > 0 ? Math.min(1, coveredArea / lArea) : null };
}

/** Plus grande hauteur étiquetée dans OSM : l'objet lui-même puis les building:part situés dans l'emprise. */
function osmHeights(tags, polys) {
  const h = (t) => { const v = Number(String(t.height ?? '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null; };
  let own = tags ? h(tags) : null, part = null;
  for (const w of osm.ways) {
    if (!w.tags['building:part'] || !w.closed) continue;
    const v = h(w.tags); if (v == null) continue;
    const c = ringCentroid(w.coords.map(toM));
    if (polys.some((p) => pointInPolygon(c[0], c[1], p)) && (part == null || v > part)) part = v;
  }
  return { own, part };
}

// ───────────── Construction ─────────────
const features = [];
const report = [];
const problems = [];
for (const lm of LANDMARKS) {
  const [ex, ey] = toM([lm.at[1], lm.at[0]]);
  const pieces = []; // { polys, tags, osmRef, ignIds, footprint, partName, note }
  if (lm.multi) {
    for (const m of lm.multi) {
      const f = findOsm(m); const o = f && osmPolygons(f.ref);
      if (o) pieces.push({ polys: o.polys, tags: o.tags, osmRef: f.ref, footprint: 'osm', partName: m.part, partLabel: m.name });
    }
  } else if (lm.derive === 'conciergerie') {
    const d = deriveConciergerie();
    if (d) pieces.push({ polys: d.polys, tags: null, osmRef: 'r536982', footprint: 'derived', note: d.note });
  } else {
    let done = false;
    if (lm.bridge) {
      const ign = ignBridgePolys(lm.bridge);
      if (ign) { pieces.push({ polys: ign.polys, tags: null, ignIds: ign.ids, footprint: 'ign' }); done = true; }
    }
    if (!done) {
      let f = findOsm(lm);
      // Monument dont le bâtiment OSM n'a ni nom ni Wikidata : plus grand bâtiment situé dans le site étiqueté siteWd.
      if (!f && lm.siteWd) {
        const site = osm.ways.find((w) => w.tags.wikidata === lm.siteWd && w.closed);
        if (site) {
          const sr = site.coords.map(toM); let best = null;
          for (const w of osm.ways) { if (!w.tags.building || !w.closed) continue; const r = w.coords.map(toM); const c = ringCentroid(r); if (pointInRing(c[0], c[1], sr)) { const a = Math.abs(ringArea(r)); if (!best || a > best.a) best = { a, ref: 'w' + w.id }; } }
          for (const r of osm.relations) { if (!r.tags.building) continue; const o = osmPolygons('r' + r.id); if (!o) continue; const c = ringCentroid(o.polys[0][0]); if (pointInRing(c[0], c[1], sr)) { const a = Math.abs(ringArea(o.polys[0][0])); if (!best || a > best.a) best = { a, ref: 'r' + r.id }; } }
          if (best) f = { ref: best.ref, by: 'site' };
        }
      }
      const o = f && osmPolygons(f.ref);
      if (o) pieces.push({ polys: o.polys, tags: o.tags, osmRef: f.ref, footprint: 'osm', by: f.by });
      else if (lm.bridge) {
        const b = osmBridgeBuffer(lm.bridge, lm.width || 20);
        if (b) pieces.push({ polys: b.polys, tags: null, osmRef: b.refs.join('+'), footprint: 'buffer', note: `emprise approchée : tampon de ${lm.width || 20} m autour de l'axe des chaussées OSM` });
      }
    }
  }
  if (!pieces.length) { problems.push(`${lm.key} : emprise introuvable`); continue; }

  // Un objet par polygone ; morceaux triés du plus grand au plus petit (sauf parties nommées).
  const flat = [];
  for (const pc of pieces) for (const poly of pc.polys) flat.push({ ...pc, poly });
  if (!lm.multi) flat.sort((a, b) => Math.abs(ringArea(b.poly[0])) - Math.abs(ringArea(a.poly[0])));
  const allPolys = flat.map((f) => f.poly);
  const cov = coveredBuildings(allPolys);
  const oh = osmHeights(pieces[0].tags, allPolys);
  let height = null, heightSource = null;
  if (lm.ref != null) { height = lm.ref; heightSource = 'reference'; }
  else {
    const cands = [[oh.own, 'osm'], [oh.part, 'osm:part'], [cov.maxHeight, 'bdtopo']].filter(([v]) => v != null).sort((a, b) => b[0] - a[0]);
    if (cands.length) { height = round1(cands[0][0]); heightSource = cands[0][1]; }
    else if (lm.est != null) { height = lm.est; heightSource = 'estimate'; }
  }
  let totalArea = 0, cx = 0, cy = 0;
  for (const p of allPolys) { const a = Math.abs(ringArea(p[0])); const c = ringCentroid(p[0]); totalArea += a; cx += c[0] * a; cy += c[1] * a; }
  cx /= totalArea; cy /= totalArea;
  const dist = Math.hypot(cx - ex, cy - ey);
  if (dist > (lm.tol || 100)) problems.push(`${lm.key} : centre à ${dist.toFixed(0)} m de la position attendue (tolérance ${lm.tol || 100} m)`);
  flat.forEach((f, i) => {
    const area = Math.abs(ringArea(f.poly[0])) - f.poly.slice(1).reduce((s, h) => s + Math.abs(ringArea(h)), 0);
    const c = ringCentroid(f.poly[0]);
    features.push({
      type: 'Feature',
      properties: {
        key: lm.key,
        name: lm.name,
        height,
        sourceIds: cov.ids,
        heightSource,
        eaveHeight: cov.maxHeight, // plus haute gouttière BD TOPO parmi les bâtiments recouverts
        osmHeight: oh.own ?? oh.part ?? null,
        part: flat.length > 1 ? (f.partName || i + 1) : null,
        parts: flat.length,
        ...(f.partLabel ? { partName: f.partLabel } : {}),
        footprint: f.footprint, // osm | ign | derived
        osm: f.osmRef || null,
        ...(f.ignIds ? { ign: f.ignIds } : {}),
        wikidata: lm.wd || (f.tags && f.tags.wikidata) || null,
        area: Math.round(area),
        center: fromM(c),
        ...(lm.partOf ? { partOf: lm.partOf } : {}),
        ...(f.note ? { note: f.note } : {}),
      },
      geometry: { type: 'Polygon', coordinates: f.poly.map((r) => r.map(fromM)) },
    });
  });
  report.push({ key: lm.key, parts: flat.length, area: Math.round(totalArea), height, heightSource, eave: cov.maxHeight, osmH: oh.own ?? oh.part, src: pieces[0].footprint + (pieces[0].by ? ':' + pieces[0].by : ''), ref: pieces[0].osmRef || (pieces[0].ignIds || []).join('+'), ids: cov.ids.length, cover: cov.coverage == null ? null : Math.round(cov.coverage * 100), dist: Math.round(dist) });
}

const size = writeGeoJSON(path.join(NORM, 'landmarks.geojson'), features);
console.log(`landmarks : ${features.length} polygones pour ${report.length} monuments sur ${LANDMARKS.length} demandés (${(size / 1024).toFixed(0)} Ko)`);
console.log('clé                  morceaux  aire m²  haut.  source-haut.  gouttière  emprise           objet source          bât. retirés  couverture  écart m');
for (const r of report) console.log(`${r.key.padEnd(20)} ${String(r.parts).padStart(4)} ${String(r.area).padStart(10)} ${String(r.height ?? '—').padStart(6)}  ${(r.heightSource || '—').padEnd(12)} ${String(r.eave ?? '—').padStart(8)}   ${r.src.padEnd(17)} ${String(r.ref).padEnd(22)} ${String(r.ids).padStart(6)} ${String(r.cover == null ? '—' : r.cover + ' %').padStart(12)} ${String(r.dist).padStart(8)}`);
// Un même bâtiment générique réclamé par deux monuments (hors relation partOf) est signalé.
const owner = new Map();
for (const f of features) for (const id of f.properties.sourceIds) { const o = owner.get(id); if (o && o !== f.properties.key && f.properties.partOf !== o && !features.some((g) => g.properties.key === o && g.properties.partOf === f.properties.key)) console.error(`landmarks : bâtiment ${id} réclamé par ${o} et ${f.properties.key}`); if (!o) owner.set(id, f.properties.key); }
if (problems.length) { console.error('landmarks : PROBLÈMES\n  ' + problems.join('\n  ')); process.exitCode = 1; }
if (requestLog.size) console.log('requêtes :', JSON.stringify(Object.fromEntries(requestLog)));
writeStatus('landmarks', [
  ...(ignError ? [`IGN BD TOPO indisponible : emprise des ponts tirée d'OpenStreetMap (${ignError.slice(0, 90)})`] : []),
  ...(buildings ? [] : ['couche buildings du lot A absente : sourceIds vides']),
]);
