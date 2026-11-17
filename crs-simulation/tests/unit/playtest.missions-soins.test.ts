// Recette jouée des missions dont un objectif PRINCIPAL est de soigner ou de secourir (street medic, pompier, SAMU,
// école, chef de groupe, Centaure, drone) : chaque mission doit avoir les personnes dont elle a besoin (un blessé à
// soigner, des gazés à rincer), et un robot qui fait la chose évidente — aller à la personne à terre ou gazée la plus
// proche (déplacement abrégé) et la soigner ou lui rincer les yeux avec les gestes du joueur (interactions) — doit
// atteindre l'objectif. Relevé de la recette précédente : les aléas « blessé » ouvraient un incident sur un lieu vide,
// et medecin-01 « Rincer quinze personnes » n'avait personne à rincer.
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
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as missions, missionConfig } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';
import { MISSIONS } from '@/gameplay/missions/catalog';
import { createObjectives } from '@/ui/core/objectives';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session, missions, objectives];

const CARE = MISSIONS.filter((m) => m.objectives.some((o) => !o.secondary && (o.kind === 'soigner' || o.kind === 'secourir')));
const SECONDS = Number(process.env.PLAYTEST_SECONDS ?? 420);

/** Personne à prendre en charge la plus proche : gazée (rinçage) ou blessée (soins). */
function patient(ctx: GameContext, me: Person, eyes: boolean, skip: Set<number>): Person | null {
  let best: Person | null = null;
  let bd = 250;
  for (const p of ctx.people.list) {
    if (p === me || p.dormant || p.vehicleId !== 0 || p.injury === 'dead' || skip.has(p.id)) continue;
    const need = eyes ? p.gas > 0.12 : p.injury !== 'none';
    if (!need) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

describe('recette jouée : missions de soins et de secours', () => {
  it('le catalogue compte des missions de soins', () => {
    console.log(CARE.map((m) => `${m.id} [${m.role}]`).join('\n'));
    expect(CARE.length).toBeGreaterThanOrEqual(8);
  });
  for (const def of CARE) {
    it(def.id, async () => {
      const t = createTestContext({ seed: 7, strict: false, modules: SIM });
      await t.ready;
      const { ctx } = t;
      const cfg = missionConfig(def, ctx.world) as SessionConfig;
      cfg.mode = 'carriere';
      await t.start(cfg);
      const m = ctx.service<MissionsApi>('missions')!;
      for (let i = 0; i < 900 && m.phaseIndex < 0; i++) t.step(1);
      const runs = () => m.objectives.filter((r) => !r.def.secondary && (r.def.kind === 'soigner' || r.def.kind === 'secourir'));
      const skip = new Set<number>();
      let gestures = 0;
      let candidates = 0;
      for (let s = 0; s < SECONDS && !m.result && runs().some((r) => r.state === 'actif'); s++) {
        const me = ctx.player.person();
        if (!me) break;
        const run = runs().find((r) => r.state === 'actif')!;
        if (me.vehicleId !== 0 && ctx.interactions.current(me) === null) ctx.vehicles.exit(me);
        if (me.vehicleId === 0 && !ctx.interactions.current(me)) {
          // victimes mises en scène pour cet objectif (atelier) d'abord, sinon la personne la plus proche
          const staged = run.victims?.map((id) => ctx.people.get(id)).find((v) => v && v.injury !== 'none' && !skip.has(v.id));
          const eyes = run.def.target === 'yeux_gaz';
          const p = staged ?? patient(ctx, me, eyes, skip);
          if (p) {
            candidates++;
            me.x = p.x + 0.9;
            me.z = p.z;
            ctx.people.rebuildIndex();
            const ok = ctx.interactions.startVerb(me, eyes ? 'rincer_yeux' : 'soigner', p.id)
              || (!eyes && ctx.interactions.startVerb(me, 'rincer_yeux', p.id));
            if (ok) gestures++;
            else if (process.env.PLAYTEST_DEBUG) console.log(`t=${s} échec ${eyes ? 'rincer' : 'soigner'} : véhicule ${me.vehicleId} ; inventaire ${me.inventory.map((i) => i.id + 'x' + i.count).join(',')} ; cible ${p.kind} ${p.faction} ${p.injury} ${p.posture} gaz ${p.gas.toFixed(2)} tenu ${p.heldBy} véh ${p.vehicleId}`);
            skip.add(p.id);
          }
        }
        t.step(1);
      }
      const states = runs().map((r) => `${r.def.id}:${r.def.kind}${r.def.target ? '/' + r.def.target : ''} ${r.state} ${Math.round(r.progress * 100)} %`).join(', ');
      console.log(`${def.id} [${def.role}] : ${states} ; ${candidates} personnes approchées, ${gestures} gestes, t=${Math.round(ctx.clock.now)} s, phase ${m.phaseIndex + 1}/${def.phases.length}`);
      expect(candidates, `${def.id} : personne à soigner`).toBeGreaterThan(0);
      for (const r of runs()) expect(r.state, `${def.id} ${r.def.id} « ${r.def.text} »`).toBe('reussi');
    }, 900000);
  }
});
