// Journée de service partie d'un commissariat qui a ses propres véhicules garés en réserve (vraie carte de Paris, partie
// complète avec patrouilles et commissariats, comme dans main.ts) : 1er (place du Marché-Saint-Honoré) et 8e (avenue
// du Général-Eisenhower). La colonne de la compagnie est garée à côté des places réservées sans les prendre ni les
// chevaucher, elle part sans pousser ni attendre derrière les véhicules garés du commissariat (qui ne bougent pas et
// restent dans la réserve), et elle arrive au lieu du rassemblement.
import { describe, expect, it } from 'vitest';

import type { GameContext, Person, Squad, Vehicle } from '@/core/contracts';
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
import { createSystems as session, JOURNEE_SERVICE, SERVICE_BASES } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats } from '@/gameplay/commissariats';
import { COMMISSARIATS, isHeldVehicle } from '@/world/commissariats';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, patrols, commissariats];
const PLACES: Record<string, [string, number, number]> = {
  concorde: ['Place de la Concorde', -10, 15], hotel: ['Hôtel de Ville', 2211, 993],
};

function rootOf(ctx: GameContext, s: Squad): Squad {
  let q = s;
  for (let g = 0; q.parentId !== 0 && g < 8; g++) q = ctx.squads.get(q.parentId) ?? q;
  return q;
}

/** Les emprises de deux véhicules se chevauchent-elles (rectangles orientés) ? */
function overlap(a: Vehicle, b: Vehicle, margin = 0.1): boolean {
  for (const h of [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2]) {
    const ax = Math.sin(h), az = Math.cos(h);
    const ext = (v: Vehicle): number => {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      return Math.abs(fx * ax + fz * az) * v.def.length * 0.5 + Math.abs(-fz * ax + fx * az) * v.def.width * 0.5;
    };
    if (Math.abs((b.x - a.x) * ax + (b.z - a.z) * az) >= ext(a) + ext(b) + margin) return false;
  }
  return true;
}

const CASES = [
  { site: '1er', base: 1, role: 'commandant', seed: 3, where: 'hotel', means: { sections: 2, fourgons: 6 }, crowd: 150 },
  { site: '8e', base: 4, role: 'crs', seed: 7, where: 'concorde', means: {}, crowd: 120 },
];

describe('journée de service au départ d’un commissariat garni', () => {
  for (const k of CASES) {
    it(`${k.site} (${k.role}) : la colonne se gare à côté de la réserve, part sans la pousser ni l’attendre, et arrive`, async () => {
      const t = createTestContext({ seed: k.seed, strict: false, modules: SIM });
      const [place, x, z] = PLACES[k.where]!;
      const base = SERVICE_BASES[k.base]!;
      const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true, ...k.means };
      await t.start({
        mode: 'libre', role: k.role as never, place, x, z, crowdSize: k.crowd, tension: 0.2, volatility: 0.2, duration: 'standard',
        extra: { moyens: MEANS, journee: true, base: { x: base.x, z: base.z, name: base.name } },
      } as never);
      const ctx = t.ctx;
      const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
      const me: Person = ctx.player.person()!;
      const def = COMMISSARIATS.find((c) => c.id === k.site)!;
      const held = ctx.vehicles.list.filter((v) => isHeldVehicle(ctx, v.id) && Math.hypot(v.x - def.door.x, v.z - def.door.z) < 300);
      const heldAt = new Map(held.map((v) => [v.id, { x: v.x, z: v.z }]));
      const company = rootOf(ctx, ctx.squads.get(me.squadId)!);
      const col = ctx.vehicles.list.filter((v) => v.faction === 'police' && !v.def.flying && !isHeldVehicle(ctx, v.id)
        && v.seats.concat(v.seats).some((id) => id !== 0 && (() => { const p = ctx.people.get(id); const s = p ? ctx.squads.get(p.squadId) : undefined; return !!s && rootOf(ctx, s).id === company.id; })()));
      const crews = ctx.squads.list.filter((s) => s.vehicleId !== 0 && rootOf(ctx, s).id === company.id).map((s) => ctx.vehicles.get(s.vehicleId)!).filter(Boolean);
      for (const v of crews) if (col.indexOf(v) < 0 && !isHeldVehicle(ctx, v.id)) col.push(v);
      const from = new Map(col.map((v) => [v.id, { x: v.x, z: v.z }]));
      const bad: string[] = [];
      for (const v of col) for (const h of held) if (overlap(v, h)) bad.push(`${v.kind}#${v.id} sur la place de ${h.kind}#${h.id}`);
      const gap = Math.min(...col.map((v) => Math.min(...held.map((h) => Math.hypot(v.x - h.x, v.z - h.z)))));
      console.log(`${k.site} : réserve ${held.length} véhicules garés, colonne ${col.length} véhicules (plus proche d'une place réservée : ${gap.toFixed(1)} m)`);
      expect(held.length).toBeGreaterThan(0);
      expect(col.length).toBeGreaterThan(2);
      expect(bad).toEqual([]);
      // le joueur embarque dans le véhicule de la compagnie le plus proche où il reste une place, comme dans la partie
      for (let i = 0; i < 20 && me.vehicleId === 0; i++) {
        t.step(3);
        const seat = col.filter((v) => v.seats[0] !== 0 && v.seats.some((id, s) => id === 0 && s > 0)).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
        if (seat) { me.x = seat.x + 2.5; me.z = seat.z; ctx.vehicles.enter(me, seat, 'passenger'); }
      }
      expect(me.vehicleId).not.toBe(0);
      for (let i = 0; i < 300 && j.stage !== 'route'; i++) t.step(1);
      expect(j.stage).toBe('route');
      // quatre minutes plus tard : chacun est parti, et aucun n'est resté arrêté contre un véhicule de la réserve
      const blockedByHeld = new Map<number, number>();
      const ap = ctx.require<{ status(v: Vehicle): { state: string; blockedFor: number } }>('vehicles.autopilot');
      for (let s = 0; s < 240; s++) {
        t.step(1);
        for (const v of col) {
          const st = ap.status(v);
          if ((st.state === 'attente' || st.state === 'bloque') && Math.abs(v.speed) < 0.3
            && held.some((h) => Math.hypot(h.x - v.x, h.z - v.z) < (h.def.length + v.def.length) * 0.5 + 2.5)) blockedByHeld.set(v.id, (blockedByHeld.get(v.id) ?? 0) + 1);
        }
      }
      const stay = col.filter((v) => Math.hypot(v.x - from.get(v.id)!.x, v.z - from.get(v.id)!.z) < 15).map((v) => `${v.kind}#${v.id}`);
      const longBlocked = [...blockedByHeld].filter(([, n]) => n > 20).map(([id, n]) => `${ctx.vehicles.get(id)!.kind}#${id} ${n} s`);
      const moved = held.filter((h) => Math.hypot(h.x - heldAt.get(h.id)!.x, h.z - heldAt.get(h.id)!.z) > 0.3 || !isHeldVehicle(ctx, h.id)).map((h) => `${h.kind}#${h.id}`);
      console.log(`${k.site} : 4 min après le départ, restés sur place : ${stay.join(', ') || 'aucun'} ; arrêtés contre la réserve : ${longBlocked.join(', ') || 'aucun'} ; réserve déplacée : ${moved.join(', ') || 'rien'}`);
      expect(stay).toEqual([]);
      expect(longBlocked).toEqual([]);
      expect(moved).toEqual([]);
      for (let i = 0; i < 160 && j.stage === 'route'; i++) t.step(5);
      const dest = j.destination!;
      console.log(`${k.site} : étape ${j.stage} ; joueur à ${Math.hypot(me.x - dest.x, me.z - dest.z).toFixed(0)} m du rassemblement`);
      expect(j.stage).toBe('sur_place');
      expect(Math.hypot(me.x - dest.x, me.z - dest.z)).toBeLessThan(150);
    }, 1500000);
  }
});
