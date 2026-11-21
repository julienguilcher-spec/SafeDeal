// Lancement direct d'une mission (?mission=…) : la fiche ne donne que le nom du lieu. Le lieu doit être résolu sur
// la carte de Paris, même quand celle-ci est encore en cours de chargement au début de la session (le reset des
// systèmes bascule le monde vers Paris de façon asynchrone) — sinon le joueur part « au centre du monde ».
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaceInfo, WorldQuery } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session — lieu de départ résolu une fois la carte chargée', () => {
  it('monde factice : placeByName ne connaît le lieu qu\'après whenReady()', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = createTestContext({ seed: 3 });
    const place: PlaceInfo = { id: 1, name: 'place de la République', kind: 'square', x: 1200, z: -300, radius: 80 };
    let ready = false;
    const base = t.ctx.world;
    t.ctx.world = {
      ...base,
      placeByName: (name: string) => (ready && name.toLowerCase() === place.name.toLowerCase() ? place : null),
      setFocus: () => {},
      whenLoaded: async () => {},
      whenReady: () => new Promise<void>((resolve) => setTimeout(() => { ready = true; resolve(); }, 5)),
    } as WorldQuery;
    const cfg = await t.start({ place: 'Place de la République', x: undefined, z: undefined });
    expect([cfg.x, cfg.z]).toEqual([1200, -300]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('vraie carte de Paris : départ au lieu nommé, pas au centre du monde', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = createTestContext({ seed: 3, modules: [world] });
    const cfg = await t.start({ mode: 'libre', place: 'Place de la République', x: undefined, z: undefined });
    const p = t.ctx.world.placeByName('Place de la République');
    expect(p).toBeTruthy();
    expect(Math.hypot(cfg.x! - p!.x, cfg.z! - p!.z)).toBeLessThan(1);
    expect(warn.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('lieu inconnu'))).toEqual([]);
  });
});
