// Médecins de rue — IA des secouristes bénévoles : tri, rinçage, mise à l'abri, soins, signalement des cas graves.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescueModule } from '@/sim/roles/rescue';
import type { CareRecord } from '@/sim/roles/rescue';
import { startRescue, wound } from '@/sim/roles/rescue/testkit';
import { createSystems as medicsModule } from '@/sim/roles/medics';
import type { MedicsRecords } from '@/sim/roles/medics';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidents, rescueModule, medicsModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function freePoint(ctx: GameContext, x: number, z: number): { x: number; z: number } {
  const out = { x, z };
  expect(ctx.world.randomFreePoint(x, z, 4, 'road', () => ctx.rng.next(), out)).toBe(true);
  return out;
}

function careLog(ctx: GameContext): CareRecord[] {
  const log: CareRecord[] = [];
  ctx.events.onAny('care:done', (e) => log.push({ ...(e as CareRecord) }));
  return log;
}

describe('médecins de rue — secouristes bénévoles', () => {
  it('trois personnes gazées : le secouriste les rince par ordre de gravité, avec son sérum', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx } = rig;
    const log = careLog(ctx);
    const c = freePoint(ctx, 0, -230);
    const medic = ctx.archetypes.spawn('street_medic', c.x, c.z + 6, { seed: 9 });
    expect(medic.look.vest).not.toBe(0); // identifiable
    const serum0 = ctx.actions.has(medic, 'serum_physiologique');
    expect(serum0).toBe(20);
    // trois manifestants à la même distance du secouriste, plus ou moins atteints (le plus proche n'est pas le plus atteint)
    const gassed: Person[] = [];
    const levels = [0.55, 0.95, 0.75];
    for (let i = 0; i < 3; i++) {
      const p = ctx.archetypes.spawn('manifestant', c.x + (i - 1) * 2.2, c.z - 0.5 * i, { profile: 'pacifique', seed: 20 + i });
      p.gas = levels[i];
      gassed.push(p);
    }
    const done = rig.run(80, 0.25, () => log.filter((r) => r.verb === 'rincer_yeux').length >= 3);
    expect(done).toBeGreaterThan(15); // trois gestes de 6 s et les déplacements
    const rinses = log.filter((r) => r.verb === 'rincer_yeux');
    console.log('[medics] ordre des rinçages (exposition avant le geste) :', rinses.map((r) => `${gassed.findIndex((g) => g.id === r.targetId)}:${r.gasBefore.toFixed(2)}`).join(' → '),
      `| ${done.toFixed(0)} s | sérum ${serum0} → ${ctx.actions.has(medic, 'serum_physiologique')}`);
    expect(rinses.every((r) => r.byId === medic.id)).toBe(true);
    // le plus atteint d'abord : 0,95, puis 0,75, puis 0,55
    expect(rinses.map((r) => r.targetId)).toEqual([gassed[1].id, gassed[2].id, gassed[0].id]);
    expect(rinses[0].gasBefore).toBeGreaterThan(rinses[1].gasBefore);
    expect(rinses[1].gasBefore).toBeGreaterThan(rinses[2].gasBefore);
    // une dose par personne ; l'exposition retombe plus vite qu'à l'air libre seul
    expect(ctx.actions.has(medic, 'serum_physiologique')).toBe(serum0 - 3);
    for (const g of gassed) expect(g.gas).toBeLessThan(0.25);
    const rec = ctx.require<MedicsRecords>('medics.records');
    expect(rec.npc.rinses).toBe(3);
    expect(rec.npc.medics).toBe(1);
  });

  it('rinçage : la gêne retombe nettement plus vite qu\'à l\'air libre', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx } = rig;
    const c = freePoint(ctx, 0, -230);
    const rinsed = ctx.archetypes.spawn('manifestant', c.x, c.z, { profile: 'pacifique', seed: 31 });
    const alone = ctx.archetypes.spawn('manifestant', c.x + 60, c.z, { profile: 'pacifique', seed: 32 });
    rinsed.gas = 0.9;
    alone.gas = 0.9;
    ctx.archetypes.spawn('street_medic', c.x + 1.2, c.z, { seed: 10 });
    rig.step(20);
    console.log(`[medics] exposition 20 s plus tard : rincée ${rinsed.gas.toFixed(2)}, non rincée ${alone.gas.toFixed(2)}`);
    expect(rinsed.gas).toBeLessThan(alone.gas * 0.5);
  });

  it('blessé grave dans le gaz : mis à l\'abri, soigné, signalé (incident + SAMU), et le secouriste reste auprès de lui', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    const log = careLog(ctx);
    const c = freePoint(ctx, 0, -230);
    const victim = ctx.archetypes.spawn('manifestant', c.x, c.z, { profile: 'pacifique', seed: 41 });
    wound(ctx, victim, 'critical');
    const medic = ctx.archetypes.spawn('street_medic', c.x + 4, c.z + 9, { seed: 11 });
    // un nuage de lacrymogène entretenu sur la victime
    let carried = false;
    let dropAt = { x: 0, z: 0 };
    const tCare = rig.run(120, 0.25, () => {
      if (!carried) ctx.hazards.emitGas(c.x, c.z, 0.25, 4);
      if (victim.heldBy === medic.id) carried = true;
      if (carried && victim.heldBy === 0 && dropAt.x === 0) dropAt = { x: victim.x, z: victim.z };
      return log.some((r) => r.verb === 'soigner' && r.targetId === victim.id);
    });
    expect(tCare).toBeGreaterThan(5);
    expect(carried).toBe(true);
    const moved = Math.hypot(victim.x - c.x, victim.z - c.z);
    console.log(`[medics] blessé grave : porté à ${moved.toFixed(1)} m (gaz sur place ${ctx.hazards.gasAt(c.x, c.z).toFixed(2)}, à l'abri ${ctx.hazards.gasAt(victim.x, victim.z).toFixed(2)}), soigné après ${tCare.toFixed(0)} s`);
    expect(moved).toBeGreaterThan(6);
    expect(ctx.hazards.gasAt(victim.x, victim.z)).toBeLessThan(0.2);
    expect(ctx.world.isFree(victim.x, victim.z, 0.2)).toBe(true);
    const care = log.find((r) => r.verb === 'soigner' && r.targetId === victim.id)!;
    expect(care.byId).toBe(medic.id);
    expect(care.triage).toBe('rouge');
    expect(care.stabilised).toBe(true);
    // le cas dépasse le premier secours : incident vital et appel du SAMU, bilan à la radio
    const tSignal = rig.run(30, 0.25, () => rescue.calls.length > 0);
    expect(tSignal).toBeGreaterThanOrEqual(0);
    expect(victim.posture).toBe('down');
    const inc = api.list.find((i) => i.kind === 'blesse' && i.targetId === victim.id)!;
    expect(inc).toBeDefined();
    expect(inc.urgency).toBe(3);
    expect(rescue.calls.length).toBe(1);
    expect(rescue.calls[0].kind).toBe('samu');
    expect(rescue.calls[0].incidentId).toBe(inc.id);
    expect(ctx.radio.log.some((m) => m.from === 'Secouriste de rue' && /Je demande le SAMU/.test(m.text))).toBe(true);
    expect(ctx.require<MedicsRecords>('medics.records').npc.signalled).toBe(1);
    // il reste auprès de la victime jusqu'à l'arrivée de l'équipe médicale, qui l'évacue
    rig.step(10);
    expect(Math.hypot(medic.x - victim.x, medic.z - victim.z)).toBeLessThan(2.5);
    const tSamu = rig.run(240, 0.5, () => rescue.calls[0].state === 'sur_place');
    if (tSamu < 0) console.log('[medics] SAMU :', rescue.calls[0].state, rescue.calls[0].waitingReason, rig.states(rescue.calls[0]), 'eta', rescue.calls[0].eta);
    expect(tSamu).toBeGreaterThanOrEqual(0);
    const tLoaded = rig.run(180, 0.5, () => victim.vehicleId !== 0);
    expect(tLoaded).toBeGreaterThanOrEqual(0);
    console.log(`[medics] SAMU sur place ${tSamu.toFixed(0)} s après le signalement, victime chargée ${tLoaded.toFixed(0)} s plus tard`);
    // neutre : il ne porte aucune arme
    expect(medic.inventory.every((s) => ['serum_physiologique', 'trousse_secours', 'telephone', 'masque_gaz'].includes(s.id))).toBe(true);
  });

  it('neutralité : un policier blessé est soigné comme les autres', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx } = rig;
    const log = careLog(ctx);
    const c = freePoint(ctx, 0, -230);
    const crs = ctx.archetypes.spawn('crs', c.x, c.z, { poste: 'bouclier', seed: 51 });
    wound(ctx, crs, 'serious');
    const medic = ctx.archetypes.spawn('street_medic', c.x + 3, c.z + 5, { seed: 12 });
    const t = rig.run(60, 0.25, () => log.some((r) => r.verb === 'soigner' && r.targetId === crs.id));
    expect(t).toBeGreaterThan(5);
    expect(log.find((r) => r.targetId === crs.id)!.byId).toBe(medic.id);
    expect(crs.health).toBeGreaterThan(40);
  });
});
