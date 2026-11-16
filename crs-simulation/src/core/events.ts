/* =====================================================================================
 * Bus d'événements — canal de communication principal entre modules.
 *
 *   - on/once/emit : événements du contrat (GameEvents), typés ;
 *   - onAny/emitAny : événements libres hors contrat (même mécanique, mêmes canaux) ;
 *   - se désabonner (ou s'abonner) pendant une émission est sûr : un gestionnaire retiré n'est
 *     plus appelé, un gestionnaire ajouté ne le sera qu'à l'émission suivante ;
 *   - chaque abonnement est un enregistrement distinct : la même fonction abonnée deux fois donne deux
 *     abonnements, et la fonction de désabonnement ne retire jamais que le sien (même après clear()) ;
 *   - une réémission du même événement depuis ses propres gestionnaires est permise, mais bornée :
 *     au-delà de MAX_EMIT_DEPTH niveaux imbriqués, l'émission est abandonnée et signalée (boucle
 *     d'événements : A émet B qui réémet A…), au lieu de faire déborder la pile ;
 *   - une exception dans un gestionnaire est journalisée et n'empêche pas les suivants ;
 *     avec l'option `rethrow` (contextes de test stricts), la première exception est en plus relancée
 *     à l'émetteur une fois tous les gestionnaires appelés, pour qu'un bogue fasse échouer le test ;
 *   - emit() n'alloue rien.
 * ===================================================================================== */

import type { EventBus, EventName, GameEvents, Unsubscribe } from './contracts';

type Handler = (payload: unknown) => void;

/** Profondeur maximale d'émissions imbriquées d'un même événement (au-delà : boucle d'événements). */
export const MAX_EMIT_DEPTH = 48;

/** Un abonnement : la fonction et son état. `active` passe à false au désabonnement (compacté ensuite). */
interface Sub {
  fn: Handler;
  active: boolean;
}

interface Channel {
  /** Abonnements dans l'ordre d'arrivée ; les inactifs sont retirés quand plus aucune émission n'est en cours. */
  subs: Sub[];
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
    const subs = ch.subs;
    let w = 0;
    for (let r = 0; r < subs.length; r++) {
      const sub = subs[r]!;
      if (sub.active) subs[w++] = sub;
    }
    subs.length = w;
    ch.holes = false;
  }

  function subscribe(name: string, handler: Handler): Unsubscribe {
    let ch = channels.get(name);
    if (!ch) {
      ch = { subs: [], depth: 0, holes: false };
      channels.set(name, ch);
    }
    const channel = ch;
    const sub: Sub = { fn: handler, active: true };
    channel.subs.push(sub);
    return () => {
      if (!sub.active) return;
      sub.active = false;
      if (channel.depth > 0) {
        channel.holes = true; // retiré du tableau à la fin de l'émission en cours
      } else {
        const i = channel.subs.indexOf(sub);
        if (i >= 0) channel.subs.splice(i, 1);
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
    const subs = ch.subs;
    const n = subs.length; // les gestionnaires ajoutés pendant l'émission attendront la suivante
    if (n === 0) return;
    if (ch.depth >= MAX_EMIT_DEPTH) {
      // un gestionnaire de cet événement le réémet sans fin (directement ou par ricochet)
      errorCount++;
      const message =
        `[events] boucle d'événements : « ${name} » réémis depuis ses propres gestionnaires sur plus de ` +
        `${MAX_EMIT_DEPTH} niveaux — émission abandonnée`;
      console.error(message);
      if (rethrow) throw new Error(message);
      return;
    }
    let failed = false;
    let firstError: unknown;
    ch.depth++;
    for (let i = 0; i < n; i++) {
      const sub = subs[i]!;
      if (!sub.active) continue;
      try {
        sub.fn(payload);
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
      for (let i = 0; i < ch.subs.length; i++) if (ch.subs[i]!.active) n++;
      return n;
    },
    clear(): void {
      for (const ch of channels.values()) {
        // les abonnements sont marqués inactifs : un désabonnement tardif ne retirera rien d'autre
        for (let i = 0; i < ch.subs.length; i++) ch.subs[i]!.active = false;
        if (ch.depth > 0) ch.holes = true;
        else ch.subs.length = 0;
      }
    },
    get errorCount(): number {
      return errorCount;
    },
  };
}
