// Construction des unités : compagnie, section, groupe, BRAV-M, peloton, équipages ; arborescence, indicatifs, véhicules, place du joueur.
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as vehicles } from '@/sim/vehicles';
import { fitLine, frontRank, startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

function countPoste(list: readonly Person[], poste: string): number {
  return list.filter((p) => p.poste === poste).length;
}

describe('police — unités', () => {
  it('compagnie de CRS : commandement de 6, quatre sections de 16, commandant unique à écharpe, indicatifs, arborescence, véhicules', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: -150, z: 0, heading: Math.PI / 2 });
    const foot = cie.people.filter((p) => p.poste !== 'conducteur');
    expect(foot.length).toBe(70);
    expect(countPoste(cie.people, 'conducteur')).toBe(13);
    expect(countPoste(cie.people, 'bouclier')).toBe(20);
    expect(countPoste(cie.people, 'lanceur')).toBe(8);
    expect(countPoste(cie.people, 'lbd')).toBe(4);
    expect(countPoste(cie.people, 'extincteur')).toBe(4);
    expect(countPoste(cie.people, 'interpellation')).toBe(8);
    expect(countPoste(cie.people, 'chef_groupe')).toBe(8);
    // un seul chef : le commandant porte l'écharpe et commande la compagnie
    const commanders = cie.people.filter((p) => p.poste === 'commandant_unite');
    expect(commanders.length).toBe(1);
    expect(commanders[0].look.sash).toBe(true);
    expect(commanders[0].rank).toBe('commandant');
    expect(cie.squad.leaderId).toBe(commanders[0].id);
    expect(cie.leader).toBe(commanders[0]);
    expect(cie.people.filter((p) => p.look.sash).length).toBe(1);
    // arborescence et indicatifs
    expect(cie.squad.kind).toBe('compagnie');
    expect(cie.squad.name).toBe('MISTRAL');
    expect(cie.sections.map((s) => s.name)).toEqual(['MISTRAL 1', 'MISTRAL 2', 'MISTRAL 3', 'MISTRAL 4']);
    expect(cie.groups.length).toBe(12);
    expect(cie.groups.slice(0, 3).map((g) => g.name)).toEqual(['MISTRAL 1 ALFA', 'MISTRAL 1 BRAVO', 'MISTRAL 1 CHARLIE']);
    for (const s of cie.sections) {
      expect(s.parentId).toBe(cie.squad.id);
      expect(ctx.squads.childrenOf(s.id).length).toBe(3);
      const chief = ctx.people.get(s.leaderId)!;
      expect(chief.poste).toBe('chef_section');
    }
    for (const g of cie.groups) {
      const chief = ctx.people.get(g.leaderId)!;
      expect(['chef_groupe', 'chef_section']).toContain(chief.poste);
    }
    // dotation : grenades par agent, réserve aux fourgons
    const lanceur = cie.people.find((p) => p.poste === 'lanceur')!;
    expect(lanceur.inventory.find((s) => s.id === 'grenade_lacrymo')!.count).toBe(4);
    expect(lanceur.inventory.find((s) => s.id === 'lanceur_cougar')!.count).toBe(8);
    // véhicules : un fourgon par groupe, un véhicule de commandement, un fourgon cellulaire ; conducteurs au volant
    expect(cie.vehicles.filter((v) => v.kind === 'fourgon_crs').length).toBe(12);
    expect(cie.vehicles.filter((v) => v.kind === 'vl_commandement').length).toBe(1);
    expect(cie.vehicles.filter((v) => v.kind === 'fourgon_cellulaire').length).toBe(1);
    for (const g of cie.groups) expect(ctx.vehicles.get(g.vehicleId)).toBeDefined();
    for (const p of cie.people.filter((q) => q.poste === 'conducteur')) expect(p.vehicleId).not.toBe(0);
    const st = pt.status.of(cie.squad.id)!;
    console.log('compagnie —', st.total, 'agents |', st.embarked, 'à bord (conducteurs) | munitions', JSON.stringify(st.ammo), '| réserve', JSON.stringify(st.reserve));
    expect(st.total).toBe(83);
    expect(st.ammo.lacrymoMain).toBe(8 * 4 + 8 * 2);
    expect(st.ammo.lbd).toBe(24);
    expect(st.reserve.lacrymoLanceur).toBeGreaterThan(100);
    // disposition de départ : colonne par trois, personne dans un mur, personne sur un autre
    for (const p of foot) expect(ctx.world.isFree(p.x, p.z, 0.05)).toBe(true);
    for (let i = 0; i < foot.length; i++) for (let j = i + 1; j < foot.length; j++) {
      expect(Math.hypot(foot[i].x - foot[j].x, foot[i].z - foot[j].z)).toBeGreaterThan(0.55);
    }
    // une deuxième compagnie prend l'indicatif suivant
    const autre = pt.units.createCompany({ x: 150, z: 0, heading: -Math.PI / 2, vehicles: false, sections: 2 });
    expect(autre.squad.name).toBe('TRAMONTANE');
    expect(autre.people.length).toBe(6 + 32);
  });

  it('BRAV-M, peloton de gendarmes mobiles et équipages', async () => {
    const pt = await startPolice([...MODULES, vehicles], { mode: 'test', x: 0, z: 0 });
    const { ctx } = pt;
    const brav = pt.units.createBravm(6, { x: -100, z: 0, heading: Math.PI / 2 });
    expect(brav.people.length).toBe(12);
    expect(brav.groups.length).toBe(6);
    expect(brav.vehicles.length).toBe(6);
    expect(brav.vehicles.every((v) => v.kind === 'moto_bravm')).toBe(true);
    expect(countPoste(brav.people, 'pilote_moto')).toBe(6);
    expect(brav.people.every((p) => p.kind === 'bravm')).toBe(true);
    expect(brav.squad.name).toBe('FAUCON 1');
    expect(brav.groups[2].name).toBe('FAUCON 1-3');

    const peloton = pt.units.createPeloton({ x: 100, z: 0, heading: -Math.PI / 2 });
    expect(peloton.people.length).toBe(16);
    expect(peloton.people.every((p) => p.kind === 'gendarme')).toBe(true);
    expect(peloton.squad.name).toBe('ÉPERVIER 1');
    expect(peloton.groups.length).toBe(2);
    expect(countPoste(peloton.people, 'bouclier')).toBe(7);

    const centaure = pt.units.createEquipage('centaure', { x: 0, z: 150, heading: 0 });
    expect(centaure.people.length).toBe(3);
    expect(centaure.squad.kind).toBe('equipage');
    expect(centaure.squad.name).toBe('CENTAURE 1');
    const engin = centaure.vehicles[0];
    expect(centaure.squad.vehicleId).toBe(engin.id);
    expect(centaure.people.every((p) => p.vehicleId === engin.id)).toBe(true);
    const driver = centaure.people.find((p) => p.poste === 'conducteur')!;
    expect(engin.def.seats[driver.seat].role).toBe('driver');
    // l'équipage conduit son engin sur ordre (pilote automatique du module des véhicules)
    ctx.squads.issue(centaure.squad.id, { type: 'avancer', x: 0, z: 230 });
    pt.step(1);
    expect(pt.status.of(centaure.squad.id)!.phase).toBe('mouvement');
    pt.run(60, 1, () => pt.status.of(centaure.squad.id)!.phase === 'en_place');
    console.log('centaure — arrivé à', engin.x.toFixed(1), engin.z.toFixed(1), '| phase', pt.status.of(centaure.squad.id)!.phase);
    expect(Math.hypot(engin.x, engin.z - 230)).toBeLessThan(8);
  });

  it('place du joueur : équipier, son emplacement lui est réservé et publié ; il n\'est jamais piloté', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -80, heading: NORTH, layout: 'ligne' });
    const me = sec.people.find((p) => p.poste === 'bouclier')!;
    ctx.player.possess(me.id, 'crs');
    expect(me.isPlayer).toBe(true);
    const x0 = me.x;
    const z0 = me.z;
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
    pt.run(40, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    pt.step(3);
    // le joueur n'a pas bougé : l'IA ne le pilote pas
    expect(Math.hypot(me.x - x0, me.z - z0)).toBeLessThan(0.3);
    const slot = pt.slots.slotOf(me.id)!;
    expect(slot).not.toBeNull();
    expect(Math.abs(slot.z + 100)).toBeLessThan(0.05);
    expect(pt.slots.distanceToSlot(me.id)).toBeGreaterThan(15);
    // sa place est restée libre dans le rang : aucun collègue à moins de 0,6 m de l'emplacement
    const front = frontRank(pt, sec.squad.id);
    expect(front.includes(me)).toBe(true);
    for (const p of sec.people) if (p !== me) expect(Math.hypot(p.x - slot.x, p.z - slot.z)).toBeGreaterThan(0.6);
    // les autres sont alignés
    expect(fitLine(front.filter((p) => p !== me)).error).toBeLessThan(0.5);
    const sx = slot.x;
    const sz = slot.z;
    // il rejoint lui-même sa place (commande du joueur simulée) : l'emplacement n'a pas bougé
    me.x = sx;
    me.z = sz;
    pt.step(1);
    expect(pt.slots.distanceToSlot(me.id)).toBeLessThan(0.3);
    // chef : s'il commande, ses ordres passent par ctx.squads.issue et sont exécutés immédiatement
    const chief = ctx.people.get(sec.squad.leaderId)!;
    ctx.player.possess(chief.id, 'chef_groupe');
    ctx.squads.issue(sec.squad.id, { type: 'avancer', x: 0, z: -110, heading: NORTH, issuedBy: chief.id });
    pt.step(1.5);
    const moving = sec.people.filter((p) => !p.isPlayer && Math.hypot(p.vx, p.vz) > 0.3).length;
    expect(moving).toBeGreaterThanOrEqual(13);
  });
});
