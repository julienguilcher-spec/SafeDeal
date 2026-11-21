// Sources de données, magasin de tuiles, choix du jeu de données, branchement dans le moteur.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, NoticeKind } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { Manifest, RawMapData } from '@/world/mapdata';
import { generateTestDistrict } from '@/world/testDistrict';
import {
  MemoryMapSource, WORLD_SOURCE_EVENT, createSystems, createTestDistrictSource, createWorldQuery, createWorldQuerySystems,
} from '@/world/query';
import type { MapSource, WorldData, WorldQueryExt, WorldSourceEvent } from '@/world/query';
import { miniMapRaw } from '@/world/query/testkit';

/** Système espion : remplace ctx.ui.notify pour compter les avertissements. */
function notifySpy(): { system: GameSystem; notices: { text: string; kind: NoticeKind | undefined }[] } {
  const notices: { text: string; kind: NoticeKind | undefined }[] = [];
  const system: GameSystem = {
    id: 'test:notify',
    order: 0,
    provide(ctx: GameContext): void {
      const ui = ctx.ui;
      ctx.ui = {
        notify: (text, kind) => notices.push({ text, kind }),
        subtitle: (a, b, c) => ui.subtitle(a, b, c),
        banner: (a, b, c) => ui.banner(a, b, c),
        open: (a, b) => ui.open(a, b),
        close: (a) => ui.close(a),
        get modal() { return ui.modal; },
        get current() { return ui.current; },
      };
    },
  };
  return { system, notices };
}

/** Source dont le manifeste est introuvable. */
const missingSource: MapSource = {
  label: 'absente',
  manifest: () => Promise.reject(new Error('404')),
  tile: () => Promise.reject(new Error('404')),
  roadGraph: () => Promise.reject(new Error('404')),
  places: () => Promise.reject(new Error('404')),
  landmarks: () => Promise.reject(new Error('404')),
  terrain: () => Promise.reject(new Error('404')),
};

describe('monde : sources de données', () => {
  it('la source mémoire rend les fichiers du quartier d\'essai', async () => {
    const source = createTestDistrictSource();
    const manifest = (await source.manifest()) as Manifest;
    expect(manifest.name).toBe('test-district');
    expect(manifest.tiles.length).toBe(4);
    const tile = await source.tile(manifest.tiles[3]);
    expect(tile.tx).toBe(manifest.tiles[3].tx);
    expect(tile.tz).toBe(manifest.tiles[3].tz);
    expect((await source.roadGraph()).nodes.n).toBe(95);
    expect((await source.places()).n).toBe(23);
    expect((await source.landmarks()).n).toBe(1);
    expect((await source.terrain()).nx).toBe(67);
    await expect(source.tile({ tx: 9, tz: 9, file: 'tiles/t_9_9.json' })).rejects.toThrow();
  });

  it('la source fichiers lit une carte écrite sur disque', async () => {
    // Écrit le quartier d'essai dans un dossier temporaire, puis le relit par la source « fichiers ».
    const fsName = 'node:fs/promises', osName = 'node:os', pathName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsName)) as {
      mkdtemp(p: string): Promise<string>; mkdir(p: string, o: { recursive: boolean }): Promise<unknown>;
      writeFile(p: string, d: string): Promise<void>; rm(p: string, o: { recursive: boolean; force: boolean }): Promise<void>;
    };
    const os = (await import(/* @vite-ignore */ osName)) as { tmpdir(): string };
    const path = (await import(/* @vite-ignore */ pathName)) as { join(...p: string[]): string; dirname(p: string): string };
    const { mapDataFiles } = await import('@/world/mapdata');
    const { FsMapSource } = await import('@/world/query/source-fs');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'crs-carte-'));
    try {
      for (const f of mapDataFiles(generateTestDistrict())) {
        const file = path.join(dir, f.path);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(f.data));
      }
      const source = new FsMapSource(dir);
      expect(await source.exists()).toBe(true);
      expect(await new FsMapSource(path.join(dir, 'nulle-part')).exists()).toBe(false);
      const w = createWorldQuery({ source: 'paris', parisSource: source });
      await w.boot();
      expect(w.stats().source).toBe('test-district');
      expect(w.stats().fallback).toBe(false);
      w.setFocus(0, 0);
      await w.whenLoaded(0, 0, 100);
      expect(w.surfaceAt(0, 360)).toBe('bridge');
      expect(w.nodeCount).toBe(95);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('monde : magasin de tuiles', () => {
  it('charge autour du centre d\'intérêt, garde avec hystérésis, décharge au loin', async () => {
    const t = createTestContext({ modules: [() => createWorldQuerySystems({ source: 'test', loadRadius: 100, unloadRadius: 400 })] });
    await t.ready;
    const ctx = t.ctx;
    const data = ctx.require<WorldData>('world.data');
    const ext = ctx.require<WorldQueryExt>('world.query');
    const log: string[] = [];
    ctx.events.on('world:tile_loaded', (e) => log.push(`+${e.tx}_${e.tz}`));
    ctx.events.on('world:tile_unloaded', (e) => log.push(`-${e.tx}_${e.tz}`));

    expect(data.loadedKeys()).toEqual([]);
    expect(ctx.world.isLoaded(-300, -300)).toBe(false);
    expect(ctx.world.surfaceAt(-300, -300)).toBe('void'); // pas encore chargé
    expect(ctx.world.shopsInTile(-1, -1)).toEqual([]);

    // Au cœur de la tuile (-1, -1) : les trois autres sont à 300 m et plus.
    ctx.world.setFocus(-300, -300);
    await ctx.world.whenLoaded(-300, -300, 50);
    expect(log).toEqual(['+-1_-1']);
    expect([...data.loadedKeys()]).toEqual(['-1_-1']);
    expect(ctx.world.isLoaded(-300, -300)).toBe(true);
    expect(ctx.world.isLoaded(300, -300)).toBe(false);
    expect(data.tile(-1, -1)?.buildings.length).toBe(402);
    expect(data.tile(0, -1)).toBeNull();
    expect(ctx.world.shopsInTile(-1, -1).length).toBe(33);
    expect(ctx.world.surfaceAt(-300, -300)).not.toBe('void');
    // Une tuile non chargée n'a pas d'obstacles : la façade (x = 7) n'arrête rien.
    expect(ext.isSolidAt(100, -25)).toBe(false);

    // On approche de la limite : la tuile voisine (0, -1) est à 50 m.
    ctx.world.setFocus(-50, -300);
    await ctx.world.whenLoaded(-50, -300, 60);
    expect(log).toEqual(['+-1_-1', '+0_-1']);
    expect(ext.isSolidAt(100, -25)).toBe(true);

    // On s'éloigne de 350 m de la première : au-delà du rayon de chargement, en deçà du déchargement.
    ctx.world.setFocus(350, -300);
    await ctx.world.whenLoaded(350, -300, 50);
    expect(log).toEqual(['+-1_-1', '+0_-1']);
    expect(ctx.world.isLoaded(-300, -300)).toBe(true);

    // À 450 m : déchargée.
    ctx.world.setFocus(450, -300);
    expect(log).toEqual(['+-1_-1', '+0_-1', '--1_-1']);
    expect(ctx.world.isLoaded(-300, -300)).toBe(false);
    expect(data.tile(-1, -1)).toBeNull();
    expect([...data.loadedKeys()]).toEqual(['0_-1']);
    expect(ext.isSolidAt(-100, -25)).toBe(false);
    expect(ctx.world.surfaceAt(-300, -300)).toBe('void');

    // Retour : rechargée, à l'identique.
    ctx.world.setFocus(-300, -300);
    await ctx.world.whenLoaded(-300, -300, 50);
    expect(log.slice(3)).toEqual(['+-1_-1']);
    expect(ext.isSolidAt(-100, -25)).toBe(true);
    // Hors de la carte : rien à charger, donc « chargé ».
    expect(ctx.world.isLoaded(5000, 5000)).toBe(true);
    t.game.dispose();
  });

  it('whenLoaded charge ce qu\'on lui demande, même loin du centre d\'intérêt', async () => {
    const w = createWorldQuery({ source: 'test', loadRadius: 100, unloadRadius: 400 });
    await w.boot();
    await w.whenLoaded(300, 300, 10);
    expect(w.isLoaded(300, 300)).toBe(true);
    expect(w.stats().tilesLoaded).toBe(1);
    await w.whenLoaded(0, 0, 10); // le point (0, 0) touche les quatre tuiles
    expect(w.stats().tilesLoaded).toBe(4);
    await w.whenLoaded(0, 0, 2000); // déjà tout chargé : résolue tout de suite
    await w.whenLoaded(9000, 9000, 100); // rien à charger : résolue tout de suite
    expect(w.stats().tilesLoading).toBe(0);
  });

  it('une tuile illisible ne bloque pas le chargement', async () => {
    const raw = generateTestDistrict();
    const good = new MemoryMapSource(raw);
    let attempts = 0;
    const flaky: MapSource = {
      label: 'capricieuse',
      manifest: () => good.manifest(),
      tile: (entry) => {
        if (entry.tx === 0 && entry.tz === 0) {
          attempts++;
          return Promise.reject(new Error('fichier absent'));
        }
        return good.tile(entry);
      },
      roadGraph: () => good.roadGraph(),
      places: () => good.places(),
      landmarks: () => good.landmarks(),
      terrain: () => good.terrain(),
    };
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const w = createWorldQuery({ source: 'paris', parisSource: flaky });
      await w.boot();
      w.setFocus(0, 0);
      await w.whenLoaded(0, 0, 300);
      const s = w.stats();
      expect(s.tilesLoaded).toBe(3);
      expect(s.tilesFailed).toBe(1);
      expect(w.isLoaded(100, 100)).toBe(false);
      expect(w.surfaceAt(100, 100)).toBe('void');
      expect(w.surfaceAt(-100, 100)).not.toBe('void');
      expect(errors.length).toBe(1);
      // Nouvelles demandes : nouvelles tentatives, en nombre borné.
      for (let i = 0; i < 6; i++) await w.whenLoaded(100, 100, 10);
      expect(attempts).toBe(3);
    } finally {
      console.error = original;
    }
  });
});

describe('monde : branchement dans le moteur', () => {
  it('le système passe avant tout le monde et publie ses services', async () => {
    const systems = createSystems();
    expect(systems.length).toBe(1);
    expect(systems[0].order).toBe(SystemOrder.INPUT - 50);
    const t = createTestContext({ modules: [createSystems] });
    // Dès la création du contexte (mode headless) : le quartier d'essai est en place, sans rien attendre.
    expect(t.ctx.world.ready).toBe(true);
    expect(t.ctx.world.nodeCount).toBe(95);
    expect(t.ctx.world.placeByName('essai')?.name).toBe("Place de l'Essai");
    const data = t.ctx.require<WorldData>('world.data');
    expect(data.manifest.name).toBe('test-district');
    expect(data.roadGraph.edges.length).toBe(131);
    expect(data.places.length).toBe(23);
    expect(data.landmarks[0].key).toBe('monument_essai');
    expect(data.terrain.nx).toBe(67);
    expect(data.tile(0, 0)).toBeNull();
    expect(t.ctx.require<WorldQueryExt>('world.query')).toBe(t.ctx.world);

    // Démarrage d'une session d'essai : le moteur appelle setFocus puis attend whenLoaded.
    const cfg = await t.start();
    expect(cfg.mode).toBe('test');
    expect(t.ctx.world.isLoaded(0, 0)).toBe(true);
    expect(data.loadedKeys().length).toBe(4);
    expect(data.tile(0, 0)?.shops.length).toBe(63);
    expect(t.ctx.world.surfaceAt(100, -7)).toBe('road');
    t.step(1);
    t.game.dispose();
  });

  it('session hors mode test : Paris si la carte existe', async () => {
    // « Paris » est ici la mini-carte en mémoire.
    const paris = miniMapRaw();
    const t = createTestContext({ modules: [() => createWorldQuerySystems({ parisSource: new MemoryMapSource(paris) })] });
    await t.ready;
    const events: WorldSourceEvent[] = [];
    t.ctx.events.onAny(WORLD_SOURCE_EVENT, (e) => events.push(e as WorldSourceEvent));
    expect(t.ctx.world.attribution).toContain("Quartier d'essai"); // avant toute session, en headless

    await t.start({ mode: 'libre', x: 120, z: 150 });
    expect(events).toEqual([{ name: 'mini', fallback: false }]);
    expect(t.ctx.world.bounds).toEqual({ minX: 0, minZ: 0, maxX: 512, maxZ: 512 });
    expect(t.ctx.world.placeByName('porche')?.name).toBe('Place du Porche');
    expect(t.ctx.world.isLoaded(120, 150)).toBe(true);
    expect(t.ctx.require<WorldData>('world.data').manifest.name).toBe('mini');

    // Retour au quartier d'essai pour une session de test : les tuiles de l'autre carte sont déchargées.
    const unloaded: string[] = [];
    t.ctx.events.on('world:tile_unloaded', (e) => unloaded.push(`${e.tx}_${e.tz}`));
    await t.start({ mode: 'test' });
    expect(unloaded).toEqual(['0_0']);
    expect(events[1]).toEqual({ name: 'test-district', fallback: false });
    expect(t.ctx.world.nodeCount).toBe(95);
    expect(t.ctx.world.isLoaded(0, 0)).toBe(true);
    t.game.dispose();
  });

  it('manifeste introuvable : quartier d\'essai et avertissement', async () => {
    const spy = notifySpy();
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      const t = createTestContext({ modules: [() => createWorldQuerySystems({ parisSource: missingSource })], systems: [spy.system] });
      await t.ready;
      expect(spy.notices.length).toBe(0); // rien n'a encore été demandé
      await t.start({ mode: 'monde_ouvert' });
      expect(spy.notices.length).toBe(1);
      expect(spy.notices[0].kind).toBe('warn');
      expect(spy.notices[0].text).toContain("quartier d'essai");
      expect(t.ctx.world.ready).toBe(true);
      expect(t.ctx.world.nodeCount).toBe(95);
      expect(t.ctx.world.isLoaded(0, 0)).toBe(true);
      expect(t.ctx.require<WorldQueryExt>('world.query').stats().fallback).toBe(true);
      expect(warnings.length).toBe(1);
      // Session suivante : nouvel avertissement, pas de nouvelle tentative inutile.
      await t.start({ mode: 'libre' });
      expect(spy.notices.length).toBe(2);
      // En mode test, aucun avertissement : c'est la carte voulue.
      await t.start({ mode: 'test' });
      expect(spy.notices.length).toBe(2);
      expect(t.ctx.require<WorldQueryExt>('world.query').stats().fallback).toBe(false);
      t.game.dispose();
    } finally {
      console.warn = warn;
    }
  });

  it('option source : test forcé, ou Paris dès le démarrage', async () => {
    const forced = createTestContext({ modules: [() => createWorldQuerySystems({ source: 'test', parisSource: new MemoryMapSource(miniMapRaw()) })] });
    await forced.start({ mode: 'libre' });
    expect(forced.ctx.world.nodeCount).toBe(95);
    forced.game.dispose();

    const paris = createTestContext({ modules: [() => createWorldQuerySystems({ source: 'paris', parisSource: new MemoryMapSource(miniMapRaw()) })] });
    await paris.ready;
    expect(paris.ctx.require<WorldData>('world.data').manifest.name).toBe('mini'); // installée dès le démarrage
    await paris.start({ mode: 'test', x: 120, z: 150 });
    expect(paris.ctx.require<WorldData>('world.data').manifest.name).toBe('mini'); // même en mode test
    paris.game.dispose();
  });

  it('paramètre de lancement ?map=test : quartier d\'essai quel que soit le mode', async () => {
    const launch: GameSystem = {
      id: 'test:launch',
      order: -1000,
      provide(ctx: GameContext): void {
        ctx.provide('launch', { autostart: 'paris', raw: { map: 'test' } });
      },
    };
    const t = createTestContext({ modules: [() => createWorldQuerySystems({ parisSource: new MemoryMapSource(miniMapRaw() as RawMapData) })], systems: [launch] });
    await t.start({ mode: 'monde_ouvert' });
    expect(t.ctx.world.nodeCount).toBe(95);
    t.game.dispose();
  });
});
