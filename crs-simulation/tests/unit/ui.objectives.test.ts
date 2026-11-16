// Socle de l'interface — service EXT.objectives : liste, ajout ou mise à jour, objectif suivi, version.
import { describe, expect, it } from 'vitest';
import { createObjectives } from '@/ui/core/objectives';
import { sortObjectives } from '@/ui/hud/objectives';

describe('ui/objectifs', () => {
  it('set remplace la liste, écarte les doublons et assainit les valeurs', () => {
    const o = createObjectives();
    const v0 = o.version;
    o.set([
      { id: 'a', text: 'Tenir le barrage', state: 'actif', secondary: false, x: 10, z: 20, progress: 2 },
      { id: 'a', text: 'doublon', state: 'actif', secondary: false },
      { id: 'b', text: 'Aucun tir hors cadre', state: 'bizarre' as never, secondary: true, x: NaN, z: 3 },
    ]);
    expect(o.version).toBeGreaterThan(v0);
    expect(o.list.length).toBe(2);
    expect(o.list[0]).toEqual({ id: 'a', text: 'Tenir le barrage', state: 'actif', secondary: false, x: 10, z: 20, progress: 1 });
    expect(o.list[1]).toEqual({ id: 'b', text: 'Aucun tir hors cadre', state: 'actif', secondary: true });
  });

  it('upsert ajoute ou met à jour ; sans changement, la version ne bouge pas', () => {
    const o = createObjectives();
    o.upsert({ id: 'a', text: 'A', state: 'actif', secondary: false });
    const v1 = o.version;
    o.upsert({ id: 'a', text: 'A', state: 'actif', secondary: false });
    expect(o.version).toBe(v1);
    o.upsert({ id: 'a', text: 'A', state: 'reussi', secondary: false });
    expect(o.version).toBeGreaterThan(v1);
    expect(o.list.length).toBe(1);
    expect(o.list[0]!.state).toBe('reussi');
    o.upsert({ id: 'b', text: 'B', state: 'actif', secondary: false, progress: 0.25 });
    expect(o.list.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('suit d’office le premier objectif principal actif et localisé', () => {
    const o = createObjectives();
    o.set([
      { id: 's', text: 'secondaire', state: 'actif', secondary: true, x: 1, z: 1 },
      { id: 'n', text: 'non localisé', state: 'actif', secondary: false },
      { id: 'p', text: 'principal', state: 'actif', secondary: false, x: 5, z: 5 },
    ]);
    expect(o.tracked).toBe('p');
    // l'objectif suivi se termine : le suivi passe au suivant
    o.upsert({ id: 'p', text: 'principal', state: 'reussi', secondary: false, x: 5, z: 5 });
    expect(o.tracked).toBe('s');
    o.remove('s');
    expect(o.tracked).toBe('');
  });

  it('tracked se règle à la main, et refuse un identifiant inconnu', () => {
    const o = createObjectives();
    o.set([{ id: 'a', text: 'A', state: 'actif', secondary: false, x: 0, z: 0 }, { id: 'b', text: 'B', state: 'actif', secondary: false, x: 9, z: 9 }]);
    const v = o.version;
    o.tracked = 'b';
    expect(o.tracked).toBe('b');
    expect(o.version).toBeGreaterThan(v);
    o.tracked = 'zzz';
    expect(o.tracked).toBe('');
  });

  it('remove et clear', () => {
    const o = createObjectives();
    o.set([{ id: 'a', text: 'A', state: 'actif', secondary: false }]);
    const v = o.version;
    o.remove('inconnu');
    expect(o.version).toBe(v);
    o.remove('a');
    expect(o.list.length).toBe(0);
    o.clear();
    const v2 = o.version;
    o.clear();
    expect(o.version).toBe(v2);
  });

  it('ordre d’affichage : principaux actifs, secondaires actifs, puis objectifs clos', () => {
    const sorted = sortObjectives([
      { id: '1', text: '', state: 'reussi', secondary: false },
      { id: '2', text: '', state: 'actif', secondary: true },
      { id: '3', text: '', state: 'actif', secondary: false },
      { id: '4', text: '', state: 'echoue', secondary: true },
      { id: '5', text: '', state: 'actif', secondary: false },
    ]);
    expect(sorted.map((o) => o.id)).toEqual(['3', '5', '2', '1', '4']);
  });
});
