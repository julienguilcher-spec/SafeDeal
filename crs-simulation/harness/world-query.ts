/* =====================================================================================
 * Banc d'essai 2D du monde côté simulation (src/world/query).
 *
 * Dessine dans un canvas, vu de dessus (nord en haut) :
 *   - la grille de surfaces (surfaceAt), une couleur par nature de sol ;
 *   - les obstacles statiques (murs, barrières, berges, monuments) ;
 *   - le graphe routier (sens uniques fléchés, voies piétonnes, ponts) ;
 *   - un itinéraire piéton et un itinéraire véhicule (findPath) ;
 *   - un éventail de rayons (raycast) ;
 *   - des « marcheurs » : des disques lâchés au hasard, déplacés pas à pas avec resolveCircle —
 *     leurs traces montrent le glissement le long des murs ; aucune ne doit traverser un obstacle.
 *
 * Paramètres d'URL : ?map=test|paris &x= &z= &span= (largeur de vue en m) &place= (nom de lieu)
 * API pour les tests : window.__wq.view({ x, z, span, place }) → Promise ; window.__ready.
 * ===================================================================================== */

import { createWorldQuery, SURFACE_CODES } from '../src/world/query';
import type { ObstacleSegmentView } from '../src/world/query';
import type { RayHit, RoadSample, Vec2 } from '../src/core/contracts';

interface ViewRequest { x?: number; z?: number; span?: number; place?: string; walkers?: number }
interface ViewReport {
  place: string; x: number; z: number; span: number; source: string;
  footPath: number; vehiclePath: number; rays: number; rayHits: number;
  walkers: number; walkerSteps: number; walkersInSolid: number; resolveMicros: number; drawMs: number;
}

const params = new URLSearchParams(location.search);
const mapName = params.get('map') === 'paris' ? 'paris' : 'test';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx2d = canvas.getContext('2d') as CanvasRenderingContext2D;
const titleEl = document.getElementById('title') as HTMLElement;
const infoEl = document.getElementById('info') as HTMLElement;
const legendEl = document.getElementById('legend') as HTMLElement;

// Couleurs par code de surface (même ordre que SURFACE_CODES).
const SURFACE_COLORS: Record<string, [number, number, number]> = {
  void: [24, 25, 30],
  road: [92, 95, 102],
  sidewalk: [186, 180, 167],
  plaza: [209, 199, 176],
  sett: [140, 127, 112],
  park: [120, 160, 100],
  gravel: [218, 203, 160],
  water: [98, 150, 196],
  building: [136, 118, 104],
  bridge: [168, 158, 190],
  quay: [160, 170, 160],
  interior: [200, 170, 170],
};
const SURFACE_LABELS: Record<string, string> = {
  void: 'hors carte / non chargé', road: 'chaussée', sidewalk: 'trottoir', plaza: 'place, cour', sett: 'pavés',
  park: 'espace vert', gravel: 'stabilisé', water: 'eau', building: 'bâtiment', bridge: 'pont', quay: 'berge',
};
const OBSTACLE_COLORS: Record<string, string> = { building: '#3b1f14', barrier: '#ff9b2f', bank: '#0b3d91', landmark: '#8a2be2' };

function buildLegend(): void {
  const rows: string[] = [];
  for (const kind of SURFACE_CODES) {
    if (kind === 'interior') continue;
    const c = SURFACE_COLORS[kind];
    rows.push(`<div><i style="background:rgb(${c[0]},${c[1]},${c[2]})"></i>${SURFACE_LABELS[kind]}</div>`);
  }
  rows.push(`<div><b style="border-color:${OBSTACLE_COLORS.building}"></b>mur de bâtiment</div>`);
  rows.push(`<div><b style="border-color:${OBSTACLE_COLORS.barrier}"></b>mur, grille, haie, garde-corps</div>`);
  rows.push(`<div><b style="border-color:${OBSTACLE_COLORS.bank}"></b>berge, parapet de pont</div>`);
  rows.push(`<div><b style="border-color:${OBSTACLE_COLORS.landmark}"></b>monument</div>`);
  rows.push('<div><b style="border-color:#ffffff"></b>voie (flèche = sens unique)</div>');
  rows.push('<div><b style="border-color:#3fe07a"></b>voie piétonne</div>');
  rows.push('<div><b style="border-color:#ffe14a"></b>itinéraire piéton</div>');
  rows.push('<div><b style="border-color:#ff4fd8"></b>itinéraire véhicule</div>');
  rows.push('<div><b style="border-color:#7df9ff"></b>traces des marcheurs</div>');
  rows.push('<div><b style="border-color:#ff3b30"></b>rayons (point = impact)</div>');
  legendEl.innerHTML = rows.join('');
}

const world = createWorldQuery({ source: mapName, baseUrl: '../data/paris/' });

/** Générateur pseudo-aléatoire déterministe (les captures sont reproductibles). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polylineLength(pts: readonly number[]): number {
  let len = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

async function view(req: ViewRequest): Promise<ViewReport> {
  const t0 = performance.now();
  let cx = req.x ?? 0, cz = req.z ?? 0;
  let placeName = '';
  if (req.place) {
    const p = world.placeByName(req.place);
    if (p) {
      cx = p.x;
      cz = p.z;
      placeName = p.name;
    }
  }
  const span = req.span ?? 400;
  const W = (canvas.width = window.innerWidth);
  const H = (canvas.height = window.innerHeight);
  const scale = W / span; // pixels par mètre
  const x0 = cx - span / 2, z0 = cz - H / scale / 2;
  const x1 = x0 + span, z1 = z0 + H / scale;
  const toX = (x: number): number => (x - x0) * scale;
  const toY = (z: number): number => (z - z0) * scale;

  world.setFocus(cx, cz);
  await world.whenLoaded(cx, cz, Math.hypot(span, H / scale) / 2 + 20);

  // ── 1. grille de surfaces ──
  const img = ctx2d.createImageData(W, H);
  const colors = SURFACE_CODES.map((k) => SURFACE_COLORS[k]);
  for (let py = 0; py < H; py++) {
    const z = z0 + (py + 0.5) / scale;
    for (let px = 0; px < W; px++) {
      const x = x0 + (px + 0.5) / scale;
      const c = colors[world.surfaceCodeAt(x, z)];
      const o = (py * W + px) * 4;
      // Léger damier métrique pour lire l'échelle quand on est très près.
      const shade = scale >= 6 && ((Math.floor(x) + Math.floor(z)) & 1) === 0 ? 0.96 : 1;
      img.data[o] = c[0] * shade;
      img.data[o + 1] = c[1] * shade;
      img.data[o + 2] = c[2] * shade;
      img.data[o + 3] = 255;
    }
  }
  ctx2d.putImageData(img, 0, 0);

  // ── 2. graphe routier ──
  ctx2d.lineCap = 'round';
  ctx2d.lineJoin = 'round';
  const sample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  for (let e = 0; e < world.edgeCount; e++) {
    const ed = world.edge(e);
    const pts = ed.points;
    let visible = false;
    for (let i = 0; i + 1 < pts.length && !visible; i += 2) visible = pts[i] >= x0 - 60 && pts[i] <= x1 + 60 && pts[i + 1] >= z0 - 60 && pts[i + 1] <= z1 + 60;
    if (!visible) continue;
    ctx2d.beginPath();
    ctx2d.moveTo(toX(pts[0]), toY(pts[1]));
    for (let i = 2; i + 1 < pts.length; i += 2) ctx2d.lineTo(toX(pts[i]), toY(pts[i + 1]));
    ctx2d.strokeStyle = ed.pedestrianOnly ? '#3fe07a' : ed.bridge ? '#d0c4ff' : '#ffffff';
    ctx2d.globalAlpha = 0.75;
    ctx2d.lineWidth = Math.max(1, Math.min(2.5, scale * 0.35));
    ctx2d.setLineDash(ed.pedestrianOnly ? [4, 4] : []);
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    // Flèche de sens unique au milieu de l'arête.
    if (ed.oneway && scale * ed.length > 40) {
      const m = (pts.length >> 2) * 2;
      const ax = pts[Math.max(0, m - 2)], az = pts[Math.max(1, m - 1)], bx = pts[m], bz = pts[m + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const mx = toX((ax + bx) / 2), my = toY((az + bz) / 2);
      const s = Math.max(4, Math.min(9, scale * 1.6));
      ctx2d.beginPath();
      ctx2d.moveTo(mx + ux * s, my + uz * s);
      ctx2d.lineTo(mx - ux * s - uz * s * 0.6, my - uz * s + ux * s * 0.6);
      ctx2d.lineTo(mx - ux * s + uz * s * 0.6, my - uz * s - ux * s * 0.6);
      ctx2d.closePath();
      ctx2d.fillStyle = '#ffffff';
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;
  }
  if (scale >= 1.2) {
    for (let n = 0; n < world.nodeCount; n++) {
      const nd = world.node(n);
      if (nd.x < x0 || nd.x > x1 || nd.z < z0 || nd.z > z1) continue;
      ctx2d.beginPath();
      ctx2d.arc(toX(nd.x), toY(nd.z), nd.signal ? 3.2 : 2, 0, Math.PI * 2);
      ctx2d.fillStyle = nd.signal ? '#ff5a4f' : nd.crossing ? '#ffd24a' : '#f2f2f2';
      ctx2d.fill();
    }
  }

  // ── 3. obstacles ──
  const segs: ObstacleSegmentView[] = [];
  world.forEachObstacle(x0, z0, x1, z1, (s) => segs.push(s));
  for (const kind of ['building', 'landmark', 'bank', 'barrier']) {
    ctx2d.beginPath();
    for (const s of segs) {
      if (s.kind !== kind) continue;
      ctx2d.moveTo(toX(s.ax), toY(s.az));
      ctx2d.lineTo(toX(s.bx), toY(s.bz));
    }
    ctx2d.strokeStyle = OBSTACLE_COLORS[kind];
    ctx2d.lineWidth = kind === 'building' ? Math.max(1, Math.min(2, scale * 0.25)) : Math.max(1.5, Math.min(3, scale * 0.4));
    ctx2d.stroke();
  }

  // ── 4. marcheurs : resolveCircle pas à pas ──
  const rand = mulberry32(12345);
  const walkerCount = req.walkers ?? 60;
  const radius = 0.3;
  const pos: Vec2 = { x: 0, z: 0 };
  let steps = 0, inSolid = 0, resolveMs = 0;
  ctx2d.strokeStyle = '#7df9ff';
  ctx2d.globalAlpha = 0.9;
  ctx2d.lineWidth = 1.2;
  for (let w = 0; w < walkerCount; w++) {
    if (!world.randomFreePoint(cx, cz, span * 0.42, 'any', rand, pos)) continue;
    let heading = rand() * Math.PI * 2;
    const stride = 0.35;
    const count = Math.round((span * 0.5) / stride);
    ctx2d.beginPath();
    ctx2d.moveTo(toX(pos.x), toY(pos.z));
    const tr = performance.now();
    for (let i = 0; i < count; i++) {
      // Cap presque constant : le marcheur bute sur les murs et glisse le long.
      heading += (rand() - 0.5) * 0.08;
      pos.x += Math.sin(heading) * stride;
      pos.z += Math.cos(heading) * stride;
      world.resolveCircle(pos, radius);
      steps++;
      if (world.isSolidAt(pos.x, pos.z)) inSolid++;
      ctx2d.lineTo(toX(pos.x), toY(pos.z));
    }
    resolveMs += performance.now() - tr;
    ctx2d.stroke();
    ctx2d.beginPath();
    ctx2d.arc(toX(pos.x), toY(pos.z), Math.max(2, radius * scale), 0, Math.PI * 2);
    ctx2d.fillStyle = '#7df9ff';
    ctx2d.fill();
  }
  ctx2d.globalAlpha = 1;

  // ── 5. itinéraires ──
  const path: number[] = [];
  const drawPath = (color: string, width: number): void => {
    ctx2d.beginPath();
    ctx2d.moveTo(toX(path[0]), toY(path[1]));
    for (let i = 2; i + 1 < path.length; i += 2) ctx2d.lineTo(toX(path[i]), toY(path[i + 1]));
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = width;
    ctx2d.stroke();
  };
  const ax = cx - span * 0.4, az = cz + (H / scale) * 0.3, bx = cx + span * 0.4, bz = cz - (H / scale) * 0.3;
  let footLen = 0, vehicleLen = 0;
  if (world.findPath(ax, az, bx, bz, 'vehicle', path)) {
    vehicleLen = polylineLength(path);
    drawPath('#ff4fd8', 5);
  }
  if (world.findPath(ax, az, bx, bz, 'foot', path)) {
    footLen = polylineLength(path);
    drawPath('#ffe14a', 2.5);
  }
  for (const [x, z, label] of [[ax, az, 'A'], [bx, bz, 'B']] as const) {
    ctx2d.beginPath();
    ctx2d.arc(toX(x), toY(z), 7, 0, Math.PI * 2);
    ctx2d.fillStyle = '#111';
    ctx2d.fill();
    ctx2d.fillStyle = '#ffe14a';
    ctx2d.font = 'bold 11px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(label, toX(x), toY(z) + 0.5);
  }

  // ── 6. éventail de rayons depuis un point libre proche du centre ──
  const hit: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
  const origin: Vec2 = { x: cx, z: cz };
  if (!world.isFree(cx, cz, 0.5)) world.randomFreePoint(cx, cz, Math.min(60, span * 0.2), 'any', rand, origin);
  const rayCount = 96, rayLen = span * 0.3;
  let rayHits = 0;
  ctx2d.lineWidth = 1;
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    const ex = origin.x + Math.cos(a) * rayLen, ez = origin.z + Math.sin(a) * rayLen;
    const blocked = world.raycast(origin.x, origin.z, ex, ez, hit);
    ctx2d.beginPath();
    ctx2d.moveTo(toX(origin.x), toY(origin.z));
    ctx2d.lineTo(toX(hit.x), toY(hit.z));
    ctx2d.strokeStyle = blocked ? 'rgba(255, 59, 48, 0.55)' : 'rgba(70, 255, 120, 0.4)';
    ctx2d.stroke();
    if (blocked) {
      rayHits++;
      ctx2d.beginPath();
      ctx2d.arc(toX(hit.x), toY(hit.z), 2.2, 0, Math.PI * 2);
      ctx2d.fillStyle = hit.kind === 'building' ? '#ff3b30' : '#ffb020';
      ctx2d.fill();
    }
  }

  // ── 7. échelle et texte ──
  const barMeters = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((m) => m * scale >= 80) ?? 500;
  ctx2d.fillStyle = 'rgba(18,19,23,0.8)';
  ctx2d.fillRect(12, H - 34, barMeters * scale + 16, 24);
  ctx2d.fillStyle = '#fff';
  ctx2d.fillRect(20, H - 18, barMeters * scale, 3);
  ctx2d.font = '11px system-ui';
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'alphabetic';
  ctx2d.fillText(`${barMeters} m`, 20, H - 22);

  const stats = world.stats();
  const sector = world.sectorName(cx, cz);
  const report: ViewReport = {
    place: placeName, x: cx, z: cz, span, source: stats.source,
    footPath: footLen, vehiclePath: vehicleLen, rays: rayCount, rayHits,
    walkers: walkerCount, walkerSteps: steps, walkersInSolid: inSolid,
    resolveMicros: steps > 0 ? (resolveMs * 1000) / steps : 0,
    drawMs: performance.now() - t0,
  };
  titleEl.textContent = `Monde — ${stats.source}${stats.fallback ? ' (secours)' : ''}`;
  infoEl.textContent = [
    `centre (${cx.toFixed(0)} ; ${cz.toFixed(0)}) — ${sector}`,
    `vue ${span.toFixed(0)} m — ${stats.tilesLoaded} tuiles, ${stats.segments} segments, ${stats.solids} polygones, ${stats.grids} grilles`,
    `itinéraire A→B : piéton ${footLen.toFixed(0)} m, véhicule ${vehicleLen.toFixed(0)} m`,
    `rayons : ${rayHits}/${rayCount} arrêtés`,
    `marcheurs : ${steps} pas, ${inSolid} dans un obstacle, ${report.resolveMicros.toFixed(2)} µs par resolveCircle (tracé compris)`,
    `décodage ${stats.decodeMs.toFixed(0)} ms, obstacles ${stats.collisionBuildMs.toFixed(0)} ms, grilles ${stats.rasterMs.toFixed(0)} ms`,
    world.attribution,
  ].join('\n');
  return report;
}

declare global {
  interface Window {
    __ready?: boolean;
    __error?: string;
    __wq?: { view(req: ViewRequest): Promise<ViewReport>; world: typeof world; last: ViewReport | null };
  }
}

async function main(): Promise<void> {
  buildLegend();
  await world.boot();
  const api = { view: async (req: ViewRequest) => (api.last = await view(req)), world, last: null as ViewReport | null };
  window.__wq = api;
  const num = (k: string): number | undefined => (params.get(k) !== null && params.get(k) !== '' ? Number(params.get(k)) : undefined);
  await api.view({ x: num('x'), z: num('z'), span: num('span') ?? (mapName === 'test' ? 1060 : 600), place: params.get('place') ?? undefined });
  window.__ready = true;
}

main().catch((err) => {
  window.__error = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error('[banc monde]', err);
  titleEl.textContent = 'Erreur';
  infoEl.textContent = window.__error;
});
