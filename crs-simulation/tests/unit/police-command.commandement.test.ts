// Commandement — conception du dispositif, aptitude du commandant, adjoint du joueur-commandant, services
// absents, déterminisme. Quartier d'essai et modules réels, sauf mention (directeur de foule scripté quand le
// test ne porte que sur le dispositif).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as policeModule } from '@/sim/police';
import type { CommandApi, CommandDecision, Proposal } from '@/sim/police/command/api';
import { CommandSystem } from '@/sim/police/command';
import { spawnProtesters, throwAt } from '@/sim/police/testkit';
import { createTestDirector, createTestServices, startCommand } from '@/sim/police/command/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles];
/** Parcours scripté : rue de la Fontaine, d'ouest en est, à 65 m de la mairie. */
const ROUTE = [20, -160, 420, -160];

describe('dispositif', () => {
  it('place les barrages aux débouchés latéraux du parcours, face au parcours, et garde le site sensible', async () => {
    const dir = createTestDirector(ROUTE.slice());
    const svc = createTestServices({ traffic: true });
    const t = await startCommand(MODULES, { mode: 'test', x: 20, z: -160, extra: { 'commandement.aptitude': 0.9 } }, { seed: 31, systems: [dir.system, svc.system] });
    const { ctx } = t;
    const cie = t.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false });
    t.step(3);
    const state = t.api.stateOf(cie.squad.id)!;
    const posts = state.posts;
    const barrages = posts.filter((p) => p.kind === 'barrage');
    const sites = posts.filter((p) => p.kind === 'site');
    console.log('dispositif :', barrages.length, 'barrages —', barrages.map((p) => p.name + ' (' + Math.round(p.x) + ',' + Math.round(p.z) + ') ' + p.width.toFixed(0) + ' m s=' + Math.round(p.s)).join(' ; '), '| sites :', sites.map((p) => p.name + ' (' + Math.round(p.x) + ',' + Math.round(p.z) + ')').join(' ; '));
    // les rues qui coupent la rue de la Fontaine entre x = 20 et x = 420 : Peupliers, Horloge, des deux côtés
    expect(barrages.length).toBeGreaterThanOrEqual(4);
    for (const name of ['Rue des Peupliers', "Rue de l'Horloge"]) {
      const both = barrages.filter((p) => p.name === name);
      expect(both.some((p) => p.z < -172)).toBe(true);
      expect(both.some((p) => p.z > -148)).toBe(true);
    }
    for (const p of barrages) {
      // en retrait de l'axe, dans la rue latérale, de façade à façade, face au parcours
      if (p.x < 20 || p.x > 420) continue;
      expect(Math.abs(p.z + 160)).toBeGreaterThanOrEqual(12);
      expect(p.width).toBeGreaterThan(7);
      expect(p.width).toBeLessThan(45);
      const toRoute = Math.sign(-160 - p.z);
      expect(Math.cos(p.heading) * toRoute).toBeGreaterThan(0.9);
    }
    // la mairie, à 65 m du parcours, est gardée ; la garde se tient entre elle et le parcours
    expect(sites.length).toBe(1);
    expect(sites[0].name).toContain('Mairie');
    expect(sites[0].z).toBeGreaterThan(-225);
    expect(sites[0].z).toBeLessThan(-165);
    // mise en place : les unités arrivent et le dispositif est déclaré en place
    t.run(240, 1, () => state.deployedAt > 0);
    const held = posts.filter((p) => p.state === 'tenu');
    console.log('en place à t =', state.deployedAt.toFixed(0), 's ;', held.length, 'emplacements tenus ; fermetures demandées', svc.traffic().asked.length, '; réserve', ctx.squads.get(state.reserveId)?.name);
    expect(state.deployedAt).toBeGreaterThan(0);
    expect(state.reserveId).not.toBe(0);
    expect(svc.traffic().asked.length).toBeGreaterThanOrEqual(3);
    expect(held.length).toBeGreaterThanOrEqual(4);
    // les unités encore en marche à la déclaration arrivent ensuite
    t.step(110);
    expect(posts.filter((p) => p.state === 'tenu').length).toBeGreaterThanOrEqual(6);
    expect(posts.some((p) => p.state === 'tenu' && p.kind === 'site')).toBe(true);
    // chaque barrage tenu l'est par une ligne en travers de la rue, face au parcours
    for (const p of posts.filter((q) => q.kind === 'barrage' && q.state === 'tenu')) {
      const info = t.formation.of(p.squadId)!;
      expect(info.formation).toBe('ligne');
      expect(Math.hypot(info.x - p.x, info.z - p.z)).toBeLessThan(6);
      expect(info.lineError).toBeLessThan(1);
    }
  }, 300000);

  it('un commandant médiocre couvre moins bien le parcours qu\'un bon commandant', async () => {
    const result: { aptitude: number; elements: number; held: number; closures: number; deployedAt: number }[] = [];
    for (const aptitude of [0.15, 0.9]) {
      const dir = createTestDirector(ROUTE.slice());
      const svc = createTestServices({ traffic: true });
      const t = await startCommand(MODULES, { mode: 'test', x: 20, z: -160, extra: { 'commandement.aptitude': aptitude } }, { seed: 31, systems: [dir.system, svc.system] });
      const cie = t.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false });
      t.step(2);
      const state = t.api.stateOf(cie.squad.id)!;
      expect(state.aptitude).toBeCloseTo(aptitude, 5);
      t.run(260, 1, () => state.deployedAt > 0);
      const units = new Set(state.posts.filter((p) => p.squadId !== 0).map((p) => p.squadId));
      result.push({ aptitude, elements: units.size, held: state.posts.filter((p) => p.state === 'tenu').length, closures: svc.traffic().asked.length, deployedAt: state.deployedAt });
    }
    console.log('aptitude :', JSON.stringify(result));
    // le bon chef fractionne ses sections en groupes : plus de débouchés tenus, plus de rues fermées à l'avance
    expect(result[1].held).toBeGreaterThan(result[0].held);
    expect(result[1].closures).toBeGreaterThan(result[0].closures);
    expect(result[0].held).toBeGreaterThanOrEqual(2);
  }, 300000);
});

describe('adjoint du joueur-commandant', () => {
  it('ne décide rien : il propose par radio, à la cadence réglée, et exécute ce que le joueur accepte', async () => {
    const dir = createTestDirector(ROUTE.slice());
    const t = await startCommand(MODULES, { mode: 'test', x: 20, z: -160, extra: { 'commandement.adjoint': 8 } }, { seed: 33, systems: [dir.system] });
    const { ctx } = t;
    const cie = t.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false });
    const chief = cie.leader!;
    ctx.player.possess(chief.id, 'commandant');
    expect(chief.isPlayer).toBe(true);
    const orders: { t: number; squadId: number; type: string; by: number }[] = [];
    ctx.events.on('order:issued', (e) => orders.push({ t: ctx.clock.now, squadId: e.squadId, type: e.order.type, by: e.order.issuedBy }));
    const said: { t: number; text: string }[] = [];
    ctx.events.on('radio:message', (e) => { if (e.msg.from.endsWith('ADJOINT')) said.push({ t: ctx.clock.now, text: e.msg.text }); });
    const proposed: Proposal[] = [];
    ctx.events.onAny('command:proposal', (d) => proposed.push({ ...(d as Proposal) }));
    t.step(40);
    const state = t.api.stateOf(cie.squad.id)!;
    console.log('adjoint : mode', state.mode, '| ordres donnés par l\'IA :', orders.length, '| propositions dites :', said.map((s) => s.t.toFixed(0) + ' « ' + s.text + ' »').join(' '));
    expect(state.mode).toBe('adjoint');
    // l'IA n'a donné aucun ordre ; le joueur n'est pas piloté
    expect(orders.length).toBe(0);
    expect(said.length).toBeGreaterThanOrEqual(1);
    expect(said.every((s) => s.text.startsWith('Chef, '))).toBe(true);
    expect(said[0].text).toContain('je propose la mise en place du dispositif');
    for (let i = 1; i < said.length; i++) expect(said[i].t - said[i - 1].t).toBeGreaterThanOrEqual(7.9);
    // le joueur accepte le dispositif : les ordres partent en son nom
    const plan = t.api.proposals.find((p) => p.key === 'dispositif');
    expect(plan).toBeDefined();
    expect(plan!.executable).toBe(true);
    expect(t.api.accept(plan!.id)).toBe(true);
    t.step(1);
    expect(orders.length).toBeGreaterThanOrEqual(4);
    expect(orders.every((o) => o.by === chief.id)).toBe(true);
    // une unité en place est prise à partie par un groupe : l'adjoint propose la riposte puis un bond offensif
    t.run(150, 1, () => state.posts.filter((p) => p.state === 'tenu' && p.kind === 'barrage').length >= 2);
    t.step(15);
    const post = state.posts.find((p) => p.state === 'tenu' && p.kind === 'barrage' && (t.status.of(p.squadId)?.alignError ?? 9) < 1)!;
    expect(post).toBeDefined();
    const fx = Math.sin(post.heading);
    const fz = Math.cos(post.heading);
    const info = t.formation.of(post.squadId)!;
    const groupe = spawnProtesters(ctx, 10, info.x + fx * 17, info.z + fz * 17, post.heading + Math.PI, 'radical', 1.3, 5);
    for (const p of groupe) p.brain = { tag: 'test.groupe' };
    const before = orders.length;
    let n = 0;
    t.run(75, 0.5, () => {
      const p = groupe[n++ % groupe.length];
      if (p.custody === 'free' && p.posture !== 'down') throwAt(ctx, p, 'pave', info.x, info.z);
    });
    const texts = proposed.map((p) => p.text);
    const bond = texts.find((x) => /^Chef, groupe hostile en formation .*je propose un bond offensif/.test(x));
    console.log('adjoint, unité prise à partie :', texts.slice(-6).join(' | '), '| ordres de l\'IA pendant l\'attaque :', orders.length - before);
    expect(texts.some((x) => x.includes('je propose la riposte'))).toBe(true);
    expect(bond).toBeDefined();
    // toujours aucun ordre donné sans le joueur
    expect(orders.slice(before).filter((o) => o.type === 'bond_offensif').length).toBe(0);
    const offer = t.api.proposals.find((p) => p.key.startsWith('bond:'));
    if (offer) {
      expect(t.api.accept(offer.id)).toBe(true);
      t.step(1);
      const o = orders[orders.length - 1];
      expect(o.type).toBe('bond_offensif');
      expect(o.by).toBe(chief.id);
    }
  }, 300000);
});

describe('salle de commandement', () => {
  it('sur demande, l\'officier IA se porte à portée de mégaphone et prononce la sommation suivante', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: -160, extra: { commandement: 'joueur', 'law.attroupement': true, 'law.delays': { annonce: 2, sommation: 2, force: 2, armes: 2 } } }, { seed: 35 });
    const { ctx } = t;
    const cie = t.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false });
    const zone = { x: 110, z: -160 };
    const groupe = spawnProtesters(ctx, 14, zone.x, zone.z, -Math.PI / 2, 'radical', 1.3, 5);
    for (const p of groupe) p.brain = { tag: 'test.groupe' };
    const orders: string[] = [];
    ctx.events.on('order:issued', (e) => orders.push(e.order.type));
    const sommations: { stage: number; byId: number; d: number; t: number }[] = [];
    ctx.events.on('law:sommation', (e) => sommations.push({ stage: e.stage, byId: e.byId, d: Math.hypot(e.x - zone.x, e.z - zone.z), t: ctx.clock.now }));
    t.step(3);
    const state = t.api.stateOf(cie.squad.id)!;
    expect(state.mode).toBe('adjoint');
    expect(t.api.requestSommation(cie.squad.id, zone.x, zone.z)).toBe(true);
    t.run(150, 1, () => sommations.length >= 1);
    t.step(4);
    console.log('salle de commandement : sommations', JSON.stringify(sommations), '| ordres donnés par l\'IA :', orders.length, '| procédure :', state.sommations);
    expect(sommations.length).toBe(1);
    expect(sommations[0].stage).toBe(1);
    expect(sommations[0].byId).toBe(cie.leader!.id);
    expect(sommations[0].d).toBeLessThan(60);
    // une étape par demande, et aucun ordre donné aux unités à la place du joueur
    expect(orders.length).toBe(0);
    expect(state.sommations).toBe('aucune');
    expect(ctx.law.roe.authorizedForce).toBe(1);
  }, 300000);
});

describe('coût', () => {
  it('reste faible avec 1 500 personnes, une compagnie déployée, les moyens spéciaux et des points chauds actifs', async () => {
    const dir = createTestDirector(ROUTE.slice(), 'cortege');
    const svc = createTestServices({ traffic: true, incidents: true });
    const t = await startCommand(MODULES, { mode: 'test', x: 20, z: -160 }, { seed: 37, systems: [dir.system, svc.system] });
    const { ctx } = t;
    const cie = t.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false });
    t.units.createEquipage('centaure', { x: 0, z: -40, heading: Math.PI });
    t.units.createEquipage('canon_eau', { x: 0, z: -20, heading: Math.PI });
    t.units.createBravm(6, { x: 0, z: 60, heading: Math.PI, mounted: true });
    t.api.createDroneTeam({ x: 6, z: -80 });
    // 1 500 manifestants immobiles le long du parcours et de l'avenue (aucune IA de foule : seul le commandement est mesuré)
    const crowdPeople: Person[] = [];
    for (let b = 0; b < 15; b++) {
      const along = b < 8;
      const x = along ? 40 + b * 45 : -420 + (b - 8) * 55;
      const z = along ? -160 : 0;
      for (const p of spawnProtesters(ctx, 100, x, z, Math.PI / 2, b % 5 === 0 ? 'radical' : 'pacifique', 0.9, 10)) {
        p.brain = { tag: 'test.foule' };
        crowdPeople.push(p);
      }
    }
    t.step(30);
    t.cost();
    let k = 0;
    const t0 = performance.now();
    t.run(60, 0.5, (elapsed) => {
      // des faits répétés entretiennent quatre points chauds, la tête du cortège avance
      dir.director.headProgress = Math.min(380, elapsed * 0.7);
      for (let i = 0; i < 4; i++) {
        const p = crowdPeople[(i * 200 + (k % 40)) % crowdPeople.length];
        ctx.law.recordOffense(p, 'degradation', p.x, p.z, 3);
        ctx.events.emit('shop:window', { id: ctx.props.shops.length > 0 ? ctx.props.shops[(i * 7) % ctx.props.shops.length].id : 0, state: 'broken', byId: p.id });
      }
      k++;
    });
    const wall = performance.now() - t0;
    const cost = t.cost();
    const state = t.api.stateOf(cie.squad.id)!;
    console.log('coût du commandement,', ctx.people.list.length, 'personnes :', 'moyenne', cost.mean.toFixed(4), 'ms ; p95', cost.p95.toFixed(4), 'ms ; max', cost.max.toFixed(2), 'ms sur', cost.steps, 'pas (60 s simulées en', Math.round(wall), 'ms tout compris) | phase', state.phase, '| points chauds', t.api.hotspots.length, '| unités spéciales', t.api.specials.length, '| décisions', t.api.decisions.length);
    expect(ctx.people.list.length).toBeGreaterThanOrEqual(1500);
    expect(t.api.specials.length).toBe(4);
    expect(t.api.hotspots.length).toBeGreaterThan(0);
    expect(cost.mean).toBeLessThan(0.5);
    expect(cost.p95).toBeLessThan(1.5);
  }, 300000);
});

describe('services absents', () => {
  it('le commandement seul, sans aucun autre module, ne fait rien et ne plante pas', async () => {
    const t = createTestContext({ seed: 3, systems: [new CommandSystem()] });
    await t.start({ mode: 'test' });
    const api = t.ctx.require<CommandApi>('police.command');
    t.step(20);
    expect(api.commands.length).toBe(0);
    expect(api.arrive(1, { x: 0, z: 0, heading: 0 })).toBe(false);
    expect(api.special(1)).toBeNull();
    expect(api.hotspots.length).toBe(0);
  });

  it('sans monde, sans véhicules, sans foule ni incidents : la compagnie se met en réserve, puis fin de mission sur demande', async () => {
    const t = createTestContext({ seed: 3, modules: [people, policeModule] });
    await t.start({ mode: 'test' });
    const { ctx } = t;
    const api = ctx.require<CommandApi>('police.command');
    const units = ctx.require<import('@/sim/police/api').PoliceUnitsApi>('police.units');
    const cie = units.createCompany({ x: 0, z: 0, heading: 0, vehicles: false });
    t.step(60);
    const state = api.stateOf(cie.squad.id)!;
    expect(state).not.toBeNull();
    expect(state.mode).toBe('ia');
    expect(state.phase).toBe('conduite');
    expect(state.posts.length).toBe(0);
    api.endMission(cie.squad.id);
    t.step(300);
    const end = ctx.radio.log.find((r) => r.text.includes('Fin de mission, retour à la base'));
    console.log('sans autres modules : phase', state.phase, '| fin de mission :', end?.text);
    expect(state.missionEnded).toBe(true);
    expect(end).toBeDefined();
  }, 120000);
});

describe('déterminisme', () => {
  async function scenario(seed: number): Promise<{ decisions: string; radio: string; positions: string }> {
    const svc = createTestServices({ incidents: true, traffic: true });
    const t = await startCommand([...MODULES, crowd], { mode: 'test', x: 0, z: 0, crowdSize: 120, duration: 'courte', tension: 0.15, volatility: 0.2 }, { seed, systems: [svc.system], dt: 0.05 });
    const { ctx } = t;
    const cie = t.units.createCompany({ x: 95, z: 289.5, heading: -Math.PI / 2, layout: 'colonne' });
    t.api.createDroneTeam({ x: 118, z: 286, heading: -Math.PI / 2 });
    const decisions: string[] = [];
    ctx.events.onAny('command:decision', (d) => {
      const e = d as CommandDecision;
      decisions.push(e.t.toFixed(2) + ' ' + e.key + ' ' + e.unitId + ' ' + e.text);
    });
    const casseurs: Person[] = [];
    for (let i = 0; i < 10; i++) {
      const p = ctx.people.spawn({ kind: 'manifestant', faction: 'protest', profile: 'radical', x: 70 + (i % 4) * 4, z: 147 + Math.floor(i / 4) * 3, heading: 0, seed: 900 + i });
      p.brain = { tag: 'test.casseur' };
      casseurs.push(p);
    }
    let k = 0;
    t.run(200, 0.5, (elapsed) => {
      if (elapsed >= 30 && Math.round(elapsed * 2) % 8 === 0) {
        const p = casseurs[k++ % casseurs.length];
        ctx.law.recordOffense(p, 'degradation', p.x, p.z, 3);
        ctx.events.emit('shop:window', { id: ctx.props.shops.length > 0 ? ctx.props.shops[0].id : 0, state: 'broken', byId: p.id });
      }
      if (Math.abs(elapsed - 60) < 0.01) svc.incidents().open('feu_poubelle', -42, 151, 'place', 0, 1);
    });
    const pos = cie.people.map((p) => p.x.toFixed(3) + ',' + p.z.toFixed(3) + ',' + p.vehicleId).join(';');
    return { decisions: decisions.join('\n'), radio: ctx.radio.log.map((r) => r.t.toFixed(2) + ' ' + r.from + ' ' + r.text).join('\n'), positions: pos };
  }

  it('même graine, même déroulement ; autre graine, déroulement différent', async () => {
    const a = await scenario(41);
    const b = await scenario(41);
    const c = await scenario(42);
    console.log('déterminisme :', a.decisions.split('\n').length, 'décisions,', a.radio.split('\n').length, 'messages radio ; identiques :', a.decisions === b.decisions, a.radio === b.radio, a.positions === b.positions, '; autre graine différente :', a.radio !== c.radio || a.positions !== c.positions);
    expect(a.decisions.split('\n').length).toBeGreaterThan(5);
    expect(b.decisions).toBe(a.decisions);
    expect(b.radio).toBe(a.radio);
    expect(b.positions).toBe(a.positions);
    expect(c.radio !== a.radio || c.positions !== a.positions).toBe(true);
  }, 600000);
});
