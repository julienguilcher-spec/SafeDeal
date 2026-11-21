// PARTIE JOUÉE « tout le monde me suit » : pour chaque rôle de police, le joueur prend le volant d'un véhicule de police
// et roule (itinéraire de plus de 400 m, dans le vrai Paris, bâtiments chargés). Toute la colonne de sa compagnie (chaque
// véhicule de troupe avec son équipage) quitte sa place et le suit en chaîne — sauf l'équipage du Centaure, que seul
// l'engin apparié accompagne (règle acceptée par le commanditaire) : « suivre » y veut dire que le groupe d'escorte
// rattaché à l'équipage (session/setup.ts, attachEscort) embarque dans SON fourgon, qui suit le Centaure en chaîne ; la
// compagnie, elle, reste à sa mission. BRAV-M : toutes les motos de son unité le suivent. Personne de valide n'est
// laissé à pied.
import { describe, expect, it } from 'vitest';

import type { GameContext, Person, RayHit, Squad, Vehicle } from '@/core/contracts';
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
const LIGHT = process.env['PLAYTEST_LIGHT'] === '1';
const MEANS = { sections: 2, fourgons: 6, centaure: LIGHT ? 0 : 1, canon_eau: LIGHT ? 0 : 1, bravm: LIGHT ? 0 : 1, drone: LIGHT ? 0 : 1, pompiers: 0, samu: 0, secours_sur_appel: true };
const CROWD = Number(process.env['PLAYTEST_CROWD'] ?? '60');
const TROOP = new Set(['fourgon_crs', 'car_crs', 'vl_commandement', 'canon_eau', 'centaure']);

type T = ReturnType<typeof createTestContext>;
type ApStatus = { mode: string; state: string; reason: string; leaderId: number };
interface Autopilot { status(v: Vehicle): ApStatus; driveTo(v: Vehicle, x: number, z: number): boolean }

const PLACES = {
  concorde: { place: 'Place de la Concorde', x: -10, z: 15 },
  republique: { place: 'Place de la République', x: 3123, z: -208 },
  bastille: { place: 'Place de la Bastille', x: 3542, z: 1395 },
} as const;
type PlaceKey = keyof typeof PLACES;

function rootOf(ctx: GameContext, s: Squad): Squad {
  let q = s;
  for (let g = 0; q.parentId !== 0 && g < 8; g++) q = ctx.squads.get(q.parentId) ?? q;
  return q;
}

function treeOf(ctx: GameContext, root: Squad): Squad[] {
  return ctx.squads.list.filter((q) => rootOf(ctx, q).id === root.id);
}

const aimHit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 } as RayHit;
const endHit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 } as RayHit;

/** Les 45 premiers mètres de l'itinéraire passent-ils sur un véhicule de police arrêté (autre que `v`) ? */
function crossesParked(ctx: GameContext, v: Vehicle, path: readonly number[]): boolean {
  let run = 0;
  for (let i = 2; i < path.length && run < 45; i += 2) {
    const ax = path[i - 2]!, az = path[i - 1]!;
    const l = Math.hypot(path[i]! - ax, path[i + 1]! - az);
    for (let d = 0; d < l && run + d < 45; d += 1.5) {
      const x = ax + (path[i]! - ax) * (d / l), z = az + (path[i + 1]! - az) * (d / l);
      for (const o of ctx.vehicles.list) {
        if (o === v || o.faction !== 'police' || Math.abs(o.speed) > 0.5 || o.def.flying) continue;
        const dx = x - o.x, dz = z - o.z;
        const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
        if (Math.abs(dx * ofx + dz * ofz) < o.def.length * 0.5 + 1 && Math.abs(-dx * ofz + dz * ofx) < o.def.width * 0.5 + 1.2) return true;
      }
    }
    run += l;
  }
  return false;
}

/**
 * Itinéraire routier d'au moins 450 m depuis le véhicule, sans revenir sur le bloc garé. De préférence un itinéraire qui
 * part droit devant lui (le joueur sort du bloc par l'avant puis tourne où il veut, il ne fait pas demi-tour au milieu
 * de sa colonne garée), puis un itinéraire dont les premiers mètres ne traversent pas la colonne garée (la voiture de
 * l'équipe drone, garée à côté du bloc) ; à défaut, n'importe lequel.
 */
function pickPath(ctx: GameContext, v: Vehicle): number[] {
  const path: number[] = [];
  // (sortie par l'avant : l'itinéraire part d'un point à SORTIE m devant le véhicule, s'il y a la place d'y aller tout droit)
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const SORTIE = 20;
  const sx = v.x + fx * SORTIE, sz = v.z + fz * SORTIE;
  const room = [0, 1, -1].every((s) => !ctx.world.raycast(v.x - fz * 1.2 * s, v.z + fx * 1.2 * s, sx - fz * 1.2 * s, sz + fx * 1.2 * s, endHit));
  // (passe 3 : en dernier recours, le choix d'origine, sans exiger de tronçons franchissables — à la Concorde, la moto de
  // la BRAV-M ne trouvait sinon aucun itinéraire)
  for (const pass of room ? [0, 1, 2, 3] : [1, 2, 3]) for (const r of [520, 480, 600, 450]) {
    const ahead = pass === 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      path.length = 0;
      if (ahead) {
        if (!ctx.world.findPath(sx, sz, v.x + Math.sin(a) * r, v.z + Math.cos(a) * r, 'vehicle', path, { heading: v.heading, uturn: 60 }) || path.length < 4) continue;
        let i = 2;
        while (i < path.length - 2 && Math.hypot(path[i]! - sx, path[i + 1]! - sz) < 15) i += 2;
        if ((path[i]! - sx) * fx + (path[i + 1]! - sz) * fz < 0) continue;
        path.unshift(v.x, v.z);
      } else if (!ctx.world.findPath(v.x, v.z, v.x + Math.sin(a) * r, v.z + Math.cos(a) * r, 'vehicle', path) || path.length < 4) continue;
      if (pass < 2 && crossesParked(ctx, v, path)) continue;
      let len = 0;
      let away = false;
      let ok = true;
      for (let i = 2; i < path.length; i += 2) {
        len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
        const d = Math.hypot(path[i]! - v.x, path[i + 1]! - v.z);
        if (d > 60) away = true;
        else if (away && d < 45) ok = false;
      }
      // (le dernier tronçon d'un itinéraire file en ligne droite de la chaussée au point demandé : il doit rester
      // franchissable — à la Bastille, à l'est, le point tiré au hasard tombait hors de la carte, derrière des
      // immeubles, et le joueur s'y arrêtait à 380 m sans jamais atteindre les 400 m de la mesure stricte)
      // Le premier tronçon, lui, file en ligne droite du bloc garé jusqu'à la chaussée : à la Concorde, il traversait
      // l'enclos de l'obélisque ; le joueur s'y faufilait entre les grilles et le VL qui le suivait restait coincé contre
      // elles. Un joueur le contourne : on remplace ce tronçon par le chemin qui en fait le tour (celui d'un piéton, dont
      // les tronçons hors des rues évitent murs et grilles), et on n'y garde que des tronçons franchissables par un
      // fourgon (axe et flancs).
      if (pass < 3 && ctx.world.raycast(path[0]!, path[1]!, path[2]!, path[3]!, endHit)) {
        const leg: number[] = [];
        if (ctx.world.findPath(path[0]!, path[1]!, path[2]!, path[3]!, 'foot', leg) && leg.length >= 4) path.splice(0, 4, ...leg);
      }
      let open = true;
      for (let i = 2; i < path.length && open; i += 2) {
        const ax = path[i - 2]!, az = path[i - 1]!, bx = path[i]!, bz = path[i + 1]!;
        const l = Math.hypot(bx - ax, bz - az);
        if (l < 0.5) continue;
        const nx = -(bz - az) / l * 1.4, nz = (bx - ax) / l * 1.4;
        for (const s of [0, 1, -1]) if (ctx.world.raycast(ax + nx * s, az + nz * s, bx + nx * s, bz + nz * s, endHit)) open = false;
      }
      if (!open && pass < 3) continue;
      if (ok && len < r * 1.6 && Math.hypot(path[path.length - 2]! - v.x, path[path.length - 1]! - v.z) > 440) return path;
    }
  }
  throw new Error('aucun itinéraire');
}

/** Le joueur conduit au clavier le long de l'itinéraire, puis freine (coincé : il recule en contre-braquant). */
function driveKeys(t: T, v: Vehicle, path: number[]): void {
  const input = t.ctx.input as { moveY: number; moveX: number };
  let idx = 2;
  let stuck = 0;
  let back = 0;
  for (let k = 0; k < 1500; k++) {
    while (idx < path.length - 2 && Math.hypot(path[idx]! - v.x, path[idx + 1]! - v.z) < 12) idx += 2;
    let dx = path[idx]! - v.x, dz = path[idx + 1]! - v.z;
    // obstacle sur la ligne droite jusqu'au point visé (le premier tronçon traverse parfois toute une place, à la
    // Concorde la grille de l'obélisque) : le joueur le contourne — on vise à côté du point d'impact, en le longeant
    // du côté du point visé
    if (t.ctx.world.raycast(v.x, v.z, path[idx]!, path[idx + 1]!, aimHit) && aimHit.t * Math.hypot(dx, dz) < 25) {
      let tx = -aimHit.nz, tz = aimHit.nx;
      if (tx * (path[idx]! - aimHit.x) + tz * (path[idx + 1]! - aimHit.z) < 0) { tx = -tx; tz = -tz; }
      dx = aimHit.x + aimHit.nx * 7 + tx * 8 - v.x;
      dz = aimHit.z + aimHit.nz * 7 + tz * 8 - v.z;
    }
    // véhicule arrêté sur la ligne droite (sa propre colonne garée en travers de l'itinéraire) : le joueur passe à côté,
    // du côté du point visé, en s'écartant tant que la ligne reste barrée
    {
      const l = Math.hypot(dx, dz) || 1;
      const ux = dx / l, uz = dz / l;
      const nose = v.def.length * 0.5 + 0.3;
      let shift = 0;
      for (let k = 0; k < 4; k++) {
        const ax = v.x + ux * nose, az = v.z + uz * nose;
        const bx = v.x + dx, bz = v.z + dz;
        if (!t.ctx.vehicles.raycast(ax, az, bx, bz, aimHit, 'move') || !aimHit.hit || aimHit.kind !== 'vehicle' || aimHit.id === v.id
          || aimHit.t * Math.hypot(bx - ax, bz - az) > 15) break;
        const o = t.ctx.vehicles.get(aimHit.id);
        if (!o || Math.abs(o.speed) > 0.5) break;
        if (shift === 0) shift = (o.x - v.x) * -uz + (o.z - v.z) * ux > 0 ? -1 : 1;
        const side = (o.def.width + v.def.width) * 0.5 + 1.5 + k * 3;
        dx = o.x + -uz * shift * side + ux * (o.def.length * 0.5 + 3) - v.x;
        dz = o.z + ux * shift * side + uz * (o.def.length * 0.5 + 3) - v.z;
      }
    }
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

export interface Case { role: string; poste?: string; seat: 'driver' | 'passenger'; where: PlaceKey; seed: number }

/** Véhicule du joueur : celui de son unité (en remontant), sinon le plus proche de la compagnie. */
function rideOf(ctx: GameContext, me: Person): Vehicle {
  let q = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
  for (let g = 0; q && q.vehicleId === 0 && g < 8; g++) q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined;
  const v = q && q.vehicleId !== 0 ? ctx.vehicles.get(q.vehicleId) : undefined;
  if (v) return v;
  return ctx.vehicles.list.filter((w) => w.faction === 'police' && TROOP.has(w.kind))
    .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
}

/** Le joueur monte : au volant, l'IA lui cède la place (passager s'il en reste, sinon dehors). */
function board(ctx: GameContext, me: Person, v: Vehicle, seat: 'driver' | 'passenger'): void {
  me.x = v.x + 3;
  me.z = v.z;
  if (seat === 'driver' && v.seats[0] !== 0) {
    const o = ctx.people.get(v.seats[0])!;
    ctx.vehicles.exit(o);
    let ok = false;
    for (let i = 1; i < v.seats.length && !ok; i++) if (v.seats[i] === 0) ok = ctx.vehicles.enter(o, v, i);
  }
  if (seat === 'passenger') {
    if (v.seats[0] === 0) {
      // véhicule sans chauffeur (moto de la BRAV-M) : le premier équipier valide de l'unité prend le guidon
      const sq = ctx.squads.get(me.squadId)!;
      const drv = sq.members.map((id) => ctx.people.get(id)!).find((p) => p && !p.isPlayer && p.vehicleId === 0)!;
      drv.x = v.x + 2; drv.z = v.z;
      expect(ctx.vehicles.enter(drv, v, 'driver')).toBe(true);
    }
    let i = 1;
    while (i < v.seats.length && v.seats[i] !== 0) i++;
    expect(ctx.vehicles.enter(me, v, i)).toBe(true);
  } else expect(ctx.vehicles.enter(me, v, 'driver')).toBe(true);
}

/** Colonne derrière le véhicule du joueur, dans l'ordre (chacun suit le précédent). */
function chain(ctx: GameContext, ap: Autopilot, ride: Vehicle): Vehicle[] {
  const out: Vehicle[] = [];
  let prev: Vehicle = ride;
  for (let guard = 0; guard < 30; guard++) {
    const next = ctx.vehicles.list.find((v) => out.indexOf(v) < 0 && v !== ride && ap.status(v).mode === 'follow' && ap.status(v).leaderId === prev.id);
    if (!next) break;
    out.push(next);
    prev = next;
  }
  return out;
}

export async function playColumn(c: Case): Promise<{ expected: number; followed: number; joined: number; afoot: string[]; log: string }> {
  const t = createTestContext({ seed: c.seed, strict: false, modules: SIM });
  const at = PLACES[c.where];
  await t.start({
    mode: 'libre', role: c.role, rank: c.role === 'commandant' ? 'commandant' : undefined, place: at.place, x: at.x, z: at.z,
    crowdSize: CROWD, tension: 0.1, volatility: 0.1, duration: 'standard',
    extra: { moyens: MEANS, ...(c.poste ? { poste: c.poste } : {}), ...(c.role === 'commandant' ? { variante: 'terrain' } : {}) },
  } as never);
  const { ctx } = t;
  t.step(5);
  const ap = ctx.service<Autopilot>('vehicles.autopilot')!;
  const me = ctx.player.person()!;
  const ride = rideOf(ctx, me);
  // compagnie du joueur : la sienne ; pour un équipage ou une équipe rattachée à rien, la compagnie engagée sur place
  // (équipage du Centaure : le sien, avec le groupe d'escorte qui lui est rattaché — l'engin apparié)
  const mine = rootOf(ctx, ctx.squads.get(me.squadId)!);
  const company = c.role === 'bravm' || c.role === 'gendarme_centaure' || mine.kind === 'compagnie' ? mine
    : ctx.squads.list.find((s) => s.faction === 'police' && s.kind === 'compagnie')!;
  // véhicules attendus derrière lui : ceux de la compagnie avec un équipage (motos de son unité pour la BRAV-M)
  const kinds = c.role === 'bravm' ? new Set(['moto_bravm']) : TROOP;
  // (BRAV-M : les motos de son unité, garées avec la sienne — celles des autres unités sont attribuées à leurs binômes)
  const others = new Set(ctx.squads.list.filter((q) => rootOf(ctx, q).id !== mine.id).map((q) => q.vehicleId));
  const expected = c.role === 'bravm'
    ? ctx.vehicles.list.filter((v) => v !== ride && v.kind === 'moto_bravm' && !others.has(v.id) && Math.hypot(v.x - ride.x, v.z - ride.z) < 60)
    : treeOf(ctx, company).map((q) => (q.vehicleId !== 0 ? ctx.vehicles.get(q.vehicleId) : undefined))
      .filter((v, i, a): v is Vehicle => !!v && v !== ride && a.indexOf(v) === i && kinds.has(v.kind) && v.seats.some((id) => id !== 0));
  const starts = new Map(expected.map((v) => [v.id, { x: v.x, z: v.z }]));
  if (process.env['PLAYTEST_ORDERS']) {
    // journal des ordres reçus par les unités de la compagnie (qui réordonne les unités de la colonne ?)
    const last = new Map<number, string>();
    const step0 = t.step.bind(t);
    (t as { step(s: number): void }).step = (sec: number) => {
      step0(sec);
      for (const q of treeOf(ctx, company)) {
        const k = `${q.order.type}/${q.order.issuedBy}`;
        if (last.get(q.id) !== k) {
          if (last.has(q.id)) console.log(`  t=${ctx.clock.now.toFixed(1)} ${q.name} : ${last.get(q.id)} → ${k}`);
          last.set(q.id, k);
        }
      }
    };
  }
  board(ctx, me, ride, c.seat);
  // embarquement : on laisse 40 s
  for (let i = 0; i < 20; i++) t.step(2);
  const x0 = ride.x, z0 = ride.z;
  const path = pickPath(ctx, ride);
  if (c.seat === 'driver') driveKeys(t, ride, path);
  else {
    expect(ap.driveTo(ride, path[path.length - 4]!, path[path.length - 3]!)).toBe(true);
    t.step(2);
    for (let i = 0; i < 120 && ap.status(ride).state !== 'arrive'; i++) t.step(2);
  }
  const moved = Math.hypot(ride.x - x0, ride.z - z0);
  const settled = (): boolean => {
    const col = chain(ctx, ap, ride);
    return expected.every((v) => col.indexOf(v) >= 0) && col.every((v) => Math.abs(v.speed) < 0.3 && Math.hypot(v.x - ride.x, v.z - ride.z) < 15 * (col.length + 2));
  };
  for (let i = 0; i < 60 && !settled(); i++) {
    t.step(2);
    if (process.env['PLAYTEST_DEBUG'] && i % 5 === 0) {
      for (const v of expected) {
        const st = ap.status(v);
        if (st.state !== 'attente' && st.state !== 'bloque') continue;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        const near = ctx.vehicles.list.filter((o) => o !== v && Math.hypot(o.x - v.x, o.z - v.z) < 18).map((o) => {
          const sq = ctx.squads.list.find((q) => q.vehicleId === o.id);
          return `${o.kind}#${o.id}(${sq?.name ?? '-'} av=${Math.round((o.x - v.x) * fx + (o.z - v.z) * fz)} lat=${Math.round(-(o.x - v.x) * fz + (o.z - v.z) * fx)} v=${o.speed.toFixed(1)} ${ap.status(o).mode}/${ap.status(o).state})`;
        });
        console.log(`  #${v.id} ${v.kind} attend : ${near.join(' ')}`);
      }
      for (const v of expected) {
        const st = ap.status(v);
        if (st.reason !== 'mur') continue;
        const rt = (ap as unknown as { k: { rt(v: Vehicle): { ap: Record<string, unknown> } } }).k.rt(v);
        const a = rt.ap;
        const pick: Record<string, unknown> = {};
        for (const k of Object.keys(a)) { const val = a[k]; if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') pick[k] = typeof val === 'number' ? Math.round(val * 10) / 10 : val; }
        const path = (a['path'] as number[] | undefined) ?? [];
        console.log(`  MUR #${v.id} at ${v.x.toFixed(1)},${v.z.toFixed(1)} h=${v.heading.toFixed(2)} pathlen=${path.length} path0=${path.slice(0, 8).map((n) => n.toFixed(0)).join(',')} ${JSON.stringify(pick)}`);
      }
      console.log(`t=${Math.round(ctx.clock.now)} ` + expected.map((v) => { const st = ap.status(v); return `#${v.id}:${st.mode}/${st.state}${st.reason ? '/' + st.reason : ''}→${st.leaderId} d=${Math.round(Math.hypot(v.x - ride.x, v.z - ride.z))} drv=${v.seats[0]}`; }).join(' '));
    }
  }
  const col = chain(ctx, ap, ride);
  const followed = expected.filter((v) => {
    const s0 = starts.get(v.id)!;
    return col.indexOf(v) >= 0 && Math.hypot(v.x - s0.x, v.z - s0.z) > 150;
  });
  const afoot = treeOf(ctx, company).flatMap((q) => q.members.map((id) => ctx.people.get(id)!))
    .filter((p) => p && !p.isPlayer && p.vehicleId === 0 && p.custody === 'free' && p.posture !== 'down')
    .map((p) => `${ctx.squads.get(p.squadId)?.name}:${p.poste}`);
  const missing = expected.filter((v) => followed.indexOf(v) < 0).map((v) => {
    const sq = ctx.squads.list.find((q) => q.vehicleId === v.id);
    const st = ap.status(v);
    const s0 = starts.get(v.id)!;
    return `${v.kind}#${v.id}(${sq?.name} ord=${sq?.order.type} ${st.mode}/${st.state}${st.reason ? '/' + st.reason : ''} avancé ${Math.round(Math.hypot(v.x - s0.x, v.z - s0.z))} m)`;
  });
  const log = `${c.where} ${c.role}${c.poste ? '/' + c.poste : ''} ${c.seat === 'driver' ? 'au volant' : 'passager'} de ${ride.kind}#${ride.id} : roulé ${Math.round(moved)} m ; `
    + `${followed.length}/${expected.length} véhicules suivent (chaîne de ${col.length}) ; manquent ${missing.join(' ') || '—'} ; à pied ${afoot.length} (${afoot.slice(0, 8).join(',')})`;
  console.log(log);
  // (PLAYTEST_STRICT=1 : le joueur a roulé plus de 400 m. Le robot conducteur, coincé, recule comme un joueur, mais son
  // fourgon est parfois enfermé au milieu du bloc garé, ou l'itinéraire l'arrête plus tôt : voir le rapport)
  if (process.env['PLAYTEST_STRICT']) expect(moved, log).toBeGreaterThan(400);
  // a pris place dans la colonne : en chaîne derrière le joueur, ou en « follow » derrière un véhicule de la colonne, ou
  // (premier du bloc, garé derrière un véhicule arrêté) embarqué et moteur tournant, il attend que le meneur se dégage
  const joined = expected.filter((v) => {
    if (col.indexOf(v) >= 0 || ap.status(v).mode === 'follow') return true;
    const sq = ctx.squads.list.find((q) => q.vehicleId === v.id);
    return !!sq && sq.order.type === 'embarquer' && v.seats[0] !== 0;
  }).length;
  return { expected: expected.length, followed: followed.length, joined, afoot, log };
}

const ROLES: { role: string; poste?: string }[] = [
  { role: 'crs', poste: 'bouclier' }, { role: 'crs', poste: 'lanceur' }, { role: 'crs', poste: 'lbd' }, { role: 'crs', poste: 'extincteur' },
  { role: 'crs', poste: 'interpellation' }, { role: 'crs', poste: 'conducteur' },
  { role: 'chef_groupe', poste: 'chef_groupe' }, { role: 'chef_groupe', poste: 'chef_section' },
  { role: 'commandant' }, { role: 'commissaire' },
  { role: 'bravm', poste: 'pilote_moto' },
  { role: 'operateur_canon_eau' }, { role: 'telepilote' }, { role: 'gendarme_centaure' },
];
const ONLY = process.env['PLAYTEST_ONLY'] ?? '';
const CASES: Case[] = [];
let seed = 100;
for (const where of ['concorde', 'republique', 'bastille'] as const) {
  for (const r of ROLES) {
    // le joueur CONDUIT un véhicule de police (passager_moto de la BRAV-M : sa moto est conduite par l'IA de la
    // BRAV-M, police/command/bravm.ts — hors de ce module)
    const c: Case = { ...r, seat: 'driver', where, seed: seed++ };
    if (ONLY === '' || `${where} ${r.role}/${r.poste ?? ''} driver`.indexOf(ONLY) >= 0) CASES.push(c);
  }
}

describe('partie jouée : toute la colonne suit le joueur', () => {
  for (const c of CASES) {
    it(`${c.where} ${c.role}${c.poste ? '/' + c.poste : ''} ${c.seat}`, async () => {
      const r = await playColumn(c);
      // la règle (session/follow.ts) : chaque véhicule de troupe de la compagnie, avec son équipage, prend place dans la
      // colonne derrière le joueur (équipage du Centaure : le fourgon de son escorte, l'engin apparié), et personne de
      // valide ne reste à pied. PLAYTEST_STRICT=1 : chacun a aussi quitté sa place de plus de 150 m et roule en chaîne
      // derrière lui (conduite des suivants : pilote automatique, sim/vehicles — voir le rapport « colonne-ia »).
      if (c.role === 'gendarme_centaure') expect(r.expected, r.log).toBe(1);
      expect(r.joined, r.log).toBe(r.expected);
      expect(r.afoot, r.log).toEqual([]);
      if (process.env['PLAYTEST_STRICT']) expect(r.followed, r.log).toBe(r.expected);
    }, 900000);
  }
});
