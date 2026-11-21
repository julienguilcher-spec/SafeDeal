// Archétypes — déterminisme par graine, diversité des apparences, noms fictifs plausibles.
import { describe, expect, it } from 'vitest';
import type { PersonKind } from '@/core/contracts';
import { createRng } from '@/core/rng';
import {
  EXCLUDED_SURNAMES, FIRST_NAME_POOLS, foldName, makeName, RioRegistry, SURNAMES,
} from '@/sim/roles/archetypes/names';
import { ALL_KINDS, ALL_POSTES, ALL_PROFILES, appearanceKey, snapshot, startRoles } from '@/sim/roles/archetypes/testkit';
import { FAMILY_IDS } from '@/sim/roles';

describe('déterminisme', () => {
  it('même graine et mêmes options → même personne, dans deux parties différentes', async () => {
    const a = await startRoles(71, { extra: { cause: 'retraites', compagnie: 74 } });
    const b = await startRoles(71, { extra: { cause: 'retraites', compagnie: 74 } });
    // des créations intercalées dans une seule des deux parties ne changent rien
    for (let i = 0; i < 17; i++) b.ctx.archetypes.spawn('manifestant', 0, 0);
    let seed = 1000;
    for (const kind of ALL_KINDS) {
      for (let i = 0; i < 5; i++) {
        seed++;
        expect(snapshot(a.ctx.archetypes.spawn(kind, 1, 2, { seed })), `${kind} graine ${seed}`)
          .toEqual(snapshot(b.ctx.archetypes.spawn(kind, 1, 2, { seed })));
      }
    }
    for (const poste of ALL_POSTES) {
      seed++;
      expect(snapshot(a.ctx.archetypes.spawn('crs', 0, 0, { seed, poste }))).toEqual(snapshot(b.ctx.archetypes.spawn('crs', 0, 0, { seed, poste })));
    }
    for (const profile of ALL_PROFILES) {
      for (const family of FAMILY_IDS) {
        seed++;
        expect(snapshot(a.ext.spawnEx('manifestant', 0, 0, { seed, profile, family })), `${family}/${profile}`)
          .toEqual(snapshot(b.ext.spawnEx('manifestant', 0, 0, { seed, profile, family })));
      }
    }
  });

  it('sans graine : la graine de session fixe toute la suite des créations', async () => {
    const run = async (sessionSeed: number) => {
      const r = await startRoles(sessionSeed);
      const out: unknown[] = [];
      const kinds: PersonKind[] = ['crs', 'manifestant', 'journaliste', 'manifestant', 'passant', 'manifestant', 'bravm'];
      for (let i = 0; i < 60; i++) out.push(snapshot(r.ctx.archetypes.spawn(kinds[i % kinds.length]!, i, 0)));
      return out;
    };
    const first = await run(5);
    expect(await run(5)).toEqual(first);
    expect(await run(6)).not.toEqual(first);
  });

  it('rejouer la même session redonne les mêmes personnes', async () => {
    const r = await startRoles(8);
    const first: unknown[] = [];
    for (let i = 0; i < 20; i++) first.push(snapshot(r.ctx.archetypes.spawn('manifestant', 0, 0)));
    await r.t.start();
    const second: unknown[] = [];
    for (let i = 0; i < 20; i++) second.push(snapshot(r.ctx.archetypes.spawn('manifestant', 0, 0)));
    expect(second).toEqual(first);
  });

  it('des graines différentes donnent des personnes différentes', async () => {
    const { ctx } = await startRoles(72);
    const a = ctx.archetypes.spawn('manifestant', 0, 0, { seed: 1, profile: 'pacifique' });
    const b = ctx.archetypes.spawn('manifestant', 0, 0, { seed: 2, profile: 'pacifique' });
    expect(snapshot(a)).not.toEqual(snapshot(b));
  });

  it('changer de profil ne change ni le corps ni les vêtements de ville', async () => {
    const { ext } = await startRoles(73);
    const a = ext.spawnEx('manifestant', 0, 0, { seed: 77, profile: 'pacifique', family: 'divers' });
    const b = ext.spawnEx('manifestant', 0, 0, { seed: 77, profile: 'militant', family: 'divers' });
    for (const k of ['skin', 'hair', 'hairStyle', 'top', 'bottom', 'shoes'] as const) expect(b.look[k], k).toBe(a.look[k]);
    expect(b.look.extras?.sex).toBe(a.look.extras?.sex);
  });
});

describe('diversité', () => {
  it('100 manifestants : au moins 60 apparences distinctes (hors taille et carrure)', async () => {
    const { ctx, causes } = await startRoles(74, { extra: { cause: 'pouvoir_achat' } });
    const looks = new Set<string>();
    const names = new Set<string>();
    const signs = new Set<number>();
    const heights: number[] = [];
    for (let i = 0; i < 100; i++) {
      const p = ctx.archetypes.spawn('manifestant', 0, 0);
      looks.add(appearanceKey(p));
      names.add(p.name);
      signs.add(p.look.extras!.signText!);
      heights.push(p.look.height);
    }
    console.info(`[roles] 100 manifestants : ${looks.size} apparences distinctes, ${names.size} noms, ${signs.size} textes de pancarte`);
    expect(looks.size).toBeGreaterThanOrEqual(60);
    expect(names.size).toBeGreaterThanOrEqual(90);
    expect(signs.size).toBeGreaterThanOrEqual(20);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.2);
    for (const s of signs) expect(causes.causeOfSign(s)?.id).toBe('pouvoir_achat');
  });

  it('une compagnie n’est pas faite de clones : teints, coiffures, tailles et âges variés sous l’uniforme', async () => {
    const { ctx, ext } = await startRoles(75);
    const skins = new Set<number>();
    const ages = new Set<number>();
    const names = new Set<string>();
    let women = 0;
    let min = 9;
    let max = 0;
    for (let i = 0; i < 70; i++) {
      const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' });
      skins.add(p.look.skin);
      ages.add(ext.traits(p.id)!.age);
      names.add(p.name);
      if (ext.traits(p.id)!.sex === 1) women++;
      min = Math.min(min, p.look.height);
      max = Math.max(max, p.look.height);
      // un uniforme reste un uniforme
      expect(p.look.top).toBe(0x1a2238);
    }
    expect(skins.size).toBeGreaterThanOrEqual(4);
    expect(ages.size).toBeGreaterThanOrEqual(12);
    expect(names.size).toBeGreaterThanOrEqual(65);
    expect(max - min).toBeGreaterThan(0.15);
    expect(women).toBeGreaterThan(0);
    expect(women).toBeLessThan(25);
  });

  it('répartitions plausibles : sexes, tailles, âges', async () => {
    const { ctx, ext } = await startRoles(76, { extra: { cause: 'services_publics' } });
    let women = 0;
    let heightSum = 0;
    let ageSum = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      const p = ctx.archetypes.spawn('manifestant', 0, 0, { profile: 'pacifique' });
      const t = ext.traits(p.id)!;
      if (t.sex === 1) women++;
      heightSum += p.look.height;
      ageSum += t.age;
      expect(t.age).toBeGreaterThanOrEqual(16);
      expect(t.age).toBeLessThanOrEqual(84);
      expect(t.fitness).toBeGreaterThan(0.75);
      expect(t.fitness).toBeLessThan(1.2);
    }
    expect(women / n).toBeGreaterThan(0.36);
    expect(women / n).toBeLessThan(0.6);
    expect(heightSum / n).toBeGreaterThan(1.66);
    expect(heightSum / n).toBeLessThan(1.75);
    expect(ageSum / n).toBeGreaterThan(35);
    expect(ageSum / n).toBeLessThan(55);
  });
});

describe('noms et matricules', () => {
  it('prénoms et noms variés, bien formés, adaptés à l’âge', () => {
    const rng = createRng(4);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const sex = i % 2;
      const age = 8 + (i % 80);
      const name = makeName(rng, sex, age);
      expect(name).toMatch(/^\p{Lu}[\p{L}'’-]+ \p{Lu}[\p{L}'’ -]+$/u);
      seen.add(name);
    }
    expect(seen.size).toBeGreaterThan(1700);
    expect(SURNAMES.length).toBeGreaterThanOrEqual(200);
    expect(new Set(SURNAMES).size).toBe(SURNAMES.length);
    for (const pool of FIRST_NAME_POOLS) {
      expect(pool.length).toBeGreaterThanOrEqual(20);
      expect(new Set(pool).size).toBe(pool.length);
    }
    // un enfant ne porte pas un prénom de retraité
    const child = new Set<string>();
    for (let i = 0; i < 200; i++) child.add(makeName(rng, 0, 9).split(' ')[0]!);
    expect(child.has('Jean-Pierre')).toBe(false);
    expect(child.has('Marcel')).toBe(false);
  });

  it('aucun nom de famille attaché à une personnalité publique', () => {
    const excluded = new Set(EXCLUDED_SURNAMES);
    for (const s of SURNAMES) expect(excluded.has(foldName(s)), s).toBe(false);
    expect(EXCLUDED_SURNAMES.length).toBeGreaterThan(50);
  });

  it('matricules à sept chiffres, uniques, même en cas de collision', () => {
    const reg = new RioRegistry();
    const fixed = { next: () => 0.5, range: () => 0, int: () => 4500000, chance: () => false, pick: <T>(a: readonly T[]) => a[0]!, fork: () => fixed };
    const a = reg.next(fixed);
    const b = reg.next(fixed);
    const c = reg.next(fixed);
    expect(a).toBe('5500000');
    expect(new Set([a, b, c]).size).toBe(3);
    for (const r of [a, b, c]) expect(r).toMatch(/^[1-9]\d{6}$/);
    expect(reg.claim(a)).toBe(false);
    expect(reg.claim('1234567')).toBe(true);
    reg.clear();
    expect(reg.claim(a)).toBe(true);
  });
});
