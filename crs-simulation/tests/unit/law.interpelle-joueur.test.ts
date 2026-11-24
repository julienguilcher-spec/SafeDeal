// L'interpellé du joueur sur la vraie carte de Paris (plan ordres-directs §5.3, paquet P12), commandant en mode libre,
// place de la République (graine 5) — chaque appui est l'invite du moment de la touche Interagir (la première option) :
//  - un binôme libre à moins de 60 m : 4e appui « Confier Christian Lopez à MISTRAL 2 ALFA », le joueur a les mains
//    libres, le binôme prend l'interpellé en moins de 15 s et le conduit au fourgon cellulaire (≤ 4 appuis) ;
//  - la ligne d'aide « Interpellé. E : … » existe au plus 0,5 s après la palpation, et dit la même issue que l'invite ;
//  - à 12 m ou moins d'un fourgon cellulaire : « Remettre … (CELLULAIRE n) », l'interpellé est à bord (4 appuis) ;
//  - seul, loin de tout (aucun binôme à 60 m, fourgon à plus de 100 m) : « Faire venir le fourgon cellulaire n », le
//    fourgon roule jusqu'à lui ; à 12 m, « Remettre … (CELLULAIRE n) » ;
//  - jamais « Faire asseoir » en 4e appui quand l'une de ces issues s'applique ;
//  - monter en voiture en escortant l'interpellé : il est confié au binôme libre le plus proche.
import { describe, expect, it } from 'vitest';
import type { GameContext, InteractionOption, Person, Squad, Vehicle } from '@/core/contracts';
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
import type { LawCustody, LawRecords } from '@/gameplay/law/api';
import { LAW_CUSTODY_SERVICE, LAW_RECORDS_SERVICE } from '@/gameplay/law/api';
import { POLICE_ARRESTS_SERVICE } from '@/sim/police/arrest-service';
import type { PoliceArrestsApi } from '@/sim/police/arrest-service';
import { buildSessionConfig, defaultDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';

const world = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session];

type Ctx = ReturnType<typeof createTestContext>;

interface Run {
  t: Ctx;
  ctx: GameContext;
  me: Person;
  custody: LawCustody;
  notices: string[];
}

async function freeSession(placeName: string, seed: number): Promise<Run> {
  const place = DEFAULT_PLACES.find((p) => p.name === placeName)!;
  const d: ScenarioDraft = {
    ...defaultDraft(), role: 'commandant' as never, rank: 'commandant' as never, poste: 'commandant_unite' as never, variante: '',
    place: place.name, x: place.x, z: place.z, crowdSize: 150, seed,
  };
  d.mode = 'libre';
  d.options = { ...d.options, journee: false };
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start(buildSessionConfig(d));
  const ctx = t.ctx;
  const notices: string[] = [];
  const ui = ctx.ui;
  const notify = ui.notify.bind(ui);
  ui.notify = (text, kind, seconds) => {
    notices.push(text);
    notify(text, kind, seconds);
  };
  t.step(3);
  return { t, ctx, me: ctx.player.person()!, custody: ctx.require<LawCustody>(LAW_CUSTODY_SERVICE), notices };
}

/** Options de la touche Interagir, la première d'abord (copies). */
function prompts(ctx: GameContext, me: Person): InteractionOption[] {
  const out: InteractionOption[] = [];
  ctx.interactions.options(me, out);
  return out.map((o) => ({ ...o }));
}

/** Un appui sur la touche Interagir : l'invite du moment, jusqu'au bout de son action. Retourne l'invite. */
function press(r: Run): InteractionOption {
  const top = prompts(r.ctx, r.me)[0];
  expect(top, 'une invite').toBeDefined();
  const opts: InteractionOption[] = [];
  r.ctx.interactions.options(r.me, opts);
  expect(r.ctx.interactions.start(r.me, opts[0]!)).toBe(true);
  const cur = r.ctx.interactions.current(r.me);
  if (cur) r.t.step(cur.opt.duration + 0.2);
  return top!;
}

/**
 * Un auteur de fait constaté, posé à côté du joueur, et les trois premiers appuis (interpeller, menotter, palper).
 * Retourne l'auteur ; la maîtrise peut échouer (tirage) : on recommence comme le joueur.
 */
function threePresses(r: Run, name: string): Person {
  const { ctx, me } = r;
  const target = ctx.people.spawn({ kind: 'manifestant', x: me.x + Math.sin(me.heading) * 1.2, z: me.z + Math.cos(me.heading) * 1.2, name });
  ctx.law.recordOffense(target, 'jet_projectile', target.x, target.z, 2).witnessed = true;
  ctx.people.rebuildIndex();
  for (let i = 0; i < 8 && target.custody !== 'held'; i++) {
    target.x = me.x + Math.sin(me.heading) * 1.2;
    target.z = me.z + Math.cos(me.heading) * 1.2;
    ctx.people.rebuildIndex();
    const p = press(r);
    expect(p.verb).toBe('maitriser');
    if ((target.custody as string) !== 'held') r.t.step(2.1);
  }
  expect(target.custody).toBe('held');
  expect(press(r).verb).toBe('menotter');
  expect(target.custody).toBe('cuffed');
  const palpation = press(r);
  expect(palpation.verb).toBe('palper');
  expect(ctx.require<LawRecords>(LAW_RECORDS_SERVICE).arrestOf(target.id)?.searched).toBe(true);
  return target;
}

function vans(ctx: GameContext): { v: Vehicle; s: Squad }[] {
  const out: { v: Vehicle; s: Squad }[] = [];
  for (const s of ctx.squads.list) {
    const v = s.faction === 'police' && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
    if (v && v.kind === 'fourgon_cellulaire') out.push({ v, s });
  }
  return out;
}

/** Le joueur se poste en (x, z) (tête vers `heading`) ; l'index spatial suit. */
function moveTo(r: Run, x: number, z: number, heading = r.me.heading): void {
  r.me.x = x;
  r.me.z = z;
  r.me.y = r.ctx.world.heightAt(x, z);
  r.me.heading = heading;
  r.me.aimYaw = heading;
  r.ctx.people.rebuildIndex();
}

/** Longueur de l'itinéraire routier d'un véhicule jusqu'au point, départ dans le sens où il est tourné (m ; ∞ sans chemin). */
function routeLength(ctx: GameContext, v: Vehicle, x: number, z: number): number {
  const path: number[] = [];
  if (!ctx.world.findPath(v.x, v.z, x, z, 'vehicle', path, { heading: v.heading, uturn: 30, contraflow: 3, minWidth: v.def.width + 1.2 })) return Infinity;
  let len = 0;
  for (let i = 2; i < path.length; i += 2) len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
  return len;
}

/** Distance au policier à pied (hors joueur) le plus proche. */
function nearestCop(ctx: GameContext, x: number, z: number): number {
  let best = Infinity;
  for (const p of ctx.people.list) {
    if (p.faction !== 'police' || p.isPlayer || p.vehicleId !== 0 || p.dormant) continue;
    best = Math.min(best, Math.hypot(p.x - x, p.z - z));
  }
  return best;
}

describe('l’interpellé du joueur : la 4e touche est la meilleure issue (vraie carte)', () => {
  it('binôme libre à 60 m : 4e appui « Confier … à MISTRAL … », ligne d’aide ≤ 0,5 s, mains libres, le binôme le conduit au fourgon', async () => {
    const r = await freeSession('Place de la République', 5);
    const { t, ctx, me, custody } = r;
    const target = threePresses(r, 'Christian Lopez');
    // la ligne d'aide est là dès la fin de la palpation, puis encore 0,5 s plus tard
    const now = custody.guidance(me.id);
    t.step(0.5);
    const desk = ctx.require<PoliceArrestsApi>(POLICE_ARRESTS_SERVICE);
    const pair = desk.pairFor(me.id);
    console.log(`ligne d'aide : « ${now} » ; binôme : ${pair ? `${pair.name} à ${pair.distance.toFixed(0)} m` : 'aucun'}`);
    expect(pair, 'un binôme libre à moins de 60 m').not.toBeNull();
    expect(now).toMatch(new RegExp(`^Interpellé\\. E\\u00a0: le confier à ${pair!.name} \\(\\d+\\u00a0m\\)$`));
    expect(custody.guidance(me.id)).not.toBe('');
    // 4e appui : Confier, au binôme que la ligne nomme
    const fourth = prompts(ctx, me)[0]!;
    expect(fourth.verb).toBe('confier');
    expect(fourth.label).toBe(`Confier Christian Lopez à ${pair!.name}`);
    expect(prompts(ctx, me).findIndex((o) => o.label.startsWith('Faire asseoir'))).toBeLessThan(0);
    const t0 = ctx.clock.now;
    expect(press(r).verb).toBe('confier');
    expect(r.notices.some((n) => n === `Interpellé confié à ${pair!.name}`), r.notices.slice(-3).join(' | ')).toBe(true);
    // quatre appuis, et il a les mains libres : plus d'interpellé à lui, plus de ligne d'aide
    expect(me.carrying).toBe(0);
    expect(custody.detaineeOf(me.id)).toBeNull();
    expect(custody.guidance(me.id)).toBe('');
    expect(desk.handling(target.id)).toBe(true);
    let takenAt = -1;
    let inVanAt = -1;
    for (let i = 0; i < 2400 && inVanAt < 0; i++) {
      t.step(0.1);
      if (takenAt < 0 && target.custody === 'escorted' && target.heldBy !== me.id) takenAt = ctx.clock.now;
      const v = target.vehicleId !== 0 ? ctx.vehicles.get(target.vehicleId) : undefined;
      if (target.custody === 'in_vehicle' && v && v.kind === 'fourgon_cellulaire') inVanAt = ctx.clock.now;
    }
    console.log(`pris en escorte à ${(takenAt - t0).toFixed(1)} s, au fourgon à ${(inVanAt - t0).toFixed(0)} s`);
    expect(takenAt).toBeGreaterThan(0);
    expect(takenAt - t0).toBeLessThanOrEqual(15);
    expect(inVanAt, 'au fourgon cellulaire').toBeGreaterThan(0);
    // (le compte rendu passe à la radio dans la file du canal de commandement)
    t.step(20);
    const rec = ctx.require<LawRecords>(LAW_RECORDS_SERVICE).lastArrestOf(target.id)!;
    expect(rec.status).toBe('remis_vehicule');
    expect(rec.vehicleName).toMatch(/^CELLULAIRE \d$/);
    expect(ctx.radio.log.some((m) => m.t >= t0 && new RegExp(`à bord du ${rec.vehicleName}, en attente de transfert`).test(m.text))).toBe(true);
    expect(ctx.radio.log.some((m) => m.t >= t0 && /pour présentation à l'officier de police judiciaire/.test(m.text))).toBe(false);
  }, 600000);

  it('à 12 m d’un fourgon cellulaire : 4e appui « Remettre … (CELLULAIRE n) », l’interpellé est à bord', async () => {
    const r = await freeSession('Place de la République', 5);
    const { ctx, me, custody } = r;
    const { v, s } = vans(ctx)[0]!;
    // le joueur à 9 m de l'arrière du fourgon, sur le côté
    moveTo(r, v.x + Math.cos(v.heading) * 9, v.z - Math.sin(v.heading) * 9);
    const target = threePresses(r, 'Nicolas Bertin');
    const fourth = prompts(ctx, me)[0]!;
    expect(fourth.verb).toBe('remettre');
    expect(fourth.label).toBe(`Remettre Nicolas Bertin (${s.name})`);
    expect(custody.guidance(me.id)).toMatch(/^Interpellé\. E : le remettre au fourgon cellulaire \d \(\d+ m\)$/);
    expect(press(r).verb).toBe('remettre');
    expect(target.custody).toBe('in_vehicle');
    expect(target.vehicleId).toBe(v.id);
    expect(custody.detaineeOf(me.id)).toBeNull();
  }, 600000);

  it('seul loin de tout : 4e appui « Faire venir le fourgon cellulaire n », le fourgon vient ; à 12 m, « Remettre »', async () => {
    const r = await freeSession('Place de la République', 5);
    const { t, ctx, me, custody } = r;
    const desk = ctx.require<PoliceArrestsApi>(POLICE_ARRESTS_SERVICE);
    // une chaussée à 160–260 m des fourgons, à plus de 90 m de tout policier à pied, du côté opposé à la foule (le
    // fourgon ne traverse pas la manifestation pour venir)
    const v0 = vans(ctx)[0]!.v;
    let fx = 0, fz = 0, fn = 0;
    for (const p of ctx.people.list) if (p.faction === 'protest') { fx += p.x; fz += p.z; fn++; }
    fx /= Math.max(1, fn);
    fz /= Math.max(1, fn);
    const crowdD = Math.hypot(v0.x - fx, v0.z - fz);
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    let spot: { x: number; z: number; h: number } | null = null;
    for (let a = 0; a < 24 && !spot; a++) {
      for (const d of [180, 220, 160, 260]) {
        const x = v0.x + Math.sin((a * Math.PI) / 12) * d;
        const z = v0.z + Math.cos((a * Math.PI) / 12) * d;
        if (!ctx.world.nearestRoad(x, z, road, 20)) continue;
        const dv = Math.min(...vans(ctx).map(({ v }) => Math.hypot(v.x - road.x, v.z - road.z)));
        if (dv > 150 && Math.hypot(road.x - fx, road.z - fz) > crowdD + 60 && nearestCop(ctx, road.x, road.z) > 90 && ctx.world.isFree(road.x, road.z, 1.5)
          && routeLength(ctx, v0, road.x, road.z) < Math.hypot(road.x - v0.x, road.z - v0.z) * 1.6 + 40) {
          spot = { x: road.x + Math.cos(road.heading) * 2, z: road.z - Math.sin(road.heading) * 2, h: road.heading };
          break;
        }
      }
    }
    expect(spot, 'un point de chaussée isolé').not.toBeNull();
    moveTo(r, spot!.x, spot!.z, spot!.h);
    const target = threePresses(r, 'Thierry Meunier');
    // personne pour le prendre, aucun véhicule à portée : faire venir le fourgon
    expect(desk.pairFor(me.id)).toBeNull();
    const way = custody.bestWay(me.id)!;
    console.log(`issue : ${way.kind} « ${way.label} » ; ligne : « ${custody.guidance(me.id)} »`);
    expect(way.kind).toBe('faire_venir');
    const fourth = prompts(ctx, me)[0]!;
    expect(fourth.verb).toBe('faire_venir');
    expect(fourth.label).toMatch(/^Faire venir le fourgon cellulaire \d$/);
    expect(custody.guidance(me.id)).toMatch(/^Interpellé\. E : faire venir le fourgon cellulaire \d \(\d+ m\)$/);
    expect(prompts(ctx, me).findIndex((o) => o.label.startsWith('Faire asseoir'))).toBeLessThan(0);
    const t0 = ctx.clock.now;
    expect(press(r).verb).toBe('faire_venir');
    const going = desk.fetching(target.id);
    expect(going, 'le fourgon est en route').not.toBeNull();
    expect(r.notices.some((n) => new RegExp(`^Fourgon cellulaire \\d vient vous chercher — `).test(n))).toBe(true);
    const van = ctx.vehicles.get(going!.vehicleId)!;
    const d0 = Math.hypot(van.x - me.x, van.z - me.z);
    // il garde son interpellé (assis, menotté) et attend : le fourgon arrive à 12 m
    let nearAt = -1;
    const ap = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason: string; remaining: number } }>('vehicles.autopilot');
    for (let i = 0; i < 2400 && nearAt < 0; i++) {
      t.step(0.1);
      if (Math.hypot(van.x - me.x, van.z - me.z) <= 12 && Math.abs(van.speed) < 0.5) nearAt = ctx.clock.now;
      if (process.env.DEBUG_P12 && i % 50 === 0 && ap) {
        const st = ap.status(van);
        console.log(`t=${(ctx.clock.now - t0).toFixed(0)} fourgon à ${Math.hypot(van.x - me.x, van.z - me.z).toFixed(0)} m v=${van.speed.toFixed(1)} ${st.mode}/${st.state}/${st.reason} reste ${st.remaining.toFixed(0)}`);
      }
    }
    console.log(`fourgon parti de ${d0.toFixed(0)} m, à 12 m du joueur à ${(nearAt - t0).toFixed(0)} s`);
    expect(nearAt, 'le fourgon est venu').toBeGreaterThan(0);
    expect(target.custody).toBe('cuffed');
    const fifth = prompts(ctx, me)[0]!;
    expect(fifth.verb).toBe('remettre');
    expect(fifth.label).toBe(`Remettre Thierry Meunier (${going!.name})`);
    expect(press(r).verb).toBe('remettre');
    expect(target.custody).toBe('in_vehicle');
    expect(target.vehicleId).toBe(van.id);
    t.step(1.5);
    expect(desk.fetching(target.id)).toBeNull();
  }, 900000);

  it('monter dans un véhicule en escortant l’interpellé : il est confié au binôme libre le plus proche', async () => {
    const r = await freeSession('Place de la République', 5);
    const { t, ctx, me } = r;
    const target = threePresses(r, 'Adam Leroux');
    // il l'emmène (pas de « Confier ») et monte dans le véhicule de commandement le plus proche
    expect(ctx.interactions.startVerb(me, 'escorter', target.id)).toBe(true);
    t.step(1.5);
    expect(target.custody).toBe('escorted');
    let car: Vehicle | null = null;
    let bd = Infinity;
    for (const v of ctx.vehicles.list) {
      if (v.faction !== 'police' || v.kind === 'fourgon_cellulaire' || v.kind === 'moto_bravm' || v.def.flying) continue;
      const seat = v.seats.findIndex((id, i) => id === 0 && v.def.seats[i]!.role === 'passenger');
      const d = Math.hypot(v.x - me.x, v.z - me.z);
      if (seat >= 0 && d < bd) {
        bd = d;
        car = v;
      }
    }
    expect(car).not.toBeNull();
    const seat = car!.seats.findIndex((id, i) => id === 0 && car!.def.seats[i]!.role === 'passenger');
    expect(ctx.vehicles.enter(me, car!, seat)).toBe(true);
    t.step(0.5);
    expect(target.custody).toBe('cuffed');
    expect(r.notices.some((n) => /^Interpellé confié à /.test(n)), r.notices.slice(-4).join(' | ')).toBe(true);
    let taken = false;
    const t0 = ctx.clock.now;
    for (let i = 0; i < 600 && !taken; i++) {
      t.step(0.1);
      taken = target.custody === 'escorted' && target.heldBy !== me.id;
      if (process.env.DEBUG_P12 && i % 20 === 0) {
        const k = ctx.service<{ roots: { ops: { targetId: number; stage: number; done: boolean; lead: { p: Person } | null }[] }[] }>('police.internal')!;
        const ops = k.roots.flatMap((q) => q.ops).filter((o) => o.targetId === target.id && !o.done);
        const lead = ops[0]?.lead?.p;
        console.log(`t=${(i / 10).toFixed(0)} ${target.custody} ops=${ops.map((o) => `st${o.stage}`).join(',')} binôme à ${lead ? Math.hypot(lead.x - target.x, lead.z - target.z).toFixed(1) : '-'} m`);
      }
    }
    console.log(`pris en escorte ${(ctx.clock.now - t0).toFixed(1)} s après la montée`);
    expect(taken, 'un binôme l’a pris en escorte').toBe(true);
  }, 600000);
});
