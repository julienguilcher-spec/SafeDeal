/* =====================================================================================
 * MISE EN PLACE — FORCES DES MANIFESTATIONS SIMULTANÉES (système 'session.manifestations').
 *
 * Quand plusieurs manifestations déclarées se tiennent en même temps (module de foule, service 'crowd.manifs'), une
 * COMPAGNIE supplémentaire est engagée sur chacune des manifestations supplémentaires : construite par le service
 * 'police.units' (comme celle du joueur), placée à l'écart du rassemblement et de son parcours, et confiée à un
 * commandant IA (service 'police.command' : assume + assignCortege) qui conçoit son propre dispositif autour de CE
 * cortège. Toutes les compagnies figurent sur la carte tactique ; le commandant joueur (« tout le dispositif ») peut
 * leur donner des ordres.
 *
 * Fait sur l'événement 'session:setup' (la compagnie du joueur est en place), sans toucher à setup.ts.
 * Clés de SessionConfig.extra : 'manifestations.compagnies' false → aucune compagnie supplémentaire ;
 * 'manifestations.sections' (1 à 4) → sections par compagnie (défaut : selon l'effectif annoncé).
 * ===================================================================================== */

import type { GameContext, GameSystem, Unsubscribe } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { SESSION_SETUP_EVENT } from './api';
import type { PoliceUnitHandleLike, SessionSetupSummary } from './api';
import { chooseStand, chooseStandOffCrowd } from './placement';

export const SESSION_MANIFS_SYSTEM_ID = 'session.manifestations';

/** Forme consommée du service 'crowd.manifs' (sans dépendre du module de foule). */
interface ManifLike {
  readonly id: number;
  label: string;
  causeLabel: string;
  from: string;
  phase: 'rassemblement' | 'depart' | 'cortege' | 'dispersion' | 'terminee';
  declared: number;
  planned: number;
  people: number;
  x: number;
  z: number;
  route: readonly number[];
  headS: number;
  tailS: number;
  tension: number;
  companyId: number;
}
interface ManifsLike {
  readonly list: readonly ManifLike[];
  assign(manifId: number, companyId: number): void;
}
interface UnitsLike {
  createCompany?(options: {
    x: number; z: number; heading: number; sections?: number; layout?: 'colonne' | 'ligne' | 'embarque'; vehicles?: boolean; drivers?: boolean;
  }): PoliceUnitHandleLike;
}
interface CommandLike {
  assume(id: number, options?: { base?: { x: number; z: number } }): boolean;
  assignCortege?(id: number, source: ManifLike | null): boolean;
}

/** Sections d'une compagnie engagée sur une manifestation d'effectif annoncé `declared` (1 à 4). */
export function sectionsFor(declared: number): number {
  return Math.max(1, Math.min(4, Math.ceil(declared / 600)));
}

const isProtester = (p: { faction: string }): boolean => p.faction === 'protest';

export class ManifestationsForcesSystem implements GameSystem {
  readonly id = SESSION_MANIFS_SYSTEM_ID;
  readonly order = SystemOrder.RULES - 99;
  private ctx!: GameContext;
  private readonly offs: Unsubscribe[] = [];
  /** Compagnies engagées sur les manifestations supplémentaires (identifiant de manifestation → compagnie). */
  readonly companies = new Map<number, number>();
  /** Résumé de la mise en place reçu, en attente des manifestations (mises en place sur le même événement). */
  private pending: SessionSetupSummary | null = null;
  private pendingUntil = 0;

  provide(ctx: GameContext): void {
    this.ctx = ctx;
  }

  init(ctx: GameContext): void {
    this.offs.push(ctx.events.onAny(SESSION_SETUP_EVENT, (payload) => {
      this.pending = payload as SessionSetupSummary;
      this.pendingUntil = ctx.clock.now + 5;
      this.onSetup(this.pending);
    }));
  }

  reset(): void {
    this.companies.clear();
    this.pending = null;
  }

  /** Les manifestations peuvent être mises en place après la compagnie du joueur (ordre des abonnements) : on réessaie. */
  update(): void {
    const s = this.pending;
    if (!s) return;
    if (this.ctx.clock.now > this.pendingUntil) {
      this.pending = null;
      return;
    }
    this.onSetup(s);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  private onSetup(summary: SessionSetupSummary): void {
    const ctx = this.ctx;
    const manifs = ctx.service<ManifsLike>('crowd.manifs');
    if (!manifs || manifs.list.length === 0) return;
    this.pending = null;
    const extra = ctx.session.config?.extra ?? {};
    if (extra['manifestations.compagnies'] === false) return;
    const units = ctx.service<UnitsLike>('police.units');
    if (!units || typeof units.createCompany !== 'function' || !summary.usedPoliceUnits) return;
    const command = ctx.service<CommandLike>('police.command');
    const wanted = Number(extra['manifestations.sections']);
    const rng = ctx.rng.fork('session.manifestations');
    for (const m of manifs.list) {
      if (m.phase === 'terminee' || this.companies.has(m.id)) continue;
      try {
        ctx.people.rebuildIndex();
        const stand = chooseStandOffCrowd(ctx, m.x, m.z, m.route, isProtester) ?? chooseStand(ctx, m.x, m.z, () => rng.next());
        const sections = Number.isFinite(wanted) && wanted > 0 ? Math.max(1, Math.min(4, Math.round(wanted))) : sectionsFor(m.declared);
        const company = units.createCompany({ x: stand.x, z: stand.z, heading: stand.heading, sections, layout: 'ligne', vehicles: true, drivers: true });
        const id = company.squad.id;
        this.companies.set(m.id, id);
        manifs.assign(m.id, id);
        if (command) {
          command.assume(id, { base: { x: stand.x, z: stand.z } });
          if (typeof command.assignCortege === 'function') command.assignCortege(id, m);
        }
        const name = company.squad.name ?? 'Compagnie';
        ctx.radio.say({
          channel: 'commandement', from: 'CENTRAL', priority: 1,
          text: `CENTRAL : ${name} est engagée sur la manifestation « ${m.causeLabel.toLowerCase()} », ${m.from.charAt(0).toLowerCase() + m.from.slice(1)}. ${sections} section${sections > 1 ? 's' : ''}.`,
        });
      } catch (err) {
        console.error('[session] compagnie pour la manifestation ' + m.id + ' impossible', err);
      }
    }
    ctx.people.rebuildIndex();
  }
}
