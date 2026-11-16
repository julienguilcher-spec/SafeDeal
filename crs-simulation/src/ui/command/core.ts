/* =====================================================================================
 * Cœur du module de commandement : étendue du commandement (mise en cache), émission des ordres
 * par ctx.squads.issue avec compte rendu radio, contrôle du niveau de force, accès aux services
 * étendus (tous facultatifs). Partagé par la carte tactique, la roue d'ordres, la radio et le HUD.
 * ===================================================================================== */

import type { ForceLevel, GameContext, OrderType, Person, Squad } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, MetroApi, RescueApi, TrafficControlApi, UiKit } from '@/core/extensions';
import type { MapsRuntime } from '../maps/runtime';
import type { CommandApi, CommandScope, IssuedOrder } from './api';
import { verbOf } from './orders';
import type { OrderGeom, OrderVerb } from './orders';
import { orderPhrase } from './phrases';
import { computeScope } from './scope';

const ISSUED_MAX = 50;
const SCOPE_PERIOD = 0.5;

export interface IssueResult {
  ok: boolean;
  /** Motif du refus (affiché au joueur) quand ok est faux. */
  reason: string;
  count: number;
}

export class CommandCore implements CommandApi {
  readonly issued: IssuedOrder[] = [];
  /** Plafond de force appliqué aux ordres du joueur (borné par la force autorisée au moment de l'ordre). */
  orderForce: ForceLevel = 4;
  private scope_: CommandScope | null = null;
  private scopeAt = -1e9;

  constructor(readonly ctx: GameContext, readonly maps: MapsRuntime, public kit: UiKit | undefined) {}

  // ───────────────────────────── services facultatifs ─────────────────────────────

  get incidents(): IncidentsApi | undefined {
    return this.ctx.service<IncidentsApi>(EXT.incidents);
  }

  get traffic(): TrafficControlApi | undefined {
    return this.ctx.service<TrafficControlApi>(EXT.traffic);
  }

  get metro(): MetroApi | undefined {
    return this.ctx.service<MetroApi>(EXT.metro);
  }

  get rescue(): RescueApi | undefined {
    return this.ctx.service<RescueApi>(EXT.rescue);
  }

  // ───────────────────────────── joueur, étendue ─────────────────────────────

  player(): Person | null {
    const id = this.ctx.player.state.personId;
    return id !== 0 ? this.ctx.people.get(id) ?? null : null;
  }

  /** Étendue du commandement (recalculée au plus deux fois par seconde). */
  scope(): CommandScope {
    const t = this.maps.time;
    if (!this.scope_ || t - this.scopeAt > SCOPE_PERIOD) {
      this.scope_ = computeScope(this.ctx);
      this.scopeAt = t;
    }
    return this.scope_;
  }

  invalidateScope(): void {
    this.scope_ = null;
  }

  canCommand(squadId: number): boolean {
    return squadId > 0 && this.scope().squadIds.has(squadId);
  }

  /** Indicatif de celui qui parle à la radio : son unité, à défaut son nom. */
  callsign(): string {
    const p = this.player();
    const sc = this.scope();
    if (this.ctx.player.state.role === 'commissaire' || (p && p.kind === 'commissaire')) return 'AUTORITÉ';
    const own = sc.ownSquadId !== 0 ? this.ctx.squads.get(sc.ownSquadId) : p && p.squadId !== 0 ? this.ctx.squads.get(p.squadId) : undefined;
    if (own) return own.name;
    return p ? p.name : 'UNITÉ';
  }

  /** Force maximale transmise avec un ordre : plafond du joueur, borné par l'autorisation en vigueur. */
  effectiveForce(): ForceLevel {
    const authorized = this.ctx.law.roe.authorizedForce;
    return (this.orderForce < authorized ? this.orderForce : authorized) as ForceLevel;
  }

  /**
   * Un ordre de ce type peut-il partir ? Refusé si l'unité n'est pas sous les ordres du joueur ou si
   * la force qu'il suppose dépasse le niveau autorisé (hors riposte à des violences contre l'unité).
   */
  check(verb: OrderVerb): { ok: boolean; reason: string; warning: string } {
    const roe = this.ctx.law.roe;
    if (this.scope().level === 'lecture') return { ok: false, reason: 'Lecture seule\u00a0: vous ne donnez pas d’ordre.', warning: '' };
    if (verb.force > roe.authorizedForce && !roe.underAttack) {
      return {
        ok: false, warning: '',
        reason: `Refusé\u00a0: «\u00a0${verb.label}\u00a0» suppose une force de niveau ${verb.force}, le niveau autorisé est ${roe.authorizedForce}.`,
      };
    }
    let warning = '';
    if (verb.coercive && roe.sommation < 3 && !roe.underAttack) {
      warning = 'Emploi de la force avant la dernière sommation\u00a0: l’ordre part, vous en répondrez.';
    }
    return { ok: true, reason: '', warning };
  }

  /**
   * Donne un ordre à des unités. `geoms[i]` s'applique à `squads[i]` ; un seul élément = le même pour
   * toutes. L'ordre part par ctx.squads.issue, est tracé dans `issued` et annoncé à la radio.
   */
  issue(type: OrderType, squads: readonly Squad[], geoms: readonly OrderGeom[] | null, targetId = 0, targetName = ''): IssueResult {
    const verb = verbOf(type);
    if (!verb) return { ok: false, reason: `Ordre inconnu\u00a0: ${String(type)}`, count: 0 };
    const chk = this.check(verb);
    if (!chk.ok) return { ok: false, reason: chk.reason, count: 0 };
    const ctx = this.ctx;
    const playerId = ctx.player.state.personId;
    const maxForce = this.effectiveForce();
    const from = this.callsign();
    let count = 0;
    for (let i = 0; i < squads.length; i++) {
      const s = squads[i]!;
      if (!this.canCommand(s.id)) continue;
      const g = geoms ? geoms[geoms.length === 1 ? 0 : i] : undefined;
      if (g) {
        ctx.squads.issue(s.id, {
          type, x: g.x, z: g.z, heading: g.heading, width: g.width, targetId, maxForce, issuedBy: playerId,
        });
      } else {
        // ordre immédiat : point et cap du chef d'unité (valeurs par défaut du magasin)
        ctx.squads.issue(s.id, { type, targetId, maxForce, issuedBy: playerId });
      }
      const o = s.order;
      this.issued.push({
        squadId: s.id, type, x: o.x, z: o.z, heading: o.heading, width: o.width, targetId: o.targetId, maxForce: o.maxForce,
        t: ctx.clock.now,
      });
      if (this.issued.length > ISSUED_MAX) this.issued.splice(0, this.issued.length - ISSUED_MAX);
      // compte rendu radio : au plus trois messages détaillés pour un ordre groupé
      if (count < 3) {
        const leader = s.leaderId !== 0 ? ctx.people.get(s.leaderId) : undefined;
        const dist = leader ? Math.hypot(o.x - leader.x, o.z - leader.z) : 0;
        ctx.radio.say({
          channel: 'commandement', from, priority: verb.coercive ? 2 : 1, personId: playerId,
          text: orderPhrase({
            type, unit: s.name, from, sector: g ? ctx.world.sectorName(o.x, o.z) : '', heading: o.heading, width: o.width,
            distance: dist, target: targetName,
          }),
        });
      }
      count++;
    }
    if (count === 0) return { ok: false, reason: 'Aucune des unités sélectionnées n’est sous vos ordres.', count: 0 };
    if (chk.warning !== '') ctx.ui.notify(chk.warning, 'warn', 5);
    ctx.audio.play('radio_bip');
    return { ok: true, reason: '', count };
  }

  /** Fixe le niveau de force autorisé (autorité ou commandant) et l'annonce à la radio. */
  authorize(level: ForceLevel): boolean {
    if (!this.scope().canAuthorize) return false;
    const ctx = this.ctx;
    const previous = ctx.law.roe.authorizedForce;
    if (previous === level) return true;
    ctx.law.authorize(level, ctx.player.state.personId);
    const from = this.callsign();
    const text = level > previous
      ? `À TOUS ICI ${from.toUpperCase()}. Emploi de la force autorisé jusqu’au niveau ${level}. FAITES L’APERÇU.`
      : `À TOUS ICI ${from.toUpperCase()}. Niveau de force ramené à ${level}. TERMINÉ.`;
    ctx.radio.say({ channel: 'commandement', from, priority: 2, personId: ctx.player.state.personId, text });
    return true;
  }
}
