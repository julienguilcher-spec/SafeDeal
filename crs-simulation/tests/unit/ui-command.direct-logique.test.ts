// Ordres directs — la LOGIQUE PURE (direct/) : l'ordre prêt de chaque règle du §1.3 sur la vraie carte (place de la
// Concorde, graine 21 : un auteur de fait constaté, une rue, la foule, rien, un point à 400 m), le choix automatique
// de chaque poste, l'ordre fixe de U, quand rouler, la roue (numéros gardés, rien de perdu), les mots de la carte, les
// formes courtes de la pastille, les capacités et les refus (chaque motif de la simulation a ses mots).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { Person } from '@/core/contracts';
import type { CardEnv } from '@/ui/command/cardTypes';
import { INTENTS, buildCard, intentCandidates, allOrdersGrouped } from '@/ui/command/intents';
import { travel } from '@/ui/command/bestUnit';
import { BRAVM_REMOUNT_MIN, BRAVM_RIDE_MIN } from '@/ui/command/direct/travel';
import { cardEnvFromCore, crowdRepere } from '@/ui/command/reperes';
import { MORE_RING, WHEEL } from './ui-command.ancienne-roue.lib';
import {
  CAP_REFUSALS, DIRECT_FOLLOW_WHEEL, DIRECT_MORE_RING, DIRECT_WHEEL, NOTHING_LINE, PILL_SHORT_FORMS, REFUS, VERB_WORDS, WHO_AUTO,
  accepts, consumeWho, cycleWho, defaultAddressee, designationAt, directEnvFromCore, distText, everyone, fitsPill, holdNatural,
  isKnownSimReason, motorizes, naturalOrder, nextWho, pillWhoText, placeBare, placeWithArticle, sectorForDigit, simRefusal, whoCycle,
  type Designation, type DirectEnv, type DirectUnit,
} from '@/ui/command/direct';

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

// ───────────────────────────── vraie partie : Concorde, graine 21, commandant ─────────────────────────────

interface Game { t: ReturnType<typeof createTestContext>; core: CommandCore; me: Person }

let game: Game;

async function concorde(): Promise<Game> {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  return { t, core, me: core.player()! };
}

/** Déplace le joueur (les fonctions de lecture prennent sa position) ; l'index des personnes est refait. */
function placePlayer(g: Game, x: number, z: number): void {
  g.me.x = x;
  g.me.z = z;
  g.t.ctx.people.rebuildIndex();
}

/** Point du sol à `d` m du joueur dans la direction `a` (rad). */
function ground(g: Game, a: number, d: number): Designation {
  return designationAt(g.core, g.me.x + Math.sin(a) * d, g.me.z + Math.cos(a) * d);
}

beforeAll(async () => {
  game = await concorde();
}, 300000);

describe('ordre prêt sur la vraie carte (Concorde, graine 21, commandant)', () => {
  it('le poste et les unités : commandant, sections, BRAV-M, engins ; jamais la racine de la compagnie d’office', () => {
    const env = directEnvFromCore(game.core);
    expect(env.poste).toBe('commandant');
    const root = env.units.find((u) => u.squadId === env.ownSquadId)!;
    expect(root.symbol).toBe('compagnie');
    expect(env.units.filter((u) => u.symbol === 'section').length).toBe(3);
    expect(env.units.some((u) => u.kind === 'bravm')).toBe(true);
    for (const verb of ['bloquer', 'envoyer', 'face_foule', 'interpeller', 'secours', 'disperser'] as const) {
      const who = defaultAddressee(verb, game.me.x + 30, game.me.z, env)!;
      expect(who, verb).toBeTruthy();
      expect(who.squadIds, verb).not.toContain(env.ownSquadId);
    }
  });

  it('c : un auteur de fait constaté à moins de 120 m → « Interpeller le lanceur de projectile · BRAV-M · 35 m »', () => {
    const ctx = game.t.ctx;
    const me = game.me;
    const offender = ctx.people.nearest(me.x, me.z, 120, (p) => p.faction === 'protest' && p.custody === 'free' && p.vehicleId === 0)!;
    expect(offender, 'un manifestant à moins de 120 m').toBeTruthy();
    const off = ctx.law.recordOffense(offender, 'jet_projectile', offender.x, offender.z, 3);
    off.witnessed = true;
    expect(ctx.law.canArrest(offender)).toBe(true);
    const env = directEnvFromCore(game.core);
    const des = designationAt(game.core, offender.x, offender.z, offender.id, false);
    expect(des.person!.kind).toBe('offender');
    const n = naturalOrder(env, des);
    expect(n.rule).toBe('c');
    expect(n.verb).toBe('interpeller');
    expect(n.orderType).toBe('interpeller');
    expect(n.targetId).toBe(offender.id);
    // la BRAV-M libre à moins de 500 m interpelle (le groupe FAUCON, rattaché à la compagnie depuis la mise en place
    // P5 — ni un de ses binômes, ni la compagnie)
    const bravm = env.units.find((u) => u.kind === 'bravm' && (u.parentId === 0 || u.parentId === env.ownSquadId))!;
    expect(bravm, 'le groupe BRAV-M de la compagnie').toBeTruthy();
    expect(Math.hypot(bravm.x - offender.x, bravm.z - offender.z)).toBeLessThan(500);
    expect(n.who!.squadIds).toEqual([bravm.squadId]);
    // (la distance lue est celle que l'unité va parcourir — d'elle à l'auteur —, pas celle du joueur : étape 7, P25)
    const toGo = distText(Math.hypot(bravm.x - n.x, bravm.z - n.z));
    expect(n.text).toBe(`Interpeller le lanceur de projectile · BRAV-M · ${toGo}`);
    expect(n.short).toBe('Interpeller');
    expect(n.whoShort).toBe(`BRAV-M · ${toGo}`);
    expect(n.enabled).toBe(true);
    // au-delà de 120 m, ce n'est plus l'ordre prêt : on envoie au point
    const far = { ...des, distance: 130 };
    expect(naturalOrder(env, far).rule).not.toBe('c');
    off.witnessed = false;
    offender.offenses.length = 0;
  });

  it('f : la foule (8 manifestants à 15 m) → « Bloquer ici, face à la foule · MISTRAL x · d », autre = Disperser (sommations d’abord)', () => {
    const ctx = game.t.ctx;
    const env0 = directEnvFromCore(game.core);
    // un point de la foule où 8 manifestants au moins se tiennent à 15 m
    const list: Person[] = [];
    ctx.people.queryRadius(game.me.x, game.me.z, 600, list, (p) => p.faction === 'protest' && p.custody === 'free');
    const spot = list.find((p) => env0.demonstratorsAt(p.x, p.z, 15).count >= 8)!;
    expect(spot, 'un point de foule dense').toBeTruthy();
    const back = { x: game.me.x, z: game.me.z };
    // le joueur à 50 m de la foule
    const a = Math.atan2(back.x - spot.x, back.z - spot.z);
    placePlayer(game, spot.x + Math.sin(a) * 50, spot.z + Math.cos(a) * 50);
    try {
      const env = directEnvFromCore(game.core);
      const des = designationAt(game.core, spot.x, spot.z);
      const n = naturalOrder(env, des);
      expect(n.rule).toBe('f');
      expect(n.verb).toBe('face_foule');
      expect(n.orderType).toBe('ligne');
      const sec = env.units.find((u) => u.squadId === n.who!.squadIds[0])!;
      expect(sec.symbol).toBe('section');
      expect(n.text).toBe(`Bloquer ici, face à la foule · ${sec.name} · ${distText(Math.hypot(sec.x - n.x, sec.z - n.z))}`);
      expect(n.short).toBe('Face à la foule');
      // la ligne fait face au centre de la foule
      const c = env.demonstratorsAt(spot.x, spot.z, 15);
      if (Math.hypot(c.x - spot.x, c.z - spot.z) > 1) expect(Math.abs(n.heading - Math.atan2(c.x - spot.x, c.z - spot.z))).toBeLessThan(1e-6);
      // jamais Disperser d'office ; la ligne « autre » : les sommations d'abord (0/3)
      expect(n.verb).not.toBe('disperser');
      const o = n.autre!;
      expect(o.verb).toBe('disperser');
      expect(o.orderType).toBe('refoulement');
      expect(o.legalFirst).toBe(true);
      expect(o.text).toBe('Disperser\u00a0: sommations d’abord');
      expect(o.lock).toBe(REFUS.disperserSommations(o.who!.label));
    } finally {
      placePlayer(game, back.x, back.z);
    }
  });

  it('g : une rue à moins de 150 m, sans foule → « Bloquer la place … · MISTRAL x · d », autre = Envoyer sans barrer', () => {
    const env = directEnvFromCore(game.core);
    let found: { des: Designation; name: string } | null = null;
    for (const d of [40, 60, 80, 100, 120]) {
      for (let k = 0; k < 16 && !found; k++) {
        const des = ground(game, (k * Math.PI) / 8, d);
        const road = env.roadAt(des.x, des.z, 25);
        if (road && env.demonstratorsAt(des.x, des.z, 15).count < 8 && !env.rescueAt(des.x, des.z, 10)) found = { des, name: road.name };
      }
      if (found) break;
    }
    expect(found, 'une rue proche').toBeTruthy();
    const n = naturalOrder(env, found!.des);
    expect(n.rule).toBe('g');
    expect(n.orderType).toBe('couper_circulation');
    expect(n.intent).toBe('bloquer');
    const sec = env.units.find((u) => u.squadId === n.who!.squadIds[0])!;
    expect(sec.symbol).toBe('section');
    expect(n.text).toBe(`Bloquer ${placeWithArticle(found!.name)} · ${sec.name} · ${distText(Math.hypot(sec.x - n.x, sec.z - n.z))}`);
    expect(n.text.startsWith('Bloquer la ') || n.text.startsWith('Bloquer le ') || n.text.startsWith('Bloquer l’')).toBe(true);
    expect(n.autre!.verb).toBe('envoyer');
    expect(n.autre!.text).toBe(`Envoyer\u00a0: ${placeBare(found!.name)}`);
  });

  it('h : un point à 400 m (boulevard) → « Envoyer : … · MISTRAL x · 400 m » ; au-delà de 400 m : la carte', () => {
    const env = directEnvFromCore(game.core);
    let des: Designation | null = null;
    for (let k = 0; k < 16 && !des; k++) {
      const d = ground(game, (k * Math.PI) / 8, 395);
      if (env.demonstratorsAt(d.x, d.z, 15).count < 8 && !env.rescueAt(d.x, d.z, 10)) des = d;
    }
    expect(des).toBeTruthy();
    const n = naturalOrder(env, des!);
    expect(n.rule).toBe('h');
    expect(n.verb).toBe('envoyer');
    expect(n.intent).toBe('envoyer');
    expect(n.place).not.toBe('');
    const sent = env.units.find((u) => u.squadId === n.who!.squadIds[0])!;
    expect(n.text).toBe(`Envoyer\u00a0: ${n.place} · ${n.who!.label} · ${distText(Math.hypot(sent.x - n.x, sent.z - n.z))}`);
    expect(distText(des!.distance)).toBe('400\u00a0m');
    // une section à pied, à plus de 150 m mais moins de 450 m : elle y va à pied
    const sec = env.units.find((u) => u.squadId === n.who!.squadIds[0])!;
    expect(motorizes({ ...sec, seatedShare: sec.seated / Math.max(1, sec.total) }, des!.x, des!.z)).toBe(false);
    const far = naturalOrder(env, { ...des!, distance: 520 });
    expect(far.enabled).toBe(false);
    expect(far.lock).toBe(REFUS.tropLoin);
  });

  it('i : rien (le ciel, un mur à moins de 6 m) → ligne grise, aucun ordre', () => {
    const env = directEnvFromCore(game.core);
    const none: Designation = { kind: 'none', x: 0, z: 0, distance: 0, person: null, place: '', far: false };
    const n = naturalOrder(env, none);
    expect(n.rule).toBe('i');
    expect(n.enabled).toBe(false);
    expect(n.orderType).toBeNull();
    expect(n.text).toBe(NOTHING_LINE);
    expect(n.text).toBe('Visez une rue, une personne ou la foule — A\u00a0: tout le monde avec vous');
    const wall = naturalOrder(env, ground(game, 0, 4));
    expect(wall.rule).toBe('i');
    expect(wall.enabled).toBe(false);
  });

  it('e : le réticule même sur un CRS d’une section qui n’est pas avec lui → « MISTRAL x : avec moi » ; dans le cône seulement : non', () => {
    const ctx = game.t.ctx;
    // à la mise en place, tout le monde suit le joueur (P5) : une section envoyée tenir ailleurs n'est plus avec lui
    const env0 = directEnvFromCore(game.core);
    const first = env0.units.find((u) => u.symbol === 'section')!;
    const squad = ctx.squads.get(first.squadId)!;
    const was = { ...squad.order };
    ctx.squads.issue(squad.id, { type: 'tenir', x: first.x, z: first.z, heading: 0, width: 0, issuedBy: game.me.id, byPlayer: true });
    const env = directEnvFromCore(game.core);
    const sec = env.units.find((u) => u.symbol === 'section' && !u.avecVous)!;
    expect(sec, 'une section qui n’est pas avec lui').toBeTruthy();
    const member = ctx.squads.childrenOf(sec.squadId).flatMap((g) => g.members).map((id) => ctx.people.get(id)!).find((p) => p && p.vehicleId === 0)!;
    expect(member).toBeTruthy();
    const back = { x: game.me.x, z: game.me.z };
    placePlayer(game, member.x + 25, member.z);
    try {
      const env2 = directEnvFromCore(game.core);
      const n = naturalOrder(env2, designationAt(game.core, member.x, member.z, member.id, true));
      expect(n.rule).toBe('e');
      expect(n.verb).toBe('avec_moi');
      expect(n.orderType).toBe('suivre');
      expect(n.who!.squadIds).toEqual([sec.squadId]);
      expect(n.text).toBe(`${sec.name}\u00a0: avec moi`);
      // dans le cône de 4° (pas sous le réticule même) : jamais « avec moi » (le barrage devant la rue resterait)
      const cone = naturalOrder(env2, designationAt(game.core, member.x, member.z, member.id, false));
      expect(cone.rule).not.toBe('e');
    } finally {
      placePlayer(game, back.x, back.z);
      ctx.squads.issue(squad.id, was);
    }
  });

  it('d : un blessé au sol à moins de 10 m du point → « Secours ici : blessé au sol »', () => {
    const ctx = game.t.ctx;
    const me = game.me;
    const victim = ctx.people.nearest(me.x, me.z, 300, (p) => p.faction === 'protest' && p.custody === 'free' && p.vehicleId === 0)!;
    const was = victim.injury;
    victim.injury = 'serious';
    try {
      const env = directEnvFromCore(game.core);
      const n = naturalOrder(env, designationAt(game.core, victim.x + 3, victim.z));
      expect(n.rule).toBe('d');
      expect(n.verb).toBe('secours');
      expect(n.text).toBe('Secours ici\u00a0: blessé au sol');
      expect(n.enabled).toBe(true);
    } finally {
      victim.injury = was;
    }
  });

  it('U sur la vraie compagnie : automatique → BRAV-M → sections par distance → Centaure, canon à eau → fourgons cellulaires → toute la compagnie', () => {
    const env = directEnvFromCore(game.core);
    const keys = whoCycle(env);
    const kindOf = (k: string): string => (k === 'auto' || k === 'tous' ? k : env.units.find((u) => `u${u.squadId}` === k)!.kind + ':' + env.units.find((u) => `u${u.squadId}` === k)!.symbol);
    // (§1.4 ; 300 manifestants : deux fourgons cellulaires avec leur équipage dans la compagnie, mise en place P5)
    expect(keys.map(kindOf)).toEqual([
      'auto', 'bravm:bravm', 'troupe:section', 'troupe:section', 'troupe:section', 'centaure:centaure', 'canon_eau:canon_eau',
      'cellulaire:vehicule', 'cellulaire:vehicule', 'tous',
    ]);
    const secs = keys.filter((k) => kindOf(k) === 'troupe:section').map((k) => env.units.find((u) => `u${u.squadId}` === k)!);
    const p = env.player!;
    for (let i = 1; i < secs.length; i++) {
      expect(Math.hypot(secs[i]!.x - p.x, secs[i]!.z - p.z)).toBeGreaterThanOrEqual(Math.hypot(secs[i - 1]!.x - p.x, secs[i - 1]!.z - p.z));
    }
    // « Toute la compagnie » : les unités du premier niveau, jamais la racine
    const all = everyone(env)!;
    expect(all.label).toBe('Toute la compagnie');
    expect(all.squadIds).not.toContain(env.ownSquadId);
    expect(all.squadIds.length).toBeGreaterThanOrEqual(5);
  });
});

// ───────────────────────────── environnement fait main ─────────────────────────────

function unit(squadId: number, name: string, symbol: DirectUnit['symbol'], kind: DirectUnit['kind'], x: number, z: number, extra: Partial<DirectUnit> = {}): DirectUnit {
  return {
    squadId, name, symbol, kind, x, z, total: 19, valid: 19, parentId: 1, hasPlayer: false, hasVehicles: true, seated: 0, order: null,
    playerOrder: null, avecVous: false, ...extra,
  };
}

function makeEnv(over: Partial<DirectEnv> = {}): DirectEnv {
  return {
    now: 100, poste: 'commandant', ownSquadId: 1, player: { x: 0, z: 0, heading: 0, inVehicle: false },
    units: [
      unit(1, 'MISTRAL', 'compagnie', 'troupe', 0, 0, { parentId: 0, hasPlayer: true, total: 70, valid: 70 }),
      unit(2, 'MISTRAL 1', 'section', 'troupe', 20, 0),
      unit(3, 'MISTRAL 2', 'section', 'troupe', 60, 0),
      unit(4, 'MISTRAL 1 ALFA', 'groupe', 'troupe', 22, 2, { parentId: 2, total: 7, valid: 7 }),
      unit(5, 'MISTRAL 2 ALFA', 'groupe', 'troupe', 58, 2, { parentId: 3, total: 7, valid: 7 }),
      unit(6, 'FAUCON 1', 'bravm', 'bravm', 100, 0, { hasVehicles: false, total: 12, valid: 12 }),
      unit(7, 'FAUCON 1-1', 'bravm', 'bravm', 100, 0, { parentId: 6, hasVehicles: false, total: 2, valid: 2 }),
      unit(8, 'CENTAURE 1', 'centaure', 'centaure', 40, 40, { total: 3, valid: 3 }),
      unit(9, 'NEPTUNE 1', 'canon_eau', 'canon_eau', 50, 40, { total: 3, valid: 3 }),
      unit(10, 'CELLULAIRE 1', 'vehicule', 'cellulaire', 30, -20, { total: 2, valid: 2, detainees: 3, seats: 8 }),
    ],
    demonstratorsAt: (x, z) => (Math.hypot(x - 200, z) < 30 ? { count: 40, x: 210, z: 0 } : { count: 0, x, z }),
    roadAt: (x, z) => (Math.abs(z - 100) < 10 ? { edgeId: 5, x, z: 100, heading: Math.PI / 2, width: 12, name: 'Rue Saint-Gilles' } : null),
    placeName: () => 'place de la Bastille',
    rescueAt: () => null,
    sommations: 0, riposteAt: () => false,
    detainee: null, freePair: null,
    can: { confier: true, remettre: true, faireVenir: true, transfert: true },
    ...over,
  };
}

const point = (x: number, z: number, place = ''): Designation => ({ kind: 'ground', x, z, distance: Math.hypot(x, z), person: null, place, far: false });

describe('ordre prêt : règles a et b, la BRAV-M occupée, la stabilité', () => {
  it('a : il tient un interpellé — Remettre (12 m), Confier (60 m), Emmenez-le (100 m), Faire venir (au-delà)', () => {
    const base = makeEnv({ detainee: { personId: 77, name: 'Christian Lopez' } });
    const van = (x: number): DirectUnit[] => base.units.map((u) => (u.kind === 'cellulaire' ? { ...u, x, z: 0 } : u));
    const sky: Designation = { kind: 'none', x: 0, z: 0, distance: 0, person: null, place: '', far: false };
    // fourgon à 10 m : remettre (avant tout binôme)
    let n = naturalOrder({ ...base, units: van(10), freePair: { squadId: 4, name: 'MISTRAL 1 ALFA', distance: 15 } }, sky);
    expect([n.rule, n.verb, n.text]).toEqual(['a', 'remettre', 'Remettre l’interpellé au fourgon cellulaire 1']);
    // binôme libre à 15 m, fourgon à 70 m : confier
    n = naturalOrder({ ...base, units: van(70), freePair: { squadId: 4, name: 'MISTRAL 1 ALFA', distance: 15 } }, sky);
    expect([n.verb, n.text]).toEqual(['confier', 'Confier l’interpellé à MISTRAL 1 ALFA']);
    // personne à 60 m, fourgon à 70 m : l'emmener
    n = naturalOrder({ ...base, units: van(70) }, sky);
    expect([n.verb, n.text]).toEqual(['emmener', 'Emmenez-le au fourgon cellulaire 1 · 70\u00a0m']);
    // fourgon à 300 m : le faire venir
    n = naturalOrder({ ...base, units: van(300) }, sky);
    expect([n.verb, n.text, n.who!.squadIds[0]]).toEqual(['faire_venir', 'Faire venir le fourgon cellulaire 1 ici · 300\u00a0m', 10]);
    // service absent : la règle n'est pas offerte (jamais un appui sans effet)
    n = naturalOrder({ ...base, units: van(300), can: { ...base.can, faireVenir: false } }, sky);
    expect(n.rule).toBe('i');
    n = naturalOrder({ ...base, units: van(70), freePair: { squadId: 4, name: 'MISTRAL 1 ALFA', distance: 15 }, can: { ...base.can, confier: false } }, sky);
    expect(n.verb).toBe('emmener');
  });

  it('b : l’unité choisie est un fourgon cellulaire — partir au commissariat (3/8), vide : venir ici', () => {
    const env = makeEnv();
    let n = naturalOrder(env, point(0, 100), 'u10');
    expect([n.rule, n.verb, n.text]).toEqual(['b', 'partir', 'CELLULAIRE 1\u00a0: partir au commissariat (3/8)']);
    const empty = { ...env, units: env.units.map((u) => (u.kind === 'cellulaire' ? { ...u, detainees: 0 } : u)) };
    n = naturalOrder(empty, point(0, 100), 'u10');
    expect([n.verb, n.text, n.orderType]).toEqual(['venir', 'CELLULAIRE 1\u00a0: venir ici', 'colonne']);
  });

  it('g dans un environnement fait main : la rue, la section la plus proche du point, ce qu’elle quitte', () => {
    const env = makeEnv();
    let n = naturalOrder(env, point(60, 100));
    // (MISTRAL 2 est à 100 m du point ; le joueur, lui, à 117 m)
    expect(n.text).toBe('Bloquer la rue Saint-Gilles · MISTRAL 2 · 100\u00a0m');
    // MISTRAL 2 tient déjà un barrage (ordre du joueur ancien) et MISTRAL 1 vient d'en recevoir un : la plus ancienne
    // part, et la ligne le dit
    const busy = {
      ...env,
      units: env.units.map((u) => (u.squadId === 3 ? { ...u, playerOrder: { type: 'couper_circulation', verb: 'bloquer' as const, issuedAt: 20, done: true, place: 'rue de Lappe' } }
        : u.squadId === 2 ? { ...u, playerOrder: { type: 'ligne', verb: 'face_foule' as const, issuedAt: 95, done: false, place: 'rue de la Roquette' } } : u)),
    };
    n = naturalOrder(busy, point(60, 100));
    expect(n.text).toBe('Bloquer la rue Saint-Gilles · MISTRAL 2 (quitte la rue de Lappe) · 100\u00a0m');
    // une section « avec vous » est libre : elle passe avant celle qui tient
    const withMe = { ...busy, units: busy.units.map((u) => (u.squadId === 2 ? { ...u, playerOrder: null, avecVous: true } : u)) };
    expect(naturalOrder(withMe, point(60, 100)).who!.squadIds).toEqual([2]);
  });

  it('la distance lue est celle de l’unité au point, pas celle du joueur (« MISTRAL 4 · 16 m » pour une section à un kilomètre)', () => {
    // une seule section libre, à 1 100 m du point ; les autres tiennent un ordre récent du joueur
    const po = { type: 'couper_circulation' as const, verb: 'bloquer' as const, issuedAt: 95, done: false, place: 'rue Royale' };
    const env = makeEnv();
    const units = env.units.map((u) => (u.squadId === 2 ? { ...u, playerOrder: po } : u.squadId === 3 ? { ...u, x: 1100, z: 100, avecVous: true } : u));
    const n = naturalOrder({ ...env, units }, point(16, 100, 'rue Saint-Gilles'));
    expect(n.who!.squadIds).toEqual([3]);
    expect(n.distance).toBeCloseTo(Math.hypot(16, 100), 3);
    expect(n.text).toBe('Bloquer la rue Saint-Gilles · MISTRAL 2 · 1,1\u00a0km');
    expect(n.whoShort).toMatch(/1,1\u00a0km$/);
    // la section toute proche du point : sa distance à elle (20 m du point), quand le joueur en est à 100 m
    const near = naturalOrder(makeEnv(), point(20, 100, 'rue Saint-Gilles'));
    expect(near.who!.squadIds).toEqual([2]);
    expect(near.text).toBe('Bloquer la rue Saint-Gilles · MISTRAL 1 · 100\u00a0m');
  });

  it('interpeller : la BRAV-M libre à 500 m ; occupée (ordre récent), le groupe le plus proche', () => {
    const env = makeEnv();
    expect(defaultAddressee('interpeller', 90, 0, env)!.squadIds).toEqual([6]);
    const busy = { ...env, units: env.units.map((u) => (u.squadId === 6 ? { ...u, playerOrder: { type: 'interpeller', verb: 'interpeller' as const, issuedAt: 95, done: false, place: '' } } : u)) };
    expect(defaultAddressee('interpeller', 90, 0, busy)!.squadIds).toEqual([5]);
    // trop loin (> 500 m) : un groupe
    expect(defaultAddressee('interpeller', 700, 0, { ...env, units: env.units.map((u) => (u.squadId === 6 ? { ...u, x: 1300 } : u)) })!.squadIds).not.toEqual([6]);
    // pousser un véhicule : le Centaure ; sans Centaure : la phrase du §4.3
    expect(defaultAddressee('pousser', 0, 50, env)!.squadIds).toEqual([8]);
    const noC = { ...env, units: env.units.filter((u) => u.kind !== 'centaure') };
    expect(defaultAddressee('pousser', 0, 50, noC)).toBeNull();
  });

  it('stabilité : un autre ordre ne remplace la ligne qu’après 0,5 s ; Entrée donne la ligne affichée', () => {
    const env = makeEnv();
    const a = naturalOrder(env, point(60, 100));
    const b = naturalOrder(env, point(10, 200, 'carrefour Voltaire'));
    expect(a.key).not.toBe(b.key);
    let shown = holdNatural(null, a, 10);
    shown = holdNatural(shown, b, 10.3);
    expect(shown.order.key).toBe(a.key);
    shown = holdNatural(shown, b, 10.6);
    expect(shown.order.key).toBe(b.key);
    // même ordre, distance qui bouge : mis à jour sans attendre
    const b2 = naturalOrder(env, point(12, 202, 'carrefour Voltaire'));
    expect(holdNatural(shown, b2, 10.7).order).toBe(b2);
    // déterministe
    expect(naturalOrder(env, point(60, 100))).toEqual(a);
  });
});

describe('à qui : chaque poste, le cycle de U, un choix manuel pour un seul ordre', () => {
  it('chef de groupe : son groupe, sans cycle', () => {
    const env = makeEnv({
      poste: 'groupe', ownSquadId: 4,
      units: [unit(4, 'MISTRAL 1 ALFA', 'groupe', 'troupe', 5, 0, { parentId: 2, hasPlayer: true, total: 7, valid: 7 })],
    });
    expect(defaultAddressee('bloquer', 0, 100, env)!.squadIds).toEqual([4]);
    expect(defaultAddressee('interpeller', 0, 100, env)!.squadIds).toEqual([4]);
    expect(whoCycle(env)).toEqual(['auto']);
  });

  it('chef de section : sa section ; pour interpeller, son groupe le plus proche ; U parcourt ses groupes', () => {
    const env = makeEnv({
      poste: 'section', ownSquadId: 2,
      units: [
        unit(2, 'MISTRAL 1', 'section', 'troupe', 0, 0, { hasPlayer: true }),
        unit(4, 'MISTRAL 1 ALFA', 'groupe', 'troupe', 10, 0, { parentId: 2, total: 7, valid: 7 }),
        unit(11, 'MISTRAL 1 BRAVO', 'groupe', 'troupe', 40, 0, { parentId: 2, total: 7, valid: 7 }),
      ],
    });
    expect(defaultAddressee('bloquer', 0, 100, env)!.squadIds).toEqual([2]);
    expect(defaultAddressee('interpeller', 45, 0, env)!.squadIds).toEqual([11]);
    expect(whoCycle(env)).toEqual(['auto', 'u4', 'u11', 'tous']);
    expect(everyone(env)!.label).toBe('Toute la section');
  });

  it('chef de la BRAV-M : la BRAV-M ; commandant : jamais la compagnie ; patrouille : ses collègues, et le refus pour barrer', () => {
    const bravm = makeEnv({
      poste: 'bravm', ownSquadId: 6,
      units: [unit(6, 'FAUCON 1', 'bravm', 'bravm', 0, 0, { hasPlayer: true, parentId: 1, hasVehicles: false })],
    });
    expect(defaultAddressee('envoyer', 0, 300, bravm)!.squadIds).toEqual([6]);
    expect(defaultAddressee('interpeller', 0, 300, bravm)!.label).toBe('BRAV-M');
    const crew = makeEnv({
      poste: 'equipage', ownSquadId: 20,
      units: [unit(20, 'TV 75-19', 'patrouille', 'patrouille', 0, 0, { hasPlayer: true, total: 3, valid: 3 })],
    });
    expect(defaultAddressee('interpeller', 0, 30, crew)!.squadIds).toEqual([20]);
    expect(defaultAddressee('avec_moi', 0, 0, crew)!.squadIds).toEqual([20]);
    const n = naturalOrder(crew, point(0, 100));
    expect(n.enabled).toBe(false);
    expect(n.lock).toBe(REFUS.equipage);
    const reader = makeEnv({ poste: 'lecture', ownSquadId: 0, units: [] });
    expect(naturalOrder(reader, point(0, 100)).lock).toBe(REFUS.lecture);
  });

  it('U : ordre fixe ; un choix manuel vaut pour un ordre, le U suivant y revient tout de suite', () => {
    const env = makeEnv();
    expect(whoCycle(env)).toEqual(['auto', 'u6', 'u2', 'u3', 'u8', 'u9', 'u10', 'tous']);
    expect(cycleWho(env, 'auto', 1)).toBe('u6');
    expect(cycleWho(env, 'auto', -1)).toBe('tous');
    expect(cycleWho(env, 'tous', 1)).toBe('auto');
    let st = nextWho(env, WHO_AUTO, 1);
    expect(st.key).toBe('u6');
    const n = naturalOrder(env, point(10, 200, 'carrefour Voltaire'), st.key);
    // (la BRAV-M est à 219 m du carrefour ; le joueur à 200 m)
    expect(n.text).toBe('Envoyer\u00a0: carrefour Voltaire · BRAV-M · 220\u00a0m');
    st = consumeWho(st);
    expect(st.key).toBe('auto');
    st = nextWho(env, st, 1);
    expect(st.key).toBe('u6');
    // ensuite, le cycle normal
    expect(nextWho(env, st, 1).key).toBe('u2');
  });

  it('A (Avec moi) : tout le monde, jamais la racine, les fourgons cellulaires à part', () => {
    const env = makeEnv();
    const all = everyone(env)!;
    expect(all.squadIds.sort((a, b) => a - b)).toEqual([2, 3, 6, 8, 9]);
  });

  it('refus d’une capacité : la BRAV-M choisie pour barrer alors qu’une section existe ; le canon à eau pour interpeller', () => {
    const env = makeEnv();
    let n = naturalOrder(env, point(60, 100), 'u6');
    expect(n.enabled).toBe(false);
    expect(n.lock).toBe(CAP_REFUSALS.bravmBloquer);
    n = naturalOrder({ ...env, units: env.units.map((u) => (u.squadId === 9 ? { ...u } : u)) }, { kind: 'person', x: 30, z: 0, distance: 30, place: '', far: false, person: { id: 5, kind: 'offender', label: 'le casseur', squadId: 0, exact: true } }, 'u9');
    expect(n.lock).toBe(CAP_REFUSALS.canonInterpeller);
  });
});

describe('quand rouler : une règle pour la fiche, le terrain et le Qui', () => {
  const sec = { x: 0, z: 0, hasVehicles: true };
  it('l’unité du joueur à pied ne roule jamais ; à bord, au-delà de 150 m ; à pied, au-delà de 450 m', () => {
    expect(motorizes({ ...sec, hasPlayer: true, seatedShare: 1 }, 2000, 0, false)).toBe(false);
    expect(motorizes({ ...sec, hasPlayer: true, seatedShare: 1 }, 2000, 0, true)).toBe(true);
    expect(motorizes({ ...sec, seatedShare: 0.6 }, 160, 0)).toBe(true);
    expect(motorizes({ ...sec, seatedShare: 0.6 }, 140, 0)).toBe(false);
    expect(motorizes({ ...sec, seatedShare: 0 }, 440, 0)).toBe(false);
    expect(motorizes({ ...sec, seatedShare: 0 }, 460, 0)).toBe(true);
    expect(motorizes({ ...sec, hasVehicles: false }, 3000, 0)).toBe(false);
    // BRAV-M : les seuils de sim/police/command/bravm.ts (en selle au-delà de BRAVM_RIDE_MIN, à pied au-delà de
    // BRAVM_REMOUNT_MIN) — la fiche dit ce qu'elle fait
    const rider = { x: 0, z: 0, hasVehicles: false, symbol: 'bravm', embarked: true };
    expect(motorizes(rider, BRAVM_RIDE_MIN + 10, 0)).toBe(true);
    if (BRAVM_RIDE_MIN > 0) expect(motorizes(rider, BRAVM_RIDE_MIN - 10, 0)).toBe(false);
    expect(motorizes({ ...rider, embarked: false }, BRAVM_REMOUNT_MIN - 10, 0)).toBe(false);
    expect(motorizes({ ...rider, embarked: false }, BRAVM_REMOUNT_MIN + 10, 0)).toBe(true);
    // engins et patrouilles roulent
    expect(motorizes({ x: 0, z: 0, hasVehicles: true, symbol: 'centaure' }, 20, 0)).toBe(true);
    expect(motorizes({ x: 0, z: 0, hasVehicles: true, patrol: true }, 20, 0)).toBe(true);
  });

  it('la fiche et le Qui disent la même chose (bestUnit.travel)', () => {
    const u = { x: 0, z: 0, hasVehicles: true, patrol: false, symbol: 'section' as const, embarked: false, hasPlayer: false };
    expect(travel(u, 300, 0).mode).toBe('pied');
    expect(travel(u, 600, 0).mode).toBe('vehicules');
    expect(travel({ ...u, embarked: true }, 200, 0).mode).toBe('vehicules');
    expect(travel({ ...u, hasPlayer: true }, 2000, 0).mode).toBe('pied');
    expect(travel({ ...u, hasPlayer: true, embarked: true }, 2000, 0, true).mode).toBe('vehicules');
  });
});

describe('la roue (F) : numéros gardés, rien de perdu, mêmes mots que la carte', () => {
  it('1 Avec moi (2 en alias), 3 Envoyer, 4 Bloquer une rue, 5 Interpeller, 6 Disperser, 7 Secours ici, 8 Plus…', () => {
    expect(DIRECT_WHEEL.map((s) => `${s.key} ${s.label}`)).toEqual([
      '1 Avec moi', '3 Envoyer', '4 Bloquer une rue', '5 Interpeller', '6 Disperser', '7 Secours ici', '8 Plus…',
    ]);
    expect(sectorForDigit(DIRECT_WHEEL, 2)!.label).toBe('Avec moi');
    expect(sectorForDigit(DIRECT_FOLLOW_WHEEL, 2)!.label).toBe('Avec moi');
    expect(DIRECT_FOLLOW_WHEEL.map((s) => s.key)).toEqual([1, 7]);
    expect(DIRECT_MORE_RING.map((s) => `${s.key} ${s.label}`)).toEqual([
      '1 Se replier', '2 Bond en avant', '3 Charger', '4 Disperser au gaz', '5 Tenir sa position', '6 Arrêter l’action', '7 Laisser agir seuls',
      '8 Se protéger (tortue)', '9 Pousser un véhicule',
    ]);
  });

  it('un ancien « F puis N » ne tombe jamais sur un ordre coercitif qu’il ne donnait pas', () => {
    const coercive = new Set(['charge', 'disperser_gaz', 'refoulement', 'bond_offensif', 'encercler']);
    for (const old of WHEEL) {
      const now = sectorForDigit(DIRECT_WHEEL, old.key);
      if (!now || now.orders.length === 0) continue;
      // « F puis 6 » (Pousser, passé dans « Plus… » 9) devient Disperser : verrouillé tant que les sommations manquent,
      // son premier appui ne fait que les expliquer (§1.2) — c'est le seul numéro qui change de sens
      if (old.key === 6) {
        expect(now.coercive).toBe(true);
        expect(sectorForDigit(DIRECT_MORE_RING, 9)!.orders).toContain(old.type);
        continue;
      }
      const wasCoercive = coercive.has(String(old.type));
      if (!wasCoercive) expect(now.orders.some((o) => coercive.has(String(o))), `F ${old.key}`).toBe(false);
    }
    for (const old of MORE_RING) {
      const now = sectorForDigit(DIRECT_MORE_RING, old.key)!;
      expect(now.orders, `F 8 ${old.key}`).toContain(old.type);
    }
  });

  it('chaque ordre de l’ancienne roue reste atteignable (roue ou « Tous les ordres » de la carte)', () => {
    const reach = new Set<string>();
    for (const s of DIRECT_WHEEL) for (const o of s.orders) reach.add(String(o));
    for (const s of DIRECT_MORE_RING) for (const o of s.orders) reach.add(String(o));
    for (const f of allOrdersGrouped()) for (const v of f.verbs) reach.add(String(v.type));
    for (const s of [...WHEEL, ...MORE_RING]) if (s.type !== 'secours' && s.type !== 'plus' && s.type !== 'pompiers' && s.type !== 'samu') expect(reach.has(String(s.type)), String(s.type)).toBe(true);
  });

  it('les mots du terrain sont ceux de la carte', () => {
    const mapWords = new Set(INTENTS.map((i) => i.label));
    for (const s of DIRECT_WHEEL) {
      if (s.intent) expect(mapWords.has(s.label) || s.label === 'Secours ici', s.label).toBe(true);
      if (s.intent) expect(INTENTS.find((i) => i.id === s.intent)!.label.startsWith(s.label.split(' ')[0]!)).toBe(true);
    }
    for (const s of DIRECT_MORE_RING.slice(0, 8)) expect(MORE_RING.find((m) => m.key === s.key)!.label).toBe(s.label);
    expect(VERB_WORDS.envoyer.label).toBe('Envoyer');
    expect(VERB_WORDS.interpeller.label).toBe('Interpeller');
    expect(VERB_WORDS.disperser.label).toBe('Disperser');
  });

  it('les formes courtes tiennent dans la pastille (128 px à l’échelle 1, 105 px à 0,82)', () => {
    for (const f of PILL_SHORT_FORMS) {
      expect(fitsPill(f, 1), f).toBe(true);
      expect(fitsPill(f, 0.82), f).toBe(true);
      expect(Object.values(VERB_WORDS).some((w) => w.short === f), f).toBe(true);
    }
    // la ligne 2 raccourcit le nom, jamais la distance
    const t = pillWhoText('Sections MISTRAL 1 et MISTRAL 2', 400, 0.82);
    expect(t.endsWith(' · 400\u00a0m')).toBe(true);
    expect(t).toContain('…');
    expect(pillWhoText('MISTRAL 1', 90)).toBe('MISTRAL 1 · 90\u00a0m');
  });
});

describe('capacités et refus', () => {
  it('tableau du §4.2', () => {
    expect(accepts('bravm', 'interpeller')).toBe(true);
    expect(accepts('centaure', 'pousser')).toBe(true);
    expect(accepts('centaure', 'interpeller')).toBe(false);
    expect(accepts('canon_eau', 'disperser')).toBe(true);
    expect(accepts('canon_eau', 'bloquer')).toBe(false);
    expect(accepts('drone', 'envoyer')).toBe(true);
    expect(accepts('drone', 'bloquer')).toBe(false);
    expect(accepts('cellulaire', 'partir')).toBe(true);
    expect(accepts('cellulaire', 'bloquer')).toBe(false);
    expect(accepts('troupe', 'partir')).toBe(false);
    for (const k of ['troupe', 'bravm', 'centaure', 'canon_eau', 'drone', 'cellulaire', 'patrouille'] as const) expect(accepts(k, 'avec_moi')).toBe(true);
  });

  it('chaque motif de refus écrit dans la simulation a ses mots (un motif inconnu fait échouer ce test)', () => {
    const root = join(__dirname, '../../src/sim/police');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else if (e.name.endsWith('.ts')) files.push(join(dir, e.name));
      }
    };
    walk(root);
    const patterns = [
      /refuse\(\w+, '([^']+)'\)/g, /finish\((?:k, op, )?false, '([^']+)'/g, /complete\(false, '([^']+)'/g, /done\(k, \w+, [\w.']+, false, '([^']+)'/g,
      /return '((?:Aucun|Aucune|Ordre|Niveau)[^']*)'/g, /reason = '([^']+)'/g, /reason: '([A-ZÀ-Ü][^']+)'/g,
    ];
    const found = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const re of patterns) for (const m of src.matchAll(re)) found.add(m[1]!);
    }
    found.delete('refus');
    expect(found.size).toBeGreaterThan(40);
    const unknown = [...found].filter((r) => !isKnownSimReason(r));
    expect(unknown).toEqual([]);
    expect(simRefusal('BRAV-M', 'Aucun fait constaté contre l’homme au sweat noir : interpellation non fondée, je ne l’exécute pas.'))
      .toBe('BRAV-M ne peut pas\u00a0: personne n’a rien commis ici (aucun fait constaté). U\u00a0: une autre unité.');
    expect(simRefusal('MISTRAL 2', 'Aucun itinéraire.')).toBe('MISTRAL 2 ne peut pas\u00a0: aucun chemin pour y aller. U\u00a0: une autre unité.');
  });
});

describe('fiches de la carte (P7) : Encercler avec deux unités au moins, « Aller constater » sans fait constaté', () => {
  it('sur la vraie Concorde (trois sections) : Encercler proposé, ligne 1 de la fiche de la foule', () => {
    const card = cardEnvFromCore(game.core);
    const cands = intentCandidates('encercler', card, card.player!);
    expect(cands.length).toBeGreaterThan(0);
    expect(buildCard(cands[0]!, card, null).lines[0]!.label).toBe('Encercler (nasse)');
  });

  it('fiche faite main : une seule section → Encercler absent de la fiche et des candidats ; interpeller sans fait → Aller constater', () => {
    const crowdC = {
      key: 'c', name: 'Tête de cortège', place: '', x: 0, z: 0, radius: 60, people: 300, tension: 0.4, heading: NaN, main: true, kettleId: 0, closed: false, exits: [],
    };
    const cu = (squadId: number, name: string, symbol: 'section' | 'groupe' | 'compagnie') => ({
      squadId, key: squadId, name, symbol, x: -100, z: 0, total: 19, valid: 19, morale: 1, ammo: 0, order: null, orderPlace: '', status: '', embarked: false,
      hasVehicles: true, mine: true, patrol: false, homeStation: '', targetEntity: 0, parentId: 0, hasPlayer: false,
    });
    const env: CardEnv = {
      level: 'unite', canTraffic: true, canSommation: false, canAuthorize: false, canMetro: false, canDelegate: true, salle: false, sommations: 0,
      lawful: 1, authorised: 1, underAttack: false, riposteAt: () => false, command: 'section', crowds: [crowdC], incidents: [],
      units: [cu(1, 'MISTRAL 1', 'section')], closures: [], metro: [], proposals: [], stations: [],
      player: { x: -120, z: 0, title: 'Chef', inVehicle: false }, blocked: null, hasRescue: false, selection: [], now: 0, farFor: () => false,
      roadAt: () => null, placeName: () => 'place de la Bastille', offenderAt: () => false,
    };
    expect(intentCandidates('encercler', env, { x: 0, z: 0 })).toEqual([]);
    const fiche = buildCard(crowdRepere(crowdC), env, null);
    expect(fiche.lines.some((l) => l.action.kind === 'nasse')).toBe(false);
    const line = buildCard(crowdRepere(crowdC), env, 'interpeller');
    const arrest = line.lines[line.defaultLine]!;
    expect(arrest.action).toMatchObject({ kind: 'verb', type: 'interpeller', noFact: true });
    expect(arrest.label).toBe('Aller constater');
    expect(arrest.explain).toBe(REFUS.constater);
    // deux sections : Encercler revient
    const two = { ...env, units: [cu(1, 'MISTRAL 1', 'section'), cu(2, 'MISTRAL 2', 'section')] };
    expect(intentCandidates('encercler', two, { x: 0, z: 0 }).length).toBeGreaterThan(0);
    expect(buildCard(crowdRepere(crowdC), two, null).lines[0]!.label).toBe('Encercler (nasse)');
  });
});
