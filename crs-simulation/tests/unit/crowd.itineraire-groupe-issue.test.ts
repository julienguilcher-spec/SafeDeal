// Itinéraire partagé par un groupe qui s'en va : il n'est repris que s'il mène bien à l'issue du partant. L'issue du
// groupe est réaffectée sans son itinéraire (sortie filtrée d'une nasse : evacuation.letOut ; issues renouvelées
// d'un cortège : manifs.refreshExits ; autre issue choisie par un membre bloqué : nav.chooseExit). L'itinéraire resté
// en mémoire menait ailleurs : un nassé contrôlé et sorti par la porte filtrée repartait vers l'issue d'un départ
// manqué, de l'autre côté de la nasse — il repassait la porte en sens inverse et refaisait la queue.
import { describe, expect, it } from 'vitest';

import type { SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd, CROWD_CORE } from '@/sim/crowd';
import type { CrowdCoreApi } from '@/sim/crowd';
import type { CrowdCore } from '@/sim/crowd/core';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';

const SIM = [world, roles, people, vehicles, crowd, items, props, hazards, traffic, law, radio];
const S = { x: 2219, z: 994 };

describe('itinéraire de groupe vers une issue', () => {
  it('un partant ne reprend pas l’itinéraire du groupe quand celui-ci mène à une autre issue', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    const { ctx } = t;
    await t.start({
      mode: 'libre', role: 'journaliste', place: "Place de l'Hôtel-de-Ville - Esplanade de la Libération", x: S.x, z: S.z, crowdSize: 40,
      tension: 0.1, volatility: 0.1, duration: 'courte',
      extra: { foyers: 0, 'crowd.noAleas': true, 'crowd.static': true, 'crowd.present': 1, 'crowd.bystanders': 0, 'traffic.vehicles': 0, 'traffic.pedestrians': 0 },
    } as Partial<SessionConfig>);
    t.step(5);
    const api = ctx.require<CrowdCoreApi>(CROWD_CORE);
    const core = (t.game.systems as unknown as { id: string; core?: CrowdCore }[]).find((s) => s.id === 'sim:crowd.evacuation')!.core!;
    const p = api.members.find((q) => { const b = api.brain(q); return b !== null && b.group >= 0; })!;
    expect(p).toBeDefined();
    const b = api.brain(p)!;
    const g = core.groups[b.group]!;
    // deux issues : celle où le groupe allait (à l'est), celle qu'on lui réaffecte (à l'ouest, Avenue Victoria)
    const east = core.nav.exits.length;
    core.nav.exits.push({ index: east, kind: 'rue', x: S.x + 200, z: S.z, stationId: 0, open: true });
    const west = east + 1;
    core.nav.exits.push({ index: west, kind: 'rue', x: 2146.7 - 0.92 * 150, z: 964.1 - 0.39 * 150, stationId: 0, open: true });
    // itinéraire du groupe calculé vers l'issue est, puis issue du groupe réaffectée à l'ouest (sans son itinéraire)
    g.path = [S.x + 60, S.z, S.x + 140, S.z, S.x + 200, S.z];
    g.exit = west;
    g.leaveAt = Infinity;
    core.behavior.startLeaving(p, b, west);
    expect(b.exit).toBe(west);
    t.step(1);
    const path = b.path;
    const e = core.nav.exits[west]!;
    const end = path && path.length >= 2 ? Math.hypot(path[path.length - 2]! - e.x, path[path.length - 1]! - e.z) : 0;
    console.log(`[itinéraire] ${path ? path.length / 2 : 0} sommets, fin à ${end.toFixed(1)} m de l'issue voulue`);
    // l'itinéraire suivi mène à l'issue voulue (ou la ligne droite, sans itinéraire), pas à l'est
    expect(path === null || end < 8).toBe(true);
  }, 120000);
});
