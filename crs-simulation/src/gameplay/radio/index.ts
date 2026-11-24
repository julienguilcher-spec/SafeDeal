/* =====================================================================================
 * Radio — service de messages et phraséologie des forces de l'ordre et des secours.
 *
 * Publie :
 *   ctx.radio          RadioApi du contrat : say() avec files d'attente par canal, anti-répétition, voix stable
 *                      par émetteur, journal horodaté, événement 'radio:message' et sous-titre (priorité ≥ 1) ;
 *                      RadioMessage.silent (phrase d'ordre du joueur) : écrit tout de suite, jamais dit ;
 *                      RadioMessage.reply (accusé d'un ordre du joueur) : dit en priorité, dans la seconde (queue.ts)
 *   'radio.phrases'    RadioPhrases : deux cents situations environ, 3 à 5 variantes chacune (voir PHRASES.md)
 *   'radio.callsigns'  CallsignBook : indicatifs fictifs cohérents avec la bible (section E)
 *   'radio.control'    RadioControl : ambiance, sous-titres, statistiques et état des files
 *
 * Simulation pure : ni DOM ni Three.js ; aléatoire dérivé de ctx.rng (fork « radio »), temps de ctx.clock.
 * La voix elle-même est produite par le module audio, à l'écoute de 'radio:message' (msg.voice = indice stable).
 * ===================================================================================== */

import type { GameContext, GameSystem, ModuleFactory, RadioApi, RadioChannel, RadioMessage, Rng } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { RadioAmbient } from './ambient';
import type { RadioControl, RadioStats } from './api';
import { RADIO_CALLSIGNS_SERVICE, RADIO_CONTROL_SERVICE, RADIO_PHRASES_SERVICE } from './api';
import { createCallsigns } from './callsigns';
import { createPhraseLibrary } from './phrase-lib';
import { RadioQueue, trimLog } from './queue';

/**
 * Nombre maximal de messages conservés dans le journal. Le journal est la pièce relue au compte rendu : quand il est
 * plein, on en retire d'abord l'ambiance la plus ancienne, et les messages opérationnels en dernier recours.
 */
const LOG_MAX = 2000;
/** Durée d'affichage du sous-titre au-delà de la durée estimée du message (s). */
const SUBTITLE_EXTRA = 1.5;

export const createSystems: ModuleFactory = (): GameSystem[] => {
  let ambient: RadioAmbient | null = null;
  let queue: RadioQueue | null = null;
  let rng: Rng | null = null;
  let radioCtx: GameContext | null = null;
  let offFire: (() => void) | null = null;

  const log: (RadioMessage & { t: number })[] = [];
  const control = { ambient: true, subtitles: true };
  /** Filtre d'écoute du joueur (RadioControl.listen) et messages qu'il a écartés. */
  let listen: ((msg: RadioMessage) => boolean) | null = null;
  let muted = new WeakSet<RadioMessage>();

  const radio: GameSystem = {
    id: 'radio',
    order: SystemOrder.RULES - 50,

    provide(ctx: GameContext): void {
      radioCtx = ctx;
      rng = ctx.rng.fork('radio');
      const calls = createCallsigns(ctx);

      const q = new RadioQueue((msg, now, duration) => {
        const out: RadioMessage = msg.voice === undefined ? { ...msg, voice: calls.voiceOf(msg.from) } : msg;
        trimLog(log, LOG_MAX);
        const entry = { ...out, t: now };
        log.push(entry);
        // écoute filtrée (joueur exécutant) : le message reste au journal, sans sous-titre ni voix
        let heard = true;
        if (listen) {
          try {
            heard = listen(out);
          } catch (err) {
            console.error('[radio] filtre d\'écoute', err);
          }
        }
        if (!heard) {
          muted.add(out);
          muted.add(entry);
        }
        ctx.events.emit('radio:message', { msg: out, t: now });
        if (heard && control.subtitles && out.priority >= 1) ctx.ui.subtitle(out.from, out.text, duration + SUBTITLE_EXTRA);
      });
      queue = q;
      // le message du joueur passe en tête de la file de son canal (compte rendu attendu par l'objectif)
      q.fromPlayer = (msg) => msg.personId !== undefined && ctx.player.person()?.id === msg.personId;

      const api: RadioApi = {
        log,
        say(msg: RadioMessage): void {
          q.submit(msg, ctx.clock.now);
        },
        clear(): void {
          log.length = 0;
          q.reset();
        },
      };
      ctx.radio = api;

      const phrases = createPhraseLibrary({
        ctx,
        calls,
        rng: () => rng!,
        submit: (msg) => {
          const o = q.submit(msg, ctx.clock.now);
          return o === 'played' || o === 'queued';
        },
      });

      ambient = new RadioAmbient(ctx, phrases, rng, (channel: RadioChannel) => q.pending(channel));

      const stats: RadioStats = {
        get broadcast(): number {
          return q.counters.broadcast;
        },
        get repeated(): number {
          return q.counters.repeated;
        },
        get dropped(): number {
          return q.counters.dropped;
        },
        get pending(): number {
          return q.pendingTotal;
        },
      };
      const ctl: RadioControl = {
        get ambient(): boolean {
          return ambient!.enabled;
        },
        set ambient(v: boolean) {
          ambient!.enabled = v;
          control.ambient = v;
        },
        get subtitles(): boolean {
          return control.subtitles;
        },
        set subtitles(v: boolean) {
          control.subtitles = v;
        },
        stats,
        pending: (channel) => q.pending(channel),
        busyUntil: (channel) => q.busyUntil(channel),
        flush: () => q.flush(),
        get listen(): ((msg: RadioMessage) => boolean) | null {
          return listen;
        },
        set listen(fn: ((msg: RadioMessage) => boolean) | null) {
          listen = fn;
        },
        muted: (msg: RadioMessage) => muted.has(msg),
      };

      ctx.provide(RADIO_CALLSIGNS_SERVICE, calls);
      ctx.provide(RADIO_PHRASES_SERVICE, phrases);
      ctx.provide(RADIO_CONTROL_SERVICE, ctl);
    },

    init(ctx: GameContext): void {
      // l'ambiance ne parle d'un feu au sol que s'il a été signalé et qu'il brûle encore
      offFire = ctx.events.on('fire:started', (e) => ambient?.noteFire(e.x, e.z));
    },

    update(): void {
      if (!queue || !ambient || !radioCtx) return;
      queue.update(radioCtx.clock.now);
      ambient.update();
    },

    reset(): void {
      // le journal et les files sont aussi vidés par ctx.radio.clear() appelé par la session
      log.length = 0;
      queue?.reset();
      muted = new WeakSet<RadioMessage>();
      if (!radioCtx) return;
      rng = radioCtx.rng.fork('radio');
      ambient?.reset(radioCtx.rng.fork('radio.ambiance'));
    },

    dispose(): void {
      offFire?.();
      offFire = null;
    },
  };

  return [radio];
};

export type {
  CallsignBook, PhraseEnd, PhraseInfo, PhraseParam, PhraseParams, PhraseRole, RadioControl, RadioPhrases, RadioStats, SayOptions,
} from './api';
export { RADIO_CALLSIGNS_SERVICE, RADIO_CONTROL_SERVICE, RADIO_PHRASES_SERVICE } from './api';
export { CENTRAL_CALLSIGN, DEFAULT_EXECUTANT_FILTER, ExecutantRadioFilter, canonicalCallsign, classifyRadio, listenForRole, parseRadioHeader, radioBody } from './relevance';
export type { ChannelListen, ExecutantFilterConfig, RadioHeader, RadioRelevance, RadioScope } from './relevance';
