/* =====================================================================================
 * CARTE DE PARIS — construction des SURFACES au sol et des BARRIÈRES
 * -------------------------------------------------------------------------------------
 * Entrée : raw/normalized/areas.geojson (eau, parcs, places, chaussées, trottoirs, îlots…) et
 * barriers.geojson (murs, grilles, haies, murs de quai).
 * Traitements : projection, simplification, découpage PROPRE par tuile (chaque morceau est un
 * polygone simple avec ses trous), ordre de superposition, niveau des plans d'eau, hauteur des
 * barrières.
 *
 * Ordre de superposition retenu (du dessous vers le dessus) : celui du lot A (champ `z`), avec
 * une différence : TOUTE l'eau passe au-dessus. Les chaussées et trottoirs du plan de voirie
 * franchissent en effet la Seine sur les ponts, et le format veut qu'aucune surface ne recouvre
 * l'eau (le tablier d'un pont vient de son arête). Le fleuve masque donc ces morceaux.
 * ===================================================================================== */
import {
  M, readLayer, projectPolygons, projectLine, simplifyRing, simplifyLine, dedupeRing, signedArea, polygonArea, bboxOf,
  ringCentroid, tilePolygon, tilePolyline, BoxGrid, pointInPoly, polylineLength, median, clamp, round1, clipStats,
  selfIntersectsAtFormatPrecision, removeSpikes,
} from './build-lib.mjs';

/** Rang de superposition de l'eau : au-dessus de tout. */
const RANK_WATER = 9;

/** Noms écartés : ce ne sont pas des toponymes publics (relevés à la lecture des données). */
const NAME_BLOCKLIST = new Set(['fruitier Paris', 'Auditorium', 'Potager', 'Dépose minute', 'Parking handicapé']);

/** Nature du format, rang, tolérance de simplification (m), surface minimale (m²), nom conservé ? */
function classify(p) {
  const sub = p.sub ?? '';
  switch (p.kind) {
    case 'courtyard': return { kind: 'courtyard', tol: 0.4, min: 4, named: false };
    case 'water': return { kind: 'water', tol: 0.3, min: 1, named: true, rank: RANK_WATER };
    case 'plaza': return { kind: 'plaza', tol: 0.25, min: 2, named: true };
    case 'park': return { kind: 'park', tol: 0.4, min: 4, named: true };
    case 'garden':
      if (sub === 'grass') return { kind: 'grass', tol: 0.3, min: 2, named: true };
      return { kind: 'garden', tol: 0.3, min: 2, named: sub !== 'private' };
    case 'cemetery': return { kind: 'cemetery', tol: 0.4, min: 4, named: true };
    case 'construction': return { kind: 'construction', tol: 0.4, min: 4, named: false };
    case 'pedestrian': return { kind: 'pedestrian', tol: 0.25, min: 2, named: true };
    case 'roadway': return { kind: 'road', tol: 0.15, min: 1, named: false };
    case 'sidewalk': return { kind: sub === 'median' || sub === 'traffic_island' ? 'median' : 'sidewalk', tol: 0.15, min: 0.8, named: false };
    case 'parking': return { kind: 'parking', tol: 0.3, min: 4, named: false };
    case 'sports': return { kind: 'sports', tol: 0.3, min: 4, named: false };
    default: throw new Error(`surfaces : nature source inconnue « ${p.kind} »`);
  }
}

/**
 * Lit, projette et simplifie les surfaces. Retourne { list, sidewalks } où `sidewalks` permet de
 * savoir si un point est sur un trottoir (utilisé pour estimer la largeur des trottoirs).
 */
export function prepareAreas() {
  const fc = readLayer('areas');
  const list = [];
  const report = { source: fc.features.length, droppedSmall: 0, droppedHoles: 0, simplificationRelaxed: 0, spikesRemoved: 0, selfIntersectingKept: 0, vertices: { before: 0, after: 0 }, byKind: {} };
  for (const f of fc.features) {
    const p = f.properties;
    const c = classify(p);
    const rank = c.rank ?? (Number.isFinite(p.z) ? p.z : 5);
    const name = c.named && typeof p.name === 'string' && p.name !== '' && !NAME_BLOCKLIST.has(p.name) ? p.name : '';
    for (const poly of projectPolygons(f.geometry)) {
      report.vertices.before += poly.outer.length >> 1;
      for (const h of poly.holes) report.vertices.before += h.length >> 1;
      // Si la simplification fait se recouper le contour (au décimètre du format), on la relâche.
      let outer = poly.outer;
      for (const tol of [c.tol, c.tol / 3, 0.03]) {
        outer = dedupeRing(simplifyRing(poly.outer, tol), 0.05);
        if (!selfIntersectsAtFormatPrecision(outer)) break;
        if (tol === c.tol) report.simplificationRelaxed++;
      }
      if (selfIntersectsAtFormatPrecision(outer)) {
        // La source se recoupe (plan de voirie) : on retire les épines ; s'il en reste, le contour est gardé tel quel.
        const cleaned = dedupeRing(simplifyRing(removeSpikes(poly.outer), c.tol), 0.05);
        if (cleaned.length >= 6 && !selfIntersectsAtFormatPrecision(cleaned)) { outer = cleaned; report.spikesRemoved++; }
        else report.selfIntersectingKept++;
      }
      if (outer.length < 6 || Math.abs(signedArea(outer)) < c.min) { report.droppedSmall++; continue; }
      const holes = [];
      for (const h of poly.holes) {
        const s = dedupeRing(simplifyRing(h, c.tol), 0.05);
        if (s.length < 6 || Math.abs(signedArea(s)) < 1) { report.droppedHoles++; continue; }
        holes.push(s);
      }
      const item = { kind: c.kind, rank, name, sub: p.sub ?? '', poly: { outer, holes }, area: 0, bb: bboxOf(outer), level: null };
      item.area = polygonArea(item.poly);
      if (item.area < c.min) { report.droppedSmall++; continue; }
      report.vertices.after += outer.length >> 1;
      for (const h of holes) report.vertices.after += h.length >> 1;
      list.push(item);
    }
  }
  const sidewalkItems = list.filter((s) => s.kind === 'sidewalk');
  const grid = new BoxGrid(32);
  for (const s of sidewalkItems) grid.add(s.bb.minX, s.bb.minZ, s.bb.maxX, s.bb.maxZ);
  const onSidewalk = (x, z) => {
    let found = false;
    grid.forEachInRect(x, z, x, z, (i) => {
      if (found) return;
      const s = sidewalkItems[i];
      if (x < s.bb.minX || x > s.bb.maxX || z < s.bb.minZ || z > s.bb.maxZ) return;
      if (pointInPoly(s.poly, x, z)) found = true;
    });
    return found;
  };
  return { list, onSidewalk, report };
}

/** Polygones du fleuve et des canaux, pour le relief. */
export function waterBodies(areas) {
  return areas.list.filter((s) => s.kind === 'water' && (s.sub === 'river' || s.sub === 'canal')).map((s) => ({ poly: s.poly, river: s.sub === 'river' }));
}

/** Range les surfaces dans les tuiles, dans l'ordre de superposition. */
export function emitSurfaces(areas, tiles, ctx) {
  const report = areas.report;
  const levels = [];
  for (const s of areas.list) {
    if (s.kind !== 'water') continue;
    if (s.sub === 'river') s.level = ctx.waterLevel;
    else {
      // Canal, bassin, fontaine : au plus bas du sol qui l'entoure, moins la revanche de la margelle.
      let low = Infinity;
      for (let i = 0; i < s.poly.outer.length; i += 2) low = Math.min(low, ctx.heightAt(s.poly.outer[i], s.poly.outer[i + 1]));
      let level = low - (s.sub === 'canal' ? 1.5 : 0.2);
      if (s.sub === 'canal') {
        // Le modèle de terrain brut voit la surface d'un bassin assez large : on la prend si elle est plus basse.
        const [cx, cz] = ringCentroid(s.poly.outer);
        if (pointInPoly(s.poly, cx, cz)) level = Math.min(level, ctx.rawNgfAt(cx, cz) - ctx.offset);
      }
      s.level = round1(level);
      if (s.name !== '') levels.push({ name: s.name, sub: s.sub, level: s.level });
    }
  }
  const before = { ...clipStats };
  const perTile = new Map();
  let pieces = 0;
  for (let i = 0; i < areas.list.length; i++) {
    const s = areas.list[i];
    for (const piece of tilePolygon(s.poly)) {
      const a = polygonArea(piece.poly);
      if (a < 0.3) continue;
      const tile = tiles.get(piece.tx, piece.tz);
      let list = perTile.get(tile);
      if (list === undefined) { list = []; perTile.set(tile, list); }
      list.push({ rank: s.rank, area: a, seq: i, surface: { kind: s.kind, name: s.name, level: s.level, outer: piece.poly.outer, holes: piece.poly.holes } });
      pieces++;
      const k = (report.byKind[s.kind] ??= { pieces: 0, areaM2: 0 });
      k.pieces++;
      k.areaM2 += a;
    }
  }
  for (const [tile, list] of perTile) {
    // Du dessous vers le dessus ; à rang égal, les grandes surfaces d'abord.
    list.sort((u, v) => u.rank - v.rank || v.area - u.area || u.seq - v.seq);
    for (const it of list) tile.surfaces.push(it.surface);
  }
  for (const k of Object.values(report.byKind)) k.areaM2 = Math.round(k.areaM2);
  report.polygons = areas.list.length;
  report.pieces = pieces;
  report.clip = { whole: clipStats.whole - before.whole, split: clipStats.split - before.split, fallbackSutherlandHodgman: clipStats.fallback - before.fallback };
  report.waterLevels = levels;
  return report;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Barrières
// ─────────────────────────────────────────────────────────────────────────────────────

const BARRIER_KIND = { wall: 'wall', fence: 'fence', railing: 'railing', hedge: 'hedge', quay_wall: 'quay_wall' };
/** Hauteur par défaut (m) quand la source ne la donne pas (241 lignes sur 3 631 la donnent). */
const BARRIER_HEIGHT = { wall: 2.4, fence: 1.8, railing: 1.1, hedge: 1.2 };
const BARRIER_SUB_HEIGHT = { retaining: 2.0, city_wall: 6.0, jersey: 0.8 };

export function buildBarriers(tiles, ctx) {
  const fc = readLayer('barriers');
  const report = { source: fc.features.length, pieces: 0, byKind: {}, heightFromSource: 0, quayWallHeights: null };
  const quay = [];
  for (const f of fc.features) {
    const p = f.properties;
    const kind = BARRIER_KIND[p.kind];
    if (kind === undefined) throw new Error(`barrières : nature source inconnue « ${p.kind} »`);
    const pts = simplifyLine(projectLine(f.geometry.coordinates), 0.2);
    const len = polylineLength(pts);
    if (len < 0.5) continue;
    let height;
    if (Number.isFinite(p.height) && p.height > 0) { height = clamp(p.height, 0.3, 30); report.heightFromSource++; }
    else if (kind === 'quay_wall') {
      // Dénivelée de part et d'autre du mur, lue dans le modèle de terrain brut (pas de 25 m : valeur lissée).
      const diffs = [];
      for (let i = 2; i < pts.length; i += 2) {
        const mx = (pts[i - 2] + pts[i]) / 2, mz = (pts[i - 1] + pts[i + 1]) / 2;
        const dx = pts[i] - pts[i - 2], dz = pts[i + 1] - pts[i - 1];
        const l = Math.hypot(dx, dz);
        if (l < 0.5) continue;
        const nx = -dz / l, nz = dx / l;
        diffs.push(Math.abs(ctx.rawNgfAt(mx + nx * 15, mz + nz * 15) - ctx.rawNgfAt(mx - nx * 15, mz - nz * 15)));
      }
      height = round1(clamp(diffs.length > 0 ? median(diffs) * 1.3 : 0, 1.5, 11));
      quay.push(height);
    } else height = BARRIER_SUB_HEIGHT[p.sub] ?? BARRIER_HEIGHT[kind];
    for (const piece of tilePolyline(pts)) {
      if (polylineLength(piece.points) < 0.3) continue;
      tiles.get(piece.tx, piece.tz).barriers.push({ kind, height, points: piece.points });
      report.pieces++;
      const k = (report.byKind[kind] ??= { pieces: 0, km: 0 });
      k.pieces++;
      k.km += polylineLength(piece.points) / 1000;
    }
  }
  for (const k of Object.values(report.byKind)) k.km = round1(k.km);
  if (quay.length > 0) {
    quay.sort((a, b) => a - b);
    report.quayWallHeights = { lines: quay.length, min: quay[0], median: quay[quay.length >> 1], max: quay[quay.length - 1] };
  }
  return report;
}
