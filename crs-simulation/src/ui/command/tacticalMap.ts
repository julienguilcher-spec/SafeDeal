/* =====================================================================================
 * Carte tactique — interaction avec la carte : sélection (toucher, cadre), ordres par geste (point,
 * segment de ligne de barrage, cercle de nasse, cible), fermeture de rues, appel des secours,
 * délégation d'un incident par glisser-déposer. Les mêmes règles valent pour la souris, le doigt et
 * le curseur de la manette (MapCanvas les traduit en gestes).
 * ===================================================================================== */

import type { OrderType, Prop, RoadSample, Squad } from '@/core/contracts';
import type { Incident, MetroStation, RescueKind, RoadClosure } from '@/core/extensions';
import type { PointerInfo } from '../maps/gestures';
import type { MapCanvas } from '../maps/mapCanvas';
import { INCIDENT_RADIUS } from '../maps/overlay';
import { createShown, drawBarrageLine, drawNasse, drawOrderArrow, drawTargetMark, visibleUnits } from '../maps/overlay-units';
import type { MapTransform } from '../maps/transform';
import type { MapUnit } from '../maps/units';
import type { CommandCore } from './core';
import { INCIDENT_KIND_LABELS, meansOfSymbol } from './incidents';
import { MIN_LINE, areaToOrder, lineToOrder, pointHeading, slotsAlongLine, splitLine, spreadPoint, verbOf } from './orders';
import type { OrderGeom, OrderVerb } from './orders';
import { radioFrame, rescueRequest } from './phrases';
import { IDLE } from './tacticalState';
import type { TacticalState } from './tacticalState';

interface Drag {
  kind: 'order' | 'box' | 'area' | 'incident';
  verb: OrderVerb | null;
  incidentId: number;
  /** Départ et position courante : monde et écran. */
  ax: number; az: number; bx: number; bz: number;
  sx0: number; sy0: number; sx: number; sy: number;
  /** Tracé au bouton secondaire : ligne directe sans passer par la palette. */
  quick: boolean;
}

export interface MapPick {
  unit: MapUnit | null;
  incident: Incident | null;
  station: MetroStation | null;
  closure: RoadClosure | null;
}

/** Espacement entre unités envoyées sur un même point (m). */
const POINT_SPACING = 10;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export class TacticalMap {
  drag: Drag | null = null;
  /** Dernière position du pointeur sur la carte (écran et monde), pour les aperçus. */
  hoverX = -1;
  hoverY = -1;
  hoverRoad: RoadSample | null = null;
  /** Demande d'ouverture du menu radial d'ordre rapide (écran) : lue par l'écran. */
  onQuickMenu: ((x: number, y: number) => void) | null = null;
  /** Élément de carte touché hors unité (station, fermeture) : l'écran ouvre la bulle correspondante. */
  onPickEntity: ((pick: MapPick, x: number, y: number) => void) | null = null;

  private readonly w = { x: 0, z: 0 };
  private readonly w2 = { x: 0, z: 0 };
  private readonly sp = { x: 0, y: 0 };
  private readonly geom: OrderGeom = { x: 0, z: 0, heading: 0, width: 0 };
  private readonly geoms: OrderGeom[] = [];
  private readonly road: RoadSample = {
    edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false,
  };
  private readonly props: Prop[] = [];
  private readonly shown = createShown();

  constructor(private readonly core: CommandCore, private readonly map: MapCanvas, private readonly state: TacticalState) {
    map.handlers = {
      onHover: (x, y) => this.hover(x, y),
      onTap: (x, y, info) => this.tap(x, y, info),
      onDoubleTap: (x, y) => this.doubleTap(x, y),
      onLongPress: (x, y) => this.longPress(x, y),
      onDragStart: (x, y, info) => this.dragStart(x, y, info),
      onDragMove: (x, y) => this.dragMove(x, y),
      onDragEnd: (x, y, _info, cancelled) => this.dragEnd(x, y, cancelled),
      drawExtras: (g, view) => this.drawExtras(g, view),
    };
  }

  // ───────────────────────────── désignation ─────────────────────────────

  /** Unité dessinée la plus proche du point (pixels), dans un rayon donné. */
  pickUnit(x: number, y: number, radius: number): MapUnit | null {
    const scene = this.core.maps.scene;
    const view = this.map.view;
    let best: MapUnit | null = null;
    let bestD = radius * radius;
    const shown = visibleUnits(scene, view.mpp, false, this.shown).units;
    for (let i = 0; i < shown.length; i++) {
      const u = shown[i]!;
      view.worldToScreen(u.x, u.z, this.sp);
      const dx = (this.sp.x - x) * 0.75;
      const dy = this.sp.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  pick(x: number, y: number, touch: boolean): MapPick {
    const scene = this.core.maps.scene;
    const view = this.map.view;
    const r = touch ? 26 : 18;
    const out: MapPick = { unit: this.pickUnit(x, y, r), incident: null, station: null, closure: null };
    let bestD = (INCIDENT_RADIUS + (touch ? 14 : 7)) ** 2;
    for (let i = 0; i < scene.incidents.length; i++) {
      const inc = scene.incidents[i]!;
      view.worldToScreen(inc.x, inc.z, this.sp);
      const d = (this.sp.x - x) ** 2 + (this.sp.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        out.incident = inc;
      }
    }
    bestD = (touch ? 22 : 14) ** 2;
    for (let i = 0; i < scene.stations.length; i++) {
      const s = scene.stations[i]!;
      view.worldToScreen(s.x, s.z, this.sp);
      const d = (this.sp.x - x) ** 2 + (this.sp.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        out.station = s;
      }
    }
    bestD = (touch ? 22 : 14) ** 2;
    for (let i = 0; i < scene.closures.length; i++) {
      const c = scene.closures[i]!;
      view.worldToScreen(c.x, c.z, this.sp);
      const d = (this.sp.x - x) ** 2 + (this.sp.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        out.closure = c;
      }
    }
    return out;
  }

  /** Unités sélectionnées que le joueur peut commander (sans celles dont une unité supérieure est déjà retenue). */
  selectedUnits(): MapUnit[] {
    const model = this.core.maps.scene.unitModel;
    const out: MapUnit[] = [];
    this.state.selection.forEach((key) => {
      const u = model.get(key);
      if (!u || u.squadId === 0 || !this.core.canCommand(u.squadId)) return;
      let parent = u.parentKey !== 0 ? model.get(u.parentKey) : undefined;
      for (let guard = 0; parent && guard < 8; guard++) {
        if (this.state.selection.has(parent.key)) return;
        parent = parent.parentKey !== 0 ? model.get(parent.parentKey) : undefined;
      }
      out.push(u);
    });
    out.sort((a, b) => a.key - b.key);
    return out;
  }

  private squadsOf(units: readonly MapUnit[]): Squad[] {
    const out: Squad[] = [];
    for (let i = 0; i < units.length; i++) {
      const s = this.core.ctx.squads.get(units[i]!.squadId);
      if (s) out.push(s);
    }
    return out;
  }

  private centroid(units: readonly MapUnit[], out: { x: number; z: number }): void {
    let x = 0, z = 0;
    for (let i = 0; i < units.length; i++) {
      x += units[i]!.x;
      z += units[i]!.z;
    }
    const n = Math.max(1, units.length);
    out.x = x / n;
    out.z = z / n;
  }

  // ───────────────────────────── ordres ─────────────────────────────

  private report(result: { ok: boolean; reason: string; count: number }, verb: OrderVerb): boolean {
    const ui = this.core.ctx.ui;
    if (!result.ok) {
      ui.notify(result.reason, 'warn', 5);
      this.core.ctx.audio.play('ui_alerte');
      return false;
    }
    ui.notify(result.count > 1 ? `${verb.label} — ${result.count} unités` : `${verb.label} — ordre transmis`, 'ok', 2.5);
    return true;
  }

  /** Ordre immédiat (sans geste) aux unités sélectionnées. */
  issueImmediate(verb: OrderVerb): boolean {
    const units = this.selectedUnits();
    if (units.length === 0) {
      this.core.ctx.ui.notify('Sélectionnez d’abord une unité sous vos ordres.', 'warn', 3);
      return false;
    }
    const squads = this.squadsOf(units);
    let target = 0;
    if (verb.type === 'embarquer' && squads.length === 1) target = squads[0]!.vehicleId;
    return this.report(this.core.issue(verb.type, squads, null, target), verb);
  }

  /** Ordre désignant un point ; `face` : cap imposé par un glissement (NaN = déduit du déplacement). */
  issuePoint(verb: OrderVerb, x: number, z: number, face: number, targetId = 0, targetName = ''): boolean {
    const units = this.selectedUnits();
    if (units.length === 0) {
      this.core.ctx.ui.notify('Sélectionnez d’abord une unité sous vos ordres.', 'warn', 3);
      return false;
    }
    this.centroid(units, this.w2);
    const heading = face === face ? face : pointHeading(verb.type, this.w2.x, this.w2.z, x, z);
    const spread = units.length > 1 && targetId === 0 && SPREAD_TYPES.has(verb.type);
    let ordered = units;
    if (spread) {
      this.geom.x = x;
      this.geom.z = z;
      this.geom.heading = heading;
      this.geom.width = 0;
      const idx = slotsAlongLine(this.geom, units);
      ordered = idx.map((i) => units[i]!);
      spreadPoint(x, z, heading, units.length, POINT_SPACING, this.geoms);
    } else {
      this.geoms.length = 1;
      this.geoms[0] = { x, z, heading, width: 0 };
    }
    return this.report(this.core.issue(verb.type, this.squadsOf(ordered), this.geoms, targetId, targetName), verb);
  }

  /** Ligne de barrage tracée de A (flanc gauche) vers B (flanc droit), partagée entre les unités sélectionnées. */
  issueLine(verb: OrderVerb, ax: number, az: number, bx: number, bz: number): boolean {
    const units = this.selectedUnits();
    if (units.length === 0) {
      this.core.ctx.ui.notify('Sélectionnez d’abord une unité sous vos ordres.', 'warn', 3);
      return false;
    }
    lineToOrder(ax, az, bx, bz, this.geom);
    if (this.geom.width < MIN_LINE) return this.issuePoint(verb, this.geom.x, this.geom.z, NaN);
    const idx = slotsAlongLine(this.geom, units);
    const ordered = idx.map((i) => units[i]!);
    const weights = ordered.map((u) => Math.max(1, u.valid));
    splitLine(this.geom, weights, this.geoms);
    return this.report(this.core.issue(verb.type, this.squadsOf(ordered), this.geoms), verb);
  }

  issueArea(verb: OrderVerb, cx: number, cz: number, px: number, pz: number): boolean {
    const units = this.selectedUnits();
    if (units.length === 0) {
      this.core.ctx.ui.notify('Sélectionnez d’abord une unité sous vos ordres.', 'warn', 3);
      return false;
    }
    if (Math.hypot(px - cx, pz - cz) < 2) {
      // simple toucher : rayon par défaut, issue à l'opposé des unités
      this.centroid(units, this.w2);
      const h = pointHeading('avancer', this.w2.x, this.w2.z, cx, cz);
      px = cx + Math.sin(h) * 18;
      pz = cz + Math.cos(h) * 18;
    }
    areaToOrder(cx, cz, px, pz, this.geom);
    this.geoms.length = 1;
    this.geoms[0] = { x: this.geom.x, z: this.geom.z, heading: this.geom.heading, width: this.geom.width };
    return this.report(this.core.issue(verb.type, this.squadsOf(units), this.geoms), verb);
  }

  /** Ordre désignant une cible : unité, incident, personne ou obstacle proche du point touché. */
  private issueTarget(verb: OrderVerb, x: number, y: number, touch: boolean): boolean {
    const ctx = this.core.ctx;
    const pick = this.pick(x, y, touch);
    this.map.worldAt(x, y, this.w);
    const wx = this.w.x, wz = this.w.z;
    const type = verb.type;
    if (type === 'proteger' || type === 'escorter' || type === 'suivre') {
      const u = pick.unit;
      if (u && !this.state.selection.has(u.key)) {
        return this.issuePoint(verb, u.x, u.z, NaN, u.vehicleId !== 0 ? u.vehicleId : u.leaderId, u.name);
      }
      if (type === 'proteger') return this.issuePoint(verb, wx, wz, NaN);
      ctx.ui.notify('Désignez une unité ou un véhicule sur la carte.', 'warn', 3);
      return false;
    }
    if (type === 'interpeller') {
      const inc = pick.incident;
      if (inc && inc.targetKind === 'person' && inc.targetId !== 0) {
        return this.issuePoint(verb, inc.x, inc.z, NaN, inc.targetId, inc.label);
      }
      const p = ctx.people.nearest(wx, wz, 14, (q) => q.faction === 'protest' && q.custody === 'free' && ctx.law.canArrest(q));
      if (p) return this.issuePoint(verb, p.x, p.z, NaN, p.id, 'l’auteur désigné');
      const st = ctx.player.state;
      const aimed = st.aimedPersonId !== 0 ? ctx.people.get(st.aimedPersonId) : undefined;
      if (aimed && Math.hypot(aimed.x - wx, aimed.z - wz) < 25) return this.issuePoint(verb, aimed.x, aimed.z, NaN, aimed.id, 'la cible désignée');
      ctx.ui.notify('Aucun auteur identifié ici : interpellation sur le secteur, sur fait constaté.', 'info', 4);
      return this.issuePoint(verb, wx, wz, NaN);
    }
    if (type === 'degager_barricade') {
      const inc = pick.incident;
      if (inc && (inc.kind === 'barricade' || inc.kind === 'feu_barricade')) {
        return this.issuePoint(verb, inc.x, inc.z, NaN, inc.targetKind === 'prop' ? inc.targetId : 0, inc.label);
      }
      const n = ctx.props.queryRadius(wx, wz, 16, this.props, (p) => p.kind === 'barricade');
      if (n > 0) {
        const p = this.props[0]!;
        return this.issuePoint(verb, p.x, p.z, NaN, p.id, 'la barricade');
      }
      return this.issuePoint(verb, wx, wz, NaN);
    }
    return this.issuePoint(verb, wx, wz, NaN);
  }

  // ───────────────────────────── gestes ─────────────────────────────

  private hover(x: number, y: number): void {
    const st = this.state;
    this.hoverX = x;
    this.hoverY = y;
    const mode = st.mode;
    let key = 0;
    if (mode.kind === 'idle' || (mode.kind === 'order' && mode.verb.gesture === 'target')) {
      const u = this.pickUnit(x, y, 18);
      key = u ? u.key : 0;
    }
    if (key !== st.hoverKey) {
      st.hoverKey = key;
      this.map.invalidate();
    }
    if (mode.kind === 'close_road') {
      this.map.worldAt(x, y, this.w);
      const ok = this.core.ctx.world.nearestRoad(this.w.x, this.w.z, this.road, 40);
      this.hoverRoad = ok ? this.road : null;
      this.map.invalidate();
    } else if (mode.kind !== 'idle') this.map.invalidate();
  }

  private tap(x: number, y: number, info: PointerInfo): void {
    const st = this.state;
    const mode = st.mode;
    const touch = info.kind !== 'mouse';
    this.map.worldAt(x, y, this.w);
    const wx = this.w.x, wz = this.w.z;
    if (mode.kind === 'order') {
      if (info.button === 2) {
        st.setMode(IDLE);
        return;
      }
      const verb = mode.verb;
      let ok = false;
      if (verb.gesture === 'target') ok = this.issueTarget(verb, x, y, touch);
      else if (verb.gesture === 'area') ok = this.issueArea(verb, wx, wz, wx, wz);
      else ok = this.issuePoint(verb, wx, wz, NaN);
      if (ok) st.setMode(IDLE);
      return;
    }
    if (mode.kind === 'close_road') {
      if (info.button === 2) st.setMode(IDLE);
      else this.closeRoad(wx, wz);
      return;
    }
    if (mode.kind === 'close_area') {
      if (info.button === 2) st.setMode(IDLE);
      else this.closeArea(wx, wz, 100);
      return;
    }
    if (mode.kind === 'rescue') {
      if (info.button !== 2) this.callRescue(mode.rescue, wx, wz, mode.incidentId);
      st.setMode(IDLE);
      return;
    }
    // mode libre
    if (info.button === 2) {
      // clic droit : « avancer » immédiat pour la sélection
      if (this.selectedUnits().length > 0) this.issuePoint(verbOf('avancer')!, wx, wz, NaN);
      return;
    }
    const pick = this.pick(x, y, touch);
    if (pick.unit) {
      st.select(pick.unit.key, info.shift || info.ctrl || st.multi);
      return;
    }
    if (pick.incident) {
      st.focusIncident = pick.incident.id;
      st.setTab('incidents');
      return;
    }
    if (pick.station || pick.closure) {
      st.focusStation = pick.station ? pick.station.id : 0;
      st.focusClosure = pick.station ? 0 : pick.closure!.id;
      st.touch();
      this.onPickEntity?.(pick, x, y);
      return;
    }
    if (st.focusStation !== 0 || st.focusClosure !== 0) {
      st.focusStation = 0;
      st.focusClosure = 0;
      st.touch();
      this.onPickEntity?.(pick, x, y);
      return;
    }
    if (!info.shift && !info.ctrl && !st.multi) st.clearSelection();
  }

  /** Double toucher sur une unité : sélectionne toute sa section (ses unités sœurs) et centre la vue. */
  private doubleTap(x: number, y: number): boolean {
    if (this.state.mode.kind !== 'idle') return true;
    const u = this.pickUnit(x, y, 22);
    if (!u) return false;
    const scene = this.core.maps.scene;
    if (u.parentKey !== 0) {
      const keys: number[] = [];
      for (let i = 0; i < scene.units.length; i++) if (scene.units[i]!.parentKey === u.parentKey) keys.push(scene.units[i]!.key);
      this.state.setSelection(keys);
    } else this.state.select(u.key, false);
    this.map.flyTo(u.x, u.z);
    return true;
  }

  private longPress(x: number, y: number): void {
    if (this.state.mode.kind !== 'idle') return;
    const u = this.pickUnit(x, y, 24);
    if (u && !this.state.selection.has(u.key)) {
      this.state.select(u.key, true);
      return;
    }
    if (this.selectedUnits().length > 0) this.onQuickMenu?.(x, y);
  }

  private dragStart(x: number, y: number, info: PointerInfo): 'pan' | 'capture' {
    const st = this.state;
    const mode = st.mode;
    this.map.worldAt(x, y, this.w);
    const base = { ax: this.w.x, az: this.w.z, bx: this.w.x, bz: this.w.z, sx0: x, sy0: y, sx: x, sy: y };
    if (info.button === 1) return 'pan';
    if (mode.kind === 'order' && info.button !== 2) {
      const g = mode.verb.gesture;
      if (g === 'immediate') return 'pan';
      this.drag = { kind: g === 'area' ? 'area' : 'order', verb: mode.verb, incidentId: 0, quick: false, ...base };
      return 'capture';
    }
    if (mode.kind === 'close_area' && info.button !== 2) {
      this.drag = { kind: 'area', verb: null, incidentId: 0, quick: false, ...base };
      return 'capture';
    }
    if (mode.kind !== 'idle') return 'pan';
    if (info.button === 2) {
      // glisser au bouton secondaire : ligne de barrage directe pour la sélection
      if (this.selectedUnits().length === 0) return 'pan';
      this.drag = { kind: 'order', verb: verbOf('ligne')!, incidentId: 0, quick: true, ...base };
      return 'capture';
    }
    if (st.tool === 'box' || info.shift) {
      this.drag = { kind: 'box', verb: null, incidentId: 0, quick: false, ...base };
      return 'capture';
    }
    if (this.core.scope().canDelegate && this.core.incidents) {
      const pick = this.pick(x, y, info.kind !== 'mouse');
      if (pick.incident && !pick.unit) {
        this.drag = { kind: 'incident', verb: null, incidentId: pick.incident.id, quick: false, ...base };
        st.focusIncident = pick.incident.id;
        st.touch();
        return 'capture';
      }
    }
    return 'pan';
  }

  private dragMove(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    this.map.worldAt(x, y, this.w);
    d.bx = this.w.x;
    d.bz = this.w.z;
    d.sx = x;
    d.sy = y;
    if (d.kind === 'incident') {
      const u = this.pickUnit(x, y, 30);
      const key = u && this.canReceive(u) ? u.key : 0;
      if (key !== this.state.dropKey) {
        this.state.dropKey = key;
        this.state.touch();
      }
    }
  }

  private dragEnd(x: number, y: number, cancelled: boolean): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const st = this.state;
    if (cancelled) {
      if (st.dropKey !== 0) {
        st.dropKey = 0;
        st.touch();
      }
      return;
    }
    this.map.worldAt(x, y, this.w);
    d.bx = this.w.x;
    d.bz = this.w.z;
    d.sx = x;
    d.sy = y;
    if (d.kind === 'box') {
      this.selectBox(d);
      return;
    }
    if (d.kind === 'incident') {
      const u = this.pickUnit(x, y, 30);
      st.dropKey = 0;
      st.touch();
      if (u && this.canReceive(u)) this.assignToUnit(d.incidentId, u);
      return;
    }
    if (d.kind === 'area') {
      if (d.verb) {
        if (this.issueArea(d.verb, d.ax, d.az, d.bx, d.bz)) st.setMode(IDLE);
      } else this.closeArea(d.ax, d.az, Math.max(30, Math.hypot(d.bx - d.ax, d.bz - d.az)));
      return;
    }
    const verb = d.verb;
    if (!verb) return;
    let ok = false;
    if (verb.gesture === 'line') ok = this.issueLine(verb, d.ax, d.az, d.bx, d.bz);
    else if (verb.gesture === 'target') ok = this.issueTarget(verb, d.sx0, d.sy0, false);
    else {
      // point + glissement : le glissement donne le cap à l'arrivée
      const face = Math.hypot(d.sx - d.sx0, d.sy - d.sy0) > 14 ? Math.atan2(d.bx - d.ax, d.bz - d.az) : NaN;
      ok = this.issuePoint(verb, d.ax, d.az, face);
    }
    if (ok && !d.quick) st.setMode(IDLE);
    else st.touch();
  }

  private selectBox(d: Drag): void {
    const scene = this.core.maps.scene;
    const view = this.map.view;
    const x0 = Math.min(d.sx0, d.sx), x1 = Math.max(d.sx0, d.sx);
    const y0 = Math.min(d.sy0, d.sy), y1 = Math.max(d.sy0, d.sy);
    const keys: number[] = [];
    const shown = visibleUnits(scene, view.mpp, false, this.shown).units;
    for (let i = 0; i < shown.length; i++) {
      const u = shown[i]!;
      view.worldToScreen(u.x, u.z, this.sp);
      if (this.sp.x >= x0 && this.sp.x <= x1 && this.sp.y >= y0 && this.sp.y <= y1) keys.push(u.key);
    }
    // on retient d'abord les unités que le joueur commande ; à défaut, tout ce qui est dans le cadre
    const own = keys.filter((k) => {
      const u = scene.unitModel.get(k);
      return u !== undefined && this.core.canCommand(u.squadId);
    });
    this.state.setSelection(own.length > 0 ? own : keys);
    if (this.state.tool === 'box') {
      this.state.tool = 'main';
      this.state.touch();
    }
  }

  // ───────────────────────────── circulation, secours, incidents ─────────────────────────────

  closeRoad(x: number, z: number): void {
    const core = this.core;
    const traffic = core.traffic;
    if (!traffic || !core.scope().canTraffic) return;
    const units = this.selectedUnits();
    const holder = units.length === 1 ? units[0]! : null;
    const c = traffic.closeRoad(x, z, core.ctx.player.state.personId, holder ? holder.squadId : 0);
    if (!c) {
      core.ctx.ui.notify('Aucune rue à fermer à cet endroit.', 'warn', 3);
      return;
    }
    const name = this.closureName(c);
    core.ctx.ui.notify(`Circulation coupée : ${name}${holder ? ` — barrage tenu par ${holder.name}` : ''}`, 'ok', 3.5);
    core.ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: 1, personId: core.ctx.player.state.personId,
      text: radioFrame('CENTRAL', core.callsign(), `Circulation coupée, ${name}${holder ? `, barrage tenu par ${holder.name}` : ''}`, false),
    });
    this.state.focusClosure = c.id;
    this.state.touch();
  }

  closeArea(x: number, z: number, radius: number): void {
    const core = this.core;
    const traffic = core.traffic;
    if (!traffic || !core.scope().canTraffic) return;
    const list = traffic.closeArea(x, z, radius, core.ctx.player.state.personId);
    const sector = core.ctx.world.sectorName(x, z);
    if (list.length === 0) core.ctx.ui.notify('Aucune rue n’entre dans ce périmètre.', 'warn', 3);
    else {
      core.ctx.ui.notify(`Périmètre fermé : ${list.length} accès coupés autour de ${sector || 'ce point'}`, 'ok', 3.5);
      core.ctx.radio.say({
        channel: 'commandement', from: core.callsign(), priority: 1, personId: core.ctx.player.state.personId,
        text: radioFrame('CENTRAL', core.callsign(), `Périmètre de circulation fermé${sector ? `, ${sector}` : ''}, rayon ${Math.round(radius)} mètres`, false),
      });
    }
    this.state.setMode(IDLE);
  }

  closureName(c: RoadClosure): string {
    const e = this.core.ctx.world.edge(c.edgeId);
    if (e && e.name) return e.name;
    return this.core.ctx.world.sectorName(c.x, c.z) || 'voie sans nom';
  }

  callRescue(kind: RescueKind, x: number, z: number, incidentId: number): void {
    const core = this.core;
    const rescue = core.rescue;
    if (!rescue || !core.scope().canDelegate) return;
    const ctx = core.ctx;
    const call = rescue.request(kind, x, z, ctx.player.state.personId, incidentId !== 0 ? incidentId : undefined);
    const eta = Math.max(0, Math.round(call.eta));
    const label = kind === 'pompiers' ? 'Pompiers' : 'SAMU';
    ctx.ui.notify(`${label} demandés — arrivée estimée dans ${Math.floor(eta / 60)} min ${eta % 60 < 10 ? '0' : ''}${eta % 60}`, 'ok', 4);
    ctx.radio.say({
      channel: 'secours', from: core.callsign(), priority: 2, personId: ctx.player.state.personId,
      text: rescueRequest(core.callsign(), ctx.world.sectorName(x, z), kind),
    });
    this.state.setTab('incidents');
  }

  /** L'unité peut-elle recevoir un incident de la part du joueur ? */
  canReceive(u: MapUnit): boolean {
    const sc = this.core.scope();
    if (!sc.canDelegate) return false;
    if (u.squadId === 0) return false;
    if (u.faction === 'rescue') return sc.level === 'tout';
    return this.core.canCommand(u.squadId);
  }

  /** Délègue un incident à une unité (glisser-déposer, bouton « Confier à la sélection »). */
  assignToUnit(incidentId: number, u: MapUnit): boolean {
    const core = this.core;
    const api = core.incidents;
    const inc = api?.get(incidentId);
    if (!api || !inc) return false;
    const means = meansOfSymbol(u.symbol);
    const ok = api.assign(incidentId, means, u.squadId);
    const ctx = core.ctx;
    if (!ok) {
      ctx.ui.notify(`${u.name} ne peut pas traiter « ${INCIDENT_KIND_LABELS[inc.kind] ?? inc.label} ».`, 'warn', 4);
      ctx.audio.play('ui_alerte');
      return false;
    }
    ctx.ui.notify(`${inc.label} — confié à ${u.name}`, 'ok', 3);
    ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: inc.urgency >= 3 ? 2 : 1, personId: ctx.player.state.personId,
      text: radioFrame(u.name, core.callsign(), `${inc.label}. Vous en êtes chargé, rendez compte`, true),
    });
    this.state.touch();
    return true;
  }

  // ───────────────────────────── aperçus ─────────────────────────────

  private text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string): void {
    g.font = `700 11px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 3.5;
    g.lineJoin = 'round';
    g.strokeStyle = '#0b1322';
    g.strokeText(s, x, y);
    g.fillStyle = color;
    g.fillText(s, x, y);
  }

  private drawExtras(g: CanvasRenderingContext2D, view: MapTransform): void {
    const st = this.state;
    const d = this.drag;
    const mode = st.mode;
    const units = mode.kind === 'order' || (d && d.kind === 'order') ? this.selectedUnits() : EMPTY_UNITS;
    if (d) {
      if (d.kind === 'box') {
        g.fillStyle = 'rgba(88,166,255,.14)';
        g.strokeStyle = '#9cc4ff';
        g.lineWidth = 1.5;
        g.setLineDash([5, 4]);
        g.fillRect(d.sx0, d.sy0, d.sx - d.sx0, d.sy - d.sy0);
        g.strokeRect(d.sx0, d.sy0, d.sx - d.sx0, d.sy - d.sy0);
        g.setLineDash([]);
      } else if (d.kind === 'incident') {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.setLineDash([6, 5]);
        g.beginPath();
        g.moveTo(d.sx0, d.sy0);
        g.lineTo(d.sx, d.sy);
        g.stroke();
        g.setLineDash([]);
      } else if (d.kind === 'area') {
        if (d.verb) {
          areaToOrder(d.ax, d.az, d.bx, d.bz, this.geom);
          drawNasse(g, view, this.geom.x, this.geom.z, this.geom.heading, this.geom.width, '#ffd60a', true);
          this.text(g, `Nasse · rayon ${Math.round(this.geom.width / 2)} m`, d.sx0, d.sy0, '#ffe680');
        } else {
          const r = Math.max(30, Math.hypot(d.bx - d.ax, d.bz - d.az));
          g.fillStyle = 'rgba(255,59,48,.12)';
          g.strokeStyle = '#ff6a5f';
          g.lineWidth = 2;
          g.setLineDash([7, 5]);
          g.beginPath();
          g.arc(d.sx0, d.sy0, r / view.mpp, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.setLineDash([]);
          this.text(g, `Périmètre · rayon ${Math.round(r)} m`, d.sx0, d.sy0, '#ffb3ad');
        }
      } else if (d.verb) {
        if (d.verb.gesture === 'line') {
          lineToOrder(d.ax, d.az, d.bx, d.bz, this.geom);
          if (this.geom.width >= MIN_LINE) {
            drawBarrageLine(g, view, this.geom.x, this.geom.z, this.geom.heading, this.geom.width, '#ffd60a', false, 3.5);
            view.worldToScreen(this.geom.x, this.geom.z, this.sp);
            this.text(g, `${Math.round(this.geom.width)} m`, this.sp.x, this.sp.y + 16, '#ffe680');
          }
        } else {
          for (let i = 0; i < units.length; i++) {
            view.worldToScreen(units[i]!.x, units[i]!.z, this.sp);
            drawOrderArrow(g, this.sp.x, this.sp.y, d.sx0, d.sy0, '#ffd60a', true);
          }
          drawTargetMark(g, d.sx0, d.sy0, '#ffd60a', 7);
          if (Math.hypot(d.sx - d.sx0, d.sy - d.sy0) > 14) drawOrderArrow(g, d.sx0, d.sy0, d.sx, d.sy, '#ffffff', false);
        }
      }
      return;
    }
    if (this.hoverX < 0) return;
    if (mode.kind === 'order' && mode.verb.gesture !== 'immediate') {
      for (let i = 0; i < units.length; i++) {
        view.worldToScreen(units[i]!.x, units[i]!.z, this.sp);
        drawOrderArrow(g, this.sp.x, this.sp.y, this.hoverX, this.hoverY, 'rgba(255,214,10,.75)', true);
      }
      drawTargetMark(g, this.hoverX, this.hoverY, '#ffd60a', 7);
    } else if (mode.kind === 'close_road' && this.hoverRoad) {
      const e = this.core.ctx.world.edge(this.hoverRoad.edgeId);
      if (e && e.points && e.points.length >= 4) {
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        for (let i = 0; i + 1 < e.points.length; i += 2) {
          view.worldToScreen(e.points[i]!, e.points[i + 1]!, this.sp);
          if (i === 0) g.moveTo(this.sp.x, this.sp.y);
          else g.lineTo(this.sp.x, this.sp.y);
        }
        g.lineWidth = Math.max(5, e.width / view.mpp + 2);
        g.strokeStyle = 'rgba(255,59,48,.45)';
        g.stroke();
      }
      view.worldToScreen(this.hoverRoad.x, this.hoverRoad.z, this.sp);
      drawTargetMark(g, this.sp.x, this.sp.y, '#ff6a5f', 7);
      this.text(g, this.hoverRoad.name || 'Voie sans nom', this.sp.x, this.sp.y - 20, '#ffb3ad');
    } else if (mode.kind === 'close_area') {
      g.strokeStyle = '#ff6a5f';
      g.lineWidth = 1.6;
      g.setLineDash([6, 5]);
      g.beginPath();
      g.arc(this.hoverX, this.hoverY, 100 / view.mpp, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    } else if (mode.kind === 'rescue') {
      drawTargetMark(g, this.hoverX, this.hoverY, mode.rescue === 'pompiers' ? '#ff6259' : '#ffffff', 10);
      this.text(g, mode.rescue === 'pompiers' ? 'POMPIERS ICI' : 'SAMU ICI', this.hoverX, this.hoverY - 24, '#ffffff');
    }
  }
}

const EMPTY_UNITS: MapUnit[] = [];

/** Ordres pour lesquels plusieurs unités envoyées au même point se rangent côte à côte. */
const SPREAD_TYPES: ReadonlySet<OrderType> = new Set<OrderType>([
  'avancer', 'colonne', 'bond_offensif', 'charge', 'refoulement', 'repli', 'tenir', 'ligne',
]);
