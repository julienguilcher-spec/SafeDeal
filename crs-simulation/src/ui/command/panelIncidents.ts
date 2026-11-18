/* =====================================================================================
 * Carte de commandement — « Plus… › Tous les incidents et secours » : manifestations en cours, appel des secours et
 * suivi de leur arrivée, liste des incidents triée par urgence, délégation par menu (unité, canon à eau, Centaure,
 * BRAV-M, pompiers, SAMU) ou par glisser-déposer d'une ligne sur une unité de la carte (geste expert). Le contenu est
 * celui de l'ancien onglet « Incidents » ; il est monté par « Plus… » (panelMore.ts). Ses boutons ont tabindex −1 : la
 * carte garde le focus du clavier (§2.0), les flèches et les chiffres de l'écran les parcourent.
 * ===================================================================================== */

import type { Incident, IncidentMeans, RescueCall, RescueKind } from '@/core/extensions';
import { button, el, setClass, setText } from '../maps/icons';
import type { MapCanvas } from '../maps/mapCanvas';
import { INCIDENT_COLORS, INCIDENT_GLYPHS, drawIncidentGlyph, manifColor, manifPhaseLabel } from '../maps/overlay';
import type { MapUnit, UnitSymbol } from '../maps/units';
import type { CommandCore } from './core';
import {
  INCIDENT_KIND_LABELS, MEANS_ADVICE, MEANS_FOR, MEANS_LABELS, STATE_LABELS, URGENCY_LABELS, ageLabel, sortIncidents,
} from './incidents';
import { rescueRequest } from './phrases';
import type { TacticalMap } from './tacticalMap';
import type { TacticalState } from './tacticalState';

const GLYPH_URLS = new Map<string, string>();

/** Image du pictogramme d'un incident, dans la couleur de son urgence. */
export function incidentIconUrl(inc: Incident): string {
  const glyph = INCIDENT_GLYPHS[inc.kind] ?? 'suspect';
  const color = INCIDENT_COLORS[inc.urgency] ?? INCIDENT_COLORS[1];
  const key = glyph + color;
  let url = GLYPH_URLS.get(key);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = 44;
    c.height = 44;
    const g = c.getContext('2d');
    if (g) {
      g.translate(22, 22);
      g.scale(2, 2);
      drawIncidentGlyph(g, glyph, 11, color);
    }
    url = c.toDataURL();
    GLYPH_URLS.set(key, url);
  }
  return url;
}

const CALL_STATES: Readonly<Record<RescueCall['state'], string>> = {
  demande: 'Demande transmise', en_route: 'En route', en_attente: 'En attente', sur_place: 'Sur place', reparti: 'Reparti', annule: 'Annulé',
};

const MEANS_SYMBOL: Partial<Record<IncidentMeans, UnitSymbol>> = {
  canon_eau: 'canon_eau', centaure: 'centaure', bravm: 'bravm', pompiers: 'pompiers', samu: 'samu',
};

interface Row { id: number; root: HTMLDivElement; sub: HTMLElement; sev: HTMLElement }

export interface IncidentsPanelOptions {
  /**
   * Un geste sur la carte est attendu (« Appeler les pompiers » : désigner le lieu) : la feuille qui couvre la carte
   * doit se refermer (téléphone).
   */
  onArmMap?(): void;
}

/** Boutons d'un panneau hors du parcours du focus (la carte garde le focus du clavier). */
function untab(root: HTMLElement): void {
  root.querySelectorAll('button').forEach((b) => {
    if (b.tabIndex !== -1) b.tabIndex = -1;
  });
}

export class IncidentsPanel {
  readonly root: HTMLDivElement;
  /** Nombre d'incidents non traités (pastille de l'onglet). */
  openCount = 0;
  /** Manifestations en cours (la principale et les manifestations simultanées). */
  private readonly manifsBox: HTMLDivElement;
  private readonly manifsList: HTMLDivElement;
  private manifsSig = '';
  private readonly callsBox: HTMLDivElement;
  private readonly callsList: HTMLDivElement;
  private readonly listBox: HTMLDivElement;
  private readonly ghost: HTMLDivElement;
  private readonly sorted: Incident[] = [];
  private rows: Row[] = [];
  private signature = '';
  private callsSig = '';
  private dragId = 0;
  private dragging = false;
  private dragX = 0;
  private dragY = 0;
  private suppressClick = false;

  constructor(
    private readonly core: CommandCore, private readonly state: TacticalState, private readonly map: MapCanvas,
    private readonly tmap: TacticalMap, host: HTMLElement, private readonly opts: IncidentsPanelOptions = {},
  ) {
    this.root = el('div', 'ct-pane ct-scroll');
    this.root.dataset.id = 'tac-incidents';
    this.manifsBox = el('div', 'ct-sec');
    this.manifsBox.dataset.id = 'tac-manifs';
    const mh = el('div', 'ct-sec-h');
    mh.appendChild(el('div', 'cm-sub', 'Manifestations'));
    this.manifsList = el('div');
    this.manifsBox.append(mh, this.manifsList);
    this.manifsBox.style.display = 'none';
    this.callsBox = el('div', 'ct-sec');
    const h = el('div', 'ct-sec-h');
    h.appendChild(el('div', 'cm-sub', 'Secours'));
    const row = el('div', 'ct-btnrow');
    row.append(
      button('Appeler les pompiers', () => this.startCall('pompiers'), { icon: 'fire', className: 'is-small', id: 'tac-call-pompiers' }),
      button('Appeler le SAMU', () => this.startCall('samu'), { icon: 'cross', className: 'is-small', id: 'tac-call-samu' }),
    );
    this.callsList = el('div');
    this.callsBox.append(h, row, this.callsList);
    this.listBox = el('div');
    this.root.append(this.manifsBox, this.callsBox, this.listBox);
    untab(this.root);
    host.appendChild(this.root);
    this.ghost = el('div', 'ct-ghost');
    document.body.appendChild(this.ghost);
  }

  private startCall(kind: RescueKind): void {
    const st = this.state;
    if (st.mode.kind === 'rescue' && st.mode.rescue === kind) st.setMode({ kind: 'idle' });
    else {
      st.setMode({ kind: 'rescue', rescue: kind, incidentId: 0 });
      this.core.ctx.ui.notify(`${kind === 'pompiers' ? 'Pompiers' : 'SAMU'}\u00a0: cliquez ou touchez le lieu sur la carte (au clavier\u00a0: intention Secours, touche S).`, 'info', 4);
      this.opts.onArmMap?.();
    }
  }

  // ───────────────────────────── délégation ─────────────────────────────

  /** Unité la plus proche de l'incident parmi celles qui portent ce symbole (ou, sans symbole, les unités à pied commandées). */
  private nearestUnit(inc: Incident, symbol: UnitSymbol | null): MapUnit | null {
    const units = this.core.maps.scene.units;
    let best: MapUnit | null = null;
    let bestD = Infinity;
    for (let i = 0; i < units.length; i++) {
      const u = units[i]!;
      if (u.squadId === 0 || u.childCount > 0 || u.total === 0) continue;
      if (symbol ? u.symbol !== symbol : !(u.symbol === 'groupe' || u.symbol === 'section' || u.symbol === 'binome')) continue;
      if (!this.tmap.canReceive(u)) continue;
      const d = Math.hypot(u.x - inc.x, u.z - inc.z);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private delegate(inc: Incident, means: IncidentMeans): void {
    const core = this.core;
    const ctx = core.ctx;
    const api = core.incidents;
    if (!api) return;
    if (means === 'unite') {
      const sel = this.tmap.selectedUnits();
      let unit: MapUnit | null = null;
      let bestD = Infinity;
      for (let i = 0; i < sel.length; i++) {
        const d = Math.hypot(sel[i]!.x - inc.x, sel[i]!.z - inc.z);
        if (d < bestD && this.tmap.canReceive(sel[i]!)) {
          bestD = d;
          unit = sel[i]!;
        }
      }
      unit = unit ?? this.nearestUnit(inc, null);
      if (!unit) {
        ctx.ui.notify('Aucune unité disponible sous vos ordres.', 'warn', 3);
        return;
      }
      this.tmap.assignToUnit(inc.id, unit);
      return;
    }
    const symbol = MEANS_SYMBOL[means] ?? null;
    const unit = symbol ? this.nearestUnit(inc, symbol) : null;
    if (means === 'pompiers' || means === 'samu') {
      const ok = api.assign(inc.id, means, unit ? unit.squadId : 0);
      const rescue = core.rescue;
      let called = false;
      if (rescue && !unit) {
        // secours pas sur place : on les demande, sauf si un appel est déjà en cours pour cet incident
        let pending = false;
        for (let i = 0; i < rescue.calls.length; i++) {
          const c = rescue.calls[i]!;
          if (c.kind === means && c.incidentId === inc.id && c.state !== 'reparti' && c.state !== 'annule') pending = true;
        }
        if (!pending) {
          const call = rescue.request(means, inc.x, inc.z, ctx.player.state.personId, inc.id);
          called = true;
          const eta = Math.max(0, Math.round(call.eta));
          ctx.ui.notify(`${MEANS_LABELS[means]} demandés pour «\u00a0${inc.label}\u00a0» — environ ${Math.max(1, Math.round(eta / 60))}\u00a0min`, 'ok', 4);
          ctx.radio.say({
            channel: 'secours', from: core.callsign(), priority: 2, personId: ctx.player.state.personId,
            text: rescueRequest(core.callsign(), ctx.world.sectorName(inc.x, inc.z), means),
          });
        }
      }
      if (!ok && !called && !rescue) ctx.ui.notify(`${MEANS_LABELS[means]} indisponibles pour cette mission.`, 'warn', 4);
      else if (ok && !called) ctx.ui.notify(`${inc.label} — confié aux ${means === 'pompiers' ? 'pompiers' : 'équipes du SAMU'}`, 'ok', 3);
      this.state.touch();
      return;
    }
    if (!unit) {
      ctx.ui.notify(`${MEANS_LABELS[means]}\u00a0: aucun moyen de ce type sous vos ordres.`, 'warn', 4);
      return;
    }
    this.tmap.assignToUnit(inc.id, unit);
  }

  private assigneeText(inc: Incident): string {
    const squad = inc.squadId !== 0 ? this.core.ctx.squads.get(inc.squadId) : undefined;
    const who = squad ? squad.name : MEANS_LABELS[inc.means] ?? '';
    const age = ageLabel(this.core.ctx.clock.now - inc.createdAt);
    if (inc.state === 'ouvert') return `${STATE_LABELS.ouvert} · depuis ${age}`;
    if (inc.state === 'en_cours') return `En cours — ${Math.round(inc.progress * 100)} %${who ? ' · ' + who : ''}`;
    return `${STATE_LABELS[inc.state] ?? ''}${who ? ' à ' + who : ''}`;
  }

  // ───────────────────────────── liste ─────────────────────────────

  private build(): void {
    const box = this.listBox;
    box.textContent = '';
    this.rows = [];
    const canDelegate = this.core.scope().canDelegate;
    if (this.sorted.length === 0) {
      box.appendChild(el('div', 'ct-empty', 'Aucun incident en cours. Les feux, blessés, pillages et barricades signalés apparaîtront ici, les plus urgents en tête.'));
      return;
    }
    for (let i = 0; i < this.sorted.length; i++) {
      const inc = this.sorted[i]!;
      const color = INCIDENT_COLORS[inc.urgency] ?? INCIDENT_COLORS[1];
      const root = el('div', 'ct-inc' + (inc.id === this.state.focusIncident ? ' is-sel' : ''));
      root.style.setProperty('--u', color);
      root.dataset.incident = String(inc.id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ct-inc-row';
      row.dataset.id = 'incident-' + inc.id;
      const ico = el('span', 'ct-inc-ico');
      const img = document.createElement('img');
      img.alt = '';
      img.width = 22;
      img.height = 22;
      img.src = incidentIconUrl(inc);
      img.draggable = false;
      ico.appendChild(img);
      const main = el('span', 'ct-inc-main');
      const sub = el('small');
      main.append(el('b', undefined, inc.label || INCIDENT_KIND_LABELS[inc.kind]), sub);
      row.append(ico, main, el('span', 'ct-inc-urg', URGENCY_LABELS[inc.urgency] ?? ''));
      const sev = el('i', 'ct-inc-sev');
      root.append(row, sev);
      row.addEventListener('click', () => {
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        this.state.focusIncident = this.state.focusIncident === inc.id ? 0 : inc.id;
        this.state.touch();
        if (this.state.focusIncident !== 0 && !this.map.view.contains(inc.x, inc.z, -40)) this.map.flyTo(inc.x, inc.z);
      });
      if (canDelegate) this.bindDrag(row, inc);

      if (inc.id === this.state.focusIncident) {
        const more = el('div', 'ct-inc-more');
        more.appendChild(el('div', 'ct-note', MEANS_ADVICE[inc.kind] ?? ''));
        if (canDelegate) {
          const means = el('div', 'ct-means');
          const list = MEANS_FOR[inc.kind] ?? ['unite'];
          const sel = this.tmap.selectedUnits();
          for (let k = 0; k < list.length; k++) {
            const m = list[k]!;
            let label = MEANS_LABELS[m];
            if (m === 'unite') label = sel.length === 1 ? `Confier à ${sel[0]!.name}` : sel.length > 1 ? 'Confier à la sélection' : 'Unité la plus proche';
            const b = button(label, () => this.delegate(inc, m), { className: 'is-small' + (k === 0 ? ' is-primary' : ''), id: `delegate-${inc.id}-${m}` });
            means.appendChild(b);
          }
          more.appendChild(means);
          const tools = el('div', 'ct-means');
          tools.appendChild(button('Localiser', () => this.map.flyTo(inc.x, inc.z, Math.min(this.map.view.mpp, 1.2)), { icon: 'locate', className: 'is-small is-ghost' }));
          if (inc.state !== 'ouvert') {
            tools.appendChild(button('Retirer l’affectation', () => {
              this.core.incidents?.unassign(inc.id);
              this.state.touch();
            }, { className: 'is-small is-ghost', id: `unassign-${inc.id}` }));
          }
          more.appendChild(tools);
        }
        root.appendChild(more);
      }
      box.appendChild(root);
      this.rows.push({ id: inc.id, root, sub, sev });
    }
    untab(box);
  }

  private bindDrag(row: HTMLElement, inc: Incident): void {
    row.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragId = inc.id;
      this.dragging = false;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
    });
    row.addEventListener('pointermove', (e) => {
      if (this.dragId !== inc.id) return;
      if (!this.dragging) {
        const dx = e.clientX - this.dragX;
        const dy = e.clientY - this.dragY;
        const start = e.pointerType === 'mouse' ? Math.hypot(dx, dy) > 8 : Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2;
        if (!start) return;
        this.dragging = true;
        try { row.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
        this.ghost.textContent = '';
        const img = document.createElement('img');
        img.width = 20;
        img.height = 20;
        img.src = incidentIconUrl(inc);
        img.style.background = '#111a2e';
        img.style.borderRadius = '50%';
        this.ghost.append(img, document.createTextNode(inc.label));
        this.ghost.classList.add('is-on');
        this.state.focusIncident = inc.id;
        this.state.touch();
      }
      this.ghost.style.transform = `translate3d(${e.clientX + 12}px,${e.clientY + 10}px,0)`;
      const key = this.dropTarget(e.clientX, e.clientY);
      if (key !== this.state.dropKey) {
        this.state.dropKey = key;
        this.state.touch();
      }
      e.preventDefault();
    });
    const end = (e: PointerEvent, cancelled: boolean): void => {
      if (this.dragId !== inc.id) return;
      this.dragId = 0;
      if (!this.dragging) return;
      this.dragging = false;
      this.suppressClick = true;
      this.ghost.classList.remove('is-on');
      const key = cancelled ? 0 : this.dropTarget(e.clientX, e.clientY);
      this.state.dropKey = 0;
      this.state.touch();
      const u = key !== 0 ? this.core.maps.scene.unitModel.get(key) : undefined;
      if (u) this.tmap.assignToUnit(inc.id, u);
      window.setTimeout(() => { this.suppressClick = false; }, 0);
    };
    row.addEventListener('pointerup', (e) => end(e, false));
    row.addEventListener('pointercancel', (e) => end(e, true));
  }

  /** Clé de l'unité sous le pointeur (sur la carte ou dans l'arborescence) qui peut recevoir l'incident, sinon 0. */
  private dropTarget(clientX: number, clientY: number): number {
    const target = document.elementFromPoint(clientX, clientY);
    if (!target) return 0;
    const model = this.core.maps.scene.unitModel;
    const rowEl = (target as HTMLElement).closest ? (target as HTMLElement).closest('.ct-unit') as HTMLElement | null : null;
    if (rowEl && rowEl.dataset.key) {
      const u = model.get(Number(rowEl.dataset.key));
      return u && this.tmap.canReceive(u) ? u.key : 0;
    }
    if (target === this.map.canvas) {
      const r = this.map.canvas.getBoundingClientRect();
      const u = this.tmap.pickUnit(clientX - r.left, clientY - r.top, 30);
      return u && this.tmap.canReceive(u) ? u.key : 0;
    }
    return 0;
  }

  // ───────────────────────────── rafraîchissement ─────────────────────────────

  private refreshCalls(): void {
    const core = this.core;
    const rescue = core.rescue;
    const can = core.scope().canDelegate && rescue !== undefined;
    this.callsBox.style.display = can || (rescue !== undefined && core.maps.scene.calls.length > 0) ? '' : 'none';
    const btnRow = this.callsBox.children[1] as HTMLElement;
    btnRow.style.display = can ? '' : 'none';
    const mode = this.state.mode;
    setClass(btnRow.children[0] as HTMLElement, 'is-on', mode.kind === 'rescue' && mode.rescue === 'pompiers');
    setClass(btnRow.children[1] as HTMLElement, 'is-on', mode.kind === 'rescue' && mode.rescue === 'samu');
    const calls = core.maps.scene.calls;
    let sig = '';
    for (let i = 0; i < calls.length; i++) sig += calls[i]!.id + ':' + calls[i]!.state + ',';
    if (sig !== this.callsSig) {
      this.callsSig = sig;
      this.callsList.textContent = '';
      for (let i = 0; i < calls.length; i++) {
        const c = calls[i]!;
        const row = el('div', 'ct-call');
        row.dataset.call = String(c.id);
        row.append(el('b', undefined, c.kind === 'pompiers' ? 'Pompiers' : 'SAMU'), el('span'), el('strong'));
        if (can) {
          row.appendChild(button('', () => {
            rescue!.cancel(c.id);
            this.state.touch();
          }, { icon: 'close', className: 'is-icon is-small is-ghost', title: 'Annuler la demande' }));
        }
        this.callsList.appendChild(row);
      }
      untab(this.callsList);
    }
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i]!;
      const row = this.callsList.children[i] as HTMLElement | undefined;
      if (!row) continue;
      const reason = c.state === 'en_attente' && c.waitingReason ? `\u00a0: ${c.waitingReason}` : '';
      setText(row.children[1] as HTMLElement, `${CALL_STATES[c.state] ?? ''}${reason}`);
      const s = Math.max(0, Math.round(c.eta));
      setText(row.children[2] as HTMLElement, c.state === 'sur_place' ? '' : `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`);
    }
  }

  /** Liste des manifestations : la principale (directeur de foule) puis les manifestations simultanées. */
  private refreshManifs(): void {
    const ctx = this.core.ctx;
    const scene = this.core.maps.scene;
    const rows: { key: string; title: string; sub: string; color: string; x: number; z: number }[] = [];
    const d = ctx.director;
    if (scene.manifs.length > 0 && d.phase !== 'aucune' && d.phase !== 'terminee') {
      const cause = ctx.service<{ readonly cause: { readonly label: string } }>('crowd.core')?.cause.label ?? '';
      const r = d.route;
      rows.push({
        key: 'm1', title: `Manifestation principale${cause !== '' ? ' — ' + cause.toLowerCase() : ''}`,
        sub: `${manifPhaseLabel(d.phase).toLowerCase()} · ${d.stats.present} pers.`, color: '#ffd60a',
        x: scene.hasHead ? scene.headX : r.length >= 2 ? r[0]! : 0, z: scene.hasHead ? scene.headZ : r.length >= 2 ? r[1]! : 0,
      });
    }
    for (const m of scene.manifs) {
      rows.push({
        key: 'm' + m.id, title: m.label,
        sub: `${manifPhaseLabel(m.phase, m.enclosed, m.kettled).toLowerCase()} · ${m.people} pers.${m.detours > 0 ? ' · ' + m.detours + ' détour' + (m.detours > 1 ? 's' : '') : ''}${m.company !== '' ? ' · ' + m.company : ''}`,
        color: manifColor(m.id), x: m.headX, z: m.headZ,
      });
    }
    this.manifsBox.style.display = scene.manifs.length > 0 ? '' : 'none';
    let sig = '';
    for (const r of rows) sig += r.key + ':' + r.title + ',';
    if (sig !== this.manifsSig) {
      this.manifsSig = sig;
      this.manifsList.textContent = '';
      for (const r of rows) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'ct-inc-row';
        row.dataset.id = 'manif-' + r.key;
        const dot = el('span', 'ct-inc-ico');
        dot.style.background = r.color;
        dot.style.borderRadius = '50%';
        dot.style.width = '12px';
        dot.style.height = '12px';
        dot.style.flex = '0 0 12px';
        const main = el('span', 'ct-inc-main');
        main.append(el('b', undefined, r.title), el('small'));
        row.append(dot, main);
        const pos = { x: r.x, z: r.z };
        (row as HTMLButtonElement & { pos?: { x: number; z: number } }).pos = pos;
        row.addEventListener('click', () => this.map.flyTo(pos.x, pos.z));
        this.manifsList.appendChild(row);
      }
      untab(this.manifsList);
    }
    for (let i = 0; i < rows.length; i++) {
      const row = this.manifsList.children[i] as (HTMLElement & { pos?: { x: number; z: number } }) | undefined;
      if (!row) continue;
      if (row.pos) {
        row.pos.x = rows[i]!.x;
        row.pos.z = rows[i]!.z;
      }
      const sub = row.querySelector('small');
      if (sub) setText(sub as HTMLElement, rows[i]!.sub);
    }
  }

  refresh(): void {
    this.refreshManifs();
    const api = this.core.incidents;
    sortIncidents(this.core.maps.scene.incidents, this.sorted);
    let open = 0;
    let sig = this.state.focusIncident + '|' + this.state.selection.size + '|' + (this.core.scope().canDelegate ? 1 : 0) + '|';
    for (let i = 0; i < this.sorted.length; i++) {
      const inc = this.sorted[i]!;
      if (inc.state === 'ouvert') open++;
      sig += `${inc.id}:${inc.state}:${inc.urgency}:${inc.means}:${inc.squadId},`;
    }
    this.openCount = open;
    this.refreshCalls();
    if (!api) {
      if (this.signature !== 'none') {
        this.signature = 'none';
        this.listBox.textContent = '';
        this.listBox.appendChild(el('div', 'ct-empty', 'Le suivi des incidents n’est pas disponible pour cette mission.'));
      }
      return;
    }
    if (sig !== this.signature && !this.dragging) {
      this.signature = sig;
      this.build();
    }
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i]!;
      const inc = api.get(row.id);
      if (!inc) continue;
      setText(row.sub, this.assigneeText(inc));
      const v = (Math.round(Math.max(0, Math.min(1, inc.severity)) * 50) / 50).toString();
      if (row.sev.style.getPropertyValue('--v') !== v) row.sev.style.setProperty('--v', v);
    }
  }

  dispose(): void {
    this.ghost.remove();
  }
}
