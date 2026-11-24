// fetch-b-6-signals-metro.mjs — couches `signals` (feux tricolores, passages piétons) et `metro` (stations, bouches).
// Sources :
//   signals : Ville de Paris « Signalisation lumineuse tricolore » (un point par SUPPORT de feux, sur le trottoir)
//             + OpenStreetMap highway=traffic_signals (nœud sur l'axe de la chaussée, là où la circulation s'arrête)
//             + OpenStreetMap highway=crossing (passage piéton, sur l'axe de la chaussée).
//   metro   : Île-de-France Mobilités « Gares et stations du réseau ferré d'Île-de-France (par ligne) » pour les
//             stations et leurs lignes ; OpenStreetMap railway=subway_entrance / train_station_entrance pour les
//             bouches, rattachées à leur station par le référentiel des accès d'Île-de-France Mobilités ;
//             accès du référentiel absents d'OSM ajoutés en complément.
// Sorties : raw/normalized/signals.geojson, raw/normalized/metro.geojson.

import path from 'node:path';
import { RAW_B, NORM, inBox, bboxWithMargin, toM, odsExport, odsMeta, odsInBox, PointGrid, pointFeature, writeGeoJSON, tally, requestLog, publicName, writeStatus, orDegraded } from './lib-b.mjs';
import { loadOsmExtract } from './fetch-b-1-osm.mjs';

const osm = await loadOsmExtract();

// ═════════════════════════════ SIGNALS ═════════════════════════════
const signals = [];
const sStats = { parisRecords: 0, parisPoles: 0, osmJunctions: 0, osmCrossings: 0, crossingsWithSignals: 0 };
const degraded = [];
await orDegraded(degraded, 'Ville de Paris « signalisation-tricolore » indisponible : aucun support de feux, nœuds OpenStreetMap seuls', async () => {
  const ds = 'signalisation-tricolore';
  const meta = await odsMeta('opendata.paris.fr', ds, path.join(RAW_B, 'paris', ds + '.meta.json'));
  const { records } = await odsExport('opendata.paris.fr', ds, path.join(RAW_B, 'paris', ds + '.json'), {
    where: `${odsInBox('geo_point_2d')} and lib_domain='Signalisation Tricolore'`,
    select: 'cod_ouvrag,foyer,lib_ouvrag,lib_lumi_1,lib_supp_1,geo_point_2d',
  });
  sStats.parisRecords = records.length;
  sStats.parisMeta = meta;
  // Un enregistrement par foyer lumineux ; on regroupe par ouvrage (le support).
  const poles = new Map();
  for (const r of records) {
    const g = r.geo_point_2d; if (!g || !r.cod_ouvrag) continue;
    let p = poles.get(r.cod_ouvrag);
    if (!p) poles.set(r.cod_ouvrag, (p = { lon: 0, lat: 0, n: 0, vehicle: 0, repeater: 0, ped: 0, supports: new Map(), facade: false }));
    p.lon += g.lon; p.lat += g.lat; p.n++;
    const l = r.lib_lumi_1 || '';
    if (/^Phare/.test(l)) p.vehicle++; else if (/^Répétiteur/.test(l)) p.repeater++; else if (/Piéton/.test(l)) p.ped++;
    if (/Façade/.test(r.lib_ouvrag || '')) p.facade = true;
    if (r.lib_supp_1) p.supports.set(r.lib_supp_1, (p.supports.get(r.lib_supp_1) || 0) + 1);
  }
  const supportOf = (p) => {
    if (p.facade) return 'facade';
    const top = [...p.supports.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return /Candélabre/.test(top) ? 'lamp_post' : /provisoire/.test(top) ? 'temporary' : /de style/.test(top) ? 'style' : /standard/.test(top) ? 'standard' : top ? 'other' : null;
  };
  for (const [ref, p] of poles) {
    const lon = p.lon / p.n, lat = p.lat / p.n;
    if (!inBox(lon, lat)) continue;
    signals.push(pointFeature(lon, lat, { kind: 'traffic_signals', sub: 'pole', vehicle: p.vehicle, repeater: p.repeater, ped: p.ped, support: supportOf(p), ref, source: 'paris' }));
    sStats.parisPoles++;
  }
});
for (const n of osm.nodes) {
  const hw = n.tags.highway || '';
  if (/(^|;)traffic_signals(;|$)/.test(hw)) {
    signals.push(pointFeature(n.lon, n.lat, { kind: 'traffic_signals', sub: 'junction', dir: n.tags['traffic_signals:direction'] || null, source: 'osm' }));
    sStats.osmJunctions++;
  }
  if (/(^|;)crossing(;|$)/.test(hw)) {
    const c = n.tags.crossing || '', mk = n.tags['crossing:markings'];
    const lit = c === 'traffic_signals' || n.tags['crossing:signals'] === 'yes' || /traffic_signals/.test(hw);
    const marked = mk ? mk !== 'no' : !/unmarked|informal|no/.test(c);
    signals.push(pointFeature(n.lon, n.lat, { kind: 'crossing', signals: lit, marked, island: n.tags['crossing:island'] === 'yes', source: 'osm' }));
    sStats.osmCrossings++; if (lit) sStats.crossingsWithSignals++;
  }
}
const sSize = writeGeoJSON(path.join(NORM, 'signals.geojson'), signals);
console.log(`signals : ${signals.length} objets (${(sSize / 1e6).toFixed(2)} Mo)`, JSON.stringify(tally(signals, (f) => f.properties.kind + (f.properties.sub ? ':' + f.properties.sub : ''))));
console.log('signals :', JSON.stringify(sStats));
console.log('signals : supports', JSON.stringify(tally(signals.filter((f) => f.properties.sub === 'pole'), (f) => f.properties.support)));

// ═════════════════════════════ METRO ═════════════════════════════
const IDFM = 'data.iledefrance-mobilites.fr';
const wide = bboxWithMargin(400); // les stations juste hors emprise servent à nommer les bouches situées dedans
const c2 = (name) => path.join(RAW_B, 'idfm', name);
const idfm = await orDegraded(degraded, 'Île-de-France Mobilités indisponible : stations tirées d\'OpenStreetMap, lignes inconnues', async () => ({
  metas: {
    gares: await odsMeta(IDFM, 'emplacement-des-gares-idf', c2('emplacement-des-gares-idf.meta.json')),
    acces: await odsMeta(IDFM, 'acces', c2('acces.meta.json')),
    relations: await odsMeta(IDFM, 'relations-acces', c2('relations-acces.meta.json')),
  },
  gares: (await odsExport(IDFM, 'emplacement-des-gares-idf', c2('emplacement-des-gares-idf.json'), {
  where: odsInBox('geo_point_2d', wide), select: 'nom_gares,nom_zdc,id_ref_zdc,id_ref_zda,mode,indice_lig,res_com,exploitant,geo_point_2d' })).records,
  acces: (await odsExport(IDFM, 'acces', c2('acces.json'), {
  where: odsInBox('accgeopoint', wide), select: 'accid,accname,accshortname,accisentry,accisexit,fournisseurname,accgeopoint' })).records,
  relations: (await odsExport(IDFM, 'relations-acces', c2('relations-acces.json'), { select: 'zdaid,accid' })).records,
}), null);
const metas = idfm?.metas || {}, gares = idfm?.gares || [], acces = idfm?.acces || [], relations = idfm?.relations || [];

const lineLabel = (mode, ind) => { const m = String(mode || '').toUpperCase(), i = String(ind || '').trim(); return m === 'METRO' ? i : m === 'RER' ? 'RER ' + i : m === 'TRAIN' ? (/^TER/i.test(i) ? 'TER' : 'TRAIN ' + i) : m === 'TRAMWAY' ? 'T' + i.replace(/^T/i, '') : (m + ' ' + i).trim(); };
const lineOrder = (l) => { const m = /^(\d+)(bis)?$/.exec(l); return m ? [0, Number(m[1]) + (m[2] ? 0.5 : 0), ''] : /^RER/.test(l) ? [1, 0, l] : [2, 0, l]; };
const sortLines = (ls) => [...ls].sort((a, b) => { const x = lineOrder(a), y = lineOrder(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]); });

// Stations : une par zone de correspondance (id_ref_zdc) — « Châtelet » et « Châtelet-Les Halles » restent distinctes.
const stations = new Map();
const zdaToStation = new Map();
for (const r of gares) {
  const g = r.geo_point_2d; if (!g) continue;
  const key = String(r.id_ref_zdc ?? r.nom_zdc ?? r.nom_gares);
  let s = stations.get(key);
  if (!s) stations.set(key, (s = { key, names: new Map(), lines: new Set(), modes: new Set(), pts: [] }));
  s.names.set(r.nom_gares, (s.names.get(r.nom_gares) || 0) + 1);
  s.lines.add(lineLabel(r.mode, r.indice_lig));
  s.modes.add(String(r.mode || '').toLowerCase());
  s.pts.push([g.lon, g.lat]);
  if (r.id_ref_zda != null) zdaToStation.set(String(r.id_ref_zda), key);
}
// Repli sans Île-de-France Mobilités : nœuds railway=station d'OpenStreetMap (nom seul, lignes inconnues).
if (!idfm) for (const n of osm.nodes) {
  if (n.tags.railway !== 'station' || !n.tags.name) continue;
  const key = 'osm:' + n.id;
  stations.set(key, { key, names: new Map([[n.tags.name, 1]]), lines: new Set(), modes: new Set([n.tags.station === 'subway' || n.tags.subway === 'yes' ? 'metro' : 'train']), pts: [[n.lon, n.lat]] });
}
const stationGrid = new PointGrid(200);
for (const s of stations.values()) {
  s.name = [...s.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
  s.lon = s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length; s.lat = s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length;
  s.linesSorted = sortLines(s.lines);
  for (const p of s.pts) { const [x, y] = toM(p); stationGrid.add(x, y, s.key); }
}
const accToZda = new Map();
for (const r of relations) { const k = String(r.accid); if (!accToZda.has(k)) accToZda.set(k, []); accToZda.get(k).push(String(r.zdaid)); }
const accGrid = new PointGrid(30);
const accList = [];
for (const a of acces) {
  const g = a.accgeopoint; if (!g) continue;
  const st = (accToZda.get(String(a.accid)) || []).map((z) => zdaToStation.get(z)).find(Boolean) || null;
  const item = { id: String(a.accid), lon: g.lon, lat: g.lat, name: a.accname || null, ref: a.accshortname != null ? String(a.accshortname) : null, station: st, used: false };
  accList.push(item);
  const [x, y] = toM([g.lon, g.lat]); accGrid.add(x, y, item);
}

const metro = [];
const mStats = { stationsWide: stations.size, stations: 0, osmEntrances: 0, osmSkippedIndoor: 0, byAccess: 0, byNearestStation: 0, unassigned: 0, idfmAccesses: accList.length, idfmAdded: 0, idfmNoStation: 0 };
for (const s of stations.values()) {
  if (!inBox(s.lon, s.lat)) continue;
  metro.push(pointFeature(s.lon, s.lat, { kind: 'station', name: s.name, lines: s.linesSorted, modes: [...s.modes].sort(), ref: s.key, source: idfm ? 'idfm' : 'osm' }));
  mStats.stations++;
}
const subOf = (s) => (s ? (s.modes.has('metro') ? 'metro' : s.modes.has('rer') ? 'rer' : 'train') : null);
const entranceGrid = new PointGrid(20);
for (const n of osm.nodes) {
  const rw = n.tags.railway || '';
  if (!/subway_entrance|train_station_entrance/.test(rw)) continue;
  const lvl = n.tags.level != null ? String(n.tags.level).trim() : null;
  // Une bouche de métro est par nature l'accès depuis la rue ; une entrée de gare n'est gardée qu'au niveau de la voirie.
  if (!/subway_entrance/.test(rw) && (n.tags.indoor === 'yes' || (lvl && !/^0(\.0)?$/.test(lvl)))) { mStats.osmSkippedIndoor++; continue; }
  const [x, y] = toM([n.lon, n.lat]);
  let st = null, how = null;
  const a = accGrid.nearest(x, y, 25, (d) => d.station != null);
  if (a) { st = stations.get(a.data.station); how = 'access'; a.data.used = true; }
  for (const o of accGrid.within(x, y, 12)) o.data.used = true; // accès du référentiel représentés par cette bouche
  if (!st) { const near = stationGrid.nearest(x, y, 350); if (near) { st = stations.get(near.data); how = 'nearest'; } }
  if (how === 'access') mStats.byAccess++; else if (how === 'nearest') mStats.byNearestStation++; else mStats.unassigned++;
  metro.push(pointFeature(n.lon, n.lat, { kind: 'entrance', name: st ? st.name : null, lines: st ? st.linesSorted : [], sub: /subway_entrance/.test(rw) ? (subOf(st) || 'metro') : (subOf(st) === 'metro' ? 'train' : subOf(st) || 'train'),
    exit: publicName(n.tags.name), ref: n.tags.ref || null, matched: how, source: 'osm' }));
  entranceGrid.add(x, y, 1);
  mStats.osmEntrances++;
}
// Complément : accès du référentiel sans bouche OSM à moins de 25 m.
for (const a of accList) {
  if (a.used || !inBox(a.lon, a.lat)) continue;
  const [x, y] = toM([a.lon, a.lat]);
  if (entranceGrid.nearest(x, y, 25)) continue;
  let st = a.station ? stations.get(a.station) : null, how = st ? 'access' : null;
  if (!st) { const near = stationGrid.nearest(x, y, 350); if (near) { st = stations.get(near.data); how = 'nearest'; } }
  if (!st) { mStats.idfmNoStation++; continue; } // accès d'un arrêt qui n'est ni métro, ni RER, ni train
  metro.push(pointFeature(a.lon, a.lat, { kind: 'entrance', name: st.name, lines: st.linesSorted, sub: subOf(st), exit: publicName(a.name), ref: a.ref, matched: how, source: 'idfm' }));
  entranceGrid.add(x, y, 1);
  mStats.idfmAdded++;
}
const mSize = writeGeoJSON(path.join(NORM, 'metro.geojson'), metro);
console.log(`metro : ${metro.length} objets (${(mSize / 1024).toFixed(0)} Ko)`, JSON.stringify(tally(metro, (f) => f.properties.kind + ':' + (f.properties.sub || f.properties.modes?.join('+')))));
console.log('metro :', JSON.stringify(mStats));
console.log('metro : jeux', JSON.stringify(metas));
const noEntrance = metro.filter((f) => f.properties.kind === 'station' && !metro.some((e) => e.properties.kind === 'entrance' && e.properties.name === f.properties.name)).map((f) => f.properties.name);
console.log(`metro : stations de l'emprise sans aucune bouche rattachée (${noEntrance.length}) : ${noEntrance.join(', ') || '—'}`);
if (requestLog.size) console.log('requêtes :', JSON.stringify(Object.fromEntries(requestLog)));
writeStatus('signals-metro', degraded);
