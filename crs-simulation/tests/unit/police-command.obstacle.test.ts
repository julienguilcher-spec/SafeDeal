// Commandement — « Dégager l'obstacle » : le Centaure pousse hors de la voie un autobus qui la barre (quartier d'essai,
// modules réels) : il fait descendre le conducteur, attend que personne ne soit dans le couloir de poussée, pousse au
// pas, lame basse, et rend compte « voie dégagée » ; personne n'est blessé.
import { describe, expect, it } from 'vitest';
import type { RoadSample } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { PoliceOrderDone } from '@/sim/police/api';
import { startCommand } from '@/sim/police/command/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles];
const NORTH = Math.PI;

describe('Centaure : dégager l’obstacle', () => {
  it.each([
    { lat: 0, skew: 0, label: 'au milieu de la chaussée' },
    { lat: -0.5, skew: 0.5, label: 'en biais' },
    { lat: 1, skew: -0.4, label: 'en biais, de l’autre côté' },
  ])('autobus $label, conducteur à bord : il descend, l’engin pousse l’autobus hors de la voie et rend compte', async ({ lat: lat0, skew }) => {
    const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200 }, { seed: 10, dt: 1 / 30 });
    const { ctx } = t;
    const road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    expect(ctx.world.nearestRoad(0, 200, road, 20)).toBe(true);
    const half = road.width / 2;
    const crew = t.units.createEquipage('centaure', { x: road.x, z: 262, heading: NORTH });
    const v = crew.vehicles[0]!;
    // l'autobus, au milieu de la chaussée, conducteur au volant
    const bus = ctx.vehicles.spawn('bus', road.x + lat0, 205, NORTH + skew);
    const driver = ctx.people.spawn({ kind: 'conducteur', x: bus.x, z: bus.z });
    expect(ctx.vehicles.enter(driver, bus, 'driver')).toBe(true);
    const radio: string[] = [];
    ctx.events.on('radio:message', (e) => radio.push(e.msg.from + ' > ' + e.msg.text));
    let done: PoliceOrderDone | null = null;
    ctx.events.onAny('police:order_done', (d) => {
      const e = d as PoliceOrderDone;
      if (e.squadId === crew.squad.id) done = { ...e };
    });
    let hurt = 0;
    ctx.events.on('person:hurt', () => hurt++);
    t.step(1);
    ctx.squads.issue(crew.squad.id, { type: 'degager_obstacle', x: bus.x, z: bus.z });
    const stages: string[] = [];
    let last = '';
    let pushedOccupied = false;
    t.run(150, 0.25, () => {
      const st = t.api.special(crew.squad.id)!;
      if (last !== st.stage) {
        last = st.stage;
        stages.push(st.stage + '@' + ctx.clock.now.toFixed(0));
      }
      if (st.stage === 'obstacle_poussee' && bus.seats.some((s) => s !== 0)) pushedOccupied = true;
      // le conducteur descendu gagne le trottoir le plus proche puis s'éloigne vers l'arrière de l'autobus
      if (driver.vehicleId === 0) {
        const side = driver.x >= road.x ? 1 : -1;
        const out = Math.abs(driver.x - road.x) < half + 1.5;
        driver.cmd.moveX = out ? side : 0;
        driver.cmd.moveZ = out ? 0 : driver.z < 240 ? 1 : 0;
        driver.cmd.gait = 1;
      }
      return done !== null;
    });
    // couloir rendu à la circulation
    const lat = (bus.x - road.x);
    const ext = 0.5 * (bus.def.length * Math.abs(Math.sin(bus.heading)) + bus.def.width * Math.abs(Math.cos(bus.heading)));
    const corridor = Math.max(lat - ext + half, half - (lat + ext));
    console.log(`Centaure, autobus : étapes ${stages.join(' ')} | résultat ${JSON.stringify(done)} | autobus en (${bus.x.toFixed(1)}, ${bus.z.toFixed(1)}) cap ${bus.heading.toFixed(2)}, couloir ${corridor.toFixed(1)} m (chaussée ${road.width.toFixed(1)} m) | engin en (${v.x.toFixed(1)}, ${v.z.toFixed(1)})\n${radio.filter((r) => r.includes('CENTAURE') || r.includes('Centaure') || r.includes(crew.squad.name)).join('\n')}`);
    expect(done).not.toBeNull();
    expect(done!.ok).toBe(true);
    expect(driver.vehicleId).toBe(0);
    expect(pushedOccupied).toBe(false);
    expect(corridor).toBeGreaterThanOrEqual(3.2);
    expect(radio.some((r) => r.includes('Voie dégagée'))).toBe(true);
    expect(hurt).toBe(0);
    expect(driver.health).toBeGreaterThan(95);
  }, 300000);
});
