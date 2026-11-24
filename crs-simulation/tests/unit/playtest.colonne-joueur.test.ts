// Recette jouée : la colonne de la journée de service et la mission du joueur (ecole-01 « Tenir la ligne », lancée
// depuis la fiche de l'accueil). Un robot qui joue comme le joueur : il monte dans le fourgon désigné par l'objectif
// « Embarquez », en passager (la touche « monter ») OU au volant (il choisit de conduire) ; au volant, il attend
// d'abord une minute sans rouler, puis conduit le fourgon jusqu'à la zone de stationnement. Une fois arrivé, il obéit à
// la carte « Ma mission ».
//   (a) une colonne conduite par le joueur ne se dit ni arrivée ni bloquée parce qu'il n'a pas encore démarré : elle
//       l'attend et le lui rappelle (« on attend votre départ ») ;
//   (b) la carte de l'exécutant le mène là où l'objectif principal de sa mission est jugé ;
//   (c) la mission ne commence qu'à l'arrivée du joueur (ou de la tête de colonne).
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, Person, SessionConfig, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
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
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as missions, missionConfig } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';
import { JOURNEE_SERVICE, MISSION_SERVICE } from '@/gameplay/session';
import type { JourneeApi, MissionBrief } from '@/gameplay/session';
import { MISSIONS } from '@/gameplay/missions/catalog';
import { createObjectives } from '@/ui/core/objectives';
import { pickMission } from '@/ui/screens/home-panes-a';
import type { HomeModel } from '@/ui/screens/home';
import { buildSessionConfig, defaultDraft, sanitizeDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { readMissions } from '@/ui/screens/services';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session, missions, objectives];

function launchFromSheet(ctx: GameContext, id: string): SessionConfig {
  const draft: ScenarioDraft = defaultDraft();
  const model = {
    draft,
    update(patch: Partial<ScenarioDraft>) { Object.assign(draft, sanitizeDraft({ ...draft, ...patch }, draft)); },
    replace(next: ScenarioDraft) { Object.assign(draft, sanitizeDraft(next, draft)); },
  } as unknown as HomeModel;
  const catalog = readMissions({
    catalog: MISSIONS.map((m) => ({
      id: m.id, title: m.title, roles: [m.role, ...m.altRoles], type: m.type, difficulty: m.difficulty, summary: m.pitch, place: m.place,
      config: missionConfig(m, ctx.world),
    })),
  });
  pickMission(model, catalog.find((m) => m.id === id)!);
  return buildSessionConfig(draft);
}

/** Avance le joueur à pied de `dist` mètres vers (x, z) par les trottoirs. */
function walk(ctx: GameContext, me: Person, x: number, z: number, dist: number, path: number[]): void {
  if (me.vehicleId !== 0 || Math.hypot(x - me.x, z - me.z) < 1) return;
  path.length = 0;
  if (!ctx.world.findPath(me.x, me.z, x, z, 'foot', path) || path.length < 4) return;
  let left = dist;
  for (let i = 2; i < path.length && left > 0; i += 2) {
    const dx = path[i]! - me.x, dz = path[i + 1]! - me.z;
    const l = Math.hypot(dx, dz);
    if (l <= left) { me.x = path[i]!; me.z = path[i + 1]!; left -= l; }
    else { me.x += (dx / l) * left; me.z += (dz / l) * left; left = 0; }
  }
}

/** Le joueur au volant conduit `dist` mètres vers (x, z) par les rues (comme il le ferait au clavier). */
function drive(ctx: GameContext, v: Vehicle, x: number, z: number, dist: number, path: number[]): void {
  if (Math.hypot(x - v.x, z - v.z) < 8) { v.speed = 0; v.vx = 0; v.vz = 0; return; }
  path.length = 0;
  if (!ctx.world.findPath(v.x, v.z, x, z, 'vehicle', path) || path.length < 4) return;
  let left = dist;
  for (let i = 2; i < path.length && left > 0; i += 2) {
    const dx = path[i]! - v.x, dz = path[i + 1]! - v.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.01) continue;
    v.heading = Math.atan2(dx, dz);
    if (l <= left) { v.x = path[i]!; v.z = path[i + 1]!; left -= l; }
    else { v.x += (dx / l) * left; v.z += (dz / l) * left; left = 0; }
  }
  const s = Math.hypot(x - v.x, z - v.z) < 8 ? 0 : dist;
  v.speed = s;
  v.vx = Math.sin(v.heading) * s;
  v.vz = Math.cos(v.heading) * s;
  const me = ctx.player.person();
  if (me) { me.x = v.x; me.z = v.z; }
}

interface Run { started: number; startDist: number; journee: string[]; radio: string[]; card: string[]; result: string; success: boolean; held: number }

async function play(id: string, seat: 'passenger' | 'driver', idle: number): Promise<Run> {
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.ready;
  const { ctx } = t;
  const cfg = launchFromSheet(ctx, id);
  await t.start(cfg);
  const m = ctx.service<MissionsApi>('missions')!;
  const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
  const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
  const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
  const out: Run = { started: -1, startDist: -1, journee: [], radio: [], card: [], result: '', success: false, held: 0 };
  const path: number[] = [];
  let boardedAt = -1;
  for (let s = 0; s < 1200 && m.phaseIndex < 0 && !m.result; s++) {
    t.step(1);
    const me = ctx.player.person()!;
    if (!out.journee.includes(j.stage)) out.journee.push(j.stage);
    if (brief.status && !out.card.includes(brief.status)) out.card.push(brief.status);
    if (me.vehicleId === 0) {
      const e = obj.list.find((o) => o.state === 'actif' && /^Embarquez/.test(o.text) && o.x !== undefined);
      if (!e) continue;
      walk(ctx, me, e.x!, e.z!, 4, path);
      const v = ctx.vehicles.list.find((x) => Math.hypot(x.x - e.x!, x.z - e.z!) < 6 && Math.hypot(x.x - me.x, x.z - me.z) < 6);
      if (!v) continue;
      // au volant : comme « monter » sur la place du conducteur (il choisit de conduire) ; sinon place de passager
      if (seat === 'driver') {
        if (v.seats[0] !== 0 && v.seats[0] !== me.id) { const d = ctx.people.get(v.seats[0]!); if (d) ctx.vehicles.exit(d); }
        ctx.vehicles.enter(me, v);
      } else ctx.vehicles.enter(me, v, 'passenger');
      if (me.vehicleId !== 0) boardedAt = s;
      continue;
    }
    const v = ctx.vehicles.get(me.vehicleId)!;
    if (seat === 'driver' && v.seats[0] === me.id && boardedAt >= 0 && s - boardedAt > idle && j.destination) {
      drive(ctx, v, j.destination.x, j.destination.z, 9, path);
    }
  }
  const me = ctx.player.person()!;
  out.started = m.phaseIndex >= 0 ? ctx.clock.now : -1;
  out.startDist = j.destination ? Math.hypot(me.x - j.destination.x, me.z - j.destination.z) : -1;
  out.radio = ctx.radio.log.map((l) => l.text);
  console.log(`${id} ${seat} : journée ${out.journee.join(' > ')} ; mission ${m.phaseIndex >= 0 ? 'commencée' : 'non commencée'} à ${ctx.clock.now.toFixed(0)} s, joueur à ${out.startDist.toFixed(0)} m du stationnement`);
  // une fois sur place : il obéit à la carte « Ma mission »
  if (me.vehicleId !== 0 && m.phaseIndex >= 0) ctx.vehicles.exit(me);
  for (let s = 0; s < 260 && m.phaseIndex >= 0 && !m.result; s++) {
    t.step(1);
    if (brief.active && brief.instruction.x !== undefined && brief.instruction.z !== undefined) walk(ctx, me, brief.instruction.x, brief.instruction.z, 3, path);
    const o1 = m.objectives.find((r) => r.def.id === 'o1');
    if (o1) out.held = o1.progress;
    if (s % 40 === 0) console.log(`  t=${s} carte « ${brief.active ? brief.instruction.title : '-'} » (${brief.instruction.x?.toFixed(0)}, ${brief.instruction.z?.toFixed(0)}) ; joueur (${me.x.toFixed(0)}, ${me.z.toFixed(0)}) ; o1 ${o1 ? (o1.progress * 100).toFixed(0) : '-'} % (${o1?.at?.x.toFixed(0)}, ${o1?.at?.z.toFixed(0)})`);
  }
  if (!m.result && m.phaseIndex >= 0) m.finish();
  t.step(1);
  out.result = m.result ? m.result.summary : '';
  out.success = !!m.result && m.result.success;
  console.log(`  → ${out.success ? 'réussie' : 'manquée'} : ${out.result} ; o1 ${(out.held * 100).toFixed(0)} %`);
  return out;
}

describe('colonne de la journée et mission du joueur (ecole-01)', () => {
  it('au volant sans rouler : la colonne l’attend, le lui rappelle, et la mission commence sur place quand il y conduit', async () => {
    const r = await play('ecole-01-tenir-la-ligne', 'driver', 60);
    console.log(`  carte : ${r.card.join(' | ')}`);
    expect(r.radio.some((x) => /attend votre départ/.test(x))).toBe(true);
    expect(r.card.some((x) => /attend votre départ/.test(x))).toBe(true);
    expect(r.started).toBeGreaterThan(0);
    expect(r.startDist).toBeLessThan(150);
    expect(r.success).toBe(true);
  }, 900_000);

  it('passager : l’élève qui obéit à sa carte « Ma mission » réussit l’atelier', async () => {
    const r = await play('ecole-01-tenir-la-ligne', 'passenger', 0);
    expect(r.started).toBeGreaterThan(0);
    expect(r.startDist).toBeLessThan(150);
    expect(r.held).toBeGreaterThanOrEqual(1);
    expect(r.success).toBe(true);
  }, 900_000);
});

describe('grandes colonnes et filet du trajet : la mission commence quand le joueur est sur place', () => {
  it('cg-01 (quatorze fourgons, boulevard Voltaire), passager : la mission commence à son arrivée, sans attendre le filet des 900 s', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.ready;
    const { ctx } = t;
    await t.start(launchFromSheet(ctx, 'cg-01-six-dont-moi'));
    const m = ctx.service<MissionsApi>('missions')!;
    const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    const path: number[] = [];
    let s = 0;
    for (; s < 1000 && m.phaseIndex < 0; s++) {
      t.step(1);
      const me = ctx.player.person()!;
      if (me.vehicleId !== 0) continue;
      const e = obj.list.find((o) => o.state === 'actif' && /^Embarquez/.test(o.text) && o.x !== undefined);
      if (!e) continue;
      walk(ctx, me, e.x!, e.z!, 4, path);
      const v = ctx.vehicles.list.find((x) => Math.hypot(x.x - e.x!, x.z - e.z!) < 6 && Math.hypot(x.x - me.x, x.z - me.z) < 6);
      if (v) ctx.vehicles.enter(me, v, 'passenger');
    }
    const me = ctx.player.person()!;
    const d = j.destination!;
    const far = Math.hypot(me.x - d.x, me.z - d.z);
    console.log(`cg-01 : mission ${m.phaseIndex >= 0 ? 'commencée' : 'non commencée'} après ${s} s (journée ${j.stage}), joueur à ${far.toFixed(0)} m du stationnement`);
    expect(m.phaseIndex).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(850);
    expect(far).toBeLessThan(200);
  }, 1_800_000);

  it('bravm-02, chef de bord en selle qui ne part pas : pas de mission à deux kilomètres au bout de 900 s ; elle commence quand il arrive', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.ready;
    const { ctx } = t;
    await t.start(launchFromSheet(ctx, 'bravm-02-cortege-sauvage'));
    const m = ctx.service<MissionsApi>('missions')!;
    const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
    t.step(960);
    const me = ctx.player.person()!;
    const d = j.destination!;
    const far = Math.hypot(me.x - d.x, me.z - d.z);
    console.log(`bravm-02 : au bout de 960 s, journée ${j.stage}, mission ${m.phaseIndex >= 0 ? 'commencée' : 'non commencée'}, joueur à ${far.toFixed(0)} m du point (véh ${me.vehicleId})`);
    expect(far).toBeGreaterThan(1000);
    expect(m.phaseIndex).toBe(-1);
    // il conduit sa moto jusqu'au point : la mission commence à son arrivée
    const path: number[] = [];
    let s = 0;
    for (; s < 900 && m.phaseIndex < 0; s++) {
      t.step(1);
      const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
      if (v) drive(ctx, v, d.x, d.z, 12, path);
      else walk(ctx, me, d.x, d.z, 4, path);
    }
    const after = Math.hypot(me.x - d.x, me.z - d.z);
    console.log(`bravm-02 : mission ${m.phaseIndex >= 0 ? 'commencée' : 'non commencée'} ${s} s après son départ, joueur à ${after.toFixed(0)} m du point`);
    expect(m.phaseIndex).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThan(450);
  }, 1_800_000);
});
