/* =====================================================================================
 * Carte tactique — panneau de gauche : arborescence des unités (compagnie → sections → groupes,
 * véhicules et moyens spéciaux) avec l'état de chacune, et fiche de la sélection.
 * Les lignes ne sont reconstruites que si la structure change ; sinon seuls les textes qui ont
 * changé sont réécrits.
 * ===================================================================================== */

import type { Faction } from '@/core/contracts';
import { button, el, setClass, setText } from '../maps/icons';
import type { MapCanvas } from '../maps/mapCanvas';
import { arrivalRadius } from '../maps/overlay-units';
import { symbolIcon } from '../maps/symbols';
import type { MapUnit, UnitSymbol } from '../maps/units';
import type { CommandCore } from './core';
import { orderLabel, verbOf } from './orders';
import type { TacticalMap } from './tacticalMap';
import type { TacticalState } from './tacticalState';

const ICON_URLS = new Map<string, string>();

/** Image (URL de données) du symbole d'une unité, fabriquée une fois par type. */
export function unitIconUrl(symbol: UnitSymbol, faction: Faction): string {
  const key = symbol + '|' + faction;
  let url = ICON_URLS.get(key);
  if (!url) {
    url = symbolIcon(symbol, faction, 14, 2).toDataURL();
    ICON_URLS.set(key, url);
  }
  return url;
}

interface Row {
  key: number;
  root: HTMLButtonElement;
  name: HTMLElement;
  me: HTMLElement;
  num: HTMLElement;
  ord: HTMLElement;
}

/** Texte et nature de l'ordre en cours d'une unité. */
export function orderStatus(u: MapUnit): { text: string; free: boolean; force: boolean } {
  const o = u.order;
  if (!o || o.type === 'libre') return { text: u.squadId !== 0 ? 'Libre' : '', free: true, force: false };
  const v = verbOf(o.type);
  return { text: orderLabel(o.type), free: false, force: v ? v.coercive : false };
}

export class UnitsPanel {
  readonly root: HTMLElement;
  private readonly list: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly count: HTMLElement;
  private readonly multiBtn: HTMLButtonElement;
  private rows: Row[] = [];
  private signature = '';
  private cardKey = '';

  constructor(
    private readonly core: CommandCore, private readonly state: TacticalState, private readonly map: MapCanvas,
    private readonly tmap: TacticalMap, host: HTMLElement,
  ) {
    this.root = el('aside', 'ct-left');
    this.root.dataset.id = 'tac-units';
    const head = el('div', 'ct-head');
    const title = el('div', 'cm-sub', 'Unités');
    this.count = el('span', 'cm-chip', '0');
    title.style.display = 'flex';
    title.style.gap = '8px';
    title.style.alignItems = 'center';
    title.appendChild(this.count);
    this.multiBtn = button('', () => {
      state.multi = !state.multi;
      state.touch();
    }, { icon: 'select', className: 'is-icon is-small', title: 'Sélection multiple', id: 'tac-multi' });
    const all = button('Tout', () => this.selectAll(), { className: 'is-small', title: 'Sélectionner toutes mes unités', id: 'tac-all' });
    const tools = el('div');
    tools.style.display = 'flex';
    tools.style.gap = '5px';
    tools.append(all, this.multiBtn);
    head.append(title, tools);
    this.list = el('div', 'ct-scroll');
    this.card = el('div', 'ct-card');
    this.root.append(head, this.list, this.card);
    host.appendChild(this.root);
  }

  /** Sélectionne les unités de premier niveau que le joueur commande. */
  private selectAll(): void {
    const scene = this.core.maps.scene;
    const keys: number[] = [];
    for (let i = 0; i < scene.units.length; i++) {
      const u = scene.units[i]!;
      if (!this.core.canCommand(u.squadId)) continue;
      const parent = u.parentKey !== 0 ? scene.unitModel.get(u.parentKey) : undefined;
      if (parent && this.core.canCommand(parent.squadId) && parent.symbol !== 'compagnie') continue;
      if (u.symbol === 'compagnie' && u.childCount > 0) continue;
      keys.push(u.key);
    }
    this.state.setSelection(keys);
  }

  private build(units: readonly MapUnit[]): void {
    this.list.textContent = '';
    this.rows = [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i]!;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ct-unit d' + Math.min(3, u.depth);
      b.style.setProperty('--d', String(u.depth));
      b.dataset.key = String(u.key);
      b.dataset.id = 'unit-' + u.key;
      const img = document.createElement('img');
      img.alt = '';
      img.src = unitIconUrl(u.symbol, u.faction);
      img.draggable = false;
      const name = el('span', 'ct-unit-name');
      const me = el('span', 'ct-unit-me', 'VOUS');
      const num = el('span', 'ct-unit-num');
      const ord = el('span', 'ct-unit-ord');
      b.append(img, name, me, num, ord);
      b.addEventListener('click', (e) => {
        this.state.select(u.key, e.shiftKey || e.ctrlKey || e.metaKey || this.state.multi);
      });
      b.addEventListener('dblclick', () => {
        const cur = this.core.maps.scene.unitModel.get(u.key);
        if (cur) this.map.flyTo(cur.x, cur.z, Math.min(this.map.view.mpp, 1.4));
      });
      b.addEventListener('pointerenter', () => {
        if (this.state.hoverKey !== u.key) {
          this.state.hoverKey = u.key;
          this.map.invalidate();
        }
      });
      b.addEventListener('pointerleave', () => {
        if (this.state.hoverKey === u.key) {
          this.state.hoverKey = 0;
          this.map.invalidate();
        }
      });
      this.list.appendChild(b);
      this.rows.push({ key: u.key, root: b, name, me, num, ord });
    }
  }

  refresh(): void {
    const scene = this.core.maps.scene;
    const units = scene.units;
    let sig = '';
    for (let i = 0; i < units.length; i++) sig += units[i]!.key + ':' + units[i]!.depth + ':' + units[i]!.symbol + ',';
    if (sig !== this.signature) {
      this.signature = sig;
      this.build(units);
    }
    const st = this.state;
    let own = 0;
    let root = '';
    for (let i = 0; i < units.length; i++) {
      const u = units[i]!;
      const row = this.rows[i]!;
      const mine = this.core.canCommand(u.squadId);
      if (mine) own++;
      // sous sa compagnie, un groupe s'écrit sans la répéter : « MISTRAL 2 ALFA » → « 2 ALFA »
      if (u.depth === 0) root = u.name;
      setText(row.name, u.depth >= 2 && root !== '' && u.name.startsWith(root + ' ') ? u.name.slice(root.length + 1) : u.name);
      if (row.root.title !== u.name) row.root.title = u.name;
      row.me.style.display = u.hasPlayer && u.childCount === 0 ? '' : 'none';
      setText(row.num, u.squadId !== 0 && u.total > 0 ? `${u.valid}/${u.total}` : u.total > 0 ? String(u.total) : '');
      setClass(row.num, 'is-low', u.total > 0 && u.valid / u.total < 0.6);
      const os = orderStatus(u);
      setText(row.ord, os.text);
      setClass(row.ord, 'is-free', os.free);
      setClass(row.ord, 'is-force', os.force);
      setClass(row.root, 'is-sel', st.selection.has(u.key));
      setClass(row.root, 'is-ro', !mine);
      setClass(row.root, 'is-drop', st.dropKey === u.key);
    }
    setText(this.count, String(units.length));
    setClass(this.multiBtn, 'is-on', st.multi);
    this.refreshCard(own);
  }

  private refreshCard(own: number): void {
    const model = this.core.maps.scene.unitModel;
    const sel: MapUnit[] = [];
    this.state.selection.forEach((k) => {
      const u = model.get(k);
      if (u) sel.push(u);
    });
    // la fiche n'est reconstruite que si son contenu change
    let key = sel.length + '|' + own + '|' + this.core.scope().level;
    for (let i = 0; i < sel.length; i++) {
      const u = sel[i]!;
      key += `|${u.key}:${u.valid}/${u.total}:${u.injured}:${Math.round(u.morale * 20)}:${u.ammo}:${u.order ? u.order.type : ''}:${u.orderDist <= arrivalRadius(u.order ? u.order.width : 0) ? 1 : 0}`;
    }
    if (key === this.cardKey) return;
    this.cardKey = key;
    const card = this.card;
    card.textContent = '';
    if (sel.length === 0) {
      const level = this.core.scope().level;
      card.appendChild(el('div', 'ct-card-empty', level === 'lecture'
        ? 'Lecture seule\u00a0: vous voyez le dispositif, vous ne donnez pas d’ordre.'
        : own === 0 ? 'Aucune unité n’est sous vos ordres pour l’instant.'
          : 'Sélectionnez une ou plusieurs unités, sur la carte ou dans la liste, puis donnez un ordre.'));
      return;
    }
    if (sel.length === 1) {
      const u = sel[0]!;
      card.appendChild(el('div', 'ct-card-t', u.name));
      const kv = el('div', 'ct-kv');
      const add = (label: string, value: string): HTMLElement => {
        kv.appendChild(el('span', undefined, label));
        const b = el('b', undefined, value);
        kv.appendChild(b);
        return b;
      };
      if (u.squadId !== 0) {
        add('Effectif valide', `${u.valid} sur ${u.total}`);
        if (u.injured > 0) add('Blessés', String(u.injured)).style.color = 'var(--cm-red)';
        kv.appendChild(el('span', undefined, 'Moral'));
        const bar = el('i', 'ct-bar');
        bar.style.setProperty('--v', String(Math.max(0, Math.min(1, u.morale))));
        bar.style.setProperty('--c', u.morale < 0.4 ? 'var(--cm-red)' : u.morale < 0.7 ? 'var(--cm-orange)' : 'var(--cm-green)');
        kv.appendChild(bar);
        if (u.ammo >= 0) add('Munitions collectives', String(u.ammo));
        const os = orderStatus(u);
        const arrived = u.order ? u.orderDist <= arrivalRadius(u.order.width) : true;
        add('Ordre en cours', os.free ? 'Aucun (initiative)' : `${os.text} — ${arrived ? 'en place' : 'en cours'}`);
        if (u.total > 0 && u.valid / u.total < 0.6) {
          card.appendChild(kv);
          card.appendChild(el('div', 'ct-note is-warn', 'Moins de 60\u00a0% d’agents valides\u00a0: relève conseillée.'));
        } else card.appendChild(kv);
      } else {
        add('Occupants', String(u.total));
        card.appendChild(kv);
      }
      if (!this.core.canCommand(u.squadId)) card.appendChild(el('div', 'ct-note', 'Cette unité n’est pas sous vos ordres.'));
      card.appendChild(button('Centrer la carte', () => this.map.flyTo(u.x, u.z, Math.min(this.map.view.mpp, 1.4)), {
        icon: 'locate', className: 'is-small', id: 'tac-center',
      }));
      return;
    }
    let valid = 0, total = 0, mine = 0;
    for (let i = 0; i < sel.length; i++) {
      valid += sel[i]!.valid;
      total += sel[i]!.total;
      if (this.core.canCommand(sel[i]!.squadId)) mine++;
    }
    card.appendChild(el('div', 'ct-card-t', `${sel.length} unités sélectionnées`));
    const kv = el('div', 'ct-kv');
    kv.append(el('span', undefined, 'Effectif valide'), el('b', undefined, `${valid} sur ${total}`));
    kv.append(el('span', undefined, 'Sous vos ordres'), el('b', undefined, `${mine} sur ${sel.length}`));
    card.appendChild(kv);
    card.appendChild(button('Tout désélectionner', () => this.state.clearSelection(), { className: 'is-small', id: 'tac-clear' }));
    void this.tmap;
  }
}
