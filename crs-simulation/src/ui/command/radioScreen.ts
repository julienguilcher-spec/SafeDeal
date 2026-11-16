/* =====================================================================================
 * Écran « radio » : journal des messages (ctx.radio.log) et messages rapides par canal — compte
 * rendu de situation, demande de renfort, demande d'autorisation d'emploi de la force, demande de
 * secours — émis par ctx.radio.say avec la phraséologie d'usage.
 * ===================================================================================== */

import type { InputState, Person, RadioChannel } from '@/core/contracts';
import type { RescueKind, ScreenInstance } from '@/core/extensions';
import { button, el, setClass } from '../maps/icons';
import type { IconName } from '../maps/icons';
import { coarsePointer } from '../maps/style';
import { isPoliceRole } from '../maps/visibility';
import type { CommandCore } from './core';
import { forceRequest, radioFrame, reinforcementRequest, rescueRequest, situationReport } from './phrases';
import { CHANNEL_LABELS, RadioLogView } from './radioLog';
import { ensureCommandStyle } from './style';

export const RADIO_SCREEN = 'radio';

/** Délai entre deux messages rapides (s) : un seul locuteur à la fois sur le canal. */
const COOLDOWN = 2;

export class RadioScreen implements ScreenInstance {
  readonly root: HTMLDivElement;
  private readonly log: RadioLogView;
  private readonly quickBtns: HTMLButtonElement[] = [];
  private readonly chanBtns: { channel: RadioChannel | null; b: HTMLButtonElement }[] = [];
  private readonly focus: { dispose(): void };
  private cooldown = 0;
  private lastRefresh = -1;
  private readonly found: Person[] = [];

  constructor(private readonly core: CommandCore, host: HTMLElement) {
    ensureCommandStyle();
    const ctx = core.ctx;
    this.root = el('div', 'cm-root cm-panel cr' + (coarsePointer() ? ' cm-coarse' : ''));
    this.root.dataset.id = 'radio';
    host.appendChild(this.root);
    core.maps.scene.ensureFresh();

    const head = el('div', 'cr-head');
    head.appendChild(el('div', 'cm-title', 'Radio'));
    const close = button('Fermer', () => ctx.ui.close(RADIO_SCREEN), { icon: 'close', className: 'is-small', id: 'radio-close' });
    const key = core.kit ? core.kit.keyLabel('radio') : '';
    if (key !== '' && !coarsePointer()) close.appendChild(el('span', 'cm-kbd', key));
    head.appendChild(close);
    this.root.appendChild(head);

    // canaux audibles pour ce rôle
    const channels = core.maps.scene.vis.radio;
    const chans = el('div', 'cr-chans');
    chans.style.padding = '8px 12px 0';
    const addChan = (channel: RadioChannel | null, label: string): void => {
      const b = button(label, () => {
        this.log.filter = channel;
        this.lastRefresh = -1;
      }, { className: 'is-small', id: 'radio-chan-' + (channel ?? 'tous') });
      chans.appendChild(b);
      this.chanBtns.push({ channel, b });
    };
    if (channels.length > 1) {
      addChan(null, 'Tous');
      for (let i = 0; i < channels.length; i++) addChan(channels[i]!, CHANNEL_LABELS[channels[i]!]);
      this.root.appendChild(chans);
    }

    this.log = new RadioLogView(core, this.root, 'ct-scroll');
    this.log.root.style.flex = '1';

    // messages rapides
    const quick = el('div', 'cr-quick');
    quick.appendChild(el('div', 'cm-sub', 'Messages rapides'));
    const grid = el('div', 'cr-grid');
    const add = (label: string, ico: IconName, id: string, run: () => void): void => {
      const b = button(label, () => {
        if (this.cooldown > 0) return;
        this.cooldown = COOLDOWN;
        run();
        this.lastRefresh = -1;
      }, { icon: ico, id });
      if (this.quickBtns.length === 0) b.dataset.autofocus = '';
      grid.appendChild(b);
      this.quickBtns.push(b);
    };
    if (isPoliceRole(ctx.player.state.role)) {
      add('Compte rendu de situation', 'eye', 'radio-cr', () => this.sendSituation());
      add('Demande de renfort', 'units', 'radio-renfort', () => this.sendReinforcement());
      add('Demande d’autorisation d’emploi de la force', 'megaphone', 'radio-force', () => this.sendForce());
      add('Demande de secours : pompiers', 'fire', 'radio-pompiers', () => this.sendRescue('pompiers'));
      add('Demande de secours : SAMU', 'cross', 'radio-samu', () => this.sendRescue('samu'));
    } else {
      add('Appeler les pompiers (18)', 'fire', 'radio-pompiers', () => this.sendRescue('pompiers'));
      add('Appeler le SAMU (15)', 'cross', 'radio-samu', () => this.sendRescue('samu'));
    }
    quick.appendChild(grid);
    this.root.appendChild(quick);
    this.focus = core.kit ? core.kit.focusGroup(this.root) : { dispose(): void {} };
    this.refresh();
  }

  private sector(p: Person | null): string {
    return p ? this.core.ctx.world.sectorName(p.x, p.z) : '';
  }

  /** Canal et destinataire d'un message de service : le commandement si l'on commande, sinon sa propre unité. */
  private say(text: string, priority: 0 | 1 | 2, channel: RadioChannel): void {
    const ctx = this.core.ctx;
    const p = this.core.player();
    ctx.radio.say({ channel, from: this.core.callsign(), text, priority, personId: p ? p.id : 0 });
    ctx.audio.play('radio_bip');
  }

  private sendSituation(): void {
    const core = this.core;
    const ctx = core.ctx;
    const p = core.player();
    const volume = p ? ctx.people.queryRadius(p.x, p.z, 150, this.found, (q) => q.faction === 'protest') : 0;
    this.found.length = 0;
    this.say(situationReport({
      from: core.callsign(), sector: this.sector(p), phase: ctx.director.phase, volume,
      tension: p ? ctx.director.tensionAt(p.x, p.z) : ctx.director.tension,
    }), 1, 'commandement');
  }

  private sendReinforcement(): void {
    this.say(reinforcementRequest(this.core.callsign(), this.sector(this.core.player())), 2, 'commandement');
  }

  private sendForce(): void {
    const roe = this.core.ctx.law.roe;
    const want = Math.min(4, roe.authorizedForce + 1) as 0 | 1 | 2 | 3 | 4;
    this.say(forceRequest(this.core.callsign(), this.sector(this.core.player()), want, roe.underAttack), 2, 'commandement');
  }

  private sendRescue(kind: RescueKind): void {
    const core = this.core;
    const ctx = core.ctx;
    const p = core.player();
    const police = isPoliceRole(ctx.player.state.role);
    if (police) this.say(rescueRequest(core.callsign(), this.sector(p), kind), 2, 'secours');
    else {
      const who = kind === 'pompiers' ? 'les pompiers' : 'le SAMU';
      this.say(radioFrame(kind === 'pompiers' ? 'Pompiers' : 'SAMU', p ? p.name : 'Témoin', `J’appelle ${who} : il y a besoin de secours${this.sector(p) ? ', ' + this.sector(p) : ''}`, false), 2, 'public');
    }
    const rescue = core.rescue;
    if (rescue && p) {
      const incidents = core.incidents;
      const call = rescue.request(kind, p.x, p.z, p.id, incidents && incidents.playerIncidentId !== 0 ? incidents.playerIncidentId : undefined);
      const eta = Math.max(0, Math.round(call.eta));
      ctx.ui.notify(`${kind === 'pompiers' ? 'Pompiers' : 'SAMU'} demandés — arrivée estimée dans environ ${Math.max(1, Math.round(eta / 60))} min`, 'ok', 4);
    } else if (!rescue) ctx.ui.notify('Message transmis. Aucun service de secours n’est joignable pour cette mission.', 'warn', 4);
  }

  private refresh(): void {
    this.log.refresh();
    for (let i = 0; i < this.chanBtns.length; i++) setClass(this.chanBtns[i]!.b, 'is-on', this.chanBtns[i]!.channel === this.log.filter);
    const off = this.cooldown > 0;
    for (let i = 0; i < this.quickBtns.length; i++) if (this.quickBtns[i]!.disabled !== off) this.quickBtns[i]!.disabled = off;
  }

  update(dt: number, _input: InputState): void {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.lastRefresh = -1;
    }
    const t = this.core.maps.time;
    if (this.lastRefresh < 0 || t - this.lastRefresh > 0.3) {
      this.lastRefresh = t;
      this.refresh();
    }
  }

  dispose(): void {
    this.focus.dispose();
    this.root.remove();
  }
}
