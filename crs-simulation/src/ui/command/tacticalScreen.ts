/* =====================================================================================
 * Écran « carte_tactique » : la carte de commandement. Non bloquant pour la simulation (le temps
 * continue, avec une option « temps ralenti »). Assemble la carte interactive, l'arborescence des
 * unités, les onglets Ordres / Incidents / Circulation / Journal, et les outils de la carte.
 * « Vue drone » (bandeau) ouvre le retour vidéo du drone par-dessus la carte (service 'ui.drone') ; sélectionner
 * l'équipe drone, dans l'arborescence ou sur la carte, ouvre le retour vidéo de son appareil.
 * ===================================================================================== */

import type { CrowdPhase, InputState } from '@/core/contracts';
import type { ScreenInstance } from '@/core/extensions';
import type { DroneFeedApi } from '../drone/api';
import { DRONE_FEED_SERVICE } from '../drone/api';
import { button, el, icon, setClass, setText } from '../maps/icons';
import type { IconName } from '../maps/icons';
import { MapCanvas } from '../maps/mapCanvas';
import type { LayerMask } from '../maps/overlay';
import { coarsePointer } from '../maps/style';
import { ScaleBar, WindRose, mapControls } from '../maps/widgets';
import type { TacticalOpenData, TacticalTab } from './api';
import type { CommandCore } from './core';
import { hasPassersbyOption, passersbyLabel, verbHint, verbOf } from './orders';
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
import { acceptNasse, openFilteredExit, proposeNasse, resolveCrowd } from './nasse';
import { kettleBanner } from '../maps/barrages';
import type { SceneCrowdExits } from '../maps/barrages';
import { PASSERSBY_KEY, PASSERSBY_KEY_LABEL, TACTICAL_KEYS_LEGEND, cycleUnitKey, keyboardSections, sectionKeyIndex } from './tacticalKeys';
import { RadialMenu } from './wheel';
import type { WheelItem } from './wheel';
import { wheelKeyLabel } from './wheelKeys';

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
  { key: 'barrages', label: 'Barrages, issues, nasses' }, { key: 'metro', label: 'Métro' }, { key: 'route', label: 'Parcours déclaré' },
];

/** Légende des symboles de barrage et de nasse (panneau des couches) : pastille dessinée en SVG, libellé. */
const LEGEND: readonly { svg: string; label: string }[] = [
  { svg: '<rect x="1" y="5" width="26" height="6" fill="#ff3b30" stroke="#0b1322"/>', label: 'Rue barrée\u00a0: personne ne passe, dans les deux sens' },
  { svg: '<rect x="1" y="5" width="26" height="6" fill="#ff3b30" stroke="#0b1322"/><circle cx="14" cy="8" r="2.2" fill="#fff"/>', label: 'Rue barrée, «\u00a0passants admis\u00a0»\u00a0: les manifestants ne passent pas, les passants oui' },
  { svg: '<line x1="1" y1="8" x2="27" y2="8" stroke="#ff3b30" stroke-width="4" stroke-dasharray="5 3"/>', label: 'Barrage en route' },
  { svg: '<rect x="1" y="5" width="14" height="6" fill="#ff9500"/><rect x="15" y="5" width="12" height="6" fill="none" stroke="#ff9500"/><path d="M15 11l6-6M19 11l6-6M23 11l4-4" stroke="#ff9500"/>', label: 'Barrage incomplet (hachures\u00a0: partie non tenue)' },
  { svg: '<rect x="1" y="5" width="11" height="6" fill="#34c759"/><rect x="16" y="5" width="11" height="6" fill="#34c759"/>', label: 'Barrage filtrant (une porte)' },
  { svg: '<path d="M3 8h11v-4l9 4-9 4v-4" fill="#fff" stroke="#0b1322"/><path d="M14 1v3M14 12v3" stroke="#fff" stroke-width="2"/>', label: 'Issue ouverte (nom de la rue)' },
  { svg: '<circle cx="14" cy="8" r="6.5" fill="none" stroke="#ff3b30" stroke-width="2" stroke-dasharray="4 2"/>', label: 'Nasse fermée' },
  { svg: '<rect x="2" y="5" width="24" height="6" fill="#ff3b30"/><rect x="8" y="5" width="6" height="6" fill="#fff"/><rect x="20" y="5" width="6" height="6" fill="#fff"/>', label: 'Rue fermée à la circulation (barrières)' },
];

/** Deuxième ligne d'un secteur de l'ordre rapide : « Barrer » dit l'option des passants retenue. */
export function quickSub(type: string, letPass: boolean): string | undefined {
  if (type === 'suivre_pied') return 'à pied';
  if (type === 'avec_moi') return 'en colonne (véh.)';
  if (type === 'couper_circulation') return letPass ? 'passants admis' : 'personne ne passe';
  return undefined;
}

/** Verbes de l'ordre rapide (appui long, clic droit maintenu, bouton X de la manette). */
export const QUICK_VERBS: readonly string[] = [
  'avancer', 'bond_offensif', 'charge', 'encercler', 'repli', 'cesser', 'tenir', 'ligne', 'suivre_pied', 'avec_moi', 'couper_circulation',
];

/** Vue et sélection retrouvées à la réouverture de la carte pendant la même session. */
interface Memory { cx: number; cz: number; mpp: number; tab: TacticalTab; selection: number[]; session: unknown; passersby: boolean }
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
  private readonly droneBtn: HTMLButtonElement;
  /** Unité seule sélectionnée à la dernière vérification (ouverture du retour vidéo à la sélection d'une équipe drone). */
  private lastSolo = -1;
  private readonly hint: HTMLDivElement;
  private readonly hintTitle: HTMLElement;
  private readonly hintText: HTMLElement;
  private readonly hintRule: HTMLElement;
  private readonly hintCancel: HTMLButtonElement;
  private readonly hintOk: HTMLButtonElement;
  /** « Barrer la rue » en cours : option « Passants : bloqués / laissés passer » (touche B). */
  private readonly hintPassants: HTMLButtonElement;
  /** Bandeau « NASSE FERMÉE — lieu — environ N personnes » et son action « Ouvrir une issue filtrée » (F). */
  private readonly kettle: HTMLDivElement;
  private readonly kettleText: HTMLElement;
  private readonly kettleBtn: HTMLButtonElement;
  private kettleShown: SceneCrowdExits | null = null;
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
  /** Mode de la carte à la dernière vérification : un ordre choisi dans la palette rend le focus à la carte. */
  private lastModeKind = 'idle';
  private readonly keysLegend: HTMLDivElement;
  private readonly onResize = (): void => this.layout();
  /** Raccourcis du clavier seul (tacticalKeys.ts) : sections, unité suivante, liste des ordres. */
  private readonly onKeyDown = (e: KeyboardEvent): void => this.shortcut(e);
  /** Point (écran) où l'ordre rapide est ouvert : la roue s'y rouvre quand l'option des passants change. */
  private quickSX = 0;
  private quickSY = 0;

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
    this.droneBtn = button('Vue drone', () => this.toggleDrone(), { icon: 'drone', className: 'is-small', id: 'tac-drone', title: 'Retour vidéo du drone (O)' });
    this.droneBtn.style.display = 'none';
    actions.append(this.droneBtn, this.slowBtn, close);
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
    this.tmap.onAcceptNasse = () => this.acceptNasse();
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
    this.hintCancel = button('Annuler', () => this.cancelHint(), { className: 'is-small', id: 'tac-cancel' });
    this.hintOk = button('Valider', () => this.acceptNasse(), { className: 'is-small is-primary', id: 'tac-nasse-ok', title: 'Valider (Entrée ou P)' });
    this.hintPassants = button(passersbyLabel(false), () => this.togglePassersby(), { className: 'is-small ct-passants', id: 'tac-passants' });
    this.hint.append(this.hintTitle, hintBody, this.hintPassants, this.hintOk, this.hintCancel);

    this.kettle = el('div', 'ct-kettle is-off');
    this.kettle.dataset.id = 'tac-kettle';
    this.kettleText = el('b');
    this.kettleBtn = button('Ouvrir une issue filtrée', () => this.filterKettle(), { icon: 'check', className: 'is-small', id: 'tac-kettle-filter', title: 'Ouvrir une issue filtrée (F)' });
    this.kettleBtn.appendChild(el('span', 'cm-kbd', 'F'));
    this.kettle.append(this.kettleText, this.kettleBtn);

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
    // légende des barrages et des nasses
    const legend = el('div', 'ct-legend');
    legend.appendChild(el('div', 'cm-sub', 'Légende'));
    for (let i = 0; i < LEGEND.length; i++) {
      const row = el('div', 'ct-legend-r');
      const sw = el('i');
      sw.innerHTML = `<svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true">${LEGEND[i]!.svg}</svg>`;
      row.append(sw, el('span', undefined, LEGEND[i]!.label));
      legend.appendChild(row);
    }
    this.layersBox.appendChild(legend);
    const layersBtn = button('', () => this.layersBox.classList.toggle('is-on'), { icon: 'layers', className: 'is-icon', title: 'Couches de la carte', id: 'tac-layers' });
    this.quickBox = el('div', 'ct-quick');
    this.scale = new ScaleBar(mapwrap);
    this.rose = new WindRose(mapwrap, 'ct-wind');
    mapControls(mapwrap, this.map, core.maps, [layersBtn]);
    // clavier seul : les touches de la carte, en bas (masquées au doigt)
    this.keysLegend = el('div', 'ct-keys', TACTICAL_KEYS_LEGEND);
    mapwrap.append(this.hint, this.kettle, tools, this.layersBox, this.quickBox, this.keysLegend);

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
    this.orders.nasse = {
      target: () => this.targetCrowd(),
      propose: () => this.proposeNasse(),
      accept: () => this.acceptNasse(),
      cancel: () => this.cancelHint(),
    };
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
    // option « passants » de « Barrer la rue » : retenue d'une ouverture de la carte à l'autre
    if (mem) st.passersby = mem.passersby;
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
    window.addEventListener('keydown', this.onKeyDown);
    // clavier : Échap ou ⌫ dans la liste des unités ou dans les onglets ramène à la carte (pas la fermeture de
    // l'écran) ; à la manette, B ferme toujours la carte (LB / RB passent d'une zone à l'autre)
    const backToMap = (e: Event): void => {
      if (this.quick || ctx.input.device !== 'kbm') return;
      // un ordre en préparation, une fenêtre ou un outil ouvert : Échap les annule d'abord (back(), non intercepté) ;
      // le focus revient à la carte, si bien que l'Échap suivant ferme l'écran
      if (this.state.mode.kind !== 'idle' || this.state.tool === 'box' || this.pop.active || this.layersBox.classList.contains('is-on') || this.core.nasse) {
        this.focusMap();
        return;
      }
      e.preventDefault();
      this.focusMap();
    };
    this.leftEl.addEventListener('ui:back', backToMap);
    this.rightEl.addEventListener('ui:back', backToMap);
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

  private droneFeed(): DroneFeedApi | undefined {
    const f = this.core.ctx.service<DroneFeedApi>(DRONE_FEED_SERVICE);
    return f && typeof f.toggle === 'function' ? f : undefined;
  }

  private toggleDrone(): void {
    const feed = this.droneFeed();
    if (!feed) return;
    feed.toggle();
    setClass(this.droneBtn, 'is-on', feed.open);
  }

  /** Bouton « Vue drone » (s'il y a un drone engagé) ; une équipe drone sélectionnée seule : son retour vidéo s'ouvre. */
  private refreshDrone(): void {
    const feed = this.droneFeed();
    const engaged = !!feed && this.core.maps.scene.vis.police && feed.engaged();
    const display = engaged ? '' : 'none';
    if (this.droneBtn.style.display !== display) this.droneBtn.style.display = display;
    setClass(this.droneBtn, 'is-on', engaged && feed!.open);
    const sel = this.state.selection;
    let solo = 0;
    if (sel.size === 1) for (const k of sel) solo = k;
    if (solo === this.lastSolo) return;
    // à l'ouverture, la sélection retrouvée n'ouvre rien : seul un nouveau choix du joueur compte
    const first = this.lastSolo < 0;
    this.lastSolo = solo;
    if (first || !engaged || solo === 0) return;
    const u = this.core.maps.scene.unitModel.get(solo);
    if (u && u.symbol === 'drone' && u.squadId !== 0) {
      feed!.showSquad(u.squadId);
      setClass(this.droneBtn, 'is-on', feed!.open);
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
      // « me suivre » : intitulé complet (« À pied » seul ne dirait pas qui l'unité suit) ; « Barrer » : option des
      // passants retenue (B la change, roue ouverte)
      const follow = v.type === 'suivre_pied' || v.type === 'avec_moi';
      items.push({
        id: v.type, label: follow ? 'Me suivre' : v.short, sub: quickSub(v.type, this.state.passersby), force: v.coercive,
        disabled: v.force > roe.authorizedForce && !roe.underAttack, key: wheelKeyLabel(i),
      });
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
    this.quickSX = x;
    this.quickSY = y;
    // option des passants de « Barrer la rue », au doigt comme au clavier (B)
    const opt = button(passersbyLabel(this.state.passersby), () => this.togglePassersby(), {
      className: 'is-small ct-quick-opt' + (this.state.passersby ? ' is-on' : ''), id: 'tac-quick-passants', title: `${passersbyLabel(!this.state.passersby)} (${PASSERSBY_KEY_LABEL})`,
    });
    if (!coarsePointer()) opt.appendChild(el('span', 'cm-kbd', PASSERSBY_KEY_LABEL));
    this.quick.root.appendChild(opt);
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

  // ───────────────────────────── clavier seul ─────────────────────────────

  /** Rend le focus à la carte (curseur au clavier). */
  private focusMap(): void {
    this.map.canvas.focus({ preventScroll: true });
    this.zone = 0;
  }

  /**
   * Bascule « Passants : bloqués / laissés passer » de « Barrer la rue » (B, boutons de la palette, du bandeau et de
   * l'ordre rapide) : retenue pour les ordres suivants ; la roue ouverte se redessine avec la nouvelle option.
   */
  togglePassersby(): void {
    const on = this.state.togglePassersby();
    this.core.ctx.ui.notify(`Barrer la rue — ${passersbyLabel(on)}`, 'info', 2.5);
    if (this.quick) this.openQuick(this.quickSX, this.quickSY);
    this.refresh(true);
  }

  private shortcut(e: KeyboardEvent): void {
    // B : option des passants, aussi roue d'ordre rapide ouverte (elle se rouvre avec la nouvelle option)
    if (e.code === PASSERSBY_KEY && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !this.root.closest('[inert]')
      && this.core.scope().level !== 'lecture') {
      const t0 = e.target as HTMLElement | null;
      if (!t0 || (t0.tagName !== 'INPUT' && t0.tagName !== 'TEXTAREA' && !t0.isContentEditable)) {
        e.preventDefault();
        this.togglePassersby();
        return;
      }
    }
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || this.quick) return;
    // écran recouvert par un autre (inerte), ou frappe destinée à autre chose que la carte : rien
    if (this.root.closest('[inert]')) return;
    const t = e.target as HTMLElement | null;
    if (t && t !== document.body && t !== document.documentElement && !this.root.contains(t)) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const core = this.core;
    if (core.scope().level === 'lecture') return;
    const st = this.state;
    const scene = core.maps.scene;
    const can = (squadId: number): boolean => core.canCommand(squadId);
    const n = sectionKeyIndex(e.code);
    if (n >= 0) {
      const sections = keyboardSections(scene.units, can);
      const u = sections[n];
      if (!u) {
        core.ctx.ui.notify(sections.length === 0 ? 'Aucune unité sous vos ordres.' : `Touches 1 à ${Math.min(9, sections.length)} : ${sections.length} unité${sections.length > 1 ? 's' : ''} sous vos ordres.`, 'info', 3);
        return;
      }
      e.preventDefault();
      if (e.shiftKey) st.select(u.key, true);
      else st.setSelection([u.key]);
      this.map.flyTo(u.x, u.z);
      return;
    }
    if (e.code === 'KeyU') {
      e.preventDefault();
      let current = 0;
      if (st.selection.size === 1) for (const k of st.selection) current = k;
      const key = cycleUnitKey(scene.units, can, current, e.shiftKey ? -1 : 1);
      const u = key !== 0 ? scene.unitModel.get(key) : undefined;
      if (!u) {
        core.ctx.ui.notify('Aucune unité sous vos ordres.', 'info', 3);
        return;
      }
      st.setSelection([key]);
      this.map.flyTo(u.x, u.z);
      return;
    }
    if (e.code === 'KeyN') {
      e.preventDefault();
      this.proposeNasse();
      return;
    }
    if (e.code === 'KeyF' && this.kettleShown) {
      e.preventDefault();
      this.filterKettle();
      return;
    }
    if (e.code === 'KeyL') {
      e.preventDefault();
      st.setTab('ordres');
      this.refresh(true);
      const first = this.orders.root.querySelector<HTMLButtonElement>('.ct-verb:not([disabled])');
      first?.focus({ preventScroll: true });
      first?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  /** Ordre rapide au clavier (E) : au curseur, ou au centre de la carte s'il n'est pas encore affiché. */
  private openQuickByKey(): void {
    if (this.tmap.selectedUnits().length === 0) {
      this.core.ctx.ui.notify('Sélectionnez d’abord une unité : 1 à 9 (section) ou U (unité suivante).', 'warn', 3);
      return;
    }
    const v = this.map.view;
    const x = this.map.cursorOn ? this.map.cursorX : v.width * 0.5;
    const y = this.map.cursorOn ? this.map.cursorY : v.height * 0.5;
    this.openQuick(x, y);
  }

  // ───────────────────────────── nasse ─────────────────────────────

  /** Point désigné au clavier (curseur) ou centre de la vue, dans le monde. */
  private designated(out: { x: number; z: number }): { x: number; z: number } {
    const v = this.map.view;
    const x = this.map.cursorOn ? this.map.cursorX : v.width * 0.5;
    const y = this.map.cursorOn ? this.map.cursorY : v.height * 0.5;
    this.map.worldAt(x, y, out);
    return out;
  }

  /** Foule visée par « Fermer la nasse » et par le résumé des issues : celle touchée, sinon la plus proche du curseur. */
  targetCrowd(): SceneCrowdExits | null {
    const p = this.designated(this.w);
    return resolveCrowd(this.core.maps.scene.crowdExits, this.state.focusCrowd, p.x, p.z);
  }

  /** « Fermer la nasse » (N, bouton de l'onglet « Ordres ») : proposition montrée sur la carte, à valider. */
  proposeNasse(): void {
    const core = this.core;
    if (core.scope().level === 'lecture') return;
    if (core.maps.scene.crowdExits.length === 0) {
      core.ctx.ui.notify('Aucune issue connue autour des foules : le service des barrages ne répond pas.', 'warn', 4);
      return;
    }
    const scene = core.maps.scene;
    const sections = keyboardSections(scene.units, (id) => core.canCommand(id));
    const r = proposeNasse(core, this.targetCrowd(), this.tmap.selectedUnits(), sections);
    const keys = core.ctx.input.device === 'kbm' && !coarsePointer() ? ' Entrée ou P : valider · Échap : annuler.' : '';
    core.ctx.ui.notify(r.text + (r.pending ? keys : ''), r.pending ? 'info' : 'warn', r.pending ? 6 : 5);
    if (!r.pending) core.ctx.audio.play('ui_alerte');
    this.state.touch();
  }

  acceptNasse(): void {
    const core = this.core;
    if (!core.nasse) return;
    const r = acceptNasse(core);
    core.ctx.ui.notify(r.text, r.ok ? 'ok' : 'warn', 5);
    this.state.touch();
  }

  /** Bouton « Annuler » du bandeau de consigne : la proposition de nasse, sinon l'outil en cours. */
  private cancelHint(): void {
    if (this.core.nasse) this.core.nasse = null;
    else this.state.setMode(IDLE);
    this.state.touch();
  }

  /** Nasse fermée : l'unité qui tient l'issue la plus large passe en barrage filtrant (ordre « filtrer »). */
  private filterKettle(): void {
    const k = this.kettleShown;
    if (!k || this.core.scope().level === 'lecture') return;
    const r = openFilteredExit(this.core, k);
    this.core.ctx.ui.notify(r.text, r.ok ? 'ok' : 'warn', 5);
    if (!r.ok) this.core.ctx.audio.play('ui_alerte');
    this.state.touch();
  }

  /** Bandeau de la nasse fermée la plus proche du centre de la vue (« (+1) » s'il y en a d'autres). */
  private refreshKettle(): void {
    const list = this.core.maps.scene.crowdExits;
    const v = this.map.view;
    let best: SceneCrowdExits | null = null;
    let bd = Infinity;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      if (!c.closed) continue;
      n++;
      const d = Math.hypot(c.x - v.cx, c.z - v.cz);
      if (d < bd) { bd = d; best = c; }
    }
    this.kettleShown = best;
    setClass(this.kettle, 'is-off', !best);
    if (!best) return;
    setText(this.kettleText, kettleBanner({ place: best.place, inside: best.people }) + (n > 1 ? ` (+${n - 1})` : ''));
    const canAct = this.core.scope().level !== 'lecture';
    this.kettleBtn.style.display = canAct ? '' : 'none';
    const filtered = best.exits.some((e) => e.mode === 'filtrant');
    const lbl = this.kettleBtn.querySelector('.cm-btn-t');
    if (lbl) setText(lbl as HTMLElement, filtered ? 'Issue filtrée ouverte' : 'Ouvrir une issue filtrée');
    this.kettleBtn.disabled = filtered;
  }

  // ───────────────────────────── rafraîchissement ─────────────────────────────

  private refreshHint(): void {
    const st = this.state;
    const mode = st.mode;
    const level = this.core.scope().level;
    let title = '';
    let text = '';
    let rule = '';
    const nasse = this.core.nasse;
    if (nasse && mode.kind === 'idle') {
      title = 'Fermer la nasse';
      text = nasse.text;
    } else if (mode.kind === 'order') {
      title = mode.verb.short;
      text = verbHint(mode.verb, st.passersby);
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
    const pending = !!nasse && mode.kind === 'idle';
    setClass(this.hint, 'is-mode', mode.kind !== 'idle' || pending);
    setText(this.hintTitle, title);
    // au clavier seul, la désignation se fait au curseur (les consignes des ordres parlent de clic et de glisser)
    if (pending && this.core.ctx.input.device === 'kbm' && !coarsePointer()) {
      text += ' Clavier\u00a0: Entrée ou P pour valider, Échap pour annuler.';
    } else if (mode.kind !== 'idle' && this.core.ctx.input.device === 'kbm' && !coarsePointer()) {
      text += mode.kind === 'close_area'
        ? ' Clavier\u00a0: flèches pour placer le centre, Entrée maintenue et flèches pour le rayon.'
        : ' Clavier\u00a0: flèches pour viser, Entrée pour désigner (Entrée maintenue et flèches pour tracer)\u00a0; Échap annule.';
    }
    setText(this.hintText, text);
    setText(this.hintRule, rule);
    this.hintRule.style.display = rule !== '' ? '' : 'none';
    const lbl = this.hintCancel.querySelector('.cm-btn-t');
    if (lbl) setText(lbl as HTMLElement, mode.kind === 'close_road' ? 'Terminer' : 'Annuler');
    this.hintCancel.style.display = mode.kind !== 'idle' || pending ? '' : 'none';
    this.hintOk.style.display = pending ? '' : 'none';
    // « Barrer la rue » : l'option des passants, à changer avant de désigner la rue (B, ou toucher)
    const opt = mode.kind === 'order' && hasPassersbyOption(mode.verb.type);
    this.hintPassants.style.display = opt ? '' : 'none';
    if (opt) {
      const t = this.hintPassants.querySelector('.cm-btn-t');
      const label = passersbyLabel(st.passersby);
      if (t) setText(t as HTMLElement, label);
      setClass(this.hintPassants, 'is-on', st.passersby);
      this.hintPassants.title = `${passersbyLabel(!st.passersby)} (${PASSERSBY_KEY_LABEL})`;
      if (!coarsePointer() && !this.hintPassants.querySelector('.cm-kbd')) this.hintPassants.appendChild(el('span', 'cm-kbd', PASSERSBY_KEY_LABEL));
    }
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
      this.refreshKettle();
      this.refreshDrone();
      // ordre (ou appel des secours) choisi au clavier dans la palette : le focus passe à la carte pour désigner le point
      const kind = st.mode.kind;
      if (kind !== this.lastModeKind) {
        const from = this.lastModeKind;
        this.lastModeKind = kind;
        const active = document.activeElement;
        if (from === 'idle' && kind !== 'idle' && active instanceof HTMLElement && this.rightEl.contains(active)) this.focusMap();
      }
      const keysOn = this.core.ctx.input.device === 'kbm' && !coarsePointer() && this.core.scope().level !== 'lecture';
      this.keysLegend.style.display = keysOn ? '' : 'none';
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
    // clavier seul : focus perdu (élément retiré, ouverture avant que la carte soit prête) → il revient à la carte,
    // sinon les flèches et Entrée n'y feraient rien
    if (onMap && active !== this.map.canvas && input.device === 'kbm' && !this.root.closest('[inert]')) this.focusMap();
    if (this.quick) {
      // roue d'ordre rapide : direction au stick, validation, annulation
      if (input.device === 'gamepad') {
        this.quick.pointAt(input.moveX, -input.moveY, 0.45);
        if (input.pressed('ui_accept')) this.quick.choose();
      } else {
        // clavier : chiffre = ordre direct, flèches = surlignage, Entrée = valider (Échap : back())
        const quick = this.quick;
        quick.applyKeys(input, input.device === 'kbm', () => this.core.ctx.audio.play('ui_alerte'));
        if (this.quick === quick && input.pressed('ui_accept') && quick.highlighted >= 0 && !quick.choose()) this.core.ctx.audio.play('ui_alerte');
      }
    } else if (onMap) {
      this.map.updatePad(dt, input);
      if (input.device === 'gamepad' && input.pressed('interact') && this.map.cursorOn && this.tmap.selectedUnits().length > 0 && this.state.mode.kind === 'idle') {
        this.openQuick(this.map.cursorX, this.map.cursorY);
      } else if (input.device === 'kbm' && input.pressed('interact') && this.state.mode.kind === 'idle' && this.core.scope().level !== 'lecture') {
        this.openQuickByKey();
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
    if (this.core.nasse && this.state.mode.kind === 'idle') {
      this.core.nasse = null;
      this.state.touch();
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
      session: this.core.ctx.session.config, passersby: this.state.passersby,
    });
    if (this.slow) this.core.ctx.clock.timeScale = this.savedScale;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    this.closeQuick();
    this.incidents.dispose();
    this.focus.dispose();
    this.map.dispose();
    this.root.remove();
  }
}
