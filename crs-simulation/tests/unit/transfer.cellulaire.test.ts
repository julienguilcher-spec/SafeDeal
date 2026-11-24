// Transfert des interpellés au commissariat et fourgon de relève (plan ordres-directs §5.5, paquet P14), sur la vraie
// carte de Paris, interpellés mis au fourgon par le joueur lui-même (trois appuis, puis « Remettre ») :
//  - avec les commissariats : le fourgon plein part au commissariat le plus proche par la route, sans deux-tons ; à
//    l'arrivée, ses interpellés y sont remis à l'officier de police judiciaire (ils quittent la scène) et comptés là
//    (relevé « déposé », service transfer.delivered) ; à chaque seconde, un fourgon avec une place libre reste à
//    moins de 150 m du point de remise ; quand les places sur place manquent, le cellulaire du commissariat le plus
//    proche vient prendre la remise ; le fourgon revient au point de remise après son repos ;
//  - sans le module des commissariats : « Partir au commissariat » (ordre du joueur) est obéi tout de suite, le fourgon
//    roule hors du secteur, ses interpellés sont remis dans les 120 s, il revient ; le dernier fourgon sur place qui se
//    remplit fait venir un fourgon de renfort, créé à 400 m au moins, hors de la vue du joueur.
import { describe, expect, it } from 'vitest';
import type { GameContext, InteractionOption, ModuleFactory, Person, SessionConfig, Squad, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as env } from '@/env';
import { createWorldQuerySystems } from '@/world/query';
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
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats, COMMISSARIATS_SERVICE, COMMISSARIAT_RETURNED_EVENT } from '@/gameplay/commissariats';
import type { CommissariatReturnedEvent, CommissariatsApi } from '@/gameplay/commissariats';
import { homeName } from '@/gameplay/commissariats/texts';
import type { LawCustody } from '@/gameplay/law/api';
import { LAW_CUSTODY_SERVICE } from '@/gameplay/law/api';
import { createSystems as transfer, TRANSFER_DELIVERED_EVENT, TRANSFER_RELIEF_EVENT, TRANSFER_SERVICE } from '@/gameplay/transfer';
import type { TransferApi, TransferDeliveredEvent, TransferReliefEvent } from '@/gameplay/transfer';
import type { LawRecords } from '@/gameplay/law/api';
import { LAW_RECORDS_SERVICE } from '@/gameplay/law/api';
import { REMISE_SERVICE } from '@/gameplay/session/remise';
import type { RemiseApi } from '@/gameplay/session/remise';
import { commissariatById } from '@/world/commissariats';
import { buildSessionConfig, defaultDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';

const world = () => createWorldQuerySystems({ source: 'paris' });
const BASE: ModuleFactory[] = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session];
const WITH_STATIONS: ModuleFactory[] = [...BASE, patrols, commissariats, transfer];
const WITHOUT_STATIONS: ModuleFactory[] = [...BASE, transfer];

type Ctx = ReturnType<typeof createTestContext>;

interface Run {
  t: Ctx;
  ctx: GameContext;
  me: Person;
  api: TransferApi;
}

async function freeSession(modules: ModuleFactory[], placeName: string, seed: number): Promise<Run> {
  const place = DEFAULT_PLACES.find((p) => p.name === placeName)!;
  const d: ScenarioDraft = {
    ...defaultDraft(), role: 'commandant' as never, rank: 'commandant' as never, poste: 'commandant_unite' as never, variante: '',
    place: place.name, x: place.x, z: place.z, crowdSize: 150, seed,
  };
  d.mode = 'libre';
  d.options = { ...d.options, journee: false };
  const t = createTestContext({ seed, strict: false, modules });
  await t.start(buildSessionConfig(d));
  t.step(3);
  // la compagnie tient sa ligne (sinon elle suit le commandant jusqu'aux fourgons, et le point de remise la suit)
  const me = t.ctx.player.person()!;
  const company = t.ctx.squads.get(me.squadId)!;
  t.ctx.squads.issue(company.id, { type: 'tenir', targetId: 0, issuedBy: me.id, byPlayer: true });
  t.step(2);
  return { t, ctx: t.ctx, me, api: t.ctx.require<TransferApi>(TRANSFER_SERVICE) };
}

function vans(ctx: GameContext): { v: Vehicle; s: Squad }[] {
  const out: { v: Vehicle; s: Squad }[] = [];
  for (const s of ctx.squads.list) {
    const v = s.faction === 'police' && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
    if (v && v.kind === 'fourgon_cellulaire' && s.kind === 'equipage') out.push({ v, s });
  }
  return out;
}

function freeCells(v: Vehicle): number {
  let n = 0;
  for (let i = 0; i < v.def.seats.length; i++) if (v.def.seats[i]!.role === 'passenger' && v.seats[i] === 0) n++;
  return n;
}

function detainees(ctx: GameContext, v: Vehicle): Person[] {
  const out: Person[] = [];
  for (const id of v.seats) {
    const p = id !== 0 ? ctx.people.get(id) : undefined;
    if (p && p.custody === 'in_vehicle') out.push(p);
  }
  return out;
}

/** Fourgons avec au moins une place libre à moins de 150 m du point de remise. */
function covering(ctx: GameContext, point: { x: number; z: number }): number {
  let n = 0;
  for (const { v } of vans(ctx)) if (freeCells(v) > 0 && Math.hypot(v.x - point.x, v.z - point.z) <= 150) n++;
  return n;
}

function moveTo(r: Run, x: number, z: number, heading = r.me.heading): void {
  r.me.x = x;
  r.me.z = z;
  r.me.y = r.ctx.world.heightAt(x, z);
  r.me.heading = heading;
  r.me.aimYaw = heading;
  r.ctx.people.rebuildIndex();
}

function press(r: Run): InteractionOption {
  const opts: InteractionOption[] = [];
  r.ctx.interactions.options(r.me, opts);
  const top = opts[0];
  if (!top) {
    const near = r.ctx.people.list.filter((p) => !p.isPlayer && Math.hypot(p.x - r.me.x, p.z - r.me.z) < 3).map((p) => `${p.name} ${p.faction} ${p.custody} ${Math.hypot(p.x - r.me.x, p.z - r.me.z).toFixed(1)} m`);
    console.log(`aucune invite : joueur (${r.me.x.toFixed(1)}, ${r.me.z.toFixed(1)}) véhicule ${r.me.vehicleId} porte ${r.me.carrying} ; autour : ${near.join(' ; ')}`);
  }
  expect(top, 'une invite').toBeDefined();
  const copy = { ...top! };
  expect(r.ctx.interactions.start(r.me, top!)).toBe(true);
  const cur = r.ctx.interactions.current(r.me);
  if (cur) r.t.step(cur.opt.duration + 0.2);
  return copy;
}

let named = 0;

/**
 * Le joueur interpelle lui-même un auteur de fait constaté à côté du fourgon (interpeller, menotter, palper) puis le
 * remet au fourgon (« Remettre … »). Retourne l'interpellé, à bord.
 */
/** Place du joueur à côté du fourgon (7 m sur un flanc, ou derrière), libre pour lui et pour l'auteur devant lui. */
function besideVan(r: Run, v: Vehicle): { x: number; z: number; h: number } {
  const w = r.ctx.world;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  for (const [lat, lon] of [[7, 0], [-7, 0], [0, -9], [7, -4], [-7, -4], [0, 10]] as const) {
    const x = v.x + fz * lat + fx * lon, z = v.z - fx * lat + fz * lon;
    const tx = x + fx * 1.2, tz = z + fz * 1.2;
    if (w.isFree(x, z, 0.6) && w.isFree(tx, tz, 0.6)) return { x, z, h: v.heading };
  }
  return { x: v.x + fz * 7, z: v.z - fx * 7, h: v.heading };
}

function arrestInto(r: Run, v: Vehicle): Person {
  const { ctx, me } = r;
  const at = besideVan(r, v);
  moveTo(r, at.x, at.z, at.h);
  const target = ctx.people.spawn({ kind: 'manifestant', x: me.x + Math.sin(me.heading) * 1.2, z: me.z + Math.cos(me.heading) * 1.2, name: `Interpellé ${++named}` });
  ctx.law.recordOffense(target, 'jet_projectile', target.x, target.z, 2).witnessed = true;
  ctx.people.rebuildIndex();
  for (let i = 0; i < 8 && target.custody !== 'held'; i++) {
    target.x = me.x + Math.sin(me.heading) * 1.2;
    target.z = me.z + Math.cos(me.heading) * 1.2;
    ctx.people.rebuildIndex();
    expect(press(r).verb).toBe('maitriser');
    if ((target.custody as string) !== 'held') r.t.step(2.1);
  }
  expect(target.custody).toBe('held');
  expect(press(r).verb).toBe('menotter');
  expect(press(r).verb).toBe('palper');
  // toujours à côté du fourgon (il n'a pas bougé : rien ne le conduit)
  moveTo(r, at.x, at.z, at.h);
  const fourth = press(r);
  if (fourth.verb !== 'remettre') {
    const ap = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason: string } }>('vehicles.autopilot')!.status(v);
    const tr = ctx.service<TransferApi>(TRANSFER_SERVICE)?.view(ctx.squads.list.find((s) => s.vehicleId === v.id)!.id);
    console.log(`fourgon à ${Math.hypot(v.x - me.x, v.z - me.z).toFixed(1)} m, ${freeCells(v)} places, pilote ${ap.mode}/${ap.state}/${ap.reason}, transfert ${JSON.stringify(tr)}`);
  }
  expect(fourth.verb, fourth.label).toBe('remettre');
  expect(target.custody).toBe('in_vehicle');
  return target;
}

/** Les trois premiers appuis sur un auteur posé devant le joueur, là où il est. */
function threePresses(r: Run): Person {
  const { ctx, me } = r;
  const target = ctx.people.spawn({ kind: 'manifestant', x: me.x + Math.sin(me.heading) * 1.2, z: me.z + Math.cos(me.heading) * 1.2, name: `Interpellé ${++named}` });
  ctx.law.recordOffense(target, 'jet_projectile', target.x, target.z, 2).witnessed = true;
  ctx.people.rebuildIndex();
  for (let i = 0; i < 8 && target.custody !== 'held'; i++) {
    target.x = me.x + Math.sin(me.heading) * 1.2;
    target.z = me.z + Math.cos(me.heading) * 1.2;
    ctx.people.rebuildIndex();
    expect(press(r).verb).toBe('maitriser');
    if ((target.custody as string) !== 'held') r.t.step(2.1);
  }
  expect(press(r).verb).toBe('menotter');
  expect(press(r).verb).toBe('palper');
  return target;
}

/** Longueur de l'itinéraire routier (m ; ∞ sans chemin). */
function routeLength(ctx: GameContext, v: Vehicle, x: number, z: number): number {
  const path: number[] = [];
  if (!ctx.world.findPath(v.x, v.z, x, z, 'vehicle', path, { heading: v.heading, uturn: 30, contraflow: 3, minWidth: v.def.width + 1.2 })) return Infinity;
  let len = 0;
  for (let i = 2; i < path.length; i += 2) len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
  return len;
}

describe('transfert au commissariat et fourgon de relève (vraie carte)', () => {
  it('avec les commissariats : plein, il part au plus proche par la route ; remis et comptés là ; toujours un fourgon sur place ; relève du commissariat ; retour', async () => {
    const r = await freeSession(WITH_STATIONS, 'Place de la République', 5);
    const { t, ctx, api } = r;
    const stations = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    expect(stations.enabled).toBe(true);
    const records = ctx.require<LawRecords>(LAW_RECORDS_SERVICE);
    const point = ctx.require<RemiseApi>(REMISE_SERVICE).point()!;
    expect(point).not.toBeNull();
    const returned: CommissariatReturnedEvent[] = [];
    ctx.events.onAny(COMMISSARIAT_RETURNED_EVENT, (e) => returned.push(e as CommissariatReturnedEvent));
    const reliefs: TransferReliefEvent[] = [];
    ctx.events.onAny(TRANSFER_RELIEF_EVENT, (e) => reliefs.push(e as TransferReliefEvent));
    const list = vans(ctx);
    expect(list.length).toBe(2);
    const [first, second] = list as [{ v: Vehicle; s: Squad }, { v: Vehicle; s: Squad }];

    // le commissariat le plus proche du premier fourgon par la route (préfecture et commissariats)
    let nearest = '';
    let nd = Infinity;
    for (const c of stations.list) {
      if (c.kind === 'caserne_gendarmerie') continue;
      const d = routeLength(ctx, first.v, c.returnX, c.returnZ);
      if (d < nd) { nd = d; nearest = c.id; }
    }
    expect(nearest).not.toBe('');
    const station = homeName(commissariatById(nearest)!);

    // le joueur le remplit : huit interpellés
    const ids: number[] = [];
    let minCover = Infinity;
    const t0 = ctx.clock.now;
    while (freeCells(first.v) > 0) {
      ids.push(arrestInto(r, first.v).id);
      minCover = Math.min(minCover, covering(ctx, point));
      expect(ids.length).toBeLessThanOrEqual(8);
    }
    expect(ids.length).toBe(8);
    t.step(2);
    const view = api.view(first.s.id)!;
    console.log(`plein en ${(ctx.clock.now - t0).toFixed(0)} s ; ${view.stage} — « ${view.line} » ; plus proche : ${station} (${nd.toFixed(0)} m)`);
    expect(view.stage).toBe('aller');
    expect(view.station).toBe(station);
    // (la radio passe le message dans la file du canal de commandement)
    const heard = () => ctx.radio.log.filter((m) => m.t >= t0 && m.from === first.s.name && / part (au|à la) /.test(m.text));
    for (let k = 0; k < 100 && heard().length === 0; k++) t.step(1);
    const said = heard();
    if (said.length === 0) console.log(ctx.radio.log.filter((m) => m.t >= t0).map((m) => `${m.t.toFixed(0)} ${m.from}: ${m.text}`).join('\n'));
    expect(said.length, 'départ annoncé à la radio').toBe(1);
    expect(said[0]!.text).toBe(`${first.s.name} part ${station.startsWith('préfecture') ? 'à la' : 'au'} ${station} avec 8 interpellés. ${second.s.name} prend la remise.`);
    expect(api.leaving(first.v.id)).toBe(true);

    // le second se remplit à moitié et plus : la relève vient du commissariat le plus proche
    for (let i = 0; i < 6; i++) {
      arrestInto(r, second.v);
      minCover = Math.min(minCover, covering(ctx, point));
    }
    t.step(3);
    console.log(`relèves : ${reliefs.map((e) => `${ctx.squads.get(e.squadId)?.name} (${e.source})`).join(', ')}`);
    expect(reliefs.length).toBeGreaterThanOrEqual(1);
    expect(reliefs[0]!.source).toBe('commissariat');
    const relief = ctx.squads.get(reliefs[0]!.squadId)!;
    expect(relief.name).toMatch(/^CELLULAIRE 75-\d\d$/);
    expect(relief.parentId, 'relève rattachée à la compagnie').toBe(first.s.parentId);
    expect(stations.entryOf(relief.id)?.state).not.toBe('au_poste');

    // jusqu'au retour du premier : arrivée au commissariat, remise, repos, retour au point de remise
    let arrivedAt = -1;
    let reliefOnSite = -1;
    let backAt = -1;
    for (let k = 0; k < 2400 && backAt < 0; k++) {
      t.step(1);
      minCover = Math.min(minCover, covering(ctx, point));
      if (arrivedAt < 0 && returned.some((e) => e.squadId === first.s.id)) arrivedAt = ctx.clock.now;
      const rv = ctx.vehicles.get(relief.vehicleId);
      if (reliefOnSite < 0 && rv && Math.hypot(rv.x - point.x, rv.z - point.z) <= 150 && api.view(relief.id)?.stage === 'sur_place') reliefOnSite = ctx.clock.now;
      if (arrivedAt > 0 && api.view(first.s.id)?.stage === 'sur_place' && Math.hypot(first.v.x - point.x, first.v.z - point.z) <= 150) backAt = ctx.clock.now;
    }
    console.log(`arrivé au commissariat à ${(arrivedAt - t0).toFixed(0)} s, relève sur place à ${(reliefOnSite - t0).toFixed(0)} s, revenu à ${(backAt - t0).toFixed(0)} s ; au moins ${minCover} fourgon(s) avec une place sur place`);
    expect(arrivedAt, 'arrivé au commissariat').toBeGreaterThan(0);
    const ev = returned.find((e) => e.squadId === first.s.id)!;
    expect(ev.commissariatId).toBe(nearest);
    expect(ev.detainees).toBe(8);
    for (const id of ids) {
      expect(ctx.people.get(id), 'remis : il a quitté la scène').toBeUndefined();
      const rec = records.lastArrestOf(id)!;
      expect(rec.status).toBe('depose');
      expect(rec.station).toBe(station);
    }
    // (le second, six interpellés, a pu partir à son tour : six minutes après le premier, deux sans nouveau)
    const total = api.delivered.reduce((n, d) => n + d.count, 0);
    console.log(`remis : ${api.delivered.map((d) => `${d.count} au ${d.station}`).join(', ')}`);
    expect(api.delivered[0]!.station).toBe(station);
    expect(api.delivered[0]!.count).toBeGreaterThanOrEqual(8);
    expect(records.stats().atStation, 'compte rendu = relevés').toBe(total);
    expect(reliefOnSite, 'relève sur place').toBeGreaterThan(0);
    expect(backAt, 'revenu au point de remise').toBeGreaterThan(0);
    expect(freeCells(first.v) + detainees(ctx, first.v).length).toBe(8);
    expect(minCover, 'à chaque seconde, un fourgon avec une place à moins de 150 m du point de remise').toBeGreaterThanOrEqual(1);
  }, 1800000);

  it('sans les commissariats : ordre du joueur obéi tout de suite, remise hors carte en 120 s, retour ; le dernier fourgon fait venir un renfort', async () => {
    const r = await freeSession(WITHOUT_STATIONS, 'Place de la République', 5);
    const { t, ctx, api } = r;
    const records = ctx.require<LawRecords>(LAW_RECORDS_SERVICE);
    const point = ctx.require<RemiseApi>(REMISE_SERVICE).point()!;
    const reliefs: TransferReliefEvent[] = [];
    const spawnAt = new Map<number, { point: number; player: number }>();
    ctx.events.onAny(TRANSFER_RELIEF_EVENT, (e) => {
      const ev = e as TransferReliefEvent;
      reliefs.push(ev);
      const s = ctx.squads.get(ev.squadId);
      const v = s ? ctx.vehicles.get(s.vehicleId) : undefined;
      const p = ctx.player.person()!;
      if (v) spawnAt.set(ev.squadId, { point: Math.hypot(v.x - point.x, v.z - point.z), player: Math.hypot(v.x - p.x, v.z - p.z) });
    });
    const [first, second] = vans(ctx) as [{ v: Vehicle; s: Squad }, { v: Vehicle; s: Squad }];
    const ids = [arrestInto(r, first.v).id, arrestInto(r, first.v).id];
    // pas plein, premier interpellé il y a moins de 6 min : il ne part pas tout seul
    t.step(5);
    expect(api.view(first.s.id)!.stage).toBe('sur_place');
    // l'ordre du joueur (Entrée « Partir au commissariat ») : tout de suite
    const res = api.depart(first.s.id);
    console.log(`départ : ${JSON.stringify(res)}`);
    expect(res.ok).toBe(true);
    expect(res.text).toBe(`${first.s.name} part au commissariat avec 2 interpellés. ${second.s.name} prend la remise.`);
    expect(api.depart(first.s.id)).toEqual({ ok: false, reason: 'il est déjà en route vers le commissariat', text: '' });
    const t0 = ctx.clock.now;
    let gone = -1;
    ctx.events.onAny(TRANSFER_DELIVERED_EVENT, (e) => {
      if ((e as TransferDeliveredEvent).squadId === first.s.id && gone < 0) gone = ctx.clock.now;
    });

    // le second, seul sur place, se remplit : un renfort est créé loin, hors de la vue du joueur, et vient
    for (let i = 0; i < 6; i++) arrestInto(r, second.v);
    t.step(3);
    console.log(`relèves : ${reliefs.map((e) => `${ctx.squads.get(e.squadId)?.name} (${e.source})`).join(', ')}`);
    expect(reliefs.length, 'renfort demandé').toBeGreaterThanOrEqual(1);
    expect(reliefs[0]!.source).toBe('renfort');
    const rs = ctx.squads.get(reliefs[0]!.squadId)!;
    const reliefVan = ctx.vehicles.get(rs.vehicleId)!;
    expect(rs.name).toMatch(/^CELLULAIRE \d$/);
    expect(rs.parentId).toBe(first.s.parentId);
    expect(ctx.people.get(reliefVan.seats[0]!)?.faction, 'renfort avec son conducteur').toBe('police');
    expect(spawnAt.get(rs.id)!.point, 'créé à 400 m au moins du point de remise').toBeGreaterThanOrEqual(400);
    expect(spawnAt.get(rs.id)!.player, 'hors de la vue du joueur').toBeGreaterThanOrEqual(300);

    for (let k = 0; k < 140 && gone < 0; k++) t.step(1);
    console.log(`remis hors carte à ${(gone - t0).toFixed(0)} s`);
    expect(gone).toBeGreaterThan(0);
    expect(gone - t0).toBeLessThanOrEqual(122);
    for (const id of ids) {
      expect(ctx.people.get(id)).toBeUndefined();
      const rec = records.lastArrestOf(id)!;
      expect(rec.status).toBe('depose');
      expect(rec.station).toBe('commissariat');
    }
    expect(api.delivered).toEqual([{ station: 'commissariat', count: 2 }]);

    // il se remplit : il part dès que le renfort (ou le premier, revenu) est là
    while (freeCells(second.v) > 0) arrestInto(r, second.v);
    let left = -1;
    let minCover = Infinity;
    for (let k = 0; k < 400 && left < 0; k++) {
      t.step(1);
      const w = api.view(second.s.id)!;
      if (w.stage === 'attend') expect(w.line).toMatch(/^Fourgon cellulaire \d complet — part (dès que le \d+ arrive \(|dans )/);
      if (w.stage === 'aller') left = ctx.clock.now;
    }
    for (let k = 0; k < 30; k++) {
      t.step(1);
      minCover = Math.min(minCover, covering(ctx, point));
    }
    console.log(`second parti ; ensuite au moins ${minCover} fourgon(s) avec une place sur place`);
    expect(left, 'le second est parti').toBeGreaterThan(0);
    expect(minCover).toBeGreaterThanOrEqual(1);
  }, 1800000);

  it('patrouille : l’équipage tient un interpellé loin de sa voiture, un fourgon est demandé tout seul, vient, part au commissariat ; la voiture remet les siens au commissariat', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: WITH_STATIONS });
    await t.start({
      mode: 'libre', role: 'patrouille', rank: 'gardien', place: 'Place de la République', x: 3123, z: -208, crowdSize: 150,
      tension: 0.3, volatility: 0.3, duration: 'courte',
      extra: {
        poste: 'interpellation', variante: 'police_secours', journee: false, foyers: 0, patrouilles: 0,
        moyens: { sections: 0, fourgons: 0, centaure: 0, canon_eau: 0, bravm: 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true },
      },
    } as Partial<SessionConfig>);
    const ctx = t.ctx;
    t.step(2);
    const api = ctx.require<TransferApi>(TRANSFER_SERVICE);
    const records = ctx.require<LawRecords>(LAW_RECORDS_SERVICE);
    const custody = ctx.require<LawCustody>(LAW_CUSTODY_SERVICE);
    const me = ctx.player.person()!;
    const crew = ctx.squads.get(me.squadId)!;
    const car = ctx.vehicles.get(crew.vehicleId)!;
    expect(car).toBeDefined();
    const r: Run = { t, ctx, me, api };
    // le joueur descend, à 400 m environ de sa voiture, sur une chaussée, à plus de 300 m de tout fourgon cellulaire
    ctx.vehicles.exit(me);
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    let spot: { x: number; z: number; h: number } | null = null;
    for (let a = 0; a < 72 && !spot; a++) {
      const d = 380 + (a % 3) * 80;
      const x = car.x + Math.sin((Math.floor(a / 3) * Math.PI) / 12) * d, z = car.z + Math.cos((Math.floor(a / 3) * Math.PI) / 12) * d;
      if (!ctx.world.nearestRoad(x, z, road, 30) || !ctx.world.isFree(road.x + 3, road.z, 0.8)) continue;
      const vanNear = ctx.vehicles.list.some((o) => o.kind === 'fourgon_cellulaire' && o.seats[0] !== 0 && Math.hypot(o.x - road.x, o.z - road.z) < 320);
      if (!vanNear && Math.hypot(road.x - car.x, road.z - car.z) > 170) spot = { x: road.x + Math.cos(road.heading) * 3, z: road.z - Math.sin(road.heading) * 3, h: road.heading };
    }
    if (!spot) console.log(`voiture (${car.x.toFixed(0)}, ${car.z.toFixed(0)}) ; fourgons : ${ctx.vehicles.list.filter((o) => o.kind === 'fourgon_cellulaire').map((o) => `(${o.x.toFixed(0)}, ${o.z.toFixed(0)}) conducteur ${o.seats[0]}`).join(' ; ')}`);
    expect(spot).not.toBeNull();
    moveTo(r, spot!.x, spot!.z, spot!.h);
    const target = threePresses(r);
    expect(custody.detaineeOf(me.id)?.id).toBe(target.id);
    t.step(3);
    const req = api.patrolRequest;
    console.log(`demande : ${JSON.stringify(req)}`);
    expect(req, 'fourgon demandé tout seul').not.toBeNull();
    expect(req!.text).toMatch(/^Fourgon cellulaire demandé — .+\u00a0; ou ramenez-le à la voiture \(\d+\u00a0m\)$/);
    const vs = ctx.squads.get(req!.vanSquadId)!;
    expect(vs.name).toMatch(/^CELLULAIRE 75-\d\d$/);
    const van = ctx.vehicles.get(vs.vehicleId)!;
    // le fourgon vient au plus près ; à 12 m, le joueur le remet
    let near = -1;
    const t0 = ctx.clock.now;
    for (let k = 0; k < 600 && near < 0; k++) {
      t.step(1);
      if (Math.hypot(van.x - me.x, van.z - me.z) <= 30 && Math.abs(van.speed) < 0.3) near = ctx.clock.now;
    }
    console.log(`fourgon à ${Math.hypot(van.x - me.x, van.z - me.z).toFixed(0)} m du joueur après ${(near - t0).toFixed(0)} s`);
    expect(near, 'le fourgon est venu').toBeGreaterThan(0);
    moveTo(r, van.x + Math.cos(van.heading) * 5, van.z - Math.sin(van.heading) * 5, van.heading);
    target.x = me.x + Math.sin(me.heading) * 1;
    target.z = me.z + Math.cos(me.heading) * 1;
    ctx.people.rebuildIndex();
    const fourth = press(r);
    expect(fourth.verb, fourth.label).toBe('remettre');
    expect(target.vehicleId).toBe(van.id);
    // chargé, personne d'autre à remettre : il part au commissariat
    let left = -1;
    for (let k = 0; k < 60 && left < 0; k++) {
      t.step(1);
      if (api.view(vs.id)?.stage === 'aller') left = ctx.clock.now;
    }
    expect(left, 'parti au commissariat').toBeGreaterThan(0);
    expect(api.patrolRequest).toBeNull();

    // la voiture : un interpellé à l'arrière, le joueur à bord, arrêtée devant un commissariat — remis et compté là
    const stations = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    const site = stations.list.find((c) => c.kind !== 'caserne_gendarmerie')!;
    const second = threePresses(r);
    expect(ctx.vehicles.enter(second, car, 'passenger')).toBe(true);
    second.custody = 'in_vehicle';
    const rec2 = records.lastArrestOf(second.id)!;
    rec2.status = 'remis_vehicule';
    car.x = site.returnX;
    car.z = site.returnZ;
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    // (le joueur au volant : il a conduit jusque-là et s'arrête devant la porte)
    const driver = car.seats[0] !== 0 ? ctx.people.get(car.seats[0]!) : undefined;
    ctx.service<{ stop(v: Vehicle): void }>('vehicles.autopilot')?.stop(car);
    if (driver && !driver.isPlayer) ctx.vehicles.exit(driver);
    if (me.vehicleId !== 0) ctx.vehicles.exit(me);
    expect(ctx.vehicles.enter(me, car, 'driver')).toBe(true);
    for (let k = 0; k < 8 && ctx.people.get(second.id); k++) t.step(1);
    expect(ctx.people.get(second.id), 'remis au commissariat').toBeUndefined();
    expect(records.lastArrestOf(second.id)!.status).toBe('depose');
    expect(records.lastArrestOf(second.id)!.station).toBe(homeName(commissariatById(site.id)!));
  }, 1200000);

  // Des automobilistes arrêtés pour de bon devant le fourgon qui part (rangés en travers autour du point de remise) le
  // retenaient un quart d'heure, plein, à vingt mètres de sa place. Il part sans deux-tons ; retenu 45 s au même endroit
  // par un véhicule à l'arrêt, il met le deux-tons, l'annonce, et la voiture qui le retient se range (règle des colonnes
  // en urgence). Ici un mur de voitures sans conducteur, frein serré : le cas le plus dur — on vérifie le passage en
  // urgence et la première voiture rangée ; le trajet entier, dans la vraie circulation, c'est l'essai des 30 minutes.
  it('parti au commissariat, retenu par des voitures à l’arrêt : au bout de 45 s il met le deux-tons, la voiture devant lui se range', async () => {
    const r = await freeSession(WITH_STATIONS, 'Place de la République', 7);
    const { t, ctx, api } = r;
    const first = vans(ctx)[0]!;
    const v = first.v;
    arrestInto(r, v);
    // voitures civiles en travers de la chaussée, à l'arrêt, juste devant lui et juste derrière
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lon = v.def.length * 0.5 + 4.5;
    const blockers: Vehicle[] = [];
    for (const side of [1, -1]) {
      for (const lat of [-6.9, -2.3, 2.3, 6.9]) {
        const x = v.x + fx * lon * side + fz * lat, z = v.z + fz * lon * side - fx * lat;
        if (!ctx.world.isFree(x, z, 1.2) || ctx.vehicles.list.some((o) => Math.hypot(o.x - x, o.z - z) < 4.5)) continue;
        const car = ctx.vehicles.spawn('citadine', x, z, v.heading + Math.PI / 2, { faction: 'civil' });
        car.cmd.handbrake = true;
        blockers.push(car);
      }
    }
    expect(blockers.length).toBeGreaterThanOrEqual(4);
    const left = (): number => blockers.filter((b) => ctx.vehicles.get(b.id)).length;
    const ap = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason: string; urgence?: boolean } }>('vehicles.autopilot')!;
    const from = { x: v.x, z: v.z };
    const res = api.depart(first.s.id);
    expect(res.ok, res.reason).toBe(true);
    const t0 = ctx.clock.now;
    const said = (): boolean => ctx.radio.log.some((q) => q.from === first.s.name && /Retenu par des véhicules à l’arrêt, je passe au deux-tons/.test(q.text));
    let urgentAt = -1;
    let sirenAt = -1;
    let saidAt = -1;
    let clearedAt = -1;
    let sirenBefore = false;
    for (let k = 0; k < 120 && (clearedAt < 0 || saidAt < 0); k++) {
      t.step(1);
      const el = ctx.clock.now - t0;
      const st = ap.status(v);
      if (urgentAt < 0 && st.urgence === true) urgentAt = el;
      if (urgentAt < 0 && v.siren !== 0) sirenBefore = true;
      if (urgentAt >= 0 && sirenAt < 0 && v.siren !== 0) sirenAt = el;
      if (saidAt < 0 && said()) saidAt = el;
      if (clearedAt < 0 && left() < blockers.length) clearedAt = el;
      if (k % 10 === 0) console.log(`  t+${el.toFixed(0)} s : à ${Math.hypot(v.x - from.x, v.z - from.z).toFixed(0)} m de sa place, ${st.mode}/${st.state}/${st.reason}, urgence ${st.urgence}, deux-tons ${v.siren}, voitures ${left()}/${blockers.length}`);
    }
    console.log(`en urgence à t+${urgentAt.toFixed(0)} s, deux-tons à t+${sirenAt.toFixed(0)} s, annoncé à t+${saidAt.toFixed(0)} s, première voiture rangée à t+${clearedAt.toFixed(0)} s`);
    // parti sans deux-tons : il attend 45 s derrière les voitures, pas moins
    expect(sirenBefore, 'parti sans deux-tons').toBe(false);
    expect(urgentAt, 'il passe en urgence').toBeGreaterThanOrEqual(45);
    expect(urgentAt).toBeLessThanOrEqual(60);
    expect(sirenAt, 'deux-tons').toBeGreaterThan(0);
    expect(sirenAt - urgentAt).toBeLessThanOrEqual(20);
    expect(saidAt, 'il l’annonce à la radio').toBeGreaterThan(0);
    expect(saidAt - urgentAt).toBeLessThanOrEqual(40);
    expect(clearedAt, 'la voiture qui le retient se range').toBeGreaterThan(0);
    expect(clearedAt - urgentAt).toBeLessThanOrEqual(45);
    // toujours en route vers le commissariat, ses interpellés à bord ; une seule annonce
    expect(api.view(first.s.id)!.stage).toBe('aller');
    expect(detainees(ctx, v).length).toBe(1);
    t.step(60);
    expect(ctx.radio.log.filter((q) => /je passe au deux-tons/.test(q.text)).length).toBe(1);
  }, 600000);

  it('30 minutes, 20 interpellations : à chaque seconde un fourgon avec une place au point de remise ; comptes du compte rendu = relevés', async () => {
    const r = await freeSession(WITH_STATIONS, 'Place de la République', 7);
    const { t, ctx, api } = r;
    const records = ctx.require<LawRecords>(LAW_RECORDS_SERVICE);
    const point = ctx.require<RemiseApi>(REMISE_SERVICE).point()!;
    expect(point).not.toBeNull();
    const t0 = ctx.clock.now;
    let made = 0;
    let minCover = Infinity;
    let worstAt = -1;
    let nextAt = t0 + 30;
    while (ctx.clock.now - t0 < 1800) {
      if (made < 20 && ctx.clock.now >= nextAt) {
        // le fourgon sur place qui a une place (le plus chargé d'abord, comme on remplit un fourgon avant l'autre)
        const here = vans(ctx).filter(({ v, s }) => freeCells(v) > 0 && Math.hypot(v.x - point.x, v.z - point.z) <= 150 && api.view(s.id)?.stage === 'sur_place');
        here.sort((a, b) => freeCells(a.v) - freeCells(b.v));
        if (here.length > 0) {
          arrestInto(r, here[0]!.v);
          made++;
        }
        nextAt = t0 + 30 + made * 85;
      }
      t.step(1);
      if (Math.round(ctx.clock.now - t0) % 300 === 0) {
        const ap = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason: string } }>('vehicles.autopilot')!;
        console.log(`${(ctx.clock.now - t0).toFixed(0)} s : ${made} — ${vans(ctx).map(({ v, s }) => { const w = api.view(s.id); const st = ap.status(v); return `${s.name} ${w?.stage} ${w?.detainees}/${w?.seats} à ${Math.hypot(v.x - point.x, v.z - point.z).toFixed(0)} m ${st.mode}/${st.state}/${st.reason} « ${w?.line} »`; }).join(' | ')}`);
      }
      const c = covering(ctx, point);
      if (c < minCover) {
        minCover = c;
        worstAt = ctx.clock.now - t0;
      }
    }
    const st = records.stats();
    const delivered = api.delivered.reduce((n, d) => n + d.count, 0);
    console.log(`${made} interpellations ; au moins ${minCover} fourgon(s) avec une place (à ${worstAt.toFixed(0)} s) ; relevés : ${st.atStation} au commissariat, ${st.inVan} à bord ; transfert : ${api.delivered.map((d) => `${d.count} au ${d.station}`).join(', ')} ; fourgons : ${api.vans.map((v) => `${v.name} ${v.stage} ${v.detainees}/${v.seats}`).join(', ')}`);
    expect(made).toBe(20);
    expect(minCover, 'à chaque seconde, un fourgon avec une place à moins de 150 m du point de remise').toBeGreaterThanOrEqual(1);
    expect(delivered).toBeGreaterThanOrEqual(8);
    expect(st.atStation, 'déposés au commissariat : relevés = transfert').toBe(delivered);
    const aboard = api.vans.reduce((n, v) => n + v.detainees, 0);
    expect(st.inVan, 'à bord : relevés = fourgons').toBe(aboard);
    expect(st.atStation + st.inVan).toBeGreaterThanOrEqual(20);
  }, 1800000);
});
