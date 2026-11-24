// BRAV-M de la compagnie, « avec vous » derrière quelqu'un qui ROULE (plan « ordres directs », P20) : elle reste en selle
// et ferme la colonne de son véhicule, sur sa trace — même quand il longe le rassemblement (elle mettait pied à terre dès
// qu'une foule était à moins de 120 m de lui, et ses opérateurs restaient à pied sur la place pendant qu'il s'éloignait).
// Partie réelle : place de la Concorde, vrai Paris, commandant sur le terrain, passager de son véhicule de commandement.
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
const MEANS = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

interface Ap {
  status(v: Vehicle): { mode: string; state: string; leaderId: number };
  driveTo(v: Vehicle, x: number, z: number): boolean;
}
interface Cmd { special(id: number): { stage: string; kind: string } | null }

/** Opérateurs et pilotes de la BRAV-M (membres de ses binômes). */
function riders(ctx: GameContext, bravm: Squad): Person[] {
  return ctx.squads.list.filter((q) => q.parentId === bravm.id).flatMap((q) => q.members.map((id) => ctx.people.get(id)!)).filter((p) => !!p);
}

describe('BRAV-M : « avec vous » derrière un véhicule', () => {
  it('le commandant part en véhicule en longeant la foule : la BRAV-M reste en selle et le suit ; il descend : elle ne suit plus son véhicule', async () => {
    const t = createTestContext({ seed: 108, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15,
      crowdSize: 60, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain' },
    } as never);
    const { ctx } = t;
    t.step(5);
    const ap = ctx.service<Ap>('vehicles.autopilot')!;
    const cmd = ctx.service<Cmd>('police.command')!;
    const me = ctx.player.person()!;
    const company = ctx.squads.get(me.squadId)!;
    const bravm = ctx.squads.list.find((q) => cmd.special(q.id)?.kind === 'bravm')!;
    expect(bravm, 'la BRAV-M du dispositif').toBeTruthy();
    // (§3.3 : tout le monde suit le joueur dès la mise en place, BRAV-M comprise ; §4.1.1 : elle est dans la compagnie)
    expect(bravm.parentId).toBe(company.id);
    expect(bravm.order.type).toBe('suivre');
    expect(bravm.order.targetId).toBe(me.id);
    const motos = ctx.squads.list.filter((q) => q.parentId === bravm.id && q.vehicleId !== 0).map((q) => ctx.vehicles.get(q.vehicleId)!);
    expect(motos.length).toBe(6);
    const all = riders(ctx, bravm);
    expect(all.length).toBe(12);

    // il monte en passager de son véhicule de commandement (l'IA conduit)
    const vl = ctx.vehicles.get(company.vehicleId)!;
    expect(vl.kind).toBe('vl_commandement');
    if (vl.seats[0] === 0) {
      const drv = company.members.map((id) => ctx.people.get(id)!).find((p) => p && !p.isPlayer && p.vehicleId === 0)!;
      drv.x = vl.x + 2; drv.z = vl.z;
      expect(ctx.vehicles.enter(drv, vl, 'driver')).toBe(true);
    }
    me.x = vl.x + 3; me.z = vl.z;
    let seat = 1;
    while (seat < vl.seats.length && vl.seats[seat] !== 0) seat++;
    expect(ctx.vehicles.enter(me, vl, seat)).toBe(true);
    // la BRAV-M remonte en selle (ses machines sont à côté)
    for (let i = 0; i < 40 && all.some((p) => p.vehicleId === 0); i++) t.step(1);
    expect(all.filter((p) => p.vehicleId === 0).map((p) => p.poste), 'tous en selle').toEqual([]);
    expect(cmd.special(bravm.id)!.stage).toBe('garde');

    // le véhicule roule 400 m et plus, le long du rassemblement
    const path: number[] = [];
    let goal: { x: number; z: number } | null = null;
    for (let k = 0; k < 16 && !goal; k++) {
      const a = (k / 16) * Math.PI * 2;
      path.length = 0;
      if (!ctx.world.findPath(vl.x, vl.z, vl.x + Math.sin(a) * 450, vl.z + Math.cos(a) * 450, 'vehicle', path) || path.length < 4) continue;
      const ex = path[path.length - 2]!, ez = path[path.length - 1]!;
      if (Math.hypot(ex - vl.x, ez - vl.z) > 380) goal = { x: ex, z: ez };
    }
    expect(goal, 'un itinéraire de 400 m').toBeTruthy();
    const x0 = vl.x, z0 = vl.z;
    expect(ap.driveTo(vl, goal!.x, goal!.z)).toBe(true);
    let crowdNear = false;
    let afootMax = 0;
    for (let i = 0; i < 150 && ap.status(vl).state !== 'arrive'; i++) {
      t.step(2);
      if (ctx.people.countIn(me.x, me.z, 120, (p) => p.faction === 'protest') >= 8 && Math.hypot(vl.x - x0, vl.z - z0) > 30) crowdNear = true;
      afootMax = Math.max(afootMax, all.filter((p) => p.vehicleId === 0).length);
    }
    const moved = Math.hypot(vl.x - x0, vl.z - z0);
    expect(moved, 'le véhicule a roulé').toBeGreaterThan(300);
    expect(crowdNear, 'il a longé le rassemblement').toBe(true);
    // personne n'a mis pied à terre en route
    expect(afootMax, 'opérateurs à pied en route').toBe(0);
    // la colonne des motos le rejoint, derrière son véhicule
    const lead = (): number => Math.min(...motos.map((v) => Math.hypot(v.x - vl.x, v.z - vl.z)));
    for (let i = 0; i < 60 && lead() > 120; i++) t.step(2);
    const gone = motos.filter((v) => Math.hypot(v.x - x0, v.z - z0) > 150).length;
    console.log(`  véhicule : ${moved.toFixed(0)} m ; moto la plus proche à ${lead().toFixed(0)} m de lui ; ${gone}/6 motos parties ; étape ${cmd.special(bravm.id)!.stage} ; à pied ${all.filter((p) => p.vehicleId === 0).length}`);
    expect(lead(), 'la tête des motos derrière lui').toBeLessThan(120);
    expect(gone, 'motos parties avec lui').toBeGreaterThanOrEqual(4);
    expect(all.filter((p) => p.vehicleId === 0).length).toBe(0);
    expect(bravm.order.type).toBe('suivre');
    // la moto de tête le suit, lui (sa trace) — jamais dans la file de ses fourgons, où chacun suit le véhicule précédent
    expect(motos.some((v) => ap.status(v).mode === 'follow' && ap.status(v).leaderId === me.id)).toBe(true);
    expect(motos.some((v) => ap.status(v).mode === 'follow' && ap.status(v).leaderId === vl.id)).toBe(false);

    // il descend : plus aucune moto ne suit son véhicule ; « avec moi » reste (à pied près de lui, ou en selle derrière)
    ctx.vehicles.exit(me);
    t.step(5);
    expect(motos.some((v) => ap.status(v).mode === 'follow' && ap.status(v).leaderId === me.id)).toBe(false);
    expect(bravm.order.type).toBe('suivre');
    expect(bravm.order.targetId).toBe(me.id);
  }, 600000);

  it('un CRS prend le volant du fourgon de son groupe : la BRAV-M de la compagnie remonte en selle pour le suivre ; il descend : elle met pied à terre avec la compagnie', async () => {
    const t = createTestContext({ seed: 128, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'crs', place: 'Place de la Bastille', x: 3542, z: 1395,
      crowdSize: 60, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, poste: 'bouclier' },
    } as never);
    const { ctx } = t;
    t.step(5);
    const cmd = ctx.service<Cmd>('police.command')!;
    const me = ctx.player.person()!;
    const bravm = ctx.squads.list.find((q) => cmd.special(q.id)?.kind === 'bravm')!;
    expect(bravm, 'la BRAV-M du dispositif').toBeTruthy();
    const all = riders(ctx, bravm);
    expect(all.length).toBe(12);
    // au départ (mode libre) : toute à pied près de ses machines, sans ordre du joueur — il ne la commande pas
    expect(all.filter((p) => p.vehicleId !== 0).length).toBe(0);
    expect(bravm.order.type).not.toBe('suivre');
    // il prend le volant du fourgon de son groupe (le conducteur lui cède la place)
    let q: Squad | undefined = ctx.squads.get(me.squadId);
    for (let g = 0; q && q.vehicleId === 0 && g < 8; g++) q = q.parentId !== 0 ? ctx.squads.get(q.parentId) : undefined;
    const van = ctx.vehicles.get(q!.vehicleId)!;
    expect(van.kind).toBe('fourgon_crs');
    me.x = van.x + 3; me.z = van.z;
    if (van.seats[0] !== 0) {
      const o = ctx.people.get(van.seats[0])!;
      ctx.vehicles.exit(o);
      let ok = false;
      for (let i = 1; i < van.seats.length && !ok; i++) if (van.seats[i] === 0) ok = ctx.vehicles.enter(o, van, i);
    }
    expect(ctx.vehicles.enter(me, van, 'driver')).toBe(true);
    // toute la compagnie embarque derrière lui (session/follow.ts) : la BRAV-M reçoit « suivre » et remonte en selle
    for (let i = 0; i < 40 && all.some((p) => p.vehicleId === 0); i++) t.step(1);
    expect(all.filter((p) => p.vehicleId === 0).map((p) => p.poste), 'pilotes et opérateurs en selle').toEqual([]);
    expect(bravm.order.type).toBe('suivre');
    expect(bravm.order.targetId).toBe(me.id);
    expect(bravm.order.byPlayer, 'ce n’est pas un ordre donné par le joueur').not.toBe(true);
    t.step(10);
    expect(cmd.special(bravm.id)!.stage).toBe('garde');
    expect(all.filter((p) => p.vehicleId === 0).length).toBe(0);
    // il descend : la compagnie débarque, la BRAV-M met pied à terre (les pilotes gardent les machines) — elle ne suit
    // pas à pied un CRS qui n'est pas son chef
    ctx.vehicles.exit(me);
    t.step(8);
    expect(bravm.order.type).toBe('debarquer');
    expect(cmd.special(bravm.id)!.stage).toBe('a_pied');
    const afoot = all.filter((p) => p.vehicleId === 0).map((p) => p.poste);
    expect(afoot.length).toBe(6);
    expect(afoot.indexOf('pilote_moto')).toBe(-1);
  }, 600000);
});
