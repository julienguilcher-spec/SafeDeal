import { describe, expect, it } from 'vitest';
import type { GameContext, GameEvents, InteractionHandler, InteractionOption, InteractVerb, Person } from '@/core/contracts';
import type { LawCustody, LawHandover } from '@/gameplay/law/api';
import { LAW_CUSTODY_SERVICE } from '@/gameplay/law/api';
import type { LawTest } from '@/gameplay/law/testkit';
import { attackOfficer, crs, person, protester, startLaw } from '@/gameplay/law/testkit';

/** Options d'interaction proposées à un agent, par verbe. */
function verbs(ctx: GameContext, actor: Person): InteractVerb[] {
  const out: InteractionOption[] = [];
  ctx.interactions.options(actor, out);
  return out.map((o) => o.verb);
}

/** Lance un verbe sur une cible et laisse l'action aller à son terme. */
function act(law: LawTest, actor: Person, verb: InteractVerb, targetId: number): boolean {
  if (!law.ctx.interactions.startVerb(actor, verb, targetId)) return false;
  const cur = law.ctx.interactions.current(actor);
  if (cur) law.t.step(cur.opt.duration + 0.1);
  return true;
}

/** Maîtrise une personne, en réessayant si elle se dégage (l'issue dépend d'un tirage). */
function subdue(law: LawTest, actor: Person, target: Person, tries = 8): number {
  for (let i = 1; i <= tries; i++) {
    // la personne a pu s'éloigner en se dégageant : l'agent la rattrape
    actor.x = target.x;
    actor.z = target.z - 1;
    law.ctx.people.rebuildIndex();
    if (act(law, actor, 'maitriser', target.id) && target.custody === 'held') return i;
    law.t.step(2.1); // le temps de se ressaisir après une maîtrise manquée
  }
  return 0;
}

describe('droit — interpellation : chaîne complète', () => {
  it('maîtriser → menotter → palper → escorter → remettre à un fourgon', async () => {
    const law = await startLaw({ seed: 11 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0, { poste: 'interpellation' });
    const collegue = crs(ctx, 1.5, 1.5, { poste: 'interpellation' });
    ctx.player.possess(agent.id);
    const lanceur = protester(ctx, 0, 1.2, 'militant', { name: 'Individu au sac rouge' });
    ctx.actions.give(lanceur, 'pave', 2);
    ctx.actions.give(lanceur, 'telephone', 1);
    const arrested: GameEvents['person:arrested'][] = [];
    const handed: GameEvents['person:handed_over'][] = [];
    ctx.events.on('person:arrested', (e) => arrested.push(e));
    ctx.events.on('person:handed_over', (e) => handed.push(e));

    // fait constaté : il vient de blesser un agent avec un pavé
    attackOfficer(ctx, lanceur, collegue);
    expect(ctx.law.canArrest(lanceur)).toBe(true);
    expect(verbs(ctx, agent)[0]).toBe('maitriser');

    // 1. maîtriser
    expect(subdue(law, agent, lanceur)).toBeGreaterThan(0);
    expect(lanceur.custody).toBe('held');
    expect(lanceur.posture).toBe('prone');
    expect(lanceur.heldBy).toBe(agent.id);
    expect(agent.carrying).toBe(lanceur.id);
    expect(agent.upper).toBe('restrain');
    expect(arrested).toEqual([{ id: lanceur.id, byId: agent.id, lawful: true }]);
    const rec = law.records.arrestOf(lanceur.id)!;
    expect(rec.founded).toBe(true);
    expect(rec.motif).toBe('violence_agent');
    expect(rec.witnessed).toBe(true);
    expect(rec.force).toContain('contact');
    expect(rec.t).toBeCloseTo(ctx.clock.now, 0);
    expect(law.notices.some((n) => n.text.startsWith('Interpellation fondée'))).toBe(true);

    // 2. menotter (prioritaire sur la palpation tant que la personne n'est pas entravée)
    expect(verbs(ctx, agent)[0]).toBe('menotter');
    expect(act(law, agent, 'menotter', lanceur.id)).toBe(true);
    expect(lanceur.custody).toBe('cuffed');
    expect(lanceur.upper).toBe('cuffed');
    expect(rec.cuffed).toBe(true);
    expect(rec.cuffJustified).toBe(true);

    // 3. palper : les pavés sont saisis, le téléphone est laissé
    expect(verbs(ctx, agent)[0]).toBe('palper');
    expect(act(law, agent, 'palper', lanceur.id)).toBe(true);
    expect(rec.searched).toBe(true);
    expect(rec.seized).toEqual([{ id: 'pave', count: 2 }]);
    expect(ctx.actions.has(lanceur, 'pave')).toBe(0);
    expect(ctx.actions.has(lanceur, 'telephone')).toBe(1);
    expect(lanceur.offenses.some((o) => o.type === 'port_arme' && o.witnessed)).toBe(true);

    // 4. escorter : la personne entravée suit l'agent
    expect(verbs(ctx, agent)[0]).toBe('escorter');
    expect(act(law, agent, 'escorter', lanceur.id)).toBe(true);
    expect(lanceur.custody).toBe('escorted');
    expect(lanceur.posture).toBe('stand');
    expect(lanceur.upper).toBe('cuffed');
    const z0 = agent.z;
    for (let i = 0; i < 300; i++) {
      agent.z -= 1.3 / 30; // l'agent repart vers l'arrière de la ligne, au pas
      agent.heading = Math.PI;
      law.t.step(1 / 30);
    }
    expect(agent.z).toBeCloseTo(z0 - 13, 3);
    expect(Math.hypot(lanceur.x - agent.x, lanceur.z - agent.z)).toBeLessThan(1.6);
    // la commande de déplacement de l'escorté est écrite pour la locomotion
    agent.z -= 1;
    law.t.step(1 / 30);
    expect(Math.hypot(lanceur.cmd.moveX, lanceur.cmd.moveZ)).toBeGreaterThan(0);

    // 5. remettre : rien à portée, puis un fourgon avec une place libre
    expect(verbs(ctx, agent)).not.toContain('remettre');
    const fourgon = ctx.vehicles.spawn('fourgon_cellulaire', agent.x + 3, agent.z, 0, { faction: 'police' });
    expect(verbs(ctx, agent)[0]).toBe('remettre');
    expect(act(law, agent, 'remettre', lanceur.id)).toBe(true);
    expect(lanceur.custody).toBe('in_vehicle');
    expect(lanceur.vehicleId).toBe(fourgon.id);
    expect(agent.carrying).toBe(0);
    expect(handed).toEqual([{ id: lanceur.id, byId: agent.id }]);

    // la procédure est close et notée : à bord du fourgon, en attente de transfert (pas encore présenté à l'OPJ)
    expect(law.records.arrestOf(lanceur.id)).toBeNull();
    expect(rec.status).toBe('remis_vehicule');
    expect(rec.to).toBe('vehicule');
    expect(rec.vehicleId).toBe(fourgon.id);
    expect(rec.regular).toBe(true);
    expect(rec.strength).toBe('fragile'); // constaté par un agent, sans image
    expect(rec.worstVerdict).toBe('licite');
    expect(law.radio.at(-1)?.text).toContain('UN interpellé pour violences');
    expect(law.radio.at(-1)?.text).toContain('en attente de transfert');
    expect(law.radio.at(-1)?.text).not.toContain('officier de police judiciaire');
    const st = law.records.stats();
    expect([st.arrests, st.founded, st.handedOver, st.unfounded, st.inVan, st.atStation]).toEqual([1, 1, 1, 0, 1, 0]);
    expect(st.score).toBe(100);
  });

  it('remise à un point de regroupement défini par le service law.handover ; preuve filmée = procédure solide', async () => {
    const law = await startLaw({ seed: 5 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    crs(ctx, 1.5, 0);
    const jri = person(ctx, 'journaliste', 0, 10);
    jri.upper = 'film';
    jri.aimYaw = Math.PI;
    const casseur = protester(ctx, 0, 1.2, 'pacifique');
    ctx.law.recordOffense(casseur, 'degradation', casseur.x, casseur.z);
    expect(casseur.offenses[0]!.filmed).toBe(true);
    ctx.require<LawHandover>('law.handover').points.push({ x: 0, z: -30, radius: 5, name: 'point de regroupement rue Royale' });

    expect(subdue(law, agent, casseur)).toBeGreaterThan(0);
    expect(act(law, agent, 'menotter', casseur.id)).toBe(true);
    expect(act(law, agent, 'escorter', casseur.id)).toBe(true);
    // trop loin du point : pas de remise possible
    expect(ctx.interactions.startVerb(agent, 'remettre', casseur.id)).toBe(false);
    agent.x = 1;
    agent.z = -29; // l'agent rejoint le point d'un bond : l'escorté est replacé à son côté
    law.t.step(0.2);
    expect(Math.hypot(casseur.x - agent.x, casseur.z - agent.z)).toBeLessThan(1.6);
    expect(act(law, agent, 'remettre', casseur.id)).toBe(true);
    expect(casseur.custody).toBe('handed_over');
    expect(casseur.posture).toBe('sit');
    const rec = law.records.interpellations[0]!;
    expect(rec.to).toBe('point');
    expect(rec.strength).toBe('solide');
    expect(rec.filmed).toBe(true);
    // menottage d'un simple casseur sans violence ni résistance : non justifié (art. 803)
    expect(rec.cuffJustified).toBe(false);
    expect(rec.regular).toBe(false);
    expect(law.records.score).toBe(97);
  });

  it('une IA peut désigner le véhicule de destination', async () => {
    // le registre d'interactions neutre ne transmet pas la cible à find() : on garde la main sur les gestionnaires
    const handlers: InteractionHandler[] = [];
    const law = await startLaw({
      seed: 3,
      systems: [{
        id: 'test:capture', order: 1,
        provide(c) {
          // le service reste le registre neutre (que le moteur fait vivre) : on n'intercepte que register()
          const base = c.interactions;
          const register = base.register.bind(base);
          base.register = (h: InteractionHandler): void => {
            handlers.push(h);
            register(h);
          };
        },
      }],
    });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const cible = protester(ctx, 0, 1.2, 'pacifique');
    ctx.law.recordOffense(cible, 'degradation', cible.x, cible.z);
    expect(subdue(law, agent, cible)).toBeGreaterThan(0);
    expect(act(law, agent, 'escorter', cible.id)).toBe(true); // sans menottes
    const voiture = ctx.vehicles.spawn('voiture_police', agent.x + 3, agent.z, 0, { faction: 'police' });
    // la moto et les véhicules civils ne conviennent pas
    const civile = ctx.vehicles.spawn('voiture', agent.x - 3, agent.z, 0);
    expect(handlers.map((h) => h.verb)).toEqual(['maitriser', 'menotter', 'palper', 'escorter', 'remettre', 'confier', 'faire_venir', 'relacher', 'controler']);
    const remettre = handlers.find((h) => h.verb === 'remettre')!;
    expect(remettre.find(agent, civile.id)).toBeNull();
    expect(remettre.find(agent, 123456)).toBeNull();
    const opt = remettre.find(agent, voiture.id)!;
    expect(opt.targetKind).toBe('vehicle');
    expect(opt.targetId).toBe(voiture.id);
    expect(opt.label).toContain('Remettre');
    expect(ctx.interactions.start(agent, opt)).toBe(true);
    law.t.step(opt.duration + 0.1);
    expect(cible.custody).toBe('in_vehicle');
    expect(cible.vehicleId).toBe(voiture.id);
    // les autres gestionnaires respectent aussi la cible imposée
    const maitriser = handlers.find((h) => h.verb === 'maitriser')!;
    const a = protester(ctx, agent.x, agent.z + 1, 'pacifique');
    const b = protester(ctx, agent.x + 1, agent.z, 'pacifique');
    ctx.people.rebuildIndex();
    expect(maitriser.find(agent, b.id)!.targetId).toBe(b.id);
    expect(maitriser.find(agent, a.id)!.targetId).toBe(a.id);
    expect(maitriser.find(agent, cible.id)).toBeNull();
    expect(law.records.interpellations[0]!.cuffed).toBe(false);
  });
});

/** Les options proposées au joueur, libellés compris, la première d'abord. */
function prompts(ctx: GameContext, actor: Person): InteractionOption[] {
  const out: InteractionOption[] = [];
  ctx.interactions.options(actor, out);
  return out.map((o) => ({ ...o }));
}

/** Le joueur interpelle, menotte et palpe : les trois premiers appuis sur la touche Interagir. */
function threePresses(law: LawTest, agent: Person, target: Person): void {
  expect(subdue(law, agent, target)).toBeGreaterThan(0);
  expect(verbs(law.ctx, agent)[0]).toBe('menotter');
  expect(act(law, agent, 'menotter', target.id)).toBe(true);
  expect(verbs(law.ctx, agent)[0]).toBe('palper');
  expect(act(law, agent, 'palper', target.id)).toBe(true);
}

describe('droit — l\'interpellé du joueur : la 4e invite est la meilleure issue (plan ordres-directs §5.3)', () => {
  it('« Remettre (CELLULAIRE 1) » à 12 m du fourgon cellulaire, même avec un fourgon de CRS à 4 m ; ligne d\'aide dès la palpation', async () => {
    const law = await startLaw({ seed: 11 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    ctx.player.possess(agent.id);
    const cible = protester(ctx, 0, 1.2, 'pacifique', { name: 'Christian Lopez' });
    attackOfficer(ctx, cible, crs(ctx, 1.5, 1.5));
    const van = ctx.vehicles.spawn('fourgon_cellulaire', 11, 0.6, 0, { faction: 'police' });
    const equipage = ctx.squads.create('equipage', 'police', 'CELLULAIRE 1');
    equipage.vehicleId = van.id;
    const crsVan = ctx.vehicles.spawn('fourgon_crs', -4, 0.6, 0, { faction: 'police' });
    threePresses(law, agent, cible);
    const custody = ctx.require<LawCustody>(LAW_CUSTODY_SERVICE);
    // la ligne d'aide est là dès la fin de la palpation (même pas de pas de simulation)
    expect(custody.guidance(agent.id)).toBe('Interpellé. E\u00a0: le remettre au fourgon cellulaire 1 (' + Math.round(Math.hypot(van.x - agent.x, van.z - agent.z)) + '\u00a0m)');
    law.t.step(0.5);
    expect(custody.guidance(agent.id)).not.toBe('');
    // 4e appui : remettre au fourgon cellulaire, pas au fourgon de CRS plus proche, jamais « Faire asseoir »
    const top = prompts(ctx, agent)[0]!;
    expect(top.verb).toBe('remettre');
    expect(top.label).toBe('Remettre Christian Lopez (CELLULAIRE 1)');
    expect(custody.bestWay(agent.id)?.kind).toBe('remettre_fourgon');
    expect(custody.detaineeOf(agent.id)?.id).toBe(cible.id);
    // Entrée (ordre prêt, règle a) fait la même chose que la touche
    expect(custody.handover(agent.id)).toBe(true);
    law.t.step(ctx.interactions.current(agent)!.opt.duration + 0.1);
    expect(cible.custody).toBe('in_vehicle');
    expect(cible.vehicleId).toBe(van.id);
    expect(crsVan.seats.includes(cible.id)).toBe(false);
    const rec = law.records.interpellations[0]!;
    expect(rec.status).toBe('remis_vehicule');
    expect(rec.vehicleName).toBe('CELLULAIRE 1');
    expect(law.radio.at(-1)?.text).toContain('à bord du CELLULAIRE 1, en attente de transfert');
    // plus rien à faire de lui : plus de ligne d'aide, plus d'interpellé
    expect(custody.detaineeOf(agent.id)).toBeNull();
    expect(custody.guidance(agent.id)).toBe('');
  });

  it('à 13 m du fourgon cellulaire, c\'est le fourgon de CRS à 4 m ; à 6 m de tout, « Emmener » (jamais « Faire asseoir »)', async () => {
    const law = await startLaw({ seed: 12 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    ctx.player.possess(agent.id);
    const cible = protester(ctx, 0, 1.2, 'pacifique', { name: 'Hervé Michel' });
    attackOfficer(ctx, cible, crs(ctx, 1.5, 1.5));
    const van = ctx.vehicles.spawn('fourgon_cellulaire', 13.5, 0, 0, { faction: 'police' });
    ctx.squads.create('equipage', 'police', 'CELLULAIRE 2').vehicleId = van.id;
    const crsVan = ctx.vehicles.spawn('fourgon_crs', -4, 0, 0, { faction: 'police' });
    threePresses(law, agent, cible);
    let top = prompts(ctx, agent)[0]!;
    expect(top.verb).toBe('remettre');
    // (monde neutre : le nom du véhicule est celui de sa fiche)
    expect(top.label).toBe('Remettre Hervé Michel (' + crsVan.def.name + ')');
    // le fourgon de CRS s'en va : la 4e invite est « Emmener », vers le fourgon cellulaire (flèche)
    crsVan.x = -60;
    top = prompts(ctx, agent)[0]!;
    expect(top.verb).toBe('escorter');
    expect(top.label).toBe('Emmener Hervé Michel');
    const custody = ctx.require<LawCustody>(LAW_CUSTODY_SERVICE);
    expect(custody.guidance(agent.id)).toMatch(/^Interpellé\. E\u00a0: l’emmener au fourgon cellulaire 2 \(1[0-9]\u00a0m, flèche\)$/);
    expect(custody.nearestDrop(agent.id)?.vehicleId).toBe(van.id);
    // il l'emmène : à 12 m du fourgon, la remise passe avant « Faire asseoir »
    expect(act(law, agent, 'escorter', cible.id)).toBe(true);
    expect(cible.custody).toBe('escorted');
    expect(prompts(ctx, agent).map((o) => o.verb)).toEqual(['escorter', 'relacher']);
    agent.x = 3;
    law.t.step(0.2);
    const now = prompts(ctx, agent);
    expect(now[0]!.verb).toBe('remettre');
    expect(now[0]!.label).toBe('Remettre Hervé Michel (CELLULAIRE 2)');
    expect(now.findIndex((o) => o.label.startsWith('Faire asseoir'))).toBeGreaterThan(0);
  });

  it('dépôt au commissariat : le dossier passe à « déposé », le compte rendu le dit', async () => {
    const law = await startLaw({ seed: 13 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const cible = protester(ctx, 0, 1.2, 'pacifique');
    attackOfficer(ctx, cible, crs(ctx, 1.5, 1.5));
    expect(subdue(law, agent, cible)).toBeGreaterThan(0);
    act(law, agent, 'menotter', cible.id);
    act(law, agent, 'escorter', cible.id);
    ctx.vehicles.spawn('fourgon_cellulaire', agent.x + 3, agent.z, 0, { faction: 'police' });
    expect(act(law, agent, 'remettre', cible.id)).toBe(true);
    expect(law.records.stats().inVan).toBe(1);
    expect(law.records.summary()).toContain("1 à bord d'un véhicule de police en attente de transfert");
    expect(law.records.summary()).not.toContain('officier de police judiciaire');
    law.t.step(30);
    expect(law.records.markDelivered([cible.id, 999999], 'commissariat du 3e')).toBe(1);
    const rec = law.records.lastArrestOf(cible.id)!;
    expect(rec.status).toBe('depose');
    expect(rec.station).toBe('commissariat du 3e');
    expect(rec.deliveredAt).toBeCloseTo(ctx.clock.now, 1);
    const st = law.records.stats();
    expect([st.handedOver, st.inVan, st.atStation]).toEqual([1, 0, 1]);
    expect(law.records.summary()).toContain("1 déposée au commissariat (remises à l'officier de police judiciaire)");
    expect(law.records.summary()).toContain("déposé au commissariat du 3e, présenté à l'officier de police judiciaire");
    // déjà déposé : rien ne change
    expect(law.records.markDelivered([cible.id], 'commissariat du 1er')).toBe(0);
  });
});

describe('droit — interpellations infondées', () => {
  it('interpeller un manifestant sans aucun fait : infondée, signalée au joueur, plainte probable', async () => {
    const law = await startLaw({ seed: 2 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    ctx.player.possess(agent.id);
    const innocent = protester(ctx, 0, 1.2, 'pacifique');
    const arrested: GameEvents['person:arrested'][] = [];
    ctx.events.on('person:arrested', (e) => arrested.push(e));
    expect(ctx.law.canArrest(innocent)).toBe(false);
    const out: InteractionOption[] = [];
    ctx.interactions.options(agent, out);
    expect(out.find((o) => o.verb === 'maitriser')?.label).toContain('aucun fait constaté');
    // en situation calme, c'est le contrôle d'identité qui est proposé d'abord
    expect(out[0]!.verb).toBe('controler');

    expect(subdue(law, agent, innocent)).toBeGreaterThan(0);
    expect(arrested[0]!.lawful).toBe(false);
    const rec = law.records.arrestOf(innocent.id)!;
    expect(rec.founded).toBe(false);
    expect(rec.motif).toBeNull();
    expect(rec.strength).toBe('nulle');
    expect(rec.notes.join(' ')).toContain('infondée');
    expect(law.notices.some((n) => n.kind === 'alert' && n.text.includes('sans fait constaté'))).toBe(true);
    expect(law.records.plaintes.map((p) => p.kind)).toEqual(['interpellation']);
    expect(law.records.stats().unfounded).toBe(1);
    const before = law.records.score;
    expect(before).toBe(88);

    // relâcher limite le préjudice
    expect(verbs(ctx, agent)).toContain('relacher');
    const released: number[] = [];
    ctx.events.on('person:released', (e) => released.push(e.id));
    expect(act(law, agent, 'relacher', innocent.id)).toBe(true);
    expect(innocent.custody).toBe('free');
    expect(innocent.posture).toBe('stand');
    expect(innocent.heldBy).toBe(0);
    expect(agent.carrying).toBe(0);
    expect(released).toEqual([innocent.id]);
    expect(rec.status).toBe('relache');
    expect(law.records.score).toBe(94);
  });

  it('un fait ni vu ni filmé ne fonde rien ; un journaliste ou un secouriste sans fait non plus', async () => {
    const law = await startLaw({ seed: 4, walls: [[5, -20, 5, 20]] });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    // dégradation commise derrière un mur, puis l'auteur revient dans la rue
    const suspect = protester(ctx, 8, 0, 'pacifique');
    ctx.law.recordOffense(suspect, 'degradation', 8, 0);
    suspect.x = 0;
    suspect.z = 1.2;
    ctx.people.rebuildIndex();
    expect(subdue(law, agent, suspect)).toBeGreaterThan(0);
    const rec = law.records.arrestOf(suspect.id)!;
    expect(rec.founded).toBe(false);
    expect(rec.motif).toBe('degradation');
    expect(rec.notes.join(' ')).toContain('ni vu par un agent ni filmé');
    act(law, agent, 'relacher', suspect.id);
    suspect.x = 50;

    const journaliste = person(ctx, 'journaliste', 0, 1.2);
    ctx.people.rebuildIndex();
    expect(subdue(law, agent, journaliste)).toBeGreaterThan(0);
    const rj = law.records.arrestOf(journaliste.id)!;
    expect(rj.founded).toBe(false);
    expect(rj.protectedTarget).toBe('journaliste');
    // la saisie elle-même est un emploi de la force contre une cible illégitime
    expect(rj.worstVerdict).toBe('cible_illegitime');
    expect(ctx.law.forceLog.at(-1)!.verdict.kind).toBe('cible_illegitime');
    expect(law.records.stats().unfounded).toBe(2);
  });

  it('palpation d\'une personne interpellée sans motif : l\'arme découverte ne régularise pas la saisie initiale', async () => {
    const law = await startLaw({ seed: 6 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const discret = protester(ctx, 0, 1.2, 'pacifique');
    ctx.actions.give(discret, 'molotov', 1);
    ctx.actions.give(discret, 'fumigene', 1);
    expect(subdue(law, agent, discret)).toBeGreaterThan(0);
    expect(act(law, agent, 'palper', discret.id)).toBe(true);
    const rec = law.records.arrestOf(discret.id)!;
    expect(rec.seized.map((s) => s.id).sort()).toEqual(['fumigene', 'molotov']);
    expect(ctx.law.canArrest(discret)).toBe(true);
    act(law, agent, 'menotter', discret.id);
    act(law, agent, 'escorter', discret.id);
    ctx.vehicles.spawn('fourgon_crs', agent.x + 3, agent.z, 0, { faction: 'police' });
    expect(act(law, agent, 'remettre', discret.id)).toBe(true);
    expect(rec.founded).toBe(false);
    expect(rec.strength).toBe('fragile');
    expect(rec.notes.join(' ')).toContain('après coup');
  });
});

describe('droit — résistance, fuite, évasion', () => {
  it('un radical en colère, seul contre un agent, se dégage souvent : fuite ou rébellion', async () => {
    const law = await startLaw({ seed: 21 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    let fuites = 0;
    let rebellions = 0;
    let reussites = 0;
    ctx.events.onAny('law:arrest_failed', (e) => {
      if ((e as { outcome: string }).outcome === 'rebellion') rebellions++;
      else fuites++;
    });
    for (let i = 0; i < 40; i++) {
      const dur = protester(ctx, 0, 1.2, 'radical');
      dur.anger = 0.9;
      attackOfficer(ctx, dur, agent, 1);
      ctx.people.rebuildIndex();
      agent.health = 100;
      agent.posture = 'stand';
      if (act(law, agent, 'maitriser', dur.id) && dur.custody === 'held') {
        reussites++;
        act(law, agent, 'relacher', dur.id);
      } else {
        // l'issue de l'échec : la personne est libre, l'agent doit se ressaisir
        expect(dur.custody).toBe('free');
        expect(dur.heldBy).toBe(0);
        expect(agent.carrying).toBe(0);
        expect(ctx.interactions.startVerb(agent, 'maitriser', dur.id)).toBe(false);
      }
      ctx.people.remove(dur.id);
      law.t.step(2.1);
    }
    expect(reussites).toBeGreaterThan(2);
    expect(reussites).toBeLessThan(25);
    expect(fuites + rebellions).toBe(40 - reussites);
    expect(rebellions).toBeGreaterThan(fuites); // très en colère : il frappe plus souvent qu'il ne fuit
  });

  it('la rébellion est une infraction constatée et blesse l\'agent', async () => {
    const law = await startLaw({ seed: 21 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    let rebelle: Person | null = null;
    ctx.events.onAny('law:arrest_failed', (e) => {
      const ev = e as { id: number; outcome: string };
      if (ev.outcome === 'rebellion' && !rebelle) rebelle = ctx.people.get(ev.id) ?? null;
    });
    for (let i = 0; i < 30 && !rebelle; i++) {
      const dur = protester(ctx, 0, 1.2, 'radical');
      dur.anger = 1;
      ctx.people.rebuildIndex();
      act(law, agent, 'maitriser', dur.id);
      if (!rebelle) {
        if (dur.custody !== 'free') act(law, agent, 'relacher', dur.id);
        ctx.people.remove(dur.id);
        law.t.step(2.1);
      }
    }
    expect(rebelle).not.toBeNull();
    const r = rebelle as unknown as Person;
    expect(r.offenses.some((o) => o.type === 'rebellion' && o.witnessed)).toBe(true);
    expect(agent.health).toBeLessThan(100);
    expect(ctx.law.roe.underAttack).toBe(true);
    expect(ctx.law.canArrest(r)).toBe(true);
  });

  it('l\'aide de collègues et l\'état de la personne changent la durée et les chances', async () => {
    const law = await startLaw({ seed: 9 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const dur = protester(ctx, 0, 1.2, 'radical');
    dur.anger = 0.8;
    const out: InteractionOption[] = [];
    ctx.interactions.options(agent, out);
    const seul = out.find((o) => o.verb === 'maitriser')!.duration;
    crs(ctx, 1, 2);
    crs(ctx, -1, 2);
    ctx.people.rebuildIndex();
    ctx.interactions.options(agent, out);
    const aide = out.find((o) => o.verb === 'maitriser')!.duration;
    expect(aide).toBeLessThan(seul * 0.6);
    // à terre et sonné : la saisie est immédiate et sûre
    ctx.health.setDown(dur, true);
    ctx.interactions.options(agent, out);
    expect(out.find((o) => o.verb === 'maitriser')!.duration).toBeLessThan(1);
    expect(act(law, agent, 'maitriser', dur.id)).toBe(true);
    expect(dur.custody).toBe('held');
    expect(dur.posture).toBe('down');
  });

  it('maîtrisé mais non menotté et laissé sans surveillance, il s\'échappe ; menotté, il reste', async () => {
    const law = await startLaw({ seed: 8 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const a = protester(ctx, 0, 1.2, 'pacifique');
    ctx.law.recordOffense(a, 'degradation', a.x, a.z);
    expect(subdue(law, agent, a)).toBeGreaterThan(0);
    let escaped = 0;
    ctx.events.onAny('law:escape', () => escaped++);
    agent.x = 30; // l'agent s'en va
    law.t.step(3);
    expect(escaped).toBe(1);
    expect(a.custody).toBe('free');
    expect(law.records.interpellations[0]!.status).toBe('evade');
    a.x = 80;

    agent.x = 0;
    const b = protester(ctx, 0, 1.2, 'pacifique');
    ctx.law.recordOffense(b, 'degradation', b.x, b.z);
    ctx.people.rebuildIndex();
    expect(subdue(law, agent, b)).toBeGreaterThan(0);
    act(law, agent, 'menotter', b.id);
    agent.x = 30;
    law.t.step(10);
    expect(b.custody).toBe('cuffed');
    expect(b.heldBy).toBe(0);
    expect(escaped).toBe(1);
    // un autre agent peut reprendre l'escorte
    const relais = crs(ctx, b.x + 1, b.z);
    ctx.people.rebuildIndex();
    expect(act(law, relais, 'escorter', b.id)).toBe(true);
    expect(b.heldBy).toBe(relais.id);
    // et faire asseoir la personne pour reprendre les mains libres
    expect(verbs(ctx, relais)).toContain('escorter');
    expect(act(law, relais, 'escorter', b.id)).toBe(true);
    expect(b.custody).toBe('cuffed');
    expect(b.posture).toBe('sit');
    expect(relais.carrying).toBe(0);
  });

  it('si l\'escorte est mise hors de combat, la personne menottée reste entravée sur place', async () => {
    const law = await startLaw({ seed: 8 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const p = protester(ctx, 0, 1.2, 'pacifique');
    ctx.law.recordOffense(p, 'degradation', p.x, p.z);
    expect(subdue(law, agent, p)).toBeGreaterThan(0);
    act(law, agent, 'menotter', p.id);
    act(law, agent, 'escorter', p.id);
    ctx.health.setDown(agent, true);
    law.t.step(0.5);
    expect(p.custody).toBe('cuffed');
    expect(p.posture).toBe('sit');
    expect(law.records.arrestOf(p.id)).not.toBeNull();
    // la personne retenue quitte le jeu : le dossier est clos en l'état
    ctx.people.remove(p.id);
    expect(law.records.arrestOf(p.id)).toBeNull();
    expect(law.records.interpellations[0]!.status).toBe('interrompu');
  });

  it('frapper une personne déjà menottée est une faute lourde, portée au dossier', async () => {
    const law = await startLaw({ seed: 8 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const p = protester(ctx, 0, 1.2, 'radical');
    attackOfficer(ctx, p, agent, 1);
    expect(subdue(law, agent, p)).toBeGreaterThan(0);
    act(law, agent, 'menotter', p.id);
    const v = ctx.law.reportForce(agent, 'baton', p, p.x, p.z);
    expect(v.kind).toBe('disproportionne');
    expect(v.severity).toBe(5);
    const rec = law.records.arrestOf(p.id)!;
    expect(rec.worstVerdict).toBe('disproportionne');
    expect(rec.force).toEqual(expect.arrayContaining(['contact', 'baton']));
    act(law, agent, 'escorter', p.id);
    ctx.vehicles.spawn('fourgon_crs', agent.x + 3, agent.z, 0, { faction: 'police' });
    act(law, agent, 'remettre', p.id);
    expect(rec.regular).toBe(false);
    expect(rec.notes.join(' ')).toContain('violences illégitimes');
  });
});

describe('droit — menottes de la dotation', () => {
  it('quand le module des objets définit les menottes, il en faut une paire, rendue à la remise', async () => {
    const law = await startLaw({
      seed: 8,
      systems: [{
        id: 'test:items', order: 1,
        provide(c) {
          const base = c.actions;
          c.actions = Object.assign(Object.create(base), {
            def: (id: string) => (id === 'menottes' ? { id, name: 'Menottes', category: 'restraint', forceMeans: null } : undefined),
          });
        },
      }],
    });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    ctx.player.possess(agent.id);
    const p = protester(ctx, 0, 1.2, 'pacifique');
    ctx.law.recordOffense(p, 'degradation', p.x, p.z);
    expect(subdue(law, agent, p)).toBeGreaterThan(0);
    expect(ctx.interactions.startVerb(agent, 'menotter', p.id)).toBe(false);
    expect(law.notices.at(-1)?.text).toContain('Plus de menottes');
    ctx.actions.give(agent, 'menottes', 1);
    expect(act(law, agent, 'menotter', p.id)).toBe(true);
    expect(ctx.actions.has(agent, 'menottes')).toBe(0);
    act(law, agent, 'escorter', p.id);
    ctx.vehicles.spawn('fourgon_crs', agent.x + 3, agent.z, 0, { faction: 'police' });
    act(law, agent, 'remettre', p.id);
    expect(ctx.actions.has(agent, 'menottes')).toBe(1);
  });
});

describe('droit — contrôle d\'identité', () => {
  it('en situation calme : résultat, motif légal ou non, inscription au dossier', async () => {
    const law = await startLaw({ seed: 8 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    ctx.player.possess(agent.id);
    const passant = person(ctx, 'passant', 0, 1.2, { name: 'Camille Morel' });
    expect(verbs(ctx, agent)[0]).toBe('controler');
    expect(act(law, agent, 'controler', passant.id)).toBe(true);
    expect(passant.custody).toBe('free');
    const c = law.records.controles[0]!;
    expect(c.justified).toBe(false);
    expect(c.result).toContain('Camille Morel');
    expect(c.result).toContain('sans motif légal');
    expect(law.notices.at(-1)?.kind).toBe('warn');
    // pas deux contrôles de suite de la même personne
    expect(ctx.interactions.startVerb(agent, 'controler', passant.id)).toBe(false);
    passant.x = 40;

    // visage dissimulé : motif légal ; fait déjà constaté : le contrôle le révèle
    const masque = protester(ctx, 0, 1.2, 'militant', { look: { faceCover: true } });
    ctx.law.recordOffense(masque, 'degradation', masque.x, masque.z);
    ctx.people.rebuildIndex();
    law.t.step(3);
    expect(act(law, agent, 'controler', masque.id)).toBe(true);
    const c2 = law.records.controles[1]!;
    expect(c2.justified).toBe(true);
    expect(c2.known).toBe('degradation');
    expect(c2.result).toContain("L'interpellation est fondée");
    masque.x = 40;

    // journaliste : vérification de la carte de presse
    const jri = person(ctx, 'journaliste', 0, 1.2);
    ctx.people.rebuildIndex();
    expect(act(law, agent, 'controler', jri.id)).toBe(true);
    expect(law.records.controles[2]!.justified).toBe(true);
    expect(law.records.controles[2]!.result).toContain('Carte de presse');
    expect(law.records.stats().unjustifiedControls).toBe(1);
  });

  it('pas de contrôle sous les projectiles ni d\'une personne qui court', async () => {
    const law = await startLaw({ seed: 8 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const coureur = protester(ctx, 0, 1.2);
    coureur.vx = 3;
    expect(verbs(ctx, agent)).not.toContain('controler');
    coureur.vx = 0;
    expect(verbs(ctx, agent)).toContain('controler');
    attackOfficer(ctx, protester(ctx, 0, 20, 'radical'), agent);
    expect(verbs(ctx, agent)).not.toContain('controler');
  });
});

describe('droit — qui peut interpeller', () => {
  it('seuls les agents valides, à pied, proposent ces interactions', async () => {
    const law = await startLaw({ seed: 8 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const civil = protester(ctx, 1, 0);
    const cible = protester(ctx, 0, 1.2, 'radical');
    attackOfficer(ctx, cible, agent, 1);
    expect(verbs(ctx, civil)).toEqual([]);
    expect(ctx.interactions.startVerb(civil, 'maitriser', cible.id)).toBe(false);
    ctx.health.setDown(agent, true);
    expect(verbs(ctx, agent)).toEqual([]);
    ctx.health.setDown(agent, false);
    const fourgon = ctx.vehicles.spawn('fourgon_crs', 0, 0, 0, { faction: 'police' });
    ctx.vehicles.enter(agent, fourgon, 'driver');
    expect(verbs(ctx, agent)).toEqual([]);
  });
});
