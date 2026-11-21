// Commandement — une manifestation de 15 minutes simulées, de la mise en place à la fin de mission, dans le
// quartier d'essai, avec les modules réels : monde, personnes, matériel, dangers, droit, mobilier, véhicules,
// foule (cortège de 300 personnes), IA de police et commandement. Doublures : registre d'incidents (le cadre
// de mission n'existe pas encore) et registre de fermetures de rues. Un groupe de casseurs est scripté par le
// test (ses actes passent par les API du jeu) : il ne s'en prend qu'aux vitrines, jamais aux forces.
import { beforeAll, describe, expect, it } from 'vitest';
import type { ForceReport, Person, Shop, SommationStage } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import type { PropsExtApi } from '@/sim/props/api';
import type { CommandDecision, CommandState } from '@/sim/police/command/api';
import { createTestServices, startCommand } from '@/sim/police/command/testkit';
import type { CostStats } from '@/sim/police/command/testkit';

const VERBOSE = process.env.CMD_VERBOSE === '1';

const run = {
  state: null as CommandState | null,
  commanderId: 0,
  decisions: [] as CommandDecision[],
  radio: [] as { t: number; from: string; text: string }[],
  sommations: [] as { t: number; stage: SommationStage; x: number; z: number; attack: boolean }[],
  force: [] as { t: number; means: string; kind: string; reason: string; attack: boolean }[],
  authorized: [] as { t: number; level: number }[],
  posts: [] as { name: string; s: number; heldAt: number; headAt: number; state: string; kind: string }[],
  deployedAt: -1,
  departAt: -1,
  fire: { litAt: 0, incidentId: 0, assignedAt: -1, means: '', squad: '', closedAt: -1, resolved: false, outAt: -1, x: 0, z: 0 },
  closures: [] as { t: number; byId: number; squadId: number }[],
  missionEndAt: -1,
  endText: '',
  embarked: 0,
  total: 0,
  cost: { mean: 0, p95: 0, max: 0, steps: 0 } as CostStats,
  wall: 0,
  phases: [] as { t: number; phase: string }[],
  casseurs: { total: 0, broken: 0, fledAt: -1, zone: { x: 0, z: 0 } },
  attackEver: false,
  drone: { observations: 0, seenZone: false },
  endTime: 0,
};

beforeAll(async () => {
  const svc = createTestServices({ incidents: true, traffic: true });
  const t = await startCommand(
    [world, people, items, hazards, law, props, vehicles, crowd],
    { mode: 'test', x: 0, z: 0, crowdSize: 300, duration: 'courte', tension: 0.1, volatility: 0.15, extra: { 'commandement.aptitude': 0.8 } },
    { seed: 11, systems: [svc.system], dt: 0.05 },
  );
  const { ctx } = t;
  const log = (...a: unknown[]): void => {
    if (VERBOSE) console.log(...a);
  };
  // la compagnie est stationnée sur le quai, hors du parcours ; l'équipe du drone à ses côtés
  const cie = t.units.createCompany({ x: 95, z: 289.5, heading: -Math.PI / 2, layout: 'colonne' });
  t.api.createDroneTeam({ x: 118, z: 286, heading: -Math.PI / 2 });
  run.commanderId = cie.leader!.id;
  run.total = cie.people.length;

  ctx.events.onAny('command:decision', (d) => {
    const e = d as CommandDecision;
    run.decisions.push({ ...e });
    log('  [' + e.t.toFixed(0) + '] ' + e.key + ' :: ' + e.text);
  });
  ctx.events.onAny('command:deployed', (d) => { run.deployedAt = (d as { t: number }).t; });
  ctx.events.onAny('command:mission_end', (d) => { run.missionEndAt = (d as { t: number }).t; });
  ctx.events.onAny('command:observation', (d) => {
    const o = d as { x: number; z: number; hostile: number };
    run.drone.observations++;
    if (o.hostile >= 2) run.drone.seenZone = true;
  });
  ctx.events.on('law:sommation', (e) => {
    run.sommations.push({ t: ctx.clock.now, stage: e.stage, x: e.x, z: e.z, attack: ctx.law.roe.underAttack });
    log('  SOMMATION', e.stage, 't=', ctx.clock.now.toFixed(0), e.text.slice(0, 50));
  });
  ctx.events.on('law:force', (e: { report: ForceReport }) => {
    run.force.push({ t: e.report.t, means: e.report.means, kind: e.report.verdict.kind, reason: e.report.verdict.reason, attack: ctx.law.roe.underAttack });
    if (e.report.verdict.kind !== 'licite' || e.report.means !== 'contact') log('  FORCE', e.report.means, e.report.verdict.kind, 't=', e.report.t.toFixed(0), e.report.verdict.kind !== 'licite' ? e.report.verdict.reason : '');
  });
  ctx.events.on('law:authorized', (e) => run.authorized.push({ t: ctx.clock.now, level: e.level }));
  ctx.events.on('crowd:phase', (e) => {
    run.phases.push({ t: ctx.clock.now, phase: e.phase });
    if (e.phase === 'cortege' && run.departAt < 0) run.departAt = ctx.clock.now;
    log('  PHASE', e.phase, 't=', ctx.clock.now.toFixed(0));
  });

  // ── casseurs scriptés : rue du Marché, côté est, à l'écart du parcours ──
  const zone = { x: 76, z: 150 };
  run.casseurs.zone = zone;
  const casseurs: Person[] = [];
  for (let i = 0; i < 12; i++) {
    const p = ctx.people.spawn({ kind: 'manifestant', faction: 'protest', profile: 'radical', x: zone.x - 6 + (i % 4) * 4, z: zone.z - 3.5 + Math.floor(i / 4) * 3.5, heading: Math.PI / 2, seed: 500 + i });
    // pilotés par le script du test : le module de foule ne les prend pas en charge
    p.brain = { tag: 'test.casseur' };
    casseurs.push(p);
  }
  run.casseurs.total = casseurs.length;
  const shops: Shop[] = [];
  ctx.props.shopsNear(zone.x, zone.z, 16, shops);
  log('vitrines près des casseurs:', shops.length, shops.map((s) => Math.round(s.x) + ',' + Math.round(s.z) + ':' + s.window).join(' '));
  let nextAct = 60;
  let actor = 0;
  const fleeing = new Set<number>();
  const script = (): void => {
    const now = ctx.clock.now;
    const roe = ctx.law.roe;
    // actes : une vitrine attaquée toutes les quatre secondes, puis pillage des vitrines brisées
    if (now >= nextAct && fleeing.size < casseurs.length) {
      nextAct = now + 4;
      const p = casseurs[actor++ % casseurs.length];
      if (ctx.people.get(p.id) === p && !fleeing.has(p.id) && p.custody === 'free' && p.posture !== 'down') {
        let shop: Shop | null = null;
        for (const s of shops) if (s.window !== 'broken' && (!shop || Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(shop.x - p.x, shop.z - p.z))) shop = s;
        if (shop) {
          ctx.props.damageShop(shop, 45, 'blunt', p.id);
          if (shop.window === 'broken') run.casseurs.broken++;
        } else if (shops.length > 0) {
          ctx.props.loot(shops[actor % shops.length], p.id);
        }
      }
    }
    // réactions : un tiers part après la dernière sommation ; les autres fuient sous le gaz ou devant la ligne
    for (let i = 0; i < casseurs.length; i++) {
      const p = casseurs[i];
      if (ctx.people.get(p.id) !== p || p.custody !== 'free') continue;
      if (!fleeing.has(p.id)) {
        const leaves = roe.sommation >= 3 && now - roe.sommationAt > 4 && i % 3 === 0;
        const gassed = p.gas > 0.12;
        const pressed = roe.sommation >= 3 && ctx.people.countIn(p.x, p.z, 9, (q) => q.faction === 'police') > 0;
        if (leaves || gassed || pressed) {
          fleeing.add(p.id);
          if (run.casseurs.fledAt < 0 && fleeing.size >= casseurs.length - 1) run.casseurs.fledAt = now;
        }
      }
      if (fleeing.has(p.id)) {
        // fuite vers l'est, par la rue
        p.cmd.moveX = 1;
        p.cmd.moveZ = (150 - p.z) * 0.2;
        p.cmd.gait = 2;
        p.cmd.faceMove = true;
        if (p.x > 158) ctx.people.remove(p.id);
      }
    }
    if (run.casseurs.fledAt < 0 && fleeing.size >= casseurs.length) run.casseurs.fledAt = now;
  };

  const t0 = performance.now();
  const state = t.api.stateOf(cie.squad.id) ?? (t.step(1.5), t.api.stateOf(cie.squad.id)!);
  run.state = state;
  let fireLit = false;
  let binId = 0;
  const postInfo = new Map<string, { name: string; s: number; heldAt: number; headAt: number; state: string; kind: string }>();
  let lastLog = 0;
  for (let k = 0; k < 2400; k++) {
    t.step(0.5);
    script();
    const now = ctx.clock.now;
    if (ctx.law.roe.underAttack) run.attackEver = true;
    // suivi des emplacements : instant où chacun est tenu, instant où la tête du cortège arrive à sa hauteur
    for (const p of state.posts) {
      const key = p.name + '|' + Math.round(p.x) + '|' + Math.round(p.z);
      let info = postInfo.get(key);
      if (!info) {
        info = { name: p.name, s: p.s, heldAt: -1, headAt: -1, state: p.state, kind: p.kind };
        postInfo.set(key, info);
      }
      info.state = p.state;
      if (info.heldAt < 0 && p.state === 'tenu') info.heldAt = now;
      if (info.headAt < 0 && ctx.director.phase !== 'rassemblement' && ctx.director.headProgress >= p.s - 10 && p.s > 100) info.headAt = now;
    }
    // un feu de poubelles à l'ouest du parcours, annoncé par la salle
    if (!fireLit && now >= 100) {
      fireLit = true;
      run.fire.x = -42;
      run.fire.z = 151;
      const bin = ctx.props.spawn('conteneur', run.fire.x, run.fire.z, 0);
      const ext = ctx.service<PropsExtApi>('props.ext');
      if (ext) ext.ignite(bin, 0);
      else ctx.hazards.ignite(run.fire.x, run.fire.z, 1.1, 0.8, 0);
      binId = bin.id;
      const inc = svc.incidents().open('feu_poubelle', run.fire.x, run.fire.z, 'prop', bin.id, 1);
      run.fire.incidentId = inc.id;
      run.fire.litAt = now;
    }
    if (fireLit && run.fire.outAt < 0 && now - run.fire.litAt > 2) {
      const bin = ctx.props.get(binId);
      if (ctx.hazards.fireAt(run.fire.x, run.fire.z) < 0.03 && (!bin || bin.burning < 0.02)) run.fire.outAt = now;
    }
    if (VERBOSE && now - lastLog >= 30) {
      lastLog = now;
      log('t=', Math.round(now), 'cmd', state.phase, state.sommations, 'dir', ctx.director.phase, 'tension', ctx.director.tension.toFixed(2), 'head', Math.round(ctx.director.headProgress),
        'present', ctx.director.stats.present, 'roe', ctx.law.roe.sommation, ctx.law.roe.lawfulForce, ctx.law.roe.authorizedForce, 'spots', t.api.hotspots.map((h) => h.kind + '@' + Math.round(h.x) + ',' + Math.round(h.z) + ':' + h.heat.toFixed(2) + (h.seen ? 's' : 'u')).join(' '),
        'casseurs', casseurs.filter((p) => ctx.people.get(p.id) === p).length, 'fuite', fleeing.size, 'cdt', Math.round(cie.leader!.x) + ',' + Math.round(cie.leader!.z));
      if (state.phase === 'fin') for (const sec of cie.sections) {
        const st = t.status.of(sec.id);
        const fi = t.formation.of(sec.id);
        if (st) log('     section', st.name, st.order, st.phase, st.formation, Math.round(st.x) + ',' + Math.round(st.z), 'valides', st.valid, '/', st.total, 'détachés', st.detached, 'à terre', st.down, 'blessés', st.injured, 'errAll', fi?.slotErrorAll.toFixed(1), 'moving', fi?.moving);
      }
      const rs = t.status.of(state.reserveId);
      const fi = t.formation.of(state.reserveId);
      if (rs) log('     réserve', rs.name, rs.order, rs.phase, rs.formation, Math.round(rs.x) + ',' + Math.round(rs.z), 'valides', rs.valid, 'err', rs.alignError.toFixed(1), 'moving', fi?.moving, 'slotErrAll', fi?.slotErrorAll.toFixed(1), 'f', fi ? Math.round(fi.x) + ',' + Math.round(fi.z) : '');
    }
    if (state.missionEnded && now > 900) break;
    if (state.missionEnded && run.endTime === 0) run.endTime = now;
  }
  run.wall = performance.now() - t0;
  run.endTime = ctx.clock.now;
  run.cost = t.cost();
  run.posts = [...postInfo.values()];
  for (const r of ctx.radio.log) run.radio.push({ t: r.t, from: r.from, text: r.text });
  const end = run.radio.find((r) => r.text.includes('Fin de mission, retour à la base'));
  run.endText = end ? end.text : '';
  const inc = svc.incidents();
  const a = inc.assignments.find((x) => x.id === run.fire.incidentId);
  if (a) {
    run.fire.assignedAt = a.t;
    run.fire.means = a.means;
    run.fire.squad = ctx.squads.get(a.squadId)?.name ?? '';
  }
  const c = inc.closed.find((x) => x.id === run.fire.incidentId);
  if (c) {
    run.fire.closedAt = c.t;
    run.fire.resolved = c.resolved;
  }
  for (const x of svc.traffic().asked) run.closures.push({ t: x.t, byId: x.byId, squadId: x.squadId });
  let aboard = 0;
  for (const p of cie.people) if (p.vehicleId !== 0) aboard++;
  run.embarked = aboard;
  if (VERBOSE) for (const r of run.radio) console.log('   radio', r.t.toFixed(0), r.from, '>', r.text);
}, 900000);

describe('commandement : manifestation de quinze minutes', () => {
  it('place le dispositif initial avant l\'arrivée du cortège', () => {
    console.log('dispositif déclaré en place à t =', run.deployedAt.toFixed(0), 's ; départ du cortège à t =', run.departAt.toFixed(0), 's');
    for (const p of run.posts) console.log('  ', p.kind, p.name, 's =', Math.round(p.s), 'tenu à', p.heldAt.toFixed(0), 'tête à sa hauteur à', p.headAt.toFixed(0), p.state);
    expect(run.deployedAt).toBeGreaterThan(0);
    // les barrages du parcours que le cortège a atteints étaient tenus avant son arrivée
    const reached = run.posts.filter((p) => p.kind === 'barrage' && p.headAt > 0);
    expect(reached.length).toBeGreaterThanOrEqual(2);
    for (const p of reached) {
      expect(p.heldAt).toBeGreaterThan(0);
      expect(p.heldAt).toBeLessThan(p.headAt);
    }
    // le dispositif est déclaré en place avant que la tête n'atteigne le premier débouché du parcours
    const first = Math.min(...reached.map((p) => p.headAt));
    expect(run.deployedAt).toBeLessThan(first);
  });

  it('prononce les sommations avant tout emploi de gaz, hors attaque', () => {
    const stages = run.sommations.map((s) => s.stage + '@' + s.t.toFixed(0)).join(' ');
    const gas = run.force.filter((f) => f.means === 'lacrymo' || f.means === 'gm2l' || f.means === 'canon_eau');
    console.log('sommations :', stages, '| autorisations :', run.authorized.map((a) => a.level + '@' + a.t.toFixed(0)).join(' '), '| premiers gaz :', gas.slice(0, 4).map((g) => g.means + '@' + g.t.toFixed(0)).join(' '), '| attaque contre les forces :', run.attackEver);
    console.log('casseurs : vitrines brisées', run.casseurs.broken, '; dispersés à t =', run.casseurs.fledAt.toFixed(0));
    expect(run.attackEver).toBe(false);
    const s1 = run.sommations.find((s) => s.stage === 1);
    const s2 = run.sommations.find((s) => s.stage === 2);
    const s3 = run.sommations.find((s) => s.stage === 3);
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s3).toBeDefined();
    expect(s1!.t).toBeLessThan(s2!.t);
    expect(s2!.t).toBeLessThan(s3!.t);
    // le commandant était à portée de mégaphone de la zone (60 m)
    expect(Math.hypot(s1!.x - run.casseurs.zone.x, s1!.z - run.casseurs.zone.z)).toBeLessThan(60);
    expect(gas.length).toBeGreaterThan(0);
    expect(gas[0].t).toBeGreaterThan(s3!.t);
    // l'autorisation de niveau 3 par ctx.law.authorize suit la dernière sommation et précède le gaz
    const auth = run.decisions.find((d) => d.key === 'autorisation');
    expect(auth).toBeDefined();
    expect(auth!.t).toBeGreaterThan(s3!.t);
    expect(auth!.t).toBeLessThanOrEqual(gas[0].t);
    expect(run.authorized.some((a) => a.level === 3 && Math.abs(a.t - auth!.t) < 1.5)).toBe(true);
    // le trouble cesse, la halte est ordonnée
    expect(run.casseurs.fledAt).toBeGreaterThan(gas[0].t - 30);
    expect(run.decisions.some((d) => d.key === 'halte')).toBe(true);
  });

  it('n\'emploie jamais la force hors du cadre licite', () => {
    const bad = run.force.filter((f) => f.kind !== 'licite');
    const byMeans = new Map<string, number>();
    for (const f of run.force) byMeans.set(f.means, (byMeans.get(f.means) ?? 0) + 1);
    console.log('emplois de la force :', run.force.length, JSON.stringify([...byMeans]), '| non licites :', bad.length, bad.slice(0, 3).map((b) => b.means + ' ' + b.kind + ' : ' + b.reason).join(' || '));
    expect(run.force.length).toBeGreaterThan(0);
    expect(bad.length).toBe(0);
  });

  it('délègue l\'incident de feu, qui est traité', () => {
    console.log('feu allumé à', run.fire.litAt.toFixed(0), '; confié à', run.fire.squad, '(' + run.fire.means + ') à', run.fire.assignedAt.toFixed(0), '; éteint à', run.fire.outAt.toFixed(0), '; incident clos à', run.fire.closedAt.toFixed(0), 'résolu :', run.fire.resolved);
    expect(run.fire.assignedAt).toBeGreaterThanOrEqual(run.fire.litAt);
    expect(run.fire.means).toBe('unite');
    expect(run.fire.squad).not.toBe('');
    expect(run.fire.outAt).toBeGreaterThan(run.fire.assignedAt);
    expect(run.fire.resolved).toBe(true);
    expect(run.fire.closedAt).toBeGreaterThanOrEqual(run.fire.outAt - 1);
    expect(run.state!.delegated).toBeGreaterThanOrEqual(1);
    expect(run.state!.resolved).toBeGreaterThanOrEqual(1);
  });

  it('demande la fermeture de rues à la circulation', () => {
    console.log('fermetures demandées :', run.closures.length, '| par le commandant :', run.closures.filter((c) => c.byId === run.commanderId).length, '| avec unité :', run.closures.filter((c) => c.squadId !== 0).length, '| premières à t =', run.closures.slice(0, 3).map((c) => c.t.toFixed(0)).join(', '));
    expect(run.closures.length).toBeGreaterThanOrEqual(3);
    expect(run.closures.filter((c) => c.byId === run.commanderId).length).toBeGreaterThanOrEqual(3);
    expect(run.state!.closuresAsked).toBeGreaterThanOrEqual(3);
    // des rues sont fermées en avance du cortège : avant son départ
    expect(run.closures.filter((c) => c.t < run.departAt).length).toBeGreaterThanOrEqual(2);
  });

  it('prononce la fin de mission après le rembarquement', () => {
    console.log('fin de mission à t =', run.missionEndAt.toFixed(0), 's :', run.endText, '| à bord :', run.embarked, '/', run.total, '| phases :', run.phases.map((p) => p.phase + '@' + p.t.toFixed(0)).join(' '));
    expect(run.state!.missionEnded).toBe(true);
    expect(run.endText).toContain('Fin de mission, retour à la base');
    expect(run.missionEndAt).toBeGreaterThan(600);
    expect(run.state!.phase).toBe('termine');
    expect(run.embarked).toBeGreaterThan(run.total * 0.8);
  });

  it('coûte peu par pas', () => {
    console.log('coût du commandement par pas : moyenne', run.cost.mean.toFixed(4), 'ms ; p95', run.cost.p95.toFixed(4), 'ms ; max', run.cost.max.toFixed(2), 'ms ;', run.cost.steps, 'pas ;', Math.round(run.endTime), 's simulées en', Math.round(run.wall), 'ms ; drone :', run.drone.observations, 'observations');
    expect(run.endTime).toBeGreaterThanOrEqual(900);
    expect(run.cost.mean).toBeLessThan(0.5);
  });
});
