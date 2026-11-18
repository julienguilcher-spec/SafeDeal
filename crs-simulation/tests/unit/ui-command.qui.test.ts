// « Qui » : l'unité que le jeu propose pour une ligne de fiche (bestUnit.ts), dans une vraie partie à la Concorde
// (commandant, cortège de 300 personnes, 3 sections, Centaure, canon à eau, BRAV-M). Barrer → une section, jamais la
// compagnie ; rue large → deux sections ; interpeller → la BRAV-M ; pousser un véhicule → le Centaure ; gaz → une
// section qui a des grenades ; les unités qui tiennent un barrage en dernier ; la sélection du joueur telle quelle ;
// T → la compagnie (commandant) ou le groupe (chef de groupe) ; les unités « au poste » jamais proposées.
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
import { NOBODY_LABEL, defaultWho, noUnitText, proposeWho, wholeCandidate, whoEnvFromCore } from '@/ui/command/bestUnit';
import type { CardEnv, CardLine, CardUnit, Repere, WhoCandidate } from '@/ui/command/cardTypes';
import { buildCard, intentCandidates } from '@/ui/command/intents';
import { FRONT_PER_AGENT } from '@/ui/command/orders';
import { cardEnvFromCore, crowdRepere, mainCrowd, pointRepere } from '@/ui/command/reperes';

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function concorde(role: 'commandant' | 'chef_groupe') {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role, rank: role === 'commandant' ? 'commandant' : undefined, place: 'Place de la Concorde', x: -10, z: 15,
    crowdSize: 300, tension: 0.4, volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const core = t.ctx.service<CommandCore>('ui.command')!;
  return { t, ctx: t.ctx, core };
}

function unitOf(env: CardEnv, id: number): CardUnit {
  const u = env.units.find((q) => q.squadId === id);
  expect(u, `unité ${id}`).toBeTruthy();
  return u!;
}

function lineOf(lines: readonly CardLine[], pred: (l: CardLine) => boolean): CardLine {
  const l = lines.find(pred);
  expect(l).toBeTruthy();
  return l!;
}

function symbols(env: CardEnv, c: WhoCandidate): string[] {
  return c.squadIds.map((id) => unitOf(env, id).symbol);
}

describe('Qui : l’unité proposée (vraie partie, place de la Concorde)', () => {
  it('commandant : section pour barrer, deux pour une rue large, BRAV-M, Centaure, grenades, barrages en dernier, sélection, T, exclusion', async () => {
    const { t, ctx, core } = await concorde('commandant');
    let card = cardEnvFromCore(core);
    let env = whoEnvFromCore(core, card, []);
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie' && s.faction === 'police')!;
    const me = card.player!;

    // « Barrer la rue » sur la meilleure rue du cortège : une section (ou deux), jamais la compagnie
    const streets = intentCandidates('bloquer', card, me);
    expect(streets.length).toBeGreaterThan(1);
    const barrer = (r: Repere): CardLine => buildCard(r, card, 'bloquer').lines[0]!;
    for (const r of streets.slice(0, 6)) {
      const list = proposeWho(barrer(r), r, env);
      expect(list.length).toBeGreaterThan(0);
      const first = defaultWho(list)!;
      expect(symbols(card, first).every((s) => s === 'section')).toBe(true);
      expect(first.squadIds).not.toContain(company.id);
      for (const c of list) expect(c.squadIds).not.toContain(company.id);
    }
    // rue plus large que le front d'une section : deux sections ; rue étroite : une seule
    const widthOf = (r: Repere): number => {
      const c = card.crowds.find((q) => q.key === r.crowdKey);
      return c?.exits.find((e) => e.edgeId === r.roadEdge)?.width ?? 0;
    };
    const sections = card.units.filter((u) => u.mine && u.symbol === 'section');
    const front = Math.min(...sections.map((u) => u.valid)) * FRONT_PER_AGENT;
    const wide = streets.find((r) => widthOf(r) > Math.max(...sections.map((u) => u.valid)) * FRONT_PER_AGENT);
    expect(wide, 'une rue large à la Concorde').toBeTruthy();
    const two = proposeWho(barrer(wide!), wide!, env)[0]!;
    expect(two.squadIds.length).toBe(2);
    expect(symbols(card, two)).toEqual(['section', 'section']);
    expect(two.label).toMatch(/^Sections .+ et .+$/);
    expect(two.busy).toMatch(/2 sections/);
    const narrow = streets.find((r) => widthOf(r) > 0 && widthOf(r) <= front);
    if (narrow) expect(proposeWho(barrer(narrow), narrow, env)[0]!.squadIds.length).toBe(1);

    // la foule : interpeller → BRAV-M, gaz → une section qui a des grenades
    const main = mainCrowd(card)!;
    const crowdRep = crowdRepere(main);
    const crowdCard = buildCard(crowdRep, card, null);
    const all = crowdCard.lines.concat(crowdCard.others);
    const arrest = lineOf(all, (l) => l.action.kind === 'verb' && l.action.type === 'interpeller');
    const bravm = proposeWho(arrest, crowdRep, env)[0]!;
    expect(symbols(card, bravm)).toEqual(['bravm']);
    const gas = lineOf(all, (l) => l.action.kind === 'verb' && l.action.type === 'disperser_gaz');
    const gasWho = proposeWho(gas, crowdRep, env);
    // au départ, les sections manœuvrent dans la formation de la compagnie, dont l'ordre ne permet que les mains
    // nues : la simulation refuserait le gaz à une section seule ; c'est la compagnie (ses grenadiers) qui le reçoit
    const gasUnit = gasWho[0]!.squadIds[0]!;
    const rootOf = (id: number): number => t.ctx.service<{ rootOf(id: number): number }>('police.units')!.rootOf(id);
    expect(['section', 'compagnie']).toContain(symbols(card, gasWho[0]!)[0]);
    expect(rootOf(gasUnit) === gasUnit || t.ctx.squads.get(rootOf(gasUnit))!.order.maxForce >= 3).toBe(true);
    expect(unitOf(card, gasUnit).ammo).toBeGreaterThan(0);

    // pousser un véhicule : le blindé Centaure
    const pt = pointRepere(me.x + 40, me.z, card);
    const pointCard = buildCard(pt, card, null);
    const push = lineOf(pointCard.lines.concat(pointCard.others), (l) => l.action.kind === 'verb' && l.action.type === 'degager_obstacle');
    const centaure = proposeWho(push, pt, env);
    expect(centaure.length).toBeGreaterThan(0);
    expect(centaure.every((c) => symbols(card, c).every((s) => s === 'centaure'))).toBe(true);

    // « Fermer aux voitures » : personne d'abord (barrières seules), U ajoute une unité
    const close = lineOf(buildCard(streets[0]!, card, null).lines, (l) => l.action.kind === 'closeRoad');
    const holders = proposeWho(close, streets[0]!, env);
    expect(holders[0]!.label).toBe(NOBODY_LABEL);
    expect(holders[0]!.squadIds).toEqual([]);
    expect(holders.length).toBeGreaterThan(1);

    // une ligne sans unité (secours, « Suivez-moi ») : pas de Qui
    const vous: Repere = { kind: 'vous', key: 'vous', x: me.x, z: me.z, name: 'Vous' };
    expect(proposeWho(lineOf(buildCard(vous, card, null).lines, (l) => l.action.kind === 'follow'), vous, env)).toEqual([]);
    const rescue: CardLine = { label: 'Pompiers ici', explain: '', icon: 'flame', action: { kind: 'rescue', service: 'pompiers', incidentId: 0 }, coercive: false, lock: null, needsWho: false, rule: '' };
    expect(proposeWho(rescue, pt, env)).toEqual([]);

    // la sélection du joueur passe telle quelle, en tête
    const pick = [sections[2]!.squadId, sections[0]!.squadId];
    const sel = proposeWho(barrer(streets[0]!), streets[0]!, whoEnvFromCore(core, card, pick))[0]!;
    expect(sel.squadIds).toEqual(pick);
    expect(sel.label).toBe('2 unités choisies');

    // T : la compagnie entière du commandant
    const whole = wholeCandidate(streets[0]!, env)!;
    expect(whole.squadIds).toEqual([company.id]);
    expect(whole.label).toBe('Toute la compagnie');

    // les unités « au poste » (module des commissariats) ne sont jamais proposées
    const best = defaultWho(proposeWho(barrer(streets[0]!), streets[0]!, env))!.squadIds[0]!;
    const excl = whoEnvFromCore(core, card, [], { exclude: (id) => id === best });
    for (const c of proposeWho(barrer(streets[0]!), streets[0]!, excl)) expect(c.squadIds).not.toContain(best);
    for (const c of proposeWho(arrest, crowdRep, excl)) expect(c.squadIds).not.toContain(best);
    // les renforts d'un commissariat viennent après mes unités, jamais d'office
    const stationEnv = whoEnvFromCore(core, card, [], {
      stationCandidates: () => [{ squadIds: [], label: 'TV 75-19', mode: 'vehicules', eta: 240, distance: 2100, busy: 'prête', fromStation: 9 }],
    });
    const withStation = proposeWho(barrer(streets[0]!), streets[0]!, stationEnv);
    expect(withStation[0]!.fromStation).toBeUndefined();
    expect(withStation.at(-1)!.fromStation).toBe(9);
    expect(defaultWho(withStation.filter((c) => c.fromStation !== undefined))).toBeNull();
    expect(noUnitText(withStation.filter((c) => c.fromStation !== undefined))).toBe('Aucune unité libre — renfort possible : TV 75-19 (~4 min) : U');

    // une section qui barre une rue (barrage tenu) passe après toutes les autres
    const holder = ctx.squads.get(best)!;
    const target = streets[0]!;
    expect(core.issue('couper_circulation', [holder], [{ x: target.x, z: target.z, heading: 0, width: 0 }]).ok).toBe(true);
    for (let i = 0; i < 20 && !core.maps.scene.barrages.some((b) => b.squadId === best); i++) {
      t.step(1);
      core.maps.scene.ensureFresh();
    }
    card = cardEnvFromCore(core);
    env = whoEnvFromCore(core, card, []);
    expect(env.holding.has(best)).toBe(true);
    const ranked = proposeWho(barrer(streets[1]!), streets[1]!, env).filter((c) => c.squadIds.length === 1 && symbols(card, c)[0] === 'section');
    expect(ranked.at(-1)!.squadIds).toEqual([best]);
    expect(ranked.at(-1)!.busy).toMatch(/la quittera/);
  }, 300000);

  it('chef de groupe : T = son groupe ; jamais une unité hors de son commandement', async () => {
    const { ctx, core } = await concorde('chef_groupe');
    const sc = core.scope();
    expect(sc.level).toBe('unite');
    const card = cardEnvFromCore(core);
    const env = whoEnvFromCore(core, card, []);
    const own = ctx.squads.get(sc.ownSquadId)!;
    const whole = wholeCandidate({ x: 0, z: 0 }, env)!;
    expect(whole.squadIds).toEqual([own.id]);
    expect(whole.label).toBe(own.kind === 'section' ? 'Toute la section' : 'Tout le groupe');
    const pt = pointRepere(card.player!.x + 30, card.player!.z, card);
    const go = buildCard(pt, card, null).lines[0]!;
    for (const c of proposeWho(go, pt, env)) for (const id of c.squadIds) expect(core.canCommand(id)).toBe(true);
  }, 300000);
});
