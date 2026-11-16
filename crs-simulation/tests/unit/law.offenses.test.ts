import { describe, expect, it } from 'vitest';
import type { GameEvents } from '@/core/contracts';
import { crs, person, protester, startLaw } from '@/gameplay/law/testkit';

describe('droit — infractions : gravité et événement', () => {
  it('gravité par défaut selon le type, gravité imposée respectée, événement law:offense', async () => {
    const { ctx } = await startLaw();
    const p = protester(ctx, 0, 0, 'radical');
    const seen: GameEvents['law:offense'][] = [];
    ctx.events.on('law:offense', (e) => seen.push(e));
    const tag = ctx.law.recordOffense(p, 'tag', 0, 0);
    const jet = ctx.law.recordOffense(p, 'jet_projectile', 0, 0);
    const feu = ctx.law.recordOffense(p, 'incendie', 0, 0);
    const grave = ctx.law.recordOffense(p, 'violence', 0, 0, 5);
    expect([tag.severity, jet.severity, feu.severity, grave.severity]).toEqual([1, 3, 4, 5]);
    expect(tag.t).toBe(ctx.clock.now);
    expect(p.offenses).toHaveLength(4);
    expect(seen.map((e) => e.offense.type)).toEqual(['tag', 'jet_projectile', 'incendie', 'violence']);
    expect(seen[0]!.personId).toBe(p.id);
    // personne n'a rien vu ni filmé
    expect(p.offenses.every((o) => !o.witnessed && !o.filmed)).toBe(true);
    expect(ctx.law.worstOffense(p)).toBe(grave);
    expect(ctx.law.worstOffense(protester(ctx, 5, 5))).toBeNull();
  });

  it('deux déclarations du même fait n\'en font qu\'une', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const p = protester(ctx, 0, 0, 'radical');
    const a = ctx.law.recordOffense(p, 'degradation', 0, 0);
    const b = ctx.law.recordOffense(p, 'degradation', 0.5, 0, 3);
    expect(b).toBe(a);
    expect(a.severity).toBe(3);
    expect(p.offenses).toHaveLength(1);
    law.t.step(3);
    ctx.law.recordOffense(p, 'degradation', 0, 0);
    expect(p.offenses).toHaveLength(2);
  });

  it('la liste par personne reste bornée, les faits les plus graves sont gardés', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const p = protester(ctx, 0, 0, 'radical');
    ctx.law.recordOffense(p, 'incendie', 0, 0);
    for (let i = 0; i < 60; i++) {
      law.t.step(2.5);
      ctx.law.recordOffense(p, 'tag', 0, 0);
    }
    expect(p.offenses.length).toBeLessThanOrEqual(24);
    expect(ctx.law.worstOffense(p)?.type).toBe('incendie');
  });
});

describe('droit — vu ou non selon la ligne de vue (monde factice avec un mur)', () => {
  // mur nord-sud sur l'axe x = 0, de z = −20 à z = 20
  const walls = [[0, -20, 0, 20]] as const;

  it('un agent derrière le mur ne voit rien : pas de flagrant délit', async () => {
    const { ctx } = await startLaw({ walls });
    crs(ctx, -6, 0);
    const casseur = protester(ctx, 6, 0, 'radical');
    const o = ctx.law.recordOffense(casseur, 'degradation', casseur.x, casseur.z);
    expect(o.witnessed).toBe(false);
    expect(ctx.law.canArrest(casseur)).toBe(false);
  });

  it('un agent du même côté du mur voit le fait : interpellation fondée', async () => {
    const { ctx } = await startLaw({ walls });
    crs(ctx, -6, 0);
    crs(ctx, 6, 15);
    const casseur = protester(ctx, 6, 0, 'radical');
    const o = ctx.law.recordOffense(casseur, 'degradation', casseur.x, casseur.z);
    expect(o.witnessed).toBe(true);
    expect(ctx.law.canArrest(casseur)).toBe(true);
  });

  it('trop loin, à terre ou aveuglé par le gaz, un agent n\'est pas témoin', async () => {
    const { ctx } = await startLaw();
    const loin = crs(ctx, 0, 80);
    const casseur = protester(ctx, 0, 0, 'radical');
    expect(ctx.law.recordOffense(casseur, 'degradation', 0, 0).witnessed).toBe(false);
    loin.z = 30;
    ctx.people.rebuildIndex();
    const autre = protester(ctx, 1, 0, 'radical');
    expect(ctx.law.recordOffense(autre, 'degradation', 1, 0).witnessed).toBe(true);
    // l'agent est mis à terre
    ctx.health.setDown(loin, true);
    const b = protester(ctx, 2, 0, 'radical');
    expect(ctx.law.recordOffense(b, 'degradation', 2, 0).witnessed).toBe(false);
    ctx.health.setDown(loin, false);
    loin.gas = 0.9;
    const c = protester(ctx, 3, 0, 'radical');
    expect(ctx.law.recordOffense(c, 'degradation', 3, 0).witnessed).toBe(false);
    loin.gasProtection = 1; // masque à gaz
    const d = protester(ctx, 4, 0, 'radical');
    expect(ctx.law.recordOffense(d, 'degradation', 4, 0).witnessed).toBe(true);
  });

  it('la nuit sans éclairage et la fumée réduisent ce qui est vu', async () => {
    const hazy = { visibility: 1 };
    const law = await startLaw({
      systems: [{
        id: 'test:smoke', order: 1,
        provide(c) { c.hazards = { ...c.hazards, visibility: () => hazy.visibility }; },
      }],
    });
    const { ctx } = law;
    crs(ctx, 0, 30);
    const a = protester(ctx, 0, 0, 'radical');
    expect(ctx.law.recordOffense(a, 'degradation', 0, 0).witnessed).toBe(true);
    hazy.visibility = 0.1; // rideau de fumée entre l'agent et la scène
    const b = protester(ctx, 1, 0, 'radical');
    expect(ctx.law.recordOffense(b, 'degradation', 1, 0).witnessed).toBe(false);
    hazy.visibility = 1;
    ctx.env.setTime(2); // pleine nuit
    const c = protester(ctx, 2, 0, 'radical');
    // sous l'éclairage public, la portée tombe à 60 % de 45 m = 27 m : l'agent à 30 m ne distingue plus l'auteur
    expect(ctx.env.state.streetLights).toBe(true);
    expect(ctx.law.recordOffense(c, 'degradation', 2, 0).witnessed).toBe(false);
  });

  it('un fait déclaré sur une façade reste visible si l\'auteur, lui, est en vue', async () => {
    const { ctx } = await startLaw({ walls });
    crs(ctx, 6, 15);
    const casseur = protester(ctx, 1, 0, 'radical');
    // le point du fait est de l'autre côté du mur (dans le bâtiment), l'auteur est dans la rue
    const o = ctx.law.recordOffense(casseur, 'degradation', -0.5, 0);
    expect(o.witnessed).toBe(true);
  });
});

describe('droit — filmé ou non', () => {
  it('journaliste qui filme, téléphone levé, drone en vol, caméra-piéton proche', async () => {
    const { ctx } = await startLaw();
    const casseur = protester(ctx, 0, 0, 'radical');
    expect(ctx.law.recordOffense(casseur, 'degradation', 0, 0).filmed).toBe(false);

    // journaliste présent mais qui ne filme pas
    const jri = person(ctx, 'journaliste', 0, 12);
    jri.aimYaw = Math.PI; // regarde vers −z, donc vers la scène
    const b = protester(ctx, 1, 0, 'radical');
    expect(ctx.law.recordOffense(b, 'degradation', 1, 0).filmed).toBe(false);
    jri.upper = 'film';
    const c = protester(ctx, 2, 0, 'radical');
    const filmed = ctx.law.recordOffense(c, 'degradation', 2, 0);
    expect(filmed.filmed).toBe(true);
    expect(filmed.witnessed).toBe(false);
    // filmé sans témoin policier : la preuve suffit à fonder l'interpellation
    expect(ctx.law.canArrest(c)).toBe(true);
    jri.upper = 'none';

    // un manifestant filme avec son téléphone
    const temoin = protester(ctx, 0, -8);
    temoin.upper = 'film';
    temoin.aimYaw = 0;
    const d = protester(ctx, 0.5, 0, 'radical');
    expect(ctx.law.recordOffense(d, 'tag', 0.5, 0).filmed).toBe(true);
    temoin.upper = 'none';

    // drone de la préfecture en vol à 60 m
    const drone = ctx.vehicles.spawn('drone', 40, 40, 0, { faction: 'police' });
    const e = protester(ctx, 3, 0, 'radical');
    expect(ctx.law.recordOffense(e, 'degradation', 3, 0).filmed).toBe(false); // posé au sol
    drone.y = 60;
    const f = protester(ctx, 4, 0, 'radical');
    expect(ctx.law.recordOffense(f, 'degradation', 4, 0).filmed).toBe(true);
    drone.x = 500;
    const g = protester(ctx, 5, 0, 'radical');
    expect(ctx.law.recordOffense(g, 'degradation', 5, 0).filmed).toBe(false);

    // caméra-piéton d'un chef de groupe à 8 m, tourné vers la scène
    const chef = crs(ctx, 6, 8, { poste: 'chef_groupe' });
    chef.aimYaw = Math.PI;
    const h = protester(ctx, 6, 0, 'radical');
    const o = ctx.law.recordOffense(h, 'degradation', 6, 0);
    expect(o.filmed).toBe(true);
    expect(o.witnessed).toBe(true);
  });

  it('une prise de vue signalée par le module des médias couvre la scène', async () => {
    const { ctx } = await startLaw();
    const casseur = protester(ctx, 0, 0, 'radical');
    ctx.events.emit('media:shot', { byId: 0, x: 2, z: 2, subject: 'casse', value: 5 });
    expect(ctx.law.recordOffense(casseur, 'degradation', 0, 0).filmed).toBe(true);
  });
});

describe('droit — flagrant délit', () => {
  it('une contravention ne fonde pas une interpellation ; un délit vu, si', async () => {
    const { ctx } = await startLaw();
    crs(ctx, 0, 10);
    const tagueur = protester(ctx, 0, 0);
    ctx.law.recordOffense(tagueur, 'tag', 0, 0);
    expect(ctx.law.canArrest(tagueur)).toBe(false);
    ctx.law.recordOffense(tagueur, 'degradation', 0, 0);
    expect(ctx.law.canArrest(tagueur)).toBe(true);
    // un policier n'est pas « interpellable » par ce biais
    const agent = crs(ctx, 3, 3);
    ctx.law.recordOffense(agent, 'violence', 3, 3);
    expect(ctx.law.canArrest(agent)).toBe(false);
  });

  it('à gravité égale, l\'infraction la mieux établie est retenue', async () => {
    const law = await startLaw();
    const { ctx } = law;
    const p = protester(ctx, 0, 0, 'radical');
    const sansTemoin = ctx.law.recordOffense(p, 'jet_projectile', 0, 0);
    law.t.step(5);
    crs(ctx, 0, 10);
    const vue = ctx.law.recordOffense(p, 'pillage', 0, 0);
    law.t.step(5);
    expect(sansTemoin.witnessed).toBe(false);
    expect(vue.witnessed).toBe(true);
    expect(ctx.law.worstOffense(p)).toBe(vue);
  });
});

describe('droit — infractions et violences déduites des événements', () => {
  it('jet de projectile, bris de vitrine, pillage, incendie : inscrits sans autre déclaration', async () => {
    const { ctx } = await startLaw();
    crs(ctx, 0, 100); // trop loin pour être une cible, et pour voir
    const p = protester(ctx, 0, 0, 'radical');
    ctx.projectiles.spawn('pave', p.id, 0, 1.5, 0, 0, 5, 10);
    ctx.events.emit('shop:window', { id: 77, state: 'broken', byId: p.id });
    ctx.events.emit('shop:looted', { id: 77, byId: p.id, amount: 1 });
    ctx.events.emit('fire:started', { x: 1, z: 1, targetKind: 'prop', targetId: 5, sourceId: p.id });
    expect(p.offenses.map((o) => o.type)).toEqual(['jet_projectile', 'degradation', 'pillage', 'incendie']);
    expect(ctx.law.roe.underAttack).toBe(false);
    // un engin incendiaire est plus grave qu'un pavé
    const q = protester(ctx, 5, 0, 'radical');
    ctx.projectiles.spawn('molotov', q.id, 5, 1.5, 0, 0, 5, 10);
    expect(q.offenses[0]!.severity).toBe(4);
    // les grenades des forces ne sont pas des infractions
    const agent = crs(ctx, 0, 3);
    ctx.projectiles.spawn('grenade_lacrymo_main', agent.id, 0, 1.5, 3, 0, 5, 10);
    expect(agent.offenses).toHaveLength(0);
  });

  it('projectile tombant près des forces, incendie d\'un véhicule de police, agent blessé : riposte ouverte', async () => {
    const a = await startLaw();
    crs(a.ctx, 0, 0);
    a.ctx.events.emit('projectile:impact', { id: 1, kind: 'pave', ownerId: 0, x: 60, y: 0, z: 0, hitKind: 'ground', hitId: 0 });
    expect(a.ctx.law.roe.underAttack).toBe(false);
    a.ctx.events.emit('projectile:impact', { id: 2, kind: 'pave', ownerId: 0, x: 6, y: 0, z: 0, hitKind: 'ground', hitId: 0 });
    expect(a.ctx.law.roe.underAttack).toBe(true);

    const b = await startLaw();
    const fourgon = b.ctx.vehicles.spawn('fourgon_crs', 0, 0, 0, { faction: 'police' });
    b.ctx.events.emit('fire:started', { x: 0, z: 0, targetKind: 'vehicle', targetId: fourgon.id, sourceId: 0 });
    expect(b.ctx.law.roe.underAttack).toBe(true);

    const c = await startLaw();
    const agent = crs(c.ctx, 0, 0);
    // blessé par le gaz de ses propres collègues : ce n'est pas une attaque
    c.ctx.health.hurt(agent, { amount: 2, kind: 'gas', sourceId: 0, x: 0, z: 0 });
    expect(c.ctx.law.roe.underAttack).toBe(false);
    const lanceur = protester(c.ctx, 0, 20, 'radical');
    c.ctx.health.hurt(agent, { amount: 12, kind: 'impact', sourceId: lanceur.id, item: 'pave', x: 0, z: 0 });
    expect(c.ctx.law.roe.underAttack).toBe(true);
    expect(lanceur.offenses[0]!.type).toBe('violence_agent');

    const d = await startLaw();
    const vise = crs(d.ctx, 0, 0);
    const chauffard = protester(d.ctx, 0, 5, 'radical');
    const voiture = d.ctx.vehicles.spawn('voiture', 0, 5, 0);
    d.ctx.vehicles.enter(chauffard, voiture, 'driver');
    d.ctx.events.emit('vehicle:collision', { vehicleId: voiture.id, otherKind: 'person', otherId: vise.id, speed: 8, x: 0, z: 1 });
    expect(d.ctx.law.roe.underAttack).toBe(true);
    expect(chauffard.offenses[0]!.type).toBe('violence_agent');
  });

  it('une grenade renvoyée vers les forces est un jet de projectile', async () => {
    const { ctx } = await startLaw();
    crs(ctx, 0, 0);
    const p = protester(ctx, 0, 15, 'radical');
    ctx.events.emit('projectile:returned', { id: 4, byId: p.id });
    expect(p.offenses[0]!.type).toBe('jet_projectile');
    expect(ctx.law.roe.underAttack).toBe(true);
  });
});
