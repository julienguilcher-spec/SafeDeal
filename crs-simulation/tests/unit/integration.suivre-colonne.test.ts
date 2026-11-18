// Ordres « Me suivre à pied » et « Me suivre en colonne (véhicules) » donnés par le commandant MISTRAL à une section :
// à pied, personne ne monte ; en colonne, la section embarque, attend, suit le VL du joueur à travers les rues (virage
// compris) sans le doubler ni le percuter, se gare derrière lui et reste à bord ; « Me suivre à pied » la fait descendre.
import { describe, expect, it } from 'vitest';

import type { GameContext, Squad, Vehicle } from '@/core/contracts';
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

const SIM = [world, roles, people, vehicles, police, law, radio, session, command];
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const CONFIG = { mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' } };

type T = ReturnType<typeof createTestContext>;

function crew(ctx: GameContext, root: Squad): number[] {
  const out: number[] = [];
  for (const q of ctx.squads.list) {
    let p: Squad | undefined = q;
    for (let g = 0; p && g < 8; g++) {
      if (p.id === root.id) { out.push(...q.members); break; }
      p = p.parentId !== 0 ? ctx.squads.get(p.parentId) : undefined;
    }
  }
  return out.filter((id) => !ctx.people.get(id)!.isPlayer);
}

/** Les agents qui mettent pied à terre (les conducteurs restent aux véhicules). */
function walkers(ctx: GameContext, ids: number[]): number[] {
  return ids.filter((id) => ctx.people.get(id)!.poste !== 'conducteur');
}

function vans(ctx: GameContext, root: Squad): Vehicle[] {
  return ctx.squads.list.filter((q) => q.parentId === root.id && q.vehicleId !== 0).map((q) => ctx.vehicles.get(q.vehicleId)!);
}

/** Le joueur marche droit devant lui (stick à mi-course : il marche, sans passer au trot). */
function walk(t: T, seconds: number): void {
  const input = t.ctx.input as { moveY: number; moveX: number };
  input.moveX = 0;
  input.moveY = 0.5;
  t.step(seconds);
  input.moveY = 0;
}

/** Itinéraire routier d'environ 600 m depuis le véhicule, avec au moins un virage franc. */
function pickRoute(ctx: GameContext, v: Vehicle): number[] {
  for (const r of [420, 480, 380, 520]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const path: number[] = [];
      if (!ctx.world.findPath(v.x, v.z, v.x + Math.sin(a) * r, v.z + Math.cos(a) * r, 'vehicle', path) || path.length < 6) continue;
      let len = 0;
      let turn = 0;
      for (let i = 2; i < path.length; i += 2) len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
      // virage : changement de cap d'au moins 60° entre deux tronçons de plus de 60 m
      const n = path.length / 2;
      const head = (i: number, j: number) => Math.atan2(path[j * 2]! - path[i * 2]!, path[j * 2 + 1]! - path[i * 2 + 1]!);
      for (let i = 1; i < n - 1; i++) {
        let d = Math.abs(head(0, i) - head(i, n - 1));
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > turn) turn = d;
      }
      if (len > 520 && len < 760 && turn > Math.PI / 3) return path;
    }
  }
  throw new Error('aucun itinéraire de 600 m avec virage');
}

/** Progression (m) le long de l'itinéraire du point le plus proche de (x, z), et écart latéral. */
function along(path: number[], x: number, z: number): { s: number; off: number } {
  let best = Infinity;
  let bs = 0;
  let acc = 0;
  for (let i = 2; i < path.length; i += 2) {
    const ax = path[i - 2]!, az = path[i - 1]!, bx = path[i]!, bz = path[i + 1]!;
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
    if (d < best) { best = d; bs = acc + u * Math.sqrt(l2); }
    acc += Math.sqrt(l2);
  }
  return { s: bs, off: best };
}

/** Le joueur conduit le long de l'itinéraire (volant et pédales au clavier simulés), puis s'arrête. */
function driveRoute(t: T, v: Vehicle, path: number[], watch: (dt: number) => void): void {
  const input = t.ctx.input as { moveY: number; moveX: number };
  let total = 0;
  for (let i = 2; i < path.length; i += 2) total += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
  for (let k = 0; k < 2400; k++) {
    const pos = along(path, v.x, v.z);
    const left = total - pos.s;
    if (left < 6) break;
    // point visé 14 m plus loin sur l'itinéraire
    let target = pos.s + 14;
    let acc = 0;
    let tx = path[path.length - 2]!, tz = path[path.length - 1]!;
    for (let i = 2; i < path.length; i += 2) {
      const l = Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
      if (acc + l >= target) {
        const u = (target - acc) / (l || 1);
        tx = path[i - 2]! + (path[i]! - path[i - 2]!) * u;
        tz = path[i - 1]! + (path[i + 1]! - path[i - 1]!) * u;
        break;
      }
      acc += l;
    }
    target = 0;
    const dx = tx - v.x, dz = tz - v.z;
    const fwd = dx * Math.sin(v.heading) + dz * Math.cos(v.heading);
    const right = -dx * Math.cos(v.heading) + dz * Math.sin(v.heading);
    const ang = Math.atan2(right, fwd);
    input.moveX = Math.max(-1, Math.min(1, ang * 2.2));
    const want = Math.abs(ang) > 0.5 ? 4 : left < 30 ? 4 : 9;
    input.moveY = v.speed < want ? 0.6 : v.speed > want + 2 ? -0.5 : 0;
    t.step(0.1);
    watch(0.1);
  }
  input.moveX = 0;
  for (let k = 0; k < 80 && Math.abs(v.speed) > 0.2; k++) {
    input.moveY = -1;
    t.step(0.1);
    watch(0.1);
  }
  input.moveY = 0;
}

async function setup(seed: number) {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start(CONFIG as never);
  const { ctx } = t;
  t.step(5);
  const core = ctx.service<CommandCore>('ui.command')!;
  const section = ctx.squads.list.find((s) => s.name === 'MISTRAL 1' && s.kind === 'section')!;
  expect(section).toBeTruthy();
  return { t, ctx, core, section, me: ctx.player.person()! };
}

describe('ordres « Me suivre à pied » et « Me suivre en colonne (véhicules) »', () => {
  it('« Me suivre à pied » : deux groupes désignés suivent le commandant qui marche, personne ne monte', async () => {
    const { t, ctx, core, me } = await setup(21);
    const groups = ['MISTRAL 1 ALFA', 'MISTRAL 1 BRAVO'].map((n) => ctx.squads.list.find((s) => s.name === n)!);
    expect(core.issue('suivre_pied', groups, null).ok).toBe(true);
    for (const g of groups) expect(g.order.type).toBe('suivre');
    for (let i = 0; i < 4; i++) walk(t, 6);
    t.step(8);
    // l'ordre passe à la radio (canal du commandement, après le message en cours)
    expect(ctx.radio.log.some((m) => /Me suivre à pied/.test(m.text))).toBe(true);
    const ids = walkers(ctx, groups.flatMap((g) => crew(ctx, g)));
    const far = ids.map((id) => Math.round(Math.hypot(ctx.people.get(id)!.x - me.x, ctx.people.get(id)!.z - me.z)));
    const aboard = ids.filter((id) => ctx.people.get(id)!.vehicleId !== 0).length;
    console.log(`à pied : joueur à (${Math.round(me.x)}, ${Math.round(me.z)}) ; ${aboard} à bord ; distances ${far.join(',')}`);
    expect(aboard).toBe(0);
    expect(Math.max(...far)).toBeLessThan(35);
  }, 600000);

  it('« Me suivre à pied » : le chef de groupe, par la roue d’ordres, est suivi par son groupe', async () => {
    const t = createTestContext({ seed: 24, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'chef_groupe', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { moyens: MEANS, 'crowd.none': true } } as never);
    const { ctx } = t;
    t.step(3);
    const core = ctx.service<CommandCore>('ui.command')!;
    const me = ctx.player.person()!;
    // la roue d'ordres vise l'unité du joueur
    const own = ctx.squads.get(core.scope().ownSquadId)!;
    expect(own.leaderId).toBe(me.id);
    expect(core.issue('suivre_pied', [own], null).ok).toBe(true);
    for (let i = 0; i < 4; i++) walk(t, 6);
    t.step(8);
    const ids = walkers(ctx, crew(ctx, own));
    const far = ids.map((id) => Math.round(Math.hypot(ctx.people.get(id)!.x - me.x, ctx.people.get(id)!.z - me.z)));
    console.log(`chef de groupe à pied : distances ${far.join(',')}`);
    expect(ids.every((id) => ctx.people.get(id)!.vehicleId === 0)).toBe(true);
    expect(Math.max(...far)).toBeLessThan(25);
  }, 600000);

  it('« Me suivre en colonne » : embarque, suit le VL sur 600 m (virage), se gare derrière, reste à bord ; puis « à pied »', async () => {
    const { t, ctx, core, section, me } = await setup(22);
    const ap = ctx.service<{ status(v: Vehicle): { mode: string; leaderId: number } }>('vehicles.autopilot')!;
    const ids = crew(ctx, section);
    const fleet = vans(ctx, section);
    expect(fleet.length).toBe(3);
    // ordre donné à pied, à côté des véhicules
    expect(core.issue('avec_moi', [section], null).ok).toBe(true);
    let boardedAt = -1;
    for (let i = 0; i < 40 && boardedAt < 0; i++) {
      t.step(2);
      if (ids.every((id) => ctx.people.get(id)!.vehicleId !== 0)) boardedAt = (i + 1) * 2;
    }
    t.step(2);
    const ready = ctx.radio.log.find((m) => /prête à vous suivre/.test(m.text));
    console.log(`colonne : à bord en ${boardedAt} s ; « ${ready ? ready.text : '—'} »`);
    expect(boardedAt).toBeGreaterThan(0);
    expect(boardedAt).toBeLessThanOrEqual(60);
    expect(ready).toBeTruthy();
    for (const v of fleet) expect(v.seats[0]).not.toBe(0);
    // les fourgons attendent, à l'arrêt, sans partir tant que le joueur est à pied
    for (const v of fleet) expect(Math.abs(v.speed)).toBeLessThan(0.5);

    // le commandant prend le volant du VL
    const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    if (vl.seats[0] !== 0) ctx.vehicles.exit(ctx.people.get(vl.seats[0])!);
    me.x = vl.x + 3; me.z = vl.z;
    expect(ctx.vehicles.enter(me, vl, 'driver')).toBe(true);
    vl.siren = 2;
    t.step(4);
    const path = pickRoute(ctx, vl);
    let minGap = Infinity;
    let overtook = 0;
    const x0 = vl.x, z0 = vl.z;
    driveRoute(t, vl, path, () => {
      const lead = along(path, vl.x, vl.z);
      // (au départ, les fourgons sont garés en bloc contre le VL : l'écart compte une fois le VL parti)
      const started = Math.hypot(vl.x - x0, vl.z - z0) > 20;
      for (const v of fleet) {
        const d = Math.hypot(v.x - vl.x, v.z - vl.z);
        if (started && d < minGap) minGap = d;
        const a = along(path, v.x, v.z);
        // un fourgon sur l'itinéraire, devant le VL : il l'a doublé
        if (a.off < 8 && a.s > lead.s + 3 && d < 60) overtook++;
      }
    });
    const end = along(path, vl.x, vl.z);
    // frein tenu à l'arrêt ; la colonne finit de se ranger derrière
    // (à l'arrêt, la touche de frein tenue enclenche la marche arrière : le VL reculait de 25 m dans sa propre colonne
    // pendant qu'elle finissait de se ranger — on ne freine que tant qu'il roule)
    const brake = (): void => { (ctx.input as { moveY: number }).moveY = vl.speed > 0.3 ? -1 : 0; };
    brake();
    for (let i = 0; i < 30; i++) {
      for (let k = 0; k < 20; k++) { t.step(0.1); brake(); }
      for (const v of fleet) minGap = Math.min(minGap, Math.hypot(v.x - vl.x, v.z - vl.z));
      if (fleet.every((v) => Math.hypot(v.x - vl.x, v.z - vl.z) < 110 && Math.abs(v.speed) < 0.3)) break;
    }
    (ctx.input as { moveY: number }).moveY = 0;
    const behind = fleet.map((v) => Math.round(Math.hypot(v.x - vl.x, v.z - vl.z)));
    const modes = fleet.map((v) => ap.status(v).mode);
    console.log(`trajet ${Math.round(end.s)} m ; fourgons à ${behind.join(', ')} m du VL (${modes.join(',')}) ; écart minimal ${minGap.toFixed(1)} m ; dépassements ${overtook} ; sirènes ${fleet.map((v) => v.siren).join(',')}`);
    expect(end.s).toBeGreaterThan(500);
    expect(overtook).toBe(0);
    // pare-chocs à pare-chocs : jamais au contact du VL (centres à plus de 6 m)
    expect(minGap).toBeGreaterThan(6);
    // six fourgons de la compagnie en file (intervalle de 9 m) : la section est dans les cent premiers mètres
    for (const d of behind) expect(d).toBeLessThan(110);
    for (const v of fleet) expect(along(path, v.x, v.z).s).toBeLessThan(end.s);

    // le joueur descend : la colonne reste garée derrière lui, l'unité à bord
    ctx.vehicles.exit(me);
    t.step(15);
    const still = ids.filter((id) => ctx.people.get(id)!.vehicleId !== 0).length;
    const parked = fleet.map((v) => Math.round(Math.hypot(v.x - vl.x, v.z - vl.z)));
    console.log(`joueur descendu : ${still}/${ids.length} à bord ; fourgons à ${parked.join(', ')} m`);
    expect(still).toBe(ids.length);
    for (const v of fleet) expect(Math.abs(v.speed)).toBeLessThan(0.5);

    // « Me suivre à pied » : ils descendent et suivent le joueur à pied
    expect(core.issue('suivre_pied', [section], null).ok).toBe(true);
    for (let i = 0; i < 20; i++) t.step(2);
    const feet = walkers(ctx, ids);
    const left = feet.filter((id) => ctx.people.get(id)!.vehicleId !== 0).length;
    console.log(`à pied : ${left} encore à bord ; ordre ${section.order.type}`);
    expect(left).toBe(0);
    expect(section.order.type).toBe('suivre');
    walk(t, 12);
    t.step(20);
    const far = feet.map((id) => Math.round(Math.hypot(ctx.people.get(id)!.x - me.x, ctx.people.get(id)!.z - me.z)));
    console.log(`suivent à pied : ${far.join(',')}`);
    // la section en colonne derrière lui ; le dernier sorti du fourgon le plus éloigné rattrape encore
    expect(far.filter((d) => d < 35).length).toBeGreaterThanOrEqual(Math.ceil(far.length * 0.85));
    expect(Math.max(...far)).toBeLessThan(60);
    // personne ne remonte
    expect(feet.every((id) => ctx.people.get(id)!.vehicleId === 0)).toBe(true);
  }, 900000);

  it('« Me suivre en colonne » : le joueur PASSAGER du VL conduit par son chauffeur — la section suit le VL', async () => {
    const { t, ctx, core, section, me } = await setup(25);
    const ap = ctx.service<{ status(v: Vehicle): { mode: string; leaderId: number; state: string }; driveTo(v: Vehicle, x: number, z: number, o?: unknown): boolean }>('vehicles.autopilot')!;
    const fleet = vans(ctx, section);
    expect(core.issue('avec_moi', [section], null).ok).toBe(true);
    for (let i = 0; i < 20; i++) t.step(2);
    const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    // le joueur sort d'abord le VL du stationnement en bloc (il conduit une centaine de mètres)…
    const driver = ctx.people.get(vl.seats[0])!;
    ctx.vehicles.exit(driver);
    me.x = vl.x + 3; me.z = vl.z;
    expect(ctx.vehicles.enter(me, vl, 'driver')).toBe(true);
    vl.siren = 2;
    const path = pickRoute(ctx, vl);
    const first: number[] = [];
    for (let i = 0, acc = 0; i < path.length; i += 2) {
      if (i > 0) acc += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
      first.push(path[i]!, path[i + 1]!);
      if (acc > 110) break;
    }
    driveRoute(t, vl, first, () => undefined);
    (ctx.input as { moveY: number }).moveY = -1;
    t.step(3);
    (ctx.input as { moveY: number }).moveY = 0;
    // … puis laisse le volant à son chauffeur et monte à côté de lui : le chauffeur conduit jusqu'au bout
    ctx.vehicles.exit(me);
    driver.x = vl.x + 3; driver.z = vl.z;
    expect(ctx.vehicles.enter(driver, vl, 'driver')).toBe(true);
    me.x = vl.x + 3; me.z = vl.z;
    // VL complet (l'état-major de la compagnie a pris les places libres quand le joueur a pris le volant) : un officier
    // descend et laisse la sienne à son commandant
    if (vl.seats.every((id) => id !== 0)) ctx.vehicles.exit(ctx.people.get(vl.seats[vl.seats.length - 1]!)!);
    expect(ctx.vehicles.enter(me, vl, 'passenger')).toBe(true);
    expect(vl.seats[0]).toBe(driver.id);
    expect(ap.driveTo(vl, path[path.length - 2]!, path[path.length - 1]!)).toBe(true);
    for (let i = 0; i < 60 && ap.status(vl).state !== 'arrive'; i++) t.step(2);
    for (let i = 0; i < 30; i++) {
      t.step(2);
      if (fleet.every((v) => Math.hypot(v.x - vl.x, v.z - vl.z) < 110 && Math.abs(v.speed) < 0.3)) break;
    }
    const behind = fleet.map((v) => Math.round(Math.hypot(v.x - vl.x, v.z - vl.z)));
    console.log(`passager : VL ${ap.status(vl).state} à ${Math.round(along(path, vl.x, vl.z).s)} m du départ, ${vl.speed.toFixed(1)} m/s ; fourgons à ${behind.join(', ')} m (${fleet.map((v) => ap.status(v).mode).join(',')}) ; sirènes ${fleet.map((v) => v.siren).join(',')}`);
    expect(along(path, vl.x, vl.z).s).toBeGreaterThan(500);
    for (const d of behind) expect(d).toBeLessThan(110);
    expect(fleet.every((v) => v.siren === 2)).toBe(true);
    // le joueur descend : la colonne reste à l'arrêt, l'unité à bord
    ctx.vehicles.exit(me);
    t.step(10);
    for (const v of fleet) expect(Math.abs(v.speed)).toBeLessThan(0.5);
    expect(crew(ctx, section).every((id) => ctx.people.get(id)!.vehicleId !== 0)).toBe(true);
  }, 900000);

  it('chef de groupe : « en colonne », son groupe embarque ; il conduit le fourgon puis descend, le groupe reste à bord', async () => {
    const t = createTestContext({ seed: 27, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'chef_groupe', place: 'essai', x: -10, z: 15, crowdSize: 0, extra: { moyens: MEANS, 'crowd.none': true } } as never);
    const { ctx } = t;
    t.step(3);
    const core = ctx.service<CommandCore>('ui.command')!;
    const me = ctx.player.person()!;
    const own = ctx.squads.get(core.scope().ownSquadId)!;
    const van = ctx.vehicles.get(own.vehicleId)!;
    expect(van).toBeTruthy();
    expect(core.issue('avec_moi', [own], null).ok).toBe(true);
    for (let i = 0; i < 20; i++) t.step(2);
    const ids = crew(ctx, own);
    expect(ids.filter((id) => ctx.people.get(id)!.vehicleId === van.id).length).toBe(ids.length);
    // il prend le volant (le conducteur lui cède la place) et roule
    me.x = van.x + 3; me.z = van.z;
    expect(ctx.vehicles.enter(me, van, 'driver')).toBe(true);
    const input = ctx.input as { moveY: number };
    input.moveY = 0.6; t.step(8); input.moveY = -1; t.step(4); input.moveY = 0;
    ctx.vehicles.exit(me);
    t.step(10);
    const aboard = ids.filter((id) => ctx.people.get(id)!.vehicleId !== 0).length;
    console.log(`chef de groupe en colonne : ${aboard}/${ids.length} à bord après sa descente`);
    expect(aboard).toBe(ids.length);
    // « Me suivre à pied » : ils descendent (le conducteur reste au volant)
    expect(core.issue('suivre_pied', [own], null).ok).toBe(true);
    for (let i = 0; i < 10; i++) t.step(2);
    expect(walkers(ctx, ids).every((id) => ctx.people.get(id)!.vehicleId === 0)).toBe(true);
    expect(own.order.type).toBe('suivre');
  }, 600000);

  it('« en colonne » : un groupe de la section qui reçoit un autre ordre quitte la colonne (il n’est pas réembarqué)', async () => {
    const { t, ctx, core, section, me } = await setup(22);
    expect(core.issue('avec_moi', [section], null).ok).toBe(true);
    const ids = crew(ctx, section);
    for (let i = 0; i < 30 && !ids.every((id) => ctx.people.get(id)!.vehicleId !== 0); i++) t.step(2);
    const alfa = ctx.squads.list.find((s) => s.name === 'MISTRAL 1 ALFA')!;
    const van = ctx.vehicles.get(alfa.vehicleId)!;
    // « ALFA, tenez la position » : ce groupe seul quitte la colonne
    expect(core.issue('tenir', [alfa], null).ok).toBe(true);
    t.step(30);
    const x0 = van.x, z0 = van.z;
    // le commandant prend le volant du VL et roule
    const vl = ctx.vehicles.list.filter((v) => v.kind === 'vl_commandement').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    if (vl.seats[0] !== 0) ctx.vehicles.exit(ctx.people.get(vl.seats[0])!);
    me.x = vl.x + 3; me.z = vl.z;
    expect(ctx.vehicles.enter(me, vl, 'driver')).toBe(true);
    const input = ctx.input as { moveY: number };
    input.moveY = 0.5; t.step(12); input.moveY = 0;
    t.step(6);
    const aboard = walkers(ctx, crew(ctx, alfa)).filter((id) => ctx.people.get(id)!.vehicleId !== 0).length;
    console.log(`ALFA détaché : ordre ${alfa.order.type}, ${aboard} à bord, fourgon à ${Math.round(Math.hypot(van.x - x0, van.z - z0))} m de sa place`);
    expect(alfa.order.type).toBe('tenir');
    expect(Math.hypot(van.x - x0, van.z - z0)).toBeLessThan(5);
  }, 600000);

  it('l’ordre « en colonne » ne survit pas à la fin de la session', async () => {
    const { t, ctx, core, section } = await setup(26);
    const follow = ctx.service<{ inColumn(id: number): boolean }>('session.follow')!;
    expect(core.issue('avec_moi', [section], null).ok).toBe(true);
    expect(follow.inColumn(section.id)).toBe(true);
    t.step(10);
    await t.start(CONFIG as never);
    t.step(5);
    const again = t.ctx.squads.list.find((s) => s.name === 'MISTRAL 1' && s.kind === 'section')!;
    expect(follow.inColumn(again.id)).toBe(false);
    expect(again.order.type).not.toBe('embarquer');
  }, 600000);

  it('une unité sans véhicule le dit à la radio et suit à pied', async () => {
    const { t, ctx, core, me } = await setup(23);
    const s = ctx.squads.create('groupe', 'police', 'ESSAI', 0);
    const others = ctx.people.list.filter((p) => p.faction === 'police' && !p.isPlayer && p.vehicleId === 0).slice(0, 3);
    // trois agents détachés en groupe à pied, sous les ordres du commandant (rattaché à sa compagnie)
    for (const p of others) ctx.squads.addMember(s.id, p.id);
    s.parentId = me.squadId;
    ctx.squads.setLeader(s.id, others[0]!.id);
    core.invalidateScope();
    expect(core.issue('avec_moi', [s], null).ok).toBe(true);
    t.step(30);
    const msg = ctx.radio.log.find((m) => /Pas de véhicule disponible/.test(m.text));
    expect(msg).toBeTruthy();
    expect(s.order.type).toBe('suivre');
  }, 600000);
});
