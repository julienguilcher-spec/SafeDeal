// Archétypes — aide au peuplement : composition d'une foule (proportions respectées), tiers du
// cortège, postes d'une unité de police conformes à la bible (§E.1 et §E.2).
import { describe, expect, it } from 'vitest';
import type { PolicePoste, ProtestProfile } from '@/core/contracts';
import { createRng } from '@/core/rng';
import { FAMILY_IDS, PROFILE_IDS } from '@/sim/roles';
import type { CrowdSlot, UnitSlot, UnitType, VisualFamily } from '@/sim/roles';
import { CAUSES } from '@/sim/roles/archetypes/causes';
import { SCENARIO_IDS, SCENARIO_PROFILES } from '@/sim/roles/archetypes/mix';
import { AFFINITY } from '@/sim/roles/archetypes/protest';
import { countOf, startRoles } from '@/sim/roles/archetypes/testkit';

function tally(slots: readonly CrowdSlot[]): { fam: Record<string, number>; prof: Record<string, number> } {
  const fam: Record<string, number> = {};
  const prof: Record<string, number> = {};
  for (const s of slots) {
    fam[s.family] = (fam[s.family] ?? 0) + 1;
    prof[s.profile ?? ''] = (prof[s.profile ?? ''] ?? 0) + 1;
  }
  return { fam, prof };
}

function count(slots: readonly UnitSlot[], poste: PolicePoste): number {
  return slots.filter((s) => s.poste === poste).length;
}

describe('composition d’une foule', () => {
  it('respecte les parts des familles (à une personne près) et des profils, pour chaque cause', async () => {
    const { helper } = await startRoles(91);
    let worst = 0;
    for (const cause of CAUSES.list) {
      for (const n of [60, 300, 1500]) {
        const slots = helper.crowd(cause.id, n, null, createRng(n));
        expect(slots.length, `${cause.id} ${n}`).toBe(n);
        const { fam, prof } = tally(slots);
        for (const f of FAMILY_IDS) {
          const want = (cause.mix.families[f] ?? 0) * n;
          expect(Math.abs((fam[f] ?? 0) - want), `${cause.id} ${n} famille ${f}`).toBeLessThan(1);
        }
        for (const p of PROFILE_IDS) {
          const want = cause.mix.profiles[p] * n;
          const gap = Math.abs((prof[p] ?? 0) - want);
          worst = Math.max(worst, gap / n);
          // à 1 % de l'effectif près (et jamais moins d'une personne et demie de marge)
          expect(gap, `${cause.id} ${n} profil ${p} : ${prof[p] ?? 0} pour ${want.toFixed(1)}`).toBeLessThanOrEqual(Math.max(1.5, n * 0.01));
        }
        for (const s of slots) {
          expect(s.kind).toBe('manifestant');
          // aucune combinaison interdite (pas de radical chez les familles, pas de service d'ordre dans le bloc)
          expect(AFFINITY[s.family][PROFILE_IDS.indexOf(s.profile as ProtestProfile)], `${s.family}/${s.profile}`).toBeGreaterThan(0);
        }
      }
    }
    console.info(`[roles] écart maximal sur la part d'un profil : ${(worst * 100).toFixed(2)} % de l'effectif`);
  });

  it('accepte la composition de la page d’accueil ; un bloc est fait de radicaux', async () => {
    const { helper } = await startRoles(92);
    const composition = { familles: 0.1, gilets_jaunes: 0.1, syndical: 0.4, etudiants: 0.15, climat: 0.05, soignants: 0.05, agriculteurs: 0, retraites: 0.05, black_bloc: 0.1 };
    const slots = helper.crowd('retraites', 400, composition);
    const { fam } = tally(slots);
    expect(fam.syndical).toBe(160);
    expect(fam.black_bloc).toBe(40);
    expect(fam.familles).toBe(40);
    expect(fam.agriculteurs).toBeUndefined();
    expect(fam.divers).toBeUndefined();
    const bloc = slots.filter((s) => s.family === 'black_bloc');
    expect(bloc.filter((s) => s.profile === 'radical').length).toBeGreaterThanOrEqual(26);
    expect(bloc.every((s) => s.profile === 'radical' || s.profile === 'meneur' || s.profile === 'opportuniste' || s.profile === 'pilleur')).toBe(true);
    const familles = slots.filter((s) => s.family === 'familles');
    expect(familles.filter((s) => s.profile === 'famille').length).toBeGreaterThanOrEqual(22);
    // sans bloc, presque aucun radical
    const calm = helper.crowd('retraites', 400, { ...composition, black_bloc: 0 });
    expect(calm.filter((s) => s.family === 'black_bloc').length).toBe(0);
    expect(calm.filter((s) => s.profile === 'radical').length).toBeLessThanOrEqual(10);
  });

  it('type de journée : les profils suivent la table du dossier 03', async () => {
    const { helper } = await startRoles(93);
    for (const scenario of SCENARIO_IDS) {
      const n = 1000;
      const slots = helper.crowd('pouvoir_achat', n, { scenario });
      const { prof } = tally(slots);
      const want = SCENARIO_PROFILES[scenario];
      // les familles de la cause ne permettent pas toujours d'atteindre exactement la table : marge de 4 points
      for (const p of PROFILE_IDS) expect(Math.abs((prof[p] ?? 0) / n - want[p]), `${scenario} ${p}`).toBeLessThan(0.04);
    }
    const calme = tally(helper.crowd('climat', 1000, { scenario: 'marche_calme' })).prof;
    const samedi = tally(helper.crowd('climat', 1000, { scenario: 'samedi_sans_organisateur' })).prof;
    expect(samedi.opportuniste!).toBeGreaterThan((calme.opportuniste ?? 0) * 3);
  });

  it('parts de profils imposées ; propension à dégénérer : plus de suiveurs et de radicaux', async () => {
    const { helper } = await startRoles(94);
    const forced = tally(helper.crowd('libertes', 200, { profiles: { pacifique: 0.5, opportuniste: 0.5 } })).prof;
    expect(forced.pacifique! + forced.opportuniste!).toBe(200);
    expect(Math.abs(forced.pacifique! - 100)).toBeLessThanOrEqual(12);
    const calm = tally(helper.crowd('libertes', 1000, { volatility: 0 })).prof;
    const hot = tally(helper.crowd('libertes', 1000, { volatility: 1 })).prof;
    expect(hot.radical!).toBeGreaterThan(calm.radical!);
    expect(hot.pacifique!).toBeLessThan(calm.pacifique!);
  });

  it('ordre du cortège, banderole de tête, service d’ordre et meneur devant, enfants chez les familles', async () => {
    const { helper } = await startRoles(95);
    const slots = helper.crowd('retraites', 500);
    const first = (f: VisualFamily) => slots.findIndex((s) => s.family === f);
    // précortège et bloc devant, cortège syndical derrière, familles en queue
    expect(first('gilets_jaunes')).toBeLessThan(first('black_bloc'));
    expect(first('black_bloc')).toBeLessThan(first('syndical'));
    expect(first('syndical')).toBeLessThan(first('retraites'));
    expect(first('retraites')).toBeLessThan(first('familles'));
    const banner = slots.filter((s) => s.carry === 'banderole');
    const head = banner.filter((s) => s.family === 'syndical');
    expect(head.length).toBe(10);
    // les porteurs ouvrent le cortège syndical, suivis du service d'ordre
    const start = first('syndical');
    for (let i = 0; i < head.length; i++) expect(slots[start + i]!.carry).toBe('banderole');
    expect(slots[start + head.length]!.profile).toBe('service_ordre');
    const blocBanner = banner.filter((s) => s.family === 'black_bloc');
    expect(blocBanner.length).toBeGreaterThanOrEqual(3);
    expect(blocBanner.every((s) => s.profile === 'radical')).toBe(true);
    const kids = slots.filter((s) => s.child);
    expect(kids.length).toBeGreaterThan(0);
    expect(kids.every((s) => s.family === 'familles' && s.profile === 'famille')).toBe(true);
    expect(helper.crowd('retraites', 500, { children: 0 }).filter((s) => s.child).length).toBe(0);
    expect(helper.crowd('retraites', 500, { banners: false }).filter((s) => s.carry).length).toBe(0);
    // toujours quelqu'un au mégaphone, même dans un petit cortège
    expect(helper.crowd('climat', 30).filter((s) => s.profile === 'meneur').length).toBeGreaterThanOrEqual(1);
  });

  it('cortège syndical : un bloc par organisation, chasubles assorties ; service d’ordre plafonné', async () => {
    const { helper, causes } = await startRoles(99, { extra: { cause: 'retraites' } });
    const cause = causes.get('retraites')!;
    const slots = helper.crowd('retraites', 600);
    const syndical = slots.filter((s) => s.family === 'syndical');
    expect(syndical.every((s) => s.org !== undefined)).toBe(true);
    expect(slots.filter((s) => s.family !== 'syndical').every((s) => s.org === undefined)).toBe(true);
    const orgs = syndical.map((s) => s.org!);
    // deux organisations syndicales appellent : deux blocs contigus, le premier ouvrant le cortège
    const distinct = [...new Set(orgs)];
    expect(distinct.length).toBe(2);
    for (const o of distinct) expect(['syndicat', 'intersyndicale']).toContain(causes.org(o)!.kind);
    let changes = 0;
    for (let i = 1; i < orgs.length; i++) if (orgs[i] !== orgs[i - 1]) changes++;
    expect(changes).toBe(1);
    expect(orgs[0]).toBe(cause.orgBase);
    const first = orgs.filter((o) => o === orgs[0]).length / orgs.length;
    expect(first).toBeGreaterThan(0.5);
    expect(first).toBeLessThan(0.7);
    // les personnes créées portent la chasuble de leur bloc
    const a = helper.spawnSlot(syndical[0]!, 0, 0);
    const b = helper.spawnSlot(syndical[syndical.length - 1]!, 0, 0);
    expect(a.look.vest).toBe(causes.org(orgs[0]!)!.color);
    expect(b.look.vest).toBe(causes.org(orgs[orgs.length - 1]!)!.color);
    expect(a.look.vest).not.toBe(b.look.vest);
    // jamais plus de 200 personnes au service d'ordre, même pour un très grand cortège
    const huge = helper.crowd('retraites', 12000, { profiles: { pacifique: 0.5, militant: 0.3, service_ordre: 0.2 } });
    expect(huge.length).toBe(12000);
    expect(huge.filter((s) => s.profile === 'service_ordre').length).toBeLessThanOrEqual(200);
  });

  it('déterministe pour un même générateur ; effectifs invalides sans effet', async () => {
    const { helper } = await startRoles(96);
    const a = helper.crowd('logement', 250, null, createRng(3));
    const b = helper.crowd('logement', 250, null, createRng(3));
    const c = helper.crowd('logement', 250, null, createRng(4));
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
    expect(tally(c)).toEqual(tally(a));
    expect(helper.crowd('logement', 0)).toEqual([]);
    expect(helper.crowd('logement', -5)).toEqual([]);
    expect(helper.crowd('logement', Number.NaN)).toEqual([]);
    expect(helper.crowd('logement', 7.9).length).toBe(7);
    // cause inconnue : celle du jour
    expect(helper.crowd('inconnue', 10).length).toBe(10);
  });

  it('spawnSlot() crée les personnes d’une foule conforme', async () => {
    const { helper, ext, causes, ctx } = await startRoles(97, { extra: { cause: 'hopital' } });
    const slots = helper.crowd('hopital', 200);
    let banners = 0;
    slots.forEach((slot, i) => {
      const p = helper.spawnSlot(slot, i % 20, Math.floor(i / 20));
      expect(p.profile).toBe(slot.profile);
      expect(ext.familyOf(p)).toBe(slot.family);
      expect(causes.list[ext.causeOf(p)]!.id).toBe('hopital');
      if (slot.child) expect(p.look.height).toBeLessThan(1.5);
      else expect(p.look.height).toBeGreaterThanOrEqual(1.5);
      if (slot.carry === 'banderole') {
        banners++;
        expect(countOf(p, 'banderole')).toBe(1);
      }
    });
    expect(banners).toBeGreaterThan(3);
    expect(ctx.people.list.length).toBe(200);
    const blouses = ctx.people.list.filter((p) => ext.familyOf(p) === 'soignants').length;
    expect(blouses).toBe(100);
  });

  it('tiers du cortège : journalistes, observateurs et street medics selon le type de journée', async () => {
    const { helper, ctx } = await startRoles(98);
    const by = (slots: CrowdSlot[], kind: string) => slots.filter((s) => s.kind === kind).length;
    const tendue = helper.bystanders(1000, 'journee_tendue');
    expect(by(tendue, 'journaliste')).toBe(8);
    expect(by(tendue, 'observateur')).toBe(3);
    expect(by(tendue, 'street_medic')).toBe(6);
    const match = helper.bystanders(1000, 'soir_de_match');
    expect(by(match, 'journaliste')).toBe(3);
    expect(by(match, 'observateur') + by(match, 'street_medic')).toBe(0);
    // petit cortège : au moins un photographe ; observateurs et street medics jamais seuls
    const small = helper.bystanders(300, 'marche_calme');
    expect(by(small, 'journaliste')).toBeGreaterThanOrEqual(1);
    expect(by(small, 'street_medic')).not.toBe(1);
    expect(by(small, 'observateur')).not.toBe(1);
    expect(helper.bystanders(0)).toEqual([]);
    for (const s of tendue) {
      const p = helper.spawnSlot(s, 0, 0);
      expect(p.kind).toBe(s.kind);
      expect(p.profile).toBeNull();
    }
    expect(ctx.people.list.length).toBe(tendue.length);
  });
});

describe('unités de police', () => {
  it('section de 16 : groupes A (appui), B (intervention), C (commandement)', async () => {
    const { helper } = await startRoles(101);
    const section = helper.policeUnit('section', { section: 3 });
    expect(section.length).toBe(16);
    const a = section.filter((s) => s.group === 'A');
    const b = section.filter((s) => s.group === 'B');
    const c = section.filter((s) => s.group === 'C');
    expect([a.length, b.length, c.length]).toEqual([6, 6, 4]);
    // A : chef de groupe, 3 boucliers, 1 lanceur, 1 extincteur
    expect([count(a, 'chef_groupe'), count(a, 'bouclier'), count(a, 'lanceur'), count(a, 'extincteur')]).toEqual([1, 3, 1, 1]);
    // B : chef de groupe, 2 boucliers, 1 LBD, 2 interpellateurs
    expect([count(b, 'chef_groupe'), count(b, 'bouclier'), count(b, 'lbd'), count(b, 'interpellation')]).toEqual([1, 2, 1, 2]);
    // C : chef de section, radio, secouriste-vidéo, lanceur de réserve
    expect([count(c, 'chef_section'), count(c, 'operateur'), count(c, 'lanceur')]).toEqual([1, 2, 1]);
    expect(c.map((s) => s.variant).filter(Boolean).sort()).toEqual(['radio', 'secouriste']);
    expect(section.every((s) => s.kind === 'crs' && s.section === 3)).toBe(true);
    expect(section.filter((s) => s.leads === 'section').length).toBe(1);
    expect(section.filter((s) => s.leads === 'groupe').length).toBe(2);
    expect(section.find((s) => s.poste === 'chef_groupe')!.rank).toBe('brigadier_chef');
    expect(section.find((s) => s.poste === 'chef_section')!.rank).toBe('major');
    expect(section.every((s) => s.label.length > 3)).toBe(true);
    // un seul tireur de LBD par section, deux lanceurs
    expect(count(section, 'lbd')).toBe(1);
    expect(count(section, 'lanceur')).toBe(2);
    // avec les conducteurs : un fourgon par groupe
    expect(helper.policeUnit('section', { drivers: true }).length).toBe(19);
  });

  it('effectifs de la bible : groupe 6, demi-compagnie 32, compagnie 70, peloton 16, escadron 72, BRAV-M 36', async () => {
    const { helper } = await startRoles(102);
    const size: Partial<Record<UnitType, number>> = {
      groupe_appui: 6, groupe_intervention: 6, groupe_commandement: 4, section: 16, demi_compagnie: 32, compagnie: 70,
      peloton_gm: 16, escadron: 72, bravm_groupe: 12, bravm_unite: 36, equipage_centaure: 3, equipage_canon_eau: 3,
      equipe_drone: 2, equipe_liaison: 2, autorite: 1, pompiers: 6, samu: 3,
    };
    expect(helper.unitTypes.length).toBe(Object.keys(size).length);
    for (const type of helper.unitTypes) {
      const slots = helper.policeUnit(type);
      expect(slots.length, type).toBe(size[type]);
      expect(slots.filter((s) => s.leads === 'unite').length, type).toBeLessThanOrEqual(1);
      // chaque appel rend une liste neuve
      expect(helper.policeUnit(type)).not.toBe(slots);
      expect(helper.policeUnit(type)).toEqual(slots);
    }
    const compagnie = helper.policeUnit('compagnie');
    expect(count(compagnie, 'commandant_unite')).toBe(1);
    expect(compagnie[0]!.rank).toBe('commandant');
    expect(new Set(compagnie.map((s) => s.section))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(count(compagnie, 'bouclier')).toBe(20);
    expect(count(compagnie, 'lbd')).toBe(4);
    expect(helper.policeUnit('compagnie', { drivers: true }).length).toBe(83);
    expect(count(helper.policeUnit('compagnie', { authority: false }), 'commandant_unite')).toBe(0);
    const escadron = helper.policeUnit('escadron');
    expect(escadron.every((s) => s.kind === 'gendarme')).toBe(true);
    expect(count(escadron, 'commandant_unite')).toBe(0);
    expect(count(helper.policeUnit('escadron', { authority: true }), 'commandant_unite')).toBe(1);
    const brav = helper.policeUnit('bravm_unite');
    expect(count(brav, 'pilote_moto')).toBe(18);
    expect(count(brav, 'lbd')).toBe(3);
    expect(helper.policeUnit('demi_compagnie', { section: 3 }).map((s) => s.section).filter((v, i, arr) => arr.indexOf(v) === i)).toEqual([3, 4]);
    expect(helper.policeUnit('inconnue' as UnitType)).toEqual([]);
  });

  it('spawnUnitSlot() : une compagnie complète, un seul porteur d’écharpe, codes de groupe', async () => {
    const { helper, ext, ctx } = await startRoles(103, { extra: { compagnie: 72 } });
    const people = helper.policeUnit('compagnie').map((slot, i) => {
      const p = helper.spawnUnitSlot(slot, i, 0);
      expect(p.kind).toBe(slot.kind);
      expect(p.poste).toBe(slot.poste);
      expect(p.rank).toBe(slot.rank);
      expect(p.look.extras?.company).toBe(72);
      if (slot.group) expect(ext.groupCode(p)).toBe(`${slot.section}${slot.group}`);
      return p;
    });
    expect(people.length).toBe(70);
    expect(people.filter((p) => p.look.sash).length).toBe(1);
    expect(people.filter((p) => p.look.sash)[0]!.poste).toBe('commandant_unite');
    expect(people.filter((p) => countOf(p, 'bouclier') > 0).length).toBe(20);
    expect(people.filter((p) => countOf(p, 'megaphone') > 0).length).toBe(2);
    expect(new Set(people.map((p) => p.rio)).size).toBe(70);
    // secours : sans poste ni grade
    const pompiers = helper.policeUnit('pompiers').map((s) => helper.spawnUnitSlot(s, 0, 0));
    expect(pompiers.every((p) => p.kind === 'pompier' && p.rank === null && p.poste === null)).toBe(true);
    expect(pompiers.filter((p) => countOf(p, 'lance_incendie') > 0).length).toBe(3);
    expect(ctx.people.list.length).toBe(76);
  });
});
