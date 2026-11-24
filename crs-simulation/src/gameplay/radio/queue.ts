/* =====================================================================================
 * Radio — files d'attente par canal et anti-répétition (logique pure, temps fourni par l'appelant).
 *
 *   - un canal ne porte qu'un message à la fois : la durée estimée du texte (alternat) le rend occupé ;
 *   - les messages en attente sortent par priorité décroissante (urgent d'abord), puis par ancienneté ;
 *   - les messages d'ambiance attendent au plus quelques secondes, les autres plus longtemps, avant d'être abandonnés ;
 *   - un même message du même émetteur n'est pas redit avant un délai qui dépend de sa priorité ;
 *   - une file saturée écarte d'abord les messages les moins importants ;
 *   - le message du joueur (voir `fromPlayer`) passe en tête de la file de son canal et n'est jamais abandonné : c'est
 *     celui qu'il attend (un compte rendu n'est compté par l'objectif qu'une fois diffusé) ;
 *   - un message `silent` (la phrase d'ordre du joueur) est écrit tout de suite — journal, sous-titre — sans voix ni
 *     file d'attente : il n'occupe pas le canal ;
 *   - un message `reply` (l'accusé de réception d'un ordre du joueur, « REÇU » / « NÉGATIF ») passe juste après le
 *     joueur, devant tout ce qui attend, n'est jamais abandonné, et coupe un message de priorité 0 ou 1 en cours sur
 *     son canal (l'accusé d'un ordre précédent compris) : il ne vient jamais avant l'ordre (la phrase du joueur passe
 *     toujours la première) et s'entend moins d'une seconde après lui, même sur un réseau saturé. Le message coupé
 *     est redit une fois après l'accusé (le canal reste occupé le temps de le redire) ; coupé pendant sa redite, il
 *     n'est plus redit. Un urgent en cours (priorité 2) n'est jamais coupé : l'accusé passe juste après lui.
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

/** Message sur les ondes (le dernier commencé sur un canal, ou la redite d'un message coupé par un accusé). */
interface OnAir {
  msg: RadioMessage;
  /** Début de l'émission et durée estimée (s). */
  at: number;
  duration: number;
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
  private readonly onAir = new Map<RadioChannel, OnAir>();
  /** Redite prévue d'un message coupé par un accusé, après lui (une seule fois). */
  private readonly resay = new Map<RadioChannel, OnAir>();
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
    // écrit sans être dit : ni file, ni anti-répétition (le même ordre redonné s'écrit à nouveau), canal laissé libre
    if (msg.silent === true) {
      this.counters.broadcast++;
      this.play(msg, now, estimateDuration(msg.text));
      return 'played';
    }
    const reply = msg.reply === true;
    // l'accusé d'un ordre redonné se redit : c'est la réponse à cet ordre-là (seul un doublon en attente est écarté)
    const window = this.cfg.repeatWindow[msg.priority];
    const last = this.recent.get(key);
    if (!reply && last !== undefined && now >= last && now - last < window) {
      this.counters.repeated++;
      return 'repeated';
    }
    const q = this.queueOf(msg.channel);
    for (let i = 0; i < q.length; i++) {
      const p = q[i]!;
      if (p.key === key) {
        // déjà en attente : on garde la copie, avec la plus haute priorité (et le passe-droit de l'accusé)
        if (msg.priority > p.msg.priority || (reply && p.msg.reply !== true)) {
          p.msg = { ...p.msg, priority: msg.priority > p.msg.priority ? msg.priority : p.msg.priority, ...(reply ? { reply: true } : {}) };
        }
        this.counters.repeated++;
        return 'repeated';
      }
    }
    const free = now >= (this.busy.get(msg.channel) ?? -Infinity);
    if (reply && this.preempt(msg, key, now, q, free)) return 'played';
    if (q.length === 0 && free) {
      this.start(msg, key, now);
      return 'played';
    }
    if (q.length >= this.cfg.maxPending) {
      let victim = -1;
      for (let i = 0; i < q.length; i++) {
        if (this.isProtected(q[i]!.msg)) continue;
        if (victim < 0 || q[i]!.msg.priority < q[victim]!.msg.priority) victim = i;
      }
      if (victim < 0 || (q[victim]!.msg.priority > msg.priority && !this.isProtected(msg))) {
        this.counters.dropped++;
        return 'dropped';
      }
      q.splice(victim, 1);
      this.counters.dropped++;
    }
    q.push({ msg, key, at: now, seq: this.seq++ });
    return 'queued';
  }

  /**
   * Accusé de réception d'un ordre du joueur : il passe tout de suite si le canal est libre ou porte un message de
   * priorité 0 ou 1 qui n'est pas du joueur — y compris l'accusé d'un ordre précédent (deux ordres coup sur coup) : ce
   * message est coupé, puis redit une fois. Il attend derrière un message du joueur (l'ordre d'abord) ou un urgent, en
   * tête de file. true : diffusé.
   */
  private preempt(msg: RadioMessage, key: string, now: number, q: Pending[], free: boolean): boolean {
    // un message du joueur (ou un accusé plus ancien) attend son tour sur ce canal : l'accusé ne passe pas avant lui
    for (let i = 0; i < q.length; i++) if (this.isPlayer(q[i]!.msg) || q[i]!.msg.reply === true) return false;
    if (free) {
      this.start(msg, key, now);
      return true;
    }
    const ch = msg.channel;
    const again = this.resay.get(ch);
    // ce qui est sur les ondes : la redite d'un message coupé si elle a commencé, sinon le dernier message commencé
    const air = again && now >= again.at ? again : this.onAir.get(ch);
    if (!air || now >= air.at + air.duration) {
      // le message est fini, seul le silence entre deux messages reste : l'accusé passe (une redite à venir, après)
      if (again && now < again.at) this.resay.delete(ch);
      this.start(msg, key, now);
      return true;
    }
    if (air.msg.priority >= 2 || this.isPlayer(air.msg)) return false;
    // (la voix coupe le message en cours et le redit après l'accusé : audio/speech.ts, drapeau `reply`)
    this.start(msg, key, now);
    if (air === again) {
      // coupé une seconde fois pendant sa redite : il n'est plus redit (il est au journal et a été entendu)
      this.resay.delete(ch);
      return true;
    }
    // le message coupé est redit une fois, en entier, juste après l'accusé : le canal reste occupé d'autant
    const d = estimateDuration(air.msg.text);
    const at = this.busy.get(ch) ?? now;
    this.busy.set(ch, at + d + this.cfg.gap);
    this.resay.set(ch, { msg: air.msg, at, duration: d });
    return true;
  }

  /** À appeler à chaque pas : libère les canaux dont le message est fini et abandonne les attentes trop longues. */
  update(now: number): void {
    for (const channel of CHANNELS) {
      const q = this.queues.get(channel)!;
      if (q.length === 0) continue;
      // abandon des messages qui ont trop attendu
      for (let i = q.length - 1; i >= 0; i--) {
        const p = q[i]!;
        if (now - p.at > this.cfg.maxWait[p.msg.priority] && !this.isProtected(p.msg)) {
          q.splice(i, 1);
          this.counters.dropped++;
        }
      }
      const again = this.resay.get(channel);
      if (again && now >= again.at + again.duration) this.resay.delete(channel);
      else if (again && q.some((p) => p.msg.reply === true)) {
        // un accusé attend : la redite du message coupé (commencée ou non) lui cède la place dès la fin du message
        // en cours — l'accusé ne patiente pas derrière une redite
        const cur = this.onAir.get(channel);
        const end = cur ? cur.at + cur.duration + this.cfg.gap : now;
        if (now >= again.at || now >= end) {
          this.resay.delete(channel);
          this.busy.set(channel, now >= again.at ? now : end);
        }
      }
      if (q.length === 0 || now < (this.busy.get(channel) ?? -Infinity)) continue;
      let best = 0;
      let bestMine = this.lane(q[0]!.msg);
      for (let i = 1; i < q.length; i++) {
        const a = q[i]!;
        const b = q[best]!;
        const mine = this.lane(a.msg);
        const pa = rank(a, now);
        const pb = rank(b, now);
        // le joueur d'abord, puis les accusés de ses ordres (par ancienneté) ; puis priorité décroissante (l'attente
        // comptée, voir rank), puis ancienneté
        if (mine !== bestMine ? mine > bestMine : mine === 1 ? a.seq < b.seq : pa > pb || (pa === pb && a.seq < b.seq)) {
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
    this.onAir.clear();
    this.resay.clear();
    for (const c of CHANNELS) this.busy.set(c, -Infinity);
    this.recent.clear();
    this.counters.broadcast = 0;
    this.counters.repeated = 0;
    this.counters.dropped = 0;
    this.seq = 0;
  }

  /** File prioritaire : 2 = le joueur, 1 = accusé de réception d'un de ses ordres, 0 = le reste. */
  private lane(msg: RadioMessage): number {
    return this.isPlayer(msg) ? 2 : msg.reply === true ? 1 : 0;
  }

  /** Jamais abandonné (attente, file pleine) : le message du joueur et l'accusé de ses ordres. */
  private isProtected(msg: RadioMessage): boolean {
    return msg.reply === true || this.isPlayer(msg);
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
    this.onAir.set(msg.channel, { msg, at: now, duration });
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
