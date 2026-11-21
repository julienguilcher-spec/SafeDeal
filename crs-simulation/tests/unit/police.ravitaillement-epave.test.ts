// Ravitaillement des agents IA : jamais à un fourgon en feu ou calciné (les caisses de munitions y sont perdues).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { startPolice } from '@/sim/police/testkit';

const MODULES = [world, people, items, hazards, law];
const NORTH = Math.PI;

function count(p: Person, id: string): number {
  const s = p.inventory.find((i) => i.id === id);
  return s ? s.count : 0;
}

describe('police — ravitaillement et fourgon en feu', () => {
  it('ordre « ravitailler » : aucun agent ne puise dans la réserve d’un fourgon en feu', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -90, heading: NORTH, layout: 'ligne', vehicles: true });
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
    pt.run(40, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    const lanceur = sec.people.find((p) => p.poste === 'lanceur')!;
    ctx.actions.remove(lanceur, 'grenade_lacrymo', 4);
    expect(count(lanceur, 'grenade_lacrymo')).toBe(0);
    // tous les véhicules de la section brûlent
    for (const v of sec.vehicles) {
      v.state = 'burning';
      v.burning = 0.7;
    }
    const reserves0 = sec.vehicles.map((v) => pt.units.reserveOf(v.id)!.lacrymoMain);
    ctx.squads.issue(sec.squad.id, { type: 'ravitailler' });
    pt.step(60);
    const reserves1 = sec.vehicles.map((v) => pt.units.reserveOf(v.id)!.lacrymoMain);
    expect(reserves1).toEqual(reserves0);
    expect(count(lanceur, 'grenade_lacrymo')).toBe(0);
  });

  it('réserve d’extincteur entamée : l’agent ne reçoit que ce que contient la réserve (pas un appareil plein tiré de rien)', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const sec = pt.units.createSection({ x: 0, z: -90, heading: NORTH, layout: 'ligne', vehicles: true });
    ctx.squads.issue(sec.squad.id, { type: 'ligne', x: 0, z: -100, heading: NORTH });
    pt.run(40, 0.5, () => pt.status.of(sec.squad.id)!.phase === 'en_place');
    const ext = sec.people.find((p) => p.poste === 'extincteur')!;
    const st = ext.inventory.find((s) => s.id === 'extincteur')!;
    st.count = 0;
    st.state = 0;
    // 5 s de poudre en tout dans les véhicules de la section
    for (const v of sec.vehicles) pt.units.reserveOf(v.id)!.extincteur = 0;
    pt.units.reserveOf(sec.vehicles[0].id)!.extincteur = 5;
    let done = false;
    ctx.events.onAny('police:order_done', (e) => {
      if ((e as { type: string }).type === 'ravitailler') done = true;
    });
    ctx.squads.issue(sec.squad.id, { type: 'ravitailler' });
    pt.run(180, 1, () => done);
    const total = sec.vehicles.reduce((n, v) => n + pt.units.reserveOf(v.id)!.extincteur, 0);
    expect(total).toBe(0);
    expect(count(ext, 'extincteur')).toBe(5);
  });

  it('commandant joueur : son ordre « ravitailler » à une section est exécuté de bout en bout', async () => {
    const pt = await startPolice(MODULES, { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: -80, heading: NORTH, vehicles: true });
    pt.step(1);
    const chief = cie.leader!;
    ctx.player.possess(chief.id, 'commandant');
    const sec = ctx.squads.childrenOf(cie.squad.id).find((s) => s.kind === 'section')!;
    ctx.squads.issue(sec.id, { type: 'ligne', x: 0, z: -110, heading: NORTH, issuedBy: chief.id });
    pt.run(60, 0.5, () => pt.status.of(sec.id)!.phase === 'en_place');
    const members: Person[] = [];
    pt.units.members(sec.id, members);
    const lanceurs = members.filter((p) => p.poste === 'lanceur');
    for (const l of lanceurs) ctx.actions.remove(l, 'grenade_lacrymo');
    pt.step(0.5);
    const reserve0 = pt.status.of(sec.id)!.reserve.lacrymoMain; // l'état est un objet réutilisé : on garde le nombre
    let done: { ok: boolean } | null = null;
    ctx.events.onAny('police:order_done', (e) => {
      const d = e as { type: string; squadId: number; ok: boolean };
      if (d.type === 'ravitailler' && d.squadId === sec.id) done = d;
    });
    ctx.squads.issue(sec.id, { type: 'ravitailler', issuedBy: chief.id });
    pt.run(240, 1, () => done !== null);
    expect(done).not.toBeNull();
    expect(done!.ok).toBe(true);
    for (const l of lanceurs) expect(count(l, 'grenade_lacrymo')).toBe(4);
    const after = pt.status.of(sec.id)!;
    expect(after.reserve.lacrymoMain).toBe(reserve0 - 4 * lanceurs.length);
  });
});

