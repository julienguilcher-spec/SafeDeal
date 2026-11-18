import { describe, expect, it } from 'vitest';
import type { GameContext, Person, PlayableRole, PoliceRank, Squad } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { COMMAND_SERVICE, createSystems as commandSystems } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { verbOf } from '@/ui/command/orders';
import { proposeWho, wholeCandidate, whoEnvFromCore } from '@/ui/command/bestUnit';
import { buildCard } from '@/ui/command/intents';
import { cardEnvFromCore, collectReperes, pointRepere } from '@/ui/command/reperes';
import { mapKey } from '@/ui/command/tacticalKeys';
import { computeScope } from '@/ui/command/scope';
import { MAP2D_SERVICE, MAPS_SERVICE, createSystems as mapsSystems } from '@/ui/maps';
import type { MapsRuntime } from '@/ui/maps';
import { createShown, visibleUnits } from '@/ui/maps/overlay-units';
import { UnitModel, unitCode } from '@/ui/maps/units';
import { incidentVisible, isPoliceRole, visibilityFor } from '@/ui/maps/visibility';

interface Scene {
  ctx: GameContext;
  company: Squad;
  section: Squad;
  groupA: Squad;
  groupB: Squad;
  commandant: Person;
  major: Person;
  chefA: Person;
  gardien: Person;
  commissaire: Person;
  journaliste: Person;
  manifestant: Person;
}

function agent(ctx: GameContext, squad: Squad, x: number, z: number, rank: PoliceRank, poste: Person['poste']): Person {
  return ctx.people.spawn({ kind: 'crs', faction: 'police', x, z, rank, poste, squadId: squad.id });
}

/** Une compagnie réduite : PC, une section, deux groupes ; une autorité civile ; des civils. */
async function scene(): Promise<Scene> {
  const t = createTestContext({ modules: [mapsSystems, commandSystems] });
  await t.start();
  const ctx = t.ctx;
  const company = ctx.squads.create('compagnie', 'police', 'MISTRAL');
  const commandant = agent(ctx, company, 0, 0, 'commandant', 'commandant_unite');
  const section = ctx.squads.create('section', 'police', 'MISTRAL 1', company.id);
  const major = agent(ctx, section, 100, 0, 'major', 'chef_section');
  const groupA = ctx.squads.create('groupe', 'police', 'MISTRAL 1 ALFA', section.id);
  const chefA = agent(ctx, groupA, 100, 10, 'brigadier_chef', 'chef_groupe');
  const gardien = agent(ctx, groupA, 101, 10, 'gardien', 'bouclier');
  agent(ctx, groupA, 102, 10, 'gardien', 'bouclier');
  const groupB = ctx.squads.create('groupe', 'police', 'MISTRAL 1 BRAVO', section.id);
  agent(ctx, groupB, 140, 10, 'brigadier_chef', 'chef_groupe');
  agent(ctx, groupB, 141, 10, 'gardien', 'lbd');
  const authority = ctx.squads.create('binome', 'police', 'AUTORITÉ 2');
  const commissaire = ctx.people.spawn({ kind: 'commissaire', faction: 'police', x: 5, z: 5, rank: 'commissaire', poste: 'autorite_civile', squadId: authority.id });
  const journaliste = ctx.people.spawn({ kind: 'journaliste', faction: 'press', x: 50, z: 50 });
  const manifestant = ctx.people.spawn({ kind: 'manifestant', faction: 'protest', x: 60, z: 50 });
  ctx.squads.create('cortege', 'protest', 'Cortège');
  return { ctx, company, section, groupA, groupB, commandant, major, chefA, gardien, commissaire, journaliste, manifestant };
}

function as(s: Scene, p: Person, role: PlayableRole): ReturnType<typeof computeScope> {
  s.ctx.player.possess(p.id, role);
  return computeScope(s.ctx);
}

describe('commandement — étendue selon le rôle et le grade', () => {
  it('commandant : tout le dispositif des forces de l\'ordre, pas le cortège', async () => {
    const s = await scene();
    const sc = as(s, s.commandant, 'commandant');
    expect(sc.level).toBe('tout');
    expect([...sc.squadIds].sort()).toEqual(s.ctx.squads.list.filter((q) => q.faction === 'police').map((q) => q.id).sort());
    expect(sc.squadIds.size).toBe(5);
    expect(sc.ownSquadId).toBe(s.company.id);
    expect(sc.canAuthorize && sc.canTraffic && sc.canMetro && sc.canDelegate).toBe(true);
  });

  it('commissaire : tout, et les sommations (autorité habilitée)', async () => {
    const s = await scene();
    const sc = as(s, s.commissaire, 'commissaire');
    expect(sc.level).toBe('tout');
    expect(sc.canSommation).toBe(true);
    expect(sc.canAuthorize).toBe(true);
  });

  it('chef de groupe : son groupe seulement', async () => {
    const s = await scene();
    const sc = as(s, s.chefA, 'chef_groupe');
    expect(sc.level).toBe('unite');
    expect([...sc.squadIds]).toEqual([s.groupA.id]);
    expect(sc.ownSquadId).toBe(s.groupA.id);
    expect(sc.canAuthorize).toBe(false);
    expect(sc.canSommation).toBe(false);
    expect(sc.canMetro).toBe(false);
    expect(sc.canTraffic).toBe(true);
  });

  it('chef de section : sa section et ses groupes', async () => {
    const s = await scene();
    const sc = as(s, s.major, 'chef_groupe');
    expect(sc.level).toBe('unite');
    expect([...sc.squadIds].sort()).toEqual([s.section.id, s.groupA.id, s.groupB.id].sort());
    expect(sc.ownSquadId).toBe(s.section.id);
  });

  it('simple CRS : lecture seule ; un gradé à la tête de son groupe le commande', async () => {
    const s = await scene();
    const sc = as(s, s.gardien, 'crs');
    expect(sc.level).toBe('lecture');
    expect(sc.squadIds.size).toBe(0);
    expect(sc.ownSquadId).toBe(s.groupA.id);
    expect(sc.canDelegate || sc.canTraffic || sc.canAuthorize).toBe(false);
    const graded = as(s, s.chefA, 'crs');
    expect(graded.level).toBe('unite');
    expect([...graded.squadIds]).toEqual([s.groupA.id]);
  });

  it('équipage de patrouille, chef de bord brigadier-chef compris : carte en lecture seule, « Suivez-moi » permis', async () => {
    // fusion modes × refonte : le chef de bord d'une BAC se voyait proposer d'envoyer « en véhicules » son propre
    // équipage, assis avec lui dans la voiture, barrer une rue ou disperser une foule
    const s = await scene();
    const crew = s.ctx.squads.create('equipage', 'police', 'BAC 75N');
    const chef = agent(s.ctx, crew, 300, 300, 'brigadier_chef', 'interpellation');
    agent(s.ctx, crew, 301, 300, 'gardien', 'conducteur');
    crew.leaderId = chef.id;
    const sc = as(s, chef, 'patrouille');
    expect(sc.level).toBe('lecture');
    expect(sc.squadIds.size).toBe(0);
    expect(sc.ownSquadId).toBe(crew.id);
    const core = s.ctx.require<CommandCore>(COMMAND_SERVICE);
    expect(core.followUnit()?.id).toBe(crew.id);
    expect(core.check(verbOf('suivre_pied')!).ok).toBe(true);
    expect(core.check(verbOf('ligne')!).ok).toBe(false);
  });

  it('journaliste et manifestant : lecture seule, aucune prérogative', async () => {
    const s = await scene();
    for (const [p, role] of [[s.journaliste, 'journaliste'], [s.manifestant, 'manifestant']] as const) {
      const sc = as(s, p, role);
      expect(sc.level).toBe('lecture');
      expect(sc.squadIds.size).toBe(0);
      expect(sc.canSommation || sc.canAuthorize || sc.canDelegate || sc.canTraffic || sc.canMetro).toBe(false);
      expect(sc.label).toMatch(/lecture seule/);
    }
  });
});

describe('cartes — ce que chaque rôle peut voir', () => {
  it('un manifestant ou un journaliste ne voit jamais les positions de police', async () => {
    const s = await scene();
    const model = new UnitModel();
    for (const role of ['manifestant', 'journaliste', 'street_medic'] as const) {
      const vis = visibilityFor(role);
      expect(vis.police).toBe(false);
      expect(isPoliceRole(role)).toBe(false);
      expect(model.refresh(s.ctx, vis).length).toBe(0);
      expect(vis.radio).not.toContain('commandement');
      expect(vis.radio).not.toContain('unite');
      expect(vis.crowd).toBe('near');
    }
    expect(visibilityFor('manifestant').incidents).toBe('none');
    expect(visibilityFor('manifestant').closures).toBe(false);
    expect(visibilityFor('journaliste').route && visibilityFor('journaliste').metro).toBe(true);
  });

  it('les forces de l\'ordre voient le dispositif et toute la foule, jusqu\'au simple CRS', async () => {
    const s = await scene();
    const model = new UnitModel();
    for (const role of ['crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'telepilote'] as const) {
      const vis = visibilityFor(role);
      expect(vis.police && vis.crowd === 'full' && vis.incidents === 'all').toBe(true);
      expect(isPoliceRole(role)).toBe(true);
      expect(model.refresh(s.ctx, vis).length).toBe(5);
    }
  });

  it('incidents : les secours ne voient que ce qui les concerne, un civil que ce qui est près de lui', () => {
    const rescue = visibilityFor('secouriste');
    expect(incidentVisible(rescue, 'feu_vehicule', 900)).toBe(true);
    expect(incidentVisible(rescue, 'blesse', 900)).toBe(true);
    expect(incidentVisible(rescue, 'suspect', 10)).toBe(false);
    const press = visibilityFor('journaliste');
    expect(incidentVisible(press, 'feu_poubelle', 80)).toBe(true);
    expect(incidentVisible(press, 'feu_poubelle', 400)).toBe(false);
    expect(incidentVisible(press, 'agent_isole', 20)).toBe(false);
    expect(incidentVisible(visibilityFor('manifestant'), 'feu_poubelle', 5)).toBe(false);
    expect(incidentVisible(visibilityFor('commandant'), 'suspect', 5000)).toBe(true);
  });

  it('arborescence : compagnie → section → groupes, effectifs cumulés, blessés décomptés', async () => {
    const s = await scene();
    s.gardien.injury = 'serious';
    const units = new UnitModel().refresh(s.ctx, visibilityFor('commandant'));
    const byName = new Map(units.map((u) => [u.name, u]));
    const company = byName.get('MISTRAL')!;
    const section = byName.get('MISTRAL 1')!;
    const a = byName.get('MISTRAL 1 ALFA')!;
    expect(units.indexOf(company)).toBeLessThan(units.indexOf(section));
    expect(units.indexOf(section)).toBeLessThan(units.indexOf(a));
    expect([company.depth, section.depth, a.depth]).toEqual([0, 1, 2]);
    expect(a.parentKey).toBe(section.key);
    expect([a.total, a.valid, a.injured]).toEqual([3, 2, 1]);
    expect([section.total, section.valid, section.injured]).toEqual([6, 5, 1]);
    expect(company.total).toBe(7);
    expect(company.symbol).toBe('compagnie');
    expect(section.symbol).toBe('section');
    expect(a.symbol).toBe('groupe');
    expect(a.code).toBe('1A');
    // le poste de commandement se situe là où se tient le commandant
    expect([company.x, company.z]).toEqual([0, 0]);
  });

  it('code court des indicatifs', () => {
    expect(unitCode('MISTRAL 2 ALFA')).toBe('2A');
    expect(unitCode('MISTRAL 4 CHARLIE')).toBe('4C');
    expect(unitCode('MISTRAL 2')).toBe('M2');
    expect(unitCode('MISTRAL')).toBe('MIS');
    expect(unitCode('NEPTUNE 1')).toBe('N1');
    expect(unitCode('ICARE')).toBe('ICA');
    expect(unitCode('')).toBe('');
  });

  it('symboles : des groupes trop serrés à l\'écran se fondent dans leur section', async () => {
    const s = await scene();
    const maps = s.ctx.require<MapsRuntime>(MAPS_SERVICE);
    s.ctx.player.possess(s.commandant.id, 'commandant');
    maps.scene.invalidate();
    maps.scene.ensureFresh();
    const shown = createShown();
    // groupes à 40 m l'un de l'autre : distincts à 0,5 m/px (80 px), fondus à 4 m/px (10 px)
    const near = visibleUnits(maps.scene, 0.5, false, shown).units.map((u) => u.name);
    expect(near).toContain('MISTRAL 1 ALFA');
    expect(near).toContain('MISTRAL 1 BRAVO');
    expect(near).not.toContain('MISTRAL 1');
    expect(near).toContain('MISTRAL'); // poste de commandement
    const far = visibleUnits(maps.scene, 4, false, shown).units.map((u) => u.name);
    expect(far).toContain('MISTRAL 1');
    expect(far).not.toContain('MISTRAL 1 ALFA');
  });
});

describe('commandement — émission des ordres (sans interface)', () => {
  it('les modules démarrent sans DOM et publient leurs services', async () => {
    const s = await scene();
    expect(s.ctx.service(MAPS_SERVICE)).toBeDefined();
    expect(s.ctx.service(COMMAND_SERVICE)).toBeDefined();
    expect(s.ctx.service(EXT.uiKit)).toBeUndefined();
    expect(s.ctx.service(MAP2D_SERVICE)).toBeUndefined(); // le fond de repli n'est publié que dans un navigateur
  });

  it('un ordre part par ctx.squads.issue avec point, cap, largeur, force et signature', async () => {
    const s = await scene();
    const core = s.ctx.require<CommandCore>(COMMAND_SERVICE);
    s.ctx.player.possess(s.commandant.id, 'commandant');
    core.invalidateScope();
    const before = s.ctx.radio.log.length;
    const res = core.issue('ligne', [s.section], [{ x: 200, z: -30, heading: Math.PI, width: 24 }]);
    expect(res).toEqual({ ok: true, reason: '', count: 1 });
    const o = s.section.order;
    expect([o.type, o.x, o.z, o.heading, o.width]).toEqual(['ligne', 200, -30, Math.PI, 24]);
    expect(o.issuedBy).toBe(s.commandant.id);
    expect(o.maxForce).toBe(s.ctx.law.roe.authorizedForce);
    expect(core.issued.length).toBe(1);
    expect(core.issued[0]!.squadId).toBe(s.section.id);
    const msg = s.ctx.radio.log[before]!;
    expect(msg.channel).toBe('commandement');
    expect(msg.text).toMatch(/^MISTRAL 1 ICI MISTRAL\. Ligne de barrage/);
    expect(msg.text).toMatch(/face nord, front DEUX-QUATRE mètres\. PARLEZ\.$/);
  });

  it('un ordre de force au-dessus du niveau autorisé est refusé ; autorisé, il part avec un avertissement', async () => {
    const s = await scene();
    const core = s.ctx.require<CommandCore>(COMMAND_SERVICE);
    s.ctx.player.possess(s.commandant.id, 'commandant');
    core.invalidateScope();
    const refused = core.issue('disperser_gaz', [s.groupA], [{ x: 10, z: 10, heading: 0, width: 0 }]);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/gaz lacrymogène/);
    expect(refused.reason).not.toMatch(/niveau \d|\d\./);
    expect(s.groupA.order.type).toBe('libre');
    expect(core.authorize(3)).toBe(true);
    expect(s.ctx.law.roe.authorizedForce).toBe(3);
    const ok = core.issue('disperser_gaz', [s.groupA], [{ x: 10, z: 10, heading: 0, width: 0 }]);
    expect(ok.ok).toBe(true);
    expect(s.groupA.order.type).toBe('disperser_gaz');
    expect(s.groupA.order.maxForce).toBe(3);
    expect(core.check(verbOf('disperser_gaz')!).warning).toMatch(/dernière sommation/);
    // le plafond personnel du joueur borne la force transmise
    core.orderForce = 1;
    core.issue('tenir', [s.groupA], null);
    expect(s.groupA.order.maxForce).toBe(1);
  });

  it('un chef de groupe ne commande que son groupe et ne fixe pas la force', async () => {
    const s = await scene();
    const core = s.ctx.require<CommandCore>(COMMAND_SERVICE);
    s.ctx.player.possess(s.chefA.id, 'chef_groupe');
    core.invalidateScope();
    const other = core.issue('tenir', [s.groupB], null);
    expect(other.ok).toBe(false);
    expect(s.groupB.order.type).toBe('libre');
    const mixed = core.issue('tenir', [s.groupB, s.groupA], null);
    expect(mixed).toMatchObject({ ok: true, count: 1 });
    expect(s.groupA.order.type).toBe('tenir');
    expect(s.groupB.order.type).toBe('libre');
    expect(core.authorize(4)).toBe(false);
    expect(s.ctx.law.roe.authorizedForce).toBe(1);
    expect(core.callsign()).toBe('MISTRAL 1 ALFA');
  });

  it('un simple CRS ne donne aucun ordre', async () => {
    const s = await scene();
    const core = s.ctx.require<CommandCore>(COMMAND_SERVICE);
    s.ctx.player.possess(s.gardien.id, 'crs');
    core.invalidateScope();
    const res = core.issue('tenir', [s.groupA], null);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Lecture seule/);
    expect(s.groupA.order.type).toBe('libre');
  });
});

describe('carte de commandement selon le rôle (fiches, Qui, touches)', () => {
  it('simple CRS : lecture seule — aucune ligne ni « Autres ordres » sur aucun repère, aucune intention au clavier', async () => {
    const s = await scene();
    s.ctx.player.possess(s.gardien.id, 'crs');
    const core = s.ctx.service<CommandCore>(COMMAND_SERVICE)!;
    core.invalidateScope();
    expect(core.scope().level).toBe('lecture');
    const env = cardEnvFromCore(core);
    expect(env.level).toBe('lecture');
    const reperes = collectReperes(env);
    expect(reperes.length).toBeGreaterThan(0);
    for (const r of [...reperes, pointRepere(120, 30, env)]) {
      const card = buildCard(r, env, null);
      expect(card.lines, r.kind).toEqual([]);
      expect(card.others, r.kind).toEqual([]);
    }
    for (const code of ['KeyE', 'KeyB', 'KeyN', 'KeyD', 'KeyI', 'KeyS', 'KeyL', 'KeyO', 'KeyU', 'KeyT', 'Enter', 'Digit1', 'Space']) {
      expect(mapKey(code, false, { level: 'lecture', card: false }).kind, code).toBe('none');
    }
    // il garde : C (commissariats), G (moi), H (aide)
    expect(mapKey('KeyG', false, { level: 'lecture', card: false }).kind).toBe('me');
    expect(mapKey('KeyH', false, { level: 'lecture', card: false }).kind).toBe('help');
  });

  it('chef de groupe : Qui ne propose que son groupe ; T = « Tout le groupe »', async () => {
    const s = await scene();
    s.ctx.player.possess(s.chefA.id, 'chef_groupe');
    const core = s.ctx.service<CommandCore>(COMMAND_SERVICE)!;
    core.invalidateScope();
    const env = cardEnvFromCore(core);
    const mine = env.units.filter((u) => u.mine).map((u) => u.squadId);
    expect(mine).toEqual([s.groupA.id]);
    const who = whoEnvFromCore(core, env, []);
    const r = pointRepere(160, 40, env);
    const card = buildCard(r, env, 'envoyer');
    expect(card.lines.length).toBeGreaterThan(0);
    for (const line of card.lines) {
      for (const c of proposeWho(line, r, who)) for (const id of c.squadIds) expect([s.groupA.id], line.label).toContain(id);
    }
    expect(wholeCandidate(r, who)!.label).toBe('Tout le groupe');
    expect(wholeCandidate(r, who)!.squadIds).toEqual([s.groupA.id]);
  });
});
