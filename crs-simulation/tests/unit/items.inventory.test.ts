// Matériel — table des objets, inventaire, délais, munitions et conditions d'usage.
import { describe, expect, it } from 'vitest';
import { FORCE_LEVEL_OF } from '@/core/contracts';
import type { ItemId } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems } from '@/sim/items';
import type { ItemsApi } from '@/sim/items';
import { ITEMS_SERVICE } from '@/sim/items';
import { PROJECTILE_SPECS } from '@/sim/items/projectile-defs';
import { face, spawn } from '@/sim/items/testkit';

/** Tous les ItemId du contrat (src/core/contracts.ts §3). */
const ALL_ITEMS: ItemId[] = [
  'bouclier', 'baton', 'tonfa', 'gazeuse', 'grenade_lacrymo', 'grenade_gm2l', 'grenade_desencerclement',
  'lanceur_cougar', 'lbd40', 'pistolet', 'menottes', 'radio', 'megaphone', 'extincteur', 'lampe', 'masque_gaz',
  'fusee_sommation', 'telecommande_drone',
  'pave', 'bouteille', 'molotov', 'mortier', 'fumigene', 'pancarte', 'banderole', 'drapeau', 'parapluie',
  'bombe_peinture', 'marteau', 'barre', 'telephone', 'butin', 'raquette',
  'trousse_secours', 'serum_physiologique', 'brancard', 'lance_incendie',
  'appareil_photo', 'camera_tv', 'micro',
];

/** Tous les ProjectileKind du contrat (§4). */
const ALL_PROJECTILES = [
  'grenade_lacrymo_main', 'grenade_lacrymo_56', 'palet_lacrymo', 'gm2l', 'desencerclement', 'plot_caoutchouc',
  'lbd', 'balle', 'fusee_rouge', 'pave', 'bouteille', 'molotov', 'mortier', 'fumigene', 'oeuf_peinture', 'debris',
];

async function setup() {
  const t = createTestContext({ modules: [createSystems] });
  await t.start();
  return t;
}

describe('table des objets', () => {
  it('décrit tous les objets du contrat, avec des valeurs cohérentes', async () => {
    const { ctx } = await setup();
    const items = ctx.require<ItemsApi>(ITEMS_SERVICE);
    expect(ctx.actions.defs.length).toBe(ALL_ITEMS.length);
    const icons = new Set<string>();
    for (const id of ALL_ITEMS) {
      const def = ctx.actions.def(id);
      const spec = items.spec(id);
      expect(def, id).toBeDefined();
      expect(spec, id).toBeDefined();
      if (!def || !spec) continue;
      expect(def.name.length, id).toBeGreaterThan(2);
      expect(def.description.length, id).toBeGreaterThan(20);
      expect(def.weight, id).toBeGreaterThan(0);
      expect(def.cooldown, id).toBeGreaterThan(0);
      expect(def.maxCount, id).toBeGreaterThanOrEqual(1);
      expect(def.rangeMax, id).toBeGreaterThanOrEqual(def.rangeMin);
      expect(spec.dotation, id).toBeLessThanOrEqual(def.maxCount);
      // niveau de force : toujours celui de la gradation de référence
      if (def.forceMeans) expect(def.forceLevel, id).toBe(FORCE_LEVEL_OF[def.forceMeans]);
      else expect(def.forceLevel, id).toBe(0);
      // un objet qui annonce un projectile sait le lancer, et réciproquement
      expect(!!spec.launch, id).toBe(def.projectile !== null);
      icons.add(def.icon);
    }
    expect(icons.size).toBe(ALL_ITEMS.length);
    expect(ctx.actions.def('objet_inconnu')).toBeUndefined();
  });

  it('respecte la gradation et les valeurs de référence du dossier matériel', async () => {
    const { ctx } = await setup();
    const def = (id: string) => ctx.actions.def(id)!;
    expect(def('bouclier').forceLevel).toBe(1);
    expect(def('tonfa').forceLevel).toBe(2);
    expect(def('gazeuse').forceLevel).toBe(2);
    expect(def('grenade_lacrymo').forceLevel).toBe(3);
    expect(def('lanceur_cougar').forceLevel).toBe(3);
    expect(def('grenade_gm2l').forceLevel).toBe(4);
    expect(def('grenade_desencerclement').forceLevel).toBe(4);
    expect(def('lbd40').forceLevel).toBe(4);
    expect(def('pistolet').forceLevel).toBe(5);
    // lanceur de 56 mm : 3,67 kg, 6 à 8 coups par minute, 50 à 200 m, sous habilitation
    expect(def('lanceur_cougar').weight).toBeCloseTo(3.67);
    expect(60 / def('lanceur_cougar').cooldown).toBeGreaterThanOrEqual(6);
    expect(60 / def('lanceur_cougar').cooldown).toBeLessThanOrEqual(8);
    expect(def('lanceur_cougar').rangeMax).toBe(200);
    expect(def('lanceur_cougar').habilitation).toBe('lanceur');
    // LBD : 2,05 kg, utile de 10 à 50 m, sous habilitation
    expect(def('lbd40').weight).toBeCloseTo(2.05);
    expect([def('lbd40').rangeMin, def('lbd40').rangeMax]).toEqual([10, 50]);
    expect(def('lbd40').habilitation).toBe('lbd');
    // grenade à main : 340 g, 5 à 30 m ; gazeuse : 4 m ; aucune marque commerciale dans les noms
    expect(def('grenade_lacrymo').weight).toBeCloseTo(0.34);
    expect([def('grenade_lacrymo').rangeMin, def('grenade_lacrymo').rangeMax]).toEqual([5, 30]);
    expect(def('gazeuse').rangeMax).toBe(4);
    for (const d of ctx.actions.defs) expect(d.name.toLowerCase()).not.toContain('cougar');
  });

  it('décrit tous les types de projectiles du contrat', () => {
    const kinds = PROJECTILE_SPECS.map((s) => s.kind);
    for (const k of ALL_PROJECTILES) expect(kinds, k).toContain(k);
    for (const s of PROJECTILE_SPECS) {
      expect(s.mass, s.kind).toBeGreaterThan(0);
      expect(s.radius, s.kind).toBeGreaterThan(0);
      expect(s.drag, s.kind).toBeGreaterThan(0);
    }
  });
});

describe('inventaire', () => {
  it('donne, cumule, borne et retire', async () => {
    const { ctx } = await setup();
    const a = ctx.actions;
    const p = spawn(ctx, 'crs', 0, 0);
    // sans quantité : dotation normale (lanceur garni de 8 grenades, une grenade à main)
    expect(a.give(p, 'lanceur_cougar').count).toBe(8);
    expect(a.give(p, 'grenade_lacrymo').count).toBe(1);
    expect(a.give(p, 'grenade_lacrymo', 2).count).toBe(3);
    // borne : quatre grenades au plus
    expect(a.give(p, 'grenade_lacrymo', 10).count).toBe(4);
    expect(p.inventory.length).toBe(2);
    expect(a.has(p, 'grenade_lacrymo')).toBe(4);
    expect(a.has(p, 'pave')).toBe(0);
    expect(a.remove(p, 'grenade_lacrymo', 3)).toBe(3);
    expect(a.has(p, 'grenade_lacrymo')).toBe(1);
    expect(a.remove(p, 'grenade_lacrymo')).toBe(1);
    expect(p.inventory.map((s) => s.id)).toEqual(['lanceur_cougar']);
    expect(a.remove(p, 'grenade_lacrymo')).toBe(0);
    const stack = a.give(p, 'bouclier');
    expect(stack).toMatchObject({ id: 'bouclier', count: 1, state: 1, cooldown: 0 });
  });

  it('prend en main, change d\'objet et garde l\'index juste après un retrait', async () => {
    const { ctx } = await setup();
    const a = ctx.actions;
    const p = spawn(ctx, 'crs', 0, 0, 0, ['bouclier', 'tonfa', 'gazeuse']);
    expect(a.activeItem(p)).toBeNull();
    expect(a.select(p, 5)).toBe(false);
    expect(a.select(p, 1.5)).toBe(false);
    expect(a.selectById(p, 'pave')).toBe(false);
    expect(a.selectById(p, 'gazeuse')).toBe(true);
    expect(p.active).toBe(2);
    expect(a.activeItem(p)!.id).toBe('gazeuse');
    // retirer un objet placé avant : l'objet en main reste le même
    a.remove(p, 'bouclier');
    expect(a.activeItem(p)!.id).toBe('gazeuse');
    expect(p.active).toBe(1);
    // retirer l'objet en main : mains nues
    a.remove(p, 'gazeuse');
    expect(p.active).toBe(-1);
    expect(a.activeItem(p)).toBeNull();
    // le mode secondaire tombe quand on change d'objet
    a.give(p, 'bouclier');
    a.selectById(p, 'bouclier');
    a.setAlt(p, true);
    expect(p.alt).toBe(true);
    expect(p.upper).toBe('block');
    a.selectById(p, 'tonfa');
    expect(p.alt).toBe(false);
    expect(a.select(p, -1)).toBe(true);
    expect(p.active).toBe(-1);
  });

  it('impose le temps de mise en main', async () => {
    const t = await setup();
    const { ctx } = t;
    const p = spawn(ctx, 'crs', 0, 0, 0, ['lbd40']);
    ctx.actions.selectById(p, 'lbd40');
    expect(ctx.actions.canUse(p)).toBe(false);
    expect(ctx.actions.use(p).reason).toBe('cooldown');
    t.step(1);
    expect(ctx.actions.canUse(p)).toBe(true);
  });
});

describe('délais, munitions, conditions d\'usage', () => {
  it('respecte le délai entre deux tirs et compte les munitions du LBD', async () => {
    const t = await setup();
    const { ctx } = t;
    const a = ctx.actions;
    const p = spawn(ctx, 'crs', 0, 0, 0, ['lbd40']);
    a.selectById(p, 'lbd40');
    t.step(1);
    const stack = a.activeItem(p)!;
    expect(stack.count).toBe(6);
    const first = a.use(p);
    expect(first.ok).toBe(true);
    expect(first.projectileId).toBeGreaterThan(0);
    expect(stack.count).toBe(5);
    expect(stack.cooldown).toBeCloseTo(5, 5);
    // rechargement : 5 s
    expect(a.use(p)).toEqual({ ok: false, reason: 'cooldown' });
    t.step(4.5);
    expect(a.canUse(p)).toBe(false);
    expect(stack.cooldown).toBeCloseTo(0.5, 2);
    t.step(0.6);
    expect(stack.cooldown).toBe(0);
    expect(a.canUse(p)).toBe(true);
    // on vide l'arme
    for (let i = 0; i < 5; i++) {
      expect(a.use(p).ok).toBe(true);
      t.step(5.1);
    }
    expect(stack.count).toBe(0);
    expect(a.use(p)).toEqual({ ok: false, reason: 'empty' });
    expect(a.canUse(p)).toBe(false);
    // l'arme vide reste en main ; un réapprovisionnement la rend utilisable
    expect(a.activeItem(p)!.id).toBe('lbd40');
    a.give(p, 'lbd40', 2);
    expect(a.use(p).ok).toBe(true);
  });

  it('retire de l\'inventaire la dernière grenade lancée', async () => {
    const t = await setup();
    const { ctx } = t;
    const a = ctx.actions;
    const p = spawn(ctx, 'crs', 0, 0);
    a.give(p, 'grenade_lacrymo', 2);
    a.selectById(p, 'grenade_lacrymo');
    t.step(1);
    face(p, 0, 0.4);
    expect(a.use(p, { power: 0.8 }).ok).toBe(true);
    expect(a.has(p, 'grenade_lacrymo')).toBe(1);
    // « lancer en 3 s »
    expect(a.use(p).reason).toBe('cooldown');
    t.step(3.1);
    expect(a.use(p).ok).toBe(true);
    expect(a.has(p, 'grenade_lacrymo')).toBe(0);
    expect(p.inventory.length).toBe(0);
    expect(p.active).toBe(-1);
    expect(a.use(p)).toEqual({ ok: false, reason: 'no_item' });
  });

  it('interdit tout usage à une personne menottée, tenue ou hors simulation', async () => {
    const t = await setup();
    const { ctx } = t;
    const a = ctx.actions;
    const p = spawn(ctx, 'manifestant', 0, 0, 0, ['pave', 'parapluie']);
    a.selectById(p, 'pave');
    t.step(1);
    expect(a.canUse(p)).toBe(true);
    for (const custody of ['held', 'cuffed', 'escorted', 'in_vehicle', 'handed_over'] as const) {
      p.custody = custody;
      expect(a.canUse(p), custody).toBe(false);
      expect(a.use(p), custody).toEqual({ ok: false, reason: 'forbidden' });
    }
    expect(a.has(p, 'pave')).toBe(1);
    expect(ctx.projectiles.list.length).toBe(0);
    // menotté : impossible aussi de lever un parapluie
    a.selectById(p, 'parapluie');
    a.setAlt(p, true);
    expect(p.alt).toBe(false);
    p.custody = 'free';
    p.heldBy = 99;
    expect(a.use(p).reason).toBe('forbidden');
    p.heldBy = 0;
    p.dormant = true;
    expect(a.use(p).reason).toBe('forbidden');
  });

  it('refuse selon la posture, l\'étourdissement, le feu et les mains prises', async () => {
    const t = await setup();
    const { ctx } = t;
    const a = ctx.actions;
    const p = spawn(ctx, 'crs', 0, 0, 0, ['tonfa', 'radio', 'lanceur_cougar']);
    a.selectById(p, 'tonfa');
    t.step(1);
    expect(a.use({ ...p, active: -1 } as typeof p).reason).toBe('no_item');
    p.posture = 'down';
    expect(a.use(p).reason).toBe('posture');
    p.posture = 'stand';
    p.stun = 2;
    expect(a.use(p).reason).toBe('blocked');
    p.stun = 0;
    p.burning = 0.8;
    expect(a.use(p).reason).toBe('blocked');
    p.burning = 0;
    // assis dans un véhicule : la radio oui, le bâton non
    p.posture = 'seated';
    p.vehicleId = 77;
    expect(a.use(p).reason).toBe('posture');
    a.selectById(p, 'radio');
    t.step(1);
    expect(a.use(p).ok).toBe(true);
    p.posture = 'stand';
    p.vehicleId = 0;
    // en portant quelqu'un : pas d'arme à deux mains
    a.selectById(p, 'lanceur_cougar');
    t.step(1);
    p.carrying = 55;
    expect(a.use(p).reason).toBe('blocked');
    p.carrying = 0;
    expect(a.use(p).ok).toBe(true);
  });

  it('le lanceur de 56 mm change de portée par le mode secondaire et partage son rechargement', async () => {
    const t = await setup();
    const { ctx } = t;
    const a = ctx.actions;
    const items = ctx.require<ItemsApi>(ITEMS_SERVICE);
    const p = spawn(ctx, 'crs', 0, 0, 0, ['lanceur_cougar']);
    a.give(p, 'grenade_gm2l', 2);
    a.selectById(p, 'lanceur_cougar');
    t.step(1);
    expect(items.launcherRange(p)).toBe(100);
    a.setAlt(p, true);
    expect(items.launcherRange(p)).toBe(200);
    a.setAlt(p, true); // maintenu : pas de nouveau changement
    expect(items.launcherRange(p)).toBe(200);
    a.setAlt(p, false);
    a.setAlt(p, true);
    expect(items.launcherRange(p)).toBe(50);
    a.setAlt(p, false);
    items.setLauncherRange(p, 100);
    expect(items.launcherRange(p)).toBe(100);
    // un tir de lacrymogène immobilise le lanceur : la grenade assourdissante attend le rechargement
    expect(a.use(p).ok).toBe(true);
    a.selectById(p, 'grenade_gm2l');
    t.step(1);
    expect(a.canUse(p)).toBe(false);
    expect(a.use(p).reason).toBe('cooldown');
    t.step(7.2);
    const r = a.use(p);
    expect(r.ok).toBe(true);
    expect(ctx.projectiles.get(r.projectileId!)!.kind).toBe('gm2l');
    expect(a.has(p, 'grenade_gm2l')).toBe(1);
  });
});
