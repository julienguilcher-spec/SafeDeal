/* =====================================================================================
 * Bruits de pas du joueur et des personnes proches, d'après leur vitesse réelle et la surface
 * sous leurs pieds (ctx.world.surfaceAt). Une foulée = un son : on cumule la distance parcourue
 * et on déclenche quand elle atteint la longueur de foulée correspondant à l'allure.
 * ===================================================================================== */

import type { GameContext, Person } from '@/core/contracts';
import type { AudioEngine, PlayExtra } from './engine';
import { footstepSound, strideLength } from './mapping';
import { mulberry32 } from './prng';
import { PRIORITY_AMBIENT, PRIORITY_NORMAL } from './voicePool';

/** Nombre de personnes (hors joueur) dont on entend les pas, et rayon d'écoute (m). */
const TRACKED = 8;
const RADIUS = 14;

const PLAYER_EXTRA: PlayExtra = { priority: PRIORITY_NORMAL, noDedup: true };
const OTHER_EXTRA: PlayExtra = { priority: PRIORITY_AMBIENT };

export class Footsteps {
  private readonly ids = new Int32Array(TRACKED);
  private readonly acc = new Float32Array(TRACKED);
  private readonly newIds = new Int32Array(TRACKED);
  private readonly newAcc = new Float32Array(TRACKED);
  private readonly newDist = new Float32Array(TRACKED);
  private count = 0;
  private playerAcc = 0;
  private refreshAt = 0;
  private time = 0;
  private readonly scratch: Person[] = [];
  private readonly rnd = mulberry32(0x5eed);
  private readonly filter = (p: Person): boolean =>
    !p.isPlayer && !p.dormant && p.vehicleId === 0 && p.vx * p.vx + p.vz * p.vz > 0.5;

  constructor(private readonly ctx: GameContext, private readonly engine: AudioEngine) {}

  frame(dt: number): void {
    this.time += dt;
    const ctx = this.ctx;
    const st = ctx.env.state;
    const wet = Math.max(st.wetness, st.rain * 0.8);

    const player = ctx.player.person();
    if (player) this.playerAcc = this.step(player, dt, this.playerAcc, wet, true);

    if (this.time >= this.refreshAt) {
      this.refreshAt = this.time + 0.25;
      this.refresh();
    }
    for (let i = 0; i < this.count; i++) {
      const p = ctx.people.get(this.ids[i]!);
      if (p) this.acc[i] = this.step(p, dt, this.acc[i]!, wet, false);
    }
  }

  /** Avance le cumul de distance d'une personne ; joue un pas quand une foulée est accomplie. Retourne le nouveau cumul. */
  private step(p: Person, dt: number, acc: number, wet: number, isPlayer: boolean): number {
    if (p.vehicleId !== 0 || p.heldBy !== 0 || p.dormant) return 0;
    const posture = p.posture;
    if (posture !== 'stand' && posture !== 'crouch') return 0;
    const speed = Math.hypot(p.vx, p.vz);
    if (speed < 0.45) return Math.min(acc, 0.3); // à l'arrêt : le prochain pas viendra vite au redémarrage
    const stride = strideLength(speed) * (posture === 'crouch' ? 0.8 : 1);
    acc += speed * dt;
    if (acc < stride) return acc;
    acc -= stride;
    if (acc > stride) acc = 0; // saut de position (téléportation) : pas de rafale de pas
    const id = footstepSound(this.ctx.world.surfaceAt(p.x, p.z), wet);
    const effort = speed / 7;
    const volume = (isPlayer ? 0.9 : 0.75) * (0.5 + (effort > 1 ? 1 : effort) * 0.7) * (posture === 'crouch' ? 0.5 : 1);
    this.engine.play(
      id,
      { x: p.x, y: p.y, z: p.z, volume, pitch: 0.92 + 0.16 * this.rnd() },
      isPlayer ? PLAYER_EXTRA : OTHER_EXTRA,
    );
    return acc;
  }

  /** Quatre fois par seconde : retient les personnes en mouvement les plus proches de l'auditeur. */
  private refresh(): void {
    const eng = this.engine;
    const n = this.ctx.people.queryRadius(eng.lx, eng.lz, RADIUS, this.scratch, this.filter);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = this.scratch[i]!;
      const dx = p.x - eng.lx;
      const dz = p.z - eng.lz;
      const d2 = dx * dx + dz * dz;
      let j = m;
      while (j > 0 && this.newDist[j - 1]! > d2) j--;
      if (j >= TRACKED) continue;
      const end = m < TRACKED ? m : TRACKED - 1;
      for (let k = end; k > j; k--) {
        this.newDist[k] = this.newDist[k - 1]!;
        this.newIds[k] = this.newIds[k - 1]!;
      }
      this.newDist[j] = d2;
      this.newIds[j] = p.id;
      if (m < TRACKED) m++;
    }
    // conserve le cumul des personnes déjà suivies ; les nouvelles partent d'une phase aléatoire
    for (let i = 0; i < m; i++) {
      let a = this.rnd() * 0.6;
      for (let k = 0; k < this.count; k++) {
        if (this.ids[k] === this.newIds[i]) {
          a = this.acc[k]!;
          break;
        }
      }
      this.newAcc[i] = a;
    }
    for (let i = 0; i < m; i++) {
      this.ids[i] = this.newIds[i]!;
      this.acc[i] = this.newAcc[i]!;
    }
    this.count = m;
    this.scratch.length = 0;
  }

  reset(): void {
    this.count = 0;
    this.playerAcc = 0;
    this.refreshAt = 0;
  }
}
