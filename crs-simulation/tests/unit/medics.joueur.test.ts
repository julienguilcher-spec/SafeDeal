// Médecins de rue — le joueur secouriste : tableau de tri, victime à traiter d'abord, barème de prise en charge.
import { describe, expect, it } from 'vitest';
import type { GameContext, InteractVerb, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescueModule } from '@/sim/roles/rescue';
import { startRescue, wound } from '@/sim/roles/rescue/testkit';
import type { RescueRig } from '@/sim/roles/rescue/testkit';
import { createSystems as medicsModule } from '@/sim/roles/medics';
import type { MedicsRecords } from '@/sim/roles/medics';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidents, rescueModule, medicsModule];
const EXTRA = { props: { ambientDensity: 0 }, 'rescue.delayScale': 0.3 };

function freePoint(ctx: GameContext, x: number, z: number): { x: number; z: number } {
  const out = { x, z };
  expect(ctx.world.randomFreePoint(x, z, 4, 'road', () => ctx.rng.next(), out)).toBe(true);
  return out;
}

function knockDown(ctx: GameContext, p: Person): void {
  ctx.require<{ knockDown(p: Person, seconds: number, sourceId: number): void }>('people.health').knockDown(p, 0, 0);
}

/** Le joueur se place auprès de la personne (le déplacement lui-même relève des commandes) et mène le geste à son terme. */
function act(rig: RescueRig, me: Person, verb: InteractVerb, target: Person): boolean {
  const { ctx } = rig;
  me.x = target.x + 0.9;
  me.z = target.z;
  me.cmd.moveX = 0;
  me.cmd.moveZ = 0;
  ctx.people.rebuildIndex();
  rig.step(0.2);
  if (!ctx.interactions.startVerb(me, verb, target.id)) return false;
  const cur = ctx.interactions.current(me);
  if (cur) rig.step(cur.opt.duration + 0.3);
  return true;
}

describe('médecins de rue — le joueur secouriste', () => {
  it('tableau de tri (le plus grave d\'abord), victime à traiter en premier confiée au joueur, barème : erreur de tri, soins, bilan transmis, remise au SAMU', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx, rescue } = rig;
    const api = ctx.require<IncidentsApi>(EXT.incidents);
    const rec = ctx.require<MedicsRecords>('medics.records');
    const c = freePoint(ctx, 0, -230);
    const me = ctx.archetypes.spawn('street_medic', c.x, c.z, { seed: 9 });
    ctx.player.possess(me.id, 'street_medic');
    expect(rec.board.length).toBe(0);
    const gassed = ctx.archetypes.spawn('manifestant', c.x + 3, c.z + 1, { profile: 'pacifique', seed: 21 });
    gassed.gas = 0.85;
    const serious = ctx.archetypes.spawn('manifestant', c.x + 2, c.z - 5, { profile: 'pacifique', seed: 22 });
    wound(ctx, serious, 'serious');
    knockDown(ctx, serious);
    const critical = ctx.archetypes.spawn('manifestant', c.x - 3, c.z + 4, { profile: 'pacifique', seed: 23 });
    wound(ctx, critical, 'critical');
    rig.step(1.2);

    // le tableau : trois personnes, la plus urgente d'abord, estimées à vue (aucun bilan encore)
    expect(rec.board.length).toBe(3);
    expect(rec.board[0].id).toBe(critical.id);
    expect(rec.board[0].estimate).toBe('rouge');
    expect(rec.board[0].color).toBe('aucun');
    expect(rec.board[1].id).toBe(serious.id);
    expect(rec.board[1].estimate).toBe('jaune');
    expect(rec.board[2].id).toBe(gassed.id);
    expect(rec.board[2].estimate).toBe('vert');
    for (let i = 1; i < rec.board.length; i++) expect(rec.board[i - 1].priority).toBeGreaterThanOrEqual(rec.board[i].priority);
    expect(rec.recommendedId).toBe(critical.id);
    // l'urgence vitale est devenue SA tâche (repère à l'écran)
    const inc = api.list.find((i) => i.targetId === critical.id)!;
    expect(inc).toBeDefined();
    expect(inc.urgency).toBe(3);
    expect(api.playerIncidentId).toBe(inc.id);
    expect(inc.means).toBe('joueur');
    // le PNJ n'est pas piloté : le module ne touche pas aux commandes du joueur
    expect(rec.npc.medics).toBe(0);

    // erreur de tri : il rince d'abord la personne gazée alors que l'urgence absolue, connue depuis un moment, attend
    rig.step(11);
    const serum0 = ctx.actions.has(me, 'serum_physiologique');
    expect(act(rig, me, 'rincer_yeux', gassed)).toBe(true);
    expect(rec.rinses).toBe(1);
    expect(rec.triageErrors).toBe(1);
    expect(rec.score).toBe(3 - 10);
    expect(ctx.actions.has(me, 'serum_physiologique')).toBe(serum0 - 1);
    expect(rec.entries.map((e) => e.what)).toEqual(['tri', 'rincage']);

    // il soigne l'urgence absolue : bilan (couleur révélée) et gestes, elle est stabilisée
    const kit0 = ctx.actions.has(me, 'trousse_secours');
    expect(act(rig, me, 'soigner', critical)).toBe(true);
    expect(rec.treated).toBe(1);
    expect(rec.bilans).toBe(1);
    expect(rec.score).toBe(-7 + 8);
    expect(ctx.actions.has(me, 'trousse_secours')).toBe(kit0 - 1);
    rig.step(0.6);
    const line = rec.board.find((e) => e.id === critical.id)!;
    expect(line.color).toBe('rouge');
    expect(line.treated).toBe(true);
    expect(line.needsEvacuation).toBe(true);
    expect(critical.posture).toBe('down');
    // la suivante à traiter : la blessée sérieuse
    expect(rec.recommendedId).toBe(serious.id);

    // le cas dépasse le premier secours : SAMU demandé → bilan transmis ; à son arrivée, la victime lui est remise
    const call = rescue.request('samu', critical.x, critical.z, me.id);
    rig.step(1);
    expect(rec.transmissions).toBe(1);
    expect(rec.score).toBe(1 + 5);
    expect(act(rig, me, 'soigner', serious)).toBe(true);
    expect(rec.treated).toBe(2);
    expect(rec.triageErrors).toBe(1); // plus d'urgence absolue en attente : pas d'erreur cette fois
    expect(rec.score).toBe(6 + 8);
    const tScene = rig.run(300, 0.5, () => call.state === 'sur_place');
    expect(tScene).toBeGreaterThanOrEqual(0);
    rig.step(1);
    expect(rec.handovers).toBe(1);
    expect(rec.score).toBe(14 + 10);
    expect(rec.abandoned).toBe(0);
    expect(rec.meanDelay).toBeGreaterThan(5);
    const summary = rec.summary();
    console.log(`[joueur secouriste] ${rec.entries.map((e) => `${e.what} ${e.points > 0 ? '+' : ''}${e.points}`).join(', ')} → ${rec.score} points ; délai moyen ${rec.meanDelay.toFixed(0)} s ; SAMU sur place ${tScene.toFixed(0)} s après l'appel`);
    expect(summary.some((l) => l.includes('Score de prise en charge : 24 points.'))).toBe(true);
    expect(summary.some((l) => l.includes('1 urgence absolue laissée en attente'))).toBe(true);
  });

  it('un blessé connu laissé sans soins est compté comme abandonné ; un sac vide est signalé', async () => {
    const rig = await startRescue(MODULES, { mode: 'test', x: 0, z: -230, extra: EXTRA });
    const { ctx } = rig;
    const rec = ctx.require<MedicsRecords>('medics.records');
    const c = freePoint(ctx, 0, -230);
    const me = ctx.archetypes.spawn('street_medic', c.x, c.z, { seed: 9 });
    ctx.player.possess(me.id, 'street_medic');
    const victim = ctx.archetypes.spawn('manifestant', c.x + 2, c.z + 3, { profile: 'pacifique', seed: 31 });
    wound(ctx, victim, 'critical');
    rig.step(2);
    expect(rec.board.length).toBe(1);
    expect(rec.recommendedId).toBe(victim.id);
    // il s'en va sans rien faire
    const away = freePoint(ctx, 0, -160);
    me.x = away.x;
    me.z = away.z;
    ctx.people.rebuildIndex();
    rig.step(60);
    expect(rec.abandoned).toBe(0); // pas encore : le délai n'est pas écoulé
    rig.step(35);
    expect(rec.abandoned).toBe(1);
    expect(rec.score).toBe(-20);
    // sac vide
    ctx.actions.remove(me, 'trousse_secours', ctx.actions.has(me, 'trousse_secours'));
    ctx.actions.remove(me, 'serum_physiologique', ctx.actions.has(me, 'serum_physiologique'));
    rig.step(1);
    expect(rec.entries.some((e) => e.what === 'sac_vide')).toBe(true);
    expect(rec.score).toBe(-25);
    expect(rec.summary().some((l) => l.includes('1 blessé laissé sans soins'))).toBe(true);
  });
});
