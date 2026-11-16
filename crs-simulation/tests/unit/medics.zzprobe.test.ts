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

describe('sonde', () => {
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
    const apy = ctx.require<{ status(v: unknown): { state: string; reason: string; remaining: number; blockedFor: number } }>('vehicles.autopilot');
    for (let i = 0; i < 30; i++) {
      rig.step(8);
      const call = rescue.calls[0];
      const v = ctx.vehicles.get(call.vehicleId);
      const crew = (rig.ext.crews[0] as any);
      console.log('T', ctx.clock.now.toFixed(0), call.state, '[' + call.waitingReason + ']', v ? `amb (${v.x.toFixed(1)},${v.z.toFixed(1)}) cap ${v.heading.toFixed(2)} v=${v.speed.toFixed(1)} ap=${apy.status(v).state}/${apy.status(v).reason}/${apy.status(v).blockedFor.toFixed(0)} d=${Math.hypot(v.x - call.x, v.z - call.z).toFixed(0)}` : 'sans véhicule',
        crew ? crew.members.map((r: any) => `(${r.p.x.toFixed(1)},${r.p.z.toFixed(1)}) veh=${r.p.vehicleId ? 1 : 0}`).join(' ') + ` phase=${crew.phase} leg=${crew.leg} walking=${crew.walking} onFoot=${crew.onFoot} unstuck=${crew.unstuck}` : '');
      if (i === 6 && v) console.log('OBJETS', ctx.props.list.filter((q) => Math.hypot(q.x - v.x, q.z - v.z) < 12).map((q) => `${q.kind}#${q.id} (${q.x.toFixed(1)},${q.z.toFixed(1)}) mov=${q.movable} d=${Math.hypot(q.x - v.x, q.z - v.z).toFixed(1)}`).join(' ; '), '| appel', call.x.toFixed(1), call.z.toFixed(1));
    }
    const tSamu = rig.run(1, 0.5, () => rescue.calls[0].state === 'sur_place');
    if (tSamu < 0) console.log('[medics] SAMU :', rescue.calls[0].state, rescue.calls[0].waitingReason, rig.states(rescue.calls[0]), 'eta', rescue.calls[0].eta);
    expect(tSamu).toBeGreaterThanOrEqual(0);
    const amb = ctx.vehicles.get(rescue.calls[0].vehicleId)!;
    const apx = ctx.require<{ status(v: unknown): { state: string; reason: string; remaining: number; blockedFor: number } }>('vehicles.autopilot');
    console.log('ETATS', rig.states(rescue.calls[0]).join('>'), 'tSamu', tSamu, 'amb', amb.x.toFixed(1), amb.z.toFixed(1), 'victime', victim.x.toFixed(1), victim.z.toFixed(1), 'medic', medic.x.toFixed(1), medic.z.toFixed(1));
    for (let i = 0; i < 18; i++) {
      rig.step(10);
      const crew = (rig.ext.crews[0] as any);
      console.log(ctx.clock.now.toFixed(0), rescue.calls[0].state, 'victime', victim.x.toFixed(1), victim.z.toFixed(1), 'held', victim.heldBy, 'veh', victim.vehicleId, victim.health.toFixed(0), 'amb', amb.x.toFixed(1), amb.z.toFixed(1), apx.status(amb).state, apx.status(amb).reason,
        crew ? crew.members.map((r: any) => `r${r.role} t${r.task} s${r.stage} (${r.p.x.toFixed(1)},${r.p.z.toFixed(1)}) veh=${r.p.vehicleId} int=${ctx.interactions.current(r.p)?.opt.verb ?? '-'} carry=${r.p.carrying}`).join(' ; ') + ` phase=${crew.phase} walking=${crew.walking}` : '');
    }
    const tLoaded = rig.run(1, 0.5, () => victim.vehicleId !== 0);
    expect(tLoaded).toBeGreaterThanOrEqual(0);
    console.log(`[medics] SAMU sur place ${tSamu.toFixed(0)} s après le signalement, victime chargée ${tLoaded.toFixed(0)} s plus tard`);
    // neutre : il ne porte aucune arme
    expect(medic.inventory.every((s) => ['serum_physiologique', 'trousse_secours', 'telephone', 'masque_gaz'].includes(s.id))).toBe(true);
  });

});
