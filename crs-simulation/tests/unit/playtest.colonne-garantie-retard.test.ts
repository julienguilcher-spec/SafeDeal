// Colonne garantie (plan « ordres directs », P18) — la colonne en retard. Le commandant, parti seul devant, est au lieu
// de la journée avant ses fourgons : au bout de trente secondes, chaque véhicule de sa compagnie encore à plus de 400 m
// de lui est avancé le long de son itinéraire, HORS DE SA VUE (jamais à moins de 300 m de lui), l'ordre de la file gardé,
// et finit le trajet normalement (session/engins.ts, advanceLate). Le commandant conduit lui-même jusqu'au lieu (robot au
// clavier, 50 km/h au plus), puis l'on relève, seconde par seconde, les véhicules replacés.
import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { ENGINS_SERVICE, JOURNEE_SERVICE } from '@/gameplay/session';
import type { EnginsApi, JourneeApi } from '@/gameplay/session';
import type { CommandCore } from '@/ui/command';
import { CRUISE_ALONE, SIM, StreetDriver, launchFromSheet } from './playtest.commandant-mission.lib';

describe('colonne garantie : la colonne en retard rejoint le commandant arrivé avant elle', () => {
  it('cdt-09, le commandant au lieu avant sa colonne : fourgons avancés hors de sa vue, dans l’ordre, tous à moins de 300 m en trois minutes', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.ready;
    const { ctx } = t;
    const cfg = launchFromSheet(ctx, 'cdt-09-la-seine-monte');
    cfg.crowdSize = Math.min(cfg.crowdSize ?? 120, 120);
    await t.start(cfg);
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    const core = ctx.service<CommandCore>('ui.command')!;
    const engins = ctx.service<EnginsApi>(ENGINS_SERVICE)!;
    const ap = ctx.service<{ status(v: Vehicle): { mode: string; leaderId: number } }>('vehicles.autopilot')!;
    // il part seul devant, au volant de son véhicule de commandement (comme le robot « devant » : au clavier, par les rues)
    t.step(3);
    const me = ctx.player.person()!;
    const car = ctx.vehicles.list.filter((x) => x.kind === 'vl_commandement' && x.faction === 'police')
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]!;
    expect(car, 'véhicule de commandement').toBeTruthy();
    if (me.vehicleId !== 0 && me.vehicleId !== car.id) ctx.vehicles.exit(me);
    if (car.seats[0] !== 0 && car.seats[0] !== me.id) { const drv = ctx.people.get(car.seats[0]!); if (drv) ctx.vehicles.exit(drv); }
    me.x = car.x; me.z = car.z;
    if (me.vehicleId === 0) expect(ctx.vehicles.enter(me, car)).toBe(true);
    const wheel = new StreetDriver();
    let s = 0;
    // (instant où il arrive à moins de 150 m du lieu : la colonne en retard n'est avancée que trente secondes plus tard)
    let nearAt = -1;
    for (; s < 900; s++) {
      const dd = j.destination;
      if (dd && nearAt < 0 && Math.hypot(dd.x - me.x, dd.z - me.z) < 150) nearAt = ctx.clock.now;
      if (dd && Math.hypot(dd.x - me.x, dd.z - me.z) < 150 && Math.abs(car.speed) < 0.5) break;
      if (dd) wheel.aim(car, dd.x, dd.z, CRUISE_ALONE);
      wheel.step(t);
    }
    wheel.release(ctx);
    const d = j.destination!;
    expect(d, 'lieu de la journée').toBeTruthy();
    expect(Math.hypot(d.x - me.x, d.z - me.z), `arrivé au lieu en ${s} s`).toBeLessThan(150);
    expect(wheel.topSpeed * 3.6, 'jamais plus de 50 km/h').toBeLessThanOrEqual(50);
    car.speed = 0; car.vx = 0; car.vz = 0;
    ctx.vehicles.exit(me);
    const ownId = core.scope().ownSquadId;
    const tree = new Set<number>();
    const add = (sid: number): void => { if (tree.has(sid)) return; tree.add(sid); for (const q of ctx.squads.list) if (q.parentId === sid) add(q.id); };
    add(ownId);
    const fleet = ctx.squads.list.filter((q) => tree.has(q.id) && q.vehicleId !== 0).map((q) => ctx.vehicles.get(q.vehicleId)!)
      .filter((v, i, a) => !!v && !v.def.flying && v.seats[0] !== 0 && a.indexOf(v) === i);
    expect(fleet.length, 'véhicules de la compagnie en route').toBeGreaterThan(3);
    const hx = me.x, hz = me.z;
    const stay = (): void => { me.x = hx; me.z = hz; me.vx = 0; me.vz = 0; };
    const farAtArrival = fleet.filter((v) => v !== car && Math.hypot(v.x - me.x, v.z - me.z) > 400).length;
    expect(farAtArrival, 'la colonne est encore loin quand il arrive').toBeGreaterThan(2);
    // ── il attend au lieu : relevé des véhicules replacés (un bond de plus de 40 m en une seconde) ──
    const moved: { id: number; t: number; at: number; from: number; to: number; depth: number }[] = [];
    const depthOf = (v: Vehicle): number => { let n = 0; let cur: Vehicle | undefined = v; for (; cur && n < 24; n++) { const st = ap.status(cur); if (st.mode !== 'follow' || !st.leaderId) break; cur = ctx.vehicles.get(st.leaderId); } return n; };
    const seen: string[] = [];
    for (let k = 1; k <= 180; k++) {
      const before = fleet.map((v) => ({ v, x: v.x, z: v.z, depth: depthOf(v) }));
      t.step(1);
      stay();
      if (process.env['PLAYTEST_DEBUG'] && (k === 40 || k === 100)) {
        const apx = ap as unknown as { status(v: Vehicle): { mode: string; state: string; reason: string; leaderId: number; remaining: number } };
        for (const v of fleet) { const st = apx.status(v); console.log(`  +${k} s ${v.kind}#${v.id} à ${Math.hypot(v.x - me.x, v.z - me.z).toFixed(0)} m ${st.mode}/${st.state}/${st.reason} lead=${st.leaderId} reste ${st.remaining.toFixed(0)} m`); }
      }
      for (const b of before) {
        const jump = Math.hypot(b.v.x - b.x, b.v.z - b.z);
        if (jump <= 40) continue;
        const from = Math.hypot(b.x - me.x, b.z - me.z), to = Math.hypot(b.v.x - me.x, b.v.z - me.z);
        moved.push({ id: b.v.id, t: k, at: ctx.clock.now, from, to, depth: b.depth });
        // jamais sous ses yeux : ni au départ du bond, ni à l'arrivée
        if (from <= 400 || to <= 300) seen.push(`${b.v.kind}#${b.v.id} à +${k} s : ${from.toFixed(0)} → ${to.toFixed(0)} m de lui`);
      }
    }
    console.log(`colonne en retard : ${farAtArrival}/${fleet.length} véhicules à plus de 400 m à son arrivée ; replacés : ${moved.map((m) => `#${m.id} +${m.t} s ${m.from.toFixed(0)} → ${m.to.toFixed(0)} m (rang ${m.depth})`).join(', ') || 'aucun'}`);
    expect(moved.length, 'des véhicules en retard ont été avancés').toBeGreaterThan(0);
    expect(seen, 'aucun véhicule replacé sous les yeux du joueur').toEqual([]);
    // rien avant trente secondes passées à moins de 150 m du lieu
    expect(nearAt).toBeGreaterThan(0);
    expect(Math.min(...moved.map((m) => m.at)) - nearAt).toBeGreaterThanOrEqual(30);
    // l'ordre de la file : dans une même revue, un suivant n'est jamais posé plus près de lui que celui qui le précède
    for (const a of moved) for (const b of moved) {
      if (a.t === b.t && a.depth < b.depth) expect(a.to, `#${a.id} (rang ${a.depth}) devant #${b.id} (rang ${b.depth})`).toBeLessThanOrEqual(b.to + 0.5);
    }
    // le filet de sécurité en garde la trace
    expect(engins.stats.log.some((e) => e.why === 'skipAhead:colonne_en_retard')).toBe(true);
    // la garantie : trois minutes après son arrivée, tous ses groupes sont à moins de 300 m du lieu
    const groups = ctx.squads.list.filter((q) => q.faction === 'police' && q.kind === 'groupe' && q.members.length > 0 && tree.has(q.id));
    const far = groups.filter((q) => {
      let x = 0, z = 0, n = 0;
      for (const pid of q.members) { const p = ctx.people.get(pid); if (!p || p.isPlayer) continue; const v = p.vehicleId ? ctx.vehicles.get(p.vehicleId) : undefined; x += v ? v.x : p.x; z += v ? v.z : p.z; n++; }
      return n > 0 && Math.hypot(x / n - d.x, z / n - d.z) >= 300;
    }).map((q) => q.name);
    expect(far, 'groupes encore à plus de 300 m du lieu à +180 s').toEqual([]);
  }, 600_000);
});
