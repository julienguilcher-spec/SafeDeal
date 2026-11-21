// Départ en colonne (police/command/convoy.ts, embarquement préalable) : l'ordre de départ — la tête est le véhicule le
// plus avancé vers la sortie — doit être calculé sur l'itinéraire que la colonne roule VRAIMENT. Le pilote automatique
// contourne la foule (zones de manifestants) et part dans le sens où les véhicules sont tournés ; l'ordre de départ était
// calculé sur le plus court chemin brut. Quand la foule fait partir la colonne de l'autre côté, la tête désignée était le
// véhicule de queue : il butait contre ceux qui le précédaient, qui le suivaient eux-mêmes — colonne figée au départ
// (journée de service : 8e → Concorde, 3e → Concorde).
import { describe, expect, it } from 'vitest';

import type { RoadSample, Vehicle } from '@/core/contracts';
import { pointOnPolyline } from '@/core/math';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { POLICE_UNITS_SERVICE } from '@/sim/police/api';
import type { PoliceUnitsApi } from '@/sim/police/api';

interface Ap {
  status(v: Vehicle): { mode: string; state: string; leaderId: number };
  plannedPath?(v: Vehicle, out: number[]): boolean;
}

describe('colonne : ordre de départ sur l’itinéraire réellement roulé', () => {
  it('la foule fait partir la colonne en arrière : la tête est le véhicule le plus avancé de CE côté', async () => {
    const t = createTestContext({ seed: 11, strict: false, modules: [world, roles, people, vehicles, police] });
    await t.start({ mode: 'libre', role: 'journaliste', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { 'crowd.none': true } } as never);
    const { ctx } = t;
    // une rue à double sens, droite sur une centaine de mètres, à l'écart de la Concorde
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false } as RoadSample;
    const probe = { ...road };
    let found = false;
    for (let k = 0; k < 900 && !found; k++) {
      const px = -900 + (k % 30) * 60, pz = -900 + Math.floor(k / 30) * 60;
      if (!ctx.world.nearestRoad(px, pz, road, 10) || road.oneway || road.width < 9) continue;
      // tout droit 70 m de part et d'autre (même rue, même cap)
      found = [-70, -35, 35, 70].every((d) => ctx.world.nearestRoad(road.x + Math.sin(road.heading) * d, road.z + Math.cos(road.heading) * d, probe, 3)
        && Math.abs(Math.sin(probe.heading - road.heading)) < 0.08 && !probe.oneway);
    }
    expect(found).toBe(true);
    const h = road.heading;
    const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const units = ctx.service<PoliceUnitsApi>(POLICE_UNITS_SERVICE)!;
    const sec = units.createSection({ x: road.x + rx * 6, z: road.z + rz * 6, heading: h, vehicles: true, drivers: true, layout: 'embarque' });
    const vans = sec.vehicles.filter((v) => v.kind === 'fourgon_crs');
    expect(vans.length).toBeGreaterThanOrEqual(3);
    // les véhicules de la section en file sur la voie de droite, nez dans le sens de la rue, 9 m de l'un à l'autre
    sec.vehicles.forEach((v, i) => {
      const d = -i * 9;
      v.x = road.x + fx * d + rx * 2;
      v.z = road.z + fz * d + rz * 2;
      v.heading = h;
      v.vx = 0; v.vz = 0; v.speed = 0;
    });
    // destination : 250 m devant, dans l'axe ; le plus court chemin part DEVANT les véhicules
    expect(ctx.world.nearestRoad(road.x + fx * 250, road.z + fz * 250, probe, 40)).toBe(true);
    const dest = { x: probe.x, z: probe.z };
    // une manifestation massée devant la file, à 25–60 m : la colonne (qui la contourne) part de l'autre côté
    for (let i = 0; i < 40; i++) {
      const a = 25 + (i % 10) * 4, l = -4 + Math.floor(i / 10) * 2.5;
      ctx.people.spawn({ kind: 'civil', faction: 'protest', x: road.x + fx * a + rx * l, z: road.z + fz * a + rz * l } as never);
    }
    const crowd = ctx.people.list.filter((p) => p.faction === 'protest').map((p) => ({ p, x: p.x, z: p.z }));
    const cmd = ctx.service<{ arrive(id: number, d: { x: number; z: number; heading: number; boardFirst?: boolean; disembark?: boolean }): boolean }>('police.command')!;
    const ap = ctx.service<Ap>('vehicles.autopilot')!;
    expect(cmd.arrive(sec.squad.id, { x: dest.x, z: dest.z, heading: h, boardFirst: true, disembark: false })).toBe(true);
    // embarquement, puis départ : la tête est le seul véhicule en « drive »
    let head: Vehicle | undefined;
    for (let i = 0; i < 400 && !head; i++) {
      for (const q of crowd) { q.p.x = q.x; q.p.z = q.z; q.p.vx = 0; q.p.vz = 0; }
      t.step(0.5);
      head = sec.vehicles.find((v) => ap.status(v).mode === 'drive');
    }
    expect(head, 'la colonne part').toBeDefined();
    const route: number[] = [];
    expect(ap.plannedPath!(head!, route)).toBe(true);
    // l'itinéraire roulé part bien en arrière (la foule est devant)
    const p40 = { x: 0, z: 0 };
    pointOnPolyline(route, 40, p40);
    expect((p40.x - head!.x) * fx + (p40.z - head!.z) * fz).toBeLessThan(0);
    // la tête est le véhicule le plus proche de la sortie (le point de l'itinéraire roulé à 40 m)
    const dist = sec.vehicles.map((v) => ({ v, d: Math.hypot(v.x - p40.x, v.z - p40.z) }));
    const order = dist.map((a) => `${a.v.id}${a.v === head ? '*' : ''}:${a.d.toFixed(0)} m`).join(' ');
    console.log(`distance de chaque véhicule à la sortie (tête *) : ${order}`);
    expect(dist.find((a) => a.v === head)!.d, order).toBeLessThanOrEqual(Math.min(...dist.map((a) => a.d)) + 1);
  }, 300000);
});
