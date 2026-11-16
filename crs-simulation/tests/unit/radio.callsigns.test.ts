import { describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/gameplay/radio';
import type { CallsignBook } from '@/gameplay/radio';
import { RADIO_CALLSIGNS_SERVICE } from '@/gameplay/radio';

async function boot(extra?: Record<string, unknown>): Promise<{ ctx: GameContext; calls: CallsignBook }> {
  const t = createTestContext({ seed: 4, modules: [createSystems] });
  await t.start(extra ? { extra } : {});
  return { ctx: t.ctx, calls: t.ctx.require<CallsignBook>(RADIO_CALLSIGNS_SERVICE) };
}

describe('radio — indicatifs', () => {
  it('salle, compagnie et commandant unique : le chef parle sous l\'indicatif de sa compagnie (bible E.5)', async () => {
    const { calls } = await boot();
    expect(calls.central).toBe('CENTRAL');
    expect(calls.company).toBe('MISTRAL');
    expect(calls.commandant).toBe('MISTRAL');
    expect(calls.spoken(calls.commandant)).toBe('MISTRAL');
  });

  it('le nom de la compagnie vient de la session', async () => {
    const { calls } = await boot({ compagnie: 'Sirocco' });
    expect(calls.company).toBe('SIROCCO');
    expect(calls.commandant).toBe('SIROCCO');
  });

  it('compagnie, sections numérotées, groupes ALFA / BRAVO / CHARLIE', async () => {
    const { ctx, calls } = await boot();
    const cie = ctx.squads.create('compagnie', 'police', 'Compagnie');
    const s1 = ctx.squads.create('section', 'police', 'S1', cie.id);
    const s2 = ctx.squads.create('section', 'police', 'S2', cie.id);
    const a = ctx.squads.create('groupe', 'police', 'g', s2.id);
    const b = ctx.squads.create('groupe', 'police', 'g', s2.id);
    const c = ctx.squads.create('groupe', 'police', 'g', s2.id);
    expect(calls.callsign(cie)).toBe('MISTRAL');
    expect(calls.callsign(s1)).toBe('MISTRAL 1');
    expect(calls.callsign(s2)).toBe('MISTRAL 2');
    expect(calls.callsign(a)).toBe('MISTRAL 2 ALFA');
    expect(calls.callsign(b)).toBe('MISTRAL 2 BRAVO');
    expect(calls.callsign(c)).toBe('MISTRAL 2 CHARLIE');
    expect(calls.callsign(s2.id)).toBe('MISTRAL 2');
    expect(calls.spoken('MISTRAL 2 BRAVO')).toBe('MISTRAL DEUX BRAVO');
  });

  it('au-delà de trois groupes : alphabet radio réglementaire (DELTA, ECHO, FOXTROT)', async () => {
    const { ctx, calls } = await boot();
    const s = ctx.squads.create('section', 'police', 'S');
    const noms: string[] = [];
    for (let i = 0; i < 6; i++) noms.push(calls.callsign(ctx.squads.create('groupe', 'police', 'g', s.id)));
    expect(noms).toEqual(['MISTRAL 1 ALFA', 'MISTRAL 1 BRAVO', 'MISTRAL 1 CHARLIE', 'MISTRAL 1 DELTA', 'MISTRAL 1 ECHO', 'MISTRAL 1 FOXTROT']);
  });

  it('moyens spéciaux reconnus par le nom ou le type', async () => {
    const { ctx, calls } = await boot();
    expect(calls.callsign(ctx.squads.create('equipage', 'police', 'Centaure'))).toBe('CENTAURE 1');
    expect(calls.callsign(ctx.squads.create('equipage', 'police', 'Canon à eau'))).toBe('NEPTUNE 1');
    expect(calls.callsign(ctx.squads.create('equipage', 'police', 'Drone de surveillance'))).toBe('ICARE');
    expect(calls.callsign(ctx.squads.create('binome', 'police', 'binôme'))).toBe('FAUCON 1');
    expect(calls.callsign(ctx.squads.create('binome', 'police', 'binôme'))).toBe('FAUCON 2');
    expect(calls.callsign(ctx.squads.create('peloton', 'police', 'peloton'))).toBe('ÉPERVIER 1');
    expect(calls.callsign(ctx.squads.create('secours', 'medic', 'Équipe médicale'))).toBe('SANTÉ 1');
    expect(calls.callsign(ctx.squads.create('secours', 'rescue', 'Sapeurs-pompiers'))).toBe('SAPEUR 1');
    expect(calls.special('canon')).toBe('NEPTUNE 1');
    expect(calls.special('liaison')).toBe('LIAISON');
  });

  it('special() retrouve l\'unité réelle quand elle existe', async () => {
    const { ctx, calls } = await boot();
    expect(calls.special('centaure')).toBe('CENTAURE 1');
    ctx.squads.create('equipage', 'police', 'Centaure 2');
    expect(calls.special('centaure')).toBe('CENTAURE 2');
  });

  it('un nom d\'unité déjà écrit dans le plan d\'indicatifs est conservé, en capitales', async () => {
    const { ctx, calls } = await boot();
    expect(calls.callsign(ctx.squads.create('section', 'police', 'Mistral 7'))).toBe('MISTRAL 7');
    expect(calls.callsign(ctx.squads.create('groupe', 'police', 'mistral 7 bravo'))).toBe('MISTRAL 7 BRAVO');
    expect(calls.callsign(ctx.squads.create('groupe', 'police', 'Mistral 2 Alpha'))).toBe('MISTRAL 2 ALFA');
    expect(calls.callsign(ctx.squads.create('peloton', 'police', 'Épervier 3'))).toBe('ÉPERVIER 3');
    expect(calls.callsign(ctx.squads.create('compagnie', 'police', 'ÉPERVIER'))).toBe('ÉPERVIER');
  });

  it('une deuxième compagnie garde son nom de vent : elle n\'est pas rebaptisée MISTRAL', async () => {
    const { ctx, calls } = await boot();
    const mistral = ctx.squads.create('compagnie', 'police', 'MISTRAL');
    const tramontane = ctx.squads.create('compagnie', 'police', 'Tramontane');
    const t2 = ctx.squads.create('section', 'police', 'Tramontane 2', tramontane.id);
    const t2b = ctx.squads.create('groupe', 'police', 'TRAMONTANE 2 BRAVO', t2.id);
    const zephyr = ctx.squads.create('section', 'police', 'zéphyr 1');
    expect(calls.callsign(mistral)).toBe('MISTRAL');
    expect(calls.callsign(tramontane)).toBe('TRAMONTANE');
    expect(calls.callsign(t2)).toBe('TRAMONTANE 2');
    expect(calls.callsign(t2b)).toBe('TRAMONTANE 2 BRAVO');
    expect(calls.callsign(zephyr)).toBe('ZÉPHYR 1');
    // le chef d'une compagnie parle sous l'indicatif de SA compagnie
    const chef = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, rank: 'commandant', poste: 'commandant_unite', squadId: tramontane.id });
    expect(calls.callsign(chef)).toBe('TRAMONTANE');
  });

  it('personnes : commandant, membre d\'unité, télépilote, pompier, journaliste', async () => {
    const { ctx, calls } = await boot();
    const sq = ctx.squads.create('section', 'police', 'S');
    const cdt = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, rank: 'commandant', poste: 'commandant_unite' });
    const aut = ctx.people.spawn({ kind: 'commissaire', x: 0, z: 0, rank: 'commissaire' });
    const membre = ctx.people.spawn({ kind: 'crs', x: 0, z: 0, squadId: sq.id });
    const libre = ctx.people.spawn({ kind: 'crs', x: 0, z: 0 });
    expect(calls.callsign(cdt)).toBe('MISTRAL');
    expect(calls.callsign(aut)).toBe('MISTRAL'); // l'alias « commissaire » est le même chef unique
    expect(calls.callsign(membre)).toBe('MISTRAL 1');
    expect(calls.callsign(libre)).toBe('MISTRAL');
    expect(calls.callsign(ctx.people.spawn({ kind: 'telepilote', x: 0, z: 0 }))).toBe('ICARE');
    expect(calls.callsign(ctx.people.spawn({ kind: 'pompier', x: 0, z: 0 }))).toBe('SAPEUR 1');
    expect(calls.callsign(ctx.people.spawn({ kind: 'samu', x: 0, z: 0 }))).toBe('SANTÉ 1');
    expect(calls.callsign(ctx.people.spawn({ kind: 'journaliste', x: 0, z: 0 }))).toBe('PRESSE');
    expect(calls.callsign(membre.id)).toBe('MISTRAL 1'); // par identifiant
  });

  it('voix stable par indicatif, dans les bornes, et variée entre indicatifs', async () => {
    const { calls } = await boot();
    const noms = ['CENTRAL', 'MISTRAL', 'MISTRAL 1', 'MISTRAL 2', 'MISTRAL 3', 'FAUCON 1', 'ICARE', 'NEPTUNE 1', 'SANTÉ 1'];
    const voix = noms.map((n) => calls.voiceOf(n));
    for (const v of voix) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
    expect(noms.map((n) => calls.voiceOf(n))).toEqual(voix);
    expect(calls.voiceOf('mistral 1')).toBe(calls.voiceOf('MISTRAL 1'));
    expect(new Set(voix).size).toBeGreaterThanOrEqual(3);
  });
});
