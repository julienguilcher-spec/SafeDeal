// Carte de commandement au clavier seul (MacBook Air sans souris) : la table des touches du §5.1, les lettres communes à
// l'AZERTY et au QWERTY, l'ordre d'Échap, l'intention « collante », la garde d'Entrée après un envoi, la lecture seule ;
// la pastille légale, le bandeau de la lecture seule, la fiche « ordre d'abord » ; puis le parcours « B, Entrée,
// Entrée, Entrée » sur les vraies rues de la place de la Concorde.
import { describe, expect, it } from 'vitest';
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
import type { CommandLevel } from '@/ui/command/api';
import type { IntentId, LegalStatus } from '@/ui/command/cardTypes';
import { INTENTS, buildCard, intentCandidates } from '@/ui/command/intents';
import { cardEnvFromCore, collectReperes, unitRepere } from '@/ui/command/reperes';
import {
  ENTER_GUARD, HELP_LINES, HELP_TEXT, SAFE_LETTERS, UNDO_SECONDS, backStep, cycleUnitKey, enterAllowed, isSticky, keyboardSections, mapKey,
  sectionKeyIndex, stickyNext, unitsByRecentOrder,
} from '@/ui/command/tacticalKeys';
import type { BackView, KeyCommand } from '@/ui/command/tacticalKeys';
import {
  TacticalState, arrowChar, fixedCandidate, issuerTitle, legalChip, readOnlyBanner, readOnlyFrame, shortStreet, todoReperes, withVerbFirst,
} from '@/ui/command/tacticalState';
import { MapTransform } from '@/ui/maps/transform';

const CMD = (level: CommandLevel = 'tout', card = false) => ({ level, card });
const key = (code: string, shift = false, level: CommandLevel = 'tout', card = false): KeyCommand => mapKey(code, shift, CMD(level, card));

describe('carte de commandement — touches (§5.1)', () => {
  it('chaque touche du tableau donne sa commande', () => {
    // intentions
    expect(key('KeyE')).toEqual({ kind: 'intent', id: 'envoyer' });
    expect(key('KeyB')).toEqual({ kind: 'intent', id: 'bloquer' });
    expect(key('KeyN')).toEqual({ kind: 'intent', id: 'encercler' });
    expect(key('KeyD')).toEqual({ kind: 'intent', id: 'disperser' });
    expect(key('KeyI')).toEqual({ kind: 'intent', id: 'interpeller' });
    expect(key('KeyS')).toEqual({ kind: 'intent', id: 'secours' });
    // flèches : la visée saute ; Maj : visée libre
    for (const [code, dir] of [['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowUp', 'up'], ['ArrowDown', 'down']] as const) {
      expect(key(code)).toEqual({ kind: 'arrow', dir });
      expect(key(code, true)).toEqual({ kind: 'freeArrow', dir });
    }
    expect(key('Enter')).toEqual({ kind: 'accept' });
    expect(key('NumpadEnter')).toEqual({ kind: 'accept' });
    expect(key('Enter', true)).toEqual({ kind: 'whoList' });
    // chiffres : rangée du haut (AZERTY sans Maj : même code) et pavé numérique ; 0 = « Autres ordres ici… »
    for (let n = 0; n <= 9; n++) {
      expect(key('Digit' + n)).toEqual({ kind: 'digit', n });
      expect(key('Numpad' + n)).toEqual({ kind: 'digit', n });
    }
    expect(key('KeyU')).toEqual({ kind: 'unit', step: 1 });
    expect(key('KeyU', true)).toEqual({ kind: 'unit', step: -1 });
    expect(key('KeyT')).toEqual({ kind: 'whole' });
    expect(key('Space')).toEqual({ kind: 'todo', step: 1 });
    expect(key('Space', true)).toEqual({ kind: 'todo', step: -1 });
    expect(key('KeyL')).toEqual({ kind: 'legal' });
    expect(key('KeyC')).toEqual({ kind: 'stations' });
    expect(key('KeyO')).toEqual({ kind: 'more' });
    expect(key('KeyR')).toEqual({ kind: 'search' });
    expect(key('KeyG')).toEqual({ kind: 'me' });
    expect(key('KeyJ')).toEqual({ kind: 'journal' });
    expect(key('KeyV')).toEqual({ kind: 'slow' });
    expect(key('KeyH')).toEqual({ kind: 'help' });
    expect(key('KeyX')).toEqual({ kind: 'undo' });
    expect(key('KeyF')).toEqual({ kind: 'filter' });
    expect(key('Equal')).toEqual({ kind: 'zoom', step: 1 });
    expect(key('NumpadAdd')).toEqual({ kind: 'zoom', step: 1 });
    expect(key('Minus')).toEqual({ kind: 'zoom', step: -1 });
    expect(key('Escape')).toEqual({ kind: 'back' });
    expect(key('Backspace')).toEqual({ kind: 'back' });
    expect(key('Tab')).toEqual({ kind: 'close' });
    // P / Maj + P : la proposition de l'adjoint (HUD), pas l'écran ; Y : carte d'appel (équipe « modes »)
    expect(key('KeyP')).toEqual({ kind: 'none' });
    expect(key('KeyY')).toEqual({ kind: 'none' });
  });

  it('lettres : seulement celles qui sont au même endroit en AZERTY et en QWERTY (ni A, Q, Z, W, M), jamais Y', () => {
    const used: string[] = [];
    for (let c = 65; c <= 90; c++) {
      const code = 'Key' + String.fromCharCode(c);
      for (const shift of [false, true]) {
        if (key(code, shift).kind !== 'none') used.push(code);
      }
    }
    expect(used.length).toBeGreaterThan(15);
    for (const code of used) {
      expect(['KeyA', 'KeyQ', 'KeyZ', 'KeyW', 'KeyM', 'KeyY']).not.toContain(code);
      expect(SAFE_LETTERS.has(code)).toBe(true);
    }
    // les intentions du bas sont lues sur les mêmes codes
    for (const i of INTENTS) expect(key(i.code)).toEqual({ kind: 'intent', id: i.id });
  });

  it('lecture seule : seules C, G, H, = −, Tab (et Échap) servent', () => {
    const allowed = new Set(['KeyC', 'KeyG', 'KeyH', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Tab', 'Escape', 'Backspace']);
    const codes = ['Enter', 'NumpadEnter', 'Space', 'ArrowLeft', 'ArrowUp', 'Digit1', 'Numpad4', 'Equal', 'Minus', 'Tab', 'Escape', 'Backspace'];
    for (let c = 65; c <= 90; c++) codes.push('Key' + String.fromCharCode(c));
    for (const code of codes) {
      for (const shift of [false, true]) {
        const k = mapKey(code, shift, CMD('lecture'));
        if (allowed.has(code)) expect(k.kind).not.toBe('none');
        else expect(k.kind).toBe('none');
      }
    }
    expect(mapKey('KeyB', false, CMD('lecture')).kind).toBe('none');
    expect(mapKey('KeyC', false, CMD('lecture'))).toEqual({ kind: 'stations' });
  });

  it('aide (H) : le texte exact du §5.1, une idée par ligne', () => {
    expect(HELP_TEXT.startsWith('Flèches : d’un endroit à l’autre (Maj : précis) · Entrée : que faire ici / envoyer · E B N D I S')).toBe(true);
    expect(HELP_TEXT.endsWith('G : moi · Échap : revenir · Tab : fermer')).toBe(true);
    expect(HELP_LINES.length).toBe(14);
    for (const l of HELP_LINES) expect(l).not.toMatch(/\bF1\b|_/);
  });
});

describe('carte de commandement — Échap, intention collante, garde d’Entrée', () => {
  const base: BackView = { sheet: 'none', card: false, othersOpen: false, intent: null, where: false };

  it('Échap : liste → confirmation → « Autres » → fiche (et l’intention) → choix du lieu → intention → repos → fermer', () => {
    // liste Qui ouverte par-dessus la fiche d'une intention, « Autres » déplié
    let s: BackView | null = { sheet: 'qui', card: true, othersOpen: true, intent: 'bloquer', where: false };
    s = backStep(s)!;
    expect(s).toEqual({ sheet: 'card', card: true, othersOpen: true, intent: 'bloquer', where: false });
    s = backStep(s)!;
    expect(s.othersOpen).toBe(false);
    expect(s.card).toBe(true);
    s = backStep(s)!;
    expect(s).toEqual({ sheet: 'none', card: false, othersOpen: false, intent: null, where: false });
    expect(backStep(s)).toBeNull();
    // confirmation légale → fiche
    expect(backStep({ ...base, sheet: 'confirm', card: true, intent: 'disperser' })).toEqual({ ...base, sheet: 'card', card: true, intent: 'disperser' });
    // « Plus… », « Cadre légal », « Suivi », aide : la feuille seule se referme
    for (const sheet of ['more', 'legal', 'suivi', 'help'] as const) {
      expect(backStep({ ...base, sheet })).toEqual(base);
      expect(backStep({ ...base, sheet, card: true })).toEqual({ ...base, sheet: 'card', card: true });
    }
    // « OÙ L'ENVOYER ? » sans fiche (aucun lieu encore) : Échap l'abandonne (rien n'est engagé)
    expect(backStep({ ...base, where: true })).toEqual(base);
    // intention sans fiche : Échap la termine
    expect(backStep({ ...base, intent: 'secours' })).toEqual(base);
  });

  it('intention collante : B, S et I passent au candidat suivant ; E, N, D reviennent au repos', () => {
    const sticky: IntentId[] = ['bloquer', 'secours', 'interpeller'];
    for (const i of INTENTS) {
      expect(isSticky(i.id)).toBe(sticky.includes(i.id));
      expect(i.sticky).toBe(sticky.includes(i.id));
    }
    expect(stickyNext('bloquer', 0, 7)).toBe(1);
    expect(stickyNext('bloquer', 5, 7)).toBe(6);
    expect(stickyNext('bloquer', 6, 7)).toBe(-1); // plus de rue : fin de l'intention
    expect(stickyNext('secours', 0, 2)).toBe(1);
    expect(stickyNext('interpeller', 0, 3)).toBe(1);
    for (const id of ['envoyer', 'encercler', 'disperser'] as const) expect(stickyNext(id, 0, 9)).toBe(-1);
    expect(stickyNext(null, 0, 9)).toBe(-1);
  });

  it('Entrée ignorée pendant 0,6 s après un envoi (double appui, répétition)', () => {
    expect(ENTER_GUARD).toBeCloseTo(0.6);
    expect(enterAllowed(10, -Infinity)).toBe(true);
    expect(enterAllowed(10.0, 10.0)).toBe(false);
    expect(enterAllowed(10.59, 10.0)).toBe(false);
    expect(enterAllowed(10.6, 10.0)).toBe(true);
    expect(UNDO_SECONDS).toBe(5);
  });

  it('état : ouvrir une fiche pose la visée ; la refermer garde l’intention ; repos = rien en attente', () => {
    const st = new TacticalState();
    const r = { kind: 'rue' as const, key: 'rue:1', x: 0, z: 0, name: 'Rue Royale' };
    st.intent = 'bloquer';
    st.openCard(r);
    expect(st.visee).toBe(r);
    expect(st.sheet).toBe('card');
    expect(st.card!.chosen).toBe(false);
    st.whole = true;
    st.closeCard();
    expect(st.card).toBeNull();
    expect(st.whole).toBe(false);
    expect(st.intent).toBe('bloquer');
    st.rest();
    expect(st.intent).toBeNull();
    // l'ancienne option des passants ne peut plus transformer « Barrer la rue » en « passants admis »
    expect(st.togglePassersby()).toBe(false);
    expect(st.passersby).toBe(false);
  });
});

describe('carte de commandement — unités au clavier', () => {
  const units = [
    { key: 1, squadId: 1, parentKey: 0, t: -Infinity },
    { key: 2, squadId: 2, parentKey: 1, t: 30 },
    { key: 3, squadId: 3, parentKey: 1, t: 90 },
    { key: 4, squadId: 4, parentKey: 1, t: -Infinity },
  ];
  it('U au repos : l’ordre le plus récent d’abord, puis l’arborescence', () => {
    expect(unitsByRecentOrder(units, (u) => u.t).map((u) => u.key)).toEqual([3, 2, 1, 4]);
  });
  it('choix des unités (nasse) : sections, unité suivante, chiffres', () => {
    expect(keyboardSections(units, () => true).map((u) => u.key)).toEqual([2, 3, 4]);
    expect(cycleUnitKey(units, (id) => id > 2, 0, 1)).toBe(3);
    expect(sectionKeyIndex('Numpad3')).toBe(2);
  });
});

describe('carte de commandement — pastille légale, lecture seule', () => {
  const chip = (o: Partial<Parameters<typeof legalChip>[0]>) => legalChip({
    sommations: 0, lawful: 1, authorised: 1, canAuthorize: true, level: 'tout', compact: false, chain: null, ...o,
  });

  it('« ⚖ Sommations 0/3 · Force : mains nues » ; téléphone « ⚖ Sommations 0/3 » ; jamais un chiffre de force', () => {
    expect(chip({}).text).toBe('⚖ Sommations 0/3 · Force : mains nues');
    expect(chip({}).tone).toBe('neutral');
    expect(chip({ compact: true }).text).toBe('⚖ Sommations 0/3');
    expect(chip({ sommations: 3, lawful: 3, authorised: 3 })).toEqual({ text: '⚖ Sommations faites · Force : gaz', tone: 'ok' });
    expect(chip({ sommations: 1, lawful: 1, authorised: 3 })).toEqual({ text: '⚖ Sommations 1/3 · Force : gaz ⚠', tone: 'warn' });
    expect(chip({ canAuthorize: false, level: 'unite' }).text).toBe('⚖ Force : mains nues (fixée par le commandant)');
    for (let f = 0; f <= 4; f++) expect(chip({ authorised: f as 0 }).text.replace(/\d\/3/, '')).not.toMatch(/\d/);
  });

  it('chaîne légale en cours : « ⚖ Sommation 2/3 dans 8 s »', () => {
    const st: LegalStatus = { stage: 'sommation', sommation: 1, nextIn: 7.2, text: '', reason: '', title: '' };
    expect(chip({ chain: st })).toEqual({ text: '⚖ Sommation 2/3 dans 8 s', tone: 'chain' });
    expect(chip({ chain: { ...st, stage: 'fini' } }).text).toBe('⚖ Sommations 0/3 · Force : mains nues');
  });

  it('bandeau « ORDRE DU COMMANDANT » (PC) et deux lignes courtes (téléphone), l’ordre jamais coupé', () => {
    const brief = {
      command: { from: 'MISTRAL', by: 'Commandant Carlier', text: 'Tenir la ligne', to: 'Groupe MISTRAL 1 ALFA', place: 'Avenue de la République', x: 0, z: 0, distance: 235, at: 40 },
      chief: { id: 9, label: 'Brigadier-chef Camara', role: 'chef de groupe', x: 0, z: 0, distance: 5 },
      regroup: false,
      instruction: { source: 'ordre', title: 'Tenez la ligne', detail: '', target: 'point' },
    } as unknown as Parameters<typeof readOnlyBanner>[0];
    const pc = readOnlyBanner(brief, 100, false, '↗');
    expect(pc.line1).toBe('ORDRE DU COMMANDANT : Tenir la ligne — Avenue de la République · 235 m ↗');
    expect(pc.line2).toBe('Donné il y a 1 min à votre groupe MISTRAL 1 ALFA. Suivez : Brigadier-chef Camara (5 m).');
    const tel = readOnlyBanner(brief, 100, true, '↗');
    expect(tel.line1).toBe('Ordre : Tenir la ligne · Av. de la République · 235 m ↗');
    expect(tel.line2).toBe('Suivez Camara · 5 m');
    expect(issuerTitle('Capitaine Durand', 'MISTRAL')).toBe('ORDRE DU CAPITAINE');
    expect(issuerTitle('Officier Martin', 'MISTRAL')).toBe('ORDRE DE L’OFFICIER');
    expect(issuerTitle('', 'MISTRAL')).toBe('ORDRE DE MISTRAL');
    expect(shortStreet('Boulevard Saint-Michel')).toBe('Bd Saint-Michel');
    expect(arrowChar(10, -10)).toBe('↗');
    expect(arrowChar(0, 5)).toBe('↓');
  });

  it('équipage de patrouille sans ordre d’en haut : le bandeau dit l’appel de CENTRAL pris, pas « Aucun ordre »', () => {
    const brief = { command: null, chief: null, regroup: false, instruction: { source: 'mission', title: '', detail: '', target: 'none' } } as unknown as Parameters<typeof readOnlyBanner>[0];
    const call = { label: 'Rassemblement non déclaré', place: 'Boulevard Haussmann', x: 0, z: 0, onSite: false, distance: 1200 };
    const pc = readOnlyBanner(brief, 100, false, '↗', call);
    const sp = (t: string): string => t.replace(/\u00a0/g, ' ');
    expect(sp(pc.line1)).toBe('Appel de CENTRAL : Rassemblement non déclaré — Boulevard Haussmann · 1,2 km ↗');
    expect(pc.line2).toContain('En route');
    const tel = readOnlyBanner(brief, 100, true, '↗', { ...call, onSite: true });
    expect(sp(tel.line1)).toBe('Appel : Rassemblement non déclaré · Bd Haussmann · 1,2 km ↗');
    expect(tel.line2).toContain('Sur place');
    expect(readOnlyBanner(brief, 100, false, '').line1).toBe('Aucun ordre reçu pour l’instant.');
  });

  it('cadrage de la lecture seule : le joueur et sa destination sont sur la carte', () => {
    const v = new MapTransform();
    v.setSize(1280 - 340, 800 - 44 - 50);
    const me = { x: 300, z: -200 };
    const dest = { x: 900, z: 400 };
    readOnlyFrame(v, me, dest);
    const b = v.visibleBounds({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 });
    for (const p of [me, dest]) {
      expect(p.x).toBeGreaterThan(b.minX);
      expect(p.x).toBeLessThan(b.maxX);
      expect(p.z).toBeGreaterThan(b.minZ);
      expect(p.z).toBeLessThan(b.maxZ);
    }
  });
});

describe('carte de commandement — vraie partie (place de la Concorde, commandant)', () => {
  it('B, Entrée, Entrée, Entrée : la visée passe à la rue suivante ; « ordre d’abord » ; Qui imposé ; « À traiter »', async () => {
    const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    const t = createTestContext({ seed: 21, strict: false, modules: [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command] });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.4,
      volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
    } as never);
    t.step(3);
    const core = t.ctx.service<CommandCore>('ui.command')!;
    const env = cardEnvFromCore(core);
    const st = new TacticalState();
    // B : la visée sur la meilleure rue d'issue libre, « Barrer la rue » surlignée
    const cands = intentCandidates('bloquer', env, env.player!);
    expect(cands.length).toBeGreaterThan(3);
    st.intent = 'bloquer';
    st.candidates = cands;
    st.candIndex = 0;
    st.openCard(cands[0]!);
    const names: string[] = [st.visee!.name];
    // trois Entrée : à chaque envoi, la rue suivante (l'intention reste active)
    for (let i = 0; i < 3; i++) {
      const next = stickyNext(st.intent, st.candIndex, st.candidates.length);
      expect(next).toBe(i + 1);
      st.candIndex = next;
      st.openCard(st.candidates[next]!);
      const card = buildCard(st.visee!, env, st.intent);
      expect(card.lines[card.defaultLine]!.label).toBe('Barrer la rue');
      names.push(st.visee!.name);
    }
    expect(new Set(st.candidates.slice(0, 4).map((r) => r.key)).size).toBe(4);
    expect(names.every((n) => n.trim() !== '')).toBe(true);
    // « Disperser » n'est pas collant : retour au repos après l'envoi
    expect(stickyNext('disperser', 0, intentCandidates('disperser', env, env.player!).length)).toBe(-1);
    // « Plus… › Tous les ordres › Se replier ici » sur une rue : la ligne est construite et surlignée, parmi les six
    const street = buildCard(cands[0]!, env, null);
    const first = withVerbFirst(street, 'repli', env);
    expect(first.lines.length).toBeLessThanOrEqual(6);
    expect(first.lines[first.defaultLine]!.action).toMatchObject({ kind: 'verb', type: 'repli' });
    // un verbe déjà présent (Barrer) n'est pas dupliqué
    const barrer = withVerbFirst(street, 'couper_circulation', env);
    expect(barrer.lines.filter((l) => l.action.kind === 'verb' && l.action.type === 'couper_circulation' && (l.action.targetId ?? 0) === 0).length).toBe(1);
    expect(barrer.defaultLine).toBe(0);
    // fiche d'une de mes sections : Qui imposé, délai jusqu'à la rue (à pied ou en véhicules au-delà de 250 m)
    const section = env.units.find((u) => u.mine && u.symbol === 'section')!;
    const fixed = fixedCandidate(env, [section.squadId], cands[0]!);
    expect(fixed.squadIds).toEqual([section.squadId]);
    expect(fixed.label).toBe(section.name);
    expect(fixed.eta).toBeGreaterThan(0);
    expect(buildCard(unitRepere(section), env, null).whoFixed).toEqual([section.squadId]);
    // « À traiter » : trois au plus, chacun est un repère de la scène
    const todo = todoReperes(env);
    expect(todo.length).toBeLessThanOrEqual(3);
    const keys = new Set(collectReperes(env).map((r) => r.key));
    for (const r of todo) expect(keys.has(r.key)).toBe(true);
  }, 300000);
});
