// Carte « Ma mission » en session : le CRS de base connaît son unité, son chef et UNE consigne ; sa radio ne garde que
// son groupe, sa section, sa compagnie et CENTRAL ; pendant la journée, la consigne est le déplacement ; un secouriste
// n'entend pas la radio de police.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
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
import type { RadioControl } from '@/gameplay/radio';
import { createSystems as session, MISSION_OBJECTIVE_ID, MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import { createObjectives } from '@/ui/core/objectives';

/** Service des objectifs sans interface (comme en jeu, où l'interface le publie). */
const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, objectives];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('carte « Ma mission » en session', () => {
  it('CRS stagiaire : unité, chef, une consigne avec GPS ; radio filtrée ; rappel quand il s’éloigne', async () => {
    const t = createTestContext({ seed: 31, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'crs', rank: 'gardien_stagiaire', place: 'essai', x: -10, z: 15, crowdSize: 300, tension: 0.4, volatility: 0.4, duration: 'standard', extra: { moyens: MEANS } });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    t.step(30);
    console.log(`carte : ${brief.heading} | ${brief.chain} | ${brief.chief?.role} ${brief.chief?.label} ${brief.chief?.distance.toFixed(0)} m | ${brief.instruction.source} « ${brief.instruction.title} » — ${brief.instruction.detail}`);
    expect(brief.active).toBe(true);
    expect(brief.family).toBe('police');
    expect(brief.chain).toMatch(/^Groupe .+ — Section .+ — Cie /);
    expect(brief.chief).not.toBeNull();
    expect(brief.instruction.title).not.toBe('');
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    expect(obj.list.some((o) => o.id === MISSION_OBJECTIVE_ID)).toBe(true);
    expect(obj.tracked).toBe(MISSION_OBJECTIVE_ID);
    // pas d'objectif « Ordre » concurrent pour le CRS
    expect(obj.list.some((o) => o.id === 'ordre')).toBe(false);
    // la radio est filtrée : des messages ont été masqués, aucun message d'une autre section n'a été entendu
    t.step(60);
    const control = ctx.service<RadioControl>('radio.control')!;
    expect(control.listen).not.toBeNull();
    const heard = ctx.radio.log.filter((m) => !control.muted(m));
    const muted = ctx.radio.log.filter((m) => control.muted(m));
    console.log(`radio : ${heard.length} entendus, ${muted.length} masqués ; entendus : ${heard.slice(-6).map((m) => `${m.from}: ${m.text.slice(0, 70)}`).join(' | ')}`);
    expect(muted.length).toBeGreaterThan(0);
    // éloigné de 80 m de son chef, à pied : rappel et GPS sur le chef
    const me = ctx.player.person()!;
    const c = brief.chief!;
    me.x = c.x + 80; me.z = c.z;
    t.step(2);
    console.log(`éloigné : ${brief.instruction.source} « ${brief.instruction.title} » — ${brief.instruction.detail}`);
    expect(brief.regroup).toBe(true);
    expect(brief.instruction.source).toBe('regroup');
    expect(obj.tracked).toBe(MISSION_OBJECTIVE_ID);
  }, 300000);

  it('journée de service : la consigne est le déplacement (embarquement), une seule', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'crs', place: 'Place de la République', x: 3123, z: -208, crowdSize: 150, tension: 0.2, volatility: 0.2, duration: 'standard', extra: { moyens: MEANS, journee: true } });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    t.step(15);
    console.log(`journée : ${brief.instruction.source} « ${brief.instruction.title} » — ${brief.instruction.detail}`);
    expect(brief.instruction.source).toBe('journee');
    expect(brief.instruction.title).toMatch(/Embarquez|En route|bord/);
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    expect(obj.list.some((o) => o.id === MISSION_OBJECTIVE_ID)).toBe(false);
    expect(brief.covered).toContain('journee');
  }, 300000);

  it('secouriste (pompier) : carte des secours, pas de radio de police', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'secouriste', place: 'essai', x: -10, z: 15, crowdSize: 200, tension: 0.4, volatility: 0.4, duration: 'standard', extra: { moyens: MEANS, variante: 'pompier' } });
    const { ctx } = t;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    t.step(2);
    const from = ctx.radio.log.length;
    ctx.radio.say({ channel: 'commandement', from: 'MISTRAL', text: 'MISTRAL UN ICI MISTRAL. En ligne. PARLEZ.', priority: 1 });
    t.step(20);
    console.log(`secours : ${brief.heading} | ${brief.chain} | ${brief.instruction.source} « ${brief.instruction.title} » — ${brief.instruction.detail} | ${brief.radioLabel}`);
    expect(brief.active).toBe(true);
    expect(brief.family).toBe('secours');
    const control = ctx.service<RadioControl>('radio.control')!;
    const police = ctx.radio.log.slice(from).filter((m) => m.channel === 'commandement' || m.channel === 'unite');
    expect(police.length).toBeGreaterThan(0);
    expect(police.every((m) => control.muted(m))).toBe(true);
  }, 300000);

  it('commandant : ni carte ni filtre (il entend tout)', async () => {
    const t = createTestContext({ seed: 31, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', place: 'essai', x: -10, z: 15, crowdSize: 200, tension: 0.4, volatility: 0.4, duration: 'standard', extra: { moyens: MEANS } });
    t.step(20);
    expect(t.ctx.service<MissionBrief>(MISSION_SERVICE)!.active).toBe(false);
    expect(t.ctx.service<RadioControl>('radio.control')!.listen).toBeNull();
  }, 300000);
});
