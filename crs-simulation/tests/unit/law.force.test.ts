import { describe, expect, it } from 'vitest';
import type { GameEvents } from '@/core/contracts';
import type { ForceRecord } from '@/gameplay/law/api';
import { attackOfficer, commissaire, crowd, crs, fullSommations, person, protester, startLaw } from '@/gameplay/law/testkit';

describe('droit — lacrymogènes et sommations', () => {
  it('grenade lacrymogène avant toute sommation sur une foule calme : sans sommation', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    crowd(ctx, 0, 20, 30);
    const emitted: GameEvents['law:force'][] = [];
    ctx.events.on('law:force', (e) => emitted.push(e));
    const v = ctx.law.reportForce(agent, 'lacrymo', null, 0, 20);
    expect(v.kind).toBe('sans_sommation');
    expect(v.severity).toBe(4);
    expect(v.reason).toContain('aucune annonce ni sommation');
    expect(v.reason).toContain('L. 211-9');
    expect(ctx.law.forceLog).toHaveLength(1);
    const rec = ctx.law.forceLog[0] as ForceRecord;
    expect(rec.byId).toBe(agent.id);
    expect(rec.means).toBe('lacrymo');
    expect(rec.filmed).toBe(false);
    expect(rec.frame).toBe('aucun');
    expect(rec.sommation).toBe(0);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.report).toBe(rec);
  });

  it('même tir alors que les forces sont attaquées : licite, riposte directe', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const foule = crowd(ctx, 0, 20, 30);
    expect(ctx.law.roe.underAttack).toBe(false);
    attackOfficer(ctx, foule[0]!, agent);
    expect(ctx.law.roe.underAttack).toBe(true);
    expect(ctx.law.roe.lawfulForce).toBe(4);
    expect(ctx.law.roe.authorizedForce).toBe(3);
    const v = ctx.law.reportForce(agent, 'lacrymo', null, 0, 20);
    expect(v.kind).toBe('licite');
    expect(v.severity).toBe(0);
    expect(v.reason).toContain('riposte');
    expect((ctx.law.forceLog[0] as ForceRecord).frame).toBe('riposte');
    // l'auteur des violences est en infraction, vu par l'agent
    expect(foule[0]!.offenses[0]!.type).toBe('violence_agent');
    expect(ctx.law.canArrest(foule[0]!)).toBe(true);
  });

  it('la riposte ne vaut qu\'aux abords des violences et pendant quelques dizaines de secondes', async () => {
    const law = await startLaw();
    const { ctx, cfg } = law;
    const agent = crs(ctx, 0, 0);
    const autre = crs(ctx, 600, 0);
    const foule = crowd(ctx, 0, 20, 30);
    crowd(ctx, 600, 20, 30);
    attackOfficer(ctx, foule[0]!, agent);
    // une unité à l'autre bout du dispositif ne peut pas s'en prévaloir
    expect(ctx.law.reportForce(autre, 'lacrymo', null, 600, 20).kind).toBe('sans_sommation');
    law.t.step(cfg.attackMemory - 2);
    expect(ctx.law.roe.underAttack).toBe(true);
    expect(ctx.law.reportForce(agent, 'lacrymo', null, 0, 20).kind).toBe('licite');
    law.t.step(3);
    expect(ctx.law.roe.underAttack).toBe(false);
    expect(ctx.law.roe.lawfulForce).toBe(1);
    expect(ctx.law.reportForce(agent, 'lacrymo', null, 0, 20).kind).toBe('sans_sommation');
  });

  it('grenade lacrymogène à main après la dernière sommation et le délai : licite', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const agent = crs(ctx, 2, 0);
    crowd(ctx, 0, 20, 30);
    fullSommations(law, com);
    const v = ctx.law.reportForce(agent, 'lacrymo', null, 0, 20);
    expect(v.kind).toBe('licite');
    expect(v.reason).toContain('deux sommations');
    expect((ctx.law.forceLog.at(-1) as ForceRecord).frame).toBe('sommations');
    // bâton et engin lanceur d'eau relèvent du même cadre
    expect(ctx.law.reportForce(agent, 'canon_eau', null, 0, 20).kind).toBe('licite');
  });

  it('trop tôt après la dernière sommation, ou après une simple annonce : sans sommation', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const agent = crs(ctx, 2, 0);
    crowd(ctx, 0, 20, 30);
    ctx.law.sommation(com);
    const early = ctx.law.reportForce(agent, 'lacrymo', null, 0, 20);
    expect(early.kind).toBe('sans_sommation');
    expect(early.reason).toContain("seule l'annonce");
    const law2 = await startLaw();
    const com2 = commissaire(law2.ctx, 0, 0);
    const agent2 = crs(law2.ctx, 2, 0);
    crowd(law2.ctx, 0, 20, 30);
    fullSommations(law2, com2, false);
    law2.t.step(5);
    const v = law2.ctx.law.reportForce(agent2, 'lacrymo', null, 0, 20);
    expect(v.kind).toBe('sans_sommation');
    expect(v.reason).toContain('le temps et la possibilité matérielle');
  });

  it('au lanceur, la dernière sommation doit être réitérée', async () => {
    const law = await startLaw();
    const { ctx, cfg } = law;
    const com = commissaire(ctx, 0, 0);
    const lanceur = crs(ctx, 2, 0, { poste: 'lanceur' });
    ctx.actions.give(lanceur, 'lanceur_cougar', 1);
    ctx.actions.selectById(lanceur, 'lanceur_cougar');
    crowd(ctx, 0, 60, 30);
    fullSommations(law, com);
    const v = ctx.law.reportForce(lanceur, 'lacrymo', null, 0, 60);
    expect(v.kind).toBe('sans_sommation');
    expect(v.reason).toContain('réitération');
    expect(ctx.law.reportForce(lanceur, 'gm2l', null, 0, 61).kind).toBe('sans_sommation');
    ctx.law.sommation(com);
    law.t.step(cfg.delayArmes + 0.1);
    expect(ctx.law.reportForce(lanceur, 'lacrymo', null, 0, 62).kind).toBe('licite');
    const gm2l = ctx.law.reportForce(lanceur, 'gm2l', null, 0, 63);
    expect(gm2l.kind).toBe('licite');
    expect((ctx.law.forceLog.at(-1) as ForceRecord).frame).toBe('armes');
  });

  it('les sommations ne valent que pour leur compartiment de terrain', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const loin = crs(ctx, 300, 0);
    crowd(ctx, 0, 20, 30);
    crowd(ctx, 300, 20, 30);
    fullSommations(law, com);
    const v = ctx.law.reportForce(loin, 'lacrymo', null, 300, 20);
    expect(v.kind).toBe('sans_sommation');
    expect(v.reason).toContain('compartiment de terrain');
  });

  it('force poursuivie après la dispersion : disproportionné', async () => {
    const law = await startLaw();
    const { ctx, cfg } = law;
    const com = commissaire(ctx, 0, 0);
    const agent = crs(ctx, 2, 0);
    const foule = crowd(ctx, 0, 20, 40);
    fullSommations(law, com);
    for (const p of foule) p.x += 500;
    protester(ctx, 0, 22); // un attardé
    law.t.step(cfg.cessationGrace + 3);
    const v = ctx.law.reportForce(agent, 'lacrymo', null, 0, 20);
    expect(v.kind).toBe('disproportionne');
    expect(v.reason).toContain('R. 211-13');
  });
});

describe('droit — ordre de la hiérarchie', () => {
  it('moyen au-dessus du niveau autorisé : non autorisé ; un commandant décide de ses moyens', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const agent = crs(ctx, 2, 0);
    const cdt = crs(ctx, 4, 0, { rank: 'commandant', poste: 'commandant_unite' });
    crowd(ctx, 0, 20, 30);
    fullSommations(law, com);
    ctx.law.authorize(2, com.id); // « pas de grenades »
    const v = ctx.law.reportForce(agent, 'lacrymo', null, 0, 20);
    expect(v.kind).toBe('non_autorise');
    expect(v.severity).toBe(2);
    expect(v.reason).toContain('niveau 2');
    expect(ctx.law.reportForce(agent, 'gazeuse', null, 0, 18).kind).toBe('licite');
    expect(ctx.law.reportForce(cdt, 'lacrymo', null, 0, 21).kind).toBe('licite');
    // l'ordre donné à l'unité de l'agent vaut autorisation
    const squad = ctx.squads.create('groupe', 'police', 'MISTRAL 1 ALFA');
    ctx.squads.addMember(squad.id, agent.id);
    ctx.squads.issue(squad.id, { type: 'disperser_gaz', maxForce: 3 });
    expect(ctx.law.reportForce(agent, 'lacrymo', null, 0, 25).kind).toBe('licite');
  });

  it('en riposte, les grenades assourdissantes exigent un ordre', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const foule = crowd(ctx, 0, 20, 30);
    attackOfficer(ctx, foule[0]!, agent);
    expect(ctx.law.reportForce(agent, 'gm2l', null, 0, 20).kind).toBe('non_autorise');
    ctx.law.authorize(4, 0);
    expect(ctx.law.roe.authorizedForce).toBe(4);
    law.t.step(1);
    expect(ctx.law.reportForce(agent, 'gm2l', null, 0, 23).kind).toBe('licite');
  });
});

describe('droit — lanceur de balles de défense', () => {
  it('sur une personne pacifique : interdit, faute lourde', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const tireur = crs(ctx, 0, 0, { poste: 'lbd' });
    const cible = protester(ctx, 0, 25);
    const v = ctx.law.reportForce(tireur, 'lbd', cible, cible.x, cible.z);
    expect(v.kind).toBe('interdit');
    expect(v.severity).toBe(5);
    expect(v.reason).toContain("jamais un moyen de dispersion");
    expect(law.records.plaintes).toHaveLength(1);
    expect(law.records.plaintes[0]!.personId).toBe(cible.id);
  });

  it('même après les sommations, le LBD n\'est pas un moyen de dispersion', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const tireur = crs(ctx, 2, 0);
    const foule = crowd(ctx, 0, 25, 30);
    fullSommations(law, com);
    ctx.law.sommation(com);
    law.t.step(law.cfg.delayArmes + 0.1);
    expect(ctx.law.roe.lawfulForce).toBe(4);
    const v = ctx.law.reportForce(tireur, 'lbd', foule[3]!, foule[3]!.x, foule[3]!.z);
    expect(v.kind).toBe('interdit');
  });

  it('sur une personne à terre, entravée, mains en l\'air ou en fuite : disproportionné', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const tireur = crs(ctx, 0, 0);
    const lanceur = protester(ctx, 0, 25, 'radical');
    attackOfficer(ctx, lanceur, tireur);
    // à terre
    ctx.health.setDown(lanceur, true);
    const down = ctx.law.reportForce(tireur, 'lbd', lanceur, lanceur.x, lanceur.z);
    expect(down.kind).toBe('disproportionne');
    expect(down.severity).toBe(5);
    expect(down.reason).toContain('à terre');
    // mains en l'air
    const rendu = protester(ctx, 3, 25, 'radical');
    attackOfficer(ctx, rendu, tireur);
    rendu.upper = 'hands_up';
    expect(ctx.law.reportForce(tireur, 'lbd', rendu, rendu.x, rendu.z).reason).toContain("mains en l'air");
    // en fuite
    const fuyard = protester(ctx, -3, 25, 'radical');
    attackOfficer(ctx, fuyard, tireur);
    fuyard.vz = 4;
    const flee = ctx.law.reportForce(tireur, 'lbd', fuyard, fuyard.x, fuyard.z);
    expect(flee.kind).toBe('disproportionne');
    expect(flee.reason).toContain('fuite');
    // menotté
    const menotte = protester(ctx, 6, 25, 'radical');
    attackOfficer(ctx, menotte, tireur);
    menotte.custody = 'cuffed';
    const bound = ctx.law.reportForce(tireur, 'lbd', menotte, menotte.x, menotte.z);
    expect(bound.kind).toBe('disproportionne');
    expect(bound.reason).toContain('R. 434-17');
  });

  it('sur l\'auteur de violences à l\'instant, entre 10 et 50 m : licite, sans sommation', async () => {
    const law = await startLaw();
    const { ctx, cfg } = law;
    const tireur = crs(ctx, 0, 0);
    const lanceur = protester(ctx, 0, 25, 'radical');
    const voisin = protester(ctx, 2, 25);
    attackOfficer(ctx, lanceur, tireur);
    const v = ctx.law.reportForce(tireur, 'lbd', lanceur, lanceur.x, lanceur.z);
    expect(v.kind).toBe('licite');
    expect(v.reason).toContain('25 m');
    // son voisin pacifique n'est pas une cible, même sous les projectiles
    const tiers = ctx.law.reportForce(tireur, 'lbd', voisin, voisin.x, voisin.z);
    expect(tiers.kind).toBe('disproportionne');
    // trop près : interdit
    const proche = protester(ctx, 0, 6, 'radical');
    attackOfficer(ctx, proche, tireur);
    const near = ctx.law.reportForce(tireur, 'lbd', proche, proche.x, proche.z);
    expect(near.kind).toBe('interdit');
    expect(near.reason).toContain('6 m');
    // sans objectif individualisé : interdit
    expect(ctx.law.reportForce(tireur, 'lbd', null, 0, 30).kind).toBe('interdit');
    // quelques dizaines de secondes plus tard, la menace n'est plus actuelle
    law.t.step(cfg.attackMemory + cfg.threatWindow);
    expect(ctx.law.reportForce(tireur, 'lbd', lanceur, lanceur.x, lanceur.z).kind).toBe('interdit');
  });

  it('impact au-dessus des épaules : le verdict est révisé en faute lourde', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const tireur = crs(ctx, 0, 0);
    const lanceur = protester(ctx, 0, 25, 'radical');
    attackOfficer(ctx, lanceur, tireur);
    expect(ctx.law.reportForce(tireur, 'lbd', lanceur, lanceur.x, lanceur.z).kind).toBe('licite');
    let amended = 0;
    ctx.events.onAny('law:force_amended', () => amended++);
    // l'impact arrive : à la tête
    ctx.health.hurt(lanceur, { amount: 35, kind: 'impact', sourceId: tireur.id, means: 'lbd', x: lanceur.x, z: lanceur.z, zone: 0.95 });
    const rec = ctx.law.forceLog.at(-1) as ForceRecord;
    expect(ctx.law.forceLog).toHaveLength(1);
    expect(rec.verdict.kind).toBe('interdit');
    expect(rec.verdict.severity).toBe(5);
    expect(rec.verdict.reason).toContain('tête');
    expect(rec.amended).toBe(true);
    expect(amended).toBe(1);

    // même constat par la hauteur d'impact du projectile
    const law2 = await startLaw();
    const t2 = crs(law2.ctx, 0, 0);
    const l2 = protester(law2.ctx, 0, 25, 'radical');
    attackOfficer(law2.ctx, l2, t2);
    law2.ctx.law.reportForce(t2, 'lbd', l2, l2.x, l2.z);
    law2.ctx.events.emit('projectile:impact', { id: 99, kind: 'lbd', ownerId: t2.id, x: l2.x, y: l2.y + l2.look.height * 0.93, z: l2.z, hitKind: 'person', hitId: l2.id });
    expect(law2.ctx.law.forceLog.at(-1)!.verdict.kind).toBe('interdit');
    // un impact au torse ne change rien
    const law3 = await startLaw();
    const t3 = crs(law3.ctx, 0, 0);
    const l3 = protester(law3.ctx, 0, 25, 'radical');
    attackOfficer(law3.ctx, l3, t3);
    law3.ctx.law.reportForce(t3, 'lbd', l3, l3.x, l3.z);
    law3.ctx.health.hurt(l3, { amount: 20, kind: 'impact', sourceId: t3.id, means: 'lbd', x: l3.x, z: l3.z, zone: 0.6 });
    expect(law3.ctx.law.forceLog).toHaveLength(1);
    expect(law3.ctx.law.forceLog[0]!.verdict.kind).toBe('licite');
  });
});

describe('droit — cibles illégitimes', () => {
  it('coup de bâton sur un journaliste identifié : cible illégitime, faute lourde', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const journaliste = person(ctx, 'journaliste', 0, 1.2);
    expect(journaliste.look.backText).toBe('PRESSE');
    ctx.player.possess(agent.id);
    const v = ctx.law.reportForce(agent, 'baton', journaliste, journaliste.x, journaliste.z);
    expect(v.kind).toBe('cible_illegitime');
    expect(v.severity).toBe(4);
    expect(v.reason).toContain('journaliste');
    // le joueur est prévenu sur-le-champ, la plainte est probable
    expect(law.notices.at(-1)?.kind).toBe('alert');
    expect(law.notices.at(-1)?.text).toContain('Faute');
    expect(law.records.plaintes[0]!.kind).toBe('force');
  });

  it('même sous les projectiles et après sommations, secouriste, observateur, passant et enfant restent protégés', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const agent = crs(ctx, 0, 1);
    const foule = crowd(ctx, 0, 20, 20);
    fullSommations(law, com);
    attackOfficer(ctx, foule[0]!, agent);
    const medic = person(ctx, 'street_medic', 1, 2);
    const observateur = person(ctx, 'observateur', -1, 2);
    const passant = person(ctx, 'passant', 2, 2);
    const enfant = protester(ctx, -2, 2, 'famille', { look: { height: 1.25 } });
    expect(ctx.law.reportForce(agent, 'gazeuse', medic, medic.x, medic.z).kind).toBe('cible_illegitime');
    expect(ctx.law.reportForce(agent, 'baton', observateur, observateur.x, observateur.z).kind).toBe('cible_illegitime');
    expect(ctx.law.reportForce(agent, 'baton', passant, passant.x, passant.z).kind).toBe('cible_illegitime');
    const kid = ctx.law.reportForce(agent, 'gazeuse', enfant, enfant.x, enfant.z);
    expect(kid.kind).toBe('cible_illegitime');
    expect(kid.severity).toBe(5);
    expect(kid.reason).toContain('enfant');
  });

  it('un « journaliste » qui lance des pavés perd sa protection ; un collègue n\'est jamais une cible', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const collegue = crs(ctx, 1, 0);
    const faux = person(ctx, 'journaliste', 0, 1.5);
    attackOfficer(ctx, faux, agent);
    expect(ctx.law.reportForce(agent, 'baton', faux, faux.x, faux.z).kind).toBe('licite');
    expect(ctx.law.reportForce(agent, 'baton', collegue, collegue.x, collegue.z).kind).toBe('cible_illegitime');
    expect(ctx.law.reportForce(agent, 'contact', collegue, collegue.x, collegue.z).kind).toBe('licite');
  });

  it('gaz sur une zone où ne se trouvent que des tiers : cible illégitime', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const agent = crs(ctx, 2, 0);
    crowd(ctx, 0, 20, 30);
    person(ctx, 'street_medic', 60, 60);
    person(ctx, 'passant', 61, 60);
    fullSommations(law, com);
    const v = ctx.law.reportForce(agent, 'lacrymo', null, 60, 60);
    expect(v.kind).toBe('cible_illegitime');
    expect(v.reason).toContain('tiers');
  });
});

describe('droit — proportionnalité et moyens interdits', () => {
  it('le contact est licite avant toute sommation ; le bâton ne répond qu\'à une résistance active', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const agent = crs(ctx, 0, 1);
    const calme = protester(ctx, 0, 2);
    expect(ctx.law.reportForce(agent, 'contact', calme, calme.x, calme.z).kind).toBe('licite');
    expect(ctx.law.reportForce(agent, 'presence', null, 0, 2).kind).toBe('licite');
    expect(ctx.law.reportForce(agent, 'baton', calme, calme.x, calme.z).kind).toBe('sans_sommation');
    crowd(ctx, 0, 20, 30);
    fullSommations(law, com);
    // après sommations : le bâton sur une personne non menaçante reste disproportionné
    const v = ctx.law.reportForce(agent, 'baton', calme, calme.x, calme.z);
    expect(v.kind).toBe('disproportionne');
    expect(v.reason).toContain('non menaçante');
    // sur l'auteur d'une dégradation en cours : proportionné
    const casseur = protester(ctx, 1, 2, 'radical');
    ctx.law.recordOffense(casseur, 'degradation', casseur.x, casseur.z);
    expect(ctx.law.reportForce(agent, 'baton', casseur, casseur.x, casseur.z).kind).toBe('licite');
    // la simple présence n'est pas un acte de force
    expect(law.records.stats().forces).toBe(4);
  });

  it('personne déjà maîtrisée ou assise : le bâton est disproportionné', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const p = protester(ctx, 0, 1.2, 'radical');
    attackOfficer(ctx, p, agent);
    p.custody = 'held';
    expect(ctx.law.reportForce(agent, 'baton', p, p.x, p.z).reason).toContain('déjà maîtrisé');
    const assis = protester(ctx, 1.2, 0, 'militant');
    attackOfficer(ctx, assis, agent);
    assis.posture = 'sit';
    expect(ctx.law.reportForce(agent, 'baton', assis, assis.x, assis.z).kind).toBe('disproportionne');
  });

  it('grenade de désencerclement : interdite hors prise à partie, licite pour l\'unité encerclée', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const agent = crs(ctx, 0, 1);
    const foule = crowd(ctx, 0, 30, 30);
    fullSommations(law, com);
    ctx.law.sommation(com);
    law.t.step(law.cfg.delayArmes + 0.1);
    const v = ctx.law.reportForce(agent, 'desencerclement', null, 0, 25);
    expect(v.kind).toBe('interdit');
    expect(v.reason).toContain("hors situation d'encerclement");
    // un groupe violent au contact
    const groupe = [protester(ctx, 3, 3, 'radical'), protester(ctx, -3, 4, 'radical'), protester(ctx, 4, -2, 'radical'), protester(ctx, -2, -4, 'radical')];
    attackOfficer(ctx, groupe[0]!, agent);
    const ok = ctx.law.reportForce(agent, 'desencerclement', null, 3, 3);
    expect(ok.kind).toBe('licite');
    expect(foule.length).toBe(30);
  });

  it('arme de service : interdite hors légitime défense, licite face à un engin incendiaire', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const calme = protester(ctx, 0, 10);
    const v = ctx.law.reportForce(agent, 'arme_feu', calme, calme.x, calme.z);
    expect(v.kind).toBe('interdit');
    expect(v.severity).toBe(5);
    expect(v.reason).toContain('L. 435-1');
    const incendiaire = protester(ctx, 3, 8, 'radical');
    ctx.actions.give(incendiaire, 'molotov', 1);
    ctx.actions.selectById(incendiaire, 'molotov');
    const ld = ctx.law.reportForce(agent, 'arme_feu', incendiaire, incendiaire.x, incendiaire.z);
    expect(ld.kind).toBe('licite');
    expect(ld.reason).toContain('enquête');
    expect(law.records.stats().inquiry).toBe(true);
  });

  it('véhicule employé contre des personnes : interdit ; contre un obstacle vide : licite', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const conducteur = crs(ctx, 0, 0, { poste: 'conducteur' });
    const fourgon = ctx.vehicles.spawn('fourgon_crs', 0, 0, 0, { faction: 'police' });
    ctx.vehicles.enter(conducteur, fourgon, 'driver');
    expect(ctx.law.reportForce(conducteur, 'vehicule', null, 0, 40).kind).toBe('licite');
    const pieton = protester(ctx, 0, 8);
    // choc signalé par le module des véhicules : rapport automatique
    ctx.events.emit('vehicle:collision', { vehicleId: fourgon.id, otherKind: 'person', otherId: pieton.id, speed: 6, x: 0, z: 7 });
    const rec = ctx.law.forceLog.at(-1) as ForceRecord;
    expect(rec.means).toBe('vehicule');
    expect(rec.verdict.kind).toBe('interdit');
    expect(rec.verdict.severity).toBe(5);
    expect(rec.auto).toBe(true);
    // un frôlement au pas n'est pas retenu
    const n = ctx.law.forceLog.length;
    const autre = protester(ctx, 2, 8);
    ctx.events.emit('vehicle:collision', { vehicleId: fourgon.id, otherKind: 'person', otherId: autre.id, speed: 0.8, x: 2, z: 7 });
    expect(ctx.law.forceLog.length).toBe(n);
  });

  it('tir tendu au lanceur de grenades : interdit, constaté sur la vitesse du projectile', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const lanceur = crs(ctx, 0, 0, { poste: 'lanceur' });
    ctx.actions.give(lanceur, 'lanceur_cougar', 1);
    ctx.actions.selectById(lanceur, 'lanceur_cougar');
    const foule = crowd(ctx, 0, 40, 30);
    attackOfficer(ctx, foule[0]!, lanceur);
    // tir courbe : rien à redire
    ctx.projectiles.spawn('grenade_lacrymo_56', lanceur.id, 0, 1.5, 0, 0, 20, 20);
    expect(ctx.law.reportForce(lanceur, 'lacrymo', null, 0, 40).kind).toBe('licite');
    law.t.step(3);
    // tir tendu, déclaré avant ou après le départ du coup
    expect(ctx.law.reportForce(lanceur, 'lacrymo', null, 0, 41).kind).toBe('licite');
    ctx.projectiles.spawn('grenade_lacrymo_56', lanceur.id, 0, 1.5, 0, 0, 2, 40);
    expect(ctx.law.forceLog.at(-1)!.verdict.kind).toBe('interdit');
    expect(ctx.law.forceLog.at(-1)!.verdict.reason).toContain('Tir tendu');
    law.t.step(3);
    ctx.projectiles.spawn('grenade_lacrymo_56', lanceur.id, 0, 1.5, 0, 0, 2, 40);
    expect(ctx.law.reportForce(lanceur, 'lacrymo', null, 0, 42).kind).toBe('interdit');
  });
});

describe('droit — journal de la force', () => {
  it('mentionne si l\'acte est filmé par des tiers ou enregistré par les forces', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const calme = protester(ctx, 0, 1.5);
    // personne ne filme
    ctx.law.reportForce(agent, 'baton', calme, calme.x, calme.z);
    expect(ctx.law.forceLog[0]!.filmed).toBe(false);
    // un journaliste filme la scène, à 10 m, caméra tournée vers elle
    const jri = person(ctx, 'journaliste', 10, 1.5);
    jri.upper = 'film';
    jri.aimYaw = -Math.PI / 2; // regarde vers −x
    law.t.step(1);
    ctx.law.reportForce(agent, 'baton', calme, calme.x, calme.z);
    const rec = ctx.law.forceLog[1] as ForceRecord;
    expect(rec.filmed).toBe(true);
    // caméra tournée ailleurs : non filmé
    jri.aimYaw = Math.PI / 2;
    law.t.step(1);
    ctx.law.reportForce(agent, 'baton', calme, calme.x, calme.z);
    expect(ctx.law.forceLog[2]!.filmed).toBe(false);
    // caméra-piéton du chef de groupe : enregistré par les forces, pas « filmé par un tiers »
    const chef = crs(ctx, 0, -1, { poste: 'chef_groupe', rank: 'brigadier_chef' });
    chef.aimYaw = 0;
    law.t.step(1);
    ctx.law.reportForce(agent, 'baton', calme, calme.x, calme.z);
    const withCam = ctx.law.forceLog[3] as ForceRecord;
    expect(withCam.filmed).toBe(false);
    expect(withCam.cameras).not.toBe(0);
  });

  it('fusionne les déclarations répétées d\'un même geste et ignore la simple présence dans les comptes', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const foule = crowd(ctx, 0, 3, 9);
    attackOfficer(ctx, foule[0]!, agent);
    // jet continu d'aérosol déclaré à chaque pas
    for (let i = 0; i < 20; i++) {
      ctx.law.reportForce(agent, 'gazeuse', foule[0]!, foule[0]!.x, foule[0]!.z);
      law.t.step(1 / 30);
    }
    expect(ctx.law.forceLog).toHaveLength(1);
    law.t.step(2);
    ctx.law.reportForce(agent, 'gazeuse', foule[0]!, foule[0]!.x, foule[0]!.z);
    expect(ctx.law.forceLog).toHaveLength(2);
  });

  it('une blessure infligée par un agent sans déclaration préalable est examinée d\'office', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const calme = protester(ctx, 0, 1.2);
    ctx.health.hurt(calme, { amount: 30, kind: 'blunt', sourceId: agent.id, means: 'baton', x: calme.x, z: calme.z, zone: 0.5 });
    expect(ctx.law.forceLog).toHaveLength(1);
    const rec = ctx.law.forceLog[0] as ForceRecord;
    expect(rec.auto).toBe(true);
    expect(rec.verdict.kind).toBe('sans_sommation');
    // blessure sérieuse d'une personne qui ne commettait aucune violence : plainte probable
    ctx.health.hurt(calme, { amount: 30, kind: 'blunt', sourceId: agent.id, means: 'baton', x: calme.x, z: calme.z, zone: 0.5 });
    expect(law.records.plaintes.map((p) => p.kind).sort()).toEqual(['blessure', 'force']);
  });

  it('des violences commises par un manifestant ne sont pas un emploi de la force mais une infraction', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const casseur = protester(ctx, 0, 1, 'radical');
    const v = ctx.law.reportForce(casseur, 'baton', agent, agent.x, agent.z);
    expect(v.severity).toBe(0);
    expect(ctx.law.forceLog).toHaveLength(0);
    expect(casseur.offenses[0]!.type).toBe('violence_agent');
    expect(ctx.law.roe.underAttack).toBe(true);
  });
});
