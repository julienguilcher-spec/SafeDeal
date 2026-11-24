/* =====================================================================================
 * Droit — maintien dans l'attroupement après les sommations (art. 431-4 du code pénal).
 *
 * Après la dernière sommation et le délai laissé à la foule, les participants qui l'ont entendue
 * et restent sciemment sur place commettent 'attroupement_apres_sommations'. Sont retenus :
 *   - ceux qui étaient à portée intelligible de la dernière sommation (ou de sa réitération) ;
 *   - qui sont encore dans ce rayon, libres de leurs mouvements, sans s'éloigner (vitesse
 *     d'éloignement < 0,6 m/s), depuis cfg.attroupementStay secondes ;
 *   - à condition que la foule dispose d'une issue libre (exits.ts) : encerclée, elle ne commet
 *     rien en restant, et l'autorité en est avertie.
 * Ne sont jamais concernés : journalistes, observateurs, secouristes, passants, personnes retenues,
 * blessés à terre. Une seule infraction par personne et par séquence.
 *
 * Examen étalé : chaque personne est revue une fois par seconde (curseur tournant sur la liste),
 * sans allocation ; l'issue est vérifiée toutes les deux secondes au plus.
 * ===================================================================================== */

import type { EntityId, Person } from '@/core/contracts';
import { Exits } from './exits';
import type { Kernel } from './kernel';

/** Période d'examen de chaque personne présente (s). */
const SCAN_PERIOD = 1;
/** Vitesse d'éloignement à partir de laquelle une personne est en train de quitter les lieux (m/s). */
const LEAVING_SPEED = 0.6;
/** Période de vérification de l'issue laissée à la foule (s), et nombre de personnes sondées pour en situer le centre. */
const EXIT_PERIOD = 2;
const EXIT_SAMPLE = 64;

export class Attroupement {
  /** La foule sommée n'a aucune issue libre : elle ne peut matériellement pas se disperser. */
  enclosed = false;

  private readonly hearers: EntityId[] = [];
  private readonly hearerSet = new Set<EntityId>();
  private readonly stay = new Map<EntityId, number>();
  private cursor = 0;
  private scanCarry = 0;
  private readonly scratch: Person[] = [];
  private readonly exits: Exits;
  private nextExitCheck = 0;

  constructor(private readonly k: Kernel) {
    this.exits = new Exits(k);
  }

  /** Nouvelle série de sommations, ou fin de séquence : plus personne n'est suivi. */
  clear(): void {
    this.hearers.length = 0;
    this.hearerSet.clear();
    this.stay.clear();
    this.cursor = 0;
    this.scanCarry = 0;
  }

  reset(): void {
    this.clear();
    this.enclosed = false;
    this.nextExitCheck = 0;
  }

  /** Force une vérification immédiate de l'issue (après une sommation). */
  recheckExit(): void {
    this.nextExitCheck = 0;
    this.checkExit();
  }

  /** Mémorise les participants à portée de la sommation : eux seuls peuvent ensuite « rester sciemment ». */
  collect(x: number, z: number, r: number): void {
    const scratch = this.scratch;
    const n = this.k.ctx.people.queryRadius(x, z, r, scratch);
    for (let i = 0; i < n; i++) {
      const p = scratch[i]!;
      if (p.faction !== 'protest' || this.hearerSet.has(p.id)) continue;
      this.hearerSet.add(p.id);
      this.hearers.push(p.id);
    }
  }

  /** Examine une tranche des personnes qui ont entendu la dernière sommation : restent-elles sciemment ? */
  scan(dt: number): void {
    const hearers = this.hearers;
    if (hearers.length === 0) return;
    const k = this.k;
    const som = k.sommations;
    const people = k.ctx.people;
    this.checkExit();
    if (this.enclosed) {
      // encerclée, la foule ne « reste » pas sciemment : les compteurs repartent de zéro
      if (this.stay.size > 0) this.stay.clear();
      return;
    }
    this.scanCarry += (hearers.length * dt) / SCAN_PERIOD;
    let count = Math.floor(this.scanCarry);
    if (count <= 0) return;
    this.scanCarry -= count;
    if (count > hearers.length) count = hearers.length;
    const r2 = som.heardRadius * som.heardRadius;
    const need = k.cfg.attroupementStay;
    for (let c = 0; c < count && hearers.length > 0; c++) {
      if (this.cursor >= hearers.length) this.cursor = 0;
      const i = this.cursor;
      const id = hearers[i]!;
      const p = people.get(id);
      if (!p || p.faction !== 'protest') {
        this.dropHearer(i, id);
        continue;
      }
      this.cursor = i + 1;
      // retenu, à terre ou blessé : ne peut pas partir, ne commet rien
      if (p.custody !== 'free' || p.posture === 'down' || p.health <= 0 || p.dormant) continue;
      const dx = p.x - som.zoneX;
      const dz = p.z - som.zoneZ;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) {
        this.stay.set(id, 0);
        continue;
      }
      if (d2 > 0.25 && (p.vx * dx + p.vz * dz) / Math.sqrt(d2) > LEAVING_SPEED) {
        // en train de quitter les lieux
        this.stay.set(id, 0);
        continue;
      }
      const stayed = (this.stay.get(id) ?? 0) + SCAN_PERIOD;
      if (stayed >= need) {
        k.offenses.record(p, 'attroupement_apres_sommations', p.x, p.z);
        // une seule infraction par séquence : la personne sort de la liste mais reste connue
        this.dropHearer(i, id, true);
        this.cursor = i;
      } else {
        this.stay.set(id, stayed);
      }
    }
  }

  /** Vérifie, toutes les deux secondes au plus, que la foule visée dispose d'une issue libre. */
  checkExit(): void {
    const k = this.k;
    const som = k.sommations;
    const ctx = k.ctx;
    const now = ctx.clock.now;
    if (now < this.nextExitCheck) return;
    this.nextExitCheck = now + EXIT_PERIOD;
    // centre de la foule encore présente (sondage régulier de la liste)
    const hearers = this.hearers;
    const step = hearers.length > EXIT_SAMPLE ? Math.floor(hearers.length / EXIT_SAMPLE) : 1;
    const r2 = som.heardRadius * som.heardRadius;
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < hearers.length; i += step) {
      const p = ctx.people.get(hearers[i]!);
      if (!p || p.custody !== 'free' || p.posture === 'down') continue;
      const dx = p.x - som.zoneX;
      const dz = p.z - som.zoneZ;
      if (dx * dx + dz * dz > r2) continue;
      sx += p.x;
      sz += p.z;
      n++;
    }
    const enclosed = n > 0 && !this.exits.open(sx / n, sz / n);
    if (enclosed === this.enclosed) return;
    this.enclosed = enclosed;
    ctx.events.emitAny('law:enclosed', { enclosed, x: n > 0 ? sx / n : som.zoneX, z: n > 0 ? sz / n : som.zoneZ });
    if (!enclosed) return;
    const records = k.records.sommations;
    const last = records.length > 0 ? records[records.length - 1]! : null;
    if (last && last.note.indexOf('sans issue') < 0) {
      last.note = (last.note === '' ? '' : last.note + ' ; ') + 'foule sans issue libre : les personnes encerclées ne commettent aucune infraction en restant';
    }
    ctx.director.addTension(0.02, sx / n, sz / n, 'Foule encerclée sans issue pendant la dispersion');
    const text = "Aucune issue libre : la foule encerclée ne peut pas se disperser. Rester sur place n'est pas un délit dans ces conditions ; ouvrez une issue d'au moins 6 m avant tout emploi de la force.";
    k.notify(ctx.people.get(som.authorityId), text, 'warn', 8);
    const player = ctx.player.person();
    if (player && player.faction === 'police' && player.id !== som.authorityId) k.notify(player, text, 'warn', 8);
  }

  private dropHearer(i: number, id: EntityId, keepKnown = false): void {
    const hearers = this.hearers;
    const last = hearers.length - 1;
    if (i !== last) hearers[i] = hearers[last]!;
    hearers.pop();
    this.stay.delete(id);
    if (!keepKnown) this.hearerSet.delete(id);
  }

  /** Une personne a quitté le jeu. */
  onRemoved(id: EntityId): void {
    this.stay.delete(id);
  }
}
