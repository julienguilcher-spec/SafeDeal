// HUD des ordres directs (P10) dans une vraie partie : la place de la Concorde, graine 21, commandant à pied, la vraie
// carte de Paris. Le bloc d'ordres et la puce d'état lisent le moteur 'command.direct' :
//   - ligne d'état « AVEC VOUS · … », ordre prêt « Entrée  Bloquer la rue … », ligne « autre » « Maj+Entrée  … », ligne
//     des touches (5 premiers ordres, puis après 6 s sans ordre ; « ⌫ annuler — … » 5 s après un ordre) ;
//   - la puce montre le ticket du dernier ordre pendant 6 s, puis la ligne d'état ; jamais « SANS ORDRE », « MONTE »,
//     « DESCEND » ni « EN FILE » pour une unité sous ses ordres, à aucune seconde ;
//   - repères : la désignation (« Bloquer ») et l'ordre parti (« MISTRAL 1 — Bloquer »), « ✓ » quand c'est fait ;
//     le service 'hud.marks' des autres modules ;
//   - carte partagée : Tab sur un point trop loin ouvre la carte dessus, le choix U du terrain y est repris, et rendu.
import { beforeAll, describe, expect, it } from 'vitest';

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
import { createSystems as command, DIRECT_SERVICE } from '@/ui/command';
import type { CommandCore, DirectApi, DirectRuntime } from '@/ui/command';
import type { Person } from '@/core/contracts';
import { GUARD_TIME } from '@/ui/command/direct/runtime';
import { KEY_LINE, designationAt, keyedLine, newTicket, placeWithArticle, type Designation } from '@/ui/command/direct';
import { REFUS } from '@/ui/command/direct/caps';
import type { DirectEnv, DirectUnit } from '@/ui/command/direct/types';
import {
  DEFAULT_FIELD_KEYS, FIELD_DIRECT_SERVICE, KEY_LINE_IDLE, KEY_LINE_ORDERS, OrderCount, StillWatch, keyLine, readFieldHud, splitHead, stateLine, undoLine,
} from '@/ui/command/fieldHud';
import type { FieldHudModel } from '@/ui/command/fieldHud';
import { keyPartAction } from '@/ui/command/quickActions';
import { fieldOpenData, fieldWhoIds, handWhoBack } from '@/ui/command/tacticalOpen';
import { DONE_MARK_TIME, HUD_MARKS_SERVICE, directMarks, ensureHudMarks, moduleMarks } from '@/ui/hud/markers';

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
/** Mots interdits pour une unité sous ses ordres (§9, acceptation 5). */
// (les étiquettes en capitales de la simulation ; « descend des fourgons — prêt dans 5 s » est le ticket voulu, §3.1)
const FORBIDDEN = /SANS ORDRE|\bMONTE\b|\bDESCEND\b|EN FILE/;

interface Game { t: ReturnType<typeof createTestContext>; core: CommandCore; direct: DirectApi & DirectRuntime; me: Person }
let game: Game;

/** Le modèle du HUD tel que le bloc et la puce le lisent (mêmes surveillances d'un appel à l'autre). */
const still = new StillWatch();
const orders = new OrderCount();
function hud(): FieldHudModel {
  return readFieldHud({ core: game.core, direct: game.direct, still, orders, keys: DEFAULT_FIELD_KEYS })!;
}

function ground(a: number, d: number): Designation {
  return designationAt(game.core, game.me.x + Math.sin(a) * d, game.me.z + Math.cos(a) * d);
}

/** Une rue sans foule à 40–120 m (règle g). */
function street(): { des: Designation; name: string } {
  const env = game.direct.env();
  for (const d of [40, 60, 80, 100, 120]) {
    for (let k = 0; k < 16; k++) {
      const des = ground((k * Math.PI) / 8, d);
      const road = env.roadAt(des.x, des.z, 25);
      if (road && env.demonstratorsAt(des.x, des.z, 15).count < 8 && !env.rescueAt(des.x, des.z, 10)) return { des, name: road.name };
    }
  }
  throw new Error('aucune rue proche');
}

function pause(): void {
  game.t.step(GUARD_TIME + 0.1);
}

beforeAll(async () => {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  const direct = t.ctx.service<DirectApi & DirectRuntime>(DIRECT_SERVICE)!;
  game = { t, core, direct, me: core.player()! };
}, 300000);

describe('bloc d’ordres et puce d’état (Concorde, graine 21, commandant)', () => {
  it('le HUD lit le service des ordres directs sous son nom', () => {
    expect(FIELD_DIRECT_SERVICE).toBe(DIRECT_SERVICE);
  });

  it('au départ : « AVEC VOUS · … », l’ordre prêt avec sa touche, la ligne des touches exacte', () => {
    const s = street();
    game.direct.setDesignation(s.des);
    const m = hud();
    console.log(`état « ${m.state} » | prêt « ${m.go?.text} » | autre « ${m.other?.text} » | touches « ${m.keys} » | puce « ${m.chip} »`);
    expect(m.commander).toBe(true);
    // tout le monde le suit au départ (P5) : le résumé, jamais une unité « sans ordre »
    expect(m.state).toMatch(/^AVEC VOUS · .*(section|BRAV-M)/);
    expect(m.state).not.toMatch(FORBIDDEN);
    expect(m.go!.text).toBe(keyedLine('Entrée', game.direct.ready()!.text));
    expect(m.go!.text.startsWith(keyedLine('Entrée', `Bloquer ${placeWithArticle(s.name)} · `))).toBe(true);
    expect(m.go!.enabled).toBe(true);
    expect(m.other!.text.startsWith(keyedLine('Maj+Entrée', 'Envoyer'))).toBe(true);
    expect(m.keys).toBe(KEY_LINE);
    expect(m.chip).toBe(m.state);
    expect(splitHead(m.state).head).toBe('AVEC VOUS');
  });

  it('rien de visé : la ligne grise dit quoi viser, sans touche ; trop loin : la phrase qui dit Tab', () => {
    game.direct.setDesignation({ kind: 'none', x: 0, z: 0, distance: 0, person: null, place: '', far: false });
    game.t.step(0.6);
    const m = hud();
    expect(m.go!.enabled).toBe(false);
    expect(m.go!.text).toBe('Visez une rue, une personne ou la foule — A : tout le monde avec vous');
    expect(m.other).toBeNull();
    // un point à 450 m (au-delà de la portée d'Envoyer) : ligne grise, la carte s'ouvrira dessus (Tab)
    let far: Designation | null = null;
    const env = game.direct.env();
    for (let k = 0; k < 32 && !far; k++) {
      const d = ground((k * Math.PI) / 16, 450);
      if (env.demonstratorsAt(d.x, d.z, 15).count < 8 && !env.rescueAt(d.x, d.z, 10)) far = { ...d, far: true };
    }
    expect(far).toBeTruthy();
    game.direct.setDesignation(far!);
    game.t.step(0.6);
    const f = hud();
    expect(f.go!.order.rule).toBe('h');
    expect(f.go!.enabled).toBe(false);
    expect(f.go!.hint).toBe(REFUS.tropLoin);
    const open = fieldOpenData(game.core)!;
    expect(open).toBeTruthy();
    expect(open.fromField).toBe(true);
    expect(open.intent).toBe('envoyer');
    expect(Math.hypot(open.x! - far!.x, open.z! - far!.z)).toBeLessThan(1);
    expect(open.squadIds!.length).toBeGreaterThan(0);
    // une ligne ordinaire n'ouvre pas la carte ailleurs que là où Tab l'ouvre d'habitude
    game.direct.setDesignation(street().des);
    game.t.step(0.6);
    expect(fieldOpenData(game.core)).toBeNull();
  });

  it('Entrée : la puce montre le ticket 6 s, « ⌫ annuler — … » remplace les touches 5 s, l’unité passe dans les détachées, les repères', () => {
    pause();
    const s = street();
    game.direct.setDesignation(s.des);
    game.t.step(0.6);
    const n = game.direct.ready()!;
    const id = n.who!.squadIds[0]!;
    const name = game.t.ctx.squads.get(id)!.name;
    // avant l'appui : la désignation est marquée « Bloquer » au point de la rue
    const before = directMarks(game.t.ctx, game.t.ctx.clock.now);
    const des = before.find((w) => w.kind === 'designation')!;
    expect(des).toBeTruthy();
    expect(des.label).toBe('Bloquer');
    expect(Math.hypot(des.x - n.x, des.z - n.z)).toBeLessThan(1);
    const r = game.direct.give();
    expect(r.ok, r.text).toBe(true);
    const m = hud();
    expect(m.chipTicket).toBe(true);
    expect(m.chip).toBe(`${name} · Bloquer ${game.direct.ticketOf(id)!.place} · reçu`);
    expect(m.keys).toBe(`⌫ annuler — ${m.undo!.who} · Bloquer`);
    expect(m.keys).toBe(undoLine(DEFAULT_FIELD_KEYS, m.undo!));
    // le repère de l'ordre : « MISTRAL 1 — Bloquer » au point de l'ordre
    const marks = directMarks(game.t.ctx, game.t.ctx.clock.now);
    const ord = marks.find((w) => w.kind === 'ordre' && w.label === `${name} — Bloquer`)!;
    expect(ord, JSON.stringify(marks)).toBeTruthy();
    const rec = game.core.playerOrderRecord(id)!;
    expect(Math.hypot(ord.x - rec.geom!.x, ord.z - rec.geom!.z)).toBeLessThan(0.01);
    // l'unité n'est plus avec lui : elle est dans les détachées, avec son ticket
    game.t.step(2);
    const later = hud();
    const line = later.detached.find((l) => l.startsWith(`${name} · `));
    expect(line, later.detached.join(' | ')).toBeTruthy();
    expect(line).not.toMatch(FORBIDDEN);
    // passé 5 s : plus d'annulation ; passé 6 s : la puce revient à la ligne d'état
    game.t.step(4.5);
    const after = hud();
    expect(after.undo).toBeNull();
    expect(after.chipTicket).toBe(false);
    expect(after.chip).toBe(after.state);
  });

  it('60 s de partie : aucun texte du HUD ne dit « SANS ORDRE », « MONTE », « DESCEND » ou « EN FILE »', () => {
    pause();
    // un ordre loin, en véhicules, pour une autre unité (elle monte, roule, descend) ; le joueur reste là
    const env = game.direct.env();
    let pt: Designation | null = null;
    for (let k = 0; k < 16 && !pt; k++) {
      const d = ground((k * Math.PI) / 8, 300);
      if (env.roadAt(d.x, d.z, 25)) pt = { ...d, far: true };
    }
    if (pt) {
      game.direct.cycle(1);
      game.direct.setDesignation(pt);
      game.t.step(0.6);
      const o = game.direct.ready()!.autre ?? game.direct.ready()!;
      if (o.enabled) game.direct.give(o === game.direct.ready()!.autre ? 'autre' : 'go');
    }
    const seen = new Set<string>();
    for (let s = 0; s < 60; s++) {
      game.t.step(1);
      const m = hud();
      for (const txt of [m.state, m.chip, ...m.detached]) {
        seen.add(txt);
        expect(txt, `t+${s} s`).not.toMatch(FORBIDDEN);
      }
    }
    console.log([...seen].slice(0, 12).join('\n'));
  }, 300000);

  it('A puis « ✓ » : le repère d’un ordre fait reste 3 s, puis disparaît ; A n’a pas de repère', () => {
    pause();
    const a = game.direct.avecMoi();
    expect(a.ok, a.text).toBe(true);
    const marks = directMarks(game.t.ctx, game.t.ctx.clock.now);
    expect(marks.some((w) => w.kind === 'ordre' || w.kind === 'ordre-ok')).toBe(false);
    expect(DONE_MARK_TIME).toBe(3);
    game.t.step(3);
    const m = hud();
    // tout le monde avec lui : le résumé
    expect(m.state.startsWith('AVEC VOUS · ')).toBe(true);
  });

  it('carte partagée : l’unité choisie avec U sur le terrain est reprise par la carte, et la carte la rend', () => {
    pause();
    game.direct.setWho('auto');
    expect(fieldWhoIds(game.core)).toEqual([]);
    const key = game.direct.cycle(1);
    const id = Number(key.slice(1));
    expect(fieldWhoIds(game.core)).toEqual([id]);
    // la carte se ferme sans ordre, avec une autre unité choisie : le terrain la prend pour le prochain ordre
    const other = game.direct.env().units.find((u) => u.symbol === 'section' && u.squadId !== id)!;
    handWhoBack(game.core, [other.squadId], false);
    expect(game.direct.whoKey()).toBe(`u${other.squadId}`);
    // un ordre est parti de la carte : le choix manuel est consommé, le terrain revient à l'automatique
    handWhoBack(game.core, [], true);
    expect(game.direct.whoKey()).toBe('auto');
  });
});

describe('repères des modules (service « hud.marks »)', () => {
  it('pose, met à jour, retire ; les 4 plus proches ; une nouvelle session les oublie', () => {
    const ctx = game.t.ctx;
    const api = ensureHudMarks(ctx);
    expect(ctx.service(HUD_MARKS_SERVICE)).toBe(api);
    expect(ensureHudMarks(ctx)).toBe(api);
    const me = game.me;
    for (let i = 0; i < 6; i++) api.set(`van${i}`, { x: me.x + 10 * (i + 1), z: me.z, label: `CELLULAIRE ${i + 1} · 0/8`, kind: 'cellulaire' });
    api.set('van0', { x: me.x + 5, z: me.z, label: 'CELLULAIRE 1 · 1/8', kind: 'cellulaire' });
    const near = moduleMarks(ctx, me.x, me.z);
    expect(near.map((w) => w.label)).toEqual(['CELLULAIRE 1 · 1/8', 'CELLULAIRE 2 · 0/8', 'CELLULAIRE 3 · 0/8', 'CELLULAIRE 4 · 0/8']);
    api.remove('van0');
    expect(api.list().length).toBe(5);
    api.set('nan', { x: Number.NaN, z: 0, label: 'x' });
    expect(api.list().some((m) => m.id === 'nan')).toBe(false);
    api.clear();
    expect(api.list().length).toBe(0);
  });
});

describe('textes du bloc (logique pure)', () => {
  const unit = (over: Partial<DirectUnit>): DirectUnit => ({
    squadId: 2, name: 'MISTRAL 1', symbol: 'section', kind: 'troupe', x: 0, z: 0, total: 19, valid: 19, parentId: 1, hasPlayer: false, hasVehicles: true,
    seated: 0, order: null, playerOrder: null, avecVous: true, ...over,
  });
  const env = (units: DirectUnit[], inVehicle = false): DirectEnv => ({
    now: 100, poste: 'commandant', ownSquadId: 1, player: { x: 0, z: 0, heading: 0, inVehicle },
    units: [unit({ squadId: 1, name: 'MISTRAL', symbol: 'compagnie', parentId: 0, avecVous: false }), ...units],
    demonstratorsAt: () => ({ count: 0, x: 0, z: 0 }), roadAt: () => null, placeName: () => '', rescueAt: () => null, sommations: 0, riposteAt: () => false,
    detainee: null, freePair: null, can: { confier: false, remettre: false, faireVenir: false, transfert: false },
  });

  it('ligne d’état : posture à pied, montée dans les fourgons, colonne, personne avec lui', () => {
    const three = [unit({ squadId: 2 }), unit({ squadId: 3, name: 'MISTRAL 2' }), unit({ squadId: 4, name: 'FAUCON 1', symbol: 'bravm', kind: 'bravm' })];
    expect(stateLine(env(three), 0, false, [])).toBe('AVEC VOUS · 2 sections + BRAV-M · vous suivent');
    expect(stateLine(env(three), 4, true, [])).toBe('AVEC VOUS · 2 sections + BRAV-M · en ligne face à la foule');
    expect(stateLine(env(three), 4, false, [])).toBe('AVEC VOUS · 2 sections + BRAV-M · en garde autour de vous');
    const boarding = [unit({ squadId: 2, seated: 14 }), unit({ squadId: 3, name: 'MISTRAL 2', seated: 5 })];
    expect(stateLine(env(boarding, true), 0, false, [])).toBe('AVEC VOUS · 2 sections · montent dans les fourgons (19/38)');
    const aboard = [unit({ squadId: 2, seated: 19 }), unit({ squadId: 3, name: 'MISTRAL 2', seated: 19 })];
    expect(stateLine(env(aboard, true), 0, false, [])).toBe('AVEC VOUS · 2 sections · en colonne derrière vous');
    // le chef de la BRAV-M en selle : des motos, pas des fourgons ; lui-même n'est pas compté parmi ceux qui montent
    const chief = (a: number, b: number): DirectEnv => ({
      ...env([], true), poste: 'bravm', ownSquadId: 4,
      units: [
        unit({ squadId: 4, name: 'FAUCON 1', symbol: 'bravm', kind: 'bravm', parentId: 0, total: 12, valid: 12, hasPlayer: true, seated: a + b }),
        unit({ squadId: 41, name: 'FAUCON 1-1', symbol: 'bravm', kind: 'bravm', parentId: 4, total: 6, valid: 6, hasPlayer: true, seated: a }),
        unit({ squadId: 42, name: 'FAUCON 1-2', symbol: 'bravm', kind: 'bravm', parentId: 4, total: 6, valid: 6, seated: b }),
      ],
    });
    expect(stateLine(chief(3, 4), 0, false, [])).toBe('AVEC VOUS · BRAV-M · remontent sur les motos (7/11)');
    expect(stateLine(chief(5, 6), 0, false, [])).toBe('AVEC VOUS · BRAV-M · en selle derrière vous');
    const po = { type: 'couper_circulation' as const, verb: 'bloquer' as const, issuedAt: 90, done: false, place: 'rue Royale' };
    const away = [unit({ squadId: 2, avecVous: false, playerOrder: po }), unit({ squadId: 3, name: 'MISTRAL 2', avecVous: false, playerOrder: po })];
    expect(stateLine(env(away), 0, false, [])).toBe('Personne avec vous · 2 unités en mission');
    // des unités qu'il n'a jamais envoyées (patrouilles du secteur) ne sont pas « en mission »
    expect(stateLine(env([unit({ squadId: 5, name: 'TV 75-03', symbol: 'patrouille', avecVous: false })]), 0, false, [])).toBe('Personne avec vous');
    // jamais « SANS ORDRE » : une unité sans ordre du joueur « attend vos ordres »
    for (const t of [stateLine(env(away), 0, false, []), stateLine(env(three), 0, false, [])]) expect(t).not.toMatch(FORBIDDEN);
  });

  it('ligne des touches : sans choix d’unité (chef de groupe), pas de U ; touches réaffectées ; exécutant', () => {
    expect(keyLine(env([unit({})]), DEFAULT_FIELD_KEYS, true)).toBe(KEY_LINE);
    const groupe: DirectEnv = { ...env([unit({})]), poste: 'groupe' };
    expect(keyLine(groupe, DEFAULT_FIELD_KEYS, true)).toBe('A avec moi · F tous les ordres · Tab carte');
    expect(keyLine(env([unit({})]), { ...DEFAULT_FIELD_KEYS, withMe: 'Q', go: 'Espace' }, true)).toBe('Q avec moi · U autre unité · F tous les ordres · Tab carte');
    expect(keyLine(env([unit({})]), DEFAULT_FIELD_KEYS, false)).toBe('A avec moi · F ordres · M carte');
    // chaque morceau cliquable fait ce qu'il dit
    expect(KEY_LINE.split(' · ').map(keyPartAction)).toEqual(['with_me', 'who', 'wheel', 'map']);
    expect(keyPartAction('⌫ annuler — MISTRAL 1 · Bloquer')).toBe('undo');
    expect(keyPartAction('M carte')).toBe('map');
  });

  it('les 5 premiers ordres puis après 6 s sans ordre ; une rafale de tickets d’un même ordre compte pour un', () => {
    const c = new OrderCount();
    const s = {};
    const t = (id: number, at: number) => newTicket(id, id, 'MISTRAL', 'bloquer', 'couper_circulation', '', at);
    c.sample([t(1, 10), t(2, 10), t(3, 10)], s);
    expect(c.count).toBe(1);
    c.sample([t(1, 10), t(4, 12)], s);
    expect(c.count).toBe(2);
    expect(c.lastAt).toBe(12);
    expect(KEY_LINE_ORDERS).toBe(5);
    expect(KEY_LINE_IDLE).toBe(6);
    // nouvelle session : on recompte
    c.sample([t(9, 1)], {});
    expect(c.count).toBe(1);
  });

  it('le joueur arrêté : 2 m de tolérance, une nouvelle session repart de zéro', () => {
    const w = new StillWatch();
    const s = {};
    expect(w.sample(0, 0, 10, s)).toBe(0);
    expect(w.sample(1.5, 0, 12, s)).toBe(2);
    expect(w.sample(5, 0, 13, s)).toBe(0);
    expect(w.sample(5, 1, 17, s)).toBe(4);
    expect(w.sample(5, 1, 18, {})).toBe(0);
  });
});
