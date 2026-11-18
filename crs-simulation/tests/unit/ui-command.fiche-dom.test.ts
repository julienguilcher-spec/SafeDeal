// La fiche de la carte de commandement (panelCard.ts) rendue dans un petit DOM de test, avec des fiches, des unités
// proposées et des étapes légales tirées d'une vraie partie à la Concorde (commandant, puis chef de groupe) :
// la fiche d'une rue montre six lignes + « Autres ordres ici… », la ligne par défaut surlignée ; au doigt un premier
// toucher ne fait que surligner, le second envoie ; à la souris le clic envoie ; le bouton T dit « Toute la
// compagnie » / « Tout le groupe » selon le rôle ; S3 sans chaîne possible n'a pas « Faire les étapes » ; au
// téléphone seule la ligne surlignée montre son explication ; le bouton de confirmation ne dit jamais « Envoyer ».
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { defaultWho, proposeWho, wholeCandidate, whoEnvFromCore } from '@/ui/command/bestUnit';
import type { Card, CardEnv, CardLine, Repere, WhoCandidate, WhoEnv } from '@/ui/command/cardTypes';
import { buildCard, intentCandidates } from '@/ui/command/intents';
import {
  ANYWAY_LABEL, BACK_LABEL, CHAIN_LABEL, CardPanel, OTHERS_LABEL, SEND_LABEL, SENT_PREFIX, cardView, defaultExtra,
} from '@/ui/command/panelCard';
import type { CardConfirmModel, CardShowExtra } from '@/ui/command/panelCard';
import { sentenceOf } from '@/ui/command/preview';
import { cardEnvFromCore, collectReperes, crowdRepere, mainCrowd } from '@/ui/command/reperes';
import { legalCheck, sentTitle } from '@/ui/command/sendLine';
import { CARD_CSS } from '@/ui/command/styleCard';
import type { CardPanelLike } from '@/ui/command/tacticalScreen';

// ───────────────────────────── un petit DOM (ce que la fiche utilise) ─────────────────────────────

type Listener = (e: FakeEvent) => void;

interface FakeEvent {
  type: string;
  pointerType?: string;
  target: FakeEl | null;
  defaultPrevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

const BUBBLES = new Set(['click', 'pointerdown', 'mousedown', 'pointermove']);

class FakeClassList {
  constructor(private readonly el: FakeEl) {}
  private get set(): Set<string> {
    return new Set(this.el.className.split(/\s+/).filter((c) => c !== ''));
  }
  contains(c: string): boolean {
    return this.set.has(c);
  }
  add(...cs: string[]): void {
    const s = this.set;
    for (const c of cs) s.add(c);
    this.el.className = Array.from(s).join(' ');
  }
  remove(...cs: string[]): void {
    const s = this.set;
    for (const c of cs) s.delete(c);
    this.el.className = Array.from(s).join(' ');
  }
  toggle(c: string, on?: boolean): boolean {
    const want = on ?? !this.contains(c);
    if (want) this.add(c);
    else this.remove(c);
    return want;
  }
}

class FakeEl {
  className = '';
  type = '';
  title = '';
  hidden = false;
  disabled = false;
  tabIndex = 0;
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly classList = new FakeClassList(this);
  readonly children: FakeEl[] = [];
  parentNode: FakeEl | null = null;
  private text = '';
  private html = '';
  private readonly attrs = new Map<string, string>();
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly tagName: string) {}

  get firstChild(): FakeEl | null {
    return this.children[0] ?? null;
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(v: string) {
    for (const c of this.children) c.parentNode = null;
    this.children.length = 0;
    this.html = '';
    this.text = v;
  }
  get innerHTML(): string {
    return this.html;
  }
  set innerHTML(v: string) {
    this.textContent = '';
    this.html = v;
  }
  appendChild(c: FakeEl): FakeEl {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  append(...cs: FakeEl[]): void {
    for (const c of cs) this.appendChild(c);
  }
  removeChild(c: FakeEl): FakeEl {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  addEventListener(type: string, fn: Listener): void {
    const l = this.listeners.get(type) ?? [];
    l.push(fn);
    this.listeners.set(type, l);
  }
  removeEventListener(type: string, fn: Listener): void {
    const l = this.listeners.get(type);
    if (l) this.listeners.set(type, l.filter((f) => f !== fn));
  }
  listenerCount(): number {
    let n = 0;
    for (const l of this.listeners.values()) n += l.length;
    return n + this.children.reduce((s, c) => s + c.listenerCount(), 0);
  }
  fire(e: FakeEvent): void {
    for (const fn of (this.listeners.get(e.type) ?? []).slice()) fn(e);
  }
}

function dispatch(target: FakeEl, type: string, pointerType?: string): FakeEvent {
  const e: FakeEvent = {
    type, target, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  if (pointerType !== undefined) e.pointerType = pointerType;
  for (let n: FakeEl | null = target; n; n = n.parentNode) {
    n.fire(e);
    if (e.stopped || !BUBBLES.has(type)) break;
  }
  return e;
}

/** Un appui complet : pointerdown puis click (le clic de Safari ne dit pas toujours le type : '' ici). */
function press(target: FakeEl, pointerType: 'mouse' | 'touch', clickType: string = pointerType): void {
  dispatch(target, 'pointerdown', pointerType);
  dispatch(target, 'click', clickType);
}

function all(root: FakeEl): FakeEl[] {
  const out: FakeEl[] = [];
  const walk = (n: FakeEl): void => {
    out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/** Élément visible (lui et ses parents sans `hidden`). */
function visible(n: FakeEl): boolean {
  for (let p: FakeEl | null = n; p; p = p.parentNode) if (p.hidden) return false;
  return true;
}

function byId(root: FakeEl, id: string): FakeEl | null {
  return all(root).find((n) => n.dataset.id === id && visible(n)) ?? null;
}

function byClass(root: FakeEl, cls: string): FakeEl[] {
  return all(root).filter((n) => n.classList.contains(cls) && visible(n));
}

/** Texte du libellé d'un bouton (sans la touche imprimée à côté). */
function labelOf(b: FakeEl): string {
  return all(b).find((n) => n.classList.contains('cc-t'))?.textContent ?? b.textContent;
}

function lineRows(root: FakeEl): FakeEl[] {
  return byClass(root, 'cc-row');
}

/** Le petit DOM n'est posé qu'après le lancement des parties (le jeu sans navigateur ne doit pas le voir). */
function installDom(): void {
  (globalThis as unknown as { document: unknown }).document = { createElement: (tag: string) => new FakeEl(tag) };
}

function removeDom(): void {
  delete (globalThis as unknown as { document?: unknown }).document;
}

// ───────────────────────────── une vraie partie ─────────────────────────────

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

interface Game { core: CommandCore; env: CardEnv; who: WhoEnv }

async function concorde(role: 'commandant' | 'chef_groupe'): Promise<Game> {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role, rank: role === 'commandant' ? 'commandant' : undefined, place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const env = cardEnvFromCore(core);
  return { core, env, who: whoEnvFromCore(core, env, []) };
}

/** Ce que l'écran donne à la fiche (tacticalScreen.refreshCard) pour une ligne. */
function screenArgs(g: Game, card: Card, line: number, over: Partial<CardShowExtra> = {}) {
  const l = card.lines[line] ?? null;
  const where = card.repere;
  const list = l ? proposeWho(l, where, g.who) : [];
  const who = defaultWho(list);
  const sentence = l ? sentenceOf(l, who, where) : { what: '', rule: '' };
  const whole = wholeCandidate(where, g.who);
  const extra: CardShowExtra = {
    ...defaultExtra(false), explainAll: true, wholeLabel: whole?.label ?? '', whoFixed: card.whoFixed !== null && card.whoFixed.length > 0, ...over,
  };
  return { who, sentence, extra, list };
}

/** Modèle de S3 tel que l'écran le construit (openConfirm) à partir des vraies étapes légales. */
function confirmModel(g: Game, card: Card, line: CardLine, who: WhoCandidate | null): CardConfirmModel {
  const r = legalCheck(g.core, g.env, line, who, card.repere);
  return {
    title: `${line.label} — ${card.repere.name}`, steps: r.plan?.steps ?? [], coercive: line.lock === null && line.coercive,
    reason: r.plan ? '' : r.reason, canChain: r.plan !== null,
  };
}

let boss: Game;
let chief: Game;
let street: Card;
let host: FakeEl;
let panel: CardPanel;
const calls: string[] = [];

function mount(): CardPanel {
  host = new FakeEl('div');
  const p = new CardPanel(host as unknown as HTMLElement);
  p.onLineHover = (i) => calls.push(`hover:${i}`);
  p.onLineTap = (i) => calls.push(`tap:${i}`);
  p.onSend = (i) => calls.push(`send:${i ?? '-'}`);
  p.onBack = () => calls.push('back');
  p.onOthers = () => calls.push('others');
  p.onWhoNext = (s) => calls.push(`who-next:${s ?? 1}`);
  p.onWhoAll = () => calls.push('who-all');
  p.onWhoList = () => calls.push('who-list');
  p.onWhoPick = (ids) => calls.push(`who-pick:${ids.join(',')}`);
  p.onConfirm = (c) => calls.push(`confirm:${c}`);
  p.onUndo = () => calls.push('undo');
  p.onCandidate = (s) => calls.push(`cand:${s}`);
  p.onStack = (i) => calls.push(`stack:${i}`);
  return p;
}

function root(): FakeEl {
  return panel.root as unknown as FakeEl;
}

function showStreet(line: number, compact = false, over: Partial<CardShowExtra> = {}): ReturnType<typeof screenArgs> {
  const a = screenArgs(boss, street, line, over);
  panel.show(street, a.who, line, a.sentence, compact, { ...a.extra, ...(compact ? { explainAll: false } : {}), ...over });
  return a;
}

beforeAll(async () => {
  boss = await concorde('commandant');
  chief = await concorde('chef_groupe');
  const blocks = intentCandidates('bloquer', boss.env, boss.env.player!);
  expect(blocks.length).toBeGreaterThan(0);
  street = buildCard(blocks[0]!, boss.env, 'bloquer');
  installDom();
}, 600000);

afterAll(() => removeDom());

afterEach(() => {
  calls.length = 0;
});

describe('fiche (DOM) : la rue, ses lignes et la ligne par défaut', () => {
  it('la fiche d’une rue de la Concorde : six lignes numérotées + « 0 Autres ordres ici… », « Barrer la rue » surlignée', () => {
    panel = mount();
    expect(host.children).toContain(root());
    expect(street.lines.length).toBe(6);
    expect(street.others.length).toBeGreaterThan(0);
    showStreet(street.defaultLine);
    const rows = lineRows(root());
    expect(rows).toHaveLength(7);
    for (let n = 1; n <= 6; n++) {
      const r = byId(root(), `card-line-${n}`)!;
      expect(r, `ligne ${n}`).not.toBeNull();
      expect(r.textContent).toContain(street.lines[n - 1]!.label);
      expect(r.textContent.startsWith(n === street.defaultLine + 1 ? '▶' : String(n))).toBe(true);
      expect(r.getAttribute('tabindex')).toBe('-1');
      expect(r.tabIndex).toBe(-1);
    }
    const others = byId(root(), 'card-line-0')!;
    expect(others.textContent).toContain(OTHERS_LABEL);
    const on = rows.filter((r) => r.classList.contains('is-on'));
    expect(on).toHaveLength(1);
    expect(on[0]!.dataset.id).toBe(`card-line-${street.defaultLine + 1}`);
    expect(on[0]!.textContent).toContain('Barrer la rue');
    expect(on[0]!.textContent).toContain('▶');
    // en-tête, Qui proposé (une section de la compagnie), phrase, envoi et retour
    expect(byClass(root(), 'cc-title')[0]!.textContent).toBe(street.title);
    const who = byId(root(), 'card-who')!;
    expect(who.textContent).toMatch(/^Qui : /);
    expect(who.textContent).toMatch(/à pied|en véhicules/);
    expect(byClass(root(), 'cc-say')[0]!.textContent).toMatch(/^Ce qui va se passer/);
    expect(labelOf(byId(root(), 'card-send')!)).toBe(SEND_LABEL);
    expect(labelOf(byId(root(), 'card-back')!)).toBe(BACK_LABEL);
    // chaque ligne montre son explication sur PC (fenêtre haute)
    for (const r of rows.slice(0, 6)) expect(byClass(r, 'cc-exp').length).toBe(1);
  });

  it('« Autres ordres ici… » : la rangée 0 l’ouvre ; dépliée, la fiche liste les autres ordres numérotés', () => {
    panel = mount();
    showStreet(0);
    press(byId(root(), 'card-line-0')!, 'mouse');
    expect(calls).toEqual(['others']);
    showStreet(0, false, { othersOpen: true });
    const rows = lineRows(root());
    expect(rows).toHaveLength(street.others.length);
    expect(byId(root(), 'card-line-0')).toBeNull();
    expect(rows[0]!.textContent).toContain(street.others[0]!.label);
    expect(byClass(root(), 'cc-cap')[0]!.textContent).toBe(OTHERS_LABEL);
  });
});

describe('fiche (DOM) : souris, trackpad et doigt', () => {
  it('à la souris : le survol prévisualise, quitter la fiche rend la main, le clic envoie la ligne', () => {
    panel = mount();
    showStreet(0);
    const l2 = byId(root(), 'card-line-2')!;
    dispatch(l2, 'pointerenter', 'mouse');
    dispatch(l2, 'pointermove', 'mouse');
    dispatch(byClass(root(), 'cc-list')[0]!, 'pointerleave', 'mouse');
    expect(calls).toEqual(['hover:1', 'hover:-1']);
    calls.length = 0;
    press(l2, 'mouse');
    expect(calls).toEqual(['send:1']);
  });

  it('au doigt : un toucher surligne seulement, le second sur la même ligne envoie ; « Donner l’ordre » envoie', () => {
    panel = mount();
    showStreet(street.defaultLine);
    // la ligne déjà surlignée par défaut : un seul toucher n'envoie pas
    press(byId(root(), `card-line-${street.defaultLine + 1}`)!, 'touch');
    expect(calls).toEqual([`tap:${street.defaultLine}`]);
    calls.length = 0;
    // le survol d'un doigt n'est pas un survol
    dispatch(byId(root(), 'card-line-2')!, 'pointerenter', 'touch');
    expect(calls).toEqual([]);
    press(byId(root(), 'card-line-2')!, 'touch');
    expect(calls).toEqual(['tap:1']);
    // l'écran surligne la ligne touchée (l'aperçu suit), puis le second toucher l'envoie
    showStreet(1);
    expect(byId(root(), 'card-line-2')!.classList.contains('is-on')).toBe(true);
    press(byId(root(), 'card-line-2')!, 'touch');
    expect(calls).toEqual(['tap:1', 'send:1']);
    calls.length = 0;
    // toucher une autre ligne après une première : elle est surlignée, rien ne part
    press(byId(root(), 'card-line-3')!, 'touch');
    press(byId(root(), 'card-line-4')!, 'touch');
    expect(calls).toEqual(['tap:2', 'tap:3']);
    calls.length = 0;
    // un clic dont le type est inconnu (Safari) reprend celui de l'appui : toujours le doigt
    press(byId(root(), 'card-line-5')!, 'touch', '');
    expect(calls).toEqual(['tap:4']);
    calls.length = 0;
    press(byId(root(), 'card-send')!, 'touch');
    expect(calls).toEqual(['send:-']);
  });

  it('une autre fiche désarme le second toucher (le doigt ne valide jamais une ligne d’une autre fiche)', () => {
    panel = mount();
    showStreet(1);
    press(byId(root(), 'card-line-2')!, 'touch');
    const crowdCard = buildCard(crowdRepere(mainCrowd(boss.env)!), boss.env, null);
    const a = screenArgs(boss, crowdCard, 1);
    panel.show(crowdCard, a.who, 1, a.sentence, false, a.extra);
    press(byId(root(), 'card-line-2')!, 'touch');
    expect(calls).toEqual(['tap:1', 'tap:1']);
  });

  it('les boutons ne prennent pas le focus (la carte le garde) et retirent leurs écouteurs à la fermeture', () => {
    panel = mount();
    showStreet(0);
    const e = dispatch(byId(root(), 'card-line-1')!, 'mousedown');
    expect(e.defaultPrevented).toBe(true);
    for (const b of all(root()).filter((n) => n.tagName === 'button')) expect(b.getAttribute('tabindex'), b.dataset.id).toBe('-1');
    panel.dispose();
    expect(host.children).toHaveLength(0);
    expect(root().listenerCount()).toBe(0);
  });
});

describe('fiche (DOM) : Qui', () => {
  it('commandant : « Autre unité U » et « Toute la compagnie T » ; T actif est marqué', () => {
    panel = mount();
    showStreet(0);
    expect(labelOf(byId(root(), 'card-who-next')!)).toBe('Autre unité');
    expect(labelOf(byId(root(), 'card-who-all')!)).toBe('Toute la compagnie');
    press(byId(root(), 'card-who-next')!, 'mouse');
    press(byId(root(), 'card-who-all')!, 'mouse');
    press(byId(root(), 'card-who')!, 'mouse');
    expect(calls).toEqual(['who-next:1', 'who-all', 'who-list']);
    showStreet(0, false, { whole: true });
    expect(byId(root(), 'card-who-all')!.classList.contains('is-on')).toBe(true);
  });

  it('chef de groupe : le bouton T dit ce que T choisit vraiment (son groupe, ou sa section), jamais la compagnie', () => {
    panel = mount();
    const sc = chief.core.scope();
    expect(sc.level).toBe('unite');
    const own = chief.core.ctx.squads.get(sc.ownSquadId)!;
    const pt = chief.env.player!;
    const card = buildCard(collectReperes(chief.env).find((r) => r.kind === 'point' || r.kind === 'rue')
      ?? { kind: 'point', key: 'p', x: pt.x + 30, z: pt.z, name: 'Ici' } as Repere, chief.env, null);
    const a = screenArgs(chief, card, card.defaultLine);
    panel.show(card, a.who, card.defaultLine, a.sentence, false, a.extra);
    const t = labelOf(byId(root(), 'card-who-all')!);
    expect(t).toBe(own.kind === 'section' ? 'Toute la section' : 'Tout le groupe');
    expect(t).not.toBe('Toute la compagnie');
  });

  it('fiche d’une de mes unités : Qui imposé, ni « Autre unité » ni T, le nom n’ouvre pas la liste', () => {
    panel = mount();
    const u = boss.env.units.find((q) => q.mine && q.symbol === 'section')!;
    const r = collectReperes(boss.env).find((q) => q.kind === 'unite' && q.squadId === u.squadId)!;
    const card = buildCard(r, boss.env, null);
    expect(card.whoFixed).toEqual([u.squadId]);
    const line = card.lines.findIndex((l) => l.needsWho);
    expect(line).toBeGreaterThanOrEqual(0);
    const who: WhoCandidate = { squadIds: [u.squadId], label: u.name, mode: 'pied', eta: 0, distance: 0, busy: 'sans ordre' };
    const a = screenArgs(boss, card, line);
    panel.show(card, who, line, a.sentence, false, a.extra);
    expect(byId(root(), 'card-who-next')).toBeNull();
    expect(byId(root(), 'card-who-all')).toBeNull();
    expect(byId(root(), 'card-who')!.disabled).toBe(true);
  });

  it('la liste « Qui envoyer ? » : rangées numérotées, la proposée marquée, un clic choisit, des cases puis « Valider »', () => {
    panel = mount();
    const a = showStreet(0);
    const list = a.list.slice();
    const whole = wholeCandidate(street.repere, boss.who);
    if (whole) list.push(whole);
    expect(list.length).toBeGreaterThanOrEqual(3);
    panel.showWho(list, 0, []);
    expect(byId(root(), 'card-line-1')).toBeNull();
    const rows = byClass(root(), 'cc-qrow');
    expect(rows).toHaveLength(list.length);
    expect(rows[0]!.dataset.id).toBe('who-row-1');
    expect(rows[0]!.textContent).toContain(list[0]!.label);
    expect(rows[0]!.textContent).toContain('✓ proposée');
    expect(rows[0]!.classList.contains('is-on')).toBe(true);
    expect(rows[1]!.textContent).not.toContain('proposée');
    press(rows[1]!, 'touch');
    expect(calls).toEqual(['who-pick:1']);
    calls.length = 0;
    press(byId(root(), 'who-tick-1')!, 'mouse');
    press(byId(root(), 'who-tick-3')!, 'mouse');
    // l'écran redessine (ses cochées n'ont pas changé) : les cases cochées au pointeur restent
    panel.showWho(list, 0, []);
    expect(byId(root(), 'who-tick-3')!.classList.contains('is-on')).toBe(true);
    press(byId(root(), 'who-ok')!, 'mouse');
    expect(calls).toEqual(['who-pick:0,2']);
    calls.length = 0;
    // cochées au clavier (Espace) : l'écran les donne
    panel.showWho(list, 1, [1]);
    expect(byId(root(), 'who-tick-2')!.classList.contains('is-on')).toBe(true);
    expect(byId(root(), 'who-tick-1')!.classList.contains('is-on')).toBe(false);
    panel.showWho(list, 1, []);
    press(byId(root(), 'who-ok')!, 'mouse');
    expect(calls).toEqual(['who-pick:1']);
  });
});

describe('fiche (DOM) : confirmation légale (S3) et ordre donné (S4)', () => {
  it('🔒 gaz sur le cortège : les étapes dans l’ordre et « Faire les étapes » si la chaîne est possible ; sinon la raison et seulement « ‹ Retour »', () => {
    for (const g of [boss, chief]) {
      panel = mount();
      const c = mainCrowd(g.env)!;
      const card = buildCard(crowdRepere(c), g.env, 'disperser');
      const gas = [...card.lines, ...card.others].find((l) => l.action.kind === 'verb' && l.action.type === 'disperser_gaz');
      expect(gas, 'ligne du gaz').toBeTruthy();
      expect(gas!.lock).not.toBeNull();
      const who = defaultWho(proposeWho(gas!, card.repere, g.who));
      const model = confirmModel(g, card, gas!, who);
      // le commandant fait lui-même les sommations et autorise le gaz : la chaîne est possible ; le chef de groupe non
      expect(model.canChain).toBe(g === boss);
      panel.showConfirm(model);
      expect(byId(root(), 'card-line-1')).toBeNull();
      expect(byClass(root(), 'cc-title')[0]!.textContent).toBe(model.title);
      expect(labelOf(byId(root(), 'card-back')!)).toBe(BACK_LABEL);
      if (model.reason !== '') {
        // variante du refus : la raison en clair, pas de « Faire les étapes »
        expect(byId(root(), 'card-confirm')).toBeNull();
        expect(all(root()).some((n) => n.textContent === model.reason && visible(n))).toBe(true);
      } else {
        expect(model.canChain).toBe(true);
        expect(labelOf(byId(root(), 'card-confirm')!)).toBe(CHAIN_LABEL);
        const steps = byClass(root(), 'cc-step');
        expect(steps).toHaveLength(model.steps.length);
        expect(steps[0]!.textContent.startsWith('①')).toBe(true);
        press(byId(root(), 'card-confirm')!, 'mouse');
        expect(calls).toEqual(['confirm:chain']);
      }
      calls.length = 0;
    }
    // le chef de groupe ne peut pas lancer la chaîne du gaz (sommations ou plafond) : la raison, sans « Faire les étapes »
    const c = mainCrowd(chief.env)!;
    const card = buildCard(crowdRepere(c), chief.env, 'disperser');
    const gas = [...card.lines, ...card.others].find((l) => l.action.kind === 'verb' && l.action.type === 'disperser_gaz')!;
    const model = confirmModel(chief, card, gas, null);
    expect(model.canChain).toBe(false);
    expect(model.reason).not.toBe('');
    panel = mount();
    panel.showConfirm(model);
    expect(byId(root(), 'card-confirm')).toBeNull();
    expect(all(root()).filter((n) => n.tagName === 'button' && visible(n)).map((b) => b.dataset.id)).toEqual(['card-back']);
  });

  it('⚖ (permis avant la dernière sommation) : « Donner l’ordre quand même » et « Faire d’abord les sommations »', () => {
    panel = mount();
    const c = mainCrowd(boss.env)!;
    const card = buildCard(crowdRepere(c), boss.env, 'disperser');
    const push = card.lines[card.defaultLine]!;
    expect(push.label).toBe('Repousser la foule');
    panel.showConfirm({ ...confirmModel(boss, card, push, null), coercive: true });
    expect(labelOf(byId(root(), 'card-confirm')!)).toBe(ANYWAY_LABEL);
    expect(root().textContent).toContain('L’ordre part avant la dernière sommation');
    press(byId(root(), 'card-confirm')!, 'mouse');
    press(byId(root(), 'card-confirm-sommations')!, 'mouse');
    press(byId(root(), 'card-back')!, 'mouse');
    expect(calls).toEqual(['confirm:anyway', 'confirm:sommations', 'back']);
  });

  it('S4 : « ✓ ORDRE DONNÉ — … » sur la fiche et « Annuler l’ordre X » tant que l’ordre est annulable', () => {
    panel = mount();
    const a = showStreet(0);
    const text = `${a.who!.label} → ${sentTitle(street.lines[0]!, street.repere)}`;
    panel.showSent(text, true);
    const sent = byClass(root(), 'cc-sent-t')[0]!;
    expect(sent.textContent).toBe(`${SENT_PREFIX} — ${text}`);
    expect(sent.textContent).toMatch(/ → Barrer /);
    press(byId(root(), 'card-undo')!, 'mouse');
    expect(calls).toEqual(['undo']);
    // après 5 s : plus d'annulation ; la fiche suivante efface l'en-tête vert
    showStreet(0);
    panel.showSent(text, false);
    expect(byId(root(), 'card-undo')).toBeNull();
    showStreet(0);
    expect(byClass(root(), 'cc-sent-t')).toHaveLength(0);
    // la chaîne légale : l'ordre ne part qu'à la fin, l'en-tête garde le sien (« ✓ ÉTAPES LANCÉES »), pas « ORDRE DONNÉ »
    panel.showSent('✓ ÉTAPES LANCÉES — Dispersion au gaz — Tête de cortège\nl’ordre partira après la dernière étape', false);
    expect(byClass(root(), 'cc-sent-t')[0]!.textContent).toBe('✓ ÉTAPES LANCÉES — Dispersion au gaz — Tête de cortège');
  });
});

describe('fiche (DOM) : téléphone et mots', () => {
  it('téléphone : seule la ligne surlignée montre son explication ; Qui et « Donner l’ordre » sur une rangée, ✕ pour revenir', () => {
    panel = mount();
    showStreet(2, true);
    expect(root().classList.contains('is-compact')).toBe(true);
    const rows = lineRows(root());
    expect(rows).toHaveLength(7);
    const shown = rows.filter((r) => byClass(r, 'cc-exp').length > 0);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.dataset.id).toBe('card-line-3');
    // pas de sous-titre ni de phrase (la carte montre l'aperçu), pas de bouton « ‹ Retour » mais ✕
    expect(byClass(root(), 'cc-say')).toHaveLength(0);
    expect(labelOf(byId(root(), 'card-back')!)).toBe('✕');
    const foot = byClass(root(), 'cc-foot')[0]!;
    expect(foot.textContent).toMatch(/^Qui : /);
    expect(byId(foot, 'card-send')).not.toBeNull();
    expect(byId(foot, 'card-who')).not.toBeNull();
    expect(byId(root(), 'card-who-next')).toBeNull();
  });

  it('téléphone : des repères empilés prennent la place du titre, sur la même rangée (la fiche ne défile pas)', () => {
    panel = mount();
    const stacked = { ...street, stack: [street.repere, { ...street.repere, key: 'autre', name: 'Foule' }] };
    const a = screenArgs(boss, stacked, 0, {});
    panel.show(stacked, a.who, 0, a.sentence, true, { ...a.extra, explainAll: false });
    const top = byClass(root(), 'cc-top')[0]!;
    expect(byClass(top, 'cc-tabs')).toHaveLength(1);
    expect(byClass(root(), 'cc-tabs')).toHaveLength(1);
    expect(byClass(root(), 'cc-title')).toHaveLength(0);
    expect(byId(top, 'card-tab-1')).not.toBeNull();
    // sur PC : le titre reste, les onglets en dessous
    panel.show(stacked, a.who, 0, a.sentence, false, a.extra);
    expect(byClass(root(), 'cc-title')).toHaveLength(1);
    expect(byClass(byClass(root(), 'cc-top')[0]!, 'cc-tabs')).toHaveLength(0);
  });

  it('fenêtre basse sur PC : l’explication de la ligne surlignée seulement (la fiche ne défile jamais)', () => {
    const v = cardView(street, null, 1, { what: '', rule: '' }, false, { ...defaultExtra(false), explainAll: false });
    expect(v.rows.filter((r) => r.showExplain).map((r) => r.index)).toEqual([1]);
  });

  it('aucun bouton de confirmation ne dit « Envoyer » (« Envoyer » est l’intention), sur toutes les fiches de la partie', () => {
    panel = mount();
    let cards = 0;
    for (const r of collectReperes(boss.env)) {
      const card = buildCard(r, boss.env, null);
      if (card.lines.length === 0) continue;
      const a = screenArgs(boss, card, card.defaultLine);
      for (const compact of [false, true]) {
        panel.show(card, a.who, card.defaultLine, a.sentence, compact, { ...a.extra, explainAll: !compact });
        const send = byId(root(), 'card-send')!;
        expect(labelOf(send)).toBe(SEND_LABEL);
        expect(send.textContent).not.toMatch(/Envoyer/);
        // les marques légales ne sont jamais des chiffres de force
        for (const m of byClass(root(), 'cc-lock')) expect(m.textContent).not.toMatch(/force\s*\d/);
      }
      cards++;
    }
    expect(cards).toBeGreaterThan(5);
    for (const label of [CHAIN_LABEL, ANYWAY_LABEL, SEND_LABEL]) expect(label).not.toMatch(/Envoyer/);
  });

  it('les lignes 🔒 disent ce qui manque, en mots', () => {
    panel = mount();
    const card = buildCard(crowdRepere(mainCrowd(boss.env)!), boss.env, 'disperser');
    const i = card.lines.findIndex((l) => l.lock !== null);
    expect(i).toBeGreaterThanOrEqual(0);
    const a = screenArgs(boss, card, i);
    panel.show(card, a.who, i, a.sentence, false, a.extra);
    const row = byId(root(), `card-line-${i + 1}`)!;
    expect(row.textContent).toContain('🔒');
    expect(byClass(row, 'cc-lock')[0]!.textContent).toContain(card.lines[i]!.lock!.text);
    expect(card.lines[i]!.lock!.text).toMatch(/sommations|autoriser/);
  });
});

describe('fiche : feuille de style et contrat avec l’écran', () => {
  it('lignes de 52 px (40 au téléphone), boutons de 44 px (48 au doigt), marque « ▶ » de la ligne surlignée', () => {
    expect(CARD_CSS).toMatch(/\.cc-row\{[^}]*min-height:52px/);
    expect(CARD_CSS).toMatch(/\.cc\.is-compact \.cc-row\{[^}]*min-height:40px/);
    expect(CARD_CSS).toMatch(/\.cc-btn\{[^}]*min-height:44px/);
    expect(CARD_CSS).toMatch(/\.cm-coarse \.cc-btn\{min-height:48px\}/);
    expect(CARD_CSS).toContain('[hidden]{display:none !important}');
  });

  it('CardPanel se branche tel quel sur l’écran (CardPanelLike de tacticalScreen.ts)', () => {
    panel = mount();
    const like: CardPanelLike = panel;
    expect(typeof like.show).toBe('function');
    expect(typeof like.showWho).toBe('function');
    expect(typeof like.showConfirm).toBe('function');
    expect(typeof like.showSent).toBe('function');
  });
});
