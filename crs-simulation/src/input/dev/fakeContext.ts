/* =====================================================================================
 * Contexte de jeu factice pour le banc d'essai et les tests du module des entrées (hors jeu livré).
 * N'implémente que ce que le module consomme : réglages, sauvegarde, session (phase), interface
 * (modal, notifications), joueur (invite, personne, véhicule, caméra), définitions d'objets,
 * bus d'événements, services. Volontairement autonome : ne dépend que de src/core/contracts.ts.
 * ===================================================================================== */

import type {
  CameraMode, EventBus, GameContext, InteractionOption, ItemDef, ItemStack, Person, SessionPhase, Settings, Vehicle,
} from '@/core/contracts';

type Handler = (payload: unknown) => void;

function createBus(): EventBus {
  const map = new Map<string, Handler[]>();
  const on = (name: string, h: Handler): (() => void) => {
    let list = map.get(name);
    if (!list) map.set(name, (list = []));
    list.push(h);
    return () => {
      const l = map.get(name);
      if (!l) return;
      const i = l.indexOf(h);
      if (i >= 0) l.splice(i, 1);
    };
  };
  const emit = (name: string, payload: unknown): void => {
    const l = map.get(name);
    if (!l) return;
    for (const h of l.slice()) h(payload);
  };
  return {
    on: (name, handler) => on(name, handler as Handler),
    once: (name, handler) => {
      const off = on(name, (p) => {
        off();
        (handler as Handler)(p);
      });
      return off;
    },
    emit: (name, payload) => emit(name, payload),
    onAny: (name, handler) => on(name, handler),
    emitAny: (name, payload) => emit(name, payload),
  };
}

export function defaultSettings(): Settings {
  return {
    quality: 'moyen', renderScale: 1, shadows: true, crowdScale: 1, drawDistance: 400, fov: 70,
    mouseSensitivity: 1, gamepadSensitivity: 1, touchSensitivity: 1, invertY: false,
    volumeMaster: 0.8, volumeEffects: 1, volumeVoices: 1, volumeAmbience: 0.8,
    voiceSynthesis: true, subtitles: true, violence: 'realiste', hudMarkers: true, aimAssist: true,
    vibration: true, showFps: false,
  };
}

/** Stockage minimal (localStorage du navigateur, ou mémoire). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface FakeContextOptions {
  headless?: boolean;
  /** Où ranger la sauvegarde (défaut : mémoire). */
  storage?: StorageLike | null;
  storageKey?: string;
}

/** Leviers du contexte factice, pour le banc d'essai et les tests. */
export interface FakeControls {
  phase: SessionPhase;
  modal: boolean;
  prompt: string | null;
  cameraMode: CameraMode;
  inVehicle: boolean;
  flying: boolean;
  inventory: ItemStack[];
  active: number;
  readonly notices: string[];
  readonly settings: Settings;
  /** Section brute de la sauvegarde (vérifications des tests). */
  saved(section: string): unknown;
}

export interface FakeContext {
  ctx: GameContext;
  controls: FakeControls;
}

const ITEM_DEFS: Record<string, { name: string; icon: string; max: number }> = {
  bouclier: { name: 'Bouclier', icon: '🛡', max: 1 },
  tonfa: { name: 'Tonfa', icon: '╿', max: 1 },
  gazeuse: { name: 'Gazeuse', icon: '≋', max: 1 },
  grenade_lacrymo: { name: 'Grenade lacrymogène', icon: '◍', max: 6 },
  lanceur_cougar: { name: 'Lanceur Cougar', icon: '⌐', max: 12 },
  lbd40: { name: 'LBD 40', icon: '⌖', max: 8 },
  menottes: { name: 'Menottes', icon: '∞', max: 4 },
  radio: { name: 'Radio', icon: '☎', max: 1 },
  extincteur: { name: 'Extincteur', icon: 'extincteur', max: 1 },
};

export function createFakeContext(options: FakeContextOptions = {}): FakeContext {
  const storage = options.storage ?? null;
  const storageKey = options.storageKey ?? 'crs-input-banc';
  let data: Record<string, unknown> = {};
  if (storage) {
    try {
      const raw = storage.getItem(storageKey);
      if (raw) data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  const persist = (): void => {
    if (!storage) return;
    try {
      storage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // stockage plein ou interdit : la sauvegarde reste en mémoire
    }
  };

  const settings = defaultSettings();
  const notices: string[] = [];
  const services = new Map<string, unknown>();
  const events = createBus();
  let nextId = 1;

  const controls: FakeControls = {
    phase: 'playing',
    modal: false,
    prompt: null,
    cameraMode: 'tps',
    inVehicle: false,
    flying: false,
    inventory: [],
    active: -1,
    notices,
    settings,
    saved: (section) => data[section],
  };

  const promptOption: InteractionOption = { verb: 'menotter', targetKind: 'person', targetId: 2, label: '', priority: 1, duration: 0, x: 0, z: 0 };
  const person = { id: 1, vehicleId: 0, inventory: controls.inventory, active: -1 } as unknown as Person;
  const vehicle = { id: 9, def: { flying: false } } as unknown as Vehicle;

  const ctx = {
    events,
    headless: options.headless ?? false,
    view: null,
    settings: {
      values: settings,
      set(key: keyof Settings, value: never): void {
        (settings as unknown as Record<string, unknown>)[key] = value;
        events.emit('settings:changed', { key });
      },
      reset(): void {
        Object.assign(settings, defaultSettings());
      },
    },
    save: {
      read<T>(section: string, fallback: T): T {
        return section in data ? (data[section] as T) : fallback;
      },
      write<T>(section: string, value: T): void {
        data[section] = JSON.parse(JSON.stringify(value));
        persist();
      },
      remove(section: string): void {
        delete data[section];
        persist();
      },
      exportAll: () => JSON.stringify(data),
      importAll: () => false,
      wipe(): void {
        data = {};
        persist();
      },
    },
    session: {
      get phase(): SessionPhase {
        return controls.phase;
      },
      config: null,
      start: async () => {},
      end(): void {},
      pause(paused: boolean): void {
        controls.phase = paused ? 'paused' : 'playing';
        events.emit('session:paused', { paused });
      },
    },
    ui: {
      notify(text: string): void {
        notices.push(text);
      },
      subtitle(): void {},
      banner(): void {},
      open(): void {},
      close(): void {},
      get modal(): boolean {
        return controls.modal;
      },
      current: null,
    },
    player: {
      state: {
        personId: 1, role: 'crs', get cameraMode(): CameraMode {
          return controls.cameraMode;
        },
        camYaw: 0, camPitch: 0, zoom: 1, controlEnabled: true, charge: 0,
        get prompt(): InteractionOption | null {
          if (controls.prompt === null) return null;
          promptOption.label = controls.prompt;
          return promptOption;
        },
        aimedPersonId: 0, aimX: 0, aimZ: 0,
      },
      person(): Person | null {
        person.inventory = controls.inventory;
        person.active = controls.active;
        person.vehicleId = controls.inVehicle ? 9 : 0;
        return person;
      },
      vehicle(): Vehicle | null {
        if (!controls.inVehicle) return null;
        (vehicle.def as { flying: boolean }).flying = controls.flying;
        return vehicle;
      },
      possess(): void {},
      setCameraMode(): void {},
      toggleCamera(): void {},
    },
    actions: {
      def(id: string): ItemDef | undefined {
        const d = ITEM_DEFS[id];
        if (!d) return undefined;
        return { id, name: d.name, icon: d.icon, maxCount: d.max } as unknown as ItemDef;
      },
    },
    provide<T>(key: string, service: T): void {
      services.set(key, service);
    },
    service<T>(key: string): T | undefined {
      return services.get(key) as T | undefined;
    },
    require<T>(key: string): T {
      if (!services.has(key)) throw new Error(`service « ${key} » absent`);
      return services.get(key) as T;
    },
    newId: () => nextId++,
    input: null,
  } as unknown as GameContext;

  return { ctx, controls };
}

/** Dotation d'essai d'un CRS pour la barre d'objets. */
export function sampleInventory(): ItemStack[] {
  const stack = (id: string, count: number): ItemStack => ({ id, count, state: 1, cooldown: 0 });
  return [
    stack('bouclier', 1), stack('tonfa', 1), stack('gazeuse', 1), stack('grenade_lacrymo', 4),
    stack('lanceur_cougar', 8), stack('lbd40', 6), stack('menottes', 3), stack('radio', 1), stack('extincteur', 1),
  ];
}
