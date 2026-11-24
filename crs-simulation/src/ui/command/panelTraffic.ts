/* =====================================================================================
 * Carte de commandement — « Plus… › Circulation et métro » : les rues fermées aux voitures (et qui les tient),
 * « Fermer un quartier aux voitures » autour de l'endroit visé (100 m, 200 m ou 400 m : trois lignes, sans geste sur
 * la carte), « Tout rouvrir », et les stations de métro (fermer / rouvrir, faire filtrer la sortie). Une rue se ferme
 * aussi depuis sa fiche (« Fermer aux voitures (barrières) »). Le métro n'est montré qu'au commandant de tout le
 * dispositif (pas au chef de groupe). Chaque section disparaît proprement si son service étendu est absent.
 * Un clic sur une rue fermée ou une station ouvre sa fiche (onPick) ; sans branchement, la carte y va.
 * ===================================================================================== */

import type { MetroStation, RoadClosure } from '@/core/extensions';
import { button, el, setText } from '../maps/icons';
import type { MapCanvas } from '../maps/mapCanvas';
import type { MapUnit } from '../maps/units';
import type { Repere } from './cardTypes';
import type { CommandCore } from './core';
import { radioFrame } from './phrases';
import { capFirst } from './reperes';
import type { TacticalMap } from './tacticalMap';
import type { TacticalState } from './tacticalState';

const MAX_STATIONS = 10;

/** Rayons de « Fermer un quartier aux voitures » (m). */
export const AREA_RADII: readonly number[] = [100, 200, 400];

export interface TrafficPanelOptions {
  /** Centre de « Fermer un quartier aux voitures » : l'endroit visé (sinon le centre de la carte). */
  where?(): { x: number; z: number; name: string } | null;
  /** Ouvre la fiche d'une rue fermée ou d'une station de métro. */
  onPick?(r: Repere): void;
}

export class TrafficPanel {
  readonly root: HTMLDivElement;
  private readonly roads: HTMLDivElement;
  private readonly areaBox: HTMLDivElement;
  private readonly areaTitle: HTMLElement;
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
    private readonly tmap: TacticalMap, host: HTMLElement, private readonly opts: TrafficPanelOptions = {},
  ) {
    this.root = el('div', 'ct-pane ct-scroll');
    this.root.dataset.id = 'tac-traffic';
    // rues
    this.roads = el('div', 'ct-sec');
    this.roads.appendChild(el('div', 'cm-sub', 'Rues fermées aux voitures'));
    this.closures = el('div');
    this.roadNote = el('div', 'ct-note');
    this.openAll = button('Tout rouvrir', () => {
      const t = this.core.traffic;
      if (!t || !this.core.scope().canTraffic) return;
      t.openAll();
      this.core.ctx.ui.notify('Toutes les rues sont rouvertes à la circulation.', 'ok', 3);
      this.state.focusClosure = 0;
      this.state.touch();
    }, { className: 'is-small is-ghost', id: 'tac-open-all' });
    this.openAll.tabIndex = -1;
    this.count = el('div', 'ct-note');
    // quartier : trois rayons, autour de l'endroit visé
    this.areaBox = el('div', 'cp-area');
    this.areaTitle = el('div', 'ct-note');
    this.areaBox.appendChild(this.areaTitle);
    for (const r of AREA_RADII) {
      const b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = -1;
      b.className = 'cp-row cp-arow';
      b.dataset.id = 'tac-close-area-' + r;
      const main = el('span', 'cp-main');
      main.append(el('b', 'cp-t', `Fermer un quartier aux voitures\u00a0: ${r}\u00a0m`), el('small', 'cp-s', 'Barrières à chaque accès ; les piétons passent.'));
      b.appendChild(main);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeArea(r);
      });
      this.areaBox.appendChild(b);
    }
    this.roads.append(this.roadNote, this.closures, this.openAll, this.areaBox, this.count);
    // métro
    this.metro = el('div', 'ct-sec');
    this.metro.appendChild(el('div', 'cm-sub', 'Stations de métro'));
    this.metro.appendChild(el('div', 'ct-note', 'Fermer une station tarit l’arrivée par cette bouche et reporte le flux sur les stations voisines. Le filtrage de la sortie est tenu par l’unité choisie, sinon par la plus proche de vos unités libres.'));
    this.stations = el('div');
    this.metro.appendChild(this.stations);
    this.none = el('div', 'ct-empty', 'Ni la circulation ni le métro ne sont pilotables pour cette mission.');
    this.root.append(this.roads, this.metro, this.none);
    host.appendChild(this.root);
  }

  /** Le panneau a-t-il quelque chose à montrer ? (sinon l'entrée de « Plus… » est masquée) */
  get available(): boolean {
    return this.core.traffic !== undefined || (this.core.metro !== undefined && this.metroShown);
  }

  /** Le métro est pour le commandant de tout le dispositif (pas pour un chef de groupe ou de section). */
  get metroShown(): boolean {
    return this.core.scope().level === 'tout';
  }

  /** Centre de « Fermer un quartier » : l'endroit visé, sinon le centre de la carte. */
  private areaCentre(): { x: number; z: number; name: string } {
    const w = this.opts.where?.() ?? null;
    if (w) return w;
    const v = this.map.view;
    return { x: v.cx, z: v.cz, name: this.core.ctx.world.sectorName(v.cx, v.cz) };
  }

  closeArea(radius: number): void {
    if (!this.core.traffic || !this.core.scope().canTraffic) return;
    const c = this.areaCentre();
    this.tmap.closeArea(c.x, c.z, radius);
    this.state.touch();
  }

  private pick(r: Repere): void {
    if (this.opts.onPick) this.opts.onPick(r);
    else this.map.flyTo(r.x, r.z, Math.min(this.map.view.mpp, 1.2));
  }

  private buildClosures(list: readonly RoadClosure[], can: boolean): void {
    this.closures.textContent = '';
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      const row = el('div', 'ct-row' + (c.id === this.state.focusClosure ? ' is-sel' : ''));
      row.dataset.closure = String(c.id);
      const main = document.createElement('button');
      main.type = 'button';
      main.tabIndex = -1;
      main.className = 'ct-row-main cp-plain';
      main.dataset.id = 'closure-' + c.id;
      const squad = c.squadId !== 0 ? this.core.ctx.squads.get(c.squadId) : undefined;
      const name = this.tmap.closureName(c);
      main.append(el('b', undefined, capFirst(name)), el('small', undefined, squad ? `Tenue par ${squad.name}` : 'Barrières seules'));
      main.addEventListener('click', (e) => {
        e.stopPropagation();
        this.state.focusClosure = c.id;
        this.state.focusStation = 0;
        this.state.touch();
        this.pick({ kind: 'fermeture', key: `fermeture:${c.id}`, x: c.x, z: c.z, closureId: c.id, name: `${capFirst(name)} — fermée aux voitures` });
      });
      row.appendChild(main);
      if (can) {
        const b = button('Rouvrir', () => this.reopen(c), { className: 'is-small', id: 'reopen-' + c.id });
        b.tabIndex = -1;
        row.appendChild(b);
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

  /** Unité qui tiendra le filtrage : la plus proche des unités choisies, sinon la plus proche de mes unités libres. */
  private filterHolder(s: MetroStation): MapUnit | null {
    const near = (list: readonly MapUnit[]): MapUnit | null => {
      let best: MapUnit | null = null;
      let bd = Infinity;
      for (const u of list) {
        const d = Math.hypot(u.x - s.x, u.z - s.z);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      return best;
    };
    const chosen = this.tmap.selectedUnits().filter((u) => this.core.canCommand(u.squadId));
    if (chosen.length > 0) return near(chosen);
    const free = this.core.maps.scene.units.filter((u) => u.squadId > 0 && u.childCount === 0 && u.total > 0 && !u.patrol
      && (u.symbol === 'groupe' || u.symbol === 'section' || u.symbol === 'binome') && this.core.canCommand(u.squadId)
      && (!u.order || u.order.type === 'libre'));
    return near(free);
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
    const best = this.filterHolder(s);
    if (!best) {
      core.ctx.ui.notify('Aucune unité libre sous vos ordres pour filtrer la sortie.', 'warn', 4);
      return;
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
      const main = document.createElement('button');
      main.type = 'button';
      main.tabIndex = -1;
      main.className = 'ct-row-main cp-plain';
      main.dataset.id = 'station-' + s.id;
      main.append(el('b', undefined, `Station ${s.name}`), el('small'));
      main.addEventListener('click', (e) => {
        e.stopPropagation();
        this.state.focusStation = s.id;
        this.state.focusClosure = 0;
        this.state.touch();
        this.pick({ kind: 'metro', key: `metro:${s.id}`, x: s.x, z: s.z, metroId: s.id, name: `Station ${s.name}` });
      });
      const chip = el('span', 'ct-state' + (!s.open ? ' is-closed' : s.filtered ? ' is-filter' : ''), !s.open ? 'Fermée' : s.filtered ? 'Filtrée' : 'Ouverte');
      row.append(main, chip);
      if (sc.canMetro) {
        const b = button(s.open ? 'Fermer' : 'Rouvrir', () => this.setOpen(s, !s.open), { className: 'is-small', id: `metro-${s.id}-open` });
        b.tabIndex = -1;
        row.appendChild(b);
      }
      if (sc.level !== 'lecture' && s.open) {
        const b = button(s.filtered ? 'Lever' : 'Filtrer', () => this.setFiltered(s, !s.filtered), {
          className: 'is-small', id: `metro-${s.id}-filter`, title: s.filtered ? 'Lever le filtrage' : 'Faire filtrer la sortie par une de vos unités',
        });
        b.tabIndex = -1;
        row.appendChild(b);
      }
      this.stations.appendChild(row);
    }
  }

  refresh(): void {
    const core = this.core;
    const sc = core.scope();
    const traffic = core.traffic;
    const metro = this.metroShown ? core.metro : undefined;
    this.none.style.display = traffic || metro ? 'none' : '';
    this.roads.style.display = traffic ? '' : 'none';
    this.metro.style.display = metro ? '' : 'none';
    if (traffic) {
      const can = sc.canTraffic;
      this.areaBox.style.display = can ? '' : 'none';
      if (can) {
        const c = this.areaCentre();
        setText(this.areaTitle, `Autour de l’endroit visé${c.name !== '' ? ` (${c.name})` : ''}\u00a0:`);
      }
      setText(this.roadNote, !can ? 'Vous voyez les rues fermées\u00a0; les fermer relève du commandement.'
        : 'Une rue se ferme depuis sa fiche\u00a0: cliquez-la sur la carte, puis «\u00a0Fermer aux voitures (barrières)\u00a0».');
      const list = traffic.closures;
      let sig = this.state.focusClosure + '|' + (can ? 1 : 0) + '|';
      for (let i = 0; i < list.length; i++) sig += list[i]!.id + ':' + list[i]!.squadId + ',';
      if (sig !== this.closuresSig) {
        this.closuresSig = sig;
        this.buildClosures(list, can);
      }
      this.openAll.style.display = can && list.length > 1 ? '' : 'none';
      const n = traffic.countNear(this.map.view.cx, this.map.view.cz, 300);
      const key = n.moving * 1000 + n.stopped;
      if (key !== this.lastCount) {
        this.lastCount = key;
        setText(this.count, `${list.length === 0 ? 'Aucune rue fermée. ' : ''}Trafic dans 300\u00a0m autour du centre de la carte\u00a0: ${n.moving} en circulation, ${n.stopped} à l’arrêt.`);
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
