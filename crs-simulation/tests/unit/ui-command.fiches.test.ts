// Carte de commandement — fiches des repères (intents.ts) et mots des ordres (orders.ts) : au plus six lignes, la ligne
// de l'intention toujours visible, les deux barrages de rue, le cadenas légal, la lecture seule, la fiche d'un poste,
// et aucun ordre perdu. La fin du fichier construit les fiches d'une vraie partie (place de la Concorde).
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
import type {
  Card, CardCrowd, CardEnv, CardIncident, CardLine, CardStation, CardUnit, IntentId, Repere, RepereKind,
} from '@/ui/command/cardTypes';
import {
  INTENTS, MAX_LINES, allOrdersGrouped, buildCard, intentCandidates, registerCardBuilder, registerCardLines, plainLine,
} from '@/ui/command/intents';
import {
  BARRAGE_LET_PASSERSBY, EXTRA_PLAIN, FORCE_WORDS, ORDER_GROUP_LABELS, ORDER_VERBS, doingAt, forceWord, orderLabel, tagOf,
  withArticle,
} from '@/ui/command/orders';
import { cardEnvFromCore, collectReperes, crowdRepere, exitRepere, incidentRepere, pointRepere, unitRepere } from '@/ui/command/reperes';

// ───────────────────────────── environnement de fiches fait main ─────────────────────────────

function unit(squadId: number, name: string, symbol: CardUnit['symbol'], x: number, z: number, extra: Partial<CardUnit> = {}): CardUnit {
  return {
    squadId, key: squadId, name, symbol, x, z, total: 19, valid: 19, morale: 0.8, ammo: 40, order: null, orderPlace: '', status: '',
    embarked: false, hasVehicles: true, mine: true, patrol: false, homeStation: '', targetEntity: 1000 + squadId, parentId: 0,
    hasPlayer: false, ...extra,
  };
}

const MAIN: CardCrowd = {
  key: 'c', name: 'Tête de cortège', place: 'rue Royale', x: 0, z: 0, radius: 90, people: 300, tension: 0.45, heading: 0, main: true,
  exits: [
    { x: 0, z: 60, heading: 0, width: 14, street: 'rue Royale', edgeId: 11, held: false, squadId: 0, mode: 'ouvert' },
    { x: 0, z: -60, heading: Math.PI, width: 12, street: 'rue Saint-Florentin', edgeId: 12, held: false, squadId: 0, mode: 'ouvert' },
    { x: 60, z: 0, heading: Math.PI / 2, width: 20, street: 'rue de Rivoli', edgeId: 13, held: true, squadId: 2, mode: 'ferme' },
  ],
  kettleId: 0, closed: false,
};
const KETTLE: CardCrowd = {
  key: 'k4', name: 'Nasse — place de la République', place: 'place de la République', x: 800, z: 0, radius: 40, people: 120, tension: 0.7,
  heading: NaN, main: false, kettleId: 4, closed: true,
  exits: [{ x: 830, z: 0, heading: 0, width: 18, street: 'rue du Temple', edgeId: 21, held: true, squadId: 3, mode: 'ferme' }],
};

function incident(id: number, kind: CardIncident['kind'], x: number, z: number, extra: Partial<CardIncident> = {}): CardIncident {
  return {
    id, kind, x, z, urgency: 2, state: 'ouvert', means: '', squadId: 0, assignee: '', place: 'rue Royale', age: 40, targetId: 0, callId: 0,
    callVehicleId: 0, ...extra,
  };
}

const STATION: CardStation = {
  id: 'c9', name: 'commissariat du 9e', street: 'rue Chauchat', x: 900, z: -1800, distance: 2100, eta: 240, renforts: true,
  entries: [
    { entryId: 1, name: 'TV 75-19', what: 'voiture de police secours, 3 gardiens', state: 'pret', stateLabel: 'prête', eta: 240, defaultVerb: 'avancer', icon: 'siren' },
    { entryId: 2, name: 'BAC 75-9', what: 'voiture banalisée, 3 policiers', state: 'pret', stateLabel: 'prête', eta: 260, defaultVerb: 'avancer', icon: 'car' },
    { entryId: 3, name: 'FAUCON 9', what: 'BRAV-M (policiers à moto), 6 motos', state: 'alerte', stateLabel: 'en alerte', eta: 200, defaultVerb: 'colonne', icon: 'bolt' },
    { entryId: 4, name: 'TV 75-20', what: 'voiture de police secours, 3 gardiens', state: 'repos', stateLabel: 'au repos', eta: 240, defaultVerb: 'avancer', icon: 'siren' },
  ],
};

function makeEnv(over: Partial<CardEnv> = {}): CardEnv {
  return {
    level: 'tout', canTraffic: true, canSommation: true, canAuthorize: true, canMetro: true, canDelegate: true, salle: false,
    sommations: 0, lawful: 1, authorised: 1, underAttack: false, riposteAt: () => false, command: 'compagnie',
    crowds: [MAIN, KETTLE],
    incidents: [
      incident(1, 'feu_vehicule', 100, 40), incident(2, 'suspect', 30, 30, { targetId: 77 }), incident(3, 'barricade', -100, 20, { targetId: 88 }),
      incident(4, 'blesse', 20, -50, { state: 'assigne', means: 'unite', squadId: 3, assignee: 'MISTRAL 3', callId: 9, callVehicleId: 501 }),
    ],
    units: [
      unit(1, 'MISTRAL', 'compagnie', -200, 10, { embarked: true }),
      unit(2, 'MISTRAL 1', 'section', -150, 0, { order: { type: 'couper_circulation', x: 60, z: 0, targetId: 0, issuedAt: 10 }, orderPlace: 'rue de Rivoli', status: 'en place' }),
      unit(3, 'MISTRAL 2', 'section', -120, 30, { valid: 9 }),
      unit(4, 'FAUCON 1', 'bravm', -300, 0, { hasVehicles: false }),
      unit(5, 'CENTAURE 1', 'centaure', -260, -20),
      unit(6, 'NEPTUNE 1', 'canon_eau', -240, 40),
      unit(7, 'TV 75-19', 'patrouille', 300, 300, { patrol: true, homeStation: 'commissariat du 9e' }),
      unit(8, 'VSAV 12', 'pompiers', 400, 0, { mine: false }),
    ],
    closures: [{ id: 5, x: 0, z: -60, name: 'rue Saint-Florentin', heldBy: '' }],
    metro: [{ id: 6, name: 'Concorde', x: -40, z: 80, open: true, filtered: false, inflow: 2 }],
    proposals: [
      { id: 7, key: 'dispositif', text: 'Chef, QUATRE-ZÉRO débouchés à tenir autour du parcours, je propose la mise en place du dispositif.', x: 10, z: 10, executable: true },
      { id: 8, key: 'sommation:3', text: 'Chef, attroupement, place de la Concorde, attroupement caractérisé, je propose de procéder aux sommations.', x: 5, z: 5, executable: false },
    ],
    stations: [STATION],
    player: { x: -210, z: 0, title: 'Commandant Carlier', inVehicle: false },
    blocked: { x: -400, z: 0, street: 'rue de Rivoli' },
    hasRescue: true, selection: [], now: 200,
    farFor: (x, z, squadId) => {
      const u = [unit(2, '', 'section', -150, 0)].find((q) => q.squadId === squadId);
      return !!u && Math.hypot(u.x - x, u.z - z) > 250;
    },
    roadAt: (x, z) => (Math.abs(z) < 8 && x > 200 ? { edgeId: 40, x, z: 0, heading: Math.PI / 2, width: 12, name: 'rue Saint-Honoré' } : null),
    placeName: () => 'place de la Concorde',
    ...over,
  };
}

/** Un repère de chaque genre dans l'environnement fait main. */
function oneOfEach(env: CardEnv): Record<RepereKind, Repere> {
  const all = collectReperes(env);
  const pick = (kind: RepereKind, pred: (r: Repere) => boolean = () => true): Repere => {
    const r = all.find((q) => q.kind === kind && pred(q));
    expect(r, `repère ${kind}`).toBeTruthy();
    return r!;
  };
  return {
    rue: pick('rue', (r) => r.roadEdge === 11), foule: pick('foule'), nasse: pick('nasse'), incident: pick('incident', (r) => r.incidentId === 1),
    unite: pick('unite', (r) => r.squadId === 3), cible: pick('cible'), vous: pick('vous'), point: pointRepere(500, 500, env), metro: pick('metro'),
    fermeture: pick('fermeture'), commissariat: pick('commissariat'), proposition: pick('proposition', (r) => r.proposalId === 7), bloqueur: pick('bloqueur'),
  };
}

const KINDS: readonly RepereKind[] = ['rue', 'foule', 'nasse', 'incident', 'unite', 'cible', 'vous', 'point', 'metro', 'fermeture', 'commissariat', 'proposition', 'bloqueur'];

/** Ligne 1 de chaque fiche, sans intention (tableau du §2.3). */
const FIRST_LINE: Readonly<Record<RepereKind, string>> = {
  rue: 'Barrer la rue', foule: 'Encercler (nasse)', nasse: 'Ouvrir une sortie filtrée', incident: 'Envoyer les pompiers', unite: 'L’envoyer ailleurs…',
  cible: 'La protéger', vous: 'Suivez-moi à pied', point: 'Y aller', metro: 'Fermer la station', fermeture: 'Rouvrir à la circulation',
  commissariat: 'Envoyer TV 75-19 — voiture de police secours, 3 gardiens · prête', proposition: 'Accepter', bloqueur: 'Envoyer le blindé Centaure le pousser',
};

function verbTypes(lines: readonly CardLine[]): string[] {
  return lines.map((l) => (l.action.kind === 'verb' ? String(l.action.type) : `#${l.action.kind}`));
}

describe('fiches — forme', () => {
  const env = makeEnv();
  const reps = oneOfEach(env);

  it('chaque genre de repère : au plus six lignes, la ligne 1 du tableau par défaut', () => {
    for (const kind of KINDS) {
      const card = buildCard(reps[kind], env, null);
      expect(card.lines.length, kind).toBeGreaterThan(0);
      expect(card.lines.length, kind).toBeLessThanOrEqual(MAX_LINES);
      expect(card.defaultLine, kind).toBe(0);
      expect(card.lines[0]!.label, kind).toBe(FIRST_LINE[kind]);
      expect(card.stack).toEqual([reps[kind]]);
    }
  });

  it('pour chaque intention et chaque genre de repère, la ligne par défaut est parmi les six', () => {
    for (const intent of INTENTS) {
      for (const kind of KINDS) {
        const card = buildCard(reps[kind], env, intent.id);
        expect(card.lines.length, `${intent.id}/${kind}`).toBeLessThanOrEqual(MAX_LINES);
        expect(card.defaultLine, `${intent.id}/${kind}`).toBeGreaterThanOrEqual(0);
        expect(card.defaultLine, `${intent.id}/${kind}`).toBeLessThan(card.lines.length);
        expect(card.title).toBe(intent.label.toLocaleUpperCase('fr-FR'));
      }
    }
  });

  it('ligne de l’intention : B barre, N encercle, D repousse (la moins forte permise), I la BRAV-M, S les pompiers, E y va', () => {
    const line = (r: Repere, i: IntentId): CardLine => {
      const c = buildCard(r, env, i);
      return c.lines[c.defaultLine]!;
    };
    expect(line(reps.rue, 'bloquer').label).toBe('Barrer la rue');
    expect(line(reps.foule, 'encercler').action.kind).toBe('nasse');
    expect(line(reps.nasse, 'encercler').action.kind).toBe('filteredExit');
    expect(line(reps.foule, 'disperser').label).toBe('Repousser la foule');
    const suspect = collectReperes(env).find((r) => r.incidentId === 2)!;
    expect(line(suspect, 'interpeller').label).toMatch(/^Interpeller avec la BRAV-M \(\d+\u00a0min\)$/);
    expect(line(reps.incident, 'secours').label).toBe('Envoyer les pompiers');
    expect(line(reps.point, 'secours').label).toBe('Pompiers ici');
    expect(line(reps.point, 'envoyer').label).toBe('Y aller');
    expect(line(reps.unite, 'envoyer').action.kind).toBe('sendElsewhere');
    // I sur une foule : « Interpeller dans la foule » n'est que dans « Autres » ; il prend la place de la ligne 6
    const c = buildCard(reps.foule, env, 'interpeller');
    expect(c.lines.length).toBe(6);
    expect(c.defaultLine).toBe(5);
    expect(c.lines[5]!.label).toBe('Interpeller dans la foule');
    expect(c.others.some((l) => l.label === 'Faire les sommations')).toBe(true);
    // E sur une foule : « Y aller » (en formation) est ajouté et visible
    const e = buildCard(reps.foule, env, 'envoyer');
    expect(e.lines[e.defaultLine]!.label).toBe('Y aller');
    expect(e.lines[e.defaultLine]!.action).toMatchObject({ kind: 'verb', type: 'avancer' });
  });

  it('rue : ligne 1 « Barrer la rue » (targetId 0), ligne 2 « passants admis » (targetId −2), ligne 4 seulement avec la circulation', () => {
    const card = buildCard(reps.rue, env, 'bloquer');
    expect(card.lines.map((l) => l.label)).toEqual([
      'Barrer la rue', 'Barrer la rue, passants admis', 'Barrage filtrant', 'Fermer aux voitures (barrières)', 'Tenir une ligne ici', 'Y aller',
    ]);
    expect(card.lines[0]!.action).toEqual({ kind: 'verb', type: 'couper_circulation', geom: 'street', targetId: 0 });
    expect(card.lines[1]!.action).toEqual({ kind: 'verb', type: 'couper_circulation', geom: 'street', targetId: BARRAGE_LET_PASSERSBY });
    expect(card.lines[3]!.action.kind).toBe('closeRoad');
    expect(card.sub).toContain('Rue Royale');
    expect(card.sub).toContain('personne ne la tient');
    const noTraffic = buildCard(reps.rue, makeEnv({ canTraffic: false }), 'bloquer');
    expect(noTraffic.lines.some((l) => l.action.kind === 'closeRoad')).toBe(false);
    expect(noTraffic.others.some((l) => l.action.kind === 'closeArea' || l.action.kind === 'reopen')).toBe(false);
    expect(noTraffic.lines[0]!.label).toBe('Barrer la rue');
    // une rue tenue le dit
    const held = buildCard(exitRepere(MAIN.exits[2]!, 'c'), env, null);
    expect(held.sub).toContain('tenue par MISTRAL 1');
  });

  it('« Y aller » : en file loin de la foule, en formation à moins de 60 m', () => {
    const far = buildCard(reps.point, env, null).lines[0]!;
    expect(far.action).toMatchObject({ kind: 'verb', type: 'colonne', geom: 'point' });
    const near = buildCard(pointRepere(20, 30, env), env, null).lines[0]!;
    expect(near.label).toBe('Y aller');
    expect(near.action).toMatchObject({ kind: 'verb', type: 'avancer' });
  });

  it('lecture seule : aucune ligne, aucune « Autres ordres », pour chaque genre de repère', () => {
    const ro = makeEnv({ level: 'lecture', canTraffic: false, canSommation: false, canAuthorize: false, canMetro: false, canDelegate: false });
    const r2 = oneOfEach(ro);
    for (const kind of KINDS) {
      for (const intent of [null, ...INTENTS.map((i) => i.id)]) {
        const card = buildCard(r2[kind], ro, intent);
        expect(card.lines, `${kind}/${intent}`).toEqual([]);
        expect(card.others, `${kind}/${intent}`).toEqual([]);
      }
    }
    expect(buildCard(r2.commissariat, ro, null).notes).toContain('Seul le commandant engage les moyens des commissariats.');
  });

  it('chef de groupe : ni métro ni moyens des commissariats', () => {
    const cg = makeEnv({ level: 'unite', canAuthorize: false, canMetro: false, command: 'groupe' });
    const r2 = oneOfEach(cg);
    expect(buildCard(r2.metro, cg, null).lines).toEqual([]);
    const st = buildCard(r2.commissariat, cg, null);
    expect(st.lines.some((l) => l.action.kind === 'engage')).toBe(false);
    expect(buildCard(r2.vous, cg, null).lines[0]!.explain).toBe('Votre groupe descend et vous suit à pied.');
  });

  it('cadenas légal : gaz et charge 🔒 avec ce qui manque ; repousser ⚖ avant la dernière sommation ; riposte : rien', () => {
    const card = buildCard(reps.foule, env, null);
    const gas = card.lines.find((l) => l.label === 'Disperser au gaz lacrymogène')!;
    expect(gas.lock).toEqual({ sommations: 3, force: 3, text: 'sommations 0/3 + autoriser le gaz' });
    expect(gas.coercive).toBe(false);
    const charge = card.lines.find((l) => l.label === 'Charger')!;
    expect(charge.lock).toMatchObject({ sommations: 3, force: 2 });
    const push = card.lines.find((l) => l.label === 'Repousser la foule')!;
    expect(push.lock).toBeNull();
    expect(push.coercive).toBe(true);
    // gaz autorisé, sommations pas faites : permis, mais ⚖
    const auth = buildCard(reps.foule, makeEnv({ authorised: 3 }), null).lines.find((l) => l.label === 'Disperser au gaz lacrymogène')!;
    expect(auth.lock).toBeNull();
    expect(auth.coercive).toBe(true);
    // sommations faites : ni ⚖ ni 🔒
    const done = buildCard(reps.foule, makeEnv({ authorised: 3, sommations: 3 }), null).lines.find((l) => l.label === 'Disperser au gaz lacrymogène')!;
    expect(done.lock).toBeNull();
    expect(done.coercive).toBe(false);
    // riposte permise près de la foule : pas de sommations à attendre
    const rip = buildCard(reps.foule, makeEnv({ riposteAt: () => true }), null).lines.find((l) => l.label === 'Repousser la foule')!;
    expect(rip.coercive).toBe(false);
    // chef de groupe : il ne peut pas autoriser, il demande
    const cg = buildCard(reps.foule, makeEnv({ canAuthorize: false, level: 'unite' }), null).lines.find((l) => l.label === 'Disperser au gaz lacrymogène')!;
    expect(cg.lock!.text).toBe('sommations 0/3 + autoriser le gaz (demande radio)');
    // les sommations : ligne 6 tant qu'elles ne sont pas faites, puis le bond
    expect(card.lines[5]!.action).toEqual({ kind: 'sommation', all: true });
    expect(buildCard(reps.foule, makeEnv({ sommations: 3 }), null).lines[5]!.action).toMatchObject({ kind: 'verb', type: 'bond_offensif' });
  });

  it('aucune ligne de point n’emploie « tenir » (il tiendrait là où est l’unité)', () => {
    const card = buildCard(reps.point, env, null);
    expect(verbTypes(card.lines.concat(card.others))).not.toContain('tenir');
    for (const intent of INTENTS) {
      const c = buildCard(reps.point, env, intent.id);
      expect(verbTypes(c.lines.concat(c.others))).not.toContain('tenir');
    }
    expect(verbTypes(buildCard(reps.unite, env, null).lines)).toContain('tenir');
  });

  it('commissariat : unités prêtes puis en alerte, et « Toutes les unités du poste… » juste après, sans numéro sauté', () => {
    const card = buildCard(reps.commissariat, env, null);
    expect(card.lines.map((l) => l.action.kind)).toEqual(['engage', 'engage', 'engage', 'stationList']);
    expect(card.lines[0]!.label).toBe('Envoyer TV 75-19 — voiture de police secours, 3 gardiens · prête');
    expect(card.lines[2]!.label).toContain('FAUCON 9');
    expect(card.lines[0]!.action).toEqual({ kind: 'engage', entryId: 1, defaultVerb: 'avancer' });
    expect(card.sub).toBe('2,1\u00a0km · ≈\u00a04\u00a0min deux-tons · 2 prêtes');
    // sept unités prêtes : cinq lignes d'envoi, la liste en sixième
    const many: CardStation = { ...STATION, entries: Array.from({ length: 7 }, (_, i) => ({ ...STATION.entries[0]!, entryId: 10 + i, name: `TV 75-${30 + i}`, eta: 100 + i })) };
    const c7 = buildCard(reps.commissariat, makeEnv({ stations: [many] }), null);
    expect(c7.lines.map((l) => l.action.kind)).toEqual(['engage', 'engage', 'engage', 'engage', 'engage', 'stationList']);
    // une mission sans renforts : la liste seule, et la note
    const fixed = buildCard(reps.commissariat, makeEnv({ stations: [{ ...STATION, renforts: false }] }), null);
    expect(fixed.lines.map((l) => l.action.kind)).toEqual(['stationList']);
    expect(fixed.notes).toContain('Moyens fixés par l’ordre d’opération.');
  });

  it('incident : un moyen par ligne dans l’ordre MEANS_FOR, avec le délai ; retirer l’affectation et annuler les secours', () => {
    const fire = buildCard(reps.incident, env, null);
    expect(fire.lines.map((l) => l.label)).toEqual(['Envoyer les pompiers', expect.stringMatching(/^Envoyer le canon à eau NEPTUNE 1 \(\d+\u00a0min\)$/)]);
    const blesse = buildCard(collectReperes(env).find((r) => r.incidentId === 4)!, env, null);
    expect(blesse.lines.map((l) => l.action.kind)).toEqual(['rescue', 'means', 'rescue', 'unassign', 'cancelCall']);
    expect(blesse.lines[1]!.label).toMatch(/^Envoyer MISTRAL 2 \(la plus proche, \d+\u00a0min\)$/);
    expect(blesse.lines[1]!.action).toMatchObject({ kind: 'means', means: 'unite', squadId: 3 });
    expect(blesse.sub).toContain('confié à MISTRAL 3');
    // confié aux secours : « aux pompiers », « au SAMU » (jamais « à les pompiers »)
    const base = env.incidents.find((i) => i.id === 4)!;
    for (const [means, text] of [['pompiers', 'confié aux pompiers'], ['samu', 'confié au SAMU']] as const) {
      const inc = { ...base, id: 40, means, squadId: 0, assignee: '' };
      const e2 = makeEnv({ incidents: [...env.incidents, inc] });
      const card = buildCard(collectReperes(e2).find((r) => r.incidentId === 40)!, e2, null);
      expect(card.sub).toContain(text);
      expect(card.sub).not.toMatch(/à les|à le /);
    }
    expect(blesse.others.find((l) => l.label === 'Protéger les secours')!.action).toEqual({ kind: 'verb', type: 'proteger', geom: 'target', targetId: 501 });
    const barricade = buildCard(collectReperes(env).find((r) => r.incidentId === 3)!, env, null);
    expect(barricade.lines[0]!.label).toMatch(/^Dégager avec le blindé Centaure \(\d+\u00a0min\)$/);
    expect(barricade.lines[0]!.explain).toContain('blindé qui pousse');
  });

  it('fiche d’une de mes unités : Qui imposé, relève conseillée, ce qu’elle fait ; « Rentrer au commissariat » seulement quand le verbe existe', () => {
    const tired = buildCard(reps.unite, env, null);
    expect(tired.whoFixed).toEqual([3]);
    expect(tired.notes).toContain('⚠ Moins de 60\u00a0% d’agents valides\u00a0: relève conseillée.');
    expect(tired.lines.map((l) => l.label)).toEqual([
      'L’envoyer ailleurs…', 'Tenir sa position', 'Arrêter l’action en cours', 'Laisser agir seule', 'Monter dans les véhicules', 'Se protéger (tortue)',
    ]);
    const busy = buildCard(unitRepere(env.units[1]!), env, null);
    expect(busy.notes[0]).toBe('Ce qu’elle fait\u00a0: Barre la rue de Rivoli · en place · ordre donné il y a 3\u00a0min');
    // unité venue d'un poste : sans le verbe `retour_poste` (module des commissariats absent), la ligne n'existe pas
    const tv = buildCard(unitRepere(env.units[6]!), env, null);
    expect(tv.lines.some((l) => l.label === 'Rentrer au commissariat')).toBe(false);
  });

  it('« VOUS » : les deux « Suivez-moi » ; la proposition de l’adjoint : son titre en clair', () => {
    const me = buildCard(reps.vous, env, null);
    expect(me.title).toBe('VOUS — Commandant Carlier');
    expect(me.lines.map((l) => l.action)).toEqual([{ kind: 'follow', column: false }, { kind: 'follow', column: true }, { kind: 'centre' }]);
    expect(me.lines[0]!.explain).toBe('Toute la compagnie descend et vous suit à pied.');
    const prop = buildCard(reps.proposition, env, null);
    expect(prop.title).toBe('TENIR LES 40 RUES QUI DONNENT SUR LE PARCOURS');
    expect(prop.lines.map((l) => l.label)).toEqual(['Accepter', 'Plus tard']);
    const som = buildCard(collectReperes(env).find((r) => r.proposalId === 8)!, env, null);
    expect(som.lines.map((l) => l.action)).toEqual([{ kind: 'sommation', all: true }, { kind: 'proposal', accept: false }]);
  });

  it('liaison : « Négocier un parcours (liaison) » en tête des autres ordres du cortège, seulement quand elle est possible', () => {
    const label = 'Négocier un parcours (liaison)';
    const othersOf = (e: CardEnv): string[] => buildCard(oneOfEach(e).foule, e, null).others.map((l) => l.label);
    expect(othersOf(makeEnv({ liaison: false }))[0]).toBe(label);
    expect(buildCard(oneOfEach(makeEnv({ liaison: false })).foule, makeEnv({ liaison: false }), null).others[0]!.action).toEqual({ kind: 'liaison' });
    // déjà au contact, pas de service, ou foule qui n'est pas le cortège : rien
    expect(othersOf(makeEnv({ liaison: true }))).not.toContain(label);
    expect(othersOf(makeEnv())).not.toContain(label);
    const nasse = buildCard(oneOfEach(makeEnv({ liaison: false })).nasse, makeEnv({ liaison: false }), null);
    expect(nasse.others.map((l) => l.label)).not.toContain(label);
  });

  it('extensions : une fiche remplacée et des lignes ajoutées, puis retirées', () => {
    const off = registerCardLines('metro', () => ({ lines: [plainLine('Ligne ajoutée', 'Pour essai.', 'info', { kind: 'centre' })] }));
    expect(buildCard(reps.metro, env, null).lines.map((l) => l.label)).toContain('Ligne ajoutée');
    off();
    expect(buildCard(reps.metro, env, null).lines.map((l) => l.label)).not.toContain('Ligne ajoutée');
    const off2 = registerCardBuilder('bloqueur', (r) => ({
      repere: r, title: 'X', sub: '', notes: [], lines: [plainLine('Remplacée', 'Pour essai.', 'info', { kind: 'centre' })], others: [], defaultLine: 0, stack: [r], whoFixed: null,
    }));
    expect(buildCard(reps.bloqueur, env, null).lines[0]!.label).toBe('Remplacée');
    off2();
    expect(buildCard(reps.bloqueur, env, null).lines[0]!.label).toBe('Envoyer le blindé Centaure le pousser');
  });
});

// ───────────────────────────── rien n'est perdu ─────────────────────────────

/** Types d'ordres qu'une ligne donne (les moyens d'une barricade dégagent ; « Suivez-moi » est suivre_pied / avec_moi). */
function typesOf(line: CardLine, r: Repere, env: CardEnv): string[] {
  const a = line.action;
  if (a.kind === 'verb') return [String(a.type)];
  if (a.kind === 'follow') return [a.column ? 'avec_moi' : 'suivre_pied'];
  if (a.kind === 'sendElsewhere' && a.type) return [String(a.type)];
  if (a.kind === 'pickTarget') return [a.type];
  if (a.kind === 'means' && r.kind === 'incident') {
    const inc = env.incidents.find((i) => i.id === r.incidentId);
    if (inc && (inc.kind === 'barricade' || inc.kind === 'feu_barricade') && (a.means === 'centaure' || a.means === 'unite')) return ['degager_barricade'];
    if (inc && (inc.kind === 'suspect' || inc.kind === 'pillage')) return ['interpeller'];
  }
  return [];
}

describe('fiches — aucun ordre perdu, mots en clair', () => {
  it('chaque verbe du catalogue est dans une fiche (ligne ou « Autres ») et dans « Tous les ordres »', () => {
    const env = makeEnv();
    const reps = collectReperes(env).concat([pointRepere(500, 500, env)]);
    const seen = new Set<string>();
    for (const r of reps) {
      for (const intent of [null, ...INTENTS.map((i) => i.id)]) {
        const c = buildCard(r, env, intent);
        for (const l of c.lines.concat(c.others)) for (const t of typesOf(l, r, env)) seen.add(t);
      }
    }
    const grouped = new Set(allOrdersGrouped().flatMap((g) => g.verbs.map((v) => String(v.type))));
    for (const v of ORDER_VERBS) {
      expect(seen.has(String(v.type)), `fiche : ${v.type}`).toBe(true);
      expect(grouped.has(String(v.type)), `Tous les ordres : ${v.type}`).toBe(true);
    }
    expect(allOrdersGrouped().map((g) => g.label)).toEqual(['Se placer', 'Se déplacer', 'Face à la foule', 'Intervenir', 'Fin d’action']);
    expect(ORDER_GROUP_LABELS.manoeuvre).toBe('Face à la foule');
  });

  it('six intentions sur des touches communes à l’AZERTY et au QWERTY, jamais Y ; second texte ≤ 30 caractères', () => {
    expect(INTENTS.map((i) => i.id)).toEqual(['envoyer', 'bloquer', 'encercler', 'disperser', 'interpeller', 'secours']);
    const SAFE = new Set(['KeyE', 'KeyB', 'KeyN', 'KeyD', 'KeyI', 'KeyS', 'KeyU', 'KeyT', 'KeyL', 'KeyC', 'KeyO', 'KeyR', 'KeyG', 'KeyJ', 'KeyV', 'KeyH', 'KeyX', 'KeyF', 'KeyP']);
    for (const i of INTENTS) {
      expect(SAFE.has(i.code), i.code).toBe(true);
      expect(['KeyA', 'KeyQ', 'KeyZ', 'KeyW', 'KeyM', 'KeyY']).not.toContain(i.code);
      expect(i.code).toBe(`Key${i.key}`);
      expect(i.sub.length, i.sub).toBeLessThanOrEqual(30);
      expect(i.sub).not.toContain('…');
      expect(i.tooltip.length).toBeGreaterThan(i.sub.length);
    }
    expect(INTENTS.filter((i) => i.sticky).map((i) => i.id)).toEqual(['bloquer', 'interpeller', 'secours']);
  });

  it('chaque verbe : libellé et explication non vides, étiquette ≤ 20 caractères en majuscules, sans « _ »', () => {
    for (const w of [...ORDER_VERBS, ...Object.values(EXTRA_PLAIN)]) {
      expect(w.plain.trim(), w.tag).not.toBe('');
      expect(w.explain.trim(), w.tag).not.toBe('');
      expect(w.doing.trim(), w.tag).not.toBe('');
      expect(w.tag.length, w.tag).toBeLessThanOrEqual(20);
      expect(w.tag).toBe(w.tag.toLocaleUpperCase('fr-FR'));
      expect(w.tag + w.plain + w.explain).not.toContain('_');
    }
    expect(tagOf('couper_circulation')).toBe('BARRE');
    expect(tagOf('couper_circulation', BARRAGE_LET_PASSERSBY)).toBe('BARRE (PASSANTS)');
    expect(tagOf('retour_poste' as OrderType)).toBe('RENTRE');
    expect(tagOf('inconnu' as OrderType)).toBe('');
    expect(orderLabel('ligne')).toBe('En ligne');
    expect(orderLabel('libre')).toBe('Sans ordre');
    expect(orderLabel('couper_circulation')).not.toMatch(/[A-Z_]{4,}/);
    expect(doingAt('couper_circulation', 'rue de Rivoli')).toBe('Barre la rue de Rivoli');
    expect(doingAt('couper_circulation', 'avenue Gabriel', BARRAGE_LET_PASSERSBY)).toBe('Barre l’avenue Gabriel, passants admis');
    expect(doingAt('colonne', 'place de la Concorde')).toBe('Va à pied · place de la Concorde');
    expect(withArticle('boulevard Haussmann')).toBe('le boulevard Haussmann');
  });

  it('aucun libellé n’emploie « LBD », « VL » ou « TV » sans son explication ; les niveaux de force sont des mots', () => {
    const env = makeEnv({ authorised: 0 });
    const reps = collectReperes(env).concat([pointRepere(500, 500, env)]);
    for (const r of reps) {
      for (const intent of [null, ...INTENTS.map((i) => i.id)]) {
        const c: Card = buildCard(r, env, intent);
        for (const l of c.lines.concat(c.others)) {
          const text = `${l.label} ${l.lock ? l.lock.text : ''}`;
          if (/\bLBD\b/.test(text)) expect(text).toContain('lanceurs de balles (LBD)');
          if (/\b(VL|TV)\b/.test(l.label)) expect(l.label).toMatch(/voiture/);
          expect(l.explain.trim(), l.label).not.toBe('');
          expect(l.label).not.toMatch(/[a-z]+_[a-z]+/);
        }
      }
    }
    for (let lvl = -2; lvl <= 9; lvl++) expect(forceWord(lvl)).not.toMatch(/\d/);
    expect(forceWord(1)).toBe('mains nues');
    expect(forceWord(4)).toBe('grenades et lanceurs de balles (LBD)');
    expect(FORCE_WORDS.length).toBe(6);
  });
});

// ───────────────────────────── une vraie partie ─────────────────────────────

describe('fiches d’une vraie partie (place de la Concorde, commandant)', () => {
  it('l’environnement lu dans la partie donne des repères et des fiches valides, et les candidats des intentions', async () => {
    const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    const t = createTestContext({ seed: 21, strict: false, modules: [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, maps, command] });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.4,
      volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
    } as never);
    t.step(3);
    const core = t.ctx.service<CommandCore>('ui.command')!;
    const env = cardEnvFromCore(core);
    expect(env.level).toBe('tout');
    expect(env.player).not.toBeNull();
    expect(env.player!.title).toMatch(/^Commandant /);
    const mine = env.units.filter((u) => u.mine);
    expect(mine.some((u) => u.symbol === 'section')).toBe(true);
    expect(mine.some((u) => u.symbol === 'bravm')).toBe(true);
    const reps = collectReperes(env);
    const kinds = new Set(reps.map((r) => r.kind));
    // le cortège et les rues qui en partent (vraies rues de la Concorde)
    expect(kinds.has('foule')).toBe(true);
    expect(kinds.has('rue')).toBe(true);
    const block = intentCandidates('bloquer', env, env.player!);
    expect(block.length).toBeGreaterThan(1);
    expect(block[0]!.kind).toBe('rue');
    expect(block[0]!.name).not.toBe('');
    const street = buildCard(block[0]!, env, 'bloquer');
    expect(street.lines[street.defaultLine]!.label).toBe('Barrer la rue');
    expect(street.sub.startsWith(block[0]!.name)).toBe(true);
    expect(kinds.has('vous')).toBe(true);
    expect(kinds.has('unite')).toBe(true);
    // chaque fiche de la partie : au plus six lignes, la ligne par défaut visible, des libellés en clair
    for (const r of reps) {
      for (const intent of [null, ...INTENTS.map((i) => i.id)]) {
        const c = buildCard(r, env, intent);
        expect(c.lines.length).toBeLessThanOrEqual(MAX_LINES);
        if (c.lines.length > 0) expect(c.defaultLine).toBeLessThan(c.lines.length);
        for (const l of c.lines) expect(l.label).not.toMatch(/[a-z]+_[a-z]+/);
      }
    }
    // une section à moi : sa fiche impose Qui ; « Monter / Descendre » selon qu'elle est à bord (elle a ses fourgons)
    const section = mine.find((u) => u.symbol === 'section')!;
    expect(section.hasVehicles).toBe(true);
    const card = buildCard(unitRepere(section), env, null);
    expect(card.whoFixed).toEqual([section.squadId]);
    expect(card.lines.some((l) => l.label === 'Monter dans les véhicules' || l.label === 'Descendre des véhicules')).toBe(true);
    // un point de la carte : la rue la plus proche est nommée (vraies rues de Paris)
    const here = pointRepere(env.player!.x + 30, env.player!.z, env);
    expect(here.name).toMatch(/^Ici/);
    expect(buildCard(here, env, null).lines[0]!.label).toBe('Y aller');
    // « Envoyer » trouve toujours un premier repère ; « Secours » au moins le point visé
    expect(intentCandidates('envoyer', env, env.player!).length + intentCandidates('secours', env, env.player!).length).toBeGreaterThan(0);
    expect(intentCandidates('secours', env, env.player!).at(-1)!.kind).toBe('point');
    if (env.crowds.length > 0) {
      const crowdCard = buildCard(crowdRepere(env.crowds[0]!), env, 'disperser');
      expect(crowdCard.lines[crowdCard.defaultLine]!.label).toBe('Repousser la foule');
    }
    for (const i of env.incidents) expect(buildCard(incidentRepere(i), env, null).lines.length).toBeLessThanOrEqual(MAX_LINES);
  }, 300000);
});
