/* =====================================================================================
 * CARTE DE PARIS — construction des COMMERCES
 * -------------------------------------------------------------------------------------
 * Entrée : raw/normalized/shops.geojson (un point par local en rez-de-chaussée, posé à
 * l'adresse, en général 1 m derrière la façade).
 * Traitements : rattachement au côté de façade le plus proche (moins de 15 m), en écartant les
 * murs mitoyens et en préférant une façade sur rue à une façade sur cour ; répartition des
 * vitrines le long du côté sans chevauchement ; normale sortante ; largeur de vitrine d'après
 * la taille du local ; catégorie de jeu. Le NOM D'ENSEIGNE n'est jamais lu au-delà du calcul de
 * l'identifiant : il n'entre dans aucun fichier de sortie.
 * ===================================================================================== */
import { M, readLayer, px, pz, distToSegment, segT, clamp, round1, hash32, hash01, BoxGrid, pointInPoly } from './build-lib.mjs';
import { buildingAt } from './build-buildings.mjs';

/** Distance maximale (m) entre le point du local et sa façade. */
export const SHOP_ATTACH_DIST = 15;
/** Largeur minimale d'une vitrine (m) et espace entre deux vitrines. */
const MIN_WINDOW = 2.2;
const WINDOW_GAP = 0.25;
/** Retrait (m) de la vitrine par rapport aux extrémités du côté de façade. */
const END_MARGIN = 0.3;

const PARTY = 1, COURT = 2, STREET = 3, SHORT = 4;

const LUXE = new Set(['Haute couture - Créateurs']);
/**
 * Voies du luxe parisien (noms de rues, pas d'enseignes) : une boutique de mode, de maroquinerie
 * ou de parfumerie qui y donne est classée « luxe ». La rue Saint-Honoré ne compte qu'à l'ouest
 * du Palais-Royal (x < 1 000 m).
 */
const LUXURY_STREETS = new Set([
  'Avenue Montaigne', 'Rue du Faubourg Saint-Honoré', 'Place Vendôme', 'Rue de la Paix', 'Avenue George V',
  'Rue François 1er', 'Rue Cambon', 'Rue Royale', 'Rue de Castiglione', 'Rue Saint-Honoré',
]);
const LUXURY_LABEL = /^(Prêt-à-porter (Femme|Homme|Mixte)|Maroquinerie|Chaussures (Femme|Homme|Mixte)|Parfumerie)/;
const GROUP_CATEGORY = {
  bank: 'banque', fashion: 'mode', department_store: 'mode', jewelry: 'bijouterie', food: 'alimentation', bakery: 'alimentation',
  grocery: 'alimentation', supermarket: 'supermarche', restaurant: 'cafe_restaurant', cafe: 'cafe_restaurant',
  fast_food: 'restauration_rapide', pharmacy: 'pharmacie', tobacco: 'tabac_presse', agency: 'agence', hotel: 'hotel',
};

/** Catégorie de jeu d'un local, d'après sa famille et son libellé d'activité (jamais d'après son enseigne). */
export function gameCategory(group, label) {
  if (LUXE.has(label)) return 'luxe';
  if (/^Supérette/.test(label)) return 'supermarche';
  if (label === 'Parapharmacie') return 'pharmacie';
  if (label === 'Vente de journaux' || label === 'shop=newsagent' || label === 'Café - Tabac') return 'tabac_presse';
  if (/T[ée]l[ée]phonie|T[ée]l[ée]communication|shop=telecommunication|shop=mobile_phone/.test(label)) return 'telephonie';
  if (/^Agence (voyage|d'int[ée]rim|pour l'emploi)/.test(label)) return 'agence';
  return GROUP_CATEGORY[group] ?? 'autre';
}

/** Largeur de vitrine souhaitée (m) d'après la taille du local (s < 300 m², m < 1 000 m², l au-delà). */
function desiredWidth(size, category, r) {
  let w = size === 'l' ? 16 + 10 * r : size === 'm' ? 9 + 4 * r : 3.8 + 3.4 * r;
  if (category === 'supermarche') w = Math.max(w, 8);
  if (category === 'banque') w = Math.max(w, 6);
  return w;
}

/**
 * @param ctx { buildings, areas, roads }
 * @returns rapport ; les commerces sont rangés dans les tuiles et `hasShop` est posé sur les bâtiments.
 */
export function buildShops(tiles, ctx) {
  const fc = readLayer('shops');
  const B = ctx.buildings;
  const report = {
    source: fc.features.length, vacantExcluded: 0, droppedInMonument: 0, attached: 0, onCourtFacade: 0, relocated: 0, droppedNoFacade: 0, droppedNoRoom: 0,
    droppedOutside: 0, kept: 0, byCategory: {}, widthMedian: 0, widthsShrunk: 0,
  };

  // Îlots privés : un point situé dedans, devant une façade, est dans une cour et non sur la rue.
  const blocks = ctx.areas.list.filter((s) => s.kind === 'courtyard' && s.sub === 'block');
  const blockGrid = new BoxGrid(64);
  for (const s of blocks) blockGrid.add(s.bb.minX, s.bb.minZ, s.bb.maxX, s.bb.maxZ);
  const inBlock = (x, z) => {
    let found = false;
    blockGrid.forEachInRect(x, z, x, z, (i) => {
      if (found) return;
      const s = blocks[i];
      if (x >= s.bb.minX && x <= s.bb.maxX && z >= s.bb.minZ && z <= s.bb.maxZ && pointInPoly(s.poly, x, z)) found = true;
    });
    return found;
  };

  // Classement des côtés de façade, calculé à la demande.
  const edgeClass = new Map();
  const classOf = (bi, ei) => {
    const key = bi * 8192 + ei;
    let c = edgeClass.get(key);
    if (c !== undefined) return c;
    const ring = B.list[bi].outer;
    const n = ring.length >> 1;
    const ax = ring[2 * ei], az = ring[2 * ei + 1], bx = ring[2 * ((ei + 1) % n)], bz = ring[2 * ((ei + 1) % n) + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < MIN_WINDOW + 2 * END_MARGIN) c = SHORT;
    else {
      const nx = -dz / len, nz = dx / len;       // normale sortante d'un anneau antihoraire
      let party = 0, court = 0;
      for (const t of [0.25, 0.5, 0.75]) {
        const qx = ax + dx * t, qz = az + dz * t;
        if (buildingAt(B, qx + nx * 0.6, qz + nz * 0.6, bi) >= 0) party++;
        else if (inBlock(qx + nx * 2.5, qz + nz * 2.5) || buildingAt(B, qx + nx * 2.5, qz + nz * 2.5) >= 0) court++;
      }
      c = party >= 2 ? PARTY : court >= 2 ? COURT : STREET;
    }
    edgeClass.set(key, c);
    return c;
  };
  const edgeGeom = (bi, ei) => {
    const ring = B.list[bi].outer;
    const n = ring.length >> 1;
    const ax = ring[2 * ei], az = ring[2 * ei + 1], bx = ring[2 * ((ei + 1) % n)], bz = ring[2 * ((ei + 1) % n) + 1];
    return { ax, az, bx, bz, len: Math.hypot(bx - ax, bz - az) };
  };

  // 1. Rattachement de chaque local à un côté de façade.
  const perEdge = new Map();            // clé de côté -> { bi, ei, shops }
  const slot = (bi, ei) => {
    const key = bi * 8192 + ei;
    let s = perEdge.get(key);
    if (s === undefined) { s = { bi, ei, shops: [] }; perEdge.set(key, s); }
    return s;
  };
  const namedStreet = (i) => {
    const ed = ctx.roads.edges[ctx.roads.grid.tag[i]];
    return ed.name !== '' && ed.roadClass !== 'footway' && ed.roadClass !== 'service';
  };
  const seen = new Map();
  const ids = new Set();
  const priorityOf = { street: 0, corner: 0, courtyard: 1, mall: 2 };
  for (const f of fc.features) {
    const p = f.properties;
    if (p.group === 'vacant') { report.vacantExcluded++; continue; }
    const lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
    const x = px(lon), z = pz(lat);
    // Identifiant stable : position, activité et enseigne hachées (seul le hachage est conservé).
    const base = `${Math.round(lon * 1e6)}|${Math.round(lat * 1e6)}|${p.category}|${p.name ?? ''}`;
    const occ = seen.get(base) ?? 0;
    seen.set(base, occ + 1);
    let id = (hash32(`${base}|${occ}`) & 0x3fffffff) + 1;
    while (ids.has(id)) id = (id % 0x3fffffff) + 1;
    ids.add(id);
    let category = gameCategory(p.group, p.category);
    if (category === 'mode' || (category === 'autre' && p.group === 'health_beauty')) {
      if (LUXURY_LABEL.test(p.category)) {
        const near = ctx.roads.grid.nearest(x, z, 30, namedStreet);
        const street = near !== null ? ctx.roads.edges[ctx.roads.grid.tag[near.i]].name : '';
        if (LUXURY_STREETS.has(street) && (street !== 'Rue Saint-Honoré' || x < 1000)) category = 'luxe';
      }
    }
    const own = buildingAt(B, x, z);
    // Un monument est modélisé à la main : ses façades ne reçoivent pas de vitrine (galerie sous le Louvre, boutiques d'une gare).
    if (own >= 0 && B.list[own].landmarkKey !== '') { report.droppedInMonument++; continue; }
    let best = null, bestScore = Infinity;
    B.facades.forEachInRect(x - SHOP_ATTACH_DIST, z - SHOP_ATTACH_DIST, x + SHOP_ATTACH_DIST, z + SHOP_ATTACH_DIST, (i) => {
      const d = distToSegment(x, z, B.facades.ax[i], B.facades.az[i], B.facades.bx[i], B.facades.bz[i]);
      if (d > SHOP_ATTACH_DIST) return;
      const t = segT;
      const bi = B.facades.tag[i], ei = B.facades.tag2[i];
      if (B.list[bi].landmarkKey !== '') return;
      const c = classOf(bi, ei);
      if (c === PARTY || c === SHORT) return;
      // Une façade sur cour ou le bâtiment voisin ne sont retenus que nettement plus proches.
      const score = d + (c === COURT ? 3 : 0) + (own >= 0 && bi !== own ? 1.5 : 0);
      if (score < bestScore) { bestScore = score; best = { bi, ei, t, court: c === COURT }; }
    });
    if (best === null) { report.droppedNoFacade++; continue; }
    report.attached++;
    const r = hash01(id);
    slot(best.bi, best.ei).shops.push({
      id, category, x, z, t: best.t, court: best.court, want: desiredWidth(p.size ?? 's', category, r),
      priority: priorityOf[p.situation] ?? 0, r,
    });
  }

  // 2. Capacité de chaque côté : les locaux en trop cherchent un autre côté du même bâtiment.
  const capacity = (len) => Math.floor((len - 2 * END_MARGIN + WINDOW_GAP) / (MIN_WINDOW + WINDOW_GAP));
  const overflow = [];
  for (const s of perEdge.values()) {
    const cap = capacity(edgeGeom(s.bi, s.ei).len);
    if (s.shops.length <= cap) continue;
    s.shops.sort((u, v) => u.priority - v.priority || u.r - v.r);
    for (const sh of s.shops.splice(cap)) overflow.push({ bi: s.bi, sh });
  }
  overflow.sort((u, v) => u.sh.priority - v.sh.priority || u.sh.r - v.sh.r);
  for (const o of overflow) {
    const ring = B.list[o.bi].outer;
    const n = ring.length >> 1;
    let best = -1, bestD = 40, bestT = 0;
    for (let ei = 0; ei < n; ei++) {
      const c = classOf(o.bi, ei);
      if (c === PARTY || c === SHORT) continue;
      const g = edgeGeom(o.bi, ei);
      const cur = perEdge.get(o.bi * 8192 + ei);
      if ((cur?.shops.length ?? 0) >= capacity(g.len)) continue;
      const d = distToSegment(o.sh.x, o.sh.z, g.ax, g.az, g.bx, g.bz) + (c === COURT ? 3 : 0);
      if (d < bestD) { bestD = d; best = ei; bestT = segT; }
    }
    if (best < 0) { report.droppedNoRoom++; continue; }
    o.sh.t = bestT;
    o.sh.court = classOf(o.bi, best) === COURT;
    slot(o.bi, best).shops.push(o.sh);
    report.relocated++;
  }

  // 3. Répartition le long de chaque côté et écriture.
  const widths = [];
  const keys = [...perEdge.keys()].sort((a, b) => a - b);
  for (const key of keys) {
    const s = perEdge.get(key);
    const n = s.shops.length;
    if (n === 0) continue;
    const g = edgeGeom(s.bi, s.ei);
    const usable = g.len - 2 * END_MARGIN - WINDOW_GAP * (n - 1);
    let total = 0;
    for (const sh of s.shops) { sh.w = Math.min(sh.want, g.len - 2 * END_MARGIN); total += sh.w; }
    if (total > usable) {
      // On réduit d'abord les vitrines les plus larges, sans descendre sous la largeur minimale.
      const f = usable / total;
      let fixed = 0, free = 0;
      for (const sh of s.shops) { if (sh.w * f < MIN_WINDOW) { sh.w = MIN_WINDOW; fixed += MIN_WINDOW; } else free += sh.w; }
      const f2 = free > 0 ? Math.max(0, usable - fixed) / free : 1;
      for (const sh of s.shops) if (sh.w > MIN_WINDOW) sh.w = Math.max(MIN_WINDOW, sh.w * f2);
      report.widthsShrunk += n;
    }
    s.shops.sort((u, v) => u.t - v.t || u.id - v.id);
    // Passe avant : chaque vitrine après la précédente ; passe arrière : tout tient avant la fin du côté.
    let cursor = END_MARGIN;
    for (const sh of s.shops) {
      sh.c = Math.max(sh.t * g.len, cursor + sh.w / 2);
      cursor = sh.c + sh.w / 2 + WINDOW_GAP;
    }
    cursor = g.len - END_MARGIN;
    for (let i = n - 1; i >= 0; i--) {
      const sh = s.shops[i];
      sh.c = Math.min(sh.c, cursor - sh.w / 2);
      cursor = sh.c - sh.w / 2 - WINDOW_GAP;
    }
    const ux = (g.bx - g.ax) / g.len, uz = (g.bz - g.az) / g.len;
    const heading = M.outwardHeading(g.ax, g.az, g.bx, g.bz);
    const b = B.list[s.bi];
    for (const sh of s.shops) {
      const c = clamp(sh.c, sh.w / 2, g.len - sh.w / 2);
      const x = g.ax + ux * c, z = g.az + uz * c;
      const tile = tiles.at(x, z);
      if (tile === undefined) { report.droppedOutside++; continue; }
      tile.shops.push({ id: sh.id, x, z, heading, width: round1(sh.w), category: sh.category, buildingId: b.id });
      b.hasShop = true;
      report.kept++;
      if (sh.court) report.onCourtFacade++;
      report.byCategory[sh.category] = (report.byCategory[sh.category] ?? 0) + 1;
      widths.push(sh.w);
    }
  }
  widths.sort((a, b) => a - b);
  report.widthMedian = widths.length > 0 ? round1(widths[widths.length >> 1]) : 0;
  report.buildingsWithShop = B.list.filter((b) => b.hasShop).length;
  return report;
}
