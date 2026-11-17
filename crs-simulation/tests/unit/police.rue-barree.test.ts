// Une unité envoyée sur une rue la barre de façade à façade : plus personne ne passe, ni dans un sens ni dans l'autre
// (manifestants poussant d'un côté, passants de l'autre) ; forces de l'ordre et secours passent ; la rue est déclarée
// fermée ; trop peu nombreuse, l'unité tient le milieu, rend compte de la largeur non tenue et demande un renfort.
// Quartier d'essai : rue du Pont (14 m entre façades, axe x = 0), avenue de l'Essai (40 m, axe z = 0).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { TrafficControlApi } from '@/core/extensions';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as traffic } from '@/sim/traffic';
import { BARRAGE_EVENT, POLICE_BARRAGES_SERVICE } from '@/sim/police/api';
import type { BarragesApi } from '@/sim/police/api';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { startPolice } from '@/sim/police/testkit';
import { startCommand } from '@/sim/police/command/testkit';
import type { PoliceTest } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law, traffic];
const CONFIG = { mode: 'test' as const, x: 0, z: 0, extra: { 'traffic.vehicles': 0, 'traffic.pedestrians': 0 } };
const LINE_Z = -100;

/** Fait marcher chacun vers son but (commande directe, sans IA : il force le passage tant qu'il peut). */
function walk(list: readonly Person[], goal: (p: Person, i: number) => { x: number; z: number }, run = false): void {
  list.forEach((p, i) => {
    const g = goal(p, i);
    const dx = g.x - p.x;
    const dz = g.z - p.z;
    const l = Math.hypot(dx, dz);
    p.cmd.moveX = l > 0.3 ? dx / l : 0;
    p.cmd.moveZ = l > 0.3 ? dz / l : 0;
    p.cmd.gait = run ? 1 : 0;
    p.cmd.faceMove = true;
  });
}

function barrageOf(pt: PoliceTest, squadId: number) {
  return pt.ctx.require<BarragesApi>(POLICE_BARRAGES_SERVICE).list.find((b) => b.squadId === squadId);
}

describe('police — rue barrée', () => {
  it('une section envoyée sur un point de la rue la barre de façade à façade, face à la foule, et personne ne passe', async () => {
    const pt = await startPolice(MODULES, CONFIG);
    const { ctx } = pt;
    // la foule est au nord (z < −100) : le barrage doit lui faire face
    const crowd: Person[] = [];
    for (let i = 0; i < 100; i++) crowd.push(ctx.people.spawn({ kind: 'manifestant', x: -6 + (i % 10) * 1.3, z: -160 - Math.floor(i / 10) * 1.4 }));
    walk(crowd, (p) => p);
    const sec = pt.units.createSection({ x: 0, z: -40, heading: Math.PI, vehicles: false, callsign: 'MISTRAL 1' });
    // ordre « par défaut » de la carte tactique : aller au point (cap de marche, vers le nord)
    ctx.squads.issue(sec.squad.id, { type: 'avancer', x: 1.5, z: LINE_Z, heading: Math.PI, width: 0 });
    let b = barrageOf(pt, sec.squad.id);
    pt.run(120, 1, () => {
      b = barrageOf(pt, sec.squad.id);
      return b?.state === 'en_place';
    });
    pt.step(3);
    b = barrageOf(pt, sec.squad.id);
    console.log('barrage :', JSON.stringify(b));
    expect(b).toBeDefined();
    expect(b!.state).toBe('en_place');
    expect(b!.covered).toBeGreaterThanOrEqual(0.95);
    expect(b!.width).toBeGreaterThan(13);
    expect(b!.width).toBeLessThan(15);
    expect(b!.street).toBe('Rue du Pont');
    expect(Math.cos(b!.heading - Math.PI)).toBeGreaterThan(0.99);
    // rue déclarée fermée
    const tr = ctx.require<TrafficControlApi>(EXT.traffic);
    expect(tr.closures.some((c) => c.squadId === sec.squad.id)).toBe(true);
    // personne dans un mur ni sur un collègue
    const walkers = sec.people.filter((p) => p.vehicleId === 0);
    for (const p of walkers) expect(ctx.world.isFree(p.x, p.z, 0.05)).toBe(true);
    for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
      expect(Math.hypot(walkers[i].x - walkers[j].x, walkers[i].z - walkers[j].z)).toBeGreaterThan(0.45);
    }

    // 100 manifestants poussent vers le sud, 30 passants viennent du sud vers le nord
    const peds: Person[] = [];
    for (let i = 0; i < 30; i++) peds.push(ctx.people.spawn({ kind: 'manifestant', faction: 'civil', x: -6 + (i % 10) * 1.3, z: -70 + Math.floor(i / 10) * 1.4 }));
    const all = crowd.concat(peds);
    const side0 = all.map((p) => Math.sign(p.z - LINE_Z));
    let crossed = 0;
    pt.run(240, 0.5, () => {
      walk(crowd, () => ({ x: 0, z: -20 }), true);
      walk(peds, () => ({ x: 0, z: -170 }));
      const was = crossed;
      crossed = all.filter((p, i) => (p.z - LINE_Z) * side0[i] < -2.5).length;
      if (crossed > was) {
        const g = (pt.system as any).k.roots[0].groups[0];
        console.log('CROSS t', ctx.clock.now.toFixed(1), all.filter((p, i) => (p.z - LINE_Z) * side0[i] < -2.5).map((p) => `${p.faction} ${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' '), '| front', g.front.map((a: any) => `${a.p.x.toFixed(1)},${a.p.z.toFixed(1)}${a.p.posture === 'down' ? 'D' : ''}${a.op ? 'O' : ''}`).join(' '), 'door', g.doorW, 'cordons', (ctx.service('police.cordons') as any).count);
      }
    });
    const hurt = all.filter((p) => p.injury !== 'none').length;
    console.log(`passés : ${crossed} sur ${all.length} ; blessés : ${hurt} ; barrage ${JSON.stringify(barrageOf(pt, sec.squad.id))}`);
    expect(crossed).toBe(0);
    expect(hurt).toBe(0);
  }, 300000);

  it('les forces de l’ordre et les secours passent, pas un passant', async () => {
    const pt = await startPolice(MODULES, CONFIG);
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -80, heading: Math.PI, vehicles: false });
    ctx.squads.issue(sec.squad.id, { type: 'couper_circulation', x: 0, z: LINE_Z, heading: Math.PI, width: 0 });
    pt.run(120, 1, () => barrageOf(pt, sec.squad.id)?.state === 'en_place');
    expect(barrageOf(pt, sec.squad.id)?.state).toBe('en_place');
    const cop = ctx.people.spawn({ kind: 'crs', x: 2, z: -85 });
    const medic = ctx.people.spawn({ kind: 'samu', x: -2, z: -85 });
    const passer = ctx.people.spawn({ kind: 'manifestant', faction: 'civil', x: 4, z: -85 });
    const go = [cop, medic, passer];
    pt.run(60, 0.5, () => walk(go, () => ({ x: 0, z: -130 })));
    console.log('après 60 s :', go.map((p) => `${p.kind} z ${p.z.toFixed(1)}`).join(', '));
    expect(cop.z).toBeLessThan(LINE_Z - 5);
    expect(medic.z).toBeLessThan(LINE_Z - 5);
    expect(passer.z).toBeGreaterThan(LINE_Z);
  }, 300000);

  it('trop peu nombreuse pour la largeur : barrage incomplet, compte rendu et demande de renfort', async () => {
    const pt = await startPolice(MODULES, CONFIG);
    const { ctx } = pt;
    const events: { squadId: number; state: string }[] = [];
    ctx.events.onAny(BARRAGE_EVENT, (e) => events.push({ ...(e as { squadId: number; state: string }) }));
    // avenue de l'Essai : 40 m entre façades, une section n'en tient qu'une partie
    const sec = pt.units.createSection({ x: -215, z: 8, heading: -Math.PI / 2, vehicles: false, callsign: 'MISTRAL 2' });
    ctx.squads.issue(sec.squad.id, { type: 'tenir', x: -240, z: 6, heading: -Math.PI / 2, width: 0 });
    pt.run(120, 1, () => barrageOf(pt, sec.squad.id)?.state === 'incomplet');
    const b = barrageOf(pt, sec.squad.id);
    console.log('barrage :', JSON.stringify(b));
    console.log(ctx.radio.log.map((m) => m.from + ' : ' + m.text).join('\n'));
    expect(b?.state).toBe('incomplet');
    expect(b!.width).toBeGreaterThan(30);
    expect(b!.covered).toBeLessThan(0.95);
    expect(b!.covered).toBeGreaterThan(0.2);
    expect(events.some((e) => e.squadId === sec.squad.id && e.state === 'incomplet')).toBe(true);
    expect(ctx.radio.log.some((m) => m.from === 'MISTRAL 2' && /Largeur insuffisante, .* mètres non tenus .*demande renfort/.test(m.text))).toBe(true);
    // la rue est fermée quand même (le milieu est tenu)
    expect(ctx.require<TrafficControlApi>(EXT.traffic).closures.some((c) => c.squadId === sec.squad.id)).toBe(true);
    // l'unité s'en va : la rue est rouverte, le barrage disparaît
    ctx.squads.issue(sec.squad.id, { type: 'colonne', x: -200, z: 8, heading: 0, width: 0 });
    pt.step(1);
    expect(barrageOf(pt, sec.squad.id)).toBeUndefined();
    expect(ctx.require<TrafficControlApi>(EXT.traffic).closures.some((c) => c.squadId === sec.squad.id)).toBe(false);
  }, 300000);

  it('joueur-commandant : l’adjoint propose un renfort pour le barrage incomplet (touche P)', async () => {
    const t = await startCommand([world, people, items, hazards, law, props, vehicles, traffic], { ...CONFIG, extra: { ...CONFIG.extra, 'commandement.adjoint': 4 } }, { seed: 21 });
    const { ctx } = t;
    const cie = t.units.createCompany({ x: -200, z: 8, heading: -Math.PI / 2, vehicles: false });
    ctx.player.possess(cie.leader!.id, 'commandant');
    t.step(2);
    const sec = ctx.squads.childrenOf(cie.squad.id)[0]!;
    // le joueur fait tenir l'avenue (40 m entre façades) à une seule section
    ctx.squads.issue(sec.id, { type: 'tenir', x: -240, z: 6, heading: -Math.PI / 2, width: 0, issuedBy: cie.leader!.id });
    let offer = t.api.proposals.find((p) => p.key === 'renfort:' + sec.id);
    t.run(150, 1, () => {
      offer = t.api.proposals.find((p) => p.key === 'renfort:' + sec.id);
      return offer !== undefined;
    });
    console.log('proposition :', offer?.text);
    expect(offer).toBeDefined();
    expect(offer!.executable).toBe(true);
    expect(offer!.text).toMatch(/largeur insuffisante.*renfort/);
    const before = ctx.squads.list.filter((q) => q.order.type === 'couper_circulation').length;
    expect(t.api.accept(offer!.id)).toBe(true);
    t.step(1);
    expect(ctx.squads.list.filter((q) => q.order.type === 'couper_circulation').length).toBeGreaterThan(before);
  }, 300000);
});
