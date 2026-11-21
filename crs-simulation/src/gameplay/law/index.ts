/* =====================================================================================
 * Droit — sommations, cadre d'emploi de la force, infractions et preuves, interpellations.
 *
 * Publie ctx.law (LawApi complet) et les services 'law.records' (dossier pour le compte rendu et
 * la carrière), 'law.advisor' (aide à la décision sans effet), 'law.config' (réglages) et
 * 'law.handover' (points de regroupement, s'il n'existe pas déjà). Enregistre les gestionnaires
 * d'interaction de l'interpellation.
 *
 * Deux systèmes :
 *   - « law » (ordre RULES) : état des règles d'engagement recalculé à chaque pas, suivi de la
 *     dispersion, maintien dans l'attroupement, contraintes et évasions des personnes retenues ;
 *   - « law.custody » (juste avant MOVEMENT) : commandes de déplacement des personnes retenues,
 *     écrites après les contrôleurs et avant la locomotion.
 *
 * Simulation pure : ni DOM ni Three.js ; aléatoire dérivé de ctx.rng à chaque reset().
 * Sources : docs/research/00-bible-realisme.md (A) et docs/research/01-doctrine-cadre-legal.md.
 * ===================================================================================== */

import type {
  EntityId, ForceLevel, ForceMeans, ForceVerdict, GameContext, GameSystem, LawApi, ModuleFactory, NoticeKind,
  Offense, OffenseType, Person, RoeState, SommationStage, Unsubscribe,
} from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import type { LawAdvisor, LawHandover } from './api';
import { LAW_ADVISOR_SERVICE, LAW_CONFIG_SERVICE, LAW_HANDOVER_SERVICE, LAW_RECORDS_SERVICE } from './api';
import { AttackTracker } from './attack';
import { Attroupement } from './attroupement';
import { applySessionConfig, createLawConfig, LEVEL_CONTACT } from './config';
import { Controls } from './controls';
import { Custody } from './custody';
import { custodyPreMove, custodyUpdate } from './custody-step';
import { wireEvents } from './events';
import { ForceJudge } from './force';
import { Handover } from './handover';
import { createArrestHandlers } from './interactions';
import type { Kernel } from './kernel';
import { Offenses } from './offenses';
import { Perception } from './perception';
import { Records } from './records';
import { Sommations } from './sommations';
import { Subduing } from './subdue';
import { sommationText } from './texts';

/** Intervalle minimal entre deux messages identiques adressés au joueur (s de session). */
const NOTICE_REPEAT = 3;

export const createSystems: ModuleFactory = (): GameSystem[] => {
  let kernel: Kernel | null = null;
  let subs: Unsubscribe[] = [];
  let ownHandover: LawHandover | null = null;

  function build(ctx: GameContext): Kernel {
    const roe: RoeState = {
      dispersionOrdered: false,
      sommation: 0,
      sommationAt: 0,
      underAttack: false,
      lawfulForce: LEVEL_CONTACT,
      authorizedForce: LEVEL_CONTACT,
    };
    let lastNotice = '';
    let lastNoticeAt = -Infinity;
    const k = {
      ctx,
      cfg: createLawConfig(),
      roe,
      rng: ctx.rng.fork('law'),
      notify(p: Person | null | undefined, text: string, kind: NoticeKind = 'info', seconds = 5): void {
        if (!p || !p.isPlayer) return;
        const now = ctx.clock.now;
        if (text === lastNotice && now - lastNoticeAt < NOTICE_REPEAT && now >= lastNoticeAt) return;
        lastNotice = text;
        lastNoticeAt = now;
        ctx.ui.notify(text, kind, seconds);
      },
    } as Kernel;
    k.records = new Records();
    k.eyes = new Perception(k);
    k.attack = new AttackTracker(k);
    k.offenses = new Offenses(k);
    k.attroupement = new Attroupement(k);
    k.sommations = new Sommations(k);
    k.force = new ForceJudge(k);
    k.custody = new Custody(k);
    k.subdue = new Subduing(k);
    k.handover = new Handover(k);
    k.controls = new Controls(k);
    return k;
  }

  function resetAll(k: Kernel): void {
    const ctx = k.ctx;
    k.rng = ctx.rng.fork('law');
    applySessionConfig(k.cfg, ctx.session.config);
    k.records.reset();
    k.eyes.reset();
    k.attack.reset();
    k.offenses.reset();
    k.force.reset();
    k.custody.reset();
    k.subdue.reset();
    k.controls.reset();
    k.roe.underAttack = false;
    k.sommations.reset();
    if (ownHandover) ownHandover.points.length = 0;
  }

  function createApi(k: Kernel): LawApi {
    return {
      roe: k.roe,
      forceLog: k.records.forces,
      recordOffense(p: Person, type: OffenseType, x: number, z: number, severity?: number): Offense {
        return k.offenses.record(p, type, x, z, severity);
      },
      worstOffense(p: Person): Offense | null {
        return k.offenses.worst(p);
      },
      canArrest(p: Person): boolean {
        return k.offenses.canArrest(p);
      },
      sommation(by: Person): SommationStage {
        return k.sommations.pronounce(by);
      },
      sommationText,
      authorize(level: ForceLevel, byId: EntityId): void {
        k.sommations.authorize(level, byId);
      },
      reportForce(by: Person, means: ForceMeans, target: Person | null, x: number, z: number): ForceVerdict {
        return k.force.report(by, means, target, x, z);
      },
      reset(): void {
        resetAll(k);
      },
    };
  }

  function createAdvisor(k: Kernel): LawAdvisor {
    const som = k.sommations;
    function left(from: number): number {
      if (k.roe.sommation !== 3 || from === Infinity) return Infinity;
      const wait = from - k.ctx.clock.now;
      return wait > 0 ? wait : 0;
    }
    return {
      assess: (by, means, target, x, z) => k.force.assess(by, means, target, x, z),
      riposteAt: (x, z) => k.attack.near(x, z, k.cfg.riposteRadius),
      authorizedFor: (by) => som.authorizedFor(by, k.attack.near(by.x, by.z, k.cfg.riposteRadius)),
      sommationRefusal: (by) => som.refusal(by),
      sommationWait: () => som.waitNext(),
      forceWait: () => left(som.forceFrom),
      armsWait: () => left(som.armsFrom),
      get reiterated(): boolean {
        return som.reiterated;
      },
      get enclosed(): boolean {
        return som.enclosed;
      },
      get zoneX(): number {
        return som.zoneX;
      },
      get zoneZ(): number {
        return som.zoneZ;
      },
      get zoneRadius(): number {
        return k.cfg.sequenceRadius;
      },
    };
  }

  const law: GameSystem = {
    id: 'law',
    order: SystemOrder.RULES,

    provide(ctx: GameContext): void {
      const k = build(ctx);
      kernel = k;
      ctx.law = createApi(k);
      ctx.provide(LAW_RECORDS_SERVICE, k.records);
      ctx.provide(LAW_CONFIG_SERVICE, k.cfg);
      ctx.provide(LAW_ADVISOR_SERVICE, createAdvisor(k));
      if (ctx.service<LawHandover>(LAW_HANDOVER_SERVICE) === undefined) {
        ownHandover = { points: [] };
        ctx.provide(LAW_HANDOVER_SERVICE, ownHandover);
      }
    },

    init(ctx: GameContext): void {
      const k = kernel;
      if (!k) return;
      subs = wireEvents(k);
      // enregistrés à l'init : le service d'interactions définitif est alors en place
      const handlers = createArrestHandlers(k);
      for (let i = 0; i < handlers.length; i++) ctx.interactions.register(handlers[i]!);
    },

    update(dt: number): void {
      const k = kernel;
      if (!k) return;
      k.attack.update();
      k.sommations.update(dt);
      custodyUpdate(k);
    },

    reset(): void {
      if (kernel) resetAll(kernel);
    },

    dispose(): void {
      for (let i = 0; i < subs.length; i++) subs[i]!();
      subs = [];
    },
  };

  const custody: GameSystem = {
    id: 'law.custody',
    // après les contrôleurs (joueur, IA), juste avant la locomotion
    order: SystemOrder.MOVEMENT - 10,
    update(): void {
      if (kernel) custodyPreMove(kernel);
    },
  };

  return [law, custody];
};

export type {
  ArrestRecord, AuthorizationRecord, ComplaintRecord, ControlRecord, ForceRecord, HandoverPoint, LawAdvisor,
  LawConfig, LawHandover, LawRecords, LawStats, SommationRecord,
} from './api';
