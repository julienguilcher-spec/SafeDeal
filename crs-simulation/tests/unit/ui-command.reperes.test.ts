// Carte de commandement — repères : saut de la visée aux flèches (cône de 100°), désignation au pointeur par priorité,
// rues à bloquer (libres d'abord, devant la marche d'abord).
import { describe, expect, it } from 'vitest';

import type { CardCrowd, CardEnv, Repere } from '@/ui/command/cardTypes';
import { intentCandidates } from '@/ui/command/intents';
import { PICK_PRIORITY, collectReperes, nextInDirection, pickAt, registerRepereProvider } from '@/ui/command/reperes';

/** Écran = monde (1 px = 1 m, y = z). */
const toScreen = (x: number, z: number, out: { x: number; y: number }): void => {
  out.x = x;
  out.y = z;
};

const rep = (key: string, kind: Repere['kind'], x: number, z: number, extra: Partial<Repere> = {}): Repere => ({ key, kind, x, z, name: key, ...extra });

describe('repères — saut aux flèches', () => {
  const list = [
    rep('droite', 'rue', 100, 5), rep('droite-loin', 'rue', 300, 0), rep('haut', 'incident', 0, -80), rep('bas-diag', 'foule', 60, 70),
    rep('ici', 'vous', 0, 0),
  ];

  it('choisit le voisin dans la direction : le plus proche et le mieux aligné', () => {
    expect(nextInDirection({ sx: 0, sy: 0 }, 'right', list, toScreen)!.key).toBe('droite');
    expect(nextInDirection({ sx: 0, sy: 0 }, 'up', list, toScreen)!.key).toBe('haut');
    // 60 m à droite, 70 m vers le bas : 40° de l'axe vertical, dans le cône de 100°
    expect(nextInDirection({ sx: 0, sy: 0 }, 'down', list, toScreen)!.key).toBe('bas-diag');
    // depuis « droite », la suivante à droite
    expect(nextInDirection({ sx: 100, sy: 5 }, 'right', list, toScreen)!.key).toBe('droite-loin');
  });

  it('un repère proche mais trop de biais perd contre un plus lointain bien aligné (score distance × (1 + 2·angle))', () => {
    const l = [rep('biais', 'rue', 50, 55), rep('aligne', 'rue', 120, 0)];
    // « biais » : 74 m à 47,7° ; « aligne » : 120 m à 0°
    expect(nextInDirection({ sx: 0, sy: 0 }, 'right', l, toScreen)!.key).toBe('aligne');
  });

  it('cône vide : null (rien à gauche) ; la visée elle-même est ignorée', () => {
    expect(nextInDirection({ sx: 0, sy: 0 }, 'left', list, toScreen)).toBeNull();
    expect(nextInDirection({ sx: 0, sy: 0 }, 'right', [rep('ici', 'vous', 1, 1)], toScreen)).toBeNull();
    // à 60° de l'axe : hors du cône de 100°
    expect(nextInDirection({ sx: 0, sy: 0 }, 'right', [rep('hors', 'rue', 50, 87)], toScreen)).toBeNull();
  });
});

describe('repères — désignation au pointeur', () => {
  it('unité avant foule avant rue, puis la plus proche ; rien hors de portée', () => {
    const list = [
      rep('rue', 'rue', 12, 0), rep('foule', 'foule', 30, 0, { radius: 25 }), rep('unite', 'unite', 20, 10), rep('loin', 'unite', 200, 0),
      rep('vous', 'vous', 5, 5), rep('incident', 'incident', 18, -15),
    ];
    const stack = pickAt(list, 10, 0, 40, toScreen);
    expect(stack.map((r) => r.key)).toEqual(['unite', 'incident', 'foule', 'vous', 'rue']);
    expect(PICK_PRIORITY.unite).toBeLessThan(PICK_PRIORITY.foule);
    expect(PICK_PRIORITY.foule).toBeLessThan(PICK_PRIORITY.rue);
    expect(pickAt(list, 500, 500, 40, toScreen)).toEqual([]);
  });

  it('une foule se désigne aussi par son corps (rayon), pas seulement par son centre', () => {
    const crowd = rep('foule', 'foule', 0, 0, { radius: 40 });
    expect(pickAt([crowd], 70, 0, 40, toScreen).map((r) => r.key)).toEqual(['foule']);
    expect(pickAt([crowd], 130, 0, 40, toScreen)).toEqual([]);
  });
});

// ───────────────────────────── rues à bloquer ─────────────────────────────

const exit = (street: string, edgeId: number, x: number, z: number, held = false) => ({
  x, z, heading: 0, width: 12, street, edgeId, held, squadId: held ? 9 : 0, mode: held ? 'ferme' : 'ouvert',
});

function crowdEnv(crowds: CardCrowd[]): CardEnv {
  return {
    level: 'tout', canTraffic: true, canSommation: true, canAuthorize: true, canMetro: true, canDelegate: true, salle: false, sommations: 0,
    lawful: 1, authorised: 1, underAttack: false, riposteAt: () => false, command: 'compagnie', crowds, incidents: [], units: [], closures: [],
    metro: [], proposals: [], stations: [], player: { x: 0, z: -200, title: 'Commandant Carlier', inVehicle: false }, blocked: null, hasRescue: false,
    selection: [], now: 0, farFor: () => false,
    roadAt: (x, z) => ({ edgeId: 99, x, z, heading: 0, width: 10, name: 'rue de la Paix' }), placeName: () => 'place Vendôme',
  };
}

describe('repères — rues à bloquer (intention B)', () => {
  // cortège qui marche vers le nord (+z) ; deux rues devant, deux derrière, une déjà tenue devant
  const main: CardCrowd = {
    key: 'c', name: 'Tête de cortège', place: '', x: 0, z: 0, radius: 90, people: 400, tension: 0.4, heading: 0, main: true, kettleId: 0, closed: false,
    exits: [
      exit('rue Derrière-Proche', 1, 10, -20), exit('rue Devant-Loin', 2, 0, 80), exit('rue Devant-Tenue', 3, 5, 30, true),
      exit('rue Devant-Proche', 4, -30, 40), exit('rue Derrière-Loin', 5, -10, -90),
    ],
  };
  const other: CardCrowd = {
    key: 'f2', name: 'Rassemblement', place: '', x: 600, z: 0, radius: 40, people: 80, tension: 0.6, heading: NaN, main: false, kettleId: 0, closed: false,
    exits: [exit('rue Ailleurs', 6, 620, 0), exit('rue Devant-Loin', 2, 0, 80)],
  };

  it('libres d’abord (cortège principal, devant la marche, la plus proche de la visée), puis les tenues', () => {
    const env = crowdEnv([other, main]);
    const list = intentCandidates('bloquer', env, { x: 0, z: 0 });
    expect(list.map((r) => r.name)).toEqual([
      'Rue Devant-Proche', 'Rue Devant-Loin', 'Rue Derrière-Proche', 'Rue Derrière-Loin', 'Rue Ailleurs', 'Rue Devant-Tenue',
    ]);
    // une rue partagée par deux foules n'apparaît qu'une fois
    expect(list.filter((r) => r.roadEdge === 2).length).toBe(1);
    expect(list.every((r) => r.kind === 'rue')).toBe(true);
  });

  it('sans foule : la rue nommée sous la visée', () => {
    const list = intentCandidates('bloquer', crowdEnv([]), { x: 3, z: 4 });
    expect(list.map((r) => r.name)).toEqual(['Rue de la Paix']);
  });

  it('collecte : chaque rue une fois, la foule, « vous », et les repères ajoutés par une extension', () => {
    const env = crowdEnv([other, main]);
    const off = registerRepereProvider('commissariat', () => [rep('commissariat:c8', 'commissariat', 900, 0, { stationId: 'c8' })]);
    const all = collectReperes(env);
    off();
    expect(all.filter((r) => r.kind === 'rue').length).toBe(6);
    expect(all.filter((r) => r.kind === 'foule').map((r) => r.crowdKey)).toEqual(['c', 'f2']);
    expect(all.some((r) => r.kind === 'vous')).toBe(true);
    expect(all.some((r) => r.key === 'commissariat:c8')).toBe(true);
    expect(collectReperes(env).some((r) => r.key === 'commissariat:c8')).toBe(false);
    expect(new Set(all.map((r) => r.key)).size).toBe(all.length);
  });

  it('Encercler : la foule la plus proche de la visée d’abord ; Disperser : la plus grosse et la plus tendue', () => {
    const env = crowdEnv([other, main]);
    expect(intentCandidates('encercler', env, { x: 610, z: 0 })[0]!.crowdKey).toBe('f2');
    expect(intentCandidates('disperser', env, { x: 610, z: 0 }).map((r) => r.crowdKey)).toEqual(['c', 'f2']);
  });
});
