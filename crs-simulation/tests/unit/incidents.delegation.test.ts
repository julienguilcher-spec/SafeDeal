// Incidents — délégation : ordre réel à l'unité, refus des moyens inaptes, contre-ordre, suivi jusqu'à la clôture.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Squad } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as roles } from '@/sim/roles';
import type { PropsExtApi } from '@/sim/props/api';
import { createSystems as incidentsModule } from '@/gameplay/incidents';
import { startIncidents, wound } from '@/gameplay/incidents/testkit';

const MODULES = [world, people, items, hazards, law, props, vehicles, roles, incidentsModule];
const CONFIG = { mode: 'test' as const, x: 0, z: -230, extra: { props: { ambientDensity: 0 } } };

/** Groupe de CRS sans IA (le module de police n'est pas branché) : les ordres restent dans ctx.squads. */
function group(ctx: GameContext, x: number, z: number, postes: readonly ('bouclier' | 'extincteur' | 'lanceur' | 'chef_groupe')[], name = 'MISTRAL 1 ALFA'): { squad: Squad; members: Person[] } {
  const squad = ctx.squads.create('groupe', 'police', name);
  const members = postes.map((poste, i) => ctx.archetypes.spawn('crs', x + i * 0.8, z, { poste, squadId: squad.id, seed: 60 + i }));
  return { squad, members };
}

describe('incidents — délégation à une unité', () => {
  it('feu confié à un groupe : un ordre « eteindre » arrive dans ctx.squads, avec le foyer pour cible', async () => {
    const rig = await startIncidents(MODULES, CONFIG);
    const { ctx, incidents } = rig;
    const ext = ctx.require<PropsExtApi>('props.ext');
    const at = rig.roadPoint(0, -230);
    const bin = ctx.props.spawn('poubelle', at.x, at.z, 0);
    ext.ignite(bin, 0);
    rig.step(1);
    const inc = rig.find('feu_poubelle')!;
    const issued: { squadId: number; type: string; targetId: number; x: number; z: number }[] = [];
    ctx.events.on('order:issued', (e) => issued.push({ squadId: e.squadId, type: e.order.type, targetId: e.order.targetId, x: e.order.x, z: e.order.z }));

    // un groupe sans extincteur est inapte
    const shields = group(ctx, at.x + 30, at.z, ['chef_groupe', 'bouclier', 'bouclier'], 'MISTRAL 1 BRAVO');
    expect(incidents.assign(inc.id, 'unite', shields.squad.id)).toBe(false);
    expect(issued.length).toBe(0);
    expect(inc.state).toBe('ouvert');
    // moyen absent : pas d'engin lanceur d'eau, pas de service de secours
    expect(incidents.assign(inc.id, 'canon_eau')).toBe(false);
    expect(incidents.assign(inc.id, 'pompiers')).toBe(false);
    // moyen sans rapport avec la nature de l'incident
    expect(incidents.assign(inc.id, 'samu')).toBe(false);
    expect(incidents.assign(inc.id, 'centaure')).toBe(false);
    expect(incidents.assign(9999, 'unite', shields.squad.id)).toBe(false);

    // un groupe d'appui avec son porte-extincteur
    const g = group(ctx, at.x - 25, at.z, ['chef_groupe', 'bouclier', 'bouclier', 'extincteur']);
    expect(incidents.assign(inc.id, 'unite', g.squad.id)).toBe(true);
    expect(issued).toEqual([{ squadId: g.squad.id, type: 'eteindre', targetId: bin.id, x: inc.x, z: inc.z }]);
    expect(g.squad.order.type).toBe('eteindre');
    expect(g.squad.order.targetId).toBe(bin.id);
    expect(inc.state).toBe('assigne');
    expect(inc.means).toBe('unite');
    expect(inc.squadId).toBe(g.squad.id);
    const rec = rig.records.of(inc.id)!;
    expect(rec.assignedAt).toBeGreaterThan(rec.createdAt);
    expect(rec.assignments).toBe(1);
    // sans désignation, l'unité apte la plus proche est choisie
    incidents.unassign(inc.id);
    expect(inc.state).toBe('ouvert');
    expect(issued[issued.length - 1]).toMatchObject({ squadId: g.squad.id, type: 'cesser' });
    expect(incidents.assign(inc.id, 'unite')).toBe(true);
    expect(inc.squadId).toBe(g.squad.id);

    // contre-ordre : celui qui commande donne une autre tâche à l'unité → l'incident est de nouveau à confier
    ctx.squads.issue(g.squad.id, { type: 'interpeller', x: at.x, z: at.z });
    expect(inc.state).toBe('ouvert');
    expect(inc.means).toBe('');
    expect(inc.squadId).toBe(0);
    // un ordre de formation n'interrompt pas la tâche ; la même tâche redonnée par le commandant non plus
    expect(incidents.assign(inc.id, 'unite', g.squad.id)).toBe(true);
    ctx.squads.issue(g.squad.id, { type: 'colonne', x: at.x - 10, z: at.z });
    expect(inc.state).toBe('assigne');
    ctx.squads.issue(g.squad.id, { type: 'eteindre', x: inc.x, z: inc.z, targetId: bin.id });
    expect(inc.state).toBe('assigne');
    ctx.squads.issue(g.squad.id, { type: 'cesser' });
    expect(inc.state).toBe('ouvert');
  });

  it('chaque nature d\'incident donne l\'ordre adapté : secourir, interpeller, dégager, protéger', async () => {
    const rig = await startIncidents(MODULES, CONFIG);
    const { ctx, incidents } = rig;
    const at = rig.roadPoint(0, -230);
    const g = group(ctx, at.x - 20, at.z, ['chef_groupe', 'bouclier', 'bouclier', 'extincteur']);
    const last = (): { type: string; targetId: number } => ({ type: g.squad.order.type, targetId: g.squad.order.targetId });

    // blessé grave → secourir
    const victim = ctx.archetypes.spawn('manifestant', at.x, at.z, { profile: 'pacifique', seed: 5 });
    wound(ctx, victim, 'critical');
    rig.step(1);
    const blesse = rig.find('blesse')!;
    expect(blesse.targetId).toBe(victim.id);
    expect(incidents.assign(blesse.id, 'unite', g.squad.id)).toBe(true);
    expect(last()).toEqual({ type: 'secourir', targetId: victim.id });

    // barricade → dégager
    const barricade = ctx.props.spawn('barricade', at.x + 14, at.z, 0);
    rig.step(1);
    const obstacle = rig.find('barricade')!;
    expect(obstacle.targetId).toBe(barricade.id);
    expect(incidents.assign(obstacle.id, 'unite', g.squad.id)).toBe(true);
    expect(last()).toEqual({ type: 'degager_barricade', targetId: barricade.id });
    // une unité ne mène qu'une tâche à la fois : le blessé est de nouveau à confier
    expect(blesse.state).toBe('ouvert');

    // pillage → interpeller (le dernier pilleur connu, s'il est encore là)
    const shop = ctx.props.addShop({ category: 'telephonie', x: at.x + 2, z: at.z - 4, heading: 0, width: 5 });
    const looter = ctx.archetypes.spawn('manifestant', shop.x, shop.z + 1, { profile: 'pilleur', seed: 6 });
    ctx.events.emit('shop:looted', { id: shop.id, byId: looter.id, amount: 0.05 });
    rig.step(1);
    const pillage = rig.find('pillage')!;
    expect(pillage.targetKind).toBe('shop');
    expect(pillage.urgency).toBe(2);
    expect(incidents.assign(pillage.id, 'unite', g.squad.id)).toBe(true);
    expect(last()).toEqual({ type: 'interpeller', targetId: looter.id });

    // incident abstrait créé par une mission (aucune entité) : suspect à un endroit donné
    const suspect = incidents.open('suspect', at.x + 5, at.z + 3, 'place', 0, 1);
    expect(incidents.assign(suspect.id, 'unite', g.squad.id)).toBe(true);
    expect(last()).toEqual({ type: 'interpeller', targetId: 0 });
    // … clos quand l'unité rend compte de la fin de sa tâche
    ctx.events.emitAny('police:order_done', { squadId: g.squad.id, type: 'interpeller', ok: true, reason: '' });
    rig.step(1);
    expect(suspect.state).toBe('resolu');
  });

  it('avec la vraie IA des unités : le porte-extincteur éteint le feu, l\'incident passe « en cours » puis se clôt, compte rendu radio', async () => {
    const { createSystems: police } = await import('@/sim/police');
    const rig = await startIncidents([...MODULES, police], CONFIG);
    const { ctx, incidents } = rig;
    const ext = ctx.require<PropsExtApi>('props.ext');
    const units = ctx.require<import('@/sim/police/api').PoliceUnitsApi>('police.units');
    const at = rig.roadPoint(0, -230);
    const sec = units.createSection({ x: at.x, z: at.z + 22, heading: Math.PI, layout: 'ligne', vehicles: false });
    rig.step(6);
    const bin = ctx.props.spawn('conteneur', at.x, at.z, 0);
    expect(ext.ignite(bin, 0)).toBe(true);
    rig.step(8);
    const inc = rig.find('feu_poubelle')!;
    expect(inc).toBeDefined();
    const states: string[] = [];
    ctx.events.onAny('incidents:updated', (e) => states.push((e as { change: string }).change));
    expect(incidents.assign(inc.id, 'unite', sec.squad.id)).toBe(true);
    const tStart = rig.run(60, 0.5, () => inc.state === 'en_cours');
    const tDone = rig.run(90, 0.5, () => inc.state === 'resolu' || inc.state === 'echoue');
    console.log(`[incidents] porte-extincteur sur place en ${tStart.toFixed(1)} s, feu éteint et incident clos ${tDone.toFixed(1)} s plus tard, avancement ${inc.progress.toFixed(2)}`);
    expect(tStart).toBeGreaterThanOrEqual(0);
    expect(tDone).toBeGreaterThanOrEqual(0);
    expect(inc.state).toBe('resolu');
    expect(bin.state).not.toBe('burning');
    expect(states).toContain('assigne');
    expect(states).toContain('en_cours');
    const rec = rig.records.of(inc.id)!;
    expect(rec.outcome).toBe('traite');
    expect(rec.means).toBe('unite');
    expect(rec.squadId).toBe(sec.squad.id);
    expect(rec.startedAt).toBeGreaterThan(rec.assignedAt - 1e-9);
    rig.step(8);
    const reports = ctx.radio.log.filter((m) => /Incident traité/.test(m.text));
    console.log('[incidents] compte rendu :', reports.map((m) => `${m.from} : ${m.text}`).join(' / '));
    expect(reports.length).toBe(1);
    const stats = rig.records.stats();
    expect(stats.treated).toBe(1);
    expect(stats.score).toBeGreaterThan(80);
    expect(rig.records.summary().join('\n')).toContain('traité');
  });
});
