// Colonne garantie (plan « ordres directs », P17, point 2) : le dernier recours, HORS DE LA VUE DU JOUEUR. Un véhicule de
// police qui ne progresse plus est replacé plus loin sur son propre itinéraire (ou garé d'office à sa place, ou retrouvé
// derrière son chef de file) ; jamais sous les yeux du joueur, et jamais un véhicule garé en réserve d'un commissariat.
//   - le canon à eau nez au parapet du quai des Tuileries (place de la Concorde) : la chaussée la plus proche est la voie
//     Georges-Pompidou, en contrebas, derrière le mur ; le pilote automatique ne peut que buter contre lui ;
//   - un fourgon qui ne finit pas de se garer ;
//   - un suivant resté loin derrière son chef de file.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles';
import { ENGINS_SERVICE, EnginsSystem } from '@/gameplay/session/engins';
import type { EnginsApi } from '@/gameplay/session/engins';

/** Réserve de commissariat simulée : les véhicules de `held` sont « tenus » (src/world/commissariats/held.ts). */
const held = new Set<number>();
const reserve: ModuleFactory = () => [{
  id: 'test.reserve', order: 0,
  provide(ctx: GameContext) { ctx.provide('police.commissariats', { holds: (id: number) => held.has(id) }); },
} as GameSystem];
const engins: ModuleFactory = () => [new EnginsSystem()];

async function concorde(playerAt: { x: number; z: number }) {
  held.clear();
  const t = createTestContext({ seed: 21, strict: false, modules: [world, people, vehicles, reserve, engins] });
  await t.start({ mode: 'libre', role: 'commandant', place: 'Place de la Concorde', x: playerAt.x, z: playerAt.z } as never);
  const ctx = t.ctx;
  if (!ctx.player.person()) ctx.player.possess(ctx.people.spawn({ kind: 'crs', x: playerAt.x, z: playerAt.z }).id);
  const me = ctx.player.person();
  expect(me).toBeTruthy();
  me!.x = playerAt.x;
  me!.z = playerAt.z;
  return { t, ctx, me: me!, ap: ctx.require<AutopilotApi>('vehicles.autopilot'), stats: ctx.require<EnginsApi>(ENGINS_SERVICE).stats };
}

function cannonAtParapet(ctx: GameContext): Vehicle {
  const v = ctx.vehicles.spawn('canon_eau', 25.7, 202.6, -33 * Math.PI / 180, { faction: 'police' });
  const p = ctx.people.spawn({ kind: 'crs', x: 30, z: 195 });
  expect(ctx.vehicles.enter(p, v, 'driver')).toBe(true);
  return v;
}

const TX = 513.6, TZ = 463.8;

describe('filet de sécurité hors de la vue du joueur', () => {
  it('le canon à eau nez au parapet, loin du joueur, est replacé sur son itinéraire et roule vers le point', async () => {
    const { t, ctx, me, ap, stats } = await concorde({ x: -330, z: 60 });
    const v = cannonAtParapet(ctx);
    expect(ap.driveTo(v, TX, TZ, { urgence: true })).toBe(true);
    const d0 = Math.hypot(v.x - TX, v.z - TZ);
    let seenMoves = 0;
    for (let s = 0; s < 240; s++) {
      const x = v.x, z = v.z;
      t.step(1);
      me.x = -330;
      me.z = 60;
      if (Math.hypot(v.x - x, v.z - z) > 12 && Math.hypot(me.x - v.x, me.z - v.z) < 300) seenMoves++;
    }
    const st = ap.status(v);
    const d1 = Math.hypot(v.x - TX, v.z - TZ);
    const msg = `(${v.x.toFixed(0)}, ${v.z.toFixed(0)}) ${st.mode}/${st.state}/${st.reason}, ${d0.toFixed(0)} → ${d1.toFixed(0)} m, ${JSON.stringify(stats.log)}`;
    expect(stats.skipAhead, msg).toBeGreaterThan(0);
    expect(d1, msg).toBeLessThan(d0 - 100);
    expect(seenMoves, msg).toBe(0);
  }, 300000);

  it('sous les yeux du joueur, rien n’est replacé (le véhicule reste où la conduite le laisse)', async () => {
    const { t, ctx, me, ap, stats } = await concorde({ x: 60, z: 170 });
    const v = cannonAtParapet(ctx);
    expect(ap.driveTo(v, TX, TZ, { urgence: true })).toBe(true);
    let jumps = 0;
    for (let s = 0; s < 180; s++) {
      const x = v.x, z = v.z;
      t.step(1);
      me.x = 60;
      me.z = 170;
      if (Math.hypot(v.x - x, v.z - z) > 12) jumps++;
    }
    expect(jumps).toBe(0);
    expect(stats.skipAhead + stats.unstickFollow + stats.wallNudge).toBe(0);
  }, 300000);

  it('un véhicule garé en réserve d’un commissariat n’est jamais replacé, même coincé loin du joueur', async () => {
    const { t, ctx, me, ap, stats } = await concorde({ x: -330, z: 60 });
    const v = cannonAtParapet(ctx);
    held.add(v.id);
    expect(ap.driveTo(v, TX, TZ, { urgence: true })).toBe(true);
    const x0 = v.x, z0 = v.z;
    for (let s = 0; s < 180; s++) {
      t.step(1);
      me.x = -330;
      me.z = 60;
    }
    expect(Math.hypot(v.x - x0, v.z - z0)).toBeLessThan(12);
    expect(stats.skipAhead + stats.unstickFollow + stats.wallNudge).toBe(0);
  }, 300000);

  it('un fourgon qui ne finit pas de se garer, loin du joueur, est garé d’office à sa place', async () => {
    const { t, ctx, me, ap, stats } = await concorde({ x: -330, z: 60 });
    const v = cannonAtParapet(ctx);
    // sa place est de l'autre côté du parapet, à quinze mètres : il ne peut que buter contre le mur
    const px = 14, pz = 216;
    expect(ctx.world.isFree(px, pz, v.def.width * 0.5)).toBe(true);
    expect(ap.park(v, px, pz, -33 * Math.PI / 180)).toBe(true);
    for (let s = 0; s < 150 && ap.status(v).mode === 'park'; s++) {
      t.step(1);
      me.x = -330;
      me.z = 60;
    }
    const st = ap.status(v);
    const msg = `(${v.x.toFixed(1)}, ${v.z.toFixed(1)}) ${st.mode}/${st.state}/${st.reason} ${JSON.stringify(stats.log)}`;
    expect(st.mode, msg).toBe('idle');
    expect(Math.hypot(v.x - px, v.z - pz), msg).toBeLessThan(2);
  }, 300000);
});
