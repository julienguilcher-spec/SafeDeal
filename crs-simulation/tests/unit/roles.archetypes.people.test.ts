// Archétypes — secours, presse, observateurs, civils et manifestants : chaque type de personne, chaque
// profil et chaque famille visuelle donne une personne complète et cohérente.
import { describe, expect, it } from 'vitest';
import type { Person, PersonKind } from '@/core/contracts';
import { defaultFactionOf } from '@/core/stores';
import { FAMILY_IDS, VARIANT } from '@/sim/roles';
import type { VisualFamily } from '@/sim/roles';
import { isColor } from '@/sim/roles/archetypes/palette';
import {
  ALL_KINDS, ALL_PROFILES, CONTRACT_ITEMS, countOf, handOf, kitIds, startRoles,
} from '@/sim/roles/archetypes/testkit';

function checkPerson(p: Person, label: string): void {
  const l = p.look;
  expect(p.name, label).toMatch(/^\p{Lu}[\p{L}'’-]+ \p{Lu}[\p{L}'’ -]+$/u);
  expect(p.faction, label).toBe(defaultFactionOf(p.kind));
  expect(l.height, label).toBeGreaterThanOrEqual(1.1);
  expect(l.height, label).toBeLessThanOrEqual(1.98);
  expect(l.build, label).toBeGreaterThanOrEqual(0.85);
  expect(l.build, label).toBeLessThanOrEqual(1.25);
  for (const c of [l.skin, l.hair, l.top, l.bottom, l.shoes, l.armband, l.vest]) expect(isColor(c), label).toBe(true);
  expect(Number.isInteger(l.hairStyle) && l.hairStyle >= 0 && l.hairStyle <= 7, label).toBe(true);
  expect(typeof l.outfit, label).toBe('string');
  expect(l.outfit.length, label).toBeGreaterThan(0);
  for (const [k, v] of Object.entries(l.extras ?? {})) expect(Number.isFinite(v), `${label} extras.${k}`).toBe(true);
  expect(p.speedWalk, label).toBeGreaterThan(0.9);
  expect(p.speedRun, label).toBeGreaterThan(p.speedWalk);
  expect(p.speedSprint, label).toBeGreaterThan(p.speedRun);
  expect(p.speedSprint, label).toBeLessThan(7);
  for (const a of [p.armorHead, p.armorBody, p.gasProtection]) {
    expect(a, label).toBeGreaterThanOrEqual(0);
    expect(a, label).toBeLessThanOrEqual(1);
  }
  expect(p.health, label).toBe(100);
  for (const s of p.inventory) {
    expect(CONTRACT_ITEMS.indexOf(s.id), `${label} objet ${s.id}`).toBeGreaterThanOrEqual(0);
    expect(s.count, `${label} ${s.id}`).toBeGreaterThan(0);
  }
  expect(new Set(kitIds(p)).size, label).toBe(p.inventory.length);
  if (p.active >= 0) expect(p.inventory[p.active], label).toBeDefined();
}

describe('tous les types de personnes', () => {
  it('chaque PersonKind donne une personne complète, sans écharpe hors autorité', async () => {
    const { ctx } = await startRoles(21);
    for (const kind of ALL_KINDS) {
      for (let i = 0; i < 25; i++) {
        const p = ctx.archetypes.spawn(kind, i, 2 * i);
        const label = `${kind}#${i}`;
        expect(p.kind).toBe(kind);
        checkPerson(p, label);
        // écharpe tricolore : uniquement l'autorité habilitée
        expect(p.look.sash, label).toBe(kind === 'commissaire');
        // matricule et grade : forces de l'ordre seulement
        if (p.faction === 'police') {
          expect(p.rio, label).toMatch(/^\d{7}$/);
          expect(p.rank, label).not.toBeNull();
        } else {
          expect(p.rio, label).toBe('');
          expect(p.rank, label).toBeNull();
          expect(p.look.rankBars, label).toBe(0);
        }
      }
    }
    expect(ctx.people.list.length).toBe(ALL_KINDS.length * 25);
  });

  it('un magasin de personnes qui garderait les objets reçus ne fait pas partager apparence ni dotation', async () => {
    const { ctx } = await startRoles(40);
    const base = ctx.people;
    // magasin de remplacement (autre module) qui adopte tels quels l'apparence et l'inventaire fournis
    ctx.people = {
      get list() { return base.list; },
      get: (id) => base.get(id),
      spawn(init) {
        const p = base.spawn(init);
        if (init.look) p.look = init.look as Person['look'];
        if (init.inventory) p.inventory = init.inventory;
        return p;
      },
      remove: (id) => base.remove(id),
      clear: () => base.clear(),
      queryRadius: (x, z, r, out, filter) => base.queryRadius(x, z, r, out, filter),
      nearest: (x, z, r, filter) => base.nearest(x, z, r, filter),
      countIn: (x, z, r, filter) => base.countIn(x, z, r, filter),
      rebuildIndex: () => base.rebuildIndex(),
    };
    const a = ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' });
    const b = ctx.archetypes.spawn('manifestant', 0, 0, { profile: 'meneur' });
    expect(a.look).not.toBe(b.look);
    expect(a.inventory).not.toBe(b.inventory);
    expect(a.look.outfit).toBe('crs_mo');
    expect(b.look.outfit).not.toBe('crs_mo');
    expect(countOf(a, 'bouclier')).toBe(1);
    expect(countOf(b, 'megaphone')).toBe(1);
    expect(a.inventory[0]).not.toBe(b.inventory[0]);
  });

  it('type inconnu : un passant, sans erreur', async () => {
    const { ctx } = await startRoles(22);
    const p = ctx.archetypes.spawn('extraterrestre' as PersonKind, 0, 0);
    expect(p.look.outfit).toBe('civil');
    expect(p.look.sash).toBe(false);
  });
});

describe('secours', () => {
  it('sapeur-pompier : tenue, casque, marquage dorsal ; porte-lance, secours à victime, chef d’agrès', async () => {
    const { ext } = await startRoles(23);
    const lance = ext.spawnEx('pompier', 0, 0, { variant: 'porte_lance' });
    expect(lance.look.outfit).toBe('pompier');
    expect(lance.look.headgear).toBe('casque_pompier');
    expect(lance.look.backText).toBe('SAPEURS-POMPIERS');
    expect(lance.look.top).toBe(0x1b2440);
    expect(handOf(lance)).toBe('lance_incendie');
    expect(countOf(lance, 'extincteur')).toBe(15);
    const sav = ext.spawnEx('pompier', 0, 0, { variant: 'secours_victime' });
    expect(kitIds(sav)).toEqual(expect.arrayContaining(['trousse_secours', 'serum_physiologique', 'brancard', 'radio']));
    const chef = ext.spawnEx('pompier', 0, 0, { variant: 'chef_agres' });
    expect(kitIds(chef)[0]).toBe('radio');
    expect(lance.armorHead).toBeGreaterThan(0.5);
  });

  it('SAMU : blanc et bleu, « SAMU » dans le dos, matériel de soin', async () => {
    const { ctx, ext } = await startRoles(24);
    const variants = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const p = ctx.archetypes.spawn('samu', 0, 0);
      variants.add(p.look.extras?.variant ?? 0);
      expect(p.look.outfit).toBe('samu');
      expect(p.look.backText).toBe('SAMU');
      expect(p.look.top).toBe(0xf4f4f4);
      expect(p.look.bottom).toBe(0x003da5);
      expect(countOf(p, 'trousse_secours')).toBe(10);
      expect(countOf(p, 'serum_physiologique')).toBe(20);
    }
    expect([...variants].sort()).toEqual([VARIANT.medecin, VARIANT.infirmier, VARIANT.ambulancier]);
    expect(countOf(ext.spawnEx('samu', 0, 0, { variant: 'ambulancier' }), 'brancard')).toBe(1);
  });

  it('street medic : croix, casque, lunettes, sac à dos, sérum physiologique', async () => {
    const { ctx } = await startRoles(25);
    for (let i = 0; i < 20; i++) {
      const p = ctx.archetypes.spawn('street_medic', 0, 0);
      expect(p.look.outfit).toBe('street_medic');
      expect(p.look.headgear).toBe('casque_medic');
      expect(p.look.vest).toBe(0xf5f5f5);
      expect([0xd62828, 0x1d4e89]).toContain(p.look.armband);
      expect(p.look.backpack).toBe(true);
      expect(p.look.extras?.goggles).toBe(1);
      expect(countOf(p, 'serum_physiologique')).toBe(20);
      expect(countOf(p, 'trousse_secours')).toBe(10);
      expect(p.gasProtection).toBeGreaterThan(0);
    }
  });
});

describe('presse et observateurs', () => {
  it('journaliste : photographe, reporter d’images, équipe de direct', async () => {
    const { ctx, ext } = await startRoles(26);
    const photo = ext.spawnEx('journaliste', 0, 0, { variant: 'photographe', unmarked: false });
    expect(handOf(photo)).toBe('appareil_photo');
    expect(countOf(photo, 'appareil_photo')).toBe(24);
    expect(photo.look.outfit).toBe('presse');
    expect(photo.look.headgear).toBe('casque_presse');
    expect(photo.look.backText).toBe('PRESSE');
    expect(photo.look.armband).toBe(0xffffff);
    const jri = ext.spawnEx('journaliste', 0, 0, { variant: 'reporter_images' });
    expect(handOf(jri)).toBe('camera_tv');
    expect(countOf(jri, 'micro')).toBe(1);
    const direct = ext.spawnEx('journaliste', 0, 0, { variant: 'direct' });
    expect(countOf(direct, 'micro')).toBe(1);
    expect(countOf(direct, 'telephone')).toBe(1);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) seen.add(ctx.archetypes.spawn('journaliste', 0, 0).look.extras?.variant ?? 0);
    expect([...seen].sort((a, b) => a - b)).toEqual([VARIANT.photographe, VARIANT.reporter_images, VARIANT.direct]);
  });

  it('un journaliste sans marquage existe : aucun signe, seul son matériel le distingue', async () => {
    const { ctx, ext } = await startRoles(27);
    const bare = ext.spawnEx('journaliste', 0, 0, { unmarked: true, variant: 'photographe' });
    expect(bare.look.outfit).toBe('civil');
    expect(bare.look.backText).toBe('');
    expect(bare.look.armband).toBe(0);
    expect(bare.look.headgear).not.toBe('casque_presse');
    expect(bare.look.extras?.unmarked).toBe(1);
    expect(handOf(bare)).toBe('appareil_photo');
    let unmarked = 0;
    for (let i = 0; i < 200; i++) if (ctx.archetypes.spawn('journaliste', 0, 0).look.extras?.unmarked === 1) unmarked++;
    expect(unmarked).toBeGreaterThan(10);
    expect(unmarked).toBeLessThan(60);
  });

  it('observateur : chasuble blanche siglée, coiffe bleue, téléphone', async () => {
    const { ctx } = await startRoles(28);
    const p = ctx.archetypes.spawn('observateur', 0, 0);
    expect(p.look.outfit).toBe('observateur');
    expect(p.look.vest).toBe(0xf5f5f5);
    expect(p.look.backText).toBe('OBSERVATEUR');
    expect(countOf(p, 'telephone')).toBe(1);
  });
});

describe('civils', () => {
  it('passant, touriste, commerçant, conducteur, personnalité officielle', async () => {
    const { ctx, ext } = await startRoles(29);
    expect(ext.kindLabel('vip')).toBe('Personnalité officielle');
    const vip = ctx.archetypes.spawn('vip', 0, 0);
    expect(vip.look.outfit).toBe('costume');
    expect(vip.look.top).toBe(vip.look.bottom);
    expect(vip.look.sash).toBe(false);
    const cafe = ext.spawnEx('commercant', 0, 0, { variant: 'cafe' });
    expect(cafe.look.vest).not.toBe(0);
    expect(cafe.look.extras?.variant).toBe(VARIANT.cafe);
    let cameras = 0;
    let packs = 0;
    for (let i = 0; i < 100; i++) {
      const t = ctx.archetypes.spawn('touriste', 0, 0);
      if (countOf(t, 'appareil_photo') > 0) cameras++;
      if (t.look.backpack) packs++;
      expect(t.look.outfit).toBe('civil');
    }
    expect(cameras).toBeGreaterThan(15);
    expect(packs).toBeGreaterThan(40);
    const conducteur = ctx.archetypes.spawn('conducteur', 0, 0);
    expect(conducteur.look.backpack).toBe(false);
  });

  it('les personnes âgées marchent et courent moins vite ; les enfants aussi', async () => {
    const { ctx, ext } = await startRoles(30);
    const jeune = ctx.archetypes.spawn('passant', 0, 0, { look: { extras: { age: 25 } }, seed: 5 });
    const vieux = ctx.archetypes.spawn('passant', 0, 0, { look: { extras: { age: 80 } }, seed: 5 });
    expect(vieux.speedSprint).toBeLessThan(jeune.speedSprint * 0.75);
    expect(vieux.speedWalk).toBeLessThan(jeune.speedWalk);
    expect(ext.traits(vieux.id)?.age).toBe(80);
    const enfant = ext.spawnEx('manifestant', 0, 0, { child: true, seed: 5 });
    expect(enfant.speedSprint).toBeLessThan(jeune.speedSprint);
  });
});

describe('manifestants', () => {
  it('chaque profil × chaque famille visuelle donne un manifestant cohérent', async () => {
    const { ext, causes } = await startRoles(31, { extra: { cause: 'retraites' } });
    const cause = causes.get('retraites')!;
    for (const family of FAMILY_IDS) {
      for (const profile of ALL_PROFILES) {
        for (let i = 0; i < 6; i++) {
          const p = ext.spawnEx('manifestant', 0, 0, { profile, family });
          const label = `${family}/${profile}#${i}`;
          checkPerson(p, label);
          expect(p.profile, label).toBe(profile);
          expect(ext.familyOf(p), label).toBe(family);
          expect(ext.causeOf(p), label).toBe(cause.index);
          const e = p.look.extras!;
          expect(e.signText, label).toBeGreaterThanOrEqual(cause.signBase);
          expect(e.signText, label).toBeLessThan(cause.signBase + cause.signCount);
          expect(p.look.sash, label).toBe(false);
          expect(p.rank, label).toBeNull();
          // les violents arrivent les mains vides : ni pavé, ni bouteille, ni butin en dotation
          expect(countOf(p, 'pave') + countOf(p, 'bouteille') + countOf(p, 'butin'), label).toBe(0);
          // aucun matériel de police
          for (const id of ['bouclier', 'tonfa', 'gazeuse', 'lbd40', 'lanceur_cougar', 'pistolet', 'menottes', 'radio'] as const) {
            expect(countOf(p, id), `${label} ${id}`).toBe(0);
          }
          if (profile === 'meneur') {
            expect(countOf(p, 'megaphone'), label).toBe(1);
            expect(handOf(p), label).toBe('megaphone');
          }
          if (profile === 'service_ordre' && family !== 'black_bloc') {
            expect(p.look.armband, label).toBe(0xc1121f);
            expect(countOf(p, 'pancarte') + countOf(p, 'drapeau'), label).toBe(0);
          }
          if (profile === 'famille' && family !== 'black_bloc') expect(p.look.faceCover, label).toBe(false);
          if (profile !== 'radical' && profile !== 'pilleur') {
            for (const id of ['marteau', 'barre', 'mortier', 'molotov', 'bombe_peinture'] as const) {
              expect(countOf(p, id), `${label} ${id}`).toBe(0);
            }
          }
        }
      }
    }
  });

  it('familles visuelles reconnaissables', async () => {
    const { ext, causes } = await startRoles(32, { extra: { cause: 'retraites' } });
    const spawn = (family: VisualFamily, seed: number) => ext.spawnEx('manifestant', 0, 0, { family, profile: 'pacifique', seed });
    const orgColors = causes.get('retraites')!.orgs.map((o) => o.color);
    let annotated = 0;
    for (let s = 1; s <= 30; s++) {
      const gj = spawn('gilets_jaunes', s);
      expect(gj.look.outfit).toBe('gilet_fluo');
      expect(gj.look.vest).toBe(0xdfff00);
      if (gj.look.extras?.backNote === 1) annotated++;
      const syn = spawn('syndical', s);
      expect(syn.look.outfit).toBe('syndical');
      // chasuble aux couleurs d'une organisation fictive qui appelle à manifester
      expect(orgColors).toContain(syn.look.vest);
      expect(causes.org(syn.look.extras!.org!)?.color).toBe(syn.look.vest);
      const soignant = spawn('soignants', s);
      expect([0xf5f5f5, 0xa9cce3]).toContain(soignant.look.top);
      const agri = spawn('agriculteurs', s);
      expect(agri.look.top).toBe(agri.look.bottom);
      expect([0x4b6b3c, 0x2f4468]).toContain(agri.look.top);
      const retraite = spawn('retraites', s);
      expect(ext.traits(retraite.id)!.age).toBeGreaterThanOrEqual(60);
      const etudiant = spawn('etudiants', s);
      expect(ext.traits(etudiant.id)!.age).toBeLessThanOrEqual(27);
      expect(spawn('familles', s).look.faceCover).toBe(false);
    }
    // gilets annotés au dos : une bonne part, pas tous
    expect(annotated).toBeGreaterThan(5);
    expect(annotated).toBeLessThan(25);
  });

  it('black bloc : tout en noir, capuche, visage masqué, lunettes, gants, sac à dos', async () => {
    const { ext } = await startRoles(33);
    let goggles = 0;
    let gloves = 0;
    let umbrellas = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const p = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'radical' });
      expect(p.look.outfit).toBe('black_bloc');
      expect(['capuche', 'cagoule', 'casque_moto']).toContain(p.look.headgear);
      expect(p.look.faceCover).toBe(true);
      expect(p.look.backpack).toBe(true);
      expect(p.look.top).toBe(0x0b0b0d);
      expect([0x0b0b0d, 0x1c1c1f]).toContain(p.look.bottom);
      expect(p.look.vest).toBe(0);
      expect(p.look.armband).toBe(0);
      expect(ext.inBlocAttire(p)).toBe(true);
      expect(p.gasProtection).toBeGreaterThanOrEqual(0.3);
      // jamais de pancarte ni de drapeau dans le bloc
      expect(countOf(p, 'pancarte') + countOf(p, 'drapeau')).toBe(0);
      if (p.look.extras?.goggles) goggles++;
      if (p.look.extras?.gloves) gloves++;
      if (countOf(p, 'parapluie') > 0) umbrellas++;
    }
    expect(goggles).toBeGreaterThan(n * 0.7);
    expect(gloves).toBeGreaterThan(n * 0.7);
    // un parapluie pour cinq environ
    expect(umbrellas).toBeGreaterThan(n * 0.1);
    expect(umbrellas).toBeLessThan(n * 0.32);
  });

  it('le bloc avant de se changer : tenue de ville sombre, le noir est dans le sac', async () => {
    const { ext } = await startRoles(34);
    const p = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'radical', bloc: false });
    expect(p.look.outfit).toBe('civil');
    expect(p.look.faceCover).toBe(false);
    expect(p.look.backpack).toBe(true);
    expect(ext.inBlocAttire(p)).toBe(false);
  });

  it('banderole renforcée et parapluie imposés ; même banderole pour tous les porteurs', async () => {
    const { ext, causes } = await startRoles(35, { extra: { cause: 'climat' } });
    const texts = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const p = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'radical', carry: 'banderole' });
      expect(handOf(p)).toBe('banderole');
      texts.add(causes.bannerText(p.look.extras!.bannerText!));
      expect(causes.heldText(p)).toBe(causes.bannerText(p.look.extras!.bannerText!));
    }
    expect(texts.size).toBe(1);
    expect([...texts][0]!.length).toBeGreaterThan(5);
    const tete = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const p = ext.spawnEx('manifestant', 0, 0, { family: 'climat', profile: 'militant', carry: 'banderole' });
      tete.add(causes.heldText(p) ?? '');
    }
    expect(tete.size).toBe(1);
    expect(causes.get('climat')!.banners).toContain([...tete][0]);
    expect([...tete][0]).not.toBe([...texts][0]);
    const parapluie = ext.spawnEx('manifestant', 0, 0, { family: 'black_bloc', profile: 'radical', carry: 'parapluie' });
    expect(handOf(parapluie)).toBe('parapluie');
  });

  it('pancartes : une pour quatre marcheurs environ, avec un texte de la cause', async () => {
    const { ext, causes } = await startRoles(36, { extra: { cause: 'hopital' } });
    const cause = causes.get('hopital')!;
    let signs = 0;
    let flags = 0;
    const n = 400;
    const texts = new Set<string>();
    for (let i = 0; i < n; i++) {
      const p = ext.spawnEx('manifestant', 0, 0, { profile: 'pacifique' });
      if (countOf(p, 'pancarte') > 0) {
        signs++;
        expect(handOf(p)).toBe('pancarte');
        const text = causes.heldText(p)!;
        expect(cause.signs).toContain(text);
        texts.add(text);
      } else {
        expect(causes.heldText(p)).toBeNull();
      }
      if (countOf(p, 'drapeau') > 0) flags++;
    }
    expect(signs / n).toBeGreaterThan(0.15);
    expect(signs / n).toBeLessThan(0.4);
    expect(flags).toBeGreaterThan(0);
    expect(texts.size).toBeGreaterThan(15);
  });

  it('enfant accompagné : petite taille, profil « famille », aucune dotation dangereuse', async () => {
    const { ext } = await startRoles(37);
    for (let i = 0; i < 30; i++) {
      const p = ext.spawnEx('manifestant', 0, 0, { child: true });
      expect(p.look.height).toBeLessThan(1.5);
      expect(p.profile).toBe('famille');
      expect(ext.familyOf(p)).toBe('familles');
      expect(p.look.extras?.child).toBe(1);
      expect(p.look.faceCover).toBe(false);
      expect(p.inventory.length).toBe(0);
      expect(ext.traits(p.id)!.age).toBeLessThan(15);
      // jamais de tenue du bloc pour un enfant
      expect(ext.setBlocAttire(p, true)).toBe(false);
    }
  });

  it('sans précision, profil et famille suivent la composition de la cause du jour', async () => {
    const { ctx, ext } = await startRoles(38, { extra: { cause: 'carburants' } });
    const fam: Record<string, number> = {};
    const prof: Record<string, number> = {};
    const n = 600;
    for (let i = 0; i < n; i++) {
      const p = ctx.archetypes.spawn('manifestant', 0, 0);
      fam[ext.familyOf(p)] = (fam[ext.familyOf(p)] ?? 0) + 1;
      prof[p.profile ?? ''] = (prof[p.profile ?? ''] ?? 0) + 1;
    }
    // prix des carburants : gilets jaunes majoritaires, samedi sans organisateur (pas de service d'ordre)
    expect(fam.gilets_jaunes! / n).toBeGreaterThan(0.45);
    expect(fam.gilets_jaunes! / n).toBeLessThan(0.7);
    expect(prof.pacifique! / n).toBeGreaterThan(0.5);
    expect(prof.service_ordre ?? 0).toBe(0);
    expect((prof.opportuniste ?? 0) / n).toBeGreaterThan(0.12);
  });

  it('la composition de la page d’accueil (SessionConfig.extra.composition) guide les familles', async () => {
    const composition = { familles: 0, gilets_jaunes: 0, syndical: 0.5, etudiants: 0, climat: 0.5, soignants: 0, agriculteurs: 0, retraites: 0, black_bloc: 0 };
    const { ctx, ext } = await startRoles(39, { extra: { cause: 'climat', composition } });
    const fam: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const f = ext.familyOf(ctx.archetypes.spawn('manifestant', 0, 0, { profile: 'pacifique' }));
      fam[f] = (fam[f] ?? 0) + 1;
    }
    expect(Object.keys(fam).sort()).toEqual(['climat', 'syndical']);
    expect(Math.abs(fam.climat! - fam.syndical!)).toBeLessThan(140);
  });
});
