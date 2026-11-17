import { describe, expect, it } from 'vitest';
import type { GameContext, Person, PoliceRank, Squad } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { COMMAND_SERVICE, createSystems as commandSystems } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { acceptNasse, assignExits, buildNasseProposal, isFreeUnit, nasseProposalText, openFilteredExit, proposeNasse, resolveCrowd } from '@/ui/command/nasse';
import { BARRER_HINT, ORDER_VERBS, verbOf } from '@/ui/command/orders';
import { orderPhrase } from '@/ui/command/phrases';
import { QUICK_VERBS } from '@/ui/command/tacticalScreen';
import { TACTICAL_KEYS_LEGEND } from '@/ui/command/tacticalKeys';
import { createSystems as mapsSystems, MAPS_SERVICE } from '@/ui/maps';
import type { MapsRuntime } from '@/ui/maps';
import {
  BARRAGE_COLORS, barrageLook, barragesApi, exitsSummary, kettleBanner, openExitNames, pickFilterExit, roughCount,
} from '@/ui/maps/barrages';
import type { BarrageView, BarragesApi, ExitView, KettleView } from '@/ui/maps/barrages';
import { closureCoveredByBarrage } from '@/ui/maps/overlay';
import { plainOrder } from '@/gameplay/session/executant';

const exit = (street: string, held: boolean, x = 0, z = 0, extra: Partial<ExitView> = {}): ExitView => ({
  x, z, heading: 0, width: 12, street, edgeId: 1, held, squadId: 0, mode: held ? 'ferme' : 'ouvert', ...extra,
});

// ───────────────────────────── modèle d'affichage (pur) ─────────────────────────────

describe('carte — aspect des barrages', () => {
  it('en route : pointillés ; en place : rouge plein ; incomplet : orange, part non tenue hachurée ; filtrant : vert avec porte', () => {
    const route = barrageLook({ state: 'en_route', mode: 'ferme', covered: 0 });
    expect(route.dashed).toBe(true);
    const place = barrageLook({ state: 'en_place', mode: 'ferme', covered: 1 });
    expect(place).toMatchObject({ color: BARRAGE_COLORS.ferme, dashed: false, hatched: 0, gap: false });
    const inc = barrageLook({ state: 'incomplet', mode: 'ferme', covered: 0.6 });
    expect(inc.color).toBe(BARRAGE_COLORS.incomplet);
    expect(inc.hatched).toBeCloseTo(0.4, 9);
    expect(inc.tag).toBe('incomplet 60 %');
    const filt = barrageLook({ state: 'en_place', mode: 'filtrant', covered: 1 });
    expect(filt).toMatchObject({ color: BARRAGE_COLORS.filtrant, gap: true, dashed: false });
    // valeur invalide : pas de NaN dans le dessin
    expect(barrageLook({ state: 'incomplet', mode: 'ferme', covered: NaN }).hatched).toBe(1);
  });

  it('une fermeture de rue créée par le barrage d\'une unité n\'est pas dessinée une seconde fois', () => {
    const b = [{ x: 10, z: 0, squadId: 7, edgeId: 3, state: 'en_place' }];
    expect(closureCoveredByBarrage({ x: 12, z: 2, squadId: 7, edgeId: 99 }, b)).toBe(true);
    expect(closureCoveredByBarrage({ x: 12, z: 2, squadId: 0, edgeId: 3 }, b)).toBe(true);
    // autre rue, ou trop loin : deux choses distinctes
    expect(closureCoveredByBarrage({ x: 12, z: 2, squadId: 0, edgeId: 4 }, b)).toBe(false);
    expect(closureCoveredByBarrage({ x: 200, z: 0, squadId: 7, edgeId: 3 }, b)).toBe(false);
    // barrage rompu : la barrière de la fermeture reste visible
    expect(closureCoveredByBarrage({ x: 12, z: 2, squadId: 7, edgeId: 3 }, [{ ...b[0]!, state: 'rompu' }])).toBe(false);
  });
});

describe('carte — issues et nasse (textes)', () => {
  it('résumé : « Issues : 3 tenues sur 5 — ouvertes : rue X, rue Y »', () => {
    const exits = [exit('rue X', false), exit('rue A', true), exit('rue Y', false), exit('rue B', true), exit('rue C', true)];
    expect(exitsSummary(exits)).toBe('Issues : 3 tenues sur 5 — ouvertes : rue X, rue Y');
    expect(exitsSummary(exits.map((e) => ({ ...e, held: true, mode: 'ferme' })))).toBe('Issues : 5 tenues sur 5 — aucune ouverte');
    expect(exitsSummary([])).toBe('Issues : aucune repérée');
    expect(exitsSummary([exit('rue X', false), exit('rue A', true)])).toBe('Issues : 1 tenue sur 2 — ouverte : rue X');
  });

  it('résumé : issue filtrée comptée comme tenue, trouée piétonne nommée, doublons regroupés', () => {
    const exits = [
      exit('rue A', true, 0, 0, { mode: 'filtrant' }), exit('', false, 0, 0, { edgeId: -1 }), exit('rue X', false), exit('rue X', false),
    ];
    expect(openExitNames(exits)).toEqual(['passage piéton', 'rue X (2)']);
    expect(exitsSummary(exits)).toBe('Issues : 1 tenue sur 4 (dont 1 filtrée) — ouvertes : passage piéton, rue X (2)');
  });

  it('bandeau : « NASSE FERMÉE — <lieu> — environ N personnes »', () => {
    expect(kettleBanner({ place: 'place de la République', inside: 347 })).toBe('NASSE FERMÉE — place de la République — environ 350 personnes');
    expect(kettleBanner({ place: '', inside: 1234 })).toBe('NASSE FERMÉE — lieu non identifié — environ 1 200 personnes');
    expect(roughCount(12)).toBe(12);
    expect(roughCount(NaN)).toBe(0);
  });

  it('issue à filtrer : la plus large tenue par une unité commandée ; aucune si une issue filtrée existe déjà', () => {
    const exits = [exit('rue A', true, 0, 0, { squadId: 3, width: 8 }), exit('rue B', true, 0, 0, { squadId: 4, width: 15 }), exit('rue C', true, 0, 0, { squadId: 5, width: 30 })];
    expect(pickFilterExit(exits, (id) => id !== 5)!.street).toBe('rue B');
    expect(pickFilterExit([...exits, exit('rue D', true, 0, 0, { mode: 'filtrant', squadId: 3 })], () => true)).toBeNull();
    expect(pickFilterExit(exits, () => false)).toBeNull();
  });

  it('service absent ou incomplet : aucune lecture', () => {
    expect(barragesApi(() => undefined)).toBeUndefined();
    expect(barragesApi(() => ({ list: [] }))).toBeUndefined();
  });
});

// ───────────────────────────── « Fermer la nasse » (pur) ─────────────────────────────

describe('« Fermer la nasse » — affectation des unités libres aux issues', () => {
  it('chaque issue reçoit l\'unité libre la plus proche, sans qu\'une unité serve deux fois', () => {
    const exits = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 0, z: 100 }];
    const units = [{ x: 95, z: 5 }, { x: 3, z: 2 }, { x: 5, z: 90 }];
    expect(assignExits(exits, units).map((a) => [a.exit, a.unit])).toEqual([[0, 1], [1, 0], [2, 2]]);
  });

  it('conflit : l\'unité va à l\'issue la plus proche d\'elle, la suivante prend l\'autre', () => {
    // une seule unité proche des deux issues : elle prend la plus proche ; l'autre unité, plus loin, prend la seconde
    const exits = [{ x: 0, z: 0 }, { x: 20, z: 0 }];
    const units = [{ x: 15, z: 0 }, { x: -50, z: 0 }];
    const r = assignExits(exits, units);
    expect(r.map((a) => [a.exit, a.unit])).toEqual([[0, 1], [1, 0]]);
  });

  it('unités manquantes : les issues restantes restent ouvertes, et le texte le dit', () => {
    const r = assignExits([{ x: 0, z: 0 }, { x: 50, z: 0 }, { x: 100, z: 0 }], [{ x: 48, z: 0 }]);
    expect(r).toHaveLength(1);
    expect(r[0]!.exit).toBe(1);
    expect(nasseProposalText('place X', [{ unit: 'MISTRAL 1', street: 'rue B' }], 2))
      .toBe('Fermer la nasse — place X : MISTRAL 1 → rue B. Unités manquantes : 2 issues restent ouvertes.');
    expect(nasseProposalText('', [], 1)).toBe('Fermer la nasse : aucune unité libre. 1 issue reste ouverte.');
    expect(nasseProposalText('', [], 0)).toBe('Fermer la nasse : toutes les issues sont déjà tenues.');
    expect(assignExits([], [{ x: 0, z: 0 }])).toEqual([]);
    expect(assignExits([{ x: 0, z: 0 }], [])).toEqual([]);
  });

  it('unités libres : pas le drone, pas un engin seul, pas une unité qui tient déjà un barrage ou interpelle', () => {
    const base = { squadId: 5, faction: 'police' as const, valid: 6, symbol: 'groupe' as const, order: null };
    expect(isFreeUnit(base, new Set())).toBe(true);
    expect(isFreeUnit({ ...base, symbol: 'drone' }, new Set())).toBe(false);
    expect(isFreeUnit({ ...base, symbol: 'centaure' }, new Set())).toBe(false);
    expect(isFreeUnit(base, new Set([5]))).toBe(false);
    expect(isFreeUnit({ ...base, valid: 0 }, new Set())).toBe(false);
    const order = { type: 'interpeller', x: 0, z: 0, heading: 0, width: 0, targetId: 0, maxForce: 1 as const, issuedAt: 0, issuedBy: 0 };
    expect(isFreeUnit({ ...base, order }, new Set())).toBe(false);
    expect(isFreeUnit({ ...base, order: { ...order, type: 'tenir' } }, new Set())).toBe(true);
  });
});

// ───────────────────────────── ordre « Barrer la rue » ─────────────────────────────

describe('ordre « Barrer la rue » (couper_circulation)', () => {
  it('libellé, consigne et place dans la palette et l\'ordre rapide', () => {
    const v = verbOf('couper_circulation');
    expect(v).toBeDefined();
    expect(v!.label).toBe('Barrer la rue');
    expect(v!.hint.startsWith(BARRER_HINT)).toBe(true);
    expect(BARRER_HINT).toBe('Plus personne ne passe, dans les deux sens');
    expect(v!.gesture).toBe('point');
    expect(ORDER_VERBS.some((q) => q.type === 'filtrer')).toBe(true);
    expect(QUICK_VERBS).toContain('couper_circulation');
    expect(QUICK_VERBS.length).toBeLessThanOrEqual(12);
    expect(TACTICAL_KEYS_LEGEND).toContain('N = fermer la nasse');
  });

  it('phrase radio : la rue est barrée dans les deux sens', () => {
    const text = orderPhrase({ type: 'couper_circulation', unit: 'MISTRAL 1', from: 'MISTRAL', sector: 'rue de Rivoli', heading: 0, width: 0, distance: 30, target: '' });
    expect(text).toBe('MISTRAL 1 ICI MISTRAL. Barrez la rue, rue de Rivoli, d’une façade à l’autre. Plus personne ne passe, dans les deux sens. PARLEZ.');
  });

  it('carte « Ma mission » de l\'exécutant : « Barrage — <rue> : personne ne passe, dans les deux sens »', () => {
    const p = plainOrder('couper_circulation', { place: 'rue de Rivoli', poste: 'bouclier', hasPost: true });
    expect(p.title).toBe('Barrage — rue de Rivoli : personne ne passe, dans les deux sens');
    expect(p.target).toBe('post');
    expect(plainOrder('couper_circulation', { place: '', poste: null, hasPost: false }).title).toBe('Barrage : personne ne passe, dans les deux sens');
  });
});

// ───────────────────────────── intégration (service factice) ─────────────────────────────

interface World {
  ctx: GameContext;
  core: CommandCore;
  maps: MapsRuntime;
  company: Squad;
  groups: Squad[];
  commandant: Person;
  fake: { list: BarrageView[]; kettles: KettleView[]; exits: ExitView[]; calls: number };
}

function agent(ctx: GameContext, squad: Squad, x: number, z: number, rank: PoliceRank, poste: Person['poste']): Person {
  return ctx.people.spawn({ kind: 'crs', faction: 'police', x, z, rank, poste, squadId: squad.id });
}

async function world(withService = true): Promise<World> {
  const t = createTestContext({ modules: [mapsSystems, commandSystems] });
  await t.start();
  const ctx = t.ctx;
  const company = ctx.squads.create('compagnie', 'police', 'MISTRAL');
  const commandant = agent(ctx, company, 0, -60, 'commandant', 'commandant_unite');
  const section = ctx.squads.create('section', 'police', 'MISTRAL 1', company.id);
  agent(ctx, section, 0, -55, 'major', 'chef_section');
  const groups: Squad[] = [];
  // trois groupes : à l'ouest, à l'est, au nord du carrefour
  const at: [number, number][] = [[-40, 0], [40, 0], [0, -40]];
  for (let i = 0; i < 3; i++) {
    const g = ctx.squads.create('groupe', 'police', `MISTRAL 1 ${['ALFA', 'BRAVO', 'CHARLIE'][i]}`, section.id);
    agent(ctx, g, at[i]![0], at[i]![1], 'brigadier_chef', 'chef_groupe');
    for (let k = 0; k < 4; k++) agent(ctx, g, at[i]![0] + k, at[i]![1] + 1, 'gardien', 'bouclier');
    groups.push(g);
  }
  ctx.player.possess(commandant.id, 'commandant');
  const fake = { list: [] as BarrageView[], kettles: [] as KettleView[], exits: [] as ExitView[], calls: 0 };
  if (withService) {
    const api: BarragesApi = {
      get list() { return fake.list; },
      get kettles() { return fake.kettles; },
      exitsAround(): readonly ExitView[] { fake.calls++; return fake.exits; },
    };
    ctx.provide('police.barrages', api);
  }
  // un rassemblement au carrefour (service 'crowd.foyers', forme minimale)
  ctx.provide('crowd.foyers', { list: [{ id: 4, kind: 'rassemblement', name: 'carrefour Test', label: 'Rassemblement', x: 0, z: 0, people: 200, tension: 0.3, kettled: false }] });
  const core = ctx.service<CommandCore>(COMMAND_SERVICE)!;
  const maps = ctx.service<MapsRuntime>(MAPS_SERVICE)!;
  core.invalidateScope();
  return { ctx, core, maps, company, groups, commandant, fake };
}

function fresh(w: World): void {
  w.maps.scene.invalidate();
  w.maps.scene.ensureFresh();
}

describe('scène de la carte avec le service \'police.barrages\'', () => {
  it('barrages copiés avec l\'indicatif de l\'unité ; issues autour du foyer ; résumé', async () => {
    const w = await world();
    w.fake.list.push({ squadId: w.groups[0]!.id, x: -30, z: 0, heading: Math.PI / 2, width: 14, covered: 1, state: 'en_place', street: 'rue Ouest', edgeId: 2, mode: 'ferme' });
    w.fake.exits.push(
      exit('rue Ouest', true, -30, 0, { squadId: w.groups[0]!.id }), exit('rue Est', false, 30, 0), exit('rue Nord', false, 0, -30), exit('rue Sud', false, 0, 30),
    );
    fresh(w);
    const scene = w.maps.scene;
    expect(scene.barrages).toHaveLength(1);
    expect(scene.barrages[0]!.callsign).toBe('MISTRAL 1 ALFA');
    const crowd = scene.crowdExits.find((c) => c.key === 'f4');
    expect(crowd).toBeDefined();
    expect(crowd!.place).toBe('carrefour Test');
    expect(exitsSummary(crowd!.exits)).toBe('Issues : 1 tenue sur 4 — ouvertes : rue Est, rue Nord, rue Sud');
    // copie : le service peut réutiliser ses objets sans fausser la carte
    w.fake.list[0]!.state = 'rompu';
    expect(scene.barrages[0]!.state).toBe('en_place');
  });

  it('une foule dans une nasse détectée n\'est pas comptée deux fois : les issues sont celles de la nasse', async () => {
    const w = await world();
    w.fake.kettles.push({ id: 9, x: 0, z: 0, radius: 40, closed: true, inside: 347, place: 'carrefour Test', exits: [exit('rue Est', true, 30, 0, { squadId: w.groups[1]!.id })] });
    w.fake.exits.push(exit('rue Est', false, 30, 0));
    fresh(w);
    const list = w.maps.scene.crowdExits;
    expect(list.map((c) => c.key)).toEqual(['k9']);
    expect(list[0]!.closed).toBe(true);
    expect(kettleBanner({ place: list[0]!.place, inside: list[0]!.people })).toBe('NASSE FERMÉE — carrefour Test — environ 350 personnes');
  });

  it('sans le service : couches vides, aucune erreur', async () => {
    const w = await world(false);
    fresh(w);
    expect(w.maps.scene.barrages).toEqual([]);
    expect(w.maps.scene.crowdExits).toEqual([]);
    const r = proposeNasse(w.core, resolveCrowd(w.maps.scene.crowdExits, '', 0, 0), [], []);
    expect(r.pending).toBe(false);
    expect(w.core.nasse).toBeNull();
  });

  it('un rôle hors police ne voit ni les issues ni les barrages lointains', async () => {
    const w = await world();
    w.fake.list.push({ squadId: w.groups[0]!.id, x: 900, z: 900, heading: 0, width: 14, covered: 1, state: 'en_place', street: 'rue Loin', edgeId: 2, mode: 'ferme' });
    w.fake.exits.push(exit('rue Est', false, 30, 0));
    const civil = w.ctx.people.spawn({ kind: 'journaliste', faction: 'press', x: 0, z: 0 });
    w.ctx.player.possess(civil.id, 'journaliste');
    fresh(w);
    expect(w.maps.scene.barrages).toEqual([]);
    expect(w.maps.scene.crowdExits).toEqual([]);
  });
});

describe('« Barrer la rue » et « Fermer la nasse » donnent de vrais ordres', () => {
  it('l\'ordre « Barrer la rue » part (il était refusé : « Ordre inconnu »)', async () => {
    const w = await world();
    const g = w.groups[0]!;
    const r = w.core.issue('couper_circulation', [g], [{ x: -30, z: 0, heading: Math.PI / 2, width: 0 }]);
    expect(r).toMatchObject({ ok: true, count: 1 });
    expect(g.order.type).toBe('couper_circulation');
    const radio = w.ctx.radio.log.map((m) => m.text).join('\n');
    expect(radio).toContain('Plus personne ne passe, dans les deux sens');
  });

  it('proposition : l\'unité libre la plus proche à chaque issue ouverte, face à la foule ; ce qui reste ouvert est dit', async () => {
    const w = await world();
    // ALFA tient déjà l'ouest ; issues ouvertes : est, nord, sud ; unités libres : BRAVO (est), CHARLIE (nord)
    w.fake.list.push({ squadId: w.groups[0]!.id, x: -30, z: 0, heading: Math.PI / 2, width: 14, covered: 1, state: 'en_place', street: 'rue Ouest', edgeId: 2, mode: 'ferme' });
    w.fake.exits.push(
      exit('rue Ouest', true, -30, 0, { squadId: w.groups[0]!.id }), exit('rue Est', false, 30, 0), exit('rue Nord', false, 0, -30), exit('rue Sud', false, 0, 30),
    );
    fresh(w);
    const scene = w.maps.scene;
    const units = w.groups.map((g) => scene.unitModel.get(g.id)!);
    expect(units.every((u) => u !== undefined)).toBe(true);
    const crowd = resolveCrowd(scene.crowdExits, '', 5, 5)!;
    const r = proposeNasse(w.core, crowd, units, []);
    expect(r.pending).toBe(true);
    const p = w.core.nasse!;
    expect(p.lines.map((l) => [l.unit, l.street])).toEqual([['MISTRAL 1 BRAVO', 'rue Est'], ['MISTRAL 1 CHARLIE', 'rue Nord']]);
    expect(p.openLeft).toBe(1);
    expect(p.text).toContain('Unités manquantes : 1 issue reste ouverte');
    // face à la foule : de l'issue est (30, 0) vers le centre → cap vers −x
    const est = p.lines[0]!;
    expect(Math.sin(est.heading)).toBeCloseTo(-1, 6);

    const done = acceptNasse(w.core);
    expect(done.ok).toBe(true);
    expect(w.core.nasse).toBeNull();
    const bravo = w.groups[1]!;
    const charlie = w.groups[2]!;
    expect(bravo.order.type).toBe('couper_circulation');
    expect([bravo.order.x, bravo.order.z]).toEqual([30, 0]);
    expect(charlie.order.type).toBe('couper_circulation');
    expect([charlie.order.x, charlie.order.z]).toEqual([0, -30]);
    // ALFA, qui tenait déjà son barrage, n'a pas été déplacé
    expect(w.groups[0]!.order.type).not.toBe('couper_circulation');
    expect(done.text).toContain('1 issue reste ouverte');
  });

  it('nasse fermée : « Ouvrir une issue filtrée » donne l\'ordre « filtrer » à l\'unité qui tient l\'issue la plus large', async () => {
    const w = await world();
    const [a, b] = w.groups;
    w.fake.kettles.push({
      id: 9, x: 0, z: 0, radius: 40, closed: true, inside: 300, place: 'carrefour Test',
      exits: [exit('rue Ouest', true, -30, 0, { squadId: a!.id, width: 10 }), exit('rue Est', true, 30, 0, { squadId: b!.id, width: 18 })],
    });
    fresh(w);
    const crowd = w.maps.scene.crowdExits[0]!;
    const r = openFilteredExit(w.core, crowd);
    expect(r.ok).toBe(true);
    expect(r.text).toBe('Issue filtrée ouverte : rue Est, tenue par MISTRAL 1 BRAVO. Annoncez-la à la foule.');
    expect(b!.order.type).toBe('filtrer');
    expect([b!.order.x, b!.order.z]).toEqual([30, 0]);
  });

  it('buildNasseProposal sans unité libre : rien en attente, le nombre d\'issues ouvertes est dit', async () => {
    const w = await world();
    w.fake.exits.push(exit('rue Est', false, 30, 0), exit('rue Nord', false, 0, -30));
    fresh(w);
    const crowd = w.maps.scene.crowdExits[0]!;
    const p = buildNasseProposal(crowd, [], new Set());
    expect(p.lines).toEqual([]);
    expect(p.text).toBe('Fermer la nasse — carrefour Test : aucune unité libre. 2 issues restent ouvertes.');
  });
});
