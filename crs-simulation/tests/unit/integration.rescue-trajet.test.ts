// Session complète, joueur sapeur-pompier (pas le conducteur) : la salle des pompiers l'engage sur un feu à plus de
// 500 m ; la carte « Ma mission » dit d'embarquer (GPS sur l'engin), puis la route deux tons ; le conducteur (IA)
// conduit, l'équipage descend sur les lieux ; il n'entend que le réseau des secours, jamais la radio de police.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, ObjectivesApi, RescueApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue, RESCUE_EXT_SERVICE } from '@/sim/roles/rescue';
import type { RescueExtApi } from '@/sim/roles/rescue';
import type { PropsExtApi } from '@/sim/props/api';
import { createSystems as radio } from '@/gameplay/radio';
import type { RadioControl } from '@/gameplay/radio';
import { createSystems as session, MISSION_OBJECTIVE_ID, MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import { createObjectives } from '@/ui/core/objectives';

/** Service des objectifs sans interface (comme en jeu, où l'interface le publie). */
const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];

const SIM = [world, roles, people, vehicles, crowd, police, items, props, hazards, law, incidents, rescue, radio, session, objectives];
const MEANS = { sections: 2, fourgons: 4, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 1, samu: 1, secours_sur_appel: true };

describe('session : le joueur pompier va en engin, conduit par l’IA', () => {
  it('embarquement (GPS sur l’engin), route deux tons sur plus de 500 m, descente sur les lieux ; radio des secours seulement', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'secouriste', place: 'Place de la République', x: 3123, z: -208, crowdSize: 120, tension: 0.2, volatility: 0.2, duration: 'standard',
      extra: { moyens: MEANS, variante: 'pompier', props: { ambientDensity: 0 } },
    });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    const ext = ctx.require<RescueExtApi>(RESCUE_EXT_SERVICE);
    t.step(3);
    const me = ctx.player.person()!;
    expect(me.kind).toBe('pompier');
    const squad = ctx.squads.get(me.squadId)!;
    const v = ctx.vehicles.get(squad.vehicleId) as Vehicle;
    expect(v.kind).toBe('camion_pompiers');
    expect(brief.family).toBe('secours');
    console.log(`[session pompier] ${brief.heading} | ${brief.chain} | « ${brief.instruction.title} » — ${brief.instruction.detail} | ${brief.radioLabel}`);

    // un conteneur brûle à plus de 500 m de l'engin, loin de la manifestation
    // (du côté opposé à la manifestation : l'engin ne traverse pas la place occupée ; tuiles chargées comme en jeu)
    const away = Math.atan2(v.x - 3123, v.z + 208);
    await ctx.world.whenLoaded(v.x + Math.sin(away) * 600, v.z + Math.cos(away) * 600, 400);
    let at: { x: number; z: number } | null = null;
    for (let k = 450; k <= 750 && !at; k += 50) {
      for (const side of [0, -50, 50, -100, 100, -150, 150]) {
        const c = { x: v.x + Math.sin(away) * k + Math.cos(away) * side, z: v.z + Math.cos(away) * k - Math.sin(away) * side };
        if (!ctx.world.randomFreePoint(c.x, c.z, 15, 'road', () => ctx.rng.next(), c)) continue;
        if (Math.hypot(c.x - v.x, c.z - v.z) > 520) { at = c; break; }
      }
    }
    console.log(`[session pompier] engin en (${v.x.toFixed(0)}, ${v.z.toFixed(0)}), feu en (${at?.x.toFixed(0)}, ${at?.z.toFixed(0)})`);
    expect(at).not.toBeNull();
    const bin = ctx.props.spawn('conteneur', at!.x, at!.z, 0);
    expect(ctx.require<PropsExtApi>('props.ext').ignite(bin, 0)).toBe(true);
    t.step(2);
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    const fire = api.list.find((i) => i.kind === 'feu_poubelle' && Math.hypot(i.x - bin.x, i.z - bin.z) < 20)!;
    expect(api.assign(fire.id, 'pompiers')).toBe(true);
    t.step(1);
    const ride = ext.playerRide!;
    expect(ext.playerCallId).not.toBe(0);
    expect(ride.stage).toBe('embarquement');
    // la carte : embarquez, GPS sur l'engin
    console.log(`[session pompier] engagé : « ${brief.instruction.title} » — ${brief.instruction.detail}`);
    expect(brief.instruction.title).toMatch(/^Embarquez/);
    expect(brief.instruction.target).toBe('vehicle');
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    const gps = obj.list.find((o) => o.id === MISSION_OBJECTIVE_ID)!;
    expect(Math.hypot((gps.x ?? 0) - v.x, (gps.z ?? 0) - v.z)).toBeLessThan(10);

    // il monte comme passager : l'IA conduit deux tons
    me.x = v.x + 3;
    me.z = v.z;
    expect(ctx.vehicles.enter(me, v, 'passenger')).toBe(true);
    const tGo = t.ctx.clock.now;
    let started = false;
    for (let i = 0; i < 80 && !started; i++) { t.step(0.25); started = ride.stage === 'route'; }
    if (!started) {
      for (const id of squad.members) { const q = ctx.people.get(id)!; console.log(`DBG member ${q.id} player=${q.isPlayer} veh=${q.vehicleId} d=${Math.hypot(q.x - v.x, q.z - v.z).toFixed(1)} posture=${q.posture} custody=${q.custody} dormant=${q.dormant}`); }
      console.log(`DBG stage=${ride.stage} seats=${v.seats.join(',')} wait=${ride.waitLeft} fire=${fire.state} means=${fire.means} bin=${bin.state} call=${ext.playerCallId}`);
    }
    expect(started).toBe(true);
    t.step(4);
    expect(v.siren).not.toBe(0);
    expect(ctx.people.get(v.seats[0])!.isPlayer).toBe(false);
    console.log(`[session pompier] en route : « ${brief.instruction.title} » — ${brief.instruction.detail}`);
    expect(brief.instruction.detail).toMatch(/deux tons.*restez à bord/);

    let arrived = false;
    for (let i = 0; i < 600 && !arrived; i++) { t.step(0.5); arrived = ride.stage === 'sur_place'; }
    const dStop = Math.hypot(v.x - bin.x, v.z - bin.z);
    console.log(`[session pompier] sur place après ${(ctx.clock.now - tGo).toFixed(0)} s ; engin à ${dStop.toFixed(1)} m du feu ; « ${brief.instruction.title} » — ${brief.instruction.detail}`);
    expect(arrived).toBe(true);
    // arrêté à distance de lance, ou — rue encombrée près des lieux — un peu avant : on finit à pied
    expect(dStop).toBeLessThan(150);
    expect(v.siren).toBe(0);
    expect(me.vehicleId).toBe(0);
    t.step(2);
    console.log(`[session pompier] descendu : « ${brief.instruction.title} » — ${brief.instruction.detail}`);
    // il rejoint le feu à pied (son équipe le suit) : l'intervention commence
    me.x = bin.x + 9;
    me.z = bin.z;
    let onScene = false;
    const callId = ext.playerCallId;
    const call = ctx.require<RescueApi>(EXT.rescue).calls.find((c) => c.id === callId)!;
    for (let i = 0; i < 60 && !onScene; i++) { t.step(0.5); onScene = call.state === 'sur_place'; }
    console.log(`[session pompier] sur les lieux : « ${brief.instruction.title} » — ${brief.instruction.detail}`);
    expect(onScene).toBe(true);
    expect(brief.instruction.detail).toMatch(/^Sur les lieux : établissez la lance/);
    t.step(5);

    // radio : le réseau des secours est entendu ; la police (commandement, unités, demandes sur le réseau) ne l'est pas
    const control = ctx.service<RadioControl>('radio.control')!;
    const heard = ctx.radio.log.filter((m) => !control.muted(m));
    const police = ctx.radio.log.filter((m) => m.channel === 'commandement' || m.channel === 'unite' || /^(MISTRAL|TRAMONTANE|SIROCCO|CENTRAL)/i.test(m.from));
    console.log(`[session pompier] entendu : ${heard.map((m) => `${m.from}: ${m.text}`).join(' | ')}`);
    console.log(`[session pompier] ${police.length} messages de police, tous masqués : ${police.every((m) => control.muted(m))}`);
    expect(heard.some((m) => m.from === 'PARIS' && / de PARIS : départ pour /.test(m.text))).toBe(true);
    expect(heard.some((m) => / : sur les lieux/.test(m.text))).toBe(true);
    expect(heard.every((m) => m.channel === 'secours')).toBe(true);
    expect(heard.some((m) => /^(MISTRAL|TRAMONTANE|SIROCCO|CENTRAL|ÉPERVIER|FAUCON)/i.test(m.from))).toBe(false);
    expect(police.length).toBeGreaterThan(0);
    expect(police.every((m) => control.muted(m))).toBe(true);
  }, 300000);
});
