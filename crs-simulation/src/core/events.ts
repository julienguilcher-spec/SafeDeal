/* =====================================================================================
 * Bus d'événements — canal de communication principal entre modules.
 *
 *   - on/once/emit : événements du contrat (GameEvents), typés ;
 *   - onAny/emitAny : événements libres hors contrat (même mécanique, mêmes canaux) ;
 *   - se désabonner (ou s'abonner) pendant une émission est sûr : un gestionnaire retiré n'est
 *     plus appelé, un gestionnaire ajouté ne le sera qu'à l'émission suivante ;
 *   - une exception dans un gestionnaire est journalisée et n'empêche pas les suivants ;
 *     avec l'option `rethrow` (contextes de test stricts), la première exception est en plus relancée
 *     à l'émetteur une fois tous les gestionnaires appelés, pour qu'un bogue fasse échouer le test ;
 *   - emit() n'alloue rien.
 * ===================================================================================== */

import type { EventBus, EventName, GameEvents, Unsubscribe } from './contracts';

type Handler = (payload: unknown) => void;

interface Channel {
  /** Gestionnaires dans l'ordre d'abonnement ; null = retiré pendant une émission (compacté ensuite). */
  handlers: (Handler | null)[];
  /** Profondeur d'émissions imbriquées en cours sur ce canal. */
  depth: number;
  holes: boolean;
}

/** Bus du contrat, plus quelques outils de diagnostic. */
export interface EventBusEx extends EventBus {
  /** Nombre de gestionnaires abonnés à un événement. */
  listenerCount(name: string): number;
  /** Retire tous les gestionnaires (tests, arrêt du jeu). */
  clear(): void;
  /** Nombre total d'erreurs levées par des gestionnaires depuis la création du bus. */
  readonly errorCount: number;
}

export interface EventBusOptions {
  /** Relancer à l'émetteur la première exception d'un gestionnaire, après avoir appelé tous les autres. */
  rethrow?: boolean;
}

export function createEventBus(options: EventBusOptions = {}): EventBusEx {
  const channels = new Map<string, Channel>();
  const rethrow = options.rethrow === true;
  let errorCount = 0;

  function compact(ch: Channel): void {
    const hs = ch.handlers;
    let w = 0;
    for (let r = 0; r < hs.length; r++) {
      const h = hs[r];
      if (h) hs[w++] = h;
    }
    hs.length = w;
    ch.holes = false;
  }

  function subscribe(name: string, handler: Handler): Unsubscribe {
    let ch = channels.get(name);
    if (!ch) {
      ch = { handlers: [], depth: 0, holes: false };
      channels.set(name, ch);
    }
    const channel = ch;
    channel.handlers.push(handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const i = channel.handlers.indexOf(handler);
      if (i < 0) return;
      if (channel.depth > 0) {
        channel.handlers[i] = null;
        channel.holes = true;
      } else {
        channel.handlers.splice(i, 1);
      }
    };
  }

  function subscribeOnce(name: string, handler: Handler): Unsubscribe {
    const off = subscribe(name, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  function dispatch(name: string, payload: unknown): void {
    const ch = channels.get(name);
    if (!ch) return;
    const hs = ch.handlers;
    const n = hs.length; // les gestionnaires ajoutés pendant l'émission attendront la suivante
    if (n === 0) return;
    let failed = false;
    let firstError: unknown;
    ch.depth++;
    for (let i = 0; i < n; i++) {
      const h = hs[i];
      if (!h) continue;
      try {
        h(payload);
      } catch (err) {
        errorCount++;
        console.error(`[events] erreur dans un gestionnaire de « ${name} »`, err);
        if (rethrow && !failed) {
          failed = true;
          firstError = err;
        }
      }
    }
    ch.depth--;
    if (ch.depth === 0 && ch.holes) compact(ch);
    if (failed) throw firstError;
  }

  return {
    on<K extends EventName>(name: K, handler: (payload: GameEvents[K]) => void): Unsubscribe {
      return subscribe(name, handler as Handler);
    },
    once<K extends EventName>(name: K, handler: (payload: GameEvents[K]) => void): Unsubscribe {
      return subscribeOnce(name, handler as Handler);
    },
    emit<K extends EventName>(name: K, payload: GameEvents[K]): void {
      dispatch(name, payload);
    },
    onAny(name: string, handler: (payload: unknown) => void): Unsubscribe {
      return subscribe(name, handler);
    },
    emitAny(name: string, payload: unknown): void {
      dispatch(name, payload);
    },
    listenerCount(name: string): number {
      const ch = channels.get(name);
      if (!ch) return 0;
      let n = 0;
      for (let i = 0; i < ch.handlers.length; i++) if (ch.handlers[i]) n++;
      return n;
    },
    clear(): void {
      for (const ch of channels.values()) {
        if (ch.depth > 0) {
          for (let i = 0; i < ch.handlers.length; i++) ch.handlers[i] = null;
          ch.holes = true;
        } else {
          ch.handlers.length = 0;
        }
      }
    },
    get errorCount(): number {
      return errorCount;
    },
  };
}
