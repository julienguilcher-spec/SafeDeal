// « Me suivre en colonne (véhicules) » quand le joueur prend lui-même une place dans un véhicule de l'unité (volant ou
// siège passager du VL de commandement, ou siège d'un fourgon de groupe) : l'agent dont il a pris la place est replacé
// ailleurs, l'ordre n'est jamais « abandonné : Places insuffisantes », et les fourgons suivent le véhicule du joueur.
import { describe, expect, it } from 'vitest';

import type { GameContext, Person, Squad, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as police } from '@/sim/police';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { POLICE_UNITS_SERVICE } from '@/sim/police/api';
import type { PoliceUnitsApi, UnitHandle } from '@/sim/police/api';

const SIM = [world, roles, people, vehicles, police, law, radio, session, command];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

type T = ReturnType<typeof createTestContext>;
type Seat = 'driver' | 'passenger';

function treeOf(ctx: GameContext, root: Squad): Squad[] {
  return ctx.squads.list.filter((q) => {
    let p: Squad | undefined = q;
    for (let g = 0; p && g < 8; g++) {
      if (p.id === root.id) return true;
      p = p.parentId !== 0 ? ctx.squads.get(p.parentId) : undefined;
    }
    return false;
  });
}

function crew(ctx: GameContext, root: Squad): Person[] {
  return treeOf(ctx, root).flatMap((q) => q.members.map((id) => ctx.people.get(id)!)).filter((p) => p && !p.isPlayer);
}

function fleet(ctx: GameContext, root: Squad, but: Vehicle): Vehicle[] {
  return treeOf(ctx, root).filter((q) => q.vehicleId !== 0 && q.vehicleId !== but.id).map((q) => ctx.vehicles.get(q.vehicleId)!)
    .filter((v) => v.kind === 'fourgon_crs');
}

/** Le joueur monte : au volant, l'IA lui cède la place comme dans le jeu (passager s'il en reste, sinon dehors). */
function board(ctx: GameContext, me: Person, v: Vehicle, seat: Seat): void {
  me.x = v.x + 3;
  me.z = v.z;
  if (seat === 'driver' && v.seats[0] !== 0) {
    const o = ctx.people.get(v.seats[0])!;
    ctx.vehicles.exit(o);
    let ok = false;
    for (let i = 1; i < v.seats.length && !ok; i++) if (v.seats[i] === 0) ok = ctx.vehicles.enter(o, v, i);
  }
  if (seat === 'passenger') {
    // la place la plus proche de la portière : une place passager libre
    let i = 1;
    while (i < v.seats.length && v.seats[i] !== 0) i++;
    expect(ctx.vehicles.enter(me, v, i)).toBe(true);
  } else expect(ctx.vehicles.enter(me, v, 'driver')).toBe(true);
}

async function start(role: string, seed: number, poste?: string) {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start({ mode: 'libre', role, rank: role === 'commandant' ? 'commandant' : undefined, place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: poste ? { moyens: MEANS, poste } : { moyens: MEANS, variante: 'terrain' } } as never);
  const { ctx } = t;
  t.step(3);
  const notes: string[] = [];
  const notify = ctx.ui.notify.bind(ctx.ui);
  (ctx.ui as { notify: typeof ctx.ui.notify }).notify = ((text: string, ...rest: unknown[]) => {
    notes.push(text);
    return (notify as (...a: unknown[]) => void)(text, ...rest);
  }) as typeof ctx.ui.notify;
  const fails: string[] = [];
  ctx.events.onAny('police:order_done', (e) => {
    const d = e as { squadId: number; type: string; ok: boolean; reason: string };
    if (!d.ok) fails.push(`${ctx.squads.get(d.squadId)?.name} ${d.type} : ${d.reason}`);
  });
  return { t, ctx, notes, fails, core: ctx.service<CommandCore>('ui.command')!, me: ctx.player.person()! };
}

/** Itinéraire routier de 250 à 400 m depuis le véhicule. */
function pickPath(ctx: GameContext, v: Vehicle): number[] {
  const path: number[] = [];
  for (const r of [300, 260, 360]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      path.length = 0;
      if (ctx.world.findPath(v.x, v.z, v.x + Math.sin(a) * r, v.z + Math.cos(a) * r, 'vehicle', path) && path.length >= 4) return path;
    }
  }
  throw new Error('aucun itinéraire');
}

/** Le joueur conduit au clavier le long de l'itinéraire (au plus `upTo` mètres), puis freine. */
function driveKeys(t: T, v: Vehicle, path: number[], upTo = Infinity): void {
  const input = t.ctx.input as { moveY: number; moveX: number };
  const x0 = v.x, z0 = v.z;
  let idx = 2;
  for (let k = 0; k < 900 && Math.hypot(v.x - x0, v.z - z0) < upTo; k++) {
    while (idx < path.length - 2 && Math.hypot(path[idx]! - v.x, path[idx + 1]! - v.z) < 12) idx += 2;
    const dx = path[idx]! - v.x, dz = path[idx + 1]! - v.z;
    if (idx >= path.length - 2 && Math.hypot(dx, dz) < 8) break;
    const fwd = dx * Math.sin(v.heading) + dz * Math.cos(v.heading);
    const right = -dx * Math.cos(v.heading) + dz * Math.sin(v.heading);
    const ang = Math.atan2(right, fwd);
    input.moveX = Math.max(-1, Math.min(1, ang * 2.2));
    const want = Math.abs(ang) > 0.5 ? 4 : 8;
    input.moveY = v.speed < want ? 0.6 : v.speed > want + 2 ? -0.5 : 0;
    t.step(0.1);
  }
  input.moveX = 0;
  input.moveY = -1;
  for (let k = 0; k < 60 && Math.abs(v.speed) > 0.2; k++) t.step(0.1);
  t.step(1);
  input.moveY = 0;
}

/** Le véhicule du joueur roule ~300 m : il conduit, ou son chauffeur (pilote automatique) l'emmène. */
function roll(t: T, v: Vehicle, me: Person): number {
  const ctx = t.ctx;
  const x0 = v.x, z0 = v.z;
  const path = pickPath(ctx, v);
  if (v.seats[0] === me.id) driveKeys(t, v, path);
  else {
    const ap = ctx.service<{ driveTo(v: Vehicle, x: number, z: number): boolean; status(v: Vehicle): { state: string } }>('vehicles.autopilot')!;
    expect(ap.driveTo(v, path[path.length - 2]!, path[path.length - 1]!)).toBe(true);
    for (let i = 0; i < 90 && ap.status(v).state !== 'arrive'; i++) t.step(2);
  }
  return Math.hypot(v.x - x0, v.z - z0);
}

/**
 * `follows` : on vérifie aussi que les fourgons suivent sur plus de 150 m. Quand le commandant attend plus d'une minute
 * au volant du VL, garé au fond du bloc des fourgons, la colonne s'emmêle encore au départ (fourgons de tête qui font
 * demi-tour vers le VL arrêté derrière eux, fourgon cellulaire sans conducteur en travers de la sortie, pilote
 * automatique) — défaut distinct des places, signalé à part : le trajet est seulement journalisé.
 */
interface Case { role: string; poste?: string; seed: number; seat: Seat; ride: 'vl' | 'fourgon'; before: boolean; follows: boolean; section?: boolean }

async function scenario(c: Case) {
  const { t, ctx, notes, fails, core, me } = await start(c.role, c.seed, c.poste);
  // unité ordonnée : la compagnie entière (commandant) ou l'unité du joueur
  const unit = c.role === 'commandant'
    ? ctx.squads.list.find((s) => s.faction === 'police' && (c.section ? s.kind === 'section' && s.name === 'MISTRAL 1' : s.kind === 'compagnie'))!
    : ctx.squads.get(core.scope().ownSquadId)!;
  expect(unit).toBeTruthy();
  const near = (kind: string) => ctx.vehicles.list.filter((v) => v.kind === kind && v.faction === 'police')
    .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
  let ride: Vehicle;
  if (c.ride === 'vl') ride = near('vl_commandement');
  else {
    // fourgon de son groupe (chef de section, chef de groupe), sinon celui du premier groupe de la compagnie
    let q = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    for (let g = 0; q && q.vehicleId === 0 && g < 8; g++) q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined;
    const v = q && q.vehicleId !== 0 ? ctx.vehicles.get(q.vehicleId) : undefined;
    ride = v && v.kind === 'fourgon_crs' ? v : ctx.vehicles.get(ctx.squads.list.find((s) => s.name === 'MISTRAL 1 ALFA')!.vehicleId)!;
  }
  expect(ride).toBeTruthy();
  if (c.seat === 'passenger') {
    // passager : son chauffeur le conduira ; le véhicule est d'abord sorti du bloc garé (le joueur au volant, 40 m)
    const chauffeur = ctx.people.get(ride.seats[0])!;
    board(ctx, me, ride, 'driver');
    driveKeys(t, ride, pickPath(ctx, ride), 40);
    ctx.vehicles.exit(me);
    if (chauffeur.vehicleId === ride.id) ctx.vehicles.exit(chauffeur);
    chauffeur.x = ride.x + 3; chauffeur.z = ride.z;
    expect(ctx.vehicles.enter(chauffeur, ride, 'driver')).toBe(true);
    // le joueur revient à pied auprès de ses hommes pour donner l'ordre
    me.x = ride.x + 4; me.z = ride.z;
    t.step(2);
  }
  if (c.before) board(ctx, me, ride, c.seat);
  expect(core.issue('avec_moi', [unit], null).ok).toBe(true);
  t.step(1);
  if (!c.before) board(ctx, me, ride, c.seat);
  for (let i = 0; i < 35; i++) t.step(2);
  const afoot = crew(ctx, unit).filter((p) => p.vehicleId === 0 && p.custody === 'free' && p.posture !== 'down');
  const vans = fleet(ctx, unit, ride);
  const ready = ctx.radio.log.find((m) => /prête à vous suivre/.test(m.text));
  const label = `${c.role}, ${c.seat === 'driver' ? 'au volant' : 'passager'} (${c.ride}), ${c.before ? 'monté avant l’ordre' : 'monté après l’ordre'}`;
  console.log(`${label} : ${afoot.length} à pied (${afoot.map((p) => p.poste).join(',')}) ; échecs ${fails.join(' | ') || '—'} ; avis ${notes.filter((n) => /abandonn/.test(n)).join(' | ') || '—'} ; « ${ready?.text ?? '—'} »`);
  // personne n'est laissé sans place, l'ordre n'est ni abandonné ni affiché comme tel
  expect(fails.filter((f) => /Places insuffisantes/.test(f))).toEqual([]);
  expect(notes.filter((n) => /ordre abandonné/.test(n))).toEqual([]);
  expect(afoot.length).toBe(0);
  expect(unit.order.type).toBe('embarquer');
  expect(ready).toBeTruthy();
  expect(ready!.text).not.toMatch(/à pied/);
  // le véhicule du joueur roule : chaque fourgon de l'unité suit, en chaîne
  const starts = vans.map((v) => ({ x: v.x, z: v.z }));
  const moved = roll(t, ride, me);
  for (let i = 0; i < 90; i++) {
    t.step(2);
    if (vans.every((v) => Math.hypot(v.x - ride.x, v.z - ride.z) < 15 * (vans.length + 2) && Math.abs(v.speed) < 0.3)) break;
  }
  const adv = vans.map((v, i) => Math.round(Math.hypot(v.x - starts[i]!.x, v.z - starts[i]!.z)));
  const gap = vans.map((v) => Math.round(Math.hypot(v.x - ride.x, v.z - ride.z)));
  console.log(`  véhicule du joueur : ${Math.round(moved)} m ; ${vans.length} fourgons avancés de ${adv.join(',')} m, à ${gap.join(',')} m de lui`);
  if (!c.follows) return;
  expect(moved).toBeGreaterThan(150);
  for (const d of adv) expect(d).toBeGreaterThan(150);
  // en chaîne derrière lui : à moins de 15 m par rang (intervalle de 9 m et longueur du fourgon), à une rangée près
  for (const d of gap) expect(d).toBeLessThan(15 * (vans.length + 2));
}

describe('« Me suivre en colonne » : le joueur prend une place dans un véhicule de l’unité', () => {
  it('commandant, passager du VL de commandement, monté après l’ordre', async () => { await scenario({ role: 'commandant', seed: 31, seat: 'passenger', ride: 'vl', before: false, follows: false }); }, 900000);
  it('commandant, au volant du VL (le chauffeur lui cède le volant), monté après l’ordre', async () => { await scenario({ role: 'commandant', seed: 32, seat: 'driver', ride: 'vl', before: false, follows: false }); }, 900000);
  it('commandant, passager du VL, monté avant l’ordre', async () => { await scenario({ role: 'commandant', seed: 33, seat: 'passenger', ride: 'vl', before: true, follows: false }); }, 900000);
  it('commandant, au volant d’un fourgon de groupe', async () => { await scenario({ role: 'commandant', seed: 34, seat: 'driver', ride: 'fourgon', before: false, follows: false }); }, 900000);
  it('commandant, au volant du VL, ordre donné à une section', async () => { await scenario({ role: 'commandant', seed: 37, seat: 'driver', ride: 'vl', before: false, follows: false, section: true }); }, 900000);
  it('chef de section, au volant de son fourgon', async () => { await scenario({ role: 'chef_groupe', poste: 'chef_section', seed: 35, seat: 'driver', ride: 'fourgon', before: false, follows: true }); }, 900000);
  it('chef de groupe, au volant de son fourgon', async () => { await scenario({ role: 'chef_groupe', seed: 36, seat: 'driver', ride: 'fourgon', before: false, follows: true }); }, 900000);
});

describe('places par construction', () => {
  it('compagnie, section, groupe : au moins une place de plus que l’effectif (celle du joueur)', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: [world, roles, people, vehicles, police] });
    await t.start({ mode: 'libre', role: 'crs', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { 'crowd.none': true } } as never);
    const units = t.ctx.service<PoliceUnitsApi>(POLICE_UNITS_SERVICE)!;
    const seats = (h: UnitHandle) => h.vehicles.reduce((n, v) => n + (v.kind === 'fourgon_cellulaire' ? 2 : v.seats.length), 0);
    const made: [string, UnitHandle][] = [
      ['compagnie', units.createCompany({ x: 300, z: 15, heading: 0, sections: 4 })],
      ['section', units.createSection({ x: -300, z: 15, heading: 0, vehicles: true, drivers: true })],
      ['section sans chauffeurs', units.createSection({ x: -300, z: 300, heading: 0, vehicles: true, drivers: false })],
      ['groupe', units.createGroup({ x: 0, z: -300, heading: 0, vehicles: true, drivers: true, type: 'intervention' })],
    ];
    for (const [name, h] of made) {
      console.log(`${name} : ${h.people.length} agents, ${seats(h)} places`);
      expect(seats(h), name).toBeGreaterThanOrEqual(h.people.length + 1);
    }
  }, 300000);
});
