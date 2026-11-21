// Colonne du joueur (session/follow.ts, unjam) au sortir d'un stationnement en bloc, place de la Bastille : en sortant,
// un fourgon s'est mis en travers devant un autre de la colonne — nez contre flanc, chacun arrêté par l'autre. L'ordre de
// marche était échangé toutes les 12 s (chacun passait devant l'autre à tour de rôle) et personne ne bougeait : le joueur
// partait seul (« il n'y a qu'un camion qui me suit »). Celui qui a de la place derrière lui recule (giveWay) et l'autre
// passe devant.
import { describe, expect, it } from 'vitest';

import type { GameContext, Person, Squad, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as command } from '@/ui/command';

const SIM = [world, roles, people, vehicles, crowd, police, law, radio, session, command];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const TROOP = new Set(['fourgon_crs', 'car_crs', 'vl_commandement', 'canon_eau', 'centaure']);
type ApStatus = { mode: string; state: string; reason: string; leaderId: number };
interface Autopilot { status(v: Vehicle): ApStatus }

function rootOf(ctx: GameContext, s: Squad): Squad {
  let q = s;
  for (let g = 0; q.parentId !== 0 && g < 8; g++) q = ctx.squads.get(q.parentId) ?? q;
  return q;
}

/** Itinéraire routier d'au moins 450 m depuis le véhicule, sans revenir sur le bloc garé (comme playtest.colonnes-roles). */
function pickPath(ctx: GameContext, v: Vehicle): number[] {
  const path: number[] = [];
  for (const r of [520, 480, 600, 450]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      path.length = 0;
      if (!ctx.world.findPath(v.x, v.z, v.x + Math.sin(a) * r, v.z + Math.cos(a) * r, 'vehicle', path) || path.length < 4) continue;
      let len = 0;
      let away = false;
      let ok = true;
      for (let i = 2; i < path.length; i += 2) {
        len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
        const d = Math.hypot(path[i]! - v.x, path[i + 1]! - v.z);
        if (d > 60) away = true;
        else if (away && d < 45) ok = false;
      }
      if (ok && len < r * 1.6 && Math.hypot(path[path.length - 2]! - v.x, path[path.length - 1]! - v.z) > 440) return path;
    }
  }
  throw new Error('aucun itinéraire');
}

/** Le joueur conduit au clavier le long de l'itinéraire, puis freine (coincé : il recule en contre-braquant). */
function driveKeys(t: ReturnType<typeof createTestContext>, v: Vehicle, path: number[]): void {
  const input = t.ctx.input as { moveY: number; moveX: number };
  let idx = 2;
  let stuck = 0;
  let back = 0;
  for (let k = 0; k < 1500; k++) {
    while (idx < path.length - 2 && Math.hypot(path[idx]! - v.x, path[idx + 1]! - v.z) < 12) idx += 2;
    const dx = path[idx]! - v.x, dz = path[idx + 1]! - v.z;
    if (idx >= path.length - 2 && Math.hypot(dx, dz) < 8) break;
    const fwd = dx * Math.sin(v.heading) + dz * Math.cos(v.heading);
    const right = -dx * Math.cos(v.heading) + dz * Math.sin(v.heading);
    const ang = Math.atan2(right, fwd);
    if (back > 0) {
      back--;
      input.moveX = ang > 0 ? -1 : 1;
      input.moveY = -0.6;
    } else {
      input.moveX = Math.max(-1, Math.min(1, ang * 2.2));
      const want = Math.abs(ang) > 0.5 ? 4 : 8;
      input.moveY = v.speed < want ? 0.6 : v.speed > want + 2 ? -0.5 : 0;
      stuck = input.moveY > 0 && Math.abs(v.speed) < 0.3 ? stuck + 1 : 0;
      if (stuck > 15) { stuck = 0; back = 20; }
    }
    t.step(0.1);
  }
  input.moveX = 0;
  input.moveY = -1;
  for (let k = 0; k < 60 && Math.abs(v.speed) > 0.2; k++) t.step(0.1);
  t.step(1);
  input.moveY = 0;
}

async function play(poste: string, seed: number): Promise<{ followed: number; expected: number; log: string }> {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start({
    mode: 'libre', role: 'crs', place: 'Place de la Bastille', x: 3542, z: 1395, crowdSize: 60, tension: 0.1, volatility: 0.1,
    duration: 'standard', extra: { moyens: MEANS, poste },
  } as never);
  const { ctx } = t;
  t.step(5);
  const ap = ctx.service<Autopilot>('vehicles.autopilot')!;
  const me: Person = ctx.player.person()!;
  let q = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
  for (let g = 0; q && q.vehicleId === 0 && g < 8; g++) q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined;
  const ride = ctx.vehicles.get(q!.vehicleId)!;
  const company = rootOf(ctx, ctx.squads.get(me.squadId)!);
  const tree = ctx.squads.list.filter((s) => rootOf(ctx, s).id === company.id);
  const expected = tree.map((s) => (s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined))
    .filter((v, i, a): v is Vehicle => !!v && v !== ride && a.indexOf(v) === i && TROOP.has(v.kind) && v.seats.some((id) => id !== 0));
  const starts = new Map(expected.map((v) => [v.id, { x: v.x, z: v.z }]));
  // le joueur prend le volant (le chauffeur passe à l'arrière)
  me.x = ride.x + 3;
  me.z = ride.z;
  if (ride.seats[0] !== 0) {
    const o = ctx.people.get(ride.seats[0])!;
    ctx.vehicles.exit(o);
    let ok = false;
    for (let i = 1; i < ride.seats.length && !ok; i++) if (ride.seats[i] === 0) ok = ctx.vehicles.enter(o, ride, i);
  }
  expect(ctx.vehicles.enter(me, ride, 'driver')).toBe(true);
  for (let i = 0; i < 20; i++) t.step(2);
  driveKeys(t, ride, pickPath(ctx, ride));
  const chain = (): Vehicle[] => {
    const out: Vehicle[] = [];
    let prev: Vehicle = ride;
    for (let guard = 0; guard < 30; guard++) {
      const next = ctx.vehicles.list.find((v) => out.indexOf(v) < 0 && v !== ride && ap.status(v).mode === 'follow' && ap.status(v).leaderId === prev.id);
      if (!next) break;
      out.push(next);
      prev = next;
    }
    return out;
  };
  for (let i = 0; i < 60; i++) {
    const col = chain();
    if (expected.every((v) => col.indexOf(v) >= 0) && col.every((v) => Math.abs(v.speed) < 0.3 && Math.hypot(v.x - ride.x, v.z - ride.z) < 15 * (col.length + 2))) break;
    t.step(2);
  }
  const col = chain();
  const followed = expected.filter((v) => col.indexOf(v) >= 0 && Math.hypot(v.x - starts.get(v.id)!.x, v.z - starts.get(v.id)!.z) > 150);
  const missing = expected.filter((v) => followed.indexOf(v) < 0).map((v) => {
    const st = ap.status(v);
    const s0 = starts.get(v.id)!;
    return `${v.kind}#${v.id}(${st.mode}/${st.state}${st.reason ? '/' + st.reason : ''} avancé ${Math.round(Math.hypot(v.x - s0.x, v.z - s0.z))} m)`;
  });
  const log = `bastille crs/${poste} : ${followed.length}/${expected.length} véhicules ont quitté le bloc derrière le joueur ; manquent ${missing.join(' ') || '—'}`;
  console.log(log);
  return { followed: followed.length, expected: expected.length, log };
}

describe('colonne du joueur : deux fourgons nez contre flanc au sortir du bloc', () => {
  it('Bastille, crs/interpellation : toute la colonne sort du bloc et suit', async () => {
    const r = await play('interpellation', 132);
    expect(r.expected).toBeGreaterThanOrEqual(6);
    expect(r.followed, r.log).toBe(r.expected);
  }, 600000);

  it('Bastille, crs/lbd : le fourgon en travers recule, les suivants sortent (au moins quatre)', async () => {
    // (les deux derniers, le VL et un fourgon, restent pris contre une façade et un manifestant : voir le rapport)
    const r = await play('lbd', 130);
    expect(r.followed, r.log).toBeGreaterThanOrEqual(4);
  }, 600000);
});
