// Recette jouée des missions lancées depuis la nouvelle page d'accueil (« Missions spéciales ») : pour chaque poste,
// les deux premières missions de sa liste sont choisies sur leur fiche comme le fait le joueur (pickMission puis
// buildSessionConfig, catalogue résolu sur la carte comme le service 'missions'), lancées avec les vrais modules —
// journée de service comprise : départ de la caserne, trajet en colonne conduit par l'IA, mission à l'arrivée — puis
// jouées par un robot qui fait la chose évidente (descendre du véhicule une fois arrivé, aller au point de l'objectif
// en cours ou de la carte « Ma mission », soigner la victime suivante, prononcer les sommations s'il en a la charge).
// On relève : exception, système désactivé, joueur perdu, mission jamais commencée, foule différente de la fiche,
// objectif sans point valable, texte cassé, compte rendu manquant ou faux.
//
// PLAYTEST_ONLY=id1,id2 : ces missions seulement ; PLAYTEST_ALL=1 : toutes celles de la liste ; PLAYTEST_SECONDS : durée
// de jeu après le début de la mission.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, ModuleFactory, Person, SessionConfig } from '@/core/contracts';
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
import { createSystems as missions, missionById, missionConfig } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';
import { MISSION_SERVICE } from '@/gameplay/session';
import type { MissionBrief } from '@/gameplay/session';
import { MISSIONS } from '@/gameplay/missions/catalog';
import { createObjectives } from '@/ui/core/objectives';
import { pickMission } from '@/ui/screens/home-panes-a';
import type { HomeModel } from '@/ui/screens/home';
import { missionsByPoste } from '@/ui/screens/home-missions';
import { buildSessionConfig, defaultDraft, sanitizeDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { readMissions } from '@/ui/screens/services';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session, missions, objectives];

const SECONDS = Number(process.env.PLAYTEST_SECONDS ?? 300);
/** Attente maximale du début de la mission (trajet en colonne depuis la caserne compris ; filet TRAVEL_MAX = 900 s de
 * missions/system.ts), en secondes de jeu. */
const ARRIVAL = 1000;
const BAD_TEXT = /undefined|NaN|\{|\}|\bnull\b|\[object/;
const NO_POINT = ['zero_bavure', 'limiter_blesses', 'limiter_degats', 'proteger_site', 'survivre', 'sommations_regulieres', 'personnalise', 'prevention'];

/** Catalogue de l'accueil (forme du service 'missions' : config résolue sur la carte). */
function homeCatalog(ctx: GameContext | null): ReturnType<typeof readMissions> {
  return readMissions({
    catalog: MISSIONS.map((m) => ({
      id: m.id, title: m.title, roles: [m.role, ...m.altRoles], type: m.type, difficulty: m.difficulty, summary: m.pitch, place: m.place,
      config: missionConfig(m, ctx ? ctx.world : null),
    })),
  });
}

/** Les deux premières missions de chaque poste de la liste « Missions spéciales ». */
const FIRST_TWO = missionsByPoste(homeCatalog(null)).flatMap((g) => g.missions.slice(0, 2).map((m) => ({ poste: g.id, id: m.id })));
/**
 * Échantillon joué par défaut (rapide, sans grande foule) ; PLAYTEST_ALL=1 : les deux premières missions de chaque poste
 * (une vingtaine de minutes). Relevé du balayage complet : les postes au volant (BRAV-M chef de bord, Centaure) et les
 * longues colonnes (quatorze fourgons du chef de groupe) ne sont pas joués par ce robot, qui ne conduit pas.
 */
const SAMPLE = ['ecole-01-tenir-la-ligne', 'canon-01-dix-mille-litres', 'drone-01-arrete-prefectoral', 'pompier-02-feu-de-facade'];
const ONLY = process.env.PLAYTEST_ONLY ? process.env.PLAYTEST_ONLY.split(',') : process.env.PLAYTEST_ALL ? null : SAMPLE;

/** Ce que fait la fiche « Lancer la mission » (home.ts launchMission, Missions spéciales = Mode libre). */
function launchFromSheet(ctx: GameContext, id: string): SessionConfig {
  const draft: ScenarioDraft = defaultDraft();
  const model = {
    draft,
    update(patch: Partial<ScenarioDraft>) { Object.assign(draft, sanitizeDraft({ ...draft, ...patch }, draft)); },
    replace(next: ScenarioDraft) { Object.assign(draft, sanitizeDraft(next, draft)); },
  } as unknown as HomeModel;
  pickMission(model, homeCatalog(ctx).find((m) => m.id === id)!);
  return buildSessionConfig(draft);
}

/** Avance le joueur à pied de `dist` mètres vers (x, z) le long d'un itinéraire piéton ; false si aucun chemin. */
function walk(ctx: GameContext, me: Person, x: number, z: number, dist: number, path: number[]): boolean {
  if (me.vehicleId !== 0) return true;
  if (Math.hypot(x - me.x, z - me.z) < 2) return true;
  path.length = 0;
  if (!ctx.world.findPath(me.x, me.z, x, z, 'foot', path) || path.length < 4) return false;
  let left = dist;
  for (let i = 2; i < path.length && left > 0; i += 2) {
    const dx = path[i]! - me.x, dz = path[i + 1]! - me.z;
    const l = Math.hypot(dx, dz);
    if (l <= left) { me.x = path[i]!; me.z = path[i + 1]!; left -= l; }
    else { me.x += (dx / l) * left; me.z += (dz / l) * left; left = 0; }
  }
  return true;
}

interface Row { id: string; state: string; notes: string[] }

async function play(id: string): Promise<Row> {
  const def = missionById(id)!;
  const row: Row = { id, state: '?', notes: [] };
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.ready;
  const { ctx } = t;
  const cfg = launchFromSheet(ctx, id);
  await t.start(cfg);
  const m = ctx.service<MissionsApi>('missions')!;
  const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
  const brief = ctx.service<MissionBrief>(MISSION_SERVICE)!;
  // trajet depuis la caserne : la mission commence à l'arrivée. Le robot fait ce que demande l'objectif de la journée
  // (« Embarquez : … ») : il marche jusqu'au véhicule désigné et y monte ; à bord, il laisse conduire l'IA.
  const path: number[] = [];
  let waited = 0;
  while (m.phaseIndex < 0 && !m.result && waited < ARRIVAL) {
    t.step(1);
    waited++;
    const me = ctx.player.person();
    const j = obj.list.find((o) => o.state === 'actif' && /^Embarquez/.test(o.text) && o.x !== undefined && o.z !== undefined);
    if (!me || me.vehicleId !== 0 || !j) continue;
    walk(ctx, me, j.x!, j.z!, 4, path);
    const v = ctx.vehicles.list.reduce<{ v: (typeof ctx.vehicles.list)[number] | null; d: number }>((b, x) => {
      const d = Math.hypot(x.x - j.x!, x.z - j.z!);
      return d < b.d ? { v: x, d } : b;
    }, { v: null, d: 6 }).v;
    // comme la touche « monter » (place de passager) : le volant reste au conducteur de l'IA
    if (v && Math.hypot(v.x - me.x, v.z - me.z) < 6) ctx.vehicles.enter(me, v, 'passenger');
  }
  if (process.env.PLAYTEST_DEBUG) ctx.events.on('order:issued', (e) => { const me = ctx.player.person(); if (me && e.squadId === me.squadId) console.log(`  t=${ctx.clock.now.toFixed(0)} ordre au groupe du joueur : ${e.order.type} (${e.order.x?.toFixed(0)}, ${e.order.z?.toFixed(0)}) par ${e.order.issuedBy}`); });
  if (process.env.PLAYTEST_DEBUG) console.log(`config : lieu ${cfg.place} (${cfg.x}, ${cfg.z}) ; journée ${String((cfg.extra as Record<string, unknown>).journee)} ; mission commencée après ${waited} s ; joueur (${ctx.player.person()?.x.toFixed(0)}, ${ctx.player.person()?.z.toFixed(0)})`);
  if (m.phaseIndex < 0) row.notes.push(`mission jamais commencée après ${waited} s (joueur ${ctx.player.person() ? `à ${Math.round(Math.hypot(ctx.player.person()!.x - (cfg.x ?? 0), ctx.player.person()!.z - (cfg.z ?? 0)))} m du lieu` : 'absent'})`);
  // foule : celle de la fiche (aucune quand la fiche n'en a pas)
  const demonstrators = ctx.people.list.filter((p) => p.kind === 'manifestant').length;
  if (def.crowd.size <= 0 && demonstrators > 0 && def.objectives.every((o) => o.kind !== 'soigner')) row.notes.push(`foule : ${demonstrators} manifestants pour une mission sans foule`);
  const allTexts: string[] = [];
  let sommations = 0;
  let stuck = '';
  const t0 = ctx.clock.now;
  for (let s = 0; s < SECONDS && m.phaseIndex >= 0; s += 1) {
    t.step(1);
    const me = ctx.player.person();
    if (!me) { row.notes.push(`t=${s} : pas de joueur`); break; }
    if (m.result) break;
    const active = obj.list.filter((o) => o.state === 'actif');
    if (active.length === 0) stuck = `t=${s} : aucun objectif en cours`;
    for (const o of active) {
      allTexts.push(o.text);
      if (o.x !== undefined && o.z !== undefined && (!Number.isFinite(o.x) || !Number.isFinite(o.z))) row.notes.push(`objectif ${o.id} : point non fini`);
    }
    if (brief.active) allTexts.push(brief.instruction.title);
    // robot : la consigne de la carte (exécutant) ou le premier objectif principal avec un point
    let tx: number | undefined, tz: number | undefined;
    if (brief.active && brief.instruction.x !== undefined) { tx = brief.instruction.x; tz = brief.instruction.z; }
    else {
      const run = m.objectives.find((r) => r.state === 'actif' && !r.def.secondary && r.at);
      if (run && run.at) { tx = run.at.x; tz = run.at.z; }
    }
    const care = m.objectives.find((r) => r.state === 'actif' && r.victims && r.victims.length > 0);
    const patient = care ? care.victims!.map((v) => ctx.people.get(v)).find((v) => v && v.injury !== 'none' && v.health < 100) : undefined;
    if (patient) {
      tx = patient.x + 0.8;
      tz = patient.z;
      if (me.vehicleId !== 0 && !ctx.interactions.current(me)) ctx.vehicles.exit(me);
      if (Math.hypot(patient.x - me.x, patient.z - me.z) < 1.5 && !ctx.interactions.current(me)) ctx.interactions.startVerb(me, 'soigner', patient.id);
    }
    if (tx !== undefined && tz !== undefined) {
      if (!walk(ctx, me, tx, tz, 4, path) && s % 30 === 0) row.notes.push(`t=${s} : pas d'itinéraire piéton vers (${tx.toFixed(0)}, ${tz.toFixed(0)})`);
    }
    if (process.env.PLAYTEST_DEBUG && s % 20 === 0) {
      const run = m.objectives.find((r) => r.state === 'actif' && !r.def.secondary && r.at);
      console.log(`t=${s} phase ${m.phaseIndex + 1} joueur (${me.x.toFixed(0)}, ${me.z.toFixed(0)}) véh ${me.vehicleId} ; carte ${brief.active ? `« ${brief.instruction.title} » (${brief.instruction.x?.toFixed(0)}, ${brief.instruction.z?.toFixed(0)})` : '-'} ; objectif ${run ? `${run.def.id} (${run.at!.x.toFixed(0)}, ${run.at!.z.toFixed(0)})` : '-'}`);
    }
    if (def.objectives.some((o) => o.kind === 'sommations_regulieres' && !o.secondary) && s > 30 && s % 25 === 0 && sommations < 3) {
      ctx.law.sommation(me);
      sommations++;
    }
  }
  if (!m.result && m.phaseIndex >= 0) {
    const act = m.objectives.filter((r) => r.state === 'actif' && !r.def.secondary && !NO_POINT.includes(r.def.kind));
    const me = ctx.player.person();
    const dist = (r: typeof act[number]): string => (r.at && me ? ` à ${Math.round(Math.hypot(r.at.x - me.x, r.at.z - me.z))} m` : '');
    row.state = `en cours phase ${m.phaseIndex + 1}/${def.phases.length} ; ${act.map((r) => `${r.def.id}:${r.def.kind} ${Math.round(r.progress * 100)}%${dist(r)}`).join(', ')}`;
  }
  if (!m.result) m.finish();
  t.step(1);
  const r = m.result;
  if (r) {
    if (row.state === '?') row.state = (r.success ? 'réussie' : 'terminée (non réussie)') + ` en ${Math.round(ctx.clock.now - t0)} s de mission, ${r.grade} : ${r.summary}`;
    if (!r.success) for (const o of m.objectives) if (!o.def.secondary && o.state !== 'reussi') row.notes.push(`manqué ${o.def.id}:${o.def.kind} — ${o.note}`);
    if (!Number.isFinite(r.score)) row.notes.push('score NaN');
    for (const l of r.lines) if (BAD_TEXT.test(`${l.label} ${l.value} ${l.note ?? ''}`)) row.notes.push(`ligne : ${l.label} ${l.value} ${l.note}`);
    if (BAD_TEXT.test(r.summary)) row.notes.push(`résumé : ${r.summary}`);
  } else row.notes.push('aucun compte rendu');
  if (stuck) row.notes.push(stuck);
  for (const x of new Set(allTexts)) if (BAD_TEXT.test(x)) row.notes.push(`texte : ${x}`);
  const perf = ctx.service<{ systems: readonly { id: string; disabled: boolean }[] }>('perf');
  for (const x of perf?.systems.filter((y) => y.disabled) ?? []) row.notes.push(`système désactivé : ${x.id}`);
  return row;
}

describe('recette jouée : les deux premières missions de chaque poste, lancées depuis l’accueil', () => {
  it('la liste couvre chaque poste', () => {
    console.log(FIRST_TWO.map((x) => `${x.poste} : ${x.id}`).join('\n'));
    expect(new Set(FIRST_TWO.map((x) => x.poste)).size).toBeGreaterThanOrEqual(10);
  });
  for (const { poste, id } of FIRST_TWO) {
    if (ONLY && !ONLY.includes(id)) continue;
    it(`${poste} — ${id}`, async () => {
      const t0 = Date.now();
      let row: Row;
      try { row = await play(id); } catch (e) { row = { id, state: 'ERREUR', notes: [String((e as Error).stack ?? e).slice(0, 600)] }; }
      console.log(`${row.id} → ${row.state} (${((Date.now() - t0) / 1000).toFixed(0)} s)${row.notes.length ? '\n    ' + row.notes.join('\n    ') : ''}`);
      const defects = row.state === 'ERREUR' ? [row.notes[0]!] : row.notes.filter((n) => /pas de joueur|jamais commencée|^foule|point non fini|score NaN|^ligne|^résumé|aucun compte rendu|^texte|système désactivé/.test(n));
      expect(defects).toEqual([]);
    }, 1_800_000);
  }
});
