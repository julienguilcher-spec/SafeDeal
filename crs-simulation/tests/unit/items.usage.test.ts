// Matériel — usage des objets par catégorie : mêlée, jets, mégaphone, interactions, prise de vue,
// bascules, port passif, drone ; déclarations au droit (emploi de la force, infractions).
import { describe, expect, it } from 'vitest';
import type { GameContext, InteractionHandler, InteractionOption, Person } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import { createSystems, DRONE_TOGGLE_EVENT, ITEMS_SERVICE, ITEM_TOGGLE_EVENT, LAUNCHER_RANGE_EVENT } from '@/sim/items';
import type { ItemsApi } from '@/sim/items';
import { aimAt, createHazardRecorder, createPropRecorder, face, record, spawn } from '@/sim/items/testkit';
import type { HazardRecorder } from '@/sim/items/testkit';

async function setup(seed = 9): Promise<{ t: TestContext; ctx: GameContext; hz: HazardRecorder; items: ItemsApi }> {
  const t = createTestContext({ seed, modules: [createSystems] });
  await t.start();
  const ctx = t.ctx;
  const hz = createHazardRecorder(ctx);
  ctx.hazards = hz.api;
  const items = ctx.require<ItemsApi>(ITEMS_SERVICE);
  items.tuning.dispersion = 0;
  return { t, ctx, hz, items };
}

function arm(t: TestContext, p: Person, id: string, count?: number): void {
  t.ctx.actions.give(p, id, count);
  t.ctx.actions.selectById(p, id);
  t.step(1.5);
}

describe('mêlée', () => {
  it('marteau : étoile puis brise une vitrine (service de décor factice)', async () => {
    const { t, ctx } = await setup();
    const props = createPropRecorder(ctx);
    ctx.props = props.api;
    const windows = record(ctx, 'shop:window');
    const fx = record(ctx, 'fx');
    const shop = props.addShop({ category: 'luxe', x: 0, z: 1, heading: Math.PI, width: 5 });
    const casseur = spawn(ctx, 'manifestant', 0.4, 0.2);
    arm(t, casseur, 'marteau');
    face(casseur, 0);
    // premier coup : le geste est armé, l'impact vient ≈ 0,28 s plus tard
    expect(ctx.actions.use(casseur).ok).toBe(true);
    expect(casseur.upper).toBe('hammer');
    expect(props.shopDamage.length).toBe(0);
    t.step(0.2);
    expect(props.shopDamage.length).toBe(0);
    t.step(0.15);
    expect(props.shopDamage).toEqual([{ shopId: shop.id, amount: 12, kind: 'blunt', byId: casseur.id }]);
    expect(shop.window).toBe('cracked');
    // cadence : un coup toutes les 0,9 s
    expect(ctx.actions.use(casseur).reason).toBe('cooldown');
    t.step(0.6);
    expect(ctx.actions.use(casseur).ok).toBe(true);
    t.step(0.4);
    expect(shop.window).toBe('broken');
    expect(windows.map((w) => w.state)).toEqual(['cracked', 'broken']);
    expect(windows.every((w) => w.byId === casseur.id)).toBe(true);
    expect(fx.some((f) => f.id === 'eclats_verre')).toBe(true);
    expect(casseur.offenses.map((o) => o.type)).toEqual(['degradation', 'degradation']);
    // dos à la vitrine : le coup ne la touche pas
    face(casseur, Math.PI);
    t.step(1);
    ctx.actions.use(casseur);
    t.step(0.4);
    expect(props.shopDamage.length).toBe(2);
    // un bâton de police n'entame pas une vitrine
    const crs = spawn(ctx, 'crs', -1.5, 0.2);
    arm(t, crs, 'tonfa');
    face(crs, 0);
    ctx.actions.use(crs);
    t.step(0.4);
    expect(props.shopDamage.length).toBe(3);
    expect(props.shopDamage[2]!.amount).toBeLessThan(10);
    expect(crs.offenses.length).toBe(0);
  });

  it('bâton : frappe l\'adversaire dans l\'arc devant soi, jamais un collègue, et déclare l\'emploi de la force', async () => {
    const { t, ctx } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const sfx = record(ctx, 'sfx');
    const crs = spawn(ctx, 'crs', 0, 0);
    arm(t, crs, 'tonfa');
    const colleague = spawn(ctx, 'crs', 0.4, 0.7);
    const target = spawn(ctx, 'manifestant', -0.2, 1.1);
    const behind = spawn(ctx, 'manifestant', 0, -1);
    const tooFar = spawn(ctx, 'manifestant', 0, 2.4);
    ctx.people.rebuildIndex();
    face(crs, 0, 0);
    expect(ctx.actions.use(crs).ok).toBe(true);
    expect(crs.upper).toBe('strike');
    expect(hurts.length).toBe(0); // pas encore l'impact
    t.step(0.35);
    expect(hurts.length).toBe(1);
    expect(hurts[0]!.id).toBe(target.id);
    const info = hurts[0]!.info;
    expect(info).toMatchObject({ kind: 'blunt', sourceId: crs.id, item: 'tonfa', means: 'baton' });
    expect(info.amount).toBeGreaterThan(10);
    expect(info.amount).toBeLessThan(20);
    expect(info.zone).toBeGreaterThan(0.45); // visée horizontale : le buste, pas la tête
    expect(info.zone).toBeLessThan(0.8);
    expect(info.dirZ).toBeGreaterThan(0.9);
    expect(colleague.health).toBe(100);
    expect(behind.health).toBe(100);
    expect(tooFar.health).toBe(100);
    expect(ctx.law.forceLog.length).toBe(1);
    expect(ctx.law.forceLog[0]).toMatchObject({ byId: crs.id, means: 'baton', targetId: target.id });
    expect(sfx.some((s) => s.id === 'coup_baton')).toBe(true);
    expect(crs.stamina).toBeLessThan(100);
    // viser haut : la tête (ce que le droit sanctionnera)
    t.step(1);
    face(crs, 0, 0.4);
    ctx.actions.use(crs);
    t.step(0.35);
    expect(hurts[1]!.info.zone).toBeGreaterThan(0.86);
    // coup dans le vide : rien n'est déclaré
    t.step(1);
    face(crs, Math.PI / 2, 0);
    ctx.actions.use(crs);
    t.step(0.35);
    expect(hurts.length).toBe(2);
    expect(ctx.law.forceLog.length).toBe(2);
    // la pose de frappe a laissé place au repos
    t.step(0.5);
    expect(crs.upper).toBe('none');
  });

  it('un bouclier levé pare les coups de face ; le coup de bouclier repousse', async () => {
    const { t, ctx } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const sfx = record(ctx, 'sfx');
    const crs = spawn(ctx, 'crs', 0, 0, 0, ['bouclier']);
    ctx.actions.selectById(crs, 'bouclier');
    const attacker = spawn(ctx, 'manifestant', 0, 1.2, Math.PI);
    arm(t, attacker, 'barre');
    ctx.people.rebuildIndex();
    face(attacker, Math.PI, 0);
    ctx.actions.setAlt(crs, true);
    const shield = ctx.actions.activeItem(crs)!;
    ctx.actions.use(attacker);
    t.step(0.4);
    expect(hurts.length).toBe(0);
    expect(crs.health).toBe(100);
    expect(shield.state).toBeLessThan(1);
    expect(sfx.some((s) => s.id === 'impact_bouclier')).toBe(true);
    expect(attacker.offenses.map((o) => o.type)).toEqual(['violence_agent']);
    // bouclier baissé : le coup de barre porte
    ctx.actions.setAlt(crs, false);
    t.step(1);
    ctx.actions.use(attacker);
    t.step(0.4);
    expect(hurts.length).toBe(1);
    expect(hurts[0]!.id).toBe(crs.id);
    expect(hurts[0]!.info.amount).toBeGreaterThan(20);
    expect(hurts[0]!.info.means).toBeUndefined();
    // coup de bouclier : peu de dégâts, fort recul, moyen « contact »
    crs.stun = 0;
    ctx.actions.use(crs);
    t.step(0.3);
    expect(hurts.length).toBe(2);
    expect(hurts[1]!.id).toBe(attacker.id);
    expect(hurts[1]!.info.amount).toBeLessThan(8);
    expect(hurts[1]!.info.knockback).toBeGreaterThan(1.2);
    expect(hurts[1]!.info.means).toBe('contact');
    expect(ctx.law.forceLog.map((r) => r.means)).toEqual(['contact']);
  });

  it('un coup armé est annulé si son auteur est mis à terre avant l\'impact', async () => {
    const { t, ctx } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const attacker = spawn(ctx, 'manifestant', 0, 0);
    arm(t, attacker, 'barre');
    const victim = spawn(ctx, 'passant', 0, 1);
    ctx.people.rebuildIndex();
    face(attacker, 0);
    ctx.actions.use(attacker);
    t.step(0.1);
    ctx.health.setDown(attacker, true);
    t.step(0.5);
    expect(hurts.length).toBe(0);
    expect(victim.health).toBe(100);
  });
});

describe('jets continus', () => {
  it('gazeuse : cône de 4 m, exposition directe, petit nuage, réservoir qui se vide', async () => {
    const { t, ctx, hz } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const crs = spawn(ctx, 'crs', 0, 0);
    arm(t, crs, 'gazeuse');
    const inCone = spawn(ctx, 'manifestant', 0.2, 2.5, Math.PI); // face au jet
    const masked = spawn(ctx, 'manifestant', -0.5, 3.2, Math.PI);
    masked.gasProtection = 0.9;
    const aside = spawn(ctx, 'manifestant', 3, 2.5, Math.PI);
    const beyond = spawn(ctx, 'manifestant', 0, 6, Math.PI);
    ctx.people.rebuildIndex();
    face(crs, 0, 0);
    const stack = ctx.actions.activeItem(crs)!;
    expect(stack.count).toBe(7);
    expect(ctx.actions.use(crs).ok).toBe(true);
    expect(stack.count).toBe(6);
    expect(stack.state).toBeCloseTo(6 / 7);
    expect(crs.upper).toBe('spray');
    // déclaré dès le déclenchement, avec la personne dans le cône
    expect(ctx.law.forceLog).toHaveLength(1);
    expect(ctx.law.forceLog[0]).toMatchObject({ means: 'gazeuse', byId: crs.id, targetId: inCone.id });
    t.step(1.1);
    expect(inCone.gas).toBeGreaterThan(0.8);
    expect(masked.gas).toBeGreaterThan(0);
    expect(masked.gas).toBeLessThan(inCone.gas * 0.25);
    expect(aside.gas).toBe(0);
    expect(beyond.gas).toBe(0);
    expect(hurts.some((h) => h.id === inCone.id && h.info.kind === 'gas' && h.info.means === 'gazeuse')).toBe(true);
    // petit nuage résiduel devant le porteur
    expect(hz.gas.length).toBe(5);
    expect(hz.gas[0]!.z).toBeGreaterThan(1.5);
    expect(hz.gas[0]!.z).toBeLessThan(4);
    expect(hz.gas[0]!.radius).toBeLessThanOrEqual(2.5);
    // le jet dure une seconde puis s'arrête
    const calls = hz.gas.length;
    t.step(1);
    expect(hz.gas.length).toBe(calls);
    // sept jets, puis vide
    for (let i = 0; i < 6; i++) {
      expect(ctx.actions.use(crs).ok).toBe(true);
      t.step(1.1);
    }
    expect(stack.count).toBe(0);
    expect(stack.state).toBe(0);
    expect(ctx.actions.use(crs).reason).toBe('empty');
  });

  it('extincteur : éteint un collègue en feu et arrose le foyer', async () => {
    const { t, ctx, hz } = await setup();
    const out = record(ctx, 'fire:out');
    const crs = spawn(ctx, 'crs', 0, 0);
    arm(t, crs, 'extincteur');
    const burning = spawn(ctx, 'crs', 0, 2.2);
    burning.burning = 0.9;
    ctx.people.rebuildIndex();
    face(crs, 0);
    expect(ctx.actions.use(crs).ok).toBe(true);
    t.step(1.05);
    expect(burning.burning).toBeLessThan(0.15);
    // deux dépôts par bouffée, le long du cône ; une seconde de jet = une unité d'agent extincteur
    expect(hz.douses.length).toBe(10);
    expect(hz.douses.every((d) => d.z > 1 && d.z < 4 && Math.abs(d.x) < 0.01)).toBe(true);
    expect(hz.douses.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(1, 5);
    ctx.actions.use(crs);
    t.step(1.05);
    expect(burning.burning).toBe(0);
    expect(out).toEqual([{ x: burning.x, z: burning.z, targetKind: 'person', targetId: burning.id, byId: crs.id }]);
    expect(ctx.actions.activeItem(crs)!.count).toBe(13);
    expect(ctx.law.forceLog.length).toBe(0);
  });

  it('lance à incendie : jet de 25 m qui arrose, mouille et repousse', async () => {
    const { t, ctx, hz } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const pompier = spawn(ctx, 'pompier', 0, 0);
    arm(t, pompier, 'lance_incendie');
    face(pompier, 0);
    ctx.actions.use(pompier);
    t.step(0.55);
    expect(hz.douses.length).toBeGreaterThanOrEqual(2);
    expect(hz.douses[0]!.z).toBeCloseTo(25, 5);
    // une personne dans l'axe arrête le jet
    const m = spawn(ctx, 'manifestant', 0.2, 10);
    m.burning = 0.5;
    ctx.people.rebuildIndex();
    hz.douses.length = 0;
    ctx.actions.use(pompier);
    t.step(0.55);
    expect(hz.douses[0]!.z).toBeCloseTo(10, 5);
    expect(m.wet).toBeGreaterThan(0.3);
    expect(m.burning).toBeLessThan(0.2);
    const water = hurts.filter((h) => h.info.kind === 'water');
    expect(water.length).toBeGreaterThan(0);
    expect(water[0]!.info.knockback).toBeGreaterThan(0.5);
    // la lance n'a pas de réservoir : elle ne se vide pas
    expect(ctx.actions.activeItem(pompier)!.count).toBe(1);
  });

  it('bombe de peinture : quatre secondes devant la vitrine, puis l\'inscription', async () => {
    const { t, ctx } = await setup();
    const props = createPropRecorder(ctx);
    ctx.props = props.api;
    const shop = props.addShop({ category: 'banque', x: 0, z: 1.2, heading: Math.PI, width: 4 });
    const tagger = spawn(ctx, 'manifestant', 0.3, 0.3);
    arm(t, tagger, 'bombe_peinture');
    face(tagger, 0);
    expect(ctx.actions.use(tagger).ok).toBe(true);
    expect(tagger.upper).toBe('spraypaint');
    t.step(3.5);
    expect(props.tags.length).toBe(0);
    t.step(0.7);
    expect(props.tags).toEqual([shop.id]);
    expect(shop.window).toBe('tagged');
    expect(tagger.offenses.map((o) => o.type)).toEqual(['tag']);
    expect(ctx.actions.activeItem(tagger)!.count).toBe(11);
    // interrompu : s'il s'éloigne avant la fin, pas d'inscription
    ctx.actions.use(tagger);
    t.step(2);
    tagger.x = 30;
    t.step(2.5);
    expect(props.tags.length).toBe(1);
    // rien à taguer à portée
    expect(ctx.actions.use(tagger)).toEqual({ ok: false, reason: 'blocked' });
  });
});

describe('mégaphone et radio', () => {
  it('l\'autorité habilitée prononce les sommations ; un meneur lance un slogan ; les autres appellent le public', async () => {
    const { t, ctx } = await setup();
    const sommations = record(ctx, 'law:sommation');
    const chants = record(ctx, 'crowd:chant');
    const radio = record(ctx, 'radio:message');
    const sfx = record(ctx, 'sfx');

    const commissaire = spawn(ctx, 'commissaire', 0, 0);
    arm(t, commissaire, 'megaphone');
    expect(ctx.actions.use(commissaire).ok).toBe(true);
    expect(commissaire.upper).toBe('megaphone');
    expect(ctx.law.roe.sommation).toBe(1);
    expect(sommations.length).toBe(1);
    expect(sommations[0]).toMatchObject({ stage: 1, byId: commissaire.id });
    expect(sommations[0]!.text).toContain('Obéissance à la loi');
    expect(sfx.some((s) => s.id === 'megaphone')).toBe(true);
    // une phrase à la fois : le mégaphone est occupé pendant la diction
    expect(ctx.actions.use(commissaire).reason).toBe('cooldown');
    t.step(6.1);
    ctx.actions.use(commissaire);
    t.step(6.1);
    ctx.actions.use(commissaire);
    expect(ctx.law.roe.sommation).toBe(3);
    expect(sommations.map((s) => s.stage)).toEqual([1, 2, 3]);
    expect(sommations[2]!.text).toContain('Dernière sommation');
    expect(radio.length).toBe(0);

    // commandant unique (BRIEF §1) : le commandant d'unité porte l'écharpe et somme lui-même
    ctx.law.reset();
    const commandant = ctx.people.spawn({ kind: 'crs', x: -5, z: 0, rank: 'commandant', poste: 'commandant_unite' });
    arm(t, commandant, 'megaphone');
    ctx.actions.use(commandant);
    expect(ctx.law.roe.sommation).toBe(1);
    expect(sommations.length).toBe(4);
    expect(sommations[3]).toMatchObject({ stage: 1, byId: commandant.id });
    sommations.length = 3;

    // un simple CRS n'est pas habilité : appel au public, aucune sommation
    const crs = spawn(ctx, 'crs', 5, 0);
    arm(t, crs, 'megaphone');
    ctx.actions.use(crs);
    expect(sommations.length).toBe(3);
    expect(radio.length).toBe(1);
    expect(radio[0]!.msg).toMatchObject({ channel: 'public', personId: crs.id });
    expect(radio[0]!.msg.text).toContain('police');

    // meneur de manifestation : slogan scandé
    const meneur = spawn(ctx, 'manifestant', 10, 0);
    meneur.profile = 'meneur';
    arm(t, meneur, 'megaphone');
    ctx.actions.use(meneur);
    expect(chants.length).toBe(1);
    expect(chants[0]).toMatchObject({ x: 10, z: 0 });
    expect(chants[0]!.text.length).toBeGreaterThan(5);
    expect(chants[0]!.intensity).toBeGreaterThan(0);
    expect(radio.length).toBe(1);

    // manifestant ordinaire : appel au public
    const other = spawn(ctx, 'manifestant', 15, 0);
    arm(t, other, 'megaphone');
    ctx.actions.use(other);
    expect(chants.length).toBe(1);
    expect(radio.length).toBe(2);
    expect(radio[1]!.msg.channel).toBe('public');
  });

  it('radio : prise de parole, utilisable sans lâcher ce qu\'on tient', async () => {
    const { t, ctx, items } = await setup();
    const used = record(ctx, 'item:used');
    const sfx = record(ctx, 'sfx');
    const crs = spawn(ctx, 'crs', 0, 0, 0, ['bouclier', 'radio']);
    ctx.actions.selectById(crs, 'bouclier');
    t.step(1);
    expect(items.useItem(crs, 'radio').ok).toBe(true);
    expect(ctx.actions.activeItem(crs)!.id).toBe('bouclier');
    expect(used.map((u) => u.item)).toEqual(['radio']);
    expect(sfx.some((s) => s.id === 'radio_bip')).toBe(true);
    expect(items.useItem(crs, 'pave')).toEqual({ ok: false, reason: 'no_item' });
  });
});

describe('objets d\'interaction', () => {
  it('menottes, trousse de secours et sérum lancent l\'interaction correspondante sur la personne visée', async () => {
    const { t, ctx } = await setup();
    const started: { verb: string; actor: number; target: number }[] = [];
    const handler = (verb: string, duration: number): InteractionHandler => {
      const opt: InteractionOption = { verb, targetKind: 'person', targetId: 0, label: verb, priority: 1, duration, x: 0, z: 0 };
      return {
        verb,
        find(actor: Person, targetId?: number): InteractionOption | null {
          const target = targetId ? ctx.people.get(targetId) : ctx.people.nearest(actor.x, actor.z, 2, (q) => q !== actor);
          if (!target) return null;
          opt.targetId = target.id;
          return opt;
        },
        begin(actor: Person, o: InteractionOption): boolean {
          started.push({ verb, actor: actor.id, target: o.targetId });
          return true;
        },
        complete(): void {},
      };
    };
    const crs = spawn(ctx, 'crs', 0, 0);
    const suspect = spawn(ctx, 'manifestant', 0, 1);
    ctx.people.rebuildIndex();
    arm(t, crs, 'menottes');
    face(crs, 0);
    // tant qu'aucun module ne sait menotter, l'objet est inutilisable
    expect(ctx.actions.use(crs)).toEqual({ ok: false, reason: 'blocked' });
    expect(ctx.actions.activeItem(crs)!.count).toBe(6);
    ctx.interactions.register(handler('menotter', 4));
    ctx.interactions.register(handler('soigner', 10));
    ctx.interactions.register(handler('rincer_yeux', 6));
    const used = record(ctx, 'item:used');
    const sfx = record(ctx, 'sfx');
    expect(ctx.actions.use(crs).ok).toBe(true);
    expect(started).toEqual([{ verb: 'menotter', actor: crs.id, target: suspect.id }]);
    expect(ctx.actions.activeItem(crs)!.count).toBe(5);
    expect(used[0]).toMatchObject({ item: 'menottes', targetId: suspect.id });
    expect(sfx.some((s) => s.id === 'menottes')).toBe(true);
    expect(crs.upper).toBe('restrain');
    expect(ctx.interactions.current(crs)!.opt.verb).toBe('menotter');

    // secouriste : la trousse sur un blessé, le sérum sur une personne gazée
    const medic = spawn(ctx, 'street_medic', 10, 0);
    const wounded = spawn(ctx, 'manifestant', 10, 1.2);
    wounded.health = 60;
    ctx.people.rebuildIndex();
    arm(t, medic, 'trousse_secours');
    face(medic, 0);
    expect(ctx.actions.use(medic).ok).toBe(true);
    expect(started[1]).toEqual({ verb: 'soigner', actor: medic.id, target: wounded.id });
    expect(ctx.actions.activeItem(medic)!.count).toBe(9);
    arm(t, medic, 'serum_physiologique');
    // personne ne tousse à portée : rien à rincer
    expect(ctx.actions.use(medic).reason).toBe('blocked');
    wounded.gas = 0.7;
    expect(ctx.actions.use(medic).ok).toBe(true);
    expect(started[2]).toEqual({ verb: 'rincer_yeux', actor: medic.id, target: wounded.id });
    expect(ctx.actions.activeItem(medic)!.count).toBe(19);
    // cible explicite (IA)
    const other = spawn(ctx, 'manifestant', 10.5, -1);
    other.gas = 0.4;
    ctx.people.rebuildIndex();
    t.step(1.6);
    expect(ctx.actions.use(medic, { targetId: other.id }).ok).toBe(true);
    expect(started[3]!.target).toBe(other.id);
  });
});

describe('prise de vue', () => {
  it('appareil photo, caméra et téléphone signalent chaque prise de vue', async () => {
    const { t, ctx } = await setup();
    const used = record(ctx, 'item:used');
    const sfx = record(ctx, 'sfx');
    const reporter = spawn(ctx, 'journaliste', 0, 0);
    const subject = spawn(ctx, 'crs', 3, 12);
    arm(t, reporter, 'appareil_photo');
    face(reporter, 0);
    expect(ctx.actions.use(reporter, { targetId: subject.id }).ok).toBe(true);
    expect(used[0]).toEqual({ personId: reporter.id, item: 'appareil_photo', x: 3, z: 12, targetId: subject.id });
    expect(sfx.some((s) => s.id === 'declencheur_photo')).toBe(true);
    expect(ctx.actions.activeItem(reporter)!.count).toBe(23);
    expect(reporter.upper).toBe('photo');
    // une vue par seconde
    expect(ctx.actions.use(reporter).reason).toBe('cooldown');
    t.step(1.05);
    // sans sujet désigné : le point visé, 8 m devant
    ctx.actions.use(reporter);
    expect(used[1]).toMatchObject({ item: 'appareil_photo', targetId: 0 });
    expect(used[1]!.z).toBeCloseTo(8, 5);
    arm(t, reporter, 'camera_tv');
    ctx.actions.use(reporter);
    arm(t, reporter, 'telephone');
    ctx.actions.use(reporter);
    expect(used.map((u) => u.item)).toEqual(['appareil_photo', 'appareil_photo', 'camera_tv', 'telephone']);
    // viser dans le viseur : mode secondaire
    ctx.actions.setAlt(reporter, true);
    t.step(2);
    expect(reporter.upper).toBe('film');
  });
});

describe('bascules et port passif', () => {
  it('lampe : allume, éteint, se décharge', async () => {
    const { t, ctx, items } = await setup();
    const toggles: unknown[] = [];
    ctx.events.onAny(ITEM_TOGGLE_EVENT, (e) => void toggles.push(e));
    const crs = spawn(ctx, 'crs', 0, 0);
    arm(t, crs, 'lampe');
    expect(items.lampOn(crs)).toBe(false);
    expect(ctx.actions.use(crs).ok).toBe(true);
    expect(items.lampOn(crs)).toBe(true);
    expect(crs.look.extras!.lampe).toBe(1);
    expect(toggles).toEqual([{ personId: crs.id, item: 'lampe', on: true }]);
    t.step(60);
    const stack = ctx.actions.activeItem(crs)!;
    expect(stack.state).toBeLessThan(1);
    expect(stack.state).toBeGreaterThan(0.98);
    ctx.actions.use(crs);
    expect(items.lampOn(crs)).toBe(false);
    const level = stack.state;
    t.step(30);
    expect(stack.state).toBe(level); // éteinte, elle ne se décharge pas
    // pile vide : impossible d'allumer
    stack.state = 0;
    expect(ctx.actions.use(crs).reason).toBe('empty');
  });

  it('masque à gaz : huit secondes pour le mettre, protège ensuite, se retire', async () => {
    const { t, ctx, items } = await setup();
    const crs = spawn(ctx, 'crs', 0, 0, 0, ['tonfa', 'masque_gaz']);
    ctx.actions.selectById(crs, 'tonfa');
    t.step(1);
    expect(crs.gasProtection).toBe(0);
    // sans lâcher le bâton
    expect(items.useItem(crs, 'masque_gaz').ok).toBe(true);
    expect(ctx.actions.activeItem(crs)!.id).toBe('tonfa');
    t.step(7.5);
    expect(items.maskOn(crs)).toBe(false);
    expect(crs.gasProtection).toBe(0);
    t.step(0.6);
    expect(items.maskOn(crs)).toBe(true);
    expect(crs.look.gasMask).toBe(true);
    expect(crs.gasProtection).toBeCloseTo(0.9);
    // retrait
    expect(items.useItem(crs, 'masque_gaz').ok).toBe(true);
    expect(crs.look.gasMask).toBe(false);
    expect(crs.gasProtection).toBe(0);
    // mise en place interrompue par un étourdissement
    t.step(2.1);
    items.useItem(crs, 'masque_gaz');
    t.step(3);
    crs.stun = 2;
    t.step(0.1);
    crs.stun = 0;
    t.step(6);
    expect(crs.look.gasMask).toBe(false);
  });

  it('parapluie ouvert : masque aux caméras et arrête les petits projectiles, pas les pavés', async () => {
    const { t, ctx, items } = await setup();
    const hurts = record(ctx, 'person:hurt');
    const bloc = spawn(ctx, 'manifestant', 0, 12, Math.PI, ['parapluie']);
    const neighbour = spawn(ctx, 'manifestant', 0.8, 12.3, Math.PI);
    ctx.actions.selectById(bloc, 'parapluie');
    ctx.people.rebuildIndex();
    expect(items.umbrellaOpen(bloc)).toBe(false);
    expect(items.concealedAt(neighbour.x, neighbour.z)).toBe(false);
    ctx.actions.setAlt(bloc, true);
    expect(bloc.alt).toBe(true);
    expect(bloc.upper).toBe('umbrella');
    expect(items.umbrellaOpen(bloc)).toBe(true);
    expect(items.concealedAt(bloc.x, bloc.z)).toBe(true);
    expect(items.concealedAt(neighbour.x, neighbour.z)).toBe(true); // masque aussi ses voisins
    expect(items.concealedAt(6, 12)).toBe(false);

    // débris lancé au visage : arrêté par la toile
    const thrower = spawn(ctx, 'passant', 0, 0);
    ctx.people.rebuildIndex();
    const umbrella = ctx.actions.activeItem(bloc)!;
    ctx.projectiles.spawn('debris', thrower.id, 0, 1.6, 4, 0, 2.6, 14);
    t.step(1.5);
    expect(hurts.length).toBe(0);
    expect(umbrella.state).toBeLessThan(1);
    // un pavé le traverse
    arm(t, thrower, 'pave');
    const sol = aimAt(ctx, thrower, bloc.x, bloc.y + 1.4, bloc.z)!;
    ctx.actions.use(thrower, { power: sol.power });
    t.step(2);
    expect(hurts.length).toBe(1);
    expect(hurts[0]!.id).toBe(bloc.id);
    // refermé par l'action principale
    bloc.stun = 0;
    expect(ctx.actions.use(bloc).ok).toBe(true);
    expect(bloc.alt).toBe(false);
    expect(items.concealedAt(bloc.x, bloc.z)).toBe(false);
  });

  it('pancarte, drapeau, banderole : port passif, brandis par le mode secondaire', async () => {
    const { t, ctx } = await setup();
    const used = record(ctx, 'item:used');
    const m = spawn(ctx, 'manifestant', 0, 0);
    arm(t, m, 'pancarte');
    expect(m.upper).toBe('carry_sign');
    ctx.actions.setAlt(m, true);
    expect(m.alt).toBe(true);
    expect(m.upper).toBe('carry_sign');
    expect(ctx.actions.use(m).ok).toBe(true);
    expect(m.upper).toBe('wave');
    expect(used.map((u) => u.item)).toEqual(['pancarte']);
    t.step(1.6);
    expect(m.upper).toBe('carry_sign');
    expect(m.offenses.length).toBe(0);
    arm(t, m, 'banderole');
    expect(m.upper).toBe('carry_banner');
    expect(m.alt).toBe(false);
    arm(t, m, 'drapeau');
    expect(ctx.actions.use(m).ok).toBe(true);
    // une banderole arrête une balle de défense tirée sur son porteur
    const hurts = record(ctx, 'person:hurt');
    const porteur = spawn(ctx, 'manifestant', 0, 20, Math.PI);
    arm(t, porteur, 'banderole');
    const crs = spawn(ctx, 'crs', 0, 0);
    arm(t, crs, 'lbd40');
    ctx.people.rebuildIndex();
    aimAt(ctx, crs, 0, 1.1, 20);
    ctx.actions.use(crs);
    t.step(1);
    expect(hurts.length).toBe(0);
    expect(ctx.actions.activeItem(porteur)!.state).toBeLessThan(1);
  });

  it('télécommande de drone, butin, événements du lanceur', async () => {
    const { t, ctx, items } = await setup();
    const drone: unknown[] = [];
    const ranges: unknown[] = [];
    ctx.events.onAny(DRONE_TOGGLE_EVENT, (e) => void drone.push(e));
    ctx.events.onAny(LAUNCHER_RANGE_EVENT, (e) => void ranges.push(e));
    const pilot = spawn(ctx, 'telepilote', 0, 0);
    arm(t, pilot, 'telecommande_drone');
    expect(pilot.upper).toBe('remote');
    expect(ctx.actions.use(pilot).ok).toBe(true);
    expect(drone).toEqual([{ personId: pilot.id }]);

    const looter = spawn(ctx, 'manifestant', 5, 0);
    arm(t, looter, 'butin', 2);
    expect(looter.upper).toBe('carry_loot');
    expect(ctx.actions.use(looter).ok).toBe(true);
    expect(ctx.actions.has(looter, 'butin')).toBe(1);
    t.step(1.1);
    ctx.actions.use(looter);
    expect(ctx.actions.has(looter, 'butin')).toBe(0);
    expect(looter.active).toBe(-1);

    const crs = spawn(ctx, 'crs', 10, 0);
    arm(t, crs, 'lanceur_cougar');
    ctx.actions.setAlt(crs, true);
    expect(ranges).toEqual([{ personId: crs.id, range: 200 }]);
    expect(items.launcherRange(crs)).toBe(200);
  });
});

describe('session', () => {
  it('reset() remet tout à zéro entre deux sessions', async () => {
    const { t, ctx, items } = await setup();
    const crs = spawn(ctx, 'crs', 0, 0);
    arm(t, crs, 'lanceur_cougar');
    ctx.actions.setAlt(crs, true);
    items.tuning.dispersion = 0;
    items.tuning.damageScale = 3;
    face(crs, 0, 0.2);
    ctx.actions.use(crs);
    t.step(1);
    expect(ctx.projectiles.list.length).toBe(1);
    await t.start();
    expect(ctx.projectiles.list.length).toBe(0);
    expect(items.tuning.dispersion).toBe(1);
    expect(items.tuning.damageScale).toBe(1);
    const again = spawn(ctx, 'crs', 0, 0);
    arm(t, again, 'lanceur_cougar');
    expect(items.launcherRange(again)).toBe(100);
    expect(ctx.actions.use(again).ok).toBe(true);
    // les services publiés restent ceux du module
    expect(ctx.actions.defs.length).toBe(40);
    expect(ctx.require<ItemsApi>(ITEMS_SERVICE)).toBe(items);
  });
});
