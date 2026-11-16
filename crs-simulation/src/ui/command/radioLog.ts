/* =====================================================================================
 * Journal radio (ctx.radio.log) filtré selon les canaux que le rôle du joueur peut entendre.
 * Les messages sont ajoutés au fil de l'eau ; rien n'est reconstruit tant que le journal ne fait
 * que s'allonger. Utilisé par la carte tactique (onglet « Journal ») et par le panneau radio.
 * ===================================================================================== */

import type { RadioChannel, RadioMessage } from '@/core/contracts';
import { el } from '../maps/icons';
import type { CommandCore } from './core';
import { logTime } from './phrases';

export const CHANNEL_LABELS: Readonly<Record<RadioChannel, string>> = {
  commandement: 'Commandement', unite: 'Unité', secours: 'Secours', presse: 'Presse', public: 'Public',
};

const MAX_SHOWN = 120;

export class RadioLogView {
  readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly empty: HTMLDivElement;
  private shown = 0;
  private first: (RadioMessage & { t: number }) | undefined;
  private channelsKey = '';
  /** Canal affiché seul (null = tous les canaux audibles). */
  filter: RadioChannel | null = null;
  private filterKey = '';
  /** Trafic des autres unités replié (joueur exécutant : filtre d'écoute de la radio). */
  private readonly hiddenRow: HTMLDivElement;
  private hidden = 0;

  constructor(private readonly core: CommandCore, host: HTMLElement, className = 'ct-pane ct-scroll') {
    this.root = el('div', className);
    this.root.dataset.id = 'radio-log';
    this.list = el('div', 'ct-log');
    this.empty = el('div', 'ct-empty', 'Aucun message pour l’instant. Les ordres donnés et les comptes rendus des unités s’inscrivent ici, horodatés.');
    this.hiddenRow = el('div', 'ct-empty', '');
    this.hiddenRow.dataset.id = 'radio-hidden';
    this.hiddenRow.style.opacity = '0.6';
    this.hiddenRow.style.display = 'none';
    this.root.append(this.empty, this.hiddenRow, this.list);
    host.appendChild(this.root);
  }

  refresh(): void {
    const log = this.core.ctx.radio.log;
    const channels = this.core.maps.scene.vis.radio;
    const key = channels.join(',');
    const fkey = this.filter ?? '';
    // journal vidé, tronqué par le début, changement de rôle ou de filtre : on repart de zéro
    if (log.length < this.shown || log[0] !== this.first || key !== this.channelsKey || fkey !== this.filterKey) {
      this.list.textContent = '';
      this.shown = 0;
      this.hidden = 0;
      this.first = log[0];
      this.channelsKey = key;
      this.filterKey = fkey;
    }
    if (this.shown === log.length) {
      this.empty.style.display = this.list.childElementCount === 0 ? '' : 'none';
      return;
    }
    const stick = this.root.scrollHeight - this.root.scrollTop - this.root.clientHeight < 40;
    const me = this.core.ctx.player.state.personId;
    const listen = this.core.ctx.service<{ muted?(msg: RadioMessage): boolean }>('radio.control');
    for (let i = this.shown; i < log.length; i++) {
      const m = log[i]!;
      if (channels.indexOf(m.channel) < 0) continue;
      if (this.filter && m.channel !== this.filter) continue;
      if (listen && listen.muted && listen.muted(m)) {
        this.hidden++;
        continue;
      }
      const row = el('div', 'ct-msg p' + m.priority + (m.personId !== undefined && m.personId === me && me !== 0 ? ' is-me' : ''));
      const head = el('div', 'ct-msg-h');
      head.append(el('span', undefined, logTime(m.t)), el('b', undefined, m.from), el('i', 'c-' + m.channel, CHANNEL_LABELS[m.channel] ?? m.channel));
      const p = el('p', undefined, m.text);
      row.append(head, p);
      this.list.appendChild(row);
    }
    this.shown = log.length;
    this.hiddenRow.textContent = this.hidden > 0 ? `Trafic radio des autres unités masqué (${this.hidden})` : '';
    this.hiddenRow.style.display = this.hidden > 0 ? '' : 'none';
    while (this.list.childElementCount > MAX_SHOWN && this.list.firstChild) this.list.removeChild(this.list.firstChild);
    this.empty.style.display = this.list.childElementCount === 0 ? '' : 'none';
    if (stick) this.root.scrollTop = this.root.scrollHeight;
  }
}
