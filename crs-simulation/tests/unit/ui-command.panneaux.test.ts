// Carte de commandement — panneaux de côté (paquet C4) : « Mes unités » (textes de suivi, groupes repliés à la Concorde),
// « À traiter » (ordre : chaîne légale arrêtée, incident vital, proposition de l'adjoint, nasse fermée ; trois au plus),
// « Plus… » selon le rôle (lecture seule sans « Tous les ordres », chef de groupe sans métro), « Cadre légal » selon
// le rôle (commandant, chef de groupe, salle de commandement, sans autorité), « Tous les ordres » (26 ordres, 27 avec
// « Rentrer au commissariat », chacun expliqué). Les fonctions pures sont nourries à la main puis par de vraies parties
// (place de la Concorde, vraies rues de Paris).
import { describe, expect, it } from 'vitest';

import type { OrderType } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { CardCrowd, CardEnv, CardIncident, CardProposal, CardUnit, LegalStatus } from '@/ui/command/cardTypes';
import { EXTRA_PLAIN, ORDER_VERBS } from '@/ui/command/orders';
import type { OrderVerb } from '@/ui/command/orders';
import { chainOf, followRows, placeInText, readTracks, todoItems, unitActivity } from '@/ui/command/panelFollow';
import type { ChainView, FollowTrack } from '@/ui/command/panelFollow';
import { legalInput, legalView, orderedForce, startSommationChain } from '@/ui/command/panelLegal';
import type { LegalViewInput } from '@/ui/command/panelLegal';
import { moreEntries, registerMoreSection } from '@/ui/command/panelMore';
import type { MoreContext } from '@/ui/command/panelMore';
import { matchOrder, ordersCount, ordersList } from '@/ui/command/panelOrders';
import { cardEnvFromCore } from '@/ui/command/reperes';
import { proposalTitle } from '@/ui/command/adjointPlays';

// ───────────────────────────── données faites main ─────────────────────────────

function unit(squadId: number, name: string, symbol: CardUnit['symbol'], extra: Partial<CardUnit> = {}): CardUnit {
  return {
    squadId, key: squadId, name, symbol, x: 0, z: 0, total: 19, valid: 19, morale: 0.8, ammo: 40, order: null, orderPlace: '', status: '',
    embarked: false, hasVehicles: true, mine: true, patrol: false, homeStation: '', targetEntity: 0, parentId: 0, hasPlayer: false, ...extra,
  };
}

function track(extra: Partial<FollowTrack> = {}): FollowTrack {
  return { arrived: false, since: -1, remaining: 80, total: 200, embarked: false, convoy: null, intended: null, ...extra };
}

function order(type: OrderType, issuedAt = 10): CardUnit['order'] {
  return { type, x: 100, z: 0, targetId: 0, issuedAt };
}

function incident(id: number, urgency: 1 | 2 | 3, extra: Partial<CardIncident> = {}): CardIncident {
  return {
    id, kind: 'feu_vehicule', x: 10 * id, z: 0, urgency, state: 'ouvert', means: '', squadId: 0, assignee: '', place: 'rue Royale', age: 40,
    targetId: 0, callId: 0, callVehicleId: 0, ...extra,
  };
}

const KETTLE: CardCrowd = {
  key: 'k4', name: 'Nasse — place de la République', place: 'place de la République', x: 800, z: 0, radius: 40, people: 120, tension: 0.7,
  heading: NaN, main: false, kettleId: 4, closed: true, exits: [],
};
const PROPOSAL: CardProposal = { id: 8, key: 'halte', text: 'Chef, le calme est revenu, je propose de cesser l’emploi de la force.', x: 5, z: 5, executable: true };

function todoEnv(over: Partial<Pick<CardEnv, 'incidents' | 'proposals' | 'crowds' | 'player' | 'level'>> = {}): Pick<CardEnv, 'incidents' | 'proposals' | 'crowds' | 'player' | 'level'> {
  return { incidents: [], proposals: [], crowds: [], player: { x: 0, z: 0, title: 'Commandant Carlier', inVehicle: false }, level: 'tout', ...over };
}

function chain(stage: LegalStatus['stage'], active: boolean, text: string): ChainView {
  return { status: { stage, sommation: 1, nextIn: 25, text, reason: stage === 'refus' ? 'Vous devez porter l’écharpe tricolore pour faire les sommations.' : '', title: 'Dispersion au gaz — Tête de cortège' }, active };
}

// ───────────────────────────── « Mes unités » : les textes ─────────────────────────────

describe('« Mes unités » : ce que fait chaque unité, où, où elle en est', () => {
  it('dit l’ordre en clair, la route, l’embarquement, la place, la relève et le chemin coupé', () => {
    const now = 400;
    // en route à pied vers la rue de Rivoli : 80 m à 1,8 m/s ≈ 1 min
    const barre = unit(31, 'MISTRAL 2', 'section', { order: order('couper_circulation'), orderPlace: 'rue de Rivoli' });
    let a = unitActivity(barre, track(), now);
    expect(a.doing).toBe('Barre la rue de Rivoli');
    expect(a.status).toBe('en route à pied · ~1\u00a0min');
    expect(a.progress).toBeCloseTo(0.6, 5);
    // nom de la carte (« Rue de Rivoli ») écrit comme dans une phrase
    expect(unitActivity({ ...barre, orderPlace: 'Rue de Rivoli' }, track(), now).doing).toBe('Barre la rue de Rivoli');
    expect(unitActivity({ ...barre, order: order('colonne'), orderPlace: 'Place de la Concorde' }, track(), now).doing).toBe('Va à pied · place de la Concorde');
    expect(placeInText('Opéra Garnier')).toBe('Opéra Garnier');
    // passants admis : le même ordre, dit avec son option
    a = unitActivity({ ...barre, order: { ...barre.order!, targetId: -2 } }, track(), now);
    expect(a.doing).toBe('Barre la rue de Rivoli, passants admis');
    // en place depuis 3 min
    a = unitActivity(barre, track({ arrived: true, since: now - 200, remaining: 2 }), now);
    expect(a.status).toBe('en place depuis 3\u00a0min');
    a = unitActivity(barre, track({ arrived: true, since: now - 20, remaining: 2 }), now);
    expect(a.status).toBe('en place');
    // colonne de véhicules qui embarque : l'ordre du joueur (repris au débarquement) est dit, pas « embarquer »
    const loin = unit(27, 'MISTRAL 1', 'section', { order: order('embarquer') });
    const intended = { type: 'couper_circulation' as OrderType, place: 'rue Royale', targetId: 0 };
    a = unitActivity(loin, track({ convoy: { stage: 'route', aboard: 5, total: 7, departIn: 30 }, intended }), now);
    expect(a.doing).toBe('Barre la rue Royale');
    expect(a.status).toBe('embarque (5/7 à bord)');
    a = unitActivity(loin, track({ convoy: { stage: 'route', aboard: 7, total: 7, departIn: 0, remaining: 990 }, intended, total: 1000 }), now);
    expect(a.status).toBe('en route en véhicules · ~2\u00a0min');
    a = unitActivity(loin, track({ convoy: { stage: 'debarquement' }, intended }), now);
    expect(a.status).toBe('débarque');
    // un simple mouvement en véhicules
    a = unitActivity(loin, track({ convoy: { stage: 'route', aboard: 2, total: 7, departIn: 40 }, intended: { type: 'faire_mouvement', place: 'place de la Bastille', targetId: 0 } }), now);
    expect(a.doing).toBe('Va en véhicules · place de la Bastille');
    // chemin coupé (la colonne n'a pas trouvé d'itinéraire) : orange
    a = unitActivity(loin, track({ convoy: { stage: 'echec' }, intended }), now);
    expect(a.status).toBe('bloquée\u00a0: chemin coupé');
    expect(a.tone).toBe('alert');
    // sans ordre ; relève conseillée sous 60 % d'agents valides
    a = unitActivity(unit(35, 'MISTRAL 3', 'section'), undefined, now);
    expect(a.doing).toBe('Sans ordre');
    expect(a.tone).toBe('free');
    const fatigue = unit(35, 'MISTRAL 3', 'section', { valid: 11, total: 19 });
    expect(unitActivity(fatigue, undefined, now).tone).toBe('warn');
    const rows = followRows([fatigue], new Map(), { now, unfolded: new Map(), chain: null });
    expect(rows[0]!.relief).toBe(true);
    expect(rows[0]!.strength).toBe('11/19');
    // un ordre qui ne va nulle part (suivre le joueur) n'a ni trajet ni barre
    a = unitActivity(unit(28, 'MISTRAL 1 ALFA', 'groupe', { order: order('suivre_pied') }), track(), now);
    expect(a.doing).toBe('Vous suit à pied');
    expect(a.status).toBe('');
    expect(a.progress).toBe(-1);
    // jamais un type brut ni un tiret bas
    for (const v of ORDER_VERBS) {
      const r = unitActivity(unit(40, 'X', 'groupe', { order: order(v.type), orderPlace: 'rue de Rivoli' }), track(), now);
      expect(r.doing, v.type).not.toMatch(/_|^[A-Z_]+$/);
      expect(r.doing.trim(), v.type).not.toBe('');
    }
  });

  it('replie les groupes sous leur section, regroupe engins et patrouilles, et met la chaîne légale en dernier', () => {
    const units: CardUnit[] = [
      unit(26, 'MISTRAL', 'compagnie', { total: 70, valid: 70 }),
      unit(27, 'MISTRAL 1', 'section', { parentId: 26 }),
      unit(28, 'MISTRAL 1 ALFA', 'groupe', { parentId: 27, order: order('tenir') }),
      unit(29, 'MISTRAL 1 BRAVO', 'groupe', { parentId: 27 }),
      unit(46, 'NEPTUNE 1', 'canon_eau', { parentId: 26, total: 3, valid: 3 }),
      unit(47, 'CENTAURE 1', 'centaure', { parentId: 26, total: 3, valid: 3 }),
      unit(50, 'TV 75-19', 'patrouille', { patrol: true, status: 'Patrouille', total: 3, valid: 3 }),
      unit(60, 'FAUCON 9', 'bravm', { mine: false }),
    ];
    let rows = followRows(units, new Map(), { now: 0, unfolded: new Map(), chain: null });
    expect(rows.map((r) => r.name)).toEqual(['Section MISTRAL 1', 'Patrouille TV 75-19', 'Engins (2)']);
    expect(rows[0]!.folded).toBe(true);
    expect(rows[0]!.doing).toBe('Sans ordre · 1 groupe sur 2 en action');
    // la section dépliée montre ses groupes ; « Engins » déplié ses engins
    rows = followRows(units, new Map(), { now: 0, unfolded: new Map([['u:27', true], ['g:engins', true]]), chain: null });
    expect(rows.map((r) => `${r.depth}:${r.name}`)).toEqual([
      '0:Section MISTRAL 1', '1:Groupe MISTRAL 1 ALFA', '1:Groupe MISTRAL 1 BRAVO', '0:Patrouille TV 75-19', '0:Engins (2)', '1:Canon à eau NEPTUNE 1', '1:Blindé CENTAURE 1',
    ]);
    expect(rows[1]!.doing).toBe('Tient sa position');
    // chaîne légale en cours : sa rangée, avec « Annuler » ; arrêtée (elle attend le joueur) : dans « À traiter », pas ici
    rows = followRows(units, new Map(), { now: 0, unfolded: new Map(), chain: chain('sommation', true, 'Dispersion au gaz — sommation 2 sur 3 dans 25\u00a0s') });
    const last = rows[rows.length - 1]!;
    expect(last.kind).toBe('chain');
    expect(last.name).toBe('Dispersion au gaz');
    expect(last.doing).toBe('sommation 2 sur 3 dans 25\u00a0s');
    expect(last.cancel).toBe(true);
    rows = followRows(units, new Map(), { now: 0, unfolded: new Map(), chain: chain('refus', false, 'Dispersion au gaz — arrêté : …') });
    expect(rows.some((r) => r.kind === 'chain')).toBe(false);
  });
});

// ───────────────────────────── « À traiter » ─────────────────────────────

describe('« À traiter » : l’urgent d’abord, trois au plus', () => {
  it('chaîne arrêtée > incident vital > proposition de l’adjoint > nasse fermée', () => {
    let items = todoItems(todoEnv({ incidents: [incident(1, 3)], proposals: [PROPOSAL], crowds: [KETTLE] }), null);
    expect(items.map((i) => i.kind)).toEqual(['incident', 'proposition', 'nasse']);
    expect(items[0]!.title).toBe('Véhicule en feu · rue Royale');
    expect(items[0]!.sub).toMatch(/^vital · personne n’y va · depuis 40\s+s$/);
    expect(items[1]!.title).toBe(`L’adjoint propose\u00a0: ${proposalTitle(PROPOSAL)}`);
    expect(items[1]!.title).toMatch(/^L’adjoint propose\s: Arrêter l’emploi de la force\s: le calme est revenu$/);
    expect(items[2]!.title).toBe('Nasse fermée — ouvrir une sortie filtrée\u00a0?');
    expect(items[2]!.repere!.kind).toBe('nasse');
    // trois au plus ; un incident déjà confié n'y est pas ; le vital avant l'urgent
    items = todoItems(todoEnv({
      incidents: [incident(2, 2), incident(1, 3), incident(3, 3, { state: 'assigne', squadId: 31, assignee: 'MISTRAL 2' })],
      proposals: [PROPOSAL], crowds: [KETTLE],
    }), null);
    expect(items.length).toBe(3);
    expect(items.map((i) => i.key)).toEqual(['incident:1', 'incident:2', 'proposition:8']);
    expect(todoItems(todoEnv({ incidents: [incident(2, 2), incident(1, 3)], proposals: [PROPOSAL], crowds: [KETTLE] }), null, Infinity).length).toBe(4);
    // la chaîne légale arrêtée attend le joueur : en tête, elle ouvre « Cadre légal » (pas de repère)
    items = todoItems(todoEnv({ incidents: [incident(1, 3)], proposals: [PROPOSAL] }), chain('refus', false, 'Dispersion au gaz — arrêté\u00a0: vous devez porter l’écharpe'));
    expect(items[0]!.kind).toBe('chaine');
    expect(items[0]!.repere).toBeNull();
    // en cours, elle est suivie dans « Mes unités », pas ici ; autorisation demandée par radio : elle attend le joueur
    expect(todoItems(todoEnv(), chain('sommation', true, 'x — y')).length).toBe(0);
    expect(todoItems(todoEnv(), chain('autorisation', false, 'Dispersion au gaz — en attente de l’autorisation du gaz'))[0]!.kind).toBe('chaine');
    // proposition sans lieu : son repère est mis là où est le joueur
    items = todoItems(todoEnv({ proposals: [{ ...PROPOSAL, x: 0, z: 0 }], player: { x: 12, z: 34, title: '', inVehicle: false } }), null);
    expect([items[0]!.repere!.x, items[0]!.repere!.z]).toEqual([12, 34]);
    // lecture seule : rien
    expect(todoItems(todoEnv({ incidents: [incident(1, 3)], level: 'lecture' }), null)).toEqual([]);
  });
});

// ───────────────────────────── « Plus… » ─────────────────────────────

function ctxOf(over: Partial<MoreContext> = {}): MoreContext {
  return { level: 'tout', incidents: true, traffic: true, metro: true, drone: false, verbFirst: true, help: true, extra: [], ...over };
}

describe('« Plus… » selon le rôle', () => {
  it('numérote sans trou, garde les data-id, masque ce qui ne concerne pas le joueur', () => {
    let e = moreEntries(ctxOf());
    expect(e.map((x) => x.label)).toEqual(['Tous les ordres', 'Tous les incidents et secours', 'Circulation et métro', 'Journal radio', 'Affichage de la carte', 'Aide clavier']);
    expect(e.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(e.map((x) => x.dataId)).toEqual(['more-ordres', 'tab-incidents', 'tab-circulation', 'tab-journal', 'more-affichage', 'more-aide']);
    expect(e[0]!.sub).toBe(`les ${ORDER_VERBS.length} ordres, expliqués, par famille`);
    expect(e.find((x) => x.id === 'journal')!.key).toBe('J');
    // un drone engagé : « Vue drone » ; au plus huit entrées
    e = moreEntries(ctxOf({ drone: true, extra: [{ id: 'commissariats', label: 'Commissariats', key: 'KeyC', icon: 'flag' }] }));
    expect(e.map((x) => x.id)).toEqual(['ordres', 'incidents', 'circulation', 'commissariats', 'journal', 'affichage', 'drone', 'aide']);
    expect(e.find((x) => x.id === 'commissariats')!.key).toBe('C');
    expect(e.length).toBeLessThanOrEqual(8);
    // lecture seule : pas de « Tous les ordres »
    e = moreEntries(ctxOf({ level: 'lecture' }));
    expect(e.some((x) => x.id === 'ordres')).toBe(false);
    expect(e.map((x) => x.n)).toEqual(e.map((_, i) => i + 1));
    // chef de groupe : la circulation sans le métro
    e = moreEntries(ctxOf({ level: 'unite' }));
    expect(e.find((x) => x.id === 'circulation')!.label).toBe('Circulation');
    expect(e.some((x) => /métro/i.test(x.label + x.sub))).toBe(false);
    expect(moreEntries(ctxOf({ level: 'unite', traffic: false })).some((x) => x.id === 'circulation')).toBe(false);
    // sans branchement de la fiche « ordre d'abord » ni de l'aide, les entrées qui ne feraient rien sont absentes
    e = moreEntries(ctxOf({ verbFirst: false, help: false, incidents: false }));
    expect(e.map((x) => x.id)).toEqual(['circulation', 'journal', 'affichage']);
  });

  it('une section ajoutée (commissariats) s’enregistre et se retire', async () => {
    const off = registerMoreSection({ id: 'commissariats', label: 'Commissariats', key: 'KeyC', mount: () => ({ refresh() {}, dispose() {} }) });
    const { moreSections } = await import('@/ui/command/panelMore');
    expect(moreSections().map((s) => s.id)).toContain('commissariats');
    off();
    expect(moreSections().map((s) => s.id)).not.toContain('commissariats');
  });
});

// ───────────────────────────── « Cadre légal » ─────────────────────────────

function legal(over: Partial<LegalViewInput> = {}): LegalViewInput {
  return {
    level: 'tout', canSommation: true, canAuthorize: true, salle: false, officer: true, sommations: 0, lawful: 1, authorised: 1, ceiling: 4,
    underAttack: false, chain: null, ...over,
  };
}

describe('« Cadre légal » selon le rôle', () => {
  it('commandant : les sommations puis les quatre niveaux, en mots, l’autorisé coché', () => {
    const v = legalView(legal());
    expect(v.head).toBe('La loi permet maintenant\u00a0: mains nues. Vous autorisez\u00a0: mains nues.');
    expect(v.lines.map((l) => l.label)).toEqual([
      'Faire les sommations', 'Faire la sommation suivante seulement\u00a0: l’annonce', 'Autoriser\u00a0: mains nues seulement', 'Autoriser\u00a0: bâton et gazeuse',
      'Autoriser\u00a0: gaz lacrymogène et canon à eau', 'Autoriser\u00a0: grenades et lanceurs de balles (LBD)',
    ]);
    expect(v.lines[0]!.sub).toBe('les 3 avertissements, ~1\u00a0min\u00a030');
    expect(v.lines.filter((l) => l.on).map((l) => l.id)).toEqual(['legal-force-1']);
    expect(v.lines.find((l) => l.id === 'legal-force-3')!.over).toBe(true);
    for (const l of v.lines) expect(l.label, l.id).not.toMatch(/\d/);
    expect(v.notes[0]!.text).toMatch(/^Avant toute force au-delà des mains nues, la loi demande les 3 sommations/);
    // une sommation faite : la suivante est « la première sommation » ; toutes faites : la ligne le dit et se grise
    expect(legalView(legal({ sommations: 1 })).lines[1]!.label).toBe('Faire la sommation suivante seulement\u00a0: la première sommation');
    const done = legalView(legal({ sommations: 3, authorised: 3, lawful: 3 }));
    expect(done.lines[0]!.label).toBe('Sommations faites');
    expect(done.lines[0]!.disabled).toBe(true);
    expect(done.lines.some((l) => l.id === 'legal-sommation')).toBe(false);
    // autoriser plus que la loi ne permet : coché, dit « en vigueur après les sommations », averti
    const pending = legalView(legal({ authorised: 1, ordered: 3 }));
    expect(pending.lines.find((l) => l.on)!.id).toBe('legal-force-3');
    expect(pending.lines.find((l) => l.on)!.sub).toBe('autorisé : en vigueur après les sommations');
    expect(pending.head).toBe('La loi permet maintenant\u00a0: mains nues. Vous autorisez\u00a0: gaz lacrymogène et canon à eau, en vigueur après les sommations.');
    expect(pending.notes.some((n) => n.tone === 'warn')).toBe(true);
    // riposte
    expect(legalView(legal({ underAttack: true })).notes.some((n) => /riposte immédiate/.test(n.text))).toBe(true);
    // chaîne en cours : son texte, « Annuler », les sommations à la main sont grisées
    const busy = legalView(legal({ chain: chain('sommation', true, 'Sommations — sommation 2 sur 3 dans 25\u00a0s') }));
    expect(busy.chain).toEqual({ text: 'Sommations — sommation 2 sur 3 dans 25\u00a0s', cancel: true, tone: 'normal' });
    expect(busy.lines[0]!.disabled && busy.lines[1]!.disabled).toBe(true);
  });

  it('chef de groupe : « Mes ordres jusqu’à », « Demander plus de force », ni sommations ni autorisation', () => {
    const v = legalView(legal({ level: 'unite', canSommation: false, canAuthorize: false, authorised: 2, ceiling: 4 }));
    expect(v.lines.map((l) => l.label)).toEqual([
      'Mes ordres jusqu’à\u00a0: mains nues seulement', 'Mes ordres jusqu’à\u00a0: bâton et gazeuse', 'Mes ordres jusqu’à\u00a0: gaz lacrymogène et canon à eau',
      'Mes ordres jusqu’à\u00a0: grenades et lanceurs de balles (LBD)', 'Demander plus de force (radio)',
    ]);
    expect(v.lines.filter((l) => l.disabled).map((l) => l.id)).toEqual(['legal-ceiling-3', 'legal-ceiling-4']);
    expect(v.lines.find((l) => l.on)!.id).toBe('legal-ceiling-2');
    expect(v.head).toBe('La loi permet maintenant\u00a0: mains nues. Le commandant autorise\u00a0: bâton et gazeuse. Vos ordres\u00a0: jusqu’à bâton et gazeuse.');
    expect(v.notes[0]!.text).toBe('Sommations\u00a0: réservées au commissaire ou à l’officier ceint.');
  });

  it('salle de commandement : l’officier sur place ; sans autorité : la raison', () => {
    const salle = legalView(legal({ salle: true }));
    expect(salle.lines[0]!.label).toBe('Faire faire les sommations par l’officier sur place');
    expect(salle.lines[1]!.label).toBe('Faire faire la sommation suivante seulement\u00a0: l’annonce');
    const none = legalView(legal({ canSommation: false, salle: false }));
    expect(none.lines.some((l) => l.action.kind === 'chain' || l.action.kind === 'once')).toBe(false);
    expect(none.notes.some((n) => n.text === 'Sommations\u00a0: réservées au commissaire ou à l’officier ceint.')).toBe(true);
    const ro = legalView(legal({ level: 'lecture', canSommation: false, canAuthorize: false }));
    expect(ro.lines).toEqual([]);
    expect(ro.notes[0]!.text).toBe('Lecture seule\u00a0: vous ne donnez pas d’ordre.');
  });
});

// ───────────────────────────── « Tous les ordres » ─────────────────────────────

describe('« Tous les ordres »', () => {
  it('liste les 26 ordres (27 avec « Rentrer au commissariat »), expliqués, et la recherche filtre', () => {
    const flat = (q: string): string[] => ordersList(q, { authorised: 1, underAttack: false }).flatMap((f) => f.rows.map((r) => r.type as string));
    expect(ORDER_VERBS.length).toBe(26);
    expect(flat('').length).toBe(26);
    expect(ordersCount()).toBe(26);
    for (const f of ordersList('', { authorised: 1, underAttack: false })) {
      expect(['Se placer', 'Se déplacer', 'Face à la foule', 'Intervenir', 'Fin d’action']).toContain(f.label);
      for (const r of f.rows) {
        expect(r.label.trim(), r.type).not.toBe('');
        expect(r.explain.trim(), r.type).not.toBe('');
      }
    }
    // la force non autorisée est marquée, en mots
    const gas = ordersList('', { authorised: 1, underAttack: false }).flatMap((f) => f.rows).find((r) => r.type === 'disperser_gaz')!;
    expect(gas.locked).toBe('autoriser le gaz');
    expect(ordersList('', { authorised: 3, underAttack: false }).flatMap((f) => f.rows).find((r) => r.type === 'disperser_gaz')!.locked).toBe('');
    // recherche : accents et majuscules ignorés, chaque mot doit figurer
    expect(flat('gaz')).toContain('disperser_gaz');
    expect(flat('degager')).toEqual(expect.arrayContaining(['degager_barricade', 'degager_obstacle']));
    expect(flat('BARRER la rue')).toContain('couper_circulation');
    expect(flat('zzzz')).toEqual([]);
    expect(matchOrder({ plain: 'Se protéger (tortue)', explain: '', label: '', short: '' }, 'proteger')).toBe(true);
    // « Rentrer au commissariat » ajouté par le module des commissariats : 27, dans « Fin d'action »
    const extra = { type: 'retour_poste' as OrderType, label: 'Retour au poste', short: 'Retour', group: 'fin', gesture: 'immediate', force: 0, coercive: false, hint: '', rule: '', ...EXTRA_PLAIN['retour_poste']! } as OrderVerb;
    (ORDER_VERBS as OrderVerb[]).push(extra);
    try {
      expect(flat('').length).toBe(27);
      const fin = ordersList('', { authorised: 1, underAttack: false }).find((f) => f.group === 'fin')!;
      expect(fin.rows.map((r) => r.label)).toContain('Rentrer au commissariat');
      expect(flat('commissariat')).toEqual(['retour_poste']);
    } finally {
      (ORDER_VERBS as OrderVerb[]).pop();
    }
  });
});

// ───────────────────────────── de vraies parties ─────────────────────────────

const MODULES = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command];
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

/**
 * Environnement des fiches relu dans la partie : la scène des cartes ne se recalcule qu'à intervalles de temps réel
 * (horloge du navigateur), alors qu'un test fait avancer la simulation d'un coup — on la force à se relire.
 */
function freshEnv(core: CommandCore): ReturnType<typeof cardEnvFromCore> {
  core.maps.scene.invalidate();
  return cardEnvFromCore(core);
}

async function concorde(role: string, extra: Record<string, unknown> = {}, seed = 21): Promise<{ t: ReturnType<typeof createTestContext>; core: CommandCore }> {
  const t = createTestContext({ seed, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role, rank: role === 'commandant' ? 'commandant' : undefined, place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.4,
    volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain', ...extra },
  } as never);
  t.step(3);
  return { t, core: t.ctx.service<CommandCore>('ui.command')! };
}

describe('panneaux d’une vraie partie (place de la Concorde)', () => {
  it('commandant : groupes repliés (au plus six rangées), un barrage suivi en route, une colonne qui embarque', async () => {
    const { t, core } = await concorde('commandant');
    const memory = new Map<number, { issuedAt: number; total: number; since: number }>();
    let env = freshEnv(core);
    let rows = followRows(env.units, readTracks(core, env, memory), { now: t.ctx.clock.now, unfolded: new Map(), chain: chainOf(core) });
    expect(rows.length).toBeLessThanOrEqual(6);
    expect(rows.filter((r) => r.name.startsWith('Section MISTRAL')).length).toBe(3);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
    // Centaure, canon à eau et les deux fourgons cellulaires avec leur équipage (mise en place P5, 300 manifestants)
    expect(rows.some((r) => r.name === 'Engins (4)'), rows.map((r) => r.name).join(', ')).toBe(true);
    for (const r of rows) {
      expect(r.doing, r.name).not.toMatch(/_/);
      expect(r.doing.trim(), r.name).not.toBe('');
    }
    // MISTRAL 2 barre une vraie rue qui part de la place : « Barre la rue … », en route à pied
    const crowdExit = env.crowds.flatMap((c) => c.exits).find((e) => e.street !== '' && !e.held);
    expect(crowdExit).toBeDefined();
    const m2 = t.ctx.squads.list.find((s) => s.name === 'MISTRAL 2')!;
    const road = env.roadAt(crowdExit!.x, crowdExit!.z, 30)!;
    expect(road).not.toBeNull();
    const r1 = core.issue('couper_circulation', [m2], [{ x: road.x, z: road.z, heading: road.heading, width: road.width }]);
    expect(r1.ok).toBe(true);
    t.step(2);
    env = freshEnv(core);
    rows = followRows(env.units, readTracks(core, env, memory), { now: t.ctx.clock.now, unfolded: new Map(), chain: chainOf(core) });
    const row2 = rows.find((r) => r.squadId === m2.id)!;
    expect(row2.doing.startsWith('Barre ')).toBe(true);
    expect(row2.doing.toLocaleLowerCase('fr-FR')).toContain(road.name.toLocaleLowerCase('fr-FR'));
    expect(row2.status).toMatch(/^(en route à pied · ~\d+\u00a0min|en place)$/);
    // MISTRAL 3 envoyée à 900 m : la colonne embarque d'abord (ses fourgons), la rangée le dit
    const m3 = t.ctx.squads.list.find((s) => s.name === 'MISTRAL 3')!;
    const far = env.roadAt(-10 + 900, 15, 200) ?? { x: -10 + 900, z: 15, heading: 0, width: 0, name: '', edgeId: -1 };
    const r2 = core.issue('colonne', [m3], [{ x: far.x, z: far.z, heading: 0, width: 0 }]);
    expect(r2.ok).toBe(true);
    t.step(1);
    env = freshEnv(core);
    rows = followRows(env.units, readTracks(core, env, memory), { now: t.ctx.clock.now, unfolded: new Map(), chain: chainOf(core) });
    const row3 = rows.find((r) => r.squadId === m3.id)!;
    expect(row3.doing.startsWith('Va en véhicules')).toBe(true);
    expect(row3.status).toMatch(/^(embarque \(\d+\/\d+ à bord\)|embarque|en route en véhicules.*)$/);
    // « À traiter » de cette partie : au plus trois, jamais en lecture seule
    expect(todoItems(env, chainOf(core)).length).toBeLessThanOrEqual(3);
  }, 300000);

  it('commandant : « Cadre légal » lu dans la partie et « Faire les sommations » lance la chaîne légale (ou dit pourquoi)', async () => {
    const { t, core } = await concorde('commandant', {}, 22);
    const v = legalView(legalInput(core));
    expect(v.lines[0]!.id).toBe('legal-sommations');
    expect(v.lines.some((l) => l.id === 'legal-force-3')).toBe(true);
    const r = startSommationChain(core);
    if (r.ok) {
      expect(core.legalChain.active()).toBe(true);
      t.step(1);
      const c = chainOf(core)!;
      expect(c.status.text.startsWith('Sommations')).toBe(true);
      const env = freshEnv(core);
      const rows = followRows(env.units, new Map(), { now: t.ctx.clock.now, unfolded: new Map(), chain: c });
      expect(rows[rows.length - 1]!.cancel).toBe(true);
      core.legalChain.cancel();
      expect(core.legalChain.active()).toBe(false);
    } else {
      expect(r.text.trim()).not.toBe('');
    }
  }, 300000);

  it('chef de groupe : « Cadre légal » de chef de groupe, « Mes unités » limitée à son groupe', async () => {
    const { core } = await concorde('chef_groupe', {}, 23);
    const sc = core.scope();
    expect(sc.level).toBe('unite');
    const v = legalView(legalInput(core));
    expect(v.lines.some((l) => l.action.kind === 'request')).toBe(true);
    expect(v.lines.some((l) => l.action.kind === 'authorize')).toBe(false);
    const env = freshEnv(core);
    const rows = followRows(env.units, new Map(), { now: 0, unfolded: new Map(), chain: null });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) if (r.squadId > 0) expect(core.canCommand(r.squadId)).toBe(true);
  }, 300000);
});

// ───────────────────────────── les panneaux montés (petit DOM de test) ─────────────────────────────

type Handler = (e: { type: string; stopPropagation(): void; preventDefault(): void; key?: string }) => void;

/** Juste ce que les panneaux emploient du DOM : création, arbre, classes, data-*, style, texte, clics, sélecteurs simples. */
class FakeNode {
  className = '';
  type = '';
  title = '';
  tabIndex = 0;
  disabled = false;
  value = '';
  placeholder = '';
  autocomplete = '';
  spellcheck = true;
  scrollTop = 0;
  scrollHeight = 0;
  clientHeight = 0;
  readonly dataset: Record<string, string> = {};
  readonly children: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  private text = '';
  private html = '';
  private readonly attrs = new Map<string, string>();
  private readonly handlers = new Map<string, Handler[]>();
  readonly style: Record<string, string> & { setProperty(k: string, v: string): void; getPropertyValue(k: string): string } = Object.assign(
    Object.create(null) as Record<string, string>,
    {
      setProperty(this: Record<string, string>, k: string, v: string): void { this[k] = v; },
      getPropertyValue(this: Record<string, string>, k: string): string { return this[k] ?? ''; },
    },
  );
  readonly classList = {
    contains: (c: string): boolean => this.className.split(/\s+/).includes(c),
    add: (...cs: string[]): void => { for (const c of cs) if (!this.classList.contains(c)) this.className = (this.className + ' ' + c).trim(); },
    remove: (...cs: string[]): void => { this.className = this.className.split(/\s+/).filter((c) => !cs.includes(c)).join(' '); },
    toggle: (c: string, on?: boolean): boolean => {
      const want = on ?? !this.classList.contains(c);
      if (want) this.classList.add(c);
      else this.classList.remove(c);
      return want;
    },
  };
  constructor(readonly tagName: string) {}
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v: string) {
    for (const c of this.children) c.parentNode = null;
    this.children.length = 0;
    this.html = '';
    this.text = v;
  }
  get innerHTML(): string { return this.html; }
  set innerHTML(v: string) { this.textContent = ''; this.html = v; }
  get firstChild(): FakeNode | null { return this.children[0] ?? null; }
  get childElementCount(): number { return this.children.length; }
  appendChild(c: FakeNode): FakeNode {
    c.parentNode?.removeChild(c);
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  append(...cs: FakeNode[]): void { for (const c of cs) this.appendChild(c); }
  removeChild(c: FakeNode): FakeNode {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  remove(): void { this.parentNode?.removeChild(this); }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  addEventListener(type: string, fn: Handler): void { this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]); }
  removeEventListener(): void {}
  dispatch(type: string, extra: { key?: string } = {}): void {
    const e = { type, stopPropagation(): void {}, preventDefault(): void {}, ...extra };
    for (const h of this.handlers.get(type) ?? []) h(e);
  }
  click(): void { if (!this.disabled) this.dispatch('click'); }
  focus(): void {}
  blur(): void {}
  getContext(): null { return null; }
  toDataURL(): string { return ''; }
  /** Visible : ni lui ni un parent n'a display none. */
  get shown(): boolean {
    for (let n: FakeNode | null = this; n; n = n.parentNode) if (n.style.display === 'none') return false;
    return true;
  }
  private matches(sel: string): boolean {
    const m = /^([a-z]*)(?:\.([\w-]+))?(?:\[data-([\w-]+)="([^"]*)"\])?$/.exec(sel);
    if (!m) throw new Error('sélecteur non géré : ' + sel);
    if (m[1] && this.tagName !== m[1]) return false;
    if (m[2] && !this.classList.contains(m[2])) return false;
    if (m[3] && this.dataset[m[3].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] !== m[4]) return false;
    return true;
  }
  all(sel: string, out: FakeNode[] = []): FakeNode[] {
    for (const c of this.children) {
      if (c.matches(sel)) out.push(c);
      c.all(sel, out);
    }
    return out;
  }
  querySelector(sel: string): FakeNode | null { return this.all(sel)[0] ?? null; }
  querySelectorAll(sel: string): FakeNode[] { return this.all(sel); }
  /** Bouton par son data-id. */
  byId(id: string): FakeNode | null { return this.all('button').find((b) => b.dataset.id === id) ?? null; }
}

function installDom(): () => void {
  const g = globalThis as Record<string, unknown>;
  const before = g.document;
  g.document = { createElement: (tag: string) => new FakeNode(tag), body: new FakeNode('body') };
  return () => { g.document = before; };
}

describe('panneaux montés sur une vraie partie (petit DOM de test)', () => {
  it('« Mes unités » ouvre la fiche d’une unité et se déplie ; « Cadre légal » autorise vraiment ; « Plus… » mène aux sections', async () => {
    const { t, core } = await concorde('commandant', {}, 24);
    const restore = installDom();
    try {
      const { FollowPanel } = await import('@/ui/command/panelFollow');
      const { LegalPanel } = await import('@/ui/command/panelLegal');
      const { MorePanel } = await import('@/ui/command/panelMore');
      // « À traiter » + « Mes unités »
      const host = new FakeNode('div');
      const picked: { kind: string; squadId?: number }[] = [];
      const follow = new FollowPanel(core, host as never, { onPickRepere: (r) => picked.push(r) });
      follow.refresh(true);
      const rows = follow.unitRows;
      expect(rows.length).toBeGreaterThanOrEqual(4);
      const mainRows = (host.all('button').filter((b) => b.dataset.id?.startsWith('follow-u-')));
      expect(mainRows.length).toBe(rows.filter((r) => r.kind === 'unit').length);
      for (const b of host.all('button')) expect(b.tabIndex).toBe(-1);
      mainRows[0]!.click();
      expect(picked[0]!.kind).toBe('unite');
      expect(picked[0]!.squadId).toBe(rows[0]!.squadId);
      // la flèche de la première section la déplie : ses groupes apparaissent dessous
      const fold = host.all('span.cp-fold').find((s) => s.getAttribute('role') === 'button')!;
      fold.click();
      expect(follow.unitRows.length).toBeGreaterThan(rows.length);
      expect(follow.unitRows[1]!.depth).toBe(1);
      expect(follow.fold(false, follow.unitRows[0]!.key)).toBe(true);
      expect(follow.unitRows.length).toBe(rows.length);
      expect(typeof follow.todoCount).toBe('number');
      follow.dispose();

      // « Cadre légal » : numérotées 1…6 ; « Autoriser : bâton et gazeuse » change vraiment la force autorisée
      const lhost = new FakeNode('div');
      const legalPanel = new LegalPanel(core, lhost as never, {});
      legalPanel.refresh(true);
      const numbered = lhost.all('button').filter((b) => b.dataset.n !== undefined);
      expect(numbered.map((b) => b.dataset.n)).toEqual(['1', '2', '3', '4', '5', '6']);
      // ordonner « gaz » avant les sommations : enregistré (coché, « en vigueur après les sommations »), pas encore en vigueur
      lhost.byId('legal-force-3')!.click();
      expect(orderedForce(core)).toBe(3);
      expect(t.ctx.law.roe.authorizedForce).toBe(t.ctx.law.roe.lawfulForce);
      expect(legalPanel.current!.lines.find((l) => l.on)!.id).toBe('legal-force-3');
      expect(legalPanel.current!.head).toMatch(/Vous autorisez\u00a0: gaz lacrymogène et canon à eau, en vigueur après les sommations\.$/);
      // revenir à « mains nues seulement » (le niveau en vigueur) annule vraiment l'ordre donné
      lhost.byId('legal-force-1')!.click();
      expect(orderedForce(core)).toBe(1);
      expect(legalPanel.current!.lines.find((l) => l.on)!.id).toBe('legal-force-1');
      legalPanel.dispose();

      // « Plus… » : le menu, « Tous les ordres » (l'ordre choisi part vers la fiche), la circulation, l'affichage, l'aide
      const mhost = new FakeNode('div');
      const layers: Record<string, boolean> = { units: true, orders: true, crowd: true, hazards: true, incidents: true, closures: true, barrages: true, metro: true, route: true };
      let invalidated = 0;
      const areas: number[] = [];
      const map = {
        overlay: { layers }, invalidate: () => { invalidated++; }, view: { cx: -10, cz: 15, mpp: 1, contains: () => true }, flyTo: () => {},
      };
      const tmap = {
        selectedUnits: () => [], closureName: () => 'rue Royale', closeArea: (_x: number, _z: number, r: number) => { areas.push(r); },
        canReceive: () => true, assignToUnit: () => true, pickUnit: () => null,
      };
      const verbs: string[] = [];
      let help = 0;
      let closed = 0;
      const more = new MorePanel(core, mhost as never, {
        state: { focusClosure: 0, focusStation: 0, focusIncident: 0, selection: new Set(), mode: { kind: 'idle' }, dropKey: 0, touch() {}, setMode() {} } as never,
        map: map as never, tmap: tmap as never, onVerbFirst: (v) => verbs.push(v), onHelp: () => { help++; }, onClose: () => { closed++; },
        where: () => ({ x: -10, z: 15, name: 'place de la Concorde' }),
      });
      more.refresh(true);
      const menu = mhost.all('button').filter((b) => b.dataset.n !== undefined && b.shown);
      expect(menu.map((b) => b.dataset.id)).toEqual(more.menuEntries.map((e) => e.dataId));
      expect(menu[0]!.dataset.id).toBe('more-ordres');
      menu[0]!.click();
      expect(more.current).toBe('ordres');
      // le menu est vidé pendant la section : ses numéros ne répondent plus aux chiffres
      expect(mhost.all('button').filter((b) => b.dataset.n !== undefined).length).toBe(0);
      expect(mhost.all('button').filter((b) => b.dataset.id?.startsWith('verb-')).length).toBe(ORDER_VERBS.length);
      const input = mhost.querySelector('input')!;
      input.value = 'gaz';
      input.dispatch('input');
      const shownVerbs = mhost.all('button').filter((b) => b.dataset.id?.startsWith('verb-'));
      expect(shownVerbs.map((b) => b.dataset.id)).toContain('verb-disperser_gaz');
      expect(shownVerbs.length).toBeLessThan(ORDER_VERBS.length);
      input.dispatch('keydown', { key: 'Enter' });
      expect(verbs[0]).toBe(shownVerbs[0]!.dataset.type);
      mhost.byId('verb-ligne')?.click();
      expect(more.back()).toBe(true);
      expect(more.current).toBeNull();
      if (core.traffic) {
        more.open('circulation');
        expect(more.current).toBe('circulation');
        mhost.byId('tac-close-area-200')!.click();
        expect(areas).toEqual([200]);
        more.back();
      }
      more.open('affichage');
      mhost.byId('layer-units')!.click();
      expect(layers.units).toBe(false);
      expect(invalidated).toBe(1);
      more.back();
      more.open('journal');
      expect(more.current).toBe('journal');
      more.refresh(false);
      // la feuille rouverte revient au menu ; l'aide est une action
      more.refresh(true);
      expect(more.current).toBeNull();
      mhost.byId('more-aide')!.click();
      expect(help).toBe(1);
      mhost.byId('more-close')!.click();
      expect(closed).toBe(1);
      more.dispose();
    } finally {
      restore();
    }
  }, 300000);
});
