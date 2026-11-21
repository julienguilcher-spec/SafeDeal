// Secours — SAMU : tri, soins, évacuation en ambulance ; gestes « soigner » et « rincer_yeux ».
import { describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as incidents } from '@/gameplay/incidents';
import type { IncidentsRecords } from '@/gameplay/incidents';
import { createSystems as rescueModule } from '@/sim/roles/rescue';
import { startRescue, wound } from '@/sim/roles/rescue/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles, incidents, rescueModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function sidewalkPoint(ctx: GameContext, x: number, z: number): { x: number; z: number } {
  const out = { x, z };
  expect(ctx.world.randomFreePoint(x, z, 6, 'road', () => ctx.rng.next(), out)).toBe(true);
  return out;
}

describe('secours — SAMU', () => {
  it('blessé grave : incident vital, SAMU appelé, victime soignée sur place puis évacuée en ambulance', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    const records = ctx.require<IncidentsRecords>('incidents.records');
    const at = sidewalkPoint(ctx, 0, -235);
    const victim = ctx.archetypes.spawn('manifestant', at.x, at.z, { profile: 'pacifique', seed: 3 });
    wound(ctx, victim, 'critical');
    rig.step(1);
    expect(victim.posture).toBe('down');
    expect(victim.injury).toBe('critical');
    const inc = api.list.find((i) => i.kind === 'blesse')!;
    expect(inc).toBeDefined();
    expect(inc.urgency).toBe(3);
    expect(inc.targetId).toBe(victim.id);
    expect(inc.label.startsWith('Blessé grave')).toBe(true);
    // sans soins, elle s'affaiblit : la gravité monte
    const s0 = inc.severity;
    const h0 = victim.health;
    rig.step(20);
    expect(victim.health).toBeLessThan(h0);
    expect(inc.severity).toBeGreaterThan(s0);

    expect(api.assign(inc.id, 'samu')).toBe(true);
    const call = rescue.calls[0];
    expect(call.kind).toBe('samu');
    const tScene = rig.run(240, 0.5, () => call.state === 'sur_place');
    expect(tScene).toBeGreaterThan(5);
    const amb = ctx.vehicles.get(call.vehicleId)!;
    expect(amb.kind).toBe('ambulance');
    expect(Math.hypot(amb.x - victim.x, amb.z - victim.z)).toBeLessThan(30);
    rig.step(0.6);
    expect(inc.state).toBe('en_cours');

    // bilan et gestes : la victime est stabilisée (elle ne s'aggrave plus) mais reste à terre
    const tCare = rig.run(90, 0.25, () => (rig.care.state(victim.id)?.treatedAt ?? -1) >= 0);
    expect(tCare).toBeGreaterThan(10); // approche + bilan 5 s + gestes
    const st = rig.care.state(victim.id)!;
    expect(st.triage).toBe('rouge');
    const treatedBy = ctx.people.get(st.treatedBy)!;
    expect(treatedBy.kind).toBe('samu');
    expect(victim.posture).toBe('down');
    expect(victim.injury).toBe('critical');
    const hCare = victim.health;
    rig.step(2);
    expect(victim.health).toBeGreaterThanOrEqual(hCare - 1e-6);

    // portée jusqu'aux portes arrière, chargée, emmenée
    const tLoad = rig.run(120, 0.25, () => victim.vehicleId === amb.id);
    expect(tLoad).toBeGreaterThanOrEqual(0);
    expect(st.loaded).toBe(true);
    const tLeft = rig.run(90, 0.5, () => call.state === 'reparti');
    expect(tLeft).toBeGreaterThanOrEqual(0);
    let evacuated = 0;
    ctx.events.onAny('rescue:evacuated', (e) => {
      if ((e as { personId: number }).personId === victim.id) evacuated++;
    });
    const tGone = rig.run(300, 1, () => ctx.people.get(victim.id) === undefined);
    console.log(`[samu] sur place ${tScene.toFixed(0)} s après l'appel ; soins terminés en ${tCare.toFixed(0)} s ; chargée ${tLoad.toFixed(0)} s plus tard ; `
      + `départ ${tLeft.toFixed(0)} s après ; hors carte après ${tGone.toFixed(0)} s | radio :`,
    ctx.radio.log.filter((m) => m.channel === 'secours').map((m) => m.text).join(' / '));
    expect(tGone).toBeGreaterThanOrEqual(0);
    expect(evacuated).toBe(1);
    rig.step(2);
    expect(inc.state).toBe('resolu');
    const rec = records.of(inc.id)!;
    expect(rec.outcome).toBe('traite');
    expect(rec.death).toBe(false);
    expect(rec.means).toBe('samu');
    const rr = rig.records.of(call.id)!;
    expect(rr.victimsEvacuated).toBe(1);
    expect(rr.victimsTreated).toBe(1);
    expect(rr.points).toBe(25);
    expect(rig.states(call)).toEqual(['en_route', 'sur_place', 'reparti']);
  });
});
