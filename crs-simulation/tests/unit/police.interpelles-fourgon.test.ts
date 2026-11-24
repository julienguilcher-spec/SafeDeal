// Interpellés des unités et fourgons cellulaires (plan ordres-directs §5.4, paquet P13), sur la vraie carte de Paris :
//  - République (graine 5) : un groupe interpelle un lanceur de projectile ; le fourgon cellulaire vient à 20 m derrière
//    la ligne, l'interpellé y monte, le binôme est de retour dans la ligne en moins de 60 s ; jamais « demande un
//    véhicule pour la remise » laissé sans réponse ;
//  - « Confier » : le joueur confie l'interpellé qu'il vient de menotter, il a les mains libres tout de suite, un binôme
//    le prend en escorte en moins de 15 s et le conduit au fourgon ;
//  - personne n'est laissé seul : un interpellé menotté laissé assis est ramassé et mis au fourgon ;
//  - BRAV-M : plus de point de regroupement invisible, aucun interpellé « parqué » plus de 120 s ;
//  - « Aller constater » : une troupe qui reçoit « Interpeller » sans fait constaté ne refuse pas, se porte à une dizaine
//    de mètres et interpelle au premier fait constaté.
import { describe, expect, it } from 'vitest';
import type { GameContext, Person, Squad, Vehicle } from '@/core/contracts';
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
import { ARREST_EVENT, ORDER_REFUSED_EVENT } from '@/sim/police/api';
import { POLICE_ARRESTS_SERVICE } from '@/sim/police/arrest-service';
import type { PoliceArrestsApi } from '@/sim/police/arrest-service';
import type { LawHandover } from '@/gameplay/law/api';
import { buildSessionConfig, defaultDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';

const world = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session];

type Ctx = ReturnType<typeof createTestContext>;

async function freeSession(placeName: string, seed: number, crowdSize = 150): Promise<{ t: Ctx; ctx: GameContext }> {
  const place = DEFAULT_PLACES.find((p) => p.name === placeName)!;
  const d: ScenarioDraft = {
    ...defaultDraft(), role: 'commandant' as never, rank: 'commandant' as never, poste: 'commandant_unite' as never, variante: '',
    place: place.name, x: place.x, z: place.z, crowdSize, seed,
  };
  d.mode = 'libre';
  d.options = { ...d.options, journee: false };
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start(buildSessionConfig(d));
  t.step(3);
  return { t, ctx: t.ctx };
}

/** Fourgons cellulaires avec équipage. */
function vans(ctx: GameContext): { v: Vehicle; s: Squad }[] {
  const out: { v: Vehicle; s: Squad }[] = [];
  for (const s of ctx.squads.list) {
    const v = s.faction === 'police' && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
    if (v && v.kind === 'fourgon_cellulaire') out.push({ v, s });
  }
  return out;
}

/** Groupe de la compagnie dont les agents sont à pied, le plus proche de la foule. */
function frontGroup(ctx: GameContext): Squad {
  const me = ctx.player.person()!;
  let best: Squad | null = null;
  let bd = Infinity;
  const foule = crowdCentre(ctx);
  for (const s of ctx.squads.list) {
    if (s.faction !== 'police' || s.kind !== 'groupe' || s.members.length < 6) continue;
    let top = s;
    while (top.parentId !== 0) top = ctx.squads.get(top.parentId)!;
    if (top.id !== me.squadId && top.id !== ctx.squads.get(me.squadId)?.parentId) continue;
    const ps = s.members.map((id) => ctx.people.get(id)!).filter((p) => p && p.vehicleId === 0);
    if (ps.length < 6) continue;
    const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const z = ps.reduce((a, p) => a + p.z, 0) / ps.length;
    const d = Math.hypot(x - foule.x, z - foule.z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best!;
}

function crowdCentre(ctx: GameContext): { x: number; z: number } {
  let x = 0, z = 0, n = 0;
  for (const p of ctx.people.list) if (p.faction === 'protest') { x += p.x; z += p.z; n++; }
  return { x: x / Math.max(1, n), z: z / Math.max(1, n) };
}

function centre(ctx: GameContext, s: Squad): { x: number; z: number } {
  const ps = s.members.map((id) => ctx.people.get(id)!).filter((p) => p && p.vehicleId === 0);
  return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length };
}

/** Un manifestant qui reste sur place, à `ahead` m du groupe, du côté de la foule, avec un fait constaté (ou pas). */
function offenderNear(ctx: GameContext, s: Squad, ahead: number, offence = true): Person {
  const c = centre(ctx, s);
  const f = crowdCentre(ctx);
  const d = Math.hypot(f.x - c.x, f.z - c.z) || 1;
  const p = ctx.people.spawn({ kind: 'manifestant', x: c.x + ((f.x - c.x) / d) * ahead, z: c.z + ((f.z - c.z) / d) * ahead });
  if (offence) ctx.law.recordOffense(p, 'jet_projectile', p.x, p.z, 2).witnessed = true;
  return p;
}

/** Le lanceur reste où il est (il ne fuit pas, ne rejoint pas la foule) tant qu'il est libre. */
function stay(p: Person): () => void {
  const x = p.x;
  const z = p.z;
  return () => {
    if (p.custody !== 'free') return;
    p.x = x;
    p.z = z;
    p.vx = 0;
    p.vz = 0;
  };
}

/** Sonde (DEBUG_P13=1) : opérations sur la personne, fourgons et pilote automatique. */
function probe(ctx: GameContext, target: Person, t0: number): void {
  if (!process.env.DEBUG_P13) return;
  const k = ctx.service<{ roots: { ops: { targetId: number; stage: number; count: number; destId: number; destX: number; destZ: number; lead: { p: Person } | null }[] }[] }>('police.internal')!;
  const ops = k.roots.flatMap((r) => r.ops).filter((o) => o.targetId === target.id);
  const ap = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason: string; remaining: number } }>('vehicles.autopilot')!;
  console.log(`t=${(ctx.clock.now - t0).toFixed(0)} ${target.custody} (${target.x.toFixed(0)},${target.z.toFixed(0)}) ops=${ops.map((o) => `st${o.stage} c${o.count} d${o.destId} goal(${o.destX.toFixed(0)},${o.destZ.toFixed(0)}) lead(${o.lead?.p.x.toFixed(0)},${o.lead?.p.z.toFixed(0)})`).join('|')} vans=${vans(ctx).map(({ v }) => { const st = ap.status(v); return `${v.id}@(${v.x.toFixed(0)},${v.z.toFixed(0)}) ${st.mode}/${st.state}/${st.reason} rem${st.remaining.toFixed(0)}`; }).join(' ; ')}`);
}

function inCellular(ctx: GameContext, p: Person): boolean {
  const v = p.vehicleId !== 0 ? ctx.vehicles.get(p.vehicleId) : undefined;
  return p.custody === 'in_vehicle' && !!v && v.kind === 'fourgon_cellulaire';
}

describe('interpellés des unités : le fourgon cellulaire vient, le binôme revient', () => {
  it('République (graine 5) : un groupe interpelle, l’interpellé monte au fourgon, le binôme est de retour en moins de 60 s', async () => {
    const { t, ctx } = await freeSession('Place de la République', 5);
    const g = frontGroup(ctx);
    const target = offenderNear(ctx, g, 12);
    const hold = stay(target);
    const stages: { stage: string; t: number; byId: number }[] = [];
    ctx.events.onAny(ARREST_EVENT, (e) => {
      const d = e as { targetId: number; stage: string; byId: number };
      if (d.targetId === target.id) stages.push({ stage: d.stage, t: ctx.clock.now, byId: d.byId });
    });
    const van0 = vans(ctx).map(({ v }) => ({ id: v.id, x: v.x, z: v.z }));
    const t0 = ctx.clock.now;
    ctx.squads.issue(g.id, { type: 'interpeller', targetId: target.id, x: target.x, z: target.z, byPlayer: true, issuedBy: ctx.player.state.personId });
    let inVanAt = -1;
    for (let i = 0; i < 1800 && inVanAt < 0; i++) {
      hold();
      t.step(0.1);
      if (inCellular(ctx, target)) inVanAt = ctx.clock.now;
    }
    const caught = stages.find((s) => s.stage === 'saisie');
    console.log(`étapes : ${stages.map((s) => `${s.stage}@${(s.t - t0).toFixed(0)}`).join(', ')} ; au fourgon à ${(inVanAt - t0).toFixed(0)} s ; custody ${target.custody}`);
    expect(caught, 'interpellé').toBeDefined();
    expect(inVanAt, 'monté dans un fourgon cellulaire').toBeGreaterThan(0);
    const v = ctx.vehicles.get(target.vehicleId)!;
    const before = van0.find((x) => x.id === v.id)!;
    console.log(`fourgon : parti de ${Math.hypot(before.x - target.x, before.z - target.z).toFixed(0)} m de l’interpellé, a roulé ${Math.hypot(v.x - before.x, v.z - before.z).toFixed(0)} m`);
    // le binôme : de retour (sans opération) moins de 60 s après la saisie
    const lead = ctx.people.get(caught!.byId)!;
    let backAt = -1;
    for (let i = 0; i < 600 && backAt < 0; i++) {
      const a = lead.brain as { op?: unknown } | null;
      if (a && a.op === null && lead.carrying === 0) backAt = ctx.clock.now;
      else t.step(0.1);
    }
    console.log(`binôme libre à ${(backAt - caught!.t).toFixed(0)} s de la saisie`);
    expect(backAt).toBeGreaterThan(0);
    expect(backAt - caught!.t).toBeLessThanOrEqual(60);
    expect(ctx.radio.log.filter((m) => m.t >= t0 && /demande un véhicule/.test(m.text)).map((m) => m.text)).toEqual([]);
    expect(ctx.radio.log.some((m) => m.t >= t0 && /Un interpellé conduit au CELLULAIRE \d/.test(m.text))).toBe(true);
  }, 600000);

  it('République : l’unité partie à 250 m des fourgons interpelle — le fourgon vient (plus de « demande un véhicule » sans réponse)', async () => {
    const { t, ctx } = await freeSession('Place de la République', 5);
    const g = frontGroup(ctx);
    const vs = vans(ctx);
    const c0 = centre(ctx, g);
    // un point sur la chaussée, à 250 m des fourgons, de côté par rapport à la foule
    const f = crowdCentre(ctx);
    const v0 = vs[0]!.v;
    const ax = f.x - v0.x, az = f.z - v0.z;
    const al = Math.hypot(ax, az) || 1;
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    let dest: { x: number; z: number } | null = null;
    for (const side of [1, -1]) {
      for (const along of [250, 220, 280, 200]) {
        const x = v0.x + (-az / al) * along * side;
        const z = v0.z + (ax / al) * along * side;
        if (ctx.world.nearestRoad(x, z, road, 30) && Math.hypot(road.x - v0.x, road.z - v0.z) > 180) {
          dest = { x: road.x, z: road.z };
          break;
        }
      }
      if (dest) break;
    }
    expect(dest, 'point de chaussée à 250 m').not.toBeNull();
    ctx.squads.issue(g.id, { type: 'colonne', x: dest!.x, z: dest!.z, byPlayer: true, issuedBy: ctx.player.state.personId });
    for (let i = 0; i < 400; i++) {
      t.step(1);
      const c = centre(ctx, g);
      if (Math.hypot(c.x - dest!.x, c.z - dest!.z) < 15) break;
    }
    const c1 = centre(ctx, g);
    const far = Math.min(...vs.map(({ v }) => Math.hypot(v.x - c1.x, v.z - c1.z)));
    console.log(`groupe parti de (${c0.x.toFixed(0)}, ${c0.z.toFixed(0)}) à ${Math.hypot(c1.x - dest!.x, c1.z - dest!.z).toFixed(0)} m du point ; fourgon le plus proche à ${far.toFixed(0)} m`);
    expect(far).toBeGreaterThan(150);
    // un passant commet un fait sous leurs yeux, à 8 m
    const target = ctx.people.spawn({ kind: 'manifestant', x: c1.x + 8, z: c1.z });
    ctx.law.recordOffense(target, 'degradation', target.x, target.z, 2).witnessed = true;
    const hold = stay(target);
    const start = vs.map(({ v }) => ({ id: v.id, x: v.x, z: v.z }));
    const t0 = ctx.clock.now;
    ctx.squads.issue(g.id, { type: 'interpeller', targetId: target.id, x: target.x, z: target.z, byPlayer: true, issuedBy: ctx.player.state.personId });
    let inVanAt = -1;
    for (let i = 0; i < 3000 && inVanAt < 0; i++) {
      hold();
      t.step(0.1);
      if (inCellular(ctx, target)) inVanAt = ctx.clock.now;
      if (i % 100 === 0) probe(ctx, target, t0);
    }
    const v = target.vehicleId !== 0 ? ctx.vehicles.get(target.vehicleId) : undefined;
    const from = v ? start.find((x) => x.id === v.id) : undefined;
    console.log(`au fourgon à ${(inVanAt - t0).toFixed(0)} s ; le fourgon a roulé ${v && from ? Math.hypot(v.x - from.x, v.z - from.z).toFixed(0) : '—'} m`);
    expect(inVanAt, 'monté dans un fourgon cellulaire').toBeGreaterThan(0);
    expect(Math.hypot(v!.x - from!.x, v!.z - from!.z), 'le fourgon est venu').toBeGreaterThan(100);
    expect(ctx.radio.log.filter((m) => m.t >= t0 && /demande un véhicule/.test(m.text)).map((m) => m.text)).toEqual([]);
  }, 900000);
});

/** Lance un verbe du joueur sur une cible et laisse l'action aller à son terme. */
function act(t: Ctx, actor: Person, verb: 'maitriser' | 'menotter' | 'palper' | 'escorter', targetId: number): boolean {
  const ctx = t.ctx;
  if (!ctx.interactions.startVerb(actor, verb, targetId)) return false;
  const cur = ctx.interactions.current(actor);
  if (cur) t.step(cur.opt.duration + 0.2);
  return true;
}

/** Le joueur interpelle lui-même un auteur posé à côté de lui (maîtrise, menottes, palpation, escorte). */
function arrestByPlayer(t: Ctx, me: Person, target: Person): void {
  const ctx = t.ctx;
  for (let i = 0; i < 8 && target.custody !== 'held'; i++) {
    me.x = target.x;
    me.z = target.z - 1;
    ctx.people.rebuildIndex();
    act(t, me, 'maitriser', target.id);
    if ((target.custody as Person['custody']) !== 'held') t.step(2.1);
  }
  expect(target.custody, 'maîtrisé par le joueur').toBe('held');
  expect(act(t, me, 'menotter', target.id)).toBe(true);
  act(t, me, 'palper', target.id);
  expect(act(t, me, 'escorter', target.id)).toBe(true);
  expect(target.custody).toBe('escorted');
  expect(target.heldBy).toBe(me.id);
}

describe('interpellé du joueur : « Confier », et personne n’est laissé seul', () => {
  it('« Confier » : le joueur a les mains libres tout de suite, un binôme le prend en moins de 15 s et le conduit au fourgon', async () => {
    const { t, ctx } = await freeSession('Place de la République', 5);
    const me = ctx.player.person()!;
    const target = ctx.people.spawn({ kind: 'manifestant', x: me.x + 1.5, z: me.z });
    ctx.law.recordOffense(target, 'jet_projectile', target.x, target.z, 2).witnessed = true;
    arrestByPlayer(t, me, target);
    const desk = ctx.service<PoliceArrestsApi>(POLICE_ARRESTS_SERVICE)!;
    const pair = desk.pairFor(me.id);
    console.log(`binôme proposé : ${pair ? `${pair.name} à ${pair.distance.toFixed(0)} m` : 'aucun'}`);
    expect(pair, 'un binôme libre à moins de 60 m').not.toBeNull();
    const r = desk.takeOver(target.id, me.id);
    expect(r.ok, r.reason).toBe(true);
    expect(r.squadName).toBe(pair!.name);
    const t0 = ctx.clock.now;
    t.step(0.5);
    expect(me.carrying, 'le joueur a les mains libres').toBe(0);
    expect(target.custody, 'menotté, assis en attendant').toBe('cuffed');
    let takenAt = -1;
    let inVanAt = -1;
    for (let i = 0; i < 2400 && inVanAt < 0; i++) {
      t.step(0.1);
      if (takenAt < 0 && target.custody === 'escorted' && target.heldBy !== me.id) takenAt = ctx.clock.now;
      if (i % 100 === 0) probe(ctx, target, t0);
      if (inCellular(ctx, target)) inVanAt = ctx.clock.now;
    }
    console.log(`pris en escorte à ${(takenAt - t0).toFixed(1)} s, au fourgon à ${(inVanAt - t0).toFixed(0)} s`);
    expect(takenAt).toBeGreaterThan(0);
    expect(takenAt - t0).toBeLessThanOrEqual(15);
    expect(inVanAt, 'au fourgon cellulaire').toBeGreaterThan(0);
  }, 600000);

  it('l’interpellé que le joueur fait asseoir puis laisse seul est ramassé et mis au fourgon (jamais seul plus de 120 s)', async () => {
    const { t, ctx } = await freeSession('Place de la République', 5);
    const me = ctx.player.person()!;
    const target = ctx.people.spawn({ kind: 'manifestant', x: me.x + 1.5, z: me.z });
    ctx.law.recordOffense(target, 'jet_projectile', target.x, target.z, 2).witnessed = true;
    arrestByPlayer(t, me, target);
    // « Faire asseoir », puis le joueur s'en va à 40 m
    expect(act(t, me, 'escorter', target.id)).toBe(true);
    expect(target.custody).toBe('cuffed');
    me.x += 40;
    ctx.people.rebuildIndex();
    const t0 = ctx.clock.now;
    let aloneUntil = -1;
    let inVanAt = -1;
    for (let i = 0; i < 3000 && inVanAt < 0; i++) {
      t.step(0.1);
      if (aloneUntil < 0 && target.custody !== 'cuffed') aloneUntil = ctx.clock.now;
      if (inCellular(ctx, target)) inVanAt = ctx.clock.now;
    }
    console.log(`seul ${(aloneUntil - t0).toFixed(1)} s, au fourgon à ${(inVanAt - t0).toFixed(0)} s`);
    expect(aloneUntil).toBeGreaterThan(0);
    expect(aloneUntil - t0).toBeLessThanOrEqual(120);
    expect(inVanAt).toBeGreaterThan(0);
  }, 600000);
});

describe('BRAV-M et « Aller constater »', () => {
  it('Concorde (graine 21) : la BRAV-M interpelle, pas de point de regroupement invisible, aucun interpellé parqué plus de 120 s', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'commandant', rank: 'commandant', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 300, tension: 0.4,
      volatility: 0.3, duration: 'standard',
      extra: { moyens: { sections: 3, fourgons: 9, centaure: 1, canon_eau: 1, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true }, variante: 'terrain' },
    } as never);
    t.step(3);
    const ctx = t.ctx;
    if (process.env.DEBUG_P13) console.log(ctx.squads.list.filter((s) => s.faction === 'police').map((s) => `${s.id}:${s.name}:${s.kind}:p${s.parentId}`).join(' | '));
    expect(vans(ctx).length, 'fourgons cellulaires engagés').toBeGreaterThan(0);
    // la BRAV-M : l'unité FAUCON de tête (sa mère n'est pas une unité FAUCON)
    const bravm = ctx.squads.list.find((s) => s.faction === 'police' && /^FAUCON/.test(s.name) && !/^FAUCON/.test(ctx.squads.get(s.parentId)?.name ?? ''))!;
    expect(bravm, 'BRAV-M engagée').toBeDefined();
    const riders: Person[] = [];
    const visit = (s: Squad): void => {
      for (const id of s.members) {
        const p = ctx.people.get(id);
        if (p && !p.isPlayer) riders.push(p);
      }
      for (const c of ctx.squads.childrenOf(s.id)) visit(c);
    };
    visit(bravm);
    const rx = riders.reduce((a, p) => a + p.x, 0) / riders.length;
    const rz = riders.reduce((a, p) => a + p.z, 0) / riders.length;
    const target = ctx.people.spawn({ kind: 'manifestant', x: rx + 25, z: rz });
    ctx.law.recordOffense(target, 'jet_projectile', target.x, target.z, 3).witnessed = true;
    const hold = stay(target);
    const handover = ctx.service<LawHandover>('law.handover');
    const points0 = handover ? handover.points.length : 0;
    const t0 = ctx.clock.now;
    ctx.squads.issue(bravm.id, { type: 'interpeller', targetId: target.id, x: target.x, z: target.z, byPlayer: true, issuedBy: ctx.player.state.personId });
    const parkedSince = new Map<number, number>();
    let worst = 0;
    for (let i = 0; i < 300; i++) {
      hold();
      t.step(1);
      if (i % 10 === 0) probe(ctx, target, t0);
      for (const p of ctx.people.list) {
        const alone = p.custody === 'handed_over' || (p.custody === 'cuffed' && p.heldBy === 0);
        if (!alone) {
          parkedSince.delete(p.id);
          continue;
        }
        const s0 = parkedSince.get(p.id) ?? ctx.clock.now;
        parkedSince.set(p.id, s0);
        worst = Math.max(worst, ctx.clock.now - s0);
      }
    }
    console.log(`BRAV-M ${bravm.name} : interpellé ${target.custody}${inCellular(ctx, target) ? ' (fourgon cellulaire)' : ''} ; parqué au plus ${worst.toFixed(0)} s ; points de regroupement ${points0} → ${handover ? handover.points.length : 0}`);
    expect(worst).toBeLessThanOrEqual(120);
    expect(handover ? handover.points.length : 0, 'aucun point de regroupement ajouté aux machines').toBe(points0);
    if (target.custody !== 'free') expect(inCellular(ctx, target), `interpellé ${target.custody}`).toBe(true);
    expect(ctx.radio.log.filter((m) => m.t >= t0 && /point de regroupement/.test(m.text)).map((m) => m.text)).toEqual([]);
  }, 900000);

  it('« Interpeller » sans fait constaté : la troupe ne refuse pas, va constater à une dizaine de mètres et interpelle au premier fait', async () => {
    const { t, ctx } = await freeSession('Place de la République', 5);
    const g = frontGroup(ctx);
    const refused: string[] = [];
    ctx.events.onAny(ORDER_REFUSED_EVENT, (e) => refused.push((e as { reason: string }).reason));
    const c = centre(ctx, g);
    const f = crowdCentre(ctx);
    const d = Math.hypot(f.x - c.x, f.z - c.z) || 1;
    const px = c.x + ((f.x - c.x) / d) * 30;
    const pz = c.z + ((f.z - c.z) / d) * 30;
    const t0 = ctx.clock.now;
    ctx.squads.issue(g.id, { type: 'interpeller', targetId: 0, x: px, z: pz, byPlayer: true, issuedBy: ctx.player.state.personId });
    t.step(25);
    const members = g.members.map((id) => ctx.people.get(id)!).filter((p) => p && !p.isPlayer);
    const nearest = Math.min(...members.map((p) => Math.hypot(p.x - px, p.z - pz)));
    const ack = ctx.radio.log.filter((m) => m.t >= t0 && m.from === g.name).map((m) => m.text);
    console.log(`refus : ${refused.join(' | ') || 'aucun'} ; agent le plus proche du point à ${nearest.toFixed(1)} m ; radio : ${ack.join(' / ')}`);
    expect(refused).toEqual([]);
    expect(nearest).toBeGreaterThan(5);
    expect(nearest).toBeLessThan(16);
    expect(ack.some((x) => /constater/.test(x))).toBe(true);
    // un fait est commis sous leurs yeux, au point : interpellation
    const target = ctx.people.spawn({ kind: 'manifestant', x: px + 2, z: pz });
    ctx.law.recordOffense(target, 'degradation', target.x, target.z, 2).witnessed = true;
    const hold = stay(target);
    let caughtAt = -1;
    for (let i = 0; i < 600 && caughtAt < 0; i++) {
      hold();
      t.step(0.1);
      if (target.custody !== 'free') caughtAt = ctx.clock.now;
    }
    console.log(`interpellé ${caughtAt > 0 ? `${(caughtAt - t0 - 25).toFixed(1)} s après le fait` : 'jamais'}`);
    expect(caughtAt).toBeGreaterThan(0);
  }, 600000);
});
