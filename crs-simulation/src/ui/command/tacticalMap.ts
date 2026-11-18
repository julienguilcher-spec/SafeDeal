/* =====================================================================================
 * Carte de commandement — interaction avec la carte. Les mêmes règles valent pour la souris, le pavé tactile, le
 * doigt et le curseur du clavier ou de la manette (MapCanvas les traduit en gestes).
 *
 * Au repos, un clic (un toucher) ne donne JAMAIS d'ordre : il désigne. Les repères (rues, foules, incidents, unités…,
 * reperes.ts) sont accrochés à 40 px du pointeur (48 px au doigt) ; la pile triée par priorité part vers l'écran
 * (`onRepereTap`), qui ouvre la fiche. Le survol fait de même (`onRepereHover`) : le nom du repère accroché s'écrit à
 * côté du pointeur. Maj + clic sur une de mes unités l'ajoute à Qui. Appui long = toucher (au relâchement).
 * Gestes experts, jamais nécessaires : clic droit = « Avancer en formation jusqu'ici » pour les unités choisies,
 * glisser au clic droit = ligne de barrage, Maj + glisser = cadre de sélection, glisser un incident sur une unité =
 * le lui confier, double toucher sur une unité = toute sa section.
 * « Tracer la ligne moi-même » : deux clics (ou Entrée, déplacer, Entrée), sans glisser (beginTrace / traceAt).
 * L'aperçu de la ligne surlignée de la fiche est dessiné par drawCard (tacticalPreview.ts).
 * Les modes hérités des panneaux (fermer une rue, un périmètre, appeler les secours, ordre armé) restent servis.
 * ===================================================================================== */

import type { OrderType, Prop, RoadSample, Squad } from '@/core/contracts';
import type { Incident, RescueKind, RoadClosure } from '@/core/extensions';
import type { MissionBrief } from '@/gameplay/session/mission-api';
import { MISSION_SERVICE } from '@/gameplay/session/mission-api';
import type { PointerInfo } from '../maps/gestures';
import type { MapCanvas } from '../maps/mapCanvas';
import { INCIDENT_RADIUS, foyerRadius } from '../maps/overlay';
import type { SceneFoyer } from '../maps/scene';
import { createShown, visibleUnits } from '../maps/overlay-units';
import type { MapUnit } from '../maps/units';
import type { CardEnv, CardPreview, Repere } from './cardTypes';
import type { CommandCore } from './core';
import { MIN_LINE, areaToOrder, barrageTargetId, lineToOrder, pointHeading, slotsAlongLine, splitLine, spreadPoint, verbOf } from './orders';
import type { OrderGeom, OrderVerb } from './orders';
import { cardEnvFromCore, collectReperes, pickAt, placeRepere } from './reperes';
import { FieldActions } from './tacticalActions';
import { drawTacticalPreview } from './tacticalPreview';
import type { Drag } from './tacticalPreview';
import { IDLE } from './tacticalState';
import type { TacticalState } from './tacticalState';

/** Ce qu'un geste expert désigne directement (cible d'un ordre armé, incident à glisser sur une unité). */
export interface MapPick {
  unit: MapUnit | null;
  incident: Incident | null;
  /** Foyer secondaire (rassemblement, casseurs, blocage) touché. */
  foyer: SceneFoyer | null;
}

/** Espacement entre unités envoyées sur un même point (m). */
const POINT_SPACING = 10;

/** Distance d'accroche d'un repère au pointeur (px) : 40 à la souris et au pavé tactile, 48 au doigt. */
export const SNAP_PX = 40;
export const SNAP_PX_TOUCH = 48;
/** Âge maximal (s) de la liste des repères lue au survol (elle est relue à chaque clic). */
const REPERES_TTL = 0.15;

/** Repères de la scène et environnement des fiches qui les a produits. */
export interface RepereSnapshot {
  env: CardEnv;
  reperes: readonly Repere[];
}

/**
 * Pile des repères sous un point de l'écran : ceux qu'accroche pickAt (priorité : mon unité > incident > commissariat >
 * métro / fermeture > foule > VOUS > rue), puis la rue nommée sous le point (à 8 m au plus) si elle n'y est pas déjà —
 * une foule arrêtée sur une rue donne « Foule | Rue Royale ». Vide : rien d'accroché (l'écran fait un repère de point).
 */
export function repereStack(
  snap: RepereSnapshot, sx: number, sy: number, radiusPx: number, wx: number, wz: number,
  toScreen: (x: number, z: number, out: { x: number; y: number }) => void,
): Repere[] {
  const stack = pickAt(snap.reperes, sx, sy, radiusPx, toScreen);
  const here = placeRepere(wx, wz, snap.env);
  if (here.kind === 'rue' && !stack.some((r) => r.key === here.key)) stack.push(here);
  return stack;
}

export class TacticalMap {
  drag: Drag | null = null;
  /** Dernière position du pointeur sur la carte (écran et monde), pour les aperçus. */
  hoverX = -1;
  hoverY = -1;
  hoverRoad: RoadSample | null = null;
  /**
   * Clic ou toucher au repos : la pile des repères accrochés (priorité d'abord ; vide = rien d'accroché) et le point de
   * l'écran. L'écran ouvre la fiche ; aucun ordre ne part d'un clic sur la carte.
   */
  onRepereTap: ((stack: Repere[], sx: number, sy: number, touch: boolean) => void) | null = null;
  /** Survol au pointeur (souris, pavé tactile) : la pile accrochée, pour écrire son nom à côté du pointeur. */
  onRepereHover: ((stack: Repere[], sx: number, sy: number) => void) | null = null;
  /**
   * Source des repères partagée avec l'écran (il les relit déjà à 10 Hz) ; null : la carte les lit elle-même dans la
   * partie (cardEnvFromCore + collectReperes), au plus toutes les 0,15 s au survol et à chaque clic.
   */
  repereSource: (() => RepereSnapshot) | null = null;
  /** « Tracer la ligne moi-même » : en cours, premier bout posé (monde), et ce qu'on fait des deux bouts. */
  tracing = false;
  traceEnds: { ax: number; az: number } | null = null;
  private onTraceDone: ((ax: number, az: number, bx: number, bz: number) => void) | null = null;
  /** Aperçu de la ligne surlignée de la fiche et repère visé (drawCard). */
  cardPreview: CardPreview | null = null;
  visee: Repere | null = null;
  private quiKeys: Set<number> | null = null;
  private snapshot: RepereSnapshot | null = null;
  private snapshotAt = -Infinity;

  private readonly actions: FieldActions;
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
    this.actions = new FieldActions(core, state, () => this.selectedUnits());
    map.handlers = {
      onHover: (x, y, source) => this.hover(x, y, source),
      onTap: (x, y, info) => this.tap(x, y, info),
      onDoubleTap: (x, y) => this.doubleTap(x, y),
      // appui long = toucher : sans gestionnaire, l'appui long ne consomme rien, le relâchement est un toucher (et un
      // appui hésitant suivi d'un glissement déplace toujours la carte, au doigt comme au pavé tactile)
      onDragStart: (x, y, info) => this.dragStart(x, y, info),
      onDragMove: (x, y) => this.dragMove(x, y),
      onDragEnd: (x, y, _info, cancelled) => this.dragEnd(x, y, cancelled),
      beforeDraw: () => this.beforeDraw(),
      drawExtras: (g, view) => drawTacticalPreview(g, view, this, core, state),
    };
  }

  // ───────────────────────────── repères ─────────────────────────────

  /** Repères de la scène (source de l'écran, sinon lus dans la partie ; `fresh` : relus maintenant). */
  reperes(fresh = false): RepereSnapshot {
    if (this.repereSource) return this.repereSource();
    const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    if (fresh || !this.snapshot || now - this.snapshotAt > REPERES_TTL) {
      const env = cardEnvFromCore(this.core, Array.from(this.state.selection));
      this.snapshot = { env, reperes: collectReperes(env) };
      this.snapshotAt = now;
    }
    return this.snapshot;
  }

  /** Pile des repères sous un point de l'écran (40 px, 48 px au doigt), la plus prioritaire d'abord. */
  stackAt(sx: number, sy: number, touch: boolean, fresh = false): Repere[] {
    const view = this.map.view;
    this.map.worldAt(sx, sy, this.w);
    return repereStack(this.reperes(fresh), sx, sy, touch ? SNAP_PX_TOUCH : SNAP_PX, this.w.x, this.w.z, (x, z, out) => {
      view.worldToScreen(x, z, out);
    });
  }

  // ───────────────────────────── fiche : aperçu ─────────────────────────────

  /**
   * Aperçu de la ligne surlignée de la fiche (null : aucun) et repère visé, dont le nom est écrit en grand. Les unités
   * de Qui sont cerclées, les autres estompées.
   */
  drawCard(preview: CardPreview | null, visee: Repere | null): void {
    this.cardPreview = preview;
    this.visee = visee;
    let keys: Set<number> | null = null;
    if (preview) {
      for (const a of preview.arrows) (keys ??= new Set()).add(a.squadId);
      for (const sgm of preview.segments) (keys ??= new Set()).add(sgm.squadId);
    }
    this.quiKeys = keys;
    this.map.invalidate();
  }

  /** Avant chaque dessin : lecture seule (ni issues de foule, carte de l'exécutant), unités mises en avant. */
  private beforeDraw(): void {
    const o = this.map.overlay;
    const sc = this.core.scope();
    const readOnly = sc.level === 'lecture';
    o.readOnly = readOnly;
    if (readOnly) {
      // l'exécutant : son groupe en avant, son trajet en jaune et sa destination « ICI — … » ; le reste estompé
      const brief = this.core.ctx.service<MissionBrief>(MISSION_SERVICE);
      const c = brief && typeof brief === 'object' ? brief.command : null;
      const dest = c && (c.x !== 0 || c.z !== 0) ? { x: c.x, z: c.z, label: c.place } : null;
      o.executant = sc.ownSquadId !== 0 || dest ? { squadId: sc.ownSquadId, dest } : null;
      o.emphasis = sc.ownSquadId !== 0 ? new Set([sc.ownSquadId]) : null;
      o.emphasisAlpha = 0.5;
      return;
    }
    o.executant = null;
    o.emphasis = this.state.mode.kind === 'idle' ? this.quiKeys : null;
    o.emphasisAlpha = 0.6;
  }

  // ───────────────────────────── ligne tracée en deux clics ─────────────────────────────

  /**
   * « Tracer la ligne moi-même » : les deux prochains clics (ou traceAt au clavier) posent les deux bouts de la ligne,
   * flanc gauche puis flanc droit ; `done` reçoit les deux bouts. Clic droit ou cancelTrace : abandon.
   */
  beginTrace(done: (ax: number, az: number, bx: number, bz: number) => void): void {
    this.tracing = true;
    this.traceEnds = null;
    this.onTraceDone = done;
    this.state.touch();
    this.invalidate();
  }

  cancelTrace(): void {
    if (!this.tracing) return;
    this.tracing = false;
    this.traceEnds = null;
    this.onTraceDone = null;
    this.state.touch();
    this.invalidate();
  }

  /** Pose un bout de la ligne au point du monde (x, z). true quand la ligne est complète (second bout). */
  traceAt(x: number, z: number): boolean {
    if (!this.tracing) return false;
    const a = this.traceEnds;
    if (!a) {
      this.traceEnds = { ax: x, az: z };
      this.state.touch();
      this.invalidate();
      return false;
    }
    if (Math.hypot(x - a.ax, z - a.az) < MIN_LINE) return false;
    const done = this.onTraceDone;
    this.tracing = false;
    this.traceEnds = null;
    this.onTraceDone = null;
    this.state.touch();
    this.invalidate();
    done?.(a.ax, a.az, x, z);
    return true;
  }

  /** Même chose depuis un point de l'écran (clic, ou Entrée au curseur du clavier). */
  traceAtScreen(sx: number, sy: number): boolean {
    this.map.worldAt(sx, sy, this.w);
    return this.traceAt(this.w.x, this.w.z);
  }

  /** Bout libre du tracé : le curseur du clavier s'il est affiché, sinon le pointeur. */
  traceTip(out: { x: number; y: number }): boolean {
    const m = this.map;
    if (m.cursorOn) {
      out.x = m.cursorX;
      out.y = m.cursorY;
      return true;
    }
    if (this.hoverX < 0) return false;
    out.x = this.hoverX;
    out.y = this.hoverY;
    return true;
  }

  private invalidate(): void {
    if (typeof this.map.invalidate === 'function') this.map.invalidate();
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

  /** Incident ouvert de la famille du secours (feux pour les pompiers, victimes pour le SAMU) à moins de 30 m. */
  nearestRescueIncident(kind: 'pompiers' | 'samu', x: number, z: number): { id: number; x: number; z: number } | null {
    const api = this.core.incidents;
    if (!api) return null;
    let best: { id: number; x: number; z: number } | null = null;
    let bd = 30;
    for (const inc of api.list) {
      if (inc.state === 'resolu' || inc.state === 'echoue') continue;
      const fire = inc.kind.startsWith('feu');
      const victim = inc.kind === 'blesse' || inc.kind === 'agent_a_terre' || inc.kind === 'secours_bloques';
      if (kind === 'pompiers' ? !fire : !victim) continue;
      const d = Math.hypot(inc.x - x, inc.z - z);
      if (d < bd) { bd = d; best = inc; }
    }
    return best;
  }

  pick(x: number, y: number, touch: boolean): MapPick {
    const scene = this.core.maps.scene;
    const view = this.map.view;
    const r = touch ? 26 : 18;
    const out: MapPick = { unit: this.pickUnit(x, y, r), incident: null, foyer: this.pickFoyer(x, y, touch) };
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
    return out;
  }

  /** Foyer secondaire dont le marqueur contient le point (pixels), le plus proche. */
  pickFoyer(x: number, y: number, touch: boolean): SceneFoyer | null {
    const list = this.core.maps.scene.foyers;
    const view = this.map.view;
    let best: SceneFoyer | null = null;
    let bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      view.worldToScreen(f.x, f.z, this.sp);
      const d = Math.hypot(this.sp.x - x, this.sp.y - y);
      if (d <= foyerRadius(f.people, false) + (touch ? 10 : 4) && d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
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
    // (« Dégager l'obstacle » : sans sélection, le Centaure libre le plus proche y va)
    if (units.length === 0 && verb.type !== 'degager_obstacle') {
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
    // « Barrer la rue » : option « Passants : bloqués / laissés passer » retenue sur la carte (SquadOrder.targetId)
    const tid = barrageTargetId(verb.type, this.state.passersby, targetId);
    return this.report(this.core.issue(verb.type, this.squadsOf(ordered), this.geoms, tid, targetName), verb);
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
      ctx.ui.notify('Aucun auteur identifié ici\u00a0: interpellation sur le secteur, sur fait constaté.', 'info', 4);
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

  private hover(x: number, y: number, source: 'pointer' | 'cursor'): void {
    const st = this.state;
    this.hoverX = x;
    this.hoverY = y;
    const mode = st.mode;
    if (this.tracing) {
      this.map.invalidate();
      return;
    }
    // le nom du repère accroché suit le pointeur (le curseur du clavier, lui, est suivi par l'écran)
    if (mode.kind === 'idle' && source === 'pointer' && !this.drag && this.onRepereHover) this.onRepereHover(this.stackAt(x, y, false), x, y);
    let key = 0;
    if (mode.kind === 'idle' || (mode.kind === 'order' && mode.verb.gesture === 'target')) {
      const u = this.pickUnit(x, y, 18);
      key = u ? u.key : 0;
    }
    if (key !== st.hoverKey) {
      st.hoverKey = key;
      this.map.invalidate();
    }
    if (mode.kind === 'close_road' || (mode.kind === 'order' && (mode.verb.type === 'couper_circulation' || mode.verb.type === 'filtrer'))) {
      this.map.worldAt(x, y, this.w);
      const ok = this.core.ctx.world.nearestRoad(this.w.x, this.w.z, this.road, 40);
      this.hoverRoad = ok ? this.road : null;
      this.map.invalidate();
    } else if (mode.kind !== 'idle') this.map.invalidate();
  }

  private tap(x: number, y: number, info: PointerInfo): void {
    const st = this.state;
    const mode = st.mode;
    const touch = info.kind === 'touch' || info.kind === 'pen';
    this.map.worldAt(x, y, this.w);
    const wx = this.w.x, wz = this.w.z;
    if (this.tracing) {
      if (info.button === 2) this.cancelTrace();
      else this.traceAt(wx, wz);
      return;
    }
    if (mode.kind === 'order') {
      if (info.button === 2) {
        st.setMode(IDLE);
        return;
      }
      const verb = mode.verb;
      let ok = false;
      // un point désigné sur le marqueur d'un foyer vaut son centre (« avancer jusqu'au rassemblement… ») ; pas pour un
      // barrage : c'est la rue désignée qu'on barre, pas le milieu de la foule
      const street = verb.type === 'couper_circulation' || verb.type === 'filtrer';
      const foyer = !street && (verb.gesture === 'point' || verb.gesture === 'area') ? this.pickFoyer(x, y, touch) : null;
      if (verb.gesture === 'target') ok = this.issueTarget(verb, x, y, touch);
      else if (verb.gesture === 'area') ok = foyer ? this.issueArea(verb, foyer.x, foyer.z, foyer.x, foyer.z) : this.issueArea(verb, wx, wz, wx, wz);
      else ok = foyer ? this.issuePoint(verb, foyer.x, foyer.z, NaN, 0, foyer.name) : this.issuePoint(verb, wx, wz, NaN);
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
      if (info.button !== 2) {
        // clic sur (ou près d') un feu ou un blessé : l'appel lui est lié, l'équipe va directement l'éteindre ou le
        // prendre en charge ; ailleurs, elle se rend au point désigné
        let incidentId = mode.incidentId;
        let tx = wx, tz = wz;
        if (incidentId === 0) {
          const inc = this.nearestRescueIncident(mode.rescue, wx, wz);
          if (inc) { incidentId = inc.id; tx = inc.x; tz = inc.z; }
        }
        this.callRescue(mode.rescue, tx, tz, incidentId);
      }
      st.setMode(IDLE);
      return;
    }
    // repos : clic droit = « Avancer en formation jusqu'ici » pour les unités choisies (geste expert)
    if (info.button === 2) {
      if (this.selectedUnits().length > 0) {
        const foyer = this.pickFoyer(x, y, touch);
        if (foyer) this.issuePoint(verbOf('avancer')!, foyer.x, foyer.z, NaN, 0, foyer.name);
        else this.issuePoint(verbOf('avancer')!, wx, wz, NaN);
      }
      return;
    }
    // Maj (ou Ctrl / Cmd) + clic sur une de mes unités : elle s'ajoute à Qui (ou en sort)
    if (info.shift || info.ctrl) {
      const u = this.pickUnit(x, y, touch ? SNAP_PX_TOUCH * 0.6 : SNAP_PX * 0.5);
      if (u && u.squadId !== 0 && this.core.canCommand(u.squadId)) {
        st.select(u.key, true);
        return;
      }
    }
    // sinon : désigner (l'écran ouvre la fiche du repère ; jamais d'ordre ici)
    this.onRepereTap?.(this.stackAt(x, y, touch, true), x, y, touch);
  }

  /** Double toucher sur une unité : sélectionne toute sa section (ses unités sœurs) et centre la vue. */
  private doubleTap(x: number, y: number): boolean {
    if (this.state.mode.kind !== 'idle' || this.tracing) return true;
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

  private dragStart(x: number, y: number, info: PointerInfo): 'pan' | 'capture' {
    const st = this.state;
    const mode = st.mode;
    this.map.worldAt(x, y, this.w);
    const base = { ax: this.w.x, az: this.w.z, bx: this.w.x, bz: this.w.z, sx0: x, sy0: y, sx: x, sy: y };
    if (info.button === 1 || this.tracing) return 'pan';
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

  // ───────────────────────────── circulation, secours, incidents (tacticalActions.ts) ─────────────────────────────

  closeRoad(x: number, z: number): void {
    this.actions.closeRoad(x, z);
  }

  closeArea(x: number, z: number, radius: number): void {
    this.actions.closeArea(x, z, radius);
  }

  closureName(c: RoadClosure): string {
    return this.actions.closureName(c);
  }

  callRescue(kind: RescueKind, x: number, z: number, incidentId: number): void {
    this.actions.callRescue(kind, x, z, incidentId);
  }

  /** L'unité peut-elle recevoir un incident de la part du joueur ? */
  canReceive(u: MapUnit): boolean {
    return this.actions.canReceive(u);
  }

  /** Délègue un incident à une unité (glisser-déposer, bouton « Confier à la sélection »). */
  assignToUnit(incidentId: number, u: MapUnit): boolean {
    return this.actions.assignToUnit(incidentId, u);
  }
}


/** Ordres pour lesquels plusieurs unités envoyées au même point se rangent côte à côte. */
const SPREAD_TYPES: ReadonlySet<OrderType> = new Set<OrderType>([
  'avancer', 'colonne', 'bond_offensif', 'charge', 'refoulement', 'repli', 'tenir', 'ligne',
]);
