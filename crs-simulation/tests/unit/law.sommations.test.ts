import { describe, expect, it } from 'vitest';
import type { GameEvents, Person } from '@/core/contracts';
import { commandant, commissaire, crowd, crs, fullSommations, person, protester, startLaw } from '@/gameplay/law/testkit';

describe('droit — textes des sommations', () => {
  it('reproduit au caractère près les phrases de l\'article R. 211-11', async () => {
    const { ctx } = await startLaw();
    expect(ctx.law.sommationText(0)).toBe('');
    expect(ctx.law.sommationText(1)).toBe(
      'Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux',
    );
    expect(ctx.law.sommationText(2)).toBe('Première sommation : nous allons faire usage de la force. Quittez immédiatement les lieux');
    expect(ctx.law.sommationText(3)).toBe('Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux');
    // formules antérieures au décret du 5 mai 2021 : à ne pas utiliser
    for (const stage of [1, 2, 3] as const) {
      expect(ctx.law.sommationText(stage)).not.toContain('on va faire usage');
      expect(ctx.law.sommationText(stage)).not.toContain('Dispersez-vous');
    }
  });
});

describe('droit — qui peut sommer', () => {
  it('le commandant, chef unique et autorité habilitée, prononce lui-même les sommations', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const cdt = commandant(ctx, 0, 0);
    expect(cdt.look.sash).toBe(true); // écharpe tricolore portée d'office par le commandant
    const compagnie = ctx.squads.create('compagnie', 'police', 'Mistral');
    ctx.squads.addMember(compagnie.id, cdt.id);
    crowd(ctx, 0, 20, 20);
    expect(ctx.law.sommation(cdt)).toBe(1);
    expect(ctx.law.roe.dispersionOrdered).toBe(true);
    expect(law.radio.at(-1)?.from).toBe('MISTRAL');
    expect(law.radio.at(-1)?.text).toMatch(/^CENTRAL ICI MISTRAL\. Attroupement constaté/);
    // le commissaire du contrat est un alias du même rôle
    const law2 = await startLaw();
    expect(law2.ctx.law.sommation(commissaire(law2.ctx, 0, 0))).toBe(1);
    expect(law2.radio.at(-1)?.from).toBe('AUTORITÉ');
  });

  it('refuse un gardien, un chef de groupe et un manifestant, avec un motif', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const gardien = crs(ctx, 0, 0);
    ctx.player.possess(gardien.id);
    expect(ctx.law.sommation(gardien)).toBe(0);
    expect(ctx.law.roe.sommation).toBe(0);
    expect(ctx.law.roe.dispersionOrdered).toBe(false);
    expect(law.records.lastRefusal).toContain('Seul le commandant');
    expect(law.notices.at(-1)?.text).toContain('écharpe tricolore');
    expect(law.notices.at(-1)?.kind).toBe('warn');
    expect(ctx.law.sommation(crs(ctx, 2, 0, { rank: 'brigadier_chef', poste: 'chef_groupe' }))).toBe(0);
    expect(ctx.law.sommation(protester(ctx, 4, 0))).toBe(0);
    expect(law.records.lastRefusal).toContain('autorité habilitée');
    expect(law.records.sommations).toHaveLength(0);
  });

  it('sans insigne tricolore, les sommations sont refusées ; écharpe ou brassard les rendent possibles', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const cdt = commandant(ctx, 0, 0);
    cdt.look.sash = false;
    expect(ctx.law.sommation(cdt)).toBe(0);
    expect(law.records.lastRefusal).toContain('écharpe');
    cdt.look.extras = { brassard_tricolore: 1 };
    expect(ctx.law.sommation(cdt)).toBe(1);
    // un officier désigné, à qui l'écharpe a été confiée, peut y procéder
    const law2 = await startLaw();
    const opj = crs(law2.ctx, 0, 0, { rank: 'capitaine' });
    expect(law2.ctx.law.sommation(opj)).toBe(0);
    opj.look.sash = true;
    expect(law2.ctx.law.sommation(opj)).toBe(1);
  });

  it('refuse une autorité hors de combat', async () => {
    const law = await startLaw();
    const cdt = commandant(law.ctx, 0, 0);
    law.ctx.health.setDown(cdt, true);
    expect(law.ctx.law.sommation(cdt)).toBe(0);
    expect(law.records.lastRefusal).toContain("pas en état");
  });
});

describe('droit — progression et délais', () => {
  it('annonce → première → dernière sommation, avec événements, radio et délais de la durée standard', async () => {
    const law = await startLaw();
    const { ctx, cfg } = law;
    expect([cfg.delayAnnonce, cfg.delaySommation, cfg.delayForce, cfg.delayArmes]).toEqual([30, 30, 20, 10]);
    const com = commissaire(ctx, 0, 0);
    crowd(ctx, 0, 20, 30);
    const events: GameEvents['law:sommation'][] = [];
    ctx.events.on('law:sommation', (e) => events.push(e));

    expect(ctx.law.sommation(com)).toBe(1);
    expect(ctx.law.roe.dispersionOrdered).toBe(true);
    expect(com.upper).toBe('megaphone');
    // trop tôt : refus motivé, l'étape ne change pas
    law.t.step(10);
    expect(ctx.law.sommation(com)).toBe(1);
    expect(law.records.lastRefusal).toMatch(/Délai insuffisant.*première sommation.*20 s/);
    law.t.step(20.1);
    expect(ctx.law.sommation(com)).toBe(2);
    law.t.step(29);
    expect(ctx.law.sommation(com)).toBe(2);
    expect(law.records.lastRefusal).toContain('dernière sommation');
    law.t.step(1.1);
    expect(ctx.law.sommation(com)).toBe(3);
    expect(ctx.law.roe.sommationAt).toBeCloseTo(ctx.clock.now, 5);

    expect(events.map((e) => e.stage)).toEqual([1, 2, 3]);
    expect(events.map((e) => e.text)).toEqual([1, 2, 3].map((s) => ctx.law.sommationText(s as 1 | 2 | 3)));
    expect(events[0]!.byId).toBe(com.id);
    const radio = law.radio.filter((m) => m.from === 'AUTORITÉ');
    expect(radio).toHaveLength(3);
    expect(radio[0]!.text).toContain('Annonce faite');
    expect(radio[1]!.text).toContain('Première sommation');
    expect(radio[2]!.text).toContain('Dernière sommation');
    expect(radio[2]!.channel).toBe('commandement');
    expect(law.records.sommations.map((s) => s.means)).toEqual(['megaphone', 'megaphone', 'megaphone']);
  });

  it('la force ne devient licite qu\'après le délai laissé à la foule, les armes qu\'après réitération', async () => {
    const law = await startLaw();
    const { ctx, cfg } = law;
    const com = commissaire(ctx, 0, 0);
    crowd(ctx, 0, 20, 30);
    fullSommations(law, com, false);
    const roe = ctx.law.roe;
    expect(roe.sommation).toBe(3);
    expect(roe.lawfulForce).toBe(1);
    law.t.step(cfg.delayForce - 1);
    expect(roe.lawfulForce).toBe(1);
    law.t.step(1.2);
    expect(roe.lawfulForce).toBe(3);
    // la dernière sommation vaut décision d'emploi de la force
    expect(roe.authorizedForce).toBe(3);
    // réitération : usage des armes après un nouveau délai
    expect(ctx.law.sommation(com)).toBe(3);
    expect(law.records.sommations.at(-1)?.reiteration).toBe(true);
    expect(roe.lawfulForce).toBe(3);
    law.t.step(cfg.delayArmes + 0.1);
    expect(roe.lawfulForce).toBe(4);
    expect(roe.authorizedForce).toBe(4);
    expect(law.radio.at(-1)?.text).toContain('réitérée');
  });

  it('les délais suivent la durée de la mission et restent paramétrables', async () => {
    const courte = await startLaw({ config: { duration: 'courte' } });
    expect([courte.cfg.delayAnnonce, courte.cfg.delaySommation, courte.cfg.delayForce, courte.cfg.delayArmes]).toEqual([15, 15, 10, 5]);
    const reel = await startLaw({ config: { duration: 'temps_reel' } });
    expect([reel.cfg.delayAnnonce, reel.cfg.delayForce]).toEqual([120, 60]);
    const sur = await startLaw({ config: { extra: { 'law.delays': { annonce: 3, sommation: 4 }, 'law.delayScale': 0.5 } } });
    expect([sur.cfg.delayAnnonce, sur.cfg.delaySommation, sur.cfg.delayForce, sur.cfg.delayArmes]).toEqual([3, 4, 10, 5]);
    // réglage direct par le service 'law.config'
    const com = commissaire(sur.ctx, 0, 0);
    sur.cfg.delayAnnonce = 1;
    sur.ctx.law.sommation(com);
    sur.t.step(1.1);
    expect(sur.ctx.law.sommation(com)).toBe(2);
  });
});

describe('droit — moyens de diffusion', () => {
  it('sans haut-parleur, la sommation à la voix est notée fragile ; une fusée rouge la complète', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0, false);
    crowd(ctx, 0, 30, 20);
    expect(ctx.law.sommation(com)).toBe(1);
    const first = law.records.sommations[0]!;
    expect(first.means).toBe('voix');
    expect(first.flare).toBe(false);
    expect(first.note).toContain('voix nue');
    expect(first.coverage).toBe(0);

    const law2 = await startLaw();
    const com2 = commissaire(law2.ctx, 0, 0, false);
    law2.ctx.actions.give(com2, 'fusee_sommation', 4);
    crowd(law2.ctx, 0, 30, 20);
    const fx: string[] = [];
    law2.ctx.events.on('fx', (e) => fx.push(e.id));
    law2.ctx.law.sommation(com2);
    const rec = law2.records.sommations[0]!;
    expect(rec.flare).toBe(true);
    expect(rec.note).toBe('');
    expect(rec.coverage).toBe(1);
    expect(law2.ctx.actions.has(com2, 'fusee_sommation')).toBe(3);
    expect(fx).toContain('feu_artifice');
  });

  it('la sonorisation d\'un véhicule de police porte plus loin que le mégaphone', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    crowd(ctx, 0, 100, 16);
    const v = ctx.vehicles.spawn('vl_commandement', 3, 0, 0, { faction: 'police' });
    v.def = { ...v.def, hasSiren: true };
    ctx.law.sommation(com);
    const rec = law.records.sommations[0]!;
    expect(rec.means).toBe('vehicule');
    expect(rec.heardRadius).toBe(law.cfg.vehicleSpeakerRange);
    expect(rec.coverage).toBe(1);
  });

  it('qualifier d\'attroupement un cortège calme est relevé comme une faute', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    ctx.player.possess(com.id);
    crowd(ctx, 0, 20, 20);
    ctx.law.sommation(com);
    expect(law.records.sommations[0]!.justified).toBe(false);
    expect(law.notices.some((n) => n.text.includes('cortège calme'))).toBe(true);
    expect(law.records.score).toBeLessThan(100);

    // avec des infractions constatées dans la zone, le constat est fondé
    const law2 = await startLaw();
    const com2 = commissaire(law2.ctx, 0, 0);
    const casseurs = crowd(law2.ctx, 0, 20, 4);
    for (const c of casseurs) law2.ctx.law.recordOffense(c, 'degradation', c.x, c.z);
    law2.ctx.law.sommation(com2);
    expect(law2.records.sommations[0]!.justified).toBe(true);
    expect(law2.records.score).toBe(100);
  });
});

describe('droit — après la dernière sommation', () => {
  it('ceux qui restent sciemment commettent le délit, ceux qui partent non', async () => {
    const law = await startLaw();
    const { ctx, cfg } = law;
    const com = commissaire(ctx, 0, 0);
    crs(ctx, 2, 0);
    const reste = protester(ctx, 0, 20, 'militant');
    const part = protester(ctx, 3, 20);
    const loin = protester(ctx, 0, 100); // hors de portée du mégaphone : n'a pas entendu
    const blesse = protester(ctx, -3, 20);
    const journaliste = person(ctx, 'journaliste', 5, 18);
    const offenses: number[] = [];
    ctx.events.on('law:offense', (e) => offenses.push(e.personId));
    fullSommations(law, com, false);
    // pendant le délai laissé à la foule, personne n'est en infraction
    law.t.step(cfg.delayForce - 0.5);
    expect(offenses).toHaveLength(0);
    // l'un s'en va (vitesse d'éloignement), l'autre reste ; le blessé à terre ne peut pas partir
    part.vz = 2;
    ctx.health.setDown(blesse, true);
    law.t.step(cfg.attroupementStay + 3);
    expect(offenses).toEqual([reste.id]);
    expect(reste.offenses.map((o) => o.type)).toEqual(['attroupement_apres_sommations']);
    expect(reste.offenses[0]!.witnessed).toBe(true);
    expect(ctx.law.canArrest(reste)).toBe(true);
    expect(part.offenses).toHaveLength(0);
    expect(loin.offenses).toHaveLength(0);
    expect(blesse.offenses).toHaveLength(0);
    expect(journaliste.offenses).toHaveLength(0);
    // une seule infraction par séquence, même en restant longtemps
    law.t.step(20);
    expect(reste.offenses).toHaveLength(1);
  });

  it('la dispersion effective clôt la séquence : retour au cadre du cortège', async () => {
    const law = await startLaw();
    const { ctx, cfg } = law;
    const com = commissaire(ctx, 0, 0);
    const foule = crowd(ctx, 0, 20, 40);
    fullSommations(law, com);
    expect(ctx.law.roe.lawfulForce).toBe(3);
    let ended = '';
    ctx.events.onAny('law:dispersion_ended', (e) => { ended = (e as { reason: string }).reason; });
    // la foule quitte les lieux
    for (const p of foule) {
      p.x += 400;
    }
    law.t.step(cfg.sequenceEndDelay + 3);
    expect(ended).toBe('dispersion');
    expect(ctx.law.roe.sommation).toBe(0);
    expect(ctx.law.roe.dispersionOrdered).toBe(false);
    expect(ctx.law.roe.lawfulForce).toBe(1);
    expect(ctx.law.roe.authorizedForce).toBe(1);
    expect(law.radio.at(-1)?.text).toContain("Fin d'emploi de la force");
  });

  it('une foule encerclée, sans issue libre, ne commet aucun délit en restant ; la disperser par la force est une faute', async () => {
    const law = await startLaw();
    const { ctx, cfg } = law;
    const com = commissaire(ctx, 0, 0);
    ctx.player.possess(com.id);
    const agent = crs(ctx, 2, 0);
    const foule = crowd(ctx, 0, 20, 20);
    // nasse : un cordon fermé de 14 m de rayon autour de la foule
    const cordon: Person[] = [];
    for (let i = 0; i < 74; i++) {
      const a = (i / 74) * Math.PI * 2;
      cordon.push(crs(ctx, Math.sin(a) * 14, 20 + Math.cos(a) * 14));
    }
    const states: boolean[] = [];
    ctx.events.onAny('law:enclosed', (e) => states.push((e as { enclosed: boolean }).enclosed));
    fullSommations(law, com);
    expect(states).toEqual([true]);
    expect(law.notices.some((n) => n.text.includes('Aucune issue libre'))).toBe(true);
    expect(law.records.sommations.at(-1)?.note).toContain('sans issue libre');
    law.t.step(cfg.attroupementStay + 5);
    expect(foule.every((p) => p.offenses.length === 0)).toBe(true);
    const v = ctx.law.reportForce(agent, 'lacrymo', null, 0, 20);
    expect(v.kind).toBe('disproportionne');
    expect(v.reason).toContain('sans issue libre');

    // une issue de 14 m est ouverte à l'est : ceux qui restent malgré tout sont désormais en infraction
    for (const c of cordon) {
      if (c.x > 0 && Math.abs(c.z - 20) < 7.5) c.x += 200;
    }
    law.t.step(cfg.attroupementStay + 5);
    expect(states).toEqual([true, false]);
    expect(foule.every((p) => p.offenses.length === 1)).toBe(true);
    law.t.step(1);
    expect(ctx.law.reportForce(agent, 'lacrymo', null, 0, 20).kind).toBe('licite');
  });

  it('un nouveau compartiment de terrain impose de reprendre à l\'annonce', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    crowd(ctx, 0, 20, 30);
    crowd(ctx, 400, 20, 30);
    fullSommations(law, com);
    expect(ctx.law.roe.sommation).toBe(3);
    com.x = 400;
    expect(ctx.law.sommation(com)).toBe(1);
    expect(ctx.law.roe.lawfulForce).toBe(1);
  });
});

describe('droit — autorisation hiérarchique', () => {
  it('seuls l\'autorité et les gradés qui commandent fixent le niveau ; il ne dépasse jamais le niveau licite', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const gardien = crs(ctx, 2, 0);
    const chef = crs(ctx, 4, 0, { rank: 'brigadier_chef', poste: 'chef_groupe' });
    crowd(ctx, 0, 20, 30);
    const levels: number[] = [];
    ctx.events.on('law:authorized', (e) => levels.push(e.level));

    ctx.law.authorize(3, gardien.id);
    expect(levels).toEqual([]);
    expect(law.records.lastRefusal).toContain('Autorisation refusée');
    ctx.law.authorize(3, chef.id);
    expect(levels).toEqual([3]);
    // ordre enregistré, mais sans cadre légal il ne prend pas effet
    expect(ctx.law.roe.authorizedForce).toBe(1);
    fullSommations(law, com);
    expect(ctx.law.roe.authorizedForce).toBe(3);
    // la hiérarchie peut restreindre
    ctx.law.authorize(2, com.id);
    expect(ctx.law.roe.authorizedForce).toBe(2);
    // l'arme de service ne s'autorise pas
    ctx.law.authorize(5, 0);
    expect(levels.at(-1)).toBe(4);
    expect(ctx.law.roe.authorizedForce).toBe(3);
    expect(law.records.autorisations.filter((a) => !a.implied).map((a) => a.level)).toEqual([3, 2, 4]);
  });
});
