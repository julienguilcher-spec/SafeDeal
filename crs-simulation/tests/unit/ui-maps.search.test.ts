import { describe, expect, it } from 'vitest';
import type { PlaceInfo } from '@/core/contracts';
import { matchScore, normalizeText, searchPlaces } from '@/ui/maps/search';

const PLACES: PlaceInfo[] = [
  { id: 1, name: 'Place de la République', kind: 'square', x: 3133, z: -211, radius: 68 },
  { id: 2, name: 'République', kind: 'station', x: 3116, z: -224, radius: 60 },
  { id: 3, name: 'Avenue de la République', kind: 'street', x: 3500, z: -100, radius: 400 },
  { id: 4, name: 'Place de la Bastille', kind: 'square', x: 3493, z: 1442, radius: 56 },
  { id: 5, name: 'Opéra Garnier', kind: 'monument', x: 800, z: -590, radius: 60 },
  { id: 6, name: 'Rue de l\'Échiquier', kind: 'street', x: 2500, z: -700, radius: 150 },
  { id: 7, name: 'Hôtel de Ville', kind: 'institution', x: 2300, z: 900, radius: 60 },
  { id: 8, name: 'Place de la Bastille', kind: 'square', x: 3493, z: 1442, radius: 56 },
];

describe('cartes — recherche de lieu', () => {
  it('normalise la casse, les accents et la ponctuation', () => {
    expect(normalizeText('  Rue de l\'Échiquier ')).toBe('rue de l echiquier');
    expect(normalizeText('Hôtel-de-Ville')).toBe('hotel de ville');
    expect(normalizeText('Cœur')).toBe('coeur');
  });

  it('trouve sans accents ni majuscules', () => {
    const hits = searchPlaces(PLACES, 'republique');
    expect(hits.length).toBe(3);
    expect(hits.map((h) => h.place.id).sort()).toEqual([1, 2, 3]);
    expect(searchPlaces(PLACES, 'echiquier')[0]!.place.id).toBe(6);
    expect(searchPlaces(PLACES, 'OPERA')[0]!.place.id).toBe(5);
  });

  it('le nom exact passe avant les noms qui le contiennent ; la place avant l\'avenue', () => {
    const hits = searchPlaces(PLACES, 'République');
    expect(hits[0]!.place.id).toBe(2);
    expect(hits[1]!.place.id).toBe(1);
    expect(hits[2]!.place.id).toBe(3);
  });

  it('plusieurs mots, petits mots ignorés', () => {
    expect(searchPlaces(PLACES, 'place bastille')[0]!.place.name).toBe('Place de la Bastille');
    expect(searchPlaces(PLACES, 'hotel de ville')[0]!.place.id).toBe(7);
    expect(searchPlaces(PLACES, 'place opera').length).toBe(0);
  });

  it('pas de doublon, limite respectée, requête trop courte ignorée', () => {
    expect(searchPlaces(PLACES, 'bastille').length).toBe(1);
    expect(searchPlaces(PLACES, 'place', 2).length).toBe(2);
    expect(searchPlaces(PLACES, 'p').length).toBe(0);
    expect(searchPlaces(PLACES, '   ').length).toBe(0);
  });

  it('note : exact > préfixe > mot > fragment', () => {
    expect(matchScore('bastille', 'bastille')).toBeGreaterThan(matchScore('bastille opera', 'bastille'));
    expect(matchScore('bastille opera', 'bastille')).toBeGreaterThan(matchScore('place de la bastille', 'bastille'));
    expect(matchScore('place de la bastille', 'bastille')).toBeGreaterThan(matchScore('rue embastillee', 'bastille'));
    expect(matchScore('rue de rivoli', 'bastille')).toBe(0);
  });
});
