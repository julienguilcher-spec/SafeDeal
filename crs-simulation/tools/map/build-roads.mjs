/* =====================================================================================
 * CARTE DE PARIS — construction du GRAPHE ROUTIER
 * -------------------------------------------------------------------------------------
 * Entrée : raw/normalized/roads.geojson (arêtes OSM déjà coupées aux carrefours) et
 * signals.geojson (nœuds de feux et passages piétons, posés sur l'axe des chaussées).
 * Traitements :
 *   - retrait des pistes cyclables (pas de classe dans le format) et des voies souterraines
 *     (listées dans le rapport) ; les ponts sont conservés ;
 *   - coupe de chaque arête à ses feux et passages piétons, qui deviennent des nœuds ;
 *   - fusion des nœuds reliés par une arête très courte ; fusion des arêtes de mêmes attributs
 *     de part et d'autre d'un nœud de passage sans rôle ;
 *   - largeur de chaussée, voies, vitesse, revêtement ; trottoirs estimés d'après la distance
 *     aux façades ;
 *   - contrôle de connexité des voies carrossables.
 * ===================================================================================== */
import {
  M, readLayer, px, pz, SegGrid, simplifyLine, polylineLength, pointAlong, distToSegment, median, clamp, round1,
  BOUNDS, SOURCE_MARGIN, publicWayName,
} from './build-lib.mjs';
import { buildingAt } from './build-buildings.mjs';

/** Longueur (m) en dessous de laquelle une arête est contractée : ses deux nœuds n'en font qu'un. */
export const MERGE_NODE_DIST = 2.5;
/** Diamètre maximal (m) d'un groupe de nœuds fusionnés. */
const MERGE_MAX_SPAN = 5;
/** Distance maximale (m) pour rattacher un feu ou un passage piéton à une chaussée dont il n'est pas un sommet. */
const SNAP_SIGNAL_DIST = 3;
/** Tolérance de simplification des axes (m). */
const ROAD_TOLERANCE = 0.25;
/** Longueur totale (m) en dessous de laquelle un cheminement piéton isolé du reste du graphe est retiré. */
const MIN_ISOLATED_FOOTPATH = 25;
/** Part minimale des arêtes carrossables dans la plus grande composante connexe. */
export const MIN_MAIN_COMPONENT = 0.97;

const CLASS_OF = {
  primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', residential: 'residential', living: 'residential',
  service: 'service', pedestrian: 'pedestrian', footway: 'footway', steps: 'footway',
};
const PEDESTRIAN = new Set(['pedestrian', 'footway', 'steps']);
const SURFACE_OF = { asphalt: 'asphalt', sett: 'sett', paved: 'paving', gravel: 'gravel' };
/** Largeur de chaussée par défaut (m) quand ni la source ni le nombre de voies ne la donnent. */
const DEFAULT_WIDTH = { primary: 12, secondary: 9, tertiary: 7, residential: 5, living: 4, service: 3.5, pedestrian: 5, footway: 2.5, steps: 2.5 };
/** Trottoir par défaut (m) quand aucune façade ne permet de l'estimer. */
const DEFAULT_SIDEWALK = { primary: 4, secondary: 3.5, tertiary: 3, residential: 2, living: 0, service: 0 };
const LANE_WIDTH = 3.2;

export function buildRoads(ctx) {
  const fc = readLayer('roads');
  const signalsFc = readLayer('signals');
  const report = { source: fc.features.length, excluded: { cycleway: 0, underground: 0 }, underground: [] };
  const key = (c) => `${c[0]},${c[1]}`;

  // ── A. Filtrage ──
  const raw = [];
  for (const f of fc.features) {
    const p = f.properties;
    const coords = f.geometry.coordinates;
    if (f.geometry.type !== 'LineString' || coords.length < 2) continue;
    if (CLASS_OF[p.class] === undefined) {
      if (p.class === 'cycleway') { report.excluded.cycleway++; continue; }
      throw new Error(`voies : classe inconnue « ${p.class} »`);
    }
    const layer = p.layer ?? 0;
    if (p.tunnel === true || layer <= -2 || (layer < 0 && p.covered === true)) {
      let len = 0;
      for (let i = 1; i < coords.length; i++) len += Math.hypot(px(coords[i][0]) - px(coords[i - 1][0]), pz(coords[i][1]) - pz(coords[i - 1][1]));
      report.excluded.underground++;
      report.underground.push({ id: p.id, name: p.name ?? '', class: p.class, layer, lengthM: Math.round(len), reason: p.tunnel === true ? 'tunnel' : layer <= -2 ? 'niveau ≤ -2' : 'couvert en sous-sol' });
      continue;
    }
    raw.push({ p, coords: coords.slice() });
  }

  // ── B. Feux et passages piétons : ils deviennent des nœuds ──
  const endpointKeys = new Set();
  const interior = new Map();          // clé -> [{ e, i }]
  for (let e = 0; e < raw.length; e++) {
    const c = raw[e].coords;
    endpointKeys.add(key(c[0]));
    endpointKeys.add(key(c[c.length - 1]));
  }
  for (let e = 0; e < raw.length; e++) {
    const c = raw[e].coords;
    for (let i = 1; i < c.length - 1; i++) {
      const k = key(c[i]);
      const list = interior.get(k);
      if (list === undefined) interior.set(k, [{ e, i }]);
      else list.push({ e, i });
    }
  }
  const rawGrid = new SegGrid(32);
  for (let e = 0; e < raw.length; e++) {
    if (PEDESTRIAN.has(raw[e].p.class)) continue;
    const c = raw[e].coords;
    for (let i = 1; i < c.length; i++) rawGrid.add(px(c[i - 1][0]), pz(c[i - 1][1]), px(c[i][0]), pz(c[i][1]), e, i - 1);
  }
  const nodeFlags = new Map();          // clé -> bits
  const splitKeys = raw.map(() => new Set());
  const inserts = raw.map(() => []);    // { seg, t, c }
  const sigStats = { signalNodes: 0, crossings: 0, crossingsWithSignals: 0, onNode: 0, onVertex: 0, snapped: 0, unmatched: 0 };
  for (const f of signalsFc.features) {
    const p = f.properties;
    let bits = 0;
    if (p.kind === 'traffic_signals' && p.sub === 'junction') { bits = M.NODE_SIGNAL; sigStats.signalNodes++; }
    else if (p.kind === 'crossing') {
      bits = M.NODE_CROSSING;
      sigStats.crossings++;
      if (p.signals === true || p.signals === 'yes') { bits |= M.NODE_SIGNAL; sigStats.crossingsWithSignals++; }
    } else continue;
    const c = f.geometry.coordinates;
    const k = key(c);
    if (endpointKeys.has(k)) {
      nodeFlags.set(k, (nodeFlags.get(k) ?? 0) | bits);
      sigStats.onNode++;
      // Le même point peut aussi être un sommet intérieur d'une autre arête : on la coupe aussi.
    }
    const hits = interior.get(k);
    if (hits !== undefined) {
      for (const h of hits) splitKeys[h.e].add(k);
      nodeFlags.set(k, (nodeFlags.get(k) ?? 0) | bits);
      if (!endpointKeys.has(k)) sigStats.onVertex++;
      continue;
    }
    if (endpointKeys.has(k)) continue;
    const x = px(c[0]), z = pz(c[1]);
    const near = rawGrid.nearest(x, z, SNAP_SIGNAL_DIST);
    if (near === null) { sigStats.unmatched++; continue; }
    const e = rawGrid.tag[near.i], seg = rawGrid.tag2[near.i];
    const rc = raw[e].coords;
    if (near.t < 0.02 || near.t > 0.98) {
      // Tout près d'un sommet existant : on le réutilise.
      const v = near.t < 0.5 ? seg : seg + 1;
      const vk = key(rc[v]);
      nodeFlags.set(vk, (nodeFlags.get(vk) ?? 0) | bits);
      if (v > 0 && v < rc.length - 1) splitKeys[e].add(vk);
    } else {
      const a = rc[seg], b = rc[seg + 1];
      const nc = [a[0] + (b[0] - a[0]) * near.t, a[1] + (b[1] - a[1]) * near.t];
      inserts[e].push({ seg, t: near.t, c: nc });
      nodeFlags.set(key(nc), (nodeFlags.get(key(nc)) ?? 0) | bits);
      splitKeys[e].add(key(nc));
    }
    sigStats.snapped++;
  }
  report.signals = sigStats;

  // ── C. Coupe des arêtes, création des nœuds ──
  const nodes = [];                     // { x, z, flags, alive }
  const nodeOfKey = new Map();
  const nodeId = (c) => {
    const k = key(c);
    let id = nodeOfKey.get(k);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ x: px(c[0]), z: pz(c[1]), flags: nodeFlags.get(k) ?? 0 });
      nodeOfKey.set(k, id);
    }
    return id;
  };
  const edges = [];                     // { a, b, pts, p, alive }
  let splitCount = 0;
  for (let e = 0; e < raw.length; e++) {
    const r = raw[e];
    if (inserts[e].length > 0) {
      inserts[e].sort((u, v) => v.seg - u.seg || v.t - u.t);
      for (const ins of inserts[e]) r.coords.splice(ins.seg + 1, 0, ins.c);
    }
    const c = r.coords;
    let start = 0;
    for (let i = 1; i < c.length; i++) {
      const cut = i === c.length - 1 || splitKeys[e].has(key(c[i]));
      if (!cut) continue;
      const pts = [];
      for (let k = start; k <= i; k++) pts.push(px(c[k][0]), pz(c[k][1]));
      edges.push({ a: nodeId(c[start]), b: nodeId(c[i]), pts, p: r.p, alive: true });
      if (i < c.length - 1) splitCount++;
      start = i;
    }
  }
  report.splitsAtSignals = splitCount;
  report.nodesBeforeMerge = nodes.length;
  report.edgesBeforeMerge = edges.length;

  // ── D. Fusion des nœuds proches : contraction des arêtes très courtes ──
  const parent = nodes.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const members = new Map();            // racine -> [nœuds]
  const membersOf = (r) => members.get(r) ?? [r];
  const short = [];
  for (let e = 0; e < edges.length; e++) {
    const ed = edges[e];
    if (ed.a === ed.b) continue;
    const len = polylineLength(ed.pts);
    if (len < MERGE_NODE_DIST) short.push({ e, len });
  }
  short.sort((u, v) => u.len - v.len || u.e - v.e);
  let contracted = 0;
  for (const s of short) {
    const ed = edges[s.e];
    const ra = find(ed.a), rb = find(ed.b);
    if (ra === rb) continue;
    const ma = membersOf(ra), mb = membersOf(rb);
    let span = 0;
    for (const u of ma) for (const v of mb) span = Math.max(span, Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z));
    if (span > MERGE_MAX_SPAN) continue;
    const root = Math.min(ra, rb), other = Math.max(ra, rb);
    parent[other] = root;
    members.set(root, ma.concat(mb));
    members.delete(other);
    contracted++;
  }
  // Position du groupe : le membre le plus connecté (à égalité, le plus petit indice).
  const degree0 = new Int32Array(nodes.length);
  for (const ed of edges) { degree0[ed.a]++; degree0[ed.b]++; }
  const rep = new Map();
  for (const [root, list] of members) {
    let best = list[0], flags = 0;
    for (const u of list) {
      flags |= nodes[u].flags;
      if (degree0[u] > degree0[best] || (degree0[u] === degree0[best] && u < best)) best = u;
    }
    rep.set(root, { x: nodes[best].x, z: nodes[best].z, flags });
  }
  let removedShort = 0;
  for (const ed of edges) {
    const ra = find(ed.a), rb = find(ed.b);
    const na = rep.get(ra), nb = rep.get(rb);
    if (na !== undefined) { ed.pts[0] = na.x; ed.pts[1] = na.z; }
    if (nb !== undefined) { ed.pts[ed.pts.length - 2] = nb.x; ed.pts[ed.pts.length - 1] = nb.z; }
    ed.a = ra; ed.b = rb;
    if (ra === rb && polylineLength(ed.pts) < 6) { ed.alive = false; removedShort++; }
  }
  for (const [root, r] of rep) { nodes[root].x = r.x; nodes[root].z = r.z; nodes[root].flags = r.flags; }
  report.nodesMerged = contracted;
  report.edgesRemovedByMerge = removedShort;

  // ── E. Fusion des arêtes de part et d'autre d'un nœud de passage ──
  const sigOf = (p) => [p.name ?? '', p.class, p.width ?? '', p.lanes ?? '', p.oneway ? 1 : 0, p.bridge ? 1 : 0, p.surface ?? '', p.maxspeed ?? '', p.covered ? 1 : 0, p.layer ?? 0].join('|');
  const adj = nodes.map(() => []);
  for (let e = 0; e < edges.length; e++) {
    if (!edges[e].alive) continue;
    adj[edges[e].a].push(e);
    if (edges[e].b !== edges[e].a) adj[edges[e].b].push(e);
  }
  const reverse = (ed) => {
    const out = [];
    for (let i = ed.pts.length - 2; i >= 0; i -= 2) out.push(ed.pts[i], ed.pts[i + 1]);
    ed.pts = out;
    const t = ed.a; ed.a = ed.b; ed.b = t;
  };
  let chained = 0;
  for (let n = 0; n < nodes.length; n++) {
    if (adj[n].length !== 2 || nodes[n].flags !== 0) continue;
    const e1 = adj[n][0], e2 = adj[n][1];
    if (e1 === e2) continue;
    const A = edges[e1], B = edges[e2];
    if (A.a === A.b || B.a === B.b) continue;
    if (sigOf(A.p) !== sigOf(B.p)) continue;
    const oneway = A.p.oneway === true && !PEDESTRIAN.has(A.p.class);
    // On veut A : … -> n, puis B : n -> …
    if (oneway) {
      if (A.b === n && B.a === n) { /* déjà dans l'ordre */ }
      else if (B.b === n && A.a === n) continue;      // traité depuis l'autre arête ci-dessous
      else continue;                                  // deux sens uniques opposés : pas une voie continue
    } else {
      if (A.b !== n) reverse(A);
      if (B.a !== n) reverse(B);
    }
    if (A.a === B.b) continue;                        // ne pas fabriquer de boucle
    for (let i = 2; i < B.pts.length; i++) A.pts.push(B.pts[i]);
    const far = B.b;
    A.b = far;
    B.alive = false;
    adj[n].length = 0;
    const k = adj[far].indexOf(e2);
    if (k >= 0) adj[far][k] = e1;
    chained++;
  }
  // Sens uniques dont l'ordre était inversé (B avant A) : seconde passe symétrique.
  for (let n = 0; n < nodes.length; n++) {
    if (adj[n].length !== 2 || nodes[n].flags !== 0) continue;
    const e1 = adj[n][1], e2 = adj[n][0];
    if (e1 === e2) continue;
    const A = edges[e1], B = edges[e2];
    if (!A.alive || !B.alive || A.a === A.b || B.a === B.b) continue;
    if (sigOf(A.p) !== sigOf(B.p)) continue;
    if (!(A.b === n && B.a === n) || A.a === B.b) continue;
    for (let i = 2; i < B.pts.length; i++) A.pts.push(B.pts[i]);
    const far = B.b;
    A.b = far;
    B.alive = false;
    adj[n].length = 0;
    const k = adj[far].indexOf(e2);
    if (k >= 0) adj[far][k] = e1;
    chained++;
  }
  report.edgesChained = chained;

  // ── F. Attributs ──
  const b = BOUNDS, edge = SOURCE_MARGIN - 4;
  const live = edges.filter((ed) => ed.alive);
  const widthStats = { source: 0, lanes: 0, classDefault: 0, clampedToLanes: 0, narrowedToFacades: 0 };
  const swStats = { facades: 0, polygons: 0, polygonsInsteadOfFarFacades: 0, classDefault: 0, bridge: 0, none: 0 };
  const out = [];
  const namesRemoved = new Set();
  for (const ed of live) {
    const p = ed.p;
    const pts = simplifyLine(ed.pts, ROAD_TOLERANCE);
    const length = polylineLength(pts);
    if (length < 0.2) continue;
    const pedestrianOnly = PEDESTRIAN.has(p.class);
    const oneway = !pedestrianOnly && p.oneway === true;
    const lanesKnown = Number.isFinite(p.lanes) && p.lanes >= 1;
    let lanes = lanesKnown ? Math.min(12, Math.round(p.lanes)) : oneway ? (p.class === 'primary' || p.class === 'secondary' ? 2 : 1) : 2;
    let width = Number.isFinite(p.width) && p.width >= 1 ? p.width : NaN;
    if (!pedestrianOnly) {
      if (Number.isFinite(width) && width >= 2) widthStats.source++;
      else if (lanesKnown) { width = lanes * LANE_WIDTH; widthStats.lanes++; }
      else { width = DEFAULT_WIDTH[p.class]; widthStats.classDefault++; }
      if (lanesKnown) {
        // Une largeur de tronçon reportée sur plusieurs chaussées parallèles (couloir de bus, contre-allée) est ramenée à ses voies.
        // Borne haute : voies de 3,5 m plus deux files de stationnement ; un couloir de bus n'en a pas.
        const lo = lanes * 2.6, hi = p.class === 'service' ? lanes * 3.5 + 1 : lanes * 3.5 + 4.5;
        if (width < lo) { width = lo; widthStats.clampedToLanes++; }
        else if (width > hi) { width = hi; widthStats.clampedToLanes++; }
      }
      width = clamp(width, 2.5, 40);
    } else {
      if (!Number.isFinite(width)) width = DEFAULT_WIDTH[p.class];
      width = clamp(width, 1, 30);
    }

    // Trottoirs : distance aux façades de part et d'autre de l'axe.
    let sidewalk = 0;
    const probe = !p.bridge && (p.class === 'pedestrian' || (!pedestrianOnly && p.class !== 'service'));
    if (probe) {
      const left = [], right = [];
      const count = Math.max(1, Math.floor(length / 12));
      let samples = 0;
      for (let k = 0; k < count; k++) {
        const s = (length * (k + 0.5)) / count;
        const [x, z, dx, dz] = pointAlong(pts, s);
        if (buildingAt(ctx.buildings, x, z) >= 0) continue;
        samples++;
        const dl = ctx.buildings.facades.raycast(x, z, dz, -dx, 50);
        const dr = ctx.buildings.facades.raycast(x, z, -dz, dx, 50);
        if (dl < Infinity) left.push(dl);
        if (dr < Infinity) right.push(dr);
      }
      const need = Math.max(1, Math.ceil(samples * 0.4));
      const dl = left.length >= need ? median(left) : NaN;
      const dr = right.length >= need ? median(right) : NaN;
      const dmin = Number.isFinite(dl) && Number.isFinite(dr) ? Math.min(dl, dr) : Number.isFinite(dl) ? dl : dr;
      if (Number.isFinite(dmin)) {
        if (p.class === 'pedestrian') {
          // Rue piétonne : la voie occupe l'espace entre les façades.
          if (!(Number.isFinite(p.width) && p.width >= 1)) width = clamp(2 * dmin - 0.6, 2.5, 14);
          else if (width > 2 * dmin) width = Math.max(2, 2 * dmin - 0.4);
        } else {
          if (width > 2 * dmin - 1.6) { width = Math.max(2.5, 2 * dmin - 1.6); widthStats.narrowedToFacades++; }
          const both = Number.isFinite(dl) && Number.isFinite(dr) && Math.abs(dl - dr) <= 6;
          sidewalk = both ? (dl + dr - width) / 2 : dmin - width / 2;
          sidewalk = clamp(sidewalk, 0, 25);
          if (sidewalk < 0.3) sidewalk = 0;
          swStats.facades++;
          if (sidewalk > 12) {
            // Façades lointaines (avenue bordée de jardins, grande place) : si le plan de voirie montre un
            // trottoir nettement plus étroit que l'espace jusqu'aux façades, c'est lui qui compte.
            const measured = measureSidewalk(pts, length, width, ctx.onSidewalk);
            if (measured > 0 && measured < 0.6 * sidewalk) { sidewalk = measured; swStats.facades--; swStats.polygonsInsteadOfFarFacades++; }
          }
        }
      } else if (!pedestrianOnly) {
        // Aucune façade (jardin, quai, grande place) : largeur réelle des trottoirs du plan de voirie.
        const measured = measureSidewalk(pts, length, width, ctx.onSidewalk);
        if (measured > 0) { sidewalk = Math.min(25, measured); swStats.polygons++; }
        else { sidewalk = DEFAULT_SIDEWALK[p.class] ?? 0; swStats.classDefault++; }
      }
    } else if (!pedestrianOnly && p.bridge) {
      // Pont : pas de façade. Les trottoirs du plan de voirie franchissent le fleuve avec le tablier : on les mesure.
      const measured = measureSidewalk(pts, length, width, ctx.onSidewalk);
      sidewalk = measured > 0 ? Math.min(15, measured) : Math.max(1.5, DEFAULT_SIDEWALK[p.class] ?? 0);
      swStats.bridge++;
    }
    else swStats.none++;

    const wayName = publicWayName(p.name, p.class === 'service' || pedestrianOnly);
    if (wayName === '' && typeof p.name === 'string' && p.name !== '') namesRemoved.add(p.name);
    const kmh = Number.isFinite(p.maxspeed) && p.maxspeed > 0 ? Math.min(130, p.maxspeed) : pedestrianOnly ? 6 : p.class === 'living' ? 20 : 30;
    out.push({
      a: ed.a, b: ed.b, points: pts,
      width: round1(width),
      lanesForward: pedestrianOnly ? 0 : oneway ? lanes : lanes === 1 ? 1 : Math.ceil(lanes / 2),
      lanesBackward: pedestrianOnly || oneway ? 0 : lanes === 1 ? 1 : Math.floor(lanes / 2),
      oneway,
      roadClass: CLASS_OF[p.class],
      name: wayName,
      bridge: p.bridge === true,
      tunnel: false,
      surface: SURFACE_OF[p.surface] ?? 'asphalt',
      speedLimit: kmh / 3.6,
      sidewalk: round1(sidewalk),
      pedestrianOnly,
      landmarkKey: '',
      // Champs de travail (non écrits) :
      srcClass: p.class, covered: p.covered === true, length,
    });
  }
  report.width = widthStats;
  report.sidewalk = swStats;
  report.namesRemoved = { count: namesRemoved.size, sample: [...namesRemoved].sort().slice(0, 80) };

  // Bouts de cheminements piétons isolés (amorce d'un passage intérieur, marche d'un perron) : sans
  // lien avec le reste du graphe et trop courts pour servir, ils sont retirés.
  {
    const n = nodes.length;
    const root = new Int32Array(n);
    for (let i = 0; i < n; i++) root[i] = i;
    const find2 = (i) => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
    for (const ed of out) { const ra = find2(ed.a), rb = find2(ed.b); if (ra !== rb) root[Math.max(ra, rb)] = Math.min(ra, rb); }
    const total = new Map(), drivable = new Set();
    for (const ed of out) {
      const c = find2(ed.a);
      total.set(c, (total.get(c) ?? 0) + ed.length);
      if (!ed.pedestrianOnly) drivable.add(c);
    }
    let removed = 0, removedLen = 0;
    const kept = [];
    for (const ed of out) {
      const c = find2(ed.a);
      if (!drivable.has(c) && total.get(c) < MIN_ISOLATED_FOOTPATH) { removed++; removedLen += ed.length; }
      else kept.push(ed);
    }
    out.length = 0;
    for (const ed of kept) out.push(ed);
    report.isolatedFootpathsRemoved = { edges: removed, lengthM: Math.round(removedLen) };
  }

  // ── G. Nœuds utilisés, limites de carte ──
  const used = new Int32Array(nodes.length).fill(-1);
  const deg = new Int32Array(nodes.length);
  for (const ed of out) { deg[ed.a]++; deg[ed.b]++; }
  const outNodes = [];
  for (let i = 0; i < nodes.length; i++) {
    if (deg[i] === 0) continue;
    const nd = nodes[i];
    const outside = nd.x < b.minX - edge || nd.x > b.maxX + edge || nd.z < b.minZ - edge || nd.z > b.maxZ + edge;
    used[i] = outNodes.length;
    outNodes.push({
      x: nd.x, z: nd.z,
      signal: (nd.flags & M.NODE_SIGNAL) !== 0,
      crossing: (nd.flags & M.NODE_CROSSING) !== 0,
      boundary: outside && deg[i] === 1,
    });
  }
  for (const ed of out) { ed.a = used[ed.a]; ed.b = used[ed.b]; }

  // ── H. Ponts modélisés à la main ──
  let bridgeKeys = 0;
  for (const part of ctx.landmarkParts) {
    if (!part.isBridge) continue;
    for (const ed of out) {
      if (!ed.bridge) continue;
      const [x, z] = pointAlong(ed.points, ed.length / 2);
      if (M.pointInRing(part.ring, x, z)) { ed.landmarkKey = part.key; bridgeKeys++; }
    }
  }
  report.bridgeEdgesWithLandmark = bridgeKeys;

  // ── I. Connexité des voies carrossables ──
  const drivable = out.filter((ed) => !ed.pedestrianOnly);
  const comp = M.roadGraphComponents({ nodes: outNodes, edges: drivable });
  const countBy = new Map(), lengthBy = new Map();
  for (const ed of drivable) {
    const c = comp.labels[ed.a];
    countBy.set(c, (countBy.get(c) ?? 0) + 1);
    lengthBy.set(c, (lengthBy.get(c) ?? 0) + ed.length);
  }
  let mainLabel = -1, mainCount = 0;
  for (const [c, n] of countBy) if (n > mainCount) { mainCount = n; mainLabel = c; }
  const totalLen = drivable.reduce((s, ed) => s + ed.length, 0);
  const others = [];
  for (const [c, n] of countBy) {
    if (c === mainLabel) continue;
    const names = new Set();
    for (const ed of drivable) if (comp.labels[ed.a] === c && ed.name !== '') names.add(ed.name);
    others.push({ edges: n, lengthM: Math.round(lengthBy.get(c)), names: [...names].slice(0, 4) });
  }
  others.sort((u, v) => v.lengthM - u.lengthM);
  report.connectivity = {
    drivableEdges: drivable.length,
    drivableKm: round1(totalLen / 1000),
    mainComponentEdges: mainCount,
    mainComponentShare: Math.round((mainCount / drivable.length) * 10000) / 10000,
    mainComponentLengthShare: Math.round((lengthBy.get(mainLabel) / totalLen) * 10000) / 10000,
    otherComponents: others.length,
    largestOthers: others.slice(0, 12),
  };
  const all = M.roadGraphComponents({ nodes: outNodes, edges: out });
  report.componentsAllEdges = all.count;

  // Bilan.
  const byClass = {};
  for (const ed of out) {
    const c = (byClass[ed.roadClass] ??= { edges: 0, km: 0 });
    c.edges++;
    c.km += ed.length / 1000;
  }
  for (const c of Object.values(byClass)) c.km = round1(c.km);
  report.nodes = outNodes.length;
  report.edges = out.length;
  report.byClass = byClass;
  report.flags = {
    signalNodes: outNodes.filter((n) => n.signal).length,
    crossingNodes: outNodes.filter((n) => n.crossing).length,
    boundaryNodes: outNodes.filter((n) => n.boundary).length,
    oneway: out.filter((e) => e.oneway).length,
    bridges: out.filter((e) => e.bridge).length,
    sett: out.filter((e) => e.surface === 'sett').length,
    covered: out.filter((e) => e.covered).length,
  };

  // Index des segments pour les requêtes « voie la plus proche ».
  const grid = new SegGrid(32);
  for (let e = 0; e < out.length; e++) {
    const pts = out[e].points;
    for (let i = 2; i < pts.length; i += 2) grid.add(pts[i - 2], pts[i - 1], pts[i], pts[i + 1], e, (i >> 1) - 1);
  }
  return { nodes: outNodes, edges: out, grid, report };
}

/**
 * Largeur (m) du trottoir le long d'un axe, mesurée dans les polygones de trottoir : de chaque
 * côté, on s'éloigne de l'axe jusqu'à la bordure, puis jusqu'au fond du trottoir. Médiane des
 * mesures ; 0 si moins d'un tiers des sondages trouvent un trottoir.
 */
function measureSidewalk(pts, length, width, onSidewalk) {
  const count = clamp(Math.floor(length / 15), 1, 10);
  const found = [];
  let tries = 0;
  for (let k = 0; k < count; k++) {
    const [x, z, dx, dz] = pointAlong(pts, (length * (k + 0.5)) / count);
    for (const side of [1, -1]) {
      tries++;
      const nx = -dz * side, nz = dx * side;
      let kerb = -1;
      for (let d = Math.max(0.5, width / 2 - 2); d <= width / 2 + 8; d += 0.5) {
        if (onSidewalk(x + nx * d, z + nz * d)) { kerb = d; break; }
      }
      if (kerb < 0) continue;
      let end = kerb, gap = 0;
      for (let d = kerb + 0.5; d <= kerb + 30; d += 0.5) {
        if (onSidewalk(x + nx * d, z + nz * d)) { end = d; gap = 0; }
        else if ((gap += 0.5) > 1) break;
      }
      found.push(end - kerb + 0.5);
    }
  }
  return found.length * 3 >= tries ? round1(median(found)) : 0;
}

/** Direction unitaire [dx, dz] de l'arête au plus près du point (segment `i` de la grille). */
export function tangentOfSeg(grid, i) {
  const dx = grid.bx[i] - grid.ax[i], dz = grid.bz[i] - grid.az[i];
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

export { distToSegment };
