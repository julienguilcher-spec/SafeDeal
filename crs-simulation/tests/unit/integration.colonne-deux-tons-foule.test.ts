// Colonne du joueur (session/follow.ts) : un fourgon qui le suit, arrêté par des personnes plantées devant lui, met ses
// deux-tons (session/engins.ts, dégagement : la foule s'écarte devant l'engin). follow.ts recopiait à chaque revue la
// sirène du véhicule du joueur (éteinte) sur chaque suivant : les deux-tons du fourgon bloqué étaient coupés aussitôt
// allumés — ni le joueur ni la foule ne les entendaient.
import { describe, expect, it } from 'vitest';

import type { Person, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';

const SIM = [world, roles, people, vehicles, police, law, radio, session, command];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

type ApStatus = { mode: string; state: string; reason: string; leaderId: number; blockedFor: number };

describe('colonne du joueur : deux-tons d’un suivant arrêté par la foule', () => {
  it('le fourgon bloqué par des personnes garde ses deux-tons (le joueur roule sans)', async () => {
    const t = createTestContext({ seed: 32, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } } as never);
    const { ctx } = t;
    t.step(3);
    const me = ctx.player.person()!;
    const core = ctx.service<CommandCore>('ui.command')!;
    const ap = ctx.service<{ status(v: Vehicle): ApStatus }>('vehicles.autopilot')!;
    const unit = ctx.squads.list.find((s) => s.faction === 'police' && s.kind === 'compagnie')!;
    const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement' && v.faction === 'police')
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    // le joueur prend le volant du VL (son chauffeur passe à l'arrière)
    me.x = vl.x + 3; me.z = vl.z;
    const drv = ctx.people.get(vl.seats[0]!)!;
    ctx.vehicles.exit(drv);
    for (let i = 1; i < vl.seats.length; i++) if (vl.seats[i] === 0 && ctx.vehicles.enter(drv, vl, i)) break;
    expect(ctx.vehicles.enter(me, vl, 'driver')).toBe(true);
    expect(core.issue('avec_moi', [unit], null).ok).toBe(true);
    // la colonne se forme derrière lui (fourgons garés, en « follow »)
    let follower: Vehicle | undefined;
    for (let i = 0; i < 60 && !follower; i++) {
      t.step(2);
      follower = ctx.vehicles.list.find((v) => v !== vl && ap.status(v).mode === 'follow' && ap.status(v).leaderId === vl.id);
    }
    expect(follower, 'un fourgon suit le VL du joueur').toBeDefined();
    expect(vl.siren).toBe(0);
    // le joueur s'est avancé de vingt mètres devant ce fourgon ; trois personnes plantées devant son capot
    const f = follower!;
    const fx = Math.sin(f.heading), fz = Math.cos(f.heading), rx = Math.cos(f.heading), rz = -Math.sin(f.heading);
    vl.x = f.x + fx * 22; vl.z = f.z + fz * 22; vl.heading = f.heading; vl.vx = 0; vl.vz = 0; vl.speed = 0;
    const wall: { p: Person; x: number; z: number }[] = [];
    for (const l of [-1.2, 0, 1.2]) {
      const x = f.x + fx * (f.def.length * 0.5 + 1.6) + rx * l, z = f.z + fz * (f.def.length * 0.5 + 1.6) + rz * l;
      wall.push({ p: ctx.people.spawn({ kind: 'civil', faction: 'civil', x, z } as never), x, z });
    }
    let sirenOn = 0;
    let blocked = 0;
    for (let i = 0; i < 200; i++) {
      for (const w of wall) { w.p.x = w.x; w.p.z = w.z; w.p.vx = 0; w.p.vz = 0; }
      t.step(0.1);
      const st = ap.status(f);
      if ((st.state === 'attente' || st.state === 'bloque') && st.reason === 'personne' && st.blockedFor > 4) {
        blocked++;
        if (f.siren !== 0) sirenOn++;
      }
    }
    console.log(`suivant #${f.id} arrêté par les personnes pendant ${(blocked / 10).toFixed(1)} s ; deux-tons allumés ${(sirenOn / 10).toFixed(1)} s ; VL du joueur : sirène ${vl.siren}`);
    // (au bout de quelques secondes le suivant contourne les personnes immobiles : il n'est plus arrêté vingt secondes,
    // mais il l'est assez longtemps pour juger des deux-tons)
    expect(blocked).toBeGreaterThan(20);
    expect(sirenOn / blocked).toBeGreaterThan(0.9);
  }, 300000);
});
