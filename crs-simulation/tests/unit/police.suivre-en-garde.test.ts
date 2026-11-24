// « Avec moi » : l'unité qui suit le commandant à pied se met en garde quand il s'arrête — en ligne derrière lui,
// face à la foule — sans ordre ni radio (l'ordre reste « suivre »), et reprend la colonne quand il repart.
// Vraie place de la Concorde, manifestation présente.
import { describe, expect, it } from 'vitest';

import type { GameContext, Squad } from '@/core/contracts';
import { angleDiff } from '@/core/math';
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
import { POLICE_FORMATION_SERVICE } from '@/sim/police/api';
import type { PoliceFormationApi } from '@/sim/police/api';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

/**
 * Foule la plus proche à moins de 120 m de (x, z) : le premier manifestant qui en a au moins 8 autour de lui à moins de
 * 15 m, et le barycentre de ceux à moins de 25 m de lui (des isolés plus près ne sont pas « la foule »).
 */
function nearestCrowd(ctx: GameContext, x: number, z: number): { x: number; z: number; n: number; d: number } {
  const ps = ctx.people.list.filter((p) => p.faction === 'protest' && p.vehicleId === 0 && Math.hypot(p.x - x, p.z - z) < 120)
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const c = ps.find((p) => ps.filter((q) => q !== p && Math.hypot(q.x - p.x, q.z - p.z) <= 15).length >= 8);
  if (!c) return { x, z, n: 0, d: 0 };
  const near = ps.filter((q) => Math.hypot(q.x - c.x, q.z - c.z) <= 25);
  const cx = near.reduce((a, q) => a + q.x, 0) / near.length;
  const cz = near.reduce((a, q) => a + q.z, 0) / near.length;
  return { x: cx, z: cz, n: near.length, d: Math.hypot(cx - x, cz - z) };
}

describe('« avec moi » : en garde quand le joueur s’arrête', () => {
  it('arrêté 3 s près de la foule : ligne face à la foule en moins de 10 s, ordre « suivre », pas de radio ; il repart de 10 m : colonne', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.1,
      volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
    } as never);
    const { ctx } = t;
    t.step(3);
    const me = ctx.player.person()!;
    const forms = ctx.service<PoliceFormationApi>(POLICE_FORMATION_SERVICE)!;
    // une section suit le commandant (« Avec moi ») ; il marche un peu, elle se met en colonne derrière lui
    const section: Squad = ctx.squads.list.find((s) => s.faction === 'police' && s.kind === 'section')!;
    expect(section).toBeDefined();
    ctx.squads.issue(section.id, { type: 'suivre', targetId: me.id, issuedBy: me.id, byPlayer: true });
    const input = ctx.input as { moveX: number; moveY: number };
    input.moveY = 0.6;
    t.step(4);
    input.moveY = 0;
    expect(forms.of(section.id)?.formation).toBe('colonne');
    // il s'arrête : rien n'est dit à la radio, l'ordre ne change pas
    const radioFrom = ctx.radio.log.length;
    const issued: number[] = [];
    ctx.events.on('order:issued', (e: { squadId: number }) => issued.push(e.squadId));
    let lineAt = -1;
    for (let s = 0; s < 14 && lineAt < 0; s += 0.5) {
      t.step(0.5);
      if (forms.of(section.id)?.formation === 'ligne') lineAt = s + 0.5;
    }
    t.step(6);
    const f = forms.of(section.id)!;
    const c = nearestCrowd(ctx, me.x, me.z);
    const toCrowd = Math.atan2(c.x - me.x, c.z - me.z);
    const back = Math.hypot(f.x - me.x, f.z - me.z);
    const radioSection = ctx.radio.log.slice(radioFrom).filter((m) => m.from.toUpperCase().includes(section.name.toUpperCase())).map((m) => m.text);
    console.log(`en garde : ligne à ${lineAt} s, à ${back.toFixed(1)} m du commandant, cap ${f.heading.toFixed(2)} (foule ${toCrowd.toFixed(2)} à ${c.d.toFixed(0)} m, ${c.n} manifestants) ; ordre ${section.order.type} ; radio de la section : ${radioSection.join(' | ') || '—'}`);
    expect(c.n).toBeGreaterThanOrEqual(9);
    expect(lineAt).toBeGreaterThan(0);
    expect(lineAt).toBeLessThanOrEqual(10);
    expect(section.order.type).toBe('suivre');
    expect(Math.abs(angleDiff(f.heading, toCrowd))).toBeLessThan(0.5);
    expect(back).toBeGreaterThan(4);
    expect(back).toBeLessThan(16);
    expect(radioSection).toEqual([]);
    expect(issued.filter((id) => id === section.id)).toEqual([]);
    // il repart sur une dizaine de mètres : la section reprend la colonne derrière lui
    const x0 = me.x;
    const z0 = me.z;
    input.moveY = 0.6;
    for (let s = 0; s < 12 && Math.hypot(me.x - x0, me.z - z0) < 10; s += 0.5) t.step(0.5);
    t.step(1.5);
    input.moveY = 0;
    console.log(`il repart de ${Math.hypot(me.x - x0, me.z - z0).toFixed(1)} m : formation ${forms.of(section.id)?.formation}, ordre ${section.order.type}`);
    expect(Math.hypot(me.x - x0, me.z - z0)).toBeGreaterThan(8);
    expect(forms.of(section.id)?.formation).toBe('colonne');
    expect(section.order.type).toBe('suivre');
  }, 600000);
});
