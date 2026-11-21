/* =====================================================================================
 * Carte de commandement — « PLUS… » (touche O, bouton « ⋯ Plus… » de la barre du bas ; téléphone : feuille de droite).
 * Deuxième niveau, une liste numérotée (chiffres, ↑↓, Entrée, Échap) :
 *   1 Tous les ordres                 « Chercher un ordre » + les ordres par famille (panelOrders.ts)
 *   2 Tous les incidents et secours   l'ancien onglet « Incidents », inchangé à l'intérieur (panelIncidents.ts)
 *   3 Circulation et métro            rues fermées, « Fermer un quartier aux voitures : 100 / 200 / 400 m », métro
 *   4 Commissariats                   section ajoutée par le module des commissariats (registerMoreSection)
 *   5 Journal radio                   (J) le journal horodaté (radioLog.ts)
 *   6 Affichage de la carte           les couches et la légende en clair
 *   7 Vue drone                       (seulement quand un drone est engagé)
 *   8 Aide clavier                    (H)
 * Les numéros suivent les entrées montrées, sans trou. Les entrées gardent data-id="tab-incidents", "tab-circulation",
 * "tab-journal" (scénarios existants) et "more-ordres", "more-affichage", "more-drone", "more-aide".
 *
 * AJOUTER UNE SECTION (module des commissariats) :
 *   registerMoreSection({ id: 'commissariats', label: 'Commissariats', key: 'KeyC', icon: 'flag',
 *     available: (core) => …, mount: (host, core, api) => ({ refresh(force) {…}, dispose() {…}, open(arg) {…} }) });
 *   `mount` reçoit l'hôte (vide) de la section ; `api.pick(repère)` ouvre la fiche d'un repère, `api.close()` referme
 *   la feuille. `open(arg)` reçoit ce qui suit « : » dans MorePanel.open('commissariats:<id du poste>').
 *   La fonction retournée retire la section.
 *
 * Cycle de vie : l'écran appelle refresh(true) quand il ouvre la feuille (retour au menu), refresh(false) ensuite ;
 * open(section) ouvre directement une section ; back() revient d'une section au menu (Échap).
 * Le choix des entrées (moreEntries) est pur et testé sans DOM.
 * ===================================================================================== */

import type { OrderType } from '@/core/contracts';
import type { IconName } from '../core/icons';
import { iconMarkup } from '../core/icons';
import type { DroneFeedApi } from '../drone/api';
import { DRONE_FEED_SERVICE } from '../drone/api';
import { el, setClass, setText } from '../maps/icons';
import type { MapCanvas } from '../maps/mapCanvas';
import { coarsePointer } from '../maps/style';
import type { CommandLevel } from './api';
import type { Repere } from './cardTypes';
import type { CommandCore } from './core';
import { IncidentsPanel } from './panelIncidents';
import { OrdersPanel, ordersCount } from './panelOrders';
import { TrafficPanel } from './panelTraffic';
import { RadioLogView } from './radioLog';
import type { TacticalMap } from './tacticalMap';
import type { TacticalState } from './tacticalState';

// ───────────────────────────── sections ajoutées (commissariats) ─────────────────────────────

/** Ce qu'une section ajoutée peut demander à l'écran. */
export interface MoreSectionApi {
  /** Ouvre la fiche d'un repère (la feuille laisse la place à la fiche). */
  pick(r: Repere): void;
  /** Referme la feuille. */
  close(): void;
}

export interface MoreSectionView {
  refresh(force: boolean): void;
  dispose(): void;
  /** Ouverture sur un élément (« commissariats:c9 » → open('c9')). */
  open?(arg: string): void;
}

export interface MoreSection {
  id: string;
  label: string;
  /** Touche physique qui l'ouvre aussi (« KeyC ») ; la lettre est imprimée sur l'entrée. */
  key?: string;
  icon?: IconName;
  /** Deuxième ligne de l'entrée. */
  sub?: string;
  /** Section montrée pour ce joueur (absent : toujours). */
  available?(core: CommandCore): boolean;
  mount(host: HTMLElement, core: CommandCore, api: MoreSectionApi): MoreSectionView;
}

const SECTIONS: MoreSection[] = [];

/** Ajoute une section à « Plus… » (après « Circulation et métro »). Retourne la fonction de retrait. */
export function registerMoreSection(s: MoreSection): () => void {
  const i = SECTIONS.findIndex((q) => q.id === s.id);
  if (i >= 0) SECTIONS.splice(i, 1);
  SECTIONS.push(s);
  return () => {
    const j = SECTIONS.indexOf(s);
    if (j >= 0) SECTIONS.splice(j, 1);
  };
}

/** Sections ajoutées (lecture). */
export function moreSections(): readonly MoreSection[] {
  return SECTIONS;
}

// ───────────────────────────── entrées (pur) ─────────────────────────────

export interface MoreEntry {
  /** Identifiant de section (« ordres », « incidents », « circulation », « journal », « affichage », « drone », « aide »,
   * ou celui d'une section ajoutée). */
  id: string;
  dataId: string;
  /** Numéro affiché (1…n, sans trou). */
  n: number;
  icon: IconName;
  label: string;
  sub: string;
  /** Lettre imprimée (« J », « H », « C »), '' sans touche. */
  key: string;
  /** 'section' ouvre un contenu dans la feuille ; 'action' agit tout de suite (vue drone, aide). */
  kind: 'section' | 'action';
}

export interface MoreContext {
  level: CommandLevel;
  /** Suivi des incidents ou service des secours présents. */
  incidents: boolean;
  traffic: boolean;
  metro: boolean;
  drone: boolean;
  /** « Tous les ordres » est branché (l'écran sait ouvrir une fiche « ordre d'abord »). */
  verbFirst: boolean;
  /** L'aide est branchée. */
  help: boolean;
  /** Sections ajoutées montrées pour ce joueur. */
  extra: readonly Pick<MoreSection, 'id' | 'label' | 'key' | 'icon' | 'sub'>[];
}

/** Lettre d'une touche physique (« KeyC » → « C »). */
function keyLetter(code: string | undefined): string {
  if (!code) return '';
  const m = /^Key([A-Z])$/.exec(code);
  return m ? m[1]! : '';
}

/**
 * Entrées de « Plus… » pour ce joueur, numérotées sans trou. Lecture seule : ni « Tous les ordres » ni rien qui
 * commande ; chef de groupe ou de section : « Circulation » sans le métro.
 */
export function moreEntries(c: MoreContext): MoreEntry[] {
  const out: Omit<MoreEntry, 'n'>[] = [];
  const commands = c.level !== 'lecture';
  if (commands && c.verbFirst) {
    out.push({ id: 'ordres', dataId: 'more-ordres', icon: 'list', label: 'Tous les ordres', sub: `les ${ordersCount()} ordres, expliqués, par famille`, key: '', kind: 'section' });
  }
  if (c.incidents) out.push({ id: 'incidents', dataId: 'tab-incidents', icon: 'warning', label: 'Tous les incidents et secours', sub: 'feux, blessés, pillages, appels des secours', key: '', kind: 'section' });
  const metro = c.metro && c.level === 'tout';
  if (c.traffic || metro) {
    out.push({
      id: 'circulation', dataId: 'tab-circulation', icon: c.traffic ? 'car' : 'metro', key: '', kind: 'section',
      label: c.traffic && metro ? 'Circulation et métro' : c.traffic ? 'Circulation' : 'Métro',
      sub: c.traffic ? 'rues fermées aux voitures, quartiers' : 'stations ouvertes, fermées, filtrées',
    });
  }
  for (const s of c.extra) {
    out.push({ id: s.id, dataId: 'more-' + s.id, icon: s.icon ?? 'list', label: s.label, sub: s.sub ?? '', key: keyLetter(s.key), kind: 'section' });
  }
  out.push({ id: 'journal', dataId: 'tab-journal', icon: 'radio', label: 'Journal radio', sub: 'les messages horodatés', key: 'J', kind: 'section' });
  out.push({ id: 'affichage', dataId: 'more-affichage', icon: 'sliders', label: 'Affichage de la carte', sub: 'couches et légende', key: '', kind: 'section' });
  if (c.drone) out.push({ id: 'drone', dataId: 'more-drone', icon: 'eye', label: 'Vue drone', sub: 'le retour vidéo du drone engagé', key: '', kind: 'action' });
  if (c.help) out.push({ id: 'aide', dataId: 'more-aide', icon: 'keyboard', label: 'Aide clavier', sub: 'les touches de la carte', key: 'H', kind: 'action' });
  return out.map((e, i) => ({ ...e, n: i + 1 }));
}

// ───────────────────────────── affichage de la carte ─────────────────────────────

/** Couches de la carte que le joueur peut masquer (clé de LayerMask, libellé). Un module peut en ajouter (registerMapLayer). */
const MAP_LAYERS: { key: string; label: string }[] = [
  { key: 'units', label: 'Unités' }, { key: 'orders', label: 'Ordres en cours' }, { key: 'crowd', label: 'Foule (densité, tension)' },
  { key: 'hazards', label: 'Gaz et feux' }, { key: 'incidents', label: 'Incidents' }, { key: 'closures', label: 'Rues fermées' },
  { key: 'barrages', label: 'Barrages, issues, nasses' }, { key: 'metro', label: 'Métro' }, { key: 'route', label: 'Parcours déclaré' },
];

/** Ajoute une couche à « Affichage de la carte » (ex. : « Commissariats »). Retourne la fonction de retrait. */
export function registerMapLayer(key: string, label: string): () => void {
  const entry = { key, label };
  if (!MAP_LAYERS.some((l) => l.key === key)) MAP_LAYERS.push(entry);
  return () => {
    const i = MAP_LAYERS.indexOf(entry);
    if (i >= 0) MAP_LAYERS.splice(i, 1);
  };
}

/** Couches proposées. */
export function mapLayers(): readonly { key: string; label: string }[] {
  return MAP_LAYERS;
}

/** Légende des symboles en clair : pastille dessinée en SVG, libellé. */
export const MAP_LEGEND: readonly { svg: string; label: string }[] = [
  { svg: '<rect x="1" y="5" width="26" height="6" fill="#ff3b30" stroke="#0b1322"/>', label: 'Rue barrée\u00a0: personne ne passe, dans les deux sens' },
  { svg: '<rect x="1" y="5" width="26" height="6" fill="#ff3b30" stroke="#0b1322"/><circle cx="14" cy="8" r="2.2" fill="#fff"/>', label: 'Rue barrée, passants admis\u00a0: les manifestants ne passent pas, les passants oui' },
  { svg: '<line x1="1" y1="8" x2="27" y2="8" stroke="#ff3b30" stroke-width="4" stroke-dasharray="5 3"/>', label: 'Barrage en route (l’unité n’y est pas encore)' },
  { svg: '<rect x="1" y="5" width="14" height="6" fill="#ff9500"/><rect x="15" y="5" width="12" height="6" fill="none" stroke="#ff9500"/><path d="M15 11l6-6M19 11l6-6M23 11l4-4" stroke="#ff9500"/>', label: 'Barrage incomplet (hachures\u00a0: partie non tenue)' },
  { svg: '<rect x="1" y="5" width="11" height="6" fill="#34c759"/><rect x="16" y="5" width="11" height="6" fill="#34c759"/>', label: 'Barrage filtrant (une porte)' },
  { svg: '<path d="M3 8h11v-4l9 4-9 4v-4" fill="#fff" stroke="#0b1322"/><path d="M14 1v3M14 12v3" stroke="#fff" stroke-width="2"/>', label: 'Rue par où la foule peut sortir (son nom est écrit)' },
  { svg: '<circle cx="14" cy="8" r="6.5" fill="none" stroke="#ff3b30" stroke-width="2" stroke-dasharray="4 2"/>', label: 'Nasse fermée\u00a0: chaque rue autour est tenue' },
  { svg: '<rect x="2" y="5" width="24" height="6" fill="#ff3b30"/><rect x="8" y="5" width="6" height="6" fill="#fff"/><rect x="20" y="5" width="6" height="6" fill="#fff"/>', label: 'Rue fermée aux voitures (barrières)' },
];

// ───────────────────────────── panneau (DOM) ─────────────────────────────

export interface MorePanelOptions {
  state: TacticalState;
  map: MapCanvas;
  tmap: TacticalMap;
  /** « Tous les ordres » : ouvre la fiche « ordre d'abord » (TacticalScreen.verbFirst). Sans lui, l'entrée est masquée. */
  onVerbFirst?(type: OrderType): void;
  /** Ouvre la fiche d'un repère (rue fermée, station, section ajoutée). */
  onPickRepere?(r: Repere): void;
  /** Ouvre l'aide (H). Sans lui, l'entrée est masquée. */
  onHelp?(): void;
  /** Referme la feuille (✕, et après un choix qui rend la carte : vue drone, geste attendu sur la carte). */
  onClose?(): void;
  /** Endroit visé (centre de « Fermer un quartier aux voitures »). */
  where?(): { x: number; z: number; name: string } | null;
}

interface Hosted {
  host: HTMLElement;
  refresh(force: boolean): void;
  dispose(): void;
  open?(arg: string): void;
}

export class MorePanel {
  readonly root: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly menu: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private entries: MoreEntry[] = [];
  private sig = '';
  private section: string | null = null;
  private readonly hosted = new Map<string, Hosted>();

  constructor(private readonly core: CommandCore, host: HTMLElement, private readonly opts: MorePanelOptions) {
    this.root = el('div', 'cp-sheet cp-more');
    this.root.dataset.id = 'tac-more-panel';
    const top = el('div', 'cp-top');
    this.backBtn = document.createElement('button');
    this.backBtn.type = 'button';
    this.backBtn.tabIndex = -1;
    this.backBtn.className = 'cm-btn is-small cp-back';
    this.backBtn.dataset.id = 'more-back';
    this.backBtn.title = 'Revenir à « Plus… » (Échap)';
    this.backBtn.textContent = '‹ Plus…';
    this.backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.back();
    });
    this.titleEl = el('div', 'cp-title', 'Plus…');
    top.append(this.backBtn, this.titleEl);
    if (opts.onClose) {
      const x = document.createElement('button');
      x.type = 'button';
      x.tabIndex = -1;
      x.className = 'cm-btn is-icon is-small cp-x';
      x.dataset.id = 'more-close';
      x.title = 'Fermer';
      x.setAttribute('aria-label', 'Fermer');
      x.innerHTML = iconMarkup('close', 'cp-svg');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onClose?.();
      });
      top.appendChild(x);
    }
    this.menu = el('div', 'cp-list ct-scroll');
    this.body = el('div', 'cp-body');
    this.root.append(top, this.menu, this.body);
    host.appendChild(this.root);
    this.showMenu();
  }

  /** Section ouverte (null : le menu). */
  get current(): string | null {
    return this.section;
  }

  /** Entrées montrées au menu. */
  get menuEntries(): readonly MoreEntry[] {
    return this.entries;
  }

  private droneFeed(): DroneFeedApi | undefined {
    const f = this.core.ctx.service<DroneFeedApi>(DRONE_FEED_SERVICE);
    return f && typeof f.toggle === 'function' ? f : undefined;
  }

  private context(): MoreContext {
    const core = this.core;
    const feed = this.droneFeed();
    return {
      level: core.scope().level,
      incidents: core.incidents !== undefined || core.rescue !== undefined,
      traffic: core.traffic !== undefined,
      metro: core.metro !== undefined,
      drone: !!feed && core.maps.scene.vis.police && feed.engaged(),
      verbFirst: !!this.opts.onVerbFirst,
      // l'aide décrit les touches : sans clavier (téléphone), l'entrée n'a pas de sens
      help: !!this.opts.onHelp && !coarsePointer(),
      extra: SECTIONS.filter((s) => {
        try { return !s.available || s.available(core); } catch { return false; }
      }),
    };
  }

  /** La feuille est (r)ouverte avec `force` : retour au menu. Sinon : mise à jour de ce qui est montré. */
  refresh(force: boolean): void {
    if (force && this.section !== null) this.showMenu();
    this.render(force);
  }

  private render(force: boolean): void {
    if (this.section === null) {
      this.renderMenu(force);
      return;
    }
    const h = this.hosted.get(this.section);
    if (h) {
      try { h.refresh(force); } catch (err) { console.error('[carte de commandement] « Plus… » : section', this.section, err); }
    }
  }

  private renderMenu(force: boolean): void {
    this.entries = moreEntries(this.context());
    const sig = this.entries.map((e) => e.id + e.label).join('|');
    if (sig === this.sig && !force) return;
    this.sig = sig;
    this.menu.textContent = '';
    const keys = !coarsePointer();
    for (const e of this.entries) {
      const b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = -1;
      b.className = 'cp-row cp-entry';
      b.dataset.id = e.dataId;
      b.dataset.n = String(e.n);
      b.appendChild(el('span', 'cp-n', String(e.n)));
      const ic = el('span', 'cp-ic');
      ic.innerHTML = iconMarkup(e.icon, 'cp-svg');
      const main = el('span', 'cp-main');
      main.appendChild(el('b', 'cp-t', e.label));
      if (e.sub !== '') main.appendChild(el('small', 'cp-s', e.sub));
      b.append(ic, main);
      if (keys && e.key !== '') b.appendChild(el('span', 'cm-kbd', e.key));
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.choose(e.id);
      });
      this.menu.appendChild(b);
    }
  }

  private showMenu(): void {
    this.section = null;
    for (const h of this.hosted.values()) h.host.style.display = 'none';
    this.body.style.display = 'none';
    this.menu.style.display = '';
    this.backBtn.style.display = 'none';
    setText(this.titleEl, 'Plus…');
    this.sig = '';
    this.renderMenu(true);
  }

  /** Une entrée choisie : une section s'ouvre, ou l'action se fait (vue drone, aide). */
  private choose(id: string): void {
    if (id === 'drone') {
      const feed = this.droneFeed();
      if (feed) feed.toggle();
      this.opts.onClose?.();
      return;
    }
    if (id === 'aide') {
      this.opts.onHelp?.();
      return;
    }
    this.open(id);
  }

  /**
   * Ouvre une section (« ordres », « incidents », « circulation », « journal », « affichage », ou une section
   * ajoutée ; « commissariats:<id> » l'ouvre sur un élément). Une section indisponible laisse le menu.
   */
  open(section: string): void {
    const [id, arg] = section.split(':', 2) as [string, string | undefined];
    if (id === 'drone' || id === 'aide') {
      this.choose(id);
      return;
    }
    this.entries = moreEntries(this.context());
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) {
      this.showMenu();
      return;
    }
    const h = this.hostedFor(id);
    if (!h) return;
    this.section = id;
    // le menu est vidé : ses numéros (data-n) ne doivent pas répondre aux chiffres pendant la section
    this.menu.textContent = '';
    this.menu.style.display = 'none';
    this.sig = '';
    this.body.style.display = '';
    for (const [k, v] of this.hosted) v.host.style.display = k === id ? '' : 'none';
    this.backBtn.style.display = '';
    setText(this.titleEl, entry.label);
    if (arg !== undefined && h.open) h.open(arg);
    h.refresh(true);
    if (id === 'ordres' && !coarsePointer()) {
      // au clavier : on tape tout de suite pour filtrer (Échap rend la main à la carte)
      const input = h.host.querySelector('input');
      if (input) (input as HTMLInputElement).focus({ preventScroll: true });
    }
  }

  /** Échap dans « Plus… » : d'une section au menu (true), rien à faire au menu (false). */
  back(): boolean {
    if (this.section === null) return false;
    this.showMenu();
    return true;
  }

  private hostedFor(id: string): Hosted | null {
    const have = this.hosted.get(id);
    if (have) return have;
    const host = el('div', 'cp-section');
    host.dataset.section = id;
    this.body.appendChild(host);
    const core = this.core;
    const o = this.opts;
    let h: Hosted | null = null;
    try {
      switch (id) {
        case 'ordres': {
          const p = new OrdersPanel(core, host, { onVerbFirst: (t) => o.onVerbFirst?.(t) });
          h = { host, refresh: (f) => (f ? p.reset() : p.refresh(false)), dispose: () => p.dispose() };
          break;
        }
        case 'incidents': {
          const p = new IncidentsPanel(core, o.state, o.map, o.tmap, host, { onArmMap: () => o.onClose?.() });
          p.root.classList.add('is-on');
          h = { host, refresh: () => p.refresh(), dispose: () => p.dispose() };
          break;
        }
        case 'circulation': {
          const p = new TrafficPanel(core, o.state, o.map, o.tmap, host, { where: o.where, onPick: o.onPickRepere ? (r) => o.onPickRepere!(r) : undefined });
          p.root.classList.add('is-on');
          h = { host, refresh: () => p.refresh(), dispose: () => p.root.remove() };
          break;
        }
        case 'journal': {
          const p = new RadioLogView(core, host);
          p.root.classList.add('is-on');
          h = { host, refresh: () => p.refresh(), dispose: () => p.dispose() };
          break;
        }
        case 'affichage':
          h = this.mountLayers(host);
          break;
        default: {
          const s = SECTIONS.find((q) => q.id === id);
          if (!s) break;
          const api: MoreSectionApi = { pick: (r) => o.onPickRepere?.(r), close: () => o.onClose?.() };
          const v = s.mount(host, core, api);
          h = { host, refresh: (f) => v.refresh(f), dispose: () => v.dispose(), open: v.open ? (a) => v.open!(a) : undefined };
          break;
        }
      }
    } catch (err) {
      console.error('[carte de commandement] « Plus… » : section', id, err);
      h = null;
    }
    if (!h) {
      host.remove();
      return null;
    }
    this.hosted.set(id, h);
    return h;
  }

  /** « Affichage de la carte » : chaque couche s'allume ou s'éteint ; la légende en clair. */
  private mountLayers(host: HTMLElement): Hosted {
    const box = el('div', 'cp-layers ct-scroll');
    const layers = this.opts.map.overlay.layers as unknown as Record<string, boolean>;
    const btns: { key: string; b: HTMLButtonElement }[] = [];
    const build = (): void => {
      box.textContent = '';
      btns.length = 0;
      for (const L of MAP_LAYERS) {
        if (!(L.key in layers)) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.tabIndex = -1;
        b.className = 'cp-row cp-layer';
        b.dataset.id = 'layer-' + L.key;
        b.setAttribute('role', 'switch');
        b.append(el('i', 'cp-box'), el('span', 'cp-t', L.label));
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          layers[L.key] = !layers[L.key];
          sync();
          this.opts.map.invalidate();
        });
        box.appendChild(b);
        btns.push({ key: L.key, b });
      }
      const legend = el('div', 'cp-legend');
      legend.appendChild(el('div', 'cp-cap', 'Légende'));
      for (const row of MAP_LEGEND) {
        const r = el('div', 'cp-legend-r');
        const sw = el('i');
        sw.innerHTML = `<svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true">${row.svg}</svg>`;
        r.append(sw, el('span', undefined, row.label));
        legend.appendChild(r);
      }
      box.appendChild(legend);
    };
    const sync = (): void => {
      for (const { key, b } of btns) {
        const on = !!layers[key];
        setClass(b, 'is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    };
    build();
    sync();
    host.appendChild(box);
    let count = MAP_LAYERS.length;
    return {
      host,
      refresh: () => {
        if (count !== MAP_LAYERS.length) {
          count = MAP_LAYERS.length;
          build();
        }
        sync();
      },
      dispose: () => box.remove(),
    };
  }

  dispose(): void {
    for (const h of this.hosted.values()) {
      try { h.dispose(); } catch (err) { console.error('[carte de commandement] « Plus… » : fermeture', err); }
    }
    this.hosted.clear();
    this.root.remove();
  }
}
