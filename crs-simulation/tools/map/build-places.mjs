/* =====================================================================================
 * CARTE DE PARIS — LIEUX NOMMÉS (GPS, radio, missions)
 * -------------------------------------------------------------------------------------
 * Entrée : raw/normalized/places.geojson (toponymes du lot A), les stations du lot B, le
 * graphe routier construit et les surfaces nommées.
 * Un lieu « street », « quay » ou « bridge » porte le nom d'arêtes du graphe : son point est
 * pris SUR ces arêtes et son rayon couvre leur étendue. Un nom sans arête dans le graphe
 * (voie souterraine, piste cyclable) n'est pas publié.
 * ===================================================================================== */
import { M, readLayer, px, pz, normName, clamp, isCommercialName } from './build-lib.mjs';

/** Lieux d'importance 3 (majeurs), par nom normalisé. */
const MAJOR = new Set([
  // places
  'place de la concorde', 'place charles de gaulle', 'place de la republique', 'place de la bastille', 'place de l opera',
  'place vendome', 'place de la madeleine', 'place du trocadero et du 11 novembre', 'place du chatelet',
  'place de l hotel de ville esplanade de la liberation', 'esplanade des invalides', 'place saint michel',
  'parvis notre dame place jean paul ii', 'place de l alma', 'place vauban', 'rond point des champs elysees marcel dassault',
  // voies
  'avenue des champs elysees', 'rue de rivoli', 'boulevard saint germain', 'boulevard haussmann', 'avenue de l opera',
  'boulevard de sebastopol', 'rue royale', 'boulevard saint michel', 'boulevard de magenta', 'boulevard voltaire',
  'boulevard beaumarchais', 'boulevard du temple', 'avenue de la grande armee', 'avenue foch', 'boulevard des capucines',
  'boulevard des italiens', 'rue de la paix', 'rue du faubourg saint honore', 'boulevard malesherbes', 'avenue montaigne',
  'avenue george v', 'avenue kleber', 'avenue de friedland', 'avenue marceau', 'avenue d iena', 'avenue de wagram',
  'avenue hoche', 'avenue victor hugo', 'boulevard saint martin', 'boulevard de la madeleine', 'rue saint antoine',
  'quai d orsay', 'quai des tuileries', 'quai francois mitterrand', 'quai de l hotel de ville', 'cours la reine',
  // ponts
  'pont de la concorde', 'pont alexandre iii', 'pont neuf', 'pont d iena', 'pont de l alma', 'pont au change',
  'pont saint michel', 'pont notre dame', 'pont d arcole', 'pont royal', 'pont du carrousel', 'pont des invalides', 'pont de sully',
  // jardins
  'jardin des tuileries', 'champ de mars', 'jardins du trocadero', 'jardins des champs elysees', 'jardin du palais royal',
  // monuments et institutions
  'arc de triomphe', 'tour eiffel', 'cathedrale notre dame de paris', 'palais du louvre', 'musee du louvre', 'opera garnier',
  'palais garnier', 'hotel des invalides', 'grand palais', 'petit palais', 'eglise de la madeleine', 'palais bourbon',
  'assemblee nationale', 'hotel de ville', 'palais de l elysee', 'sainte chapelle', 'centre pompidou', 'palais de chaillot',
  'obelisque de louxor', 'colonne vendome', 'colonne de juillet', 'monument a la republique', 'palais de justice de paris',
  'prefecture de police', 'hotel de matignon', 'opera bastille', 'ecole militaire', 'palais royal', 'conciergerie',
  'ministere de l interieur', 'musee d orsay', 'gare saint lazare',
]);

function importanceOf(rank, name) {
  if (MAJOR.has(normName(name))) return 3;
  return rank === 1 ? 2 : rank === 2 ? 1 : 0;
}

/**
 * @param ctx { roads, areas, stations, landmarkParts, brands }
 */
export function buildPlaces(ctx) {
  const fc = readLayer('places');
  const report = { source: fc.features.length, kept: 0, byKind: {}, streetsWithoutEdge: 0, streetsWithoutEdgeSample: [], duplicatesMerged: 0, stationsIdfm: 0, stationsOsmOnly: 0, commercialNamesRemoved: [] };
  const out = [];
  const add = (place) => {
    out.push(place);
    report.byKind[place.kind] = (report.byKind[place.kind] ?? 0) + 1;
  };

  // Surface cumulée des surfaces nommées, par nom.
  const areaOf = new Map();
  for (const s of ctx.areas.list) {
    if (s.name === '') continue;
    const k = normName(s.name);
    areaOf.set(k, (areaOf.get(k) ?? 0) + s.area);
  }
  const landmarkArea = new Map();
  for (const p of ctx.landmarkParts) landmarkArea.set(normName(p.name), p.area);

  // Voies, quais, ponts : géométrie prise dans le graphe.
  const byName = M.edgesByName(ctx.roads);
  const linear = new Map();
  const points = new Map();
  for (const f of fc.features) {
    const p = f.properties;
    if (typeof p.name !== 'string' || p.name === '') continue;
    const key = `${p.kind}|${p.name}`;
    const rank = Number.isFinite(p.rank) ? p.rank : 3;
    if (f.geometry.type === 'LineString') {
      const cur = linear.get(key);
      if (cur === undefined) linear.set(key, { kind: p.kind, name: p.name, rank });
      else { cur.rank = Math.min(cur.rank, rank); report.duplicatesMerged++; }
    } else if (f.geometry.type === 'Point') {
      if (p.kind === 'station') continue;      // traitées plus bas, avec leurs lignes
      // Monuments et institutions : un nom de commerce ou une marque déposée n'est pas publié.
      if ((p.kind === 'monument' || p.kind === 'institution') && isCommercialName(p.name, ctx.brands)) {
        report.commercialNamesRemoved.push(p.name);
        continue;
      }
      const cur = points.get(key);
      const item = { kind: p.kind, name: p.name, rank, x: px(f.geometry.coordinates[0]), z: pz(f.geometry.coordinates[1]) };
      if (cur === undefined) points.set(key, item);
      else { if (rank < cur.rank) points.set(key, item); report.duplicatesMerged++; }
    }
  }
  for (const it of linear.values()) {
    const edges = byName.get(it.name);
    if (edges === undefined) {
      report.streetsWithoutEdge++;
      if (report.streetsWithoutEdgeSample.length < 25) report.streetsWithoutEdgeSample.push(it.name);
      continue;
    }
    // Barycentre pondéré par la longueur, puis sommet d'arête le plus proche.
    let sx = 0, sz = 0, sl = 0;
    for (const e of edges) {
      const pts = ctx.roads.edges[e].points;
      for (let i = 2; i < pts.length; i += 2) {
        const l = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
        sx += ((pts[i] + pts[i - 2]) / 2) * l;
        sz += ((pts[i + 1] + pts[i - 1]) / 2) * l;
        sl += l;
      }
    }
    if (!(sl > 0)) continue;
    const cx = sx / sl, cz = sz / sl;
    let bx = cx, bz = cz, best = Infinity;
    for (const e of edges) {
      const pts = ctx.roads.edges[e].points;
      for (let i = 2; i < pts.length; i += 2) {
        // point du segment le plus proche du barycentre
        const ax = pts[i - 2], az = pts[i - 1], dx = pts[i] - ax, dz = pts[i + 1] - az;
        const l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? clamp(((cx - ax) * dx + (cz - az) * dz) / l2, 0, 1) : 0;
        const qx = ax + dx * t, qz = az + dz * t;
        const d = Math.hypot(qx - cx, qz - cz);
        if (d < best) { best = d; bx = qx; bz = qz; }
      }
    }
    let radius = 0;
    for (const e of edges) {
      const pts = ctx.roads.edges[e].points;
      for (let i = 0; i < pts.length; i += 2) radius = Math.max(radius, Math.hypot(pts[i] - bx, pts[i + 1] - bz));
    }
    add({ name: it.name, kind: it.kind, x: bx, z: bz, radius: Math.round(clamp(radius, 5, 5000)), importance: importanceOf(it.rank, it.name), ref: '' });
  }

  // Lieux ponctuels.
  for (const it of points.values()) {
    const k = normName(it.name);
    let radius;
    if (it.kind === 'square' || it.kind === 'garden') {
      const a = areaOf.get(k);
      radius = a !== undefined ? Math.sqrt(a / Math.PI) : it.kind === 'square' ? (it.rank === 1 ? 70 : 35) : 40;
    } else if (it.kind === 'district') radius = it.rank === 1 ? 700 : 350;
    else if (it.kind === 'monument') {
      const a = landmarkArea.get(k);
      radius = a !== undefined ? Math.sqrt(a / Math.PI) : 30;
    } else radius = 30;
    add({ name: it.name, kind: it.kind, x: it.x, z: it.z, radius: Math.round(clamp(radius, 5, 1500)), importance: importanceOf(it.rank, it.name), ref: '' });
  }

  // Stations : référentiel d'Île-de-France Mobilités (avec lignes), complété par les stations OSM sans équivalent.
  const stationKeys = new Set();
  for (const s of ctx.stations) {
    const key = `station|${s.name}`;
    if (stationKeys.has(key)) continue;
    stationKeys.add(key);
    const n = s.lines.length;
    add({ name: s.name, kind: 'station', x: s.x, z: s.z, radius: 60, importance: MAJOR.has(normName(s.name)) || n >= 5 ? 3 : n >= 3 ? 2 : 1, ref: s.lines.join(';') });
    report.stationsIdfm++;
  }
  for (const f of fc.features) {
    const p = f.properties;
    if (p.kind !== 'station' || f.geometry.type !== 'Point' || typeof p.name !== 'string' || p.name === '') continue;
    const key = `station|${p.name}`;
    if (stationKeys.has(key)) continue;
    const x = px(f.geometry.coordinates[0]), z = pz(f.geometry.coordinates[1]);
    const k = normName(p.name);
    // Même station sous une autre graphie, ou à moins de 150 m d'une station du référentiel : doublon.
    if (ctx.stations.some((s) => s.key === k || Math.hypot(s.x - x, s.z - z) < 150)) continue;
    stationKeys.add(key);
    add({ name: p.name, kind: 'station', x, z, radius: 60, importance: 1, ref: '' });
    report.stationsOsmOnly++;
  }

  // Ordre stable : par nature, puis importance décroissante, puis nom.
  const order = new Map(M.PLACE_KINDS.map((k, i) => [k, i]));
  out.sort((a, b) => order.get(a.kind) - order.get(b.kind) || b.importance - a.importance || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  report.kept = out.length;
  report.major = out.filter((p) => p.importance === 3).length;
  return { list: out, report };
}
