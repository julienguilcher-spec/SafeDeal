/* =====================================================================================
 * CARTE DE PARIS — construction des objets PONCTUELS : arbres, mobilier, feux, métro
 * -------------------------------------------------------------------------------------
 * Entrée : trees, furniture, signals (supports de feux) et metro (bouches) normalisés.
 * Le cap inconnu d'un objet est tourné vers l'axe de la voie la plus proche. Les candélabres,
 * relevés de façon très inégale par la source, sont complétés le long des trottoirs
 * (objets SYNTHÉTIQUES, comptés à part dans le rapport).
 * ===================================================================================== */
import { M, readLayer, px, pz, clamp, round1, pointAlong, hash01, normName } from './build-lib.mjs';
import { hasTrademark } from './build-names.mjs';
import { buildingAt } from './build-buildings.mjs';

const FURNITURE_KIND = {
  lamp: 'candelabre', bench: 'banc', bin: 'poubelle', bollard: 'potelet', bus_shelter: 'abribus', kiosk: 'kiosque',
  newsstand: 'kiosque', morris_column: 'colonne_morris', wallace_fountain: 'fontaine_wallace', toilet: 'sanisette',
  velib: 'station_velo', advert_panel: 'panneau_pub', statue: 'statue', flagpole: 'mat_drapeau',
  // Fontaines à boire d'autres modèles et fontaines ornementales : pas de nature dédiée dans le format.
  fountain: 'autre',
};

/** Espacement (m) des candélabres ajoutés et distance minimale à un candélabre existant. */
const LAMP_SPACING = 28;
const LAMP_MIN_GAP = 20;

class PointGrid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(x, z) { return (Math.floor(x / this.cell) + 8192) * 16384 + Math.floor(z / this.cell) + 8192; }
  add(x, z, value) {
    const k = this.key(x, z);
    const list = this.map.get(k);
    if (list === undefined) this.map.set(k, [x, z, value]);
    else list.push(x, z, value);
  }
  /** Valeur la plus proche à moins de `radius` : { value, d } ou null. */
  nearest(x, z, radius, accept) {
    const c = this.cell;
    let best = null, bestD = radius;
    for (let cz = Math.floor((z - radius) / c); cz <= Math.floor((z + radius) / c); cz++) {
      for (let cx = Math.floor((x - radius) / c); cx <= Math.floor((x + radius) / c); cx++) {
        const list = this.map.get((cx + 8192) * 16384 + cz + 8192);
        if (list === undefined) continue;
        for (let i = 0; i < list.length; i += 3) {
          const d = Math.hypot(list[i] - x, list[i + 1] - z);
          if (d < bestD && (accept === undefined || accept(list[i + 2]))) { bestD = d; best = { value: list[i + 2], d, x: list[i], z: list[i + 1] }; }
        }
      }
    }
    return best;
  }
}

/** Profondeur (m) jusqu'à laquelle un objet relevé dans l'emprise d'un bâtiment est ramené devant sa façade. */
const WALL_DEPTH = 2.5;
/** Recul (m) laissé entre la façade et un objet ramené devant elle. */
const WALL_CLEARANCE = { mobilier: 0.35, arbre: 1.2, metro: 1.5 };

/**
 * Écarte un point des murs. Retourne :
 *   - le point inchangé (`moved` faux) s'il est dehors, à `clearance` au moins de toute façade ;
 *   - le point reporté devant la façade la plus proche, à `clearance` d'elle (`moved` vrai), s'il est dans
 *     un bâtiment à moins de `maxDepth` d'une façade extérieure, ou dehors mais collé à un mur (un relevé
 *     posé pile sur le contour tombe d'un côté ou de l'autre au gré de l'arrondi au décimètre) ;
 *   - null s'il est dans un bâtiment, trop loin de toute façade libre, ou coincé entre des murs.
 * Résultat : { x, z, nx, nz, moved } ; (nx, nz) est la normale sortante de la façade quand `moved` est vrai.
 */
function clearOfWalls(buildings, x, z, maxDepth, clearance) {
  const tooClose = (px, pz) => buildings.facades.nearest(px, pz, clearance - 0.02);
  let cur = { x, z, nx: 0, nz: 0, moved: false };
  // Plusieurs passes : sorti d'un bâtiment, le point peut se retrouver collé au mur du voisin (façades
  // décalées, angle rentrant) ; il est alors écarté de ce mur à son tour.
  for (let pass = 0; pass < 4; pass++) {
    const hit = buildingAt(buildings, cur.x, cur.z);
    let next;
    if (hit >= 0) next = moveOutOfBuilding(buildings, hit, cur.x, cur.z, pass === 0 ? maxDepth : 2 * clearance, clearance);
    else {
      const near = tooClose(cur.x, cur.z);
      if (near === null) return cur;
      next = moveOutOfBuilding(buildings, buildings.facades.tag[near.i], cur.x, cur.z, clearance, clearance);
    }
    if (next === null) return null;
    // On garde la normale de la première façade franchie : c'est par elle qu'on « sort » du bâtiment.
    cur = { x: next.x, z: next.z, nx: cur.moved ? cur.nx : next.nx, nz: cur.moved ? cur.nz : next.nz, moved: true };
  }
  return buildingAt(buildings, cur.x, cur.z) < 0 && tooClose(cur.x, cur.z) === null ? cur : null;
}

/**
 * Reporte un point devant le côté extérieur le plus proche du bâtiment `hit` (à `clearance` de la
 * façade), pourvu que ce côté soit à moins de `maxDepth` et que le point d'arrivée soit libre (ni
 * dans ce bâtiment, ni dans un voisin : un mur mitoyen ne convient pas). Le point de départ peut
 * être dans le bâtiment ou juste devant lui. Retourne { x, z, nx, nz, moved: true } ou null.
 */
function moveOutOfBuilding(buildings, hit, x, z, maxDepth, clearance) {
  const g = buildings.facades;
  const inside = buildingAt(buildings, x, z) === hit;
  const sides = [];
  g.forEachInRect(x - maxDepth, z - maxDepth, x + maxDepth, z + maxDepth, (i) => {
    if (g.tag[i] !== hit) return;
    const ax = g.ax[i], az = g.az[i], dx = g.bx[i] - ax, dz = g.bz[i] - az;
    const l2 = dx * dx + dz * dz;
    if (l2 < 0.01) return;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const qx = ax + dx * t, qz = az + dz * t;
    const d = Math.hypot(qx - x, qz - z);
    if (d <= maxDepth) sides.push({ d, qx, qz, dx, dz, l: Math.sqrt(l2) });
  });
  sides.sort((a, b) => a.d - b.d);
  for (const s of sides) {
    // Normale du côté, orientée vers l'extérieur : du point vers le mur s'il est dedans, du mur vers le point sinon.
    let nx = -s.dz / s.l, nz = s.dx / s.l;
    const toWall = (s.qx - x) * nx + (s.qz - z) * nz;
    if (inside ? toWall < 0 : toWall > 0) { nx = -nx; nz = -nz; }
    if (s.d < 0.02 && buildingAt(buildings, s.qx + nx * clearance, s.qz + nz * clearance) === hit) { nx = -nx; nz = -nz; }
    const ox = s.qx + nx * clearance, oz = s.qz + nz * clearance;
    if (buildingAt(buildings, ox, oz) < 0) return { x: ox, z: oz, nx, nz, moved: true };
  }
  return null;
}

/** Cap (rad) d'un objet posé en (x, z), tourné vers l'axe de la voie la plus proche ; null si aucune voie. */
function headingTowardRoad(roads, x, z) {
  const streets = (i) => roads.edges[roads.grid.tag[i]].roadClass !== 'footway';
  const near = roads.grid.nearest(x, z, 40, streets) ?? roads.grid.nearest(x, z, 40);
  if (near === null) return null;
  const g = roads.grid, i = near.i;
  const qx = g.ax[i] + (g.bx[i] - g.ax[i]) * near.t, qz = g.az[i] + (g.bz[i] - g.az[i]) * near.t;
  if (near.d < 0.3) return M.headingOf(-(g.bz[i] - g.az[i]), g.bx[i] - g.ax[i]);
  return M.headingOf(qx - x, qz - z);
}

export function buildTrees(tiles, ctx) {
  const fc = readLayer('trees');
  const report = { source: fc.features.length, kept: 0, heightEstimated: 0, outside: 0, movedOutOfBuilding: 0, droppedInsideBuilding: 0, droppedInWater: 0 };
  for (const f of fc.features) {
    let x = px(f.geometry.coordinates[0]), z = pz(f.geometry.coordinates[1]);
    // Un arbre relevé dans l'emprise d'un bâtiment (imprécision du relevé, arbre de toiture ou de patio
    // couvert) traverserait le toit : au bord, il est ramené devant la façade ; plus loin, il est retiré.
    if (buildingAt(ctx.buildings, x, z) >= 0) {
      const out = clearOfWalls(ctx.buildings, x, z, 1.5, WALL_CLEARANCE.arbre);
      if (out === null) { report.droppedInsideBuilding++; continue; }
      x = out.x; z = out.z;
      report.movedOutOfBuilding++;
    }
    // Arbres des jardins flottants (port du Gros-Caillou) : la carte n'a pas ces îles, ils seraient plantés dans le fleuve.
    if (ctx.inOpenWater(x, z)) { report.droppedInWater++; continue; }
    const tile = tiles.at(x, z);
    if (tile === undefined) { report.outside++; continue; }
    const p = f.properties;
    const crown = Number.isFinite(p.crown) ? p.crown : null;
    let height = Number.isFinite(p.height) ? p.height : null;
    if (height === null) {
      // Hauteur absente : d'après le houppier estimé (règle inverse de celle du lot B), sinon 10 m.
      height = crown !== null ? clamp((crown - 1) / 0.45, 4, 22) : 10;
      report.heightEstimated++;
    }
    height = clamp(height, 2, 45);
    const crownRadius = clamp((crown ?? 1 + 0.45 * height) / 2, 0.8, 8);
    tile.treeList.push({ x, z, height: round1(height), crownRadius: round1(crownRadius) });
    report.kept++;
  }
  return report;
}

export function buildFurniture(tiles, ctx) {
  const fc = readLayer('furniture');
  const report = { source: fc.features.length, kept: 0, byKind: {}, headingFromSource: 0, headingTowardRoad: 0, headingNone: 0, outside: 0, lampsAdded: 0, lampsSource: 0, movedOutOfBuilding: {}, droppedInsideBuilding: {}, droppedInWater: {} };
  const lamps = new PointGrid(32);
  const push = (kind, x, z, heading) => {
    const tile = tiles.at(x, z);
    if (tile === undefined) { report.outside++; return false; }
    tile.furniture.push({ kind, x, z, heading });
    report.byKind[kind] = (report.byKind[kind] ?? 0) + 1;
    report.kept++;
    return true;
  };
  for (const f of fc.features) {
    const p = f.properties;
    const kind = FURNITURE_KIND[p.kind];
    if (kind === undefined) throw new Error(`mobilier : nature source inconnue « ${p.kind} »`);
    let x = px(f.geometry.coordinates[0]), z = pz(f.geometry.coordinates[1]);
    // Objet relevé dans l'emprise d'un bâtiment : une lanterne en console ou un potelet au ras du mur
    // sont ramenés devant la façade ; un objet loin à l'intérieur (mât de toiture, statue d'une cour
    // couverte, abri sous une halle) serait noyé dans le volume du bâtiment : il est retiré.
    const out = clearOfWalls(ctx.buildings, x, z, WALL_DEPTH, WALL_CLEARANCE.mobilier);
    if (out === null) { report.droppedInsideBuilding[kind] = (report.droppedInsideBuilding[kind] ?? 0) + 1; continue; }
    if (out.moved) {
      x = out.x; z = out.z;
      report.movedOutOfBuilding[kind] = (report.movedOutOfBuilding[kind] ?? 0) + 1;
    }
    // Objet relevé sur un ponton ou une péniche : dans le fleuve ou un canal, hors de tout tablier de pont.
    if (ctx.inOpenWater(x, z)) { report.droppedInWater[kind] = (report.droppedInWater[kind] ?? 0) + 1; continue; }
    let heading;
    if (Number.isFinite(p.heading)) {
      // Azimut (0 = nord, sens horaire) -> cap du jeu.
      heading = Math.PI - (p.heading * Math.PI) / 180;
      report.headingFromSource++;
    } else {
      const h = headingTowardRoad(ctx.roads, x, z);
      if (h === null) { heading = 0; report.headingNone++; }
      else { heading = h; report.headingTowardRoad++; }
    }
    if (push(kind, x, z, heading) && kind === 'candelabre') { lamps.add(x, z, 1); report.lampsSource++; }
  }

  // Complément de candélabres : le long des voies carrossables, sur le trottoir, en quinconce.
  const edges = ctx.roads.edges;
  for (let e = 0; e < edges.length; e++) {
    const ed = edges[e];
    if (ed.pedestrianOnly || ed.roadClass === 'service' || ed.bridge || ed.covered) continue;
    if (ed.length < 14) continue;
    const count = Math.max(1, Math.round(ed.length / LAMP_SPACING));
    for (let k = 0; k < count; k++) {
      const s = (ed.length * (k + 0.5)) / count;
      const [ax, az, dx, dz] = pointAlong(ed.points, s);
      // En quinconce ; le premier côté dépend de l'arête pour ne pas aligner tout un quartier.
      const first = hash01(e) < 0.5 ? 1 : -1;
      for (const side of [first * (k % 2 === 0 ? 1 : -1), first * (k % 2 === 0 ? -1 : 1)]) {
        // Bordure réelle : premier point du trottoir en s'éloignant de l'axe.
        let kerb = -1;
        for (let d = Math.max(1, ed.width / 2 - 1.5); d <= ed.width / 2 + 6; d += 0.5) {
          if (ctx.onSidewalk(ax - dz * side * d, az + dx * side * d)) { kerb = d; break; }
        }
        if (kerb < 0) continue;
        let d = kerb + 0.6;
        if (!ctx.onSidewalk(ax - dz * side * d, az + dx * side * d)) d = kerb + 0.15;
        const x = ax - dz * side * d, z = az + dx * side * d;
        if (lamps.nearest(x, z, LAMP_MIN_GAP) !== null) break;
        if (buildingAt(ctx.buildings, x, z) >= 0 || ctx.buildings.facades.nearest(x, z, WALL_CLEARANCE.mobilier - 0.02) !== null) continue;
        if (ctx.inOpenWater(x, z)) continue;
        // Le candélabre regarde la chaussée.
        if (push('candelabre', x, z, M.headingOf(ax - x, az - z))) { lamps.add(x, z, 1); report.lampsAdded++; }
        break;
      }
    }
  }
  return report;
}

export function buildSignals(tiles, ctx) {
  const fc = readLayer('signals');
  const roads = ctx.roads;
  const signalNodes = new PointGrid(64);
  for (let i = 0; i < roads.nodes.length; i++) if (roads.nodes[i].signal) signalNodes.add(roads.nodes[i].x, roads.nodes[i].z, i);
  const report = { poles: 0, kept: 0, withNode: 0, withoutNode: 0, withoutRoad: 0, outside: 0, movedOutOfBuilding: 0, droppedInsideBuilding: 0, droppedInWater: 0 };
  const drivable = (i) => !roads.edges[roads.grid.tag[i]].pedestrianOnly;
  for (const f of fc.features) {
    const p = f.properties;
    if (p.kind !== 'traffic_signals' || p.sub !== 'pole') continue;
    report.poles++;
    let x = px(f.geometry.coordinates[0]), z = pz(f.geometry.coordinates[1]);
    const out = clearOfWalls(ctx.buildings, x, z, WALL_DEPTH, WALL_CLEARANCE.mobilier);
    if (out === null) { report.droppedInsideBuilding++; continue; }
    if (out.moved) { x = out.x; z = out.z; report.movedOutOfBuilding++; }
    if (ctx.inOpenWater(x, z)) { report.droppedInWater++; continue; }
    const tile = tiles.at(x, z);
    if (tile === undefined) { report.outside++; continue; }
    const nearNode = signalNodes.nearest(x, z, 45);
    const node = nearNode !== null ? nearNode.value : -1;
    if (node >= 0) report.withNode++; else report.withoutNode++;
    // Face lumineuse : le long de la voie la plus proche, tournée vers les véhicules qui arrivent.
    let heading = 0;
    const near = roads.grid.nearest(x, z, 30, drivable);
    if (near === null) report.withoutRoad++;
    else {
      const g = roads.grid, i = near.i;
      let dx = g.bx[i] - g.ax[i], dz = g.bz[i] - g.az[i];
      const ed = roads.edges[g.tag[i]];
      if (ed.oneway) { dx = -dx; dz = -dz; }                       // à contresens de la circulation
      else if (node >= 0) {
        const nd = roads.nodes[node];
        if (dx * (x - nd.x) + dz * (z - nd.z) < 0) { dx = -dx; dz = -dz; }   // dos au carrefour
      }
      heading = M.headingOf(dx, dz);
    }
    tile.signals.push({ x, z, heading, node });
    report.kept++;
  }
  return report;
}

export function buildMetro(tiles, ctx) {
  const fc = readLayer('metro');
  const roads = ctx.roads;
  const stations = [];
  for (const f of fc.features) {
    if (f.properties.kind !== 'station') continue;
    stations.push({ name: f.properties.name, key: normName(f.properties.name), x: px(f.geometry.coordinates[0]), z: pz(f.geometry.coordinates[1]), lines: f.properties.lines ?? [] });
  }
  const report = { stations: stations.length, entrances: 0, kept: 0, outside: 0, withoutRoad: 0, movedOutOfBuilding: 0, leftInsideBuilding: 0 };
  const streets = (i) => roads.edges[roads.grid.tag[i]].roadClass !== 'footway';
  for (const f of fc.features) {
    const p = f.properties;
    if (p.kind !== 'entrance') continue;
    report.entrances++;
    let x = px(f.geometry.coordinates[0]), z = pz(f.geometry.coordinates[1]);
    // Accès situé dans l'emprise d'un bâtiment (gare, forum, pied d'immeuble) : le jeu fait sortir la
    // foule par les bouches, donc le point est reporté sur le trottoir, devant la façade la plus proche.
    let wall = null;
    const inside = buildingAt(ctx.buildings, x, z);
    if (inside >= 0) {
      // À défaut d'un point bien dégagé (angle rentrant, ruelle étroite), un point simplement hors du bâtiment convient.
      wall = clearOfWalls(ctx.buildings, x, z, 120, WALL_CLEARANCE.metro) ?? moveOutOfBuilding(ctx.buildings, inside, x, z, 120, 0.6);
      if (wall === null) report.leftInsideBuilding++;
      else { x = wall.x; z = wall.z; report.movedOutOfBuilding++; }
    }
    const tile = tiles.at(x, z);
    if (tile === undefined) { report.outside++; continue; }
    if (typeof p.name !== 'string' || p.name === '') throw new Error('métro : bouche sans nom de station');
    if (hasTrademark(p.name)) throw new Error(`métro : le nom de station « ${p.name} » contient une marque déposée`);
    // Sortie : le long de la rue, en s'éloignant de la station.
    let heading = 0;
    const near = roads.grid.nearest(x, z, 40, streets);
    if (near === null) report.withoutRoad++;
    else {
      const g = roads.grid, i = near.i;
      let dx = g.bx[i] - g.ax[i], dz = g.bz[i] - g.az[i];
      const k = normName(p.name);
      let st = null, best = Infinity;
      for (const s of stations) {
        if (s.key !== k) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < best) { best = d; st = s; }
      }
      if (st !== null && dx * (x - st.x) + dz * (z - st.z) < 0) { dx = -dx; dz = -dz; }
      heading = M.headingOf(dx, dz);
    }
    // Sortie d'un bâtiment : on en sort perpendiculairement à la façade.
    if (wall !== null) heading = M.headingOf(wall.nx, wall.nz);
    const lines = Array.isArray(p.lines) ? p.lines.join(';') : typeof p.lines === 'string' ? p.lines : '';
    tile.metroEntrances.push({ x, z, heading, name: p.name, lines });
    report.kept++;
  }
  return { report, stations };
}
