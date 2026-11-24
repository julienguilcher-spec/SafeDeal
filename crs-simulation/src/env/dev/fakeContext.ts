/* Contexte de jeu factice pour les tests et le banc d'essai du module « environnement » (hors jeu livré).
 * Autonome : ne dépend que de src/core/contracts.ts. N'implémente que ce que le module consomme :
 * bus d'événements, générateur aléatoire dérivable, session (configuration), services. */

import type { EventBus, GameContext, Rng, SessionConfig, SessionPhase } from '@/core/contracts';

type Handler = (payload: unknown) => void;

export function createBus(): EventBus {
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

/** Générateur déterministe (mulberry32) conforme à l'interface Rng du contrat. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hashLabel = (label: string | number): number => {
    const str = String(label);
    let h = 2166136261 ^ seed;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min)),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    fork: (label) => createRng(hashLabel(label)),
  };
}

export function sessionConfig(partial: Partial<SessionConfig> = {}): SessionConfig {
  return {
    mode: 'test', missionId: '', role: 'crs', rank: 'gardien', place: '', x: 0, z: 0, timeOfDay: 14,
    weather: 'clair', crowdSize: 0, tension: 0, volatility: 0, duration: 'temps_reel', seed: 1, ...partial,
  };
}

export interface FakeEnvContext {
  ctx: GameContext;
  /** Événements reçus, dans l'ordre : [nom, charge utile]. */
  events: [string, unknown][];
  /** Change la configuration de session (lue par reset()). */
  setConfig(partial: Partial<SessionConfig> | null): void;
}

export function createFakeContext(partial: Partial<SessionConfig> | null = {}): FakeEnvContext {
  const bus = createBus();
  const services = new Map<string, unknown>();
  const events: [string, unknown][] = [];
  let config: SessionConfig | null = partial ? sessionConfig(partial) : null;
  let rng = createRng(config ? config.seed : 1);
  const record = (name: string): void => {
    bus.onAny(name, (p) => events.push([name, typeof p === 'object' && p ? { ...(p as object) } : p]));
  };
  record('env:hour');
  record('env:weather');
  record('env:lightning');
  const phase: SessionPhase = 'playing';
  const ctx = {
    events: bus,
    headless: true,
    view: null,
    get rng(): Rng {
      return rng;
    },
    session: {
      phase,
      get config(): SessionConfig | null {
        return config;
      },
    },
    env: null,
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
  } as unknown as GameContext;
  return {
    ctx,
    events,
    setConfig(p): void {
      config = p ? sessionConfig(p) : null;
      rng = createRng(config ? config.seed : 1);
    },
  };
}
