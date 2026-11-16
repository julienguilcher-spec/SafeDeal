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
import type { CortegeSection, CrowdCause, CrowdFamily, FormationView, RoutePoint, SectionKind } from './api';
import { brainOf } from './brain';
import type { Plan, PlanEntry } from './population';
import { sectionLabel } from './population';
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

const ORGANISED: readonly CrowdFamily[] = ['syndical', 'soignants', 'agriculteurs', 'etudiants', 'climat', 'retraites'];
const BLOC_ORDER: readonly CrowdFamily[] = ['etudiants', 'syndical', 'soignants', 'agriculteurs', 'climat', 'gilets_jaunes', 'divers', 'retraites'];

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

  private corridor!: Corridor;
  private readonly rp: RoutePoint = { x: 0, z: 0, tx: 0, tz: 1, center: 0, half: 8, stretch: 1 };
  private readonly hit: RayHit = makeRayHit();
  private readonly vehicles: Vehicle[] = [];
  private readonly props: Prop[] = [];
  private halfUse = 8;
  private nextRowB = 0;
  private tailLat = 0;
  private queueSection = -1;
  /** Par tronçon : emplacements libres, de l'avant vers l'arrière, et prochain à attribuer. */
  private pools: number[][] = [];
  private poolNext: number[] = [];
  /** Places prises dans le passage de chaque flanc, par bloc (gauche, droite). */
  private flankUsed = new Uint8Array(0);
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

  // ───────────────────────────── construction ─────────────────────────────

  /**
   * Dessine le cortège pour les personnes du plan. Les postes fixes (service d'ordre, porteurs de
   * banderole, guide du camion) reçoivent leur emplacement tout de suite : c'est le tableau retourné
   * (−1 pour les autres). Les marcheurs ordinaires reçoivent seulement un tronçon (entrySection) : ils
   * prendront à leur arrivée la première place libre de ce tronçon, de l'avant vers l'arrière — une
   * place est ainsi toujours accessible par l'arrière du bloc, sans traverser les rangs déjà formés.
   */
  build(plan: Plan, corridor: Corridor, cause: CrowdCause, wantSono: boolean, rng: Rng): Int32Array {
    this.reset();
    this.corridor = corridor;
    const entries = plan.entries;
    const n = entries.length;
    const slotOf = new Int32Array(n).fill(-1);
    const sectionOfEntry = new Int16Array(n).fill(-1);
    this.entrySection = sectionOfEntry;
    let current = -1;
    const W = corridor.refWidth;
    this.halfUse = W * 0.5 * 1.1;
    const cap = n * 3 + 160;
    this.slotBlock = new Int16Array(cap);
    this.slotBack = new Float32Array(cap);
    this.slotLat = new Float32Array(cap);
    this.slotJx = new Float32Array(cap);
    this.slotJz = new Float32Array(cap);
    this.slotStag = new Float32Array(cap);
    let column = 0;
    let pitch = 1;
    const B = new Float32Array(cap); // distance nominale derrière le front de tête

    // ── tri des personnes par tronçon ──
    let organised = false;
    let soCount = 0;
    for (const e of entries) {
      if (e.profile === 'service_ordre') soCount++;
      if (ORGANISED.indexOf(e.family) >= 0 && e.profile !== 'radical' && e.profile !== 'opportuniste') organised = true;
    }
    const pre: number[] = [];
    const banner: number[] = [];
    const leaders: number[] = [];
    const so: number[] = [];
    const queue: number[] = [];
    const byFamily = new Map<CrowdFamily, number[]>();
    for (let i = 0; i < n; i++) {
      const e = entries[i]!;
      if (e.profile === 'pilleur') continue;
      if (e.banner && e.family !== 'black_bloc') banner.push(i);
      else if (e.profile === 'service_ordre') so.push(i);
      else if (e.profile === 'meneur' && e.family !== 'black_bloc') leaders.push(i);
      else if (e.profile === 'radical' || e.profile === 'opportuniste' || e.family === 'black_bloc') pre.push(i);
      else if (organised && (e.family === 'gilets_jaunes' || e.family === 'divers') && e.profile !== 'famille') pre.push(i);
      else if (e.family === 'familles' || e.profile === 'famille') queue.push(i);
      else {
        let list = byFamily.get(e.family);
        if (!list) {
          list = [];
          byFamily.set(e.family, list);
        }
        list.push(i);
      }
    }
    // les groupes d'affinité restent côte à côte : tri stable par groupe à l'intérieur de chaque liste
    const byGroup = (a: number, b: number): number => {
      const ga = entries[a]!.group;
      const gb = entries[b]!.group;
      return ga === gb ? a - b : (ga < 0 ? a + 1e6 : ga * 1000) - (gb < 0 ? b + 1e6 : gb * 1000);
    };
    pre.sort(byGroup);
    queue.sort(byGroup);
    for (const list of byFamily.values()) list.sort(byGroup);

    let slot = 0;
    let back = 0;
    const jitter = (d: number): number => (rng.next() - 0.5) * d;
    const place = (entry: number, b: number, lat: number, spread: number): void => {
      const s = slot++;
      B[s] = b;
      this.slotLat[s] = lat;
      this.slotJx[s] = jitter(spread);
      this.slotJz[s] = jitter(spread);
      this.slotStag[s] = ((column++ * 0.618) % 1) * pitch;
      slotOf[entry] = s;
      sectionOfEntry[entry] = current;
    };
    /** Place libre du tronçon courant, attribuée plus tard au premier arrivant. */
    const free = (entry: number, b: number, lat: number, spread: number): void => {
      const s = slot++;
      B[s] = b;
      this.slotLat[s] = lat;
      this.slotJx[s] = jitter(spread);
      this.slotJz[s] = jitter(spread);
      this.slotStag[s] = ((column++ * 0.618) % 1) * pitch;
      sectionOfEntry[entry] = current;
      this.pools[current]!.push(s);
    };
    /** Rangs réguliers ; `flank` : service d'ordre posé sur les côtés tous les 3,5 m ; `clear` : couloir du camion. */
    const rows = (list: readonly number[], density: number, flank: number[] | null, clearFrom: number, clearTo: number): void => {
      const d = 1 / Math.sqrt(density);
      pitch = d;
      // les rangs n'occupent que 80 % de la largeur : il reste un passage le long de chaque flanc
      const edge = 0.8;
      let nextFlank = back;
      let i = 0;
      while (i < list.length) {
        const inClear = back >= clearFrom && back < clearTo;
        let perRow = Math.max(1, Math.floor((W * edge) / d));
        if (inClear) perRow = Math.max(2, perRow - Math.ceil((T.SONO_HALF_WIDTH * 2 + 1) / d));
        const count = Math.min(perRow, list.length - i);
        for (let j = 0; j < count; j++) {
          let lat: number;
          if (inClear) {
            // deux files de part et d'autre du camion
            const side = j % 2 === 0 ? -1 : 1;
            const k = j >> 1;
            const per = Math.max(1, Math.ceil(perRow / 2));
            const inner = (T.SONO_HALF_WIDTH + 0.7) / (W * 0.5);
            lat = side * (inner + ((k + 0.5) / per) * Math.max(0.05, edge - inner));
          } else {
            lat = (-1 + (2 * (j + 0.5)) / count) * edge * (count < perRow ? Math.max(0.35, count / perRow) : 1);
          }
          free(list[i + j]!, back + jitter(d * 0.25), lat + jitter(0.3 * d) / (W * 0.5), 0.3);
        }
        i += count;
        if (flank && flank.length > 0 && back >= nextFlank) {
          place(flank.pop()!, back, -0.9, 0.1);
          if (flank.length > 0) place(flank.pop()!, back, 0.9, 0.1);
          nextFlank = back + 3.5;
        }
        back += d;
      }
    };
    const sections: { kind: SectionKind; family: CrowdFamily; from: number; to: number; size: number }[] = [];
    const open = (kind: SectionKind, family: CrowdFamily): number => {
      current = sections.push({ kind, family, from: back, to: back, size: 0 }) - 1;
      this.pools.push([]);
      this.poolNext.push(0);
      return current;
    };
    const close = (index: number, size: number, gap: number): void => {
      sections[index]!.to = back;
      sections[index]!.size = size;
      back += gap;
    };

    // 1. cortège de tête
    let preEnd = -1;
    if (pre.length > 0) {
      const s = open('precortege', 'divers');
      rows(pre, T.DENSITY_PRECORTEGE, null, -1, -1);
      close(s, pre.length, 0);
      preEnd = back;
      // aligne le tronçon suivant sur un début de bloc : le tampon se règle par un écart entre deux blocs
      back = Math.ceil(back / T.BLOCK_LEN) * T.BLOCK_LEN;
    }
    // 2. carré de tête
    const frontSo: number[] = [];
    const flankSo: number[] = [];
    for (let i = 0; i < so.length; i++) (i % 2 === 0 ? frontSo : flankSo).push(so[i]!);
    if (banner.length + leaders.length + frontSo.length > 0) {
      const s = open('carre', banner.length > 0 ? entries[banner[0]!]!.family : 'syndical');
      const size = banner.length + leaders.length + frontSo.length;
      if (frontSo.length > 0) {
        // jusqu'à trois épaisseurs de service d'ordre devant la banderole
        const perRow = Math.max(2, Math.floor(W / 0.85));
        const lines = Math.min(3, Math.ceil(frontSo.length / perRow));
        const per = Math.ceil(frontSo.length / lines);
        for (let l = 0, i = 0; l < lines; l++) {
          const count = Math.min(per, frontSo.length - i);
          for (let j = 0; j < count; j++) place(frontSo[i + j]!, back, (-1 + (2 * (j + 0.5)) / count) * 0.85, 0.12);
          i += count;
          back += 0.9;
        }
        back += 0.6;
      }
      if (banner.length > 0) {
        // porteurs côte à côte, tous les 0,9 m, centrés ; une seconde banderole si la rue est trop étroite
        const perRow = Math.max(2, Math.floor((W - 1.5) / 0.9));
        for (let i = 0; i < banner.length;) {
          const count = Math.min(perRow, banner.length - i);
          for (let j = 0; j < count; j++) place(banner[i + j]!, back, ((j - (count - 1) * 0.5) * 0.9) / (W * 0.5), 0.05);
          i += count;
          back += 1.6;
        }
      }
      if (leaders.length > 0) rows(leaders, T.DENSITY_CARRE, null, -1, -1);
      close(s, size, 3);
    }
    // 3. blocs par famille ; le camion sono ouvre le plus gros bloc organisé
    let sonoFamily: CrowdFamily | null = null;
    if (wantSono) {
      let bestN = 0;
      for (const [family, list] of byFamily) {
        const bonus = family === 'syndical' ? 1.5 : ORGANISED.indexOf(family) >= 0 ? 1 : 0.6;
        if (list.length * bonus > bestN) {
          bestN = list.length * bonus;
          sonoFamily = family;
        }
      }
      if (bestN < 12) sonoFamily = null;
    }
    let sonoB = -1;
    for (const family of BLOC_ORDER) {
      const list = byFamily.get(family);
      if (!list || list.length === 0) continue;
      const organisedBloc = ORGANISED.indexOf(family) >= 0;
      const s = open(organisedBloc ? 'bloc' : 'divers', family);
      const flank: number[] = [];
      if (organisedBloc) {
        const share = Math.min(flankSo.length, Math.max(2, Math.round((flankSo.length * list.length) / Math.max(1, n - pre.length))));
        for (let k = 0; k < share && flankSo.length > 0; k++) flank.push(flankSo.pop()!);
      }
      let clearFrom = -1;
      let clearTo = -1;
      let members: readonly number[] = list;
      if (family === sonoFamily) {
        // un guide marche devant le camion, sur l'axe ; personne ne marche juste devant le pare-chocs
        const guide = flank.length > 0 ? flank.pop()! : list[0]!;
        if (guide === list[0]) members = list.slice(1);
        this.guideEntry = guide;
        place(guide, back, 0, 0.05);
        clearFrom = back + 0.5;
        sonoB = back + T.SONO_CLEAR_AHEAD + T.SONO_LENGTH * 0.5;
        clearTo = back + T.SONO_CLEAR_AHEAD + T.SONO_LENGTH + 1.5;
        if (members.length > 1) {
          this.driverEntry = members[members.length - 1]!;
          members = members.slice(0, members.length - 1);
        }
        back += 1;
      }
      rows(members, organisedBloc ? T.DENSITY_BLOC : T.DENSITY_DIVERS, flank, clearFrom, clearTo);
      if (clearTo > back) back = clearTo;
      // service d'ordre non placé : il ferme le bloc
      while (flank.length > 0) place(flank.pop()!, back, flank.length % 2 === 0 ? -0.86 : 0.86, 0.1);
      close(s, list.length, 4);
    }
    // service d'ordre restant (aucun bloc organisé) : derrière le carré
    if (flankSo.length > 0) {
      const s = open('bloc', 'syndical');
      rows(flankSo.splice(0), T.DENSITY_BLOC, null, -1, -1);
      close(s, 0, 3);
    }
    // 4. queue de cortège
    {
      const s = open('queue', 'familles');
      rows(queue, T.DENSITY_QUEUE, null, -1, -1);
      close(s, queue.length, 0);
      this.queueSection = s;
    }
    this.slotCount = slot;
    this.nextRowB = back + 1.2;

    // ── découpage en blocs ──
    const blocks = Math.max(1, Math.ceil((back + 0.01) / T.BLOCK_LEN)) + 12 + Math.ceil((n * 0.3) / 8);
    this.S = new Float64Array(blocks);
    this.V = new Float32Array(blocks);
    this.extra = new Float32Array(blocks);
    this.hold = new Float64Array(blocks).fill(-1);
    this.stretch = new Float32Array(blocks).fill(1);
    this.flankUsed = new Uint8Array(blocks * 2);
    this.blockCount = Math.max(1, Math.ceil((back + 0.01) / T.BLOCK_LEN));
    for (let s = 0; s < slot; s++) {
      const b = Math.min(this.blockCount - 1, Math.max(0, Math.floor(B[s]! / T.BLOCK_LEN)));
      this.slotBlock[s] = b;
      this.slotBack[s] = B[s]! - b * T.BLOCK_LEN;
    }
    if (preEnd >= 0 && sections.length > 1) {
      this.bufferBlock = Math.max(0, Math.ceil(preEnd / T.BLOCK_LEN) - 1);
      this.extra[this.bufferBlock] = T.BUFFER_CALM;
    }
    if (sonoB >= 0) {
      this.sonoBlock = Math.min(this.blockCount - 1, Math.floor(sonoB / T.BLOCK_LEN));
      this.sonoBack = sonoB - this.sonoBlock * T.BLOCK_LEN;
    }
    this.sections = sections.map((s, index) => ({
      index, kind: s.kind, label: sectionLabel(s.kind, s.family, cause, index), family: s.family, squadId: 0,
      firstBlock: Math.min(this.blockCount - 1, Math.floor(s.from / T.BLOCK_LEN)),
      lastBlock: Math.min(this.blockCount - 1, Math.max(Math.floor(s.from / T.BLOCK_LEN), Math.ceil(s.to / T.BLOCK_LEN) - 1)),
      size: s.size,
    }));

    // ── mise en place : la queue au début du parcours, la tête plus loin ──
    this.endS = Math.max(0, corridor.length - 2);
    let head = Math.min(Math.max(8, this.endS * 0.6), back + this.extra.reduce((a, b) => a + b, 0) + 6);
    for (let iter = 0; iter < 5; iter++) {
      this.layoutFrom(head);
      const tail = this.tailS;
      if (tail >= 2 || head >= this.endS * 0.6) break;
      head = Math.min(this.endS * 0.6, head + (2 - tail));
    }
    this.layoutFrom(head);
    return slotOf;
  }

  /** Pose la chaîne à l'arrêt, tête à l'abscisse donnée. */
  private layoutFrom(head: number): void {
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
