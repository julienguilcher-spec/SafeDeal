/* =====================================================================================
 * Écran « carte_tactique » : la carte de commandement. Non bloquant pour la simulation (le temps
 * continue, avec une option « temps ralenti »). Assemble la carte interactive, l'arborescence des
 * unités, les onglets Ordres / Incidents / Circulation / Journal, et les outils de la carte.
 * ===================================================================================== */

import type { CrowdPhase, InputState } from '@/core/contracts';
import type { ScreenInstance } from '@/core/extensions';
import { button, el, icon, setClass, setText } from '../maps/icons';
import type { IconName } from '../maps/icons';
import { MapCanvas } from '../maps/mapCanvas';
import type { LayerMask } from '../maps/overlay';
import { coarsePointer } from '../maps/style';
import { ScaleBar, WindRose, mapControls } from '../maps/widgets';
import type { TacticalOpenData, TacticalTab } from './api';
import type { CommandCore } from './core';
import { verbOf } from './orders';
import type { OrderVerb } from './orders';
import { IncidentsPanel } from './panelIncidents';
import { OrdersPanel } from './panelOrders';
import { TrafficPanel } from './panelTraffic';
import { UnitsPanel } from './panelUnits';
import { RadioLogView } from './radioLog';
import { ensureCommandStyle } from './style';
import { TacticalMap } from './tacticalMap';
import { MapPopover } from './tacticalPop';
import { IDLE, TacticalState } from './tacticalState';
import { RadialMenu } from './wheel';
import type { WheelItem } from './wheel';

const PHASE_LABELS: Readonly<Record<CrowdPhase, string>> = {
  aucune: 'Pas de rassemblement', rassemblement: 'Rassemblement', depart: 'Départ du cortège', cortege: 'Cortège en marche',
  tension: 'Tension', affrontement: 'Affrontements', dispersion: 'Dispersion', apres_manif: 'Après-manifestation', terminee: 'Manifestation terminée',
};

const TABS: readonly { id: TacticalTab; label: string; icon: IconName }[] = [
  { id: 'ordres', label: 'Ordres', icon: 'orders' },
  { id: 'incidents', label: 'Incidents', icon: 'alert' },
  { id: 'circulation', label: 'Circulation', icon: 'road' },
  { id: 'journal', label: 'Journal', icon: 'radio' },
];

const LAYERS: readonly { key: keyof LayerMask; label: string }[] = [
  { key: 'units', label: 'Unités' }, { key: 'orders', label: 'Ordres en cours' }, { key: 'crowd', label: 'Foule (densité, tension)' },
  { key: 'hazards', label: 'Gaz et feux' }, { key: 'incidents', label: 'Incidents' }, { key: 'closures', label: 'Rues fermées' },
  { key: 'metro', label: 'Métro' }, { key: 'route', label: 'Parcours déclaré' },
];

/** Verbes de l'ordre rapide (appui long, clic droit maintenu, bouton X de la manette). */
const QUICK_VERBS: readonly string[] = ['avancer', 'bond_offensif', 'charge', 'encercler', 'repli', 'cesser', 'tenir', 'ligne'];

/** Vue et sélection retrouvées à la réouverture de la carte pendant la même session. */
interface Memory { cx: number; cz: number; mpp: number; tab: TacticalTab; selection: number[]; session: unknown }
const MEMORY = new WeakMap<CommandCore, Memory>();

export class TacticalScreen implements ScreenInstance {
  readonly root: HTMLDivElement;
  readonly map: MapCanvas;
  readonly state = new TacticalState();
  readonly tmap: TacticalMap;
  private readonly units: UnitsPanel;
  private readonly orders: OrdersPanel;
  private readonly incidents: IncidentsPanel;
  private readonly traffic: TrafficPanel;
  private readonly journal: RadioLogView;
  private readonly leftEl: HTMLElement;
  private readonly rightEl: HTMLElement;
  private readonly tabBtns: HTMLButtonElement[] = [];
  private readonly tabBadge: HTMLElement;
  private readonly panes: HTMLElement[] = [];
  private readonly scope: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly gauge: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly crowd: HTMLElement;
  private readonly slowBtn: HTMLButtonElement;
  private readonly hint: HTMLDivElement;
  private readonly hintTitle: HTMLElement;
  private readonly hintText: HTMLElement;
  private readonly hintRule: HTMLElement;
  private readonly hintCancel: HTMLButtonElement;
  private readonly toolMain: HTMLButtonElement;
  private readonly toolBox: HTMLButtonElement;
  private readonly unitsBtn: HTMLButtonElement;
  private readonly layersBox: HTMLDivElement;
  private readonly pop: MapPopover;
  private readonly quickBox: HTMLDivElement;
  private readonly scale: ScaleBar;
  private readonly rose: WindRose;
  private readonly focus: { dispose(): void };
  private quick: RadialMenu | null = null;
  private quickX = 0;
  private quickZ = 0;
  private quickHeld = false;
  private compact = false;
  private slow = false;
  private savedScale = 1;
  private lastPanels = -1;
  private lastStatus = -1;
  private zone = 0;
  private readonly w = { x: 0, z: 0 };
  private readonly onResize = (): void => this.layout();

  constructor(private readonly core: CommandCore, host: HTMLElement, data: unknown) {
    ensureCommandStyle();
    const ctx = core.ctx;
    const open = (data && typeof data === 'object' ? data : {}) as TacticalOpenData;
    const st = this.state;
    this.root = el('div', 'cm-root ct' + (coarsePointer() ? ' cm-coarse' : ''));
    this.root.dataset.id = 'tactical';
    host.appendChild(this.root);

    // ── bandeau ──
    const top = el('header', 'ct-top');
    const brand = el('div', 'ct-brand');
    brand.appendChild(el('div', 'cm-title', 'Carte tactique'));
    this.scope = el('span', 'ct-scope');
    brand.appendChild(this.scope);
    const status = el('div', 'ct-status');
    this.phase = el('b');
    const gauge = el('span', 'ct-gauge');
    gauge.append(el('span', 'ct-clock-s', 'Tension'), (this.gauge = el('i')));
    this.crowd = el('span', 'ct-clock-s');
    this.clock = el('b');
    status.append(this.phase, gauge, this.crowd, this.clock);
    const actions = el('div', 'ct-actions');
    this.slowBtn = button('Temps ralenti', () => this.toggleSlow(), { icon: 'slow', className: 'is-small', id: 'tac-slow', title: 'Ralentir le temps pendant que la carte est ouverte' });
    const close = button('Fermer', () => ctx.ui.close('carte_tactique'), { icon: 'close', className: 'is-small', id: 'tac-close' });
    const key = core.kit ? core.kit.keyLabel('tactical') : '';
    if (key !== '' && !coarsePointer()) close.appendChild(el('span', 'cm-kbd', key));
    actions.append(this.slowBtn, close);
    top.append(brand, status, actions);

    // ── corps ──
    const body = el('div', 'ct-body');
    const mapwrap = el('div', 'ct-mapwrap');
    this.map = new MapCanvas(core.maps, mapwrap, { base: { margin: 0.3, labels: true, detail: 'plan' }, interval: 0.1 });
    this.map.canvas.tabIndex = 0;
    this.map.canvas.dataset.autofocus = '';
    this.map.canvas.dataset.id = 'tac-map';
    this.map.canvas.classList.add('cm-focusable');
    this.map.view.minMpp = 0.12;
    this.map.view.maxMpp = 7;
    this.map.overlay.selection = st.selection;
    this.map.overlay.commandable = (k) => {
      const u = core.maps.scene.unitModel.get(k);
      return u !== undefined && core.canCommand(u.squadId);
    };
    this.tmap = new TacticalMap(core, this.map, st);
    this.tmap.onQuickMenu = (x, y) => this.openQuick(x, y);
    this.tmap.onPickEntity = (pick) => this.pop.open(pick.station, pick.station ? null : pick.closure);
    // en mode carte, les directions pilotent le curseur : la navigation au focus ne s'en mêle pas
    this.map.canvas.addEventListener('ui:nav', (e) => e.preventDefault());
    // menu radial ouvert par un appui long : glisser vers un secteur le surligne, relâcher le choisit
    this.map.canvas.addEventListener('pointermove', (e) => {
      if (this.quick && this.quickHeld) this.quick.pointerAt(e.clientX, e.clientY);
    });
    this.map.canvas.addEventListener('pointerup', () => {
      if (!this.quick || !this.quickHeld) return;
      this.quickHeld = false;
      if (this.quick.highlighted >= 0) this.quick.choose();
    });

    this.hint = el('div', 'ct-hint is-off');
    this.hintTitle = el('b');
    const hintBody = el('span');
    this.hintText = el('span');
    this.hintRule = el('small');
    hintBody.append(this.hintText, this.hintRule);
    this.hintCancel = button('Annuler', () => st.setMode(IDLE), { className: 'is-small', id: 'tac-cancel' });
    this.hint.append(this.hintTitle, hintBody, this.hintCancel);

    const tools = el('div', 'ct-tools');
    this.unitsBtn = button('', () => {
      st.leftOpen = !st.leftOpen;
      st.touch();
    }, { icon: 'units', className: 'is-icon ct-tool-units', title: 'Unités', id: 'tac-toggle-units' });
    this.toolMain = button('', () => {
      st.tool = 'main';
      st.touch();
    }, { icon: 'hand', className: 'is-icon', title: 'Déplacer la carte, sélectionner', id: 'tac-tool-main' });
    this.toolBox = button('', () => {
      st.tool = st.tool === 'box' ? 'main' : 'box';
      st.touch();
    }, { icon: 'select', className: 'is-icon', title: 'Cadre de sélection', id: 'tac-tool-box' });
    tools.append(this.unitsBtn, this.toolMain, this.toolBox);

    this.layersBox = el('div', 'cm-panel ct-layers');
    for (let i = 0; i < LAYERS.length; i++) {
      const L = LAYERS[i]!;
      const b = button(L.label, () => {
        this.map.overlay.layers[L.key] = !this.map.overlay.layers[L.key];
        setClass(b, 'is-on', this.map.overlay.layers[L.key]);
        this.map.invalidate();
      }, { className: 'is-small is-on', id: 'layer-' + L.key });
      this.layersBox.appendChild(b);
    }
    const layersBtn = button('', () => this.layersBox.classList.toggle('is-on'), { icon: 'layers', className: 'is-icon', title: 'Couches de la carte', id: 'tac-layers' });
    this.quickBox = el('div', 'ct-quick');
    this.scale = new ScaleBar(mapwrap);
    this.rose = new WindRose(mapwrap, 'ct-wind');
    mapControls(mapwrap, this.map, core.maps, [layersBtn]);
    mapwrap.append(this.hint, tools, this.layersBox, this.quickBox);

    // ── panneau de gauche ──
    this.units = new UnitsPanel(core, st, this.map, this.tmap, body);
    this.leftEl = this.units.root;

    // ── panneau de droite ──
    this.rightEl = el('aside', 'ct-right');
    const tabs = el('div', 'ct-tabs');
    this.tabBadge = el('em');
    for (let i = 0; i < TABS.length; i++) {
      const t = TABS[i]!;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ct-tab';
      b.dataset.id = 'tab-' + t.id;
      b.innerHTML = icon(t.icon, 18);
      b.appendChild(el('span', undefined, t.label));
      if (t.id === 'incidents') b.appendChild(this.tabBadge);
      b.addEventListener('click', () => {
        if (this.compact && st.rightOpen && st.tab === t.id) st.rightOpen = false;
        else {
          st.tab = t.id;
          st.rightOpen = true;
        }
        st.touch();
      });
      tabs.appendChild(b);
      this.tabBtns.push(b);
    }
    const panes = el('div', 'ct-panes');
    this.orders = new OrdersPanel(core, st, this.tmap, panes);
    this.incidents = new IncidentsPanel(core, st, this.map, this.tmap, panes);
    this.traffic = new TrafficPanel(core, st, this.map, this.tmap, panes);
    this.journal = new RadioLogView(core, panes);
    this.panes = [this.orders.root, this.incidents.root, this.traffic.root, this.journal.root];
    this.pop = new MapPopover(core, this.map, this.tmap, this.traffic, mapwrap);
    this.rightEl.append(tabs, panes);
    body.append(mapwrap, this.rightEl);
    this.root.append(top, body);

    // ── état initial ──
    this.layout();
    core.maps.scene.invalidate();
    core.maps.use();
    const mem = MEMORY.get(core);
    const sameSession = mem !== undefined && mem.session === ctx.session.config;
    if (sameSession && open.x === undefined) {
      this.map.jumpTo(mem.cx, mem.cz, mem.mpp);
      st.tab = mem.tab;
      const model = core.maps.scene.unitModel;
      st.setSelection(mem.selection.filter((k) => model.get(k) !== undefined));
    } else this.initialView(open);
    if (open.tab) st.tab = open.tab;
    if (open.incidentId) {
      st.focusIncident = open.incidentId;
      st.tab = 'incidents';
    }
    if (open.squadId && core.maps.scene.unitModel.get(open.squadId)) st.setSelection([open.squadId]);
    if (!this.traffic.available && st.tab === 'circulation') st.tab = 'ordres';
    if (this.compact) {
      st.leftOpen = false;
      st.rightOpen = open.tab !== undefined || open.incidentId !== undefined;
    }
    // LB / RB : le socle envoie « ui:tab » au conteneur du groupe de focus actif (l'hôte de l'écran, ou notre racine)
    host.addEventListener('ui:tab', (e) => this.cycleZone((e as CustomEvent<{ step: number }>).detail.step));
    window.addEventListener('resize', this.onResize);
    this.focus = core.kit ? core.kit.focusGroup(this.root) : { dispose(): void {} };
    this.refresh(true);
  }

  private initialView(open: TacticalOpenData): void {
    const core = this.core;
    const scene = core.maps.scene;
    const b = core.ctx.world.bounds;
    if (open.x !== undefined && open.z !== undefined) {
      this.map.jumpTo(open.x, open.z, open.mpp ?? 0.9);
      return;
    }
    // cadrer les unités du joueur (à défaut, toutes celles qu'il voit) et sa propre position
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, n = 0;
    const take = (x: number, z: number): void => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      n++;
    };
    const any = core.scope().squadIds.size === 0;
    for (let i = 0; i < scene.units.length; i++) {
      const u = scene.units[i]!;
      if (u.childCount === 0 && (any || core.canCommand(u.squadId))) take(u.x, u.z);
    }
    if (scene.hasPlayer) take(scene.px, scene.pz);
    if (scene.hasHead) take(scene.headX, scene.headZ);
    if (n === 0) {
      this.map.jumpTo((b.minX + b.maxX) * 0.5, (b.minZ + b.maxZ) * 0.5, 2.5);
      return;
    }
    const v = this.map.view;
    v.setSize(Math.max(200, this.map.el.clientWidth), Math.max(200, this.map.el.clientHeight));
    v.fitBounds(minX, minZ, maxX, maxZ, 90);
    v.setMpp(Math.min(2.2, Math.max(0.55, open.mpp ?? v.mpp)));
    this.map.invalidate();
  }

  private layout(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const compact = w < 980 || h < 520;
    if (compact !== this.compact) {
      this.compact = compact;
      setClass(this.root, 'is-compact', compact);
      if (!compact) {
        this.state.leftOpen = true;
        this.state.rightOpen = true;
      }
      this.state.touch();
    }
  }

  private toggleSlow(): void {
    const clock = this.core.ctx.clock;
    if (!this.slow) {
      this.savedScale = clock.timeScale;
      clock.timeScale = 0.25;
      this.slow = true;
    } else {
      clock.timeScale = this.savedScale;
      this.slow = false;
    }
    setClass(this.slowBtn, 'is-on', this.slow);
  }

  // ───────────────────────────── ordre rapide ─────────────────────────────

  private openQuick(x: number, y: number): void {
    this.closeQuick();
    const core = this.core;
    if (core.scope().level === 'lecture') return;
    this.map.worldAt(x, y, this.w);
    this.quickX = this.w.x;
    this.quickZ = this.w.z;
    const roe = core.ctx.law.roe;
    const verbs: OrderVerb[] = [];
    const items: WheelItem[] = [];
    for (let i = 0; i < QUICK_VERBS.length; i++) {
      const v = verbOf(QUICK_VERBS[i]!)!;
      verbs.push(v);
      items.push({ id: v.type, label: v.short, force: v.coercive, disabled: v.force > roe.authorizedForce && !roe.underAttack });
    }
    const n = this.tmap.selectedUnits().length;
    this.quick = new RadialMenu(this.quickBox, items, {
      onChoose: (i) => {
        const verb = verbs[i]!;
        this.closeQuick();
        if (verb.gesture === 'immediate') this.tmap.issueImmediate(verb);
        else if (verb.gesture === 'line') this.state.setMode({ kind: 'order', verb });
        else if (verb.gesture === 'area') this.tmap.issueArea(verb, this.quickX, this.quickZ, this.quickX, this.quickZ);
        else this.tmap.issuePoint(verb, this.quickX, this.quickZ, NaN);
        this.state.touch();
      },
      onCancel: () => this.closeQuick(),
    });
    this.quick.setCenter('Ordre rapide', n > 1 ? `${n} unités` : 'au point désigné');
    // ouvert par un appui long encore en cours : le relâchement ne doit pas annuler le menu ;
    // on peut aussi glisser vers un secteur et relâcher pour le choisir
    this.quick.swallowHubClick = this.map.gestures.active;
    this.quickHeld = this.map.gestures.active;
    this.quickBox.classList.add('is-on');
    // la roue reste dans la carte
    const vx = Math.min(this.map.view.width - 140, Math.max(140, x));
    const vy = Math.min(this.map.view.height - 140, Math.max(140, y));
    this.quickBox.style.transform = `translate3d(${Math.round(vx)}px,${Math.round(vy)}px,0)`;
  }

  private closeQuick(): void {
    if (!this.quick) return;
    this.quick.dispose();
    this.quick = null;
    this.quickBox.classList.remove('is-on');
  }

  // ───────────────────────────── rafraîchissement ─────────────────────────────

  private refreshHint(): void {
    const st = this.state;
    const mode = st.mode;
    const level = this.core.scope().level;
    let title = '';
    let text = '';
    let rule = '';
    if (mode.kind === 'order') {
      title = mode.verb.short;
      text = mode.verb.hint;
      rule = mode.verb.rule;
    } else if (mode.kind === 'close_road') {
      title = 'Fermer une rue';
      text = 'Désignez la rue à couper. Chaque toucher ferme une rue\u00a0; «\u00a0Terminer\u00a0» quand c’est fait.';
    } else if (mode.kind === 'close_area') {
      title = 'Périmètre';
      text = 'Posez le centre et glissez pour fixer le rayon\u00a0: toutes les rues qui y entrent seront coupées.';
    } else if (mode.kind === 'rescue') {
      title = mode.rescue === 'pompiers' ? 'Pompiers' : 'SAMU';
      text = 'Cliquez sur un feu ou un blessé : l’équipe va directement l’éteindre ou le prendre en charge. Ailleurs : elle se rend au point désigné, par la rue.';
    } else if (st.tool === 'box') {
      title = 'Cadre';
      text = 'Glissez pour encadrer les unités à sélectionner.';
    }
    const on = title !== '';
    setClass(this.hint, 'is-off', !on);
    if (!on) return;
    setClass(this.hint, 'is-mode', mode.kind !== 'idle');
    setText(this.hintTitle, title);
    setText(this.hintText, text);
    setText(this.hintRule, rule);
    this.hintRule.style.display = rule !== '' ? '' : 'none';
    const lbl = this.hintCancel.querySelector('.cm-btn-t');
    if (lbl) setText(lbl as HTMLElement, mode.kind === 'close_road' ? 'Terminer' : 'Annuler');
    this.hintCancel.style.display = mode.kind !== 'idle' ? '' : 'none';
    void level;
  }

  private refreshStatus(): void {
    const ctx = this.core.ctx;
    const dir = ctx.director;
    setText(this.scope, this.core.scope().label);
    setText(this.phase, PHASE_LABELS[dir.phase] ?? '');
    const v = (Math.round(Math.max(0, Math.min(1, dir.tension)) * 40) / 40).toString();
    if (this.gauge.style.getPropertyValue('--v') !== v) this.gauge.style.setProperty('--v', v);
    const scene = this.core.maps.scene;
    setText(this.crowd, scene.crowdCount > 0 ? `Foule : ${scene.crowdCount >= 100 ? '~' + Math.round(scene.crowdCount / 10) * 10 : scene.crowdCount}` : '');
    const tod = ctx.env.state.timeOfDay;
    const h = Math.floor(tod);
    const m = Math.floor((tod - h) * 60);
    setText(this.clock, `${h} h ${m < 10 ? '0' : ''}${m}`);
    this.rose.update(ctx);
  }

  private refresh(force: boolean): void {
    const st = this.state;
    const time = this.core.maps.time;
    if (force || st.dirty || time - this.lastPanels > 0.25) {
      this.lastPanels = time;
      st.dirty = false;
      // onglets et tiroirs
      const hasIncidents = this.core.incidents !== undefined || this.core.rescue !== undefined;
      const hasTraffic = this.traffic.available;
      if ((!hasIncidents && st.tab === 'incidents') || (!hasTraffic && st.tab === 'circulation')) st.tab = 'ordres';
      for (let i = 0; i < TABS.length; i++) {
        const id = TABS[i]!.id;
        setClass(this.tabBtns[i]!, 'is-on', st.tab === id && st.rightOpen);
        this.tabBtns[i]!.style.display = (id === 'incidents' && !hasIncidents) || (id === 'circulation' && !hasTraffic) ? 'none' : '';
        setClass(this.panes[i]!, 'is-on', st.tab === id);
      }
      // un rôle qui ne voit pas le dispositif de police n'a pas d'arborescence d'unités
      const noUnits = !this.core.maps.scene.vis.police;
      setClass(this.root, 'is-nounits', noUnits);
      setClass(this.leftEl, 'is-open', st.leftOpen && !noUnits);
      setClass(this.rightEl, 'is-open', st.rightOpen);
      setClass(this.unitsBtn, 'is-on', st.leftOpen);
      setClass(this.toolMain, 'is-on', st.tool === 'main');
      setClass(this.toolBox, 'is-on', st.tool === 'box');
      this.units.refresh();
      this.incidents.refresh();
      setText(this.tabBadge, this.incidents.openCount > 0 ? String(this.incidents.openCount) : '');
      if (st.tab === 'ordres') this.orders.refresh();
      else if (st.tab === 'circulation') this.traffic.refresh();
      else if (st.tab === 'journal') this.journal.refresh();
      this.refreshHint();
      const o = this.map.overlay;
      o.hoverKey = st.dropKey !== 0 ? st.dropKey : st.hoverKey;
      o.focusIncident = st.focusIncident;
      o.focusStation = st.focusStation;
      o.focusClosure = st.focusClosure;
      this.map.canvas.style.cursor = st.mode.kind !== 'idle' || st.tool === 'box' ? 'crosshair' : '';
      this.map.invalidate();
    }
    if (force || time - this.lastStatus > 0.5) {
      this.lastStatus = time;
      this.refreshStatus();
    }
  }

  // ───────────────────────────── manette : zones de focus ─────────────────────────────

  private cycleZone(step: number): void {
    const st = this.state;
    this.zone = (((this.zone + step) % 3) + 3) % 3;
    if (this.zone === 0) this.map.canvas.focus({ preventScroll: true });
    else if (this.zone === 1) {
      st.leftOpen = true;
      st.touch();
      this.refresh(true);
      const target = (this.leftEl.querySelector('.ct-unit.is-sel') ?? this.leftEl.querySelector('.ct-unit')) as HTMLElement | null;
      target?.focus({ preventScroll: true });
    } else {
      st.rightOpen = true;
      st.touch();
      this.refresh(true);
      const idx = TABS.findIndex((t) => t.id === st.tab);
      this.tabBtns[Math.max(0, idx)]?.focus({ preventScroll: true });
    }
  }

  // ───────────────────────────── cycle de vie ─────────────────────────────

  update(dt: number, input: InputState): void {
    const active = document.activeElement;
    const onMap = active === this.map.canvas || active === document.body || active === null;
    if (this.quick) {
      // roue d'ordre rapide : direction au stick, validation, annulation
      if (input.device === 'gamepad') {
        this.quick.pointAt(input.moveX, -input.moveY, 0.45);
        if (input.pressed('ui_accept')) this.quick.choose();
      }
    } else if (onMap) {
      this.map.updatePad(dt, input);
      if (input.device === 'gamepad' && input.pressed('interact') && this.map.cursorOn && this.tmap.selectedUnits().length > 0 && this.state.mode.kind === 'idle') {
        this.openQuick(this.map.cursorX, this.map.cursorY);
      }
    }
    this.map.frame(dt);
    this.scale.update(this.map.view.mpp);
    this.refresh(false);
    if (this.pop.active) this.pop.refresh();
  }

  back(): boolean {
    if (this.quick) {
      this.closeQuick();
      return true;
    }
    if (this.layersBox.classList.contains('is-on')) {
      this.layersBox.classList.remove('is-on');
      return true;
    }
    if (this.pop.active) {
      this.pop.close();
      this.state.focusStation = 0;
      this.state.focusClosure = 0;
      this.state.touch();
      return true;
    }
    if (this.tmap.drag) {
      this.map.gestures.cancelAll();
      return true;
    }
    if (this.state.mode.kind !== 'idle' || this.state.tool === 'box') {
      this.state.tool = 'main';
      this.state.setMode(IDLE);
      return true;
    }
    return false;
  }

  dispose(): void {
    const v = this.map.view;
    MEMORY.set(this.core, {
      cx: v.cx, cz: v.cz, mpp: v.mpp, tab: this.state.tab, selection: Array.from(this.state.selection),
      session: this.core.ctx.session.config,
    });
    if (this.slow) this.core.ctx.clock.timeScale = this.savedScale;
    window.removeEventListener('resize', this.onResize);
    this.closeQuick();
    this.incidents.dispose();
    this.focus.dispose();
    this.map.dispose();
    this.root.remove();
  }
}
