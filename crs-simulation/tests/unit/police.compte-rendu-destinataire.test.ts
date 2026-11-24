// Compte rendu d'une section à qui son propre chef (membre de son groupe de commandement) a donné l'ordre : elle rend
// compte à l'échelon au-dessus d'elle, jamais à l'un de ses propres groupes (« FILTRE CHARLIE ICI FILTRE »).
import { describe, expect, it } from 'vitest';

import type { SquadOrder } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as law } from '@/gameplay/law';
import { unitOf } from '@/sim/police/brain';
import { superior } from '@/sim/police/radio';
import { startPolice } from '@/sim/police/testkit';

describe('destinataire du compte rendu', () => {
  it('ordre donné par le chef de section (membre d’un groupe de la section) : compte rendu au-dessus de la section', async () => {
    const pt = await startPolice([world, people, law], { mode: 'test', x: 0, z: -100 });
    const { ctx } = pt;
    const cie = pt.units.createCompany({ x: 0, z: -95, heading: Math.PI, vehicles: false, callsign: 'MISTRAL' });
    const sec = cie.sections[0]!;
    pt.step(1);
    const chief = ctx.people.get(sec.leaderId)!;
    // le chef de section est rangé dans un groupe de sa section
    expect(chief.squadId).not.toBe(sec.id);
    expect(ctx.squads.get(chief.squadId)!.parentId).toBe(sec.id);
    const order = { ...sec.order, type: 'interpeller', issuedBy: chief.id } as SquadOrder;
    const to = superior(pt.system.k, unitOf(sec)!, order);
    console.log('compte rendu de', sec.name, 'à', to);
    expect(to).toBe('MISTRAL');
    // un groupe dont le chef a donné l'ordre rend compte à sa section
    const grp = ctx.squads.get(chief.squadId)!;
    expect(superior(pt.system.k, unitOf(grp)!, order)).toBe(sec.name);
  });
});
