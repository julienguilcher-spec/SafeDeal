/* =====================================================================================
 * Services neutres : droit (sommations, journal des infractions et de l'emploi de la force)
 * et radio (journal des messages).
 * ===================================================================================== */

import type {
  EntityId, ForceLevel, ForceMeans, ForceReport, ForceVerdict, GameContext, LawApi, Offense, OffenseType,
  Person, RadioApi, RadioMessage, RoeState, SommationStage,
} from './contracts';

/** Gravité par défaut des infractions (1 = contravention … 5 = crime). */
const OFFENSE_SEVERITY: Record<string, number> = {
  attroupement_apres_sommations: 2,
  dissimulation_visage: 2,
  jet_projectile: 3,
  violence_agent: 4,
  degradation: 2,
  tag: 1,
  incendie: 4,
  pillage: 3,
  recel: 2,
  barricade: 2,
  port_arme: 3,
  rebellion: 3,
  outrage: 2,
  entrave_circulation: 1,
  violence: 3,
  intrusion: 2,
};

/** Textes réglementaires des sommations (art. R. 211-11 du code de la sécurité intérieure). */
const SOMMATION_TEXTS: readonly string[] = [
  '',
  'Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux.',
  'Première sommation : nous allons faire usage de la force. Quittez immédiatement les lieux.',
  'Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux.',
];

/** Distance à laquelle un agent est réputé témoin d'une infraction (m). */
const WITNESS_RANGE = 40;
/** Force licite avant la fin des sommations, puis après la dernière. */
const FORCE_BEFORE: ForceLevel = 1;
const FORCE_AFTER: ForceLevel = 3;

/** Une personne peut-elle prononcer les sommations (autorité habilitée, insigne apparent) ? */
export function isAuthority(p: Person): boolean {
  return p.faction === 'police' && (p.kind === 'commissaire' || p.poste === 'autorite_civile' || p.look.sash);
}

/**
 * Droit neutre : journal des infractions et de l'emploi de la force réellement tenu, sommations
 * qui progressent (annonce → première → dernière) quand elles sont prononcées par une autorité
 * habilitée, niveau de force autorisé mémorisé. Aucun contrôle de proportionnalité : tout emploi
 * de la force est jugé « licite ».
 */
export function createNullLaw(ctx: GameContext): LawApi {
  const roe: RoeState = {
    dispersionOrdered: false,
    sommation: 0,
    sommationAt: 0,
    underAttack: false,
    lawfulForce: FORCE_BEFORE,
    authorizedForce: FORCE_BEFORE,
  };
  const forceLog: ForceReport[] = [];
  const witnesses: Person[] = [];
  let offenderId: EntityId = 0;

  function canWitness(p: Person): boolean {
    return p.faction === 'police' && p.id !== offenderId && p.posture !== 'down';
  }

  return {
    roe,
    forceLog,
    recordOffense(p: Person, type: OffenseType, x: number, z: number, severity?: number): Offense {
      offenderId = p.id;
      let witnessed = false;
      const n = ctx.people.queryRadius(x, z, WITNESS_RANGE, witnesses, canWitness);
      for (let i = 0; i < n; i++) {
        const w = witnesses[i]!;
        if (ctx.world.lineOfSight(w.x, w.z, x, z)) {
          witnessed = true;
          break;
        }
      }
      witnesses.length = 0;
      const offense: Offense = {
        type,
        t: ctx.clock.now,
        x,
        z,
        severity: severity ?? OFFENSE_SEVERITY[type] ?? 2,
        witnessed,
        filmed: false,
      };
      p.offenses.push(offense);
      ctx.events.emit('law:offense', { personId: p.id, offense });
      return offense;
    },
    worstOffense(p: Person): Offense | null {
      let worst: Offense | null = null;
      for (let i = 0; i < p.offenses.length; i++) {
        const o = p.offenses[i]!;
        if (!worst || o.severity >= worst.severity) worst = o;
      }
      return worst;
    },
    canArrest(p: Person): boolean {
      // une contravention (gravité 1) ne fonde pas une interpellation
      for (let i = 0; i < p.offenses.length; i++) if (p.offenses[i]!.severity >= 2) return true;
      return false;
    },
    sommation(by: Person): SommationStage {
      if (!isAuthority(by) || roe.sommation >= 3) return roe.sommation;
      const stage = (roe.sommation + 1) as SommationStage;
      roe.sommation = stage;
      roe.sommationAt = ctx.clock.now;
      roe.dispersionOrdered = true;
      if (stage >= 3) roe.lawfulForce = FORCE_AFTER;
      ctx.events.emit('law:sommation', { stage, byId: by.id, x: by.x, z: by.z, text: SOMMATION_TEXTS[stage]! });
      return stage;
    },
    sommationText(stage: SommationStage): string {
      return SOMMATION_TEXTS[stage] ?? '';
    },
    authorize(level: ForceLevel, byId: EntityId): void {
      roe.authorizedForce = level;
      ctx.events.emit('law:authorized', { level, byId });
    },
    reportForce(by: Person, means: ForceMeans, target: Person | null, x: number, z: number): ForceVerdict {
      const verdict: ForceVerdict = {
        kind: 'licite',
        reason: "Emploi de la force enregistré sans évaluation (module de droit non branché).",
        severity: 0,
      };
      const report: ForceReport = {
        t: ctx.clock.now, byId: by.id, means, targetId: target ? target.id : 0, x, z, verdict, filmed: false,
      };
      forceLog.push(report);
      ctx.events.emit('law:force', { report });
      return verdict;
    },
    reset(): void {
      roe.dispersionOrdered = false;
      roe.sommation = 0;
      roe.sommationAt = 0;
      roe.underAttack = false;
      roe.lawfulForce = FORCE_BEFORE;
      roe.authorizedForce = FORCE_BEFORE;
      forceLog.length = 0;
    },
  };
}

/** Nombre maximal de messages conservés dans le journal radio neutre. */
const RADIO_LOG_MAX = 500;

/** Radio neutre : journal horodaté + événement radio:message (pas de voix ni de sous-titre). */
export function createNullRadio(ctx: GameContext): RadioApi {
  const log: (RadioMessage & { t: number })[] = [];
  return {
    log,
    say(msg: RadioMessage): void {
      const t = ctx.clock.now;
      if (log.length >= RADIO_LOG_MAX) log.splice(0, RADIO_LOG_MAX >> 1);
      log.push({ ...msg, t });
      ctx.events.emit('radio:message', { msg, t });
    },
    clear(): void {
      log.length = 0;
    },
  };
}
