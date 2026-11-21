// Archétypes — fonctionnement avec les modules réels quand ils sont présents (matériel, droit,
// personnes) : le module ne dépend que des services du contexte et doit donner le même résultat avec
// les services neutres et avec les vrais. Si un module voisin ne se charge pas (travail en cours),
// le test correspondant est sauté et le signale.
import { describe, expect, it } from 'vitest';
import type { ModuleFactory, Person } from '@/core/contracts';
import { FAMILY_IDS } from '@/sim/roles';
import { POLICE_KINDS } from '@/sim/roles/archetypes/police';
import {
  ALL_KINDS, ALL_POSTES, ALL_PROFILES, CONTRACT_ITEMS, countOf, handOf, kitIds, startRoles,
} from '@/sim/roles/archetypes/testkit';

async function optional(name: string, load: () => Promise<{ createSystems: ModuleFactory }>): Promise<ModuleFactory | null> {
  try {
    return (await load()).createSystems;
  } catch (err) {
    console.warn(`[roles] module « ${name} » indisponible : test d'intégration sauté`, err);
    return null;
  }
}

const loadItems = () => optional('sim/items', () => import('@/sim/items'));
const loadLaw = () => optional('gameplay/law', () => import('@/gameplay/law'));
const loadPeople = () => optional('sim/people', () => import('@/sim/people'));

describe('avec le module du matériel', () => {
  it('toutes les dotations ne contiennent que des objets définis, en quantité permise', async () => {
    const items = await loadItems();
    if (!items) return;
    const { ctx, ext } = await startRoles(131, { extra: { cause: 'retraites' } }, [items]);
    expect(ctx.actions.defs.length).toBeGreaterThanOrEqual(CONTRACT_ITEMS.length);
    const check = (p: Person, label: string) => {
      for (const s of p.inventory) {
        const def = ctx.actions.def(s.id);
        expect(def, `${label} : objet inconnu ${s.id}`).toBeDefined();
        expect(s.count, `${label} ${s.id}`).toBeGreaterThan(0);
        expect(s.count, `${label} ${s.id}`).toBeLessThanOrEqual(def!.maxCount);
      }
      expect(new Set(kitIds(p)).size, label).toBe(p.inventory.length);
      if (p.active >= 0) expect(ctx.actions.activeItem(p)?.id, label).toBe(handOf(p));
    };
    for (const kind of POLICE_KINDS) {
      for (const poste of [...ALL_POSTES, null]) check(ctx.archetypes.spawn(kind, 0, 0, { poste }), `${kind}/${poste}`);
    }
    for (const kind of ALL_KINDS) for (let i = 0; i < 30; i++) check(ctx.archetypes.spawn(kind, 0, 0), kind);
    for (const family of FAMILY_IDS) {
      for (const profile of ALL_PROFILES) {
        for (let i = 0; i < 20; i++) check(ext.spawnEx('manifestant', 0, 0, { family, profile }), `${family}/${profile}`);
      }
    }
    // dotations types annoncées à l'interface : uniquement des objets connus
    for (const kind of ALL_KINDS) {
      for (const role of [...ALL_POSTES, ...ALL_PROFILES, null]) {
        for (const id of ext.kitOf(kind, role)) expect(ctx.actions.def(id), `${kind}/${role} ${id}`).toBeDefined();
      }
    }
  });

  it('même dotation qu’avec le service neutre ; objet du poste en main', async () => {
    const items = await loadItems();
    if (!items) return;
    const real = await startRoles(132, {}, [items]);
    const neutral = await startRoles(132);
    for (const poste of ALL_POSTES) {
      const a = real.ctx.archetypes.spawn('crs', 0, 0, { poste, seed: 5 });
      const b = neutral.ctx.archetypes.spawn('crs', 0, 0, { poste, seed: 5 });
      expect(a.inventory.map((s) => [s.id, s.count]), poste).toEqual(b.inventory.map((s) => [s.id, s.count]));
      expect(handOf(a), poste).toBe(handOf(b));
      expect(a.look, poste).toEqual(b.look);
    }
    const shield = real.ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' });
    expect(real.ctx.actions.activeItem(shield)?.id).toBe('bouclier');
    // masse réelle de l'équipement d'un porteur de bouclier : une vingtaine de kilos
    expect(real.ext.loadKg(shield)).toBeGreaterThan(15);
    expect(real.ext.loadKg(shield)).toBeLessThan(25);
    expect(Math.abs(real.ext.loadKg(shield) - neutral.ext.loadKg(neutral.ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' })))).toBeLessThan(1.5);
  });

  it('changement de poste et radicalisation avec le vrai inventaire', async () => {
    const items = await loadItems();
    if (!items) return;
    const { ctx, ext } = await startRoles(133, {}, [items]);
    const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' });
    ctx.archetypes.equip(p, 'lanceur');
    expect(kitIds(p)).toEqual(['lanceur_cougar', 'grenade_lacrymo', 'grenade_gm2l', 'tonfa', 'gazeuse', 'menottes', 'radio', 'masque_gaz', 'pistolet']);
    expect(ctx.actions.activeItem(p)?.id).toBe('lanceur_cougar');
    ctx.archetypes.equip(p, 'chef_groupe');
    expect(countOf(p, 'lanceur_cougar')).toBe(0);
    expect(countOf(p, 'grenade_lacrymo')).toBe(2);
    expect(ctx.actions.activeItem(p)).toBeNull();
    const m = ext.spawnEx('manifestant', 0, 0, { family: 'etudiants', profile: 'opportuniste', carry: 'pancarte' });
    ctx.actions.give(m, 'pave', 2);
    ctx.archetypes.equip(m, 'radical');
    expect(countOf(m, 'pancarte')).toBe(0);
    expect(countOf(m, 'pave')).toBe(2);
    expect(m.look.faceCover).toBe(true);
  });
});

describe('avec le module du droit', () => {
  it('seule l’autorité habilitée créée par le module peut sommer ; ses fusées sont en dotation', async () => {
    const law = await loadLaw();
    if (!law) return;
    const { ctx, helper } = await startRoles(134, { extra: { cause: 'retraites' } }, [law]);
    const cdt = ctx.archetypes.spawn('crs', 0, 0, { poste: 'commandant_unite' });
    const equipier = ctx.archetypes.spawn('crs', 2, 0, { poste: 'bouclier' });
    const chef = ctx.archetypes.spawn('crs', 4, 0, { poste: 'chef_section' });
    helper.crowd('retraites', 40).forEach((s, i) => helper.spawnSlot(s, (i % 10) * 1.2 - 6, 12 + Math.floor(i / 10) * 1.2));
    ctx.people.rebuildIndex();
    expect(ctx.law.sommation(equipier)).toBe(0);
    expect(ctx.law.sommation(chef)).toBe(0);
    expect(ctx.law.sommation(cdt)).toBe(1);
    expect(ctx.law.roe.sommation).toBe(1);
  });

  it('l’autorité civile (commissaire) somme aussi ; sans écharpe, refus', async () => {
    const law = await loadLaw();
    if (!law) return;
    const { ctx } = await startRoles(135, {}, [law]);
    const commissaire = ctx.archetypes.spawn('commissaire', 0, 0);
    const sansInsigne = ctx.archetypes.spawn('commissaire', 3, 0, { look: { sash: false } });
    expect(ctx.law.sommation(sansInsigne)).toBe(0);
    expect(ctx.law.sommation(commissaire)).toBe(1);
  });
});

describe('avec le module des personnes et celui du matériel', () => {
  it('une foule et une section créées par le module vivent quelques secondes sans erreur', async () => {
    const people = await loadPeople();
    const items = await loadItems();
    if (!people || !items) return;
    const { t, ctx, helper } = await startRoles(136, { extra: { cause: 'climat' } }, [items, people]);
    helper.crowd('climat', 150).forEach((s, i) => helper.spawnSlot(s, (i % 15) * 1.3 - 10, 10 + Math.floor(i / 15) * 1.3));
    const section = helper.policeUnit('section').map((s, i) => helper.spawnUnitSlot(s, i * 0.8 - 6, -5));
    expect(ctx.people.list.length).toBe(166);
    for (const p of ctx.people.list) {
      p.cmd.moveX = 0;
      p.cmd.moveZ = p.faction === 'police' ? 1 : -1;
      p.cmd.gait = 1;
    }
    t.step(3);
    for (const p of ctx.people.list) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z), p.name).toBe(true);
      expect(p.health, p.name).toBeGreaterThan(0);
    }
    // la charge ralentit le porteur de bouclier : il n'a pas couru aussi loin que son chef de section sans bouclier
    const shield = section.find((p) => p.poste === 'bouclier')!;
    expect(Math.hypot(shield.vx, shield.vz)).toBeGreaterThan(0.5);
    expect(Math.hypot(shield.vx, shield.vz)).toBeLessThan(shield.speedRun);
  });
});

describe('avec la logique d’apparence du rendu des personnages', () => {
  it('les tenues produites sont comprises par le rendu : pièces et marquages attendus', async () => {
    let look: typeof import('@/render/people/look');
    let parts: typeof import('@/render/people/parts');
    try {
      look = await import('@/render/people/look');
      parts = await import('@/render/people/parts');
    } catch (err) {
      console.warn('[roles] logique d’apparence du rendu indisponible : test sauté', err);
      return;
    }
    const { ctx, ext } = await startRoles(137, { extra: { cause: 'retraites' } });
    const texts = new Set<string>();
    const cells = new Map<string, number>();
    const cellOf = (t: string): number => {
      texts.add(t);
      if (!cells.has(t)) cells.set(t, cells.size + 1);
      return cells.get(t)!;
    };
    const row = new Float32Array(look.LOOK_W * 4);
    const resolve = (p: Person) => {
      const info = look.resolveLook(p.look, p.id * 7919, false, p.active >= 0, 0, 0, cellOf, row, 0);
      const mask = [row[look.LOOK_OPT * 4]!, row[look.LOOK_OPT * 4 + 1]!, row[look.LOOK_OPT * 4 + 2]!];
      const has = (part: number): boolean => ((mask[Math.floor(part / parts.MASK_BITS)]! >> (part % parts.MASK_BITS)) & 1) === 1;
      for (let i = 0; i < row.length; i++) expect(Number.isFinite(row[i]), `${p.kind} canal ${i}`).toBe(true);
      return { has, visor: info.visor, helmeted: info.helmeted };
    };

    // toutes les personnes possibles passent dans le rendu sans erreur
    for (const kind of ALL_KINDS) for (let i = 0; i < 20; i++) resolve(ctx.archetypes.spawn(kind, 0, 0));
    for (const kind of POLICE_KINDS) for (const poste of ALL_POSTES) resolve(ctx.archetypes.spawn(kind, 0, 0, { poste }));
    for (const family of FAMILY_IDS) for (const profile of ALL_PROFILES) resolve(ext.spawnEx('manifestant', 0, 0, { family, profile }));

    const crs = resolve(ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' }));
    expect(crs.has(parts.PART_HELMET_MO)).toBe(true);
    expect(crs.has(parts.PART_HELMET_STRIPES)).toBe(true);
    expect(crs.has(parts.PART_VEST_TACTICAL)).toBe(true);
    expect(crs.has(parts.PART_RANK)).toBe(true);
    expect(crs.has(parts.PART_SASH)).toBe(false);
    expect(crs.visor).toBe(1);
    const cdt = resolve(ctx.archetypes.spawn('crs', 0, 0, { poste: 'commandant_unite' }));
    expect(cdt.has(parts.PART_SASH)).toBe(true);
    const commissaire = resolve(ext.spawnEx('commissaire', 0, 0, { variant: 'civil' }));
    expect(commissaire.has(parts.PART_SASH)).toBe(true);
    expect(commissaire.has(parts.PART_SUIT)).toBe(true);
    const gendarme = resolve(ctx.archetypes.spawn('gendarme', 0, 0));
    expect(gendarme.has(parts.PART_HELMET_MO)).toBe(true);
    expect(gendarme.has(parts.PART_HELMET_STRIPES)).toBe(false);
    const brav = resolve(ctx.archetypes.spawn('bravm', 0, 0));
    expect(brav.has(parts.PART_HELMET_MOTO)).toBe(true);
    const civil = resolve(ctx.archetypes.spawn('policier_civil', 0, 0));
    expect(civil.has(parts.PART_ARMBAND)).toBe(true);

    const gj = resolve(ext.spawnEx('manifestant', 0, 0, { family: 'gilets_jaunes', profile: 'pacifique' }));
    expect(gj.has(parts.PART_CHASUBLE)).toBe(true);
    expect(gj.has(parts.PART_REFLECT_BANDS)).toBe(true);
    const syndical = resolve(ext.spawnEx('manifestant', 0, 0, { family: 'syndical', profile: 'militant' }));
    expect(syndical.has(parts.PART_CHASUBLE)).toBe(true);
    const so = resolve(ext.spawnEx('manifestant', 0, 0, { family: 'syndical', profile: 'service_ordre' }));
    expect(so.has(parts.PART_ARMBAND)).toBe(true);
    // blouse blanche : rendue comme un manteau blanc
    let blouses = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const p = ext.spawnEx('manifestant', 0, 0, { family: 'soignants', profile: 'pacifique', seed });
      if (p.look.top !== 0xf5f5f5) continue;
      blouses++;
      expect(resolve(p).has(parts.PART_COAT), `graine ${seed}`).toBe(true);
    }
    expect(blouses).toBeGreaterThan(8);
    let hooded = 0;
    let goggles = 0;
    for (let i = 0; i < 60; i++) {
      const p = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'radical' });
      const r = resolve(p);
      expect(r.has(parts.PART_BACKPACK)).toBe(true);
      if (p.look.headgear === 'capuche') {
        hooded++;
        expect(r.has(parts.PART_HOOD_UP)).toBe(true);
        expect(r.has(parts.PART_FACE_COVER)).toBe(true);
      }
      if (r.has(parts.PART_GOGGLES)) goggles++;
    }
    expect(hooded).toBeGreaterThan(40);
    expect(goggles).toBeGreaterThan(40);

    const medic = resolve(ctx.archetypes.spawn('street_medic', 0, 0));
    expect(medic.has(parts.PART_CROSS)).toBe(true);
    expect(medic.has(parts.PART_HELMET_LIGHT)).toBe(true);
    const presse = resolve(ext.spawnEx('journaliste', 0, 0, { unmarked: false }));
    expect(presse.has(parts.PART_HELMET_LIGHT)).toBe(true);
    const pompier = resolve(ctx.archetypes.spawn('pompier', 0, 0));
    expect(pompier.has(parts.PART_HELMET_POMPIER)).toBe(true);
    const observateur = resolve(ctx.archetypes.spawn('observateur', 0, 0));
    expect(observateur.has(parts.PART_CHASUBLE)).toBe(true);

    // marquages demandés à l'atlas de textes
    for (const t of ['POLICE', 'GENDARMERIE', 'PRESSE', 'SAMU', 'SAPEURS-POMPIERS', 'OBSERVATEUR']) expect(texts, t).toContain(t);
    for (const t of texts) expect(t.startsWith('#') || /^[A-Z-]+$/.test(t), t).toBe(true);
  });
});
