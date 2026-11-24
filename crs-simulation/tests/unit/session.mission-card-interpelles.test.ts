// Carte « Ma mission » et étiquettes des fourgons cellulaires sur la vraie carte de Paris (plan ordres-directs §5.2, §5.3,
// §5.7, §4.1.6, paquet P15) :
//  - un CRS interpelle lui-même un lanceur de projectile (place de la République, graine 5) : 0,5 s après la palpation,
//    la carte dit en tête ce qu'il fait de l'interpellé (la même issue que la 4e invite), avant l'ordre de son groupe ;
//    pendant qu'il le tient, tous les fourgons cellulaires portent leur étiquette « Fourgon cellulaire n — pour les
//    interpellés » ; à côté du fourgon, « Remettez l’interpellé au fourgon cellulaire n », repère sur le fourgon ; remis,
//    l'étiquette dit « CELLULAIRE n · 1/8 » (sur la carte aussi), et le compte rendu « 1 — 1 dans le fourgon cellulaire n » ;
//  - seul loin de tout : « Faites venir le fourgon cellulaire n », puis « Le fourgon cellulaire n vient vous chercher »
//    avec le repère qui suit le fourgon ;
//  - patrouille : interpellé à l'arrière de la voiture → « Conduisez l’interpellé au commissariat du … », repère sur la
//    porte du commissariat le plus proche ;
//  - chef de la BRAV-M, journée de service : « Montez sur votre moto (E) — la BRAV-M part avec vous », puis « Votre moto
//    vous attend » et sa distance, en tête de la carte, repère sur sa moto.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, InteractionOption, ModuleFactory, Person, SessionConfig, Squad, Vehicle } from '@/core/contracts';
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
import { createSystems as session, JOURNEE_SERVICE, SERVICE_BASES } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats, COMMISSARIATS_SERVICE } from '@/gameplay/commissariats';
import type { CommissariatsApi } from '@/gameplay/commissariats';
import { atName } from '@/gameplay/commissariats/texts';
import { createSystems as transfer, VAN_INTRO_SECONDS } from '@/gameplay/transfer';
import type { LawCustody, LawRecords } from '@/gameplay/law/api';
import { LAW_CUSTODY_SERVICE, LAW_RECORDS_SERVICE } from '@/gameplay/law/api';
import { MISSION_OBJECTIVE_ID, MISSION_SERVICE } from '@/gameplay/session/mission-api';
import type { MissionBrief } from '@/gameplay/session/mission-api';
import { POLICE_ARRESTS_SERVICE } from '@/sim/police/arrest-service';
import type { PoliceArrestsApi } from '@/sim/police/arrest-service';
import { commissariatById } from '@/world/commissariats';
import { createObjectives } from '@/ui/core/objectives';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { SendEnv } from '@/ui/command/cardTypes';
import { custodyLine } from '@/ui/command/fieldHud';
import { buildCard } from '@/ui/command/intents';
import { cardEnvFromCore } from '@/ui/command/reperes';
import { sendCardLine } from '@/ui/command/sendLine';
import { TRANSFER_SERVICE } from '@/gameplay/transfer';
import type { TransferApi } from '@/gameplay/transfer';
import { ensureHudMarks } from '@/ui/hud/markers';
import type { HudMarksApi } from '@/ui/hud/markers';
import { orderHeadline } from '@/ui/hud/mission';
import { UnitModel } from '@/ui/maps/units';
import { detaineesLine } from '@/ui/screens/debrief';
import { buildSessionConfig, defaultDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';

const world = () => createWorldQuerySystems({ source: 'paris' });
/** Objectifs (le HUD les fournit dans le jeu) et repères des modules (service 'hud.marks', créé par le HUD dans le jeu). */
const hud: ModuleFactory = () => [{
  id: 'test.hud', order: 0,
  provide(ctx: GameContext) {
    ctx.provide(EXT.objectives, createObjectives());
    ensureHudMarks(ctx);
  },
} as GameSystem];
const SIM: ModuleFactory[] = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session,
  patrols, commissariats, transfer, hud];

type Ctx = ReturnType<typeof createTestContext>;
interface Run { t: Ctx; ctx: GameContext; me: Person }

const NB = ' ';

async function crsSession(seed: number): Promise<Run> {
  const place = DEFAULT_PLACES.find((p) => p.name === 'Place de la République')!;
  const d: ScenarioDraft = {
    ...defaultDraft(), role: 'crs' as never, rank: 'gardien' as never, poste: 'bouclier' as never, variante: '',
    place: place.name, x: place.x, z: place.z, crowdSize: 150, seed,
  };
  d.mode = 'libre';
  d.options = { ...d.options, journee: false };
  const t = createTestContext({ seed, strict: false, modules: SIM });
  await t.start(buildSessionConfig(d));
  t.step(3);
  return { t, ctx: t.ctx, me: t.ctx.player.person()! };
}

function brief(ctx: GameContext): MissionBrief {
  return ctx.require<MissionBrief>(MISSION_SERVICE);
}

function press(r: Run): InteractionOption {
  const opts: InteractionOption[] = [];
  r.ctx.interactions.options(r.me, opts);
  const top = opts[0];
  expect(top, 'une invite').toBeDefined();
  const copy = { ...top! };
  expect(r.ctx.interactions.start(r.me, top!)).toBe(true);
  const cur = r.ctx.interactions.current(r.me);
  if (cur) r.t.step(cur.opt.duration + 0.2);
  return copy;
}

let named = 0;
/** Interpeller, menotter, palper un auteur de fait constaté posé devant le joueur. */
function threePresses(r: Run): Person {
  const { ctx, me } = r;
  const target = ctx.people.spawn({ kind: 'manifestant', x: me.x + Math.sin(me.heading) * 1.2, z: me.z + Math.cos(me.heading) * 1.2, name: `Christian Lopez ${++named}` });
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
  return target;
}

function moveTo(r: Run, x: number, z: number, heading = r.me.heading): void {
  r.me.x = x;
  r.me.z = z;
  r.me.y = r.ctx.world.heightAt(x, z);
  r.me.heading = heading;
  r.me.aimYaw = heading;
  r.ctx.people.rebuildIndex();
}

function vans(ctx: GameContext): { v: Vehicle; s: Squad }[] {
  const out: { v: Vehicle; s: Squad }[] = [];
  for (const s of ctx.squads.list) {
    const v = s.faction === 'police' && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
    if (v && v.kind === 'fourgon_cellulaire' && s.kind === 'equipage') out.push({ v, s });
  }
  return out;
}

/** Place du joueur à 7 m du flanc d'un fourgon, libre pour lui et pour l'auteur devant lui. */
function besideVan(r: Run, v: Vehicle): { x: number; z: number; h: number } {
  const w = r.ctx.world;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  for (const [lat, lon] of [[7, 0], [-7, 0], [0, -9], [7, -4], [-7, -4], [0, 10]] as const) {
    const x = v.x + fz * lat + fx * lon, z = v.z - fx * lat + fz * lon;
    if (w.isFree(x, z, 0.6) && w.isFree(x + fx * 1.2, z + fz * 1.2, 0.6)) return { x, z, h: v.heading };
  }
  return { x: v.x + fz * 7, z: v.z - fx * 7, h: v.heading };
}

function objective(ctx: GameContext): { x: number; z: number; text: string } | null {
  const o = ctx.require<ObjectivesApi>(EXT.objectives).list.find((q) => q.id === MISSION_OBJECTIVE_ID && q.state === 'actif');
  return o && o.x !== undefined && o.z !== undefined ? { x: o.x, z: o.z, text: o.text } : null;
}

function mark(ctx: GameContext, id: string): string | null {
  const m = ctx.require<HudMarksApi>('hud.marks').list().find((q) => q.id === id);
  return m ? m.label : null;
}

function nearestCop(ctx: GameContext, x: number, z: number): number {
  let best = Infinity;
  for (const p of ctx.people.list) {
    if (p.faction !== 'police' || p.isPlayer || p.vehicleId !== 0 || p.dormant) continue;
    best = Math.min(best, Math.hypot(p.x - x, p.z - z));
  }
  return best;
}

describe('carte « Ma mission » : l’interpellé du joueur en tête, les fourgons étiquetés (vraie carte)', () => {
  it('CRS : la consigne de l’interpellé ≤ 0,5 s après la palpation ; étiquettes ; « Remettez … » au fourgon ; 1/8 ; compte rendu', async () => {
    const r = await crsSession(5);
    const { t, ctx, me } = r;
    const custody = ctx.require<LawCustody>(LAW_CUSTODY_SERVICE);
    const all = vans(ctx);
    expect(all.length).toBeGreaterThanOrEqual(2);
    const target = threePresses(r);
    t.step(0.5);
    const way = custody.bestWay(me.id)!;
    const b = brief(ctx);
    console.log(`issue : ${way.kind} « ${way.label} » ; carte : « ${b.instruction.title} » / « ${b.instruction.detail} »`);
    expect(b.active).toBe(true);
    expect(b.instruction.source).toBe('custody');
    const expected: Record<string, RegExp> = {
      confier: new RegExp(`^Confiez l’interpellé à ${way.name}$`), remettre_fourgon: /^Remettez l’interpellé au fourgon cellulaire \d$/,
      remettre: /^Remettez l’interpellé /, faire_venir: /^Faites venir le fourgon cellulaire \d$/, emmener: /^(Emmenez l’interpellé|Le fourgon cellulaire)/,
    };
    expect(b.instruction.title).toMatch(expected[way.kind]!);
    expect(orderHeadline(b, false, me).head).toBe('VOTRE INTERPELLÉ');
    // il tient un interpellé : tous les fourgons cellulaires portent leur étiquette de présentation
    for (const { s } of all) expect(mark(ctx, `cellulaire:${s.id}`)).toMatch(/^Fourgon cellulaire \d — pour les interpellés$/);

    // à côté d'un fourgon : « Remettez l’interpellé au fourgon cellulaire n », repère sur le fourgon
    const { v, s } = all[0]!;
    const at = besideVan(r, v);
    moveTo(r, at.x, at.z, at.h);
    target.x = me.x + Math.sin(me.heading) * 1.2;
    target.z = me.z + Math.cos(me.heading) * 1.2;
    ctx.people.rebuildIndex();
    t.step(0.6);
    expect(custody.bestWay(me.id)!.kind).toBe('remettre_fourgon');
    expect(brief(ctx).instruction.title).toBe(`Remettez l’interpellé au fourgon cellulaire ${s.name.replace(/^CELLULAIRE /, '')}`);
    const o = objective(ctx)!;
    expect(o, 'repère de la carte').not.toBeNull();
    expect(Math.hypot(o.x - v.x, o.z - v.z)).toBeLessThan(3);
    expect(press(r).verb).toBe('remettre');
    expect(target.custody).toBe('in_vehicle');
    t.step(1);
    expect(brief(ctx).instruction.source).not.toBe('custody');
    // à 150 m au plus : la présentation, puis sa charge (interpellés seuls)
    t.step(VAN_INTRO_SECONDS + 1);
    expect(mark(ctx, `cellulaire:${s.id}`)).toBe(`${s.name} · 1/8`);
    // la carte de commandement dit la même chose
    const model = new UnitModel();
    model.refresh(ctx, { police: true, rescue: true, crowd: true } as never);
    const u = model.get(s.id)!;
    expect(u.cellular).toBe(true);
    expect(u.status).toBe(`${s.name} · 1/8`);
    // plus loin que 150 m, sans interpellé : plus d'étiquette
    moveTo(r, v.x + 400, v.z);
    t.step(0.6);
    expect(mark(ctx, `cellulaire:${s.id}`)).toBeNull();
    // compte rendu : les comptes du dossier
    const records = ctx.require<LawRecords>(LAW_RECORDS_SERVICE);
    expect(detaineesLine(records.interpellations)).toBe(`1 — 1 dans le fourgon cellulaire ${s.name.replace(/^CELLULAIRE /, '')}`);
  }, 600000);

  it('CRS seul loin de tout : « Faites venir le fourgon cellulaire n », puis « … vient vous chercher », repère sur le fourgon qui roule', async () => {
    const r = await crsSession(5);
    const { t, ctx, me } = r;
    const custody = ctx.require<LawCustody>(LAW_CUSTODY_SERVICE);
    const desk = ctx.require<PoliceArrestsApi>(POLICE_ARRESTS_SERVICE);
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
        if (dv > 150 && Math.hypot(road.x - fx, road.z - fz) > crowdD + 60 && nearestCop(ctx, road.x, road.z) > 90 && ctx.world.isFree(road.x, road.z, 1.5)) {
          spot = { x: road.x + Math.cos(road.heading) * 2, z: road.z - Math.sin(road.heading) * 2, h: road.heading };
          break;
        }
      }
    }
    expect(spot, 'un point de chaussée isolé').not.toBeNull();
    moveTo(r, spot!.x, spot!.z, spot!.h);
    const target = threePresses(r);
    t.step(0.5);
    const way = custody.bestWay(me.id)!;
    expect(way.kind).toBe('faire_venir');
    let b = brief(ctx);
    expect(b.instruction.title).toMatch(/^Faites venir le fourgon cellulaire \d$/);
    expect(b.instruction.detail).toMatch(new RegExp(`^E${NB}: faire venir le fourgon cellulaire \\d \\(\\d+${NB}m\\) — il vient jusqu’à vous\\.$`));
    expect(press(r).verb).toBe('faire_venir');
    const going = desk.fetching(target.id)!;
    expect(going).not.toBeNull();
    const van = ctx.vehicles.get(going.vehicleId)!;
    t.step(0.6);
    b = brief(ctx);
    expect(b.instruction.title).toBe(`Le fourgon cellulaire ${going.name.replace(/^CELLULAIRE /, '')} vient vous chercher`);
    // le repère suit le fourgon qui roule
    t.step(8);
    const o = objective(ctx)!;
    console.log(`fourgon à ${Math.hypot(van.x - me.x, van.z - me.z).toFixed(0)} m ; repère à ${Math.hypot(o.x - van.x, o.z - van.z).toFixed(1)} m du fourgon`);
    expect(Math.hypot(o.x - van.x, o.z - van.z)).toBeLessThan(8);
    expect(brief(ctx).instruction.source).toBe('custody');
  }, 600000);

  it('patrouille : interpellé à l’arrière de la voiture → « Conduisez l’interpellé au commissariat … », repère sur la porte', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: SIM });
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
    const me = ctx.player.person()!;
    const r: Run = { t, ctx, me };
    const crew = ctx.squads.get(me.squadId)!;
    const car = ctx.vehicles.get(crew.vehicleId)!;
    // rien à dire : pas de carte (la patrouille garde sa radio et ses appels)
    expect(brief(ctx).active).toBe(false);
    ctx.vehicles.exit(me);
    moveTo(r, car.x + Math.cos(car.heading) * 4, car.z - Math.sin(car.heading) * 4, car.heading);
    const target = threePresses(r);
    t.step(0.6);
    expect(brief(ctx).active).toBe(true);
    expect(brief(ctx).instruction.source).toBe('custody');
    // à l'arrière de la voiture
    expect(ctx.vehicles.enter(target, car, 'passenger')).toBe(true);
    target.custody = 'in_vehicle';
    t.step(0.6);
    const stations = ctx.require<CommissariatsApi>(COMMISSARIATS_SERVICE);
    let best = stations.list[0]!;
    for (const c of stations.list) {
      if (c.kind === 'caserne_gendarmerie') continue;
      if (best.kind === 'caserne_gendarmerie' || Math.hypot(c.x - car.x, c.z - car.z) < Math.hypot(best.x - car.x, best.z - car.z)) best = c;
    }
    const b = brief(ctx);
    expect(b.instruction.title).toBe(`Conduisez l’interpellé ${atName(commissariatById(best.id)!)}`);
    expect(b.heading).toBe('Équipage de patrouille');
    const o = objective(ctx)!;
    expect(Math.hypot(o.x - best.x, o.z - best.z)).toBeLessThan(3);
    expect(orderHeadline(b, false, me).head).toBe('VOTRE INTERPELLÉ');
  }, 600000);
});

describe('commandant : la fiche du fourgon cellulaire et la ligne des interpellés', () => {
  it('« Partir au commissariat » sur la fiche du fourgon (carte de commandement) : il part ; « Interpellés 1 · CELLULAIRE n 1/8 · 0 au commissariat »', async () => {
    const place = DEFAULT_PLACES.find((p) => p.name === 'Place de la République')!;
    const d: ScenarioDraft = {
      ...defaultDraft(), role: 'commandant' as never, rank: 'commandant' as never, poste: 'commandant_unite' as never, variante: '',
      place: place.name, x: place.x, z: place.z, crowdSize: 150, seed: 5,
    };
    d.mode = 'libre';
    d.options = { ...d.options, journee: false };
    const t = createTestContext({ seed: 5, strict: false, modules: [...SIM, command] });
    await t.start(buildSessionConfig(d));
    t.step(3);
    const ctx = t.ctx;
    const core = ctx.require<CommandCore>('ui.command');
    const { v, s } = vans(ctx)[0]!;
    // un interpellé à bord (remis par un binôme)
    const p = ctx.people.spawn({ kind: 'manifestant', x: v.x + 3, z: v.z, name: 'Paul Durand' });
    ctx.law.recordOffense(p, 'jet_projectile', p.x, p.z, 2).witnessed = true;
    const r: Run = { t, ctx, me: ctx.player.person()! };
    const at = besideVan(r, v);
    moveTo(r, at.x, at.z, at.h);
    p.x = r.me.x + Math.sin(r.me.heading) * 1.2;
    p.z = r.me.z + Math.cos(r.me.heading) * 1.2;
    ctx.people.rebuildIndex();
    for (let i = 0; i < 8 && p.custody !== 'held'; i++) {
      p.x = r.me.x + Math.sin(r.me.heading) * 1.2;
      p.z = r.me.z + Math.cos(r.me.heading) * 1.2;
      ctx.people.rebuildIndex();
      press(r);
      if ((p.custody as string) !== 'held') t.step(2.1);
    }
    press(r);
    press(r);
    moveTo(r, at.x, at.z, at.h);
    expect(press(r).verb).toBe('remettre');
    expect(p.vehicleId).toBe(v.id);
    t.step(1);
    const records = ctx.require<LawRecords>(LAW_RECORDS_SERVICE);
    const transferApi = ctx.require<TransferApi>(TRANSFER_SERVICE);
    expect(custodyLine(records.interpellations, transferApi.vans)).toMatch(/^Interpellés 1 · CELLULAIRE \d [01]\/8 · 0 au commissariat$/);
    // la fiche du fourgon sur la carte de commandement : « Partir au commissariat »
    const env = cardEnvFromCore(core);
    const u = env.units.find((q) => q.squadId === s.id)!;
    expect(u.cellular).toBe(true);
    const card = buildCard({ kind: 'unite', key: `unite:${s.id}`, x: u.x, z: u.z, name: s.name, squadId: s.id }, env, null);
    const line = card.lines.find((l) => l.label === 'Partir au commissariat')!;
    expect(line, card.lines.map((l) => l.label).join(' | ')).toBeDefined();
    expect(line.explain).toMatch(new RegExp(`^${s.name} · 1/8`));
    const sendEnv = { core, card: env, setSelection: () => {}, map: null, trace: null } as unknown as SendEnv;
    const res = sendCardLine(sendEnv, line, null, { kind: 'unite', key: `unite:${s.id}`, x: u.x, z: u.z, name: s.name, squadId: s.id });
    console.log(`fiche : ${res.ok ? 'envoyé' : 'refusé'} « ${res.text} »`);
    expect(res.ok).toBe(true);
    expect(res.text).toMatch(new RegExp(`^${s.name} part (au|à la) `));
    t.step(2);
    expect(transferApi.view(s.id)!.stage).toBe('aller');
  }, 600000);
});

describe('carte « Ma mission » du chef de la BRAV-M (journée de service)', () => {
  it('« Montez sur votre moto (E) — la BRAV-M part avec vous », puis « Votre moto vous attend » et sa distance, repère sur sa moto', async () => {
    const base = SERVICE_BASES[3]!;
    const MEANS = { sections: 1, fourgons: 3, centaure: 0, canon_eau: 0, bravm: 1, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: true };
    const t = createTestContext({ seed: 11, strict: false, modules: SIM });
    await t.start({
      mode: 'libre', role: 'bravm', rank: 'brigadier_chef', place: 'Place de la Concorde', x: -10, z: 15, crowdSize: 120, tension: 0.2, volatility: 0.2, duration: 'standard',
      extra: { moyens: MEANS, journee: true, base: { x: base.x, z: base.z, name: base.name }, poste: 'chef_groupe', baseBravm: { x: base.x, z: base.z, name: base.name } },
    } as never);
    const ctx = t.ctx;
    const me = ctx.player.person()!;
    const moto = ctx.vehicles.get(me.vehicleId)!;
    expect(moto.kind).toBe('moto_bravm');
    const j = ctx.require<JourneeApi>(JOURNEE_SERVICE);
    ctx.vehicles.exit(me);
    t.step(2);
    let b = brief(ctx);
    expect(b.instruction.title).toBe('Montez sur votre moto (E) — la BRAV-M part avec vous');
    expect(b.instruction.lead).toBe(true);
    let h = orderHeadline(b, false, me);
    expect(h.head).toBe('MA MISSION');
    expect(h.order).toBe('Montez sur votre moto (E) — la BRAV-M part avec vous');
    expect(Math.hypot(b.instruction.x! - moto.x, b.instruction.z! - moto.z)).toBeLessThan(3);
    // il s'éloigne et ne remonte pas : la BRAV-M part, sa moto l'attend
    me.x += 6;
    ctx.people.rebuildIndex();
    for (let i = 0; i < 60 && !/^Votre moto vous attend/.test(brief(ctx).instruction.title); i++) t.step(1);
    b = brief(ctx);
    console.log(`journée ${j.stage} ; carte « ${b.instruction.title} » / « ${b.instruction.detail} »`);
    expect(b.instruction.title).toBe('Votre moto vous attend');
    h = orderHeadline(b, false, me);
    expect(h.order).toBe('Votre moto vous attend');
    expect(h.distance).toMatch(new RegExp(`^\\d+${NB}m$`));
    const o = objective(ctx);
    // (le repère de la journée est déjà sur la moto : la carte n'en pose pas un second)
    expect(o === null || Math.hypot(o.x - moto.x, o.z - moto.z) < 3).toBe(true);
  }, 900000);
});
