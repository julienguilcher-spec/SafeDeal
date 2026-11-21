// Circulation et stationnement réservé des commissariats (vraie carte de Paris, sans le module des commissariats) :
// aucune voiture civile n'est garée sur une place réservée d'un commissariat (règle de la voirie, indépendante du
// stock), et ailleurs le stationnement ne change pas : toutes les voitures garées loin des places le restent, au même
// endroit, et aucune n'apparaît en plus (une place réservée compte dans le plafond comme une place garnie : la
// circulation du reste de la ville est la même avec ou sans commissariats) ; en tout, la ville ne perd que les places
// réservées.
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { TRAFFIC_SERVICE } from '@/sim/traffic/api';
import type { TrafficApi } from '@/sim/traffic/api';
import { Parking } from '@/sim/traffic/parking';
import { COMMISSARIATS, reservedBays } from '@/world/commissariats';
import { slotsOverlap } from '@/world/commissariats/layout';

const SIM = [world, roles, people, vehicles, traffic];

/** Sites dont les places sont sur une rue où la circulation gare des voitures (devant la porte ou au coin). */
const SITES = ['9e', '8e', 'cite', 'celestins', '3e', '1er', '7e'];

interface Parked {
  readonly id: number;
  readonly kind: string;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly len: number;
  readonly width: number;
}

/** Voitures garées par la circulation, une fois le voisinage du joueur garni (lieu = un commissariat). */
async function parkedAround(siteId: string, seed: number): Promise<Parked[]> {
  const def = COMMISSARIATS.find((c) => c.id === siteId)!;
  // le joueur au milieu des places réservées (elles sont parfois au coin de la rue, loin de la porte)
  let x = 0;
  let z = 0;
  for (const s of def.slots) { x += s.x; z += s.z; }
  x /= def.slots.length;
  z /= def.slots.length;
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start({ mode: 'libre', role: 'crs', place: def.name, x, z, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard' } as never);
  t.step(3);
  const api = t.ctx.require<TrafficApi>(TRAFFIC_SERVICE);
  return t.ctx.vehicles.list.filter((v: Vehicle) => api.isParked(v))
    .map((v) => ({ id: v.id, kind: v.kind, x: v.x, z: v.z, heading: v.heading, len: v.def.length, width: v.def.width }));
}

/** Distance du point à la place réservée la plus proche. */
function nearestBay(x: number, z: number): number {
  let best = Infinity;
  for (const b of reservedBays()) best = Math.min(best, Math.hypot(b.x - x, b.z - z));
  return best;
}

describe('circulation — stationnement réservé des commissariats', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aucune voiture civile garée ne déborde sur une place réservée ; ailleurs, le stationnement est inchangé (±3 %)', async () => {
    let totalWith = 0;
    let totalWithout = 0;
    let dropped = 0;
    let farWith = 0;
    let farWithout = 0;
    for (const id of SITES) {
      const seed = 11;
      const withRule = await parkedAround(id, seed);
      // même partie, sans la règle (référence) : on neutralise le seul test ajouté
      const spy = vi.spyOn(Parking.prototype, 'isReserved').mockReturnValue(false);
      const without = await parkedAround(id, seed);
      spy.mockRestore();

      // aucune voiture garée n'empiète sur une place réservée (emprise des deux véhicules)
      for (const p of withRule) {
        for (const b of reservedBays()) {
          if (Math.hypot(b.x - p.x, b.z - p.z) > 15) continue;
          const over = slotsOverlap({ x: p.x, z: p.z, heading: p.heading, len: p.len, width: p.width }, b, 0);
          if (over) console.log(`${id} : voiture garée ${p.kind} n° ${p.id} sur une place réservée (${b.x}, ${b.z})`);
          expect(over).toBe(false);
        }
        expect(nearestBay(p.x, p.z)).toBeGreaterThanOrEqual(6);
      }
      // sans la règle, des voitures se garaient bien sur ces places (sinon l'essai ne prouverait rien)
      const onBays = without.filter((p) => nearestBay(p.x, p.z) < 6).length;
      // « ailleurs » : à plus de 30 m de toute place réservée
      const farW = withRule.filter((p) => nearestBay(p.x, p.z) > 30);
      const farO = without.filter((p) => nearestBay(p.x, p.z) > 30);
      const fw = farW.length;
      const fo = farO.length;
      // ailleurs, rien n'est retiré ni déplacé : chaque voiture garée de la référence est encore là
      const lost = farO.filter((o) => !farW.some((p) => p.kind === o.kind && Math.hypot(p.x - o.x, p.z - o.z) < 0.1));
      expect(lost.length).toBe(0);
      // ni voiture en plus : les places réservées comptent dans le plafond comme des places garnies
      expect(fw).toBe(fo);
      console.log(`${id} : ${withRule.length} voitures garées (sans la règle ${without.length}, dont ${onBays} sur les places réservées) ; à plus de 30 m des places : ${fw} contre ${fo}`);
      totalWith += withRule.length;
      totalWithout += without.length;
      dropped += onBays;
      farWith += fw;
      farWithout += fo;
    }
    const pct = (totalWith / Math.max(1, totalWithout) - 1) * 100;
    console.log(`total : ${totalWith} voitures garées avec la règle, ${totalWithout} sans (${pct.toFixed(1)} %) ; ${dropped} places réservées libérées ; ailleurs ${farWith} contre ${farWithout} (${((farWith / Math.max(1, farWithout) - 1) * 100).toFixed(1)} %)`);
    expect(dropped).toBeGreaterThan(0);
    // en tout, le stationnement de la ville ne perd que les places réservées ; ailleurs, rien ne change (±3 % au plus)
    expect(totalWithout - totalWith).toBeLessThanOrEqual(dropped);
    expect(Math.abs((farWith / Math.max(1, farWithout) - 1) * 100)).toBeLessThan(3);
  }, 900000);
});
