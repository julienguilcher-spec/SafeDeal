// Partie jouée par un robot : BRAV-M, poste « passager_moto » (opérateur d'un binôme). Le joueur commence EN SELLE,
// derrière un pilote de son unité ; à l'ordre de mouvement, toutes les motos de son unité partent avec la sienne et la
// suivent jusqu'au point — en journée de service (départ d'un commissariat) comme en mode libre (ordre « colonne »
// donné à l'unité). Défaut d'origine : le joueur commençait à pied, à côté de motos sans pilote (0/0), et la BRAV-M
// partait sans lui — ou ne partait pas.
import { describe, expect, it } from 'vitest';

import type { GameContext, Person, Squad, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
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
import { createSystems as session } from '@/gameplay/session';
import { JOURNEE_SERVICE, SERVICE_BASES } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

function rootOf(ctx: GameContext, s: Squad): Squad {
  let q = s;
  for (let g = 0; q.parentId !== 0 && g < 8; g++) q = ctx.squads.get(q.parentId) ?? q;
  return q;
}

/** Motos de l'unité du joueur (binômes de son unité racine). */
function unitMotos(ctx: GameContext, me: Person): Vehicle[] {
  const root = rootOf(ctx, ctx.squads.get(me.squadId)!);
  const ids = new Set(ctx.squads.list.filter((q) => q.vehicleId !== 0 && rootOf(ctx, q).id === root.id).map((q) => q.vehicleId));
  return ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm' && ids.has(v.id));
}

/** Le joueur est en selle comme passager, un pilote de l'IA de SON unité au guidon. */
function seatedBehindPilot(ctx: GameContext, me: Person): string {
  if (me.vehicleId === 0) return 'à pied';
  const v = ctx.vehicles.get(me.vehicleId)!;
  if (v.kind !== 'moto_bravm') return 'pas sur une moto : ' + v.kind;
  if (v.seats[0] === me.id) return 'au guidon';
  const pilot = ctx.people.get(v.seats[0]);
  if (!pilot) return 'moto sans pilote';
  const mine = rootOf(ctx, ctx.squads.get(me.squadId)!).id;
  if (pilot.isPlayer || pilot.squadId === 0 || rootOf(ctx, ctx.squads.get(pilot.squadId)!).id !== mine) return 'pilote d’une autre unité';
  return 'ok';
}

const JOURNEES: { base: number; place: string; x: number; z: number; seed: number }[] = [
  { base: 2, place: 'Place de la Bastille', x: 3542, z: 1395, seed: 5 },
  { base: 0, place: 'Place de la République', x: 3123, z: -208, seed: 3 },
  { base: 3, place: 'Place de la Concorde', x: -10, z: 15, seed: 11 },
];

describe('BRAV-M, poste passager : en selle derrière son pilote, toutes les motos suivent la sienne', () => {
  for (const c of JOURNEES) {
    const base = SERVICE_BASES[c.base]!;
    it(`journée : ${base.name} → ${c.place} (graine ${c.seed})`, async () => {
      const t = createTestContext({ seed: c.seed, strict: false, modules: SIM });
      await t.start({
        mode: 'libre', role: 'bravm', place: c.place, x: c.x, z: c.z, crowdSize: 120, tension: 0.2, volatility: 0.2, duration: 'standard',
        extra: { moyens: MEANS, journee: true, base: { x: base.x, z: base.z, name: base.name }, poste: 'passager_moto', baseBravm: { x: base.x, z: base.z, name: base.name } },
      });
      const { ctx } = t;
      const me = ctx.player.person()!;
      expect(me.poste).toBe('passager_moto');
      expect(seatedBehindPilot(ctx, me), 'au départ').toBe('ok');
      const mine = ctx.vehicles.get(me.vehicleId)!;
      const motos = unitMotos(ctx, me);
      expect(motos.length).toBe(3);
      for (const v of motos) expect(v.seats[0], `moto#${v.id} avec un pilote`).not.toBe(0);
      const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
      const start = { x: mine.x, z: mine.z };
      const dist = Math.hypot(c.x - base.x, c.z - base.z);
      const limit = (dist * 1.5) / 4 + 300;
      let worst = 0;
      for (let i = 0; i < limit / 5 && j.stage !== 'sur_place'; i++) {
        t.step(5);
        if (process.env['BRAVM_DEBUG'] && i % 4 === 0) {
          const ap = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason?: string; leaderId: number } }>('vehicles.autopilot')!;
          const root = rootOf(ctx, ctx.squads.get(me.squadId)!);
          const sp = ctx.service<{ special(id: number): { stage: string } | null }>('police.command')!.special(root.id);
          const fau = ctx.squads.list.find((q) => q.name === 'FAUCON 1');
          const fm = fau ? ctx.vehicles.list.filter((v) => ctx.squads.list.some((q) => q.vehicleId === v.id && q.parentId === fau.id)) : [];
          const fsp = fau ? ctx.service<{ special(id: number): { stage: string } | null }>('police.command')!.special(fau.id) : null;
          if (fau) console.log(`  FAUCON ${fsp?.stage} ordre=${fau.order.type} ` + fm.map((v) => { const a = ap.status(v); return `#${v.id}:${a.mode}/${a.state}/${a.reason ?? ''} ${v.speed.toFixed(1)} d=${Math.round(Math.hypot(v.x - j.destination!.x, v.z - j.destination!.z))}`; }).join(' '));
          console.log(`t=${ctx.clock.now.toFixed(0)} ${j.stage} ${sp?.stage} ordre=${root.order.type} ` + motos.map((v) => { const a = ap.status(v); return `#${v.id}${v === mine ? '*' : ''}:${a.mode}/${a.state}/${a.reason ?? ''}→${a.leaderId} d=${Math.round(Math.hypot(v.x - mine.x, v.z - mine.z))}`; }).join(' '));
        }
        if (Math.hypot(mine.x - start.x, mine.z - start.z) > 200) {
          // en route : les motos de l'unité roulent avec celle du joueur
          for (const v of motos) worst = Math.max(worst, Math.hypot(v.x - mine.x, v.z - mine.z));
        }
      }
      const dest = j.destination!;
      const far = motos.map((v) => Math.round(Math.hypot(v.x - dest.x, v.z - dest.z)));
      console.log(`  ${base.name} → ${c.place} : ${j.stage} à t=${ctx.clock.now.toFixed(0)} s ; joueur ${seatedBehindPilot(ctx, me)} ; motos à ${far.join(' / ')} m du point ; écart max en route ${worst.toFixed(0)} m`);
      expect(Math.hypot(mine.x - start.x, mine.z - start.z), 'la moto du joueur est partie').toBeGreaterThan(300);
      expect(j.stage).toBe('sur_place');
      t.step(30);
      for (const v of motos) expect(Math.hypot(v.x - dest.x, v.z - dest.z), `moto#${v.id} sur place`).toBeLessThan(250);
      // toutes les motos de la journée (BRAV-M du joueur et l'autre BRAV-M) finissent par arriver
      for (let i = 0; i < 40; i++) {
        if (ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm').every((v) => Math.hypot(v.x - dest.x, v.z - dest.z) < 250)) break;
        t.step(10);
      }
      const all = ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm');
      const late = all.filter((v) => Math.hypot(v.x - dest.x, v.z - dest.z) >= 250).map((v) => `#${v.id}@${Math.round(Math.hypot(v.x - dest.x, v.z - dest.z))}m`);
      console.log(`  toutes les motos : ${all.length - late.length}/${all.length} sur place ${late.join(' ')}`);
      expect(late).toEqual([]);
    }, 1800000);
  }

  for (const c of [{ place: 'Place de la République', x: 3123, z: -208, seed: 21 }, { place: 'Place de la Bastille', x: 3542, z: 1395, seed: 22 }]) {
    it(`mode libre : ${c.place} (graine ${c.seed}), ordre « colonne » à l’unité`, async () => {
      const t = createTestContext({ seed: c.seed, strict: false, modules: SIM });
      await t.start({ mode: 'libre', role: 'bravm', place: c.place, x: c.x, z: c.z, crowdSize: 60, tension: 0.1, volatility: 0.1, duration: 'standard', extra: { poste: 'passager_moto' } });
      const { ctx } = t;
      const me = ctx.player.person()!;
      expect(seatedBehindPilot(ctx, me), 'au départ').toBe('ok');
      t.step(3);
      expect(seatedBehindPilot(ctx, me), 'toujours en selle').toBe('ok');
      const mine = ctx.vehicles.get(me.vehicleId)!;
      const motos = unitMotos(ctx, me);
      expect(motos.length).toBe(3);
      // point à 600–900 m par les rues
      const path: number[] = [];
      let tx = 0, tz = 0;
      for (const [dx, dz] of [[700, 0], [-700, 0], [0, 700], [0, -700], [500, 500], [-500, -500]] as const) {
        const road = { x: 0, z: 0 } as { x: number; z: number };
        if (!ctx.world.nearestRoad(mine.x + dx, mine.z + dz, road as never, 120)) continue;
        if (!ctx.world.findPath(mine.x, mine.z, road.x, road.z, 'vehicle', path)) continue;
        tx = road.x; tz = road.z;
        break;
      }
      expect(tx !== 0 || tz !== 0, 'un point atteignable').toBe(true);
      const root = rootOf(ctx, ctx.squads.get(me.squadId)!);
      if (process.env['BRAVM_DEBUG']) {
        const fx = Math.sin(mine.heading), fz = Math.cos(mine.heading);
        console.log('autour', ctx.vehicles.list.filter((o) => o !== mine && Math.hypot(o.x - mine.x, o.z - mine.z) < 25).map((o) => `${o.kind}#${o.id} av=${((o.x - mine.x) * fx + (o.z - mine.z) * fz).toFixed(1)} lat=${(-(o.x - mine.x) * fz + (o.z - mine.z) * fx).toFixed(1)} h=${o.heading.toFixed(2)}`).join(' | '), 'path0', path.slice(0, 6).map((n) => n.toFixed(0)).join(','), 'moi', mine.x.toFixed(0), mine.z.toFixed(0), mine.heading.toFixed(2));
      }
      ctx.squads.issue(root.id, { type: 'colonne', x: tx, z: tz, issuedBy: root.leaderId });
      const start = { x: mine.x, z: mine.z };
      let worst = 0;
      for (let i = 0; i < 80; i++) {
        t.step(5);
        if (process.env['BRAVM_DEBUG']) {
          const ap = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason?: string; leaderId: number } }>('vehicles.autopilot')!;
          const sp = ctx.service<{ special(id: number): { stage: string } | null }>('police.command')!.special(root.id);
          console.log(`t=${ctx.clock.now.toFixed(0)} ${sp?.stage} ordre=${ctx.squads.get(root.id)!.order.type} ` + motos.map((v) => { const a = ap.status(v); return `#${v.id}${v === mine ? '*' : ''}:${a.mode}/${a.state}/${a.reason ?? ''}→${a.leaderId} ${v.seats.join(',')} d=${Math.round(Math.hypot(v.x - tx, v.z - tz))}`; }).join(' '));
        }
        if (Math.hypot(mine.x - start.x, mine.z - start.z) > 150) for (const v of motos) worst = Math.max(worst, Math.hypot(v.x - mine.x, v.z - mine.z));
        if (i > 6 && motos.every((v) => Math.abs(v.speed) < 0.3) && ctx.service<{ special(id: number): { stage: string } | null }>('police.command')!.special(root.id)?.stage === 'repos') break;
      }
      // (arrivée : les retardataires rejoignent la tête)
      t.step(20);
      const at = motos.map((v) => Math.round(Math.hypot(v.x - tx, v.z - tz)));
      console.log(`  ${c.place} : joueur ${seatedBehindPilot(ctx, me)}, moto à ${Math.round(Math.hypot(mine.x - tx, mine.z - tz))} m du point ; motos à ${at.join(' / ')} m ; écart max en route ${worst.toFixed(0)} m`);
      expect(seatedBehindPilot(ctx, me)).toBe('ok');
      expect(Math.hypot(mine.x - start.x, mine.z - start.z), 'la moto du joueur est partie').toBeGreaterThan(300);
      // (la colonne s'arrête avant la foule, jamais dedans : le point est atteint à la distance de retenue près)
      expect(Math.hypot(mine.x - tx, mine.z - tz), 'la moto du joueur au point').toBeLessThan(180);
      for (const v of motos) expect(Math.hypot(v.x - mine.x, v.z - mine.z), `moto#${v.id} avec celle du joueur`).toBeLessThan(70);
      // en route, aucune moto de l'unité n'est laissée en arrière (la sortie d'une place encombrée, demi-tour au milieu
      // des piétons, peut étirer la colonne quelques instants : la tête attend ensuite les retardataires)
      expect(worst, 'les motos restent avec celle du joueur').toBeLessThan(250);
    }, 1800000);
  }
});
