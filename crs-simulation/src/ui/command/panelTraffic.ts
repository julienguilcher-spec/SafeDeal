/* =====================================================================================
 * Carte tactique — onglet « Circulation » : couper et rouvrir des rues (une rue, un périmètre),
 * fermer, rouvrir ou faire filtrer les stations de métro. Chaque section disparaît proprement si
 * son service étendu est absent.
 * ===================================================================================== */

import type { MetroStation, RoadClosure } from '@/core/extensions';
import { button, el, setClass, setText } from '../maps/icons';
import type { MapCanvas } from '../maps/mapCanvas';
import type { CommandCore } from './core';
import { radioFrame } from './phrases';
import type { TacticalMap } from './tacticalMap';
import { IDLE } from './tacticalState';
import type { TacticalState } from './tacticalState';

const MAX_STATIONS = 10;

export class TrafficPanel {
  readonly root: HTMLDivElement;
  private readonly roads: HTMLDivElement;
  private readonly roadBtn: HTMLButtonElement;
  private readonly areaBtn: HTMLButtonElement;
  private readonly roadTools: HTMLDivElement;
  private readonly roadNote: HTMLElement;
  private readonly closures: HTMLDivElement;
  private readonly openAll: HTMLButtonElement;
  private readonly count: HTMLElement;
  private readonly metro: HTMLDivElement;
  private readonly stations: HTMLDivElement;
  private readonly none: HTMLDivElement;
  private closuresSig = '';
  private stationsSig = '';
  private lastCount = -1;
  private shown: MetroStation[] = [];

  constructor(
    private readonly core: CommandCore, private readonly state: TacticalState, private readonly map: MapCanvas,
    private readonly tmap: TacticalMap, host: HTMLElement,
  ) {
    this.root = el('div', 'ct-pane ct-scroll');
    this.root.dataset.id = 'tac-traffic';
    // rues
    this.roads = el('div', 'ct-sec');
    this.roads.appendChild(el('div', 'cm-sub', 'Circulation'));
    this.roadTools = el('div', 'ct-btnrow');
    this.roadBtn = button('Fermer une rue', () => this.toggle('close_road'), { icon: 'barrier', className: 'is-small', id: 'tac-close-road' });
    this.areaBtn = button('Fermer un périmètre', () => this.toggle('close_area'), { icon: 'select', className: 'is-small', id: 'tac-close-area' });
    this.roadTools.append(this.roadBtn, this.areaBtn);
    this.roadNote = el('div', 'ct-note');
    this.closures = el('div');
    this.openAll = button('Tout rouvrir', () => {
      const t = this.core.traffic;
      if (!t) return;
      t.openAll();
      this.core.ctx.ui.notify('Toutes les rues sont rouvertes à la circulation.', 'ok', 3);
      this.state.focusClosure = 0;
      this.state.touch();
    }, { className: 'is-small is-ghost', id: 'tac-open-all' });
    this.count = el('div', 'ct-note');
    this.roads.append(this.roadTools, this.roadNote, this.closures, this.openAll, this.count);
    // métro
    this.metro = el('div', 'ct-sec');
    this.metro.appendChild(el('div', 'cm-sub', 'Stations de métro'));
    this.metro.appendChild(el('div', 'ct-note', 'Fermer une station tarit l’arrivée par cette bouche et reporte le flux sur les stations voisines. Le filtrage est tenu par l’unité sélectionnée.'));
    this.stations = el('div');
    this.metro.appendChild(this.stations);
    this.none = el('div', 'ct-empty', 'Ni la circulation ni le métro ne sont pilotables pour cette mission.');
    this.root.append(this.roads, this.metro, this.none);
    host.appendChild(this.root);
  }

  /** Le panneau a-t-il quelque chose à montrer ? (sinon l'onglet est masqué) */
  get available(): boolean {
    return this.core.traffic !== undefined || this.core.metro !== undefined;
  }

  private toggle(kind: 'close_road' | 'close_area'): void {
    const st = this.state;
    st.setMode(st.mode.kind === kind ? IDLE : { kind });
  }

  private buildClosures(list: readonly RoadClosure[], can: boolean): void {
    this.closures.textContent = '';
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      const row = el('div', 'ct-row' + (c.id === this.state.focusClosure ? ' is-sel' : ''));
      row.dataset.closure = String(c.id);
      const main = el('div', 'ct-row-main');
      const squad = c.squadId !== 0 ? this.core.ctx.squads.get(c.squadId) : undefined;
      main.append(el('b', undefined, this.tmap.closureName(c)), el('small', undefined, squad ? `Barrage tenu par ${squad.name}` : 'Barrières seules'));
      main.style.cursor = 'pointer';
      main.addEventListener('click', () => {
        this.state.focusClosure = c.id;
        this.state.focusStation = 0;
        this.state.touch();
        this.map.flyTo(c.x, c.z, Math.min(this.map.view.mpp, 1.2));
      });
      row.appendChild(main);
      if (can) {
        row.appendChild(button('Rouvrir', () => this.reopen(c), { className: 'is-small', id: 'reopen-' + c.id }));
      }
      this.closures.appendChild(row);
    }
  }

  reopen(c: RoadClosure): void {
    const core = this.core;
    const t = core.traffic;
    if (!t || !core.scope().canTraffic) return;
    const name = this.tmap.closureName(c);
    t.open(c.id);
    core.ctx.ui.notify(`Circulation rétablie\u00a0: ${name}`, 'ok', 3);
    core.ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: 1, personId: core.ctx.player.state.personId,
      text: radioFrame('CENTRAL', core.callsign(), `Circulation rétablie, ${name}`, false),
    });
    if (this.state.focusClosure === c.id) this.state.focusClosure = 0;
    this.state.touch();
  }

  setOpen(s: MetroStation, open: boolean): void {
    const core = this.core;
    const metro = core.metro;
    if (!metro || !core.scope().canMetro) return;
    metro.setOpen(s.id, open, core.ctx.player.state.personId);
    core.ctx.ui.notify(open ? `Station ${s.name} rouverte.` : `Fermeture de la station ${s.name} demandée.`, 'ok', 3);
    core.ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: 1, personId: core.ctx.player.state.personId,
      text: radioFrame('CENTRAL', core.callsign(), open ? `Demande la réouverture de la station ${s.name}` : `Demande la fermeture de la station ${s.name}`, true),
    });
    this.state.touch();
  }

  setFiltered(s: MetroStation, filtered: boolean): void {
    const core = this.core;
    const metro = core.metro;
    if (!metro || core.scope().level === 'lecture') return;
    if (!filtered) {
      metro.setFiltered(s.id, false, 0);
      core.ctx.ui.notify(`Filtrage levé à la station ${s.name}.`, 'ok', 3);
      this.state.touch();
      return;
    }
    const units = this.tmap.selectedUnits();
    if (units.length === 0) {
      core.ctx.ui.notify('Sélectionnez l’unité qui tiendra le filtrage de la sortie.', 'warn', 4);
      return;
    }
    // l'unité sélectionnée la plus proche tient la sortie
    let best = units[0]!;
    for (let i = 1; i < units.length; i++) {
      if (Math.hypot(units[i]!.x - s.x, units[i]!.z - s.z) < Math.hypot(best.x - s.x, best.z - s.z)) best = units[i]!;
    }
    metro.setFiltered(s.id, true, best.squadId);
    core.ctx.ui.notify(`Sortie ${s.name} filtrée par ${best.name}.`, 'ok', 3);
    core.ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: 1, personId: core.ctx.player.state.personId,
      text: radioFrame(best.name, core.callsign(), `Filtrez la sortie de la station ${s.name}, contrôles à vue`, true),
    });
    this.state.touch();
  }

  private buildStations(list: readonly MetroStation[]): void {
    const sc = this.core.scope();
    this.stations.textContent = '';
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      const row = el('div', 'ct-row' + (s.id === this.state.focusStation ? ' is-sel' : ''));
      row.dataset.station = String(s.id);
      const main = el('div', 'ct-row-main');
      main.append(el('b', undefined, s.name), el('small'));
      main.style.cursor = 'pointer';
      main.addEventListener('click', () => {
        this.state.focusStation = s.id;
        this.state.focusClosure = 0;
        this.state.touch();
        this.map.flyTo(s.x, s.z, Math.min(this.map.view.mpp, 1.2));
      });
      const chip = el('span', 'ct-state' + (!s.open ? ' is-closed' : s.filtered ? ' is-filter' : ''), !s.open ? 'Fermée' : s.filtered ? 'Filtrée' : 'Ouverte');
      row.append(main, chip);
      if (sc.canMetro) {
        row.appendChild(button(s.open ? 'Fermer' : 'Rouvrir', () => this.setOpen(s, !s.open), { className: 'is-small', id: `metro-${s.id}-open` }));
      }
      if (sc.level !== 'lecture' && s.open) {
        row.appendChild(button(s.filtered ? 'Lever' : 'Filtrer', () => this.setFiltered(s, !s.filtered), {
          className: 'is-small', id: `metro-${s.id}-filter`, title: s.filtered ? 'Lever le filtrage' : 'Faire filtrer la sortie par l’unité sélectionnée',
        }));
      }
      this.stations.appendChild(row);
    }
  }

  refresh(): void {
    const core = this.core;
    const sc = core.scope();
    const traffic = core.traffic;
    const metro = core.metro;
    this.none.style.display = traffic || metro ? 'none' : '';
    this.roads.style.display = traffic ? '' : 'none';
    this.metro.style.display = metro ? '' : 'none';
    const mode = this.state.mode;
    if (traffic) {
      const can = sc.canTraffic;
      this.roadTools.style.display = can ? '' : 'none';
      setClass(this.roadBtn, 'is-on', mode.kind === 'close_road');
      setClass(this.areaBtn, 'is-on', mode.kind === 'close_area');
      const sel = this.tmap.selectedUnits();
      setText(this.roadNote, !can ? 'Vous voyez les rues coupées\u00a0; les fermer relève du commandement.'
        : sel.length === 1 ? `Le barrage sera tenu par ${sel[0]!.name}.` : 'Sans unité sélectionnée\u00a0: barrières seules. Sélectionnez une unité pour qu’elle tienne le barrage.');
      const list = traffic.closures;
      let sig = this.state.focusClosure + '|' + (can ? 1 : 0) + '|';
      for (let i = 0; i < list.length; i++) sig += list[i]!.id + ':' + list[i]!.squadId + ',';
      if (sig !== this.closuresSig) {
        this.closuresSig = sig;
        this.buildClosures(list, can);
      }
      this.openAll.style.display = can && list.length > 1 ? '' : 'none';
      const c = traffic.countNear(this.map.view.cx, this.map.view.cz, 300);
      const key = c.moving * 1000 + c.stopped;
      if (key !== this.lastCount) {
        this.lastCount = key;
        setText(this.count, `${list.length === 0 ? 'Aucune rue coupée. ' : ''}Trafic dans 300\u00a0m autour du centre de la carte\u00a0: ${c.moving} en circulation, ${c.stopped} à l’arrêt.`);
      }
    }
    if (metro) {
      // les stations les plus proches du centre de la carte
      const cx = this.map.view.cx, cz = this.map.view.cz;
      const all = metro.stations.slice().sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
      const list = all.slice(0, MAX_STATIONS);
      let sig = this.state.focusStation + '|' + sc.level + '|';
      for (let i = 0; i < list.length; i++) sig += `${list[i]!.id}:${list[i]!.open ? 1 : 0}${list[i]!.filtered ? 1 : 0},`;
      if (sig !== this.stationsSig) {
        this.stationsSig = sig;
        this.shown = list;
        this.buildStations(list);
      }
      for (let i = 0; i < this.shown.length; i++) {
        const s = this.shown[i]!;
        const row = this.stations.children[i] as HTMLElement | undefined;
        const small = row?.querySelector('small');
        if (small) setText(small as HTMLElement, s.open ? `${Math.round(s.inflow)} arrivées/min · ${Math.round(s.arrived)} sortis` : `${Math.round(s.arrived)} sortis avant la fermeture`);
      }
    }
  }
}
