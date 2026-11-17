// Interpellations successives ordonnées à une unité qui barre une rue (cas d'une sortie filtrée de nasse) : chaque
// interpellé gardé derrière la ligne (ni fourgon ni point de regroupement à portée) occupe l'agent qui le garde. Une
// fois les agents du second rang tous pris, l'ordre « interpeller » était refusé (« Aucun binôme d'interpellation
// disponible ») alors que la section comptait encore une dizaine d'agents valides au premier rang : à la porte d'une
// nasse, les auteurs retenus repartaient libres. L'ordre est désormais exécuté par l'agent du rang le plus proche.
// Quartier d'essai : rue du Pont (14 m entre façades, axe x = 0).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { ORDER_DONE_EVENT, ORDER_REFUSED_EVENT } from '@/sim/police/api';
import { startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const LINE_Z = -100;

describe('police — interpellations successives depuis une rue barrée', () => {
  it('l’unité interpelle chacun des auteurs désignés, même quand tout le second rang garde déjà des interpellés', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -70, heading: Math.PI, vehicles: false });
    const id = sec.squad.id;
    ctx.squads.issue(id, { type: 'tenir', x: 0, z: LINE_Z, heading: Math.PI, width: 0 });
    pt.run(90, 1, () => pt.status.of(id)!.phase === 'en_place');
    pt.step(5);
    const refusals: string[] = [];
    ctx.events.onAny(ORDER_REFUSED_EVENT, (e) => refusals.push((e as { reason: string }).reason));
    // six auteurs de faits, l'un après l'autre, à 4 m devant la ligne (comme à la porte d'une sortie filtrée)
    const culprits: Person[] = [];
    for (let i = 0; i < 6; i++) {
      const target = ctx.people.spawn({ kind: 'manifestant', x: -3 + i * 1.2, z: LINE_Z - 4 });
      ctx.law.recordOffense(target, 'jet_projectile', target.x, target.z, 2).witnessed = true;
      culprits.push(target);
      ctx.squads.issue(id, { type: 'interpeller', targetId: target.id, x: target.x, z: target.z });
      pt.run(90, 0.5, () => target.custody !== 'free' && target.custody !== 'held');
      // (le manifestant ne fuit pas : il reste où il est, comme l'auteur retenu à la porte)
    }
    console.log(`auteurs : ${culprits.map((p) => p.custody).join(', ')} ; refus : ${refusals.join(' | ') || 'aucun'}`);
    expect(refusals).toEqual([]);
    expect(culprits.every((p) => p.custody !== 'free')).toBe(true);
  }, 300000);

  it('l’individu désigné qui s’éloigne au pas de course est rattrapé (le premier vise devant lui, pas dans son dos)', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -70, heading: Math.PI, vehicles: false });
    const id = sec.squad.id;
    ctx.squads.issue(id, { type: 'tenir', x: 0, z: LINE_Z, heading: Math.PI, width: 0 });
    pt.run(90, 1, () => pt.status.of(id)!.phase === 'en_place');
    pt.step(5);
    const target = ctx.people.spawn({ kind: 'manifestant', x: 1, z: LINE_Z - 6 });
    ctx.law.recordOffense(target, 'jet_projectile', target.x, target.z, 2).witnessed = true;
    ctx.squads.issue(id, { type: 'interpeller', targetId: target.id, x: target.x, z: target.z });
    const results: string[] = [];
    ctx.events.onAny(ORDER_DONE_EVENT, (e) => {
      const d = e as { type: string; ok: boolean; reason: string };
      if (d.type === 'interpeller') results.push(d.ok ? 'ok' : d.reason);
    });
    // il s'éloigne de la ligne au pas de course, droit devant lui, tant qu'il est libre
    let near = Infinity;
    pt.run(80, 0.1, () => {
      if (target.custody === 'free') {
        target.cmd.moveX = 0;
        target.cmd.moveZ = -1;
        target.cmd.gait = 1;
        target.cmd.faceMove = true;
      }
      for (const a of sec.people) if (a.poste !== 'conducteur') near = Math.min(near, Math.hypot(a.x - target.x, a.z - target.z));
      return target.custody !== 'free' && target.custody !== 'held';
    });
    console.log(`fuyard : ${target.custody}, à ${(LINE_Z - target.z).toFixed(0)} m de la ligne ; agent le plus proche ${near.toFixed(1)} m ; fin d'ordre : ${results.join(' | ') || '—'}`);
    expect(target.custody).not.toBe('free');
  }, 300000);
});
