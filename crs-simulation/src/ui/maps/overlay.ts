/* =====================================================================================
 * Couches dessinées par-dessus le fond de plan : foule (densité teintée par la tension, foyers secondaires), gaz et
 * feux, parcours et tête de cortège, fermetures de rues, métro, incidents, secours attendus,
 * objectifs, itinéraire GPS, joueur. Les unités et les ordres sont dans overlay-units.ts.
 * ===================================================================================== */

import type { RoadEdgeInfo } from '@/core/contracts';
import type { Incident, IncidentKind, RescueCall } from '@/core/extensions';
import type { GpsTarget } from './api';
import { BARRAGE_COLORS, barrageLook, exitName, exitOpen } from './barrages';
import type { SceneBarrage } from './barrages';
import { drawOrders, drawUnits } from './overlay-units';
import type { UnitLayerOptions } from './overlay-units';
import type { MapScene } from './scene';
import type { MapTransform, ScreenPoint } from './transform';

export interface LayerMask {
  crowd: boolean;
  hazards: boolean;
  route: boolean;
  closures: boolean;
  /** Barrages de rue tenus par la police, issues ouvertes autour des foules, nasses. */
  barrages: boolean;
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
  crowd: true, hazards: true, route: true, closures: true, barrages: true, metro: true, incidents: true, rescue: true,
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
  /**
   * Foule dont on montre les issues ouvertes même si aucune n'est encore tenue (clé de `scene.crowdExits`) : celle que
   * le joueur vise pour barrer, filtrer ou nasser. Les autres foules ne montrent leurs issues ouvertes que lorsqu'un
   * encerclement est en cours (au moins une issue tenue, ou nasse détectée) — sinon la carte se couvre de flèches.
   */
  focusCrowd?: string;
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

// ───────────────────────────── manifestations simultanées ─────────────────────────────

/** Teinte de chaque manifestation supplémentaire (la principale garde le jaune). */
export const MANIF_COLORS: readonly string[] = ['#5ac8fa', '#ff6bd6', '#7ee081', '#c39bff'];

export function manifColor(id: number): string {
  return MANIF_COLORS[(Math.max(2, id) - 2) % MANIF_COLORS.length]!;
}

const MANIF_PHASES: Readonly<Record<string, string>> = {
  rassemblement: 'RASSEMBLEMENT', depart: 'DÉPART', cortege: 'CORTÈGE', dispersion: 'DISPERSION', terminee: 'TERMINÉE',
};

/** Libellé court de la phase d'une manifestation (carte, liste). */
export function manifPhaseLabel(phase: string, enclosed = false, kettled = false): string {
  if (kettled) return 'ENCERCLÉE';
  if (enclosed) return 'BLOQUÉE';
  return MANIF_PHASES[phase] ?? phase.toUpperCase();
}

function drawManifs(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, compact: boolean): void {
  const list = scene.manifs;
  for (let i = 0; i < list.length; i++) {
    const m = list[i]!;
    const color = manifColor(m.id);
    if (m.route.length >= 4) {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      polyline(g, t, m.route);
      g.lineWidth = compact ? 4 : 8;
      g.globalAlpha = 0.18;
      g.strokeStyle = color;
      g.stroke();
      g.globalAlpha = 0.9;
      g.lineWidth = compact ? 1.2 : 1.7;
      g.setLineDash(compact ? [5, 5] : [9, 7]);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
    if (!t.contains(m.headX, m.headZ, 40)) continue;
    t.worldToScreen(m.headX, m.headZ, SP);
    const a = t.headingToScreenAngle(m.headHeading);
    g.save();
    g.translate(SP.x, SP.y);
    g.rotate(a);
    const s = compact ? 5 : 8;
    g.fillStyle = color;
    g.strokeStyle = m.kettled ? '#58a6ff' : HALO;
    g.lineWidth = m.kettled ? 2.5 : 1.5;
    g.beginPath();
    g.moveTo(0, -s * 1.5);
    g.lineTo(s, s * 0.2);
    g.lineTo(0, -s * 0.25);
    g.lineTo(-s, s * 0.2);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    if (!compact) {
      label(g, `${m.causeLabel.toUpperCase()} · ${m.people} pers. · ${manifPhaseLabel(m.phase, m.enclosed, m.kettled)}`, SP.x, SP.y - 16, color, 9.5, 700);
      label(g, m.detours > 0 ? `→ ${m.to} (${m.detours} détour${m.detours > 1 ? 's' : ''})` : `→ ${m.to}`, SP.x, SP.y + 15, '#e8eef9', 9, 600);
    }
  }
}

// ───────────────────────────── fermetures, métro ─────────────────────────────

/** Distance (m) en deçà de laquelle la fermeture d'une rue et le barrage de l'unité qui la tient sont la même chose. */
const SAME_BARRAGE = 40;

/** Fermeture de circulation tenue par un barrage déjà dessiné (même unité, ou même rue tout près) ? */
export function closureCoveredByBarrage(
  c: { x: number; z: number; squadId: number; edgeId: number }, barrages: readonly { x: number; z: number; squadId: number; edgeId: number; state: string }[],
): boolean {
  for (let i = 0; i < barrages.length; i++) {
    const b = barrages[i]!;
    if (b.state === 'rompu') continue;
    const near = Math.hypot(b.x - c.x, b.z - c.z) < SAME_BARRAGE;
    if (near && ((c.squadId > 0 && b.squadId === c.squadId) || (c.edgeId >= 0 && b.edgeId === c.edgeId))) return true;
  }
  return false;
}

function drawClosures(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions, withBarrages: boolean): void {
  const closures = scene.closures;
  for (let i = 0; i < closures.length; i++) {
    const c = closures[i]!;
    if (!t.contains(c.x, c.z, 260)) continue;
    const focus = c.id === o.focusClosure;
    // fermeture créée par le barrage d'une unité : le barrage la montre déjà (barre à la largeur de la rue, indicatif) ;
    // on garde le tracé de la rue fermée, pas une seconde barrière au même endroit
    const covered = withBarrages && closureCoveredByBarrage(c, scene.barrages);
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
    if (covered && !focus) continue;
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

// ───────────────────────────── barrages, issues ─────────────────────────────

/** Largeur minimale d'un barrage à l'écran (px) : lisible même vue de loin ; épaisseur du trait (px). */
const BARRAGE_MIN_PX = 16;

/** Hachures obliques sur un rectangle local [x0, x1] × [−h/2, h/2] (repère déjà tourné). */
function hatch(g: CanvasRenderingContext2D, x0: number, x1: number, h: number, color: string): void {
  if (x1 - x0 < 1) return;
  g.save();
  g.beginPath();
  g.rect(x0, -h / 2, x1 - x0, h);
  g.clip();
  g.fillStyle = 'rgba(11,19,34,.7)';
  g.fillRect(x0, -h / 2, x1 - x0, h);
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  for (let x = x0 - h; x < x1 + h; x += 4) {
    g.moveTo(x, h / 2);
    g.lineTo(x + h, -h / 2);
  }
  g.stroke();
  g.restore();
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.strokeRect(x0, -h / 2, x1 - x0, h);
}

function drawBarrage(g: CanvasRenderingContext2D, t: MapTransform, b: SceneBarrage, o: OverlayOptions): void {
  const look = barrageLook(b);
  t.worldToScreen(b.x, b.z, SP);
  const cx = SP.x, cy = SP.y;
  // la barre suit le flanc droit de la formation (perpendiculaire à son cap), à la largeur réelle de la rue
  const w = Math.max(o.compact ? 8 : BARRAGE_MIN_PX, b.width / t.mpp);
  const h = o.compact ? 3 : Math.max(6, Math.min(12, 3 / t.mpp));
  const a = t.headingToScreenAngle(b.heading);
  g.save();
  g.translate(cx, cy);
  g.rotate(a);
  const x0 = -w / 2;
  const holdW = w * (1 - look.hatched);
  // liseré sombre : la barre reste lisible sur le fond de plan et sur la densité de foule
  g.fillStyle = HALO;
  g.fillRect(x0 - 1.5, -h / 2 - 1.5, w + 3, h + 3);
  if (look.dashed) {
    g.strokeStyle = look.color;
    g.lineWidth = h * 0.7;
    g.lineCap = 'butt';
    g.setLineDash([Math.max(3, h * 0.9), Math.max(3, h * 0.7)]);
    g.beginPath();
    g.moveTo(x0, 0);
    g.lineTo(x0 + w, 0);
    g.stroke();
    g.setLineDash([]);
  } else {
    g.fillStyle = look.color;
    g.fillRect(x0, -h / 2, holdW, h);
    if (look.hatched > 0) hatch(g, x0 + holdW, x0 + w, h, look.color);
  }
  if (look.gap) {
    // porte du barrage filtrant : une trouée au milieu
    const gw = Math.max(4, Math.min(w * 0.3, 2.5 / t.mpp));
    g.fillStyle = HALO;
    g.fillRect(-gw / 2, -h / 2 - 1.5, gw, h + 3);
  }
  // côté face : petites dents vers la foule (sens du cap)
  if (!o.compact && !look.dashed) {
    g.fillStyle = look.color;
    for (let k = 1; k <= 3; k++) {
      const x = x0 + (w * k) / 4;
      g.beginPath();
      g.moveTo(x - 3, -h / 2);
      g.lineTo(x, -h / 2 - 4);
      g.lineTo(x + 3, -h / 2);
      g.fill();
    }
  }
  g.restore();
  if (o.compact) return;
  // indicatif derrière la barre (côté opposé à la foule), le mot d'état dessous
  const back = a + Math.PI / 2;
  const off = h / 2 + 11;
  const lx = cx + Math.cos(back) * off;
  const ly = cy + Math.sin(back) * off;
  if (b.callsign !== '') label(g, b.callsign, lx, ly, look.color === BARRAGE_COLORS.rompu ? '#c9d1df' : '#ffffff', 11, 800);
  if (look.tag !== '' && t.mpp < 3) label(g, look.tag, lx, ly + (b.callsign !== '' ? 12 : 0), look.color, 9.5, 700);
}

function drawBarrages(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions): void {
  const list = scene.barrages;
  for (let i = 0; i < list.length; i++) {
    const b = list[i]!;
    if (!t.contains(b.x, b.z, Math.max(30, b.width))) continue;
    drawBarrage(g, t, b, o);
  }
}

/**
 * Issues autour des foules : une issue OUVERTE est une flèche blanche qui sort par une trouée, avec le nom de la rue ;
 * une nasse fermée est cerclée de rouge. Les issues tenues sont les barrages eux-mêmes (dessinés par-dessus).
 */
/** Rues déjà nommées pour la foule en cours de dessin. */
const NAMED: string[] = [];

/** La rue porte un vrai nom (pas « passage piéton », « voie sans nom »…) : elle mérite une étiquette. */
function namedStreet(street: string): boolean {
  const s = street.trim().toLowerCase();
  return s !== '' && s !== 'passage piéton' && s !== 'voie sans nom' && s !== 'voie piétonne';
}

/** Une issue au moins est tenue, fermée ou filtrée : un encerclement est en cours autour de cette foule. */
function anyHeld(exits: readonly { held: boolean; mode: string }[]): boolean {
  for (let i = 0; i < exits.length; i++) if (!exitOpen(exits[i]!)) return true;
  return false;
}

function drawExits(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions): void {
  const list = scene.crowdExits;
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (c.closed && t.contains(c.x, c.z, c.radius + 40)) {
      t.worldToScreen(c.x, c.z, SP);
      g.strokeStyle = BARRAGE_COLORS.ferme;
      g.lineWidth = o.compact ? 1.5 : 2.5;
      g.setLineDash(o.compact ? [] : [10, 5]);
      g.beginPath();
      g.arc(SP.x, SP.y, Math.max(o.compact ? 6 : 14, c.radius / t.mpp), 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    // issues ouvertes : seulement là où elles servent (foule visée, ou encerclement commencé)
    if (c.kettleId === 0 && c.key !== o.focusCrowd && !anyHeld(c.exits)) continue;
    NAMED.length = 0;
    for (let k = 0; k < c.exits.length; k++) {
      const e = c.exits[k]!;
      if (!exitOpen(e) || !t.contains(e.x, e.z, 30)) continue;
      t.worldToScreen(e.x, e.z, SP);
      const ex = SP.x, ey = SP.y;
      t.worldToScreen(c.x, c.z, SP);
      // vers l'extérieur : du centre de la foule vers l'issue
      let a = Math.atan2(ey - SP.y, ex - SP.x);
      if (!Number.isFinite(a)) a = 0;
      const s = o.compact ? 0.55 : 1;
      const gap = Math.max(10 * s, Math.min(60, e.width / t.mpp));
      g.save();
      g.translate(ex, ey);
      g.rotate(a);
      // bords de la trouée (perpendiculaires à la sortie)
      g.strokeStyle = HALO;
      g.lineWidth = 4 * s;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, -gap / 2 - 5 * s);
      g.lineTo(0, -gap / 2);
      g.moveTo(0, gap / 2);
      g.lineTo(0, gap / 2 + 5 * s);
      g.stroke();
      g.strokeStyle = BARRAGE_COLORS.issue;
      g.lineWidth = 2 * s;
      g.stroke();
      // flèche qui passe par la trouée
      g.fillStyle = BARRAGE_COLORS.issue;
      g.strokeStyle = HALO;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-9 * s, -2.5 * s);
      g.lineTo(5 * s, -2.5 * s);
      g.lineTo(5 * s, -7 * s);
      g.lineTo(14 * s, 0);
      g.lineTo(5 * s, 7 * s);
      g.lineTo(5 * s, 2.5 * s);
      g.lineTo(-9 * s, 2.5 * s);
      g.closePath();
      g.stroke();
      g.fill();
      g.restore();
      // nom de la rue : une seule fois par rue ; une trouée hors voie (passage piéton, esplanade) n'a que sa flèche
      if (!o.compact && t.mpp < 3.2 && namedStreet(e.street) && NAMED.indexOf(e.street) < 0) {
        NAMED.push(e.street);
        label(g, exitName(e), ex + Math.cos(a) * 26, ey + Math.sin(a) * 26, '#ffffff', 10, 700);
      }
    }
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

// ───────────────────────────── foyers secondaires ─────────────────────────────

/** Rayon écran (px) du marqueur d'un foyer : croît avec l'effectif. */
export function foyerRadius(people: number, compact: boolean): number {
  const r = 9 + Math.sqrt(Math.max(1, people)) * 1.3;
  return compact ? Math.min(9, r * 0.5) : Math.min(26, r);
}

const FOYER_KIND_LABEL: Readonly<Record<string, string>> = {
  rassemblement: 'RASSEMBLEMENT', casseurs: 'CASSEURS', blocage: 'BLOCAGE',
};

/** Couleur d'un foyer selon sa tension : jaune (calme), orange, rouge (débordements). */
function foyerColor(tension: number): string {
  return tension < 0.35 ? '#ffd60a' : tension < 0.65 ? '#ff9500' : '#ff3b30';
}

function drawFoyers(g: CanvasRenderingContext2D, t: MapTransform, scene: MapScene, o: OverlayOptions): void {
  const list = scene.foyers;
  for (let i = 0; i < list.length; i++) {
    const f = list[i]!;
    if (!t.contains(f.x, f.z, 60)) continue;
    t.worldToScreen(f.x, f.z, SP);
    const color = foyerColor(f.tension);
    const r = foyerRadius(f.people, o.compact);
    // halo pulsé : point chaud
    const k = (o.time * 0.8 + f.id * 0.37) % 1;
    g.strokeStyle = color;
    g.globalAlpha = 0.85 * (1 - k);
    g.lineWidth = o.compact ? 1.4 : 2;
    g.beginPath();
    g.arc(SP.x, SP.y, r + k * (o.compact ? 6 : 14), 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    // disque hachuré : la zone du foyer
    g.fillStyle = color;
    g.globalAlpha = 0.22;
    g.beginPath();
    g.arc(SP.x, SP.y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.setLineDash(f.kettled ? [] : [5, 3]);
    g.lineWidth = f.kettled ? 3 : 2;
    g.strokeStyle = f.kettled ? '#58a6ff' : color;
    g.stroke();
    g.setLineDash([]);
    // effectif au centre
    if (!o.compact) {
      label(g, String(f.people), SP.x, SP.y, '#ffffff', 11, 800);
      const kind = FOYER_KIND_LABEL[f.kind] ?? 'FOYER';
      label(g, `${kind} · ${f.people} pers.`, SP.x, SP.y - r - 10, color, 9.5, 700);
      if (f.name !== '') label(g, f.name, SP.x, SP.y + r + 10, '#e8eef9', 9, 600);
    }
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
  if (L.crowd) drawFoyers(g, t, scene, o);
  if (L.route && vis.route) drawRoute(g, t, scene, o.compact);
  if (L.route) drawManifs(g, t, scene, o.compact);
  if (L.hazards) drawHazards(g, t, scene, o.time, o.compact);
  if (L.closures && vis.closures) drawClosures(g, t, scene, o, L.barrages);
  if (L.barrages) drawExits(g, t, scene, o);
  if (L.barrages) drawBarrages(g, t, scene, o);
  if (L.metro && vis.metro) drawMetro(g, t, scene, o);
  if (L.gps) drawGps(g, t, o);
  if (L.orders && vis.police) drawOrders(g, t, scene, o);
  if (L.objectives) drawObjectives(g, t, scene, o);
  if (L.rescue && vis.rescue) drawCalls(g, t, scene, o);
  if (L.units) drawUnits(g, t, scene, o);
  if (L.incidents) drawIncidents(g, t, scene, o);
  if (L.player) drawPlayer(g, t, scene);
}
