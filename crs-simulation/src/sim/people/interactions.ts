/* =====================================================================================
 * Interactions (ordre ACTIONS) — publie ctx.interactions : registre de gestionnaires, recherche
 * des options, actions à durée avec progression et annulation.
 *
 *   - options(actor) : meilleure option de chaque gestionnaire, triées par priorité décroissante ;
 *   - start / startVerb : action immédiate (durée 0) ou à durée ; une seule action par personne ;
 *   - une action à durée est interrompue si l'acteur bouge (déplacement de plus de 0,6 m ou
 *     intention de marcher), est frappé (person:hurt), étourdi, mis hors de combat ou disparaît,
 *     si sa cible disparaît, ou si le gestionnaire le décide (tick() → false) ;
 *   - une exception dans un gestionnaire est journalisée et abandonne l'action sans arrêter le jeu.
 * Les gestionnaires fournis par ce module (porter, traîner, déposer, pousser) sont dans handlers.ts.
 * ===================================================================================== */

import type {
  EntityId, GameContext, GameSystem, InteractionApi, InteractionHandler, InteractionOption, InteractVerb, Person,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { truncate } from '@/core/arrays';
import { PEOPLE_INTERACTIONS_SERVICE } from './api';
import type { PeopleInteractionsApi } from './api';
import { createPeopleHandlers } from './handlers';
import type { PeopleShared } from './shared';
import * as T from './tuning';

interface ActiveInteraction {
  actor: Person;
  handler: InteractionHandler;
  /** Copie de l'option (un gestionnaire peut réutiliser son objet d'un find() à l'autre). */
  opt: InteractionOption;
  elapsed: number;
  startX: number;
  startZ: number;
}

function byPriorityDesc(a: InteractionOption, b: InteractionOption): number {
  return b.priority - a.priority;
}

const MOVE2 = T.INTERRUPT_MOVE * T.INTERRUPT_MOVE;
const INTENT2 = T.INTERRUPT_INTENT * T.INTERRUPT_INTENT;

export class InteractionSystem implements GameSystem {
  readonly id = 'people.interactions';
  readonly order = SystemOrder.ACTIONS;

  ctx!: GameContext;
  readonly api: InteractionApi;
  readonly ext: PeopleInteractionsApi;
  private readonly handlers: InteractionHandler[] = [];
  private readonly active: ActiveInteraction[] = [];
  private readonly byActor = new Map<EntityId, ActiveInteraction>();
  /** Gestionnaire à l'origine d'une option (quand plusieurs partagent un verbe). */
  private readonly origin = new WeakMap<InteractionOption, InteractionHandler>();
  /** Personnes dont un geste posé par le module (poussée) doit être effacé à l'échéance. */
  private readonly gestures: Person[] = [];

  constructor(readonly shared: PeopleShared) {
    const self = this;
    this.api = {
      register: (h) => this.register(h),
      options: (actor, out) => this.optionsFor(actor, 0, out),
      start: (actor, opt) => this.start(actor, opt),
      startVerb: (actor, verb, targetId) => this.startVerb(actor, verb, targetId),
      cancel: (actor) => this.cancel(actor),
      current: (actor) => this.byActor.get(actor.id) ?? null,
    };
    this.ext = {
      optionsFor: (actor, targetId, out) => this.optionsFor(actor, targetId, out),
      progress: (actor) => {
        const a = this.byActor.get(actor.id);
        if (!a || !(a.opt.duration > 0)) return 0;
        const k = a.elapsed / a.opt.duration;
        return k < 1 ? k : 1;
      },
      get activeCount(): number {
        return self.active.length;
      },
    };
  }

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    this.shared.bind(ctx);
    ctx.interactions = this.api;
    ctx.provide(PEOPLE_INTERACTIONS_SERVICE, this.ext);
  }

  init(ctx: GameContext): void {
    const own = createPeopleHandlers(ctx, this.shared, (p) => this.addGesture(p));
    for (let i = 0; i < own.length; i++) this.register(own[i]!);
    // être frappé interrompt l'action en cours
    ctx.events.on('person:hurt', (ev) => {
      const a = this.byActor.get(ev.id);
      if (a) this.cancelActive(a);
    });
  }

  reset(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.cancelActive(this.active[i]!);
    this.active.length = 0;
    this.byActor.clear();
    truncate(this.gestures, 0);
    this.shared.clear();
  }

  // ───────────────────────────── registre et recherche ─────────────────────────────

  register(handler: InteractionHandler): void {
    if (this.handlers.indexOf(handler) < 0) this.handlers.push(handler);
  }

  /** Options de l'acteur, sur une cible précise si targetId ≠ 0. */
  optionsFor(actor: Person, targetId: EntityId, out: InteractionOption[]): number {
    let n = 0;
    const handlers = this.handlers;
    for (let i = 0; i < handlers.length; i++) {
      const h = handlers[i]!;
      let o: InteractionOption | null = null;
      try {
        o = targetId !== 0 ? h.find(actor, targetId) : h.find(actor);
      } catch (err) {
        console.error(`[interactions] erreur dans find() du verbe « ${h.verb} »`, err);
      }
      if (!o) continue;
      if (targetId !== 0 && o.targetId !== targetId) continue;
      this.origin.set(o, h);
      if (n < out.length) out[n] = o;
      else out.push(o);
      n++;
    }
    truncate(out, n);
    if (n > 1) out.sort(byPriorityDesc);
    return n;
  }

  start(actor: Person, opt: InteractionOption): boolean {
    const current = this.byActor.get(actor.id);
    if (current) this.cancelActive(current);
    const known = this.origin.get(opt);
    if (known && known.verb === opt.verb) return this.begin(actor, opt, known);
    const handlers = this.handlers;
    for (let i = 0; i < handlers.length; i++) {
      const h = handlers[i]!;
      if (h.verb === opt.verb && this.begin(actor, opt, h)) return true;
    }
    return false;
  }

  startVerb(actor: Person, verb: InteractVerb, targetId: EntityId): boolean {
    const handlers = this.handlers;
    for (let i = 0; i < handlers.length; i++) {
      const h = handlers[i]!;
      if (h.verb !== verb) continue;
      let o: InteractionOption | null = null;
      try {
        o = h.find(actor, targetId);
      } catch (err) {
        console.error(`[interactions] erreur dans find() du verbe « ${verb} »`, err);
      }
      if (!o || o.targetId !== targetId) continue;
      const current = this.byActor.get(actor.id);
      if (current) this.cancelActive(current);
      if (this.begin(actor, o, h)) return true;
    }
    return false;
  }

  cancel(actor: Person): void {
    const a = this.byActor.get(actor.id);
    if (a) this.cancelActive(a);
  }

  // ───────────────────────────── déroulement ─────────────────────────────

  private begin(actor: Person, opt: InteractionOption, handler: InteractionHandler): boolean {
    const ctx = this.ctx;
    try {
      if (!handler.begin(actor, opt)) return false;
      if (!(opt.duration > 0)) {
        const verb = opt.verb;
        const targetId = opt.targetId;
        handler.complete(actor, opt);
        ctx.events.emitAny('interaction:completed', { actorId: actor.id, verb, targetId });
        return true;
      }
    } catch (err) {
      console.error(`[interactions] erreur au lancement du verbe « ${opt.verb} »`, err);
      return false;
    }
    const a: ActiveInteraction = { actor, handler, opt: { ...opt }, elapsed: 0, startX: actor.x, startZ: actor.z };
    this.active.push(a);
    this.byActor.set(actor.id, a);
    ctx.events.emitAny('interaction:started', { actorId: actor.id, verb: opt.verb, targetId: opt.targetId });
    return true;
  }

  private drop(a: ActiveInteraction): void {
    const i = this.active.indexOf(a);
    if (i >= 0) {
      this.active[i] = this.active[this.active.length - 1]!;
      this.active.pop();
    }
    if (this.byActor.get(a.actor.id) === a) this.byActor.delete(a.actor.id);
  }

  private cancelActive(a: ActiveInteraction): void {
    this.drop(a);
    try {
      a.handler.cancel?.(a.actor, a.opt);
    } catch (err) {
      console.error(`[interactions] erreur dans cancel() du verbe « ${a.opt.verb} »`, err);
    }
    this.ctx.events.emitAny('interaction:cancelled', { actorId: a.actor.id, verb: a.opt.verb, targetId: a.opt.targetId });
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const active = this.active;
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      if (!a) continue; // retirée par un gestionnaire pendant ce parcours
      const actor = a.actor;
      // acteur disparu, hors de combat, étourdi
      if (ctx.people.get(actor.id) !== actor || ctx.health.isIncapacitated(actor) || actor.stun > T.INTERRUPT_STUN) {
        this.cancelActive(a);
        continue;
      }
      // bouger interrompt : intention de marcher, ou déplacement (bousculade)
      const cmd = actor.cmd;
      const dx = actor.x - a.startX;
      const dz = actor.z - a.startZ;
      if (cmd.moveX * cmd.moveX + cmd.moveZ * cmd.moveZ > INTENT2 || dx * dx + dz * dz > MOVE2) {
        this.cancelActive(a);
        continue;
      }
      // cible disparue
      const opt = a.opt;
      if (opt.targetKind === 'person' && opt.targetId !== 0 && !ctx.people.get(opt.targetId)) {
        this.cancelActive(a);
        continue;
      }
      a.elapsed += dt;
      try {
        if (a.handler.tick && !a.handler.tick(actor, opt, a.elapsed, dt)) {
          if (this.byActor.get(actor.id) === a) this.cancelActive(a);
          continue;
        }
        if (this.byActor.get(actor.id) !== a) continue; // annulée ou remplacée pendant tick()
        if (a.elapsed >= opt.duration - 1e-9) {
          this.drop(a);
          a.handler.complete(actor, opt);
          ctx.events.emitAny('interaction:completed', { actorId: actor.id, verb: opt.verb, targetId: opt.targetId });
        }
      } catch (err) {
        console.error(`[interactions] erreur pendant le verbe « ${opt.verb} » : action abandonnée`, err);
        this.drop(a);
      }
    }

    // gestes brefs posés par le module (poussée) : avance de l'animation, puis retour au repos
    const gestures = this.gestures;
    if (gestures.length > 0) {
      const now = ctx.clock.now;
      for (let i = gestures.length - 1; i >= 0; i--) {
        const p = gestures[i]!;
        const e = this.shared.peek(p.id);
        if (e && p.upper === 'push' && now < e.upperUntil && ctx.people.get(p.id) === p) {
          p.upperT += dt;
          continue;
        }
        if (p.upper === 'push') {
          p.upper = 'none';
          p.upperT = 0;
        }
        gestures[i] = gestures[gestures.length - 1]!;
        gestures.pop();
      }
    }
  }

  private addGesture(p: Person): void {
    if (this.gestures.indexOf(p) < 0) this.gestures.push(p);
  }
}
