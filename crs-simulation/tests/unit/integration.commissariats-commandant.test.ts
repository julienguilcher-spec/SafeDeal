// Commissariats et ordres du commandant (vraie carte de Paris), après la fusion avec « commandant-mission » et
// « colonne-tete-bloquee » : le commandant joue comme au clavier (fiche du commissariat, carte de commandement).
//   (b) il engage la section de réserve de la Cité (même chemin que la fiche du commissariat), l'envoie en véhicules,
//       et lui donne un autre ordre à l'arrivée, pendant que la colonne se gare : cet ordre tient, aucun « débarquez »
//       de fin de trajet ne le remplace, et ses agents descendent l'exécuter (b2 : même chose pour la compagnie) ;
//   (c) « Rentrer au commissariat » donné pendant que la colonne roule encore vers le point : elle fait demi-tour sans
//       deux-tons, sans débarquer au point, rentre, se gare dans ses places et se repose ; (c2) même ordre à un groupe
//       de la compagnie pendant le trajet de la journée : son fourgon quitte la colonne de la compagnie (qui continue
//       sans lui et arrive), rentre à la caserne sans deux-tons et ne reçoit pas le « débarquez » de la compagnie ;
//   (e) puis une deuxième partie dans le même processus : aucun reste de la première (convoi, retour sans urgence,
//       unité, véhicule tenu).
import { describe, expect, it } from 'vitest';

import type { GameContext, OrderType, RoadSample, SessionConfig, SquadOrder, Vehicle } from '@/core/contracts';
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
import { createSystems as session, JOURNEE_SERVICE, SERVICE_BASE } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats, COMMISSARIATS_SERVICE } from '@/gameplay/commissariats';
import type { CommissariatsApi } from '@/gameplay/commissariats';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import { entryNumber } from '@/ui/command/commissariatsModel';
import { COMMISSARIATS, isHeldVehicle } from '@/world/commissariats';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session, patrols, commissariats, command];
const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
const ROAD = (): RoadSample => ({ edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false });
const CONFIG = {
  mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 0,
  tension: 0.1, volatility: 0.1, duration: 'standard', extra: { moyens: MEANS, variante: 'terrain', foyers: 0 },
} as Partial<SessionConfig>;

interface ConvoyLike {
  convoyOf(id: number): { stage: string; vehicles: number } | null;
  quietRun?(vehicleId: number): boolean;
}

/** Ordres reçus par les unités (type), relevés à la source : ctx.squads.issue. */
function recordOrders(ctx: GameContext): { squadId: number; type: string; at: number }[] {
  const out: { squadId: number; type: string; at: number }[] = [];
  const issue = ctx.squads.issue.bind(ctx.squads);
  (ctx.squads as { issue: typeof issue }).issue = (id: number, o: Partial<SquadOrder> & { type: OrderType }) => {
    out.push({ squadId: id, type: String(o.type), at: ctx.clock.now });
    return issue(id, o as never);
  };
  return out;
}

/** L'unité et toutes ses subordonnées. */
function subtree(ctx: GameContext, id: number): Set<number> {
  const out = new Set<number>([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const s of ctx.squads.list) if (!out.has(s.id) && out.has(s.parentId)) { out.add(s.id); grew = true; }
  }
  return out;
}

/** L'unité est-elle sous `root` (ou `root` elle-même) ? */
function rootIs(ctx: GameContext, id: number, root: number): boolean {
  for (let q = ctx.squads.get(id), g = 0; q && g < 8; q = q.parentId ? ctx.squads.get(q.parentId) : undefined, g++) if (q.id === root) return true;
  return false;
}

/** Point sur la chaussée à `dist` m de la sortie du site, vers l'intérieur de la carte. */
function roadFrom(ctx: GameContext, siteId: string, dist: number): RoadSample {
  const def = COMMISSARIATS.find((c) => c.id === siteId)!;
  const ang = Math.atan2(1500 - def.exit.x, 0 - def.exit.z);
  const road = ROAD();
  expect(ctx.world.nearestRoad(def.exit.x + Math.sin(ang) * dist, def.exit.z + Math.cos(ang) * dist, road, 200)).toBe(true);
  return road;
}

async function start(seed: number) {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start(CONFIG);
  t.step(1);
  const ctx = t.ctx;
  for (const c of COMMISSARIATS) await ctx.world.whenLoaded(c.door.x, c.door.z, 260);
  return { t, ctx, api: ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE), core: ctx.require<CommandCore>('ui.command'), cmd: ctx.require<ConvoyLike>('police.command') };
}

describe('commissariats et ordres du commandant', () => {
  it('(b) section de réserve de la Cité engagée, ordre donné à l’arrivée : il tient, pas de « débarquez »', async () => {
    const { t, ctx, api, core, cmd } = await start(11);
    const orders = recordOrders(ctx);
    const r = core.engageFromCommissariat(entryNumber('cite:aquilon1'));
    expect(r.ok, r.reason).toBe(true);
    const sq = ctx.squads.get(r.squadId)!;
    const road = roadFrom(ctx, 'cite', 520);
    expect(core.issue('faire_mouvement', [sq], [{ x: road.x, z: road.z, heading: road.heading, width: 0 }]).ok).toBe(true);
    // la colonne roule ; le commandant donne son ordre quand elle arrive (stationnement, ou tête à moins de 120 m), le
    // chef de section à moins de 140 m du point de l'ordre — au-delà de 150 m, une unité assise y va en véhicules, dans
    // une nouvelle colonne (direct/travel.ts motorizes, la règle de la fiche et du terrain)
    const tx = road.x + Math.sin(road.heading) * 35, tz = road.z + Math.cos(road.heading) * 35;
    const chief = (): number => { const p = ctx.people.get(sq.leaderId); return p ? Math.hypot(p.x - tx, p.z - tz) : Infinity; };
    let at = -1;
    let stageAt = '';
    for (let s = 0; s < 600 && at < 0; s++) {
      t.step(1);
      const st = cmd.convoyOf(sq.id);
      const lead = api.entry('cite:aquilon1')!.vehicleIds.map((id) => ctx.vehicles.get(id)!).filter(Boolean)
        .reduce((m, v) => Math.min(m, Math.hypot(v.x - road.x, v.z - road.z)), Infinity);
      if (st && (st.stage === 'stationnement' || (st.stage === 'route' && lead < 120)) && chief() < 140) { at = ctx.clock.now; stageAt = `${st.stage}, tête à ${lead.toFixed(0)} m`; }
    }
    expect(at, 'la colonne arrive').toBeGreaterThan(0);
    // « Tenir une ligne » 35 m plus loin, au même endroit pour toute la section
    expect(core.issue('ligne', [sq], [{ x: tx, z: tz, heading: road.heading, width: 20 }]).ok).toBe(true);
    for (let s = 0; s < 150; s++) {
      t.step(1);
      const st = cmd.convoyOf(sq.id);
      if (st && st.stage === 'en_place' && s > 40) break;
    }
    t.step(30);
    const tree = subtree(ctx, sq.id);
    const after = orders.filter((o) => o.at >= at && tree.has(o.squadId));
    const disembark = after.filter((o) => o.type === 'debarquer');
    const members = [...tree].flatMap((id) => ctx.squads.get(id)!.members).map((id) => ctx.people.get(id)!).filter((p) => p && !p.isPlayer);
    const near = members.filter((p) => p.vehicleId === 0 && Math.hypot(p.x - tx, p.z - tz) < 45).length;
    console.log(`(b) ordre donné à l'arrivée (${stageAt}) ; ordres reçus ensuite : ${after.map((o) => o.type).join(', ')} ; `
      + `colonne ${cmd.convoyOf(sq.id)?.stage} ; section ${sq.order.type} ; ${near}/${members.length} agents à pied à moins de 45 m de la ligne`);
    for (const id of tree) {
      const q = ctx.squads.get(id)!;
      const ps = q.members.map((m) => ctx.people.get(m)!).filter(Boolean);
      console.log(`   ${q.name} (${q.kind}) ordre ${q.order.type} : ${ps.map((p) => `${p.vehicleId ? 'à bord' : 'à pied'} ${Math.hypot(p.x - tx, p.z - tz).toFixed(0)} m`).join(', ')}`);
    }
    expect(disembark.map((o) => ctx.squads.get(o.squadId)!.name)).toEqual([]);
    expect(sq.order.type).toBe('ligne');
    expect(near).toBeGreaterThanOrEqual(Math.ceil(members.length * 0.6));
    expect(api.entry('cite:aquilon1')!.state).toBe('engage');
  }, 900000);

  it('(b2) section de la compagnie : ordre à pied donné à ses groupes près des fourgons pendant l’arrivée — ils descendent l’exécuter', async () => {
    // (même défaut sans commissariat : « commandant-mission » ne remplaçait plus l'ordre par le « débarquez », mais les
    // agents restaient assis dans leurs fourgons, l'ordre « Tenir une ligne » affiché — « ils ne suivaient pas »)
    const { t, ctx, cmd, core } = await start(11);
    const sq = ctx.squads.list.find((s) => s.kind === 'section' && s.faction === 'police' && s.parentId === 0)
      ?? ctx.squads.list.find((s) => s.kind === 'section' && s.faction === 'police')!;
    const groups = ctx.squads.list.filter((q) => q.parentId === sq.id);
    expect(groups.length).toBeGreaterThan(1);
    const lead0 = ctx.people.get(groups[0]!.leaderId)!;
    const road = ROAD();
    expect(ctx.world.nearestRoad(lead0.x + 450, lead0.z - 150, road, 200)).toBe(true);
    expect(core.issue('faire_mouvement', [sq], [{ x: road.x, z: road.z, heading: road.heading, width: 0 }]).ok).toBe(true);
    const vs = (): Vehicle[] => ctx.vehicles.list.filter((v) => v.seats.some((id) => id !== 0 && groups.some((q) => q.members.includes(id))));
    let arrived = false;
    for (let s = 0; s < 600 && !arrived; s++) {
      t.step(1);
      const st = cmd.convoyOf(sq.id);
      const d = Math.min(...vs().map((v) => Math.hypot(v.x - road.x, v.z - road.z)));
      arrived = !!st && (st.stage === 'stationnement' || (st.stage === 'route' && d < 50));
    }
    expect(arrived).toBe(true);
    // « Tenir une ligne » 25 m devant le fourgon de tête : à moins de 250 m, sans nouveau trajet en véhicules
    const lv = vs().sort((a, b) => Math.hypot(a.x - road.x, a.z - road.z) - Math.hypot(b.x - road.x, b.z - road.z))[0]!;
    const tx = lv.x + Math.sin(lv.heading) * 25, tz = lv.z + Math.cos(lv.heading) * 25;
    const direct = groups.filter((q) => { const l = ctx.people.get(q.leaderId); return !!l && Math.hypot(l.x - tx, l.z - tz) < 200; });
    expect(direct.length).toBeGreaterThan(0);
    expect(core.issue('ligne', direct, [{ x: tx, z: tz, heading: lv.heading, width: 20 }]).ok).toBe(true);
    t.step(150);
    const out: string[] = [];
    let aboard = 0;
    for (const q of direct) {
      const ps = q.members.map((id) => ctx.people.get(id)!).filter((p) => p && p.poste !== 'conducteur');
      const on = ps.filter((p) => p.vehicleId !== 0).length;
      aboard += on;
      out.push(`${q.name} ${q.order.type} : ${on}/${ps.length} encore à bord, à ${(ps.reduce((a, p) => a + Math.hypot(p.x - tx, p.z - tz), 0) / Math.max(1, ps.length)).toFixed(0)} m de la ligne`);
      expect(q.order.type).toBe('ligne');
    }
    console.log(`(b2) ${out.join(' ; ')}`);
    expect(aboard).toBe(0);
  }, 900000);

  it('(c2) journée de service : « Rentrer au commissariat » à un groupe pendant le trajet de la compagnie', async () => {
    const t = createTestContext({ seed: 5, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la République', x: 3123, z: -208, crowdSize: 100, tension: 0.2,
      volatility: 0.2, duration: 'standard', extra: { moyens: { ...MEANS, sections: 2, fourgons: 6 }, journee: true },
    } as never);
    const ctx = t.ctx;
    const j = ctx.require<JourneeApi>(JOURNEE_SERVICE);
    const core = ctx.require<CommandCore>('ui.command');
    const cmd = ctx.require<ConvoyLike>('police.command');
    const api = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const orders = recordOrders(ctx);
    const me = ctx.player.person()!;
    const company = ctx.squads.list.find((s) => s.kind === 'compagnie')!;
    // le commandant monte dans son VL, la colonne part
    for (let i = 0; i < 40 && me.vehicleId === 0; i++) {
      t.step(3);
      const vl = ctx.vehicles.list.find((v) => v.faction === 'police' && v.kind === 'vl_commandement' && v.seats[0] !== 0 && v.seats.some((id, k) => id === 0 && k > 0));
      if (vl) { me.x = vl.x + 2.5; me.z = vl.z; ctx.vehicles.enter(me, vl, 'passenger'); }
    }
    for (let i = 0; i < 300 && j.stage !== 'route'; i++) t.step(1);
    expect(j.stage).toBe('route');
    t.step(60);
    const n0 = cmd.convoyOf(company.id)!.vehicles;
    const g = ctx.squads.list.find((s) => s.kind === 'groupe' && rootIs(ctx, s.id, company.id) && /1 ALFA$/.test(s.name))!;
    const van = ctx.vehicles.get(g.vehicleId)!;
    const dest = j.destination!;
    const d0 = Math.hypot(van.x - SERVICE_BASE.x, van.z - SERVICE_BASE.z);
    const res = core.issue('retour_poste' as OrderType, [g], null);
    expect(res.ok, res.reason).toBe(true);
    const recallAt = ctx.clock.now;
    let sirens = 0;
    let closest = Infinity;
    for (let s = 0; s < 400 && !['repos', 'au_poste'].includes(api.entryOf(g.id)?.state ?? ''); s++) {
      t.step(1);
      if (van.siren !== 0) sirens++;
      closest = Math.min(closest, Math.hypot(van.x - dest.x, van.z - dest.z));
    }
    const back = Math.hypot(van.x - SERVICE_BASE.x, van.z - SERVICE_BASE.z);
    const st = api.entryOf(g.id)?.state;
    const n1 = cmd.convoyOf(company.id)?.vehicles ?? -1;
    console.log(`(c2) ${g.name} rappelé à ${d0.toFixed(0)} m de la caserne : ${st} après ${(ctx.clock.now - recallAt).toFixed(0)} s, fourgon à ${back.toFixed(0)} m de la caserne ; `
      + `deux-tons ${sirens} relevés ; au plus près du rassemblement ${closest.toFixed(0)} m ; colonne de la compagnie ${n0} → ${n1} véhicules`);
    expect(['repos', 'au_poste']).toContain(st);
    expect(back).toBeLessThan(120);
    expect(sirens).toBe(0);
    expect(n1).toBe(n0 - 1);
    // la compagnie continue sans lui et arrive ; le groupe rentré ne reçoit pas son « débarquez »
    for (let i = 0; i < 200 && j.stage === 'route'; i++) t.step(5);
    t.step(30);
    expect(j.stage).toBe('sur_place');
    const ownDisembark = orders.filter((o) => o.at >= recallAt && o.squadId === g.id && o.type === 'debarquer');
    const others = ctx.squads.list.filter((s) => s.kind === 'groupe' && s.id !== g.id && rootIs(ctx, s.id, company.id));
    const othersAboard = others.flatMap((s) => s.members.map((id) => ctx.people.get(id)!)).filter((p) => p && p.vehicleId !== 0 && p.poste !== 'conducteur').length;
    console.log(`(c2) compagnie ${j.stage} ; « débarquez » reçus par ${g.name} : ${ownDisembark.length} ; agents des autres groupes encore à bord : ${othersAboard}`);
    expect(ownDisembark).toEqual([]);
    expect(othersAboard).toBe(0);
  }, 1500000);

  it('(c)+(e) « Rentrer au commissariat » en route vers le point : demi-tour sans deux-tons, garée, au repos ; puis une partie propre', async () => {
    const { t, ctx, api, core, cmd } = await start(13);
    const orders = recordOrders(ctx);
    const r = core.engageFromCommissariat(entryNumber('cite:aquilon1'));
    expect(r.ok, r.reason).toBe(true);
    const sq = ctx.squads.get(r.squadId)!;
    const road = roadFrom(ctx, 'cite', 900);
    expect(core.issue('faire_mouvement', [sq], [{ x: road.x, z: road.z, heading: road.heading, width: 0 }]).ok).toBe(true);
    const vs = (): Vehicle[] => api.entry('cite:aquilon1')!.vehicleIds.map((id) => ctx.vehicles.get(id)!).filter(Boolean);
    // en route : la colonne a quitté la Cité depuis 30 s (tous à bord, tête partie de plus de 120 m)
    const def = COMMISSARIATS.find((c) => c.id === 'cite')!;
    let rolling = -1;
    for (let s = 0; s < 400; s++) {
      t.step(1);
      const st = cmd.convoyOf(sq.id);
      const far = vs().some((v) => Math.hypot(v.x - def.door.x, v.z - def.door.z) > 120);
      if (st && st.stage === 'route' && far && rolling < 0) rolling = ctx.clock.now;
      if (rolling > 0 && ctx.clock.now - rolling > 30) break;
    }
    expect(rolling, 'la colonne roule vers le point').toBeGreaterThan(0);
    const toPoint = Math.min(...vs().map((v) => Math.hypot(v.x - road.x, v.z - road.z)));
    expect(toPoint).toBeGreaterThan(150);
    const res = core.issue('retour_poste' as OrderType, [sq], null);
    expect(res.ok, res.reason).toBe(true);
    expect(api.entry('cite:aquilon1')!.state).toBe('retour');
    const recallAt = ctx.clock.now;
    let sirens = 0;
    let quiet = 0;
    let nearPoint = Infinity;
    for (let s = 0; s < 900 && api.entry('cite:aquilon1')!.state === 'retour'; s++) {
      t.step(1);
      for (const v of vs()) {
        if (v.siren !== 0) sirens++;
        if (cmd.quietRun && cmd.quietRun(v.id)) quiet++;
        nearPoint = Math.min(nearPoint, Math.hypot(v.x - road.x, v.z - road.z));
      }
    }
    const tree = subtree(ctx, sq.id);
    const disembark = orders.filter((o) => o.at >= recallAt && tree.has(o.squadId) && o.type === 'debarquer');
    const st = api.entry('cite:aquilon1')!.state;
    console.log(`(c) rappel à ${toPoint.toFixed(0)} m du point ; état ${st} après ${(ctx.clock.now - recallAt).toFixed(0)} s ; `
      + `au plus près du point ensuite ${nearPoint.toFixed(0)} m ; deux-tons ${sirens} relevés ; trajet sans urgence ${quiet} relevés ; débarquez ${disembark.length}`);
    expect(['repos', 'au_poste']).toContain(st);
    expect(sirens).toBe(0);
    expect(quiet).toBeGreaterThan(0);
    expect(disembark).toEqual([]);
    // (sans contresens ni demi-tour sur place, elle va jusqu'au prochain carrefour qui la ramène : jamais jusqu'au point)
    expect(nearPoint).toBeGreaterThan(150);
    for (const v of vs()) expect(def.slots.some((s) => Math.hypot(s.x - v.x, s.z - v.z) < 1.5), `${v.kind}#${v.id} sur une place`).toBe(true);

    // (e) une autre unité en plein retour sans urgence, puis une nouvelle partie
    const r2 = core.engageFromCommissariat(entryNumber('celestins:epervier9'));
    expect(r2.ok, r2.reason).toBe(true);
    const sq2 = ctx.squads.get(r2.squadId)!;
    const road2 = roadFrom(ctx, 'celestins', 600);
    expect(core.issue('faire_mouvement', [sq2], [{ x: road2.x, z: road2.z, heading: road2.heading, width: 0 }]).ok).toBe(true);
    t.step(90);
    expect(core.issue('retour_poste' as OrderType, [sq2], null).ok).toBe(true);
    t.step(20);
    const old = [sq.id, sq2.id];
    await t.start(CONFIG);
    t.step(2);
    const ctx2 = t.ctx;
    const api2 = ctx2.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const cmd2 = ctx2.require<ConvoyLike>('police.command');
    const entries = api2.list.flatMap((c) => c.entries);
    expect(entries.every((e) => e.state === 'au_poste' && e.squadId === 0)).toBe(true);
    expect(ctx2.vehicles.list.filter((v) => isHeldVehicle(ctx2, v.id)).length).toBe(32);
    for (const id of old) expect(cmd2.convoyOf(id)).toBeNull();
    expect(ctx2.vehicles.list.filter((v) => cmd2.quietRun && cmd2.quietRun(v.id)).map((v) => v.id)).toEqual([]);
    // et la section se réengage et repart en urgence (deux-tons)
    const core2 = ctx2.require<CommandCore>('ui.command');
    const again = core2.engageFromCommissariat(entryNumber('cite:aquilon1'));
    expect(again.ok).toBe(true);
    const road3 = roadFrom(ctx2, 'cite', 520);
    expect(core2.issue('faire_mouvement', [ctx2.squads.get(again.squadId)!], [{ x: road3.x, z: road3.z, heading: road3.heading, width: 0 }]).ok).toBe(true);
    let siren2 = 0;
    for (let s = 0; s < 120; s++) {
      t.step(1);
      for (const id of api2.entry('cite:aquilon1')!.vehicleIds) if (ctx2.vehicles.get(id)?.siren !== 0) siren2++;
    }
    console.log(`(e) deuxième partie : stock complet, aucun convoi ni retour sans urgence restés ; réengagée : deux-tons ${siren2} relevés`);
    expect(siren2).toBeGreaterThan(0);
  }, 1500000);
});
