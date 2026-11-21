// Foyers secondaires : pendant une grande manifestation volatile, d'autres points chauds se déclarent ailleurs
// (rassemblement sauvage, groupe de casseurs, blocage). Ce sont de vraies personnes de la foule, loin du cortège,
// annoncées par CENTRAL ; une nasse des forces de l'ordre les enferme ; à la fin du foyer, elles s'en vont.
import { describe, expect, it } from 'vitest';

import type { Person, SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as crowd, CROWD_CORE, CROWD_FOYERS, FOYER_EVENT, CROWD_STATE, CROWD_FLAG, FoyersSystem } from '@/sim/crowd';
import type { CrowdCoreApi, FoyerEvent, FoyersApi } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { ENCIRCLE_CLOSE_ALL, POLICE_UNITS_SERVICE } from '@/sim/police/api';
import type { PoliceUnitsApi } from '@/sim/police/api';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, crowd, police, items, props, hazards, law, radio, session];
const MEANS = { sections: 4, fourgons: 12, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };

function cfg(c: Partial<SessionConfig>): Partial<SessionConfig> {
  return c;
}

function distToRoute(route: readonly number[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 2; i + 1 < route.length; i += 2) {
    const ax = route[i - 2]!, az = route[i - 1]!, dx = route[i]! - ax, dz = route[i + 1]! - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

describe('foyers secondaires', () => {
  it('nombre de foyers : réglage, automatique selon la taille et la volatilité, aucun en mission', () => {
    const c = (missionId: string, extra: Record<string, unknown> = {}): SessionConfig => ({ missionId, extra } as unknown as SessionConfig);
    expect(FoyersSystem.count(c(''), 2000, 1)).toBe(4);
    expect(FoyersSystem.count(c(''), 200, 0.9)).toBe(0);
    expect(FoyersSystem.count(c(''), 1500, 0.2)).toBe(0);
    expect(FoyersSystem.count(c(''), 1000, 0.6)).toBe(1);
    expect(FoyersSystem.count(c('', { foyers: 'auto' }), 2000, 1)).toBe(4);
    expect(FoyersSystem.count(c('', { foyers: 0 }), 2000, 1)).toBe(0);
    expect(FoyersSystem.count(c('', { foyers: 3 }), 100, 0)).toBe(3);
    expect(FoyersSystem.count(c('mission_x'), 2000, 1)).toBe(0);
    expect(FoyersSystem.count(c('mission_x', { foyers: 2 }), 2000, 1)).toBe(2);
  });

  it('foyers: 0 : aucun foyer, aucune annonce', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: [world, roles, people, crowd, radio] });
    const events: FoyerEvent[] = [];
    t.ctx.events.onAny(FOYER_EVENT, (e) => events.push(e as FoyerEvent));
    await t.start(cfg({ mode: 'libre', place: 'essai', x: -10, z: 15, crowdSize: 900, tension: 0.5, volatility: 1, duration: 'standard', extra: { foyers: 0, 'foyers.delai': 5 } }));
    t.step(30);
    const api = t.ctx.require<FoyersApi>(CROWD_FOYERS);
    expect(api.planned).toBe(0);
    expect(api.list.length).toBe(0);
    expect(events.length).toBe(0);
    expect(t.ctx.radio.log.some((m) => m.from === 'CENTRAL')).toBe(false);
  }, 120000);

  it('blocage : sit-in assis en travers d\'un carrefour, levé à la fin du foyer', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: [world, roles, people, crowd, radio, law] });
    const { ctx } = t;
    const events: FoyerEvent[] = [];
    ctx.events.onAny(FOYER_EVENT, (e) => events.push({ ...(e as FoyerEvent) }));
    await t.start(cfg({
      mode: 'libre', place: 'essai', x: -10, z: 15, crowdSize: 300, tension: 0.3, volatility: 0.5, duration: 'standard',
      extra: { foyers: 1, 'foyers.types': ['blocage'], 'foyers.delai': 5, 'foyers.duree': 150, 'foyers.taille': 30, 'crowd.noAleas': true },
    }));
    const api = ctx.require<FoyersApi>(CROWD_FOYERS);
    const core = ctx.require<CrowdCoreApi>(CROWD_CORE);
    t.step(100);
    const f = api.list[0]!;
    expect(f.kind).toBe('blocage');
    const mine = core.members.filter((p) => api.foyerOf(p.id)?.id === f.id);
    const sitting = mine.filter((p) => core.brain(p)!.state === CROWD_STATE.SIT);
    console.log(`[foyers] ${f.label} : ${sitting.length}/${mine.length} assis ; radio « ${ctx.radio.log.find((m) => m.from === 'CENTRAL')?.text ?? ''} »`);
    expect(sitting.length).toBeGreaterThan(mine.length * 0.6);
    t.step(90);
    expect(events.map((e) => e.state)).toEqual(['debut', 'fin']);
    const still = mine.filter((p) => ctx.people.get(p.id) && (core.brain(p)?.flags ?? 0) & CROWD_FLAG.PINNED).length;
    expect(still).toBe(0);
  }, 300000);

  it('rassemblement et casseurs loin du cortège, pilotés par la foule, nassés par les forces, puis dispersés', async () => {
    const t = createTestContext({ seed: 11, strict: false, modules: SIM });
    const { ctx } = t;
    const events: FoyerEvent[] = [];
    ctx.events.onAny(FOYER_EVENT, (e) => events.push({ ...(e as FoyerEvent) }));
    const windows: string[] = [];
    ctx.events.on('shop:window', (e) => {
      const by = ctx.people.get(e.byId);
      if (by) windows.push(`${e.state}@${ctx.clock.now.toFixed(0)} par ${by.profile} (${ctx.require<FoyersApi>(CROWD_FOYERS).foyerOf(by.id)?.kind ?? 'cortège'})`);
    });
    await t.start(cfg({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'essai', x: -10, z: 15, crowdSize: 500, tension: 0.45, volatility: 0.9,
      duration: 'standard',
      extra: {
        moyens: MEANS, variante: 'terrain', foyers: 2, 'foyers.types': ['rassemblement', 'casseurs'], 'foyers.delai': 15, 'foyers.ecart': 20,
        'foyers.duree': 200, 'crowd.noAleas': true,
      },
    }));
    const api = ctx.require<FoyersApi>(CROWD_FOYERS);
    const core = ctx.require<CrowdCoreApi>(CROWD_CORE);
    // la simulation avance par tranches : entre deux, les tuiles de carte demandées autour des foyers se chargent
    const run = async (seconds: number): Promise<void> => {
      for (let left = seconds; left > 0; left -= 15) {
        t.step(Math.min(15, left));
        for (const f of api.list) await ctx.world.whenLoaded(f.x, f.z, 130);
      }
    };
    t.step(1);
    expect(api.planned).toBe(2);
    expect(api.list.length).toBe(0);
    t.step(17);
    expect(api.list.length).toBe(1);
    t.step(22);
    expect(api.list.length).toBe(2);
    expect(events.filter((e) => e.state === 'debut').length).toBe(2);
    const central = ctx.radio.log.filter((m) => m.from === 'CENTRAL' && m.channel === 'commandement');
    console.log('[foyers] radio :', central.map((m) => m.text).join(' | '));
    expect(central.length).toBeGreaterThanOrEqual(2);
    expect(central[0]!.text).toMatch(/rassemblement non déclaré/);
    expect(central[0]!.priority).toBe(2);

    // loin du parcours déclaré, et l'un de l'autre
    const route = ctx.director.route;
    const [rally, gang] = [api.list.find((f) => f.kind === 'rassemblement')!, api.list.find((f) => f.kind === 'casseurs')!];
    expect(rally).toBeDefined();
    expect(gang).toBeDefined();
    for (const f of [rally, gang]) {
      console.log(`[foyers] ${f.label} (${f.x.toFixed(0)}, ${f.z.toFixed(0)}) : ${f.people} personnes, à ${distToRoute(route, f.x, f.z).toFixed(0)} m du parcours`);
      expect(distToRoute(route, f.x, f.z)).toBeGreaterThan(150);
    }
    const rx = rally.x, rz = rally.z;
    await run(60);
    // de vraies personnes de la foule : pilotées par le module, hors cortège, rassemblées autour de leur point
    const members = (id: number): Person[] => core.members.filter((p) => api.foyerOf(p.id)?.id === id);
    const mine = members(rally.id);
    expect(mine.length).toBeGreaterThan(30);
    for (const p of mine) {
      const b = core.brain(p)!;
      expect(b).not.toBeNull();
      expect(b.slot).toBe(-1);
      expect(b.flags & CROWD_FLAG.FOYER).toBeTruthy();
      expect(b.flags & CROWD_FLAG.UNCOUNTED).toBeTruthy();
    }
    const dists = mine.map((p) => Math.hypot(p.x - rx, p.z - rz)).sort((a, b) => a - b);
    const median = dists[Math.floor(dists.length / 2)]!;
    console.log(`[foyers] rassemblement : ${mine.length} membres, distance médiane au centre ${median.toFixed(1)} m ; casseurs : ${members(gang.id).length}`);
    expect(median).toBeLessThan(25);
    expect(rally.tension).toBeGreaterThan(0);

    // nasse : une section redéployée dans le secteur (à 150 m environ) reçoit l'ordre d'encercler le rassemblement
    const me = ctx.player.person()!;
    const units = ctx.require<PoliceUnitsApi>(POLICE_UNITS_SERVICE);
    const rs = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    let sx = rx + 150, sz = rz;
    if (ctx.world.nearestRoad(sx, sz, rs as never, 80)) { sx = rs.x; sz = rs.z; }
    const section = units.createSection({ x: sx, z: sz, heading: Math.atan2(rx - sx, rz - sz), callsign: 'ORAGE' }).squad;
    const agents = (): Person[] => ctx.people.list.filter((p) => p.faction === 'police' && p.vehicleId === 0 && Math.hypot(p.x - sx, p.z - sz) < 400);
    const team = agents().map((p) => p.id);
    expect(team.length).toBeGreaterThan(10);
    const policeDist = (): number[] => team.map((id) => ctx.people.get(id)).filter((p): p is Person => !!p).map((p) => Math.hypot(p.x - rx, p.z - rz)).sort((a, b) => a - b);
    const d0 = policeDist();
    ctx.squads.issue(section.id, { type: 'encercler', x: rx, z: rz, width: 60, heading: 0, targetId: ENCIRCLE_CLOSE_ALL, issuedBy: me.id });
    t.step(10);
    const inside = members(rally.id).filter((p) => Math.hypot(p.x - rx, p.z - rz) < 28);
    const stranded = inside.filter((p) => core.brain(p)!.state === CROWD_STATE.STRANDED);
    expect(api.list.find((f) => f.id === rally.id)!.kettled).toBe(true);
    console.log(`[foyers] nasse : ${stranded.length}/${inside.length} membres se savent encerclés`);
    expect(stranded.length).toBeGreaterThan(inside.length * 0.5);
    await run(110);
    const d1 = policeDist();
    const med = (d: number[]): number => d[Math.floor(d.length / 2)]!;
    console.log(`[foyers] section ${section.name} (${team.length} agents) : distance médiane ${med(d0).toFixed(0)} → ${med(d1).toFixed(0)} m du rassemblement, la plus courte ${d1[0]!.toFixed(0)} m`);
    // les lignes ferment les issues sur le pourtour (rayon 30 m, voies qui débouchent sur la place)
    expect(med(d1)).toBeLessThan(Math.min(80, med(d0) - 60));
    expect(d1[0]!).toBeLessThan(40);

    // fin des foyers : annonce, puis chacun repart par les rues voisines
    const gangLeft0 = members(gang.id).length;
    await run(120);
    expect(events.filter((e) => e.state === 'fin').length).toBe(2);
    expect(api.list.length).toBe(0);
    expect(ctx.radio.log.some((m) => m.from === 'CENTRAL' && /dispers/.test(m.text))).toBe(true);
    expect(ctx.radio.log.some((m) => m.from === 'CENTRAL' && /individus cagoulés/.test(m.text))).toBe(true);
    const leaving = core.members.filter((p) => {
      const b = core.brain(p)!;
      return (b.flags & CROWD_FLAG.FOYER) !== 0 && (b.state === CROWD_STATE.LEAVE || (b.flags & CROWD_FLAG.LEAVING) !== 0);
    }).length;
    const gangLeft = core.members.filter((p) => (core.brain(p)!.flags & CROWD_FLAG.FOYER) !== 0 && Math.hypot(p.x - gang.x, p.z - gang.z) < 60).length;
    console.log('[foyers] vitrines :', windows.join(' ; ') || 'aucune');
    // la casse est réelle : vitrines brisées par les casseurs du foyer (événements shop:window)
    expect(windows.some((w) => w.startsWith('broken') && w.includes('(casseurs)'))).toBe(true);
    console.log(`[foyers] après la fin : ${leaving} en partance, casseurs encore sur place ${gangLeft} (sur ${gangLeft0})`);
    expect(gangLeft).toBeLessThan(Math.max(3, gangLeft0 * 0.5));
  }, 600000);
});
