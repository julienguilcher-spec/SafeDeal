/* =====================================================================================
 * FORCES DE L'ORDRE — aides de test (réservées aux tests : aucun autre module n'est importé ici,
 * les tests passent eux-mêmes les fabriques des modules qu'ils composent).
 *
 *   const t = await startPolice([world, people, items, hazards, law], { mode: 'test' });
 *   const cie = t.units.createCompany({ x: 0, z: -100, heading: Math.PI });
 *   t.ctx.squads.issue(cie.squad.id, { type: 'ligne', x: 0, z: -110, heading: Math.PI });
 *   t.step(20);
 *   expect(straightness(frontRank(t, cie.squad.id))).toBeLessThan(0.5);
 * ===================================================================================== */

import type { GameContext, ModuleFactory, Person, ProtestProfile, SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import type { TestContext } from '@/core/testing';
import type { PoliceFormationApi, PoliceSlotApi, PoliceStatusApi, PoliceTuning, PoliceUnitsApi } from './api';
import {
  POLICE_FORMATION_SERVICE, POLICE_SLOT_SERVICE, POLICE_STATUS_SERVICE, POLICE_SYSTEM_ID, POLICE_TUNING_SERVICE, POLICE_UNITS_SERVICE,
} from './api';
import { PoliceSystem } from './system';

export interface PoliceTest {
  t: TestContext;
  ctx: GameContext;
  system: PoliceSystem;
  units: PoliceUnitsApi;
  status: PoliceStatusApi;
  slots: PoliceSlotApi;
  formation: PoliceFormationApi;
  tuning: PoliceTuning;
  /** Avance la simulation (pas de 1/30 s). */
  step(seconds: number): void;
  /** Avance par tranches de `slice` secondes en appelant `each` après chacune ; s'arrête si `each` retourne true. */
  run(seconds: number, slice: number, each: (elapsed: number) => boolean | void): number;
}

/** Démarre une session d'essai avec les modules donnés et le module de police. */
export async function startPolice(modules: readonly ModuleFactory[], config: Partial<SessionConfig> = {}, seed = 7): Promise<PoliceTest> {
  const system = new PoliceSystem();
  const t = createTestContext({ seed, modules, systems: [system] });
  await t.start(config);
  const ctx = t.ctx;
  const out: PoliceTest = {
    t,
    ctx,
    system,
    units: ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE),
    status: ctx.require<PoliceStatusApi>(POLICE_STATUS_SERVICE),
    slots: ctx.require<PoliceSlotApi>(POLICE_SLOT_SERVICE),
    formation: ctx.require<PoliceFormationApi>(POLICE_FORMATION_SERVICE),
    tuning: ctx.require<PoliceTuning>(POLICE_TUNING_SERVICE),
    step: (seconds) => t.step(seconds),
    run: (seconds, slice, each) => {
      let elapsed = 0;
      while (elapsed < seconds - 1e-9) {
        t.step(slice);
        elapsed += slice;
        if (each(elapsed) === true) break;
      }
      return elapsed;
    },
  };
  return out;
}

export { POLICE_SYSTEM_ID };

/** Personnes du premier rang de la formation dirigée par l'unité (bloc `block`), de gauche à droite. */
export function frontRank(pt: PoliceTest, squadId: number, block = 0): Person[] {
  const info = pt.formation.of(squadId, block);
  const out: Person[] = [];
  if (!info) return out;
  for (let i = 0; i < info.front.length; i++) {
    const p = pt.ctx.people.get(info.front[i]);
    if (p) out.push(p);
  }
  return out;
}

export interface LineFit {
  /** Écart maximal à la droite ajustée (m). */
  error: number;
  /** Direction de la droite (cap, modulo π). */
  heading: number;
  /** Intervalles entre voisins le long de la droite : minimum, maximum, moyenne (m). */
  gapMin: number;
  gapMax: number;
  gapMean: number;
  /** Longueur du rang (m). */
  length: number;
  cx: number;
  cz: number;
}

/** Ajuste une droite (moindres carrés orthogonaux) sur un rang et mesure sa rectitude et sa régularité. */
export function fitLine(people: readonly Person[]): LineFit {
  const n = people.length;
  const out: LineFit = { error: 0, heading: 0, gapMin: 0, gapMax: 0, gapMean: 0, length: 0, cx: 0, cz: 0 };
  if (n === 0) return out;
  let mx = 0;
  let mz = 0;
  for (const p of people) {
    mx += p.x;
    mz += p.z;
  }
  mx /= n;
  mz /= n;
  out.cx = mx;
  out.cz = mz;
  if (n < 2) return out;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  for (const p of people) {
    sxx += (p.x - mx) * (p.x - mx);
    szz += (p.z - mz) * (p.z - mz);
    sxz += (p.x - mx) * (p.z - mz);
  }
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(theta);
  const uz = Math.sin(theta);
  out.heading = Math.atan2(ux, uz);
  const along: number[] = [];
  for (const p of people) {
    const e = Math.abs((p.x - mx) * -uz + (p.z - mz) * ux);
    if (e > out.error) out.error = e;
    along.push((p.x - mx) * ux + (p.z - mz) * uz);
  }
  along.sort((a, b) => a - b);
  out.gapMin = Infinity;
  for (let i = 1; i < n; i++) {
    const g = along[i] - along[i - 1];
    if (g < out.gapMin) out.gapMin = g;
    if (g > out.gapMax) out.gapMax = g;
  }
  out.length = along[n - 1] - along[0];
  out.gapMean = out.length / (n - 1);
  return out;
}

/** Écart angulaire entre deux directions de droite (modulo π), en radians. */
export function lineAngle(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/** Crée `n` manifestants en grille autour d'un point (aucune IA : ils restent sur place sauf commande du test). */
export function spawnProtesters(ctx: GameContext, n: number, x: number, z: number, heading: number, profile: ProtestProfile = 'pacifique', spacing = 1.2, perRow = 10): Person[] {
  const out: Person[] = [];
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = -fz;
  const rz = fx;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const lx = (col - (Math.min(n, perRow) - 1) / 2) * spacing;
    const p = ctx.people.spawn({
      kind: 'manifestant', faction: 'protest', profile, x: x + rx * lx - fx * row * spacing, z: z + rz * lx - fz * row * spacing,
      heading, seed: 1000 + i,
    });
    out.push(p);
  }
  return out;
}

/** Distance maximale d'un ensemble de personnes à leur barycentre projetée sur un axe (étalement d'une colonne). */
export function extent(people: readonly Person[], ax: number, az: number): number {
  let min = Infinity;
  let max = -Infinity;
  for (const p of people) {
    const v = p.x * ax + p.z * az;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return people.length > 0 ? max - min : 0;
}

/**
 * Manifestant scripté : lance l'objet donné vers (tx, tz) par les mêmes actions qu'un joueur (visée résolue
 * par ctx.actions.solveAim, posée directement puisque le personnage n'a pas de contrôleur). Retourne true si le
 * projectile est parti. L'objet est donné et pris en main au besoin (un pas de simulation doit alors s'écouler).
 */
export function throwAt(ctx: GameContext, p: Person, item: 'pave' | 'bouteille' | 'molotov', tx: number, tz: number): boolean {
  if (ctx.actions.has(p, item) <= 0) ctx.actions.give(p, item, 3);
  const held = p.active >= 0 ? p.inventory[p.active] : undefined;
  if (!held || held.id !== item) {
    ctx.actions.selectById(p, item);
    return false;
  }
  const sol = { yaw: 0, pitch: 0, power: 1, flightTime: 0 };
  if (!ctx.actions.solveAim(p, tx, ctx.world.heightAt(tx, tz) + 1.2, tz, sol)) return false;
  p.aimYaw = sol.yaw;
  p.aimPitch = sol.pitch;
  p.cmd.aimYaw = sol.yaw;
  p.cmd.aimPitch = sol.pitch;
  p.heading = sol.yaw;
  return ctx.actions.use(p, { power: sol.power }).ok;
}
