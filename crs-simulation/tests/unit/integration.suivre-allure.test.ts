// « Suivre » donné à une section fraîche par le joueur, qui part aussitôt en courant (avance tenue : il trottine puis
// court) le long d'une rue droite : la section règle son allure sur la sienne (trot, course), s'étire au besoin, et
// au bout de 30 s aucun agent n'est à plus de 25 m derrière lui. (Elle restait à 75 m : sa tête était bridée à
// 0,5 m/s dès qu'un agent avait deux mètres de retard.)
import { describe, expect, it } from 'vitest';

import type { GameContext, Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { POLICE_UNITS_SERVICE } from '@/sim/police/api';
import type { PoliceUnitsApi } from '@/sim/police/api';

/** Tronçon de rue droit d'au moins `len` mètres, libre sur toute sa longueur, près de (x, z). */
function straightStreet(ctx: GameContext, x: number, z: number, len: number): { x: number; z: number; dx: number; dz: number } {
  let best: { x: number; z: number; dx: number; dz: number; d: number } | null = null;
  for (let e = 0; e < ctx.world.edgeCount; e++) {
    const info = ctx.world.edge(e);
    if (info.pedestrianOnly) continue;
    const p = info.points;
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2]!, az = p[i - 1]!, bx = p[i]!, bz = p[i + 1]!;
      const l = Math.hypot(bx - ax, bz - az);
      if (l < len) continue;
      const d = Math.hypot(ax - x, az - z);
      if (best && d >= best.d) continue;
      const dx = (bx - ax) / l, dz = (bz - az) / l;
      let ok = ctx.world.lineOfSight(ax, az, ax + dx * len, az + dz * len);
      for (let s = 0; ok && s <= len; s += 5) ok = ctx.world.isFree(ax + dx * s, az + dz * s, 0.6);
      if (ok) best = { x: ax, z: az, dx, dz, d };
    }
  }
  if (!best) throw new Error('aucune rue droite');
  return best;
}

describe('suivre le joueur qui court', () => {
  it('une section fraîche suit le joueur qui court 30 s le long d’une rue droite : personne à plus de 25 m', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: [world, roles, people, vehicles, police, law, radio, session] });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
      extra: { moyens: { sections: 1, fourgons: 0, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true }, variante: 'terrain' },
    } as never);
    const { ctx } = t;
    t.step(1);
    const me = ctx.player.person()!;
    const st = straightStreet(ctx, me.x, me.z, 190);
    me.x = st.x + st.dx * 12;
    me.z = st.z + st.dz * 12;
    me.y = ctx.world.heightAt(me.x, me.z);
    me.heading = Math.atan2(st.dx, st.dz);
    ctx.people.rebuildIndex();
    (ctx.player.state as { camYaw: number }).camYaw = Math.atan2(st.dx, st.dz);
    const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    const h = units.createSection({ x: st.x, z: st.z, heading: Math.atan2(st.dx, st.dz), callsign: 'MISTRAL 1' });
    const walkers: Person[] = h.people.filter((p) => p.vehicleId === 0);
    expect(walkers.length).toBeGreaterThanOrEqual(15);
    ctx.squads.issue(h.squad.id, { type: 'suivre', targetId: me.id, x: me.x, z: me.z, issuedBy: me.id });
    const input = ctx.input as { moveY: number; moveX: number };
    input.moveX = 0;
    input.moveY = 1;
    let top = 0;
    for (let i = 0; i < 30; i++) {
      t.step(1);
      top = Math.max(top, Math.hypot(me.vx, me.vz));
    }
    input.moveY = 0;
    const run = Math.hypot(me.x - st.x, me.z - st.z);
    // derrière lui : distance comptée le long de la rue
    const behind = walkers.map((p) => Math.round((me.x - p.x) * st.dx + (me.z - p.z) * st.dz));
    console.log(`suivre en courant : joueur à ${run.toFixed(0)} m du départ (pointe ${top.toFixed(1)} m/s) ; retards ${behind.join(',')}`);
    expect(top).toBeGreaterThan(3.5);
    expect(run).toBeGreaterThan(90);
    expect(Math.max(...behind)).toBeLessThan(25);
  }, 300000);

  it('commandant MISTRAL (Concorde, « terrain ») : « suivre » à la section MISTRAL 1 sans ordre préalable, les chefs de groupe suivent', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: [world, roles, people, vehicles, police, law, radio, session] });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1,
      volatility: 0.1, duration: 'standard',
      extra: { moyens: { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true }, variante: 'terrain' },
    } as never);
    const { ctx } = t;
    t.step(5);
    const me = ctx.player.person()!;
    const section = ctx.squads.list.find((q) => q.name === 'MISTRAL 1' && q.kind === 'section')!;
    ctx.squads.issue(section.id, { type: 'suivre', targetId: me.id, x: me.x, z: me.z, issuedBy: me.id });
    const input = ctx.input as { moveY: number; moveX: number };
    input.moveX = 0;
    input.moveY = 0.5;
    t.step(48);
    input.moveY = 0;
    const chiefs = ctx.squads.list.filter((q) => q.parentId === section.id).map((q) => ctx.people.get(q.leaderId)!).filter((p) => p && p.vehicleId === 0);
    const far = chiefs.map((p) => Math.round(Math.hypot(p.x - me.x, p.z - me.z)));
    console.log('MISTRAL 1 suit le commandant qui marche : chefs de groupe à', far.join(', '), 'm');
    expect(chiefs.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...far)).toBeLessThan(20);
  }, 300000);
});
