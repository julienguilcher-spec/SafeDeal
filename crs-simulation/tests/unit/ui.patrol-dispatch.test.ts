// Interface du mode Patrouille : mise en forme de la carte d'appel et du compte rendu de vacation (src/ui/patrol/format.ts),
// touche Y réservée (src/input/bindings.ts) ; puis, sur une vraie vacation (vrai plan de Paris), la carte lit un vrai
// appel de CENTRAL et les renforts qu'elle propose sont exactement ceux que le répartiteur accepte.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { BINDINGS_SECTION, BindingStore, DEFAULT_KBM, RESERVED_KBM, isValidCode } from '@/input/bindings';
import { KeyLabels } from '@/input/labels';
import type { CallKind, CallState, DispatchCall, VacationSummary } from '@/gameplay/patrols/model';
import { PATROL_MODE_SERVICE, sanitizePatrolSetup, vacationSessionConfig } from '@/gameplay/patrols/model';
import type { PatrolModeApi } from '@/gameplay/patrols/model';
import {
  BACKUP_KINDS, CALL_KIND_LIST, backupOptions, callLine, callOutcome, callRecap, callTitle, debriefTitle, stateLabel, summaryLines,
} from '@/ui/patrol/format';
import { createObjectives } from '@/ui/core/objectives';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';

const NBSP = ' ';
const ALL_STATES: readonly CallState[] = ['annonce', 'acceptee', 'sur_place', 'confiee', 'declinee', 'terminee'];

function fakeCall(over: Partial<DispatchCall> = {}): DispatchCall {
  return {
    id: 1, kind: 'rassemblement', label: 'Rassemblement non déclaré', place: 'place de l’Opéra', x: 0, z: 0, people: 120,
    priority: 2, t: 0, state: 'annonce', assignedTo: '', backup: [], foyerId: 3, manifId: 0, fireId: 0, incidentId: 0,
    ...over,
  };
}

describe('carte d’appel : mise en forme', () => {
  it('callTitle couvre toutes les natures d’appel, en capitales, et reprend le libellé précis de l’appel', () => {
    const titles = new Set<string>();
    for (const kind of CALL_KIND_LIST) {
      const title = callTitle(kind);
      expect(title.length).toBeGreaterThan(5);
      expect(title).toBe(title.toLocaleUpperCase('fr-FR'));
      expect(title).not.toMatch(/undefined|null|NaN/);
      titles.add(title);
    }
    expect(titles.size).toBe(CALL_KIND_LIST.length);
    // toutes les CallKind du contrat sont dans la liste
    const kinds: Record<CallKind, true> = { rassemblement: true, casseurs: true, blocage: true, manif_sauvage: true, feu: true };
    expect([...CALL_KIND_LIST].sort()).toEqual(Object.keys(kinds).sort());
    expect(callTitle('rassemblement', 'Rassemblement non déclaré')).toBe('RASSEMBLEMENT NON DÉCLARÉ');
    expect(callTitle('feu', 'Feu de véhicule')).toBe('FEU DE VÉHICULE');
    expect(callTitle('feu', '   ')).toBe(callTitle('feu'));
  });

  it('callLine : lieu en capitale, « ~ » devant l’effectif, mètres sous 1 km, kilomètres avec une virgule', () => {
    expect(callLine(fakeCall(), 1400)).toBe(`Place de l’Opéra · ~120${NBSP}pers. · 1,4${NBSP}km`);
    expect(callLine(fakeCall(), 850)).toBe(`Place de l’Opéra · ~120${NBSP}pers. · 850${NBSP}m`);
    expect(callLine(fakeCall(), 999)).toMatch(/1[\s ]?000 m$|1,0 km$/);
    expect(callLine(fakeCall(), 2000)).toMatch(/2,0 km$/);
    expect(callLine(fakeCall({ people: 1250 }), 30)).toContain(`~1 250${NBSP}pers.`);
    // un feu n'a pas d'effectif
    const fire = callLine(fakeCall({ kind: 'feu', label: 'Feu de poubelles', place: 'rue de Rivoli', people: 0 }), 600);
    expect(fire).toBe(`Rue de Rivoli · 600${NBSP}m`);
    expect(fire).not.toContain('~');
    // position du joueur inconnue : pas de distance ; lieu vide : jamais « undefined »
    expect(callLine(fakeCall({ place: '' }), -1)).toBe(`Lieu à préciser · ~120${NBSP}pers.`);
    expect(callLine(fakeCall({ people: Number.NaN }), Number.NaN)).toBe('Place de l’Opéra');
  });

  it('stateLabel donne un libellé français à chaque état', () => {
    const seen = new Set<string>();
    for (const s of ALL_STATES) {
      const l = stateLabel(s);
      expect(l.length).toBeGreaterThan(3);
      seen.add(l);
    }
    expect(seen.size).toBe(ALL_STATES.length);
    expect(stateLabel('sur_place')).toBe('Sur place');
  });

  it('renforts proposés : rien avant la prise d’appel ; compagnie seulement sur rassemblement ou manifestation sauvage, une à la fois', () => {
    const ann = backupOptions(fakeCall(), []);
    expect(ann.map((o) => o.kind)).toEqual([...BACKUP_KINDS]);
    expect(ann.every((o) => !o.available && o.reason !== '')).toBe(true);
    const taken = fakeCall({ state: 'sur_place', backup: ['samu'] });
    const opts = backupOptions(taken, [taken]);
    expect(opts.find((o) => o.kind === 'samu')!.available).toBe(false);
    expect(opts.find((o) => o.kind === 'samu')!.reason).toBe('Déjà demandé');
    expect(opts.find((o) => o.kind === 'compagnie')!.available).toBe(true);
    expect(opts.find((o) => o.kind === 'patrouille')!.available).toBe(true);
    const fire = fakeCall({ id: 2, kind: 'feu', state: 'acceptee', people: 0 });
    expect(backupOptions(fire, [fire]).find((o) => o.kind === 'compagnie')!.available).toBe(false);
    // une compagnie déjà engagée sur un autre appel encore ouvert
    const other = fakeCall({ id: 9, kind: 'manif_sauvage', state: 'confiee', backup: ['compagnie'] });
    expect(backupOptions(taken, [other, taken]).find((o) => o.kind === 'compagnie')!.available).toBe(false);
    // … libérée quand cet appel est terminé
    other.state = 'terminee';
    expect(backupOptions(taken, [other, taken]).find((o) => o.kind === 'compagnie')!.available).toBe(true);
  });
});

describe('compte rendu de vacation', () => {
  const empty: VacationSummary = { duration: 0, calls: 0, accepted: 0, resolved: 0, delegated: 0, declined: 0, arrests: 0, injured: 0, backups: 0 };
  const full: VacationSummary = { duration: 1512, calls: 9, accepted: 5, resolved: 4, delegated: 4, declined: 2, arrests: 3, injured: 1, backups: 2 };

  it('summaryLines : 7 lignes, sans NaN, pour un résumé nul, plein, absent ou invalide', () => {
    for (const s of [empty, full, null, undefined, { duration: Number.NaN, calls: Number.POSITIVE_INFINITY } as Partial<VacationSummary>]) {
      const lines = summaryLines(s);
      expect(lines).toHaveLength(7);
      for (const l of lines) {
        expect(l.label.length).toBeGreaterThan(3);
        expect(`${l.label} ${l.value} ${l.note}`).not.toMatch(/NaN|undefined|null|Infinity/);
        expect(l.value.length).toBeGreaterThan(0);
      }
    }
    const lines = summaryLines(full);
    expect(lines.map((l) => l.label)).toEqual([
      'Durée de la vacation', 'Appels reçus', 'Appels pris', 'Appels réglés', 'Appels confiés à d’autres patrouilles', 'Interpellations', 'Blessés',
    ]);
    expect(lines.map((l) => l.value)).toEqual([`25${NBSP}min`, '9', '5', '4', '4', '3', '1']);
    expect(lines[2]!.note).toBe('2 demandes de renfort');
    expect(lines[4]!.note).toBe('dont 2 déclinés');
    expect(summaryLines(empty)[0]!.value).toBe(`0${NBSP}s`);
    expect(summaryLines(empty).every((l) => l.note === '')).toBe(true);
  });

  it('titre, récapitulatif et issue des appels', () => {
    expect(debriefTitle('BAC 75N')).toBe('Fin de vacation — BAC 75N');
    expect(debriefTitle('')).toBe('Fin de vacation');
    expect(callRecap(fakeCall())).toBe('Rassemblement non déclaré — place de l’Opéra');
    expect(callOutcome(fakeCall({ state: 'confiee', assignedTo: 'TV 75-09' }), 'BAC 75N')).toBe('Confié à TV 75-09');
    expect(callOutcome(fakeCall({ state: 'terminee', assignedTo: 'BAC 75N' }), 'BAC 75N')).toBe('Traité par votre équipage (BAC 75N)');
    expect(callOutcome(fakeCall({ state: 'terminee', assignedTo: 'TV 75-03' }), 'BAC 75N')).toBe('Traité par TV 75-03');
    for (const s of ALL_STATES) expect(callOutcome(fakeCall({ state: s }), 'BAC 75N')).not.toMatch(/undefined|^$/);
  });
});

describe('touche Y réservée aux appels de CENTRAL', () => {
  it('isValidCode(\'kbm\', \'KeyY\') === false, et aucune action ne l’utilise par défaut', () => {
    expect(isValidCode('kbm', 'KeyY')).toBe(false);
    expect(RESERVED_KBM.KeyY).toBe('appels de CENTRAL');
    for (const codes of Object.values(DEFAULT_KBM)) expect(codes as readonly string[]).not.toContain('KeyY');
    // la manette n'est pas concernée
    expect(isValidCode('gamepad', 'B3')).toBe(true);
  });

  it('une réaffectation sur Y est refusée, et une sauvegarde qui la contiendrait est nettoyée', () => {
    const store = new BindingStore(null);
    expect(store.set('kbm', 'interact', 0, 'KeyY')).toBeNull();
    expect(store.get('kbm', 'interact')).not.toContain('KeyY');
    // sauvegarde d'une version où Y était libre : la touche est retirée à la lecture
    const data: Record<string, unknown> = { [BINDINGS_SECTION]: { v: 1, kbm: { interact: ['KeyY', 'KeyK'] }, gamepad: {} } };
    const save = {
      read<T>(section: string, fallback: T): T { return section in data ? (data[section] as T) : fallback; },
      write<T>(section: string, value: T): void { data[section] = value; },
      remove(section: string): void { delete data[section]; },
    };
    const restored = new BindingStore(save);
    expect(restored.get('kbm', 'interact')).toEqual(['KeyK']);
    expect(restored.actionsFor('kbm', 'KeyY')).toEqual([]);
  });

  it('libellé : « Y » en AZERTY et en QWERTY, « Z » en QWERTZ', () => {
    expect(new KeyLabels('azerty').label('KeyY')).toBe('Y');
    expect(new KeyLabels('qwerty').label('KeyY')).toBe('Y');
    expect(new KeyLabels('qwertz').label('KeyY')).toBe('Z');
  });
});

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const SIM = [world, roles, people, vehicles, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, patrols, objectives];

describe('carte d’appel sur une vraie vacation', () => {
  it('l’appel annoncé se lit sans trou ; les renforts proposés sont ceux que le répartiteur accepte', async () => {
    const seed = 5;
    const t = createTestContext({ seed, strict: false, modules: SIM });
    await t.start(vacationSessionConfig(sanitizePatrolSetup({ seed, crew: 'bac', seat: 'conducteur', departId: 'bac-75n', rythme: 'agite', premier: 5 })));
    const ctx = t.ctx;
    const api = ctx.require<PatrolModeApi>(PATROL_MODE_SERVICE);
    expect(api.active).toBe(true);
    const end = ctx.clock.now + 12;
    while (!api.current && ctx.clock.now < end) t.step(0.5);
    const call = api.current!;
    expect(call).not.toBeNull();
    const me = ctx.player.person()!;
    const d = Math.hypot(me.x - call.x, me.z - call.z);
    const title = callTitle(call.kind, call.label);
    const line = callLine(call, d);
    console.log(`${title} — ${line} (${stateLabel(call.state)})`);
    expect(title).toBe(call.label.toLocaleUpperCase('fr-FR'));
    expect(line).toMatch(/\d(,\d)? (m|km)$/);
    expect(`${title} ${line}`).not.toMatch(/undefined|NaN|null/);
    if (call.people > 0) expect(line).toContain('~');
    // avant la prise d'appel, aucun renfort n'est proposé, et le répartiteur les refuse en effet
    for (const o of backupOptions(call, api.calls)) {
      expect(o.available).toBe(false);
      expect(api.requestBackup(call.id, o.kind)).toBe(false);
    }
    expect(api.accept(call.id)).toBe(true);
    expect(stateLabel(call.state)).toBe('En route');
    // la compagnie : proposée si et seulement si le répartiteur l'accepte
    const company = backupOptions(call, api.calls).find((o) => o.kind === 'compagnie')!;
    expect(api.requestBackup(call.id, 'compagnie')).toBe(company.available);
    // un renfort déjà demandé n'est plus proposé
    if (company.available) expect(backupOptions(call, api.calls).find((o) => o.kind === 'compagnie')!.available).toBe(false);
    // pompiers et SAMU : toujours proposés, toujours acceptés (service des secours présent)
    expect(backupOptions(call, api.calls).find((o) => o.kind === 'samu')!.available).toBe(true);
    expect(api.requestBackup(call.id, 'samu')).toBe(true);
    expect(backupOptions(call, api.calls).find((o) => o.kind === 'samu')!.reason).toBe('Déjà demandé');
    const lines = summaryLines(api.summary());
    expect(lines).toHaveLength(7);
    expect(lines[1]!.value).toBe(String(api.summary().calls));
    expect(lines.map((l) => l.value + l.note).join(' ')).not.toMatch(/NaN|undefined/);
  }, 120_000);
});
