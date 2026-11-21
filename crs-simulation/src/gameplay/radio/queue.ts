/* =====================================================================================
 * Radio — files d'attente par canal et anti-répétition (logique pure, temps fourni par l'appelant).
 *
 *   - un canal ne porte qu'un message à la fois : la durée estimée du texte (alternat) le rend occupé ;
 *   - les messages en attente sortent par priorité décroissante (urgent d'abord), puis par ancienneté ;
 *   - les messages d'ambiance attendent au plus quelques secondes, les autres plus longtemps, avant d'être abandonnés ;
 *   - un même message du même émetteur n'est pas redit avant un délai qui dépend de sa priorité ;
 *   - une file saturée écarte d'abord les messages les moins importants ;
 *   - le message du joueur (voir `fromPlayer`) passe en tête de la file de son canal et n'est jamais abandonné : c'est
 *     celui qu'il attend (un compte rendu n'est compté par l'objectif qu'une fois diffusé).
 * ===================================================================================== */

import type { RadioChannel, RadioMessage } from '@/core/contracts';
import { estimateDuration, normalizeKey } from './text';

export const CHANNELS: readonly RadioChannel[] = ['commandement', 'unite', 'secours', 'presse', 'public'];

export interface QueueConfig {
  /** Messages en attente au plus par canal. */
  maxPending: number;
  /** Silence laissé entre deux messages d'un même canal (s). */
  gap: number;
  /** Attente maximale avant abandon, par priorité 0 / 1 / 2 (s). */
  maxWait: readonly [number, number, number];
  /** Délai avant qu'un même message puisse être redit, par priorité 0 / 1 / 2 (s). */
  repeatWindow: readonly [number, number, number];
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxPending: 16,
  gap: 0.5,
  maxWait: [8, 90, 150],
  repeatWindow: [90, 20, 8],
};

/**
 * Un message opérationnel qui attend gagne un niveau de priorité par PROMOTE secondes, jusqu'à l'urgent : sur un réseau
 * saturé de messages urgents de la salle (chacun différent, l'anti-répétition n'y pouvait rien), le compte rendu de fin
 * d'ordre d'une unité (« Arrivé au point », priorité 1) passait toujours après eux, attendait plus que maxWait et était
 * abandonné — le commandant n'entendait jamais le résultat de son ordre. Il passe désormais au bout d'une demi-minute,
 * à son rang parmi les urgents (l'ambiance, qui n'attend que quelques secondes, n'en profite pas).
 */
const PROMOTE = 30;

function rank(p: { msg: RadioMessage; at: number }, now: number): number {
  const base = p.msg.priority;
  if (base === 0 || base >= 2) return base;
  const r = base + (now - p.at) / PROMOTE;
  return r > 2 ? 2 : r;
}

export type SubmitOutcome = 'played' | 'queued' | 'repeated' | 'dropped';

interface Pending {
  msg: RadioMessage;
  key: string;
  at: number;
  seq: number;
}

export interface QueueCounters {
  broadcast: number;
  repeated: number;
  dropped: number;
}

export class RadioQueue {
  readonly counters: QueueCounters = { broadcast: 0, repeated: 0, dropped: 0 };
  private readonly queues = new Map<RadioChannel, Pending[]>();
  private readonly busy = new Map<RadioChannel, number>();
  private readonly recent = new Map<string, number>();
  private seq = 0;
  /** Reconnaît un message dit par le joueur (null : aucun passe-droit). Renseigné par le module radio. */
  fromPlayer: ((msg: RadioMessage) => boolean) | null = null;

  /**
   * @param play  diffuse réellement le message (journal, événement, sous-titre) ; appelée au plus une fois par message.
   */
  constructor(
    private readonly play: (msg: RadioMessage, now: number, duration: number) => void,
    private readonly cfg: QueueConfig = DEFAULT_QUEUE_CONFIG,
  ) {
    for (const c of CHANNELS) {
      this.queues.set(c, []);
      this.busy.set(c, -Infinity);
    }
  }

  get pendingTotal(): number {
    let n = 0;
    for (const q of this.queues.values()) n += q.length;
    return n;
  }

  pending(channel: RadioChannel): number {
    return this.queues.get(channel)?.length ?? 0;
  }

  busyUntil(channel: RadioChannel): number {
    const t = this.busy.get(channel);
    return t === undefined || t === -Infinity ? 0 : t;
  }

  /** Propose un message : diffusé tout de suite si le canal est libre, mis en file sinon, écarté si répété. */
  submit(msg: RadioMessage, now: number): SubmitOutcome {
    if (msg.text.trim().length === 0) return 'dropped';
    const key = normalizeKey(msg.from, msg.text);
    const window = this.cfg.repeatWindow[msg.priority];
    const last = this.recent.get(key);
    if (last !== undefined && now >= last && now - last < window) {
      this.counters.repeated++;
      return 'repeated';
    }
    const q = this.queueOf(msg.channel);
    for (let i = 0; i < q.length; i++) {
      const p = q[i]!;
      if (p.key === key) {
        // déjà en attente : on garde la copie, avec la plus haute priorité
        if (msg.priority > p.msg.priority) p.msg = { ...p.msg, priority: msg.priority };
        this.counters.repeated++;
        return 'repeated';
      }
    }
    const free = now >= (this.busy.get(msg.channel) ?? -Infinity);
    if (q.length === 0 && free) {
      this.start(msg, key, now);
      return 'played';
    }
    if (q.length >= this.cfg.maxPending) {
      let victim = 0;
      for (let i = 1; i < q.length; i++) if (q[i]!.msg.priority < q[victim]!.msg.priority) victim = i;
      if (q[victim]!.msg.priority > msg.priority && !this.isPlayer(msg)) {
        this.counters.dropped++;
        return 'dropped';
      }
      q.splice(victim, 1);
      this.counters.dropped++;
    }
    q.push({ msg, key, at: now, seq: this.seq++ });
    return 'queued';
  }

  /** À appeler à chaque pas : libère les canaux dont le message est fini et abandonne les attentes trop longues. */
  update(now: number): void {
    for (const channel of CHANNELS) {
      const q = this.queues.get(channel)!;
      if (q.length === 0) continue;
      // abandon des messages qui ont trop attendu
      for (let i = q.length - 1; i >= 0; i--) {
        const p = q[i]!;
        if (now - p.at > this.cfg.maxWait[p.msg.priority] && !this.isPlayer(p.msg)) {
          q.splice(i, 1);
          this.counters.dropped++;
        }
      }
      if (q.length === 0 || now < (this.busy.get(channel) ?? -Infinity)) continue;
      let best = 0;
      let bestMine = this.isPlayer(q[0]!.msg);
      for (let i = 1; i < q.length; i++) {
        const a = q[i]!;
        const b = q[best]!;
        const mine = this.isPlayer(a.msg);
        const pa = rank(a, now);
        const pb = rank(b, now);
        // le joueur d'abord ; puis priorité décroissante (l'attente comptée, voir rank), puis ancienneté
        if (mine !== bestMine ? mine : pa > pb || (pa === pb && a.seq < b.seq)) {
          best = i;
          bestMine = mine;
        }
      }
      const [next] = q.splice(best, 1);
      this.start(next!.msg, next!.key, now);
    }
    if (this.recent.size > 512) this.trimRecent(now);
  }

  /** Vide les files d'attente (le journal n'est pas touché). */
  flush(): void {
    for (const q of this.queues.values()) q.length = 0;
  }

  /** Remise à zéro complète (début de session). */
  reset(): void {
    this.flush();
    for (const c of CHANNELS) this.busy.set(c, -Infinity);
    this.recent.clear();
    this.counters.broadcast = 0;
    this.counters.repeated = 0;
    this.counters.dropped = 0;
    this.seq = 0;
  }

  private isPlayer(msg: RadioMessage): boolean {
    if (!this.fromPlayer || msg.personId === undefined) return false;
    try {
      return this.fromPlayer(msg);
    } catch {
      return false;
    }
  }

  private queueOf(channel: RadioChannel): Pending[] {
    let q = this.queues.get(channel);
    if (!q) {
      q = [];
      this.queues.set(channel, q);
      this.busy.set(channel, -Infinity);
    }
    return q;
  }

  private start(msg: RadioMessage, key: string, now: number): void {
    const duration = estimateDuration(msg.text);
    this.busy.set(msg.channel, now + duration + this.cfg.gap);
    this.recent.set(key, now);
    this.counters.broadcast++;
    this.play(msg, now, duration);
  }

  private trimRecent(now: number): void {
    const longest = this.cfg.repeatWindow[0];
    for (const [k, t] of this.recent) if (now - t > longest || now < t) this.recent.delete(k);
  }
}

/**
 * Fait de la place dans un journal plein (au moins `max` messages) : l'ambiance de la moitié la plus ancienne part
 * d'abord ; s'il n'y en avait pas, le quart le plus ancien du journal. Les messages opérationnels récents restent.
 */
export function trimLog(log: (RadioMessage & { t: number })[], max: number): void {
  if (log.length < max) return;
  const half = log.length >> 1;
  let kept = 0;
  for (let i = 0; i < log.length; i++) {
    const m = log[i]!;
    if (i < half && m.priority === 0) continue;
    log[kept++] = m;
  }
  log.length = kept;
  if (log.length >= max) log.splice(0, max >> 2);
}
