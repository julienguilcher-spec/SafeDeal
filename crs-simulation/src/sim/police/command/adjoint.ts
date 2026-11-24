/* =====================================================================================
 * COMMANDEMENT — l'adjoint du joueur-commandant.
 *
 * Quand le joueur commande, l'IA ne décide pas à sa place : chaque décision que prendrait le
 * commandant IA devient une PROPOSITION (« Chef, groupe hostile en formation rue du Marché, je
 * propose un bond offensif »). L'adjoint les dit à la radio l'une après l'autre, la plus urgente
 * d'abord, à une cadence réglable (tuning.adjointInterval, 0 : muet). Le joueur peut en accepter
 * une (CommandApi.accept) : l'ordre part alors en son nom. Une proposition expire au bout de 90 s.
 * ===================================================================================== */

import type { EntityId } from '@/core/contracts';
import { COMMAND_PROPOSAL_EVENT } from './api';
import type { Proposal } from './api';
import type { Command } from './command';
import type { CommandCore } from './core';

const MAX_PROPOSALS = 8;
const LIFETIME = 90;

interface Entry {
  proposal: Proposal;
  exec: (() => void) | null;
  cmd: Command;
}

export class Adjoint {
  /** Propositions en cours (objets publics). */
  readonly proposals: Proposal[] = [];
  private readonly entries: Entry[] = [];
  private nextId = 1;
  private lastSaidAt = -100;

  constructor(private readonly core: CommandCore) {}

  reset(): void {
    this.proposals.length = 0;
    this.entries.length = 0;
    this.nextId = 1;
    this.lastSaidAt = -100;
  }

  /** Personne qui parle au nom de l'adjoint : l'adjoint au commandant, sinon un autre membre du commandement. */
  speakerOf(cmd: Command): EntityId {
    const ctx = this.core.ctx;
    const members = cmd.squad.members;
    let other: EntityId = 0;
    for (let i = 0; i < members.length; i++) {
      const p = ctx.people.get(members[i]);
      if (!p || p.isPlayer || p.id === cmd.squad.leaderId) continue;
      if (p.poste === 'chef_section') return p.id;
      if (other === 0 && p.poste !== 'conducteur') other = p.id;
    }
    return other;
  }

  /** Nouvelle proposition (ignorée si la même, par sa clé, est déjà en attente). */
  offer(cmd: Command, key: string, priority: number, x: number, z: number, text: string, exec: (() => void) | null): void {
    const core = this.core;
    for (let i = 0; i < this.entries.length; i++) {
      const p = this.entries[i].proposal;
      if (p.key === key && this.entries[i].cmd === cmd) return;
    }
    if (this.entries.length >= MAX_PROPOSALS) {
      // la moins urgente déjà dite cède sa place
      let drop = -1;
      for (let i = 0; i < this.entries.length; i++) {
        const p = this.entries[i].proposal;
        if (p.priority <= priority && (drop < 0 || p.priority < this.entries[drop].proposal.priority || (p.priority === this.entries[drop].proposal.priority && p.t < this.entries[drop].proposal.t))) drop = i;
      }
      if (drop < 0) return;
      this.remove(drop);
    }
    const proposal: Proposal = { id: this.nextId++, key, text, x, z, t: core.now, saidAt: -1, priority, executable: exec !== null };
    this.entries.push({ proposal, exec, cmd });
    this.proposals.push(proposal);
  }

  private remove(index: number): void {
    this.entries.splice(index, 1);
    this.proposals.splice(index, 1);
  }

  private find(id: number): number {
    for (let i = 0; i < this.entries.length; i++) if (this.entries[i].proposal.id === id) return i;
    return -1;
  }

  accept(id: number): boolean {
    const i = this.find(id);
    if (i < 0) return false;
    const e = this.entries[i];
    this.remove(i);
    if (!e.exec) return false;
    // acceptée par le joueur : ce sont ses ordres (byPlayer), qu'aucun ordre interne ne remplace ensuite
    const core = this.core;
    core.asPlayer = true;
    try {
      e.exec();
    } finally {
      core.asPlayer = false;
    }
    return true;
  }

  dismiss(id: number): void {
    const i = this.find(id);
    if (i >= 0) this.remove(i);
  }

  /** Retire les propositions d'une compagnie dont l'IA rend ou reprend le commandement. */
  clear(cmd: Command): void {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i].cmd === cmd) this.remove(i);
  }

  update(): void {
    const core = this.core;
    const now = core.now;
    if (this.entries.length === 0) return;
    for (let i = this.entries.length - 1; i >= 0; i--) if (now - this.entries[i].proposal.t > LIFETIME) this.remove(i);
    const interval = core.tuning.adjointInterval;
    if (interval <= 0 || now - this.lastSaidAt < interval) return;
    // la plus urgente des propositions pas encore dites, la plus ancienne à urgence égale
    let best = -1;
    for (let i = 0; i < this.entries.length; i++) {
      const p = this.entries[i].proposal;
      if (p.saidAt >= 0) continue;
      if (best < 0 || p.priority > this.entries[best].proposal.priority) best = i;
    }
    if (best < 0) return;
    const e = this.entries[best];
    e.proposal.saidAt = now;
    this.lastSaidAt = now;
    core.say(e.cmd.squad.name + ' ADJOINT', e.proposal.text, e.proposal.priority >= 3 ? 2 : 1, 'commandement', this.speakerOf(e.cmd));
    core.ctx.events.emitAny(COMMAND_PROPOSAL_EVENT, e.proposal);
  }
}
