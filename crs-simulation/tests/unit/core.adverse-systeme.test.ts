// Tests ADVERSES du cœur du moteur (2/4) : sauvegarde malmenée (contenu corrompu, stockage en panne,
// import hostile) et cœur sans navigateur (aucun accès à window / document, ni à l'import ni à l'exécution).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@/core/events';
import { SAVE_FORMAT, SAVE_KEY, SAVE_VERSION, createSave } from '@/core/save';
import type { StorageLike } from '@/core/save';
import { DESKTOP_HINTS, SETTINGS_SECTION, createSettings } from '@/core/settings';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ───────────────────────────── sauvegarde ─────────────────────────────

/** Stockage factice : pannes programmables à la lecture et à l'écriture. */
class FlakyStorage implements StorageLike {
  data = new Map<string, string>();
  failGet = false;
  /** Nombre d'écritures à faire échouer (Infinity = toujours). */
  failSets = 0;
  writes = 0;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error('SecurityError');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSets > 0) {
      this.failSets--;
      throw new Error('QuotaExceededError');
    }
    this.writes++;
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('adverse — sauvegarde', () => {
  it('une sauvegarde corrompue (JSON tronqué) n\'empêche pas de sauvegarder ensuite, et n\'est pas perdue', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = new FlakyStorage();
    const broken = '{"format":"crs-simulation-france","version":1,"sections":{"career":{"rank":"brig';
    storage.data.set(SAVE_KEY, broken);
    const save = createSave({ storage });
    expect(warn).toHaveBeenCalled();
    expect(save.read('career', null)).toBeNull();
    // le stockage fonctionne : seule la DONNÉE est illisible. La persistance doit rester active…
    expect(save.persistent).toBe(true);
    save.write('career', { rank: 'gardien' });
    expect(storage.writes).toBeGreaterThanOrEqual(1);
    // … et au lancement suivant la nouvelle sauvegarde est relue
    const again = createSave({ storage });
    expect(again.read('career', null)).toEqual({ rank: 'gardien' });
    expect(again.persistent).toBe(true);
    // la donnée illisible a été mise de côté (récupérable à la main), pas écrasée sans trace
    const kept = [...storage.data.entries()].filter(([k]) => k !== SAVE_KEY);
    expect(kept.length).toBe(1);
    expect(kept[0]![1]).toBe(broken);
  });

  it('contenus valides en JSON mais absurdes : ignorés sans exception, stockage toujours utilisé', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const weird = [
      'null', '42', '"texte"', '[]', '[1,2,3]', '{}', 'true',
      JSON.stringify({ format: 'autre-jeu', version: 1, sections: { a: 1 } }),
      JSON.stringify({ format: SAVE_FORMAT, version: '1', sections: { a: 1 } }),
      JSON.stringify({ format: SAVE_FORMAT, version: 0, sections: { a: 1 } }),
      JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION + 1, sections: { a: 1 } }),
      JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, sections: [1, 2] }),
      JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, sections: null }),
      JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION }),
    ];
    for (const raw of weird) {
      const storage = new FlakyStorage();
      storage.data.set(SAVE_KEY, raw);
      let save!: ReturnType<typeof createSave>;
      expect(() => (save = createSave({ storage }))).not.toThrow();
      expect(save.read('a', 'défaut')).toBe('défaut');
      expect(save.sections()).toEqual([]);
      expect(save.persistent).toBe(true);
      save.write('a', 5);
      expect(createSave({ storage }).read('a', 0)).toBe(5);
    }
  });

  it('stockage indisponible : lecture refusée → mémoire ; écriture refusée puis rétablie → la sauvegarde reprend', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 1. lecture interdite (iframe sans accès au stockage)
    const blocked = new FlakyStorage();
    blocked.failGet = true;
    const a = createSave({ storage: blocked });
    expect(a.persistent).toBe(false);
    a.write('x', 1);
    expect(a.read('x', 0)).toBe(1);

    // 2. quota dépassé une fois : la valeur vit en mémoire, puis la sauvegarde reprend dès que possible
    const flaky = new FlakyStorage();
    const b = createSave({ storage: flaky });
    b.write('avant', 1);
    flaky.failSets = 1;
    expect(() => b.write('pendant', 2)).not.toThrow();
    expect(b.read('pendant', 0)).toBe(2);
    expect(b.persistent).toBe(false); // la dernière écriture n'a pas atteint le stockage
    b.write('apres', 3); // le stockage refonctionne
    expect(b.persistent).toBe(true);
    const reread = createSave({ storage: flaky });
    expect(reread.read('avant', 0)).toBe(1);
    expect(reread.read('pendant', 0)).toBe(2); // rien n'a été perdu
    expect(reread.read('apres', 0)).toBe(3);

    // 3. stockage définitivement en panne : jamais d'exception, pas d'avalanche d'avertissements
    const warn = vi.spyOn(console, 'warn');
    warn.mockClear();
    const dead = new FlakyStorage();
    const c = createSave({ storage: dead });
    dead.failSets = Infinity;
    for (let i = 0; i < 200; i++) c.write('n', i);
    expect(c.read('n', -1)).toBe(199);
    expect(c.persistent).toBe(false);
    expect(warn.mock.calls.length).toBeLessThanOrEqual(2);
    expect(() => c.wipe()).not.toThrow();
    expect(() => c.exportAll()).not.toThrow();
  });

  it('localStorage dont le simple accès lève une exception (iframe bac à sable) : repli en mémoire', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: The operation is insecure.');
      },
    });
    try {
      let save!: ReturnType<typeof createSave>;
      expect(() => (save = createSave())).not.toThrow();
      expect(save.persistent).toBe(false);
      save.write('s', { a: 1 });
      expect(save.read('s', null)).toEqual({ a: 1 });
    } finally {
      if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('noms de section piégés et import hostile : aucune pollution de prototype, rien d\'hérité', () => {
    const save = createSave({ storage: null });
    expect(save.read('toString', 'défaut')).toBe('défaut');
    expect(save.read('constructor', 'défaut')).toBe('défaut');
    expect(save.read('__proto__', 'défaut')).toBe('défaut');
    const hostile = `{"format":"${SAVE_FORMAT}","version":${SAVE_VERSION},"sections":{"__proto__":{"pollue":true},"constructor":{"prototype":{"pollue":true}},"ok":1}}`;
    expect(save.importAll(hostile)).toBe(true);
    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
    expect(save.read('ok', 0)).toBe(1);
    expect(save.read<Record<string, unknown>>('__proto__', {})).toEqual({ pollue: true }); // simple donnée
    const round = createSave({ storage: null });
    expect(round.importAll(save.exportAll())).toBe(true);
    expect(round.sections().sort()).toEqual(['__proto__', 'constructor', 'ok']);
    // imports invalides : refusés, état intact
    for (const bad of ['', '{', 'null', '[]', '{"format":"x"}', hostile.slice(0, 40)]) {
      expect(save.importAll(bad)).toBe(false);
    }
    expect(save.read('ok', 0)).toBe(1);
  });

  it('réglages enregistrés corrompus : valeurs par défaut, sans exception', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = createEventBus();
    for (const stored of ['abc', 42, null, [1, 2], { quality: 'extrême', fov: 'large', renderScale: Number.NaN, shadows: 1, volumeMaster: 9, __proto__: null }]) {
      const save = createSave({ storage: null });
      save.write(SETTINGS_SECTION, stored);
      const settings = createSettings({ save, events: bus, device: DESKTOP_HINTS });
      expect(settings.values.quality).toBe(settings.defaults.quality);
      expect(settings.values.fov).toBe(settings.defaults.fov);
      expect(settings.values.renderScale).toBe(settings.defaults.renderScale);
      expect(settings.values.shadows).toBe(settings.defaults.shadows);
      expect(settings.values.volumeMaster).toBeLessThanOrEqual(1);
      for (const v of Object.values(settings.values)) expect(v === undefined || (typeof v === 'number' && Number.isNaN(v))).toBe(false);
    }
  });
});

// ───────────────────────────── sans navigateur ─────────────────────────────

const CORE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/core');
const CORE_FILES = readdirSync(CORE_DIR).filter((f) => f.endsWith('.ts')).sort();

/** Globaux de navigateur : aucun module du cœur ne doit y toucher au moment de son import. */
const BROWSER_GLOBALS = [
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'screen', 'matchMedia',
  'requestAnimationFrame', 'cancelAnimationFrame', 'HTMLElement', 'AudioContext', 'Image',
];

function trapGlobals(onAccess: (name: string) => void): () => void {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const name of BROWSER_GLOBALS) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        onAccess(name);
        return undefined;
      },
    });
  }
  return () => {
    for (const [name, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  };
}

describe('adverse — cœur sans navigateur', () => {
  it('le dossier src/core contient bien les modules attendus', () => {
    expect(CORE_FILES).toContain('game.ts');
    expect(CORE_FILES).toContain('contracts.ts');
    expect(CORE_FILES.length).toBeGreaterThanOrEqual(25);
  });

  it('importer chaque module de src/core ne lit aucun global de navigateur (ni window, ni document…)', async () => {
    const touched: string[] = [];
    let current = '';
    vi.resetModules();
    const restore = trapGlobals((name) => touched.push(`${current} → ${name}`));
    try {
      for (const file of CORE_FILES) {
        current = file;
        await import(/* @vite-ignore */ path.join(CORE_DIR, file));
      }
    } finally {
      restore();
      vi.resetModules();
    }
    expect(touched).toEqual([]);
  });

  it('aucune référence directe à window ou document dans le code de src/core (hors commentaires)', () => {
    const offenders: string[] = [];
    for (const file of CORE_FILES) {
      const src = readFileSync(path.join(CORE_DIR, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '') // commentaires de bloc
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1'); // commentaires de fin de ligne
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // accès direct : « window.x », « document.x », « window[ », hors propriété d'un autre objet (g.window, shop.window)
        if (/(^|[^.\w'"`])(window|document)\s*(\.|\[|\()/.test(lines[i]!)) offenders.push(`${file} : ${lines[i]!.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('un moteur de test complet (boot, session, simulation, fin) tourne sans toucher à un global de navigateur', async () => {
    vi.resetModules();
    const touched: string[] = [];
    const restore = trapGlobals((name) => touched.push(name));
    try {
      const { createTestContext } = await import('@/core/testing');
      const t = createTestContext({ seed: 9 });
      await t.start({ crowdSize: 10 });
      for (let i = 0; i < 20; i++) t.ctx.people.spawn({ kind: 'manifestant', x: i, z: 0 });
      t.step(2);
      expect(t.ctx.clock.now).toBeCloseTo(2, 6);
      expect(t.ctx.headless).toBe(true);
      expect(t.ctx.view).toBeNull();
      t.ctx.settings.set('fov', 80);
      t.ctx.save.write('essai', { a: 1 });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      t.game.run(); // sans requestAnimationFrame : avertissement, pas d'exception
      expect(warn).toHaveBeenCalledTimes(1);
      t.ctx.session.end(true);
      t.game.dispose();
    } finally {
      restore();
      vi.resetModules();
    }
    // seul run() a le droit de regarder si requestAnimationFrame existe
    expect(touched.filter((n) => n !== 'requestAnimationFrame')).toEqual([]);
  });
});
