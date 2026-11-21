// Lieux nommés : recherche par nom, nom de secteur pour la radio, monuments.
import { beforeAll, describe, expect, it } from 'vitest';
import { createWorldQuery } from '@/world/query';
import type { WorldQueryImpl } from '@/world/query';
import { PlaceIndex, normalizeName, radioName } from '@/world/query/places';

let w: WorldQueryImpl;

beforeAll(async () => {
  w = createWorldQuery({ source: 'test' });
  await w.boot();
  w.setFocus(0, 0);
  await w.whenLoaded(0, 0, 800);
});

describe('monde : lieux', () => {
  it('normalise les noms', () => {
    expect(normalizeName('Avenue des Champs-Élysées')).toBe('avenue des champs elysees');
    expect(normalizeName("  Place de l’Étoile ")).toBe('place de l etoile');
    expect(normalizeName('Cœur de Paris — Île de la Cité')).toBe('coeur de paris ile de la cite');
    expect(radioName('Place de la Concorde')).toBe('place de la Concorde');
    expect(radioName('Avenue des Champs-Élysées')).toBe('avenue des Champs-Élysées');
    expect(radioName('Pont Alexandre III')).toBe('pont Alexandre III');
    expect(radioName('Île de la Cité')).toBe('île de la Cité');
    expect(radioName('Champ de Mars')).toBe('Champ de Mars');
    expect(radioName('Rond-Point des Champs-Élysées')).toBe('rond-point des Champs-Élysées');
  });

  it('connaît les noms d\'usage quand le nom officiel est sur la carte', () => {
    const place = (name: string, kind: 'square' | 'street' | 'monument' | 'station', importance: number): { name: string; kind: 'square' | 'street' | 'monument' | 'station'; x: number; z: number; radius: number; importance: number; ref: string } =>
      ({ name, kind, x: 0, z: 0, radius: 50, importance, ref: '' });
    const index = new PlaceIndex([
      place('Place Charles de Gaulle', 'square', 3), place("Temple de l'Étoile", 'monument', 2), place('Charles de Gaulle — Étoile', 'station', 3),
      place('Avenue des Champs-Élysées', 'street', 3), place('Rond-Point des Champs-Élysées', 'square', 2), place('Place de la Concorde', 'square', 3),
      place('Concorde', 'station', 3), place('Pont de la Concorde', 'bridge' as 'square', 3),
    ], []);
    expect(index.byName('Étoile')?.name).toBe('Place Charles de Gaulle');
    expect(index.byName("place de l'Étoile")?.name).toBe('Place Charles de Gaulle');
    expect(index.byName('les Champs')?.name).toBe('Avenue des Champs-Élysées');
    expect(index.byName('rond-point des champs')?.name).toBe('Rond-Point des Champs-Élysées');
    // L'exemple du cahier des charges : la place, pas la station ni le pont du même nom.
    expect(index.byName('concorde')?.name).toBe('Place de la Concorde');
    expect(index.byName('pont concorde')?.name).toBe('Pont de la Concorde');
    // Sans le nom officiel sur la carte, le nom d'usage se cherche comme un autre.
    const bare = new PlaceIndex([place("Temple de l'Étoile", 'monument', 2)], []);
    expect(bare.byName('étoile')?.name).toBe("Temple de l'Étoile");
  });

  it('convertit les lieux et les monuments', () => {
    expect(w.places.length).toBe(23);
    for (let i = 0; i < w.places.length; i++) expect(w.places[i].id).toBe(i);
    const square = w.places.find((p) => p.name === "Place de l'Essai");
    expect(square).toMatchObject({ kind: 'square', x: 0, z: 0, radius: 60 });
    expect(w.landmarks.length).toBe(1);
    const lm = w.landmarks[0];
    expect(lm.key).toBe('monument_essai');
    expect(lm.name).toBe("Colonne de l'Essai");
    expect(lm.height).toBe(32);
    expect(lm.footprint.length).toBe(16);
    expect(lm.y).toBeCloseTo(w.heightAt(0, 0), 1);
  });

  it('placeByName : insensible aux accents et à la casse, correspondance partielle', () => {
    const name = (q: string): string | null => w.placeByName(q)?.name ?? null;
    expect(name("Place de l'Essai")).toBe("Place de l'Essai");
    expect(name("PLACE DE L’ESSAI")).toBe("Place de l'Essai");
    expect(name('place essai')).toBe("Place de l'Essai");
    // Un mot seul : la place l'emporte sur l'avenue, le pont, la mairie, la station de métro…
    expect(name('essai')).toBe("Place de l'Essai");
    expect(name('ESSAI')).toBe("Place de l'Essai");
    expect(name('mairie')).toBe("Mairie de l'Essai");
    expect(name('pont')).toBe("Pont de l'Essai");
    expect(name('pont de l essai')).toBe("Pont de l'Essai");
    expect(name('marche')).toBe('Rue du Marché'); // sans accent
    expect(name('Marché')).toBe('Rue du Marché');
    expect(name('rue du marché')).toBe('Rue du Marché');
    expect(name('glycines')).toBe('Square des Glycines'); // le square avant la rue du même nom
    expect(name('rue des glycines')).toBe('Rue des Glycines'); // le nom exact prime
    expect(name('lavoir')).toBe('Rue du Lavoir');
    expect(name('horl')).toBe("Rue de l'Horloge"); // début de mot
    expect(name('butte')).toBe('Parc de la Butte');
    expect(name('quai du port')).toBe('Quai du Port');
    expect(name('colonne')).toBe("Colonne de l'Essai");
    expect(name('zanzibar')).toBeNull();
    expect(name('')).toBeNull();
    expect(name('   ')).toBeNull();
    // Résultat stable (cache) et objet de la liste.
    expect(w.placeByName('essai')).toBe(w.placeByName('Essai'));
    expect(w.places).toContain(w.placeByName('essai'));
  });

  it('sectorName : formulé pour la radio', () => {
    expect(w.sectorName(0, 30)).toBe("place de l'Essai"); // sur l'anneau de la place
    expect(w.sectorName(20, -20)).toBe("place de l'Essai");
    expect(w.sectorName(250, -7)).toBe("avenue de l'Essai");
    expect(w.sectorName(250, 16)).toBe("avenue de l'Essai"); // sur le trottoir
    expect(w.sectorName(0, 360)).toBe("pont de l'Essai");
    expect(w.sectorName(5, 330)).toBe("pont de l'Essai");
    expect(w.sectorName(120, 289)).toBe('quai des Saules');
    expect(w.sectorName(-234.5, 60)).toBe('square des Glycines'); // dans le square
    expect(w.sectorName(-170, 80)).toBe('rue du Lavoir'); // la rue qui longe le square
    expect(w.sectorName(-430, -300)).toBe('rue des Lilas');
    expect(w.sectorName(100, -290)).toBe('rue du Moulin');
    expect(w.sectorName(234.5, -225.5)).toBe("secteur mairie de l'Essai"); // dans la cour de la mairie, loin des rues
    expect(w.sectorName(480, 480)).toBe("quartier de l'Essai"); // ni rue ni lieu à proximité
    expect(w.sectorName(5000, 5000)).toBe('secteur inconnu');
  });

  it('généralités : emprise, taille de tuile, attribution', () => {
    expect(w.ready).toBe(true);
    expect(w.bounds).toEqual({ minX: -512, minZ: -512, maxX: 512, maxZ: 512 });
    expect(w.tileSize).toBe(512);
    expect(w.attribution).toContain("Quartier d'essai");
  });
});
