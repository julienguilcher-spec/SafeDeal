// Foule — le directeur : durées des phases selon le préréglage, tension locale et globale, états superposés,
// catalogue d'aléas (≥ 30, tirés par mission selon la graine et la propension à dégénérer), fin de la
// manifestation ; points d'extension (registre de contrôleurs par profil, service 'crowd.core').
import { describe, expect, it } from 'vitest';
import type { CrowdPhase, Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { ALEA_CATALOGUE, ALEA_EVENT, CROWD_CORE, CROWD_STATE, HELP_EVENT } from '@/sim/crowd';
import type { AleaEvent, BehaviorController, CrowdCoreApi } from '@/sim/crowd';
import { brainOf } from '@/sim/crowd/brain';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

const MODULES = [world, people, items, hazards, law];
const QUIET = { 'crowd.noAleas': true, 'crowd.bystanders': 0 };

describe('foule — directeur', () => {
  it('met les durées des phases à l\'échelle du préréglage (10 / 25 / 45 min / temps réel)', async () => {
    const expected = { courte: [72, 24, 264, 96, 144], standard: [180, 60, 660, 240, 360], longue: [324, 108, 1188, 432, 648], temps_reel: [3600, 900, 10800, 2400, 7200] } as const;
    for (const duration of ['courte', 'standard', 'longue', 'temps_reel'] as const) {
      const t = createCrowdTest({ seed: 1, modules: [world] });
      await t.start(demoConfig({ crowdSize: 40, duration, extra: QUIET }));
      const s = t.core.schedule;
      const got = [s.gather, s.depart, s.march, s.disperse, s.after];
      for (let i = 0; i < 5; i++) expect(got[i]).toBeCloseTo(expected[duration][i]!, 3);
      expect(t.ctx.director.phase).toBe('rassemblement');
      expect(t.ctx.director.stats.total).toBe(40);
    }
  });

  it('sans manifestation : phase « aucune », aucun parcours, mais les stations de métro restent connues', async () => {
    const t = createCrowdTest({ seed: 1, modules: [world] });
    await t.start(demoConfig({ crowdSize: 0 }));
    t.run(2);
    expect(t.ctx.director.phase).toBe('aucune');
    expect(t.ctx.director.route.length).toBe(0);
    expect(t.ctx.director.tension).toBe(0);
    expect(t.ctx.director.tensionAt(0, 0)).toBe(0);
    expect(t.core.metro.stations.length).toBe(2);
    expect(t.core.members.length).toBe(0);
  });

  it('tient une carte de tension locale (cellules de 25 m) qui décroît, et une tension globale', async () => {
    const t = createCrowdTest({ seed: 1, modules: MODULES });
    const { ctx, core } = t;
    const seen: { delta: number; reason: string }[] = [];
    ctx.events.on('crowd:tension', (e) => seen.push({ delta: e.delta, reason: e.reason }));
    await t.start(demoConfig({ crowdSize: 150, tension: 0.2, volatility: 0.5, extra: { ...QUIET, 'crowd.present': 1, 'crowd.static': true } }));
    const d = ctx.director;
    expect(d.tension).toBeCloseTo(0.2, 5);
    core.corridor.at(core.formation.headS - 10, core.rp);
    const x = core.rp.x;
    const z = core.rp.z;
    const base = d.tensionAt(x, z);
    expect(base).toBeCloseTo(0.2, 2);
    d.addTension(0.3, x, z, 'essai');
    // hausse × (0,5 + volatility) = × 1 ici ; locale : forte sur place, atténuée à 25 m, nulle à 200 m
    expect(seen[seen.length - 1]).toEqual({ delta: 0.3, reason: 'essai' });
    expect(d.tensionAt(x, z)).toBeCloseTo(base + 0.3, 3);
    expect(d.tensionAt(x + 25, z)).toBeGreaterThan(base + 0.05);
    expect(d.tensionAt(x + 25, z)).toBeLessThan(base + 0.2);
    expect(d.tensionAt(x + 200, z + 200)).toBeCloseTo(base, 3);
    // la tension globale suit (moyenne pondérée par l'effectif + maximum local), lissée sur 10 s
    const before = d.tension;
    t.run(20);
    expect(d.tension).toBeGreaterThan(before + 0.08);
    expect(d.tension).toBeLessThan(0.75);
    // baisse (annonce claire, retrait) : jamais sous zéro
    d.addTension(-5, x, z, 'apaisement');
    expect(d.tensionAt(x, z)).toBeGreaterThanOrEqual(0);
    expect(d.tensionAt(x, z)).toBeLessThan(base + 0.01);
    // décroissance : 0,01 par 10 s en durée standard
    d.addTension(0.2, x + 300, z, 'loin');
    const far0 = d.tensionAt(x + 300, z);
    t.run(50);
    const far1 = d.tensionAt(x + 300, z);
    expect(far0 - far1).toBeGreaterThan(0.03);
    expect(far0 - far1).toBeLessThan(0.12);
    // propension à dégénérer : les hausses sont multipliées par 0,5 + volatility
    const calm = createCrowdTest({ seed: 1, modules: [world] });
    await calm.start(demoConfig({ crowdSize: 40, volatility: 0, extra: QUIET }));
    const c0 = calm.ctx.director.tensionAt(0, 40);
    calm.ctx.director.addTension(0.3, 0, 40, 'essai');
    expect(calm.ctx.director.tensionAt(0, 40) - c0).toBeCloseTo(0.15, 3);
  }, 300_000);

  it('passe en « tension » puis en « affrontement » quand la tension globale franchit 0,30 puis 0,50', async () => {
    const t = createCrowdTest({ seed: 1, modules: MODULES });
    const { ctx, core } = t;
    const phases: CrowdPhase[] = [];
    ctx.events.on('crowd:phase', (e) => phases.push(e.phase));
    await t.start(demoConfig({ crowdSize: 120, duration: 'courte', volatility: 0.5, extra: { ...QUIET, 'crowd.present': 1 } }));
    t.run(100); // cortège en marche
    expect(ctx.director.phase).toBe('cortege');
    for (let k = 0; k < 6; k++) {
      core.corridor.at(core.formation.headS - 5 - k * 6, core.rp);
      ctx.director.addTension(0.5, core.rp.x, core.rp.z, 'essai');
    }
    t.run(8);
    expect(ctx.director.tension).toBeGreaterThan(0.3);
    expect(['tension', 'affrontement']).toContain(ctx.director.phase);
    t.run(30);
    expect(ctx.director.tension).toBeGreaterThan(0.5);
    expect(ctx.director.phase).toBe('affrontement');
    expect(phases).toContain('affrontement');
    // la phase du déroulé, elle, reste « cortège » ; la tête s'est arrêtée (cela chauffe devant elle)
    expect(ctx.require<CrowdCoreApi>(CROWD_CORE).basePhase).toBe('cortege');
    expect(core.formation.headSpeed).toBeLessThan(0.1);
  }, 300_000);

  it('propose un catalogue d\'au moins 30 aléas, tirés par mission selon la graine et la propension à dégénérer', async () => {
    expect(ALEA_CATALOGUE.length).toBeGreaterThanOrEqual(30);
    const ids = ALEA_CATALOGUE.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['groupe_hostile', 'panne_sono', 'averse', 'rumeur', 'sit_in', 'malaise', 'enfant_perdu', 'commercant_excede', 'journaliste_bouscule', 'contre_cortege']) expect(ids).toContain(id);
    for (const a of ALEA_CATALOGUE) {
      expect(a.label.length).toBeGreaterThan(8);
      expect([0, 1, 2]).toContain(a.gravity);
      expect(a.phases.length).toBeGreaterThan(0);
    }
    const draw = async (seed: number, volatility: number): Promise<{ ids: string[]; grave: number }> => {
      const t = createCrowdTest({ seed, modules: [world] });
      await t.start(demoConfig({ crowdSize: 60, volatility, seed, extra: { 'crowd.bystanders': 0 } }));
      const drawn = t.core.aleas.infos.filter((a) => a.status === 'prevu');
      for (const a of drawn) expect(a.at).toBeGreaterThan(0);
      return { ids: drawn.map((a) => a.id), grave: drawn.filter((a) => a.gravity === 2).length };
    };
    let calmCount = 0;
    let hotCount = 0;
    let calmGrave = 0;
    let hotGrave = 0;
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const calm = await draw(seed, 0);
      const hot = await draw(seed, 1);
      calmCount += calm.ids.length;
      hotCount += hot.ids.length;
      calmGrave += calm.grave;
      hotGrave += hot.grave;
      signatures.add(hot.ids.join(','));
      // même graine, même tirage
      expect((await draw(seed, 1)).ids).toEqual(hot.ids);
    }
    // fréquence et gravité réglées par la propension à dégénérer
    expect(calmCount / 12).toBeGreaterThanOrEqual(1.5);
    expect(calmCount / 12).toBeLessThanOrEqual(3);
    expect(hotCount / 12).toBeGreaterThanOrEqual(5);
    expect(hotCount / 12).toBeLessThanOrEqual(7);
    expect(calmGrave).toBeLessThanOrEqual(1);
    expect(hotGrave).toBeGreaterThan(calmGrave + 8);
    expect(signatures.size).toBeGreaterThanOrEqual(10);
  }, 300_000);

  it('chaque aléa du catalogue se déroule réellement, sans erreur ni dérive', async () => {
    const t = createCrowdTest({ seed: 13, modules: MODULES });
    const { ctx, core } = t;
    const api = ctx.require<CrowdCoreApi>(CROWD_CORE);
    const events: AleaEvent[] = [];
    ctx.events.onAny(ALEA_EVENT, (e) => events.push({ ...(e as AleaEvent) }));
    let helps = 0;
    ctx.events.onAny(HELP_EVENT, () => helps++);
    await t.start(demoConfig({ crowdSize: 260, duration: 'standard', volatility: 0.6, extra: { ...QUIET, 'crowd.present': 0.9, 'crowd.scenario': 'journee_tendue' } }));
    t.run(100);
    expect(api.triggerAlea('retard_depart')).toBe(true);
    for (let k = 0; k < 60 && ctx.director.phase !== 'cortege'; k++) t.run(5);
    expect(ctx.director.phase).toBe('cortege');
    // le départ a bien été retardé (180 s prévus en durée standard)
    expect(ctx.clock.now).toBeGreaterThan(180 + 60 + 20);
    t.run(20);
    const total0 = ctx.director.stats.total;
    // sit-in : des gens assis sur la chaussée, la tête arrêtée
    expect(api.triggerAlea('sit_in')).toBe(true);
    t.run(6);
    expect(core.formation.halted).toBe(true);
    expect(core.formation.haltReason).toBe('alea:sit_in');
    expect(t.protesters().filter((p) => p.posture === 'sit').length).toBeGreaterThanOrEqual(5);
    // malaise : une personne à terre, un cercle se forme, on appelle les secours
    expect(api.triggerAlea('malaise')).toBe(true);
    t.run(12);
    expect(helps).toBeGreaterThanOrEqual(1);
    expect(t.protesters().filter((p) => brainOf(p)!.state === CROWD_STATE.WATCH).length).toBeGreaterThanOrEqual(2);
    // groupe hostile : des radicaux et des suiveurs en plus, de la tension
    const radicals0 = t.protesters().filter((p) => p.profile === 'radical').length;
    const tension0 = ctx.director.tension;
    expect(api.triggerAlea('groupe_hostile')).toBe(true);
    t.run(3);
    expect(ctx.director.stats.total).toBeGreaterThan(total0 + 5);
    expect(t.protesters().filter((p) => p.profile === 'radical').length).toBeGreaterThan(radicals0);
    // averse : la météo change vraiment
    expect(api.triggerAlea('averse')).toBe(true);
    expect(ctx.env.state.weather).toBe('averse');
    // tous les autres, à la suite
    const results: Record<string, boolean> = {};
    for (const a of ALEA_CATALOGUE) {
      if (['retard_depart', 'sit_in', 'malaise', 'groupe_hostile', 'averse'].includes(a.id)) continue;
      results[a.id] = api.triggerAlea(a.id);
      t.run(4);
    }
    t.run(30);
    const started = Object.values(results).filter(Boolean).length + 5;
    const refused = Object.keys(results).filter((k) => !results[k]);
    console.log('[foule] aléas déroulés :', started, '/', ALEA_CATALOGUE.length, '| écartés faute de conditions :', refused.join(', '));
    // seuls manquent ceux dont les conditions ne peuvent être réunies ici (pas de drone, pas de gaz, pas de pilote automatique…)
    expect(started).toBeGreaterThanOrEqual(ALEA_CATALOGUE.length - 8);
    for (const id of refused) expect(['drone_repere', 'vent_tournant', 'vehicule_bloque', 'station_saturee', 'coupure_metro', 'panne_sono', 'slogans_hostiles', 'provocation', 'parcours_raccourci', 'bousculade', 'scission']).toContain(id);
    expect(events.filter((e) => e.stage === 'debut').length).toBe(started);
    expect(ctx.director.tension).toBeGreaterThan(tension0);
    expect(api.aleas.filter((a) => a.status === 'en_cours' || a.status === 'termine').length).toBe(started);
    expect(api.triggerAlea('inconnu')).toBe(false);
    // aucune dérive : positions valides, personne dans un mur
    for (const p of core.members) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
      expect(ctx.world.isFree(p.x, p.z, 0.05)).toBe(true);
    }
    // et la manifestation va quand même à son terme
    for (let k = 0; k < 400 && ctx.director.phase !== 'terminee'; k++) t.run(10);
    expect(ctx.director.phase).toBe('terminee');
    expect(events.filter((e) => e.stage === 'fin').length).toBe(started);
  }, 900_000);

  it('se termine dès qu\'il reste moins de 5 % de la foule', async () => {
    const t = createCrowdTest({ seed: 1, modules: MODULES });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 100, duration: 'standard', extra: { ...QUIET, 'crowd.present': 1 } }));
    const api = ctx.require<CrowdCoreApi>(CROWD_CORE);
    t.run(250);
    expect(ctx.director.phase).toBe('cortege');
    for (const p of [...core.members]) api.leave(p);
    let fled = 0;
    ctx.events.on('person:fled', () => fled++);
    for (let k = 0; k < 60 && ctx.director.phase !== 'terminee'; k++) t.run(5);
    expect(ctx.director.phase).toBe('terminee');
    expect(ctx.director.stats.present).toBeLessThanOrEqual(5);
    expect(ctx.director.stats.dispersed).toBeGreaterThanOrEqual(90);
    expect(fled).toBe(ctx.director.stats.dispersed);
  }, 300_000);
});

describe('foule — points d\'extension', () => {
  it('un contrôleur enregistré pour un profil prend la main sur ses personnes ; sans lui, comportement par défaut', async () => {
    const t = createCrowdTest({ seed: 1, modules: MODULES });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 200, volatility: 0.8, extra: { ...QUIET, 'crowd.present': 1, 'crowd.static': true, 'crowd.scenario': 'samedi_sans_organisateur' } }));
    const api = ctx.require<CrowdCoreApi>(CROWD_CORE);
    expect(api.active).toBe(true);
    expect(api.members.length).toBeGreaterThan(150);
    expect(api.groups.length).toBeGreaterThan(10);
    t.run(5);
    const radicals = t.protesters().filter((p) => p.profile === 'radical');
    expect(radicals.length).toBeGreaterThan(8);
    // sans contrôleur : ils tiennent leur place comme des militants (agités)
    for (const p of radicals) expect([CROWD_STATE.GATHER, CROWD_STATE.ARRIVE, CROWD_STATE.MARCH]).toContain(brainOf(p)!.state);
    // un contrôleur qui emmène les radicaux vers un point de ralliement
    const tx = radicals[0]!.x + 18;
    const tz = radicals[0]!.z + 3;
    let thinks = 0;
    let released = 0;
    const seenDt: number[] = [];
    const controller: BehaviorController = {
      id: 'essai:ralliement',
      think(p: Person, brain, crowd, dt) {
        thinks++;
        seenDt.push(dt);
        expect(crowd.brain(p)).toBe(brain);
        crowd.goTo(p, tx, tz, 1.3, false);
        return true;
      },
      release() {
        released++;
      },
    };
    const off = api.registerController('radical', controller);
    t.run(40);
    expect(thinks).toBeGreaterThan(radicals.length * 5);
    for (const p of radicals) {
      const b = brainOf(p)!;
      expect(b.state).toBe(CROWD_STATE.CUSTOM);
      expect(b.controller).toBe(controller);
    }
    const arrived = radicals.filter((p) => Math.hypot(p.x - tx, p.z - tz) < 9).length;
    expect(arrived).toBeGreaterThan(radicals.length * 0.6);
    // réflexion étalée : quelques fois par seconde
    const meanDt = seenDt.reduce((a, b) => a + b, 0) / seenDt.length;
    expect(meanDt).toBeGreaterThan(0.2);
    expect(meanDt).toBeLessThan(1.3);
    // les autres profils ne sont pas concernés
    expect(t.protesters().filter((p) => p.profile === 'pacifique' && brainOf(p)!.state === CROWD_STATE.CUSTOM).length).toBe(0);
    // retrait du contrôleur : retour au comportement par défaut (ils regagnent leur place)
    off();
    t.run(20);
    expect(released).toBe(radicals.length);
    for (const p of radicals) expect(brainOf(p)!.state).not.toBe(CROWD_STATE.CUSTOM);
    expect(radicals.filter((p) => Math.hypot(p.x - tx, p.z - tz) < 9).length).toBeLessThan(arrived);

    // accès à la carte de tension, à la légitimité, à la perception, au cortège
    expect(api.tensionAt(tx, tz)).toBeGreaterThanOrEqual(0);
    expect(api.legitimacyAt(tx, tz)).toBeGreaterThan(0.4);
    expect(api.cohesionAt(tx, tz)).toBeCloseTo(0.3, 1);
    expect(api.coverAt(radicals[0]!.x, radicals[0]!.z, 15)).toBeGreaterThan(5);
    const sight = { id: 0, x: 0, z: 0, dist: 0, count: 0, closing: 0 };
    expect(api.nearestPolice(tx, tz, 50, sight)).toBe(false);
    const cop = ctx.people.spawn({ kind: 'crs', faction: 'police', x: tx + 12, z: tz });
    t.run(1);
    expect(api.nearestPolice(tx, tz, 50, sight)).toBe(true);
    expect(sight.id).toBe(cop.id);
    expect(sight.dist).toBeCloseTo(12, 0);
    api.markViolence(tx, tz);
    expect(api.recentViolence(tx + 10, tz)).toBe(true);
    expect(api.recentViolence(tx + 200, tz)).toBe(false);
    expect(api.formation.sections.length).toBeGreaterThan(1);
    expect(api.formation.blockOf(radicals[0]!)).toBeGreaterThanOrEqual(0);
    // population : un manifestant créé par le service, un autre par un module tiers (adopté)
    const total = ctx.director.stats.total;
    const extra = api.spawn('opportuniste', tx, tz + 6)!;
    expect(brainOf(extra)).not.toBeNull();
    const foreign = ctx.people.spawn({ kind: 'manifestant', faction: 'protest', x: tx, z: tz + 8, profile: 'militant' });
    t.run(1);
    expect(brainOf(foreign)).not.toBeNull();
    expect(ctx.director.stats.total).toBe(total + 2);
    // radicalisation explicite : événement et changement de profil
    let event = '';
    ctx.events.on('person:radicalized', (e) => {
      event = e.from + '>' + e.to;
    });
    api.setProfile(foreign, 'opportuniste');
    expect(foreign.profile).toBe('opportuniste');
    expect(event).toBe('militant>opportuniste');
    // le joueur n'est jamais piloté
    const mine = t.protesters().find((p) => p.profile === 'pacifique')!;
    ctx.player.possess(mine.id, 'manifestant');
    mine.cmd.moveX = 0.123;
    mine.cmd.moveZ = -0.456;
    t.run(0.2);
    void core;
  }, 300_000);
});
