import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '@/core/contracts';
import { createEventBus } from '@/core/events';
import { SAVE_FORMAT, SAVE_KEY, SAVE_VERSION, createSave, detectStorage } from '@/core/save';
import type { StorageLike } from '@/core/save';
import {
  DESKTOP_HINTS, SETTINGS_SECTION, applyQualityPreset, createSettings, defaultSettings, pickInitialQuality,
  qualityPreset, readDeviceHints, sanitizeSetting,
} from '@/core/settings';
import type { DeviceHints } from '@/core/settings';

/** Stockage factice en mémoire, avec pannes simulables. */
class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  failGet = false;
  failSet = false;
  writes = 0;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error('SecurityError');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error('QuotaExceededError');
    this.writes++;
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sauvegarde', () => {
  it('clé versionnée', () => {
    expect(SAVE_KEY).toContain(`v${SAVE_VERSION}`);
    expect(SAVE_KEY).toContain('crs');
  });

  it('lit, écrit, supprime des sections ; les valeurs sont des copies', () => {
    const save = createSave({ storage: null });
    expect(save.persistent).toBe(false);
    expect(save.read('carriere', { grade: 'gardien' })).toEqual({ grade: 'gardien' });
    const value = { grade: 'brigadier', missions: [1, 2, 3], nested: { a: true } };
    save.write('carriere', value);
    value.missions.push(4); // modifier l'original ne touche pas la sauvegarde
    const read1 = save.read<typeof value | null>('carriere', null)!;
    expect(read1).toEqual({ grade: 'brigadier', missions: [1, 2, 3], nested: { a: true } });
    read1.nested.a = false; // modifier une lecture non plus
    expect(save.read<typeof value | null>('carriere', null)!.nested.a).toBe(true);
    save.write('compteur', 3);
    save.write('texte', 'bonjour');
    save.write('nul', null);
    expect(save.read('compteur', 0)).toBe(3);
    expect(save.read('texte', '')).toBe('bonjour');
    expect(save.read('nul', 'défaut')).toBeNull();
    expect(save.sections().sort()).toEqual(['carriere', 'compteur', 'nul', 'texte']);
    save.remove('compteur');
    save.remove('inexistante');
    expect(save.read('compteur', -1)).toBe(-1);
    save.write('texte', undefined); // undefined = suppression
    expect(save.read('texte', 'x')).toBe('x');
    // noms de sections piégés
    expect(save.read('__proto__', 'ok')).toBe('ok');
    expect(save.read('toString', 'ok')).toBe('ok');
    save.write('constructor', { a: 1 });
    expect(save.read('constructor', null)).toEqual({ a: 1 });
  });

  it('persiste dans le stockage sous une seule clé et relit au démarrage suivant', () => {
    const storage = new FakeStorage();
    const a = createSave({ storage });
    expect(a.persistent).toBe(true);
    a.write('carriere', { grade: 'major' });
    a.write('medias', { image: 0.7 });
    expect([...storage.data.keys()]).toEqual([SAVE_KEY]);
    const file = JSON.parse(storage.data.get(SAVE_KEY)!);
    expect(file).toEqual({ format: SAVE_FORMAT, version: SAVE_VERSION, sections: { carriere: { grade: 'major' }, medias: { image: 0.7 } } });

    const b = createSave({ storage });
    expect(b.read('carriere', null)).toEqual({ grade: 'major' });
    expect(b.read('medias', null)).toEqual({ image: 0.7 });
    b.remove('medias');
    expect(createSave({ storage }).read('medias', 'absent')).toBe('absent');

    // clé personnalisée : sauvegardes indépendantes
    const other = createSave({ storage, key: 'autre' });
    expect(other.read('carriere', 'vide')).toBe('vide');
  });

  it('export / import JSON', () => {
    const a = createSave({ storage: null });
    a.write('carriere', { grade: 'capitaine', xp: 1200 });
    a.write('settings', { fov: 80 });
    const json = a.exportAll();
    expect(JSON.parse(json).format).toBe(SAVE_FORMAT);

    const storage = new FakeStorage();
    const b = createSave({ storage });
    b.write('ancien', 1);
    expect(b.importAll(json)).toBe(true);
    expect(b.read('carriere', null)).toEqual({ grade: 'capitaine', xp: 1200 });
    expect(b.read('ancien', 'remplacé')).toBe('remplacé'); // l'import remplace tout
    expect(createSave({ storage }).read('settings', null)).toEqual({ fov: 80 }); // et il est persisté
    expect(b.exportAll()).toBe(json);
  });

  it('importAll refuse les données invalides sans rien modifier ni lever d\'exception', () => {
    const save = createSave({ storage: null });
    save.write('carriere', { grade: 'gardien' });
    const bad = [
      '', 'pas du json', '{', 'null', '42', '[]', '{}',
      JSON.stringify({ format: 'autre-jeu', version: 1, sections: {} }),
      JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION + 1, sections: {} }),
      JSON.stringify({ format: SAVE_FORMAT, version: 0, sections: {} }),
      JSON.stringify({ format: SAVE_FORMAT, version: '1', sections: {} }),
      JSON.stringify({ format: SAVE_FORMAT, version: 1, sections: [] }),
      JSON.stringify({ format: SAVE_FORMAT, version: 1 }),
    ];
    for (const json of bad) expect(save.importAll(json), json).toBe(false);
    expect(save.read('carriere', null)).toEqual({ grade: 'gardien' });
  });

  it('wipe efface tout, y compris dans le stockage', () => {
    const storage = new FakeStorage();
    const save = createSave({ storage });
    save.write('a', 1);
    save.wipe();
    expect(save.sections()).toEqual([]);
    expect(storage.data.size).toBe(0);
    expect(save.read('a', 'vide')).toBe('vide');
    save.write('b', 2); // toujours utilisable
    expect(createSave({ storage }).read('b', 0)).toBe(2);
  });

  it('ne lève jamais d\'exception : stockage en panne, sauvegarde corrompue, valeur non sérialisable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // lecture impossible (iframe sans accès au stockage)
    const blocked = new FakeStorage();
    blocked.failGet = true;
    const a = createSave({ storage: blocked });
    expect(a.persistent).toBe(false);
    a.write('x', 1);
    expect(a.read('x', 0)).toBe(1); // repli en mémoire
    expect(blocked.writes).toBe(0);

    // contenu corrompu
    const corrupt = new FakeStorage();
    corrupt.data.set(SAVE_KEY, '{"format":');
    const b = createSave({ storage: corrupt });
    expect(b.read('x', 'défaut')).toBe('défaut');
    const foreign = new FakeStorage();
    foreign.data.set(SAVE_KEY, JSON.stringify({ format: SAVE_FORMAT, version: 99, sections: { x: 1 } }));
    expect(createSave({ storage: foreign }).read('x', 'défaut')).toBe('défaut');

    // quota dépassé à l'écriture : la valeur reste disponible en mémoire
    const full = new FakeStorage();
    const c = createSave({ storage: full });
    full.failSet = true;
    expect(() => c.write('gros', { n: 1 })).not.toThrow();
    expect(c.read('gros', null)).toEqual({ n: 1 });
    expect(c.persistent).toBe(false);

    // valeur cyclique : écriture ignorée, valeur précédente conservée
    const d = createSave({ storage: null });
    d.write('s', { ok: true });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => d.write('s', cyclic)).not.toThrow();
    expect(d.read('s', null)).toEqual({ ok: true });
    expect(() => d.exportAll()).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('sous Node, sans localStorage utilisable, le repli en mémoire est automatique', () => {
    const detected = detectStorage();
    const save = createSave(); // aucun stockage fourni : détection
    expect(save.persistent).toBe(detected !== null);
    save.write('essai', [1, 2]);
    expect(save.read('essai', [])).toEqual([1, 2]);
    save.wipe();
  });
});

describe('réglages', () => {
  function make(device: DeviceHints = DESKTOP_HINTS, storage: StorageLike | null = null) {
    const save = createSave({ storage });
    const events = createEventBus();
    const changes: (keyof Settings)[] = [];
    events.on('settings:changed', (e) => changes.push(e.key));
    const settings = createSettings({ save, events, device });
    return { save, events, changes, settings };
  }

  it('valeurs par défaut sensées et complètes', () => {
    const { settings } = make();
    const v = settings.values;
    expect(v).toEqual(defaultSettings(DESKTOP_HINTS));
    expect(v.quality).toBe('haut');
    expect(v.renderScale).toBe(1);
    expect(v.shadows).toBe(true);
    expect(v.crowdScale).toBe(1);
    expect(v.violence).toBe('realiste'); // réglage « sobre » disponible, non imposé
    expect(v.subtitles).toBe(true);
    expect(v.showFps).toBe(false);
    expect(v.invertY).toBe(false);
    expect(v.fov).toBeGreaterThanOrEqual(60);
    expect(v.fov).toBeLessThanOrEqual(90);
    for (const k of ['volumeMaster', 'volumeEffects', 'volumeVoices', 'volumeAmbience'] as const) {
      expect(v[k]).toBeGreaterThan(0);
      expect(v[k]).toBeLessThanOrEqual(1);
    }
    const keys: (keyof Settings)[] = [
      'quality', 'renderScale', 'shadows', 'crowdScale', 'drawDistance', 'fov', 'mouseSensitivity',
      'gamepadSensitivity', 'touchSensitivity', 'invertY', 'volumeMaster', 'volumeEffects', 'volumeVoices',
      'volumeAmbience', 'voiceSynthesis', 'subtitles', 'violence', 'hudMarkers', 'aimAssist', 'vibration', 'showFps',
    ];
    expect(Object.keys(v).sort()).toEqual([...keys].sort());
  });

  it('qualité initiale selon l\'appareil : tactile ou modeste', () => {
    const phone: DeviceHints = { touch: true, mobile: true, cores: 8, memoryGb: 6, screenMin: 390 };
    const tablet: DeviceHints = { touch: true, mobile: false, cores: 8, memoryGb: 8, screenMin: 1024 };
    const smallTouch: DeviceHints = { touch: true, mobile: false, cores: 8, memoryGb: 8, screenMin: 600 };
    const oldLaptop: DeviceHints = { touch: false, mobile: false, cores: 4, memoryGb: 8, screenMin: 768 };
    const lowMemory: DeviceHints = { touch: false, mobile: false, cores: 12, memoryGb: 4, screenMin: 1080 };
    const unknown: DeviceHints = { touch: false, mobile: false, cores: 0, memoryGb: 0, screenMin: 0 };
    expect(pickInitialQuality(phone)).toBe('bas');
    expect(pickInitialQuality(smallTouch)).toBe('bas');
    expect(pickInitialQuality(tablet)).toBe('moyen');
    expect(pickInitialQuality(oldLaptop)).toBe('moyen');
    expect(pickInitialQuality(lowMemory)).toBe('moyen');
    expect(pickInitialQuality(DESKTOP_HINTS)).toBe('haut');
    expect(pickInitialQuality(unknown)).toBe('haut');

    const { settings } = make(phone);
    expect(settings.values.quality).toBe('bas');
    expect(settings.values.shadows).toBe(false);
    expect(settings.values.renderScale).toBeLessThan(1);
    expect(settings.values.crowdScale).toBeLessThan(1);
    expect(settings.values.drawDistance).toBeLessThan(defaultSettings(DESKTOP_HINTS).drawDistance);
    expect(settings.device).toBe(phone);
    // sous Node, la lecture des indices matériels renvoie l'appareil de référence
    expect(readDeviceHints()).toEqual(DESKTOP_HINTS);
    // préréglages croissants
    expect(qualityPreset('bas').drawDistance).toBeLessThan(qualityPreset('moyen').drawDistance);
    expect(qualityPreset('moyen').drawDistance).toBeLessThan(qualityPreset('haut').drawDistance);
    expect(qualityPreset('haut').drawDistance).toBeLessThan(qualityPreset('ultra').drawDistance);
  });

  it('set : valide, borne, persiste et émet settings:changed (seulement en cas de changement)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { settings, changes, save } = make();
    settings.set('fov', 85);
    settings.set('fov', 85); // inchangé : pas d'événement
    settings.set('invertY', true);
    settings.set('quality', 'bas');
    settings.set('violence', 'sobre');
    expect(changes).toEqual(['fov', 'invertY', 'quality', 'violence']);
    expect([settings.values.fov, settings.values.invertY, settings.values.quality, settings.values.violence]).toEqual([85, true, 'bas', 'sobre']);
    expect(save.read<Partial<Settings>>(SETTINGS_SECTION, {})).toMatchObject({ fov: 85, invertY: true, quality: 'bas', violence: 'sobre' });

    // bornes
    settings.set('fov', 500);
    expect(settings.values.fov).toBe(110);
    settings.set('renderScale', 0.1);
    expect(settings.values.renderScale).toBe(0.5);
    settings.set('volumeMaster', -3);
    expect(settings.values.volumeMaster).toBe(0);
    settings.set('crowdScale', 9);
    expect(settings.values.crowdScale).toBe(2);

    // valeurs refusées
    const before = { ...settings.values };
    settings.set('quality', 'extreme' as Settings['quality']);
    settings.set('fov', Number.NaN);
    settings.set('fov', '90' as unknown as number);
    settings.set('shadows', 1 as unknown as boolean);
    settings.set('inconnu' as keyof Settings, 1 as never);
    expect(settings.values).toEqual(before);
    expect(warn).toHaveBeenCalledTimes(4);
    expect(sanitizeSetting('fov', 20, before)).toBe(50);
    expect(sanitizeSetting('violence', 'gore', before)).toBeUndefined();
  });

  it('les réglages enregistrés sont relus ; les valeurs invalides sont ignorées', () => {
    const storage = new FakeStorage();
    const first = make(DESKTOP_HINTS, storage);
    first.settings.set('fov', 95);
    first.settings.set('subtitles', false);
    first.settings.set('quality', 'ultra');

    const second = make(DESKTOP_HINTS, storage);
    expect([second.settings.values.fov, second.settings.values.subtitles, second.settings.values.quality]).toEqual([95, false, 'ultra']);
    expect(second.changes).toEqual([]); // le chargement n'émet rien

    // sauvegarde abîmée : chaque clé est validée séparément
    const save = createSave({ storage: null });
    save.write(SETTINGS_SECTION, { fov: 'large', quality: 'moyen', volumeMaster: 7, inconnu: 1, shadows: 'oui' });
    const s = createSettings({ save, events: createEventBus(), device: DESKTOP_HINTS });
    const d = defaultSettings(DESKTOP_HINTS);
    expect(s.values.fov).toBe(d.fov);
    expect(s.values.quality).toBe('moyen');
    expect(s.values.volumeMaster).toBe(1); // borné
    expect(s.values.shadows).toBe(d.shadows);
    expect('inconnu' in s.values).toBe(false);
    save.write(SETTINGS_SECTION, 'n\'importe quoi');
    expect(createSettings({ save, events: createEventBus(), device: DESKTOP_HINTS }).values).toEqual(d);
  });

  it('reset revient aux valeurs par défaut de l\'appareil et les signale', () => {
    const storage = new FakeStorage();
    const { settings, changes, save } = make(DESKTOP_HINTS, storage);
    const same = settings.values;
    settings.set('fov', 100);
    settings.set('showFps', true);
    changes.length = 0;
    settings.reset();
    expect(settings.values).toBe(same); // même objet : les modules peuvent garder la référence
    expect(settings.values).toEqual(settings.defaults);
    expect(changes.sort()).toEqual(['fov', 'showFps']);
    expect(save.read(SETTINGS_SECTION, 'absent')).toBe('absent');
    settings.reset(); // déjà par défaut : aucun événement
    expect(changes.length).toBe(2);
  });

  it('applyQualityPreset règle la qualité et les paramètres graphiques associés', () => {
    const { settings, changes } = make();
    applyQualityPreset(settings, 'bas');
    expect(settings.values).toMatchObject(qualityPreset('bas'));
    expect(changes.sort()).toEqual(['crowdScale', 'drawDistance', 'quality', 'renderScale', 'shadows']);
  });
});
