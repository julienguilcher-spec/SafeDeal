/* =====================================================================================
 * Actions rapides du HUD (zone 'left', sous la mini-carte) — toujours visibles, en un clic ou un toucher :
 *   « Carte tactique »  ouvre la carte de commandement (ceux qui commandent) ; « Carte » sinon ;
 *   « Secours »         déplie Pompiers / SAMU (médecin) : la demande part à la radio et au service des secours,
 *                        au point où se trouve le joueur, liée à l'incident qu'on lui a confié s'il y en a un.
 * Demande du commanditaire : « la carte tactique, que ce soit plus intuitif à l'écran plutôt que mettre retour et
 * cliquer sur la carte tactique » ; « il n'y a pas de bouton pour appeler les pompiers, les médecins, le SAMU ».
 * ===================================================================================== */

import type { HudWidget, RescueKind } from '@/core/extensions';
import { button, el, setClass } from '../maps/icons';
import { isPoliceRole } from '../maps/visibility';
import type { CommandCore } from './core';
import { radioFrame, rescueRequest } from './phrases';
import { ensureCommandStyle } from './style';

const PERIOD = 0.5;
/** Délai minimal entre deux demandes de secours (s) : pas d'appel en rafale. */
const RESCUE_COOLDOWN = 8;

const STYLE_ID = 'cm-quick-style';

function ensureQuickStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.cq{display:flex;flex-direction:column;align-items:flex-start;align-self:flex-start;gap:6px;margin-top:8px;pointer-events:auto;width:max-content}
.cq.is-off{display:none}
.cq .cm-btn{justify-content:flex-start;min-height:38px;padding:6px 12px;border-radius:10px;background:rgba(11,18,32,.82);border:1px solid rgba(255,255,255,.14);color:#e8ecf3;font-weight:600;font-size:13px;gap:8px;backdrop-filter:blur(4px)}
.cq .cm-btn:hover{background:rgba(30,44,70,.92)}
.cq .cq-key{margin-left:auto;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.12);font-size:11px;font-weight:600;color:#c3cbda}
.cq-sub{display:flex;gap:6px;padding-left:10px}
.cq-sub.is-off{display:none}
.cq-sub .cm-btn{min-height:34px;font-size:12px}
.cq .cq-fire{border-color:rgba(239,65,53,.55)}
.cq .cq-samu{border-color:rgba(80,160,255,.55)}
@media (pointer:coarse){.cq .cq-key{display:none}.cq .cm-btn{min-height:44px}}
`;
  document.head.appendChild(s);
}

export class QuickActionsHud implements HudWidget {
  readonly root: HTMLDivElement;
  private readonly mapBtn: HTMLButtonElement;
  private readonly mapLabel: HTMLElement;
  private readonly rescueBtn: HTMLButtonElement;
  private readonly sub: HTMLDivElement;
  private last = -1;
  private open = false;
  private lastCall = -1e9;
  private commander = false;

  constructor(private readonly core: CommandCore, host: HTMLElement) {
    ensureCommandStyle();
    ensureQuickStyle();
    this.root = el('div', 'cq is-off');
    this.root.dataset.id = 'hud-quick';
    this.mapBtn = button('Carte tactique', () => this.openMap(), { icon: 'layers', id: 'quick-map', title: 'Ouvrir la carte (Tab / M)' });
    this.mapLabel = this.mapBtn.querySelector('.cm-btn-t') as HTMLElement;
    const key = el('span', 'cq-key', 'Tab');
    this.mapBtn.appendChild(key);
    this.rescueBtn = button('Secours', () => this.toggleRescue(), { icon: 'cross', id: 'quick-rescue', title: 'Appeler les pompiers ou le SAMU' });
    this.sub = el('div', 'cq-sub is-off');
    const fire = button('Pompiers', () => this.call('pompiers'), { icon: 'fire', id: 'quick-pompiers', className: 'cq-fire' });
    const samu = button('SAMU · médecin', () => this.call('samu'), { icon: 'cross', id: 'quick-samu', className: 'cq-samu' });
    this.sub.append(fire, samu);
    this.root.append(this.mapBtn, this.rescueBtn, this.sub);
    host.appendChild(this.root);
  }

  update(): void {
    const core = this.core;
    const t = core.maps.time;
    if (t - this.last < PERIOD) return;
    this.last = t;
    const ctx = core.ctx;
    const p = core.player();
    if (!p || ctx.session.phase !== 'playing') {
      setClass(this.root, 'is-off', true);
      return;
    }
    setClass(this.root, 'is-off', false);
    const commander = isPoliceRole(ctx.player.state.role) && core.scope().level !== 'lecture';
    if (commander !== this.commander) {
      this.commander = commander;
      this.mapLabel.textContent = commander ? 'Carte tactique' : 'Carte';
      const key = this.mapBtn.querySelector('.cq-key');
      if (key) key.textContent = commander ? 'Tab' : 'M';
    }
  }

  private openMap(): void {
    const ctx = this.core.ctx;
    this.closeRescue();
    if (this.commander) ctx.ui.open('carte_tactique');
    else ctx.ui.open('carte');
  }

  private toggleRescue(): void {
    this.open = !this.open;
    setClass(this.sub, 'is-off', !this.open);
    setClass(this.rescueBtn, 'is-on', this.open);
  }

  private closeRescue(): void {
    if (!this.open) return;
    this.open = false;
    setClass(this.sub, 'is-off', true);
    setClass(this.rescueBtn, 'is-on', false);
  }

  /** Demande de secours au point du joueur (lié à l'incident qui lui est confié), annoncée à la radio. */
  private call(kind: RescueKind): void {
    const core = this.core;
    const ctx = core.ctx;
    const p = core.player();
    this.closeRescue();
    if (!p) return;
    const now = core.maps.time;
    if (now - this.lastCall < RESCUE_COOLDOWN) {
      ctx.ui.notify('Demande déjà transmise : les secours sont en route.', 'info', 3);
      return;
    }
    this.lastCall = now;
    const sector = ctx.world.sectorName(p.x, p.z);
    const label = kind === 'pompiers' ? 'Pompiers' : 'SAMU';
    if (isPoliceRole(ctx.player.state.role)) {
      ctx.radio.say({ channel: 'secours', from: core.callsign(), text: rescueRequest(core.callsign(), sector, kind), priority: 2, personId: p.id });
    } else {
      const who = kind === 'pompiers' ? 'les pompiers' : 'le SAMU';
      ctx.radio.say({ channel: 'public', from: p.name, priority: 2, personId: p.id,
        text: radioFrame(label, p.name, `J’appelle ${who} : il y a besoin de secours${sector ? ', ' + sector : ''}`, false) });
    }
    ctx.audio.play('radio_bip');
    const rescue = core.rescue;
    if (!rescue) {
      ctx.ui.notify('Message transmis. Aucun service de secours n’est joignable pour cette mission.', 'warn', 4);
      return;
    }
    const incidents = core.incidents;
    const c = rescue.request(kind, p.x, p.z, p.id, incidents && incidents.playerIncidentId !== 0 ? incidents.playerIncidentId : undefined);
    const minutes = Math.max(1, Math.round(Math.max(0, c.eta) / 60));
    ctx.ui.notify(`${label} demandés — arrivée estimée dans environ ${minutes} min.`, 'ok', 4);
  }

  dispose(): void {
    this.root.remove();
  }
}
