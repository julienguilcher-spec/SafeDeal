/* =====================================================================================
 * CARTE DE PARIS — construction des BÂTIMENTS
 * -------------------------------------------------------------------------------------
 * Entrée : raw/normalized/buildings.geojson (emprises BD TOPO, attributs OSM) et
 * landmarks.geojson (bâtiments remplacés par un monument).
 * Traitements : projection, simplification à 0,3 m qui respecte les murs mitoyens, retrait des
 * éclats de moins de 8 m², hauteur manquante déduite du voisinage, toit et style par
 * heuristique, hauteur totale = gouttière + toit, altitude de base, clé de monument.
 * ===================================================================================== */
import {
  M, readLayer, projectRing, orient, signedArea, simplifyRing, dedupeRing, bboxOf, orientedBox, BoxGrid, SegGrid,
  median, clamp, round1, hasTile, T,
} from './build-lib.mjs';
import { selfIntersectsAtFormatPrecision, removeSpikes, convexHull, simpleRings } from './build-clip.mjs';
import { isCommercialName } from './build-names.mjs';

/** Tolérance de simplification des emprises (m). */
export const BUILDING_TOLERANCE = 0.3;
/** Surface minimale d'un bâtiment (m²). */
export const MIN_BUILDING_AREA = 8;
/** Surface minimale d'une cour intérieure (m²) : en dessous, le trou est comblé. */
export const MIN_HOLE_AREA = 5;

const KIND_OF_SOURCE = {
  residential: 'residential', commercial: 'retail', office: 'office', public: 'public', religious: 'religious',
  monument: 'monument', industrial: 'industrial', station: 'station', hotel: 'hotel', school: 'school',
  hospital: 'hospital', other: 'generic',
};

// Sous-types des bâtiments publics, d'après leur nom (institutions publiques : noms conservés).
const RE_POLICE = /\b(commissariat|pr[ée]fecture de police|gendarmerie|garde r[ée]publicaine|h[ôo]tel de police)\b/i;
const RE_FIRE = /\b(pompiers|centre de secours)\b/i;
const RE_GOVERNMENT = /\b(minist[èe]re|ambassade|consulat|mairie|h[ôo]tel de ville|pr[ée]fecture|assembl[ée]e nationale|s[ée]nat|palais bourbon|palais de l'[ée]lys[ée]e|h[ôo]tel de matignon|h[ôo]tel matignon|premier ministre|conseil d'[ée]tat|conseil constitutionnel|cour des comptes|cour de justice|palais de justice|tribunal|cour d'appel|cour de cassation|direction r[ée]gionale|direction g[ée]n[ée]rale|haut-commissariat|chancellerie)\b/i;
const RE_CULTURE = /\b(mus[ée]e|th[ée][âa]tre|op[ée]ra|biblioth[èe]que|cin[ée]math[èe]que|conservatoire|galerie nationale|centre culturel|maison de la culture|archives nationales|palais de tokyo|grand palais|petit palais|atelier)\b/i;

function publicSubKind(name) {
  if (name === null) return 'public';
  if (RE_POLICE.test(name)) return 'police';
  if (RE_FIRE.test(name)) return 'fire_station';
  if (RE_GOVERNMENT.test(name)) return 'government';
  if (RE_CULTURE.test(name)) return 'culture';
  return 'public';
}

const ROOF_OF_OSM = {
  mansard: 'mansard', gambrel: 'mansard',
  gabled: 'gabled', hipped: 'gabled', saltbox: 'gabled', skillion: 'gabled', pyramidal: 'gabled', 'half-hipped': 'gabled',
  side_hipped: 'gabled', double_saltbox: 'gabled', quadruple_saltbox: 'gabled', many: 'gabled', double_skillion: 'gabled',
  flat: 'flat', dome: 'dome', round: 'dome',
};

const MONUMENTAL_KINDS = new Set(['public', 'government', 'religious', 'culture', 'monument', 'station', 'police', 'fire_station']);
const BLANK_KINDS = new Set(['industrial', 'parking', 'construction']);

/** Paramètres de trame repris de src/world/view/buildings/layout.ts (rez-de-chaussée, étage). */
const FLOOR = { haussmann: [4.0, 3.2], faubourg: [3.5, 3.0], modern: [3.8, 3.1], monumental: [5.0, 4.6] };

/** Hauteur réservée au toit pour une hauteur de gouttière G (même règle que le rendu, résolue pour la hauteur totale). */
function roofHeight(roof, G, span) {
  switch (roof) {
    case 'mansard': return clamp((0.16 * G) / 0.84, 2.2, 3.3);
    case 'gabled': return Math.min(4.0, Math.max(1.2, span * 0.28), 0.538 * G);
    case 'dome': return Math.min(Math.max(span * 0.45, 1.5), G);
    default: return 0;
  }
}

/**
 * @param ctx { heightAt, landmarkParts, brands }
 * @returns { list, byId, grid (BoxGrid des boîtes), facades (SegGrid des côtés extérieurs), report }
 */
export function buildBuildings(ctx) {
  const fc = readLayer('buildings');
  const report = { source: fc.features.length };

  // Bâtiment -> clé du monument qui le remplace (la plus petite emprise l'emporte en cas de doublon).
  // ctx.landmarkParts vient de build-landmarks.mjs : une entrée par morceau, clé de sortie unique.
  const landmarkOf = new Map();
  {
    const parts = ctx.landmarkParts.slice().sort((a, b) => b.area - a.area);
    for (const p of parts) for (const id of p.sourceIds) landmarkOf.set(id, p.key);
  }

  // 1. Projection et sommets partagés (clé = coordonnées géographiques à 7 décimales).
  const items = [];
  const shared = new Map();
  let ringSeq = 0;
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type !== 'Polygon' || g.coordinates.length === 0) continue;
    const rings = [];
    for (let r = 0; r < g.coordinates.length; r++) {
      const coords = g.coordinates[r];
      let n = coords.length;
      if (n >= 2 && coords[0][0] === coords[n - 1][0] && coords[0][1] === coords[n - 1][1]) n--;
      const ringId = ringSeq++;
      const keys = new Array(n);
      for (let i = 0; i < n; i++) {
        const k = `${coords[i][0]},${coords[i][1]}`;
        keys[i] = k;
        const list = shared.get(k);
        if (list === undefined) shared.set(k, [ringId]);
        else if (list[list.length - 1] !== ringId) list.push(ringId);
      }
      rings.push({ pts: projectRing(coords), keys, n });
    }
    items.push({ f, rings });
  }

  // 2. Simplification : un sommet où le voisinage change (début ou fin d'un mur mitoyen) est conservé.
  const sig = (k) => {
    const l = shared.get(k);
    return l.length === 1 ? '' : l.join(',');
  };
  const out = [];
  let droppedSmall = 0, droppedHoles = 0, vertsIn = 0, vertsOut = 0, outside = 0, relaxed = 0, namesRemoved = 0, spikes = 0, hulls = 0, unkinked = 0;
  for (const it of items) {
    const simplified = [];
    for (let r = 0; r < it.rings.length; r++) {
      const ring = it.rings[r];
      const n = ring.n;
      vertsIn += n;
      let must = null;
      if (n > 3) {
        must = new Uint8Array(n);
        const s = ring.keys.map(sig);
        for (let i = 0; i < n; i++) {
          const prev = s[(i + n - 1) % n], next = s[(i + 1) % n];
          if (s[i] !== prev || s[i] !== next) must[i] = 1;
        }
      }
      // Si la simplification fait se recouper l'anneau (au décimètre du format), on la relâche ;
      // si la source elle-même se recoupe, on en retire les épines, et en dernier recours
      // l'emprise devient son enveloppe convexe (polygones BD TOPO mêlant deux faces).
      let pts = ring.pts;
      for (const tol of [BUILDING_TOLERANCE, BUILDING_TOLERANCE / 3, 0.03]) {
        pts = dedupeRing(simplifyRing(ring.pts, tol, must), 0.05);
        if (!selfIntersectsAtFormatPrecision(pts)) break;
        if (tol === BUILDING_TOLERANCE) relaxed++;
      }
      if (selfIntersectsAtFormatPrecision(pts)) {
        pts = dedupeRing(simplifyRing(removeSpikes(ring.pts), BUILDING_TOLERANCE), 0.05);
        if (!selfIntersectsAtFormatPrecision(pts) && pts.length >= 6) spikes++;
        else if (r === 0) {
          // Contour défait en anneaux simples : on garde le plus grand ; à défaut, l'enveloppe convexe.
          const fixed = simpleRings(pts, 4);
          if (fixed.rings.length > 0 && fixed.unresolved === 0) { pts = fixed.rings[0]; unkinked++; }
          else { pts = convexHull(ring.pts); hulls++; }
        } else pts = [];
      }
      simplified.push(pts);
    }
    let outer = simplified[0];
    if (outer.length < 6) { droppedSmall++; continue; }
    outer = orient(outer, true);
    let area = Math.abs(signedArea(outer));
    const holes = [];
    for (let r = 1; r < simplified.length; r++) {
      const h = simplified[r];
      if (h.length < 6) { droppedHoles++; continue; }
      const ha = Math.abs(signedArea(h));
      if (ha < MIN_HOLE_AREA) { droppedHoles++; continue; }
      holes.push(orient(h, false));
      area -= ha;
    }
    if (area < MIN_BUILDING_AREA) { droppedSmall++; continue; }
    const bb = bboxOf(outer);
    const tx = Math.floor((bb.minX + bb.maxX) / 2 / T), tz = Math.floor((bb.minZ + bb.maxZ) / 2 / T);
    if (!hasTile(tx, tz)) { outside++; continue; }
    vertsOut += outer.length >> 1;
    for (const h of holes) vertsOut += h.length >> 1;
    const p = it.f.properties;
    let name = typeof p.name === 'string' && p.name !== '' ? p.name : null;
    if (name !== null && isCommercialName(name, ctx.brands)) { name = null; namesRemoved++; }
    out.push({
      srcId: p.id, srcKind: p.kind, name, roofShape: p.roofShape ?? null, srcHeight: p.height ?? null,
      srcLevels: p.levels ?? null, source: p.source, outer, holes, area, bb, tx, tz,
    });
  }
  report.droppedUnder8m2 = droppedSmall;
  report.droppedHoles = droppedHoles;
  report.outsideTiles = outside;
  report.simplificationRelaxed = relaxed;
  report.spikesRemoved = spikes;
  report.unkinked = unkinked;
  report.replacedByConvexHull = hulls;
  report.commercialNamesRemoved = namesRemoved;
  report.vertices = { before: vertsIn, after: vertsOut };

  // 3. Identifiants stables.
  const ids = new Set();
  for (const b of out) {
    let id = 0;
    let m = /^BATIMENT0*(\d+)$/.exec(b.srcId);
    if (m !== null) id = Number(m[1]) * 4;                 // multiple de 4 : jamais un identifiant OSM
    else if ((m = /^osm:w(\d+)$/.exec(b.srcId)) !== null) id = M.osmStableId('way', Number(m[1]));
    else if ((m = /^osm:r(\d+)$/.exec(b.srcId)) !== null) id = M.osmStableId('relation', Number(m[1]));
    if (!(id > 0) || !Number.isSafeInteger(id)) throw new Error(`bâtiment : identifiant source inattendu « ${b.srcId} »`);
    if (ids.has(id)) throw new Error(`bâtiment : identifiant en double ${id} (${b.srcId})`);
    ids.add(id);
    b.id = id;
  }

  // 4. Hauteur de gouttière manquante : d'après le voisinage.
  const grid = new BoxGrid(64);
  for (const b of out) grid.add(b.bb.minX, b.bb.minZ, b.bb.maxX, b.bb.maxZ);
  let missing = 0, fromNeighbours = 0, annexes = 0;
  for (const b of out) b.gutter = b.srcHeight !== null && b.srcHeight >= 1.5 ? b.srcHeight : null;
  for (const b of out) {
    if (b.gutter !== null) continue;
    missing++;
    const near = [];
    grid.forEachInRect(b.bb.minX - 25, b.bb.minZ - 25, b.bb.maxX + 25, b.bb.maxZ + 25, (j) => {
      const o = out[j];
      if (o !== b && o.srcHeight !== null && o.srcHeight >= 1.5 && o.area >= 40) near.push(o.srcHeight);
    });
    const around = near.length >= 3 ? median(near) : 15;
    let h;
    if (b.area < 30) { h = 3.5; annexes++; }                     // appentis, édicule de cour
    else if (b.area < 80) { h = Math.min(around, 6.5); annexes++; }   // annexe à un étage
    else { h = around; fromNeighbours++; }
    b.gutter = round1(h);
    b.heightEstimated = true;
  }
  report.heightMissing = missing;
  report.heightFromNeighbours = fromNeighbours;
  report.heightAnnexRule = annexes;

  // 5. Type, style, toit, hauteur totale, niveaux, base, monument.
  const kinds = {}, styles = {}, roofs = {};
  let landmarked = 0, levelsKept = 0, levelsEstimated = 0;
  for (const b of out) {
    let kind = KIND_OF_SOURCE[b.srcKind];
    if (kind === undefined) throw new Error(`bâtiment : nature source inconnue « ${b.srcKind} »`);
    if (kind === 'public') kind = publicSubKind(b.name);
    const G = b.gutter, A = b.area;
    const box = orientedBox(b.outer);
    const span = Math.min(box.width, (4 * A) / Math.max(1, 2 * (box.length + box.width)));
    let style, roof;
    if (BLANK_KINDS.has(kind) || G > 30) { style = 'modern'; roof = 'flat'; }
    else if (MONUMENTAL_KINDS.has(kind) && A >= 200 && G >= 8) {
      style = 'monumental';
      roof = kind === 'religious' || kind === 'station' ? 'gabled' : G >= 12 ? 'mansard' : 'flat';
    } else if (G < 4.5) { style = 'faubourg'; roof = 'flat'; }
    else if (G < 9) { style = 'faubourg'; roof = A >= 40 ? 'gabled' : 'flat'; }
    else if (G < 15) { style = 'faubourg'; roof = 'gabled'; }
    else { style = 'haussmann'; roof = 'mansard'; }            // 15 à 30 m, tissu ancien
    const osmRoof = b.roofShape !== null ? ROOF_OF_OSM[b.roofShape] : undefined;
    if (osmRoof !== undefined) {
      roof = osmRoof;
      if (osmRoof === 'flat' && style === 'haussmann') style = 'modern';
    }
    // La hauteur OSM (34 bâtiments) est déjà une hauteur totale ; celle de la BD TOPO s'arrête à la gouttière.
    const total = b.source === 'osm' && !b.heightEstimated ? Math.max(G, 2) : G + roofHeight(roof, G, span);
    b.kind = kind;
    b.style = style;
    b.roof = roof;
    b.height = round1(clamp(total, 2, 500));
    // Niveaux : la source si elle donne des étages plausibles, sinon d'après la gouttière.
    const [rdc, floor] = FLOOR[style];
    let lv = 0;
    if (b.srcLevels !== null && b.srcLevels >= 1) {
      const per = G / b.srcLevels;
      if (per >= 2.4 && per <= 4.6) { lv = b.srcLevels; levelsKept++; }
    }
    if (lv === 0) { lv = G < rdc + floor * 0.8 ? 1 : 1 + Math.max(1, Math.round((G - rdc) / floor)); levelsEstimated++; }
    b.levels = lv;
    // Base : altitude minimale de l'emprise (même règle que le rendu).
    let base = Infinity;
    for (let i = 0; i < b.outer.length; i += 2) {
      const y = ctx.heightAt(b.outer[i], b.outer[i + 1]);
      if (y < base) base = y;
    }
    b.baseY = round1(base);
    b.landmarkKey = landmarkOf.get(b.srcId) ?? '';
    if (b.landmarkKey !== '') landmarked++;
    b.hasShop = false;
    kinds[kind] = (kinds[kind] || 0) + 1;
    styles[style] = (styles[style] || 0) + 1;
    roofs[roof] = (roofs[roof] || 0) + 1;
  }
  report.kept = out.length;
  report.kinds = kinds;
  report.styles = styles;
  report.roofs = roofs;
  report.landmarked = landmarked;
  report.levelsFromSource = levelsKept;
  report.levelsEstimated = levelsEstimated;
  report.named = out.filter((b) => b.name !== null).length;

  // 6. Index des côtés extérieurs (façades) et accès par identifiant.
  const facades = new SegGrid(16);
  for (let i = 0; i < out.length; i++) facades.addRing(out[i].outer, i);
  const bySrcId = new Map();
  for (const b of out) bySrcId.set(b.srcId, b);
  return { list: out, grid, facades, bySrcId, report };
}

/** Le point est-il dans un bâtiment ? Retourne son indice ou -1. `skip` = indice à ignorer. */
export function buildingAt(buildings, x, z, skip = -1) {
  let found = -1;
  buildings.grid.forEachInRect(x, z, x, z, (j) => {
    if (found >= 0 || j === skip) return;
    const b = buildings.list[j];
    if (x < b.bb.minX || x > b.bb.maxX || z < b.bb.minZ || z > b.bb.maxZ) return;
    if (M.pointInPolygon(b.outer, b.holes, x, z)) found = j;
  });
  return found;
}

/** Range les bâtiments dans leurs tuiles (après que les commerces ont fixé « generic » ou « residential »). */
export function emitBuildings(buildings, tiles) {
  const kinds = {};
  let withShops = 0;
  for (const b of buildings.list) {
    // « generic » = immeuble courant à commerces en rez-de-chaussée ; « residential » = sans vitrine.
    const kind = b.kind === 'residential' && b.hasShop ? 'generic' : b.kind;
    if (kind !== b.kind) withShops++;
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    tiles.get(b.tx, b.tz).buildings.push({
      id: b.id, kind, roof: b.roof, style: b.style, baseY: b.baseY, height: b.height, levels: b.levels,
      outer: b.outer, holes: b.holes, landmarkKey: b.landmarkKey, name: b.name ?? '',
    });
  }
  // Décompte des types tels qu'ils sont publiés (le rapport de buildBuildings les donne avant les commerces).
  buildings.report.kindsPublished = kinds;
  buildings.report.residentialTurnedGeneric = withShops;
}
