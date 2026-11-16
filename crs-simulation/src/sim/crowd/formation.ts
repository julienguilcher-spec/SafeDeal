/* =====================================================================================
 * FOULE — le cortège organisé.
 *
 * Ordre, de l'avant vers l'arrière (docs/research/03-dynamique-manifestation.md §1.2) :
 *   cortège de tête (précortège, nébuleuse lâche) → tampon → carré de tête (service d'ordre devant,
 *   porteurs de la banderole côte à côte, responsables) → blocs par famille ou organisation, service
 *   d'ordre sur les flancs, camion sono en tête du plus gros bloc → queue de cortège (familles).
 *
 * Marche par EMPLACEMENTS : chaque personne a une place (bloc de la chaîne, distance derrière le front de
 * son bloc, position latérale −1..1 dans la largeur utilisable de la rue). La chaîne de blocs avance le
 * long du parcours : le premier suit la consigne de la tête, chacun des suivants règle sa vitesse sur
 * l'écart avec celui qui le précède, avec un temps de réaction — d'où l'effet d'accordéon quand la tête
 * s'arrête ou repart. Dans une rue plus étroite que la largeur de référence, le cortège s'allonge.
 * ===================================================================================== */

import type { EntityId, GameContext, Person, Prop, RayHit, Rng, Vec2, Vehicle } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import type { CortegeSection, FormationView, RoutePoint } from './api';
import { brainOf } from './brain';
import type { PlanEntry } from './population';
import type { Corridor } from './route';
import * as T from './tuning';

/** Résultat de l'évaluation d'un emplacement (objet réutilisé). */
export interface SlotSample {
  x: number;
  z: number;
  /** Tangente du parcours et vitesse du bloc : anticipation du déplacement. */
  tx: number;
  tz: number;
  v: number;
}

function isPolice(p: Person): boolean {
  return p.faction === 'police' && p.vehicleId === 0 && p.posture !== 'down';
}

export class Formation implements FormationView {
  // ── emplacements ──
  slotCount = 0;
  slotBlock = new Int16Array(0);
  slotBack = new Float32Array(0);
  slotLat = new Float32Array(0);
  /** Décalage personnel le long de l'axe et en travers (m). */
  slotJx = new Float32Array(0);
  slotJz = new Float32Array(0);
  /**
   * Décalage vers l'arrière quand le cortège s'étire (m par unité d'étirement au-delà de 1) : dans une rue
   * étroite, les voisins d'un même rang se décalent en quinconce au lieu de se serrer épaule contre épaule.
   */
  slotStag = new Float32Array(0);
  // ── chaîne de blocs ──
  blockCount = 0;
  S = new Float64Array(0);
  V = new Float32Array(0);
  /** Écart supplémentaire derrière ce bloc (tampon), en mètres nominaux. */
  extra = new Float32Array(0);
  hold = new Float64Array(0);
  stretch = new Float32Array(0);
  sections: CortegeSection[] = [];
  /** Bloc après lequel s'ouvre le tampon précortège / carré (−1 : pas de précortège). */
  bufferBlock = -1;
  bufferTarget = T.BUFFER_CALM;

  // ── conduite de la tête ──
  marching = false;
  cruise = T.MARCH_SPEED;
  speedFactor = 1;
  haltUntil = -1;
  haltReason = '';
  /** Limite d'abscisse imposée par un barrage (Infinity : aucune) et par la fin du parcours. */
  stopS = Infinity;
  endS = 0;
  arrived = false;
  private barrage = false;
  private nextScan = 0;

  // ── camion sono ──
  sonoVehicleId: EntityId = 0;
  sonoBlock = -1;
  sonoBack = 0;
  /** Entrée du plan qui guide le camion (−1). */
  guideEntry = -1;
  driverEntry = -1;

  corridor!: Corridor;
  private readonly rp: RoutePoint = { x: 0, z: 0, tx: 0, tz: 1, center: 0, half: 8, stretch: 1 };
  private readonly hit: RayHit = makeRayHit();
  private readonly vehicles: Vehicle[] = [];
  private readonly props: Prop[] = [];
  halfUse = 8;
  nextRowB = 0;
  tailLat = 0;
  queueSection = -1;
  /** Par tronçon : emplacements libres, de l'avant vers l'arrière, et prochain à attribuer. */
  pools: number[][] = [];
  poolNext: number[] = [];
  /** Places prises dans le passage de chaque flanc, par bloc (gauche, droite). */
  flankUsed = new Uint8Array(0);
  /** Tronçon de chaque entrée du plan (−1 : hors cortège). */
  entrySection: Int16Array = new Int16Array(0);

  get headS(): number {
    return this.blockCount > 0 ? this.S[0]! : 0;
  }

  get tailS(): number {
    return this.blockCount > 0 ? this.S[this.blockCount - 1]! - T.BLOCK_LEN * this.stretch[this.blockCount - 1]! : 0;
  }

  get headSpeed(): number {
    return this.blockCount > 0 ? this.V[0]! : 0;
  }

  get halted(): boolean {
    return this.haltReason !== '';
  }

  blockS(block: number): number {
    return block >= 0 && block < this.blockCount ? this.S[block]! : 0;
  }

  blockSpeed(block: number): number {
    return block >= 0 && block < this.blockCount ? this.V[block]! : 0;
  }

  blockOf(p: Person): number {
    const b = brainOf(p);
    return b && b.slot >= 0 && b.slot < this.slotCount ? this.slotBlock[b.slot]! : -1;
  }

  slotPosition(p: Person, out: Vec2): boolean {
    const b = brainOf(p);
    if (!b || b.slot < 0 || b.slot >= this.slotCount) return false;
    this.sample(b.slot, SAMPLE);
    out.x = SAMPLE.x;
    out.z = SAMPLE.z;
    return true;
  }

  halt(seconds: number, reason: string): void {
    if (!(seconds > 0)) return;
    this.pendingHalt = Math.max(this.pendingHalt, seconds);
    this.pendingReason = reason;
  }

  holdBlock(block: number, seconds: number): void {
    if (block < 0 || block >= this.blockCount || !(seconds > 0)) return;
    this.pendingHoldBlock = block;
    this.pendingHoldSeconds = seconds;
  }

  private pendingHalt = 0;
  private pendingReason = '';
  private pendingHoldBlock = -1;
  private pendingHoldSeconds = 0;

  reset(): void {
    this.slotCount = 0;
    this.blockCount = 0;
    this.sections = [];
    this.bufferBlock = -1;
    this.bufferTarget = T.BUFFER_CALM;
    this.marching = false;
    this.cruise = T.MARCH_SPEED;
    this.speedFactor = 1;
    this.haltUntil = -1;
    this.haltReason = '';
    this.stopS = Infinity;
    this.endS = 0;
    this.arrived = false;
    this.barrage = false;
    this.nextScan = 0;
    this.sonoVehicleId = 0;
    this.sonoBlock = -1;
    this.guideEntry = -1;
    this.driverEntry = -1;
    this.pendingHalt = 0;
    this.pendingHoldBlock = -1;
    this.queueSection = -1;
    this.pools = [];
    this.poolNext = [];
    this.entrySection = new Int16Array(0);
    this.tailLat = 0;
  }

  /** Pose la chaîne à l'arrêt, tête à l'abscisse donnée. */
  layoutFrom(head: number): void {
    this.S[0] = head;
    this.corridor.at(head, this.rp);
    this.stretch[0] = this.rp.stretch;
    for (let k = 1; k < this.blockCount; k++) {
      const gap = (T.BLOCK_LEN + this.extra[k - 1]!) * this.stretch[k - 1]!;
      this.S[k] = this.S[k - 1]! - gap;
      this.corridor.at(this.S[k]!, this.rp);
      this.stretch[k] = this.rp.stretch;
      this.V[k] = 0;
    }
    this.V[0] = 0;
  }

  /** Première place libre d'un tronçon (de l'avant vers l'arrière) ; en queue de cortège s'il est complet. */
  takeSlot(section: number, rng: Rng): number {
    const pool = this.pools[section];
    if (pool && this.poolNext[section]! < pool.length) return pool[this.poolNext[section]!++]!;
    return this.allocTail(rng);
  }

  /**
   * Place dans le passage du flanc, à hauteur de l'abscisse `s` : pour qui rejoint le cortège en marche
   * depuis le bord du parcours. Six personnes par flanc et par bloc ; −1 si le cortège n'est pas là.
   */
  allocFlank(s: number, side: number, rng: Rng): number {
    if (this.slotCount >= this.slotBlock.length || this.blockCount === 0) return -1;
    if (s > this.S[0]! || s < this.tailS) return -1;
    let k = 0;
    while (k + 1 < this.blockCount && this.S[k + 1]! >= s) k++;
    const col = side > 0 ? 1 : 0;
    for (let tries = 0; tries < 3 && k < this.blockCount; tries++, k++) {
      // jamais une place loin derrière soi (bloc plein, tampon entre deux tronçons) : mieux vaut attendre
      if (s - this.S[k]! > 9) return -1;
      const used = this.flankUsed[k * 2 + col]!;
      if (used >= 6) continue;
      this.flankUsed[k * 2 + col] = used + 1;
      const slot = this.slotCount++;
      this.slotBlock[slot] = k;
      this.slotBack[slot] = 0.3 + used * 0.8;
      this.slotLat[slot] = (side > 0 ? 1 : -1) * 0.94;
      this.slotJx[slot] = (rng.next() - 0.5) * 0.2;
      this.slotJz[slot] = (rng.next() - 0.5) * 0.2;
      this.slotStag[slot] = 0;
      return slot;
    }
    return -1;
  }

  /** Virage du parcours autour de l'abscisse s : positif s'il tourne à droite du sens de marche, nul en ligne droite. */
  turnAt(s: number): number {
    const rp = this.rp;
    this.corridor.at(s - 8, rp);
    const ax = rp.tx;
    const az = rp.tz;
    this.corridor.at(s + 8, rp);
    return (rp.tx - ax) * -az + (rp.tz - az) * ax;
  }

  /** Abscisse d'un emplacement le long du parcours (m). */
  slotS(slot: number): number {
    const b = this.slotBlock[slot]!;
    const st = this.stretch[b]!;
    return this.S[b]! - this.slotBack[slot]! * st - this.slotStag[slot]! * (st - 1);
  }

  /**
   * Point d'approche d'un emplacement : dans le passage du flanc (`side` = ±1), à l'abscisse `s`.
   * C'est par là qu'on contourne les rangs formés pour gagner l'arrière de son bloc.
   */
  flankPoint(s: number, side: number, out: Vec2): void {
    const rp = this.rp;
    this.corridor.at(s, rp);
    const lateral = rp.center + side * Math.max(0.3, rp.half - 0.35);
    out.x = rp.x - rp.tz * lateral;
    out.z = rp.z + rp.tx * lateral;
  }

  /** Section d'un emplacement. */
  sectionOf(slot: number): number {
    if (slot < 0 || slot >= this.slotCount) return -1;
    const b = this.slotBlock[slot]!;
    let best = -1;
    for (let i = 0; i < this.sections.length; i++) {
      const s = this.sections[i]!;
      if (b >= s.firstBlock && b <= s.lastBlock) best = i;
    }
    return best;
  }

  /** Nouvel emplacement en queue de cortège (renfort, personne adoptée). −1 si la formation est pleine. */
  allocTail(rng: Rng): number {
    if (this.slotCount >= this.slotBlock.length || this.blockCount === 0) return -1;
    const W = this.corridor.refWidth;
    const d = 1 / Math.sqrt(T.DENSITY_QUEUE);
    const perRow = Math.max(1, Math.floor((W * 0.9) / d));
    if (this.tailLat >= perRow) {
      this.tailLat = 0;
      this.nextRowB += d;
    }
    const b = Math.floor(this.nextRowB / T.BLOCK_LEN);
    while (b >= this.blockCount) {
      if (this.blockCount >= this.S.length) return -1;
      const k = this.blockCount++;
      this.S[k] = this.S[k - 1]! - (T.BLOCK_LEN + this.extra[k - 1]!) * this.stretch[k - 1]!;
      this.V[k] = this.V[k - 1]!;
      this.stretch[k] = this.stretch[k - 1]!;
      this.hold[k] = -1;
      if (this.queueSection >= 0) this.sections[this.queueSection]!.lastBlock = k;
    }
    const s = this.slotCount++;
    this.slotBlock[s] = b;
    this.slotBack[s] = this.nextRowB - b * T.BLOCK_LEN;
    this.slotLat[s] = (-1 + (2 * (this.tailLat + 0.5)) / perRow) * 0.9;
    this.slotJx[s] = (rng.next() - 0.5) * 0.4;
    this.slotJz[s] = (rng.next() - 0.5) * 0.4;
    this.slotStag[s] = ((this.tailLat * 0.618) % 1) * d;
    this.tailLat++;
    if (this.queueSection >= 0) this.sections[this.queueSection]!.size++;
    return s;
  }

  // ───────────────────────────── évaluation ─────────────────────────────

  /** Position courante d'un emplacement. */
  sample(slot: number, out: SlotSample): void {
    const b = this.slotBlock[slot]!;
    const st = this.stretch[b]!;
    const s = this.S[b]! - this.slotBack[slot]! * st - this.slotStag[slot]! * (st - 1);
    const rp = this.rp;
    this.corridor.at(s, rp);
    const half = rp.half < this.halfUse ? rp.half : this.halfUse;
    const lateral = rp.center + this.slotLat[slot]! * half + this.slotJz[slot]! * (half > 2 ? 1 : 0.3);
    const along = this.slotJx[slot]!;
    out.x = rp.x - rp.tz * lateral + rp.tx * along;
    out.z = rp.z + rp.tx * lateral + rp.tz * along;
    out.tx = rp.tx;
    out.tz = rp.tz;
    out.v = this.V[b]!;
  }

  /** Position de référence du camion sono (centre) et cap. */
  sonoPose(out: SlotSample): boolean {
    if (this.sonoBlock < 0) return false;
    const s = this.S[this.sonoBlock]! - this.sonoBack * this.stretch[this.sonoBlock]!;
    this.corridor.at(s, this.rp);
    out.x = this.rp.x - this.rp.tz * this.rp.center * 0.5;
    out.z = this.rp.z + this.rp.tx * this.rp.center * 0.5;
    out.tx = this.rp.tx;
    out.tz = this.rp.tz;
    out.v = this.V[this.sonoBlock]!;
    return true;
  }

  // ───────────────────────────── dynamique ─────────────────────────────

  update(ctx: GameContext, dt: number, now: number, timeScale: number): void {
    const n = this.blockCount;
    if (n === 0) return;
    if (this.pendingHalt > 0) {
      this.haltUntil = Math.max(this.haltUntil, now + this.pendingHalt);
      this.haltReason = this.pendingReason;
      this.pendingHalt = 0;
    }
    if (this.pendingHoldBlock >= 0) {
      this.hold[this.pendingHoldBlock] = now + this.pendingHoldSeconds;
      this.pendingHoldBlock = -1;
    }
    if (this.marching && now >= this.nextScan) {
      this.nextScan = now + 0.5;
      this.scanAhead(ctx);
    }
    // tampon précortège / carré : s'ouvre quand le service d'ordre isole son cortège
    if (this.bufferBlock >= 0) {
      const e = this.extra[this.bufferBlock]!;
      const d = this.bufferTarget - e;
      this.extra[this.bufferBlock] = e + Math.max(-0.5 * dt, Math.min(0.5 * dt, d));
    }
    const S = this.S;
    const V = this.V;
    // ── tête ──
    let target = this.marching ? this.cruise * this.speedFactor : 0;
    let reason = '';
    if (this.marching) {
      if (now < this.haltUntil) {
        target = 0;
        reason = this.haltReason || 'pause';
      } else if (this.haltReason !== '' && !this.barrage) this.haltReason = '';
      const room = Math.min(this.stopS, this.endS) - S[0]!;
      if (room < 6) {
        const lim = room > 0 ? room * 0.35 : 0;
        if (lim < target) target = lim;
        if (room < 0.6) reason = this.endS <= this.stopS ? 'arrivee' : 'barrage';
      }
      this.arrived = this.endS - S[0]! < 0.8;
    }
    if (reason !== '') this.haltReason = reason;
    else if (this.haltReason === 'arrivee' || this.haltReason === 'barrage') this.haltReason = '';
    V[0] = V[0]! + (target - V[0]!) * Math.min(1, dt / 1.1);
    if (V[0]! < 0.01 && target === 0) V[0] = 0;
    S[0] = Math.min(this.endS, S[0]! + V[0]! * dt);
    this.corridor.at(S[0]!, this.rp);
    this.stretch[0] = this.rp.stretch;
    // ── chaîne : chaque bloc règle sa vitesse sur l'écart avec celui qui le précède ──
    const cruise = this.cruise;
    const k1 = dt / (T.BLOCK_TAU * (timeScale < 1 ? 1 : 1));
    for (let k = 1; k < n; k++) {
      const G = (T.BLOCK_LEN + this.extra[k - 1]!) * this.stretch[k - 1]!;
      const gap = S[k - 1]! - S[k]!;
      const r = gap / G;
      let want: number;
      if (!this.marching || now < this.hold[k]!) want = 0;
      else if (r <= T.BLOCK_JAM) want = 0;
      else if (r <= 1) want = (cruise * (r - T.BLOCK_JAM)) / (1 - T.BLOCK_JAM);
      else want = cruise * (1 + Math.min(T.CATCHUP_GAIN, (r - 1) * 1.2));
      let v = V[k]! + (want - V[k]!) * (k1 < 1 ? k1 : 1);
      if (v < 0.01 && want === 0) v = 0;
      let s = S[k]! + v * dt;
      const maxS = S[k - 1]! - G * T.BLOCK_JAM * 0.92;
      if (s > maxS) {
        s = maxS > S[k]! ? maxS : S[k]!;
        v = 0;
      }
      V[k] = v;
      S[k] = s;
      this.corridor.at(s, this.rp);
      this.stretch[k] = this.rp.stretch;
    }
  }

  /** Cherche un barrage devant la tête : ligne d'agents, véhicules de police à l'arrêt, mobilier en travers. */
  private scanAhead(ctx: GameContext): void {
    const rp = this.rp;
    const s0 = this.S[0]!;
    let stop = Infinity;
    for (let d = 5; d <= T.BARRAGE_SCAN; d += 5) {
      this.corridor.at(s0 + d, rp);
      const cx = rp.x - rp.tz * rp.center;
      const cz = rp.z + rp.tx * rp.center;
      const r = Math.max(4, Math.min(rp.half, 9));
      if (ctx.people.countIn(cx, cz, r, isPolice) >= 3) {
        stop = s0 + d - T.BARRAGE_STOP;
        break;
      }
      const nv = ctx.vehicles.queryRadius(cx, cz, r, this.vehicles);
      let blocked = false;
      for (let i = 0; i < nv; i++) {
        const v = this.vehicles[i]!;
        if (v.id !== this.sonoVehicleId && !v.def.flying && Math.abs(v.speed) < 0.8 && (v.faction === 'police' || v.state === 'wrecked' || v.state === 'burnt' || v.state === 'burning')) blocked = true;
      }
      if (blocked) {
        stop = s0 + d - 8;
        break;
      }
    }
    if (stop === Infinity) {
      // mobilier ou barricade en travers de l'axe
      this.corridor.at(s0 + 1.5, rp);
      const ax = rp.x - rp.tz * rp.center;
      const az = rp.z + rp.tx * rp.center;
      this.corridor.at(s0 + 13.5, rp);
      const bx = rp.x - rp.tz * rp.center;
      const bz = rp.z + rp.tx * rp.center;
      if (ctx.props.raycast(ax, az, bx, bz, this.hit, 'move') && this.hit.hit) {
        const np = ctx.props.queryRadius(this.hit.x, this.hit.z, 5, this.props);
        let wide = 0;
        for (let i = 0; i < np; i++) if (this.props[i]!.blocksMove) wide++;
        // un objet isolé se contourne ; trois objets qui se touchent font un barrage
        if (wide >= 3) stop = s0 + 1.5 + this.hit.t * 12 - 3;
      }
    }
    this.barrage = stop !== Infinity;
    this.stopS = stop;
  }

  /** Un barrage arrête la tête en ce moment. */
  get blockedByBarrage(): boolean {
    return this.barrage && this.stopS - this.S[0]! < 1.5;
  }
}

const SAMPLE: SlotSample = { x: 0, z: 0, tx: 0, tz: 1, v: 0 };

/** Entrée du plan qui porte la banderole ? (aide pour les autres fichiers) */
export function isBannerEntry(e: PlanEntry): boolean {
  return e.banner;
}
