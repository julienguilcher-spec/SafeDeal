// « Mes unités » dit pourquoi une colonne attend (F5 de la passe de lisibilité) : la colonne publiée par police.command
// (ConvoyStatus) porte `awaitingPlayer` (elle n'attend plus que le joueur, à pied) et `awaitingDriver` (le joueur tient
// le volant d'un de ses véhicules et n'a pas démarré). La fiche « Ma mission » le dit ; la carte de commandement disait
// « en route en véhicules » ou « embarque (7/7 à bord) » pour une colonne arrêtée qui attend le commandant.
import { describe, expect, it } from 'vitest';

import type { OrderType } from '@/core/contracts';
import type { CardUnit } from '@/ui/command/cardTypes';
import type { CommandCore } from '@/ui/command/core';
import { readTracks, unitActivity } from '@/ui/command/panelFollow';
import type { FollowTrack } from '@/ui/command/panelFollow';

function unit(squadId: number, extra: Partial<CardUnit> = {}): CardUnit {
  return {
    squadId, key: squadId, name: 'MISTRAL 1', symbol: 'section', x: 0, z: 0, total: 19, valid: 19, morale: 0.8, ammo: 40,
    order: { type: 'embarquer', x: 0, z: 0, targetId: 0, issuedAt: 10 }, orderPlace: '', status: '', embarked: true, hasVehicles: true,
    mine: true, patrol: false, homeStation: '', targetEntity: 0, parentId: 0, hasPlayer: true, ...extra,
  };
}

function track(extra: Partial<FollowTrack> = {}): FollowTrack {
  return { arrived: false, since: -1, remaining: 900, total: 1000, embarked: true, convoy: null, intended: null, ...extra };
}

const intended = { type: 'couper_circulation' as OrderType, place: 'rue Royale', targetId: 0 };

describe('« Mes unités » : la colonne qui attend le joueur le dit', () => {
  it('au volant sans démarrer : « attend votre départ : vous êtes au volant », pas « en route »', () => {
    const a = unitActivity(unit(27), track({ convoy: { stage: 'route', aboard: 7, total: 7, departIn: 0, remaining: 900, awaitingDriver: true }, intended }), 100);
    expect(a.doing).toBe('Barre la rue Royale');
    expect(a.status).toBe('attend votre départ : vous êtes au volant');
    expect(a.tone).toBe('warn');
  });

  it('à pied, la colonne n’attend plus que lui : « attend que vous montiez »', () => {
    const a = unitActivity(unit(27), track({ convoy: { stage: 'route', aboard: 7, total: 8, departIn: 25, awaitingPlayer: true }, intended }), 100);
    expect(a.status).toBe('attend que vous montiez');
    expect(a.tone).toBe('warn');
    // sans attente, le texte d'avant reste
    expect(unitActivity(unit(27), track({ convoy: { stage: 'route', aboard: 5, total: 7, departIn: 30 }, intended }), 100).status).toBe('embarque (5/7 à bord)');
  });

  it('readTracks reprend les deux drapeaux de la colonne publiée', () => {
    const status = { stage: 'route', aboard: 7, total: 7, departIn: 0, remaining: 900, awaitingPlayer: false, awaitingDriver: true, t0: 0, route: [] };
    const scene = {
      units: [{ squadId: 27, order: null, orderDist: 0, embarked: true }],
      routes: new Map(),
    };
    const core = {
      ctx: { clock: { now: 50 }, service: (name: string) => (name === 'police.command' ? { convoyOf: () => status } : undefined) },
      maps: { scene },
      canCommand: () => true,
      afterConvoy: new Map(),
    } as unknown as CommandCore;
    const env = { roadAt: () => null, placeName: () => '' };
    const t = readTracks(core, env as never, new Map()).get(27)!;
    expect(t.convoy).not.toBeNull();
    expect(t.convoy!.awaitingDriver).toBe(true);
    expect(t.convoy!.awaitingPlayer).toBe(false);
  });
});
