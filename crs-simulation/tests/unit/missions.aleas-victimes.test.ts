// Aléas des phases avec de VRAIES personnes :
//  - « Un manifestant glisse », « malaise »… ouvraient un incident « blessé » abstrait (un lieu, personne à terre) :
//    le street medic, le pompier ou le SAMU guidés vers le repère ne trouvaient personne à soigner, et leur objectif
//    « soigner / secourir » (compté sur 'person:treated') était inatteignable ;
//  - « grenades lacrymogènes » n'émettaient aucun gaz : medecin-01 (« rincer quinze personnes ») n'avait personne à
//    rincer ; une « bouteille de gaz » (incendie) ne doit pas, elle, gazer la foule.
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
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as env } from '@/env';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as missions, missionById, missionConfig } from '@/gameplay/missions';
import { PhaseAleas } from '@/gameplay/missions/aleas';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import type { GameContext, SessionConfig } from '@/core/contracts';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, session];

async function start() {
  const t = createTestContext({ seed: 3, strict: false, modules: SIM });
  await t.start({ mode: 'libre', role: 'crs', place: 'essai', x: -10, z: 15, crowdSize: 160, tension: 0.2, volatility: 0.2, duration: 'standard', weather: 'clair' });
  t.step(20);
  return t;
}

function gassed(ctx: GameContext, min = 0.12): number {
  return ctx.people.list.filter((p) => p.faction === 'protest' && p.gas > min).length;
}

describe('aléas des phases : de vraies victimes', () => {
  it('« un manifestant glisse » : une vraie personne à terre, blessée, rattachée à l\'incident « blessé »', async () => {
    const t = await start();
    const { ctx } = t;
    new PhaseAleas().play(ctx, 'Un manifestant glisse sur le pavé mouillé');
    t.step(2);
    const inc = ctx.service<IncidentsApi>(EXT.incidents)!;
    const b = inc.list.find((i) => i.kind === 'blesse');
    expect(b, 'incident blessé ouvert').toBeTruthy();
    expect(b!.targetKind).toBe('person');
    const v = ctx.people.get(b!.targetId)!;
    expect(v, 'victime réelle').toBeTruthy();
    expect(v.posture).toBe('down');
    expect(v.injury).not.toBe('none');
    t.step(60);
    expect(v.posture, 'reste à terre en attendant les soins').toBe('down');
  }, 300000);

  it('une « bouteille de gaz » (incendie) ne gaze personne ; une salve lacrymogène gaze le groupe visé', async () => {
    const t = await start();
    const { ctx } = t;
    const a = new PhaseAleas();
    a.play(ctx, 'Une bouteille de gaz est signalée dans la cage d’escalier');
    for (let i = 0; i < 15; i++) { a.update(ctx); t.step(1); }
    expect(gassed(ctx), 'bouteille de gaz : pas de lacrymogène').toBe(0);
    a.play(ctx, 'Des grenades lacrymogènes tombent près du groupe');
    let most = 0;
    for (let i = 0; i < 30; i++) { a.update(ctx); t.step(1); most = Math.max(most, gassed(ctx)); }
    expect(most, 'personne gazé par la salve').toBeGreaterThan(0);
  }, 300000);

  it('medecin-01 « Sérum physiologique » : au moins quinze personnes gazées à rincer près du médecin', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: [env, ...SIM, rescue, missions] });
    await t.ready;
    await t.start(missionConfig(missionById('medecin-01-serum-physiologique')!, t.ctx.world) as SessionConfig);
    const { ctx } = t;
    const seen = new Set<number>();
    for (let i = 0; i < 150; i++) {
      t.step(1);
      const me = ctx.player.person()!;
      for (const p of ctx.people.list) if (p.faction === 'protest' && p.gas > 0.12 && Math.hypot(p.x - me.x, p.z - me.z) < 80) seen.add(p.id);
    }
    console.log(`medecin-01 : ${seen.size} personnes gazées (gaz > 0,12) à moins de 80 m en 150 s`);
    expect(seen.size).toBeGreaterThanOrEqual(15);
  }, 600000);
});
