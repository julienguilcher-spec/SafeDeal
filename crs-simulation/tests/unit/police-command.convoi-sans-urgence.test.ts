// Commandement — convoi sans urgence (retour au commissariat) : la colonne roule sans deux tons ni gyrophares, et une
// voiture civile arrêtée devant elle n'est pas retirée de la chaussée (la colonne attend ou la contourne, comme tout
// le monde). Par défaut (urgence), deux tons pendant le trajet : comportement inchangé. Quartier d'essai, modules réels.
import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { ConvoyEvent } from '@/sim/police/command/api';
import { startCommand } from '@/sim/police/command/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles];
const WEST = -Math.PI / 2;

interface Run {
  stages: string[];
  /** Relevés pendant l'étape 'route' : véhicules de la colonne en mouvement, dont sirène en marche. */
  moving: number;
  siren: number;
  beacons: number;
  /** La voiture civile arrêtée sur l'itinéraire existe-t-elle encore ? */
  civilKept: boolean;
  civilBlocked: number;
  final: string;
}

async function run(urgence: boolean | undefined): Promise<Run> {
  const t = await startCommand(MODULES, { mode: 'test', x: 150, z: 289.5 }, { seed: 21, dt: 1 / 30 });
  const { ctx } = t;
  t.api.tuning.autoAssume = false;
  // une section embarquée (trois fourgons) à 250 m du point de stationnement, gyrophares et sirène allumés d'une
  // intervention précédente
  const sec = t.units.createSection({ x: 400, z: 289.5, heading: WEST, section: 1, vehicles: true, drivers: true, layout: 'embarque' });
  for (const v of sec.vehicles) {
    v.siren = 1;
    v.beacons = true;
  }
  // une voiture civile arrêtée dans la voie, sur l'itinéraire, à 90 m devant la colonne
  const civil = ctx.vehicles.spawn('utilitaire', 300, 289.5, WEST, { faction: 'civil' });
  civil.cmd.brake = 1;
  civil.cmd.handbrake = true;
  const stages: string[] = [];
  ctx.events.onAny('command:convoy', (d) => {
    const e = d as ConvoyEvent;
    if (e.squadId === sec.squad.id) stages.push(e.stage);
  });
  t.step(1);
  const dest = { x: 150, z: 289.5, heading: WEST, layout: 'file' as const, boardFirst: true, stagger: true, disembark: false, ...(urgence === undefined ? {} : { urgence }) };
  expect(t.api.arrive(sec.squad.id, dest)).toBe(true);
  let moving = 0, siren = 0, beacons = 0, civilBlocked = 0;
  t.run(420, 0.5, () => {
    const st = t.api.convoyOf(sec.squad.id)!;
    if (st.stage === 'route') {
      for (const v of sec.vehicles as Vehicle[]) {
        if (Math.abs(v.speed) < 1) continue;
        moving++;
        if (v.siren !== 0) siren++;
        if (v.beacons) beacons++;
      }
      if (ctx.vehicles.get(civil.id)) civilBlocked++;
    }
    return st.stage === 'en_place' || st.stage === 'echec';
  });
  const st = t.api.convoyOf(sec.squad.id)!;
  const out: Run = { stages, moving, siren, beacons, civilKept: ctx.vehicles.get(civil.id) !== undefined, civilBlocked, final: st.stage };
  const lead = sec.vehicles.reduce((a, b) => (a.x < b.x ? a : b));
  console.log(`urgence ${String(urgence)} : étapes ${stages.join(' ')} | relevés en mouvement ${moving}, sirène ${siren}, gyrophares ${beacons} | voiture civile ${out.civilKept ? 'toujours là' : 'retirée'} | tête à x ${lead.x.toFixed(0)}`);
  return out;
}

describe('convoi sans urgence', () => {
  it('urgence false : ni sirène ni gyrophares en route, la voiture civile arrêtée n’est pas retirée, la colonne arrive', async () => {
    const r = await run(false);
    expect(r.moving).toBeGreaterThan(20);
    expect(r.siren).toBe(0);
    expect(r.beacons).toBe(0);
    expect(r.civilKept).toBe(true);
    expect(r.final).toBe('en_place');
  }, 600000);

  it('par défaut : deux tons pendant le trajet (comportement inchangé)', async () => {
    const r = await run(undefined);
    expect(r.moving).toBeGreaterThan(20);
    expect(r.siren / r.moving).toBeGreaterThan(0.8);
    expect(r.final).toBe('en_place');
  }, 600000);
});
