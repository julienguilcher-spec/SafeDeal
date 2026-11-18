// BRAV-M en mode libre, ordre « colonne » vers un point éloigné (République) : la colonne de motos va jusqu'au point,
// personne n'est laissé en chemin, et elle ne rend pas compte « En position » quand elle est arrêtée loin du point.
// Défauts d'origine :
//  - point à l'est de la place, hors de la zone jouable (voie du graphe qui déborde de la carte) : la tête s'arrêtait
//    contre le mur du bord de carte, à 130 m du point, et l'unité rendait compte « En position » ;
//  - une moto restée en arrière à l'arrivée (relancée une seule fois vers la tête) n'était plus jamais relancée si son
//    pilote automatique s'arrêtait : elle restait à des centaines de mètres de son unité.
import { describe, expect, it } from 'vitest';

import type { Vehicle } from '@/core/contracts';
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
import type { PoliceUnitsApi } from '@/sim/police/api';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];

interface Ap {
  status(v: Vehicle): { mode: string; state: string; reason: string };
  stop(v: Vehicle): void;
}

/** Unité de trois motos à pied près de République, ordre « colonne » vers le point à (dx, 0) par les rues. */
async function ride(dx: number) {
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.start({ mode: 'libre', role: 'manifestant', place: 'Place de la République', x: 3123, z: -208, crowdSize: 0, tension: 0, volatility: 0, duration: 'standard' });
  const { ctx } = t;
  const units = ctx.service<PoliceUnitsApi>('police.units')!;
  const road = { x: 0, z: 0, heading: 0 } as { x: number; z: number; heading: number };
  expect(ctx.world.nearestRoad(3123, -150, road as never, 200)).toBe(true);
  const h = units.createBravm(3, { x: road.x, z: road.z, heading: 0, vehicles: true, mounted: false });
  t.step(2);
  const motos = h.vehicles.map((r) => ctx.vehicles.get(r.id)!);
  const far = { x: 0, z: 0 } as { x: number; z: number };
  expect(ctx.world.nearestRoad(road.x + dx, road.z, far as never, 200)).toBe(true);
  ctx.squads.issue(h.squad.id, { type: 'colonne', x: far.x, z: far.z, issuedBy: h.squad.leaderId });
  const cmd = ctx.service<{ special(id: number): { stage: string } | null }>('police.command')!;
  const stage = (): string | undefined => cmd.special(h.squad.id)?.stage;
  let left = false;
  for (let i = 0; i < 120; i++) {
    t.step(5);
    if (stage() === 'route') left = true;
    if (left && stage() === 'repos') break;
  }
  t.step(3);
  return { t, ctx, motos, far, stage };
}

describe('BRAV-M : la colonne de motos va jusqu’au point', () => {
  it('point hors de la carte (bord est) : arrêtée au plus près, elle le dit — pas « En position » à 130 m', async () => {
    const { ctx, motos, far, stage } = await ride(700);
    // (le point demandé est au-delà du bord de la zone jouable)
    expect(ctx.world.surfaceAt(far.x, far.z)).toBe('void');
    const said = ctx.radio.log.map((l: { text: string }) => l.text).filter((x: string) => /En position|du point/.test(x));
    const d = motos.map((v) => Math.round(Math.hypot(v.x - far.x, v.z - far.z)));
    console.log(`  ${stage()} ; motos à ${d.join(' / ')} m du point ; ${said.join(' / ')}`);
    expect(said.length).toBeGreaterThan(0);
    if (Math.max(...d) > 60) {
      for (const x of said) expect(x).not.toMatch(/En position/);
      expect(said.join(' ')).toMatch(/mètres du point, accès bloqué/);
    }
  }, 600000);

  it('moto restée en arrière à l’arrivée, son pilote automatique arrêté : relancée jusqu’à son unité', async () => {
    const { t, ctx, motos, far, stage } = await ride(-600);
    const d0 = motos.map((v) => Math.round(Math.hypot(v.x - far.x, v.z - far.z)));
    console.log(`  ${stage()} ; motos à ${d0.join(' / ')} m du point`);
    expect(stage()).toBe('repos');
    for (const x of d0) expect(x).toBeLessThan(60);
    // la dernière moto est restée 350 m en arrière, sur la chaussée ; son pilote automatique s'est arrêté
    const ap = ctx.service<Ap>('vehicles.autopilot')!;
    const lag = motos[2]!;
    const back = { x: 0, z: 0, heading: 0 } as { x: number; z: number; heading: number };
    expect(ctx.world.nearestRoad(far.x + 350, far.z, back as never, 200)).toBe(true);
    lag.x = back.x;
    lag.z = back.z;
    lag.vx = 0;
    lag.vz = 0;
    lag.speed = 0;
    ap.stop(lag);
    t.step(2);
    const lead = motos[0]!;
    console.log(`  retardataire à ${Math.round(Math.hypot(lag.x - lead.x, lag.z - lead.z))} m de la tête`);
    for (let i = 0; i < 30 && Math.hypot(lag.x - lead.x, lag.z - lead.z) > 50; i++) t.step(5);
    const gap = Math.round(Math.hypot(lag.x - lead.x, lag.z - lead.z));
    console.log(`  après ${ctx.clock.now.toFixed(0)} s : retardataire à ${gap} m de la tête (${ap.status(lag).mode}/${ap.status(lag).state})`);
    expect(gap).toBeLessThan(50);
  }, 600000);
});
