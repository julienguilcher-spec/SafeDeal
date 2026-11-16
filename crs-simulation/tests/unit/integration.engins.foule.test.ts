// Engins face à la foule : un Centaure envoyé à travers un rassemblement se fraie un chemin (avertisseur, la foule
// s’écarte) ; chaque blindé reçoit un groupe à pied qui le protège.
import { describe, expect, it } from 'vitest';

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

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 2, fourgons: 6, centaure: 1, canon_eau: 1, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('engins face à la foule', () => {
  it('chaque blindé a son escorte à pied ; un Centaure traverse un rassemblement', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la République', x: 3123, z: -208, crowdSize: 500, tension: 0.2, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } });
    const { ctx } = t;
    t.step(30);
    const armored = ctx.vehicles.list.filter((v) => v.kind === 'centaure' || v.kind === 'canon_eau');
    const escorted = armored.filter((v) => ctx.squads.list.some((s) => s.order.type === 'proteger' && s.order.targetId === v.id));
    console.log(`blindés ${armored.length}, escortés ${escorted.length}`);
    expect(escorted.length).toBe(armored.length);
    // le Centaure traverse la place, où se tient le rassemblement
    const c = ctx.vehicles.list.find((v) => v.kind === 'centaure')!;
    const protesters = ctx.people.list.filter((p) => p.faction === 'protest');
    let cx = 0, cz = 0; for (const p of protesters) { cx += p.x; cz += p.z; } cx /= protesters.length; cz /= protesters.length;
    const tx = cx + (cx - c.x) * 0.6, tz = cz + (cz - c.z) * 0.6;
    const ap = ctx.service<{ driveTo(v: unknown, x: number, z: number, o?: unknown): boolean; status(v: unknown): { state: string; reason: string; remaining: number } }>('vehicles.autopilot')!;
    if (c.seats[0] === 0) {
      const crew = ctx.squads.list.find((s) => s.vehicleId === c.id)!;
      ctx.vehicles.enter(ctx.people.get(crew.members[0]!)!, c, 0);
    }
    const ok = ap.driveTo(c, tx, tz, { urgence: true });
    const d0 = Math.hypot(tx - c.x, tz - c.z);
    t.step(120);
    const d1 = Math.hypot(tx - c.x, tz - c.z);
    const st = ap.status(c);
    console.log(`Centaure : itinéraire ${ok}, ${d0.toFixed(0)} → ${d1.toFixed(0)} m du but ; état ${st.state}/${st.reason}`);
    expect(d1).toBeLessThan(d0 * 0.5);
  }, 600000);
});
