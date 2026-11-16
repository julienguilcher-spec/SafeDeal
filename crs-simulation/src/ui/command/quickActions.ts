/* =====================================================================================
 * Actions rapides du HUD (zone 'left', sous la mini-carte) — toujours visibles, en un clic ou un toucher :
 *   « Carte tactique »  ouvre la carte de commandement (ceux qui commandent) ; « Carte » sinon ;
 *   « Secours »         déplie Pompiers / SAMU (médecin) : la demande part à la radio et au service des secours,
 *                        au point où se trouve le joueur, liée à l'incident qu'on lui a confié s'il y en a un ;
 *   propositions        le joueur commandant reçoit celles de son adjoint (mise en place du dispositif, fermetures,
 *                        relèves, fin de mission…) : « Accepter » les exécute, « Plus tard » les écarte. Elles
 *                        n'étaient dites qu'à la radio, sans moyen d'y répondre.
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

/** Vue minimale d'une proposition de l'adjoint (police.command). */
interface ProposalLike { id: number; key: string; text: string; t: number; saidAt: number; priority: number; executable: boolean }
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
.cq-prop{max-width:300px;padding:8px 10px;border-radius:10px;background:rgba(11,18,32,.88);border:1px solid rgba(255,196,64,.5);color:#e8ecf3;font-size:12px;line-height:1.35}
.cq-prop.is-off{display:none}
.cq-prop b{display:block;color:#ffc440;font-size:11px;letter-spacing:.04em;margin-bottom:3px}
.cq-prop .cq-row{display:flex;gap:6px;margin-top:6px}
.cq-prop .cm-btn{min-height:30px;font-size:12px;padding:4px 10px}
.cq-prop .cq-ok{border-color:rgba(64,200,120,.6)}
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
  private readonly prop: HTMLDivElement;
  private readonly propTitle: HTMLElement;
  private readonly propText: HTMLElement;
  private propId = 0;

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
    this.prop = el('div', 'cq-prop is-off');
    this.prop.dataset.id = 'hud-proposal';
    this.propTitle = el('b', '', 'PROPOSITION DE L’ADJOINT');
    this.propText = el('span');
    const row = el('div', 'cq-row');
    row.append(
      button('Accepter', () => this.answer(true), { icon: 'check', id: 'proposal-accept', className: 'cq-ok' }),
      button('Plus tard', () => this.answer(false), { icon: 'close', id: 'proposal-dismiss' }),
    );
    this.prop.append(this.propTitle, this.propText, row);
    this.root.append(this.mapBtn, this.rescueBtn, this.sub, this.prop);
    host.appendChild(this.root);
  }

  /** Proposition affichée : la plus urgente déjà dite à la radio, exécutable. */
  private refreshProposal(): void {
    const cmd = this.core.ctx.service<{ proposals: readonly ProposalLike[] }>('police.command');
    let best: ProposalLike | null = null;
    if (cmd && this.commander) {
      for (const p of cmd.proposals) {
        if (!p.executable || p.saidAt < 0) continue;
        if (!best || p.priority > best.priority || (p.priority === best.priority && p.t > best.t)) best = p;
      }
    }
    if (!best) {
      this.propId = 0;
      setClass(this.prop, 'is-off', true);
      return;
    }
    if (best.id !== this.propId) {
      this.propId = best.id;
      this.propText.textContent = best.text.replace(/^chef,\s*/i, '');
    }
    setClass(this.prop, 'is-off', false);
  }

  private answer(yes: boolean): void {
    const cmd = this.core.ctx.service<{ accept(id: number): boolean; dismiss(id: number): void }>('police.command');
    const id = this.propId;
    if (!cmd || id === 0) return;
    if (yes) {
      const ok = cmd.accept(id);
      this.core.ctx.ui.notify(ok ? 'Proposition acceptée : l’adjoint fait exécuter.' : 'Cette proposition n’est plus d’actualité.', ok ? 'ok' : 'info', 3);
    } else cmd.dismiss(id);
    this.propId = 0;
    setClass(this.prop, 'is-off', true);
    this.last = -1;
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
    this.refreshProposal();
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
