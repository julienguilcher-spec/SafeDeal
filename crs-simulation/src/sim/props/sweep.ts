/* =====================================================================================
 * DÉCOR DYNAMIQUE — balayage lent : chaque objet et chaque vitrine est revu environ une fois par
 * seconde, par tranches (quelques dizaines par pas de simulation, jamais toute la liste d'un coup).
 *
 *   - sommeil : un objet est éveillé s'il est actif (en mouvement, en feu, porté) ou s'il se trouve
 *     près du joueur (rayon réglable, 260 m), de la caméra, d'une personne éveillée ou d'un véhicule
 *     (cellules de 64 m, voisines comprises) ; sinon il dort : ni collision, ni requête, ni réflexion.
 *     Sans aucun centre d'intérêt connu (pas de joueur, personne, aucun véhicule), tout reste éveillé ;
 *   - remise à jour des objets qu'un autre module a déplacés ou renversés en écrivant leurs champs ;
 *   - exposition des objets combustibles aux nappes de feu (fire.exposure) ;
 *   - réflexion des commerçants et exposition des devantures (shops.think).
 * ===================================================================================== */

import type { Mod } from './mod';
import { tileKey } from './shared';
import type { PropObj } from './shared';

/** Période de revue d'un objet (s). */
const SWEEP_SECONDS = 1;
/** Période du relevé des zones éveillées (s). */
const AWAKE_PERIOD = 0.5;
/** Côté d'une cellule d'éveil (m). */
const CELL = 64;

export class Sweep {
  private cursor = 0;
  private shopCursor = 0;
  private acc = 0;
  private shopAcc = 0;
  private nextAwakeAt = 0;
  private readonly awake = new Set<number>();
  private readonly centers = new Set<number>();
  /** Aucun centre d'intérêt connu : tout est éveillé. */
  private everything = true;

  constructor(private readonly m: Mod) {}

  reset(): void {
    this.cursor = 0;
    this.shopCursor = 0;
    this.acc = 0;
    this.shopAcc = 0;
    this.nextAwakeAt = 0;
    this.awake.clear();
    this.centers.clear();
    this.everything = true;
  }

  private markCell(x: number, z: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const key = tileKey(cx, cz);
    if (this.centers.has(key)) return true;
    this.centers.add(key);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.awake.add(tileKey(cx + dx, cz + dz));
    return true;
  }

  private markDisc(x: number, z: number, radius: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL);
    const z1 = Math.floor((z + radius) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) this.awake.add(tileKey(cx, cz));
  }

  /** Relève les zones où il se passe quelque chose. */
  private survey(): void {
    const ctx = this.m.k.ctx;
    const radius = Math.max(CELL, this.m.k.tuning.wakeRadius);
    this.awake.clear();
    this.centers.clear();
    let any = false;
    const player = ctx.player.person();
    if (player) {
      this.markDisc(player.x, player.z, radius);
      any = true;
    }
    const view = ctx.view;
    if (view) {
      this.markDisc(view.camX, view.camZ, radius * 0.6);
      any = true;
    }
    const people = ctx.people.list;
    for (let i = 0; i < people.length; i++) {
      const p = people[i]!;
      if (!p.dormant && this.markCell(p.x, p.z)) any = true;
    }
    const vehicles = ctx.vehicles.list;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]!;
      if (!v.dormant && this.markCell(v.x, v.z)) any = true;
    }
    this.everything = !any;
  }

  private isAwake(x: number, z: number): boolean {
    return this.awake.has(tileKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  private visit(p: PropObj, now: number, sleep: boolean): void {
    const m = this.m;
    const elapsed = now - p.sweptAt;
    p.sweptAt = now;
    if (p.toppled && !p.toppledDone) m.motion.applyTopple(p, Math.sin(p.heading), Math.cos(p.heading));
    if (m.store.stale(p)) m.store.reindex(p);
    if (sleep) {
      const awake = p.act !== 0 || this.isAwake(p.x, p.z);
      if (p.dormant === awake) p.dormant = !awake;
    } else if (p.dormant) {
      p.dormant = false;
    }
    if (!p.dormant && p.fuel > 0 && elapsed > 0) m.fire.exposure(p, elapsed < 5 ? elapsed : 5);
  }

  update(dt: number): void {
    const m = this.m;
    const k = m.k;
    const now = k.ctx.clock.now;
    const dormancy = k.tuning.dormancy;
    if (dormancy && now >= this.nextAwakeAt) {
      this.nextAwakeAt = now + AWAKE_PERIOD;
      this.survey();
    }
    const sleep = dormancy && !this.everything;

    const list = m.store.list;
    let len = list.length;
    if (len > 0) {
      this.acc += (len * dt) / SWEEP_SECONDS;
      let n = Math.floor(this.acc);
      this.acc -= n;
      if (n > len) n = len;
      for (let i = 0; i < n; i++) {
        len = list.length; // la revue peut allumer un feu, jamais retirer un objet ; par prudence on relit
        if (len === 0) break;
        if (this.cursor >= len) this.cursor = 0;
        this.visit(list[this.cursor++]!, now, sleep);
      }
    }

    const shops = m.store.shops;
    len = shops.length;
    if (len > 0) {
      this.shopAcc += (len * dt) / SWEEP_SECONDS;
      let n = Math.floor(this.shopAcc);
      this.shopAcc -= n;
      if (n > len) n = len;
      for (let i = 0; i < n; i++) {
        if (this.shopCursor >= shops.length) this.shopCursor = 0;
        const s = shops[this.shopCursor++]!;
        const elapsed = now - s.sweptAt;
        s.sweptAt = now;
        if (sleep) {
          const awake = s.inFire || s.rolling || s.occupants > 0 || this.isAwake(s.x, s.z);
          if (s.dormant === awake) s.dormant = !awake;
        } else if (s.dormant) {
          s.dormant = false;
        }
        if (!s.dormant && elapsed > 0) m.shops.think(s, elapsed < 5 ? elapsed : 5);
      }
    }
  }

  /** Nombre d'objets éveillés (parcours complet : pour les statistiques seulement). */
  countAwake(): number {
    const list = this.m.store.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) if (!list[i]!.dormant) n++;
    return n;
  }
}
