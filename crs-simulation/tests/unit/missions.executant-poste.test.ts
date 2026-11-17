// L'exécutant tient l'objectif de SA mission : crs-02 (gardien stagiaire), « Tenir sa place dans la ligne » se mesure
// boulevard Saint-Martin. Relevé de la recette : la carte « Ma mission » montrait ce point, puis « Rejoignez votre
// groupe » 250 à 330 m plus loin — le commandant IA avait confié au groupe du joueur un débouché du dispositif — et le
// nombre d'agents au point tombait à 0 : le joueur qui suivait son chef ne pouvait pas réussir. Le groupe est désormais
// posté sur l'objectif et retenu hors du dispositif de l'IA (CommandApi.pin) ; les autres groupes manœuvrent toujours.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, Person, SessionConfig } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as env } from '@/env';
import { createWorldQuerySystems } from '@/world/query';
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
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as missions, missionById, missionConfig } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';
import { MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import { createObjectives } from '@/ui/core/objectives';
const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, missions, objectives];
function walk(ctx: GameContext, me: Person, x: number, z: number, dist: number, path: number[]): boolean {
  if (me.vehicleId !== 0) return true;
  if (Math.hypot(x - me.x, z - me.z) < 2) return true;
  path.length = 0;
  if (!ctx.world.findPath(me.x, me.z, x, z, 'foot', path) || path.length < 4) return false;
  let left = dist;
  for (let i = 2; i < path.length && left > 0; i += 2) {
    const dx = path[i]! - me.x, dz = path[i + 1]! - me.z;
    const l = Math.hypot(dx, dz);
    if (l <= left) { me.x = path[i]!; me.z = path[i + 1]!; left -= l; } else { me.x += (dx / l) * left; me.z += (dz / l) * left; left = 0; }
  }
  return true;
}
describe('exécutant : son groupe tient l\'objectif de sa mission', () => {
  it('crs-02 : le groupe reste au point de « Tenir sa place dans la ligne », la carte n\'emmène pas ailleurs', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.ready;
    const { ctx } = t;
    const def = missionById('crs-02-pluie-de-paves')!;
    const cfg = missionConfig(def, ctx.world) as SessionConfig;
    cfg.mode = 'carriere';
    await t.start(cfg);
    const m = ctx.service<MissionsApi>('missions')!;
    const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
    const path: number[] = [];
    let far = 0, worstOrder = 0, emptyAfter60 = 0;
    for (let s = 0; s < 240; s++) {
      t.step(1);
      const me = ctx.player.person()!;
      if (brief.active && brief.instruction.x !== undefined) walk(ctx, me, brief.instruction.x, brief.instruction.z!, 4, path);
      const o1 = m.objectives.find((r) => r.def.id === 'o1')!;
      if (!o1.at) continue;
      if (brief.instruction.x !== undefined && Math.hypot(brief.instruction.x - o1.at.x, brief.instruction.z! - o1.at.z) > 60) far++;
      const sq = ctx.squads.get(me.squadId);
      if (sq?.order) worstOrder = Math.max(worstOrder, Math.hypot(sq.order.x - o1.at.x, sq.order.z - o1.at.z));
      const n = ctx.people.countIn(o1.at.x, o1.at.z, 40, (q) => q.faction === 'police' && q.posture !== 'down');
      if (s > 60 && n < 3) emptyAfter60++;
    }
    const o1 = m.objectives.find((r) => r.def.id === 'o1')!;
    console.log(`crs-02 : consigne loin de l'objectif ${far} s ; ordre du groupe à ${worstOrder.toFixed(0)} m au pire ; point vide ${emptyAfter60} s ; o1 ${Math.round(o1.progress * 100)} %`);
    expect(worstOrder, 'ordre du groupe loin de l\'objectif').toBeLessThan(40);
    expect(far, 'la carte « Ma mission » emmène ailleurs').toBe(0);
    expect(emptyAfter60, 'point de l\'objectif sans agents').toBeLessThan(10);
    expect(o1.progress).toBeGreaterThan(0.3);
  }, 900000);
});
