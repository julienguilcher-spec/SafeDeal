/* =====================================================================================
 * Carte de commandement — « PLUS… › COMMISSARIATS » : la liste complète des sept sites et de leurs unités
 * (ouverte aussi par la ligne « Toutes les unités du poste… » de la fiche d'un commissariat, sur ce poste).
 *
 *   un site par rangée, du plus proche au plus loin : « Commissariat du 9e — rue Chauchat » /
 *   « à 2,1 km · ≈ 4 min deux-tons · 3 prêtes » ; Entrée, un clic ou son numéro le déplie (ou le replie) ;
 *   dessous, une rangée par unité : « TV 75-19 · Police secours, 3 gardiens » / « Au poste — prête », puis les
 *   patrouilles du secteur (« En patrouille »), qui ne font pas partie du stock.
 * Une unité prête s'envoie : la fiche du poste s'ouvre, sa ligne « Envoyer … » surlignée (Entrée, ou « Donner
 * l'ordre », puis on montre où). Une unité partie ouvre sa fiche (« Rentrer au commissariat » y est). Sans droit
 * d'engager (lecture seule, chef de groupe, renforts fixés), la liste ne fait que renseigner.
 * Rangées de 44 px au moins (48 px au doigt) ; clavier : ↑↓ / chiffres / Entrée de la feuille (tacticalScreen.ts).
 * Le DOM n'est reconstruit que lorsque la structure change (sites dépliés, unités, actions) ; les textes sont mis à
 * jour sur place (compte à rebours du repos, distances). Attributs data-id pour les scénarios du navigateur.
 * ===================================================================================== */

import type { PatrolsApi } from '@/gameplay/patrols/api';
import { commissariatById } from '@/world/commissariats';
import { iconMarkup } from '../core/icons';
import { el, setText } from '../maps/icons';
import { commissariatIconUrl } from '../maps/symbols';
import type { Repere } from './cardTypes';
import { buildRows } from './commissariatsModel';
import type { StationListRow, TravelFn } from './commissariatsModel';
import type { CommandCore } from './core';
import type { MoreSectionApi, MoreSectionView } from './panelMore';
import { cardEnvFromCore, unitRepere } from './reperes';

/** Note sous le titre quand le joueur ne peut pas engager. */
export function dispatchNote(core: CommandCore): string {
  const api = core.commissariats;
  if (!api || api.canDispatch) return '';
  if (core.scope().level !== 'tout') return 'Seul le commandant engage les moyens des commissariats.';
  const cfg = core.ctx.session.config;
  if (cfg && cfg.extra && cfg.extra['renforts'] === false) return 'Moyens fixés par l’ordre d’opération.';
  return 'Renforts indisponibles pour l’instant.';
}

/** Lignes de la liste, lues dans la partie (distances depuis le joueur ; sans joueur, dans l'ordre des données). */
export function commissariatRows(core: CommandCore, travel: TravelFn): StationListRow[] {
  const api = core.commissariats;
  if (!api) return [];
  const ctx = core.ctx;
  const me = core.player();
  const patrols = ctx.service<PatrolsApi>('police.patrols');
  return buildRows(api.list, {
    now: ctx.clock.now,
    ref: me ? { x: me.x, z: me.z } : null,
    travel,
    streetOf: (id) => commissariatById(id)?.street ?? '',
    canDispatch: api.canDispatch,
    commandable: (id) => core.canCommand(id),
    patrol: (id) => {
      const s = ctx.squads.get(id);
      const p = patrols && typeof patrols.statusOf === 'function' ? patrols.statusOf(id) : null;
      if (!s) return null;
      return { name: s.name, status: p ? (p.state === 'patrouille' ? 'En patrouille' : p.label) : 'En patrouille' };
    },
  });
}

interface UnitEls { state: HTMLElement }
interface SiteEls { sub: HTMLElement; units: Map<string, UnitEls> }

class CommissariatsPanel implements MoreSectionView {
  readonly root: HTMLDivElement;
  private readonly note: HTMLDivElement;
  private readonly list: HTMLDivElement;
  /** Site déplié ('' : aucun). */
  private openId = '';
  /** Site à faire défiler jusqu'à la vue au prochain rendu. */
  private scrollId = '';
  private sig = '';
  private readonly els = new Map<string, SiteEls>();

  constructor(private readonly core: CommandCore, host: HTMLElement, private readonly api: MoreSectionApi, private readonly travel: TravelFn) {
    this.root = el('div', 'cpc');
    this.root.dataset.id = 'tac-commissariats';
    this.note = el('div', 'cp-empty cpc-note');
    this.list = el('div', 'cp-list ct-scroll cpc-list');
    this.root.append(this.note, this.list);
    host.appendChild(this.root);
  }

  /** « commissariats:9e » : la liste s'ouvre dépliée sur ce poste. */
  open(arg: string): void {
    this.openId = arg;
    this.scrollId = arg;
    this.sig = '';
  }

  refresh(force: boolean): void {
    const rows = commissariatRows(this.core, this.travel);
    setText(this.note, dispatchNote(this.core));
    this.note.style.display = this.note.textContent ? '' : 'none';
    if (this.openId === '' && rows.length > 0 && force && this.sig === '') this.openId = rows[0]!.id;
    const sig = this.signature(rows);
    if (force || sig !== this.sig) {
      this.sig = sig;
      this.build(rows);
    } else this.update(rows);
    if (this.scrollId !== '') {
      const b = this.list.querySelector<HTMLElement>(`[data-id="cpc-site-${CSS.escape(this.scrollId)}"]`);
      b?.scrollIntoView?.({ block: 'start' });
      this.scrollId = '';
    }
  }

  private signature(rows: readonly StationListRow[]): string {
    return this.openId + '#' + rows.map((r) => r.id + (r.id === this.openId
      ? ':' + r.units.map((u) => `${u.key}/${u.state}/${u.action}`).join(',') + ';' + r.patrols.map((p) => p.squadId).join(',')
      : '')).join('|');
  }

  private build(rows: readonly StationListRow[]): void {
    this.list.textContent = '';
    this.els.clear();
    rows.forEach((r, i) => {
      const open = r.id === this.openId;
      const site = this.row('cp-row cpc-site', `cpc-site-${r.id}`, () => this.toggle(r.id));
      site.dataset.n = String(i + 1);
      site.setAttribute('aria-expanded', open ? 'true' : 'false');
      site.appendChild(el('span', 'cp-n', String(i + 1)));
      const ic = el('span', 'cp-ic cpc-glyph');
      const def = commissariatById(r.id);
      const url = commissariatIconUrl(def ? def.kind : 'commissariat');
      if (url !== '') {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.width = 22;
        img.height = 22;
        ic.appendChild(img);
      }
      const main = el('span', 'cp-main');
      main.appendChild(el('b', 'cp-t', r.title));
      const sub = el('small', 'cp-s', r.sub);
      main.appendChild(sub);
      const chev = el('span', 'cpc-chev');
      chev.innerHTML = iconMarkup(open ? 'chevron_down' : 'chevron_right', 'cp-svg');
      site.append(ic, main, chev);
      this.list.appendChild(site);
      const units = new Map<string, UnitEls>();
      this.els.set(r.id, { sub, units });
      if (!open) return;
      const box = el('div', 'cpc-units');
      for (const u of r.units) {
        const b = this.row(`cp-row cpc-unit is-${u.state}`, `cpc-unit-${u.key}`, () => this.choose(r.id, u.entryId, u.squadId, u.action));
        if (u.action === 'aucune') b.disabled = true;
        const uic = el('span', 'cp-ic');
        uic.innerHTML = iconMarkup(u.icon, 'cp-svg');
        const m = el('span', 'cp-main');
        m.appendChild(el('b', 'cp-t', `${u.name} · ${u.what}`));
        const st = el('small', 'cp-s cpc-state', u.stateText);
        m.appendChild(st);
        b.append(uic, m);
        if (u.action !== 'aucune') b.appendChild(el('span', 'cpc-act', u.action === 'envoyer' ? 'Envoyer…' : 'Sa fiche'));
        box.appendChild(b);
        units.set(u.key, { state: st });
      }
      if (r.patrols.length > 0) {
        box.appendChild(el('div', 'cp-cap', 'En patrouille dans le secteur (hors réserve)'));
        for (const p of r.patrols) {
          const b = this.row('cp-row cpc-unit cpc-patrol', `cpc-patrol-${p.squadId}`, () => this.choose(r.id, 0, p.squadId, 'fiche'));
          const uic = el('span', 'cp-ic');
          uic.innerHTML = iconMarkup('car', 'cp-svg');
          const m = el('span', 'cp-main');
          m.appendChild(el('b', 'cp-t', p.name));
          const st = el('small', 'cp-s cpc-state', p.status);
          m.appendChild(st);
          b.append(uic, m, el('span', 'cpc-act', 'Sa fiche'));
          box.appendChild(b);
          units.set('p' + p.squadId, { state: st });
        }
      }
      this.list.appendChild(box);
    });
  }

  /** Textes mis à jour sur place (distances, comptes à rebours). */
  private update(rows: readonly StationListRow[]): void {
    for (const r of rows) {
      const e = this.els.get(r.id);
      if (!e) continue;
      setText(e.sub, r.sub);
      for (const u of r.units) {
        const ue = e.units.get(u.key);
        if (ue) setText(ue.state, u.stateText);
      }
      for (const p of r.patrols) {
        const ue = e.units.get('p' + p.squadId);
        if (ue) setText(ue.state, p.status);
      }
    }
  }

  private row(className: string, id: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.className = className;
    b.dataset.id = id;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private toggle(id: string): void {
    this.openId = this.openId === id ? '' : id;
    this.sig = '';
    this.refresh(false);
  }

  /** Une unité choisie : l'envoyer (fiche du poste, sa ligne surlignée), ou sa fiche. */
  private choose(stationId: string, entryId: number, squadId: number, action: 'envoyer' | 'fiche' | 'aucune'): void {
    const api = this.core.commissariats;
    const view = api?.get(stationId);
    if (action === 'envoyer' && view) {
      const r: Repere = {
        kind: 'commissariat', key: `commissariat:${stationId}#${entryId}`, x: view.x, z: view.z, stationId, entryId,
        name: view.name.split(' — ')[0]!,
      };
      this.api.pick(r);
      return;
    }
    if (action === 'fiche' && squadId > 0) {
      const env = cardEnvFromCore(this.core);
      const u = env.units.find((q) => q.squadId === squadId);
      if (u) this.api.pick(unitRepere(u));
      else this.core.ctx.ui.notify('Cette unité n’est pas visible sur la carte.', 'info', 3);
    }
  }

  dispose(): void {
    this.root.remove();
    this.els.clear();
  }
}

/** Monte la liste dans la section « Commissariats » de « Plus… ». */
export function mountCommissariatsPanel(host: HTMLElement, core: CommandCore, api: MoreSectionApi, travel: TravelFn): MoreSectionView {
  return new CommissariatsPanel(core, host, api, travel);
}
