// Commandement — placement du drone pour que sa caméra VOIE la foule (et pas les toits) : en mode libre, l'appareil se
// centre sur l'attroupement le plus dense près du point chaud, dans l'axe de la rue, sur une orbite serrée ; en mode
// « point », le sol du point désigné reste visible ; en mode « suivi », le groupe suivi reste dans le champ.
// Quartier d'essai : rue de la Fontaine (axe z = −160), immeubles de 20 à 30 m des deux côtés.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Vehicle } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { VehiclesExtApi } from '@/sim/vehicles/api';
import { spawnProtesters } from '@/sim/police/testkit';
import { startCommand } from '@/sim/police/command/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles];
const TAN25 = Math.tan((25 * Math.PI) / 180);

/** Ligne de vue 3D (comme la nacelle du retour vidéo) : échantillons tous les 2 m, sous un toit = masqué. */
function seen(ctx: GameContext, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const w = ctx.world;
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(2, Math.ceil(d / 2));
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const y = ay + (by - ay) * t;
    const roof = w.buildingHeightAt(x, z);
    if (roof > 0 && w.heightAt(x, z) + roof > y) return false;
  }
  return true;
}

function visibleCount(ctx: GameContext, v: Vehicle, list: readonly Person[]): number {
  let c = 0;
  for (const p of list) if (seen(ctx, v.x, v.y - 0.35, v.z, p.x, p.y + 1.2, p.z)) c++;
  return c;
}

function centroid(list: readonly Person[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const p of list) {
    x += p.x;
    z += p.z;
  }
  return { x: x / list.length, z: z / list.length };
}

describe('drone : placement pour voir la foule', () => {
  it('mode libre : au-dessus de l’attroupement dans la rue, pas au-dessus du point chaud derrière les immeubles', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: -80, z: -160 }, { seed: 14, dt: 1 / 30 });
    const { ctx } = t;
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    // la foule stationne dans la rue de la Fontaine (axe z = −160), immeubles des deux côtés
    const foule = spawnProtesters(ctx, 40, -80, -160, Math.PI / 2, 'pacifique', 1.3, 8);
    for (const p of foule) p.brain = { tag: 'test.foule' };
    // façades : la rue est bien encaissée
    expect(ctx.world.buildingHeightAt(-80, -150)).toBeGreaterThan(15);
    expect(ctx.world.buildingHeightAt(-80, -171)).toBeGreaterThan(15);
    // point chaud connu à 60 m, dans la cour de l'îlot voisin : vu de 60 m au-dessus de lui, la rue est masquée
    const hot = { x: -80, z: -100 };
    t.command.pic.note('casse', hot.x, hot.z, 1, true);
    const team = t.api.createDroneTeam({ x: -60, z: -15, heading: Math.PI });
    const pilot = team.leader!;
    t.step(4);
    const drone = ext.droneOf(pilot.id)!;
    expect(drone).not.toBeNull();
    t.run(30, 1, (e) => {
      if (e % 10 === 0) t.command.pic.note('casse', hot.x, hot.z, 0.5, true);
    });
    const c = centroid(foule);
    let ok = 0;
    let n = 0;
    let worstRatio = 0;
    let minSeen = Infinity;
    t.run(120, 1, (e) => {
      if (e % 10 === 0) t.command.pic.note('casse', hot.x, hot.z, 0.5, true);
      const alt = ext.flightStatus(drone)!.altitude;
      const vis = visibleCount(ctx, drone, foule);
      const d = Math.hypot(drone.x - c.x, drone.z - c.z);
      n++;
      if (vis >= 20 && d < alt * TAN25) ok++;
      worstRatio = Math.max(worstRatio, d / (alt * TAN25));
      minSeen = Math.min(minSeen, vis);
    });
    console.log('drone libre :', ok, '/', n, 'échantillons bons ; pire distance / (alt·tan25°)', worstRatio.toFixed(2), '; min vus', minSeen,
      '; position', drone.x.toFixed(0), drone.z.toFixed(0), 'alt', ext.flightStatus(drone)!.altitude.toFixed(0));
    expect(ok / n).toBeGreaterThanOrEqual(0.9);
    // le compte rendu d'observation voit bien la foule
    const obs = t.api.observations.filter((o) => o.count >= 20);
    expect(obs.length).toBeGreaterThan(0);
  }, 300000);

  it('mode libre : suit l’attroupement qui marche dans la rue, sans à-coups', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: -80, z: -160 }, { seed: 15, dt: 1 / 30 });
    const { ctx } = t;
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    const foule = spawnProtesters(ctx, 30, -120, -160, Math.PI / 2, 'pacifique', 1.3, 6);
    for (const p of foule) p.brain = { tag: 'test.foule' };
    const hot = { x: -80, z: -100 };
    t.command.pic.note('casse', hot.x, hot.z, 1, true);
    const team = t.api.createDroneTeam({ x: -60, z: -15, heading: Math.PI });
    t.step(4);
    const drone = ext.droneOf(team.leader!.id)!;
    t.run(30, 1, (e) => {
      if (e % 10 === 0) t.command.pic.note('casse', hot.x, hot.z, 0.5, true);
    });
    let ok = 0;
    let n = 0;
    t.run(60, 0.5, (e) => {
      if (e % 10 === 0) t.command.pic.note('casse', hot.x, hot.z, 0.5, true);
      for (const p of foule) {
        p.cmd.moveX = 1;
        p.cmd.moveZ = 0;
        p.cmd.gait = 0;
        p.cmd.faceMove = true;
      }
      if (e < 5) return;
      const c = centroid(foule);
      const alt = ext.flightStatus(drone)!.altitude;
      n++;
      if (visibleCount(ctx, drone, foule) >= 15 && Math.hypot(drone.x - c.x, drone.z - c.z) < alt * TAN25) ok++;
    });
    const c = centroid(foule);
    console.log('drone libre, foule en marche :', ok, '/', n, '; foule à', c.x.toFixed(0), c.z.toFixed(0));
    expect(c.x).toBeGreaterThan(-90);
    expect(ok / n).toBeGreaterThanOrEqual(0.9);
  }, 300000);

  it('mode point : le sol du point désigné dans la rue reste visible', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: -80, z: -160 }, { seed: 16, dt: 1 / 30 });
    const { ctx } = t;
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    const team = t.api.createDroneTeam({ x: -60, z: -15, heading: Math.PI });
    t.step(4);
    const drone = ext.droneOf(team.leader!.id)!;
    ctx.squads.issue(team.squad.id, { type: 'avancer', x: -40, z: -160 });
    t.step(40);
    let ok = 0;
    let n = 0;
    t.run(60, 1, () => {
      const g = ctx.world.heightAt(-40, -160);
      n++;
      // l'axe de la rue et les deux trottoirs (la rue fait 12 m entre des façades de 12 et 22 m)
      if ([-160, -163, -157].every((z) => seen(ctx, drone.x, drone.y - 0.35, drone.z, -40, g + 0.5, z))) ok++;
    });
    console.log('drone point :', ok, '/', n);
    expect(ok / n).toBeGreaterThanOrEqual(0.9);
  }, 300000);

  it('mode suivi : le groupe suivi qui marche dans la rue reste dans le champ', async () => {
    const t = await startCommand(MODULES, { mode: 'test', x: -80, z: -160 }, { seed: 17, dt: 1 / 30 });
    const { ctx } = t;
    const ext = ctx.require<VehiclesExtApi>('vehicles.ext');
    const groupe = spawnProtesters(ctx, 8, -130, -160, Math.PI / 2, 'radical', 1.2, 4);
    for (const p of groupe) p.brain = { tag: 'test.groupe' };
    const team = t.api.createDroneTeam({ x: -60, z: -15, heading: Math.PI });
    t.step(4);
    const drone = ext.droneOf(team.leader!.id)!;
    ctx.squads.issue(team.squad.id, { type: 'suivre', targetId: groupe[0].id });
    t.step(25);
    let ok = 0;
    let n = 0;
    t.run(60, 0.5, () => {
      for (const p of groupe) {
        p.cmd.moveX = 1;
        p.cmd.moveZ = 0;
        p.cmd.gait = 0;
        p.cmd.faceMove = true;
      }
      n++;
      if (visibleCount(ctx, drone, groupe) >= 6) ok++;
    });
    console.log('drone suivi :', ok, '/', n, '; groupe à', groupe[0].x.toFixed(0), groupe[0].z.toFixed(0));
    expect(groupe[0].x).toBeGreaterThan(-90);
    expect(ok / n).toBeGreaterThanOrEqual(0.9);
  }, 300000);
});
