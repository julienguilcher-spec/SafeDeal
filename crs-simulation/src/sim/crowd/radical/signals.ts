/* =====================================================================================
 * GROUPES RADICAUX — signes avant-coureurs observables (service 'crowd.signals').
 *
 * Un signe est ouvert par ce qui se passe réellement (un groupe se rassemble en tête, des membres
 * relèvent leur capuche, se changent, ouvrent des parapluies, dépavent, tirent des poubelles sur la
 * chaussée) et dure tant que cela dure, plus quelques secondes. Chaque signe porte son type, son lieu
 * (tenu à jour), son heure et le groupe d'affinité concerné : c'est ce qu'un joueur attentif — à pied
 * ou au drone — peut repérer avant le passage à l'acte.
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import { SIGNAL_EVENT } from './api';
import type { CrowdSignal, SignalEvent, SignalType, SignalsApi } from './api';
import type { RadGroup } from './model';
import * as R from './tuning';

export const SIGNAL_TYPES: readonly SignalType[] = [
  'regroupement', 'visages_couverts', 'signal_ralliement', 'changement_tenue', 'parapluies', 'depavage', 'collecte',
  'mobilier_deplace',
];

/** Index d'un type dans RadGroup.signs. */
export const SIGN = {
  GATHER: 0, MASKS: 1, RALLY: 2, CHANGE: 3, UMBRELLAS: 4, UNPAVE: 5, COLLECT: 6, FURNITURE: 7,
} as const;

const LABELS: readonly string[] = [
  'Un groupe se rassemble en tête de cortège',
  'Des personnes se couvrent le visage',
  'Signal de ralliement',
  'Des personnes se changent en noir',
  'Parapluies et banderole déployés',
  'Des personnes dépavent la chaussée',
  'Des personnes ramassent des projectiles',
  'Du mobilier est tiré sur la chaussée',
];

export class Signals implements SignalsApi {
  readonly list: CrowdSignal[] = [];
  activeCount = 0;
  private ctx: GameContext | null = null;
  private nextId = 1;
  private readonly event: SignalEvent = { signal: null as unknown as CrowdSignal, stage: 'debut' };
  /** Dernière fois que le signe a été confirmé (même index que list). */
  private readonly seen: number[] = [];
  firstAt = -1;

  bind(ctx: GameContext): void {
    this.ctx = ctx;
  }

  reset(): void {
    this.list.length = 0;
    this.seen.length = 0;
    this.activeCount = 0;
    this.nextId = 1;
    this.firstAt = -1;
  }

  near(x: number, z: number, radius: number, out: CrowdSignal[]): number {
    let n = 0;
    const r2 = radius * radius;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      if (!s.active) continue;
      const dx = s.x - x;
      const dz = s.z - z;
      if (dx * dx + dz * dz > r2) continue;
      if (n < out.length) out[n] = s;
      else out.push(s);
      n++;
    }
    out.length = n;
    return n;
  }

  /**
   * Le groupe produit ce signe en ce moment : ouvre le signe s'il ne l'est pas, sinon met à jour son lieu,
   * son effectif et sa dernière confirmation.
   */
  mark(g: RadGroup, type: number, x: number, z: number, count: number, now: number): void {
    const id = g.signs[type]!;
    if (id !== 0) {
      const i = id - 1;
      const s = this.list[i];
      if (s && s.active) {
        s.x = x;
        s.z = z;
        if (count > s.count) s.count = count;
        this.seen[i] = now;
        return;
      }
    }
    const s: CrowdSignal = {
      id: this.nextId++, type: SIGNAL_TYPES[type]!, label: LABELS[type]!, x, z, t: now, until: Infinity, groupId: g.id,
      squadId: g.squadId, count, active: true,
    };
    this.list.push(s);
    this.seen.push(now);
    g.signs[type] = s.id;
    this.activeCount++;
    if (this.firstAt < 0) this.firstAt = now;
    this.emit(s, 'debut');
  }

  /** Le groupe ne produit plus ce signe (il reste publié quelques secondes). */
  release(g: RadGroup, type: number): void {
    g.signs[type] = 0;
  }

  /** Clôt les signes que plus rien ne confirme. */
  update(now: number): void {
    if (this.activeCount === 0) return;
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      if (!s.active) continue;
      if (now - this.seen[i]! <= R.SIGNAL_LINGER) continue;
      s.active = false;
      s.until = now;
      this.activeCount--;
      this.emit(s, 'fin');
    }
  }

  private emit(s: CrowdSignal, stage: 'debut' | 'fin'): void {
    if (!this.ctx) return;
    this.event.signal = s;
    this.event.stage = stage;
    this.ctx.events.emitAny(SIGNAL_EVENT, this.event);
  }
}
