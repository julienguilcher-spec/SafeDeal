/* =====================================================================================
 * Carte tactique — onglet « Ordres » : cadre légal (sommations, force licite), niveau de force
 * autorisé, palette de tous les verbes d'ordre.
 * ===================================================================================== */

import type { ForceLevel, SommationStage } from '@/core/contracts';
import { button, el, setClass, setText } from '../maps/icons';
import type { CommandCore } from './core';
import { FORCE_LABELS, ORDER_GROUP_LABELS, ORDER_VERBS } from './orders';
import type { OrderGroup, OrderVerb } from './orders';
import { forceRequest } from './phrases';
import type { TacticalMap } from './tacticalMap';
import { IDLE } from './tacticalState';
import type { TacticalState } from './tacticalState';

const STAGE_LABELS: readonly string[] = [
  'Aucune sommation', 'Annonce faite\u00a0: «\u00a0Obéissance à la loi\u00a0»', 'Première sommation faite', 'Dernière sommation faite',
];
const NEXT_LABELS: readonly string[] = ['Faire l’annonce', 'Première sommation', 'Dernière sommation', 'Sommations terminées'];

export class OrdersPanel {
  readonly root: HTMLDivElement;
  private readonly dot: HTMLElement;
  private readonly legal: HTMLElement;
  private readonly lawful: HTMLElement;
  private readonly attack: HTMLElement;
  private readonly somBtn: HTMLButtonElement;
  private readonly forceBtns: HTMLButtonElement[] = [];
  private readonly forceNote: HTMLElement;
  private readonly forceTitle: HTMLElement;
  private readonly askBtn: HTMLButtonElement;
  private readonly target: HTMLElement;
  private readonly verbBtns: { verb: OrderVerb; b: HTMLButtonElement }[] = [];
  private readonly rule: HTMLElement;
  private readonly palette: HTMLElement;
  private readonly sRescue: HTMLDivElement;
  private readonly firemenBtn: HTMLButtonElement;
  private readonly samuBtn: HTMLButtonElement;
  private readonly rescueNote: HTMLElement;
  private readonly readonlyNote: HTMLElement;

  constructor(private readonly core: CommandCore, private readonly state: TacticalState, private readonly tmap: TacticalMap, host: HTMLElement) {
    this.root = el('div', 'ct-pane ct-scroll');
    this.root.dataset.id = 'tac-orders';

    // cadre légal
    const sLegal = el('div', 'ct-sec');
    sLegal.appendChild(el('div', 'cm-sub', 'Cadre légal'));
    const line = el('div', 'ct-legal');
    this.dot = el('i', 'ct-dot');
    this.legal = el('span');
    line.append(this.dot, this.legal);
    this.lawful = el('div', 'ct-note');
    this.attack = el('div', 'ct-note is-warn');
    this.somBtn = button('Sommation suivante', () => this.sommation(), { icon: 'megaphone', className: 'is-danger', id: 'tac-sommation' });
    sLegal.append(line, this.lawful, this.attack, this.somBtn);

    // force autorisée
    const sForce = el('div', 'ct-sec');
    const fh = el('div', 'ct-sec-h');
    this.forceTitle = el('div', 'cm-sub', 'Force autorisée');
    fh.appendChild(this.forceTitle);
    const grid = el('div', 'ct-force');
    for (let lvl = 0; lvl <= 4; lvl++) {
      const b = button(String(lvl), () => this.setForce(lvl as ForceLevel), { title: FORCE_LABELS[lvl], id: 'tac-force-' + lvl });
      grid.appendChild(b);
      this.forceBtns.push(b);
    }
    this.forceNote = el('div', 'ct-note');
    this.askBtn = button('Demander l’autorisation', () => this.askAuthorization(), { icon: 'radio', className: 'is-small', id: 'tac-ask-force' });
    sForce.append(fh, grid, this.forceNote, this.askBtn);

    // palette
    const sVerbs = el('div', 'ct-sec');
    const vh = el('div', 'ct-sec-h');
    vh.appendChild(el('div', 'cm-sub', 'Ordres'));
    this.target = el('span', 'ct-note');
    vh.appendChild(this.target);
    this.palette = el('div', 'ct-verbs');
    let group: OrderGroup | '' = '';
    for (let i = 0; i < ORDER_VERBS.length; i++) {
      const v = ORDER_VERBS[i]!;
      if (v.group !== group) {
        group = v.group;
        this.palette.appendChild(el('div', 'cm-sub', ORDER_GROUP_LABELS[group]));
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cm-btn ct-verb' + (v.coercive ? ' is-coercive' : '');
      b.dataset.type = v.type;
      b.dataset.id = 'verb-' + v.type;
      b.title = v.label;
      b.append(el('i'), el('span', undefined, v.short));
      b.addEventListener('click', () => this.pickVerb(v));
      this.palette.appendChild(b);
      this.verbBtns.push({ verb: v, b });
    }
    this.rule = el('div', 'ct-note');
    this.readonlyNote = el('div', 'ct-note', 'Lecture seule\u00a0: vous recevez les ordres, vous n’en donnez pas. La carte montre le dispositif et la foule.');
    sVerbs.append(vh, this.palette, this.rule, this.readonlyNote);

    // secours : les engager sur un point précis, un feu ou un blessé (clic sur la carte)
    this.sRescue = el('div', 'ct-sec');
    const rh = el('div', 'ct-sec-h');
    rh.appendChild(el('div', 'cm-sub', 'Secours'));
    const rrow = el('div', 'ct-verbs');
    this.firemenBtn = button('Pompiers →', () => this.pickRescue('pompiers'), { icon: 'fire', id: 'tac-rescue-pompiers', className: 'ct-verb' });
    this.samuBtn = button('SAMU →', () => this.pickRescue('samu'), { icon: 'cross', id: 'tac-rescue-samu', className: 'ct-verb' });
    rrow.append(this.firemenBtn, this.samuBtn);
    this.rescueNote = el('div', 'ct-note', 'Puis cliquez sur la carte\u00a0: sur un feu ou un blessé, l’équipe va directement l’éteindre ou le prendre en charge\u00a0; ailleurs, elle se rend au point désigné.');
    this.sRescue.append(rh, rrow, this.rescueNote);

    this.root.append(sLegal, sForce, sVerbs, this.sRescue);
    host.appendChild(this.root);
  }

  private pickRescue(kind: 'pompiers' | 'samu'): void {
    const st = this.state;
    if (st.mode.kind === 'rescue' && st.mode.rescue === kind) st.setMode(IDLE);
    else st.setMode({ kind: 'rescue', rescue: kind, incidentId: 0 });
    this.refresh();
  }

  private sommation(): void {
    const ctx = this.core.ctx;
    const p = this.core.player();
    if (!p) return;
    // salle de commandement : l'officier de la compagnie se porte à portée de mégaphone et somme sur ordre
    if (ctx.session.config?.extra?.['variante'] === 'salle') {
      this.sommationOnOrder();
      return;
    }
    const before = ctx.law.roe.sommation;
    const stage = ctx.law.sommation(p);
    if (stage === before) {
      ctx.ui.notify(before >= 3 ? 'Les sommations sont terminées.' : 'Sommation refusée\u00a0: seule l’autorité habilitée, insigne apparent, peut la prononcer.', 'warn', 4);
      return;
    }
    // le texte réglementaire est diffusé par l'événement law:sommation (sous-titre, voix) ; ici, la trace radio
    ctx.radio.say({
      channel: 'commandement', from: this.core.callsign(), priority: 2, personId: p.id,
      text: `À TOUS ICI ${this.core.callsign().toUpperCase()}. ${STAGE_LABELS[stage]}. ${stage >= 3 ? 'Emploi de la force possible sur mon ordre.' : 'Aucun emploi de la force avant mon ordre.'} TERMINÉ.`,
    });
    this.state.touch();
  }

  /** Mode salle : point de sommation = point chaud le plus marqué, sinon tête du cortège ; l'ordre part par radio. */
  private sommationOnOrder(): void {
    const ctx = this.core.ctx;
    const cmd = ctx.service<{ requestSommation(companySquadId: number, x: number, z: number): boolean; hotspots: readonly { x: number; z: number }[] }>('police.command');
    const company = ctx.squads.list.find((q) => q.kind === 'compagnie' && q.faction === 'police');
    if (!cmd || !company) {
      ctx.ui.notify('Aucun officier ne peut sommer sur ordre : pas de compagnie engagée.', 'warn', 4);
      return;
    }
    let x = NaN, z = NaN;
    if (cmd.hotspots.length > 0) {
      x = cmd.hotspots[0]!.x;
      z = cmd.hotspots[0]!.z;
    } else {
      const route = ctx.director.route;
      let s = ctx.director.headProgress;
      for (let i = 0; i + 3 < route.length; i += 2) {
        const len = Math.hypot(route[i + 2]! - route[i]!, route[i + 3]! - route[i + 1]!);
        if (s <= len || i + 5 >= route.length) {
          const k = len > 0 ? Math.min(1, s / len) : 0;
          x = route[i]! + (route[i + 2]! - route[i]!) * k;
          z = route[i + 1]! + (route[i + 3]! - route[i + 1]!) * k;
          break;
        }
        s -= len;
      }
    }
    if (!Number.isFinite(x) || !cmd.requestSommation(company.id, x, z)) {
      ctx.ui.notify('Sommation sur ordre impossible : aucun officier habilité disponible ou aucun attroupement repéré.', 'warn', 5);
      return;
    }
    ctx.radio.say({
      channel: 'commandement', from: this.core.callsign(), priority: 2, personId: ctx.player.state.personId,
      text: `${company.name.toUpperCase()} ICI ${this.core.callsign().toUpperCase()}. Portez-vous à portée de mégaphone et procédez à la sommation suivante. PARLEZ.`,
    });
    this.state.touch();
  }

  private setForce(level: ForceLevel): void {
    const core = this.core;
    const sc = core.scope();
    if (sc.canAuthorize) {
      core.authorize(level);
      if (level > core.ctx.law.roe.lawfulForce) {
        core.ctx.ui.notify(`Niveau ${level} autorisé au-delà du cadre légal actuel (niveau ${core.ctx.law.roe.lawfulForce}).`, 'warn', 5);
      }
    } else if (sc.level === 'unite') {
      const max = core.ctx.law.roe.authorizedForce;
      core.orderForce = (level > max ? max : level) as ForceLevel;
    }
    this.state.touch();
  }

  private askAuthorization(): void {
    const core = this.core;
    const ctx = core.ctx;
    const p = core.player();
    const want = Math.min(4, ctx.law.roe.authorizedForce + 1) as ForceLevel;
    ctx.radio.say({
      channel: 'commandement', from: core.callsign(), priority: 2, personId: p ? p.id : 0,
      text: forceRequest(core.callsign(), p ? ctx.world.sectorName(p.x, p.z) : '', want, ctx.law.roe.underAttack, ctx.squads.list.find((q) => q.kind === 'compagnie' && q.faction === 'police')?.name),
    });
    ctx.ui.notify('Demande d’autorisation transmise à l’autorité.', 'info', 3);
  }

  private pickVerb(verb: OrderVerb): void {
    const st = this.state;
    const chk = this.core.check(verb);
    if (!chk.ok) {
      this.core.ctx.ui.notify(chk.reason, 'warn', 5);
      this.core.ctx.audio.play('ui_alerte');
      return;
    }
    // (« Dégager l'obstacle » : sans sélection, le Centaure libre le plus proche y va)
    if (this.tmap.selectedUnits().length === 0 && verb.type !== 'degager_obstacle') {
      this.core.ctx.ui.notify('Sélectionnez d’abord une unité sous vos ordres.', 'warn', 3);
      return;
    }
    if (verb.gesture === 'immediate') {
      this.tmap.issueImmediate(verb);
      st.setMode(IDLE);
      return;
    }
    // un second appui sur le même verbe l'annule
    if (st.mode.kind === 'order' && st.mode.verb === verb) st.setMode(IDLE);
    else st.setMode({ kind: 'order', verb });
  }

  refresh(): void {
    const core = this.core;
    const roe = core.ctx.law.roe;
    const sc = core.scope();
    // secours : qui peut déléguer, quand un service de secours est joignable
    const canRescue = !!core.rescue && sc.canDelegate;
    this.sRescue.style.display = canRescue ? '' : 'none';
    const m = this.state.mode;
    setClass(this.firemenBtn, 'is-on', m.kind === 'rescue' && m.rescue === 'pompiers');
    setClass(this.samuBtn, 'is-on', m.kind === 'rescue' && m.rescue === 'samu');
    const stage: SommationStage = roe.sommation;
    this.dot.className = 'ct-dot' + (roe.underAttack ? ' atk' : stage > 0 ? ' s' + stage : '');
    setText(this.legal, STAGE_LABELS[stage] ?? '');
    setText(this.lawful, `Force licite à cet instant\u00a0: niveau ${roe.lawfulForce} — ${FORCE_LABELS[roe.lawfulForce] ?? ''}.`);
    setText(this.attack, roe.underAttack ? 'Violences contre les forces de l’ordre\u00a0: riposte immédiate permise.' : '');
    this.attack.style.display = roe.underAttack ? '' : 'none';
    this.somBtn.style.display = sc.canSommation ? '' : 'none';
    this.somBtn.disabled = stage >= 3;
    const lbl = this.somBtn.querySelector('.cm-btn-t');
    if (lbl) setText(lbl as HTMLElement, stage >= 3 ? NEXT_LABELS[3]! : `Sommation suivante\u00a0: ${NEXT_LABELS[stage]!.toLowerCase()}`);

    // force : l'autorité fixe le niveau ; un chef d'unité plafonne ses propres ordres
    const authorized = roe.authorizedForce;
    const shown = sc.canAuthorize ? authorized : Math.min(core.orderForce, authorized);
    setText(this.forceTitle, sc.canAuthorize ? 'Force autorisée' : sc.level === 'unite' ? 'Plafond de mes ordres' : 'Force autorisée');
    for (let lvl = 0; lvl <= 4; lvl++) {
      const b = this.forceBtns[lvl]!;
      setClass(b, 'is-on', lvl === shown);
      setClass(b, 'is-cap', !sc.canAuthorize && lvl === authorized);
      setClass(b, 'is-over', sc.canAuthorize && lvl > roe.lawfulForce);
      b.disabled = sc.level === 'lecture' || (!sc.canAuthorize && lvl > authorized);
    }
    let note = `Niveau ${shown} — ${FORCE_LABELS[shown] ?? ''}.`;
    if (!sc.canAuthorize) note += ` Autorisé par la hiérarchie\u00a0: niveau ${authorized}.`;
    else if (authorized > roe.lawfulForce) note += ` Au-delà du cadre légal actuel (niveau ${roe.lawfulForce})\u00a0: sommations requises.`;
    setText(this.forceNote, note);
    setClass(this.forceNote, 'is-warn', sc.canAuthorize && authorized > roe.lawfulForce);
    this.askBtn.style.display = !sc.canAuthorize && sc.level !== 'lecture' ? '' : 'none';

    // palette
    const readOnly = sc.level === 'lecture';
    this.palette.style.display = readOnly ? 'none' : '';
    this.readonlyNote.style.display = readOnly ? '' : 'none';
    const units = readOnly ? [] : this.tmap.selectedUnits();
    setText(this.target, readOnly ? '' : units.length === 0 ? 'Aucune unité sélectionnée' : units.length === 1 ? `Pour ${units[0]!.name}` : `Pour ${units.length} unités`);
    const mode = this.state.mode;
    for (let i = 0; i < this.verbBtns.length; i++) {
      const { verb, b } = this.verbBtns[i]!;
      setClass(b, 'is-on', mode.kind === 'order' && mode.verb === verb);
      setClass(b, 'is-locked', verb.force > authorized && !roe.underAttack);
    }
    if (mode.kind === 'order') {
      const v = mode.verb;
      setText(this.rule, v.rule !== '' ? v.rule : v.hint);
      setClass(this.rule, 'is-warn', v.rule !== '');
      this.rule.style.display = '';
    } else this.rule.style.display = 'none';
  }
}
