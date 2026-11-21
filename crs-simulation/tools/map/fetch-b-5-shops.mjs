// fetch-b-5-shops.mjs — couche `shops` : un point par commerce ou service en rez-de-chaussée.
// Sources : Apur — BDCOM 2023 (recensement exhaustif des locaux commerciaux de Paris, un point par local, à l'adresse),
//           complétée par OpenStreetMap là où la BDCOM n'a aucun local (gares, jardins, musées, passages…).
// Sortie : raw/normalized/shops.geojson — props { category, name, group, source, situation, size }.
//   category : libellé d'activité de la source (BDCOM : nomenclature détaillée ; OSM : « clé=valeur »), sans marque ;
//   name     : nom BRUT de l'enseigne (à retirer avant publication : aucune marque dans les données du jeu) ;
//   group    : famille normalisée, commune aux deux sources (voir GROUPS) ;
//   situation: street | corner | courtyard | mall (BDCOM) ou null ; size : s (< 300 m²) | m (300–1000 m²) | l (> 1000 m²) ou null.

import path from 'node:path';
import { RAW_B, NORM, BBOX_M, inBox, toM, fromM, download, jsonValidator, readJson, PointGrid, pointFeature, writeGeoJSON, tally, requestLog, ringCentroid, HostDownError, writeStatus } from './lib-b.mjs';
import { loadOsmExtract } from './fetch-b-1-osm.mjs';

export const GROUPS = ['department_store', 'supermarket', 'grocery', 'bakery', 'food', 'fashion', 'jewelry', 'pharmacy', 'health_beauty', 'beauty', 'home',
  'books_press', 'tobacco', 'electronics', 'culture_leisure', 'florist', 'diy', 'auto', 'restaurant', 'fast_food', 'cafe', 'hotel', 'bank', 'agency',
  'cinema', 'theatre', 'nightclub', 'service', 'medical', 'wholesale', 'office', 'vacant', 'other'];

// ───────────── 1. BDCOM 2023 (Apur) ─────────────
// Couche 1 « Local » : TOUS les locaux en rez-de-chaussée (commerces, locaux vacants, bureaux et ateliers en boutique,
// commerce de gros, médical, spectacles…). La couche 0 ne contient que les commerces actifs ; elle porte en revanche
// le dictionnaire des libellés d'activité.
const SERVICE = 'https://carto2.apur.org/apur/rest/services/BDCOM/bdcom2023/MapServer';
const LAYER = SERVICE + '/1';
const dir = path.join(RAW_B, 'apur', 'bdcom2023-local');
const PAGE = 1000; // maxRecordCount du service

/** Famille normalisée d'un code d'activité BDCOM. */
function bdcomGroup(code, label, type) {
  const c = code || '';
  if (type === 'V') return 'vacant';
  if (/Regroup/.test(label)) { // anciens codes « (Activité Regroupé 2000) … »
    if (/Prêt|Chaussures/.test(label)) return 'fashion';
    if (/meubles|foyer/i.test(label)) return 'home';
    if (/Sport/.test(label)) return 'culture_leisure';
    if (/Fleuriste/.test(label)) return 'florist';
    if (/Restaurant|Brasserie/.test(label)) return 'restaurant';
    if (/Hôtel/.test(label)) return 'hotel';
  }
  if (c === 'GM101') return 'department_store';
  if (/^CA2/.test(c)) return 'supermarket';
  if (/^CA3/.test(c)) return 'grocery';
  if (c === 'CA103' || c === 'CA104') return 'bakery';
  if (/^CA/.test(c)) return 'food';
  if (/^CB3/.test(c)) return 'jewelry';
  if (/^CB/.test(c)) return 'fashion';
  if (c === 'CC101') return 'pharmacy';
  if (/^CC/.test(c)) return 'health_beauty';
  if (/^CD/.test(c)) return 'home';
  if (['CE101', 'CE102', 'CE103', 'CE104', 'CE304'].includes(c)) return 'books_press';
  if (c === 'CE501') return 'tobacco';
  if (/^CE40/.test(c)) return 'electronics';
  if (/^CE/.test(c)) return 'culture_leisure';
  if (/^CF2/.test(c)) return 'florist';
  if (/^CF/.test(c)) return 'diy';
  if (/^CG/.test(c)) return 'auto';
  if (['CH302', 'CH303', 'CH502'].includes(c)) return 'fast_food';
  if (/^CH4/.test(c)) return 'cafe';
  if (/^CH/.test(c)) return 'restaurant';
  if (/^CI/.test(c)) return 'hotel';
  if (/^SA2/.test(c)) return 'beauty';
  if (c === 'SA408') return 'cinema';
  if (c === 'SA404') return 'nightclub';
  if (/^SA/.test(c)) return 'service';
  if (['SB201', 'SB202', 'SB204', 'SB205'].includes(c)) return 'bank';
  if (/^SB/.test(c)) return 'agency';
  if (/^AA/.test(c)) return 'vacant';
  if (/^AD/.test(c)) return 'medical';
  if (/^AE/.test(c)) return 'theatre';
  if (/^AB/.test(c) || type === 'T') return 'wholesale';
  if (/^AC/.test(c) || c === 'AF102' || type === 'B' || type === 'X') return 'office';
  if (type === 'Y') return 'medical';
  if (type === 'Z') return 'theatre';
  return 'other';
}
/** Libellé d'activité sans marque : la nomenclature BDCOM cite quelques enseignes en exemple. */
function cleanLabel(code, label) {
  if (code === 'CA201') return 'Supermarché - magasin populaire';
  if (code === 'SA506') return 'Agence pour l\'emploi';
  return String(label || '')
    .replace(/^\(Activité Regroupé 2000\)\s*/, '')
    .replace(/\s*\((Acadomia|Appart Hotel)[^)]*\)/, '')
    .replace(/\s+/g, ' ').trim();
}
const SIT = { A: 'corner', CC: 'mall', CI: 'courtyard', R: 'street' };
const SIZE = { 1: 's', 2: 'm', 3: 'l' };

const feats = [];
const stats = { bdcom: 0, bdcomOutside: 0, bdcomKiosks: 0, osmCandidates: 0, osmKept: 0, osmNearBdcom: 0, osmSameName: 0, osmIndoorLevel: 0 };
const grid = new PointGrid(30); // locaux BDCOM
const nameGrid = new PointGrid(150);
const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
let bdcomMeta = null, bdcomError = null;
try {
  const layerFile = path.join(dir, 'layer.json');
  await download(LAYER, layerFile, { params: { f: 'json' }, validate: jsonValidator((j) => (Array.isArray(j.fields) ? null : 'description de couche inattendue')) });
  let dom = readJson(layerFile).fields.find((f) => f.name === 'codact')?.domain;
  if (!dom?.codedValues) { // dictionnaire des activités : porté par la couche 0
    const l0 = path.join(dir, 'layer0.json');
    await download(SERVICE + '/0', l0, { params: { f: 'json' }, validate: jsonValidator((j) => (Array.isArray(j.fields) ? null : 'description de couche inattendue')) });
    dom = readJson(l0).fields.find((f) => f.name === 'codact')?.domain;
  }
  const labels = Object.fromEntries((dom?.codedValues || []).map((c) => [c.code, c.name]));
  const unknownCodes = new Set();
  const b = BBOX_M;
  const base = { where: '1=1', geometry: `${b.west.toFixed(6)},${b.south.toFixed(6)},${b.east.toFixed(6)},${b.north.toFixed(6)}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' };
  const countFile = path.join(dir, 'count.json');
  await download(LAYER + '/query', countFile, { params: { ...base, returnCountOnly: 'true', f: 'json' }, validate: jsonValidator((j) => (Number.isFinite(j.count) ? null : 'compte absent')) });
  const expected = readJson(countFile).count;
  let got = 0, pages = 0;
  for (let off = 0; ; off += PAGE, pages++) {
    const dest = path.join(dir, `page-${String(pages).padStart(3, '0')}.json`);
    await download(LAYER + '/query', dest, {
      params: { ...base, outFields: 'OBJECTID,c_ord,num,typ_voie,lib_voie,sit,type,codact,ens,surf,niv18', outSR: '4326', orderByFields: 'OBJECTID', resultOffset: String(off), resultRecordCount: String(PAGE), f: 'json' },
      validate: jsonValidator((j) => (Array.isArray(j.features) ? null : 'pas de tableau features : ' + JSON.stringify(j).slice(0, 160))),
    });
    const page = readJson(dest).features;
    for (const f of page) {
      const a = f.attributes, g = f.geometry;
      if (!g || !Number.isFinite(g.x) || !inBox(g.x, g.y)) { stats.bdcomOutside++; continue; }
      if (a.type === 'K') { stats.bdcomKiosks++; continue; } // kiosques : couche furniture (newsstand)
      if (a.codact && !labels[a.codact]) unknownCodes.add(a.codact);
      const label = labels[a.codact] || (a.type === 'V' ? 'Local vacant' : 'Autre local en rez-de-chaussée');
      const rawName = (a.ens || '').trim();
      const name = !rawName || /NON RENSEIGN/i.test(rawName) ? null : rawName;
      const props = { category: cleanLabel(a.codact, label), name, group: bdcomGroup(a.codact, label, a.type), source: 'bdcom', situation: SIT[a.sit] || null, size: SIZE[a.surf] || null };
      feats.push(pointFeature(g.x, g.y, props));
      const [x, y] = toM([g.x, g.y]);
      grid.add(x, y, 1);
      if (name) nameGrid.add(x, y, normName(name));
      stats.bdcom++;
    }
    got += page.length;
    if (page.length < PAGE) break;
  }
  bdcomMeta = { layer: LAYER, expected, received: got, pages: pages + 1 };
  if (unknownCodes.size) console.error('shops : codes d\'activité BDCOM sans libellé → ' + [...unknownCodes].join(', '));
  if (got !== expected) console.error(`shops : BDCOM — ${got} locaux reçus pour ${expected} annoncés`);
} catch (e) {
  if (!(e instanceof HostDownError)) throw e;
  bdcomError = String(e.message);
  console.error('shops : BDCOM indisponible, la couche ne contiendra qu\'OpenStreetMap → ' + bdcomError);
  feats.length = 0;
}

// ───────────── 2. OpenStreetMap (complément) ─────────────
/** Famille normalisée et libellé « clé=valeur » d'un objet OSM, ou null s'il ne s'agit pas d'un commerce. */
function osmShop(t) {
  const s = t.shop, a = t.amenity, to = t.tourism, o = t.office, l = t.leisure, cr = t.craft;
  const cat = (k, v) => `${k}=${v}`;
  if (s) {
    if (s === 'no' || s === 'kiosk' || s === 'ticket') return null; // kiosques : couche furniture ; guichets de transport : hors sujet
    const g = s === 'vacant' ? 'vacant'
      : /^(department_store|mall)$/.test(s) ? 'department_store'
      : s === 'supermarket' ? 'supermarket'
      : /^(convenience|general|frozen_food)$/.test(s) ? 'grocery'
      : /^(bakery|pastry)$/.test(s) ? 'bakery'
      : /^(butcher|cheese|chocolate|confectionery|deli|greengrocer|seafood|alcohol|wine|tea|coffee|beverages|dairy|health_food|spices|farm|pasta|nuts)$/.test(s) ? 'food'
      : /^(clothes|shoes|bag|fashion_accessories|boutique|leather|tailor|fabric|sewing|wool|baby_goods|fashion)$/.test(s) ? 'fashion'
      : /^(jewelry|watches)$/.test(s) ? 'jewelry'
      : /^(chemist|optician|cosmetics|perfumery|medical_supply|hearing_aids|herbalist|nutrition_supplements|cannabis)$/.test(s) ? 'health_beauty'
      : /^(hairdresser|beauty|massage|tattoo|piercing)$/.test(s) ? 'beauty'
      : /^(furniture|interior_decoration|kitchen|houseware|bed|carpet|curtain|lighting|antiques|bathroom_furnishing|household_linen|tableware|appliance|second_hand|variety_store|candles)$/.test(s) ? 'home'
      : /^(books|newsagent|stationery|kiosk)$/.test(s) ? 'books_press'
      : /^(tobacco|e-cigarette)$/.test(s) ? 'tobacco'
      : /^(mobile_phone|electronics|computer|hifi|video_games|camera|telecommunication)$/.test(s) ? 'electronics'
      : /^(art|gift|toys|sports|music|musical_instrument|games|photo|frame|craft|collector|outdoor|bicycle|pet|ticket|lottery|erotic|video|anime|model|trophy|souvenir|religion)$/.test(s) ? 'culture_leisure'
      : /^(florist|garden_centre)$/.test(s) ? 'florist'
      : /^(doityourself|hardware|paint|trade|electrical|flooring|tiles|glaziery)$/.test(s) ? 'diy'
      : /^(car|car_repair|car_parts|motorcycle|motorcycle_repair|tyres)$/.test(s) ? 'auto'
      : /^(travel_agency|estate_agent|money_lender|pawnbroker|insurance)$/.test(s) ? 'agency'
      : /^(laundry|dry_cleaning|copyshop|locksmith|funeral_directors|shoe_repair|printing|rental|storage_rental|pet_grooming|repair)$/.test(s) ? 'service'
      : 'other';
    return { group: g, category: cat('shop', s) };
  }
  if (a) {
    const g = /^(restaurant|food_court)$/.test(a) ? 'restaurant' : /^(fast_food|ice_cream)$/.test(a) ? 'fast_food' : /^(cafe|bar|pub|biergarten)$/.test(a) ? 'cafe'
      : /^(bank|bureau_de_change)$/.test(a) ? 'bank' : a === 'pharmacy' ? 'pharmacy' : a === 'cinema' ? 'cinema' : a === 'theatre' ? 'theatre' : a === 'nightclub' ? 'nightclub'
      : /^(post_office|car_rental|driving_school|internet_cafe|language_school)$/.test(a) ? (a === 'post_office' || a === 'car_rental' ? 'agency' : 'service')
      : /^(doctors|dentist|clinic|veterinary)$/.test(a) ? 'medical' : null;
    return g ? { group: g, category: cat('amenity', a) } : null;
  }
  if (to && /^(hotel|hostel|guest_house|apartment|motel)$/.test(to)) return { group: 'hotel', category: cat('tourism', to) };
  if (o && /^(estate_agent|insurance|travel_agent|employment_agency)$/.test(o)) return { group: 'agency', category: cat('office', o) };
  if (l && /^(fitness_centre|escape_game|amusement_arcade|dance|bowling_alley)$/.test(l)) return { group: 'service', category: cat('leisure', l) };
  if (cr && /^(shoemaker|tailor|dressmaker|key_cutter|locksmith|jeweller|watchmaker|optician|photographer|caterer|bakery|confectionery|electronics_repair)$/.test(cr)) return { group: cr === 'caterer' || cr === 'bakery' || cr === 'confectionery' ? 'food' : 'service', category: cat('craft', cr) };
  return null;
}
const osm = await loadOsmExtract();
const onlyOsm = bdcomError != null; // BDCOM absente : OSM devient la source unique
const osmSeen = new PointGrid(10);
const consider = (tags, lon, lat) => {
  const m = osmShop(tags); if (!m) return;
  if (!inBox(lon, lat)) return;
  stats.osmCandidates++;
  const lvl = tags.level != null ? String(tags.level).trim() : null;
  const [x, y] = toM([lon, lat]);
  if (!onlyOsm) {
    if (grid.nearest(x, y, 30)) { stats.osmNearBdcom++; return; }
    const nn = normName(tags.name);
    if (nn.length >= 4 && nameGrid.nearest(x, y, 150, (d) => d === nn)) { stats.osmSameName++; return; }
  }
  if (osmSeen.nearest(x, y, 1.5, (d) => d === m.category)) return; // nœud et chemin décrivant le même commerce
  osmSeen.add(x, y, m.category);
  if (lvl && !/^0(\.0)?$/.test(lvl)) stats.osmIndoorLevel++;
  feats.push(pointFeature(lon, lat, { category: m.category, name: tags.name || null, group: m.group, source: 'osm', situation: lvl && !/^0(\.0)?$/.test(lvl) ? 'mall' : null, size: null }));
  stats.osmKept++;
};
for (const n of osm.nodes) consider(n.tags, n.lon, n.lat);
for (const w of osm.ways) { if (!w.closed) continue; if (!osmShop(w.tags)) continue; const [clon, clat] = fromM(ringCentroid(w.coords.map(toM))); consider(w.tags, clon, clat); }

// ───────────── Sortie ─────────────
const size = writeGeoJSON(path.join(NORM, 'shops.geojson'), feats);
console.log(`shops : ${feats.length} commerces (${(size / 1e6).toFixed(2)} Mo)`);
console.log('shops :', JSON.stringify(stats), bdcomMeta ? JSON.stringify(bdcomMeta) : 'BDCOM ABSENTE : ' + bdcomError);
console.log('shops : par famille', JSON.stringify(tally(feats, (f) => f.properties.group)));
console.log('shops : par source', JSON.stringify(tally(feats, (f) => f.properties.source)), '— situation', JSON.stringify(tally(feats, (f) => f.properties.situation)));
console.log('shops : sans nom', feats.filter((f) => !f.properties.name).length, '— catégories distinctes', new Set(feats.map((f) => f.properties.category)).size);
if (requestLog.size) console.log('requêtes :', JSON.stringify(Object.fromEntries(requestLog)));
writeStatus('shops', bdcomError ? [`Apur BDCOM indisponible : commerces OpenStreetMap seuls (${bdcomError.slice(0, 90)})`] : []);
