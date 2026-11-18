// Carte de commandement — défauts trouvés en branchant les morceaux ensemble (paquet d'intégration) :
//   - la chaîne légale abandonnait au moment d'autoriser le gaz : la loi enregistre le niveau ordonné mais ne le rend
//     effectif qu'après le délai laissé à la foule (vu dans le navigateur : « Vous ne pouvez pas autoriser … ») ;
//   - « Barrer la rue » proposait une voiture de patrouille dès que les sections étaient occupées ;
//   - les trouées piétonnes d'une place s'appelaient toutes « Passage piéton » et passaient avant les rues ;
//   - un toucher sur une place empilait une dizaine d'onglets du même nom ;
//   - « barre la Place de la Concorde » (majuscule au milieu de la phrase).
import { describe, expect, it } from 'vitest';

import type { ForceLevel } from '@/core/contracts';
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
import { defaultWho, proposeWho, whoEnvFromCore } from '@/ui/command/bestUnit';
import type { CardLine, CardUnit, Repere } from '@/ui/command/cardTypes';
import { blockCandidates, buildCard } from '@/ui/command/intents';
import { LegalChain, legalPlan, legalSteps } from '@/ui/command/legalChain';
import type { LegalDeps } from '@/ui/command/legalChain';
import { doingAt, verbOf, withArticle } from '@/ui/command/orders';
import { cardEnvFromCore, mainCrowd } from '@/ui/command/reperes';
import { stackOf } from '@/ui/command/tacticalState';

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

async function concorde() {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.4,
    volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  return { t, core: t.ctx.service<CommandCore>('ui.command')! };
}

describe('chaîne légale : le niveau autorisé n’entre en vigueur qu’après le délai laissé à la foule', () => {
  it('sommations, autorisation enregistrée, attente, puis UN ordre — jamais « Vous ne pouvez pas autoriser »', () => {
    let now = 0;
    let done = 0;
    let at = -1e9;
    let ordered: ForceLevel = 1;
    const log: string[] = [];
    // comme gameplay/law : le niveau publié est plafonné par ce que la loi permet (3 sommations + 10 s)
    const lawful = (): ForceLevel => (done >= 3 && now - at >= 10 ? 3 : 1);
    const deps: LegalDeps = {
      sommation: () => {
        done++;
        at = now;
        log.push(`sommation:${done}`);
        return true;
      },
      requestSommation: () => false,
      sommationWait: () => (done === 0 || done >= 3 ? 0 : Math.max(0, 20 - (now - at))),
      sommationsDone: () => done,
      sommationRefusal: () => '',
      authorize: (level) => {
        ordered = level;
        log.push(`autorise:${level}`);
        return true;
      },
      authorised: () => Math.min(ordered, lawful()) as ForceLevel,
      requestForce: () => {},
      forceWait: () => (done < 3 ? Infinity : Math.max(0, 10 - (now - at))),
      issue: (plan) => {
        log.push(`ordre:${plan.line.label}`);
        return { ok: true, reason: '' };
      },
    };
    const line: CardLine = {
      label: 'Disperser au gaz lacrymogène', explain: '', icon: 'wind', action: { kind: 'verb', type: 'disperser_gaz', geom: 'point' },
      coercive: false, lock: { sommations: 3, force: 3, text: 'sommations 0/3 + autoriser le gaz' }, needsWho: true, rule: '',
    };
    const where: Repere = { kind: 'foule', key: 'foule:c', x: 0, z: 0, crowdKey: 'c', name: 'Tête de cortège' };
    const steps = legalSteps(verbOf('disperser_gaz')!, { sommations: 0, authorised: 1, underAttack: false, riposte: false },
      { level: 'tout', canSommation: true, canAuthorize: true, salle: false, officer: false }, '');
    const chain = new LegalChain(deps);
    chain.start(legalPlan(line, { squadIds: [7], label: 'Section MISTRAL 2', mode: 'pied', eta: 60, distance: 80, busy: '' }, where, steps));
    for (let i = 0; i < 4 * 300 && chain.active(); i++) {
      now += 0.25;
      chain.tick(now);
    }
    expect(log).toEqual(['sommation:1', 'sommation:2', 'sommation:3', 'autorise:3', 'ordre:Disperser au gaz lacrymogène']);
    expect(chain.status()?.stage).toBe('fini');
  });
});

describe('pièces de la fiche, mots', () => {
  it('repères empilés : un onglet par nom, au plus trois, le plus prioritaire d’abord', () => {
    const r = (key: string, name: string): Repere => ({ kind: 'rue', key, x: 0, z: 0, name });
    const list = [r('a', 'Place de la Concorde'), r('b', 'Place de la Concorde'), r('c', 'Passage piéton (rue Royale)'), r('d', 'Rue Royale'), r('e', 'Quai des Tuileries')];
    expect(stackOf(list).map((q) => q.key)).toEqual(['a', 'c', 'd']);
    expect(stackOf(list, 2).map((q) => q.key)).toEqual(['a', 'c']);
  });

  it('la voie s’écrit en minuscule au milieu d’une phrase', () => {
    expect(withArticle('Place de la Concorde')).toBe('la place de la Concorde');
    expect(withArticle('Avenue de la République')).toBe('l’avenue de la République');
    expect(withArticle('Boulevard Haussmann')).toBe('le boulevard Haussmann');
    expect(withArticle('Tête de cortège')).toBe('la Tête de cortège');
    expect(doingAt('couper_circulation', 'Place de la Concorde')).toBe('Barre la place de la Concorde');
  });
});

describe('vraie partie (place de la Concorde, commandant)', () => {
  it('B : les rues avant les trouées piétonnes, qui portent le nom de la voie voisine', async () => {
    const { core } = await concorde();
    const env = cardEnvFromCore(core);
    const main = mainCrowd(env)!;
    const list = blockCandidates(env, env.player!);
    expect(list.length).toBeGreaterThan(3);
    const open = new Set(main.exits.filter((e) => !e.held).map((e) => `${Math.round(e.x)},${Math.round(e.z)}`));
    const mainOpen = list.filter((r) => r.crowdKey === main.key && open.has(`${Math.round(r.x)},${Math.round(r.z)}`));
    const firstGap = mainOpen.findIndex((r) => (r.roadEdge ?? -1) < 0);
    const lastStreet = mainOpen.map((r) => (r.roadEdge ?? -1) >= 0).lastIndexOf(true);
    if (firstGap >= 0) expect(firstGap).toBeGreaterThan(lastStreet);
    for (const r of list) {
      expect(r.name).not.toBe('');
      if ((r.roadEdge ?? -1) < 0) expect(r.name, r.key).toMatch(/^Passage piéton( \(.+\))?$/);
    }
    expect(list.filter((r) => (r.roadEdge ?? -1) < 0).some((r) => /\(/.test(r.name))).toBe(true);
  }, 300000);

  it('« Barrer la rue » : une section ou un groupe, même occupés, avant une voiture de patrouille libre', async () => {
    const { core } = await concorde();
    const env = cardEnvFromCore(core);
    const street = blockCandidates(env, env.player!)[0]!;
    const line = buildCard(street, env, 'bloquer').lines[0]!;
    const busy = env.units.map((u): CardUnit => (u.mine && (u.symbol === 'section' || u.symbol === 'groupe')
      ? { ...u, order: { type: 'couper_circulation', x: u.x + 50, z: u.z, targetId: 0, issuedAt: 1 }, orderPlace: 'rue Royale' } : u));
    const any = busy.find((u) => u.mine && u.symbol === 'section')!;
    const patrol: CardUnit = { ...any, squadId: 9001, key: 9001, name: 'TV 75-07', symbol: 'patrouille', patrol: true, x: street.x + 5, z: street.z, order: null, orderPlace: '', valid: 3, total: 3 };
    const card = { ...env, units: [...busy, patrol] };
    const who = whoEnvFromCore(core, card, []);
    const ranked = proposeWho(line, street, { ...who, canCommand: (id) => id === 9001 || who.canCommand(id) });
    const first = defaultWho(ranked)!;
    expect(first.squadIds).not.toContain(9001);
    expect(ranked.findIndex((c) => c.squadIds.includes(9001))).toBeGreaterThan(0);
  }, 300000);
});
