// fetch-a-3-paris.mjs — Open data de la Ville de Paris (opendata.paris.fr, API Explore v2.1) :
// polygones réels de chaussée, de trottoir, terre-pleins, îlots directionnels, aires mixtes, voies d'eau,
// emprises d'espaces verts, espaces verts nommés, filaire des voies (noms officiels).
//
//   node tools/map/fetch-a-3-paris.mjs [--force]
//
// Licence de tous ces jeux : Open Database License (ODbL) — attribution « Ville de Paris » (direction productrice
// indiquée dans docs/map-sources-a.md).
// Sorties (cache) : raw/paris/<jeu>.geojson (export GeoJSON filtré sur l'emprise + marge) et raw/paris/index.json.

import fs from 'node:fs';
import path from 'node:path';
import { RAW, BBOX_M, download } from './lib-a.mjs';

const force = process.argv.includes('--force');
const API = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets';
const f6 = (v) => v.toFixed(6);
const poly = `POLYGON((${f6(BBOX_M.west)} ${f6(BBOX_M.south)},${f6(BBOX_M.east)} ${f6(BBOX_M.south)},${f6(BBOX_M.east)} ${f6(BBOX_M.north)},${f6(BBOX_M.west)} ${f6(BBOX_M.north)},${f6(BBOX_M.west)} ${f6(BBOX_M.south)}))`;

/** Jeux retenus : identifiant, champ géométrique, champs conservés. */
export const DATASETS = [
  { id: 'plan-de-voirie-chaussees', geo: 'geo_shape', select: 'objectid,lib_classe' },
  { id: 'plan-de-voirie-trottoirs-emprises', geo: 'geo_shape', select: 'igds_element_association_id,num_pave,lib_classe' },
  { id: 'plan-de-voirie-terre-pleins', geo: 'geo_shape', select: 'objectid,lib_classe' },
  { id: 'plan-de-voirie-ilots-directionnels', geo: 'geo_shape', select: 'objectid,lib_classe' },
  { id: 'plan-de-voirie-aires-mixtes-vehicules-et-pietons', geo: 'geo_shape', select: 'objectid,lib_classe' },
  { id: 'plan-de-voirie-voies-deau', geo: 'geo_shape', select: 'objectid,lib_classe' },
  { id: 'plan-de-voirie-emprises-espaces-verts', geo: 'geo_shape', select: 'objectid,lib_classe' },
  { id: 'plan-de-voirie-emprises-ilots-prives', geo: 'geo_shape', select: 'objectid,lib_classe' },
  { id: 'espaces_verts', geo: 'geom', select: 'nsq_espace_vert,nom_ev,type_ev,categorie,presence_cloture,ouvert_ferme,surface_totale_reelle' },
  { id: 'voie', geo: 'geom', select: 'n_sq_vo,c_desi,l_longmin,c_domoff' },
];

const validGeojson = (buf) => {
  try {
    const j = JSON.parse(buf.toString('utf8'));
    return j.type === 'FeatureCollection' && Array.isArray(j.features) ? null : 'pas une FeatureCollection';
  } catch {
    return `JSON illisible (${buf.subarray(0, 160).toString('utf8').replace(/\s+/g, ' ')})`;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = [];
  for (const ds of DATASETS) {
    const dest = path.join(RAW, 'paris', `${ds.id}.geojson`);
    const metaDest = path.join(RAW, 'paris', `${ds.id}.meta.json`);
    // métadonnées du jeu (titre, licence, producteur, date de mise à jour) — utiles pour l'attribution
    await download(`${API}/${ds.id}`, metaDest, { force, validate: (b) => (b.includes('"dataset_id"') ? null : 'métadonnées inattendues') });
    const r = await download(`${API}/${ds.id}/exports/geojson`, dest, {
      force,
      validate: validGeojson,
      timeoutS: 600,
      params: { where: `intersects(${ds.geo}, geom'${poly}')`, select: `${ds.select},${ds.geo}` },
    });
    const n = JSON.parse(fs.readFileSync(dest, 'utf8')).features.length;
    const m = JSON.parse(fs.readFileSync(metaDest, 'utf8')).metas?.default || {};
    index.push({ id: ds.id, title: m.title, license: m.license, publisher: m.publisher, modified: m.modified, features: n, bytes: fs.statSync(dest).size });
    console.log(`${ds.id} : ${n} objets, ${(fs.statSync(dest).size / 1e6).toFixed(1)} Mo${r.cached ? ' [cache]' : ''} — ${m.license} — ${m.publisher}`);
  }
  fs.writeFileSync(path.join(RAW, 'paris', 'index.json'), JSON.stringify(index, null, 1));
}
