// Matériel — déterminisme : même graine et mêmes commandes → mêmes trajectoires, mêmes impacts, mêmes dégâts.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/sim/items';
import { createHazardRecorder, face, spawn } from '@/sim/items/testkit';

/** Joue une scène scriptée d'une minute et retourne sa trace complète. */
async function run(seed: number, dt = 1 / 30): Promise<string[]> {
  const t = createTestContext({ seed, modules: [createSystems] });
  await t.start();
  const { ctx } = t;
  const hz = createHazardRecorder(ctx);
  ctx.hazards = hz.api;
  ctx.env.setWind(2, -1);
  const trace: string[] = [];
  const f = (n: number): string => n.toFixed(4);
  ctx.events.on('projectile:impact', (e) => void trace.push(`impact ${e.kind} ${f(e.x)} ${f(e.y)} ${f(e.z)} ${e.hitKind} ${e.hitId} @${f(ctx.clock.now)}`));
  ctx.events.on('explosion', (e) => void trace.push(`explosion ${e.kind} ${f(e.x)} ${f(e.y)} ${f(e.z)} @${f(ctx.clock.now)}`));
  ctx.events.on('person:hurt', (e) => void trace.push(`hurt ${e.id} ${e.info.kind} ${f(e.info.amount)} zone ${f(e.info.zone ?? -1)} → ${f(e.healthAfter)}`));
  ctx.events.on('projectile:returned', (e) => void trace.push(`returned ${e.id} by ${e.byId}`));
  ctx.events.on('law:offense', (e) => void trace.push(`offense ${e.personId} ${e.offense.type}`));
  ctx.events.on('law:force', (e) => void trace.push(`force ${e.report.byId} ${e.report.means} ${e.report.targetId}`));

  // ligne de CRS face à un groupe de manifestants, à une vingtaine de mètres
  const crs: Person[] = [];
  for (let i = 0; i < 8; i++) {
    const c = spawn(ctx, 'crs', i * 1.2 - 4.2, 0, 0, ['bouclier', 'grenade_lacrymo', 'lbd40', 'lanceur_cougar', 'tonfa']);
    ctx.actions.give(c, 'grenade_lacrymo', 2);
    ctx.actions.give(c, 'grenade_desencerclement', 1);
    crs.push(c);
  }
  const crowd: Person[] = [];
  for (let i = 0; i < 24; i++) {
    const m = spawn(ctx, 'manifestant', (i % 8) * 1.5 - 5, 16 + Math.floor(i / 8) * 1.6, Math.PI, ['mortier', 'raquette']);
    ctx.actions.give(m, 'pave', 3);
    ctx.actions.give(m, 'bouteille', 2);
    ctx.actions.give(m, 'molotov', 1);
    crowd.push(m);
  }
  const out = { yaw: 0, pitch: 0, power: 1, flightTime: 0 };
  // un tir se prépare : l'objet est pris en main, puis employé 1,5 s plus tard (temps de mise en main)
  const pending: { at: number; who: Person; target: Person; dz: number; dy: number }[] = [];
  const prepare = (step: number, who: Person, target: Person, item: string, dy: number, dz: number): void => {
    if (ctx.actions.selectById(who, item)) pending.push({ at: step + Math.round(1.5 / dt), who, target, dy, dz });
  };
  const script = (step: number): void => {
    // toutes les 0,5 s, un manifestant s'apprête à lancer ou tirer ; toutes les 2 s, un CRS à riposter
    if (step % 15 === 0) {
      const k = step / 15;
      prepare(step, crowd[k % crowd.length]!, crs[k % crs.length]!, ['pave', 'bouteille', 'mortier', 'pave', 'molotov'][k % 5]!, 1.1, 0);
    }
    if (step % 60 === 30) {
      const k = (step / 60) | 0;
      const item = ['grenade_lacrymo', 'lbd40', 'lanceur_cougar', 'grenade_desencerclement'][k % 4]!;
      prepare(step, crs[k % crs.length]!, crowd[k % crowd.length]!, item, item === 'lbd40' ? 1.1 : 0, item === 'lanceur_cougar' ? 30 : 0);
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const job = pending[i]!;
      if (job.at !== step) continue;
      pending.splice(i, 1);
      if (ctx.actions.solveAim(job.who, job.target.x, job.target.y + job.dy, job.target.z + job.dz, out)) {
        face(job.who, out.yaw, out.pitch);
        job.who.stun = 0;
        ctx.actions.use(job.who, { power: out.power });
      }
    }
    // un manifestant renvoie le palet le plus proche quand il y en a un
    if (step % 45 === 44) {
      for (const m of crowd) {
        const palet = ctx.projectiles.nearestPickable(m.x, m.z, 1.5);
        if (palet && palet.kind === 'palet_lacrymo') {
          face(m, Math.PI, 0.2);
          ctx.interactions.startVerb(m, 'renvoyer', palet.id);
          break;
        }
      }
    }
  };
  const steps = Math.round(60 / dt);
  for (let s = 0; s < steps; s++) {
    script(s);
    t.step(dt, dt);
  }
  trace.push(`gaz ${hz.gas.length} ${f(hz.gas.reduce((a, c) => a + c.x * 0.1 + c.z * 0.01 + c.amount, 0))}`);
  trace.push(`feux ${hz.fires.length} projectiles ${ctx.projectiles.list.length}`);
  trace.push(`santé ${[...crs, ...crowd].map((p) => f(p.health)).join(',')}`);
  return trace;
}

describe('déterminisme', () => {
  it('même graine : trace identique ; autre graine : trace différente', async () => {
    const a = await run(2024);
    const b = await run(2024);
    const c = await run(2025);
    console.log(`[déterminisme] ${a.length} événements tracés en 60 s de scène (${a.filter((l) => l.startsWith('impact')).length} impacts, ${a.filter((l) => l.startsWith('hurt')).length} blessures, ${a.filter((l) => l.startsWith('explosion')).length} explosions, ${a.filter((l) => l.startsWith('returned')).length} renvois)`);
    expect(a.length).toBeGreaterThan(150);
    expect(a.some((l) => l.startsWith('explosion grenade_lacrymo_main'))).toBe(true);
    expect(a.some((l) => l.startsWith('explosion desencerclement'))).toBe(true);
    expect(a.some((l) => l.startsWith('explosion molotov'))).toBe(true);
    expect(a.some((l) => l.startsWith('explosion mortier'))).toBe(true);
    expect(a.some((l) => l.startsWith('hurt'))).toBe(true);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });
});
