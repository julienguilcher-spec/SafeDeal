// Commandement — unités spéciales dans le quartier d'essai, avec les modules réels (monde, personnes, matériel,
// dangers, droit, mobilier, véhicules, IA de police) : BRAV-M (interception puis interpellation), Centaure
// (abri mobile, salve vers la zone désignée, barricade poussée à la lame), engin lanceur d'eau (extinction, jet
// sur la foule dans le cadre légal, réservoir), drone (placement, suivi, observations).
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Shop, Vehicle } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { PropsExtApi } from '@/sim/props/api';
import type { VehiclesExtApi } from '@/sim/vehicles/api';
import type { PoliceOrderDone } from '@/sim/police/api';
import type { Observation, SpecialEvent } from '@/sim/police/command/api';
import { spawnProtesters } from '@/sim/police/testkit';
import { startCommand } from '@/sim/police/command/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles];
/** Délais des sommations ramenés à une seconde : la procédure est celle du droit, seule l'attente est abrégée. */
const FAST_LAW = { 'law.delays': { annonce: 1, sommation: 1, force: 1, armes: 1 } };
const NORTH = Math.PI;

/** Autorité habilitée scriptée (écharpe, mégaphone) : prononce les sommations jusqu'au cadre voulu. */
function legalFrame(t: { ctx: GameContext; step(s: number): void }, x: number, z: number, arms: boolean): Person {
  const { ctx } = t;
  const a = ctx.archetypes.spawn('commissaire', x, z, { faction: 'police', poste: 'autorite_civile', rank: 'commissaire', look: { sash: true } });
  a.brain = { tag: 'test.autorite' };
  if (ctx.actions.has(a, 'megaphone') === 0) ctx.actions.give(a, 'megaphone', 1);
  for (let i = 0; i < 3; i++) {
    ctx.law.sommation(a);
    t.step(1.6);
  }
  if (arms) {
    ctx.law.sommation(a);
    t.step(1.6);
  }
  t.step(1);
  return a;
}

describe('BRAV-M', () => {
  it('intercepte en colonne, met pied à terre ensemble, interpelle sur fait constaté et remonte en selle', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 300, z: 0 }, { seed: 5, dt: 1 / 30 });
    const { ctx } = t;
    const bravm = t.units.createBravm(6, { x: 300, z: -110, heading: 0, mounted: true });
    const group = bravm.squad;
    const motos = bravm.vehicles;
    const operators = bravm.people.filter((p) => p.poste !== 'pilote_moto');
    const pilots = bravm.people.filter((p) => p.poste === 'pilote_moto');
    expect(motos.length).toBe(6);
    expect(operators.every((p) => p.vehicleId !== 0)).toBe(true);
    // trois casseurs dans la rue du Marché, hors de vue des motos
    const zone = { x: 245, z: 150 };
    const casseurs: Person[] = [];
    for (let i = 0; i < 3; i++) {
      const p = ctx.people.spawn({ kind: 'manifestant', faction: 'protest', profile: 'radical', x: zone.x + i * 2.5, z: zone.z - 2 + i * 1.5, heading: 0, seed: 700 + i });
      p.brain = { tag: 'test.casseur' };
      casseurs.push(p);
    }
    const shops: Shop[] = [];
    ctx.props.shopsNear(zone.x, zone.z, 25, shops);
    const stages: { t: number; stage: string; reason: string }[] = [];
    ctx.events.onAny('command:special', (d) => {
      const e = d as SpecialEvent;
      if (e.squadId === group.id) stages.push({ t: ctx.clock.now, stage: e.stage, reason: e.reason });
    });
    const exits: { tick: number; personId: number }[] = [];
    ctx.events.on('vehicle:exited', (e) => exits.push({ tick: ctx.clock.tick, personId: e.personId }));
    const done: (PoliceOrderDone & { t: number })[] = [];
    ctx.events.onAny('police:order_done', (d) => {
      const e = d as PoliceOrderDone;
      if (e.squadId === group.id) done.push({ ...e, t: ctx.clock.now });
    });
    let arrested: Person | null = null;
    ctx.events.on('person:arrested', (e) => { arrested = ctx.people.get(e.id) ?? null; });
    t.step(1);
    expect(t.api.special(group.id)?.kind).toBe('bravm');
    ctx.squads.issue(group.id, { type: 'interpeller', x: zone.x, z: zone.z, maxForce: 2 });

    let minMotoToCrowd = Infinity;
    let maxSpeedNearPeople = 0;
    let rideGapMax = 0;
    let rideGapMin = Infinity;
    let rideSamples = 0;
    let nextAct = 3;
    let k = 0;
    const fleeing = new Set<number>();
    const elapsed = t.run(420, 0.5, () => {
      const now = ctx.clock.now;
      // les casseurs s'en prennent aux vitrines (toutes les trois secondes) tant qu'ils sont libres
      if (now >= nextAct) {
        nextAct = now + 3;
        const p = casseurs[k++ % casseurs.length];
        if (p.custody === 'free' && !fleeing.has(p.id)) {
          const shop = shops.find((s) => s.window !== 'broken');
          if (shop) ctx.props.damageShop(shop, 30, 'blunt', p.id);
          else ctx.law.recordOffense(p, 'degradation', p.x, p.z, 3);
        }
      }
      // dès qu'un des leurs est saisi, les autres prennent la fuite
      if (arrested) for (const p of casseurs) if (p !== arrested && p.custody === 'free') fleeing.add(p.id);
      for (const p of casseurs) if (fleeing.has(p.id) && ctx.people.get(p.id) === p) {
        p.cmd.moveX = -1;
        p.cmd.moveZ = 0;
        p.cmd.gait = 2;
        p.cmd.faceMove = true;
      }
      const st = t.api.special(group.id)!;
      for (const m of motos) {
        // tant que les casseurs sont libres : après l'interpellation, la personne est conduite au point de regroupement, près des machines
        if (!arrested) for (const c of casseurs) minMotoToCrowd = Math.min(minMotoToCrowd, Math.hypot(m.x - c.x, m.z - c.z));
        if (ctx.people.countIn(m.x, m.z, 30, (p) => p.faction !== 'police') > 0) maxSpeedNearPeople = Math.max(maxSpeedNearPeople, Math.abs(m.speed));
      }
      if (st.stage === 'route' && Math.abs(motos[0].speed) > 3) {
        for (let i = 1; i < motos.length; i++) {
          const g = Math.hypot(motos[i].x - motos[i - 1].x, motos[i].z - motos[i - 1].z);
          rideGapMax = Math.max(rideGapMax, g);
          rideGapMin = Math.min(rideGapMin, g);
        }
        rideSamples++;
      }
      return stages.some((x) => x.stage === 'termine');
    });
    const result = done.find((d) => d.type === 'interpeller');
    const dismount = stages.find((s) => s.stage === 'pied_a_terre');
    const opIds = new Set(operators.map((p) => p.id));
    const opExits = exits.filter((e) => opIds.has(e.personId));
    const ticks = new Set(opExits.map((e) => e.tick));
    const standoff = Math.min(...motos.map((m) => Math.hypot(m.x - zone.x, m.z - zone.z)));
    console.log('BRAV-M : étapes', stages.map((s) => s.stage + '@' + s.t.toFixed(0)).join(' '), '| durée', elapsed.toFixed(0), 's | pied à terre :', opExits.length, 'opérateurs en', ticks.size, 'pas |',
      'motos arrêtées à', standoff.toFixed(0), 'm de l\'objectif ; au plus près d\'un casseur :', minMotoToCrowd.toFixed(0), 'm ; vitesse max près de piétons', (maxSpeedNearPeople * 3.6).toFixed(0), 'km/h |',
      'colonne : intervalles', rideGapMin.toFixed(1), 'à', rideGapMax.toFixed(1), 'm sur', rideSamples, 'relevés | interpellé :', arrested ? (arrested as Person).custody : 'aucun', '| résultat', JSON.stringify(result));
    expect(dismount).toBeDefined();
    // pied à terre simultané : tous les opérateurs dans le même pas, les pilotes restent aux machines
    expect(opExits.length).toBe(6);
    expect(ticks.size).toBe(1);
    expect(pilots.every((p) => p.vehicleId !== 0)).toBe(true);
    // retenue : arrêt à distance, jamais de moto dans le groupe, allure réduite près des piétons
    expect(standoff).toBeGreaterThan(35);
    expect(minMotoToCrowd).toBeGreaterThan(25);
    expect(maxSpeedNearPeople).toBeLessThan(7);
    // colonne : en file, intervalles réguliers
    expect(rideSamples).toBeGreaterThan(5);
    expect(rideGapMax).toBeLessThan(18);
    // interpellation sur fait constaté, menée jusqu'à la remise
    expect(arrested).not.toBeNull();
    expect(result).toBeDefined();
    expect(result!.ok).toBe(true);
    expect(['handed_over', 'in_vehicle']).toContain((arrested as unknown as Person).custody);
    // remontée en selle
    expect(operators.filter((p) => p.vehicleId !== 0).length).toBeGreaterThanOrEqual(5);
    expect(stages.some((s) => s.stage === 'en_selle')).toBe(true);
    expect(ctx.law.forceLog.every((f) => f.verdict.kind === 'licite')).toBe(true);
  }, 300000);

  it('ne procède à aucune interpellation sans fait constaté', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 300, z: 0 }, { seed: 6, dt: 1 / 30 });
    const { ctx } = t;
    const bravm = t.units.createBravm(4, { x: 300, z: 60, heading: 0, mounted: true });
    const calm = spawnProtesters(ctx, 4, 250, 150, 0, 'pacifique', 1.5, 2);
    for (const p of calm) p.brain = { tag: 'test.passif' };
    const done: PoliceOrderDone[] = [];
    ctx.events.onAny('police:order_done', (d) => {
      const e = d as PoliceOrderDone;
      if (e.squadId === bravm.squad.id) done.push({ ...e });
    });
    t.step(1);
    ctx.squads.issue(bravm.squad.id, { type: 'interpeller', x: 250, z: 150, maxForce: 2 });
    t.run(260, 1, () => done.some((d) => d.type === 'interpeller'));
    const result = done.find((d) => d.type === 'interpeller');
    console.log('BRAV-M sans fait constaté :', JSON.stringify(result), '| journal de la force :', ctx.law.forceLog.length);
    expect(result).toBeDefined();
    expect(result!.ok).toBe(false);
    expect(calm.every((p) => p.custody === 'free')).toBe(true);
    expect(ctx.law.forceLog.filter((f) => f.verdict.kind !== 'licite').length).toBe(0);
    expect(bravm.people.filter((p) => p.poste !== 'pilote_moto' && p.vehicleId !== 0).length).toBeGreaterThanOrEqual(3);
  }, 300000);
});

describe('Centaure', () => {
  it('avance avec les gendarmes à pied derrière lui', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200 }, { seed: 8, dt: 1 / 30 });
    const { ctx } = t;
    const crew = t.units.createEquipage('centaure', { x: 0, z: 262, heading: NORTH });
    const peloton = t.units.createPeloton({ x: 0, z: 280, heading: NORTH, layout: 'colonne' });
    const v = crew.vehicles[0];
    t.api.escort(crew.squad.id, peloton.squad.id);
    t.step(1);
    const z0 = v.z;
    ctx.squads.issue(crew.squad.id, { type: 'avancer', x: 0, z: 190, heading: NORTH });
    let maxSpeed = 0;
    let done = false;
    ctx.events.onAny('police:order_done', (d) => {
      const e = d as PoliceOrderDone;
      if (e.squadId === crew.squad.id && e.type === 'avancer') done = e.ok;
    });
    t.run(150, 0.5, () => {
      maxSpeed = Math.max(maxSpeed, Math.abs(v.speed));
      return done;
    });
    t.step(12);
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const foot = peloton.people.filter((p) => p.vehicleId === 0 && p.poste !== 'conducteur');
    let behind = 0;
    let maxLat = 0;
    let far = 0;
    for (const p of foot) {
      const along = (p.x - v.x) * fx + (p.z - v.z) * fz;
      const lat = Math.abs((p.x - v.x) * -fz + (p.z - v.z) * fx);
      if (along < -v.def.length * 0.5 + 0.5) behind++;
      maxLat = Math.max(maxLat, lat);
      far = Math.max(far, -along);
    }
    console.log('Centaure : avancé de', (z0 - v.z).toFixed(1), 'm ; vitesse max', (maxSpeed * 3.6).toFixed(1), 'km/h ; gendarmes derrière la caisse :', behind, '/', foot.length, '; écart latéral max', maxLat.toFixed(1), 'm ; queue de colonne à', far.toFixed(1), 'm');
    expect(done).toBe(true);
    expect(z0 - v.z).toBeGreaterThan(55);
    // allure des piétons : 6 km/h, jamais plus de 8
    expect(maxSpeed * 3.6).toBeLessThan(8.5);
    expect(behind).toBe(foot.length);
    expect(maxLat).toBeLessThan(3.5);
    expect(far).toBeLessThan(v.def.length * 0.5 + 22);
  }, 300000);

  it('refuse la salve hors cadre légal, puis la tire vers la zone désignée après réitération', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 150, extra: FAST_LAW }, { seed: 9, dt: 1 / 30 });
    const { ctx } = t;
    const crew = t.units.createEquipage('centaure', { x: 0, z: 200, heading: NORTH });
    const v = crew.vehicles[0];
    const zone = { x: 0, z: 70 };
    const crowd = spawnProtesters(ctx, 24, zone.x, zone.z, 0, 'radical', 1.3, 6);
    for (const p of crowd) p.brain = { tag: 'test.foule' };
    const refused: string[] = [];
    ctx.events.onAny('police:order_refused', (d) => refused.push((d as { reason: string }).reason));
    let fired = 0;
    ctx.events.on('vehicle:turret_fired', (e) => { if (e.id === v.id) fired++; });
    const landings: { x: number; z: number }[] = [];
    let grenades = 0;
    ctx.events.on('projectile:spawned', (e) => { if (e.kind === 'grenade_lacrymo_56') grenades++; });
    ctx.events.on('explosion', (e) => { if (e.kind === 'grenade_lacrymo_56') landings.push({ x: e.x, z: e.z }); });
    t.step(1);
    // 1. sans sommations : refus motivé, aucun tir
    ctx.squads.issue(crew.squad.id, { type: 'disperser_gaz', x: zone.x, z: zone.z, maxForce: 4 });
    t.step(6);
    expect(refused.length).toBe(1);
    expect(fired).toBe(0);
    expect(grenades).toBe(0);
    // 2. sommations et réitération par l'autorité : la salve part
    legalFrame(t, 0, 105, true);
    expect(ctx.law.roe.lawfulForce).toBe(4);
    let done: PoliceOrderDone | null = null;
    ctx.events.onAny('police:order_done', (d) => {
      const e = d as PoliceOrderDone;
      if (e.squadId === crew.squad.id && e.type === 'disperser_gaz' && e.ok) done = { ...e };
    });
    ctx.squads.issue(crew.squad.id, { type: 'disperser_gaz', x: zone.x, z: zone.z, width: 6, maxForce: 4 });
    t.run(40, 0.5, () => done !== null);
    t.step(8);
    let mx = 0;
    let mz = 0;
    for (const l of landings) {
      mx += l.x;
      mz += l.z;
    }
    if (landings.length > 0) {
      mx /= landings.length;
      mz /= landings.length;
    }
    const miss = Math.hypot(mx - zone.x, mz - zone.z);
    const gasAtZone = ctx.hazards.gasAt(zone.x, zone.z);
    const reports = ctx.law.forceLog.filter((f) => f.means === 'lacrymo');
    console.log('Centaure : refus «', refused[0], '» | salve :', grenades, 'grenades, ouvertures en l\'air relevées :', landings.length, ', centre à', miss.toFixed(1), 'm de la zone (130 m de l\'engin) ; gaz sur la zone', gasAtZone.toFixed(2), '| journal :', reports.length, reports.map((r) => r.verdict.kind).join(','));
    expect(done).not.toBeNull();
    expect(fired).toBeGreaterThanOrEqual(1);
    expect(grenades).toBe(6);
    expect(landings.length).toBeGreaterThanOrEqual(4);
    expect(miss).toBeLessThan(15);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.verdict.kind === 'licite')).toBe(true);
    expect(gasAtZone).toBeGreaterThan(0.05);
  }, 300000);

  it('vérifie l\'obstacle puis pousse la barricade à la lame', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200 }, { seed: 10, dt: 1 / 30 });
    const { ctx } = t;
    const crew = t.units.createEquipage('centaure', { x: 0, z: 240, heading: NORTH });
    const v = crew.vehicles[0];
    const barricade = ctx.props.spawn('barricade', 0, 200, 0);
    expect(barricade.blocksMove).toBe(true);
    // quelqu'un se tient derrière l'obstacle : il doit avoir le temps de s'écarter
    const bystander = ctx.people.spawn({ kind: 'manifestant', faction: 'protest', profile: 'pacifique', x: 0.5, z: 196.5, heading: 0, seed: 801 });
    bystander.brain = { tag: 'test.passant' };
    const stages: { t: number; stage: string }[] = [];
    const radio: string[] = [];
    ctx.events.on('radio:message', (e) => radio.push(e.msg.from + ' > ' + e.msg.text));
    let done: PoliceOrderDone | null = null;
    ctx.events.onAny('police:order_done', (d) => {
      const e = d as PoliceOrderDone;
      if (e.squadId === crew.squad.id && e.type === 'degager_barricade') done = { ...e };
    });
    t.step(1);
    ctx.squads.issue(crew.squad.id, { type: 'degager_barricade', targetId: barricade.id, x: 0, z: 200 });
    let warnedAt = -1;
    let pushedWhilePresent = false;
    let last = '';
    t.run(120, 0.25, () => {
      const st = t.api.special(crew.squad.id)!;
      if (st.stage !== last) {
        last = st.stage;
        stages.push({ t: ctx.clock.now, stage: st.stage });
      }
      if (warnedAt < 0 && radio.some((r) => r.includes('Écartez-vous'))) warnedAt = ctx.clock.now;
      // le passant s'écarte quelques secondes après l'annonce
      if (warnedAt >= 0 && ctx.clock.now - warnedAt > 3 && bystander.x < 9) {
        bystander.cmd.moveX = 1;
        bystander.cmd.moveZ = 0;
        bystander.cmd.gait = 1;
      } else {
        bystander.cmd.moveX = 0;
      }
      if (st.stage === 'poussee' && Math.abs(bystander.x) < 3 && bystander.z > 188 && bystander.z < 203) pushedWhilePresent = true;
      return done !== null;
    });
    console.log('Centaure, barricade : étapes', stages.map((s) => s.stage + '@' + s.t.toFixed(1)).join(' '), '| annonce à', warnedAt.toFixed(1), '| barricade : bloque', barricade.blocksMove, ', déplacée de', Math.hypot(barricade.x, barricade.z - 200).toFixed(1), 'm | résultat', JSON.stringify(done), '| passant intact :', bystander.health);
    expect(done).not.toBeNull();
    expect(done!.ok).toBe(true);
    expect(stages.some((s) => s.stage === 'verification')).toBe(true);
    expect(warnedAt).toBeGreaterThan(0);
    expect(pushedWhilePresent).toBe(false);
    expect(!barricade.blocksMove || Math.hypot(barricade.x, barricade.z - 200) > 3 || ctx.props.get(barricade.id) === undefined).toBe(true);
    expect(bystander.health).toBeGreaterThan(95);
    expect(v.z).toBeLessThan(222);
  }, 300000);
});

describe('engin lanceur d\'eau', () => {
  it('se place derrière la ligne, éteint le feu désigné et gère son réservoir', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200 }, { seed: 12, dt: 1 / 30 });
    const { ctx } = t;
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    const crew = t.units.createEquipage('canon_eau', { x: 0, z: 262, heading: NORTH });
    const v: Vehicle = crew.vehicles[0];
    const section = t.units.createSection({ x: 0, z: 222, heading: NORTH, layout: 'ligne' });
    ctx.squads.issue(section.squad.id, { type: 'ligne', x: 0, z: 215, heading: NORTH });
    t.step(20);
    const line = t.formation.of(section.squad.id)!;
    const dones: PoliceOrderDone[] = [];
    ctx.events.onAny('police:order_done', (d) => {
      const e = d as PoliceOrderDone;
      if (e.squadId === crew.squad.id) dones.push({ ...e });
    });
    // 1. mise en place derrière la ligne
    ctx.squads.issue(crew.squad.id, { type: 'proteger', targetId: section.leader!.id });
    t.run(120, 0.5, () => dones.some((d) => d.type === 'proteger'));
    const back = (line.x - v.x) * Math.sin(line.heading) + (line.z - v.z) * Math.cos(line.heading);
    const side = Math.abs((v.x - line.x) * -Math.cos(line.heading) + (v.z - line.z) * Math.sin(line.heading));
    console.log('canon à eau : en place', back.toFixed(1), 'm derrière la ligne, décalage latéral', side.toFixed(1), 'm, cap', ((v.heading * 180) / Math.PI).toFixed(0), '°');
    expect(dones.some((d) => d.type === 'proteger' && d.ok)).toBe(true);
    expect(back).toBeGreaterThan(8);
    expect(back).toBeLessThan(17);
    expect(side).toBeLessThan(2.5);
    // 2. extinction d'un conteneur en feu devant la ligne : le jet passe par-dessus les boucliers
    const bin = ctx.props.spawn('conteneur', 1.5, 205.5, 0);
    ctx.require<PropsExtApi>('props.ext').ignite(bin, 0);
    t.step(8);
    expect(bin.burning).toBeGreaterThan(0.1);
    const water0 = v.turretAmmo[0];
    let fired = 0;
    ctx.events.on('vehicle:turret_fired', (e) => { if (e.id === v.id) fired++; });
    ctx.squads.issue(crew.squad.id, { type: 'eteindre', targetId: bin.id, x: bin.x, z: bin.z });
    const tDouse = t.run(120, 0.5, () => dones.some((d) => d.type === 'eteindre'));
    const used = water0 - v.turretAmmo[0];
    console.log('canon à eau : feu éteint en', tDouse.toFixed(0), 's ; distance au feu', Math.hypot(v.x - bin.x, v.z - bin.z).toFixed(0), 'm ; eau consommée', Math.round(used), 'l ; brûle encore :', bin.burning.toFixed(2), '; journal de la force :', ctx.law.forceLog.length);
    expect(dones.some((d) => d.type === 'eteindre' && d.ok)).toBe(true);
    expect(bin.burning).toBeLessThan(0.05);
    expect(ctx.hazards.fireAt(bin.x, bin.z)).toBeLessThan(0.05);
    expect(fired).toBeGreaterThan(0);
    expect(used).toBeGreaterThan(20);
    // l'extinction n'est pas un emploi de la force, et personne n'a été arrosé dans la ligne
    expect(ctx.law.forceLog.length).toBe(0);
    expect(section.people.filter((p) => p.wet > 0.3).length).toBe(0);
    // 3. cuve basse : repli d'initiative, plein, retour
    v.turretAmmo[0] = 500;
    v.turretAmmo[1] = 500;
    const stages: string[] = [];
    let last = '';
    t.run(260, 0.5, () => {
      const st = t.api.special(crew.squad.id)!;
      if (st.stage !== last) {
        last = st.stage;
        stages.push(st.stage + '@' + ctx.clock.now.toFixed(0));
      }
      return v.turretAmmo[0] > 9000 && st.stage === 'repos';
    });
    console.log('canon à eau, réservoir :', stages.join(' '), '| cuve', Math.round(v.turretAmmo[0]), 'l |', ext.turretStatus(v, 0).service);
    expect(stages.some((s) => s.startsWith('plein'))).toBe(true);
    expect(v.turretAmmo[0]).toBeGreaterThan(9000);
  }, 300000);

  it('cuve basse : se replie jusqu\'à la bouche d\'incendie, fait le plein et rend compte', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200 }, { seed: 15, dt: 1 / 30 });
    const { ctx } = t;
    const crew = t.units.createEquipage('canon_eau', { x: 0, z: 262, heading: NORTH });
    const v = crew.vehicles[0];
    const hydrant = ctx.props.spawn('bouche_incendie', 5.5, 172, 0);
    t.step(2);
    v.turretAmmo[0] = 700;
    v.turretAmmo[1] = 700;
    const radio: string[] = [];
    ctx.events.on('radio:message', (e) => { if (e.msg.from === crew.squad.name) radio.push(e.msg.text); });
    const stages: string[] = [];
    let last = '';
    t.run(260, 0.5, () => {
      const st = t.api.special(crew.squad.id)!;
      if (st.stage !== last) {
        last = st.stage;
        stages.push(st.stage + '@' + ctx.clock.now.toFixed(0));
      }
      return v.turretAmmo[0] > 9900 && st.stage === 'repos';
    });
    const d = Math.hypot(v.x - hydrant.x, v.z - hydrant.z);
    console.log('canon à eau, ravitaillement :', stages.join(' '), '| à', d.toFixed(0), 'm de la bouche d\'incendie | cuve', Math.round(v.turretAmmo[0]), 'l |', radio.join(' / '));
    expect(stages.some((s) => s.startsWith('repli_eau'))).toBe(true);
    expect(stages.some((s) => s.startsWith('plein'))).toBe(true);
    expect(d).toBeLessThan(46);
    expect(v.turretAmmo[0]).toBeGreaterThan(9900);
    expect(radio.some((r) => r.includes('je me replie pour ravitailler'))).toBe(true);
    expect(radio.some((r) => r.includes('Plein fait'))).toBe(true);
  }, 300000);

  it('refuse le jet sur la foule hors cadre, puis repousse le groupe après les sommations', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200, extra: FAST_LAW }, { seed: 13, dt: 1 / 30 });
    const { ctx } = t;
    const crew = t.units.createEquipage('canon_eau', { x: 0, z: 250, heading: NORTH });
    const v = crew.vehicles[0];
    const zone = { x: 0, z: 212 };
    const crowd = spawnProtesters(ctx, 18, zone.x, zone.z, 0, 'radical', 1.2, 6);
    for (const p of crowd) p.brain = { tag: 'test.foule' };
    const refused: string[] = [];
    ctx.events.onAny('police:order_refused', (d) => refused.push((d as { reason: string }).reason));
    let fired = 0;
    ctx.events.on('vehicle:turret_fired', (e) => { if (e.id === v.id) fired++; });
    const dones: PoliceOrderDone[] = [];
    ctx.events.onAny('police:order_done', (d) => {
      const e = d as PoliceOrderDone;
      if (e.squadId === crew.squad.id && e.type === 'refoulement') dones.push({ ...e });
    });
    t.step(1);
    ctx.squads.issue(crew.squad.id, { type: 'refoulement', x: zone.x, z: zone.z, maxForce: 3 });
    t.step(5);
    expect(refused.length).toBe(1);
    expect(fired).toBe(0);
    expect(crowd.every((p) => p.wet === 0)).toBe(true);
    dones.length = 0;
    legalFrame(t, 9, 236, false);
    expect(ctx.law.roe.lawfulForce).toBeGreaterThanOrEqual(3);
    const meanZ0 = crowd.reduce((s, p) => s + p.z, 0) / crowd.length;
    const modes: string[] = [];
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    let minStraight = Infinity;
    ctx.squads.issue(crew.squad.id, { type: 'refoulement', x: zone.x, z: zone.z, maxForce: 3 });
    // les personnes arrosées reculent (script) : trempées ou bousculées, elles s'éloignent vers le nord
    t.run(110, 0.25, () => {
      const ts = ext.turretStatus(v, 0);
      if (ts.firing) {
        if (modes[modes.length - 1] !== ts.mode) modes.push(ts.mode);
        if (ts.mode === 'droit') minStraight = Math.min(minStraight, Math.hypot(ts.targetX - v.x, ts.targetZ - v.z));
      }
      for (const p of crowd) {
        if (p.wet > 0.15 && p.posture !== 'down') {
          p.cmd.moveX = 0;
          p.cmd.moveZ = -1;
          p.cmd.gait = 1;
          p.cmd.faceMove = true;
        }
      }
      return dones.length > 0;
    });
    const meanZ1 = crowd.reduce((s, p) => s + p.z, 0) / crowd.length;
    const wet = crowd.filter((p) => p.wet > 0.05).length;
    const reports = ctx.law.forceLog.filter((f) => f.means === 'canon_eau');
    const bad = ctx.law.forceLog.filter((f) => f.verdict.kind !== 'licite');
    console.log('canon à eau, foule : refus «', refused[0], '» | modes de jet', modes.join(' → '), '| trempés', wet, '/', crowd.length, '| recul moyen', (meanZ0 - meanZ1).toFixed(1), 'm | jet droit au plus près à', minStraight === Infinity ? 'jamais' : minStraight.toFixed(0) + ' m',
      '| journal :', reports.length, 'emplois, non licites :', bad.length, bad.slice(0, 2).map((b) => b.verdict.reason).join(' || '), '| résultat', JSON.stringify(dones[0]));
    expect(dones.length).toBe(1);
    expect(fired).toBeGreaterThan(0);
    expect(modes[0]).toBe('pluie');
    expect(wet).toBeGreaterThan(crowd.length * 0.5);
    expect(meanZ0 - meanZ1).toBeGreaterThan(8);
    expect(minStraight).toBeGreaterThanOrEqual(15);
    expect(bad.length).toBe(0);
  }, 300000);
});

describe('drone', () => {
  it('se place au-dessus du point désigné, suit un groupe, et ses observations alimentent le commandement', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200 }, { seed: 14, dt: 1 / 30 });
    const { ctx } = t;
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    const team = t.api.createDroneTeam({ x: 60, z: 290, heading: -Math.PI / 2 });
    const pilot = team.leader!;
    t.step(4);
    const drone = ext.droneOf(pilot.id);
    expect(drone).not.toBeNull();
    expect(t.api.special(team.squad.id)?.kind).toBe('drone');
    // 1. placement au-dessus d'un point
    ctx.squads.issue(team.squad.id, { type: 'avancer', x: 0, z: 150 });
    t.step(45);
    const d1 = Math.hypot(drone!.x - 0, drone!.z - 150);
    const alt = ext.flightStatus(drone!)!.altitude;
    console.log('drone : à', d1.toFixed(0), 'm du point (orbite de', t.api.tuning.droneOrbit, 'm), hauteur', alt.toFixed(0), 'm');
    expect(d1).toBeLessThan(t.api.tuning.droneOrbit + 12);
    expect(alt).toBeGreaterThan(40);
    // 2. suivi d'un groupe désigné qui marche, loin de toute unité à pied
    const groupe = spawnProtesters(ctx, 8, 0, 150, Math.PI / 2, 'radical', 1.2, 4);
    for (const p of groupe) p.brain = { tag: 'test.groupe' };
    const observations: Observation[] = [];
    ctx.events.onAny('command:observation', (d) => observations.push({ ...(d as Observation) }));
    ctx.squads.issue(team.squad.id, { type: 'suivre', targetId: groupe[0].id });
    let worst = 0;
    t.run(70, 0.5, (elapsed) => {
      for (const p of groupe) {
        p.cmd.moveX = 1;
        p.cmd.moveZ = 0;
        p.cmd.gait = 0;
        p.cmd.faceMove = true;
      }
      if (elapsed > 25) worst = Math.max(worst, Math.hypot(drone!.x - groupe[0].x, drone!.z - groupe[0].z));
    });
    const moved = groupe[0].x;
    console.log('drone : groupe déplacé de', moved.toFixed(0), 'm ; écart horizontal max du drone', worst.toFixed(0), 'm ;', observations.length, 'observations, dernier volume', observations[observations.length - 1]?.count);
    expect(moved).toBeGreaterThan(60);
    expect(worst).toBeLessThan(t.api.tuning.droneOrbit + 25);
    expect(observations.length).toBeGreaterThan(10);
    expect(observations[observations.length - 1].count).toBeGreaterThanOrEqual(8);
    // 3. un fait commis sous le drone, loin de toute unité, est connu du commandement
    for (const p of groupe) {
      p.cmd.moveX = 0;
      p.cmd.gait = 0;
    }
    t.step(6);
    const before = t.api.hotspots.length;
    for (let i = 0; i < 4; i++) ctx.law.recordOffense(groupe[i], 'degradation', groupe[i].x, groupe[i].z, 3);
    const shops: Shop[] = [];
    ctx.props.shopsNear(groupe[0].x, groupe[0].z, 30, shops);
    if (shops.length > 0) ctx.props.damageShop(shops[0], 200, 'blunt', groupe[0].id);
    t.step(8);
    const spots = t.api.hotspots.filter((h) => h.seen);
    const hostile = observations.filter((o) => o.hostile >= 2).length;
    console.log('drone : points chauds', before, '→', t.api.hotspots.length, ', vus :', spots.length, '; observations avec auteurs de faits :', hostile, '; filmé :', groupe[0].offenses.some((o) => o.filmed));
    expect(spots.length).toBeGreaterThan(0);
    expect(hostile).toBeGreaterThan(0);
    // 4. rappel
    ctx.squads.issue(team.squad.id, { type: 'repli' });
    t.step(60);
    expect(ext.droneOf(pilot.id)).toBeNull();
  }, 300000);
});
