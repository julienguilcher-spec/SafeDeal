// Archétypes — forces de l'ordre : chaque corps et chaque poste donne un agent complet et cohérent
// (dotation attendue, tenue fidèle, grade ↔ galons, écharpe réservée à l'autorité, matricule).
import { describe, expect, it } from 'vitest';
import type { ItemId, Person, PersonKind, PolicePoste, PoliceRank } from '@/core/contracts';
import { isColor } from '@/sim/roles/archetypes/palette';
import { POLICE_KINDS, RANK_DEFS, RANKS } from '@/sim/roles/archetypes/police';
import { ALL_POSTES, CONTRACT_ITEMS, countOf, handOf, kitIds, startRoles } from '@/sim/roles/archetypes/testkit';
import { RANK_STYLE, VARIANT } from '@/sim/roles';

/** Galons attendus par grade (bible §D) — écrits ici indépendamment des tables du module. */
const EXPECTED_BARS: Record<PoliceRank, number> = {
  gardien_stagiaire: 1, gardien: 2, brigadier: 1, brigadier_chef: 1, major: 2, capitaine: 3, commandant: 4, commissaire: 0,
};

/** Dotation attendue par poste de CRS : objets obligatoires, objets interdits, objet en main. */
const EXPECTED: Record<PolicePoste, { must: ItemId[]; never: ItemId[]; hand: string }> = {
  bouclier: { must: ['bouclier', 'tonfa', 'gazeuse', 'menottes', 'radio', 'masque_gaz', 'pistolet'], never: ['lanceur_cougar', 'lbd40', 'megaphone'], hand: 'bouclier' },
  lanceur: { must: ['lanceur_cougar', 'grenade_lacrymo', 'grenade_gm2l', 'tonfa', 'masque_gaz'], never: ['bouclier', 'lbd40'], hand: 'lanceur_cougar' },
  lbd: { must: ['lbd40', 'tonfa', 'gazeuse', 'menottes', 'radio'], never: ['bouclier', 'lanceur_cougar', 'grenade_gm2l'], hand: 'lbd40' },
  extincteur: { must: ['extincteur', 'tonfa', 'radio', 'masque_gaz'], never: ['bouclier', 'lanceur_cougar', 'lbd40'], hand: 'extincteur' },
  interpellation: { must: ['menottes', 'tonfa', 'gazeuse', 'grenade_desencerclement'], never: ['bouclier', 'lanceur_cougar', 'lbd40'], hand: '' },
  conducteur: { must: ['radio', 'tonfa', 'lampe', 'pistolet'], never: ['bouclier', 'lanceur_cougar', 'lbd40'], hand: '' },
  operateur: { must: ['radio', 'tonfa', 'pistolet'], never: ['bouclier', 'lanceur_cougar', 'lbd40'], hand: '' },
  chef_groupe: { must: ['radio', 'grenade_lacrymo', 'grenade_desencerclement', 'tonfa', 'menottes'], never: ['bouclier', 'lanceur_cougar', 'lbd40'], hand: '' },
  chef_section: { must: ['radio', 'tonfa', 'gazeuse', 'menottes'], never: ['bouclier', 'lanceur_cougar', 'lbd40'], hand: '' },
  commandant_unite: { must: ['megaphone', 'fusee_sommation', 'radio', 'tonfa'], never: ['bouclier', 'lanceur_cougar', 'lbd40'], hand: '' },
  autorite_civile: { must: ['megaphone', 'fusee_sommation', 'radio', 'pistolet'], never: ['bouclier', 'lanceur_cougar', 'lbd40'], hand: '' },
  pilote_moto: { must: ['radio', 'tonfa', 'pistolet'], never: ['bouclier', 'lanceur_cougar'], hand: '' },
  passager_moto: { must: ['tonfa', 'gazeuse', 'menottes', 'radio'], never: ['bouclier', 'lanceur_cougar'], hand: '' },
  telepilote: { must: ['telecommande_drone', 'radio'], never: ['bouclier', 'tonfa'], hand: 'telecommande_drone' },
};

const AUTHORITY: readonly PolicePoste[] = ['commandant_unite', 'autorite_civile'];

function checkComplete(p: Person, label: string): void {
  const l = p.look;
  expect(p.name, label).toMatch(/^\p{Lu}[\p{L}'’-]+ \p{Lu}[\p{L}'’ -]+$/u);
  expect(p.faction, label).toBe('police');
  expect(p.rio, label).toMatch(/^[1-9]\d{6}$/);
  expect(l.height, label).toBeGreaterThanOrEqual(1.5);
  expect(l.height, label).toBeLessThanOrEqual(1.98);
  expect(l.build, label).toBeGreaterThanOrEqual(0.85);
  expect(l.build, label).toBeLessThanOrEqual(1.25);
  for (const c of [l.skin, l.hair, l.top, l.bottom, l.shoes, l.armband, l.vest]) expect(isColor(c), label).toBe(true);
  expect(l.hairStyle, label).toBeGreaterThanOrEqual(0);
  expect(l.hairStyle, label).toBeLessThanOrEqual(7);
  expect(l.visorDown, label).toBe(false);
  expect(l.gasMask, label).toBe(false);
  expect(l.faceCover, label).toBe(false);
  expect(l.backText === 'POLICE' || l.backText === 'GENDARMERIE', label).toBe(true);
  for (const [k, v] of Object.entries(l.extras ?? {})) expect(Number.isFinite(v), `${label} extras.${k}`).toBe(true);
  expect(p.speedWalk, label).toBeGreaterThan(1);
  expect(p.speedRun, label).toBeGreaterThan(p.speedWalk);
  expect(p.speedSprint, label).toBeGreaterThan(p.speedRun);
  expect(p.armorHead, label).toBeGreaterThanOrEqual(0);
  expect(p.armorHead, label).toBeLessThanOrEqual(1);
  expect(p.armorBody, label).toBeGreaterThan(0);
  expect(p.armorBody, label).toBeLessThanOrEqual(1);
  expect(p.inventory.length, label).toBeGreaterThan(2);
  for (const s of p.inventory) {
    expect(CONTRACT_ITEMS.indexOf(s.id), `${label} objet ${s.id}`).toBeGreaterThanOrEqual(0);
    expect(s.count, `${label} ${s.id}`).toBeGreaterThan(0);
  }
  // pas deux piles du même objet
  expect(new Set(kitIds(p)).size, label).toBe(p.inventory.length);
  // grade ↔ galons
  expect(p.rank, label).not.toBeNull();
  expect(l.rankBars, label).toBe(EXPECTED_BARS[p.rank!]);
}

describe('CRS par poste', () => {
  it('chaque poste a sa dotation, sa tenue et son grade', async () => {
    const { ctx, ext } = await startRoles(3);
    for (const poste of ALL_POSTES) {
      for (let i = 0; i < 12; i++) {
        const p = ctx.archetypes.spawn('crs', i, 0, { poste });
        const label = `crs/${poste}#${i}`;
        checkComplete(p, label);
        expect(p.kind).toBe('crs');
        expect(p.poste, label).toBe(poste);
        const exp = EXPECTED[poste];
        for (const id of exp.must) expect(countOf(p, id), `${label} doit porter ${id}`).toBeGreaterThan(0);
        for (const id of exp.never) expect(countOf(p, id), `${label} ne porte pas ${id}`).toBe(0);
        expect(handOf(p), label).toBe(exp.hand);
        // l'écharpe tricolore est réservée à l'autorité habilitée
        expect(p.look.sash, label).toBe(AUTHORITY.indexOf(poste) >= 0);
        expect(p.look.backText, label).toBe('POLICE');
        expect(p.look.extras?.company, label).toBe(ext.session.company);
        // seul le porteur de bouclier a un bouclier ; aucun stagiaire aux armes à habilitation
        if (poste !== 'bouclier') expect(countOf(p, 'bouclier'), label).toBe(0);
        if (poste === 'lbd' || poste === 'lanceur') expect(p.rank, label).not.toBe('gardien_stagiaire');
      }
    }
  });

  it('respecte les quantités de la bible (tableau B)', async () => {
    const { ctx } = await startRoles(4);
    const lanceur = ctx.archetypes.spawn('crs', 0, 0, { poste: 'lanceur' });
    expect(countOf(lanceur, 'lanceur_cougar')).toBe(8);
    expect(countOf(lanceur, 'grenade_lacrymo')).toBe(4);
    expect(countOf(lanceur, 'grenade_gm2l')).toBe(2);
    const lbd = ctx.archetypes.spawn('crs', 0, 0, { poste: 'lbd' });
    expect(countOf(lbd, 'lbd40')).toBe(6);
    const chef = ctx.archetypes.spawn('crs', 0, 0, { poste: 'chef_groupe' });
    expect(countOf(chef, 'grenade_lacrymo')).toBe(2);
    expect(countOf(chef, 'grenade_desencerclement')).toBe(1);
    const bouclier = ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' });
    expect(countOf(bouclier, 'gazeuse')).toBe(7);
    expect(countOf(bouclier, 'menottes')).toBe(6);
    expect(countOf(bouclier, 'pistolet')).toBe(15);
    const cdt = ctx.archetypes.spawn('crs', 0, 0, { poste: 'commandant_unite' });
    expect(countOf(cdt, 'fusee_sommation')).toBe(4);
    const ext = ctx.archetypes.spawn('crs', 0, 0, { poste: 'extincteur' });
    expect(countOf(ext, 'extincteur')).toBe(15);
  });

  it('tenue de maintien de l’ordre fidèle, tenue allégée au véhicule', async () => {
    const { ctx } = await startRoles(5);
    const ligne = ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' });
    expect(ligne.look.outfit).toBe('crs_mo');
    expect(ligne.look.headgear).toBe('casque_crs');
    expect(ligne.look.top).toBe(0x1a2238);
    expect(ligne.look.bottom).toBe(0x1a2238);
    expect(ligne.armorHead).toBeCloseTo(0.85);
    expect(ligne.armorBody).toBeCloseTo(0.7);
    const conducteur = ctx.archetypes.spawn('crs', 0, 0, { poste: 'conducteur' });
    expect(conducteur.look.outfit).toBe('crs_service');
    expect(conducteur.look.headgear).toBe('calot');
    expect(conducteur.armorHead).toBe(0);
    expect(conducteur.armorBody).toBeLessThan(ligne.armorBody);
  });

  it('grades par défaut : gardiens aux postes d’exécution, gradés aux postes de commandement', async () => {
    const { ctx } = await startRoles(6);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' }).rank ?? '');
    expect([...seen].sort()).toEqual(['gardien', 'gardien_stagiaire']);
    expect(ctx.archetypes.spawn('crs', 0, 0, { poste: 'chef_groupe' }).rank).toBe('brigadier_chef');
    expect(ctx.archetypes.spawn('crs', 0, 0, { poste: 'commandant_unite' }).rank).toBe('commandant');
    const chefs = new Set<string>();
    for (let i = 0; i < 80; i++) chefs.add(ctx.archetypes.spawn('crs', 0, 0, { poste: 'chef_section' }).rank ?? '');
    expect([...chefs].sort()).toEqual(['capitaine', 'major']);
  });

  it('le grade demandé fixe les galons, le dessin et la couleur de l’insigne', async () => {
    const { ctx } = await startRoles(7);
    for (const rank of RANKS) {
      const p = ctx.archetypes.spawn('crs', 0, 0, { poste: 'chef_section', rank });
      expect(p.rank).toBe(rank);
      expect(p.look.rankBars, rank).toBe(EXPECTED_BARS[rank]);
      expect(p.look.rankBars, rank).toBe(RANK_DEFS[rank].bars);
      expect(p.look.extras?.rankStyle, rank).toBe(RANK_DEFS[rank].style);
      expect(isColor(p.look.extras?.rankColor ?? -1), rank).toBe(true);
    }
    const commissaire = ctx.archetypes.spawn('commissaire', 0, 0);
    expect(commissaire.look.rankBars).toBe(0);
    expect(commissaire.look.extras?.rankStyle).toBe(RANK_STYLE.feuilles_chene);
  });
});

describe('tous les corps', () => {
  it('chaque corps × chaque poste donne un agent complet ; écharpe seulement pour l’autorité', async () => {
    const { ctx } = await startRoles(8);
    const rios = new Set<string>();
    let n = 0;
    for (const kind of POLICE_KINDS) {
      for (const poste of [...ALL_POSTES, null]) {
        for (let i = 0; i < 4; i++) {
          const p = ctx.archetypes.spawn(kind as PersonKind, 0, 0, { poste });
          const label = `${kind}/${poste}`;
          checkComplete(p, label);
          const authority = kind === 'commissaire' || (poste !== null && AUTHORITY.indexOf(poste) >= 0);
          expect(p.look.sash, label).toBe(authority);
          rios.add(p.rio);
          n++;
        }
      }
    }
    // matricules tous différents
    expect(rios.size).toBe(n);
  });

  it('commandant unique : écharpe, mégaphone, fusée de sommation, 4 barrettes, ni bouclier ni lanceur', async () => {
    const { ctx } = await startRoles(9);
    const cdt = ctx.archetypes.spawn('crs', 0, 0, { poste: 'commandant_unite' });
    expect(cdt.look.sash).toBe(true);
    expect(cdt.look.rankBars).toBe(4);
    expect(cdt.look.extras?.cdt).toBe(1);
    expect(cdt.look.extras?.radios).toBe(2);
    expect(kitIds(cdt).slice(0, 2)).toEqual(['megaphone', 'fusee_sommation']);
    expect(countOf(cdt, 'bouclier') + countOf(cdt, 'lanceur_cougar') + countOf(cdt, 'lbd40')).toBe(0);
  });

  it('autorité civile : en tenue ou en civil, toujours avec écharpe, mégaphone et fusée', async () => {
    const { ctx, ext } = await startRoles(10);
    const outfits = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const c = ctx.archetypes.spawn('commissaire', 0, 0);
      outfits.add(c.look.outfit);
      expect(c.poste).toBe('autorite_civile');
      expect(c.rank).toBe('commissaire');
      expect(c.look.sash).toBe(true);
      expect(countOf(c, 'megaphone')).toBe(1);
      expect(countOf(c, 'fusee_sommation')).toBe(4);
      expect(countOf(c, 'bouclier')).toBe(0);
    }
    expect([...outfits].sort()).toEqual(['commissaire', 'crs_service']);
    const tenue = ext.spawnEx('commissaire', 0, 0, { variant: 'tenue' });
    expect(tenue.look.outfit).toBe('crs_service');
    expect(tenue.look.headgear).toBe('casquette_police');
    const civil = ext.spawnEx('commissaire', 0, 0, { variant: 'civil' });
    expect(civil.look.outfit).toBe('commissaire');
    expect(civil.look.headgear).toBe('none');
    expect(civil.look.extras?.variant).toBe(VARIANT.civil);
  });

  it('BRAV-M : tout en noir, casque de moto gardé, pilote et opérateur distincts', async () => {
    const { ctx } = await startRoles(11);
    const op = ctx.archetypes.spawn('bravm', 0, 0);
    expect(op.poste).toBe('passager_moto');
    expect(op.look.outfit).toBe('bravm');
    expect(op.look.headgear).toBe('casque_moto');
    expect(op.look.top).toBe(0x0b0b0d);
    expect(op.look.backText).toBe('POLICE');
    expect(kitIds(op).slice(0, 3)).toEqual(['tonfa', 'gazeuse', 'menottes']);
    const pilote = ctx.archetypes.spawn('bravm', 0, 0, { poste: 'pilote_moto' });
    expect(kitIds(pilote)[0]).toBe('radio');
    expect(pilote.look.extras?.helmetColor).not.toBe(op.look.extras?.helmetColor);
    // le porteur de LBD d'un groupe de BRAV-M garde la tenue de son corps
    const lbd = ctx.archetypes.spawn('bravm', 0, 0, { poste: 'lbd' });
    expect(lbd.look.outfit).toBe('bravm');
    expect(countOf(lbd, 'lbd40')).toBe(6);
  });

  it('gendarme mobile : casque bleu, « GENDARMERIE », insignes or', async () => {
    const { ctx } = await startRoles(12);
    const g = ctx.archetypes.spawn('gendarme', 0, 0);
    expect(g.look.outfit).toBe('gendarme_mo');
    expect(g.look.headgear).toBe('casque_gendarme');
    expect(g.look.backText).toBe('GENDARMERIE');
    expect(g.look.top).toBe(0x0e1220);
    expect(g.look.extras?.rankColor).toBe(0xc9a227);
    expect(handOf(g)).toBe('bouclier');
  });

  it('policier en civil : vêtements de ville et brassard orange obligatoire', async () => {
    const { ctx } = await startRoles(13);
    const tops = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const p = ctx.archetypes.spawn('policier_civil', 0, 0);
      expect(p.look.outfit).toBe('police_civil');
      expect(p.look.armband).toBe(0xff6a00);
      expect(countOf(p, 'baton')).toBe(1);
      expect(countOf(p, 'bouclier')).toBe(0);
      tops.add(p.look.top);
    }
    expect(tops.size).toBeGreaterThan(5);
  });

  it('télépilote : télécommande en main, tenue de service', async () => {
    const { ctx } = await startRoles(14);
    const tp = ctx.archetypes.spawn('telepilote', 0, 0);
    expect(tp.poste).toBe('telepilote');
    expect(handOf(tp)).toBe('telecommande_drone');
    expect(tp.look.outfit).toBe('crs_service');
    expect(tp.look.headgear).toBe('calot');
  });

  it('groupe de commandement : radio, secouriste-vidéo, vidéo, liaison', async () => {
    const { ext } = await startRoles(15);
    const radio = ext.spawnEx('crs', 0, 0, { poste: 'operateur', variant: 'radio' });
    expect(radio.look.outfit).toBe('crs_mo');
    expect(radio.look.extras?.radios).toBe(2);
    const secouriste = ext.spawnEx('crs', 0, 0, { poste: 'operateur', variant: 'secouriste' });
    expect(countOf(secouriste, 'trousse_secours')).toBeGreaterThan(0);
    expect(countOf(secouriste, 'serum_physiologique')).toBeGreaterThan(0);
    expect(secouriste.look.backpack).toBe(true);
    expect(secouriste.look.extras?.camera_pieton).toBe(1);
    const liaison = ext.spawnEx('crs', 0, 0, { poste: 'operateur', variant: 'liaison' });
    expect(countOf(liaison, 'megaphone')).toBe(1);
    // sans spécialité : opérateur d'engin, en tenue allégée
    const engin = ext.spawnEx('crs', 0, 0, { poste: 'operateur' });
    expect(engin.look.outfit).toBe('crs_service');
  });

  it('caméra-piéton pour les chefs et le porteur de LBD ; code de groupe « 2B »', async () => {
    const { ctx, ext } = await startRoles(16);
    for (const poste of ['chef_groupe', 'chef_section', 'commandant_unite', 'lbd'] as const) {
      expect(ctx.archetypes.spawn('crs', 0, 0, { poste }).look.extras?.camera_pieton, poste).toBe(1);
    }
    expect(ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' }).look.extras?.camera_pieton).toBeUndefined();
    const p = ext.spawnEx('crs', 0, 0, { poste: 'lbd', company: 77, section: 2, group: 'B' });
    expect(p.look.extras?.company).toBe(77);
    expect(ext.groupCode(p)).toBe('2B');
    expect(ext.groupCode(ctx.archetypes.spawn('crs', 0, 0))).toBe('');
  });

  it('les options de l’appelant priment : nom, grade, apparence, dotation, unité', async () => {
    const { ctx } = await startRoles(17);
    const squad = ctx.squads.create('groupe', 'police', 'MISTRAL 1 ALFA');
    const p = ctx.archetypes.spawn('crs', 5, -3, {
      poste: 'bouclier', rank: 'brigadier_chef', name: 'Indicatif Mistral', heading: 1.5, squadId: squad.id,
      look: { height: 1.91, skin: 0x70482f }, inventory: [{ id: 'radio', count: 1, state: 1, cooldown: 0 }],
    });
    expect(p.name).toBe('Indicatif Mistral');
    expect(p.rank).toBe('brigadier_chef');
    expect(p.look.rankBars).toBe(1);
    expect(p.look.height).toBe(1.91);
    expect(p.look.skin).toBe(0x70482f);
    expect(kitIds(p)).toEqual(['radio']);
    expect(p.x).toBe(5);
    expect(p.z).toBe(-3);
    expect(p.heading).toBe(1.5);
    expect(squad.members).toContain(p.id);
  });

  it('la charge dépend du poste : le porteur de bouclier est plus chargé que le conducteur', async () => {
    const { ctx, ext } = await startRoles(18);
    const bouclier = ext.loadKg(ctx.archetypes.spawn('crs', 0, 0, { poste: 'bouclier' }));
    const lanceur = ext.loadKg(ctx.archetypes.spawn('crs', 0, 0, { poste: 'lanceur' }));
    const conducteur = ext.loadKg(ctx.archetypes.spawn('crs', 0, 0, { poste: 'conducteur' }));
    const passant = ext.loadKg(ctx.archetypes.spawn('passant', 0, 0));
    expect(bouclier).toBeGreaterThan(15);
    expect(bouclier).toBeLessThan(25);
    expect(lanceur).toBeGreaterThan(bouclier);
    expect(conducteur).toBeLessThan(bouclier - 5);
    expect(passant).toBeLessThan(4);
  });
});
