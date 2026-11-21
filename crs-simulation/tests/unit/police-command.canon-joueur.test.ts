// Engin lanceur d'eau dont le joueur tient le volant et les canons : l'IA de l'équipage (command/canon.ts) ne fait pas
// le plein à sa place, n'importe où, dès que la cuve passe sous le seuil bas ; c'est au joueur d'aller à une bouche
// d'incendie (ou de demander le ravitaillement), comme l'indique l'aide à l'écran.
import { describe, expect, it } from 'vitest';

import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
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
import { createSystems as session } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 1, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

describe('canon à eau du joueur : cuve basse', () => {
  it('l’équipage IA ne refait pas le plein de l’engin du joueur loin de toute bouche', async () => {
    const t = createTestContext({ seed: 11, strict: true, modules: SIM });
    await t.start({ mode: 'libre', missionId: '', role: 'operateur_canon_eau', rank: null, place: 'essai', x: -10, z: 15, crowdSize: 0, tension: 0, volatility: 0, duration: 'standard', extra: { moyens: MEANS } } as never);
    const { ctx } = t;
    t.step(2);
    const me = ctx.player.person()!;
    const v = ctx.vehicles.get(ctx.squads.get(me.squadId)!.vehicleId)!;
    expect(v.kind).toBe('canon_eau');
    if (me.vehicleId !== v.id || me.seat !== 0) {
      if (me.vehicleId !== 0) ctx.vehicles.exit(me);
      if (v.seats[0] !== 0) ctx.vehicles.exit(ctx.people.get(v.seats[0])!);
      me.x = v.x + 3; me.z = v.z;
      expect(ctx.vehicles.enter(me, v, 0)).toBe(true);
    }
    // bouche d'incendie la plus proche : le plein « réglementaire » n'est possible qu'à proximité
    let hydrant = Infinity;
    for (const p of ctx.props.list) if (p.kind === 'bouche_incendie') hydrant = Math.min(hydrant, Math.hypot(p.x - v.x, p.z - v.z));
    const cap = v.def.turrets[0]!.capacity;
    for (let i = 0; i < v.def.turrets.length; i++) if (v.def.turrets[i]!.kind === 'canon_eau') v.turretAmmo[i] = v.def.turrets[i]!.capacity * 0.05;
    const low = v.turretAmmo[0]!;
    const said: string[] = [];
    ctx.events.on('radio:message', (e) => { said.push(`${e.msg.from} : ${e.msg.text}`); });
    t.step(40);
    console.log(`bouche la plus proche à ${hydrant.toFixed(0)} m ; cuve ${low.toFixed(0)} → ${v.turretAmmo[0]!.toFixed(0)} l (capacité ${cap}) ; ${said.filter((s) => /plein|ravitaill/i.test(s)).join(' | ')}`);
    expect(me.vehicleId).toBe(v.id);
    // loin d'une bouche (plus de 60 m), la cuve ne se remplit pas toute seule
    if (hydrant > 60) expect(v.turretAmmo[0]!).toBeLessThan(low + 1);
    // et l'équipage n'annonce pas un repli que le joueur, au volant, n'a pas décidé
    expect(said.filter((s) => /je me replie pour ravitailler/.test(s))).toEqual([]);
  }, 120000);
});
