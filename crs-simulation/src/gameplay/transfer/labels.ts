/* =====================================================================================
 * TRANSFERT — étiquettes des fourgons cellulaires dans le monde et sur les cartes (plan ordres-directs §5.2, §5.1).
 *
 * Au-dessus de chaque fourgon cellulaire suivi par le transfert (service 'transfer'), un repère du HUD (service
 * 'hud.marks', genre « cellulaire ») dit ce qu'il est et sa charge, interpellés seuls (l'équipage n'est pas compté) :
 *   la première fois qu'il est montré   « Fourgon cellulaire 1 — pour les interpellés » (15 s à l'écran) ;
 *   ensuite                             « CELLULAIRE 1 · 3/8 » ;
 *   plein                               « CELLULAIRE 1 · COMPLET — part au commissariat » ;
 *   en route, au commissariat, retour   « CELLULAIRE 1 · vers le commissariat du 3e », « … · au commissariat »,
 *                                       « … · arrive — 40 s ».
 * Montré à 150 m du joueur au plus, ou partout tant qu'il tient un interpellé ou qu'une de ses interpellations est en
 * cours (il doit voir où l'emmener). Les interpellés qui attendent avec leur binôme le fourgon appelé
 * (police.arrests.waiting) ont leur repère « Interpellé en attente du fourgon » (300 m). Pour les policiers seulement.
 *
 * Service 'transfer.labels' : labelOf(squadId) — la même étiquette, pour les cartes (src/ui/maps/units.ts).
 * ===================================================================================== */

import type { GameContext, GameSystem, Person, Unsubscribe } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { LAW_CUSTODY_SERVICE, LAW_RECORDS_SERVICE } from '@/gameplay/law/api';
import type { LawCustody, LawRecords } from '@/gameplay/law/api';
import { CUSTODY_TEXTS, durationText, vanLabelText } from '@/ui/command/direct/words';
import { TRANSFER_SERVICE } from './system';
import type { TransferApi, TransferVanView } from './system';

export const VAN_LABELS_SERVICE = 'transfer.labels';
export const VAN_LABELS_SYSTEM_ID = 'gameplay.transfer.labels';

/** Service des étiquettes de fourgons (lecture seule). */
export interface VanLabelsApi {
  /** Étiquette du fourgon de cet équipage (« CELLULAIRE 1 · 3/8 ») ; '' s'il n'est pas suivi. */
  labelOf(squadId: number): string;
}

/** Service des repères du HUD (src/ui/hud/markers.ts, HudMarksApi), vu par ce qu'on en utilise. */
interface MarksLike {
  set(id: string, mark: { x: number; z: number; personId?: number; label: string; kind?: string }): void;
  remove(id: string): void;
}
interface WaitingLike {
  waiting?(): readonly { personId: number; x: number; z: number }[];
}

const HUD_MARKS_SERVICE = 'hud.marks';
/** Rafraîchissement (s). */
const PERIOD = 0.25;
/** Étiquette d'un fourgon montrée à … m du joueur au plus (sauf interpellé en main). */
export const VAN_LABEL_NEAR = 150;
/** Repère d'un interpellé qui attend le fourgon : à … m au plus. */
const WAITING_NEAR = 300;
/** Durée (s d'affichage) de l'étiquette de présentation « — pour les interpellés ». */
export const VAN_INTRO_SECONDS = 15;
/** Places pour les interpellés d'un fourgon cellulaire, quand la vue ne les donne pas encore. */
const SEATS_DEFAULT = 8;

/** « vers le commissariat du 3e », « vers la préfecture de police ». */
function toward(station: string): string {
  if (station === '') return 'vers le commissariat';
  return /^(préfecture|caserne)/i.test(station) ? `vers la ${station}` : `vers le ${station}`;
}

/**
 * Étiquette d'un fourgon cellulaire d'après sa vue du transfert (fonction pure). `intro` : il est montré pour la
 * première fois de la session (ce qu'il est, plutôt que sa charge).
 */
export function vanLabel(view: Pick<TransferVanView, 'name' | 'stage' | 'detainees' | 'seats' | 'eta' | 'station'>, intro: boolean): string {
  const seats = view.seats > 0 ? view.seats : SEATS_DEFAULT;
  switch (view.stage) {
    case 'aller':
      return `${view.name} · ${toward(view.station)}`;
    case 'commissariat':
      return `${view.name} · au commissariat`;
    case 'retour':
    case 'releve':
      if (view.eta > 1) return `${view.name} · arrive — ${durationText(view.eta)}`;
      break;
    default:
      break;
  }
  const text = vanLabelText(view.name, view.detainees, seats, intro);
  // plein : le nom d'abord (plusieurs fourgons côte à côte)
  return view.detainees >= seats ? `${view.name} · ${text}` : text;
}

export class VanLabelsSystem implements GameSystem {
  readonly id = VAN_LABELS_SYSTEM_ID;
  readonly order = SystemOrder.CONTROL + 9;

  private ctx: GameContext | null = null;
  private readonly offs: Unsubscribe[] = [];
  private nextAt = 0;
  private lastAt = -1;
  /** Temps d'affichage cumulé de chaque fourgon (présentation), par équipage. */
  private readonly shownFor = new Map<number, number>();
  /** Étiquettes du moment, par équipage (cartes). */
  private readonly labels = new Map<number, string>();
  /** Repères posés au dernier passage (pour retirer ceux qui ne le sont plus). */
  private posted = new Set<string>();
  private readonly next = new Set<string>();

  provide(ctx: GameContext): void {
    this.ctx = ctx;
    const self = this;
    ctx.provide<VanLabelsApi>(VAN_LABELS_SERVICE, {
      labelOf: (squadId) => self.labels.get(squadId) ?? '',
    });
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.offs.push(ctx.events.on('session:started', () => this.reset()));
    this.offs.push(ctx.events.on('session:ended', () => this.reset()));
  }

  reset(): void {
    const marks = this.marks();
    if (marks) for (const id of this.posted) marks.remove(id);
    this.posted.clear();
    this.shownFor.clear();
    this.labels.clear();
    this.nextAt = 0;
    this.lastAt = -1;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  private marks(): MarksLike | undefined {
    const m = this.ctx?.service<MarksLike>(HUD_MARKS_SERVICE);
    return m && typeof m.set === 'function' && typeof m.remove === 'function' ? m : undefined;
  }

  update(_dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !ctx.session.config) return;
    const now = ctx.clock.now;
    if (now < this.nextAt) return;
    // temps écoulé depuis le dernier passage (présentation comptée en secondes d'affichage)
    const step = this.lastAt >= 0 ? Math.min(1, now - this.lastAt) : PERIOD;
    this.lastAt = now;
    this.nextAt = now + PERIOD;
    const transfer = ctx.service<TransferApi>(TRANSFER_SERVICE);
    const vans = transfer ? transfer.vans : [];
    const me = ctx.player.person();
    const police = !!me && me.faction === 'police';
    const everywhere = police && this.holding(me!);
    const marks = police ? this.marks() : undefined;
    const next = this.next;
    next.clear();
    const fx = me ? this.playerX(me) : 0;
    const fz = me ? this.playerZ(me) : 0;
    for (let i = 0; i < vans.length; i++) {
      const view = vans[i]!;
      const v = ctx.vehicles.get(view.vehicleId);
      if (!v) continue;
      const shown = police && (everywhere || Math.hypot(v.x - fx, v.z - fz) <= VAN_LABEL_NEAR);
      const seen = this.shownFor.get(view.squadId) ?? 0;
      const label = vanLabel(view, seen < VAN_INTRO_SECONDS);
      this.labels.set(view.squadId, label);
      if (!shown || !marks) continue;
      this.shownFor.set(view.squadId, seen + step);
      const id = `cellulaire:${view.squadId}`;
      marks.set(id, { x: v.x, z: v.z, label, kind: 'cellulaire' });
      next.add(id);
    }
    // équipages qui ne sont plus suivis : leur étiquette s'efface
    for (const id of this.labels.keys()) if (!vans.some((w) => w.squadId === id)) this.labels.delete(id);
    // interpellés qui attendent le fourgon appelé, avec leur binôme
    if (marks && me) {
      const arrests = ctx.service<WaitingLike>('police.arrests');
      const waiting = arrests && typeof arrests.waiting === 'function' ? arrests.waiting() : [];
      for (const w of waiting) {
        if (Math.hypot(w.x - fx, w.z - fz) > WAITING_NEAR) continue;
        const id = `attente:${w.personId}`;
        marks.set(id, { x: w.x, z: w.z, personId: w.personId, label: CUSTODY_TEXTS.waitingVan, kind: 'cellulaire' });
        next.add(id);
      }
    }
    const old = this.posted;
    const m = this.marks();
    if (m) for (const id of old) if (!next.has(id)) m.remove(id);
    old.clear();
    for (const id of next) old.add(id);
  }

  /** Le joueur tient un interpellé, ou l'une de ses interpellations est en cours : il voit tous les fourgons. */
  private holding(me: Person): boolean {
    const ctx = this.ctx!;
    const custody = ctx.service<LawCustody>(LAW_CUSTODY_SERVICE);
    if (custody && typeof custody.detaineeOf === 'function' && custody.detaineeOf(me.id)) return true;
    const records = ctx.service<LawRecords>(LAW_RECORDS_SERVICE);
    const list = records ? records.interpellations : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i]!;
      if (r.byId === me.id && r.status === 'en_cours') return true;
    }
    return false;
  }

  /** Position du joueur, ou de son véhicule s'il est à bord. */
  private playerX(me: Person): number {
    const v = me.vehicleId !== 0 ? this.ctx!.vehicles.get(me.vehicleId) : undefined;
    return v ? v.x : me.x;
  }

  private playerZ(me: Person): number {
    const v = me.vehicleId !== 0 ? this.ctx!.vehicles.get(me.vehicleId) : undefined;
    return v ? v.z : me.z;
  }
}
