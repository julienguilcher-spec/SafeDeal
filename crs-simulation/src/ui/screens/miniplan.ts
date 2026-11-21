/* =====================================================================================
 * Page d'accueil — mini-plan de situation du lieu choisi.
 *
 * Si le service 'world.map2d' existe (méthode draw, voir Map2dLike), il dessine le fond. Sinon le
 * plan est tracé ici d'après le contrat du monde : emprise (ctx.world.bounds),
 * grands axes du graphe routier (ctx.world.edge) s'il est chargé, et un tracé schématique de la
 * Seine. Les lieux proposés sont des points ; le lieu choisi est cerclé de jaune.
 * ===================================================================================== */

import type { GameContext, WorldBounds } from '@/core/contracts';
import type { Map2dLike } from '../core/api';

export interface PlanPlace {
  name: string;
  x: number | null;
  z: number | null;
}

/** Tracé schématique de la Seine dans l'emprise du jeu (repère du BRIEF : x = est, z = sud), d'ouest en est. */
const SEINE: readonly number[] = [
  -2760, 1330, -2180, 720, -1440, 230, -620, 235, -60, 300, 650, 540, 1500, 985, 1900, 1180, 2500, 1450, 2950, 1730, 3400, 2100,
];

/** Emprise nominale du BRIEF, utilisée si le monde n'en fournit pas de valide. */
const NOMINAL: WorldBounds = { minX: -2656, minZ: -1375, maxX: 3758, maxZ: 1739 };

interface Fit {
  scale: number;
  ox: number;
  oz: number;
}

function fit(bounds: WorldBounds, width: number, height: number, pad: number): Fit {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min((width - pad * 2) / bw, (height - pad * 2) / bh);
  return {
    scale,
    ox: (width - bw * scale) / 2 - bounds.minX * scale,
    oz: (height - bh * scale) / 2 - bounds.minZ * scale,
  };
}

function usableBounds(b: WorldBounds): WorldBounds {
  const ok = Number.isFinite(b.minX) && Number.isFinite(b.maxX) && Number.isFinite(b.minZ) && Number.isFinite(b.maxZ)
    && b.maxX - b.minX > 200 && b.maxZ - b.minZ > 200 && b.maxX - b.minX < 40000;
  return ok ? b : NOMINAL;
}

/** Fond de plan (routes) mis en cache par nombre d'arêtes : le graphe ne change pas pendant qu'on règle le scénario. */
let roadCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function drawRoads(ctx: GameContext, width: number, height: number, f: Fit): HTMLCanvasElement | null {
  const world = ctx.world;
  const count = world.edgeCount;
  if (!(count > 0)) return null;
  const key = `${count}|${width}|${height}|${f.scale.toFixed(5)}`;
  if (roadCache && roadCache.key === key) return roadCache.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // deux passes : voies secondaires fines, puis grands axes
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    for (let id = 0; id < count; id++) {
      const e = world.edge(id);
      if (!e || e.id < 0) continue;
      const major = e.roadClass === 'primary' || e.roadClass === 'motorway';
      const mid = e.roadClass === 'secondary' || e.roadClass === 'tertiary';
      if (pass === 0 ? !mid : !major) continue;
      const pts = e.points;
      if (pts.length < 4) continue;
      g.moveTo(pts[0]! * f.scale + f.ox, pts[1]! * f.scale + f.oz);
      for (let k = 2; k + 1 < pts.length; k += 2) g.lineTo(pts[k]! * f.scale + f.ox, pts[k + 1]! * f.scale + f.oz);
    }
    g.strokeStyle = pass === 0 ? 'rgba(150, 170, 205, .34)' : 'rgba(205, 218, 240, .7)';
    g.lineWidth = pass === 0 ? Math.max(0.6, width / 520) : Math.max(1, width / 300);
    g.stroke();
  }
  roadCache = { key, canvas };
  return canvas;
}

/** Résultat du dessin : nature du fond et passage d'un point du canevas (pixels CSS) au monde. */
export interface MiniPlanView {
  /** De vraies rues ont été tracées (sinon le plan est schématique). */
  real: boolean;
  /** Coordonnées du monde d'un point donné en pixels CSS depuis le coin haut gauche du canevas. */
  toWorld(cssX: number, cssY: number): { x: number; z: number };
}

/** Dessine le plan. `selected` : index du lieu choisi dans `places` (−1 si aucun). */
export function drawMiniPlan(canvas: HTMLCanvasElement, ctx: GameContext, places: readonly PlanPlace[], selected: number): MiniPlanView {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  const cssW = canvas.clientWidth || 320;
  const cssH = Math.round(cssW * 0.58);
  const width = Math.max(120, Math.round(cssW * dpr));
  const height = Math.max(70, Math.round(cssH * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const bounds = usableBounds(ctx.world.bounds);
  const f = fit(bounds, width, height, 10 * dpr);
  const view: MiniPlanView = {
    real: false,
    toWorld: (cssX: number, cssY: number) => ({ x: (cssX * (width / cssW) - f.ox) / f.scale, z: (cssY * (height / cssH) - f.oz) / f.scale }),
  };
  const g = canvas.getContext('2d');
  if (!g) return view;
  let real = false;

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, width, height);
  g.fillStyle = '#0a111f';
  g.fillRect(0, 0, width, height);

  const sel = selected >= 0 ? places[selected] : undefined;
  const map2d = ctx.service<Map2dLike>('world.map2d');
  let external = false;
  if (map2d && typeof map2d.draw === 'function') {
    try {
      // même repère que nos repères : le centre du canevas, et notre échelle en mètres par pixel
      const cx = (width / 2 - f.ox) / f.scale;
      const cz = (height / 2 - f.oz) / f.scale;
      g.save();
      map2d.draw(g, cx, cz, 1 / f.scale, 0, { width, height, pixelRatio: dpr, labels: false, detail: 'mini' });
      g.restore();
      external = true;
      real = ctx.world.edgeCount > 0;
      g.setTransform(1, 0, 0, 1, 0, 0);
    } catch (err) {
      console.error('[ui] mini-plan : world.map2d.draw a échoué', err);
    }
  }
  if (!external) {
    // emprise
    g.fillStyle = '#0e1728';
    g.fillRect(bounds.minX * f.scale + f.ox, bounds.minZ * f.scale + f.oz, (bounds.maxX - bounds.minX) * f.scale, (bounds.maxZ - bounds.minZ) * f.scale);
    // Seine (schéma)
    g.save();
    g.beginPath();
    g.rect(bounds.minX * f.scale + f.ox, bounds.minZ * f.scale + f.oz, (bounds.maxX - bounds.minX) * f.scale, (bounds.maxZ - bounds.minZ) * f.scale);
    g.clip();
    g.beginPath();
    g.moveTo(SEINE[0]! * f.scale + f.ox, SEINE[1]! * f.scale + f.oz);
    for (let i = 2; i + 1 < SEINE.length; i += 2) g.lineTo(SEINE[i]! * f.scale + f.ox, SEINE[i + 1]! * f.scale + f.oz);
    g.strokeStyle = 'rgba(52, 104, 168, .78)';
    g.lineWidth = Math.max(3, 150 * f.scale);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
    g.restore();
    const roads = drawRoads(ctx, width, height, f);
    if (roads) {
      g.drawImage(roads, 0, 0);
      real = true;
    }
    g.strokeStyle = 'rgba(160, 180, 215, .4)';
    g.lineWidth = dpr;
    g.strokeRect(bounds.minX * f.scale + f.ox + 0.5, bounds.minZ * f.scale + f.oz + 0.5, (bounds.maxX - bounds.minX) * f.scale - 1, (bounds.maxZ - bounds.minZ) * f.scale - 1);
  }

  // lieux
  for (let i = 0; i < places.length; i++) {
    const p = places[i]!;
    if (p.x === null || p.z === null || i === selected) continue;
    const x = p.x * f.scale + f.ox;
    const y = p.z * f.scale + f.oz;
    g.beginPath();
    g.arc(x, y, 3 * dpr, 0, Math.PI * 2);
    g.fillStyle = '#dfe6f2';
    g.fill();
    g.lineWidth = dpr;
    g.strokeStyle = '#0a111f';
    g.stroke();
  }
  if (sel && sel.x !== null && sel.z !== null) {
    const x = sel.x * f.scale + f.ox;
    const y = sel.z * f.scale + f.oz;
    g.beginPath();
    g.arc(x, y, 11 * dpr, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255, 214, 10, .2)';
    g.fill();
    g.lineWidth = 2 * dpr;
    g.strokeStyle = '#ffd60a';
    g.stroke();
    g.beginPath();
    g.arc(x, y, 4 * dpr, 0, Math.PI * 2);
    g.fillStyle = '#ffd60a';
    g.fill();
    // étiquette, toujours dans le cadre
    g.font = `600 ${Math.round(11.5 * dpr)}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    const text = sel.name;
    const tw = g.measureText(text).width;
    let tx = x - tw / 2;
    tx = Math.max(6 * dpr, Math.min(width - tw - 6 * dpr, tx));
    const above = y - 18 * dpr > 16 * dpr;
    const ty = above ? y - 17 * dpr : y + 26 * dpr;
    g.fillStyle = 'rgba(6, 11, 21, .82)';
    g.fillRect(tx - 5 * dpr, ty - 12 * dpr, tw + 10 * dpr, 17 * dpr);
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    g.fillText(text, tx, ty);
  }
  // nord
  g.font = `700 ${Math.round(10 * dpr)}px system-ui, sans-serif`;
  g.fillStyle = 'rgba(223, 230, 242, .8)';
  g.textBaseline = 'top';
  g.fillText('N ↑', width - 30 * dpr, 6 * dpr);
  view.real = real;
  return view;
}

/** Index du lieu le plus proche d'un point du monde (−1 si aucun lieu n'a de coordonnées). */
export function nearestPlace(places: readonly PlanPlace[], x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < places.length; i++) {
    const p = places[i]!;
    if (p.x === null || p.z === null) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
