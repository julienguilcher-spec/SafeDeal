// fetch-a-2-ign.mjs — IGN BD TOPO® (WFS de la Géoplateforme) : bâtiments avec hauteur, tronçons de route
// avec largeur de chaussée, surfaces hydrographiques, constructions linéaires (quais, murs) et surfaciques.
//
//   node tools/map/fetch-a-2-ign.mjs [--force]
//
// Source : https://data.geopf.fr/wfs/ows (couches BDTOPO_V3:*), Licence Ouverte / Open Licence 2.0 (Etalab).
// Attribution : « IGN — BD TOPO® ».
// Sorties (cache) : raw/ign/<couche>/page-<n>.json (pages WFS brutes) et raw/ign/<couche>.json (index : nombre, pages).

import fs from 'node:fs';
import path from 'node:path';
import { RAW, BBOX_M, download } from './lib-a.mjs';

const force = process.argv.includes('--force');
const WFS = 'https://data.geopf.fr/wfs/ows';
const PAGE = 5000; // maximum servi par page (CountDefault du service)
const LAYERS = ['batiment', 'troncon_de_route', 'surface_hydrographique', 'construction_lineaire', 'construction_surfacique'];
// BBOX en EPSG:4326 avec l'URN : ordre lat,lon
const bbox = `${BBOX_M.south.toFixed(6)},${BBOX_M.west.toFixed(6)},${BBOX_M.north.toFixed(6)},${BBOX_M.east.toFixed(6)},urn:ogc:def:crs:EPSG::4326`;

const validJson = (buf) => {
  try {
    const j = JSON.parse(buf.toString('utf8'));
    return Array.isArray(j.features) ? null : 'pas de tableau features';
  } catch (e) {
    return `JSON illisible (${buf.subarray(0, 120).toString('utf8').replace(/\s+/g, ' ')})`;
  }
};

for (const layer of LAYERS) {
  const dir = path.join(RAW, 'ign', layer);
  let start = 0, page = 0, total = 0, matched = null;
  const pages = [];
  for (;;) {
    const dest = path.join(dir, `page-${String(page).padStart(3, '0')}.json`);
    const r = await download(WFS, dest, {
      force,
      validate: validJson,
      params: {
        SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
        TYPENAMES: `BDTOPO_V3:${layer}`,
        BBOX: bbox,
        SRSNAME: 'EPSG:4326',
        OUTPUTFORMAT: 'application/json',
        SORTBY: 'cleabs',
        COUNT: String(PAGE),
        STARTINDEX: String(start),
      },
    });
    const j = JSON.parse(fs.readFileSync(dest, 'utf8'));
    matched ??= j.numberMatched ?? j.totalFeatures ?? null;
    total += j.features.length;
    pages.push(path.basename(dest));
    console.log(`  ${layer} page ${page} : ${j.features.length} objets${r.cached ? ' [cache]' : ''}`);
    if (j.features.length < PAGE) break;
    start += PAGE; page++;
  }
  fs.writeFileSync(path.join(RAW, 'ign', `${layer}.json`), JSON.stringify({ layer: `BDTOPO_V3:${layer}`, bbox, count: total, numberMatched: matched, pages }, null, 1));
  console.log(`${layer} : ${total} objets (annoncés : ${matched})`);
  if (matched !== null && matched !== total) console.error(`  ! écart entre le nombre annoncé (${matched}) et le nombre reçu (${total})`);
}
