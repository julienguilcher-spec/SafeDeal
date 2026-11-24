import { describe, expect, it } from 'vitest';
import type { InteractVerb, Person } from '@/core/contracts';
import type { LawAdvisor, LawHandover, LawRecords } from '@/gameplay/law/api';
import type { LawTest } from '@/gameplay/law/testkit';
import { attackOfficer, commissaire, crowd, crs, fullSommations, person, protester, startLaw } from '@/gameplay/law/testkit';

function act(law: LawTest, actor: Person, verb: InteractVerb, targetId: number): boolean {
  if (!law.ctx.interactions.startVerb(actor, verb, targetId)) return false;
  const cur = law.ctx.interactions.current(actor);
  if (cur) law.t.step(cur.opt.duration + 0.1);
  return true;
}

function subdue(law: LawTest, actor: Person, target: Person): boolean {
  for (let i = 0; i < 8; i++) {
    actor.x = target.x;
    actor.z = target.z - 1;
    law.ctx.people.rebuildIndex();
    if (act(law, actor, 'maitriser', target.id) && target.custody === 'held') return true;
    law.t.step(2.1);
  }
  return false;
}

describe('droit — dossier de la session', () => {
  it('une mission conduite dans les règles : score 100, aucune suite', async () => {
    const law = await startLaw({ seed: 12 });
    const { ctx } = law;
    const com = commissaire(ctx, 0, 0);
    const agent = crs(ctx, 2, 0);
    const foule = crowd(ctx, 0, 20, 30);
    for (let i = 0; i < 4; i++) ctx.law.recordOffense(foule[i]!, 'degradation', foule[i]!.x, foule[i]!.z);
    fullSommations(law, com);
    expect(ctx.law.reportForce(agent, 'lacrymo', null, 0, 20).kind).toBe('licite');
    const st = law.records.stats();
    expect(st.sommations).toBe(3);
    expect(st.forces).toBe(1);
    expect(st.faults).toBe(0);
    expect(st.byMeans.lacrymo).toBe(1);
    expect(st.score).toBe(100);
    expect(st.sanction).toBe('aucune');
    expect(st.inquiry).toBe(false);
    const text = law.records.summary();
    expect(text).toContain('annonce par Commissaire Arnaud, au mégaphone');
    expect(text).toContain('dernière sommation');
    expect(text).toContain('1 acte enregistré, dont 1 licite');
    expect(text).toContain('Score de régularité : 100 / 100');
    expect(text).toContain('aucune suite disciplinaire');
    expect(text).not.toContain('enquête');
  });

  it('une bavure filmée est détectée, expliquée et sanctionnable', async () => {
    const law = await startLaw({ seed: 12 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0, { name: 'Gardien Lefort' });
    const collegue = crs(ctx, 30, 0, { name: 'Gardien Marchal' });
    const foule = crowd(ctx, 0, 20, 30);
    const jri = person(ctx, 'journaliste', 6, 14, { name: 'Reporter Nadia Benali' });
    jri.upper = 'film';
    jri.aimYaw = Math.atan2(-6, 6); // vers la foule
    // gaz sur une foule calme, sans sommation, devant une caméra
    const v1 = ctx.law.reportForce(agent, 'lacrymo', null, 0, 20);
    expect(v1.kind).toBe('sans_sommation');
    law.t.step(1);
    // puis LBD sur un pacifique
    const v2 = ctx.law.reportForce(agent, 'lbd', foule[5]!, foule[5]!.x, foule[5]!.z);
    expect(v2.kind).toBe('interdit');
    // son collègue, lui, n'a rien fait
    const st = law.records.stats();
    expect(st.faults).toBe(2);
    expect(st.filmedFaults).toBe(2);
    expect(st.worstSeverity).toBe(5);
    expect(st.byVerdict.sans_sommation).toBe(1);
    expect(st.byVerdict.interdit).toBe(1);
    expect(st.score).toBe(100 - 20 - 32);
    expect(st.sanction).toBe('revocation'); // faute lourde filmée
    expect(st.inquiry).toBe(true);
    expect(st.complaints).toBe(1);
    expect(law.records.stats(agent.id).faults).toBe(2);
    expect(law.records.stats(collegue.id).faults).toBe(0);
    expect(law.records.stats(collegue.id).score).toBe(100);
    expect(law.records.stats(collegue.id).sanction).toBe('aucune');

    const text = law.records.summary(agent.id);
    expect(text).toContain('Sommations : aucune sommation prononcée.');
    expect(text).toContain('2 actes enregistrés, dont 0 licite et 2 fautes (2 filmées par des tiers)');
    expect(text).toContain('Fautes par nature : sans sommation × 1, interdit × 1');
    // la plus grave d'abord, avec son explication
    const lines = text.split('\n');
    const first = lines.findIndex((l) => l.includes('LBD : interdit (gravité 5, filmé)'));
    const second = lines.findIndex((l) => l.includes('grenade lacrymogène : sans sommation (gravité 4, filmé)'));
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(lines[first]).toContain("jamais un moyen de dispersion");
    expect(text).toContain('Plaintes ou signalements probables : 1.');
    expect(text).toContain('révocation encourue');
    expect(text).toContain("enquête de l'inspection générale");
    expect(law.records.summary(collegue.id)).toContain('aucun acte de force enregistré');
  });

  it('interpellations, contrôles et plaintes figurent au compte rendu', async () => {
    const law = await startLaw({ seed: 14 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0, { name: 'Brigadier Roche' });
    const innocent = protester(ctx, 0, 1.2, 'pacifique', { name: 'Manifestante au foulard vert' });
    expect(subdue(law, agent, innocent)).toBe(true);
    act(law, agent, 'relacher', innocent.id);
    innocent.x = 60;
    const lanceur = protester(ctx, 0, 1.2, 'militant', { name: 'Individu casquette noire' });
    attackOfficer(ctx, lanceur, agent, 2);
    ctx.people.rebuildIndex();
    expect(subdue(law, agent, lanceur)).toBe(true);
    act(law, agent, 'menotter', lanceur.id);
    act(law, agent, 'escorter', lanceur.id);
    ctx.require<LawHandover>('law.handover').points.push({ x: agent.x, z: agent.z });
    expect(act(law, agent, 'remettre', lanceur.id)).toBe(true);
    lanceur.x = 80;
    const passant = person(ctx, 'passant', agent.x, agent.z + 1.2, { name: 'Riverain' });
    ctx.people.rebuildIndex();
    law.t.step(law.cfg.attackMemory + 1);
    expect(act(law, agent, 'controler', passant.id)).toBe(true);

    const st = law.records.stats();
    expect([st.arrests, st.founded, st.unfounded, st.handedOver, st.released]).toEqual([2, 1, 1, 1, 1]);
    expect(st.controls).toBe(1);
    expect(st.unjustifiedControls).toBe(1);
    expect(st.complaints).toBe(2); // interpellation arbitraire, contrôle sans motif
    expect(st.score).toBe(100 - 6 - 2);
    expect(st.sanction).toBe('aucune');
    const text = law.records.summary();
    // « remis à l'officier de police judiciaire » : au commissariat seulement (plan ordres-directs §5.6)
    expect(text).toContain('Interpellations : 2 — 1 fondée, 1 infondée ; 1 remise à un point de regroupement, 1 remise en liberté.');
    expect(text).not.toContain('officier de police judiciaire');
    expect(text).toContain('Manifestante au foulard vert par Brigadier Roche : aucun fait rattaché — remis en liberté, procédure nulle');
    expect(text).toContain('Individu casquette noire par Brigadier Roche : violences sur une personne dépositaire');
    expect(text).toContain('constaté par un agent, sans image');
    expect(text).toContain("Contrôles d'identité : 1, dont 1 sans motif légal.");
    expect(text).toContain('interpellation sans fait constaté');
  });

  it('le service est publié sous la clé law.records et repart de zéro à chaque session', async () => {
    const law = await startLaw({ seed: 12 });
    const { ctx } = law;
    const agent = crs(ctx, 0, 0);
    const com = commissaire(ctx, 3, 0);
    const p = protester(ctx, 0, 1.2);
    ctx.law.sommation(com);
    ctx.law.reportForce(agent, 'baton', p, p.x, p.z);
    ctx.law.recordOffense(p, 'tag', p.x, p.z);
    ctx.require<LawHandover>('law.handover').points.push({ x: 0, z: 0 });
    attackOfficer(ctx, p, agent);
    ctx.law.authorize(3, com.id);
    const records = ctx.service<LawRecords>('law.records')!;
    expect(records).toBe(law.records);
    expect(records.forces).toBe(ctx.law.forceLog);
    expect(records.forces.length).toBe(1);
    expect(ctx.law.roe.underAttack).toBe(true);

    await law.t.start({ seed: 99 });
    expect(records.forces.length).toBe(0);
    expect(records.sommations.length).toBe(0);
    expect(records.autorisations.length).toBe(0);
    expect(records.plaintes.length).toBe(0);
    expect(records.lastRefusal).toBe('');
    expect(ctx.law.roe).toEqual({
      dispersionOrdered: false, sommation: 0, sommationAt: 0, underAttack: false, lawfulForce: 1, authorizedForce: 1,
    });
    expect(ctx.require<LawHandover>('law.handover').points).toEqual([]);
    expect(records.score).toBe(100);
    // et tout refonctionne
    const com2 = commissaire(ctx, 0, 0);
    expect(ctx.law.sommation(com2)).toBe(1);
  });
});

describe('droit — aide à la décision (service law.advisor)', () => {
  it('assess() rend le verdict sans rien inscrire, émettre ni reprocher', async () => {
    const law = await startLaw({ seed: 12 });
    const { ctx } = law;
    const advisor = ctx.require<LawAdvisor>('law.advisor');
    const agent = crs(ctx, 0, 0);
    ctx.player.possess(agent.id);
    const foule = crowd(ctx, 0, 20, 30);
    let events = 0;
    ctx.events.on('law:force', () => events++);
    const dry = advisor.assess(agent, 'lacrymo', null, 0, 20);
    expect(dry.kind).toBe('sans_sommation');
    expect(dry.severity).toBe(4);
    expect(advisor.assess(agent, 'lbd', foule[2]!, foule[2]!.x, foule[2]!.z).kind).toBe('interdit');
    expect(advisor.assess(agent, 'contact', foule[2]!, foule[2]!.x, foule[2]!.z).kind).toBe('licite');
    expect(ctx.law.forceLog).toHaveLength(0);
    expect(events).toBe(0);
    expect(law.notices).toHaveLength(0);
    expect(law.records.plaintes).toHaveLength(0);
    expect(law.records.score).toBe(100);
    // même réponse que la déclaration réelle
    expect(ctx.law.reportForce(agent, 'lacrymo', null, 0, 20).kind).toBe('sans_sommation');
    attackOfficer(ctx, foule[0]!, agent);
    expect(advisor.assess(agent, 'lacrymo', null, 0, 21).kind).toBe('licite');
    expect(advisor.riposteAt(0, 10)).toBe(true);
    expect(advisor.riposteAt(500, 10)).toBe(false);
    expect(advisor.authorizedFor(agent)).toBe(3);
    expect(advisor.authorizedFor(crs(ctx, 500, 0))).toBe(1);
  });

  it('délais et motifs de refus des sommations, pour l\'interface du commissaire', async () => {
    const law = await startLaw({ seed: 12 });
    const { ctx, cfg } = law;
    const advisor = ctx.require<LawAdvisor>('law.advisor');
    const com = commissaire(ctx, 0, 0);
    const gardien = crs(ctx, 2, 0);
    crowd(ctx, 0, 20, 30);
    expect(advisor.sommationRefusal(com)).toBe('');
    expect(advisor.sommationRefusal(gardien)).toContain('Seul le commandant');
    expect(law.records.lastRefusal).toBe(''); // simple question : rien n'est consigné
    expect(advisor.sommationWait()).toBe(0);
    expect(advisor.forceWait()).toBe(Infinity);
    ctx.law.sommation(com);
    expect(advisor.sommationWait()).toBeCloseTo(cfg.delayAnnonce, 5);
    expect(advisor.sommationRefusal(com)).toContain('Délai insuffisant');
    law.t.step(cfg.delayAnnonce + 0.1);
    expect(advisor.sommationRefusal(com)).toBe('');
    ctx.law.sommation(com);
    law.t.step(cfg.delaySommation + 0.1);
    ctx.law.sommation(com);
    expect(advisor.forceWait()).toBeCloseTo(cfg.delayForce, 5);
    expect(advisor.armsWait()).toBe(Infinity);
    expect(advisor.reiterated).toBe(false);
    law.t.step(cfg.delayForce + 0.1);
    expect(advisor.forceWait()).toBe(0);
    ctx.law.sommation(com);
    expect(advisor.reiterated).toBe(true);
    expect(advisor.armsWait()).toBeCloseTo(cfg.delayArmes, 5);
    expect([advisor.zoneX, advisor.zoneZ, advisor.zoneRadius]).toEqual([0, 0, cfg.sequenceRadius]);
    expect(advisor.enclosed).toBe(false);
  });
});
