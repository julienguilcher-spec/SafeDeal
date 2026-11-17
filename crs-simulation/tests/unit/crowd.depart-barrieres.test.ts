// Départ d'un manifestant par une rue fermée à la circulation : une rangée de barrières Vauban barre la chaussée
// (pas les trottoirs). La personne qui s'en va passe par le bout de la rangée et poursuit vers son issue. (Elle
// restait plantée contre les barrières, puis renonçait à cette direction et choisissait une autre issue — au sortir
// d'une nasse filtrée, une issue de l'autre côté de la nasse : elle repassait la porte et refaisait la queue ; dans
// integration.convergence-nasse, la moitié des nassés n'étaient toujours pas sortis au bout d'un quart d'heure.)
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
/** Avenue Victoria, à l'ouest de l'esplanade de l'Hôtel-de-Ville : milieu de la chaussée et axe de la rue (vers l'ouest). */
const C = { x: 2146.7, z: 964.1 };
const H = -1.97;

describe('départ par une rue fermée de barrières Vauban', () => {
  it.each([3, 7, 11])('graine %i : la personne contourne la rangée par le trottoir et garde son issue', async (seed) => {
    const t = createTestContext({ seed, strict: false, modules: SIM });
    const { ctx } = t;
    await t.start({
      mode: 'libre', role: 'journaliste', place: "Place de l'Hôtel-de-Ville - Esplanade de la Libération", x: 2219, z: 994, crowdSize: 40,
      tension: 0.1, volatility: 0.1, duration: 'courte',
      extra: { foyers: 0, 'crowd.noAleas': true, 'crowd.static': true, 'crowd.present': 1, 'crowd.bystanders': 0, 'traffic.vehicles': 0, 'traffic.pedestrians': 0 },
    } as Partial<SessionConfig>);
    t.step(5);
    const me = ctx.player.person();
    if (me) {
      me.x = C.x + 60;
      me.z = C.z - 60;
    }
    const api = ctx.require<CrowdCoreApi>(CROWD_CORE);
    const core = (t.game.systems as unknown as { id: string; core?: CrowdCore }[]).find((s) => s.id === 'sim:crowd.evacuation')!.core!;
    const fx = Math.sin(H);
    const fz = Math.cos(H);
    // rangée de cinq barrières en travers de la chaussée (12 m), comme la pose une fermeture de rue
    for (let i = -2; i <= 2; i++) ctx.props.spawn('barriere_vauban', C.x - fz * i * 2.4, C.z + fx * i * 2.4, H);
    // issue loin à l'ouest, de l'autre côté de la rangée
    const exit = core.nav.exits.length;
    core.nav.exits.push({ index: exit, kind: 'rue', x: C.x + fx * 150, z: C.z + fz * 150, stationId: 0, open: true });
    // trois personnes à l'est de la rangée, dans l'axe de la chaussée, qui s'en vont par cette issue
    const leavers = api.members.slice(0, 3);
    expect(leavers.length).toBe(3);
    leavers.forEach((p, k) => {
      p.x = C.x - fx * (6 + k) - fz * (k - 1) * 0.8;
      p.z = C.z - fz * (6 + k) + fx * (k - 1) * 0.8;
      p.vx = 0;
      p.vz = 0;
      const b = api.brain(p)!;
      b.group = -1;
      core.behavior.startLeaving(p, b, exit);
    });
    const along = (x: number, z: number): number => (x - C.x) * fx + (z - C.z) * fz;
    let passed = 0;
    for (let s = 0; s < 60 && passed < leavers.length; s++) {
      t.step(1);
      passed = leavers.filter((p) => !ctx.people.get(p.id) || along(p.x, p.z) > 3).length;
    }
    for (const p of leavers) {
      const b = api.brain(p);
      console.log(`[barrières ${seed}] ${p.id} à ${along(p.x, p.z).toFixed(1)} m de la rangée (lat ${((p.x - C.x) * -fz + (p.z - C.z) * fx).toFixed(1)}, état ${b ? b.state : '-'}, chemin ${b && b.path ? b.path.slice(b.pathI * 2, b.pathI * 2 + 2).map((v, j) => (j === 0 ? ((v - C.x)) : (v - C.z)).toFixed(1)) : 'aucun'}), issue ${b ? b.exit : 'partie'} (voulue ${exit})`);
    }
    expect(passed).toBe(leavers.length);
    for (const p of leavers) {
      const b = api.brain(p);
      if (b) expect(b.exit).toBe(exit);
    }
  }, 120000);
});
