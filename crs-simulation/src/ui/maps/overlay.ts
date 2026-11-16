/* =====================================================================================
 * Couches dessinées par-dessus le fond de plan : foule (densité teintée par la tension), gaz et
 * feux, parcours et tête de cortège, fermetures de rues, métro, incidents, secours attendus,
 * objectifs, itinéraire GPS, joueur. Les unités et les ordres sont dans overlay-units.ts.
 * ===================================================================================== */

import type { RoadEdgeInfo } from '@/core/contracts';
import type { Incident, IncidentKind, RescueCall } from '@/core/extensions';
import type { GpsTarget } from './api';
import { drawOrders, drawUnits } from './overlay-units';
import type { UnitLayerOptions } from './overlay-units';
import type { MapScene } from './scene';
import type { MapTransform, ScreenPoint } from './transform';

export interface LayerMask {
  crowd: boolean;
  hazards: boolean;
  route: boolean;
  closures: boolean;
  metro: boolean;
  incidents: boolean;
  rescue: boolean;
  objectives: boolean;
  units: boolean;
  orders: boolean;
  player: boolean;
  gps: boolean;
}

export const ALL_LAYERS: Readonly<LayerMask> = {
  crowd: true, hazards: true, route: true, closures: true, metro: true, incidents: true, rescue: true,
  objectives: true, units: true, orders: true, player: true, gps: true,
};

export interface OverlayOptions extends UnitLayerOptions {
  layers: LayerMask;
  /** Horloge réelle (s) pour les animations discrètes (pulsation des urgences). */
  time: number;
  gpsRoute: readonly number[];
  gpsTarget: GpsTarget | null;
  /** Incident mis en avant (survol, sélection dans la liste, incident confié au joueur). */
  focusIncident: number;
  /** Station de métro et fermeture mises en avant. */
  focusStation: number;
  focusClosure: number;
  /** Accès aux arêtes du graphe (tracé des rues fermées). */
  edge: ((id: number) => RoadEdgeInfo) | null;
}

export const INCIDENT_COLORS = ['#ffd60a', '#ffd60a', '#ff9500', '#ff3b30'] as const;

type IncidentGlyph = 'feu' | 'blesse' | 'agent' | 'pillage' | 'barricade' | 'voiture' | 'secours' | 'suspect';

export const INCIDENT_GLYPHS: Readonly<Record<IncidentKind, IncidentGlyph>> = {
  feu_poubelle: 'feu', feu_barricade: 'feu', feu_vehicule: 'feu', feu_boutique: 'feu',
  blesse: 'blesse', agent_a_terre: 'agent', agent_isole: 'agent',
  pillage: 'pillage', barricade: 'barricade', automobiliste_bloque: 'voiture', secours_bloques: 'secours',
  suspect: 'suspect',
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const HALO = '#0b1322';
const SP: ScreenPoint = { x: 0, y: 0 };

/** Applique au canevas la transformation monde → écran (pour dessiner une image posée dans le monde). */
function applyWorld(g: CanvasRenderingContext2D, t: MapTransform): void {
  const fx = Math.sin(t.up), fz = Math.cos(t.up);
  const rx = -fz, rz = fx;
  const k = 1 / t.mpp;
  g.transform(rx * k, -fx * k, rz * k, -fz * k, t.width * 0.5 - (t.cx * rx + t.cz * rz) * k, t.height * 0.5 + (t.cx * fx + t.cz * fz) * k);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 10, weight = 600): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.strokeStyle = HALO;
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

function polyline(g: CanvasRenderingContext2D, t: MapTransform, pts: ArrayLike<number>): void {
  g.beginPath();
  for (let i = 0; i + 1 < pts.length; i += 2) {
    t.worldToScreen(pts[i]!, pts[i + 1]!, SP);
    if (i === 0) g.moveTo(SP.x, SP.y);
    else g.lineTo(SP.x, SP.y);
  }
}

// ───────────────────────────── foule, gaz, feux ─────────────────────────────

function drawCrowd(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene): void {
  const grid = scene.density;
  const img = scene.densityImage;
  if (!img || grid.cols === 0 || grid.total === 0) return;
  g.save();
  applyWorld(g, t);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, grid.cols, grid.rows, grid.ox, grid.oz, grid.cols * grid.cell, grid.rows * grid.cell);
  g.restore();
}

function drawHazards(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, time: number, compact: boolean): void {
  if (scene.gasImage && scene.gasCols > 0) {
    g.save();
    applyWorld(g, t);
    g.imageSmoothingEnabled = true;
    g.drawImage(
      scene.gasImage, 0, 0, scene.gasCols, scene.gasRows, scene.gasOx, scene.gasOz,
      scene.gasCols * scene.gasCell, scene.gasRows * scene.gasCell,
    );
    g.restore();
  }
  const fires = scene.fires;
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i]!;
    if (!t.contains(f.x, f.z, 30)) continue;
    t.worldToScreen(f.x, f.z, SP);
    const r = Math.max(compact ? 3 : 4.5, f.radius / t.mpp);
    const flick = 0.85 + 0.15 * Math.sin(time * 9 + i * 1.7);
    const grad = g.createRadialGradient(SP.x, SP.y, 0, SP.x, SP.y, r * 1.9);
    grad.addColorStop(0, `rgba(255,214,10,${0.95 * flick})`);
    grad.addColorStop(0.45, `rgba(255,106,0,${0.8 * flick})`);
    grad.addColorStop(1, 'rgba(255,59,48,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(SP.x, SP.y, r * 1.9, 0, Math.PI * 2);
    g.fill();
  }
}

// ───────────────────────────── parcours ─────────────────────────────

function drawRoute(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, compact: boolean): void {
  const route = scene.route;
  if (route.length < 4) return;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  polyline(g, t, route);
  g.lineWidth = compact ? 5 : 9;
  g.strokeStyle = 'rgba(255,214,10,.16)';
  g.stroke();
  g.lineWidth = compact ? 1.3 : 1.8;
  g.strokeStyle = 'rgba(255,224,110,.85)';
  g.setLineDash(compact ? [5, 5] : [9, 7]);
  g.stroke();
  g.setLineDash([]);
  if (scene.hasHead && t.contains(scene.headX, scene.headZ, 20)) {
    t.worldToScreen(scene.headX, scene.headZ, SP);
    const a = t.headingToScreenAngle(scene.headHeading);
    g.save();
    g.translate(SP.x, SP.y);
    g.rotate(a);
    const s = compact ? 5 : 8;
    g.fillStyle = '#ffd60a';
    g.strokeStyle = HALO;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -s * 1.5);
    g.lineTo(s, s * 0.2);
    g.lineTo(0, -s * 0.25);
    g.lineTo(-s, s * 0.2);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    if (!compact) label(g, 'TÊTE DE CORTÈGE', SP.x, SP.y + 15, '#ffe27a', 9.5, 700);
  }
}

// ───────────────────────────── fermetures, métro ─────────────────────────────

function drawClosures(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions): void {
  const closures = scene.closures;
  for (let i = 0; i < closures.length; i++) {
    const c = closures[i]!;
    if (!t.contains(c.x, c.z, 260)) continue;
    const focus = c.id === o.focusClosure;
    if (o.edge && !o.compact) {
      const e = o.edge(c.edgeId);
      if (e && e.points && e.points.length >= 4) {
        g.lineCap = 'butt';
        polyline(g, t, e.points);
        g.lineWidth = Math.max(3, e.width / t.mpp);
        g.strokeStyle = focus ? 'rgba(255,59,48,.42)' : 'rgba(255,59,48,.24)';
        g.stroke();
        g.lineWidth = 1.6;
        g.setLineDash([5, 5]);
        g.strokeStyle = 'rgba(255,99,88,.95)';
        g.stroke();
        g.setLineDash([]);
      }
    }
    // barrière rouge et blanche en travers de la rue
    t.worldToScreen(c.x, c.z, SP);
    const a = t.headingToScreenAngle(c.heading);
    g.save();
    g.translate(SP.x, SP.y);
    g.rotate(a);
    const w = o.compact ? 9 : 16;
    const h = o.compact ? 3 : 5;
    g.fillStyle = HALO;
    g.fillRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3);
    const n = 4;
    for (let k = 0; k < n; k++) {
      g.fillStyle = k % 2 === 0 ? '#ff3b30' : '#ffffff';
      g.fillRect(-w / 2 + (w * k) / n, -h / 2, w / n, h);
    }
    if (focus) {
      g.strokeStyle = '#ffd60a';
      g.lineWidth = 2;
      g.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    }
    g.restore();
  }
}

function drawMetro(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions): void {
  const stations = scene.stations;
  const r = o.compact ? 5 : 8.5;
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i]!;
    if (!t.contains(s.x, s.z, 20)) continue;
    t.worldToScreen(s.x, s.z, SP);
    g.beginPath();
    g.arc(SP.x, SP.y, r, 0, Math.PI * 2);
    g.fillStyle = s.open ? '#f4f7fd' : '#5b1512';
    g.fill();
    g.lineWidth = s.filtered ? 2.6 : 1.6;
    g.strokeStyle = s.filtered ? '#ffd60a' : s.open ? '#1f3f8f' : '#ff3b30';
    g.stroke();
    g.font = `800 ${o.compact ? 7 : 11}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = s.open ? '#17337c' : '#ffb3ad';
    g.fillText('M', SP.x, SP.y + 0.5);
    if (!s.open) {
      g.strokeStyle = '#ff3b30';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(SP.x - r * 0.75, SP.y + r * 0.75);
      g.lineTo(SP.x + r * 0.75, SP.y - r * 0.75);
      g.stroke();
    }
    if (s.id === o.focusStation) {
      g.strokeStyle = '#ffd60a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(SP.x, SP.y, r + 5, 0, Math.PI * 2);
      g.stroke();
    }
    if (!o.compact && (t.mpp < 1.7 || s.id === o.focusStation)) {
      label(g, s.name, SP.x, SP.y + r + 9, s.open ? '#c9d6f2' : '#ff9f97', 9.5, 600);
    }
  }
}

// ───────────────────────────── incidents, secours, objectifs ─────────────────────────────

/** Pictogramme d'incident dans un disque de rayon r centré sur l'origine. */
export function drawIncidentGlyph(g: CanvasRenderingContext2D, glyph: IncidentGlyph, r: number, ink: string): void {
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1.4, r * 0.2);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const k = r * 0.6;
  g.beginPath();
  switch (glyph) {
    case 'feu':
      g.moveTo(0, -k * 1.15);
      g.bezierCurveTo(k * 1.1, -k * 0.1, k * 0.85, k, 0, k);
      g.bezierCurveTo(-k * 0.85, k, -k * 0.9, k * 0.1, -k * 0.25, -k * 0.3);
      g.bezierCurveTo(-k * 0.1, k * 0.1, k * 0.15, -k * 0.3, 0, -k * 1.15);
      g.fill();
      break;
    case 'blesse':
      g.rect(-k * 0.3, -k, k * 0.6, k * 2);
      g.rect(-k, -k * 0.3, k * 2, k * 0.6);
      g.fill();
      break;
    case 'agent':
      g.moveTo(0, -k);
      g.lineTo(k * 0.9, -k * 0.6);
      g.lineTo(k * 0.9, k * 0.1);
      g.quadraticCurveTo(k * 0.8, k * 0.8, 0, k * 1.1);
      g.quadraticCurveTo(-k * 0.8, k * 0.8, -k * 0.9, k * 0.1);
      g.lineTo(-k * 0.9, -k * 0.6);
      g.closePath();
      g.stroke();
      break;
    case 'pillage':
      g.moveTo(-k * 0.9, -k * 0.3);
      g.lineTo(k * 0.9, -k * 0.3);
      g.lineTo(k * 0.7, k);
      g.lineTo(-k * 0.7, k);
      g.closePath();
      g.moveTo(-k * 0.4, -k * 0.3);
      g.quadraticCurveTo(0, -k * 1.4, k * 0.4, -k * 0.3);
      g.stroke();
      break;
    case 'barricade':
      g.moveTo(-k, -k * 0.35);
      g.lineTo(k, -k * 0.35);
      g.moveTo(-k, k * 0.35);
      g.lineTo(k, k * 0.35);
      g.moveTo(-k * 0.5, -k);
      g.lineTo(-k * 0.5, k);
      g.moveTo(k * 0.5, -k);
      g.lineTo(k * 0.5, k);
      g.stroke();
      break;
    case 'voiture':
      g.moveTo(-k, k * 0.35);
      g.lineTo(-k, -k * 0.1);
      g.lineTo(-k * 0.55, -k * 0.75);
      g.lineTo(k * 0.55, -k * 0.75);
      g.lineTo(k, -k * 0.1);
      g.lineTo(k, k * 0.35);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(-k * 0.55, k * 0.6, k * 0.24, 0, Math.PI * 2);
      g.arc(k * 0.55, k * 0.6, k * 0.24, 0, Math.PI * 2);
      g.fill();
      break;
    case 'secours':
      g.rect(-k * 0.22, -k * 0.9, k * 0.44, k * 1.8);
      g.rect(-k * 0.9, -k * 0.22, k * 1.8, k * 0.44);
      g.fill();
      g.beginPath();
      g.arc(0, 0, k * 1.15, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'suspect':
      g.arc(0, -k * 0.45, k * 0.42, 0, Math.PI * 2);
      g.moveTo(-k * 0.85, k);
      g.quadraticCurveTo(-k * 0.8, k * 0.1, 0, k * 0.1);
      g.quadraticCurveTo(k * 0.8, k * 0.1, k * 0.85, k);
      g.stroke();
      break;
  }
}

/** Rayon du marqueur d'incident (px). */
export const INCIDENT_RADIUS = 11;

function drawIncident(g: CanvasRenderingContext2D, inc: Incident, x: number, y: number, o: OverlayOptions, focus: boolean): void {
  const color = INCIDENT_COLORS[inc.urgency] ?? INCIDENT_COLORS[1];
  if (o.compact) {
    const r = focus ? 5.5 : 4;
    if (inc.urgency === 3 || focus) {
      const k = (o.time * 1.2) % 1;
      g.strokeStyle = color;
      g.globalAlpha = 1 - k;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, r + k * 8, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.fillStyle = color;
    g.strokeStyle = HALO;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    return;
  }
  const r = INCIDENT_RADIUS;
  if (inc.urgency === 3 && inc.state === 'ouvert') {
    const k = (o.time * 1.1) % 1;
    g.strokeStyle = color;
    g.globalAlpha = 0.9 * (1 - k);
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, r + 2 + k * 12, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = '#111a2e';
  g.fill();
  g.lineWidth = 2.4;
  g.strokeStyle = color;
  g.stroke();
  g.save();
  g.translate(x, y);
  drawIncidentGlyph(g, INCIDENT_GLYPHS[inc.kind] ?? 'suspect', r, color);
  g.restore();
  // pris en charge : arc d'avancement bleu autour du marqueur
  if (inc.state === 'assigne' || inc.state === 'en_cours') {
    g.strokeStyle = '#58a6ff';
    g.lineWidth = 2.6;
    g.beginPath();
    const p = inc.state === 'en_cours' ? Math.max(0.06, Math.min(1, inc.progress)) : 0.06;
    g.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    g.stroke();
    g.setLineDash([2, 4]);
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(x, y, r + 4, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  if (focus) {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(x, y, r + 8, 0, Math.PI * 2);
    g.stroke();
  }
}

function drawIncidents(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions): void {
  const list = scene.incidents;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < list.length; i++) {
      const inc = list[i]!;
      const focus = inc.id === o.focusIncident;
      if ((pass === 1) !== focus) continue;
      if (!t.contains(inc.x, inc.z, 30)) continue;
      t.worldToScreen(inc.x, inc.z, SP);
      drawIncident(g, inc, SP.x, SP.y, o, focus);
    }
  }
}

function etaText(c: RescueCall): string {
  if (c.state === 'sur_place') return 'sur place';
  if (c.state === 'en_attente') return 'en attente';
  const s = Math.max(0, Math.round(c.eta));
  return `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
}

function drawCalls(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions): void {
  const calls = scene.calls;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i]!;
    if (!t.contains(c.x, c.z, 30)) continue;
    t.worldToScreen(c.x, c.z, SP);
    const color = c.kind === 'pompiers' ? '#ff6259' : '#f4f7fd';
    const r = o.compact ? 6 : 13;
    g.setLineDash([4, 4]);
    g.lineWidth = 1.8;
    g.strokeStyle = color;
    g.beginPath();
    g.arc(SP.x, SP.y, r + ((o.time * 6) % 4), 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    if (!o.compact) {
      label(g, `${c.kind === 'pompiers' ? 'POMPIERS' : 'SAMU'} · ${etaText(c)}`, SP.x, SP.y - r - 11, color, 9.5, 700);
    }
  }
}

function drawObjectives(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions): void {
  const list = scene.objectives;
  for (let i = 0; i < list.length; i++) {
    const ob = list[i]!;
    if (ob.x === undefined || ob.z === undefined || !t.contains(ob.x, ob.z, 20)) continue;
    t.worldToScreen(ob.x, ob.z, SP);
    const tracked = ob.id === scene.trackedObjective;
    const r = o.compact ? 5 : 8;
    g.beginPath();
    g.moveTo(SP.x, SP.y - r);
    g.lineTo(SP.x + r, SP.y);
    g.lineTo(SP.x, SP.y + r);
    g.lineTo(SP.x - r, SP.y);
    g.closePath();
    g.fillStyle = ob.secondary ? '#9fb0cf' : '#34c759';
    g.fill();
    g.lineWidth = tracked ? 2.4 : 1.5;
    g.strokeStyle = tracked ? '#ffffff' : HALO;
    g.stroke();
  }
}

// ───────────────────────────── GPS, joueur ─────────────────────────────

function drawGps(g: CanvasRenderingContext2D, t: MapTransform, o: OverlayOptions): void {
  const route = o.gpsRoute;
  if (route.length >= 4) {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    polyline(g, t, route);
    g.lineWidth = o.compact ? 5 : 6.5;
    g.strokeStyle = 'rgba(6,18,34,.85)';
    g.stroke();
    g.lineWidth = o.compact ? 2.6 : 3.2;
    g.strokeStyle = '#3ddcff';
    g.stroke();
  }
  const target = o.gpsTarget;
  if (target && t.contains(target.x, target.z, 20)) {
    t.worldToScreen(target.x, target.z, SP);
    const s = o.compact ? 0.7 : 1;
    // épingle
    g.fillStyle = '#3ddcff';
    g.strokeStyle = HALO;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(SP.x, SP.y);
    g.bezierCurveTo(SP.x - 9 * s, SP.y - 10 * s, SP.x - 8 * s, SP.y - 21 * s, SP.x, SP.y - 21 * s);
    g.bezierCurveTo(SP.x + 8 * s, SP.y - 21 * s, SP.x + 9 * s, SP.y - 10 * s, SP.x, SP.y);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#062033';
    g.beginPath();
    g.arc(SP.x, SP.y - 14 * s, 3 * s, 0, Math.PI * 2);
    g.fill();
  }
}

function drawPlayer(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene): void {
  if (!scene.hasPlayer || !t.contains(scene.px, scene.pz, 20)) return;
  t.worldToScreen(scene.px, scene.pz, SP);
  // cône de regard
  const look = t.headingToScreenAngle(scene.pYaw) - Math.PI / 2;
  const grad = g.createRadialGradient(SP.x, SP.y, 4, SP.x, SP.y, 46);
  grad.addColorStop(0, 'rgba(255,255,255,.34)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(SP.x, SP.y);
  g.arc(SP.x, SP.y, 46, look - 0.5, look + 0.5);
  g.closePath();
  g.fill();
  // flèche du joueur (cap du corps)
  g.save();
  g.translate(SP.x, SP.y);
  g.rotate(t.headingToScreenAngle(scene.pHeading));
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1f66e0';
  g.lineWidth = 2.2;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(6.5, 7);
  g.lineTo(0, 3.5);
  g.lineTo(-6.5, 7);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

/** Dessine toutes les couches demandées, dans l'ordre de superposition. */
export function drawOverlay(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions): void {
  const L = o.layers;
  const vis = scene.vis;
  if (L.crowd) drawCrowd(g, t, scene);
  if (L.route && vis.route) drawRoute(g, t, scene, o.compact);
  if (L.hazards) drawHazards(g, t, scene, o.time, o.compact);
  if (L.closures && vis.closures) drawClosures(g, t, scene, o);
  if (L.metro && vis.metro) drawMetro(g, t, scene, o);
  if (L.gps) drawGps(g, t, o);
  if (L.orders && vis.police) drawOrders(g, t, scene, o);
  if (L.objectives) drawObjectives(g, t, scene, o);
  if (L.rescue && vis.rescue) drawCalls(g, t, scene, o);
  if (L.units) drawUnits(g, t, scene, o);
  if (L.incidents) drawIncidents(g, t, scene, o);
  if (L.player) drawPlayer(g, t, scene);
}
