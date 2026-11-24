// La BRAV-M obéit au joueur comme les autres unités (ordres directs, spécification §4.1, acceptation 8 et 9). Robots
// des diagnostics du terrain (diag-terrain.md T4, T5, J1), commandant, place de la Concorde, graine 21, ordres donnés
// comme le joueur les donne (CommandCore.issue : carte, roue, Entrée — byPlayer) :
//   T4  BRAV-M à pied, « Avancer » à 50 m : elle y va à pied, au trot, en moins de 40 s (elle retournait à ses motos,
//       roulait deux secondes, puis « Arrêtés à 50 mètres du point, accès bloqué ») ;
//   J1  BRAV-M en selle, point à 30 m : pied à terre sur place, la suite à pied (la colonne roulait 70 s sans arriver) ;
//   400 m : en selle, elle y roule et arrive à moins de 30 m — ou, bloquée, met pied à terre et finit à pied ;
//   T5  « Interpeller » un auteur de fait constaté à 125 m : un binôme est sur lui (moins de 25 m) en moins de 45 s, reste
//       sur lui quand il s'enfuit, et l'interpelle (jamais auparavant en 180 s). L'objectif de 60 s de la spécification
//       n'est pas tenu ici : un fuyard court à 4,6 m/s (crowd/tuning RUN_FLEE), un opérateur casqué à 4,3 m/s
//       (police/tuning SPEED_RUN) — il n'est rattrapé qu'au bout de sa fuite (voir le compte rendu du paquet) ;
//   foule (cdt-04 « vers moi ») : BRAV-M à pied, ses machines au milieu de la foule, appelée « Avec moi » à 250 m — elle
//       vient à pied tout de suite (elle retournait à ses motos, mettait une minute et demie à remonter en selle au
//       milieu des manifestants, puis calait) ; et une remontée en selle qui n'en finit pas dans la foule est
//       abandonnée au bout de 30 s, la suite à pied ;
// et, à chaque échantillon jusqu'à la fin, l'ordre affiché (Squad.order.type) est celui que le joueur a donné — jamais
// « embarquer » ni « colonne » pendant qu'elle remonte en selle ou approche (la puce disait « MONTE »).
import { describe, expect, it } from 'vitest';

import type { GameContext, Person, Squad } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as env } from '@/env';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { BRAVM_REMOUNT_MIN, BRAVM_RIDE_MIN, motorizes } from '@/ui/command/direct/travel';

const MODULES = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, maps, command];
/** Au-delà, les opérateurs ne sont plus « aux machines » (bravm.ts MOUNT_REACH) (m). */
const MOUNT_GAP = 40;
const MEANS = { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

type T = ReturnType<typeof createTestContext>;
interface Special { stage: string; order: string }

const CONCORDE = { place: 'Place de la Concorde', x: -10, z: 15 };
const REPUBLIQUE = { place: 'Place de la République', x: 3123, z: -208 };

async function concorde(at: { place: string; x: number; z: number } = CONCORDE): Promise<{ t: T; ctx: GameContext; core: CommandCore; bravm: Squad; me: Person }> {
  const t = createTestContext({ seed: 21, strict: false, modules: MODULES });
  await t.start({
    mode: 'libre', role: 'commandant', rank: 'commandant', place: at.place, x: at.x, z: at.z, crowdSize: 300, tension: 0.4,
    volatility: 0.3, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
  } as never);
  t.step(3);
  const ctx = t.ctx;
  const core = ctx.service<CommandCore>('ui.command')!;
  const bravm = ctx.squads.list.find((q) => q.name === 'FAUCON 1')!;
  expect(bravm, 'la BRAV-M du dispositif').toBeTruthy();
  return { t, ctx, core, bravm, me: ctx.player.person()! };
}

function membersOf(ctx: GameContext, id: number, acc: Person[] = []): Person[] {
  const s = ctx.squads.get(id);
  if (!s) return acc;
  for (const m of s.members) {
    const p = ctx.people.get(m);
    if (p && !p.isPlayer) acc.push(p);
  }
  for (const k of ctx.squads.childrenOf(id)) membersOf(ctx, k.id, acc);
  return acc;
}

const operators = (ctx: GameContext, id: number): Person[] => membersOf(ctx, id).filter((p) => p.poste !== 'pilote_moto');
const special = (ctx: GameContext, id: number): Special | null => ctx.service<{ special(id: number): Special | null }>('police.command')!.special(id);
const motosOf = (ctx: GameContext, id: number) => {
  const ids = new Set(ctx.squads.list.filter((q) => q.vehicleId !== 0 && (q.id === id || q.parentId === id)).map((q) => q.vehicleId));
  return ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm' && ids.has(v.id));
};
const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : Infinity;
};

function pathLength(path: readonly number[]): number {
  let n = 0;
  for (let i = 2; i + 1 < path.length; i += 2) n += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
  return n;
}

/**
 * Un point à `dist` m de (x, z), loin de la foule si possible : au-delà de 100 m, sur une chaussée atteignable à moto
 * par un itinéraire d'au plus 1,5 fois la distance ; en deçà, un sol libre atteignable à pied.
 */
function roadPoint(ctx: GameContext, x: number, z: number, dist: number): { x: number; z: number } {
  const road = { x: 0, z: 0, roadClass: '' } as { x: number; z: number; roadClass: string };
  const path: number[] = [];
  let best: { x: number; z: number } | null = null;
  let bestCrowd = Infinity;
  const near = dist <= 100;
  for (let a = 0; a < 36; a++) {
    let tx = x + Math.sin((a * Math.PI) / 18) * dist;
    let tz = z + Math.cos((a * Math.PI) / 18) * dist;
    if (near) {
      if (!ctx.world.isFree(tx, tz, 1)) continue;
      if (!ctx.world.findPath(x, z, tx, tz, 'foot', path) || pathLength(path) > dist * 1.5) continue;
    } else {
      if (!ctx.world.nearestRoad(tx, tz, road as never, 40)) continue;
      if (['pedestrian', 'footway', 'service', 'steps', 'path'].includes(road.roadClass)) continue;
      tx = road.x;
      tz = road.z;
      const d = Math.hypot(tx - x, tz - z);
      if (d < dist * 0.8 || d > dist * 1.25) continue;
      if (!ctx.world.findPath(x, z, tx, tz, 'vehicle', path) || pathLength(path) > dist * 1.5) continue;
    }
    const crowdN = ctx.people.countIn(tx, tz, 40, (p) => p.faction === 'protest');
    if (crowdN < bestCrowd) {
      bestCrowd = crowdN;
      best = { x: tx, z: tz };
    }
  }
  expect(best, `un point à ${dist} m`).toBeTruthy();
  return best!;
}

/**
 * Avance la partie par pas de 0,5 s jusqu'à `done` (au plus `seconds`), en vérifiant à chaque pas que l'ordre affiché
 * est `type`. Retourne l'instant (s depuis le début) où `done` est vrai, ou −1.
 */
function run(t: T, squad: Squad, type: string, seconds: number, done: () => boolean, log?: (s: number) => void): number {
  const t0 = t.ctx.clock.now;
  for (let i = 0; i < seconds * 2; i++) {
    t.step(0.5);
    const s = t.ctx.clock.now - t0;
    if (log && i % 10 === 0) log(s);
    if (done()) return s;
    expect(t.ctx.squads.get(squad.id)!.order.type, `ordre affiché à t+${s.toFixed(1)} s`).toBe(type);
  }
  return -1;
}

function firstMove(t: T, ps: Person[], seconds: number): number {
  const t0 = t.ctx.clock.now;
  const start = ps.map((p) => ({ x: p.x, z: p.z }));
  const motos = new Set(ps.map((p) => p.vehicleId).filter((id) => id !== 0));
  const mStart = [...motos].map((id) => { const v = t.ctx.vehicles.get(id)!; return { v, x: v.x, z: v.z }; });
  for (let i = 0; i < seconds * 4; i++) {
    t.step(0.25);
    if (ps.some((p, k) => p.vehicleId === 0 && Math.hypot(p.x - start[k]!.x, p.z - start[k]!.z) > 1)) return t.ctx.clock.now - t0;
    if (mStart.some((m) => Math.hypot(m.v.x - m.x, m.v.z - m.z) > 1)) return t.ctx.clock.now - t0;
  }
  return -1;
}

describe('BRAV-M : les ordres du joueur', () => {
  it('la fiche dit ce que fait la BRAV-M : en selle à partir de 60 m, à pied jusqu’à 150 m', () => {
    expect(BRAVM_RIDE_MIN).toBe(60);
    expect(BRAVM_REMOUNT_MIN).toBe(150);
    const u = { x: 0, z: 0, hasVehicles: true, symbol: 'bravm' };
    expect(motorizes({ ...u, seatedShare: 1 }, 50, 0)).toBe(false);
    expect(motorizes({ ...u, seatedShare: 1 }, 70, 0)).toBe(true);
    // (opérateurs à pied, pilotes au guidon : la moitié de l'unité assise — elle est « à pied »)
    expect(motorizes({ ...u, seatedShare: 0.5 }, 120, 0)).toBe(false);
    expect(motorizes({ ...u, seatedShare: 0.5 }, 160, 0)).toBe(true);
  });

  it('T4 : à pied, « Avancer » à 50 m — à pied, sur le point en moins de 40 s, l’ordre affiché reste « avancer »', async () => {
    const { t, ctx, core, bravm } = await concorde();
    const ops = operators(ctx, bravm.id);
    expect(ops.every((p) => p.vehicleId === 0), 'au départ, à pied près de ses motos').toBe(true);
    const c = { x: median(ops.map((p) => p.x)), z: median(ops.map((p) => p.z)) };
    const pt = roadPoint(ctx, c.x, c.z, 50);
    const motos = motosOf(ctx, bravm.id).map((v) => ({ v, x: v.x, z: v.z }));
    const r = core.issue('avancer', [bravm], [{ x: pt.x, z: pt.z, heading: 0, width: 0 }]);
    expect(r.ok, r.reason).toBe(true);
    expect(ctx.squads.get(bravm.id)!.order.byPlayer).toBe(true);
    const moved = firstMove(t, ops, 4);
    expect(moved, 'premier opérateur en mouvement').toBeGreaterThanOrEqual(0);
    expect(moved).toBeLessThanOrEqual(2);
    const at = run(t, bravm, 'avancer', 60, () => median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z))) < 12, (s) =>
      console.log(`  T4 t+${s.toFixed(0)} s ${special(ctx, bravm.id)?.stage} méd=${median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z))).toFixed(0)} m`));
    console.log(`  T4 : sur le point à t+${at.toFixed(1)} s`);
    expect(at, 'sur le point').toBeGreaterThan(0);
    expect(at + moved).toBeLessThanOrEqual(40);
    // à pied : les motos ne sont pas reparties, aucun opérateur n'est remonté
    for (const m of motos) expect(Math.hypot(m.v.x - m.x, m.v.z - m.z), 'moto restée garée').toBeLessThan(5);
    expect(ops.filter((p) => p.vehicleId !== 0).length).toBe(0);
    const said = ctx.radio.log.map((l) => l.text).filter((x) => /accès bloqué/i.test(x));
    expect(said).toEqual([]);
  }, 600000);

  it('J1 : en selle, point à 30 m — pied à terre sur place, la suite à pied', async () => {
    const { t, ctx, core, bravm } = await concorde();
    expect(core.issue('embarquer', [bravm], null).ok).toBe(true);
    for (let i = 0; i < 40 && operators(ctx, bravm.id).some((p) => p.vehicleId === 0); i++) t.step(1);
    const ops = operators(ctx, bravm.id);
    expect(ops.every((p) => p.vehicleId !== 0), 'en selle').toBe(true);
    t.step(2);
    const motos = motosOf(ctx, bravm.id);
    const lead = motos[0]!;
    const pt = roadPoint(ctx, lead.x, lead.z, 30);
    const start = motos.map((v) => ({ v, x: v.x, z: v.z }));
    expect(core.issue('avancer', [bravm], [{ x: pt.x, z: pt.z, heading: 0, width: 0 }]).ok).toBe(true);
    if (process.env['BRAVM_DEBUG']) for (let k = 0; k < 6; k++) { t.step(0.5); console.log(`  J1 +${(k * 0.5 + 0.5).toFixed(1)} s ${JSON.stringify(special(ctx, bravm.id))} ordre=${ctx.squads.get(bravm.id)!.order.type} à pied ${ops.filter((p) => p.vehicleId === 0).length} pt à ${Math.hypot(pt.x - lead.x, pt.z - lead.z).toFixed(0)} m`); }
    else t.step(3);
    expect(ops.filter((p) => p.vehicleId === 0).length, 'pied à terre en 3 s').toBe(ops.length);
    const at = run(t, bravm, 'avancer', 45, () => median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z))) < 12);
    console.log(`  J1 : à pied sur le point à t+${(at + 3).toFixed(1)} s`);
    expect(at, 'à pied sur le point').toBeGreaterThan(0);
    expect(at + 3).toBeLessThanOrEqual(40);
    for (const m of start) expect(Math.hypot(m.v.x - m.x, m.v.z - m.z), 'la colonne ne roule pas pour 30 m').toBeLessThan(8);
  }, 600000);

  // (place de la République : à la Concorde, les motos garées en bloc, nez au mur, sortent mal — démarrage de colonne du
  // pilote automatique, voir le compte rendu du paquet)
  it('400 m : en selle, elle y roule et arrive (ou, bloquée, finit à pied), l’ordre affiché reste « avancer »', async () => {
    const { t, ctx, core, bravm } = await concorde(REPUBLIQUE);
    const ops = operators(ctx, bravm.id);
    const c = { x: median(ops.map((p) => p.x)), z: median(ops.map((p) => p.z)) };
    const pt = roadPoint(ctx, c.x, c.z, 400);
    const n0 = ctx.radio.log.length;
    expect(core.issue('avancer', [bravm], [{ x: pt.x, z: pt.z, heading: 0, width: 0 }]).ok).toBe(true);
    const motos = motosOf(ctx, bravm.id);
    let mounted = false;
    const at = run(t, bravm, 'avancer', 120, () => {
      if (ops.some((p) => p.vehicleId !== 0)) mounted = true;
      const lead = Math.min(...motos.map((v) => Math.hypot(v.x - pt.x, v.z - pt.z)));
      const foot = median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z)));
      const sp = special(ctx, bravm.id);
      return (lead <= 30 && sp?.stage === 'repos') || (ops.every((p) => p.vehicleId === 0) && foot < 30);
    }, (s) => console.log(`  400 m t+${s.toFixed(0)} s ${special(ctx, bravm.id)?.stage}${process.env['BRAVM_DEBUG'] ? ' ' + motos.map((v) => { const a = ctx.service<{ status(v: unknown): { mode: string; state: string; reason: string; blockedFor: number } }>('vehicles.autopilot')!.status(v); return `#${v.id}:${a.mode}/${a.state}/${a.reason}/${a.blockedFor.toFixed(0)} (${v.x.toFixed(0)},${v.z.toFixed(0)}) v=${v.speed.toFixed(1)}`; }).join(' ') : ''} moto la plus proche ${Math.min(...motos.map((v) => Math.hypot(v.x - pt.x, v.z - pt.z))).toFixed(0)} m, opérateurs ${median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z))).toFixed(0)} m, en selle ${ops.filter((p) => p.vehicleId !== 0).length}/${ops.length}`));
    const said = ctx.radio.log.slice(n0).filter((m) => /FAUCON/.test(m.from)).map((m) => m.text);
    console.log(`  400 m : arrivée à t+${at.toFixed(0)} s ; radio : ${said.join(' / ')}`);
    expect(mounted, 'elle est remontée en selle').toBe(true);
    expect(at, 'au point').toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(90);
    expect(said.filter((x) => /accès bloqué/i.test(x))).toEqual([]);
  }, 600000);

  it('T5 : « Interpeller » un auteur de fait constaté à 125 m — un binôme sur lui en 45 s, interpellé au bout de sa fuite', async () => {
    const { t, ctx, core, bravm } = await concorde();
    const ops = operators(ctx, bravm.id);
    const c = { x: median(ops.map((p) => p.x)), z: median(ops.map((p) => p.z)) };
    let off: Person | null = null;
    let bestErr = Infinity;
    for (const p of ctx.people.list) {
      if (p.faction !== 'protest' || p.custody !== 'free' || p.vehicleId !== 0 || p.dormant) continue;
      // (un auteur en lisière du rassemblement, comme celui du diagnostic : au cœur d'une foule compacte, aucun binôme ne
      // passe — c'est la règle de retenue, pas un défaut)
      const around = ctx.people.countIn(p.x, p.z, 6, (q) => q.faction === 'protest');
      const err = Math.abs(Math.hypot(p.x - c.x, p.z - c.z) - 125) + (around > 3 ? 1000 : 0);
      if (err < bestErr) {
        bestErr = err;
        off = p;
      }
    }
    expect(off, 'un manifestant à environ 125 m').toBeTruthy();
    const target = off!;
    const o = ctx.law.recordOffense(target, 'jet_projectile', target.x, target.z, 3);
    o.witnessed = true;
    console.log(`  T5 : cible à ${Math.hypot(target.x - c.x, target.z - c.z).toFixed(0)} m`);
    expect(core.issue('interpeller', [bravm], [{ x: target.x, z: target.z, heading: 0, width: 0 }], target.id, 'l’objectif désigné').ok).toBe(true);
    let onHim = -1;
    const t0 = ctx.clock.now;
    const at = run(t, bravm, 'interpeller', 150, () => {
      if (onHim < 0 && Math.min(...ops.map((p) => Math.hypot(p.x - target.x, p.z - target.z))) < 25) onHim = ctx.clock.now - t0;
      return target.custody !== 'free';
    }, (s) =>
      console.log(`  T5 t+${s.toFixed(0)} s ${special(ctx, bravm.id)?.stage} plus proche ${Math.min(...ops.map((p) => Math.hypot(p.x - target.x, p.z - target.z))).toFixed(0)} m${process.env['BRAVM_DEBUG'] ? ` cible v=${Math.hypot(target.vx, target.vz).toFixed(1)} ${target.custody} ; opérateurs v=${ops.map((p) => Math.hypot(p.vx, p.vz).toFixed(1)).join(',')}` : ''}`));
    console.log(`  T5 : binôme sur lui à t+${onHim.toFixed(1)} s, interpellé à t+${at.toFixed(1)} s (${target.custody})`);
    expect(onHim, 'un binôme sur lui').toBeGreaterThanOrEqual(0);
    expect(onHim).toBeLessThanOrEqual(45);
    expect(at, 'interpellé').toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(150);
  }, 600000);
  // cdt-04 / cdt-08 (robot des missions du commandant) : la BRAV-M à pied, loin de ses motos, à qui l'on donne un point à
  // plus de 150 m regagnait ses machines à pied, à travers la foule, avant de partir — elle s'éloignait du point. Les
  // pilotes amènent maintenant les motos aux opérateurs, qui partent tout de suite vers le point (en selle si les motos
  // les rejoignent, à pied jusqu'au bout sinon : ici, motos garées au milieu des piétons de la place, le pilote automatique
  // attend qu'ils s'écartent — voir le compte rendu du paquet, P17).
  it('à pied, loin de ses motos, point à 400 m : les opérateurs partent vers le point, les pilotes leur amènent les motos', async () => {
    const { t, ctx, core, bravm } = await concorde(REPUBLIQUE);
    const ops = operators(ctx, bravm.id);
    expect(core.issue('embarquer', [bravm], null).ok).toBe(true);
    for (let i = 0; i < 40 && ops.some((p) => p.vehicleId === 0); i++) t.step(1);
    expect(ops.every((p) => p.vehicleId !== 0), 'en selle').toBe(true);
    const motos = motosOf(ctx, bravm.id);
    // pied à terre et 100 m à pied : les pilotes restent aux machines, les opérateurs s'en éloignent
    const lead = motos[0]!;
    const away = roadPoint(ctx, lead.x, lead.z, 100);
    expect(core.issue('avancer', [bravm], [{ x: away.x, z: away.z, heading: 0, width: 0 }]).ok).toBe(true);
    for (let i = 0; i < 120 && median(ops.map((p) => Math.hypot(p.x - away.x, p.z - away.z))) > 12; i++) t.step(1);
    const c = { x: median(ops.map((p) => p.x)), z: median(ops.map((p) => p.z)) };
    const gap0 = Math.min(...motos.map((v) => Math.hypot(v.x - c.x, v.z - c.z)));
    console.log(`  opérateurs à ${gap0.toFixed(0)} m de leurs motos, pilotes en selle ${motos.filter((v) => v.seats[0] !== 0).length}/${motos.length}`);
    expect(gap0, 'loin de leurs motos').toBeGreaterThan(MOUNT_GAP);
    const pt = roadPoint(ctx, c.x, c.z, 400);
    let last = median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z)));
    expect(core.issue('avancer', [bravm], [{ x: pt.x, z: pt.z, heading: 0, width: 0 }]).ok).toBe(true);
    t.step(2);
    // les pilotes sont lancés vers les opérateurs (colonne de motos sous le pilote automatique)
    const ap = ctx.service<{ isActive(v: unknown): boolean }>('vehicles.autopilot')!;
    expect(special(ctx, bravm.id)?.stage, 'les motos sont amenées').toBe('rapprochement');
    expect(motos.every((v) => ap.isActive(v)), 'les pilotes roulent vers eux').toBe(true);
    let mounted = false;
    let tick = 0;
    const at = run(t, bravm, 'avancer', 240, () => {
      if (ops.some((p) => p.vehicleId !== 0)) mounted = true;
      // les opérateurs à pied ne s'éloignent jamais du point (aucun retour à pied vers les machines)
      if (++tick % 20 === 0 && !mounted) {
        const now = median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z)));
        expect(now, 'les opérateurs vont vers le point').toBeLessThan(last + 3);
        last = now;
      }
      const near = Math.min(...motos.map((v) => Math.hypot(v.x - pt.x, v.z - pt.z)));
      const foot = median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z)));
      return (near <= 30 && special(ctx, bravm.id)?.stage === 'repos') || (ops.every((p) => p.vehicleId === 0) && foot < 30);
    });
    console.log(`  au point à t+${(at + 2).toFixed(0)} s (remontés en selle en route : ${mounted})`);
    expect(at, 'au point').toBeGreaterThan(0);
  }, 600000);
  /** Manifestants les plus proches de (x, z), tenus en cercle (rayon `r`) autour de ce point : la foule autour des machines. */
  function ring(ctx: GameContext, x: number, z: number, r: number, n: number, skip: ReadonlySet<number> = new Set()): { hold(): void; ids: Set<number> } {
    const crowdP = ctx.people.list.filter((p) => p.faction === 'protest' && p.vehicleId === 0 && p.posture !== 'down' && !skip.has(p.id))
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, n);
    expect(crowdP.length, 'assez de manifestants').toBe(n);
    const spots = crowdP.map((p, i) => ({ p, x: x + Math.sin((i * 2 * Math.PI) / n) * r, z: z + Math.cos((i * 2 * Math.PI) / n) * r }));
    return { hold: () => { for (const q of spots) { q.p.x = q.x; q.p.z = q.z; q.p.vx = 0; q.p.vz = 0; } }, ids: new Set(crowdP.map((p) => p.id)) };
  }

  it('foule : à pied, machines au milieu de la foule, « Avec moi » à 250 m — elle vient à pied tout de suite, sans remonter en selle', async () => {
    const { t, ctx, core, bravm, me } = await concorde();
    const ops = operators(ctx, bravm.id);
    expect(ops.every((p) => p.vehicleId === 0), 'au départ, à pied près de ses motos').toBe(true);
    const motos = motosOf(ctx, bravm.id);
    const lead = motos[0]!;
    // elle tient où elle est ; le commandant s'éloigne à 250 m
    const c = { x: median(ops.map((p) => p.x)), z: median(ops.map((p) => p.z)) };
    expect(core.issue('tenir', [bravm], [{ x: c.x, z: c.z, heading: 0, width: 0 }]).ok).toBe(true);
    t.step(2);
    const far = roadPoint(ctx, c.x, c.z, 250);
    me.x = far.x; me.z = far.z; me.vx = 0; me.vz = 0;
    // la foule autour des machines et des opérateurs
    const a = ring(ctx, lead.x, lead.z, 7, 10);
    const b = ring(ctx, c.x, c.z, 9, 10, a.ids);
    const hold = (): void => { a.hold(); b.hold(); me.x = far.x; me.z = far.z; };
    hold();
    t.step(0.5);
    hold();
    const parked = motos.map((v) => ({ v, x: v.x, z: v.z }));
    const d0 = median(ops.map((p) => Math.hypot(p.x - me.x, p.z - me.z)));
    expect(d0, 'appelée de loin').toBeGreaterThan(200);
    const n0 = ctx.radio.log.length;
    ctx.squads.issue(bravm.id, { type: 'suivre', targetId: me.id, x: me.x, z: me.z, issuedBy: me.id, byPlayer: true });
    let mounted = 0;
    let at30 = Infinity;
    let at = -1;
    for (let i = 0; i < 480; i++) {
      hold();
      t.step(0.5);
      const s = (i + 1) / 2;
      mounted = Math.max(mounted, ops.filter((p) => p.vehicleId !== 0).length);
      const d = median(ops.map((p) => Math.hypot(p.x - me.x, p.z - me.z)));
      if (s === 30) at30 = d;
      if (i % 20 === 0) console.log(`  foule t+${s.toFixed(0)} s ${special(ctx, bravm.id)?.stage} méd=${d.toFixed(0)} m en selle=${ops.filter((p) => p.vehicleId !== 0).length}`);
      expect(ctx.squads.get(bravm.id)!.order.type, `ordre affiché à t+${s} s`).toBe('suivre');
      if (d < 30) { at = s; break; }
    }
    const said = ctx.radio.log.slice(n0).map((l) => l.text);
    console.log(`  foule : ${d0.toFixed(0)} m → ${at30.toFixed(0)} m à 30 s ; auprès du commandant à t+${at} s ; radio : ${said.filter((x) => /FAUCON/.test(x)).slice(0, 2).join(' | ')}`);
    expect(said.some((x) => /machines dans la foule, on vient à pied/i.test(x)), 'accusé : à pied').toBe(true);
    expect(said.filter((x) => /remonte en selle|motos nous rejoignent/i.test(x))).toEqual([]);
    // aucun retour aux machines : personne n'est remonté, les motos n'ont pas bougé, et ils se rapprochent tout de suite
    expect(mounted, 'aucun opérateur remonté en selle').toBe(0);
    for (const m of parked) expect(Math.hypot(m.v.x - m.x, m.v.z - m.z), 'moto restée garée').toBeLessThan(5);
    expect(at30, 'en 30 s, déjà 30 m de gagnés').toBeLessThan(d0 - 30);
    expect(at, 'auprès du commandant').toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(200);
  }, 600000);

  it('foule : remontée en selle qui n’en finit pas (un opérateur retenu dans la foule) — abandonnée au bout de 30 s, la suite à pied', async () => {
    const { t, ctx, core, bravm } = await concorde(REPUBLIQUE);
    const ops = operators(ctx, bravm.id);
    expect(ops.every((p) => p.vehicleId === 0), 'au départ, à pied près de ses motos').toBe(true);
    const motos = motosOf(ctx, bravm.id);
    const lead = motos[0]!;
    const c = { x: median(ops.map((p) => p.x)), z: median(ops.map((p) => p.z)) };
    expect(ctx.people.countIn(lead.x, lead.z, 15, (p) => p.faction === 'protest'), 'pas de foule autour des machines au départ').toBeLessThan(6);
    const pt = roadPoint(ctx, c.x, c.z, 300);
    const n0 = ctx.radio.log.length;
    expect(core.issue('avancer', [bravm], [{ x: pt.x, z: pt.z, heading: 0, width: 0 }]).ok).toBe(true);
    t.step(1.5);
    expect(special(ctx, bravm.id)?.stage, 'remontée en selle').toBe('remontee');
    // la foule arrive autour des machines ; un opérateur y est retenu (il n'atteint pas sa moto)
    const stuck = ops.filter((p) => p.vehicleId === 0).sort((p, q) => Math.hypot(q.x - lead.x, q.z - lead.z) - Math.hypot(p.x - lead.x, p.z - lead.z))[0]!;
    expect(stuck, 'un opérateur encore à pied').toBeTruthy();
    const spot = { x: stuck.x, z: stuck.z };
    const a = ring(ctx, lead.x, lead.z, 8, 12);
    let held = true;
    const hold = (): void => { a.hold(); if (held) { stuck.x = spot.x; stuck.z = spot.z; stuck.vx = 0; stuck.vz = 0; } };
    let gaveUp = -1;
    const at = run(t, bravm, 'avancer', 300, () => {
      hold();
      const st = special(ctx, bravm.id)?.stage;
      if (gaveUp < 0 && st !== 'remontee') { gaveUp = ctx.clock.now; held = false; }
      return gaveUp >= 0 && ops.every((p) => p.vehicleId === 0) && median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z))) < 30;
    }, (s) => console.log(`  remontée t+${s.toFixed(0)} s ${special(ctx, bravm.id)?.stage} en selle=${ops.filter((p) => p.vehicleId !== 0).length}/${ops.length} méd=${median(ops.map((p) => Math.hypot(p.x - pt.x, p.z - pt.z))).toFixed(0)} m`));
    const said = ctx.radio.log.slice(n0).map((l) => l.text);
    console.log(`  remontée abandonnée, au point à pied à t+${at.toFixed(0)} s ; radio : ${said.filter((x) => /foule/i.test(x)).join(' | ')}`);
    expect(said.some((x) => /Machines dans la foule, je continue à pied/i.test(x)), 'compte rendu').toBe(true);
    expect(at, 'au point, à pied').toBeGreaterThan(0);
    // les motos sont restées près de là où elles étaient garées (les pilotes les gardent)
    expect(Math.hypot(lead.x - c.x, lead.z - c.z)).toBeLessThan(80);
  }, 600000);
});
